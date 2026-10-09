import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { buildFunctionalIsometricProject } from "./functionalIsometricProject.js";

describe("functionalIsometricProject", () => {
  it("builds a native isometric export contract for the demo fixture", () => {
    const project = buildFunctionalIsometricProject();
    expect((project.assets as Record<string, unknown>[]).filter(
      (asset) => asset.name === "isometric-sandbox-sheet.png"
    )).toHaveLength(1);
    expect(project.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "actor_isometric.png",
        metadata: expect.objectContaining({ bundledDefaultAsset: "isometric-actor" })
      })
    ]));
    expect((project.assets as Array<Record<string, unknown>>)
      .some((asset) => asset.name === "tree_isometric.png")).toBe(false);
    expect((project.animations as Array<Record<string, unknown>>)
      .filter((animation) => animation.spriteSheet === "actor_isometric.png")
      .map((animation) => animation.name)).toEqual([
        "idle_down_left",
        "idle_down_right",
        "idle_up_left",
        "idle_up_right"
      ]);
    expect(project.animationStates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "state-player-isometric",
        animationType: "four_direction",
        animationIDs: [
          "animation-actor-isometric-idle-down-left",
          "animation-actor-isometric-idle-down-right",
          "animation-actor-isometric-idle-up-left",
          "animation-actor-isometric-idle-up-right"
        ]
      })
    ]));
    expect((project.actors as Array<Record<string, unknown>>)[0]).toMatchObject({
      spriteSheet: "actor_isometric.png",
      animationStateID: "state-player-isometric",
      animationName: "idle_down_left"
    });
    expect(project.scenas).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "market",
        collisionTypes: expect.arrayContaining(["slope_up_right", "solid"]),
        heightLevels: expect.arrayContaining([1, 2, 3])
      }),
      expect.objectContaining({ name: "garden" })
    ]));
    expect(project.actors).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Player", roomName: "market" }),
      expect.objectContaining({ name: "NPC Guia", roomName: "market" }),
      expect.objectContaining({ name: "Objeto de referência", roomName: "market" }),
      expect.objectContaining({ name: "Player", roomName: "garden" })
    ]));
    expect((project.editorState as { scenaConnections?: unknown[] }).scenaConnections).toHaveLength(2);

    const contract = buildEngineExportProjectContract(project);

    expect((project.settings as Record<string, unknown>).isometric).toMatchObject({
      tileWidth: "32 px",
      tileHeight: "16 px",
      heightStep: "8 px"
    });

    expect(contract.kind).toBe("isometric");
    expect(contract.runtime_profile).toBe("isometric");
    expect(contract.project_data).toBe("isometric_project_data.hpp");
    expect(contract.template_dir).toContain("exported_isometric");
    expect(contract.topdown_project).toBeUndefined();
    expect(contract.platformer_project).toBeUndefined();
    expect(contract.isometric_project).toBeDefined();
    expect(contract.isometric_project?.initial_room).toBe(0);
    expect(contract.isometric_project?.rooms).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "market",
        width_tiles: 30,
        height_tiles: 20,
        visual_tiles: expect.arrayContaining([1, 3, 4]),
        collision_flags: expect.any(Array),
        ramp_flags: expect.arrayContaining([2, 4]),
        height_levels: expect.arrayContaining([1]),
        background_layers: expect.objectContaining({
          bg1: expect.arrayContaining([7])
        }),
        grid: {
          tile_width_pixels: 32,
          tile_height_pixels: 16,
          height_step_pixels: 8,
          origin: { x: 120, y: 16 },
          gameplay_mode: "adventure",
          profile: "diamond-2to1",
          projection: "diamond",
          movement_model: "free",
          height_mode: "levels"
        },
        tileset: "isometric_sandbox_sheet",
        tileset_tile_width_pixels: 32,
        tileset_tile_height_pixels: 16,
        camera: expect.objectContaining({
          zoom_x256: 256,
          target_zoom_x256: 256
        }),
        actors: expect.arrayContaining([
          expect.objectContaining({
            tile: { x: 2, y: 2, z: 0 },
            screen_offset: { x: -16, y: -24 },
            metasprite: { asset: "actor_isometric", index: 0 },
            animation: "idle_down",
            animations: expect.arrayContaining([
              expect.objectContaining({ name: "idle_down" }),
              expect.objectContaining({ name: "idle_up" }),
              expect.objectContaining({ name: "idle_left" }),
              expect.objectContaining({ name: "idle_right" }),
              expect.objectContaining({ name: "walk_down" }),
              expect.objectContaining({ name: "walk_up" }),
              expect.objectContaining({ name: "walk_left" }),
              expect.objectContaining({ name: "walk_right" })
            ])
          })
        ])
      })
    ]));
    expect(contract.isometric_project?.rooms).toHaveLength(2);
    expect(contract.isometric_project?.rooms[0]).toMatchObject({
      actors: expect.arrayContaining([
        expect.objectContaining({ tile: { x: 2, y: 2, z: 0 } }),
        expect.objectContaining({ tile: { x: 4, y: 3, z: 0 } }),
        expect.objectContaining({ tile: { x: 5, y: 4, z: 0 }, metasprite: { asset: "actor_isometric", index: 0 } })
      ]),
      tile_events: expect.arrayContaining([
        expect.objectContaining({ on_interact: expect.arrayContaining([expect.objectContaining({ op: "warp", room: 1 })]) })
      ])
    });
    expect(contract.isometric_project?.assets).toMatchObject({
      bg_palettes: ["isometric_sandbox_sheet"],
      tile_assets: ["isometric_sandbox_sheet", "actor_isometric"],
      obj_palettes: ["actor_isometric"],
      sprite_assets: ["actor_isometric"]
    });
    expect(contract.isometric_project?.resource_banks).toBe("asset_pack");
    expect(contract.asset_pack?.assets.some((asset) => asset.kind === "bg" && asset.name.includes("isometric"))).toBe(true);
    expect(contract.runtime_contract).toMatchObject({
      scene_type: "isometric",
      adapter: "isometric_project",
      adapter_status: "native"
    });
  });
});
