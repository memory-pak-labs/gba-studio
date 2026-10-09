import { GBA_VIEWPORT_TILES } from "./roomCamera.js";
import { deriveIsometricWorldSize, type IsometricWorldSize } from "./isometricAuthoring.js";
import {
  type IsometricCameraZoneLike,
  type IsometricCameraPositionInput,
  type IsometricCameraPositionOutput
} from "./isometricCamera.js";
import type { IsometricProjectionCanvasOffset } from "./isometricProjection.js";
import type { IsometricSceneGeometryConfig } from "./sceneTypeProfiles.js";

export {
  deriveIsometricCameraPositionForPlayer,
  type IsometricCameraZoneLike,
  type IsometricCameraPositionInput,
  type IsometricCameraPositionOutput
} from "./isometricCamera.js";

export const GBA_VIEWPORT_PIXELS = {
  height: 160,
  width: 240
} as const;

export interface FocusSceneViewportInput {
  availableHeight: number;
  availableWidth: number;
  atlasTileHeight?: number;
  zoom?: number;
  viewMode?: "viewport" | "map";
  isometricConfig?: IsometricSceneGeometryConfig;
  isometricSurfaceSize?: IsometricWorldSize;
  projection?: "isometric" | "orthogonal";
  roomHeightTiles: number;
  roomWidthTiles: number;
}

export interface FocusSceneViewportGeometry {
  hasOverflow: boolean;
  overflowX: boolean;
  overflowY: boolean;
  scale: number;
  viewportHeight: number;
  viewportWidth: number;
  worldHeight: number;
  worldWidth: number;
}

export interface FocusSceneActorBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface FocusSceneActorScrollInput {
  actorBounds: FocusSceneActorBounds | null;
  currentScrollLeft: number;
  currentScrollTop: number;
  maxScrollLeft: number;
  maxScrollTop: number;
  viewportHeight: number;
  viewportLeft: number;
  viewportTop: number;
  viewportWidth: number;
}

export interface FocusSceneActorScrollOutput {
  scrollLeft: number;
  scrollTop: number;
}

export type FocusSceneIsometricCameraZone = IsometricCameraZoneLike;
export type FocusSceneIsometricCameraInput = IsometricCameraPositionInput;
export type FocusSceneIsometricCameraOutput = IsometricCameraPositionOutput;

export interface FocusSceneCameraScrollInput {
  cameraX: number;
  cameraY: number;
  maxScrollLeft: number;
  maxScrollTop: number;
  projectionOffset: IsometricProjectionCanvasOffset;
  scale: number;
}

export interface FocusSceneCameraScrollOutput {
  scrollLeft: number;
  scrollTop: number;
}

function clampScroll(value: number, maximum: number): number {
  return Math.max(0, Math.min(Math.max(0, maximum), Math.round(value)));
}

/**
 * Converts the Play camera's logical pixels into the scaled scroll-space used
 * by the focused scene editor. Isometric editor coordinates can have a local
 * projection offset, while the runtime camera is expressed in world pixels.
 */
export function deriveFocusSceneCameraScroll({
  cameraX,
  cameraY,
  maxScrollLeft,
  maxScrollTop,
  projectionOffset,
  scale
}: FocusSceneCameraScrollInput): FocusSceneCameraScrollOutput {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    scrollLeft: clampScroll((cameraX - projectionOffset.x) * safeScale, maxScrollLeft),
    scrollTop: clampScroll((cameraY - projectionOffset.y) * safeScale, maxScrollTop)
  };
}

export function deriveFocusSceneActorScroll({
  actorBounds,
  currentScrollLeft,
  currentScrollTop,
  maxScrollLeft,
  maxScrollTop,
  viewportHeight,
  viewportLeft,
  viewportTop,
  viewportWidth
}: FocusSceneActorScrollInput): FocusSceneActorScrollOutput {
  if (!actorBounds || viewportWidth <= 0 || viewportHeight <= 0) {
    return {
      scrollLeft: clampScroll(currentScrollLeft, maxScrollLeft),
      scrollTop: clampScroll(currentScrollTop, maxScrollTop)
    };
  }

  const actorCenterX = (actorBounds.left + actorBounds.right) / 2;
  const actorCenterY = (actorBounds.top + actorBounds.bottom) / 2;
  const viewportCenterX = viewportLeft + viewportWidth / 2;
  const viewportCenterY = viewportTop + viewportHeight / 2;

  return {
    scrollLeft: clampScroll(currentScrollLeft + actorCenterX - viewportCenterX, maxScrollLeft),
    scrollTop: clampScroll(currentScrollTop + actorCenterY - viewportCenterY, maxScrollTop)
  };
}

export function deriveFocusSceneViewportGeometry({
  atlasTileHeight,
  availableHeight,
  availableWidth,
  isometricConfig,
  isometricSurfaceSize,
  projection = "orthogonal",
  roomHeightTiles,
  roomWidthTiles,
  viewMode = "viewport",
  zoom = 1
}: FocusSceneViewportInput): FocusSceneViewportGeometry {
  const viewportScale = Math.min(
    availableWidth / GBA_VIEWPORT_PIXELS.width,
    availableHeight / GBA_VIEWPORT_PIXELS.height
  );
  const scale = viewportScale * (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
  const logicalTileWidth = GBA_VIEWPORT_PIXELS.width / GBA_VIEWPORT_TILES.width;
  const logicalTileHeight = GBA_VIEWPORT_PIXELS.height / GBA_VIEWPORT_TILES.height;
  const projectedWorld = projection === "isometric"
    ? isometricSurfaceSize ?? deriveIsometricWorldSize({ atlasTileHeight, config: isometricConfig, height: roomHeightTiles, width: roomWidthTiles })
    : null;
  const roomWidthPixels = projectedWorld?.width ?? roomWidthTiles * logicalTileWidth;
  const roomHeightPixels = projectedWorld?.height ?? roomHeightTiles * logicalTileHeight;
  const viewportWidth = viewMode === "map" ? availableWidth : GBA_VIEWPORT_PIXELS.width * viewportScale;
  const viewportHeight = viewMode === "map" ? availableHeight : GBA_VIEWPORT_PIXELS.height * viewportScale;
  const overflowX = roomWidthPixels * scale > viewportWidth + 0.01;
  const overflowY = roomHeightPixels * scale > viewportHeight + 0.01;

  return {
    hasOverflow: overflowX || overflowY,
    overflowX,
    overflowY,
    scale,
    viewportHeight,
    viewportWidth,
    worldHeight: Math.max(GBA_VIEWPORT_PIXELS.height, roomHeightPixels) * scale,
    worldWidth: Math.max(GBA_VIEWPORT_PIXELS.width, roomWidthPixels) * scale
  };
}
