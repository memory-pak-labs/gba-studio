import { describe, expect, it } from "vitest";

import {
  affineMatrixForComposition,
  deriveAdvancedVideoComposition,
  exportAdvancedVideoComposition
} from "./advancedVideoComposition.js";

describe("advancedVideoComposition", () => {
  it("normalizes affine composition and produces a GBA 8.8 matrix", () => {
    const composition = deriveAdvancedVideoComposition({
      graphicsMode: "Mode 2 - Affine",
      affineLayer: "BG3",
      affineAsset: "terrain.png",
      affineRotation: 90,
      affineScaleX: 1,
      affineScaleY: 2,
      affineOriginX: 120,
      affineOriginY: 80,
      affineWrap: true
    });

    expect(composition).toMatchObject({
      mode: 2,
      affine: { asset: "terrain.png", layer: "BG3", rotationDegrees: 90, scaleX: 1, scaleY: 2, originX: 120, originY: 80, wrap: true }
    });
    expect(affineMatrixForComposition(composition.affine)).toEqual({
      pa: 0,
      pb: -128,
      pc: 256,
      pd: 0,
      referenceX8: 30720,
      referenceY8: 20480
    });
    expect(exportAdvancedVideoComposition(composition).affine).toMatchObject({ asset: "terrain.png" });
  });

  it("exports bitmap mode 5 with asset, page and hardware dimensions", () => {
    const exported = exportAdvancedVideoComposition(deriveAdvancedVideoComposition({
      graphicsMode: "Mode 5 - Bitmap 160x128",
      bitmapAsset: "panorama.png",
      bitmapPage: 1
    }));

    expect(exported).toEqual({
      display_mode: 5,
      affine: null,
      bitmap: { asset: "panorama.png", page: 1, width: 160, height: 128, color_depth: 15 }
    });
  });

  it("keeps mode 3 on its only hardware framebuffer page", () => {
    expect(exportAdvancedVideoComposition(deriveAdvancedVideoComposition({
      graphicsMode: "Mode 3 - Bitmap",
      bitmapAsset: "photo.png",
      bitmapPage: 1
    })).bitmap?.page).toBe(0);
  });
});
