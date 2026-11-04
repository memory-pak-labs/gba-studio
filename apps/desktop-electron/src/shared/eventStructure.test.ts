import { describe, expect, it } from "vitest";

import {
  deriveEventStructure,
  insertEventStructureCommands,
  setEventUpdateFrequency,
  type EventStructureStep
} from "./eventStructure.js";

const step = (command: string): EventStructureStep => ({ command, isEnabled: true });

describe("event structure", () => {
  it("creates closed conditions when a single condition is added at root or within a branch", () => {
    const root = insertEventStructureCommands([], { kind: "root" }, ["if_variable value 10"]);
    expect(root.map(entry => entry.command)).toEqual(["if_variable value 10", "condition_end"]);
    const nested = insertEventStructureCommands(root, { kind: "trueBranch", conditionIndex: 0 }, ["if_flag ready"]);
    expect(nested.map(entry => entry.command)).toEqual(["if_variable value 10", "if_flag ready", "condition_end", "condition_end"]);
    const populated = insertEventStructureCommands(nested, { kind: "trueBranch", conditionIndex: 1 }, ["show_dialogue intro"]);
    expect(deriveEventStructure(populated).diagnostics).toEqual([]);
    expect(populated.map(entry => entry.command)).toEqual(["if_variable value 10", "if_flag ready", "show_dialogue intro", "condition_end", "condition_end"]);
  });

  it("keeps complete multi-command recipes unchanged", () => {
    const recipe = ["if_variable value 10", "show_dialogue intro", "else", "set_variable value 0", "condition_end"];
    expect(insertEventStructureCommands([], { kind: "root" }, recipe).map(entry => entry.command)).toEqual(recipe);
  });
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
