import { describe, expect, it } from "vitest";
import { blendScanlineColors, normalizeSceneRasterEffects, rasterScanline, sceneScanlineControls, sceneRasterEffectIssues } from "./sceneRasterEffects.js";
import { defaultSceneComposition, exportSceneComposition, normalizeSceneComposition } from "./sceneComposition.js";

describe("simple scene raster effects", () => {
  it("keeps opt-in separate from existing authored HBlank tables", () => {
    const initial = defaultSceneComposition();
    const effects = normalizeSceneRasterEffects(undefined);
    expect(effects.ripple.enabled || effects.gradient.enabled).toBe(false);
    const composition = normalizeSceneComposition({ ...initial, enabled: true, effects: { ...initial.effects, raster: { ...effects, ripple: { ...effects.ripple, enabled: true } } } });
    expect(exportSceneComposition(composition).effects.raster?.ripple.enabled).toBe(true);
    expect(composition.effects.hblank).toEqual(initial.effects.hblank);
  });
  it("matches integer wave phases and RGB555 gradient endpoints", () => {
    const effects = normalizeSceneRasterEffects({ ripple: { enabled: true, amplitude: 8, wavelength: 32, speed: 4, top: 40, bottom: 120 }, gradient: { enabled: true, from: "#000000", to: "#ffffff", top: 0, bottom: 32 } });
    expect(rasterScanline(effects, 0, 0)).toEqual({ offset: 0, color: 0 });
    expect(rasterScanline(effects, 31, 0).color).toBe(32767);
    expect(rasterScanline(effects, 48, 0).offset).toBe(8);
    expect(rasterScanline(effects, 64, 0).offset).toBe(-8);
    expect(rasterScanline(effects, 40, 16).offset).toBe(8);
    expect(rasterScanline(effects, 120, 0).offset).toBe(0);
  });
  it("rejects malformed colors, ranges and concurrent scroll ownership", () => {
    expect(sceneRasterEffectIssues({ gradient: { enabled: true, from: "red", to: "#ffffff", top: 20, bottom: 10 } }, "tilemap", false).length).toBeGreaterThan(0);
    expect(sceneRasterEffectIssues({ ripple: { enabled: true, layer: "BG2", amplitude: 80 } }, "tilemap", false).length).toBeGreaterThan(0);
    expect(sceneRasterEffectIssues({ ripple: { enabled: true } }, "tilemap", true).join(" ")).toMatch(/HBlank/);
    expect(sceneRasterEffectIssues({ ripple: { enabled: true, layer: "BG2" } }, "affine", false).length).toBeGreaterThan(0);
  });
  it("interpolates control endpoints and keeps the full layer outside the mask band", () => {
    const effects = normalizeSceneRasterEffects({
      palette: { enabled: true, index: 19, from: "#ff0000", to: "#0000ff", top: 10, bottom: 13 },
      alpha: { enabled: true, from: 16, to: 0, top: 10, bottom: 13 },
      mask: { enabled: true, leftTop: 10, rightTop: 230, leftBottom: 50, rightBottom: 190, top: 10, bottom: 13 }
    });
    expect(sceneScanlineControls(effects, 9)).toEqual({ paletteColor: 31, alpha: 16, left: 0, right: 240 });
    const middle = sceneScanlineControls(effects, 11);
    expect(middle).toEqual({ paletteColor: 15 | (15 << 10), alpha: 8, left: 30, right: 210 });
    expect(blendScanlineColors(middle.paletteColor!, 31 << 5, middle.alpha!)).toBe(7 | (15 << 5) | (7 << 10));
    expect(sceneScanlineControls(effects, 13)).toEqual({ paletteColor: 31744, alpha: 0, left: 0, right: 240 });
  });

  it("rejects invalid palette indices, repeated blend targets and crossed mask edges", () => {
    const issues = sceneRasterEffectIssues({
      palette: { enabled: true, index: 0 },
      alpha: { enabled: true, first: "BG2", second: "BG2" },
      mask: { enabled: true, leftTop: 190, rightTop: 25 }
    }, "tilemap", false);
    expect(issues).toHaveLength(3);
    expect(sceneRasterEffectIssues({ mask: { enabled: true, layer: "BG3" } }, "affine", false)).toHaveLength(1);
    expect(sceneRasterEffectIssues({ alpha: { enabled: true } }, "bitmap4", false)).toHaveLength(1);
    expect(sceneRasterEffectIssues({ mask: { enabled: true, layer: "BG3" } }, "affine", false, 2)).toHaveLength(0);
    expect(sceneRasterEffectIssues({ mask: { enabled: true, layer: "BG1" } }, "affine", false, 2)).toHaveLength(1);
  });
});
