import { expect, it } from "vitest";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createRoomInProject } from "../shared/roomsWorkspace.js";

function twoScenes(sceneType: "pointAndClick" | "shmup") {
  let data = buildProjectFromTemplate("blank", { name: "Selected player" });
  for (const name of ["first", "second"]) {
    data = createRoomInProject(data, { id: name, name, width: 30, height: 20, sceneType });
  }
  const actors = data.actors as Record<string, unknown>[];
  const secondPlayer = actors.find(actor => actor.roomName === "second" && actor.name === "Player")!;
  secondPlayer.spriteSheet = "neutral-player-racing-rear.png";
  secondPlayer.animationName = "idle";
  secondPlayer.animationStateID = "state-neutral-racing-rear";
  return data;
}

it("starts a selected point-and-click scene with its own cursor and test position", () => {
  const exported = buildEngineExportProjectContract(twoScenes("pointAndClick"), {
    developmentStartScene: { name: "second", x: 9, y: 12 }
  }).point_click_project!;
  expect(exported.initial_scene).toBe(1);
  expect(exported.cursor_start).toEqual({ x: 72, y: 96 });
  expect(exported.cursor?.metasprite.asset).toBe("neutral_player_racing_rear");
});

it("uses the selected shoot-up player instead of a stale global sprite setting", () => {
  const exported = buildEngineExportProjectContract(twoScenes("shmup"), {
    developmentStartScene: { name: "second", x: 9, y: 12 }
  }).shmup_project!;
  expect(exported.initial_wave).toBe(1);
  expect(exported.player.position).toEqual({ x: 72, y: 96 });
  expect(exported.player.metasprite?.asset).toBe("neutral_player_racing_rear");
});
