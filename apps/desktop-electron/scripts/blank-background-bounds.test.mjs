import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodePngRgba } from "./lib/png-icons.mjs";

const root = new URL("../default-assets/templates/blank/", import.meta.url);
const catalog = JSON.parse(readFileSync(new URL("background-defaults.json", root), "utf8"));

describe("blank background viewport coverage", () => {
  it.each(["menu", "custom", "world-map"])("fills the %s canvas without the old exterior matte", family => {
    const entry = catalog.backgrounds.find(item => item.family === family);
    const bytes = readFileSync(new URL(`Assets/backgrounds/${entry.file}`, root));
    const image = decodePngRgba(bytes);
    expect([image.width, image.height]).toEqual([240, 160]);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.preparedSha256);
    const matte = (x, y) => {
      const i = (y * image.width + x) * 4;
      return image.pixels[i] === 56 && image.pixels[i + 1] === 24 && image.pixels[i + 2] === 16;
    };
    for (const y of [0, image.height - 1]) {
      expect(Array.from({ length: image.width }, (_, x) => matte(x, y)).every(Boolean)).toBe(false);
    }
    for (const x of [0, image.width - 1]) {
      expect(Array.from({ length: image.height }, (_, y) => matte(x, y)).every(Boolean)).toBe(false);
    }
    // The frozen tile palette must encode the reviewed pixels exactly.
    expect(entry.palettePlan.tile_palette_banks).toHaveLength(600);
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      const tile = Math.floor(y / 8) * 30 + Math.floor(x / 8);
      const bank = entry.palettePlan.banks[entry.palettePlan.tile_palette_banks[tile]];
      const rgb = [...image.pixels.subarray(i, i + 3)];
      expect(image.pixels[i + 3]).toBe(255);
      expect(bank.some(color => color && color.every((value, channel) => value === rgb[channel]))).toBe(true);
    }
  });
});
