import {
  DEFAULT_ISOMETRIC_SCENE_CONFIG,
  type IsometricSceneGeometryConfig
} from "./sceneTypeProfiles.js";

export interface IsometricCoordinate {
  x: number;
  y: number;
  z: number;
}

export interface IsometricScreenPoint {
  x: number;
  y: number;
}

export interface IsometricProjectionSize {
  height: number;
  width: number;
}

export interface IsometricProjectionCanvasOffset {
  x: number;
  y: number;
}

export interface IsometricProjectionBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface IsometricGeometryContract {
  cameraBounds: IsometricProjectionBounds;
  cell: IsometricProjectionSize;
  grid: { height: number; width: number };
  gridBounds: IsometricProjectionBounds;
  heightStep: number;
  origin: IsometricScreenPoint;
  viewport: IsometricProjectionSize;
  world: IsometricProjectionSize;
  worldBounds: IsometricProjectionBounds;
}

export interface IsometricGeometryContractInput {
  /**
   * Viewport explicitly chosen by the presentation, for example the first
   * resident page of a paged tactical surface. When omitted, the editor
   * keeps the centered viewport used by regular isometric rooms.
   */
  cameraBounds?: IsometricProjectionBounds;
  config?: IsometricSceneGeometryConfig;
  roomHeight: number;
  roomWidth: number;
  surfaceSize: IsometricProjectionSize;
  useWorldCoordinates?: boolean;
  viewportSize?: IsometricProjectionSize;
}

export interface IsometricCanvasPointToRoomTileOptions {
  canvasHeight: number;
  canvasWidth: number;
  pointX: number;
  pointY: number;
  roomHeight: number;
  roomWidth: number;
  surfaceSize: IsometricProjectionSize;
  useWorldCoordinates?: boolean;
  config?: IsometricSceneGeometryConfig;
  heightLevels?: readonly number[];
}

export interface CompiledIsometricRoomTiles {
  backgroundLayers: {
    bg0: number[];
    bg1: number[];
    bg2: number[];
    bg3: number[];
  };
  heightLevels: number[];
  visualTiles: number[];
}

export type IsometricPreviewLayerMapping = "BG0" | "BG1" | "BG2" | "BG3";

export interface IsometricPreviewTileLayer {
  mapping: IsometricPreviewLayerMapping;
  tilemap: number[];
}

interface IsometricTileLayerInput {
  mapping?: unknown;
  tilemap?: unknown;
}

interface CompileIsometricRoomTilesInput {
  height: number;
  heightLevels?: unknown;
  tileLayers?: readonly IsometricTileLayerInput[];
  visualTiles?: unknown;
  width: number;
}

function normalizedTileCells(value: unknown, count: number, maximum = Number.MAX_SAFE_INTEGER): number[] {
  const cells = Array.isArray(value) ? value : [];
  return Array.from({ length: count }, (_entry, index) => {
    const cell = cells[index];
    return typeof cell === "number" && Number.isFinite(cell) && cell >= 0
      ? Math.min(maximum, Math.floor(cell))
      : 0;
  });
}

export function compileIsometricRoomTiles(
  input: CompileIsometricRoomTilesInput
): CompiledIsometricRoomTiles {
  const width = Math.max(1, Math.floor(Number(input.width) || 1));
  const height = Math.max(1, Math.floor(Number(input.height) || 1));
  const tileCount = width * height;
  const fallbackVisualTiles = normalizedTileCells(input.visualTiles, tileCount);
  const layerTiles = (mapping: "BG0" | "BG1" | "BG2" | "BG3", fallback: number[] = []): number[] => {
    const layer = (input.tileLayers ?? []).find(
      (candidate) => typeof candidate.mapping === "string" && candidate.mapping.toUpperCase() === mapping
    );
    return normalizedTileCells(layer?.tilemap ?? fallback, tileCount);
  };
  const backgroundLayers = {
    bg0: layerTiles("BG0"),
    bg1: layerTiles("BG1"),
    bg2: layerTiles("BG2", fallbackVisualTiles),
    bg3: layerTiles("BG3")
  };
  return {
    backgroundLayers,
    heightLevels: normalizedTileCells(input.heightLevels, tileCount, 15),
    visualTiles: backgroundLayers.bg2
  };
}

/**
 * Mantém a ordem visual compartilhada pelo Editor e pelo runtime isométrico:
 * superfície, foreground autorado e camadas auxiliares.
 */
export function orderedIsometricPreviewTileLayers(
  compiled: CompiledIsometricRoomTiles
): IsometricPreviewTileLayer[] {
  return [
    { mapping: "BG2", tilemap: compiled.backgroundLayers.bg2 },
    { mapping: "BG1", tilemap: compiled.backgroundLayers.bg1 },
    { mapping: "BG0", tilemap: compiled.backgroundLayers.bg0 },
    { mapping: "BG3", tilemap: compiled.backgroundLayers.bg3 }
  ];
}

export function projectIsometricCoordinate(
  coordinate: IsometricCoordinate,
  config: IsometricSceneGeometryConfig = DEFAULT_ISOMETRIC_SCENE_CONFIG
): IsometricScreenPoint {
  const halfWidth = config.tileWidth / 2;
  const halfHeight = config.tileHeight / 2;
  return {
    x: config.originX + (coordinate.x - coordinate.y) * halfWidth,
    y: config.originY + (coordinate.x + coordinate.y) * halfHeight - coordinate.z * config.heightStep
  };
}

/**
 * Positions the logical origin inside the canvas so every room cell has the
 * same local coordinate system in the renderer, the grid and pointer picking.
 */
export function isometricProjectionCanvasOffset(
  roomHeight: number,
  config: IsometricSceneGeometryConfig = DEFAULT_ISOMETRIC_SCENE_CONFIG,
  surfaceSize?: IsometricProjectionSize
): IsometricProjectionCanvasOffset {
  if (surfaceSize) return { x: 0, y: 0 };
  return {
    x: config.originX - Math.max(1, Math.floor(roomHeight)) * (config.tileWidth / 2),
    y: config.originY
  };
}

export function projectIsometricRoomPoint(
  coordinate: IsometricCoordinate,
  roomHeight: number,
  config: IsometricSceneGeometryConfig = DEFAULT_ISOMETRIC_SCENE_CONFIG,
  surfaceSize?: IsometricProjectionSize
): IsometricScreenPoint {
  const projected = projectIsometricCoordinate(coordinate, config);
  const offset = isometricProjectionCanvasOffset(roomHeight, config, surfaceSize);
  return {
    x: projected.x - offset.x,
    y: projected.y - offset.y
  };
}

export function isometricRoomTileDiamondPoints(
  roomHeight: number,
  x: number,
  y: number,
  config: IsometricSceneGeometryConfig = DEFAULT_ISOMETRIC_SCENE_CONFIG,
  surfaceSize?: IsometricProjectionSize,
  z = 0
): [IsometricScreenPoint, IsometricScreenPoint, IsometricScreenPoint, IsometricScreenPoint] {
  const top = projectIsometricRoomPoint({ x, y, z }, roomHeight, config, surfaceSize);
  const halfWidth = config.tileWidth / 2;
  const halfHeight = config.tileHeight / 2;
  return [
    { x: top.x, y: top.y },
    { x: top.x + halfWidth, y: top.y + halfHeight },
    { x: top.x, y: top.y + config.tileHeight },
    { x: top.x - halfWidth, y: top.y + halfHeight }
  ];
}

/**
 * Inverse of the room projection. Pointer coordinates are first converted
 * into the same world space used by the forward projection, then snapped to
 * the nearest logical diamond center.
 */
export function canvasPointToIsometricRoomTile({
  canvasHeight,
  canvasWidth,
  pointX,
  pointY,
  roomHeight,
  roomWidth,
  surfaceSize,
  useWorldCoordinates = false,
  heightLevels,
  config = DEFAULT_ISOMETRIC_SCENE_CONFIG
}: IsometricCanvasPointToRoomTileOptions): { x: number; y: number } {
  const width = Math.max(1, Math.floor(roomWidth));
  const height = Math.max(1, Math.floor(roomHeight));
  const renderedWidth = Math.max(1, canvasWidth);
  const renderedHeight = Math.max(1, canvasHeight);
  const worldWidth = Math.max(1, surfaceSize.width);
  const worldHeight = Math.max(1, surfaceSize.height);
  const offset = isometricProjectionCanvasOffset(
    height,
    config,
    useWorldCoordinates ? surfaceSize : undefined
  );
  const worldPoint = {
    x: offset.x + (pointX / renderedWidth) * worldWidth,
    y: offset.y + (pointY / renderedHeight) * worldHeight
  };
  const halfWidth = Math.max(1, config.tileWidth / 2);
  const halfHeight = Math.max(1, config.tileHeight / 2);
  const diagonalX = (worldPoint.x - config.originX) / halfWidth;
  const diagonalY = ((worldPoint.y - config.originY) / halfHeight) - 1;
  // A raised surface can cover a ground-plane cell. Invert each supported
  // elevation and retain the visible diamond with the greatest painter depth.
  // Keep the ground-plane fallback for clicks outside the projected map.
  let visible: { x: number; y: number } | null = null;
  if (heightLevels?.length) {
    for (let z = 0; z <= 15; z += 1) {
      const elevatedY = diagonalY + z * config.heightStep / halfHeight;
      const x = Math.round((diagonalX + elevatedY) / 2);
      const y = Math.round((elevatedY - diagonalX) / 2);
      if (x < 0 || x >= width || y < 0 || y >= height || (heightLevels[y * width + x] ?? 0) !== z) continue;
      const center = projectIsometricCoordinate({ x, y, z }, config);
      const distance = Math.abs(worldPoint.x - center.x) / halfWidth
        + Math.abs(worldPoint.y - center.y - halfHeight) / halfHeight;
      if (distance <= 1 + 1e-9 && (!visible || x + y > visible.x + visible.y)) visible = { x, y };
    }
  }
  if (visible) return visible;
  return {
    x: Math.min(width - 1, Math.max(0, Math.round((diagonalX + diagonalY) / 2))),
    y: Math.min(height - 1, Math.max(0, Math.round((diagonalY - diagonalX) / 2)))
  };
}

function normalizedProjectionSize(size: IsometricProjectionSize): IsometricProjectionSize {
  return {
    height: Math.max(1, Math.floor(Number(size.height) || 1)),
    width: Math.max(1, Math.floor(Number(size.width) || 1))
  };
}

/**
 * Descreve as três escalas que precisam permanecer alinhadas no Editor:
 * mundo autoral, viewport físico do GBA e grade lógica isométrica.
 */
export function deriveIsometricGeometryContract({
  cameraBounds: requestedCameraBounds,
  config = DEFAULT_ISOMETRIC_SCENE_CONFIG,
  roomHeight,
  roomWidth,
  surfaceSize,
  useWorldCoordinates = true,
  viewportSize = { height: 160, width: 240 }
}: IsometricGeometryContractInput): IsometricGeometryContract {
  const world = normalizedProjectionSize(surfaceSize);
  const viewport = normalizedProjectionSize(viewportSize);
  const grid = {
    height: Math.max(1, Math.floor(Number(roomHeight) || 1)),
    width: Math.max(1, Math.floor(Number(roomWidth) || 1))
  };
  const projectionSurfaceSize = useWorldCoordinates ? world : undefined;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      for (const point of isometricRoomTileDiamondPoints(grid.height, x, y, config, projectionSurfaceSize)) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }
  }

  const gridBounds = {
    height: Math.max(1, maxY - minY),
    width: Math.max(1, maxX - minX),
    x: Number.isFinite(minX) ? minX : 0,
    y: Number.isFinite(minY) ? minY : 0
  };
  const cameraWidth = Math.min(world.width, viewport.width);
  const cameraHeight = Math.min(world.height, viewport.height);
  const projectionOffset = isometricProjectionCanvasOffset(grid.height, config, projectionSurfaceSize);
  const requestedCameraWidth = requestedCameraBounds
    ? Math.min(world.width, Math.max(1, Math.floor(requestedCameraBounds.width)))
    : cameraWidth;
  const requestedCameraHeight = requestedCameraBounds
    ? Math.min(world.height, Math.max(1, Math.floor(requestedCameraBounds.height)))
    : cameraHeight;
  const cameraBounds = requestedCameraBounds
    ? {
        height: requestedCameraHeight,
        width: requestedCameraWidth,
        x: Math.max(0, Math.min(world.width - requestedCameraWidth, Math.floor(requestedCameraBounds.x))),
        y: Math.max(0, Math.min(world.height - requestedCameraHeight, Math.floor(requestedCameraBounds.y)))
      }
    : {
        height: cameraHeight,
        width: cameraWidth,
        x: Math.max(0, Math.floor((world.width - cameraWidth) / 2)),
        y: Math.max(0, Math.floor((world.height - cameraHeight) / 2))
      };

  return {
    cameraBounds,
    cell: {
      height: config.tileHeight,
      width: config.tileWidth
    },
    grid,
    gridBounds,
    heightStep: config.heightStep,
    origin: {
      x: config.originX - projectionOffset.x,
      y: config.originY - projectionOffset.y
    },
    viewport,
    world,
    worldBounds: {
      height: world.height,
      width: world.width,
      x: 0,
      y: 0
    }
  };
}

export function isometricSpriteFeetOffset(
  spriteWidth: number,
  spriteHeight: number,
  tileHeight = DEFAULT_ISOMETRIC_SCENE_CONFIG.tileHeight
): IsometricScreenPoint {
  return {
    x: -Math.floor(spriteWidth / 2),
    y: Math.floor(tileHeight / 2) - spriteHeight
  };
}
