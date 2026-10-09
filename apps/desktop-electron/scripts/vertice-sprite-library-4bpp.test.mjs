import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  VERTICE_SPRITE_LIBRARY_4BPP_ASSET_LAYOUT,
  syncVerticeSpriteLibrary4bppAssets
} from "./vertice-showcase-assets.mjs";
import { decodePngRgba } from "./lib/png-icons.mjs";

const templateURL = new URL(
  "../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
  import.meta.url
);

describe("biblioteca visual do showcase em OBJ 4bpp", () => {
  it("declara a biblioteca completa e sincroniza template e fixture", async () => {
    expect(VERTICE_SPRITE_LIBRARY_4BPP_ASSET_LAYOUT.length).toBeGreaterThan(20);
    expect(VERTICE_SPRITE_LIBRARY_4BPP_ASSET_LAYOUT.every(({ destination }) => destination === "sprites")).toBe(true);

    const root = await fsTempRoot();
    const sourceDirectory = path.join(root, "sprite-library-4bpp");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      ...VERTICE_SPRITE_LIBRARY_4BPP_ASSET_LAYOUT.map(async (asset, index) => {
        const source = path.join(sourceDirectory, asset.source);
        await mkdir(path.dirname(source), { recursive: true });
        await writeFile(source, `sprite-${index}`);
      })
    ]);

    const synced = await syncVerticeSpriteLibrary4bppAssets({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(synced.templateAssets).toHaveLength(VERTICE_SPRITE_LIBRARY_4BPP_ASSET_LAYOUT.length);
    expect(synced.fixtureAssets).toHaveLength(VERTICE_SPRITE_LIBRARY_4BPP_ASSET_LAYOUT.length);
    await access(path.join(path.dirname(templateProjectPath), "Assets", "sprites", VERTICE_SPRITE_LIBRARY_4BPP_ASSET_LAYOUT[0].name));
    expect(await readFile(path.join(path.dirname(templateProjectPath), "Assets", "sprites", VERTICE_SPRITE_LIBRARY_4BPP_ASSET_LAYOUT[0].name), "utf8"))
      .toBe("sprite-0");

    const canonicalOnly = await syncVerticeSpriteLibrary4bppAssets({
      templateProjectPath,
      sourceDirectory
    });
    expect(canonicalOnly.templateAssets).toHaveLength(VERTICE_SPRITE_LIBRARY_4BPP_ASSET_LAYOUT.length);
    expect(canonicalOnly.fixtureAssets).toEqual([]);
  });

  it("mantém os sprites 4bpp ainda declarados no projeto canônico compatíveis com OBJ", async () => {
    const templateRoot = path.resolve(path.dirname(fileURLToPath(templateURL)), "Assets", "sprites");
    const project = JSON.parse(readFileSync(templateURL, "utf8"));
    const declaredNames = new Set(project.assets.map((asset) => asset.name));
    const activeSpriteNames = VERTICE_SPRITE_LIBRARY_4BPP_ASSET_LAYOUT
      .map(({ name }) => name)
      .filter((name) => declaredNames.has(name));

    expect(activeSpriteNames.length).toBeGreaterThan(0);
    for (const name of activeSpriteNames) {
      const templateBytes = readFileSync(path.join(templateRoot, name));
      expect(templateBytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(templateBytes.toString("ascii", 12, 16)).toBe("IHDR");
      const decoded = decodePngRgba(templateBytes);
      const colors = new Set();
      for (let index = 0; index < decoded.pixels.length; index += 4) {
        colors.add(decoded.pixels.slice(index, index + 4).join(","));
      }
      expect(decoded.width % 8).toBe(0);
      expect(decoded.height % 8).toBe(0);
      expect(colors.size).toBeLessThanOrEqual(16);
    }
  });
});

async function fsTempRoot() {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(path.join(os.tmpdir(), "sprite-library-"));
}
