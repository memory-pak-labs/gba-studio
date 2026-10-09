import { describe, expect, it } from "vitest";
import { canvasPointToRoomTile } from "./roomsWorkspace/core.js";
import { DEFAULT_ISOMETRIC_SCENE_CONFIG } from "./sceneTypeProfiles.js";

import {
  canvasPointToIsometricRoomTile,
  compileIsometricRoomTiles,
  deriveIsometricGeometryContract,
  isometricRoomTileDiamondPoints,
  isometricSpriteFeetOffset,
  orderedIsometricPreviewTileLayers,
  projectIsometricCoordinate
} from "./isometricProjection.js";

describe("isometric projection contract", () => {
  const elevatedConfig = { ...DEFAULT_ISOMETRIC_SCENE_CONFIG, tileWidth: 24, tileHeight: 12, heightStep: 16, originX: 265, originY: -71 };
  const elevatedSurface = { width: 512, height: 344 };

  it("draws elevated cell diamonds at the same height as their actors", () => {
    const points = isometricRoomTileDiamondPoints(36, 26, 12, elevatedConfig, elevatedSurface, 3);
    const top = projectIsometricCoordinate({ x: 26, y: 12, z: 3 }, elevatedConfig);
    expect(points[0]).toEqual(top);
    expect(points[2]).toEqual({ x: top.x, y: top.y + elevatedConfig.tileHeight });
  });

  it.each([0.5, 1, 3.95])("picks the elevated visible cell at canvas scale %s", (scale) => {
    const heightLevels = Array(36 * 36).fill(0);
    heightLevels[12 * 36 + 26] = 3;
    const center = projectIsometricCoordinate({ x: 26, y: 12, z: 3 }, elevatedConfig);
    expect(canvasPointToRoomTile({
      canvasHeight: elevatedSurface.height * scale,
      canvasWidth: elevatedSurface.width * scale,
      heightLevels,
      isometricConfig: elevatedConfig,
      isometricSurfaceSize: elevatedSurface,
      pointX: center.x * scale,
      pointY: (center.y + elevatedConfig.tileHeight / 2) * scale,
      projection: "isometric",
      roomHeight: 36,
      roomWidth: 36
    })).toEqual({ x: 26, y: 12 });
  });

  it("picks the frontmost surface when elevated diamonds overlap", () => {
    const heightLevels = Array(8 * 8).fill(0);
    heightLevels[2 * 8 + 2] = 1;
    heightLevels[3 * 8 + 3] = 3;
    expect(canvasPointToIsometricRoomTile({
      canvasHeight: 160, canvasWidth: 240,
      config: { ...elevatedConfig, originX: 120, originY: 24, heightStep: 6 },
      heightLevels, pointX: 120, pointY: 48,
      roomHeight: 8, roomWidth: 8, surfaceSize: { width: 240, height: 160 },
      useWorldCoordinates: true
    })).toEqual({ x: 3, y: 3 });
  });

  it("projects 32x16 tiles and one-level elevation exactly like the GBA engine", () => {
    const config = { tileWidth: 32, tileHeight: 16, heightStep: 8, originX: 120, originY: 16, presentationZoom: 100 };

    expect(projectIsometricCoordinate({ x: 0, y: 0, z: 0 }, config)).toEqual({ x: 120, y: 16 });
    expect(projectIsometricCoordinate({ x: 1, y: 0, z: 0 }, config)).toEqual({ x: 136, y: 24 });
    expect(projectIsometricCoordinate({ x: 0, y: 1, z: 0 }, config)).toEqual({ x: 104, y: 24 });
    expect(projectIsometricCoordinate({ x: 1, y: 1, z: 0 }, config)).toEqual({ x: 120, y: 32 });
    expect(projectIsometricCoordinate({ x: 2, y: 1, z: 0 }, config)).toEqual({ x: 136, y: 40 });
    expect(projectIsometricCoordinate({ x: 2, y: 1, z: 1 }, config)).toEqual({ x: 136, y: 32 });
  });

  it("anchors a 32x32 actor by the center of its feet on a 32x16 tile", () => {
    expect(isometricSpriteFeetOffset(32, 32, 16)).toEqual({ x: -16, y: -24 });
  });

  it("anchors 16x16 and 16x32 actors on the same diamond center", () => {
    expect(isometricSpriteFeetOffset(16, 16, 16)).toEqual({ x: -8, y: -8 });
    expect(isometricSpriteFeetOffset(16, 32, 16)).toEqual({ x: -8, y: -24 });
  });

  it("mantém mundo, viewport e grade em coordenadas explícitas para uma arena paginada", () => {
    const config = { tileWidth: 32, tileHeight: 16, heightStep: 8, originX: 120, originY: 24, presentationZoom: 100 };
    const surfaceSize = { height: 320, width: 480 };

    expect(isometricRoomTileDiamondPoints(8, 0, 0, config, surfaceSize)).toEqual([
      { x: 120, y: 24 },
      { x: 136, y: 32 },
      { x: 120, y: 40 },
      { x: 104, y: 32 }
    ]);
    expect(deriveIsometricGeometryContract({
      config,
      roomHeight: 8,
      roomWidth: 12,
      surfaceSize
    })).toMatchObject({
      cameraBounds: { height: 160, width: 240, x: 120, y: 80 },
      gridBounds: { height: 160, width: 320, x: -8, y: 24 },
      origin: { x: 120, y: 24 },
      viewport: { height: 160, width: 240 },
      world: surfaceSize,
      worldBounds: { height: 320, width: 480, x: 0, y: 0 }
    });
  });

  it("converte pontos da viewport de volta para a grade no mundo explícito", () => {
    const config = { tileWidth: 32, tileHeight: 16, heightStep: 8, originX: 120, originY: 24, presentationZoom: 100 };
    const surfaceSize = { height: 320, width: 480 };
    const result = canvasPointToIsometricRoomTile({
      canvasHeight: 320,
      canvasWidth: 480,
      config,
      pointX: 120,
      pointY: 32,
      roomHeight: 8,
      roomWidth: 12,
      surfaceSize,
      useWorldCoordinates: true
    });

    expect(result).toEqual({ x: 0, y: 0 });
  });

  it("respeita a viewport inicial declarada pela apresentação paginada", () => {
    const config = { tileWidth: 32, tileHeight: 16, heightStep: 8, originX: 120, originY: 24, presentationZoom: 100 };
    const geometry = deriveIsometricGeometryContract({
      cameraBounds: { height: 160, width: 240, x: 0, y: 0 },
      config,
      roomHeight: 8,
      roomWidth: 12,
      surfaceSize: { height: 320, width: 480 }
    });

    expect(geometry.cameraBounds).toEqual({ height: 160, width: 240, x: 0, y: 0 });
  });

  it("mantém a grade tática dentro da borda esquerda da superfície", () => {
    const geometry = deriveIsometricGeometryContract({
      config: { tileWidth: 32, tileHeight: 16, heightStep: 8, originX: 128, originY: 24, presentationZoom: 100 },
      roomHeight: 8,
      roomWidth: 12,
      surfaceSize: { height: 320, width: 480 }
    });

    expect(geometry.gridBounds).toMatchObject({ height: 160, width: 320, x: 0, y: 24 });
  });

  it("compiles one canonical tile representation for preview and engine export", () => {
    expect(compileIsometricRoomTiles({
      height: 2,
      heightLevels: [0, 1, 2, 99],
      tileLayers: [
        { mapping: "BG2", tilemap: [1, 2, 3, 4] },
        { mapping: "BG1", tilemap: [-1, 5, Number.NaN, 6] }
      ],
      visualTiles: [9, 9, 9, 9],
      width: 2
    })).toEqual({
      backgroundLayers: {
        bg0: [0, 0, 0, 0],
        bg1: [0, 5, 0, 6],
        bg2: [1, 2, 3, 4],
        bg3: [0, 0, 0, 0]
      },
      heightLevels: [0, 1, 2, 15],
      visualTiles: [1, 2, 3, 4]
    });
  });

  it("ordena a composição do preview com a superfície antes do foreground autorado", () => {
    const compiled = compileIsometricRoomTiles({
      height: 1,
      tileLayers: [
        { mapping: "BG0", tilemap: [7] },
        { mapping: "BG1", tilemap: [6] },
        { mapping: "BG2", tilemap: [5] },
        { mapping: "BG3", tilemap: [4] }
      ],
      width: 1
    });

    expect(orderedIsometricPreviewTileLayers(compiled)).toEqual([
      { mapping: "BG2", tilemap: [5] },
      { mapping: "BG1", tilemap: [6] },
      { mapping: "BG0", tilemap: [7] },
      { mapping: "BG3", tilemap: [4] }
    ]);
  });
});
