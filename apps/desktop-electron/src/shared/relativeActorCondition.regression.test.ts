import { expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import { deriveEventsWorkspacePresentation } from "./eventsWorkspace.js";
import { createPreviewRuntime, runPreviewRuntimeEvent } from "./previewRuntime.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";

function data(relation: string, actorY = 6) {
  const base = createBlankProjectData({ name: "Vertical QA", includeStarterContent: false });
  const settings = base.settings as { general: Record<string, unknown> };
  return {
    ...base,
    scenas: [{ id: "room", name: "Sala", sceneType: "topdown", width: 30, height: 20 }],
    actors: [
      { id: "player", name: "Player", roomName: "Sala", x: 2, y: 2 },
      { id: "actor_3", name: "Actor 3", roomName: "Sala", x: 10, y: actorY },
      { id: "actor_4", name: "Actor 4", roomName: "Sala", x: 20, y: 10 }
    ],
    events: [{ id: "vertical", name: "vertical", category: "Ator", roomName: "Sala", steps: [
      { command: `if_actor_relative "Actor 3" "Actor 4" ${relation}` },
      { command: "set_variable branch 1" }, { command: "else" },
      { command: "set_variable branch 2" }, { command: "condition_end" }
    ] }],
    settings: { ...settings, general: { ...settings.general, startScene: "Sala", startSceneType: "topdown" } }
  };
}

it("offers both actor selectors and the four relative positions", () => {
  const project = data("up");
  const step = deriveEventsWorkspacePresentation(project).groups[0]!.events[0]!.steps[0]!;
  expect(step.commandParameters.map(p => p.label)).toEqual(["Ator", "Outro ator", "Posição relativa"]);
  expect(step.commandParameters[1]).toMatchObject({ kind: "actor", value: "Actor 4", isKnownValue: true });
  expect(step.commandParameters[1]!.options).toEqual(expect.arrayContaining(["player", "Actor 3", "Actor 4"]));
  expect(step.commandParameters[2]!.options).toEqual(["up", "down", "left", "right"]);
});

it("also offers an actor selector for the other distance target", () => {
  const project = data("up");
  project.events[0]!.steps[0]!.command = 'if_actor_distance "Actor 3" "Actor 4" 4';
  const step = deriveEventsWorkspacePresentation(project).groups[0]!.events[0]!.steps[0]!;
  expect(step.commandParameters[1]).toMatchObject({ kind: "actor", value: "Actor 4", isKnownValue: true });
});

it.each([[6,"up",1],[6,"down",2],[14,"up",2],[14,"down",1],[10,"up",2],[10,"down",2]] as const)(
  "keeps the explicit Else for y=%i, %s", (y, relation, result) => {
    const project = data(relation,y);
    expect(runPreviewRuntimeEvent(createPreviewRuntime(project),"vertical").variables.branch).toBe(result);
    const exported = buildEngineExportProjectContract(project);
    expect(exported.topdown_project?.scripts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "vertical", script: expect.arrayContaining([
        expect.objectContaining({ op: "jump_if_actor_relative", actor: 0, other_actor: 1, relation })
      ]) })
    ]));
  }
);
