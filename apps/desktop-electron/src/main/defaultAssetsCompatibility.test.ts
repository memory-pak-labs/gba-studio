import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const { decodePngRgba } = createRequire(import.meta.url)("../../scripts/lib/png-icons.mjs") as {
  decodePngRgba(bytes: Uint8Array): { width: number; height: number; pixels: Uint8Array };
};

async function pngColorContract(relativePath: string): Promise<{ bitDepth: number; colorType: number }> {
  const bytes = await readFile(new URL(`../../default-assets/templates/exemplo-gba/Assets/${relativePath}`, import.meta.url));
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { bitDepth: bytes[24], colorType: bytes[25] };
}

describe("default assets accepted by the GBAStudio Engine assetc", () => {
  it.each([
    "ui/frame-lumen-v2.png",
    "ui/dialogue-selector-gba-v4.png",
    "fonts/gba-dialogue-font-v3.png",
    "sprites/tactical-nara-v5.png",
    "sprites/tempestade-v3-player.png",
    "sprites/storm-shot.png",
    "sprites/tempestade-v3-drone-horizontal.png"
  ])("keeps %s as an 8-bit RGBA PNG", async (relativePath) => {
    await expect(pngColorContract(relativePath)).resolves.toEqual({ bitDepth: 8, colorType: 6 });
  });

  it("keeps the approved Penedos player at native 40px with 15 visible RGB555 colors", async () => {
    const bytes = await readFile(new URL(
      "../../default-assets/templates/exemplo-gba/Assets/sprites/penedos-v10-nara.png", import.meta.url));
    await expect(pngColorContract("sprites/penedos-v10-nara.png"))
      .resolves.toEqual({ bitDepth: 8, colorType: 6 });
    const image = decodePngRgba(bytes);
    expect([image.width, image.height]).toEqual([240, 40]);
    const colors = new Set<number>(), alpha = new Set<number>();
    for (let i = 0; i < image.pixels.length; i += 4) {
      alpha.add(image.pixels[i+3]);
      if (image.pixels[i+3]) colors.add((image.pixels[i] >> 3) | ((image.pixels[i+1] >> 3) << 5) | ((image.pixels[i+2] >> 3) << 10));
    }
    expect([...alpha].sort((a,b) => a-b)).toEqual([0,255]);
    expect(colors.size).toBeLessThanOrEqual(15);
  });

  it("does not treat superseded market art as part of the active template", async () => {
    const projectURL = new URL(
      "../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
      import.meta.url
    );
    const project = JSON.parse(await readFile(projectURL, "utf8")) as {
      assets: Array<{ name: string }>;
    };
    expect(project.assets.some((asset) => asset.name === "mercado-suspenso-modules-v5.png")).toBe(false);
  });

  it("keeps only files declared by the current Exemplo GBA project", async () => {
    const projectURL = new URL(
      "../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
      import.meta.url
    );
    const assetsURL = new URL(
      "../../default-assets/templates/exemplo-gba/Assets/",
      import.meta.url
    );
    const project = JSON.parse(await readFile(projectURL, "utf8")) as {
      assets: Array<{ metadata?: { source?: string } }>;
    };
    const walk = async (directory: URL, prefix = ""): Promise<string[]> => {
      const entries = await readdir(directory, { withFileTypes: true });
      const nested = await Promise.all(entries.map(async (entry) => {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
        return entry.isDirectory() ? walk(path, relative) : [relative];
      }));
      return nested.flat();
    };
    const declared = project.assets
      .map((asset) => asset.metadata?.source)
      .filter((source): source is string => typeof source === "string" && source.startsWith("Assets/"))
      .map((source) => source.slice("Assets/".length))
      .sort();

    expect(new Set(declared).size).toBe(declared.length);
    await expect(walk(assetsURL)).resolves.toEqual(declared);
  });

  it("keeps the current dialogue UI assets available", async () => {
    await expect(readFile(new URL(
      "../../default-assets/templates/exemplo-gba/Assets/ui/frame-lumen-v2.png",
      import.meta.url
    ))).resolves.toBeTruthy();
    await expect(readFile(new URL(
      "../../default-assets/templates/exemplo-gba/Assets/ui/dialogue-selector-gba-v4.png",
      import.meta.url
    ))).resolves.toBeTruthy();
  });

  it("stores the welcome icon as a real PNG", async () => {
    const bytes = await readFile(new URL("../renderer/assets/branding/welcome-icon.png", import.meta.url));
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });
});
