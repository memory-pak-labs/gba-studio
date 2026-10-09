import type { GBAProjectData } from "./projectFile.js";
import { updateRoomFieldsInProject } from "./roomsWorkspace.js";
import { createAdvancedHudPresetInProject, deriveHudPresetsWorkspacePresentation, HUD_PROJECT_PRESET_ID, hudAnchorOffsetsForComponent, type HudComponent } from "./hudPresets.js";
export { HUD_PROJECT_PRESET_ID } from "./hudPresets.js";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function scenes(data: GBAProjectData): Record<string, unknown>[] {
  return (Array.isArray(data.scenas) ? data.scenas : Array.isArray(data.rooms) ? data.rooms : []).map(record);
}

export function hudPresetUsages(data: GBAProjectData, presetID: string): Array<{ id: string; name: string }> {
  const activeID = deriveHudPresetsWorkspacePresentation(data).activePresetId;
  const contains = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(contains);
    return Object.entries(record(value)).some(([key, item]) => key === "hudPresetId"
      ? item === presetID || (item === HUD_PROJECT_PRESET_ID && presetID === activeID)
      : typeof item === "object" && contains(item));
  };
  return scenes(data).filter(contains).map(scene => ({ id: String(scene.id ?? scene.name), name: String(scene.name ?? scene.id) }));
}

/** Commit a scene binding and its menu override as one undoable project change. */
export function bindSceneHudInProject(data: GBAProjectData, roomID: string, presetID: string | null, screenID?: string): GBAProjectData {
  const scene = scenes(data).find(scene => scene.id === roomID || scene.name === roomID);
  if (!scene) return data;
  if (presetID && presetID !== HUD_PROJECT_PRESET_ID && !deriveHudPresetsWorkspacePresentation(data).presets.some(preset => preset.id === presetID)) return data;
  const runtime = record(scene.runtime);
  const config = record(runtime.config);
  if (screenID && (runtime.type !== "menu" || !Array.isArray(config.screens) || !config.screens.some(screen => record(screen).id === screenID))) return data;
  const hudConfig = (source: Record<string, unknown>) => {
    const next: Record<string, unknown> = { ...source };
    if (presetID) { next.hudPresetId = presetID; delete next.hudMode; }
    else { delete next.hudPresetId; next.hudMode = "none"; }
    return next;
  };
  if (runtime.type === "menu") {
    const nextConfig = screenID && Array.isArray(config.screens)
      ? { ...config, screens: config.screens.map(screen => record(screen).id === screenID ? hudConfig(record(screen)) : screen) }
      : hudConfig(config);
    return updateRoomFieldsInProject(data, roomID, {
      ...(screenID ? {} : { hudPresetId: presetID }),
      runtime: { ...runtime, config: nextConfig } as Parameters<typeof updateRoomFieldsInProject>[2]["runtime"]
    });
  }
  return updateRoomFieldsInProject(data, roomID, { hudPresetId: presetID });
}

export function createSceneHudVariationInProject(data: GBAProjectData, roomID: string, sourceID: string, newID: string, name: string, screenID?: string): GBAProjectData {
  if (!scenes(data).some(scene => scene.id === roomID || scene.name === roomID) || newID === HUD_PROJECT_PRESET_ID) return data;
  const created = createAdvancedHudPresetInProject(data, sourceID, newID, name);
  if (created === data) return data;
  const bound = bindSceneHudInProject(created, roomID, newID.trim(), screenID);
  return bound === created ? data : bound;
}

export function updateHudComponentGeometry(component: HudComponent, fields: Partial<Pick<HudComponent, "x" | "y" | "width" | "height">>): HudComponent {
  const snap = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value / 8) * 8));
  const width = snap(fields.width ?? component.width, 8, 240);
  const height = snap(fields.height ?? component.height, 8, 160);
  if (fields.x !== undefined || fields.y !== undefined || !component.anchor || component.anchor === "freeform") {
    const x = snap(fields.x ?? component.x, 0, 240 - width);
    const y = snap(fields.y ?? component.y, 0, 160 - height);
    return { ...component, width, height, x, y, anchor: "freeform", anchorOffsetX: x, anchorOffsetY: y };
  }
  const right = component.anchor.endsWith("right");
  const bottom = component.anchor.startsWith("bottom");
  const offsets = hudAnchorOffsetsForComponent(component, component.anchor);
  const xOffset = component.anchorOffsetX ?? offsets.x;
  const yOffset = component.anchorOffsetY ?? offsets.y;
  return { ...component, width, height,
    x: snap(right ? 240 - width - xOffset : xOffset, 0, 240 - width),
    y: snap(bottom ? 160 - height - yOffset : yOffset, 0, 160 - height) };
}
