"use client";

import { actionFrom, actionTo, actionTroops, EDGES, orderOf, OWNER_A, OWNER_B, TERRITORIES, TROOPS_PER_TURN, type Action, type Board, type Side } from "@/lib/game";
import { arcMidPercent, arcPath, COUNTRY_SHAPES, REGION_PERCENT, REGION_POINTS, VIEW } from "@/lib/world";
import { Crosshair, ShieldPlus, Swords, User, Users, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { FACTION } from "./ui";

type Arrow = { from: number; to: number; side: Side; troops: number; kind: "attack" | "reinforce"; dashed: boolean };

function arrowOf(action: Action | null | undefined, side: Side, dashed = false): Arrow[] {
  // A hold sends nobody anywhere: no arrow.
  action = orderOf(action);
  if (!action) return [];
  return [{ from: actionFrom(action), to: actionTo(action), side, troops: actionTroops(action), kind: "attack" in action ? "attack" : "reinforce", dashed }];
}

const owner = (board: Board, t: number) => board.owner[t];
const factionColor = (side: Side) => (side === "A" ? "var(--ember)" : "var(--tide)");

function useMedia(query: string, serverValue: boolean) {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const useReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)", true);
/** Wide enough for cards to float on the map; below this they sit under it. */
export const useWideScreen = () => useMedia("(min-width: 1024px)", true);

/** The map's width over its height, for sizing it to the screen. */
export const MAP_ASPECT = VIEW.width / VIEW.height;

const CARD = { width: 224, height: 215, gap: 44 };
const TILE = 64; // a tile with its label, in px

/**
 * Where the order card goes: beside, above or below the target, whichever stays on the map,
 * never covers the attacker or the target, and covers the fewest other tiles. `width` is the map's rendered width in px.
 */
function besideTarget(from: number, to: number, width: number): CSSProperties {
  const height = width / MAP_ASPECT;
  const px = (t: number) => ({ x: (REGION_PERCENT[t].x / 100) * width, y: (REGION_PERCENT[t].y / 100) * height });
  const target = px(to);
  const candidates = [
    { x: target.x + CARD.gap, y: target.y - CARD.height / 2 },
    { x: target.x - CARD.gap - CARD.width, y: target.y - CARD.height / 2 },
    { x: target.x - CARD.width / 2, y: target.y + CARD.gap },
    { x: target.x - CARD.width / 2, y: target.y - CARD.gap - CARD.height },
  ].map((c) => {
    // Keep it on the map, then count the tiles it would cover.
    const x = Math.min(Math.max(c.x, 8), width - CARD.width - 8);
    const y = Math.min(Math.max(c.y, 8), height - CARD.height - 8);
    const shift = Math.abs(x - c.x) + Math.abs(y - c.y);
    const covers = (t: number) => {
      const p = px(t);
      return p.x + TILE / 2 > x && p.x - TILE / 2 < x + CARD.width && p.y + TILE / 2 > y && p.y - TILE / 2 < y + CARD.height;
    };
    // Never cover the move itself; otherwise cover as few other tiles as possible.
    const covered = TERRITORIES.filter((_, t) => covers(t)).length;
    const blocksMove = covers(from) || covers(to);
    return { x, y, score: (blocksMove ? 100_000 : 0) + covered * 1000 + shift };
  });
  const best = candidates.reduce((a, b) => (b.score < a.score ? b : a));
  return { left: best.x, top: best.y };
}

/**
 * The board, drawn on a real world map (Natural Earth, via world-atlas + d3-geo). Countries
 * take the colour of whoever holds their region; each region's troops sit in a key tile
 * (a real <button>) on top. Dashed arcs are the borders the contract allows moves across.
 *
 * Layers, bottom to top: countries and borders, move arrows, tiles, marching troop tokens,
 * tile tags (From here / Attack / Move here), then the floating cards. Tokens carry the
 * troop count and fade out as they reach a tile, so they never hide its number.
 */
export function WorldMap({
  board,
  mySide,
  selectable,
  source,
  targets,
  attackable = new Set(),
  dest = null,
  connected = new Set(),
  order,
  reveal,
  mustered = false,
  popover,
  overlay,
  hint,
  changes,
  onCancel,
  onSelect,
}: {
  board: Board;
  mySide: Side | null;
  /** Territories the player can click right now. */
  selectable: Set<number>;
  /** The selected territory. */
  source: number | null;
  /** Legal destinations for a move from `source`: clicking one picks it. */
  targets: Set<number>;
  /** The subset of `targets` that would be attacked (the rest receive a transfer). */
  attackable?: Set<number>;
  /** The destination already picked, if any. */
  dest?: number | null;
  /** Territories bordering the selection, highlighted on the map. */
  connected?: Set<number>;
  /** The move being composed or already committed, drawn dashed in my colour. */
  order: Action | null;
  /** Last resolved turn, drawn solid in each faction's colour. */
  reveal: { actionA: Action; actionB: Action } | null;
  /** Show the troop each held territory raised at the end of the last turn. */
  mustered?: boolean;
  /** The order card, floated beside `dest` on wide screens and placed under the map otherwise. */
  popover?: ReactNode;
  /** A status card (committed, turn result), in the map's empty South Pacific corner on wide screens. */
  overlay?: ReactNode;
  /** A short instruction pinned to the top of the map. */
  hint?: string | null;
  /** After a reveal: each tile's change in the fight (before new troops), and captures. */
  changes?: Map<number, { battle: number; captured: boolean }>;
  /** Clears the selection: offered in the hint, and on a click on empty map. */
  onCancel?: () => void;
  onSelect: (territory: number) => void;
}) {
  const reducedMotion = useReducedMotion();
  const wide = useWideScreen();
  const arrows = [
    ...(reveal ? [...arrowOf(reveal.actionA, "A"), ...arrowOf(reveal.actionB, "B")] : []),
    ...(mySide ? arrowOf(order, mySide, true) : []),
  ];

  const regionFill = (region: number | null) => {
    if (region === null) return "var(--land-unclaimed)";
    const owner = board.owner[region];
    return owner === OWNER_A ? "var(--ember)" : owner === OWNER_B ? "var(--tide)" : "var(--land)";
  };
  const regionOpacity = (region: number | null) => {
    if (region === null) return 1;
    if (region === source || targets.has(region)) return 1;
    // With a selection, everything not connected to it steps back.
    if (source !== null && !connected.has(region)) return 0.4;
    return board.owner[region] === OWNER_A || board.owner[region] === OWNER_B ? 0.78 : 1;
  };

  const tiles = TERRITORIES.map((t, i) => {
    const owner = board.owner[i];
    const ownerSide: Side | null = owner === OWNER_A ? "A" : owner === OWNER_B ? "B" : null;
    const isSource = source === i;
    const isTarget = targets.has(i);
    return {
      t,
      i,
      ownerSide,
      isSource,
      isTarget,
      isAttack: isTarget && attackable.has(i),
      isConnected: connected.has(i),
      // With a selection, tiles that can't be reached from it step back.
      faded: source !== null && !isSource && !isTarget && !connected.has(i),
      at: REGION_PERCENT[i],
    };
  });

  // The map's rendered width, for placing the order card in pixels.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // My order, previewed on its tiles: what leaves, and what arrives or attacks.
  const mine = orderOf(order);
  const pending = mySide && mine ? { from: actionFrom(mine), to: actionTo(mine), troops: actionTroops(mine), attack: "attack" in mine } : null;
  const chips = (i: number): { label: string; tone: string }[] => {
    const out: { label: string; tone: string }[] = [];
    if (pending?.from === i) out.push({ label: `−${pending.troops} leaving`, tone: "bg-surface text-foreground ring-1 ring-border" });
    if (pending?.to === i) out.push(pending.attack ? { label: `⚔ ${pending.troops} incoming`, tone: "bg-danger text-background" } : { label: `+${pending.troops} arriving`, tone: "bg-foreground text-background" });
    const change = changes?.get(i);
    if (change?.captured) out.push({ label: "Captured", tone: "bg-danger text-background" });
    else if (change && change.battle !== 0)
      out.push({ label: `${change.battle > 0 ? "+" : "−"}${Math.abs(change.battle)} this turn`, tone: change.battle > 0 ? "bg-surface text-success ring-1 ring-success/60" : "bg-surface text-danger ring-1 ring-danger/60" });
    return out;
  };

  const floating = wide && popover && source !== null && dest !== null && width > 0;

  return (
    <div className="space-y-3">
      {/* A world map is wide: on small screens the board scrolls sideways inside its card. */}
      <div className="overflow-x-auto rounded-3xl border border-border bg-surface shadow-card lg:overflow-visible">
        <div
          ref={box}
          className="relative min-w-[620px] lg:min-w-0"
          style={{ aspectRatio: `${VIEW.width} / ${VIEW.height}` }}
          // A click on empty map (not a tile or a card) clears the selection.
          onClick={(e) => {
            if (onCancel && !(e.target as Element).closest("button, [data-map-ui]")) onCancel();
          }}
        >
          <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`} className="absolute inset-0 size-full rounded-3xl" aria-hidden>
            <defs>
              {(["A", "B"] as const).map((side) => (
                <marker key={side} id={`arrow-${side}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill={factionColor(side)} />
                </marker>
              ))}
              {(["A", "B"] as const).map((side) => (
                <marker key={`dot-${side}`} id={`dot-${side}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4">
                  <circle cx="5" cy="5" r="4" fill={factionColor(side)} />
                </marker>
              ))}
            </defs>

            {/* No fill transitions: animating ~170 country paths on every click made selection lag. */}
            <g stroke="var(--surface)" strokeWidth={0.6} strokeLinejoin="round">
              {COUNTRY_SHAPES.map((c) => (
                <path key={c.key} d={c.d} fill={regionFill(c.region)} fillOpacity={regionOpacity(c.region)} />
              ))}
            </g>

            {EDGES.map(([a, b]) => {
              const lit = source !== null && (a === source || b === source);
              return (
                <path
                  key={`${a}-${b}`}
                  d={arcPath(a, b)}
                  fill="none"
                  stroke="var(--foreground)"
                  strokeOpacity={lit ? 0.7 : 0.28}
                  strokeWidth={lit ? 1.8 : 1.2}
                  strokeDasharray="4 5"
                />
              );
            })}

            {arrows.map((arrow, i) => (
              <path
                key={`arrow-${i}`}
                d={arcPath(arrow.from, arrow.to)}
                fill="none"
                stroke={factionColor(arrow.side)}
                strokeWidth={arrow.dashed ? 3 : 4}
                strokeDasharray={arrow.dashed ? "8 6" : arrow.kind === "reinforce" ? "2 5" : undefined}
                strokeLinecap="round"
                markerEnd={arrow.kind === "attack" ? `url(#arrow-${arrow.side})` : `url(#dot-${arrow.side})`}
                opacity={arrow.dashed ? 0.95 : 0.85}
              />
            ))}

            {/* Soft halo under each tile so it reads against busy coastlines. */}
            {REGION_POINTS.map(([x, y], i) => (
              <circle key={`halo-${i}`} cx={x} cy={y} r={30} fill="var(--surface)" opacity={0.35} />
            ))}
          </svg>

          {tiles.map(({ t, i, ownerSide, isSource, isTarget, isAttack, isConnected, faded, at }) => {
            const tone =
              ownerSide === "A" ? "bg-ember text-on-ember" : ownerSide === "B" ? "bg-tide text-on-tide" : "border border-border bg-neutral text-on-neutral";
            const enabled = selectable.has(i) || isTarget;
            const holder = ownerSide ? `held by ${FACTION[ownerSide]}${ownerSide === mySide ? " (you)" : ""}` : "unclaimed";
            const hint = isTarget ? (isAttack ? ", attack target" : ", move troops here") : isSource ? ", selected" : isConnected ? ", connected" : "";
            return (
              <div
                key={t.name}
                className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 ${faded ? "opacity-45" : ""} ${isSource || isTarget ? "z-20" : "z-10"}`}
                style={{ left: `${at.x}%`, top: `${at.y}%` }}
              >
                <button
                  type="button"
                  disabled={!enabled}
                  onClick={() => onSelect(i)}
                  aria-pressed={isSource}
                  aria-label={`${t.name}, ${holder}, ${board.strength[i]} troops${hint}`}
                  className={[
                    "relative flex size-11 items-center justify-center rounded-xl font-mono text-lg font-semibold tabular-nums shadow-key transition-transform duration-100 motion-reduce:transition-none sm:size-12 xl:size-14 xl:text-xl",
                    tone,
                    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
                    enabled ? "cursor-pointer hover:-translate-y-0.5 active:translate-y-0" : "cursor-default",
                    isSource ? "-translate-y-0.5 ring-4 ring-foreground/40" : "",
                    isTarget
                      ? `outline-2 outline-offset-4 ${dest === i ? "outline-solid" : "outline-dashed"} ${isAttack ? "outline-danger" : "outline-foreground/70"}`
                      : isConnected
                        ? "ring-2 ring-foreground/30 ring-offset-2 ring-offset-surface"
                        : "",
                  ].join(" ")}
                >
                  <span className="flex flex-col items-center leading-none">
                    <Users className="size-3 opacity-70 xl:size-3.5" aria-hidden />
                    {/* Keyed on the value, so a changed count pops when a turn lands. */}
                    <span key={`${owner(board, i)}-${board.strength[i]}`} className="mt-0.5 motion-safe:animate-[pop_350ms_ease-out]">
                      {board.strength[i]}
                    </span>
                  </span>
                  {ownerSide !== null && ownerSide === mySide && (
                    <span className="pointer-events-none absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-foreground text-background shadow-sm ring-2 ring-surface" aria-hidden>
                      <User className="size-3" aria-hidden />
                    </span>
                  )}
                  {mustered && ownerSide && (
                    <span className="pointer-events-none absolute -bottom-2 -right-2 rounded-md bg-surface px-1 font-mono text-[10px] font-semibold leading-4 text-foreground shadow-sm ring-1 ring-border" aria-hidden>
                      +{TROOPS_PER_TURN}
                    </span>
                  )}
                </button>
                <span className="whitespace-nowrap rounded-md bg-surface/85 px-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-foreground/80 shadow-sm">
                  {t.name}
                </span>
                {chips(i).length > 0 && (
                  <span className="pointer-events-none flex flex-col items-center gap-0.5" aria-hidden>
                    {chips(i).map((c) => (
                      <span key={c.label} className={`whitespace-nowrap rounded-md px-1.5 py-px text-[10px] font-semibold leading-4 shadow-sm ${c.tone}`}>
                        {c.label}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            );
          })}

          {/* Reduced motion: no marching tokens, so each move's count sits halfway along its arrow. */}
          {reducedMotion &&
            arrows.map((arrow, i) => {
              const at = arcMidPercent(arrow.from, arrow.to);
              const shared = arrows.slice(0, i).some((o) => (o.from === arrow.from && o.to === arrow.to) || (o.from === arrow.to && o.to === arrow.from));
              const Icon = arrow.kind === "attack" ? Swords : ShieldPlus;
              return (
                <span
                  key={`troops-${i}`}
                  className={`pointer-events-none absolute z-[25] inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 font-mono text-sm font-semibold tabular-nums shadow-key ring-2 ring-surface ${
                    shared ? "translate-y-[35%]" : "-translate-y-1/2"
                  } ${arrow.side === "A" ? "bg-ember text-on-ember" : "bg-tide text-on-tide"}`}
                  style={{ left: `${at.x}%`, top: `${at.y}%` }}
                  aria-hidden
                >
                  <Icon className="size-4" aria-hidden />
                  {arrow.kind === "attack" ? arrow.troops : `+${arrow.troops}`}
                </span>
              );
            })}

          {/* Troops on the move: a token carrying the count leaves the source tile and fades out
              as it reaches the destination, then goes again. */}
          {!reducedMotion && arrows.length > 0 && (
            <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`} className="pointer-events-none absolute inset-0 z-[25] size-full" aria-hidden>
              {arrows.map((arrow, i) => (
                <g key={`march-${arrow.from}-${arrow.to}-${arrow.side}-${arrow.troops}-${i}`} opacity={0}>
                  <circle r={12} fill={factionColor(arrow.side)} stroke="var(--surface)" strokeWidth={2} />
                  {arrow.kind === "attack" && <circle r={15} fill="none" stroke={factionColor(arrow.side)} strokeWidth={1.5} opacity={0.6} />}
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={12}
                    fontWeight={700}
                    fontFamily="var(--font-mono)"
                    fill={arrow.side === "A" ? "var(--on-ember)" : "var(--on-tide)"}
                  >
                    {arrow.troops}
                  </text>
                  <animateMotion dur="1.6s" repeatCount="indefinite" path={arcPath(arrow.from, arrow.to)} keyPoints="0;1;1" keyTimes="0;0.8;1" calcMode="linear" />
                  <animate attributeName="opacity" dur="1.6s" repeatCount="indefinite" values="0;1;1;0;0" keyTimes="0;0.12;0.62;0.78;1" />
                </g>
              ))}
            </svg>
          )}

          {/* Tile tags sit above everything on the map except the cards. */}
          {tiles.map(({ i, isSource, isTarget, isAttack, at }) => {
            const tag = isSource
              ? { label: "From here", Icon: null, tone: "bg-foreground text-background" }
              : isTarget
                ? isAttack
                  ? { label: dest === i ? "Attacking" : "Attack", Icon: Crosshair, tone: dest === i ? "bg-danger text-background" : "bg-surface text-danger ring-1 ring-danger/70" }
                  : { label: dest === i ? "Moving here" : "Move here", Icon: ShieldPlus, tone: dest === i ? "bg-foreground text-background" : "bg-surface text-foreground ring-1 ring-border" }
                : null;
            if (!tag) return null;
            return (
              <span
                key={`tag-${i}`}
                className={`pointer-events-none absolute z-30 inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold shadow-sm ${tag.tone}`}
                style={{ left: `${at.x}%`, top: `${at.y}%`, transform: "translate(-50%, calc(-100% - 1.85rem))" }}
                aria-hidden
              >
                {tag.Icon && <tag.Icon className="size-3" aria-hidden />}
                {tag.label}
              </span>
            );
          })}

          {floating && (
            <div data-map-ui className="absolute z-40 w-56" style={besideTarget(source, dest, width)}>
              {popover}
            </div>
          )}
          {wide && overlay && (
            <div data-map-ui className="absolute bottom-3 left-3 z-40 w-64">
              {overlay}
            </div>
          )}
          {hint && (
            <div data-map-ui className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-foreground py-1 pl-3 pr-1 text-xs font-medium text-background shadow-float">
              <span aria-live="polite" className={source === null ? "pr-2" : ""}>
                {hint}
              </span>
              {source !== null && onCancel && (
                <button type="button" onClick={onCancel} className="inline-flex h-6 items-center gap-1 rounded-full bg-background/15 px-2 hover:bg-background/25 focus-visible:outline-2 focus-visible:outline-ring">
                  <X className="size-3" aria-hidden /> Cancel
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Small screens: the cards sit under the map instead of on it. */}
      {!wide && popover && dest !== null && popover}
      {!wide && overlay}
    </div>
  );
}
