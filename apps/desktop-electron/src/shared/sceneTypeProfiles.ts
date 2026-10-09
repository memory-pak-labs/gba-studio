import type { RoomCollisionType } from "./roomCollisionTypes.js";
import { normalizeSceneTypeId, sceneTypeLabel } from "./sceneTypes.js";
import { resolveSceneRuntimeExport, type SceneExportKind } from "./sceneRuntimeExport.js";
import { normalizeMenuSceneConfig, type MenuSceneConfig } from "./menuScene.js";
import {
  resolveControlledEntityContract,
  type ControlledEntityContract,
  type ControlledEntitySceneType
} from "../../../../packages/scene-contracts/src/index.js";
import {
  DEFAULT_ISOMETRIC_SCENE_CONTRACT,
  normalizeIsometricSceneContract,
  type IsometricHeightMode,
  type IsometricGameplayMode,
  type IsometricMovementModel,
  type IsometricProjectionID,
  type IsometricSceneProfileID
} from "./isometricProfiles.js";
import {
  resolveSceneFeatureModules,
  sceneTypeCapabilities,
  type SceneFeatureModuleConfig,
  type SceneTypeProfileCapabilities
} from "./sceneFeatureModules.js";
import { resolveSceneAdvancedCapabilities, type SceneAdvancedCapabilityConfig } from "./sceneAdvancedCapabilities.js";
import {
  normalizeIsometricTacticalPresentation,
  resolveIsometricTacticalCapabilities,
  type IsoTacticalPresentationConfig,
  type SceneTacticalCapabilityConfig
} from "./isometricTacticalPresentation.js";
import {
  normalizeIsometricTacticalConfig,
  type IsometricTacticalConfig
} from "./isometricTactical.js";
import {
  normalizeAffineScenePresentation,
  type AffineScenePresentation
} from "./affineScene.js";
import {
  normalizeSceneComposition,
  type SceneCompositionConfig
} from "./sceneComposition.js";
import {
  normalizeSceneResourceManifest,
  type SceneResourceManifest
} from "./sceneResourceContract.js";
import {
  resolveSceneMetatileAuthoring,
  type SceneMetatileAuthoringConfig
} from "./sceneMetatileContract.js";

export type SceneEditorTool = "select" | "paint" | "collision" | "height" | "actor" | "trigger" | "camera" | "room";

export interface SceneFeatureRuntimeConfig {
  modules?: SceneFeatureModuleConfig[];
  capabilities?: SceneAdvancedCapabilityConfig[];
  tacticalCapabilities?: SceneTacticalCapabilityConfig[];
  tacticalPresentation?: IsoTacticalPresentationConfig;
  metatiles?: SceneMetatileAuthoringConfig;
  affine?: AffineScenePresentation;
  composition?: SceneCompositionConfig;
  resources?: SceneResourceManifest;
}

export type PlatformerDropThroughMode = "off" | "down_hold" | "down_tap" | "down_jump_hold" | "down_jump_tap";
export type PlatformerCameraLockEdge = "none" | "left" | "right" | "both";
export type PlatformerDashStyle = "ground" | "air" | "both";
export type PlatformerDashMomentum = "horizontal" | "vertical" | "both";
export type PlatformerDashThrough = "none" | "actors" | "actors_triggers" | "actors_triggers_walls";

export interface PlatformerSceneConfig extends SceneFeatureRuntimeConfig {
  walkSpeed: number;
  acceleration: number;
  friction: number;
  gravity: number;
  maxFallSpeed: number;
  jumpSpeed: number;
  coyoteTime: number;
  jumpBuffer: number;
  ladders: boolean;
  doubleJump: boolean;
  wallJump: boolean;
  wallSlide: boolean;
  jumpMinHeight: number;
  jumpFrames: number;
  jumpReduction: number;
  airControl: boolean;
  changeDirectionInAir: boolean;
  airDeceleration: number;
  dropThrough: PlatformerDropThroughMode;
  cameraFollow: number;
  cameraDeadzoneX: number;
  cameraLockEdge: PlatformerCameraLockEdge;
  wallSlideSpeed: number;
  wallJumpSpeed: number;
  wallJumpPush: number;
  dash: boolean;
  dashStyle: PlatformerDashStyle;
  dashMomentum: PlatformerDashMomentum;
  dashThrough: PlatformerDashThrough;
  dashRechargeFrames: number;
  dashSpeed: number;
  dashFrames: number;
  glide: boolean;
  glideFallSpeed: number;
  platformActorCollisionGroup: number;
  solidActorCollisionGroup: number;
  actorGravity: boolean;
}

export interface PlatformerSceneRuntime {
  type: "platformer";
  config: Partial<PlatformerSceneConfig>;
}

export interface PointClickSceneConfig extends SceneFeatureRuntimeConfig {
  cursorSpeed: number;
  hotspotPadding: number;
}

export interface PointClickSceneRuntime {
  type: "pointAndClick";
  config: Partial<PointClickSceneConfig>;
}

export interface ShmupWavePlanEntry {
  name: string;
  startFrame: number;
  playerSpeed?: number;
  fireCooldown?: number;
  scrollSpeed?: number;
}

export interface ShmupSceneConfig extends SceneFeatureRuntimeConfig {
  playerSpeed: number;
  fireCooldown: number;
  scrollSpeed: number;
  wavePlan?: ShmupWavePlanEntry[];
}

export interface ShmupSceneRuntime {
  type: "shmup";
  config: Partial<ShmupSceneConfig>;
}

export type IsometricWorldMode = "scrollable_tiled_world" | "static_composition";

export interface IsometricSceneConfig extends SceneFeatureRuntimeConfig {
  /** Authored scrolling layers; collision and height remain in the logical grid. */
  pagedSurface?: { backgroundAsset: string; foregroundAsset: string; width: number; height: number };
  worldMode: IsometricWorldMode;
  gameplayMode: IsometricGameplayMode;
  tactical?: IsometricTacticalConfig;
  profile: IsometricSceneProfileID;
  projection: IsometricProjectionID;
  movement: IsometricMovementModel;
  heightMode: IsometricHeightMode;
  tileWidth: number;
  tileHeight: number;
  heightStep: number;
  originX: number;
  originY: number;
  /** Fixed runtime presentation scale; editor cameraZoom remains independent. */
  presentationZoom: number;
}

export type IsometricSceneGeometryConfig = Pick<
  IsometricSceneConfig,
  "tileWidth" | "tileHeight" | "heightStep" | "originX" | "originY" | "presentationZoom"
>;

export interface IsometricSceneRuntime {
  type: "isometric";
  config: Partial<IsometricSceneConfig>;
}

export type DungeonCrawlerPlayerStartDirection = "up" | "right" | "down" | "left";

export interface DungeonCrawlerPlayerStart {
  x: number;
  y: number;
  direction: DungeonCrawlerPlayerStartDirection;
}

export interface DungeonCrawlerSceneConfig extends SceneFeatureRuntimeConfig {
  stepDurationMs: number;
  turnDurationMs: number;
  allowBackstep: boolean;
  viewDistance: number;
  playerStart?: DungeonCrawlerPlayerStart;
}

export interface DungeonCrawlerSceneRuntime {
  type: "dungeonCrawler";
  config: Partial<DungeonCrawlerSceneConfig>;
}

export interface RacingSceneConfig extends SceneFeatureRuntimeConfig {
  maxSpeed: number;
  acceleration: number;
  brakePower: number;
  steeringSpeed: number;
  presentation: "topdown" | "pseudo3d";
  lapsToWin: number;
  checkpointsPerLap: number;
  pickupsPerLap: number;
  rivalSpeed: number;
  roadCurve: number;
  showMinimap: boolean;
  trackSegments?: RacingTrackSegmentConfig[];
  topdownTrack?: RacingTopdownTrackConfig;
  pseudo3dVisuals?: RacingPseudo3DVisuals;
  perspectiveCamera?: RacingPerspectiveCamera;
}

export interface RacingPerspectiveCamera {
  height: number;
  distance: number;
  focalLength: number;
}

export interface RacingTrackSegmentConfig {
  lengthPixels: number;
  curve: number;
  halfWidth: number;
}

export interface RacingTopdownCheckpointConfig {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RacingTopdownTrackConfig {
  cameraDeadZoneX: number;
  cameraDeadZoneY: number;
  startHeading?: number;
  finishAtZero?: boolean;
  pathPoints?: Array<{ x: number; y: number }>;
  checkpoints: RacingTopdownCheckpointConfig[];
}

export interface RacingPseudo3DVisuals {
  horizonY: number;
  panoramaBackgroundId: string;
  floorTilemapId: string;
  minimapAssetId: string;
}

export interface RacingSceneRuntime {
  type: "racing";
  config: Partial<RacingSceneConfig>;
}

export type BattleRpgPokemonType =
  | "normal" | "fire" | "water" | "electric" | "grass" | "ice"
  | "fighting" | "poison" | "ground" | "flying" | "psychic" | "bug"
  | "rock" | "ghost" | "dragon" | "dark" | "steel" | "fairy";

export type BattleRpgMoveCategory = "physical" | "special" | "status";

export interface BattleRpgPokemonMove {
  id: string;
  name: string;
  type: BattleRpgPokemonType;
  category: BattleRpgMoveCategory;
  power: number;
  accuracy: number;
  pp: number;
  maxPp: number;
  description: string;
}

export interface BattleRpgPokemon {
  id: string;
  species: string;
  nickname: string;
  level: number;
  types: [BattleRpgPokemonType, BattleRpgPokemonType | null];
  maxHp: number;
  currentHp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  experience: number;
  experienceToNext: number;
  status: "none" | "poison" | "burn" | "freeze" | "paralysis" | "sleep" | "confusion";
  moves: BattleRpgPokemonMove[];
  ability: string;
  spriteFront: string;
  spriteBack: string;
}

export interface BattleRpgSceneConfig extends SceneFeatureRuntimeConfig {
  maxPartySize: number;
  maxEnemies: number;
  turnDelayFrames: number;
  escapeEnabled: boolean;
  experienceMultiplier: number;
  typeEffectivenessEnabled: boolean;
  criticalHitEnabled: boolean;
  statusConditionsEnabled: boolean;
  abilitiesEnabled: boolean;
  showExperienceBar: boolean;
  showHealthBars: boolean;
  battleStyle: "single" | "double";
  weatherEffect: "none" | "rain" | "sun" | "sandstorm" | "hail";
  rewardGold: number;
  rewardExperience: number;
}

export interface BattleRpgSceneRuntime {
  type: "battleRpg";
  config: Partial<BattleRpgSceneConfig>;
}

export interface LutaSceneRuntime {
  type: "luta";
  config: Partial<LutaSceneConfig>;
}

export type LutaFightingStyle = "a-ism" | "x-ism" | "v-ism";
export type LutaAttackStrength = "light" | "medium" | "heavy";
export type LutaAttackType = "punch" | "kick";

export interface LutaSpecialMove {
  id: string;
  name: string;
  input: string;
  buttonSequence: LutaAttackType[];
  strength: LutaAttackStrength;
  superLevel: number;
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  damage: number;
  stun: number;
  description: string;
}

export interface LutaCharacter {
  id: string;
  name: string;
  portraitFront: string;
  portraitBack: string;
  spriteFront: string;
  spriteBack: string;
  maxHp: number;
  attack: number;
  defense: number;
  walkSpeed: number;
  jumpSpeed: number;
  weight: number;
  guardPower: number;
  superGaugeMax: number;
  specialMoves: LutaSpecialMove[];
  throwRange: number;
  description: string;
}

export interface LutaSceneConfig extends SceneFeatureRuntimeConfig {
  roundTime: number;
  roundsToWin: number;
  maxSuperGauge: number;
  superGaugeGainOnHit: number;
  superGaugeGainOnReceive: number;
  guardPowerRecovery: number;
  chipDamageEnabled: boolean;
  airBlockingEnabled: boolean;
  alphaCounterEnabled: boolean;
  throwEscapeWindow: number;
  parryWindow: number;
  hitstunDecay: number;
  comboLimit: number;
  vismCustomComboGauge: number;
  defaultStyle: LutaFightingStyle;
  stageId: string;
  player1StartX: number;
  player2StartX: number;
  hudAssetName?: string;
}

export interface WorldMapSceneConfig extends SceneFeatureRuntimeConfig {
  cursorAffine?: boolean;
  navigable: boolean;
  unlocked: boolean;
  hideWhenLocked: boolean;
  requiredVariable: number;
  requiredValue: number;
  targetLevel: number;
  nodes?: WorldMapNodeConfig[];
}

export interface WorldMapNodeConfig {
  id: string;
  name: string;
  x: number;
  y: number;
  connections: string[];
  dialogueKey: string;
  eventName: string;
  unlocked: boolean;
  hideWhenLocked: boolean;
  requiredVariable: number;
  requiredValue: number;
  targetLevel: number;
}

export interface WorldMapSceneRuntime {
  type: "worldMap";
  config: Partial<WorldMapSceneConfig>;
}

export interface VisualNovelSceneConfig extends SceneFeatureRuntimeConfig { autoAdvance: boolean; nextSceneIndex: number; backgroundIndex: number; dialogueKey?: string; }
export interface VisualNovelSceneRuntime { type: "visualNovel"; config: Partial<VisualNovelSceneConfig>; }
export interface CutsceneActorMotionConfig {
  actorIndex: number;
  fromPosition: { x: number; y: number };
  toPosition: { x: number; y: number };
  durationFrames: number;
}
export interface CutsceneStepConfig {
  id: string;
  dialogueKey: string;
  backgroundAssetName?: string;
  eventName: string;
  durationFrames: number;
  autoAdvance: boolean;
  skippable: boolean;
  waitForDialogue: boolean;
  onSkipEventName: string;
  targetSceneIndex: number;
  branchVariable: number;
  branchValue: number;
  branchTargetSceneIndex: number;
  branchTargetStepIndex: number;
  actorMotions?: CutsceneActorMotionConfig[];
}
export interface CutsceneSceneConfig extends SceneFeatureRuntimeConfig {
  stepDurationFrames: number;
  autoAdvance: boolean;
  nextSceneIndex: number;
  backgroundIndex: number;
  steps?: CutsceneStepConfig[];
}
export interface CutsceneSceneRuntime { type: "cutscene"; config: Partial<CutsceneSceneConfig>; }
export interface MenuSceneRuntime { type: "menu"; config: Partial<MenuSceneConfig> & Record<string, unknown> & SceneFeatureRuntimeConfig; }

export interface GenericSceneRuntime {
  type: string;
  config: Record<string, unknown> & SceneFeatureRuntimeConfig;
}

export type SceneRuntimeConfig = PlatformerSceneRuntime | PointClickSceneRuntime | ShmupSceneRuntime | IsometricSceneRuntime | DungeonCrawlerSceneRuntime | RacingSceneRuntime | BattleRpgSceneRuntime | LutaSceneRuntime | WorldMapSceneRuntime | VisualNovelSceneRuntime | CutsceneSceneRuntime | MenuSceneRuntime | GenericSceneRuntime;

export interface SceneTypeProfile {
  id: string;
  label: string;
  exportKind: SceneExportKind;
  editorTools: SceneEditorTool[];
  collisionTypes: RoomCollisionType[];
  controlledEntityContract: ControlledEntityContract;
  capabilities: SceneTypeProfileCapabilities;
}

export const DEFAULT_PLATFORMER_SCENE_CONFIG: PlatformerSceneConfig = {
  walkSpeed: 1.5,
  acceleration: 0.25,
  friction: 0.1875,
  gravity: 0.1875,
  maxFallSpeed: 4,
  jumpSpeed: 5.5,
  coyoteTime: 4,
  jumpBuffer: 5,
  ladders: true,
  doubleJump: false,
  wallJump: false,
  wallSlide: true,
  jumpMinHeight: 0,
  jumpFrames: 1,
  jumpReduction: 0,
  airControl: true,
  changeDirectionInAir: true,
  airDeceleration: 0,
  dropThrough: "off",
  cameraFollow: 15,
  cameraDeadzoneX: 0,
  cameraLockEdge: "none",
  wallSlideSpeed: 1.5,
  wallJumpSpeed: 5,
  wallJumpPush: 3,
  dash: false,
  dashStyle: "both",
  dashMomentum: "horizontal",
  dashThrough: "none",
  dashRechargeFrames: 0,
  dashSpeed: 6,
  dashFrames: 8,
  glide: false,
  glideFallSpeed: 1.25,
  platformActorCollisionGroup: 0,
  solidActorCollisionGroup: 0,
  actorGravity: false
};

export const DEFAULT_POINT_CLICK_SCENE_CONFIG: PointClickSceneConfig = {
  cursorSpeed: 2,
  hotspotPadding: 4
};

export const DEFAULT_SHMUP_SCENE_CONFIG: ShmupSceneConfig = {
  playerSpeed: 2,
  fireCooldown: 8,
  scrollSpeed: 1
};

export const DEFAULT_ISOMETRIC_SCENE_CONFIG: IsometricSceneConfig = {
  ...DEFAULT_ISOMETRIC_SCENE_CONTRACT,
  worldMode: "scrollable_tiled_world",
  tileWidth: 32,
  tileHeight: 16,
  heightStep: 8,
  originX: 120,
  originY: 16,
  presentationZoom: 100
};

export const DEFAULT_DUNGEON_CRAWLER_SCENE_CONFIG: DungeonCrawlerSceneConfig = {
  stepDurationMs: 180,
  turnDurationMs: 120,
  allowBackstep: true,
  viewDistance: 5
};

export const DEFAULT_RACING_SCENE_CONFIG: RacingSceneConfig = {
  maxSpeed: 4,
  acceleration: 8,
  brakePower: 12,
  steeringSpeed: 2,
  presentation: "topdown",
  lapsToWin: 1,
  checkpointsPerLap: 1,
  pickupsPerLap: 0,
  rivalSpeed: 3.5,
  roadCurve: 0,
  showMinimap: false
};

export const DEFAULT_BATTLE_RPG_SCENE_CONFIG: BattleRpgSceneConfig = {
  maxPartySize: 6,
  maxEnemies: 1,
  turnDelayFrames: 30,
  escapeEnabled: true,
  experienceMultiplier: 1,
  typeEffectivenessEnabled: true,
  criticalHitEnabled: true,
  statusConditionsEnabled: true,
  abilitiesEnabled: true,
  showExperienceBar: true,
  showHealthBars: true,
  battleStyle: "single",
  weatherEffect: "none",
  rewardGold: 100,
  rewardExperience: 50
};

export const DEFAULT_LUTA_SCENE_CONFIG: LutaSceneConfig = {
  roundTime: 99,
  roundsToWin: 2,
  maxSuperGauge: 100,
  superGaugeGainOnHit: 8,
  superGaugeGainOnReceive: 4,
  guardPowerRecovery: 2,
  chipDamageEnabled: true,
  airBlockingEnabled: true,
  alphaCounterEnabled: true,
  throwEscapeWindow: 8,
  parryWindow: 4,
  hitstunDecay: 0.85,
  comboLimit: 60,
  vismCustomComboGauge: 100,
  defaultStyle: "a-ism",
  stageId: "stage_default",
  player1StartX: 80,
  player2StartX: 200
};

export const DEFAULT_WORLD_MAP_SCENE_CONFIG: WorldMapSceneConfig = {
  navigable: false,
  unlocked: true,
  hideWhenLocked: false,
  requiredVariable: -1,
  requiredValue: 0,
  targetLevel: -1
};
export const DEFAULT_VISUAL_NOVEL_SCENE_CONFIG: VisualNovelSceneConfig = { autoAdvance: false, nextSceneIndex: -1, backgroundIndex: -1 };
export const DEFAULT_CUTSCENE_SCENE_CONFIG: CutsceneSceneConfig = { stepDurationFrames: 8, autoAdvance: true, nextSceneIndex: -1, backgroundIndex: -1 };

const UNIVERSAL_AUTHORING_TOOLS: readonly SceneEditorTool[] = ["select", "paint", "collision", "actor", "trigger", "room"];
const GAMEPLAY_EDITOR_TOOLS: SceneEditorTool[] = ["select", "paint", "collision", "actor", "trigger", "camera", "room"];
const ISOMETRIC_EDITOR_TOOLS: SceneEditorTool[] = ["select", "paint", "collision", "height", "actor", "trigger", "camera", "room"];
const SCENE_EDITOR_TOOLS: Readonly<Record<string, readonly SceneEditorTool[]>> = Object.freeze({
  topdown: GAMEPLAY_EDITOR_TOOLS,
  platformer: GAMEPLAY_EDITOR_TOOLS,
  isometric: ISOMETRIC_EDITOR_TOOLS,
  dungeonCrawler: [...UNIVERSAL_AUTHORING_TOOLS],
  racing: GAMEPLAY_EDITOR_TOOLS,
  pointAndClick: [...UNIVERSAL_AUTHORING_TOOLS],
  shmup: ["select", "paint", "collision", "actor", "trigger", "camera", "room"],
  battleRpg: [...UNIVERSAL_AUTHORING_TOOLS],
  luta: [...UNIVERSAL_AUTHORING_TOOLS],
  worldMap: [...UNIVERSAL_AUTHORING_TOOLS],
  cutscene: ["select", "paint", "collision", "actor", "trigger", "camera", "room"],
  visualNovel: [...UNIVERSAL_AUTHORING_TOOLS],
  menu: [...UNIVERSAL_AUTHORING_TOOLS]
});
const COMMON_COLLISIONS: RoomCollisionType[] = ["free", "solid", "down", "up", "left", "right", "water", "event"];
const RACING_COLLISIONS: RoomCollisionType[] = [...COMMON_COLLISIONS, "damage"];
const PLATFORMER_COLLISIONS: RoomCollisionType[] = [
  "free", "solid", "down", "up", "left", "right", "damage", "ladder", "slope_up_right", "slope_up_left"
];

function finiteNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

function frameCount(value: unknown, fallback: number): number {
  return Math.round(finiteNumber(value, fallback, 0, 255));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSceneFeatureConfig(sceneType: string, value: Record<string, unknown>): SceneFeatureRuntimeConfig {
  const normalized: SceneFeatureRuntimeConfig = {};
  if (Object.hasOwn(value, "modules")) {
    normalized.modules = resolveSceneFeatureModules(sceneType, value.modules).modules;
  }
  if (Object.hasOwn(value, "capabilities")) {
    normalized.capabilities = resolveSceneAdvancedCapabilities(sceneType, value.capabilities).capabilities;
  }
  if (Object.hasOwn(value, "tacticalCapabilities")) {
    normalized.tacticalCapabilities = resolveIsometricTacticalCapabilities(sceneType, value.tacticalCapabilities).capabilities;
  }
  if (Object.hasOwn(value, "tacticalPresentation")) {
    normalized.tacticalPresentation = normalizeIsometricTacticalPresentation(value.tacticalPresentation);
  }
  if (Object.hasOwn(value, "metatiles")) {
    normalized.metatiles = resolveSceneMetatileAuthoring(value.metatiles, 0, 0).config;
  }
  if (Object.hasOwn(value, "affine")) {
    normalized.affine = normalizeAffineScenePresentation(value.affine);
  }
  if (Object.hasOwn(value, "composition")) {
    normalized.composition = normalizeSceneComposition(value.composition);
  }
  if (Object.hasOwn(value, "resources")) {
    normalized.resources = normalizeSceneResourceManifest(value.resources);
  }
  return normalized;
}

export function normalizePlatformerSceneConfig(value: unknown): PlatformerSceneConfig {
  const config = isRecord(value) ? value : {};
  const enumValue = <T extends string>(candidate: unknown, allowed: readonly T[], fallback: T): T =>
    typeof candidate === "string" && allowed.includes(candidate as T) ? candidate as T : fallback;
  const collisionGroup = (candidate: unknown, fallback: number): number => {
    const value = Math.round(finiteNumber(candidate, fallback, 0, 8));
    return value === 0 || value === 2 || value === 4 || value === 8 ? value : fallback;
  };
  return {
    ...normalizeSceneFeatureConfig("platformer", config),
    walkSpeed: finiteNumber(config.walkSpeed, DEFAULT_PLATFORMER_SCENE_CONFIG.walkSpeed, 0, 16),
    acceleration: finiteNumber(config.acceleration, DEFAULT_PLATFORMER_SCENE_CONFIG.acceleration, 0, 16),
    friction: finiteNumber(config.friction, DEFAULT_PLATFORMER_SCENE_CONFIG.friction, 0, 16),
    gravity: finiteNumber(config.gravity, DEFAULT_PLATFORMER_SCENE_CONFIG.gravity, 0, 16),
    maxFallSpeed: finiteNumber(config.maxFallSpeed, DEFAULT_PLATFORMER_SCENE_CONFIG.maxFallSpeed, 0, 32),
    jumpSpeed: finiteNumber(config.jumpSpeed, DEFAULT_PLATFORMER_SCENE_CONFIG.jumpSpeed, 0, 32),
    coyoteTime: frameCount(config.coyoteTime, DEFAULT_PLATFORMER_SCENE_CONFIG.coyoteTime),
    jumpBuffer: frameCount(config.jumpBuffer, DEFAULT_PLATFORMER_SCENE_CONFIG.jumpBuffer),
    ladders: typeof config.ladders === "boolean" ? config.ladders : DEFAULT_PLATFORMER_SCENE_CONFIG.ladders,
    doubleJump: typeof config.doubleJump === "boolean" ? config.doubleJump : DEFAULT_PLATFORMER_SCENE_CONFIG.doubleJump,
    wallJump: typeof config.wallJump === "boolean" ? config.wallJump : DEFAULT_PLATFORMER_SCENE_CONFIG.wallJump,
    wallSlide: typeof config.wallSlide === "boolean" ? config.wallSlide : DEFAULT_PLATFORMER_SCENE_CONFIG.wallSlide,
    jumpMinHeight: finiteNumber(config.jumpMinHeight, DEFAULT_PLATFORMER_SCENE_CONFIG.jumpMinHeight, 0, 32),
    jumpFrames: frameCount(config.jumpFrames, DEFAULT_PLATFORMER_SCENE_CONFIG.jumpFrames),
    jumpReduction: finiteNumber(config.jumpReduction, DEFAULT_PLATFORMER_SCENE_CONFIG.jumpReduction, 0, 32),
    airControl: typeof config.airControl === "boolean" ? config.airControl : DEFAULT_PLATFORMER_SCENE_CONFIG.airControl,
    changeDirectionInAir: typeof config.changeDirectionInAir === "boolean" ? config.changeDirectionInAir : DEFAULT_PLATFORMER_SCENE_CONFIG.changeDirectionInAir,
    airDeceleration: finiteNumber(config.airDeceleration, DEFAULT_PLATFORMER_SCENE_CONFIG.airDeceleration, 0, 16),
    dropThrough: enumValue(config.dropThrough, ["off", "down_hold", "down_tap", "down_jump_hold", "down_jump_tap"] as const, DEFAULT_PLATFORMER_SCENE_CONFIG.dropThrough),
    cameraFollow: Math.round(finiteNumber(config.cameraFollow, DEFAULT_PLATFORMER_SCENE_CONFIG.cameraFollow, 0, 15)),
    cameraDeadzoneX: Math.round(finiteNumber(config.cameraDeadzoneX, DEFAULT_PLATFORMER_SCENE_CONFIG.cameraDeadzoneX, 0, 240)),
    cameraLockEdge: enumValue(config.cameraLockEdge, ["none", "left", "right", "both"] as const, DEFAULT_PLATFORMER_SCENE_CONFIG.cameraLockEdge),
    wallSlideSpeed: finiteNumber(config.wallSlideSpeed, DEFAULT_PLATFORMER_SCENE_CONFIG.wallSlideSpeed, 0, 32),
    wallJumpSpeed: finiteNumber(config.wallJumpSpeed, DEFAULT_PLATFORMER_SCENE_CONFIG.wallJumpSpeed, 0, 32),
    wallJumpPush: finiteNumber(config.wallJumpPush, DEFAULT_PLATFORMER_SCENE_CONFIG.wallJumpPush, 0, 32),
    dash: typeof config.dash === "boolean" ? config.dash : DEFAULT_PLATFORMER_SCENE_CONFIG.dash,
    dashStyle: enumValue(config.dashStyle, ["ground", "air", "both"] as const, DEFAULT_PLATFORMER_SCENE_CONFIG.dashStyle),
    dashMomentum: enumValue(config.dashMomentum, ["horizontal", "vertical", "both"] as const, DEFAULT_PLATFORMER_SCENE_CONFIG.dashMomentum),
    dashThrough: enumValue(config.dashThrough, ["none", "actors", "actors_triggers", "actors_triggers_walls"] as const, DEFAULT_PLATFORMER_SCENE_CONFIG.dashThrough),
    dashRechargeFrames: frameCount(config.dashRechargeFrames, DEFAULT_PLATFORMER_SCENE_CONFIG.dashRechargeFrames),
    dashSpeed: finiteNumber(config.dashSpeed, DEFAULT_PLATFORMER_SCENE_CONFIG.dashSpeed, 0, 32),
    dashFrames: frameCount(config.dashFrames, DEFAULT_PLATFORMER_SCENE_CONFIG.dashFrames),
    glide: typeof config.glide === "boolean" ? config.glide : DEFAULT_PLATFORMER_SCENE_CONFIG.glide,
    glideFallSpeed: finiteNumber(config.glideFallSpeed, DEFAULT_PLATFORMER_SCENE_CONFIG.glideFallSpeed, 0, 32),
    platformActorCollisionGroup: collisionGroup(config.platformActorCollisionGroup, DEFAULT_PLATFORMER_SCENE_CONFIG.platformActorCollisionGroup),
    solidActorCollisionGroup: collisionGroup(config.solidActorCollisionGroup, DEFAULT_PLATFORMER_SCENE_CONFIG.solidActorCollisionGroup),
    actorGravity: typeof config.actorGravity === "boolean" ? config.actorGravity : DEFAULT_PLATFORMER_SCENE_CONFIG.actorGravity
  };
}

export function normalizePointClickSceneConfig(value: unknown): PointClickSceneConfig {
  const config = isRecord(value) ? value : {};
  return {
    ...normalizeSceneFeatureConfig("pointAndClick", config),
    cursorSpeed: finiteNumber(config.cursorSpeed, DEFAULT_POINT_CLICK_SCENE_CONFIG.cursorSpeed, 0.125, 16),
    hotspotPadding: Math.round(finiteNumber(config.hotspotPadding, DEFAULT_POINT_CLICK_SCENE_CONFIG.hotspotPadding, 0, 32))
  };
}

function normalizeShmupWavePlan(value: unknown): ShmupWavePlanEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter(isRecord).slice(0, 64).map((entry, index) => ({
    name: typeof entry.name === "string" && entry.name.trim().length > 0
      ? entry.name.trim()
      : `wave_${index + 1}`,
    startFrame: Math.round(finiteNumber(entry.startFrame, 0, 0, 65535)),
    ...(Object.hasOwn(entry, "playerSpeed")
      ? { playerSpeed: finiteNumber(entry.playerSpeed, DEFAULT_SHMUP_SCENE_CONFIG.playerSpeed, 0.125, 16) }
      : {}),
    ...(Object.hasOwn(entry, "fireCooldown")
      ? { fireCooldown: Math.round(finiteNumber(entry.fireCooldown, DEFAULT_SHMUP_SCENE_CONFIG.fireCooldown, 1, 255)) }
      : {}),
    ...(Object.hasOwn(entry, "scrollSpeed")
      ? { scrollSpeed: finiteNumber(entry.scrollSpeed, DEFAULT_SHMUP_SCENE_CONFIG.scrollSpeed, 0, 16) }
      : {})
  }));
  return entries.length > 0 ? entries : undefined;
}

export function normalizeShmupSceneConfig(value: unknown): ShmupSceneConfig {
  const config = isRecord(value) ? value : {};
  const wavePlan = normalizeShmupWavePlan(config.wavePlan);
  return {
    ...normalizeSceneFeatureConfig("shmup", config),
    playerSpeed: finiteNumber(config.playerSpeed, DEFAULT_SHMUP_SCENE_CONFIG.playerSpeed, 0.125, 16),
    fireCooldown: Math.round(finiteNumber(config.fireCooldown, DEFAULT_SHMUP_SCENE_CONFIG.fireCooldown, 1, 255)),
    scrollSpeed: finiteNumber(config.scrollSpeed, DEFAULT_SHMUP_SCENE_CONFIG.scrollSpeed, 0, 16),
    ...(wavePlan ? { wavePlan } : {})
  };
}

function evenPixelDimension(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
  const clamped = finiteNumber(parsed, fallback, 2, 128);
  return Math.max(2, Math.round(clamped / 2) * 2);
}

export function normalizeIsometricSceneConfig(value: unknown): IsometricSceneConfig {
  const config = isRecord(value) ? value : {};
  // O grid isométrico do GBA usa o losango 2:1: cada passo avança metade da
  // largura na horizontal e metade da altura na vertical. A altura é
  // derivada da largura para impedir combinações inválidas como 32×8.
  const tileWidth = Math.max(4, evenPixelDimension(config.tileWidth, DEFAULT_ISOMETRIC_SCENE_CONFIG.tileWidth));
  const tactical = normalizeIsometricTacticalConfig(config.tactical, 64);
  const contract = normalizeIsometricSceneContract({
    ...config,
    ...(tactical ? { tactical } : {})
  });
  return {
    ...normalizeSceneFeatureConfig("isometric", config),
    ...contract,
    ...(isRecord(config.pagedSurface) && typeof config.pagedSurface.backgroundAsset === "string"
      && typeof config.pagedSurface.foregroundAsset === "string" ? { pagedSurface: {
        backgroundAsset: config.pagedSurface.backgroundAsset,
        foregroundAsset: config.pagedSurface.foregroundAsset,
        width: Math.max(240, Math.round(finiteNumber(config.pagedSurface.width, 240, 240, 2048) / 8) * 8),
        height: Math.max(160, Math.round(finiteNumber(config.pagedSurface.height, 160, 160, 2048) / 8) * 8)
      }} : {}),
    worldMode: config.worldMode === "static_composition" ? "static_composition" : "scrollable_tiled_world",
    tileWidth,
    tileHeight: Math.max(2, Math.round(tileWidth / 2)),
    heightStep: evenPixelDimension(config.heightStep, DEFAULT_ISOMETRIC_SCENE_CONFIG.heightStep),
    originX: Math.round(finiteNumber(config.originX, DEFAULT_ISOMETRIC_SCENE_CONFIG.originX, -512, 512)),
    originY: Math.round(finiteNumber(config.originY, DEFAULT_ISOMETRIC_SCENE_CONFIG.originY, -512, 512)),
    presentationZoom: Math.round(finiteNumber(
      config.presentationZoom,
      DEFAULT_ISOMETRIC_SCENE_CONFIG.presentationZoom,
      50,
      400
    )),
    ...(contract.gameplayMode === "tactical" && tactical ? { tactical } : {})
  };
}

export function normalizeDungeonCrawlerSceneConfig(value: unknown): DungeonCrawlerSceneConfig {
  const config = isRecord(value) ? value : {};
  const playerStartInput = isRecord(config.playerStart) ? config.playerStart : null;
  const playerStart = playerStartInput
    ? {
        x: Math.round(finiteNumber(playerStartInput.x, 0, 0, 255)),
        y: Math.round(finiteNumber(playerStartInput.y, 0, 0, 255)),
        direction: playerStartInput.direction === "right"
          || playerStartInput.direction === "down"
          || playerStartInput.direction === "left"
          ? playerStartInput.direction
          : "up"
      } satisfies DungeonCrawlerPlayerStart
    : undefined;
  return {
    ...normalizeSceneFeatureConfig("dungeonCrawler", config),
    stepDurationMs: Math.round(finiteNumber(config.stepDurationMs, DEFAULT_DUNGEON_CRAWLER_SCENE_CONFIG.stepDurationMs, 40, 1000)),
    turnDurationMs: Math.round(finiteNumber(config.turnDurationMs, DEFAULT_DUNGEON_CRAWLER_SCENE_CONFIG.turnDurationMs, 40, 1000)),
    allowBackstep: typeof config.allowBackstep === "boolean" ? config.allowBackstep : DEFAULT_DUNGEON_CRAWLER_SCENE_CONFIG.allowBackstep,
    viewDistance: Math.round(finiteNumber(config.viewDistance, DEFAULT_DUNGEON_CRAWLER_SCENE_CONFIG.viewDistance, 1, 12)),
    ...(playerStart ? { playerStart } : {})
  };
}

export function normalizeRacingSceneConfig(value: unknown): RacingSceneConfig {
  const config = isRecord(value) ? value : {};
  const cameraInput = isRecord(config.perspectiveCamera) ? config.perspectiveCamera : null;
  const perspectiveCamera = cameraInput ? {
    height: Math.round(finiteNumber(cameraInput.height, 48, 16, 96)),
    distance: Math.round(finiteNumber(cameraInput.distance, 64, 32, 160)),
    focalLength: Math.round(finiteNumber(cameraInput.focalLength, 96, 48, 160))
  } : undefined;
  const visualInput = isRecord(config.pseudo3dVisuals) ? config.pseudo3dVisuals : null;
  const pseudo3dVisuals = visualInput
    ? {
        horizonY: Math.round(finiteNumber(visualInput.horizonY, 48, 1, 159)),
        panoramaBackgroundId: typeof visualInput.panoramaBackgroundId === "string" ? visualInput.panoramaBackgroundId : "",
        floorTilemapId: typeof visualInput.floorTilemapId === "string" ? visualInput.floorTilemapId : "",
        minimapAssetId: typeof visualInput.minimapAssetId === "string" ? visualInput.minimapAssetId : ""
      }
    : undefined;
  const segmentInput = Array.isArray(config.trackSegments) ? config.trackSegments : null;
  const trackSegments = segmentInput
    ? segmentInput.slice(0, 32).flatMap((segment) => {
        if (!isRecord(segment)) return [];
        return [{
          lengthPixels: Math.round(finiteNumber(segment.lengthPixels, 1, 1, 4096)),
          curve: Math.round(finiteNumber(segment.curve, 0, -64, 64)),
          halfWidth: Math.round(finiteNumber(segment.halfWidth, 32, 1, 128))
        }];
      })
    : undefined;
  const topdownInput = isRecord(config.topdownTrack) ? config.topdownTrack : null;
  const checkpointInput = topdownInput && Array.isArray(topdownInput.checkpoints)
    ? topdownInput.checkpoints
    : [];
  const checkpointIDs = new Set<string>();
  const checkpoints = checkpointInput.slice(0, 16).flatMap((checkpoint) => {
    if (!isRecord(checkpoint)) return [];
    const id = typeof checkpoint.id === "string" ? checkpoint.id.trim() : "";
    if (!id || checkpointIDs.has(id)) return [];
    checkpointIDs.add(id);
    return [{
      id,
      x: Math.round(finiteNumber(checkpoint.x, 0, 0, 4095)),
      y: Math.round(finiteNumber(checkpoint.y, 0, 0, 4095)),
      width: Math.round(finiteNumber(checkpoint.width, 1, 1, 256)),
      height: Math.round(finiteNumber(checkpoint.height, 1, 1, 256))
    }];
  });
  const pathPoints = Array.isArray(topdownInput?.pathPoints)
    ? topdownInput.pathPoints.slice(0, 32).flatMap((point) => isRecord(point)
      ? [{ x: Math.round(finiteNumber(point.x, 0, 0, 4095)),
          y: Math.round(finiteNumber(point.y, 0, 0, 4095)) }]
      : [])
    : [];
  const topdownTrack = topdownInput && checkpoints.length > 0
    ? {
        cameraDeadZoneX: Math.round(finiteNumber(topdownInput.cameraDeadZoneX, 0, 0, 120)),
        cameraDeadZoneY: Math.round(finiteNumber(topdownInput.cameraDeadZoneY, 0, 0, 80)),
        startHeading: Math.round(finiteNumber(topdownInput.startHeading, 0, 0, 15)),
        ...(topdownInput.finishAtZero === true ? {finishAtZero:true} : {}),
        ...(pathPoints.length >= 2 ? { pathPoints } : {}),
        checkpoints
      }
    : undefined;
  return {
    ...normalizeSceneFeatureConfig("racing", config),
    maxSpeed: finiteNumber(config.maxSpeed, DEFAULT_RACING_SCENE_CONFIG.maxSpeed, 0, 16),
    acceleration: finiteNumber(config.acceleration, DEFAULT_RACING_SCENE_CONFIG.acceleration, 0, 32),
    brakePower: finiteNumber(config.brakePower, DEFAULT_RACING_SCENE_CONFIG.brakePower, 0, 32),
    steeringSpeed: finiteNumber(config.steeringSpeed, DEFAULT_RACING_SCENE_CONFIG.steeringSpeed, 0.125, 16),
    presentation: config.presentation === "pseudo3d" ? "pseudo3d" : "topdown",
    lapsToWin: Math.round(finiteNumber(config.lapsToWin, DEFAULT_RACING_SCENE_CONFIG.lapsToWin, 1, 9)),
    checkpointsPerLap: Math.round(finiteNumber(config.checkpointsPerLap, DEFAULT_RACING_SCENE_CONFIG.checkpointsPerLap, 1, 16)),
    pickupsPerLap: Math.round(finiteNumber(config.pickupsPerLap, DEFAULT_RACING_SCENE_CONFIG.pickupsPerLap, 0, 16)),
    rivalSpeed: finiteNumber(config.rivalSpeed, DEFAULT_RACING_SCENE_CONFIG.rivalSpeed, 0.125,
      config.presentation === "pseudo3d" ? 16 : 127),
    roadCurve: Math.round(finiteNumber(config.roadCurve, DEFAULT_RACING_SCENE_CONFIG.roadCurve, 0, 64)),
    showMinimap: typeof config.showMinimap === "boolean"
      ? config.showMinimap
      : DEFAULT_RACING_SCENE_CONFIG.showMinimap,
    ...(trackSegments && trackSegments.length > 0 ? { trackSegments } : {}),
    ...(topdownTrack ? { topdownTrack } : {}),
    ...(pseudo3dVisuals ? { pseudo3dVisuals } : {}),
    ...(perspectiveCamera ? { perspectiveCamera } : {})
  };
}

export function normalizeBattleRpgSceneConfig(value: unknown): BattleRpgSceneConfig {
  const config = isRecord(value) ? value : {};
  return {
    ...normalizeSceneFeatureConfig("battleRpg", config),
    maxPartySize: Math.round(finiteNumber(config.maxPartySize, DEFAULT_BATTLE_RPG_SCENE_CONFIG.maxPartySize, 1, 6)),
    maxEnemies: Math.round(finiteNumber(config.maxEnemies, DEFAULT_BATTLE_RPG_SCENE_CONFIG.maxEnemies, 1, 6)),
    turnDelayFrames: frameCount(config.turnDelayFrames, DEFAULT_BATTLE_RPG_SCENE_CONFIG.turnDelayFrames),
    escapeEnabled: typeof config.escapeEnabled === "boolean" ? config.escapeEnabled : DEFAULT_BATTLE_RPG_SCENE_CONFIG.escapeEnabled,
    experienceMultiplier: finiteNumber(config.experienceMultiplier, DEFAULT_BATTLE_RPG_SCENE_CONFIG.experienceMultiplier, 0.1, 10),
    typeEffectivenessEnabled: typeof config.typeEffectivenessEnabled === "boolean" ? config.typeEffectivenessEnabled : DEFAULT_BATTLE_RPG_SCENE_CONFIG.typeEffectivenessEnabled,
    criticalHitEnabled: typeof config.criticalHitEnabled === "boolean" ? config.criticalHitEnabled : DEFAULT_BATTLE_RPG_SCENE_CONFIG.criticalHitEnabled,
    statusConditionsEnabled: typeof config.statusConditionsEnabled === "boolean" ? config.statusConditionsEnabled : DEFAULT_BATTLE_RPG_SCENE_CONFIG.statusConditionsEnabled,
    abilitiesEnabled: typeof config.abilitiesEnabled === "boolean" ? config.abilitiesEnabled : DEFAULT_BATTLE_RPG_SCENE_CONFIG.abilitiesEnabled,
    showExperienceBar: typeof config.showExperienceBar === "boolean" ? config.showExperienceBar : DEFAULT_BATTLE_RPG_SCENE_CONFIG.showExperienceBar,
    showHealthBars: typeof config.showHealthBars === "boolean" ? config.showHealthBars : DEFAULT_BATTLE_RPG_SCENE_CONFIG.showHealthBars,
    battleStyle: config.battleStyle === "double" ? "double" : "single",
    weatherEffect: ["rain", "sun", "sandstorm", "hail"].includes(config.weatherEffect as string) ? config.weatherEffect as BattleRpgSceneConfig["weatherEffect"] : "none",
    rewardGold: Math.round(finiteNumber(config.rewardGold, DEFAULT_BATTLE_RPG_SCENE_CONFIG.rewardGold, 0, 65535)),
    rewardExperience: Math.round(finiteNumber(config.rewardExperience, DEFAULT_BATTLE_RPG_SCENE_CONFIG.rewardExperience, 0, 65535))
  };
}

export function normalizeLutaSceneConfig(value: unknown): LutaSceneConfig {
  const config = isRecord(value) ? value : {};
  return {
    ...normalizeSceneFeatureConfig("luta", config),
    roundTime: Math.round(finiteNumber(config.roundTime, DEFAULT_LUTA_SCENE_CONFIG.roundTime, 30, 300)),
    roundsToWin: Math.round(finiteNumber(config.roundsToWin, DEFAULT_LUTA_SCENE_CONFIG.roundsToWin, 1, 5)),
    maxSuperGauge: Math.round(finiteNumber(config.maxSuperGauge, DEFAULT_LUTA_SCENE_CONFIG.maxSuperGauge, 50, 300)),
    superGaugeGainOnHit: Math.round(finiteNumber(config.superGaugeGainOnHit, DEFAULT_LUTA_SCENE_CONFIG.superGaugeGainOnHit, 0, 50)),
    superGaugeGainOnReceive: Math.round(finiteNumber(config.superGaugeGainOnReceive, DEFAULT_LUTA_SCENE_CONFIG.superGaugeGainOnReceive, 0, 50)),
    guardPowerRecovery: Math.round(finiteNumber(config.guardPowerRecovery, DEFAULT_LUTA_SCENE_CONFIG.guardPowerRecovery, 0, 10)),
    chipDamageEnabled: typeof config.chipDamageEnabled === "boolean" ? config.chipDamageEnabled : DEFAULT_LUTA_SCENE_CONFIG.chipDamageEnabled,
    airBlockingEnabled: typeof config.airBlockingEnabled === "boolean" ? config.airBlockingEnabled : DEFAULT_LUTA_SCENE_CONFIG.airBlockingEnabled,
    alphaCounterEnabled: typeof config.alphaCounterEnabled === "boolean" ? config.alphaCounterEnabled : DEFAULT_LUTA_SCENE_CONFIG.alphaCounterEnabled,
    throwEscapeWindow: Math.round(finiteNumber(config.throwEscapeWindow, DEFAULT_LUTA_SCENE_CONFIG.throwEscapeWindow, 0, 20)),
    parryWindow: Math.round(finiteNumber(config.parryWindow, DEFAULT_LUTA_SCENE_CONFIG.parryWindow, 0, 20)),
    hitstunDecay: finiteNumber(config.hitstunDecay, DEFAULT_LUTA_SCENE_CONFIG.hitstunDecay, 0.5, 1),
    comboLimit: Math.round(finiteNumber(config.comboLimit, DEFAULT_LUTA_SCENE_CONFIG.comboLimit, 10, 120)),
    vismCustomComboGauge: Math.round(finiteNumber(config.vismCustomComboGauge, DEFAULT_LUTA_SCENE_CONFIG.vismCustomComboGauge, 50, 300)),
    defaultStyle: ["a-ism", "x-ism", "v-ism"].includes(config.defaultStyle as string) ? config.defaultStyle as LutaFightingStyle : DEFAULT_LUTA_SCENE_CONFIG.defaultStyle,
    stageId: typeof config.stageId === "string" ? config.stageId : DEFAULT_LUTA_SCENE_CONFIG.stageId,
    player1StartX: Math.round(finiteNumber(config.player1StartX, DEFAULT_LUTA_SCENE_CONFIG.player1StartX, 0, 300)),
    player2StartX: Math.round(finiteNumber(config.player2StartX, DEFAULT_LUTA_SCENE_CONFIG.player2StartX, 0, 300)),
    ...(typeof config.hudAssetName === "string" && config.hudAssetName.trim().length > 0
      ? { hudAssetName: config.hudAssetName.trim() }
      : {})
  };
}

export function normalizeWorldMapSceneConfig(value: unknown): WorldMapSceneConfig {
  const config = isRecord(value) ? value : {};
  const normalized: WorldMapSceneConfig = {
    ...normalizeSceneFeatureConfig("worldMap", config),
    ...(typeof config.cursorAffine === "boolean" ? {cursorAffine:config.cursorAffine} : {}),
    navigable: typeof config.navigable === "boolean" ? config.navigable : DEFAULT_WORLD_MAP_SCENE_CONFIG.navigable,
    unlocked: typeof config.unlocked === "boolean" ? config.unlocked : DEFAULT_WORLD_MAP_SCENE_CONFIG.unlocked,
    hideWhenLocked: typeof config.hideWhenLocked === "boolean" ? config.hideWhenLocked : DEFAULT_WORLD_MAP_SCENE_CONFIG.hideWhenLocked,
    requiredVariable: Math.round(finiteNumber(config.requiredVariable, DEFAULT_WORLD_MAP_SCENE_CONFIG.requiredVariable, -1, 15)),
    requiredValue: Math.round(finiteNumber(config.requiredValue, DEFAULT_WORLD_MAP_SCENE_CONFIG.requiredValue, -32768, 32767)),
    targetLevel: Math.round(finiteNumber(config.targetLevel, DEFAULT_WORLD_MAP_SCENE_CONFIG.targetLevel, -1, 32767))
  };
  if (Array.isArray(config.nodes)) {
    const seenIDs = new Set<string>();
    const nodes: WorldMapNodeConfig[] = [];
    for (const entry of config.nodes.slice(0, 32)) {
      if (!isRecord(entry)) continue;
      const id = typeof entry.id === "string" ? entry.id.trim() : "";
      if (!id || seenIDs.has(id)) continue;
      seenIDs.add(id);
      const connections = Array.isArray(entry.connections)
        ? Array.from(new Set(entry.connections
            .filter((connection): connection is string => typeof connection === "string")
            .map((connection) => connection.trim())
            .filter((connection) => Boolean(connection) && connection !== id)))
            .slice(0, 8)
        : [];
      nodes.push({
        id,
        name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : id,
        x: Math.round(finiteNumber(entry.x, 32 + (nodes.length % 3) * 64, 0, 32767)),
        y: Math.round(finiteNumber(entry.y, 48 + Math.floor(nodes.length / 3) * 48, 0, 32767)),
        connections,
        dialogueKey: typeof entry.dialogueKey === "string" ? entry.dialogueKey.trim() : "",
        eventName: typeof entry.eventName === "string" ? entry.eventName.trim() : "",
        unlocked: typeof entry.unlocked === "boolean" ? entry.unlocked : normalized.unlocked,
        hideWhenLocked: typeof entry.hideWhenLocked === "boolean" ? entry.hideWhenLocked : normalized.hideWhenLocked,
        requiredVariable: Math.round(finiteNumber(entry.requiredVariable, normalized.requiredVariable, -1, 15)),
        requiredValue: Math.round(finiteNumber(entry.requiredValue, normalized.requiredValue, -32768, 32767)),
        targetLevel: Math.round(finiteNumber(entry.targetLevel, nodes.length, -1, 32767))
      });
    }
    if (nodes.length > 0) normalized.nodes = nodes;
  }
  return normalized;
}
export function normalizeVisualNovelSceneConfig(value: unknown): VisualNovelSceneConfig {
  const config = isRecord(value) ? value : {};
  return {
    ...normalizeSceneFeatureConfig("visualNovel", config),
    autoAdvance: typeof config.autoAdvance === "boolean" ? config.autoAdvance : false,
    nextSceneIndex: Math.round(finiteNumber(config.nextSceneIndex, -1, -1, 255)),
    backgroundIndex: Math.round(finiteNumber(config.backgroundIndex, -1, -1, 255)),
    ...(Object.hasOwn(config, "dialogueKey") ? {
      dialogueKey: typeof config.dialogueKey === "string" ? config.dialogueKey.trim() : ""
    } : {})
  };
}

export function normalizeCutsceneSceneConfig(value: unknown): CutsceneSceneConfig {
  const config = isRecord(value) ? value : {};
  const stepDurationFrames = frameCount(config.stepDurationFrames, DEFAULT_CUTSCENE_SCENE_CONFIG.stepDurationFrames);
  const autoAdvance = typeof config.autoAdvance === "boolean" ? config.autoAdvance : DEFAULT_CUTSCENE_SCENE_CONFIG.autoAdvance;
  const steps = Array.isArray(config.steps)
      ? config.steps.map((step, index): CutsceneStepConfig => {
        const source = isRecord(step) ? step : {};
        const text = (field: string, fallback = ""): string => typeof source[field] === "string"
          ? source[field].trim()
          : fallback;
        const actorMotions = Array.isArray(source.actorMotions)
          ? source.actorMotions.slice(0, 16).flatMap((motion): CutsceneActorMotionConfig[] => {
              const motionSource = isRecord(motion) ? motion : {};
              const fromSource = isRecord(motionSource.fromPosition) ? motionSource.fromPosition : {};
              const toSource = isRecord(motionSource.toPosition) ? motionSource.toPosition : {};
              const actorIndex = Math.round(finiteNumber(motionSource.actorIndex, -1, -1, 255));
              const durationFrames = Math.round(finiteNumber(motionSource.durationFrames, 0, 1, 65535));
              if (actorIndex < 0 || durationFrames <= 0) return [];
              return [{
                actorIndex,
                fromPosition: {
                  x: Math.round(finiteNumber(fromSource.x, 0, -32768, 32767)),
                  y: Math.round(finiteNumber(fromSource.y, 0, -32768, 32767))
                },
                toPosition: {
                  x: Math.round(finiteNumber(toSource.x, 0, -32768, 32767)),
                  y: Math.round(finiteNumber(toSource.y, 0, -32768, 32767))
                },
                durationFrames
              }];
            })
          : undefined;
        return {
          id: text("id", `step-${index + 1}`) || `step-${index + 1}`,
          dialogueKey: text("dialogueKey"),
          ...(Object.hasOwn(source, "backgroundAssetName") ? { backgroundAssetName: text("backgroundAssetName") } : {}),
          eventName: text("eventName"),
          durationFrames: Math.round(finiteNumber(source.durationFrames, stepDurationFrames, 0, 65535)),
          autoAdvance: typeof source.autoAdvance === "boolean" ? source.autoAdvance : autoAdvance,
          skippable: typeof source.skippable === "boolean" ? source.skippable : true,
          waitForDialogue: typeof source.waitForDialogue === "boolean" ? source.waitForDialogue : false,
          onSkipEventName: text("onSkipEventName"),
          targetSceneIndex: Math.round(finiteNumber(source.targetSceneIndex, -1, -1, 255)),
          branchVariable: Math.round(finiteNumber(source.branchVariable, -1, -1, 15)),
          branchValue: Math.round(finiteNumber(source.branchValue, 0, -32768, 32767)),
          branchTargetSceneIndex: Math.round(finiteNumber(source.branchTargetSceneIndex, -1, -1, 255)),
          branchTargetStepIndex: Math.round(finiteNumber(source.branchTargetStepIndex, -1, -1, 255)),
          ...(actorMotions && actorMotions.length > 0 ? { actorMotions } : {})
        };
      })
    : undefined;
  return {
    ...normalizeSceneFeatureConfig("cutscene", config),
    stepDurationFrames,
    autoAdvance,
    nextSceneIndex: Math.round(finiteNumber(config.nextSceneIndex, DEFAULT_CUTSCENE_SCENE_CONFIG.nextSceneIndex, -1, 255)),
    backgroundIndex: Math.round(finiteNumber(config.backgroundIndex, DEFAULT_CUTSCENE_SCENE_CONFIG.backgroundIndex, -1, 255)),
    ...(steps ? { steps } : {})
  };
}

function normalizePlatformerSceneOverrides(value: unknown): Partial<PlatformerSceneConfig> {
  if (!isRecord(value)) return {};
  const normalized = normalizePlatformerSceneConfig(value);
  const overrides: Partial<PlatformerSceneConfig> = normalizeSceneFeatureConfig("platformer", value);
  for (const key of Object.keys(DEFAULT_PLATFORMER_SCENE_CONFIG) as Array<keyof PlatformerSceneConfig>) {
    if (Object.hasOwn(value, key)) Object.assign(overrides, { [key]: normalized[key] });
  }
  return overrides;
}

function normalizePointClickSceneOverrides(value: unknown): Partial<PointClickSceneConfig> {
  if (!isRecord(value)) return {};
  const normalized = normalizePointClickSceneConfig(value);
  return {
    ...normalizeSceneFeatureConfig("pointAndClick", value),
    ...(Object.hasOwn(value, "cursorSpeed") ? { cursorSpeed: normalized.cursorSpeed } : {}),
    ...(Object.hasOwn(value, "hotspotPadding") ? { hotspotPadding: normalized.hotspotPadding } : {})
  };
}

function normalizeShmupSceneOverrides(value: unknown): Partial<ShmupSceneConfig> {
  if (!isRecord(value)) return {};
  const normalized = normalizeShmupSceneConfig(value);
  return {
    ...normalizeSceneFeatureConfig("shmup", value),
    ...(Object.hasOwn(value, "playerSpeed") ? { playerSpeed: normalized.playerSpeed } : {}),
    ...(Object.hasOwn(value, "fireCooldown") ? { fireCooldown: normalized.fireCooldown } : {}),
    ...(Object.hasOwn(value, "scrollSpeed") ? { scrollSpeed: normalized.scrollSpeed } : {}),
    ...(Object.hasOwn(value, "wavePlan") ? { wavePlan: normalized.wavePlan ?? [] } : {})
  };
}

function normalizeIsometricSceneOverrides(value: unknown): Partial<IsometricSceneConfig> {
  if (!isRecord(value)) return {};
  const normalized = normalizeIsometricSceneConfig(value);
  const hasExplicitContract = ["profile", "projection", "movement", "heightMode"].some((field) => Object.hasOwn(value, field));
  return {
    ...normalizeSceneFeatureConfig("isometric", value),
    ...(Object.hasOwn(value, "pagedSurface") && normalized.pagedSurface ? { pagedSurface: normalized.pagedSurface } : {}),
    ...(Object.hasOwn(value, "worldMode") ? { worldMode: normalized.worldMode } : {}),
    ...(hasExplicitContract ? {
      profile: normalized.profile,
      projection: normalized.projection,
      movement: normalized.movement,
      heightMode: normalized.heightMode
    } : {}),
    ...(Object.hasOwn(value, "gameplayMode") ? { gameplayMode: normalized.gameplayMode } : {}),
    ...(Object.hasOwn(value, "tactical") && normalized.tactical ? { tactical: normalized.tactical } : {}),
    ...(Object.hasOwn(value, "tileWidth") ? { tileWidth: normalized.tileWidth } : {}),
    ...(Object.hasOwn(value, "tileHeight") ? { tileHeight: normalized.tileHeight } : {}),
    ...(Object.hasOwn(value, "heightStep") ? { heightStep: normalized.heightStep } : {}),
    ...(Object.hasOwn(value, "originX") ? { originX: normalized.originX } : {}),
    ...(Object.hasOwn(value, "originY") ? { originY: normalized.originY } : {}),
    ...(Object.hasOwn(value, "presentationZoom") ? { presentationZoom: normalized.presentationZoom } : {})
  };
}

function normalizeDungeonCrawlerSceneOverrides(value: unknown): Partial<DungeonCrawlerSceneConfig> {
  if (!isRecord(value)) return {};
  const normalized = normalizeDungeonCrawlerSceneConfig(value);
  return {
    ...normalizeSceneFeatureConfig("dungeonCrawler", value),
    ...(Object.hasOwn(value, "stepDurationMs") ? { stepDurationMs: normalized.stepDurationMs } : {}),
    ...(Object.hasOwn(value, "turnDurationMs") ? { turnDurationMs: normalized.turnDurationMs } : {}),
    ...(Object.hasOwn(value, "allowBackstep") ? { allowBackstep: normalized.allowBackstep } : {}),
    ...(Object.hasOwn(value, "viewDistance") ? { viewDistance: normalized.viewDistance } : {}),
    ...(Object.hasOwn(value, "playerStart") && normalized.playerStart ? { playerStart: normalized.playerStart } : {})
  };
}

function normalizeRacingSceneOverrides(value: unknown): Partial<RacingSceneConfig> {
  if (!isRecord(value)) return {};
  const normalized = normalizeRacingSceneConfig(value);
  return {
    ...normalizeSceneFeatureConfig("racing", value),
    ...(Object.hasOwn(value, "maxSpeed") ? { maxSpeed: normalized.maxSpeed } : {}),
    ...(Object.hasOwn(value, "acceleration") ? { acceleration: normalized.acceleration } : {}),
    ...(Object.hasOwn(value, "brakePower") ? { brakePower: normalized.brakePower } : {}),
    ...(Object.hasOwn(value, "steeringSpeed") ? { steeringSpeed: normalized.steeringSpeed } : {}),
    ...(Object.hasOwn(value, "presentation") ? { presentation: normalized.presentation } : {}),
    ...(Object.hasOwn(value, "lapsToWin") ? { lapsToWin: normalized.lapsToWin } : {}),
    ...(Object.hasOwn(value, "checkpointsPerLap") ? { checkpointsPerLap: normalized.checkpointsPerLap } : {}),
    ...(Object.hasOwn(value, "pickupsPerLap") ? { pickupsPerLap: normalized.pickupsPerLap } : {}),
    ...(Object.hasOwn(value, "rivalSpeed") ? { rivalSpeed: normalized.rivalSpeed } : {}),
    ...(Object.hasOwn(value, "roadCurve") ? { roadCurve: normalized.roadCurve } : {}),
    ...(Object.hasOwn(value, "showMinimap") ? { showMinimap: normalized.showMinimap } : {}),
    ...(Object.hasOwn(value, "perspectiveCamera") && normalized.perspectiveCamera
      ? { perspectiveCamera: normalized.perspectiveCamera } : {}),
    ...(Object.hasOwn(value, "trackSegments") && normalized.trackSegments
      ? { trackSegments: normalized.trackSegments }
      : {}),
    ...(Object.hasOwn(value, "topdownTrack") && normalized.topdownTrack
      ? { topdownTrack: normalized.topdownTrack }
      : {}),
    ...(Object.hasOwn(value, "pseudo3dVisuals") && normalized.pseudo3dVisuals
      ? { pseudo3dVisuals: normalized.pseudo3dVisuals }
      : {})
  };
}

function normalizeBattleRpgSceneOverrides(value: unknown): Partial<BattleRpgSceneConfig> {
  if (!isRecord(value)) return {};
  const normalized = normalizeBattleRpgSceneConfig(value);
  return {
    ...normalizeSceneFeatureConfig("battleRpg", value),
    ...(Object.hasOwn(value, "maxPartySize") ? { maxPartySize: normalized.maxPartySize } : {}),
    ...(Object.hasOwn(value, "maxEnemies") ? { maxEnemies: normalized.maxEnemies } : {}),
    ...(Object.hasOwn(value, "turnDelayFrames") ? { turnDelayFrames: normalized.turnDelayFrames } : {}),
    ...(Object.hasOwn(value, "escapeEnabled") ? { escapeEnabled: normalized.escapeEnabled } : {}),
    ...(Object.hasOwn(value, "experienceMultiplier") ? { experienceMultiplier: normalized.experienceMultiplier } : {}),
    ...(Object.hasOwn(value, "typeEffectivenessEnabled") ? { typeEffectivenessEnabled: normalized.typeEffectivenessEnabled } : {}),
    ...(Object.hasOwn(value, "criticalHitEnabled") ? { criticalHitEnabled: normalized.criticalHitEnabled } : {}),
    ...(Object.hasOwn(value, "statusConditionsEnabled") ? { statusConditionsEnabled: normalized.statusConditionsEnabled } : {}),
    ...(Object.hasOwn(value, "abilitiesEnabled") ? { abilitiesEnabled: normalized.abilitiesEnabled } : {}),
    ...(Object.hasOwn(value, "showExperienceBar") ? { showExperienceBar: normalized.showExperienceBar } : {}),
    ...(Object.hasOwn(value, "showHealthBars") ? { showHealthBars: normalized.showHealthBars } : {}),
    ...(Object.hasOwn(value, "battleStyle") ? { battleStyle: normalized.battleStyle } : {}),
    ...(Object.hasOwn(value, "weatherEffect") ? { weatherEffect: normalized.weatherEffect } : {}),
    ...(Object.hasOwn(value, "rewardGold") ? { rewardGold: normalized.rewardGold } : {}),
    ...(Object.hasOwn(value, "rewardExperience") ? { rewardExperience: normalized.rewardExperience } : {})
  };
}

function normalizeLutaSceneOverrides(value: unknown): Partial<LutaSceneConfig> {
  if (!isRecord(value)) return {};
  const normalized = normalizeLutaSceneConfig(value);
  return {
    ...normalizeSceneFeatureConfig("luta", value),
    ...(Object.hasOwn(value, "roundTime") ? { roundTime: normalized.roundTime } : {}),
    ...(Object.hasOwn(value, "roundsToWin") ? { roundsToWin: normalized.roundsToWin } : {}),
    ...(Object.hasOwn(value, "maxSuperGauge") ? { maxSuperGauge: normalized.maxSuperGauge } : {}),
    ...(Object.hasOwn(value, "superGaugeGainOnHit") ? { superGaugeGainOnHit: normalized.superGaugeGainOnHit } : {}),
    ...(Object.hasOwn(value, "superGaugeGainOnReceive") ? { superGaugeGainOnReceive: normalized.superGaugeGainOnReceive } : {}),
    ...(Object.hasOwn(value, "guardPowerRecovery") ? { guardPowerRecovery: normalized.guardPowerRecovery } : {}),
    ...(Object.hasOwn(value, "chipDamageEnabled") ? { chipDamageEnabled: normalized.chipDamageEnabled } : {}),
    ...(Object.hasOwn(value, "airBlockingEnabled") ? { airBlockingEnabled: normalized.airBlockingEnabled } : {}),
    ...(Object.hasOwn(value, "alphaCounterEnabled") ? { alphaCounterEnabled: normalized.alphaCounterEnabled } : {}),
    ...(Object.hasOwn(value, "throwEscapeWindow") ? { throwEscapeWindow: normalized.throwEscapeWindow } : {}),
    ...(Object.hasOwn(value, "parryWindow") ? { parryWindow: normalized.parryWindow } : {}),
    ...(Object.hasOwn(value, "hitstunDecay") ? { hitstunDecay: normalized.hitstunDecay } : {}),
    ...(Object.hasOwn(value, "comboLimit") ? { comboLimit: normalized.comboLimit } : {}),
    ...(Object.hasOwn(value, "vismCustomComboGauge") ? { vismCustomComboGauge: normalized.vismCustomComboGauge } : {}),
    ...(Object.hasOwn(value, "defaultStyle") ? { defaultStyle: normalized.defaultStyle } : {}),
    ...(Object.hasOwn(value, "stageId") ? { stageId: normalized.stageId } : {}),
    ...(Object.hasOwn(value, "player1StartX") ? { player1StartX: normalized.player1StartX } : {}),
    ...(Object.hasOwn(value, "player2StartX") ? { player2StartX: normalized.player2StartX } : {}),
    ...(Object.hasOwn(value, "hudAssetName") && normalized.hudAssetName ? { hudAssetName: normalized.hudAssetName } : {})
  };
}

function normalizeWorldMapSceneOverrides(value: unknown): Partial<WorldMapSceneConfig> {
  if (!isRecord(value)) return {};
  const normalized = normalizeWorldMapSceneConfig(value);
  return {
    ...normalizeSceneFeatureConfig("worldMap", value),
    ...(Object.hasOwn(value, "cursorAffine") ? {cursorAffine:normalized.cursorAffine} : {}),
    ...(Object.hasOwn(value, "navigable") ? { navigable: normalized.navigable } : {}),
    ...(Object.hasOwn(value, "unlocked") ? { unlocked: normalized.unlocked } : {}),
    ...(Object.hasOwn(value, "hideWhenLocked") ? { hideWhenLocked: normalized.hideWhenLocked } : {}),
    ...(Object.hasOwn(value, "requiredVariable") ? { requiredVariable: normalized.requiredVariable } : {}),
    ...(Object.hasOwn(value, "requiredValue") ? { requiredValue: normalized.requiredValue } : {}),
    ...(Object.hasOwn(value, "targetLevel") ? { targetLevel: normalized.targetLevel } : {}),
    ...(Object.hasOwn(value, "nodes") ? { nodes: normalized.nodes ?? [] } : {})
  };
}
function normalizeVisualNovelSceneOverrides(value: unknown): Partial<VisualNovelSceneConfig> {
  if (!isRecord(value)) return {};
  const normalized = normalizeVisualNovelSceneConfig(value);
  return {
    ...normalizeSceneFeatureConfig("visualNovel", value),
    ...(Object.hasOwn(value, "autoAdvance") ? { autoAdvance: normalized.autoAdvance } : {}),
    ...(Object.hasOwn(value, "nextSceneIndex") ? { nextSceneIndex: normalized.nextSceneIndex } : {}),
    ...(Object.hasOwn(value, "backgroundIndex") ? { backgroundIndex: normalized.backgroundIndex } : {}),
    ...(Object.hasOwn(value, "dialogueKey") ? { dialogueKey: normalized.dialogueKey ?? "" } : {})
  };
}

function normalizeCutsceneSceneOverrides(value: unknown): Partial<CutsceneSceneConfig> {
  if (!isRecord(value)) return {};
  const normalized = normalizeCutsceneSceneConfig(value);
  return {
    ...normalizeSceneFeatureConfig("cutscene", value),
    ...(Object.hasOwn(value, "stepDurationFrames") ? { stepDurationFrames: normalized.stepDurationFrames } : {}),
    ...(Object.hasOwn(value, "autoAdvance") ? { autoAdvance: normalized.autoAdvance } : {}),
    ...(Object.hasOwn(value, "nextSceneIndex") ? { nextSceneIndex: normalized.nextSceneIndex } : {}),
    ...(Object.hasOwn(value, "backgroundIndex") ? { backgroundIndex: normalized.backgroundIndex } : {}),
    ...(Object.hasOwn(value, "steps") ? { steps: normalized.steps ?? [] } : {})
  };
}

export function sceneTypeProfile(sceneType: string | null | undefined): SceneTypeProfile {
  const id = normalizeSceneTypeId(sceneType, "topdown");
  return {
    id,
    label: sceneTypeLabel(id),
    exportKind: resolveSceneRuntimeExport(id).kind,
    editorTools: [...(SCENE_EDITOR_TOOLS[id] ?? GAMEPLAY_EDITOR_TOOLS)],
    collisionTypes: id === "platformer"
      ? [...PLATFORMER_COLLISIONS]
      : id === "racing"
        ? [...RACING_COLLISIONS]
        : [...COMMON_COLLISIONS],
    controlledEntityContract: resolveControlledEntityContract(id as ControlledEntitySceneType),
    capabilities: sceneTypeCapabilities(id)
  };
}

export function resolveSceneControlledEntityContract(
  sceneType: string | null | undefined,
  runtime: unknown,
  projectSettings: unknown = null
): ControlledEntityContract {
  const id = normalizeSceneTypeId(sceneType, "topdown");
  const resolvedRuntime = resolveSceneRuntime(id, runtime, projectSettings);
  return resolveControlledEntityContract(id as ControlledEntitySceneType, {
    worldMapNavigable: resolvedRuntime.type === "worldMap" && resolvedRuntime.config.navigable === true
  });
}

export function defaultSceneRuntime(sceneType: string | null | undefined): SceneRuntimeConfig {
  const id = normalizeSceneTypeId(sceneType, "topdown");
  return { type: id, config: {} };
}

export function normalizeSceneRuntime(
  sceneType: string | null | undefined,
  value: unknown
): SceneRuntimeConfig {
  const id = normalizeSceneTypeId(sceneType, "topdown");
  if (!isRecord(value) || value.type !== id || !isRecord(value.config)) {
    return defaultSceneRuntime(id);
  }
  if (id === "platformer") {
    return { type: "platformer", config: normalizePlatformerSceneOverrides(value.config) };
  }
  if (id === "pointAndClick") {
    return { type: "pointAndClick", config: normalizePointClickSceneOverrides(value.config) };
  }
  if (id === "shmup") {
    return { type: "shmup", config: normalizeShmupSceneOverrides(value.config) };
  }
  if (id === "isometric") {
    return { type: "isometric", config: normalizeIsometricSceneOverrides(value.config) };
  }
  if (id === "dungeonCrawler") {
    return { type: "dungeonCrawler", config: normalizeDungeonCrawlerSceneOverrides(value.config) };
  }
  if (id === "racing") {
    return { type: "racing", config: normalizeRacingSceneOverrides(value.config) };
  }
  if (id === "battleRpg") {
    return { type: "battleRpg", config: normalizeBattleRpgSceneOverrides(value.config) };
  }
  if (id === "luta") {
    return { type: "luta", config: normalizeLutaSceneOverrides(value.config) };
  }
  if (id === "worldMap") {
    return { type: "worldMap", config: normalizeWorldMapSceneOverrides(value.config) };
  }
  if (id === "menu") {
    return {
      type: "menu",
      config: {
        ...normalizeMenuSceneConfig(value.config),
        ...normalizeSceneFeatureConfig("menu", value.config)
      }
    };
  }
  if (id === "visualNovel") return { type: "visualNovel", config: normalizeVisualNovelSceneOverrides(value.config) };
  if (id === "cutscene") return { type: "cutscene", config: normalizeCutsceneSceneOverrides(value.config) };
  return { type: id, config: { ...value.config, ...normalizeSceneFeatureConfig(id, value.config) } };
}

function settingsForScene(sceneType: string, projectSettings: unknown): Record<string, unknown> {
  if (!isRecord(projectSettings)) return {};
  const settings = projectSettings[sceneType];
  return isRecord(settings) ? settings : {};
}

export function resolveSceneRuntime(
  sceneType: string | null | undefined,
  value: unknown,
  projectSettings: unknown = null
): SceneRuntimeConfig {
  const id = normalizeSceneTypeId(sceneType, "topdown");
  const runtime = normalizeSceneRuntime(id, value);
  if (id === "platformer") {
    return {
      type: "platformer",
      config: normalizePlatformerSceneConfig({
        ...settingsForScene("platformer", projectSettings),
        ...runtime.config
      })
    };
  }
  if (id === "pointAndClick") {
    return {
      type: "pointAndClick",
      config: normalizePointClickSceneConfig({
        ...settingsForScene("pointAndClick", projectSettings),
        ...runtime.config
      })
    };
  }
  if (id === "shmup") {
    const settings = settingsForScene("shmup", projectSettings);
    return {
      type: "shmup",
      config: normalizeShmupSceneConfig({
        ...settings,
        ...(Object.hasOwn(settings, "fireRate") ? { fireCooldown: settings.fireRate } : {}),
        ...runtime.config
      })
    };
  }
  if (id === "isometric") {
    return {
      type: "isometric",
      config: normalizeIsometricSceneConfig({
        ...settingsForScene("isometric", projectSettings),
        ...runtime.config
      })
    };
  }
  if (id === "dungeonCrawler") {
    return {
      type: "dungeonCrawler",
      config: normalizeDungeonCrawlerSceneConfig({
        ...settingsForScene("dungeonCrawler", projectSettings),
        ...runtime.config
      })
    };
  }
  if (id === "racing") {
    return {
      type: "racing",
      config: normalizeRacingSceneConfig({ ...settingsForScene("racing", projectSettings), ...runtime.config })
    };
  }
  if (id === "battleRpg") {
    return {
      type: "battleRpg",
      config: normalizeBattleRpgSceneConfig({ ...settingsForScene("battleRpg", projectSettings), ...runtime.config })
    };
  }
  if (id === "luta") {
    return {
      type: "luta",
      config: normalizeLutaSceneConfig({ ...settingsForScene("luta", projectSettings), ...runtime.config })
    };
  }
  if (id === "worldMap") {
    return { type: "worldMap", config: normalizeWorldMapSceneConfig({ ...settingsForScene("worldMap", projectSettings), ...runtime.config }) };
  }
  if (id === "menu") {
    return {
      type: "menu",
      config: {
        ...normalizeMenuSceneConfig(runtime.config),
        ...normalizeSceneFeatureConfig("menu", runtime.config)
      } as MenuSceneRuntime["config"]
    };
  }
  if (id === "visualNovel") return { type: "visualNovel", config: normalizeVisualNovelSceneConfig({ ...settingsForScene("visualNovel", projectSettings), ...runtime.config }) };
  if (id === "cutscene") return { type: "cutscene", config: normalizeCutsceneSceneConfig({ ...settingsForScene("cutscene", projectSettings), ...runtime.config }) };
  return runtime;
}

export function platformerSceneConfigFromRuntime(value: unknown, projectSettings: unknown = null): PlatformerSceneConfig | null {
  if (!isRecord(value) || value.type !== "platformer") return null;
  return resolveSceneRuntime("platformer", value, projectSettings).config as PlatformerSceneConfig;
}

export function pointClickSceneConfigFromRuntime(value: unknown, projectSettings: unknown = null): PointClickSceneConfig | null {
  if (!isRecord(value) || value.type !== "pointAndClick") return null;
  return resolveSceneRuntime("pointAndClick", value, projectSettings).config as PointClickSceneConfig;
}

export function shmupSceneConfigFromRuntime(value: unknown, projectSettings: unknown = null): ShmupSceneConfig | null {
  if (!isRecord(value) || value.type !== "shmup") return null;
  return resolveSceneRuntime("shmup", value, projectSettings).config as ShmupSceneConfig;
}

export function isometricSceneConfigFromRuntime(value: unknown, projectSettings: unknown = null): IsometricSceneConfig | null {
  if (!isRecord(value) || value.type !== "isometric") return null;
  return resolveSceneRuntime("isometric", value, projectSettings).config as IsometricSceneConfig;
}

export function dungeonCrawlerSceneConfigFromRuntime(value: unknown, projectSettings: unknown = null): DungeonCrawlerSceneConfig | null {
  if (!isRecord(value) || value.type !== "dungeonCrawler") return null;
  return resolveSceneRuntime("dungeonCrawler", value, projectSettings).config as DungeonCrawlerSceneConfig;
}

export function racingSceneConfigFromRuntime(value: unknown, projectSettings: unknown = null): RacingSceneConfig | null {
  if (!isRecord(value) || value.type !== "racing") return null;
  return resolveSceneRuntime("racing", value, projectSettings).config as RacingSceneConfig;
}

export function battleRpgSceneConfigFromRuntime(value: unknown, projectSettings: unknown = null): BattleRpgSceneConfig | null {
  if (!isRecord(value) || value.type !== "battleRpg") return null;
  return resolveSceneRuntime("battleRpg", value, projectSettings).config as BattleRpgSceneConfig;
}

export function lutaSceneConfigFromRuntime(value: unknown, projectSettings: unknown = null): LutaSceneConfig | null {
  if (!isRecord(value) || value.type !== "luta") return null;
  return resolveSceneRuntime("luta", value, projectSettings).config as LutaSceneConfig;
}

export function worldMapSceneConfigFromRuntime(value: unknown, projectSettings: unknown = null): WorldMapSceneConfig | null {
  if (!isRecord(value) || value.type !== "worldMap") return null;
  return resolveSceneRuntime("worldMap", value, projectSettings).config as WorldMapSceneConfig;
}
export function visualNovelSceneConfigFromRuntime(value: unknown, projectSettings: unknown = null): VisualNovelSceneConfig | null {
  if (!isRecord(value) || value.type !== "visualNovel") return null;
  return resolveSceneRuntime("visualNovel", value, projectSettings).config as VisualNovelSceneConfig;
}

export function cutsceneSceneConfigFromRuntime(value: unknown, projectSettings: unknown = null): CutsceneSceneConfig | null {
  if (!isRecord(value) || value.type !== "cutscene") return null;
  return resolveSceneRuntime("cutscene", value, projectSettings).config as CutsceneSceneConfig;
}
