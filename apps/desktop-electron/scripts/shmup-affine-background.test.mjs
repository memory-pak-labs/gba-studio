import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decodePngRgba, encodePngRgba } from "./lib/png-icons.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const assetc = join(repositoryRoot, "packages/GBAStudioEngine/tools/assetc/assetc.py");
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function compileAffine(input, output) {
  return spawnSync("python3", [assetc, input, "-o", output, "-n", "affine_background", "--background-bpp", "8", "--affine-tilemap"], {
    encoding: "utf8",
    timeout: 20000
  });
}

function createAffineFixture() {
  const width = 1024;
  const height = 1024;
  const pixels = Buffer.alloc(width * height * 4);
  const colors = [[24, 72, 104], [232, 192, 112]];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = colors[((x >> 3) + (y >> 3)) & 1];
      const offset = (y * width + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }

  return { width, height, pixels };
}

describe("GBA affine background compiler", () => {
  it("compila o mapa físico de 128×128 células com até 256 tiles", async () => {
    const root = await mkdtemp(join(os.tmpdir(), "gba-affine-background-test-"));
    temporaryRoots.push(root);
    const input = join(root, "affine-background.png");
    await writeFile(input, encodePngRgba(createAffineFixture()));

    const image = decodePngRgba(await readFile(input));
    expect(image).toMatchObject({ width: 1024, height: 1024 });
    let invalidAlpha = 0;
    for (let index = 3; index < image.pixels.length; index += 4) {
      if (image.pixels[index] !== 255) invalidAlpha += 1;
    }
    expect(invalidAlpha).toBe(0);

    const output = join(root, "affine-background.hpp");
    const compiled = compileAffine(input, output);
    expect(compiled.status, compiled.stderr).toBe(0);

    const header = await readFile(output, "utf8");
    expect(header).toContain("affine_background_tilemap_width = 128;");
    expect(header).toContain("affine_background_tilemap_height = 128;");
    const tileCount = Number(header.match(/affine_background_tile_count = (\d+);/)?.[1]);
    expect(tileCount).toBeGreaterThan(0);
    expect(tileCount).toBeLessThanOrEqual(256);

    const repeat = join(root, "affine-background-repeat.hpp");
    const repeated = compileAffine(input, repeat);
    expect(repeated.status, repeated.stderr).toBe(0);
    expect(await readFile(repeat, "utf8")).toBe(header);
  });

  it("rejeita uma imagem não quadrada para o mapa Affine", async () => {
    const root = await mkdtemp(join(os.tmpdir(), "gba-affine-background-test-"));
    temporaryRoots.push(root);
    const input = join(root, "non-square.png");
    const output = join(root, "non-square.hpp");
    const pixels = Buffer.alloc(128 * 256 * 4);
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels.set([32, 64, 96, 255], offset);
    }
    await writeFile(input, encodePngRgba({ width: 128, height: 256, pixels }));

    const compiled = compileAffine(input, output);
    expect(compiled.status).not.toBe(0);
    expect(compiled.stderr).toContain("mapa quadrado");
  });
});
