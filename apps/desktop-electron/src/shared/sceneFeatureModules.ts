import {
  SCENE_ADVANCED_CAPABILITY_REGISTRY,
  resolveSceneAdvancedCapabilities,
  type SceneAdvancedCapabilityID
} from "./sceneAdvancedCapabilities.js";
import {
  SCENE_TACTICAL_CAPABILITY_REGISTRY,
  resolveIsometricTacticalCapabilities,
  type SceneTacticalCapabilityID
} from "./isometricTacticalPresentation.js";

export const SCENE_FEATURE_MODULES = [
  "movement",
  "dialogue",
  "quests",
  "shop",
  "battle",
  "waves",
  "score",
  "inventory",
  "camera",
  "compass",
  "map"
] as const;

export type SceneFeatureModule = typeof SCENE_FEATURE_MODULES[number];
export type SceneCapabilityID = SceneFeatureModule | SceneAdvancedCapabilityID | SceneTacticalCapabilityID;
export type SceneFeatureSettingValue = string | number | boolean;

export interface SceneBudget {
  bgTiles: number;
  objTiles: number;
  oam: number;
  vramBytes: number;
  eventBytes: number;
}

export interface SceneFeatureModuleConfig {
  id: SceneFeatureModule;
  enabled: boolean;
  settings: Record<string, SceneFeatureSettingValue>;
}

export interface ScenePhysicalBudget {
  bgTiles: number;
  objTiles: number;
  oam: number;
  paletteColors: number;
  vramBytes: number;
  eventBytes: number;
  audioBytes: number;
  dmaBytes: number;
  vblankTicks: number;
  cpuWorkTicks: number;
}

export interface SceneCapabilityAssetRequirement {
  kind: string;
  required: boolean;
  reason: string;
}

export interface SceneCapabilitySettingDefinition {
  key: string;
  type: "string" | "number" | "boolean";
  defaultValue?: SceneFeatureSettingValue;
  minimum?: number;
  maximum?: number;
  integer?: boolean;
}

export interface SceneCapabilityDefinition {
  id: SceneCapabilityID;
  label: string;
  sceneProfiles: readonly string[];
  available: boolean;
  required: boolean;
  verified: boolean;
  assets: readonly SceneCapabilityAssetRequirement[];
  editorTools: readonly string[];
  budget: ScenePhysicalBudget;
  fallback: string;
  verification: {
    tests: readonly string[];
    evidence: readonly string[];
  };
  settings: readonly SceneCapabilitySettingDefinition[];
  engineFeaturesByProfile?: Readonly<Record<string, readonly string[]>>;
}

export interface ResolvedSceneCapability {
  id: SceneCapabilityID;
  label: string;
  sceneProfiles: string[];
  available: boolean;
  required: boolean;
  verified: boolean;
  assets: SceneCapabilityAssetRequirement[];
  editorTools: string[];
  budget: ScenePhysicalBudget;
  fallback: string;
  verification: {
    tests: string[];
    evidence: string[];
  };
  settings: Record<string, SceneFeatureSettingValue>;
  engineFeatures: string[];
  status: {
    available: boolean;
    enabled: boolean;
    required: boolean;
    verified: boolean;
  };
}

export interface SceneCapabilityManifest {
  schema: 1;
  registry: "gba-studio-scene-capabilities";
  sceneType: string;
  profileBudget: ScenePhysicalBudget;
  capabilities: ResolvedSceneCapability[];
  issues: SceneFeatureValidationIssue[];
}

export interface SceneTypeProfileCapabilities {
  featureModules: SceneFeatureModule[];
  runtimeCapabilities: string[];
  assetRules: string[];
  budget: SceneBudget;
  physicalBudget?: ScenePhysicalBudget;
  preview: {
    mode: "map" | "focus" | "play";
    overlays: string[];
  };
}

export type SceneFeatureValidationCode =
  | "UNKNOWN_MODULE"
  | "INCOMPATIBLE_MODULE"
  | "INVALID_MODULE_CONFIG"
  | "INVALID_MODULE_SETTINGS"
  | "BUDGET_EXCEEDED"
  | "BUDGET_NEGATIVE"
  | "MISSING_EDITOR_TOOL"
  | "UNKNOWN_CAPABILITY"
  | "INCOMPATIBLE_CAPABILITY"
  | "INVALID_CAPABILITY_CONFIG"
  | "INVALID_CAPABILITY_SETTINGS"
  | "REQUIRED_CAPABILITY_DISABLED"
  | "MISSING_CAPABILITY_ASSET"
  | "INVALID_TACTICAL_PRESENTATION";

export interface SceneFeatureValidationIssue {
  code: SceneFeatureValidationCode;
  module?: string;
  field?: keyof SceneBudget | string;
  message: string;
}

export interface SceneFeatureResolution {
  modules: SceneFeatureModuleConfig[];
  issues: SceneFeatureValidationIssue[];
}

const DEFAULT_BUDGET: SceneBudget = {
  bgTiles: 512,
  objTiles: 256,
  oam: 64,
  vramBytes: 64 * 1024,
  eventBytes: 8192
};

const DEFAULT_PHYSICAL_BUDGET: ScenePhysicalBudget = {
  bgTiles: 896,
  objTiles: 1024,
  oam: 128,
  paletteColors: 512,
  vramBytes: 96 * 1024,
  eventBytes: 8192,
  audioBytes: 65535,
  dmaBytes: 32 * 1024,
  vblankTicks: 4370,
  cpuWorkTicks: 4370
};

const PROFILE_CAPABILITIES: Record<string, SceneTypeProfileCapabilities> = {
  topdown: {
    featureModules: ["movement", "dialogue", "inventory", "quests", "shop", "camera"],
    runtimeCapabilities: ["topdown_movement", "dialogue_events", "inventory_state", "quest_state", "shop_catalog"],
    assetRules: ["tilemap_4bpp", "actor_sprite_4bpp", "dialogue_font_gba"],
    budget: { ...DEFAULT_BUDGET, eventBytes: 12288 },
    preview: { mode: "map", overlays: ["collision", "actors", "modules"] }
  },
  platformer: {
    featureModules: ["movement", "camera"],
    runtimeCapabilities: ["platformer_physics", "camera_follow"],
    assetRules: ["tilemap_4bpp", "actor_sprite_4bpp"],
    budget: { ...DEFAULT_BUDGET },
    preview: { mode: "play", overlays: ["collision", "camera", "modules"] }
  },
  shmup: {
    featureModules: ["movement", "score", "waves", "camera"],
    runtimeCapabilities: ["shmup_movement", "shmup_score", "shmup_waves", "camera_scroll", "shmup_hud_bg0", "shmup_actor_obj", "shmup_collision_data"],
    assetRules: ["tilemap_4bpp", "actor_sprite_4bpp", "oam_budgeted_enemies", "affine_bg_8bpp_optional"],
    budget: { ...DEFAULT_BUDGET, objTiles: 192, oam: 48 },
    preview: { mode: "play", overlays: ["hud", "actors", "obstacles", "collision", "camera", "modules"] }
  },
  isometric: {
    featureModules: ["movement", "dialogue", "quests", "camera"],
    runtimeCapabilities: ["isometric_diamond_2to1", "isometric_tactical_core", "dialogue_events", "quest_state"],
    assetRules: ["tilemap_4bpp", "height_layers_0_3", "actor_sprite_4bpp"],
    budget: { ...DEFAULT_BUDGET, bgTiles: 384 },
    preview: { mode: "focus", overlays: ["height", "collision", "modules"] }
  },
  dungeonCrawler: {
    featureModules: ["movement", "dialogue", "inventory", "battle", "compass", "map", "camera"],
    runtimeCapabilities: ["dungeon_grid_movement", "dungeon_camera", "dungeon_compass", "dungeon_map", "inventory_state", "battle_state"],
    assetRules: ["tilemap_4bpp", "corridor_grid", "actor_sprite_4bpp"],
    budget: { ...DEFAULT_BUDGET, bgTiles: 384, eventBytes: 12288 },
    preview: { mode: "play", overlays: ["collision", "camera", "modules"] }
  },
  racing: {
    featureModules: ["movement", "camera"],
    runtimeCapabilities: ["racing_movement", "camera_follow"],
    assetRules: ["tilemap_4bpp", "actor_sprite_4bpp"],
    budget: { ...DEFAULT_BUDGET },
    preview: { mode: "play", overlays: ["camera", "collision", "modules"] }
  },
  pointAndClick: {
    featureModules: ["dialogue", "camera"],
    runtimeCapabilities: ["point_click_hotspots", "dialogue_events"],
    assetRules: ["tilemap_4bpp", "hotspot_trigger"],
    budget: { ...DEFAULT_BUDGET },
    preview: { mode: "focus", overlays: ["actors", "triggers", "modules"] }
  },
  battleRpg: {
    featureModules: ["dialogue", "battle", "inventory"],
    runtimeCapabilities: ["battle_state", "inventory_state", "dialogue_events"],
    assetRules: ["tilemap_4bpp", "actor_sprite_4bpp", "portrait_4bpp"],
    budget: { ...DEFAULT_BUDGET, objTiles: 192, eventBytes: 12288 },
    preview: { mode: "play", overlays: ["actors", "modules"] }
  },
  luta: {
    featureModules: ["movement", "battle", "camera"],
    runtimeCapabilities: ["fighting_state", "camera_follow"],
    assetRules: ["tilemap_4bpp", "fighter_sprite_4bpp"],
    budget: { ...DEFAULT_BUDGET, objTiles: 192 },
    physicalBudget: { ...DEFAULT_PHYSICAL_BUDGET },
    preview: { mode: "play", overlays: ["actors", "camera", "modules"] }
  },
  worldMap: {
    featureModules: ["dialogue", "quests", "camera"],
    runtimeCapabilities: ["world_map_navigation", "quest_state", "dialogue_events"],
    assetRules: ["world_map_tiles_4bpp", "marker_sprite_4bpp"],
    budget: { ...DEFAULT_BUDGET },
    preview: { mode: "map", overlays: ["connections", "markers", "modules"] }
  },
  visualNovel: {
    featureModules: ["dialogue"],
    runtimeCapabilities: ["dialogue_events"],
    assetRules: ["background_4bpp", "portrait_4bpp", "dialogue_font_gba"],
    budget: { ...DEFAULT_BUDGET, bgTiles: 384, objTiles: 192 },
    preview: { mode: "focus", overlays: ["dialogue", "modules"] }
  },
  cutscene: {
    featureModules: ["dialogue", "camera"],
    runtimeCapabilities: ["dialogue_events", "camera_sequence"],
    assetRules: ["background_4bpp", "actor_sprite_4bpp"],
    budget: { ...DEFAULT_BUDGET },
    preview: { mode: "focus", overlays: ["camera", "dialogue", "modules"] }
  },
  menu: {
    featureModules: [],
    runtimeCapabilities: ["menu_navigation"],
    assetRules: ["background_4bpp", "dialogue_font_gba"],
    budget: { ...DEFAULT_BUDGET, bgTiles: 384, objTiles: 192 },
    preview: { mode: "focus", overlays: ["modules"] }
  },
  custom: {
    featureModules: [],
    runtimeCapabilities: [],
    assetRules: [],
    budget: { ...DEFAULT_BUDGET },
    preview: { mode: "map", overlays: ["modules"] }
  }
};

const MODULE_EDITOR_TOOL_REQUIREMENTS: Partial<Record<SceneFeatureModule, string[]>> = {
  movement: ["actor"],
  dialogue: ["trigger"],
  quests: ["trigger"],
  shop: ["trigger"],
  battle: ["actor"],
  waves: ["actor"],
  score: ["actor"],
  inventory: ["actor"]
};

const CAPABILITY_SETTINGS: Partial<Record<SceneFeatureModule, readonly SceneCapabilitySettingDefinition[]>> = {
  movement: [{ key: "depthSprites", type: "boolean" }],
  score: [
    { key: "initialScore", type: "number" },
    { key: "pointsPerEnemy", type: "number" },
    { key: "initialLives", type: "number" },
    { key: "persistHighScore", type: "boolean" }
  ],
  waves: [
    { key: "maxWaves", type: "number" },
    { key: "maxEnemies", type: "number" },
    { key: "loop", type: "boolean" }
  ],
  quests: [
    { key: "stateVariable", type: "number" },
    { key: "activeValue", type: "number" },
    { key: "completedValue", type: "number" },
    { key: "objective", type: "string" },
    { key: "objectiveItem", type: "number" },
    { key: "objectiveQuantity", type: "number" },
    { key: "rewardItem", type: "number" },
    { key: "rewardQuantity", type: "number" }
  ],
  shop: [
    { key: "label", type: "string" },
    { key: "item", type: "number" },
    { key: "currency", type: "string" },
    { key: "currencyItem", type: "number" },
    { key: "price", type: "number" },
    { key: "stockVariable", type: "number" },
    { key: "stock", type: "number" }
  ],
  inventory: [
    { key: "item", type: "number" },
    { key: "label", type: "string" },
    { key: "initialQuantity", type: "number" },
    { key: "healAmount", type: "number" }
  ],
  battle: [
    { key: "enemyActor", type: "string" },
    { key: "enemyName", type: "string" },
    { key: "maxHp", type: "number" },
    { key: "playerDamage", type: "number" },
    { key: "enemyDamage", type: "number" },
    { key: "rewardItem", type: "number" },
    { key: "rewardQuantity", type: "number" }
  ]
};

const CAPABILITY_PROFILES: Record<SceneFeatureModule, readonly string[]> = {
  movement: ["topdown", "platformer", "shmup", "isometric", "dungeonCrawler", "racing", "luta"],
  dialogue: ["topdown", "isometric", "dungeonCrawler", "pointAndClick", "battleRpg", "worldMap", "visualNovel", "cutscene"],
  quests: ["topdown", "isometric", "worldMap"],
  shop: ["topdown"],
  battle: ["dungeonCrawler", "battleRpg", "luta"],
  waves: ["shmup"],
  score: ["shmup"],
  inventory: ["topdown", "dungeonCrawler", "battleRpg"],
  camera: ["topdown", "platformer", "shmup", "isometric", "dungeonCrawler", "racing", "pointAndClick", "luta", "worldMap", "cutscene"],
  compass: ["dungeonCrawler"],
  map: ["dungeonCrawler"]
};

const CAPABILITY_LABELS: Record<SceneFeatureModule, string> = {
  movement: "Movimento",
  dialogue: "Diálogos",
  quests: "Quests",
  shop: "Loja",
  battle: "Batalha",
  waves: "Ondas",
  score: "Pontuação",
  inventory: "Inventário",
  camera: "Câmera",
  compass: "Bússola",
  map: "Mapa"
};

const CAPABILITY_ASSETS: Record<SceneFeatureModule, readonly SceneCapabilityAssetRequirement[]> = {
  movement: [{ kind: "actor_sprite", required: true, reason: "O runtime precisa de um ator controlável." }],
  dialogue: [{ kind: "dialogue_font", required: true, reason: "Texto e caixa de diálogo precisam de uma fonte GBA." }],
  quests: [{ kind: "trigger", required: true, reason: "A progressão é acionada por eventos ou triggers." }],
  shop: [{ kind: "trigger", required: true, reason: "A loja é aberta por uma interação da cena." }],
  battle: [{ kind: "actor_sprite", required: true, reason: "O encontro precisa de atores para o combate." }],
  waves: [{ kind: "actor_sprite", required: true, reason: "Ondas precisam de atores inimigos ou projéteis." }],
  score: [{ kind: "actor_sprite", required: true, reason: "A pontuação acompanha entidades da cena." }],
  inventory: [{ kind: "actor_sprite", required: true, reason: "O inventário é exposto por uma entidade ou HUD." }],
  camera: [],
  compass: [{ kind: "ui_compass", required: true, reason: "A bússola usa um componente de UI compatível." }],
  map: [{ kind: "ui_map", required: true, reason: "O mapa usa um componente de UI compatível." }]
};

const EMPTY_CAPABILITY_BUDGET: ScenePhysicalBudget = {
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

function capabilityBudget(overrides: Partial<ScenePhysicalBudget>): ScenePhysicalBudget {
  return { ...EMPTY_CAPABILITY_BUDGET, ...overrides };
}

const CAPABILITY_BUDGETS: Record<SceneFeatureModule, ScenePhysicalBudget> = {
  movement: capabilityBudget({ cpuWorkTicks: 180, eventBytes: 128, oam: 4 }),
  dialogue: capabilityBudget({ cpuWorkTicks: 120, eventBytes: 256, objTiles: 16, oam: 8 }),
  quests: capabilityBudget({ cpuWorkTicks: 80, eventBytes: 192 }),
  shop: capabilityBudget({ cpuWorkTicks: 100, eventBytes: 224, objTiles: 16, oam: 8 }),
  battle: capabilityBudget({ cpuWorkTicks: 260, eventBytes: 384, objTiles: 64, oam: 16 }),
  waves: capabilityBudget({ cpuWorkTicks: 420, eventBytes: 512, objTiles: 96, oam: 24, dmaBytes: 2048 }),
  score: capabilityBudget({ cpuWorkTicks: 90, eventBytes: 96 }),
  inventory: capabilityBudget({ cpuWorkTicks: 100, eventBytes: 192, objTiles: 32, oam: 8 }),
  camera: capabilityBudget({ cpuWorkTicks: 80, eventBytes: 96, dmaBytes: 1024 }),
  compass: capabilityBudget({ cpuWorkTicks: 60, eventBytes: 64, objTiles: 8, oam: 2 }),
  map: capabilityBudget({ cpuWorkTicks: 100, eventBytes: 128, objTiles: 16, oam: 4 })
};

const CAPABILITY_VERIFICATION = {
  tests: ["sceneTypeProfiles.test.ts", "exportEngineProject.test.ts"],
  evidence: ["npm run smoke:exemplo-scenes", "npm run verify:mgba-web"]
} as const;

const ENGINE_RUNTIME_NAMES: Record<string, string> = {
  topdown: "topdown",
  platformer: "platformer",
  shmup: "shmup",
  isometric: "isometric",
  dungeonCrawler: "dungeon_crawler",
  racing: "racing",
  pointAndClick: "point_click",
  battleRpg: "battle_rpg",
  luta: "luta",
  worldMap: "world_map",
  visualNovel: "visual_novel",
  cutscene: "cutscene"
};

function capabilityEngineFeatures(id: SceneFeatureModule, profile: string): readonly string[] {
  if (id === "camera") return [];
  if (id === "dialogue") return ["dialogue.visual_box"];
  if (profile === "topdown" && ["inventory", "quests", "shop"].includes(id)) {
    return [`topdown_runtime.${id}`];
  }
  if (profile === "dungeonCrawler" && ["inventory", "battle"].includes(id)) {
    return [`dungeon_crawler_runtime.${id}`];
  }
  if (profile === "shmup" && ["score", "waves"].includes(id)) {
    return [`shmup_runtime.${id}`];
  }
  const runtimeName = ENGINE_RUNTIME_NAMES[profile];
  return runtimeName ? [`${runtimeName}_runtime`] : [];
}

export const SCENE_CAPABILITY_REGISTRY: readonly SceneCapabilityDefinition[] = [
  ...SCENE_FEATURE_MODULES.map((id): SceneCapabilityDefinition => ({
    id,
    label: CAPABILITY_LABELS[id],
    sceneProfiles: CAPABILITY_PROFILES[id],
    available: true,
    required: false,
    verified: true,
    assets: CAPABILITY_ASSETS[id],
    editorTools: MODULE_EDITOR_TOOL_REQUIREMENTS[id] ?? [],
    budget: CAPABILITY_BUDGETS[id],
    fallback: `Desative ${CAPABILITY_LABELS[id]} nesta cena ou use o perfil sem esse módulo.`,
    verification: CAPABILITY_VERIFICATION,
    settings: CAPABILITY_SETTINGS[id] ?? [],
    engineFeaturesByProfile: Object.fromEntries(CAPABILITY_PROFILES[id].map((profile) => [
      profile,
      capabilityEngineFeatures(id, profile)
    ]))
  })),
  ...SCENE_ADVANCED_CAPABILITY_REGISTRY,
  ...SCENE_TACTICAL_CAPABILITY_REGISTRY
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSceneFeatureModule(value: unknown): value is SceneFeatureModule {
  return typeof value === "string" && (SCENE_FEATURE_MODULES as readonly string[]).includes(value);
}

export function sceneTypeCapabilities(sceneType: string): SceneTypeProfileCapabilities {
  const capabilities = PROFILE_CAPABILITIES[sceneType] ?? PROFILE_CAPABILITIES.custom;
  const physicalBudget: ScenePhysicalBudget = {
    ...DEFAULT_PHYSICAL_BUDGET,
    bgTiles: capabilities.budget.bgTiles,
    objTiles: capabilities.budget.objTiles,
    oam: capabilities.budget.oam,
    vramBytes: capabilities.budget.vramBytes,
    eventBytes: capabilities.budget.eventBytes,
    ...(capabilities.physicalBudget ?? {})
  };
  return {
    ...capabilities,
    featureModules: capabilities.featureModules.filter((moduleID) => (
      SCENE_CAPABILITY_REGISTRY.some((capability) => (
        capability.id === moduleID && capability.sceneProfiles.includes(sceneType)
      ))
    )),
    runtimeCapabilities: Array.from(new Set([
      ...capabilities.runtimeCapabilities,
      "affine_background_optional"
    ])),
    assetRules: [...capabilities.assetRules],
    budget: { ...capabilities.budget },
    physicalBudget,
    preview: { ...capabilities.preview, overlays: [...capabilities.preview.overlays] }
  };
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

export function resolveSceneFeatureModules(
  sceneType: string,
  value?: unknown,
  editorTools?: readonly string[]
): SceneFeatureResolution {
  const capabilities = sceneTypeCapabilities(sceneType);
  const issues: SceneFeatureValidationIssue[] = [];
  const source = value === undefined ? [] : value;
  if (!Array.isArray(source)) {
    return {
      modules: [],
      issues: [{ code: "INVALID_MODULE_CONFIG", message: "A configuração de módulos deve ser uma lista." }]
    };
  }

  const modules: SceneFeatureModuleConfig[] = [];
  for (const entry of source) {
    if (!isRecord(entry) || !isSceneFeatureModule(entry.id)) {
      issues.push({
        code: "UNKNOWN_MODULE",
        module: isRecord(entry) && typeof entry.id === "string" ? entry.id : undefined,
        message: "O módulo informado não pertence ao registro fechado de capacidades."
      });
      continue;
    }
    if (!capabilities.featureModules.includes(entry.id)) {
      issues.push({
        code: "INCOMPATIBLE_MODULE",
        module: entry.id,
        message: `O módulo ${entry.id} não é compatível com o perfil ${sceneType}.`
      });
      continue;
    }
    if (typeof entry.enabled !== "boolean") {
      issues.push({
        code: "INVALID_MODULE_CONFIG",
        module: entry.id,
        message: `O módulo ${entry.id} exige enabled=true ou enabled=false explícito; ausência não habilita o recurso.`
      });
      continue;
    }
    const definition = SCENE_CAPABILITY_REGISTRY.find((capability) => capability.id === entry.id);
    const normalizedSettings = normalizeSettings(entry.settings);
    if (normalizedSettings.invalid || normalizedSettings.settings === null) {
      issues.push({
        code: "INVALID_MODULE_SETTINGS",
        module: entry.id,
        message: `As configurações do módulo ${entry.id} devem conter apenas valores simples.`
      });
      continue;
    }
    const settingDefinitions = new Map((definition?.settings ?? []).map((setting) => [setting.key, setting]));
    const invalidTypedSetting = Object.entries(normalizedSettings.settings).find(([key, setting]) => (
      !settingDefinitions.has(key) || typeof setting !== settingDefinitions.get(key)?.type
    ));
    if (invalidTypedSetting) {
      issues.push({
        code: "INVALID_MODULE_SETTINGS",
        module: entry.id,
        field: invalidTypedSetting[0],
        message: `A configuração ${invalidTypedSetting[0]} não é declarada pelo contrato tipado do módulo ${entry.id}.`
      });
      continue;
    }
    modules.push({ id: entry.id, enabled: entry.enabled, settings: normalizedSettings.settings });
    if (editorTools) {
      for (const requiredTool of definition?.editorTools ?? []) {
        if (!editorTools.includes(requiredTool)) {
          issues.push({
            code: "MISSING_EDITOR_TOOL",
            module: entry.id,
            field: requiredTool,
            message: `O módulo ${entry.id} exige a ferramenta de edição ${requiredTool}.`
          });
        }
      }
    }
  }
  return { modules, issues };
}

export function resolveSceneCapabilityManifest(
  sceneType: string,
  value?: unknown,
  editorTools?: readonly string[],
  advancedValue?: unknown,
  tacticalValue?: unknown
): SceneCapabilityManifest {
  const resolution = resolveSceneFeatureModules(sceneType, value, editorTools);
  const advancedResolution = resolveSceneAdvancedCapabilities(sceneType, advancedValue, editorTools);
  const tacticalResolution = resolveIsometricTacticalCapabilities(sceneType, tacticalValue, editorTools);
  const resolvedModules = new Map(resolution.modules.map((module) => [module.id, module]));
  const resolvedAdvanced = new Map(advancedResolution.capabilities.map((capability) => [capability.id, capability]));
  const resolvedTactical = new Map(tacticalResolution.capabilities.map((capability) => [capability.id, capability]));
  const capabilities = SCENE_CAPABILITY_REGISTRY
    .filter((capability) => capability.sceneProfiles.includes(sceneType))
    .map((capability): ResolvedSceneCapability => {
      const module = isSceneFeatureModule(capability.id) ? resolvedModules.get(capability.id) : undefined;
      const advanced = resolvedAdvanced.get(capability.id as SceneAdvancedCapabilityID);
      const tactical = resolvedTactical.get(capability.id as SceneTacticalCapabilityID);
      const enabled = module?.enabled === true || advanced?.enabled === true || tactical?.enabled === true;
      const required = capability.required || advanced?.required === true || tactical?.required === true;
      return {
        id: capability.id,
        label: capability.label,
        sceneProfiles: [...capability.sceneProfiles],
        available: capability.available,
        required,
        verified: capability.verified,
        assets: capability.assets.map((asset) => ({ ...asset })),
        editorTools: [...capability.editorTools],
        budget: { ...capability.budget },
        fallback: capability.fallback,
        verification: {
          tests: [...capability.verification.tests],
          evidence: [...capability.verification.evidence]
        },
        settings: module?.settings
          ? { ...module.settings }
          : advanced?.settings
            ? { ...advanced.settings }
            : tactical?.settings
              ? { ...tactical.settings }
              : {},
        engineFeatures: [...(capability.engineFeaturesByProfile?.[sceneType] ?? [])],
        status: {
          available: capability.available,
          enabled,
          required,
          verified: capability.verified
        }
      };
    });
  return {
    schema: 1,
    registry: "gba-studio-scene-capabilities",
    sceneType,
    profileBudget: { ...(sceneTypeCapabilities(sceneType).physicalBudget ?? DEFAULT_PHYSICAL_BUDGET) },
    capabilities,
    issues: [...resolution.issues, ...advancedResolution.issues, ...tacticalResolution.issues]
  };
}

export function validateSceneBudget(sceneType: string, requested: Partial<SceneBudget>): SceneFeatureValidationIssue[] {
  const budget = sceneTypeCapabilities(sceneType).budget;
  const issues: SceneFeatureValidationIssue[] = [];
  for (const [field, value] of Object.entries(requested) as Array<[keyof SceneBudget, unknown]>) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (value < 0) {
      issues.push({ code: "BUDGET_NEGATIVE", field, message: `O budget ${field} não pode ser negativo.` });
    } else if (value > budget[field]) {
      issues.push({ code: "BUDGET_EXCEEDED", field, message: `O budget ${field} excede o limite do perfil ${sceneType}.` });
    }
  }
  return issues;
}

export interface ShmupFeatureRuntimeConfig {
  scoreEnabled: boolean;
  highScoreEnabled: boolean;
  initialScore: number;
  pointsPerEnemy: number;
  initialLives: number;
  wavesEnabled: boolean;
  maxWaves: number;
  loopWaves: boolean;
}

export interface TopdownQuestRuntimeConfig {
  stateVariable: number;
  activeValue: number;
  completedValue: number;
  objectiveItem: number;
  objectiveQuantity: number;
  rewardItem: number;
  rewardQuantity: number;
}

export interface TopdownShopRuntimeConfig {
  label: string;
  item: number;
  currencyItem: number;
  price: number;
  stockVariable: number;
  stock: number;
}

export interface TopdownFeatureRuntimeConfig {
  inventoryEnabled: boolean;
  questsEnabled: boolean;
  shopEnabled: boolean;
  quest?: TopdownQuestRuntimeConfig;
  shop?: TopdownShopRuntimeConfig;
}

export interface DungeonCrawlerFeatureRuntimeConfig {
  inventoryEnabled: boolean;
  battleEnabled: boolean;
  compassEnabled: boolean;
  mapEnabled: boolean;
  depthSpritesEnabled: boolean;
  inventory?: {
    item: number;
    label: string;
    initialQuantity: number;
    healAmount: number;
  };
  battle?: {
    enemyActor: string;
    enemyName: string;
    maxHp: number;
    playerDamage: number;
    enemyDamage: number;
    rewardItem: number;
    rewardQuantity: number;
  };
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function moduleSettings(
  modules: SceneFeatureModuleConfig[],
  id: SceneFeatureModule
): SceneFeatureModuleConfig | undefined {
  return modules.find((module) => module.id === id);
}

export function resolveShmupFeatureRuntime(value?: unknown): ShmupFeatureRuntimeConfig {
  const resolution = resolveSceneFeatureModules("shmup", value);
  const score = moduleSettings(resolution.modules, "score");
  const waves = moduleSettings(resolution.modules, "waves");
  const scoreSettings = score?.settings ?? {};
  const waveSettings = waves?.settings ?? {};
  const scoreEnabled = score?.enabled ?? false;
  const wavesEnabled = waves?.enabled ?? false;
  return {
    scoreEnabled,
    highScoreEnabled: scoreEnabled && scoreSettings.persistHighScore !== false,
    initialScore: boundedInteger(scoreSettings.initialScore, 0, 0, 65535),
    pointsPerEnemy: boundedInteger(scoreSettings.pointsPerEnemy, 100, 0, 65535),
    initialLives: boundedInteger(scoreSettings.initialLives, 3, 0, 9),
    wavesEnabled,
    maxWaves: boundedInteger(waveSettings.maxWaves, 64, 1, 64),
    loopWaves: wavesEnabled && waveSettings.loop === true
  };
}

function boundedSetting(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return boundedInteger(value, fallback, minimum, maximum);
}

function stringSetting(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

export function resolveTopdownFeatureRuntime(value?: unknown): TopdownFeatureRuntimeConfig {
  const resolution = resolveSceneFeatureModules("topdown", value);
  const inventory = moduleSettings(resolution.modules, "inventory");
  const quests = moduleSettings(resolution.modules, "quests");
  const shop = moduleSettings(resolution.modules, "shop");
  const questSettings = quests?.settings ?? {};
  const shopSettings = shop?.settings ?? {};
  const questDefined = [
    "stateVariable", "activeValue", "completedValue", "objectiveItem", "objectiveQuantity", "rewardItem", "rewardQuantity"
  ].some((key) => Object.hasOwn(questSettings, key));
  const shopDefined = ["label", "item", "currencyItem", "price", "stockVariable", "stock"]
    .some((key) => Object.hasOwn(shopSettings, key));
  return {
    inventoryEnabled: inventory?.enabled ?? false,
    questsEnabled: quests?.enabled ?? false,
    shopEnabled: shop?.enabled ?? false,
    ...(questDefined ? {
      quest: {
        stateVariable: boundedSetting(questSettings.stateVariable, 0, 0, 63),
        activeValue: boundedSetting(questSettings.activeValue, 1, -32768, 32767),
        completedValue: boundedSetting(questSettings.completedValue, 2, -32768, 32767),
        objectiveItem: boundedSetting(questSettings.objectiveItem, 0, 0, 15),
        objectiveQuantity: boundedSetting(questSettings.objectiveQuantity, 1, 1, 999),
        rewardItem: boundedSetting(questSettings.rewardItem, 1, 0, 15),
        rewardQuantity: boundedSetting(questSettings.rewardQuantity, 1, 1, 999)
      }
    } : {}),
    ...(shopDefined ? {
      shop: {
        label: stringSetting(shopSettings.label, "ITEM 2"),
        item: boundedSetting(shopSettings.item, 1, 0, 15),
        currencyItem: boundedSetting(shopSettings.currencyItem, 0, 0, 15),
        price: boundedSetting(shopSettings.price, 1, 1, 999),
        stockVariable: boundedSetting(shopSettings.stockVariable, -1, -1, 63),
        stock: boundedSetting(shopSettings.stock, 0, 0, 999)
      }
    } : {})
  };
}

export function resolveDungeonCrawlerFeatureRuntime(value?: unknown): DungeonCrawlerFeatureRuntimeConfig {
  const resolution = resolveSceneFeatureModules("dungeonCrawler", value);
  const inventory = moduleSettings(resolution.modules, "inventory");
  const battle = moduleSettings(resolution.modules, "battle");
  const compass = moduleSettings(resolution.modules, "compass");
  const map = moduleSettings(resolution.modules, "map");
  const movement = moduleSettings(resolution.modules, "movement");
  const inventorySettings = inventory?.settings ?? {};
  const battleSettings = battle?.settings ?? {};
  return {
    inventoryEnabled: inventory?.enabled ?? false,
    battleEnabled: battle?.enabled ?? false,
    compassEnabled: compass?.enabled ?? false,
    mapEnabled: map?.enabled ?? false,
    depthSpritesEnabled: movement?.settings.depthSprites !== false,
    ...(inventory ? {
      inventory: {
        item: boundedSetting(inventorySettings.item, 0, 0, 15),
        label: stringSetting(inventorySettings.label, "ITEM"),
        initialQuantity: boundedSetting(inventorySettings.initialQuantity, 1, 0, 999),
        healAmount: boundedSetting(inventorySettings.healAmount, 1, 0, 99)
      }
    } : {}),
    ...(battle ? {
      battle: {
        enemyActor: stringSetting(battleSettings.enemyActor, ""),
        enemyName: stringSetting(battleSettings.enemyName, "INIMIGO"),
        maxHp: boundedSetting(battleSettings.maxHp, 3, 1, 99),
        playerDamage: boundedSetting(battleSettings.playerDamage, 1, 1, 99),
        enemyDamage: boundedSetting(battleSettings.enemyDamage, 1, 1, 99),
        rewardItem: boundedSetting(battleSettings.rewardItem, 1, 0, 15),
        rewardQuantity: boundedSetting(battleSettings.rewardQuantity, 1, 0, 999)
      }
    } : {})
  };
}
