import type { GBAProjectData } from "./projectFile.js";

export const DEFAULT_ISOMETRIC_TILESET_NAME = "isometric-sandbox-sheet.png";
export const DEFAULT_ISOMETRIC_TILESET_BUNDLED_ASSET = "isometric-sandbox-tiles";
export const DEFAULT_ISOMETRIC_TILESET_SOURCE = `Assets/tiles/${DEFAULT_ISOMETRIC_TILESET_NAME}`;
export const DEFAULT_ISOMETRIC_GROUND_TILE_ID = 1;

export function defaultIsometricTilesetAsset(): Record<string, unknown> {
  return {
    id: "asset-default-isometric-tiles",
    name: DEFAULT_ISOMETRIC_TILESET_NAME,
    kind: "Tileset",
    systemImage: "square.grid.3x3.fill",
    metadata: {
      source: DEFAULT_ISOMETRIC_TILESET_SOURCE,
      bundledDefaultAsset: DEFAULT_ISOMETRIC_TILESET_BUNDLED_ASSET,
      tileWidth: 32,
      tileHeight: 16
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDefaultIsometricTilesetAsset(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.name === DEFAULT_ISOMETRIC_TILESET_NAME) return true;
  const metadata = isRecord(value.metadata) ? value.metadata : null;
  return metadata?.bundledDefaultAsset === DEFAULT_ISOMETRIC_TILESET_BUNDLED_ASSET;
}

export function ensureDefaultIsometricTilesetAsset(data: GBAProjectData): void {
  const assets = Array.isArray(data.assets) ? data.assets : [];
  if (assets.some(isDefaultIsometricTilesetAsset)) return;
  data.assets = [...assets, defaultIsometricTilesetAsset()];
}

export function defaultIsometricTilemap(width: number, height: number): number[] {
  const safeWidth = Number.isFinite(width) ? Math.max(1, Math.floor(width)) : 1;
  const safeHeight = Number.isFinite(height) ? Math.max(1, Math.floor(height)) : 1;
  return Array.from({ length: safeWidth * safeHeight }, () => DEFAULT_ISOMETRIC_GROUND_TILE_ID);
}

export function applyDefaultIsometricRoomVisuals(
  room: Record<string, unknown>,
  width: number,
  height: number
): boolean {
  const currentBackground = typeof room.backgroundAssetName === "string"
    ? room.backgroundAssetName.trim()
    : "";
  const usesDefaultTileset = currentBackground === "" || currentBackground === DEFAULT_ISOMETRIC_TILESET_NAME;
  if (!usesDefaultTileset) return false;

  room.backgroundAssetName = DEFAULT_ISOMETRIC_TILESET_NAME;
  const currentTilemap = Array.isArray(room.tilemap) ? room.tilemap : [];
  if (currentTilemap.length === 0 || currentTilemap.every((tileID) => Number(tileID) <= 0)) {
    room.tilemap = defaultIsometricTilemap(width, height);
  }
  return true;
}
