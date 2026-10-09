import { describe, expect, it } from "vitest";

import {
  TOPDOWN_WALK_4DIRS_CANONICAL_PREFIX,
  verifyNativeVisualExportContract,
  verifyNativeVisualRuntimeMain,
  verifyTopdownWalk4DirsExportContract
} from "./native-visual-rom-contracts.mjs";

describe("native visual ROM contracts", () => {
  it("accepts exported_topdown runtime main.cpp", () => {
    const features = verifyNativeVisualRuntimeMain([
      "void load_project_assets() {",
      "gbs::draw_room_to_bg(gbs::BackgroundLayer::BG2, active_room_visual_tiles(), room.width_tiles, room.height_tiles, render_camera.x, render_camera.y);",
      "set_actor_metasprite(",
      "gbs::InputState input = gbs::poll_input();",
      "gbs::draw_dialogue(dialogue);"
    ].join("\n"));

    expect(features).toContain("draw-room-bg");
    expect(features).toContain("actor-metasprite");
  });

  it("accepts the production begin_frame input polling contract", () => {
    const features = verifyNativeVisualRuntimeMain([
      "void load_project_assets() {",
      "gbs::draw_room_to_bg(gbs::BackgroundLayer::BG2, active_room_visual_tiles(), room.width_tiles, room.height_tiles, render_camera.x, render_camera.y);",
      "set_actor_metasprite(",
      "const gbs::InputState input = gbs::begin_frame().input;",
      "gbs::draw_dialogue(dialogue);"
    ].join("\n"));

    expect(features).toContain("poll-input");
  });

  it("rejects witness debug runtime main.cpp", () => {
    expect(() => verifyNativeVisualRuntimeMain([
      "struct RuntimeWitnessState",
      "void draw_playable_scene()",
      "tile_runtime_player",
      "gbs::set_bg_tile(gbs::BackgroundLayer::BG2, x, y, runtime_bg_width, runtime_bg_height, tile);"
    ].join("\n"))).toThrow(/legados proibidos|ausente ou incompleto/);
  });

  it("validates export_project.json visual contract", () => {
    const summary = verifyNativeVisualExportContract({
      asset_pack: {
        assets: [
          { kind: "bg", id: "tiles_overworld", name: "tiles_overworld", symbol: "tiles_overworld" },
          { kind: "obj", id: "player_topdown_4dir", name: "player_topdown_4dir", symbol: "player_topdown_4dir" }
        ]
      },
      topdown_project: {
        player: {
          metasprite: { asset: "player_topdown_4dir", index: 0 },
          animations: [{ name: "idle_down" }],
          emit_animation_fallback: false
        },
        rooms: [{ visual_tilemap: "tiles_overworld", visual_tiles: [1, 2, 3] }]
      }
    });

    expect(summary).toMatchObject({
      spriteAssetCount: 1,
      tilesetAssetCount: 1,
      roomCount: 1,
      playerAssetId: "player_topdown_4dir",
      emitAnimationFallback: false
    });
  });

  it("rejects placeholder player animation fallback", () => {
    expect(() => verifyNativeVisualExportContract({
      asset_pack: {
        assets: [
          { kind: "bg", id: "tiles_overworld" },
          { kind: "obj", id: "player_topdown_4dir" }
        ]
      },
      topdown_project: {
        player: {
          metasprite: { asset: "player_topdown_4dir", index: 0 },
          animations: [{ name: "idle_down" }],
          emit_animation_fallback: true
        },
        rooms: [{ visual_tilemap: "tiles_overworld", visual_tiles: [1] }]
      }
    })).toThrow(/emit_animation_fallback=false/);
  });

  it("rejects idle-only player animations for walk 4 dirs", () => {
    expect(() => verifyTopdownWalk4DirsExportContract({
      topdown_project: {
        player: {
          animations: [
            { name: "idle_down" },
            { name: "idle_up" },
            { name: "idle_right" },
            { name: "idle_left" }
          ]
        }
      }
    })).toThrow(/walk 4 dirs/);
  });

  it("accepts canonical idle+walk prefix for walk 4 dirs", () => {
    const summary = verifyTopdownWalk4DirsExportContract({
      topdown_project: {
        player: {
          animations: [
            ...TOPDOWN_WALK_4DIRS_CANONICAL_PREFIX.map((name) => ({ name }))
          ]
        }
      }
    });

    expect(summary).toMatchObject({
      animationCount: 8,
      canonicalPrefix: TOPDOWN_WALK_4DIRS_CANONICAL_PREFIX
    });
  });
});
