import { describe, expect, it } from "vitest";
import { normalizeSceneRasterEffects, rasterScanline, sceneRasterEffectIssues } from "./sceneRasterEffects.js";
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
});
