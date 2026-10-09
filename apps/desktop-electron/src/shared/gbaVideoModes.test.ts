import { describe, expect, it } from "vitest";

import {
  availableBackgroundLayersForVideoMode,
  gbaBackgroundMapSizeForDimensions,
  gbaBackgroundMapSizeFromProject,
  gbaObjLayerSpec,
  gbaObjNativeDimension,
  gbaVideoModeFromProject,
  gbaVramTotalBytes,
  parseGbaBackgroundMapSize,
  parseGbaVideoMode,
  sceneTileLayerAvailableForVideoMode,
  sceneTileLayerSupportsPainting
} from "./gbaVideoModes.js";

describe("gbaVideoModes", () => {
  it("parses graphics mode labels from project settings", () => {
    expect(parseGbaVideoMode("Mode 0 - Tilemaps")).toBe(0);
    expect(parseGbaVideoMode("Mode 1 - Affine")).toBe(1);
    expect(parseGbaVideoMode("Mode 2")).toBe(2);
    expect(parseGbaVideoMode("Mode 3 - Bitmap")).toBe(3);
    expect(parseGbaVideoMode("Mode 4 - 8bpp Bitmap")).toBe(4);
    expect(parseGbaVideoMode("Mode 5 - Bitmap 160x128")).toBe(5);
    expect(gbaVideoModeFromProject({
      settings: { backgrounds: { graphicsMode: "Mode 1 - Affine BG2" } }
    }).id).toBe(1);
  });

  it("exposes four static background layers in mode 0", () => {
    expect(availableBackgroundLayersForVideoMode(0)).toEqual(["BG3", "BG2", "BG1", "BG0"]);
    expect(sceneTileLayerAvailableForVideoMode("BG3", 0)).toBe(true);
    expect(sceneTileLayerSupportsPainting("topdown", 0)).toBe(true);
  });

  it("restricts background layers according to affine modes", () => {
    expect(availableBackgroundLayersForVideoMode(1)).toEqual(["BG2", "BG1", "BG0"]);
    expect(sceneTileLayerAvailableForVideoMode("BG3", 1)).toBe(false);
    expect(availableBackgroundLayersForVideoMode(2)).toEqual(["BG3", "BG2"]);
    expect(sceneTileLayerAvailableForVideoMode("BG0", 2)).toBe(false);
  });

  it("disables tile painting for bitmap modes", () => {
    expect(sceneTileLayerSupportsPainting("topdown", 3)).toBe(false);
    expect(sceneTileLayerSupportsPainting("topdown", 4)).toBe(false);
    expect(sceneTileLayerSupportsPainting("topdown", 5)).toBe(false);
    expect(availableBackgroundLayersForVideoMode(3)).toEqual([]);
  });

  it("documents OBJ and VRAM hardware limits", () => {
    expect(gbaVramTotalBytes).toBe(96 * 1024);
    expect(gbaObjLayerSpec.maxSprites).toBe(128);
    expect(gbaObjLayerSpec.minSpritePx).toBe(8);
    expect(gbaObjLayerSpec.maxSpritePx).toBe(64);
  });

  it("selects the official text background map that contains a scene", () => {
    expect(parseGbaBackgroundMapSize("32 x 32")).toBe("32x32");
    expect(parseGbaBackgroundMapSize("64x32")).toBe("64x32");
    expect(gbaBackgroundMapSizeForDimensions(30, 20).id).toBe("32x32");
    expect(gbaBackgroundMapSizeForDimensions(40, 20).id).toBe("64x32");
    expect(gbaBackgroundMapSizeForDimensions(30, 40).id).toBe("32x64");
    expect(gbaBackgroundMapSizeForDimensions(60, 40).id).toBe("64x64");
    expect(gbaBackgroundMapSizeFromProject({ settings: { backgrounds: { defaultMapSize: "64x32" } } })).toBe("64x32");
  });

  it("exposes the twelve native OBJ dimensions while allowing metasprite decomposition", () => {
    expect(gbaObjNativeDimension(64, 32)).toBe("64x32");
    expect(gbaObjNativeDimension(24, 24)).toBeNull();
  });
});
