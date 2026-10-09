import type { GBAProjectData } from './projectFile.js';

// Must match exported_world_map: 31x21 8bpp tiles, BG2 screenblock 27,
// UI tiles start at byte 45056. Tile telemetry uses 32-byte units.
export const PAGED_WORLD_MAP = Object.freeze({
  tileBytes: 31 * 21 * 64,
  tileUnits: 31 * 21 * 2,
  maxTileUnits: 45056 / 32,
  paletteColors: 224,
  dmaBudget: 49152
});

export function hasPagedWorldMap(data: GBAProjectData, scene: Record<string, unknown> | undefined): boolean {
  if (scene?.sceneType !== 'worldMap') return false;
  const assets = Array.isArray(data.assets) ? data.assets : [];
  return assets.some(asset => {
    if (!asset || typeof asset !== 'object') return false;
    const a = asset as Record<string, unknown>;
    const metadata = a.metadata as Record<string, unknown> | undefined;
    return a.name === scene.backgroundAssetName && (metadata?.kind === 'paged_bg' || a.kind === 'paged_bg');
  });
}
