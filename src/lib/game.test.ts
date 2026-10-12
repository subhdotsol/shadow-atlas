import { describe, expect, test } from "bun:test";
import {
  EDGES,
  HOLD,
  INITIAL_BOARD as initial,
  OWNER_A,
  OWNER_B,
  OWNER_NONE,
  MAX_STRENGTH,
  attackTargets,
  count,
  isAdjacent,
  outcome,
  reinforceTargets,
  resolve,
  resolveMoves,
  totalTroops,
  turnRows,
  turnSummary,
  validate,
  type Action,
  type Board,
} from "./game";
import { isRoomCode, matchPda, newRoomCode, normalizeRoomCode, parseMatchRef } from "./program";

// Indices: 0 NA, 1 EU, 2 ME, 3 EA, 4 SA, 5 NAf, 6 SAf, 7 IN.
const atk = (from: number, target: number, troops: number): Action => ({ attack: { from, target, troops } });
const move = (from: number, to: number, troops: number): Action => ({ reinforce: { from, to, troops } });

describe("map", () => {
  test("the spec's 10 connections, symmetric", () => {
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) expect(isAdjacent(i, j)).toBe(isAdjacent(j, i));
    const edges = EDGES.map(([a, b]) => `${a}-${b}`).sort();
    expect(edges).toEqual(["0-1", "0-4", "1-2", "1-5", "2-5", "2-7", "3-6", "3-7", "4-5", "5-6"].sort());
  });

  test("fair start: 4 territories and 10 troops each", () => {
    expect([count(initial, OWNER_A), count(initial, OWNER_B)]).toEqual([4, 4]);
    expect([totalTroops(initial, OWNER_A), totalTroops(initial, OWNER_B)]).toEqual([10, 10]);
  });
});

describe("validate mirrors Board::validate", () => {
  test("attacks", () => {
    expect(validate(initial, "A", atk(0, 1, 2))).toBeNull();
    expect(validate(initial, "A", atk(0, 1, 3))).not.toBeNull(); // must leave 1 behind
    expect(validate(initial, "A", atk(0, 1, 0))).not.toBeNull();
    expect(validate(initial, "A", atk(0, 4, 1))).not.toBeNull(); // own territory
    expect(validate(initial, "A", atk(0, 2, 1))).not.toBeNull(); // not adjacent
    expect(validate(initial, "B", atk(3, 6, 2))).toBeNull();
  });

  test("reinforcements move troops between adjacent own territories", () => {
    expect(validate(initial, "A", move(6, 5, 2))).toBeNull();
    expect(validate(initial, "A", move(0, 1, 1))).not.toBeNull(); // not mine
    expect(validate(initial, "A", move(0, 6, 1))).not.toBeNull(); // not adjacent
    expect(validate(initial, "B", move(7, 3, 1))).not.toBeNull(); // India has 1 troop
  });

  test("targets", () => {
    expect(attackTargets(initial, "A", 0)).toEqual([1]);
    expect(attackTargets(initial, "A", 5)).toEqual([1, 2]);
    expect(attackTargets(initial, "B", 7)).toEqual([]);
    expect(reinforceTargets(initial, "A", 5)).toEqual([4, 6]);
  });
});

describe("resolve mirrors Board::resolve", () => {
  // Every expected count includes the new troop each held territory raises after the moves.
  test("every held territory raises a troop each turn", () => {
    const next = resolve(initial, move(6, 5, 2), move(3, 7, 2));
    expect(next.strength).toEqual([4, 5, 3, 2, 3, 5, 2, 4]);
    expect(resolveMoves(initial, move(6, 5, 2), move(3, 7, 2)).strength).toEqual([3, 4, 2, 1, 2, 4, 1, 3]);
    const capped: Board = { owner: [...initial.owner.slice(0, 2), OWNER_NONE, ...initial.owner.slice(3)], strength: [MAX_STRENGTH, 4, 2, 3, 3, 2, 3, 1] };
    const after = resolve(capped, move(4, 0, 2), move(3, 7, 1));
    expect([after.strength[0], after.strength[2]]).toEqual([MAX_STRENGTH, 2]);
  });

  test("transfers land before attacks", () => {
    const b: Board = { ...initial, strength: [3, 4, 2, 3, 2, 6, 3, 1] };
    const next = resolve(b, atk(5, 2, 5), move(1, 2, 3));
    expect([next.owner[2], next.strength[2], next.strength[5], next.strength[1]]).toEqual([OWNER_B, 2, 2, 2]);
  });

  test("capture with more troops wins at 5 territories", () => {
    const b: Board = { ...initial, strength: [3, 4, 2, 3, 2, 4, 3, 1] };
    const next = resolve(b, atk(5, 2, 3), move(3, 7, 1));
    expect([next.owner[2], next.strength[2]]).toEqual([OWNER_A, 2]);
    expect(outcome(next, 2)).toBe("A");
  });

  test("head-on clash", () => {
    const b: Board = { ...initial, strength: [3, 4, 7, 3, 2, 3, 3, 1] };
    const next = resolve(b, atk(5, 2, 2), atk(2, 5, 6));
    expect([next.owner[5], next.strength[5], next.strength[2]]).toEqual([OWNER_B, 4, 2]);
  });

  test("tie goes to the defender; turn limit falls back to troops", () => {
    const next = resolve(initial, move(6, 5, 1), atk(1, 0, 3));
    expect([next.owner[0], next.strength[0]]).toEqual([OWNER_A, 2]);
    expect(outcome(next, 19)).toBeNull();
    expect(outcome(next, 20)).toBe("A");
    expect(outcome(initial, 20)).toBe("draw");
  });
});

describe("reveal", () => {
  const before: Board = { ...initial, strength: [3, 4, 2, 3, 2, 4, 3, 1] };
  const actions = { A: atk(5, 2, 3), B: move(3, 7, 1) };
  const after = resolve(before, actions.A, actions.B);

  test("table rows from Ember's side", () => {
    expect(turnRows(actions, after, "A", before)).toEqual([
      { side: "A", move: "Attack North Africa → Middle East · 3", result: "Captured Middle East (3 vs 2)", tone: "good" },
      { side: "B", move: "Reinforce East Asia → India · 1", result: "India holds 3", tone: "info" },
    ]);
  });

  test("from Tide's side: my row first, losing my territory is bad", () => {
    expect(turnSummary(actions, after, "B", before)).toEqual([
      { tone: "info", text: "You moved 1 troop into India" },
      { tone: "bad", text: "Ember captured your Middle East: 3 vs 2, 1 troop moved in" },
    ]);
  });

  test("a held attack says what the defence kept, before new troops", () => {
    const actions = { A: atk(0, 1, 2), B: move(3, 7, 1) };
    const after = resolve(initial, actions.A, actions.B);
    // Europe (4) loses 2 in the fight and keeps 2; the turn's new troop then makes it 3.
    expect(after.strength[1]).toBe(3);
    expect(turnSummary(actions, after, "A", initial)[0].text).toBe("You attacked Europe: 2 vs 4, it held with 2 left");
  });

  test("a hold (missed turn clock) is a no-op in the reveal", () => {
    const actions = { A: move(6, 5, 2), B: HOLD };
    const after = resolve(initial, actions.A, actions.B);
    expect(after.strength).toEqual([4, 5, 3, 4, 3, 5, 2, 2]);
    expect(turnRows(actions, after, "B", initial)[0]).toEqual({ side: "B", move: "Held (no order in time)", result: "No change", tone: "info" });
    expect(turnSummary(actions, after, "B", initial)[0].text).toBe("You held (no order in time)");
  });

  test("a repelled attack without the previous board", () => {
    const held = resolve(initial, atk(0, 1, 2), move(3, 7, 1));
    expect(turnRows({ A: atk(0, 1, 2), B: move(3, 7, 1) }, held, "A", null)[0].result).toBe("Repelled");
  });
});

describe("room codes", () => {
  test("generated codes are canonical", () => {
    for (let i = 0; i < 50; i++) expect(isRoomCode(newRoomCode())).toBe(true);
    expect(isRoomCode("ATLAS0")).toBe(false);
    expect(isRoomCode("ATLASI")).toBe(false);
    expect(normalizeRoomCode(" atl-as7 ")).toBe("ATLAS7");
  });

  test("links, codes and addresses all resolve to the match", () => {
    const address = matchPda("ATLAS7");
    expect(parseMatchRef("atlas7")?.address.equals(address)).toBe(true);
    expect(parseMatchRef("https://x.app/match/ATLAS7")?.code).toBe("ATLAS7");
    expect(parseMatchRef(address.toBase58())?.address.equals(address)).toBe(true);
    expect(parseMatchRef("nope")).toBeNull();
  });
});
