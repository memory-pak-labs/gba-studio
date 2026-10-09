import { describe, expect, it } from "vitest";

import {
  deriveEventStructure,
  insertEventStructureCommands,
  setEventUpdateFrequency,
  type EventStructureStep
} from "./eventStructure.js";

const step = (command: string): EventStructureStep => ({ command, isEnabled: true });

describe("event structure", () => {
  it("derives nested true and false condition branches from the persisted linear steps", () => {
    const structure = deriveEventStructure([
      step("if_variable score 1"),
      step("set_variable outer 1"),
      step("else"),
      step("if_variable lives 0"),
      step("set_variable inner_true 1"),
      step("else"),
      step("set_variable inner_false 1"),
      step("condition_end"),
      step("condition_end")
    ]);

    expect(structure.diagnostics).toEqual([]);
    expect(structure.root.children).toMatchObject([
      {
        kind: "condition",
        index: 0,
        trueBranch: { children: [{ kind: "step", index: 1 }] },
        falseBranch: {
          children: [{
            kind: "condition",
            index: 3,
            trueBranch: { children: [{ kind: "step", index: 4 }] },
            falseBranch: { children: [{ kind: "step", index: 6 }] },
            endIndex: 7
          }]
        },
        endIndex: 8
      }
    ]);
  });

  it("inserts commands into a false branch and creates structural delimiters", () => {
    const next = insertEventStructureCommands(
      [step("if_variable score 1"), step("set_variable yes 1"), step("condition_end")],
      { kind: "falseBranch", conditionIndex: 0 },
      ["set_variable no 1"]
    );

    expect(next.map((entry) => entry.command)).toEqual([
      "if_variable score 1",
      "set_variable yes 1",
      "else",
      "set_variable no 1",
      "condition_end"
    ]);
  });

  it("wraps update work in an explicit rate limit block", () => {
    expect(setEventUpdateFrequency([step("set_variable tick 1")], 30, 2)
      .map((entry) => entry.command)).toEqual([
        "rate_limit 30 2",
        "set_variable tick 1",
        "rate_limit_end"
      ]);
  });

  it("reports malformed delimiters without mutating the source steps", () => {
    const steps = [step("condition_end")];
    const structure = deriveEventStructure(steps);

    expect(structure.diagnostics).toEqual([{ index: 0, message: "condition_end sem condição aberta." }]);
    expect(steps).toEqual([step("condition_end")]);
  });
});
