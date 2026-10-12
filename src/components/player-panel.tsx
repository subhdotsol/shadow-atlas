"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ArrowDownToLine, ArrowUpFromLine, ExternalLink, KeyRound, Send, TriangleAlert } from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useState, type FormEvent } from "react";
import { FAUCET_URL, SEND_TO_PLAYER_LAMPORTS, sendToPlayer, MIN_PLAY_LAMPORTS, sol, topUp, TOP_UP_LAMPORTS, withdraw } from "@/lib/funding";
import { baseConnection } from "@/lib/program";
import { describeError, isUserRejection } from "@/lib/tx";
import { debugError, debugLog } from "@/lib/debug-log";
import { usePlayerKey } from "./player-key";
import { Address, Button, Skeleton } from "./ui";

type Busy = "top-up" | "withdraw" | "send" | null;

/** Devnet balance of the connected browser wallet, regardless of the network the wallet UI is set to. */
function useWalletDevnetBalance(tick: number) {
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<{ key: string; lamports: number } | null>(null);
  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    baseConnection()
      .getBalance(publicKey, "confirmed")
      .then((lamports) => !cancelled && setBalance({ key: publicKey.toBase58(), lamports }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [publicKey, tick]);
  return publicKey && balance?.key === publicKey.toBase58() ? balance.lamports : null;
}

/** The ways to move devnet SOL in or out of the player key: faucet, wallet top-up, withdraw. */
export function FundingActions() {
  const player = usePlayerKey();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);
  const walletBalance = useWalletDevnetBalance(tick);

  async function run(kind: Exclude<Busy, null>, fn: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    debugLog("funding", `${kind}: started`);
    try {
      await fn();
      debugLog("funding", `${kind}: done`);
    } catch (e) {
      debugError("funding", `${kind} failed`, e, { shown: describeError(e) });
      if (!isUserRejection(e)) setError(describeError(e));
    } finally {
      setBusy(null);
      player.refreshBalance();
      setTick((t) => t + 1);
    }
  }

  async function openFaucet() {
    if (!player.keypair) return;
    try {
      await navigator.clipboard.writeText(player.keypair.publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {
      // Clipboard blocked: the address is shown above to copy by hand.
    }
    window.open(FAUCET_URL, "_blank", "noopener,noreferrer");
  }

  const [sendTo, setSendTo] = useState("");
  const [sent, setSent] = useState(false);
  function send(e: FormEvent) {
    e.preventDefault();
    let to: PublicKey;
    try {
      to = new PublicKey(sendTo.trim());
    } catch {
      return setError("Paste the other player's player key address.");
    }
    setSent(false);
    void run("send", async () => {
      await sendToPlayer(player.keypair!, to);
      setSent(true);
      setSendTo("");
    });
  }

  if (!player.keypair) return null;
  const canSend = (player.balance ?? 0) >= SEND_TO_PLAYER_LAMPORTS + MIN_PLAY_LAMPORTS;
  const low = player.balance !== null && player.balance < MIN_PLAY_LAMPORTS;
  const walletShort = walletBalance !== null && walletBalance < TOP_UP_LAMPORTS + 5_000;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant={low ? "primary" : "secondary"} disabled={busy !== null} onClick={openFaucet}>
          <ExternalLink className="size-4" aria-hidden /> Get devnet SOL
        </Button>
        {wallet.publicKey ? (
          <>
            <Button
              variant="secondary"
              loading={busy === "top-up"}
              disabled={busy !== null || walletShort}
              onClick={() => run("top-up", () => topUp(wallet, player.keypair!.publicKey))}
            >
              <ArrowDownToLine className="size-4" aria-hidden /> Top up {sol(TOP_UP_LAMPORTS)} from wallet
            </Button>
            {(player.balance ?? 0) > 0 && (
              <Button
                variant="ghost"
                loading={busy === "withdraw"}
                disabled={busy !== null}
                onClick={() => run("withdraw", () => withdraw(player.keypair!, wallet.publicKey!))}
              >
                <ArrowUpFromLine className="size-4" aria-hidden /> Withdraw
              </Button>
            )}
          </>
        ) : (
          <Button variant="ghost" onClick={() => setVisible(true)}>
            Connect wallet to top up
          </Button>
        )}
      </div>
      {canSend && (
        <form onSubmit={send} noValidate className="rounded-2xl border border-border bg-surface-2/40 p-3">
          <label htmlFor="send-to-player" className="text-xs font-medium text-muted">
            Fund the other player: send {sol(SEND_TO_PLAYER_LAMPORTS)} SOL to their player key (no wallet needed)
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="send-to-player"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="Their player key address"
              value={sendTo}
              onChange={(e) => {
                setSendTo(e.target.value);
                setError(null);
                setSent(false);
              }}
              className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 font-mono text-xs placeholder:font-sans placeholder:text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <Button type="submit" variant="secondary" loading={busy === "send"} disabled={busy !== null || !sendTo.trim()}>
              <Send className="size-4" aria-hidden /> Send
            </Button>
          </div>
          {sent && (
            <p className="mt-2 text-xs text-success" role="status">
              Sent. Their balance updates in a few seconds.
            </p>
          )}
        </form>
      )}
      {low && (
        <p className="text-xs text-muted">
          No SOL? Copy your player key above and have the other player send you {sol(SEND_TO_PLAYER_LAMPORTS)} SOL from their player panel.
        </p>
      )}
      {copied && (
        <p className="text-xs text-success" role="status">
          Player address copied. Paste it into the faucet and request devnet SOL.
        </p>
      )}
      {wallet.publicKey && (
        <p className="font-mono text-xs tabular-nums text-muted">
          Wallet: {walletBalance === null ? "…" : sol(walletBalance)} devnet SOL
          {walletShort && <span className="font-sans"> · not enough to top up</span>}
        </p>
      )}
      {!player.persisted && (
        <p className="text-xs text-danger">This browser blocks storage: the key disappears when you close the tab. Withdraw before leaving.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Player key address, balance, and funding (the header pop-over and the match screen). */
export function PlayerPanel({ compact = false }: { compact?: boolean }) {
  const player = usePlayerKey();
  if (!player.keypair) return <Skeleton className="h-28 w-full" />;
  const low = player.balance !== null && player.balance < MIN_PLAY_LAMPORTS;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <KeyRound className="size-4 text-muted" aria-hidden /> Player key
          </p>
          <div className="-ml-2">
            <Address value={player.keypair.publicKey.toBase58()} label="player key" />
          </div>
        </div>
        <p className="pt-0.5 text-right font-mono text-lg tabular-nums" aria-live="polite">
          {player.balance === null ? "…" : sol(player.balance)} <span className="text-xs text-muted">SOL</span>
        </p>
      </div>
      {!compact && <p className="text-xs text-muted">Signs your moves from this browser, so play never needs a wallet prompt. Keep only game money on it.</p>}
      {low && (
        <p className="flex items-center gap-1.5 text-xs text-devnet">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden /> Needs at least {sol(MIN_PLAY_LAMPORTS)} SOL to create or join a match.
        </p>
      )}
      <FundingActions />
    </div>
  );
}

/** Header chip: player balance; opens the panel. */
export function PlayerChip() {
  const player = usePlayerKey();
  const [open, setOpen] = useState(false);
  if (!player.keypair) return <div className="h-10 w-28 animate-pulse rounded-lg bg-surface-2" aria-hidden />;
  const low = player.balance !== null && player.balance < MIN_PLAY_LAMPORTS;

  return (
    <div
      className="relative"
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="player-panel"
        onClick={() => setOpen((o) => !o)}
        className="btn-paper inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-xl px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <KeyRound className={`size-4 ${low ? "text-devnet" : "text-muted"}`} aria-hidden />
        {/* The amount is in the panel; on narrow screens the chip is just the key. */}
        <span className="hidden font-mono tabular-nums sm:inline">{player.balance === null ? "…" : sol(player.balance)}</span>
        <span className="sr-only">SOL on your player key. Open funding.</span>
      </button>
      {open && (
        <div id="player-panel" className="absolute right-0 top-12 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-4 shadow-lg">
          <PlayerPanel />
        </div>
      )}
    </div>
  );
}
