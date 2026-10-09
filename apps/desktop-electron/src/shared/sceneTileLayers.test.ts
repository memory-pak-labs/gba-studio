import { describe, expect, it } from "vitest";

import {
  composeSceneTilemap,
  defaultSceneTileLayers,
  normalizeSceneTileLayerMapping,
  normalizeSceneTileLayers,
  paintedTileCount,
  readActiveLayerTileCells,
  runtimeTileValue,
  sceneTileLayerEmptyTile,
  sceneTileLayerOrderedMappings,
  sceneTileLayerSupportsLayers,
  setSceneTileLayerCell
} from "./sceneTileLayers.js";

describe("scene tile layers", () => {
  it("normalizes default BG layers for topdown rooms", () => {
    const layers = defaultSceneTileLayers({
      fallbackTilemap: [0, 1, 0, 2],
      height: 2,
      sceneType: "topdown",
      width: 2
    });

    expect(layers.map((layer) => layer.mapping)).toEqual(sceneTileLayerOrderedMappings);
    expect(layers.find((layer) => layer.mapping === "BG2")?.tilemap).toEqual([
      sceneTileLayerEmptyTile,
      1,
      sceneTileLayerEmptyTile,
      2
    ]);
    expect(composeSceneTilemap(layers, 2, 2)).toEqual([0, 1, 0, 2]);
  });

  it("composes later layers over earlier ones", () => {
    const layers = normalizeSceneTileLayers({
      fallbackTilemap: [0, 0, 0, 0],
      height: 2,
      layers: [
        { mapping: "BG3", tilemap: [5, 5, 5, 5], tileSourceAssetNames: [] },
        { mapping: "BG2", tilemap: [1, 1, 1, 1], tileSourceAssetNames: [] },
        { mapping: "BG1", tilemap: [sceneTileLayerEmptyTile, 9, sceneTileLayerEmptyTile, sceneTileLayerEmptyTile], tileSourceAssetNames: [] },
        { mapping: "BG0", tilemap: [sceneTileLayerEmptyTile, sceneTileLayerEmptyTile, sceneTileLayerEmptyTile, 3], tileSourceAssetNames: [] }
      ],
      sceneType: "topdown",
      width: 2
    });

    expect(composeSceneTilemap(layers, 2, 2)).toEqual([1, 9, 1, 3]);
    expect(paintedTileCount(layers, 2, 2)).toBe(4);
  });

  it("reads active layer tile cells for canvas editing", () => {
    const layers = normalizeSceneTileLayers({
      fallbackTilemap: [0, 0, 0, 0],
      height: 2,
      layers: [
        { mapping: "BG3", tilemap: [5, 5, 5, 5], tileSourceAssetNames: [] },
        { mapping: "BG2", tilemap: [1, sceneTileLayerEmptyTile, sceneTileLayerEmptyTile, sceneTileLayerEmptyTile], tileSourceAssetNames: [] }
      ],
      sceneType: "topdown",
      width: 2
    });

    expect(readActiveLayerTileCells(layers, "BG2", 2, 2)).toEqual([1, 0, 0, 0]);
    expect(readActiveLayerTileCells(layers, "BG3", 2, 2)).toEqual([5, 5, 5, 5]);
    expect(composeSceneTilemap(layers, 2, 2)).toEqual([1, 5, 5, 5]);
  });

  it("uses BG3/BG2 for isometric ground and BG1/BG0 for upper layers", () => {
    expect(sceneTileLayerSupportsLayers("isometric")).toBe(true);
    expect(defaultSceneTileLayers({
      fallbackTilemap: [1, 2],
      height: 1,
      sceneType: "isometric",
      width: 2
    })).toEqual([
      { mapping: "BG3", tilemap: [-1, -1], tileSourceAssetNames: [] },
      { mapping: "BG2", tilemap: [1, 2], tileSourceAssetNames: [] },
      { mapping: "BG1", tilemap: [-1, -1], tileSourceAssetNames: [] },
      { mapping: "BG0", tilemap: [-1, -1], tileSourceAssetNames: [] }
    ]);
  });

  it("updates the active layer and recomposes the exported tilemap", () => {
    const initial = defaultSceneTileLayers({
      fallbackTilemap: [0, 0, 0, 0],
      height: 2,
      sceneType: "topdown",
      width: 2
    });
    const updated = setSceneTileLayerCell({
      backgroundAssetName: "overworld.png",
      cellIndex: 1,
      height: 2,
      layers: initial,
      mapping: "BG1",
      sceneType: "topdown",
      tileID: 7,
      tool: "brush",
      width: 2
    });

    expect(updated.layers.find((layer) => layer.mapping === "BG1")?.tilemap[1]).toBe(7);
    expect(updated.exportTilemap[1]).toBe(7);
    expect(normalizeSceneTileLayerMapping("bg2")).toBe("BG2");
    expect(runtimeTileValue(sceneTileLayerEmptyTile)).toBe(0);
  });
});
