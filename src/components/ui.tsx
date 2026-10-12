"use client";

import { Check, Copy, ExternalLink, LoaderCircle } from "lucide-react";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { explorerUrl } from "@/lib/config";
import { shortAddress } from "@/lib/program";

export const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type Variant = "primary" | "secondary" | "ghost" | "tide" | "danger";
const variants: Record<Variant, string> = {
  /** Graphite, the reference's dark "Subscribe" button. */
  primary: "btn-graphite",
  /** White key with a hairline. */
  secondary: "btn-paper",
  ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
  /** Blue with a soft glow, the reference's call-to-action. */
  tide: "btn-tide",
  danger: "btn-paper !text-danger",
};

export function Button({
  variant = "primary",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-[background,transform,opacity] duration-150 active:not-disabled:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 ${focus} ${variants[variant]} ${className}`}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** White floating card. `title` renders as a small mono annotation. */
export function Card({ title, children, className = "", action }: { title?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`rounded-3xl border border-border bg-surface p-6 shadow-card ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-surface-2 ${className}`} aria-hidden />;
}

/** Grey rounded bar used inside illustrations, like the reference's placeholder lines. */
export function SkeletonPill({ className = "" }: { className?: string }) {
  return <span className={`block h-2.5 rounded-full bg-surface-2 ${className}`} aria-hidden />;
}

/** "HOW IT WORKS"-style mono pill, with hairline connectors on both sides. */
export function MonoPill({ children, connectors = false }: { children: ReactNode; connectors?: boolean }) {
  const node = <span className="size-1.5 rounded-[2px] border border-faint bg-surface" />;
  return (
    <div className="flex items-center justify-center gap-3">
      {connectors && (
        <span className="hidden items-center sm:flex" aria-hidden>
          <span className="h-px w-24 bg-gradient-to-r from-transparent to-faint" />
          {node}
        </span>
      )}
      <span className="rounded-xl border border-border bg-surface px-3.5 py-1.5 font-mono text-xs uppercase tracking-[0.14em] text-muted shadow-card">
        {children}
      </span>
      {connectors && (
        <span className="hidden items-center sm:flex" aria-hidden>
          {node}
          <span className="h-px w-24 bg-gradient-to-l from-transparent to-faint" />
        </span>
      )}
    </div>
  );
}

/** "Step 1" annotation with a hand-drawn curved arrow. */
export function StepLabel({ children, arrow = "down-right", className = "" }: { children: ReactNode; arrow?: "down-right" | "down-left" | "up-right"; className?: string }) {
  const paths = {
    "down-right": "M2 6 C 22 2, 34 10, 34 30 M28 24 L34 31 L40 24",
    "down-left": "M40 6 C 20 2, 8 10, 8 30 M2 24 L8 31 L14 24",
    "up-right": "M2 30 C 22 32, 34 24, 34 4 M28 10 L34 3 L40 10",
  } as const;
  const svg = (
    <svg viewBox="0 0 42 34" className="h-8 w-10 text-faint" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[arrow]} />
    </svg>
  );
  return (
    <span className={`inline-flex items-end gap-1.5 font-mono text-sm text-muted ${className}`}>
      {arrow === "down-left" && svg}
      <span className="pb-1">{children}</span>
      {arrow !== "down-left" && svg}
    </span>
  );
}

/** Keyboard-key tile, like the reference's A / B / C. */
export function KeyTile({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "ember" | "tide";
  className?: string;
}) {
  const tones = {
    neutral: "bg-surface text-on-neutral border border-border",
    ember: "bg-ember text-on-ember",
    tide: "bg-tide text-on-tide",
  };
  return (
    <span className={`inline-flex size-12 items-center justify-center rounded-2xl text-lg font-semibold shadow-key ${tones[tone]} ${className}`} aria-hidden>
      {children}
    </span>
  );
}

/** Dark "You" tooltip with a pointer, pinned to the corner of a tile. */
export function YouTag({ label = "You", className = "" }: { label?: string; className?: string }) {
  return (
    <span className={`pointer-events-none absolute flex items-center gap-1 ${className}`} aria-hidden>
      <svg viewBox="0 0 12 14" className="size-3 -rotate-12 text-foreground" fill="currentColor">
        <path d="M1 1 L11 7 L6 8 L4 13 Z" stroke="var(--surface)" strokeWidth="1" />
      </svg>
      <span className="rounded-lg bg-foreground px-2 py-0.5 text-xs font-medium text-background shadow-float">{label}</span>
    </span>
  );
}

/** Monospace address with copy and an explorer link. */
export function Address({ value, kind = "address", label }: { value: string; kind?: "address" | "tx"; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the explorer link still works.
    }
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={copy}
        title={value}
        aria-label={`Copy ${label ?? kind} ${value}`}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 font-mono text-sm tabular-nums text-foreground hover:bg-surface-2 ${focus}`}
      >
        {shortAddress(value)}
        {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5 text-muted" aria-hidden />}
        <span className="sr-only" aria-live="polite">
          {copied ? "Copied" : ""}
        </span>
      </button>
      <a
        href={explorerUrl(kind, value)}
        target="_blank"
        rel="noreferrer"
        aria-label={`View ${label ?? kind} on Solana Explorer`}
        className={`inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground ${focus}`}
      >
        <ExternalLink className="size-3.5" aria-hidden />
      </a>
    </span>
  );
}

export function FactionDot({ side, className = "" }: { side: "A" | "B"; className?: string }) {
  return <span aria-hidden className={`inline-block size-2.5 rounded-full ${side === "A" ? "bg-ember" : "bg-tide"} ${className}`} />;
}

export const FACTION = { A: "Ember", B: "Tide" } as const;
