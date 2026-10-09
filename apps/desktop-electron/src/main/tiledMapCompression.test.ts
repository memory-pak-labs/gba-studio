import { gzipSync, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseTiledMapText } from "../shared/tiledImport.js";
import { TILED_MAP_MAX_DECOMPRESSED_BYTES } from "../shared/tiledImport.js";
import { expandCompressedTiledMapText } from "./tiledMapCompression.js";

function gidBytes(gids: number[]): Buffer {
  const bytes = Buffer.alloc(gids.length * 4);
  gids.forEach((gid, index) => {
    const offset = index * 4;
    bytes[offset] = gid & 0xff;
    bytes[offset + 1] = (gid >> 8) & 0xff;
    bytes[offset + 2] = (gid >> 16) & 0xff;
    bytes[offset + 3] = (gid >> 24) & 0xff;
  });
  return bytes;
}

describe("expandCompressedTiledMapText", () => {
  it("expands gzip TMX layer data so the shared parser can read it", () => {
    const gids = [1, 2, 0, 3, 4, 5, 0, 6, 7, 0, 8, 9];
    const encoded = gzipSync(gidBytes(gids)).toString("base64");
    const xml = `<map width="4" height="3" tilewidth="8" tileheight="8">
  <layer name="Ground" width="4" height="3">
    <data encoding="base64" compression="gzip">${encoded}</data>
  </layer>
</map>`;

    const expanded = expandCompressedTiledMapText(xml);
    expect(expanded).not.toMatch(/compression="gzip"/i);
    expect(parseTiledMapText(expanded).tilemap).toEqual(gids);
  });

  it("expands zlib TMX layer data", () => {
    const gids = [9, 8, 7, 6];
    const encoded = deflateSync(gidBytes(gids)).toString("base64");
    const xml = `<map width="2" height="2" tilewidth="8" tileheight="8">
  <layer name="Ground" width="2" height="2">
    <data encoding="base64" compression="zlib">${encoded}</data>
  </layer>
</map>`;

    expect(parseTiledMapText(expandCompressedTiledMapText(xml)).tilemap).toEqual(gids);
  });

  it("rejects compressed payloads whose decompressed output exceeds the import limit", () => {
    const encoded = gzipSync(Buffer.alloc(TILED_MAP_MAX_DECOMPRESSED_BYTES + 1)).toString("base64");
    const xml = `<map width="1" height="1"><layer name="Ground" width="1" height="1"><data encoding="base64" compression="gzip">${encoded}</data></layer></map>`;

    expect(() => expandCompressedTiledMapText(xml)).toThrow(/grande|limite|descomprimido/i);
  });

  it("rejects the aggregate output of multiple compressed layers", () => {
    const layerBytes = Buffer.alloc(2 * 1024 * 1024 + 4);
    const first = gzipSync(layerBytes).toString("base64");
    const second = gzipSync(layerBytes).toString("base64");
    const xml = `<map width="1" height="1"><layer name="A" width="1" height="1"><data encoding="base64" compression="gzip">${first}</data></layer><layer name="B" width="1" height="1"><data encoding="base64" compression="gzip">${second}</data></layer></map>`;

    expect(() => expandCompressedTiledMapText(xml)).toThrow(/total|limite|descomprimido/i);
  });
});
