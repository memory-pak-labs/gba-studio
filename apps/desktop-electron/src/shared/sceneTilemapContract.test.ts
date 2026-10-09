import { describe, expect, it } from "vitest";

import {
  exportSceneTilemapContract,
  resolveSceneTilemapContract,
  sceneTilemapCellIndexesForCell,
  sceneTilemapCellIndexesForRectangle
} from "./sceneTilemapContract.js";

describe("scene tilemap contract", () => {
  it("uses 16x16 metatiles with two logical layers for an even topdown map", () => {
    const contract = resolveSceneTilemapContract("topdown", 60, 40);

    expect(contract).toEqual({
      collisionUnit: "metatile",
      id: "gba-regular-metatile-2x2-v1",
      logicalLayers: [
        { hardwareMapping: "BG2", id: "base", source: "visual_tiles" },
        { hardwareMapping: "BG1", id: "top", source: "foreground_tiles" }
      ],
      metatileHeight: 2,
      metatileWidth: 2,
      model: "regular-tiled",
      tileHeight: 8,
      tileWidth: 8
    });
  });

  it("does not claim a metatile contract for odd-sized maps", () => {
    expect(resolveSceneTilemapContract("topdown", 59, 40)).toBeNull();
    expect(resolveSceneTilemapContract("menu", 60, 40)).toBeNull();
    expect(resolveSceneTilemapContract("racing", 60, 40)).not.toBeNull();
  });

  it("exports the logical contract without exposing editor-only names", () => {
    const contract = resolveSceneTilemapContract("topdown", 60, 40);
    expect(contract).not.toBeNull();
    expect(exportSceneTilemapContract(contract!)).toEqual({
      collision_unit: "metatile",
      id: "gba-regular-metatile-2x2-v1",
      logical_layers: [
        { hardware_mapping: "bg2", id: "base", source: "visual_tiles" },
        { hardware_mapping: "bg1", id: "top", source: "foreground_tiles" }
      ],
      metatile_height: 2,
      metatile_width: 2,
      model: "regular_tiled",
      tile_height: 8,
      tile_width: 8
    });
  });

  it("projects one collision edit to the physical cells of its metatile", () => {
    const contract = resolveSceneTilemapContract("topdown", 6, 4);

    expect(sceneTilemapCellIndexesForCell(6, 4, 7, contract)).toEqual([0, 1, 6, 7]);
    expect(sceneTilemapCellIndexesForCell(6, 4, 23, contract)).toEqual([16, 17, 22, 23]);
    expect(sceneTilemapCellIndexesForCell(6, 4, 7, null)).toEqual([7]);
  });

  it("expands a collision rectangle to complete metatiles", () => {
    const contract = resolveSceneTilemapContract("topdown", 6, 4);

    expect(sceneTilemapCellIndexesForRectangle(6, 4, 7, 13, contract)).toEqual([
      0, 1,
      6, 7,
      12, 13,
      18, 19
    ]);
  });
});
