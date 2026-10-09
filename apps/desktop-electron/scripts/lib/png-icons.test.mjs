import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { decodePngRgba, pngDimensions, resizePngNearest } from "./png-icons.mjs";

const projectRoot = resolve(import.meta.dirname, "../../../..");
const exemploTemplateRoot = resolve(projectRoot, "apps/desktop-electron/default-assets/templates/exemplo-gba");
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function createIndexed4BitPngFixture() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 4;
  header[9] = 3;
  const palette = Buffer.from([0, 0, 0, 255, 64, 32]);
  const transparency = Buffer.from([0, 255]);
  const scanline = deflateSync(Buffer.from([0, 0x01]));

  return Buffer.concat([
    pngSignature,
    pngChunk("IHDR", header),
    pngChunk("PLTE", palette),
    pngChunk("tRNS", transparency),
    pngChunk("IDAT", scanline),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

describe("png icon helpers", () => {
  it("resizes repository PNG icons without platform-specific tools", async () => {
    const source = await readFile(resolve(projectRoot, "icon_gbastudio.png"));
    const resized = resizePngNearest(source, 256);

    expect(pngDimensions(resized)).toEqual({ width: 256, height: 256 });
  });

  it("decodes the current template backgrounds into exact RGBA pixels", async () => {
    const project = JSON.parse(await readFile(resolve(exemploTemplateRoot, "exemplo-gba.gba-project"), "utf8"));
    const sceneNames = ["logo", "abertura"];

    for (const sceneName of sceneNames) {
      const scene = project.scenas.find((candidate) => candidate.name === sceneName);
      expect(scene, `cena ativa ausente no template: ${sceneName}`).toBeDefined();
      const asset = project.assets.find((candidate) => candidate.name === scene.backgroundAssetName);
      const source = asset?.metadata?.source;
      expect(source, `fundo ativo ausente no template: ${sceneName}`).toMatch(/^Assets\/backgrounds\//);

      const image = decodePngRgba(await readFile(resolve(exemploTemplateRoot, source)));
      expect(image).toMatchObject({ width: scene.width * 8, height: scene.height * 8 });
      expect(image.pixels).toHaveLength(image.width * image.height * 4);
      expect([...image.pixels].filter((_, index) => index % 4 === 3).every((alpha) => alpha === 255)).toBe(true);
    }
  });

  it("decodes indexed 4-bit sprite data with palette transparency", () => {
    const sprite = decodePngRgba(createIndexed4BitPngFixture());

    expect(sprite).toMatchObject({ width: 2, height: 1 });
    expect(sprite.pixels).toEqual(Buffer.from([0, 0, 0, 0, 255, 64, 32, 255]));
  });
});
