import { describe, expect, it } from "vitest";

import {
  SHMUP_SCENE_VIEWPORT,
  SHMUP_SCENE_WORLD,
  resolveShmupSceneComposition
} from "./shmupSceneComposition.js";

describe("shmup scene composition contract", () => {
  it("keeps the four scene planes explicit and Affine disabled when omitted", () => {
    const resolution = resolveShmupSceneComposition({}, { widthTiles: 90, heightTiles: 20 });

    expect(resolution.issues).toEqual([]);
    expect(resolution.config.viewport).toEqual(SHMUP_SCENE_VIEWPORT);
    expect(resolution.config.world).toEqual(SHMUP_SCENE_WORLD);
    expect(resolution.config.video.affine).toBeNull();
    expect(resolution.config.planes).toMatchObject({
      hud: { layer: "BG0", fixed: true },
      actors: { layer: "OBJ", playerSizePixels: { x: 32, y: 32 } },
      obstacles: { visualLayer: "BG1", collisionSource: "scene_data", collisionEnabled: true },
      background: { layer: "BG2", source: "regular_tiled", assetId: null }
    });
  });

  it("requires explicit Affine opt-in and the 720x160 logical world", () => {
    const composition = {
      enabled: true,
      mode: "affine",
      layers: [{
        id: "day",
        kind: "affine_bg",
        role: "decorative",
        layer: "BG2",
        enabled: true,
        assetId: "day-bg.png"
      }]
    };

    const missingOptIn = resolveShmupSceneComposition({ composition }, { widthTiles: 90, heightTiles: 20 });
    expect(missingOptIn.issues).toEqual([
      expect.objectContaining({ code: "AFFINE_CAPABILITY_REQUIRED" })
    ]);
    expect(missingOptIn.config.video.affine).toBeNull();
    expect(missingOptIn.config.planes.background).toMatchObject({
      source: "regular_tiled",
      assetId: null
    });

    const enabled = resolveShmupSceneComposition({
      composition,
      capabilities: [{ id: "affine_background", enabled: true, settings: {} }]
    }, { widthTiles: 90, heightTiles: 20 });
    expect(enabled.issues).toEqual([]);
    expect(enabled.config.video).toMatchObject({
      mode: "mode1",
      affine: {
        enabled: true,
        layer: "BG2",
        assetId: "day-bg.png",
        bpp: 8,
        logicalWidthPixels: 720,
        logicalHeightPixels: 160,
        physicalMapWidthTiles: 128,
        physicalMapHeightTiles: 128
      }
    });

    const wrongSize = resolveShmupSceneComposition({
      composition,
      capabilities: [{ id: "affine_background", enabled: true, settings: {} }]
    }, { widthTiles: 60, heightTiles: 20 });
    expect(wrongSize.issues).toEqual([
      expect.objectContaining({ code: "INVALID_WORLD_SIZE" })
    ]);
  });
});
