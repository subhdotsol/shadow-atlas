"use client";

import { BN } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { INITIAL_BOARD, resolve, type Action, type Board, type Side } from "@/lib/game";
import { matchPda, type MatchAccount, type PlayerMoveAccount } from "@/lib/program";
import type { MatchState } from "@/hooks/use-match";
import { MatchScreenPreview } from "./match-view";
import { focus } from "./ui";

/**
 * Development only (/dev/screens): each game screen rendered from a fixed, hand-built match
 * state, so the whole flow can be checked in a browser without sending a transaction.
 * Buttons that would transact have no rollup session here, so they do nothing.
 */
type Ready = Extract<MatchState, { kind: "ready" }>;

const CODE = "K7Q2XM";
const address = matchPda(CODE);
const ember = Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey;
const tide = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey;
const now = () => Math.floor(Date.now() / 1000);

const attackME: Action = { attack: { from: 5, target: 2, troops: 4 } };
const tideHold: Action = { reinforce: { from: 3, to: 7, troops: 1 } };
const turn1A: Action = { reinforce: { from: 6, to: 5, troops: 2 } };
const turn1B: Action = { reinforce: { from: 3, to: 7, troops: 1 } };
const afterTurn1 = resolve(INITIAL_BOARD, turn1A, turn1B);
const afterTurn2 = resolve(afterTurn1, attackME, tideHold);

function match(over: Partial<Record<keyof MatchAccount, unknown>>): MatchAccount {
  return {
    creator: ember,
    code: [...Buffer.from(CODE, "ascii")],
    playerA: ember,
    playerB: tide,
    status: { turnOpen: {} },
    turn: 1,
    board: INITIAL_BOARD,
    turnStartedAt: new BN(now()),
    aCommitted: false,
    bCommitted: false,
    lastTurn: null,
    outcome: null,
    createdAt: new BN(now() - 600),
    bump: 255,
    ...over,
  } as unknown as MatchAccount;
}

const myMove = (turn: number, action: Action): PlayerMoveAccount => ({ turn, action }) as unknown as PlayerMoveAccount;

const SCENARIOS: Record<string, { label: string; side: Side | null; state: Ready }> = {
  "lobby-waiting": {
    label: "Lobby, waiting",
    side: "A",
    state: { kind: "ready", where: "base", match: match({ playerB: null, status: { waitingForPlayer: {} }, turn: 0, board: { owner: Array(8).fill(0), strength: Array(8).fill(0) } }), myMove: null, before: null },
  },
  "lobby-join": {
    label: "Lobby, visitor",
    side: null,
    state: { kind: "ready", where: "base", match: match({ playerB: null, status: { waitingForPlayer: {} }, turn: 0 }), myMove: null, before: null },
  },
  "lobby-ready": {
    label: "Lobby, start",
    side: "B",
    state: { kind: "ready", where: "base", match: match({ status: { ready: {} }, turn: 0 }), myMove: null, before: null },
  },
  turn: {
    label: "Your turn",
    side: "A",
    state: { kind: "ready", where: "rollup", match: match({ turn: 2, board: afterTurn1, lastTurn: { turn: 1, actionA: turn1A, actionB: turn1B } }), myMove: null, before: null },
  },
  committed: {
    label: "Committed",
    side: "A",
    state: {
      kind: "ready",
      where: "rollup",
      match: match({ turn: 2, board: afterTurn1, aCommitted: true, lastTurn: { turn: 1, actionA: turn1A, actionB: turn1B } }),
      myMove: myMove(2, attackME),
      before: null,
    },
  },
  revealing: {
    label: "Revealing",
    side: "A",
    state: {
      kind: "ready",
      where: "rollup",
      match: match({ turn: 2, board: afterTurn1, aCommitted: true, bCommitted: true, lastTurn: { turn: 1, actionA: turn1A, actionB: turn1B } }),
      myMove: myMove(2, attackME),
      before: null,
    },
  },
  result: {
    label: "Turn result",
    side: "B",
    state: {
      kind: "ready",
      where: "rollup",
      match: match({ turn: 2, board: afterTurn1, lastTurn: { turn: 1, actionA: turn1A, actionB: turn1B } }),
      myMove: null,
      before: { turn: 1, board: INITIAL_BOARD },
    },
  },
  victory: {
    label: "Victory",
    side: "A",
    state: {
      kind: "ready",
      where: "base",
      match: match({ status: { finished: {} }, turn: 2, board: afterTurn2, outcome: { playerA: {} }, lastTurn: { turn: 2, actionA: attackME, actionB: tideHold } }),
      myMove: null,
      before: { turn: 2, board: afterTurn1 },
    },
  },
  defeat: {
    label: "Defeat",
    side: "B",
    state: {
      kind: "ready",
      where: "base",
      match: match({ status: { finished: {} }, turn: 2, board: afterTurn2, outcome: { playerA: {} }, lastTurn: { turn: 2, actionA: attackME, actionB: tideHold } }),
      myMove: null,
      before: { turn: 2, board: afterTurn1 },
    },
  },
  spectator: {
    label: "Spectator",
    side: null,
    state: { kind: "ready", where: "rollup", match: match({ turn: 2, board: afterTurn1 as Board, aCommitted: true, lastTurn: { turn: 1, actionA: turn1A, actionB: turn1B } }), myMove: null, before: null },
  },
};

export function ScreenPreview() {
  const key = useSearchParams().get("s") ?? "turn";
  const scenario = SCENARIOS[key] ?? SCENARIOS.turn;
  // Client only: the fixed states use the current time, which differs between server and client.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6">
      <nav aria-label="Screens" className="mb-6 flex flex-wrap gap-2">
        {Object.entries(SCENARIOS).map(([id, s]) => (
          <Link
            key={id}
            href={`/dev/screens?s=${id}`}
            aria-current={id === key ? "page" : undefined}
            className={`inline-flex h-9 items-center rounded-xl px-3 font-mono text-xs ${focus} ${id === key ? "btn-graphite" : "btn-paper"}`}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      <MatchScreenPreview key={key} address={address} state={scenario.state} mySide={scenario.side} />
    </div>
  );
}
