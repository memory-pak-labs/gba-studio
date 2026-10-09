import { gunzipSync, inflateSync } from "node:zlib";
import {
  TILED_MAP_MAX_COMPRESSED_BYTES,
  TILED_MAP_MAX_DECOMPRESSED_BYTES,
  TILED_MAP_MAX_TOTAL_DECOMPRESSED_BYTES,
  TILED_MAP_MAX_SOURCE_CHARS
} from "../shared/tiledImport.js";

function decodeBase64Bytes(payload: string): Buffer {
  return Buffer.from(payload.replace(/\s+/g, ""), "base64");
}

function encodeGidsAsBase64(gids: number[]): string {
  const bytes = Buffer.alloc(gids.length * 4);
  gids.forEach((gid, index) => {
    const offset = index * 4;
    const value = gid <= 0 ? 0 : gid >>> 0;
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >> 8) & 0xff;
    bytes[offset + 2] = (value >> 16) & 0xff;
    bytes[offset + 3] = (value >> 24) & 0xff;
  });
  return bytes.toString("base64");
}

function gidsFromLittleEndianBytes(bytes: Buffer): number[] {
  if (bytes.length % 4 !== 0) {
    throw new Error("TMX comprimido invalido: tamanho nao multiplo de 4 bytes");
  }
  const gids: number[] = [];
  for (let offset = 0; offset < bytes.length; offset += 4) {
    const gid = bytes[offset]!
      | (bytes[offset + 1]! << 8)
      | (bytes[offset + 2]! << 16)
      | (bytes[offset + 3]! << 24);
    gids.push(gid <= 0 ? 0 : gid & 0x1fffffff);
  }
  return gids;
}

function decompressLayerPayload(compression: string, payload: string): { gids: number[]; byteLength: number } {
  const compressed = decodeBase64Bytes(payload);
  if (compressed.length > TILED_MAP_MAX_COMPRESSED_BYTES) {
    throw new Error("TMX comprimido excede o limite seguro de dados compactados");
  }
  const normalized = compression.trim().toLowerCase();
  let inflated: Buffer | null = null;
  try {
    inflated = normalized === "gzip"
      ? gunzipSync(compressed, { maxOutputLength: TILED_MAP_MAX_DECOMPRESSED_BYTES })
      : normalized === "zlib"
        ? inflateSync(compressed, { maxOutputLength: TILED_MAP_MAX_DECOMPRESSED_BYTES })
        : null;
  } catch (error) {
    if (error !== null && typeof error === "object" && "code" in error && error.code === "ERR_BUFFER_TOO_LARGE") {
      throw new Error("TMX comprimido excede o limite seguro de dados descomprimidos");
    }
    throw error;
  }
  if (!inflated) {
    throw new Error(`TMX com compression="${compression}" nao suportado`);
  }
  if (inflated.length > TILED_MAP_MAX_DECOMPRESSED_BYTES) {
    throw new Error("TMX comprimido excede o limite seguro de dados descomprimidos");
  }
  return { gids: gidsFromLittleEndianBytes(inflated), byteLength: inflated.length };
}

/**
 * Expande layers TMX com compression gzip/zlib para base64 sem compressao,
 * para o parser shared (sem node:zlib) consumir o mesmo caminho CSV/base64.
 */
export function expandCompressedTiledMapText(text: string): string {
  if (text.length > TILED_MAP_MAX_SOURCE_CHARS) {
    throw new Error("Mapa Tiled excede o limite de tamanho para importacao segura");
  }
  if (!/<data\b[^>]*\bcompression\s*=/i.test(text)) {
    return text;
  }

  let totalDecompressedBytes = 0;
  return text.replace(
    /<data\b([^>]*)>([\s\S]*?)<\/data>/gi,
    (full, attributes: string, body: string) => {
      const compressionMatch = attributes.match(/\bcompression\s*=\s*["']([^"']+)["']/i);
      const compression = compressionMatch?.[1]?.trim().toLowerCase() ?? "";
      if (!compression || compression === "none") {
        return full;
      }
      if (compression !== "gzip" && compression !== "zlib") {
        throw new Error(`TMX com compression="${compression}" nao suportado (use gzip, zlib, CSV ou base64)`);
      }
      const encodingMatch = attributes.match(/\bencoding\s*=\s*["']([^"']+)["']/i);
      const encoding = (encodingMatch?.[1] ?? "base64").trim().toLowerCase();
      if (encoding !== "base64") {
        throw new Error(`TMX comprimido exige encoding="base64" (recebido "${encoding}")`);
      }
      const decompressed = decompressLayerPayload(compression, body);
      totalDecompressedBytes += decompressed.byteLength;
      if (totalDecompressedBytes > TILED_MAP_MAX_TOTAL_DECOMPRESSED_BYTES) {
        throw new Error("Mapa Tiled excede o limite total seguro de dados descomprimidos");
      }
      const nextAttributes = attributes
        .replace(/\s*\bcompression\s*=\s*["'][^"']*["']/i, "")
        .replace(/\s*\bencoding\s*=\s*["'][^"']*["']/i, "");
      return `<data encoding="base64"${nextAttributes}>${encodeGidsAsBase64(decompressed.gids)}</data>`;
    }
  );
}
