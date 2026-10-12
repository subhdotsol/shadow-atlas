import { AnchorProvider, Program, type IdlAccounts } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import idl from "@/idl/shadow_atlas.json";
import type { ShadowAtlas } from "@/idl/shadow_atlas";
import { BASE_RPC, BASE_RPCS, PROGRAM_ID } from "./config";

export type MatchAccount = IdlAccounts<ShadowAtlas>["match"];
export type PlayerMoveAccount = IdlAccounts<ShadowAtlas>["playerMove"];
export type MatchStatus = "waitingForPlayer" | "ready" | "turnOpen" | "finished";
export type Outcome = "playerA" | "playerB" | "draw";

/** Read-only wallet for fetching accounts; never signs. */
const readonlyWallet: AnchorWallet = {
  publicKey: PublicKey.default,
  signTransaction: async <T extends Transaction | VersionedTransaction>(): Promise<T> => {
    throw new Error("read-only");
  },
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(): Promise<T[]> => {
    throw new Error("read-only");
  },
};

export function getProgram(connection: Connection, wallet?: AnchorWallet) {
  const provider = new AnchorProvider(connection, wallet ?? readonlyWallet, {
    commitment: "confirmed",
    skipPreflight: true,
  });
  return new Program<ShadowAtlas>(idl as ShadowAtlas, provider);
}

/**
 * fetch for the base-layer Connection: send each JSON-RPC request to the first devnet
 * endpoint, and on a 429, a 5xx or a network failure retry it on the next one. web3.js's own
 * rate-limit retry is off, since it would keep hammering the endpoint that refused.
 */
async function fallbackFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let last: Response | null = null;
  let error: unknown = null;
  for (const [i, endpoint] of BASE_RPCS.entries()) {
    const url = i === 0 ? input : endpoint;
    try {
      const res = await fetch(url, init);
      if (res.status !== 429 && res.status < 500) return res;
      last = res;
    } catch (e) {
      error = e;
    }
  }
  if (last) return last;
  throw error;
}

let base: Connection | null = null;
export function baseConnection() {
  base ??= new Connection(BASE_RPC, { commitment: "confirmed", fetch: fallbackFetch as typeof fetch, disableRetryOnRateLimit: true });
  return base;
}

// ---------- PDAs ----------

// ---------- room codes ----------

/** Room code alphabet (`is_room_code_char` in constants.rs): A–Z and 2–9 without I, O, 0, 1. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LEN = 6;

export function isRoomCode(value: string) {
  return value.length === ROOM_CODE_LEN && [...value].every((c) => ROOM_CODE_ALPHABET.includes(c));
}

/** Normalises what a player typed: case, spaces and dashes don't matter. */
export function normalizeRoomCode(value: string) {
  return value.toUpperCase().replace(/[\s-]/g, "");
}

/** A random room code; the alphabet has 32 letters so a byte maps without bias. */
export function newRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LEN));
  return [...bytes].map((b) => ROOM_CODE_ALPHABET[b % 32]).join("");
}

export function roomCodeOf(m: Pick<MatchAccount, "code">) {
  return String.fromCharCode(...m.code);
}

/** Every match lives at a PDA derived from its room code alone. */
export function matchPda(code: string) {
  return PublicKey.findProgramAddressSync([Buffer.from("match"), Buffer.from(code, "ascii")], PROGRAM_ID)[0];
}

export function movePda(match: PublicKey, player: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("move"), match.toBuffer(), player.toBuffer()], PROGRAM_ID)[0];
}

// ---------- decoding helpers ----------

export function statusOf(m: MatchAccount): MatchStatus {
  return Object.keys(m.status)[0] as MatchStatus;
}

export function outcomeOf(m: MatchAccount): Outcome | null {
  return m.outcome ? (Object.keys(m.outcome)[0] as Outcome) : null;
}

/**
 * Accepts a room code, a match address, or a full match link to either. Returns the match
 * address, and the code when one was given.
 */
export function parseMatchRef(value: string): { address: PublicKey; code: string | null } | null {
  const raw = value.trim().split("/match/").pop()?.split(/[?#/]/)[0] ?? "";
  const code = normalizeRoomCode(raw);
  if (isRoomCode(code)) return { address: matchPda(code), code };
  try {
    const key = new PublicKey(raw);
    return key.toBase58() === raw ? { address: key, code: null } : null;
  } catch {
    return null;
  }
}

export function shortAddress(key: PublicKey | string, chars = 4) {
  const s = typeof key === "string" ? key : key.toBase58();
  return s.length <= chars * 2 + 3 ? s : `${s.slice(0, chars)}…${s.slice(-chars)}`;
}
