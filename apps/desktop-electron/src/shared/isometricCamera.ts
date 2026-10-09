import { projectIsometricCoordinate } from "./isometricProjection.js";
import type { IsometricSceneGeometryConfig } from "./sceneTypeProfiles.js";

export const ISOMETRIC_CAMERA_VIEWPORT = {
  height: 160,
  width: 240
} as const;

/**
 * Screen-space anchor used by the GBA actor renderer for the controlled actor.
 * Keeping this explicit makes the Editor and Play agree on the same framing
 * instead of independently centering a DOM box or a logical tile.
 */
export const ISOMETRIC_PLAYER_SCREEN_ANCHOR = {
  x: 96,
  y: 88
} as const;

export interface IsometricCameraZoneLike {
  area: { height: number; width: number; x: number; y: number };
  bounds: { height: number; width: number; x: number; y: number };
  id: string;
  lockX: boolean;
  lockY: boolean;
  offset: { x: number; y: number };
}

export interface IsometricCameraPositionInput {
  config: IsometricSceneGeometryConfig;
  player: { x: number; y: number; z?: number };
  zones: readonly IsometricCameraZoneLike[];
}

export interface IsometricCameraPositionOutput {
  cameraX: number;
  cameraY: number;
  zoneID: string;
}

function isPlayerInCameraZone(
  player: { x: number; y: number },
  zone: IsometricCameraZoneLike
): boolean {
  return player.x >= zone.area.x
    && player.y >= zone.area.y
    && player.x < zone.area.x + zone.area.width
    && player.y < zone.area.y + zone.area.height;
}

export function deriveIsometricCameraPositionForPlayer({
  config,
  player,
  zones
}: IsometricCameraPositionInput): IsometricCameraPositionOutput | null {
  const zone = zones.find((candidate) => isPlayerInCameraZone(player, candidate));
  if (!zone) return null;

  const playerPixels = projectIsometricCoordinate({
    x: player.x,
    y: player.y,
    z: player.z ?? 0
  }, config);
  const rawX = zone.lockX
    ? zone.bounds.x + zone.offset.x
    : playerPixels.x - ISOMETRIC_PLAYER_SCREEN_ANCHOR.x + zone.offset.x;
  const rawY = zone.lockY
    ? zone.bounds.y + zone.offset.y
    : playerPixels.y - ISOMETRIC_PLAYER_SCREEN_ANCHOR.y + zone.offset.y;
  const minX = zone.bounds.width > ISOMETRIC_CAMERA_VIEWPORT.width
    ? zone.bounds.x
    : zone.bounds.x + Math.floor(zone.bounds.width / 2) - ISOMETRIC_CAMERA_VIEWPORT.width / 2;
  const minY = zone.bounds.height > ISOMETRIC_CAMERA_VIEWPORT.height
    ? zone.bounds.y
    : zone.bounds.y + Math.floor(zone.bounds.height / 2) - ISOMETRIC_CAMERA_VIEWPORT.height / 2;
  const maxX = zone.bounds.width > ISOMETRIC_CAMERA_VIEWPORT.width
    ? zone.bounds.x + zone.bounds.width - ISOMETRIC_CAMERA_VIEWPORT.width
    : minX;
  const maxY = zone.bounds.height > ISOMETRIC_CAMERA_VIEWPORT.height
    ? zone.bounds.y + zone.bounds.height - ISOMETRIC_CAMERA_VIEWPORT.height
    : minY;

  return {
    cameraX: Math.max(minX, Math.min(maxX, rawX)),
    cameraY: Math.max(minY, Math.min(maxY, rawY)),
    zoneID: zone.id
  };
}
