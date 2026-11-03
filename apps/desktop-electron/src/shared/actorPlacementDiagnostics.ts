import type { GBAProjectData } from "./projectFile.js";
import { normalizeGBAEventDocument } from "../../../../packages/project-contract/src/index.js";

export interface ActorPlacementBounds { x: number; y: number; width: number; height: number }

/** Only the synchronous, unconditional initialization prefix can establish spawn geometry. */
export function actorInitialCollisionBounds(data: GBAProjectData, actor: Record<string, unknown>): ActorPlacementBounds | undefined {
  const bindings = actor.eventBindings as Record<string, unknown> | undefined;
  if (typeof bindings?.onInit !== "string" || !bindings.onInit.trim()) return undefined;
  const events = Array.isArray(data.events) ? data.events as Record<string, unknown>[] : [];
  const event = events.find(e => e.name === bindings?.onInit);
  if (!event) return undefined;
  let bounds: ActorPlacementBounds | undefined;
  for (const step of normalizeGBAEventDocument(event).steps) {
    if (!step.isEnabled) continue;
    const parts = step.command.match(/"(?:[^"\\]|\\.)*"|'[^']*'|\S+/g) ?? [];
    const verb = parts[0];
    if (!verb || verb === "noop") continue;
    if (!["set_actor_collision_box", "set_actor_collision_enabled", "set_actor_visible", "set_actor_animation", "set_actor_direction"].includes(verb)) break;
    const reference = parts[1]?.replace(/^(["'])(.*)\1$/, "$2");
    if (verb !== "set_actor_collision_box" || reference !== actor.id && reference !== actor.name) continue;
    const values = parts.slice(2).map(Number);
    if (values.length !== 4 || !values.every(Number.isInteger) || values[2]! <= 0 || values[3]! <= 0) continue;
    bounds = { x: values[0]!, y: values[1]!, width: values[2]!, height: values[3]! };
  }
  return bounds;
}
