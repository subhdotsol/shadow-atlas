"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { PlayerChip } from "./player-panel";
import { ThemeToggle } from "./theme-toggle";

// The wallet button reads browser-only wallet state; render it on the client only.
const WalletMultiButton = dynamic(() => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton), {
  ssr: false,
  loading: () => <div className="h-10 w-36 animate-pulse rounded-xl bg-surface-2" aria-hidden />,
});

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          <span className="relative flex size-8 items-center justify-center overflow-hidden rounded-[10px] shadow-key" aria-hidden>
            <span className="absolute inset-y-0 left-0 w-1/2 bg-ember" />
            <span className="absolute inset-y-0 right-0 w-1/2 bg-tide" />
            <span className="relative size-2.5 rounded-full bg-surface" />
          </span>
          <span className="hidden text-[17px] font-semibold tracking-tight min-[420px]:inline">Shadow Atlas</span>
          <span className="sr-only min-[420px]:hidden">Shadow Atlas</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-2.5">
          <span className="hidden items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-devnet shadow-card sm:inline-flex">
            <span className="size-1.5 rounded-full bg-devnet" aria-hidden />
            Devnet
          </span>
          <ThemeToggle />
          <PlayerChip />
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
