import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodePngRgba } from "./lib/png-icons.mjs";

describe("approved frontal Dungeon guard assets", () => {
  it("ships exactly the approved RGBA pixels and binary alpha at every depth", async () => {
    const catalog = JSON.parse(await readFile(path.resolve("default-assets/templates/blank/dungeon-defaults.json"), "utf8"));
    const proof = JSON.parse(await readFile(path.resolve("fixtures/asset-provenance/blank-dungeon-guard-manifest.json"), "utf8"));
    expect(catalog.npc.approval).toBe(proof.approval);
    expect(catalog.npc.depths).toEqual(proof.assets);
    expect(proof.preparation.cropVisiblePixelsLost).toBe(0);
    for (const asset of catalog.npc.depths) {
      const bytes = await readFile(path.resolve("default-assets/templates/blank", asset.file));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
      expect(bytes[25]).toBe(6); // PNG RGBA required by the native consumer.
      const png = decodePngRgba(bytes);
      expect([png.width, png.height]).toEqual([asset.width, asset.height]);
      const colors = new Set();
      let visible = 0;
      for (let i = 0; i < png.pixels.length; i += 4) {
        expect([0, 255]).toContain(png.pixels[i + 3]);
        if (!png.pixels[i + 3]) continue;
        colors.add(Array.from(png.pixels.slice(i, i + 3)).join(","));
        visible++;
      }
      expect(colors.size).toBeLessThanOrEqual(15);
      expect(visible).toBe(proof.preparation.depths.find(depth => depth.name === asset.depth).visiblePixels);
    }
  });
});
