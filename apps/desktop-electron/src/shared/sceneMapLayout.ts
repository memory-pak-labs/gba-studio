import { deriveIsometricWorldSize } from "./isometricAuthoring.js";
import { normalizeIsometricSceneConfig } from "./sceneTypeProfiles.js";

export interface SceneMapPosition {
  x: number;
  y: number;
}

export interface SceneMapSize {
  height: number;
  width: number;
}

export interface SceneMapRoomLike {
  height: number;
  sceneType?: string;
  width: number;
  backgroundAtlasTileHeight?: number;
  backgroundPixelWidth?: number | null;
  backgroundPixelHeight?: number | null;
  gbStudioUseBackgroundLayout?: boolean;
  runtime?: unknown;
}

export interface NamedSceneMapRoomLike extends SceneMapRoomLike {
  name: string;
}

export const SCENE_MAP_CONTENT_UNIT_SIZE = { width: 240, height: 160 } as const;
export const SCENE_MAP_PREVIEW_MAX_SIZE = { width: 960, height: 640 } as const;
export const SCENE_MAP_HEADER_HEIGHT = 54;
export const SCENE_MAP_FOOTER_HEIGHT = 36;
export const SCENE_MAP_HORIZONTAL_GAP = 48;
export const SCENE_MAP_VERTICAL_GAP = 52;
export const SCENE_MAP_ORIGIN = { x: 36, y: 36 } as const;
export const SCENE_MAP_COLUMNS = 4;
export const SCENE_MAP_MIN_ZOOM = 0.25;
export const SCENE_MAP_MAX_ZOOM = 4;
const GBA_SCREEN_TILES = { width: 30, height: 20 } as const;

export interface SceneMapCardChromeSize {
  footerHeight: number;
  headerHeight: number;
}

export function clampSceneMapZoom(zoom: number): number {
  return Math.min(SCENE_MAP_MAX_ZOOM, Math.max(SCENE_MAP_MIN_ZOOM, Number.isFinite(zoom) ? zoom : 1));
}

export function sceneMapContentSize(room: SceneMapRoomLike): SceneMapSize {
  const isometricMinimum = room.sceneType === "isometric";
  const minimumWidth = isometricMinimum ? GBA_SCREEN_TILES.width : 1;
  const minimumHeight = isometricMinimum ? GBA_SCREEN_TILES.height : 1;
  return {
    height: SCENE_MAP_CONTENT_UNIT_SIZE.height * Math.max(minimumHeight, room.height) / GBA_SCREEN_TILES.height,
    width: SCENE_MAP_CONTENT_UNIT_SIZE.width * Math.max(minimumWidth, room.width) / GBA_SCREEN_TILES.width
  };
}

export function integerNearestNeighborPreviewFit(
  source: SceneMapSize,
  bounds: SceneMapSize
): SceneMapSize & { divisor: number } {
  const sourceWidth = Math.max(1, source.width);
  const sourceHeight = Math.max(1, source.height);
  const boundsWidth = Math.max(1, bounds.width);
  const boundsHeight = Math.max(1, bounds.height);
  const divisor = Math.max(1, Math.ceil(Math.max(
    sourceWidth / boundsWidth,
    sourceHeight / boundsHeight
  )));

  return {
    divisor,
    height: Math.max(1, Math.floor(sourceHeight / divisor)),
    width: Math.max(1, Math.floor(sourceWidth / divisor))
  };
}

export function integerNearestNeighborPreviewFill(
  source: SceneMapSize,
  bounds: SceneMapSize
): SceneMapSize & { divisor: number } {
  const sourceWidth = Math.max(1, source.width);
  const sourceHeight = Math.max(1, source.height);
  const boundsWidth = Math.max(1, bounds.width);
  const boundsHeight = Math.max(1, bounds.height);
  const divisor = Math.max(1, Math.floor(Math.min(
    sourceWidth / boundsWidth,
    sourceHeight / boundsHeight
  )));

  return {
    divisor,
    height: Math.max(1, Math.floor(sourceHeight / divisor)),
    width: Math.max(1, Math.floor(sourceWidth / divisor))
  };
}

export function sceneMapPreviewContentSize(room: SceneMapRoomLike): SceneMapSize {
  let source = sceneMapContentSize(room);
  if (room.sceneType === "isometric") {
    const runtime = room.runtime as { config?: unknown } | undefined;
    const config = normalizeIsometricSceneConfig(runtime?.config);
    const pages = config.tacticalPresentation?.surfacePages ?? [];
    const bounds = pages.reduce((size, page) => ({
      minX: Math.min(size.minX, page.world.x),
      minY: Math.min(size.minY, page.world.y),
      maxX: Math.max(size.maxX, page.world.x + page.world.width),
      maxY: Math.max(size.maxY, page.world.y + page.world.height)
    }), { minX: 0, minY: 0, maxX: 0, maxY: 0 });
    const surfaceSize = { width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
    const authoredSize = config.worldMode === "static_composition" && room.gbStudioUseBackgroundLayout
      && (room.backgroundPixelWidth ?? 0) > 0 && (room.backgroundPixelHeight ?? 0) > 0
      ? { width: room.backgroundPixelWidth!, height: room.backgroundPixelHeight! } : undefined;
    source = config.pagedSurface ?? (surfaceSize.width > 0 && surfaceSize.height > 0 ? surfaceSize : authoredSize ?? deriveIsometricWorldSize({
      config, atlasTileHeight: room.backgroundAtlasTileHeight, height: room.height, width: room.width
    }));
  }
  const scale = Math.min(
    SCENE_MAP_PREVIEW_MAX_SIZE.width / Math.max(1, source.width),
    SCENE_MAP_PREVIEW_MAX_SIZE.height / Math.max(1, source.height),
    Math.max(1, SCENE_MAP_CONTENT_UNIT_SIZE.width / Math.max(1, source.width))
  );
  return { width: source.width * scale, height: source.height * scale };
}

export function sceneMapCardSize(room: SceneMapRoomLike): SceneMapSize {
  const content = sceneMapPreviewContentSize(room);
  return {
    height: content.height + SCENE_MAP_HEADER_HEIGHT + SCENE_MAP_FOOTER_HEIGHT,
    width: content.width
  };
}

export function sceneMapCardChromeSize(zoom: number): SceneMapCardChromeSize {
  const normalizedZoom = Math.min(1, Math.max(0, (clampSceneMapZoom(zoom) - SCENE_MAP_MIN_ZOOM) / (2 - SCENE_MAP_MIN_ZOOM)));
  const interpolate = (minimum: number, maximum: number): number => (
    Math.round((minimum + (maximum - minimum) * normalizedZoom) * 100) / 100
  );

  return {
    footerHeight: zoom <= 0.5 ? 0 : interpolate(24, SCENE_MAP_FOOTER_HEIGHT),
    headerHeight: interpolate(34, SCENE_MAP_HEADER_HEIGHT)
  };
}

export function displayedSceneMapContentSize(room: SceneMapRoomLike, zoom: number): SceneMapSize {
  const scale = clampSceneMapZoom(zoom);
  const content = sceneMapPreviewContentSize(room);
  return {
    height: content.height * scale,
    width: content.width * scale
  };
}

export function displayedSceneMapCardSize(room: SceneMapRoomLike, zoom: number): SceneMapSize {
  const content = displayedSceneMapContentSize(room, zoom);
  const chrome = sceneMapCardChromeSize(zoom);
  return {
    height: content.height + chrome.headerHeight + chrome.footerHeight,
    width: content.width
  };
}

export function displayedSceneMapPosition(position: SceneMapPosition, zoom: number): SceneMapPosition {
  const scale = clampSceneMapZoom(zoom);
  return {
    x: position.x * scale,
    y: position.y * scale
  };
}

export function organizedSceneMapPositions(
  rooms: NamedSceneMapRoomLike[],
  columns = SCENE_MAP_COLUMNS
): Record<string, SceneMapPosition> {
  const safeColumns = Math.max(1, Math.floor(columns));
  const positions: Record<string, SceneMapPosition> = {};
  let y = SCENE_MAP_ORIGIN.y;

  for (let rowStart = 0; rowStart < rooms.length; rowStart += safeColumns) {
    const rowRooms = rooms.slice(rowStart, rowStart + safeColumns);
    let x = SCENE_MAP_ORIGIN.x;
    let rowHeight = 0;

    rowRooms.forEach((room) => {
      const size = sceneMapCardSize(room);
      positions[room.name] = { x, y };
      x += size.width + SCENE_MAP_HORIZONTAL_GAP;
      rowHeight = Math.max(rowHeight, size.height);
    });

    y += rowHeight + SCENE_MAP_VERTICAL_GAP;
  }

  return positions;
}

export function defaultSceneMapPosition(index: number, rooms: SceneMapRoomLike[]): SceneMapPosition {
  const positions = organizedSceneMapPositions(
    rooms.map((room, roomIndex) => ({ ...room, name: String(roomIndex) }))
  );
  return positions[String(Math.max(0, index))] ?? { ...SCENE_MAP_ORIGIN };
}

export function preferredSceneMapPositionBeside(
  anchorRoom: SceneMapRoomLike,
  anchorPosition: SceneMapPosition
): SceneMapPosition {
  const anchorSize = sceneMapCardSize(anchorRoom);
  return {
    x: anchorPosition.x + anchorSize.width + SCENE_MAP_HORIZONTAL_GAP,
    y: anchorPosition.y
  };
}

export function deriveSceneMapCardDragPosition(options: {
  canvasZoom: number;
  clientX: number;
  clientY: number;
  startPosition: SceneMapPosition;
  startX: number;
  startY: number;
}): SceneMapPosition {
  const zoom = clampSceneMapZoom(options.canvasZoom);
  return {
    x: Math.max(0, Math.round(options.startPosition.x + (options.clientX - options.startX) / zoom)),
    y: Math.max(0, Math.round(options.startPosition.y + (options.clientY - options.startY) / zoom))
  };
}

export function deriveSceneMapCardDragTransform(options: {
  nextPosition: SceneMapPosition;
  startPosition: SceneMapPosition;
}): SceneMapPosition {
  return {
    x: options.nextPosition.x - options.startPosition.x,
    y: options.nextPosition.y - options.startPosition.y
  };
}

export function clientPointToSceneMapWorld(options: {
  clientX: number;
  clientY: number;
  scrollLeft: number;
  scrollTop: number;
  viewportLeft: number;
  viewportTop: number;
  zoom: number;
}): SceneMapPosition {
  const zoom = clampSceneMapZoom(options.zoom);
  return {
    x: (options.clientX - options.viewportLeft + options.scrollLeft) / zoom,
    y: (options.clientY - options.viewportTop + options.scrollTop) / zoom
  };
}

export interface SceneMapCardBounds {
  position: SceneMapPosition;
  size: SceneMapSize;
}

export interface FitSceneMapViewOptions {
  cards: SceneMapCardBounds[];
  maxZoom?: number;
  minZoom?: number;
  padding?: number;
  viewportHeight: number;
  viewportWidth: number;
}

export interface FitSceneMapViewResult {
  scrollLeft: number;
  scrollTop: number;
  zoom: number;
}

export function fitSceneMapViewToCards(options: FitSceneMapViewOptions): FitSceneMapViewResult {
  const padding = options.padding ?? 48;
  const minZoom = options.minZoom ?? SCENE_MAP_MIN_ZOOM;
  const maxZoom = options.maxZoom ?? SCENE_MAP_MAX_ZOOM;

  if (options.cards.length === 0 || options.viewportWidth <= 0 || options.viewportHeight <= 0) {
    return { scrollLeft: 0, scrollTop: 0, zoom: 1 };
  }

  const minX = Math.min(...options.cards.map((card) => card.position.x));
  const minY = Math.min(...options.cards.map((card) => card.position.y));
  const maxX = Math.max(...options.cards.map((card) => card.position.x + card.size.width));
  const maxY = Math.max(...options.cards.map((card) => card.position.y + card.size.height));
  const contentWidth = maxX - minX + padding * 2;
  const contentHeight = maxY - minY + padding * 2;
  const zoom = clampSceneMapZoom(Math.min(
    maxZoom,
    Math.max(minZoom, Math.min(options.viewportWidth / contentWidth, options.viewportHeight / contentHeight))
  ));

  return {
    scrollLeft: Math.max(0, Math.round((minX - padding) * zoom)),
    scrollTop: Math.max(0, Math.round((minY - padding) * zoom)),
    zoom
  };
}

const SCENE_MAP_TILE_GRID_LINE = "rgba(176, 188, 203, 0.45)";

/** Background CSS alinhado às células do tilemap no preview readonly do card. */
export function sceneMapTileGridBackgroundStyle(
  contentWidth: number,
  contentHeight: number,
  roomWidth: number,
  roomHeight: number
): { backgroundImage: string; backgroundSize: string } {
  const cellWidth = contentWidth / Math.max(1, roomWidth);
  const cellHeight = contentHeight / Math.max(1, roomHeight);
  return {
    backgroundImage: [
      `linear-gradient(${SCENE_MAP_TILE_GRID_LINE} 1px, transparent 1px)`,
      `linear-gradient(90deg, ${SCENE_MAP_TILE_GRID_LINE} 1px, transparent 1px)`
    ].join(", "),
    backgroundSize: `${cellWidth}px ${cellHeight}px`
  };
}

/** Assinatura compacta para repintar o canvas quando tiles mudam sem alterar paintedTileCount. */
export function roomTilemapPreviewSignature(
  roomID: string,
  roomWidth: number,
  roomHeight: number,
  background: string | null | undefined,
  tileCells: readonly number[],
  additionalValues: readonly unknown[] = []
): string {
  let hash = 2_166_136_261;
  for (const value of tileCells) {
    hash ^= value;
    hash = Math.imul(hash, 16_777_619);
  }
  for (const value of additionalValues) {
    const serialized = typeof value === "string" ? value : JSON.stringify(value) ?? "";
    for (let index = 0; index < serialized.length; index += 1) {
      hash ^= serialized.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }
  }
  return `${roomID}:${roomWidth}x${roomHeight}:${background ?? ""}:${hash >>> 0}`;
}
