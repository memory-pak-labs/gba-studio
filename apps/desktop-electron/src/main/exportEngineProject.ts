import { audioContractIssues } from "../shared/audioContract.js";
import { isLutaEventVerb, parseLutaEventCommand } from "../shared/lutaEventCommands.js";
import { eventCommandIntegrationIssue, eventCommandSupport } from "../shared/eventCommandSupport.js";
import { nativeEventCommandReferencedEvents } from "../shared/eventCommandRegistry.js";
import { racingFloorSourceTileIndex } from "../shared/racingAuthoring.js";
import { resolveProjectConstantCommand } from "../shared/projectConstants.js";
import { interfaceSkinAssets, resolveInterfaceTheme, resolveSceneDialogueUiSettings } from "../shared/interfaceThemes.js";
import path from "node:path";
import {
  normalizeGBAAssetDocument,
  normalizeGBAEntityDocument,
  normalizeGBAEventDocument,
  normalizeGBASceneDocument,
  formatGBAEntityEventProjectionIssue,
  validateGBAEntityEventProjection,
  validateGBAProjectMigrationContract
} from "../../../../packages/project-contract/src/index.js";
import {
  buildActorEngineSpriteExport,
  buildLutaActorEngineSpriteExport,
  buildAssetcAudioPackGeneration,
  buildAssetcPaletteFamilyPackGeneration,
  buildAssetcSpritePackGeneration,
  engineUsedHudPresetIDs,
  buildAssetcTilesetPackGeneration,
  buildAssetcPortraitPackGeneration,
  buildAssetcEmotePackGeneration,
  applySceneResourceCompressionPolicies,
  engineSceneResourceBankGroupName,
  engineCutsceneStepResourceBankGroupName,
  buildDialoguePortraitAssetsExport,
  buildDialogueEmoteAssetsExport,
  uniqueDialogueEmoteNames,
  type AssetcAudioPackGeneration,
  type EngineExportAudioPhysicalBudgetPlan,
  type AssetcPaletteFamilyPackGeneration,
  type AssetcSpritePackGeneration,
  type AssetcTilesetPackGeneration,
  type AssetcPortraitPackGeneration,
  type AssetcEmotePackGeneration,
  type AssetcSpriteAnimationExportEntry,
  type AssetcActorSpriteExportFields,
  type AssetcLutaAnimationSetExport,
  type EngineExportPortraitAsset,
  type EngineExportEmoteAsset,
  type AssetcCompressionPolicy
} from "../shared/engineProjectExport.js";
import type { EngineProjectExportAsset } from "../shared/engineProjectExport.js";
import type { GBAProjectData } from "../shared/projectFile.js";
import { blockingGBStudioImportDiagnostics } from "./gbStudioProjectImport.js";
import { expandEventProcedures } from "../shared/eventProcedures.js";
import {
  deriveProjectLocalization,
  dialogueChoiceTranslations,
  dialogueTranslations
} from "../shared/projectLocalization.js";
import { expandProjectTilemaps } from "../shared/projectResourceFormat.js";
import {
  gbaTileSizePx,
  gbaTopdownAreaToPixels,
  gbaTopdownTilePointToPixels,
  gbaTopdownTileToPixels
} from "../shared/gbaRendering.js";
import {
  collisionFlagsFromTypes,
  collisionSlopesFromTypes,
  collisionTypeCellsFromRoom,
  normalizeRoomCollisionType,
  type RoomCollisionType
} from "../shared/roomCollisionTypes.js";
import {
  defaultRoomConnectionEntryArea,
  defaultRoomConnectionExitArea,
  roomConnectionArrival,
  roomConnectionAreaCenter,
  type RoomConnectionArea
} from "../shared/roomsWorkspace.js";
import { normalizeSceneTypeId } from "../shared/sceneTypes.js";
import {
  resolveDungeonCrawlerFeatureRuntime,
  resolveSceneCapabilityManifest,
  resolveSceneFeatureModules,
  resolveShmupFeatureRuntime,
  resolveTopdownFeatureRuntime,
  type SceneFeatureModuleConfig,
  type ScenePhysicalBudget,
  type ResolvedSceneCapability
} from "../shared/sceneFeatureModules.js";
import { compileIsometricRoomTiles, isometricSpriteFeetOffset } from "../shared/isometricProjection.js";
import {
  cameraModeFollowsPlayer,
  exportCameraModeId,
  normalizeRoomCameraBounds,
  normalizeRoomCameraZoom,
  normalizeRoomParallaxSettings
} from "../shared/roomCamera.js";
import {
  buildEngineDialogueCharacterSound,
  buildEngineDialogueFrameIndex,
  buildEngineDialogueTextSpeedFrames,
  buildEngineDialogueUiConfig,
  buildEngineInteractButton,
  buildEnginePlatformerPhysicsConfig,
  buildEngineProjectSaveConfig,
  buildEngineTopdownActorSizePx,
  buildEngineTopdownPlayerSpeed,
  resolveSceneRuntimeExport,
  roomMatchesExportKind,
  type EngineDialogueUiConfig,
  type EngineSaveUiProfileOverride,
  type EnginePlatformerPhysicsConfig,
  type EngineProjectSaveConfig,
  type SceneExportKind
} from "../shared/sceneRuntimeExport.js";
import {
  buildProjectRuntimeCapabilityManifest,
  type ProjectRuntimeCapabilityManifest
} from "../shared/runtimeCapabilities.js";
import { battleRpgSceneConfigFromRuntime, cutsceneSceneConfigFromRuntime, dungeonCrawlerSceneConfigFromRuntime, isometricSceneConfigFromRuntime, lutaSceneConfigFromRuntime, platformerSceneConfigFromRuntime, pointClickSceneConfigFromRuntime, racingSceneConfigFromRuntime, shmupSceneConfigFromRuntime, visualNovelSceneConfigFromRuntime, worldMapSceneConfigFromRuntime } from "../shared/sceneTypeProfiles.js";
import type { IsometricSceneConfig } from "../shared/sceneTypeProfiles.js";
import { buildScenePreflightReport, type ScenePreflightReport } from "../shared/scenePreflight.js";
import {
  auditGbaHardwareBlockingErrors,
  buildGbaHardwareContract,
  type GbaHardwareContract
} from "../shared/gbaHardwareContract.js";
import {
  ISO_TACTICAL_ANIMATION_BINDINGS,
  ISO_TACTICAL_AUDIO_CUES,
  normalizeIsometricTacticalPresentation,
  validateIsometricTacticalAudioCatalog,
  validateIsometricTacticalPresentation,
  type IsoTacticalAssetBinding,
  type IsoTacticalAssetConsumer,
  type IsoTacticalPresentationConfig,
  type IsoTacticalUnitPresentation,
  type SceneTacticalCapabilityID
} from "../shared/isometricTacticalPresentation.js";
import {
  auditProjectSpriteVramExportNotices,
  auditProjectSpriteVramWarnings,
  auditProjectSpriteVramBlockingErrors,
  spriteVramWarningLabels
} from "../shared/spriteVramAnalysis.js";
import { auditProjectTilemapBlockingErrors, auditProjectTilemapWarnings } from "../shared/tilemapAudit.js";
import { auditProjectEventReferenceWarnings, auditProjectDialogueAssetWarnings, auditProjectDialogueUiBoxImageWarnings, auditProjectDialogueUiFontWarnings } from "../shared/eventReferenceAudit.js";
import { compilePluginContractEventCommand } from "../shared/gbaStudioPluginExport.js";
import { lookupPluginDataTableRow, pluginDataTablesForExport } from "../shared/gbaStudioPluginDataTables.js";
import {
  emptyProjectPluginRegistry,
  GBA_STUDIO_PLUGIN_SDK_VERSION,
  satisfiesPluginSdkVersion,
  type ProjectPluginRegistry
} from "../shared/gbaStudioPlugins.js";
import { unsupportedNativeEventCommandVerbs } from "../shared/eventCommandRegistry.js";
import { parseLinkCableCommand, toEngineLinkCableCommand } from "../shared/linkCableRuntime.js";
import {
  exportSceneMetatileAuthoring,
  resolveSceneMetatileAuthoring,
  type ExportedSceneMetatileAuthoring
} from "../shared/sceneMetatileContract.js";
import {
  deriveAdvancedVideoComposition,
  exportAdvancedVideoComposition,
  exportAffineScenePresentation,
  type ExportedAdvancedVideoComposition
} from "../shared/advancedVideoComposition.js";
import {
  affineMatrixForScenePresentation,
  normalizeAffineScenePresentation,
  type AffineSceneSourceSize
} from "../shared/affineScene.js";
import {
  exportSceneComposition,
  normalizeSceneComposition,
  sceneCompositionFromAffinePresentation,
  sceneCompositionIssues,
  sceneCompositionVideoMode,
  type ExportedSceneComposition
} from "../shared/sceneComposition.js";
import {
  exportCompleteProjectFixtureManifest,
  type CompleteProjectFixtureManifest,
  type ExportedCompleteProjectFixtureManifest
} from "../shared/completeProjectFixture.js";
import {
  resolveShmupSceneComposition,
  type ShmupSceneCompositionResolution
} from "../shared/shmupSceneComposition.js";
import {
  exportSceneResourceManifest,
  normalizeSceneResourceManifest,
  sceneResourceManifestIssues,
  type ExportedSceneResourceManifest
} from "../shared/sceneResourceContract.js";
import {
  normalizeMenuSceneConfig,
  type MenuSceneConfig,
  type MenuSceneItemBinding,
  type MenuSceneRole,
  type MenuSceneProfile
} from "../shared/menuScene.js";
import { deriveHudPresetsWorkspacePresentation, resolveHudPresetBinding, resolveExplicitHudPresetBinding } from "../shared/hudPresets.js";
import { deriveColorsWorkspacePresentation } from "../shared/colorsWorkspace/core.js";
import { findSceneRouteTable, sceneRouteTablesFromProject, type SceneRouteDestination } from "../shared/sceneRouteTables.js";
import {
  normalizeSceneTransition,
  sceneTransitionFromProjectSettings,
  sceneTransitionVisualEffect,
  sceneTransitionUsesFade,
  sceneTransitionUsesVisualEffect,
  type SceneTransitionPhase
} from "../shared/sceneTransition.js";
import {
  exportSceneTilemapContract,
  resolveSceneTilemapContract,
  type EngineSceneTilemapContract
} from "../shared/sceneTilemapContract.js";
import type { DevelopmentSceneLaunch } from "../shared/ipc.js";
import {
  projectWithCompiledAdvancedTools,
  type AdvancedToolsExportContract
} from "../shared/advancedTools.js";

export interface EngineExportProjectEventCommand {
  op: string;
  minutes?: number;
  minutes_per_tick?: number;
  frames_per_tick?: number;
  hud?: boolean;
  runtime?: MixedRuntimeKind;
  scene_type?: string;
  dialogue?: number;
  room?: number;
  x?: number;
  y?: number;
  index?: number;
  key?: string;
  value?: string | number | boolean;
  amount?: number;
  max?: number;
  variable?: number;
  other_variable?: number;
  field?: string;
  item?: number;
  quantity?: number;
  min?: number;
  mask?: number;
  max_length?: number;
  charset?: string;
  override?: boolean;
  slot?: number;
  offset?: number;
  group?: number;
  frames?: number;
  channel?: "music" | "sfx" | "pcm_music" | "pcm_sfx" | "all" | string;
  muted?: boolean;
  volume?: number;
  priority?: number;
  actor?: number;
  other_actor?: number;
  distance?: number;
  relation?: string;
  animation?: string;
  direction?: string;
  magnitude?: number;
  intensity?: number;
  stat?: string;
  delta?: number;
  width?: number;
  units_per_heart?: number;
  hearts?: number;
  digits?: number;
  code?: number;
  slots?: number;
  pause?: boolean;
  speed?: number;
  damage?: number;
  percent?: number;
  height_tiles?: number;
  button?: string;
  offset_x?: number;
  offset_y?: number;
  height?: number;
  walk_speed?: number;
  run_speed?: number;
  stamina_cost?: number;
  state?: string;
  tile_tag?: string;
  variable_x?: number;
  variable_y?: number;
  current?: number;
  tile?: number;
  tile_asset?: number;
  layer?: string;
  count?: number;
  frame?: number;
  line?: number;
  sfx?: number;
  effect?: string;
  phase?: SceneTransitionPhase;
  script?: number;
  callback?: string;
  timeout_frames?: number;
  sprite?: number;
  locale?: number;
}

export interface EngineExportDialogueLine {
  text: string;
  speaker: string;
  portrait: string;
  portrait_slot?: "left" | "right";
  key: string;
  source_locale?: string;
  default_locale?: string;
  translations?: Array<{ locale: string; text: string }>;
  emote?: string;
  text_sound?: string;
  confirm_sound?: string;
  confirm_sfx?: number;
  confirm_pcm?: number;
}

export type { EngineExportPortraitAsset, EngineExportEmoteAsset } from "../shared/engineProjectExport.js";

export interface EngineExportProjectScript {
  name: string;
  script: EngineExportProjectEventCommand[];
}

export interface EngineExportTopdownChoiceGroup {
  line: number;
  choices: Array<{
    text: string;
    value: number;
    source_locale?: string;
    default_locale?: string;
    translations?: Array<{ locale: string; text: string }>;
    script?: EngineExportProjectEventCommand[];
  }>;
}

export interface EngineExportCameraZone {
  area: { x: number; y: number; width: number; height: number };
  bounds: { x: number; y: number; width: number; height: number };
  offset: { x: number; y: number };
  lock_x: boolean;
  lock_y: boolean;
}

export interface EngineExportTopdownRoom {
  name: string;
  scene_type: string;
  runtime_profile: string;
  width_tiles: number;
  height_tiles: number;
  visual_tiles: number[];
  foreground_tiles?: number[];
  visual_tilemap?: string;
  visual_tilemap_layout?: "source_asset";
  collision_flags: number[];
  collision_slopes: number[];
  collision_types: string[];
  background_bits_per_pixel: 4 | 8;
  affine_obj?: EngineExportAffineObj;
  tilemap_contract?: EngineSceneTilemapContract;
  metatile_authoring?: ExportedSceneMetatileAuthoring;
  metadata: {
    camera_mode: string;
    camera_position: { x: number; y: number };
    player_start: { x: number; y: number };
    camera_bounds?: { x: number; y: number; width: number; height: number };
  };
  on_enter?: EngineExportProjectEventCommand[];
  on_exit?: EngineExportProjectEventCommand[];
  on_interact?: EngineExportProjectEventCommand[];
  on_hit_group1?: EngineExportProjectEventCommand[];
  on_hit_group2?: EngineExportProjectEventCommand[];
  on_hit_group3?: EngineExportProjectEventCommand[];
  portals?: Array<{
    area: { x: number; y: number; width: number; height: number };
    target_room: number;
    target_position: { x: number; y: number };
    target_direction: "up" | "down" | "left" | "right";
    script?: EngineExportProjectEventCommand[];
  }>;
  triggers?: Array<{
    area: { x: number; y: number; width: number; height: number };
    on_enter?: EngineExportProjectEventCommand[];
    on_leave?: EngineExportProjectEventCommand[];
  }>;
  camera_zones?: EngineExportCameraZone[];
  npcs?: Array<{
    name: string;
    position: { x: number; y: number };
    size: { x: number; y: number };
    collision_offset?: { x: number; y: number };
    collision_group?: number;
    collision_mask?: number;
    push_priority?: number;
    pushable?: boolean;
    affine_obj?: EngineExportAffineObj;
    metasprite?: { asset: string; index: number };
    animation?: string | { asset: string };
    animations?: Array<{ name: string; asset: string; frame_indices: number[] }>;
    on_start?: EngineExportProjectEventCommand[];
    on_interact?: EngineExportProjectEventCommand[];
    on_update?: EngineExportProjectEventCommand[];
    on_hit_actor?: EngineExportProjectEventCommand[];
    on_hit_player?: EngineExportProjectEventCommand[];
    on_hit_group1?: EngineExportProjectEventCommand[];
    on_hit_group2?: EngineExportProjectEventCommand[];
    on_hit_group3?: EngineExportProjectEventCommand[];
    on_defeated?: EngineExportProjectEventCommand[];
  }>;
  resource_bank_group?: string;
  video?: ExportedAdvancedVideoComposition;
}

export interface EngineExportTopdownProject {
  initial_room: number;
  video?: ExportedAdvancedVideoComposition;
  assets?: {
    bg_palettes: string[];
    obj_palettes?: string[];
    tile_assets: string[];
    sfx_assets?: Array<string | { asset: string; index?: number }>;
    music_assets?: Array<string | { asset: string; index?: number }>;
    pcm_assets?: Array<string | { asset: string; index?: number }>;
    tracker_assets?: Array<string | { asset: string; index?: number }>;
  };
  backgrounds?: Array<{
    layer: string;
    tilemap: string;
    scroll: { x: number; y: number };
    parallax: { x: number; y: number };
  }>;
  resource_banks?: "asset_pack";
  rooms: EngineExportTopdownRoom[];
  player: {
    position: { x: number; y: number };
    direction: "up" | "down" | "left" | "right";
    size: { x: number; y: number };
    collision_offset?: { x: number; y: number };
    collision_group?: number;
    collision_mask?: number;
    push_priority?: number;
    pushable?: boolean;
    affine_obj?: EngineExportAffineObj;
    speed: number;
    interact_button: string;
    emit_animation_fallback: boolean;
    on_start?: EngineExportProjectEventCommand[];
    on_update?: EngineExportProjectEventCommand[];
    metasprite?: { asset: string; index: number };
    animation?: string | { asset: string };
    animations?: Array<{ name: string; asset: string; frame_indices: number[] }>;
    sprite_sheet?: string;
    animation_name?: string;
  };
  actor_sprites?: Array<{ name: string } & AssetcActorSpriteExportFields>;
  camera: {
    position: { x: number; y: number };
    follow_player: boolean;
    /** Fixed native presentation scale for regular 4 BPP top-down rendering. */
    zoom_x256: 256;
  };
  save?: {
    enabled: boolean;
    autosave: boolean;
    slot_count: number;
    slot_capacity: number;
    offset: number;
    version: number;
  };
  dialogue_lines: EngineExportDialogueLine[];
  dialogue_ui: EngineDialogueUiConfig;
  portrait_assets?: EngineExportPortraitAsset[];
  emote_assets?: EngineExportEmoteAsset[];
  choice_groups?: EngineExportTopdownChoiceGroup[];
  scripts: EngineExportProjectScript[];
  inventory_enabled?: boolean;
  quests_enabled?: boolean;
  shop_enabled?: boolean;
  quests?: Array<{
    id: string;
    state_variable: number;
    active_value: number;
    completed_value: number;
    objective_item: number;
    objective_quantity: number;
    reward_item: number;
    reward_quantity: number;
  }>;
  shop_items?: Array<{
    label: string;
    item: number;
    currency_item: number;
    price: number;
    stock_variable: number;
    stock: number;
  }>;
}

export interface EngineExportAffineObj {
  enabled: true;
  double_size: boolean;
  matrix_index: number;
  pa: number;
  pb: number;
  pc: number;
  pd: number;
  easing?: "linear" | "ease_in" | "ease_out" | "ease_in_out";
  keyframes?: Array<{
    frame: number;
    pa: number;
    pb: number;
    pc: number;
    pd: number;
  }>;
}

export interface EngineExportPlatformerRoom {
  name: string;
  width_tiles: number;
  height_tiles: number;
  visual_tiles: number[];
  visual_tilemap?: string;
  visual_tilemap_layout?: "source_asset";
  background_layers?: Array<{
    layer: "bg3" | "bg2" | "bg1";
    tiles: number[];
    tilemap?: string;
    tilemap_layout?: "source_asset";
    parallax: { x: number; y: number };
  }>;
  collision_flags: number[];
  collision_slopes: number[];
  collision_types: string[];
  config?: EnginePlatformerPhysicsConfig;
  player_start: { x: number; y: number; width: number; height: number };
  player_collision_offset?: { x: number; y: number };
  camera: {
    position: { x: number; y: number };
    follow_player: boolean;
  };
  on_enter?: EngineExportProjectEventCommand[];
  on_exit?: EngineExportProjectEventCommand[];
  on_update?: EngineExportProjectEventCommand[];
  on_hit_group1?: EngineExportProjectEventCommand[];
  on_hit_group2?: EngineExportProjectEventCommand[];
  on_hit_group3?: EngineExportProjectEventCommand[];
  portals?: Array<{
    area: { x: number; y: number; width: number; height: number };
    target_room: number;
    target_position: { x: number; y: number };
    script?: EngineExportProjectEventCommand[];
  }>;
  camera_zones?: Array<{
    area: { x: number; y: number; width: number; height: number };
    bounds: { x: number; y: number; width: number; height: number };
    offset: { x: number; y: number };
    lock_x: boolean;
    lock_y: boolean;
    on_enter?: EngineExportProjectEventCommand[];
  }>;
  hazards?: Array<{
    area: { x: number; y: number; width: number; height: number };
    damage: number;
    respawn: boolean;
  }>;
  triggers?: Array<{
    area: { x: number; y: number; width: number; height: number };
    on_enter?: EngineExportProjectEventCommand[];
    on_leave?: EngineExportProjectEventCommand[];
  }>;
  npcs?: Array<{
    name: string;
    position: { x: number; y: number };
    size: { x: number; y: number };
    collision_offset?: { x: number; y: number };
    collision_group?: number;
    collision_mask?: number;
    push_priority?: number;
    pushable?: boolean;
    metasprite?: { asset: string; index: number };
    animation?: string | { asset: string };
    animations?: Array<{ name: string; asset: string; frame_indices: number[] }>;
    on_start?: EngineExportProjectEventCommand[];
    on_interact?: EngineExportProjectEventCommand[];
    on_update?: EngineExportProjectEventCommand[];
  }>;
  resource_bank_group?: string;
  video?: ExportedAdvancedVideoComposition;
}

export interface EngineExportPlatformerProject {
  initial_room: number;
  backdrop_color: number;
  interact_button: string;
  jump_button: string;
  run_button: string;
  config: EnginePlatformerPhysicsConfig;
  player?: {
    metasprite: { asset: string; index: number };
    animation?: { asset: string };
    animations?: Partial<Record<
      "idle" | "walk" | "jump" | "fall" | "climb" | "wall_slide" | "dash" | "glide",
      Omit<AssetcSpriteAnimationExportEntry, "name">
    >>;
    on_start?: EngineExportProjectEventCommand[];
    on_update?: EngineExportProjectEventCommand[];
  };
  save?: {
    enabled: boolean;
    autosave: boolean;
    slot_count: number;
    slot_capacity: number;
    offset: number;
    version: number;
  };
  assets?: EngineExportTopdownProject["assets"];
  resource_banks?: "asset_pack";
  rooms: EngineExportPlatformerRoom[];
  dialogue_lines: EngineExportDialogueLine[];
  dialogue_ui?: EngineDialogueUiConfig;
  portrait_assets?: EngineExportPortraitAsset[];
  emote_assets?: EngineExportEmoteAsset[];
  scripts: EngineExportProjectScript[];
}

type PlatformerPlayerAnimationState = "idle" | "walk" | "jump" | "fall" | "climb" | "wall_slide" | "dash" | "glide";

function platformerPlayerAnimationState(name: string): PlatformerPlayerAnimationState | null {
  const tokens = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.some((token) => token === "idle")) return "idle";
  if (tokens.some((token) => token === "walk" || token === "walking" || token === "run" || token === "running")) return "walk";
  if (tokens.some((token) => token === "jump" || token === "jumping")) return "jump";
  if (tokens.some((token) => token === "fall" || token === "falling")) return "fall";
  if (tokens.some((token) => token === "climb" || token === "climbing")) return "climb";
  if (tokens.includes("wall") && tokens.some((token) => token === "slide" || token === "sliding")) return "wall_slide";
  if (tokens.some((token) => token === "dash" || token === "dashing")) return "dash";
  if (tokens.some((token) => token === "glide" || token === "gliding")) return "glide";
  return null;
}

function buildPlatformerPlayerAnimations(
  entries: AssetcSpriteAnimationExportEntry[] | undefined
): Partial<Record<PlatformerPlayerAnimationState, Omit<AssetcSpriteAnimationExportEntry, "name">>> | undefined {
  if (!entries || entries.length === 0) return undefined;
  const animations: Partial<Record<PlatformerPlayerAnimationState, Omit<AssetcSpriteAnimationExportEntry, "name">>> = {};
  for (const { name, ...entry } of entries) {
    const state = platformerPlayerAnimationState(name);
    if (state && animations[state] === undefined) animations[state] = entry;
  }
  return Object.keys(animations).length > 0 ? animations : undefined;
}

function buildIsometricActorAnimations(
  entries: AssetcSpriteAnimationExportEntry[] | undefined
): AssetcSpriteAnimationExportEntry[] | undefined {
  if (!entries || entries.length === 0) return undefined;
  const result = new Map<string, AssetcSpriteAnimationExportEntry>();
  for (const entry of entries) {
    const tokens = entry.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const state = tokens.includes("attack") || tokens.includes("attacking")
      ? "attack"
      : tokens.includes("hurt") || tokens.includes("hit") || tokens.includes("damaged")
        ? "hurt"
        : tokens.includes("defeat") || tokens.includes("defeated") || tokens.includes("death") || tokens.includes("dead")
          ? "defeat"
          : tokens.includes("move") || tokens.includes("moving")
            ? "move"
            : tokens.includes("walk") || tokens.includes("walking") || tokens.includes("run") || tokens.includes("running")
              ? "walk"
              : tokens.includes("idle")
                ? "idle"
                : null;
    if (!state) continue;
    const hasDown = tokens.includes("down");
    const hasUp = tokens.includes("up");
    const hasLeft = tokens.includes("left");
    const hasRight = tokens.includes("right");
    const direction = hasDown && hasLeft
      ? "left"
      : hasDown && hasRight
        ? "right"
        : hasUp && hasRight
          ? "up"
          : hasUp && hasLeft
            ? "down"
            : hasDown
              ? "down"
              : hasUp
                ? "up"
                : hasLeft
                  ? "left"
                  : hasRight
                    ? "right"
                    : null;
    if (!direction) continue;
    const name = `${state}_${direction}`;
    if (!result.has(name)) result.set(name, { ...entry, name });
  }
  return result.size > 0 ? Array.from(result.values()) : undefined;
}

function tacticalCapabilityID(value: string): value is SceneTacticalCapabilityID {
  return [
    "tactical_surface",
    "tactical_grid_overlay",
    "tactical_hud",
    "tactical_units",
    "tactical_props",
    "tactical_feedback",
    "tactical_audio"
  ].includes(value as SceneTacticalCapabilityID);
}

function tacticalRuntimeConfig(room: Record<string, unknown>): Record<string, unknown> {
  return child(child(room, "runtime"), "config") ?? {};
}

function tacticalAssetBaseReference(reference: string): string {
  const fragmentIndex = reference.indexOf("#");
  return (fragmentIndex >= 0 ? reference.slice(0, fragmentIndex) : reference).trim();
}

function tacticalAssetFragment(reference: string): string {
  const fragmentIndex = reference.indexOf("#");
  return fragmentIndex >= 0 ? reference.slice(fragmentIndex) : "";
}

function tacticalAssetRecord(data: GBAProjectData, reference: string): Record<string, unknown> | null {
  const base = tacticalAssetBaseReference(reference);
  if (!base) return null;
  const baseName = base.replace(/^.*[\\/]/, "");
  return projectArray(data, "assets").find((asset) => {
    const metadata = child(asset, "metadata");
    return [
      nullableStringField(asset, "id"),
      nullableStringField(asset, "name"),
      nullableStringField(asset, "path"),
      nullableStringField(asset, "exportID"),
      nullableStringField(metadata, "source")
    ].some((candidate) => candidate === base || candidate === baseName || candidate?.replace(/^.*[\\/]/, "") === baseName);
  }) ?? null;
}

function tacticalAudioRecord(data: GBAProjectData, reference: string): Record<string, unknown> | null {
  const base = tacticalAssetBaseReference(reference);
  const fileName = base.replace(/^.*[\\/]/, "");
  return projectArray(data, "audioItems").find((audio) => (
    [
      nullableStringField(audio, "id"),
      nullableStringField(audio, "name"),
      nullableStringField(audio, "path"),
      nullableStringField(audio, "exportID")
    ].some((candidate) => candidate === reference || candidate === base || candidate === fileName || candidate.replace(/^.*[\\/]/, "") === fileName)
  )) ?? null;
}

function tacticalCanonicalAssetReference(
  data: GBAProjectData,
  reference: string,
  consumer: IsoTacticalAssetConsumer,
  tilesetPack: AssetcTilesetPackGeneration | null,
  spritePack: AssetcSpritePackGeneration | null
): string {
  const asset = tacticalAssetRecord(data, reference);
  if (!asset) {
    throw new Error(`Asset tático não encontrado: ${reference}.`);
  }
  const assetName = nullableStringField(asset, "name") ?? nullableStringField(asset, "id") ?? reference;
  const packAsset = consumer === "obj"
    ? spritePack?.assetsBySheet[assetName] ?? spritePack?.assetsBySheet[tacticalAssetBaseReference(reference)]
    : tilesetPack?.assetsBySheet[assetName] ?? tilesetPack?.assetsBySheet[tacticalAssetBaseReference(reference)];
  const canonical = packAsset?.name
    ?? nullableStringField(asset, "exportID")
    ?? assetName.replace(/^.*[\\/]/, "");
  return `${canonical}${tacticalAssetFragment(reference)}`;
}

function tacticalCanonicalAudioReference(data: GBAProjectData, reference: string): string {
  const audio = tacticalAudioRecord(data, reference);
  if (!audio) throw new Error(`Item de áudio tático não encontrado: ${reference}.`);
  return nullableStringField(audio, "exportID")
    ?? nullableStringField(audio, "id")
    ?? nullableStringField(audio, "name")
    ?? reference;
}

function tacticalAudioAssetReference(
  data: GBAProjectData,
  reference: string,
  kind: "music" | "sfx",
  audioPack: AssetcAudioPackGeneration | null
): EngineExportAudioAssetRef {
  const canonical = tacticalCanonicalAudioReference(data, reference);
  const entries = kind === "music" ? audioPack?.document.tracker ?? [] : audioPack?.document.sfx ?? [];
  const index = entries.findIndex((entry) => entry.name === canonical);
  if (!audioPack || index < 0) {
    throw new Error(`Item de áudio tático não está no pacote ${kind}: ${canonical}.`);
  }
  return { asset: audioPack.packAsset.id, index };
}

function tacticalReferenceMatchesBinding(binding: IsoTacticalAssetBinding, reference: string): boolean {
  const baseReference = tacticalAssetBaseReference(reference);
  const candidates = [binding.id, binding.path, tacticalAssetBaseReference(binding.path)]
    .filter((candidate): candidate is string => Boolean(candidate));
  return candidates.some((candidate) => (
    candidate === reference
      || candidate === baseReference
      || candidate.replace(/^.*[\\/]/, "") === baseReference.replace(/^.*[\\/]/, "")
  ));
}

function tacticalPresentationReferences(
  presentation: IsoTacticalPresentationConfig,
  enabled: ReadonlySet<SceneTacticalCapabilityID>
): string[] {
  const references: string[] = [];
  if (enabled.has("tactical_surface") && presentation.surfaceAsset) references.push(presentation.surfaceAsset);
  if (enabled.has("tactical_surface")) references.push(...(presentation.surfacePages ?? []).map((page) => page.asset));
  if (enabled.has("tactical_grid_overlay") && presentation.gridAsset) references.push(presentation.gridAsset);
  if (enabled.has("tactical_hud") && presentation.hudLayout) references.push(presentation.hudLayout);
  if (enabled.has("tactical_units")) references.push(...presentation.units.map((unit) => unit.sheet));
  if (enabled.has("tactical_props")) references.push(...presentation.props.map((prop) => prop.asset));
  if (enabled.has("tactical_feedback")) {
    references.push(...[
      presentation.cursorAsset,
      presentation.rangeAsset,
      presentation.targetAsset,
      presentation.emotesAsset,
      presentation.feedbackAsset
    ].filter((reference): reference is string => Boolean(reference)));
  }
  if (enabled.has("tactical_audio")) {
    references.push(presentation.audio?.music ?? "", ...Object.values(presentation.audio?.cues ?? {}));
  }
  return references.filter(Boolean);
}

export function tacticalMarkerIndices(cursorAsset: string, rangeAsset: string, targetAsset: string): {
  cursor: number;
  range: number;
  target: number;
} {
  const [cursorSheet] = cursorAsset.split("#", 1);
  const [rangeSheet] = rangeAsset.split("#", 1);
  const [targetSheet] = targetAsset.split("#", 1);
  return {
    cursor: 0,
    range: Number(rangeSheet === cursorSheet),
    target: Number(targetSheet === cursorSheet) + Number(targetSheet === rangeSheet)
  };
}

function buildIsometricTacticalPresentation(
  data: GBAProjectData,
  room: Record<string, unknown>,
  grid: IsometricSceneConfig | null,
  tilesetPack: AssetcTilesetPackGeneration | null,
  spritePack: AssetcSpritePackGeneration | null,
  audioPack: AssetcAudioPackGeneration | null
): EngineExportIsometricTacticalPresentation | undefined {
  const config = tacticalRuntimeConfig(room);
  const manifest = resolveSceneCapabilityManifest(
    "isometric",
    config.modules,
    undefined,
    config.capabilities,
    config.tacticalCapabilities
  );
  const activeIDs = manifest.capabilities
    .filter((capability) => tacticalCapabilityID(capability.id) && capability.status.enabled)
    .map((capability) => capability.id as SceneTacticalCapabilityID);
  if (activeIDs.length === 0) return undefined;
  if (grid?.gameplayMode !== "tactical") {
    throw new Error("Capabilities táticas exigem uma sala isométrica com gameplayMode tactical.");
  }

  const tacticalIssues = manifest.issues.filter((issue) => (
    issue.module?.startsWith("tactical_")
      || issue.code === "UNKNOWN_CAPABILITY"
      || issue.code === "INVALID_CAPABILITY_CONFIG"
      || issue.code === "INVALID_CAPABILITY_SETTINGS"
  ));
  if (tacticalIssues.length > 0) {
    throw new Error(`Configuração de capability tática inválida: ${tacticalIssues.map((issue) => issue.message).join(" ")}`);
  }

  const rawPresentation = config.tacticalPresentation;
  const presentation = normalizeIsometricTacticalPresentation(rawPresentation);
  const presentationIssues = [
    ...validateIsometricTacticalPresentation(rawPresentation, activeIDs),
    ...validateIsometricTacticalAudioCatalog(projectArray(data, "audioItems"), rawPresentation, activeIDs)
  ];
  const missingAnimation = activeIDs.includes("tactical_units")
    ? presentation.units.flatMap((unit) => ISO_TACTICAL_ANIMATION_BINDINGS
      .filter((binding) => !unit.animations?.[binding])
      .map((binding) => `${unit.actorId || "<unidade>"}.${binding}`))
    : [];
  if (missingAnimation.length > 0) {
    presentationIssues.push({
      code: "MISSING_CAPABILITY_ASSET",
      module: "tactical_units",
      field: "animations",
      message: `tactical_units exige todos os estados/direções sem fallback implícito: ${missingAnimation.join(", ")}.`
    });
  }
  if (presentationIssues.length > 0) {
    throw new Error(`Apresentação tática inválida: ${presentationIssues.map((issue) => issue.message).join(" ")}`);
  }

  const enabled = new Set(activeIDs);
  const references = tacticalPresentationReferences(presentation, enabled);
  const canonicalAsset = (reference: string, consumer: IsoTacticalAssetConsumer): string => (
    tacticalCanonicalAssetReference(data, reference, consumer, tilesetPack, spritePack)
  );
  const canonicalAudio = (reference: string): string => tacticalCanonicalAudioReference(data, reference);
  const assetBindings = (presentation.assets ?? []).filter((binding) => (
    references.some((reference) => tacticalReferenceMatchesBinding(binding, reference))
  )).map((binding) => ({
    id: binding.id,
    reference: binding.consumer === "audio"
      ? canonicalAudio(binding.path)
      : canonicalAsset(binding.path, binding.consumer),
    consumer: binding.consumer,
    required: binding.required,
    ...(binding.status ? { status: binding.status } : {})
  }));

  const layers: EngineExportIsometricTacticalPresentation["layers"] = { collision: "scene_data" };
  if (enabled.has("tactical_surface")) layers.surface = "BG2";
  if (enabled.has("tactical_grid_overlay")) layers.grid = "BG1";
  if (enabled.has("tactical_hud")) layers.hud = "BG0";
  if (enabled.has("tactical_units") || enabled.has("tactical_props") || enabled.has("tactical_feedback")) {
    layers.objects = "OBJ";
  }

  const units = enabled.has("tactical_units")
    ? presentation.units.map((unit) => ({
      actor_id: unit.actorId,
      sheet: canonicalAsset(unit.sheet, "obj"),
      ...(unit.animations ? { animations: unit.animations } : {})
    }))
    : [];
  const props = enabled.has("tactical_props")
    ? presentation.props.map((prop) => ({
      id: prop.id,
      asset: canonicalAsset(prop.asset, "obj"),
      kind: prop.kind,
      ...(prop.tile ? { tile: { ...prop.tile } } : {}),
      ...(prop.animated !== undefined ? { animated: prop.animated } : {})
    }))
    : [];
  const indices: EngineExportIsometricTacticalPresentation["indices"] = {
    props: props.map((prop, index) => ({ id: prop.id, index }))
  };
  const output: EngineExportIsometricTacticalPresentation = {
    schema: 1,
    capabilities: activeIDs,
    layers,
    assets: assetBindings,
    ...(enabled.has("tactical_surface") && presentation.surfaceAsset
      ? { surface_asset: canonicalAsset(presentation.surfaceAsset, "bg") }
      : {}),
    ...(enabled.has("tactical_surface") && presentation.surfacePages?.length && presentation.surfaceResidency
      ? {
        surface_pages: presentation.surfacePages.map((page) => ({
          id: page.id,
          asset: canonicalAsset(page.asset, "bg"),
          bank_group: page.bankGroup,
          world: { ...page.world }
        })),
        surface_residency: {
          exclusive_bank_groups: [...presentation.surfaceResidency.exclusiveBankGroups],
          max_resident_groups: presentation.surfaceResidency.maxResidentGroups,
          prefetch_margin_pixels: presentation.surfaceResidency.prefetchMarginPixels
        }
      }
      : {}),
    ...(enabled.has("tactical_grid_overlay") && presentation.gridAsset
      ? { grid_asset: canonicalAsset(presentation.gridAsset, "bg") }
      : {}),
    ...(enabled.has("tactical_hud") && presentation.hudLayout
      ? { hud_layout: canonicalAsset(presentation.hudLayout, "ui") }
      : {}),
    units,
    props,
    ...(enabled.has("tactical_feedback") && presentation.cursorAsset && presentation.rangeAsset && presentation.targetAsset
      ? {
        cursor_asset: canonicalAsset(presentation.cursorAsset, "obj"),
        range_asset: canonicalAsset(presentation.rangeAsset, "obj"),
        target_asset: canonicalAsset(presentation.targetAsset, "obj"),
        emotes: presentation.emotesAsset
          ? { asset: canonicalAsset(presentation.emotesAsset, "obj"), index: 0 }
          : undefined,
        feedback: presentation.feedbackAsset
          ? { asset: canonicalAsset(presentation.feedbackAsset, "obj"), index: 0 }
          : undefined
      }
      : {}),
    indices
  };
  if (enabled.has("tactical_feedback") && output.cursor_asset && output.range_asset && output.target_asset) {
    output.indices.markers = tacticalMarkerIndices(output.cursor_asset, output.range_asset, output.target_asset);
  }
  if (enabled.has("tactical_audio") && presentation.audio) {
    const cues = Object.fromEntries(ISO_TACTICAL_AUDIO_CUES.map((cue) => [
      cue,
      tacticalAudioAssetReference(data, presentation.audio?.cues[cue] ?? "", "sfx", audioPack)
    ])) as Record<(typeof ISO_TACTICAL_AUDIO_CUES)[number], EngineExportAudioAssetRef>;
    const cueIndices = Object.fromEntries(ISO_TACTICAL_AUDIO_CUES.map((cue, index) => [cue, index])) as Record<(typeof ISO_TACTICAL_AUDIO_CUES)[number], number>;
    output.audio = {
      format: "COMPOSED",
      music: tacticalAudioAssetReference(data, presentation.audio.music, "music", audioPack),
      cues,
      cue_indices: cueIndices
    };
    output.indices.audio_cues = cueIndices;
  }
  return output;
}

function tacticalCapabilityReferencesForExport(
  presentation: EngineExportIsometricTacticalPresentation,
  capability: SceneTacticalCapabilityID
): string[] {
  if (capability === "tactical_surface") return [
    presentation.surface_asset,
    ...(presentation.surface_pages ?? []).map((page) => page.asset)
  ].filter((reference): reference is string => Boolean(reference));
  if (capability === "tactical_grid_overlay") return presentation.grid_asset ? [presentation.grid_asset] : [];
  if (capability === "tactical_hud") return presentation.hud_layout ? [presentation.hud_layout] : [];
  if (capability === "tactical_units") return presentation.units.map((unit) => unit.sheet);
  if (capability === "tactical_props") return presentation.props.map((prop) => prop.asset);
  if (capability === "tactical_feedback") {
    return [
      presentation.cursor_asset,
      presentation.range_asset,
      presentation.target_asset,
      presentation.emotes?.asset,
      presentation.feedback?.asset
    ].filter((reference): reference is string => Boolean(reference));
  }
  return presentation.audio
    ? [presentation.audio.music, ...Object.values(presentation.audio.cues)]
      .map((reference) => (
        typeof reference === "string" ? reference : `${reference.asset}#${reference.index ?? 0}`
      ))
    : [];
}

function buildTacticalCapabilityAssetRefs(
  data: GBAProjectData,
  tilesetPack: AssetcTilesetPackGeneration | null,
  spritePack: AssetcSpritePackGeneration | null,
  audioPack: AssetcAudioPackGeneration | null
): Array<{ scene: string; capability: SceneTacticalCapabilityID; references: string[] }> {
  return projectRooms(data).flatMap((room, index) => {
    const grid = isometricSceneConfigFromRuntime(room.runtime, data.settings);
    const presentation = buildIsometricTacticalPresentation(
      data,
      room,
      grid,
      tilesetPack,
      spritePack,
      audioPack
    );
    if (!presentation) return [];
    return presentation.capabilities.map((capability) => ({
      scene: roomName(room, index),
      capability,
      references: Array.from(new Set(tacticalCapabilityReferencesForExport(presentation, capability)))
    }));
  });
}

export interface EngineExportIsometricActor {
  tile: { x: number; y: number; z: number };
  screen_offset: { x: number; y: number };
  tile_index: number;
  palette: number;
  follow_player: boolean;
  size?: { x: number; y: number };
  metasprite?: { asset: string; index: number };
  animation?: string | { asset: string };
  animations?: AssetcSpriteAnimationExportEntry[];
  collision_group?: number;
  on_start?: EngineExportProjectEventCommand[];
  on_interact?: EngineExportProjectEventCommand[];
  on_update?: EngineExportProjectEventCommand[];
}

export interface EngineExportIsometricTactical {
  enabled: true;
  active_team: "player" | "enemy";
  active_unit_index: number;
  units: Array<{
    actor_index: number;
    team: "player" | "enemy";
    move_range: number;
    attack_range: number;
    max_hp: number;
    attack_power: number;
  }>;
}

export interface EngineExportIsometricTacticalAsset {
  id: string;
  reference: string;
  consumer: IsoTacticalAssetConsumer;
  required: boolean;
  status?: IsoTacticalAssetBinding["status"];
}

export interface EngineExportIsometricTacticalPresentation {
  schema: 1;
  capabilities: SceneTacticalCapabilityID[];
  layers: {
    surface?: "BG2";
    grid?: "BG1";
    hud?: "BG0";
    objects?: "OBJ";
    collision: "scene_data";
  };
  assets: EngineExportIsometricTacticalAsset[];
  surface_asset?: string;
  surface_pages?: Array<{
    id: string;
    asset: string;
    bank_group: string;
    world: { x: number; y: number; width: number; height: number };
  }>;
  surface_residency?: {
    exclusive_bank_groups: string[];
    max_resident_groups: number;
    prefetch_margin_pixels: number;
  };
  grid_asset?: string;
  hud_layout?: string;
  units: Array<{
    actor_id: string;
    sheet: string;
    animations?: NonNullable<IsoTacticalUnitPresentation["animations"]>;
  }>;
  props: Array<{
    id: string;
    asset: string;
    kind: "objective" | "cover" | "elevation";
    tile?: { x: number; y: number; z: number };
    animated?: boolean;
  }>;
  cursor_asset?: string;
  range_asset?: string;
  target_asset?: string;
  emotes?: { asset: string; index: number };
  feedback?: { asset: string; index: number };
  audio?: {
    format: "COMPOSED";
    music: EngineExportAudioAssetRef;
    cues: Record<(typeof ISO_TACTICAL_AUDIO_CUES)[number], EngineExportAudioAssetRef>;
    cue_indices: Record<(typeof ISO_TACTICAL_AUDIO_CUES)[number], number>;
  };
  indices: {
    markers?: { cursor: number; range: number; target: number };
    props: Array<{ id: string; index: number }>;
    audio_cues?: Record<(typeof ISO_TACTICAL_AUDIO_CUES)[number], number>;
  };
}

export interface EngineExportIsometricRoom {
  name: string;
  world_mode: "scrollable_tiled_world" | "static_composition";
  width_tiles: number;
  height_tiles: number;
  visual_tiles: number[];
  collision_flags: number[];
  ramp_flags: number[];
  height_levels: number[];
  grid?: {
    tile_width_pixels: number;
    tile_height_pixels: number;
    height_step_pixels: number;
    origin: { x: number; y: number };
    gameplay_mode: IsometricSceneConfig["gameplayMode"];
    profile: IsometricSceneConfig["profile"];
    projection: IsometricSceneConfig["projection"];
    movement_model: IsometricSceneConfig["movement"];
    height_mode: IsometricSceneConfig["heightMode"];
  };
  tactical?: EngineExportIsometricTactical;
  tactical_presentation?: EngineExportIsometricTacticalPresentation;
  camera?: {
    position: { x: number; y: number };
    bounds: { x: number; y: number; width: number; height: number };
    bounds_enabled: boolean;
    zoom_x256: number;
    target_zoom_x256: number;
    follow_enabled: boolean;
    smoothing_x256: number;
    dead_zone: { x: number; y: number; width: number; height: number };
  };
  on_enter?: EngineExportProjectEventCommand[];
  on_exit?: EngineExportProjectEventCommand[];
  on_update?: EngineExportProjectEventCommand[];
  on_hit_group1?: EngineExportProjectEventCommand[];
  on_hit_group2?: EngineExportProjectEventCommand[];
  on_hit_group3?: EngineExportProjectEventCommand[];
  actors?: EngineExportIsometricActor[];
  tile_events?: Array<{
    area: { x: number; y: number; width: number; height: number; z?: number };
    on_interact: EngineExportProjectEventCommand[];
  }>;
  triggers?: Array<{
    area: { x: number; y: number; width: number; height: number };
    on_enter?: EngineExportProjectEventCommand[];
    on_leave?: EngineExportProjectEventCommand[];
  }>;
  camera_zones?: EngineExportCameraZone[];
  background_layers?: {
    bg3: number[];
    bg2: number[];
    bg1: number[];
    bg0: number[];
  };
  authored_background?: string;
  paged_surface?: { background: string; foreground: string; width: number; height: number };
  tileset?: string;
  tileset_tile_width_pixels?: number;
  tileset_tile_height_pixels?: number;
  tileset_tile_offset_x_pixels?: number;
  tileset_tile_offset_y_pixels?: number;
  tileset_render_width_pixels?: number;
  tileset_render_height_pixels?: number;
  tileset_render_offset_y_pixels?: number;
  resource_bank_group?: string;
  video?: ExportedAdvancedVideoComposition;
}

export interface EngineExportIsometricProject {
  initial_room: number;
  /** RGB555 clear color visible through transparent diamond corners. */
  backdrop_color: number;
  resource_banks?: "asset_pack";
  video?: ExportedAdvancedVideoComposition;
  save?: {
    enabled: boolean;
    autosave: boolean;
    slot_count: number;
    slot_capacity: number;
    offset: number;
    version: number;
  };
  assets?: {
    bg_palettes?: string[];
    obj_palettes?: string[];
    tile_assets?: string[];
    sprite_assets?: string[];
    sfx_assets?: Array<string | { asset: string; index?: number }>;
    music_assets?: Array<string | { asset: string; index?: number }>;
    pcm_assets?: Array<string | { asset: string; index?: number }>;
    tracker_assets?: Array<string | { asset: string; index?: number }>;
  };
  rooms: EngineExportIsometricRoom[];
  dialogue_lines: EngineExportDialogueLine[];
  dialogue_ui?: EngineDialogueUiConfig;
  portrait_assets?: EngineExportPortraitAsset[];
  emote_assets?: EngineExportEmoteAsset[];
  scripts: EngineExportProjectScript[];
}

export interface EngineExportDungeonCrawlerRoom {
  name: string;
  resource_bank_group?: string;
  width_tiles: number;
  height_tiles: number;
  collision_flags: number[];
  config: {
    step_duration_frames: number;
    turn_duration_frames: number;
    allow_backstep: boolean;
    view_distance: number;
  };
  player_start: {
    x: number;
    y: number;
    direction: "north" | "east" | "south" | "west";
  };
  battle_enabled?: boolean;
  background?: number;
  on_enter?: EngineExportProjectEventCommand[];
  triggers?: Array<{
    area: { x: number; y: number; width: number; height: number };
    on_enter?: EngineExportProjectEventCommand[];
    on_leave?: EngineExportProjectEventCommand[];
  }>;
  actors?: Array<{
    name: string;
    position: { x: number; y: number };
    metasprite: { asset: string; index: number };
    depth_metasprites?: {
      far: { asset: string; index: number };
      mid: { asset: string; index: number };
      near: { asset: string; index: number };
    };
    on_interact?: EngineExportProjectEventCommand[];
  }>;
  video?: ExportedAdvancedVideoComposition;
}

export interface EngineExportDungeonCrawlerProject {
  initial_room: number;
  resource_banks?: "asset_pack";
  save?: {
    enabled: boolean;
    autosave: boolean;
    slot_count: number;
    slot_capacity: number;
    offset: number;
    version: number;
  };
  rooms: EngineExportDungeonCrawlerRoom[];
  dialogue_lines: EngineExportDialogueLine[];
  dialogue_ui?: EngineDialogueUiConfig;
  scripts: EngineExportProjectScript[];
  assets?: EngineExportTopdownProject["assets"];
  backgrounds?: Array<{
    layer: "bg2";
    tilemap: string;
    backdrop_color?: number;
    backdrop_from_tilemap_palette?: boolean;
  }>;
  inventory_enabled?: boolean;
  battle_enabled?: boolean;
  compass_enabled?: boolean;
  map_enabled?: boolean;
  depth_sprites_enabled?: boolean;
  inventory_items?: Array<{
    label: string;
    item: number;
    initial_quantity: number;
    heal_amount: number;
  }>;
  battle?: {
    enemy_name: string;
    enemy_actor_index: number;
    max_hp: number;
    player_damage: number;
    enemy_damage: number;
    reward_item: number;
    reward_quantity: number;
  };
}

export type EngineRacingVehicleAction =
  | "idle" | "drive" | "steer_left" | "steer_right" | "brake" | "hurt" | "brake_left" | "brake_right"
  | `${"idle" | "drive" | "hurt"}_${"up" | "right" | "down" | "left"}`;

export interface EngineExportRacingPlayer {
  idle_metasprite: { asset: string; index: number };
  drive_metasprite: { asset: string; index: number };
  animations?: Partial<Record<EngineRacingVehicleAction, Omit<AssetcSpriteAnimationExportEntry, "name">>>;
}

export interface EngineExportRacingRoom {
  player?: EngineExportRacingPlayer;
  name: string;
  resource_bank_group?: string;
  width_tiles: number;
  height_tiles: number;
  collision_flags: number[];
  config: {
    max_speed_x256: number;
    acceleration_x256_per_second: number;
    brake_power_x256_per_second: number;
    steering_speed_x256: number;
    presentation: "topdown" | "pseudo3d";
    laps_to_win: number;
    checkpoints_per_lap: number;
    pickups_per_lap: number;
    rival_speed_x256_per_second: number;
    road_curve: number;
    show_minimap: boolean;
  };
  perspective_camera?: { height: number; distance: number; focal_length: number };
  floor_tilemap?: number[];
  track_segments?: Array<{
    length_pixels: number;
    curve: number;
    half_width: number;
  }>;
  topdown_track?: {
    camera_dead_zone: { x: number; y: number };
    start_heading: number;
    finish_at_zero?: boolean;
    path_points?: Array<{ x: number; y: number }>;
    checkpoints: Array<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
  };
  player_start_pixels: { x: number; y: number };
  background?: number;
  pseudo3d_visual?: number;
  on_enter?: EngineExportProjectEventCommand[];
  triggers?: Array<{
    area: { x: number; y: number; width: number; height: number };
    on_enter?: EngineExportProjectEventCommand[];
    on_leave?: EngineExportProjectEventCommand[];
  }>;
  actors?: Array<{
    name: string;
    position_pixels: { x: number; y: number };
    metasprite: { asset: string; index: number };
    on_interact?: EngineExportProjectEventCommand[];
  }>;
}

export interface EngineExportRacingProject {
  initial_room: number;
  resource_banks?: "asset_pack";
  rooms: EngineExportRacingRoom[];
  save?: EngineProjectSaveConfig;
  dialogue_lines?: EngineExportDialogueLine[];
  dialogue_ui?: EngineDialogueUiConfig;
  scripts?: EngineExportProjectScript[];
  assets?: EngineExportTopdownProject["assets"];
  backgrounds?: Array<{
    layer: "bg2";
    tilemap: string;
    backdrop_color?: number;
    backdrop_from_tilemap_palette?: boolean;
  }>;
  pseudo3d_visuals?: Array<{
    horizon_y: number;
    panorama?: string;
    floor: string;
    minimap?: string;
  }>;
  player?: EngineExportRacingPlayer;
  video?: ExportedAdvancedVideoComposition;
}

export interface EngineExportBattleRpgEncounter {
  name: string;
  background?: number;
  resource_bank_group?: string;
  config: {
    max_party_size: number;
    max_enemies: number;
    turn_delay_frames: number;
    escape_enabled: boolean;
    experience_multiplier: number;
    type_effectiveness_enabled: boolean;
    critical_hit_enabled: boolean;
    status_conditions_enabled: boolean;
    abilities_enabled: boolean;
    show_experience_bar: boolean;
    show_health_bars: boolean;
    battle_style: "single" | "double";
    weather_effect: "none" | "rain" | "sun" | "sandstorm" | "hail";
  };
  party_count: number;
  enemy_count: number;
  party: EngineExportBattleRpgParticipant[];
  enemies: EngineExportBattleRpgParticipant[];
  rewards: { gold: number; experience: number };
  on_enter?: EngineExportProjectEventCommand[];
  on_victory?: EngineExportProjectEventCommand[];
  on_defeat?: EngineExportProjectEventCommand[];
  on_escape?: EngineExportProjectEventCommand[];
}

export interface EngineExportBattleRpgParticipant {
  name: string;
  unit: { max_hp: number; attack: number; defense: number; speed: number };
  abilities: Array<{ kind: "attack" | "magic" | "heal" | "defend"; power: number }>;
  metasprite?: { asset: string; index: number };
  sprite_scale?: number;
}

export interface EngineExportBattleRpgProject {
  initial_encounter: number;
  encounters: EngineExportBattleRpgEncounter[];
  save?: EngineProjectSaveConfig;
  dialogue_lines?: EngineExportDialogueLine[];
  dialogue_ui?: EngineDialogueUiConfig;
  scripts?: EngineExportProjectScript[];
  assets?: EngineExportTopdownProject["assets"] & { sprite_assets?: string[] };
  resource_banks?: "asset_pack";
  backgrounds?: Array<{
    layer: "bg2";
    tilemap: string;
    backdrop_color?: number;
    backdrop_from_tilemap_palette?: boolean;
  }>;
}

export interface EngineExportLutaFighter {
  name: string;
  unit: { max_hp: number; attack: number; defense: number; speed: number; weight: number };
  combo_stats: { super_level: number; throw_range: number; guard_power: number };
  metasprite?: { asset: string; index: number };
  animation_set?: AssetcLutaAnimationSetExport;
}

export interface EngineExportLutaStage {
  name: string;
  background?: number;
  resource_bank_group?: string;
  on_enter?: EngineExportProjectEventCommand[];
  on_victory?: EngineExportProjectEventCommand[];
  on_defeat?: EngineExportProjectEventCommand[];
  config: {
    round_time: number;
    rounds_to_win: number;
    max_super_gauge: number;
    super_gauge_gain_on_hit: number;
    super_gauge_gain_on_receive: number;
    guard_power_recovery: number;
    chip_damage_enabled: boolean;
    air_blocking_enabled: boolean;
    alpha_counter_enabled: boolean;
    throw_escape_window: number;
    parry_window: number;
    hitstun_decay: number;
    combo_limit: number;
    vism_custom_combo_gauge: number;
    default_style: "a-ism" | "x-ism" | "v-ism";
    stage_id: string;
    player1_start_x: number;
    player2_start_x: number;
  };
  player1?: EngineExportLutaFighter[];
  player2?: EngineExportLutaFighter[];
}

export interface EngineExportLutaProject {
  initial_stage: number;
  stages: EngineExportLutaStage[];
  save?: EngineProjectSaveConfig;
  dialogue_lines?: EngineExportDialogueLine[];
  dialogue_ui?: EngineDialogueUiConfig;
  scripts?: EngineExportProjectScript[];
  assets?: EngineExportTopdownProject["assets"] & { sprite_assets?: string[] };
  resource_banks?: "asset_pack";
  backgrounds?: Array<{
    layer: "bg2";
    tilemap: string;
    backdrop_color?: number;
    backdrop_from_tilemap_palette?: boolean;
  }>;
  hud?: {
    layer: "bg0";
    tilemap: string;
    backdrop_color?: number;
    backdrop_from_tilemap_palette?: boolean;
  };
}

export interface EngineExportPointClickHotspot {
  name: string;
  area: { x: number; y: number; width: number; height: number };
  on_click?: EngineExportProjectEventCommand[];
  line?: number;
  target_scene?: number;
}

export interface EngineExportPointClickProp {
  name: string;
  metasprite: { asset: string; index: number };
  position: { x: number; y: number };
  animation: string | { asset: string };
  animations?: AssetcSpriteAnimationExportEntry[];
  visible_variable?: number;
  visible_value?: number;
}

export interface EngineExportPointClickScene {
  name: string;
  background?: number;
  backgrounds?: number[];
  resource_bank_group?: string;
  on_enter?: EngineExportProjectEventCommand[];
  cursor_speed?: number;
  hotspots?: EngineExportPointClickHotspot[];
  props?: EngineExportPointClickProp[];
}

export interface EngineExportPointClickProject {
  initial_scene: number;
  cursor_start: { x: number; y: number };
  cursor_speed: number;
  cursor?: {
    metasprite: { asset: string; index: number };
    animations?: AssetcSpriteAnimationExportEntry[];
  };
  save?: {
    enabled: boolean;
    autosave: boolean;
    slot_count: number;
    slot_capacity: number;
    offset: number;
    version: number;
  };
  assets?: EngineExportTopdownProject["assets"];
  backgrounds?: Array<{
    name: string;
    layer: string;
    tilemap: string;
    backdrop_color: number;
  }>;
  resource_banks?: string;
  scenes: EngineExportPointClickScene[];
  dialogue_lines: EngineExportDialogueLine[];
  dialogue_ui?: EngineDialogueUiConfig;
  portrait_assets?: EngineExportPortraitAsset[];
  emote_assets?: EngineExportEmoteAsset[];
  scripts: EngineExportProjectScript[];
}

export interface EngineExportShmupEnemy {
  name: string;
  position: { x: number; y: number };
  size: { x: number; y: number };
  velocity: { x: number; y: number };
  movement: string;
  health: number;
  score: number;
  fire_interval: number;
  projectile_offset?: { x: number; y: number };
  on_spawn?: EngineExportProjectEventCommand[];
  on_destroy?: EngineExportProjectEventCommand[];
  on_hit_player?: EngineExportProjectEventCommand[];
  metasprite?: { asset: string; index: number };
}

export interface EngineExportShmupWave {
  name: string;
  start_frame: number;
  next_wave?: number;
  resource_bank_group?: string;
  player_speed?: number;
  fire_cooldown?: number;
  enemies: EngineExportShmupEnemy[];
  on_start?: EngineExportProjectEventCommand[];
  on_clear?: EngineExportProjectEventCommand[];
}

export interface EngineExportShmupProject {
  initial_wave: number;
  score_enabled: boolean;
  high_score_enabled: boolean;
  initial_score: number;
  initial_lives: number;
  waves_enabled: boolean;
  max_waves: number;
  loop_waves: boolean;
  resource_banks?: "asset_pack";
  save?: {
    enabled: boolean;
    autosave: boolean;
    slot_count: number;
    slot_capacity: number;
    offset: number;
    version: number;
  };
  assets?: {
    bg_palettes?: string[];
    obj_palettes?: string[];
    tile_assets?: string[];
    sprite_assets?: string[];
    sfx_assets?: Array<string | { asset: string; index?: number }>;
    music_assets?: Array<string | { asset: string; index?: number }>;
    pcm_assets?: Array<string | { asset: string; index?: number }>;
    tracker_assets?: Array<string | { asset: string; index?: number }>;
  };
  backgrounds?: Array<{
    name: string;
    backdrop_color: number;
    width_tiles: number;
    height_tiles: number;
    layers: Array<{
      layer: "bg3" | "bg2" | "bg1";
      tilemap: string;
      scroll: { x: number; y: number };
    }>;
    video?: ExportedAdvancedVideoComposition;
    collision_flags?: number[];
    collision_width_tiles?: number;
    collision_height_tiles?: number;
    world_width_pixels?: number;
    world_height_pixels?: number;
    affine_scroll_pixels_per_frame?: { x: number; y: number };
  }>;
  background?: number;
  player: {
    position: { x: number; y: number };
    size: { x: number; y: number };
    speed: number;
    fire_cooldown: number;
    projectile_offset: { x: number; y: number };
    metasprite?: { asset: string; index: number };
    animations?: Partial<Record<"idle" | "fly" | "bank_up" | "bank_down" | "shoot" | "hurt" | "explosion", Omit<AssetcSpriteAnimationExportEntry, "name">>>;
  };
  projectile: {
    size: { x: number; y: number };
    velocity: { x: number; y: number };
    max_active: number;
    metasprite?: { asset: string; index: number };
  };
  enemy_projectile?: {
    size: { x: number; y: number };
    velocity: { x: number; y: number };
    max_active: number;
    metasprite?: { asset: string; index: number };
  };
  waves: EngineExportShmupWave[];
  dialogue_lines: EngineExportDialogueLine[];
  dialogue_ui?: EngineDialogueUiConfig;
  actor_sprites?: EngineExportEmoteAsset[];
  emote_assets?: EngineExportEmoteAsset[];
  composition?: ExportedSceneComposition;
  resources?: ExportedSceneResourceManifest;
  video?: ExportedAdvancedVideoComposition;
  scripts: EngineExportProjectScript[];
}

export interface EngineExportVisualNovelChoice {
  text: string;
  value: number;
  source_locale?: string;
  default_locale?: string;
  translations?: Array<{ locale: string; text: string }>;
  next_scene?: number;
  script?: EngineExportProjectEventCommand[];
  on_select?: EngineExportProjectEventCommand[];
}

export interface EngineExportVisualNovelChoiceGroup {
  line: number;
  variable?: number;
  choices: EngineExportVisualNovelChoice[];
}

export interface EngineExportVisualNovelScene {
  name: string;
  resource_bank_group?: string;
  background?: number;
  line?: number;
  choice_group?: number;
  next_scene?: number;
  on_enter?: EngineExportProjectEventCommand[];
  on_exit?: EngineExportProjectEventCommand[];
  auto_advance?: boolean;
}

export interface EngineExportVisualNovelProject {
  initial_scene: number;
  resource_banks?: "asset_pack";
  save?: {
    enabled: boolean;
    autosave: boolean;
    slot_count: number;
    slot_capacity: number;
    offset: number;
    version: number;
  };
  assets?: {
    bg_palettes?: string[];
    tile_assets?: string[];
    sfx_assets?: Array<string | { asset: string; index?: number }>;
    music_assets?: Array<string | { asset: string; index?: number }>;
    pcm_assets?: Array<string | { asset: string; index?: number }>;
    tracker_assets?: Array<string | { asset: string; index?: number }>;
  };
  backgrounds?: Array<{
    name: string;
    layer: string;
    tilemap: string;
    backdrop_color: number;
  }>;
  scenes: EngineExportVisualNovelScene[];
  dialogue_lines: EngineExportDialogueLine[];
  dialogue_ui?: EngineDialogueUiConfig;
  portrait_assets?: EngineExportPortraitAsset[];
  emote_assets?: EngineExportEmoteAsset[];
  choice_groups?: EngineExportVisualNovelChoiceGroup[];
  scripts: EngineExportProjectScript[];
}

export interface EngineExportMenuItem {
  label: string;
  line: number;
  on_select?: EngineExportProjectEventCommand[];
  target_screen?: number;
  target_item?: number;
  action?: string;
  enabled?: boolean;
  toggle_variable?: number;
  adjust_variable?: number;
  min?: number;
  max?: number;
  step?: number;
  checked_value?: number;
  audio_channel?: "music" | "sfx" | "pcm_music" | "pcm_sfx" | "all";
  requires_save?: boolean;
  save_slot?: number;
  value_labels?: string[];
  detail_lines?: string[];
  binding?: {
    source: "variable" | "inventory" | "stat" | "equipped";
    index: number;
    format: "number" | "count" | "percent" | "on_off";
  };
  click_box?: { x: number; y: number; width: number; height: number };
}

export interface EngineExportMenuActor {
  name: string;
  position: { x: number; y: number };
  metasprite: { asset: string; index: number };
  selected_metasprite?: { asset: string; index: number };
  entry_animation?: "none" | "slide_down";
  entry_offset_y?: number;
  entry_animation_frames?: number;
  role?: "decorative" | "option" | "cursor" | "back";
  menu_item_index?: number;
  cursor_for_menu?: string;
  cursor_follows_option?: boolean;
  selected_only?: boolean;
  cursor_offset_pixels?: { x: number; y: number };
  visibility_variable?: number;
  visibility_value?: number;
  on_init?: EngineExportProjectEventCommand[];
  on_interact?: EngineExportProjectEventCommand[];
  on_update?: EngineExportProjectEventCommand[];
  flip_horizontal?: boolean;
}

export interface EngineExportMenuScreen {
  name: string;
  resource_bank_group?: string;
  hud_preset_id?: string;
  hud_list_rows?: number;
  hud_text_color?: number;
  hud_transparent_text?: boolean;
  title_text_variable?: number;
  background?: number;
  background_animation?: {
    frames: number[];
    frame_duration: number;
    loop: boolean;
  };
  menu_profile?: MenuSceneProfile;
  presentation_mode?: "scene" | "hud" | "both";
  entry_policy?: "title" | "gameplay";
  return_policy?: "title" | "resume";
  suspends_gameplay?: boolean;
  title_overlay_background?: number;
  title_fade_frames?: number;
  title_line?: number;
  screen_type?: "logo" | "title" | "menu";
  title?: string;
  auto_advance_frames?: number;
  allow_skip?: boolean;
  next_screen?: number;
  on_enter?: EngineExportProjectEventCommand[];
  on_exit?: EngineExportProjectEventCommand[];
  on_back?: EngineExportProjectEventCommand[];
  text_input?: {
    variable_index: number;
    max_length: number;
    x: number;
    y: number;
    width: number;
    keyboard_layout: "hidden" | "grid";
    keyboard_x: number;
    keyboard_y: number;
    keyboard_width: number;
    keyboard_height: number;
    keyboard_allow_lowercase: boolean;
    keyboard_surface?: "runtime" | "background";
    keyboard_control_layout?: "bottom" | "side" | "bottom_grid";
    keyboard_controls_x?: number;
    keyboard_controls_y?: number;
    keyboard_controls_width?: number;
    keyboard_controls_height?: number;
  };
  actors?: EngineExportMenuActor[];
  items: EngineExportMenuItem[];
  carousel?: boolean;
}

export interface EngineExportMenuProject {
  start_menu_screen?: number;
  start_menu_presentation?: "scene" | "hud" | "both";
  initial_screen: number;
  menu_profiles?: Array<{
    id: MenuSceneProfile;
    label: string;
    entry_screen: number;
    return_policy: "title" | "resume";
    suspends_gameplay: boolean;
  }>;
  resource_banks?: "asset_pack";
  save?: {
    enabled: boolean;
    autosave: boolean;
    slot_count: number;
    slot_capacity: number;
    offset: number;
    version: number;
  };
  assets?: {
    obj_palettes?: string[];
    tile_assets?: string[];
    sfx_assets?: Array<string | { asset: string; index?: number }>;
    music_assets?: Array<string | { asset: string; index?: number }>;
    pcm_assets?: Array<string | { asset: string; index?: number }>;
    tracker_assets?: Array<string | { asset: string; index?: number }>;
  };
  screens: EngineExportMenuScreen[];
  dialogue_lines: EngineExportDialogueLine[];
  dialogue_ui?: EngineDialogueUiConfig;
  scripts: EngineExportProjectScript[];
}

export interface EngineExportCutsceneStep {
  line: number;
  duration_frames: number;
  auto_advance?: boolean;
  background?: number;
  script?: EngineExportProjectEventCommand[];
  target_scene?: number;
  skippable?: boolean;
  on_skip?: EngineExportProjectEventCommand[];
  branch?: {
    variable: number;
    value: number;
    target_scene: number;
    target_step: number;
  };
  wait_for_dialogue?: boolean;
  resource_bank_group?: string;
  actor_motions?: Array<{
    actor_index: number;
    from_position: { x: number; y: number };
    to_position: { x: number; y: number };
    duration_frames: number;
  }>;
}

export interface EngineExportCutsceneActor {
  name: string;
  position: { x: number; y: number };
  metasprite: { asset: string; index: number };
}

export interface EngineExportCutsceneScene {
  on_enter?: EngineExportProjectEventCommand[];
  on_exit?: EngineExportProjectEventCommand[];
  name: string;
  resource_bank_group?: string;
  background?: number;
  next_scene?: number;
  actors?: EngineExportCutsceneActor[];
  steps: EngineExportCutsceneStep[];
}

export interface EngineExportCutsceneProject {
  initial_scene: number;
  resource_banks?: "asset_pack";
  save?: {
    enabled: boolean;
    autosave: boolean;
    slot_count: number;
    slot_capacity: number;
    offset: number;
    version: number;
  };
  assets?: {
    bg_palettes?: string[];
    obj_palettes?: string[];
    tile_assets?: string[];
    sfx_assets?: Array<string | { asset: string; index?: number }>;
    music_assets?: Array<string | { asset: string; index?: number }>;
    pcm_assets?: Array<string | { asset: string; index?: number }>;
    tracker_assets?: Array<string | { asset: string; index?: number }>;
  };
  backgrounds?: Array<{
    name: string;
    layer: string;
    tilemap: string;
    backdrop_color: number;
  }>;
  scenes: EngineExportCutsceneScene[];
  dialogue_lines: EngineExportDialogueLine[];
  dialogue_ui?: EngineDialogueUiConfig;
  portrait_assets?: EngineExportPortraitAsset[];
  scripts: EngineExportProjectScript[];
}

export interface EngineExportWorldMapNode {
  name: string;
  label?: string;
  position: { x: number; y: number };
  resource_bank_group?: string;
  line?: number;
  connections: Array<string | number>;
  target_level?: number;
  unlocked?: boolean;
  required_variable?: number;
  required_value?: number;
  hide_when_locked?: boolean;
  on_select?: EngineExportProjectEventCommand[];
}

export interface EngineExportWorldMapProject {
  initial_node: number;
  scene_name?: string;
  on_enter?: EngineExportProjectEventCommand[];
  on_cancel?: EngineExportProjectEventCommand[];
  on_start?: EngineExportProjectEventCommand[];
  journey_frames?: number;
  cursor_affine?: boolean;
  embedded_nodes?: boolean;
  save?: {
    enabled: boolean;
    autosave: boolean;
    slot_count: number;
    slot_capacity: number;
    offset: number;
    version: number;
  };
  assets?: EngineExportTopdownProject["assets"] & { sprite_assets?: string[] };
  resource_banks?: "asset_pack";
  background?: number;
  backgrounds?: Array<{
    layer: "bg2";
    tilemap: string;
    source_tiles?: string;
    backdrop_color?: number;
    backdrop_from_tilemap_palette?: boolean;
  }>;
  cursor?: {
    metasprite: { asset: string; index: number };
  };
  marker?: {
    metasprite: { asset: string; index: number };
  };
  nodes: EngineExportWorldMapNode[];
  dialogue_lines: EngineExportDialogueLine[];
  dialogue_ui?: EngineDialogueUiConfig;
  scripts: EngineExportProjectScript[];
}

export interface EngineExportRuntimeContract {
  scene_type: string;
  adapter:
    | "topdown_project"
    | "platformer_project"
    | "isometric_project"
    | "dungeon_crawler_project"
    | "racing_project"
    | "battle_rpg_project"
    | "luta_project"
    | "point_click_project"
    | "shmup_project"
    | "visual_novel_project"
    | "menu_project"
    | "cutscene_project"
    | "world_map_project"
    | "mixed_runtime_project";
  adapter_status: "preview_profile_with_topdown_rom_adapter" | "native";
  rooms: Array<{
    name: string;
    scene_type: string;
    runtime_profile: string;
    palette_family_id?: string;
    feature_modules?: SceneFeatureModuleConfig[];
  }>;
}

export interface EngineExportCapability {
  id: string;
  label: string;
  scene_profiles: string[];
  status: {
    available: boolean;
    enabled: boolean;
    required: boolean;
    verified: boolean;
  };
  assets: Array<{
    kind: string;
    required: boolean;
    reason: string;
  }>;
  editor_tools: string[];
  budget: ScenePhysicalBudget;
  fallback: string;
  verification: {
    tests: string[];
    evidence: string[];
  };
  settings: Record<string, string | number | boolean>;
  engine_features: string[];
}

export interface EngineExportCapabilityManifest {
  schema: 1;
  registry: "gba-studio-scene-capabilities";
  scenes: Array<{
    name: string;
    scene_type: string;
    runtime_profile: string;
    profile_budget: ScenePhysicalBudget;
    capabilities: EngineExportCapability[];
    preflight: ScenePreflightReport;
    issues: Array<{
      code: string;
      module?: string;
      field?: string;
      message: string;
    }>;
  }>;
}

export interface EngineExportSceneContract {
  name: string;
  scene_type: string;
  runtime_profile: string;
  composition: ExportedSceneComposition;
  resources: ExportedSceneResourceManifest;
  metatiles?: ExportedSceneMetatileAuthoring;
}

export interface EngineExportPaletteFamily {
  id: string;
  name: string;
  background_asset?: string;
  objects_asset?: string;
}

export interface EngineExportAssetPack {
  physical_budget?: EngineExportAudioPhysicalBudgetPlan;
  capability_assets?: Array<{
    scene: string;
    capability: SceneTacticalCapabilityID;
    references: string[];
  }>;
  resident_sets?: Array<{
    id: string;
    room: string;
    groups: string[];
    max_resident_groups: number;
  }>;
  assets: Array<{
    id: string;
    name: string;
    kind: "audio" | "palette" | "obj" | "bg" | "indexed_bg" | "paged_bg" | "affine_bg" | "bitmap3" | "bitmap4" | "bitmap5";
    audio_json?: string;
    png?: string;
    palette_slot?: "background" | "objects";
    palette_values?: number[];
    sprite_width?: number;
    sprite_height?: number;
    background_bpp?: 4 | 8;
    compression_policy?: AssetcCompressionPolicy;
    header: string;
    symbol: string;
  }>;
}

export interface EngineExportProjectContract {
  schema: 1;
  backend: "gbastudio_engine";
  kind: "topdown" | "platformer" | "isometric" | "dungeon_crawler" | "racing" | "battle_rpg" | "luta" | "point_click" | "shmup" | "visual_novel" | "menu" | "cutscene" | "world_map" | "mixed";
  runtime_profile: "topdown" | "platformer" | "isometric" | "dungeon_crawler" | "racing" | "battle_rpg" | "luta" | "point_click" | "shmup" | "visual_novel" | "menu" | "cutscene" | "world_map" | "mixed";
  runtime_contract: EngineExportRuntimeContract;
  runtime_capabilities: ProjectRuntimeCapabilityManifest;
  capability_manifest: EngineExportCapabilityManifest;
  hardware_contract: GbaHardwareContract;
  scene_contracts: EngineExportSceneContract[];
  palette_families?: EngineExportPaletteFamily[];
  template_dir: string;
  entry: "main.cpp";
  project_data:
    | "gbastudio_project_data.hpp"
    | "platformer_project_data.hpp"
    | "isometric_project_data.hpp"
    | "dungeon_crawler_project_data.hpp"
    | "racing_project_data.hpp"
    | "battle_rpg_project_data.hpp"
    | "luta_project_data.hpp"
    | "point_click_project_data.hpp"
    | "shmup_project_data.hpp"
    | "visual_novel_project_data.hpp"
    | "menu_project_data.hpp"
    | "cutscene_project_data.hpp"
    | "world_map_project_data.hpp"
    | "mixed_project_data.hpp";
  generated_assets: string[];
  copied_assets: EngineProjectExportAsset[];
  asset_pack?: EngineExportAssetPack;
  build: {
    target: string;
    make_target: "all";
    incremental_cache?: boolean;
    sources?: string[];
    rom_title: string;
    game_code: string;
    maker_code: string;
    rom_version: string;
  };
  requires: {
    engine_pack: string;
    features: string[];
  };
  topdown_project?: EngineExportTopdownProject;
  platformer_project?: EngineExportPlatformerProject;
  isometric_project?: EngineExportIsometricProject;
  dungeon_crawler_project?: EngineExportDungeonCrawlerProject;
  racing_project?: EngineExportRacingProject;
  battle_rpg_project?: EngineExportBattleRpgProject;
  luta_project?: EngineExportLutaProject;
  point_click_project?: EngineExportPointClickProject;
  shmup_project?: EngineExportShmupProject;
  visual_novel_project?: EngineExportVisualNovelProject;
  menu_project?: EngineExportMenuProject;
  cutscene_project?: EngineExportCutsceneProject;
  world_map_project?: EngineExportWorldMapProject;
  runtime_dispatch?: {
    initial_runtime: MixedRuntimeKind;
    initial_room: number;
    initial_scene?: string;
    runtimes: MixedRuntimeKind[];
    save: EngineProjectSaveConfig;
  };
  export_warnings?: string[];
  export_notices?: string[];
  plugin_data_tables?: ReturnType<typeof pluginDataTablesForExport>;
  advanced_tools?: AdvancedToolsExportContract;
  structural_fixture?: ExportedCompleteProjectFixtureManifest;
}

export interface BuildEngineExportProjectContractOptions {
  enginePackPath?: string;
  enginePackVersion?: string;
  pluginRegistry?: ProjectPluginRegistry;
  developmentStartScene?: DevelopmentSceneLaunch;
  structuralFixture?: CompleteProjectFixtureManifest;
}

export interface PreparedEngineSchemaExport {
  target: string;
  contract: EngineExportProjectContract;
  assets: EngineProjectExportAsset[];
  audioPack?: AssetcAudioPackGeneration;
}

export interface PreparedEngineProjectExport {
  generated?: PreparedEngineSchemaExport;
  error?: string;
}

const defaultEnginePackVersion = "2.26.0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function child(source: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  return isRecord(source?.[key]) ? source[key] : undefined;
}

function projectArray(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringField(source: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const value = source?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function nullableStringField(source: Record<string, unknown> | undefined, key: string): string {
  const value = source?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function integerField(source: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function pixelPositionField(source: Record<string, unknown> | undefined): { x: number; y: number } | undefined {
  const value = child(source, "menuPositionPixels") ?? child(source, "menu_position_pixels");
  if (!value) return undefined;
  return {
    x: integerField(value, "x", 0),
    y: integerField(value, "y", 0)
  };
}

function numberOrNullLocal(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function connectionAreaField(
  connection: Record<string, unknown>,
  key: "exit" | "entry",
  fallback: RoomConnectionArea
): RoomConnectionArea {
  const area = child(connection, key);
  if (!area) return fallback;
  return {
    x: integerField(area, "x", fallback.x),
    y: integerField(area, "y", fallback.y),
    width: integerField(area, "width", fallback.width),
    height: integerField(area, "height", fallback.height)
  };
}

function settings(data: GBAProjectData): Record<string, unknown> | undefined {
  return isRecord(data.settings) ? data.settings : undefined;
}

function normalizeIdentifier(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function videoBitmapSymbol(assetName: string): string {
  return `${normalizeIdentifier(assetName.replace(/\.[a-z0-9]+$/i, ""), "bitmap")}_bitmap`;
}

function videoAffineSymbol(assetName: string): string {
  return `${normalizeIdentifier(assetName.replace(/\.[a-z0-9]+$/i, ""), "affine")}_affine`;
}

function buildExportAdvancedVideoComposition(data: GBAProjectData): ExportedAdvancedVideoComposition {
  const composition = exportAdvancedVideoComposition(deriveAdvancedVideoComposition(child(settings(data), "backgrounds")));
  return {
    ...composition,
    affine: composition.affine ? {
      ...composition.affine,
      asset: composition.affine.asset ? videoAffineSymbol(composition.affine.asset) : null
    } : null,
    bitmap: composition.bitmap ? { ...composition.bitmap, asset: videoBitmapSymbol(composition.bitmap.asset) } : null
  };
}

function exportedDefaultRoomVideoComposition(): ExportedAdvancedVideoComposition {
  return {
    display_mode: 0,
    affine: null,
    bitmap: null
  };
}

function roomAffinePresentation(room: Record<string, unknown>) {
  const runtimeConfig = child(child(room, "runtime"), "config");
  return normalizeAffineScenePresentation(runtimeConfig?.affine);
}

function roomCapabilityManifest(room: Record<string, unknown>) {
  const runtimeConfig = child(child(room, "runtime"), "config");
  return resolveSceneCapabilityManifest(
    roomSceneType(room),
    runtimeConfig?.modules,
    undefined,
    runtimeConfig?.capabilities,
    runtimeConfig?.tacticalCapabilities
  );
}

function roomHasEnabledCapability(room: Record<string, unknown>, capabilityID: string): boolean {
  return roomCapabilityManifest(room).capabilities.some((capability) => (
    capability.id === capabilityID && capability.status.enabled
  ));
}

function saveUiProfileForRoom(room: Record<string, unknown>): EngineSaveUiProfileOverride | undefined {
  const capability = roomCapabilityManifest(room).capabilities.find((candidate) => candidate.id === "save_ui_profile");
  if (!capability?.status.enabled) return undefined;
  return {
    profileId: typeof capability.settings.profileId === "string" && capability.settings.profileId.trim().length > 0
      ? capability.settings.profileId.trim()
      : "default",
    customLabels: capability.settings.customLabels === true
  };
}

function buildProjectSaveConfig(data: GBAProjectData): EngineProjectSaveConfig {
  const rooms = projectRooms(data);
  const room = rooms[startRoomIndex(data, rooms)] ?? rooms[0];
  return buildEngineProjectSaveConfig(child(settings(data), "save"), room ? saveUiProfileForRoom(room) : undefined);
}

function roomAffineObjForExport(room: Record<string, unknown>): EngineExportAffineObj | undefined {
  const runtimeConfig = child(child(room, "runtime"), "config");
  const capability = roomCapabilityManifest(room).capabilities.find((candidate) => candidate.id === "affine_obj");
  if (!capability?.status.enabled) return undefined;
  const settings = capability.settings;
  const authoredKeyframeConfig = runtimeConfig && (
    isRecord(runtimeConfig.affineObj) ? runtimeConfig.affineObj :
    isRecord(runtimeConfig.affine_obj) ? runtimeConfig.affine_obj : undefined
  );
  const rawKeyframes = authoredKeyframeConfig?.keyframes;
  let keyframes: EngineExportAffineObj["keyframes"] | undefined;
  if (rawKeyframes !== undefined) {
    if (!Array.isArray(rawKeyframes)) {
      throw new Error("runtime.config.affineObj.keyframes precisa ser uma lista.");
    }
    let previousFrame = -1;
    keyframes = rawKeyframes.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new Error(`runtime.config.affineObj.keyframes[${index}] precisa ser um objeto.`);
      }
      const frame = entry.frame;
      if (typeof frame !== "number" || !Number.isInteger(frame) || frame < 0 || frame > 0xFFFFFFFF || frame <= previousFrame) {
        throw new Error(`runtime.config.affineObj.keyframes[${index}].frame deve ser inteiro crescente entre 0 e 4294967295.`);
      }
      previousFrame = frame;
      const matrix = [entry.pa, entry.pb, entry.pc, entry.pd];
      if (matrix.some((value) => typeof value !== "number" || !Number.isInteger(value) || value < -32768 || value > 32767)) {
        throw new Error(`runtime.config.affineObj.keyframes[${index}] precisa declarar pa, pb, pc e pd como inteiros assinados de 16 bits.`);
      }
      return {
        frame,
        pa: entry.pa as number,
        pb: entry.pb as number,
        pc: entry.pc as number,
        pd: entry.pd as number
      };
    });
  }
  const easingValue = authoredKeyframeConfig?.easing;
  const easing = easingValue === undefined ? undefined :
    typeof easingValue === "string" && ["linear", "ease_in", "ease_out", "ease_in_out"].includes(easingValue)
      ? easingValue as EngineExportAffineObj["easing"]
      : (() => {
        throw new Error("runtime.config.affineObj.easing deve ser linear, ease_in, ease_out ou ease_in_out.");
      })();
  const presentation = normalizeAffineScenePresentation({
    ...roomAffinePresentation(room),
    enabled: true,
    scaleX: typeof settings.scaleX === "number" ? settings.scaleX : undefined,
    scaleY: typeof settings.scaleY === "number" ? settings.scaleY : undefined,
    rotationDegrees: typeof settings.rotationDegrees === "number" ? settings.rotationDegrees : undefined
  });
  const matrix = affineMatrixForScenePresentation(presentation);
  return {
    enabled: true,
    double_size: settings.doubleSize === true,
    matrix_index: Math.max(0, Math.min(31, Math.floor(typeof settings.matrixIndex === "number" ? settings.matrixIndex : 0))),
    pa: matrix.pa,
    pb: matrix.pb,
    pc: matrix.pc,
    pd: matrix.pd,
    ...(easing !== undefined ? { easing } : {}),
    ...(keyframes !== undefined ? { keyframes } : {})
  };
}

function roomSceneComposition(room: Record<string, unknown>): ReturnType<typeof normalizeSceneComposition> {
  const runtimeConfig = child(child(room, "runtime"), "config");
  if (runtimeConfig && Object.hasOwn(runtimeConfig, "composition")) {
    return normalizeSceneComposition(runtimeConfig.composition);
  }
  return sceneCompositionFromAffinePresentation(runtimeConfig?.affine);
}

function roomSceneCompositionSource(room: Record<string, unknown>): unknown {
  const runtimeConfig = child(child(room, "runtime"), "config");
  if (runtimeConfig && Object.hasOwn(runtimeConfig, "composition")) return runtimeConfig.composition;
  return roomSceneComposition(room);
}

function roomSceneResources(room: Record<string, unknown>): ExportedSceneResourceManifest {
  const runtimeConfig = child(child(room, "runtime"), "config");
  return exportSceneResourceManifest(runtimeConfig?.resources);
}

function roomMetatileAuthoringSource(room: Record<string, unknown>): unknown {
  const runtimeConfig = child(child(room, "runtime"), "config");
  return runtimeConfig?.metatiles;
}

function roomMetatileAuthoringExport(
  room: Record<string, unknown>,
  width: number,
  height: number
): ExportedSceneMetatileAuthoring | null {
  const source = roomMetatileAuthoringSource(room);
  if (source === undefined || source === null) return null;
  const resolution = resolveSceneMetatileAuthoring(source, width, height);
  if (resolution.config.enabled && !roomHasEnabledCapability(room, "metatiles")) {
    throw new Error(`Autoria de metatiles na cena ${roomName(room, 0)} exige a capability metatiles habilitada explicitamente.`);
  }
  if (!roomHasEnabledCapability(room, "metatiles")) return null;
  if (resolution.issues.length > 0) {
    throw new Error(`Autoria de metatiles inválida na cena ${roomName(room, 0)}: ${resolution.issues.map((entry) => entry.message).join(" ")}`);
  }
  return exportSceneMetatileAuthoring(source, width, height);
}

function buildSceneContracts(data: GBAProjectData): EngineExportSceneContract[] {
  return projectRooms(data).map((room, index) => {
    const sceneType = roomSceneType(room);
    const composition = roomSceneComposition(room);
    const compositionIssues = sceneCompositionIssues(roomSceneCompositionSource(room), sceneType);
    if (compositionIssues.length > 0) {
      throw new Error(`Composição inválida na cena ${roomName(room, index)}: ${compositionIssues.map((entry) => entry.message).join(" ")}`);
    }
    if (composition.effects.hblank.enabled && !roomHasEnabledCapability(room, "hblank_timeline")) {
      throw new Error(`HBlank/HDMA na cena ${roomName(room, index)} exige a capability hblank_timeline habilitada explicitamente.`);
    }
    const runtimeConfig = child(child(room, "runtime"), "config");
    const resourceIssues = sceneResourceManifestIssues(runtimeConfig?.resources);
    if (resourceIssues.length > 0) {
      throw new Error(`Manifesto de recursos inválido na cena ${roomName(room, index)}: ${resourceIssues.map((entry) => entry.message).join(" ")}`);
    }
    const metatileAuthoring = roomMetatileAuthoringExport(
      room,
      integerField(room, "width", 20),
      integerField(room, "height", 18)
    );
    return {
      name: roomName(room, index),
      scene_type: sceneType,
      runtime_profile: runtimeProfileForSceneType(sceneType),
      composition: exportSceneComposition(composition),
      resources: roomSceneResources(room),
      ...(metatileAuthoring ? { metatiles: metatileAuthoring } : {})
    };
  });
}

function projectUsesRoomAffine(data: GBAProjectData): boolean {
  return projectRooms(data).some((room) => {
    const composition = roomSceneComposition(room);
    const hasAffineLayer = composition.layers.some((layer) => layer.enabled && layer.kind === "affine_bg");
    if (composition.enabled && (composition.mode === "affine" || hasAffineLayer)) return true;
    return roomAffinePresentation(room).enabled;
  });
}

function roomAffineAssetRecord(data: GBAProjectData, assetId: string): Record<string, unknown> | undefined {
  return projectArray(data, "assets").find((asset) => (
    stringField(asset, "name", "") === assetId || stringField(asset, "id", "") === assetId
  ));
}

function affineSourceSize(asset: Record<string, unknown> | undefined): AffineSceneSourceSize | undefined {
  const metadata = child(asset, "metadata");
  const width = integerField(metadata, "width", 0);
  const height = integerField(metadata, "height", 0);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function buildRoomVideoComposition(
  data: GBAProjectData,
  room: Record<string, unknown>,
  tilesetPack: AssetcTilesetPackGeneration | null
): ExportedAdvancedVideoComposition {
  const sceneComposition = roomSceneComposition(room);
  if (sceneComposition.enabled) {
    const issues = sceneCompositionIssues(roomSceneCompositionSource(room), roomSceneType(room));
    if (issues.length > 0) {
      throw new Error(`Composição inválida na cena ${roomName(room, 0)}: ${issues.map((entry) => entry.message).join(" ")}`);
    }
    const exported = exportSceneComposition(sceneComposition);
    const affineLayer = sceneComposition.layers.find((layer) => layer.enabled && layer.kind === "affine_bg");
    const bitmapLayer = sceneComposition.layers.find((layer) => layer.enabled && layer.kind === "bitmap");
    if (affineLayer) {
      const sourceAsset = roomAffineAssetRecord(data, affineLayer.assetId);
      const sourceName = sourceAsset ? stringField(sourceAsset, "name", affineLayer.assetId) : affineLayer.assetId;
      const packedAsset = tilesetPack?.assetsBySheet[sourceName] ?? tilesetPack?.assetsBySheet[affineLayer.assetId];
      if (!packedAsset || packedAsset.kind !== "affine_bg") {
        throw new Error(`O asset Affine ${affineLayer.assetId} da cena ${roomName(room, 0)} não foi preparado como affine_bg.`);
      }
      const affine = exportAffineScenePresentation(
        {
          enabled: true,
          assetId: sourceName,
          layer: affineLayer.layer === "BG3" ? "BG3" : "BG2",
          scaleX: affineLayer.affine?.scaleX ?? 1,
          scaleY: affineLayer.affine?.scaleY ?? 1,
          rotationDegrees: affineLayer.affine?.rotationDegrees ?? 0,
          pivotX: affineLayer.affine?.pivotX ?? 120,
          pivotY: affineLayer.affine?.pivotY ?? 80,
          wrap: affineLayer.affine?.wrap ?? true,
          role: "decorative"
        },
        () => packedAsset.name,
        affineSourceSize(sourceAsset)
      );
      return { display_mode: exported.display_mode, affine, bitmap: null };
    }
    if (bitmapLayer) {
      const sourceAsset = roomAffineAssetRecord(data, bitmapLayer.assetId);
      const sourceName = sourceAsset ? stringField(sourceAsset, "name", bitmapLayer.assetId) : bitmapLayer.assetId;
      const dimensions = exported.display_mode === 5 ? { width: 160, height: 128 } : { width: 240, height: 160 };
      return {
        display_mode: exported.display_mode,
        affine: null,
        bitmap: {
          asset: videoBitmapSymbol(sourceName),
          page: exported.display_mode === 3 ? 0 : bitmapLayer.bitmapPage,
          ...dimensions,
          color_depth: exported.display_mode === 4 ? 8 : 15
        }
      };
    }
    return { display_mode: exported.display_mode, affine: null, bitmap: null };
  }
  const presentation = roomAffinePresentation(room);
  if (!presentation.enabled) return exportedDefaultRoomVideoComposition();

  if (!presentation.assetId) {
    throw new Error(`A cena ${roomName(room, 0)} habilita Affine sem declarar assetId.`);
  }
  const sourceAsset = roomAffineAssetRecord(data, presentation.assetId);
  const sourceName = sourceAsset ? stringField(sourceAsset, "name", presentation.assetId) : presentation.assetId;
  const packedAsset = tilesetPack?.assetsBySheet[sourceName]
    ?? tilesetPack?.assetsBySheet[presentation.assetId];
  if (!packedAsset || packedAsset.kind !== "affine_bg") {
    throw new Error(`O asset Affine ${presentation.assetId} da cena ${roomName(room, 0)} não foi preparado como affine_bg.`);
  }

  const affine = exportAffineScenePresentation(
    { ...presentation, assetId: sourceName },
    () => packedAsset.name,
    affineSourceSize(sourceAsset)
  );
  if (!affine) return exportedDefaultRoomVideoComposition();
  return {
    display_mode: presentation.layer === "BG3" ? 2 : 1,
    affine,
    bitmap: null
  };
}

function assetOutputFolder(kind: string): string {
  const normalized = normalizeIdentifier(kind, "asset");
  if (["audio", "music", "musica", "m_sica", "sfx", "sound", "efeito"].includes(normalized)) return "audio";
  if (["sprite", "sprites", "portrait", "portraits", "emote", "emotes"].includes(normalized)) return "sprite";
  if (["background", "tilemap", "tileset", "image", "imagem"].includes(normalized)) return "image";
  return normalized;
}

function projectTitle(data: GBAProjectData): string {
  return stringField(child(settings(data), "general"), "gameTitle", stringField(data, "name", "Projeto sem nome"));
}

function projectTarget(data: GBAProjectData): string {
  const build = child(settings(data), "build");
  const romFileName = stringField(build, "romFileName", "");
  return normalizeIdentifier(romFileName || projectTitle(data), "game");
}

function gbaHeaderText(value: string, length: number, fallback: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 _-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, length);
  return normalized || fallback.slice(0, length);
}

function gbaHeaderCode(value: string, length: number, fallback: string): string {
  const normalized = gbaHeaderText(value, length, "").replace(/[^A-Z0-9]/g, "");
  return normalized
    ? normalized.slice(0, length).padEnd(length, "X")
    : fallback.slice(0, length).padEnd(length, "X");
}

function gbaRomHeaderBuild(data: GBAProjectData): Pick<EngineExportProjectContract["build"], "rom_title" | "game_code" | "maker_code" | "rom_version"> {
  const build = child(settings(data), "build");
  const revision = Math.max(0, Math.min(255, integerField(build, "romVersion", 0)));
  return {
    rom_title: gbaHeaderText(projectTitle(data), 12, "GBS_GAME"),
    game_code: gbaHeaderCode(stringField(build, "gameCode", "GBS0"), 4, "GBS0"),
    maker_code: gbaHeaderCode(stringField(build, "makerCode", "00"), 2, "00"),
    rom_version: revision.toString(16).toUpperCase().padStart(2, "0")
  };
}

function projectRooms(data: GBAProjectData): Record<string, unknown>[] {
  const rooms = projectArray(data, "scenas");
  if (rooms.length > 0) return rooms;
  const persistedRooms = projectArray(data, "rooms");
  if (persistedRooms.length > 0) return persistedRooms;
  throw new Error("Contrato de exportacao Engine requer scenas[] ou rooms[] no formato atual.");
}

function projectWithIndependentTacticalResidency(data: GBAProjectData): GBAProjectData {
  const scenas = projectArray(data, "scenas");
  const rooms = scenas.length > 0 ? scenas : projectArray(data, "rooms");
  if (rooms.length < 2) return data;
  const presentationFor = (room: Record<string, unknown>): Record<string, unknown> | undefined => {
    const runtime = child(room, "runtime");
    return nullableStringField(runtime, "type") === "isometric"
      ? child(child(runtime, "config"), "tacticalPresentation") : undefined;
  };
  const groupsFor = (presentation: Record<string, unknown> | undefined): string[] => {
    const groups = child(presentation, "surfaceResidency")?.exclusiveBankGroups;
    return Array.isArray(groups) ? groups.filter((group): group is string => typeof group === "string") : [];
  };
  const reserved = new Set(["global", ...rooms.flatMap((room, index) => [
    engineSceneResourceBankGroupName(room, index), ...groupsFor(presentationFor(room))
  ])]);
  const claimed = new Set<string>();
  let changed = false;
  const normalizedRooms = rooms.map((room, index) => {
    const presentation = presentationFor(room);
    const groups = groupsFor(presentation);
    const remapped = new Map<string, string>();
    for (const group of new Set(groups)) {
      if (claimed.has(group)) {
        const prefix = `${engineSceneResourceBankGroupName(room, index)}_${group}`;
        let name = prefix;
        for (let suffix = 2; reserved.has(name); suffix += 1) name = `${prefix}_${suffix}`;
        reserved.add(name);
        remapped.set(group, name);
      }
      claimed.add(group);
    }
    if (!presentation || remapped.size === 0) return room;
    changed = true;
    const runtime = child(room, "runtime")!;
    const config = child(runtime, "config")!;
    // Only the export copy changes. Each room keeps an exclusive resident set,
    // while asset references still share their authored source pixels.
    return { ...room, runtime: { ...runtime, config: { ...config, tacticalPresentation: {
      ...presentation,
      surfacePages: Array.isArray(presentation.surfacePages) ? presentation.surfacePages.map(page => isRecord(page) ? ({
        ...page, bankGroup: remapped.get(nullableStringField(page, "bankGroup")) ?? page.bankGroup
      }) : page) : presentation.surfacePages,
      surfaceResidency: { ...child(presentation, "surfaceResidency"),
        exclusiveBankGroups: (child(presentation, "surfaceResidency")!.exclusiveBankGroups as unknown[])
          .map(group => typeof group === "string" ? remapped.get(group) ?? group : group) }
    } } } };
  });
  if (!changed) return data;
  const byName = new Map(normalizedRooms.map((room, index) => [roomName(room, index), room]));
  const next = { ...data };
  for (const key of ["scenas", "rooms"] as const) {
    if (Array.isArray(data[key])) next[key] = projectArray(data, key).map((room, index) => ({
      ...room, runtime: byName.get(roomName(room, index))?.runtime ?? room.runtime
    }));
  }
  if (isRecord(data.scena)) next.scena = { ...data.scena,
    runtime: byName.get(roomName(data.scena, 0))?.runtime ?? data.scena.runtime };
  return next;
}

function roomName(room: Record<string, unknown>, index: number): string {
  return stringField(room, "name", `room_${index + 1}`);
}

function campaignRoomForEvent(
  data: GBAProjectData,
  event: Record<string, unknown>
): Record<string, unknown> | undefined {
  const reference = nullableStringField(event, "roomName") || nullableStringField(event, "sceneName");
  if (!reference) return undefined;
  const rooms = projectRooms(data);
  const index = roomIndexByName(rooms, reference);
  return index >= 0 ? rooms[index] : undefined;
}

function eventSceneBindings(data: GBAProjectData, eventName: string): Set<string> {
  const scenes = new Set<string>();
  const matches = (value: unknown): boolean => value === eventName;

  for (const room of projectRooms(data)) {
    const bindings = isRecord(room.eventBindings) ? Object.values(room.eventBindings) : [];
    if (bindings.some(matches)) scenes.add(roomName(room, 0));
  }

  for (const actor of projectArray(data, "actors")) {
    const bindings = normalizeGBAEntityDocument(actor, "actor").eventBindings;
    if (Object.values(bindings).some(matches)) scenes.add(entitySceneName(actor, "actor"));
  }

  for (const trigger of projectArray(data, "triggers")) {
    const bindings = normalizeGBAEntityDocument(trigger, "trigger").eventBindings;
    if (Object.values(bindings).some(matches)) scenes.add(entitySceneName(trigger, "trigger"));
  }

  return scenes;
}

function campaignVariableKey(
  data: GBAProjectData,
  campaignRoom: Record<string, unknown>
): string {
  const campaign = normalizeGBASceneDocument(campaignRoom).campaign;
  const reference = campaign?.completionVariable?.trim() ?? "";
  if (!campaign || !reference) {
    throw new Error(`Cena ${roomName(campaignRoom, 0)} nao possui variavel de conclusao de campanha.`);
  }
  const variable = projectArray(data, "variables").find((candidate) => (
    ["name", "id", "displayName", "path"].some((key) => nullableStringField(candidate, key) === reference)
  ));
  const key = variable ? nullableStringField(variable, "name") : "";
  if (!key) throw new Error(`Campanha referencia variavel inexistente: ${reference}`);
  return key;
}

function entitySceneName(entity: Record<string, unknown>, kind: "actor" | "trigger", index = 0): string {
  return normalizeGBAEntityDocument(entity, kind, index).sceneName;
}

function entityPosition(
  entity: Record<string, unknown>,
  kind: "actor" | "trigger",
  fallback = { x: 0, y: 0 },
  index = 0
): { x: number; y: number } {
  const document = normalizeGBAEntityDocument(entity, kind, index);
  const position = isRecord(entity.position) ? entity.position : {};
  return {
    x: typeof entity.x === "number" && Number.isFinite(entity.x)
      ? document.position.x
      : typeof position.x === "number" && Number.isFinite(position.x) ? document.position.x : fallback.x,
    y: typeof entity.y === "number" && Number.isFinite(entity.y)
      ? document.position.y
      : typeof position.y === "number" && Number.isFinite(position.y) ? document.position.y : fallback.y
  };
}

function entityBounds(
  entity: Record<string, unknown>,
  kind: "actor" | "trigger",
  fallback = { x: 0, y: 0, width: 1, height: 1 },
  index = 0
): { x: number; y: number; width: number; height: number } {
  const document = normalizeGBAEntityDocument(entity, kind, index);
  const position = entityPosition(entity, kind, { x: fallback.x, y: fallback.y }, index);
  const size = isRecord(entity.size) ? entity.size : {};
  return {
    x: position.x,
    y: position.y,
    width: typeof entity.width === "number" && Number.isFinite(entity.width)
      ? document.bounds.width
      : typeof size.width === "number" && Number.isFinite(size.width) ? document.bounds.width : fallback.width,
    height: typeof entity.height === "number" && Number.isFinite(entity.height)
      ? document.bounds.height
      : typeof size.height === "number" && Number.isFinite(size.height) ? document.bounds.height : fallback.height
  };
}

function roomSceneType(room: Record<string, unknown>): string {
  return normalizeSceneTypeId(normalizeGBASceneDocument(room).sceneType, "topdown");
}

function runtimeProfileForSceneType(sceneType: string): string {
  return resolveSceneRuntimeExport(sceneType).roomRuntimeProfile;
}

function roomFeatureModules(room: Record<string, unknown>): SceneFeatureModuleConfig[] | undefined {
  const runtime = child(room, "runtime");
  const config = child(runtime, "config");
  if (!config || !Object.hasOwn(config, "modules")) return undefined;
  return resolveSceneFeatureModules(roomSceneType(room), config.modules).modules.filter((module) => module.enabled);
}

function exportSceneCapability(capability: ResolvedSceneCapability): EngineExportCapability {
  return {
    id: capability.id,
    label: capability.label,
    scene_profiles: [...capability.sceneProfiles],
    status: { ...capability.status },
    assets: capability.assets.map((asset) => ({ ...asset })),
    editor_tools: [...capability.editorTools],
    budget: { ...capability.budget },
    fallback: capability.fallback,
    verification: {
      tests: [...capability.verification.tests],
      evidence: [...capability.verification.evidence]
    },
    settings: { ...capability.settings },
    engine_features: [...capability.engineFeatures]
  };
}

function buildSceneCapabilityManifest(data: GBAProjectData): EngineExportCapabilityManifest {
  return {
    schema: 1,
    registry: "gba-studio-scene-capabilities",
    scenes: projectRooms(data).map((room, index) => {
      const sceneType = roomSceneType(room);
      const runtimeConfig = child(child(room, "runtime"), "config");
      const configuredModules = runtimeConfig && Object.hasOwn(runtimeConfig, "modules")
        ? runtimeConfig.modules
        : undefined;
      const configuredCapabilities = runtimeConfig && Object.hasOwn(runtimeConfig, "capabilities")
        ? runtimeConfig.capabilities
        : undefined;
      const configuredTacticalCapabilities = runtimeConfig && Object.hasOwn(runtimeConfig, "tacticalCapabilities")
        ? runtimeConfig.tacticalCapabilities
        : undefined;
      const manifest = resolveSceneCapabilityManifest(
        sceneType,
        configuredModules,
        undefined,
        configuredCapabilities,
        configuredTacticalCapabilities
      );
      return {
        name: roomName(room, index),
        scene_type: sceneType,
        runtime_profile: runtimeProfileForSceneType(sceneType),
        profile_budget: { ...manifest.profileBudget },
        capabilities: manifest.capabilities.map(exportSceneCapability),
        preflight: buildScenePreflightReport(data, roomName(room, index)),
        issues: manifest.issues.map((issue) => ({
          code: issue.code,
          ...(issue.module ? { module: issue.module } : {}),
          ...(issue.field ? { field: String(issue.field) } : {}),
          message: issue.message
        }))
      };
    })
  };
}

function projectEventCommandStrings(data: GBAProjectData): string[] {
  return projectArray(data, "events").flatMap((event) => {
    const steps = Array.isArray(event.commands)
      ? event.commands
      : Array.isArray(event.steps) ? event.steps : [];
    return steps.flatMap((step) => {
      if (typeof step === "string") return [step];
      return isRecord(step) && typeof step.command === "string" ? [step.command] : [];
    });
  });
}

function capabilityScenes(
  manifest: EngineExportCapabilityManifest,
  capabilityID: string
): EngineExportCapabilityManifest["scenes"] {
  return manifest.scenes.filter((scene) => scene.capabilities.some((capability) => (
    capability.id === capabilityID && capability.status.enabled
  )));
}

function assertAdvancedCapabilityUsage(
  data: GBAProjectData,
  capabilityManifest: EngineExportCapabilityManifest,
  pluginRegistry: ProjectPluginRegistry,
  runtimeCapabilities: ProjectRuntimeCapabilityManifest
): void {
  const linkUsed = projectEventCommandStrings(data).some((command) => {
    const verb = command.trim().split(/\s+/, 1)[0] ?? "";
    return verb.startsWith("multiplayer_") || verb.startsWith("multiplayer4_");
  });
  if (linkUsed && !runtimeCapabilities.capabilities.some((capability) => capability.id === "link" && capability.enabled)) {
    throw new Error("Eventos multiplayer exigem a capability universal link habilitada no projeto.");
  }
  if (linkUsed && capabilityScenes(capabilityManifest, "link_multiplayer").length === 0) {
    throw new Error("Eventos multiplayer exigem a capability link_multiplayer habilitada em pelo menos uma cena.");
  }

  const pluginScenes = capabilityScenes(capabilityManifest, "plugin_sdk");
  if (pluginScenes.length === 0) return;
  if (pluginRegistry.plugins.length === 0) {
    throw new Error("A capability plugin_sdk está habilitada, mas nenhum plugin foi carregado no registry do projeto.");
  }
  const requestedConstraint = pluginScenes
    .flatMap((scene) => scene.capabilities.filter((capability) => capability.id === "plugin_sdk"))
    .map((capability) => capability.settings.sdkVersion)
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)
    ?? `^${GBA_STUDIO_PLUGIN_SDK_VERSION}`;
  const incompatible = pluginRegistry.plugins.filter((plugin) => (
    !plugin.manifest.sdkVersion
    || !satisfiesPluginSdkVersion(requestedConstraint, plugin.manifest.sdkVersion)
  ));
  if (incompatible.length > 0) {
    throw new Error(`Plugins incompatíveis com o SDK ${requestedConstraint}: ${incompatible.map((plugin) => plugin.manifest.id).join(", ")}.`);
  }
}

function roomIndexByName(rooms: Record<string, unknown>[], value: string): number {
  return rooms.findIndex((room, index) => {
    const name = roomName(room, index);
    const id = stringField(room, "id", name);
    return value === name || value === id;
  });
}

function startRoomIndex(data: GBAProjectData, rooms: Record<string, unknown>[]): number {
  const startScene = stringField(child(settings(data), "general"), "startScene", "");
  const index = startScene ? roomIndexByName(rooms, startScene) : -1;
  return index >= 0 ? index : 0;
}

function startRoomSceneType(data: GBAProjectData, rooms: Record<string, unknown>[]): string {
  const startRoom = rooms[startRoomIndex(data, rooms)];
  const configuredStartType = stringField(child(settings(data), "general"), "startSceneType", "topdown");
  return startRoom ? roomSceneType(startRoom) : normalizeSceneTypeId(configuredStartType, "topdown");
}

function projectDataWithDevelopmentStartScene(
  data: GBAProjectData,
  target: DevelopmentSceneLaunch
): GBAProjectData {
  const id = target.id?.trim() ?? "";
  const name = target.name?.trim() ?? "";
  if (!id && !name) {
    throw new Error("Cena de desenvolvimento requer id ou nome.");
  }

  const rooms = projectRooms(data);
  const roomIndex = rooms.findIndex((room, index) => {
    const candidateName = roomName(room, index);
    const candidateID = stringField(room, "id", candidateName);
    return Boolean((id && candidateID === id) || (name && candidateName === name));
  });
  if (roomIndex < 0) {
    const reference = id && name
      ? `id "${id}" ou nome "${name}"`
      : id
        ? `id "${id}"`
        : `nome "${name}"`;
    throw new Error(`Cena de desenvolvimento nao encontrada: ${reference}.`);
  }

  const room = rooms[roomIndex] ?? {};
  const settingsData = isRecord(data.settings) ? data.settings : {};
  const general = child(settingsData, "general") ?? {};
  const hasStartPosition = Number.isFinite(target.x) && Number.isFinite(target.y);
  // A scene test must not inherit the game's coordinates from another scene.
  const sameStartScene = roomIndex === startRoomIndex(data, rooms);
  const sceneGeneral = sameStartScene ? general : { ...general, startX: undefined, startY: undefined, startDirection: undefined };
  const defaultStart = initialTopdownPlayerSpawn({ ...data, settings: { ...settingsData, general: sceneGeneral } }, room, roomIndex);

  return {
    ...data,
    settings: {
      ...settingsData,
      general: {
        ...general,
        startScene: roomName(room, roomIndex),
        startSceneType: roomSceneType(room),
        startX: hasStartPosition ? Math.trunc(target.x!) : defaultStart.x,
        startY: hasStartPosition ? Math.trunc(target.y!) : defaultStart.y,
        startDirection: hasStartPosition ? target.direction?.trim() || "down" : defaultStart.direction
      }
    }
  };
}

function normalizeExportSceneRoom(room: Record<string, unknown>, fallbackIndex: number): Record<string, unknown> {
  const sceneDocument = normalizeGBASceneDocument(room, fallbackIndex);
  const rawLayers = projectArray(room, "tileLayers");
  const hasForegroundLayer = rawLayers.some((layer) => {
    const mapping = nullableStringField(layer, "mapping")?.toUpperCase();
    return mapping === "BG1" || mapping === "TOP" || mapping === "FOREGROUND";
  });
  const tileLayers = sceneDocument.tilemap.foreground.length > 0 && !hasForegroundLayer
    ? [
        ...rawLayers,
        {
          mapping: "BG1",
          tilemap: sceneDocument.tilemap.foreground,
          tileSourceAssetNames: []
        }
      ]
    : rawLayers;
  const hasValidWidth = typeof room.width === "number" && Number.isInteger(room.width) && room.width > 0;
  const hasValidHeight = typeof room.height === "number" && Number.isInteger(room.height) && room.height > 0;

  return {
    ...room,
    ...(hasValidWidth ? { width: sceneDocument.sizeTiles.width } : {}),
    ...(hasValidHeight ? { height: sceneDocument.sizeTiles.height } : {}),
    backgroundAssetName: sceneDocument.background.assetName,
    background: sceneDocument.background.assetName,
    backgroundRenderMode: sceneDocument.background.renderMode,
    tilemap: sceneDocument.tilemap.base,
    tileLayers,
    collisionTypes: sceneDocument.collisionTypes,
    eventBindings: sceneDocument.eventBindings
  };
}

function exportRoomsForKind(data: GBAProjectData, kind: SceneExportKind): Record<string, unknown>[] {
  const rooms = projectRooms(data);
  const filtered = rooms.filter((room) => roomMatchesExportKind(roomSceneType(room), kind));
  const normalizeRooms = (entries: Record<string, unknown>[]): Record<string, unknown>[] => entries.map((room) => (
    normalizeExportSceneRoom(room, Math.max(0, rooms.indexOf(room)))
  ));
  if (filtered.length > 0) return normalizeRooms(filtered);

  const startRoom = rooms[startRoomIndex(data, rooms)];
  return startRoom ? [normalizeExportSceneRoom(startRoom, Math.max(0, rooms.indexOf(startRoom)))] : normalizeRooms(rooms.slice(0, 1));
}

type MixedRuntimeKind = "topdown" | "platformer" | "isometric" | "shmup" | "point_click" | "menu" | "dungeon_crawler" | "racing" | "cutscene" | "visual_novel" | "world_map" | "battle_rpg" | "luta";

const MIXED_RUNTIME_KINDS = new Set<SceneExportKind>([
  "topdown",
  "platformer",
  "isometric",
  "shmup",
  "point_click",
  "menu",
  "dungeon_crawler",
  "racing",
  "cutscene",
  "visual_novel",
  "world_map",
  "battle_rpg",
  "luta"
]);

function mixedRuntimeKindsForRooms(rooms: Record<string, unknown>[]): MixedRuntimeKind[] {
  return Array.from(new Set(rooms.map((room) => resolveSceneRuntimeExport(roomSceneType(room)).kind)))
    .filter((kind): kind is MixedRuntimeKind => MIXED_RUNTIME_KINDS.has(kind));
}

function usesMixedRuntimeDispatcher(rooms: Record<string, unknown>[]): boolean {
  const allKinds = Array.from(new Set(rooms.map((room) => resolveSceneRuntimeExport(roomSceneType(room)).kind)));
  return allKinds.length > 1 && allKinds.every((kind) => MIXED_RUNTIME_KINDS.has(kind));
}

function assertSingleRomRuntimeTransitions(
  data: GBAProjectData,
  rooms: Record<string, unknown>[],
  selectedKind: SceneExportKind
): void {
  const selectedRoomIndex = startRoomIndex(data, rooms);
  const selectedRoom = rooms[selectedRoomIndex] ?? rooms[0] ?? {};
  const selectedRoomName = roomName(selectedRoom, selectedRoomIndex);
  const selectedSceneType = roomSceneType(selectedRoom);
  const issues: string[] = [];

  for (const [eventIndex, event] of projectArray(data, "events").entries()) {
    const eventName = stringField(event, "name", `event_${eventIndex + 1}`);
    for (const step of eventSteps(event)) {
      const parts = commandParts(stringField(step, "command", "noop"));
      if (parts[0] !== "change_scene") continue;

      const targetReference = parts[1] ?? "";
      const targetRoomIndex = roomIndexByName(rooms, targetReference);
      if (targetRoomIndex < 0) continue;

      const targetRoom = rooms[targetRoomIndex] ?? {};
      const targetSceneType = roomSceneType(targetRoom);
      const targetKind = resolveSceneRuntimeExport(targetSceneType).kind;
      if (MIXED_RUNTIME_KINDS.has(selectedKind) && MIXED_RUNTIME_KINDS.has(targetKind)) continue;
      if (targetKind === selectedKind) continue;

      issues.push(
        `evento "${eventName}" usa change_scene no runtime de "${selectedRoomName}" (${selectedSceneType}) `
        + `para "${roomName(targetRoom, targetRoomIndex)}" (${targetSceneType})`
      );
    }
  }

  const connections = child(data, "editorState")?.scenaConnections;
  if (Array.isArray(connections)) {
    for (const connection of connections.filter(isRecord)) {
      const fromReference = nullableStringField(connection, "from");
      const toReference = nullableStringField(connection, "to");
      const fromRoomIndex = roomIndexByName(rooms, fromReference);
      const toRoomIndex = roomIndexByName(rooms, toReference);
      if (fromRoomIndex < 0 || toRoomIndex < 0) continue;

      const fromRoom = rooms[fromRoomIndex] ?? {};
      const toRoom = rooms[toRoomIndex] ?? {};
      const fromSceneType = roomSceneType(fromRoom);
      const toSceneType = roomSceneType(toRoom);
      const fromKind = resolveSceneRuntimeExport(fromSceneType).kind;
      const toKind = resolveSceneRuntimeExport(toSceneType).kind;
      if (fromKind === toKind) continue;
      if (MIXED_RUNTIME_KINDS.has(fromKind) && MIXED_RUNTIME_KINDS.has(toKind)) continue;
      if (fromKind !== selectedKind && toKind !== selectedKind) continue;

      issues.push(
        `conexao "${roomName(fromRoom, fromRoomIndex)}" (${fromSceneType}) `
        + `-> "${roomName(toRoom, toRoomIndex)}" (${toSceneType})`
      );
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `Transicao entre runtimes nao suportada em uma unica ROM: ${issues.join(" | ")}. `
      + "Selecione como inicio uma scene do runtime que deseja testar e mantenha as transicoes dentro desse runtime."
    );
  }
}

function buildRuntimeContract(data: GBAProjectData, mixedRuntime = false): EngineExportRuntimeContract {
  const rooms = projectRooms(data);
  const resolution = resolveSceneRuntimeExport(startRoomSceneType(data, rooms));
  return {
    scene_type: resolution.sceneType,
    adapter: mixedRuntime ? "mixed_runtime_project" : resolution.adapter,
    adapter_status: resolution.adapterStatus,
    rooms: rooms.map((room, index) => {
      const sceneType = roomSceneType(room);
      const featureModules = roomFeatureModules(room);
      return {
        name: roomName(room, index),
        scene_type: sceneType,
        runtime_profile: runtimeProfileForSceneType(sceneType),
        ...(nullableStringField(room, "paletteFamilyID") ? { palette_family_id: nullableStringField(room, "paletteFamilyID") } : {}),
        ...(featureModules ? { feature_modules: featureModules } : {})
      };
    })
  };
}

function configuredPlayerActorName(data: GBAProjectData, room?: Record<string, unknown>): string {
  const roomPlayer = room ? nullableStringField(room, "playerActorName") : null;
  if (roomPlayer) return roomPlayer;

  const startPlayer = nullableStringField(child(settings(data), "general"), "startPlayer");
  return startPlayer || "Player";
}

function actorMatchesPlayerName(actor: Record<string, unknown>, playerName: string): boolean {
  const actorName = nullableStringField(actor, "name");
  return Boolean(actorName && actorName === playerName);
}

function playerPositionForRoom(data: GBAProjectData, room: Record<string, unknown>, index: number): { x: number; y: number } {
  const general = child(settings(data), "general");
  const startX = numberOrNullLocal(general?.startX);
  const startY = numberOrNullLocal(general?.startY);
  const rooms = projectRooms(data);
  const globalRoomIndex = roomIndexByName(rooms, roomName(room, index));
  if (startX !== null && startY !== null && globalRoomIndex === startRoomIndex(data, rooms)) {
    return { x: Math.trunc(startX), y: Math.trunc(startY) };
  }
  const name = roomName(room, index);
  const playerName = configuredPlayerActorName(data, room);
  const actor = projectArray(data, "actors").find((item) => {
    const actorRoom = entitySceneName(item, "actor");
    return actorMatchesPlayerName(item, playerName) && (!actorRoom || actorRoom === name);
  });
  const position = actor ? entityPosition(actor, "actor", { x: 8, y: 8 }) : { x: 8, y: 8 };
  return {
    x: position.x,
    y: position.y
  };
}

interface ActorCollisionGeometry {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

function actorCollisionGeometry(
  data: GBAProjectData,
  actor: Record<string, unknown> | undefined,
  fallbackSize: number
): ActorCollisionGeometry {
  const fallback = {
    offsetX: 0,
    offsetY: 0,
    width: fallbackSize,
    height: fallbackSize
  };
  if (!actor) return fallback;
  const spriteSheet = nullableStringField(actor, "spriteSheet");
  if (!spriteSheet) return fallback;
  const animations = projectArray(data, "animations").filter((animation) => (
    nullableStringField(animation, "spriteSheet") === spriteSheet
  ));
  const animationName = nullableStringField(actor, "animationName");
  const animation = animations.find((candidate) => (
    animationName && nullableStringField(candidate, "name") === animationName
  )) ?? animations[0];
  if (!animation) return fallback;
  return {
    offsetX: integerField(animation, "hitboxX", fallback.offsetX),
    offsetY: integerField(animation, "hitboxY", fallback.offsetY),
    width: Math.max(1, integerField(animation, "hitboxWidth", fallback.width)),
    height: Math.max(1, integerField(animation, "hitboxHeight", fallback.height))
  };
}

function actorVisualSize(
  data: GBAProjectData,
  actor: Record<string, unknown> | undefined,
  fallbackSize: number
): { width: number; height: number } {
  const fallback = { width: fallbackSize, height: fallbackSize };
  if (!actor) return fallback;
  const spriteSheet = nullableStringField(actor, "spriteSheet");
  if (!spriteSheet) return fallback;
  const animations = projectArray(data, "animations").filter((animation) => (
    nullableStringField(animation, "spriteSheet") === spriteSheet
  ));
  if (animations.length === 0) return fallback;
  return animations.reduce<{ width: number; height: number }>((size, animation) => ({
    width: Math.max(size.width, integerField(animation, "frameWidth", fallback.width)),
    height: Math.max(size.height, integerField(animation, "frameHeight", fallback.height))
  }), fallback);
}

function platformerPlayerActorForRoom(
  data: GBAProjectData,
  room: Record<string, unknown>,
  roomIndex: number
): Record<string, unknown> | undefined {
  const actors = projectArray(data, "actors");
  const playerName = configuredPlayerActorName(data, room);
  const currentRoomName = roomName(room, roomIndex);
  return actors.find((actor) => (
    actorMatchesPlayerName(actor, playerName) &&
    entitySceneName(actor, "actor") === currentRoomName
  )) ?? actors.find((actor) => (
    actorMatchesPlayerName(actor, playerName) &&
    nullableStringField(actor, "gbStudioPlayerRuntime").toUpperCase() === "PLATFORM"
  )) ?? actors.find((actor) => actorMatchesPlayerName(actor, playerName));
}

function platformerPlayerPositionForRoom(
  data: GBAProjectData,
  room: Record<string, unknown>,
  roomIndex: number
): { x: number; y: number } {
  const playerName = configuredPlayerActorName(data, room);
  const currentRoomName = roomName(room, roomIndex);
  const localPlayer = projectArray(data, "actors").find((actor) => (
    actorMatchesPlayerName(actor, playerName)
    && entitySceneName(actor, "actor") === currentRoomName
  ));
  if (localPlayer) {
    const position = entityPosition(localPlayer, "actor", { x: 8, y: 8 });
    return {
      x: position.x,
      y: position.y
    };
  }

  for (const event of projectArray(data, "events")) {
    for (const step of eventSteps(event)) {
      const parts = commandParts(stringField(step, "command", "noop"));
      if (
        parts[0] === "change_scene"
        && parts[1] === currentRoomName
        && hasChangeSceneTileCoordinate(parts, 2)
        && hasChangeSceneTileCoordinate(parts, 3)
      ) {
        return {
          x: integerPart(parts[2], 8),
          y: integerPart(parts[3], 8)
        };
      }
    }
  }

  return playerPositionForRoom(data, room, roomIndex);
}

function firstPlayerActor(data: GBAProjectData, rooms: Record<string, unknown>[]): Record<string, unknown> | undefined {
  const initialRoomIndex = startRoomIndex(data, rooms);
  const firstRoom = rooms[initialRoomIndex] ?? rooms[0] ?? {};
  const firstRoomName = roomName(firstRoom, initialRoomIndex);
  const playerName = configuredPlayerActorName(data, firstRoom);
  return projectArray(data, "actors").find((item) => {
    const actorRoom = entitySceneName(item, "actor");
    return actorMatchesPlayerName(item, playerName) && (!actorRoom || actorRoom === firstRoomName);
  });
}

function firstPlayerPosition(data: GBAProjectData, rooms: Record<string, unknown>[]): { x: number; y: number } {
  const initialRoomIndex = startRoomIndex(data, rooms);
  return playerPositionForRoom(data, rooms[initialRoomIndex] ?? rooms[0] ?? {}, initialRoomIndex);
}

function initialTopdownPlayerSpawn(
  data: GBAProjectData,
  room: Record<string, unknown>,
  roomIndex: number
): { x: number; y: number; direction: "up" | "down" | "left" | "right" } {
  const general = child(settings(data), "general");
  const startX = numberOrNullLocal(general?.startX);
  const startY = numberOrNullLocal(general?.startY);
  if (startX !== null && startY !== null) {
    const requestedDirection = stringField(general, "startDirection", "down").toLowerCase();
    const direction = requestedDirection === "up" || requestedDirection === "left" || requestedDirection === "right"
      ? requestedDirection
      : "down";
    return { x: Math.trunc(startX), y: Math.trunc(startY), direction };
  }
  const name = roomName(room, roomIndex);
  const playerName = configuredPlayerActorName(data, room);
  const playerActor = projectArray(data, "actors").find((item) => {
    const actorRoom = entitySceneName(item, "actor");
    return actorMatchesPlayerName(item, playerName) && (!actorRoom || actorRoom === name);
  });
  if (playerActor) {
    return {
      ...playerPositionForRoom(data, room, roomIndex),
      direction: "down"
    };
  }
  const width = integerField(room, "width", 20);
  const height = integerField(room, "height", 18);
  const connections = child(data, "editorState")?.scenaConnections;
  const records = Array.isArray(connections) ? connections.filter(isRecord) : [];
  const incoming = records.find((connection) => nullableStringField(connection, "to") === name);
  const outgoing = records.find((connection) => nullableStringField(connection, "from") === name);
  const connection = incoming ?? outgoing;
  if (connection) {
    const area = incoming
      ? connectionAreaField(connection, "entry", defaultRoomConnectionEntryArea(width, height))
      : connectionAreaField(connection, "exit", defaultRoomConnectionExitArea(width, height));
    const collisionTypes = paddedCollisionTypes(room.collisionTypes, width * height);
    return roomConnectionArrival(area, width, height, collisionTypes);
  }

  return {
    ...playerPositionForRoom(data, room, roomIndex),
    direction: "down"
  };
}

function npcActorsForRoom(
  data: GBAProjectData,
  room: Record<string, unknown>,
  roomIndex: number
): Record<string, unknown>[] {
  const playerName = configuredPlayerActorName(data, room);
  const roomDataName = roomName(room, roomIndex);
  return projectArray(data, "actors").filter((actor) => {
    const name = stringField(actor, "name", "");
    const roomNameValue = entitySceneName(actor, "actor");
    return name !== playerName && (!roomNameValue || roomNameValue === roomDataName);
  });
}

function isConfiguredPlayerActor(data: GBAProjectData, actorName: string): boolean {
  const actor = projectArray(data, "actors").find((item) => stringField(item, "name", "") === actorName || stringField(item, "id", "") === actorName);
  if (!actor) return false;
  const reference = entitySceneName(actor, "actor");
  const room = projectRooms(data).find((item, index) => roomName(item, index) === reference || stringField(item, "id", "") === reference);
  return stringField(actor, "name", "") === configuredPlayerActorName(data, room);
}

export function auditExportEventCommandCoverage(data: GBAProjectData): { ok: boolean; unsupported: string[] } {
  const expansion = expandEventProcedures(projectArray(data, "events"));
  const list = unsupportedNativeEventCommandVerbs(
    expansion.events.flatMap((event) => (
      eventSteps(event).map((step) => stringField(step, "command", "noop"))
    ))
  );
  return { ok: list.length === 0 && expansion.issues.length === 0, unsupported: [...list, ...expansion.issues] };
}

function npcActorIndex(data: GBAProjectData, rooms: Record<string, unknown>[], actorName: string): number {
  const actor = projectArray(data, "actors").find((item) => (
    stringField(item, "name", "") === actorName || stringField(item, "id", "") === actorName
  ));
  if (!actor) throw new Error(`Evento referencia ator inexistente: ${actorName}`);

  const isoRoomName = entitySceneName(actor, "actor");
  const isoRoomIndex = rooms.findIndex((room, index) => roomName(room, index) === isoRoomName);
  const isoRoom = rooms[isoRoomIndex];
  if (isoRoom && roomSceneType(isoRoom) === "isometric") {
    // IsoActor arrays include the player. Top-down NPC arrays do not.
    return isometricActorsForRoom(data, isoRoom, isoRoomIndex).indexOf(actor);
  }

  const playerName = configuredPlayerActorName(data, actor);
  if (actorName === playerName) {
    throw new Error(`Comando de ator nao suporta o player neste export: ${actorName}`);
  }

  const actorRoomName = entitySceneName(actor, "actor");
  const roomIndex = actorRoomName
    ? rooms.findIndex((room, index) => roomName(room, index) === actorRoomName)
    : 0;
  if (roomIndex < 0) throw new Error(`Evento referencia room do ator inexistente: ${actorRoomName}`);

  const npcs = npcActorsForRoom(data, rooms[roomIndex] ?? {}, roomIndex);
  const index = npcs.findIndex((npc) => (
    stringField(npc, "name", "") === actorName || stringField(npc, "id", "") === actorName
  ));
  if (index < 0) throw new Error(`Evento referencia ator ausente da lista de NPCs exportada: ${actorName}`);
  return index;
}

function eventActorIndex(data: GBAProjectData, rooms: Record<string, unknown>[], actorName: string): number {
  if (actorUsesIsometricCoordinates(data, rooms, actorName)) {
    return actorName.trim().toLowerCase() === "player" ? 0 : npcActorIndex(data, rooms, actorName);
  }
  if (actorName.trim().toLowerCase() === "player" || isConfiguredPlayerActor(data, actorName)) {
    return -1;
  }
  return npcActorIndex(data, rooms, actorName);
}

function actorUsesIsometricCoordinates(data: GBAProjectData, rooms: Record<string, unknown>[], actorName: string): boolean {
  const actor = projectArray(data, "actors").find(item => (
    stringField(item, "name", "") === actorName || stringField(item, "id", "") === actorName
  ));
  const actorRoom = actor ? entitySceneName(actor, "actor") : null;
  const room = actorRoom ? projectRooms(data).find((item, index) => roomName(item, index) === actorRoom) : rooms[0];
  return room !== undefined && roomSceneType(room) === "isometric";
}

function authoredAnimationState(data: GBAProjectData, actorName: string, stateName: string): Record<string, unknown> {
  const actor = projectArray(data, "actors").find(item => stringField(item, "name", "") === actorName || stringField(item, "id", "") === actorName || (actorName.toLowerCase() === "player" && isConfiguredPlayerActor(data, stringField(item, "name", ""))));
  const states = projectArray(data, "animationStates").filter(item => stringField(item, "id", "") === stateName || (stringField(item, "name", "") === stateName && stringField(item, "spriteSheet", "") === stringField(actor, "spriteSheet", "")));
  if (states.length !== 1) throw new Error(`Estado de animação inexistente ou ambíguo: ${stateName}`);
  return states[0]!;
}
function animationStateVariantName(state: Record<string, unknown>, actorName: string): string {
  return `${stringField(state, "spriteSheet", "")}#state:${stringField(state, "id", "")}#actor:${actorName}`;
}

function dynamicActorSpriteSheetNames(data: GBAProjectData): string[] {
  const names = new Set<string>();
  projectArray(data, "events").forEach((event) => {
    eventSteps(event).forEach((step) => {
      if (step.isEnabled === false) return;
      const parts = commandParts(stringField(step, "command", "noop"));
      if ((parts[0] === "set_actor_sprite" || parts[0] === "change_actor_sprite") && parts[2]) {
        names.add(parts[2]);
      }
      if (parts[0] === "set_actor_animation_state") names.add(animationStateVariantName(authoredAnimationState(data, parts[1] ?? "", parts[2] ?? ""), parts[1] ?? ""));
      if (parts[0] === "projectile_load_slot" && parts[2]) names.add(`${parts[2]}#projectile`);
      if (parts[0] === "change_player_sprite" && parts[1]) {
        names.add(parts[1]);
      }
    });
  });
  return Array.from(names);
}

function eventConditionActorIndex(data: GBAProjectData, rooms: Record<string, unknown>[], actorName: string): number {
  if (actorName.trim().toLowerCase() === "player" || isConfiguredPlayerActor(data, actorName)) return -1;
  return npcActorIndex(data, rooms, actorName);
}

function actorTileDeltaToPixels(delta: number): number {
  // Relative motion may be authored in eighths of a tile (one GBA pixel).
  // Round after conversion, not before: truncating 0.125 tiles erased motion.
  return Number.isFinite(delta) ? Math.round(delta * gbaTopdownTileToPixels(1)) : 0;
}

function paddedNumberArray(value: unknown, count: number): number[] {
  const items = Array.isArray(value) ? value : [];
  return Array.from({ length: count }, (_item, index) => {
    const cell = items[index];
    return typeof cell === "number" && Number.isFinite(cell) && cell >= 0 ? Math.floor(cell) : 0;
  });
}

function paddedForegroundTileArray(value: unknown, count: number): number[] {
  const items = Array.isArray(value) ? value : [];
  return Array.from({ length: count }, (_item, index) => {
    const cell = items[index];
    return typeof cell === "number" && Number.isFinite(cell) && cell >= 0 ? Math.floor(cell) : -1;
  });
}

function paddedCollisionTypes(value: unknown, count: number): RoomCollisionType[] {
  const items = Array.isArray(value) ? value : [];
  return Array.from({ length: count }, (_item, index) => normalizeRoomCollisionType(items[index], "free"));
}

function paddedCollisionFlagsFromTypes(types: RoomCollisionType[], count: number): number[] {
  const flags = collisionFlagsFromTypes(types);
  return Array.from({ length: count }, (_item, index) => flags[index] ?? 0);
}

function eventSteps(event: Record<string, unknown>): Record<string, unknown>[] {
  return normalizeGBAEventDocument(event).steps
    .filter((step) => step.isEnabled)
    .map((step) => ({ command: step.command, isEnabled: step.isEnabled }));
}

function commandParts(command: string): string[] {
  return command.split(/\s+/).filter(Boolean);
}

const ACTOR_COMMAND_VERBS = new Set([
  "set_actor_position",
  "move_actor_to",
  "teleport_actor",
  "move_actor",
  "move_actor_relative",
  "set_actor_relative_position",
  "set_actor_visible",
  "set_actor_active",
  "set_actor_collision_enabled",
  "launch_projectile",
  "set_actor_animation_speed",
  "set_actor_sprite",
  "change_actor_sprite",
  "show_actor_gesture",
  "set_actor_collision_box",
  "store_actor_position",
  "store_actor_direction",
  "set_actor_animation",
  "set_actor_direction",
  "turn_actor",
  "set_actor_movement_speed",
  "push_actor_away_from_player",
  "wait_actor_animation",
  "play_actor_animation",
  "set_actor_animation_frame"
]);

function eventCommandParts(data: GBAProjectData, command: string): string[] {
  const parts = commandParts(command);
  const verb = parts[0] ?? "noop";
  if (!ACTOR_COMMAND_VERBS.has(verb)) return parts;

  const remainder = command.slice(verb.length).trim();
  const actorNames = projectArray(data, "actors")
    .map((actor) => stringField(actor, "name", ""))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  for (const actorName of actorNames) {
    if (remainder === actorName) return [verb, actorName];
    if (remainder.startsWith(`${actorName} `)) {
      return [verb, actorName, ...commandParts(remainder.slice(actorName.length).trim())];
    }
  }

  return parts;
}

function integerPart(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function scalarPart(value: string | undefined): string | number | boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === undefined) return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim() !== "" ? parsed : value;
}

function booleanPart(value: string | undefined, fallback: boolean): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function hardwareAudioVolume(value: string | undefined, fallbackPercent = 100): number {
  const percent = Math.max(0, Math.min(100, integerPart(value, fallbackPercent)));
  return Math.round(percent * 15 / 100);
}

function audioIndexByName(audioItems: Record<string, unknown>[], value: string): number {
  return audioItems.findIndex((audio, index) => {
    const name = stringField(audio, "name", `audio_${index + 1}`);
    const exportID = stringField(audio, "exportID", normalizeIdentifier(name, `audio_${index + 1}`));
    return value === name || value === exportID;
  });
}

// O motor real so toca audio do projeto (arquivos .mod/.wav importados) atraves de
// EventOp::RunAudioRoutine (project.tracker_assets) e EventOp::PlayPcmSfx (project.pcm_assets) -
// ver GBAStudioEngine/engine/src/gbs_event.cpp. EventOp::PlayMusic/PlaySfx apontam para uma tabela
// "sintetizada" (music_assets/sfx_assets) que buildAssetcAudioPackGeneration nunca preenche, entao
// compilar "play_music"/"play_sfx" para esses ops nunca toca nada no ROM. Resolvemos aqui o audio
// item para o indice real dentro do audio pack (tracker[]/pcm[]) ja gerado para o projeto.
interface EngineExportAudioPlaybackResolution {
  op: "run_audio_routine" | "play_pcm_sfx" | "play_sfx";
  index: number;
}

function resolveAudioPlayback(
  audioItems: Record<string, unknown>[],
  audioPack: AssetcAudioPackGeneration | null,
  value: string
): EngineExportAudioPlaybackResolution | null {
  const audioItemIndex = audioIndexByName(audioItems, value);
  if (audioItemIndex < 0 || !audioPack) return null;
  const audio = audioItems[audioItemIndex];
  const name = stringField(audio, "name", `audio_${audioItemIndex + 1}`);
  const exportID = stringField(audio, "exportID", normalizeIdentifier(name, `audio_${audioItemIndex + 1}`));

  const trackerIndex = audioPack.document.tracker.findIndex((entry) => entry.name === exportID);
  if (trackerIndex >= 0) return { op: "run_audio_routine", index: trackerIndex };

  const pcmIndex = audioPack.document.pcm.findIndex((entry) => entry.name === exportID);
  if (pcmIndex >= 0) return { op: "play_pcm_sfx", index: pcmIndex };

  const sfxIndex = audioPack.document.sfx.findIndex((entry) => entry.name === exportID);
  if (sfxIndex >= 0) return { op: "play_sfx", index: sfxIndex };

  return null;
}

function dialogueIndexByKey(dialogues: Record<string, unknown>[], value: string): number {
  return dialogues.findIndex((dialogue) => stringField(dialogue, "key", "") === value);
}

// O motor real (assetc: emit_topdown_choice_groups) referencia "ShowChoice" pela posicao no array
// compactado de choice_groups (so os dialogos com choices), nao pelo indice bruto do dialogo -
// diferente de "ShowDialogue", que usa o indice bruto em dialogue_lines.
function choiceGroupIndexByDialogueKey(dialogues: Record<string, unknown>[], value: string): number {
  let groupIndex = -1;
  for (const dialogue of dialogues) {
    if (dialogueChoices(dialogue).length === 0) continue;
    groupIndex += 1;
    if (stringField(dialogue, "key", "") === value) return groupIndex;
  }
  return -1;
}

function eventIndexByName(events: Record<string, unknown>[], value: string): number {
  return events.findIndex((event, index) => {
    const name = stringField(event, "name", `event_${index + 1}`);
    const id = stringField(event, "id", name);
    return value === name || value === id;
  });
}

interface EngineExportEventValueRegistries {
  variableIndex(key: string): number;
  textVariableIndex(key: string): number;
  itemIndex(key: string): number;
  pluginRegistry: ProjectPluginRegistry;
}

// O assetc real (GBAStudioEngine/tools/assetc/assetc.py) referencia variaveis e itens por indice
// numerico, nao por chave string - nao existe uma tabela de nomes declarada no contrato. O editor
// preserva a ordem declarada em project.variables e usa ordem alfabetica apenas para chaves
// legadas ou sinteticas que nao pertencem ao registro persistido do projeto.
const EVENT_VARIABLE_KEY_VERBS = new Set([
  "set_variable",
  "add_variable",
  "mod_variable",
  "multiply_variable",
  "random_variable",
  "add_variable_flags",
  "set_variable_flags",
  "clear_variable_flags",
  "set_flag",
  "modify_wallet",
  "show_number_hud",
  "if_variable",
  "if_variable_greater_than",
  "if_variable_less_than",
  "if_variable_variable",
  "if_flag",
  "set_random_seed"
]);

const EVENT_TEXT_VARIABLE_KEY_VERBS = new Set(["open_text_input"]);
const EVENT_ITEM_KEY_VERBS = new Set(["add_item", "has_item"]);
const EVENT_VARIABLE_CAPACITY = 64;
const EVENT_TEXT_VARIABLE_CAPACITY = 8;

function buildEventValueRegistries(
  events: Record<string, unknown>[],
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry(),
  actors: Record<string, unknown>[] = [],
  textInputVariableKeys: readonly string[] = [],
  sceneRouteVariableKeys: readonly string[] = [],
  declaredVariableKeys: readonly string[] = []
): EngineExportEventValueRegistries {
  const variableKeys = new Set<string>();
  const textVariableKeys = new Set<string>(textInputVariableKeys);
  const visibleVariableKeys = new Set<string>();
  const itemKeys = new Set<string>();

  sceneRouteVariableKeys.forEach((key) => {
    if (key.trim()) variableKeys.add(key.trim());
  });

  for (const event of events) {
    for (const step of eventSteps(event)) {
      const parts = commandParts(stringField(step, "command", "noop"));
      const verb = parts[0] ?? "noop";
      if (EVENT_TEXT_VARIABLE_KEY_VERBS.has(verb) && parts[1]) {
        textVariableKeys.add(parts[1]);
      } else if (EVENT_VARIABLE_KEY_VERBS.has(verb) && parts[1]) {
        variableKeys.add(parts[1]);
        if (verb === "if_variable_variable" && parts[2]) variableKeys.add(parts[2]);
      } else if (verb === "if_engine_field_variable" && parts[2]) {
        variableKeys.add(parts[2]);
      } else if (verb === "open_code_lock" && parts[1]) {
        variableKeys.add(parts[1]);
      } else if (["read_rtc", "store_engine_field", "store_save_variable", "open_menu"].includes(verb) && parts[2]) {
        variableKeys.add(parts[2]);
      } else if (verb === "store_actor_position") {
        if (parts[2]) variableKeys.add(parts[2]);
        if (parts[3]) variableKeys.add(parts[3]);
      } else if (verb === "store_actor_direction" && parts[2]) {
        variableKeys.add(parts[2]);
      } else if (verb === "replace_tile_animation" && parts[5]) {
        variableKeys.add(parts[5]);
      } else if (verb === "data_table_lookup") {
        for (const variableKey of parts.slice(3)) {
          if (variableKey) variableKeys.add(variableKey);
        }
      } else if (EVENT_ITEM_KEY_VERBS.has(verb) && parts[1]) {
        itemKeys.add(parts[1]);
      } else if (verb === "set_equipped_item" && parts[2]) {
        itemKeys.add(parts[2]);
      }
    }
  }

  // Point-and-click props can be gated by a variable even when the event
  // scripts themselves do not read that variable. Register those actor
  // references too, otherwise exporting a visual state-only prop fails with
  // "variavel inexistente" before the prop can be serialized.
  for (const actor of actors) {
    const visibleVariableKey = nullableStringField(actor, "visibleVariable")
      || nullableStringField(actor, "visible_variable");
    if (visibleVariableKey) {
      variableKeys.add(visibleVariableKey);
      visibleVariableKeys.add(visibleVariableKey);
    }
  }

  // Point-and-click prop visibility is encoded by the native assetc contract
  // in a 4-bit field, so every variable referenced by visible_variable must
  // occupy one of the first sixteen runtime slots. Keep the mapping
  // deterministic while reserving those slots for the visual-state keys.
  const declaredKeys = Array.from(new Set(declaredVariableKeys.map((key) => key.trim()).filter(Boolean)));
  const declaredKeySet = new Set(declaredKeys);
  const orderedVariableKeys = [
    ...declaredKeys,
    ...[...visibleVariableKeys].filter((key) => !declaredKeySet.has(key)).sort(),
    ...[...variableKeys]
      .filter((key) => !declaredKeySet.has(key) && !visibleVariableKeys.has(key))
      .sort()
  ];
  const variableIndexByKey = new Map(orderedVariableKeys.map((key, index) => [key, index] as const));
  for (const key of visibleVariableKeys) {
    const index = variableIndexByKey.get(key);
    if (index === undefined || index > 15) {
      throw new Error(`Variavel visual de point-and-click fora dos 16 slots nativos: ${key}.`);
    }
  }
  const itemIndexByKey = new Map([...itemKeys].sort().map((key, index) => [key, index] as const));
  const textVariableIndexByKey = new Map([...textVariableKeys].sort().map((key, index) => [key, index] as const));

  if (variableIndexByKey.size > EVENT_VARIABLE_CAPACITY) {
    throw new Error(`Eventos excedem a capacidade da engine de ${EVENT_VARIABLE_CAPACITY} variaveis: ${variableIndexByKey.size}.`);
  }
  if (textVariableIndexByKey.size > EVENT_TEXT_VARIABLE_CAPACITY) {
    throw new Error(`Eventos excedem a capacidade da engine de ${EVENT_TEXT_VARIABLE_CAPACITY} variaveis textuais: ${textVariableIndexByKey.size}.`);
  }

  return {
    variableIndex(key: string): number {
      const index = variableIndexByKey.get(key);
      if (index === undefined) throw new Error(`Evento referencia variavel inexistente: ${key}`);
      return index;
    },
    textVariableIndex(key: string): number {
      const index = textVariableIndexByKey.get(key);
      if (index === undefined) throw new Error(`Evento referencia variavel textual inexistente: ${key}`);
      return index;
    },
    itemIndex(key: string): number {
      const index = itemIndexByKey.get(key);
      if (index === undefined) throw new Error(`Evento referencia item inexistente: ${key}`);
      return index;
    },
    pluginRegistry
  };
}

function hasChangeSceneTileCoordinate(parts: string[], index: number): boolean {
  const value = parts[index];
  return value !== undefined && value.trim() !== "";
}

function warpPositionForChangeScene(
  data: GBAProjectData,
  rooms: Record<string, unknown>[],
  targetRoomIndex: number,
  parts: string[],
  targetKind: SceneExportKind
): { x: number; y: number } {
  const exportPosition = (position: { x: number; y: number }): { x: number; y: number } => (
    targetKind === "isometric" || targetKind === "dungeon_crawler"
      ? position
      : gbaTopdownTilePointToPixels(position)
  );
  if (hasChangeSceneTileCoordinate(parts, 2) && hasChangeSceneTileCoordinate(parts, 3)) {
    return exportPosition({
      x: integerPart(parts[2], 8),
      y: integerPart(parts[3], 8)
    });
  }

  const targetRoomName = roomName(rooms[targetRoomIndex] ?? {}, targetRoomIndex);
  const connections = child(data, "editorState")?.scenaConnections;
  const connection = Array.isArray(connections)
    ? connections.filter(isRecord).find((entry) => nullableStringField(entry, "to") === targetRoomName)
    : undefined;
  if (connection) {
    const targetRoom = rooms[targetRoomIndex] ?? {};
    const targetWidth = integerField(targetRoom, "width", 20);
    const targetHeight = integerField(targetRoom, "height", 18);
    const entryArea = connectionAreaField(connection, "entry", defaultRoomConnectionEntryArea(targetWidth, targetHeight));
    const collisionTypes = paddedCollisionTypes(targetRoom.collisionTypes, targetWidth * targetHeight);
    return exportPosition(roomConnectionArrival(entryArea, targetWidth, targetHeight, collisionTypes));
  }

  return exportPosition(playerPositionForRoom(data, rooms[targetRoomIndex] ?? {}, targetRoomIndex));
}

function compileCampaignAdvance(
  data: GBAProjectData,
  campaignRoom: Record<string, unknown> | undefined,
  rooms: Record<string, unknown>[],
  registries: EngineExportEventValueRegistries
): EngineExportProjectEventCommand[] {
  if (!campaignRoom) throw new Error("advance_campaign requer um evento vinculado a uma cena.");
  const campaign = normalizeGBASceneDocument(campaignRoom).campaign;
  if (!campaign) throw new Error(`Cena ${roomName(campaignRoom, 0)} nao possui campanha configurada.`);

  const variableKey = campaignVariableKey(data, campaignRoom);
  const commands: EngineExportProjectEventCommand[] = [{
    op: "set_variable",
    variable: registries.variableIndex(variableKey),
    value: campaign.completedValue
  }];
  const nextScene = campaign.nextScene?.trim() ?? "";
  if (!nextScene) return commands;

  const currentKind = resolveSceneRuntimeExport(roomSceneType(campaignRoom)).kind;
  const allRooms = projectRooms(data);
  const globalTargetIndex = roomIndexByName(allRooms, nextScene);
  if (globalTargetIndex < 0) throw new Error(`Campanha referencia room inexistente: ${nextScene}`);
  const targetRoom = allRooms[globalTargetIndex] ?? {};
  const targetKind = resolveSceneRuntimeExport(roomSceneType(targetRoom)).kind;
  let targetRooms = rooms;
  let targetRoomIndex = roomIndexByName(targetRooms, nextScene);
  if (targetRoomIndex < 0) {
    if (!MIXED_RUNTIME_KINDS.has(currentKind) || !MIXED_RUNTIME_KINDS.has(targetKind)) {
      throw new Error(`Campanha referencia room de runtime incompatível: ${nextScene}`);
    }
    targetRooms = exportRoomsForKind(data, targetKind);
    targetRoomIndex = roomIndexByName(targetRooms, nextScene);
  }
  if (targetRoomIndex < 0) throw new Error(`Campanha referencia room inexistente no runtime de destino: ${nextScene}`);

  const position = warpPositionForChangeScene(
    data,
    targetRooms,
    targetRoomIndex,
    ["advance_campaign", nextScene],
    targetKind
  );
  commands.push(sceneWarpCommand(data, currentKind, targetKind, targetRooms, targetRoomIndex, position, campaignRoom));
  return commands;
}

function sceneWarpCommand(
  data: GBAProjectData,
  currentKind: SceneExportKind,
  targetKind: SceneExportKind,
  targetRooms: Record<string, unknown>[],
  targetRoom: number,
  position: { x: number; y: number },
  sourceRoom?: Record<string, unknown>
): EngineExportProjectEventCommand {
  const connections = child(data, "editorState")?.scenaConnections;
  const connection = sourceRoom && Array.isArray(connections)
    ? connections.filter(isRecord).find(candidate =>
      candidate.from === roomName(sourceRoom, 0) && candidate.to === roomName(targetRooms[targetRoom], targetRoom))
    : undefined;
  const transition = connection && (Object.hasOwn(connection, "transition")
    ? normalizeSceneTransition(connection.transition)
    : sceneTransitionFromProjectSettings(child(settings(data), "transitions")));
  // A synchronous local Warp ignores the cover's Wait and can stream assets
  // over the visible source. Animated mixed-runtime connections use the shared
  // delayed handoff; immediate cuts retain the local path.
  const animatedHandoff = transition && sceneTransitionUsesVisualEffect(transition);
  // Only these adapters consume EventState.current_room as a local warp.
  // The others use the shared dispatcher when the exported project includes it.
  if (targetKind === currentKind && (!usesMixedRuntimeDispatcher(projectRooms(data)) ||
    (!animatedHandoff && ["topdown", "platformer", "isometric"].includes(currentKind)))) {
    return { op: "warp", room: targetRoom, x: position.x, y: position.y };
  }
  const localIndex = targetKind === "menu"
    ? menuScreenSources(targetRooms).findIndex(source => source.roomIndex === targetRoom)
    : targetRoom;
  return { op: "warp_runtime", runtime: targetKind as MixedRuntimeKind, room: localIndex, x: position.x, y: position.y };
}

function compileSwitchVariable(
  parts: string[],
  events: Record<string, unknown>[],
  registries: EngineExportEventValueRegistries
): EngineExportProjectEventCommand[] {
  const variableKey = parts[1] ?? "";
  const cases: Array<{ value: number; eventName: string }> = [];
  let defaultEventName = "";
  for (let index = 2; index + 1 < parts.length; index += 2) {
    if ((parts[index] ?? "").toLowerCase() === "else") {
      defaultEventName = parts[index + 1] ?? "";
      break;
    }
    cases.push({
      value: integerPart(parts[index], 0),
      eventName: parts[index + 1] ?? ""
    });
  }
  if (cases.length === 0) return [];

  const commands: EngineExportProjectEventCommand[] = [];
  const variable = registries.variableIndex(variableKey);
  const defaultEventIndex = defaultEventName ? eventIndexByName(events, defaultEventName) : -1;
  if (defaultEventName && defaultEventIndex < 0) {
    throw new Error(`Evento referencia evento inexistente: ${defaultEventName}`);
  }
  const totalCommands = cases.length * 4 + (defaultEventIndex >= 0 ? 1 : 0);

  for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
    const caseItem = cases[caseIndex];
    const eventIndex = eventIndexByName(events, caseItem.eventName);
    if (eventIndex < 0) throw new Error(`Evento referencia evento inexistente: ${caseItem.eventName}`);
    const bodyCommands: EngineExportProjectEventCommand[] = [{ op: "call_script", index: eventIndex }];

    commands.push({
      op: "jump_if_variable_equals",
      variable,
      value: caseItem.value,
      offset: 2
    });
    commands.push({ op: "jump", offset: 3 });
    commands.push(...bodyCommands);
    const jumpIndex = caseIndex * 4 + 3;
    commands.push({ op: "jump", offset: totalCommands - jumpIndex });
  }
  if (defaultEventIndex >= 0) {
    commands.push({ op: "call_script", index: defaultEventIndex });
  }

  return commands;
}

function sceneRouteVariableKeys(data: GBAProjectData): string[] {
  return sceneRouteTablesFromProject(data)
    .map((table) => table.variable)
    .filter(Boolean);
}

function projectVariableKeys(data: GBAProjectData): string[] {
  return projectArray(data, "variables")
    .map((variable) => stringField(variable, "name", "").trim())
    .filter(Boolean);
}

function sceneRouteTransitionCommands(
  data: GBAProjectData,
  rooms: Record<string, unknown>[],
  destination: SceneRouteDestination
): EngineExportProjectEventCommand[] {
  const currentKind = resolveSceneRuntimeExport(roomSceneType(rooms[0] ?? {})).kind;
  let targetRooms = rooms;
  let room = roomIndexByName(targetRooms, destination.scene);
  let targetKind = currentKind;
  if (room < 0) {
    const allRooms = projectRooms(data);
    const globalRoom = roomIndexByName(allRooms, destination.scene);
    if (globalRoom < 0) throw new Error(`Tabela de rotas referencia room inexistente: ${destination.scene}`);
    targetKind = resolveSceneRuntimeExport(roomSceneType(allRooms[globalRoom] ?? {})).kind;
    if (!MIXED_RUNTIME_KINDS.has(currentKind) || !MIXED_RUNTIME_KINDS.has(targetKind)) {
      throw new Error(`Tabela de rotas referencia room de runtime incompatível: ${destination.scene}`);
    }
    targetRooms = exportRoomsForKind(data, targetKind);
    room = roomIndexByName(targetRooms, destination.scene);
  }
  if (room < 0) throw new Error(`Tabela de rotas referencia room inexistente no runtime de destino: ${destination.scene}`);

  const position = warpPositionForChangeScene(
    data,
    targetRooms,
    room,
    ["change_scene", destination.scene, String(destination.x), String(destination.y)],
    targetKind
  );
  const warp = sceneWarpCommand(data, currentKind, targetKind, targetRooms, room, position);
  const commands: EngineExportProjectEventCommand[] = [
    { op: "set_player_direction", direction: destination.direction }
  ];
  if (destination.fadeFrames > 0) {
    commands.unshift({ op: "fade_out", frames: destination.fadeFrames });
    commands.push({ op: "wait", frames: destination.fadeFrames });
  }
  commands.push(warp);
  if (destination.fadeFrames > 0) commands.push({ op: "fade_in", frames: destination.fadeFrames });
  return commands;
}

function wrapSceneConnectionTransition(
  connection: Record<string, unknown>,
  script: EngineExportProjectEventCommand[] | undefined,
  projectSettings?: unknown
): EngineExportProjectEventCommand[] {
  const transition = Object.hasOwn(connection, "transition")
    ? normalizeSceneTransition(connection.transition)
    : sceneTransitionFromProjectSettings(isRecord(projectSettings) ? projectSettings.transitions : undefined);
  const body = script ?? [];
  if (!sceneTransitionUsesVisualEffect(transition)) return body;
  if (body.some((command) => command.op === "fade_in" || command.op === "fade_out" || command.op === "visual_effect")) return body;

  // Every automatic transition uses the shared compositor across runtimes.
  // `crossfade` deliberately uses the GBA-safe two-phase palette blend until
  // a dual-scene framebuffer is available in the engine.
  const visualEffect = transition.style === "fade" ? "fade" : sceneTransitionVisualEffect(transition);
  const phaseCommand = (phase: SceneTransitionPhase): EngineExportProjectEventCommand => ({
    op: "visual_effect",
    effect: visualEffect ?? "clear",
    layer: "all",
    frames: transition.durationFrames,
    intensity: 100,
    phase
  });

  return [
    ...(transition.fadeOut ? [
      phaseCommand("cover"),
      { op: "wait", frames: transition.durationFrames }
    ] : []),
    ...body,
    ...(transition.fadeIn ? [phaseCommand("reveal")] : [])
  ];
}

function sceneConnectionEventSteps(
  data: GBAProjectData,
  steps: Record<string, unknown>[],
  sourceRoom?: Record<string, unknown>
): Record<string, unknown>[] {
  if (!sourceRoom || steps.some(step => ["fade_in", "fade_out", "visual_effect"].includes(commandParts(stringField(step, "command", ""))[0]))) return steps;
  const connections = child(data, "editorState")?.scenaConnections;
  if (!Array.isArray(connections)) return steps;
  const rooms = projectRooms(data);
  const sourceIndex = rooms.indexOf(sourceRoom);
  const effectStep = (command: EngineExportProjectEventCommand): Record<string, unknown> => command.op === "visual_effect"
    ? { command: `visual_effect ${command.effect} ${command.layer} ${command.frames} ${command.intensity} ${command.phase}` }
    : { command: `${command.op} ${command.frames}` };
  return steps.flatMap(step => {
    const parts = commandParts(resolveProjectConstantCommand(data, stringField(step, "command", "")));
    const target = parts[0] === "change_scene" ? parts[1]
      : parts[0] === "advance_campaign" ? normalizeGBASceneDocument(sourceRoom).campaign?.nextScene : undefined;
    if (!target) return [step];
    const targetIndex = roomIndexByName(rooms, target);
    const connection = connections.filter(isRecord).find(candidate => roomIndexByName(rooms, nullableStringField(candidate, "from")) === sourceIndex
      && roomIndexByName(rooms, nullableStringField(candidate, "to")) === targetIndex);
    if (!connection) return [step];
    const marker: EngineExportProjectEventCommand = { op: "wait", frames: 0 };
    // Expand before compiling conditions so their jump offsets include the
    // effect. A blocked passage must not cover the screen.
    return wrapSceneConnectionTransition(connection, [marker], data.settings)
      .map(command => command === marker ? step : effectStep(command));
  });
}

function compileSceneRouteTable(
  data: GBAProjectData,
  tableID: string,
  rooms: Record<string, unknown>[],
  registries: EngineExportEventValueRegistries
): EngineExportProjectEventCommand[] {
  const table = findSceneRouteTable(data, tableID);
  if (!table) throw new Error(`Evento referencia tabela de rotas inexistente: ${tableID}`);
  if (!table.variable) throw new Error(`Tabela de rotas sem variavel: ${tableID}`);
  const variable = registries.variableIndex(table.variable);
  const cases = table.routes.map((route) => ({
    value: route.value,
    body: sceneRouteTransitionCommands(data, rooms, route)
  }));
  const fallback = table.fallback ? sceneRouteTransitionCommands(data, rooms, table.fallback) : [];
  const totalCommands = cases.reduce((total, item) => total + 3 + item.body.length, 0) + fallback.length;
  const commands: EngineExportProjectEventCommand[] = [];

  for (const item of cases) {
    commands.push({ op: "jump_if_variable_equals", variable, value: item.value, offset: 2 });
    commands.push({ op: "jump", offset: item.body.length + 2 });
    commands.push(...item.body);
    const exitIndex = commands.length;
    commands.push({ op: "jump", offset: totalCommands - exitIndex });
  }
  commands.push(...fallback);
  return commands;
}

function compileRepeatWhileGuard(
  variableKey: string,
  operator: string,
  threshold: string,
  registries: EngineExportEventValueRegistries
): EngineExportProjectEventCommand {
  const variable = registries.variableIndex(variableKey);
  const value = integerPart(threshold, 0);
  switch (operator) {
    case "lt":
      return { op: "jump_if_variable_less_than", variable, value, offset: 2 };
    case "lte":
      return { op: "jump_if_variable_less_than", variable, value: value + 1, offset: 2 };
    case "gt":
      return { op: "jump_if_variable_greater_than", variable, value, offset: 2 };
    case "gte":
      return { op: "jump_if_variable_greater_than", variable, value: Math.max(0, value - 1), offset: 2 };
    case "eq":
      return { op: "jump_if_variable_equals", variable, value, offset: 2 };
    default:
      throw new Error(`Operador repeat_expression nao suportado no export: ${operator}`);
  }
}

function compileRepeatExpression(
  parts: string[],
  events: Record<string, unknown>[],
  registries: EngineExportEventValueRegistries
): EngineExportProjectEventCommand[] {
  const variableKey = parts[1] ?? "";
  const operator = parts[2] ?? "lt";
  const threshold = parts[3] ?? "0";
  const eventName = parts[4] ?? "";
  const maxIterations = Math.max(1, Math.min(32, integerPart(parts[5], 1)));
  const eventIndex = eventIndexByName(events, eventName);
  if (eventIndex < 0) throw new Error(`Evento referencia evento inexistente: ${eventName}`);

  const commands: EngineExportProjectEventCommand[] = [];
  const bodyCommands: EngineExportProjectEventCommand[] = [{ op: "call_script", index: eventIndex }];

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (operator === "ne") {
      commands.push({
        op: "jump_if_variable_equals",
        variable: registries.variableIndex(variableKey),
        value: integerPart(threshold, 0),
        offset: 2
      });
      commands.push(...bodyCommands);
      continue;
    }

    commands.push(compileRepeatWhileGuard(variableKey, operator, threshold, registries));
    commands.push({ op: "jump", offset: 1 + bodyCommands.length });
    commands.push(...bodyCommands);
  }

  return commands;
}

function compileEventStep(
  data: GBAProjectData,
  step: Record<string, unknown>,
  rooms: Record<string, unknown>[],
  dialogues: Record<string, unknown>[],
  audioItems: Record<string, unknown>[],
  audioPack: AssetcAudioPackGeneration | null,
  events: Record<string, unknown>[],
  registries: EngineExportEventValueRegistries,
  campaignRoom?: Record<string, unknown>
): EngineExportProjectEventCommand[] {
  const rawCommand = resolveProjectConstantCommand(data, stringField(step, "command", "noop"));
  const parts = eventCommandParts(data, rawCommand);
  const verb = parts[0] ?? "noop";
  const operand = parts[1] ?? "";
  const pluginMapping = registries.pluginRegistry.exportMappingByVerb.get(verb);
  if (pluginMapping) {
    return [compilePluginContractEventCommand(parts, pluginMapping)];
  }

  const integrationIssue = eventCommandIntegrationIssue(parts.join(" "), resolveSceneRuntimeExport(roomSceneType(rooms[0] ?? {})).kind);
  if (integrationIssue) throw new Error(integrationIssue);

  if (isLutaEventVerb(verb)) {
    const control = parseLutaEventCommand(parts.join(" "));
    if (verb === "luta_start_match") {
      const index = roomIndexByName(rooms, control.target ?? "");
      if (index < 0) throw new Error(`Partida referencia cena de Luta inexistente: ${control.target}`);
      return [{ op: verb, index }];
    }
    if (verb === "luta_end_match") return [{ op: verb, actor: control.value }];
    if (verb === "luta_set_round_timer") return [{ op: verb, frames: control.value }];
    if (verb === "luta_set_rounds_to_win") return [{ op: verb, count: control.value }];
    const target = control.target ?? "";
    let side = ["player1", "p1", "Player"].includes(target) ? 0 : (["player2", "p2"].includes(target) ? 1 : -1);
    if (side < 0) {
      const fighters = projectArray(data, "actors").filter(actor =>
        (actor.name === target || actor.id === target) && rooms.some(room => entitySceneName(actor, "actor") === roomName(room, 0)));
      const sides = new Set(fighters.map(actor => child(actor, "battle")?.side));
      if (sides.size === 1 && sides.has("player1")) side = 0;
      else if (sides.size === 1 && sides.has("player2")) side = 1;
      else throw new Error(`Evento de Luta requer um participante player1 ou player2: ${target}`);
    }
    if (verb === "luta_enable_alpha_counter") return [{ op: verb, actor: side, value: control.value !== 0 }];
    if (verb === "luta_set_ism_style" || verb === "luta_trigger_super") return [{ op: verb, actor: side, index: control.value }];
    return [{ op: verb, actor: side, amount: control.value }];
  }

  switch (verb) {
    case "noop":
      return [];
    case "start_game_clock":
      return [{ op: verb, minutes_per_tick: Number(parts[1]), frames_per_tick: Number(parts[2]), hud: parts[3] === "hud" }];
    case "advance_time":
      return [{ op: verb, minutes: Number(parts[1]) }];
    case "set_background": {
      if (resolveSceneRuntimeExport(roomSceneType(rooms[0] ?? {})).kind !== "cutscene") throw new Error("Trocar fundo é suportado em Cutscene.");
      const pack = buildAssetcTilesetPackGeneration(data);
      const backgroundName = parts.slice(1).join(" ");
      const asset = pack?.assetsBySheet[backgroundName];
      if (!asset || asset.kind !== "bg") throw new Error(`Evento referencia fundo regular inexistente ou incompatível: ${backgroundName || "-"}`);
      return [{ op: "set_background", index: regularTilesetAssetNames(pack).indexOf(asset.name) }];
    }
    case "slider": {
      const sliderScreen = projectRooms(data).some((room) => {
        const config = (room.runtime as Record<string, unknown> | undefined)?.config as Record<string, unknown> | undefined;
        return Array.isArray(config?.screens) && config.screens.some((screen) =>
          isRecord(screen) && screen.id === operand && screen.carousel === true
        );
      });
      if (!sliderScreen) throw new Error(`Evento referencia slider inexistente: ${operand || "-"}`);
      // Bloco estrutural: o menu compila as opções, sprites e ações da tela associada.
      return [];
    }
    case "advance_campaign":
      return compileCampaignAdvance(data, campaignRoom, rooms, registries);
    case "show_dialogue": {
      const dialogue = dialogueIndexByKey(dialogues, operand);
      if (dialogue < 0) throw new Error(`Evento referencia dialogo inexistente: ${operand}`);
      const textSfx = compileDialogueTextSfxCommand(dialogueRecordByKey(dialogues, operand), audioItems, audioPack);
      return textSfx
        ? [textSfx, { op: "show_dialogue", dialogue }]
        : [{ op: "show_dialogue", dialogue }];
    }
    case "show_dialogue_speaker": {
      const dialogueKey = operand.split(/\s+/).filter(Boolean)[0] ?? "";
      const dialogue = dialogueIndexByKey(dialogues, dialogueKey);
      if (dialogue < 0) throw new Error(`Evento referencia dialogo inexistente: ${dialogueKey}`);
      const textSfx = compileDialogueTextSfxCommand(dialogueRecordByKey(dialogues, dialogueKey), audioItems, audioPack);
      return textSfx
        ? [textSfx, { op: "show_dialogue", dialogue }]
        : [{ op: "show_dialogue", dialogue }];
    }
    case "draw_text": {
      const literal=parts.slice(4).join(" ");
      return [{op:"draw_text",line:dialogues.length+drawTextLiteralLines(data).indexOf(literal),x:Number(operand),y:Number(parts[2]),layer:parts[3]}];
    }
    case "open_menu": {
      const group=choiceGroupIndexByDialogueKey(dialogues,operand);
      if(group<0) throw new Error(`Menu requer diálogo com opções: ${operand}`);
      return [{op:"open_menu",group,variable:registries.variableIndex(parts[2]!)}];
    }
    case "open_code_lock":
      return [{op:"open_code_lock",variable:registries.variableIndex(operand),digits:Number(parts[2]),code:Number(parts[3])}];
    case "open_equip_menu":
      return [{op:"open_equip_menu",slots:Number(operand),pause:parts[2]==="true"}];
    case "open_shop": {
      const actor=eventActorIndex(data,rooms,operand);
      const config=child(child(rooms[0],"runtime"),"config");
      const shop=resolveTopdownFeatureRuntime(config?.modules);
      if(!shop.shopEnabled || !shop.shop) throw new Error("A cena precisa de uma loja configurada com item, preço e estoque.");
      return [{op:"open_shop",actor}];
    }
    case "show_choice": {
      const dialogue = dialogueIndexByKey(dialogues, operand);
      if (dialogue < 0) throw new Error(`Evento referencia dialogo inexistente: ${operand}`);
      const group = choiceGroupIndexByDialogueKey(dialogues, operand);
      if (group < 0) throw new Error(`Evento show_choice referencia dialogo sem choices: ${operand}`);
      const textSfx = compileDialogueTextSfxCommand(dialogueRecordByKey(dialogues, operand), audioItems, audioPack);
      return textSfx
        ? [textSfx, { op: "show_choice", group }]
        : [{ op: "show_choice", group }];
    }
    case "change_scene": {
      const currentKind = resolveSceneRuntimeExport(roomSceneType(rooms[0] ?? {})).kind;
      let targetRooms = rooms;
      let room = roomIndexByName(targetRooms, operand);
      let targetKind = currentKind;
      if (room < 0) {
        const allRooms = projectRooms(data);
        const globalRoom = roomIndexByName(allRooms, operand);
        if (globalRoom < 0) throw new Error(`Evento referencia room inexistente: ${operand}`);
        targetKind = resolveSceneRuntimeExport(roomSceneType(allRooms[globalRoom] ?? {})).kind;
        if (!MIXED_RUNTIME_KINDS.has(currentKind) || !MIXED_RUNTIME_KINDS.has(targetKind)) {
          throw new Error(`Evento referencia room de runtime incompatível: ${operand}`);
        }
        targetRooms = exportRoomsForKind(data, targetKind);
        room = roomIndexByName(targetRooms, operand);
      }
      if (room < 0) throw new Error(`Evento referencia room inexistente no runtime de destino: ${operand}`);
      const position = warpPositionForChangeScene(data, targetRooms, room, parts, targetKind);
      const direction = ["up", "down", "left", "right"].includes((parts[4] ?? "").toLowerCase())
        ? parts[4]!.toLowerCase() as "up" | "down" | "left" | "right"
        : null;
      const directionCommand = direction ? [{ op: "set_player_direction" as const, direction }] : [];
      return [...directionCommand, sceneWarpCommand(data, currentKind, targetKind, targetRooms, room, position, campaignRoom)];
    }
    case "change_scene_by_variable":
      return compileSceneRouteTable(data, operand, rooms, registries);
    case "scene_stack_push":
    case "scene_stack_previous":
    case "scene_stack_first": {
      const currentKind = resolveSceneRuntimeExport(roomSceneType(rooms[0] ?? {})).kind;
      if (!MIXED_RUNTIME_KINDS.has(currentKind)) {
        throw new Error(`Pilha de cenas nao suporta o runtime atual: ${currentKind}`);
      }
      return [{ op: verb, runtime: currentKind as MixedRuntimeKind }];
    }
    case "scene_stack_clear":
      return [{ op: "scene_stack_clear" }];
    case "run_audio_routine": {
      const resolved = resolveAudioPlayback(audioItems, audioPack, operand);
      if (resolved?.op !== "run_audio_routine") throw new Error(`Rotina de áudio requer música tracker compilada: ${operand}`);
      return [{ op: resolved.op, index: resolved.index }];
    }
    case "play_music":
    case "play_sfx": {
      const resolved = resolveAudioPlayback(audioItems, audioPack, operand);
      if (resolved) {
        if (resolved.op === "play_pcm_sfx" && (parts[2] !== undefined || parts[3] !== undefined)) {
          return [{
            op: resolved.op,
            index: resolved.index,
            volume: hardwareAudioVolume(parts[2]),
            priority: Math.max(0, Math.min(255, integerPart(parts[3], 8)))
          }];
        }
        return [{ op: resolved.op, index: resolved.index }];
      }
      // Item sem entrada no audio pack (sem arquivo importado nem patterns compostos): mantemos o op
      // legado PlayMusic/PlaySfx para nao quebrar o export, mas a tabela sintetizada fica vazia na ROM.
      const index = audioIndexByName(audioItems, operand);
      if (index < 0) throw new Error(`Evento referencia audio inexistente: ${operand}`);
      return [{ op: verb, index }];
    }
    case "mute_audio_channel":
      return [{ op: "mute_audio_channel", channel: operand || "music", muted: booleanPart(parts[2], true) }];
    case "set_audio_volume":
      return [{ op: "set_audio_volume", channel: operand || "all", volume: hardwareAudioVolume(parts[2]) }];
    case "fade_audio_volume":
      return [{
        op: "fade_audio_volume",
        channel: operand || "all",
        volume: hardwareAudioVolume(parts[2]),
        frames: Math.max(0, Math.min(3600, integerPart(parts[3], 30)))
      }];
    case "push_actor":
      return [{op:"push_actor",actor:eventActorIndex(data,rooms,operand),value:parts[2]==="true"}];
    case "start_segment": {
      const script=eventIndexByName(events,parts[2] ?? "");
      if(script<0) throw new Error(`Script paralelo inexistente: ${parts[2] ?? ""}`);
      return [{op:"start_segment",slot:Number(operand),script}];
    }
    case "stop_segment": return [{op:"stop_segment",slot:Number(operand)}];
    case "call_event": {
      const index = eventIndexByName(events, operand);
      if (index < 0) throw new Error(`Evento referencia evento inexistente: ${operand}`);
      return [{ op: "call_script", index }];
    }
    case "attach_button": {
      const index = eventIndexByName(events, parts[2] ?? "");
      if (index < 0) throw new Error(`Evento referencia evento inexistente: ${parts[2] ?? ""}`);
      return [{ op: "attach_button_event", button: operand || "a", index, override: booleanPart(parts[3], false) }];
    }
    case "remove_button":
      return [{ op: "remove_button_event", button: operand || "a" }];
    case "timer_attach": {
      const index = eventIndexByName(events, parts[2] ?? "");
      if (index < 0) throw new Error(`Evento referencia evento inexistente: ${parts[2] ?? ""}`);
      return [{ op: "attach_timer_event", frames: Math.max(1, integerPart(operand, 1)), index }];
    }
    case "timer_restart":
    case "timer_remove": {
      const index = eventIndexByName(events, operand);
      if (index < 0) throw new Error(`Evento referencia evento inexistente: ${operand}`);
      return [{ op: verb === "timer_restart" ? "restart_timer_event" : "remove_timer_event", index }];
    }
    case "attach_platform_callback": {
      const index = eventIndexByName(events, parts[2] ?? "");
      if (index < 0) throw new Error(`Evento referencia evento inexistente: ${parts[2] ?? ""}`);
      return [{ op: "attach_platform_callback", callback: operand || "fallStart", index }];
    }
    case "attach_adventure_callback": {
      const index = eventIndexByName(events, parts[2] ?? "");
      if (index < 0) throw new Error(`Evento referencia evento inexistente: ${parts[2] ?? ""}`);
      return [{ op: "attach_adventure_callback", callback: operand.toLowerCase(), index }];
    }
    case "remove_adventure_callback":
    case "remove_platform_callback":
      return [{ op: verb, callback: operand.toLowerCase() }];
    case "pause_scene_type":
    case "resume_scene_type":
      return [{ op: verb, scene_type: operand }];
    case "idle":
      return [{ op: "wait", frames: Number(operand) }];
    case "set_platform_state":
    case "set_platformer_state":
      return [{ op: "set_platformer_state", state: operand || "fall" }];
    case "seed_random":
      return [{ op: "seed_random" }];
    case "end_event":
      return [{ op: "end" }];
    case "open_text_input":
      return [{
        op: "open_text_input",
        variable: registries.textVariableIndex(operand),
        max_length: Math.max(1, Math.min(16, integerPart(parts[2], 8))),
        charset: parts[3] ?? "latin_upper"
      }];
    case "set_variable":
      return [{ op: "set_variable", variable: registries.variableIndex(operand), value: scalarPart(parts[2]) }];
    case "read_rtc":
      return [{ op: "read_rtc", field: operand || "second", variable: registries.variableIndex(parts[2] ?? "") }];
    case "store_engine_field":
      return [{ op: "store_engine_field", field: operand, variable: registries.variableIndex(parts[2]!) }];
    case "store_save_variable":
      return [{ op: "store_save_exists", slot: Number(operand), variable: registries.variableIndex(parts[2]!) }];
    case "data_table_lookup": {
      const rowIndex = integerPart(parts[2], 0);
      const row = lookupPluginDataTableRow(registries.pluginRegistry.dataTables, operand, rowIndex);
      if (!row) {
        throw new Error(`Evento referencia tabela ou linha inexistente: ${operand}[${rowIndex}]`);
      }
      return row.values.flatMap((value, columnIndex) => {
        const variableKey = parts[3 + columnIndex];
        return variableKey
          ? [{ op: "set_variable" as const, variable: registries.variableIndex(variableKey), value }]
          : [];
      });
    }
    case "set_engine_field":
      return [{ op: verb, field: operand, value: scalarPart(parts[2]) }];
    case "set_adventure_state":
      return [{op:"set_adventure_state",index:["ground","dash","knockback","blank","run","push"].indexOf(operand)}];
    case "multiplayer_host":
    case "multiplayer_join":
    case "multiplayer_transfer":
    case "multiplayer_close":
    case "rumble_on":
    case "rumble_on_for":
    case "rumble_off":
    case "multiplayer4_open":
    case "multiplayer4_set":
    case "multiplayer4_sync":
    case "multiplayer4_read":
    case "multiplayer4_close": {
      const linkCommand = parseLinkCableCommand(rawCommand);
      if (!linkCommand) return [];
      return [toEngineLinkCableCommand(linkCommand, {
        eventIndex: (name) => eventIndexByName(events, name),
        variableIndex: (name) => registries.variableIndex(name)
      })];
    }
    case "add_variable":
    case "divide_variable":
    case "mod_variable":
    case "multiply_variable":
      return [{ op: verb, variable: registries.variableIndex(operand), amount: integerPart(parts[2], 0) }];
    case "random_variable":
      return [{ op: verb, variable: registries.variableIndex(operand), min: integerPart(parts[2], 0), max: integerPart(parts[3], 100) }];
    case "add_variable_flags":
    case "set_variable_flags":
    case "clear_variable_flags":
      return [{ op: verb, variable: registries.variableIndex(operand), mask: integerPart(parts[2], 0) }];
    case "reset_variables_false":
      return [{ op: verb }];
    case "set_flag":
      // O motor nao possui um op "set_flag": flags sao variaveis 0/1 (ver GBAStudioEngine/tools/assetc/assetc.py).
      return [{ op: "set_variable", variable: registries.variableIndex(operand), value: booleanPart(parts[2], true) ? 1 : 0 }];
    case "add_item":
      return [{ op: "add_inventory_item", item: registries.itemIndex(operand), quantity: integerPart(parts[2], 1) }];
    case "modify_wallet":
      return [{ op: "modify_wallet", variable: registries.variableIndex(operand), amount: integerPart(parts[2], 0), max: integerPart(parts[3], 0) }];
    case "set_equipped_item":
      return [{ op: "set_equipped_item", slot: integerPart(operand, 0), item: registries.itemIndex(parts[2] ?? "") }];
    case "fade_in":
    case "fade_out":
      return [{ op: verb, frames: Math.max(0, Math.min(600, integerPart(operand, 30))) }];
    case "visual_effect": {
      const effect = operand.trim().toLowerCase();
      const layer = (parts[2] ?? "all").trim().toLowerCase();
      const supportedEffects = new Set([
        "clear",
        "color_fade",
        "fade",
        "letterbox",
        "mask",
        "mosaic",
        "palette_flash",
        "parallax_line_scroll",
        "pull",
        "push",
        "water_ripple",
        "wave"
      ]);
      const supportedLayers = new Set(["all", "bg0", "bg1", "bg2", "bg3", "obj", "screen"]);
      if (!supportedEffects.has(effect)) {
        throw new Error(`Efeito visual desconhecido: ${operand}`);
      }
      if (!supportedLayers.has(layer)) {
        throw new Error(`Alvo de efeito visual desconhecido: ${parts[2] ?? ""}`);
      }
      return [{
        op: "visual_effect",
        effect,
        layer,
        frames: Math.max(0, Math.min(3600, integerPart(parts[3], 30))),
        intensity: Math.max(0, Math.min(100, integerPart(parts[4], 50))),
        ...(parts[5] === "cover" || parts[5] === "reveal" ? { phase: parts[5] } : {})
      }];
    }
    case "camera_follow_player":
      return [{ op: "follow_camera" }];
    case "camera_set_position":
      return [{ op: "set_camera_position", x: integerPart(operand, 0), y: integerPart(parts[2], 0) }];
    case "camera_move":
      return [{ op: "move_camera", x: integerPart(operand, 0), y: integerPart(parts[2], 0) }];
    case "camera_set_bounds":
      return [
        { op: "set_camera_bounds_x", min: integerPart(operand, 0), max: integerPart(parts[3], 0) },
        { op: "set_camera_bounds_y", min: integerPart(parts[2], 0), max: integerPart(parts[4], 0) }
      ];
    case "set_camera_property":
      return [{ op: "set_camera_property", field: operand, value: scalarPart(parts[2]) }];
    case "set_actor_position":
    case "move_actor_to":
    case "teleport_actor": {
      const authored = {
        x: integerPart(parts[2], 0),
        y: integerPart(parts[3], 0)
      };
      const position = actorUsesIsometricCoordinates(data, rooms, operand)
        ? authored : gbaTopdownTilePointToPixels(authored);
      return [{ op: "set_actor_position", actor: eventActorIndex(data, rooms, operand), x: position.x, y: position.y }];
    }
    case "move_actor":
    case "move_actor_relative":
    case "set_actor_relative_position":
      return [{
        op: "move_actor",
        actor: eventActorIndex(data, rooms, operand),
        x: actorUsesIsometricCoordinates(data, rooms, operand) ? integerPart(parts[2], 0) : actorTileDeltaToPixels(Number(parts[2] ?? 0)),
        y: actorUsesIsometricCoordinates(data, rooms, operand) ? integerPart(parts[3], 0) : actorTileDeltaToPixels(Number(parts[3] ?? 0))
      }];
    case "set_actor_visible":
      return [{
        op: "set_actor_visible",
        actor: npcActorIndex(data, rooms, operand),
        value: booleanPart(parts[2], true) ? 1 : 0
      }];
    case "set_actor_active":
      return [{
        op: "set_actor_active",
        actor: eventActorIndex(data, rooms, operand),
        value: booleanPart(parts[2], true) ? 1 : 0
      }];
    case "set_actor_collision_enabled":
      return [{
        op: "set_actor_collision_enabled",
        actor: npcActorIndex(data, rooms, operand),
        value: booleanPart(parts[2], true) ? 1 : 0
      }];
    case "actor_effects":
      return [{ op: "actor_effects", actor: eventActorIndex(data, rooms, operand), index: parts[2] === "shake" ? 1 : 0, frames: Number(parts[3]), intensity: Number(parts[4]) }];
    case "cancel_actor_movement":
      return [{ op: "cancel_actor_movement", actor: eventActorIndex(data, rooms, operand) }];
    case "set_actor_animation_state": {
      const state = authoredAnimationState(data, operand, parts[2] ?? "");
      const sprite = dynamicActorSpriteSheetNames(data).indexOf(animationStateVariantName(state, operand));
      return [{ op: "set_actor_sprite", actor: eventActorIndex(data, rooms, operand), sprite }];
    }
    case "projectile_load_slot": {
      const sprite = dynamicActorSpriteSheetNames(data).indexOf(`${parts[2]}#projectile`);
      if (sprite < 0) throw new Error("Sprite do projétil não resolvido.");
      return [{ op: "projectile_load_slot", slot: Number(parts[1]), sprite, damage: Number(parts[3]), speed: Number(parts[4]) }];
    }
    case "launch_projectile_slot":
      return [{ op: "launch_projectile_slot", actor: operand.toLowerCase() === "player" || isConfiguredPlayerActor(data, operand) ? 0 : npcActorIndex(data, rooms, operand) + 1, slot: Number(parts[2]), direction: parts[3] }];
    case "launch_projectile":
      return [{
        op: "launch_projectile",
        actor: operand.trim().toLowerCase() === "player" || isConfiguredPlayerActor(data, operand)
          ? 0
          : npcActorIndex(data, rooms, operand) + 1,
        direction: parts[2] || "right"
      }];
    case "set_all_sprites_visible":
      return [{
        op: "set_all_sprites_visible",
        value: booleanPart(operand, true) ? 1 : 0
      }];
    case "set_actor_animation_speed":
      return [{
        op: "set_actor_animation_speed",
        actor: npcActorIndex(data, rooms, operand),
        percent: Math.max(1, Math.min(400, integerPart(parts[2], 100)))
      }];
    case "set_actor_sprite": {
      const sprite = dynamicActorSpriteSheetNames(data).indexOf(parts[2] ?? "");
      if (sprite < 0) throw new Error(`Evento referencia sprite dinamico inexistente: ${parts[2] ?? ""}`);
      return [{
        op: "set_actor_sprite",
        actor: eventConditionActorIndex(data, rooms, operand),
        sprite
      }];
    }
    case "change_actor_sprite": {
      const sprite = dynamicActorSpriteSheetNames(data).indexOf(parts[2] ?? "");
      if (sprite < 0) throw new Error(`Evento referencia sprite dinamico inexistente: ${parts[2] ?? ""}`);
      return [{
        op: "set_actor_sprite",
        actor: eventConditionActorIndex(data, rooms, operand),
        sprite
      }];
    }
    case "change_player_sprite": {
      const sprite = dynamicActorSpriteSheetNames(data).indexOf(parts[1] ?? "");
      if (sprite < 0) throw new Error(`Evento referencia sprite dinamico inexistente: ${parts[1] ?? ""}`);
      return [{
        op: "set_actor_sprite",
        actor: -1,
        sprite
      }];
    }
  case "set_background_palette":
      return [{
        op: "set_background_palette",
        index: integerPart(parts[1], 0),
        frames: Math.max(0, Math.min(600, integerPart(parts[2], 0)))
      }];
  case "set_sprite_palette":
      return [{
        op: "set_sprite_palette",
        index: integerPart(parts[1], 0),
        frames: Math.max(0, Math.min(600, integerPart(parts[2], 0)))
      }];
  case "restore_colors":
      return [{
        op: "set_background_palette",
        index: 0,
        frames: 0
      }, {
        op: "set_sprite_palette",
        index: 0,
        frames: 0
      }];
    case "show_actor_gesture": {
      const index = uniqueDialogueEmoteNames(data).indexOf(parts[2] ?? "");
      if (index < 0) throw new Error(`Evento referencia emote inexistente: ${parts[2] ?? ""}`);
      return [{
        op: "show_actor_gesture",
        actor: eventConditionActorIndex(data, rooms, operand),
        index,
        frames: Math.max(1, Math.min(600, integerPart(parts[3], 60)))
      }];
    }
    case "player_bounce":
      return [{
        op: "player_bounce",
        height_tiles: Math.max(1, Math.min(8, integerPart(operand, 1))),
        frames: Math.max(1, Math.min(120, integerPart(parts[2], 20)))
      }];
    case "set_actor_collision_box":
      return [{
        op: "set_actor_collision_box",
        actor: npcActorIndex(data, rooms, operand),
        offset_x: integerPart(parts[2], 0),
        offset_y: integerPart(parts[3], 0),
        width: Math.max(0, integerPart(parts[4], 16)),
        height: Math.max(0, integerPart(parts[5], 16))
      }];
    case "set_player_speed_profile":
      return [{
        op: "set_player_speed_profile",
        walk_speed: Math.max(1, integerPart(operand, 100)),
        run_speed: Math.max(1, integerPart(parts[2], 160)),
        stamina_cost: Math.max(0, integerPart(parts[4], 0))
      }];
    case "set_player_movement_state":
      return [{
        op: "set_player_movement_state",
        state: operand || "normal",
        tile_tag: parts[2] ?? ""
      }];
    case "store_actor_position":
      return [{
        op: "store_actor_position",
        actor: npcActorIndex(data, rooms, operand),
        variable_x: registries.variableIndex(parts[2] ?? ""),
        variable_y: registries.variableIndex(parts[3] ?? "")
      }];
    case "store_actor_direction":
      return [{
        op: "store_actor_direction",
        actor: npcActorIndex(data, rooms, operand),
        variable: registries.variableIndex(parts[2] ?? "")
      }];
    case "set_random_seed":
      return [{ op: "set_random_seed", variable: registries.variableIndex(operand) }];
    case "wait_button":
      return [{ op: "wait_button", button: operand || "a" }];
    case "set_stat":
      return [{
        op: "set_stat",
        stat: operand || "hp",
        current: integerPart(parts[2], 0),
        max: integerPart(parts[3], integerPart(parts[2], 0))
      }];
    case "wait":
      return [{ op: "wait", frames: Math.max(0, Math.min(600, integerPart(operand, 0))) }];
    case "stop_music":
      return [{ op: "stop_music" }];
    case "close_dialogue":
      return [{ op: "close_dialogue" }];
    case "save_game":
    case "load_game":
    case "remove_save_game":
      return operand
        ? [{ op: verb, slot: Math.max(0, Math.min(255, integerPart(operand, 0))) }]
        : [{ op: verb }];
    case "set_actor_animation": {
      const animationName = parts[2] ?? "";
      if (!animationName) throw new Error(`Comando incompleto: set_actor_animation requer animacao.`);
      if (operand.trim().toLowerCase() === "player" || isConfiguredPlayerActor(data, operand)) {
        return [{ op: "set_player_animation", animation: animationName }];
      }
      return [{
        op: "set_actor_animation",
        actor: npcActorIndex(data, rooms, operand),
        animation: animationName
      }];
    }
    case "set_actor_direction":
    case "turn_actor": {
      const direction = parts[2] ?? "down";
      return [{
        op: "set_actor_direction",
        actor: eventActorIndex(data, rooms, operand),
        direction
      }];
    }
    case "camera_lock_player":
      return [{ op: "lock_camera" }];
    case "shake_screen":
      return [{
        op: "set_camera_shake",
        frames: Math.max(0, Math.min(600, integerPart(operand, 20))),
        magnitude: Math.max(0, Math.min(16, integerPart(parts[2], 2)))
      }];
    case "modify_stat":
      return [{
        op: "modify_stat",
        stat: operand,
        delta: integerPart(parts[2], 0)
      }];
    case "show_stat_bar":
      return [{
        op: "show_stat_bar",
        stat: operand,
        x: integerPart(parts[2], 8),
        width: integerPart(parts[4], 64)
      }];
    case "show_hearts":
      return [{
        op: "show_hearts",
        stat: operand,
        units_per_heart: integerPart(parts[2], 4),
        hearts: integerPart(parts[3], 4)
      }];
    case "show_number_hud":
      return [{
        op: "show_number_hud",
        variable: registries.variableIndex(operand),
        x: integerPart(parts[2], 200),
        digits: integerPart(parts[4], 3)
      }];
    case "replace_tile":
      return [{
        op: "replace_tile",
        x: integerPart(parts[1], 0),
        y: integerPart(parts[2], 0),
        tile: integerPart(parts[3], 0),
        layer: parts[4] ?? "bg0",
        count: 1
      }];
    case "replace_tile_sequence":
      return [{
        op: "replace_tile",
        x: integerPart(parts[1], 0),
        y: integerPart(parts[2], 0),
        tile: integerPart(parts[3], 0),
        count: Math.max(1, Math.min(64, integerPart(parts[4], 1))),
        layer: parts[5] ?? "bg0"
      }];
    case "replace_tile_animation":
      {
        const tilesetName = parts[6] ?? "";
        const tilesetPack = tilesetName ? buildAssetcTilesetPackGeneration(data) : null;
        const tilesetAsset = tilesetName ? tilesetPack?.assetsBySheet[tilesetName] : undefined;
        if (tilesetName && (!tilesetPack || !tilesetAsset)) {
          throw new Error(`Evento referencia tileset inexistente: ${tilesetName}`);
        }
        const tileAssetIndex = tilesetAsset && tilesetPack
          ? tilesetPack.assetNames.indexOf(tilesetAsset.name)
          : -1;
        return [{
          op: "replace_tile_sequence",
          x: integerPart(parts[1], 0),
          y: integerPart(parts[2], 0),
          tile: integerPart(parts[3], 0),
          frames: Math.max(1, Math.min(255, integerPart(parts[4], 1))),
          variable: registries.variableIndex(parts[5] ?? ""),
          ...(tileAssetIndex >= 0 ? { tile_asset: tileAssetIndex } : {})
        }];
      }
    case "set_actor_movement_speed":
      return [{
        op: "set_actor_speed",
        actor: eventActorIndex(data, rooms, operand),
        speed: integerPart(parts[2], 100)
      }];
    case "push_actor_away_from_player":
      return [{
        op: "push_actor_away_from_player",
        actor: npcActorIndex(data, rooms, operand),
        distance: Math.max(1, integerPart(parts[2], 2))
      }];
    case "wait_actor_animation":
      return [{ op: "wait_actor_animation", actor: npcActorIndex(data, rooms, operand) }];
    case "play_actor_animation": {
      const animationName = parts[2] ?? "";
      if (!animationName) throw new Error(`Comando incompleto: play_actor_animation requer animacao.`);
      if (isConfiguredPlayerActor(data, operand)) {
        return [{ op: "set_player_animation", animation: animationName }];
      }
      return [{
        op: "set_actor_animation",
        actor: npcActorIndex(data, rooms, operand),
        animation: animationName
      }];
    }
    case "set_actor_animation_frame":
      return [{
        op: "set_actor_animation_frame",
        actor: npcActorIndex(data, rooms, operand),
        frame: integerPart(parts[2], 0)
      }];
    case "lock_script":
    case "unlock_script": {
      const index = eventIndexByName(events, operand);
      if (index < 0) throw new Error(`Evento referencia evento inexistente: ${operand}`);
      return [{ op: verb, index }];
    }
    case "overlay_line":
      return [{ op: "overlay_line", line: integerPart(operand, 0) }];
    case "overlay_show":
      return [{
        op: "overlay_show",
        x: Math.max(0, Math.min(240, integerPart(operand, 0))),
        y: Math.max(0, Math.min(160, integerPart(parts[2], 0))),
        width: Math.max(0, Math.min(240, integerPart(parts[3], 160))),
        height: Math.max(0, Math.min(160, integerPart(parts[4], 40)))
      }];
    case "overlay_move":
      return [{
        op: "overlay_move",
        x: Math.max(0, Math.min(240, integerPart(operand, 0))),
        y: Math.max(0, Math.min(160, integerPart(parts[2], 0))),
        frames: Math.max(0, Math.min(600, integerPart(parts[3], 30)))
      }];
    case "overlay_hide":
      return [{ op: "overlay_hide", frames: Math.max(0, Math.min(600, integerPart(operand, 30))) }];
    case "set_dialogue_text_speed":
      return [{ op: "set_dialogue_text_speed", frames: Math.max(0, Math.min(255, integerPart(operand, 2))) }];
    case "set_language": {
      const locale = operand === "pt-BR" ? 1 : operand === "en" ? 2 : operand === "es" ? 3 : 0;
      if (locale === 0) throw new Error(`Idioma de dialogo nao suportado: ${operand}.`);
      return [{ op: "set_dialogue_language", locale }];
    }
    case "set_dialogue_frame":
      return [{ op: "set_dialogue_frame", index: integerPart(operand, 0) }];
    case "set_text_sfx": {
      const resolved = resolveAudioPlayback(audioItems, audioPack, operand);
      if (!resolved) throw new Error(`Evento referencia audio inexistente: ${operand}`);
      return [{ op: "set_text_sfx", sfx: resolved.index }];
    }
    case "choice_event":
      // Binding resolvido em compile-time por buildTopdownChoiceGroups (choice_groups[].choices[].script);
      // o motor nao "registra" isso em runtime como o preview faz, entao nao vira opcode inline aqui.
      return [];
    case "switch_variable":
      return compileSwitchVariable(parts, events, registries);
    case "repeat_expression":
      return compileRepeatExpression(parts, events, registries);
    default:
      if (eventCommandSupport(verb).handling === "runtime") throw new Error(`Comando ${verb} não possui compilador de ROM.`);
      return [];
  }
}

// O editor trata "if_X" como "pula a proxima instrucao se a condicao for falsa" - guarda
// exatamente 1 instrucao, nao um bloco. O motor real nao tem esse conceito: so
// possui "jump"/"jump_if_*" com offset relativo (ver GBAStudioEngine/engine/src/gbs_event.cpp,
// jump_relative). Compilamos cada guarda para o par universal:
//   [0] jump_if_<condicao> ... offset=2   -> se verdadeiro, pula o "jump" de baixo (executa a guarda)
//   [1] jump offset=1+N                    -> se a guarda [0] nao pulou (condicao falsa), pula as N
//                                              instrucoes da guarda
//   [2..] N instrucoes compiladas da instrucao guardada
function compileConditionJumpBase(
  data: GBAProjectData,
  verb: string,
  parts: string[],
  rooms: Record<string, unknown>[],
  registries: EngineExportEventValueRegistries
): EngineExportProjectEventCommand | null {
  const key = parts[1] ?? "";
  switch (verb) {
    case "if_variable":
      return { op: "jump_if_variable_equals", variable: registries.variableIndex(key), value: integerPart(parts[2], 0) };
    case "if_variable_greater_than":
      return { op: "jump_if_variable_greater_than", variable: registries.variableIndex(key), value: integerPart(parts[2], 0) };
    case "if_variable_less_than":
      return { op: "jump_if_variable_less_than", variable: registries.variableIndex(key), value: integerPart(parts[2], 0) };
    case "if_variable_variable":
      return {
        op: "jump_if_variable_equals_variable",
        variable: registries.variableIndex(key),
        other_variable: registries.variableIndex(parts[2] ?? "")
      };
    case "if_flag":
      return { op: "jump_if_variable_equals", variable: registries.variableIndex(key), value: booleanPart(parts[2], true) ? 1 : 0 };
    case "has_item":
      return { op: "jump_if_inventory_at_least", item: registries.itemIndex(key), quantity: integerPart(parts[2], 1) };
    case "if_scene": {
      const room = roomIndexByName(rooms, key);
      if (room < 0) throw new Error(`Evento referencia room inexistente: ${key}`);
      return { op: "jump_if_room_equals", room };
    }
    case "if_save_game":
      return { op: "jump_if_save_exists", slot: Math.max(0, Math.min(255, integerPart(parts[1], 0))) };
    case "if_engine_field":
      return { op: "jump_if_engine_field_equals", field: key, value: integerPart(parts[2], 0) };
    case "if_engine_field_variable":
      return {
        op: "jump_if_engine_field_equals_variable",
        field: key,
        variable: registries.variableIndex(parts[2] ?? "")
      };
    case "if_rtc":
      return { op: "if_rtc", field: key || "second", value: integerPart(parts[2], 0) };
    case "if_button":
      return { op: "jump_if_button_pressed", button: key || "a" };
    case "if_actor_direction":
      return {
        op: "jump_if_actor_direction",
        actor: eventConditionActorIndex(data, rooms, key),
        direction: parts[2] ?? "down"
      };
    case "if_actor_at_position":
      return {
        op: "jump_if_actor_at_position",
        actor: eventConditionActorIndex(data, rooms, key),
        x: integerPart(parts[2], 0),
        y: integerPart(parts[3], 0)
      };
    case "if_actor_distance":
      return {
        op: "jump_if_actor_distance",
        actor: eventConditionActorIndex(data, rooms, key),
        other_actor: eventConditionActorIndex(data, rooms, parts[2] ?? ""),
        distance: Math.max(0, integerPart(parts[3], 0))
      };
    case "if_actor_relative":
      return {
        op: "jump_if_actor_relative",
        actor: eventConditionActorIndex(data, rooms, key),
        other_actor: eventConditionActorIndex(data, rooms, parts[2] ?? ""),
        relation: parts[3] ?? "left"
      };
    default:
      return null;
  }
}

function isElseEventStep(step: Record<string, unknown>): boolean {
  return commandParts(stringField(step, "command", "noop"))[0] === "else";
}

function isStopEventStep(step: Record<string, unknown>): boolean {
  return commandParts(stringField(step, "command", "noop"))[0] === "stop_event";
}

function isConditionEndEventStep(step: Record<string, unknown>): boolean {
  return commandParts(stringField(step, "command", "noop"))[0] === "condition_end";
}

function isConditionEventStep(
  data: GBAProjectData,
  step: Record<string, unknown>,
  rooms: Record<string, unknown>[],
  registries: EngineExportEventValueRegistries
): boolean {
  const parts = commandParts(stringField(step, "command", "noop"));
  return compileConditionJumpBase(data, parts[0] ?? "noop", parts, rooms, registries) !== null;
}

function compileEventStepsSlice(
  data: GBAProjectData,
  steps: Record<string, unknown>[],
  rooms: Record<string, unknown>[],
  dialogues: Record<string, unknown>[],
  audioItems: Record<string, unknown>[],
  audioPack: AssetcAudioPackGeneration | null,
  events: Record<string, unknown>[],
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry(),
  campaignRoom?: Record<string, unknown>
): EngineExportProjectEventCommand[] {
  if (steps.length === 0) return [];
  return compileEvent(data, { steps }, rooms, dialogues, audioItems, audioPack, events, pluginRegistry, campaignRoom);
}

// O motor real possui "jump"/"jump_if_*" com offset relativo (ver GBAStudioEngine/engine/src/gbs_event.cpp,
// jump_relative). Compilamos cada guarda para o par universal:
//   [0] jump_if_<condicao> ... offset=2   -> se verdadeiro, pula o "jump" de baixo (executa a guarda)
//   [1] jump offset=1+N                    -> se a guarda [0] nao pulou (condicao falsa), pula as N
//                                              instrucoes da guarda
//   [2..] N instrucoes compiladas da instrucao guardada
// Com "else", o padrao vira:
//   jump_if offset=2
//   jump offset=trueLen+2
//   ...trueLen instrucoes
//   jump offset=falseLen+1
//   ...falseLen instrucoes
function compileEvent(
  data: GBAProjectData,
  event: Record<string, unknown>,
  rooms: Record<string, unknown>[],
  dialogues: Record<string, unknown>[],
  audioItems: Record<string, unknown>[],
  audioPack: AssetcAudioPackGeneration | null,
  events: Record<string, unknown>[],
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry(),
  campaignRoom?: Record<string, unknown>
): EngineExportProjectEventCommand[] {
  const registries = buildEventValueRegistries(
    events,
    pluginRegistry,
    [],
    [],
    sceneRouteVariableKeys(data),
    projectVariableKeys(data)
  );
  const resolvedCampaignRoom = campaignRoom ?? campaignRoomForEvent(data, event);
  const steps = sceneConnectionEventSteps(data, eventSteps(event), resolvedCampaignRoom);
  const commands: EngineExportProjectEventCommand[] = [];

  for (let index = 0; index < steps.length; index += 1) {
    const parts = commandParts(resolveProjectConstantCommand(data, stringField(steps[index], "command", "noop")));
    if (parts[0] === "loop_begin") {
      const loopID = parts[1] ?? "";
      let cursor = index + 1;
      let nesting = 1;
      const bodySteps: Record<string, unknown>[] = [];
      for (; cursor < steps.length; cursor += 1) {
        const nestedParts = commandParts(stringField(steps[cursor], "command", "noop"));
        if (nestedParts[0] === "loop_begin") nesting += 1;
        if (nestedParts[0] === "loop_end") {
          nesting -= 1;
          if (nesting === 0 && (!loopID || !nestedParts[1] || nestedParts[1] === loopID)) break;
        }
        bodySteps.push(steps[cursor]);
      }
      const bodyCommands = compileEventStepsSlice(
        data,
        bodySteps,
        rooms,
        dialogues,
        audioItems,
        audioPack,
        events,
        pluginRegistry,
        resolvedCampaignRoom
      );
      commands.push(...bodyCommands);
      if (bodyCommands.length > 0) commands.push({ op: "jump", offset: -bodyCommands.length });
      index = cursor < steps.length ? cursor : steps.length - 1;
      continue;
    }
    if (parts[0] === "loop_end") continue;
    if (parts[0] === "condition_end") continue;
    if (parts[0] === "rate_limit") {
      let cursor = index + 1;
      let nesting = 1;
      const bodySteps: Record<string, unknown>[] = [];
      for (; cursor < steps.length; cursor += 1) {
        const nestedVerb = commandParts(stringField(steps[cursor], "command", "noop"))[0];
        if (nestedVerb === "rate_limit") nesting += 1;
        if (nestedVerb === "rate_limit_end") {
          nesting -= 1;
          if (nesting === 0) break;
        }
        bodySteps.push(steps[cursor]);
      }
      const hasEndMarker = cursor < steps.length && nesting === 0;
      const guardedSteps = hasEndMarker ? bodySteps : steps.slice(index + 1, index + 2);
      const guardedCommands = compileEventStepsSlice(
        data,
        guardedSteps,
        rooms,
        dialogues,
        audioItems,
        audioPack,
        events,
        pluginRegistry,
        resolvedCampaignRoom
      );
      commands.push({
        op: "rate_limit",
        slot: Math.max(0, Math.min(31, integerPart(parts[2], index % 32))),
        frames: Math.max(1, integerPart(parts[1], 1)),
        offset: guardedCommands.length + 1
      });
      commands.push(...guardedCommands);
      index = hasEndMarker ? cursor : Math.min(index + 1, steps.length - 1);
      continue;
    }
    if (parts[0] === "rate_limit_end") continue;
    const conditionJump = compileConditionJumpBase(data, parts[0] ?? "noop", parts, rooms, registries);
    if (conditionJump) {
      let structuredElseIndex = -1;
      let structuredEndIndex = -1;
      let conditionNesting = 0;
      for (let cursor = index + 1; cursor < steps.length; cursor += 1) {
        if (isConditionEventStep(data, steps[cursor], rooms, registries)) {
          conditionNesting += 1;
          continue;
        }
        if (isConditionEndEventStep(steps[cursor])) {
          if (conditionNesting === 0) {
            structuredEndIndex = cursor;
            break;
          }
          conditionNesting -= 1;
          continue;
        }
        if (conditionNesting === 0 && structuredElseIndex < 0 && isElseEventStep(steps[cursor])) {
          structuredElseIndex = cursor;
        }
      }

      if (structuredEndIndex >= 0) {
        const trueEnd = structuredElseIndex >= 0 ? structuredElseIndex : structuredEndIndex;
        const trueSteps = steps.slice(index + 1, trueEnd);
        const falseSteps = structuredElseIndex >= 0
          ? steps.slice(structuredElseIndex + 1, structuredEndIndex)
          : [];
        const trueCommands = compileEventStepsSlice(data, trueSteps, rooms, dialogues, audioItems, audioPack, events, pluginRegistry, resolvedCampaignRoom);
        const falseCommands = compileEventStepsSlice(data, falseSteps, rooms, dialogues, audioItems, audioPack, events, pluginRegistry, resolvedCampaignRoom);
        commands.push({ ...conditionJump, offset: 2 });
        commands.push({ op: "jump", offset: trueCommands.length + (structuredElseIndex >= 0 ? 2 : 1) });
        commands.push(...trueCommands);
        if (structuredElseIndex >= 0) {
          commands.push({ op: "jump", offset: falseCommands.length + 1 });
          commands.push(...falseCommands);
        }
        index = structuredEndIndex;
        continue;
      }

      let cursor = index + 1;
      const trueSteps: Record<string, unknown>[] = [];
      while (cursor < steps.length && !isElseEventStep(steps[cursor])) {
        trueSteps.push(steps[cursor]);
        cursor += 1;
      }

      if (cursor < steps.length && isElseEventStep(steps[cursor])) {
        cursor += 1;
        const falseSteps: Record<string, unknown>[] = [];
        while (cursor < steps.length && !isConditionEventStep(data, steps[cursor], rooms, registries)) {
          falseSteps.push(steps[cursor]);
          cursor += 1;
        }

        const trueCommands = compileEventStepsSlice(data, trueSteps, rooms, dialogues, audioItems, audioPack, events, pluginRegistry, resolvedCampaignRoom);
        const falseCommands = compileEventStepsSlice(data, falseSteps, rooms, dialogues, audioItems, audioPack, events, pluginRegistry, resolvedCampaignRoom);
        commands.push({ ...conditionJump, offset: 2 });
        commands.push({ op: "jump", offset: trueCommands.length + 2 });
        commands.push(...trueCommands);
        commands.push({ op: "jump", offset: falseCommands.length + 1 });
        commands.push(...falseCommands);
        index = cursor - 1;
        continue;
      }

      const guardedStep = steps[index + 1];
      const guardedCommands = guardedStep
        ? compileEventStep(data, guardedStep, rooms, dialogues, audioItems, audioPack, events, registries, resolvedCampaignRoom)
        : [];
      commands.push({ ...conditionJump, offset: 2 });
      commands.push({ op: "jump", offset: 1 + guardedCommands.length });
      commands.push(...guardedCommands);
      index += 1;
      continue;
    }

    if (isElseEventStep(steps[index])) {
      continue;
    }

    if (isStopEventStep(steps[index])) {
      const remainingSteps = steps.slice(index + 1);
      const remainingCommands = compileEventStepsSlice(data, remainingSteps, rooms, dialogues, audioItems, audioPack, events, pluginRegistry, resolvedCampaignRoom);
      if (remainingCommands.length > 0) {
        commands.push({ op: "jump", offset: remainingCommands.length });
      }
      break;
    }

    commands.push(...compileEventStep(data, steps[index], rooms, dialogues, audioItems, audioPack, events, registries, resolvedCampaignRoom));
  }

  return commands;
}

function eventByName(events: Record<string, unknown>[], name: string): Record<string, unknown> | undefined {
  return events.find((event, index) => normalizeGBAEventDocument(event, index).name === name);
}

function resolveTriggerEnterEventName(trigger: Record<string, unknown>): string {
  const entityDocument = normalizeGBAEntityDocument(trigger, "trigger");
  return entityDocument.eventBindings.onEnter
    || nullableStringField(trigger, "onEnterEventName")
    || entityDocument.eventName
    || "";
}

function resolveTriggerInteractEventName(trigger: Record<string, unknown>): string {
  const entityDocument = normalizeGBAEntityDocument(trigger, "trigger");
  return entityDocument.eventBindings.onInteract
    || nullableStringField(trigger, "onInteractEventName")
    || "";
}

function resolveTriggerLeaveEventName(trigger: Record<string, unknown>): string {
  const entityDocument = normalizeGBAEntityDocument(trigger, "trigger");
  return entityDocument.eventBindings.onLeave
    || nullableStringField(trigger, "onLeaveEventName")
    || "";
}

function resolveActorInteractEventName(actor: Record<string, unknown>): string {
  const entityDocument = normalizeGBAEntityDocument(actor, "actor");
  return entityDocument.eventBindings.onInteract
    || entityDocument.eventName
    || "";
}

function resolveActorInitEventName(actor: Record<string, unknown>): string {
  return nullableStringField(child(actor, "eventBindings"), "onInit");
}

function resolveActorBindingEventName(actor: Record<string, unknown>, bindingKey: string): string {
  const eventBindings = child(actor, "eventBindings");
  return nullableStringField(eventBindings, bindingKey)
    || (bindingKey === "onHitPlayer" ? nullableStringField(eventBindings, "onHit") : null)
    || "";
}

function resolveActorOnUpdateEventName(actor: Record<string, unknown>): string {
  const eventBindings = child(actor, "eventBindings");
  return nullableStringField(eventBindings, "onUpdate")
    || nullableStringField(actor, "onUpdateEventName");
}

function mergeRoomOnEnterScript(
  boot: EngineExportProjectEventCommand[],
  onEnter: EngineExportProjectEventCommand[] | undefined
): EngineExportProjectEventCommand[] | undefined {
  const merged = [...boot, ...(onEnter ?? [])];
  return merged.length > 0 ? merged : undefined;
}

const DEFAULT_DIALOGUE_TEXT_SPEED_FRAMES = 2;
const DEFAULT_DIALOGUE_FRAME_INDEX = 0;

function dialogueUiBootCommands(
  data: GBAProjectData,
  audioItems: Record<string, unknown>[],
  audioPack: AssetcAudioPackGeneration | null
): EngineExportProjectEventCommand[] {
  const uiDialogs = child(settings(data), "uiDialogs");
  const commands: EngineExportProjectEventCommand[] = [];
  const textSpeedFrames = buildEngineDialogueTextSpeedFrames(uiDialogs);
  if (textSpeedFrames !== DEFAULT_DIALOGUE_TEXT_SPEED_FRAMES) {
    commands.push({ op: "set_dialogue_text_speed", frames: textSpeedFrames });
  }
  const frameIndex = buildEngineDialogueFrameIndex(uiDialogs);
  if (frameIndex !== DEFAULT_DIALOGUE_FRAME_INDEX) {
    commands.push({ op: "set_dialogue_frame", index: frameIndex });
  }
  const characterSound = buildEngineDialogueCharacterSound(uiDialogs);
  if (!characterSound) return commands;

  const candidates = Array.from(new Set([
    characterSound,
    characterSound.endsWith(".wav") ? characterSound : `${characterSound}.wav`
  ]));
  for (const candidate of candidates) {
    const resolved = resolveAudioPlayback(audioItems, audioPack, candidate);
    if (!resolved) continue;
    commands.push({ op: "set_text_sfx", sfx: resolved.index });
    break;
  }
  return commands;
}

function scriptForEventName(
  data: GBAProjectData,
  eventName: string,
  events: Record<string, unknown>[],
  rooms: Record<string, unknown>[],
  dialogues: Record<string, unknown>[],
  audioItems: Record<string, unknown>[],
  audioPack: AssetcAudioPackGeneration | null,
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()
): EngineExportProjectEventCommand[] | undefined {
  if (!eventName) return undefined;
  const event = eventByName(events, eventName);
  return event ? compileEvent(data, event, rooms, dialogues, audioItems, audioPack, events, pluginRegistry) : undefined;
}

function drawTextLiteralLines(data: GBAProjectData): string[] {
  return [...new Set(projectArray(data,"events").flatMap(event=>eventSteps(event).filter(step=>step.isEnabled!==false).flatMap(step=>{
    const parts=commandParts(stringField(step,"command",""));return parts[0]==="draw_text" ? [parts.slice(4).join(" ")] : [];
  })))];
}

function buildDialogueLines(
  data: GBAProjectData,
  dialogues: Record<string, unknown>[],
  audioItems: Record<string, unknown>[] = [],
  audioPack: AssetcAudioPackGeneration | null = null
): EngineExportDialogueLine[] {
  const localization = deriveProjectLocalization(data);
  return [...dialogues,...drawTextLiteralLines(data).map(text=>({text}))].map((dialogue) => {
    const line: EngineExportDialogueLine = {
      text: nullableStringField(dialogue, "text"),
      speaker: nullableStringField(dialogue, "character") || nullableStringField(dialogue, "speaker"),
      portrait: nullableStringField(dialogue, "portrait"),
      key: nullableStringField(dialogue, "key")
    };
    const portraitSlot = nullableStringField(dialogue, "portraitSlot").toLowerCase();
    if (portraitSlot === "esquerda" || portraitSlot === "left") line.portrait_slot = "left";
    if (portraitSlot === "direita" || portraitSlot === "right") line.portrait_slot = "right";
    const translations = dialogueTranslations(dialogue)
      ? localization.enabledLocales
          .filter((locale) => locale !== localization.sourceLocale)
          .map((locale) => ({ locale, text: dialogueTranslations(dialogue)[locale] ?? "" }))
          .filter((entry) => entry.text.length > 0)
      : [];
    if (translations.length > 0) {
      line.source_locale = localization.sourceLocale;
      line.default_locale = localization.defaultLocale;
      line.translations = translations;
    }
    const emote = nullableStringField(dialogue, "emote");
    const textSound = nullableStringField(dialogue, "textSound");
    const confirmSound = nullableStringField(dialogue, "confirmSound");
    if (emote) line.emote = emote;
    if (textSound) line.text_sound = textSound;
    if (confirmSound) {
      line.confirm_sound = confirmSound;
      const resolved = resolveAudioPlayback(audioItems, audioPack, confirmSound);
      if (resolved?.op === "play_sfx") line.confirm_sfx = resolved.index;
      if (resolved?.op === "play_pcm_sfx") line.confirm_pcm = resolved.index;
    }
    return line;
  });
}

function compileDialogueTextSfxCommand(
  dialogue: Record<string, unknown> | undefined,
  audioItems: Record<string, unknown>[],
  audioPack: AssetcAudioPackGeneration | null
): EngineExportProjectEventCommand | null {
  const textSound = dialogue ? nullableStringField(dialogue, "textSound") : "";
  if (!textSound) return null;
  const resolved = resolveAudioPlayback(audioItems, audioPack, textSound);
  if (!resolved) return null;
  return { op: "set_text_sfx", sfx: resolved.index };
}

function dialogueRecordByKey(
  dialogues: Record<string, unknown>[],
  key: string
): Record<string, unknown> | undefined {
  const index = dialogueIndexByKey(dialogues, key);
  return index >= 0 ? dialogues[index] : undefined;
}

// O motor real (assetc: emit_topdown_project_scripts) enderaca "scripts" pela posicao no array
// (CallScript.a referencia o indice, nao o nome) - o mesmo indice calculado por eventIndexByName
// a partir do array bruto de eventos. Por isso NAO podemos descartar eventos cujo script compilado
// fica vazio (ex.: um evento que so contem "choice_event", resolvido em compile-time para
// choice_groups): descartar entradas deslocaria os indices de todo call_event subsequente.
function buildTopdownScripts(
  data: GBAProjectData,
  events: Record<string, unknown>[],
  rooms: Record<string, unknown>[],
  dialogues: Record<string, unknown>[],
  audioItems: Record<string, unknown>[],
  audioPack: AssetcAudioPackGeneration | null,
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry(),
  includeStartMenuBinding = false,
  startMenuRuntime: MixedRuntimeKind = "topdown"
): EngineExportProjectScript[] {
  const expansion = expandEventProcedures(events);
  if (expansion.issues.length > 0) {
    throw new Error(`Procedures invalidas: ${expansion.issues.join(" | ")}`);
  }
  const materializedEvents = expansion.events;
  const runtimeRoomNames = new Set(rooms.map((room, index) => roomName(room, index)));
  const documents = materializedEvents.map((event, index) => normalizeGBAEventDocument(event, index));
  const owners = documents.map(document => document.sceneName ? new Set([document.sceneName]) : new Set([
    ...eventSceneBindings(data, document.name), ...eventSceneBindings(data, document.id)
  ]));
  // Unbound callees inherit their callers' scenes, including callback and timer
  // targets. Keep empty entries in other runtimes so numeric script IDs stay stable.
  const callees = materializedEvents.map(event => eventSteps(event).flatMap(step =>
    nativeEventCommandReferencedEvents(stringField(step, "command", "noop"))
  ).map(reference => eventIndexByName(materializedEvents, reference)).filter(index => index >= 0));
  let changed = true;
  while (changed) {
    changed = false;
    callees.forEach((targets, caller) => targets.forEach(target => {
      if (documents[target]!.sceneName) return;
      for (const sceneName of owners[caller]!) {
        if (!owners[target]!.has(sceneName)) { owners[target]!.add(sceneName); changed = true; }
      }
    }));
  }
  const scripts = materializedEvents.map((event, index) => {
    const eventDocument = documents[index]!;
    const boundSceneNames = owners[index]!;
    const belongsToAnotherRuntime = boundSceneNames.size > 0
      && !Array.from(boundSceneNames).some((sceneName) => runtimeRoomNames.has(sceneName));
    return {
      name: eventDocument.name,
      script: belongsToAnotherRuntime
        ? []
        : compileEvent(data, event, rooms, dialogues, audioItems, audioPack, materializedEvents, pluginRegistry)
    };
  });
  const startMenuScreen = includeStartMenuBinding ? startMenuScreenIndex(data) : -1;
  if (startMenuScreen >= 0) {
    scripts.push({
      name: "__gbastudio_start_menu__",
      script: [
        { op: "scene_stack_push", runtime: startMenuRuntime },
        { op: "warp_runtime", runtime: "menu", room: startMenuScreen, x: 0, y: 0 }
      ]
    });
  }
  return scripts;
}

function dialogueChoices(dialogue: Record<string, unknown>): string[] {
  return Array.isArray(dialogue.choices) ? dialogue.choices.filter((choice): choice is string => typeof choice === "string") : [];
}

function choiceEventBindings(events: Record<string, unknown>[]): Map<string, Map<number, string>> {
  const bindings = new Map<string, Map<number, string>>();
  for (const event of events) {
    for (const step of eventSteps(event)) {
      const parts = commandParts(stringField(step, "command", "noop"));
      if ((parts[0] ?? "") !== "choice_event") continue;
      const dialogueKey = parts[1] ?? "";
      const choiceIndex = integerPart(parts[2], -1);
      const targetEventName = parts[3] ?? "";
      if (!dialogueKey || choiceIndex < 0 || !targetEventName) continue;
      const byChoiceIndex = bindings.get(dialogueKey) ?? new Map<number, string>();
      byChoiceIndex.set(choiceIndex, targetEventName);
      bindings.set(dialogueKey, byChoiceIndex);
    }
  }
  return bindings;
}

function buildTopdownChoiceGroups(
  data: GBAProjectData,
  dialogues: Record<string, unknown>[],
  events: Record<string, unknown>[],
  rooms: Record<string, unknown>[],
  audioItems: Record<string, unknown>[],
  audioPack: AssetcAudioPackGeneration | null
): EngineExportTopdownChoiceGroup[] {
  const bindings = choiceEventBindings(events);
  const localization = deriveProjectLocalization(data);
  return dialogues.flatMap((dialogue, dialogueIndex) => {
    const choices = dialogueChoices(dialogue);
    if (choices.length === 0) return [];
    const dialogueKey = stringField(dialogue, "key", "");
    const eventNameByChoiceIndex = bindings.get(dialogueKey);
    return [{
      line: dialogueIndex,
      choices: choices.map((text, index) => {
        const translationsByLocale = dialogueChoiceTranslations(dialogue);
        const translations = localization.enabledLocales
          .filter((locale) => locale !== localization.sourceLocale)
          .map((locale) => ({ locale, text: translationsByLocale[locale]?.[index] ?? "" }))
          .filter((entry) => entry.text.length > 0);
        const localized = translations.length > 0 ? {
          source_locale: localization.sourceLocale,
          default_locale: localization.defaultLocale,
          translations
        } : {};
        const targetEventName = eventNameByChoiceIndex?.get(index);
        const script = scriptForEventName(data, targetEventName ?? "", events, rooms, dialogues, audioItems, audioPack);
        return script && script.length > 0
          ? { text, value: index + 1, ...localized, script }
          : { text, value: index + 1, ...localized };
      })
    }];
  });
}

function roomCameraMode(room: Record<string, unknown>): string {
  return exportCameraModeId(stringField(room, "cameraMode", "fixed_center"));
}

function roomCameraPosition(room: Record<string, unknown>): { x: number; y: number } {
  const width = integerField(room, "width", 30);
  const height = integerField(room, "height", 20);
  const bounds = normalizeRoomCameraBounds(
    isRecord(room.cameraBounds) ? room.cameraBounds as { x?: number; y?: number; width?: number; height?: number } : null,
    width,
    height
  );
  return { x: bounds.x * 8, y: bounds.y * 8 };
}

function roomParallaxVector(room: Record<string, unknown>): { x: number; y: number } {
  const settings = normalizeRoomParallaxSettings(
    isRecord(room.parallax) ? room.parallax as Record<string, unknown> : null
  );
  if (settings.mode === "disabled") return { x: 256, y: 256 };
  return { x: settings.speedX, y: settings.speedY };
}

type EngineExportAudioAssetRef = string | { asset: string; index?: number };

function buildAudioPackAssetRefs(
  audioPack: AssetcAudioPackGeneration | null
): Pick<NonNullable<EngineExportTopdownProject["assets"]>, "sfx_assets" | "music_assets" | "pcm_assets" | "tracker_assets"> {
  if (!audioPack) return {};
  const audioId = audioPack.packAsset.id;
  const indexed = (count: number): EngineExportAudioAssetRef[] =>
    Array.from({ length: count }, (_, index) => ({ asset: audioId, index }));
  return {
    ...(audioPack.document.sfx.length > 0 ? { sfx_assets: indexed(audioPack.document.sfx.length) } : {}),
    ...(audioPack.document.pcm.length > 0 ? { pcm_assets: indexed(audioPack.document.pcm.length) } : {}),
    ...(audioPack.document.tracker.length > 0 ? { tracker_assets: indexed(audioPack.document.tracker.length) } : {})
  };
}

function regularTilesetAssetNames(tilesetPack: AssetcTilesetPackGeneration | null): string[] {
  return tilesetPack?.packAssets
    .filter((asset) => asset.kind !== "affine_bg")
    .map((asset) => asset.name) ?? [];
}

function buildTopdownProjectAssetSection(
  spritePack: AssetcSpritePackGeneration | null,
  tilesetPack: AssetcTilesetPackGeneration | null,
  portraitPack: AssetcPortraitPackGeneration | null,
  emotePack: AssetcEmotePackGeneration | null,
  primaryRoom: Record<string, unknown> = {},
  audioPack: AssetcAudioPackGeneration | null = null,
  backgroundAssetNames?: string[]
): Pick<EngineExportTopdownProject, "assets" | "backgrounds" | "resource_banks"> {
  const regularTilesets = regularTilesetAssetNames(tilesetPack);
  const backgroundTilesets = backgroundAssetNames === undefined
    ? regularTilesets
    : Array.from(new Set(backgroundAssetNames)).filter((assetName) => regularTilesets.includes(assetName));
  const bgPalettes = regularTilesets;
  const objPalettes = Array.from(new Set([
    ...(spritePack?.assetNames ?? []),
    ...(portraitPack?.assetNames ?? []),
    ...(emotePack?.assetNames ?? [])
  ]));
  const tileAssets = Array.from(new Set([
    ...regularTilesets,
    ...(spritePack?.assetNames ?? []),
    ...(portraitPack?.assetNames ?? []),
    ...(emotePack?.assetNames ?? [])
  ]));
  const audioRefs = buildAudioPackAssetRefs(audioPack);
  if (
    bgPalettes.length === 0 &&
    objPalettes.length === 0 &&
    tileAssets.length === 0 &&
    Object.keys(audioRefs).length === 0
  ) {
    return {};
  }

  return {
    assets: {
      bg_palettes: bgPalettes,
      ...(objPalettes.length > 0 ? { obj_palettes: objPalettes } : {}),
      tile_assets: tileAssets,
      ...audioRefs
    },
    ...(backgroundTilesets.length > 0 ? {
      backgrounds: backgroundTilesets.map((assetName) => ({
        layer: "bg2",
        tilemap: assetName,
        scroll: { x: 0, y: 0 },
        parallax: roomParallaxVector(primaryRoom)
      }))
    } : {}),
    resource_banks: "asset_pack"
  };
}

function roomBackgroundAssetName(room: Record<string, unknown>): string {
  return normalizeGBASceneDocument(room).background.assetName ?? "";
}

function buildTopdownRooms(
  data: GBAProjectData,
  spritePack: AssetcSpritePackGeneration | null,
  tilesetPack: AssetcTilesetPackGeneration | null,
  actorSizePx: number,
  startMenuScriptIndex = -1
): EngineExportTopdownRoom[] {
  const rooms = exportRoomsForKind(data, "topdown");
  const events = projectArray(data, "events");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const startIndex = startRoomIndex(data, rooms);
  const dialogueBoot = dialogueUiBootCommands(data, audioItems, audioPack);

  return rooms.map((room, index) => {
    const width = integerField(room, "width", 20);
    const height = integerField(room, "height", 18);
    const tileCount = Math.max(1, width) * Math.max(1, height);
    const cameraBounds = isRecord(room.cameraBounds)
      ? normalizeRoomCameraBounds(room.cameraBounds as { x?: number; y?: number; width?: number; height?: number }, width, height)
      : null;
    const metatileAuthoring = roomMetatileAuthoringExport(room, width, height);
    const metatileExpansion = metatileAuthoring
      ? metatileAuthoring.physical
      : null;
    const collisionTypes = metatileExpansion
      ? [...metatileExpansion.collision_types]
      : paddedCollisionTypes(room.collisionTypes, tileCount);
    const eventBindings = child(room, "eventBindings");
    const onEnter = scriptForEventName(data, nullableStringField(eventBindings, "onInit"), events, rooms, dialogues, audioItems, audioPack);
    const onExit = scriptForEventName(data, nullableStringField(eventBindings, "onExit"), events, rooms, dialogues, audioItems, audioPack);
    const onInteract = scriptForEventName(data, nullableStringField(eventBindings, "onInteract"), events, rooms, dialogues, audioItems, audioPack);
    const onHitGroup1 = scriptForEventName(data, nullableStringField(eventBindings, "onHitGroup1"), events, rooms, dialogues, audioItems, audioPack);
    const onHitGroup2 = scriptForEventName(data, nullableStringField(eventBindings, "onHitGroup2"), events, rooms, dialogues, audioItems, audioPack);
    const onHitGroup3 = scriptForEventName(data, nullableStringField(eventBindings, "onHitGroup3"), events, rooms, dialogues, audioItems, audioPack);
    const roomDialogueBoot = index === startIndex ? dialogueBoot : [];
    const roomPlayerPosition = playerPositionForRoom(data, room, index);
    const tileLayers = projectArray(room, "tileLayers");
    const tileLayer = (mapping: string): Record<string, unknown> | undefined =>
      tileLayers.find((candidate) => nullableStringField(candidate, "mapping")?.toUpperCase() === mapping);
    const baseLayer = tileLayer("BG2");
    const foregroundLayer = tileLayer("BG1");
    const tilemapContract = resolveSceneTilemapContract(roomSceneType(room), width, height);
    const roomData: EngineExportTopdownRoom = {
      name: roomName(room, index),
      scene_type: roomSceneType(room),
      runtime_profile: runtimeProfileForSceneType(roomSceneType(room)),
      width_tiles: width,
      height_tiles: height,
      visual_tiles: metatileExpansion
        ? [...metatileExpansion.visual_tiles]
        : paddedNumberArray(baseLayer?.tilemap ?? room.tilemap, tileCount),
      collision_flags: paddedCollisionFlagsFromTypes(collisionTypes, tileCount),
      collision_slopes: collisionSlopesFromTypes(collisionTypes),
      collision_types: collisionTypes,
      background_bits_per_pixel: 4,
      video: buildRoomVideoComposition(data, room, tilesetPack),
      ...(tilemapContract
        ? {
            tilemap_contract: exportSceneTilemapContract(tilemapContract)
          }
        : {}),
      ...(metatileAuthoring ? { metatile_authoring: metatileAuthoring } : {}),
      metadata: {
        camera_mode: roomCameraMode(room),
        camera_position: roomCameraPosition(room),
        player_start: gbaTopdownTilePointToPixels(roomPlayerPosition),
        ...(cameraBounds ? { camera_bounds: gbaTopdownAreaToPixels(cameraBounds) } : {})
      }
    };
    if (foregroundLayer) {
      roomData.foreground_tiles = paddedForegroundTileArray(foregroundLayer.tilemap, tileCount);
    }
    const cameraZones = roomCameraZonesForExport(room, gbaTopdownAreaToPixels);
    if (cameraZones.length > 0) roomData.camera_zones = cameraZones;
    const backgroundAssetName = roomBackgroundAssetName(room);
    const tilesetAsset = backgroundAssetName && tilesetPack
      ? tilesetPack.assetsBySheet[backgroundAssetName]
      : null;
    if (tilesetAsset) {
      roomData.visual_tilemap = tilesetAsset.name;
      roomData.background_bits_per_pixel = tilesetAsset.background_bpp;
      if (room.gbStudioUseBackgroundLayout === true) {
        roomData.visual_tilemap_layout = "source_asset";
      }
    }

    const npcs = npcActorsForRoom(data, room, index);
    const startMenuBinding = startMenuScriptIndex >= 0
      ? [{ op: "attach_button_event" as const, button: "start", index: startMenuScriptIndex, override: true }]
      : [];
    const onEnterScript = mergeRoomOnEnterScript(roomDialogueBoot, [...(onEnter ?? []), ...startMenuBinding]);
    if (onEnterScript) {
      roomData.on_enter = onEnterScript;
    }
    if (onExit && onExit.length > 0) {
      roomData.on_exit = onExit;
    }
    if (onInteract && onInteract.length > 0) {
      roomData.on_interact = onInteract;
    }
    if (onHitGroup1 && onHitGroup1.length > 0) {
      roomData.on_hit_group1 = onHitGroup1;
    }
    if (onHitGroup2 && onHitGroup2.length > 0) {
      roomData.on_hit_group2 = onHitGroup2;
    }
    if (onHitGroup3 && onHitGroup3.length > 0) {
      roomData.on_hit_group3 = onHitGroup3;
    }

    const connections = child(data, "editorState")?.scenaConnections;
    const portals = Array.isArray(connections)
      ? connections.filter(isRecord).filter((connection) => nullableStringField(connection, "from") === roomData.name)
      : [];
    if (portals.length > 0) {
      roomData.portals = portals.flatMap((connection) => {
        const targetReference = nullableStringField(connection, "to");
        let targetRooms = rooms;
        let targetRoomIndex = roomIndexByName(targetRooms, targetReference);
        let targetKind: SceneExportKind = "topdown";
        const crossRuntime = targetRoomIndex < 0;
        if (crossRuntime) {
          const allRooms = projectRooms(data);
          const globalTargetIndex = roomIndexByName(allRooms, targetReference);
          if (globalTargetIndex < 0) return [];
          targetKind = resolveSceneRuntimeExport(roomSceneType(allRooms[globalTargetIndex] ?? {})).kind;
          if (!MIXED_RUNTIME_KINDS.has(targetKind)) return [];
          targetRooms = exportRoomsForKind(data, targetKind);
          targetRoomIndex = roomIndexByName(targetRooms, targetReference);
        }
        if (targetRoomIndex < 0) return [];
        const targetRoom = targetRooms[targetRoomIndex];
        const targetWidth = integerField(targetRoom, "width", 20);
        const targetHeight = integerField(targetRoom, "height", 18);
        const legacyExit = defaultRoomConnectionExitArea(width, height);
        const legacyEntry = defaultRoomConnectionEntryArea(targetWidth, targetHeight);
        const exitArea = connectionAreaField(connection, "exit", legacyExit);
        const entryArea = connectionAreaField(connection, "entry", legacyEntry);
        const targetCollisionTypes = paddedCollisionTypes(targetRoom.collisionTypes, targetWidth * targetHeight);
        const arrival = roomConnectionArrival(entryArea, targetWidth, targetHeight, targetCollisionTypes);
        const connectionScript = scriptForEventName(data, nullableStringField(connection, "eventName"), events, rooms, dialogues, audioItems, audioPack);
        const runtimeWarp: EngineExportProjectEventCommand | undefined = crossRuntime
          ? {
              op: "warp_runtime",
              runtime: targetKind as MixedRuntimeKind,
              room: targetRoomIndex,
              ...(targetKind === "isometric"
                ? { x: arrival.x, y: arrival.y }
                : { x: gbaTopdownTileToPixels(arrival.x), y: gbaTopdownTileToPixels(arrival.y) })
            }
          : undefined;
        const transition = Object.hasOwn(connection, "transition")
          ? normalizeSceneTransition(connection.transition)
          : sceneTransitionFromProjectSettings(isRecord(data.settings) ? data.settings.transitions : undefined);
        const localWarp: EngineExportProjectEventCommand | undefined = !crossRuntime &&
          !connectionScript &&
          sceneTransitionUsesVisualEffect(transition)
          ? sceneWarpCommand(data, "topdown", targetKind, targetRooms, targetRoomIndex,
              targetKind === "isometric"
                ? { x: arrival.x, y: arrival.y }
                : { x: gbaTopdownTileToPixels(arrival.x), y: gbaTopdownTileToPixels(arrival.y) }, room)
          : undefined;
        const rawScript = runtimeWarp && !connectionScript?.some((command) => command.op === "warp_runtime")
          ? [...(connectionScript ?? []), runtimeWarp]
          : localWarp
            ? [localWarp]
            : connectionScript;
        const script = wrapSceneConnectionTransition(connection, rawScript, data.settings);
        return [{
          area: gbaTopdownAreaToPixels(exitArea),
          target_room: crossRuntime ? index : targetRoomIndex,
          target_position: gbaTopdownTilePointToPixels(arrival),
          target_direction: arrival.direction,
          ...(script && script.length > 0 ? { script } : {})
        }];
      });
    }

    const triggers = projectArray(data, "triggers").filter((trigger) => {
      const roomNameValue = entitySceneName(trigger, "trigger");
      return !roomNameValue || roomNameValue === roomData.name;
    });
    if (triggers.length > 0) {
      roomData.triggers = triggers.flatMap((trigger) => {
        const onEnter = scriptForEventName(data, resolveTriggerEnterEventName(trigger), events, rooms, dialogues, audioItems, audioPack);
        const onLeave = scriptForEventName(data, resolveTriggerLeaveEventName(trigger), events, rooms, dialogues, audioItems, audioPack);
        if ((!onEnter || onEnter.length === 0) && (!onLeave || onLeave.length === 0)) {
          return [];
        }
        const bounds = entityBounds(trigger, "trigger", {
          x: Math.max(0, width - 2),
          y: Math.floor(height / 2),
          width: 2,
          height: 2
        });
        return [{
          area: gbaTopdownAreaToPixels(bounds),
          ...(onEnter && onEnter.length > 0 ? { on_enter: onEnter } : {}),
          ...(onLeave && onLeave.length > 0 ? { on_leave: onLeave } : {})
        }];
      });
    }

    if (npcs.length > 0) {
      roomData.npcs = npcs.map((actor) => {
        const onStart = scriptForEventName(data, resolveActorInitEventName(actor), events, rooms, dialogues, audioItems, audioPack);
        const onInteract = scriptForEventName(data, resolveActorInteractEventName(actor), events, rooms, dialogues, audioItems, audioPack);
        const onUpdate = scriptForEventName(data, resolveActorOnUpdateEventName(actor), events, rooms, dialogues, audioItems, audioPack);
        const onHitActor = scriptForEventName(data, resolveActorBindingEventName(actor, "onHitActor"), events, rooms, dialogues, audioItems, audioPack);
        const onHitPlayer = scriptForEventName(data, resolveActorBindingEventName(actor, "onHitPlayer"), events, rooms, dialogues, audioItems, audioPack);
        const onHitGroup1 = scriptForEventName(data, resolveActorBindingEventName(actor, "onHitGroup1"), events, rooms, dialogues, audioItems, audioPack);
        const onHitGroup2 = scriptForEventName(data, resolveActorBindingEventName(actor, "onHitGroup2"), events, rooms, dialogues, audioItems, audioPack);
        const onHitGroup3 = scriptForEventName(data, resolveActorBindingEventName(actor, "onHitGroup3"), events, rooms, dialogues, audioItems, audioPack);
        const onDefeated = scriptForEventName(data, resolveActorBindingEventName(actor, "onDefeated"), events, rooms, dialogues, audioItems, audioPack);
        const spriteExport = buildActorEngineSpriteExport(data, actor, spritePack);
        const collisionGeometry = actorCollisionGeometry(data, actor, actorSizePx);
        const position = entityPosition(actor, "actor", { x: 8, y: 8 });
        return {
          name: stringField(actor, "name", "NPC"),
          position: gbaTopdownTilePointToPixels({
            x: position.x,
            y: position.y
          }),
          size: { x: collisionGeometry.width, y: collisionGeometry.height },
          collision_offset: {
            x: collisionGeometry.offsetX,
            y: collisionGeometry.offsetY
          },
          collision_group: Math.max(0, Math.min(15, integerField(actor, "collisionGroup", 0))),
          collision_mask: Math.max(0, Math.min(0xFFFF, integerField(actor, "collisionMask", 0xFFFF))),
          push_priority: Math.max(0, Math.min(255, integerField(actor, "pushPriority", 0))),
          pushable: actor.pushable === true,
          ...(roomAffineObjForExport(room) ? { affine_obj: roomAffineObjForExport(room) } : {}),
          ...(spriteExport ? {
            metasprite: spriteExport.metasprite,
            animation: spriteExport.animation,
            ...(spriteExport.animations ? { animations: spriteExport.animations } : {})
          } : {}),
          ...(onStart && onStart.length > 0 ? { on_start: onStart } : {}),
          ...(onInteract && onInteract.length > 0 ? { on_interact: onInteract } : {}),
          ...(onUpdate && onUpdate.length > 0 ? { on_update: onUpdate } : {}),
          ...(onHitActor && onHitActor.length > 0 ? { on_hit_actor: onHitActor } : {}),
          ...(onHitPlayer && onHitPlayer.length > 0 ? { on_hit_player: onHitPlayer } : {}),
          ...(onHitGroup1 && onHitGroup1.length > 0 ? { on_hit_group1: onHitGroup1 } : {}),
          ...(onHitGroup2 && onHitGroup2.length > 0 ? { on_hit_group2: onHitGroup2 } : {}),
          ...(onHitGroup3 && onHitGroup3.length > 0 ? { on_hit_group3: onHitGroup3 } : {}),
          ...(onDefeated && onDefeated.length > 0 ? { on_defeated: onDefeated } : {})
        };
      });
    }

    roomData.resource_bank_group = engineSceneResourceBankGroupName(room, index);

    return roomData;
  });
}

function buildTopdownProject(
  data: GBAProjectData,
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()
): EngineExportTopdownProject {
  const rooms = exportRoomsForKind(data, "topdown");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const spritePack = buildAssetcSpritePackGeneration(data);
  const tilesetPack = buildAssetcTilesetPackGeneration(data);
  const portraitPack = buildAssetcPortraitPackGeneration(data, spritePack);
  const emotePack = buildAssetcEmotePackGeneration(data, spritePack, portraitPack);
  const portraitAssets = buildDialoguePortraitAssetsExport(data, portraitPack, spritePack);
  const emoteAssets = buildDialogueEmoteAssetsExport(data, emotePack, portraitPack, spritePack);
  const events = projectArray(data, "events");
  const initialRoomIndex = startRoomIndex(data, rooms);
  const initialRoom = rooms[initialRoomIndex] ?? rooms[0] ?? {};
  const initialRuntimeConfig = child(child(initialRoom, "runtime"), "config");
  const initialModules = initialRuntimeConfig?.modules;
  const featureRuntime = resolveTopdownFeatureRuntime(initialModules);
  const playerSpawn = initialTopdownPlayerSpawn(data, initialRoom, initialRoomIndex);
  const playerName = configuredPlayerActorName(data, initialRoom);
  const playerActors = projectArray(data, "actors").filter((item) => actorMatchesPlayerName(item, playerName));
  const playerActor = playerActors.find((item) => {
    const actorRoom = entitySceneName(item, "actor");
    return !actorRoom || actorRoom === roomName(initialRoom, initialRoomIndex);
  }) ?? playerActors[0];
  const playerSpriteExport = playerActor ? buildActorEngineSpriteExport(data, playerActor, spritePack) : null;
  const textPositions=new Map<string,{layer:string,width:number}>();
  for(const event of events) for(const step of eventSteps(event)) {
    const parts=commandParts(stringField(step,"command",""));if(parts[0]!=="draw_text" || step.isEnabled===false) continue;
    const key=parts.slice(1,4).join(":");const width=Array.from(parts.slice(4).join(" ")).length;
    const previous=textPositions.get(key);textPositions.set(key,{layer:parts[3]!,width:Math.max(width,previous?.width ?? 0)});
  }
  if(textPositions.size>8 || [...textPositions.values()].filter(text=>text.layer==="overlay").reduce((total,text)=>total+text.width,0)>27) throw new Error("Texto persistente excede 8 posições ou 27 caracteres simultâneos no overlay.");
  const actorSprites = dynamicActorSpriteSheetNames(data).map((name) => {
    const stateID = name.split("#state:")[1]?.split("#actor:")[0];
    const actorName = name.split("#actor:")[1];
    const actor = projectArray(data, "actors").find(item => item.id === actorName || item.name === actorName || (actorName?.toLowerCase() === "player" && isConfiguredPlayerActor(data, String(item.name))));
    const projectile = name.endsWith("#projectile");
    const spriteExport = buildActorEngineSpriteExport(data, { ...(actor ?? {}), ...(projectile ? { id: "__projectile__" } : {}), spriteSheet: stateID ? name.split("#state:")[0] : projectile ? name.slice(0, -11) : name, ...(stateID ? { animationStateID: stateID } : {}) }, spritePack);
    if (!spriteExport) {
      throw new Error(`Evento referencia folha de sprite dinamica inexistente: ${name}`);
    }
    return { name, ...spriteExport };
  });
  const choiceGroups = buildTopdownChoiceGroups(data, dialogues, events, rooms, audioItems, audioPack);
  const scripts = buildTopdownScripts(data, events, rooms, dialogues, audioItems, audioPack, pluginRegistry, true);
  const startMenuScriptIndex = scripts.findIndex((entry) => entry.name === "__gbastudio_start_menu__");
  const topdownSettings = child(settings(data), "topdown");
  const actorSizePx = buildEngineTopdownActorSizePx(topdownSettings);
  const playerGeometry = actorCollisionGeometry(data, playerActor, actorSizePx);
  const playerOnStart = playerActor
    ? scriptForEventName(data, resolveActorInitEventName(playerActor), events, rooms, dialogues, audioItems, audioPack)
    : undefined;
  const playerOnUpdate = playerActor
    ? scriptForEventName(data, resolveActorOnUpdateEventName(playerActor), events, rooms, dialogues, audioItems, audioPack)
    : undefined;
  const playerAffineObj = roomAffineObjForExport(initialRoom);
  const project: EngineExportTopdownProject = {
    initial_room: initialRoomIndex,
    video: buildExportAdvancedVideoComposition(data),
    ...buildTopdownProjectAssetSection(
      spritePack,
      tilesetPack,
      portraitPack,
      emotePack,
      initialRoom,
      audioPack,
      rooms
        .map(roomBackgroundAssetName)
        .map((assetName) => tilesetPack?.assetsBySheet[assetName]?.name ?? assetName)
        .filter((assetName) => assetName.length > 0)
    ),
    rooms: buildTopdownRooms(
      data,
      spritePack,
      tilesetPack,
      actorSizePx,
      // The authored in-game menu owns Start whenever it exists. Gameplay
      // modules keep their native commands, but must not re-enable the legacy
      // floating pause HUD for the same input.
      startMenuScriptIndex
    ),
    dialogue_ui: buildEngineDialogueUiConfigForExport(data),
    player: {
      position: gbaTopdownTilePointToPixels(playerSpawn),
      direction: playerSpawn.direction,
      size: { x: playerGeometry.width, y: playerGeometry.height },
      collision_offset: {
        x: playerGeometry.offsetX,
        y: playerGeometry.offsetY
      },
      collision_group: Math.max(0, Math.min(15, integerField(playerActor, "collisionGroup", 0))),
      collision_mask: Math.max(0, Math.min(0xFFFF, integerField(playerActor, "collisionMask", 0xFFFF))),
      push_priority: Math.max(0, Math.min(255, integerField(playerActor, "pushPriority", 0))),
      pushable: playerActor?.pushable === true,
      ...(playerAffineObj ? { affine_obj: playerAffineObj } : {}),
      speed: buildEngineTopdownPlayerSpeed(topdownSettings),
      interact_button: buildEngineInteractButton(topdownSettings),
      ...(playerOnStart && playerOnStart.length > 0 ? { on_start: playerOnStart } : {}),
      ...(playerOnUpdate && playerOnUpdate.length > 0 ? { on_update: playerOnUpdate } : {}),
      ...(playerSpriteExport ? {
        metasprite: playerSpriteExport.metasprite,
        animation: playerSpriteExport.animation,
        ...(playerSpriteExport.animations ? { animations: playerSpriteExport.animations } : {}),
        emit_animation_fallback: false
      } : {
        emit_animation_fallback: true,
        ...(nullableStringField(playerActor, "spriteSheet") ? { sprite_sheet: nullableStringField(playerActor, "spriteSheet") } : {}),
        ...(nullableStringField(playerActor, "animationName") ? { animation_name: nullableStringField(playerActor, "animationName") } : {})
      })
    },
    ...(actorSprites.length > 0 ? { actor_sprites: actorSprites } : {}),
    camera: {
      position: roomCameraPosition(initialRoom),
      follow_player: cameraModeFollowsPlayer(stringField(initialRoom, "cameraMode", "fixed_center")),
      zoom_x256: 256
    },
    save: buildProjectSaveConfig(data),
    dialogue_lines: buildDialogueLines(data, dialogues, audioItems, audioPack),
    ...(portraitAssets.length > 0 ? { portrait_assets: portraitAssets } : {}),
    ...(emoteAssets.length > 0 ? { emote_assets: emoteAssets } : {}),
    scripts
  };
  project.inventory_enabled = featureRuntime.inventoryEnabled;
  project.quests_enabled = featureRuntime.questsEnabled;
  project.shop_enabled = featureRuntime.shopEnabled;
  if (featureRuntime.quest) {
    project.quests = [{
      id: `${roomName(initialRoom, initialRoomIndex)}_quest`,
      state_variable: featureRuntime.quest.stateVariable,
      active_value: featureRuntime.quest.activeValue,
      completed_value: featureRuntime.quest.completedValue,
      objective_item: featureRuntime.quest.objectiveItem,
      objective_quantity: featureRuntime.quest.objectiveQuantity,
      reward_item: featureRuntime.quest.rewardItem,
      reward_quantity: featureRuntime.quest.rewardQuantity
    }];
  }
  if (featureRuntime.shop) {
    project.shop_items = [{
      label: featureRuntime.shop.label,
      item: featureRuntime.shop.item,
      currency_item: featureRuntime.shop.currencyItem,
      price: featureRuntime.shop.price,
      stock_variable: featureRuntime.shop.stockVariable,
      stock: featureRuntime.shop.stock
    }];
  }
  if (choiceGroups.length > 0) {
    project.choice_groups = choiceGroups;
  }
  return project;
}

function platformerTileToPixels(value: number): number {
  return value * gbaTileSizePx;
}

function platformerAreaToPixels(area: { x: number; y: number; width: number; height: number }): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: platformerTileToPixels(area.x),
    y: platformerTileToPixels(area.y),
    width: Math.max(16, platformerTileToPixels(area.width)),
    height: Math.max(16, platformerTileToPixels(area.height))
  };
}

function platformerAreaToRoomPixels(
  area: { x: number; y: number; width: number; height: number },
  roomWidthTiles: number,
  roomHeightTiles: number
): { x: number; y: number; width: number; height: number } {
  const pixels = platformerAreaToPixels(area);
  const roomWidthPixels = platformerTileToPixels(Math.max(1, roomWidthTiles));
  const roomHeightPixels = platformerTileToPixels(Math.max(1, roomHeightTiles));
  return {
    ...pixels,
    x: Math.max(0, Math.min(pixels.x, roomWidthPixels - Math.min(pixels.width, roomWidthPixels))),
    y: Math.max(0, Math.min(pixels.y, roomHeightPixels - Math.min(pixels.height, roomHeightPixels)))
  };
}

function roomCameraZonesForExport(
  room: Record<string, unknown>,
  areaTransform: (area: RoomConnectionArea) => RoomConnectionArea
): EngineExportCameraZone[] {
  const zones = Array.isArray(room.cameraZones) ? room.cameraZones.filter(isRecord) : [];
  return zones.map((zone) => {
    const area = child(zone, "area");
    const bounds = child(zone, "bounds");
    const offset = child(zone, "offset");
    return {
      area: areaTransform({
        x: integerField(area, "x", 0),
        y: integerField(area, "y", 0),
        width: Math.max(1, integerField(area, "width", 1)),
        height: Math.max(1, integerField(area, "height", 1))
      }),
      bounds: {
        x: integerField(bounds, "x", 0),
        y: integerField(bounds, "y", 0),
        width: Math.max(1, integerField(bounds, "width", 240)),
        height: Math.max(1, integerField(bounds, "height", 160))
      },
      offset: {
        x: integerField(offset, "x", 0),
        y: integerField(offset, "y", 0)
      },
      lock_x: zone.lockX === true,
      lock_y: zone.lockY === true
    };
  });
}

function buildPlatformerRooms(
  data: GBAProjectData,
  spritePack: AssetcSpritePackGeneration | null,
  tilesetPack: AssetcTilesetPackGeneration | null,
  actorSizePx: number,
  startMenuScriptIndex = -1
): EngineExportPlatformerRoom[] {
  const rooms = exportRoomsForKind(data, "platformer");
  const events = projectArray(data, "events");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const startIndex = startRoomIndex(data, rooms);
  const dialogueBoot = dialogueUiBootCommands(data, audioItems, audioPack);

  return rooms.map((room, index) => {
    const width = integerField(room, "width", 20);
    const height = integerField(room, "height", 18);
    const tileCount = Math.max(1, width) * Math.max(1, height);
    const collisionTypes = paddedCollisionTypes(room.collisionTypes, tileCount);
    const damageHazards = collisionTypes.flatMap((collisionType, cellIndex) => collisionType === "damage"
      ? [{
          area: {
            x: (cellIndex % width) * gbaTileSizePx,
            y: Math.floor(cellIndex / width) * gbaTileSizePx,
            width: gbaTileSizePx,
            height: gbaTileSizePx
          },
          damage: 1,
          respawn: true
        }]
      : []);
    const eventBindings = child(room, "eventBindings");
    const onEnter = scriptForEventName(data, nullableStringField(eventBindings, "onInit"), events, rooms, dialogues, audioItems, audioPack);
    const onExit = scriptForEventName(data, nullableStringField(eventBindings, "onExit"), events, rooms, dialogues, audioItems, audioPack);
    const onUpdate = scriptForEventName(data, nullableStringField(eventBindings, "onUpdate"), events, rooms, dialogues, audioItems, audioPack);
    const onHitGroup1 = scriptForEventName(data, nullableStringField(eventBindings, "onHitGroup1"), events, rooms, dialogues, audioItems, audioPack);
    const onHitGroup2 = scriptForEventName(data, nullableStringField(eventBindings, "onHitGroup2"), events, rooms, dialogues, audioItems, audioPack);
    const onHitGroup3 = scriptForEventName(data, nullableStringField(eventBindings, "onHitGroup3"), events, rooms, dialogues, audioItems, audioPack);
    const roomDialogueBoot = index === startIndex ? dialogueBoot : [];
    const playerPosition = platformerPlayerPositionForRoom(data, room, index);
    const playerActor = platformerPlayerActorForRoom(data, room, index);
    const playerGeometry = actorCollisionGeometry(
      data,
      playerActor,
      actorSizePx
    );
    const playerVisualSize = actorVisualSize(data, playerActor, actorSizePx);
    const playerVisualInsetX = Math.max(0, Math.ceil((playerVisualSize.width - playerGeometry.width) / 2));
    const playerVisualInsetY = Math.max(0, playerVisualSize.height - playerGeometry.height);
    const playerStartMinX = Math.max(0, playerVisualInsetX - playerGeometry.offsetX);
    const playerStartMaxX = Math.max(
      playerStartMinX,
      width * gbaTileSizePx - playerGeometry.width - playerVisualInsetX - playerGeometry.offsetX
    );
    const playerStartMinY = Math.max(0, playerVisualInsetY - playerGeometry.offsetY);
    const playerStartMaxY = Math.max(
      playerStartMinY,
      height * gbaTileSizePx - playerGeometry.height - playerGeometry.offsetY
    );
    const playerStartX = Math.max(
      playerStartMinX,
      Math.min(playerStartMaxX, platformerTileToPixels(playerPosition.x))
    );
    const playerStartY = Math.max(
      playerStartMinY,
      Math.min(playerStartMaxY, platformerTileToPixels(playerPosition.y))
    );
    const roomPlatformerConfig = platformerSceneConfigFromRuntime(room.runtime, data.settings);
    const tileLayers = projectArray(room, "tileLayers");
    const tileLayer = (mapping: string): Record<string, unknown> | undefined =>
      tileLayers.find((candidate) => nullableStringField(candidate, "mapping").toUpperCase() === mapping);
    const baseLayer = tileLayer("BG2");
    const roomData: EngineExportPlatformerRoom = {
      name: roomName(room, index),
      resource_bank_group: engineSceneResourceBankGroupName(room, index),
      width_tiles: width,
      height_tiles: height,
      visual_tiles: paddedNumberArray(baseLayer?.tilemap ?? room.tilemap, tileCount),
      collision_flags: paddedCollisionFlagsFromTypes(collisionTypes, tileCount),
      collision_slopes: collisionSlopesFromTypes(collisionTypes),
      collision_types: collisionTypes,
      video: buildRoomVideoComposition(data, room, tilesetPack),
      ...(roomPlatformerConfig
        ? { config: buildEnginePlatformerPhysicsConfig({ ...roomPlatformerConfig }) }
        : {}),
      player_start: {
        x: playerStartX,
        y: playerStartY,
        width: playerGeometry.width,
        height: playerGeometry.height
      },
      player_collision_offset: {
        x: playerGeometry.offsetX,
        y: playerGeometry.offsetY
      },
      camera: {
        position: roomCameraPosition(room),
        follow_player: cameraModeFollowsPlayer(stringField(room, "cameraMode", "fixed_center"))
      },
      ...(damageHazards.length > 0 ? { hazards: damageHazards } : {})
    };
    const backgroundAssetName = roomBackgroundAssetName(room);
    const runtimeBaseBackgroundAssetName = nullableStringField(room, "runtimeBaseBackgroundAssetName");
    const runtimeCompositeBackgroundAssetName = nullableStringField(room, "runtimeCompositeBackgroundAssetName");
    const visualTilemapAssetName = runtimeBaseBackgroundAssetName
      || runtimeCompositeBackgroundAssetName
      || backgroundAssetName;
    const tilesetAsset = visualTilemapAssetName && tilesetPack
      ? tilesetPack.assetsBySheet[visualTilemapAssetName]
      : null;
    if (tilesetAsset) {
      roomData.visual_tilemap = tilesetAsset.name;
      if (room.gbStudioUseBackgroundLayout === true) {
        roomData.visual_tilemap_layout = "source_asset";
      }
    }
    if (tileLayers.length > 0) {
      const roomParallax = child(room, "parallax");
      const parallaxMode = nullableStringField(roomParallax, "mode").toLowerCase();
      const layerMappings = ["BG3", "BG2", "BG1"] as const;
      const backgroundLayers = layerMappings.flatMap((mapping) => {
        const layer = tileLayer(mapping);
        if (!layer) return [];
        const sourceNames = Array.isArray(layer.tileSourceAssetNames)
          ? layer.tileSourceAssetNames.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : [];
        const sourceName = sourceNames[0] ?? (mapping === "BG2" && room.gbStudioUseBackgroundLayout === true
          ? visualTilemapAssetName : "");
        const layerAsset = sourceName && tilesetPack ? tilesetPack.assetsBySheet[sourceName] : null;
        const hasPaintedTiles = Array.isArray(layer.tilemap) && layer.tilemap.some((value) => (
          typeof value === "number" && Number.isFinite(value) && value >= 0
        ));
        if (!layerAsset && !hasPaintedTiles) return [];
        return [{
          layer: mapping.toLowerCase() as "bg3" | "bg2" | "bg1",
          tiles: paddedNumberArray(layer.tilemap, tileCount),
          ...(layerAsset ? { tilemap: layerAsset.name } : {}),
          ...(layerAsset && room.gbStudioUseBackgroundLayout === true ? { tilemap_layout: "source_asset" as const } : {}),
          parallax: mapping === "BG3" && parallaxMode === "bg3"
            ? {
                x: Math.max(0, Math.min(1024, integerField(roomParallax, "speedX", 256))),
                y: Math.max(0, Math.min(1024, integerField(roomParallax, "speedY", 256)))
              }
            : { x: 256, y: 256 }
        }];
      });
      if (backgroundLayers.length > 0) roomData.background_layers = backgroundLayers;
    }

    const npcs = npcActorsForRoom(data, room, index);
    const startMenuBinding = startMenuScriptIndex >= 0
      ? [{ op: "attach_button_event" as const, button: "start", index: startMenuScriptIndex, override: true }]
      : [];
    const onEnterScript = mergeRoomOnEnterScript(roomDialogueBoot, [...(onEnter ?? []), ...startMenuBinding]);
    if (onEnterScript) {
      roomData.on_enter = onEnterScript;
    }
    if (onExit && onExit.length > 0) roomData.on_exit = onExit;
    if (onUpdate && onUpdate.length > 0) roomData.on_update = onUpdate;
    if (onHitGroup1 && onHitGroup1.length > 0) roomData.on_hit_group1 = onHitGroup1;
    if (onHitGroup2 && onHitGroup2.length > 0) roomData.on_hit_group2 = onHitGroup2;
    if (onHitGroup3 && onHitGroup3.length > 0) roomData.on_hit_group3 = onHitGroup3;

    const triggers = projectArray(data, "triggers").filter((trigger) => {
      const roomNameValue = entitySceneName(trigger, "trigger");
      return !roomNameValue || roomNameValue === roomData.name;
    });
    if (triggers.length > 0) {
      roomData.triggers = triggers.flatMap((trigger) => {
        const triggerOnEnter = scriptForEventName(data, resolveTriggerEnterEventName(trigger), events, rooms, dialogues, audioItems, audioPack);
        const onLeave = scriptForEventName(data, resolveTriggerLeaveEventName(trigger), events, rooms, dialogues, audioItems, audioPack);
        if ((!triggerOnEnter || triggerOnEnter.length === 0) && (!onLeave || onLeave.length === 0)) {
          return [];
        }
        const bounds = entityBounds(trigger, "trigger", {
          x: Math.max(0, width - 2),
          y: Math.floor(height / 2),
          width: 2,
          height: 2
        });
        return [{
          area: platformerAreaToRoomPixels(bounds, width, height),
          ...(triggerOnEnter && triggerOnEnter.length > 0 ? { on_enter: triggerOnEnter } : {}),
          ...(onLeave && onLeave.length > 0 ? { on_leave: onLeave } : {})
        }];
      });
    }

    const cameraZones = Array.isArray(room.cameraZones) ? room.cameraZones.filter(isRecord) : [];
    if (cameraZones.length > 0) {
      roomData.camera_zones = cameraZones.map((zone) => {
        const area = child(zone, "area");
        const bounds = child(zone, "bounds");
        const offset = child(zone, "offset");
        return {
          area: platformerAreaToPixels({
            x: integerField(area, "x", 0),
            y: integerField(area, "y", 0),
            width: Math.max(1, integerField(area, "width", 1)),
            height: Math.max(1, integerField(area, "height", 1))
          }),
          bounds: {
            x: integerField(bounds, "x", 0),
            y: integerField(bounds, "y", 0),
            width: Math.max(1, integerField(bounds, "width", platformerTileToPixels(width))),
            height: Math.max(1, integerField(bounds, "height", platformerTileToPixels(height)))
          },
          offset: {
            x: integerField(offset, "x", 0),
            y: integerField(offset, "y", 0)
          },
          lock_x: zone.lockX === true,
          lock_y: zone.lockY === true
        };
      });
    }

    if (npcs.length > 0) {
      roomData.npcs = npcs.map((actor) => {
        const onStart = scriptForEventName(data, resolveActorInitEventName(actor), events, rooms, dialogues, audioItems, audioPack);
        const onInteract = scriptForEventName(data, resolveActorInteractEventName(actor), events, rooms, dialogues, audioItems, audioPack);
        const onUpdate = scriptForEventName(data, resolveActorOnUpdateEventName(actor), events, rooms, dialogues, audioItems, audioPack);
        const spriteExport = buildActorEngineSpriteExport(data, actor, spritePack, { directionAdapter: "platformer" });
        const collisionGeometry = actorCollisionGeometry(data, actor, actorSizePx);
        const position = entityPosition(actor, "actor", { x: 8, y: 8 });
        return {
          name: stringField(actor, "name", "NPC"),
          position: {
            x: platformerTileToPixels(position.x),
            y: platformerTileToPixels(position.y)
          },
          size: { x: collisionGeometry.width, y: collisionGeometry.height },
          collision_offset: {
            x: collisionGeometry.offsetX,
            y: collisionGeometry.offsetY
          },
          collision_group: Math.max(0, Math.min(15, integerField(actor, "collisionGroup", 0))),
          collision_mask: Math.max(0, Math.min(0xFFFF, integerField(actor, "collisionMask", 0xFFFF))),
          push_priority: Math.max(0, Math.min(255, integerField(actor, "pushPriority", 0))),
          pushable: actor.pushable === true,
          ...(spriteExport ? {
            metasprite: spriteExport.metasprite,
            animation: spriteExport.animation,
            ...(spriteExport.animations ? { animations: spriteExport.animations } : {})
          } : {}),
          ...(onStart && onStart.length > 0 ? { on_start: onStart } : {}),
          ...(onInteract && onInteract.length > 0 ? { on_interact: onInteract } : {}),
          ...(onUpdate && onUpdate.length > 0 ? { on_update: onUpdate } : {})
        };
      });
    }

    const connections = child(data, "editorState")?.scenaConnections;
    const portals = Array.isArray(connections)
      ? connections.filter(isRecord).filter((connection) => nullableStringField(connection, "from") === roomData.name)
      : [];
    if (portals.length > 0) {
      const connectionTriggers = portals.flatMap((connection) => {
        const targetReference = nullableStringField(connection, "to");
        const allRooms = projectRooms(data);
        const globalTargetIndex = roomIndexByName(allRooms, targetReference);
        if (globalTargetIndex < 0) return [];
        const targetKind = resolveSceneRuntimeExport(roomSceneType(allRooms[globalTargetIndex] ?? {})).kind;
        if (!MIXED_RUNTIME_KINDS.has(targetKind)) return [];
        const targetRooms = exportRoomsForKind(data, targetKind);
        const targetRoomIndex = roomIndexByName(targetRooms, targetReference);
        if (targetRoomIndex < 0) return [];
        const targetRoom = targetRooms[targetRoomIndex];
        const targetWidth = integerField(targetRoom, "width", 20);
        const targetHeight = integerField(targetRoom, "height", 18);
        const legacyExit = defaultRoomConnectionExitArea(width, height);
        const legacyEntry = defaultRoomConnectionEntryArea(targetWidth, targetHeight);
        const exitArea = connectionAreaField(connection, "exit", legacyExit);
        const entryArea = connectionAreaField(connection, "entry", legacyEntry);
        const targetCollisionTypes = paddedCollisionTypes(targetRoom.collisionTypes, targetWidth * targetHeight);
        const arrival = roomConnectionArrival(entryArea, targetWidth, targetHeight, targetCollisionTypes);
        const connectionScript = scriptForEventName(data, nullableStringField(connection, "eventName"), events, rooms, dialogues, audioItems, audioPack);
        const warp = sceneWarpCommand(data, "platformer", targetKind, targetRooms, targetRoomIndex,
          targetKind === "isometric" ? { x: arrival.x, y: arrival.y }
            : { x: platformerTileToPixels(arrival.x), y: platformerTileToPixels(arrival.y) }, room);
        const rawScript = connectionScript?.some((command) => command.op === "warp" || command.op === "warp_runtime")
          ? connectionScript
          : [...(connectionScript ?? []), warp];
        const script = wrapSceneConnectionTransition(connection, rawScript, data.settings);
        return [{ area: platformerAreaToRoomPixels(exitArea, width, height), on_enter: script }];
      });
      roomData.triggers = [...(roomData.triggers ?? []), ...connectionTriggers];
    }

    return roomData;
  });
}

function buildPlatformerProject(
  data: GBAProjectData,
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()
): EngineExportPlatformerProject {
  const rooms = exportRoomsForKind(data, "platformer");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const events = projectArray(data, "events");
  const platformerSettings = child(settings(data), "platformer");
  const topdownSettings = child(settings(data), "topdown");
  const spritePack = buildAssetcSpritePackGeneration(data);
  const tilesetPack = buildAssetcTilesetPackGeneration(data);
  const portraitPack = buildAssetcPortraitPackGeneration(data, spritePack);
  const emotePack = buildAssetcEmotePackGeneration(data, spritePack, portraitPack);
  const portraitAssets = buildDialoguePortraitAssetsExport(data, portraitPack, spritePack);
  const emoteAssets = buildDialogueEmoteAssetsExport(data, emotePack, portraitPack, spritePack);
  const actorSizePx = buildEngineTopdownActorSizePx(topdownSettings);
  const initialRoomIndex = startRoomIndex(data, rooms);
  const initialRoom = rooms[initialRoomIndex] ?? rooms[0] ?? {};
  const playerName = configuredPlayerActorName(data, initialRoom);
  const playerActors = projectArray(data, "actors").filter((actor) => actorMatchesPlayerName(actor, playerName));
  const playerActor = playerActors.find((actor) => {
    const actorRoom = entitySceneName(actor, "actor");
    return !actorRoom || actorRoom === roomName(initialRoom, initialRoomIndex);
  }) ?? playerActors.find((actor) => (
    nullableStringField(actor, "gbStudioPlayerRuntime").toUpperCase() === "PLATFORM"
  )) ?? playerActors[0];
  const playerSpriteExport = playerActor
    ? buildActorEngineSpriteExport(data, playerActor, spritePack, { directionAdapter: "platformer" })
    : null;
  const playerAnimations = buildPlatformerPlayerAnimations(playerSpriteExport?.animations);
  const playerOnStart = playerActor
    ? scriptForEventName(data, resolveActorInitEventName(playerActor), events, rooms, dialogues, audioItems, audioPack, pluginRegistry)
    : undefined;
  const playerOnUpdate = playerActor
    ? scriptForEventName(data, resolveActorOnUpdateEventName(playerActor), events, rooms, dialogues, audioItems, audioPack, pluginRegistry)
    : undefined;
  const assetSection = buildTopdownProjectAssetSection(
    spritePack,
    tilesetPack,
    portraitPack,
    emotePack,
    initialRoom,
    audioPack
  );
  const scripts = buildTopdownScripts(data, events, rooms, dialogues, audioItems, audioPack, pluginRegistry, true, "platformer");
  const startMenuScriptIndex = scripts.findIndex((entry) => entry.name === "__gbastudio_start_menu__");
  return {
    initial_room: initialRoomIndex,
    backdrop_color: 0,
    interact_button: buildEngineInteractButton(platformerSettings),
    jump_button: buildEngineInteractButton({
      interactButton: stringField(platformerSettings, "jumpButton", "A")
    }),
    run_button: buildEngineInteractButton({
      interactButton: stringField(platformerSettings, "runButton", "B")
    }),
    config: buildEnginePlatformerPhysicsConfig(platformerSettings),
    ...(playerSpriteExport ? {
      player: {
        metasprite: playerSpriteExport.metasprite,
        animation: typeof playerSpriteExport.animation === "string"
          ? { asset: playerSpriteExport.metasprite.asset }
          : playerSpriteExport.animation,
        ...(playerAnimations ? { animations: playerAnimations } : {}),
        ...(playerOnStart && playerOnStart.length > 0 ? { on_start: playerOnStart } : {}),
        ...(playerOnUpdate && playerOnUpdate.length > 0 ? { on_update: playerOnUpdate } : {})
      }
    } : {}),
    save: buildProjectSaveConfig(data),
    rooms: buildPlatformerRooms(data, spritePack, tilesetPack, actorSizePx, startMenuScriptIndex),
    dialogue_lines: buildDialogueLines(data, dialogues, audioItems, audioPack),
    dialogue_ui: buildEngineDialogueUiConfigForExport(data),
    ...(portraitAssets.length > 0 ? { portrait_assets: portraitAssets } : {}),
    ...(emoteAssets.length > 0 ? { emote_assets: emoteAssets } : {}),
    scripts,
    ...(assetSection.assets ? { assets: assetSection.assets } : {}),
    ...(assetSection.resource_banks ? { resource_banks: assetSection.resource_banks } : {})
  };
}

function isometricActorsForRoom(
  data: GBAProjectData,
  room: Record<string, unknown>,
  roomIndex: number
): Record<string, unknown>[] {
  const roomDataName = roomName(room, roomIndex);
  return projectArray(data, "actors").filter((actor) => {
    const roomNameValue = entitySceneName(actor, "actor");
    return !roomNameValue || roomNameValue === roomDataName;
  });
}

function tacticalSurfaceWorldBounds(
  presentation?: EngineExportIsometricTacticalPresentation
): { x: number; y: number; width: number; height: number } | null {
  const pages = presentation?.surface_pages ?? [];
  if (pages.length === 0) return null;
  const bounds = pages.reduce(
    (current, page) => ({
      maxX: Math.max(current.maxX, page.world.x + page.world.width),
      maxY: Math.max(current.maxY, page.world.y + page.world.height),
      minX: Math.min(current.minX, page.world.x),
      minY: Math.min(current.minY, page.world.y)
    }),
    { maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY, minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY }
  );
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  return width > 0 && height > 0
    ? { height, width, x: bounds.minX, y: bounds.minY }
    : null;
}

function buildIsometricRoomCamera(
  data: GBAProjectData,
  room: Record<string, unknown>,
  width: number,
  height: number,
  grid: { tileWidth: number; tileHeight: number; originX: number; originY: number; presentationZoom: number; worldMode?: string },
  tacticalPresentation?: EngineExportIsometricTacticalPresentation
): NonNullable<EngineExportIsometricRoom["camera"]> {
  const halfWidth = grid.tileWidth / 2;
  const halfHeight = grid.tileHeight / 2;
  const bounds = {
    x: Math.round(grid.originX - height * halfWidth),
    y: Math.round(grid.originY),
    width: Math.round((width + height) * halfWidth),
    height: Math.round((width + height) * halfHeight + grid.tileHeight)
  };
  const tacticalWorldBounds = tacticalSurfaceWorldBounds(tacticalPresentation);
  const authoredSize = grid.worldMode === "static_composition" && room.gbStudioUseBackgroundLayout === true
    ? affineSourceSize(roomAffineAssetRecord(data, stringField(room, "backgroundAssetName", "")))
    : undefined;
  const authoredBounds = authoredSize ? { x: 0, y: 0, ...authoredSize } : undefined;
  const cameraBounds = tacticalWorldBounds ?? authoredBounds ?? bounds;
  const initialPage = tacticalPresentation?.surface_pages?.[0];
  const mode = stringField(room, "cameraMode", "fixed_center");
  const runtimeConfig = child(room, "runtime")?.config;
  const hasFixedPresentationZoom = isRecord(runtimeConfig) && typeof runtimeConfig.presentationZoom === "number";
  const presentationZoom = hasFixedPresentationZoom
    ? grid.presentationZoom
    : normalizeRoomCameraZoom(room.cameraZoom);
  const zoomX256 = Math.round((presentationZoom * 256) / 100);
  return {
    position: {
      x: initialPage ? initialPage.world.x : Math.round(cameraBounds.x + cameraBounds.width / 2 - 120),
      y: initialPage ? initialPage.world.y : Math.round(cameraBounds.y + cameraBounds.height / 2 - 80)
    },
    bounds: cameraBounds,
    bounds_enabled: true,
    zoom_x256: zoomX256,
    target_zoom_x256: zoomX256,
    follow_enabled: cameraModeFollowsPlayer(mode),
    smoothing_x256: cameraModeFollowsPlayer(mode) ? 64 : 256,
    dead_zone: { x: 96, y: 64, width: 48, height: 32 }
  };
}

function roomUsesPagedTacticalSurface(room: Record<string, unknown>): boolean {
  const runtime = child(room, "runtime");
  if (nullableStringField(runtime, "type") !== "isometric") return false;
  const config = child(runtime, "config");
  const presentation = child(config, "tacticalPresentation");
  return Array.isArray(presentation?.surfacePages) && presentation.surfacePages.length > 0;
}

function buildIsometricRooms(
  data: GBAProjectData,
  tilesetPack: AssetcTilesetPackGeneration | null,
  spritePack: AssetcSpritePackGeneration | null,
  startMenuScriptIndex = -1
): EngineExportIsometricRoom[] {
  const rooms = exportRoomsForKind(data, "isometric");
  const events = projectArray(data, "events");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const startIndex = startRoomIndex(data, rooms);
  const dialogueBoot = dialogueUiBootCommands(data, audioItems, audioPack);

  return rooms.map((room, index) => {
    const width = integerField(room, "width", 16);
    const height = integerField(room, "height", 16);
    const tileCount = Math.max(1, width) * Math.max(1, height);
    const collisionTypes = paddedCollisionTypes(room.collisionTypes, tileCount);
    const compiledTiles = compileIsometricRoomTiles({
      height,
      heightLevels: room.heightLevels,
      tileLayers: projectArray(room, "tileLayers"),
      visualTiles: room.tilemap,
      width
    });
    const eventBindings = child(room, "eventBindings");
    const onEnter = scriptForEventName(data, nullableStringField(eventBindings, "onInit"), events, rooms, dialogues, audioItems, audioPack);
    const onExit = scriptForEventName(data, nullableStringField(eventBindings, "onExit"), events, rooms, dialogues, audioItems, audioPack);
    const onUpdate = scriptForEventName(data, nullableStringField(eventBindings, "onUpdate"), events, rooms, dialogues, audioItems, audioPack);
    const onHitGroup1 = scriptForEventName(data, nullableStringField(eventBindings, "onHitGroup1"), events, rooms, dialogues, audioItems, audioPack);
    const onHitGroup2 = scriptForEventName(data, nullableStringField(eventBindings, "onHitGroup2"), events, rooms, dialogues, audioItems, audioPack);
    const onHitGroup3 = scriptForEventName(data, nullableStringField(eventBindings, "onHitGroup3"), events, rooms, dialogues, audioItems, audioPack);
    const roomDialogueBoot = index === startIndex ? dialogueBoot : [];
    const grid = isometricSceneConfigFromRuntime(room.runtime, data.settings);
    const pagedTacticalSurface = roomUsesPagedTacticalSurface(room);
    const roomData: EngineExportIsometricRoom = {
      name: roomName(room, index),
      world_mode: pagedTacticalSurface ? "scrollable_tiled_world" : grid?.worldMode ?? "scrollable_tiled_world",
      resource_bank_group: engineSceneResourceBankGroupName(room, index),
      width_tiles: width,
      height_tiles: height,
      visual_tiles: compiledTiles.visualTiles,
      collision_flags: paddedCollisionFlagsFromTypes(collisionTypes, tileCount),
      ramp_flags: collisionSlopesFromTypes(collisionTypes),
      height_levels: compiledTiles.heightLevels,
      video: buildRoomVideoComposition(data, room, tilesetPack)
    };
    const cameraZones = roomCameraZonesForExport(room, (area) => area);
    if (cameraZones.length > 0) roomData.camera_zones = cameraZones;
    let tacticalPresentation: EngineExportIsometricTacticalPresentation | undefined;
    if (grid) {
      roomData.grid = {
        tile_width_pixels: grid.tileWidth,
        tile_height_pixels: grid.tileHeight,
        height_step_pixels: grid.heightStep,
        origin: { x: grid.originX, y: grid.originY },
        gameplay_mode: grid.gameplayMode,
        profile: grid.profile,
        projection: grid.projection,
        movement_model: grid.movement,
        height_mode: grid.heightMode
      };
      tacticalPresentation = buildIsometricTacticalPresentation(data, room, grid, tilesetPack, spritePack, audioPack);
      roomData.camera = buildIsometricRoomCamera(data, room, width, height, grid, tacticalPresentation);
      if (tacticalPresentation) {
        roomData.tactical_presentation = tacticalPresentation;
      }
      if (grid.gameplayMode === "tactical" && grid.tactical) {
        roomData.tactical = {
          enabled: true,
          active_team: grid.tactical.activeTeam,
          active_unit_index: grid.tactical.activeUnitIndex ?? 0,
          units: grid.tactical.units.map((unit) => ({
            actor_index: unit.actorIndex,
            team: unit.team,
            move_range: unit.moveRange,
            attack_range: unit.attackRange,
            max_hp: unit.maxHp,
            attack_power: unit.attackPower
          }))
        };
      }
    }
    const authoredBackgroundName = nullableStringField(room, "backgroundAssetName")
      || nullableStringField(room, "background")
      || null;
    const tilesetName = nullableStringField(room, "tilesetAssetName")
      || authoredBackgroundName
      || Object.keys(tilesetPack?.assetsBySheet ?? {})[0]
      || null;
    const tilesetAsset = tilesetName ? tilesetPack?.assetsBySheet[tilesetName] : undefined;
    if (tilesetAsset) {
      const asset = projectArray(data, "assets").find(
        (candidate) => nullableStringField(candidate, "name") === tilesetName
      );
      const metadata = child(asset ?? {}, "metadata");
      roomData.tileset = tilesetAsset.name;
      roomData.tileset_tile_width_pixels = integerField(metadata, "tileWidth", grid?.tileWidth ?? 32);
      roomData.tileset_tile_height_pixels = integerField(metadata, "tileHeight", grid?.tileHeight ?? 16);
      roomData.tileset_tile_offset_x_pixels = integerField(metadata, "tileOffsetX", 0);
      roomData.tileset_tile_offset_y_pixels = integerField(metadata, "tileOffsetY", 0);
      if (typeof metadata?.atlasTileWidth === "number") {
        roomData.tileset_render_width_pixels = integerField(metadata, "atlasTileWidth", roomData.tileset_tile_width_pixels);
      }
      roomData.tileset_render_offset_y_pixels = integerField(metadata, "atlasRenderOffsetY", 0);
      if (typeof metadata?.atlasTileHeight === "number") {
        roomData.tileset_render_height_pixels = integerField(metadata, "atlasTileHeight", roomData.tileset_tile_height_pixels);
      }
    }
    const authoredBackgroundAsset = authoredBackgroundName
      ? tilesetPack?.assetsBySheet[authoredBackgroundName]
      : undefined;
    if (grid?.pagedSurface) {
      const surface = grid.pagedSurface;
      const background = tilesetPack?.assetsBySheet[surface.backgroundAsset];
      const foreground = tilesetPack?.assetsBySheet[surface.foregroundAsset];
      if (!background || !foreground || background.kind !== "paged_bg" || foreground.kind !== "paged_bg") {
        throw new Error(`Isometric scene ${roomData.name}: paged surface requires two paged_bg assets.`);
      }
      if (grid.worldMode !== "scrollable_tiled_world" || grid.gameplayMode !== "adventure" || grid.presentationZoom !== 100) {
        throw new Error(`Isometric scene ${roomData.name}: paged surface requires adventure, scrolling and 100% runtime scale.`);
      }
      roomData.paged_surface = { background: background.name, foreground: foreground.name, width: surface.width, height: surface.height };
      delete roomData.tileset;
      delete roomData.tileset_render_offset_y_pixels;
      roomData.camera = { ...roomData.camera!, bounds: {x: 0, y: 0, width: surface.width, height: surface.height}, position: {x: 0, y: 0} };
    }
    if (
      authoredBackgroundAsset &&
      !pagedTacticalSurface &&
      grid?.worldMode === "static_composition" &&
      room.gbStudioUseBackgroundLayout === true &&
      stringField(room, "backgroundRenderMode", "tilemap") === "tilemap"
    ) {
      roomData.authored_background = authoredBackgroundAsset.name;
    }
    if (projectArray(room, "tileLayers").length > 0) {
      roomData.background_layers = compiledTiles.backgroundLayers;
    }

    const actors = isometricActorsForRoom(data, room, index);
    const startMenuBinding = startMenuScriptIndex >= 0
      ? [{ op: "attach_button_event" as const, button: "start", index: startMenuScriptIndex, override: true }]
      : [];
    const onEnterScript = mergeRoomOnEnterScript(roomDialogueBoot, [...(onEnter ?? []), ...startMenuBinding]);
    if (onEnterScript) {
      roomData.on_enter = onEnterScript;
    }
    if (onUpdate && onUpdate.length > 0) {
      roomData.on_update = onUpdate;
    }
    if (onExit && onExit.length > 0) roomData.on_exit = onExit;
    if (onHitGroup1 && onHitGroup1.length > 0) roomData.on_hit_group1 = onHitGroup1;
    if (onHitGroup2 && onHitGroup2.length > 0) roomData.on_hit_group2 = onHitGroup2;
    if (onHitGroup3 && onHitGroup3.length > 0) roomData.on_hit_group3 = onHitGroup3;

    const runtimeActors = actors.length > 0
      ? actors
      : [{
          x: Math.max(0, Math.min(width - 1, playerPositionForRoom(data, room, index).x)),
          y: Math.max(0, Math.min(height - 1, playerPositionForRoom(data, room, index).y)),
          z: 0,
          tileIndex: 0,
          palette: 0
        }];
    const tacticalUnitActorIDs = new Set(
      tacticalPresentation?.capabilities.includes("tactical_units")
        ? tacticalPresentation.units.map((unit) => unit.actor_id)
        : []
    );
    roomData.actors = runtimeActors.map((actor) => {
        const actorPosition = entityPosition(actor, "actor");
        const actorX = actorPosition.x;
        const actorY = actorPosition.y;
        const heightIndex = actorY * width + actorX;
        const authoredHeight = heightIndex >= 0 && heightIndex < compiledTiles.heightLevels.length
          ? compiledTiles.heightLevels[heightIndex]
          : 0;
        const onInteract = scriptForEventName(data, resolveActorInteractEventName(actor), events, rooms, dialogues, audioItems, audioPack);
        const actorOnStart = scriptForEventName(data, resolveActorInitEventName(actor), events, rooms, dialogues, audioItems, audioPack);
        const actorOnUpdate = scriptForEventName(data, resolveActorOnUpdateEventName(actor), events, rooms, dialogues, audioItems, audioPack);
        const actorReferences = [nullableStringField(actor, "id"), nullableStringField(actor, "name")]
          .filter((reference): reference is string => Boolean(reference));
        const isTacticalUnit = actorReferences.some((reference) => tacticalUnitActorIDs.has(reference));
        const spriteExport = buildActorEngineSpriteExport(data, actor, spritePack, {
          directionAdapter: "isometric",
          includeIsometricTacticalAnimations: isTacticalUnit
        });
        const actorAnimations = buildIsometricActorAnimations(spriteExport?.animations);
        const animation = spriteExport?.animation;
        const animationRecord = nullableStringField(actor, "animationName");
        const actorAnimation = typeof animation === "string" ? animation : animationRecord ?? undefined;
        const actorSpriteAsset = spriteExport?.metasprite.asset;
        const packAsset = actorSpriteAsset
          ? spritePack?.packAssets.find((asset) => asset.name === actorSpriteAsset)
          : undefined;
        const screenOffset = packAsset
          ? isometricSpriteFeetOffset(
              packAsset.sprite_width,
              packAsset.sprite_height,
              grid?.tileHeight
            )
          : { x: 0, y: 0 };
        return {
          tile: {
            x: actorX,
            y: actorY,
            z: integerField(actor, "z", authoredHeight)
          },
          screen_offset: screenOffset,
          tile_index: integerField(actor, "tileIndex", 0),
          palette: integerField(actor, "palette", 0),
          follow_player: actor.followPlayer !== false,
          ...(packAsset ? { size: { x: packAsset.sprite_width, y: packAsset.sprite_height } } : {}),
          ...(Math.max(0, Math.min(15, integerField(actor, "collisionGroup", 0))) > 0
            ? { collision_group: Math.max(0, Math.min(15, integerField(actor, "collisionGroup", 0))) }
            : {}),
          ...(spriteExport ? { metasprite: spriteExport.metasprite } : {}),
          ...(actorAnimation ? { animation: actorAnimation } : {}),
          ...(actorAnimations ? { animations: actorAnimations } : {}),
          ...(actorOnStart && actorOnStart.length > 0 ? { on_start: actorOnStart } : {}),
          ...(onInteract && onInteract.length > 0 ? { on_interact: onInteract } : {}),
          ...(actorOnUpdate && actorOnUpdate.length > 0 ? { on_update: actorOnUpdate } : {})
        };
      });

    const projectTriggers = projectArray(data, "triggers").filter((trigger) => {
      const roomNameValue = entitySceneName(trigger, "trigger");
      return !roomNameValue || roomNameValue === roomData.name;
    });
    if (projectTriggers.length > 0) {
      const triggerTileEvents = projectTriggers.flatMap((trigger) => {
        const onInteract = scriptForEventName(data, resolveTriggerInteractEventName(trigger), events, rooms, dialogues, audioItems, audioPack);
        if (!onInteract || onInteract.length === 0) return [];
        const bounds = entityBounds(trigger, "trigger", {
          x: Math.max(0, width - 2),
          y: Math.floor(height / 2),
          width: 2,
          height: 2
        });
        return [{
          area: {
            ...bounds,
            ...(Array.isArray(room.heightLevels) && room.heightLevels.length === tileCount
              ? { z: compiledTiles.heightLevels[bounds.y * width + bounds.x] ?? 0 }
              : {})
          },
          on_interact: onInteract
        }];
      });
      if (triggerTileEvents.length > 0) roomData.tile_events = triggerTileEvents;

      roomData.triggers = projectTriggers.flatMap((trigger) => {
        const triggerOnEnter = scriptForEventName(data, resolveTriggerEnterEventName(trigger), events, rooms, dialogues, audioItems, audioPack);
        const onLeave = scriptForEventName(data, resolveTriggerLeaveEventName(trigger), events, rooms, dialogues, audioItems, audioPack);
        if ((!triggerOnEnter || triggerOnEnter.length === 0) && (!onLeave || onLeave.length === 0)) return [];
        const bounds = entityBounds(trigger, "trigger", {
          x: Math.max(0, width - 2),
          y: Math.floor(height / 2),
          width: 2,
          height: 2
        });
        return [{
          area: bounds,
          ...(triggerOnEnter && triggerOnEnter.length > 0 ? { on_enter: triggerOnEnter } : {}),
          ...(onLeave && onLeave.length > 0 ? { on_leave: onLeave } : {})
        }];
      });
    }

    const connections = child(data, "editorState")?.scenaConnections;
    const doors = Array.isArray(connections)
      ? connections.filter(isRecord).filter((connection) => nullableStringField(connection, "from") === roomData.name)
      : [];
    if (doors.length > 0) {
        roomData.tile_events = [
          ...(roomData.tile_events ?? []),
          ...doors.flatMap((connection) => {
        const targetReference = nullableStringField(connection, "to");
        const allRooms = projectRooms(data);
        const globalTargetIndex = roomIndexByName(allRooms, targetReference);
        if (globalTargetIndex < 0) return [];
        const targetKind = resolveSceneRuntimeExport(roomSceneType(allRooms[globalTargetIndex] ?? {})).kind;
        if (!MIXED_RUNTIME_KINDS.has(targetKind)) return [];
        const targetRooms = exportRoomsForKind(data, targetKind);
        const targetRoomIndex = roomIndexByName(targetRooms, targetReference);
        if (targetRoomIndex < 0) return [];
        const targetRoom = targetRooms[targetRoomIndex];
        const targetWidth = integerField(targetRoom, "width", 20);
        const targetHeight = integerField(targetRoom, "height", 18);
        const exitArea = connectionAreaField(connection, "exit", defaultRoomConnectionExitArea(width, height));
        // Zero-area connections describe event/actor navigation in the overview;
        // they must not create an invisible or invalid physical door.
        if (exitArea.width <= 0 || exitArea.height <= 0) return [];
        const entryArea = connectionAreaField(connection, "entry", defaultRoomConnectionEntryArea(targetWidth, targetHeight));
        const targetCollisionTypes = paddedCollisionTypes(targetRoom.collisionTypes, targetWidth * targetHeight);
        const arrival = roomConnectionArrival(entryArea, targetWidth, targetHeight, targetCollisionTypes);
        const connectionScript = scriptForEventName(data, nullableStringField(connection, "eventName"), events, rooms, dialogues, audioItems, audioPack);
        const warp = sceneWarpCommand(data, "isometric", targetKind, targetRooms, targetRoomIndex,
          targetKind === "isometric" ? { x: arrival.x, y: arrival.y }
            : { x: gbaTopdownTileToPixels(arrival.x), y: gbaTopdownTileToPixels(arrival.y) }, room);
        const rawScript = connectionScript?.some((command) => command.op === "warp" || command.op === "warp_runtime")
          ? connectionScript
          : [...(connectionScript ?? []), warp];
        const script = wrapSceneConnectionTransition(connection, rawScript, data.settings);
            return [{ area: exitArea, on_interact: script }];
          })
        ];
    }

    return roomData;
  });
}

function buildIsometricProject(
  data: GBAProjectData,
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()
): EngineExportIsometricProject {
  const rooms = exportRoomsForKind(data, "isometric");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const tilesetPack = buildAssetcTilesetPackGeneration(data);
  const events = projectArray(data, "events");
  const spritePack = buildAssetcSpritePackGeneration(data);
  const portraitPack = buildAssetcPortraitPackGeneration(data, spritePack);
  const emotePack = buildAssetcEmotePackGeneration(data, spritePack, portraitPack);
  const portraitAssets = buildDialoguePortraitAssetsExport(data, portraitPack, spritePack);
  const emoteAssets = buildDialogueEmoteAssetsExport(data, emotePack, portraitPack, spritePack);
  const scripts = buildTopdownScripts(data, events, rooms, dialogues, audioItems, audioPack, pluginRegistry, true, "isometric");
  const startMenuScriptIndex = scripts.findIndex((entry) => entry.name === "__gbastudio_start_menu__");
  const residentTilesets = regularTilesetAssetNames(tilesetPack).filter(name =>
    tilesetPack?.packAssets.find(asset => asset.name === name)?.kind !== "paged_bg"
  );
  return {
    initial_room: startRoomIndex(data, rooms),
    // The atlas deliberately keeps the corners of each 32×32 tile transparent.
    // Use the Market's deep navy palette color behind those corners instead of
    // exposing the engine's black default between suspended platforms.
    backdrop_color: 3137,
    video: buildExportAdvancedVideoComposition(data),
    save: buildProjectSaveConfig(data),
    rooms: buildIsometricRooms(data, tilesetPack, spritePack, startMenuScriptIndex),
    dialogue_lines: buildDialogueLines(data, dialogues, audioItems, audioPack),
    dialogue_ui: buildEngineDialogueUiConfigForExport(data),
    ...(portraitAssets.length > 0 ? { portrait_assets: portraitAssets } : {}),
    ...(emoteAssets.length > 0 ? { emote_assets: emoteAssets } : {}),
    scripts,
    ...((tilesetPack || spritePack || portraitPack || emotePack) ? { resource_banks: "asset_pack" as const } : {}),
    ...((tilesetPack || spritePack || audioPack) ? {
      assets: {
        ...(tilesetPack ? {
          bg_palettes: residentTilesets,
          tile_assets: [
            ...residentTilesets,
            ...(spritePack?.assetNames ?? [])
          ]
        } : {}),
        ...(spritePack ? {
          obj_palettes: spritePack.assetNames,
          sprite_assets: spritePack.assetNames,
          ...(!tilesetPack ? { tile_assets: spritePack.assetNames } : {})
        } : {}),
        ...(audioPack ? buildAudioPackAssetRefs(audioPack) : {})
      }
    } : {})
  };
}

function dungeonDurationFrames(milliseconds: number, fallback: number): number {
  const value = Number.isFinite(milliseconds) ? milliseconds : fallback;
  return Math.max(1, Math.min(255, Math.round((value * 60) / 1000)));
}

function dungeonDirection(value: unknown): EngineExportDungeonCrawlerRoom["player_start"]["direction"] {
  if (value === "right" || value === "east") return "east";
  if (value === "down" || value === "south") return "south";
  if (value === "left" || value === "west") return "west";
  return "north";
}

function dungeonCrawlerSafePlayerStart(
  preferred: { x: number; y: number },
  collisionTypes: RoomCollisionType[],
  width: number,
  height: number
): { x: number; y: number } {
  const clamp = (value: number, maximum: number) => Math.max(0, Math.min(maximum - 1, Math.trunc(value)));
  const preferredPosition = {
    x: clamp(preferred.x, width),
    y: clamp(preferred.y, height)
  };
  const collisionFlags = collisionFlagsFromTypes(collisionTypes);
  const isFree = (position: { x: number; y: number }) => (
    collisionFlags[(position.y * width) + position.x] ?? 1
  ) === 0;
  if (isFree(preferredPosition)) return preferredPosition;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const position = { x, y };
      if (isFree(position)) return position;
    }
  }

  return preferredPosition;
}

function advancedRuntimeBackgrounds(
  rooms: Record<string, unknown>[],
  tilesetPack: AssetcTilesetPackGeneration | null
): { backgrounds: NonNullable<EngineExportDungeonCrawlerProject["backgrounds"]>; indexByRoomName: Map<string, number> } {
  const backgrounds: NonNullable<EngineExportDungeonCrawlerProject["backgrounds"]> = [];
  const indexByRoomName = new Map<string, number>();
  rooms.forEach((room, index) => {
    const backgroundName = roomBackgroundAssetName(room);
    const asset = backgroundName && tilesetPack ? tilesetPack.assetsBySheet[backgroundName] : undefined;
    if (!asset) return;
    indexByRoomName.set(roomName(room, index), backgrounds.length);
    backgrounds.push({
      layer: "bg2",
      tilemap: asset.name,
      backdrop_from_tilemap_palette: true
    });
  });
  return { backgrounds, indexByRoomName };
}

function advancedRuntimeAssetSection(
  backgroundAssetNames: readonly string[],
  spriteAssetNames: readonly string[],
  audioPack: AssetcAudioPackGeneration | null,
  affineBackgroundAssetNames: readonly string[] = []
): EngineExportTopdownProject["assets"] | undefined {
  const regularBackgrounds = Array.from(new Set(backgroundAssetNames));
  const bgPalettes = Array.from(new Set([...regularBackgrounds, ...affineBackgroundAssetNames]));
  const objPalettes = Array.from(new Set(spriteAssetNames));
  if (bgPalettes.length === 0 && objPalettes.length === 0 && !audioPack) return undefined;
  return {
    bg_palettes: bgPalettes,
    ...(objPalettes.length > 0 ? { obj_palettes: objPalettes, sprite_assets: objPalettes } : {}),
    tile_assets: [...regularBackgrounds, ...objPalettes],
    ...(audioPack ? buildAudioPackAssetRefs(audioPack) : {})
  };
}

interface EngineExportRacingPseudo3DVisual {
  horizon_y: number;
  panorama?: string;
  floor: string;
  minimap?: string;
}

function buildRacingPseudo3DVisuals(
  data: GBAProjectData,
  rooms: Record<string, unknown>[],
  tilesetPack: AssetcTilesetPackGeneration | null
): { visuals: EngineExportRacingPseudo3DVisual[]; indexByRoomName: Map<string, number> } {
  const visuals: EngineExportRacingPseudo3DVisual[] = [];
  const indexByRoomName = new Map<string, number>();
  const visualKeyToIndex = new Map<string, number>();

  rooms.forEach((room, index) => {
    const config = racingSceneConfigFromRuntime(room.runtime, data.settings);
    const source = config?.pseudo3dVisuals;
    if (config?.presentation !== "pseudo3d" || !source ||
      !source.floorTilemapId || !tilesetPack) {
      return;
    }
    const panorama = tilesetPack.assetsBySheet[source.panoramaBackgroundId]?.name;
    const floor = tilesetPack.assetsBySheet[source.floorTilemapId]?.name;
    const minimap = tilesetPack.assetsBySheet[source.minimapAssetId]?.name;
    if (!floor) return;
    const visual: EngineExportRacingPseudo3DVisual = {
      horizon_y: source.horizonY,
      ...(panorama ? { panorama } : {}),
      floor,
      ...(minimap ? { minimap } : {})
    };
    const key = JSON.stringify(visual);
    const visualIndex = visualKeyToIndex.get(key);
    if (visualIndex !== undefined) {
      indexByRoomName.set(roomName(room, index), visualIndex);
      return;
    }
    const nextIndex = visuals.length;
    visuals.push(visual);
    visualKeyToIndex.set(key, nextIndex);
    indexByRoomName.set(roomName(room, index), nextIndex);
  });

  return { visuals, indexByRoomName };
}

function advancedRuntimeTriggers(
  data: GBAProjectData,
  room: Record<string, unknown>,
  rooms: Record<string, unknown>[],
  events: Record<string, unknown>[],
  dialogues: Record<string, unknown>[],
  audioItems: Record<string, unknown>[],
  audioPack: AssetcAudioPackGeneration | null,
  pluginRegistry: ProjectPluginRegistry,
  areaToRuntime: (area: { x: number; y: number; width: number; height: number }) => { x: number; y: number; width: number; height: number }
): NonNullable<EngineExportDungeonCrawlerRoom["triggers"]> {
  const currentRoomName = nullableStringField(room, "name") ?? "";
  return projectArray(data, "triggers")
    .filter((trigger) => entitySceneName(trigger, "trigger") === currentRoomName)
    .flatMap((trigger) => {
      const onEnter = scriptForEventName(data, resolveTriggerEnterEventName(trigger), events, rooms, dialogues, audioItems, audioPack, pluginRegistry);
      const onLeave = scriptForEventName(data, resolveTriggerLeaveEventName(trigger), events, rooms, dialogues, audioItems, audioPack, pluginRegistry);
      if ((!onEnter || onEnter.length === 0) && (!onLeave || onLeave.length === 0)) return [];
      const bounds = entityBounds(trigger, "trigger");
      return [{
        area: areaToRuntime(bounds),
        ...(onEnter && onEnter.length > 0 ? { on_enter: onEnter } : {}),
        ...(onLeave && onLeave.length > 0 ? { on_leave: onLeave } : {})
      }];
    });
}

function buildDungeonCrawlerDepthSpriteExports(
  data: GBAProjectData,
  actor: Record<string, unknown>,
  spritePack: AssetcSpritePackGeneration | null
): NonNullable<EngineExportDungeonCrawlerRoom["actors"]>[number]["depth_metasprites"] | undefined {
  const spriteSheet = nullableStringField(actor, "spriteSheet");
  if (!spriteSheet || !spritePack?.assetsBySheet[spriteSheet]) return undefined;

  const asset = projectArray(data, "assets").find((candidate) => stringField(candidate, "name", "") === spriteSheet);
  const metadata = asset && isRecord(asset.metadata) ? asset.metadata : null;
  if (!metadata || stringField(metadata, "role", "") !== "dungeon-depth-actor") return undefined;

  const animationNames = projectArray(data, "animations")
    .filter((animation) => nullableStringField(animation, "spriteSheet") === spriteSheet)
    .map((animation) => nullableStringField(animation, "name"))
    .filter((name): name is string => Boolean(name));
  const actorAnimationName = nullableStringField(actor, "animationName") ?? "sentinel_far";
  const prefix = actorAnimationName.replace(/_(?:far|mid|near)$/i, "");
  const names = {
    far: `${prefix}_far`,
    mid: `${prefix}_mid`,
    near: `${prefix}_near`
  } as const;
  if (!Object.values(names).every((name) => animationNames.includes(name))) return undefined;

  type DungeonDepthSpriteExport = {
    far: { asset: string; index: number };
    mid: { asset: string; index: number };
    near: { asset: string; index: number };
  };
  const exports = Object.fromEntries(
    Object.entries(names).map(([variant, animationName]) => {
      const sprite = buildActorEngineSpriteExport(
        data,
        { ...actor, animationName, animationFrameIndex: 0 },
        spritePack
      );
      return [variant, sprite?.metasprite];
    })
  ) as Partial<DungeonDepthSpriteExport>;
  if (!exports.far || !exports.mid || !exports.near) return undefined;
  return { far: exports.far, mid: exports.mid, near: exports.near };
}

function buildDungeonCrawlerRooms(
  data: GBAProjectData,
  spritePack: AssetcSpritePackGeneration | null,
  tilesetPack: AssetcTilesetPackGeneration | null,
  backgroundIndexByRoomName: ReadonlyMap<string, number>,
  pluginRegistry: ProjectPluginRegistry,
  startMenuScriptIndex = -1
): EngineExportDungeonCrawlerRoom[] {
  const rooms = exportRoomsForKind(data, "dungeon_crawler");
  const events = projectArray(data, "events");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const startIndex = startRoomIndex(data, rooms);
  const dialogueBoot = dialogueUiBootCommands(data, audioItems, audioPack);

  return rooms.map((room, index) => {
    const width = Math.max(1, integerField(room, "width", 16));
    const height = Math.max(1, integerField(room, "height", 16));
    const tileCount = width * height;
    const collisionTypes = paddedCollisionTypes(room.collisionTypes, tileCount);
    const config = dungeonCrawlerSceneConfigFromRuntime(room.runtime, data.settings);
    const player = config?.playerStart
      ? { x: config.playerStart.x, y: config.playerStart.y }
      : playerPositionForRoom(data, room, index);
    const playerStart = dungeonCrawlerSafePlayerStart(player, collisionTypes, width, height);
    const playerName = configuredPlayerActorName(data, room);
    const playerActor = projectArray(data, "actors").find((actor) => {
      const actorRoom = entitySceneName(actor, "actor");
      return (!actorRoom || actorRoom === roomName(room, index))
        && actorMatchesPlayerName(actor, playerName);
    });
    const eventBindings = child(room, "eventBindings");
    const onEnter = scriptForEventName(
      data,
      nullableStringField(eventBindings, "onInit"),
      events,
      rooms,
      dialogues,
      audioItems,
      audioPack,
      pluginRegistry
    );
    const roomRuntimeModules = child(child(room, "runtime"), "config")?.modules;
    const roomFeatureRuntime = resolveDungeonCrawlerFeatureRuntime(roomRuntimeModules);
    // Dungeon rooms that expose their own map keep START in the runtime. The
    // map is an in-place overlay, so attaching the global Start Menu here
    // would intercept the input and leave the crawler without a way to close
    // its map. R opens the authored pause menu without stealing START or SELECT.
    const startMenuBinding = startMenuScriptIndex >= 0
      ? [{ op: "attach_button_event" as const, button: roomFeatureRuntime.mapEnabled ? "r" : "start", index: startMenuScriptIndex, override: true }]
      : [];
    const onEnterScript = mergeRoomOnEnterScript(index === startIndex ? dialogueBoot : [], [...(onEnter ?? []), ...startMenuBinding]);
    const currentRoomName = roomName(room, index);
    const actors = npcActorsForRoom(data, room, index).flatMap((actor) => {
      const sprite = buildActorEngineSpriteExport(data, actor, spritePack);
      if (!sprite) return [];
      const depthMetasprites = buildDungeonCrawlerDepthSpriteExports(data, actor, spritePack);
      const onInteract = scriptForEventName(data, resolveActorInteractEventName(actor), events, rooms, dialogues, audioItems, audioPack, pluginRegistry);
      const position = entityPosition(actor, "actor");
      return [{
        name: stringField(actor, "name", "Actor"),
        position,
        metasprite: sprite.metasprite,
        ...(depthMetasprites ? { depth_metasprites: depthMetasprites } : {}),
        ...(onInteract && onInteract.length > 0 ? { on_interact: onInteract } : {})
      }];
    });
    const triggers = advancedRuntimeTriggers(
      data,
      room,
      rooms,
      events,
      dialogues,
      audioItems,
      audioPack,
      pluginRegistry,
      (area) => area
    );
    return {
      name: currentRoomName,
      resource_bank_group: engineSceneResourceBankGroupName(room, index),
      width_tiles: width,
      height_tiles: height,
      collision_flags: paddedCollisionFlagsFromTypes(collisionTypes, tileCount),
      config: {
        step_duration_frames: dungeonDurationFrames(config?.stepDurationMs ?? 180, 180),
        turn_duration_frames: dungeonDurationFrames(config?.turnDurationMs ?? 120, 120),
        allow_backstep: config?.allowBackstep ?? true,
        view_distance: config?.viewDistance ?? 5
      },
      player_start: {
        x: playerStart.x,
        y: playerStart.y,
        direction: dungeonDirection(config?.playerStart?.direction ?? playerActor?.direction)
      },
      battle_enabled: roomFeatureRuntime.battleEnabled,
      video: buildRoomVideoComposition(data, room, tilesetPack),
      ...(backgroundIndexByRoomName.has(currentRoomName) ? { background: backgroundIndexByRoomName.get(currentRoomName) } : {}),
      ...(onEnterScript ? { on_enter: onEnterScript } : {}),
      ...(triggers.length > 0 ? { triggers } : {}),
      ...(actors.length > 0 ? { actors } : {})
    };
  });
}

function buildDungeonCrawlerProject(
  data: GBAProjectData,
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()
): EngineExportDungeonCrawlerProject {
  const rooms = exportRoomsForKind(data, "dungeon_crawler");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const spritePack = buildAssetcSpritePackGeneration(data);
  const tilesetPack = buildAssetcTilesetPackGeneration(data);
  const visual = advancedRuntimeBackgrounds(rooms, tilesetPack);
  const events = projectArray(data, "events");
  const scripts = buildTopdownScripts(data, events, rooms, dialogues, audioItems, audioPack, pluginRegistry, true, "dungeon_crawler");
  const startMenuScriptIndex = scripts.findIndex((entry) => entry.name === "__gbastudio_start_menu__");
  const dungeonRooms = buildDungeonCrawlerRooms(data, spritePack, tilesetPack, visual.indexByRoomName, pluginRegistry, startMenuScriptIndex);
  const initialRoom = rooms[startRoomIndex(data, rooms)] ?? rooms[0] ?? {};
  const dungeonModules = rooms.flatMap((room) => {
    const modules = child(child(room, "runtime"), "config")?.modules;
    return Array.isArray(modules) ? modules : [];
  });
  const featureRuntime = resolveDungeonCrawlerFeatureRuntime(dungeonModules);
  const battleRoom = dungeonRooms.find((room) => (
    room.actors?.some((actor) => actor.name === featureRuntime.battle?.enemyActor) ?? false
  ));
  const enemyActorIndex = featureRuntime.battle
    ? (battleRoom?.actors?.findIndex((actor) => actor.name === featureRuntime.battle?.enemyActor) ?? -1)
    : -1;
  const dungeonSpriteAssets = Array.from(new Set(dungeonRooms.flatMap((room) =>
    room.actors?.flatMap((actor) => [
      actor.metasprite.asset,
      ...(actor.depth_metasprites ? Object.values(actor.depth_metasprites).map((metasprite) => metasprite.asset) : [])
    ]) ?? []
  )));
  const assetSection = advancedRuntimeAssetSection(
    visual.backgrounds.map((background) => background.tilemap),
    dungeonSpriteAssets,
    audioPack
  );
  return {
    initial_room: startRoomIndex(data, rooms),
    ...((tilesetPack || spritePack) ? { resource_banks: "asset_pack" as const } : {}),
    save: buildProjectSaveConfig(data),
    rooms: dungeonRooms,
    dialogue_lines: buildDialogueLines(data, dialogues, audioItems, audioPack),
    dialogue_ui: buildEngineDialogueUiConfigForExport(data),
    scripts,
    inventory_enabled: featureRuntime.inventoryEnabled,
    battle_enabled: featureRuntime.battleEnabled,
    compass_enabled: featureRuntime.compassEnabled,
    map_enabled: featureRuntime.mapEnabled,
    depth_sprites_enabled: featureRuntime.depthSpritesEnabled,
    ...(featureRuntime.inventory ? {
      inventory_items: [{
        label: featureRuntime.inventory.label,
        item: featureRuntime.inventory.item,
        initial_quantity: featureRuntime.inventory.initialQuantity,
        heal_amount: featureRuntime.inventory.healAmount
      }]
    } : {}),
    ...(featureRuntime.battle ? {
      battle: {
        enemy_name: featureRuntime.battle.enemyName,
        enemy_actor_index: enemyActorIndex,
        max_hp: featureRuntime.battle.maxHp,
        player_damage: featureRuntime.battle.playerDamage,
        enemy_damage: featureRuntime.battle.enemyDamage,
        reward_item: featureRuntime.battle.rewardItem,
        reward_quantity: featureRuntime.battle.rewardQuantity
      }
    } : {}),
    ...(assetSection ? { assets: assetSection } : {}),
    ...(visual.backgrounds.length > 0 ? { backgrounds: visual.backgrounds } : {})
  };
}

function racingX256(value: number, fallback: number): number {
  const resolved = Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(0x7fff, Math.round(resolved * 256)));
}

function buildRacingRooms(
  data: GBAProjectData,
  spritePack: AssetcSpritePackGeneration | null,
  tilesetPack: AssetcTilesetPackGeneration | null,
  backgroundIndexByRoomName: ReadonlyMap<string, number>,
  pseudo3dVisualIndexByRoomName: ReadonlyMap<string, number>,
  pluginRegistry: ProjectPluginRegistry
): EngineExportRacingRoom[] {
  const rooms = exportRoomsForKind(data, "racing");
  const events = projectArray(data, "events");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  return rooms.map((room, index) => {
    const width = Math.max(1, integerField(room, "width", 16));
    const height = Math.max(1, integerField(room, "height", 32));
    const tileCount = width * height;
    const collisionTypes = paddedCollisionTypes(room.collisionTypes, tileCount);
    const config = racingSceneConfigFromRuntime(room.runtime, data.settings);
    if(config?.presentation === "pseudo3d" && config.topdownTrack) {
      if(width!==height || ![16,32,64,128].includes(width)) throw new Error("Corrida em perspectiva: o circuito precisa ser quadrado, com 256, 512 ou 1024 pixels por lado no editor.");
      if(!pseudo3dVisualIndexByRoomName.has(roomName(room,index))) throw new Error("Corrida em perspectiva: selecione um piso do circuito antes de usar Play.");
      const camera=config.perspectiveCamera??{height:48,distance:64,focalLength:96};
      if((config.pseudo3dVisuals?.horizonY??48)+camera.height*camera.focalLength/camera.distance>152)
        throw new Error("Câmera da corrida: aumente a distância ou reduza a altura/perspectiva para manter o carro dentro da tela.");
    }
    const player = playerPositionForRoom(data, room, index);
    const currentRoomName = roomName(room, index);
    const eventBindings = child(room, "eventBindings");
    const onEnter = scriptForEventName(data, nullableStringField(eventBindings, "onInit"), events, rooms, dialogues, audioItems, audioPack, pluginRegistry);
    const onVictory = scriptForEventName(data, nullableStringField(eventBindings, "onVictory"), events, rooms, dialogues, audioItems, audioPack, pluginRegistry);
    const onDefeat = scriptForEventName(data, nullableStringField(eventBindings, "onDefeat"), events, rooms, dialogues, audioItems, audioPack, pluginRegistry);
    const actors = npcActorsForRoom(data, room, index).flatMap((actor) => {
      const sprite = buildActorEngineSpriteExport(data, actor, spritePack);
      if (!sprite) return [];
      const onInteract = scriptForEventName(data, resolveActorInteractEventName(actor), events, rooms, dialogues, audioItems, audioPack, pluginRegistry);
      const position = entityPosition(actor, "actor");
      return [{
        name: stringField(actor, "name", "Rival"),
        position_pixels: {
          x: gbaTopdownTileToPixels(position.x) + Math.floor(gbaTileSizePx / 2),
          y: gbaTopdownTileToPixels(position.y) + Math.floor(gbaTileSizePx / 2)
        },
        metasprite: sprite.metasprite,
        ...(onInteract && onInteract.length > 0 ? { on_interact: onInteract } : {})
      }];
    });
    const triggers = advancedRuntimeTriggers(
      data,
      room,
      rooms,
      events,
      dialogues,
      audioItems,
      audioPack,
      pluginRegistry,
      gbaTopdownAreaToPixels
    );
    const resourceBankGroup = engineSceneResourceBankGroupName(room, index);
    const hasResourceBankGroup = [
      ...(spritePack?.packAssets ?? []),
      ...(tilesetPack?.packAssets ?? [])
    ].some((asset) => asset.bank_groups.includes(resourceBankGroup));
    return {
      name: currentRoomName,
      ...(hasResourceBankGroup ? { resource_bank_group: resourceBankGroup } : {}),
      width_tiles: width,
      height_tiles: height,
      collision_flags: paddedCollisionFlagsFromTypes(collisionTypes, tileCount),
      config: {
        max_speed_x256: racingX256(config?.maxSpeed ?? 4, 4),
        acceleration_x256_per_second: racingX256(config?.acceleration ?? 8, 8),
        brake_power_x256_per_second: racingX256(config?.brakePower ?? 12, 12),
        steering_speed_x256: racingX256(config?.steeringSpeed ?? 2, 2),
        presentation: config?.presentation === "pseudo3d" ? "pseudo3d" : "topdown",
        laps_to_win: Math.max(1, Math.min(9, Math.round(config?.lapsToWin ?? 1))),
        checkpoints_per_lap: Math.max(1, Math.min(16, Math.round(config?.checkpointsPerLap ?? 1))),
        pickups_per_lap: Math.max(0, Math.min(16, Math.round(config?.pickupsPerLap ?? 0))),
        rival_speed_x256_per_second: racingX256(config?.rivalSpeed ?? 3.5, 3.5),
        road_curve: Math.max(0, Math.min(64, Math.round(config?.roadCurve ?? 0))),
        show_minimap: config?.showMinimap === true
      },
      ...(config?.perspectiveCamera ? { perspective_camera: { height:config.perspectiveCamera.height,
        distance:config.perspectiveCamera.distance,focal_length:config.perspectiveCamera.focalLength } } : {}),
      ...(config?.presentation === "pseudo3d" && config.topdownTrack && Array.isArray(room.tilemap) ? {
        floor_tilemap: room.tilemap.slice(0,tileCount).map(value=>racingFloorSourceTileIndex(Number(value)))
      } : {}),
      ...(config?.trackSegments && config.trackSegments.length > 0 ? {
        track_segments: config.trackSegments.map((segment) => ({
          length_pixels: Math.max(1, Math.round(segment.lengthPixels)),
          curve: Math.max(-64, Math.min(64, Math.round(segment.curve))),
          half_width: Math.max(1, Math.min(128, Math.round(segment.halfWidth)))
        }))
      } : {}),
      ...(config?.topdownTrack && config.topdownTrack.checkpoints.length > 0 ? {
        topdown_track: {
          camera_dead_zone: {
            x: Math.max(0, Math.min(120, Math.round(config.topdownTrack.cameraDeadZoneX))),
            y: Math.max(0, Math.min(80, Math.round(config.topdownTrack.cameraDeadZoneY)))
          },
          ...(config.topdownTrack.finishAtZero ? {finish_at_zero:true}:{}),
          start_heading: Math.max(0, Math.min(15, Math.round(config.topdownTrack.startHeading ?? 0))),
          ...(config.topdownTrack.pathPoints && config.topdownTrack.pathPoints.length >= 2 ? {
            path_points: config.topdownTrack.pathPoints.map((point) => ({
              x: Math.max(0, Math.min(width * 8 - 1, Math.round(point.x))),
              y: Math.max(0, Math.min(height * 8 - 1, Math.round(point.y)))
            }))
          } : {}),
          checkpoints: config.topdownTrack.checkpoints.map((checkpoint) => ({
            id: checkpoint.id,
            x: Math.max(0, Math.min(4095, Math.round(checkpoint.x))),
            y: Math.max(0, Math.min(4095, Math.round(checkpoint.y))),
            width: Math.max(1, Math.min(256, Math.round(checkpoint.width))),
            height: Math.max(1, Math.min(256, Math.round(checkpoint.height)))
          }))
        }
      } : {}),
      player_start_pixels: {
        x: gbaTopdownTileToPixels(Math.max(0, Math.min(width - 1, player.x))) + Math.floor(gbaTileSizePx / 2),
        y: gbaTopdownTileToPixels(Math.max(0, Math.min(height - 1, player.y))) + Math.floor(gbaTileSizePx / 2)
      },
      ...(backgroundIndexByRoomName.has(currentRoomName) ? { background: backgroundIndexByRoomName.get(currentRoomName) } : {}),
      ...(pseudo3dVisualIndexByRoomName.has(currentRoomName) ? { pseudo3d_visual: pseudo3dVisualIndexByRoomName.get(currentRoomName) } : {}),
      video: buildRoomVideoComposition(data, room, tilesetPack),
      ...(onEnter && onEnter.length > 0 ? { on_enter: onEnter } : {}),
      ...(onVictory && onVictory.length > 0 ? { on_victory: onVictory } : {}),
      ...(onDefeat && onDefeat.length > 0 ? { on_defeat: onDefeat } : {}),
      ...(triggers.length > 0 ? { triggers } : {}),
      ...(actors.length > 0 ? { actors } : {})
    };
  });
}

function buildRacingPlayer(
  data: GBAProjectData,
  room: Record<string, unknown>,
  roomIndex: number,
  spritePack: AssetcSpritePackGeneration | null
): EngineExportRacingPlayer | undefined {
  const playerActorName = configuredPlayerActorName(data, room);
  const playerActor = projectArray(data, "actors").find((actor) => {
    const actorRoom = entitySceneName(actor, "actor");
    return actorMatchesPlayerName(actor, playerActorName)
      && (!actorRoom || actorRoom === roomName(room, roomIndex));
  });
  const spriteSheet = nullableStringField(playerActor, "spriteSheet");
  const sheetAnimations = projectArray(data, "animations").filter((animation) => nullableStringField(animation, "spriteSheet") === spriteSheet);
  const idleAnimationName = nullableStringField(playerActor, "animationName")
    ?? nullableStringField(sheetAnimations.find((animation) => /idle/i.test(stringField(animation, "name", ""))), "name")
    ?? nullableStringField(sheetAnimations[0], "name");
  const driveAnimationName = nullableStringField(sheetAnimations.find((animation) => /drive|move|walk/i.test(stringField(animation, "name", ""))), "name")
    ?? idleAnimationName;
  const idleSprite = playerActor && idleAnimationName
    ? buildActorEngineSpriteExport(data, { ...playerActor, animationName: idleAnimationName }, spritePack)
    : null;
  const driveSprite = playerActor && driveAnimationName
    ? buildActorEngineSpriteExport(data, { ...playerActor, animationName: driveAnimationName }, spritePack)
    : idleSprite;
  const authoredSprite = playerActor ? buildActorEngineSpriteExport(data, playerActor, spritePack, {preserveAuthoredAnimations:true}) : null;
  const playerAnimations: NonNullable<EngineExportRacingPlayer["animations"]> = {};
  for(const {name,...clip} of authoredSprite?.animations ?? []) {
    const tokens=name.toLowerCase().split(/[^a-z0-9]+/);
    const action = tokens.includes("hurt") ? "hurt" :
      tokens.includes("brake") && tokens.includes("left") ? "brake_left" :
      tokens.includes("brake") && tokens.includes("right") ? "brake_right" : tokens.includes("brake") ? "brake" :
      tokens.includes("steer") && tokens.includes("left") ? "steer_left" :
      tokens.includes("steer") && tokens.includes("right") ? "steer_right" :
      tokens.includes("drive") || tokens.includes("walk") || tokens.includes("move") ? "drive" : tokens.includes("idle") ? "idle" : null;
    if (!action) continue;
    const exportedClip = { ...clip, ...(action === "hurt" ? { loops: false } : {}) };
    if (!playerAnimations[action]) playerAnimations[action] = exportedClip;
    const direction = ["up", "right", "down", "left"].find(value => tokens.includes(value));
    if (direction && (action === "idle" || action === "drive" || action === "hurt")) {
      const directedAction = `${action}_${direction}` as keyof typeof playerAnimations;
      playerAnimations[directedAction] = exportedClip;
    }
  }
  return idleSprite && driveSprite ? {
    idle_metasprite: idleSprite.metasprite,
    drive_metasprite: driveSprite.metasprite,
    animations: playerAnimations
  } : undefined;
}

function buildRacingProject(
  data: GBAProjectData,
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()
): EngineExportRacingProject {
  const rooms = exportRoomsForKind(data, "racing");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const events = projectArray(data, "events");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const spritePack = buildAssetcSpritePackGeneration(data);
  const tilesetPack = buildAssetcTilesetPackGeneration(data);
  const visual = advancedRuntimeBackgrounds(rooms.filter(room=>racingSceneConfigFromRuntime(room.runtime,data.settings)?.presentation!=="pseudo3d" || !racingSceneConfigFromRuntime(room.runtime,data.settings)?.topdownTrack), tilesetPack);
  const pseudo3d = buildRacingPseudo3DVisuals(data, rooms, tilesetPack);
  const initialRoomIndex = startRoomIndex(data, rooms);
  const initialRoom = rooms[initialRoomIndex] ?? rooms[0] ?? {};
  const player = buildRacingPlayer(data, initialRoom, initialRoomIndex, spritePack);
  const racingRooms = buildRacingRooms(data, spritePack, tilesetPack, visual.indexByRoomName, pseudo3d.indexByRoomName, pluginRegistry)
    .map((room, index) => {
      const roomPlayer = buildRacingPlayer(data, rooms[index], index, spritePack);
      return { ...room, ...(roomPlayer ? { player: roomPlayer } : {}) };
    });
  const racingSpriteAssets = Array.from(new Set([
    ...racingRooms.flatMap((room) => room.actors?.map((actor) => actor.metasprite.asset) ?? []),
    ...racingRooms.flatMap(room => room.player ? [
      room.player.idle_metasprite.asset,
      room.player.drive_metasprite.asset,
      ...Object.values(room.player.animations ?? {}).map(clip => clip.asset)
    ] : [])
  ]));
  const assetSection = advancedRuntimeAssetSection(
    [
      ...visual.backgrounds.map((background) => background.tilemap),
      ...pseudo3d.visuals.flatMap((entry) => [entry.panorama, entry.minimap].filter((name): name is string=>Boolean(name)))
    ],
    racingSpriteAssets,
    audioPack,
    pseudo3d.visuals.map((entry) => entry.floor)
  );
  return {
    initial_room: initialRoomIndex,
    ...((tilesetPack || spritePack) ? { resource_banks: "asset_pack" as const } : {}),
    save: buildProjectSaveConfig(data),
    rooms: racingRooms,
    dialogue_lines: buildDialogueLines(data, dialogues, audioItems, audioPack),
    dialogue_ui: buildEngineDialogueUiConfigForExport(data),
    scripts: buildTopdownScripts(data, events, rooms, dialogues, audioItems, audioPack, pluginRegistry),
    ...(assetSection ? { assets: assetSection } : {}),
    ...(visual.backgrounds.length > 0 ? { backgrounds: visual.backgrounds } : {}),
    ...(pseudo3d.visuals.length > 0 ? { pseudo3d_visuals: pseudo3d.visuals } : {}),
    ...(player ? { player } : {})
  };
}

function buildBattleRpgProject(
  data: GBAProjectData,
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()
): EngineExportBattleRpgProject {
  const rooms = exportRoomsForKind(data, "battle_rpg");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const spritePack = buildAssetcSpritePackGeneration(data);
  const tilesetPack = buildAssetcTilesetPackGeneration(data);
  const visual = advancedRuntimeBackgrounds(rooms, tilesetPack);
  const events = projectArray(data, "events");
  const participantSpriteAssets = new Set<string>();
  const assetSection = advancedRuntimeAssetSection(
    visual.backgrounds.map((background) => background.tilemap),
    spritePack?.assetNames ?? [],
    audioPack
  );
  return {
    initial_encounter: startRoomIndex(data, rooms),
    save: buildProjectSaveConfig(data),
    dialogue_lines: buildDialogueLines(data, dialogues, audioItems, audioPack),
    dialogue_ui: buildEngineDialogueUiConfigForExport(data),
    scripts: buildTopdownScripts(data, events, rooms, dialogues, audioItems, audioPack, pluginRegistry),
    encounters: rooms.map((room, index) => {
      const config = battleRpgSceneConfigFromRuntime(room.runtime, data.settings);
      const hudBinding = resolveHudPresetBinding(data, { roomPresetId: room.hudPresetId });
      const maxPartySize = config?.maxPartySize ?? 4;
      const maxEnemies = config?.maxEnemies ?? 4;
      const encounterName = roomName(room, index);
      const participants = projectArray(data, "actors").flatMap((actor): Array<{ side: "party" | "enemy"; participant: EngineExportBattleRpgParticipant }> => {
        if (entitySceneName(actor, "actor") !== encounterName) return [];
        const battle = child(actor, "battle");
        if (!battle) return [];
        const side = battle.side === "party" || battle.side === "enemy" ? battle.side : null;
        if (!side) return [];
        const maxHp = Math.max(1, Math.min(999, integerField(battle, "maxHp", side === "party" ? 24 : 12)));
        const attack = Math.max(1, Math.min(255, integerField(battle, "attack", side === "party" ? 7 : 4)));
        const defense = Math.max(0, Math.min(255, integerField(battle, "defense", side === "party" ? 2 : 1)));
        const speed = Math.max(1, Math.min(255, integerField(battle, "speed", side === "party" ? 5 : 3)));
        const spriteScale = Math.max(1, Math.min(2, integerField(battle, "spriteScale", 1)));
        const abilityKinds = Array.isArray(battle.abilities)
          ? battle.abilities.filter((ability): ability is "attack" | "magic" | "heal" | "defend" => ability === "attack" || ability === "magic" || ability === "heal" || ability === "defend")
          : [];
        const uniqueKinds = Array.from(new Set(abilityKinds.length > 0 ? abilityKinds : ["attack" as const])).slice(0, 4);
        const sprite = buildActorEngineSpriteExport(data, actor, spritePack);
        if (sprite) participantSpriteAssets.add(sprite.metasprite.asset);
        return [{
          side,
          participant: {
            name: stringField(actor, "name", side === "party" ? "Hero" : "Enemy"),
            unit: { max_hp: maxHp, attack, defense, speed },
            abilities: uniqueKinds.map((kind) => ({
              kind,
              power: kind === "magic" ? attack : kind === "heal" ? Math.max(1, Math.floor(maxHp / 4)) : 0
            })),
            ...(spriteScale > 1 ? { sprite_scale: spriteScale } : {}),
            ...(sprite ? { metasprite: sprite.metasprite } : {})
          }
        }];
      });
      const authoredParty = participants.filter((entry) => entry.side === "party").slice(0, maxPartySize).map((entry) => entry.participant);
      const authoredEnemies = participants.filter((entry) => entry.side === "enemy").slice(0, maxEnemies).map((entry) => entry.participant);
      const eventBindings = child(room, "eventBindings");
      const hook = (binding: string): EngineExportProjectEventCommand[] | undefined => scriptForEventName(
        data,
        nullableStringField(eventBindings, binding),
        events,
        rooms,
        dialogues,
        audioItems,
        audioPack,
        pluginRegistry
      );
      const onEnter = hook("onInit");
      const onVictory = hook("onVictory");
      const onDefeat = hook("onDefeat");
      const onEscape = hook("onEscape");
      const party = authoredParty.length > 0 ? authoredParty : Array.from({ length: maxPartySize }, (_item, participantIndex) => ({
        name: `Party ${participantIndex + 1}`,
        unit: { max_hp: 24, attack: 7, defense: 2, speed: 5 },
        abilities: [{ kind: "attack" as const, power: 0 }]
      }));
      const enemies = authoredEnemies.length > 0 ? authoredEnemies : Array.from({ length: maxEnemies }, (_item, participantIndex) => ({
        name: `Enemy ${participantIndex + 1}`,
        unit: { max_hp: 12, attack: 4, defense: 1, speed: 3 },
        abilities: [{ kind: "attack" as const, power: 0 }]
      }));
      return {
        name: encounterName,
        ...(visual.indexByRoomName.has(encounterName) ? { background: visual.indexByRoomName.get(encounterName) } : {}),
        resource_bank_group: engineSceneResourceBankGroupName(room, index),
        config: {
          max_party_size: maxPartySize,
          max_enemies: maxEnemies,
          turn_delay_frames: config?.turnDelayFrames ?? 20,
          escape_enabled: config?.escapeEnabled ?? true,
          experience_multiplier: config?.experienceMultiplier ?? 1,
          type_effectiveness_enabled: config?.typeEffectivenessEnabled ?? true,
          critical_hit_enabled: config?.criticalHitEnabled ?? true,
          status_conditions_enabled: config?.statusConditionsEnabled ?? true,
          abilities_enabled: config?.abilitiesEnabled ?? true,
          show_experience_bar: hudBinding.preset.showExperienceBar ?? config?.showExperienceBar ?? true,
          show_health_bars: hudBinding.preset.showHealthBars ?? config?.showHealthBars ?? true,
          battle_style: config?.battleStyle ?? "single",
          weather_effect: config?.weatherEffect ?? "none"
        },
        party_count: party.length,
        enemy_count: enemies.length,
        party,
        enemies,
        rewards: { gold: config?.rewardGold ?? 25, experience: config?.rewardExperience ?? 10 },
        ...(onEnter && onEnter.length > 0 ? { on_enter: onEnter } : {}),
        ...(onVictory && onVictory.length > 0 ? { on_victory: onVictory } : {}),
        ...(onDefeat && onDefeat.length > 0 ? { on_defeat: onDefeat } : {}),
        ...(onEscape && onEscape.length > 0 ? { on_escape: onEscape } : {})
      };
    }),
    ...((tilesetPack || spritePack) ? { resource_banks: "asset_pack" as const } : {}),
    ...(assetSection ? {
      assets: {
        ...assetSection,
        ...(participantSpriteAssets.size > 0 ? { sprite_assets: Array.from(participantSpriteAssets) } : {})
      }
    } : {}),
    ...(visual.backgrounds.length > 0 ? { backgrounds: visual.backgrounds } : {})
  };
}

function buildLutaProject(
  data: GBAProjectData,
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()
): EngineExportLutaProject {
  const rooms = exportRoomsForKind(data, "luta");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const spritePack = buildAssetcSpritePackGeneration(data);
  const tilesetPack = buildAssetcTilesetPackGeneration(data);
  const visual = advancedRuntimeBackgrounds(rooms, tilesetPack);
  const hudAssetNames = Array.from(new Set(rooms.flatMap((room) => {
    const runtime = child(room, "runtime");
    const runtimeConfig = child(runtime, "config");
    const hudAssetName = nullableStringField(runtimeConfig, "hudAssetName");
    return hudAssetName ? [hudAssetName] : [];
  })));
  const hudAsset = hudAssetNames[0] && tilesetPack
    ? tilesetPack.assetsBySheet[hudAssetNames[0]]
    : undefined;
  const events = projectArray(data, "events");
  const participantSpriteAssets = new Set<string>();
  const assetSection = advancedRuntimeAssetSection(
    [...visual.backgrounds.map((background) => background.tilemap), ...(hudAsset ? [hudAsset.name] : [])],
    spritePack?.assetNames ?? [],
    audioPack
  );
  return {
    initial_stage: startRoomIndex(data, rooms),
    save: buildProjectSaveConfig(data),
    dialogue_lines: buildDialogueLines(data, dialogues, audioItems, audioPack),
    dialogue_ui: buildEngineDialogueUiConfigForExport(data),
    scripts: buildTopdownScripts(data, events, rooms, dialogues, audioItems, audioPack, pluginRegistry),
    stages: rooms.map((room, index) => {
      const config = lutaSceneConfigFromRuntime(room.runtime, data.settings);
      const stageName = roomName(room, index);
      const eventBindings = child(room, "eventBindings");
      const hook = (binding: string): EngineExportProjectEventCommand[] | undefined => scriptForEventName(
        data,
        nullableStringField(eventBindings, binding),
        events,
        rooms,
        dialogues,
        audioItems,
        audioPack,
        pluginRegistry
      );
      const onEnter = hook("onInit");
      const onVictory = hook("onVictory");
      const onDefeat = hook("onDefeat");
      const participants = projectArray(data, "actors").flatMap((actor): Array<{ side: "player1" | "player2"; fighter: EngineExportLutaFighter }> => {
        if (entitySceneName(actor, "actor") !== stageName) return [];
        const battle = child(actor, "battle");
        if (!battle) return [];
        const side = battle.side === "player1" || battle.side === "player2" ? battle.side : null;
        if (!side) return [];
        const maxHp = Math.max(1, Math.min(9999, integerField(battle, "maxHp", 100)));
        const attack = Math.max(1, Math.min(255, integerField(battle, "attack", 12)));
        const defense = Math.max(0, Math.min(255, integerField(battle, "defense", 8)));
        const speed = Math.max(1, Math.min(255, integerField(battle, "speed", 10)));
        const weight = Math.max(1, Math.min(255, integerField(battle, "weight", 70)));
        const superLevel = Math.max(0, Math.min(3, integerField(battle, "superLevel", 1)));
        const throwRange = Math.max(0, Math.min(64, integerField(battle, "throwRange", 16)));
        const guardPower = Math.max(0, Math.min(255, integerField(battle, "guardPower", 48)));
        const sprite = buildLutaActorEngineSpriteExport(data, actor, spritePack);
        if (sprite) participantSpriteAssets.add(sprite.metasprite.asset);
        return [{
          side,
          fighter: {
            name: stringField(actor, "name", side === "player1" ? "Fighter 1" : "Fighter 2"),
            unit: { max_hp: maxHp, attack, defense, speed, weight },
            combo_stats: { super_level: superLevel, throw_range: throwRange, guard_power: guardPower },
            ...(sprite ? { metasprite: sprite.metasprite } : {}),
            ...(sprite?.luta_animation_set ? { animation_set: sprite.luta_animation_set } : {})
          }
        }];
      });
      const player1Authored = participants.filter((entry) => entry.side === "player1").map((entry) => entry.fighter);
      const player2Authored = participants.filter((entry) => entry.side === "player2").map((entry) => entry.fighter);
      const player1 = player1Authored.length > 0 ? player1Authored : [{
        name: "Fighter 1",
        unit: { max_hp: 100, attack: 12, defense: 8, speed: 10, weight: 70 },
        combo_stats: { super_level: 1, throw_range: 16, guard_power: 48 }
      }];
      const player2 = player2Authored.length > 0 ? player2Authored : [{
        name: "Fighter 2",
        unit: { max_hp: 100, attack: 12, defense: 8, speed: 10, weight: 70 },
        combo_stats: { super_level: 1, throw_range: 16, guard_power: 48 }
      }];
      return {
        name: stageName,
        ...(visual.indexByRoomName.has(stageName) ? { background: visual.indexByRoomName.get(stageName) } : {}),
        resource_bank_group: engineSceneResourceBankGroupName(room, index),
        ...(onEnter && onEnter.length > 0 ? { on_enter: onEnter } : {}),
        ...(onVictory && onVictory.length > 0 ? { on_victory: onVictory } : {}),
        ...(onDefeat && onDefeat.length > 0 ? { on_defeat: onDefeat } : {}),
        config: {
          round_time: config?.roundTime ?? 99,
          rounds_to_win: config?.roundsToWin ?? 2,
          max_super_gauge: config?.maxSuperGauge ?? 100,
          super_gauge_gain_on_hit: config?.superGaugeGainOnHit ?? 8,
          super_gauge_gain_on_receive: config?.superGaugeGainOnReceive ?? 4,
          guard_power_recovery: config?.guardPowerRecovery ?? 2,
          chip_damage_enabled: config?.chipDamageEnabled ?? true,
          air_blocking_enabled: config?.airBlockingEnabled ?? true,
          alpha_counter_enabled: config?.alphaCounterEnabled ?? true,
          throw_escape_window: config?.throwEscapeWindow ?? 8,
          parry_window: config?.parryWindow ?? 4,
          hitstun_decay: config?.hitstunDecay ?? 0.85,
          combo_limit: config?.comboLimit ?? 60,
          vism_custom_combo_gauge: config?.vismCustomComboGauge ?? 100,
          default_style: config?.defaultStyle ?? "a-ism",
          stage_id: config?.stageId ?? "stage_default",
          player1_start_x: config?.player1StartX ?? 80,
          player2_start_x: config?.player2StartX ?? 200
        },
        player1,
        player2
      };
    }),
    ...((tilesetPack || spritePack) ? { resource_banks: "asset_pack" as const } : {}),
    ...(assetSection ? {
      assets: {
        ...assetSection,
        ...(participantSpriteAssets.size > 0 ? { sprite_assets: Array.from(participantSpriteAssets) } : {})
      }
    } : {}),
    ...(visual.backgrounds.length > 0 ? { backgrounds: visual.backgrounds } : {}),
    ...(hudAsset ? {
      hud: {
        layer: "bg0" as const,
        tilemap: hudAsset.name,
        backdrop_from_tilemap_palette: true
      }
    } : {})
  };
}

interface PointClickSceneVisualExport {
  background?: number;
  backgrounds?: number[];
  props?: EngineExportPointClickProp[];
  spriteAssetNames: string[];
}

interface PointClickVisualExport {
  backgrounds: NonNullable<EngineExportPointClickProject["backgrounds"]>;
  sceneVisualsByRoomName: Map<string, PointClickSceneVisualExport>;
}

function buildPointClickVisualExport(
  data: GBAProjectData,
  rooms: Record<string, unknown>[],
  spritePack: AssetcSpritePackGeneration | null,
  tilesetPack: AssetcTilesetPackGeneration | null,
  eventValueRegistries: EngineExportEventValueRegistries
): PointClickVisualExport {
  const backgrounds: NonNullable<EngineExportPointClickProject["backgrounds"]> = [];
  const sceneVisualsByRoomName = new Map<string, PointClickSceneVisualExport>();

  rooms.forEach((room, roomIndex) => {
    const sceneName = roomName(room, roomIndex);
    const tileLayers = projectArray(room, "tileLayers");
    const layerForMapping = (mapping: string): Record<string, unknown> | undefined => (
      tileLayers.find((layer) => nullableStringField(layer, "mapping").toUpperCase() === mapping)
    );
    const layerBackgrounds = (tileLayers.length > 0 ? ["BG3", "BG2", "BG1"] : []).flatMap((mapping) => {
      const layer = layerForMapping(mapping);
      if (!layer) return [];
      const sourceNames = Array.isArray(layer.tileSourceAssetNames)
        ? layer.tileSourceAssetNames.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];
      const sourceName = sourceNames[0] ?? (mapping === "BG2" ? roomBackgroundAssetName(room) : "");
      const tilesetAsset = sourceName && tilesetPack ? tilesetPack.assetsBySheet[sourceName] : null;
      if (!tilesetAsset) return [];
      return [{
        name: `${sceneName}_${mapping.toLowerCase()}`,
        layer: mapping.toLowerCase(),
        tilemap: tilesetAsset.name,
        backdrop_color: 0
      }];
    });
    const backgroundStartIndex = backgrounds.length;
    backgrounds.push(...layerBackgrounds);

    const visual: PointClickSceneVisualExport = {
      ...(layerBackgrounds.length > 0
        ? { backgrounds: layerBackgrounds.map((_, index) => backgroundStartIndex + index) }
        : (() => {
          const backgroundAssetName = roomBackgroundAssetName(room);
          const tilesetAsset = backgroundAssetName && tilesetPack
            ? tilesetPack.assetsBySheet[backgroundAssetName]
            : null;
          if (!tilesetAsset) return { background: -1 };
          const backgroundIndex = backgrounds.length;
          backgrounds.push({
            name: tilesetAsset.name,
            layer: "bg1",
            tilemap: tilesetAsset.name,
            backdrop_color: 0
          });
          return { background: backgroundIndex };
        })()),
      spriteAssetNames: []
    };
    const props = npcActorsForRoom(data, room, roomIndex).flatMap((actor) => {
      const sprite = buildActorEngineSpriteExport(data, actor, spritePack);
      if (!sprite) return [];
      visual.spriteAssetNames.push(sprite.metasprite.asset);
      const position = entityPosition(actor, "actor");
      const visibleVariableKey = nullableStringField(actor, "visibleVariable") || nullableStringField(actor, "visible_variable");
      const explicitVisibleVariableIndex = numberOrNullLocal(actor.visibleVariableIndex ?? actor.visible_variable_index);
      const visibleVariable = visibleVariableKey
        ? eventValueRegistries.variableIndex(visibleVariableKey)
        : explicitVisibleVariableIndex === null ? null : Math.floor(explicitVisibleVariableIndex);
      const visibleValue = integerField(actor, "visibleValue", integerField(actor, "visible_value", 1));
      return [{
        name: stringField(actor, "name", "Prop"),
        metasprite: sprite.metasprite,
        position: gbaTopdownTilePointToPixels({
          x: position.x,
          y: position.y
        }),
        animation: sprite.animation,
        ...(sprite.animations ? { animations: sprite.animations } : {}),
        ...(visibleVariable === null ? {} : { visible_variable: visibleVariable, visible_value: visibleValue })
      }];
    });
    if (props.length > 0) visual.props = props.slice(0, 6);
    visual.spriteAssetNames = Array.from(new Set(visual.spriteAssetNames));
    sceneVisualsByRoomName.set(sceneName, visual);
  });

  return { backgrounds, sceneVisualsByRoomName };
}

function buildPointClickScenes(
  data: GBAProjectData,
  sceneVisualsByRoomName: ReadonlyMap<string, PointClickSceneVisualExport> = new Map()
): EngineExportPointClickScene[] {
  const rooms = exportRoomsForKind(data, "point_click");
  const events = projectArray(data, "events");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const startIndex = startRoomIndex(data, rooms);
  const dialogueBoot = dialogueUiBootCommands(data, audioItems, audioPack);

  return rooms.map((room, index) => {
    const width = integerField(room, "width", 20);
    const height = integerField(room, "height", 16);
    const eventBindings = child(room, "eventBindings");
    const onEnter = scriptForEventName(data, nullableStringField(eventBindings, "onInit"), events, rooms, dialogues, audioItems, audioPack);
    const roomDialogueBoot = index === startIndex ? dialogueBoot : [];
    const pointClickConfig = pointClickSceneConfigFromRuntime(room.runtime, data.settings);
    const sceneName = roomName(room, index);
    const visual = sceneVisualsByRoomName.get(sceneName);
    const scene: EngineExportPointClickScene = {
      name: sceneName,
      ...(visual?.backgrounds ? { backgrounds: visual.backgrounds } : { background: visual?.background ?? -1 }),
      resource_bank_group: engineSceneResourceBankGroupName(room, index),
      ...(pointClickConfig ? { cursor_speed: Math.max(1, Math.round(pointClickConfig.cursorSpeed)) } : {}),
      ...(visual?.props && visual.props.length > 0 ? { props: visual.props } : {})
    };
    const onEnterScript = mergeRoomOnEnterScript(roomDialogueBoot, onEnter);
    if (onEnterScript) {
      scene.on_enter = onEnterScript;
    }

    const triggers = projectArray(data, "triggers").filter((trigger) => {
      const roomNameValue = entitySceneName(trigger, "trigger");
      return !roomNameValue || roomNameValue === scene.name;
    });
    if (triggers.length > 0) {
      scene.hotspots = triggers.flatMap((trigger) => {
        const onInteractHotspot = scriptForEventName(
          data,
          resolveTriggerInteractEventName(trigger),
          events,
          rooms,
          dialogues,
          audioItems,
          audioPack
        );
        const baseArea = gbaTopdownAreaToPixels(entityBounds(trigger, "trigger", {
          x: Math.max(0, width - 2),
          y: Math.floor(height / 2),
          width: 2,
          height: 2
        }));
        const padding = pointClickConfig?.hotspotPadding ?? 0;
        const roomWidthPixels = width * gbaTileSizePx;
        const roomHeightPixels = height * gbaTileSizePx;
        const x = Math.max(0, baseArea.x - padding);
        const y = Math.max(0, baseArea.y - padding);
        const right = Math.min(roomWidthPixels, baseArea.x + baseArea.width + padding);
        const bottom = Math.min(roomHeightPixels, baseArea.y + baseArea.height + padding);
        const area = { x, y, width: right - x, height: bottom - y };
        return [{
          name: stringField(trigger, "name", "Hotspot"),
          area,
          ...(onInteractHotspot && onInteractHotspot.length > 0 ? { on_click: onInteractHotspot } : {})
        }];
      });
    }

    return scene;
  });
}

function buildPointClickProject(
  data: GBAProjectData,
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()
): EngineExportPointClickProject {
  const rooms = exportRoomsForKind(data, "point_click");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const events = projectArray(data, "events");
  const pointClickSettings = child(settings(data), "pointAndClick") ?? {};
  const spritePack = buildAssetcSpritePackGeneration(data);
  const tilesetPack = buildAssetcTilesetPackGeneration(data);
  const portraitPack = buildAssetcPortraitPackGeneration(data, spritePack);
  const emotePack = buildAssetcEmotePackGeneration(data, spritePack, portraitPack);
  const portraitAssets = buildDialoguePortraitAssetsExport(data, portraitPack, spritePack);
  const emoteAssets = buildDialogueEmoteAssetsExport(data, emotePack, portraitPack, spritePack);
  const player = firstPlayerPosition(data, rooms);
  const cursorActor = firstPlayerActor(data, rooms);
  const cursorSpriteExport = cursorActor
    ? buildActorEngineSpriteExport(data, cursorActor, spritePack, { directionAdapter: "cursor" })
    : null;
  const eventValueRegistries = buildEventValueRegistries(
    events,
    pluginRegistry,
    projectArray(data, "actors"),
    [],
    sceneRouteVariableKeys(data),
    projectVariableKeys(data)
  );
  const visual = buildPointClickVisualExport(data, rooms, spritePack, tilesetPack, eventValueRegistries);
  const pointClickSpriteAssetNames = Array.from(new Set([
    ...(cursorSpriteExport ? [cursorSpriteExport.metasprite.asset] : []),
    ...Array.from(visual.sceneVisualsByRoomName.values()).flatMap((entry) => entry.spriteAssetNames)
  ]));
  const pointClickSpritePack = spritePack && pointClickSpriteAssetNames.length > 0
    ? { ...spritePack, assetNames: pointClickSpriteAssetNames }
    : null;
  const cursorPixels = gbaTopdownTilePointToPixels(player);
  const cursorSpeedRaw = numberOrNullLocal(pointClickSettings.cursorSpeed);
  const assetSection = buildTopdownProjectAssetSection(
    pointClickSpritePack,
    tilesetPack,
    portraitPack,
    emotePack,
    rooms[0] ?? {},
    audioPack
  );
  return {
    initial_scene: startRoomIndex(data, rooms),
    cursor_start: { x: cursorPixels.x, y: cursorPixels.y },
    cursor_speed: cursorSpeedRaw === null ? 2 : Math.max(1, Math.round(cursorSpeedRaw)),
    ...(cursorSpriteExport ? {
      cursor: {
        metasprite: cursorSpriteExport.metasprite,
        ...(cursorSpriteExport.animations ? { animations: cursorSpriteExport.animations } : {})
      }
    } : {}),
    save: buildProjectSaveConfig(data),
    ...(visual.backgrounds.length > 0 ? { backgrounds: visual.backgrounds } : {}),
    scenes: buildPointClickScenes(data, visual.sceneVisualsByRoomName),
    dialogue_lines: buildDialogueLines(data, dialogues, audioItems, audioPack),
    dialogue_ui: buildEngineDialogueUiConfigForExport(data),
    ...(portraitAssets.length > 0 ? { portrait_assets: portraitAssets } : {}),
    ...(emoteAssets.length > 0 ? { emote_assets: emoteAssets } : {}),
    scripts: buildTopdownScripts(data, events, rooms, dialogues, audioItems, audioPack, pluginRegistry),
    ...(assetSection.assets ? { assets: assetSection.assets } : {}),
    ...(assetSection.resource_banks ? { resource_banks: assetSection.resource_banks } : {})
  };
}

interface ShmupProjectileLaunch {
  actor: string;
  direction: string;
  speed: number;
  spriteSheet?: string;
}

function shmupProjectileLaunches(
  events: Record<string, unknown>[],
  runtimeRoomNames: Set<string>
): ShmupProjectileLaunch[] {
  return events.flatMap((event, eventIndex) => {
    const eventRoomName = normalizeGBAEventDocument(event, eventIndex).sceneName ?? "";
    if (eventRoomName && !runtimeRoomNames.has(eventRoomName)) return [];
    return eventSteps(event).flatMap((step) => {
      const parts = commandParts(stringField(step, "command", "noop"));
      if ((parts[0] ?? "") !== "launch_projectile" || !parts[1]) return [];
      return [{
        actor: parts[1],
        direction: parts[2] || "right",
        speed: Math.max(1, Math.round(numberOrNullLocal(parts[3]) ?? 2)),
        ...(parts[4] ? { spriteSheet: parts[4] } : {})
      }];
    });
  });
}

function shmupProjectileVelocity(launch: ShmupProjectileLaunch): { x: number; y: number } {
  const speed = Math.max(1, launch.speed);
  switch (launch.direction.trim().toLowerCase().replaceAll("-", "_")) {
    case "left": return { x: -speed, y: 0 };
    case "up": return { x: 0, y: -speed };
    case "down": return { x: 0, y: speed };
    case "up_left": return { x: -speed, y: -speed };
    case "up_right": return { x: speed, y: -speed };
    case "down_left": return { x: -speed, y: speed };
    case "down_right": return { x: speed, y: speed };
    default: return { x: speed, y: 0 };
  }
}

function shmupSceneCompositionForExport(room: Record<string, unknown>): ShmupSceneCompositionResolution {
  const runtimeConfig = child(child(room, "runtime"), "config");
  const resolution = resolveShmupSceneComposition(runtimeConfig ?? {}, {
    widthTiles: integerField(room, "width", 30),
    heightTiles: integerField(room, "height", 20)
  });
  if (resolution.issues.length > 0) {
    throw new Error(`Contrato de composição SHMUP inválido na cena ${roomName(room, 0)}: ${resolution.issues.map((issue) => issue.message).join(" ")}`);
  }
  return resolution;
}

function buildShmupProject(
  data: GBAProjectData,
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()
): EngineExportShmupProject {
  const rooms = exportRoomsForKind(data, "shmup");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const events = projectArray(data, "events");
  const shmupSettings = child(settings(data), "shmup") ?? {};
  const spritePack = buildAssetcSpritePackGeneration(data);
  const tilesetPack = buildAssetcTilesetPackGeneration(data);
  const portraitPack = buildAssetcPortraitPackGeneration(data, spritePack);
  const emotePack = buildAssetcEmotePackGeneration(data, spritePack, portraitPack);
  const emoteAssets = buildDialogueEmoteAssetsExport(data, emotePack, portraitPack, spritePack);
  const spriteExportForSheet = (spriteSheet: string | null, animationName: string): ReturnType<typeof buildActorEngineSpriteExport> => (
    spriteSheet
      ? buildActorEngineSpriteExport(data, { spriteSheet, animationName }, spritePack, { preserveAuthoredAnimations: true })
      : null
  );
  const playerActor = firstPlayerActor(data, rooms);
  const playerSprite = playerActor && nullableStringField(playerActor, "spriteSheet")
    ? buildActorEngineSpriteExport(data, playerActor, spritePack, { preserveAuthoredAnimations: true })
    : spriteExportForSheet(nullableStringField(shmupSettings, "playerSprite"), "idle");
  const playerAnimations: NonNullable<EngineExportShmupProject["player"]["animations"]> = {};
  const animationKeys: Record<string, keyof typeof playerAnimations> = { idle: "idle", idle_right: "idle", fly_right: "fly", walk_right: "fly", walk: "fly",
      bank_up: "bank_up", walk_up: "bank_up", bank_down: "bank_down", walk_down: "bank_down",
      shoot_right: "shoot", attack_right: "shoot", attack: "shoot", hurt_right: "hurt", hurt: "hurt"
  };
  for (const { name, ...entry } of playerSprite?.animations ?? []) {
    const key = animationKeys[name];
    if (key && playerAnimations[key] === undefined) {
      playerAnimations[key] = { ...entry, ...(["shoot", "hurt"].includes(key) ? { loops: false } : {}) };
    }
  }
  const explosionSprite = spriteExportForSheet(nullableStringField(shmupSettings, "playerExplosionSprite"), "explosion");
  const explosionClip = explosionSprite?.animations?.find(entry => entry.name === "explosion") ?? explosionSprite?.animations?.[0];
  if (explosionClip) {
    const { name: _name, ...entry } = explosionClip;
    // Effects use the Animator's foot anchor. Center them on the ship canvas.
    playerAnimations.explosion = { ...entry, loops: false,
      ...(entry.frame_metasprites ? { frame_metasprites: entry.frame_metasprites.map(frame => ({
        parts: frame.parts.map(part => ({ ...part, x: part.x + 8, y: part.y + 24 }))
      })) } : {})
    };
  }
  const enemySprite = spriteExportForSheet(nullableStringField(shmupSettings, "enemySprite"), "idle");
  const actorSprites = dynamicActorSpriteSheetNames(data).flatMap((spriteSheet) => {
    const animation = projectArray(data, "animations").find((candidate) => nullableStringField(candidate, "spriteSheet") === spriteSheet);
    const spriteExport = spriteExportForSheet(spriteSheet, nullableStringField(animation, "name") ?? "idle");
    return spriteExport ? [{ name: spriteSheet, metasprite: spriteExport.metasprite }] : [];
  });
  const playerTile = firstPlayerPosition(data, rooms);
  const playerPixels = gbaTopdownTilePointToPixels(playerTile);
  const playerSpeed = numberOrNullLocal(shmupSettings.playerSpeed) ?? 2;
  const fireRate = numberOrNullLocal(shmupSettings.fireRate) ?? 8;
  const startIndex = startRoomIndex(data, rooms);
  const wavePlansByRoom = rooms.map((room, index) => {
    const config = shmupSceneConfigFromRuntime(room.runtime, data.settings);
    return config?.wavePlan && config.wavePlan.length > 0
      ? config.wavePlan
      : [{ name: roomName(room, index), startFrame: 0 }];
  });
  const waveOffsets: number[] = [];
  let exportedWaveCount = 0;
  for (const wavePlans of wavePlansByRoom) {
    waveOffsets.push(exportedWaveCount);
    exportedWaveCount += wavePlans.length;
  }
  const initialWaveIndex = waveOffsets[startIndex] ?? 0;
  const initialRoom = rooms[startIndex] ?? rooms[0] ?? {};
  const initialRuntimeConfig = child(child(initialRoom, "runtime"), "config");
  const initialComposition = roomSceneComposition(initialRoom);
  const featureRuntime = resolveShmupFeatureRuntime(initialRuntimeConfig?.modules);
  const dialogueBoot = dialogueUiBootCommands(data, audioItems, audioPack);
  const projectileLaunches = shmupProjectileLaunches(
    events,
    new Set(rooms.map((room, index) => roomName(room, index)))
  );
  const playerProjectileLaunch = projectileLaunches.find((launch) => (
    launch.actor.trim().toLowerCase() === "player" || isConfiguredPlayerActor(data, launch.actor)
  ));
  const projectileSprite = spriteExportForSheet(
    playerProjectileLaunch?.spriteSheet ?? nullableStringField(shmupSettings, "projectileSprite"),
    "attack"
  );
  const enemyProjectileLaunchByActor = new Map(projectileLaunches
    .filter((launch) => launch !== playerProjectileLaunch)
    .map((launch) => [launch.actor, launch]));
  const firstEnemyProjectileLaunch = enemyProjectileLaunchByActor.values().next().value as ShmupProjectileLaunch | undefined;
  const enemyProjectileSprite = spriteExportForSheet(
    firstEnemyProjectileLaunch?.spriteSheet ?? nullableStringField(shmupSettings, "enemyProjectileSprite"),
    "attack"
  );
  const backgrounds = rooms.flatMap((room, index) => {
    const backgroundAssetName = roomBackgroundAssetName(room);
    const shmupConfig = shmupSceneConfigFromRuntime(room.runtime, data.settings);
    const shmupComposition = shmupSceneCompositionForExport(room);
    const sceneComposition = shmupComposition.composition;
    const affineEnabled = shmupComposition.config.video.affine !== null;
    const roomWidthTiles = shmupComposition.config.world.widthTiles;
    const roomHeightTiles = shmupComposition.config.world.heightTiles;
    const backgroundVideo = affineEnabled
      ? buildRoomVideoComposition(data, room, tilesetPack)
      : undefined;
    const collisionTypes = paddedCollisionTypes(room.collisionTypes, roomWidthTiles * roomHeightTiles);
    const tileLayers = projectArray(room, "tileLayers");
    const tileLayer = (mapping: string): Record<string, unknown> | undefined => (
      tileLayers.find((layer) => nullableStringField(layer, "mapping").toUpperCase() === mapping)
    );
    const layers = (tileLayers.length > 0 ? ["BG3", "BG2", "BG1"] as const : ["BG2"] as const).flatMap((mapping) => {
      if (affineEnabled && mapping === "BG2") return [];
      const layer = tileLayer(mapping);
      const sourceNames = Array.isArray(layer?.tileSourceAssetNames)
        ? layer.tileSourceAssetNames.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];
      const composedLayer = sceneComposition.enabled
        ? sceneComposition.layers.find((candidate) => (
          candidate.enabled &&
          candidate.kind === "regular_bg" &&
          candidate.layer === mapping
        ))
        : undefined;
      const sourceName = composedLayer?.assetId || sourceNames[0] || (mapping === "BG2" ? backgroundAssetName : "");
      const tilesetAsset = sourceName && tilesetPack
        ? tilesetPack.assetsBySheet[sourceName]
        : null;
      return tilesetAsset ? [{
        layer: mapping.toLowerCase() as "bg3" | "bg2" | "bg1",
        tilemap: tilesetAsset.name,
        scroll: { x: 0, y: 0 },
      }] : [];
    });
    if (layers.length === 0 && !affineEnabled) return [];
    return wavePlansByRoom[index].map((wavePlan) => {
      const scrollSpeed = Math.max(
        0,
        Math.round(wavePlan.scrollSpeed ?? shmupConfig?.scrollSpeed ?? numberOrNullLocal(shmupSettings.scrollSpeed) ?? 1)
      );
      const waveLayers = layers.map((layer) => ({
        ...layer,
        scroll: {
          x: layer.layer === "bg3"
            ? scrollSpeed === 0 ? 0 : Math.max(1, Math.floor(scrollSpeed / 2))
            : layer.layer === "bg1"
              ? scrollSpeed === 0 ? 0 : scrollSpeed + Math.max(1, Math.ceil(scrollSpeed / 2))
              : scrollSpeed,
          y: 0
        }
      }));
      return {
        name: wavePlan.name,
        backdrop_color: 0,
        width_tiles: roomWidthTiles,
        height_tiles: roomHeightTiles,
        layers: waveLayers,
        ...(backgroundVideo ? { video: backgroundVideo } : {}),
        collision_flags: paddedCollisionFlagsFromTypes(collisionTypes, roomWidthTiles * roomHeightTiles),
        collision_width_tiles: roomWidthTiles,
        collision_height_tiles: roomHeightTiles,
        world_width_pixels: shmupComposition.config.world.widthPixels,
        world_height_pixels: shmupComposition.config.world.heightPixels,
        ...(affineEnabled ? { affine_scroll_pixels_per_frame: { x: scrollSpeed, y: 0 } } : {})
      };
    });
  });

  const waves: EngineExportShmupWave[] = rooms.flatMap((room, index) => wavePlansByRoom[index].map((wavePlan, waveIndex) => {
    const eventBindings = child(room, "eventBindings");
    const onStart = waveIndex === 0
      ? scriptForEventName(data, nullableStringField(eventBindings, "onInit"), events, rooms, dialogues, audioItems, audioPack)
      : undefined;
    const roomDialogueBoot = index === startIndex && waveIndex === 0 ? dialogueBoot : [];
    const shmupConfig = shmupSceneConfigFromRuntime(room.runtime, data.settings);
    const enemySpeed = Math.max(
      1,
      Math.round(wavePlan.scrollSpeed ?? shmupConfig?.scrollSpeed ?? numberOrNullLocal(shmupSettings.scrollSpeed) ?? 1)
    );
    const roomEnemies = npcActorsForRoom(data, room, index)
      .filter((actor) => integerField(actor, "waveIndex", 0) === waveIndex)
      .map((actor, actorIndex) => {
      const spriteExport = buildActorEngineSpriteExport(data, actor, spritePack);
      const actorName = stringField(actor, "name", `enemy_${actorIndex + 1}`);
      const actorEventBindings = child(actor, "eventBindings");
      const projectileLaunch = enemyProjectileLaunchByActor.get(actorName);
      const onSpawn = scriptForEventName(
        data,
        nullableStringField(actorEventBindings, "onInit"),
        events,
        rooms,
        dialogues,
        audioItems,
        audioPack,
        pluginRegistry
      );
      const onHitPlayer = scriptForEventName(
        data,
        nullableStringField(actorEventBindings, "onInteract") || nullableStringField(actor, "eventName"),
        events,
        rooms,
        dialogues,
        audioItems,
        audioPack,
        pluginRegistry
      );
      const onDestroy = scriptForEventName(
        data,
        nullableStringField(actorEventBindings, "onHit1"),
        events,
        rooms,
        dialogues,
        audioItems,
        audioPack,
        pluginRegistry
      );
      const position = entityPosition(actor, "actor", { x: 23, y: 6 });
      return {
        name: actorName,
        position: gbaTopdownTilePointToPixels({
          x: position.x,
          y: position.y
        }),
        size: { x: 16, y: 16 },
        velocity: { x: -enemySpeed, y: 0 },
        movement: "linear",
        health: 1,
        score: featureRuntime.pointsPerEnemy,
        fire_interval: projectileLaunch ? 24 : 0,
        ...(projectileLaunch ? {
          projectile_offset: { x: projectileLaunch.direction === "left" ? -4 : 16, y: 8 }
        } : {}),
        ...(onSpawn && onSpawn.length > 0 ? { on_spawn: onSpawn } : {}),
        ...(onHitPlayer && onHitPlayer.length > 0 ? { on_hit_player: onHitPlayer } : {}),
        ...(onDestroy && onDestroy.length > 0 ? { on_destroy: onDestroy } : {}),
        ...(spriteExport ? { metasprite: spriteExport.metasprite } : {})
      };
    });
    const wave: EngineExportShmupWave = {
      name: wavePlan.name,
      start_frame: wavePlan.startFrame,
      next_wave: waveOffsets[index] + waveIndex + 1 < exportedWaveCount
        ? waveOffsets[index] + waveIndex + 1
        : -1,
      resource_bank_group: engineSceneResourceBankGroupName(room, index),
      ...(shmupConfig || wavePlan.playerSpeed !== undefined || wavePlan.fireCooldown !== undefined ? {
        player_speed: Math.max(1, Math.round(wavePlan.playerSpeed ?? shmupConfig?.playerSpeed ?? playerSpeed)),
        fire_cooldown: Math.max(1, Math.round(wavePlan.fireCooldown ?? shmupConfig?.fireCooldown ?? fireRate))
      } : {}),
      enemies: roomEnemies.length > 0 ? roomEnemies : [{
        name: "scout",
        position: { x: 184, y: 48 },
        size: enemySprite ? { x: 32, y: 32 } : { x: 16, y: 16 },
        velocity: { x: -enemySpeed, y: 0 },
        movement: "linear",
        health: 1,
        score: featureRuntime.pointsPerEnemy,
        fire_interval: 24,
        ...(enemySprite ? { metasprite: enemySprite.metasprite } : {})
      }]
    };
    const onStartScript = mergeRoomOnEnterScript(roomDialogueBoot, onStart);
    if (onStartScript) {
      wave.on_start = onStartScript;
    }
    const onClear = waveIndex === wavePlansByRoom[index].length - 1
      ? scriptForEventName(
        data,
        nullableStringField(eventBindings, "onClear"),
        events,
        rooms,
        dialogues,
        audioItems,
        audioPack,
        pluginRegistry
      )
      : undefined;
    if (onClear && onClear.length > 0) {
      wave.on_clear = onClear;
    }
    return wave;
  }));
  const hasPerBackgroundAffineVideo = backgrounds.some((background) => (
    background.video?.affine != null
  ));

  return {
    initial_wave: initialWaveIndex,
    score_enabled: featureRuntime.scoreEnabled,
    high_score_enabled: featureRuntime.highScoreEnabled,
    initial_score: featureRuntime.initialScore,
    initial_lives: featureRuntime.initialLives,
    waves_enabled: featureRuntime.wavesEnabled,
    max_waves: featureRuntime.maxWaves,
    loop_waves: featureRuntime.loopWaves,
    ...(backgrounds.length > 0 ? {
      backgrounds,
      background: Math.max(0, Math.min(initialWaveIndex, backgrounds.length - 1))
    } : {}),
    composition: exportSceneComposition(initialComposition),
    resources: roomSceneResources(initialRoom),
    video: hasPerBackgroundAffineVideo
      ? exportedDefaultRoomVideoComposition()
      : buildRoomVideoComposition(data, initialRoom, tilesetPack),
    save: buildProjectSaveConfig(data),
    player: {
      position: { x: playerPixels.x, y: playerPixels.y },
      size: { x: 32, y: 32 },
      speed: Math.max(1, Math.round(playerSpeed)),
      fire_cooldown: Math.max(1, Math.round(fireRate)),
      projectile_offset: { x: 24, y: 12 },
      ...(playerSprite ? { metasprite: playerSprite.metasprite } : {}),
      ...(Object.keys(playerAnimations).length > 0 ? { animations: playerAnimations } : {})
    },
    projectile: {
      size: projectileSprite ? { x: 16, y: 8 } : { x: 4, y: 8 },
      velocity: playerProjectileLaunch ? shmupProjectileVelocity(playerProjectileLaunch) : { x: 4, y: 0 },
      max_active: 6,
      ...(projectileSprite ? { metasprite: projectileSprite.metasprite } : {})
    },
    ...(firstEnemyProjectileLaunch ? {
      enemy_projectile: {
        size: enemyProjectileSprite ? { x: 16, y: 8 } : { x: 4, y: 8 },
        velocity: shmupProjectileVelocity(firstEnemyProjectileLaunch),
        max_active: 8,
        ...(enemyProjectileSprite ? { metasprite: enemyProjectileSprite.metasprite } : {})
      }
    } : {}),
    waves: waves.length > 0 ? waves : [{
      name: "wave0",
      start_frame: 0,
      enemies: [{
        name: "scout",
        position: { x: 184, y: 48 },
        size: enemySprite ? { x: 32, y: 32 } : { x: 16, y: 16 },
        velocity: {
          x: -Math.max(1, Math.round(numberOrNullLocal(shmupSettings.scrollSpeed) ?? 1)),
          y: 0
        },
        movement: "linear",
        health: 1,
        score: featureRuntime.pointsPerEnemy,
        fire_interval: 24,
        ...(enemySprite ? { metasprite: enemySprite.metasprite } : {})
      }]
    }],
    dialogue_lines: buildDialogueLines(data, dialogues, audioItems, audioPack),
    dialogue_ui: buildEngineDialogueUiConfigForExport(data),
    ...(actorSprites.length > 0 ? { actor_sprites: actorSprites } : {}),
    ...(emoteAssets.length > 0 ? { emote_assets: emoteAssets } : {}),
    scripts: buildTopdownScripts(data, events, rooms, dialogues, audioItems, audioPack, pluginRegistry),
    ...((spritePack || tilesetPack || emotePack) ? { resource_banks: "asset_pack" as const } : {}),
    ...((spritePack || tilesetPack || emotePack || audioPack) ? {
      assets: {
        ...(tilesetPack ? { bg_palettes: regularTilesetAssetNames(tilesetPack) } : {}),
        ...((spritePack || emotePack) ? {
          obj_palettes: Array.from(new Set([...(spritePack?.assetNames ?? []), ...(emotePack?.assetNames ?? [])])),
          ...(spritePack ? { sprite_assets: spritePack.assetNames } : {})
        } : {}),
        tile_assets: Array.from(new Set([
          ...regularTilesetAssetNames(tilesetPack),
          ...(spritePack?.assetNames ?? []),
          ...(emotePack?.assetNames ?? [])
        ])),
        ...(audioPack ? {
        ...buildAudioPackAssetRefs(audioPack)
        } : {})
      }
    } : {})
  };
}

function buildVisualNovelChoiceGroups(
  data: GBAProjectData,
  dialogues: Record<string, unknown>[],
  events: Record<string, unknown>[],
  rooms: Record<string, unknown>[],
  audioItems: Record<string, unknown>[],
  audioPack: AssetcAudioPackGeneration | null
): EngineExportVisualNovelChoiceGroup[] {
  const bindings = choiceEventBindings(events);
  const localization = deriveProjectLocalization(data);
  return dialogues.flatMap((dialogue, dialogueIndex) => {
    const choices = dialogueChoices(dialogue);
    if (choices.length === 0) return [];
    const dialogueKey = stringField(dialogue, "key", "");
    const eventNameByChoiceIndex = bindings.get(dialogueKey);
    return [{
      line: dialogueIndex,
      choices: choices.map((text, index) => {
        const translationsByLocale = dialogueChoiceTranslations(dialogue);
        const translations = localization.enabledLocales
          .filter((locale) => locale !== localization.sourceLocale)
          .map((locale) => ({ locale, text: translationsByLocale[locale]?.[index] ?? "" }))
          .filter((entry) => entry.text.length > 0);
        const localized = translations.length > 0 ? {
          source_locale: localization.sourceLocale,
          default_locale: localization.defaultLocale,
          translations
        } : {};
        const targetEventName = eventNameByChoiceIndex?.get(index);
        const script = scriptForEventName(data, targetEventName ?? "", events, rooms, dialogues, audioItems, audioPack);
        return script && script.length > 0
          ? { text, value: index + 1, ...localized, script }
          : { text, value: index + 1, ...localized };
      })
    }];
  });
}

function buildVisualNovelScenes(
  data: GBAProjectData,
  rooms: Record<string, unknown>[],
  dialogues: Record<string, unknown>[],
  events: Record<string, unknown>[],
  audioItems: Record<string, unknown>[],
  audioPack: AssetcAudioPackGeneration | null,
  choiceGroups: EngineExportVisualNovelChoiceGroup[],
  tilesetPack: AssetcTilesetPackGeneration | null,
  backgroundAssetNames: string[]
): EngineExportVisualNovelScene[] {
  const startIndex = startRoomIndex(data, rooms);
  const dialogueBoot = dialogueUiBootCommands(data, audioItems, audioPack);
  const choiceGroupByLine = new Map(choiceGroups.map((group, index) => [group.line, index]));

  return rooms.map((room, index) => {
    const eventBindings = child(room, "eventBindings");
    const onEnter = scriptForEventName(
      data,
      nullableStringField(eventBindings, "onInit"),
      events,
      rooms,
      dialogues,
      audioItems,
      audioPack
    );
    const roomDialogueBoot = index === startIndex ? dialogueBoot : [];
    const onEnterScript = mergeRoomOnEnterScript(roomDialogueBoot, onEnter);

    let line = -1;
    let choiceGroup = -1;
    if (onEnter) {
      for (const command of onEnter) {
        if (command.op === "show_dialogue" && typeof command.dialogue === "number") {
          line = command.dialogue;
          choiceGroup = choiceGroupByLine.get(line) ?? -1;
          break;
        }
        if (command.op === "show_choice" && typeof command.group === "number") {
          choiceGroup = command.group;
          const group = choiceGroups[choiceGroup];
          if (group) line = group.line;
          break;
        }
      }
    }

    const scene: EngineExportVisualNovelScene = {
      name: roomName(room, index),
      resource_bank_group: engineSceneResourceBankGroupName(room, index),
      background: -1,
      line,
      choice_group: choiceGroup,
      next_scene: index + 1 < rooms.length ? index + 1 : -1
    };
    const sceneConfig = visualNovelSceneConfigFromRuntime(room.runtime, data.settings);
    if (sceneConfig) {
      scene.auto_advance = sceneConfig.autoAdvance;
      scene.background = sceneConfig.backgroundIndex >= 0
        ? sceneConfig.backgroundIndex
        : narrativeSceneBackgroundIndex(room, tilesetPack, backgroundAssetNames);
      scene.next_scene = sceneConfig.nextSceneIndex >= 0 ? sceneConfig.nextSceneIndex : scene.next_scene;
      if (sceneConfig.dialogueKey) {
        const explicitLine = dialogues.findIndex((dialogue) => stringField(dialogue, "key", "") === sceneConfig.dialogueKey);
        if (explicitLine >= 0) {
          scene.line = explicitLine;
          scene.choice_group = choiceGroupByLine.get(explicitLine) ?? -1;
        }
      }
    }
    if (onEnterScript) {
      scene.on_enter = onEnterScript;
    }
    return scene;
  });
}

function buildVisualNovelProject(
  data: GBAProjectData,
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()
): EngineExportVisualNovelProject {
  const rooms = exportRoomsForKind(data, "visual_novel");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const tilesetPack = buildAssetcTilesetPackGeneration(data);
  const events = projectArray(data, "events");
  const spritePack = buildAssetcSpritePackGeneration(data);
  const portraitPack = buildAssetcPortraitPackGeneration(data, spritePack);
  const emotePack = buildAssetcEmotePackGeneration(data, spritePack, portraitPack);
  const portraitAssets = buildDialoguePortraitAssetsExport(data, portraitPack, spritePack);
  const emoteAssets = buildDialogueEmoteAssetsExport(data, emotePack, portraitPack, spritePack);
  const choiceGroups = buildVisualNovelChoiceGroups(data, dialogues, events, rooms, audioItems, audioPack);
  const availableBackgrounds = regularTilesetAssetNames(tilesetPack).map((assetName) => ({
    name: assetName,
    layer: "bg1",
    tilemap: assetName,
    backdrop_color: 0
  })) ?? [];
  const availableBackgroundAssetNames = availableBackgrounds.map((background) => background.name);
  const narrative = selectNarrativeBackgrounds(
    availableBackgrounds,
    buildVisualNovelScenes(
      data,
      rooms,
      dialogues,
      events,
      audioItems,
      audioPack,
      choiceGroups,
      tilesetPack,
      availableBackgroundAssetNames
    )
  );
  const assetRefs = {
    ...(narrative.assetNames.length > 0
      ? { bg_palettes: narrative.assetNames, tile_assets: narrative.assetNames }
      : {}),
    ...buildAudioPackAssetRefs(audioPack)
  };
  return {
    initial_scene: startRoomIndex(data, rooms),
    ...((tilesetPack || spritePack || portraitPack || emotePack) ? { resource_banks: "asset_pack" as const } : {}),
    save: buildProjectSaveConfig(data),
    scenes: narrative.scenes,
    dialogue_lines: buildDialogueLines(data, dialogues, audioItems, audioPack),
    dialogue_ui: buildEngineDialogueUiConfigForExport(data),
    ...(narrative.backgrounds.length > 0 ? { backgrounds: narrative.backgrounds } : {}),
    ...(portraitAssets.length > 0 ? { portrait_assets: portraitAssets } : {}),
    ...(emoteAssets.length > 0 ? { emote_assets: emoteAssets } : {}),
    ...(choiceGroups.length > 0 ? { choice_groups: choiceGroups } : {}),
    scripts: buildTopdownScripts(data, events, rooms, dialogues, audioItems, audioPack, pluginRegistry),
    ...(Object.keys(assetRefs).length > 0 ? { assets: assetRefs } : {})
  };
}

function menuTitleLineIndex(dialogues: Record<string, unknown>[]): number {
  const withoutChoices = dialogues.findIndex((dialogue) => dialogueChoices(dialogue).length === 0);
  return withoutChoices >= 0 ? withoutChoices : dialogues.length > 0 ? 0 : -1;
}

function menuItemsDialogueIndex(dialogues: Record<string, unknown>[]): number {
  return dialogues.findIndex((dialogue) => dialogueChoices(dialogue).length > 0);
}

interface MenuScreenSource {
  room: Record<string, unknown>;
  roomIndex: number;
  name: string;
  config: Omit<MenuSceneConfig, "role"> | null;
  role: MenuSceneRole;
  menuProfile: MenuSceneProfile;
  presentationMode: "scene" | "hud" | "both";
  entryPolicy: "title" | "gameplay";
  returnPolicy: "title" | "resume";
  suspendsGameplay: boolean;
  onEnterEventName: string;
  onBackEventName: string;
  inheritsRoomOnEnter: boolean;
}

function menuScreenSources(rooms: Record<string, unknown>[]): MenuScreenSource[] {
  return rooms.flatMap((room, roomIndex): MenuScreenSource[] => {
    const runtime = child(room, "runtime");
    const runtimeConfig = child(runtime, "config");
    const hasExplicitConfig = stringField(runtime, "type", "") === "menu"
      && !!runtimeConfig
      && Object.hasOwn(runtimeConfig, "screenType");
    const menuConfig = hasExplicitConfig ? normalizeMenuSceneConfig(runtimeConfig) : null;
    if (menuConfig?.screens?.length) {
      return menuConfig.screens.map((screen, screenIndex) => ({
        room,
        roomIndex,
        name: screen.id,
        config: {
          screenType: screen.screenType,
          title: screen.title,
          titleOverlayAssetName: screen.titleOverlayAssetName,
          hudMode: screen.hudMode ?? (screen.hudPresetId ? undefined : menuConfig.hudMode),
          hudPresetId: screen.hudPresetId ?? menuConfig.hudPresetId,
          backgroundAnimation: screen.backgroundAnimation,
          titleFadeFrames: screen.titleFadeFrames,
          autoAdvanceFrames: screen.autoAdvanceFrames,
          allowSkip: screen.allowSkip,
          nextScreenID: screen.nextScreenID,
          items: screen.items,
          carousel: screen.carousel,
          onBackEventName: screen.onBackEventName ?? "",
          menuProfile: screen.menuProfile ?? menuConfig.menuProfile,
          presentationMode: screen.presentationMode ?? menuConfig.presentationMode,
          entryPolicy: screen.entryPolicy ?? menuConfig.entryPolicy,
          returnPolicy: screen.returnPolicy ?? menuConfig.returnPolicy,
          suspendsGameplay: screen.suspendsGameplay ?? menuConfig.suspendsGameplay
        },
        role: menuConfig.role,
        menuProfile: screen.menuProfile ?? menuConfig.menuProfile,
        presentationMode: screen.presentationMode ?? menuConfig.presentationMode,
        entryPolicy: screen.entryPolicy ?? menuConfig.entryPolicy,
        returnPolicy: screen.returnPolicy ?? menuConfig.returnPolicy,
        suspendsGameplay: screen.suspendsGameplay ?? menuConfig.suspendsGameplay,
        onEnterEventName: screen.onEnterEventName,
        onBackEventName: screen.onBackEventName ?? "",
        inheritsRoomOnEnter: screenIndex === 0
      }));
    }
    return [{
      room,
      roomIndex,
      name: roomName(room, roomIndex),
      config: menuConfig,
      role: menuConfig?.role ?? "menu",
      menuProfile: menuConfig?.menuProfile ?? "initial",
      presentationMode: menuConfig?.presentationMode ?? "scene",
      entryPolicy: menuConfig?.entryPolicy ?? "title",
      returnPolicy: menuConfig?.returnPolicy ?? "title",
      suspendsGameplay: menuConfig?.suspendsGameplay ?? false,
      onEnterEventName: "",
      onBackEventName: menuConfig?.onBackEventName ?? "",
      inheritsRoomOnEnter: true
    }];
  });
}

function startMenuScreenIndex(data: GBAProjectData): number {
  return menuScreenSources(exportRoomsForKind(data, "menu"))
    .findIndex((source) => source.role === "start");
}

function exportMenuItemBinding(binding: MenuSceneItemBinding | undefined): EngineExportMenuItem["binding"] {
  return binding
    ? { source: binding.source, index: binding.index, format: binding.format }
    : undefined;
}

function buildMenuScreens(
  data: GBAProjectData,
  rooms: Record<string, unknown>[],
  dialogues: Record<string, unknown>[],
  events: Record<string, unknown>[],
  audioItems: Record<string, unknown>[],
  audioPack: AssetcAudioPackGeneration | null,
  spritePack: AssetcSpritePackGeneration | null,
  tilesetPack: AssetcTilesetPackGeneration | null,
  backgroundAssetNames: string[],
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()
): { screens: EngineExportMenuScreen[]; initialScreen: number } {
  const sources = menuScreenSources(rooms);
  const startRoom = startRoomIndex(data, rooms);
  const initialScreen = Math.max(0, sources.findIndex((source) => source.roomIndex === startRoom));
  const dialogueBoot = dialogueUiBootCommands(data, audioItems, audioPack);
  const bindings = choiceEventBindings(events);
  const titleLine = menuTitleLineIndex(dialogues);
  const itemsDialogueIndex = menuItemsDialogueIndex(dialogues);
  const itemsDialogue = itemsDialogueIndex >= 0 ? dialogues[itemsDialogueIndex] : undefined;
  const itemsKey = itemsDialogue ? stringField(itemsDialogue, "key", "") : "";
  const choices = itemsDialogue ? dialogueChoices(itemsDialogue) : [];
  const eventNameByChoiceIndex = itemsKey ? bindings.get(itemsKey) : undefined;
  const textInputVariableKeys = sources.flatMap((source) => {
    const variableName = source.config?.textInput?.variableName;
    return [variableName, source.config?.titleTextVariableName].filter((value): value is string => Boolean(value));
  });
  const eventValueRegistries = buildEventValueRegistries(
    events,
    pluginRegistry,
    [],
    textInputVariableKeys,
    sceneRouteVariableKeys(data),
    projectVariableKeys(data)
  );

  const allRooms = projectRooms(data);

  const screens = sources.map((source, index) => {
    const { room, roomIndex, config: menuConfig } = source;
    const eventBindings = child(room, "eventBindings");
    const roomOnEnter = source.inheritsRoomOnEnter ? scriptForEventName(
      data,
      nullableStringField(eventBindings, "onInit"),
      events,
      rooms,
      dialogues,
      audioItems,
      audioPack
    ) : undefined;
    const screenOnEnter = scriptForEventName(
      data,
      source.onEnterEventName,
      events,
      rooms,
      dialogues,
      audioItems,
      audioPack
    );
    const screenOnBack = scriptForEventName(
      data,
      source.onBackEventName,
      events,
      rooms,
      dialogues,
      audioItems,
      audioPack
    );
    const roomDialogueBoot = index === initialScreen ? dialogueBoot : [];
    const onEnterScript = mergeRoomOnEnterScript(
      roomDialogueBoot,
      [...(roomOnEnter ?? []), ...(screenOnEnter ?? [])]
    );

    const explicitItems: EngineExportMenuItem[] = menuConfig?.items.map((menuItem) => {
      let onSelect = scriptForEventName(data, menuItem.eventName, events, rooms, dialogues, audioItems, audioPack);
      if (!menuItem.eventName && source.role === "start" && menuItem.id === "back") {
        onSelect = [{ op: "scene_stack_previous", runtime: "menu" }];
      }
      const globalTargetIndex = allRooms.findIndex((candidate, candidateIndex) => {
        const candidateID = stringField(candidate, "id", "");
        return candidateID === menuItem.targetScreenID || roomName(candidate, candidateIndex) === menuItem.targetScreenID;
      });
      const globalTarget = globalTargetIndex >= 0 ? allRooms[globalTargetIndex] : null;
      const targetKind = globalTarget ? resolveSceneRuntimeExport(roomSceneType(globalTarget)).kind : "menu";
      const targetScreen = sources.findIndex((candidate) => {
        const candidateID = stringField(candidate.room, "id", "");
        return candidate.name === menuItem.targetScreenID
          || candidateID === menuItem.targetScreenID
          || roomName(candidate.room, candidate.roomIndex) === menuItem.targetScreenID;
      });
      let resolvedTargetScreen = targetScreen;
      const navigationIndex = onSelect?.reduce((last, command, index) => command.op === "warp" || (command.op === "warp_runtime" && command.runtime === "menu") ? index : last, -1) ?? -1;
      const navigation = navigationIndex >= 0 ? onSelect![navigationIndex] : undefined;
      const revealOnlySuffix = onSelect?.slice(navigationIndex + 1).every(command => command.op === "fade_in" || (command.op === "visual_effect" && command.phase === "reveal"));
      if (targetKind === "menu" && navigation?.room !== undefined && revealOnlySuffix && !onSelect?.some(command => command.op === "jump" || command.op.startsWith("jump_if"))) {
        const sameRuntimeTargetScreen = navigation.op === "warp_runtime" ? navigation.room
          : sources.findIndex(candidate => candidate.roomIndex === navigation.room);
        if (sameRuntimeTargetScreen >= 0 && (resolvedTargetScreen < 0 || resolvedTargetScreen === sameRuntimeTargetScreen)) {
          resolvedTargetScreen = sameRuntimeTargetScreen;
          // Keep the native open/push action and its Back stack. Reveal may
          // follow navigation in the script, so warp is no longer always last.
          onSelect = onSelect?.filter((_, commandIndex) => commandIndex !== navigationIndex);
        }
      }
      const dialogueLine = menuItem.dialogueKey
        ? dialogues.findIndex((dialogue) => stringField(dialogue, "key", "") === menuItem.dialogueKey)
        : -1;
      const item: EngineExportMenuItem = {
        label: menuItem.label,
        line: dialogueLine,
        action: menuItem.action,
        enabled: menuItem.enabled,
        ...(menuItem.requiresSave || menuItem.id === "load-game" ? { requires_save: true } : {}),
        ...(menuItem.binding ? { binding: exportMenuItemBinding(menuItem.binding) } : {}),
        ...(menuItem.saveSlot !== undefined ? { save_slot: menuItem.saveSlot } : {}),
        ...(menuItem.valueLabels ? { value_labels: menuItem.valueLabels } : {}),
        ...(menuItem.detailLines ? { detail_lines: menuItem.detailLines } : {}),
        click_box: { ...menuItem.clickBox }
      };
      if (globalTarget && targetKind !== "menu" && MIXED_RUNTIME_KINDS.has(targetKind)) {
        const targetRooms = exportRoomsForKind(data, targetKind);
        const targetName = roomName(globalTarget, globalTargetIndex);
        const targetRoom = roomIndexByName(targetRooms, targetName);
        if (targetRoom >= 0) {
          const position = warpPositionForChangeScene(data, targetRooms, targetRoom, ["change_scene", targetName], targetKind);
          onSelect = [
            ...(onSelect ?? []),
            { op: "warp_runtime", runtime: targetKind as MixedRuntimeKind, room: targetRoom, x: position.x, y: position.y }
          ];
          item.action = "select";
        }
      }
      if (onSelect && onSelect.length > 0) item.on_select = onSelect;
      if (resolvedTargetScreen >= 0 && targetKind === "menu") item.target_screen = resolvedTargetScreen;
      if (menuItem.targetItemID && item.target_screen !== undefined &&
          (item.action === "open_screen" || item.action === "push_screen")) {
        const targetItems = sources[item.target_screen]?.config?.items ?? [];
        const targetItemIndex = targetItems.findIndex((candidate) => candidate.id === menuItem.targetItemID);
        if (targetItemIndex < 0) {
          throw new Error(`Menu item ${menuItem.id} targets missing item ${menuItem.targetItemID} in ${sources[item.target_screen]?.name ?? menuItem.targetScreenID}`);
        }
        item.target_item = targetItemIndex;
      }
      if (menuItem.action === "toggle_variable") {
        item.toggle_variable = menuItem.variableIndex;
        item.min = menuItem.minValue;
        item.max = menuItem.maxValue;
        item.checked_value = menuItem.checkedValue;
      }
      if (menuItem.action === "adjust_variable") {
        item.adjust_variable = menuItem.variableIndex;
        item.min = menuItem.minValue;
        item.max = menuItem.maxValue;
        item.step = menuItem.step;
      }
      if (menuItem.audioChannel) item.audio_channel = menuItem.audioChannel;
      return item;
    }) ?? [];

    const items: EngineExportMenuItem[] = menuConfig
      ? explicitItems
      : choices.length > 0
      ? choices.map((label, choiceIndex) => {
          const targetEventName = eventNameByChoiceIndex?.get(choiceIndex);
          const onSelect = scriptForEventName(data, targetEventName ?? "", events, rooms, dialogues, audioItems, audioPack);
          const item: EngineExportMenuItem = {
            label,
            line: itemsDialogueIndex
          };
          if (onSelect && onSelect.length > 0) {
            item.on_select = onSelect;
          }
          const nextRoomIndex = sources.findIndex((candidate, candidateIndex) => {
            return candidateIndex !== index && candidate.name.toLowerCase().includes("option");
          });
          if (nextRoomIndex >= 0 && /option/i.test(label)) {
            item.target_screen = nextRoomIndex;
            item.action = "push_screen";
          }
          return item;
        })
      : [{
          label: "> Start",
          line: titleLine
        }];

    const screenHudBinding = menuConfig?.hudMode === "none" ? null : resolveExplicitHudPresetBinding(data, {
      scenePresetId: menuConfig?.hudPresetId, roomPresetId: room.hudPresetId
    });
    const screen: EngineExportMenuScreen = {
      name: source.name,
      resource_bank_group: engineSceneResourceBankGroupName(room, roomIndex),
      background: -1,
      title_line: titleLine,
      items,
      ...(menuConfig?.carousel ? { carousel: true } : {}),
      menu_profile: source.menuProfile,
      presentation_mode: source.presentationMode,
      entry_policy: source.entryPolicy,
      return_policy: source.returnPolicy,
      suspends_gameplay: source.suspendsGameplay,
      ...(screenHudBinding ? { hud_preset_id: screenHudBinding.presetId } : {})
    };
    const actors = projectArray(data, "actors")
      .filter((actor) => entitySceneName(actor, "actor") === roomName(room, roomIndex))
      .filter((actor) => {
        const screenIDs = actor.menuScreenIDs;
        return !Array.isArray(screenIDs) || screenIDs.includes(source.name);
      })
      .flatMap((actor): EngineExportMenuActor[] => {
        const spriteExport = buildActorEngineSpriteExport(data, actor, spritePack);
        if (!spriteExport) return [];
        const selectedSpriteSheet = nullableStringField(actor, "menuSelectedSpriteSheet")
          || nullableStringField(actor, "menu_selected_sprite_sheet");
        const selectedAnimationName = nullableStringField(actor, "menuSelectedAnimationName")
          || nullableStringField(actor, "menu_selected_animation_name");
        const selectedSpriteExport = selectedSpriteSheet
          ? buildActorEngineSpriteExport(data, {
            ...actor,
            spriteSheet: selectedSpriteSheet,
            ...(selectedAnimationName ? { animationName: selectedAnimationName } : {})
          }, spritePack)
          : null;
        const entryAnimation = stringField(actor, "menuEntryAnimation", "none").trim().toLowerCase().replace(/-/g, "_");
        const entryAnimationFrames = Math.max(0, Math.min(3600, integerField(actor, "menuEntryAnimationFrames", 0)));
        const entryOffsetY = Math.max(0, Math.min(160, integerField(actor, "menuEntryOffsetY", 0)));
        const actorRole = stringField(actor, "menuActorRole", "decorative").trim().toLowerCase().replace(/-/g, "_");
        // The editor/preflight uses `back` to describe a dedicated return
        // actor, while the current Engine Pack only has visual, option and
        // cursor roles. Keep the actor visible as a decorative sprite until
        // the runtime gains a first-class back role.
        const normalizedRole = actorRole === "option" || actorRole === "cursor"
          ? actorRole
          : "decorative";
        const menuItemID = nullableStringField(actor, "menuItemID");
        const menuItemIndex = menuConfig?.items.findIndex((item) => item.id === menuItemID) ?? -1;
        const visibilityVariableKey = nullableStringField(actor, "menuVisibilityVariable")
          || nullableStringField(actor, "menu_visibility_variable")
          || nullableStringField(actor, "menuVisibilityVariableName");
        const explicitVisibilityVariableIndex = numberOrNullLocal(actor.menuVisibilityVariableIndex ?? actor.menu_visibility_variable_index);
        const visibilityVariable = visibilityVariableKey
          ? eventValueRegistries.variableIndex(visibilityVariableKey)
          : explicitVisibilityVariableIndex === null ? null : Math.floor(explicitVisibilityVariableIndex);
        const visibilityValue = integerField(actor, "menuVisibilityValue", integerField(actor, "menu_visibility_value", 0));
        const onInit = scriptForEventName(
          data,
          resolveActorInitEventName(actor),
          events,
          rooms,
          dialogues,
          audioItems,
          audioPack,
          pluginRegistry
        );
        const onInteract = scriptForEventName(
          data,
          resolveActorInteractEventName(actor),
          events,
          rooms,
          dialogues,
          audioItems,
          audioPack,
          pluginRegistry
        );
        const onUpdate = scriptForEventName(
          data,
          resolveActorOnUpdateEventName(actor),
          events,
          rooms,
          dialogues,
          audioItems,
          audioPack,
          pluginRegistry
        );
        const position = entityPosition(actor, "actor");
        const explicitPixelPosition = pixelPositionField(actor);
        return [{
          name: stringField(actor, "name", "Actor"),
          position: explicitPixelPosition ?? gbaTopdownTilePointToPixels({
            x: position.x,
            y: position.y
          }),
          metasprite: spriteExport.metasprite,
          ...(selectedSpriteExport ? { selected_metasprite: selectedSpriteExport.metasprite } : {}),
          ...(entryAnimation === "slide_down" ? {
            entry_animation: "slide_down" as const,
            entry_offset_y: entryOffsetY,
            entry_animation_frames: entryAnimationFrames
          } : {}),
          role: normalizedRole,
          ...(actor.menuActorSelectedOnly === true ? {selected_only:true} : {}),
          ...(menuItemIndex >= 0 ? { menu_item_index: menuItemIndex } : {}),
          ...(nullableStringField(actor, "cursorForMenu") ? { cursor_for_menu: nullableStringField(actor, "cursorForMenu") } : {}),
          ...(actor.menuCursorFollowsOption === true ? {
            cursor_follows_option: true,
            cursor_offset_pixels: {
              x: integerField(child(actor, "menuCursorOffsetPixels"), "x", 0),
              y: integerField(child(actor, "menuCursorOffsetPixels"), "y", 0)
            }
          } : {}),
          ...(visibilityVariable === null || visibilityVariable < 0 ? {} : {
            visibility_variable: visibilityVariable,
            visibility_value: visibilityValue
          }),
          ...(onInit && onInit.length > 0 ? { on_init: onInit } : {}),
          ...(onInteract && onInteract.length > 0 ? { on_interact: onInteract } : {}),
          ...(onUpdate && onUpdate.length > 0 ? { on_update: onUpdate } : {}),
          ...(actor.menuMirrorX === true ? { flip_horizontal: true } : {})
        }];
      });
    if (actors.length > 0) {
      screen.actors = actors;
    }
    const backgroundAssetName = roomBackgroundAssetName(room);
    const backgroundAsset = backgroundAssetName && tilesetPack
      ? tilesetPack.assetsBySheet[backgroundAssetName]
      : null;
    if (backgroundAsset) {
      screen.background = backgroundAssetNames.indexOf(backgroundAsset.name);
    }
    if (menuConfig) {
      screen.screen_type = menuConfig.screenType;
      screen.title = menuConfig.title;
      if (menuConfig.hudListRows) screen.hud_list_rows = menuConfig.hudListRows;
      if (menuConfig.hudTextColor !== undefined) screen.hud_text_color = menuConfig.hudTextColor;
      if (menuConfig.hudTransparentText) screen.hud_transparent_text = true;
      if (menuConfig.titleTextVariableName) screen.title_text_variable = eventValueRegistries.textVariableIndex(menuConfig.titleTextVariableName);
      if (menuConfig.backgroundAnimation && tilesetPack) {
        const frameIndexes = menuConfig.backgroundAnimation.frameAssetNames
          .map((frameAssetName) => tilesetPack.assetsBySheet[frameAssetName]?.name)
          .filter((assetName): assetName is string => Boolean(assetName))
          .map((assetName) => backgroundAssetNames.indexOf(assetName))
          .filter((frameIndex, frameIndexPosition, indexes) => frameIndex >= 0 && indexes.indexOf(frameIndex) === frameIndexPosition);
        if (frameIndexes.length >= 2) {
          screen.background_animation = {
            frames: frameIndexes,
            frame_duration: menuConfig.backgroundAnimation.frameDuration,
            loop: menuConfig.backgroundAnimation.loop
          };
        }
      }
      const titleOverlayAsset = menuConfig.titleOverlayAssetName && tilesetPack
        ? tilesetPack.assetsBySheet[menuConfig.titleOverlayAssetName]
        : null;
      if (titleOverlayAsset) {
        screen.title_overlay_background = backgroundAssetNames.indexOf(titleOverlayAsset.name);
        screen.title_fade_frames = menuConfig.titleFadeFrames;
      }
      screen.auto_advance_frames = menuConfig.autoAdvanceFrames;
      screen.allow_skip = menuConfig.allowSkip;
      const nextScreen = sources.findIndex((candidate) => {
        const candidateID = stringField(candidate.room, "id", "");
        return candidate.name === menuConfig.nextScreenID
          || candidateID === menuConfig.nextScreenID
          || roomName(candidate.room, candidate.roomIndex) === menuConfig.nextScreenID;
      });
      if (nextScreen >= 0) screen.next_screen = nextScreen;
      if (menuConfig.textInput) {
        const keyboard = menuConfig.textInput.keyboard;
        screen.text_input = {
          variable_index: eventValueRegistries.textVariableIndex(menuConfig.textInput.variableName),
          max_length: menuConfig.textInput.maxLength,
          x: menuConfig.textInput.x,
          y: menuConfig.textInput.y,
          width: menuConfig.textInput.width,
          keyboard_layout: keyboard?.layout ?? "hidden",
          keyboard_x: keyboard?.x ?? 0,
          keyboard_y: keyboard?.y ?? 0,
          keyboard_width: keyboard?.width ?? 0,
          keyboard_height: keyboard?.height ?? 0,
          keyboard_allow_lowercase: keyboard?.allowLowercase ?? false,
          ...(keyboard?.surface === "background" ? { keyboard_surface: "background" as const } : {}),
          ...(keyboard?.controlLayout ? { keyboard_control_layout: keyboard.controlLayout } : {}),
          ...(keyboard?.controlsX !== undefined ? { keyboard_controls_x: keyboard.controlsX } : {}),
          ...(keyboard?.controlsY !== undefined ? { keyboard_controls_y: keyboard.controlsY } : {}),
          ...(keyboard?.controlsWidth !== undefined ? { keyboard_controls_width: keyboard.controlsWidth } : {}),
          ...(keyboard?.controlsHeight !== undefined ? { keyboard_controls_height: keyboard.controlsHeight } : {})
        };
      }
    }
    if (onEnterScript) {
      screen.on_enter = onEnterScript;
    }
    if (screenOnBack && screenOnBack.length > 0) {
      screen.on_back = screenOnBack;
    } else if (source.role === "start") {
      // The root in-game menu must return to the suspended gameplay runtime
      // when the player presses B, even when no explicit onBack event exists.
      screen.on_back = [{ op: "scene_stack_previous", runtime: "menu" }];
    }
    return screen;
  });
  return { screens, initialScreen };
}

function buildMenuProject(
  data: GBAProjectData,
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()
): EngineExportMenuProject {
  const rooms = exportRoomsForKind(data, "menu");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const spritePack = buildAssetcSpritePackGeneration(data);
  const portraitPack = buildAssetcPortraitPackGeneration(data, spritePack);
  const portraitAssets = buildDialoguePortraitAssetsExport(data, portraitPack, spritePack);
  const tilesetPack = buildAssetcTilesetPackGeneration(data);
  const events = projectArray(data, "events");
  const backgroundAssetNames = tilesetPack
    ? Array.from(new Set(rooms.flatMap((room) => {
      const sheetName = roomBackgroundAssetName(room);
      const asset = sheetName ? tilesetPack.assetsBySheet[sheetName] : undefined;
      const runtime = child(room, "runtime");
      const menuConfig = stringField(runtime, "type", "") === "menu"
        ? normalizeMenuSceneConfig(child(runtime, "config"))
        : null;
      const overlaySheetNames = menuConfig
        ? [
            menuConfig.titleOverlayAssetName,
            ...(menuConfig.screens?.map((screen) => screen.titleOverlayAssetName) ?? [])
          ].filter(Boolean)
        : [];
      const overlayAssets = overlaySheetNames.flatMap((overlaySheetName) => {
        const overlayAsset = tilesetPack.assetsBySheet[overlaySheetName];
        return overlayAsset ? [overlayAsset.name] : [];
      });
      const animationSheetNames = menuConfig
        ? [
            ...(menuConfig.backgroundAnimation?.frameAssetNames ?? []),
            ...(menuConfig.screens?.flatMap((screen) => screen.backgroundAnimation?.frameAssetNames ?? []) ?? [])
          ]
        : [];
      const animationAssets = animationSheetNames.flatMap((animationSheetName) => {
        const animationAsset = tilesetPack.assetsBySheet[animationSheetName];
        return animationAsset ? [animationAsset.name] : [];
      });
      return [...(asset ? [asset.name] : []), ...animationAssets, ...overlayAssets];
      })))
    : [];
  const overlayAssetNames = new Set(rooms.flatMap((room) => {
    const runtime = child(room, "runtime");
    if (stringField(runtime, "type", "") !== "menu" || !tilesetPack) return [];
    const menuConfig = normalizeMenuSceneConfig(child(runtime, "config"));
    return [
      menuConfig.titleOverlayAssetName,
      ...(menuConfig.screens?.map((screen) => screen.titleOverlayAssetName) ?? [])
    ].flatMap((sheetName) => {
      const overlayAsset = sheetName ? tilesetPack.assetsBySheet[sheetName] : undefined;
      return overlayAsset ? [overlayAsset.name] : [];
    });
  }));
  const backgrounds = backgroundAssetNames.map((assetName) => ({
    name: assetName,
    layer: overlayAssetNames.has(assetName) ? "bg0" : "bg1",
    tilemap: assetName,
    backdrop_color: 0
  }));
  const menuScreens = buildMenuScreens(
    data,
    rooms,
    dialogues,
    events,
    audioItems,
    audioPack,
    spritePack,
    tilesetPack,
    backgroundAssetNames,
    pluginRegistry
  );
  const startMenuSource = menuScreenSources(rooms).find((source) => source.role === "start");
  const spriteAssetNames = spritePack
    ? Array.from(new Set(menuScreens.screens.flatMap((screen) =>
      (screen.actors ?? []).map((actor) => actor.metasprite.asset)
    ))).filter((assetName) => spritePack.assetNames.includes(assetName))
    : [];
  const assetRefs = {
    ...(backgroundAssetNames.length > 0
      ? { bg_palettes: backgroundAssetNames, tile_assets: backgroundAssetNames }
      : {}),
    ...(spriteAssetNames.length > 0
      ? {
          obj_palettes: spriteAssetNames,
          tile_assets: Array.from(new Set([
            ...(backgroundAssetNames.length > 0 ? backgroundAssetNames : []),
            ...spriteAssetNames
          ]))
        }
      : {}),
    ...buildAudioPackAssetRefs(audioPack)
  };
  if (portraitPack) {
    assetRefs.obj_palettes = Array.from(new Set([
      ...(assetRefs.obj_palettes ?? []),
      ...portraitPack.assetNames
    ]));
    assetRefs.tile_assets = Array.from(new Set([
      ...(assetRefs.tile_assets ?? []),
      ...portraitPack.assetNames
    ]));
  }

  const profileEntries = (["initial", "in_game"] as const).flatMap((profile) => {
    const entryScreen = menuScreens.screens.findIndex((screen) => screen.menu_profile === profile);
    if (entryScreen < 0) return [];
    return [{
      id: profile,
      label: profile === "initial" ? "Menu inicial" : "Menu durante o jogo",
      entry_screen: entryScreen,
      return_policy: profile === "in_game" ? "resume" as const : "title" as const,
      suspends_gameplay: profile === "in_game"
    }];
  });

  return {
    ...(startMenuScreenIndex(data) >= 0 ? { start_menu_screen: startMenuScreenIndex(data) } : {}),
    ...(startMenuSource ? { start_menu_presentation: startMenuSource.presentationMode } : {}),
    initial_screen: menuScreens.initialScreen,
    ...(profileEntries.length > 0 ? { menu_profiles: profileEntries } : {}),
    ...((tilesetPack || spritePack || portraitPack) ? { resource_banks: "asset_pack" as const } : {}),
    save: buildProjectSaveConfig(data),
    screens: menuScreens.screens,
    dialogue_lines: buildDialogueLines(data, dialogues, audioItems, audioPack),
    dialogue_ui: buildEngineDialogueUiConfigForExport(data),
    ...(portraitAssets.length > 0 ? { portrait_assets: portraitAssets } : {}),
    scripts: buildTopdownScripts(data, events, rooms, dialogues, audioItems, audioPack, pluginRegistry),
    ...(backgrounds.length > 0 ? { backgrounds } : {}),
    ...(Object.keys(assetRefs).length > 0 ? { assets: assetRefs } : {})
  };
}

function narrativeSceneBackgroundIndex(
  room: Record<string, unknown>,
  tilesetPack: AssetcTilesetPackGeneration | null,
  backgroundAssetNames: string[]
): number {
  const backgroundAssetName = roomBackgroundAssetName(room);
  const backgroundAsset = backgroundAssetName && tilesetPack
    ? tilesetPack.assetsBySheet[backgroundAssetName]
    : null;
  return backgroundAsset ? backgroundAssetNames.indexOf(backgroundAsset.name) : -1;
}

type NarrativeBackground = {
  name: string;
  layer: string;
  tilemap: string;
  backdrop_color: number;
};

function remapBackgroundCommands<T>(value: T, indexes: Map<number, number>): T {
  if (Array.isArray(value)) return value.map(item => remapBackgroundCommands(item, indexes)) as T;
  if (!isRecord(value)) return value;
  if (value.op === "set_background") return { ...value, index: indexes.get(Number(value.index)) ?? -1 } as T;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapBackgroundCommands(item, indexes)])) as T;
}

function selectNarrativeBackgrounds<TScene extends { background?: number; steps?: Array<{ background?: number }> }>(
  backgrounds: NarrativeBackground[],
  scenes: TScene[],
  commands: EngineExportProjectEventCommand[] = []
): { assetNames: string[]; backgrounds: NarrativeBackground[]; scenes: TScene[] } {
  const usedIndexes = [...new Set([
    ...scenes.flatMap(scene => [scene.background ?? -1, ...(scene.steps?.map(step => step.background ?? -1) ?? [])]),
    ...commands.filter(command => command.op === "set_background").map(command => command.index ?? -1)
  ].filter(index => index >= 0 && index < backgrounds.length))];
  const remappedIndexes = new Map(usedIndexes.map((sourceIndex, targetIndex) => [sourceIndex, targetIndex]));
  const selectedBackgrounds = usedIndexes.map((index) => backgrounds[index]!);
  return {
    assetNames: selectedBackgrounds.map((background) => background.name),
    backgrounds: selectedBackgrounds,
    scenes: scenes.map((scene) => ({
      ...remapBackgroundCommands(scene, remappedIndexes),
      background: remappedIndexes.get(scene.background ?? -1) ?? -1,
      ...(scene.steps ? {
        steps: scene.steps.map((step) => ({
          ...remapBackgroundCommands(step, remappedIndexes),
          background: remappedIndexes.get(step.background ?? -1) ?? -1
        }))
      } : {})
    }))
  };
}

function narrativeBackgroundIndexForAssetName(
  assetName: string | undefined,
  tilesetPack: AssetcTilesetPackGeneration | null,
  backgroundAssetNames: string[]
): number {
  const backgroundAsset = assetName && tilesetPack
    ? tilesetPack.assetsBySheet[assetName]
    : null;
  return backgroundAsset ? backgroundAssetNames.indexOf(backgroundAsset.name) : -1;
}

function buildCutsceneScenes(
  data: GBAProjectData,
  rooms: Record<string, unknown>[],
  dialogues: Record<string, unknown>[],
  events: Record<string, unknown>[],
  audioItems: Record<string, unknown>[],
  audioPack: AssetcAudioPackGeneration | null,
  spritePack: AssetcSpritePackGeneration | null,
  tilesetPack: AssetcTilesetPackGeneration | null,
  backgroundAssetNames: string[]
): EngineExportCutsceneScene[] {
  return rooms.map((room, index) => {
    const sceneConfig = cutsceneSceneConfigFromRuntime(room.runtime, data.settings);
    const background = (sceneConfig?.backgroundIndex ?? -1) >= 0
      ? sceneConfig!.backgroundIndex
      : narrativeSceneBackgroundIndex(room, tilesetPack, backgroundAssetNames);
    const eventBindings = child(room, "eventBindings");
    const onEnter = scriptForEventName(
      data,
      nullableStringField(eventBindings, "onInit"),
      events,
      rooms,
      dialogues,
      audioItems,
      audioPack
    ) ?? [];
    const actors = projectArray(data, "actors")
      .filter((actor) => entitySceneName(actor, "actor") === roomName(room, index))
      .flatMap((actor): EngineExportCutsceneActor[] => {
        const spriteExport = buildActorEngineSpriteExport(data, actor, spritePack);
        if (!spriteExport) return [];
        const position = entityPosition(actor, "actor");
        return [{
          name: stringField(actor, "name", "Actor"),
          position: gbaTopdownTilePointToPixels({
            x: position.x,
            y: position.y
          }),
          metasprite: spriteExport.metasprite
        }];
      });

    const explicitSteps: EngineExportCutsceneStep[] = (sceneConfig?.steps ?? []).map((step, stepIndex) => {
      const script = scriptForEventName(
        data,
        step.eventName,
        events,
        rooms,
        dialogues,
        audioItems,
        audioPack
      );
      const onSkip = scriptForEventName(
        data,
        step.onSkipEventName,
        events,
        rooms,
        dialogues,
        audioItems,
        audioPack
      );
      const hasBranch = step.branchVariable >= 0
        && (step.branchTargetSceneIndex >= 0 || step.branchTargetStepIndex >= 0);
      return {
        line: dialogueIndexByKey(dialogues, step.dialogueKey),
        duration_frames: step.durationFrames,
        auto_advance: step.autoAdvance,
        background: narrativeBackgroundIndexForAssetName(step.backgroundAssetName, tilesetPack, backgroundAssetNames),
        ...(step.backgroundAssetName ? {
          resource_bank_group: engineCutsceneStepResourceBankGroupName(room, index, stepIndex)
        } : {}),
        skippable: step.skippable,
        wait_for_dialogue: step.waitForDialogue,
        target_scene: step.targetSceneIndex,
        ...(script && script.length > 0 ? { script } : {}),
        ...(onSkip && onSkip.length > 0 ? { on_skip: onSkip } : {}),
        ...(hasBranch ? { branch: {
          variable: step.branchVariable,
          value: step.branchValue,
          target_scene: step.branchTargetSceneIndex,
          target_step: step.branchTargetStepIndex
        } } : {}),
        ...(step.actorMotions && step.actorMotions.length > 0 ? {
          actor_motions: step.actorMotions.map((motion) => ({
            actor_index: motion.actorIndex,
            from_position: motion.fromPosition,
            to_position: motion.toPosition,
            duration_frames: motion.durationFrames
          }))
        } : {})
      };
    });
    if (explicitSteps.length > 0) {
      return {
        name: roomName(room, index),
        resource_bank_group: engineSceneResourceBankGroupName(room, index),
        background,
        next_scene: (sceneConfig?.nextSceneIndex ?? -1) >= 0 ? sceneConfig!.nextSceneIndex : index + 1 < rooms.length ? index + 1 : -1,
        ...(actors.length > 0 ? { actors } : {}),
        steps: explicitSteps,
        ...(onEnter.length > 0 ? { on_enter: onEnter } : {})
      };
    }

    const steps: EngineExportCutsceneStep[] = [];
    for (const command of onEnter) {
      if (command.op === "show_dialogue" && typeof command.dialogue === "number") {
        steps.push({
          line: command.dialogue,
          duration_frames: sceneConfig?.stepDurationFrames ?? 8,
          auto_advance: sceneConfig?.autoAdvance ?? true
        });
        continue;
      }
      if (steps.length === 0) {
        steps.push({
          line: -1,
          duration_frames: 0,
          auto_advance: sceneConfig?.autoAdvance ?? false,
          script: [command]
        });
      } else {
        const last = steps[steps.length - 1]!;
        last.script = [...(last.script ?? []), command];
      }
    }

    if (steps.length === 0) {
      steps.push({
        line: dialogues.length > 0 ? Math.min(index, dialogues.length - 1) : -1,
        duration_frames: sceneConfig?.stepDurationFrames ?? 8,
        auto_advance: sceneConfig?.autoAdvance ?? true
      });
    }

    return {
      name: roomName(room, index),
      resource_bank_group: engineSceneResourceBankGroupName(room, index),
      background,
      next_scene: (sceneConfig?.nextSceneIndex ?? -1) >= 0 ? sceneConfig!.nextSceneIndex : index + 1 < rooms.length ? index + 1 : -1,
      ...(actors.length > 0 ? { actors } : {}),
      steps
    };
  });
}

function buildCutsceneProject(
  data: GBAProjectData,
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()
): EngineExportCutsceneProject {
  const rooms = exportRoomsForKind(data, "cutscene");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const spritePack = buildAssetcSpritePackGeneration(data);
  const portraitPack = buildAssetcPortraitPackGeneration(data, spritePack);
  const portraitAssets = buildDialoguePortraitAssetsExport(data, portraitPack, spritePack);
  const tilesetPack = buildAssetcTilesetPackGeneration(data);
  const events = projectArray(data, "events");
  const availableBackgrounds = regularTilesetAssetNames(tilesetPack).map((assetName) => ({
    name: assetName,
    layer: "bg1",
    tilemap: assetName,
    backdrop_color: 0
  })) ?? [];
  const availableBackgroundAssetNames = availableBackgrounds.map((background) => background.name);
  const scripts = buildTopdownScripts(data, events, rooms, dialogues, audioItems, audioPack, pluginRegistry);
  const narrative = selectNarrativeBackgrounds(
    availableBackgrounds,
    buildCutsceneScenes(
      data,
      rooms,
      dialogues,
      events,
      audioItems,
      audioPack,
      spritePack,
      tilesetPack,
      availableBackgroundAssetNames
    ),
    scripts.flatMap(script => script.script)
  );
  const spriteAssetNames = spritePack
    ? Array.from(new Set(narrative.scenes.flatMap((scene) =>
      (scene.actors ?? []).map((actor) => actor.metasprite.asset)
    ))).filter((assetName) => spritePack.assetNames.includes(assetName))
    : [];
  const assetRefs = {
    ...(narrative.assetNames.length > 0
      ? { bg_palettes: narrative.assetNames, tile_assets: narrative.assetNames }
      : {}),
    ...(spriteAssetNames.length > 0
      ? {
          obj_palettes: spriteAssetNames,
          tile_assets: Array.from(new Set([
            ...(narrative.assetNames.length > 0 ? narrative.assetNames : []),
            ...spriteAssetNames
          ]))
        }
      : {}),
    ...buildAudioPackAssetRefs(audioPack)
  };
  if (portraitPack) {
    assetRefs.obj_palettes = Array.from(new Set([
      ...(assetRefs.obj_palettes ?? []),
      ...portraitPack.assetNames
    ]));
    assetRefs.tile_assets = Array.from(new Set([
      ...(assetRefs.tile_assets ?? []),
      ...portraitPack.assetNames
    ]));
  }

  return {
    initial_scene: startRoomIndex(data, rooms),
    ...((tilesetPack || spritePack || portraitPack) ? { resource_banks: "asset_pack" as const } : {}),
    save: buildProjectSaveConfig(data),
    scenes: narrative.scenes,
    dialogue_lines: buildDialogueLines(data, dialogues, audioItems, audioPack),
    dialogue_ui: buildEngineDialogueUiConfigForExport(data),
    ...(portraitAssets.length > 0 ? { portrait_assets: portraitAssets } : {}),
    ...(narrative.backgrounds.length > 0 ? { backgrounds: narrative.backgrounds } : {}),
    scripts: remapBackgroundCommands(scripts, new Map(narrative.assetNames.map((name, index) => [availableBackgroundAssetNames.indexOf(name), index]))),
    ...(Object.keys(assetRefs).length > 0 ? { assets: assetRefs } : {})
  };
}

function worldMapNodePosition(index: number): { x: number; y: number } {
  const column = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: 32 + column * 64,
    y: 48 + row * 48
  };
}

function buildWorldMapNodes(
  data: GBAProjectData,
  rooms: Record<string, unknown>[],
  dialogues: Record<string, unknown>[],
  events: Record<string, unknown>[],
  audioItems: Record<string, unknown>[],
  audioPack: AssetcAudioPackGeneration | null
): EngineExportWorldMapNode[] {
  const connectionsRaw = child(data, "editorState")?.scenaConnections;
  const connections = Array.isArray(connectionsRaw)
    ? connectionsRaw.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];

  return rooms.flatMap((room, index) => {
    const name = roomName(room, index);
    const nodeConfig = worldMapSceneConfigFromRuntime(room.runtime, data.settings);
    if (nodeConfig?.nodes?.length) {
      return nodeConfig.nodes.map((embeddedNode, nodeIndex) => {
        const explicitOnSelect = scriptForEventName(
          data,
          embeddedNode.eventName,
          events,
          rooms,
          dialogues,
          audioItems,
          audioPack
        );
        const onSelect = explicitOnSelect;
        const dialogueLine = embeddedNode.dialogueKey
          ? dialogues.findIndex((dialogue) => stringField(dialogue, "key", "") === embeddedNode.dialogueKey)
          : -1;
        const node: EngineExportWorldMapNode = {
          name: embeddedNode.id,
          label: embeddedNode.name,
          position: { x: embeddedNode.x, y: embeddedNode.y },
          resource_bank_group: engineSceneResourceBankGroupName(room, index),
          line: dialogueLine,
          connections: embeddedNode.connections,
          target_level: embeddedNode.targetLevel >= 0 ? embeddedNode.targetLevel : nodeIndex,
          unlocked: embeddedNode.unlocked,
          required_variable: embeddedNode.requiredVariable,
          required_value: embeddedNode.requiredValue,
          hide_when_locked: embeddedNode.hideWhenLocked
        };
        if (onSelect?.length) node.on_select = onSelect;
        return node;
      });
    }
    const outgoing = connections.filter((connection) => stringField(connection, "from", "") === name);
    const incoming = connections.filter((connection) => stringField(connection, "to", "") === name);
    const linkedNames = Array.from(new Set([
      ...outgoing.map((connection) => stringField(connection, "to", "")),
      ...incoming.map((connection) => stringField(connection, "from", ""))
    ].filter(Boolean)));

    const eventBindings = child(room, "eventBindings");
    const onInit = scriptForEventName(
      data,
      nullableStringField(eventBindings, "onInit"),
      events,
      rooms,
      dialogues,
      audioItems,
      audioPack
    );
    const connectionEvent = outgoing
      .map((connection) => nullableStringField(connection, "eventName"))
      .find((eventName) => Boolean(eventName));
    const onSelect = onInit
      ?? scriptForEventName(data, connectionEvent ?? "", events, rooms, dialogues, audioItems, audioPack);

    let line = dialogues.length > 0 ? Math.min(index, dialogues.length - 1) : -1;
    if (onSelect) {
      for (const command of onSelect) {
        if (command.op === "show_dialogue" && typeof command.dialogue === "number") {
          line = command.dialogue;
          break;
        }
      }
    }

    const node: EngineExportWorldMapNode = {
      name,
      position: worldMapNodePosition(index),
      resource_bank_group: engineSceneResourceBankGroupName(room, index),
      line,
      connections: linkedNames,
      target_level: index
    };
    if (nodeConfig) {
      node.unlocked = nodeConfig.unlocked;
      node.required_variable = nodeConfig.requiredVariable;
      node.required_value = nodeConfig.requiredValue;
      node.hide_when_locked = nodeConfig.hideWhenLocked;
      node.target_level = nodeConfig.targetLevel >= 0 ? nodeConfig.targetLevel : index;
    }
    if (onSelect && onSelect.length > 0) {
      node.on_select = onSelect;
    }
    return node;
  });
}

function buildWorldMapProject(
  data: GBAProjectData,
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()
): EngineExportWorldMapProject {
  const rooms = exportRoomsForKind(data, "world_map");
  const dialogues = projectArray(data, "dialogues");
  const audioItems = projectArray(data, "audioItems");
  const audioPack = buildAssetcAudioPackGeneration(data);
  const spritePack = buildAssetcSpritePackGeneration(data);
  const tilesetPack = buildAssetcTilesetPackGeneration(data);
  const visual = advancedRuntimeBackgrounds(rooms, tilesetPack);
  const events = projectArray(data, "events");
  const roomNames = new Set(rooms.map(roomName));
  const actors = projectArray(data, "actors")
    .filter((actor) => roomNames.has(entitySceneName(actor, "actor")))
    .flatMap((actor) => {
      const sprite = buildActorEngineSpriteExport(data, actor, spritePack);
      return sprite ? [{ actor, sprite }] : [];
    });
  const cursorEntry = actors.find(({ actor }) => stringField(actor, "worldMapRole", "") === "cursor")
    ?? actors.find(({ actor }) => /cursor|planador|airship/i.test(stringField(actor, "name", "")))
    ?? actors[0];
  const markerEntry = actors.find(({ actor }) => stringField(actor, "worldMapRole", "") === "marker")
    ?? actors.find(({ actor }) => /marker|farol|lighthouse|prop/i.test(stringField(actor, "name", "")))
    ?? actors.find((entry) => entry !== cursorEntry);
  const spriteAssetNames = Array.from(new Set(actors.map(({ sprite }) => sprite.metasprite.asset)));
  const assetSection = advancedRuntimeAssetSection(
    visual.backgrounds.map((background) => background.tilemap),
    spriteAssetNames,
    audioPack
  );

  const nodes = buildWorldMapNodes(data, rooms, dialogues, events, audioItems, audioPack);
  const pagedNames = new Set((tilesetPack?.packAssets ?? []).filter(asset => asset.kind === "paged_bg").map(asset => asset.name));
  if (assetSection?.tile_assets) assetSection.tile_assets = assetSection.tile_assets.filter(name => !pagedNames.has(name));
  const scene = rooms[0];
  const onEnter = scriptForEventName(data, nullableStringField(child(scene, "eventBindings"), "onInit"), events, rooms, dialogues, audioItems, audioPack);
  const startScreen = startMenuScreenIndex(data);
  return {
    initial_node: startRoomIndex(data, rooms),
    scene_name: roomName(scene, 0),
    on_enter: onEnter ?? [],
    on_cancel: nodes[0]?.on_select ?? [],
    on_start: startScreen >= 0 ? [
      { op: "scene_stack_push", runtime: "world_map" },
      { op: "warp_runtime", runtime: "menu", room: startScreen, x: 0, y: 0 }
    ] : [],
    journey_frames: 120,
    cursor_affine: Boolean(cursorEntry) && worldMapSceneConfigFromRuntime(child(scene, "runtime"), child(data, "settings"))?.cursorAffine === true,
    embedded_nodes: rooms.length === 1 && (worldMapSceneConfigFromRuntime(child(scene, "runtime"), child(data, "settings"))?.nodes?.length ?? 0) > 0,
    save: buildProjectSaveConfig(data),
    nodes,
    dialogue_lines: buildDialogueLines(data, dialogues, audioItems, audioPack),
    dialogue_ui: buildEngineDialogueUiConfigForExport(data),
    scripts: buildTopdownScripts(data, events, rooms, dialogues, audioItems, audioPack, pluginRegistry),
    ...((tilesetPack || spritePack) ? { resource_banks: "asset_pack" as const } : {}),
    ...(visual.backgrounds.length > 0 ? { background: 0, backgrounds: visual.backgrounds.map(background => ({ ...background, ...(pagedNames.has(background.tilemap) ? { source_tiles: background.tilemap } : {}) })) } : {}),
    ...(cursorEntry ? { cursor: { metasprite: cursorEntry.sprite.metasprite } } : {}),
    ...(markerEntry ? { marker: { metasprite: markerEntry.sprite.metasprite } } : {}),
    ...(assetSection ? {
      assets: {
        ...assetSection,
        ...(spriteAssetNames.length > 0 ? { sprite_assets: spriteAssetNames } : {})
      }
    } : {})
  };
}

function enginePackPath(data: GBAProjectData, options: BuildEngineExportProjectContractOptions): string {
  return options.enginePackPath ?? stringField(child(settings(data), "build"), "enginePackPath", "/opt/GBAStudioEnginePack");
}

function exportableAssets(data: GBAProjectData): EngineProjectExportAsset[] {
  return projectArray(data, "assets").flatMap((asset, index) => {
    const document = normalizeGBAAssetDocument(asset, index);
    if (!document.source) return [];
    const parsedName = document.name.replace(/\.[a-z0-9]+$/i, "");
    const extension = document.name.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? "";
    const metadata = child(asset, "metadata");
    if (metadata?.sourceOnly === true) return [];
    return [{
      id: document.id,
      name: document.name,
      kind: document.kind,
      source: document.source,
      ...(nullableStringField(metadata, "bundledDefaultAsset")
        ? { bundledDefaultAsset: nullableStringField(metadata, "bundledDefaultAsset") }
        : {}),
      output: `assets/${assetOutputFolder(metadata?.runtimeConsumer === "hud-obj" ? "Sprite" : document.kind)}/${normalizeIdentifier(parsedName, `asset_${index + 1}`)}${extension}`
    }];
  });
}

function buildVideoAssetPackEntry(
  data: GBAProjectData,
  copiedAssets: EngineProjectExportAsset[]
): EngineExportAssetPack["assets"][number] | null {
  const composition = exportAdvancedVideoComposition(deriveAdvancedVideoComposition(child(settings(data), "backgrounds")));
  const sourceAsset = composition.bitmap?.asset ?? composition.affine?.asset;
  if (!sourceAsset) return null;
  const copied = copiedAssets.find((asset) =>
    asset.id === sourceAsset ||
    asset.name === sourceAsset ||
    asset.source === sourceAsset ||
    path.basename(asset.source) === path.basename(sourceAsset)
  );
  if (!copied) return null;
  const bitmapMode = composition.bitmap ? composition.display_mode : null;
  const symbol = composition.bitmap ? videoBitmapSymbol(sourceAsset) : videoAffineSymbol(sourceAsset);
  return {
    id: symbol,
    name: symbol,
    kind: bitmapMode === null ? "affine_bg" : `bitmap${bitmapMode}` as "bitmap3" | "bitmap4" | "bitmap5",
    png: copied.output,
    header: `${symbol}.hpp`,
    symbol
  };
}

function buildSceneCompositionBitmapAssetPackEntries(
  data: GBAProjectData,
  copiedAssets: EngineProjectExportAsset[]
): EngineExportAssetPack["assets"] {
  const entries = new Map<string, EngineExportAssetPack["assets"][number]>();
  projectRooms(data).forEach((room) => {
    const composition = roomSceneComposition(room);
    if (!composition.enabled) return;
    const mode = sceneCompositionVideoMode(composition);
    if (![3, 4, 5].includes(mode)) return;
    composition.layers
      .filter((layer) => layer.enabled && layer.kind === "bitmap" && layer.assetId)
      .forEach((layer) => {
        const copied = copiedAssets.find((asset) => (
          asset.id === layer.assetId || asset.name === layer.assetId || asset.source === layer.assetId || path.basename(asset.source) === path.basename(layer.assetId)
        ));
        if (!copied) return;
        const sourceName = path.basename(copied.name);
        const symbol = videoBitmapSymbol(sourceName);
        if (entries.has(symbol)) return;
        entries.set(symbol, {
          id: symbol,
          name: symbol,
          kind: `bitmap${mode}` as "bitmap3" | "bitmap4" | "bitmap5",
          png: copied.output,
          header: `${symbol}.hpp`,
          symbol
        });
      });
  });
  return Array.from(entries.values());
}

/**
 * Resolves dialogue_ui.box_image (a project asset name) to the export-relative
 * PNG path assetc can read directly (mirrors exportableAssets' output path),
 * so the engine's 9-slice dialogue box skin can replace the procedural tiles.
 * Leaves dialogue_ui unchanged when box_image does not reference an existing asset.
 */
function resolveDialogueUiBoxSkin(
  data: GBAProjectData,
  dialogueUi: EngineDialogueUiConfig
): EngineDialogueUiConfig {
  const boxImage = dialogueUi.box_image;
  if (!boxImage) return dialogueUi;
  const asset = projectArray(data, "assets").find((candidate) => stringField(candidate, "name", "") === boxImage);
  if (!asset) return dialogueUi;
  const metadata = child(asset, "metadata");
  const source = nullableStringField(metadata, "source") || nullableStringField(asset, "relativePath") || nullableStringField(asset, "source");
  if (!source) return dialogueUi;
  const kind = stringField(asset, "kind", "Unknown");
  const parsedName = boxImage.replace(/\.[a-z0-9]+$/i, "");
  const extension = boxImage.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? "";
  const boxSkin = `assets/${assetOutputFolder(kind)}/${normalizeIdentifier(parsedName, "dialogue_box")}${extension}`;
  return { ...dialogueUi, box_skin: boxSkin };
}

function resolveDialogueUiSelectorSkin(
  data: GBAProjectData,
  dialogueUi: EngineDialogueUiConfig
): EngineDialogueUiConfig {
  const selectorImage = dialogueUi.selector_image;
  if (!selectorImage) return dialogueUi;
  const asset = projectArray(data, "assets").find((candidate) => stringField(candidate, "name", "") === selectorImage);
  if (!asset) return dialogueUi;
  const metadata = child(asset, "metadata");
  const source = nullableStringField(metadata, "source") || nullableStringField(asset, "relativePath") || nullableStringField(asset, "source");
  if (!source) return dialogueUi;
  const kind = stringField(asset, "kind", "UI");
  const parsedName = selectorImage.replace(/\.[a-z0-9]+$/i, "");
  const extension = selectorImage.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? "";
  return {
    ...dialogueUi,
    selector_skin: `assets/${assetOutputFolder(kind)}/${normalizeIdentifier(parsedName, "dialogue_selector")}${extension}`
  };
}

function resolveHudUiSkin(
  data: GBAProjectData,
  dialogueUi: EngineDialogueUiConfig
): EngineDialogueUiConfig {
  const hudImage = dialogueUi.hud_image;
  if (!hudImage) return dialogueUi;
  const asset = projectArray(data, "assets").find((candidate) => stringField(candidate, "name", "") === hudImage);
  if (!asset) return dialogueUi;
  const metadata = child(asset, "metadata");
  const source = nullableStringField(metadata, "source") || nullableStringField(asset, "relativePath") || nullableStringField(asset, "source");
  if (!source) return dialogueUi;
  const kind = stringField(asset, "kind", "UI");
  const parsedName = hudImage.replace(/\.[a-z0-9]+$/i, "");
  const extension = hudImage.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? "";
  return {
    ...dialogueUi,
    hud_skin: `assets/${assetOutputFolder(kind)}/${normalizeIdentifier(parsedName, "hud_box")}${extension}`
  };
}

function resolveDialogueFontAsset(
  data: GBAProjectData,
  font: string | undefined
): Pick<EngineDialogueUiConfig, "font_image"> {
  if (!font) return {};
  const asset = projectArray(data, "assets").find((candidate) => stringField(candidate, "name", "") === font);
  if (!asset) return {};
  const metadata = child(asset, "metadata");
  const source = nullableStringField(metadata, "source") || nullableStringField(asset, "relativePath") || nullableStringField(asset, "source");
  if (!source) return {};
  const kind = stringField(asset, "kind", "Font");
  const parsedName = font.replace(/\.[a-z0-9]+$/i, "");
  const extension = font.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? "";
  return {
    font_image: `assets/${assetOutputFolder(kind)}/${normalizeIdentifier(parsedName, "dialogue_font")}${extension}`
  };
}

function buildEngineDialogueUiConfigForExport(data: GBAProjectData): EngineDialogueUiConfig {
  const hudPresentation = deriveHudPresetsWorkspacePresentation(data);
  const hudIconSpritePack = buildAssetcSpritePackGeneration(data);
  const activeHud = hudPresentation.activePreset;
  const projectTheme = resolveInterfaceTheme(data).theme;
  const baseDialogueUi = buildEngineDialogueUiConfig({ ...child(settings(data), "uiDialogs"), ...(projectTheme?.boxImage ? { boxImage: projectTheme.boxImage } : {}) });
  const withHud = {
    ...baseDialogueUi,
    hud_position: activeHud.position,
    hud_width: activeHud.width,
    hud_height: activeHud.height,
    ...(activeHud.backgroundImage || projectTheme?.hudImage ? { hud_image: activeHud.backgroundImage || projectTheme?.hudImage } : {}),
    ...(activeHud.font ? { font: activeHud.font } : {})
  };
  const dialogueUi = resolveHudUiSkin(data, resolveDialogueUiSelectorSkin(
    data,
    resolveDialogueUiBoxSkin(data, withHud)
  ));
  const projectSettings = settings(data) ?? {};
  const hudPresets = hudPresentation.presets.map((preset) => {
    const presetUi = resolveHudUiSkin(data, {
      ...baseDialogueUi,
      hud_position: preset.position,
      hud_width: preset.width,
      hud_height: preset.height,
      ...(preset.backgroundImage ? { hud_image: preset.backgroundImage } : {})
    });
    return {
      id: preset.id,
      ...(presetUi.hud_image ? { hud_image: presetUi.hud_image } : {}),
      ...(presetUi.hud_skin ? { hud_skin: presetUi.hud_skin } : {}),
      ...resolveDialogueFontAsset(data, preset.font),
      hud_position: preset.position,
      hud_width: preset.width,
      hud_height: preset.height
    };
  });
  const normalizeHudComponentAsset = (asset: string): string => (
    hudIconSpritePack?.assetsBySheet[asset]?.name ?? asset
  );
  const hudSceneBindingMap = new Map<string, string>();
  const sceneSkins = new Map<string, { scene_name: string; box_skin?: string; hud_skin?: string }>();
  const addSceneSkin = (sceneName: string, room: Record<string, unknown>, request: { scenePresetId?: unknown; roomPresetId?: unknown } = {}): void => {
    const roomID = stringField(room, "id", stringField(room, "name", ""));
    const resolved = resolveInterfaceTheme(data, roomID);
    if (resolved.missing) throw new Error(`Tema de moldura ausente em ${sceneName}: ${resolved.themeId}`);
    if (!resolved.theme) return;
    for (const name of [resolved.theme.boxImage, resolved.theme.hudImage].filter(Boolean)) {
      if (!interfaceSkinAssets(data).some(asset => asset.name === name)) throw new Error(`Moldura ${name} em ${sceneName}: selecione um asset de skin 24×24 válido.`);
    }
    const binding = resolveExplicitHudPresetBinding(data, { ...request, roomID });
    const boxImage = resolveSceneDialogueUiSettings(data, roomID).boxImage;
    const hudImage = binding?.preset.backgroundImage || resolved.theme.hudImage;
    const ui = resolveHudUiSkin(data, resolveDialogueUiBoxSkin(data, { ...baseDialogueUi, box_image: boxImage, hud_image: hudImage }));
    if ((resolved.theme.boxImage && !ui.box_skin) || (resolved.theme.hudImage && !ui.hud_skin)) throw new Error(`Moldura sem arquivo de skin em ${sceneName}.`);
    sceneSkins.set(sceneName, { scene_name: sceneName, ...(ui.box_skin ? { box_skin: ui.box_skin } : {}), ...(ui.hud_skin ? { hud_skin: ui.hud_skin } : {}) });
  };
  const addHudSceneBinding = (
    sceneName: string,
    request: { scenePresetId?: unknown; roomPresetId?: unknown }
  ): void => {
    const binding = resolveExplicitHudPresetBinding(data, request);
    if (binding) hudSceneBindingMap.set(sceneName, binding.presetId);
  };
  projectRooms(data).forEach((room, index) => {
    const sceneName = roomName(room, index);
    const sceneType = roomSceneType(room);
    addSceneSkin(sceneName, room, { roomPresetId: room.hudPresetId });
    if (sceneType !== "menu") {
      addHudSceneBinding(sceneName, { roomPresetId: room.hudPresetId });
    }
    if (sceneType === "worldMap") {
      const worldMapConfig = worldMapSceneConfigFromRuntime(child(room, "runtime"), projectSettings);
      for (const node of worldMapConfig?.nodes ?? []) {
        if (!node.id.trim()) continue;
        addHudSceneBinding(node.id, { roomPresetId: room.hudPresetId });
        addSceneSkin(node.id, room, { roomPresetId: room.hudPresetId });
      }
    }
  });
  for (const source of menuScreenSources(exportRoomsForKind(data, "menu"))) {
    addSceneSkin(source.name, source.room, { scenePresetId: source.config?.hudPresetId, roomPresetId: source.room.hudPresetId });
    if (source.config?.hudMode === "none") continue;
    addHudSceneBinding(source.name, {
      scenePresetId: source.config?.hudPresetId,
      roomPresetId: stringField(source.room, "hudPresetId", "")
    });
  }
  const hudSceneBindings = Array.from(hudSceneBindingMap, ([scene_name, preset_id]) => ({ scene_name, preset_id }));
  const hudVariableKeys = Array.from(new Set(projectVariableKeys(data)));
  const hudVariableIndex = (key: string): number => {
    const index = hudVariableKeys.indexOf(key);
    if (index < 0 || index >= EVENT_VARIABLE_CAPACITY) throw new Error(`Variável da HUD não encontrada ou fora do limite: ${key}`);
    return index;
  };
  const usedHudPresetIDs = engineUsedHudPresetIDs(data);
  const dialogueUiWithHudPresets = {
    ...dialogueUi,
    ...(sceneSkins.size ? { scene_skins: [...sceneSkins.values()] } : {}),
    ...(Array.isArray(projectSettings.hudPresets) || hudSceneBindings.length > 0
      ? { hud_presets: hudPresets }
      : {}),
    ...(hudSceneBindings.length > 0 ? { hud_scene_bindings: hudSceneBindings } : {}),
    ...(hudPresentation.activePreset.mode === "advanced" && usedHudPresetIDs.has(hudPresentation.activePreset.id)
      ? { hud_active_layout_id: hudPresentation.activePreset.id }
      : {}),
    hud_layouts: hudPresentation.presets.filter(preset => usedHudPresetIDs.has(preset.id)).map((preset) => ({
      id: preset.id,
      mode: preset.mode,
      components: preset.components.map((component) => ({
        id: component.id,
        kind: component.kind,
        label: component.label,
        text: component.runtimeText ? "" : component.text,
        ...(component.valueBinding ? {value_binding:component.valueBinding} : {}),
        ...(component.stateAssets ? {state_assets:component.stateAssets.map(normalizeHudComponentAsset)} : {}),
        ...(component.gauge ? {gauge:{empty_asset:normalizeHudComponentAsset(component.gauge.emptyAsset),x:component.gauge.x,y:component.gauge.y,width:component.gauge.width,height:component.gauge.height,reverse:component.gauge.reverse === true}} : {}),
        asset: normalizeHudComponentAsset(component.asset),
        x: component.x,
        y: component.y,
        width: component.width,
        height: component.height,
        z_index: component.zIndex,
        visible: component.visible,
        ...(component.behavior ? { behavior: {
          states: Object.fromEntries(Object.entries(component.behavior.states).map(([name,condition]) => [name, {...condition,variable:hudVariableIndex(condition.variable)}])),
          events: component.behavior.events.map(event => ({trigger:event.trigger,...(event.watchVariable?{watch_variable:hudVariableIndex(event.watchVariable)}:{}),actions:event.actions.map(action=>({...action,variable:hudVariableIndex(action.variable)}))}))
        }} : {})
      }))
    }))
  };
  return {
    ...dialogueUiWithHudPresets,
    ...resolveDialogueFontAsset(data, dialogueUiWithHudPresets.font)
  };
}

export function buildEngineExportProjectContract(
  data: GBAProjectData,
  options: BuildEngineExportProjectContractOptions = {}
): EngineExportProjectContract {
  if (options.developmentStartScene) {
    const { developmentStartScene, ...regularOptions } = options;
    return buildEngineExportProjectContract(
      projectDataWithDevelopmentStartScene(data, developmentStartScene),
      regularOptions
    );
  }

  const entityEventProjectionWarnings = validateGBAEntityEventProjection(data)
    .map(formatGBAEntityEventProjectionIssue);
  const advancedTools = projectWithCompiledAdvancedTools(data);
  data = projectWithIndependentTacticalResidency(advancedTools.data);

  const contractIssues = validateGBAProjectMigrationContract(data);
  if (contractIssues.length > 0) {
    const validators = Array.from(new Set(contractIssues.map((issue) => issue.validator))).join(", ");
    throw new Error(`Contrato de migracao invalido: ${validators}`);
  }
  const hardwareContract = buildGbaHardwareContract(data);

  const pluginRegistry = options.pluginRegistry ?? emptyProjectPluginRegistry();
  const target = projectTarget(data);
  const selectedEnginePackPath = enginePackPath(data, options);
  const enginePackVersion = options.enginePackVersion ?? defaultEnginePackVersion;
  const assets = exportableAssets(data);
  const rooms = projectRooms(data);
  const resolution = resolveSceneRuntimeExport(startRoomSceneType(data, rooms));
  const selectedKind = resolution.kind;
  const isMixedRuntime = usesMixedRuntimeDispatcher(rooms);
  const mixedRuntimeKinds = mixedRuntimeKindsForRooms(rooms);
  const kind: EngineExportProjectContract["kind"] = isMixedRuntime ? "mixed" : selectedKind;
  assertSingleRomRuntimeTransitions(data, rooms, selectedKind);
  const isPlatformer = !isMixedRuntime && kind === "platformer";
  const isIsometric = !isMixedRuntime && kind === "isometric";
  const isDungeonCrawler = kind === "dungeon_crawler";
  const isRacing = kind === "racing";
  const isBattleRpg = kind === "battle_rpg";
  const isLuta = kind === "luta";
  const isPointClick = kind === "point_click";
  const isShmup = kind === "shmup";
  const isVisualNovel = kind === "visual_novel";
  const isMenu = kind === "menu";
  const isCutscene = kind === "cutscene";
  const isWorldMap = kind === "world_map";
  const usesPseudo3dRacing = exportRoomsForKind(data, "racing").some((room) => (
    racingSceneConfigFromRuntime(room.runtime, data.settings)?.presentation === "pseudo3d"
  ));
  const audioPack = buildAssetcAudioPackGeneration(data);
  const palettePack = buildAssetcPaletteFamilyPackGeneration(data);
  const runtimeContract = buildRuntimeContract(data, isMixedRuntime);
  const projectSaveConfig = buildProjectSaveConfig(data);
  const runtimeCapabilities = buildProjectRuntimeCapabilityManifest(data, projectSaveConfig);
  const capabilityManifest = buildSceneCapabilityManifest(data);
  assertAdvancedCapabilityUsage(data, capabilityManifest, pluginRegistry, runtimeCapabilities);
  const sceneContracts = buildSceneContracts(data);
  const projectData: EngineExportProjectContract["project_data"] = isMixedRuntime
    ? "mixed_project_data.hpp"
    : resolution.projectData;
  const features = isMixedRuntime
    ? [
        "runtime_dispatch.mixed",
        "engine_sdk.project_runtime_contract",
        "runtime_dispatch.scene_registry",
        "events.warp_runtime",
        ...mixedRuntimeKinds.map((runtime) => `${runtime}_runtime`),
        ...(mixedRuntimeKinds.includes("platformer") ? [
          "platformer_runtime.player_metasprite",
          "platformer_runtime.player_animations"
        ] : []),
        ...(mixedRuntimeKinds.includes("racing") ? [
          "racing_runtime.vehicle_physics",
          "racing_runtime.track_collision",
          "racing_runtime.topdown_track",
          "racing_runtime.topdown_checkpoints",
          "racing_runtime.surface_speed_limits",
          "racing_runtime.camera_dead_zone",
          "racing_runtime.rival_race_progression",
          "racing_runtime.checkpoint_pickup_progression",
          "racing_runtime.result_events"
        ] : []),
        ...(usesPseudo3dRacing ? [
          "racing_runtime.pseudo3d_perspective",
          "racing_runtime.pseudo3d_scanline_road",
          "racing_runtime.minimap_hud",
        ] : []),
        ...(mixedRuntimeKinds.includes("menu") ? [
          "engine_sdk.menu_project_data_contract",
          "menu_logo_title_screens",
          "menu_click_boxes",
          "menu_checked_values"
        ] : [])
      ]
    : isPlatformer
    ? [
        "platformer_runtime",
        "engine_sdk.platformer_project_data_contract",
        "platformer_runtime.platformer_basic_template",
        "platformer_runtime.player_metasprite",
        "platformer_runtime.player_animations"
      ]
    : isIsometric
      ? [
          "isometric_runtime",
          "engine_sdk.isometric_project_data_contract",
          "isometric_runtime.iso_tilemap_collision",
          "dialogue.visual_box",
          "events.progressive_event_runner"
        ]
      : isDungeonCrawler
        ? [
            "dungeon_crawler_runtime",
            "engine_sdk.dungeon_crawler_project_data_contract",
            "dungeon_crawler_runtime.grid_movement",
            "dungeon_crawler_runtime.first_person_view"
          ]
      : isRacing
        ? [
            "racing_runtime",
            "engine_sdk.racing_project_data_contract",
            "racing_runtime.vehicle_physics",
            "racing_runtime.track_collision",
            "racing_runtime.topdown_track",
            "racing_runtime.topdown_checkpoints",
            "racing_runtime.surface_speed_limits",
            "racing_runtime.camera_dead_zone",
            "racing_runtime.rival_race_progression",
            "racing_runtime.checkpoint_pickup_progression",
            "racing_runtime.result_events",
            ...(usesPseudo3dRacing ? [
              "racing_runtime.pseudo3d_perspective",
              "racing_runtime.pseudo3d_scanline_road",
              "racing_runtime.minimap_hud",
            ] : [])
          ]
      : isBattleRpg
        ? [
            "battle_rpg_runtime",
            "engine_sdk.battle_rpg_project_data_contract",
            "battle_rpg_runtime.turn_progression",
            "battle_rpg_runtime.target_selection"
          ]
      : isPointClick
        ? [
            "point_click_runtime",
            "engine_sdk.point_click_project_data_contract",
            "dialogue.visual_box",
            "events.interaction"
          ]
        : isShmup
          ? [
              "shmup_runtime",
              "engine_sdk.shmup_project_data_contract",
              "events.interaction"
            ]
          : isVisualNovel
            ? [
                "visual_novel_runtime",
                "engine_sdk.visual_novel_project_data_contract",
                "dialogue.visual_box",
                "events.choice_groups"
              ]
            : isMenu
              ? [
                  "menu_runtime",
                  "engine_sdk.menu_project_data_contract",
                  "menu_logo_title_screens",
                  "menu_click_boxes",
                  "menu_checked_values",
                  "dialogue.visual_box",
                  "ui.menu_selection",
                  "events.interaction"
                ]
              : isCutscene
                ? [
                    "cutscene_runtime",
                    "engine_sdk.cutscene_project_data_contract",
                    "dialogue.visual_box",
                    "events.progressive_event_runner"
                  ]
                : isWorldMap
                  ? [
                      "world_map_runtime",
                      "engine_sdk.world_map_project_data_contract",
                      "dialogue.visual_box",
                      "events.interaction"
                    ]
                  : [
                      "topdown_project_data",
                      "dialogue.visual_box",
                      "events.progressive_event_runner"
                    ];
  const cameraZoneFeatures = new Set<string>();
  rooms.forEach((room) => {
    if (!Array.isArray(room.cameraZones) || room.cameraZones.length === 0) return;
    const runtimeKind = resolveSceneRuntimeExport(roomSceneType(room)).kind;
    if (runtimeKind === "topdown") cameraZoneFeatures.add("topdown_runtime.camera_zones");
    if (runtimeKind === "isometric") cameraZoneFeatures.add("isometric_runtime.camera_zones");
    if (runtimeKind === "platformer") cameraZoneFeatures.add("platformer_runtime.platformer_camera_zones");
  });
  features.push(...cameraZoneFeatures);
  if (audioPack?.document.tracker.some(tracker => tracker.samples?.length)) features.push("audio.tracker_sample_instruments");
  const hasTacticalIsometricRoom = rooms.some((room) => (
    resolveSceneRuntimeExport(roomSceneType(room)).kind === "isometric" &&
    isometricSceneConfigFromRuntime(room.runtime, data.settings)?.gameplayMode === "tactical"
  ));
  if (hasTacticalIsometricRoom) {
    features.push("isometric_runtime.tactical_core");
  }
  const enabledCapabilityFeatures = new Set(
    capabilityManifest.scenes.flatMap((scene) => scene.capabilities
      .filter((capability) => capability.status.enabled)
      .flatMap((capability) => capability.engine_features))
  );
  features.push(...enabledCapabilityFeatures);
  features.push(...runtimeCapabilities.capabilities
    .filter((capability) => capability.enabled)
    .map((capability) => `runtime.capability.${capability.id}`));
  if (kind === "topdown" || kind === "platformer" || kind === "isometric" || kind === "mixed") {
    features.push("save.universal_runtime_envelope");
    features.push("audio.runtime_bus_volume");
    features.push("audio.runtime_bus_fade");
    features.push("audio.runtime_bus_mute_all_profiles");
    features.push("audio.pcm_sfx_event_options");
  }
  const spritePack = buildAssetcSpritePackGeneration(data);
  const tilesetPack = buildAssetcTilesetPackGeneration(data);
  const portraitPack = buildAssetcPortraitPackGeneration(data, spritePack);
  const emotePack = buildAssetcEmotePackGeneration(data, spritePack, portraitPack);
  const videoAsset = buildVideoAssetPackEntry(data, assets);
  const sceneCompositionBitmapAssets = buildSceneCompositionBitmapAssetPackEntries(data, assets);
  const tacticalCapabilityAssets = buildTacticalCapabilityAssetRefs(data, tilesetPack, spritePack, audioPack);
  const tacticalResidentSets = projectRooms(data).flatMap((room, index) => {
    const grid = isometricSceneConfigFromRuntime(room.runtime, data.settings);
    const presentation = buildIsometricTacticalPresentation(data, room, grid, tilesetPack, spritePack, audioPack);
    const residency = presentation?.surface_residency;
    if (!presentation?.surface_pages?.length || !residency) return [];
    return [{
      id: `${roomName(room, index)}_surface_pages`,
      room: roomName(room, index),
      groups: [...residency.exclusive_bank_groups],
      max_resident_groups: residency.max_resident_groups
    }];
  });
  const assetPackAssets = applySceneResourceCompressionPolicies(data, Array.from(new Map([
    ...(audioPack ? [audioPack.packAsset] : []),
    ...(palettePack ? palettePack.packAssets : []),
    ...(spritePack ? spritePack.packAssets : []),
    ...(tilesetPack ? tilesetPack.packAssets : []),
    ...(portraitPack ? portraitPack.packAssets : []),
    ...(emotePack ? emotePack.packAssets : []),
    ...(videoAsset ? [videoAsset] : []),
    ...sceneCompositionBitmapAssets
  ].map((asset) => [asset.id, asset] as const)).values()));
  if (spritePack) {
    features.push("asset_export_semantic_actor_refs");
  }
  if (palettePack) {
    features.push("palette_families.rgb555");
  }
  if (portraitPack) {
    features.push("dialogue_portrait_assets");
  }
  if (buildEngineDialogueUiConfigForExport(data).box_skin || buildEngineDialogueUiConfigForExport(data).scene_skins?.some(skin => skin.box_skin)) {
    features.push("dialogue_box_skin");
  }
  if (buildEngineDialogueUiConfigForExport(data).hud_skin || buildEngineDialogueUiConfigForExport(data).scene_skins?.some(skin => skin.hud_skin)) {
    features.push("hud_box_skin");
  }
  if (buildEngineDialogueUiConfigForExport(data).font_image) {
    features.push("dialogue_font");
  }
  if (buildEngineDialogueUiConfigForExport(data).selector_skin) {
    features.push("dialogue_choice_selector");
  }
  if (emotePack) {
    features.push("dialogue_emote_assets");
  }
  if (tilesetPack) {
    features.push("asset_export_semantic_asset_refs");
  }
  if (videoAsset || projectUsesRoomAffine(data)) {
    features.push("render.video_composition");
  }
  features.push("hardware.gba_native_contract");
  features.push("events.native_authoring_v2");
  if (advancedTools.compiled.hasResources) {
    features.push("advanced_tools_data");
  }
  const exportCoverage = auditExportEventCommandCoverage(data);
  const spriteVramWarnings = auditProjectSpriteVramWarnings(data);
  const spriteVramExportNotices = auditProjectSpriteVramExportNotices(data);
  const tilemapWarnings = auditProjectTilemapWarnings(data);
  const paletteConflictWarnings = deriveColorsWorkspacePresentation(data).paletteConflicts
    .filter((conflict) => !conflict.resolvedByExport)
    .map((conflict) => {
    const kind = conflict.kind === "sprite" ? "Sprite" : "Background";
    const references = conflict.references.map((reference) => (
      `${reference.roomName}: ${reference.source === "family"
        ? reference.familyName ?? reference.familyID
        : reference.source === "intrinsic" ? "paleta intrínseca" : "família ausente"}`
    )).join("; ");
    const resolution = conflict.resolution === "sprite-variant"
      ? "use uma variante da folha por família ou unifique a família das cenas"
      : "reempacote o background ou revise a política dos consumidores";
    return `Palette: ${kind} ${conflict.assetName} possui referências incompatíveis (${references}); ${resolution}.`;
    });
  const referenceWarnings = auditProjectEventReferenceWarnings(data);
  const dialogueAssetWarnings = auditProjectDialogueAssetWarnings(data);
  const dialogueUiFontWarnings = auditProjectDialogueUiFontWarnings(data);
  const dialogueUiBoxImageWarnings = auditProjectDialogueUiBoxImageWarnings(data);
  const exportWarnings = [
    ...exportCoverage.unsupported.map((verb) => `Comando ${verb} nao compila para a ROM neste exportador.`),
    ...spriteVramWarnings
      .filter((warning) => !warning.includes(spriteVramWarningLabels.horizontalOBJTileLimit))
      .map((warning) => `VRAM: ${warning}`),
    ...tilemapWarnings.map((warning) => `Tilemap: ${warning}`),
    ...paletteConflictWarnings,
    ...referenceWarnings,
    ...dialogueAssetWarnings,
    ...dialogueUiFontWarnings,
    ...dialogueUiBoxImageWarnings,
    ...entityEventProjectionWarnings
  ];
  const startGlobalRoomIndex = startRoomIndex(data, rooms);
  const startRoom = rooms[startGlobalRoomIndex] ?? rooms[0] ?? {};
  const initialRuntime = resolveSceneRuntimeExport(roomSceneType(startRoom)).kind as MixedRuntimeKind;
  const initialRuntimeRooms = isMixedRuntime ? exportRoomsForKind(data, initialRuntime) : rooms;
  const initialRoom = isMixedRuntime
    ? Math.max(0, roomIndexByName(initialRuntimeRooms, roomName(startRoom, startGlobalRoomIndex)))
    : startRoomIndex(data, initialRuntimeRooms);
  const mixedSources = [
    "main.cpp",
    ...mixedRuntimeKinds.map((runtime) => `${runtime}_runtime.cpp`)
  ];
  return {
    schema: 1,
    backend: "gbastudio_engine",
    kind,
    runtime_profile: isMixedRuntime ? "mixed" : resolution.runtimeProfile,
    runtime_contract: runtimeContract,
    runtime_capabilities: runtimeCapabilities,
    capability_manifest: capabilityManifest,
    hardware_contract: hardwareContract,
    ...(options.structuralFixture
      ? { structural_fixture: exportCompleteProjectFixtureManifest(options.structuralFixture) }
      : {}),
    scene_contracts: sceneContracts,
    ...(palettePack ? {
      palette_families: palettePack.families.map((family) => ({
        id: family.id,
        name: family.name,
        ...(palettePack.assetsByFamilyID[family.id]?.background
          ? { background_asset: palettePack.assetsByFamilyID[family.id]?.background?.name }
          : {}),
        ...(palettePack.assetsByFamilyID[family.id]?.objects
          ? { objects_asset: palettePack.assetsByFamilyID[family.id]?.objects?.name }
          : {})
      }))
    } : {}),
    template_dir: path.join(selectedEnginePackPath, "templates", isMixedRuntime ? "exported_mixed" : resolution.templateDirName),
    entry: "main.cpp",
    project_data: projectData,
    generated_assets: assetPackAssets.map((asset) => asset.header),
    copied_assets: assets,
    ...(assetPackAssets.length > 0 || tacticalCapabilityAssets.length > 0 ? {
      asset_pack: {
        assets: assetPackAssets,
        ...(tacticalCapabilityAssets.length > 0 ? { capability_assets: tacticalCapabilityAssets } : {}),
        ...(tacticalResidentSets.length > 0 ? { resident_sets: tacticalResidentSets } : {}),
        ...(audioPack?.physicalBudget ? { physical_budget: audioPack.physicalBudget } : {})
      }
    } : {}),
    build: {
      target,
      make_target: "all",
      ...gbaRomHeaderBuild(data),
      ...(isMixedRuntime ? { sources: mixedSources } : {})
    },
    requires: {
      engine_pack: `>=${enginePackVersion}`,
      features
    },
    ...(isMixedRuntime
      ? {
          runtime_dispatch: {
            initial_runtime: initialRuntime,
            initial_room: initialRoom,
            initial_scene: roomName(startRoom, startGlobalRoomIndex),
            runtimes: mixedRuntimeKinds,
            save: projectSaveConfig
          },
          ...(mixedRuntimeKinds.includes("topdown") ? { topdown_project: buildTopdownProject(data, pluginRegistry) } : {}),
          ...(mixedRuntimeKinds.includes("platformer") ? { platformer_project: buildPlatformerProject(data, pluginRegistry) } : {}),
          ...(mixedRuntimeKinds.includes("isometric") ? { isometric_project: buildIsometricProject(data, pluginRegistry) } : {}),
          ...(mixedRuntimeKinds.includes("point_click") ? { point_click_project: buildPointClickProject(data, pluginRegistry) } : {}),
          ...(mixedRuntimeKinds.includes("shmup") ? { shmup_project: buildShmupProject(data, pluginRegistry) } : {}),
          ...(mixedRuntimeKinds.includes("menu") ? { menu_project: buildMenuProject(data, pluginRegistry) } : {}),
          ...(mixedRuntimeKinds.includes("dungeon_crawler") ? { dungeon_crawler_project: buildDungeonCrawlerProject(data, pluginRegistry) } : {}),
          ...(mixedRuntimeKinds.includes("racing") ? { racing_project: buildRacingProject(data, pluginRegistry) } : {}),
          ...(mixedRuntimeKinds.includes("cutscene") ? { cutscene_project: buildCutsceneProject(data, pluginRegistry) } : {}),
          ...(mixedRuntimeKinds.includes("visual_novel") ? { visual_novel_project: buildVisualNovelProject(data, pluginRegistry) } : {}),
          ...(mixedRuntimeKinds.includes("world_map") ? { world_map_project: buildWorldMapProject(data, pluginRegistry) } : {}),
          ...(mixedRuntimeKinds.includes("battle_rpg") ? { battle_rpg_project: buildBattleRpgProject(data, pluginRegistry) } : {}),
          ...(mixedRuntimeKinds.includes("luta") ? { luta_project: buildLutaProject(data, pluginRegistry) } : {})
        }
      : isPlatformer
      ? { platformer_project: buildPlatformerProject(data, pluginRegistry) }
      : isIsometric
        ? { isometric_project: buildIsometricProject(data, pluginRegistry) }
        : isDungeonCrawler
          ? { dungeon_crawler_project: buildDungeonCrawlerProject(data, pluginRegistry) }
        : isRacing
          ? { racing_project: buildRacingProject(data, pluginRegistry) }
        : isBattleRpg
          ? { battle_rpg_project: buildBattleRpgProject(data, pluginRegistry) }
        : isLuta
          ? { luta_project: buildLutaProject(data, pluginRegistry) }
        : isPointClick
          ? { point_click_project: buildPointClickProject(data, pluginRegistry) }
          : isShmup
            ? { shmup_project: buildShmupProject(data, pluginRegistry) }
            : isVisualNovel
              ? { visual_novel_project: buildVisualNovelProject(data, pluginRegistry) }
              : isMenu
                ? { menu_project: buildMenuProject(data, pluginRegistry) }
                : isCutscene
                  ? { cutscene_project: buildCutsceneProject(data, pluginRegistry) }
                  : isWorldMap
                    ? { world_map_project: buildWorldMapProject(data, pluginRegistry) }
                    : { topdown_project: buildTopdownProject(data, pluginRegistry) }),
    ...(pluginRegistry.dataTables.length > 0
      ? { plugin_data_tables: pluginDataTablesForExport(pluginRegistry.dataTables) }
      : {}),
    ...(advancedTools.compiled.hasResources ? { advanced_tools: advancedTools.compiled.contract } : {}),
    ...(exportWarnings.length > 0 ? { export_warnings: exportWarnings } : {}),
    ...(spriteVramExportNotices.length > 0
      ? { export_notices: spriteVramExportNotices.map((notice) => `VRAM: ${notice}`) }
      : {})
  };
}

export function prepareEngineProjectExport(
  data: GBAProjectData,
  options: BuildEngineExportProjectContractOptions = {}
): PreparedEngineProjectExport {
  try {
    data = projectWithIndependentTacticalResidency(expandProjectTilemaps(data));
    const blockingImportDiagnostics = blockingGBStudioImportDiagnostics(data);
    if (blockingImportDiagnostics.length > 0) {
      return {
        error: `Export bloqueado: a importacao do GB Studio possui diagnosticos obrigatorios (${blockingImportDiagnostics.map((diagnostic) => diagnostic.code).join(", ")}). Resolva a perda de dados antes de exportar.`
      };
    }
    const tilemapBlockingErrors = auditProjectTilemapBlockingErrors(data);
    if (tilemapBlockingErrors.length > 0) {
      return { error: `Export bloqueado: ${tilemapBlockingErrors.join(" | ")}` };
    }

    const hardwareBlockingErrors = auditGbaHardwareBlockingErrors(data);
    if (hardwareBlockingErrors.length > 0) {
      return { error: `Export bloqueado: ${hardwareBlockingErrors.join(" | ")}` };
    }

    const spriteVramBlockingErrors = auditProjectSpriteVramBlockingErrors(data);
    if (spriteVramBlockingErrors.length > 0) {
      return { error: `Export bloqueado: ${spriteVramBlockingErrors.join(" | ")}` };
    }

    const audioErrors = projectArray(data, "audioItems").flatMap(audio => audioContractIssues(audio, data)
      .filter(issue => issue.level === "error").map(issue => `${String(audio.name ?? "Áudio")}: ${issue.message}`));
    if (audioErrors.length) return { error: `Export bloqueado: ${audioErrors.join(" | ")}` };
    const audioPack = buildAssetcAudioPackGeneration(data);
    return {
      generated: {
        target: projectTarget(data),
        contract: buildEngineExportProjectContract(data, options),
        assets: exportableAssets(data),
        ...(audioPack ? { audioPack } : {})
      }
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function resolveSmokeEngineExportRoot(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.GBA_STUDIO_SMOKE_ENGINE_EXPORT_ROOT?.trim();
  return value ? value : null;
}
