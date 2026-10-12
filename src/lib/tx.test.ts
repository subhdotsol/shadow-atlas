import { describe, expect, test } from "bun:test";
import { GameTxError, describeError, programErrorOf } from "./tx";

// MissingCommit is error 6008 (0x1778) in the IDL.
describe("programErrorOf finds the program error in every shape it arrives in", () => {
  test("confirmation error carrying the code", () => {
    expect(programErrorOf(new GameTxError("Both orders must be sealed first.", "MissingCommit"))).toBe("MissingCommit");
  });

  test("send-time rejection with a hex custom error", () => {
    expect(programErrorOf(new Error("Transaction simulation failed: Error processing Instruction 0: custom program error: 0x1778"))).toBe(
      "MissingCommit",
    );
  });

  test("raw transaction status", () => {
    expect(programErrorOf({ InstructionError: [0, { Custom: 6008 }] })).toBe("MissingCommit");
  });

  test("Anchor log line on the error's logs", () => {
    const e = Object.assign(new Error("Simulation failed"), {
      logs: ["Program log: AnchorError occurred. Error Code: TurnNotOpen. Error Number: 6004."],
    });
    expect(programErrorOf(e)).toBe("TurnNotOpen");
  });

  test("not a program error", () => {
    expect(programErrorOf(new Error("Failed to fetch"))).toBeUndefined();
    expect(programErrorOf({ InstructionError: [0, { Custom: 1 }] })).toBeUndefined();
  });
});

describe("describeError", () => {
  test("turns codes into player-facing copy", () => {
    expect(describeError(new Error("custom program error: 0x1778"))).toBe("Both orders must be sealed first.");
    expect(describeError({ InstructionError: [0, { Custom: 6008 }] })).toBe("Both orders must be sealed first.");
  });

  test("never shows [object Object]", () => {
    expect(describeError({ some: "rpc error" })).not.toContain("[object Object]");
  });
});
