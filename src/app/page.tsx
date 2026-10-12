import { HomeActions } from "@/components/home-actions";
import { HowItWorks } from "@/components/how-it-works";
import { MonoPill } from "@/components/ui";

export default function Home() {
  return (
    <div className="flex-1">
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-14 text-center sm:px-6 sm:pt-20">
        <MonoPill connectors>Solana · MagicBlock private rollup</MonoPill>
        <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-semibold leading-[1.04] tracking-tight text-balance sm:text-6xl">
          Command the map. Keep your orders sealed.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted text-pretty">
          A two-player strategy game where both generals move at once, and neither sees the other&apos;s order until both are locked in.
        </p>
        <div className="mx-auto mt-12 max-w-4xl">
          <HomeActions />
        </div>
      </section>

      <HowItWorks />
    </div>
  );
}
