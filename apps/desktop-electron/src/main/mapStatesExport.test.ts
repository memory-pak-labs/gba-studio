import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "../shared/newProject.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

function fixture(sceneType: "topdown" | "platformer") {
  const data = createBlankProjectData({ name: "Persistent door", sceneType });
  const room = (data.rooms as Record<string, unknown>[])[0]!;
  room.mapStates = [{ id: "door", name: "Porta", variable: "map.door", variants: [
    { id: "closed", value: 0, tiles: [{ x: 4, y: 6, tile: 1, count: 1, layer: "bg2", collision: "solid" }] },
    { id: "open", value: 1, tiles: [{ x: 4, y: 6, tile: 17, count: 1, layer: "bg2", collision: "free" }] }
  ] }];
  data.events = [{ id: "open", name: "open", category: "Cena", roomName: room.name, command: "set_map_state door open" }];
  return data;
}

describe("map state export", () => {
  it.each(["topdown", "platformer"] as const)("exports restoration and a grouped operation for %s", sceneType => {
    const contract = buildEngineExportProjectContract(fixture(sceneType));
    const project = sceneType === "topdown" ? contract.topdown_project! : contract.platformer_project!;
    const restore = project.rooms[0]!.on_restore;
    expect(restore).toEqual([
      { op: "jump_if_variable_equals", variable: 0, value: 0, offset: 2 },
      { op: "jump", offset: 2 },
      { op: "replace_tile", x: 4, y: 6, tile: 1, count: 1, layer: "bg2", collision_flags: 1 },
      { op: "jump_if_variable_equals", variable: 0, value: 1, offset: 2 },
      { op: "jump", offset: 2 },
      { op: "replace_tile", x: 4, y: 6, tile: 17, count: 1, layer: "bg2", collision_flags: 0 }
    ]);
    expect(project.rooms[0]!.on_enter?.slice(0, restore!.length)).toEqual(restore);
    expect(project.scripts).toEqual(expect.arrayContaining([expect.objectContaining({ name: "open", script: expect.arrayContaining([
      { op: "set_variable", variable: 0, value: 1 },
      { op: "replace_tile", x: 4, y: 6, tile: 17, count: 1, layer: "bg2", collision_flags: 0 }
    ]) })]));
  });
});
