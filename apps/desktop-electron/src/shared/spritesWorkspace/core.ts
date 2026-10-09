import { spriteColorMode, spriteColorModeForSheet } from "../spriteColorDepth.js";
import type { GBAProjectData } from "../projectFile.js";
import {
  gbaMetaspritePartLimit,
  isGbaObjNativeDimension
} from "../gbaRendering.js";
import { gbaMetaspriteFramePartCount } from "../gbaMetaspriteLayout.js";
import {
  analyzeSpriteVram,
  spriteVramRecommendationLabels,
  spriteVramWarningLabels,
  type SpriteVramAnalysis
} from "../spriteVramAnalysis.js";
import {
  isSpriteAnimationType,
  type SpriteAnimationType,
  type SpriteStateContract
} from "../spriteAnimationState.js";

export const SPRITE_ORIGIN_MIN = -96;
export const SPRITE_ORIGIN_MAX = 96;

export interface SpritesWorkspaceSheet {
  id: string;
  name: string;
  source: string | null;
  bundledDefaultAsset: string | null;
  systemImage: string;
  hasAsset: boolean;
  animationCount: number;
  stateCount: number;
  referenceImageCount: number;
  totalFrames: number;
  maxFrameSize: string;
  colorModes: string[];
}

export interface SpritesWorkspaceAnimation {
  id: string;
  name: string;
  spriteSheet: string;
  frameSize: string;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  frameCount: number;
  loopMode: string;
  loops: boolean;
  pingPong: boolean;
  state: string | null;
  direction: string | null;
  colorMode: string;
  geometry: SpriteCanvasGeometry;
  frameEvents: SpriteFrameEventPresentation[][];
  metaspriteFrames: SpriteMetaspriteFramePresentation[];
  vramAnalysis: SpriteVramAnalysis;
}

export interface SpriteCanvasGeometry {
  frameWidth: number;
  frameHeight: number;
  originX: number;
  originY: number;
  hitboxX: number;
  hitboxY: number;
  hitboxWidth: number;
  hitboxHeight: number;
}

export interface SpriteFrameEventPresentation {
  type: string;
  value: string;
}

export interface SpriteMetaspriteFramePresentation {
  frameIndex: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
  tileCount: number;
  tiles: SpriteMetaspriteTilePresentation[];
  lastTile: SpriteMetaspriteTilePresentation | null;
}

export interface SpriteMetaspriteTilePresentation {
  tileIndex: number;
  x: number;
  y: number;
  sliceX: number;
  sliceY: number;
  sourceSheet: string;
  tileWidth: number;
  tileHeight: number;
  flipX: boolean;
  flipY: boolean;
  objPalette: string;
  paletteIndex: number;
  priority: boolean;
}

export interface SpritesWorkspaceReference {
  id: string;
  title: string;
  assetName: string | null;
  generatedSpriteAssetName: string | null;
  frameSize: string;
  fps: number;
  state: string;
  direction: string;
  opacity: number;
  isVisible: boolean;
  isActive: boolean;
}

export interface SpriteStateDirectionPreview {
  animationID: string;
  animationName: string;
  state: string;
  direction: string;
  frameSize: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
  loops: boolean;
  pingPong: boolean;
}

export interface SpritesWorkspaceSummary {
  spriteSheetCount: number;
  animationCount: number;
  animationStateCount: number;
  referenceImageCount: number;
  missingSpriteSheetCount: number;
  totalFrames: number;
}

export interface SpritesWorkspacePresentation {
  spriteSheets: SpritesWorkspaceSheet[];
  animationsBySheet: Record<string, SpritesWorkspaceAnimation[]>;
  animationStatesBySheet: Record<string, SpriteStateContract[]>;
  references: SpritesWorkspaceReference[];
  summary: SpritesWorkspaceSummary;
  stateDirectionOptionsBySheet: Record<string, SpriteStateDirectionOptions>;
  stateDirectionPreviewsBySheet: Record<string, SpriteStateDirectionPreview[]>;
}

export type SpritesWorkspaceFilterStatus = "" | "missing" | "referenced";

export interface SpritesWorkspaceFilterOptions {
  query?: string;
  status?: SpritesWorkspaceFilterStatus;
  searchScope?: "full" | "rail";
}

export interface SpritesWorkspaceFilterChip {
  id: string;
  label: string;
  value: SpritesWorkspaceFilterStatus;
  count: number;
  isActive: boolean;
}

export interface ActiveSpriteAnimationSelection {
  sheet: SpritesWorkspaceSheet;
  animation: SpritesWorkspaceAnimation;
}

export interface SpriteAnimationLibraryRow {
  id: string;
  name: string;
  frameCount: number;
  fps: number;
  frameSize: string;
  state: string | null;
  direction: string | null;
  loopMode: string;
  isActive: boolean;
}

export interface SpriteAnimationLibraryGroup {
  id: string;
  label: string;
  count: number;
  rows: SpriteAnimationLibraryRow[];
}

export interface SpriteFramePreviewRegion {
  frameIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CreateSpriteAnimationOptions {
  id: string;
  name: string;
  spriteSheet: string;
}

export interface DuplicateSpriteAnimationOptions {
  sourceAnimationID: string;
  newAnimationID: string;
  newName: string;
}

export interface GenerateSpriteFromReferenceOptions {
  referenceID: string;
  spriteAssetID: string;
  animationID: string;
  spriteSheetName: string;
  assetSourceRelativePath?: string;
}

export interface UpdateSpriteAnimationFields {
  spriteSheet?: string;
  frameWidth?: number;
  frameHeight?: number;
  fps?: number;
  frameCount?: number;
  loops?: boolean;
  pingPong?: boolean;
  state?: string;
  direction?: string;
  colorMode?: string;
  originX?: number;
  originY?: number;
  hitboxX?: number;
  hitboxY?: number;
  hitboxWidth?: number;
  hitboxHeight?: number;
}

export interface UpdateSpriteAnimationStateFields {
  animationType?: SpriteAnimationType;
  mirrorLeftFromRight?: boolean;
}

export interface UpdateSpriteMetaspriteFrameOptions {
  frameIndex: number;
  originX: number;
  originY: number;
}

export interface AddSpriteMetaspriteTileOptions {
  frameIndex: number;
  x: number;
  y: number;
  sliceX: number;
  sliceY: number;
  sourceSheet?: string;
  tileWidth?: number;
  tileHeight?: number;
}

export interface RemoveSpriteMetaspriteTileOptions {
  frameIndex: number;
  tileIndex: number;
}

export interface UpdateSpriteMetaspriteTileFields {
  x?: number;
  y?: number;
  sliceX?: number;
  sliceY?: number;
  sourceSheet?: string;
  tileWidth?: number;
  tileHeight?: number;
  flipX?: boolean;
  flipY?: boolean;
  objPalette?: string;
  paletteIndex?: number;
  priority?: boolean;
}

export interface UpdateSpriteMetaspriteTileOptions {
  frameIndex: number;
  tileIndex: number;
  fields: UpdateSpriteMetaspriteTileFields;
}

export interface UpdateSpriteAnimationGeometryOptions extends SpriteCanvasGeometry {}

export interface MultiSpriteMetaspriteTileOptions {
  frameIndex: number;
  tileIndexes: number[];
}

export interface MoveSpriteMetaspriteTilesOptions extends MultiSpriteMetaspriteTileOptions {
  deltaX: number;
  deltaY: number;
}

export interface ToggleSpriteMetaspriteTilesFlipOptions extends MultiSpriteMetaspriteTileOptions {
  horizontal: boolean;
}

export interface ReorderSpriteMetaspriteTilesOptions extends MultiSpriteMetaspriteTileOptions {
  placement: "front" | "back";
}

export interface BindSpriteFrameEventOptions {
  frameIndex: number;
  eventName: string;
}

export interface SpriteFrameEventBinding {
  animationID: string;
  animationName: string;
  category: string;
  currentEventName: string;
  eventExists: boolean;
  frameIndex: number;
  suggestedEventName: string;
}

export type SpriteMetaspriteCanvasMode = "select" | "paint" | "erase" | "geometry" | "events";

export type SpriteMetaspriteCanvasAction =
  | { type: "add_tile"; animationID: string; options: AddSpriteMetaspriteTileOptions }
  | { type: "remove_tile"; animationID: string; options: RemoveSpriteMetaspriteTileOptions }
  | { type: "update_tile"; animationID: string; options: UpdateSpriteMetaspriteTileOptions };

export interface DeriveSpriteMetaspriteCanvasActionOptions {
  animationID: string;
  canvasHeight: number;
  canvasWidth: number;
  frame: SpriteMetaspriteFramePresentation;
  frameIndex: number;
  mode: SpriteMetaspriteCanvasMode;
  pointX: number;
  pointY: number;
  selectedTile: SpriteMetaspriteTilePresentation | null;
}

export interface DeriveSpriteMetaspriteTileResizeActionOptions {
  animationID: string;
  deltaHeight: number;
  deltaWidth: number;
  frame: SpriteMetaspriteFramePresentation;
  frameIndex: number;
  selectedTile: SpriteMetaspriteTilePresentation | null;
}

export interface DeriveSpriteMetaspriteTileKeyboardActionOptions {
  animationID: string;
  frameIndex: number;
  key: string;
  selectedTile: SpriteMetaspriteTilePresentation | null;
  shiftKey?: boolean;
}

export interface DeriveSpriteFramePreviewRegionsOptions {
  imageWidth: number;
  imageHeight: number;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  maxPreviewFrames?: number;
}

export interface DeriveSpriteSheetFrameGridRegionsOptions {
  imageWidth: number;
  imageHeight: number;
  frameWidth: number;
  frameHeight: number;
  maxPreviewFrames?: number;
}

export interface DeriveSpritePaintTilePanelMetricsOptions {
  imageWidth: number;
  imageHeight: number;
  tileWidth: number;
  tileHeight: number;
  sliceX?: number;
  sliceY?: number;
  unitTileSize?: number;
}

export interface SpritePaintTilePanelMetrics {
  tileColumns: number;
  tileRows: number;
  tileCount: number;
  brushColumns: number;
  brushRows: number;
  brushTileCount: number;
  brushLabel: string;
  sliceLabel: string;
}

export interface DeriveMetaspriteCanvasSizeOptions {
  frameWidth: number;
  frameHeight: number;
  maxWidth?: number;
  maxHeight?: number;
  preferredScale?: number;
}

export interface MetaspriteCanvasSize {
  width: number;
  height: number;
  scale: number;
}

export interface DeriveSpriteCanvasFitScaleOptions {
  frameWidth: number;
  frameHeight: number;
  containerWidth: number;
  containerHeight: number;
  padding?: number;
  minScale?: number;
  maxScale?: number;
}

export interface DeriveSpriteStateDirectionPreviewRegionOptions {
  preview: SpriteStateDirectionPreview;
  imageWidth: number;
  imageHeight: number;
}

export interface DeriveSpriteStateDirectionPreviewRegionsOptions extends DeriveSpriteStateDirectionPreviewRegionOptions {
  maxPreviewFrames?: number;
}

export interface DeriveSpriteAnimatedPreviewFrameIndexOptions {
  elapsedMs: number;
  preview: SpriteStateDirectionPreview;
}

export interface SpriteStateDirectionOptions {
  states: string[];
  directions: string[];
}

export interface DeriveSpriteStateDirectionOptions {
  spriteSheet: string;
  animations: Record<string, unknown>[];
  references: Record<string, unknown>[];
}

export interface CanvasPointToMetaspriteTilePositionOptions {
  canvasWidth: number;
  canvasHeight: number;
  frameWidth: number;
  frameHeight: number;
  originX: number;
  originY: number;
  tileWidth: number;
  tileHeight: number;
  pointX: number;
  pointY: number;
}

export interface CanvasPointToSpriteSheetTileSliceOptions {
  canvasWidth: number;
  canvasHeight: number;
  imageWidth: number;
  imageHeight: number;
  tileWidth: number;
  tileHeight: number;
  pointX: number;
  pointY: number;
}

export interface AdjustMetaspriteTileSizeOptions {
  tileWidth: number;
  tileHeight: number;
  frameWidth: number;
  frameHeight: number;
  deltaWidth: number;
  deltaHeight: number;
}

export interface PrepareSpritePaintTileFromPointerOptions extends CanvasPointToMetaspriteTilePositionOptions {
  frameIndex: number;
  sliceX: number;
  sliceY: number;
  sourceSheet?: string;
}

export interface SpritePaintBrushState {
  sourceSheet?: string;
  sliceX?: number;
  sliceY?: number;
  tileWidth?: number;
  tileHeight?: number;
}

export interface DeriveSpritePaintBrushOptions {
  animation: SpritesWorkspaceAnimation;
  frame: SpriteMetaspriteFramePresentation;
  selectedTile: SpriteMetaspriteTilePresentation | null;
  brushState?: SpritePaintBrushState | null;
  preferBrushState?: boolean;
}

export type SpritePaletteSourceKind = "sheet" | "reference";

export interface SpritePaletteSource {
  available: boolean;
  bundledDefaultAsset: string | null;
  kind: SpritePaletteSourceKind;
  label: string;
  referenceId: string | null;
  source: string | null;
}

export interface StepSpritePlaybackFrameIndexOptions {
  currentIndex: number;
  direction: 1 | -1;
  frameCount: number;
  loops: boolean;
  pingPong: boolean;
}

export interface StepSpritePlaybackFrameIndexResult {
  direction: 1 | -1;
  frameIndex: number;
  shouldStop: boolean;
}

export interface FindMetaspriteTileAtCanvasPointOptions {
  canvasWidth: number;
  canvasHeight: number;
  frameWidth: number;
  frameHeight: number;
  originX: number;
  originY: number;
  pointX: number;
  pointY: number;
  tiles: SpriteMetaspriteTilePresentation[];
}

export interface MetaspriteTilePosition {
  x: number;
  y: number;
}

export interface MetaspriteTileSize {
  tileWidth: number;
  tileHeight: number;
}

export interface SpriteSheetTileSlice {
  sliceX: number;
  sliceY: number;
}

export interface DefaultMetaspriteTilePosition {
  x: number;
  y: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function booleanField(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}

function signedInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function slugifiedEventName(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "sprite_frame";
}

function cloneProjectData<T>(data: T): T {
  return globalThis.structuredClone
    ? globalThis.structuredClone(data)
    : (JSON.parse(JSON.stringify(data)) as T);
}

function projectArray(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function metadataSource(asset: Record<string, unknown>): string | null {
  return isRecord(asset.metadata) ? nullableString(asset.metadata.source) : null;
}

function metadataBundledDefaultAsset(asset: Record<string, unknown>): string | null {
  return isRecord(asset.metadata) ? nullableString(asset.metadata.bundledDefaultAsset) : null;
}

function clampOpacity(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 1;
}

function animationID(animation: Record<string, unknown>, index: number): string {
  return nullableString(animation.id) ?? `animation-${index + 1}`;
}

function makeSpriteAnimation(options: CreateSpriteAnimationOptions): Record<string, unknown> | null {
  const id = options.id.trim();
  const name = options.name.trim();
  const spriteSheet = options.spriteSheet.trim();
  if (!id || !name || !spriteSheet) {
    return null;
  }

  return {
    id,
    name,
    spriteSheet,
    frameWidth: 16,
    frameHeight: 32,
    fps: 8,
    loops: true,
    frameCount: 1,
    state: "idle",
    direction: "down",
    colorMode: "4bpp"
  };
}

function addAnimationIDToMatchingStates(states: unknown, sourceAnimationID: string, newAnimationID: string): unknown {
  if (!Array.isArray(states)) {
    return states;
  }

  return states.map((state) => {
    if (!isRecord(state)) return state;
    const animationIDs = Array.isArray(state.animationIDs) ? [...state.animationIDs] : state.animationIDs;
    if (Array.isArray(animationIDs) && animationIDs.includes(sourceAnimationID) && !animationIDs.includes(newAnimationID)) {
      animationIDs.push(newAnimationID);
    }

    return {
      ...state,
      animationIDs
    };
  });
}

function removeAnimationIDFromStates(states: unknown, animationIDToRemove: string): unknown {
  if (!Array.isArray(states)) {
    return states;
  }

  return states.map((state) => {
    if (!isRecord(state)) return state;
    return {
      ...state,
      animationIDs: Array.isArray(state.animationIDs)
        ? state.animationIDs.filter((id) => id !== animationIDToRemove)
        : state.animationIDs
    };
  });
}

function moveAnimationIDBetweenStates(states: unknown, animationIDToMove: string, previousState: string | null, nextState: string): unknown {
  if (!Array.isArray(states)) {
    return states;
  }

  return states.map((state) => {
    if (!isRecord(state)) return state;
    const stateName = nullableString(state.name);
    if (!Array.isArray(state.animationIDs)) return state;

    let animationIDs = state.animationIDs.filter((id) => id !== animationIDToMove);
    if (stateName === nextState && !animationIDs.includes(animationIDToMove)) {
      animationIDs = [...animationIDs, animationIDToMove];
    } else if (stateName !== previousState && state.animationIDs.includes(animationIDToMove)) {
      animationIDs = [...state.animationIDs];
    }

    return {
      ...state,
      animationIDs
    };
  });
}

function applyAnimationFields(animation: Record<string, unknown>, fields: UpdateSpriteAnimationFields): void {
  if (fields.spriteSheet !== undefined) {
    animation.spriteSheet = stringField(fields.spriteSheet, "Sprite sem nome");
  }

  if (fields.frameWidth !== undefined) {
    animation.frameWidth = positiveInteger(fields.frameWidth, positiveInteger(animation.frameWidth, 16));
  }

  if (fields.frameHeight !== undefined) {
    animation.frameHeight = positiveInteger(fields.frameHeight, positiveInteger(animation.frameHeight, 32));
  }

  if (fields.fps !== undefined) {
    animation.fps = positiveInteger(fields.fps, positiveInteger(animation.fps, 8));
  }

  if (fields.frameCount !== undefined) {
    animation.frameCount = positiveInteger(fields.frameCount, positiveInteger(animation.frameCount, 1));
  }

  if (fields.loops !== undefined) {
    animation.loops = fields.loops;
  }

  if (fields.pingPong !== undefined) {
    animation.pingPong = fields.pingPong;
  }

  if (fields.state !== undefined) {
    animation.state = stringField(fields.state, "idle");
  }

  if (fields.direction !== undefined) {
    animation.direction = stringField(fields.direction, "down");
  }

  if (fields.colorMode !== undefined) {
    animation.colorMode = spriteColorMode(fields.colorMode);
  }

  const geometryFieldNames = ["originX", "originY", "hitboxX", "hitboxY", "hitboxWidth", "hitboxHeight"] as const;
  const shouldPersistGeometry = geometryFieldNames.some((key) => fields[key] !== undefined || animation[key] !== undefined);
  if (shouldPersistGeometry) {
    const currentGeometry = geometryForAnimation(animation);
    const geometry = deriveSpriteCanvasGeometry({
      ...currentGeometry,
      originX: fields.originX ?? currentGeometry.originX,
      originY: fields.originY ?? currentGeometry.originY,
      hitboxX: fields.hitboxX ?? currentGeometry.hitboxX,
      hitboxY: fields.hitboxY ?? currentGeometry.hitboxY,
      hitboxWidth: fields.hitboxWidth ?? currentGeometry.hitboxWidth,
      hitboxHeight: fields.hitboxHeight ?? currentGeometry.hitboxHeight
    });
    animation.originX = geometry.originX;
    animation.originY = geometry.originY;
    animation.hitboxX = geometry.hitboxX;
    animation.hitboxY = geometry.hitboxY;
    animation.hitboxWidth = geometry.hitboxWidth;
    animation.hitboxHeight = geometry.hitboxHeight;
  }

  if (animation.frameEvents !== undefined) {
    animation.frameEvents = normalizedFrameEvents(animation.frameEvents, positiveInteger(animation.frameCount, 1));
  }
}

function makeEmptyMetaspriteFrame(animation: Record<string, unknown>): Record<string, unknown> {
  const width = positiveInteger(animation.frameWidth, 16);
  const height = positiveInteger(animation.frameHeight, 16);
  return {
    width,
    height,
    originX: Math.floor(width / 2),
    originY: Math.max(0, height - 8),
    tiles: []
  };
}

function makeReferenceAnimationName(reference: Record<string, unknown>): string {
  const state = stringField(reference.state, "idle");
  const direction = stringField(reference.direction, "down");
  return `${state}_${direction}`;
}

function makeGeneratedReferenceTiles(frameWidth: number, frameHeight: number, sourceSheet: string): Record<string, unknown>[] {
  const tileSize = 8;
  const columns = Math.max(1, Math.ceil(frameWidth / tileSize));
  const rows = Math.max(1, Math.ceil(frameHeight / tileSize));
  const originX = Math.floor(frameWidth / 2);
  const originY = Math.max(0, frameHeight - tileSize);
  const tiles: Record<string, unknown>[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const sliceX = column * tileSize;
      const sliceY = row * tileSize;
      const tileWidth = Math.min(tileSize, Math.max(tileSize, frameWidth - sliceX));
      const tileHeight = Math.min(tileSize, Math.max(tileSize, frameHeight - sliceY));
      tiles.push({
        x: sliceX - originX,
        y: frameHeight - originY - sliceY - tileHeight,
        sliceX,
        sliceY,
        sourceSheet,
        tileWidth,
        tileHeight,
        flipX: false,
        flipY: false,
        objPalette: "OBP0",
        paletteIndex: 0,
        priority: false
      });
    }
  }

  return tiles;
}

function inferReferenceFrameCount(reference: Record<string, unknown>, frameWidth: number, frameHeight: number): number {
  const imageWidth = positiveInteger(reference.imageWidth, 0);
  const imageHeight = positiveInteger(reference.imageHeight, 0);
  if (imageWidth <= 0 || imageHeight <= 0) return 1;

  const columns = Math.floor(imageWidth / positiveInteger(frameWidth, 1));
  const rows = Math.floor(imageHeight / positiveInteger(frameHeight, 1));
  return Math.max(1, columns * rows);
}

function editableMetaspriteFrame(
  data: GBAProjectData,
  animationIDToUpdate: string,
  frameIndex: number
): { next: GBAProjectData; animations: Record<string, unknown>[]; animation: Record<string, unknown>; frame: Record<string, unknown> } | null {
  if (!Number.isInteger(frameIndex) || frameIndex < 0) return null;

  const next = cloneProjectData(data);
  const animations = projectArray(next, "animations");
  const animation = animations.find((item, index) => animationID(item, index) === animationIDToUpdate);
  if (!animation) return null;

  const frameCount = positiveInteger(animation.frameCount, 1);
  if (frameIndex >= frameCount) return null;

  const frames = Array.isArray(animation.frames) ? [...animation.frames] : [];
  while (frames.length <= frameIndex) {
    frames.push(makeEmptyMetaspriteFrame(animation));
  }

  const existingFrame = isRecord(frames[frameIndex]) ? { ...frames[frameIndex] } : makeEmptyMetaspriteFrame(animation);
  const frame = {
    ...existingFrame,
    width: positiveInteger(existingFrame.width, positiveInteger(animation.frameWidth, 16)),
    height: positiveInteger(existingFrame.height, positiveInteger(animation.frameHeight, 16)),
    originX: signedInteger(existingFrame.originX, Math.floor(positiveInteger(animation.frameWidth, 16) / 2)),
    originY: signedInteger(existingFrame.originY, Math.max(0, positiveInteger(animation.frameHeight, 16) - 8)),
    tiles: Array.isArray(existingFrame.tiles) ? [...existingFrame.tiles] : []
  };

  frames[frameIndex] = frame;
  animation.frames = frames;
  next.animations = animations;
  return { next, animations, animation, frame };
}

function loopMode(animation: Record<string, unknown>): string {
  if (animation.pingPong === true) {
    return "Ping-pong";
  }

  return animation.loops === false ? "Uma vez" : "Loop";
}

function makeMetaspriteTilePresentation(
  tile: Record<string, unknown>,
  tileIndex: number,
  fallbackSheet: string
): SpriteMetaspriteTilePresentation {
  return {
    flipX: booleanField(tile.flipX, false),
    flipY: booleanField(tile.flipY, false),
    objPalette: stringField(tile.objPalette, "OBP0"),
    paletteIndex: nonNegativeInteger(tile.paletteIndex, 0),
    priority: booleanField(tile.priority, false),
    sliceX: nonNegativeInteger(tile.sliceX, 0),
    sliceY: nonNegativeInteger(tile.sliceY, 0),
    sourceSheet: stringField(tile.sourceSheet, fallbackSheet),
    tileHeight: positiveInteger(tile.tileHeight, 8),
    tileIndex,
    tileWidth: positiveInteger(tile.tileWidth, 8),
    x: typeof tile.x === "number" && Number.isFinite(tile.x) ? Math.floor(tile.x) : -16,
    y: typeof tile.y === "number" && Number.isFinite(tile.y) ? Math.floor(tile.y) : 0
  };
}

export function deriveSpriteCanvasGeometry(value: Partial<Record<keyof SpriteCanvasGeometry, unknown>>): SpriteCanvasGeometry {
  const frameWidth = positiveInteger(value.frameWidth, 16);
  const frameHeight = positiveInteger(value.frameHeight, 16);
  return {
    frameWidth,
    frameHeight,
    originX: clampInteger(signedInteger(value.originX, Math.floor(frameWidth / 2)), SPRITE_ORIGIN_MIN, SPRITE_ORIGIN_MAX),
    originY: clampInteger(signedInteger(value.originY, Math.max(0, frameHeight - 8)), SPRITE_ORIGIN_MIN, SPRITE_ORIGIN_MAX),
    hitboxX: clampInteger(signedInteger(value.hitboxX, 0), -96, 96),
    hitboxY: clampInteger(signedInteger(value.hitboxY, 0), -96, 96),
    hitboxWidth: clampInteger(signedInteger(value.hitboxWidth, frameWidth), 1, 128),
    hitboxHeight: clampInteger(signedInteger(value.hitboxHeight, frameHeight), 1, 128)
  };
}

/** GB Studio anchors metasprites eight pixels left of the visual canvas center. */
export function spriteCanvasDefaultOriginX(frameWidth: number): number {
  return Math.max(0, Math.floor(positiveInteger(frameWidth, 16) / 2) - 8);
}

/** Converts GB Studio's stored origin offset to DOM canvas coordinates. */
export function deriveSpriteOriginMarkerPosition({
  frameHeight,
  frameWidth,
  originX,
  originY
}: Pick<SpriteCanvasGeometry, "frameHeight" | "frameWidth" | "originX" | "originY">): { left: string; top: string } {
  const safeWidth = Math.max(1, frameWidth);
  const safeHeight = Math.max(1, frameHeight);
  return {
    left: `${((spriteCanvasDefaultOriginX(safeWidth) + originX) / safeWidth) * 100}%`,
    top: `${((safeHeight - 8 + originY) / safeHeight) * 100}%`
  };
}

export function deriveSpriteHitboxBounds(geometry: SpriteCanvasGeometry): {
  height: number;
  left: number;
  top: number;
  width: number;
} {
  return {
    height: geometry.hitboxHeight,
    left: spriteCanvasDefaultOriginX(geometry.frameWidth) + geometry.originX + geometry.hitboxX,
    top: geometry.frameHeight + geometry.originY + geometry.hitboxY - 8,
    width: geometry.hitboxWidth
  };
}

function geometryForAnimation(animation: Record<string, unknown>): SpriteCanvasGeometry {
  const frameWidth = positiveInteger(animation.frameWidth, 16);
  const frameHeight = positiveInteger(animation.frameHeight, 16);
  return deriveSpriteCanvasGeometry({
    frameWidth,
    frameHeight,
    originX: animation.originX,
    originY: animation.originY,
    hitboxX: animation.hitboxX,
    hitboxY: animation.hitboxY,
    hitboxWidth: animation.hitboxWidth,
    hitboxHeight: animation.hitboxHeight
  });
}

function frameEventPresentation(value: unknown): SpriteFrameEventPresentation | null {
  if (!isRecord(value)) return null;
  const type = stringField(value.type, "");
  const eventValue = stringField(value.value, "");
  return type && eventValue ? { type, value: eventValue } : null;
}

function normalizedFrameEvents(value: unknown, frameCount: number): SpriteFrameEventPresentation[][] {
  const count = positiveInteger(frameCount, 1);
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: count }, (_, frameIndex) => {
    const frameEvents = Array.isArray(source[frameIndex]) ? source[frameIndex] : [];
    return frameEvents.map(frameEventPresentation).filter((event): event is SpriteFrameEventPresentation => Boolean(event));
  });
}

function makeAnimation(animation: Record<string, unknown>, index: number, fallbackSheet: string): SpritesWorkspaceAnimation {
  const frameWidth = positiveInteger(animation.frameWidth, 1);
  const frameHeight = positiveInteger(animation.frameHeight, 1);
  const frameCount = positiveInteger(animation.frameCount, 1);
  const frames = Array.isArray(animation.frames) ? animation.frames : [];
  const geometry = geometryForAnimation(animation);
  const name = stringField(animation.name, "Animacao sem nome");
  const spriteSheet = stringField(animation.spriteSheet, fallbackSheet);
  const colorMode = spriteColorMode(animation.colorMode);
  const frameIndices = Array.isArray(animation.frameIndices)
    ? animation.frameIndices.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    : undefined;
  return {
    id: animationID(animation, index),
    name,
    spriteSheet,
    frameSize: `${frameWidth} x ${frameHeight}`,
    frameWidth,
    frameHeight,
    fps: positiveInteger(animation.fps, 1),
    frameCount,
    loopMode: loopMode(animation),
    loops: booleanField(animation.loops, true),
    pingPong: booleanField(animation.pingPong, false),
    state: nullableString(animation.state),
    direction: nullableString(animation.direction),
    colorMode,
    geometry,
    frameEvents: normalizedFrameEvents(animation.frameEvents, frameCount),
    metaspriteFrames: Array.from({ length: frameCount }, (_, frameIndex) => {
      const frame = isRecord(frames[frameIndex]) ? frames[frameIndex] : makeEmptyMetaspriteFrame(animation);
      const tiles = Array.isArray(frame.tiles) ? frame.tiles.filter(isRecord) : [];
      const tilePresentations = tiles.map((tile, tileIndex) => makeMetaspriteTilePresentation(
        tile,
        tileIndex,
        stringField(animation.spriteSheet, "")
      ));
      return {
        frameIndex,
        height: positiveInteger(frame.height, frameHeight),
        lastTile: tilePresentations.at(-1) ?? null,
        originX: signedInteger(frame.originX, Math.floor(frameWidth / 2)),
        originY: signedInteger(frame.originY, Math.max(0, frameHeight - 8)),
        tileCount: tiles.length,
        tiles: tilePresentations,
        width: positiveInteger(frame.width, frameWidth)
      };
    }),
    vramAnalysis: analyzeSpriteVram({
      name,
      spriteSheet,
      frameWidth,
      frameHeight,
      frameCount,
      colorMode,
      frameIndices,
      streamFrames: animation.streamFrames === true
    })
  };
}

function uniqueSortedNonEmpty(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((lhs, rhs) => lhs.localeCompare(rhs, "pt-BR"));
}

function makeStateDirectionPreviews(animations: SpritesWorkspaceAnimation[]): SpriteStateDirectionPreview[] {
  return animations
    .filter((animation) => animation.state && animation.direction)
    .map((animation) => ({
      animationID: animation.id,
      animationName: animation.name,
      direction: animation.direction ?? "down",
      fps: animation.fps,
      frameCount: animation.frameCount,
      frameHeight: animation.frameHeight,
      frameSize: animation.frameSize,
      frameWidth: animation.frameWidth,
      loops: animation.loops,
      pingPong: animation.pingPong,
      state: animation.state ?? "idle"
    }))
    .sort((lhs, rhs) => {
      const stateOrder = lhs.state.localeCompare(rhs.state, "pt-BR");
      return stateOrder !== 0 ? stateOrder : lhs.direction.localeCompare(rhs.direction, "pt-BR");
    });
}

export function deriveSpriteStateDirectionOptions(options: DeriveSpriteStateDirectionOptions): SpriteStateDirectionOptions {
  const spriteSheet = options.spriteSheet.trim();
  const matchingAnimations = options.animations.filter((animation) => stringField(animation.spriteSheet, "") === spriteSheet);
  const matchingReferences = options.references.filter((reference) => nullableString(reference.generatedSpriteAssetName) === spriteSheet);
  const states = uniqueSortedNonEmpty([
    ...matchingAnimations.map((animation) => nullableString(animation.state)),
    ...matchingReferences.map((reference) => nullableString(reference.state))
  ]);
  const directions = uniqueSortedNonEmpty([
    ...matchingAnimations.map((animation) => nullableString(animation.direction)),
    ...matchingReferences.map((reference) => nullableString(reference.direction))
  ]);

  return {
    states: states.length > 0 ? states : ["idle", "walk"],
    directions: directions.length > 0 ? directions : ["down", "left", "right", "up"]
  };
}

export function deriveSpriteFramePreviewRegions(options: DeriveSpriteFramePreviewRegionsOptions): SpriteFramePreviewRegion[] {
  const imageWidth = positiveInteger(options.imageWidth, 1);
  const imageHeight = positiveInteger(options.imageHeight, 1);
  const frameWidth = positiveInteger(options.frameWidth, 1);
  const frameHeight = positiveInteger(options.frameHeight, 1);
  const frameCount = positiveInteger(options.frameCount, 1);
  const maxPreviewFrames = positiveInteger(options.maxPreviewFrames, frameCount);
  const columns = Math.floor(imageWidth / frameWidth);
  const rows = Math.floor(imageHeight / frameHeight);
  if (columns <= 0 || rows <= 0) {
    return [];
  }

  const visibleFrames = Math.min(frameCount, maxPreviewFrames, columns * rows);
  return Array.from({ length: visibleFrames }, (_, frameIndex) => ({
    frameIndex,
    height: frameHeight,
    width: frameWidth,
    x: nonNegativeInteger(frameIndex % columns, 0) * frameWidth,
    y: Math.floor(frameIndex / columns) * frameHeight
  }));
}

export function deriveSpriteSheetFrameGridRegions(options: DeriveSpriteSheetFrameGridRegionsOptions): SpriteFramePreviewRegion[] {
  const imageWidth = positiveInteger(options.imageWidth, 1);
  const imageHeight = positiveInteger(options.imageHeight, 1);
  const frameWidth = positiveInteger(options.frameWidth, 1);
  const frameHeight = positiveInteger(options.frameHeight, 1);
  const columns = Math.floor(imageWidth / frameWidth);
  const rows = Math.floor(imageHeight / frameHeight);
  if (columns <= 0 || rows <= 0) {
    return [];
  }

  const frameCount = columns * rows;
  const maxPreviewFrames = positiveInteger(options.maxPreviewFrames, frameCount);
  const visibleFrames = Math.min(frameCount, maxPreviewFrames);
  return Array.from({ length: visibleFrames }, (_, frameIndex) => ({
    frameIndex,
    height: frameHeight,
    width: frameWidth,
    x: nonNegativeInteger(frameIndex % columns, 0) * frameWidth,
    y: Math.floor(frameIndex / columns) * frameHeight
  }));
}

export function deriveSpritePaintTilePanelMetrics(options: DeriveSpritePaintTilePanelMetricsOptions): SpritePaintTilePanelMetrics {
  const imageWidth = positiveInteger(options.imageWidth, 1);
  const imageHeight = positiveInteger(options.imageHeight, 1);
  const tileWidth = positiveInteger(options.tileWidth, 8);
  const tileHeight = positiveInteger(options.tileHeight, 8);
  const unitTileSize = positiveInteger(options.unitTileSize, 8);
  const tileColumns = Math.floor(imageWidth / unitTileSize);
  const tileRows = Math.floor(imageHeight / unitTileSize);
  const brushColumns = Math.max(1, Math.ceil(tileWidth / unitTileSize));
  const brushRows = Math.max(1, Math.ceil(tileHeight / unitTileSize));
  const sliceX = nonNegativeInteger(options.sliceX, 0);
  const sliceY = nonNegativeInteger(options.sliceY, 0);
  const brushTileCount = brushColumns * brushRows;

  return {
    brushColumns,
    brushLabel: `Brush ${brushColumns}x${brushRows} - ${sliceX},${sliceY} - ${brushTileCount} tile(s)`,
    brushRows,
    brushTileCount,
    sliceLabel: `${sliceX},${sliceY}`,
    tileColumns,
    tileCount: tileColumns * tileRows,
    tileRows
  };
}

export function deriveSpriteStateDirectionPreviewRegion(options: DeriveSpriteStateDirectionPreviewRegionOptions): SpriteFramePreviewRegion | null {
  return deriveSpriteStateDirectionPreviewRegions({
    ...options,
    maxPreviewFrames: 1
  })[0] ?? null;
}

export function deriveSpriteStateDirectionPreviewRegions(options: DeriveSpriteStateDirectionPreviewRegionsOptions): SpriteFramePreviewRegion[] {
  return deriveSpriteFramePreviewRegions({
    frameCount: options.preview.frameCount,
    frameHeight: options.preview.frameHeight,
    frameWidth: options.preview.frameWidth,
    imageHeight: options.imageHeight,
    imageWidth: options.imageWidth,
    maxPreviewFrames: options.maxPreviewFrames
  });
}

export function deriveSpriteAnimatedPreviewFrameIndex(options: DeriveSpriteAnimatedPreviewFrameIndexOptions): number {
  const frameCount = positiveInteger(options.preview.frameCount, 1);
  const fps = positiveInteger(options.preview.fps, 1);
  if (frameCount <= 1) return 0;

  const elapsedMs = Number.isFinite(options.elapsedMs) ? Math.max(0, options.elapsedMs) : 0;
  const frameStep = Math.floor(elapsedMs / (1000 / fps));
  if (!options.preview.loops && frameStep >= frameCount) {
    return frameCount - 1;
  }

  if (options.preview.pingPong) {
    const cycleLength = frameCount * 2 - 2;
    const cycleIndex = frameStep % cycleLength;
    return cycleIndex < frameCount ? cycleIndex : cycleLength - cycleIndex;
  }

  return frameStep % frameCount;
}

export function stepSpritePlaybackFrameIndex(
  options: StepSpritePlaybackFrameIndexOptions
): StepSpritePlaybackFrameIndexResult {
  const frameCount = positiveInteger(options.frameCount, 1);
  const currentIndex = clampInteger(options.currentIndex, 0, Math.max(0, frameCount - 1));
  if (frameCount <= 1) {
    return { direction: options.direction, frameIndex: 0, shouldStop: true };
  }

  let direction: 1 | -1 = options.direction === -1 ? -1 : 1;
  let nextIndex = currentIndex + direction;

  if (options.pingPong) {
    if (nextIndex >= frameCount) {
      if (frameCount <= 1) {
        return { direction: -1, frameIndex: 0, shouldStop: true };
      }
      nextIndex = frameCount - 2;
      direction = -1;
    } else if (nextIndex < 0) {
      if (!options.loops) {
        return { direction: 1, frameIndex: 0, shouldStop: true };
      }
      nextIndex = 1;
      direction = 1;
    }
  } else if (nextIndex >= frameCount) {
    if (options.loops) {
      nextIndex = 0;
    } else {
      return { direction: 1, frameIndex: frameCount - 1, shouldStop: true };
    }
  } else if (nextIndex < 0) {
    if (options.loops) {
      nextIndex = frameCount - 1;
    } else {
      return { direction: -1, frameIndex: 0, shouldStop: true };
    }
  }

  return { direction, frameIndex: nextIndex, shouldStop: false };
}

export function listSpritePaletteReferencesForSheet(
  presentation: SpritesWorkspacePresentation,
  sheetName: string
): SpritesWorkspaceReference[] {
  return presentation.references.filter((reference) =>
    reference.generatedSpriteAssetName === sheetName && Boolean(reference.assetName)
  );
}

export function resolveSpritePaletteSource(options: {
  kind: SpritePaletteSourceKind;
  presentation: SpritesWorkspacePresentation;
  referenceId?: string | null;
  sheet: SpritesWorkspaceSheet;
}): SpritePaletteSource {
  if (options.kind === "sheet") {
    return {
      available: options.sheet.hasAsset || Boolean(options.sheet.bundledDefaultAsset),
      bundledDefaultAsset: options.sheet.bundledDefaultAsset ?? null,
      kind: "sheet",
      label: options.sheet.name,
      referenceId: null,
      source: options.sheet.source
    };
  }

  const candidates = listSpritePaletteReferencesForSheet(options.presentation, options.sheet.name);
  const reference = options.referenceId
    ? candidates.find((candidate) => candidate.id === options.referenceId) ?? candidates[0] ?? null
    : candidates[0] ?? null;
  const assetName = reference?.assetName ?? null;
  const normalizedSource = assetName
    ? (assetName.startsWith("References/") ? assetName : `References/${assetName}`)
    : null;

  return {
    available: Boolean(normalizedSource),
    bundledDefaultAsset: null,
    kind: "reference",
    label: reference?.title ?? "Referencia",
    referenceId: reference?.id ?? null,
    source: normalizedSource
  };
}

export function spriteSheetMatchesRailQuery(sheet: SpritesWorkspaceSheet, query: string): boolean {
  if (!query) return true;

  const normalizedQuery = query.toLocaleLowerCase("pt-BR");
  return [sheet.name, sheet.source ?? ""].some((value) =>
    value.toLocaleLowerCase("pt-BR").includes(normalizedQuery)
  );
}

export function deriveMetaspriteCanvasSize(options: DeriveMetaspriteCanvasSizeOptions): MetaspriteCanvasSize {
  const frameWidth = positiveInteger(options.frameWidth, 16);
  const frameHeight = positiveInteger(options.frameHeight, 16);
  const maxWidth = positiveInteger(options.maxWidth, 280);
  const maxHeight = positiveInteger(options.maxHeight, 320);
  const preferredScale = positiveInteger(options.preferredScale, 10);
  const fitScale = Math.max(1, Math.floor(Math.min(maxWidth / frameWidth, maxHeight / frameHeight)));
  const scale = Math.max(1, Math.min(preferredScale, fitScale));

  return {
    height: frameHeight * scale,
    scale,
    width: frameWidth * scale
  };
}

export function deriveSpriteCanvasFitScale(options: DeriveSpriteCanvasFitScaleOptions): number {
  const frameWidth = positiveInteger(options.frameWidth, 16);
  const frameHeight = positiveInteger(options.frameHeight, 16);
  const padding = nonNegativeInteger(options.padding, 24);
  const minScale = positiveInteger(options.minScale, 2);
  const maxScale = positiveInteger(options.maxScale, 12);
  const availableWidth = Math.max(1, positiveInteger(options.containerWidth, 280) - padding);
  const availableHeight = Math.max(1, positiveInteger(options.containerHeight, 240) - padding);
  const fitScale = Math.floor(Math.min(availableWidth / frameWidth, availableHeight / frameHeight));

  return Math.max(minScale, Math.min(maxScale, fitScale));
}

export function canvasPointToMetaspriteTilePosition(options: CanvasPointToMetaspriteTilePositionOptions): MetaspriteTilePosition {
  const canvasWidth = positiveInteger(options.canvasWidth, 1);
  const canvasHeight = positiveInteger(options.canvasHeight, 1);
  const frameWidth = positiveInteger(options.frameWidth, 1);
  const frameHeight = positiveInteger(options.frameHeight, 1);
  const tileWidth = positiveInteger(options.tileWidth, 1);
  const tileHeight = positiveInteger(options.tileHeight, 1);
  const maxScreenX = Math.max(0, frameWidth - tileWidth);
  const maxScreenY = Math.max(0, frameHeight - tileHeight);
  const rawScreenX = (options.pointX / canvasWidth) * frameWidth;
  const rawScreenY = (options.pointY / canvasHeight) * frameHeight;
  const screenX = clampInteger(rawScreenX, 0, maxScreenX);
  const screenY = clampInteger(rawScreenY, 0, maxScreenY);
  return {
    x: screenX - spriteCanvasDefaultOriginX(frameWidth),
    y: frameHeight - screenY - tileHeight
  };
}

export function canvasPointToSpriteSheetTileSlice(options: CanvasPointToSpriteSheetTileSliceOptions): SpriteSheetTileSlice {
  const canvasWidth = positiveInteger(options.canvasWidth, 1);
  const canvasHeight = positiveInteger(options.canvasHeight, 1);
  const imageWidth = positiveInteger(options.imageWidth, 1);
  const imageHeight = positiveInteger(options.imageHeight, 1);
  const tileWidth = positiveInteger(options.tileWidth, 1);
  const tileHeight = positiveInteger(options.tileHeight, 1);
  const maxSliceX = Math.max(0, imageWidth - tileWidth);
  const maxSliceY = Math.max(0, imageHeight - tileHeight);
  const rawSliceX = Math.floor(((options.pointX / canvasWidth) * imageWidth) / tileWidth) * tileWidth;
  const rawSliceY = Math.floor(((options.pointY / canvasHeight) * imageHeight) / tileHeight) * tileHeight;

  return {
    sliceX: clampInteger(rawSliceX, 0, maxSliceX),
    sliceY: clampInteger(rawSliceY, 0, maxSliceY)
  };
}

export function adjustMetaspriteTileSize(options: AdjustMetaspriteTileSizeOptions): MetaspriteTileSize {
  const frameWidth = positiveInteger(options.frameWidth, 8);
  const frameHeight = positiveInteger(options.frameHeight, 8);
  const tileWidth = positiveInteger(options.tileWidth, 8);
  const tileHeight = positiveInteger(options.tileHeight, 8);

  return {
    tileHeight: clampInteger(tileHeight + options.deltaHeight, 8, frameHeight),
    tileWidth: clampInteger(tileWidth + options.deltaWidth, 8, frameWidth)
  };
}

export function deriveDefaultMetaspriteTilePosition(
  frame: SpriteMetaspriteFramePresentation,
  tileWidth: number,
  tileHeight: number
): DefaultMetaspriteTilePosition {
  const centeredScreenY = Math.max(0, Math.floor((frame.height - tileHeight) / 2));
  const originX = spriteCanvasDefaultOriginX(frame.width);
  // Prefer -16 when it fits; smaller canvases and whole-frame tiles need their own offset.
  const x = Math.max(-originX, Math.min(-16, Math.max(0, frame.width - tileWidth) - originX));

  return {
    x: x || 0,
    y: frame.height - centeredScreenY - tileHeight
  };
}

export function deriveSpritePaintBrush(options: DeriveSpritePaintBrushOptions): SpriteMetaspriteTilePresentation {
  const selectedTile = options.selectedTile;
  const brushState = options.brushState ?? null;
  const preferBrushState = options.preferBrushState ?? false;
  const tileHeight = positiveInteger(
    brushState?.tileHeight,
    selectedTile?.tileHeight ?? Math.min(options.animation.frameHeight, 16)
  );
  const tileWidth = positiveInteger(
    brushState?.tileWidth,
    selectedTile?.tileWidth ?? Math.min(options.animation.frameWidth, 16)
  );
  const defaultPosition = deriveDefaultMetaspriteTilePosition(options.frame, tileWidth, tileHeight);
  const brushSliceX = brushState?.sliceX;
  const brushSliceY = brushState?.sliceY;
  const hasExplicitBrushSlice = brushSliceX !== undefined || brushSliceY !== undefined;

  return {
    flipX: preferBrushState ? false : (selectedTile?.flipX ?? false),
    flipY: preferBrushState ? false : (selectedTile?.flipY ?? false),
    objPalette: preferBrushState ? "OBP0" : (selectedTile?.objPalette ?? "OBP0"),
    paletteIndex: preferBrushState ? 0 : (selectedTile?.paletteIndex ?? 0),
    priority: preferBrushState ? false : (selectedTile?.priority ?? false),
    sliceX: preferBrushState && hasExplicitBrushSlice
      ? nonNegativeInteger(brushSliceX, 0)
      : nonNegativeInteger(brushSliceX, selectedTile?.sliceX ?? 0),
    sliceY: preferBrushState && hasExplicitBrushSlice
      ? nonNegativeInteger(brushSliceY, 0)
      : nonNegativeInteger(brushSliceY, selectedTile?.sliceY ?? 0),
    sourceSheet: stringField(
      brushState?.sourceSheet,
      preferBrushState ? options.animation.spriteSheet : (selectedTile?.sourceSheet ?? options.animation.spriteSheet)
    ),
    tileHeight,
    tileIndex: preferBrushState ? -1 : (selectedTile?.tileIndex ?? -1),
    tileWidth,
    x: preferBrushState ? defaultPosition.x : (selectedTile?.x ?? defaultPosition.x),
    y: preferBrushState ? defaultPosition.y : (selectedTile?.y ?? defaultPosition.y)
  };
}

export function prepareSpritePaintTileFromPointer(options: PrepareSpritePaintTileFromPointerOptions): AddSpriteMetaspriteTileOptions {
  const position = canvasPointToMetaspriteTilePosition(options);

  return {
    frameIndex: nonNegativeInteger(options.frameIndex, 0),
    sourceSheet: options.sourceSheet?.trim(),
    sliceX: nonNegativeInteger(options.sliceX, 0),
    sliceY: nonNegativeInteger(options.sliceY, 0),
    tileHeight: positiveInteger(options.tileHeight, 8),
    tileWidth: positiveInteger(options.tileWidth, 8),
    x: position.x,
    y: position.y
  };
}

export function findMetaspriteTileAtCanvasPoint(options: FindMetaspriteTileAtCanvasPointOptions): number | null {
  const canvasWidth = positiveInteger(options.canvasWidth, 1);
  const canvasHeight = positiveInteger(options.canvasHeight, 1);
  const frameWidth = positiveInteger(options.frameWidth, 1);
  const frameHeight = positiveInteger(options.frameHeight, 1);
  const canvasOriginX = spriteCanvasDefaultOriginX(frameWidth);
  const screenX = (options.pointX / canvasWidth) * frameWidth;
  const screenY = (options.pointY / canvasHeight) * frameHeight;

  for (const tile of [...options.tiles].reverse()) {
    const left = canvasOriginX + tile.x;
    const top = frameHeight - tile.y - tile.tileHeight;
    const right = left + tile.tileWidth;
    const bottom = top + tile.tileHeight;
    if (screenX >= left && screenX < right && screenY >= top && screenY < bottom) {
      return tile.tileIndex;
    }
  }

  return null;
}

export function deriveSpriteMetaspriteCanvasAction(
  options: DeriveSpriteMetaspriteCanvasActionOptions
): SpriteMetaspriteCanvasAction | null {
  const { animationID, frame, frameIndex, mode, selectedTile } = options;
  if (mode === "paint") {
    if (!selectedTile) return null;
    return {
      animationID,
      options: prepareSpritePaintTileFromPointer({
        canvasHeight: options.canvasHeight,
        canvasWidth: options.canvasWidth,
        frameHeight: frame.height,
        frameIndex,
        frameWidth: frame.width,
        originX: frame.originX,
        originY: frame.originY,
        pointX: options.pointX,
        pointY: options.pointY,
        sliceX: selectedTile.sliceX,
        sliceY: selectedTile.sliceY,
        sourceSheet: selectedTile.sourceSheet,
        tileHeight: selectedTile.tileHeight,
        tileWidth: selectedTile.tileWidth
      }),
      type: "add_tile"
    };
  }

  if (mode === "erase") {
    const tileIndex = findMetaspriteTileAtCanvasPoint({
      canvasHeight: options.canvasHeight,
      canvasWidth: options.canvasWidth,
      frameHeight: frame.height,
      frameWidth: frame.width,
      originX: frame.originX,
      originY: frame.originY,
      pointX: options.pointX,
      pointY: options.pointY,
      tiles: frame.tiles
    });
    return tileIndex === null ? null : {
      animationID,
      options: {
        frameIndex,
        tileIndex
      },
      type: "remove_tile"
    };
  }

  if (mode !== "select" && mode !== "geometry") return null;
  if (!selectedTile || selectedTile.tileIndex < 0) return null;

  return {
    animationID,
    options: {
      fields: canvasPointToMetaspriteTilePosition({
        canvasHeight: options.canvasHeight,
        canvasWidth: options.canvasWidth,
        frameHeight: frame.height,
        frameWidth: frame.width,
        originX: frame.originX,
        originY: frame.originY,
        pointX: options.pointX,
        pointY: options.pointY,
        tileHeight: selectedTile.tileHeight,
        tileWidth: selectedTile.tileWidth
      }),
      frameIndex,
      tileIndex: selectedTile.tileIndex
    },
    type: "update_tile"
  };
}

export function deriveSpriteMetaspriteTileResizeAction(
  options: DeriveSpriteMetaspriteTileResizeActionOptions
): SpriteMetaspriteCanvasAction | null {
  const { animationID, frame, frameIndex, selectedTile } = options;
  if (!selectedTile || selectedTile.tileIndex < 0) return null;

  return {
    animationID,
    options: {
      fields: adjustMetaspriteTileSize({
        deltaHeight: options.deltaHeight,
        deltaWidth: options.deltaWidth,
        frameHeight: frame.height,
        frameWidth: frame.width,
        tileHeight: selectedTile.tileHeight,
        tileWidth: selectedTile.tileWidth
      }),
      frameIndex,
      tileIndex: selectedTile.tileIndex
    },
    type: "update_tile"
  };
}

export function deriveSpriteMetaspriteTileKeyboardAction(
  options: DeriveSpriteMetaspriteTileKeyboardActionOptions
): SpriteMetaspriteCanvasAction | null {
  const { animationID, frameIndex, selectedTile } = options;
  if (!selectedTile || selectedTile.tileIndex < 0) return null;

  const step = options.shiftKey ? 8 : 1;
  const key = options.key.toLowerCase();
  let fields: UpdateSpriteMetaspriteTileFields | null = null;

  if (options.key === "ArrowUp") {
    fields = { y: selectedTile.y + step };
  } else if (options.key === "ArrowDown") {
    fields = { y: selectedTile.y - step };
  } else if (options.key === "ArrowLeft") {
    fields = { x: selectedTile.x - step };
  } else if (options.key === "ArrowRight") {
    fields = { x: selectedTile.x + step };
  } else if (key === "x") {
    fields = { flipX: !selectedTile.flipX };
  } else if (key === "z") {
    fields = { flipY: !selectedTile.flipY };
  }

  return fields === null ? null : {
    animationID,
    options: {
      fields,
      frameIndex,
      tileIndex: selectedTile.tileIndex
    },
    type: "update_tile"
  };
}

export function resolveActiveSpriteAnimation(
  presentation: SpritesWorkspacePresentation,
  selectedAnimationID: string | null
): ActiveSpriteAnimationSelection | null {
  let fallback: ActiveSpriteAnimationSelection | null = null;

  for (const sheet of presentation.spriteSheets) {
    const animations = presentation.animationsBySheet[sheet.name] ?? [];
    for (const animation of animations) {
      const selection = { sheet, animation };
      fallback ??= selection;
      if (selectedAnimationID && animation.id === selectedAnimationID) {
        return selection;
      }
    }
  }

  return fallback;
}

export function resolveSpriteWorkspaceCanvasFrame(
  animation: SpritesWorkspaceAnimation | null,
  selectedFrameIndex: number
): SpriteMetaspriteFramePresentation | null {
  if (!animation || animation.metaspriteFrames.length === 0) return null;
  const frameIndex = clampInteger(
    Number.isInteger(selectedFrameIndex) ? selectedFrameIndex : 0,
    0,
    animation.metaspriteFrames.length - 1
  );
  return animation.metaspriteFrames[frameIndex] ?? null;
}

export function deriveSpriteAnimationLibraryGroups(
  animations: SpritesWorkspaceAnimation[],
  activeAnimationID: string | null
): SpriteAnimationLibraryGroup[] {
  if (animations.length === 0) return [];

  return [{
    count: animations.length,
    id: "default",
    label: "Padrao",
    rows: animations.map((animation) => ({
      direction: animation.direction,
      fps: animation.fps,
      frameCount: animation.frameCount,
      frameSize: animation.frameSize,
      id: animation.id,
      isActive: animation.id === activeAnimationID,
      loopMode: animation.loopMode,
      name: animation.name,
      state: animation.state
    }))
  }];
}

function referenceID(reference: Record<string, unknown>, index: number): string {
  return nullableString(reference.id) ?? `reference-${index + 1}`;
}

function referenceTitle(reference: Record<string, unknown>): string {
  const explicitTitle = nullableString(reference.title);
  if (explicitTitle) {
    return explicitTitle;
  }

  const assetName = nullableString(reference.assetName);
  if (!assetName) {
    return "Referencia sem titulo";
  }

  const dotIndex = assetName.lastIndexOf(".");
  return dotIndex > 0 ? assetName.slice(0, dotIndex) : assetName;
}

function makeReference(
  reference: Record<string, unknown>,
  index: number,
  activeReferenceID: string | null
): SpritesWorkspaceReference {
  const id = referenceID(reference, index);
  const frameWidth = positiveInteger(reference.frameWidth, 16);
  const frameHeight = positiveInteger(reference.frameHeight, 32);
  return {
    id,
    title: referenceTitle(reference),
    assetName: nullableString(reference.assetName),
    generatedSpriteAssetName: nullableString(reference.generatedSpriteAssetName),
    frameSize: `${frameWidth} x ${frameHeight}`,
    fps: positiveInteger(reference.fps, 8),
    state: stringField(reference.state, "idle"),
    direction: stringField(reference.direction, "down"),
    opacity: clampOpacity(reference.opacity),
    isVisible: booleanField(reference.isVisible, true),
    isActive: activeReferenceID ? id === activeReferenceID : index === 0
  };
}

export function createSpriteAnimationInProject(data: GBAProjectData, options: CreateSpriteAnimationOptions): GBAProjectData {
  const animation = makeSpriteAnimation(options);
  if (!animation) return data;
  animation.colorMode = spriteColorModeForSheet(data, options.spriteSheet);

  const next = cloneProjectData(data);
  const animations = projectArray(next, "animations");
  if (animations.some((item, index) => animationID(item, index) === animation.id)) {
    return data;
  }

  next.animations = [...animations, animation];
  return next;
}

export function renameSpriteAnimationInProject(data: GBAProjectData, animationIDToRename: string, nextName: string): GBAProjectData {
  const trimmedName = nextName.trim();
  if (!trimmedName) return data;

  const next = cloneProjectData(data);
  const animations = projectArray(next, "animations");
  const animation = animations.find((item, index) => animationID(item, index) === animationIDToRename);
  if (!animation || animation.name === trimmedName) {
    return data;
  }

  animation.name = trimmedName;
  next.animations = animations;
  return next;
}

export function duplicateSpriteAnimationInProject(data: GBAProjectData, options: DuplicateSpriteAnimationOptions): GBAProjectData {
  const newAnimationID = options.newAnimationID.trim();
  const newName = options.newName.trim();
  if (!newAnimationID || !newName || newAnimationID === options.sourceAnimationID) {
    return data;
  }

  const next = cloneProjectData(data);
  const animations = projectArray(next, "animations");
  const source = animations.find((item, index) => animationID(item, index) === options.sourceAnimationID);
  if (!source || animations.some((item, index) => animationID(item, index) === newAnimationID)) {
    return data;
  }

  next.animations = [
    ...animations,
    {
      ...cloneProjectData(source),
      id: newAnimationID,
      name: newName
    }
  ];
  next.animationStates = addAnimationIDToMatchingStates(next.animationStates, options.sourceAnimationID, newAnimationID);
  return next;
}

export function updateSpriteAnimationFieldsInProject(
  data: GBAProjectData,
  animationIDToUpdate: string,
  fields: UpdateSpriteAnimationFields
): GBAProjectData {
  const next = cloneProjectData(data);
  const animations = projectArray(next, "animations");
  const animation = animations.find((item, index) => animationID(item, index) === animationIDToUpdate);
  if (!animation) return data;

  const previousState = nullableString(animation.state);
  applyAnimationFields(animation, fields);
  if (fields.colorMode !== undefined) {
    const mode = spriteColorMode(fields.colorMode);
    const asset = projectArray(next, "assets").find(item => item.name === animation.spriteSheet || item.id === animation.spriteSheet);
    const refs = new Set([animation.spriteSheet, asset?.name, asset?.id]);
    for (const sibling of animations) {
      if (refs.has(sibling.spriteSheet)) sibling.colorMode = mode;
    }
    for (const room of [...projectArray(next, "rooms"), ...projectArray(next, "scenas")]) {
      const runtime = isRecord(room.runtime) ? room.runtime : {};
      const config = isRecord(runtime.config) ? runtime.config : {};
      const manifest = isRecord(config.resources) ? config.resources : {};
      for (const resource of Array.isArray(manifest.resources) ? manifest.resources.filter(isRecord) : []) {
        if (resource.kind === "obj" && refs.has(resource.assetId)) resource.bpp = mode === "8bpp" ? 8 : 4;
      }
    }
    if (asset) {
      const metadata = isRecord(asset.metadata) ? asset.metadata : {};
      asset.metadata = { ...metadata, colorMode: mode };
      if (metadata.color_mode !== undefined) (asset.metadata as Record<string, unknown>).color_mode = mode;
      if (asset.colorMode !== undefined) asset.colorMode = mode;
    }
  } else if (fields.spriteSheet !== undefined) {
    delete animation.colorMode;
    animation.colorMode = spriteColorModeForSheet(next, String(animation.spriteSheet));
  }
  next.animations = animations;

  if (fields.state !== undefined) {
    next.animationStates = moveAnimationIDBetweenStates(
      next.animationStates,
      animationIDToUpdate,
      previousState,
      stringField(fields.state, "idle")
    );
  }

  return next;
}

export function updateSpriteAnimationStateInProject(
  data: GBAProjectData,
  animationStateIDToUpdate: string,
  fields: UpdateSpriteAnimationStateFields
): GBAProjectData {
  const next = cloneProjectData(data);
  const states = projectArray(next, "animationStates");
  const state = states.find((item) => stringField(item.id, "") === animationStateIDToUpdate);
  if (!state) return data;

  if (fields.animationType !== undefined && isSpriteAnimationType(fields.animationType)) {
    state.animationType = fields.animationType;
  }
  if (fields.mirrorLeftFromRight !== undefined) {
    state.mirrorLeftFromRight = fields.mirrorLeftFromRight;
  }
  next.animationStates = states;
  return next;
}

export function updateSpriteMetaspriteFrameInProject(
  data: GBAProjectData,
  animationIDToUpdate: string,
  options: UpdateSpriteMetaspriteFrameOptions
): GBAProjectData {
  if (!Number.isFinite(options.originX) || !Number.isFinite(options.originY)) return data;

  const dataWithOrigin = updateSpriteAnimationFieldsInProject(data, animationIDToUpdate, {
    originX: options.originX,
    originY: options.originY
  });
  const editable = editableMetaspriteFrame(dataWithOrigin, animationIDToUpdate, options.frameIndex);
  if (!editable) return data;

  editable.frame.width = positiveInteger(editable.frame.width, positiveInteger(editable.animation.frameWidth, 16));
  editable.frame.height = positiveInteger(editable.frame.height, positiveInteger(editable.animation.frameHeight, 16));
  editable.frame.originX = Math.floor(options.originX);
  editable.frame.originY = Math.floor(options.originY);
  return editable.next;
}

export function addSpriteMetaspriteTileInProject(
  data: GBAProjectData,
  animationIDToUpdate: string,
  options: AddSpriteMetaspriteTileOptions
): GBAProjectData {
  if (![options.x, options.y, options.sliceX, options.sliceY].every(Number.isFinite)) return data;

  const editable = editableMetaspriteFrame(data, animationIDToUpdate, options.frameIndex);
  if (!editable) return data;

  const tiles = Array.isArray(editable.frame.tiles) ? editable.frame.tiles : [];
  const nextTile = {
    x: Math.floor(options.x),
    y: Math.floor(options.y),
    sliceX: Math.floor(options.sliceX),
    sliceY: Math.floor(options.sliceY),
    sourceSheet: options.sourceSheet?.trim() ?? stringField(editable.animation.spriteSheet, ""),
    tileWidth: positiveInteger(options.tileWidth, 8),
    tileHeight: positiveInteger(options.tileHeight, 8),
    flipX: false,
    flipY: false,
    objPalette: "OBP0",
    paletteIndex: 0,
    priority: false
  };
  const alreadyPainted = tiles.some((tile) => (
    isRecord(tile) &&
    tile.x === nextTile.x &&
    tile.y === nextTile.y &&
    tile.sliceX === nextTile.sliceX &&
    tile.sliceY === nextTile.sliceY &&
    tile.sourceSheet === nextTile.sourceSheet &&
    tile.tileWidth === nextTile.tileWidth &&
    tile.tileHeight === nextTile.tileHeight &&
    tile.flipX === nextTile.flipX &&
    tile.flipY === nextTile.flipY &&
    tile.objPalette === nextTile.objPalette &&
    tile.paletteIndex === nextTile.paletteIndex &&
    tile.priority === nextTile.priority
  ));
  if (alreadyPainted) return data;

  editable.frame.tiles = [
    ...tiles,
    nextTile
  ];

  return editable.next;
}

export function removeSpriteMetaspriteTileInProject(
  data: GBAProjectData,
  animationIDToUpdate: string,
  options: RemoveSpriteMetaspriteTileOptions
): GBAProjectData {
  if (!Number.isInteger(options.tileIndex) || options.tileIndex < 0) return data;

  const editable = editableMetaspriteFrame(data, animationIDToUpdate, options.frameIndex);
  if (!editable) return data;

  const tiles = Array.isArray(editable.frame.tiles) ? editable.frame.tiles : [];
  if (options.tileIndex >= tiles.length) return data;

  editable.frame.tiles = tiles.filter((_, index) => index !== options.tileIndex);
  return editable.next;
}

export function updateSpriteMetaspriteTileInProject(
  data: GBAProjectData,
  animationIDToUpdate: string,
  options: UpdateSpriteMetaspriteTileOptions
): GBAProjectData {
  if (!Number.isInteger(options.tileIndex) || options.tileIndex < 0) return data;

  const editable = editableMetaspriteFrame(data, animationIDToUpdate, options.frameIndex);
  if (!editable) return data;

  const tiles = Array.isArray(editable.frame.tiles) ? editable.frame.tiles : [];
  const existingTile = isRecord(tiles[options.tileIndex]) ? { ...tiles[options.tileIndex] } : null;
  if (!existingTile) return data;

  const fields = options.fields;
  const nextTile = { ...existingTile };
  if (fields.x !== undefined) {
    if (!Number.isFinite(fields.x)) return data;
    nextTile.x = Math.floor(fields.x);
  }
  if (fields.y !== undefined) {
    if (!Number.isFinite(fields.y)) return data;
    nextTile.y = Math.floor(fields.y);
  }
  if (fields.sliceX !== undefined) {
    if (!Number.isFinite(fields.sliceX)) return data;
    nextTile.sliceX = Math.max(0, Math.floor(fields.sliceX));
  }
  if (fields.sliceY !== undefined) {
    if (!Number.isFinite(fields.sliceY)) return data;
    nextTile.sliceY = Math.max(0, Math.floor(fields.sliceY));
  }
  if (fields.tileWidth !== undefined) {
    nextTile.tileWidth = positiveInteger(fields.tileWidth, positiveInteger(existingTile.tileWidth, 8));
  }
  if (fields.tileHeight !== undefined) {
    nextTile.tileHeight = positiveInteger(fields.tileHeight, positiveInteger(existingTile.tileHeight, 8));
  }
  if (fields.sourceSheet !== undefined) {
    nextTile.sourceSheet = fields.sourceSheet.trim();
  }
  if (fields.flipX !== undefined) nextTile.flipX = fields.flipX;
  if (fields.flipY !== undefined) nextTile.flipY = fields.flipY;
  if (fields.objPalette !== undefined) nextTile.objPalette = stringField(fields.objPalette, "OBP0");
  if (fields.paletteIndex !== undefined) {
    if (!Number.isFinite(fields.paletteIndex)) return data;
    nextTile.paletteIndex = Math.max(0, Math.min(7, Math.floor(fields.paletteIndex)));
  }
  if (fields.priority !== undefined) nextTile.priority = fields.priority;

  editable.frame.tiles = tiles.map((tile, index) => (index === options.tileIndex ? nextTile : tile));
  return editable.next;
}

function editableAnimation(
  data: GBAProjectData,
  animationIDToUpdate: string
): { next: GBAProjectData; animations: Record<string, unknown>[]; animation: Record<string, unknown>; animationIndex: number } | null {
  const next = cloneProjectData(data);
  const animations = projectArray(next, "animations");
  const animationIndex = animations.findIndex((item, index) => animationID(item, index) === animationIDToUpdate);
  if (animationIndex < 0) return null;

  const animation = animations[animationIndex];
  next.animations = animations;
  return { next, animations, animation, animationIndex };
}

function normalizedTileIndexSet(tileIndexes: number[], tileCount: number): Set<number> {
  return new Set(tileIndexes
    .filter((index) => Number.isInteger(index) && index >= 0 && index < tileCount)
    .map((index) => Math.floor(index)));
}

export function moveSpriteMetaspriteTilesInProject(
  data: GBAProjectData,
  animationIDToUpdate: string,
  options: MoveSpriteMetaspriteTilesOptions
): GBAProjectData {
  if (!Number.isFinite(options.deltaX) || !Number.isFinite(options.deltaY)) return data;

  const editable = editableMetaspriteFrame(data, animationIDToUpdate, options.frameIndex);
  if (!editable) return data;

  const tiles = Array.isArray(editable.frame.tiles) ? editable.frame.tiles.filter(isRecord) : [];
  const selectedIndexes = normalizedTileIndexSet(options.tileIndexes, tiles.length);
  if (selectedIndexes.size === 0) return data;

  editable.frame.tiles = tiles.map((tile, index) => selectedIndexes.has(index)
    ? {
        ...tile,
        x: signedInteger(tile.x, 0) + Math.floor(options.deltaX),
        y: signedInteger(tile.y, 0) + Math.floor(options.deltaY)
      }
    : tile);
  return editable.next;
}

export function toggleSpriteMetaspriteTilesFlipInProject(
  data: GBAProjectData,
  animationIDToUpdate: string,
  options: ToggleSpriteMetaspriteTilesFlipOptions
): GBAProjectData {
  const editable = editableMetaspriteFrame(data, animationIDToUpdate, options.frameIndex);
  if (!editable) return data;

  const tiles = Array.isArray(editable.frame.tiles) ? editable.frame.tiles.filter(isRecord) : [];
  const selectedIndexes = normalizedTileIndexSet(options.tileIndexes, tiles.length);
  if (selectedIndexes.size === 0) return data;

  editable.frame.tiles = tiles.map((tile, index) => {
    if (!selectedIndexes.has(index)) return tile;
    return options.horizontal
      ? { ...tile, flipX: !booleanField(tile.flipX, false) }
      : { ...tile, flipY: !booleanField(tile.flipY, false) };
  });
  return editable.next;
}

export function reorderSpriteMetaspriteTilesInProject(
  data: GBAProjectData,
  animationIDToUpdate: string,
  options: ReorderSpriteMetaspriteTilesOptions
): GBAProjectData {
  const editable = editableMetaspriteFrame(data, animationIDToUpdate, options.frameIndex);
  if (!editable) return data;

  const tiles = Array.isArray(editable.frame.tiles) ? editable.frame.tiles.filter(isRecord) : [];
  const selectedIndexes = normalizedTileIndexSet(options.tileIndexes, tiles.length);
  if (selectedIndexes.size === 0) return data;

  const selectedTiles = tiles.filter((_tile, index) => selectedIndexes.has(index));
  const remainingTiles = tiles.filter((_tile, index) => !selectedIndexes.has(index));
  editable.frame.tiles = options.placement === "back"
    ? [...selectedTiles, ...remainingTiles]
    : [...remainingTiles, ...selectedTiles];
  return editable.next;
}

export function removeSpriteMetaspriteTilesInProject(
  data: GBAProjectData,
  animationIDToUpdate: string,
  options: MultiSpriteMetaspriteTileOptions
): GBAProjectData {
  const editable = editableMetaspriteFrame(data, animationIDToUpdate, options.frameIndex);
  if (!editable) return data;

  const tiles = Array.isArray(editable.frame.tiles) ? editable.frame.tiles.filter(isRecord) : [];
  const selectedIndexes = normalizedTileIndexSet(options.tileIndexes, tiles.length);
  if (selectedIndexes.size === 0) return data;

  editable.frame.tiles = tiles.filter((_tile, index) => !selectedIndexes.has(index));
  return editable.next;
}

export function fitSpriteAnimationHitboxToVisibleTilesInProject(
  data: GBAProjectData,
  animationIDToUpdate: string,
  frameIndex: number
): GBAProjectData {
  const editable = editableMetaspriteFrame(data, animationIDToUpdate, frameIndex);
  if (!editable) return data;

  const tiles = Array.isArray(editable.frame.tiles) ? editable.frame.tiles.filter(isRecord) : [];
  if (tiles.length === 0) return data;

  const geometry = geometryForAnimation(editable.animation);
  const frameWidth = positiveInteger(editable.frame.width, geometry.frameWidth);
  const frameHeight = positiveInteger(editable.frame.height, geometry.frameHeight);
  const tileBounds = tiles.map((tile) => {
    const tileWidth = positiveInteger(tile.tileWidth, 8);
    const tileHeight = positiveInteger(tile.tileHeight, 8);
    const left = signedInteger(tile.x, 0);
    const top = frameHeight - signedInteger(editable.frame.originY, geometry.originY) - signedInteger(tile.y, 0) - tileHeight;
    return {
      minX: left,
      minY: top,
      maxX: left + tileWidth,
      maxY: top + tileHeight
    };
  });
  const minX = clampInteger(Math.min(...tileBounds.map((bounds) => bounds.minX)), 0, Math.max(0, frameWidth - 1));
  const minY = clampInteger(Math.min(...tileBounds.map((bounds) => bounds.minY)), 0, Math.max(0, frameHeight - 1));
  const maxX = clampInteger(Math.max(...tileBounds.map((bounds) => bounds.maxX)), minX + 1, frameWidth);
  const maxY = clampInteger(Math.max(...tileBounds.map((bounds) => bounds.maxY)), minY + 1, frameHeight);
  const nextGeometry = deriveSpriteCanvasGeometry({
    ...geometry,
    hitboxX: minX - geometry.originX,
    hitboxY: minY - geometry.originY,
    hitboxWidth: Math.max(1, maxX - minX),
    hitboxHeight: Math.max(1, maxY - minY)
  });

  Object.assign(editable.animation, nextGeometry);
  return editable.next;
}

export function copySpriteAnimationGeometryToSheetSiblingsInProject(
  data: GBAProjectData,
  sourceAnimationID: string
): GBAProjectData {
  const editable = editableAnimation(data, sourceAnimationID);
  if (!editable) return data;

  const sourceGeometry = geometryForAnimation(editable.animation);
  const sourceSheet = stringField(editable.animation.spriteSheet, "");
  const sourceState = nullableString(editable.animation.state);
  let copied = 0;
  for (const [index, animation] of editable.animations.entries()) {
    if (index === editable.animationIndex) continue;
    const matchesSheet = stringField(animation.spriteSheet, "") === sourceSheet;
    const matchesState = sourceState ? nullableString(animation.state) === sourceState : matchesSheet;
    if (!matchesSheet || !matchesState) continue;
    Object.assign(animation, sourceGeometry);
    if (Array.isArray(animation.frames)) {
      animation.frames = animation.frames.map((frame) => isRecord(frame)
        ? {
            ...frame,
            width: sourceGeometry.frameWidth,
            height: sourceGeometry.frameHeight,
            originX: sourceGeometry.originX,
            originY: sourceGeometry.originY
          }
        : frame);
    }
    copied += 1;
  }

  return copied > 0 ? editable.next : data;
}

function uniqueEventName(baseName: string, existingNames: string[]): string {
  const existing = new Set(existingNames.map((name) => name.trim()).filter(Boolean));
  if (!existing.has(baseName)) return baseName;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${baseName}_${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${baseName}_${Date.now()}`;
}

export function deriveSpriteFrameEventBinding(
  data: GBAProjectData,
  animationIDToBind: string,
  frameIndex: number
): SpriteFrameEventBinding | null {
  if (!Number.isInteger(frameIndex) || frameIndex < 0) return null;

  const animations = projectArray(data, "animations");
  const animation = animations.find((item, index) => animationID(item, index) === animationIDToBind);
  if (!animation) return null;

  const frameCount = positiveInteger(animation.frameCount, 1);
  if (frameIndex >= frameCount) return null;

  const animationName = stringField(animation.name, "sprite_animation");
  const frameEvents = normalizedFrameEvents(animation.frameEvents, frameCount);
  const currentEventName = frameEvents[frameIndex]?.find((event) => event.type === "event")?.value ?? "";
  const eventNames = projectArray(data, "events").map((event, index) => stringField(event.name, `event_${index + 1}`));
  const suggestedEventName = currentEventName || uniqueEventName(slugifiedEventName(`${animationName}_frame_${frameIndex + 1}`), eventNames);

  return {
    animationID: animationIDToBind,
    animationName,
    category: "Sprite",
    currentEventName,
    eventExists: currentEventName ? eventNames.includes(currentEventName) : false,
    frameIndex,
    suggestedEventName
  };
}

export function bindSpriteFrameEventInProject(
  data: GBAProjectData,
  animationIDToBind: string,
  options: BindSpriteFrameEventOptions
): GBAProjectData {
  const eventName = options.eventName.trim();
  if (!eventName) return data;

  const editable = editableAnimation(data, animationIDToBind);
  if (!editable) return data;

  const frameCount = positiveInteger(editable.animation.frameCount, 1);
  if (!Number.isInteger(options.frameIndex) || options.frameIndex < 0 || options.frameIndex >= frameCount) return data;

  const frameEvents = normalizedFrameEvents(editable.animation.frameEvents, frameCount);
  const otherEvents = frameEvents[options.frameIndex].filter((event) => event.type !== "event");
  frameEvents[options.frameIndex] = [{ type: "event", value: eventName }, ...otherEvents];
  editable.animation.frameEvents = frameEvents;
  return editable.next;
}

export function generateSpriteFromReferenceInProject(
  data: GBAProjectData,
  options: GenerateSpriteFromReferenceOptions
): GBAProjectData {
  const referenceIDToGenerate = options.referenceID.trim();
  const spriteAssetID = options.spriteAssetID.trim();
  const animationIDToCreate = options.animationID.trim();
  const spriteSheetName = options.spriteSheetName.trim();
  if (!referenceIDToGenerate || !spriteAssetID || !animationIDToCreate || !spriteSheetName) return data;

  const next = cloneProjectData(data);
  const references = projectArray(next, "spriteReferenceImages");
  const referenceIndex = references.findIndex((reference, index) => referenceID(reference, index) === referenceIDToGenerate);
  if (referenceIndex < 0) return data;

  const reference: Record<string, unknown> = { ...references[referenceIndex], generatedSpriteAssetName: spriteSheetName };
  references[referenceIndex] = reference;
  next.spriteReferenceImages = references;

  const assets = projectArray(next, "assets");
  if (!assets.some((asset) => stringField(asset.name, "") === spriteSheetName)) {
    assets.push({
      id: spriteAssetID,
      kind: "Sprite",
      name: spriteSheetName,
      systemImage: "person.crop.square",
      metadata: {
        source: options.assetSourceRelativePath ?? `Assets/${spriteSheetName}`,
        generatedFromReference: referenceIDToGenerate
      }
    });
    next.assets = assets;
  }

  const animations = projectArray(next, "animations");
  if (!animations.some((animation, index) => animationID(animation, index) === animationIDToCreate)) {
    const frameWidth = positiveInteger(reference.frameWidth, 16);
    const frameHeight = positiveInteger(reference.frameHeight, 32);
    const frameCount = inferReferenceFrameCount(reference, frameWidth, frameHeight);
    animations.push({
      id: animationIDToCreate,
      name: makeReferenceAnimationName(reference),
      spriteSheet: spriteSheetName,
      frameWidth,
      frameHeight,
      fps: positiveInteger(reference.fps, 8),
      frameCount,
      loops: true,
      state: stringField(reference.state, "idle"),
      direction: stringField(reference.direction, "down"),
      colorMode: "4bpp",
      frames: [
        {
          width: frameWidth,
          height: frameHeight,
          originX: Math.floor(frameWidth / 2),
          originY: Math.max(0, frameHeight - 8),
          tiles: makeGeneratedReferenceTiles(frameWidth, frameHeight, spriteSheetName)
        }
      ]
    });
    next.animations = animations;
  }

  return next;
}

export function removeSpriteAnimationFromProject(data: GBAProjectData, animationIDToRemove: string): GBAProjectData {
  const next = cloneProjectData(data);
  const animations = projectArray(next, "animations");
  const filteredAnimations = animations.filter((item, index) => animationID(item, index) !== animationIDToRemove);
  if (filteredAnimations.length === animations.length) {
    return data;
  }

  next.animations = filteredAnimations;
  next.animationStates = removeAnimationIDFromStates(next.animationStates, animationIDToRemove);
  return next;
}

export function deriveSpritesWorkspacePresentation(data: GBAProjectData): SpritesWorkspacePresentation {
  const spriteAssets = projectArray(data, "assets").filter((asset) => stringField(asset.kind, "") === "Sprite");
  const animations = projectArray(data, "animations");
  const animationStates = projectArray(data, "animationStates");
  const references = projectArray(data, "spriteReferenceImages")
    .map((reference, index) => makeReference(reference, index, nullableString(data.activeSpriteReferenceImageID)))
    .sort((lhs, rhs) => lhs.title.localeCompare(rhs.title, "pt-BR"));

  const sheetNames = new Set<string>();
  for (const asset of spriteAssets) {
    sheetNames.add(stringField(asset.name, "Sprite sem nome"));
  }
  for (const animation of animations) {
    sheetNames.add(stringField(animation.spriteSheet, "Sprite sem nome"));
  }
  for (const reference of references) {
    if (reference.generatedSpriteAssetName) {
      sheetNames.add(reference.generatedSpriteAssetName);
    }
  }

  const animationsBySheet: Record<string, SpritesWorkspaceAnimation[]> = {};
  for (const [index, animation] of animations.entries()) {
    const spriteSheet = stringField(animation.spriteSheet, "Sprite sem nome");
    const current = animationsBySheet[spriteSheet] ?? [];
    const asset = spriteAssets.find(item => item.name === spriteSheet || item.id === spriteSheet);
    const metadata = isRecord(asset?.metadata) ? asset.metadata : {};
    current.push(makeAnimation({ ...animation, colorMode: spriteColorModeForSheet(data, spriteSheet), streamFrames: metadata.streamFrames === true }, index, spriteSheet));
    animationsBySheet[spriteSheet] = current;
  }
  for (const sheetName of Object.keys(animationsBySheet)) {
    animationsBySheet[sheetName].sort((lhs, rhs) => lhs.name.localeCompare(rhs.name, "pt-BR"));
  }

  const animationStatesBySheet: Record<string, SpriteStateContract[]> = {};
  for (const [index, state] of animationStates.entries()) {
    const spriteSheet = stringField(state.spriteSheet, "");
    if (!spriteSheet) continue;
    const current = animationStatesBySheet[spriteSheet] ?? [];
    current.push({
      id: stringField(state.id, `animation-state-${index + 1}`),
      name: stringField(state.name, `Estado ${index + 1}`),
      spriteSheet,
      animationType: isSpriteAnimationType(state.animationType) ? state.animationType : "fixed",
      mirrorLeftFromRight: booleanField(state.mirrorLeftFromRight, false),
      animationIDs: Array.isArray(state.animationIDs)
        ? state.animationIDs.filter((id): id is string => typeof id === "string")
        : []
    });
    animationStatesBySheet[spriteSheet] = current;
  }

  const spriteSheets = Array.from(sheetNames)
    .map((name) => {
      const asset = spriteAssets.find((item) => stringField(item.name, "Sprite sem nome") === name);
      const sheetAnimations = animationsBySheet[name] ?? [];
      const sheetStates = animationStates.filter((state) => stringField(state.spriteSheet, "") === name);
      const sheetReferences = references.filter((reference) => reference.generatedSpriteAssetName === name);
      const maxFrameWidth = Math.max(1, ...sheetAnimations.map((animation) => Number(animation.frameSize.split(" x ")[0])));
      const maxFrameHeight = Math.max(1, ...sheetAnimations.map((animation) => Number(animation.frameSize.split(" x ")[1])));
      const colorModes = Array.from(new Set(sheetAnimations.map((animation) => animation.colorMode))).sort();
      const hasAsset = Boolean(asset);
      return {
        id: nullableString(asset?.id) ?? (hasAsset ? name : `missing-${name}`),
        name,
        source: asset ? metadataSource(asset) : null,
        bundledDefaultAsset: asset ? metadataBundledDefaultAsset(asset) : null,
        systemImage: nullableString(asset?.systemImage) ?? "photo",
        hasAsset,
        animationCount: sheetAnimations.length,
        stateCount: sheetStates.length,
        referenceImageCount: sheetReferences.length,
        totalFrames: sheetAnimations.reduce((sum, animation) => sum + animation.frameCount, 0),
        maxFrameSize: `${maxFrameWidth} x ${maxFrameHeight}`,
        colorModes: colorModes.length > 0 ? colorModes : ["4bpp"]
      };
    })
    .sort((lhs, rhs) => lhs.name.localeCompare(rhs.name, "pt-BR"));

  return {
    spriteSheets,
    animationsBySheet,
    animationStatesBySheet,
    references,
    stateDirectionPreviewsBySheet: Object.fromEntries(spriteSheets.map((sheet) => [
      sheet.name,
      makeStateDirectionPreviews(animationsBySheet[sheet.name] ?? [])
    ])),
    stateDirectionOptionsBySheet: Object.fromEntries(spriteSheets.map((sheet) => [
      sheet.name,
      deriveSpriteStateDirectionOptions({
        animations,
        references: projectArray(data, "spriteReferenceImages"),
        spriteSheet: sheet.name
      })
    ])),
    summary: {
      spriteSheetCount: spriteSheets.length,
      animationCount: animations.length,
      animationStateCount: animationStates.length,
      referenceImageCount: references.length,
      missingSpriteSheetCount: spriteSheets.filter((sheet) => !sheet.hasAsset).length,
      totalFrames: spriteSheets.reduce((sum, sheet) => sum + sheet.totalFrames, 0)
    }
  };
}

function spriteSheetMatchesQuery(
  sheet: SpritesWorkspaceSheet,
  presentation: SpritesWorkspacePresentation,
  query: string
): boolean {
  if (!query) return true;

  const animations = presentation.animationsBySheet[sheet.name] ?? [];
  const references = presentation.references.filter((reference) => reference.generatedSpriteAssetName === sheet.name);
  const previews = presentation.stateDirectionPreviewsBySheet[sheet.name] ?? [];

  return [
    sheet.name,
    sheet.source ?? "",
    sheet.maxFrameSize,
    sheet.colorModes.join(" "),
    animations.map((animation) => [
      animation.name,
      animation.spriteSheet,
      animation.state ?? "",
      animation.direction ?? "",
      animation.colorMode,
      animation.loopMode
    ].join(" ")).join(" "),
    references.map((reference) => [
      reference.title,
      reference.assetName ?? "",
      reference.generatedSpriteAssetName ?? "",
      reference.state,
      reference.direction
    ].join(" ")).join(" "),
    previews.map((preview) => `${preview.animationName} ${preview.state} ${preview.direction}`).join(" ")
  ].some((value) => value.toLocaleLowerCase("pt-BR").includes(query));
}

function spriteSheetMatchesStatus(sheet: SpritesWorkspaceSheet, status: SpritesWorkspaceFilterStatus): boolean {
  if (status === "missing") return !sheet.hasAsset;
  if (status === "referenced") return sheet.referenceImageCount > 0;
  return true;
}

export function filterSpritesWorkspaceSheets(
  presentation: SpritesWorkspacePresentation,
  options: SpritesWorkspaceFilterOptions
): SpritesWorkspaceSheet[] {
  const query = options.query?.trim().toLocaleLowerCase("pt-BR") ?? "";
  const status = options.status ?? "";

  return presentation.spriteSheets.filter((sheet) => {
    const matchesQuery = options.searchScope === "rail"
      ? spriteSheetMatchesRailQuery(sheet, query)
      : spriteSheetMatchesQuery(sheet, presentation, query);
    return matchesQuery && spriteSheetMatchesStatus(sheet, status);
  });
}

export function deriveSpritesWorkspaceFilterChips(
  presentation: SpritesWorkspacePresentation,
  activeStatus: SpritesWorkspaceFilterStatus = ""
): SpritesWorkspaceFilterChip[] {
  const sheets = presentation.spriteSheets;
  const definitions: Array<Omit<SpritesWorkspaceFilterChip, "isActive">> = [
    {
      id: "sprite-status-all",
      label: "Todos",
      value: "",
      count: sheets.length
    },
    {
      id: "sprite-status-referenced",
      label: "Referencias",
      value: "referenced",
      count: sheets.filter((sheet) => sheet.referenceImageCount > 0).length
    },
    {
      id: "sprite-status-missing",
      label: "Ausentes",
      value: "missing",
      count: sheets.filter((sheet) => !sheet.hasAsset).length
    }
  ];

  return definitions.map((definition) => ({
    ...definition,
    isActive: definition.value === activeStatus
  }));
}

export interface SpritesWorkspaceValidationIssue {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  spriteSheet?: string;
}

export interface SpritesWorkspaceSummaryCard {
  id: "sheets" | "animations" | "frames" | "missing" | "references";
  label: string;
  value: number;
  tone: "primary" | "neutral" | "warning";
}

export function deriveSpritesWorkspaceValidationIssues(
  presentation: SpritesWorkspacePresentation
): SpritesWorkspaceValidationIssue[] {
  const issues: SpritesWorkspaceValidationIssue[] = [];

  for (const sheet of presentation.spriteSheets) {
    if (!sheet.hasAsset) {
      issues.push({
        id: `missing-sheet-${sheet.name}`,
        severity: "error",
        message: `Sprite sheet ${sheet.name} sem asset importado.`,
        spriteSheet: sheet.name
      });
    }

    const animations = presentation.animationsBySheet[sheet.name] ?? [];
    if (animations.length === 0) {
      issues.push({
        id: `no-animations-${sheet.name}`,
        severity: "warning",
        message: `${sheet.name} nao possui animacoes.`,
        spriteSheet: sheet.name
      });
    }

    for (const animation of animations) {
      if (animation.frameCount <= 0 || animation.metaspriteFrames.length === 0) {
        issues.push({
          id: `empty-animation-${animation.id}`,
          severity: "warning",
          message: `Animacao ${animation.name} em ${sheet.name} sem frames/tiles.`,
          spriteSheet: sheet.name
        });
      }

      for (const warning of animation.vramAnalysis.warnings) {
        const supportedWideFrame = warning === spriteVramWarningLabels.horizontalOBJTileLimit;
        const recommendations = animation.vramAnalysis.recommendations
          .filter((recommendation) => !(supportedWideFrame && recommendation === "splitWideSprite"))
          .map((recommendation) => spriteVramRecommendationLabels[recommendation])
          .join(" ");
        issues.push({
          id: `vram-${animation.id}-${warning}`,
          severity: supportedWideFrame ? "info" : "warning",
          message: `${animation.name} (${sheet.name}): ${warning}${supportedWideFrame ? " A exportação decompõe o frame em OBJs nativos." : ""}${recommendations ? ` ${recommendations}` : ""}`,
          spriteSheet: sheet.name
        });
      }

      let estimatedMetaspriteParts = 0;
      const decomposedTileSizes = new Set<string>();
      for (const frame of animation.metaspriteFrames) {
        estimatedMetaspriteParts = Math.max(estimatedMetaspriteParts,
          gbaMetaspriteFramePartCount(animation.frameWidth, animation.frameHeight, frame.tiles));
        for (const tile of frame.tiles) {
          const aligned = tile.tileWidth >= 8
            && tile.tileHeight >= 8
            && tile.tileWidth % 8 === 0
            && tile.tileHeight % 8 === 0
            && tile.sliceX % 8 === 0
            && tile.sliceY % 8 === 0;
          if (!aligned) {
            issues.push({
              id: `metasprite-part-alignment-${animation.id}-${frame.frameIndex}-${tile.tileIndex}`,
              severity: "error",
              message: `${animation.name} (${sheet.name}), frame ${frame.frameIndex + 1}: a peça ${tile.tileIndex + 1} precisa usar dimensões e slice alinhados em 8×8 px.`,
              spriteSheet: sheet.name
            });
            continue;
          }

          if (!isGbaObjNativeDimension(tile.tileWidth, tile.tileHeight)) {
            decomposedTileSizes.add(`${tile.tileWidth}×${tile.tileHeight}`);
          }
        }
      }

      if (decomposedTileSizes.size > 0) {
        issues.push({
          id: `metasprite-part-decomposition-${animation.id}`,
          severity: "info",
          message: `${animation.name} (${sheet.name}): peças ${[...decomposedTileSizes].join(", ")} serão fatiadas automaticamente em OBJs nativos do GBA.`,
          spriteSheet: sheet.name
        });
      }

      if (estimatedMetaspriteParts > gbaMetaspritePartLimit) {
        issues.push({
          id: `metasprite-part-limit-${animation.id}`,
          severity: "error",
          message: `${animation.name} (${sheet.name}) excede ${gbaMetaspritePartLimit} partes OBJ por MetaSprite; reduza a composição ou use mais de um ator lógico.`,
          spriteSheet: sheet.name
        });
      }
    }
  }

  if (issues.length === 0 && presentation.spriteSheets.length > 0) {
    issues.push({
      id: "sprites-ok",
      severity: "info",
      message: "Biblioteca de sprites validada sem pendencias."
    });
  }

  return issues;
}

export function deriveSpritesWorkspaceSummaryCards(
  presentation: SpritesWorkspacePresentation
): SpritesWorkspaceSummaryCard[] {
  return [
    { id: "sheets", label: "Sheets", value: presentation.summary.spriteSheetCount, tone: "primary" },
    { id: "animations", label: "Animacoes", value: presentation.summary.animationCount, tone: "neutral" },
    { id: "frames", label: "Frames", value: presentation.summary.totalFrames, tone: "neutral" },
    { id: "missing", label: "Ausentes", value: presentation.summary.missingSpriteSheetCount, tone: presentation.summary.missingSpriteSheetCount > 0 ? "warning" : "neutral" },
    { id: "references", label: "Referencias", value: presentation.summary.referenceImageCount, tone: "neutral" }
  ];
}
