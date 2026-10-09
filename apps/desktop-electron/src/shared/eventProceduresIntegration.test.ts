import { describe, expect, it } from "vitest";

import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { createBlankProjectData } from "./newProject.js";
import { createPreviewRuntime, runPreviewRuntimeEvent } from "./previewRuntime.js";

function procedureProject() {
  const project = createBlankProjectData({ name: "Procedures", exportFolder: "build/procedures" });
  project.events = [
    {
      id: "procedure-award",
      name: "award",
      category: "Procedure",
      eventKind: "procedure",
      procedure: {
        parameters: [
          { name: "target", type: "variable", defaultValue: "score" },
          { name: "amount", type: "number", defaultValue: "1" }
        ],
        locals: [{ name: "calls", type: "number", initialValue: "0" }]
      },
      steps: [
        { command: "add_variable $target $amount", isEnabled: true },
        { command: "add_variable $calls 1", isEnabled: true }
      ]
    },
    {
      id: "event-main",
      name: "main",
      category: "Cena",
      steps: [{ command: "call_procedure award coins 5", isEnabled: true }]
    }
  ];
  return project;
}

describe("event procedures integration", () => {
  it("runs the materialized procedure in preview", () => {
    const runtime = runPreviewRuntimeEvent(createPreviewRuntime(procedureProject()), "main");

    expect(runtime.variables).toMatchObject({
      coins: 5,
      __proc_award_calls: 1
    });
    expect(runtime.executionTrace.map((entry) => entry.command)).toEqual(expect.arrayContaining([
      "set_variable __proc_award_calls 0",
      "add_variable coins 5",
      "add_variable __proc_award_calls 1"
    ]));
  });

  it("compiles the same materialized procedure into ROM commands", () => {
    const contract = buildEngineExportProjectContract(procedureProject());
    const scripts = contract.topdown_project?.scripts ?? [];

    expect(scripts.find((script) => script.name === "award")?.script).toEqual([]);
    expect(scripts.find((script) => script.name === "main")?.script).toEqual([
      { op: "set_variable", variable: 0, value: 0 },
      { op: "add_variable", variable: 1, amount: 5 },
      { op: "add_variable", variable: 0, amount: 1 }
    ]);
  });

  it("blocks export when procedures exceed the 64 engine variables", () => {
    const project = procedureProject();
    project.events = Array.from({ length: 65 }, (_item, index) => ({
      id: `event-${index}`,
      name: `event_${index}`,
      category: "Teste",
      steps: [{ command: `set_variable variable_${index} ${index}`, isEnabled: true }]
    }));

    expect(() => buildEngineExportProjectContract(project)).toThrow(/64 variaveis/);
  });
});
