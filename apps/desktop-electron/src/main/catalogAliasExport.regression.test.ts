import { describe, expect, it } from "vitest";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { nativeEventFixture } from "./nativeEventTestFixture.js";

function script(commands: string[]) {
  const data = nativeEventFixture(commands);
  data.scenas = [{ name: "start", sceneType: "topdown", width: 30, height: 20, playerActorName: "Player" }];
  data.actors = [
    { id: "player", name: "Player", roomName: "start", x: 2, y: 3 },
    { id: "guide", name: "Guide", roomName: "start", x: 5, y: 6 }
  ];
  const result = prepareEngineProjectExport(data);
  expect(result.error).toBeUndefined();
  return result.generated!.contract.topdown_project!.scripts[0]!.script;
}

describe("catalog aliases preserve their native operands", () => {
  it.each([["move_actor_to", "move_actor_to"], ["teleport_actor", "set_actor_position"]])("exports absolute tile coordinates for %s", (verb, op) => {
    expect(script([`${verb} Guide 7 8`])).toEqual([
      { op, actor: 0, x: 56, y: 64 }
    ]);
  });

  it.each([["move_actor_relative", "move_actor_relative"], ["set_actor_relative_position", "move_actor"]])("exports signed tile deltas for %s", (verb, op) => {
    expect(script([`${verb} Guide -2 1`])).toEqual([
      { op, actor: 0, x: -16, y: 8 }
    ]);
  });

  it("resolves turn_actor against both the configured Player and an NPC", () => {
    expect(script(["turn_actor Player up", "turn_actor Guide right"])).toEqual([
      { op: "set_actor_direction", actor: -1, direction: "up" },
      { op: "set_actor_direction", actor: 0, direction: "right" }
    ]);
  });

  it("preserves enable and disable collision as distinct boolean operands", () => {
    expect(script(["set_actor_collision_enabled Guide false", "set_actor_collision_enabled Guide true"])).toEqual([
      { op: "set_actor_collision_enabled", actor: 0, value: 0 },
      { op: "set_actor_collision_enabled", actor: 0, value: 1 }
    ]);
  });

  it("preserves false, true and decrement-one instead of using their defaults", () => {
    expect(script(["set_flag flag false", "set_flag flag true", "add_variable flag -1"])).toEqual([
      { op: "set_variable", variable: 0, value: 0 },
      { op: "set_variable", variable: 0, value: 1 },
      { op: "add_variable", variable: 0, amount: -1 }
    ]);
  });

  it.each([
    ["if_variable_greater_than", "jump_if_variable_greater_than"],
    ["if_variable_less_than", "jump_if_variable_less_than"]
  ])("compiles %s as a guard with its own comparison", (verb, op) => {
    expect(script([`${verb} counter 3`, "set_variable result 1"])).toEqual([
      { op, variable: 0, value: 3, offset: 2 },
      { op: "jump", offset: 2 },
      { op: "set_variable", variable: 1, value: 1 }
    ]);
  });

  it("keeps an absolute camera request and explicit dialogue close", () => {
    expect(script(["camera_set_position -12 24", "close_dialogue"])).toEqual([
      { op: "set_camera_position", x: -12, y: 24 },
      { op: "close_dialogue" }
    ]);
  });

  it("distinguishes the ground, run and blank adventure states", () => {
    expect(script(["set_adventure_state ground", "set_adventure_state run", "set_adventure_state blank"])).toEqual([
      { op: "set_adventure_state", index: 0 },
      { op: "set_adventure_state", index: 4 },
      { op: "set_adventure_state", index: 3 }
    ]);
  });

  it("opens a shop only when its scene has a configured shop and actor", () => {
    const data = nativeEventFixture(["open_shop Keeper"]);
    data.actors = [{ id: "keeper", name: "Keeper", roomName: "start", x: 2, y: 2 }];
    expect(prepareEngineProjectExport(data).error).toBeTruthy();
    data.scenas = [{ name: "start", sceneType: "topdown", width: 30, height: 20, runtime: {
      type: "topdown", config: { modules: [
        { id: "inventory", enabled: true, settings: {} },
        { id: "shop", enabled: true, settings: { label: "POTION", item: 1, currencyItem: 0, price: 7 } }
      ] }
    } }];
    const result = prepareEngineProjectExport(data);
    expect(result.error).toBeUndefined();
    expect(result.generated!.contract.topdown_project!.scripts[0]!.script).toEqual([{ op: "open_shop", actor: 0 }]);
  });

  it("resolves the structural slider screen and rejects a missing screen", () => {
    const data = nativeEventFixture(["slider title_options"]);
    expect(prepareEngineProjectExport(data).error).toBeTruthy();
    data.scenas = [{ name: "start", sceneType: "menu", width: 30, height: 20, runtime: {
      type: "menu", config: { screenType: "menu", screens: [{ id: "title_options", screenType: "menu", carousel: true,
        items: [{ id: "start", label: "START", action: "select" }] }] }
    } }];
    data.settings = { ...(data.settings as Record<string, unknown>), general: {
      gameTitle: "Slider", startScene: "start", startSceneType: "menu", exportFolder: "build"
    } };
    const result = prepareEngineProjectExport(data);
    expect(result.error).toBeUndefined();
    expect(result.generated!.contract.topdown_project).toBeUndefined();
    expect(result.generated!.contract.menu_project!.screens).toEqual([expect.objectContaining({
      name: "title_options", carousel: true,
      items: [expect.objectContaining({ label: "START", action: "select" })]
    })]);
  });
});
