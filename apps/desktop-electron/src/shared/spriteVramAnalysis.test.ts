import { describe, expect, it } from "vitest";

import {
  analyzeSpriteVram,
  auditProjectSpriteVramBlockingErrors,
  auditProjectSpriteVramExportNotices,
  auditProjectSpriteVramWarnings,
  spriteVramWarningLabels
} from "./spriteVramAnalysis.js";

describe("sprite VRAM analysis", () => {
  it("computes tile spans and byte budgets for 4bpp animations", () => {
    const analysis = analyzeSpriteVram({
      name: "idle_down",
      spriteSheet: "hero.png",
      frameWidth: 16,
      frameHeight: 32,
      frameCount: 4,
      colorMode: "4bpp",
      frameIndices: [0, 1, 0, 1]
    });

    expect(analysis).toMatchObject({
      animationName: "idle_down",
      spriteSheet: "hero.png",
      tilesWide: 2,
      tilesHigh: 4,
      tilesPerFrame: 8,
      bytesPerTile: 32,
      frameCount: 4,
      uniqueFrameCount: 2,
      totalTileBytes: 1024,
      uniqueTileBytes: 512,
      repeatedFrameSavingsBytes: 512,
      nativeObjDimension: "16x32",
      oamEntriesPerFrame: 1,
      tileAligned: true
    });
    expect(analysis.warnings).toEqual([]);
    expect(analysis.recommendations).toContain("reuseDuplicateFrames");
  });

  it("flags horizontal OBJ tile limit and high VRAM usage", () => {
    const analysis = analyzeSpriteVram({
      name: "boss_wide",
      spriteSheet: "boss.png",
      frameWidth: 80,
      frameHeight: 80,
      frameCount: 20,
      colorMode: "4bpp",
      frameIndices: Array.from({ length: 20 }, (_, index) => index)
    });

    expect(analysis.tilesWide).toBe(10);
    expect(analysis.warnings).toEqual([
      spriteVramWarningLabels.horizontalOBJTileLimit,
      spriteVramWarningLabels.highVRAMUsage
    ]);
    expect(analysis.recommendations).toEqual([
      "splitWideSprite"
    ]);
  });

  it("rounds non-multiple-of-8 frame sizes up to GBA tile spans", () => {
    const analysis = analyzeSpriteVram({
      name: "odd_size",
      spriteSheet: "hero.png",
      frameWidth: 24,
      frameHeight: 24,
      frameCount: 1,
      colorMode: "4bpp"
    });

    expect(analysis.tilesWide).toBe(3);
    expect(analysis.tilesHigh).toBe(3);
    expect(analysis.tilesPerFrame).toBe(9);
    expect(analysis.nativeObjDimension).toBeNull();
    expect(analysis.oamEntriesPerFrame).toBe(4);
    expect(analysis.tileAligned).toBe(true);
  });

  it("keeps wide-frame guidance informational now that export builds metasprites", () => {
    const errors = auditProjectSpriteVramBlockingErrors({
      animations: [{
        name: "boss_wide",
        spriteSheet: "boss.png",
        frameWidth: 80,
        frameHeight: 16,
        frameCount: 1,
        colorMode: "4bpp"
      }]
    });

    expect(errors).toEqual([]);
  });

  it("allows a wide logical frame that the metasprite exporter decomposes", () => {
    const errors = auditProjectSpriteVramBlockingErrors({
      animations: [{
        name: "boss_metasprite",
        spriteSheet: "boss.png",
        frameWidth: 96,
        frameHeight: 64,
        frameCount: 1,
        colorMode: "4bpp"
      }]
    });

    expect(errors).toEqual([]);
  });

  it("blocks export when estimated sprite VRAM exceeds 32 KB", () => {
    const errors = auditProjectSpriteVramBlockingErrors({
      animations: [{
        name: "boss_heavy",
        spriteSheet: "boss.png",
        frameWidth: 64,
        frameHeight: 64,
        frameCount: 20,
        colorMode: "4bpp"
      }]
    });

    expect(errors).toEqual([
      `Sprite VRAM: boss_heavy (boss.png): ${spriteVramWarningLabels.highVRAMUsage}`
    ]);
  });

  it("audits all project animations for VRAM warnings", () => {
    const warnings = auditProjectSpriteVramWarnings({
      animations: [{
        name: "boss_wide",
        spriteSheet: "boss.png",
        frameWidth: 80,
        frameHeight: 80,
        frameCount: 20,
        colorMode: "4bpp"
      }]
    });

    expect(warnings).toEqual([
      `boss_wide (boss.png): ${spriteVramWarningLabels.horizontalOBJTileLimit}`,
      `boss_wide (boss.png): ${spriteVramWarningLabels.highVRAMUsage}`
    ]);
  });

  it("separates supported wide-frame decomposition as an export notice", () => {
    const notices = auditProjectSpriteVramExportNotices({
      animations: [{
        name: "menu_title",
        spriteSheet: "menu-title.png",
        frameWidth: 96,
        frameHeight: 16,
        frameCount: 1,
        colorMode: "4bpp"
      }]
    });

    expect(notices).toEqual([
      `menu_title (menu-title.png): ${spriteVramWarningLabels.horizontalOBJTileLimit}`
    ]);
  });
});
