"use client";

import { DELEGATION_PROGRAM_ID } from "@magicblock-labs/ephemeral-rollups-sdk";
import type { Connection, PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { PROGRAM_ID } from "@/lib/config";
import type { Board } from "@/lib/game";
import { baseConnection, getProgram, isRoomCode, movePda, roomCodeOf, type MatchAccount, type PlayerMoveAccount } from "@/lib/program";

/**
 * Where the match currently lives:
 * - "base": owned by the program on Solana (lobby, or settled after the game)
 * - "rollup": delegated to the private rollup (setup and play)
 */
export type MatchState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "needs-session" }
  | {
      kind: "ready";
      where: "base" | "rollup";
      match: MatchAccount;
      myMove: PlayerMoveAccount | null;
      /** The board at the start of the last resolved turn, if this page saw it (for turn results). */
      before: { turn: number; board: Board } | null;
    };

/**
 * Keep the pre-resolution board: when a new reveal appears, the previous match holds the
 * board it was played on. Keyed on the reveal rather than the turn number, because the
 * final turn ends the match without advancing the turn.
 */
function withBefore(prev: MatchState, match: MatchAccount) {
  if (prev.kind !== "ready") return null;
  const revealed = match.lastTurn?.turn ?? null;
  if (revealed !== null && revealed !== (prev.match.lastTurn?.turn ?? null)) return { turn: revealed, board: prev.match.board as Board };
  return prev.before;
}

/** Matches created by an earlier program version have a different layout and can't be shown. */
const OLD_LAYOUT = "This match was created by an earlier version of Shadow Atlas and can't be opened. Start a new one from the home page.";
const isCurrentLayout = (m: MatchAccount) => isRoomCode(roomCodeOf(m));

const POLL_ROLLUP_MS = 1500;
const POLL_BASE_MS = 4000;
/** While a match is live on the rollup, re-check Solana only this often (public RPCs rate-limit). */
const BASE_RECHECK_MS = 30_000;

export function useMatch(address: PublicKey, me: PublicKey | null, tee: Connection | null) {
  const [state, setState] = useState<MatchState>({ kind: "loading" });
  const [tick, setTick] = useState(0);
  const failures = useRef(0);
  // Last place the match was found, and when Solana was last asked.
  const onRollup = useRef(false);
  const baseCheckedAt = useRef(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** Read the live match from the rollup. Null if the rollup no longer has it (e.g. settled). */
    async function loadFromRollup(conn: Connection): Promise<number | null> {
      const program = getProgram(conn);
      const match = await program.account.match.fetchNullable(address);
      if (!match) return null;
      if (!isCurrentLayout(match)) {
        setState({ kind: "error", message: OLD_LAYOUT });
        return POLL_BASE_MS;
      }
      const isPlayer = me && (match.playerA.equals(me) || match.playerB?.equals(me));
      // A player can read only their own move account; the opponent's is hidden by the TEE.
      const myMove = me && isPlayer ? await program.account.playerMove.fetchNullable(movePda(address, me)).catch(() => null) : null;
      setState((prev) => ({ kind: "ready", where: "rollup", match, myMove, before: withBefore(prev, match) }));
      return POLL_ROLLUP_MS;
    }

    async function load(): Promise<number> {
      // Known to be live on the rollup: poll the rollup only, and Solana occasionally.
      if (onRollup.current && tee && Date.now() - baseCheckedAt.current < BASE_RECHECK_MS) {
        const delay = await loadFromRollup(tee);
        if (delay !== null) return delay;
      }

      baseCheckedAt.current = Date.now();
      const info = await baseConnection().getAccountInfo(address, "confirmed");
      onRollup.current = Boolean(info?.owner.equals(DELEGATION_PROGRAM_ID));
      if (!info) {
        setState({ kind: "missing" });
        return POLL_BASE_MS;
      }

      if (info.owner.equals(PROGRAM_ID)) {
        let match: MatchAccount | null = null;
        try {
          match = getProgram(baseConnection()).coder.accounts.decode<MatchAccount>("match", info.data);
        } catch {
          // Falls through to the old-layout message.
        }
        if (!match || !isCurrentLayout(match)) {
          setState({ kind: "error", message: OLD_LAYOUT });
          return POLL_BASE_MS;
        }
        setState((prev) => ({ kind: "ready", where: "base", match, myMove: null, before: withBefore(prev, match) }));
        return POLL_BASE_MS;
      }

      if (!info.owner.equals(DELEGATION_PROGRAM_ID)) {
        setState({ kind: "error", message: "That address isn't a Shadow Atlas match." });
        return POLL_BASE_MS;
      }

      if (!tee) {
        setState({ kind: "needs-session" });
        return POLL_BASE_MS;
      }
      const delay = await loadFromRollup(tee);
      if (delay === null) {
        // Delegated on Solana but not yet cloned into the rollup: ask Solana again next time.
        baseCheckedAt.current = 0;
        setState((s) => (s.kind === "ready" ? s : { kind: "loading" }));
        return POLL_ROLLUP_MS;
      }
      return delay;
    }

    async function loop() {
      let delay = POLL_BASE_MS;
      try {
        delay = await load();
        failures.current = 0;
      } catch (e) {
        failures.current += 1;
        // Keep showing the last good state through transient RPC hiccups.
        if (failures.current >= 3) {
          setState({ kind: "error", message: String((e as Error)?.message ?? e) });
        }
        delay = Math.min(POLL_BASE_MS * failures.current, 15_000);
      }
      if (!cancelled) timer = setTimeout(loop, delay);
    }

    loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [address, me, tee, tick]);

  return { state, refresh };
}
