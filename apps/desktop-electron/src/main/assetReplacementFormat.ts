import path from "node:path";
import { crc32 } from "node:zlib";

function formatForName(name: string): string {
  const extension = path.extname(name).slice(1).toLowerCase();
  if (extension === "jpeg") return "jpg";
  if (extension === "apng") return "png";
  return extension;
}

function validPng(bytes: Buffer): boolean {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!bytes.subarray(0, 8).equals(signature)) return false;

  let hasData = false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const payloadEnd = offset + 8 + length;
    if (payloadEnd + 4 > bytes.length) return false;
    const tag = bytes.toString("ascii", offset + 4, offset + 8);
    if (crc32(bytes.subarray(offset + 4, payloadEnd)) !== bytes.readUInt32BE(payloadEnd)) return false;
    if (offset === 8 && (tag !== "IHDR" || length !== 13 || !bytes.readUInt32BE(16) || !bytes.readUInt32BE(20))) return false;
    if (tag === "IDAT" && length > 0) hasData = true;
    if (tag === "IEND") return hasData && length === 0;
    offset = payloadEnd + 4;
  }
  return false;
}

function validWav(bytes: Buffer): boolean {
  if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") return false;
  const end = bytes.readUInt32LE(4) + 8;
  if (end > bytes.length) return false;

  let hasFormat = false;
  let hasSamples = false;
  for (let offset = 12; offset + 8 <= end;) {
    const tag = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const next = offset + 8 + length + (length % 2);
    if (next > end) return false;
    if (tag === "fmt " && length >= 16) hasFormat = true;
    if (tag === "data" && length > 0) hasSamples = true;
    offset = next;
  }
  return hasFormat && hasSamples;
}

function hasExpectedContent(bytes: Buffer, format: string): boolean {
  const tag = (offset: number, text: string) => bytes.subarray(offset, offset + text.length).equals(Buffer.from(text, "ascii"));
  switch (format) {
    case "png": return validPng(bytes);
    case "wav": return validWav(bytes);
    case "jpg": return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      && bytes.lastIndexOf(Buffer.from([0xff, 0xd9])) > 2;
    case "gif": return bytes.length > 14 && (tag(0, "GIF87a") || tag(0, "GIF89a")) && bytes.at(-1) === 0x3b;
    case "bmp": return bytes.length > 26 && tag(0, "BM") && bytes.readUInt32LE(10) < bytes.length;
    case "webp": return bytes.length > 20 && tag(0, "RIFF") && tag(8, "WEBP") && bytes.readUInt32LE(4) + 8 <= bytes.length;
    case "ogg": return bytes.length > 27 && tag(0, "OggS");
    case "flac": return bytes.length > 42 && tag(0, "fLaC");
    case "mp3": return bytes.length > 10 && (tag(0, "ID3")
      || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0));
    case "mod": return bytes.length > 1084 && ["M.K.", "M!K!", "4CHN", "FLT4"].some(signature => tag(1080, signature));
    case "xm": return bytes.length > 80 && tag(0, "Extended Module: ");
    case "s3m": return bytes.length > 96 && tag(44, "SCRM");
    case "it": return bytes.length > 192 && tag(0, "IMPM");
    case "sf2": return bytes.length > 12 && tag(0, "RIFF") && tag(8, "sfbk") && bytes.readUInt32LE(4) + 8 === bytes.length;
    default: return bytes.length > 0;
  }
}

export function validateAssetReplacement(bytes: Buffer, selectedName: string, currentName: string): void {
  const format = formatForName(currentName);
  if (formatForName(selectedName) !== format) {
    throw new Error("Escolha um arquivo no mesmo formato do asset atual.");
  }
  if (!hasExpectedContent(bytes, format)) {
    throw new Error("O conteúdo do arquivo é inválido para o formato do asset.");
  }
}
