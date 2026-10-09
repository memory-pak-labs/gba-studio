import { it, expect } from "vitest";
import { normalizeExampleObjParts } from "./normalize-example-obj-parts.mjs";
import { readFileSync } from "node:fs";
import { buildEngineExportProjectContract } from "../src/main/exportEngineProject.js";

it("splits a non-native full-frame sprite without losing source pixels", () => {
  const project = {
    actors: [{ id: "logo", spriteSheet: "logo.png" }],
    assets: [{ id: "logo", name: "logo.png" }],
    animations: [{
      id: "logo",
      spriteSheet: "logo.png",
      frameWidth: 96,
      frameHeight: 32,
      frames: [{
        id: "logo-frame",
        tiles: [{ id: "logo-tile", x: 0, y: 0, sliceX: 0, sliceY: 0, tileWidth: 96, tileHeight: 32 }]
      }]
    }]
  };
  const normalized = normalizeExampleObjParts(project);
  const tiles = normalized.animations[0].frames[0].tiles;

  expect(tiles).toHaveLength(2);
  const coveredPixels = new Set();
  for (const tile of tiles) {
    for (let y = 0; y < tile.tileHeight; y += 1) {
      for (let x = 0; x < tile.tileWidth; x += 1) {
        coveredPixels.add(`${tile.sliceX + x},${tile.sliceY + y}`);
      }
    }
  }
  expect(coveredPixels.size).toBe(96 * 32);
  expect(normalizeExampleObjParts(normalized)).toEqual(normalized);
  expect(normalized.actors).toEqual(project.actors);
  expect(normalized.assets).toEqual(project.assets);
});

it("exports the current complete Exemplo GBA project", () => {
  const project = JSON.parse(readFileSync(
    new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url)
  ));
  expect(() => buildEngineExportProjectContract(project)).not.toThrow();
});
