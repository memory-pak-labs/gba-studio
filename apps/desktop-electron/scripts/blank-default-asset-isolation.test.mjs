import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodePngRgba } from "./lib/png-icons.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const blank = path.join(appRoot, "default-assets/templates/blank");
const approved = path.resolve(appRoot, "fixtures/asset-provenance/blank-ui");
const catalog = JSON.parse(readFileSync(path.join(blank, "scene-ui-defaults.json"), "utf8"));
const image = file => decodePngRgba(readFileSync(file));
const palette = catalog.palette.map(hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)));
function preparedReference(scene) {
  const source = image(path.join(approved, `hud-${scene}-240x160-preserved.png`));
  for (let i = 0; i < source.pixels.length; i += 4) {
    if (source.pixels[i + 3] < 128) { source.pixels.fill(0, i, i + 4); continue; }
    const rgb = [...source.pixels.subarray(i, i + 3)];
    const nearest = palette.reduce((best, color) => {
      const distance = color.reduce((sum, value, channel) => sum + (value - rgb[channel]) ** 2, 0);
      return distance < best.distance ? { color, distance } : best;
    }, { color: palette[0], distance: Infinity });
    source.pixels.set([...nearest.color, 255], i);
  }
  return source;
}

// Bounds identify complete, separate panels in the preserved approved composition.
// Every opaque pixel of that panel must survive, and no neighbor may enter its PNG.
describe("blank HUD panel isolation", () => {
  it.each([
    ["dungeon-crawler", "health", [3, 133, 105, 156]],
    ["dungeon-crawler", "energy", [108, 133, 162, 156]],
    ["dungeon-crawler", "item", [166, 133, 237, 156]],
    ["batalha-rpg", "party", [4, 93, 99, 120]],
    ["corrida", "lap", [9, 6, 81, 31]],
    ["corrida", "position", [84, 6, 156, 31]],
    ["corrida", "speed", [159, 6, 231, 31]]
  ])("retains the whole %s/%s panel without neighboring fragments", (scene, part, bounds) => {
    const asset = catalog.assets.find(a => a.scene === scene && a.part === part);
    const actual = image(path.join(blank, "Assets/ui", asset.name));
    const source = preparedReference(scene);
    const [left, top, right, bottom] = bounds;
    let missing = 0, foreign = 0, different = 0;
    for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
      const expectedOffset = (y * source.width + x) * 4;
      const belongs = x >= left && x < right && y >= top && y < bottom;
      const expectedAlpha = belongs ? source.pixels[expectedOffset + 3] : 0;
      const localX = x - asset.x, localY = y - asset.y;
      const inside = localX >= 0 && localY >= 0 && localX < actual.width && localY < actual.height;
      const actualOffset = (localY * actual.width + localX) * 4;
      const actualAlpha = inside ? actual.pixels[actualOffset + 3] : 0;
      if (expectedAlpha && !actualAlpha) missing++;
      if (actualAlpha && !expectedAlpha) foreign++;
      if (expectedAlpha && actualAlpha && [0, 1, 2].some(channel => source.pixels[expectedOffset + channel] !== actual.pixels[actualOffset + channel])) different++;
    }
    expect({ missing, foreign, different }, asset.name).toEqual({ missing: 0, foreign: 0, different: 0 });
    expect([actual.width, actual.height]).toEqual([asset.width, asset.height]);
  });
});
