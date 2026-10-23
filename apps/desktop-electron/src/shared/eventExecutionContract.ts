import { nativeEventCommandExportHandling } from "./eventCommandRegistry.js";

export type EventTiming = "immediate" | "frames" | "input" | "dialogue" | "restore" | "transition" | "runtime-defined";
export interface EventSourceLocation { eventID: string; stepID: string }
export interface EventInstruction {
  verb: string;
  operands: string[];
  source?: EventSourceLocation;
  numeric: Partial<Record<"frames" | "slot", number>>;
}
/** Shared instruction boundary. Scene-specific references are resolved by each runtime. */
export function parseEventInstruction(command: string, source?: EventSourceLocation, validate = true): EventInstruction {
  const [verb = "noop", ...operands] = command.split(/\s+/).filter(Boolean);
  const numeric: EventInstruction["numeric"] = {};
  const integer = (name: "frames" | "slot", fallback: number, max: number) => {
    const value = operands[0] === undefined ? fallback : Number(operands[0]);
    if (validate && (!Number.isInteger(value) || value < 0 || value > max)) throw new Error(`${verb}: ${name} deve estar entre 0 e ${max}.`);
    numeric[name] = value;
  };
  if (verb === "wait") integer("frames", 0, 32767);
  if (["save_game", "load_game", "remove_save_game"].includes(verb)) integer("slot", 0, 7);
  return { verb, operands, source, numeric };
}
export function eventExecutionContract(verb: string): {
  handling: ReturnType<typeof nativeEventCommandExportHandling>;
  timing: EventTiming; blocks: boolean; resetsSceneResources: boolean; resources: string[];
} {
  const timing: EventTiming = verb === "wait" ? "frames" : verb === "wait_button" ? "input"
    : ["show_dialogue", "show_choice", "open_text_input"].includes(verb) ? "dialogue"
    : verb === "load_game" ? "restore" : /^(change_scene|scene_stack_|advance_campaign)/.test(verb) ? "transition"
    : ["noop", "set_variable", "add_variable", "set_flag", "save_game", "remove_save_game", "set_map_state", "replace_tile", "clear_visibility", "lantern", "reveal_area"].includes(verb) ? "immediate" : "runtime-defined";
  return { handling: nativeEventCommandExportHandling(verb), timing,
    blocks: ["frames", "input", "dialogue", "restore", "transition"].includes(timing),
    resetsSceneResources: timing === "restore" || timing === "transition",
    resources: ["lantern", "reveal_area", "clear_visibility"].includes(verb) ? ["window1", "brightness"]
      : ["replace_tile", "set_map_state"].includes(verb) ? ["tile-command-queue", "background", "collision"] : [] };
}
export type SceneEntryReason = "first-entry" | "return" | "load" | "resume" | "restart";
/** Legacy initialization is explicit while authored map states restore without replaying onInit. */
export function sceneEntryPlan(reason: SceneEntryReason, options: { hasMapStates?: boolean; restoreOnly?: boolean } = {}) {
  return { reason, resetResources: reason !== "resume", restoreSavedState: reason === "load" || reason === "resume",
    runInit: reason !== "resume" && (reason !== "load" || !(options.hasMapStates || options.restoreOnly)),
    phases: reason === "resume" ? ["resume"] : ["reset-resources", "scene", "saved-values", "entities", "map-states", "camera", "callbacks"] };
}

export function eventWaitFrames(instruction: EventInstruction): number {
  const value = instruction.numeric.frames ?? Number(instruction.operands[0] ?? 0);
  return Math.max(0, Math.min(32767, Math.floor(Number.isFinite(value) ? value : 0)));
}
