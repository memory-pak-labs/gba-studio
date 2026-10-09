import type {
  SceneCapabilityAssetRequirement,
  SceneCapabilityDefinition,
  SceneCapabilitySettingDefinition,
  SceneFeatureSettingValue,
  SceneFeatureValidationIssue,
  ScenePhysicalBudget
} from "./sceneFeatureModules.js";
import { normalizeAffineScenePresentation } from "./affineScene.js";

export const SCENE_ADVANCED_CAPABILITY_IDS = [
  "affine_background",
  "affine_obj",
  "hblank_timeline",
  "animation_state_machine",
  "metatiles",
  "plugin_sdk",
  "link_multiplayer",
  "save_ui_profile"
] as const;

export type SceneAdvancedCapabilityID = typeof SCENE_ADVANCED_CAPABILITY_IDS[number];

export interface SceneAdvancedCapabilityConfig {
  id: SceneAdvancedCapabilityID;
  enabled: boolean;
  required?: boolean;
  settings: Record<string, SceneFeatureSettingValue>;
}

export interface SceneAdvancedCapabilityResolution {
  capabilities: SceneAdvancedCapabilityConfig[];
  issues: SceneFeatureValidationIssue[];
}

const ADVANCED_PROFILES = {
  affine_background: ["shmup"],
  affine_obj: ["topdown"],
  hblank_timeline: ["shmup", "racing", "visualNovel", "cutscene"],
  animation_state_machine: ["topdown"],
  metatiles: ["topdown"],
  plugin_sdk: ["topdown", "platformer", "shmup", "isometric", "dungeonCrawler", "racing", "pointAndClick", "worldMap", "battleRpg", "luta", "visualNovel", "cutscene", "menu", "custom"],
  link_multiplayer: ["topdown", "platformer", "shmup", "racing", "battleRpg", "luta", "custom"],
  save_ui_profile: ["menu", "topdown", "platformer", "shmup", "isometric", "dungeonCrawler", "racing", "pointAndClick", "worldMap", "battleRpg", "luta", "visualNovel", "cutscene", "custom"]
} as const satisfies Record<SceneAdvancedCapabilityID, readonly string[]>;

const ADVANCED_LABELS: Record<SceneAdvancedCapabilityID, string> = {
  affine_background: "Background Affine SHMUP",
  affine_obj: "Affine OBJ",
  hblank_timeline: "Timeline HBlank/HDMA",
  animation_state_machine: "Máquina de estados de animação",
  metatiles: "Metatiles de autoria",
  plugin_sdk: "SDK de plugins",
  link_multiplayer: "Link/multiplayer",
  save_ui_profile: "Perfil de save/UI"
};

const ADVANCED_ASSETS: Record<SceneAdvancedCapabilityID, readonly SceneCapabilityAssetRequirement[]> = {
  affine_background: [{ kind: "affine_bg", required: true, reason: "O fundo do SHMUP precisa de um tileset Affine 8bpp e mapa físico quadrado." }],
  affine_obj: [{ kind: "actor_sprite", required: true, reason: "O transform affine OBJ precisa de um sprite de ator exportável." }],
  hblank_timeline: [{ kind: "hblank_timeline", required: true, reason: "A cena precisa de uma tabela de 160 offsets por keyframe." }],
  animation_state_machine: [
    { kind: "actor_sprite", required: true, reason: "Cada estado precisa de uma animação ou sprite de fallback." },
    { kind: "event_script", required: false, reason: "Transições podem disparar eventos autorados." }
  ],
  metatiles: [{ kind: "tileset", required: true, reason: "A biblioteca de metatiles é expandida para tiles BG físicos." }],
  plugin_sdk: [{ kind: "plugin_manifest", required: true, reason: "O plugin precisa declarar a versão do SDK compatível." }],
  link_multiplayer: [{ kind: "link_transport", required: true, reason: "Link/multiplayer depende do transporte físico do GBA." }],
  save_ui_profile: [{ kind: "save_ui_font", required: false, reason: "Uma fonte/UI customizada pode ser usada pelo perfil de save." }]
};

const ADVANCED_EDITOR_TOOLS: Record<SceneAdvancedCapabilityID, readonly string[]> = {
  affine_background: ["camera"],
  affine_obj: ["actor"],
  hblank_timeline: ["camera"],
  animation_state_machine: ["actor", "trigger"],
  metatiles: ["paint"],
  plugin_sdk: [],
  link_multiplayer: ["trigger"],
  save_ui_profile: ["room"]
};

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

const ADVANCED_BUDGETS: Record<SceneAdvancedCapabilityID, ScenePhysicalBudget> = {
  affine_background: budget({ bgTiles: 256, paletteColors: 256, vramBytes: 32768, dmaBytes: 32768, vblankTicks: 160, cpuWorkTicks: 220 }),
  affine_obj: budget({ objTiles: 32, oam: 8, vramBytes: 1024, dmaBytes: 1024, vblankTicks: 80, cpuWorkTicks: 120 }),
  hblank_timeline: budget({ dmaBytes: 160 * 2, vblankTicks: 160, cpuWorkTicks: 180 }),
  animation_state_machine: budget({ objTiles: 32, oam: 8, eventBytes: 384, dmaBytes: 1024, vblankTicks: 48, cpuWorkTicks: 180 }),
  metatiles: budget({ bgTiles: 256, paletteColors: 16, vramBytes: 256 * 32, eventBytes: 192, dmaBytes: 256 * 32, cpuWorkTicks: 96 }),
  plugin_sdk: budget({ eventBytes: 128, cpuWorkTicks: 32 }),
  link_multiplayer: budget({ eventBytes: 256, audioBytes: 0, dmaBytes: 64, vblankTicks: 32, cpuWorkTicks: 240 }),
  save_ui_profile: budget({ objTiles: 32, oam: 8, vramBytes: 1024, eventBytes: 192, cpuWorkTicks: 96 })
};

const ADVANCED_SETTINGS: Record<SceneAdvancedCapabilityID, readonly SceneCapabilitySettingDefinition[]> = {
  affine_background: [
    { key: "logicalWidthPixels", type: "number" },
    { key: "logicalHeightPixels", type: "number" },
    { key: "physicalMapTiles", type: "number" }
  ],
  affine_obj: [
    { key: "doubleSize", type: "boolean", defaultValue: false },
    { key: "matrixIndex", type: "number", defaultValue: 0, minimum: 0, maximum: 31, integer: true },
    { key: "scaleX", type: "number", defaultValue: 1, minimum: 0.5, maximum: 4 },
    { key: "scaleY", type: "number", defaultValue: 1, minimum: 0.5, maximum: 4 },
    { key: "rotationDegrees", type: "number", defaultValue: 0, minimum: -180, maximum: 180, integer: true }
  ],
  hblank_timeline: [{ key: "keyframeCount", type: "number" }],
  animation_state_machine: [
    { key: "animationStateBindings", type: "boolean" },
    { key: "eventTransitions", type: "boolean" }
  ],
  metatiles: [{ key: "blockSize", type: "string" }],
  plugin_sdk: [{ key: "sdkVersion", type: "string" }],
  link_multiplayer: [{ key: "transport", type: "string" }],
  save_ui_profile: [
    { key: "profileId", type: "string" },
    { key: "slotCount", type: "number" },
    { key: "customLabels", type: "boolean" }
  ]
};

const ADVANCED_ENGINE_FEATURES: Record<SceneAdvancedCapabilityID, readonly string[]> = {
  affine_background: [
    "shmup_runtime.affine_background",
    "render_runtime.affine_bg_transform",
    "render_runtime.affine_bg_tilemap_load"
  ],
  affine_obj: ["affine_obj_transform", "affine_obj_keyframes"],
  hblank_timeline: ["hblank_line_scroll", "hblank_bg_scroll_dma"],
  animation_state_machine: ["actor_animation_state"],
  metatiles: [],
  plugin_sdk: [],
  link_multiplayer: ["link_session_host", "link_session_join", "link_transfer_byte", "link_session_multiplayer4", "link_transfer_16bit", "link_rumble_gpio"],
  save_ui_profile: ["save.export_project_config"]
};

const ADVANCED_FALLBACKS: Record<SceneAdvancedCapabilityID, string> = {
  affine_background: "Use o fundo regular tiled em BG2; o mundo lógico Affine não será exportado.",
  affine_obj: "Use o sprite OBJ regular; a escala/rotação affine não será aplicada.",
  hblank_timeline: "Use a tabela HBlank estática ou volte ao compositor tiled.",
  animation_state_machine: "Use a animação idle e eventos convencionais da cena.",
  metatiles: "Exporte o mapa como tiles individuais; colisão e semântica devem ser autoradas novamente.",
  plugin_sdk: "Desative o plugin ou instale uma versão compatível do SDK.",
  link_multiplayer: "Falhe a validação da cena; não há fallback local seguro para multiplayer.",
  save_ui_profile: "Use o perfil padrão de save/UI do runtime."
};

const ADVANCED_VERIFICATION = {
  tests: ["sceneAdvancedCapabilities.test.ts", "sceneTypeProfiles.test.ts", "exportEngineProject.test.ts"],
  evidence: ["npm run smoke:exemplo-scenes", "npm run verify:mgba-web"]
} as const;

export const SCENE_ADVANCED_CAPABILITY_REGISTRY: readonly SceneCapabilityDefinition[] = SCENE_ADVANCED_CAPABILITY_IDS.map((id) => ({
  id,
  label: ADVANCED_LABELS[id],
  sceneProfiles: ADVANCED_PROFILES[id],
  available: true,
  required: false,
  verified: true,
  assets: ADVANCED_ASSETS[id],
  editorTools: ADVANCED_EDITOR_TOOLS[id],
  budget: ADVANCED_BUDGETS[id],
  fallback: ADVANCED_FALLBACKS[id],
  verification: ADVANCED_VERIFICATION,
  settings: ADVANCED_SETTINGS[id],
  engineFeaturesByProfile: Object.fromEntries(ADVANCED_PROFILES[id].map((profile) => [profile, ADVANCED_ENGINE_FEATURES[id]]))
}));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAdvancedCapabilityID(value: unknown): value is SceneAdvancedCapabilityID {
  return typeof value === "string" && (SCENE_ADVANCED_CAPABILITY_IDS as readonly string[]).includes(value);
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

function addInvalidSettingIssue(
  issues: SceneFeatureValidationIssue[],
  capabilityID: SceneAdvancedCapabilityID,
  setting: SceneCapabilitySettingDefinition,
  message: string
): void {
  issues.push({
    code: "INVALID_CAPABILITY_SETTINGS",
    module: capabilityID,
    field: setting.key,
    message
  });
}

export function resolveSceneAdvancedCapabilities(
  sceneType: string,
  value?: unknown,
  editorTools?: readonly string[]
): SceneAdvancedCapabilityResolution {
  const source = value === undefined ? [] : value;
  if (!Array.isArray(source)) {
    return {
      capabilities: [],
      issues: [{ code: "INVALID_CAPABILITY_CONFIG", message: "A configuração de capabilities avançadas deve ser uma lista." }]
    };
  }

  const issues: SceneFeatureValidationIssue[] = [];
  const capabilities: SceneAdvancedCapabilityConfig[] = [];
  const seen = new Set<SceneAdvancedCapabilityID>();
  for (const entry of source) {
    const rawID = isRecord(entry) && typeof entry.id === "string" ? entry.id : undefined;
    if (!isRecord(entry) || !isAdvancedCapabilityID(entry.id)) {
      issues.push({
        code: "UNKNOWN_CAPABILITY",
        module: rawID,
        field: "id",
        message: "A capability avançada informada não pertence ao registry fechado."
      });
      continue;
    }
    const id = entry.id;
    const definition = SCENE_ADVANCED_CAPABILITY_REGISTRY.find((candidate) => candidate.id === id);
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
    } else {
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
      }
      for (const [key, value] of Object.entries(normalizedSettings.settings)) {
        const settingDefinition = settingDefinitions.get(key);
        if (!settingDefinition || typeof value !== settingDefinition.type || settingDefinition.type !== "number" || typeof value !== "number") {
          continue;
        }
        if (!Number.isFinite(value)) {
          addInvalidSettingIssue(issues, id, settingDefinition, `A configuração ${key} da capability ${id} precisa ser um número finito.`);
          continue;
        }
        if (settingDefinition.integer && !Number.isInteger(value)) {
          addInvalidSettingIssue(issues, id, settingDefinition, `A configuração ${key} da capability ${id} precisa ser um número inteiro.`);
        }
        if (settingDefinition.minimum !== undefined && value < settingDefinition.minimum) {
          addInvalidSettingIssue(issues, id, settingDefinition, `A configuração ${key} da capability ${id} não pode ser menor que ${settingDefinition.minimum}.`);
        }
        if (settingDefinition.maximum !== undefined && value > settingDefinition.maximum) {
          addInvalidSettingIssue(issues, id, settingDefinition, `A configuração ${key} da capability ${id} não pode ser maior que ${settingDefinition.maximum}.`);
        }
      }
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
    if (id === "plugin_sdk" && normalizedSettings.settings !== null) {
      const sdkVersion = normalizedSettings.settings.sdkVersion;
      if (sdkVersion !== undefined && (
        typeof sdkVersion !== "string"
        || !/^(?:[~^]|>=|<=|>|<)?\d+\.\d+\.\d+$/.test(sdkVersion.trim())
      )) {
        issues.push({
          code: "INVALID_CAPABILITY_SETTINGS",
          module: id,
          field: "sdkVersion",
          message: "A capability plugin_sdk precisa declarar sdkVersion como uma versão semver ou constraint semver simples."
        });
      }
    }
    if (normalizedSettings.settings !== null && !issues.some((issue) => issue.module === id && issue.code === "INVALID_CAPABILITY_SETTINGS")) {
      capabilities.push({
        id,
        enabled: entry.enabled,
        ...(required ? { required: true } : {}),
        settings: normalizedSettings.settings
      });
    }
  }
  return { capabilities, issues };
}

export interface SceneAffineObjPreview {
  doubleSize: boolean;
  matrixIndex: number;
  scaleX: number;
  scaleY: number;
  rotationDegrees: number;
}

export function resolveSceneAffineObjPreview(sceneType: string, value?: unknown): SceneAffineObjPreview | null {
  const resolution = resolveSceneAdvancedCapabilities(sceneType, value);
  const capability = resolution.capabilities.find((candidate) => candidate.id === "affine_obj" && candidate.enabled);
  if (!capability || resolution.issues.some((issue) => issue.module === "affine_obj" && issue.code === "INVALID_CAPABILITY_SETTINGS")) {
    return null;
  }
  const settings = capability.settings;
  const presentation = normalizeAffineScenePresentation({
    rotationDegrees: typeof settings.rotationDegrees === "number" ? settings.rotationDegrees : 0,
    scaleX: typeof settings.scaleX === "number" ? settings.scaleX : 1,
    scaleY: typeof settings.scaleY === "number" ? settings.scaleY : 1
  });
  return {
    doubleSize: settings.doubleSize === true,
    matrixIndex: Math.max(0, Math.min(31, Math.floor(typeof settings.matrixIndex === "number" ? settings.matrixIndex : 0))),
    rotationDegrees: presentation.rotationDegrees,
    scaleX: presentation.scaleX,
    scaleY: presentation.scaleY
  };
}
