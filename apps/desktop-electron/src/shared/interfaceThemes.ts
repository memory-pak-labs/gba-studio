import type { GBAProjectData } from "./projectFile.js";
import type { HudPresetPresentation } from "./hudPresets.js";
import { resolveDialogueUiSettings } from "./sceneRuntimeExport.js";

export interface InterfaceTheme { id: string; name: string; hudImage: string; boxImage: string }
export type InterfaceThemeScope = "scene" | "type" | "project";
export interface InterfaceThemeBindingChange { scope: InterfaceThemeScope; roomId?: string; themeId: string }
export interface InterfaceThemeSkinChange { scope: InterfaceThemeScope; roomId?: string; field: "hudImage" | "boxImage"; image: string }
export type InterfaceThemeChange = InterfaceThemeBindingChange | InterfaceThemeSkinChange;
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const string = (v: unknown): string => typeof v === "string" ? v.trim() : "";
export function interfaceThemeRooms(data: GBAProjectData): Record<string, unknown>[] {
  return (Array.isArray(data.scenas) ? data.scenas : Array.isArray(data.rooms) ? data.rooms : []).map(record);
}
export function interfaceThemeCatalog(data: GBAProjectData) {
  const settings = record(record(data.settings).interfaceThemes);
  const themes: InterfaceTheme[] = (Array.isArray(settings.themes) ? settings.themes : []).map(value => {
    const v = record(value);
    return { id: string(v.id), name: string(v.name), hudImage: string(v.hudImage), boxImage: string(v.boxImage) };
  }).filter(t => t.id && t.id !== "@project");
  return { themes, defaultThemeId: string(settings.defaultThemeId), sceneTypeThemeIds: record(settings.sceneTypeThemeIds) };
}
export function resolveInterfaceTheme(data: GBAProjectData, roomId?: string) {
  const catalog = interfaceThemeCatalog(data);
  const room = interfaceThemeRooms(data).find(r => r.id === roomId || r.name === roomId);
  const local = string(room?.interfaceThemeId);
  const byType = string(catalog.sceneTypeThemeIds[string(room?.sceneType)]);
  const source: InterfaceThemeScope = local && local !== "@project" ? "scene" : !local && byType ? "type" : "project";
  const themeId = source === "scene" ? local : source === "type" ? byType : catalog.defaultThemeId;
  return { source, themeId, theme: catalog.themes.find(t => t.id === themeId) ?? null, room,
    missing: Boolean(themeId && !catalog.themes.some(t => t.id === themeId)) };
}
export function interfaceSkinAssets(data: GBAProjectData) {
  return (Array.isArray(data.assets) ? data.assets : []).map(record).filter(asset => {
    const metadata = record(asset.metadata);
    return Number(metadata.width ?? asset.width) === 24 && Number(metadata.height ?? asset.height) === 24;
  });
}
export function applyInterfaceThemeToHudPreset(data: GBAProjectData, roomId: string | undefined, preset: HudPresetPresentation): HudPresetPresentation {
  const backgroundImage = preset.backgroundImage || resolveInterfaceTheme(data, roomId).theme?.hudImage;
  if (!backgroundImage || backgroundImage === preset.backgroundImage) return preset;
  const emptyLayout = preset.mode === "advanced" && preset.components.length === 0;
  return { ...preset, backgroundImage, warning: emptyLayout ? preset.warning : null, ready: !emptyLayout };
}
export function resolveSceneDialogueUiSettings(data: GBAProjectData, roomId?: string) {
  const ui = record(record(data.settings).uiDialogs);
  const boxImage = resolveInterfaceTheme(data, roomId).theme?.boxImage;
  return resolveDialogueUiSettings({ ...ui, ...(boxImage ? { boxImage } : {}) });
}
export function updateInterfaceThemeBinding(data: GBAProjectData, change: InterfaceThemeBindingChange): GBAProjectData {
  const id = change.themeId.trim();
  if (id && id !== "@project" && !interfaceThemeCatalog(data).themes.some(t => t.id === id)) return data;
  if (id === "@project" && change.scope !== "scene") return data;
  const next = structuredClone(data);
  const room = interfaceThemeRooms(next).find(r => r.id === change.roomId || r.name === change.roomId);
  if (change.scope !== "project" && !room) return data;
  const settings = record(next.settings); next.settings = settings;
  const config = record(settings.interfaceThemes); settings.interfaceThemes = config;
  if (change.scope === "scene") {
    // Some persisted projects retain both aliases. Change only the matching field in each.
    for (const collection of [next.scenas, next.rooms, [next.scena]]) {
      if (!Array.isArray(collection)) continue;
      for (const value of collection) {
        const target = record(value);
        if (target.id !== change.roomId && target.name !== change.roomId) continue;
        if (id) target.interfaceThemeId = id; else delete target.interfaceThemeId;
      }
    }
  }
  else if (change.scope === "type") {
    const types = record(config.sceneTypeThemeIds); config.sceneTypeThemeIds = types;
    if (id) types[string(room!.sceneType)] = id; else delete types[string(room!.sceneType)];
  } else { if (id) config.defaultThemeId = id; else delete config.defaultThemeId; }
  return next;
}
export function updateInterfaceThemeSkin(data: GBAProjectData, change: InterfaceThemeSkinChange): GBAProjectData {
  if (change.image && !interfaceSkinAssets(data).some(a => a.name === change.image)) return data;
  const resolved = resolveInterfaceTheme(data, change.roomId);
  if (change.scope !== "project" && !resolved.room) return data;
  const catalog = interfaceThemeCatalog(data);
  const targetId = change.scope === "project" ? catalog.defaultThemeId : change.scope === "type"
    ? string(catalog.sceneTypeThemeIds[string(resolved.room?.sceneType)]) : resolved.themeId;
  const source = catalog.themes.find(t => t.id === targetId) ?? (change.scope === "scene" ? resolved.theme : catalog.themes.find(t => t.id === catalog.defaultThemeId));
  const prefix = `custom-${change.scope}-${change.scope === "project" ? "default" : string(change.scope === "type" ? resolved.room?.sceneType : resolved.room?.id ?? resolved.room?.name)}`;
  const usedOutsideTarget = (id: string) =>
    (change.scope !== "project" && catalog.defaultThemeId === id) ||
    Object.entries(catalog.sceneTypeThemeIds).some(([type, value]) => value === id && !(change.scope === "type" && type === string(resolved.room?.sceneType))) ||
    interfaceThemeRooms(data).some(room => room.interfaceThemeId === id && !(change.scope === "scene" && room === resolved.room));
  let id = targetId.startsWith(prefix) && !usedOutsideTarget(targetId) ? targetId : prefix;
  let suffix = 2;
  while (catalog.themes.some(theme => theme.id === id) && (id !== targetId || usedOutsideTarget(id))) id = `${prefix}-${suffix++}`;
  const next = structuredClone(data);
  const settings = record(next.settings); next.settings = settings;
  const config = record(settings.interfaceThemes); settings.interfaceThemes = config;
  config.themes = [...catalog.themes.filter(t => t.id !== id), {
    id, name: `Personalizado · ${change.scope === "project" ? "Projeto" : change.scope === "type" ? string(resolved.room?.sceneType) : string(resolved.room?.name)}`,
    hudImage: source?.hudImage ?? "", boxImage: source?.boxImage ?? "", [change.field]: change.image.trim()
  }];
  return updateInterfaceThemeBinding(next, { scope: change.scope, roomId: change.roomId, themeId: id });
}
export function updateInterfaceThemeInProject(data: GBAProjectData, change: InterfaceThemeChange): GBAProjectData {
  return "field" in change ? updateInterfaceThemeSkin(data, change) : updateInterfaceThemeBinding(data, change);
}
