import { describe, expect, it } from "vitest";

import type { GBAProjectData } from "./projectFile.js";
import { buildActorEngineSpriteExport, buildAssetcSpritePackGeneration } from "./engineProjectExport.js";

function frameParts(
  width: number,
  height: number,
  explicitTile: boolean,
  flipX = false,
  tileWidth = width,
  tileHeight = height
) {
  const spriteSheet = "sprite.png";
  const actor = { id: "actor", name: "Actor", spriteSheet, animationName: "idle" };
  const project = {
    assets: [{ id: "asset", name: spriteSheet, kind: "Sprite", metadata: { source: "Assets/sprites/sprite.png" } }],
    actors: [actor],
    animations: [{
      id: "idle",
      name: "idle",
      spriteSheet,
      frameWidth: width,
      frameHeight: height,
      frames: [{
        frameIndex: 0,
        ...(explicitTile ? { tiles: [{ x: 0, y: 0, sliceX: 0, sliceY: 0, tileWidth, tileHeight, flipX }] } : {})
      }]
    }]
  } as GBAProjectData;
  const pack = buildAssetcSpritePackGeneration(project);
  return buildActorEngineSpriteExport(project, actor, pack)?.animations?.[0]?.frame_metasprites?.[0]?.parts;
}

describe("contiguous metasprite frame parts", () => {
  it.each([[128, 32], [48, 48], [96, 64]])(
    "exports a %ix%i whole-frame tile with the native backing layout",
    (width, height) => {
      const implicit = frameParts(width, height, false);
      const explicit = frameParts(width, height, true);
      expect(implicit).toBeDefined();
      expect(explicit?.map(({ slice_x, slice_y, width, height }) => ({ slice_x, slice_y, width, height })))
        .toEqual(implicit?.map(({ slice_x, slice_y, width, height }) => ({ slice_x, slice_y, width, height })));
      expect(explicit?.map((part) => part.x))
        .toEqual(implicit?.map((part) => part.x + Math.max(0, Math.floor(width / 2) - 8)));
      expect(implicit!.length).toBeLessThanOrEqual(32);
    }
  );

  it("mirrors native subparts without changing their source slices", () => {
    const normal = frameParts(96, 64, true)!;
    const flipped = frameParts(96, 64, true, true)!;
    expect(flipped.map(({ slice_x, slice_y, width, height }) => ({ slice_x, slice_y, width, height })))
      .toEqual(normal.map(({ slice_x, slice_y, width, height }) => ({ slice_x, slice_y, width, height })));
    expect(flipped.map((part) => part.x))
      .toEqual(normal.map((part) => 96 - part.width - part.x));
    expect(flipped.every((part) => part.hflip)).toBe(true);
  });

  it("keeps tile-level backing for an independently placed partial tile", () => {
    const parts = frameParts(32, 32, true, false, 16, 16);
    expect(parts).toHaveLength(4);
    expect(parts?.every((part) => part.width === 8 && part.height === 8)).toBe(true);
  });
});
