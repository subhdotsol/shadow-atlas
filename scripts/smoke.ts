/**
 * Devnet smoke test for the frontend's transaction layer.
 *
 *   bun smoke
 *
 * Plays a full match on Solana devnet + MagicBlock's TEE using exactly the functions the
 * UI buttons call (src/lib/tx.ts) and the same reads the match screen does. Player A is
 * your Solana CLI wallet; player B is a fresh keypair funded with 0.05 devnet SOL.
 * Exits non-zero on any failed check. Override the wallet path with WALLET.
 */
import { Wallet } from "@coral-xyz/anchor";
import { getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { PROGRAM_ID, TEE_RPC, TEE_WS } from "../src/lib/config";
import { attackTargets, maxTroops, ownerTag, reinforceTargets, validate, type Action, type Board, type Side } from "../src/lib/game";
import { baseConnection, getProgram, movePda, outcomeOf, statusOf } from "../src/lib/program";
import { createMatch, initPermissions, joinAndDelegate, sealOrder, settleMatch } from "../src/lib/tx";

let failures = 0;
function check(ok: boolean, label: string) {
  console.log(`${ok ? "  ✅" : "  ❌"} ${label}`);
  if (!ok) failures++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function session(kp: Keypair) {
  const { token } = await getAuthToken(TEE_RPC, kp.publicKey, async (m) => nacl.sign.detached(m, kp.secretKey));
  return new Connection(`${TEE_RPC}?token=${token}`, { wsEndpoint: `${TEE_WS}?token=${token}`, commitment: "confirmed" });
}

async function waitFor(label: string, fn: () => Promise<boolean>, ms = 90_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await fn().catch(() => false)) return;
    await sleep(1000);
  }
  throw new Error(`timed out: ${label}`);
}

const mineOf = (board: Board, side: Side) => [...Array(8).keys()].filter((t) => board.owner[t] === ownerTag(side));

/** Ember's bot: attack with everything when that wins, else move the biggest spare stack forward. */
function botOrder(board: Board): Action {
  for (const from of mineOf(board, "A")) {
    const troops = maxTroops(board, from);
    for (const t of attackTargets(board, "A", from)) if (troops > board.strength[t]) return { attack: { from, target: t, troops } };
  }
  return passiveOrder(board, "A");
}

/** Tide's bot: shuffle one troop between its own territories (else a 1-troop attack). */
function passiveOrder(board: Board, side: Side): Action {
  const from = mineOf(board, side)
    .filter((t) => maxTroops(board, t) > 0)
    .sort((x, y) => board.strength[y] - board.strength[x])[0];
  const to = reinforceTargets(board, side, from)[0];
  return to !== undefined ? { reinforce: { from, to, troops: 1 } } : { attack: { from, target: attackTargets(board, side, from)[0], troops: 1 } };
}

const keyPath = process.env.WALLET ?? `${homedir()}/.config/solana/id.json`;
const alice = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyPath, "utf8"))));
const bob = Keypair.generate();
const [wa, wb] = [new Wallet(alice), new Wallet(bob)];
console.log(`Program ${PROGRAM_ID.toBase58()}\nA ${alice.publicKey.toBase58()}\nB ${bob.publicKey.toBase58()}\n`);

await sendAndConfirmTransaction(
  baseConnection(),
  new Transaction().add(SystemProgram.transfer({ fromPubkey: alice.publicKey, toPubkey: bob.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })),
  [alice],
);

console.log("Lobby (Solana)");
const { match, code } = await createMatch(wa);
let m = await getProgram(baseConnection()).account.match.fetch(match);
check(statusOf(m) === "waitingForPlayer", `createMatch → waiting in room ${code} (${match.toBase58()})`);
await joinAndDelegate(wb, match, alice.publicKey);
check((await baseConnection().getAccountInfo(match))?.owner.toBase58() === "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh", "joinAndDelegate → delegated");

console.log("Private rollup");
const [teeA, teeB] = await Promise.all([session(alice), session(bob)]);
await waitFor("match on rollup", async () => (await getProgram(teeA).account.match.fetchNullable(match)) !== null);
m = await getProgram(teeA).account.match.fetch(match);
await initPermissions(teeA, wa, match, m);
m = await getProgram(teeA).account.match.fetch(match);
check(statusOf(m) === "turnOpen" && m.turn === 1, "initPermissions → turn 1 open");

console.log("Turn 1 (privacy)");
const a1 = botOrder(m.board as Board);
check(validate(m.board as Board, "A", a1) === null, `bot order is legal: ${JSON.stringify(a1)}`);
await sealOrder(teeA, wa, match, m, a1);
const mineA = await getProgram(teeA).account.playerMove.fetchNullable(movePda(match, alice.publicKey));
check(JSON.stringify(mineA?.action) === JSON.stringify(a1), "A reads back its own sealed order");
const peek = await getProgram(teeB).account.playerMove.fetchNullable(movePda(match, alice.publicKey)).catch(() => null);
check(peek === null, "B cannot read A's sealed order");
m = await getProgram(teeB).account.match.fetch(match);
check(m.aCommitted && m.lastTurn === null, "match shows 'A sealed' and nothing else");

await sealOrder(teeB, wb, match, m, passiveOrder(m.board as Board, "B"));
m = await getProgram(teeA).account.match.fetch(match);
check(m.turn === 2 && JSON.stringify(m.lastTurn?.actionA) === JSON.stringify(a1), "B's seal resolved turn 1 and revealed A's order");

console.log("Playing to the end");
while (statusOf(m) === "turnOpen") {
  const turn = m.turn;
  await sealOrder(teeA, wa, match, m, botOrder(m.board as Board));
  m = await getProgram(teeB).account.match.fetch(match);
  await sealOrder(teeB, wb, match, m, passiveOrder(m.board as Board, "B"));
  m = await getProgram(teeA).account.match.fetch(match);
  console.log(`  turn ${turn}: ${m.board.owner.join("")}`);
  if (turn > 25) throw new Error("match did not finish");
}
check(statusOf(m) === "finished", `finished: ${outcomeOf(m)}`);

console.log("Settle");
await settleMatch(teeA, wa, match, m);
await waitFor("undelegation", async () => (await baseConnection().getAccountInfo(match))?.owner.equals(PROGRAM_ID) ?? false, 120_000);
m = await getProgram(baseConnection()).account.match.fetch(match);
check(statusOf(m) === "finished", "settled result readable on Solana");

console.log(`\nOpen it in the app: http://localhost:3000/match/${code}`);
console.log(failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
