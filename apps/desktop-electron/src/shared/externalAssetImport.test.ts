import { describe, expect, it } from "vitest";
import { parseAsepriteExport, parseTiledTsx } from "./externalAssetImport.js";

describe("external asset import", () => {
  it("preserves Aseprite frames, tags, slices and animation duration", () => {
    const result = parseAsepriteExport({
      frames: {
        "hero 0.png": { frame: { x: 0, y: 0, w: 16, h: 16 }, duration: 80 },
        "hero 1.png": { frame: { x: 16, y: 0, w: 16, h: 16 }, duration: 120 }
      },
      meta: {
        image: "hero.png",
        frameTags: [{ name: "walk", from: 0, to: 1, direction: "pingpong" }],
        slices: [{ name: "hitbox", keys: [{ frame: 0, bounds: { x: 2, y: 3, w: 10, h: 12 } }] }]
      }
    });

    expect(result.image).toBe("hero.png");
    expect(result.durationMs).toBe(200);
    expect(result.frames).toHaveLength(2);
    expect(result.tags[0]).toMatchObject({ name: "walk", direction: "pingpong" });
    expect(result.slices[0].keys[0].bounds).toEqual({ x: 2, y: 3, w: 10, h: 12 });
  });

  it("reads external TSX tiles, animations and Wang Sets", () => {
    const result = parseTiledTsx(`<?xml version="1.0"?>
      <tileset version="1.10" name="terrain" tilewidth="8" tileheight="8" tilecount="32" columns="8">
        <image source="terrain.png" width="64" height="32"/>
        <tile id="5"><animation><frame tileid="5" duration="100"/><frame tileid="6" duration="120"/></animation></tile>
        <wangsets><wangset name="Ground" type="mixed" tile="-1"><wangcolor name="Grass" color="#00ff00" tile="1" probability="1"/></wangset></wangsets>
      </tileset>`);

    expect(result).toMatchObject({
      name: "terrain",
      tileWidth: 8,
      tileHeight: 8,
      tileCount: 32,
      columns: 8,
      image: { source: "terrain.png", width: 64, height: 32 }
    });
    expect(result.tiles[0].animation).toEqual([
      { tileID: 5, durationMs: 100 },
      { tileID: 6, durationMs: 120 }
    ]);
    expect(result.wangSets[0]).toMatchObject({ name: "Ground", colors: [{ name: "Grass", tileID: 1 }] });
  });
});
