import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { parseEventInstruction } from "./eventExecutionContract.js";
import { deriveEventsWorkspacePresentation } from "./eventsWorkspace.js";
import { createBlankProjectData } from "./newProject.js";
import { createPreviewRuntime, runPreviewRuntimeEvent } from "./previewRuntime.js";
import { sceneChangeCommand, sceneChangeCommandParts } from "./sceneChangeCommand.js";

function project(command: string) {
  const data = createBlankProjectData({ name: "Atores QA", includeStarterContent: false });
  const settings = data.settings as { general: Record<string, unknown> };
  return {
    ...data,
    scenas: [{ id: "room", name: "Sala", sceneType: "topdown", width: 30, height: 20 }],
    actors: [
      { id: "player", name: "Player", roomName: "Sala", x: 1, y: 1 },
      { id: "first", name: "Outro", roomName: "Sala", x: 3, y: 3 },
      { id: "second", name: "Actor 2", roomName: "Sala", x: 5, y: 5 }
    ],
    events: [{ id: "ev", name: "ev", category: "Ator", roomName: "Sala", steps: [{ command }] }],
    settings: { ...settings, general: { ...settings.general, startScene: "Sala", startSceneType: "topdown" } }
  };
}

describe("actor event references with spaces", () => {
  it("keeps the selected target and action through presentation, preview and ROM export", () => {
    const command = 'set_actor_visible "Actor 2" false';
    const data = project(command);
    expect(parseEventInstruction(command).operands).toEqual(["Actor 2", "false"]);
    const step = deriveEventsWorkspacePresentation(data).groups.flatMap(group => group.events).find(event => event.name === "ev")!.steps[0]!;
    expect(step.commandParameters.map(p => p.value)).toEqual(["Actor 2", "false"]);
    expect(step.commandLabel).toBe("Ocultar ator");
    const preview = runPreviewRuntimeEvent(createPreviewRuntime(data), "ev");
    expect(preview.actors.find(actor => actor.name === "Actor 2")?.visible).toBe(false);
    expect(preview.actors.find(actor => actor.name === "Outro")?.visible).toBe(true);
    const contract = buildEngineExportProjectContract(data);
    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "ev", script: expect.arrayContaining([{ op: "set_actor_visible", actor: 1, value: 0 }]) })
    ]));
  });

  it("reads a previously saved unquoted actor name without changing the target", () => {
    const data = project("set_actor_visible Actor 2 false");
    const step = deriveEventsWorkspacePresentation(data).groups.flatMap(group => group.events).find(event => event.name === "ev")!.steps[0]!;
    expect(step.commandParameters.map(p => p.value)).toEqual(["Actor 2", "false"]);
    expect(step.commandLabel).toBe("Ocultar ator");
    const preview = runPreviewRuntimeEvent(createPreviewRuntime(data), "ev");
    expect(preview.actors.find(actor => actor.name === "Actor 2")?.visible).toBe(false);
    expect(preview.actors.find(actor => actor.name === "Outro")?.visible).toBe(true);
  });

  it("preserves actor references for projectile slots and actor conditions", () => {
    for (const verb of ["launch_projectile_slot", "if_actor_direction", "if_actor_at_position", "if_actor_distance", "if_actor_relative", "open_shop", "push_actor", "lantern", "reveal_area"]) {
      const command = sceneChangeCommand([verb, "Actor 2", "down"]);
      expect(parseEventInstruction(command).operands).toEqual(["Actor 2", "down"]);
      expect(sceneChangeCommandParts(`${verb} Actor 2 down`, ["Actor", "Actor 2"])).toEqual([verb, "Actor 2", "down"]);
    }
    const data = project('launch_projectile_slot "Actor 2" 0 down');
    const contract = buildEngineExportProjectContract(data);
    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "ev", script: expect.arrayContaining([{ op: "launch_projectile_slot", actor: 2, slot: 0, direction: "down" }]) })
    ]));
  });

  it("executes and exports a legacy push targeting an actor with spaces", () => {
    const data = project("push_actor Actor 2 false");
    const preview = runPreviewRuntimeEvent(createPreviewRuntime(data), "ev");
    expect(preview.actors.find(actor => actor.name === "Actor 2")?.y).toBeGreaterThan(5);
    const contract = buildEngineExportProjectContract(data);
    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "ev", script: expect.arrayContaining([{ op: "push_actor", actor: 1, value: false }]) })
    ]));
  });

  it("exports a legacy actor condition using the intended target", () => {
    const data = project("if_actor_direction Actor 2 down");
    data.events[0]!.steps.push({ command: "set_variable result 1" }, { command: "condition_end" });
    const contract = buildEngineExportProjectContract(data);
    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "ev", script: expect.arrayContaining([expect.objectContaining({ op: "jump_if_actor_direction", actor: 1, direction: "down" })]) })
    ]));
  });

  it("preserves both actor names in distance and relative conditions", () => {
    const actorNames = ["Player", "Outro 1", "Actor 2"];
    for (const verb of ["if_actor_distance", "if_actor_relative"]) {
      const value = verb === "if_actor_distance" ? "4" : "right";
      const parts = [verb, "Actor 2", "Outro 1", value];
      expect(sceneChangeCommandParts(sceneChangeCommand(parts))).toEqual(parts);
      expect(sceneChangeCommandParts(`${verb} Actor 2 Outro 1 ${value}`, actorNames)).toEqual(parts);
    }
  });

  it("evaluates and exports the distance between two actors with spaces", () => {
    const data = project('if_actor_distance "Actor 2" "Outro 1" 4');
    data.actors[1]!.name = "Outro 1";
    data.events[0]!.steps.push({ command: "set_variable result 1" }, { command: "condition_end" });
    const step = deriveEventsWorkspacePresentation(data).groups.flatMap(group => group.events).find(event => event.name === "ev")!.steps[0]!;
    expect(step.commandParameters.map(p => p.value)).toEqual(["Actor 2", "Outro 1", "4"]);
    const preview = runPreviewRuntimeEvent(createPreviewRuntime(data), "ev");
    expect(preview.variables.result).toBe(1);
    const contract = buildEngineExportProjectContract(data);
    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "ev", script: expect.arrayContaining([expect.objectContaining({ op: "jump_if_actor_distance", actor: 1, other_actor: 0, distance: 4 })]) })
    ]));
  });

  it.each([
    ['if_actor_distance Actor 2 Outro 1 4', 1],
    ['if_actor_distance Actor 2 Outro 1 2', 2],
    ['if_actor_relative Actor 2 Outro 1 right', 1],
    ['if_actor_relative Actor 2 Outro 1 left', 2]
  ])("follows the correct branch for legacy two-actor condition %s", (command, expected) => {
    const data = project(command);
    data.actors[1]!.name = "Outro 1";
    data.events[0]!.steps.push({ command: "set_variable result 1" }, { command: "else" }, { command: "set_variable result 2" }, { command: "condition_end" });
    expect(runPreviewRuntimeEvent(createPreviewRuntime(data), "ev").variables.result).toBe(expected);
    const contract = buildEngineExportProjectContract(data);
    const op = command.startsWith("if_actor_distance") ? "jump_if_actor_distance" : "jump_if_actor_relative";
    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "ev", script: expect.arrayContaining([expect.objectContaining({ op, actor: 1, other_actor: 0 })]) })
    ]));
  });

  it("round-trips movement targets with quotes and resolves the longest legacy name", () => {
    const name = 'Actor "2"';
    const command = sceneChangeCommand(["move_actor", name, "2", "-1"]);
    expect(sceneChangeCommandParts(command)).toEqual(["move_actor", name, "2", "-1"]);
    expect(sceneChangeCommandParts("move_actor Actor 2 2 -1", ["Actor", "Actor 2"]))
      .toEqual(["move_actor", "Actor 2", "2", "-1"]);
  });
});
