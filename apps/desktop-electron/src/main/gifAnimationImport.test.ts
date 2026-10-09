import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decodeGifAnimation, encodeRgbaPng, importGifAnimationIntoProjectAssets } from "./gifAnimationImport.js";

const temporaryRoots: string[] = [];

function packLzwPixels(pixels: number[], minimumCodeSize = 2): Buffer {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  const codes = [clearCode, ...pixels, endCode];
  const codeSize = minimumCodeSize + 1;
  const output = Buffer.alloc(Math.ceil((codes.length * codeSize) / 8));
  let bitOffset = 0;
  for (const code of codes) {
    for (let bit = 0; bit < codeSize; bit += 1) {
      if ((code & (1 << bit)) !== 0) {
        output[Math.floor(bitOffset / 8)]! |= 1 << (bitOffset % 8);
      }
      bitOffset += 1;
    }
  }
  return output;
}

function packCompressedLzwPixels(pixels: number[], minimumCodeSize = 2): Buffer {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  const codeSize = minimumCodeSize + 1;
  const codes = pixels.flatMap((pixel) => [clearCode, pixel]);
  codes.push(endCode);
  const output = Buffer.alloc(Math.ceil((codes.length * codeSize) / 8));
  let bitOffset = 0;
  for (const code of codes) {
    for (let bit = 0; bit < codeSize; bit += 1) {
      if ((code & (1 << bit)) !== 0) output[Math.floor(bitOffset / 8)]! |= 1 << (bitOffset % 8);
      bitOffset += 1;
    }
  }
  return output;
}

function buildAnimatedGif(): Buffer {
  const width = 2;
  const height = 1;
  const palette = [0, 0, 0, 255, 255, 255];
  const frame = (pixels: number[], delayCentiseconds: number): number[] => {
    const lzw = packLzwPixels(pixels);
    return [
      0x21, 0xf9, 0x04, 0x00, delayCentiseconds & 0xff, (delayCentiseconds >> 8) & 0xff, 0x00, 0x00,
      0x2c, 0x00, 0x00, 0x00, 0x00, width, 0x00, height, 0x00, 0x00,
      0x02, lzw.length, ...lzw, 0x00
    ];
  };

  return Buffer.from([
    ...Buffer.from("GIF89a", "ascii"),
    width, 0x00, height, 0x00, 0x80, 0x00, 0x00,
    ...palette,
    ...frame([0, 1], 5),
    ...frame([1, 0], 10),
    0x3b
  ]);
}

function buildSolidGif(width: number, height: number): Buffer {
  const lzw = packCompressedLzwPixels(new Array(width * height).fill(0));
  const subBlocks: number[] = [];
  for (let offset = 0; offset < lzw.length; offset += 255) {
    const chunk = lzw.subarray(offset, offset + 255);
    subBlocks.push(chunk.length, ...chunk);
  }
  return Buffer.from([
    ...Buffer.from("GIF89a", "ascii"),
    width & 0xff, width >> 8, height & 0xff, height >> 8, 0x80, 0x00, 0x00,
    0x00, 0x00, 0x00, 0xff, 0xff, 0xff,
    0x21, 0xf9, 0x04, 0x00, 0x05, 0x00, 0x00, 0x00,
    0x2c, 0x00, 0x00, 0x00, 0x00, width & 0xff, width >> 8, height & 0xff, height >> 8, 0x00,
    0x02, ...subBlocks, 0x00, 0x3b
  ]);
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("GIF animation import helpers", () => {
  it("decodes composited frames and converts GIF delays to GBA frames", () => {
    const decoded = decodeGifAnimation(buildAnimatedGif());

    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(1);
    expect(decoded.frames).toHaveLength(2);
    expect(decoded.frames.map((frame) => frame.durationFrames)).toEqual([3, 6]);
    expect(Array.from(decoded.frames[0]!.rgba)).toEqual([
      0, 0, 0, 255,
      255, 255, 255, 255
    ]);
    expect(Array.from(decoded.frames[1]!.rgba)).toEqual([
      255, 255, 255, 255,
      0, 0, 0, 255
    ]);
  });

  it("writes a valid RGBA PNG for a runtime frame", () => {
    const png = encodeRgbaPng(1, 1, Uint8Array.from([12, 34, 56, 255]));

    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(1);
    expect(png.readUInt32BE(20)).toBe(1);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(6);
    expect(png.subarray(-8, -4).toString("ascii")).toBe("IEND");
  });

  it("copies the GIF source and generates background PNG assets", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-gif-import-"));
    temporaryRoots.push(root);
    const sourcePath = path.join(root, "logo.gif");
    const projectPath = path.join(root, "Demo.gba-project");
    await writeFile(sourcePath, buildSolidGif(240, 160));
    await writeFile(projectPath, "{}", "utf8");

    let nextID = 1;
    const result = await importGifAnimationIntoProjectAssets(projectPath, sourcePath, () => `asset-${nextID++}`);

    expect(result.sequence).toMatchObject({ frameCount: 1, width: 240, height: 160, totalDurationFrames: 3 });
    expect(result.assets.map((asset) => asset.kind)).toEqual(["Animation Source", "Background"]);
    await expect(readFile(path.join(root, "Assets", "animations", "logo.gif"))).resolves.toEqual(await readFile(sourcePath));
    const frameBytes = await readFile(path.join(root, "Assets", "backgrounds", "logo-frame-01.png"));
    expect(frameBytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });
});
