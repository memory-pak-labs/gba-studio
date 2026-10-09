import { describe, expect, it } from "vitest";
import {
  compactProjectTilemaps,
  decodeCompactSequence,
  decodeMetatileSequence,
  encodeCompactSequence,
  encodeMetatileSequence,
  expandProjectTilemaps,
  joinSplitProjectResources,
  splitProjectResources
} from "./projectResourceFormat.js";

describe("project resource format", () => {
  it("round-trips numeric and collision sequences with deterministic RLE", () => {
    const numeric = [0, 0, 0, 4, 4, 1, 1, 1, 1];
    const collisions = ["free", "free", "solid", "solid", "ladder"];

    expect(decodeCompactSequence(encodeCompactSequence(numeric))).toEqual(numeric);
    expect(decodeCompactSequence(encodeCompactSequence(collisions))).toEqual(collisions);
    expect(encodeCompactSequence(numeric)).toEqual({
      encoding: "rle-v1",
      length: 9,
      runs: [[0, 3], [4, 2], [1, 4]]
    });
  });

  it("compacts and expands room tilemaps, layers and collisions without changing runtime data", () => {
    const project = {
      schemaVersion: 2,
      name: "Compact",
      rooms: [{
        id: "room-a",
        name: "Room A",
        width: 4,
        height: 2,
        tilemap: [0, 0, 1, 1, 1, 1, 0, 0],
        collisions: [0, 0, 1, 1, 1, 1, 0, 0],
        collisionTypes: ["free", "free", "solid", "solid", "solid", "solid", "free", "free"],
        tileLayers: [
          { mapping: "BG3", tilemap: [2, 2, 2, 2, 0, 0, 0, 0] },
          { mapping: "BG2", tilemap: [0, 0, 3, 3, 3, 3, 0, 0] }
        ]
      }]
    };

    const compact = compactProjectTilemaps(project);
    expect(compact).not.toBe(project);
    expect((compact.rooms as Array<Record<string, unknown>>)[0].tilemap).toMatchObject({
      encoding: "rle-v1",
      length: 8
    });
    expect(expandProjectTilemaps(compact)).toEqual(project);
  });

  it("uses reusable 2D metatiles when they are smaller than linear RLE", () => {
    const metatileA = [0, 1, 2, 3];
    const metatileB = [4, 5, 6, 7];
    const map = Array.from({ length: 4 }, (_row, blockY) => (
      Array.from({ length: 4 }, (_column, blockX) => (
        (blockX + blockY) % 2 === 0 ? metatileA : metatileB
      ))
    )).flatMap((blockRow) => (
      [0, 1].flatMap((localY) => (
        blockRow.flatMap((block) => block.slice(localY * 2, (localY + 1) * 2))
      ))
    ));

    const encoded = encodeMetatileSequence(map, 8, 8, 2, 2);
    expect(encoded).toMatchObject({
      encoding: "metatile-v1",
      width: 8,
      height: 8,
      blockWidth: 2,
      blockHeight: 2,
      dictionary: [metatileA, metatileB]
    });
    expect(encoded.indices).toHaveLength(16);
    expect(decodeMetatileSequence(encoded)).toEqual(map);

    const project = {
      schemaVersion: 2,
      name: "Metatiles",
      rooms: [{
        id: "large-map",
        name: "Large Map",
        width: 8,
        height: 8,
        tilemap: map,
        tileLayers: [{
          mapping: "BG2",
          tilemap: map,
          tileSourceAssetNames: Array.from({ length: 64 }, () => "coast-tileset.png")
        }]
      }]
    };
    const compact = compactProjectTilemaps(project);
    const room = (compact.rooms as Array<Record<string, unknown>>)[0];
    expect(room.tilemap).toMatchObject({ encoding: "metatile-v1" });
    expect((room.tileLayers as Array<Record<string, unknown>>)[0].tilemap).toMatchObject({
      encoding: "metatile-v1"
    });
    expect((room.tileLayers as Array<Record<string, unknown>>)[0].tileSourceAssetNames).toMatchObject({
      encoding: "rle-v1",
      length: 64
    });
    expect(expandProjectTilemaps(compact)).toEqual(project);
  });

  it("splits scenes, events and assets into stable .gbares resources and joins them in order", () => {
    const project = {
      schemaVersion: 2,
      name: "Split Demo",
      settings: { build: { splitProjectResources: true, compactTilemaps: true } },
      rooms: [
        { id: "room-b", name: "Boss / Arena", width: 2, height: 2, tilemap: [1, 1, 1, 1] },
        { id: "room-a", name: "Start", width: 2, height: 2, tilemap: [0, 0, 0, 0] }
      ],
      events: [
        { id: "event-b", name: "Boss Start", steps: [{ command: "noop" }] },
        { id: "event-a", name: "Boot", steps: [{ command: "noop" }] }
      ],
      assets: [{ id: "asset-player", name: "player.png", kind: "Sprite" }]
    };

    const split = splitProjectResources(project);

    expect(split.manifest).toMatchObject({
      format: "gbastudio.split-project",
      resourceSchema: 1,
      name: "Split Demo"
    });
    expect(split.resources.map((resource) => resource.path)).toEqual([
      "Resources/rooms/000-boss_arena.gbares",
      "Resources/rooms/001-start.gbares",
      "Resources/events/000-boss_start.gbares",
      "Resources/events/001-boot.gbares",
      "Resources/assets/000-player_png.gbares"
    ]);
    expect(joinSplitProjectResources(split.manifest, split.resources)).toEqual(project);
  });
});
