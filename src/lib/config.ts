import { PublicKey } from "@solana/web3.js";
import idl from "@/idl/shadow_atlas.json";

/** Program address comes from the synced IDL, so it can never drift from the contract. */
export const PROGRAM_ID = new PublicKey(idl.address);

/**
 * Solana devnet RPCs, tried in order. MagicBlock's devnet RPC is first: the public
 * api.devnet.solana.com rate-limits (HTTP 429) a browser app quickly. A request that gets a
 * 429, a 5xx or a network error moves on to the next endpoint.
 */
export const BASE_RPCS = (process.env.NEXT_PUBLIC_BASE_RPC ?? "https://rpc.magicblock.app/devnet,https://api.devnet.solana.com")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);
export const BASE_RPC = BASE_RPCS[0];

export const TEE_RPC = (process.env.NEXT_PUBLIC_TEE_RPC ?? "https://devnet-tee.magicblock.app").replace(/\/$/, "");
export const TEE_WS = (process.env.NEXT_PUBLIC_TEE_WS ?? "wss://devnet-tee.magicblock.app").replace(/\/$/, "");

/** The only validator the program accepts for delegation (`TEE_VALIDATOR` in constants.rs). */
export const TEE_VALIDATOR = new PublicKey("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");

/** delegate_match costs up to ~210k CU depending on PDA bumps; the default limit is 200k. */
export const DELEGATE_COMPUTE_LIMIT = 400_000;

// Game constants, mirrored from programs/shadow-atlas/src/constants.rs.
/** Each turn's clock (constants.rs TURN_SECS): when it runs out the turn resolves, and a player who hasn't committed holds. */
export const TURN_SECS = 30;
/** Backstop when nobody resolves a turn at all (constants.rs TURN_TIMEOUT_SECS). */
export const TURN_TIMEOUT_SECS = 120;
export const MAX_TURNS = 20;
export const WIN_TERRITORIES = 5;

export const CLUSTER = "devnet";

export function explorerUrl(kind: "address" | "tx", value: string) {
  return `https://explorer.solana.com/${kind}/${value}?cluster=${CLUSTER}`;
}
