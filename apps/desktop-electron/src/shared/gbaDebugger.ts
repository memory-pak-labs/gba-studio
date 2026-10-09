import { activeGbaBackgroundLayers } from "./gbaRendering.js";
import { gbaVramTotalBytes } from "./gbaVideoModes.js";
import type { GBAProjectData } from "./projectFile.js";
import type { PreviewRuntimeScalar, PreviewRuntimeState } from "./previewRuntime.js";
import { listProjectVariables } from "./variablesWorkspace.js";

export const gbaTileBytes4bpp = 32;

export interface PreviewVramUsage {
  bgBytes: number;
  bgPaintedTiles: number;
  bgUniqueTiles: number;
  objBytes: number;
  objSpriteCount: number;
  totalBytes: number;
  budgetBytes: number;
}

export interface GbaDebuggerLiveVariable {
  name: string;
  value: string;
  declared: boolean;
}

export interface GbaDebuggerScriptPosition {
  command: string;
  commandIndex: number;
  eventName: string;
}

export interface GbaDebuggerPresentation {
  breakpoints: string[];
  callStack: string[];
  enabled: boolean;
  liveVariables: GbaDebuggerLiveVariable[];
  pauseReason: string | null;
  paused: boolean;
  scriptPosition: GbaDebuggerScriptPosition | null;
  watchValues: Array<{ expression: string; value: string }>;
  vram: PreviewVramUsage;
}

export function breakpointKey(eventName: string, commandIndex?: number): string {
  return commandIndex === undefined ? eventName : `${eventName}#${commandIndex}`;
}

export function parseBreakpointKey(key: string): { eventName: string; commandIndex: number | null } {
  const hashIndex = key.lastIndexOf("#");
  if (hashIndex <= 0) {
    return { eventName: key, commandIndex: null };
  }
  const eventName = key.slice(0, hashIndex);
  const commandIndex = Number(key.slice(hashIndex + 1));
  return {
    eventName,
    commandIndex: Number.isFinite(commandIndex) ? commandIndex : null
  };
}

export function hasPreviewDebuggerBreakpoint(
  breakpoints: readonly string[],
  eventName: string,
  commandLine?: number
): boolean {
  if (breakpoints.includes(eventName)) return true;
  if (commandLine === undefined) return false;
  return breakpoints.includes(breakpointKey(eventName, commandLine));
}

export function analyzePreviewVramUsage(state: PreviewRuntimeState): PreviewVramUsage {
  const uniqueTileIDs = new Set<number>();
  let bgPaintedTiles = 0;

  if (state.currentRoom) {
    for (const layer of activeGbaBackgroundLayers(state.currentRoom.renderLayers)) {
      bgPaintedTiles += layer.paintedTileCount;
      for (const tileID of layer.tileCells) {
        if (tileID > 0) uniqueTileIDs.add(tileID);
      }
    }
  }

  const spriteActors = state.actors.filter((actor) => actor.visible && actor.animationFrame);
  const playerFrame = state.player?.animationFrame;
  const objSpriteCount = spriteActors.length + (playerFrame ? 1 : 0);
  const objBytes = [
    ...spriteActors.map((actor) => actor.animationFrame?.tileCount ?? 0),
    playerFrame?.tileCount ?? 0
  ].reduce((total, tileCount) => total + tileCount * gbaTileBytes4bpp, 0);

  const bgBytes = uniqueTileIDs.size * gbaTileBytes4bpp;

  return {
    bgBytes,
    bgPaintedTiles,
    bgUniqueTiles: uniqueTileIDs.size,
    objBytes,
    objSpriteCount,
    totalBytes: bgBytes + objBytes,
    budgetBytes: gbaVramTotalBytes
  };
}

export function formatPreviewDebuggerVariableValue(value: PreviewRuntimeScalar | undefined): string {
  if (value === undefined) return "-";
  if (typeof value === "string") return value.length > 0 ? value : "\"\"";
  return String(value);
}

export function parsePreviewDebuggerVariableInput(raw: string): PreviewRuntimeScalar {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase() === "true") return true;
  if (trimmed.toLowerCase() === "false") return false;
  const parsed = Number(trimmed);
  if (Number.isFinite(parsed) && trimmed !== "") return parsed;
  return raw;
}

function liveVariableNames(project: GBAProjectData, runtime: PreviewRuntimeState): string[] {
  const declared = listProjectVariables(project).map((entry) => entry.name);
  const runtimeKeys = Object.keys(runtime.variables);
  return [...new Set([...declared, ...runtimeKeys])].sort((left, right) => left.localeCompare(right));
}

export function deriveGbaDebuggerPresentation(
  runtime: PreviewRuntimeState,
  project: GBAProjectData = runtime.project
): GbaDebuggerPresentation {
  const scriptFrame = runtime.debugger.scriptFrame;
  const scriptPosition = scriptFrame
    ? {
        eventName: scriptFrame.resolvedEventName,
        commandIndex: scriptFrame.commandIndex,
        command: scriptFrame.commands[scriptFrame.commandIndex - 1] ?? "-"
      }
    : null;

  const declaredNames = new Set(listProjectVariables(project).map((entry) => entry.name));

  return {
    enabled: runtime.debugger.enabled,
    paused: runtime.debugger.paused,
    pauseReason: runtime.debugger.pauseReason,
    breakpoints: [...runtime.debugger.breakpoints],
    callStack: [...(scriptFrame?.callStack ?? [])],
    scriptPosition,
    vram: analyzePreviewVramUsage(runtime),
    liveVariables: liveVariableNames(project, runtime).map((name) => ({
      name,
      value: formatPreviewDebuggerVariableValue(runtime.variables[name]),
      declared: declaredNames.has(name)
    })),
    watchValues: (() => {
      const settings = project.settings && typeof project.settings === "object" && !Array.isArray(project.settings)
        ? project.settings as Record<string, unknown>
        : {};
      const debug = settings.debug && typeof settings.debug === "object" && !Array.isArray(settings.debug)
        ? settings.debug as Record<string, unknown>
        : {};
      const configured = Array.isArray(debug.watches)
        ? debug.watches.filter((watch): watch is string => typeof watch === "string" && watch.trim().length > 0)
        : [];
      const expressions = configured.length > 0 ? configured : [...declaredNames];
      return expressions.map((expression) => ({
        expression,
        value: formatPreviewDebuggerVariableValue(runtime.variables[expression])
      }));
    })()
  };
}
