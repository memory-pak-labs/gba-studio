import { describe, expect, it } from "vitest";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { nativeEventFixture } from "./nativeEventTestFixture.js";
function compile(commands: string[]) {
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
describe("temporal actor movement export", () => {
  it("distinguishes relative movement from instant relative positioning", () => {
    expect(compile(["move_actor_relative Guide -2 1", "set_actor_relative_position Guide -2 1"])).toEqual([
      {op: "move_actor_relative", actor: 0, x: -16, y: 8},
      {op: "move_actor", actor: 0, x: -16, y: 8}
    ]);
  });
  it("separates movement from immediate positioning and preserves subsequent event order", () => {
    expect(compile(["move_actor_to Guide 7 8", "teleport_actor Player 1 2", "set_variable flag 9"])).toEqual([
      { op: "move_actor_to", actor: 0, x: 56, y: 64 },
      { op: "set_actor_position", actor: -1, x: 8, y: 16 },
      { op: "set_variable", variable: 0, value: 9 }
    ]);
  });
});
