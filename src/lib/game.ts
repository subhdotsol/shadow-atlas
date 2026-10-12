/**
 * Client mirror of the on-chain rules (programs/shadow-atlas/src/state/board.rs).
 * Used only to guide the UI. The program re-validates everything.
 */
import { MAX_TURNS, WIN_TERRITORIES } from "./config";

export type Side = "A" | "B";
export type Owner = 0 | 1 | 2;
export const OWNER_NONE = 0;
export const OWNER_A = 1;
export const OWNER_B = 2;

export type Board = { owner: number[]; strength: number[] };
/** An order a player gives: an attack or a transfer. */
export type Order = { attack: { from: number; target: number; troops: number } } | { reinforce: { from: number; to: number; troops: number } };
/** What a turn records for each player: their order, or a hold when they missed the turn clock. */
export type Action = Order | { hold: Record<string, never> };

export const HOLD: Action = { hold: {} };
export const isHold = (action: Action): action is { hold: Record<string, never> } => "hold" in action;
/** The order inside an action, or null for a hold. */
export const orderOf = (action: Action | null | undefined): Order | null => (action && !isHold(action) ? action : null);

export const MAX_STRENGTH = 30;
/** New troops on every held territory at the end of each turn (constants.rs TROOPS_PER_TURN). */
export const TROOPS_PER_TURN = 1;

/** Bit j of ADJACENCY[i] is set when territory i borders j (constants.rs). */
const ADJACENCY = [0b0001_0010, 0b0010_0101, 0b1010_0010, 0b1100_0000, 0b0010_0001, 0b0101_0110, 0b0010_1000, 0b0000_1100];

/** Territory names, by contract index. Countries are grouped into these regions in world.ts. */
export const TERRITORIES = [
  { name: "North America" },
  { name: "Europe" },
  { name: "Middle East" },
  { name: "East Asia" },
  { name: "South America" },
  { name: "North Africa" },
  { name: "South Africa" },
  { name: "India" },
] as const;

/** The fair start: 4 territories and 10 troops each (START_OWNER / START_TROOPS). */
export const INITIAL_BOARD: Board = {
  owner: [OWNER_A, OWNER_B, OWNER_B, OWNER_B, OWNER_A, OWNER_A, OWNER_A, OWNER_B],
  strength: [3, 4, 2, 3, 2, 2, 3, 1],
};

/** Each border once, for drawing. */
export const EDGES: [number, number][] = [];
for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if (ADJACENCY[i] & (1 << j)) EDGES.push([i, j]);

export function isAdjacent(a: number, b: number) {
  return a >= 0 && a < 8 && b >= 0 && b < 8 && (ADJACENCY[a] & (1 << b)) !== 0;
}

/** Territories bordering `t`. */
export function neighbours(t: number) {
  return [...Array(8).keys()].filter((n) => isAdjacent(t, n));
}

export const ownerTag = (side: Side) => (side === "A" ? OWNER_A : OWNER_B);
export const sideOfOwner = (owner: number): Side | null => (owner === OWNER_A ? "A" : owner === OWNER_B ? "B" : null);
export const opponentOf = (side: Side): Side => (side === "A" ? "B" : "A");

export function count(board: Board, owner: number) {
  return board.owner.filter((o) => o === owner).length;
}

export function totalTroops(board: Board, owner: number) {
  return board.strength.reduce((sum, s, t) => (board.owner[t] === owner ? sum + s : sum), 0);
}

/** Most troops that can leave `from`: one always stays behind. */
export function maxTroops(board: Board, from: number) {
  return Math.max(0, (board.strength[from] ?? 0) - 1);
}

const inRange = (t: number) => Number.isInteger(t) && t >= 0 && t < 8;

/** Same checks, same order, as Board::validate. Returns null when legal. */
export function validate(board: Board, side: Side, action: Action): string | null {
  const tag = ownerTag(side);
  if (isHold(action)) return null;
  if ("reinforce" in action) {
    const { from, to, troops } = action.reinforce;
    if (!inRange(from) || !inRange(to)) return "Unknown territory";
    if (board.owner[from] !== tag || board.owner[to] !== tag) return "Move troops between territories you hold";
    if (!isAdjacent(from, to)) return "The two territories must border each other";
    if (!(troops >= 1 && troops < board.strength[from])) return "Send at least 1 troop and leave 1 behind";
    return null;
  }
  const { from, target, troops } = action.attack;
  if (!inRange(from) || !inRange(target)) return "Unknown territory";
  if (board.owner[from] !== tag) return "Attack from a territory you hold";
  if (board.owner[target] === tag) return "You already hold that territory";
  if (!isAdjacent(from, target)) return "Target must border the attacking territory";
  if (!(troops >= 1 && troops < board.strength[from])) return "Send at least 1 troop and leave 1 behind";
  return null;
}

/** Territories `from` can attack with at least one troop. */
export function attackTargets(board: Board, side: Side, from: number): number[] {
  return neighbours(from).filter((t) => validate(board, side, { attack: { from, target: t, troops: 1 } }) === null);
}

/** Own territories `from` can move troops into. */
export function reinforceTargets(board: Board, side: Side, from: number): number[] {
  return neighbours(from).filter((t) => validate(board, side, { reinforce: { from, to: t, troops: 1 } }) === null);
}

type Launch = { side: Side; from: number; target: number; force: number };

/** Board::resolve, for previews and tests: both moves, then new troops. Throws on an illegal action. */
export function resolve(board: Board, a: Action, b: Action): Board {
  const next = resolveMoves(board, a, b);
  // Muster: every held territory raises new troops; unclaimed land doesn't.
  for (let t = 0; t < next.owner.length; t++) {
    if (next.owner[t] !== OWNER_NONE) next.strength[t] = Math.min(next.strength[t] + TROOPS_PER_TURN, MAX_STRENGTH);
  }
  return next;
}

/** Board::resolve_moves: the two moves alone, before new troops are raised. */
export function resolveMoves(board: Board, a: Action, b: Action): Board {
  for (const [side, action] of [
    ["A", a],
    ["B", b],
  ] as const) {
    const err = validate(board, side, action);
    if (err) throw new Error(`${side}: ${err}`);
  }
  const next: Board = { owner: [...board.owner], strength: [...board.strength] };
  for (const action of [a, b]) {
    if ("reinforce" in action) {
      const { from, to, troops } = action.reinforce;
      next.strength[from] -= troops;
      next.strength[to] = Math.min(next.strength[to] + troops, MAX_STRENGTH);
    }
  }
  const launch = (side: Side, action: Action): Launch | null =>
    "attack" in action ? { side, from: action.attack.from, target: action.attack.target, force: action.attack.troops } : null;
  const la = launch("A", a);
  const lb = launch("B", b);
  for (const l of [la, lb]) if (l) next.strength[l.from] -= l.force;

  const assault = (l: Launch) => {
    const defence = next.strength[l.target];
    if (l.force > defence) {
      next.owner[l.target] = ownerTag(l.side);
      next.strength[l.target] = Math.min(l.force - defence, MAX_STRENGTH);
    } else {
      next.strength[l.target] = Math.max(defence - l.force, 1);
    }
  };
  if (la && lb && (la.target === lb.target || (la.target === lb.from && lb.target === la.from))) {
    if (la.force > lb.force) assault({ ...la, force: la.force - lb.force });
    else if (lb.force > la.force) assault({ ...lb, force: lb.force - la.force });
  } else {
    for (const l of [la, lb]) if (l) assault(l);
  }
  return next;
}

/** Board::outcome: who has won after `turnsResolved` turns, or null while play goes on. */
export function outcome(board: Board, turnsResolved: number): Side | "draw" | null {
  const a = count(board, OWNER_A);
  const b = count(board, OWNER_B);
  if (b === 0 || a >= WIN_TERRITORIES) return "A";
  if (a === 0 || b >= WIN_TERRITORIES) return "B";
  if (turnsResolved < MAX_TURNS) return null;
  if (a !== b) return a > b ? "A" : "B";
  const sa = totalTroops(board, OWNER_A);
  const sb = totalTroops(board, OWNER_B);
  return sa === sb ? "draw" : sa > sb ? "A" : "B";
}

export const troopsLabel = (n: number) => `${n} troop${n === 1 ? "" : "s"}`;

export function actionKind(action: Order) {
  return "attack" in action ? "Attack" : "Reinforce";
}

export function actionTroops(action: Order) {
  return "attack" in action ? action.attack.troops : action.reinforce.troops;
}

export function actionFrom(action: Order) {
  return "attack" in action ? action.attack.from : action.reinforce.from;
}

export function actionTo(action: Order) {
  return "attack" in action ? action.attack.target : action.reinforce.to;
}

/** "North Africa → Middle East". */
export function actionRoute(action: Order) {
  return `${TERRITORIES[actionFrom(action)].name} → ${TERRITORIES[actionTo(action)].name}`;
}

export function describeAction(action: Order): string {
  const from = TERRITORIES[actionFrom(action)].name;
  const to = TERRITORIES[actionTo(action)].name;
  const troops = troopsLabel(actionTroops(action));
  return "attack" in action ? `Attack ${to} from ${from} with ${troops}` : `Move ${troops} from ${from} to ${to}`;
}

export function sameAction(a: Action | null | undefined, b: Action | null | undefined) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export const RULES = { MAX_TURNS, WIN_TERRITORIES };

export type Tone = "good" | "bad" | "info";
export type TurnLine = { tone: Tone; text: string };

/** One row of the reveal table: who did what, and what came of it. */
export type TurnRow = { side: Side; move: string; result: string; tone: Tone };

const toneFor = (success: boolean, mine: boolean | null): Tone =>
  mine === null ? "info" : success === mine ? "good" : "bad";

/**
 * The reveal table for a resolved turn, from `me`'s point of view (or neutral for
 * spectators): my row first. `before` is the board at the start of the turn when known;
 * without it the results still say who took what, without the defence numbers.
 */
export function turnRows(actions: { A: Action; B: Action }, after: Board, me: Side | null, before: Board | null): TurnRow[] {
  const order: Side[] = me === "B" ? ["B", "A"] : ["A", "B"];
  return order.map((side) => {
    const action = actions[side];
    const mine = me === null ? null : side === me;
    if (isHold(action)) return { side, move: "Held (no order in time)", result: "No change", tone: "info" };
    if ("reinforce" in action) {
      const { to, troops } = action.reinforce;
      const held = after.owner[to] === ownerTag(side);
      return {
        side,
        move: `Reinforce ${actionRoute(action)} · ${troops}`,
        result: held ? `${TERRITORIES[to].name} holds ${after.strength[to]}` : `${TERRITORIES[to].name} fell anyway`,
        tone: held ? "info" : toneFor(false, mine),
      };
    }
    const { target, troops } = action.attack;
    const captured = after.owner[target] === ownerTag(side);
    const odds = before ? ` (${troops} vs ${before.strength[target]})` : "";
    return {
      side,
      move: `Attack ${actionRoute(action)} · ${troops}`,
      result: captured ? `Captured ${TERRITORIES[target].name}${odds}` : `Repelled${odds}`,
      tone: toneFor(captured, mine),
    };
  });
}

/** Plain-language lines for a resolved turn (the reveal table as sentences). */
export function turnSummary(actions: { A: Action; B: Action }, after: Board, me: Side | null, before: Board | null): TurnLine[] {
  const who = (side: Side) => (side === me ? "You" : side === "A" ? "Ember" : "Tide");
  return turnRows(actions, after, me, before).map((row) => {
    const action = actions[row.side];
    if (isHold(action)) return { tone: row.tone, text: `${who(row.side)} held (no order in time)` };
    if ("reinforce" in action) {
      const { to, troops } = action.reinforce;
      return { tone: row.tone, text: `${who(row.side)} moved ${troopsLabel(troops)} into ${TERRITORIES[to].name}` };
    }
    const { target, troops } = action.attack;
    const captured = after.owner[target] === ownerTag(row.side);
    const yours = before !== null && me !== null && row.side !== me && before.owner[target] === ownerTag(me) ? "your " : "";
    const name = `${yours}${TERRITORIES[target].name}`;
    if (!before) return { tone: row.tone, text: captured ? `${who(row.side)} captured ${name}` : `${who(row.side)} failed to capture ${name}` };
    // The fight itself, before the turn's new troops: what was sent, what defended, what's left.
    const fought = resolveMoves(before, actions.A, actions.B).strength[target];
    const odds = `${troops} vs ${before.strength[target]}`;
    const text = captured
      ? `${who(row.side)} captured ${name}: ${odds}, ${troopsLabel(fought)} moved in`
      : `${who(row.side)} attacked ${name}: ${odds}, it held with ${fought} left`;
    return { tone: row.tone, text };
  });
}
