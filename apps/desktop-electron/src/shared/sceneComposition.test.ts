import { describe, expect, it } from "vitest";
import {
  defaultSceneComposition,
  exportSceneComposition,
  normalizeSceneComposition,
  sceneCompositionIssues,
  sceneCompositionVideoMode
} from "./sceneComposition.js";

describe("scene composition contract", () => {
  it("keeps the scene tiled and disabled when no opt-in is configured", () => {
    const composition = normalizeSceneComposition(undefined);

    expect(composition).toEqual(defaultSceneComposition());
    expect(composition.enabled).toBe(false);
    expect(composition.mode).toBe("tilemap");
    expect(composition.layers).toEqual([]);
    expect(sceneCompositionVideoMode(composition)).toBe(0);
    expect(exportSceneComposition(undefined)).toMatchObject({
      enabled: false,
      default_tiled: true,
      display_mode: 0,
      layers: []
    });
  });

  it("rejects affine and bitmap layers used as gameplay or in an incompatible mode", () => {
    const composition = normalizeSceneComposition({
      enabled: true,
      mode: "bitmap4",
      layers: [
        {
          id: "playfield",
          kind: "regular_bg",
          role: "gameplay",
          layer: "BG2",
          assetId: "field.png"
        },
        {
          id: "storm",
          kind: "affine_bg",
          role: "gameplay",
          layer: "BG2",
          assetId: "storm.png"
        }
      ]
    });

    const issues = sceneCompositionIssues(composition, "shmup");

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "MODE_LAYER_INCOMPATIBLE",
      "GAMEPLAY_LAYER_UNSUPPORTED"
    ]));
  });

  it("exports only explicitly enabled layers and their declared physical budget", () => {
    const exported = exportSceneComposition({
      enabled: true,
      mode: "affine",
      layers: [{
        id: "storm",
        kind: "affine_bg",
        role: "decorative",
        layer: "BG2",
        priority: 2,
        assetId: "storm.affine.png",
        parallax: { x256: 128, y256: 256 }
      }],
      budget: { bgTiles: 64, objTiles: 0, oam: 0, paletteColors: 16, vramBytes: 4096, eventBytes: 0, audioBytes: 0, dmaBytes: 4096, vblankTicks: 0, cpuWorkTicks: 180 }
    });

    expect(exported).toMatchObject({
      enabled: true,
      default_tiled: false,
      display_mode: 1,
      layers: [{
        id: "storm",
        asset: "storm.affine.png",
        role: "decorative",
        priority: 2,
        parallax_x256: 128
      }],
      budget: { bgTiles: 64, vramBytes: 4096, cpuWorkTicks: 180 }
    });
  });

  it("does not normalize away an invalid mode in an enabled raw contract", () => {
    const issues = sceneCompositionIssues({
      enabled: true,
      mode: "unsupported-mode",
      layers: [],
      budget: {
        bgTiles: 0,
        objTiles: 0,
        oam: 0,
        paletteColors: 0,
        vramBytes: 0,
        eventBytes: 0,
        audioBytes: 0,
        dmaBytes: 0,
        vblankTicks: 0,
        cpuWorkTicks: 0
      }
    });

    expect(issues.map((issue) => issue.code)).toContain("INVALID_MODE");
  });

  it("rejects malformed raw layers instead of silently applying defaults", () => {
    const issues = sceneCompositionIssues({
      enabled: true,
      mode: "affine",
      layers: [{
        id: "invalid",
        kind: "unknown",
        role: "gameplay",
        layer: "BITMAP",
        assetId: "background.png"
      }],
      budget: {
        bgTiles: 0,
        objTiles: 0,
        oam: 0,
        paletteColors: 0,
        vramBytes: 0,
        eventBytes: 0,
        audioBytes: 0,
        dmaBytes: 0,
        vblankTicks: 0,
        cpuWorkTicks: 0
      }
    });

    expect(issues.map((issue) => issue.code)).toContain("INVALID_LAYER");
  });

  it("supports an explicit HBlank/HDMA timeline made of 160-line keyframes", () => {
    const firstOffsets = Array.from({ length: 160 }, (_entry, index) => index);
    const secondOffsets = Array.from({ length: 160 }, (_entry, index) => 160 - index);
    const source = {
      enabled: true,
      mode: "tilemap",
      layers: [],
      effects: {
        hblank: {
          enabled: true,
          layer: "BG2",
          hdma: true,
          scrollOffsets: firstOffsets,
          timeline: [
            { frame: 0, scrollOffsets: firstOffsets },
            { frame: 30, scrollOffsets: secondOffsets }
          ]
        }
      },
      budget: {
        bgTiles: 0,
        objTiles: 0,
        oam: 0,
        paletteColors: 0,
        vramBytes: 0,
        eventBytes: 0,
        audioBytes: 0,
        dmaBytes: 320,
        vblankTicks: 160,
        cpuWorkTicks: 180
      }
    };

    expect(sceneCompositionIssues(source, "shmup")).toEqual([]);
    const normalized = normalizeSceneComposition(source);
    expect(normalized.effects.hblank.timeline).toEqual([
      { frame: 0, scrollOffsets: firstOffsets },
      { frame: 30, scrollOffsets: secondOffsets }
    ]);
    expect(exportSceneComposition(source).effects.hblank.timeline).toEqual([
      { frame: 0, scroll_offsets: firstOffsets },
      { frame: 30, scroll_offsets: secondOffsets }
    ]);
  });

  it("rejects HBlank timelines without HDMA, with short tables or out-of-order frames", () => {
    const issues = sceneCompositionIssues({
      enabled: true,
      mode: "tilemap",
      layers: [],
      effects: {
        hblank: {
          enabled: true,
          layer: "BG2",
          hdma: false,
          scrollOffsets: Array.from({ length: 160 }, () => 0),
          timeline: [
            { frame: 4, scrollOffsets: Array.from({ length: 159 }, () => 0) },
            { frame: 2, scrollOffsets: Array.from({ length: 160 }, () => 0) }
          ]
        }
      },
      budget: {
        bgTiles: 0,
        objTiles: 0,
        oam: 0,
        paletteColors: 0,
        vramBytes: 0,
        eventBytes: 0,
        audioBytes: 0,
        dmaBytes: 0,
        vblankTicks: 0,
        cpuWorkTicks: 0
      }
    }, "shmup");

    expect(issues.map((issue) => issue.code)).toContain("INVALID_HBLANK_TIMELINE");
  });
});
