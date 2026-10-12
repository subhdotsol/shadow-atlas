/** Spec-sheet rulers down both page margins, as in the brand reference. Decorative only. */
const MARKS = Array.from({ length: 20 }, (_, i) => i * 50);

function Rail({ side }: { side: "left" | "right" }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-y-0 z-0 hidden w-14 xl:block ${
        side === "left" ? "left-0 border-r" : "right-0 border-l"
      } border-border/70`}
    >
      <div className="absolute inset-x-0 top-28 flex flex-col">
        {MARKS.map((mark) => (
          <div key={mark} className={`flex h-[50px] items-start gap-1.5 ${side === "left" ? "justify-end pr-2" : "flex-row-reverse justify-end pl-2"}`}>
            <span className="origin-center -translate-y-1.5 rotate-90 font-mono text-[10px] text-faint">{mark}</span>
            <span className="mt-px h-px w-2 bg-faint" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Rails() {
  return (
    <>
      <Rail side="left" />
      <Rail side="right" />
    </>
  );
}
