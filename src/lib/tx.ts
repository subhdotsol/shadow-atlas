import type { AnchorWallet } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionSignature,
} from "@solana/web3.js";
import {
  DELEGATION_PROGRAM_ID,
  EPHEMERAL_VAULT_ID,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
  PERMISSION_PROGRAM_ID,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  delegationMetadataPdaFromDelegatedAccount,
  delegationRecordPdaFromDelegatedAccount,
  permissionPdaFromAccount,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { WalletError } from "@solana/wallet-adapter-base";
import idl from "@/idl/shadow_atlas.json";
import { DELEGATE_COMPUTE_LIMIT, PROGRAM_ID, TEE_VALIDATOR } from "./config";
import { ConfirmTimeoutError, waitForSignature } from "./confirm";
import { FundingError, WALLET_DEVNET_HELP } from "./funding";
import type { Action } from "./game";
import { baseConnection, getProgram, matchPda, movePda, newRoomCode, type MatchAccount } from "./program";

// ---------- errors ----------

const PROGRAM_ERRORS = new Map(idl.errors.map((e) => [e.name, e]));
const PROGRAM_ERRORS_BY_CODE = new Map(idl.errors.map((e) => [e.code, e]));

/** Friendlier copy for the errors a player can actually hit. */
const COPY: Record<string, string> = {
  NotWaitingForPlayer: "This match already has two players.",
  MatchFull: "This match already has two players.",
  TurnNotOpen: "The turn isn't accepting orders right now.",
  StaleTurn: "That turn has already moved on. Refresh and try again.",
  AlreadyCommitted: "You've already sealed an order this turn.",
  MissingCommit: "Both orders must be sealed first.",
  CommitSameSlot: "The rollup hasn't advanced a slot yet. Try again in a moment.",
  TurnNotTimedOut: "The opponent still has time to move.",
  OpponentCommitted: "Your opponent has moved; seal your order instead.",
  BothCommitted: "Both orders are in. Resolve the turn instead.",
  NotAPlayer: "Only the two players can do that.",
};

export class GameTxError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly logs?: string[],
  ) {
    super(message);
  }
}

/** True when the user closed the wallet prompt. Not an error worth showing. */
export function isUserRejection(e: unknown) {
  const inner = e instanceof WalletError ? (e.error as { message?: string } | undefined)?.message : "";
  const text = `${(e as { message?: string })?.message ?? e} ${inner ?? ""}`.toLowerCase();
  return /user rejected|rejected the request|user denied|user cancel|declined/.test(text);
}

/** Readable text for anything thrown: Errors, plain objects (some RPC errors), or strings. */
function errorText(e: unknown): string {
  const message = (e as { message?: unknown })?.message;
  if (typeof message === "string") return message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/**
 * The program error name behind any failure, whatever shape it arrives in: a GameTxError from
 * confirmation, a send-time rejection ("custom program error: 0x1778"), logs ("Error Code: X"),
 * or a raw status (`{"Custom":6008}`). Undefined if it isn't a program error.
 */
export function programErrorOf(e: unknown): string | undefined {
  if (e instanceof GameTxError && e.code) return e.code;
  const logs = (e as { logs?: unknown })?.logs;
  const text = `${errorText(e)} ${Array.isArray(logs) ? logs.join(" ") : ""}`;
  const named = text.match(/Error Code: (\w+)/)?.[1];
  if (named && PROGRAM_ERRORS.has(named)) return named;
  const custom = text.match(/"Custom":(\d+)/)?.[1];
  if (custom) return PROGRAM_ERRORS_BY_CODE.get(Number(custom))?.name;
  const hex = text.match(/custom program error: (0x[0-9a-f]+)/i)?.[1];
  if (hex) return PROGRAM_ERRORS_BY_CODE.get(parseInt(hex, 16))?.name;
  return undefined;
}

export function describeError(e: unknown): string {
  if (e instanceof GameTxError || e instanceof FundingError || e instanceof ConfirmTimeoutError) return e.message;
  // Wallets report network mismatches and failed simulations as a bare "Unexpected error".
  if (e instanceof WalletError) return `Your wallet refused the request. ${WALLET_DEVNET_HELP}`;
  const text = errorText(e);
  const named = text.match(/Error Code: (\w+)/)?.[1];
  if (named) return COPY[named] ?? PROGRAM_ERRORS.get(named)?.msg ?? named;
  const custom = text.match(/"Custom":(\d+)/)?.[1];
  if (custom) {
    const err = PROGRAM_ERRORS_BY_CODE.get(Number(custom));
    if (err) return COPY[err.name] ?? err.msg;
  }
  const hex = text.match(/custom program error: (0x[0-9a-f]+)/i)?.[1];
  if (hex) {
    const err = PROGRAM_ERRORS_BY_CODE.get(parseInt(hex, 16));
    if (err) return COPY[err.name] ?? err.msg;
  }
  if (/insufficient (funds|lamports)/i.test(text)) return "Not enough devnet SOL in this wallet.";
  if (/blockhash not found|block height exceeded/i.test(text)) return "The network was slow to confirm. Try again.";
  if (/failed to fetch|network/i.test(text)) return "Couldn't reach the network. Check your connection and retry.";
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

// ---------- sending ----------

/** Program error name from a transaction error like `{"InstructionError":[0,{"Custom":6008}]}`. */
function programErrorName(err: unknown): string | undefined {
  const code = JSON.stringify(err ?? null).match(/"Custom":(\d+)/)?.[1];
  return code ? PROGRAM_ERRORS_BY_CODE.get(Number(code))?.name : undefined;
}

async function confirm(connection: Connection, signature: TransactionSignature, blockhash: { blockhash: string; lastValidBlockHeight: number }) {
  const res = { value: await waitForSignature(connection, signature, blockhash.lastValidBlockHeight) };
  if (res.value.err) {
    // The private rollup redacts logs, so fall back to the error code in the status.
    const tx = await connection
      .getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 })
      .catch(() => null);
    const logs = tx?.meta?.logMessages ?? [];
    const named = logs.join("\n").match(/Error Code: (\w+)/)?.[1] ?? programErrorName(res.value.err);
    throw new GameTxError(describeError(named ? `Error Code: ${named}` : JSON.stringify(res.value.err)), named, logs);
  }
}

async function prepare(connection: Connection, wallet: AnchorWallet, tx: Transaction) {
  const blockhash = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = blockhash.blockhash;
  return blockhash;
}

/** Sign one transaction and send it, waiting for confirmation. */
export async function send(connection: Connection, wallet: AnchorWallet, tx: Transaction) {
  const blockhash = await prepare(connection, wallet, tx);
  const signed = await wallet.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
  await confirm(connection, signature, blockhash);
  return signature;
}

// ---------- game actions ----------

/** A fresh room code whose match address is still free (codes are global). */
async function freeRoomCode() {
  for (let i = 0; i < 5; i++) {
    const code = newRoomCode();
    if (!(await baseConnection().getAccountInfo(matchPda(code), "confirmed"))) return code;
  }
  throw new Error("Couldn't find a free room code. Try again.");
}

/** Base layer. Opens a lobby under a new room code. */
export async function createMatch(wallet: AnchorWallet, roomCode?: string) {
  const program = getProgram(baseConnection(), wallet);
  const code = roomCode ?? (await freeRoomCode());
  const match = matchPda(code);
  const tx = await program.methods
    .createMatch([...Buffer.from(code, "ascii")])
    .accountsPartial({
      creator: wallet.publicKey,
      matchAccount: match,
      moveA: movePda(match, wallet.publicKey),
      systemProgram: SystemProgram.programId,
    })
    .transaction();
  const signature = await send(baseConnection(), wallet, tx);
  return { match, code, signature };
}

/** Base layer. Creator closes a match nobody joined. */
export async function cancelMatch(wallet: AnchorWallet, match: PublicKey) {
  const program = getProgram(baseConnection(), wallet);
  const tx = await program.methods
    .cancelMatch()
    .accountsPartial({ creator: wallet.publicKey, matchAccount: match, moveA: movePda(match, wallet.publicKey) })
    .transaction();
  return send(baseConnection(), wallet, tx);
}

function delegateAccounts(pda: PublicKey) {
  return {
    buffer: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(pda, PROGRAM_ID),
    record: delegationRecordPdaFromDelegatedAccount(pda),
    metadata: delegationMetadataPdaFromDelegatedAccount(pda),
  };
}

async function delegateIx(wallet: AnchorWallet, match: PublicKey, m: { playerA: PublicKey; playerB: PublicKey }) {
  const program = getProgram(baseConnection(), wallet);
  const moveA = movePda(match, m.playerA);
  const moveB = movePda(match, m.playerB);
  const [dm, da, db] = [match, moveA, moveB].map(delegateAccounts);
  return program.methods
    .delegateMatch()
    .accountsPartial({
      payer: wallet.publicKey,
      matchAccount: match,
      moveA,
      moveB,
      validator: TEE_VALIDATOR,
      bufferMatchAccount: dm.buffer,
      delegationRecordMatchAccount: dm.record,
      delegationMetadataMatchAccount: dm.metadata,
      bufferMoveA: da.buffer,
      delegationRecordMoveA: da.record,
      delegationMetadataMoveA: da.metadata,
      bufferMoveB: db.buffer,
      delegationRecordMoveB: db.record,
      delegationMetadataMoveB: db.metadata,
      ownerProgram: PROGRAM_ID,
      delegationProgram: DELEGATION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/** Base layer. Join and hand the match to the private rollup in one transaction. */
export async function joinAndDelegate(wallet: AnchorWallet, match: PublicKey, playerA: PublicKey) {
  const program = getProgram(baseConnection(), wallet);
  const join = await program.methods
    .joinMatch()
    .accountsPartial({
      player: wallet.publicKey,
      matchAccount: match,
      moveB: movePda(match, wallet.publicKey),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  const delegate = await delegateIx(wallet, match, { playerA, playerB: wallet.publicKey });
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: DELEGATE_COMPUTE_LIMIT }), join, delegate);
  return send(baseConnection(), wallet, tx);
}

/** Base layer. Recovery path if a joined match was never delegated. */
export async function delegateMatch(wallet: AnchorWallet, match: PublicKey, m: MatchAccount) {
  const ix = await delegateIx(wallet, match, { playerA: m.playerA, playerB: m.playerB! });
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: DELEGATE_COMPUTE_LIMIT }), ix);
  return send(baseConnection(), wallet, tx);
}

function turnAccounts(match: PublicKey, m: MatchAccount) {
  return { matchAccount: match, moveA: movePda(match, m.playerA), moveB: movePda(match, m.playerB!) };
}

/** Private ER. Creates the three permissions and opens turn 1. */
export async function initPermissions(tee: Connection, wallet: AnchorWallet, match: PublicKey, m: MatchAccount) {
  const program = getProgram(tee, wallet);
  const accounts = turnAccounts(match, m);
  const tx = await program.methods
    .initPermissions()
    .accountsPartial({
      payer: wallet.publicKey,
      ...accounts,
      permissionMatch: permissionPdaFromAccount(match),
      permissionA: permissionPdaFromAccount(accounts.moveA),
      permissionB: permissionPdaFromAccount(accounts.moveB),
      permissionProgram: PERMISSION_PROGRAM_ID,
      ephemeralVault: EPHEMERAL_VAULT_ID,
      magicProgram: MAGIC_PROGRAM_ID,
    })
    .transaction();
  return send(tee, wallet, tx);
}

async function announceTx(tee: Connection, wallet: AnchorWallet, match: PublicKey, m: MatchAccount) {
  return getProgram(tee, wallet)
    .methods.announceCommit()
    .accountsPartial({ player: wallet.publicKey, ...turnAccounts(match, m) })
    .transaction();
}

/**
 * Private ER. Seal an order, then announce it.
 *
 * Both transactions are signed in one wallet prompt but always sent separately:
 * the submit carries the plaintext move and references only the player's private
 * account; the announce carries no move data. The announce is only sent once the
 * rollup has moved past the submit's slot (the program requires it).
 */
export async function sealOrder(
  tee: Connection,
  wallet: AnchorWallet,
  match: PublicKey,
  m: MatchAccount,
  action: Action,
  onSealed?: () => void,
) {
  const program = getProgram(tee, wallet);
  const submit = await program.methods
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anchor's enum arg typing
    .submitSecretMove(m.turn, action as any)
    .accountsPartial({ player: wallet.publicKey, playerMove: movePda(match, wallet.publicKey) })
    .transaction();
  const announce = await announceTx(tee, wallet, match, m);

  const blockhash = await tee.getLatestBlockhash("confirmed");
  for (const tx of [submit, announce]) {
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = blockhash.blockhash;
  }
  const [signedSubmit, signedAnnounce] = await wallet.signAllTransactions([submit, announce]);

  const submitSig = await tee.sendRawTransaction(signedSubmit.serialize(), { skipPreflight: true });
  await confirm(tee, submitSig, blockhash);
  onSealed?.();

  const status = await tee.getSignatureStatuses([submitSig]);
  const committedSlot = status.value[0]?.slot ?? 0;
  for (let i = 0; i < 50 && (await tee.getSlot("confirmed")) <= committedSlot; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  let announceSig: string | undefined;
  try {
    announceSig = await tee.sendRawTransaction(signedAnnounce.serialize(), { skipPreflight: true });
    await confirm(tee, announceSig, blockhash);
  } catch (e) {
    // If the opponent's announce resolved the turn between our submit and our announce, the
    // announce lands on a turn that has already moved on (or a finished match). The order was
    // committed and applied, so there is nothing to report. The rollup may reject it at send
    // time or at confirmation, so match on the program error in either shape.
    const code = programErrorOf(e);
    if (code && ANNOUNCE_RACE_ERRORS.has(code)) return { submitSig, announceSig };
    throw e;
  }
  return { submitSig, announceSig };
}

const ANNOUNCE_RACE_ERRORS = new Set(["MissingCommit", "TurnNotOpen", "StaleTurn"]);

/** Private ER. Re-announce if the automatic announce didn't land. */
export async function announce(tee: Connection, wallet: AnchorWallet, match: PublicKey, m: MatchAccount) {
  return send(tee, wallet, await announceTx(tee, wallet, match, m));
}

/** Private ER. Permissionless fallback to resolve a turn with both orders in. */
export async function resolveTurn(tee: Connection, wallet: AnchorWallet, match: PublicKey, m: MatchAccount) {
  const tx = await getProgram(tee, wallet)
    .methods.resolveTurn()
    .accountsPartial({ payer: wallet.publicKey, ...turnAccounts(match, m) })
    .transaction();
  return send(tee, wallet, tx);
}

/** Private ER. End a turn the opponent has stalled. */
export async function claimTimeout(tee: Connection, wallet: AnchorWallet, match: PublicKey, m: MatchAccount) {
  const tx = await getProgram(tee, wallet)
    .methods.claimTimeout()
    .accountsPartial({ player: wallet.publicKey, ...turnAccounts(match, m) })
    .transaction();
  return send(tee, wallet, tx);
}

/** Private ER. Commit the finished match back to Solana. */
export async function settleMatch(tee: Connection, wallet: AnchorWallet, match: PublicKey, m: MatchAccount) {
  const tx = await getProgram(tee, wallet)
    .methods.settleMatch()
    .accountsPartial({
      payer: wallet.publicKey,
      ...turnAccounts(match, m),
      magicContext: MAGIC_CONTEXT_ID,
      magicProgram: MAGIC_PROGRAM_ID,
    })
    .transaction();
  return send(tee, wallet, tx);
}
