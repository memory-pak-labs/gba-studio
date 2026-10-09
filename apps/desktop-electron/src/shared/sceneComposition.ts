import type { GbaVideoModeId } from "./gbaVideoModes.js";
import {
  normalizeAffineScenePresentation,
  type AffineScenePresentation
} from "./affineScene.js";
import type { ScenePhysicalBudget } from "./sceneFeatureModules.js";

export const SCENE_COMPOSITION_MODES = ["tilemap", "affine", "bitmap3", "bitmap4", "bitmap5"] as const;
export type SceneCompositionMode = typeof SCENE_COMPOSITION_MODES[number];
export type SceneCompositionLayerKind = "regular_bg" | "affine_bg" | "bitmap";
export type SceneCompositionLayerRole = "gameplay" | "decorative";
export type SceneCompositionGbaLayer = "BG0" | "BG1" | "BG2" | "BG3" | "BITMAP";
export type SceneCompositionBlendMode = "none" | "alpha" | "brighten" | "darken";
export type SceneCompositionTarget = "BG0" | "BG1" | "BG2" | "BG3" | "OBJ" | "BACKDROP";
export type SceneCompositionFallback = "error" | "tiled_default" | "omit_decorative";

export interface SceneCompositionParallax {
  x256: number;
  y256: number;
}

export interface SceneCompositionScroll {
  x: number;
  y: number;
}

export interface SceneCompositionAffineTransform {
  rotationDegrees: number;
  scaleX: number;
  scaleY: number;
  pivotX: number;
  pivotY: number;
  wrap: boolean;
}

export interface SceneCompositionLayer {
  id: string;
  kind: SceneCompositionLayerKind;
  role: SceneCompositionLayerRole;
  layer: SceneCompositionGbaLayer;
  enabled: boolean;
  priority: 0 | 1 | 2 | 3;
  assetId: string;
  parallax: SceneCompositionParallax;
  scroll: SceneCompositionScroll;
  affine?: SceneCompositionAffineTransform;
  bitmapPage: 0 | 1;
}

export interface SceneCompositionBlend {
  enabled: boolean;
  mode: SceneCompositionBlendMode;
  firstTargets: SceneCompositionTarget[];
  secondTargets: SceneCompositionTarget[];
  eva: number;
  evb: number;
  intensity: number;
}

export interface SceneCompositionMosaic {
  enabled: boolean;
  bgX: number;
  bgY: number;
  objX: number;
  objY: number;
}

export interface SceneCompositionWindow {
  enabled: boolean;
  left: number;
  right: number;
  top: number;
  bottom: number;
  insideTargets: SceneCompositionTarget[];
  outsideTargets: SceneCompositionTarget[];
}

export interface SceneCompositionHBlank {
  enabled: boolean;
  layer: "BG1" | "BG2" | "BG3";
  hdma: boolean;
  scrollOffsets: number[];
  timeline?: SceneCompositionHBlankKeyframe[];
}

export interface SceneCompositionHBlankKeyframe {
  frame: number;
  scrollOffsets: number[];
}

export interface SceneCompositionEffects {
  blend: SceneCompositionBlend;
  mosaic: SceneCompositionMosaic;
  window0: SceneCompositionWindow;
  window1: SceneCompositionWindow;
  hblank: SceneCompositionHBlank;
}

export interface SceneCompositionConfig {
  schema: 1;
  enabled: boolean;
  mode: SceneCompositionMode;
  layers: SceneCompositionLayer[];
  effects: SceneCompositionEffects;
  fallback: SceneCompositionFallback;
  budget: ScenePhysicalBudget;
}

export type SceneCompositionIssueCode =
  | "INVALID_COMPOSITION"
  | "INVALID_MODE"
  | "MODE_LAYER_INCOMPATIBLE"
  | "INVALID_LAYER"
  | "DUPLICATE_LAYER"
  | "MISSING_LAYER_ASSET"
  | "GAMEPLAY_LAYER_UNSUPPORTED"
  | "INVALID_PRIORITY"
  | "INVALID_PARALLAX"
  | "INVALID_AFFINE_LAYER"
  | "INVALID_BITMAP_LAYER"
  | "INVALID_EFFECT"
  | "INVALID_WINDOW"
  | "INVALID_HBLANK"
  | "INVALID_HBLANK_TIMELINE"
  | "INVALID_BUDGET";

export interface SceneCompositionIssue {
  code: SceneCompositionIssueCode;
  layerId?: string;
  field?: string;
  message: string;
}

export interface ExportedSceneComposition {
  schema: 1;
  enabled: boolean;
  mode: SceneCompositionMode;
  display_mode: GbaVideoModeId;
  default_tiled: boolean;
  fallback: SceneCompositionFallback;
  layers: Array<{
    id: string;
    kind: SceneCompositionLayerKind;
    role: SceneCompositionLayerRole;
    layer: SceneCompositionGbaLayer;
    asset: string | null;
    priority: 0 | 1 | 2 | 3;
    parallax_x256: number;
    parallax_y256: number;
    scroll_x: number;
    scroll_y: number;
    bitmap_page: 0 | 1;
    affine: {
      rotation_degrees: number;
      scale_x: number;
      scale_y: number;
      pivot_x: number;
      pivot_y: number;
      wrap: boolean;
    } | null;
  }>;
  effects: {
    blend: {
      enabled: boolean;
      mode: SceneCompositionBlendMode;
      first_targets: SceneCompositionTarget[];
      second_targets: SceneCompositionTarget[];
      eva: number;
      evb: number;
      intensity: number;
    };
    mosaic: SceneCompositionMosaic;
    window0: SceneCompositionWindow;
    window1: SceneCompositionWindow;
    hblank: {
      enabled: boolean;
      layer: "BG1" | "BG2" | "BG3";
      hdma: boolean;
      scroll_offsets: number[];
      timeline?: Array<{ frame: number; scroll_offsets: number[] }>;
    };
  };
  budget: ScenePhysicalBudget;
}

const EMPTY_BUDGET: ScenePhysicalBudget = {
  bgTiles: 0,
  objTiles: 0,
  oam: 0,
  paletteColors: 0,
  vramBytes: 0,
  eventBytes: 0,
  audioBytes: 0,
  dmaBytes: 0,
  vblankTicks: 0,
  cpuWorkTicks: 0
};

const EMPTY_BLEND: SceneCompositionBlend = {
  enabled: false,
  mode: "none",
  firstTargets: [],
  secondTargets: [],
  eva: 8,
  evb: 8,
  intensity: 0
};

const EMPTY_MOSAIC: SceneCompositionMosaic = { enabled: false, bgX: 0, bgY: 0, objX: 0, objY: 0 };
const EMPTY_WINDOW: SceneCompositionWindow = {
  enabled: false,
  left: 0,
  right: 240,
  top: 0,
  bottom: 160,
  insideTargets: [],
  outsideTargets: []
};
const EMPTY_HBLANK: SceneCompositionHBlank = {
  enabled: false,
  layer: "BG2",
  hdma: false,
  scrollOffsets: []
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function integerValue(value: unknown, fallback: number, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  return Math.max(minimum, Math.min(maximum, Math.floor(finiteNumber(value, fallback))));
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function targetList(value: unknown): SceneCompositionTarget[] {
  if (!Array.isArray(value)) return [];
  const allowed: readonly SceneCompositionTarget[] = ["BG0", "BG1", "BG2", "BG3", "OBJ", "BACKDROP"];
  return Array.from(new Set(value.filter((target): target is SceneCompositionTarget => typeof target === "string" && allowed.includes(target as SceneCompositionTarget))));
}

function normalizeBudget(value: unknown): ScenePhysicalBudget {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(Object.keys(EMPTY_BUDGET).map((key) => [
    key,
    integerValue(source[key], EMPTY_BUDGET[key as keyof ScenePhysicalBudget])
  ])) as unknown as ScenePhysicalBudget;
}

function normalizeAffine(value: unknown): SceneCompositionAffineTransform {
  const source = isRecord(value) ? value : {};
  return {
    rotationDegrees: integerValue(source.rotationDegrees ?? source.rotation_degrees, 0, -360, 360),
    scaleX: Math.max(0.0625, Math.min(16, finiteNumber(source.scaleX ?? source.scale_x, 1))),
    scaleY: Math.max(0.0625, Math.min(16, finiteNumber(source.scaleY ?? source.scale_y, 1))),
    pivotX: integerValue(source.pivotX ?? source.pivot_x, 120, -32768, 32767),
    pivotY: integerValue(source.pivotY ?? source.pivot_y, 80, -32768, 32767),
    wrap: booleanValue(source.wrap, true)
  };
}

function normalizeLayer(value: unknown, index: number): SceneCompositionLayer | null {
  if (!isRecord(value)) return null;
  const kind = enumValue(value.kind, ["regular_bg", "affine_bg", "bitmap"] as const, "regular_bg");
  const layer = enumValue(value.layer, ["BG0", "BG1", "BG2", "BG3", "BITMAP"] as const, kind === "bitmap" ? "BITMAP" : "BG2");
  const parallax = isRecord(value.parallax) ? value.parallax : {};
  const scroll = isRecord(value.scroll) ? value.scroll : {};
  const affine = kind === "affine_bg" && (value.affine !== undefined || value.rotationDegrees !== undefined)
    ? normalizeAffine(value.affine ?? value)
    : kind === "affine_bg" ? normalizeAffine(undefined) : undefined;
  return {
    id: stringValue(value.id, `layer_${index + 1}`),
    kind,
    role: enumValue(value.role, ["gameplay", "decorative"] as const, "decorative"),
    layer,
    enabled: booleanValue(value.enabled, true),
    priority: integerValue(value.priority, 2, 0, 3) as 0 | 1 | 2 | 3,
    assetId: stringValue(value.assetId ?? value.asset_id),
    parallax: {
      x256: integerValue(parallax.x256 ?? parallax.x, 256, -1024, 1024),
      y256: integerValue(parallax.y256 ?? parallax.y, 256, -1024, 1024)
    },
    scroll: {
      x: integerValue(scroll.x, 0, -32768, 32767),
      y: integerValue(scroll.y, 0, -32768, 32767)
    },
    ...(affine ? { affine } : {}),
    bitmapPage: integerValue(value.bitmapPage ?? value.bitmap_page, 0, 0, 1) as 0 | 1
  };
}

function normalizeWindow(value: unknown): SceneCompositionWindow {
  const source = isRecord(value) ? value : {};
  return {
    enabled: booleanValue(source.enabled, false),
    left: integerValue(source.left, 0, 0, 240),
    right: integerValue(source.right, 240, 0, 240),
    top: integerValue(source.top, 0, 0, 160),
    bottom: integerValue(source.bottom, 160, 0, 160),
    insideTargets: targetList(source.insideTargets ?? source.inside_targets),
    outsideTargets: targetList(source.outsideTargets ?? source.outside_targets)
  };
}

function normalizeHBlankTimeline(value: unknown): SceneCompositionHBlankKeyframe[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((entry): SceneCompositionHBlankKeyframe | null => {
      if (!isRecord(entry)) return null;
      const rawOffsets = entry.scrollOffsets ?? entry.scroll_offsets;
      return {
        frame: integerValue(entry.frame, 0, 0, 65535),
        scrollOffsets: Array.isArray(rawOffsets)
          ? rawOffsets.map((offset) => integerValue(offset, 0, -32768, 32767)).slice(0, 160)
          : []
      };
    })
    .filter((entry): entry is SceneCompositionHBlankKeyframe => entry !== null);
}

function normalizeEffects(value: unknown): SceneCompositionEffects {
  const source = isRecord(value) ? value : {};
  const blendSource = isRecord(source.blend) ? source.blend : {};
  const mosaicSource = isRecord(source.mosaic) ? source.mosaic : {};
  const hblankSource = isRecord(source.hblank) ? source.hblank : {};
  const rawOffsets = hblankSource.scrollOffsets ?? hblankSource.scroll_offsets;
  const offsets = Array.isArray(rawOffsets)
    ? rawOffsets.map((entry: unknown) => integerValue(entry, 0, -32768, 32767)).slice(0, 160)
    : [];
  const timeline = normalizeHBlankTimeline(hblankSource.timeline ?? hblankSource.hblankTimeline);
  return {
    blend: {
      enabled: booleanValue(blendSource.enabled, false),
      mode: enumValue(blendSource.mode, ["none", "alpha", "brighten", "darken"] as const, "none"),
      firstTargets: targetList(blendSource.firstTargets ?? blendSource.first_targets),
      secondTargets: targetList(blendSource.secondTargets ?? blendSource.second_targets),
      eva: integerValue(blendSource.eva, 8, 0, 16),
      evb: integerValue(blendSource.evb, 8, 0, 16),
      intensity: integerValue(blendSource.intensity, 0, 0, 16)
    },
    mosaic: {
      enabled: booleanValue(mosaicSource.enabled, false),
      bgX: integerValue(mosaicSource.bgX ?? mosaicSource.bg_x, 0, 0, 15),
      bgY: integerValue(mosaicSource.bgY ?? mosaicSource.bg_y, 0, 0, 15),
      objX: integerValue(mosaicSource.objX ?? mosaicSource.obj_x, 0, 0, 15),
      objY: integerValue(mosaicSource.objY ?? mosaicSource.obj_y, 0, 0, 15)
    },
    window0: normalizeWindow(source.window0 ?? source.window_0),
    window1: normalizeWindow(source.window1 ?? source.window_1),
    hblank: {
      enabled: booleanValue(hblankSource.enabled, false),
      layer: enumValue(hblankSource.layer, ["BG1", "BG2", "BG3"] as const, "BG2"),
      hdma: booleanValue(hblankSource.hdma, false),
      scrollOffsets: offsets,
      ...(timeline ? { timeline } : {})
    }
  };
}

export function defaultSceneComposition(): SceneCompositionConfig {
  return {
    schema: 1,
    enabled: false,
    mode: "tilemap",
    layers: [],
    effects: {
      blend: { ...EMPTY_BLEND, firstTargets: [], secondTargets: [] },
      mosaic: { ...EMPTY_MOSAIC },
      window0: { ...EMPTY_WINDOW, insideTargets: [], outsideTargets: [] },
      window1: { ...EMPTY_WINDOW, insideTargets: [], outsideTargets: [] },
      hblank: { ...EMPTY_HBLANK, scrollOffsets: [] }
    },
    fallback: "error",
    budget: { ...EMPTY_BUDGET }
  };
}

export function normalizeSceneComposition(value: unknown): SceneCompositionConfig {
  if (!isRecord(value)) return defaultSceneComposition();
  const layers = Array.isArray(value.layers)
    ? value.layers.map((entry, index) => normalizeLayer(entry, index)).filter((entry): entry is SceneCompositionLayer => entry !== null)
    : [];
  return {
    schema: 1,
    enabled: value.enabled === true,
    mode: enumValue(value.mode, SCENE_COMPOSITION_MODES, "tilemap"),
    layers,
    effects: normalizeEffects(value.effects),
    fallback: enumValue(value.fallback, ["error", "tiled_default", "omit_decorative"] as const, "error"),
    budget: normalizeBudget(value.budget)
  };
}

function issue(code: SceneCompositionIssueCode, message: string, layerId?: string, field?: string): SceneCompositionIssue {
  return { code, message, ...(layerId ? { layerId } : {}), ...(field ? { field } : {}) };
}

function validBudget(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.keys(EMPTY_BUDGET).every((key) => typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0);
}

function modeAllowsLayer(mode: SceneCompositionMode, layer: SceneCompositionLayer): boolean {
  if (mode === "tilemap") return layer.kind === "regular_bg" && layer.layer !== "BITMAP";
  if (mode === "affine") return (layer.kind === "regular_bg" && layer.layer !== "BITMAP") || (layer.kind === "affine_bg" && (layer.layer === "BG2" || layer.layer === "BG3"));
  return layer.kind === "bitmap" && layer.layer === "BITMAP";
}

export function sceneCompositionIssues(value: unknown, profile = "shmup"): SceneCompositionIssue[] {
  if (value === undefined || value === null) return [];
  if (!isRecord(value)) return [issue("INVALID_COMPOSITION", "A composição da cena deve ser um objeto.")];
  const composition = normalizeSceneComposition(value);
  if (!composition.enabled) return [];
  const issues: SceneCompositionIssue[] = [];
  if (!SCENE_COMPOSITION_MODES.includes(value.mode as SceneCompositionMode)) {
    issues.push(issue("INVALID_MODE", "O modo de vídeo não pertence ao contrato de composição.", undefined, "mode"));
  }
  if (!Array.isArray(value.layers)) {
    issues.push(issue("INVALID_LAYER", "layers deve ser uma lista de camadas declaradas.", undefined, "layers"));
  } else {
    value.layers.forEach((rawLayer, index) => {
      const layerID = isRecord(rawLayer) ? stringValue(rawLayer.id, `layer_${index + 1}`) : `layer_${index + 1}`;
      if (!isRecord(rawLayer)) {
        issues.push(issue("INVALID_LAYER", `A camada ${layerID} deve ser um objeto.`, layerID));
        return;
      }
      const validKind = ["regular_bg", "affine_bg", "bitmap"].includes(rawLayer.kind as string);
      const validRole = ["gameplay", "decorative"].includes(rawLayer.role as string);
      const validLayer = ["BG0", "BG1", "BG2", "BG3", "BITMAP"].includes(rawLayer.layer as string);
      if (!validKind || !validRole || !validLayer) {
        issues.push(issue("INVALID_LAYER", `A camada ${layerID} precisa declarar kind, role e camada GBA válidos.`, layerID));
      }
    });
  }
  if (!validBudget(value.budget)) {
    issues.push(issue("INVALID_BUDGET", "A composição habilitada deve declarar os dez custos físicos no budget.", undefined, "budget"));
  }
  const seenIDs = new Set<string>();
  const seenLayers = new Set<string>();
  for (const layer of composition.layers.filter((entry) => entry.enabled)) {
    if (seenIDs.has(layer.id)) issues.push(issue("DUPLICATE_LAYER", `A camada ${layer.id} foi declarada mais de uma vez.`, layer.id, "id"));
    seenIDs.add(layer.id);
    if (layer.layer !== "BITMAP" && seenLayers.has(layer.layer)) issues.push(issue("DUPLICATE_LAYER", `A camada física ${layer.layer} foi declarada mais de uma vez.`, layer.id, "layer"));
    if (layer.layer !== "BITMAP") seenLayers.add(layer.layer);
    if (!modeAllowsLayer(composition.mode, layer)) issues.push(issue("MODE_LAYER_INCOMPATIBLE", `A camada ${layer.id} não é compatível com o modo ${composition.mode} no perfil ${profile}.`, layer.id, "kind"));
    if (!layer.assetId) issues.push(issue("MISSING_LAYER_ASSET", `A camada ${layer.id} precisa declarar assetId.`, layer.id, "assetId"));
    if (layer.kind !== "regular_bg" && layer.role === "gameplay") issues.push(issue("GAMEPLAY_LAYER_UNSUPPORTED", `A camada ${layer.id} deve ser decorativa; gameplay usa o tilemap regular e a colisão da cena.`, layer.id, "role"));
    if (layer.priority < 0 || layer.priority > 3) issues.push(issue("INVALID_PRIORITY", `A prioridade da camada ${layer.id} deve estar entre 0 e 3.`, layer.id, "priority"));
    if (Math.abs(layer.parallax.x256) > 1024 || Math.abs(layer.parallax.y256) > 1024) issues.push(issue("INVALID_PARALLAX", `O parallax da camada ${layer.id} excede o intervalo seguro.`, layer.id, "parallax"));
    if (layer.kind === "affine_bg" && !["BG2", "BG3"].includes(layer.layer)) issues.push(issue("INVALID_AFFINE_LAYER", `A camada affine ${layer.id} só pode usar BG2 ou BG3.`, layer.id, "layer"));
    if (layer.kind === "bitmap" && layer.layer !== "BITMAP") issues.push(issue("INVALID_BITMAP_LAYER", `A camada bitmap ${layer.id} deve usar o plano BITMAP.`, layer.id, "layer"));
  }
  const effects = composition.effects;
  if (effects.blend.enabled && (effects.blend.mode === "none" || effects.blend.firstTargets.length === 0)) {
    issues.push(issue("INVALID_EFFECT", "Blending habilitado precisa de modo e alvos de primeira camada.", undefined, "effects.blend"));
  }
  for (const window of [effects.window0, effects.window1]) {
    if (window.enabled && (window.left >= window.right || window.top >= window.bottom || window.insideTargets.length === 0)) {
      issues.push(issue("INVALID_WINDOW", "Uma window habilitada precisa de retângulo válido e alvos internos.", undefined, "effects.window"));
    }
  }
  if (effects.hblank.enabled && (!effects.hblank.hdma || effects.hblank.scrollOffsets.length !== 160)) {
    issues.push(issue("INVALID_HBLANK", "HBlank/HDMA precisa declarar hdma=true e exatamente 160 offsets de scroll.", undefined, "effects.hblank"));
  }
  const rawEffects = isRecord(value.effects) ? value.effects : {};
  const rawHblank = isRecord(rawEffects.hblank) ? rawEffects.hblank : {};
  if (Object.hasOwn(rawHblank, "timeline") || Object.hasOwn(rawHblank, "hblankTimeline")) {
    const rawTimeline = rawHblank.timeline ?? rawHblank.hblankTimeline;
    const timeline = effects.hblank.timeline ?? [];
    if (!Array.isArray(rawTimeline) || timeline.length !== rawTimeline.length) {
      issues.push(issue("INVALID_HBLANK_TIMELINE", "A timeline HBlank deve ser uma lista de keyframes válidos.", undefined, "effects.hblank.timeline"));
    }
    if (timeline.length > 0 && (!effects.hblank.enabled || !effects.hblank.hdma)) {
      issues.push(issue("INVALID_HBLANK_TIMELINE", "Uma timeline HBlank só pode ser habilitada com HBlank e HDMA ativos.", undefined, "effects.hblank.timeline"));
    }
    let previousFrame = -1;
    timeline.forEach((keyframe, index) => {
      const rawKeyframe = Array.isArray(rawTimeline) ? rawTimeline[index] : undefined;
      const rawKeyframeRecord = isRecord(rawKeyframe) ? rawKeyframe : undefined;
      const rawFrame = rawKeyframeRecord?.frame;
      if (typeof rawFrame !== "number" || !Number.isInteger(rawFrame) || rawFrame < 0 || rawFrame > 65535) {
        issues.push(issue("INVALID_HBLANK_TIMELINE", `O keyframe ${index + 1} precisa declarar frame inteiro entre 0 e 65535.`, undefined, `effects.hblank.timeline[${index}].frame`));
      }
      if (keyframe.frame <= previousFrame) {
        issues.push(issue("INVALID_HBLANK_TIMELINE", "Os frames da timeline HBlank devem estar em ordem estritamente crescente.", undefined, `effects.hblank.timeline[${index}].frame`));
      }
      previousFrame = keyframe.frame;
      const rawOffsets = rawKeyframeRecord?.scrollOffsets ?? rawKeyframeRecord?.scroll_offsets;
      if (!Array.isArray(rawOffsets) || rawOffsets.length !== 160 || keyframe.scrollOffsets.length !== 160) {
        issues.push(issue("INVALID_HBLANK_TIMELINE", `O keyframe ${index + 1} precisa declarar exatamente 160 offsets.`, undefined, `effects.hblank.timeline[${index}].scrollOffsets`));
      }
    });
  }
  return issues;
}

export function sceneCompositionVideoMode(value: unknown): GbaVideoModeId {
  const composition = normalizeSceneComposition(value);
  if (composition.mode === "bitmap3") return 3;
  if (composition.mode === "bitmap4") return 4;
  if (composition.mode === "bitmap5") return 5;
  if (composition.mode === "affine") {
    return composition.layers.some((layer) => layer.enabled && layer.kind === "affine_bg" && layer.layer === "BG3") ? 2 : 1;
  }
  return 0;
}

export function sceneCompositionFromAffinePresentation(value: unknown): SceneCompositionConfig {
  const affine = normalizeAffineScenePresentation(value);
  if (!affine.enabled) return defaultSceneComposition();
  return normalizeSceneComposition({
    enabled: true,
    mode: "affine",
    layers: [{
      id: "affine",
      kind: "affine_bg",
      role: "decorative",
      layer: affine.layer,
      enabled: true,
      priority: 2,
      assetId: affine.assetId,
      parallax: { x256: 256, y256: 256 },
      affine: {
        rotationDegrees: affine.rotationDegrees,
        scaleX: affine.scaleX,
        scaleY: affine.scaleY,
        pivotX: affine.pivotX,
        pivotY: affine.pivotY,
        wrap: affine.wrap
      }
    }]
  });
}

export function exportSceneComposition(value: unknown): ExportedSceneComposition {
  const composition = normalizeSceneComposition(value);
  const enabledLayers = composition.enabled ? composition.layers.filter((layer) => layer.enabled) : [];
  return {
    schema: 1,
    enabled: composition.enabled,
    mode: composition.mode,
    display_mode: sceneCompositionVideoMode(composition),
    default_tiled: !composition.enabled || composition.mode === "tilemap",
    fallback: composition.fallback,
    layers: enabledLayers.map((layer) => ({
      id: layer.id,
      kind: layer.kind,
      role: layer.role,
      layer: layer.layer,
      asset: layer.assetId || null,
      priority: layer.priority,
      parallax_x256: layer.parallax.x256,
      parallax_y256: layer.parallax.y256,
      scroll_x: layer.scroll.x,
      scroll_y: layer.scroll.y,
      bitmap_page: layer.bitmapPage,
      affine: layer.affine ? {
        rotation_degrees: layer.affine.rotationDegrees,
        scale_x: layer.affine.scaleX,
        scale_y: layer.affine.scaleY,
        pivot_x: layer.affine.pivotX,
        pivot_y: layer.affine.pivotY,
        wrap: layer.affine.wrap
      } : null
    })),
    effects: {
      blend: {
        enabled: composition.effects.blend.enabled,
        mode: composition.effects.blend.mode,
        first_targets: [...composition.effects.blend.firstTargets],
        second_targets: [...composition.effects.blend.secondTargets],
        eva: composition.effects.blend.eva,
        evb: composition.effects.blend.evb,
        intensity: composition.effects.blend.intensity
      },
      mosaic: { ...composition.effects.mosaic },
      window0: { ...composition.effects.window0, insideTargets: [...composition.effects.window0.insideTargets], outsideTargets: [...composition.effects.window0.outsideTargets] },
      window1: { ...composition.effects.window1, insideTargets: [...composition.effects.window1.insideTargets], outsideTargets: [...composition.effects.window1.outsideTargets] },
      hblank: {
        enabled: composition.effects.hblank.enabled,
        layer: composition.effects.hblank.layer,
        hdma: composition.effects.hblank.hdma,
        scroll_offsets: [...composition.effects.hblank.scrollOffsets],
        ...(composition.effects.hblank.timeline && composition.effects.hblank.timeline.length > 0 ? {
          timeline: composition.effects.hblank.timeline.map((keyframe) => ({
            frame: keyframe.frame,
            scroll_offsets: [...keyframe.scrollOffsets]
          }))
        } : {})
      }
    },
    budget: { ...composition.budget }
  };
}

export function sceneCompositionToAffinePresentation(value: unknown): AffineScenePresentation {
  const composition = normalizeSceneComposition(value);
  const layer = composition.layers.find((entry) => entry.enabled && entry.kind === "affine_bg");
  if (!composition.enabled || composition.mode !== "affine" || !layer || !layer.affine) {
    return normalizeAffineScenePresentation(undefined);
  }
  return normalizeAffineScenePresentation({
    enabled: true,
    assetId: layer.assetId,
    layer: layer.layer === "BG3" ? "BG3" : "BG2",
    scaleX: layer.affine.scaleX,
    scaleY: layer.affine.scaleY,
    rotationDegrees: layer.affine.rotationDegrees,
    pivotX: layer.affine.pivotX,
    pivotY: layer.affine.pivotY,
    wrap: layer.affine.wrap
  });
}
