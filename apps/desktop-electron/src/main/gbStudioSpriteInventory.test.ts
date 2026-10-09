import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

describe("GB Studio sprite inventory CLI", () => {
  it("reports exact replacement contracts and every sprite usage", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gba-studio-sprite-inventory-"));
    const spritesRoot = path.join(root, "assets", "sprites");
    const sceneRoot = path.join(root, "project", "scenes", "town", "actors");
    await mkdir(spritesRoot, { recursive: true });
    await mkdir(sceneRoot, { recursive: true });

    await writeFile(path.join(root, "Example.gbsproj"), JSON.stringify({ _version: "4.1.3" }));
    await writeFile(path.join(spritesRoot, "hero.png"), pngHeader(32, 16));
    await writeFile(path.join(spritesRoot, "unused.png"), pngHeader(8, 8));
    await writeFile(path.join(spritesRoot, "hero.png.gbsres"), JSON.stringify({
      _resourceType: "sprite",
      id: "sprite-hero",
      name: "Hero",
      filename: "hero.png",
      canvasWidth: 16,
      canvasHeight: 16,
      boundsX: 0,
      boundsY: 8,
      boundsWidth: 16,
      boundsHeight: 8,
      numTiles: 3,
      states: [{
        name: "Default",
        animationType: "multi_movement",
        flipLeft: true,
        animations: [{
          frames: [
            { tiles: [{ x: 0, y: 0, sliceX: 0, sliceY: 0, palette: 0 }] },
            { tiles: [{ x: 8, y: 0, sliceX: 8, sliceY: 0, palette: 0 }] }
          ]
        }]
      }]
    }));
    await writeFile(path.join(spritesRoot, "unused.png.gbsres"), JSON.stringify({
      _resourceType: "sprite",
      id: "sprite-unused",
      name: "Unused",
      filename: "unused.png",
      canvasWidth: 8,
      canvasHeight: 8,
      boundsWidth: 8,
      boundsHeight: 8,
      numTiles: 1,
      states: []
    }));
    await mkdir(path.join(root, "project"), { recursive: true });
    await writeFile(path.join(root, "project", "settings.gbsres"), JSON.stringify({
      _resourceType: "settings",
      defaultPlayerSprites: { TOPDOWN: "sprite-hero", SHMUP: "sprite-hero" }
    }));
    await writeFile(path.join(sceneRoot, "guide.gbsres"), JSON.stringify({
      _resourceType: "actor",
      id: "actor-guide",
      name: "Guide",
      spriteSheetId: "sprite-hero",
      script: [{ command: "EVENT_ACTOR_SET_SPRITE", args: { spriteSheetId: "sprite-hero" } }]
    }));

    const scriptPath = path.resolve("scripts/audit-gb-studio-sprites.mjs");
    const { stdout } = await execFileAsync(process.execPath, [scriptPath, path.join(root, "Example.gbsproj"), "--format", "json"]);
    const inventory = JSON.parse(stdout) as {
      summary: Record<string, number>;
      sprites: Array<Record<string, unknown>>;
    };

    expect(inventory.summary).toMatchObject({
      spriteCount: 2,
      usedSpriteCount: 1,
      unusedSpriteCount: 1,
      usageCount: 4
    });
    const hero = inventory.sprites[0] as {
      id: string;
      used: boolean;
      usageCount: number;
      sheet: { width: number; height: number };
      usages: Array<{ kind: string; runtime?: string; resourcePath: string }>;
      requiredSlices: Array<{ x: number; y: number }>;
      states: Array<{ animations: Array<{ frameCount: number }> }>;
      replacementContract: Record<string, unknown>;
    };
    expect(hero.id).toBe("sprite-hero");
    expect(hero.used).toBe(true);
    expect(hero.usageCount).toBe(4);
    expect(hero.sheet).toEqual({ width: 32, height: 16 });
    expect(hero.usages).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "default-player", runtime: "TOPDOWN" }),
      expect.objectContaining({ kind: "default-player", runtime: "SHMUP" }),
      expect.objectContaining({ kind: "resource-reference", resourcePath: "project/scenes/town/actors/guide.gbsres" })
    ]));
    expect(hero.requiredSlices).toEqual([{ x: 0, y: 0 }, { x: 8, y: 0 }]);
    expect(hero.states[0]?.animations[0]?.frameCount).toBe(2);
    expect(hero.replacementContract).toMatchObject({
      filename: "hero.png",
      sheetWidth: 32,
      sheetHeight: 16,
      canvasWidth: 16,
      canvasHeight: 16,
      preserveTileLayout: true
    });

    expect(inventory.sprites[1]).toMatchObject({ id: "sprite-unused", used: false, usageCount: 0 });

    const reportPath = path.join(root, "reports", "sprites", "inventory.md");
    await execFileAsync(process.execPath, [
      scriptPath,
      path.join(root, "Example.gbsproj"),
      "--format",
      "markdown",
      "--out",
      reportPath
    ]);
    expect(await readFile(reportPath, "utf8")).toContain("# Inventario de sprites: Example");
  });
});
