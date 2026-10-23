import { collisionFlagsFromTypes, type RoomCollisionType } from "./roomCollisionTypes.js";

export const TILE_REPLACEMENT_COLLISIONS = ["keep", "free", "solid", "down", "up", "left", "right", "water", "damage", "ladder"];

export function tileReplacementCollision(value: string | undefined): RoomCollisionType | undefined {
  if (!value || value === "keep") return undefined;
  if (!TILE_REPLACEMENT_COLLISIONS.includes(value)) {
    throw new Error(`Colisão inválida para ReplaceTile: ${value}`);
  }
  return value as RoomCollisionType;
}

export function tileReplacementCollisionFields(value: string | undefined, layer: string): {collision_flags?: number} {
  const type = tileReplacementCollision(value);
  if (type === undefined) return {};
  if (layer !== "bg0" && layer !== "bg2") throw new Error("A colisão de ReplaceTile aplica-se ao piso BG2.");
  return {collision_flags: collisionFlagsFromTypes([type])[0]};
}
