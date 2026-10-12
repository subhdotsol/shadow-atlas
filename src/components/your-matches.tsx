"use client";

import { ChevronRight, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MAX_TURNS } from "@/lib/config";
import { opponentOf, type Side } from "@/lib/game";
import { loadMatches, type MatchSummary } from "@/lib/match-history";
import { outcomeOf, roomCodeOf, shortAddress, statusOf } from "@/lib/program";
import { usePlayerKey } from "./player-key";
import { useTeeSession } from "./tee-session";
import { FACTION, KeyTile, focus } from "./ui";

const REFRESH_MS = 10_000;

type Tone = "action" | "waiting" | "done" | "attention";
type Row = { summary: MatchSummary; label: string; detail: string; tone: Tone; rank: number };

function describe(s: MatchSummary): Row {
  const m = s.match;
  const rival = FACTION[opponentOf(s.side)];
  if (!m) return { summary: s, label: "Live on the rollup", detail: "Opening a rollup session…", tone: "waiting", rank: 2 };

  const status = statusOf(m);
  if (status === "waitingForPlayer") return { summary: s, label: "Waiting for opponent", detail: s.match ? `Room ${roomCodeOf(s.match)}` : "Share the room code", tone: "waiting", rank: 2 };
  if (status === "ready") return { summary: s, label: "Setting up", detail: "Finish setup to start turn 1", tone: "attention", rank: 1 };
  if (status === "turnOpen") {
    const mine = s.side === "A" ? m.aCommitted : m.bCommitted;
    return mine
      ? { summary: s, label: `Waiting for ${rival}`, detail: `Turn ${m.turn} of ${MAX_TURNS}`, tone: "waiting", rank: 2 }
      : { summary: s, label: "Your move", detail: `Turn ${m.turn} of ${MAX_TURNS}`, tone: "action", rank: 0 };
  }
  const outcome = outcomeOf(m);
  const won = (outcome === "playerA" && s.side === "A") || (outcome === "playerB" && s.side === "B");
  const result = outcome === "draw" ? "Draw" : won ? "Victory" : "Defeat";
  return s.where === "rollup"
    ? { summary: s, label: "Needs settling", detail: result, tone: "attention", rank: 1 }
    : { summary: s, label: result, detail: "Settled on Solana", tone: "done", rank: 3 };
}

const toneClass: Record<Tone, string> = {
  action: "btn-tide",
  attention: "border border-ember/40 text-ember bg-surface",
  waiting: "border border-border text-muted bg-surface-2",
  done: "border border-border text-foreground bg-surface",
};

function opponentKey(s: MatchSummary) {
  if (!s.match) return null;
  return s.side === "A" ? s.match.playerB : s.match.playerA;
}

/** Matches this player key created or joined, with live status, refreshed every 10 s. */
export function useMyMatches() {
  const { keypair } = usePlayerKey();
  const tee = useTeeSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!keypair) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      loadMatches(keypair.publicKey, tee.connection)
        .then((summaries) => {
          if (cancelled) return;
          setFailed(false);
          setRows(summaries.map(describe).sort((a, b) => a.rank - b.rank || b.summary.at - a.summary.at));
        })
        .catch(() => !cancelled && setFailed(true))
        .finally(() => {
          if (!cancelled) timer = setTimeout(load, REFRESH_MS);
        });
    load();
    const onFocus = () => document.visibilityState === "visible" && setTick((t) => t + 1);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [keypair, tee.connection, tick]);

  return { rows, failed, retry: () => setTick((t) => t + 1) };
}

const SHOWN = 3;

/** The "Your matches" block at the top of the home card: a way back into every match. */
export function MyMatches() {
  const { rows, failed, retry } = useMyMatches();
  const [showAll, setShowAll] = useState(false);
  const visible = rows ? (showAll ? rows : rows.slice(0, SHOWN)) : [];

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Your matches</h2>
        {failed ? (
          <button type="button" onClick={retry} className={`-my-2 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-xs text-muted hover:bg-surface-2 ${focus}`}>
            <RotateCw className="size-3.5" aria-hidden /> Retry
          </button>
        ) : (
          rows && rows.length > 0 && <span className="font-mono text-xs text-muted">{rows.length}</span>
        )}
      </div>

      {rows === null ? (
        <div className="mt-3 h-16 animate-pulse rounded-2xl bg-surface-2" aria-label="Loading your matches" />
      ) : rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No matches yet. Create one, or join with a room code below.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {visible.map(({ summary, label, detail, tone }) => {
            const rival = opponentKey(summary);
            return (
              <li key={summary.address}>
                <Link
                  href={`/match/${summary.match ? roomCodeOf(summary.match) : summary.address}`}
                  className={`group flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5 transition-colors hover:bg-surface-2/60 ${focus}`}
                >
                  <KeyTile tone={summary.side === "A" ? "ember" : "tide"} className="size-9 shrink-0 rounded-xl text-sm">
                    {summary.side === "A" ? "E" : "T"}
                  </KeyTile>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {FACTION[summary.side as Side]}
                      {/* The opponent fits on wider screens; on phones the status says what matters. */}
                      <span className="hidden sm:inline">
                        {" "}
                        <span className="font-normal text-muted">vs</span>{" "}
                        {rival ? <span className="font-mono text-[13px]">{shortAddress(rival)}</span> : <span className="font-normal text-muted">open seat</span>}
                      </span>
                    </span>
                    <span className="block truncate font-mono text-xs text-muted">{detail}</span>
                  </span>
                  <span className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium ${toneClass[tone]}`}>{label}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {rows && rows.length > SHOWN && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className={`mt-2 h-10 rounded-lg px-2 text-sm text-muted hover:text-foreground ${focus}`}>
          {showAll ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}
