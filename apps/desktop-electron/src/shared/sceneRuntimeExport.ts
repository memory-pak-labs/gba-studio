import { normalizeSceneTypeId } from "./sceneTypes.js";
import { scenePreflightProfile, type ScenePreflightProfileID } from "./scenePreflight.js";
import { deriveSaveMenuBuilder, type SaveMenuBuilderConfig } from "./saveMenuBuilder.js";
import {
  resolveSceneCapabilityManifest,
  sceneTypeCapabilities,
  type SceneBudget,
  type SceneCapabilityManifest,
  type SceneFeatureModule
} from "./sceneFeatureModules.js";
import { normalizeIsometricTacticalPresentation, type IsoTacticalPresentationConfig } from "./isometricTacticalPresentation.js";

export type SceneExportKind =
  | "topdown"
  | "platformer"
  | "isometric"
  | "dungeon_crawler"
  | "racing"
  | "battle_rpg"
  | "luta"
  | "point_click"
  | "shmup"
  | "visual_novel"
  | "menu"
  | "cutscene"
  | "world_map";
export type SceneExportAdapter =
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
  | "world_map_project";
export type SceneExportAdapterStatus = "native" | "preview_profile_with_topdown_rom_adapter";
export type PreviewExportStatus = "native" | "topdown_adapter";

export interface SceneRuntimePreviewProfile {
  sceneType: string;
  movement: string;
  projection: string;
  exportStatus: PreviewExportStatus;
  capabilities: string[];
  preflightProfileId: ScenePreflightProfileID;
  preflightLayerIds: string[];
  capabilityManifest?: SceneCapabilityManifest;
  tacticalPresentation?: IsoTacticalPresentationConfig;
}

export interface SceneRuntimePreviewProfileOptions {
  platformerPreviewEnabled?: boolean;
  modules?: unknown;
  advancedCapabilities?: unknown;
  tacticalCapabilities?: unknown;
  tacticalPresentation?: unknown;
  gameplayMode?: unknown;
}

const SCENE_RUNTIME_PREVIEW_PROFILES: Record<string, Omit<SceneRuntimePreviewProfile, "sceneType" | "exportStatus" | "preflightProfileId" | "preflightLayerIds" | "tacticalPresentation">> = {
  topdown: {
    movement: "four_way",
    projection: "orthographic",
    capabilities: ["tile_collision", "actor_interaction", "trigger_overlap"]
  },
  platformer: {
    movement: "side_scroll",
    projection: "orthographic",
    capabilities: ["tile_collision", "actor_interaction", "trigger_overlap", "gravity_preview"]
  },
  shmup: {
    movement: "horizontal_scroll",
    projection: "orthographic",
    capabilities: [
      "tile_collision",
      "actor_interaction",
      "trigger_overlap",
      "hud_bg0",
      "actors_obj",
      "obstacles_bg1",
      "collision_data",
      "affine_tiled_background"
    ]
  },
  isometric: {
    movement: "eight_way_diagonal",
    projection: "isometric",
    capabilities: ["tile_collision", "actor_interaction", "trigger_overlap", "isometric_projection"]
  },
  dungeonCrawler: {
    movement: "step_and_turn",
    projection: "first_person_grid",
    capabilities: ["tile_collision", "actor_interaction", "trigger_overlap", "relative_grid_movement"]
  },
  racing: {
    movement: "vehicle_acceleration",
    projection: "topdown_track",
    capabilities: ["tile_collision", "trigger_overlap", "acceleration", "braking", "steering"]
  },
  battleRpg: {
    movement: "turn_based_targeting",
    projection: "battle_stage",
    capabilities: ["actor_interaction", "target_selection", "turn_progression", "escape_command"]
  },
  luta: {
    movement: "fighting",
    projection: "battle_stage",
    capabilities: ["actor_interaction", "fighting_state", "camera_follow", "hud_bg0", "actors_obj"]
  },
  worldMap: {
    movement: "connected_node_navigation",
    projection: "world_map",
    capabilities: ["node_focus", "node_unlock_rules", "node_selection", "native_world_map"]
  },
  visualNovel: {
    movement: "scene_advance",
    projection: "visual_novel",
    capabilities: ["dialogue", "choices", "history", "native_scene_advance"]
  },
  cutscene: {
    movement: "scene_advance",
    projection: "cutscene",
    capabilities: ["dialogue", "timed_steps", "native_scene_advance"]
  },
  pointAndClick: {
    movement: "pointer",
    projection: "orthographic",
    capabilities: ["tile_collision", "actor_interaction", "trigger_overlap"]
  },
  menu: {
    movement: "menu_navigation",
    projection: "ui",
    capabilities: ["menu_selection", "dialogue", "scene_transition"]
  },
  custom: {
    movement: "custom",
    projection: "custom",
    capabilities: ["scene_data", "event_bindings"]
  }
};

export interface SceneRuntimeExportResolution {
  sceneType: string;
  kind: SceneExportKind;
  /** Project-level profile consumed by assetc/templates. */
  runtimeProfile: SceneExportKind;
  /** Room/profile label retained for metadata and debug. */
  roomRuntimeProfile: string;
  adapter: SceneExportAdapter;
  adapterStatus: SceneExportAdapterStatus;
  templateDirName:
    | "exported_topdown"
    | "exported_platformer"
    | "exported_isometric"
    | "exported_dungeon_crawler"
    | "exported_racing"
    | "exported_battle_rpg"
    | "exported_luta"
    | "exported_point_click"
    | "exported_shmup"
    | "exported_visual_novel"
    | "exported_menu"
    | "exported_cutscene"
    | "exported_world_map";
  projectData:
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
    | "world_map_project_data.hpp";
  featureModules: SceneFeatureModule[];
  runtimeCapabilities: string[];
  budget: SceneBudget;
  capabilityManifest: SceneCapabilityManifest;
  assetRules: string[];
  preview: {
    mode: "map" | "focus" | "play";
    overlays: string[];
  };
}

export interface EnginePlatformerPhysicsConfig {
  max_run_speed_x256: number;
  acceleration_x256: number;
  friction_x256: number;
  gravity_x256: number;
  max_fall_speed_x256: number;
  jump_speed_x256: number;
  coyote_frames: number;
  jump_buffer_frames: number;
  ladders_enabled: boolean;
  max_air_jumps: number;
  wall_jump_enabled: boolean;
  wall_slide_enabled: boolean;
  jump_min_height_x256: number;
  jump_hold_frames: number;
  jump_height_reduction_x256: number;
  air_control_enabled: boolean;
  turn_in_air_enabled: boolean;
  air_deceleration_x256: number;
  drop_through_mode: number;
  camera_follow_directions: number;
  camera_deadzone_x_pixels: number;
  camera_lock_edge: number;
  wall_slide_speed_x256: number;
  wall_jump_speed_x256: number;
  wall_jump_push_x256: number;
  dash_enabled: boolean;
  dash_style: number;
  dash_momentum: number;
  dash_through: number;
  dash_recharge_frames: number;
  dash_speed_x256: number;
  dash_frames: number;
  glide_enabled: boolean;
  glide_fall_speed_x256: number;
  platform_actor_collision_group: number;
  solid_actor_collision_group: number;
  actor_gravity_enabled: boolean;
}

/** Defaults mirrored from gbs::default_platformer_config(). */
export const DEFAULT_ENGINE_PLATFORMER_PHYSICS: EnginePlatformerPhysicsConfig = {
  max_run_speed_x256: 0x0180,
  acceleration_x256: 0x0040,
  friction_x256: 0x0030,
  gravity_x256: 0x0030,
  max_fall_speed_x256: 0x0400,
  jump_speed_x256: 0x0580,
  coyote_frames: 4,
  jump_buffer_frames: 5,
  ladders_enabled: true,
  max_air_jumps: 0,
  wall_jump_enabled: false,
  wall_slide_enabled: true,
  jump_min_height_x256: 0,
  jump_hold_frames: 1,
  jump_height_reduction_x256: 0,
  air_control_enabled: true,
  turn_in_air_enabled: true,
  air_deceleration_x256: 0,
  drop_through_mode: 0,
  camera_follow_directions: 15,
  camera_deadzone_x_pixels: 0,
  camera_lock_edge: 0,
  wall_slide_speed_x256: 0x0180,
  wall_jump_speed_x256: 0x0500,
  wall_jump_push_x256: 0x0300,
  dash_enabled: false,
  dash_style: 2,
  dash_momentum: 0,
  dash_through: 0,
  dash_recharge_frames: 0,
  dash_speed_x256: 0x0600,
  dash_frames: 8,
  glide_enabled: false,
  glide_fall_speed_x256: 0x0140,
  platform_actor_collision_group: 0,
  solid_actor_collision_group: 0,
  actor_gravity_enabled: false
};

function numberOrNull(value: unknown): number | null {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : null;
}

function toX256(value: unknown, fallbackX256: number): number {
  const next = numberOrNull(value);
  if (next === null) return fallbackX256;
  return Math.max(0, Math.round(next * 256));
}

function toFrameCount(value: unknown, fallback: number): number {
  const next = numberOrNull(value);
  if (next === null) return fallback;
  return Math.max(0, Math.min(255, Math.round(next)));
}

function enumValue(value: unknown, values: readonly string[], fallback: number): number {
  const index = typeof value === "string" ? values.indexOf(value) : -1;
  return index >= 0 ? index : fallback;
}

function collisionGroupValue(value: unknown, fallback: number): number {
  const next = numberOrNull(value);
  if (next === null) return fallback;
  const rounded = Math.round(next);
  return rounded === 0 || rounded === 2 || rounded === 4 || rounded === 8 ? rounded : fallback;
}

type SceneRuntimeExportBase = Omit<SceneRuntimeExportResolution, "featureModules" | "runtimeCapabilities" | "budget" | "capabilityManifest" | "assetRules" | "preview">;

function withSceneCapabilities(base: SceneRuntimeExportBase): SceneRuntimeExportResolution {
  const capabilities = sceneTypeCapabilities(base.sceneType);
  return {
    ...base,
    featureModules: capabilities.featureModules,
    runtimeCapabilities: capabilities.runtimeCapabilities,
    budget: capabilities.budget,
    capabilityManifest: resolveSceneCapabilityManifest(base.sceneType),
    assetRules: capabilities.assetRules,
    preview: capabilities.preview
  };
}

export function resolveSceneRuntimeExport(sceneType: string | null | undefined): SceneRuntimeExportResolution {
  const normalized = normalizeSceneTypeId(sceneType, "topdown");
  if (normalized === "platformer") {
    return withSceneCapabilities({
      sceneType: normalized,
      kind: "platformer",
      runtimeProfile: "platformer",
      roomRuntimeProfile: normalized,
      adapter: "platformer_project",
      adapterStatus: "native",
      templateDirName: "exported_platformer",
      projectData: "platformer_project_data.hpp"
    });
  }

  if (normalized === "isometric") {
    return withSceneCapabilities({
      sceneType: normalized,
      kind: "isometric",
      runtimeProfile: "isometric",
      roomRuntimeProfile: normalized,
      adapter: "isometric_project",
      adapterStatus: "native",
      templateDirName: "exported_isometric",
      projectData: "isometric_project_data.hpp"
    });
  }

  if (normalized === "dungeonCrawler") {
    return withSceneCapabilities({
      sceneType: normalized,
      kind: "dungeon_crawler",
      runtimeProfile: "dungeon_crawler",
      roomRuntimeProfile: normalized,
      adapter: "dungeon_crawler_project",
      adapterStatus: "native",
      templateDirName: "exported_dungeon_crawler",
      projectData: "dungeon_crawler_project_data.hpp"
    });
  }

  if (normalized === "racing") {
    return withSceneCapabilities({
      sceneType: normalized,
      kind: "racing",
      runtimeProfile: "racing",
      roomRuntimeProfile: normalized,
      adapter: "racing_project",
      adapterStatus: "native",
      templateDirName: "exported_racing",
      projectData: "racing_project_data.hpp"
    });
  }

  if (normalized === "battleRpg") {
    return withSceneCapabilities({
      sceneType: normalized,
      kind: "battle_rpg",
      runtimeProfile: "battle_rpg",
      roomRuntimeProfile: normalized,
      adapter: "battle_rpg_project",
      adapterStatus: "native",
      templateDirName: "exported_battle_rpg",
      projectData: "battle_rpg_project_data.hpp"
    });
  }

  if (normalized === "luta") {
    return withSceneCapabilities({
      sceneType: normalized,
      kind: "luta",
      runtimeProfile: "luta",
      roomRuntimeProfile: normalized,
      adapter: "luta_project",
      adapterStatus: "native",
      templateDirName: "exported_luta",
      projectData: "luta_project_data.hpp"
    });
  }

  if (normalized === "pointAndClick") {
    return withSceneCapabilities({
      sceneType: normalized,
      kind: "point_click",
      runtimeProfile: "point_click",
      roomRuntimeProfile: normalized,
      adapter: "point_click_project",
      adapterStatus: "native",
      templateDirName: "exported_point_click",
      projectData: "point_click_project_data.hpp"
    });
  }

  if (normalized === "shmup") {
    return withSceneCapabilities({
      sceneType: normalized,
      kind: "shmup",
      runtimeProfile: "shmup",
      roomRuntimeProfile: normalized,
      adapter: "shmup_project",
      adapterStatus: "native",
      templateDirName: "exported_shmup",
      projectData: "shmup_project_data.hpp"
    });
  }

  if (normalized === "visualNovel") {
    return withSceneCapabilities({
      sceneType: normalized,
      kind: "visual_novel",
      runtimeProfile: "visual_novel",
      roomRuntimeProfile: normalized,
      adapter: "visual_novel_project",
      adapterStatus: "native",
      templateDirName: "exported_visual_novel",
      projectData: "visual_novel_project_data.hpp"
    });
  }

  if (normalized === "menu") {
    return withSceneCapabilities({
      sceneType: normalized,
      kind: "menu",
      runtimeProfile: "menu",
      roomRuntimeProfile: normalized,
      adapter: "menu_project",
      adapterStatus: "native",
      templateDirName: "exported_menu",
      projectData: "menu_project_data.hpp"
    });
  }

  if (normalized === "cutscene") {
    return withSceneCapabilities({
      sceneType: normalized,
      kind: "cutscene",
      runtimeProfile: "cutscene",
      roomRuntimeProfile: normalized,
      adapter: "cutscene_project",
      adapterStatus: "native",
      templateDirName: "exported_cutscene",
      projectData: "cutscene_project_data.hpp"
    });
  }

  if (normalized === "worldMap") {
    return withSceneCapabilities({
      sceneType: normalized,
      kind: "world_map",
      runtimeProfile: "world_map",
      roomRuntimeProfile: normalized,
      adapter: "world_map_project",
      adapterStatus: "native",
      templateDirName: "exported_world_map",
      projectData: "world_map_project_data.hpp"
    });
  }

  return withSceneCapabilities({
    sceneType: normalized,
    kind: "topdown",
    runtimeProfile: "topdown",
    roomRuntimeProfile: normalized,
    adapter: "topdown_project",
    adapterStatus: normalized === "topdown" ? "native" : "preview_profile_with_topdown_rom_adapter",
    templateDirName: "exported_topdown",
    projectData: "gbastudio_project_data.hpp"
  });
}

export function roomMatchesExportKind(sceneType: string | null | undefined, kind: SceneExportKind): boolean {
  const normalized = normalizeSceneTypeId(sceneType, "topdown");
  if (kind === "platformer") return normalized === "platformer";
  if (kind === "isometric") return normalized === "isometric";
  if (kind === "dungeon_crawler") return normalized === "dungeonCrawler";
  if (kind === "racing") return normalized === "racing";
  if (kind === "battle_rpg") return normalized === "battleRpg";
  if (kind === "luta") return normalized === "luta";
  if (kind === "point_click") return normalized === "pointAndClick";
  if (kind === "shmup") return normalized === "shmup";
  if (kind === "visual_novel") return normalized === "visualNovel";
  if (kind === "menu") return normalized === "menu";
  if (kind === "cutscene") return normalized === "cutscene";
  if (kind === "world_map") return normalized === "worldMap";
  return normalized !== "platformer"
    && normalized !== "isometric"
    && normalized !== "dungeonCrawler"
    && normalized !== "racing"
    && normalized !== "battleRpg"
    && normalized !== "luta"
    && normalized !== "pointAndClick"
    && normalized !== "shmup"
    && normalized !== "visualNovel"
    && normalized !== "menu"
    && normalized !== "cutscene"
    && normalized !== "worldMap";
}

export function previewExportStatusForSceneType(sceneType: string | null | undefined): PreviewExportStatus {
  const resolution = resolveSceneRuntimeExport(sceneType);
  return resolution.adapterStatus === "native" ? "native" : "topdown_adapter";
}

export function resolveSceneRuntimePreviewProfile(
  sceneType: string | null | undefined,
  options: SceneRuntimePreviewProfileOptions = {}
): SceneRuntimePreviewProfile {
  const normalized = normalizeSceneTypeId(sceneType, "topdown");
  const profile = SCENE_RUNTIME_PREVIEW_PROFILES[normalized] ?? SCENE_RUNTIME_PREVIEW_PROFILES.topdown;
  const capabilities = [...profile.capabilities];
  if (!capabilities.includes("affine_background_preview")) {
    capabilities.push("affine_background_preview");
  }
  if (normalized === "platformer" && options.platformerPreviewEnabled) {
    capabilities.push(
      "platformer_plus_preview",
      "variable_jump_preview",
      "drop_through_preview",
      "dash_preview",
      "camera_deadzone_preview"
    );
  }
  const capabilityManifest = options.modules === undefined
    && options.advancedCapabilities === undefined
    && options.tacticalCapabilities === undefined
    ? undefined
    : resolveSceneCapabilityManifest(normalized, options.modules, undefined, options.advancedCapabilities, options.tacticalCapabilities);
  const preflight = normalized === "isometric" && options.gameplayMode === "tactical"
    ? scenePreflightProfile(normalized, "tacticalGrid")
    : scenePreflightProfile(normalized);
  if (capabilityManifest) {
    capabilities.push(...capabilityManifest.capabilities
      .filter((capability) => capability.status.enabled)
      .flatMap((capability) => capability.engineFeatures));
  }
  return {
    sceneType: normalized,
    movement: profile.movement,
    projection: profile.projection,
    exportStatus: previewExportStatusForSceneType(normalized),
    capabilities: Array.from(new Set(capabilities)),
    preflightProfileId: preflight.id,
    preflightLayerIds: preflight.layers.map((layer) => layer.id),
    ...(capabilityManifest ? { capabilityManifest } : {}),
    ...(options.tacticalPresentation !== undefined
      ? { tacticalPresentation: normalizeIsometricTacticalPresentation(options.tacticalPresentation) }
      : {})
  };
}

export function buildEnginePlatformerPhysicsConfig(
  settings: Record<string, unknown> | null | undefined
): EnginePlatformerPhysicsConfig {
  const source = settings && typeof settings === "object" ? settings : {};
  return {
    max_run_speed_x256: toX256(source.walkSpeed, DEFAULT_ENGINE_PLATFORMER_PHYSICS.max_run_speed_x256),
    acceleration_x256: toX256(source.acceleration, DEFAULT_ENGINE_PLATFORMER_PHYSICS.acceleration_x256),
    friction_x256: toX256(source.friction, DEFAULT_ENGINE_PLATFORMER_PHYSICS.friction_x256),
    gravity_x256: toX256(source.gravity, DEFAULT_ENGINE_PLATFORMER_PHYSICS.gravity_x256),
    max_fall_speed_x256: toX256(source.maxFallSpeed, DEFAULT_ENGINE_PLATFORMER_PHYSICS.max_fall_speed_x256),
    jump_speed_x256: toX256(source.jumpSpeed, DEFAULT_ENGINE_PLATFORMER_PHYSICS.jump_speed_x256),
    coyote_frames: toFrameCount(source.coyoteTime, DEFAULT_ENGINE_PLATFORMER_PHYSICS.coyote_frames),
    jump_buffer_frames: toFrameCount(source.jumpBuffer, DEFAULT_ENGINE_PLATFORMER_PHYSICS.jump_buffer_frames),
    ladders_enabled: typeof source.ladders === "boolean"
      ? source.ladders
      : DEFAULT_ENGINE_PLATFORMER_PHYSICS.ladders_enabled,
    max_air_jumps: source.doubleJump === true ? 1 : 0,
    wall_jump_enabled: source.wallJump === true,
    wall_slide_enabled: source.wallSlide !== false,
    jump_min_height_x256: toX256(source.jumpMinHeight, DEFAULT_ENGINE_PLATFORMER_PHYSICS.jump_min_height_x256),
    jump_hold_frames: toFrameCount(source.jumpFrames, DEFAULT_ENGINE_PLATFORMER_PHYSICS.jump_hold_frames),
    jump_height_reduction_x256: toX256(source.jumpReduction, DEFAULT_ENGINE_PLATFORMER_PHYSICS.jump_height_reduction_x256),
    air_control_enabled: source.airControl !== false,
    turn_in_air_enabled: source.changeDirectionInAir !== false,
    air_deceleration_x256: toX256(source.airDeceleration, DEFAULT_ENGINE_PLATFORMER_PHYSICS.air_deceleration_x256),
    drop_through_mode: enumValue(source.dropThrough, ["off", "down_hold", "down_tap", "down_jump_hold", "down_jump_tap"], DEFAULT_ENGINE_PLATFORMER_PHYSICS.drop_through_mode),
    camera_follow_directions: Math.max(0, Math.min(15, Math.round(numberOrNull(source.cameraFollow) ?? DEFAULT_ENGINE_PLATFORMER_PHYSICS.camera_follow_directions))),
    camera_deadzone_x_pixels: Math.max(0, Math.min(240, Math.round(numberOrNull(source.cameraDeadzoneX) ?? DEFAULT_ENGINE_PLATFORMER_PHYSICS.camera_deadzone_x_pixels))),
    camera_lock_edge: enumValue(source.cameraLockEdge, ["none", "left", "right", "both"], DEFAULT_ENGINE_PLATFORMER_PHYSICS.camera_lock_edge),
    wall_slide_speed_x256: toX256(source.wallSlideSpeed, DEFAULT_ENGINE_PLATFORMER_PHYSICS.wall_slide_speed_x256),
    wall_jump_speed_x256: toX256(source.wallJumpSpeed, DEFAULT_ENGINE_PLATFORMER_PHYSICS.wall_jump_speed_x256),
    wall_jump_push_x256: toX256(source.wallJumpPush, DEFAULT_ENGINE_PLATFORMER_PHYSICS.wall_jump_push_x256),
    dash_enabled: source.dash === true,
    dash_style: enumValue(source.dashStyle, ["ground", "air", "both"], DEFAULT_ENGINE_PLATFORMER_PHYSICS.dash_style),
    dash_momentum: enumValue(source.dashMomentum, ["horizontal", "vertical", "both"], DEFAULT_ENGINE_PLATFORMER_PHYSICS.dash_momentum),
    dash_through: enumValue(source.dashThrough, ["none", "actors", "actors_triggers", "actors_triggers_walls"], DEFAULT_ENGINE_PLATFORMER_PHYSICS.dash_through),
    dash_recharge_frames: toFrameCount(source.dashRechargeFrames, DEFAULT_ENGINE_PLATFORMER_PHYSICS.dash_recharge_frames),
    dash_speed_x256: toX256(source.dashSpeed, DEFAULT_ENGINE_PLATFORMER_PHYSICS.dash_speed_x256),
    dash_frames: toFrameCount(source.dashFrames, DEFAULT_ENGINE_PLATFORMER_PHYSICS.dash_frames),
    glide_enabled: source.glide === true,
    glide_fall_speed_x256: toX256(source.glideFallSpeed, DEFAULT_ENGINE_PLATFORMER_PHYSICS.glide_fall_speed_x256),
    platform_actor_collision_group: collisionGroupValue(source.platformActorCollisionGroup, DEFAULT_ENGINE_PLATFORMER_PHYSICS.platform_actor_collision_group),
    solid_actor_collision_group: collisionGroupValue(source.solidActorCollisionGroup, DEFAULT_ENGINE_PLATFORMER_PHYSICS.solid_actor_collision_group),
    actor_gravity_enabled: source.actorGravity === true
  };
}

export type EngineInteractButton = "A" | "B" | "L" | "R" | "Start" | "Select";

const ENGINE_INTERACT_BUTTONS = new Set<EngineInteractButton>(["A", "B", "L", "R", "Start", "Select"]);

const DEFAULT_DIALOGUE_FRAME_INDEX = 0;
const DEFAULT_DIALOGUE_WRAP_COLUMNS = 28;
const DEFAULT_DIALOGUE_WRAP_LINES = 3;
const DEFAULT_DIALOGUE_BOX_WIDTH_TILES = 28;
const DEFAULT_DIALOGUE_BOX_HEIGHT_TILES = 5;

/** GBA face button used for actor/portal interaction in exported projects. */
export function buildEngineInteractButton(
  settings: Record<string, unknown> | null | undefined
): EngineInteractButton {
  const source = settings && typeof settings === "object" ? settings : {};
  const raw = typeof source.interactButton === "string" ? source.interactButton.trim() : "A";
  if (!raw) return "A";
  const normalized = raw.toLowerCase() === "start"
    ? "Start"
    : raw.toLowerCase() === "select"
      ? "Select"
      : raw.toUpperCase();
  return ENGINE_INTERACT_BUTTONS.has(normalized as EngineInteractButton)
    ? normalized as EngineInteractButton
    : "A";
}

export interface EngineDialogueUiConfig {
  frame_index: number;
  wrap_columns: number;
  wrap_lines: number;
  /** Dialogue box width in 8px tiles, constrained to the visible GBA viewport. */
  box_width: number;
  /** Dialogue box height in 8px tiles, including its border rows. */
  box_height: number;
  box_image?: string;
  /** Resolved export path (relative to the staged project) of box_image's PNG, when it exists as a project asset. Populated by the export layer, not by buildEngineDialogueUiConfig. */
  box_skin?: string;
  hud_image?: string;
  /** Resolved export path of the active HUD preset background PNG. */
  hud_skin?: string;
  hud_position?: string;
  hud_width?: number;
  hud_height?: number;
  hud_presets?: Array<{
    id: string;
    hud_image?: string;
    hud_skin?: string;
    hud_position: string;
    hud_width: number;
    hud_height: number;
  }>;
  /** Resolved frame skins applied on scene entry after the HUD layout binding. */
  scene_skins?: Array<{ scene_name: string; box_skin?: string; hud_skin?: string }>;
  hud_scene_bindings?: Array<{
    scene_name: string;
    preset_id: string;
  }>;
  /** Normalized authoring data for standard and advanced HUD compositions. */
  hud_layouts?: Array<{
    id: string;
    mode: "standard" | "advanced";
    components: Array<{
      id: string;
      kind: "frame" | "text" | "bar" | "icon";
      label: string;
      text: string;
      asset: string;
      x: number;
      y: number;
      width: number;
      height: number;
      z_index: number;
      visible: boolean;
      value_binding?: string;
      state_assets?: string[];
      gauge?: {empty_asset:string;x:number;y:number;width:number;height:number;reverse:boolean};
      behavior?: {
        states: Partial<Record<"selected" | "disabled" | "hidden", { variable: number; value: number; text?: string }>>;
        events: Array<{ trigger: "appear" | "valueChanged" | "focus" | "confirm"; watch_variable?: number; actions: Array<{op:"set_variable" | "add_variable";variable:number;value:number}> }>;
      };
    }>;
  }>;
  /** Advanced HUD layout selected at project level, when the active preset is advanced. */
  hud_active_layout_id?: string;
  selector_image?: string;
  /** Resolved export path of the custom 8x8 dialogue choice selector tile. */
  selector_skin?: string;
  font?: string;
  /** Resolved export path of a custom 128x112 GB-compatible font atlas. */
  font_image?: string;
  show_portrait?: boolean;
  show_character_name?: boolean;
  portrait_position?: string;
  /** Places the active portrait in a dedicated frame-aware box outside the dialogue text box. */
  portrait_layout?: "inline" | "fixed_slots";
  /** Renders the speaker inside the dialogue text or as a compact plate attached to the box. */
  name_label_mode?: DialogueNameLabelMode;
}

export type DialoguePortraitLayout = "inline" | "fixed_slots";
export type DialogueNameLabelMode = "inline" | "above";

export interface DialogueUiSettingsContract {
  boxImage: string;
  selectorImage: string;
  font: string;
  boxPosition: string;
  boxWidth: number;
  boxHeight: number;
  showPortrait: boolean;
  showCharacterName: boolean;
  portraitPosition: string;
  portraitLayout: DialoguePortraitLayout;
  nameLabelMode: DialogueNameLabelMode;
  textSpeed: string;
}

export interface DialoguePreviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DialoguePreviewLayout {
  frameIndex: number;
  box: DialoguePreviewRect;
  text: DialoguePreviewRect;
  portraitSlot: DialoguePreviewRect;
  nameLabel: DialoguePreviewRect;
  portraitOnRight: boolean;
}

export interface DialoguePreviewPortraitSourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DIALOGUE_VIEWPORT_WIDTH = 240;
const DIALOGUE_VIEWPORT_HEIGHT = 160;
const DIALOGUE_TILE_SIZE = 8;
const DIALOGUE_NAME_LABEL_HEIGHT_TILES = 3;
const DIALOGUE_PORTRAIT_SLOT_Y = 48;
const DIALOGUE_VIEWPORT_WIDTH_TILES = DIALOGUE_VIEWPORT_WIDTH / DIALOGUE_TILE_SIZE;
const DIALOGUE_VIEWPORT_HEIGHT_TILES = DIALOGUE_VIEWPORT_HEIGHT / DIALOGUE_TILE_SIZE;
const DIALOGUE_BOX_MIN_TILES = 3;
const DIALOGUE_BOX_MAX_WIDTH_TILES = DIALOGUE_VIEWPORT_WIDTH_TILES - 1;
const DIALOGUE_BOX_MAX_HEIGHT_TILES = DIALOGUE_VIEWPORT_HEIGHT_TILES - 1 - DIALOGUE_BOX_MIN_TILES;

function dialogueDimensionTiles(value: number, fallback: number, maximum: number): number {
  const parsed = Number.isFinite(value) && value > 0 ? Math.floor(value / DIALOGUE_TILE_SIZE) : fallback;
  return Math.max(DIALOGUE_BOX_MIN_TILES, Math.min(maximum, parsed));
}

function dialogueRectFromTiles(x: number, y: number, width: number, height: number): DialoguePreviewRect {
  return {
    x: x * DIALOGUE_TILE_SIZE,
    y: y * DIALOGUE_TILE_SIZE,
    width: width * DIALOGUE_TILE_SIZE,
    height: height * DIALOGUE_TILE_SIZE
  };
}

/** Frame geometry shared by the native dialogue renderer and the editor snapshot. */
export function dialoguePreviewBoxLayout(
  frameIndex: number,
  boxWidth = DEFAULT_DIALOGUE_BOX_WIDTH_TILES * DIALOGUE_TILE_SIZE,
  boxHeight = DEFAULT_DIALOGUE_BOX_HEIGHT_TILES * DIALOGUE_TILE_SIZE
): DialoguePreviewRect {
  const widthTiles = dialogueDimensionTiles(boxWidth, DEFAULT_DIALOGUE_BOX_WIDTH_TILES, DIALOGUE_BOX_MAX_WIDTH_TILES);
  const heightTiles = dialogueDimensionTiles(boxHeight, DEFAULT_DIALOGUE_BOX_HEIGHT_TILES, DIALOGUE_BOX_MAX_HEIGHT_TILES);
  if (frameIndex === 1) return dialogueRectFromTiles(1, 0, widthTiles, heightTiles);
  if (frameIndex === 2) {
    const y = Math.max(0, Math.floor((DIALOGUE_VIEWPORT_HEIGHT_TILES - heightTiles) / 2));
    return dialogueRectFromTiles(1, y, widthTiles, heightTiles);
  }
  if (frameIndex === 3) return dialogueRectFromTiles(1, 15, 18, 5);
  if (frameIndex === 4) return dialogueRectFromTiles(19, 15, 11, 5);
  const y = Math.max(0, DIALOGUE_VIEWPORT_HEIGHT_TILES - 1 - heightTiles);
  return dialogueRectFromTiles(1, y, widthTiles, heightTiles);
}

export function dialoguePreviewPortraitSlotLayout(
  frameIndex: number,
  portraitOnRight: boolean,
  boxLayout?: DialoguePreviewRect,
  portraitSize?: { width: number; height: number }
): DialoguePreviewRect {
  const box = boxLayout ?? dialoguePreviewBoxLayout(frameIndex);
  // Portrait assets include their own transparent border; do not add empty UI space.
  const width = portraitSize ? Math.max(3, Math.ceil(positiveInteger(portraitSize.width, 32) / DIALOGUE_TILE_SIZE)) : 8;
  const height = portraitSize ? Math.max(3, Math.ceil(positiveInteger(portraitSize.height, 32) / DIALOGUE_TILE_SIZE)) : 8;
  const x = portraitOnRight ? 29 - width : 1;
  if (frameIndex === 1) return dialogueRectFromTiles(x, 9, width, height);
  if (frameIndex === 2) return dialogueRectFromTiles(x, 0, width, Math.min(7, height));
  const slotY = frameIndex === 0
    ? Math.max(0, box.y / DIALOGUE_TILE_SIZE - height)
    : DIALOGUE_PORTRAIT_SLOT_Y / DIALOGUE_TILE_SIZE;
  return dialogueRectFromTiles(x, slotY, width, height);
}

export function dialoguePreviewNameLabelLayout(
  frameIndex: number,
  speaker: string,
  avoidPortraitSlots: boolean,
  portraitOnRight: boolean,
  portraitVisible = true,
  boxLayout?: DialoguePreviewRect,
  portraitSize?: { width: number; height: number }
): DialoguePreviewRect {
  const box = boxLayout ?? dialoguePreviewBoxLayout(frameIndex);
  const boxX = box.x / DIALOGUE_TILE_SIZE;
  const boxY = box.y / DIALOGUE_TILE_SIZE;
  const boxWidth = box.width / DIALOGUE_TILE_SIZE;
  let x = boxX;
  let availableWidth = boxWidth;
  if (avoidPortraitSlots && portraitVisible && frameIndex === 0) {
    const portrait = dialoguePreviewPortraitSlotLayout(frameIndex, portraitOnRight, box, portraitSize);
    const portraitX = portrait.x / DIALOGUE_TILE_SIZE;
    const portraitWidth = portrait.width / DIALOGUE_TILE_SIZE;
    if (!portraitOnRight && portraitX === boxX) {
      x = portraitX + portraitWidth;
      availableWidth = boxX + boxWidth - x;
    } else if (portraitOnRight && portraitX > boxX) {
      availableWidth = portraitX - boxX;
    }
  }
  if (availableWidth < 3) {
    x = boxX;
    availableWidth = boxWidth;
  }
  const speakerCharacters = Array.from(speaker || "").length;
  const labelWidth = Math.max(3, Math.min(availableWidth, speakerCharacters + 2));
  if (portraitOnRight && (!portraitVisible || (avoidPortraitSlots && frameIndex === 0))) {
    x = boxX + availableWidth - labelWidth;
  }
  let y = boxY - DIALOGUE_NAME_LABEL_HEIGHT_TILES;
  if (avoidPortraitSlots && portraitVisible && frameIndex === 2) y = boxY + box.height / DIALOGUE_TILE_SIZE;
  if (y < 0) y = boxY + box.height / DIALOGUE_TILE_SIZE;
  if (y + DIALOGUE_NAME_LABEL_HEIGHT_TILES > 20) y = boxY;
  if (x + labelWidth > 32) x = 32 - labelWidth;
  return dialogueRectFromTiles(x, y, labelWidth, DIALOGUE_NAME_LABEL_HEIGHT_TILES);
}

/** Resolves the frozen portrait frame the native sprite animation starts with. */
export function dialoguePreviewPortraitSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  frameWidth?: number,
  frameHeight?: number,
  frameIndex = 0
): DialoguePreviewPortraitSourceRect {
  const safeWidth = Number.isFinite(sourceWidth) && sourceWidth > 0 ? Math.floor(sourceWidth) : 0;
  const safeHeight = Number.isFinite(sourceHeight) && sourceHeight > 0 ? Math.floor(sourceHeight) : 0;
  if (safeWidth === 0 || safeHeight === 0) return { x: 0, y: 0, width: 0, height: 0 };

  const configuredWidth = Number.isFinite(frameWidth) && (frameWidth ?? 0) > 0
    ? Math.floor(frameWidth as number)
    : undefined;
  const configuredHeight = Number.isFinite(frameHeight) && (frameHeight ?? 0) > 0
    ? Math.floor(frameHeight as number)
    : undefined;
  // Imported portrait sheets from before frame metadata existed use square frames
  // laid out horizontally (for example, the 64x32 Guardian sheet).
  const resolvedWidth = Math.min(
    safeWidth,
    configuredWidth ?? (safeWidth >= safeHeight * 2 && safeWidth % safeHeight === 0 ? safeHeight : safeWidth)
  );
  const resolvedHeight = Math.min(safeHeight, configuredHeight ?? safeHeight);
  const columns = Math.max(1, Math.floor(safeWidth / resolvedWidth));
  const rows = Math.max(1, Math.floor(safeHeight / resolvedHeight));
  const frameCount = columns * rows;
  const resolvedFrameIndex = Number.isFinite(frameIndex)
    ? Math.max(0, Math.min(frameCount - 1, Math.floor(frameIndex)))
    : 0;
  return {
    x: (resolvedFrameIndex % columns) * resolvedWidth,
    y: Math.floor(resolvedFrameIndex / columns) * resolvedHeight,
    width: resolvedWidth,
    height: resolvedHeight
  };
}

/** Resolves static dialogue surfaces from the same frame rules used by the Engine export. */
export function dialoguePreviewLayoutForSettings(
  settings: Record<string, unknown> | DialogueUiSettingsContract | null | undefined,
  speaker = "",
  portraitSlot?: string,
  portraitVisible = true,
  portraitSize?: { width: number; height: number }
): DialoguePreviewLayout {
  const resolved = resolveDialogueUiSettings(settings as Record<string, unknown> | null | undefined);
  const frameIndex = buildEngineDialogueFrameIndex(settings as Record<string, unknown> | null | undefined);
  const portraitOnRight = typeof portraitSlot === "string" && portraitSlot.trim()
    ? /^(right|direita)$/i.test(portraitSlot.trim())
    : /^(right|direita)$/i.test(resolved.portraitPosition.trim());
  const box = dialoguePreviewBoxLayout(frameIndex, resolved.boxWidth, resolved.boxHeight);
  const text = {
    x: box.x + DIALOGUE_TILE_SIZE,
    y: box.y + DIALOGUE_TILE_SIZE,
    width: Math.max(DIALOGUE_TILE_SIZE, box.width - DIALOGUE_TILE_SIZE * 2),
    height: Math.max(DIALOGUE_TILE_SIZE, box.height - DIALOGUE_TILE_SIZE * 2)
  };
  return {
    frameIndex,
    box,
    text,
    portraitSlot: dialoguePreviewPortraitSlotLayout(frameIndex, portraitOnRight, box, portraitSize),
    nameLabel: dialoguePreviewNameLabelLayout(
      frameIndex,
      speaker,
      resolved.portraitLayout === "fixed_slots",
      portraitOnRight,
      portraitVisible,
      box,
      portraitSize
    ),
    portraitOnRight
  };
}

export const dialoguePreviewViewport = {
  width: DIALOGUE_VIEWPORT_WIDTH,
  height: DIALOGUE_VIEWPORT_HEIGHT,
  tileSize: DIALOGUE_TILE_SIZE
} as const;

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function dialogueString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function resolveDialogueUiSettings(
  settings: Record<string, unknown> | null | undefined
): DialogueUiSettingsContract {
  const source = settings && typeof settings === "object" ? settings : {};
  const portraitLayout = typeof source.portraitLayout === "string"
    && source.portraitLayout.trim().toLowerCase() === "fixed_slots"
    ? "fixed_slots"
    : "inline";
  const nameLabelMode = typeof source.nameLabelMode === "string"
    && source.nameLabelMode.trim().toLowerCase() === "above"
    ? "above"
    : "inline";
  return {
    boxImage: dialogueString(source.boxImage, "ui/dialogue_box.png"),
    selectorImage: dialogueString(source.selectorImage, "ui/dialogue_cursor.png"),
    font: dialogueString(source.font, "GBA padrao"),
    boxPosition: dialogueString(source.boxPosition, "Inferior"),
    boxWidth: positiveInteger(source.boxWidth, 224),
    boxHeight: positiveInteger(source.boxHeight, DEFAULT_DIALOGUE_BOX_HEIGHT_TILES * DIALOGUE_TILE_SIZE),
    showPortrait: typeof source.showPortrait === "boolean" ? source.showPortrait : true,
    showCharacterName: typeof source.showCharacterName === "boolean" ? source.showCharacterName : true,
    portraitPosition: dialogueString(source.portraitPosition, "Esquerda"),
    portraitLayout,
    nameLabelMode,
    textSpeed: dialogueString(source.textSpeed, "Normal")
  };
}

/** Dialogue box frame index consumed by set_dialogue_frame during room boot. */
export function buildEngineDialogueFrameIndex(
  settings: Record<string, unknown> | null | undefined
): number {
  const raw = resolveDialogueUiSettings(settings).boxPosition.toLowerCase();
  if (raw.includes("superior") || raw.includes("top")) return 1;
  if (raw.includes("centro") || raw.includes("center") || raw.includes("meio") || raw.includes("middle")) return 2;
  return DEFAULT_DIALOGUE_FRAME_INDEX;
}

/** Dialogue text wrap columns derived from settings.uiDialogs.boxWidth (8px glyph cells). */
export function buildEngineDialogueWrapColumns(
  settings: Record<string, unknown> | null | undefined
): number {
  const boxWidth = resolveDialogueUiSettings(settings).boxWidth;
  return Math.max(8, Math.min(40, Math.floor(boxWidth / 8)));
}

/** Dialogue text wrap lines derived from settings.uiDialogs.boxHeight (8px glyph rows). */
export function buildEngineDialogueWrapLines(
  settings: Record<string, unknown> | null | undefined
): number {
  const boxHeight = resolveDialogueUiSettings(settings).boxHeight;
  return Math.max(1, Math.min(6, Math.floor(boxHeight / DIALOGUE_TILE_SIZE) - 2));
}

function buildEngineDialogueBoxWidthTiles(settings: Record<string, unknown> | null | undefined): number {
  return dialogueDimensionTiles(
    resolveDialogueUiSettings(settings).boxWidth,
    DEFAULT_DIALOGUE_BOX_WIDTH_TILES,
    DIALOGUE_BOX_MAX_WIDTH_TILES
  );
}

function buildEngineDialogueBoxHeightTiles(settings: Record<string, unknown> | null | undefined): number {
  return dialogueDimensionTiles(
    resolveDialogueUiSettings(settings).boxHeight,
    DEFAULT_DIALOGUE_BOX_HEIGHT_TILES,
    DIALOGUE_BOX_MAX_HEIGHT_TILES
  );
}

export function buildEngineDialogueUiConfig(
  settings: Record<string, unknown> | null | undefined
): EngineDialogueUiConfig {
  const rawSource = settings && typeof settings === "object" ? settings : {};
  const source = resolveDialogueUiSettings(settings);
  const config: EngineDialogueUiConfig = {
    frame_index: buildEngineDialogueFrameIndex(rawSource),
    wrap_columns: buildEngineDialogueWrapColumns(rawSource),
    wrap_lines: buildEngineDialogueWrapLines(rawSource),
    box_width: buildEngineDialogueBoxWidthTiles(rawSource),
    box_height: buildEngineDialogueBoxHeightTiles(rawSource)
  };
  const boxImage = typeof rawSource.boxImage === "string" ? rawSource.boxImage.trim() : "";
  const selectorImage = typeof rawSource.selectorImage === "string" ? rawSource.selectorImage.trim() : "";
  const font = typeof rawSource.font === "string" ? rawSource.font.trim() : "";
  const portraitPosition = typeof rawSource.portraitPosition === "string" ? rawSource.portraitPosition.trim() : "";
  const portraitLayout = typeof rawSource.portraitLayout === "string" ? rawSource.portraitLayout.trim().toLowerCase() : "";
  const nameLabelMode = typeof rawSource.nameLabelMode === "string" ? rawSource.nameLabelMode.trim().toLowerCase() : "";
  if (boxImage) config.box_image = boxImage;
  if (selectorImage) config.selector_image = selectorImage;
  if (font) config.font = font;
  if (typeof rawSource.showPortrait === "boolean") config.show_portrait = source.showPortrait;
  if (typeof rawSource.showCharacterName === "boolean") config.show_character_name = source.showCharacterName;
  if (portraitPosition) config.portrait_position = portraitPosition;
  if (portraitLayout === "fixed_slots" || portraitLayout === "inline") config.portrait_layout = portraitLayout;
  if (nameLabelMode === "above" || nameLabelMode === "inline") config.name_label_mode = nameLabelMode;
  return config;
}

export function buildEngineDialogueUiConfigChanged(
  settings: Record<string, unknown> | null | undefined
): boolean {
  const source = settings && typeof settings === "object" ? settings : {};
  const config = buildEngineDialogueUiConfig(source);
  return config.frame_index !== DEFAULT_DIALOGUE_FRAME_INDEX
    || config.wrap_columns !== DEFAULT_DIALOGUE_WRAP_COLUMNS
    || config.wrap_lines !== DEFAULT_DIALOGUE_WRAP_LINES
    || config.box_width !== DEFAULT_DIALOGUE_BOX_WIDTH_TILES
    || config.box_height !== DEFAULT_DIALOGUE_BOX_HEIGHT_TILES
    || Boolean(config.box_image)
    || Boolean(config.selector_image)
    || Boolean(config.font)
    || typeof config.show_portrait === "boolean"
    || typeof config.show_character_name === "boolean"
    || Boolean(config.portrait_position)
    || Boolean(config.portrait_layout)
    || Boolean(config.name_label_mode);
}

/** Top-down player walk speed in tiles/frame units consumed by topdown_project.player.speed. */
export function buildEngineTopdownPlayerSpeed(
  settings: Record<string, unknown> | null | undefined
): number {
  const source = settings && typeof settings === "object" ? settings : {};
  const next = numberOrNull(source.walkSpeed);
  if (next === null || next <= 0) return 1;
  return next;
}

/** Actor collision/render size in pixels derived from settings.topdown.gridSize (8 or 16). */
export function buildEngineTopdownActorSizePx(
  settings: Record<string, unknown> | null | undefined
): number {
  const source = settings && typeof settings === "object" ? settings : {};
  const raw = typeof source.gridSize === "string" ? source.gridSize : String(source.gridSize ?? "");
  const match = /(\d+)/.exec(raw);
  const parsed = match ? Number(match[1]) : 16;
  return parsed === 8 ? 8 : 16;
}

export interface EngineProjectSaveConfig {
  enabled: boolean;
  autosave: boolean;
  save_type?: "flash1m";
  signature: "GBUS";
  slot_count: number;
  slot_capacity: number;
  offset: number;
  version: number;
  ui: SaveMenuBuilderConfig;
}

export interface EngineSaveUiProfileOverride {
  profileId?: string;
  customLabels?: boolean;
}

/** Dialogue typewriter delay in frames for set_dialogue_text_speed (settings.uiDialogs.textSpeed). */
export function buildEngineDialogueTextSpeedFrames(
  settings: Record<string, unknown> | null | undefined
): number {
  const source = settings && typeof settings === "object" ? settings : {};
  const raw = typeof source.textSpeed === "string" ? source.textSpeed.trim().toLowerCase() : "";
  if (!raw) return 2;
  const numeric = Number.parseInt(raw, 10);
  if (Number.isFinite(numeric) && /^\d+/.test(raw)) {
    return Math.max(0, Math.min(255, numeric));
  }
  if (raw.includes("instant")) return 0;
  if (raw.includes("rapida") || raw.includes("rápida") || raw.includes("fast")) return 1;
  if (raw.includes("lenta") || raw.includes("slow")) return 4;
  return 2;
}

/** Character blip SFX asset name from settings.uiDialogs.characterSound. */
export function buildEngineDialogueCharacterSound(
  settings: Record<string, unknown> | null | undefined
): string | null {
  const source = settings && typeof settings === "object" ? settings : {};
  const value = typeof source.characterSound === "string" ? source.characterSound.trim() : "";
  return value || null;
}

/** SRAM save block consumed by topdown_project.save / platformer_project.save in assetc. */
export function buildEngineProjectSaveConfig(
  settings: Record<string, unknown> | null | undefined,
  uiProfile?: EngineSaveUiProfileOverride
): EngineProjectSaveConfig {
  const source = settings && typeof settings === "object" ? settings : {};
  const slots = numberOrNull(source.slots);
  const autoSave = typeof source.autoSave === "boolean" ? source.autoSave : true;
  const manualSave = typeof source.manualSave === "boolean" ? source.manualSave : true;
  const saveType = typeof source.saveType === "string" ? source.saveType.trim().toLowerCase() : "sram";
  const hasSram = saveType === "sram";
  const hasFlash1M = saveType === "flash1m";
  const supportedSave = hasSram || hasFlash1M;
  const ui = deriveSaveMenuBuilder({
    ...source,
    ...(uiProfile?.profileId ? { profileId: uiProfile.profileId } : {}),
    ...(uiProfile?.customLabels !== undefined ? { customLabels: uiProfile.customLabels } : {})
  });
  // Flash1M erases whole 4 KiB sectors; each slot must own one sector.
  const slotCapacity = hasFlash1M ? 4096 : 2048;
  const maximumSlotCount = Math.floor((32 * 1024) / slotCapacity);
  const slotCount = slots !== null && slots > 0
    ? Math.min(maximumSlotCount, Math.round(slots))
    : 3;
  return {
    enabled: supportedSave && (autoSave || manualSave),
    autosave: supportedSave && autoSave,
    ...(hasFlash1M ? { save_type: "flash1m" as const } : {}),
    signature: "GBUS",
    slot_count: slotCount,
    slot_capacity: slotCapacity,
    offset: 0,
    version: 1,
    ui: {
      ...ui,
      enabled: supportedSave && manualSave,
      slotCount
    }
  };
}
