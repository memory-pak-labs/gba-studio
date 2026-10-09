import { describe, expect, it } from "vitest";
import { resolveProjectConstantCommand } from "./projectConstants.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { createPreviewRuntime, runPreviewRuntimeEvent } from "./previewRuntime.js";
import { createBlankProjectData } from "./newProject.js";
import { deriveEventsWorkspacePresentation } from "./eventsWorkspace.js";

function project(command = "set_variable hp const(VIDA_MAXIMA)") {
  const data = createBlankProjectData({ name: "Constants" });
  return { ...data, constants: [{ name: "VIDA_MAXIMA", value: 100 }], variables: [{ name: "hp" }],
    events: [{ id: "reward", name: "reward", category: "Gameplay", steps: [{ command }] }] };
}
describe("project constants", () => {
  it("resolves explicit values while preserving variable and resource names", () => {
    expect(resolveProjectConstantCommand(project(), "set_variable hp const(VIDA_MAXIMA)")).toBe("set_variable hp 100");
    expect(resolveProjectConstantCommand(project(), "show_dialogue VIDA_MAXIMA")).toBe("show_dialogue VIDA_MAXIMA");
    expect(resolveProjectConstantCommand(project(), "wait const(VIDA_MAXIMA)")).toBe("wait 100");
  });
  it("rejects missing values, invalid numbers, resource positions and writes to constants", () => {
    expect(() => resolveProjectConstantCommand(project(), "wait const(MISSING)")).toThrow(/não encontrada/);
    expect(() => resolveProjectConstantCommand(project(), "set_variable VIDA_MAXIMA 1")).toThrow(/alterada/);
    expect(() => resolveProjectConstantCommand(project(), "show_dialogue const(VIDA_MAXIMA)")).toThrow(/não aceita/);
    expect(() => resolveProjectConstantCommand({ ...project(), constants: [{ name: "VIDA_MAXIMA", value: "bad" }] }, "wait const(VIDA_MAXIMA)")).toThrow(/inteiro/);
  });
  it("exports constants as immediates without allocating variable slots", () => {
    const result = buildEngineExportProjectContract(project());
    expect(result.topdown_project?.scripts.find(s => s.name === "reward")?.script).toEqual([{ op: "set_variable", variable: 0, value: 100 }]);
    expect(JSON.stringify(result.topdown_project?.scripts)).not.toContain("VIDA_MAXIMA");
  });
  it("uses the same value in preview and keeps the authored command intact", () => {
    const data = project();
    expect(runPreviewRuntimeEvent(createPreviewRuntime(data), "reward").variables.hp).toBe(100);
    expect(data.events[0]?.steps[0]?.command).toContain("const(VIDA_MAXIMA)");
  });
  it("offers constants for values and keeps them out of variable destinations", () => {
    const view = deriveEventsWorkspacePresentation(project());
    const step = view.groups.flatMap(group => group.events).find(event => event.name === "reward")?.steps[0];
    expect(step?.commandParameters.find(parameter => parameter.kind === "variable")?.options).not.toContain("VIDA_MAXIMA");
    expect(step?.commandParameters.find(parameter => parameter.tokenIndex === 2)?.options).toContain("const(VIDA_MAXIMA)");
  });
  it("substitutes comparison thresholds in the exported guard", () => {
    const data = project("if_variable_greater_than hp const(VIDA_MAXIMA)");
    data.events[0]!.steps.push({command: "set_variable hp 1"});
    const result = buildEngineExportProjectContract(data);
    expect(result.topdown_project?.scripts.find(s => s.name === "reward")?.script[0]).toMatchObject({op: "jump_if_variable_greater_than", value: 100});
  });
});
