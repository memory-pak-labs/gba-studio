import type {
  SceneCapabilityAssetRequirement,
  SceneCapabilityDefinition,
  SceneCapabilitySettingDefinition,
  SceneFeatureSettingValue,
  SceneFeatureValidationIssue,
  ScenePhysicalBudget
} from "./sceneFeatureModules.js";

export const SCENE_TACTICAL_CAPABILITY_IDS = [
  "tactical_surface",
  "tactical_grid_overlay",
  "tactical_hud",
  "tactical_units",
  "tactical_props",
  "tactical_feedback",
  "tactical_audio"
] as const;

export type SceneTacticalCapabilityID = typeof SCENE_TACTICAL_CAPABILITY_IDS[number];
export const ISO_TACTICAL_CAPABILITY_IDS = SCENE_TACTICAL_CAPABILITY_IDS;

export const ISO_TACTICAL_DIRECTIONS = ["down", "up", "left", "right"] as const;
export type IsoTacticalDirection = typeof ISO_TACTICAL_DIRECTIONS[number];

export const ISO_TACTICAL_ANIMATION_STATES = ["idle", "move", "attack", "hurt", "defeat"] as const;
export type IsoTacticalAnimationState = typeof ISO_TACTICAL_ANIMATION_STATES[number];
export type IsoTacticalAnimationBinding = `${IsoTacticalAnimationState}_${IsoTacticalDirection}`;
export const ISO_TACTICAL_ANIMATION_BINDINGS: readonly IsoTacticalAnimationBinding[] = ISO_TACTICAL_ANIMATION_STATES.flatMap((state) => (
  ISO_TACTICAL_DIRECTIONS.map((direction) => `${state}_${direction}` as IsoTacticalAnimationBinding)
));

export const ISO_TACTICAL_PROP_KINDS = ["objective", "cover", "elevation"] as const;
export type IsoTacticalPropKind = typeof ISO_TACTICAL_PROP_KINDS[number];

export const ISO_TACTICAL_EMOTE_KINDS = ["selected", "alert", "wait", "attack", "damage", "victory", "defeat"] as const;
export type IsoTacticalEmoteKind = typeof ISO_TACTICAL_EMOTE_KINDS[number];

export const ISO_TACTICAL_FEEDBACK_KINDS = ["cursor", "move_range", "attack_range", "target", "blocked", "impact", "movement"] as const;
export type IsoTacticalFeedbackKind = typeof ISO_TACTICAL_FEEDBACK_KINDS[number];

export const ISO_TACTICAL_AUDIO_CUES = ["cursor", "select", "cancel", "move", "attack", "hit", "turn", "victory", "defeat"] as const;
export type IsoTacticalAudioCue = typeof ISO_TACTICAL_AUDIO_CUES[number];

export const ISO_TACTICAL_ASSET_STATUSES = [
  "candidate",
  "palette-prepared",
  "pack-validated",
  "scene-verified",
  "approved",
  "attention",
  "impossible"
] as const;
export type IsoTacticalAssetStatus = typeof ISO_TACTICAL_ASSET_STATUSES[number];
export type IsoTacticalAssetConsumer = "bg" | "obj" | "ui" | "audio";

export interface SceneTacticalCapabilityConfig {
  id: SceneTacticalCapabilityID;
  enabled: boolean;
  required?: boolean;
  settings: Record<string, SceneFeatureSettingValue>;
}

export interface SceneTacticalCapabilityResolution {
  capabilities: SceneTacticalCapabilityConfig[];
  issues: SceneFeatureValidationIssue[];
}

export interface IsoTacticalCapabilityBinding {
  id: SceneTacticalCapabilityID;
  enabled: boolean;
  required?: boolean;
  settings: Record<string, SceneFeatureSettingValue>;
}

export interface IsoTacticalAssetBinding {
  id: string;
  path: string;
  consumer: IsoTacticalAssetConsumer;
  required: boolean;
  status?: IsoTacticalAssetStatus;
}

export interface IsoTacticalUnitPresentation {
  actorId: string;
  sheet: string;
  animations?: Partial<Record<IsoTacticalAnimationBinding, string>>;
}

export interface IsoTacticalPropPresentation {
  id: string;
  asset: string;
  kind: IsoTacticalPropKind;
  tile?: { x: number; y: number; z: number };
  animated?: boolean;
}

export interface IsoTacticalAudioPresentation {
  music: string;
  cues: Partial<Record<IsoTacticalAudioCue, string>>;
}

export interface IsoTacticalSurfacePage {
  id: string;
  asset: string;
  bankGroup: string;
  world: { x: number; y: number; width: number; height: number };
}

export interface IsoTacticalSurfaceResidency {
  exclusiveBankGroups: string[];
  maxResidentGroups: number;
  prefetchMarginPixels: number;
}

export interface IsoTacticalPresentationConfig {
  schema?: 1;
  assets?: IsoTacticalAssetBinding[];
  surfaceAsset?: string;
  surfacePages?: IsoTacticalSurfacePage[];
  surfaceResidency?: IsoTacticalSurfaceResidency;
  gridAsset?: string;
  hudLayout?: string;
  cursorAsset?: string;
  rangeAsset?: string;
  targetAsset?: string;
  units: IsoTacticalUnitPresentation[];
  props: IsoTacticalPropPresentation[];
  emotesAsset?: string;
  feedbackAsset?: string;
  audio?: IsoTacticalAudioPresentation;
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

function budget(overrides: Partial<ScenePhysicalBudget>): ScenePhysicalBudget {
  return { ...EMPTY_BUDGET, ...overrides };
}

const TACTICAL_LABELS: Record<SceneTacticalCapabilityID, string> = {
  tactical_surface: "Superfície tática BG2",
  tactical_grid_overlay: "Grade e alcance tático BG1",
  tactical_hud: "HUD tático BG0",
  tactical_units: "Unidades táticas OBJ",
  tactical_props: "Props táticos OBJ",
  tactical_feedback: "Feedback tático OBJ",
  tactical_audio: "Áudio tático"
};

const TACTICAL_ASSETS: Record<SceneTacticalCapabilityID, readonly SceneCapabilityAssetRequirement[]> = {
  tactical_surface: [{ kind: "tactical_bg2", required: true, reason: "A cena tática precisa de uma superfície BG2 tiled separada de HUD, atores e colisão." }],
  tactical_grid_overlay: [{ kind: "tactical_bg1", required: true, reason: "Grade, alcance e obstáculos visuais precisam de uma camada BG1 independente." }],
  tactical_hud: [{ kind: "tactical_hud_bg0", required: true, reason: "Turno, unidade, vida, objetivo e comandos precisam de UI BG0 montável." }],
  tactical_units: [{ kind: "tactical_actor_sheets", required: true, reason: "Cada unidade precisa de uma sheet OBJ com estados e direções declarados." }],
  tactical_props: [{ kind: "tactical_props", required: true, reason: "Objetivo, cover e elevação precisam de sprites separados do chão." }],
  tactical_feedback: [{ kind: "tactical_feedback", required: true, reason: "Cursor, alcance, alvo, emotes e impactos precisam de ciclos OBJ/UI independentes." }],
  tactical_audio: [{ kind: "tactical_audio", required: true, reason: "A música e os nove cues precisam ser itens COMPOSED referenciados pela cena." }]
};

const TACTICAL_EDITOR_TOOLS: Record<SceneTacticalCapabilityID, readonly string[]> = {
  tactical_surface: ["paint", "room"],
  tactical_grid_overlay: ["paint", "collision", "height"],
  tactical_hud: ["room"],
  tactical_units: ["actor"],
  tactical_props: ["paint", "actor"],
  tactical_feedback: ["actor", "room"],
  tactical_audio: ["room"]
};

const TACTICAL_BUDGETS: Record<SceneTacticalCapabilityID, ScenePhysicalBudget> = {
  tactical_surface: budget({ bgTiles: 256, paletteColors: 64, vramBytes: 32768, dmaBytes: 16384, vblankTicks: 160, cpuWorkTicks: 180 }),
  tactical_grid_overlay: budget({ bgTiles: 128, paletteColors: 16, vramBytes: 8192, dmaBytes: 4096, vblankTicks: 80, cpuWorkTicks: 120 }),
  tactical_hud: budget({ bgTiles: 128, paletteColors: 16, vramBytes: 8192, eventBytes: 1024, dmaBytes: 4096, vblankTicks: 64, cpuWorkTicks: 160 }),
  tactical_units: budget({ objTiles: 256, oam: 32, vramBytes: 8192, dmaBytes: 8192, vblankTicks: 96, cpuWorkTicks: 240 }),
  tactical_props: budget({ objTiles: 64, oam: 16, vramBytes: 2048, dmaBytes: 2048, vblankTicks: 64, cpuWorkTicks: 120 }),
  tactical_feedback: budget({ objTiles: 96, oam: 24, vramBytes: 3072, eventBytes: 768, dmaBytes: 4096, vblankTicks: 96, cpuWorkTicks: 180 }),
  tactical_audio: budget({ eventBytes: 256, audioBytes: 32768, cpuWorkTicks: 80 })
};

const TACTICAL_SETTINGS: Record<SceneTacticalCapabilityID, readonly SceneCapabilitySettingDefinition[]> = {
  tactical_surface: [],
  tactical_grid_overlay: [],
  tactical_hud: [],
  tactical_units: [],
  tactical_props: [],
  tactical_feedback: [],
  tactical_audio: []
};

const TACTICAL_FALLBACKS: Record<SceneTacticalCapabilityID, string> = {
  tactical_surface: "Use o background tiled da cena sem composição tática; não desenhe a superfície a partir de pixels de outro layer.",
  tactical_grid_overlay: "Oculte grade e alcance e mantenha a colisão somente em scene_data; não invente bloqueios visuais.",
  tactical_hud: "Use o HUD padrão da cena ou bloqueie a exportação se a capability estiver required.",
  tactical_units: "Use apenas atores explicitamente compatíveis; não substitua a sheet por um sprite de outra cena.",
  tactical_props: "Remova props opcionais da composição ou bloqueie a exportação quando um objetivo required não tiver asset.",
  tactical_feedback: "Mantenha o estado tático sem marcador visual somente quando a capability estiver desabilitada explicitamente.",
  tactical_audio: "Use silêncio somente quando o áudio estiver desabilitado; não converter a cena para PCM automaticamente."
};

const TACTICAL_ENGINE_FEATURES: Record<SceneTacticalCapabilityID, readonly string[]> = {
  tactical_surface: ["isometric_runtime.bg2_surface"],
  tactical_grid_overlay: ["isometric_runtime.bg1_tactical_grid"],
  tactical_hud: ["isometric_runtime.bg0_tactical_hud"],
  tactical_units: ["isometric_runtime.tactical_unit_states"],
  tactical_props: ["isometric_runtime.tactical_props"],
  tactical_feedback: ["isometric_runtime.tactical_feedback"],
  tactical_audio: ["isometric_runtime.tactical_audio_cues"]
};

const TACTICAL_VERIFICATION = {
  tests: ["isometricTacticalPresentation.test.ts", "scenePreflight.test.ts", "engineProjectExport.test.ts", "isometric_tests.cpp"],
  evidence: ["npm run smoke:isometric-editor", "npm run smoke:engine-rom", "npm run verify:mgba-web"]
} as const;

export const SCENE_TACTICAL_CAPABILITY_REGISTRY: readonly SceneCapabilityDefinition[] = SCENE_TACTICAL_CAPABILITY_IDS.map((id) => ({
  id,
  label: TACTICAL_LABELS[id],
  sceneProfiles: ["isometric"],
  available: true,
  required: false,
  verified: true,
  assets: TACTICAL_ASSETS[id],
  editorTools: TACTICAL_EDITOR_TOOLS[id],
  budget: TACTICAL_BUDGETS[id],
  fallback: TACTICAL_FALLBACKS[id],
  verification: TACTICAL_VERIFICATION,
  settings: TACTICAL_SETTINGS[id],
  engineFeaturesByProfile: { isometric: TACTICAL_ENGINE_FEATURES[id] }
}));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isSceneTacticalCapabilityID(value: unknown): value is SceneTacticalCapabilityID {
  return typeof value === "string" && (SCENE_TACTICAL_CAPABILITY_IDS as readonly string[]).includes(value);
}

function normalizeSettings(value: unknown): { settings: Record<string, SceneFeatureSettingValue> | null; invalid: boolean } {
  if (value === undefined) return { settings: {}, invalid: false };
  if (!isRecord(value)) return { settings: null, invalid: true };
  const settings: Record<string, SceneFeatureSettingValue> = {};
  for (const [key, setting] of Object.entries(value)) {
    if (!["string", "number", "boolean"].includes(typeof setting)) return { settings: null, invalid: true };
    settings[key] = setting as SceneFeatureSettingValue;
  }
  return { settings, invalid: false };
}

export function resolveIsometricTacticalCapabilities(
  sceneType: string,
  value?: unknown,
  editorTools?: readonly string[]
): SceneTacticalCapabilityResolution {
  const source = value === undefined ? [] : value;
  if (!Array.isArray(source)) {
    return {
      capabilities: [],
      issues: [{ code: "INVALID_CAPABILITY_CONFIG", message: "A configuração de capabilities táticas deve ser uma lista." }]
    };
  }

  const issues: SceneFeatureValidationIssue[] = [];
  const capabilities: SceneTacticalCapabilityConfig[] = [];
  const seen = new Set<SceneTacticalCapabilityID>();
  for (const entry of source) {
    const rawID = isRecord(entry) && typeof entry.id === "string" ? entry.id : undefined;
    if (!isRecord(entry) || !isSceneTacticalCapabilityID(entry.id)) {
      issues.push({
        code: "UNKNOWN_CAPABILITY",
        module: rawID,
        field: "id",
        message: "A capability tática informada não pertence ao registro fechado."
      });
      continue;
    }
    const id = entry.id;
    const definition = SCENE_TACTICAL_CAPABILITY_REGISTRY.find((candidate) => candidate.id === id);
    if (!definition?.sceneProfiles.includes(sceneType)) {
      issues.push({
        code: "INCOMPATIBLE_CAPABILITY",
        module: id,
        field: "sceneType",
        message: `A capability ${id} não é compatível com o perfil ${sceneType}.`
      });
      continue;
    }
    if (typeof entry.enabled !== "boolean") {
      issues.push({
        code: "INVALID_CAPABILITY_CONFIG",
        module: id,
        message: `A capability ${id} exige enabled=true ou enabled=false explícito; ausência não habilita o recurso.`
      });
      continue;
    }
    if (seen.has(id)) {
      issues.push({ code: "INVALID_CAPABILITY_CONFIG", module: id, message: `A capability ${id} foi declarada mais de uma vez.` });
      continue;
    }
    seen.add(id);
    const normalizedSettings = normalizeSettings(entry.settings);
    if (normalizedSettings.invalid || normalizedSettings.settings === null) {
      issues.push({ code: "INVALID_CAPABILITY_SETTINGS", module: id, message: `As configurações da capability ${id} devem conter apenas valores simples.` });
      continue;
    }
    const settingDefinitions = new Map((definition.settings ?? []).map((setting) => [setting.key, setting]));
    const invalidTypedSetting = Object.entries(normalizedSettings.settings).find(([key, setting]) => (
      !settingDefinitions.has(key) || typeof setting !== settingDefinitions.get(key)?.type
    ));
    if (invalidTypedSetting) {
      issues.push({
        code: "INVALID_CAPABILITY_SETTINGS",
        module: id,
        field: invalidTypedSetting[0],
        message: `A configuração ${invalidTypedSetting[0]} não é declarada pelo contrato tipado da capability ${id}.`
      });
      continue;
    }
    if (editorTools) {
      for (const requiredTool of definition.editorTools) {
        if (!editorTools.includes(requiredTool)) {
          issues.push({
            code: "MISSING_EDITOR_TOOL",
            module: id,
            field: requiredTool,
            message: `A capability ${id} exige a ferramenta de edição ${requiredTool}.`
          });
        }
      }
    }
    const required = entry.required === true;
    if (required && !entry.enabled) {
      issues.push({
        code: "REQUIRED_CAPABILITY_DISABLED",
        module: id,
        message: `A capability ${id} foi marcada como required, mas está desabilitada.`
      });
    }
    capabilities.push({
      id,
      enabled: entry.enabled,
      ...(required ? { required: true } : {}),
      settings: normalizedSettings.settings
    });
  }
  return { capabilities, issues };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : undefined;
}

function normalizeAnimations(value: unknown): Partial<Record<`${IsoTacticalAnimationState}_${IsoTacticalDirection}`, string>> | undefined {
  if (!isRecord(value)) return undefined;
  const animations: Partial<Record<`${IsoTacticalAnimationState}_${IsoTacticalDirection}`, string>> = {};
  for (const [key, animation] of Object.entries(value)) {
    if (stringValue(animation)) animations[key as `${IsoTacticalAnimationState}_${IsoTacticalDirection}`] = stringValue(animation);
  }
  return Object.keys(animations).length > 0 ? animations : undefined;
}

export function normalizeIsometricTacticalPresentation(value: unknown): IsoTacticalPresentationConfig {
  if (!isRecord(value)) return { units: [], props: [] };
  const units = Array.isArray(value.units)
    ? value.units.filter(isRecord).map((unit) => ({
      actorId: stringValue(unit.actorId) ?? "",
      sheet: stringValue(unit.sheet) ?? "",
      ...(normalizeAnimations(unit.animations) ? { animations: normalizeAnimations(unit.animations) } : {})
    }))
    : [];
  const props = Array.isArray(value.props)
    ? value.props.filter(isRecord).map((prop) => ({
      id: stringValue(prop.id) ?? "",
      asset: stringValue(prop.asset) ?? "",
      kind: (ISO_TACTICAL_PROP_KINDS as readonly string[]).includes(String(prop.kind)) ? prop.kind as IsoTacticalPropKind : "cover",
      ...(isRecord(prop.tile) ? {
        tile: {
          x: numberValue(prop.tile.x) ?? 0,
          y: numberValue(prop.tile.y) ?? 0,
          z: numberValue(prop.tile.z) ?? 0
        }
      } : {}),
      ...(typeof prop.animated === "boolean" ? { animated: prop.animated } : {})
    }))
    : [];
  const audio = isRecord(value.audio)
    ? {
      music: stringValue(value.audio.music) ?? "",
      cues: isRecord(value.audio.cues)
        ? Object.fromEntries(Object.entries(value.audio.cues).flatMap(([cue, asset]) => (
          (ISO_TACTICAL_AUDIO_CUES as readonly string[]).includes(cue) && stringValue(asset)
            ? [[cue, stringValue(asset)]]
            : []
        ))) as Partial<Record<IsoTacticalAudioCue, string>>
        : {}
    }
    : undefined;
  const assets = Array.isArray(value.assets)
    ? value.assets.filter(isRecord).map((asset) => ({
      id: stringValue(asset.id) ?? "",
      path: stringValue(asset.path) ?? "",
      consumer: (["bg", "obj", "ui", "audio"] as const).includes(asset.consumer as IsoTacticalAssetConsumer)
        ? asset.consumer as IsoTacticalAssetConsumer
        : "obj",
      required: asset.required === true,
      ...(ISO_TACTICAL_ASSET_STATUSES.includes(asset.status as IsoTacticalAssetStatus) ? { status: asset.status as IsoTacticalAssetStatus } : {})
    }))
    : undefined;
  const surfacePages = Array.isArray(value.surfacePages)
    ? value.surfacePages.filter(isRecord).map((page) => {
      const world = isRecord(page.world) ? page.world : {};
      return {
        id: stringValue(page.id) ?? "",
        asset: stringValue(page.asset) ?? "",
        bankGroup: stringValue(page.bankGroup) ?? "",
        world: {
          x: Number.isInteger(world.x) ? Number(world.x) : 0,
          y: Number.isInteger(world.y) ? Number(world.y) : 0,
          width: Number.isInteger(world.width) ? Number(world.width) : 0,
          height: Number.isInteger(world.height) ? Number(world.height) : 0
        }
      };
    })
    : undefined;
  const surfaceResidency = isRecord(value.surfaceResidency)
    ? {
      exclusiveBankGroups: Array.isArray(value.surfaceResidency.exclusiveBankGroups)
        ? value.surfaceResidency.exclusiveBankGroups.flatMap((group) => stringValue(group) ? [stringValue(group)!] : [])
        : [],
      maxResidentGroups: Number.isInteger(value.surfaceResidency.maxResidentGroups)
        ? Number(value.surfaceResidency.maxResidentGroups)
        : 0,
      prefetchMarginPixels: Number.isInteger(value.surfaceResidency.prefetchMarginPixels)
        ? Number(value.surfaceResidency.prefetchMarginPixels)
        : 0
    }
    : undefined;
  return {
    ...(value.schema === 1 ? { schema: 1 as const } : {}),
    ...(stringValue(value.surfaceAsset) ? { surfaceAsset: stringValue(value.surfaceAsset) } : {}),
    ...(surfacePages ? { surfacePages } : {}),
    ...(surfaceResidency ? { surfaceResidency } : {}),
    ...(stringValue(value.gridAsset) ? { gridAsset: stringValue(value.gridAsset) } : {}),
    ...(stringValue(value.hudLayout) ? { hudLayout: stringValue(value.hudLayout) } : {}),
    ...(stringValue(value.cursorAsset) ? { cursorAsset: stringValue(value.cursorAsset) } : {}),
    ...(stringValue(value.rangeAsset) ? { rangeAsset: stringValue(value.rangeAsset) } : {}),
    ...(stringValue(value.targetAsset) ? { targetAsset: stringValue(value.targetAsset) } : {}),
    units,
    props,
    ...(stringValue(value.emotesAsset) ? { emotesAsset: stringValue(value.emotesAsset) } : {}),
    ...(stringValue(value.feedbackAsset) ? { feedbackAsset: stringValue(value.feedbackAsset) } : {}),
    ...(audio ? { audio } : {}),
    ...(assets ? { assets } : {})
  };
}

function recordList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function referenceBase(value: string): string {
  const fragmentIndex = value.indexOf("#");
  return (fragmentIndex >= 0 ? value.slice(0, fragmentIndex) : value).trim();
}

function referenceFileName(value: string): string {
  return referenceBase(value).replace(/^.*[\\/]/, "");
}

function tacticalAudioMatchesReference(audio: Record<string, unknown>, reference: string): boolean {
  const base = referenceBase(reference);
  const fileName = referenceFileName(base);
  return ["id", "name", "path", "exportID"].some((key) => {
    const candidate = stringValue(audio[key]);
    if (!candidate) return false;
    return candidate === reference
      || candidate === base
      || candidate === fileName
      || referenceFileName(candidate) === fileName;
  });
}

function channelHasNoteContent(channel: Record<string, unknown>): boolean {
  const notes = Array.isArray(channel.notes) ? channel.notes : [];
  return notes.some((note) => typeof note === "string" && note.trim().length > 0 && note.trim() !== "---");
}

function composedAudioHasNoteContent(audio: Record<string, unknown>, kind: "Musica" | "SFX"): boolean {
  const patterns = recordList(audio.patterns);
  if (kind === "Musica" && patterns.length === 0) return false;
  const channels = patterns.length > 0
    ? patterns.flatMap((pattern) => recordList(pattern.channels))
    : recordList(audio.channels);
  return channels.some(channelHasNoteContent);
}

function tacticalAudioIssue(
  code: SceneFeatureValidationIssue["code"],
  field: string,
  message: string
): SceneFeatureValidationIssue {
  return { code, module: "tactical_audio", field, message };
}

/**
 * Validates the source audio catalog used by the tactical presentation.
 * Tactical audio is intentionally stricter than the general audio pipeline:
 * it must resolve to editor-composed PSG data so the preview, exporter and
 * native runtime consume the same deterministic representation.
 */
export function validateIsometricTacticalAudioCatalog(
  audioItems: readonly unknown[],
  presentationValue: unknown,
  enabledCapabilities: readonly string[]
): SceneFeatureValidationIssue[] {
  if (!enabledCapabilities.includes("tactical_audio")) return [];

  const presentation = normalizeIsometricTacticalPresentation(presentationValue);
  const audio = presentation.audio;
  if (!audio) return [];

  const catalog = audioItems.filter(isRecord);
  const issues: SceneFeatureValidationIssue[] = [];
  const validateReference = (reference: string | undefined, field: string, expectedKind: "Musica" | "SFX"): void => {
    if (!reference) return;
    const item = catalog.find((candidate) => tacticalAudioMatchesReference(candidate, reference));
    if (!item) {
      issues.push(tacticalAudioIssue(
        "MISSING_CAPABILITY_ASSET",
        field,
        `A referência ${reference} da capability tactical_audio não existe no catálogo de áudio.`
      ));
      return;
    }

    const format = stringValue(item.format)?.toUpperCase();
    if (format !== "COMPOSED") {
      issues.push(tacticalAudioIssue(
        "INVALID_TACTICAL_PRESENTATION",
        field,
        `A referência ${reference} precisa usar format COMPOSED; formatos PCM/importados não são permitidos em tactical_audio.`
      ));
    }

    const kind = stringValue(item.kind);
    if (kind !== expectedKind) {
      issues.push(tacticalAudioIssue(
        "INVALID_TACTICAL_PRESENTATION",
        field,
        `A referência ${reference} precisa declarar kind ${expectedKind}; recebeu ${kind ?? "ausente"}.`
      ));
    }

    if (format === "COMPOSED" && kind === expectedKind && !composedAudioHasNoteContent(item, expectedKind)) {
      issues.push(tacticalAudioIssue(
        "MISSING_CAPABILITY_ASSET",
        field,
        `A referência ${reference} não possui patterns/canais com notas compiláveis para tactical_audio.`
      ));
    }
  };

  validateReference(audio.music, "audio.music", "Musica");
  ISO_TACTICAL_AUDIO_CUES.forEach((cue) => validateReference(audio.cues[cue], `audio.cues.${cue}`, "SFX"));
  return issues;
}

function missingBinding(
  module: SceneTacticalCapabilityID,
  message: string,
  field = "tacticalPresentation"
): SceneFeatureValidationIssue {
  return { code: "MISSING_CAPABILITY_ASSET", module, field, message };
}

export function validateIsometricTacticalPresentation(
  value: unknown,
  enabledCapabilities: readonly string[]
): SceneFeatureValidationIssue[] {
  const presentation = normalizeIsometricTacticalPresentation(value);
  const issues: SceneFeatureValidationIssue[] = [];
  if (!isRecord(value) || value.schema !== 1) {
    issues.push({ code: "INVALID_TACTICAL_PRESENTATION", field: "schema", message: "tacticalPresentation precisa declarar schema: 1." });
  }
  const enabled = new Set(enabledCapabilities);
  if (enabled.has("tactical_surface") && !presentation.surfaceAsset && !presentation.surfacePages?.length) {
    issues.push(missingBinding("tactical_surface", "tactical_surface exige surfaceAsset ou surfacePages explícitas."));
  }
  if (presentation.surfacePages?.length || presentation.surfaceResidency) {
    const groups = presentation.surfacePages?.map((page) => page.bankGroup) ?? [];
    const exclusive = presentation.surfaceResidency?.exclusiveBankGroups ?? [];
    const uniqueGroups = new Set(groups);
    const uniqueExclusive = new Set(exclusive);
    if (
      groups.some((group) => !group) || uniqueGroups.size !== groups.length ||
      exclusive.length !== groups.length || uniqueExclusive.size !== exclusive.length ||
      groups.some((group) => !uniqueExclusive.has(group))
    ) {
      issues.push({ code: "INVALID_TACTICAL_PRESENTATION", field: "surfaceResidency.exclusiveBankGroups", message: "surfaceResidency deve listar uma vez cada bankGroup das páginas." });
    }
    const maxResidentGroups = presentation.surfaceResidency?.maxResidentGroups ?? 0;
    if (maxResidentGroups < 1 || maxResidentGroups > Math.max(1, groups.length) || maxResidentGroups > exclusive.length) {
      issues.push({ code: "INVALID_TACTICAL_PRESENTATION", field: "surfaceResidency.maxResidentGroups", message: "maxResidentGroups deve estar entre 1 e a quantidade de páginas." });
    }
    if ((presentation.surfaceResidency?.prefetchMarginPixels ?? -1) < 0) {
      issues.push({ code: "INVALID_TACTICAL_PRESENTATION", field: "surfaceResidency.prefetchMarginPixels", message: "prefetchMarginPixels deve ser inteiro não negativo." });
    }
    if (presentation.surfacePages?.some((page) => !page.id || !page.asset || page.world.width <= 0 || page.world.height <= 0)) {
      issues.push({ code: "INVALID_TACTICAL_PRESENTATION", field: "surfacePages", message: "Cada página exige id, asset, bankGroup e retângulo de mundo positivo." });
    }
  }
  if (enabled.has("tactical_grid_overlay") && !presentation.gridAsset) issues.push(missingBinding("tactical_grid_overlay", "tactical_grid_overlay exige gridAsset."));
  if (enabled.has("tactical_hud") && !presentation.hudLayout) issues.push(missingBinding("tactical_hud", "tactical_hud exige hudLayout."));
  if (enabled.has("tactical_units")) {
    const invalidUnit = presentation.units.length === 0 || presentation.units.some((unit) => !unit.actorId || !unit.sheet);
    const missingAnimation = presentation.units.some((unit) => (
      ISO_TACTICAL_ANIMATION_STATES.some((state) => ISO_TACTICAL_DIRECTIONS.some((direction) => (
        !unit.animations?.[`${state}_${direction}`]
      )))
    ));
    if (invalidUnit) {
      issues.push(missingBinding("tactical_units", "tactical_units exige ao menos uma unidade com actorId e sheet."));
    } else if (missingAnimation) {
      issues.push(missingBinding("tactical_units", "tactical_units exige todos os estados e direções de animação, sem fallback implícito.", "animations"));
    }
  }
  if (enabled.has("tactical_props") && (presentation.props.length === 0 || presentation.props.some((prop) => !prop.id || !prop.asset))) {
    issues.push(missingBinding("tactical_props", "tactical_props exige props com id, asset e kind."));
  }
  if (enabled.has("tactical_feedback") && (!presentation.cursorAsset || !presentation.rangeAsset || !presentation.targetAsset || !presentation.emotesAsset || !presentation.feedbackAsset)) {
    issues.push(missingBinding("tactical_feedback", "tactical_feedback exige cursorAsset, rangeAsset, targetAsset, emotesAsset e feedbackAsset."));
  }
  if (enabled.has("tactical_audio")) {
    const cues = presentation.audio?.cues ?? {};
    const missingCue = ISO_TACTICAL_AUDIO_CUES.find((cue) => !presentation.audio?.music || !cues[cue]);
    if (missingCue) issues.push(missingBinding("tactical_audio", `tactical_audio exige música e o cue ${missingCue}.`));
  }
  return issues;
}
