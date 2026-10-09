import { describe, expect, it } from "vitest";

import {
  expandEventProcedures,
  normalizeEventProcedureDefinition,
  procedureVariableKeys
} from "./eventProcedures.js";

describe("event procedures", () => {
  it("normalizes typed parameters and locals", () => {
    expect(normalizeEventProcedureDefinition({
      parameters: [
        { name: " amount ", type: "number", defaultValue: "2" },
        { name: "target", type: "variable", defaultValue: "score" },
        { name: "enabled", type: "boolean", defaultValue: "true" }
      ],
      locals: [{ name: " counter ", type: "number", initialValue: "0" }]
    })).toEqual({
      parameters: [
        { name: "amount", type: "number", defaultValue: "2" },
        { name: "target", type: "variable", defaultValue: "score" },
        { name: "enabled", type: "boolean", defaultValue: "true" }
      ],
      locals: [{ name: "counter", type: "number", initialValue: "0" }]
    });
  });

  it("expands parameters and initializes local variables", () => {
    const result = expandEventProcedures([
      {
        id: "procedure-award",
        name: "award_points",
        eventKind: "procedure",
        procedure: {
          parameters: [
            { name: "target", type: "variable", defaultValue: "score" },
            { name: "amount", type: "number", defaultValue: "1" },
            { name: "notify", type: "boolean", defaultValue: "false" }
          ],
          locals: [{ name: "calls", type: "number", initialValue: "0" }]
        },
        steps: [
          { command: "add_variable $target $amount", isEnabled: true },
          { command: "add_variable $calls 1", isEnabled: true },
          { command: "if_variable $calls 1", isEnabled: true },
          { command: "set_flag did_notify $notify", isEnabled: true }
        ]
      },
      {
        id: "event-main",
        name: "main",
        steps: [{ command: "call_procedure award_points coins 5 true", isEnabled: true }]
      }
    ]);

    expect(result.issues).toEqual([]);
    expect(result.events[0]?.steps).toEqual([]);
    expect(result.events[1]?.steps).toEqual([
      { command: "set_variable __proc_award_points_calls 0", isEnabled: true },
      { command: "add_variable coins 5", isEnabled: true },
      { command: "add_variable __proc_award_points_calls 1", isEnabled: true },
      { command: "if_variable __proc_award_points_calls 1", isEnabled: true },
      { command: "set_flag did_notify true", isEnabled: true }
    ]);
    expect(procedureVariableKeys(result.events)).toEqual(["__proc_award_points_calls"]);
  });

  it("supports nested procedures and defaults", () => {
    const result = expandEventProcedures([
      {
        name: "increment",
        eventKind: "procedure",
        procedure: { parameters: [{ name: "target", type: "variable", defaultValue: "score" }] },
        steps: [{ command: "add_variable $target 1", isEnabled: true }]
      },
      {
        name: "twice",
        eventKind: "procedure",
        procedure: { parameters: [{ name: "target", type: "variable", defaultValue: "score" }] },
        steps: [
          { command: "call_procedure increment $target", isEnabled: true },
          { command: "call_procedure increment $target", isEnabled: true }
        ]
      },
      { name: "main", steps: [{ command: "call_procedure twice", isEnabled: true }] }
    ]);

    expect(result.issues).toEqual([]);
    expect(result.events[2]?.steps).toEqual([
      { command: "add_variable score 1", isEnabled: true },
      { command: "add_variable score 1", isEnabled: true }
    ]);
  });

  it("preserves a legacy top-level event command as an executable step", () => {
    const result = expandEventProcedures([
      { id: "door-enter", name: "door_enter", command: "change_scene shop" }
    ]);

    expect(result.issues).toEqual([]);
    expect(result.events[0]?.steps).toEqual([
      { command: "change_scene shop" }
    ]);
  });

  it("reports invalid arguments, missing procedures and recursion", () => {
    const result = expandEventProcedures([
      {
        name: "recursive",
        eventKind: "procedure",
        procedure: { parameters: [{ name: "amount", type: "number" }] },
        steps: [{ command: "call_procedure recursive nope", isEnabled: true }]
      },
      {
        name: "main",
        steps: [
          { command: "call_procedure missing", isEnabled: true },
          { command: "call_procedure recursive nope", isEnabled: true }
        ]
      }
    ]);

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("Procedure inexistente: missing"),
      expect.stringContaining("amount espera number"),
      expect.stringContaining("Chamada recursiva de procedure bloqueada: recursive")
    ]));
  });
});
