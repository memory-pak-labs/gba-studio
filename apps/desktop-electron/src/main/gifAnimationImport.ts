import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import type { ImportedAnimationSequence, ImportedAssetFile } from "../shared/ipc.js";
import { systemImageForAssetKind } from "../shared/filesWorkspace.js";

export const GIF_ANIMATION_LIMITS = {
  height: 160,
  maxFrames: 12,
  maxSourceBytes: 8 * 1024 * 1024,
  maxTotalDurationFrames: 180,
  width: 240
} as const;

interface GifGraphicControlExtension {
  delayCentiseconds: number;
  disposalMethod: number;
  transparentColorIndex: number | null;
}

export interface DecodedGifFrame {
  durationFrames: number;
  rgba: Uint8Array;
}

export interface DecodedGifAnimation {
  frames: DecodedGifFrame[];
  height: number;
  width: number;
}

export interface ImportedGifAnimationResult {
  assets: ImportedAssetFile[];
  sequence: ImportedAnimationSequence;
}

class GifReader {
  private offset = 0;

  public constructor(private readonly bytes: Uint8Array) {}

  public get position(): number {
    return this.offset;
  }

  public readByte(): number {
    if (this.offset >= this.bytes.length) throw new Error("GIF truncado.");
    return this.bytes[this.offset++]!;
  }

  public readBytes(length: number): Uint8Array {
    if (!Number.isInteger(length) || length < 0 || this.offset + length > this.bytes.length) {
      throw new Error("GIF truncado.");
    }
    const result = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  public readUInt16LE(): number {
    return this.readByte() | (this.readByte() << 8);
  }

  public readSubBlocks(): Uint8Array {
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    while (true) {
      const length = this.readByte();
      if (length === 0) break;
      const chunk = this.readBytes(length);
      chunks.push(chunk);
      totalLength += chunk.length;
      if (totalLength > GIF_ANIMATION_LIMITS.maxSourceBytes) {
        throw new Error("Os dados de imagem do GIF excedem o limite de importação.");
      }
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}

function colorTable(reader: GifReader, packed: number): Uint8Array {
  const entries = 1 << ((packed & 0x07) + 1);
  return reader.readBytes(entries * 3);
}

function colorAt(table: Uint8Array, index: number): [number, number, number] {
  const offset = index * 3;
  if (offset < 0 || offset + 2 >= table.length) throw new Error("GIF referencia uma cor inválida.");
  return [table[offset]!, table[offset + 1]!, table[offset + 2]!];
}

function decodeGifLzw(data: Uint8Array, minimumCodeSize: number, expectedPixels: number): number[] {
  if (minimumCodeSize < 2 || minimumCodeSize > 8) throw new Error("GIF usa um tamanho LZW não suportado.");
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minimumCodeSize + 1;
  let nextCode = endCode + 1;
  let bitOffset = 0;
  let previous: number[] | null = null;
  let dictionary = new Map<number, number[]>();
  const pixels: number[] = [];

  const readCode = (): number => {
    if (bitOffset + codeSize > data.length * 8) return endCode;
    let code = 0;
    for (let bit = 0; bit < codeSize; bit += 1) {
      if ((data[Math.floor(bitOffset / 8)]! & (1 << (bitOffset % 8))) !== 0) code |= 1 << bit;
      bitOffset += 1;
    }
    return code;
  };

  while (pixels.length < expectedPixels) {
    const code = readCode();
    if (code === clearCode) {
      dictionary = new Map();
      codeSize = minimumCodeSize + 1;
      nextCode = endCode + 1;
      previous = null;
      continue;
    }
    if (code === endCode) break;

    let entry: number[] | undefined;
    if (code < clearCode) {
      entry = [code];
    } else if (dictionary.has(code)) {
      entry = dictionary.get(code);
    } else if (code === nextCode && previous) {
      entry = [...previous, previous[0]!];
    }
    if (!entry || entry.length === 0) throw new Error("GIF contém um código LZW inválido.");

    pixels.push(...entry);
    if (previous && nextCode < 4096) {
      dictionary.set(nextCode, [...previous, entry[0]!]);
      nextCode += 1;
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
    }
    previous = entry;
  }

  if (pixels.length < expectedPixels) throw new Error("GIF não contém pixels suficientes para o frame.");
  return pixels.slice(0, expectedPixels);
}

function deinterlacePixels(pixels: number[], width: number, height: number, interlaced: boolean): number[] {
  if (!interlaced) return pixels;
  const result = new Array<number>(pixels.length);
  let sourceRow = 0;
  for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]] as const) {
    for (let row = start; row < height; row += step) {
      const sourceOffset = sourceRow * width;
      result.splice(row * width, width, ...pixels.slice(sourceOffset, sourceOffset + width));
      sourceRow += 1;
    }
  }
  return result;
}

function clearGifRect(canvas: Uint8Array, canvasWidth: number, left: number, top: number, width: number, height: number): void {
  for (let y = 0; y < height; y += 1) {
    const targetY = top + y;
    if (targetY < 0 || targetY >= Math.floor(canvas.length / 4 / canvasWidth)) continue;
    for (let x = 0; x < width; x += 1) {
      const targetX = left + x;
      if (targetX < 0 || targetX >= canvasWidth) continue;
      const offset = (targetY * canvasWidth + targetX) * 4;
      canvas[offset] = 0;
      canvas[offset + 1] = 0;
      canvas[offset + 2] = 0;
      canvas[offset + 3] = 0;
    }
  }
}

function drawGifFrame(
  canvas: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  pixels: number[],
  left: number,
  top: number,
  width: number,
  height: number,
  palette: Uint8Array,
  transparentColorIndex: number | null
): void {
  for (let y = 0; y < height; y += 1) {
    const targetY = top + y;
    if (targetY < 0 || targetY >= canvasHeight) continue;
    for (let x = 0; x < width; x += 1) {
      const targetX = left + x;
      if (targetX < 0 || targetX >= canvasWidth) continue;
      const paletteIndex = pixels[y * width + x]!;
      if (paletteIndex === transparentColorIndex) continue;
      const [red, green, blue] = colorAt(palette, paletteIndex);
      const offset = (targetY * canvasWidth + targetX) * 4;
      canvas[offset] = red;
      canvas[offset + 1] = green;
      canvas[offset + 2] = blue;
      canvas[offset + 3] = 255;
    }
  }
}

function durationFramesFromCentiseconds(delayCentiseconds: number): number {
  const effectiveDelay = delayCentiseconds > 0 ? delayCentiseconds : 7;
  return Math.max(1, Math.round((effectiveDelay / 100) * 60));
}

export function decodeGifAnimation(bytes: Uint8Array): DecodedGifAnimation {
  if (bytes.length < 13 || (new TextDecoder().decode(bytes.slice(0, 6)) !== "GIF87a" && new TextDecoder().decode(bytes.slice(0, 6)) !== "GIF89a")) {
    throw new Error("Selecione um arquivo GIF válido.");
  }

  const reader = new GifReader(bytes);
  reader.readBytes(6);
  const width = reader.readUInt16LE();
  const height = reader.readUInt16LE();
  if (width <= 0 || height <= 0 || width > 1024 || height > 1024) throw new Error("O GIF possui dimensões inválidas.");
  const packed = reader.readByte();
  reader.readByte();
  reader.readByte();
  const globalPalette = (packed & 0x80) !== 0 ? colorTable(reader, packed) : null;
  const canvas = new Uint8Array(width * height * 4);
  const frames: DecodedGifFrame[] = [];
  let graphicControl: GifGraphicControlExtension = { delayCentiseconds: 0, disposalMethod: 0, transparentColorIndex: null };

  while (reader.position < bytes.length) {
    const block = reader.readByte();
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = reader.readByte();
      if (label === 0xf9) {
        const blockSize = reader.readByte();
        if (blockSize !== 4) throw new Error("GIF contém um bloco gráfico inválido.");
        const control = reader.readByte();
        const delayCentiseconds = reader.readUInt16LE();
        const transparentColorIndex = reader.readByte();
        if (reader.readByte() !== 0) throw new Error("GIF contém um terminador inválido.");
        graphicControl = {
          delayCentiseconds,
          disposalMethod: (control >> 2) & 0x07,
          transparentColorIndex: (control & 0x01) !== 0 ? transparentColorIndex : null
        };
      } else {
        reader.readSubBlocks();
      }
      continue;
    }
    if (block !== 0x2c) throw new Error("GIF contém um bloco não suportado.");

    const left = reader.readUInt16LE();
    const top = reader.readUInt16LE();
    const frameWidth = reader.readUInt16LE();
    const frameHeight = reader.readUInt16LE();
    const imagePacked = reader.readByte();
    if (frameWidth <= 0 || frameHeight <= 0) throw new Error("GIF contém um frame vazio.");
    const localPalette = (imagePacked & 0x80) !== 0 ? colorTable(reader, imagePacked) : null;
    const palette = localPalette ?? globalPalette;
    if (!palette) throw new Error("GIF não possui uma paleta de cores.");
    const minimumCodeSize = reader.readByte();
    const compressedPixels = reader.readSubBlocks();
    const pixels = deinterlacePixels(
      decodeGifLzw(compressedPixels, minimumCodeSize, frameWidth * frameHeight),
      frameWidth,
      frameHeight,
      (imagePacked & 0x40) !== 0
    );
    const previousCanvas = canvas.slice();
    drawGifFrame(canvas, width, height, pixels, left, top, frameWidth, frameHeight, palette, graphicControl.transparentColorIndex);
    frames.push({ durationFrames: durationFramesFromCentiseconds(graphicControl.delayCentiseconds), rgba: canvas.slice() });

    if (graphicControl.disposalMethod === 2) {
      clearGifRect(canvas, width, left, top, frameWidth, frameHeight);
    } else if (graphicControl.disposalMethod === 3) {
      canvas.set(previousCanvas);
    }
    graphicControl = { delayCentiseconds: 0, disposalMethod: 0, transparentColorIndex: null };
  }

  if (frames.length === 0) throw new Error("O GIF não contém frames de imagem.");
  return { frames, height, width };
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const payload = Buffer.concat([typeBytes, Buffer.from(data)]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  payload.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(payload), 8 + data.length);
  return chunk;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (width <= 0 || height <= 0 || rgba.length !== width * height * 4) throw new Error("Frame RGBA inválido para PNG.");
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    scanlines[rowOffset] = 0;
    scanlines.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), rowOffset + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", new Uint8Array())
  ]);
}

function assetsRelativePath(folderName: string, fileName: string): string {
  return `Assets/${folderName}/${fileName}`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, { flag: "r" });
    return true;
  } catch {
    return false;
  }
}

async function uniqueDestinationPath(directory: string, fileName: string): Promise<string> {
  const parsed = path.parse(fileName);
  let candidate = path.join(directory, fileName);
  let index = 2;
  while (await fileExists(candidate)) {
    candidate = path.join(directory, `${parsed.name} ${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
}

function animationBaseName(fileName: string): string {
  const base = path.parse(fileName).name.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
  return base || "gif-animation";
}

function importedAsset(
  id: string,
  name: string,
  relativePath: string,
  kind: string,
  metadata: Record<string, unknown>
): ImportedAssetFile {
  return { id, kind, metadata, name, relativePath, systemImage: systemImageForAssetKind(kind) };
}

export async function importGifAnimationIntoProjectAssets(
  projectPath: string,
  sourcePath: string,
  makeAssetID: () => string
): Promise<ImportedGifAnimationResult> {
  const sourceBytes = await readFile(sourcePath);
  if (sourceBytes.length > GIF_ANIMATION_LIMITS.maxSourceBytes) {
    throw new Error("O GIF excede o limite de 8 MB para importação.");
  }
  const decoded = decodeGifAnimation(sourceBytes);
  if (decoded.width !== GIF_ANIMATION_LIMITS.width || decoded.height !== GIF_ANIMATION_LIMITS.height) {
    throw new Error("A animação GIF para uma cena logo deve ter exatamente 240x160 px.");
  }
  if (decoded.frames.length > GIF_ANIMATION_LIMITS.maxFrames) {
    throw new Error(`A animação GIF possui ${decoded.frames.length} frames; o limite atual é ${GIF_ANIMATION_LIMITS.maxFrames}.`);
  }
  const totalDurationFrames = decoded.frames.reduce((total, frame) => total + frame.durationFrames, 0);
  if (totalDurationFrames > GIF_ANIMATION_LIMITS.maxTotalDurationFrames) {
    throw new Error("A duração total do GIF excede 3 segundos no ritmo do GBA.");
  }

  const projectDirectory = path.dirname(projectPath);
  const sourceDirectory = path.join(projectDirectory, "Assets", "animations");
  const frameDirectory = path.join(projectDirectory, "Assets", "backgrounds");
  await mkdir(sourceDirectory, { recursive: true });
  await mkdir(frameDirectory, { recursive: true });

  const sourceDestination = await uniqueDestinationPath(sourceDirectory, path.basename(sourcePath));
  if (path.resolve(sourcePath) !== path.resolve(sourceDestination)) await copyFile(sourcePath, sourceDestination);
  const sourceName = path.basename(sourceDestination);
  const sourceAssetID = makeAssetID();
  const baseName = animationBaseName(sourceName);
  const assets: ImportedAssetFile[] = [importedAsset(
    sourceAssetID,
    sourceName,
    assetsRelativePath("animations", sourceName),
    "Animation Source",
    {
      animationFormat: "gif",
      frameCount: decoded.frames.length,
      height: decoded.height,
      reusableLibraryAsset: true,
      source: assetsRelativePath("animations", sourceName),
      sourceOnly: true,
      totalDurationFrames,
      width: decoded.width
    }
  )];
  const frameAssetNames: string[] = [];
  for (const [index, frame] of decoded.frames.entries()) {
    const frameDestination = await uniqueDestinationPath(frameDirectory, `${baseName}-frame-${String(index + 1).padStart(2, "0")}.png`);
    const frameName = path.basename(frameDestination);
    await writeFile(frameDestination, encodeRgbaPng(decoded.width, decoded.height, frame.rgba));
    frameAssetNames.push(frameName);
    assets.push(importedAsset(
      makeAssetID(),
      frameName,
      assetsRelativePath("backgrounds", frameName),
      "Background",
      {
        animationFrame: index,
        animationFormat: "gif-frame",
        animationSource: sourceName,
        frameDurationFrames: frame.durationFrames,
        height: decoded.height,
        source: assetsRelativePath("backgrounds", frameName),
        skipAutoUse: true,
        width: decoded.width
      }
    ));
  }

  return {
    assets,
    sequence: {
      frameAssetNames,
      frameCount: decoded.frames.length,
      frameDurations: decoded.frames.map((frame) => frame.durationFrames),
      height: decoded.height,
      sourceAssetName: sourceName,
      totalDurationFrames,
      width: decoded.width
    }
  };
}
