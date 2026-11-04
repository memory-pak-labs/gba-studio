import { expect, it } from "vitest";
import { createBlankProjectData } from "../shared/newProject.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
import { actorCommandReferences } from "../shared/sceneChangeCommand.js";

function project() {
  const data = createBlankProjectData({ name: "Menu and actors", includeStarterContent: false });
  const settings = data.settings as { general: Record<string, unknown> };
  return { ...data,
    scenas: [
      { id: "world", name: "World", sceneType: "topdown", width: 30, height: 20, eventBindings: { onInit: "start" } },
      { id: "menu", name: "Menu", sceneType: "menu", width: 30, height: 20, runtime: { type: "menu", config: {
        screenType: "menu", items: [{ id: "name", label: "Name", action: "select", eventName: "name" }]
      } } }
    ],
    actors: [
      { id: "first", name: "Actor 1", roomName: "World", x: 3, y: 3 },
      { id: "second", name: "Actor 2", roomName: "World", x: 6, y: 6 }
    ],
    events: [
      { id: "orphan", name: "orphan", category: "Ator", steps: [
        { command: 'if_actor_relative "Actor 1" "Actor 2" up' },
        { command: "set_variable above 1" }, { command: "condition_end" }
      ] },
      { id: "helper", name: "helper", category: "Ator", steps: [{ command: 'set_actor_visible "Actor 2" false' }] },
      { id: "start", name: "start", category: "Cena", steps: [{ command: "call_event helper" }] },
      { id: "name", name: "name", category: "Cena", steps: [{ command: "open_text_input player.name 3 latin_upper" }] }
    ],
    settings: { ...settings, general: { ...settings.general, startScene: "World", startSceneType: "topdown" } }
  };
}

it("keeps unbound actor scripts out of another runtime without shifting script indices", () => {
  const contract = buildEngineExportProjectContract(project(), { developmentStartScene: { name: "Menu" } });
  expect(contract.kind).toBe("mixed");
  expect(contract.topdown_project?.scripts[0]).toMatchObject({ name: "orphan", script: expect.arrayContaining([
    expect.objectContaining({ op: "jump_if_actor_relative", actor: 0, other_actor: 1 })
  ]) });
  expect(contract.topdown_project?.scripts[1]?.script).toEqual([{ op: "set_actor_visible", actor: 1, value: 0 }]);
  expect(contract.topdown_project?.scripts[2]?.script).toEqual([{ op: "call_script", index: 1 }]);
  expect(contract.menu_project?.scripts.map(script => script.name)).toEqual(["orphan", "helper", "start", "name"]);
  expect(contract.menu_project?.scripts.slice(0, 3).map(script => script.script)).toEqual([[], [], []]);
  expect(contract.menu_project?.scripts[3]?.script).toEqual([expect.objectContaining({ op: "open_text_input", max_length: 3 })]);
});

it("still rejects a missing actor in an unbound script", () => {
  const data = project();
  data.events[0]!.steps = [{ command: 'set_actor_visible "Missing actor" false' }];
  expect(() => buildEngineExportProjectContract(data)).toThrow(/ator inexistente/);
});

it("still rejects an actor script explicitly owned by an incompatible runtime", () => {
  const data = project();
  Object.assign(data.events[0]!, { roomName: "Menu" });
  expect(() => buildEngineExportProjectContract(data)).toThrow(/room do ator inexistente/);
});

it("extracts only actor operands, including both legacy actor names", () => {
  expect(actorCommandReferences('if_actor_relative Actor 1 Actor 2 up', ['Actor 1', 'Actor 2'])).toEqual(['Actor 1', 'Actor 2']);
  expect(actorCommandReferences('set_actor_visible "Actor 1" false')).toEqual(['Actor 1']);
  expect(actorCommandReferences('show_dialogue "Actor 1"')).toEqual([]);
  expect(actorCommandReferences('set_variable "Actor 1" 2')).toEqual([]);
});
