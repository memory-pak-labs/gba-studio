import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "../shared/newProject.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

function project(direction: string, metadata = true) {
  const data = createBlankProjectData({ name: "Initial direction", includeStarterContent: false });
  data.scenas = [{ id: "room", name: "Room", width: 30, height: 20, sceneType: "topdown", playerActorName: "Pilot" }];
  data.assets = [{ id: "hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } }];
  data.animations = ["down", "right", "up", "left"].map((value, index) => ({
    id: `clip-${index}`, name: metadata ? `pose-${index}` : `idle_${value}`, spriteSheet: "hero.png",
    ...(metadata ? { direction: value, state: "idle" } : {}),
    frameCount: 1, frameWidth: 16, frameHeight: 32
  }));
  data.animationStates = [];
  const clip = (data.animations as Array<Record<string, unknown>>).find((_, index) => ["down", "right", "up", "left"][index] === direction)!;
  data.actors = [
    { id: "pilot", name: "Pilot", roomName: "Room", x: 3, y: 5, spriteSheet: "hero.png", animationName: clip.name },
    { id: "guard", name: "Guard QA", roomName: "Room", x: 12, y: 10, spriteSheet: "hero.png", animationName: clip.name }
  ];
  const general = (data.settings as { general: Record<string, unknown> }).general;
  Object.assign(general, { startScene: "Room", startSceneType: "topdown", startPlayer: "Pilot" });
  delete general.startX; delete general.startY;
  return data;
}

describe("authored actor initial direction", () => {
  it.each(["Pilot", "Player"])("exports direction reads for the configured Player using %s", target => {
    const data = project("left");
    Object.assign((data.scenas as Array<Record<string, unknown>>)[0]!, { eventBindings: { onInit: "direction_read" } });
    data.events = [{ id: "direction-read", name: "direction_read", category: "Custom", steps: [
      { command: `store_actor_direction ${target} qa_player_direction` }
    ] }];
    const runtime = buildEngineExportProjectContract(data).topdown_project!;
    expect(runtime.rooms[0]!.on_enter).toContainEqual({ op: "store_actor_direction", actor: -1, variable: expect.any(Number) });
  });

  it.each(["down", "up", "left", "right"])("exports %s from animation metadata for Player and NPC", direction => {
    const runtime = buildEngineExportProjectContract(project(direction)).topdown_project!;
    expect(runtime.player.direction).toBe(direction);
    expect(runtime.rooms[0]!.npcs![0]!.direction).toBe(direction);
  });

  it("uses the same direction suffix accepted by the inspector when metadata is absent", () => {
    const runtime = buildEngineExportProjectContract(project("left", false)).topdown_project!;
    expect(runtime.player.direction).toBe("left");
    expect(runtime.rooms[0]!.npcs![0]!.direction).toBe("left");
  });

  it("preserves an explicitly configured project spawn direction", () => {
    const data = project("left");
    Object.assign((data.settings as { general: Record<string, unknown> }).general,
      { startX: 2, startY: 3, startDirection: "right" });
    const runtime = buildEngineExportProjectContract(data).topdown_project!;
    expect(runtime.player).toMatchObject({ position: { x: 16, y: 24 }, direction: "right" });
    expect(runtime.rooms[0]!.npcs![0]!.direction).toBe("left");
  });
});
