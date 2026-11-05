import { normalizeGBAEventDocument } from "../../../../packages/project-contract/src/index.js";
import { parseEventInstruction } from "./eventExecutionContract.js";

export interface ShmupProjectileLaunch {
  eventName: string;
  actor: string;
  direction: string;
  speed: number;
  spriteSheet?: string;
}

/** Shmup export consumes these declarations even without an event callback. */
export function shmupProjectileLaunches(
  events: readonly unknown[],
  runtimeRoomNames: ReadonlySet<string>
): ShmupProjectileLaunch[] {
  if (runtimeRoomNames.size === 0) return [];
  return events.flatMap((event, eventIndex) => {
    const document = normalizeGBAEventDocument(event, eventIndex);
    if (document.sceneName && !runtimeRoomNames.has(document.sceneName)) return [];
    return document.steps.flatMap(step => {
      if (!step.isEnabled) return [];
      const { verb, operands } = parseEventInstruction(step.command, undefined, false);
      if (verb !== "launch_projectile" || !operands[0]) return [];
      const parsedSpeed = operands[2]?.trim() ? Number(operands[2]) : NaN;
      return [{
        eventName: document.name,
        actor: operands[0],
        direction: operands[1] || "right",
        speed: Math.max(1, Math.round(Number.isFinite(parsedSpeed) ? parsedSpeed : 2)),
        ...(operands[3] ? { spriteSheet: operands[3] } : {})
      }];
    });
  });
}
