"use client";

import type { PublicKey } from "@solana/web3.js";
import {
  ArrowLeft,
  Check,
  CircleCheck,
  CircleHelp,
  Circle,
  Clock,
  Copy,
  Eye,
  Info,
  Link2,
  LoaderCircle,
  Lock,
  Maximize2,
  Minimize2,
  Minus,
  Play,
  Plus,
  RotateCw,
  ShieldPlus,
  Swords,
  Trophy,
  TriangleAlert,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, use, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { MAX_TURNS, TURN_SECS, TURN_TIMEOUT_SECS, WIN_TERRITORIES } from "@/lib/config";
import { MIN_PLAY_LAMPORTS } from "@/lib/funding";
import {
  actionFrom,
  actionKind,
  actionRoute,
  actionTo,
  actionTroops,
  attackTargets,
  count,
  maxTroops,
  neighbours,
  OWNER_A,
  OWNER_B,
  opponentOf,
  ownerTag,
  reinforceTargets,
  resolveMoves,
  TERRITORIES,
  TROOPS_PER_TURN,
  turnRows,
  turnSummary,
  orderOf,
  type Action,
  type Order,
  type Board,
  type Side,
} from "@/lib/game";
import { rememberMatch } from "@/lib/match-history";
import { outcomeOf, roomCodeOf, shortAddress, statusOf, type MatchAccount, type PlayerMoveAccount } from "@/lib/program";
import {
  announce,
  cancelMatch,
  claimTimeout,
  createMatch,
  delegateMatch,
  describeError,
  initPermissions,
  isUserRejection,
  joinAndDelegate,
  programErrorOf,
  resolveTurn,
  sealOrder,
  settleMatch,
} from "@/lib/tx";
import { useMatch, type MatchState } from "@/hooks/use-match";
import { debugError, debugLog, describeUnknown } from "@/lib/debug-log";
import { usePlayerKey } from "./player-key";
import { PlayerPanel } from "./player-panel";
import { useTeeSession } from "./tee-session";
import { Address, Button, Card, FACTION, FactionDot, KeyTile, Skeleton, focus } from "./ui";
import { MAP_ASPECT, WorldMap } from "./world-map";

type Ready = Extract<MatchState, { kind: "ready" }>;

/** Run one game action at a time, with progress and error copy. */
function useAction(onDone: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(label: string, fn: () => Promise<unknown>, opts: { quiet?: (e: unknown) => boolean } = {}) {
    setBusy(label);
    setError(null);
    debugLog("action", `${label}: started`);
    try {
      await fn();
      debugLog("action", `${label}: done`);
    } catch (e) {
      debugError("action", `${label} failed`, e, { programError: programErrorOf(e), shown: describeError(e) });
      if (!isUserRejection(e) && !opts.quiet?.(e)) setError(describeError(e));
    } finally {
      setBusy(null);
      onDone();
    }
  }
  return { busy, error, clearError: () => setError(null), run };
}
type ActionRunner = ReturnType<typeof useAction>;

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the code is still visible to copy by hand.
    }
  }
  return { copied, copy };
}

function sideOf(m: MatchAccount, me: PublicKey | null | undefined): Side | null {
  if (!me) return null;
  if (m.playerA.equals(me)) return "A";
  if (m.playerB?.equals(me)) return "B";
  return null;
}

const inviteLink = (code: string) => `${window.location.origin}/match/${code}`;

const youPill = <span className="ml-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-normal text-muted">You</span>;

// ---------------------------------------------------------------------------------------
// Shell: back link, room, turn, status badge, action banner, and the screen for the phase.
// ---------------------------------------------------------------------------------------

export function MatchView({ address }: { address: PublicKey }) {
  const wallet = usePlayerKey().wallet;
  const tee = useTeeSession();
  const { state, refresh } = useMatch(address, wallet?.publicKey ?? null, tee.connection);
  const action = useAction(refresh);
  const ready = state.kind === "ready" ? state : null;
  // Full screen belongs to the page root, which stays mounted through every phase and refresh,
  // so committing a move or a turn resolving never drops you out of it.
  const root = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(root);

  return (
    <div
      ref={root}
      className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 [&:fullscreen]:max-w-none [&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-background [&:fullscreen]:py-4"
    >
      <FullscreenContext value={fullscreen}>
      {!fullscreen.active && <MatchHeader address={address} state={ready} />}

      {/* A floating status line: it never pushes the board around. */}
      {(action.busy || action.error) && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-start justify-between gap-3 rounded-2xl border bg-surface px-4 py-3 text-sm shadow-float ${
            action.error ? "border-danger/30 text-danger" : "border-border"
          }`}
        >
          <span className="flex items-center gap-2">
            {action.error ? <TriangleAlert className="size-4 shrink-0" aria-hidden /> : <RotateCw className="size-4 shrink-0 animate-spin" aria-hidden />}
            {action.error ?? `${action.busy}…`}
          </span>
          {action.error && (
            <button
              type="button"
              onClick={action.clearError}
              aria-label="Dismiss error"
              className={`-m-2 inline-flex size-10 items-center justify-center rounded-lg hover:bg-danger/10 ${focus}`}
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      )}

      {state.kind === "loading" && <LoadingLayout />}
      {state.kind === "missing" && (
        <EmptyState title="No match with this room code" body="Check the code with your opponent. A lobby cancelled before anyone joined no longer exists." />
      )}
      {state.kind === "error" && (
        <Card>
          <p className="mb-4 text-sm text-danger">{state.message}</p>
          <Button variant="secondary" onClick={refresh}>
            <RotateCw className="size-4" aria-hidden /> Retry
          </Button>
        </Card>
      )}
      {state.kind === "needs-session" && <SessionGate />}
      {ready && <Phase address={address} state={ready} action={action} />}
      </FullscreenContext>
    </div>
  );
}

type Fullscreen = { active: boolean; supported: boolean; toggle: () => void };
const FullscreenContext = createContext<Fullscreen>({ active: false, supported: false, toggle: () => {} });

function statusBadge(m: MatchAccount, mySide: Side | null): { label: string; tone: "accent" | "amber" | "muted" | "good" | "bad" } {
  const status = statusOf(m);
  if (status === "waitingForPlayer") return { label: mySide === "A" ? "Waiting for opponent" : "Open lobby", tone: "amber" };
  if (status === "ready") return { label: "Ready to start", tone: "amber" };
  if (status === "turnOpen") {
    if (m.aCommitted && m.bCommitted) return { label: "Revealing moves", tone: "muted" };
    if (!mySide) return { label: "Turn in progress", tone: "muted" };
    const mine = mySide === "A" ? m.aCommitted : m.bCommitted;
    return mine ? { label: "Waiting for opponent", tone: "amber" } : { label: "Your turn", tone: "accent" };
  }
  const outcome = outcomeOf(m);
  if (outcome === "draw") return { label: "Draw", tone: "muted" };
  const winner: Side = outcome === "playerA" ? "A" : "B";
  if (!mySide) return { label: `${FACTION[winner]} wins`, tone: "muted" };
  return winner === mySide ? { label: "Victory", tone: "good" } : { label: "Defeat", tone: "bad" };
}

const badgeClass = {
  accent: "btn-tide",
  amber: "border border-devnet/40 bg-surface text-devnet",
  muted: "border border-border bg-surface text-muted",
  good: "border border-success/40 bg-surface text-success",
  bad: "border border-danger/40 bg-surface text-danger",
} as const;

function MatchHeader({ address, state }: { address: PublicKey; state: Ready | null }) {
  const me = usePlayerKey().wallet?.publicKey;
  const { copied, copy } = useCopy();
  const m = state?.match;
  const mySide = m ? sideOf(m, me) : null;
  const badge = m ? statusBadge(m, mySide) : null;
  const playing = m && (statusOf(m) === "turnOpen" || statusOf(m) === "finished");
  const code = m ? roomCodeOf(m) : null;

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/" className={`-ml-2 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover:text-foreground ${focus}`}>
          <ArrowLeft className="size-4" aria-hidden /> Back
        </Link>
        <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
        <button
          type="button"
          onClick={() => copy(code ?? address.toBase58())}
          title={address.toBase58()}
          aria-label={`Room ${code ?? address.toBase58()}. Copy`}
          className={`inline-flex h-10 items-center gap-2 rounded-lg px-1 text-sm ${focus}`}
        >
          <span className="text-muted">Room</span>
          <span className="font-mono font-medium tracking-[0.12em]">{code ?? shortAddress(address)}</span>
          {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5 text-muted" aria-hidden />}
        </button>
        {playing && m && (
          <>
            <span className="h-5 w-px bg-border" aria-hidden />
            <span className="font-mono text-sm tabular-nums">
              Turn {Math.min(m.turn, MAX_TURNS)} of {MAX_TURNS}
            </span>
          </>
        )}
      </div>
      {badge && <span className={`rounded-xl px-3 py-1.5 text-sm font-medium ${badgeClass[badge.tone]}`}>{badge.label}</span>}
    </div>
  );
}

function Phase({ address, state, action }: { address: PublicKey; state: Ready; action: ActionRunner }) {
  const me = usePlayerKey().wallet?.publicKey;
  const m = state.match;
  const mySide = sideOf(m, me);

  // Keep this match in the home page's "Your matches" list.
  useEffect(() => {
    if (me && mySide) rememberMatch(me, address, mySide);
  }, [me, mySide, address]);

  return <Screen address={address} state={state} mySide={mySide} action={action} />;
}

/**
 * Development only: one game screen for a fixed match state, seen as `mySide`. Used by the
 * screen preview page to check every phase in a browser without sending transactions.
 */
export function MatchScreenPreview({ address, state, mySide }: { address: PublicKey; state: Ready; mySide: Side | null }) {
  const action = useAction(() => {});
  const root = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(root);
  return (
    <div ref={root} className="[&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-background [&:fullscreen]:p-4">
      <FullscreenContext value={fullscreen}>
        <Screen address={address} state={state} mySide={mySide} action={action} />
      </FullscreenContext>
    </div>
  );
}

function Screen({ address, state, mySide, action }: { address: PublicKey; state: Ready; mySide: Side | null; action: ActionRunner }) {
  const m = state.match;
  const status = statusOf(m);
  if (status === "waitingForPlayer" || status === "ready") {
    return <LobbyScreen address={address} where={state.where} m={m} mySide={mySide} action={action} />;
  }
  if (status === "finished") {
    return <GameOverScreen address={address} state={state} mySide={mySide} action={action} />;
  }
  if (mySide && state.where === "rollup") {
    return <PlayScreen key={m.turn} address={address} state={state} mySide={mySide} action={action} />;
  }
  return <SpectatorScreen m={m} before={state.before} />;
}

// ---------------------------------------------------------------------------------------
// Lobby: room code, both wallets, status, Start Game.
// ---------------------------------------------------------------------------------------

function RoomCode({ code }: { code: string }) {
  const room = useCopy();
  const link = useCopy();
  return (
    <div className="w-full rounded-2xl border border-border bg-surface-2/40 p-4 sm:w-80">
      <p className="text-xs text-muted">Room ID</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="font-mono text-3xl font-semibold tracking-[0.18em]" data-room-code={code}>
          {code}
        </span>
        <button
          type="button"
          onClick={() => room.copy(code)}
          aria-label="Copy room code"
          className={`btn-paper inline-flex size-10 items-center justify-center rounded-xl ${focus}`}
        >
          {room.copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        </button>
      </div>
      <Button className="mt-3 w-full" variant="tide" onClick={() => link.copy(inviteLink(code))}>
        {link.copied ? <Check className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
        {link.copied ? "Link copied" : "Copy invite link"}
      </Button>
    </div>
  );
}

function PlayerSlot({ side, player, isMe, children }: { side: Side; player: PublicKey | null; isMe: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-card">
      <KeyTile tone={player ? (side === "A" ? "ember" : "tide") : "neutral"} className="size-12 shrink-0 text-lg">
        {side === "A" ? "E" : "T"}
      </KeyTile>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {side === "A" ? "Player 1" : "Player 2"} · {FACTION[side]} {isMe && youPill}
        </p>
        {player ? (
          <div className="-ml-2">
            <Address value={player.toBase58()} label={`${FACTION[side]} wallet`} />
          </div>
        ) : (
          <p className="text-xs text-muted">Open seat</p>
        )}
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

const readyPill = (
  <span className="inline-flex items-center gap-1 rounded-lg border border-success/40 px-2 py-0.5 text-xs font-medium text-success">
    <Check className="size-3" aria-hidden /> Ready
  </span>
);

function Step({ done, active, children }: { done: boolean; active: boolean; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      {done ? (
        <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
      ) : active ? (
        <LoaderCircle className="size-4 shrink-0 animate-spin text-muted" aria-hidden />
      ) : (
        <Circle className="size-4 shrink-0 text-faint" aria-hidden />
      )}
      <span className={done ? "" : "text-muted"}>{children}</span>
    </li>
  );
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function LobbyScreen({
  address,
  where,
  m,
  mySide,
  action,
}: {
  address: PublicKey;
  where: "base" | "rollup";
  m: MatchAccount;
  mySide: Side | null;
  action: ActionRunner;
}) {
  const { wallet, balance } = usePlayerKey();
  const tee = useTeeSession();
  const status = statusOf(m);
  const waiting = status === "waitingForPlayer";
  const code = roomCodeOf(m);
  const starting = action.busy === "Starting the game";

  /**
   * Start Game: move the match to the private rollup if joining didn't already, then create
   * the permissions that keep each player's moves readable only by that player. Either
   * player can press it; if the other already did, the turn is simply open.
   */
  async function start() {
    if (!wallet) return;
    if (where === "base") {
      await delegateMatch(wallet, address, m);
      // The rollup picks the accounts up within a moment of delegation.
      await pause(2_000);
    }
    const conn = tee.connection;
    if (!conn) throw new Error("Still connecting to the private rollup. Try again in a moment.");
    for (let attempt = 0; ; attempt++) {
      try {
        return await initPermissions(conn, wallet, address, m);
      } catch (e) {
        if (programErrorOf(e) === "NotReady" || attempt >= 3) throw e;
        await pause(1_500);
      }
    }
  }

  // A visitor without SOL funds the player key first, in its own row below the seats.
  const needsFunds = waiting && !mySide && Boolean(wallet) && (balance ?? 0) < MIN_PLAY_LAMPORTS;
  const joinButton =
    !mySide && wallet ? (
      needsFunds ? (
        <p className="text-sm text-devnet">Add SOL below to take this seat.</p>
      ) : (
        <Button
          className="w-full sm:w-auto"
          variant="tide"
          loading={action.busy === "Joining"}
          onClick={() =>
            action.run("Joining", async () => {
              await joinAndDelegate(wallet, address, m.playerA);
              rememberMatch(wallet.publicKey, address, "B");
            })
          }
        >
          <Swords className="size-4" aria-hidden /> Join room {code}
        </Button>
      )
    ) : null;

  const statusLine = waiting ? (mySide === "A" ? "Waiting for an opponent to join" : "Waiting for a second player") : starting ? "Starting…" : "Both players in. Ready to start";

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Game lobby</h1>
            <p className="mt-1 text-sm text-muted">
              {waiting
                ? mySide === "A"
                  ? "Share the room code. Your opponent enters it on the home page or opens the invite link."
                  : "Ember is waiting for a challenger."
                : "Both generals are in. Press Start game to open turn 1."}
            </p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-surface-2/40 px-3 py-1.5 text-sm" aria-live="polite">
              <span className="text-muted">Status</span>
              {waiting ? <LoaderCircle className="size-3.5 animate-spin text-devnet" aria-hidden /> : <CircleCheck className="size-3.5 text-success" aria-hidden />}
              <span className="font-medium">{statusLine}</span>
            </p>
          </div>
          <RoomCode code={code} />
        </div>

        <div className="mt-6 grid items-start gap-3 sm:grid-cols-2">
          <PlayerSlot side="A" player={m.playerA} isMe={mySide === "A"}>
            {readyPill}
          </PlayerSlot>
          <PlayerSlot side="B" player={m.playerB} isMe={mySide === "B"}>
            {m.playerB ? (
              readyPill
            ) : joinButton ? (
              joinButton
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Waiting for player…
              </span>
            )}
          </PlayerSlot>
        </div>

        {needsFunds && (
          <section aria-labelledby="fund-to-join" className="mt-3 rounded-2xl border border-devnet/30 bg-surface-2/40 p-4 sm:p-5">
            <h2 id="fund-to-join" className="text-sm font-semibold">
              Fund your player key to join
            </h2>
            <p className="mt-1 text-sm text-muted">
              Quickest: copy your player key and send it to Ember. They open <span className="font-medium text-foreground">Add or send SOL</span> on
              their home page and press Send. No wallet needed on either side.
            </p>
            <div className="mt-4">
              <PlayerPanel compact />
            </div>
          </section>
        )}

        {status === "ready" && (
          <ul className="mt-5 space-y-2 rounded-2xl border border-border bg-surface-2/40 px-4 py-3">
            <Step done active={false}>
              Both players joined
            </Step>
            <Step done={where === "rollup"} active={starting && where === "base"}>
              Match moved to the private rollup
            </Step>
            <Step done={false} active={starting && where === "rollup"}>
              Moves sealed: each one readable only by the player who made it
            </Step>
          </ul>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            className="h-11 px-6"
            disabled={status !== "ready" || !mySide || !wallet || (where === "rollup" && !tee.connection)}
            loading={starting}
            onClick={() => action.run("Starting the game", start, { quiet: (e) => programErrorOf(e) === "NotReady" })}
          >
            <Play className="size-4" aria-hidden /> Start game
          </Button>
          <p className="flex items-center gap-2 text-sm text-muted">
            <Info className="size-4 shrink-0 text-tide" aria-hidden />
            {waiting
              ? "Start game unlocks once both players are in."
              : !mySide
                ? "Only the two players can start the game."
                : where === "rollup" && !tee.connection
                  ? "Connecting to the private rollup…"
                  : "Either player can start."}
          </p>
        </div>
      </Card>

      {waiting && mySide === "A" && wallet && (
        <p className="text-center text-xs text-muted">
          Changed your mind?{" "}
          <button
            type="button"
            onClick={() => action.run("Cancelling", () => cancelMatch(wallet, address))}
            className={`rounded underline underline-offset-2 hover:text-danger ${focus}`}
          >
            Cancel the match
          </button>{" "}
          and recover its rent.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Playing: map + side panel. Select a territory → Attack / Reinforce → destination and
// troops → commit (secret) → waiting → reveal table → turn complete → next turn.
// ---------------------------------------------------------------------------------------

type Mode = "attack" | "reinforce";

function PlayScreen({ address, state, mySide, action }: { address: PublicKey; state: Ready; mySide: Side; action: ActionRunner }) {
  const m = state.match;
  const board = m.board as Board;
  const myMove: PlayerMoveAccount | null = state.myMove;
  const reveal = m.lastTurn ? { actionA: m.lastTurn.actionA as Action, actionB: m.lastTurn.actionB as Action } : null;

  // The previous turn's result is shown first when this page watched it resolve.
  const [ackResult, setAckResult] = useState(false);
  const showResult = !ackResult && state.before !== null && m.lastTurn !== null && state.before.turn === m.lastTurn.turn;

  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [dest, setDest] = useState<number | null>(null);
  const [troops, setTroops] = useState(1);
  const [sealing, setSealing] = useState(false);

  const sealed = myMove && myMove.turn === m.turn ? orderOf(myMove.action as Action | null) : null;
  // The last turn's result never blocks: you can give your next order straight away.
  const composing = !sealed && !sealing;

  // The result plays out on the map for a few seconds, then gets out of the way by itself.
  useEffect(() => {
    if (!showResult) return;
    const id = setTimeout(() => setAckResult(true), RESULT_SHOW_MS);
    return () => clearTimeout(id);
  }, [showResult]);

  const mine = (t: number) => board.owner[t] === ownerTag(mySide);
  // Every target reachable from the selection, labelled on the map.
  const canOrder = composing && selected !== null && mine(selected);
  const attackable = canOrder ? attackTargets(board, mySide, selected) : [];
  const movable = canOrder ? reinforceTargets(board, mySide, selected) : [];

  const max = selected !== null ? maxTroops(board, selected) : 0;
  const order: Order | null =
    composing && selected !== null && mode && dest !== null
      ? mode === "attack"
        ? { attack: { from: selected, target: dest, troops: Math.min(Math.max(troops, 1), max) } }
        : { reinforce: { from: selected, to: dest, troops: Math.min(Math.max(troops, 1), max) } }
      : null;

  // The whole order is two clicks on the map: one of your territories, then a labelled neighbour.
  function select(t: number) {
    if (!composing) return;
    setAckResult(true);
    if (selected !== null && t !== selected && canOrder) {
      const kind: Mode | null = attackable.includes(t) ? "attack" : movable.includes(t) ? "reinforce" : null;
      if (kind) {
        // Attacks default to everything that can leave; transfers to a single troop.
        if (kind !== mode) setTroops(kind === "attack" ? maxTroops(board, selected) : 1);
        setMode(kind);
        setDest(t);
        return;
      }
    }
    // Only your own territories can give orders: enemy tiles are only ever targets.
    if (!mine(t)) return;
    if (t === selected) return clearSelection();
    setSelected(t);
    setMode(null);
    setDest(null);
  }

  function clearSelection() {
    setSelected(null);
    setMode(null);
    setDest(null);
  }

  // Escape steps back: first the target, then the selection.
  useEffect(() => {
    if (!composing || selected === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (dest !== null) {
        setDest(null);
        setMode(null);
      } else setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composing, selected, dest]);

  const wallet = usePlayerKey().wallet;
  const tee = useTeeSession();
  function commit() {
    if (!order || !wallet || !tee.connection) return;
    const chosen = order;
    setSealing(true);
    void action.run("Committing your move", () => sealOrder(tee.connection!, wallet, address, m, chosen)).finally(() => setSealing(false));
  }

  const fullscreen = use(FullscreenContext);
  useAutoResolve(address, m);
  const left = useTurnClock(m);
  const step = !composing
    ? null
    : selected === null
      ? `Click one of your territories · ${left}s left, or you hold`
      : dest === null
        ? "Click Attack or Move here · Esc to go back"
        : "Choose troops and commit";

  const overlay =
    sealed ? (
      <CommittedCard m={m} mySide={mySide} sealed={sealed} address={address} action={action} />
    ) : showResult && m.lastTurn ? (
      <ResultCard m={m} mySide={mySide} before={state.before!.board} onDismiss={() => setAckResult(true)} />
    ) : null;

  return (
    <div className="space-y-3">
      <GameBar m={m} mySide={mySide} fullscreen={fullscreen} />
      {/* The map is sized to the screen's height too, so the whole board fits without scrolling. */}
      <div className="mx-auto w-full" style={{ maxWidth: `calc((100dvh - ${fullscreen.active ? 5 : 15}rem) * ${MAP_ASPECT})`, minWidth: "min(100%, 40rem)" }}>
        <WorldMap
          board={board}
          mySide={mySide}
          selectable={new Set(composing ? [...Array(8).keys()].filter(mine) : [])}
          source={composing ? selected : null}
          targets={new Set([...attackable, ...movable])}
          attackable={new Set(attackable)}
          dest={dest}
          connected={new Set(composing && selected !== null ? neighbours(selected) : [])}
          order={sealed ?? order}
          reveal={showResult ? reveal : null}
          mustered={showResult}
          popover={
            order && selected !== null && dest !== null ? (
              <OrderCard
                board={board}
                order={order}
                max={max}
                onTroops={setTroops}
                sealing={sealing}
                onCommit={commit}
                onCancel={() => {
                  setDest(null);
                  setMode(null);
                }}
              />
            ) : null
          }
          overlay={overlay}
          hint={step}
          changes={showResult && reveal ? turnChanges(state.before!.board, reveal) : undefined}
          onCancel={composing && selected !== null ? clearSelection : undefined}
          onSelect={select}
        />
      </div>
      <ScoreStrip board={board} mySide={mySide} />
      <TurnTimer address={address} m={m} mySide={mySide} action={action} />

      <div className="grid items-start gap-3 lg:grid-cols-2">
        {m.lastTurn && reveal ? (
          <Card title={`Turn ${m.lastTurn.turn} revealed`}>
            <RevealTable actions={{ A: reveal.actionA, B: reveal.actionB }} after={board} mySide={mySide} before={showResult ? state.before!.board : null} />
          </Card>
        ) : null}
        <PlayersCard m={m} board={board} mySide={mySide} />
      </div>
      <HelpButton />
    </div>
  );
}

const RESULT_SHOW_MS = 6_000;

/** What the fight did to each tile, before the turn's new troops, so a 2 that stayed 2 is explained. */
function turnChanges(before: Board, reveal: { actionA: Action; actionB: Action }) {
  const fought = resolveMoves(before, reveal.actionA, reveal.actionB);
  const changes = new Map<number, { battle: number; captured: boolean }>();
  for (let t = 0; t < 8; t++) {
    const captured = fought.owner[t] !== before.owner[t];
    const battle = fought.strength[t] - before.strength[t];
    if (captured || battle !== 0) changes.set(t, { battle, captured });
  }
  return changes;
}

/** Browser full screen for the board, so the whole game fits on screen. */
function useFullscreen(ref: RefObject<HTMLElement | null>): Fullscreen {
  const active = useSyncExternalStore(
    (onChange) => {
      document.addEventListener("fullscreenchange", onChange);
      return () => document.removeEventListener("fullscreenchange", onChange);
    },
    () => document.fullscreenElement !== null && document.fullscreenElement === ref.current,
    () => false,
  );
  const supported = typeof document !== "undefined" && document.fullscreenEnabled;
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen().catch(() => {});
  };
  return { active, supported, toggle };
}

/** Seconds left on the turn clock (`after` seconds from the turn's start). */
function useTurnClock(m: MatchAccount, after = TURN_SECS) {
  const now = useNow(1000);
  return Math.max(0, Math.ceil(((m.turnStartedAt.toNumber() + after) * 1000 - now) / 1000));
}

/**
 * When the turn clock runs out, resolve the turn: anyone may, and a player who hasn't
 * committed holds. Both players' pages try (a few seconds apart if the first fails); the
 * second attempt just finds the turn already resolved, so failures stay in the debug log.
 */
function useAutoResolve(address: PublicKey, m: MatchAccount) {
  const wallet = usePlayerKey().wallet;
  const tee = useTeeSession();
  const left = useTurnClock(m, TURN_SECS + AUTO_RESOLVE_GRACE_SECS);
  const lastTry = useRef(0);
  const due = statusOf(m) === "turnOpen" && left === 0;
  useEffect(() => {
    if (!due || !wallet || !tee.connection || Date.now() - lastTry.current < AUTO_RESOLVE_RETRY_MS) return;
    lastTry.current = Date.now();
    debugLog("turn", "turn clock ran out: resolving", { turn: m.turn, aCommitted: m.aCommitted, bCommitted: m.bCommitted });
    resolveTurn(tee.connection, wallet, address, m).then(
      () => debugLog("turn", "resolved by the turn clock", { turn: m.turn }),
      (e) => debugLog("turn", "auto-resolve skipped (likely already resolved)", describeUnknown(e), "warn"),
    );
  });
}

/** The chain's clock can trail this browser's a little: wait a moment past the deadline. */
const AUTO_RESOLVE_GRACE_SECS = 2;
const AUTO_RESOLVE_RETRY_MS = 4_000;

/** One slim line above the map: who you are, the score, the opponent's status, the clock and full screen. */
function GameBar({ m, mySide, fullscreen }: { m: MatchAccount; mySide: Side; fullscreen: Fullscreen }) {
  const board = m.board as Board;
  const opponent = opponentOf(mySide);
  const theyCommitted = mySide === "A" ? m.bCommitted : m.aCommitted;
  const remaining = useTurnClock(m);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs shadow-card">
      <span className="flex items-center gap-1.5" title="The person badge marks your tiles. The number on a tile is its troops.">
        <span className={`inline-flex size-5 items-center justify-center rounded-full ${mySide === "A" ? "bg-ember text-on-ember" : "bg-tide text-on-tide"}`} aria-hidden>
          <User className="size-3" />
        </span>
        <span>
          You are <strong>{FACTION[mySide]}</strong>
        </span>
      </span>
      <span className="flex items-center gap-3 font-mono tabular-nums">
        {(["A", "B"] as const).map((side) => (
          <span key={side} className="inline-flex items-center gap-1.5">
            <FactionDot side={side} />
            {side === mySide ? "You" : FACTION[side]} {count(board, ownerTag(side))}/8
          </span>
        ))}
      </span>
      <span className="flex items-center gap-1.5 text-muted" aria-live="polite">
        {theyCommitted ? <Lock className="size-3.5 text-success" aria-hidden /> : <LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden />}
        {theyCommitted ? `${FACTION[opponent]} has committed` : `${FACTION[opponent]} is choosing…`}
      </span>
      <span className="ml-auto flex items-center gap-1">
        <span
          className={`inline-flex items-center gap-1 font-mono tabular-nums ${remaining <= 10 ? "font-semibold text-danger" : "text-muted"}`}
          title="When the turn clock runs out, the turn resolves. No order in time means you hold."
        >
          <Clock className="size-3.5" aria-hidden />
          {remaining > 0 ? `0:${String(remaining).padStart(2, "0")}` : "Resolving…"}
        </span>
        {fullscreen.supported && (
          <button
            type="button"
            onClick={fullscreen.toggle}
            aria-label={fullscreen.active ? "Exit full screen" : "Play full screen"}
            title={fullscreen.active ? "Exit full screen" : "Play full screen"}
            className={`-my-1 inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground ${focus}`}
          >
            {fullscreen.active ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
          </button>
        )}
      </span>
    </div>
  );
}

/** The order, set and committed right on the map, next to its target. */
function OrderCard({
  board,
  order,
  max,
  onTroops,
  sealing,
  onCommit,
  onCancel,
}: {
  board: Board;
  order: Order;
  max: number;
  onTroops: (n: number) => void;
  sealing: boolean;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const attack = "attack" in order;
  const troops = actionTroops(order);
  const to = actionTo(order);
  const from = actionFrom(order);
  const set = (n: number) => onTroops(Math.min(Math.max(n, 1), max));
  const defence = board.strength[to];
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 text-left shadow-float" role="group" aria-label="Order">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">
          {attack ? "Attack" : "Move to"} {TERRITORIES[to].name}
        </p>
        <button type="button" onClick={onCancel} aria-label="Cancel order" className={`-m-1.5 inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 ${focus}`}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <p className="text-xs text-muted">
        from {TERRITORIES[from].name} · up to {max} can go
      </p>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => set(troops - 1)} disabled={troops <= 1} aria-label="Send fewer troops" className={`btn-paper inline-flex size-10 items-center justify-center rounded-xl disabled:opacity-45 ${focus}`}>
          <Minus className="size-4" aria-hidden />
        </button>
        <p className="flex-1 text-center">
          <output aria-label="Troops to send" className="font-mono text-2xl font-semibold tabular-nums">{troops}</output>
          <span className="ml-1 text-xs text-muted">{troops === 1 ? "troop" : "troops"}</span>
        </p>
        <button type="button" onClick={() => set(troops + 1)} disabled={troops >= max} aria-label="Send more troops" className={`btn-paper inline-flex size-10 items-center justify-center rounded-xl disabled:opacity-45 ${focus}`}>
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
      <p className={`mt-2 text-xs ${attack ? (troops > defence ? "text-success" : "text-danger") : "text-muted"}`}>
        {attack && `${TERRITORIES[from].name} keeps ${board.strength[from] - troops}. `}
        {attack
          ? troops > defence
            ? `${troops} vs ${defence} defending: you capture it, unless they reinforce.`
            : `${troops} vs ${defence} defending: not enough. A tie goes to the defender.`
          : `${TERRITORIES[from].name} keeps ${board.strength[from] - troops}, ${TERRITORIES[to].name} gets ${board.strength[to] + troops}.`}
      </p>
      <Button className="mt-3 h-10 w-full" loading={sealing} onClick={onCommit}>
        <Lock className="size-4" aria-hidden /> {attack ? "Commit attack" : "Commit transfer"}
      </Button>
    </div>
  );
}

/** Territories held per faction, under the map. */
function ScoreStrip({ board, mySide }: { board: Board; mySide: Side | null }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 font-mono text-xs tabular-nums text-muted">
      {(["A", "B"] as const).map((side) => (
        <span key={side} className="inline-flex items-center gap-1.5">
          <FactionDot side={side} />
          {FACTION[side]}
          {side === mySide ? " (you)" : ""} · {count(board, ownerTag(side))}/8
        </span>
      ))}
      <span>First to {WIN_TERRITORIES} territories wins</span>
      <span className="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 24 4" className="h-1 w-6" aria-hidden>
          <line x1="0" y1="2" x2="24" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" />
        </svg>
        Border: attack or move along it
      </span>
    </div>
  );
}

/** The rules, behind a small "?" in the bottom-right corner, so they never take board space. */
function HelpButton() {
  const dialog = useRef<HTMLDialogElement>(null);
  const rules: [string, ReactNode][] = [
    ["Goal", <>Hold {WIN_TERRITORIES} of the 8 territories, or wipe out your opponent.</>],
    ["You", <>Your colour is in the bar above the map, and your tiles carry a person badge. The number on a tile is its troops.</>],
    ["Your move", <>Click one of your territories, then a neighbour marked <strong className="text-danger">Attack</strong> (theirs) or <strong>Move here</strong> (yours). Pick the troops in the card that opens and commit.</>],
    ["Borders", <>Troops only travel along the dotted lines, one border per turn. North America can&apos;t reach India directly.</>],
    ["Fights", <>An attack captures only with more troops than the defence, and keeps the difference. A tie goes to the defender. One troop always stays home.</>],
    ["Hidden orders", <>Both generals move at once. Neither sees the other&apos;s order until both have committed.</>],
    ["New troops", <>After every turn, each territory you hold gains {TROOPS_PER_TURN} troop.</>],
    ["Turn clock", <>Each turn lasts {TURN_SECS} seconds. If it runs out before you commit, you hold (no order) and the turn resolves anyway.</>],
    ["Winning", <>First to {WIN_TERRITORIES} territories wins. After {MAX_TURNS} turns, more territories wins, then more troops.</>],
  ];
  return (
    <>
      <div className="group fixed bottom-6 right-6 z-50">
        <button
          type="button"
          onClick={() => dialog.current?.showModal()}
          aria-label="How to play"
          className={`inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-float hover:bg-surface-2 ${focus}`}
        >
          <CircleHelp className="size-5" aria-hidden />
        </button>
        <span className="pointer-events-none absolute bottom-1/2 right-full mr-2 translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-float transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100" aria-hidden>
          How to play
        </span>
      </div>
      <dialog
        ref={dialog}
        aria-labelledby="how-to-play-title"
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground shadow-float backdrop:bg-black/50"
      >
        <div className="p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 id="how-to-play-title" className="text-base font-semibold">
              How to play
            </h2>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className={`-m-2 inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 ${focus}`}>
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[6.5rem_1fr]">
            {rules.map(([term, body]) => (
              <div key={term} className="contents">
                <dt className="font-medium">{term}</dt>
                <dd className="text-muted">{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </dialog>
    </>
  );
}

/** The summary rows used before and after committing. */
function MoveSummary({ action }: { action: Order }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-2xl border border-border bg-surface-2/40 p-3 text-sm">
      <dt className="text-muted">Move selected</dt>
      <dd className="text-right font-medium">{actionRoute(action)}</dd>
      <dt className="text-muted">Action</dt>
      <dd className="text-right font-medium">{actionKind(action)}</dd>
      <dt className="text-muted">Troops committed</dt>
      <dd className="text-right font-mono font-semibold tabular-nums">{actionTroops(action)}</dd>
    </dl>
  );
}

/** After committing: a compact card on the map while the opponent decides. */
function CommittedCard({ m, mySide, sealed, address, action }: { m: MatchAccount; mySide: Side; sealed: Order; address: PublicKey; action: ActionRunner }) {
  const wallet = usePlayerKey().wallet;
  const tee = useTeeSession();
  const opponent = FACTION[opponentOf(mySide)];
  const announced = mySide === "A" ? m.aCommitted : m.bCommitted;
  const revealing = m.aCommitted && m.bCommitted;

  return (
    <div className="rounded-2xl border border-border bg-surface p-3 shadow-float" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-semibold">
        {revealing ? <Eye className="size-4 text-tide motion-safe:animate-pulse" aria-hidden /> : <Lock className="size-4 text-devnet" aria-hidden />}
        {revealing ? "Both moves committed" : "Move committed"}
      </p>
      <p className="mt-0.5 text-xs text-muted">{revealing ? "Revealing the turn…" : `Waiting for ${opponent}. Your move is hidden from them.`}</p>
      <div className="mt-2">
        <MoveSummary action={sealed} />
      </div>
      {/* Only if the automatic announce failed; the turn still resolves either way. */}
      {!announced && !action.busy && action.error && wallet && tee.connection && (
        <Button className="mt-2 h-9 w-full" variant="secondary" loading={action.busy === "Announcing"} onClick={() => action.run("Announcing", () => announce(tee.connection!, wallet, address, m))}>
          Tell {opponent} you&apos;ve committed
        </Button>
      )}
      {revealing && wallet && tee.connection && (
        <Button className="mt-2 h-9 w-full" variant="secondary" loading={action.busy === "Resolving"} onClick={() => action.run("Resolving", () => resolveTurn(tee.connection!, wallet, address, m))}>
          Resolve now
        </Button>
      )}
    </div>
  );
}

const toneDot = { good: "bg-success", bad: "bg-danger", info: "bg-tide" } as const;

/** Player / Move / Result, one row per general. */
function RevealTable({ actions, after, mySide, before }: { actions: { A: Action; B: Action }; after: Board; mySide: Side | null; before: Board | null }) {
  const rows = turnRows(actions, after, mySide, before);
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-2/60 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Player
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Move
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Result
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.side} className="align-top">
              <th scope="row" className="px-3 py-2.5 font-medium">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <FactionDot side={row.side} />
                  {row.side === mySide ? "You" : FACTION[row.side]}
                </span>
              </th>
              <td className="px-3 py-2.5">{row.move}</td>
              <td className="px-3 py-2.5">
                <span className="flex items-start gap-1.5">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${toneDot[row.tone]}`} aria-hidden />
                  {row.result}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** After a reveal: what happened, in two lines. It closes by itself; the full table is under the map. */
function ResultCard({ m, mySide, before, onDismiss }: { m: MatchAccount; mySide: Side; before: Board; onDismiss: () => void }) {
  const last = m.lastTurn!;
  const actions = { A: last.actionA as Action, B: last.actionB as Action };
  const board = m.board as Board;
  const lines = turnSummary(actions, board, mySide, before);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-3 shadow-float" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold">Turn {last.turn} complete</h2>
        <button type="button" onClick={onDismiss} aria-label="Dismiss turn result" className={`-m-1.5 inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 ${focus}`}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <ul className="mt-1.5 space-y-1.5 text-xs">
        {lines.map((line, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className={`mt-1 size-2 shrink-0 rounded-full ${toneDot[line.tone]}`} aria-hidden />
            {line.text}
          </li>
        ))}
      </ul>
      <MusterNote board={board} mySide={mySide} />
      <p className="mt-2 text-xs font-medium">Turn {m.turn} is open: give your next order.</p>
      {/* How long the card stays: it shrinks away, then the card closes. */}
      <span className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-tide motion-safe:animate-[shrink_6s_linear_forwards]" aria-hidden />
    </div>
  );
}

/** The troops raised at the end of the turn, already included in the counts above. */
function MusterNote({ board, mySide }: { board: Board; mySide: Side | null }) {
  const sides: Side[] = mySide === "B" ? ["B", "A"] : ["A", "B"];
  return (
    <p className="mt-3 flex items-start gap-2 text-xs text-muted">
      <ShieldPlus className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        New troops:{" "}
        {sides
          .map((side) => {
            const held = count(board, ownerTag(side));
            return `${side === mySide ? "you" : FACTION[side]} +${held * TROOPS_PER_TURN}`;
          })
          .join(", ")}{" "}
        ({TROOPS_PER_TURN} on every held territory, counted above).
      </span>
    </p>
  );
}

function PlayersCard({ m, board, mySide }: { m: MatchAccount; board: Board; mySide: Side | null }) {
  const rows: { side: Side; key: PublicKey | null; committed: boolean; held: number }[] = [
    { side: "A", key: m.playerA, committed: m.aCommitted, held: count(board, OWNER_A) },
    { side: "B", key: m.playerB, committed: m.bCommitted, held: count(board, OWNER_B) },
  ];
  return (
    <Card title="Generals">
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.side} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                <FactionDot side={row.side} />
                {FACTION[row.side]}
                {row.side === mySide && <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">You</span>}
              </p>
              {row.key && (
                <div className="-ml-2">
                  <Address value={row.key.toBase58()} label={`${FACTION[row.side]} player key`} />
                </div>
              )}
            </div>
            <div className="text-right">
              <p className={`flex items-center justify-end gap-1 text-xs font-medium ${row.committed ? "text-success" : "text-muted"}`}>
                {row.committed ? <Lock className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
                {row.committed ? "Committed" : "Deciding"}
              </p>
              <p className="font-mono text-xs tabular-nums text-muted">{row.held}/8 held</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TurnTimer({ address, m, mySide, action }: { address: PublicKey; m: MatchAccount; mySide: Side; action: ActionRunner }) {
  const wallet = usePlayerKey().wallet;
  const tee = useTeeSession();
  const remaining = useTurnClock(m, TURN_TIMEOUT_SECS);
  const mine = mySide === "A" ? m.aCommitted : m.bCommitted;
  const theirs = mySide === "A" ? m.bCommitted : m.aCommitted;
  const canAct = Boolean(wallet && tee.connection);

  // The countdown itself is in the bar above the map; this card only appears once the turn has stalled.
  if (remaining > 0 || (mine && theirs)) return null;
  return (
    <Card>
      {mine && !theirs && (
        <>
          <p className="text-sm">{FACTION[opponentOf(mySide)]} hasn&apos;t moved in time. You can take the win.</p>
          <Button className="mt-3 w-full" disabled={!canAct} loading={action.busy === "Claiming"} onClick={() => action.run("Claiming", () => claimTimeout(tee.connection!, wallet!, address, m))}>
            Claim the win
          </Button>
        </>
      )}
      {!mine && !theirs && (
        <>
          <p className="text-sm">Neither general has moved. Either can end the match as a draw.</p>
          <Button className="mt-3 w-full" variant="secondary" disabled={!canAct} loading={action.busy === "Ending"} onClick={() => action.run("Ending", () => claimTimeout(tee.connection!, wallet!, address, m))}>
            End as a draw
          </Button>
        </>
      )}
      {!mine && theirs && <p className="text-sm">{FACTION[opponentOf(mySide)]} is waiting on your move.</p>}
    </Card>
  );
}

function SpectatorScreen({ m, before }: { m: MatchAccount; before: Ready["before"] }) {
  const board = m.board as Board;
  const reveal = m.lastTurn ? { actionA: m.lastTurn.actionA as Action, actionB: m.lastTurn.actionB as Action } : null;
  const prev = before && m.lastTurn && before.turn === m.lastTurn.turn ? before.board : null;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="min-w-0 space-y-3">
        <WorldMap
          board={board}
          mySide={null}
          selectable={new Set()}
          source={null}
          targets={new Set()}
          order={null}
          reveal={reveal}
          mustered={reveal !== null}
          changes={prev && reveal ? turnChanges(prev, reveal) : undefined}
          onSelect={() => {}}
        />
        <ScoreStrip board={board} mySide={null} />
        <HelpButton />
      </div>
      <aside className="space-y-4">
        <PlayersCard m={m} board={board} mySide={null} />
        {m.lastTurn && reveal && (
          <Card title={`Turn ${m.lastTurn.turn} revealed`}>
            <RevealTable actions={{ A: reveal.actionA, B: reveal.actionB }} after={board} mySide={null} before={prev} />
          </Card>
        )}
        <p className="text-center text-xs text-muted">You&apos;re watching. Moves appear only once both generals have committed.</p>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Game over: winner, final territories, turns, result, play again. Saved to Solana.
// ---------------------------------------------------------------------------------------

const SETTLE_BACKUP_DELAY_MS = 8_000;

/** Settling a match the other player already settled fails with Anchor's 3007 (account owned by wrong program). */
function isAlreadySettled(e: unknown) {
  const text = `${(e as { message?: unknown })?.message ?? ""} ${JSON.stringify(e ?? null)}`;
  return /"Custom":3007|AccountOwnedByWrongProgram|0xbbf\b/.test(text);
}

function GameOverScreen({ address, state, mySide, action }: { address: PublicKey; state: Ready; mySide: Side | null; action: ActionRunner }) {
  const { where, match: m } = state;
  const { wallet, balance } = usePlayerKey();
  const tee = useTeeSession();
  const router = useRouter();
  const board = m.board as Board;
  const outcome = outcomeOf(m);
  const winner: Side | null = outcome === "playerA" ? "A" : outcome === "playerB" ? "B" : null;
  const headline = outcome === "draw" ? "Draw" : mySide ? (winner === mySide ? "Victory!" : "Defeat") : `${FACTION[winner!]} wins`;
  const winnerKey = winner === "A" ? m.playerA : winner === "B" ? m.playerB : null;
  const turns = m.lastTurn?.turn ?? Math.max(0, m.turn - 1);
  const result =
    winner === null
      ? turns === 0
        ? "Ended as a draw before any move"
        : "Draw on the turn limit"
      : count(board, ownerTag(opponentOf(winner))) === 0
        ? `${FACTION[winner]} eliminated ${FACTION[opponentOf(winner)]}`
        : count(board, ownerTag(winner)) >= WIN_TERRITORIES
          ? `${FACTION[winner]} holds ${count(board, ownerTag(winner))} of 8 territories`
          : m.lastTurn === null || turns < MAX_TURNS
            ? `${FACTION[opponentOf(winner)]} ran out of time`
            : `${FACTION[winner]} led when the turn limit was reached`;

  // Write the final result back to Solana automatically. Ember's client goes first; Tide's
  // waits a few seconds and only steps in if the match is still unsaved (Ember left early).
  // Whoever is second may find the accounts already moved back, which means it's done.
  const settleStarted = useRef(false);
  const canSettle = where === "rollup" && Boolean(mySide && wallet && tee.connection);
  useEffect(() => {
    if (!canSettle || settleStarted.current || !wallet || !tee.connection) return;
    const conn = tee.connection;
    const timer = setTimeout(
      () => {
        settleStarted.current = true;
        void action.run("Saving the result to Solana", () => settleMatch(conn, wallet, address, m), { quiet: isAlreadySettled });
      },
      mySide === "A" ? 0 : SETTLE_BACKUP_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [canSettle, wallet, tee.connection, action, address, m, mySide]);

  const [starting, setStarting] = useState(false);
  async function playAgain() {
    if (!wallet) return;
    setStarting(true);
    try {
      const { match, code } = await createMatch(wallet);
      rememberMatch(wallet.publicKey, match, "A");
      router.push(`/match/${code}`);
    } catch {
      setStarting(false);
      router.push("/");
    }
  }
  const funded = balance !== null && balance >= MIN_PLAY_LAMPORTS;
  const lastReveal = m.lastTurn ? { A: m.lastTurn.actionA as Action, B: m.lastTurn.actionB as Action } : null;
  const prev = state.before && m.lastTurn && state.before.turn === m.lastTurn.turn ? state.before.board : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <div className="flex flex-col items-center text-center">
          <span
            className={`flex size-16 items-center justify-center rounded-3xl ${
              winner && winner === mySide ? "bg-devnet/15 text-devnet" : "bg-surface-2 text-muted"
            }`}
          >
            <Trophy className="size-8" aria-hidden />
          </span>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">{headline}</h1>
          {winner && winnerKey && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 text-sm text-muted">
              Winner: <FactionDot side={winner} /> <span className="font-medium text-foreground">{FACTION[winner]}</span>
              <Address value={winnerKey.toBase58()} label="winner's wallet" />
            </div>
          )}
        </div>

        <dl className="mt-6 grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-surface-2/40 text-center">
          <div className="p-3">
            <dt className="text-xs text-muted">Final territories</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">
              <span className="text-ember">{count(board, OWNER_A)}</span>
              <span className="text-muted"> – </span>
              <span className="text-tide">{count(board, OWNER_B)}</span>
            </dd>
          </div>
          <div className="p-3">
            <dt className="text-xs text-muted">Turns played</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{turns}</dd>
          </div>
          <div className="p-3">
            <dt className="text-xs text-muted">Result</dt>
            <dd className="mt-1 text-sm font-medium">{result}</dd>
          </div>
        </dl>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(["A", "B"] as const).map((side) => (
            <div
              key={side}
              className={`flex items-center gap-4 rounded-2xl border p-4 ${winner === side ? "border-success/40" : "border-border"} bg-surface shadow-card`}
            >
              <KeyTile tone={side === "A" ? "ember" : "tide"} className="size-12 shrink-0 text-lg">
                {side === "A" ? "E" : "T"}
              </KeyTile>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {FACTION[side]} {side === mySide && youPill}
                  {winner === side && <span className="ml-1 text-xs text-success">Winner</span>}
                </p>
                <p className="font-mono text-xs text-muted">{shortAddress(side === "A" ? m.playerA : m.playerB!)}</p>
                <p className={`mt-1 text-sm font-semibold ${side === "A" ? "text-ember" : "text-tide"}`}>{count(board, ownerTag(side))} territories</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {mySide && funded ? (
            <Button className="h-11" loading={starting} onClick={playAgain}>
              <Swords className="size-4" aria-hidden /> Play again
            </Button>
          ) : (
            <Link href="/" className={`btn-graphite inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium ${focus}`}>
              <Swords className="size-4" aria-hidden /> New match
            </Link>
          )}
          <Link href="/" className={`btn-paper inline-flex h-11 items-center justify-center rounded-xl text-sm font-medium ${focus}`}>
            Back to lobby
          </Link>
        </div>

        <p className={`mt-5 flex items-center justify-center gap-2 text-sm ${where === "base" ? "text-success" : "text-muted"}`}>
          {where === "base" ? <Check className="size-4" aria-hidden /> : <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          {where === "base" ? "Saved on Solana" : "Saving the result to Solana…"}
        </p>
        {where === "rollup" && mySide && !action.busy && action.error && wallet && tee.connection && (
          <div className="mt-3 flex justify-center">
            <Button variant="secondary" onClick={() => action.run("Saving the result to Solana", () => settleMatch(tee.connection!, wallet, address, m))}>
              <RotateCw className="size-4" aria-hidden /> Retry saving
            </Button>
          </div>
        )}
      </Card>

      {lastReveal && m.lastTurn && (
        <Card title={`Final turn · turn ${m.lastTurn.turn}`}>
          <RevealTable actions={lastReveal} after={board} mySide={mySide} before={prev} />
        </Card>
      )}

      <WorldMap
        board={board}
        mySide={mySide}
        selectable={new Set()}
        source={null}
        targets={new Set()}
        order={null}
        reveal={m.lastTurn ? { actionA: m.lastTurn.actionA as Action, actionB: m.lastTurn.actionB as Action } : null}
        onSelect={() => {}}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Loading, empty and session states.
// ---------------------------------------------------------------------------------------

function LoadingLayout() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_23rem]" aria-label="Loading match">
      <Skeleton className="aspect-[4/3] w-full rounded-3xl sm:aspect-[2/1]" />
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-3xl" />
        <Skeleton className="h-32 w-full rounded-3xl" />
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="mx-auto max-w-lg text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{body}</p>
      <Link href="/" className={`btn-graphite mt-6 inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium ${focus}`}>
        Back to home
      </Link>
    </Card>
  );
}

/** The match is on the private rollup; the player key is still opening its session. */
function SessionGate() {
  const tee = useTeeSession();
  return (
    <Card className="mx-auto max-w-lg text-center">
      <h1 className="text-2xl font-semibold">Connecting to the private rollup</h1>
      <p className="mt-2 text-sm text-muted">Your player key proves who you are, so the rollup shows you the board and only your own moves.</p>
      {tee.error ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm text-danger">{tee.error}</p>
          <Button variant="secondary" onClick={tee.retry}>
            <RotateCw className="size-4" aria-hidden /> Try again
          </Button>
        </div>
      ) : (
        <p className="mt-5 flex items-center justify-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Connecting…
        </p>
      )}
    </Card>
  );
}
