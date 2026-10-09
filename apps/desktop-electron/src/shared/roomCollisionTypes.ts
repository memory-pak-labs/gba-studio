export const ROOM_COLLISION_TYPES = [
  "free", "solid", "down", "up", "left", "right", "water", "damage", "ladder", "event",
  "slope_up_right", "slope_up_left"
] as const;

export type RoomCollisionType = (typeof ROOM_COLLISION_TYPES)[number];

export function isRoomCollisionType(value: unknown): value is RoomCollisionType {
  return typeof value === "string" && (ROOM_COLLISION_TYPES as readonly string[]).includes(value);
}

export function normalizeRoomCollisionType(value: unknown, fallback: RoomCollisionType = "free"): RoomCollisionType {
  return isRoomCollisionType(value) ? value : fallback;
}

export function isBlockedCollisionType(type: RoomCollisionType): boolean {
  return type === "solid"
    || type === "down"
    || type === "up"
    || type === "left"
    || type === "right"
    || type === "slope_up_right"
    || type === "slope_up_left";
}

export function isBlockedCollisionTypeForScene(type: RoomCollisionType, sceneType?: string | null): boolean {
  if (sceneType === "isometric" && (type === "slope_up_right" || type === "slope_up_left")) {
    return false;
  }
  return isBlockedCollisionType(type);
}

export function roomCollisionTypeLabel(type: RoomCollisionType): string {
  switch (type) {
    case "free":
      return "Livre";
    case "solid":
      return "Solido";
    case "down":
      return "Descer";
    case "up":
      return "Subir";
    case "left":
      return "Esquerda";
    case "right":
      return "Direita";
    case "water":
      return "Agua";
    case "damage":
      return "Dano";
    case "ladder":
      return "Escada";
    case "event":
      return "Evento";
    case "slope_up_right":
      return "Rampa subindo à direita";
    case "slope_up_left":
      return "Rampa subindo à esquerda";
    default:
      return "Livre";
  }
}

export function collisionTypeCellsFromRoom(
  room: Record<string, unknown>,
  width: number,
  height: number
): RoomCollisionType[] {
  const totalTiles = Math.max(1, width) * Math.max(1, height);
  const collisionTypes = Array.isArray(room.collisionTypes) ? room.collisionTypes : [];
  return Array.from({ length: totalTiles }, (_, index) => normalizeRoomCollisionType(collisionTypes[index], "free"));
}

export function blockedCollisionCellsFromRoom(
  room: Record<string, unknown>,
  width: number,
  height: number,
  sceneType?: string | null
): boolean[] {
  return collisionTypeCellsFromRoom(room, width, height).map((type) => isBlockedCollisionTypeForScene(type, sceneType));
}

export function resizeCollisionTypeCells(
  values: RoomCollisionType[],
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
  fillValue: RoomCollisionType = "free"
): RoomCollisionType[] {
  const next: RoomCollisionType[] = [];
  for (let y = 0; y < newHeight; y += 1) {
    for (let x = 0; x < newWidth; x += 1) {
      if (x < oldWidth && y < oldHeight) {
        next.push(normalizeRoomCollisionType(values[y * oldWidth + x], fillValue));
      } else {
        next.push(fillValue);
      }
    }
  }
  return next;
}

export function collisionFlagsFromTypes(types: RoomCollisionType[]): number[] {
  return types.map((type) => {
    switch (type) {
      case "solid": return 1;
      case "down": return 1 << 1;
      case "up": return 1 << 2;
      case "right": return 1 << 3;
      case "left": return 1 << 4;
      case "water": return 1 << 5;
      case "damage": return 1 << 6;
      case "ladder": return 1 << 7;
      default: return 0;
    }
  });
}

export function collisionSlopesFromTypes(types: RoomCollisionType[]): number[] {
  return types.map((type) => {
    switch (type) {
      case "slope_up_right": return 2;
      case "slope_up_left": return 4;
      default: return 0;
    }
  });
}
