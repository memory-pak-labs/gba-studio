import { expect, it } from "vitest";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
import { createBlankProjectData } from "../shared/newProject.js";

it("exports whether each Custom scene explicitly selects a controlled actor", () => {
  const data = createBlankProjectData({ name: "Custom QA", sceneType: "topdown" });
  const playerTemplate = (data.actors as Record<string, unknown>[])[0]!;
  const first = (data.scenas as Record<string, unknown>[])[0]!;
  first.name = "empty";
  first.sceneType = "custom";
  delete first.playerActorName;
  data.scenas = [first,
    { ...first, id: "none", name: "none", playerActorName: "" },
    { ...first, id: "controlled", name: "controlled", playerActorName: "Hero" },
    { ...first, id: "adventure", name: "adventure", sceneType: "topdown", playerActorName: "Hero" }
  ];
  data.actors = [
    { id: "p", name: "Player", roomName: "empty", x: 2, y: 2 },
    { ...playerTemplate, id: "h1", name: "Hero", roomName: "controlled", x: 2, y: 2 },
    { ...playerTemplate, id: "h2", name: "Hero", roomName: "adventure", x: 2, y: 2 }
  ];
  const general = (data.settings as Record<string, Record<string, unknown>>).general!;
  general.startScene = "empty";
  general.startPlayer = "Player";
  const topdown = buildEngineExportProjectContract(data).topdown_project!;
  const rooms = topdown.rooms;
  expect(rooms.map(room => [room.name, room.metadata.player_enabled])).toEqual([
    ["empty", false], ["none", false], ["controlled", true], ["adventure", true]
  ]);
  expect(rooms[0]!.npcs?.map(actor => actor.name)).toContain("Player");
  expect(rooms[2]!.npcs?.map(actor => actor.name) ?? []).not.toContain("Hero");
  expect(topdown.player.metasprite).toBeDefined();
  expect(topdown.player.emit_animation_fallback).toBe(false);
});
