import { describe, expect, it } from "vitest";
import {
  exportSceneResourceManifest,
  normalizeSceneResourceManifest,
  sceneResourceManifestIssues
} from "./sceneResourceContract.js";

describe("scene resource contract", () => {
  it("does not enable resources when the scene has no manifest", () => {
    const manifest = normalizeSceneResourceManifest(undefined);

    expect(manifest.resources).toEqual([]);
    expect(manifest.dependencies).toEqual([]);
    expect(exportSceneResourceManifest(undefined)).toEqual({
      schema: 1,
      resources: [],
      dependencies: []
    });
  });

  it("requires typed storage, group, cache and fallback data", () => {
    const issues = sceneResourceManifestIssues({
      schema: 1,
      resources: [{
        id: "storm",
        assetId: "storm.affine.png",
        kind: "affine_bg",
        enabled: true,
        required: true,
        bpp: 4,
        palette: { id: "storm", slot: "background", colors: 256 },
        compression: "rle16",
        tileLimit: 257,
        resourceGroup: "storm",
        prefetch: "scene",
        cache: "resident",
        evictionPriority: 1,
        dependencies: [],
        fallback: { mode: "error" },
        budget: { bgTiles: 1, objTiles: 0, oam: 0, paletteColors: 16, vramBytes: 64, eventBytes: 0, audioBytes: 0, dmaBytes: 0, vblankTicks: 0, cpuWorkTicks: 0 }
      }]
    });

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "INVALID_BPP",
      "INVALID_PALETTE",
      "INVALID_TILE_LIMIT"
    ]));
  });

  it("exports an explicit scene dependency manifest without inventing entries", () => {
    const exported = exportSceneResourceManifest({
      resources: [{
        id: "storm",
        assetId: "storm.affine.png",
        kind: "affine_bg",
        enabled: true,
        required: false,
        bpp: 8,
        palette: { id: "storm", slot: "background", colors: 256 },
        compression: "lz77",
        tileLimit: 256,
        resourceGroup: "scene_storm",
        prefetch: "scene",
        cache: "evictable",
        evictionPriority: 8,
        dependencies: ["storm_palette"],
        fallback: { mode: "omit_decorative" },
        budget: { bgTiles: 64, objTiles: 0, oam: 0, paletteColors: 16, vramBytes: 4096, eventBytes: 0, audioBytes: 0, dmaBytes: 2048, vblankTicks: 0, cpuWorkTicks: 120 }
      }],
      dependencies: ["storm_palette"]
    });

    expect(exported).toMatchObject({
      schema: 1,
      dependencies: ["storm_palette"],
      resources: [{
        id: "storm",
        bpp: 8,
        resource_group: "scene_storm",
        prefetch: "scene",
        cache: "evictable",
        fallback: { mode: "omit_decorative" }
      }]
    });
  });

  it("requires every declared resource to bind to an asset explicitly", () => {
    const issues = sceneResourceManifestIssues({
      resources: [{
        id: "storm",
        kind: "affine_bg",
        enabled: true,
        required: true,
        bpp: 8,
        palette: { id: "storm", slot: "background", colors: 256 },
        compression: "none",
        tileLimit: 256,
        resourceGroup: "storm",
        prefetch: "scene",
        cache: "resident",
        evictionPriority: 1,
        dependencies: [],
        fallback: { mode: "error" },
        budget: { bgTiles: 1, objTiles: 0, oam: 0, paletteColors: 16, vramBytes: 64, eventBytes: 0, audioBytes: 0, dmaBytes: 0, vblankTicks: 0, cpuWorkTicks: 0 }
      }]
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: "MISSING_RESOURCE_FIELD",
      field: "assetId"
    }));
  });

  it("normalizes auto and manual compression policies while preserving legacy strings", () => {
    const auto = normalizeSceneResourceManifest({
      resources: [{ id: "forest", assetId: "forest.png", kind: "regular_bg", compression: "auto" }]
    });
    const legacy = normalizeSceneResourceManifest({
      resources: [{ id: "forest", assetId: "forest.png", kind: "regular_bg", compression: "lz77" }]
    });
    const manual = normalizeSceneResourceManifest({
      resources: [{
        id: "forest",
        assetId: "forest.png",
        kind: "regular_bg",
        compression: { strategy: "manual", tiles: "huffman", tilemap: "lz77", palette: "none" }
      }]
    });

    expect(auto.resources[0]?.compression).toEqual({
      strategy: "auto",
      tiles: "auto",
      tilemap: "auto",
      palette: "auto"
    });
    expect(legacy.resources[0]?.compression).toEqual({
      strategy: "manual",
      tiles: "lz77",
      tilemap: "lz77",
      palette: "lz77"
    });
    expect(manual.resources[0]?.compression).toEqual({
      strategy: "manual",
      tiles: "huffman",
      tilemap: "lz77",
      palette: "none"
    });
  });

  it("validates Huffman policies and rejects compression components incompatible with the resource kind", () => {
    const issues = sceneResourceManifestIssues({
      resources: [{
        id: "storm",
        assetId: "storm.affine.png",
        kind: "affine_bg",
        enabled: true,
        required: true,
        bpp: 8,
        palette: { id: "storm", slot: "background", colors: 256 },
        compression: { strategy: "manual", tiles: "none", tilemap: "rle16", palette: "huffman" },
        tileLimit: 256,
        resourceGroup: "storm",
        prefetch: "scene",
        cache: "resident",
        evictionPriority: 1,
        dependencies: [],
        fallback: { mode: "error" },
        budget: { bgTiles: 1, objTiles: 0, oam: 0, paletteColors: 16, vramBytes: 64, eventBytes: 0, audioBytes: 0, dmaBytes: 0, vblankTicks: 0, cpuWorkTicks: 0 }
      }]
    });

    expect(issues).toContainEqual(expect.objectContaining({ code: "INVALID_COMPRESSION", field: "compression.tilemap" }));
    expect(issues).not.toContainEqual(expect.objectContaining({ code: "INVALID_COMPRESSION", field: "compression.palette" }));
  });

  it("exports auto as the compact form and manual policies as explicit component choices", () => {
    const exported = exportSceneResourceManifest({
      resources: [
        { id: "auto", assetId: "auto.png", kind: "regular_bg", enabled: true, compression: "auto" },
        {
          id: "manual",
          assetId: "manual.png",
          kind: "regular_bg",
          enabled: true,
          compression: { strategy: "manual", tiles: "huffman", tilemap: "lz77", palette: "none" }
        }
      ]
    });

    expect(exported.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "auto", compression: "auto" }),
      expect.objectContaining({
        id: "manual",
        compression: { strategy: "manual", tiles: "huffman", tilemap: "lz77", palette: "none" }
      })
    ]));
  });
});
