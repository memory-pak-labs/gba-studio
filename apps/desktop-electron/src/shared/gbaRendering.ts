import type { GBAProjectData } from "./projectFile.js";
import {
  gbaBackgroundLayerDrawOrder,
  gbaObjLayerSpec,
  gbaVideoModeFromProject,
  sceneTileLayerAvailableForVideoMode,
  type GbaVideoModeId
} from "./gbaVideoModes.js";
import {
  readSceneTileLayersFromRoom,
  sceneTileLayerEmptyTile,
  type SceneTileLayerMapping
} from "./sceneTileLayers.js";

export const gbaTileSizePx = 8;

export const gbaRenderLayers = {
  bg0: "BG0",
  bg1: "BG1",
  bg2: "BG2",
  bg3: "BG3",
  obj: "OBJ"
} as const;

export type GbaRenderLayer = typeof gbaRenderLayers[keyof typeof gbaRenderLayers];

export interface GbaRenderDiagnostic {
  severity: "warning" | "error";
  message: string;
}

export interface GbaRenderAssetRef {
  name: string;
  kind: string;
  source: string | null;
  bundledDefaultAsset: string | null;
}

export interface GbaBackgroundRenderLayer {
  layer: SceneTileLayerMapping;
  assetName: string | null;
  asset: GbaRenderAssetRef | null;
  source: string | null;
  tileWidth: number;
  tileHeight: number;
  tileOffsetX: number;
  tileOffsetY: number;
  tileCells: number[];
  paintedTileCount: number;
  diagnostics: GbaRenderDiagnostic[];
}

export interface GbaRoomTilesetRenderLayer extends GbaBackgroundRenderLayer {
  layer: typeof gbaRenderLayers.bg2;
}

export interface GbaRoomRenderLayers {
  backgrounds: Record<SceneTileLayerMapping, GbaBackgroundRenderLayer>;
  obj: typeof gbaObjLayerSpec & { activeSpriteCount: number };
  videoMode: GbaVideoModeId;
  videoModeLabel: string;
}

export interface GbaActorSpriteFrame {
  animationID: string;
  animationName: string;
  frameHeight: number;
  frameIndex: number;
  frameWidth: number;
  fps: number;
  heightTiles: number;
  layer: typeof gbaRenderLayers.obj;
  originX: number;
  originY: number;
  sourceHeight: number;
  sourceSheets: string[];
  sourceWidth: number;
  sourceX: number;
  sourceY: number;
  spriteSheet: string;
  tileCount: number;
  widthTiles: number;
}

export interface GbaActorSpriteRoomPlacement {
  heightTiles: number;
  leftTiles: number;
  topTiles: number;
  widthTiles: number;
}

export interface GbaActorSpriteRoomPlacementPercent {
  height: string;
  left: string;
  top: string;
  width: string;
}

export interface GbaActorSpriteRenderLayer {
  layer: typeof gbaRenderLayers.obj;
  spriteSheet: string | null;
  asset: GbaRenderAssetRef | null;
  source: string | null;
  bundledDefaultAsset: string | null;
  animationName: string | null;
  frame: GbaActorSpriteFrame | null;
  diagnostics: GbaRenderDiagnostic[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function projectArray(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function signedInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function assetByName(data: GBAProjectData, assetName: string | null): GbaRenderAssetRef | null {
  if (!assetName) return null;
  const asset = projectArray(data, "assets").find((item) => nullableString(item.name) === assetName);
  if (!asset) return null;
  const metadata = isRecord(asset.metadata) ? asset.metadata : {};
  return {
    name: assetName,
    kind: stringField(asset.kind, "Arquivo"),
    source: nullableString(metadata.source),
    bundledDefaultAsset: nullableString(metadata.bundledDefaultAsset)
  };
}

function normalizedTileCells(room: Record<string, unknown>, width: number, height: number): number[] {
  const tilemap = Array.isArray(room.tilemap) ? room.tilemap : [];
  return Array.from({ length: width * height }, (_value, index) => {
    const tile = tilemap[index];
    return typeof tile === "number" && Number.isFinite(tile) && tile >= 0 ? Math.floor(tile) : 0;
  });
}

function roomBackgroundAssetName(room: Record<string, unknown>): string | null {
  return nullableString(room.backgroundAssetName) ?? nullableString(room.background);
}

export function gbaSpriteTilesForPixels(pixels: number): number {
  return Math.max(1, Math.ceil(positiveInteger(pixels, gbaTileSizePx) / gbaTileSizePx));
}

const GBA_OBJ_DIMENSIONS = new Set([
  "8x8", "16x16", "32x32", "64x64",
  "16x8", "32x8", "32x16", "64x32",
  "8x16", "8x32", "16x32", "32x64"
]);

/** Maximum number of hardware OBJ parts that one engine MetaSprite can carry. */
export const gbaMetaspritePartLimit = 32;

export function isGbaObjNativeDimension(width: number, height: number): boolean {
  return GBA_OBJ_DIMENSIONS.has(`${Math.floor(width)}x${Math.floor(height)}`);
}

/** Returns the number of native GBA OBJ entries needed for one frame. */
export function gbaSpriteOamEntriesForPixels(width: number, height: number): number {
  const tilesWide = gbaSpriteTilesForPixels(width);
  const tilesHigh = gbaSpriteTilesForPixels(height);
  const costs = Array.from({ length: tilesWide + 1 }, () => Array<number>(tilesHigh + 1).fill(Number.POSITIVE_INFINITY));
  for (let x = 0; x <= tilesWide; x += 1) costs[x][0] = 0;
  for (let y = 0; y <= tilesHigh; y += 1) costs[0][y] = 0;

  for (let currentWidth = 1; currentWidth <= tilesWide; currentWidth += 1) {
    for (let currentHeight = 1; currentHeight <= tilesHigh; currentHeight += 1) {
      if (isGbaObjNativeDimension(currentWidth * gbaTileSizePx, currentHeight * gbaTileSizePx)) {
        costs[currentWidth][currentHeight] = 1;
        continue;
      }
      for (let split = currentWidth - 1; split >= 1; split -= 1) {
        costs[currentWidth][currentHeight] = Math.min(
          costs[currentWidth][currentHeight],
          costs[split][currentHeight] + costs[currentWidth - split][currentHeight]
        );
      }
      for (let split = currentHeight - 1; split >= 1; split -= 1) {
        costs[currentWidth][currentHeight] = Math.min(
          costs[currentWidth][currentHeight],
          costs[currentWidth][split] + costs[currentWidth][currentHeight - split]
        );
      }
    }
  }

  const result = costs[tilesWide][tilesHigh];
  return Number.isFinite(result) ? result : tilesWide * tilesHigh;
}

function clampOrigin(value: number, max: number): number {
  // GB Studio canvas origins are signed offsets and may place a frame beyond the canvas.
  return Math.max(-96, Math.min(Math.floor(value), Math.max(0, Math.floor(max))));
}

function defaultActorSpriteOrigin(frameWidth: number, frameHeight: number): { originX: number; originY: number } {
  return {
    originX: Math.floor(frameWidth / 2),
    originY: Math.max(0, frameHeight - gbaTileSizePx)
  };
}

export function gbaActorSpriteRoomPlacement(
  tileX: number,
  tileY: number,
  frameWidthPx: number,
  frameHeightPx: number,
  originX: number,
  originY: number
): GbaActorSpriteRoomPlacement {
  const frameWidth = positiveInteger(frameWidthPx, gbaTileSizePx);
  const frameHeight = positiveInteger(frameHeightPx, gbaTileSizePx);
  const defaults = defaultActorSpriteOrigin(frameWidth, frameHeight);
  const anchorOriginX = clampOrigin(signedInteger(originX, defaults.originX), frameWidth);
  const anchorOriginY = clampOrigin(signedInteger(originY, defaults.originY), frameHeight);
  const leftOffsetPx = -anchorOriginX;
  const topOffsetPx = -anchorOriginY;

  return {
    leftTiles: tileX + leftOffsetPx / gbaTileSizePx,
    topTiles: tileY + topOffsetPx / gbaTileSizePx,
    widthTiles: gbaSpriteTilesForPixels(frameWidth),
    heightTiles: gbaSpriteTilesForPixels(frameHeight)
  };
}

export function gbaActorSpriteRoomPlacementPercent(
  roomWidth: number,
  roomHeight: number,
  placement: GbaActorSpriteRoomPlacement
): GbaActorSpriteRoomPlacementPercent {
  const width = Math.max(1, Math.floor(roomWidth));
  const height = Math.max(1, Math.floor(roomHeight));

  return {
    left: `${(placement.leftTiles / width) * 100}%`,
    top: `${(placement.topTiles / height) * 100}%`,
    width: `${Math.min(100, (placement.widthTiles / width) * 100)}%`,
    height: `${Math.min(100, (placement.heightTiles / height) * 100)}%`
  };
}

export function gbaActorSpriteRoomPlacementFromFrame(
  tileX: number,
  tileY: number,
  frame: Pick<GbaActorSpriteFrame, "frameWidth" | "frameHeight" | "originX" | "originY">
): GbaActorSpriteRoomPlacement {
  return gbaActorSpriteRoomPlacement(tileX, tileY, frame.frameWidth, frame.frameHeight, frame.originX, frame.originY);
}

export function gbaTopdownTileToPixels(tile: number): number {
  return Math.floor(tile) * gbaTileSizePx;
}

export function gbaTopdownAreaToPixels(area: { height: number; width: number; x: number; y: number }): {
  height: number;
  width: number;
  x: number;
  y: number;
} {
  return {
    x: gbaTopdownTileToPixels(area.x),
    y: gbaTopdownTileToPixels(area.y),
    width: gbaTopdownTileToPixels(area.width),
    height: gbaTopdownTileToPixels(area.height)
  };
}

export function gbaTopdownTilePointToPixels(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: gbaTopdownTileToPixels(point.x),
    y: gbaTopdownTileToPixels(point.y)
  };
}

function layerAssetNameForCell(
  room: Record<string, unknown>,
  mapping: SceneTileLayerMapping,
  cellIndex: number,
  fallbackAssetName: string | null
): string | null {
  const layers = readSceneTileLayersFromRoom(room);
  const layer = layers.find((candidate) => candidate.mapping === mapping);
  const perCellAsset = layer?.tileSourceAssetNames[cellIndex]?.trim();
  if (perCellAsset) return perCellAsset;
  if (mapping === "BG2") return fallbackAssetName;
  return null;
}

function layerTileCells(
  room: Record<string, unknown>,
  mapping: SceneTileLayerMapping,
  width: number,
  height: number
): number[] {
  const count = width * height;
  const layers = readSceneTileLayersFromRoom(room);
  const layer = layers.find((candidate) => candidate.mapping === mapping);
  if (layer) {
    return Array.from({ length: count }, (_value, index) => {
      const tile = layer.tilemap[index];
      if (typeof tile !== "number" || !Number.isFinite(tile) || tile === sceneTileLayerEmptyTile) return 0;
      return Math.max(0, Math.floor(tile));
    });
  }

  if (mapping === "BG2") {
    return normalizedTileCells(room, width, height);
  }

  return Array.from({ length: count }, () => 0);
}

function resolveBackgroundLayerMetadata(
  data: GBAProjectData,
  room: Record<string, unknown>,
  mapping: SceneTileLayerMapping
): Pick<GbaBackgroundRenderLayer, "tileWidth" | "tileHeight" | "tileOffsetX" | "tileOffsetY"> {
  const fallbackAssetName = roomBackgroundAssetName(room);
  const assetName = fallbackAssetName;
  const asset = assetByName(data, assetName);
  const metadata = assetName
    ? projectArray(data, "assets").find((item) => nullableString(item.name) === assetName)
    : null;
  const metadataFields = isRecord(metadata?.metadata) ? metadata.metadata : {};
  return {
    tileWidth: positiveInteger(room.backgroundTileWidth, positiveInteger(metadataFields.tileWidth, gbaTileSizePx)),
    tileHeight: positiveInteger(room.backgroundTileHeight, positiveInteger(metadataFields.tileHeight, gbaTileSizePx)),
    tileOffsetX: nonNegativeInteger(room.backgroundTileOffsetX, nonNegativeInteger(metadataFields.tileOffsetX, 0)),
    tileOffsetY: nonNegativeInteger(room.backgroundTileOffsetY, nonNegativeInteger(metadataFields.tileOffsetY, 0))
  };
}

export function resolveGbaRoomBackgroundLayer(
  data: GBAProjectData,
  room: Record<string, unknown>,
  mapping: SceneTileLayerMapping
): GbaBackgroundRenderLayer {
  const width = positiveInteger(room.width, 30);
  const height = positiveInteger(room.height, 20);
  const fallbackAssetName = roomBackgroundAssetName(room);
  const tileCells = layerTileCells(room, mapping, width, height);
  const authoredLayer = readSceneTileLayersFromRoom(room).find((layer) => layer.mapping === mapping);
  const paintedIndices = authoredLayer
    ? authoredLayer.tilemap.flatMap((value, index) => (
        value === sceneTileLayerEmptyTile ? [] : [index]
      ))
    : [];
  const paintedTileCount = authoredLayer
    ? paintedIndices.length
    : mapping === "BG2" && fallbackAssetName
      ? width * height
      : tileCells.filter((value) => value > 0).length;
  const primaryAssetName = paintedIndices
    .map((index) => layerAssetNameForCell(room, mapping, index, fallbackAssetName))
    .find((assetName): assetName is string => Boolean(assetName))
    ?? (mapping === "BG2" ? fallbackAssetName : null);
  const asset = assetByName(data, primaryAssetName);
  const diagnostics: GbaRenderDiagnostic[] = [];
  if (primaryAssetName && !asset) {
    diagnostics.push({ severity: "warning", message: `Tileset asset nao encontrado em ${mapping}: ${primaryAssetName}.` });
  }

  return {
    layer: mapping,
    assetName: primaryAssetName,
    asset,
    source: asset?.source ?? null,
    paintedTileCount,
    ...resolveBackgroundLayerMetadata(data, room, mapping),
    tileCells,
    diagnostics
  };
}

export function resolveGbaRoomBackgroundLayers(
  data: GBAProjectData,
  room: Record<string, unknown>,
  videoMode: GbaVideoModeId = gbaVideoModeFromProject(data).id
): Record<SceneTileLayerMapping, GbaBackgroundRenderLayer> {
  return {
    BG0: resolveGbaRoomBackgroundLayer(data, room, "BG0"),
    BG1: resolveGbaRoomBackgroundLayer(data, room, "BG1"),
    BG2: resolveGbaRoomBackgroundLayer(data, room, "BG2"),
    BG3: resolveGbaRoomBackgroundLayer(data, room, "BG3")
  };
}

export function resolveGbaRoomRenderLayers(
  data: GBAProjectData,
  room: Record<string, unknown>,
  activeSpriteCount = 0
): GbaRoomRenderLayers {
  const videoModeDefinition = gbaVideoModeFromProject(data);
  const backgrounds = resolveGbaRoomBackgroundLayers(data, room, videoModeDefinition.id);
  return {
    backgrounds,
    obj: {
      ...gbaObjLayerSpec,
      activeSpriteCount
    },
    videoMode: videoModeDefinition.id,
    videoModeLabel: videoModeDefinition.label
  };
}

export function activeGbaBackgroundLayers(
  renderLayers: GbaRoomRenderLayers
): GbaBackgroundRenderLayer[] {
  return gbaBackgroundLayerDrawOrder
    .filter((mapping) => sceneTileLayerAvailableForVideoMode(mapping, renderLayers.videoMode))
    .map((mapping) => renderLayers.backgrounds[mapping])
    .filter((layer) => layer.paintedTileCount > 0 || layer.layer === "BG2");
}

export function resolveGbaRoomTileset(data: GBAProjectData, room: Record<string, unknown>): GbaRoomTilesetRenderLayer {
  const resolved = resolveGbaRoomBackgroundLayer(data, room, "BG2");
  return {
    ...resolved,
    layer: gbaRenderLayers.bg2
  };
}

function animationID(animation: Record<string, unknown>, index: number): string {
  return nullableString(animation.id) ?? `animation-${index + 1}`;
}

function animationMatchesActor(
  animation: Record<string, unknown>,
  index: number,
  spriteSheet: string | null,
  animationName: string | null
): boolean {
  const candidateID = animationID(animation, index);
  const candidateName = nullableString(animation.name);
  const candidateSheet = nullableString(animation.spriteSheet);
  const nameMatches = Boolean(animationName && (candidateName === animationName || candidateID === animationName));
  const sheetMatches = !spriteSheet || candidateSheet === spriteSheet;
  return nameMatches && sheetMatches;
}

const FEET_ANCHORED_SCENE_TYPES = new Set([
  "topdown",
  "platformer",
  "pointAndClick",
  "isometric",
  "dungeonCrawler",
  "racing",
  "battleRpg",
  "luta"
]);

function actorSceneType(data: GBAProjectData, actor: Record<string, unknown>): string | null {
  const roomName = nullableString(actor.roomName) ?? nullableString(actor.sceneName) ?? nullableString(actor.room);
  if (!roomName) return null;
  const scene = projectArray(data, "scenas").find((candidate) => nullableString(candidate.name) === roomName)
    ?? projectArray(data, "rooms").find((candidate) => nullableString(candidate.name) === roomName);
  if (!scene) return null;
  const runtime = isRecord(scene.runtime) ? scene.runtime : {};
  return nullableString(runtime.type) ?? nullableString(scene.sceneType);
}

function resolveActorFrameOrigin(
  data: GBAProjectData,
  actor: Record<string, unknown>,
  animation: Record<string, unknown>,
  selectedFrame: Record<string, unknown>,
  frame: GbaActorSpriteRenderLayer["frame"]
): GbaActorSpriteRenderLayer["frame"] {
  if (!frame) return frame;
  const actorOriginX = typeof actor.originX === "number" && Number.isFinite(actor.originX) ? actor.originX : null;
  const actorOriginY = typeof actor.originY === "number" && Number.isFinite(actor.originY) ? actor.originY : null;
  if (actorOriginX !== null || actorOriginY !== null) {
    return {
      ...frame,
      originX: clampOrigin(actorOriginX ?? frame.originX, frame.frameWidth),
      originY: clampOrigin(actorOriginY ?? frame.originY, frame.frameHeight)
    };
  }

  if (animation.originSpace === "animator") {
    // Source-image previews count y downward; Animator origins count from
    // the foot line. X is already normalized by completeFrameTranslationX.
    return { ...frame, originY: clampOrigin(frame.originY + frame.frameHeight - gbaTileSizePx, frame.frameHeight) };
  }

  const generatedZeroOrigin = (
    typeof animation.originX === "number" && animation.originX === 0
    && typeof animation.originY === "number" && animation.originY === 0
    && typeof selectedFrame.originX === "number"
    && (selectedFrame.originX === 0 || frame.originX === 0)
    && typeof selectedFrame.originY === "number" && selectedFrame.originY === 0
  );
  if (!generatedZeroOrigin || !FEET_ANCHORED_SCENE_TYPES.has(actorSceneType(data, actor) ?? "")) return frame;

  const defaults = defaultActorSpriteOrigin(frame.frameWidth, frame.frameHeight);
  return { ...frame, originX: defaults.originX, originY: defaults.originY };
}

/** A complete source image uses a scene pivot relative to its top-left, not the animator canvas. */
function completeFrameTranslationX(tiles: Record<string, unknown>[], width: number, height: number): number {
  if (!tiles.length || tiles.some(tile => !Number.isFinite(tile.x) || !Number.isFinite(tile.y))) return 0;
  const minX = Math.min(...tiles.map(tile => signedInteger(tile.x, 0)));
  const sliceX = Math.min(...tiles.map(tile => nonNegativeInteger(tile.sliceX, 0)));
  const sliceY = Math.min(...tiles.map(tile => nonNegativeInteger(tile.sliceY, 0)));
  const rectangles = tiles.map(tile => ({
    x: nonNegativeInteger(tile.sliceX, 0) - sliceX,
    y: nonNegativeInteger(tile.sliceY, 0) - sliceY,
    width: positiveInteger(tile.tileWidth, width), height: positiveInteger(tile.tileHeight, height)
  }));
  if (rectangles.reduce((area, rect) => area + rect.width * rect.height, 0) !== width * height) return 0;
  if (!rectangles.every((rect, index) => (
    rect.x + rect.width <= width && rect.y + rect.height <= height
    && signedInteger(tiles[index].x, 0) === minX + rect.x
    && signedInteger(tiles[index].y, 0) === height - rect.y - rect.height
    && rectangles.slice(index + 1).every(other => (
      rect.x + rect.width <= other.x || other.x + other.width <= rect.x
      || rect.y + rect.height <= other.y || other.y + other.height <= rect.y
    ))
  ))) return 0;
  return minX;
}

function gbaActorSpriteFrameFromAnimation(
  data: GBAProjectData,
  actor: Record<string, unknown>,
  animation: Record<string, unknown>,
  animationIndex: number,
  frameIndex: number,
  spriteSheet: string,
  animationName: string | null
): GbaActorSpriteRenderLayer["frame"] {
  const frameWidth = positiveInteger(animation.frameWidth, 16);
  const frameHeight = positiveInteger(animation.frameHeight, 16);
  const frames = Array.isArray(animation.frames) ? animation.frames.filter(isRecord) : [];
  const selectedFrame = frames.length > 0
    ? frames[((Math.floor(frameIndex) % frames.length) + frames.length) % frames.length]
    : {};
  const tiles = Array.isArray(selectedFrame.tiles) ? selectedFrame.tiles.filter(isRecord) : [];
  const firstTile = tiles[0] ?? null;
  const sourceSheets = Array.from(new Set(tiles.flatMap((tile) => nullableString(tile.sourceSheet) ?? [])));
  const runtimeFrameWidth = positiveInteger(selectedFrame.width, frameWidth);
  const runtimeFrameHeight = positiveInteger(selectedFrame.height, frameHeight);
  const defaults = defaultActorSpriteOrigin(runtimeFrameWidth, runtimeFrameHeight);
  const animationOriginX = signedInteger(animation.originX, defaults.originX);
  const animationOriginY = signedInteger(animation.originY, defaults.originY);
  // Fitting a composition translates tile.x and frame.originX by the same amount.
  // Undo that translation for the source-image preview; actor coordinates and export stay intact.
  const originX = clampOrigin(signedInteger(selectedFrame.originX, animationOriginX)
    - completeFrameTranslationX(tiles, runtimeFrameWidth, runtimeFrameHeight), runtimeFrameWidth);
  const originY = clampOrigin(signedInteger(selectedFrame.originY, animationOriginY), runtimeFrameHeight);

  const frame = {
    animationID: animationID(animation, animationIndex),
    animationName: stringField(animation.name, animationName ?? `animation-${animationIndex + 1}`),
    frameHeight: runtimeFrameHeight,
    frameIndex: nonNegativeInteger(selectedFrame.frameIndex, Math.max(0, Math.floor(frameIndex))),
    frameWidth: runtimeFrameWidth,
    fps: positiveInteger(animation.fps, 1),
    heightTiles: gbaSpriteTilesForPixels(runtimeFrameHeight),
    layer: gbaRenderLayers.obj,
    originX,
    originY,
    sourceHeight: firstTile ? positiveInteger(firstTile.tileHeight, runtimeFrameHeight) : runtimeFrameHeight,
    sourceSheets: sourceSheets.length > 0 ? sourceSheets : [spriteSheet],
    sourceWidth: firstTile ? positiveInteger(firstTile.tileWidth, runtimeFrameWidth) : runtimeFrameWidth,
    sourceX: firstTile ? nonNegativeInteger(firstTile.sliceX, 0) : 0,
    sourceY: firstTile ? nonNegativeInteger(firstTile.sliceY, 0) : 0,
    spriteSheet: stringField(animation.spriteSheet, spriteSheet),
    tileCount: tiles.length,
    widthTiles: gbaSpriteTilesForPixels(runtimeFrameWidth)
  };
  return resolveActorFrameOrigin(data, actor, animation, selectedFrame, frame);
}

export function resolveGbaActorSpriteFrame(
  data: GBAProjectData,
  actor: Record<string, unknown>,
  frameIndex = 0
): GbaActorSpriteRenderLayer | null {
  const spriteSheet = nullableString(actor.spriteSheet);
  const animationName = nullableString(actor.animationName);
  const actorName = nullableString(actor.name) ?? "Ator";
  const asset = assetByName(data, spriteSheet);
  const diagnostics: GbaRenderDiagnostic[] = [];
  if (!spriteSheet) {
    return null;
  }
  if (!asset) {
    diagnostics.push({ severity: "warning", message: `Sprite asset nao encontrado: ${spriteSheet}.` });
  }

  const animationEntry = projectArray(data, "animations")
    .map((animation, index) => ({ animation, index }))
    .find(({ animation, index }) => animationMatchesActor(animation, index, spriteSheet, animationName));

  if (animationName && !animationEntry) {
    diagnostics.push({ severity: "warning", message: `Animacao nao encontrada para ${actorName}: ${animationName}.` });
  }

  if (!animationEntry) {
    return {
      layer: gbaRenderLayers.obj,
      spriteSheet,
      asset,
      source: asset?.source ?? null,
      bundledDefaultAsset: asset?.bundledDefaultAsset ?? null,
      animationName,
      frame: null,
      diagnostics
    };
  }

  const { animation, index } = animationEntry;

  return {
    layer: gbaRenderLayers.obj,
    spriteSheet,
    asset,
    source: asset?.source ?? null,
    bundledDefaultAsset: asset?.bundledDefaultAsset ?? null,
    animationName,
    frame: gbaActorSpriteFrameFromAnimation(data, actor, animation, index, frameIndex, spriteSheet, animationName),
    diagnostics
  };
}

export function resolveGbaActorSprite(data: GBAProjectData, actor: Record<string, unknown>): GbaActorSpriteRenderLayer | null {
  return resolveGbaActorSpriteFrame(data, actor, 0);
}
