export const SCENE_TILEMAP_CONTRACT_ID = "gba-regular-metatile-2x2-v1" as const;

export type SceneTilemapModel = "regular-tiled";
export type SceneTilemapCollisionUnit = "metatile";
export type SceneLogicalTileLayerID = "base" | "top";
export type SceneLogicalTileLayerSource = "visual_tiles" | "foreground_tiles";

export interface SceneLogicalTileLayerContract {
  hardwareMapping: "BG1" | "BG2";
  id: SceneLogicalTileLayerID;
  source: SceneLogicalTileLayerSource;
}

export interface SceneTilemapContract {
  collisionUnit: SceneTilemapCollisionUnit;
  id: typeof SCENE_TILEMAP_CONTRACT_ID;
  logicalLayers: SceneLogicalTileLayerContract[];
  metatileHeight: 2;
  metatileWidth: 2;
  model: SceneTilemapModel;
  tileHeight: 8;
  tileWidth: 8;
}

export interface EngineSceneTilemapContract {
  collision_unit: SceneTilemapCollisionUnit;
  id: typeof SCENE_TILEMAP_CONTRACT_ID;
  logical_layers: Array<{
    hardware_mapping: "bg1" | "bg2";
    id: SceneLogicalTileLayerID;
    source: SceneLogicalTileLayerSource;
  }>;
  metatile_height: 2;
  metatile_width: 2;
  model: "regular_tiled";
  tile_height: 8;
  tile_width: 8;
}

const MODULAR_TILEMAP_SCENE_TYPES = new Set(["topdown", "racing"]);

function normalizedSceneType(sceneType: string | null | undefined): string {
  return typeof sceneType === "string"
    ? sceneType.trim().replace(/[-_\s]+/g, "").toLowerCase()
    : "";
}

function positiveInteger(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function resolveSceneTilemapContract(
  sceneType: string | null | undefined,
  width: number,
  height: number
): SceneTilemapContract | null {
  const normalizedType = normalizedSceneType(sceneType);
  const normalizedWidth = positiveInteger(width);
  const normalizedHeight = positiveInteger(height);

  if (
    !MODULAR_TILEMAP_SCENE_TYPES.has(normalizedType)
    || normalizedWidth % 2 !== 0
    || normalizedHeight % 2 !== 0
  ) {
    return null;
  }

  return {
    collisionUnit: "metatile",
    id: SCENE_TILEMAP_CONTRACT_ID,
    logicalLayers: [
      { hardwareMapping: "BG2", id: "base", source: "visual_tiles" },
      { hardwareMapping: "BG1", id: "top", source: "foreground_tiles" }
    ],
    metatileHeight: 2,
    metatileWidth: 2,
    model: "regular-tiled",
    tileHeight: 8,
    tileWidth: 8
  };
}

export function exportSceneTilemapContract(
  contract: SceneTilemapContract
): EngineSceneTilemapContract {
  return {
    collision_unit: contract.collisionUnit,
    id: contract.id,
    logical_layers: contract.logicalLayers.map((layer) => ({
      hardware_mapping: layer.hardwareMapping.toLowerCase() as "bg1" | "bg2",
      id: layer.id,
      source: layer.source
    })),
    metatile_height: contract.metatileHeight,
    metatile_width: contract.metatileWidth,
    model: "regular_tiled",
    tile_height: contract.tileHeight,
    tile_width: contract.tileWidth
  };
}

export function sceneTilemapCellIndexesForCell(
  width: number,
  height: number,
  cellIndex: number,
  contract: SceneTilemapContract | null | undefined
): number[] {
  const normalizedWidth = positiveInteger(width);
  const normalizedHeight = positiveInteger(height);
  const cellCount = normalizedWidth * normalizedHeight;
  if (
    normalizedWidth <= 0
    || normalizedHeight <= 0
    || !Number.isInteger(cellIndex)
    || cellIndex < 0
    || cellIndex >= cellCount
  ) {
    return [];
  }

  if (!contract) return [cellIndex];

  const blockWidth = contract.metatileWidth;
  const blockHeight = contract.metatileHeight;
  const cellX = cellIndex % normalizedWidth;
  const cellY = Math.floor(cellIndex / normalizedWidth);
  const left = Math.floor(cellX / blockWidth) * blockWidth;
  const top = Math.floor(cellY / blockHeight) * blockHeight;
  const indexes: number[] = [];
  for (let y = top; y < Math.min(top + blockHeight, normalizedHeight); y += 1) {
    for (let x = left; x < Math.min(left + blockWidth, normalizedWidth); x += 1) {
      indexes.push(y * normalizedWidth + x);
    }
  }
  return indexes;
}

export function sceneTilemapCellIndexesForRectangle(
  width: number,
  height: number,
  startCellIndex: number,
  endCellIndex: number,
  contract: SceneTilemapContract | null | undefined
): number[] {
  const normalizedWidth = positiveInteger(width);
  const normalizedHeight = positiveInteger(height);
  const cellCount = normalizedWidth * normalizedHeight;
  if (
    normalizedWidth <= 0
    || normalizedHeight <= 0
    || !Number.isInteger(startCellIndex)
    || !Number.isInteger(endCellIndex)
    || startCellIndex < 0
    || endCellIndex < 0
    || startCellIndex >= cellCount
    || endCellIndex >= cellCount
  ) {
    return [];
  }

  const startX = startCellIndex % normalizedWidth;
  const startY = Math.floor(startCellIndex / normalizedWidth);
  const endX = endCellIndex % normalizedWidth;
  const endY = Math.floor(endCellIndex / normalizedWidth);
  const left = Math.min(startX, endX);
  const right = Math.max(startX, endX);
  const top = Math.min(startY, endY);
  const bottom = Math.max(startY, endY);
  if (!contract) {
    const indexes: number[] = [];
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        indexes.push(y * normalizedWidth + x);
      }
    }
    return indexes;
  }

  const blockWidth = contract.metatileWidth;
  const blockHeight = contract.metatileHeight;
  const alignedLeft = Math.floor(left / blockWidth) * blockWidth;
  const alignedRight = Math.min(
    normalizedWidth - 1,
    (Math.floor(right / blockWidth) + 1) * blockWidth - 1
  );
  const alignedTop = Math.floor(top / blockHeight) * blockHeight;
  const alignedBottom = Math.min(
    normalizedHeight - 1,
    (Math.floor(bottom / blockHeight) + 1) * blockHeight - 1
  );
  const indexes: number[] = [];
  for (let y = alignedTop; y <= alignedBottom; y += 1) {
    for (let x = alignedLeft; x <= alignedRight; x += 1) {
      indexes.push(y * normalizedWidth + x);
    }
  }
  return indexes;
}
