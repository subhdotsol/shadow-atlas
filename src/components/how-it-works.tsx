import { Check, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { KeyTile, MonoPill, SkeletonPill, StepLabel, YouTag } from "./ui";

function StepCard({ title, children, body }: { title: string; children: ReactNode; body: string }) {
  return (
    <article className="flex h-full flex-col rounded-3xl border border-border bg-surface p-6 text-center shadow-card">
      <h3 className="text-[17px] font-medium tracking-tight">{title}</h3>
      <div className="relative mb-4 mt-6 flex h-60 items-center justify-center" aria-hidden>
        {children}
      </div>
      <p className="mx-auto mt-auto max-w-[17rem] text-[15px] leading-relaxed text-muted text-pretty">{body}</p>
    </article>
  );
}

/** Mark used inside the illustrations, standing in for the reference's logo glyph. */
function Glyph({ className = "" }: { className?: string }) {
  return (
    <span className={`relative inline-flex size-6 overflow-hidden rounded-md opacity-25 ${className}`}>
      <span className="absolute inset-y-0 left-0 w-1/2 bg-foreground" />
      <span className="absolute inset-y-0 right-0 w-1/2 bg-muted" />
    </span>
  );
}

function OpenMatchArt() {
  return (
    <div className="relative -mt-4 flex w-full flex-col items-center">
      <div className="relative z-10 w-44 rounded-2xl border border-border bg-surface p-3.5 shadow-float">
        <div className="flex items-center gap-2.5">
          <Glyph />
          <SkeletonPill className="flex-1" />
        </div>
        <span className="btn-graphite mt-3 flex h-8 items-center justify-center rounded-lg text-xs font-medium">Create match</span>
      </div>
      <svg viewBox="0 0 240 70" className="-mt-1 h-16 w-60 text-faint" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 4">
        <path d="M120 0 V70" />
        <path d="M104 0 C104 30, 50 22, 50 42 V70" />
        <path d="M136 0 C136 30, 190 22, 190 42 V70" />
      </svg>
      <div className="relative flex items-center gap-7">
        <span className="absolute -left-12 top-1/2 flex -translate-y-1/2 items-center gap-1">
          <span className="h-px w-6 border-t border-dashed border-faint" />
          <span className="size-1.5 rounded-[2px] border border-faint bg-surface" />
        </span>
        <KeyTile>2</KeyTile>
        <span className="relative">
          <KeyTile tone="ember" className="ring-4 ring-ember/15">E</KeyTile>
          <YouTag className="-bottom-5 left-8" />
        </span>
        <KeyTile tone="tide">T</KeyTile>
        <span className="absolute -right-12 top-1/2 flex -translate-y-1/2 items-center gap-1">
          <span className="size-1.5 rounded-[2px] border border-faint bg-surface" />
          <span className="h-px w-6 border-t border-dashed border-faint" />
        </span>
      </div>
    </div>
  );
}

function Avatar({ tone, children }: { tone: "ember" | "tide"; children?: ReactNode }) {
  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold shadow-key ${
        tone === "ember" ? "bg-ember text-on-ember" : "bg-tide text-on-tide"
      }`}
    >
      {children}
    </span>
  );
}

function Bubble({ className = "", children }: { className?: string; children?: ReactNode }) {
  return (
    <span className={`flex h-9 items-center gap-2 rounded-full border border-border bg-surface px-4 shadow-card ${className}`}>{children}</span>
  );
}

function SealedOrdersArt() {
  return (
    <div className="flex w-full max-w-64 flex-col gap-3">
      <div className="flex items-center justify-end gap-2.5">
        <Bubble>
          <SkeletonPill className="w-12" />
        </Bubble>
        <Avatar tone="ember">E</Avatar>
      </div>
      <div className="flex items-center gap-2.5">
        <Avatar tone="tide">T</Avatar>
        <Bubble className="flex-1">
          <SkeletonPill className="flex-1" />
        </Bubble>
      </div>
      <div className="flex items-center justify-end gap-2.5">
        <Bubble className="px-3">
          <Lock className="size-3.5 text-muted" />
        </Bubble>
        <Avatar tone="ember">E</Avatar>
      </div>
      <span className="btn-tide mx-auto mt-2 inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-medium">
        <Lock className="size-4" /> Order sealed
      </span>
    </div>
  );
}

function RevealArt() {
  return (
    <div className="relative flex size-full items-center justify-center">
      <span className="absolute size-56 rounded-full border border-border/70" />
      <span className="absolute size-40 rounded-full border border-border/50" />
      <div className="relative h-40 w-32">
        <span className="absolute inset-0 -translate-x-8 translate-y-3 -rotate-12 rounded-xl border border-border bg-surface-2 shadow-card" />
        <span className="absolute inset-0 translate-x-8 translate-y-3 rotate-12 rounded-xl border border-border bg-surface-2 shadow-card" />
        <div className="absolute inset-0 overflow-hidden rounded-xl border border-border bg-surface p-4 text-left shadow-float">
          <span className="absolute right-0 top-0 size-7 rounded-bl-xl border-b border-l border-border bg-surface-2" />
          <SkeletonPill className="mt-5 w-12" />
          <SkeletonPill className="mt-2.5 w-20" />
          <div className="mt-4 flex gap-1.5">
            <span className="size-3 rounded-[4px] bg-ember" />
            <span className="size-3 rounded-[4px] bg-ember" />
            <span className="size-3 rounded-[4px] bg-tide" />
          </div>
        </div>
        <span className="absolute -bottom-4 left-1/2 flex size-10 -translate-x-1/2 items-center justify-center rounded-full bg-success text-on-success shadow-[0_8px_20px_-6px_var(--success)] ring-4 ring-surface">
          <Check className="size-5" strokeWidth={3} />
        </span>
      </div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-6" aria-labelledby="how-heading">
      <MonoPill connectors>How it works</MonoPill>
      <h2 id="how-heading" className="mt-5 text-center text-4xl font-semibold tracking-tight sm:text-5xl">
        Sealed &amp; simultaneous
      </h2>

      <div className="mt-6 hidden justify-between px-[8%] lg:flex" aria-hidden>
        <StepLabel arrow="down-right">Step 1</StepLabel>
        <StepLabel arrow="down-left">Step 3</StepLabel>
      </div>

      <div className="mt-8 grid gap-6 lg:mt-2 lg:grid-cols-3 lg:gap-5">
        <div>
          <StepLabel arrow="down-right" className="mb-2 lg:hidden">
            Step 1
          </StepLabel>
          <StepCard title="Open a match" body="Create a match and share the link. You command Ember; your rival joins as Tide.">
            <OpenMatchArt />
          </StepCard>
        </div>
        <div>
          <StepLabel arrow="down-right" className="mb-2 lg:hidden">
            Step 2
          </StepLabel>
          <StepCard title="Seal your orders" body="Both generals choose in private. The rollup keeps each order unreadable to the other until both are in.">
            <SealedOrdersArt />
          </StepCard>
        </div>
        <div>
          <StepLabel arrow="down-right" className="mb-2 lg:hidden">
            Step 3
          </StepLabel>
          <StepCard title="Reveal & settle" body="Both orders resolve at the same moment, and the final result settles on Solana.">
            <RevealArt />
          </StepCard>
        </div>
      </div>

      <div className="mt-6 hidden justify-center lg:flex" aria-hidden>
        <StepLabel arrow="up-right" className="-ml-24">
          Step 2
        </StepLabel>
      </div>
    </section>
  );
}
