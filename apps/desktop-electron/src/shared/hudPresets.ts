import { normalizeHudBehavior, type HudElementBehavior } from "./hudBehavior.js";
import type { GBAProjectData } from "./projectFile.js";
import { applyInterfaceThemeToHudPreset } from "./interfaceThemes.js";

export type HudPresetPosition = "Superior" | "Inferior";
export type HudPresetMode = "standard" | "advanced";
export type HudComponentKind = "frame" | "text" | "bar" | "icon";
export const HUD_VALUE_BINDINGS = ["p1-health", "p2-health", "round-time", "p1-rounds", "p2-rounds", "score", "lives"] as const;
export type HudValueBinding = typeof HUD_VALUE_BINDINGS[number];
export const HUD_VALUE_BINDING_LABELS: Record<HudValueBinding, string> = {
  "p1-health":"Vida P1", "p2-health":"Vida P2", "round-time":"Tempo do round",
  "p1-rounds":"Rounds P1", "p2-rounds":"Rounds P2", score:"Pontuação", lives:"Vidas"
};
export type HudCornerAnchor = "freeform" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const HUD_CORNER_ANCHORS: HudCornerAnchor[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right"
];

export interface HudComponent {
  id: string;
  kind: HudComponentKind;
  label: string;
  text: string;
  runtimeText?: boolean;
  valueBinding?: HudValueBinding;
  stateAssets?: string[];
  gauge?: { emptyAsset: string; x: number; y: number; width: number; height: number; reverse?: boolean };
  /** Authored text may use pixel positions; legacy components keep the 8px grid. */
  pixelPosition?: boolean;
  asset: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  visible: boolean;
  anchor?: HudCornerAnchor;
  anchorOffsetX?: number;
  anchorOffsetY?: number;
  behavior?: HudElementBehavior;
}

export interface HudPreset {
  id: string;
  name: string;
  description: string;
  backgroundImage: string;
  selectorImage: string;
  font: string;
  textColor?: number;
  position: HudPresetPosition;
  width: number;
  height: number;
  mode: HudPresetMode;
  showExperienceBar?: boolean;
  showHealthBars?: boolean;
  components: HudComponent[];
}

export interface HudPresetPresentation extends HudPreset {
  builtIn: boolean;
  ready: boolean;
  warning: string | null;
}

export interface HudPresetsWorkspacePresentation {
  presets: HudPresetPresentation[];
  activePresetId: string;
  activePreset: HudPresetPresentation;
}

export type HudPresetBindingSource = "scene" | "room" | "project";
export type HudPresetBindingStatus = "resolved" | "missing";

export const HUD_PRESET_BINDING_SOURCE_LABELS: Record<HudPresetBindingSource, string> = {
  scene: "Tela/menu",
  room: "Sala",
  project: "Projeto"
};

export interface HudPresetBindingRequest {
  roomID?: string;
  /** HUD explicitly selected by the current menu screen or embedded scene. */
  scenePresetId?: unknown;
  /** HUD explicitly selected by the containing room. */
  roomPresetId?: unknown;
}

export interface HudPresetBinding {
  presetId: string;
  preset: HudPresetPresentation;
  source: HudPresetBindingSource;
  status: HudPresetBindingStatus;
  /** Original authoring id when it is not present in the current preset catalog. */
  requestedPresetId: string | null;
}

export function hudPresetBindingSourceLabel(source: HudPresetBindingSource): string {
  return HUD_PRESET_BINDING_SOURCE_LABELS[source];
}

export interface HudPresetBudget {
  visibleComponentCount: number;
  imageBackedIconCount: number;
  fallbackIconCount: number;
  estimatedOamEntries: number;
  estimatedVramTiles: number;
  oamBudget: number;
  vramTileBudget: number;
  status: "ok" | "warning";
}

export interface UpdateHudPresetFields {
  name?: string;
  description?: string;
  backgroundImage?: string;
  selectorImage?: string;
  font?: string;
  position?: HudPresetPosition;
  width?: number;
  height?: number;
  mode?: HudPresetMode;
  showExperienceBar?: boolean;
  showHealthBars?: boolean;
  components?: HudComponent[];
}

export const HUD_DEFAULT_PRESET_ID = "hud-default";
/** Explicit scene opt-in to the current project default. Absence means no scene HUD. */
export const HUD_PROJECT_PRESET_ID = "@project";

export const DEFAULT_HUD_PRESET: HudPreset = {
  id: HUD_DEFAULT_PRESET_ID,
  name: "HUD padrão",
  description: "Barra compacta independente da caixa de diálogo.",
  backgroundImage: "",
  selectorImage: "",
  font: "",
  position: "Superior",
  width: 240,
  height: 24,
  mode: "standard",
  components: []
};

const HUD_VIEWPORT_WIDTH = 240;
const HUD_VIEWPORT_HEIGHT = 160;
const HUD_GRID = 8;
const HUD_OAM_BUDGET = 32;
const HUD_VRAM_TILE_BUDGET = 96;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneProjectData<T>(data: T): T {
  return globalThis.structuredClone
    ? globalThis.structuredClone(data)
    : (JSON.parse(JSON.stringify(data)) as T);
}

function projectSettings(data: GBAProjectData): Record<string, unknown> {
  return isRecord(data.settings) ? data.settings : {};
}

function ensureProjectSettings(data: GBAProjectData): Record<string, unknown> {
  if (!isRecord(data.settings)) data.settings = {};
  return data.settings as Record<string, unknown>;
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberField(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
}

function positionField(value: unknown, fallback: HudPresetPosition): HudPresetPosition {
  return value === "Inferior" ? "Inferior" : value === "Superior" ? "Superior" : fallback;
}

function modeField(value: unknown, fallback: HudPresetMode): HudPresetMode {
  return value === "advanced" ? "advanced" : value === "standard" ? "standard" : fallback;
}

function componentKind(value: unknown): HudComponentKind {
  return value === "text" || value === "bar" || value === "icon" ? value : "frame";
}

function componentAnchor(value: unknown): HudCornerAnchor {
  return value === "top-left" || value === "top-right" || value === "bottom-left" || value === "bottom-right"
    ? value
    : "freeform";
}

function anchoredPosition(
  anchor: HudCornerAnchor,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number
): { x: number; y: number } {
  return {
    x: anchor === "top-right" || anchor === "bottom-right"
      ? HUD_VIEWPORT_WIDTH - width - offsetX
      : offsetX,
    y: anchor === "bottom-left" || anchor === "bottom-right"
      ? HUD_VIEWPORT_HEIGHT - height - offsetY
      : offsetY
  };
}

export function hudAnchorOffsetsForComponent(
  component: Pick<HudComponent, "x" | "y" | "width" | "height">,
  anchor: HudCornerAnchor
): { x: number; y: number } {
  if (anchor === "freeform") return { x: component.x, y: component.y };
  return {
    x: anchor === "top-right" || anchor === "bottom-right"
      ? HUD_VIEWPORT_WIDTH - component.width - component.x
      : component.x,
    y: anchor === "bottom-left" || anchor === "bottom-right"
      ? HUD_VIEWPORT_HEIGHT - component.height - component.y
      : component.y
  };
}

function snap(value: number, minimum: number, maximum: number, grid = HUD_GRID): number {
  const snapped = Math.round(value / grid) * grid;
  return Math.max(minimum, Math.min(maximum, snapped));
}

function normalizeHudComponent(value: unknown, index: number): HudComponent | null {
  if (!isRecord(value)) return null;
  const width = snap(numberField(value.width, HUD_GRID), HUD_GRID, HUD_VIEWPORT_WIDTH);
  const height = snap(numberField(value.height, HUD_GRID), HUD_GRID, HUD_VIEWPORT_HEIGHT);
  const anchor = componentAnchor(value.anchor);
  const pixelPosition = value.pixelPosition === true && componentKind(value.kind) === "text";
  const positionGrid = pixelPosition ? 1 : HUD_GRID;
  const rawX = snap(numberField(value.x, 0), 0, HUD_VIEWPORT_WIDTH - width, positionGrid);
  const rawY = snap(numberField(value.y, 0), 0, HUD_VIEWPORT_HEIGHT - height, positionGrid);
  const offsetX = snap(numberField(value.anchorOffsetX, rawX), 0, HUD_VIEWPORT_WIDTH - width, positionGrid);
  const offsetY = snap(numberField(value.anchorOffsetY, rawY), 0, HUD_VIEWPORT_HEIGHT - height, positionGrid);
  const position = anchor === "freeform"
    ? { x: rawX, y: rawY }
    : anchoredPosition(anchor, width, height, offsetX, offsetY);
  return {
    id: stringField(value.id, `hud-component-${index + 1}`),
    kind: componentKind(value.kind),
    label: stringField(value.label, `Elemento ${index + 1}`),
    text: typeof value.text === "string" ? value.text : "",
    ...(value.runtimeText === true ? {runtimeText:true} : {}),
    ...(HUD_VALUE_BINDINGS.includes(value.valueBinding as HudValueBinding) ? {valueBinding:value.valueBinding as HudValueBinding} : {}),
    ...(Array.isArray(value.stateAssets) ? {stateAssets:value.stateAssets.filter((v): v is string => typeof v === "string").slice(0,2)} : {}),
    ...(isRecord(value.gauge) ? {gauge: {
      emptyAsset:stringField(value.gauge.emptyAsset,""),
      x:Math.max(0,Math.round(numberField(value.gauge.x,0))), y:Math.max(0,Math.round(numberField(value.gauge.y,0))),
      width:Math.max(1,Math.round(numberField(value.gauge.width,1))), height:Math.max(1,Math.round(numberField(value.gauge.height,1))),
      ...(value.gauge.reverse === true ? {reverse:true} : {})
    }} : {}),
    ...(pixelPosition ? {pixelPosition:true} : {}),
    asset: typeof value.asset === "string" ? value.asset.trim() : "",
    x: position.x,
    y: position.y,
    width,
    height,
    zIndex: Math.max(0, Math.min(15, numberField(value.zIndex, index))),
    visible: value.visible !== false,
    ...(value.behavior ? { behavior: normalizeHudBehavior(value.behavior) } : {}),
    anchor,
    anchorOffsetX: anchor === "freeform" ? position.x : offsetX,
    anchorOffsetY: anchor === "freeform" ? position.y : offsetY
  };
}

function normalizeHudComponents(value: unknown): HudComponent[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value
    .map((component, index) => normalizeHudComponent(component, index))
    .filter((component): component is HudComponent => {
      if (!component || ids.has(component.id)) return false;
      ids.add(component.id);
      return true;
    });
}

function normalizeHudPreset(value: unknown, index: number, builtIn: boolean): HudPresetPresentation | null {
  if (!isRecord(value)) return null;
  const id = stringField(value.id, `hud-preset-${index + 1}`);
  const preset: HudPreset = {
    id,
    name: stringField(value.name, `HUD ${index + 1}`),
    description: stringField(value.description, "Preset de HUD para a cena."),
    backgroundImage: stringField(value.backgroundImage, ""),
    selectorImage: stringField(value.selectorImage, ""),
    font: stringField(value.font, ""),
    position: positionField(value.position, "Superior"),
    width: Math.max(24, Math.min(240, numberField(value.width, 240))),
    height: Math.max(8, Math.min(160, numberField(value.height, 24))),
    mode: modeField(value.mode, "standard"),
    ...(Number.isInteger(value.textColor) ? {textColor: Math.max(0, Math.min(32767, Number(value.textColor)))} : {}),
    ...(typeof value.showExperienceBar === "boolean" ? { showExperienceBar: value.showExperienceBar } : {}),
    ...(typeof value.showHealthBars === "boolean" ? { showHealthBars: value.showHealthBars } : {}),
    components: normalizeHudComponents(value.components)
  };
  const warning = preset.mode === "advanced" && preset.components.length === 0
    ? "Adicione pelo menos um elemento móvel para concluir a HUD avançada."
    : preset.backgroundImage
      ? null
      : "Usa a skin procedural independente; escolha uma imagem 24×24 para personalizar.";
  return { ...preset, builtIn, ready: warning === null || preset.mode === "advanced" && preset.components.length > 0, warning };
}

function persistedHudPresets(data: GBAProjectData): HudPresetPresentation[] {
  const settings = projectSettings(data);
  const values = Array.isArray(settings.hudPresets) ? settings.hudPresets : [];
  const presets = values
    .map((value, index) => normalizeHudPreset(value, index, false))
    .filter((value): value is HudPresetPresentation => Boolean(value));
  const hasDefault = presets.some((preset) => preset.id === HUD_DEFAULT_PRESET_ID);
  if (hasDefault) {
    return presets.map((preset) => preset.id === HUD_DEFAULT_PRESET_ID ? { ...preset, builtIn: true } : preset);
  }
  return [normalizeHudPreset(DEFAULT_HUD_PRESET, 0, true)!, ...presets];
}

export function deriveHudPresetsWorkspacePresentation(data: GBAProjectData): HudPresetsWorkspacePresentation {
  const presets = persistedHudPresets(data);
  const requestedID = stringField(projectSettings(data).hudPresetId, HUD_DEFAULT_PRESET_ID);
  const activePreset = presets.find((preset) => preset.id === requestedID) ?? presets[0] ?? normalizeHudPreset(DEFAULT_HUD_PRESET, 0, true)!;
  return {
    presets,
    activePresetId: activePreset.id,
    activePreset
  };
}

export function deriveHudPresetBudget(preset: HudPreset): HudPresetBudget {
  const visibleComponents = preset.components.filter((component) => component.visible);
  const imageBackedIcons = visibleComponents.filter((component) => component.kind === "icon" && component.asset);
  const fallbackIcons = visibleComponents.filter((component) => component.kind === "icon" && !component.asset);
  const estimatedOamEntries = visibleComponents.filter((component) => component.kind === "icon" || component.kind === "text").length;
  const estimatedVramTiles = imageBackedIcons.reduce((total, component) => (
    total + Math.ceil(component.width / HUD_GRID) * Math.ceil(component.height / HUD_GRID)
  ), 0);

  return {
    visibleComponentCount: visibleComponents.length,
    imageBackedIconCount: imageBackedIcons.length,
    fallbackIconCount: fallbackIcons.length,
    estimatedOamEntries,
    estimatedVramTiles,
    oamBudget: HUD_OAM_BUDGET,
    vramTileBudget: HUD_VRAM_TILE_BUDGET,
    status: estimatedOamEntries > HUD_OAM_BUDGET || estimatedVramTiles > HUD_VRAM_TILE_BUDGET || fallbackIcons.length > 0
      ? "warning"
      : "ok"
  };
}

function resolveUnthemedHudPresetBinding(
  data: GBAProjectData,
  request: HudPresetBindingRequest = {}
): HudPresetBinding {
  const presentation = deriveHudPresetsWorkspacePresentation(data);
  const candidates: Array<[HudPresetBindingSource, unknown]> = [
    ["scene", request.scenePresetId],
    ["room", request.roomPresetId]
  ];
  let requestedPresetId: string | null = null;
  for (const [source, value] of candidates) {
    const presetID = stringField(value, "");
    if (!presetID) continue;
    if (presetID === HUD_PROJECT_PRESET_ID) {
      return { presetId: presentation.activePreset.id, preset: presentation.activePreset,
        source: "project", status: "resolved", requestedPresetId: HUD_PROJECT_PRESET_ID };
    }
    requestedPresetId ??= presetID;
    const preset = presentation.presets.find((candidate) => candidate.id === presetID);
    if (preset) {
      return {
        presetId: preset.id,
        preset,
        source,
        status: "resolved",
        requestedPresetId: preset.id
      };
    }
  }
  return {
    presetId: presentation.activePreset.id,
    preset: presentation.activePreset,
    source: "project",
    status: requestedPresetId ? "missing" : "resolved",
    requestedPresetId
  };
}

export function resolveHudPresetBinding(data: GBAProjectData, request: HudPresetBindingRequest = {}): HudPresetBinding {
  const binding = resolveUnthemedHudPresetBinding(data, request);
  return { ...binding, preset: applyInterfaceThemeToHudPreset(data, request.roomID, binding.preset) };
}

/**
 * Resolves only an explicit scene or room binding.
 *
 * The project active preset remains useful in authoring workspaces that edit
 * HUDs, but a scene canvas must not suggest that a HUD will render when the
 * runtime has no scene/room binding for it.
 */
export function resolveExplicitHudPresetBinding(
  data: GBAProjectData,
  request: HudPresetBindingRequest = {}
): HudPresetBinding | null {
  const hasSceneBinding = stringField(request.scenePresetId, "");
  const hasRoomBinding = stringField(request.roomPresetId, "");
  if (!hasSceneBinding && !hasRoomBinding) return null;
  return resolveHudPresetBinding(data, request);
}

export function resolveHudPresetForRoom(data: GBAProjectData, room: Record<string, unknown> | null | undefined): HudPresetPresentation {
  return resolveHudPresetBinding(data, { roomID: typeof room?.id === "string" ? room.id : undefined, roomPresetId: room?.hudPresetId }).preset;
}

function ensurePersistedHudPresets(data: GBAProjectData): Record<string, unknown>[] {
  const settings = ensureProjectSettings(data);
  const current = Array.isArray(settings.hudPresets) ? settings.hudPresets.filter(isRecord) : [];
  if (!current.some((preset) => stringField(preset.id, "") === HUD_DEFAULT_PRESET_ID)) {
    settings.hudPresets = [DEFAULT_HUD_PRESET, ...current];
  } else {
    settings.hudPresets = current;
  }
  return settings.hudPresets as Record<string, unknown>[];
}

export function setActiveHudPresetInProject(data: GBAProjectData, presetID: string): GBAProjectData {
  const next = cloneProjectData(data);
  const presentation = deriveHudPresetsWorkspacePresentation(next);
  if (!presentation.presets.some((preset) => preset.id === presetID)) return data;
  ensureProjectSettings(next).hudPresetId = presetID;
  return next;
}

export function updateHudPresetInProject(data: GBAProjectData, presetID: string, fields: UpdateHudPresetFields): GBAProjectData {
  const next = cloneProjectData(data);
  const presets = ensurePersistedHudPresets(next);
  const preset = presets.find((candidate) => stringField(candidate.id, "") === presetID);
  if (!preset || presetID === HUD_DEFAULT_PRESET_ID) return data;
  if (fields.name !== undefined) preset.name = fields.name.trim();
  if (fields.description !== undefined) preset.description = fields.description.trim();
  if (fields.backgroundImage !== undefined) preset.backgroundImage = fields.backgroundImage.trim();
  if (fields.selectorImage !== undefined) preset.selectorImage = fields.selectorImage.trim();
  if (fields.font !== undefined) preset.font = fields.font.trim();
  if (fields.position !== undefined) preset.position = fields.position;
  if (fields.width !== undefined && Number.isFinite(fields.width)) preset.width = Math.max(24, Math.min(240, Math.round(fields.width)));
  if (fields.height !== undefined && Number.isFinite(fields.height)) preset.height = Math.max(8, Math.min(160, Math.round(fields.height)));
  if (fields.mode !== undefined) preset.mode = fields.mode;
  if (fields.showExperienceBar !== undefined) preset.showExperienceBar = fields.showExperienceBar;
  if (fields.showHealthBars !== undefined) preset.showHealthBars = fields.showHealthBars;
  if (fields.components !== undefined) preset.components = fields.components.map((component, index) => normalizeHudComponent(component, index)).filter((component): component is HudComponent => Boolean(component));
  return next;
}

function defaultAdvancedHudComponents(source: HudPresetPresentation): HudComponent[] {
  const y = source.position === "Inferior" ? HUD_VIEWPORT_HEIGHT - source.height : 0;
  return [
    {
      id: "hud-frame",
      kind: "frame",
      label: "Moldura",
      text: "",
      asset: source.backgroundImage,
      x: 0,
      y,
      width: source.width,
      height: source.height,
      zIndex: 0,
      visible: true
    },
    {
      id: "hud-status",
      kind: "text",
      label: "Status",
      text: "HP 03",
      asset: "",
      x: 8,
      y: y + 8,
      width: 64,
      height: 8,
      zIndex: 1,
      visible: true
    },
    {
      id: "hud-action",
      kind: "text",
      label: "Ação",
      text: "A: confirmar",
      asset: "",
      x: Math.max(0, source.width - 104),
      y: y + 8,
      width: 96,
      height: 8,
      zIndex: 1,
      visible: true
    }
  ];
}

export function createAdvancedHudPresetInProject(data: GBAProjectData, sourceID: string, newID: string, newName: string): GBAProjectData {
  const next = cloneProjectData(data);
  const presentation = deriveHudPresetsWorkspacePresentation(next);
  const source = presentation.presets.find((preset) => preset.id === sourceID);
  const trimmedID = newID.trim();
  if (!source || !trimmedID || trimmedID === HUD_PROJECT_PRESET_ID || presentation.presets.some((preset) => preset.id === trimmedID)) return data;
  const presets = ensurePersistedHudPresets(next);
  presets.push({
    ...source,
    id: trimmedID,
    name: newName.trim() || `${source.name} avançada`,
    mode: "advanced",
    components: source.mode === "advanced" && source.components.length > 0
      ? source.components.map((component) => ({ ...component }))
      : defaultAdvancedHudComponents(source)
  });
  return next;
}

export function duplicateHudPresetInProject(data: GBAProjectData, sourceID: string, newID: string, newName: string): GBAProjectData {
  const next = cloneProjectData(data);
  const presentation = deriveHudPresetsWorkspacePresentation(next);
  const source = presentation.presets.find((preset) => preset.id === sourceID);
  const trimmedID = newID.trim();
  if (!source || !trimmedID || trimmedID === HUD_PROJECT_PRESET_ID || presentation.presets.some((preset) => preset.id === trimmedID)) return data;
  const presets = ensurePersistedHudPresets(next);
  presets.push({ ...source, id: trimmedID, name: newName.trim() || `${source.name} cópia` });
  return next;
}

export function removeHudPresetInProject(data: GBAProjectData, presetID: string): GBAProjectData {
  if (!presetID || presetID === HUD_DEFAULT_PRESET_ID) return data;
  const next = cloneProjectData(data);
  const settings = ensureProjectSettings(next);
  const current = Array.isArray(settings.hudPresets) ? settings.hudPresets.filter(isRecord) : [];
  if (!current.some((preset) => stringField(preset.id, "") === presetID)) return data;
  settings.hudPresets = current.filter((preset) => stringField(preset.id, "") !== presetID);
  if (settings.hudPresetId === presetID) settings.hudPresetId = HUD_DEFAULT_PRESET_ID;
  return next;
}
