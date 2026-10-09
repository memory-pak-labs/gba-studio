import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { buildFunctionalPointClickProject } from "./functionalPointClickProject.js";
import { buildFunctionalShmupProject } from "./functionalShmupProject.js";

describe("functionalPointClickProject", () => {
  it("builds a native point_click export contract for the demo fixture", () => {
    const project = buildFunctionalPointClickProject();
    const contract = buildEngineExportProjectContract(project);

    expect(project.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "actor_point_click.png" }),
      expect.objectContaining({ name: "cursor_point_click.png" })
    ]));
    expect((project.actors as Array<Record<string, unknown>>)[0]).toMatchObject({
      spriteSheet: "actor_point_click.png",
      animationName: "point_click_actor_idle"
    });
    expect((project.settings as Record<string, Record<string, unknown>>).pointAndClick.cursorImage).toBe(
      "cursor_point_click.png"
    );

    expect(contract.kind).toBe("point_click");
    expect(contract.runtime_profile).toBe("point_click");
    expect(contract.project_data).toBe("point_click_project_data.hpp");
    expect(contract.template_dir).toContain("exported_point_click");
    expect(contract.topdown_project).toBeUndefined();
    expect(contract.point_click_project).toBeDefined();
    expect(contract.point_click_project?.initial_scene).toBe(0);
    expect(contract.point_click_project?.cursor_speed).toBe(2);
    expect(contract.point_click_project?.scenes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "office",
        hotspots: expect.arrayContaining([
          expect.objectContaining({
            name: "Door",
            area: expect.objectContaining({ x: 92, y: 28, width: 24, height: 32 })
          })
        ])
      })
    ]));
    expect(contract.runtime_contract).toMatchObject({
      scene_type: "pointAndClick",
      adapter: "point_click_project",
      adapter_status: "native"
    });
  });
});

describe("functionalShmupProject", () => {
  it("builds a native shmup export contract for the demo fixture", () => {
    const project = buildFunctionalShmupProject();
    const contract = buildEngineExportProjectContract(project);

    expect(project.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "player_shmup.png", metadata: expect.objectContaining({ bundledDefaultAsset: "shmup-player" }) }),
      expect.objectContaining({ name: "projectile_shmup.png", metadata: expect.objectContaining({ bundledDefaultAsset: "shmup-projectile" }) }),
      expect.objectContaining({ name: "enemy_shmup.png", metadata: expect.objectContaining({ bundledDefaultAsset: "shmup-enemy" }) })
    ]));
    expect((project.actors as Array<Record<string, unknown>>)[0]).toMatchObject({
      spriteSheet: "player_shmup.png",
      animationName: "idle"
    });
    const animationIds = (project.animations as Array<Record<string, unknown>>).map((animation) => animation.id);
    expect(new Set(animationIds).size).toBe(animationIds.length);

    expect(contract.kind).toBe("shmup");
    expect(contract.runtime_profile).toBe("shmup");
    expect(contract.project_data).toBe("shmup_project_data.hpp");
    expect(contract.template_dir).toContain("exported_shmup");
    expect(contract.topdown_project).toBeUndefined();
    expect(contract.shmup_project).toBeDefined();
    expect(contract.shmup_project?.initial_wave).toBe(0);
    expect(contract.shmup_project?.player).toMatchObject({
      speed: 2,
      fire_cooldown: 8,
      metasprite: { asset: "player_shmup", index: 0 }
    });
    expect(contract.shmup_project?.projectile).toMatchObject({
      metasprite: { asset: "projectile_shmup", index: 0 }
    });
    expect(contract.shmup_project?.waves).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "wave_1",
        enemies: expect.arrayContaining([
          expect.objectContaining({
            name: "scout",
            position: { x: 184, y: 48 },
            size: { x: 32, y: 32 },
            velocity: { x: -1, y: 0 },
            metasprite: { asset: "enemy_shmup", index: 0 }
          })
        ])
      })
    ]));
    expect(contract.runtime_contract).toMatchObject({
      scene_type: "shmup",
      adapter: "shmup_project",
      adapter_status: "native"
    });
  });
});
