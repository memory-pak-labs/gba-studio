import { describe, expect, it } from "vitest";

import {
  SCENE_METATILE_AUTHORING_CONTRACT_ID,
  expandSceneMetatileAuthoring,
  exportSceneMetatileAuthoring,
  resolveSceneMetatileAuthoring
} from "./sceneMetatileContract.js";

const authoredMetatiles = {
  enabled: true,
  contract: SCENE_METATILE_AUTHORING_CONTRACT_ID,
  fallback: "error",
  library: [
    {
      id: "grass",
      label: "Grama",
      tiles: [10, 11, 12, 13],
      semantic: { collision: "free", terrain: "grass", speedPercent: 100, tags: ["ground"] }
    },
    {
      id: "water",
      label: "Água",
      tiles: [20, 21, 22, 23],
      semantic: { collision: "water", terrain: "water", speedPercent: 60, animation: "water_loop", stepSound: "water_step" }
    }
  ],
  map: [0, 1]
};

describe("scene metatile authoring contract", () => {
  it("keeps the authoring layer disabled when it is absent", () => {
    const resolution = resolveSceneMetatileAuthoring(undefined, 4, 2);

    expect(resolution.issues).toEqual([]);
    expect(resolution.config.enabled).toBe(false);
    expect(expandSceneMetatileAuthoring(undefined, 4, 2)).toBeNull();
  });

  it("expands a logical 2x2 map into physical GBA tiles and semantic collision", () => {
    const expansion = expandSceneMetatileAuthoring(authoredMetatiles, 4, 2);

    expect(expansion).toMatchObject({
      physicalWidthTiles: 4,
      physicalHeightTiles: 2,
      logicalWidth: 2,
      logicalHeight: 1,
      visualTiles: [10, 11, 20, 21, 12, 13, 22, 23],
      collisionTypes: ["free", "free", "water", "water", "free", "free", "water", "water"]
    });
    expect(expansion?.cost).toMatchObject({
      bgTiles: 8,
      vramBytes: 8 * 32,
      dmaBytes: 8 * 32,
      paletteColors: 16
    });
    expect(expansion?.cost.cpuWorkTicks).toBeGreaterThan(0);
  });

  it("exports both authoring metadata and the physical fallback consumed by the engine", () => {
    expect(exportSceneMetatileAuthoring(authoredMetatiles, 4, 2)).toEqual(expect.objectContaining({
      schema: 1,
      enabled: true,
      contract: SCENE_METATILE_AUTHORING_CONTRACT_ID,
      block_width: 2,
      block_height: 2,
      logical_width: 2,
      logical_height: 1,
      map: [0, 1],
      physical: expect.objectContaining({
        width_tiles: 4,
        height_tiles: 2,
        visual_tiles: [10, 11, 20, 21, 12, 13, 22, 23]
      }),
      export_cost: expect.objectContaining({ bgTiles: 8, eventBytes: 0 })
    }));
  });

  it("rejects invalid dimensions, library entries, map indexes and duplicate IDs", () => {
    const resolution = resolveSceneMetatileAuthoring({
      ...authoredMetatiles,
      library: [
        ...authoredMetatiles.library,
        { ...authoredMetatiles.library[0], tiles: [1, 2, 3], semantic: { collision: "invalid" } }
      ],
      map: [0, 3]
    }, 3, 2);

    expect(resolution.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INVALID_DIMENSIONS" }),
      expect.objectContaining({ code: "DUPLICATE_METATILE_ID", field: "library[2].id" }),
      expect.objectContaining({ code: "INVALID_TILE_SET", field: "library[2].tiles" }),
      expect.objectContaining({ code: "INVALID_COLLISION", field: "library[2].semantic.collision" }),
      expect.objectContaining({ code: "MAP_INDEX_OUT_OF_RANGE", field: "map[1]" })
    ]));
    expect(expandSceneMetatileAuthoring({ ...authoredMetatiles, map: [0, 2] }, 4, 2)).toBeNull();
  });
});
