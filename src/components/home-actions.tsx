"use client";

import { ArrowRight, ChevronDown, KeyRound, Swords } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { MIN_PLAY_LAMPORTS, sol } from "@/lib/funding";
import { rememberMatch } from "@/lib/match-history";
import { parseMatchRef } from "@/lib/program";
import { createMatch, describeError, isUserRejection } from "@/lib/tx";
import { usePlayerKey } from "./player-key";
import { FundingActions } from "./player-panel";
import { Address, Button, focus } from "./ui";
import { MyMatches } from "./your-matches";

/**
 * The home card, three rows: your matches (a way back in), start or open a match,
 * and the player key with its balance. Funding options stay folded behind "Add or send SOL".
 */
export function HomeActions() {
  const { wallet, keypair, balance } = usePlayerKey();
  const funded = balance !== null && balance >= MIN_PLAY_LAMPORTS;
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [fundingOpen, setFundingOpen] = useState(false);
  const showFunding = fundingOpen || (balance !== null && !funded);

  async function create() {
    if (!wallet || !funded) return;
    setCreating(true);
    setCreateError(null);
    try {
      const { match, code } = await createMatch(wallet);
      rememberMatch(wallet.publicKey, match, "A");
      router.push(`/match/${code}`);
    } catch (e) {
      if (!isUserRejection(e)) setCreateError(describeError(e));
      setCreating(false);
    }
  }

  function open(e: FormEvent) {
    e.preventDefault();
    const ref = parseMatchRef(code);
    if (!ref) return setJoinError("Enter a 6-character room code, or paste a match link.");
    router.push(`/match/${ref.code ?? ref.address.toBase58()}`);
  }

  return (
    <section className="divide-y divide-dashed divide-border overflow-hidden rounded-3xl border border-border bg-surface text-left shadow-card">
      <div className="p-5 sm:p-6">
        <MyMatches />
      </div>

      <div className="p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_auto_minmax(0,1fr)] sm:items-end">
          <div>
            <p className="mb-2 text-xs font-medium text-muted">
              New match{balance !== null && !funded && <span className="font-normal text-devnet"> · add SOL first</span>}
            </p>
            <Button
              variant={funded ? "primary" : "secondary"}
              className="h-12 w-full text-[15px] disabled:opacity-60"
              loading={creating}
              disabled={!funded}
              onClick={create}
            >
              <Swords className="size-4" aria-hidden />
              Create match
            </Button>
          </div>
          <span className="hidden h-12 items-center font-mono text-xs uppercase tracking-[0.14em] text-faint sm:flex" aria-hidden>
            or
          </span>
          <form onSubmit={open} noValidate className="min-w-0">
            <label htmlFor="match-code" className="mb-2 block text-xs font-medium text-muted">
              Join with a room code
            </label>
            <div
              className={`flex h-12 items-center gap-1 rounded-xl border bg-surface-2/60 p-1 shadow-[inset_0_1px_2px_oklch(0_0_0/0.04)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring ${
                joinError ? "border-danger/50" : "border-border"
              }`}
            >
              <input
                id="match-code"
                name="match"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="e.g. K7Q2XM"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setJoinError(null);
                }}
                aria-invalid={Boolean(joinError)}
                aria-describedby={joinError ? "match-code-error" : undefined}
                className="h-full min-w-0 flex-1 bg-transparent px-2.5 font-mono text-[15px] uppercase tracking-[0.16em] outline-none placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-muted"
              />
              <Button type="submit" variant="tide" className="h-10 shrink-0 px-4" aria-label="Join room">
                Join
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </div>
          </form>
        </div>
        {createError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {createError}
          </p>
        )}
        {joinError && (
          <p id="match-code-error" className="mt-2 text-sm text-danger">
            {joinError}
          </p>
        )}
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <KeyRound className="size-4 text-muted" aria-hidden />
          <span className="text-sm font-medium">Player key</span>
          {keypair && (
            <span className="-ml-1">
              <Address value={keypair.publicKey.toBase58()} label="player key" />
            </span>
          )}
          <span className="ml-auto font-mono text-sm tabular-nums" aria-live="polite">
            {balance === null ? "…" : sol(balance)} <span className="text-xs text-muted">SOL</span>
          </span>
          <button
            type="button"
            aria-expanded={showFunding}
            aria-controls="home-funding"
            onClick={() => setFundingOpen((v) => !v)}
            className={`btn-paper inline-flex h-9 items-center gap-1 rounded-xl px-3 text-sm font-medium ${focus}`}
          >
            Add or send SOL
            <ChevronDown className={`size-4 text-muted transition-transform ${showFunding ? "rotate-180" : ""}`} aria-hidden />
          </button>
        </div>
        {balance !== null && !funded && (
          <p className="mt-2 text-xs text-devnet">Add at least {sol(MIN_PLAY_LAMPORTS)} SOL to create or join a match.</p>
        )}
        {showFunding && (
          <div id="home-funding" className="mt-4">
            <FundingActions />
          </div>
        )}
      </div>
    </section>
  );
}
