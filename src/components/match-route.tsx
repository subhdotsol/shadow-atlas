"use client";

import Link from "next/link";
import { use, useMemo } from "react";
import { parseMatchRef } from "@/lib/program";
import { MatchView } from "./match-view";

export function MatchRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const address = useMemo(() => parseMatchRef(decodeURIComponent(id))?.address ?? null, [id]);

  if (!address) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">That isn&apos;t a room code</h1>
        <p className="mt-2 text-sm text-muted">Room codes are 6 letters and numbers, like K7Q2XM. Check it with your opponent.</p>
        <Link
          href="/"
          className="btn-graphite mt-6 inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Back to the lobby
        </Link>
      </div>
    );
  }
  return <MatchView key={address.toBase58()} address={address} />;
}
