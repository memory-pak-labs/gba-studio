import { describe, expect, it } from "vitest";
import { decomposeGbaMetaspriteFrame } from "./gbaMetaspriteLayout.js";

import {
  auditGbaHardwareBlockingErrors,
  buildGbaHardwareContract
} from "./gbaHardwareContract.js";

describe("gbaHardwareContract", () => {
  it("keeps cached native geometry independent of edits to a returned layout", () => {
    const first = decomposeGbaMetaspriteFrame(48, 48);
    const original = first.map(part => ({ ...part }));
    first[0].x = 999;
    first.push({ x: 0, y: 0, width: 8, height: 8 });
    expect(decomposeGbaMetaspriteFrame(48, 48)).toEqual(original);
  });
  it.each([[48, 48], [96, 64], [128, 128]])("accepts a contiguous %ix%i authored frame within the native OBJ budget", (frameWidth, frameHeight) => {
    const contract = buildGbaHardwareContract({ animations: [{ name: "own", frameWidth, frameHeight,
      frames: [{ tiles: [{ tileWidth: frameWidth, tileHeight: frameHeight, sliceX: frameWidth, sliceY: 0 }] }]
    }] });
    expect(contract.issues.filter(issue => issue.severity === "error")).toEqual([]);
  });
  it("retains the native parts of a wide UI canvas", () => {
    const contract = buildGbaHardwareContract({ animations: [{ name: "menu-strip", frameWidth: 208, frameHeight: 32,
      frames: [{ tiles: [0, 64, 128, 192].map(sliceX => ({ tileWidth: sliceX === 192 ? 16 : 64, tileHeight: 32, sliceX, sliceY: 0 })) }]
    }] });
    expect(contract.issues.filter(issue => issue.severity === "error")).toEqual([]);
  });
  it("counts partial native tiles against their actual backing layout", () => {
    const contract = buildGbaHardwareContract({ animations: [{ name: "own", frameWidth: 64, frameHeight: 64,
      frames: [{ tiles: Array.from({ length: 9 }, () => ({ tileWidth: 16, tileHeight: 16, sliceX: 0, sliceY: 0 })) }]
    }] });
    expect(contract.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "SPRITE_METASPRITE_PART_LIMIT_EXCEEDED" })]));
  });
  it("accepts an isometric logical grid smaller than the orthogonal viewport", () => {
    const contract = buildGbaHardwareContract({scenas: [{name: "Arena", sceneType: "isometric", width: 6, height: 6}]});
    expect(contract.issues.some(issue => issue.code === "SCENE_BELOW_GBA_VIEWPORT")).toBe(false);
  });

  it("budgets the active sprite frame rather than an entire animation sheet", () => {
    const contract = buildGbaHardwareContract({
      assets: [{name: "unit.png", kind: "Sprite", metadata: {width: 2688, height: 40, colorMode: "4bpp"}}],
      animations: [{name: "idle", spriteSheet: "unit.png", frameWidth: 48, frameHeight: 40}]
    });
    expect(contract.assets[0]).toMatchObject({widthPixels: 2688, heightPixels: 40, oamEntries: 4});
    expect(contract.issues.find(issue => issue.code === "SPRITE_ASSET_REQUIRES_METASPRITE")?.message).toContain("48×40");
  });
  it('accepts the logical shmup strip rendered through a resident Mode 0 window', () => {
    const c=buildGbaHardwareContract({scenas:[{name:'tempestade',sceneType:'shmup',width:90,height:20}]});
    expect(c.scenes[0].requiredMapSize.id).toBe('32x32');
    expect(c.issues.some(i=>i.code==='SCENE_EXCEEDS_GBA_BACKGROUND_MAP')).toBe(false);
  });
  it("budgets the resident viewport, not the logical map, for Mode 0 platformer streaming", () => {
    const contract = buildGbaHardwareContract({
      scenas: [{ name: "penedos", sceneType: "platformer", width: 161, height: 20 }]
    });
    expect(contract.scenes[0]).toMatchObject({ widthPixels: 1288, heightPixels: 160,
      requiredMapSize: { id: "32x32" }, effectiveMapSize: { id: "32x32" } });
    expect(contract.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "SCENE_EXCEEDS_GBA_BACKGROUND_MAP" }),
      expect.objectContaining({ code: "BACKGROUND_MAP_SIZE_EXPANDED" })
    ]));
    const nonStreaming = buildGbaHardwareContract({
      scenas: [{ name: "other", sceneType: "topdown", width: 161, height: 20 }]
    });
    expect(nonStreaming.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "SCENE_EXCEEDS_GBA_BACKGROUND_MAP", severity: "error" })
    ]));
    const bitmap = buildGbaHardwareContract({
      settings: { backgrounds: { graphicsMode: "Mode 3 - Bitmap" } },
      scenas: [{ name: "bitmap", sceneType: "platformer", width: 161, height: 20 }]
    });
    expect(bitmap.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "SCENE_EXCEEDS_GBA_BACKGROUND_MAP", severity: "error" })
    ]));
  });

  it("describes the physical GBA viewport and selects a larger map for a scrolling scene", () => {
    const contract = buildGbaHardwareContract({
      settings: { backgrounds: { defaultMapSize: "32x32", graphicsMode: "Mode 0 - Tilemaps" } },
      scenas: [{ name: "Other resident map", sceneType: "topdown", width: 60, height: 40 }]
    });

    expect(contract.viewport).toEqual({ widthPixels: 240, heightPixels: 160, widthTiles: 30, heightTiles: 20 });
    expect(contract.tileSizePixels).toBe(8);
    expect(contract.scenes[0]).toMatchObject({
      requiredMapSize: { id: "64x64", screenblocks: 4 },
      effectiveMapSize: { id: "64x64" },
      mapSizeExpandedAutomatically: true
    });
    expect(contract.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "BACKGROUND_MAP_SIZE_EXPANDED", severity: "warning" })
    ]));
  });

  it("keeps non-native but tile-aligned actor frames as metasprite warnings", () => {
    const contract = buildGbaHardwareContract({
      animations: [{ name: "idle", frameWidth: 24, frameHeight: 24, colorMode: "4bpp" }],
      assets: [{ name: "hero.png", kind: "Sprite", metadata: { width: 24, height: 24, colorMode: "4bpp" } }]
    });

    expect(contract.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "SPRITE_ASSET_REQUIRES_METASPRITE", severity: "warning" }),
      expect.objectContaining({ code: "SPRITE_FRAME_REQUIRES_METASPRITE", severity: "warning" })
    ]));
    expect(auditGbaHardwareBlockingErrors({
      animations: [{ name: "idle", frameWidth: 24, frameHeight: 24, colorMode: "4bpp" }]
    })).toEqual([]);
  });

  it("blocks non-aligned or unsupported OBJ content", () => {
    const contract = buildGbaHardwareContract({
      animations: [{ name: "bad", frameWidth: 22, frameHeight: 16, colorMode: "15bpp" }],
      assets: [{ name: "bad.png", kind: "Sprite", metadata: { width: 22, height: 16, colorMode: "15bpp" } }]
    });

    expect(contract.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "SPRITE_FRAME_NOT_TILE_ALIGNED", severity: "error" }),
      expect.objectContaining({ code: "SPRITE_FRAME_COLOR_MODE_UNSUPPORTED", severity: "error" }),
      expect.objectContaining({ code: "SPRITE_ASSET_NOT_TILE_ALIGNED", severity: "error" }),
      expect.objectContaining({ code: "SPRITE_ASSET_COLOR_MODE_UNSUPPORTED", severity: "error" })
    ]));
    expect(auditGbaHardwareBlockingErrors({
      animations: [{ name: "bad", frameWidth: 22, frameHeight: 16, colorMode: "15bpp" }]
    }).length).toBeGreaterThanOrEqual(2);
  });

  it("validates custom metasprite pieces without rejecting large logical actors", () => {
    const contract = buildGbaHardwareContract({
      animations: [{
        name: "boss",
        frameWidth: 96,
        frameHeight: 64,
        colorMode: "4bpp",
        frames: [{ tiles: [{ tileWidth: 24, tileHeight: 24, sliceX: 0, sliceY: 0 }] }]
      }]
    });

    expect(contract.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "SPRITE_METASPRITE_PART_REQUIRES_DECOMPOSITION", severity: "warning" })
    ]));
    expect(auditGbaHardwareBlockingErrors({
      animations: [{
        name: "boss",
        frameWidth: 96,
        frameHeight: 64,
        colorMode: "4bpp",
        frames: [{ tiles: [{ tileWidth: 24, tileHeight: 24, sliceX: 0, sliceY: 0 }] }]
      }]
    })).toEqual([]);

    expect(auditGbaHardwareBlockingErrors({
      animations: [{
        name: "invalid",
        frameWidth: 32,
        frameHeight: 32,
        colorMode: "4bpp",
        frames: [{ tiles: [{ tileWidth: 10, tileHeight: 8, sliceX: 0, sliceY: 0 }] }]
      }]
    })).toEqual(expect.arrayContaining([
      expect.stringContaining("SPRITE_METASPRITE_PART_NOT_TILE_ALIGNED")
    ]));

    expect(auditGbaHardwareBlockingErrors({
      animations: [{
        name: "too-many-parts",
        frameWidth: 128,
        frameHeight: 128,
        colorMode: "4bpp",
        frames: [{
          tiles: Array.from({ length: 33 }, (_value, tileIndex) => ({
            tileIndex,
            tileWidth: 8,
            tileHeight: 8,
            sliceX: (tileIndex % 16) * 8,
            sliceY: Math.floor(tileIndex / 16) * 8
          }))
        }]
      }]
    })).toEqual(expect.arrayContaining([
      expect.stringContaining("SPRITE_METASPRITE_PART_LIMIT_EXCEEDED")
    ]));
  });

  it("does not flag 8bpp affine backgrounds as OBJ color errors", () => {
    const contract = buildGbaHardwareContract({
      assets: [{ name: "track.png", kind: "Background", metadata: { width: 1024, height: 1024, colorMode: "8bpp-affine" } }]
    });

    expect(contract.assets[0]).toMatchObject({ role: "background", colorMode: "8bpp-affine" });
    expect(contract.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "SPRITE_ASSET_COLOR_MODE_UNSUPPORTED" })
    ]));
  });
});
