import { describe, expect, it } from "vitest";

import {
  deriveIsometricAtlasGrid,
  deriveIsometricWorldSize,
  validateIsometricRoomAuthoring
} from "./isometricAuthoring.js";

describe("isometric authoring contract", () => {
  it("derives the logical atlas grid and projected world size", () => {
    expect(deriveIsometricAtlasGrid({
      atlasTileHeight: 32,
      atlasTileWidth: 32,
      imageHeight: 256,
      imageWidth: 256,
      tileHeight: 16,
      tileWidth: 32
    })).toEqual({ columns: 8, rows: 8, tileCount: 64 });

    expect(deriveIsometricWorldSize({
      atlasTileHeight: 32,
      height: 30,
      width: 40,
      config: { heightStep: 8, originX: 120, originY: 16, presentationZoom: 100, tileHeight: 16, tileWidth: 32 }
    })).toEqual({ height: 576, width: 1120 });
  });

  it("accepts a complete layered map with valid heights, ramps and triggers", () => {
    expect(validateIsometricRoomAuthoring({
      atlas: {
        atlasTileHeight: 32,
        atlasTileWidth: 32,
        bitsPerPixel: 4,
        imageHeight: 256,
        imageWidth: 256,
        paletteColorCount: 16,
        tileHeight: 16,
        tileWidth: 32,
        transparentIndex: 0
      },
      collisionTypes: ["free", "slope_up_right", "free", "solid"],
      heightLevels: [0, 1, 0, 0],
      actors: [{ id: "player", x: 0, y: 0, z: 0 }],
      tileLayers: [
        { mapping: "BG2", tilemap: [1, 5, 2, 0] },
        { mapping: "BG1", tilemap: [-1, -1, -1, -1] }
      ],
      tilemap: [1, 5, 2, 0],
      triggers: [{ height: 1, width: 1, x: 1, y: 0 }],
      worldMode: "scrollable_tiled_world",
      width: 2,
      height: 2
    })).toEqual([]);
  });

  it("uses the explicit BG2 layer as the visual source of truth", () => {
    const issues = validateIsometricRoomAuthoring({
      atlas: { atlasTileHeight: 32, atlasTileWidth: 32, imageHeight: 64, imageWidth: 64, tileHeight: 16, tileWidth: 32 },
      collisionTypes: ["free", "solid", "free", "free"],
      heightLevels: [0, 0, 0, 0],
      tileLayers: [{ mapping: "BG2", tilemap: [1, 2, 3, 0] }],
      tilemap: [],
      width: 2,
      height: 2
    });

    expect(issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "visual_tilemap_size" }),
      expect.objectContaining({ code: "walkable_visual_missing" })
    ]));
  });

  it("reports actionable errors for missing layers, invalid atlas and out-of-bounds triggers", () => {
    expect(validateIsometricRoomAuthoring({
      atlas: { imageHeight: 17, imageWidth: 255, tileHeight: 16, tileWidth: 32 },
      collisionTypes: ["slope_up_left"],
      heightLevels: [0],
      tilemap: [],
      triggers: [{ height: 2, width: 2, x: 1, y: 1 }],
      width: 1,
      height: 1
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "atlas_not_aligned", severity: "error" }),
      expect.objectContaining({ code: "visual_tilemap_size", severity: "error" }),
      expect.objectContaining({ code: "bg2_layer_missing", severity: "warning" }),
      expect.objectContaining({ code: "ramp_height_transition", severity: "error" }),
      expect.objectContaining({ code: "trigger_out_of_bounds", severity: "error" })
    ]));
  });

  it("rejects visual tiles outside the atlas and incompatible GBA palette contracts", () => {
    expect(validateIsometricRoomAuthoring({
      atlas: {
        atlasTileHeight: 32,
        atlasTileWidth: 32,
        bitsPerPixel: 8,
        imageHeight: 64,
        imageWidth: 64,
        paletteColorCount: 17,
        tileHeight: 16,
        tileWidth: 32,
        transparentIndex: 2
      },
      collisionTypes: ["free", "solid"],
      heightLevels: [0, 0],
      tilemap: [1, 4],
      width: 2,
      height: 1
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "atlas_bpp_unsupported", severity: "error" }),
      expect.objectContaining({ code: "atlas_palette_overflow", severity: "error" }),
      expect.objectContaining({ code: "atlas_transparency_index", severity: "error" }),
      expect.objectContaining({ code: "visual_tile_id_out_of_range", severity: "error", cellIndex: 1 })
    ]));
  });

  it("detects missing walkable visuals and actor geometry mismatches", () => {
    expect(validateIsometricRoomAuthoring({
      atlas: { atlasTileHeight: 32, atlasTileWidth: 32, imageHeight: 64, imageWidth: 64, tileHeight: 16, tileWidth: 32 },
      actors: [
        { id: "blocked", x: 0, y: 0, z: 0 },
        { id: "wrong-height", x: 1, y: 0, z: 0 },
        { id: "outside", x: 4, y: 0, z: 0 }
      ],
      collisionTypes: ["solid", "free", "free", "free"],
      heightLevels: [0, 2, 0, 0],
      tilemap: [1, 0, 1, 1],
      width: 2,
      height: 2
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "walkable_visual_missing", severity: "warning", cellIndex: 1 }),
      expect.objectContaining({ code: "actor_on_solid", severity: "error" }),
      expect.objectContaining({ code: "actor_height_mismatch", severity: "error" }),
      expect.objectContaining({ code: "actor_out_of_bounds", severity: "error" })
    ]));
  });

  it("requires an authored background for static compositions", () => {
    expect(validateIsometricRoomAuthoring({
      tilemap: [1],
      width: 1,
      height: 1,
      worldMode: "static_composition",
      hasAuthoredBackground: false
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "static_background_missing", severity: "error" })
    ]));
  });

  it("does not validate authored static compositions as tile atlas cells", () => {
    const issues = validateIsometricRoomAuthoring({
      atlas: {
        atlasTileHeight: 16,
        atlasTileWidth: 32,
        imageHeight: 16,
        imageWidth: 32,
        tileHeight: 16,
        tileWidth: 32
      },
      collisionTypes: Array.from({ length: 96 }, () => "free"),
      hasAuthoredBackground: true,
      heightLevels: Array.from({ length: 96 }, () => 0),
      tileLayers: [{ mapping: "BG2", tilemap: Array.from({ length: 96 }, () => -1) }],
      tilemap: Array.from({ length: 96 }, () => 0),
      width: 12,
      height: 8,
      worldMode: "static_composition"
    });

    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "visual_tile_id_out_of_range" }),
      expect.objectContaining({ code: "walkable_visual_missing" })
    ]));
  });
});
