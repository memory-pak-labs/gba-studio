import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { buildFunctionalPlatformerProject } from "./functionalPlatformerProject.js";

describe("functionalPlatformerProject", () => {
  it("builds a native platformer export contract for the demo fixture", () => {
    const project = buildFunctionalPlatformerProject();
    const contract = buildEngineExportProjectContract(project);

    expect(project.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "player_platformer.png",
        metadata: expect.objectContaining({ bundledDefaultAsset: "platformer-player" })
      })
    ]));
    expect((project.animations as Array<Record<string, unknown>>)
      .filter((animation) => animation.spriteSheet === "player_platformer.png")
      .map((animation) => animation.name)).toEqual([
        "idle_right",
        "walk_right",
        "jump_right",
        "fall_right",
        "attack_right",
        "hurt_right"
      ]);

    expect(contract.kind).toBe("platformer");
    expect(contract.platformer_project).toBeDefined();
    expect(contract.platformer_project?.rooms).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "stage_1", width_tiles: 30, height_tiles: 20 })
    ]));
    const room = contract.platformer_project?.rooms[0];
    expect(room?.camera.follow_player).toBe(true);
    expect(room?.player_start).toEqual({ x: 16, y: 80, width: 16, height: 16 });
    expect(room?.collision_types.slice(-60)).toEqual(Array.from({ length: 60 }, () => "solid"));
    expect(contract.platformer_project?.player).toEqual(expect.objectContaining({
      metasprite: { asset: "player_platformer", index: 0 },
      animation: { asset: "player_platformer" },
      animations: expect.objectContaining({
        idle: expect.objectContaining({ frame_indices: [0] }),
        walk: expect.objectContaining({ frame_indices: [0, 1] }),
        jump: expect.objectContaining({ frame_indices: [0] }),
        fall: expect.objectContaining({ frame_indices: [0] })
      })
    }));
    const animations = (project.animations as Array<Record<string, unknown>>)
      .filter((animation) => animation.spriteSheet === "player_platformer.png");
    for (const animation of animations) {
      expect(animation).toMatchObject({ frameWidth: 40, frameHeight: 40 });
      for (const frame of animation.frames as Array<Record<string, unknown>>) {
        expect(frame.tiles).toHaveLength(4);
      }
    }
    expect(contract.requires.features).toContain("platformer_runtime.player_metasprite");
    expect(contract.requires.features).toContain("platformer_runtime.player_animations");
    expect(contract.platformer_project?.save).toEqual({
      enabled: true,
      autosave: false,
      slot_count: 1,
      slot_capacity: 2048,
      offset: 0,
      version: 1,
      signature: "GBUS",
      ui: {
        enabled: true,
        slotCount: 1,
        selectedSlot: 1,
        layout: "cards",
        confirmDelete: true,
        actions: { continue: "Continuar", load: "Carregar", delete: "Apagar" },
        metadata: { playerName: true, playTime: true, location: true }
      }
    });
  });
});
