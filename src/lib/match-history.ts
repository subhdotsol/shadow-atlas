import { DELEGATION_PROGRAM_ID } from "@magicblock-labs/ephemeral-rollups-sdk";
import { PublicKey, type Connection } from "@solana/web3.js";
import bs58 from "bs58";
import idl from "@/idl/shadow_atlas.json";
import { PROGRAM_ID } from "./config";
import type { Side } from "./game";
import { baseConnection, getProgram, isRoomCode, roomCodeOf, type MatchAccount } from "./program";

/**
 * Matches this player key created or joined, so the home page can list them.
 *
 * Two sources, because neither is complete on its own:
 * - a record in localStorage, written when this browser creates or joins a match; it covers
 *   matches that are live on the private rollup, whose accounts are owned by the delegation
 *   program on Solana and so don't show up in a lookup by our program;
 * - a lookup on Solana for match accounts owned by our program (lobbies and settled
 *   matches) where this key is the creator or player B.
 */
type Entry = { address: string; side: Side; at: number };
const keyFor = (player: PublicKey) => `shadow-atlas:matches:${player.toBase58()}`;

function read(player: PublicKey): Entry[] {
  try {
    const raw = localStorage.getItem(keyFor(player));
    return raw ? (JSON.parse(raw) as Entry[]) : [];
  } catch {
    return [];
  }
}

function write(player: PublicKey, entries: Entry[]) {
  try {
    localStorage.setItem(keyFor(player), JSON.stringify(entries));
  } catch {
    // Storage blocked: the on-chain lookup still finds lobbies and settled matches.
  }
}

export function rememberMatch(player: PublicKey, match: PublicKey, side: Side) {
  const entries = read(player);
  if (entries.some((e) => e.address === match.toBase58())) return;
  write(player, [{ address: match.toBase58(), side, at: Date.now() }, ...entries].slice(0, 50));
}

export function forgetMatch(player: PublicKey, address: string) {
  write(
    player,
    read(player).filter((e) => e.address !== address),
  );
}

const MATCH_DISCRIMINATOR = bs58.encode(Uint8Array.from(idl.accounts.find((a) => a.name === "Match")!.discriminator));
// Match layout: discriminator (8) · creator (32) · code (6) · player_a (32) · player_b: Option<Pubkey> (1 + 32)
const CREATOR_OFFSET = 8;
const PLAYER_B_OFFSET = 78;

// getProgramAccounts is expensive and the public devnet RPC rate-limits it, so the on-chain
// lookup runs at most once a minute per player; refreshes in between reuse the result.
const DISCOVER_EVERY_MS = 60_000;
const DISCOVER_TIMEOUT_MS = 5_000;
const discovered = new Map<string, { at: number; entries: Promise<Entry[]> }>();

function discover(player: PublicKey): Promise<Entry[]> {
  const cached = discovered.get(player.toBase58());
  if (cached && Date.now() - cached.at < DISCOVER_EVERY_MS) return cached.entries;
  const entries = lookup(player);
  discovered.set(player.toBase58(), { at: Date.now(), entries });
  return entries;
}

/** Our program's match accounts on Solana where `player` is the creator or player B. */
async function lookup(player: PublicKey): Promise<Entry[]> {
  const conn = baseConnection();
  const byCreator = conn.getProgramAccounts(PROGRAM_ID, {
    dataSlice: { offset: 0, length: 0 },
    filters: [{ memcmp: { offset: 0, bytes: MATCH_DISCRIMINATOR } }, { memcmp: { offset: CREATOR_OFFSET, bytes: player.toBase58() } }],
  });
  const asPlayerB = conn.getProgramAccounts(PROGRAM_ID, {
    dataSlice: { offset: 0, length: 0 },
    filters: [
      { memcmp: { offset: 0, bytes: MATCH_DISCRIMINATOR } },
      // Option tag 1 (Some) followed by the key.
      { memcmp: { offset: PLAYER_B_OFFSET, bytes: bs58.encode(Uint8Array.from([1, ...player.toBytes()])) } },
    ],
  });
  const [a, b] = await Promise.all([byCreator.catch(() => []), asPlayerB.catch(() => [])]);
  return [
    ...a.map((x) => ({ address: x.pubkey.toBase58(), side: "A" as const, at: 0 })),
    ...b.map((x) => ({ address: x.pubkey.toBase58(), side: "B" as const, at: 0 })),
  ];
}

function decodeMatch(data: Buffer): MatchAccount | null {
  try {
    const m = getProgram(baseConnection()).coder.accounts.decode<MatchAccount>("match", data);
    return isRoomCode(roomCodeOf(m)) ? m : null;
  } catch {
    return null;
  }
}

export type MatchSummary = {
  address: string;
  side: Side;
  at: number;
  where: "base" | "rollup";
  /** Null while the match is on the rollup and this browser has no rollup session yet. */
  match: MatchAccount | null;
};

/** Every known match for `player`, with live state. Forgets matches that no longer exist. */
export async function loadMatches(player: PublicKey, tee: Connection | null): Promise<MatchSummary[]> {
  // The on-chain lookup can be slow when the public RPC is rate-limiting (it retries with
  // backoff), so cap the wait: matches recorded in this browser show immediately.
  const found = await Promise.race([discover(player), new Promise<Entry[]>((r) => setTimeout(() => r([]), DISCOVER_TIMEOUT_MS))]);
  const known = new Map<string, Entry>();
  for (const e of [...read(player), ...found]) if (!known.has(e.address)) known.set(e.address, e);
  const entries = [...known.values()];
  if (entries.length === 0) return [];

  const keys = entries.map((e) => new PublicKey(e.address));
  const infos = await baseConnection().getMultipleAccountsInfo(keys, "confirmed");

  const delegated = entries.filter((_, i) => infos[i]?.owner.equals(DELEGATION_PROGRAM_ID));
  const live = tee && delegated.length ? await getProgram(tee).account.match.fetchMultiple(delegated.map((e) => new PublicKey(e.address))).catch(() => []) : [];
  const liveByAddress = new Map(delegated.map((e, i) => [e.address, (live[i] as MatchAccount | null) ?? null]));

  const out: MatchSummary[] = [];
  entries.forEach((entry, i) => {
    const info = infos[i];
    if (!info) {
      // Closed (a cancelled lobby): drop it from the record.
      forgetMatch(player, entry.address);
      return;
    }
    if (info.owner.equals(PROGRAM_ID)) {
      const match = decodeMatch(info.data);
      // Accounts from an older program layout don't decode; leave them out.
      if (match) out.push({ ...entry, where: "base", match });
    } else if (info.owner.equals(DELEGATION_PROGRAM_ID)) {
      out.push({ ...entry, where: "rollup", match: liveByAddress.get(entry.address) ?? null });
    }
  });
  return out;
}
