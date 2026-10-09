import { mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prepareTiledMapImport } from "./importTiledMap.js";

describe("prepareTiledMapImport", () => {
  it("parses a TMX file and copies the adjacent tileset PNG into Assets", async () => {
    const root = path.join(os.tmpdir(), `gba-tiled-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const projectDir = path.join(root, "project");
    const mapsDir = path.join(root, "maps");
    await mkdir(projectDir, { recursive: true });
    await mkdir(mapsDir, { recursive: true });
    const projectPath = path.join(projectDir, "demo.gba-project");
    await writeFile(projectPath, "{}");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const tilesetPath = path.join(mapsDir, "overworld.png");
    await writeFile(tilesetPath, png);
    const mapPath = path.join(mapsDir, "forest.tmx");
    await writeFile(mapPath, `<?xml version="1.0"?>
<map width="2" height="2" tilewidth="8" tileheight="8">
  <tileset firstgid="1" name="overworld">
    <image source="overworld.png" width="8" height="8"/>
  </tileset>
  <layer name="Ground" width="2" height="2">
    <data encoding="csv">1,2,3,4</data>
  </layer>
</map>`);

    const prepared = await prepareTiledMapImport(projectPath, mapPath);
    expect(prepared.parsed.tilemap).toEqual([1, 2, 3, 4]);
    expect(prepared.importedTileset?.kind).toBe("Tileset");
    expect(prepared.backgroundAssetName).toBe(prepared.importedTileset?.name);
    expect(prepared.importedTileset?.relativePath).toMatch(/Assets\/tilesets\//);
  });

  it("rejects a tileset source that escapes the map directory", async () => {
    const root = path.join(os.tmpdir(), `gba-tiled-unsafe-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const projectDir = path.join(root, "project");
    const mapsDir = path.join(root, "maps");
    await mkdir(projectDir, { recursive: true });
    await mkdir(mapsDir, { recursive: true });
    const projectPath = path.join(projectDir, "demo.gba-project");
    const outsidePath = path.join(root, "outside.png");
    await writeFile(projectPath, "{}");
    await writeFile(outsidePath, "outside", "utf8");
    const mapPath = path.join(mapsDir, "forest.tmx");
    await writeFile(mapPath, `<map width="1" height="1">
  <tileset name="unsafe"><image source="../outside.png"/></tileset>
  <layer name="Ground" width="1" height="1"><data encoding="csv">1</data></layer>
</map>`);

    await expect(prepareTiledMapImport(projectPath, mapPath)).rejects.toThrow(/tileset|pasta|fora|inseguro/i);
  });

  it("rejects a tileset symlink that resolves outside the map directory", async () => {
    const root = path.join(os.tmpdir(), `gba-tiled-symlink-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const projectDir = path.join(root, "project");
    const mapsDir = path.join(root, "maps");
    await mkdir(projectDir, { recursive: true });
    await mkdir(mapsDir, { recursive: true });
    const projectPath = path.join(projectDir, "demo.gba-project");
    const outsidePath = path.join(root, "outside.png");
    await writeFile(projectPath, "{}");
    await writeFile(outsidePath, "outside", "utf8");
    await symlink(outsidePath, path.join(mapsDir, "escape.png"));
    const mapPath = path.join(mapsDir, "forest.tmx");
    await writeFile(mapPath, `<map width="1" height="1">
  <tileset name="unsafe"><image source="escape.png"/></tileset>
  <layer name="Ground" width="1" height="1"><data encoding="csv">1</data></layer>
</map>`);

    await expect(prepareTiledMapImport(projectPath, mapPath)).rejects.toThrow(/tileset|pasta|fora|inseguro/i);
  });
});
