import { Suspense } from "react";
import { MatchRoute } from "@/components/match-route";

export default function MatchPage({ params }: PageProps<"/match/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6" aria-label="Loading match">
          <div className="h-10 w-56 animate-pulse rounded-lg bg-surface-2" />
        </div>
      }
    >
      <MatchRoute params={params} />
    </Suspense>
  );
}
