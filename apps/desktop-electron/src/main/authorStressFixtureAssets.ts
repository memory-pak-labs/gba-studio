import { writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

type Rgba = readonly [number, number, number, number];

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const GRASS: readonly Rgba[] = [
  [43, 83, 61, 255],
  [76, 137, 82, 255],
  [123, 177, 91, 255],
  [194, 158, 90, 255]
];

function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, "ascii");
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])), 0);
  return Buffer.concat([header, data, checksum]);
}

function createRgbaPng(width: number, height: number, pixelAt: (x: number, y: number) => Rgba): Buffer {
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    scanlines[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue, alpha] = pixelAt(x, y);
      const offset = row + 1 + x * 4;
      scanlines[offset] = red;
      scanlines[offset + 1] = green;
      scanlines[offset + 2] = blue;
      scanlines[offset + 3] = alpha;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function stressTilesetPng(): Buffer {
  const tileColumns = 30;
  return createRgbaPng(tileColumns * 8, 24 * 8, (x, y) => {
    const tileX = Math.floor(x / 8);
    const tileY = Math.floor(y / 8);
    const localX = x % 8;
    const localY = y % 8;
    const tileIndex = tileY * tileColumns + tileX;
    const variation = (tileX * 13 + tileY * 17) % 3;
    if (localY < 2 && localX < 5) {
      return (tileIndex & (1 << (localY * 5 + localX))) !== 0 ? GRASS[2] : GRASS[1];
    }
    if ((localX + localY * 3 + tileX + tileY) % 11 === 0) return GRASS[2];
    if ((localX * 5 + localY + tileX * 3) % 17 === 0) return GRASS[3];
    if (localX === 0 && localY === 0) return GRASS[0];
    return GRASS[1 + variation];
  });
}

function stressPlayerPng(): Buffer {
  const transparent: Rgba = [0, 0, 0, 0];
  const outline: Rgba = [18, 43, 68, 255];
  const suit: Rgba = [35, 124, 164, 255];
  const skin: Rgba = [244, 202, 150, 255];
  const visor: Rgba = [221, 246, 241, 255];
  return createRgbaPng(96, 16, (x, y) => {
    const frame = Math.floor(x / 16);
    const localX = x % 16;
    const offset = frame % 2;
    if (localX >= 5 && localX <= 10 && y >= 2 && y <= 6) return skin;
    if (localX >= 6 && localX <= 9 && y === 3 + offset) return visor;
    if (localX >= 4 && localX <= 11 && y >= 6 && y <= 12) return suit;
    if ((localX === 4 || localX === 11) && y >= 7 && y <= 11) return outline;
    if (localX >= 5 && localX <= 10 && y === 13) return outline;
    if ((localX === 6 || localX === 9) && y >= 14) return outline;
    if (localX >= 5 && localX <= 10 && (y === 1 || y === 7)) return outline;
    return transparent;
  });
}

/** Escreve os dois assets visuais do playtest sem reutilizar fixtures de ícones genéricos. */
export async function writeAuthorStressFixtureAssets(projectRoot: string): Promise<void> {
  await writeFile(path.join(projectRoot, "Assets", "tiles", "tiles_topdown_sandbox.png"), stressTilesetPng());
  await writeFile(path.join(projectRoot, "Assets", "sprites", "player_topdown_4dir.png"), stressPlayerPng());
}
