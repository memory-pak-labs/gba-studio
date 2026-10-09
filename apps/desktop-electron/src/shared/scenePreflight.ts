import { hasPagedWorldMap, PAGED_WORLD_MAP } from './pagedWorldMap.js';
import type { GBAProjectData } from "./projectFile.js";
import { buildGbaHardwareContract, type GbaHardwareSceneContract } from "./gbaHardwareContract.js";
import { normalizeAffineScenePresentation } from "./affineScene.js";
import { SCENE_TYPE_OPTIONS, normalizeSceneTypeId, sceneTypeLabel } from "./sceneTypes.js";
import { sceneTypeProfile } from "./sceneTypeProfiles.js";
import {
  resolveSceneCapabilityManifest,
  type ScenePhysicalBudget
} from "./sceneFeatureModules.js";
import {
  SCENE_TACTICAL_CAPABILITY_IDS,
  SCENE_TACTICAL_CAPABILITY_REGISTRY,
  normalizeIsometricTacticalPresentation,
  validateIsometricTacticalAudioCatalog,
  validateIsometricTacticalPresentation,
  type IsoTacticalPresentationConfig
} from "./isometricTacticalPresentation.js";

export const SCENE_PREFLIGHT_PROFILE_IDS = [
  "topdown",
  "platformer",
  "isometric",
  "dungeonCrawler",
  "racing",
  "pointAndClick",
  "shmup",
  "visualNovel",
  "menu",
  "menuStart",
  "menuMissions",
  "menuInventory",
  "menuMap",
  "menuProfile",
  "menuSave",
  "menuGenderSelect",
  "menuNameInput",
  "cutscene",
  "worldMap",
  "battleRpg",
  "luta",
  "puzzle",
  "bossBattle",
  "tacticalGrid",
  "hybrid",
  "custom"
] as const;

export type ScenePreflightProfileID = typeof SCENE_PREFLIGHT_PROFILE_IDS[number];
export type ScenePreflightStatus = "ready" | "review" | "blocked";
export type ScenePreflightIssueSeverity = "info" | "warning" | "error";
export type ScenePreflightProjection = "orthographic" | "isometric" | "first_person_grid" | "ui" | "node_graph" | "custom";
export type ScenePreflightOrientation = "top" | "side" | "isometric" | "none" | "custom";
export type ScenePreflightScroll = "none" | "horizontal" | "vertical" | "free";
export type ScenePreflightCameraMode = "fixed" | "follow" | "side_scroll" | "step" | "pointer" | "sequence" | "node_focus" | "custom";
export type ScenePreflightLayerRole = "background" | "obstacles" | "actors" | "hud" | "collision" | "dialogue" | "effects" | "nodes" | "transition" | "grid";
export type ScenePreflightHardwareLayer = "BG0" | "BG1" | "BG2" | "BG3" | "OBJ" | "scene_data" | "none";
export type ScenePreflightChecklistState = "complete" | "review" | "blocked";
export type ScenePreflightAssetState = "present" | "missing" | "not_required";

export interface ScenePreflightPerspective {
  projection: ScenePreflightProjection;
  orientation: ScenePreflightOrientation;
  scroll: ScenePreflightScroll;
  viewport: { widthPixels: 240; heightPixels: 160 };
}

export interface ScenePreflightCamera {
  mode: ScenePreflightCameraMode;
  followsPlayer: boolean;
  boundsRequired: boolean;
  zoomAuthoringIndependent: boolean;
}

export interface ScenePreflightLayerRequirement {
  id: string;
  label: string;
  role: ScenePreflightLayerRole;
  hardwareLayer: ScenePreflightHardwareLayer;
  required: boolean;
  source: "profile" | "scene_data";
}

export interface ScenePreflightLayer extends ScenePreflightLayerRequirement {
  present: boolean;
  detail: string;
}

export interface ScenePreflightPlayerProfile {
  required: boolean;
  role: string;
  movement: string;
  actions: string[];
  spriteSizePixels: { width: number; height: number } | null;
  collisionModel: string;
}

export interface ScenePreflightActorProfile {
  required: boolean;
  roles: string[];
  maxVisible: number;
  collisionModel: string;
}

export interface ScenePreflightHudProfile {
  required: boolean;
  hardwareLayer: ScenePreflightHardwareLayer;
  fixed: boolean;
  elements: string[];
}

export interface ScenePreflightObstacleProfile {
  required: boolean;
  visualLayer: ScenePreflightHardwareLayer;
  collisionSource: "room_meta_grid" | "scene_data" | "none";
  collisionModel: string;
  types: string[];
}

export interface ScenePreflightControl {
  action: string;
  input: string;
  required: boolean;
}

export interface ScenePreflightGameplayProfile {
  objective: string;
  loop: string[];
  success: string[];
  failure: string[];
}

export interface ScenePreflightAudioProfile {
  music: boolean;
  sfx: boolean;
  channels: number;
  cues: string[];
}

export interface ScenePreflightAssetRequirement {
  id: string;
  label: string;
  kind: string;
  required: boolean;
  reference: "background" | "player_actor" | "actor_sprite" | "dialogue_portrait" | "music" | "dialogue_font" | "tileset" | "collision_meta_grid" | "tactical_presentation" | "none";
  capabilityID?: string;
  reason: string;
}

export interface ScenePreflightVerification {
  tests: string[];
  evidence: string[];
}

export interface ScenePreflightFixtureContext {
  registry: "gba-studio-complete-structural-fixture";
  mode: "structural";
  productionReady: false;
}

export interface ScenePreflightProfile {
  id: ScenePreflightProfileID;
  label: string;
  sceneTypes: string[];
  purpose: string;
  perspective: ScenePreflightPerspective;
  camera: ScenePreflightCamera;
  layers: ScenePreflightLayerRequirement[];
  player: ScenePreflightPlayerProfile;
  actors: ScenePreflightActorProfile;
  hud: ScenePreflightHudProfile;
  obstacles: ScenePreflightObstacleProfile;
  controls: ScenePreflightControl[];
  gameplay: ScenePreflightGameplayProfile;
  states: string[];
  events: string[];
  vfx: string[];
  audio: ScenePreflightAudioProfile;
  assets: ScenePreflightAssetRequirement[];
  editorTools: string[];
  budget: ScenePhysicalBudget;
  complexity: "low" | "medium" | "high";
  fallback: string;
  verification: ScenePreflightVerification;
}

export interface ScenePreflightAssetStatus extends ScenePreflightAssetRequirement {
  state: ScenePreflightAssetState;
  present: boolean;
  resolvedReference: string | null;
  detail: string;
}

export interface ScenePreflightCollisionReport {
  model: string;
  source: "room.collisionTypes" | "scene_data" | "not_declared";
  independentOfArt: true;
  required: boolean;
  declared: boolean;
  expectedCellCount: number | null;
  actualCellCount: number;
  coverage: number;
}

export interface ScenePreflightChecklistItem {
  id: string;
  label: string;
  state: ScenePreflightChecklistState;
  detail: string;
}

export interface ScenePreflightIssue {
  code: string;
  severity: ScenePreflightIssueSeverity;
  field?: string;
  message: string;
  resolution?: string;
}

export interface ScenePreflightReport {
  schema: 1;
  registry: "gba-studio-scene-preflight";
  sceneName: string;
  sceneType: string;
  profileId: ScenePreflightProfileID;
  profileLabel: string;
  status: ScenePreflightStatus;
  purpose: string;
  perspective: ScenePreflightPerspective;
  camera: ScenePreflightCamera;
  layers: ScenePreflightLayer[];
  player: ScenePreflightPlayerProfile & { present: boolean; actorName: string | null };
  actors: ScenePreflightActorProfile & { count: number; names: string[] };
  hud: ScenePreflightHudProfile & { present: boolean; presetId: string | null };
  obstacles: ScenePreflightObstacleProfile & { count: number; present: boolean };
  collision: ScenePreflightCollisionReport;
  controls: ScenePreflightControl[];
  gameplay: ScenePreflightGameplayProfile;
  states: string[];
  events: { expected: string[]; declaredCount: number; triggerCount: number };
  vfx: string[];
  audio: ScenePreflightAudioProfile & { musicReference: string | null; sfxCount: number };
  assets: ScenePreflightAssetStatus[];
  editorTools: string[];
  requiredEditorTools: string[];
  enabledCapabilities: string[];
  budget: { source: "profile"; safeLimit: ScenePhysicalBudget };
  hardware: GbaHardwareSceneContract | null;
  complexity: "low" | "medium" | "high";
  fallback: string;
  verification: ScenePreflightVerification;
  fixture?: ScenePreflightFixtureContext;
  checklist: ScenePreflightChecklistItem[];
  issues: ScenePreflightIssue[];
}

interface SceneRecord {
  [key: string]: unknown;
}

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

const DEFAULT_PERSPECTIVE: ScenePreflightPerspective = {
  projection: "orthographic",
  orientation: "top",
  scroll: "none",
  viewport: { widthPixels: 240, heightPixels: 160 }
};

const DEFAULT_CAMERA: ScenePreflightCamera = {
  mode: "fixed",
  followsPlayer: false,
  boundsRequired: false,
  zoomAuthoringIndependent: true
};

const DEFAULT_PLAYER: ScenePreflightPlayerProfile = {
  required: false,
  role: "none",
  movement: "none",
  actions: [],
  spriteSizePixels: null,
  collisionModel: "none"
};

const DEFAULT_ACTORS: ScenePreflightActorProfile = {
  required: false,
  roles: [],
  maxVisible: 0,
  collisionModel: "none"
};

const DEFAULT_HUD: ScenePreflightHudProfile = {
  required: false,
  hardwareLayer: "BG0",
  fixed: true,
  elements: []
};

const DEFAULT_OBSTACLES: ScenePreflightObstacleProfile = {
  required: false,
  visualLayer: "none",
  collisionSource: "none",
  collisionModel: "none",
  types: []
};

const DEFAULT_GAMEPLAY: ScenePreflightGameplayProfile = {
  objective: "Defina o objetivo da cena.",
  loop: ["entrada", "interação", "saída"],
  success: ["evento de conclusão"],
  failure: ["retorno ou reinício" ]
};

const DEFAULT_AUDIO: ScenePreflightAudioProfile = {
  music: false,
  sfx: false,
  channels: 1,
  cues: []
};

const DEFAULT_VERIFICATION: ScenePreflightVerification = {
  tests: ["scenePreflight.test.ts"],
  evidence: ["npm run smoke:exemplo-scenes", "npm run verify:mgba-web"]
};

const DEFAULT_ASSETS: ScenePreflightAssetRequirement[] = [
  {
    id: "scene-background",
    label: "Fundo da cena",
    kind: "background",
    required: false,
    reference: "background",
    reason: "Use um fundo já aprovado ou deixe a cena declarar o fallback."
  }
];

const DEFAULT_LAYERS: ScenePreflightLayerRequirement[] = [
  { id: "background", label: "Fundo", role: "background", hardwareLayer: "BG2", required: false, source: "profile" },
  { id: "actors", label: "Atores", role: "actors", hardwareLayer: "OBJ", required: false, source: "scene_data" },
  { id: "collision", label: "Colisão", role: "collision", hardwareLayer: "scene_data", required: false, source: "scene_data" }
];

const DEFAULT_CONTROLS: ScenePreflightControl[] = [
  { action: "confirmar", input: "A", required: false },
  { action: "voltar", input: "B", required: false }
];

const BASE_PROFILE = {
  perspective: DEFAULT_PERSPECTIVE,
  camera: DEFAULT_CAMERA,
  layers: DEFAULT_LAYERS,
  player: DEFAULT_PLAYER,
  actors: DEFAULT_ACTORS,
  hud: DEFAULT_HUD,
  obstacles: DEFAULT_OBSTACLES,
  controls: DEFAULT_CONTROLS,
  gameplay: DEFAULT_GAMEPLAY,
  states: ["entrada", "ativo", "saída"],
  events: ["on_enter", "on_exit"],
  vfx: [],
  audio: DEFAULT_AUDIO,
  assets: DEFAULT_ASSETS,
  editorTools: ["select", "paint", "room"],
  budget: DEFAULT_PHYSICAL_BUDGET,
  complexity: "low" as const,
  fallback: "Use o modo tiled/regular da cena e mantenha as capabilities avançadas desabilitadas.",
  verification: DEFAULT_VERIFICATION
};

function profile(
  overrides: Omit<Partial<ScenePreflightProfile>, "id" | "label" | "sceneTypes"> & Pick<ScenePreflightProfile, "id" | "label" | "sceneTypes">
): ScenePreflightProfile {
  return {
    ...BASE_PROFILE,
    ...overrides,
    purpose: overrides.purpose ?? "Defina o propósito e o loop da cena.",
    perspective: { ...DEFAULT_PERSPECTIVE, ...overrides.perspective },
    camera: { ...DEFAULT_CAMERA, ...overrides.camera },
    player: { ...DEFAULT_PLAYER, ...overrides.player, actions: [...(overrides.player?.actions ?? DEFAULT_PLAYER.actions)] },
    actors: { ...DEFAULT_ACTORS, ...overrides.actors, roles: [...(overrides.actors?.roles ?? DEFAULT_ACTORS.roles)] },
    hud: { ...DEFAULT_HUD, ...overrides.hud, elements: [...(overrides.hud?.elements ?? DEFAULT_HUD.elements)] },
    obstacles: { ...DEFAULT_OBSTACLES, ...overrides.obstacles, types: [...(overrides.obstacles?.types ?? DEFAULT_OBSTACLES.types)] },
    layers: (overrides.layers ?? DEFAULT_LAYERS).map((layer) => ({ ...layer })),
    controls: (overrides.controls ?? DEFAULT_CONTROLS).map((control) => ({ ...control })),
    gameplay: {
      ...DEFAULT_GAMEPLAY,
      ...overrides.gameplay,
      loop: [...(overrides.gameplay?.loop ?? DEFAULT_GAMEPLAY.loop)],
      success: [...(overrides.gameplay?.success ?? DEFAULT_GAMEPLAY.success)],
      failure: [...(overrides.gameplay?.failure ?? DEFAULT_GAMEPLAY.failure)]
    },
    states: [...(overrides.states ?? BASE_PROFILE.states)],
    events: [...(overrides.events ?? BASE_PROFILE.events)],
    vfx: [...(overrides.vfx ?? BASE_PROFILE.vfx)],
    audio: { ...DEFAULT_AUDIO, ...overrides.audio, cues: [...(overrides.audio?.cues ?? DEFAULT_AUDIO.cues)] },
    assets: (overrides.assets ?? DEFAULT_ASSETS).map((asset) => ({ ...asset })),
    editorTools: [...(overrides.editorTools ?? BASE_PROFILE.editorTools)],
    budget: { ...DEFAULT_PHYSICAL_BUDGET, ...(overrides.budget ?? {}) },
    verification: {
      tests: [...(overrides.verification?.tests ?? DEFAULT_VERIFICATION.tests)],
      evidence: [...(overrides.verification?.evidence ?? DEFAULT_VERIFICATION.evidence)]
    }
  };
}

const tiledBackgroundAsset: ScenePreflightAssetRequirement = {
  id: "scene-background",
  label: "Fundo tiled",
  kind: "regular_bg",
  required: true,
  reference: "background",
  reason: "A cena precisa de um fundo regular compatível com a grade do GBA."
};

const actorAsset: ScenePreflightAssetRequirement = {
  id: "actor-sprites",
  label: "Sprites dos atores",
  kind: "obj",
  required: true,
  reference: "actor_sprite",
  reason: "Atores devem apontar para animações/sprites existentes no projeto."
};

const dialoguePortraitAsset: ScenePreflightAssetRequirement = {
  id: "dialogue-portraits",
  label: "Retratos dos diálogos",
  kind: "obj",
  required: true,
  reference: "dialogue_portrait",
  reason: "Cada retrato citado por uma fala da cena deve existir como asset; atores de mapa não são necessários."
};

const playerAsset: ScenePreflightAssetRequirement = {
  id: "player-sprite",
  label: "Sprite do player",
  kind: "obj",
  required: true,
  reference: "player_actor",
  reason: "O player deve usar um ator já autorado e exportável."
};

const collisionAsset: ScenePreflightAssetRequirement = {
  id: "collision-meta-grid",
  label: "Meta-grid de colisão",
  kind: "scene_data",
  required: true,
  reference: "collision_meta_grid",
  reason: "A colisão é dado de cena independente da arte."
};

const musicAsset: ScenePreflightAssetRequirement = {
  id: "scene-music",
  label: "Música da cena",
  kind: "audio",
  required: false,
  reference: "music",
  reason: "Uma música já existente pode ser vinculada sem gerar áudio novo."
};

const dialogueFontAsset: ScenePreflightAssetRequirement = {
  id: "dialogue-font",
  label: "Fonte de diálogo",
  kind: "font",
  required: true,
  reference: "dialogue_font",
  reason: "Texto GBA precisa de uma fonte/alfabeto já disponível no projeto."
};

const SCENE_PREFLIGHT_PROFILES: Record<ScenePreflightProfileID, ScenePreflightProfile> = {
  topdown: profile({
    id: "topdown",
    label: "Aventura / Top-down",
    sceneTypes: ["topdown"],
    purpose: "Exploração em quatro direções com interação contextual.",
    perspective: { projection: "orthographic", orientation: "top", scroll: "free", viewport: { widthPixels: 240, heightPixels: 160 } },
    camera: { mode: "follow", followsPlayer: true, boundsRequired: true, zoomAuthoringIndependent: true },
    layers: [
      { id: "background", label: "Fundo", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "collision", label: "Meta-grid de colisão", role: "collision", hardwareLayer: "scene_data", required: true, source: "scene_data" },
      { id: "actors", label: "Atores", role: "actors", hardwareLayer: "OBJ", required: false, source: "scene_data" },
      { id: "hud", label: "HUD", role: "hud", hardwareLayer: "BG0", required: false, source: "scene_data" }
    ],
    player: { required: true, role: "character", movement: "four_way", actions: ["mover", "interagir", "abrir menu"], spriteSizePixels: { width: 16, height: 16 }, collisionModel: "tile + actor" },
    actors: { required: false, roles: ["npc", "item", "interativo"], maxVisible: 32, collisionModel: "opcional" },
    hud: { required: false, hardwareLayer: "BG0", fixed: true, elements: ["vida", "inventário", "mensagem"] },
    obstacles: { required: true, visualLayer: "BG2", collisionSource: "room_meta_grid", collisionModel: "solid/water/event", types: ["solid", "water", "event"] },
    controls: [
      { action: "mover", input: "D-pad", required: true },
      { action: "interagir", input: "A", required: false },
      { action: "menu", input: "START", required: false }
    ],
    gameplay: { objective: "Explorar e concluir interações da área.", loop: ["explorar", "interagir", "resolver", "avançar"], success: ["evento de saída", "objetivo concluído"], failure: ["retorno ao último ponto seguro"] },
    states: ["entrada", "exploração", "interação", "transição", "saída"],
    events: ["on_enter", "on_interact", "on_trigger", "on_exit"],
    assets: [tiledBackgroundAsset, playerAsset, actorAsset, collisionAsset, musicAsset],
    editorTools: ["select", "paint", "collision", "actor", "trigger", "camera", "room"],
    complexity: "medium"
  }),
  platformer: profile({
    id: "platformer",
    label: "Plataforma",
    sceneTypes: ["platformer"],
    purpose: "Movimento lateral com gravidade, plataformas e câmera de acompanhamento.",
    perspective: { projection: "orthographic", orientation: "side", scroll: "horizontal", viewport: { widthPixels: 240, heightPixels: 160 } },
    camera: { mode: "side_scroll", followsPlayer: true, boundsRequired: true, zoomAuthoringIndependent: true },
    layers: [
      { id: "background", label: "Fundo", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "obstacles", label: "Plataformas visuais", role: "obstacles", hardwareLayer: "BG1", required: false, source: "scene_data" },
      { id: "collision", label: "Meta-grid de colisão", role: "collision", hardwareLayer: "scene_data", required: true, source: "scene_data" },
      { id: "actors", label: "Atores", role: "actors", hardwareLayer: "OBJ", required: false, source: "scene_data" }
    ],
    player: { required: true, role: "character", movement: "side_scroll_physics", actions: ["correr", "pular", "dash", "agachar"], spriteSizePixels: { width: 32, height: 32 }, collisionModel: "pixel body + tile" },
    actors: { required: false, roles: ["enemy", "platform", "collectible"], maxVisible: 32, collisionModel: "actor groups" },
    obstacles: { required: true, visualLayer: "BG1", collisionSource: "room_meta_grid", collisionModel: "solid/down/ladder/slope/damage", types: ["solid", "down", "ladder", "slope_up_left", "slope_up_right", "damage"] },
    controls: [
      { action: "mover", input: "D-pad", required: true },
      { action: "pular", input: "A", required: true },
      { action: "dash", input: "B", required: false },
      { action: "pausar", input: "START", required: false }
    ],
    gameplay: { objective: "Atravessar o trecho e alcançar a saída.", loop: ["correr", "saltar", "evitar", "alcançar checkpoint"], success: ["trigger de saída", "fim do trecho"], failure: ["dano", "queda", "reinício"] },
    states: ["entrada", "grounded", "airborne", "hurt", "dead", "complete"],
    events: ["on_enter", "on_checkpoint", "on_damage", "on_exit"],
    vfx: ["poeira", "impacto", "dash"],
    assets: [tiledBackgroundAsset, playerAsset, actorAsset, collisionAsset, musicAsset],
    editorTools: ["select", "paint", "collision", "actor", "trigger", "camera", "room"],
    complexity: "high"
  }),
  isometric: profile({
    id: "isometric",
    label: "Isométrico",
    sceneTypes: ["isometric"],
    purpose: "Exploração em projeção diamante com altura e camadas de foreground.",
    perspective: { projection: "isometric", orientation: "isometric", scroll: "free", viewport: { widthPixels: 240, heightPixels: 160 } },
    camera: { mode: "follow", followsPlayer: true, boundsRequired: true, zoomAuthoringIndependent: true },
    layers: [
      { id: "surface", label: "Superfície", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "foreground", label: "Foreground", role: "obstacles", hardwareLayer: "BG1", required: false, source: "scene_data" },
      { id: "height", label: "Altura/colisão", role: "collision", hardwareLayer: "scene_data", required: true, source: "scene_data" },
      { id: "actors", label: "Atores", role: "actors", hardwareLayer: "OBJ", required: false, source: "scene_data" }
    ],
    player: { required: true, role: "character", movement: "eight_way_diagonal", actions: ["mover", "interagir"], spriteSizePixels: { width: 16, height: 24 }, collisionModel: "diamond + height" },
    actors: { required: false, roles: ["npc", "unit", "item"], maxVisible: 24, collisionModel: "depth sorted" },
    obstacles: { required: true, visualLayer: "BG1", collisionSource: "room_meta_grid", collisionModel: "height + slope + solid", types: ["solid", "slope_up_left", "slope_up_right", "event"] },
    controls: [{ action: "mover", input: "D-pad", required: true }, { action: "interagir", input: "A", required: false }],
    gameplay: { objective: "Navegar pela malha isométrica e resolver o objetivo.", loop: ["mover", "avaliar altura", "interagir", "avançar"], success: ["objetivo concluído"], failure: ["bloqueio", "evento de retorno"] },
    states: ["entrada", "exploração", "tático opcional", "transição", "saída"],
    events: ["on_enter", "on_interact", "on_height_change", "on_exit"],
    assets: [tiledBackgroundAsset, playerAsset, actorAsset, collisionAsset],
    editorTools: ["select", "paint", "collision", "height", "actor", "trigger", "camera", "room"],
    complexity: "high"
  }),
  dungeonCrawler: profile({
    id: "dungeonCrawler",
    label: "Dungeon Crawler",
    sceneTypes: ["dungeonCrawler"],
    purpose: "Exploração em grade com passos, turnos de câmera e orientação relativa.",
    perspective: { projection: "first_person_grid", orientation: "top", scroll: "none", viewport: { widthPixels: 240, heightPixels: 160 } },
    camera: { mode: "step", followsPlayer: false, boundsRequired: false, zoomAuthoringIndependent: true },
    layers: [
      { id: "corridor", label: "Corredor", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "collision", label: "Grade de passos", role: "collision", hardwareLayer: "scene_data", required: true, source: "scene_data" },
      { id: "actors", label: "Atores", role: "actors", hardwareLayer: "OBJ", required: false, source: "scene_data" },
      { id: "hud", label: "Bússola/mapa", role: "hud", hardwareLayer: "BG0", required: false, source: "scene_data" }
    ],
    player: { required: false, role: "internal_grid_cursor", movement: "step_and_turn", actions: ["andar", "virar", "interagir"], spriteSizePixels: null, collisionModel: "grid" },
    actors: { required: false, roles: ["enemy", "item", "npc"], maxVisible: 16, collisionModel: "grid" },
    hud: { required: false, hardwareLayer: "BG0", fixed: true, elements: ["bússola", "mapa", "vida"] },
    obstacles: { required: true, visualLayer: "BG2", collisionSource: "room_meta_grid", collisionModel: "grid solid/event", types: ["solid", "event", "damage"] },
    controls: [{ action: "andar", input: "D-pad", required: true }, { action: "virar", input: "L/R", required: true }, { action: "mapa", input: "SELECT", required: false }],
    gameplay: { objective: "Explorar corredores e alcançar o objetivo da sala.", loop: ["passo", "virar", "observar", "resolver"], success: ["porta de saída", "evento de objetivo"], failure: ["combate", "retorno"] },
    states: ["entrada", "passo", "virando", "combate", "saída"],
    events: ["on_enter", "on_step", "on_encounter", "on_exit"],
    assets: [tiledBackgroundAsset, actorAsset, collisionAsset, musicAsset],
    editorTools: ["select", "paint", "collision", "actor", "trigger", "room"],
    complexity: "high"
  }),
  racing: profile({
    id: "racing",
    label: "Corrida",
    sceneTypes: ["racing"],
    purpose: "Veículo com aceleração, frenagem, direção e checkpoints.",
    perspective: { projection: "orthographic", orientation: "top", scroll: "free", viewport: { widthPixels: 240, heightPixels: 160 } },
    camera: { mode: "follow", followsPlayer: true, boundsRequired: true, zoomAuthoringIndependent: true },
    layers: [
      { id: "track", label: "Pista", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "collision", label: "Limites da pista", role: "collision", hardwareLayer: "scene_data", required: true, source: "scene_data" },
      { id: "actors", label: "Veículos", role: "actors", hardwareLayer: "OBJ", required: true, source: "scene_data" },
      { id: "hud", label: "Voltas/velocidade", role: "hud", hardwareLayer: "BG0", required: false, source: "scene_data" }
    ],
    player: { required: true, role: "vehicle", movement: "vehicle_acceleration", actions: ["acelerar", "frear", "virar"], spriteSizePixels: { width: 32, height: 16 }, collisionModel: "track bounds" },
    actors: { required: true, roles: ["rival", "pickup", "checkpoint"], maxVisible: 32, collisionModel: "vehicle" },
    hud: { required: false, hardwareLayer: "BG0", fixed: true, elements: ["volta", "tempo", "velocidade"] },
    obstacles: { required: true, visualLayer: "BG2", collisionSource: "room_meta_grid", collisionModel: "road/grass/damage", types: ["solid", "damage", "event"] },
    controls: [{ action: "acelerar", input: "A", required: true }, { action: "frear", input: "B", required: true }, { action: "virar", input: "D-pad", required: true }],
    gameplay: { objective: "Completar as voltas antes dos rivais.", loop: ["acelerar", "virar", "checkpoint", "volta"], success: ["última volta concluída"], failure: ["abandono", "tempo esgotado"] },
    states: ["grid", "corrida", "checkpoint", "volta", "resultado"],
    events: ["on_start", "on_checkpoint", "on_lap", "on_finish"],
    assets: [tiledBackgroundAsset, playerAsset, actorAsset, collisionAsset, musicAsset],
    editorTools: ["select", "paint", "collision", "actor", "trigger", "camera", "room"],
    complexity: "high"
  }),
  pointAndClick: profile({
    id: "pointAndClick",
    label: "Apontar e clicar",
    sceneTypes: ["pointAndClick"],
    purpose: "Exploração por cursor, hotspots e eventos de interação.",
    perspective: { projection: "orthographic", orientation: "top", scroll: "none", viewport: { widthPixels: 240, heightPixels: 160 } },
    camera: { mode: "pointer", followsPlayer: false, boundsRequired: false, zoomAuthoringIndependent: true },
    layers: [
      { id: "background", label: "Fundo", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "actors", label: "Hotspots", role: "actors", hardwareLayer: "OBJ", required: false, source: "scene_data" },
      { id: "hud", label: "Cursor", role: "hud", hardwareLayer: "OBJ", required: true, source: "scene_data" }
    ],
    player: { required: true, role: "cursor", movement: "pointer", actions: ["apontar", "selecionar", "cancelar"], spriteSizePixels: { width: 8, height: 8 }, collisionModel: "hotspot" },
    actors: { required: false, roles: ["hotspot", "character", "item"], maxVisible: 32, collisionModel: "pointer overlap" },
    hud: { required: true, hardwareLayer: "OBJ", fixed: true, elements: ["cursor", "label"] },
    obstacles: { required: false, visualLayer: "none", collisionSource: "none", collisionModel: "hotspot", types: ["event"] },
    controls: [{ action: "mover cursor", input: "D-pad", required: true }, { action: "selecionar", input: "A", required: true }, { action: "cancelar", input: "B", required: false }],
    gameplay: { objective: "Encontrar e selecionar o hotspot correto.", loop: ["observar", "apontar", "selecionar", "reagir"], success: ["evento de solução"], failure: ["feedback e nova tentativa"] },
    states: ["entrada", "observando", "hotspot", "diálogo", "saída"],
    events: ["on_enter", "on_hover", "on_select", "on_exit"],
    assets: [tiledBackgroundAsset, actorAsset, dialogueFontAsset],
    editorTools: ["select", "paint", "actor", "trigger", "room"],
    complexity: "medium"
  }),
  shmup: profile({
    id: "shmup",
    label: "Shoot 'em Up",
    sceneTypes: ["shmup"],
    purpose: "Rolagem horizontal/vertical com HUD fixo, atores OBJ, obstáculos e colisão separada.",
    perspective: { projection: "orthographic", orientation: "side", scroll: "horizontal", viewport: { widthPixels: 240, heightPixels: 160 } },
    camera: { mode: "side_scroll", followsPlayer: false, boundsRequired: false, zoomAuthoringIndependent: true },
    layers: [
      { id: "hud", label: "HUD fixo", role: "hud", hardwareLayer: "BG0", required: true, source: "scene_data" },
      { id: "obstacles", label: "Obstáculos", role: "obstacles", hardwareLayer: "BG1", required: false, source: "scene_data" },
      { id: "actors", label: "Atores e projéteis", role: "actors", hardwareLayer: "OBJ", required: true, source: "scene_data" },
      { id: "background", label: "Fundo", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "collision", label: "Colisão scene_data", role: "collision", hardwareLayer: "scene_data", required: true, source: "scene_data" }
    ],
    player: { required: true, role: "ship", movement: "horizontal_scroll", actions: ["mover", "atirar", "bomb"], spriteSizePixels: { width: 32, height: 32 }, collisionModel: "scene_data + actor" },
    actors: { required: true, roles: ["enemy", "projectile", "pickup", "boss"], maxVisible: 48, collisionModel: "OAM + scene_data" },
    hud: { required: true, hardwareLayer: "BG0", fixed: true, elements: ["score", "vidas", "energia", "boss"] },
    obstacles: { required: true, visualLayer: "BG1", collisionSource: "scene_data", collisionModel: "obstacle mask independente da arte", types: ["solid", "damage", "event"] },
    controls: [{ action: "mover", input: "D-pad", required: true }, { action: "atirar", input: "A", required: true }, { action: "bomb", input: "B", required: false }, { action: "pausar", input: "START", required: false }],
    gameplay: { objective: "Sobreviver à rolagem e concluir a onda/boss.", loop: ["rolar", "atirar", "desviar", "spawn", "pontuar"], success: ["wave concluída", "boss derrotado"], failure: ["vidas zeradas", "colisão fatal"] },
    states: ["entrada", "wave", "boss", "pause", "victory", "game_over"],
    events: ["on_enter", "on_wave_start", "on_spawn", "on_hit", "on_wave_clear", "on_exit"],
    vfx: ["tiro", "explosão", "hit", "scroll"],
    audio: { music: true, sfx: true, channels: 4, cues: ["tiro", "explosão", "dano", "boss"] },
    assets: [tiledBackgroundAsset, playerAsset, actorAsset, collisionAsset, musicAsset],
    editorTools: ["select", "paint", "room"],
    complexity: "high",
    fallback: "Use composição tiled regular em BG2 e mantenha Affine/HBlank desabilitados quando não houver declaração e evidência."
  }),
  visualNovel: profile({
    id: "visualNovel",
    label: "Visual Novel",
    sceneTypes: ["visualNovel"],
    purpose: "Narrativa por diálogo, escolha e avanço controlado.",
    perspective: { projection: "ui", orientation: "none", scroll: "none", viewport: { widthPixels: 240, heightPixels: 160 } },
    layers: [
      { id: "background", label: "Fundo", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "dialogue", label: "Caixa de diálogo", role: "dialogue", hardwareLayer: "BG0", required: true, source: "scene_data" },
      { id: "actors", label: "Retratos", role: "actors", hardwareLayer: "OBJ", required: false, source: "scene_data" }
    ],
    player: { required: false, role: "none", movement: "scene_advance", actions: ["avançar", "escolher", "histórico"], spriteSizePixels: null, collisionModel: "none" },
    actors: { required: false, roles: ["portrait", "expression"], maxVisible: 4, collisionModel: "none" },
    hud: { required: true, hardwareLayer: "BG0", fixed: true, elements: ["nome", "texto", "escolhas"] },
    obstacles: { required: false, visualLayer: "none", collisionSource: "none", collisionModel: "none", types: [] },
    controls: [{ action: "avançar", input: "A", required: true }, { action: "histórico", input: "L", required: false }, { action: "pular", input: "B", required: false }],
    gameplay: { objective: "Apresentar a narrativa e encaminhar a próxima cena.", loop: ["apresentar", "ler", "escolher", "avançar"], success: ["última linha", "escolha resolvida"], failure: ["retorno ao fluxo"] },
    states: ["entrada", "diálogo", "escolha", "histórico", "saída"],
    events: ["on_enter", "on_line", "on_choice", "on_complete"],
    assets: [tiledBackgroundAsset, dialoguePortraitAsset, dialogueFontAsset, musicAsset],
    editorTools: ["select", "paint", "actor", "trigger", "room"],
    complexity: "medium"
  }),
  menu: profile({
    id: "menu",
    label: "Menu / UI",
    sceneTypes: ["menu"],
    purpose: "Navegação de interface, seleção e configuração do jogo.",
    perspective: { projection: "ui", orientation: "none", scroll: "none", viewport: { widthPixels: 240, heightPixels: 160 } },
    layers: [
      { id: "background", label: "Fundo de UI", role: "background", hardwareLayer: "BG2", required: false, source: "scene_data" },
      { id: "hud", label: "Interface", role: "hud", hardwareLayer: "BG0", required: true, source: "scene_data" }
    ],
    player: { required: false, role: "menu_cursor", movement: "menu_navigation", actions: ["mover", "confirmar", "voltar"], spriteSizePixels: null, collisionModel: "menu item" },
    hud: { required: true, hardwareLayer: "BG0", fixed: true, elements: ["título", "lista", "cursor", "estado"] },
    obstacles: { required: false, visualLayer: "none", collisionSource: "none", collisionModel: "focus", types: ["event"] },
    controls: [{ action: "navegar", input: "D-pad", required: true }, { action: "confirmar", input: "A", required: true }, { action: "voltar", input: "B", required: false }],
    gameplay: { objective: "Selecionar uma ação de interface válida.", loop: ["focar", "confirmar", "aplicar"], success: ["ação aplicada", "transição"], failure: ["feedback de entrada"] },
    states: ["entrada", "foco", "submenu", "texto", "saída"],
    events: ["on_enter", "on_focus", "on_confirm", "on_cancel"],
    assets: [dialogueFontAsset, musicAsset],
    editorTools: ["select", "paint", "actor", "room"],
    complexity: "low"
  }),
  menuStart: profile({
    id: "menuStart",
    label: "Menu in-game / Start",
    sceneTypes: ["menu"],
    purpose: "Pausa a exploração e abre a navegação principal da campanha como uma cena nativa.",
    perspective: { projection: "ui", orientation: "none", scroll: "none", viewport: { widthPixels: 240, heightPixels: 160 } },
    camera: { mode: "fixed", followsPlayer: false, boundsRequired: false, zoomAuthoringIndependent: true },
    layers: [
      { id: "background", label: "Fundo do menu", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "hud", label: "HUD do menu", role: "hud", hardwareLayer: "BG0", required: true, source: "scene_data" },
      { id: "actors", label: "Opções e cursor", role: "actors", hardwareLayer: "OBJ", required: true, source: "scene_data" }
    ],
    player: { required: false, role: "menu_cursor", movement: "menu_navigation", actions: ["navegar", "confirmar", "voltar"], spriteSizePixels: null, collisionModel: "ui focus" },
    actors: { required: true, roles: ["title", "option", "cursor", "back"], maxVisible: 12, collisionModel: "none" },
    hud: { required: true, hardwareLayer: "BG0", fixed: true, elements: ["title", "missions", "inventory", "map", "profile", "save", "cursor", "back"] },
    obstacles: { required: false, visualLayer: "none", collisionSource: "none", collisionModel: "focus", types: ["event"] },
    controls: [{ action: "navegar", input: "D-pad", required: true }, { action: "confirmar", input: "A", required: true }, { action: "voltar", input: "B", required: true }],
    gameplay: { objective: "Consultar sistemas da campanha sem perder o estado da exploração.", loop: ["pausar", "focar", "confirmar", "retomar"], success: ["tela filha concluída", "retorno ao jogo"], failure: ["cancelar e retomar"] },
    states: ["entrada", "foco", "subtela", "saída"],
    events: ["on_enter", "on_focus", "on_confirm", "on_back", "on_exit"],
    assets: [tiledBackgroundAsset, actorAsset, dialogueFontAsset, musicAsset],
    editorTools: ["select", "paint", "actor", "room"],
    complexity: "medium",
    fallback: "Mantenha o overlay HUD legado somente quando presentationMode for hud; o caminho padrão do showcase é a cena nativa."
  }),
  menuMissions: profile({
    id: "menuMissions",
    label: "Menu in-game / Missões",
    sceneTypes: ["menu"],
    purpose: "Lista missões ativas com detalhe selecionável e retorno ao Menu Start.",
    perspective: { projection: "ui", orientation: "none", scroll: "none", viewport: { widthPixels: 240, heightPixels: 160 } },
    layers: [
      { id: "background", label: "Fundo de missões", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "hud", label: "HUD de missões", role: "hud", hardwareLayer: "BG0", required: true, source: "scene_data" },
      { id: "actors", label: "Missões e cursor", role: "actors", hardwareLayer: "OBJ", required: true, source: "scene_data" }
    ],
    player: { required: false, role: "menu_cursor", movement: "menu_navigation", actions: ["navegar", "detalhar", "voltar"], spriteSizePixels: null, collisionModel: "ui focus" },
    actors: { required: true, roles: ["title", "mission_option", "detail", "cursor", "back"], maxVisible: 10, collisionModel: "none" },
    hud: { required: true, hardwareLayer: "BG0", fixed: true, elements: ["title", "mission-list", "detail", "cursor", "back"] },
    obstacles: { required: false, visualLayer: "none", collisionSource: "none", collisionModel: "focus", types: ["event"] },
    controls: [{ action: "navegar", input: "D-pad", required: true }, { action: "detalhar", input: "A", required: true }, { action: "voltar", input: "B", required: true }],
    gameplay: { objective: "Consultar objetivos e detalhes da campanha.", loop: ["focar missão", "abrir detalhe", "retornar"], success: ["detalhe atualizado"], failure: ["retorno ao Menu Start"] },
    states: ["entrada", "lista", "detalhe", "saída"],
    events: ["on_enter", "on_focus", "on_confirm", "on_back", "on_exit"],
    assets: [tiledBackgroundAsset, actorAsset, dialogueFontAsset, musicAsset],
    editorTools: ["select", "paint", "actor", "room"],
    complexity: "medium"
  }),
  menuInventory: profile({
    id: "menuInventory",
    label: "Menu in-game / Inventário",
    sceneTypes: ["menu"],
    purpose: "Exibe módulos e itens em células OBJ com contagens dinâmicas.",
    perspective: { projection: "ui", orientation: "none", scroll: "none", viewport: { widthPixels: 240, heightPixels: 160 } },
    layers: [
      { id: "background", label: "Fundo de inventário", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "hud", label: "HUD de inventário", role: "hud", hardwareLayer: "BG0", required: true, source: "scene_data" },
      { id: "actors", label: "Ícones, contagens e cursor", role: "actors", hardwareLayer: "OBJ", required: true, source: "scene_data" }
    ],
    player: { required: false, role: "menu_cursor", movement: "grid_navigation", actions: ["navegar células", "detalhar", "voltar"], spriteSizePixels: null, collisionModel: "ui focus" },
    actors: { required: true, roles: ["title", "item_icon", "item_option", "count", "cursor", "back"], maxVisible: 32, collisionModel: "none" },
    hud: { required: true, hardwareLayer: "BG0", fixed: true, elements: ["title", "item-grid", "counts", "detail", "cursor", "back"] },
    obstacles: { required: false, visualLayer: "none", collisionSource: "none", collisionModel: "focus", types: ["event"] },
    controls: [{ action: "navegar células", input: "D-pad", required: true }, { action: "detalhar", input: "A", required: true }, { action: "voltar", input: "B", required: true }],
    gameplay: { objective: "Consultar itens e módulos sem rasterizar valores dinâmicos no fundo.", loop: ["focar célula", "ler contagem", "abrir detalhe", "retornar"], success: ["detalhe atualizado"], failure: ["retorno ao Menu Start"] },
    states: ["entrada", "grade", "detalhe", "saída"],
    events: ["on_enter", "on_focus", "on_confirm", "on_back", "on_exit"],
    assets: [tiledBackgroundAsset, actorAsset, dialogueFontAsset, musicAsset],
    editorTools: ["select", "paint", "actor", "room"],
    complexity: "high"
  }),
  menuMap: profile({
    id: "menuMap",
    label: "Menu in-game / Mapa",
    sceneTypes: ["menu"],
    purpose: "Mostra a rota atual, nós desbloqueados e o cursor do mapa.",
    perspective: { projection: "node_graph", orientation: "top", scroll: "none", viewport: { widthPixels: 240, heightPixels: 160 } },
    camera: { mode: "node_focus", followsPlayer: false, boundsRequired: false, zoomAuthoringIndependent: true },
    layers: [
      { id: "background", label: "Fundo do mapa", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "hud", label: "HUD do mapa", role: "hud", hardwareLayer: "BG0", required: true, source: "scene_data" },
      { id: "nodes", label: "Nós e rota", role: "nodes", hardwareLayer: "OBJ", required: true, source: "scene_data" },
      { id: "actors", label: "Cursor e marcadores", role: "actors", hardwareLayer: "OBJ", required: true, source: "scene_data" }
    ],
    player: { required: false, role: "map_cursor", movement: "node_navigation", actions: ["navegar nós", "selecionar rota", "voltar"], spriteSizePixels: null, collisionModel: "node focus" },
    actors: { required: true, roles: ["title", "map_node", "map_cursor", "airship", "back"], maxVisible: 16, collisionModel: "none" },
    hud: { required: true, hardwareLayer: "BG0", fixed: true, elements: ["title", "route", "node-labels", "cursor", "back"] },
    obstacles: { required: false, visualLayer: "none", collisionSource: "none", collisionModel: "focus", types: ["event"] },
    controls: [{ action: "navegar nós", input: "D-pad", required: true }, { action: "selecionar rota", input: "A", required: true }, { action: "voltar", input: "B", required: true }],
    gameplay: { objective: "Escolher um destino disponível no mapa da campanha.", loop: ["focar nó", "ler estado", "confirmar rota", "retornar"], success: ["destino persistido"], failure: ["rota bloqueada", "retorno ao Menu Start"] },
    states: ["entrada", "nó atual", "nó liberado", "rota bloqueada", "saída"],
    events: ["on_enter", "on_focus", "on_confirm", "on_back", "on_exit"],
    assets: [tiledBackgroundAsset, actorAsset, dialogueFontAsset, musicAsset],
    editorTools: ["select", "paint", "actor", "room"],
    complexity: "high"
  }),
  menuProfile: profile({
    id: "menuProfile",
    label: "Menu in-game / Perfil e equipe",
    sceneTypes: ["menu"],
    purpose: "Compara retratos, estado e função dos personagens da equipe.",
    perspective: { projection: "ui", orientation: "none", scroll: "none", viewport: { widthPixels: 240, heightPixels: 160 } },
    layers: [
      { id: "background", label: "Fundo de perfil", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "hud", label: "HUD de perfil", role: "hud", hardwareLayer: "BG0", required: true, source: "scene_data" },
      { id: "actors", label: "Retratos e cursor", role: "actors", hardwareLayer: "OBJ", required: true, source: "scene_data" }
    ],
    player: { required: false, role: "menu_cursor", movement: "menu_navigation", actions: ["navegar personagens", "detalhar", "voltar"], spriteSizePixels: null, collisionModel: "ui focus" },
    actors: { required: true, roles: ["title", "portrait", "profile_option", "detail", "cursor", "back"], maxVisible: 12, collisionModel: "none" },
    hud: { required: true, hardwareLayer: "BG0", fixed: true, elements: ["title", "portraits", "stats", "detail", "cursor", "back"] },
    obstacles: { required: false, visualLayer: "none", collisionSource: "none", collisionModel: "focus", types: ["event"] },
    controls: [{ action: "navegar personagens", input: "D-pad", required: true }, { action: "detalhar", input: "A", required: true }, { action: "voltar", input: "B", required: true }],
    gameplay: { objective: "Consultar o perfil e a composição da equipe.", loop: ["focar personagem", "ler atributos", "abrir detalhe", "retornar"], success: ["detalhe atualizado"], failure: ["retorno ao Menu Start"] },
    states: ["entrada", "foco", "detalhe", "saída"],
    events: ["on_enter", "on_focus", "on_confirm", "on_back", "on_exit"],
    assets: [tiledBackgroundAsset, actorAsset, dialogueFontAsset, musicAsset],
    editorTools: ["select", "paint", "actor", "room"],
    complexity: "medium"
  }),
  menuSave: profile({
    id: "menuSave",
    label: "Menu in-game / Salvar",
    sceneTypes: ["menu"],
    purpose: "Grava a campanha em um slot e retorna ao jogo sem trocar de contexto.",
    perspective: { projection: "ui", orientation: "none", scroll: "none", viewport: { widthPixels: 240, heightPixels: 160 } },
    layers: [
      { id: "background", label: "Fundo de save", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "hud", label: "HUD de save", role: "hud", hardwareLayer: "BG0", required: true, source: "scene_data" },
      { id: "actors", label: "Slot, status e cursor", role: "actors", hardwareLayer: "OBJ", required: true, source: "scene_data" }
    ],
    player: { required: false, role: "menu_cursor", movement: "menu_navigation", actions: ["navegar slots", "salvar", "voltar"], spriteSizePixels: null, collisionModel: "ui focus" },
    actors: { required: true, roles: ["title", "save_slot", "save_status", "cursor", "back"], maxVisible: 8, collisionModel: "none" },
    hud: { required: true, hardwareLayer: "BG0", fixed: true, elements: ["title", "slot", "timestamp", "status", "cursor", "back"] },
    obstacles: { required: false, visualLayer: "none", collisionSource: "none", collisionModel: "focus", types: ["event"] },
    controls: [{ action: "navegar slots", input: "D-pad", required: true }, { action: "salvar", input: "A", required: true }, { action: "voltar", input: "B", required: true }],
    gameplay: { objective: "Persistir o estado atual da campanha em um slot selecionado.", loop: ["focar slot", "confirmar gravação", "mostrar status", "retornar"], success: ["slot gravado"], failure: ["erro de gravação sem fechar a partida"] },
    states: ["entrada", "foco", "gravando", "confirmado", "erro", "saída"],
    events: ["on_enter", "on_focus", "on_save", "on_back", "on_exit"],
    assets: [tiledBackgroundAsset, actorAsset, dialogueFontAsset, musicAsset],
    editorTools: ["select", "paint", "actor", "room"],
    complexity: "medium"
  }),
  menuGenderSelect: profile({
    id: "menuGenderSelect",
    label: "Menu / Escolha de gênero",
    sceneTypes: ["menu"],
    purpose: "Escolha visual do personagem com dois atores, rótulos e confirmação.",
    perspective: { projection: "ui", orientation: "none", scroll: "none", viewport: { widthPixels: 240, heightPixels: 160 } },
    camera: { mode: "fixed", followsPlayer: false, boundsRequired: false, zoomAuthoringIndependent: true },
    layers: [
      { id: "background", label: "Fundo dedicado", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "hud", label: "Interface de seleção", role: "hud", hardwareLayer: "BG0", required: true, source: "scene_data" },
      { id: "actors", label: "Personagens e cursor", role: "actors", hardwareLayer: "OBJ", required: true, source: "scene_data" }
    ],
    player: { required: false, role: "menu_cursor", movement: "menu_navigation", actions: ["alternar personagem", "confirmar", "voltar"], spriteSizePixels: null, collisionModel: "ui focus" },
    actors: { required: true, roles: ["character_option", "label", "cursor", "confirm"], maxVisible: 8, collisionModel: "none" },
    hud: { required: true, hardwareLayer: "BG0", fixed: true, elements: ["title", "character-options", "labels", "cursor", "confirm"] },
    obstacles: { required: false, visualLayer: "none", collisionSource: "none", collisionModel: "focus", types: ["event"] },
    controls: [
      { action: "alternar personagem", input: "D-pad horizontal", required: true },
      { action: "confirmar", input: "A", required: true },
      { action: "voltar", input: "B", required: true }
    ],
    gameplay: { objective: "Registrar o gênero do personagem e encaminhar a entrada do nome.", loop: ["mostrar opções", "alternar personagem", "confirmar escolha"], success: ["gênero persistido", "transição para entrada de nome"], failure: ["voltar ao menu inicial"] },
    states: ["entrada", "foco homem", "foco mulher", "confirmar", "saída"],
    events: ["on_enter", "on_focus", "on_confirm", "on_cancel", "on_exit"],
    assets: [tiledBackgroundAsset, actorAsset, dialogueFontAsset, musicAsset],
    editorTools: ["select", "paint", "actor", "room"],
    complexity: "medium",
    fallback: "Use o layout de menu comum somente como fallback temporário; a tela deve manter os dois atores, o fundo dedicado e a confirmação separados."
  }),
  menuNameInput: profile({
    id: "menuNameInput",
    label: "Menu / Entrada de nome",
    sceneTypes: ["menu"],
    purpose: "Escolha do nome com retrato contextual, teclado em grade e controles laterais.",
    perspective: { projection: "ui", orientation: "none", scroll: "none", viewport: { widthPixels: 240, heightPixels: 160 } },
    layers: [
      { id: "background", label: "Fundo neutro", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "hud", label: "Cartão e teclado", role: "hud", hardwareLayer: "BG0", required: true, source: "scene_data" },
      { id: "actors", label: "Retrato e cursor", role: "actors", hardwareLayer: "OBJ", required: true, source: "scene_data" }
    ],
    player: { required: false, role: "name_input_cursor", movement: "keyboard_navigation", actions: ["navegar letras", "alternar caixa", "apagar", "confirmar"], spriteSizePixels: null, collisionModel: "ui focus" },
    actors: { required: true, roles: ["portrait", "label", "cursor", "confirm"], maxVisible: 6, collisionModel: "none" },
    hud: { required: true, hardwareLayer: "BG0", fixed: true, elements: ["character-card", "name-field", "keyboard", "side-controls"] },
    obstacles: { required: false, visualLayer: "none", collisionSource: "none", collisionModel: "focus", types: ["event"] },
    controls: [
      { action: "navegar letras", input: "D-pad", required: true },
      { action: "confirmar letra", input: "A", required: true },
      { action: "voltar/apagar", input: "B", required: true },
      { action: "alternar caixa", input: "controle lateral", required: true },
      { action: "concluir", input: "START", required: false }
    ],
    gameplay: { objective: "Registrar o nome do personagem e encaminhar o início da campanha.", loop: ["mostrar personagem", "selecionar letra", "alternar caixa", "confirmar nome"], success: ["nome persistido", "transição para prólogo"], failure: ["apagar caractere", "voltar à escolha"] },
    states: ["entrada", "seleção de letra", "alternância de caixa", "apagar", "confirmar", "saída"],
    events: ["on_enter", "on_text_input", "on_confirm", "on_exit"],
    assets: [tiledBackgroundAsset, actorAsset, dialogueFontAsset, musicAsset],
    editorTools: ["select", "paint", "room"],
    complexity: "medium",
    fallback: "Use o layout de menu comum somente como fallback temporário; a tela de nome deve preservar o cartão, teclado e controles laterais."
  }),
  cutscene: profile({
    id: "cutscene",
    label: "Cutscene",
    sceneTypes: ["cutscene"],
    purpose: "Sequência temporal de diálogos, câmera e movimentos autorados.",
    perspective: { projection: "ui", orientation: "none", scroll: "none", viewport: { widthPixels: 240, heightPixels: 160 } },
    camera: { mode: "sequence", followsPlayer: false, boundsRequired: false, zoomAuthoringIndependent: true },
    layers: [
      { id: "background", label: "Fundo", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "actors", label: "Atores", role: "actors", hardwareLayer: "OBJ", required: false, source: "scene_data" },
      { id: "dialogue", label: "Diálogo", role: "dialogue", hardwareLayer: "BG0", required: false, source: "scene_data" },
      { id: "transition", label: "Transição", role: "transition", hardwareLayer: "none", required: false, source: "scene_data" }
    ],
    actors: { required: false, roles: ["actor", "camera_target"], maxVisible: 16, collisionModel: "none" },
    hud: { required: false, hardwareLayer: "BG0", fixed: true, elements: ["legenda", "skip"] },
    obstacles: { required: false, visualLayer: "none", collisionSource: "none", collisionModel: "none", types: [] },
    controls: [{ action: "avançar", input: "A", required: false }, { action: "pular", input: "B", required: false }, { action: "pausar", input: "START", required: false }],
    gameplay: { objective: "Executar a sequência e entregar o próximo estado do jogo.", loop: ["step", "aguardar", "diálogo", "movimento"], success: ["último step", "transição"], failure: ["skip controlado"] },
    states: ["entrada", "step", "diálogo", "skip", "saída"],
    events: ["on_enter", "on_step", "on_skip", "on_complete"],
    assets: [tiledBackgroundAsset, actorAsset, dialogueFontAsset, musicAsset],
    editorTools: ["select", "paint", "actor", "trigger", "camera", "room"],
    complexity: "medium"
  }),
  worldMap: profile({
    id: "worldMap",
    label: "Mapa mundial",
    sceneTypes: ["worldMap"],
    purpose: "Navegação por nós conectados e regras de desbloqueio.",
    perspective: { projection: "node_graph", orientation: "top", scroll: "free", viewport: { widthPixels: 240, heightPixels: 160 } },
    camera: { mode: "node_focus", followsPlayer: false, boundsRequired: false, zoomAuthoringIndependent: true },
    layers: [
      { id: "map", label: "Mapa", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "nodes", label: "Nós/rotas", role: "nodes", hardwareLayer: "OBJ", required: true, source: "scene_data" },
      { id: "hud", label: "Cursor", role: "hud", hardwareLayer: "BG0", required: false, source: "scene_data" }
    ],
    player: { required: false, role: "map_cursor", movement: "connected_node_navigation", actions: ["focar nó", "selecionar", "voltar"], spriteSizePixels: null, collisionModel: "node graph" },
    actors: { required: true, roles: ["marker", "cursor"], maxVisible: 16, collisionModel: "node" },
    hud: { required: false, hardwareLayer: "BG0", fixed: true, elements: ["nome do destino", "estado"] },
    obstacles: { required: false, visualLayer: "BG2", collisionSource: "none", collisionModel: "locked node", types: ["event"] },
    controls: [{ action: "navegar nós", input: "D-pad", required: true }, { action: "selecionar", input: "A", required: true }, { action: "voltar", input: "B", required: false }],
    gameplay: { objective: "Selecionar um destino desbloqueado.", loop: ["focar nó", "validar regra", "selecionar", "carregar cena"], success: ["destino válido"], failure: ["nó bloqueado", "feedback"] },
    states: ["entrada", "navegando", "bloqueado", "selecionado", "saída"],
    events: ["on_enter", "on_focus", "on_unlock", "on_select"],
    assets: [tiledBackgroundAsset, actorAsset, musicAsset],
    editorTools: ["select", "paint", "actor", "trigger", "room"],
    complexity: "medium"
  }),
  battleRpg: profile({
    id: "battleRpg",
    label: "Batalha RPG",
    sceneTypes: ["battleRpg"],
    purpose: "Combate por turnos com seleção de alvo, comandos e resultado.",
    perspective: { projection: "orthographic", orientation: "side", scroll: "none", viewport: { widthPixels: 240, heightPixels: 160 } },
    layers: [
      { id: "background", label: "Palco", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "actors", label: "Participantes", role: "actors", hardwareLayer: "OBJ", required: true, source: "scene_data" },
      { id: "hud", label: "Comandos/vida", role: "hud", hardwareLayer: "BG0", required: true, source: "scene_data" }
    ],
    player: { required: false, role: "party_controller", movement: "turn_based_targeting", actions: ["atacar", "usar item", "fugir"], spriteSizePixels: null, collisionModel: "target selection" },
    actors: { required: true, roles: ["party", "enemy"], maxVisible: 8, collisionModel: "turn order" },
    hud: { required: true, hardwareLayer: "BG0", fixed: true, elements: ["comandos", "vida", "status", "mensagem"] },
    obstacles: { required: false, visualLayer: "none", collisionSource: "none", collisionModel: "none", types: [] },
    controls: [{ action: "navegar comando", input: "D-pad", required: true }, { action: "confirmar", input: "A", required: true }, { action: "voltar", input: "B", required: false }],
    gameplay: { objective: "Vencer o encontro e aplicar o resultado.", loop: ["selecionar comando", "resolver turno", "atualizar estado"], success: ["inimigos derrotados"], failure: ["party derrotada", "fuga"] },
    states: ["entrada", "comando", "resolução", "vitória", "derrota", "fuga"],
    events: ["on_enter", "on_turn", "on_victory", "on_defeat", "on_escape"],
    assets: [tiledBackgroundAsset, actorAsset, dialogueFontAsset, musicAsset],
    editorTools: ["select", "paint", "actor", "trigger", "room"],
    complexity: "high"
  }),
  luta: profile({
    id: "luta",
    label: "Luta",
    sceneTypes: ["luta"],
    purpose: "Arena lateral com dois lutadores, golpes, rounds e HUD fixo.",
    perspective: { projection: "orthographic", orientation: "side", scroll: "none", viewport: { widthPixels: 240, heightPixels: 160 } },
    camera: { mode: "follow", followsPlayer: true, boundsRequired: true, zoomAuthoringIndependent: true },
    layers: [
      { id: "background", label: "Arena", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "collision", label: "Chão/limites", role: "collision", hardwareLayer: "scene_data", required: true, source: "scene_data" },
      { id: "actors", label: "Lutadores", role: "actors", hardwareLayer: "OBJ", required: true, source: "scene_data" },
      { id: "hud", label: "HUD de round", role: "hud", hardwareLayer: "BG0", required: true, source: "scene_data" }
    ],
    player: { required: true, role: "fighter", movement: "fighting_horizontal", actions: ["andar", "pular", "bloquear", "socar", "chutar", "especial"], spriteSizePixels: { width: 32, height: 32 }, collisionModel: "fighter box + arena" },
    actors: { required: true, roles: ["rival", "fighter", "effect"], maxVisible: 8, collisionModel: "hitbox/hurtbox" },
    hud: { required: true, hardwareLayer: "BG0", fixed: true, elements: ["vida P1", "vida P2", "timer", "round", "super"] },
    obstacles: { required: true, visualLayer: "BG2", collisionSource: "room_meta_grid", collisionModel: "floor + arena bounds", types: ["solid", "left", "right", "damage"] },
    controls: [
      { action: "mover", input: "D-pad", required: true },
      { action: "soco", input: "A", required: true },
      { action: "chute", input: "B", required: true },
      { action: "bloquear", input: "D-pad ← + R", required: false }
    ],
    gameplay: { objective: "Vencer rounds por dano, tempo ou condição especial.", loop: ["posicionar", "atacar", "defender", "resolver hit", "round"], success: ["roundsToWin alcançado"], failure: ["vida zerada", "tempo esgotado"] },
    states: ["intro", "round", "hitstun", "knockdown", "victory", "defeat"],
    events: ["on_enter", "on_round_start", "on_hit", "on_round_end", "on_victory", "on_defeat"],
    vfx: ["hit", "guard", "special", "knockdown"],
    audio: { music: true, sfx: true, channels: 4, cues: ["soco", "chute", "especial", "round", "ko"] },
    assets: [tiledBackgroundAsset, playerAsset, actorAsset, collisionAsset, musicAsset],
    editorTools: ["select", "paint", "actor", "room"],
    budget: { ...DEFAULT_PHYSICAL_BUDGET, objTiles: 192, oam: 48 },
    complexity: "high"
  }),
  puzzle: profile({
    id: "puzzle",
    label: "Puzzle",
    sceneTypes: ["custom"],
    purpose: "Grade de regras, peças e resolução determinística.",
    perspective: { projection: "orthographic", orientation: "top", scroll: "none", viewport: { widthPixels: 240, heightPixels: 160 } },
    layers: [
      { id: "background", label: "Tabuleiro", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "grid", label: "Grade lógica", role: "grid", hardwareLayer: "scene_data", required: true, source: "scene_data" },
      { id: "actors", label: "Peças", role: "actors", hardwareLayer: "OBJ", required: true, source: "scene_data" },
      { id: "hud", label: "Estado", role: "hud", hardwareLayer: "BG0", required: false, source: "scene_data" }
    ],
    player: { required: false, role: "cursor", movement: "grid_selection", actions: ["selecionar", "mover peça", "confirmar"], spriteSizePixels: null, collisionModel: "grid rules" },
    actors: { required: true, roles: ["piece", "marker", "target"], maxVisible: 64, collisionModel: "grid occupancy" },
    obstacles: { required: true, visualLayer: "BG2", collisionSource: "room_meta_grid", collisionModel: "grid occupancy", types: ["solid", "event"] },
    controls: [{ action: "selecionar", input: "A", required: true }, { action: "cancelar", input: "B", required: false }, { action: "mover", input: "D-pad", required: true }],
    gameplay: { objective: "Resolver a regra do tabuleiro.", loop: ["selecionar", "aplicar movimento", "avaliar regra"], success: ["solução encontrada"], failure: ["movimento inválido", "reinício"] },
    states: ["entrada", "seleção", "movimento", "resolução", "solved"],
    events: ["on_enter", "on_move", "on_invalid", "on_solved"],
    assets: [tiledBackgroundAsset, actorAsset, collisionAsset],
    editorTools: ["select", "paint", "collision", "actor", "trigger", "room"],
    complexity: "medium"
  }),
  bossBattle: profile({
    id: "bossBattle",
    label: "Boss Battle",
    sceneTypes: ["custom", "battleRpg", "luta", "shmup"],
    purpose: "Encontro de alta densidade com fases, telemetria e condição de vitória.",
    perspective: { projection: "orthographic", orientation: "side", scroll: "horizontal", viewport: { widthPixels: 240, heightPixels: 160 } },
    camera: { mode: "follow", followsPlayer: true, boundsRequired: true, zoomAuthoringIndependent: true },
    layers: [
      { id: "background", label: "Palco", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "obstacles", label: "Obstáculos", role: "obstacles", hardwareLayer: "BG1", required: false, source: "scene_data" },
      { id: "actors", label: "Boss e player", role: "actors", hardwareLayer: "OBJ", required: true, source: "scene_data" },
      { id: "hud", label: "Vida/fases", role: "hud", hardwareLayer: "BG0", required: true, source: "scene_data" },
      { id: "collision", label: "Meta-grid", role: "collision", hardwareLayer: "scene_data", required: true, source: "scene_data" }
    ],
    player: { required: true, role: "player", movement: "profile_defined", actions: ["mover", "atacar", "defender", "especial"], spriteSizePixels: { width: 32, height: 32 }, collisionModel: "actor + arena" },
    actors: { required: true, roles: ["boss", "minion", "projectile"], maxVisible: 48, collisionModel: "phase/hitbox" },
    hud: { required: true, hardwareLayer: "BG0", fixed: true, elements: ["boss health", "phase", "player health"] },
    obstacles: { required: true, visualLayer: "BG1", collisionSource: "scene_data", collisionModel: "phase obstacles", types: ["solid", "damage", "event"] },
    controls: [{ action: "mover", input: "D-pad", required: true }, { action: "atacar", input: "A", required: true }, { action: "especial", input: "B", required: false }],
    gameplay: { objective: "Derrotar o boss através de todas as fases.", loop: ["ler fase", "desviar", "atacar", "trocar fase"], success: ["boss derrotado"], failure: ["player derrotado", "reinício"] },
    states: ["intro", "phase_1", "phase_n", "enraged", "victory", "defeat"],
    events: ["on_enter", "on_phase", "on_spawn", "on_hit", "on_victory", "on_defeat"],
    vfx: ["telegraph", "hit", "phase_change", "defeat"],
    assets: [tiledBackgroundAsset, playerAsset, actorAsset, collisionAsset, musicAsset],
    editorTools: ["select", "paint", "collision", "actor", "trigger", "camera", "room"],
    budget: { ...DEFAULT_PHYSICAL_BUDGET, objTiles: 512, oam: 96, eventBytes: 12288 },
    complexity: "high"
  }),
  tacticalGrid: profile({
    id: "tacticalGrid",
    label: "Tático / Grid",
    sceneTypes: ["custom", "isometric"],
    purpose: "Unidades em grade com alcance, turnos e objetivos espaciais.",
    perspective: { projection: "isometric", orientation: "isometric", scroll: "free", viewport: { widthPixels: 240, heightPixels: 160 } },
    camera: { mode: "follow", followsPlayer: false, boundsRequired: true, zoomAuthoringIndependent: true },
    layers: [
      { id: "surface", label: "Superfície", role: "background", hardwareLayer: "BG2", required: true, source: "scene_data" },
      { id: "grid", label: "Grade tática", role: "grid", hardwareLayer: "BG1", required: true, source: "scene_data" },
      { id: "actors", label: "Unidades", role: "actors", hardwareLayer: "OBJ", required: true, source: "scene_data" },
      { id: "hud", label: "Turno/alcance", role: "hud", hardwareLayer: "BG0", required: true, source: "scene_data" },
      { id: "collision", label: "Altura/colisão", role: "collision", hardwareLayer: "scene_data", required: true, source: "scene_data" }
    ],
    player: { required: false, role: "active_unit", movement: "grid_turn_based", actions: ["selecionar unidade", "mover", "atacar", "encerrar turno"], spriteSizePixels: null, collisionModel: "grid + height" },
    actors: { required: true, roles: ["player_unit", "enemy_unit", "objective"], maxVisible: 32, collisionModel: "grid occupancy + range" },
    hud: { required: true, hardwareLayer: "BG0", fixed: true, elements: ["turno", "alcance", "vida", "objetivo"] },
    obstacles: { required: true, visualLayer: "BG1", collisionSource: "room_meta_grid", collisionModel: "height/block/range", types: ["solid", "up", "down", "event"] },
    controls: [{ action: "selecionar", input: "A", required: true }, { action: "cancelar", input: "B", required: false }, { action: "mover cursor", input: "D-pad", required: true }, { action: "encerrar turno", input: "START", required: true }],
    gameplay: { objective: "Cumprir o objetivo tático em turnos.", loop: ["selecionar", "planejar", "executar", "turno inimigo"], success: ["objetivo alcançado"], failure: ["unidades derrotadas", "objetivo perdido"] },
    states: ["entrada", "player_turn", "targeting", "enemy_turn", "victory", "defeat"],
    events: ["on_enter", "on_turn", "on_move", "on_attack", "on_objective", "on_exit"],
    assets: [tiledBackgroundAsset, actorAsset, collisionAsset, musicAsset],
    editorTools: ["select", "paint", "collision", "height", "actor", "trigger", "camera", "room"],
    budget: { ...DEFAULT_PHYSICAL_BUDGET, objTiles: 384, oam: 64, eventBytes: 12288 },
    complexity: "high"
  }),
  hybrid: profile({
    id: "hybrid",
    label: "Híbrido",
    sceneTypes: ["custom"],
    purpose: "Composição explícita de subsistemas de dois ou mais perfis.",
    perspective: { projection: "custom", orientation: "custom", scroll: "free", viewport: { widthPixels: 240, heightPixels: 160 } },
    camera: { mode: "custom", followsPlayer: false, boundsRequired: false, zoomAuthoringIndependent: true },
    layers: [
      { id: "background", label: "Fundo", role: "background", hardwareLayer: "BG2", required: false, source: "scene_data" },
      { id: "actors", label: "Atores", role: "actors", hardwareLayer: "OBJ", required: false, source: "scene_data" },
      { id: "hud", label: "HUD", role: "hud", hardwareLayer: "BG0", required: false, source: "scene_data" },
      { id: "collision", label: "Colisão", role: "collision", hardwareLayer: "scene_data", required: false, source: "scene_data" }
    ],
    player: { required: false, role: "profile_defined", movement: "profile_defined", actions: ["profile_defined"], spriteSizePixels: null, collisionModel: "profile_defined" },
    actors: { required: false, roles: ["profile_defined"], maxVisible: 32, collisionModel: "profile_defined" },
    hud: { required: false, hardwareLayer: "BG0", fixed: true, elements: ["profile_defined"] },
    obstacles: { required: false, visualLayer: "BG2", collisionSource: "room_meta_grid", collisionModel: "profile_defined", types: ["profile_defined"] },
    controls: [{ action: "profile_defined", input: "profile_defined", required: false }],
    gameplay: { objective: "Declare os objetivos dos perfis combinados.", loop: ["profile_defined"], success: ["profile_defined"], failure: ["profile_defined"] },
    states: ["profile_defined"],
    events: ["profile_defined"],
    assets: [tiledBackgroundAsset],
    editorTools: ["select", "paint", "room"],
    complexity: "high",
    fallback: "Reduza a cena para um único perfil nativo antes de exportar; não habilite subsistemas implícitos."
  }),
  custom: profile({
    id: "custom",
    label: "Custom",
    sceneTypes: ["custom"],
    purpose: "Cena autoral sem semântica de gameplay presumida.",
    layers: DEFAULT_LAYERS,
    assets: DEFAULT_ASSETS,
    editorTools: ["select", "paint", "room"],
    complexity: "low",
    fallback: "Use o runtime top-down básico ou selecione explicitamente um perfil especializado."
  })
};

const PROFILE_BY_SCENE_TYPE: Record<string, ScenePreflightProfileID> = {
  topdown: "topdown",
  platformer: "platformer",
  isometric: "isometric",
  dungeonCrawler: "dungeonCrawler",
  racing: "racing",
  pointAndClick: "pointAndClick",
  shmup: "shmup",
  visualNovel: "visualNovel",
  menu: "menu",
  cutscene: "cutscene",
  worldMap: "worldMap",
  battleRpg: "battleRpg",
  luta: "luta",
  custom: "custom"
};

const PROFILE_ALIASES: Record<string, ScenePreflightProfileID> = {
  puzzle: "puzzle",
  "boss-battle": "bossBattle",
  bossbattle: "bossBattle",
  bossBattle: "bossBattle",
  tactical: "tacticalGrid",
  "tactical-grid": "tacticalGrid",
  tacticalgrid: "tacticalGrid",
  tacticalGrid: "tacticalGrid",
  hybrid: "hybrid",
  custom: "custom"
};

function isRecord(value: unknown): value is SceneRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(value: unknown): SceneRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function integerValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function sceneRecords(data: GBAProjectData): SceneRecord[] {
  const scenas = records(data.scenas);
  return scenas.length > 0 ? scenas : records(data.rooms);
}

function sceneName(scene: SceneRecord | undefined, fallback = "Cena ativa"): string {
  return stringValue(scene?.name) ?? stringValue(scene?.id) ?? fallback;
}

function sceneType(scene: SceneRecord | undefined): string {
  const runtime = isRecord(scene?.runtime) ? scene.runtime : undefined;
  return stringValue(scene?.sceneType) ?? stringValue(scene?.type) ?? stringValue(runtime?.type) ?? "topdown";
}

function sceneByName(data: GBAProjectData, requestedName?: string): SceneRecord | undefined {
  const scenes = sceneRecords(data);
  if (!requestedName) return scenes[0];
  return scenes.find((scene) => sceneName(scene) === requestedName || stringValue(scene.id) === requestedName) ?? scenes[0];
}

function runtimeConfig(scene: SceneRecord | undefined): SceneRecord {
  const runtime = isRecord(scene?.runtime) ? scene.runtime : undefined;
  if (isRecord(runtime?.config)) return runtime.config;
  return isRecord(scene?.config) ? scene.config : {};
}

function explicitProfileID(scene: SceneRecord | undefined, config: SceneRecord): unknown {
  const direct = isRecord(scene?.preflight) ? scene.preflight.profileId : undefined;
  const configured = isRecord(config.preflight) ? config.preflight.profileId : config.preflightProfile;
  return direct ?? configured;
}

function profileID(value: unknown): ScenePreflightProfileID | null {
  if (typeof value !== "string") return null;
  if ((SCENE_PREFLIGHT_PROFILE_IDS as readonly string[]).includes(value)) return value as ScenePreflightProfileID;
  return PROFILE_ALIASES[value] ?? PROFILE_ALIASES[value.trim().toLowerCase()] ?? null;
}

function normalizedSceneType(value: string): string {
  if (SCENE_TYPE_OPTIONS.some((option) => option.id === value || option.label === value)) {
    return normalizeSceneTypeId(value, "topdown");
  }
  return PROFILE_BY_SCENE_TYPE[value] ? value : "custom";
}

export function scenePreflightProfile(
  sceneType: string | null | undefined,
  explicitProfile?: unknown
): ScenePreflightProfile {
  const selected = profileID(explicitProfile);
  const normalized = normalizedSceneType(typeof sceneType === "string" ? sceneType : "topdown");
  const id = selected ?? PROFILE_BY_SCENE_TYPE[normalized] ?? "custom";
  const resolved = SCENE_PREFLIGHT_PROFILES[id] ?? SCENE_PREFLIGHT_PROFILES.custom;
  return {
    ...resolved,
    perspective: { ...resolved.perspective, viewport: { ...resolved.perspective.viewport } },
    camera: { ...resolved.camera },
    layers: resolved.layers.map((layer) => ({ ...layer })),
    player: { ...resolved.player, actions: [...resolved.player.actions], spriteSizePixels: resolved.player.spriteSizePixels ? { ...resolved.player.spriteSizePixels } : null },
    actors: { ...resolved.actors, roles: [...resolved.actors.roles] },
    hud: { ...resolved.hud, elements: [...resolved.hud.elements] },
    obstacles: { ...resolved.obstacles, types: [...resolved.obstacles.types] },
    controls: resolved.controls.map((control) => ({ ...control })),
    gameplay: { ...resolved.gameplay, loop: [...resolved.gameplay.loop], success: [...resolved.gameplay.success], failure: [...resolved.gameplay.failure] },
    states: [...resolved.states],
    events: [...resolved.events],
    vfx: [...resolved.vfx],
    audio: { ...resolved.audio, cues: [...resolved.audio.cues] },
    assets: resolved.assets.map((asset) => ({ ...asset })),
    editorTools: [...resolved.editorTools],
    budget: { ...resolved.budget },
    verification: { tests: [...resolved.verification.tests], evidence: [...resolved.verification.evidence] }
  };
}

function actorsForScene(data: GBAProjectData, name: string): SceneRecord[] {
  return records(data.actors).filter((actor) => (
    stringValue(actor.roomName) === name || stringValue(actor.sceneName) === name || stringValue(actor.room) === name
  ));
}

function triggersForScene(data: GBAProjectData, name: string): SceneRecord[] {
  return records(data.triggers).filter((trigger) => (
    stringValue(trigger.roomName) === name || stringValue(trigger.sceneName) === name || stringValue(trigger.room) === name
  ));
}

function eventsForScene(data: GBAProjectData, name: string): SceneRecord[] {
  return records(data.events).filter((event) => {
    const owner = stringValue(event.roomName) ?? stringValue(event.sceneName) ?? stringValue(event.room);
    return owner === null || owner === name;
  });
}

function projectAssets(data: GBAProjectData): SceneRecord[] {
  return records(data.assets);
}

function hasRecords(value: unknown): boolean {
  return records(value).length > 0;
}

function hasEntries(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return isRecord(value) && Object.keys(value).length > 0;
}

function hasStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim().length > 0);
}

function scenePlayerActorName(scene: SceneRecord | undefined, config: SceneRecord): string | null {
  return stringValue(scene?.playerActorName) ?? stringValue(config.playerActorName);
}

function sceneHudReference(scene: SceneRecord | undefined, config: SceneRecord): string | null {
  const tactical = normalizeIsometricTacticalPresentation(config.tacticalPresentation);
  return stringValue(scene?.hudPresetId)
    ?? stringValue(scene?.hud)
    ?? stringValue(scene?.hudAssetName)
    ?? stringValue(scene?.hudAsset)
    ?? stringValue(config.hudPresetId)
    ?? stringValue(config.hud)
    ?? stringValue(config.hudAssetName)
    ?? stringValue(config.hudAsset)
    ?? tactical.hudLayout
    ?? null;
}

function referenceMatchesAsset(data: GBAProjectData, reference: string | null): boolean {
  if (!reference) return false;
  return projectAssets(data).some((asset) => (
    stringValue(asset.id) === reference
      || stringValue(asset.name) === reference
      || stringValue(asset.path) === reference
      || stringValue(asset.exportID) === reference
  ));
}

function referenceMatchesAudio(data: GBAProjectData, reference: string | null): boolean {
  if (!reference) return false;
  return records(data.audioItems).some((item) => (
    stringValue(item.id) === reference
      || stringValue(item.name) === reference
      || stringValue(item.path) === reference
      || stringValue(item.exportID) === reference
  ));
}

function assetKindExists(data: GBAProjectData, candidates: string[]): boolean {
  const expected = candidates.map((candidate) => candidate.toLowerCase());
  return projectAssets(data).some((asset) => {
    const kind = stringValue(asset.kind)?.toLowerCase() ?? "";
    return expected.some((candidate) => kind.includes(candidate));
  });
}

function sceneBackgroundReference(scene: SceneRecord | undefined, config: SceneRecord = {}): string | null {
  const tactical = normalizeIsometricTacticalPresentation(config.tacticalPresentation);
  return stringValue(scene?.backgroundAssetName)
    ?? stringValue(scene?.background)
    ?? stringValue(config.backgroundAssetName)
    ?? stringValue(config.background)
    ?? tactical.surfaceAsset
    ?? tactical.surfacePages?.[0]?.asset
    ?? null;
}

function sceneTacticalPresentation(config: SceneRecord): IsoTacticalPresentationConfig {
  return normalizeIsometricTacticalPresentation(config.tacticalPresentation);
}

function tacticalPresentationReferences(
  presentation: IsoTacticalPresentationConfig,
  capabilityID: string
): string[] {
  if (capabilityID === "tactical_surface") {
    return presentation.surfaceAsset
      ? [presentation.surfaceAsset]
      : presentation.surfacePages?.map((page) => page.asset) ?? [];
  }
  if (capabilityID === "tactical_grid_overlay") return presentation.gridAsset ? [presentation.gridAsset] : [];
  if (capabilityID === "tactical_hud") return presentation.hudLayout ? [presentation.hudLayout] : [];
  if (capabilityID === "tactical_units") return presentation.units.map((unit) => unit.sheet).filter(Boolean);
  if (capabilityID === "tactical_props") return presentation.props.map((prop) => prop.asset).filter(Boolean);
  if (capabilityID === "tactical_feedback") {
    return [
      presentation.cursorAsset,
      presentation.rangeAsset,
      presentation.targetAsset,
      presentation.emotesAsset,
      presentation.feedbackAsset
    ].filter((reference): reference is string => Boolean(reference));
  }
  if (capabilityID === "tactical_audio") {
    return [
      presentation.audio?.music,
      ...Object.values(presentation.audio?.cues ?? {})
    ].filter((reference): reference is string => Boolean(reference));
  }
  return [];
}

function tacticalPresentationRequirementPresent(
  data: GBAProjectData,
  config: SceneRecord,
  capabilityID: string
): { present: boolean; resolvedReference: string | null } {
  const presentation = sceneTacticalPresentation(config);
  const references = tacticalPresentationReferences(presentation, capabilityID);
  const referencesResolved = references.every((reference) => (
    referenceMatchesAsset(data, reference)
      || (capabilityID === "tactical_audio" && referenceMatchesAudio(data, reference))
  ));
  return {
    present: references.length > 0 && referencesResolved,
    resolvedReference: references.length > 0 ? references.join(", ") : null
  };
}

function tacticalAssetRequirements(
  type: string,
  config: SceneRecord,
  editorTools: string[]
): ScenePreflightAssetRequirement[] {
  const manifest = resolveSceneCapabilityManifest(
    type,
    config.modules,
    editorTools,
    config.capabilities,
    config.tacticalCapabilities
  );
  return manifest.capabilities
    .filter((capability) => (
      (SCENE_TACTICAL_CAPABILITY_IDS as readonly string[]).includes(capability.id)
        && (capability.status.enabled || capability.status.required)
    ))
    .flatMap((capability) => {
      const definition = SCENE_TACTICAL_CAPABILITY_REGISTRY.find((candidate) => candidate.id === capability.id);
      const asset = definition?.assets[0] ?? capability.assets[0];
      if (!asset) return [];
      return [{
        id: `tactical-${capability.id}`,
        label: capability.label,
        kind: asset.kind,
        required: true,
        reference: "tactical_presentation" as const,
        capabilityID: capability.id,
        reason: asset.reason
      }];
    });
}

function sceneFixtureContext(data: GBAProjectData): ScenePreflightFixtureContext | undefined {
  const fixture = isRecord(data.fixture) ? data.fixture : undefined;
  if (fixture?.registry !== "gba-studio-complete-structural-fixture"
    || fixture.mode !== "structural"
    || fixture.productionReady !== false) {
    return undefined;
  }
  return {
    registry: "gba-studio-complete-structural-fixture",
    mode: "structural",
    productionReady: false
  };
}

function actorHasSprite(actor: SceneRecord): boolean {
  return Boolean(stringValue(actor.spriteSheet) ?? stringValue(actor.animationName) ?? stringValue(actor.animation) ?? stringValue(actor.spriteSource));
}

function dialogueLayerPresent(data: GBAProjectData, sceneNameValue: string, scene: SceneRecord | undefined, config: SceneRecord): boolean {
  const dialogueKey = stringValue(scene?.dialogueKey) ?? stringValue(config.dialogueKey);
  const dialogues = records(data.dialogues);
  if (dialogueKey) {
    return dialogues.some((dialogue) => (
      stringValue(dialogue.key) === dialogueKey
      || stringValue(dialogue.id) === dialogueKey
      || stringValue(dialogue.name) === dialogueKey
    ));
  }
  return dialogues.some((dialogue) => {
    const owner = stringValue(dialogue.roomName) ?? stringValue(dialogue.sceneName) ?? stringValue(dialogue.room);
    return owner === null || owner === sceneNameValue;
  });
}

function dialoguePortraitReferences(data: GBAProjectData, scene: SceneRecord | undefined, config: SceneRecord): string[] {
  const sceneName = stringValue(scene?.name);
  const keys = new Set<string>();
  for (const key of [scene?.dialogueKey, config.dialogueKey]) {
    const value = stringValue(key);
    if (value) keys.add(value);
  }
  const boundEvents = new Set<string>();
  for (const bindings of [scene?.eventBindings, config.eventBindings]) {
    if (isRecord(bindings)) {
      for (const name of Object.values(bindings)) {
        const value = stringValue(name);
        if (value) boundEvents.add(value);
      }
    }
  }
  for (const name of [scene?.onEnterEventName, config.onEnterEventName]) {
    const value = stringValue(name);
    if (value) boundEvents.add(value);
  }
  for (const event of records(data.events)) {
    const owner = stringValue(event.roomName) ?? stringValue(event.sceneName) ?? stringValue(event.room);
    if (!boundEvents.has(stringValue(event.name) ?? "") && owner !== sceneName) continue;
    for (const step of records(event.steps)) {
      const key = /^(?:show_dialogue|choice_event)\s+(\S+)/.exec(stringValue(step.command) ?? "")?.[1];
      if (key) keys.add(key);
    }
  }
  const dialogues = records(data.dialogues);
  for (const dialogue of dialogues) {
    const owner = stringValue(dialogue.roomName) ?? stringValue(dialogue.sceneName) ?? stringValue(dialogue.room);
    if (owner !== sceneName) continue;
    const key = stringValue(dialogue.key) ?? stringValue(dialogue.id) ?? stringValue(dialogue.name);
    if (key) keys.add(key);
  }
  return dialogues
    .filter((dialogue) => keys.has(stringValue(dialogue.key) ?? stringValue(dialogue.id) ?? stringValue(dialogue.name) ?? ""))
    .map((dialogue) => stringValue(dialogue.portrait))
    .filter((portrait): portrait is string => Boolean(portrait));
}

function menuInterfacePresent(config: SceneRecord): boolean {
  const screenType = stringValue(config.screenType)?.toLowerCase();
  return screenType === "menu"
    || screenType === "title"
    || screenType === "name_input"
    || hasRecords(config.items)
    || hasRecords(config.screens);
}

function layerPresent(
  data: GBAProjectData,
  sceneNameValue: string,
  scene: SceneRecord | undefined,
  config: SceneRecord,
  sceneTypeValue: string,
  layer: ScenePreflightLayerRequirement,
  actors: SceneRecord[],
  hasCollision: boolean
): boolean {
  if (layer.role === "actors") return actors.length > 0;
  if (layer.role === "collision") return hasCollision;
  if (layer.role === "grid" && layer.hardwareLayer === "BG1") {
    const tactical = sceneTacticalPresentation(config);
    const tileLayers = records(scene?.tileLayers);
    return Boolean(tactical.gridAsset)
      || tileLayers.some((candidate) => stringValue(candidate.mapping)?.toUpperCase() === "BG1" && Array.isArray(candidate.tilemap) && candidate.tilemap.length > 0);
  }
  if (layer.role === "grid") return hasCollision;
  if (layer.role === "hud") return (sceneTypeValue === "pointAndClick"
    && layer.hardwareLayer === "OBJ"
    && (() => {
      const playerActorName = scenePlayerActorName(scene, config);
      const playerActor = actors.find((actor) => stringValue(actor.name) === playerActorName);
      return Boolean(playerActor && actorHasSprite(playerActor));
    })())
    || Boolean(sceneHudReference(scene, config))
    || Boolean(sceneTacticalPresentation(config).hudLayout)
    || menuInterfacePresent(config)
    || hasEntries(scene?.hud)
    || hasEntries(config.hud)
    || hasEntries(scene?.hudElements)
    || hasEntries(config.hudElements);
  if (layer.role === "dialogue") return dialogueLayerPresent(data, sceneNameValue, scene, config);
  if (layer.role === "nodes") return hasRecords(scene?.nodes) || hasRecords(scene?.worldMapNodes) || hasRecords(config.nodes);
  if (layer.role === "transition") {
    return Boolean(stringValue(scene?.nextScene) ?? stringValue(config.nextScene))
      || isRecord(scene?.transition)
      || isRecord(config.transition);
  }
  if (layer.role === "effects") return hasEntries(scene?.effects) || hasEntries(config.effects) || hasEntries(scene?.vfx) || hasEntries(config.vfx);
  if (layer.role === "obstacles") {
    return hasRecords(scene?.obstacles)
      || hasRecords(config.obstacles)
      || hasRecords(scene?.platforms)
      || hasRecords(config.platforms);
  }
  if (layer.role === "background") {
    return (Array.isArray(scene?.tilemap) && scene.tilemap.length > 0)
      || hasRecords(scene?.tileLayers)
      || Boolean(sceneBackgroundReference(scene, config))
      || Boolean(sceneTacticalPresentation(config).surfaceAsset)
      || Boolean(sceneTacticalPresentation(config).surfacePages?.length);
  }
  if (layer.hardwareLayer === "BG0") return Boolean(sceneHudReference(scene, config));
  if (layer.hardwareLayer === "BG1") {
    const layers = records(scene?.tileLayers);
    return layers.some((candidate) => stringValue(candidate.mapping)?.toUpperCase() === "BG1" && Array.isArray(candidate.tilemap) && candidate.tilemap.length > 0);
  }
  if (layer.hardwareLayer === "BG2" || layer.hardwareLayer === "BG3") {
    const layers = records(scene?.tileLayers);
    return layers.some((candidate) => stringValue(candidate.mapping)?.toUpperCase() === layer.hardwareLayer && Array.isArray(candidate.tilemap) && candidate.tilemap.length > 0)
      || (Array.isArray(scene?.tilemap) && scene.tilemap.length > 0)
      || Boolean(sceneBackgroundReference(scene, config));
  }
  return false;
}

function layerDetail(layer: ScenePreflightLayerRequirement, present: boolean): string {
  if (present) return `${layer.hardwareLayer} declarado/observado no modelo atual.`;
  if (layer.required) return `Obrigatório: declare ${layer.label} em ${layer.hardwareLayer}.`;
  return "Opcional neste perfil; não será habilitado por ausência de configuração.";
}

function assetStatus(
  data: GBAProjectData,
  scene: SceneRecord | undefined,
  config: SceneRecord,
  requirement: ScenePreflightAssetRequirement,
  actors: SceneRecord[],
  collision: ScenePreflightCollisionReport
): ScenePreflightAssetStatus {
  const background = sceneBackgroundReference(scene, config);
  const playerActorName = scenePlayerActorName(scene, config);
  const music = stringValue(scene?.music) ?? stringValue(config.music);
  let resolvedReference: string | null = null;
  let present = false;
  if (requirement.reference === "background") {
    resolvedReference = background;
    present = referenceMatchesAsset(data, background);
  } else if (requirement.reference === "player_actor") {
    resolvedReference = playerActorName;
    const player = actors.find((actor) => stringValue(actor.name) === playerActorName);
    present = Boolean(player && actorHasSprite(player));
  } else if (requirement.reference === "actor_sprite") {
    present = actors.some(actorHasSprite);
    const actorWithSprite = actors.find(actorHasSprite);
    resolvedReference = actorWithSprite
      ? stringValue(actorWithSprite.spriteSheet) ?? stringValue(actorWithSprite.animationName)
      : null;
  } else if (requirement.reference === "dialogue_portrait") {
    const portraits = dialoguePortraitReferences(data, scene, config);
    present = portraits.every((portrait) => referenceMatchesAsset(data, portrait));
    resolvedReference = portraits[0] ?? null;
  } else if (requirement.reference === "music") {
    resolvedReference = music;
    present = music !== null && (referenceMatchesAsset(data, music) || records(data.audioItems).some((item) => stringValue(item.name) === music || stringValue(item.id) === music));
  } else if (requirement.reference === "dialogue_font") {
    present = assetKindExists(data, ["font", "dialogue"]);
  } else if (requirement.reference === "tileset") {
    present = referenceMatchesAsset(data, background) || assetKindExists(data, ["tileset", "background"]);
    resolvedReference = background;
  } else if (requirement.reference === "collision_meta_grid") {
    present = collision.declared;
  } else if (requirement.reference === "tactical_presentation") {
    const tactical = tacticalPresentationRequirementPresent(data, config, requirement.capabilityID ?? "");
    present = tactical.present;
    resolvedReference = tactical.resolvedReference;
  } else {
    present = true;
  }
  const state: ScenePreflightAssetState = requirement.required
    ? present ? "present" : "missing"
    : present ? "present" : "not_required";
  return {
    ...requirement,
    state,
    present,
    resolvedReference,
    detail: present
      ? "Referência encontrada no projeto atual."
      : requirement.required
        ? "Nenhum asset/dado existente atende ao requisito; não foi criado um substituto."
        : "Nenhuma referência existente; requisito opcional permanece desligado."
  };
}

function collisionReport(scene: SceneRecord | undefined, config: SceneRecord, profile: ScenePreflightProfile): ScenePreflightCollisionReport {
  const width = integerValue(scene?.width);
  const height = integerValue(scene?.height);
  const expectedCellCount = width > 0 && height > 0 ? width * height : null;
  const rawSource = [scene?.collisionTypes, scene?.collisions, config.collisionTypes, config.collisions]
    .find((value) => hasStringArray(value));
  const raw = Array.isArray(rawSource)
    ? rawSource.filter((cell): cell is string => typeof cell === "string")
    : [];
  const declared = expectedCellCount !== null && expectedCellCount > 0 && raw.length === expectedCellCount;
  return {
    model: profile.obstacles.collisionModel,
    source: raw.length > 0 ? "room.collisionTypes" : profile.obstacles.collisionSource === "scene_data" ? "scene_data" : "not_declared",
    independentOfArt: true,
    required: profile.obstacles.required,
    declared,
    expectedCellCount,
    actualCellCount: raw.length,
    coverage: expectedCellCount && expectedCellCount > 0 ? Math.min(1, raw.length / expectedCellCount) : 0
  };
}

function sceneCapabilityManifest(
  scene: SceneRecord | undefined,
  type: string,
  editorTools: string[]
) {
  const config = runtimeConfig(scene);
  return resolveSceneCapabilityManifest(
    type,
    config.modules,
    editorTools,
    config.capabilities,
    config.tacticalCapabilities
  );
}

function enabledCapabilities(scene: SceneRecord | undefined, type: string, editorTools: string[]): string[] {
  const manifest = sceneCapabilityManifest(scene, type, editorTools);
  return manifest.capabilities.filter((capability) => capability.status.enabled).map((capability) => capability.id);
}

function capabilityPreflightIssues(
  data: GBAProjectData,
  scene: SceneRecord | undefined,
  type: string,
  editorTools: string[]
): ScenePreflightIssue[] {
  const config = runtimeConfig(scene);
  const manifest = sceneCapabilityManifest(scene, type, editorTools);
  const enabledTactical = manifest.capabilities
    .filter((capability) => (
      (SCENE_TACTICAL_CAPABILITY_IDS as readonly string[]).includes(capability.id)
        && (capability.status.enabled || capability.status.required)
    ))
    .map((capability) => capability.id);
  const presentationIssues = enabledTactical.length > 0
    ? validateIsometricTacticalPresentation(config.tacticalPresentation, enabledTactical)
    : [];
  const audioIssues = enabledTactical.length > 0
    ? validateIsometricTacticalAudioCatalog(records(data.audioItems), config.tacticalPresentation, enabledTactical)
    : [];
  return [...manifest.issues, ...presentationIssues, ...audioIssues].map((item) => {
    const severity: ScenePreflightIssueSeverity = [
      "UNKNOWN_MODULE",
      "UNKNOWN_CAPABILITY",
      "INVALID_MODULE_CONFIG",
      "INVALID_MODULE_SETTINGS",
      "INVALID_CAPABILITY_CONFIG",
      "INVALID_CAPABILITY_SETTINGS",
      "REQUIRED_CAPABILITY_DISABLED",
      "INVALID_TACTICAL_PRESENTATION",
      "BUDGET_EXCEEDED",
      "BUDGET_NEGATIVE"
    ].includes(item.code)
      ? "error"
      : "warning";
    const scope = item.module ? `capabilities.${item.module}` : "capabilities";
    return issue(item.code, severity, item.message, item.field ? `${scope}.${item.field}` : scope);
  });
}

function issue(
  code: string,
  severity: ScenePreflightIssueSeverity,
  message: string,
  field?: string,
  resolution?: string
): ScenePreflightIssue {
  return { code, severity, message, ...(field ? { field } : {}), ...(resolution ? { resolution } : {}) };
}

function buildIssues(
  profile: ScenePreflightProfile,
  reportBase: {
    scene: SceneRecord | undefined;
    playerPresent: boolean;
    actors: SceneRecord[];
    layers: ScenePreflightLayer[];
    collision: ScenePreflightCollisionReport;
    assets: ScenePreflightAssetStatus[];
    editorTools: string[];
    capabilityIssues: ScenePreflightIssue[];
  }
): ScenePreflightIssue[] {
  const issues: ScenePreflightIssue[] = [];
  if (profile.player.required && !reportBase.playerPresent) {
    issues.push(issue("PLAYER_REFERENCE_MISSING", "warning", "O perfil exige um player, mas a cena não referencia um ator controlável existente.", "player", "Aponte playerActorName para um ator já autorado; não gere um sprite novo nesta etapa."));
  }
  if (profile.actors.required && reportBase.actors.length === 0) {
    issues.push(issue("ACTORS_MISSING", "warning", "O perfil exige atores, mas não há atores vinculados à cena.", "actors", "Use atores já existentes no projeto ou mantenha a cena em revisão."));
  }
  for (const layer of reportBase.layers) {
    if (layer.required && !layer.present) {
      issues.push(issue("REQUIRED_LAYER_MISSING", "warning", `A camada obrigatória ${layer.label} (${layer.hardwareLayer}) não foi encontrada.`, `layers.${layer.id}`, "Declare a camada usando dados/ativos existentes antes de exportar."));
    }
  }
  if (reportBase.collision.required && !reportBase.collision.declared) {
    issues.push(issue("COLLISION_META_GRID_INCOMPLETE", "warning", "A meta-grid de colisão não cobre todas as células da cena.", "collision", "Complete collisionTypes/scene_data separadamente da arte; não derive colisão de pixels."));
  }
  for (const asset of reportBase.assets) {
    if (asset.required && asset.state === "missing") {
      issues.push(issue("REQUIRED_ASSET_MISSING", "warning", `O requisito ${asset.label} não possui referência existente.`, `assets.${asset.id}`, asset.detail));
    }
  }
  issues.push(...reportBase.capabilityIssues);
  const missingTools = profile.editorTools.filter((tool) => !reportBase.editorTools.includes(tool));
  if (missingTools.length > 0) {
    issues.push(issue("EDITOR_TOOL_MISSING", "warning", `O perfil pede ferramentas que não estão disponíveis: ${missingTools.join(", ")}.`, "editorTools", "Use somente a ferramenta declarada pelo perfil atual ou corrija o contrato do editor."));
  }
  return issues;
}

function menuNameInputIssues(config: SceneRecord, actors: SceneRecord[]): ScenePreflightIssue[] {
  const textInput = isRecord(config.textInput) ? config.textInput : null;
  if (textInput === null) {
    return [issue("NAME_INPUT_CONFIG_MISSING", "warning", "A tela de entrada de nome não declara textInput.", "textInput", "Declare a variável textual, o campo e o teclado da tela.")];
  }
  const keyboard = isRecord(textInput.keyboard) ? textInput.keyboard : null;
  const issues: ScenePreflightIssue[] = [];
  if (keyboard === null || stringValue(keyboard.layout)?.toLowerCase() !== "grid") {
    issues.push(issue("NAME_INPUT_KEYBOARD_MISSING", "warning", "A tela de nome precisa de um teclado em grade.", "textInput.keyboard", "Use layout grid com a grade nativa e controles declarados."));
  } else if (stringValue(keyboard.controlLayout ?? keyboard.control_layout)?.toLowerCase() !== "side") {
    issues.push(issue("NAME_INPUT_SIDE_CONTROLS_MISSING", "warning", "A tela de nome ainda usa controles inferiores; o perfil pede controles laterais.", "textInput.keyboard.controlLayout", "Configure controlLayout side e reserve a coluna direita do viewport."));
  }
  const conditionalPortraits = actors.filter((actor) => (
    (typeof actor.menuVisibilityVariable === "number" || typeof actor.menuVisibilityVariable === "string" ||
      typeof actor.visibilityVariable === "number" || typeof actor.visibilityVariable === "string") &&
    (typeof actor.menuVisibilityValue === "number" || typeof actor.menuVisibilityValue === "string" ||
      typeof actor.visibilityValue === "number" || typeof actor.visibilityValue === "string")
  ));
  if (conditionalPortraits.length < 2) {
    issues.push(issue("NAME_INPUT_PORTRAITS_MISSING", "warning", "A tela de nome precisa de retratos condicionais para os dois gêneros.", "actors", "Associe dois atores portrait à variável de gênero antes de exportar."));
  }
  return issues;
}

function menuGenderSelectionIssues(config: SceneRecord, actors: SceneRecord[]): ScenePreflightIssue[] {
  const itemIDs = new Set(records(config.items).map((item) => stringValue(item.id)?.toLowerCase()).filter(Boolean));
  const requiredItems = ["male", "female", "confirm"];
  const missingItems = requiredItems.filter((itemID) => !itemIDs.has(itemID));
  const issues: ScenePreflightIssue[] = [];
  if (missingItems.length > 0) {
    issues.push(issue(
      "GENDER_SELECTION_ITEMS_MISSING",
      "warning",
      `A tela de gênero não declara os itens obrigatórios: ${missingItems.join(", ")}.`,
      "items",
      "Declare male, female e confirm no runtime do menu antes de exportar."
    ));
  }
  const hasCharacterActor = (variant: "male" | "female") => actors.some((actor) => {
    if (stringValue(actor.menuItemID)?.toLowerCase() !== variant || !actorHasSprite(actor)) return false;
    const references = [actor.spriteSheet, actor.animationName, actor.animation, actor.spriteSource, actor.name]
      .map((value) => stringValue(value)?.toLowerCase() ?? "");
    return references.some((value) => value.includes(`player-${variant}`) || value.includes(`player_${variant}`));
  });
  const missingActors = (["male", "female"] as const).filter((variant) => !hasCharacterActor(variant));
  if (missingActors.length > 0) {
    issues.push(issue(
      "GENDER_SELECTION_ACTORS_MISSING",
      "warning",
      `A tela de gênero não possui os sprites de personagem para: ${missingActors.join(" e ")}.`,
      "actors",
      "Associe gender-player-male-32x64.png e gender-player-female-32x64.png aos itens male/female como atores OBJ."
    ));
  }
  return issues;
}

const IN_GAME_MENU_PROFILE_BY_ROLE: Partial<Record<string, ScenePreflightProfileID>> = {
  start: "menuStart",
  mission_board: "menuMissions",
  inventory: "menuInventory",
  map: "menuMap",
  profile: "menuProfile",
  save: "menuSave"
};

function normalizedActorRole(actor: SceneRecord): string {
  return (stringValue(actor.menuActorRole) ?? stringValue(actor.role) ?? "")
    .toLowerCase()
    .replace(/[-\s]/g, "_");
}

function normalizedMenuItemID(item: SceneRecord): string {
  return (stringValue(item.id) ?? "").toLowerCase().replace(/[-\s]/g, "_");
}

function menuInGameIssues(role: string, config: SceneRecord, actors: SceneRecord[]): ScenePreflightIssue[] {
  const issues: ScenePreflightIssue[] = [];
  const profile = stringValue(config.menuProfile);
  const entryPolicy = stringValue(config.entryPolicy);
  const returnPolicy = stringValue(config.returnPolicy);
  if (profile !== "in_game" || entryPolicy !== "gameplay" || returnPolicy !== "resume" || config.suspendsGameplay !== true) {
    issues.push(issue(
      "IN_GAME_MENU_LIFECYCLE_INCOMPLETE",
      "warning",
      "A tela in-game precisa declarar menuProfile in_game, entrada gameplay, retorno resume e suspendsGameplay.",
      "menuProfile",
      "Use presentationMode scene/both e o ciclo gameplay → menu → resume."
    ));
  }

  const itemIDs = new Set(records(config.items).map(normalizedMenuItemID).filter(Boolean));
  const actorRoles = new Set(actors.map(normalizedActorRole).filter(Boolean));
  const actorItemIDs = new Set(actors.map((actor) => normalizedMenuItemID(actor.menuItemID ? { id: actor.menuItemID } : {})).filter(Boolean));
  const hasRole = (...roles: string[]) => roles.some((value) => actorRoles.has(value) || actorRoles.has(value.replace(/-/g, "_")));
  const hasItemActor = (itemID: string) => actorItemIDs.has(itemID) || actors.some((actor) => {
    const name = (stringValue(actor.name) ?? "").toLowerCase();
    return name.includes(itemID.replace(/_/g, " ")) && Boolean(stringValue(actor.spriteSheet) ?? stringValue(actor.animationName));
  });
  const requireItem = (itemID: string, message: string) => {
    if (!itemIDs.has(itemID)) issues.push(issue("IN_GAME_MENU_ITEM_MISSING", "warning", message, "items", "Declare o item com ação e clickBox antes de exportar."));
  };
  const requireActor = (roles: string[], message: string) => {
    if (!roles.some((actorRole) => hasRole(actorRole))) issues.push(issue("IN_GAME_MENU_ACTOR_ROLE_MISSING", "warning", message, "actors", "Associe um ator OBJ novo ao papel sem rasterizar dados dinâmicos no BG."));
  };

  requireActor(["cursor"], "A tela in-game precisa de um cursor OBJ explícito.");
  requireActor(["back"], "A tela in-game precisa de um ator Voltar reutilizável.");
  if (role === "start") {
    for (const itemID of ["missions", "inventory", "map", "profile", "save", "back"]) requireItem(itemID, `O Menu Start precisa declarar ${itemID}.`);
    requireActor(["option"], "O Menu Start precisa de atores option para as entradas principais.");
  } else if (role === "mission_board") {
    requireItem("back", "A tela de missões precisa de uma entrada Voltar.");
    requireActor(["mission_option", "option"], "A tela de missões precisa de atores para cada missão selecionável.");
  } else if (role === "inventory") {
    requireItem("back", "A tela de inventário precisa de uma entrada Voltar.");
    requireActor(["item_icon", "inventory_icon"], "O inventário precisa de ícones OBJ independentes do fundo.");
  } else if (role === "map") {
    requireItem("back", "A tela de mapa precisa de uma entrada Voltar.");
    if (!hasRecords(config.nodes) && !hasRole("map_node", "node")) {
      issues.push(issue("IN_GAME_MAP_NODES_MISSING", "warning", "O mapa precisa declarar nós navegáveis ou atores map_node.", "nodes", "Declare nós com conexões e estados desbloqueados."));
    }
    requireActor(["map_cursor", "cursor"], "O mapa precisa de cursor próprio para foco de nó.");
  } else if (role === "profile") {
    requireItem("back", "A tela de perfil precisa de uma entrada Voltar.");
    requireActor(["portrait"], "O perfil precisa de retratos OBJ para os personagens da equipe.");
  } else if (role === "save") {
    requireItem("back", "A tela de save precisa de uma entrada Voltar.");
    requireItem("slot_1", "A tela de save precisa de um item para o slot 1.");
    if (!hasItemActor("slot-1") && !hasItemActor("slot_1")) {
      issues.push(issue("IN_GAME_SAVE_SLOT_ACTOR_MISSING", "warning", "O slot de save precisa de um ator OBJ próprio.", "actors", "Associe o sprite do slot ao item slot-1."));
    }
  }
  return issues;
}

function checklist(
  profile: ScenePreflightProfile,
  layers: ScenePreflightLayer[],
  playerPresent: boolean,
  actors: SceneRecord[],
  collision: ScenePreflightCollisionReport,
  assets: ScenePreflightAssetStatus[],
  hudPresent: boolean,
  issues: ScenePreflightIssue[]
): ScenePreflightChecklistItem[] {
  const stateFor = (field: string, complete: boolean, required = true): ScenePreflightChecklistState => {
    if (issues.some((item) => item.severity === "error" && item.field?.startsWith(field))) return "blocked";
    if (complete) return "complete";
    return required ? "review" : "complete";
  };
  return [
    { id: "perspective", label: "Perspectiva/câmera", state: "complete", detail: `${profile.perspective.projection} · ${profile.camera.mode}` },
    { id: "layers", label: "Composição e camadas", state: stateFor("layers", layers.filter((layer) => layer.required).every((layer) => layer.present)), detail: `${layers.filter((layer) => layer.present).length}/${layers.length} camadas observadas` },
    { id: "player", label: "Player", state: stateFor("player", !profile.player.required || playerPresent, profile.player.required), detail: profile.player.required ? (playerPresent ? "Ator controlável encontrado." : "Referência do player pendente.") : "Não aplicável ao perfil." },
    { id: "actors", label: "Atores", state: stateFor("actors", !profile.actors.required || actors.length > 0, profile.actors.required), detail: `${actors.length} ator(es) na cena` },
    { id: "hud", label: "HUD", state: stateFor("layers.hud", !profile.hud.required || hudPresent, profile.hud.required), detail: profile.hud.required ? (hudPresent ? "HUD declarado no modelo atual." : "Referência de HUD pendente.") : "HUD opcional." },
    { id: "obstacles", label: "Obstáculos/interativos", state: stateFor("layers.obstacles", !profile.obstacles.required || collision.declared, profile.obstacles.required), detail: profile.obstacles.required ? profile.obstacles.collisionModel : "Não aplicável ou opcional." },
    { id: "collision", label: "Meta-grid de colisão", state: stateFor("collision", !collision.required || collision.declared, collision.required), detail: `${collision.actualCellCount}/${collision.expectedCellCount ?? "?"} células · independente da arte` },
    { id: "controls", label: "Controles", state: "complete", detail: `${profile.controls.filter((control) => control.required).length} entrada(s) obrigatória(s)` },
    { id: "gameplay", label: "Loop e objetivo", state: "complete", detail: profile.gameplay.objective },
    { id: "states", label: "Estados", state: "complete", detail: `${profile.states.length} estado(s)` },
    { id: "events", label: "Eventos/triggers", state: "complete", detail: `${profile.events.length} contrato(s) · ${issues.filter((item) => item.field?.startsWith("events")).length} alerta(s)` },
    { id: "vfx-audio", label: "VFX e áudio", state: "complete", detail: `${profile.vfx.length} VFX · ${profile.audio.channels} canal(is)` },
    { id: "assets", label: "Assets e dependências", state: stateFor("assets", assets.every((asset) => !asset.required || asset.present)), detail: `${assets.filter((asset) => asset.present).length}/${assets.length} referências resolvidas` },
    { id: "budget", label: "Orçamento físico", state: "complete", detail: `${profile.budget.bgTiles} BG · ${profile.budget.objTiles} OBJ · ${profile.budget.oam} OAM` },
    { id: "verification", label: "Testes/evidências", state: "review", detail: "A execução dos comandos ainda é uma evidência externa ao contrato." }
  ];
}

export function buildScenePreflightReport(
  data: GBAProjectData,
  requestedSceneName?: string,
  options: { profileId?: unknown } = {}
): ScenePreflightReport {
  const scene = sceneByName(data, requestedSceneName);
  const name = requestedSceneName ?? sceneName(scene);
  const type = normalizedSceneType(sceneType(scene));
  const config = runtimeConfig(scene);
  const configuredProfile = options.profileId !== undefined ? options.profileId : explicitProfileID(scene, config);
  const inferredProfile = type === "isometric" && config.gameplayMode === "tactical"
    ? "tacticalGrid"
    : type === "menu" && config.role === "gender_select"
      ? "menuGenderSelect"
    : type === "menu" && config.role === "name_input"
      ? "menuNameInput"
    : type === "menu" && typeof config.role === "string" && IN_GAME_MENU_PROFILE_BY_ROLE[config.role]
      ? IN_GAME_MENU_PROFILE_BY_ROLE[config.role]
      : undefined;
  const requestedProfile = configuredProfile ?? inferredProfile;
  const selectedProfileID = requestedProfile === undefined ? null : profileID(requestedProfile);
  const baseProfile = scenePreflightProfile(type, requestedProfile);
  const profile = hasPagedWorldMap(data, scene) ? {...baseProfile, budget:{...baseProfile.budget,
    bgTiles:PAGED_WORLD_MAP.maxTileUnits, dmaBytes:PAGED_WORLD_MAP.dmaBudget}} : baseProfile;
  const actors = actorsForScene(data, name);
  const triggers = triggersForScene(data, name);
  const events = eventsForScene(data, name);
  const rawCollision = collisionReport(scene, config, profile);
  const playerActorName = scenePlayerActorName(scene, config);
  const playerActor = actors.find((actor) => stringValue(actor.name) === playerActorName);
  const playerPresent = Boolean(playerActor && actorHasSprite(playerActor));
  const layers = profile.layers.map((layer) => {
    const present = layerPresent(data, name, scene, config, type, layer, actors, rawCollision.declared);
    return { ...layer, present, detail: layerDetail(layer, present) };
  });
  const editorTools = sceneTypeProfile(type).editorTools;
  const assets = [
    ...profile.assets,
    ...tacticalAssetRequirements(type, config, editorTools)
  ].map((asset) => assetStatus(data, scene, config, asset, actors, rawCollision));
  const hardwareContract = buildGbaHardwareContract(data);
  const hardware = hardwareContract.scenes.find((candidate) => candidate.name === name) ?? null;
  const hardwareIssues = hardware?.issues.map((item) => issue(
    item.code,
    item.severity,
    item.message,
    item.field,
    item.resolution
  )) ?? [];
  const capabilityIssues = capabilityPreflightIssues(data, scene, type, editorTools);
  const issues = [
    ...buildIssues(profile, { scene, playerPresent, actors, layers, collision: rawCollision, assets, editorTools, capabilityIssues }),
    ...hardwareIssues,
    ...(profile.id === "menuGenderSelect" ? menuGenderSelectionIssues(config, actors) : []),
    ...(profile.id === "menuNameInput" ? menuNameInputIssues(config, actors) : []),
    ...(IN_GAME_MENU_PROFILE_BY_ROLE[config.role as string] ? menuInGameIssues(config.role as string, config, actors) : []),
    ...(normalizeAffineScenePresentation(config.affine).enabled && sceneHudReference(scene, config) !== null
      ? [issue("AFFINE_HUD_CONFLICT", "warning", "A cena usa mapa affine 128x128 nos screenblocks 0-7, que coincidem com o bloco de caracteres do BG0 da HUD.", "hudPresetId", "Remova o hudPresetId desta cena affine ou mova a interface para uma cena comum; HUD e mapa affine nao dividem a VRAM.")]
      : []),
    ...(requestedProfile !== undefined && selectedProfileID === null
      ? [issue("UNKNOWN_PROFILE", "error", "A configuração de preflight pede um perfil que não pertence ao catálogo fechado.", "profileId", "Selecione um perfil compatível ou remova a substituição explícita.")]
      : []),
    ...(selectedProfileID !== null && !profile.sceneTypes.includes(type)
      ? [issue("INCOMPATIBLE_PROFILE", "error", `O perfil ${profile.id} não é compatível com a cena ${type}.`, "profileId", "Escolha um perfil compatível com o tipo da cena antes de exportar.")]
      : [])
  ];
  const status: ScenePreflightStatus = issues.some((item) => item.severity === "error")
    ? "blocked"
    : issues.some((item) => item.severity === "warning") ? "review" : "ready";
  const hudPresetId = sceneHudReference(scene, config);
  const musicReference = stringValue(scene?.music) ?? stringValue(config.music);
  const hudPresent = Boolean(hudPresetId)
    || Boolean(sceneTacticalPresentation(config).hudLayout)
    || layers.some((layer) => (layer.role === "hud" || layer.role === "dialogue") && layer.present);
  const obstacleLayerPresent = layers.some((layer) => layer.role === "obstacles" && layer.present);
  const obstaclesPresent = triggers.length > 0 || obstacleLayerPresent || (profile.obstacles.required && rawCollision.declared);
  const checklistItems = checklist(profile, layers, playerPresent, actors, rawCollision, assets, hudPresent, issues);
  const fixture = sceneFixtureContext(data);
  return {
    schema: 1,
    registry: "gba-studio-scene-preflight",
    sceneName: name,
    sceneType: type,
    profileId: profile.id,
    profileLabel: profile.label,
    status,
    purpose: profile.purpose,
    perspective: profile.perspective,
    camera: profile.camera,
    layers,
    player: { ...profile.player, actions: [...profile.player.actions], spriteSizePixels: profile.player.spriteSizePixels ? { ...profile.player.spriteSizePixels } : null, present: playerPresent, actorName: playerActorName },
    actors: { ...profile.actors, roles: [...profile.actors.roles], count: actors.length, names: actors.map((actor, index) => stringValue(actor.name) ?? `Ator ${index + 1}`) },
    hud: { ...profile.hud, elements: [...profile.hud.elements], present: hudPresent, presetId: hudPresetId },
    obstacles: { ...profile.obstacles, types: [...profile.obstacles.types], count: triggers.length, present: obstaclesPresent },
    collision: rawCollision,
    controls: profile.controls.map((control) => ({ ...control })),
    gameplay: { ...profile.gameplay, loop: [...profile.gameplay.loop], success: [...profile.gameplay.success], failure: [...profile.gameplay.failure] },
    states: [...profile.states],
    events: { expected: [...profile.events], declaredCount: events.length, triggerCount: triggers.length },
    vfx: [...profile.vfx],
    audio: { ...profile.audio, cues: [...profile.audio.cues], musicReference, sfxCount: records(data.audioItems).filter((item) => stringValue(item.kind)?.toLowerCase().includes("sfx")).length },
    assets,
    editorTools: [...editorTools],
    requiredEditorTools: [...profile.editorTools],
    enabledCapabilities: enabledCapabilities(scene, type, editorTools),
    budget: { source: "profile", safeLimit: { ...profile.budget } },
    hardware,
    complexity: profile.complexity,
    fallback: profile.fallback,
    verification: { tests: [...profile.verification.tests], evidence: [...profile.verification.evidence] },
    ...(fixture ? { fixture } : {}),
    checklist: checklistItems,
    issues
  };
}

function nonnegativeBudget(value: unknown): boolean {
  return isRecord(value) && Object.keys(DEFAULT_PHYSICAL_BUDGET).every((key) => (
    typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0
  ));
}

export function validateScenePreflightReport(value: unknown): ScenePreflightIssue[] {
  if (!isRecord(value)) return [issue("INVALID_REPORT", "error", "O relatório de preflight deve ser um objeto JSON.")];
  const issues: ScenePreflightIssue[] = [];
  if (value.schema !== 1) issues.push(issue("INVALID_SCHEMA", "error", "O preflight deve usar schema 1.", "schema"));
  if (value.registry !== "gba-studio-scene-preflight") issues.push(issue("INVALID_REGISTRY", "error", "O registro de preflight é inválido.", "registry"));
  if (typeof value.sceneName !== "string" || value.sceneName.trim().length === 0) issues.push(issue("INVALID_SCENE_NAME", "error", "sceneName deve ser uma string não vazia.", "sceneName"));
  if (typeof value.sceneType !== "string" || value.sceneType.trim().length === 0) issues.push(issue("INVALID_SCENE_TYPE", "error", "sceneType deve ser uma string não vazia.", "sceneType"));
  const selectedProfileID = profileID(value.profileId);
  const selectedProfile = selectedProfileID ? scenePreflightProfile(value.sceneType as string, selectedProfileID) : null;
  if (!selectedProfileID) issues.push(issue("UNKNOWN_PROFILE", "error", "profileId não pertence ao catálogo fechado de preflight.", "profileId"));
  if (selectedProfile && typeof value.sceneType === "string" && value.sceneType.trim().length > 0) {
    const normalizedType = normalizedSceneType(value.sceneType);
    if (!selectedProfile.sceneTypes.includes(normalizedType)) {
      issues.push(issue("INCOMPATIBLE_PROFILE", "error", `O perfil ${selectedProfile.id} não é compatível com a cena ${normalizedType}.`, "profileId"));
    }
  }
  if (!["ready", "review", "blocked"].includes(String(value.status))) issues.push(issue("INVALID_STATUS", "error", "status deve ser ready, review ou blocked.", "status"));
  if (!Array.isArray(value.layers)) issues.push(issue("INVALID_LAYERS", "error", "layers deve ser uma lista.", "layers"));
  if (!Array.isArray(value.assets)) issues.push(issue("INVALID_ASSETS", "error", "assets deve ser uma lista.", "assets"));
  if (!Array.isArray(value.checklist)) issues.push(issue("INVALID_CHECKLIST", "error", "checklist deve ser uma lista.", "checklist"));
  if (!Array.isArray(value.issues)) issues.push(issue("INVALID_ISSUES", "error", "issues deve ser uma lista.", "issues"));
  for (const field of ["editorTools", "requiredEditorTools", "enabledCapabilities"] as const) {
    if (!Array.isArray(value[field]) || value[field].some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
      issues.push(issue("INVALID_EDITOR_TOOLS", "error", `${field} deve ser uma lista de strings não vazias.`, field));
    }
  }
  if (typeof value.fallback !== "string" || value.fallback.trim().length === 0) {
    issues.push(issue("INVALID_FALLBACK", "error", "fallback deve ser uma string não vazia.", "fallback"));
  }
  if (!isRecord(value.verification)
    || !Array.isArray(value.verification.tests)
    || !Array.isArray(value.verification.evidence)
    || value.verification.tests.some((entry) => typeof entry !== "string" || entry.trim().length === 0)
    || value.verification.evidence.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    issues.push(issue("INVALID_VERIFICATION", "error", "verification deve declarar listas de testes e evidências.", "verification"));
  }
  if (value.fixture !== undefined) {
    if (!isRecord(value.fixture)) {
      issues.push(issue("INVALID_FIXTURE_CONTEXT", "error", "fixture deve ser um objeto.", "fixture"));
    } else {
      if (value.fixture.registry !== "gba-studio-complete-structural-fixture") {
        issues.push(issue("INVALID_FIXTURE_CONTEXT", "error", "fixture.registry é inválido.", "fixture.registry"));
      }
      if (value.fixture.mode !== "structural") {
        issues.push(issue("INVALID_FIXTURE_CONTEXT", "error", "fixture.mode deve ser structural.", "fixture.mode"));
      }
      if (value.fixture.productionReady !== false) {
        issues.push(issue("PRODUCTION_READY_FORBIDDEN", "error", "fixture não pode ser marcada como pronta para produção.", "fixture.productionReady"));
      }
    }
  }
  if (!isRecord(value.collision) || value.collision.independentOfArt !== true) {
    issues.push(issue("COLLISION_NOT_INDEPENDENT", "error", "collision.independentOfArt deve ser true.", "collision.independentOfArt"));
  }
  const budget = isRecord(value.budget) ? value.budget.safeLimit : undefined;
  if (!nonnegativeBudget(budget)) issues.push(issue("INVALID_BUDGET", "error", "budget.safeLimit deve declarar todos os limites físicos como números não negativos.", "budget.safeLimit"));
  return issues;
}
