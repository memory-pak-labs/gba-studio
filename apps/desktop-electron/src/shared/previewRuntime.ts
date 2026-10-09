import { resolveProjectConstantCommand } from "./projectConstants.js";
import { resolveSceneDialogueUiSettings } from "./interfaceThemes.js";
import { eventCommandRuntimeVerbs } from "./eventCommandLibrary.js";
import { eventCommandRecipeRuntimeVerbs } from "./eventCommandRecipeLibrary.js";
import { eventCommandIntegrationIssue, eventCommandSupport } from "./eventCommandSupport.js";
import { eventCommandReview } from "./eventCommandReview.js";
import { isLutaEventVerb, parseLutaEventCommand } from "./lutaEventCommands.js";
import { createLutaCombatState, applyLutaCombatEvent, tickLutaCombat, type LutaCombatState } from "./lutaCombat.js";
import { buildAssetcAudioPackGeneration } from "./engineProjectExport.js";
import { audioSourceAsset } from "./audioContract.js";
import { hasPreviewDebuggerBreakpoint } from "./gbaDebugger.js";
import { lookupPluginDataTableRow } from "./gbaStudioPluginDataTables.js";
import { isPluginPreviewVerb, rewritePluginPreviewCommand } from "./gbaStudioPluginPreview.js";
import { emptyProjectPluginRegistry, type ProjectPluginRegistry } from "./gbaStudioPlugins.js";
import {
  activeGbaBackgroundLayers,
  gbaRenderLayers,
  gbaTileSizePx,
  resolveGbaActorSprite,
  resolveGbaActorSpriteFrame,
  resolveGbaRoomRenderLayers,
  type GbaBackgroundRenderLayer,
  type GbaRenderDiagnostic,
  type GbaRoomRenderLayers,
  type GbaRoomTilesetRenderLayer
} from "./gbaRendering.js";
import { gbaVideoModeDefinition } from "./gbaVideoModes.js";
import type { GBAProjectData } from "./projectFile.js";
import { findSceneRouteTable, resolveSceneRoute } from "./sceneRouteTables.js";
import {
  normalizeSceneTransition,
  sceneTransitionFromProjectSettings,
  sceneTransitionUsesFade,
  sceneTransitionUsesVisualEffect,
  sceneTransitionVisualEffect,
  type SceneTransitionStyle
} from "./sceneTransition.js";
import {
  normalizeGBASceneDocument,
  type GBASceneCampaignDocument
} from "../../../../packages/project-contract/src/index.js";
import { expandEventProcedures } from "./eventProcedures.js";
import {
  deriveProjectLocalization,
  localizedDialogueChoices,
  localizedDialogueText,
  type ProjectLocale
} from "./projectLocalization.js";
import { projectIsometricCoordinate } from "./isometricProjection.js";
import { deriveIsometricCameraPositionForPlayer } from "./isometricCamera.js";
import { blockedCollisionCellsFromRoom } from "./roomCollisionTypes.js";
import {
  battleRpgSceneConfigFromRuntime,
  dungeonCrawlerSceneConfigFromRuntime,
  isometricSceneConfigFromRuntime,
  pointClickSceneConfigFromRuntime,
  platformerSceneConfigFromRuntime,
  resolveSceneRuntime,
  racingSceneConfigFromRuntime,
  lutaSceneConfigFromRuntime,
  worldMapSceneConfigFromRuntime,
  visualNovelSceneConfigFromRuntime,
  cutsceneSceneConfigFromRuntime,
  shmupSceneConfigFromRuntime,
  type SceneRuntimeConfig
} from "./sceneTypeProfiles.js";
import {
  defaultRoomConnectionEntryArea,
  defaultRoomConnectionExitArea,
  roomConnectionArrival
} from "./roomsWorkspace.js";
import {
  createPlatformerPreviewBody,
  stepPlatformerPreview,
  stepPlatformerBlankPreview,
  type PlatformerPreviewBody,
  type PlatformerPreviewInput,
  type PlatformerPreviewMap
} from "./platformerPreview.js";
import { sceneTypeLabel } from "./sceneTypes.js";
import {
  buildEngineTopdownPlayerSpeed,
  buildEngineTopdownActorSizePx,
  resolveDialogueUiSettings,
  resolveSceneRuntimePreviewProfile,
  type DialogueNameLabelMode,
  type SceneRuntimePreviewProfile
} from "./sceneRuntimeExport.js";
import {
  buildProjectRuntimeCapabilityManifest,
  type ProjectRuntimeCapabilityManifest
} from "./runtimeCapabilities.js";
import { HUD_PROJECT_PRESET_ID, resolveExplicitHudPresetBinding } from "./hudPresets.js";
import {
  applyIsometricTacticalAction,
  createIsometricTacticalState,
  type IsometricTacticalActorPosition,
  type IsometricTacticalActionResult,
  type IsometricTacticalState,
  type IsometricTacticalTile,
  type IsometricTacticalVisualEvent
} from "./isometricTactical.js";
import {
  ISO_TACTICAL_AUDIO_CUES,
  normalizeIsometricTacticalPresentation,
  type IsoTacticalAnimationState,
  type IsoTacticalAssetStatus,
  type IsoTacticalAudioCue,
  type IsoTacticalDirection,
  type IsoTacticalPresentationConfig,
  type SceneTacticalCapabilityID
} from "./isometricTacticalPresentation.js";
import {
  resolveDungeonCrawlerFeatureRuntime,
  resolveTopdownFeatureRuntime,
  resolveSceneCapabilityManifest,
  type DungeonCrawlerFeatureRuntimeConfig,
  type TopdownFeatureRuntimeConfig
} from "./sceneFeatureModules.js";
import {
  normalizeSceneComposition,
  sceneCompositionFromAffinePresentation,
  sceneCompositionVideoMode,
  type SceneCompositionConfig
} from "./sceneComposition.js";
import {
  resolveShmupSceneComposition,
  type ShmupSceneCompositionContract
} from "./shmupSceneComposition.js";
import { applyLinkCablePreviewCommand, defaultLinkCablePreviewState, parseLinkCableCommand, type LinkCablePreviewState } from "./linkCableRuntime.js";
import {
  MENU_TEXT_INPUT_ALPHABET,
  MENU_TEXT_INPUT_KEYBOARD_GRID,
  MENU_TEXT_INPUT_SIDE_KEYBOARD_GRID,
  normalizeMenuSceneConfig,
  type MenuEmbeddedScreenConfig,
  type MenuSceneConfig,
  type MenuSceneItem,
  type MenuSceneItemBinding,
  type MenuSceneProfile,
  type MenuScenePresentationMode
} from "./menuScene.js";
import {
  isSpriteAnimationType,
  normalizeSpriteDirection,
  normalizeSpriteStateSlots,
  resolveSpriteStateForActor,
  type SpriteStateContract
} from "./spriteAnimationState.js";

export type PreviewRuntimeAction = "up" | "down" | "left" | "right" | "action" | "back" | "debug" | "start" | "select";

const previewMovementActions = new Set<PreviewRuntimeAction>(["up", "down", "left", "right"]);

export function isPreviewMovementAction(action: PreviewRuntimeAction): boolean {
  return previewMovementActions.has(action);
}

export function previewPlayerMovementStepMs(speed = 1): number {
  return (gbaTileSizePx / Math.max(1, speed)) * (1000 / 60);
}

const previewIsometricFreeMovementSpeedTilesPerSecond = 3.75;
const previewIsometricFreeMovementStepTiles = 1 / 16;

export interface PreviewRuntimeRoom {
  id: string;
  name: string;
  displayName: string;
  campaign: PreviewRuntimeCampaign | null;
  sceneType: string;
  sceneTypeLabel: string;
  runtime: SceneRuntimeConfig;
  width: number;
  height: number;
  heightLevels: number[];
  tileCells: number[];
  collisionTypes: string[];
  collisionCells: boolean[];
  platformerPreviewEnabled: boolean;
  cameraZones: PreviewRuntimeCameraZone[];
  renderLayers: GbaRoomRenderLayers;
  composition: SceneCompositionConfig;
  tacticalPresentation: PreviewIsometricTacticalPresentation | null;
  shmupComposition?: ShmupSceneCompositionContract;
  shmupCompositionIssues?: string[];
  /** @deprecated Use renderLayers.backgrounds.bg2 */
  bg2: GbaRoomTilesetRenderLayer;
  backgroundAssetName: string | null;
  backgroundRenderMode: string;
  hudPresetId: string | null;
  music: string | null;
  eventBindings: Record<string, string>;
}

export type PreviewRuntimeCampaign = GBASceneCampaignDocument;

export interface PreviewRuntimeCameraZone {
  id: string;
  name: string;
  area: { x: number; y: number; width: number; height: number };
  bounds: { x: number; y: number; width: number; height: number };
  offset: { x: number; y: number };
  lockX: boolean;
  lockY: boolean;
}

export type PreviewRuntimeProfile = SceneRuntimePreviewProfile & { label: string };

export interface PreviewRuntimePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  direction: string;
  renderLayer: typeof gbaRenderLayers.obj;
  spriteSheet: string | null;
  spriteAsset: PreviewRuntimeAssetRef | null;
  animationName: string | null;
  animationFrame: PreviewRuntimeSpriteFrame | null;
}

export type PreviewLutaVisualState = "idle" | "attack" | "special" | "guard" | "hurt";

export type PreviewLutaVisualFallback = "none" | "idle_animation" | "static_metasprite";

export interface PreviewLutaVisualStateData {
  state: PreviewLutaVisualState;
  animationName: string | null;
  frameIndex: number;
  elapsedMs: number;
  fallback: PreviewLutaVisualFallback;
  guarding: boolean;
  hitstunFrames: number;
}

export interface PreviewLutaVisualRuntimeStatus {
  guarding?: boolean;
  hitstunFrames?: number;
}

export interface PreviewRuntimeAssetRef {
  bundledDefaultAsset: string | null;
  kind: string;
  name: string;
  source: string | null;
}

export interface PreviewIsometricTacticalAssetBinding {
  id: string;
  reference: string;
  consumer: "bg" | "obj" | "ui" | "audio";
  required: boolean;
  status: IsoTacticalAssetStatus | null;
  asset: PreviewRuntimeAssetRef | null;
}

export interface PreviewIsometricTacticalUnitPresentation {
  actorId: string;
  actorIndex: number | null;
  sheet: string;
  asset: PreviewRuntimeAssetRef | null;
  animations: Partial<Record<`${IsoTacticalAnimationState}_${IsoTacticalDirection}`, string>>;
}

export interface PreviewIsometricTacticalPropPresentation {
  id: string;
  kind: "objective" | "cover" | "elevation";
  tile: IsometricTacticalTile;
  animated: boolean;
  asset: PreviewRuntimeAssetRef | null;
}

export interface PreviewIsometricTacticalPresentation {
  capabilities: SceneTacticalCapabilityID[];
  layers: {
    surface: "BG2" | null;
    grid: "BG1" | null;
    hud: "BG0" | null;
    objects: "OBJ";
    collision: "scene_data";
  };
  assets: PreviewIsometricTacticalAssetBinding[];
  surfaceAsset: PreviewRuntimeAssetRef | null;
  gridAsset: PreviewRuntimeAssetRef | null;
  hudLayout: string | null;
  units: PreviewIsometricTacticalUnitPresentation[];
  props: PreviewIsometricTacticalPropPresentation[];
  feedback: {
    cursor: PreviewRuntimeAssetRef | null;
    range: PreviewRuntimeAssetRef | null;
    target: PreviewRuntimeAssetRef | null;
    emotes: PreviewRuntimeAssetRef | null;
    feedback: PreviewRuntimeAssetRef | null;
  } | null;
  audio: {
    music: string | null;
    musicAsset: PreviewRuntimeAssetRef | null;
    cues: Partial<Record<IsoTacticalAudioCue, string>>;
    cueAssets: Partial<Record<IsoTacticalAudioCue, PreviewRuntimeAssetRef | null>>;
  } | null;
}

export interface PreviewRuntimeSpriteFrame {
  animationID: string;
  animationName: string;
  frameHeight: number;
  frameIndex: number;
  frameWidth: number;
  fps: number;
  heightTiles: number;
  layer: typeof gbaRenderLayers.obj;
  originX: number;
  originY: number;
  sourceHeight: number;
  sourceSheets: string[];
  sourceWidth: number;
  sourceX: number;
  sourceY: number;
  spriteSheet: string;
  tileCount: number;
  widthTiles: number;
}

export interface PreviewRuntimeDialogue {
  key: string;
  mode: "dialogue" | "choice";
  character: string;
  portrait: string;
  portraitAsset: PreviewRuntimeAssetRef | null;
  emote: string;
  emoteAsset: PreviewRuntimeAssetRef | null;
  textSound: string;
  textSoundAsset: PreviewRuntimeAssetRef | null;
  confirmSound: string;
  confirmSoundAsset: PreviewRuntimeAssetRef | null;
  text: string;
  choices: string[];
  selectedChoiceIndex: number;
}

export interface PreviewRuntimeDialogueUi {
  boxAsset: PreviewRuntimeAssetRef | null;
  boxImage: string;
  boxPosition: string;
  boxWidth: number;
  boxHeight: number;
  font: string;
  selectorAsset: PreviewRuntimeAssetRef | null;
  selectorImage: string;
  showPortrait: boolean;
  portraitPosition: string;
  showCharacterName: boolean;
  nameLabelMode: DialogueNameLabelMode;
  textSpeed: string;
}

export type PreviewBattleMenuPage = "root" | "moves" | "targets" | "party" | "items" | "notice";

export interface PreviewBattleMenu {
  visible: boolean;
  page: PreviewBattleMenuPage;
  selectedIndex: number;
  notice: string | null;
  targetSide: "party" | "enemy" | null;
  selectedAbilityIndex: number;
}

export type PreviewBattleOutcome = "inProgress" | "victory" | "defeat" | "escaped";

export type PreviewRuntimeStartMenuPage = "inventory" | "map" | "missions" | "profile" | "root" | "settings" | "shop";

export interface PreviewRuntimeStartMenu {
  visible: boolean;
  page: PreviewRuntimeStartMenuPage;
  selectedIndex: number;
  notice: string | null;
}

export interface PreviewRuntimeStartMenuItem {
  id: string;
  label: string;
  detail?: string;
  enabled?: boolean;
}

export type PreviewDungeonInteractionMode = "none" | "inventory" | "battle" | "notice" | "map";

export interface PreviewDungeonInteraction {
  mode: PreviewDungeonInteractionMode;
  selectedIndex: number;
  notice: string | null;
  noticeReturnsToBattle: boolean;
  mapScrollX: number;
  mapScrollY: number;
  exploredCells: string[];
  explorationPlayerHp: number;
  enemyHp: number;
  playerHp: number;
  enemyDefeated: boolean;
  compassLabel: string;
}

export type PreviewDungeonHudPanel = "map" | "items";

export interface PreviewDungeonHudState {
  visible: boolean;
  panel: PreviewDungeonHudPanel;
}

export interface PreviewDungeonHudPresentation extends PreviewDungeonHudState {
  compassLabel: string;
  hp: number;
  maxHp: number;
  item: PreviewDungeonInventoryItem | null;
  map: PreviewDungeonMap | null;
}

export interface PreviewDungeonInventoryItem {
  id: string;
  label: string;
  detail: string;
  enabled: boolean;
}

export interface PreviewDungeonMapCell {
  x: number;
  y: number;
  glyph: "?" | "X" | "." | "P" | " ";
  visible: boolean;
  blocked: boolean;
  player: boolean;
}

export interface PreviewDungeonMap {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  rows: string[];
  cells: PreviewDungeonMapCell[];
}

export interface PreviewRuntimeSceneMenu {
  visible: boolean;
  selectedIndex: number;
  notice: string | null;
  screenID: string | null;
  menuProfile: MenuSceneProfile | null;
  hudPresetId: string | null;
  elapsedFrames: number;
  stack: string[];
}

export interface PreviewRuntimeSceneMenuItem {
  id: string;
  label: string;
  detail?: string;
  enabled: boolean;
  action: MenuSceneItem["action"];
}

export interface PreviewRuntimeTextInputState {
  active: boolean;
  variableName: string | null;
  value: string;
  maxLength: number;
  cursorIndex: number;
  keyboardIndex: number;
  lowercase: boolean;
  layout: "hidden" | "grid";
}

export interface PreviewRuntimeEventLogItem {
  eventName: string;
  command: string;
  result: "audio" | "dialogue" | "event" | "noop" | "room" | "script" | "skipped" | "unsupported";
  detail: string | null;
}

export interface PreviewRuntimeExecutionTraceItem {
  eventName: string;
  command: string;
  status: "blocked" | "executed" | "skipped";
  detail: string | null;
}

export interface PreviewRuntimeChoiceEvent {
  dialogueKey: string;
  choiceIndex: number;
  eventName: string;
}

export interface PreviewRuntimeDiagnostic {
  id: string;
  severity: "warning" | "error";
  message: string;
}

export interface PreviewRuntimeDebug {
  visible: boolean;
  lines: string[];
}

export type PreviewDebuggerRunMode = "continuous" | "step";

export type PreviewConditionalBranchMode = null | "then_until_else" | "seek_else" | "skip_else";

export type PreviewConditionalScopeMode = "then" | "seek_else" | "skip_else" | "skip_to_end";

export interface PreviewConditionalScope {
  mode: PreviewConditionalScopeMode;
}

export interface PreviewNativeModal {
 kind: "menu" | "code" | "equip-slots" | "equip-items" | "shop";
 variable?: string; code?: string; expected?: number; cursor: number; slots?: number; slot?: number; pause: boolean;
}
export interface PreviewNativeThread { frame: PreviewRuntimeScriptFrame; wait: number; continuations: PreviewRuntimeScriptFrame[]; }
export interface PreviewNativeEvents {
 modal: PreviewNativeModal | null;
 threads: Record<string,PreviewNativeThread>;
 executingSegment: string | null;
 actorStates: Record<string,string>;
 actorEffects: Record<string,{kind:string,frames:number,intensity:number,visible:boolean}>;
 cancelledMovement: Record<string,boolean>;
 projectileSlots: Record<string,{sprite:string,damage:number,speed:number}>;
 projectiles: Array<{x:number,y:number,dx:number,dy:number,sprite:string,damage:number,speed:number,source:string}>;
 texts: Array<{x:number,y:number,layer:string,text:string}>;
 adventure: {state:string,frames:number};
}
function initialNativeEvents(): PreviewNativeEvents {
 return {modal:null,threads:{},executingSegment:null,actorStates:{},actorEffects:{},cancelledMovement:{},projectileSlots:{},projectiles:[],texts:[],adventure:{state:"ground",frames:0}};
}
const integratedNativeSimulationVerbs=new Set(["open_menu","open_shop","open_code_lock","open_equip_menu","draw_text","start_segment","stop_segment","set_adventure_state","push_actor","cancel_actor_movement","set_actor_animation_state","actor_effects","projectile_load_slot","launch_projectile_slot"]);

export interface PreviewRuntimeScriptFrame {
  callStack: string[];
  commandIndex: number;
  commands: string[];
  conditionalBranch: PreviewConditionalBranchMode;
  conditionalScopes: PreviewConditionalScope[];
  eventName: string;
  resolvedEventName: string;
  skipNextReason: string | null;
  repeatCommandIndex?: number;
  repeatIterations?: number;
  /** Native exit/enter callback scripts suppress the room-enter consumer. */
  triggerRoomEnter?: boolean;
  stepBudget?: number;
}

export interface PreviewRuntimeQueuedScript {
  eventName: string;
  commands?: string[];
  triggerRoomEnter: boolean;
}

export interface PreviewRuntimeDebuggerSession {
  breakpoints: string[];
  enabled: boolean;
  pauseReason: string | null;
  paused: boolean;
  runMode: PreviewDebuggerRunMode;
  resumePending: boolean;
  scriptFrame: PreviewRuntimeScriptFrame | null;
  stepPending: boolean;
}

export type PreviewRuntimeScalar = boolean | number | string;

export interface PreviewRuntimeCameraState {
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  fade: { mode: "in" | "out"; frames: number } | null;
  followPlayer: boolean;
  lockedToPlayer: boolean;
  properties: Record<string, PreviewRuntimeScalar>;
  shakeFrames: number;
  x: number;
  y: number;
}

export interface PreviewRuntimeSceneTransition {
  style: SceneTransitionStyle;
  phase: "reveal";
  durationFrames: number;
  elapsedFrames: number;
  progress: number;
  sourceRoomName: string | null;
  targetRoomName: string;
}

export type PreviewRuntimeAudioBus = "music" | "sfx" | "pcm_music" | "pcm_sfx";

export interface PreviewRuntimeAudioFadeState {
  start: number;
  target: number;
  totalFrames: number;
  remainingFrames: number;
  elapsedMs: number;
}

export interface PreviewRuntimeAudioMixState {
  volumes: Record<PreviewRuntimeAudioBus, number>;
  muted: Record<PreviewRuntimeAudioBus, boolean>;
  fades: Record<PreviewRuntimeAudioBus, PreviewRuntimeAudioFadeState | null>;
  lastPcmSfx: { volume: number; priority: number } | null;
}

export interface PreviewRuntimeVisualEffectState {
  effect: string;
  layer: string;
  durationFrames: number;
  remainingFrames: number;
  intensity: number;
  elapsedMs: number;
}

export interface PreviewRuntimeHudState {
  gameClock: { minutes: number; frames: number; mode: string; currentMinute: number; elapsedFrames: number } | null;
  hearts: { stat: string; x: number; y: number } | null;
  numbers: Record<string, { variable: string; x: number; y: number; digits: number }>;
  statBars: Record<string, { stat: string; x: number; y: number; width: number; orientation: string }>;
}

export interface PreviewIsometricTacticalState extends IsometricTacticalState {
  cursor: IsometricTacticalTile;
  lastVisualEvents: IsometricTacticalVisualEvent[];
  lastAudioCues: IsoTacticalAudioCue[];
}

export interface PreviewRuntimeStatState {
  value: number;
  max: number;
}

export interface PreviewRuntimeWalletState {
  value: number;
  max: number | null;
}

export interface PreviewRuntimeSaveSnapshot {
  schema?: 4;
  sequence?: number;
  timestampFrames?: number;
  title?: string;
  runtime: string;
  roomName: string;
  player: { x: number; y: number } | null;
  camera: PreviewRuntimeCameraState;
  sceneTransition?: PreviewRuntimeSceneTransition | null;
  variables: Record<string, PreviewRuntimeScalar>;
  inventory: Record<string, number>;
  wallet: Record<string, PreviewRuntimeWalletState>;
  flags: Record<string, boolean>;
  equippedItems: Record<string, string>;
  dialogueLocale?: ProjectLocale;
}

export interface PreviewRuntimeRtcState {
  provider: "fake";
  timestampFrames: number;
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
  second: number;
}

const previewRtcEpochMs = Date.UTC(2000, 0, 1, 0, 0, 0);

export function previewRuntimeRtcAtFrame(frame: number): PreviewRuntimeRtcState {
  const normalizedFrame = Math.max(0, Math.floor(Number.isFinite(frame) ? frame : 0));
  const date = new Date(previewRtcEpochMs + Math.floor(normalizedFrame / 60) * 1000);
  return {
    provider: "fake",
    timestampFrames: normalizedFrame,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds()
  };
}

function previewRuntimeRtcFieldValue(state: PreviewRuntimeState, field: string): number | null {
  if (!state.rtc) return null;
  switch (field.trim().toLowerCase().replaceAll("-", "_")) {
    case "year": return state.rtc.year;
    case "month": return state.rtc.month;
    case "day": return state.rtc.day;
    case "weekday": return state.rtc.weekday;
    case "hour": return state.rtc.hour;
    case "minute": return state.rtc.minute;
    case "second": return state.rtc.second;
    default: return null;
  }
}

export const PREVIEW_ACTOR_UPDATE_INTERVAL_MS = 1000 / 60;

export interface PreviewRuntimeState {
  ready: boolean;
  error: string | null;
  rooms: PreviewRuntimeRoom[];
  currentRoom: PreviewRuntimeRoom | null;
  runtimeProfile: PreviewRuntimeProfile;
  runtimeCapabilities: ProjectRuntimeCapabilityManifest;
  rtc: PreviewRuntimeRtcState | null;
  player: PreviewRuntimePlayer | null;
  actors: PreviewRuntimeActor[];
  lutaVisualStates: Record<string, PreviewLutaVisualStateData>;
  lutaCombat: LutaCombatState | null;
  triggers: PreviewRuntimeTrigger[];
  activeDialogue: PreviewRuntimeDialogue | null;
  dialogueUi: PreviewRuntimeDialogueUi;
  dialogueLocale: ProjectLocale;
  startMenu: PreviewRuntimeStartMenu;
  sceneMenu: PreviewRuntimeSceneMenu;
  textInput: PreviewRuntimeTextInputState;
  battleMenu: PreviewBattleMenu;
  dungeonInteraction: PreviewDungeonInteraction;
  dungeonHud: PreviewDungeonHudState;
  isometricTactical: PreviewIsometricTacticalState;
  isometricTacticalPresentation: PreviewIsometricTacticalPresentation | null;
  activeMusic: string | null;
  activeMusicAsset: PreviewRuntimeAssetRef | null;
  activeSfx: string | null;
  activeSfxAsset: PreviewRuntimeAssetRef | null;
  audioMix: PreviewRuntimeAudioMixState;
  camera: PreviewRuntimeCameraState;
  sceneTransition: PreviewRuntimeSceneTransition | null;
  platformerPhysics: PlatformerPreviewBody | null;
  platformerInputRequests: { jump: boolean; dash: boolean };
  activeCameraZoneID: string | null;
  visualEffect: PreviewRuntimeVisualEffectState | null;
  choiceEvents: PreviewRuntimeChoiceEvent[];
  eventLog: PreviewRuntimeEventLogItem[];
  equippedItems: Record<string, string>;
  executionTrace: PreviewRuntimeExecutionTraceItem[];
  flags: Record<string, boolean>;
  hud: PreviewRuntimeHudState;
  inventory: Record<string, number>;
  stats: Record<string, PreviewRuntimeStatState>;
  variables: Record<string, PreviewRuntimeScalar>;
  wallet: Record<string, PreviewRuntimeWalletState>;
  saveSlots: Record<number, PreviewRuntimeSaveSnapshot>;
  linkCable: LinkCablePreviewState;
  diagnostics: PreviewRuntimeDiagnostic[];
  debug: PreviewRuntimeDebug;
  debugger: PreviewRuntimeDebuggerSession;
  project: GBAProjectData;
  pluginRegistry: ProjectPluginRegistry;
  animationElapsedMs: number;
  movementElapsedMs: number;
  vehicleSpeed: number;
  battlePartyIndex: number;
  battleTargetIndex: number;
  battleTurnIndex: number;
  battlePartyHp: number[];
  battleEnemyHp: number[];
  battlePartyDefending: boolean[];
  battleEnemyDefending: boolean[];
  battleTurnPending: boolean;
  battleOutcome: PreviewBattleOutcome;
  battleLastEnemyTargetIndex: number;
  battleEscaped: boolean;
  playerAnimationFrameIndex: number;
  overlappingTriggerIDs: string[];
  actorUpdateElapsedMs: number;
  previewFrame: number;
  previewFrameElapsedMs: number;
  nativeEvents: PreviewNativeEvents;
  scriptWaitFrames: number;
  scriptContinuations: PreviewRuntimeScriptFrame[];
  scriptQueue: Array<string | PreviewRuntimeQueuedScript>;
  pausedSceneTypes: Record<string, boolean>;
  adventureCallbacks: Record<number, string>;
  platformCallbacks: Record<number, string>;
  platformerState: string;
  platformerRequestedState: string | null;
  platformerPlayerActive: boolean;
}

export interface PreviewRuntimeActor {
  id: string;
  name: string;
  roomName: string;
  x: number;
  y: number;
  z: number;
  renderLayer: typeof gbaRenderLayers.obj;
  spriteSheet: string | null;
  spriteAsset: PreviewRuntimeAssetRef | null;
  animationName: string | null;
  animationFrame: PreviewRuntimeSpriteFrame | null;
  active: boolean;
  animationFrameIndex: number;
  collisionBox: { x: number; y: number; width: number; height: number } | null;
  hitPoints?: number;
  visualOffsetX?: number;
  collisionEnabled: boolean;
  direction: string;
  eventName: string | null;
  eventBindings: Record<string, unknown>;
  gesture: { name: string; frames: number } | null;
  movementSpeed: number | null;
  spriteScale?: number;
  renderDiagnostics: GbaRenderDiagnostic[];
  visible: boolean;
}

export interface PreviewRuntimeTrigger {
  id: string;
  name: string;
  roomName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  eventName: string | null;
  onInteractEventName: string | null;
  onEnterEventName: string | null;
  onLeaveEventName: string | null;
  eventBindings: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function integerField(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function booleanField(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function projectArray(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function projectRooms(data: GBAProjectData): Record<string, unknown>[] {
  const scenas = projectArray(data, "scenas");
  if (scenas.length > 0) return scenas;

  const rooms = projectArray(data, "rooms");
  if (rooms.length > 0) return rooms;

  return [];
}

function eventBindings(record: Record<string, unknown>): Record<string, unknown> {
  return isRecord(record.eventBindings) ? record.eventBindings : {};
}

function eventBinding(record: Record<string, unknown>, key: string): string | null {
  return nullableString(eventBindings(record)[key]);
}

function roomName(room: Record<string, unknown>, index: number): string {
  return stringField(room.name, `room_${index + 1}`);
}

function roomID(room: Record<string, unknown>, index: number): string {
  return stringField(room.id, `room-${index + 1}`);
}

function tileCells(room: Record<string, unknown>, width: number, height: number): number[] {
  const tilemap = Array.isArray(room.tilemap) ? room.tilemap : [];
  return Array.from({ length: width * height }, (_, index) => {
    const value = tilemap[index];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  });
}

function collisionCells(room: Record<string, unknown>, width: number, height: number): boolean[] {
  return blockedCollisionCellsFromRoom(room, width, height, typeof room.sceneType === "string" ? room.sceneType : null);
}

function heightLevelCells(room: Record<string, unknown>, width: number, height: number): number[] {
  const levels = Array.isArray(room.heightLevels) ? room.heightLevels : [];
  return Array.from({ length: width * height }, (_, index) => {
    const value = levels[index];
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, Math.min(15, Math.floor(value)))
      : 0;
  });
}

const PLATFORMER_PREVIEW_FIELDS = [
  "jumpMinHeight",
  "jumpFrames",
  "jumpReduction",
  "airControl",
  "changeDirectionInAir",
  "airDeceleration",
  "dropThrough",
  "cameraDeadzoneX",
  "cameraLockEdge",
  "dashStyle",
  "dashMomentum",
  "dashThrough",
  "dashRechargeFrames"
] as const;

function toRuntimeRoom(data: GBAProjectData, room: Record<string, unknown>, index: number): PreviewRuntimeRoom {
  const sceneDocument = normalizeGBASceneDocument(room, index);
  const width = sceneDocument.sizeTiles.width;
  const height = sceneDocument.sizeTiles.height;
  const sceneType = sceneDocument.sceneType;
  const resolvedRuntime = resolveSceneRuntime(sceneType, room.runtime, data.settings);
  const rawRuntime = isRecord(room.runtime) ? room.runtime : {};
  const rawRuntimeConfig = isRecord(rawRuntime.config) ? rawRuntime.config : {};
  const composition = Object.hasOwn(rawRuntimeConfig, "composition")
    ? normalizeSceneComposition(rawRuntimeConfig.composition)
    : sceneCompositionFromAffinePresentation(rawRuntimeConfig.affine);
  const shmupCompositionResolution = sceneType === "shmup"
    ? resolveShmupSceneComposition({ ...rawRuntimeConfig, composition }, { widthTiles: width, heightTiles: height })
    : null;
  const platformerPreviewEnabled = sceneType === "platformer"
    && PLATFORMER_PREVIEW_FIELDS.some((field) => Object.hasOwn(rawRuntimeConfig, field));
  const menuConfig = resolvedRuntime.type === "menu"
    ? normalizeMenuSceneConfig(resolvedRuntime.config)
    : null;
  const tacticalPresentation = tacticalPresentationForRuntime(data, sceneType, resolvedRuntime, sceneDocument.name);
  const hudBinding = menuConfig?.hudMode === "none" ? null : resolveExplicitHudPresetBinding(data, {
    roomID: sceneDocument.id,
    scenePresetId: menuConfig?.hudPresetId,
    roomPresetId: sceneDocument.hudPresetId
  });
  const runtimeSceneRecord: Record<string, unknown> = {
    ...room,
    width,
    height,
    backgroundAssetName: sceneDocument.background.assetName,
    background: sceneDocument.background.assetName,
    tilemap: sceneDocument.tilemap.base,
    ...(sceneDocument.tilemap.foreground.length > 0 ? { foregroundTiles: sceneDocument.tilemap.foreground } : {}),
    ...(sceneDocument.collisionTypes.length > 0 ? { collisionTypes: sceneDocument.collisionTypes } : {})
  };
  const baseRenderLayers = resolveGbaRoomRenderLayers(data, runtimeSceneRecord, 0);
  const renderLayers = composition.enabled
    ? {
        ...baseRenderLayers,
        videoMode: sceneCompositionVideoMode(composition),
        videoModeLabel: gbaVideoModeDefinition(sceneCompositionVideoMode(composition)).label
      }
    : baseRenderLayers;
  const bg2 = { ...renderLayers.backgrounds.BG2, layer: gbaRenderLayers.bg2 };
  const cameraZones = (Array.isArray(room.cameraZones) ? room.cameraZones : [])
    .filter(isRecord)
    .map((zone, zoneIndex): PreviewRuntimeCameraZone => {
      const area = isRecord(zone.area) ? zone.area : {};
      const bounds = isRecord(zone.bounds) ? zone.bounds : {};
      const offset = isRecord(zone.offset) ? zone.offset : {};
      return {
        id: stringField(zone.id, `camera-zone-${zoneIndex + 1}`),
        name: stringField(zone.name, `Zona de camera ${zoneIndex + 1}`),
        area: {
          x: nonNegativeInteger(area.x, 0),
          y: nonNegativeInteger(area.y, 0),
          width: positiveInteger(area.width, 1),
          height: positiveInteger(area.height, 1)
        },
        bounds: {
          x: integerField(bounds.x, 0),
          y: integerField(bounds.y, 0),
          width: positiveInteger(bounds.width, width * gbaTileSizePx),
          height: positiveInteger(bounds.height, height * gbaTileSizePx)
        },
        offset: {
          x: integerField(offset.x, 0),
          y: integerField(offset.y, 0)
        },
        lockX: booleanField(zone.lockX, false),
        lockY: booleanField(zone.lockY, false)
      };
    });
  return {
    id: sceneDocument.id,
    name: sceneDocument.name,
    displayName: sceneDocument.displayName ?? sceneDocument.name,
    campaign: sceneDocument.campaign ?? null,
    sceneType,
    sceneTypeLabel: sceneTypeLabel(sceneType),
    runtime: resolvedRuntime,
    width,
    height,
    heightLevels: heightLevelCells(room, width, height),
    tileCells: bg2.tileCells,
    collisionTypes: sceneDocument.collisionTypes,
    renderLayers,
    bg2,
    tacticalPresentation,
    collisionCells: collisionCells(runtimeSceneRecord, width, height),
    platformerPreviewEnabled,
    cameraZones,
    backgroundAssetName: sceneDocument.background.assetName,
    backgroundRenderMode: sceneDocument.background.renderMode,
    composition,
    ...(shmupCompositionResolution ? {
      shmupComposition: shmupCompositionResolution.config,
      shmupCompositionIssues: shmupCompositionResolution.issues.map((issue) => issue.message)
    } : {}),
    hudPresetId: hudBinding ? hudBinding.requestedPresetId === HUD_PROJECT_PRESET_ID ? hudBinding.presetId : hudBinding.requestedPresetId ?? hudBinding.presetId : null,
    music: sceneDocument.music,
    eventBindings: sceneDocument.eventBindings
  };
}

function runtimeProfileForRoom(room: PreviewRuntimeRoom | null): PreviewRuntimeProfile {
  const sceneType = room?.sceneType ?? "topdown";
  const label = room?.sceneTypeLabel ?? sceneTypeLabel(sceneType);
  const configValue: unknown = room?.runtime.config;
  const config = isRecord(configValue) ? configValue : null;
  const profile = resolveSceneRuntimePreviewProfile(sceneType, {
    platformerPreviewEnabled: room?.platformerPreviewEnabled,
    modules: config && Object.hasOwn(config, "modules") ? config.modules : undefined,
    advancedCapabilities: config && Object.hasOwn(config, "capabilities") ? config.capabilities : undefined,
    tacticalCapabilities: config && Object.hasOwn(config, "tacticalCapabilities") ? config.tacticalCapabilities : undefined,
    tacticalPresentation: config && Object.hasOwn(config, "tacticalPresentation") ? config.tacticalPresentation : undefined,
    gameplayMode: config && Object.hasOwn(config, "gameplayMode") ? config.gameplayMode : undefined
  });
  return {
    ...profile,
    label,
  };
}

function startRoomName(data: GBAProjectData, rooms: PreviewRuntimeRoom[]): string | null {
  const settings = isRecord(data.settings) ? data.settings : {};
  const general = isRecord(settings.general) ? settings.general : {};
  return nullableString(general.startScene) ?? rooms[0]?.name ?? null;
}

function dialogueUiSettings(data: GBAProjectData, roomId?: string): PreviewRuntimeDialogueUi {
  const settings = isRecord(data.settings) ? data.settings : {};
  const uiDialogs = isRecord(settings.uiDialogs) ? settings.uiDialogs : {};
  const resolved = resolveSceneDialogueUiSettings(data, roomId);
  return {
    boxAsset: assetByName(data, resolved.boxImage),
    boxImage: resolved.boxImage,
    boxPosition: resolved.boxPosition,
    boxWidth: resolved.boxWidth,
    boxHeight: resolved.boxHeight,
    font: resolved.font,
    selectorAsset: assetByName(data, resolved.selectorImage),
    selectorImage: resolved.selectorImage,
    showPortrait: resolved.showPortrait,
    portraitPosition: resolved.portraitPosition,
    showCharacterName: resolved.showCharacterName,
    nameLabelMode: resolved.nameLabelMode,
    textSpeed: resolved.textSpeed
  };
}

function startMenuUiSettings(data: GBAProjectData): Record<string, unknown> {
  const settings = isRecord(data.settings) ? data.settings : {};
  return isRecord(settings.uiDialogs) ? settings.uiDialogs : {};
}

function startMenuPresentationMode(state: PreviewRuntimeState): MenuScenePresentationMode {
  const configured = startMenuUiSettings(state.project).startMenuPresentation;
  if (configured === "scene" || configured === "hud" || configured === "both") return configured;
  const startRoom = state.rooms.find((room) => sceneMenuConfigForRoom(room)?.role === "start");
  return sceneMenuConfigForRoom(startRoom ?? null)?.presentationMode ?? "hud";
}

const DUNGEON_DIRECTIONS = ["up", "right", "down", "left"] as const;

function dungeonFeatureRuntimeForRoom(room: PreviewRuntimeRoom | null): DungeonCrawlerFeatureRuntimeConfig | null {
  if (room?.sceneType !== "dungeonCrawler") return null;
  const config = isRecord(room.runtime.config) ? room.runtime.config : {};
  return resolveDungeonCrawlerFeatureRuntime((config as Record<string, unknown>).modules);
}

function dungeonCellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function dungeonDirectionGlyph(direction: string | null | undefined): string {
  return ({ up: "N", right: "E", down: "S", left: "W" } as Record<string, string>)[direction ?? ""] ?? "?";
}

function dungeonHpText(hp: number): string {
  return `HP ${Math.max(0, Math.min(99, Math.round(hp))).toString().padStart(2, "0")}`;
}

function dungeonCompassLabel(enabled: boolean, direction: string | null | undefined, hp: number): string {
  return enabled ? `${dungeonDirectionGlyph(direction)} ${dungeonHpText(hp)}` : dungeonHpText(hp);
}

function dungeonFeatureRuntimeForState(state: PreviewRuntimeState): DungeonCrawlerFeatureRuntimeConfig | null {
  return dungeonFeatureRuntimeForRoom(state.currentRoom);
}

function dungeonInventoryCount(state: PreviewRuntimeState, item: number): number {
  return Math.max(0, state.inventory[String(item)] ?? 0);
}

function defaultDungeonInteractionForRoom(
  room: PreviewRuntimeRoom | null,
  player: PreviewRuntimePlayer | null
): PreviewDungeonInteraction {
  const feature = dungeonFeatureRuntimeForRoom(room);
  const exploredCells = player ? [dungeonCellKey(player.x, player.y)] : [];
  return {
    mode: "none",
    selectedIndex: 0,
    notice: null,
    noticeReturnsToBattle: false,
    mapScrollX: 0,
    mapScrollY: 0,
    exploredCells,
    explorationPlayerHp: 3,
    enemyHp: 0,
    playerHp: 3,
    enemyDefeated: false,
    compassLabel: dungeonCompassLabel(feature?.compassEnabled ?? false, player?.direction, 3)
  };
}

function defaultDungeonHudForRoom(room: PreviewRuntimeRoom | null): PreviewDungeonHudState {
  return {
    visible: false,
    panel: room?.sceneType === "dungeonCrawler" && dungeonFeatureRuntimeForRoom(room)?.mapEnabled ? "map" : "items"
  };
}

function updateDungeonCompass(
  state: PreviewRuntimeState,
  interaction: PreviewDungeonInteraction,
  hp = interaction.mode === "battle" || interaction.mode === "notice" && interaction.playerHp !== 3
    ? interaction.playerHp
    : interaction.explorationPlayerHp
): PreviewDungeonInteraction {
  const feature = dungeonFeatureRuntimeForState(state);
  return {
    ...interaction,
    compassLabel: dungeonCompassLabel(feature?.compassEnabled ?? false, state.player?.direction, hp)
  };
}

function initialDungeonInventory(
  room: PreviewRuntimeRoom | null
): Record<string, number> {
  const feature = dungeonFeatureRuntimeForRoom(room);
  if (!feature?.inventoryEnabled || !feature.inventory) return {};
  return { [String(feature.inventory.item)]: feature.inventory.initialQuantity };
}

function dungeonMapDimensions(room: PreviewRuntimeRoom): { width: number; height: number } {
  return {
    width: Math.ceil(room.width / 2),
    height: Math.ceil(room.height / 2)
  };
}

function dungeonMapScrollLimits(room: PreviewRuntimeRoom): { maxX: number; maxY: number } {
  const dimensions = dungeonMapDimensions(room);
  return {
    maxX: Math.max(0, dimensions.width - 15),
    maxY: Math.max(0, dimensions.height - 3)
  };
}

function dungeonMapCell(
  state: PreviewRuntimeState,
  mapX: number,
  mapY: number
): PreviewDungeonMapCell {
  const room = state.currentRoom as PreviewRuntimeRoom;
  let visible = false;
  let blocked = false;
  let player = false;
  const explored = new Set(state.dungeonInteraction.exploredCells);
  for (let localY = 0; localY < 2; localY += 1) {
    for (let localX = 0; localX < 2; localX += 1) {
      const x = mapX * 2 + localX;
      const y = mapY * 2 + localY;
      if (x >= room.width || y >= room.height) continue;
      visible ||= explored.has(dungeonCellKey(x, y));
      blocked ||= room.collisionCells[y * room.width + x] === true;
      player ||= state.player?.x === x && state.player?.y === y;
    }
  }
  return {
    x: mapX,
    y: mapY,
    glyph: player ? "P" : !visible ? "?" : blocked ? "X" : ".",
    visible,
    blocked,
    player
  };
}

export function previewRuntimeDungeonMap(state: PreviewRuntimeState): PreviewDungeonMap | null {
  const room = state.currentRoom;
  if (!room || room.sceneType !== "dungeonCrawler") return null;
  const dimensions = dungeonMapDimensions(room);
  const limits = dungeonMapScrollLimits(room);
  const scrollX = Math.max(0, Math.min(limits.maxX, state.dungeonInteraction.mapScrollX));
  const scrollY = Math.max(0, Math.min(limits.maxY, state.dungeonInteraction.mapScrollY));
  const cells: PreviewDungeonMapCell[] = [];
  const rows: string[] = [];
  for (let row = 0; row < 3; row += 1) {
    let text = "";
    for (let column = 0; column < 15; column += 1) {
      const mapX = scrollX + column;
      const mapY = scrollY + row;
      const cell = mapX < dimensions.width && mapY < dimensions.height
        ? dungeonMapCell(state, mapX, mapY)
        : { x: mapX, y: mapY, glyph: " " as const, visible: false, blocked: false, player: false };
      cells.push(cell);
      text += cell.glyph;
    }
    rows.push(text);
  }
  return { ...dimensions, scrollX, scrollY, rows, cells };
}

export function previewRuntimeDungeonInventoryItems(state: PreviewRuntimeState): PreviewDungeonInventoryItem[] {
  const feature = dungeonFeatureRuntimeForState(state);
  if (!feature?.inventoryEnabled || !feature.inventory) return [{ id: "back", label: "FECHAR", detail: "", enabled: true }];
  const item = feature.inventory;
  const count = dungeonInventoryCount(state, item.item);
  return [
    { id: "item", label: item.label, detail: `x${count}`, enabled: count > 0 },
    { id: "back", label: "FECHAR", detail: "", enabled: true }
  ];
}

export function previewRuntimeDungeonHud(state: PreviewRuntimeState): PreviewDungeonHudPresentation | null {
  if (state.currentRoom?.sceneType !== "dungeonCrawler") return null;
  const item = previewRuntimeDungeonInventoryItems(state).find((candidate) => candidate.id === "item") ?? null;
  const hp = state.dungeonInteraction.mode === "battle" || state.dungeonInteraction.mode === "notice" && state.dungeonInteraction.playerHp !== 3
    ? state.dungeonInteraction.playerHp
    : state.dungeonInteraction.explorationPlayerHp;
  return {
    ...state.dungeonHud,
    compassLabel: state.dungeonInteraction.compassLabel,
    hp,
    maxHp: 3,
    item,
    map: state.dungeonHud.panel === "map" ? previewRuntimeDungeonMap(state) : null
  };
}

function topdownFeatureRuntimeForState(state: PreviewRuntimeState): TopdownFeatureRuntimeConfig | null {
  if (state.currentRoom?.sceneType !== "topdown") return null;
  const config = isRecord(state.currentRoom.runtime.config) ? state.currentRoom.runtime.config : {};
  return resolveTopdownFeatureRuntime((config as Record<string, unknown>).modules);
}

function topdownInventoryKey(state: PreviewRuntimeState, item: number): string {
  // Authored shop commands use the ROM registry, including named inventory items.
  if (state.nativeEvents.modal?.kind !== "shop") return String(item);
  const keys = new Set<string>();
  const expanded = expandEventProcedures(projectArray(state.project, "events"));
  for (const event of expanded.events) {
    const steps = Array.isArray(event.steps) ? event.steps.filter(isRecord) : [];
    for (const step of steps) {
      const parts = commandTokens(resolveProjectConstantCommand(state.project, stringField(step.command, "")));
      const key = parts[0] === "set_equipped_item" ? parts[2] : ["add_item", "has_item"].includes(parts[0] ?? "") ? parts[1] : null;
      if (key) keys.add(key);
    }
  }
  return [...keys].sort()[item] ?? String(item);
}

function topdownInventoryCount(state: PreviewRuntimeState, item: number): number {
  return Math.max(0, state.inventory[topdownInventoryKey(state, item)] ?? 0);
}

function topdownVariableName(state: PreviewRuntimeState, index: number): string | null {
  return variableNameAtIndex(state, index);
}

function topdownShopStock(state: PreviewRuntimeState, shop: NonNullable<TopdownFeatureRuntimeConfig["shop"]>): {
  remaining: number | null;
  variableName: string | null;
  progress: number;
} {
  const variableName = shop.stockVariable >= 0 ? topdownVariableName(state, shop.stockVariable) : null;
  const progress = variableName ? Math.max(0, variableNumber(state, variableName)) : 0;
  return {
    remaining: shop.stockVariable >= 0 ? Math.max(0, shop.stock - progress) : null,
    variableName,
    progress
  };
}

function topdownShopItemDetail(
  state: PreviewRuntimeState,
  shop: NonNullable<TopdownFeatureRuntimeConfig["shop"]>
): string {
  const stock = topdownShopStock(state, shop);
  const availability = stock.remaining === null ? "∞" : `${stock.remaining}/${shop.stock}`;
  return `${availability} · $${shop.price}`;
}

function topdownShopItemEnabled(
  state: PreviewRuntimeState,
  shop: NonNullable<TopdownFeatureRuntimeConfig["shop"]>
): boolean {
  const stock = topdownShopStock(state, shop);
  return shop.item !== shop.currencyItem &&
    (shop.stockVariable < 0 || stock.variableName !== null) &&
    topdownInventoryCount(state, shop.currencyItem) >= shop.price &&
    (stock.remaining === null || stock.remaining > 0);
}

export function previewRuntimeStartMenuTitle(state: PreviewRuntimeState): string {
  return stringField(startMenuUiSettings(state.project).startMenuTitle, "Menu");
}

function campaignProgressVariableName(state: PreviewRuntimeState, campaign: PreviewRuntimeCampaign): string | null {
  const completionVariable = campaign.completionVariable;
  if (!completionVariable) return null;
  const variable = projectArray(state.project, "variables").find((record) => {
    const identifiers = [record.name, record.id, record.displayName, record.path]
      .map((value) => nullableString(value));
    return identifiers.includes(completionVariable);
  });
  return variable ? nullableString(variable.name) ?? nullableString(variable.id) : null;
}

function campaignRoomReferenceMatches(value: unknown, room: PreviewRuntimeRoom): boolean {
  const reference = nullableString(value);
  return reference === room.name || reference === room.id;
}

function campaignConnectionArrival(
  state: PreviewRuntimeState,
  sourceRoom: PreviewRuntimeRoom,
  targetRoom: PreviewRuntimeRoom
): { x: number; y: number; direction: string } | null {
  const editorState = isRecord(state.project.editorState) ? state.project.editorState : null;
  const connections = Array.isArray(editorState?.scenaConnections)
    ? editorState.scenaConnections.filter(isRecord)
    : [];
  const connection = connections.find((candidate) => (
    campaignRoomReferenceMatches(candidate.from, sourceRoom)
    && campaignRoomReferenceMatches(candidate.to, targetRoom)
  )) ?? connections.find((candidate) => campaignRoomReferenceMatches(candidate.to, targetRoom));
  if (!connection) return null;

  const entry = isRecord(connection.entry) ? connection.entry : {};
  const fallbackEntry = defaultRoomConnectionEntryArea(targetRoom.width, targetRoom.height);
  const entryArea = {
    ...fallbackEntry,
    x: integerField(entry.x, fallbackEntry.x),
    y: integerField(entry.y, fallbackEntry.y),
    width: integerField(entry.width, fallbackEntry.width),
    height: integerField(entry.height, fallbackEntry.height)
  };
  return roomConnectionArrival(
    entryArea,
    targetRoom.width,
    targetRoom.height,
    targetRoom.collisionTypes
  );
}

function sceneConnectionTransition(
  state: PreviewRuntimeState,
  sourceRoom: PreviewRuntimeRoom | null,
  targetRoom: PreviewRuntimeRoom
) {
  if (!sourceRoom) return null;
  const editorState = isRecord(state.project.editorState) ? state.project.editorState : null;
  const connections = Array.isArray(editorState?.scenaConnections)
    ? editorState.scenaConnections.filter(isRecord)
    : [];
  const connection = connections.find((candidate) => (
    campaignRoomReferenceMatches(candidate.from, sourceRoom)
    && campaignRoomReferenceMatches(candidate.to, targetRoom)
  ));
  if (!connection) return null;
  return Object.hasOwn(connection, "transition")
    ? normalizeSceneTransition(connection.transition)
    : sceneTransitionFromProjectSettings(isRecord(state.project.settings) ? state.project.settings.transitions : undefined);
}

function applySceneConnectionTransition(
  state: PreviewRuntimeState,
  sourceRoom: PreviewRuntimeRoom | null,
  targetRoom: PreviewRuntimeRoom
): PreviewRuntimeState {
  const transition = sceneConnectionTransition(state, sourceRoom, targetRoom);
  if (!transition || !sceneTransitionUsesVisualEffect(transition)) return state;
  return {
    ...state,
    camera: {
      ...state.camera,
      ...(sceneTransitionUsesFade(transition) ? {
        fade: {
          mode: transition.fadeOut ? "out" : "in",
          frames: transition.durationFrames
        }
      } : {})
    },
    sceneTransition: {
      style: transition.style,
      phase: "reveal",
      durationFrames: transition.durationFrames,
      elapsedFrames: 0,
      progress: 0,
      sourceRoomName: sourceRoom?.name ?? null,
      targetRoomName: targetRoom.name
    }
  };
}

function advancePreviewCampaign(
  state: PreviewRuntimeState,
  eventName: string,
  command: string
): PreviewRuntimeState {
  const campaign = state.currentRoom?.campaign;
  if (!campaign) {
    return updateDebug(appendUnsupported(
      state,
      eventName,
      command,
      "Cena atual não possui uma campanha configurada.",
      "Avanço de campanha ignorado: a cena atual não possui campanha."
    ));
  }

  const variableName = campaignProgressVariableName(state, campaign);
  if (!variableName) {
    return updateDebug(appendUnsupported(
      state,
      eventName,
      command,
      `Variável de conclusão não encontrada: ${campaign.completionVariable ?? "-"}.`,
      `Avanço de campanha bloqueado: variável ${campaign.completionVariable ?? "-"} não encontrada.`
    ));
  }

  const nextRoom = campaign.nextScene
    ? roomByName(state.rooms, campaign.nextScene)
    : null;
  if (campaign.nextScene && !nextRoom) {
    return updateDebug(appendUnsupported(
      state,
      eventName,
      command,
      `Sala de campanha não encontrada: ${campaign.nextScene}.`,
      `Avanço de campanha bloqueado: sala ${campaign.nextScene} não encontrada.`
    ));
  }

  const completed = setRuntimeVariable(state, variableName, campaign.completedValue);
  const withSuccess = appendLog(
    completed,
    eventName,
    command,
    "script",
    campaign.success || "Campanha avançada."
  );
  if (!nextRoom) return updateDebug(withSuccess);

  const entered = setCurrentRoom({ ...withSuccess, activeDialogue: null }, nextRoom);
  const arrival = state.currentRoom
    ? campaignConnectionArrival(state, state.currentRoom, nextRoom)
    : null;
  const positioned = arrival
    ? updateRuntimeActor(entered, "player", (actor) => ({
      ...actor,
      x: arrival.x,
      y: arrival.y,
      direction: arrival.direction
    }))
    : entered;

  return appendLog(
    positioned,
    eventName,
    command,
    "room",
    nextRoom.name
  );
}

function campaignStatus(state: PreviewRuntimeState, campaign: PreviewRuntimeCampaign): string {
  const variableName = campaignProgressVariableName(state, campaign);
  return variableName && variableNumber(state, variableName) >= campaign.completedValue
    ? "Concluída"
    : "Em andamento";
}

function campaignNextSceneLabel(state: PreviewRuntimeState, campaign: PreviewRuntimeCampaign): string {
  if (!campaign.nextScene) return "A definir";
  const nextRoom = state.rooms.find((room) => room.name === campaign.nextScene || room.id === campaign.nextScene);
  return nextRoom?.displayName ?? nextRoom?.name ?? campaign.nextScene;
}

export function previewRuntimeStartMenuItems(state: PreviewRuntimeState): PreviewRuntimeStartMenuItem[] {
  // O Menu Start em modo `scene` usa a mesma fonte de verdade do menu de
  // cena. Mantemos o caminho abaixo para o HUD legado, que ainda expõe as
  // páginas calculadas diretamente a partir do estado de gameplay.
  if (state.currentRoom?.sceneType === "menu" && state.sceneMenu.visible) {
    return previewRuntimeSceneMenuItems(state).map((item) => ({
      id: item.id,
      label: item.label,
      detail: item.detail,
      enabled: item.enabled
    }));
  }

  if (state.startMenu.page === "inventory") {
    const inventory = Object.entries(state.inventory)
      .filter(([, count]) => count > 0)
      .map(([name, count]) => ({ id: `inventory:${name}`, label: name, detail: `x${count}`, enabled: false }));
    return [...inventory, { id: "back", label: "Voltar" }];
  }

  if (state.startMenu.page === "missions") {
    const campaign = state.currentRoom?.campaign;
    if (campaign) {
      return [
        { id: "campaign-title", label: "Capítulo", detail: campaign.title, enabled: false },
        { id: "campaign-objective", label: "Objetivo", detail: campaign.objective, enabled: false },
        { id: "campaign-status", label: "Estado", detail: campaignStatus(state, campaign), enabled: false },
        { id: "campaign-next", label: "Próximo destino", detail: campaignNextSceneLabel(state, campaign), enabled: false },
        { id: "back", label: "Voltar" }
      ];
    }
    const topdown = topdownFeatureRuntimeForState(state);
    if (topdown?.questsEnabled && topdown.quest) {
      const quest = topdown.quest;
      const stateVariableName = topdownVariableName(state, quest.stateVariable);
      const questState = stateVariableName ? variableNumber(state, stateVariableName) : quest.activeValue;
      const objectiveCount = topdownInventoryCount(state, quest.objectiveItem);
      const completed = questState === quest.completedValue;
      return [
        { id: "mission-state", label: "Quest", detail: completed ? "Concluída" : questState === quest.activeValue ? "Ativa" : "Pendente", enabled: false },
        { id: "mission-objective", label: `Objetivo · Item ${quest.objectiveItem + 1}`, detail: `${Math.min(objectiveCount, quest.objectiveQuantity)}/${quest.objectiveQuantity}`, enabled: false },
        { id: "mission-reward", label: "Recompensa", detail: `Item ${quest.rewardItem + 1} x${quest.rewardQuantity}`, enabled: false },
        { id: "back", label: "Voltar" }
      ];
    }
    const currentRoom = state.currentRoom?.name ?? "";
    return [
      { id: "mission-active", label: "Rota dos Faróis", detail: currentRoom || "Ativa", enabled: false },
      { id: "mission-next", label: "Próximo objetivo", detail: "Consultar a cena atual", enabled: false },
      { id: "back", label: "Voltar" }
    ];
  }

  if (state.startMenu.page === "profile") {
    return [
      { id: "profile-player", label: "Perfil do jogador", detail: "Nara", enabled: false },
      { id: "profile-team", label: "Equipe", detail: "1 integrante", enabled: false },
      { id: "back", label: "Voltar" }
    ];
  }

  if (state.startMenu.page === "map") {
    return [
      ...state.rooms.map((room) => ({
        id: `room:${room.id}`,
        label: room.name,
        detail: room.id === state.currentRoom?.id ? "Atual" : undefined,
        enabled: false
      })),
      { id: "back", label: "Voltar" }
    ];
  }

  if (state.startMenu.page === "settings") {
    const settings = isRecord(state.project.settings) ? state.project.settings : {};
    const general = isRecord(settings.general) ? settings.general : {};
    const controls = isRecord(settings.controls) ? settings.controls : {};
    return [
      { id: "language", label: "Idioma", detail: stringField(general.defaultLanguage, "pt-BR"), enabled: false },
      { id: "controls", label: "Controles", detail: stringField(controls.preset, "GBA classico"), enabled: false },
      { id: "back", label: "Voltar" }
    ];
  }

  if (state.startMenu.page === "shop") {
    const topdown = topdownFeatureRuntimeForState(state);
    if (!topdown?.shopEnabled || !topdown.shop) return [{ id: "back", label: "Voltar" }];
    return [
      {
        id: "shop:item",
        label: topdown.shop.label,
        detail: topdownShopItemDetail(state, topdown.shop),
        enabled: topdownShopItemEnabled(state, topdown.shop)
      },
      { id: "back", label: "Voltar" }
    ];
  }

  const topdown = topdownFeatureRuntimeForState(state);
  const rootItems: PreviewRuntimeStartMenuItem[] = [
    { id: "missions", label: "Missões" },
    { id: "inventory", label: "Inventário" }
  ];
  if (topdown?.shopEnabled && topdown.shop) rootItems.push({ id: "shop", label: "Loja" });
  rootItems.push(
    { id: "map", label: "Mapa" },
    { id: "profile", label: "Perfil/equipe" },
    { id: "save", label: "Salvar", detail: "Slot 1" },
    { id: "settings", label: "Configurações" },
    { id: "back", label: "Voltar" }
  );
  return rootItems;
}

function sceneMenuConfigForRoom(room: PreviewRuntimeRoom | null): MenuSceneConfig | null {
  if (!room || room.sceneType !== "menu") return null;
  return normalizeMenuSceneConfig(room.runtime.config);
}

function embeddedMenuScreenForConfig(
  config: MenuSceneConfig | null,
  screenID: string | null
): MenuEmbeddedScreenConfig | null {
  if (!config || !screenID) return null;
  return config.screens?.find((screen) => screen.id === screenID) ?? null;
}

function sceneMenuConfigForState(state: PreviewRuntimeState): MenuSceneConfig | null {
  const config = sceneMenuConfigForRoom(state.currentRoom);
  const screen = embeddedMenuScreenForConfig(config, state.sceneMenu.screenID);
  if (!config || !screen) return config;
  return normalizeMenuSceneConfig({
    ...screen,
    role: config.role
  });
}

function defaultPreviewTextInputState(): PreviewRuntimeTextInputState {
  return {
    active: false,
    variableName: null,
    value: "",
    maxLength: 0,
    cursorIndex: 0,
    keyboardIndex: 0,
    lowercase: false,
    layout: "hidden"
  };
}

function textInputKeyboardPosition(keyboardIndex: number, controlLayout: "bottom" | "side" = "bottom"): { row: number; column: number } | null {
  if (controlLayout === "side" && keyboardIndex >= 26 && keyboardIndex <= 28) {
    return { row: keyboardIndex - 26, column: 8 };
  }
  const grid = controlLayout === "side" ? MENU_TEXT_INPUT_SIDE_KEYBOARD_GRID : MENU_TEXT_INPUT_KEYBOARD_GRID;
  for (let row = 0; row < grid.length; row += 1) {
    const column = grid[row]?.indexOf(keyboardIndex) ?? -1;
    if (column >= 0) return { row, column };
  }
  return null;
}

function movePreviewTextInputKeyboard(
  state: PreviewRuntimeState,
  horizontal: -1 | 0 | 1,
  vertical: -1 | 0 | 1
): PreviewRuntimeState {
  const keyboardConfig = sceneMenuConfigForState(state)?.textInput?.keyboard;
  const controlLayout = keyboardConfig?.controlLayout === "side" ? "side" : "bottom";
  const position = textInputKeyboardPosition(state.textInput.keyboardIndex, controlLayout);
  if (!position) {
    return { ...state, textInput: { ...state.textInput, keyboardIndex: 0 } };
  }

  if (horizontal !== 0) {
    const grid = controlLayout === "side" ? MENU_TEXT_INPUT_SIDE_KEYBOARD_GRID : MENU_TEXT_INPUT_KEYBOARD_GRID;
    const columnCount = controlLayout === "side" ? 9 : 10;
    for (let distance = 1; distance <= columnCount; distance += 1) {
      const nextColumn = (position.column + horizontal * distance + columnCount) % columnCount;
      const candidate = nextColumn === 8 && controlLayout === "side"
        ? position.row >= 0 && position.row < 3 ? 26 + position.row : -1
        : grid[position.row]?.[nextColumn] ?? -1;
      if (candidate >= 0) {
        return { ...state, textInput: { ...state.textInput, keyboardIndex: candidate } };
      }
    }
    return state;
  }

  if (vertical !== 0) {
    const grid = controlLayout === "side" ? MENU_TEXT_INPUT_SIDE_KEYBOARD_GRID : MENU_TEXT_INPUT_KEYBOARD_GRID;
    const rowCount = 4;
    for (let distance = 1; distance <= rowCount; distance += 1) {
      const nextRow = (position.row + vertical * distance + rowCount) % rowCount;
      const row = grid[nextRow] ?? [];
      let bestColumn = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      row.forEach((candidate, column) => {
        if (candidate < 0) return;
        const candidateDistance = Math.abs(column - position.column);
        if (candidateDistance < bestDistance) {
          bestDistance = candidateDistance;
          bestColumn = column;
        }
      });
      if (controlLayout === "side" && nextRow < 3) {
        const candidateDistance = Math.abs(8 - position.column);
        if (candidateDistance < bestDistance) {
          bestDistance = candidateDistance;
          bestColumn = 8;
        }
      }
      if (bestColumn >= 0) {
        return {
          ...state,
          textInput: {
            ...state.textInput,
            keyboardIndex: bestColumn === 8 && controlLayout === "side"
              ? 26 + nextRow
              : row[bestColumn] ?? state.textInput.keyboardIndex
          }
        };
      }
    }
  }

  return state;
}

function previewTextInputValue(value: string, maxLength: number): string {
  return value.replace(/\0/g, "").slice(0, maxLength).replace(/\s+$/g, "");
}

function withPreviewTextInputValue(state: PreviewRuntimeState, value: string): PreviewRuntimeState {
  const variableName = state.textInput.variableName;
  const nextValue = previewTextInputValue(value, state.textInput.maxLength);
  return {
    ...state,
    textInput: { ...state.textInput, value: nextValue },
    ...(variableName
      ? { variables: { ...state.variables, [variableName]: nextValue } }
      : {})
  };
}

function openPreviewTextInput(
  state: PreviewRuntimeState,
  variableName: string,
  maxLength: number
): PreviewRuntimeState {
  if (!variableName) return state;
  const config = sceneMenuConfigForState(state)?.textInput;
  const configuredVariable = config?.variableName === variableName ? config : null;
  const effectiveMaxLength = Math.max(1, Math.min(16, Math.floor(maxLength || configuredVariable?.maxLength || 8)));
  const value = previewTextInputValue(String(state.variables[variableName] ?? ""), effectiveMaxLength);
  const layout = configuredVariable?.keyboard?.layout ?? "grid";
  return {
    ...state,
    textInput: {
      active: true,
      variableName,
      value,
      maxLength: effectiveMaxLength,
      cursorIndex: Math.min(value.length, effectiveMaxLength - 1),
      keyboardIndex: 0,
      lowercase: false,
      layout
    },
    variables: { ...state.variables, [variableName]: value },
    sceneMenu: { ...state.sceneMenu, notice: null }
  };
}

function updatePreviewTextInput(state: PreviewRuntimeState, action: PreviewRuntimeAction): PreviewRuntimeState {
  if (!state.textInput.active) return state;
  if (state.textInput.layout === "grid") {
    if (action === "up") return movePreviewTextInputKeyboard(state, 0, -1);
    if (action === "down") return movePreviewTextInputKeyboard(state, 0, 1);
    if (action === "left") return movePreviewTextInputKeyboard(state, -1, 0);
    if (action === "right") return movePreviewTextInputKeyboard(state, 1, 0);
    if (action === "back") return { ...state, textInput: { ...state.textInput, active: false } };
    if (action !== "action") return state;

    const keyboardIndex = state.textInput.keyboardIndex;
    if (keyboardIndex >= 0 && keyboardIndex < 26) {
      const character = MENU_TEXT_INPUT_ALPHABET[keyboardIndex] ?? "";
      const nextCharacter = state.textInput.lowercase ? character.toLowerCase() : character;
      const padded = state.textInput.value.padEnd(state.textInput.maxLength, " ").split("");
      padded[state.textInput.cursorIndex] = nextCharacter;
      const nextCursorIndex = Math.min(state.textInput.maxLength - 1, state.textInput.cursorIndex + 1);
      return withPreviewTextInputValue({
        ...state,
        textInput: { ...state.textInput, cursorIndex: nextCursorIndex }
      }, padded.join(""));
    }
    if (keyboardIndex === 26) {
      const padded = state.textInput.value.padEnd(state.textInput.maxLength, " ").split("");
      const nextCursorIndex = Math.max(0, state.textInput.cursorIndex - 1);
      padded[nextCursorIndex] = " ";
      return withPreviewTextInputValue({
        ...state,
        textInput: { ...state.textInput, cursorIndex: nextCursorIndex }
      }, padded.join(""));
    }
    if (keyboardIndex === 27) {
      if (sceneMenuConfigForState(state)?.textInput?.keyboard?.allowLowercase === false) return state;
      return { ...state, textInput: { ...state.textInput, lowercase: !state.textInput.lowercase } };
    }
    if (keyboardIndex === 28) {
      return { ...state, textInput: { ...state.textInput, active: false } };
    }
    return state;
  }

  if (action === "up" || action === "down") {
    const padded = state.textInput.value.padEnd(state.textInput.maxLength, " ").split("");
    const current = MENU_TEXT_INPUT_ALPHABET.indexOf(padded[state.textInput.cursorIndex] ?? "A");
    const offset = action === "up" ? 1 : -1;
    const nextIndex = (current + offset + MENU_TEXT_INPUT_ALPHABET.length) % MENU_TEXT_INPUT_ALPHABET.length;
    padded[state.textInput.cursorIndex] = MENU_TEXT_INPUT_ALPHABET[nextIndex] ?? "A";
    return withPreviewTextInputValue(state, padded.join(""));
  }
  if (action === "left" || action === "right") {
    const offset = action === "left" ? -1 : 1;
    return {
      ...state,
      textInput: {
        ...state.textInput,
        cursorIndex: Math.max(0, Math.min(state.textInput.maxLength - 1, state.textInput.cursorIndex + offset))
      }
    };
  }
  if (action === "back") return { ...state, textInput: { ...state.textInput, active: false } };
  if (action === "action") {
    if (state.textInput.cursorIndex + 1 < state.textInput.maxLength) {
      return { ...state, textInput: { ...state.textInput, cursorIndex: state.textInput.cursorIndex + 1 } };
    }
    return { ...state, textInput: { ...state.textInput, active: false } };
  }
  return state;
}

function embeddedMenuStackEntry(roomID: string, screenID: string | null): string {
  if (!screenID) return roomID;
  return `@screen:${encodeURIComponent(roomID)}:${encodeURIComponent(screenID)}`;
}

function parseMenuStackEntry(entry: string): { roomID: string; screenID: string | null } {
  if (!entry.startsWith("@screen:")) return { roomID: entry, screenID: null };
  const payload = entry.slice("@screen:".length).split(":");
  if (payload.length !== 2) return { roomID: entry, screenID: null };
  try {
    return {
      roomID: decodeURIComponent(payload[0] ?? ""),
      screenID: decodeURIComponent(payload[1] ?? "") || null
    };
  } catch {
    return { roomID: entry, screenID: null };
  }
}

function defaultSceneMenuForRoom(
  project: GBAProjectData,
  room: PreviewRuntimeRoom | null,
  stack: string[] = []
): PreviewRuntimeSceneMenu {
  const config = sceneMenuConfigForRoom(room);
  const screen = embeddedMenuScreenForConfig(config, config?.screens?.[0]?.id ?? null);
  const hudBinding = (screen?.hudMode ?? (screen?.hudPresetId ? undefined : config?.hudMode)) === "none" ? null : resolveExplicitHudPresetBinding(project, {
    roomID: room?.id,
    scenePresetId: screen?.hudPresetId,
    roomPresetId: config?.hudPresetId ?? room?.hudPresetId
  });
  return {
    visible: room?.sceneType === "menu",
    selectedIndex: 0,
    notice: null,
    screenID: screen?.id ?? null,
    menuProfile: screen?.menuProfile ?? config?.menuProfile ?? null,
    hudPresetId: room?.sceneType === "menu"
      ? hudBinding ? hudBinding.requestedPresetId === HUD_PROJECT_PRESET_ID ? hudBinding.presetId : hudBinding.requestedPresetId ?? hudBinding.presetId : null
      : null,
    elapsedFrames: 0,
    stack: room?.sceneType === "menu" ? [...stack] : []
  };
}

function variableNameAtIndex(state: PreviewRuntimeState, variableIndex: number): string | null {
  if (!Number.isInteger(variableIndex) || variableIndex < 0) return null;
  const variable = projectArray(state.project, "variables")[variableIndex];
  return nullableString(variable?.name) ?? nullableString(variable?.id);
}

function sceneMenuItemValue(state: PreviewRuntimeState, item: MenuSceneItem): number {
  const variableName = variableNameAtIndex(state, item.variableIndex);
  return variableName
    ? variableNumber(state, variableName, item.minValue)
    : item.minValue;
}

function sceneMenuAudioBuses(item: MenuSceneItem): PreviewRuntimeAudioBus[] {
  if (!item.audioChannel) return [];
  if (item.audioChannel === "all") return [...previewAudioBuses];
  return [item.audioChannel];
}

function applySceneMenuAudioBinding(
  state: PreviewRuntimeState,
  item: MenuSceneItem,
  value: number
): PreviewRuntimeState {
  const buses = sceneMenuAudioBuses(item);
  if (buses.length === 0) return state;
  const audioMix = structuredClone(state.audioMix);
  if (item.action === "toggle_variable") {
    const muted = value !== item.checkedValue;
    buses.forEach((bus) => {
      audioMix.muted[bus] = muted;
    });
  } else if (item.action === "adjust_variable") {
    const volume = Math.round(Math.max(0, Math.min(100, value)) * 15 / 100);
    buses.forEach((bus) => {
      audioMix.volumes[bus] = volume;
      audioMix.muted[bus] = volume === 0;
      audioMix.fades[bus] = null;
    });
  }
  return { ...state, audioMix };
}

function sceneMenuItemDetail(state: PreviewRuntimeState, item: MenuSceneItem): string | undefined {
  if (item.action === "adjust_variable") return `${sceneMenuItemValue(state, item)}%`;
  if (item.action === "toggle_variable") return sceneMenuItemValue(state, item) === item.checkedValue ? "ON" : "OFF";
  const binding = item.binding;
  if (!binding) return undefined;
  const value = sceneMenuBindingValue(state, binding);
  if (value === null) return undefined;
  if (binding.format === "count") return `x${Math.max(0, value)}`;
  if (binding.format === "percent") return `${Math.max(0, value)}%`;
  if (binding.format === "on_off") return value !== 0 ? "ON" : "OFF";
  return String(value);
}

function sceneMenuBindingValue(state: PreviewRuntimeState, binding: MenuSceneItemBinding): number | null {
  if (!Number.isInteger(binding.index) || binding.index < 0) return null;
  if (binding.source === "variable") {
    const variable = projectArray(state.project, "variables")[binding.index];
    const key = variable ? nullableString(variable.name) ?? nullableString(variable.id) : null;
    return key ? Number(state.variables[key] ?? 0) : 0;
  }
  if (binding.source === "inventory") {
    return Number(Object.values(state.inventory)[binding.index] ?? 0);
  }
  if (binding.source === "stat") {
    return Number(Object.values(state.stats)[binding.index]?.value ?? 0);
  }
  if (binding.source === "equipped") {
    const value = Object.values(state.equippedItems)[binding.index];
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : (value ? 1 : 0);
  }
  return null;
}

export function previewRuntimeSceneMenuItems(state: PreviewRuntimeState): PreviewRuntimeSceneMenuItem[] {
  const config = sceneMenuConfigForState(state);
  if (!config) return [];
  return config.items.map((item) => ({
    id: item.id,
    label: item.label,
    detail: sceneMenuItemDetail(state, item),
    enabled: item.enabled,
    action: item.action
  }));
}

function actorRoomName(actor: Record<string, unknown>, fallbackRoomName: string): string {
  return nullableString(actor.roomName) ??
    nullableString(actor.room) ??
    nullableString(actor.sceneName) ??
    nullableString(actor.scene) ??
    fallbackRoomName;
}

function previewAssetRefFromRenderAsset(
  asset: { bundledDefaultAsset: string | null; kind: string; name: string; source: string | null } | null | undefined
): PreviewRuntimeAssetRef | null {
  if (!asset) return null;
  return {
    bundledDefaultAsset: asset.bundledDefaultAsset,
    kind: asset.kind,
    name: asset.name,
    source: asset.source
  };
}

function previewAssetRefForSpriteSheet(
  data: GBAProjectData,
  spriteSheet: string | null,
  resolvedAsset: { bundledDefaultAsset: string | null; kind: string; name: string; source: string | null } | null | undefined
): PreviewRuntimeAssetRef | null {
  return previewAssetRefFromRenderAsset(resolvedAsset) ?? assetByName(data, spriteSheet);
}

function assetByName(data: GBAProjectData, assetName: string | null): PreviewRuntimeAssetRef | null {
  if (!assetName) return null;
  const asset = projectArray(data, "assets").find((item) => nullableString(item.name) === assetName);
  if (!asset) return null;
  const metadata = isRecord(asset.metadata) ? asset.metadata : {};
  return {
    name: assetName,
    kind: stringField(asset.kind, "Arquivo"),
    source: nullableString(metadata.source),
    bundledDefaultAsset: nullableString(metadata.bundledDefaultAsset)
  };
}

function assetByReference(data: GBAProjectData, reference: string | null): PreviewRuntimeAssetRef | null {
  if (!reference) return null;
  const asset = projectArray(data, "assets").find((candidate) => (
    nullableString(candidate.name) === reference
      || nullableString(candidate.id) === reference
      || nullableString(candidate.exportID) === reference
  ));
  return assetByName(data, nullableString(asset?.name));
}

function tacticalPresentationForRuntime(
  data: GBAProjectData,
  sceneType: string,
  runtime: SceneRuntimeConfig,
  roomName: string
): PreviewIsometricTacticalPresentation | null {
  if (sceneType !== "isometric") return null;
  const config = isometricSceneConfigFromRuntime(runtime);
  if (!config || config.gameplayMode !== "tactical") return null;
  const capabilityManifest = resolveSceneCapabilityManifest(
    "isometric",
    config.modules,
    undefined,
    config.capabilities,
    config.tacticalCapabilities
  );
  const capabilities = capabilityManifest.capabilities
    .filter((capability) => capability.status.enabled)
    .map((capability) => capability.id as SceneTacticalCapabilityID);
  if (capabilities.length === 0) return null;
  const hasCapability = (id: SceneTacticalCapabilityID): boolean => capabilities.includes(id);
  const presentation = normalizeIsometricTacticalPresentation(config.tacticalPresentation);
  const roomActors = runtimeActors(data, roomName);
  const actorIndexForID = (actorID: string): number | null => {
    const index = roomActors.findIndex((actor) => actor.id === actorID || actor.name === actorID);
    return index >= 0 ? index : null;
  };
  const units = hasCapability("tactical_units")
    ? presentation.units.map((unit) => ({
      actorId: unit.actorId,
      actorIndex: actorIndexForID(unit.actorId),
      sheet: unit.sheet,
      asset: assetByReference(data, unit.sheet),
      animations: unit.animations ?? {}
    }))
    : [];
  const props = hasCapability("tactical_props")
    ? presentation.props.map((prop) => ({
      id: prop.id,
      kind: prop.kind,
      tile: prop.tile ?? { x: 0, y: 0, z: 0 },
      animated: prop.animated === true,
      asset: assetByReference(data, prop.asset)
    }))
    : [];
  const feedback = hasCapability("tactical_feedback")
    ? {
      cursor: assetByReference(data, presentation.cursorAsset ?? null),
      range: assetByReference(data, presentation.rangeAsset ?? null),
      target: assetByReference(data, presentation.targetAsset ?? null),
      emotes: assetByReference(data, presentation.emotesAsset ?? null),
      feedback: assetByReference(data, presentation.feedbackAsset ?? null)
    }
    : null;
  const audio = hasCapability("tactical_audio") && presentation.audio
    ? {
      music: presentation.audio.music || null,
      musicAsset: assetByReference(data, presentation.audio.music || null),
      cues: presentation.audio.cues,
      cueAssets: Object.fromEntries(
        ISO_TACTICAL_AUDIO_CUES.map((cue) => [cue, assetByReference(data, presentation.audio?.cues[cue] ?? null)])
      ) as Partial<Record<IsoTacticalAudioCue, PreviewRuntimeAssetRef | null>>
    }
    : null;
  const assets = (presentation.assets ?? []).map((asset) => ({
    id: asset.id,
    reference: asset.path,
    consumer: asset.consumer,
    required: asset.required,
    status: asset.status ?? null,
    asset: assetByReference(data, asset.path)
  }));
  return {
    capabilities,
    layers: {
      surface: hasCapability("tactical_surface") ? "BG2" : null,
      grid: hasCapability("tactical_grid_overlay") ? "BG1" : null,
      hud: hasCapability("tactical_hud") ? "BG0" : null,
      objects: "OBJ",
      collision: "scene_data"
    },
    assets,
    surfaceAsset: hasCapability("tactical_surface") ? assetByReference(data, presentation.surfaceAsset ?? null) : null,
    gridAsset: hasCapability("tactical_grid_overlay") ? assetByReference(data, presentation.gridAsset ?? null) : null,
    hudLayout: hasCapability("tactical_hud") ? presentation.hudLayout ?? null : null,
    units,
    props,
    feedback,
    audio
  };
}

function spriteFrameForActor(
  data: GBAProjectData,
  spriteSheet: string | null,
  animationName: string | null,
  frameIndex = 0
): PreviewRuntimeSpriteFrame | null {
  return resolveGbaActorSpriteFrame(data, { spriteSheet, animationName }, frameIndex)?.frame ?? null;
}

function animationFrameCount(
  data: GBAProjectData,
  spriteSheet: string | null,
  animationName: string | null
): number {
  if (!spriteSheet || !animationName) return 1;
  const animation = projectArray(data, "animations").find((candidate, index) => {
    if (!isRecord(candidate)) return false;
    const candidateName = nullableString(candidate.name);
    const candidateID = nullableString(candidate.id) ?? `animation-${index + 1}`;
    const candidateSheet = nullableString(candidate.spriteSheet);
    return (candidateName === animationName || candidateID === animationName) && candidateSheet === spriteSheet;
  });
  if (!animation || !Array.isArray(animation.frames)) return 1;
  return Math.max(1, animation.frames.length);
}

const PREVIEW_LUTA_VISUAL_STATES: PreviewLutaVisualState[] = ["idle", "attack", "special", "guard", "hurt"];

function projectActorForPreview(data: GBAProjectData, actorID: string): Record<string, unknown> | null {
  return projectArray(data, "actors").find((candidate) => nullableString(candidate.id) === actorID) ?? null;
}

function lutaAnimationConfigForActor(actor: Record<string, unknown>): Record<string, unknown> | null {
  const rawConfig = Object.hasOwn(actor, "lutaAnimations") ? actor.lutaAnimations : actor.luta_animations;
  return isRecord(rawConfig) ? rawConfig : null;
}

function lutaAnimationFallbackForActor(actor: Record<string, unknown>): PreviewLutaVisualFallback {
  const config = lutaAnimationConfigForActor(actor);
  return config?.fallback === "idle_animation" ? "idle_animation" : "static_metasprite";
}

function lutaAnimationEntryForActor(
  data: GBAProjectData,
  actor: Record<string, unknown>,
  animationName: string | null
): { animation: Record<string, unknown>; index: number } | null {
  const spriteSheet = nullableString(actor.spriteSheet);
  if (!spriteSheet || !animationName) return null;
  return projectArray(data, "animations")
    .map((animation, index) => ({ animation, index }))
    .find(({ animation, index }) => {
      const candidateName = nullableString(animation.name);
      const candidateID = nullableString(animation.id) ?? `animation-${index + 1}`;
      return (candidateName === animationName || candidateID === animationName)
        && nullableString(animation.spriteSheet) === spriteSheet;
    }) ?? null;
}

function previewLutaAnimationSelection(
  data: GBAProjectData,
  actor: Record<string, unknown>,
  state: PreviewLutaVisualState
): { animationName: string | null; fallback: PreviewLutaVisualFallback } {
  const config = lutaAnimationConfigForActor(actor);
  if (!config) return { animationName: null, fallback: "static_metasprite" };

  const configuredName = nullableString(config[state]);
  if (configuredName && lutaAnimationEntryForActor(data, actor, configuredName)) {
    return { animationName: configuredName, fallback: "none" };
  }

  if (state !== "idle" && config.fallback === "idle_animation") {
    const idleName = nullableString(config.idle);
    if (idleName && lutaAnimationEntryForActor(data, actor, idleName)) {
      return { animationName: idleName, fallback: "idle_animation" };
    }
  }

  return { animationName: null, fallback: "static_metasprite" };
}

function isPreviewLutaActor(data: GBAProjectData, actor: PreviewRuntimeActor): boolean {
  const sourceActor = projectActorForPreview(data, actor.id);
  return Boolean(sourceActor && (
    isRecord(sourceActor.battle)
    || Object.hasOwn(sourceActor, "lutaAnimations")
    || Object.hasOwn(sourceActor, "luta_animations")
  ));
}

function lutaCombatForRoom(data: GBAProjectData, room: PreviewRuntimeRoom | null, actors: PreviewRuntimeActor[]): LutaCombatState | null {
  if (room?.sceneType !== "luta") return null;
  const source = roomRecordByRuntimeRoom(data, room);
  const config = lutaSceneConfigFromRuntime(source?.runtime, data.settings);
  const fighters = ["player1", "player2"].map(side => {
    const actor = actors.map(actor => projectActorForPreview(data, actor.id)).find(actor => isRecord(actor?.battle) && actor.battle.side === side);
    const battle = isRecord(actor?.battle) ? actor.battle : {};
    return { maxHp: numberToken(String(battle.maxHp ?? 100), 100), guardPower: numberToken(String(battle.guardPower ?? 48), 48) };
  });
  return createLutaCombatState(config ?? {}, fighters);
}

function lutaVisualStatesForRoom(
  data: GBAProjectData,
  room: PreviewRuntimeRoom | null,
  actors: PreviewRuntimeActor[]
): Record<string, PreviewLutaVisualStateData> {
  return room?.sceneType === "luta" ? initialLutaVisualStates(data, actors) : {};
}

function initialLutaVisualStates(
  data: GBAProjectData,
  actors: PreviewRuntimeActor[]
): Record<string, PreviewLutaVisualStateData> {
  return Object.fromEntries(actors.flatMap((actor) => {
    const sourceActor = projectActorForPreview(data, actor.id);
    if (!sourceActor || !isPreviewLutaActor(data, actor)) return [];
    const selection = previewLutaAnimationSelection(data, sourceActor, "idle");
    return [[actor.id, {
      state: "idle" as const,
      animationName: selection.animationName,
      frameIndex: 0,
      elapsedMs: 0,
      fallback: selection.fallback,
      guarding: false,
      hitstunFrames: 0
    } satisfies PreviewLutaVisualStateData]];
  }));
}

function applyLutaVisualStateToActor(
  data: GBAProjectData,
  actor: PreviewRuntimeActor,
  visualState: PreviewLutaVisualStateData
): PreviewRuntimeActor {
  const sourceActor = projectActorForPreview(data, actor.id);
  const baseAnimationName = nullableString(sourceActor?.animationName) ?? actor.animationName;
  const animationName = visualState.animationName ?? baseAnimationName;
  const frameIndex = visualState.animationName === null
    ? nonNegativeInteger(sourceActor?.animationFrameIndex, 0)
    : visualState.frameIndex;
  const resolvedSprite = resolveGbaActorSpriteFrame(data, { ...actor, animationName }, frameIndex);
  return {
    ...actor,
    animationName,
    animationFrame: resolvedSprite?.frame ?? null,
    animationFrameIndex: frameIndex,
    renderDiagnostics: resolvedSprite?.diagnostics ?? []
  };
}

function applyLutaVisualStatesToActors(
  data: GBAProjectData,
  actors: PreviewRuntimeActor[],
  visualStates: Record<string, PreviewLutaVisualStateData>
): PreviewRuntimeActor[] {
  return actors.map((actor) => {
    const visualState = visualStates[actor.id];
    return visualState ? applyLutaVisualStateToActor(data, actor, visualState) : actor;
  });
}

function applyPlayerAnimationFrame(
  project: GBAProjectData,
  player: PreviewRuntimePlayer | null,
  frameIndex: number
): PreviewRuntimePlayer | null {
  if (!player) return null;
  const actor = projectArray(project, "actors").find((candidate) => nullableString(candidate.id) === player.id);
  const resolvedSprite = resolveGbaActorSpriteFrame(project, actor ?? {
    spriteSheet: player.spriteSheet,
    animationName: player.animationName
  }, frameIndex);
  return {
    ...player,
    animationFrame: resolvedSprite?.frame ?? player.animationFrame
  };
}

function runtimeActors(data: GBAProjectData, fallbackRoomName: string): PreviewRuntimeActor[] {
  return projectArray(data, "actors").map((actor, index) => {
    const spriteSheet = nullableString(actor.spriteSheet);
    const animationName = nullableString(actor.animationName);
    const resolvedSprite = resolveGbaActorSprite(data, actor);
    const spriteAsset = previewAssetRefForSpriteSheet(data, spriteSheet, resolvedSprite?.asset);
    return {
      id: stringField(actor.id, `actor-${index + 1}`),
      name: stringField(actor.name, `Actor ${index + 1}`),
      roomName: actorRoomName(actor, fallbackRoomName),
      x: integerField(actor.x, integerField(isRecord(actor.position) ? actor.position.x : undefined, 0)),
      y: integerField(actor.y, integerField(isRecord(actor.position) ? actor.position.y : undefined, 0)),
      z: integerField(actor.z, 0),
      renderLayer: gbaRenderLayers.obj,
      spriteSheet,
      spriteAsset,
      animationName,
      animationFrame: resolvedSprite?.frame ?? null,
      active: booleanField(actor.active, true),
      animationFrameIndex: nonNegativeInteger(actor.animationFrameIndex, 0),
      collisionBox: null,
      collisionEnabled: booleanField(actor.collisionEnabled, true),
      direction: stringField(actor.direction, "down"),
      eventName: nullableString(actor.eventName),
      eventBindings: eventBindings(actor),
      gesture: null,
      movementSpeed: null,
      ...(isRecord(actor.battle) && integerField(actor.battle.spriteScale, 1) > 1 ? { spriteScale: 2 } : {}),
      renderDiagnostics: resolvedSprite?.diagnostics ?? [],
      visible: booleanField(actor.visible, true)
    };
  });
}

function runtimeTriggers(data: GBAProjectData, fallbackRoomName: string): PreviewRuntimeTrigger[] {
  return projectArray(data, "triggers").map((trigger, index) => ({
    id: stringField(trigger.id, `trigger-${index + 1}`),
    name: stringField(trigger.name, `Trigger ${index + 1}`),
    roomName: actorRoomName(trigger, fallbackRoomName),
    x: integerField(trigger.x, integerField(isRecord(trigger.position) ? trigger.position.x : undefined, 0)),
    y: integerField(trigger.y, integerField(isRecord(trigger.position) ? trigger.position.y : undefined, 0)),
    width: positiveInteger(trigger.width, positiveInteger(isRecord(trigger.size) ? trigger.size.width : undefined, 1)),
    height: positiveInteger(trigger.height, positiveInteger(isRecord(trigger.size) ? trigger.size.height : undefined, 1)),
    eventName: nullableString(trigger.eventName),
    onInteractEventName: nullableString(trigger.onInteractEventName),
    onEnterEventName: nullableString(trigger.onEnterEventName),
    onLeaveEventName: nullableString(trigger.onLeaveEventName),
    eventBindings: eventBindings(trigger)
  }));
}

function actorsForRoom(data: GBAProjectData, room: PreviewRuntimeRoom | null): PreviewRuntimeActor[] {
  if (!room) return [];
  return runtimeActors(data, room.name).filter((actor) => actor.roomName === room.name);
}

function dungeonCrawlerPlayerSpriteSheet(data: GBAProjectData): string | null {
  const settings = isRecord(data.settings) ? data.settings : {};
  const dungeonSettings = isRecord(settings.dungeonCrawler) ? settings.dungeonCrawler : {};
  const topdownSettings = isRecord(settings.topdown) ? settings.topdown : {};
  const candidates = [
    nullableString(dungeonSettings.playerSprite),
    nullableString(topdownSettings.playerSprite),
    "nara-topdown.png"
  ].filter((candidate): candidate is string => Boolean(candidate));
  const assets = new Set(projectArray(data, "assets").map((asset) => nullableString(asset.name)).filter(Boolean));
  return candidates.find((candidate) => assets.has(candidate)) ?? null;
}

function dungeonCrawlerPlayerAnimationName(
  data: GBAProjectData,
  spriteSheet: string | null,
  direction: string
): string | null {
  if (!spriteSheet) return null;
  const animations = projectArray(data, "animations");
  const directionalIdle = `idle_${direction}`;
  const preferred = animations.find((animation) => (
    nullableString(animation.spriteSheet) === spriteSheet
    && (nullableString(animation.name) === directionalIdle || nullableString(animation.id) === directionalIdle)
  ));
  const fallback = animations.find((animation) => nullableString(animation.spriteSheet) === spriteSheet);
  return nullableString(preferred?.name ?? preferred?.id ?? fallback?.name ?? fallback?.id);
}

function dungeonCrawlerPlayerForRoom(
  data: GBAProjectData,
  room: PreviewRuntimeRoom,
  playerName: string
): PreviewRuntimePlayer | null {
  const config = dungeonCrawlerSceneConfigFromRuntime(room.runtime, data.settings);
  const start = config?.playerStart;
  if (!start) return null;
  const spriteSheet = dungeonCrawlerPlayerSpriteSheet(data);
  const animationName = dungeonCrawlerPlayerAnimationName(data, spriteSheet, start.direction);
  const resolvedSprite = resolveGbaActorSprite(data, { spriteSheet, animationName });
  return {
    id: `dungeon-player-${room.name}`,
    name: playerName || "Player",
    x: start.x,
    y: start.y,
    z: 0,
    direction: start.direction,
    renderLayer: gbaRenderLayers.obj,
    spriteSheet,
    spriteAsset: previewAssetRefForSpriteSheet(data, spriteSheet, resolvedSprite?.asset),
    animationName,
    animationFrame: resolvedSprite?.frame ?? null
  };
}

function triggersForRoom(data: GBAProjectData, room: PreviewRuntimeRoom | null): PreviewRuntimeTrigger[] {
  if (!room) return [];
  return runtimeTriggers(data, room.name).filter((trigger) => trigger.roomName === room.name);
}

function playerForRoom(
  data: GBAProjectData,
  room: PreviewRuntimeRoom | null,
  providedActors?: PreviewRuntimeActor[]
): PreviewRuntimePlayer | null {
  if (!room) return null;
  const actors = providedActors ?? runtimeActors(data, room.name).filter((actor) => actor.roomName === room.name);
  const roomRecord = projectRooms(data).find((candidate, index) => roomName(candidate, index) === room.name);
  const playerName = roomRecord ? nullableString(roomRecord.playerActorName) ?? "" : "";
  const actor = actors.find((candidate) => candidate.name === playerName)
    ?? (room.sceneType === "dungeonCrawler" ? null : actors[0] ?? null);
  if (!actor) return room.sceneType === "dungeonCrawler"
    ? dungeonCrawlerPlayerForRoom(data, room, playerName)
    : null;

  return {
    id: actor.id,
    name: actor.name,
    x: actor.x,
    y: actor.y,
    z: actor.z,
    direction: actor.direction,
    renderLayer: actor.renderLayer,
    spriteSheet: actor.spriteSheet,
    spriteAsset: actor.spriteAsset,
    animationName: actor.animationName,
    animationFrame: actor.animationFrame
  };
}

function platformerPreviewBodyForRoom(
  project: GBAProjectData,
  room: PreviewRuntimeRoom | null,
  player: PreviewRuntimePlayer | null
): PlatformerPreviewBody | null {
  if (!room?.platformerPreviewEnabled || !player) return null;
  const actor = projectArray(project, "actors").find((candidate) => nullableString(candidate.id) === player.id);
  const spriteSheet = nullableString(actor?.spriteSheet) ?? player.spriteSheet;
  const animationName = nullableString(actor?.animationName) ?? player.animationName;
  const animation = projectArray(project, "animations").find((candidate) => (
    nullableString(candidate.spriteSheet) === spriteSheet
    && nullableString(candidate.name) === animationName
  ));
  const collisionOffsetX = integerField(animation?.hitboxX, 0);
  const collisionOffsetY = integerField(animation?.hitboxY, 0);
  const width = Math.max(1, integerField(animation?.hitboxWidth, gbaTileSizePx));
  const height = Math.max(1, integerField(animation?.hitboxHeight, gbaTileSizePx));
  const body = createPlatformerPreviewBody(
    player.x * gbaTileSizePx + collisionOffsetX,
    player.y * gbaTileSizePx + collisionOffsetY,
    width,
    height,
    collisionOffsetX,
    collisionOffsetY
  );
  body.facing = player.direction === "left" ? "left" : "right";
  return body;
}

interface PreviewRuntimeEventRecord {
  aliases: string[];
  event: Record<string, unknown>;
  name: string;
}

function eventRecords(data: GBAProjectData): Map<string, PreviewRuntimeEventRecord> {
  const events = new Map<string, PreviewRuntimeEventRecord>();
  projectArray(data, "events").forEach((event, index) => {
    const name = stringField(event.name, `event_${index + 1}`);
    const id = nullableString(event.id);
    const aliases = Array.from(new Set([name, id].filter((value): value is string => Boolean(value))));
    const record = { aliases, event, name };
    events.set(name, record);
    if (id) {
      events.set(id, record);
    }
  });
  return events;
}

function eventCommands(event: Record<string, unknown>, data: GBAProjectData): string[] {
  const expansion = expandEventProcedures(projectArray(data, "events"));
  const eventID = nullableString(event.id);
  const eventName = nullableString(event.name);
  const materializedEvent = expansion.events.find((candidate) => (
    (eventID && nullableString(candidate.id) === eventID) ||
    (eventName && nullableString(candidate.name) === eventName)
  )) ?? event;
  const steps = Array.isArray(materializedEvent.steps) ? materializedEvent.steps.filter(isRecord) : [];
  const stepCommands = steps.flatMap((step) => {
    if (step.isEnabled === false) return [];
    const command = nullableString(step.command);
    return command ? [resolveProjectConstantCommand(data, command)] : [];
  });
  const playableStepCommands = stepCommands.filter((command) => command !== "noop");
  if (playableStepCommands.length > 0) return playableStepCommands;
  if (stepCommands.length > 0) return stepCommands;

  return nullableString(materializedEvent.command) ? [resolveProjectConstantCommand(data, nullableString(materializedEvent.command) as string)] : ["noop"];
}

function dialogueByKey(data: GBAProjectData, key: string, mode: PreviewRuntimeDialogue["mode"], locale: ProjectLocale): PreviewRuntimeDialogue | null {
  const dialogue = projectArray(data, "dialogues").find((item) => nullableString(item.key) === key);
  if (!dialogue) return null;
  const localization = deriveProjectLocalization(data);

  return {
    key,
    mode,
    character: stringField(dialogue.character, ""),
    portrait: stringField(dialogue.portrait, ""),
    portraitAsset: assetByName(data, nullableString(dialogue.portrait)),
    emote: stringField(dialogue.emote, ""),
    emoteAsset: assetByName(data, nullableString(dialogue.emote)),
    textSound: stringField(dialogue.textSound, ""),
    textSoundAsset: assetByName(data, nullableString(dialogue.textSound)),
    confirmSound: stringField(dialogue.confirmSound, ""),
    confirmSoundAsset: assetByName(data, nullableString(dialogue.confirmSound)),
    text: localizedDialogueText(dialogue, localization, locale),
    choices: localizedDialogueChoices(dialogue, localization, locale).filter((choice) => choice.trim()),
    selectedChoiceIndex: 0
  };
}

function roomByName(rooms: PreviewRuntimeRoom[], name: string): PreviewRuntimeRoom | null {
  return rooms.find((room) => room.name === name || room.id === name) ?? null;
}

function roomRecordByRuntimeRoom(data: GBAProjectData, room: PreviewRuntimeRoom | null): Record<string, unknown> | null {
  if (!room) return null;
  return projectRooms(data).find((candidate, index) => roomName(candidate, index) === room.name || roomID(candidate, index) === room.id) ?? null;
}

function appendLog(
  state: PreviewRuntimeState,
  eventName: string,
  command: string,
  result: PreviewRuntimeEventLogItem["result"],
  detail: string | null
): PreviewRuntimeState {
  const status: PreviewRuntimeExecutionTraceItem["status"] = result === "unsupported"
    ? "blocked"
    : result === "skipped"
      ? "skipped"
      : "executed";
  return {
    ...state,
    eventLog: [...state.eventLog, { eventName, command, result, detail }],
    executionTrace: [...state.executionTrace, { eventName, command, status, detail }]
  };
}

function diagnosticID(message: string): string {
  return message.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "runtime";
}

function appendDiagnostic(state: PreviewRuntimeState, message: string, severity: PreviewRuntimeDiagnostic["severity"] = "warning"): PreviewRuntimeState {
  const id = diagnosticID(message);
  if (state.diagnostics.some((diagnostic) => diagnostic.id === id)) return state;
  return {
    ...state,
    diagnostics: [...state.diagnostics, { id, severity, message }]
  };
}

function defaultRuntimeCameraState(): PreviewRuntimeCameraState {
  return {
    bounds: null,
    fade: null,
    followPlayer: true,
    lockedToPlayer: false,
    properties: {},
    shakeFrames: 0,
    x: 0,
    y: 0
  };
}

function initialRuntimeCameraStateForRoom(room: PreviewRuntimeRoom | null): PreviewRuntimeCameraState {
  const camera = defaultRuntimeCameraState();
  if (!room || room.sceneType !== "isometric") return camera;
  const config = isometricSceneConfigFromRuntime(room.runtime);
  const pages = config?.tacticalPresentation?.surfacePages ?? [];
  const firstPage = pages[0];
  if (!firstPage) return camera;

  const bounds = pages.reduce(
    (current, page) => ({
      maxX: Math.max(current.maxX, page.world.x + page.world.width),
      maxY: Math.max(current.maxY, page.world.y + page.world.height),
      minX: Math.min(current.minX, page.world.x),
      minY: Math.min(current.minY, page.world.y)
    }),
    { maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY, minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY }
  );
  if (bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) return camera;

  return {
    ...camera,
    bounds: {
      maxX: bounds.maxX,
      maxY: bounds.maxY,
      minX: bounds.minX,
      minY: bounds.minY
    },
    x: firstPage.world.x,
    y: firstPage.world.y
  };
}

function roomUsesPagedTacticalSurfaceInPreview(room: PreviewRuntimeRoom | null): boolean {
  if (!room || room.sceneType !== "isometric") return false;
  return (isometricSceneConfigFromRuntime(room.runtime)?.tacticalPresentation?.surfacePages?.length ?? 0) > 0;
}

const previewAudioBuses: PreviewRuntimeAudioBus[] = ["music", "sfx", "pcm_music", "pcm_sfx"];

function defaultRuntimeAudioMixState(): PreviewRuntimeAudioMixState {
  return {
    volumes: { music: 15, sfx: 15, pcm_music: 15, pcm_sfx: 15 },
    muted: { music: false, sfx: false, pcm_music: false, pcm_sfx: false },
    fades: { music: null, sfx: null, pcm_music: null, pcm_sfx: null },
    lastPcmSfx: null
  };
}

function previewAudioBus(value: string | undefined): PreviewRuntimeAudioBus | "all" {
  const normalized = (value ?? "music").trim().toLowerCase();
  if (normalized === "sfx" || normalized === "sound") return "sfx";
  if (normalized === "pcm_music" || normalized === "pcm_bgm") return "pcm_music";
  if (normalized === "pcm_sfx") return "pcm_sfx";
  if (normalized === "all" || normalized === "todos") return "all";
  return "music";
}

function previewHardwareAudioVolume(value: string | undefined, fallbackPercent = 100): number {
  const percent = Math.max(0, Math.min(100, numberToken(value, fallbackPercent)));
  return Math.round(percent * 15 / 100);
}

function defaultRuntimeHudState(): PreviewRuntimeHudState {
  return {
    gameClock: null,
    hearts: null,
    numbers: {},
    statBars: {}
  };
}

function appendUnsupported(
  state: PreviewRuntimeState,
  eventName: string,
  command: string,
  detail: string,
  message = detail
): PreviewRuntimeState {
  return appendDiagnostic(appendLog(state, eventName, command, "unsupported", detail), message);
}

function updateDebug(state: PreviewRuntimeState): PreviewRuntimeState {
  const roomNameValue = state.currentRoom?.name ?? "-";
  const playerTile = state.player ? `${Math.floor(state.player.x)},${Math.floor(state.player.y)}` : "-";
  const roomActorCount = state.actors.filter((actor) => actor.roomName === state.currentRoom?.name).length;
  const roomTriggerCount = state.triggers.filter((trigger) => trigger.roomName === state.currentRoom?.name).length;
  const runtimeProfile = runtimeProfileForRoom(state.currentRoom);
  const linkCable = state.linkCable ?? defaultLinkCablePreviewState();
  return {
    ...state,
    runtimeProfile,
    debug: {
      ...state.debug,
      lines: [
        `Room ${roomNameValue}`,
        `Scene type ${runtimeProfile.label}`,
        `Runtime profile ${runtimeProfile.sceneType}`,
        `Player tile ${playerTile}`,
        `Actors ${roomActorCount}`,
        `Triggers ${roomTriggerCount}`,
        `Events ${projectArray(state.project, "events").length}`,
        state.activeMusic ? `Music ${state.activeMusic}` : "Music -",
        state.activeSfx ? `SFX ${state.activeSfx}` : "SFX -",
        state.activeDialogue ? `Dialogue ${state.activeDialogue.key}` : "Dialogue -",
        state.battleMenu.visible ? `Battle menu ${state.battleMenu.page}:${state.battleMenu.selectedIndex}` : "Battle menu -",
        state.isometricTactical.enabled
          ? `Tactical turn ${state.isometricTactical.turnNumber} ${state.isometricTactical.activeTeam}:${state.isometricTactical.phase}`
          : "Tactical -",
        `Variables ${Object.keys(state.variables).length}`,
        `Flags ${Object.keys(state.flags).length}`,
        `Inventory ${Object.keys(state.inventory).length}`,
        `HUD ${Object.keys(state.hud.numbers).length + Object.keys(state.hud.statBars).length + (state.hud.hearts ? 1 : 0) + (state.hud.gameClock ? 1 : 0)}`,
        `Camera ${state.camera.x},${state.camera.y}`,
        `Link ${linkCable.role} ${linkCable.status}`,
        `Trace ${state.executionTrace.length}`,
        `Diagnostics ${state.diagnostics.length}`
      ]
    }
  };
}

function defaultPreviewDebuggerSession(
  partial: Partial<PreviewRuntimeDebuggerSession> = {}
): PreviewRuntimeDebuggerSession {
  return {
    enabled: false,
    paused: false,
    runMode: "continuous",
    breakpoints: [],
    scriptFrame: null,
    pauseReason: null,
    stepPending: false,
    resumePending: false,
    ...partial
  };
}

export function createPreviewDebuggerSession(
  partial: Partial<PreviewRuntimeDebuggerSession> = {}
): PreviewRuntimeDebuggerSession {
  return defaultPreviewDebuggerSession(partial);
}

export function isPreviewDebuggerBlocking(state: PreviewRuntimeState): boolean {
  return state.debugger.enabled && state.debugger.paused;
}

function debuggerPauseReasonForCommand(
  session: PreviewRuntimeDebuggerSession,
  eventName: string,
  commandLine: number
): string | null {
  if (!session.enabled) return null;
  if (hasPreviewDebuggerBreakpoint(session.breakpoints, eventName)) {
    return `Breakpoint no evento ${eventName}`;
  }
  if (hasPreviewDebuggerBreakpoint(session.breakpoints, eventName, commandLine)) {
    return `Breakpoint em ${eventName} linha ${commandLine}`;
  }
  return null;
}

function pausePreviewDebugger(
  state: PreviewRuntimeState,
  frame: PreviewRuntimeScriptFrame,
  pauseReason: string
): PreviewRuntimeState {
  return updateDebug({
    ...state,
    debugger: {
      ...state.debugger,
      paused: true,
      pauseReason,
      scriptFrame: frame,
      stepPending: false
    }
  });
}

function maybePauseAfterScriptStep(
  state: PreviewRuntimeState,
  frame: PreviewRuntimeScriptFrame,
  commandIndex0Based: number,
  skipNextReason: string | null,
  conditionalBranch: PreviewConditionalBranchMode,
  conditionalScopes: PreviewConditionalScope[]
): PreviewRuntimeState | null {
  if (!state.debugger.stepPending) return null;
  const nextLine = commandIndex0Based + 2;
  if (nextLine > frame.commands.length) {
    return updateDebug({
      ...state,
      debugger: {
        ...state.debugger,
        stepPending: false,
        paused: false,
        pauseReason: null,
        scriptFrame: null
      }
    });
  }
  return pausePreviewDebugger(state, {
    ...frame,
    commandIndex: nextLine,
    skipNextReason,
    conditionalBranch,
    conditionalScopes
  }, `Step em ${frame.resolvedEventName} linha ${nextLine}`);
}

export function enablePreviewDebugger(state: PreviewRuntimeState, enabled: boolean): PreviewRuntimeState {
  return updateDebug({
    ...state,
    debugger: {
      ...state.debugger,
      enabled
    }
  });
}

export function togglePreviewDebuggerBreakpoint(state: PreviewRuntimeState, key: string): PreviewRuntimeState {
  const breakpoints = new Set(state.debugger.breakpoints);
  if (breakpoints.has(key)) {
    breakpoints.delete(key);
  } else {
    breakpoints.add(key);
  }
  return updateDebug({
    ...state,
    debugger: {
      ...state.debugger,
      breakpoints: [...breakpoints]
    }
  });
}

export function setPreviewDebuggerVariable(
  state: PreviewRuntimeState,
  key: string,
  value: PreviewRuntimeScalar
): PreviewRuntimeState {
  if (!state.debugger.enabled) return updateDebug(state);
  return updateDebug(setRuntimeVariable(state, key, value));
}

export function resumePreviewDebugger(state: PreviewRuntimeState): PreviewRuntimeState {
  if (!state.debugger.enabled || !state.debugger.paused || !state.debugger.scriptFrame) {
    return updateDebug({
      ...state,
      debugger: {
        ...state.debugger,
        paused: false,
        pauseReason: null,
        runMode: "continuous"
      }
    });
  }

  const frame = state.debugger.scriptFrame;
  return runScriptFrame({
    ...state,
    debugger: {
      ...state.debugger,
      paused: false,
      pauseReason: null,
      scriptFrame: null,
      runMode: "continuous",
      resumePending: true
    }
  }, frame);
}

export function stepPreviewDebuggerScript(state: PreviewRuntimeState): PreviewRuntimeState {
  if (!state.debugger.enabled) return updateDebug(state);

  if (!state.debugger.paused || !state.debugger.scriptFrame) {
    return updateDebug({
      ...state,
      debugger: {
        ...state.debugger,
        runMode: "step"
      }
    });
  }

  const frame = state.debugger.scriptFrame;
  return runScriptFrame({
    ...state,
    debugger: {
      ...state.debugger,
      paused: false,
      pauseReason: null,
      scriptFrame: null,
      runMode: "step",
      stepPending: true
    }
  }, frame);
}

function setCurrentRoom(state: PreviewRuntimeState, room: PreviewRuntimeRoom, triggerRoomEnter = true): PreviewRuntimeState {
  const previousRoom = state.currentRoom;
  state={...state,nativeEvents:{...initialNativeEvents(),projectileSlots:state.nativeEvents.projectileSlots}};
  const roomActors = actorsForRoom(state.project, room);
  const destinationPlayerName = roomRecordByRuntimeRoom(state.project, room)?.playerActorName;
  if (previousRoom?.sceneType === "topdown" && state.player && !roomActors.some(actor => actor.name === destinationPlayerName)) {
    const previousPlayer = state.actors.find(actor => actor.id === state.player?.id);
    if (previousPlayer && !roomActors.some(actor => actor.id === previousPlayer.id || actor.name === previousPlayer.name)) {
      roomActors.unshift({ ...previousPlayer, roomName: room.name, x: state.player.x, y: state.player.y, direction: state.player.direction });
    }
  }
  const lutaVisualStates = lutaVisualStatesForRoom(state.project, room, roomActors);
  const actors = applyLutaVisualStatesToActors(state.project, roomActors, lutaVisualStates);
  const player = playerForRoom(state.project, room, actors) ?? (previousRoom?.sceneType === "topdown" ? state.player : null);
  const tacticalPresentation = room.tacticalPresentation;
  const tacticalMusic = tacticalPresentation?.audio?.music ?? null;
  const entered = applyPointClickCursorAnimation(updateDebug({
    ...state,
    currentRoom: room,
    dialogueUi: dialogueUiSettings(state.project, room.id),
    camera: roomUsesPagedTacticalSurfaceInPreview(room) ? initialRuntimeCameraStateForRoom(room) : state.camera,
    runtimeProfile: runtimeProfileForRoom(room),
    player,
    platformerPhysics: platformerPreviewBodyForRoom(state.project, room, player),
    platformerInputRequests: { jump: false, dash: false },
    actors,
    adventureCallbacks: previousRoom?.sceneType === room.sceneType ? state.adventureCallbacks : {},
    platformCallbacks: previousRoom?.sceneType === room.sceneType ? state.platformCallbacks : {},
    platformerState: "ground",
    platformerRequestedState: null,
    platformerPlayerActive: true,
    lutaVisualStates,
    lutaCombat: lutaCombatForRoom(state.project, room, actors),
    triggers: triggersForRoom(state.project, room),
    overlappingTriggerIDs: [],
    sceneMenu: defaultSceneMenuForRoom(state.project, room, state.sceneMenu.stack),
    textInput: defaultPreviewTextInputState(),
    battleMenu: defaultBattleMenuForRoom(room),
    dungeonInteraction: defaultDungeonInteractionForRoom(room, player),
    dungeonHud: defaultDungeonHudForRoom(room),
    isometricTactical: defaultIsometricTacticalState(room, actors),
    isometricTacticalPresentation: tacticalPresentation,
    ...(tacticalMusic ? {
      activeMusic: tacticalMusic,
      activeMusicAsset: assetByReference(state.project, tacticalMusic)
    } : {}),
    ...battleStateForRoom(state.project, room),
    battleTurnIndex: 0,
    battleEscaped: false
  }));
  const transitioned = applySceneConnectionTransition(entered, previousRoom, room);
  return triggerRoomEnter && previousRoom?.id !== room.id && room.sceneType === "topdown"
    ? queuePreviewCallback(transitioned, transitioned.adventureCallbacks[1] ?? roomBootEventName(transitioned),
        !transitioned.adventureCallbacks[1]) : transitioned;
}

function setCurrentMenuScreen(
  state: PreviewRuntimeState,
  screenID: string,
  runEnterEvent = true
): PreviewRuntimeState {
  const config = sceneMenuConfigForRoom(state.currentRoom);
  const screen = embeddedMenuScreenForConfig(config, screenID);
  if (!config || !screen) {
    return updateDebug({
      ...state,
      sceneMenu: { ...state.sceneMenu, notice: `Tela não encontrada: ${screenID || "-"}.` }
    });
  }
  const hudBinding = (screen.hudMode ?? (screen.hudPresetId ? undefined : config.hudMode)) === "none" ? null : resolveExplicitHudPresetBinding(state.project, {
    roomID: state.currentRoom?.id,
    scenePresetId: screen.hudPresetId,
    roomPresetId: config.hudPresetId ?? state.currentRoom?.hudPresetId
  });
  const nextState = updateDebug({
    ...state,
    sceneMenu: {
      ...state.sceneMenu,
      visible: true,
      selectedIndex: 0,
      notice: null,
      screenID: screen.id,
      menuProfile: screen.menuProfile ?? config.menuProfile,
      hudPresetId: hudBinding ? hudBinding.requestedPresetId === HUD_PROJECT_PRESET_ID ? hudBinding.presetId : hudBinding.requestedPresetId ?? hudBinding.presetId : null,
      elapsedFrames: 0
    }
  });
  return runEnterEvent && screen.onEnterEventName
    ? runEvent(nextState, screen.onEnterEventName)
    : nextState;
}

function runActiveMenuScreenEnter(state: PreviewRuntimeState): PreviewRuntimeState {
  const screen = embeddedMenuScreenForConfig(
    sceneMenuConfigForRoom(state.currentRoom),
    state.sceneMenu.screenID
  );
  return screen?.onEnterEventName
    ? runEvent(state, screen.onEnterEventName)
    : state;
}

function advanceSceneMenuToNextScreen(state: PreviewRuntimeState): PreviewRuntimeState {
  const config = sceneMenuConfigForState(state);
  const nextScreenID = config?.nextScreenID.trim() ?? "";
  if (!nextScreenID) return state;

  const roomConfig = sceneMenuConfigForRoom(state.currentRoom);
  const embeddedTarget = embeddedMenuScreenForConfig(roomConfig, nextScreenID);
  if (embeddedTarget) {
    return setCurrentMenuScreen(state, embeddedTarget.id);
  }

  const target = roomByName(state.rooms, nextScreenID);
  if (!target || target.sceneType !== "menu") {
    return updateDebug({
      ...state,
      sceneMenu: { ...state.sceneMenu, notice: `Tela não encontrada: ${nextScreenID}.` }
    });
  }
  return runActiveMenuScreenEnter(setCurrentRoom(state, target));
}

function tickPreviewSceneMenu(state: PreviewRuntimeState, advancedFrames: number): PreviewRuntimeState {
  if (
    advancedFrames <= 0 ||
    !state.sceneMenu.visible ||
    state.activeDialogue ||
    state.startMenu.visible
  ) {
    return state;
  }
  const config = sceneMenuConfigForState(state);
  if (!config || (config.screenType !== "logo" && config.screenType !== "title")) return state;

  const elapsedFrames = state.sceneMenu.elapsedFrames + advancedFrames;
  const nextState = {
    ...state,
    sceneMenu: { ...state.sceneMenu, elapsedFrames }
  };
  return config.autoAdvanceFrames > 0 && elapsedFrames >= config.autoAdvanceFrames
    ? advanceSceneMenuToNextScreen(nextState)
    : nextState;
}

function skipPreviewLogo(state: PreviewRuntimeState): PreviewRuntimeState {
  const config = sceneMenuConfigForState(state);
  if (
    !state.sceneMenu.visible ||
    state.activeDialogue ||
    !config ||
    config.screenType !== "logo" ||
    !config.allowSkip
  ) {
    return state;
  }
  return advanceSceneMenuToNextScreen(state);
}

function commandTokens(command: string): string[] {
  return command.split(/\s+/).filter(Boolean);
}

function numberToken(value: string | undefined, fallback = 0): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanToken(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (["true", "1", "yes", "sim", "on"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no", "nao", "não", "off"].includes(value.toLowerCase())) return false;
  return fallback;
}

function scalarToken(value: string | undefined): PreviewRuntimeScalar {
  if (value === undefined) return "";
  if (["true", "false"].includes(value.toLowerCase())) return value.toLowerCase() === "true";
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim() !== "" ? parsed : value;
}

function variableNumber(state: PreviewRuntimeState, key: string, fallback = 0): number {
  const value = state.variables[key];
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") return numberToken(value, fallback);
  return fallback;
}

function scalarEquals(left: PreviewRuntimeScalar | undefined, right: PreviewRuntimeScalar | undefined): boolean {
  if (typeof left === "number" || typeof right === "number") return Number(left) === Number(right);
  if (typeof left === "boolean" || typeof right === "boolean") return Boolean(left) === Boolean(right);
  return String(left ?? "") === String(right ?? "");
}

function engineFieldValue(state: PreviewRuntimeState, field: string): PreviewRuntimeScalar {
  if (["current_scene_index", "current_room", "scene", "room"].includes(field)) {
    const rooms = state.rooms.filter(room => room.sceneType === state.currentRoom?.sceneType);
    return Math.max(0, rooms.findIndex(room => room.id === state.currentRoom?.id));
  }
  const coordinateScale = ["topdown", "platformer"].includes(state.currentRoom?.sceneType ?? "") ? gbaTileSizePx : 1;
  if (field === "player_x") return Math.trunc(state.currentRoom?.sceneType === "platformer" && state.platformerPhysics
    ? state.platformerPhysics.x : (state.player?.x ?? 0) * coordinateScale);
  if (field === "player_y") return Math.trunc(state.currentRoom?.sceneType === "platformer" && state.platformerPhysics
    ? state.platformerPhysics.y : (state.player?.y ?? 0) * coordinateScale);
  if (field === "camera_x") return state.camera.x;
  if (field === "camera_y") return state.camera.y;
  if (["plat_blank_grav", "platformer_blank_gravity"].includes(field)) {
    return state.variables.platformer_blank_gravity ?? state.variables.plat_blank_grav ?? 0;
  }
  return state.camera.properties[field] ?? state.variables[field] ?? 0;
}

function setRuntimeVariable(state: PreviewRuntimeState, key: string, value: PreviewRuntimeScalar): PreviewRuntimeState {
  if (!key) return state;
  return {
    ...state,
    variables: {
      ...state.variables,
      [key]: value
    }
  };
}

function setRuntimeFlag(state: PreviewRuntimeState, key: string, value: boolean): PreviewRuntimeState {
  if (!key) return state;
  return {
    ...state,
    flags: {
      ...state.flags,
      [key]: value
    }
  };
}

function actorMatches(actor: PreviewRuntimeActor, actorName: string, player: PreviewRuntimePlayer | null): boolean {
  const normalized = actorName.toLowerCase();
  return actor.name === actorName ||
    actor.id === actorName ||
    (normalized === "player" && (actor.id === player?.id || actor.name === player?.name));
}

function stateWithActors(state: PreviewRuntimeState, actors: PreviewRuntimeActor[]): PreviewRuntimeState {
  const matchingPlayer = state.player
    ? actors.find((actor) => actor.id === state.player?.id || actor.name === state.player?.name)
    : null;
  return {
    ...state,
    actors,
    player: matchingPlayer && state.player
      ? {
        ...state.player,
        x: matchingPlayer.x,
        y: matchingPlayer.y,
        direction: matchingPlayer.direction,
        renderLayer: matchingPlayer.renderLayer,
        spriteSheet: matchingPlayer.spriteSheet,
        spriteAsset: matchingPlayer.spriteAsset,
        animationName: matchingPlayer.animationName,
        animationFrame: matchingPlayer.animationFrame
      }
      : state.player
  };
}

function setPreviewLutaVisualState(
  state: PreviewRuntimeState,
  actorID: string,
  visualState: PreviewLutaVisualState,
  status: PreviewLutaVisualRuntimeStatus = {},
  resetAnimation = true
): PreviewRuntimeState {
  const current = state.lutaVisualStates[actorID];
  const sourceActor = projectActorForPreview(state.project, actorID);
  if (!current || !sourceActor) return state;

  const selection = previewLutaAnimationSelection(state.project, sourceActor, visualState);
  const nextVisualState: PreviewLutaVisualStateData = {
    ...current,
    state: visualState,
    animationName: selection.animationName,
    frameIndex: resetAnimation ? 0 : current.frameIndex,
    elapsedMs: resetAnimation ? 0 : current.elapsedMs,
    fallback: selection.fallback,
    guarding: status.guarding ?? visualState === "guard",
    hitstunFrames: status.hitstunFrames === undefined
      ? visualState === "hurt" ? current.hitstunFrames : 0
      : Math.max(0, Math.floor(status.hitstunFrames))
  };
  const visualStates = {
    ...state.lutaVisualStates,
    [actorID]: nextVisualState
  };
  const actors = applyLutaVisualStatesToActors(state.project, state.actors, visualStates);
  return stateWithActors({ ...state, lutaVisualStates: visualStates }, actors);
}

export function syncPreviewLutaVisualState(
  state: PreviewRuntimeState,
  actorID: string,
  status: PreviewLutaVisualRuntimeStatus
): PreviewRuntimeState {
  const current = state.lutaVisualStates[actorID];
  if (!current) return state;

  const hitstunFrames = status.hitstunFrames === undefined
    ? current.hitstunFrames
    : Math.max(0, Math.floor(status.hitstunFrames));
  const guarding = status.guarding ?? current.guarding;
  const targetState: PreviewLutaVisualState = hitstunFrames > 0
    ? "hurt"
    : guarding
      ? "guard"
      : current.state === "hurt" || current.state === "guard"
        ? "idle"
        : current.state;
  return setPreviewLutaVisualState(
    state,
    actorID,
    targetState,
    { hitstunFrames, guarding },
    targetState !== current.state
  );
}

function dispatchLutaPreviewVisualAction(
  state: PreviewRuntimeState,
  visualState: Extract<PreviewLutaVisualState, "attack" | "special">
): PreviewRuntimeState {
  if (!state.player) return state;
  return setPreviewLutaVisualState(state, state.player.id, visualState, {
    guarding: false,
    hitstunFrames: 0
  });
}

function tickLutaPreviewVisualStates(
  state: PreviewRuntimeState,
  deltaMs: number,
  frameDelta: number,
  heldMovement: PreviewRuntimeAction | null
): PreviewRuntimeState {
  if (state.currentRoom?.sceneType !== "luta") return state;

  let changed = false;
  const visualStates: Record<string, PreviewLutaVisualStateData> = { ...state.lutaVisualStates };
  for (const actor of state.actors) {
    const current = visualStates[actor.id];
    const sourceActor = projectActorForPreview(state.project, actor.id);
    if (!current || !sourceActor) continue;

    const hitstunFrames = Math.max(0, current.hitstunFrames - Math.max(0, frameDelta));
    const guarding = actor.id === state.player?.id && heldMovement === "down" && hitstunFrames === 0;
    let targetState = current.state;
    if (hitstunFrames > 0) {
      targetState = "hurt";
    } else if (guarding) {
      targetState = "guard";
    } else if (current.state === "hurt" || current.state === "guard") {
      targetState = "idle";
    }

    const selection = previewLutaAnimationSelection(state.project, sourceActor, targetState);
    const animationChanged = selection.animationName !== current.animationName || selection.fallback !== current.fallback;
    const stateChanged = targetState !== current.state || animationChanged || guarding !== current.guarding || hitstunFrames !== current.hitstunFrames;
    if (stateChanged) {
      const shouldReset = targetState !== current.state || animationChanged;
      visualStates[actor.id] = {
        ...current,
        state: targetState,
        animationName: selection.animationName,
        frameIndex: shouldReset ? 0 : current.frameIndex,
        elapsedMs: shouldReset ? 0 : current.elapsedMs,
        fallback: selection.fallback,
        guarding,
        hitstunFrames
      };
      changed = true;
      continue;
    }

    if (deltaMs <= 0 || !current.animationName) continue;
    const animationEntry = lutaAnimationEntryForActor(state.project, sourceActor, current.animationName);
    const animation = animationEntry?.animation;
    const frameCount = animation && Array.isArray(animation.frames)
      ? Math.max(1, animation.frames.length)
      : 1;
    const fps = positiveInteger(animation?.fps, 6);
    const frameDurationMs = 1000 / fps;
    const elapsedMs = current.elapsedMs + deltaMs;
    const loops = booleanField(animation?.loops, true);
    const finished = !loops && elapsedMs >= frameDurationMs * frameCount;
    if (finished && (current.state === "attack" || current.state === "special")) {
      const idleSelection = previewLutaAnimationSelection(state.project, sourceActor, "idle");
      visualStates[actor.id] = {
        ...current,
        state: "idle",
        animationName: idleSelection.animationName,
        frameIndex: 0,
        elapsedMs: 0,
        fallback: idleSelection.fallback,
        guarding: false,
        hitstunFrames: 0
      };
      changed = true;
      continue;
    }

    const frameIndex = loops
      ? Math.floor(elapsedMs / frameDurationMs) % frameCount
      : Math.min(frameCount - 1, Math.floor(elapsedMs / frameDurationMs));
    if (frameIndex !== current.frameIndex || elapsedMs !== current.elapsedMs) {
      visualStates[actor.id] = { ...current, frameIndex, elapsedMs };
      changed = true;
    }
  }

  if (!changed) return state;
  return stateWithActors({ ...state, lutaVisualStates: visualStates }, applyLutaVisualStatesToActors(state.project, state.actors, visualStates));
}

function updateRuntimeActor(
  state: PreviewRuntimeState,
  actorName: string,
  update: (actor: PreviewRuntimeActor) => PreviewRuntimeActor
): PreviewRuntimeState {
  if (!actorName) return state;
  let changed = false;
  const actors = state.actors.map((actor) => {
    if (!actorMatches(actor, actorName, state.player)) return actor;
    changed = true;
    return update(actor);
  });
  return changed ? stateWithActors(state, actors) : state;
}

function actorByName(state: PreviewRuntimeState, actorName: string): PreviewRuntimeActor | null {
  return state.actors.find((actor) => actorMatches(actor, actorName, state.player)) ?? null;
}

function actorDistance(actor: PreviewRuntimeActor | null, target: PreviewRuntimeActor | null, player: PreviewRuntimePlayer | null): number {
  if (!actor) return Number.POSITIVE_INFINITY;
  const targetX = target?.x ?? player?.x ?? actor.x;
  const targetY = target?.y ?? player?.y ?? actor.y;
  return Math.abs(actor.x - targetX) + Math.abs(actor.y - targetY);
}

function runtimeScriptLog(
  state: PreviewRuntimeState,
  eventName: string,
  command: string,
  detail: string | null
): PreviewRuntimeState {
  return updateDebug(appendLog(state, eventName, command, "script", detail));
}

function evaluateConditionCommand(state: PreviewRuntimeState, parts: string[]): boolean | null {
  const verb = parts[0] ?? "noop";
  const key = parts[1] ?? "";
  if (verb === "if_variable") return scalarEquals(state.variables[key], scalarToken(parts[2]));
  if (verb === "if_variable_variable") return scalarEquals(state.variables[key], state.variables[parts[2] ?? ""]);
  if (verb === "if_variable_greater_than") return variableNumber(state, key) > numberToken(parts[2], 0);
  if (verb === "if_variable_less_than") return variableNumber(state, key) < numberToken(parts[2], 0);
  if (verb === "if_flag") return (state.flags[key] ?? false) === booleanToken(parts[2], true);
  if (verb === "has_item") return (state.inventory[key] ?? 0) >= numberToken(parts[2], 1);
  if (verb === "if_scene") return state.currentRoom?.name === key || state.currentRoom?.id === key;
  if (verb === "if_engine_field") return scalarEquals(engineFieldValue(state, key), scalarToken(parts[2]));
  if (verb === "if_engine_field_variable") return scalarEquals(engineFieldValue(state, key), state.variables[parts[2] ?? ""]);
  if (verb === "if_rtc") return scalarEquals(previewRuntimeRtcFieldValue(state, key) ?? undefined, scalarToken(parts[2]));
  if (verb === "if_actor_direction") return actorByName(state, key)?.direction === (parts[2] ?? "");
  if (verb === "if_actor_at_position") {
    const actor = actorByName(state, key);
    return actor?.x === numberToken(parts[2], 0) && actor?.y === numberToken(parts[3], 0);
  }
  if (verb === "if_actor_distance") {
    const actor = actorByName(state, key);
    const target = actorByName(state, parts[2] ?? "");
    return actorDistance(actor, target, state.player) <= numberToken(parts[3], 1);
  }
  if (verb === "if_actor_relative") {
    const actor = actorByName(state, key);
    const target = actorByName(state, parts[2] ?? "");
    const targetX = target?.x ?? state.player?.x ?? 0;
    const targetY = target?.y ?? state.player?.y ?? 0;
    const direction = parts[3] ?? "";
    if (!actor) return false;
    if (direction === "left") return actor.x < targetX;
    if (direction === "right") return actor.x > targetX;
    if (direction === "up") return actor.y < targetY;
    if (direction === "down") return actor.y > targetY;
    return false;
  }
  if (verb === "if_save_game") {
    const slot = Math.max(0, Math.min(255, numberToken(parts[1], 0)));
    return previewRuntimeSaveSlotAvailable(state, slot) && state.saveSlots[slot] !== undefined;
  }
  if (verb === "if_button") return false;
  return null;
}

const previewConditionCommandVerbs = new Set([
  "if_variable",
  "if_variable_variable",
  "if_variable_greater_than",
  "if_variable_less_than",
  "if_flag",
  "has_item",
  "if_scene",
  "if_engine_field",
  "if_engine_field_variable",
  "if_rtc",
  "if_actor_direction",
  "if_actor_at_position",
  "if_actor_distance",
  "if_actor_relative",
  "if_save_game",
  "if_button"
]);

function commandHasElseBranch(commands: string[], ifIndex: number): boolean {
  for (let index = ifIndex + 1; index < commands.length; index += 1) {
    const verb = commands[index]?.split(/\s+/)[0] ?? "";
    if (verb === "else") return true;
    if (previewConditionCommandVerbs.has(verb)) return false;
  }
  return false;
}

function structuredConditionBoundary(commands: string[], ifIndex: number): { elseIndex: number | null; endIndex: number | null } {
  let depth = 1;
  let elseIndex: number | null = null;
  for (let index = ifIndex + 1; index < commands.length; index += 1) {
    const verb = commands[index]?.trim().split(/\s+/)[0] ?? "";
    if (previewConditionCommandVerbs.has(verb)) {
      depth += 1;
      continue;
    }
    if (verb === "condition_end") {
      depth -= 1;
      if (depth === 0) return { elseIndex, endIndex: index };
      continue;
    }
    if (verb === "else" && depth === 1 && elseIndex === null) {
      elseIndex = index;
    }
  }
  return { elseIndex: null, endIndex: null };
}

function structuredRateLimitEnd(commands: string[], startIndex: number): number | null {
  let depth = 1;
  for (let index = startIndex + 1; index < commands.length; index += 1) {
    const verb = commands[index]?.trim().split(/\s+/)[0] ?? "";
    if (verb === "rate_limit") depth += 1;
    if (verb === "rate_limit_end") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return null;
}

function evaluateRepeatExpressionCondition(
  state: PreviewRuntimeState,
  variableKey: string,
  operator: string,
  threshold: string
): boolean {
  const value = variableNumber(state, variableKey);
  const limit = numberToken(threshold, 0);
  switch (operator) {
    case "lt":
      return value < limit;
    case "lte":
      return value <= limit;
    case "gt":
      return value > limit;
    case "gte":
      return value >= limit;
    case "eq":
      return scalarEquals(state.variables[variableKey], scalarToken(threshold));
    case "ne":
      return !scalarEquals(state.variables[variableKey], scalarToken(threshold));
    default:
      return false;
  }
}

function registerChoiceEvent(state: PreviewRuntimeState, parts: string[]): PreviewRuntimeState {
  const dialogueKey = parts[1] ?? "";
  const choiceIndex = numberToken(parts[2], 0);
  const eventName = parts[3] ?? "";
  if (!dialogueKey || !eventName) return state;
  const choiceEvents = state.choiceEvents.filter((choiceEvent) => (
    choiceEvent.dialogueKey !== dialogueKey || choiceEvent.choiceIndex !== choiceIndex
  ));
  return {
    ...state,
    choiceEvents: [...choiceEvents, { dialogueKey, choiceIndex, eventName }]
  };
}

function choiceEventForDialogue(state: PreviewRuntimeState, dialogue: PreviewRuntimeDialogue): PreviewRuntimeChoiceEvent | null {
  return state.choiceEvents.find((choiceEvent) => (
    choiceEvent.dialogueKey === dialogue.key && choiceEvent.choiceIndex === dialogue.selectedChoiceIndex
  )) ?? null;
}

function handleVariableCommand(state: PreviewRuntimeState, parts: string[]): PreviewRuntimeState | null {
  const verb = parts[0] ?? "noop";
  const key = parts[1] ?? "";
  if (verb === "read_rtc") {
    const value = previewRuntimeRtcFieldValue(state, key);
    return value === null ? state : setRuntimeVariable(state, parts[2] ?? "", value);
  }
  if (verb === "set_variable" || verb === "set_engine_field" || verb === "set_adventure_state" || verb === "multiplayer_transfer") {
    return setRuntimeVariable(state, key, scalarToken(parts[2]));
  }
  if (verb === "add_variable" || verb === "mod_variable") {
    return setRuntimeVariable(state, key, variableNumber(state, key) + numberToken(parts[2], 0));
  }
  if (verb === "multiply_variable") {
    return setRuntimeVariable(state, key, variableNumber(state, key, 1) * numberToken(parts[2], 1));
  }
  if (verb === "random_variable") {
    const min = numberToken(parts[2], 0);
    const max = numberToken(parts[3], min);
    const span = Math.max(0, max - min);
    return setRuntimeVariable(state, key, min + Math.floor(Math.random() * (span + 1)));
  }
  if (verb === "store_engine_field") {
    return setRuntimeVariable(state, parts[2] ?? "", engineFieldValue(state, key));
  }
  if (verb === "store_save_variable") {
    return setRuntimeVariable(state, parts[2] ?? "", state.saveSlots[numberToken(key, 0)] ? 1 : 0);
  }
  if (verb === "store_actor_direction") {
    const actor = actorByName(state, key);
    return setRuntimeVariable(state, parts[2] ?? `${key}.direction`, actor?.direction ?? "");
  }
  if (verb === "store_actor_position") {
    const actor = actorByName(state, key);
    return {
      ...setRuntimeVariable(setRuntimeVariable(state, parts[2] ?? `${key}.x`, actor?.x ?? 0), parts[3] ?? `${key}.y`, actor?.y ?? 0)
    };
  }
  if (verb === "add_variable_flags") {
    return setRuntimeVariable(state, key, variableNumber(state, key) | numberToken(parts[2], 0));
  }
  if (verb === "set_variable_flags") {
    return setRuntimeVariable(state, key, numberToken(parts[2], 0));
  }
  if (verb === "clear_variable_flags") {
    return setRuntimeVariable(state, key, variableNumber(state, key) & ~numberToken(parts[2], 0));
  }
  if (verb === "reset_variables_false") {
    return {
      ...state,
      variables: Object.fromEntries(Object.keys(state.variables).map((name) => [name, false]))
    };
  }
  return null;
}

function handleFlagCommand(state: PreviewRuntimeState, parts: string[]): PreviewRuntimeState | null {
  const verb = parts[0] ?? "noop";
  if (verb === "set_flag") {
    return setRuntimeFlag(state, parts[1] ?? "", booleanToken(parts[2], true));
  }
  return null;
}

function handleActorCommand(state: PreviewRuntimeState, parts: string[]): PreviewRuntimeState | null {
  const verb = parts[0] ?? "noop";
  const actorName = parts[1] ?? "";
  if (verb === "set_player_direction") {
    return updateRuntimeActor(state, "player", (actor) => ({ ...actor, direction: parts[1] ?? actor.direction }));
  }
  if (verb === "set_actor_position" || verb === "move_actor_to" || verb === "teleport_actor") {
    return updateRuntimeActor(state, actorName, (actor) => ({ ...actor, x: numberToken(parts[2], actor.x), y: numberToken(parts[3], actor.y) }));
  }
  if (verb === "set_actor_relative_position" || verb === "move_actor_relative" || verb === "move_actor") {
    return updateRuntimeActor(state, actorName, (actor) => ({ ...actor, x: actor.x + numberToken(parts[2], 0), y: actor.y + numberToken(parts[3], 0) }));
  }
  if (verb === "set_actor_direction" || verb === "turn_actor") {
    return updateRuntimeActor(state, actorName, (actor) => ({ ...actor, direction: parts[2] ?? actor.direction }));
  }
  if (verb === "set_actor_animation" || verb === "set_actor_animation_state" || verb === "play_actor_animation") {
    return updateRuntimeActor(state, actorName, (actor) => {
      const animationName = parts[2] ?? actor.animationName;
      const resolvedSprite = resolveGbaActorSprite(state.project, { ...actor, animationName });
      return {
        ...actor,
        animationName,
        animationFrame: resolvedSprite?.frame ?? null,
        renderDiagnostics: resolvedSprite?.diagnostics ?? []
      };
    });
  }
  if (verb === "set_actor_animation_frame") {
    return updateRuntimeActor(state, actorName, (actor) => ({ ...actor, animationFrameIndex: numberToken(parts[2], actor.animationFrameIndex) }));
  }
  if (verb === "set_actor_animation_speed" || verb === "set_actor_movement_speed") {
    return updateRuntimeActor(state, actorName, (actor) => ({ ...actor, movementSpeed: numberToken(parts[2], actor.movementSpeed ?? 0) }));
  }
  if (verb === "lock_script" || verb === "unlock_script" || verb === "overlay_line" || verb === "set_dialogue_frame") {
    return state;
  }
  if (verb === "set_dialogue_text_speed") {
    return {
      ...state,
      dialogueUi: { ...state.dialogueUi, textSpeed: `${numberToken(parts[1], 2)} frames` }
    };
  }
  if (verb === "wait_actor_animation") {
    return state;
  }
  if (verb === "replace_tile" || verb === "replace_tile_sequence") {
    const room = state.currentRoom;
    if (!room) return state;
    const x = numberToken(parts[1], 0);
    const y = numberToken(parts[2], 0);
    const startTile = numberToken(parts[3], 0);
    const count = verb === "replace_tile_sequence" ? Math.max(1, numberToken(parts[4], 1)) : 1;
    const tileCells = [...room.tileCells];
    for (let tileOffset = 0; tileOffset < count; tileOffset += 1) {
      const cellIndex = y * room.width + (x + tileOffset);
      if (cellIndex >= 0 && cellIndex < tileCells.length) {
        tileCells[cellIndex] = startTile + tileOffset;
      }
    }
    const nextRoom = { ...room, tileCells };
    return {
      ...state,
      currentRoom: nextRoom,
      rooms: state.rooms.map((item) => item.id === room.id ? nextRoom : item)
    };
  }
  if (verb === "change_actor_sprite") {
    return updateRuntimeActor(state, actorName, (actor) => {
      const spriteSheet = parts[2] ?? actor.spriteSheet;
      const resolvedSprite = resolveGbaActorSprite(state.project, { ...actor, spriteSheet });
      return {
        ...actor,
        spriteSheet,
        spriteAsset: previewAssetRefForSpriteSheet(state.project, spriteSheet, resolvedSprite?.asset),
        animationFrame: resolvedSprite?.frame ?? null,
        renderDiagnostics: resolvedSprite?.diagnostics ?? []
      };
    });
  }
  if (verb === "change_player_sprite") {
    const spriteSheet = parts[1] ?? state.player?.spriteSheet ?? null;
    return updateRuntimeActor(state, "player", (actor) => {
      const resolvedSprite = resolveGbaActorSprite(state.project, { ...actor, spriteSheet });
      return {
        ...actor,
        spriteSheet,
        spriteAsset: previewAssetRefForSpriteSheet(state.project, spriteSheet, resolvedSprite?.asset),
        animationFrame: resolvedSprite?.frame ?? null,
        renderDiagnostics: resolvedSprite?.diagnostics ?? []
      };
    });
  }
  if (verb === "set_actor_visible") {
    return updateRuntimeActor(state, actorName, (actor) => ({ ...actor, visible: booleanToken(parts[2], true) }));
  }
  if (verb === "set_all_sprites_visible") {
    const visible = booleanToken(parts[1], true);
    return stateWithActors(state, state.actors.map((actor) => ({ ...actor, visible })));
  }
  if (verb === "set_actor_active") {
    return updateRuntimeActor(state, actorName, (actor) => ({ ...actor, active: booleanToken(parts[2], true) }));
  }
  if (verb === "set_actor_collision_enabled") {
    return updateRuntimeActor(state, actorName, (actor) => ({ ...actor, collisionEnabled: booleanToken(parts[2], true) }));
  }
  if (verb === "set_actor_collision_box") {
    return updateRuntimeActor(state, actorName, (actor) => ({
      ...actor,
      collisionBox: {
        x: numberToken(parts[2], 0),
        y: numberToken(parts[3], 0),
        width: numberToken(parts[4], 0),
        height: numberToken(parts[5], 0)
      }
    }));
  }
  if (verb === "show_actor_gesture" || verb === "actor_effects") {
    return updateRuntimeActor(state, actorName, (actor) => ({
      ...actor,
      gesture: { name: parts[2] ?? verb, frames: numberToken(parts[3], 0) }
    }));
  }
  if (verb === "push_actor_away_from_player") {
    return updateRuntimeActor(state, actorName, (actor) => {
      const dx = actor.x >= (state.player?.x ?? actor.x) ? 1 : -1;
      const dy = actor.y >= (state.player?.y ?? actor.y) ? 1 : -1;
      const amount = numberToken(parts[2], 1);
      return { ...actor, x: actor.x + dx * amount, y: actor.y + dy * amount };
    });
  }
  return null;
}

function handleCameraCommand(state: PreviewRuntimeState, parts: string[]): PreviewRuntimeState | null {
  const verb = parts[0] ?? "noop";
  if (verb === "camera_set_position") {
    return { ...state, camera: { ...state.camera, x: numberToken(parts[1], state.camera.x), y: numberToken(parts[2], state.camera.y), followPlayer: false } };
  }
  if (verb === "camera_move") {
    return { ...state, camera: { ...state.camera, x: state.camera.x + numberToken(parts[1], 0), y: state.camera.y + numberToken(parts[2], 0), followPlayer: false } };
  }
  if (verb === "camera_set_bounds") {
    return {
      ...state,
      camera: {
        ...state.camera,
        bounds: {
          minX: numberToken(parts[1], 0),
          minY: numberToken(parts[2], 0),
          maxX: numberToken(parts[3], 0),
          maxY: numberToken(parts[4], 0)
        }
      }
    };
  }
  if (verb === "camera_follow_player") return { ...state, camera: { ...state.camera, followPlayer: true, lockedToPlayer: false } };
  if (verb === "camera_lock_player") return { ...state, camera: { ...state.camera, lockedToPlayer: true, followPlayer: true } };
  if (verb === "shake_screen") return { ...state, camera: { ...state.camera, shakeFrames: numberToken(parts[1], 0) } };
  if (verb === "set_camera_property") {
    return { ...state, camera: { ...state.camera, properties: { ...state.camera.properties, [parts[1] ?? "property"]: scalarToken(parts[2]) } } };
  }
  if (verb === "fade_in" || verb === "fade_out") {
    return { ...state, camera: { ...state.camera, fade: { mode: verb === "fade_in" ? "in" : "out", frames: numberToken(parts[1], 0) } } };
  }
  return null;
}

function handleVisualEffectCommand(state: PreviewRuntimeState, parts: string[]): PreviewRuntimeState | null {
  if ((parts[0] ?? "noop") !== "visual_effect") return null;
  const effect = (parts[1] ?? "clear").trim().toLowerCase();
  if (effect === "clear") return { ...state, visualEffect: null };
  const durationFrames = Math.max(1, Math.min(3600, numberToken(parts[3], 30)));
  return {
    ...state,
    visualEffect: {
      effect,
      layer: (parts[2] ?? "all").trim().toLowerCase(),
      durationFrames,
      remainingFrames: durationFrames,
      intensity: Math.max(0, Math.min(100, numberToken(parts[4], 50))),
      elapsedMs: 0
    }
  };
}

function handleHudInventoryCommand(state: PreviewRuntimeState, parts: string[]): PreviewRuntimeState | null {
  const verb = parts[0] ?? "noop";
  const key = parts[1] ?? "";
  if (verb === "set_stat") {
    return { ...state, stats: { ...state.stats, [key]: { value: numberToken(parts[2], 0), max: numberToken(parts[3], numberToken(parts[2], 0)) } } };
  }
  if (verb === "modify_stat") {
    const current = state.stats[key] ?? { value: 0, max: 0 };
    return { ...state, stats: { ...state.stats, [key]: { ...current, value: current.value + numberToken(parts[2], 0) } } };
  }
  if (verb === "show_stat_bar") {
    return {
      ...state,
      hud: {
        ...state.hud,
        statBars: {
          ...state.hud.statBars,
          [key]: { stat: key, x: numberToken(parts[2], 0), y: numberToken(parts[3], 0), width: numberToken(parts[4], 0), orientation: parts[5] ?? "horizontal" }
        }
      }
    };
  }
  if (verb === "show_hearts") {
    return { ...state, hud: { ...state.hud, hearts: { stat: key, x: numberToken(parts[2], 0), y: numberToken(parts[3], 0) } } };
  }
  if (verb === "show_number_hud") {
    return { ...state, hud: { ...state.hud, numbers: { ...state.hud.numbers, [key]: { variable: key, x: numberToken(parts[2], 0), y: numberToken(parts[3], 0), digits: numberToken(parts[4], 0) } } } };
  }
  if (verb === "start_game_clock") {
    return { ...state, hud: { ...state.hud, gameClock: { minutes: numberToken(parts[1], 0), frames: numberToken(parts[2], 0), mode: parts[3] ?? "hud", currentMinute: 0, elapsedFrames: 0 } } };
  }
  if (verb === "modify_wallet") {
    const current = state.wallet[key] ?? { value: 0, max: null };
    const max = parts[3] === undefined ? current.max : numberToken(parts[3], 0);
    const nextValue = current.value + numberToken(parts[2], 0);
    const clampedValue = max === null ? nextValue : Math.min(nextValue, max);
    return { ...state, wallet: { ...state.wallet, [key]: { value: clampedValue, max } } };
  }
  if (verb === "add_item") {
    const nextCount = (state.inventory[key] ?? 0) + numberToken(parts[2], 1);
    return { ...state, inventory: { ...state.inventory, [key]: Math.max(0, nextCount) } };
  }
  if (verb === "set_equipped_item") {
    const slot = parts[1] ?? "";
    const item = parts[2] ?? "";
    if (!slot || !item) return state;
    return { ...state, equippedItems: { ...state.equippedItems, [slot]: item } };
  }
  return null;
}

function handlePaletteCommand(state: PreviewRuntimeState, parts: string[]): PreviewRuntimeState | null {
  const verb = parts[0] ?? "noop";
  if (verb === "set_background_palette" || verb === "set_sprite_palette" || verb === "restore_colors") {
    return state;
  }
  return null;
}

function previewRuntimeSaveCapability(state: PreviewRuntimeState): ProjectRuntimeCapabilityManifest["capabilities"][number] | null {
  return state.runtimeCapabilities.capabilities.find((capability) => capability.id === "save") ?? null;
}

function previewRuntimeSaveSlotCount(state: PreviewRuntimeState): number {
  const capability = previewRuntimeSaveCapability(state);
  const configured = Number(capability?.settings.slot_count);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 16;
}

function previewRuntimeSaveSlotAvailable(state: PreviewRuntimeState, slot: number): boolean {
  const capability = previewRuntimeSaveCapability(state);
  return capability?.enabled === true && slot >= 0 && slot < previewRuntimeSaveSlotCount(state);
}

function previewRuntimeSaveRejection(
  state: PreviewRuntimeState,
  eventName: string,
  command: string,
  slot: number
): PreviewRuntimeState {
  const capability = previewRuntimeSaveCapability(state);
  const detail = capability?.enabled !== true
    ? "Capability save não está habilitada no projeto."
    : `Save slot ${slot} está fora do limite configurado (${previewRuntimeSaveSlotCount(state)}).`;
  return updateDebug(appendLog(state, eventName, command, "skipped", detail));
}

function nextPreviewRuntimeSaveSequence(saveSlots: Record<number, PreviewRuntimeSaveSnapshot>): number {
  let latest = 0;
  Object.values(saveSlots).forEach((snapshot) => {
    if (typeof snapshot.sequence === "number" && Number.isFinite(snapshot.sequence)) {
      latest = Math.max(latest, Math.floor(snapshot.sequence));
    }
  });
  return latest >= 0xFFFFFFFF ? 1 : latest + 1;
}

function runtimeSaveSnapshot(state: PreviewRuntimeState, sequence: number): PreviewRuntimeSaveSnapshot {
  return {
    schema: 4,
    sequence,
    timestampFrames: state.previewFrame,
    title: state.currentRoom?.name ?? "",
    runtime: state.runtimeProfile.sceneType,
    roomName: state.currentRoom?.name ?? "",
    player: state.player ? { x: state.player.x, y: state.player.y } : null,
    camera: structuredClone(state.camera),
    variables: { ...state.variables },
    inventory: { ...state.inventory },
    wallet: structuredClone(state.wallet),
    flags: { ...state.flags },
    equippedItems: { ...state.equippedItems },
    dialogueLocale: state.dialogueLocale
  };
}

function saveSlotFromCommand(parts: string[]): number {
  const slotToken = parts.length >= 2 ? parts[1] : parts[0];
  return Math.max(0, Math.min(255, numberToken(slotToken, 0)));
}

function appendRecognizedScript(
  state: PreviewRuntimeState,
  eventName: string,
  command: string,
  verb: string,
  operand: string
): PreviewRuntimeState {
  const parts = commandTokens(command);
  if (verb === "advance_campaign") {
    return advancePreviewCampaign(state, eventName, command);
  }
  const linkCommand = parseLinkCableCommand(command);
  if (linkCommand) {
    if (linkCommand.kind === "rumble_on" || linkCommand.kind === "rumble_on_for" || linkCommand.kind === "rumble_off") {
      const linkCable = applyLinkCablePreviewCommand(state.linkCable ?? defaultLinkCablePreviewState(), command);
      const nextState: PreviewRuntimeState = { ...state, linkCable };
      return updateDebug(appendLog(
        nextState,
        eventName,
        command,
        "script",
        `rumble:${linkCable.rumble.active ? "on" : "off"}`
      ));
    }
    const universalLinkCapability = state.runtimeCapabilities.capabilities.find((capability) => capability.id === "link");
    if (!universalLinkCapability?.enabled) {
      return updateDebug(appendLog(
        state,
        eventName,
        command,
        "skipped",
        "Capability link universal (link_multiplayer da cena) não está habilitada no projeto."
      ));
    }
    const rawRuntimeConfig: unknown = state.currentRoom?.runtime.config;
    const runtimeConfig = isRecord(rawRuntimeConfig) ? rawRuntimeConfig : {};
    const capabilityManifest = resolveSceneCapabilityManifest(
      state.currentRoom?.sceneType ?? "topdown",
      Object.hasOwn(runtimeConfig, "modules") ? runtimeConfig.modules : undefined,
      undefined,
      Object.hasOwn(runtimeConfig, "capabilities") ? runtimeConfig.capabilities : undefined
    );
    const linkCapability = capabilityManifest.capabilities.find((capability) => capability.id === "link_multiplayer");
    if (!linkCapability?.status.enabled) {
      return updateDebug(appendLog(
        state,
        eventName,
        command,
        "skipped",
        "Capability link_multiplayer não está habilitada nesta cena."
      ));
    }
    const linkCable = applyLinkCablePreviewCommand(state.linkCable ?? defaultLinkCablePreviewState(), command);
    let nextState: PreviewRuntimeState = { ...state, linkCable };
    if (linkCommand.kind === "transfer" && linkCable.transferOk && linkCable.lastReceived !== null) {
      nextState = setRuntimeVariable(nextState, linkCommand.variable, linkCable.lastReceived);
    }
    if (linkCommand.kind === "mp4_read" && linkCable.mp4.syncOk) {
      nextState = setRuntimeVariable(nextState, linkCommand.varPlayer, 0);
      nextState = setRuntimeVariable(nextState, linkCommand.varCount, linkCable.mp4.players);
      nextState = setRuntimeVariable(nextState, linkCommand.varBase, linkCable.mp4.received[0] ?? 0);
    }
    nextState = updateDebug(appendLog(
      nextState,
      eventName,
      command,
      "script",
      `${linkCable.role}:${linkCable.status}${linkCable.transferOk ? `:${linkCable.lastReceived}` : ""}`
    ));
    if ((linkCommand.kind === "host" || linkCommand.kind === "join") && linkCommand.callbackEvent) {
      return runEvent(nextState, linkCommand.callbackEvent);
    }
    return nextState;
  }
  if (verb === "mute_audio_channel" || verb === "set_audio_volume" || verb === "fade_audio_volume") {
    const selected = previewAudioBus(parts[1]);
    const buses = selected === "all" ? previewAudioBuses : [selected];
    const audioMix = structuredClone(state.audioMix);
    if (verb === "mute_audio_channel") {
      const muted = booleanToken(parts[2], true);
      buses.forEach((bus) => { audioMix.muted[bus] = muted; });
      return updateDebug(appendLog({
        ...state,
        audioMix,
        ...(muted && (selected === "music" || selected === "all") ? { activeMusic: null, activeMusicAsset: null } : {}),
        ...(muted && (selected === "sfx" || selected === "all") ? { activeSfx: null, activeSfxAsset: null } : {})
      }, eventName, command, "audio", `${selected}:${muted}`));
    }
    const volume = previewHardwareAudioVolume(parts[2]);
    if (verb === "set_audio_volume") {
      buses.forEach((bus) => {
        audioMix.volumes[bus] = volume;
        audioMix.fades[bus] = null;
      });
      return updateDebug(appendLog({ ...state, audioMix }, eventName, command, "audio", `${selected}:${volume}`));
    }
    const frames = Math.max(0, Math.min(3600, numberToken(parts[3], 30)));
    buses.forEach((bus) => {
      audioMix.fades[bus] = frames === 0 ? null : {
        start: audioMix.volumes[bus],
        target: volume,
        totalFrames: frames,
        remainingFrames: frames,
        elapsedMs: 0
      };
      if (frames === 0) audioMix.volumes[bus] = volume;
    });
    return updateDebug(appendLog({ ...state, audioMix }, eventName, command, "audio", `${selected}:${volume}/${frames}`));
  }
  if (verb === "save_game") {
    const slot = saveSlotFromCommand(parts);
    if (!previewRuntimeSaveSlotAvailable(state, slot)) {
      return previewRuntimeSaveRejection(state, eventName, command, slot);
    }
    return updateDebug(appendLog({
      ...state,
      saveSlots: {
        ...state.saveSlots,
        [slot]: runtimeSaveSnapshot(state, nextPreviewRuntimeSaveSequence(state.saveSlots))
      }
    }, eventName, command, "script", `slot=${slot}`));
  }

  if (verb === "load_game") {
    const slot = saveSlotFromCommand(parts);
    if (!previewRuntimeSaveSlotAvailable(state, slot)) {
      return previewRuntimeSaveRejection(state, eventName, command, slot);
    }
    const snapshot = state.saveSlots[slot];
    if (!snapshot) {
      return updateDebug(appendLog(state, eventName, command, "skipped", `Save slot ${slot} vazio.`));
    }
    const savedRoom = roomByName(state.rooms, snapshot.roomName);
    if (!savedRoom || runtimeProfileForRoom(savedRoom).sceneType !== snapshot.runtime) {
      return updateDebug(appendLog(state, eventName, command, "skipped", `Save slot ${slot} possui runtime ou room invalido.`));
    }
    const restoredRoomState = setCurrentRoom(state, savedRoom);
    return updateDebug(appendLog({
      ...restoredRoomState,
      player: restoredRoomState.player && snapshot.player
        ? { ...restoredRoomState.player, x: snapshot.player.x, y: snapshot.player.y }
        : restoredRoomState.player,
      camera: structuredClone(snapshot.camera),
      activeCameraZoneID: null,
      variables: { ...snapshot.variables },
      inventory: { ...snapshot.inventory },
      wallet: structuredClone(snapshot.wallet),
      flags: { ...snapshot.flags },
      equippedItems: { ...snapshot.equippedItems },
      dialogueLocale: snapshot.dialogueLocale ?? state.dialogueLocale
    }, eventName, command, "script", `slot=${slot}`));
  }

  if (verb === "remove_save_game") {
    const slot = saveSlotFromCommand(parts);
    if (!previewRuntimeSaveSlotAvailable(state, slot)) {
      return previewRuntimeSaveRejection(state, eventName, command, slot);
    }
    const nextSlots = { ...state.saveSlots };
    delete nextSlots[slot];
    return updateDebug(appendLog({
      ...state,
      saveSlots: nextSlots
    }, eventName, command, "script", `slot=${slot}`));
  }

  if (verb === "stop_music") {
    return updateDebug(appendLog({
      ...state,
      activeMusic: null,
      activeMusicAsset: null
    }, eventName, command, "audio", null));
  }

  if (verb === "close_dialogue") {
    return updateDebug(appendLog({
      ...state,
      activeDialogue: null
    }, eventName, command, "dialogue", null));
  }

  if (verb === "set_text_sfx") {
    const activeSfx = operand || null;
    return updateDebug(appendLog({
      ...state,
      activeSfx,
      activeSfxAsset: assetByName(state.project, activeSfx)
    }, eventName, command, "audio", activeSfx));
  }

  if (verb === "show_dialogue_speaker") {
    const dialogueName = operand.split(/\s+/).filter(Boolean)[0] ?? "";
    const dialogue = dialogueName ? dialogueByKey(state.project, dialogueName, "dialogue", state.dialogueLocale) : null;
    return updateDebug(appendLog({
      ...state,
      activeDialogue: dialogue ?? state.activeDialogue
    }, eventName, command, dialogue ? "dialogue" : "script", dialogue?.key ?? verb));
  }

  if (verb === "set_language") {
    const locale = operand as ProjectLocale;
    const localization = deriveProjectLocalization(state.project);
    if (!localization.enabledLocales.includes(locale)) {
      return runtimeScriptLog(state, eventName, command, `idioma-invalido:${operand}`);
    }
    return runtimeScriptLog({ ...state, dialogueLocale: locale }, eventName, command, locale);
  }

  const handledState = handleVariableCommand(state, parts) ??
    handleFlagCommand(state, parts) ??
    handleActorCommand(state, parts) ??
    handleCameraCommand(state, parts) ??
    handleVisualEffectCommand(state, parts) ??
    handleHudInventoryCommand(state, parts) ??
    handlePaletteCommand(state, parts);
  return runtimeScriptLog(handledState ?? state, eventName, command, operand || verb);
}

const platformCallbackNames = ["fallstart", "fallend", "groundstart", "groundend", "jumpstart", "jumpend", "dashstart", "dashready", "dashend", "ladderstart", "ladderend", "wallstart", "wallend", "knockbackstart", "knockbackend", "blankstart", "blankend", "runstart", "runend", "floatstart", "floatend"];
const platformStateCallbacks: Record<string, [number, number]> = {
  fall: [0, 1], ground: [2, 3], jump: [4, 5], dash: [6, 8], ladder: [9, 10],
  wall: [11, 12], knockback: [13, 14], blank: [15, 16], run: [17, 18], float: [19, 20]
};

function previewCallbackIndex(name: string, adventure: boolean): number {
  const normalized = name.toLowerCase().replaceAll("_", "");
  if (adventure) {
    if (["oninteract", "interact", "interaction"].includes(normalized)) return 0;
    if (["onroomenter", "roomenter", "enter", "onenter"].includes(normalized)) return 1;
    if (["onroomexit", "roomexit", "exit", "onexit"].includes(normalized)) return 2;
    return -1;
  }
  const aliases: Record<string, string> = {
    onland: "groundstart", land: "groundstart", landed: "groundstart",
    onleaveground: "groundend", leaveground: "groundend", leftground: "groundend",
    onjump: "jumpstart", jump: "jumpstart"
  };
  return platformCallbackNames.indexOf(aliases[normalized] ?? normalized);
}

function queuePreviewScript(state: PreviewRuntimeState, script: string | PreviewRuntimeQueuedScript): PreviewRuntimeState {
  return state.scriptQueue.length < 32 ? { ...state, scriptQueue: [...state.scriptQueue, script] }
    : appendUnsupported(state, typeof script === "string" ? script : script.eventName, "call_event", "Fila do Quick Preview cheia (32 eventos).");
}

function queuePreviewCallback(state: PreviewRuntimeState, eventName: string | null | undefined, triggerRoomEnter = true): PreviewRuntimeState {
  if (!eventName) return state;
  return queuePreviewScript(state, triggerRoomEnter ? eventName : { eventName, triggerRoomEnter });
}

function transitionPreviewPlatformerState(state: PreviewRuntimeState, next: string): PreviewRuntimeState {
  if (state.platformerState === next) return state;
  const end = platformStateCallbacks[state.platformerState]?.[1];
  const start = platformStateCallbacks[next]?.[0];
  state = queuePreviewCallback(state, end === undefined ? undefined : state.platformCallbacks[end]);
  return queuePreviewCallback({ ...state, platformerState: next }, start === undefined ? undefined : state.platformCallbacks[start]);
}

function consumePreviewPlatformerState(state: PreviewRuntimeState): PreviewRuntimeState {
  const next = state.platformerRequestedState;
  if (!next) return state;
  state = { ...state, platformerRequestedState: null };
  if (state.currentRoom?.sceneType !== "platformer" || !state.player) {
    return appendUnsupported(state, "platformer", `set_platform_state ${next}`, "Estado de Plataforma requer um jogador na cena.");
  }
  const room = { ...state.currentRoom, platformerPreviewEnabled: true };
  const config = platformerSceneConfigFromRuntime(room.runtime);
  const source = state.platformerPhysics ?? platformerPreviewBodyForRoom(state.project, room, state.player);
  if (!source || !config) return appendUnsupported(state, "platformer", `set_platform_state ${next}`, "Física de Plataforma indisponível.");
  const body = { ...source, onLadder: next === "blank" ? source.onLadder : next === "ladder" };
  if (["fall", "jump", "float", "ladder"].includes(next)) body.onGround = false;
  if (["ground", "run"].includes(next)) body.onGround = true;
  if (["ground", "run", "float", "ladder", "blank", "jump"].includes(next)) {
    body.velocityY = next === "jump" ? -config.jumpSpeed : 0;
    body.remainderY = 0;
  }
  if (["ladder", "blank"].includes(next)) { body.velocityX = 0; body.remainderX = 0; }
  return transitionPreviewPlatformerState({ ...state, currentRoom: room, platformerPhysics: body,
    platformerPlayerActive: next !== "blank",
    platformerInputRequests: next === "blank" ? { jump: false, dash: false } : state.platformerInputRequests }, next);
}

function runEvent(state: PreviewRuntimeState, eventName: string | null, callStack: string[] = [], triggerRoomEnter = true, commandsOverride?: string[]): PreviewRuntimeState {
  if (!eventName || isPreviewDebuggerBlocking(state)) return updateDebug(state);
  if (state.scriptWaitFrames > 0 && callStack.length === 0) {
    return queuePreviewScript(state, { eventName, triggerRoomEnter, commands: commandsOverride });
  }
  const eventRecord = eventRecords(state.project).get(eventName);
  if (!eventRecord && !commandsOverride) {
    return updateDebug(appendUnsupported(state, eventName, "noop", "Evento nao encontrado.", `Evento nao encontrado: ${eventName}.`));
  }
  const aliases = eventRecord?.aliases ?? [];
  const resolvedEventName = eventRecord?.name ?? eventName;
  const nextCallStack = Array.from(new Set([...callStack, eventName, ...aliases]));
  const commands = commandsOverride ?? eventCommands(eventRecord!.event, state.project);
  const frame: PreviewRuntimeScriptFrame = {
    eventName,
    resolvedEventName,
    commands,
    commandIndex: 1,
    callStack: nextCallStack,
    skipNextReason: null,
    conditionalBranch: null,
    conditionalScopes: [],
    triggerRoomEnter,
    stepBudget: state.nativeEvents.executingSegment!==null ? 1 : undefined
  };
  const pauseReason = debuggerPauseReasonForCommand(state.debugger, resolvedEventName, frame.commandIndex);
  if (pauseReason) {
    return pausePreviewDebugger(state, frame, pauseReason);
  }
  return runScriptFrame(state, frame);
}

function runScriptFrame(state: PreviewRuntimeState, frame: PreviewRuntimeScriptFrame): PreviewRuntimeState {
  return consumePreviewPlatformerState(runScriptFrameCommands(state, frame));
}

function runScriptFrameCommands(state: PreviewRuntimeState, frame: PreviewRuntimeScriptFrame): PreviewRuntimeState {
  const {
    callStack: nextCallStack,
    commands,
    eventName,
    resolvedEventName
  } = frame;
  let currentState = state;
  let skipNextReason = frame.skipNextReason;
  let conditionalBranch = frame.conditionalBranch;
  let conditionalScopes = frame.conditionalScopes;

  const scriptFrameBase = (): PreviewRuntimeScriptFrame => ({
    eventName,
    resolvedEventName,
    commands,
    commandIndex: 0,
    callStack: nextCallStack,
    skipNextReason,
    conditionalBranch,
    conditionalScopes,
    triggerRoomEnter: frame.triggerRoomEnter,
    stepBudget: frame.stepBudget
  });

  const pauseAfterStepIfNeeded = (nextState: PreviewRuntimeState, commandIndex0Based: number): PreviewRuntimeState | null => {
    return maybePauseAfterScriptStep(
      nextState,
      { ...scriptFrameBase(), commandIndex: commandIndex0Based + 1 },
      commandIndex0Based,
      skipNextReason,
      conditionalBranch,
      conditionalScopes
    );
  };

  const suspendCaller = (nextState: PreviewRuntimeState, continuation: PreviewRuntimeScriptFrame, outerCount: number): PreviewRuntimeState => {
    // A resumed child may yield again; insert its caller before the older ancestors.
    const insertionIndex = nextState.scriptContinuations.length - outerCount;
    return {
      ...nextState,
      scriptContinuations: [
        ...nextState.scriptContinuations.slice(0, insertionIndex), continuation,
        ...nextState.scriptContinuations.slice(insertionIndex)
      ]
    };
  };

  for (let commandIndex = frame.commandIndex - 1; commandIndex < commands.length; commandIndex += 1) {
    doCommand: {
    const commandLine = commandIndex + 1;
    const pauseReason = currentState.debugger.stepPending || currentState.debugger.resumePending
      ? null
      : debuggerPauseReasonForCommand(currentState.debugger, resolvedEventName, commandLine);
    if (currentState.debugger.resumePending) {
      currentState = {
        ...currentState,
        debugger: {
          ...currentState.debugger,
          resumePending: false
        }
      };
    }
    if (pauseReason) {
      return pausePreviewDebugger(currentState, {
        eventName,
        resolvedEventName,
        commands,
        commandIndex: commandLine,
        callStack: nextCallStack,
        skipNextReason,
        conditionalBranch,
        conditionalScopes
      }, pauseReason);
    }

    const rawCommand = commands[commandIndex] ?? "";
    if (skipNextReason) {
      currentState = updateDebug(appendLog(currentState, resolvedEventName, rawCommand, "skipped", skipNextReason));
      skipNextReason = null;
      break doCommand;
    }

    const resolved = resolvePreviewCommand(currentState, rawCommand);
    const command = resolved.command;
    const verb = resolved.verb;
    const parts = resolved.parts;
    const operand = resolved.operand;

    if (verb === "data_table_lookup") {
      currentState = applyDataTableLookupPreview(currentState, resolvedEventName, command, parts);
      break doCommand;
    }

    if (isPluginPreviewVerb(currentState.pluginRegistry, rawCommand.trim().split(/\s+/).filter(Boolean)[0] ?? "") && command === rawCommand) {
      currentState = appendRecognizedScript(currentState, resolvedEventName, rawCommand, verb, operand);
      break doCommand;
    }

    if (verb === "condition_end") {
      if (conditionalScopes.length === 0) {
        currentState = appendLog(currentState, resolvedEventName, command, "noop", "condition_end sem bloco condicional ativo.");
      } else {
        conditionalScopes = conditionalScopes.slice(0, -1);
        currentState = runtimeScriptLog(currentState, resolvedEventName, command, "fim da condição");
      }
      break doCommand;
    }

    if (verb === "else") {
      const structuredScope = conditionalScopes.at(-1);
      if (structuredScope) {
        if (structuredScope.mode === "then") {
          conditionalScopes = [...conditionalScopes.slice(0, -1), { mode: "skip_else" }];
        } else if (structuredScope.mode === "seek_else") {
          conditionalScopes = [...conditionalScopes.slice(0, -1), { mode: "then" }];
        } else {
          currentState = appendLog(currentState, resolvedEventName, command, "noop", "Marcador else fora do ramo ativo.");
        }
        break doCommand;
      }
      if (conditionalBranch === "then_until_else") {
        conditionalBranch = "skip_else";
        break doCommand;
      }
      if (conditionalBranch === "seek_else") {
        conditionalBranch = null;
        break doCommand;
      }
      currentState = appendLog(currentState, resolvedEventName, command, "noop", "Marcador else sem bloco condicional ativo.");
      break doCommand;
    }

    const structuredScope = conditionalScopes.at(-1);
    if (structuredScope?.mode === "seek_else") {
      currentState = updateDebug(appendLog(currentState, resolvedEventName, command, "skipped", "Condicao falsa; aguardando else."));
      break doCommand;
    }

    if (structuredScope?.mode === "skip_else" || structuredScope?.mode === "skip_to_end") {
      currentState = updateDebug(appendLog(currentState, resolvedEventName, command, "skipped", "Ramo condicional ignorado."));
      break doCommand;
    }

    if (conditionalBranch === "seek_else") {
      currentState = updateDebug(appendLog(currentState, resolvedEventName, command, "skipped", "Condicao falsa; aguardando else."));
      break doCommand;
    }

    if (conditionalBranch === "skip_else") {
      currentState = updateDebug(appendLog(currentState, resolvedEventName, command, "skipped", "Ramo else ignorado apos condicao verdadeira."));
      break doCommand;
    }

    const support = eventCommandSupport(verb);
    if (support.status === "pending" || support.status === "not-applicable") {
      currentState = appendUnsupported(currentState, resolvedEventName, command, eventCommandReview(verb)?.message ?? support.reason ?? "Bloco indisponível.");
      break doCommand;
    }
    if(integratedNativeSimulationVerbs.has(verb)) {
      try {
        const issue=eventCommandIntegrationIssue(command,currentState.currentRoom?.sceneType);
        if(issue) throw new Error(issue);
        const result=applyIntegratedNativeSimulation(currentState,commandTokens(command));
        currentState=runtimeScriptLog(result,resolvedEventName,command,verb);
        if(result.nativeEvents.modal) return {...currentState,scriptContinuations:[{...scriptFrameBase(),commandIndex:commandIndex+2},...currentState.scriptContinuations]};
      } catch(error) { currentState=appendUnsupported(currentState,resolvedEventName,command,error instanceof Error ? error.message : "Evento inválido."); }
      break doCommand;
    }
    if (verb === "start_game_clock" || verb === "advance_time") {
      const issue = eventCommandIntegrationIssue(command, currentState.currentRoom?.sceneType);
      if (issue) { currentState = appendUnsupported(currentState, resolvedEventName, command, issue); break doCommand; }
      const tokens = commandTokens(command);
      const previous = currentState.hud.gameClock ?? { minutes: 0, frames: 0, mode: "hidden", currentMinute: 0, elapsedFrames: 0 };
      const gameClock = verb === "start_game_clock"
        ? { minutes: Number(tokens[1]), frames: Number(tokens[2]), mode: tokens[3]!, currentMinute: 0, elapsedFrames: 0 }
        : { ...previous, currentMinute: ((previous.currentMinute + Number(tokens[1])) % 1440 + 1440) % 1440 };
      currentState = runtimeScriptLog({ ...currentState, hud: { ...currentState.hud, gameClock } }, resolvedEventName, command, "relógio do jogo atualizado");
      break doCommand;
    }
    if (isLutaEventVerb(verb)) {
      const issue = eventCommandIntegrationIssue(command, currentState.currentRoom?.sceneType);
      if (issue || !currentState.lutaCombat) {
        currentState = appendUnsupported(currentState, resolvedEventName, command, issue ?? "Partida de Luta ausente.");
        break doCommand;
      }
      const control = parseLutaEventCommand(command);
      if (verb === "luta_start_match") {
        const room = currentState.rooms.find(room => room.name === control.target && room.sceneType === "luta");
        if (!room) { currentState = appendUnsupported(currentState, resolvedEventName, command, "Cena de Luta inexistente."); break doCommand; }
        currentState = setCurrentRoom(currentState, room, false);
      } else {
        let side: 0 | 1 = 0;
        if (!["luta_end_match", "luta_set_round_timer", "luta_set_rounds_to_win"].includes(verb)) {
          const target = control.target ?? "";
          const actor = projectArray(currentState.project, "actors").find(actor => actor.name === target || actor.id === target);
          const battle = isRecord(actor?.battle) ? actor.battle : null;
          if (["player2", "p2"].includes(target) || battle?.side === "player2") side = 1;
          else if (!["player1", "p1", "Player"].includes(target) && battle?.side !== "player1") {
            currentState = appendUnsupported(currentState, resolvedEventName, command, "Participante de Luta inexistente."); break doCommand;
          }
        }
        currentState = { ...currentState, lutaCombat: applyLutaCombatEvent(currentState.lutaCombat!, control, side) };
      }
      currentState = runtimeScriptLog(currentState, resolvedEventName, command, "controle da partida aplicado");
      break doCommand;
    }
    const integrationVerbs = ["store_engine_field", "store_save_variable", "idle", "run_audio_routine", "pause_scene_type", "resume_scene_type",
      "attach_adventure_callback", "remove_adventure_callback", "remove_platform_callback", "set_platform_state"];
    if (integrationVerbs.includes(verb)) {
      const issue = eventCommandIntegrationIssue(command, currentState.currentRoom?.sceneType);
      if (issue) {
        currentState = appendUnsupported(currentState, resolvedEventName, command, issue);
        break doCommand;
      }
    }
    if (verb === "store_save_variable" && !previewRuntimeSaveSlotAvailable(currentState, numberToken(parts[0], 0))) {
      currentState = appendUnsupported(currentState, resolvedEventName, command, "Slot de save indisponível na configuração do projeto.");
      break doCommand;
    }

    if (["attach_adventure_callback", "remove_adventure_callback", "attach_platform_callback", "remove_platform_callback"].includes(verb)) {
      const adventure = verb.includes("adventure");
      const index = previewCallbackIndex(parts[0] ?? "", adventure);
      const target = parts[1] ?? "";
      if (index < 0 || (!adventure && currentState.currentRoom?.sceneType !== "platformer")) {
        currentState = appendUnsupported(currentState, resolvedEventName, command, "Callback sem consumidor nesta cena ou nome desconhecido.");
        break doCommand;
      }
      if (verb.startsWith("attach") && !eventRecords(currentState.project).has(target)) {
        currentState = appendUnsupported(currentState, resolvedEventName, command, `Evento do callback não encontrado: ${target}.`);
        break doCommand;
      }
      const key = adventure ? "adventureCallbacks" : "platformCallbacks";
      const bindings = { ...currentState[key] };
      if (verb.startsWith("attach")) bindings[index] = target;
      else delete bindings[index];
      currentState = runtimeScriptLog({ ...currentState, [key]: bindings }, resolvedEventName, command, parts[0]!);
      break doCommand;
    }

    if (verb === "set_platform_state") {
      currentState = runtimeScriptLog({ ...currentState, platformerRequestedState: parts[0]! }, resolvedEventName, command, parts[0]!);
      break doCommand;
    }

    if (verb === "idle" || verb === "wait") {
      const frames = Math.max(0, Math.min(32767, numberToken(parts[0], 0)));
      currentState = runtimeScriptLog(currentState, resolvedEventName, command, `${frames} quadros`);
      if (frames > 0) {
        return updateDebug({
          ...currentState, scriptWaitFrames: frames,
          scriptContinuations: [{ ...scriptFrameBase(), commandIndex: commandIndex + 2 }, ...currentState.scriptContinuations]
        });
      }
      break doCommand;
    }

    if (verb === "pause_scene_type" || verb === "resume_scene_type") {
      currentState = runtimeScriptLog({
        ...currentState,
        pausedSceneTypes: { ...currentState.pausedSceneTypes, [parts[0]!]: verb === "pause_scene_type" },
        ...(parts[0] === "platformer" && verb === "pause_scene_type" ? { platformerInputRequests: { jump: false, dash: false } } : {})
      }, resolvedEventName, command, parts[0]!);
      break doCommand;
    }

    if (verb === "run_audio_routine") {
      const audio = projectArray(currentState.project, "audioItems").find(item => item.name === parts[0] || item.exportID === parts[0]);
      try {
        const pack = audio ? buildAssetcAudioPackGeneration({ ...currentState.project, audioItems: [audio] }) : null;
        if (!audio || !pack?.document.tracker.length) throw new Error("Rotina requer uma música tracker válida do projeto.");
        const source = audioSourceAsset(currentState.project, audio);
        currentState = updateDebug(appendLog({
          ...currentState, activeMusic: stringField(audio.name, parts[0]!),
          activeMusicAsset: assetByReference(currentState.project, nullableString(source?.name))
        }, resolvedEventName, command, "audio", stringField(audio.name, parts[0]!)));
      } catch (error) {
        currentState = appendUnsupported(currentState, resolvedEventName, command, error instanceof Error ? error.message : "Rotina de áudio inválida.");
      }
      break doCommand;
    }

    if (verb === "rate_limit_end") {
      currentState = runtimeScriptLog(currentState, resolvedEventName, command, "fim do intervalo");
      break doCommand;
    }

    if (verb === "rate_limit") {
      const frames = Math.max(1, numberToken(parts[0], 1));
      const slot = Math.max(0, Math.min(31, numberToken(parts[1], commandIndex % 32)));
      const shouldRun = currentState.previewFrame % frames === 0;
      currentState = runtimeScriptLog(currentState, resolvedEventName, command, shouldRun ? `slot ${slot} executado` : `slot ${slot} aguardando`);
      if (!shouldRun) {
        const endIndex = structuredRateLimitEnd(commands, commandIndex);
        if (endIndex === null) {
          skipNextReason = `Intervalo de ${frames} quadros ainda não atingido.`;
        } else {
          commandIndex = endIndex;
        }
      }
      break doCommand;
    }

    if (!verb || verb === "noop") {
      currentState = appendLog(currentState, resolvedEventName, command, "noop", null);
      break doCommand;
    }

    if (verb === "stop_event") {
      currentState = appendLog(currentState, resolvedEventName, command, "script", "Evento interrompido.");
      break;
    }

    if (verb === "play_music") {
      const activeMusic = operand || null;
      const activeMusicAsset = assetByName(currentState.project, activeMusic);
      const nextState = appendLog({ ...currentState, activeMusic, activeMusicAsset }, resolvedEventName, command, "audio", activeMusic);
      currentState = updateDebug(activeMusic && !activeMusicAsset
        ? appendDiagnostic(nextState, `Musica nao encontrada nos assets: ${activeMusic}.`)
        : nextState);
      break doCommand;
    }

    if (verb === "play_sfx") {
      const activeSfx = operand || null;
      const activeSfxAsset = assetByName(currentState.project, activeSfx);
      const hasPlaybackOptions = parts[1] !== undefined || parts[2] !== undefined;
      const audioMix = hasPlaybackOptions
        ? {
            ...currentState.audioMix,
            lastPcmSfx: {
              volume: previewHardwareAudioVolume(parts[1]),
              priority: Math.max(0, Math.min(255, numberToken(parts[2], 8)))
            }
          }
        : currentState.audioMix;
      const nextState = appendLog({ ...currentState, activeSfx, activeSfxAsset, audioMix }, resolvedEventName, command, "audio", activeSfx);
      currentState = updateDebug(activeSfx && !activeSfxAsset
        ? appendDiagnostic(nextState, `SFX nao encontrado nos assets: ${activeSfx}.`)
        : nextState);
      break doCommand;
    }

    if (verb === "show_dialogue" || verb === "show_choice") {
      const dialogueName = parts[0] ?? "";
      const dialogue = dialogueName ? dialogueByKey(currentState.project, dialogueName, verb === "show_choice" ? "choice" : "dialogue", currentState.dialogueLocale) : null;
      if (dialogueName && !dialogue) {
        currentState = updateDebug(appendUnsupported(currentState, resolvedEventName, command, "Dialogo nao encontrado.", `Dialogo nao encontrado: ${dialogueName}.`));
        break doCommand;
      }
      currentState = updateDebug(appendLog({
        ...currentState,
        activeDialogue: dialogue,
        activeSfx: dialogue?.textSound || currentState.activeSfx,
        activeSfxAsset: dialogue?.textSound ? dialogue.textSoundAsset : currentState.activeSfxAsset
      }, resolvedEventName, command, "dialogue", dialogue?.key ?? null));
      break doCommand;
    }

    if (verb === "open_text_input") {
      const variableName = parts[0] ?? "";
      const maxLength = numberToken(parts[1], 8);
      currentState = updateDebug(appendLog(
        openPreviewTextInput(currentState, variableName, maxLength),
        resolvedEventName,
        command,
        "script",
        variableName ? `${variableName}:${Math.max(1, maxLength)}` : null
      ));
      break doCommand;
    }

    if (verb === "change_scene") {
      const roomTarget = parts[0] ?? "";
      const nextRoom = roomTarget ? roomByName(currentState.rooms, roomTarget) : null;
      if (!nextRoom) {
        currentState = updateDebug(appendUnsupported(currentState, resolvedEventName, command, "Room nao encontrada.", `Room nao encontrada: ${roomTarget || "-"}.`));
        break doCommand;
      }
      const entered = setCurrentRoom({ ...currentState, activeDialogue: null }, nextRoom, frame.triggerRoomEnter);
      const hasExplicitPosition = parts[1] !== undefined && parts[2] !== undefined;
      const arrival = !hasExplicitPosition && currentState.currentRoom
        ? campaignConnectionArrival(currentState, currentState.currentRoom, nextRoom) : null;
      const direction = ["up", "down", "left", "right"].includes((parts[3] ?? "").toLowerCase())
        ? parts[3]!.toLowerCase()
        : arrival?.direction ?? null;
      const positioned = hasExplicitPosition || arrival || direction
        ? updateRuntimeActor(entered, "player", (actor) => ({
          ...actor,
          ...(hasExplicitPosition ? {
            x: numberToken(parts[1], actor.x),
            y: numberToken(parts[2], actor.y)
          } : arrival ? { x: arrival.x, y: arrival.y } : {}),
          ...(direction ? { direction } : {})
        }))
        : entered;
      currentState = appendLog(positioned, resolvedEventName, command, "room", nextRoom.name);
      break doCommand;
    }

    if (verb === "change_scene_by_variable") {
      const tableID = parts[0] ?? "";
      const table = findSceneRouteTable(currentState.project, tableID);
      const destination = table ? resolveSceneRoute(table, variableNumber(currentState, table.variable)) : null;
      const nextRoom = destination ? roomByName(currentState.rooms, destination.scene) : null;
      if (!table || !destination || !nextRoom) {
        const reason = !table
          ? `Tabela de rotas nao encontrada: ${tableID || "-"}.`
          : !destination
            ? `Tabela de rotas sem destino para ${table.variable}.`
            : `Room nao encontrada: ${destination.scene}.`;
        currentState = updateDebug(appendUnsupported(currentState, resolvedEventName, command, "Rota de cena invalida.", reason));
        break doCommand;
      }
      let nextState = setCurrentRoom({ ...currentState, activeDialogue: null }, nextRoom, frame.triggerRoomEnter);
      nextState = updateRuntimeActor(nextState, "player", (actor) => ({
        ...actor,
        x: destination.x,
        y: destination.y,
        direction: destination.direction
      }));
      nextState = {
        ...nextState,
        camera: destination.fadeFrames > 0
          ? { ...nextState.camera, fade: { mode: "out", frames: destination.fadeFrames } }
          : nextState.camera
      };
      currentState = appendLog(nextState, resolvedEventName, command, "room", nextRoom.name);
      break doCommand;
    }

    if (verb === "call_event") {
      const eventTarget = parts[0] ?? "";
      if (!eventTarget) {
        currentState = updateDebug(appendUnsupported(currentState, resolvedEventName, command, "Evento nao informado."));
        break doCommand;
      }
      if (nextCallStack.includes(eventTarget)) {
        currentState = updateDebug(appendUnsupported(currentState, resolvedEventName, command, "Chamada recursiva bloqueada."));
        break doCommand;
      }
      const outerCount = currentState.scriptContinuations.length;
      currentState = runEvent(appendLog(currentState, resolvedEventName, command, "event", eventTarget), eventTarget, nextCallStack, frame.triggerRoomEnter);
      if (currentState.scriptWaitFrames > 0 || isPreviewDebuggerBlocking(currentState)) {
        return suspendCaller(currentState, { ...scriptFrameBase(), commandIndex: commandIndex + 2 }, outerCount);
      }
      break doCommand;
    }

    if (
      verb === "set_variable"
      || verb === "add_variable"
      || verb === "multiply_variable"
      || verb === "set_flag"
      || verb === "add_item"
      || verb === "modify_wallet"
      || verb === "set_equipped_item"
    ) {
      currentState = appendRecognizedScript(currentState, resolvedEventName, command, verb, operand);
      break doCommand;
    }

    const conditionResult = evaluateConditionCommand(currentState, [verb, ...parts]);
    if (conditionResult !== null) {
      currentState = runtimeScriptLog(currentState, resolvedEventName, command, String(conditionResult));
      const boundary = structuredConditionBoundary(commands, commandIndex);
      if (boundary.endIndex !== null) {
        conditionalScopes = [
          ...conditionalScopes,
          {
            mode: conditionResult
              ? "then"
              : boundary.elseIndex === null
                ? "skip_to_end"
                : "seek_else"
          }
        ];
      } else if (commandHasElseBranch(commands, commandIndex)) {
        conditionalBranch = conditionResult ? "then_until_else" : "seek_else";
      } else if (!conditionResult) {
        skipNextReason = `Condicao falsa em ${command}.`;
      }
      break doCommand;
    }

    if (verb === "switch_variable") {
      const variableKey = parts[0] ?? "";
      let matched = false;
      for (let caseIndex = 1; caseIndex + 1 < parts.length; caseIndex += 2) {
        const caseValue = scalarToken(parts[caseIndex]);
        const eventTarget = parts[caseIndex + 1] ?? "";
        if (matched || !scalarEquals(currentState.variables[variableKey], caseValue)) {
          continue;
        }
        matched = true;
        currentState = runtimeScriptLog(currentState, resolvedEventName, command, `${variableKey}=${String(caseValue)} -> ${eventTarget}`);
        const outerCount = currentState.scriptContinuations.length;
        currentState = runEvent(appendLog(currentState, resolvedEventName, command, "event", eventTarget), eventTarget, nextCallStack);
        if (currentState.scriptWaitFrames > 0 || isPreviewDebuggerBlocking(currentState)) {
          return suspendCaller(currentState, { ...scriptFrameBase(), commandIndex: commandIndex + 2 }, outerCount);
        }
      }
      if (!matched) {
        currentState = runtimeScriptLog(currentState, resolvedEventName, command, "no-match");
      }
      break doCommand;
    }

    if (verb === "set_background") {
      const asset = projectArray(currentState.project, "assets").find(asset => asset.name === operand && String(asset.kind).toLowerCase() === "background");
      if (!asset || currentState.currentRoom?.sceneType !== "cutscene") {
        currentState = appendDiagnostic(currentState, `Trocar fundo exige uma cutscene e um Background válido: ${operand}.`);
        break doCommand;
      }
      const renderLayers = resolveGbaRoomRenderLayers(currentState.project, {
        ...currentState.currentRoom, backgroundAssetName: operand, background: operand, tilemap: []
      }, 0);
      currentState = { ...currentState, currentRoom: {
        ...currentState.currentRoom, backgroundAssetName: operand, renderLayers,
        bg2: { ...renderLayers.backgrounds.BG2, layer: gbaRenderLayers.bg2 }
      } };
      currentState = runtimeScriptLog(currentState, resolvedEventName, command, operand);
      break doCommand;
    }

    if (verb === "set_background_palette" || verb === "set_sprite_palette" || verb === "restore_colors") {
      currentState = runtimeScriptLog(currentState, resolvedEventName, command, operand || verb);
      break doCommand;
    }

    if (verb === "repeat_expression") {
      const variableKey = parts[0] ?? "";
      const operator = parts[1] ?? "lt";
      const threshold = parts[2] ?? "0";
      const eventTarget = parts[3] ?? "";
      const maxIterations = Math.max(1, numberToken(parts[4], 1));
      let iterations = frame.repeatCommandIndex === commandIndex ? frame.repeatIterations ?? 0 : 0;
      while (
        iterations < maxIterations
        && evaluateRepeatExpressionCondition(currentState, variableKey, operator, threshold)
      ) {
        const outerCount = currentState.scriptContinuations.length;
        currentState = runEvent(
          appendLog(currentState, resolvedEventName, command, "event", `${iterations + 1}/${maxIterations}`),
          eventTarget,
          nextCallStack
        );
        iterations += 1;
        if (currentState.scriptWaitFrames > 0 || isPreviewDebuggerBlocking(currentState)) {
          return suspendCaller(currentState, {
            ...scriptFrameBase(), commandIndex: commandIndex + 1,
            repeatCommandIndex: commandIndex, repeatIterations: iterations
          }, outerCount);
        }
      }
      currentState = runtimeScriptLog(currentState, resolvedEventName, command, `iterations=${iterations}`);
      break doCommand;
    }

    if (verb === "choice_event") {
      const nextState = registerChoiceEvent(currentState, [verb, ...parts]);
      const dialogueKey = parts[0] ?? "";
      const choiceIndex = numberToken(parts[1], 0);
      const eventTarget = parts[2] ?? "";
      currentState = runtimeScriptLog(nextState, resolvedEventName, command, `${dialogueKey}[${choiceIndex}] -> ${eventTarget}`);
      break doCommand;
    }

    if (verb === "slider") {
      const screen = embeddedMenuScreenForConfig(sceneMenuConfigForRoom(currentState.currentRoom), parts[0] ?? "");
      currentState = screen?.carousel
        ? runtimeScriptLog(currentState, resolvedEventName, command, `${screen.items.length} opções`)
        : appendUnsupported(currentState, resolvedEventName, command, "Slider não encontrado.");
      break doCommand;
    }

    if (eventCommandRuntimeVerbs.has(verb) || eventCommandRecipeRuntimeVerbs.has(verb)) {
      currentState = appendRecognizedScript(currentState, resolvedEventName, command, verb, operand);
      break doCommand;
    }

    currentState = appendUnsupported(currentState, resolvedEventName, command, verb, `Comando nao suportado no preview: ${verb}.`);
    }

    const pausedAfterStep = pauseAfterStepIfNeeded(currentState, commandIndex);
    if (pausedAfterStep) return pausedAfterStep;
    if(frame.stepBudget && commandIndex-frame.commandIndex+2>=frame.stepBudget && commandIndex+1<commands.length) return {...currentState,scriptContinuations:[{...scriptFrameBase(),commandIndex:commandIndex+2},...currentState.scriptContinuations]};
  }

  return updateDebug({
    ...currentState,
    debugger: {
      ...currentState.debugger,
      paused: false,
      pauseReason: null,
      scriptFrame: null,
      runMode: currentState.debugger.runMode === "step" ? "step" : "continuous"
    }
  });
}

export function runPreviewRuntimeEvent(state: PreviewRuntimeState, eventName: string): PreviewRuntimeState {
  return runEvent(state, eventName);
}

function nativeThreadFrame(state:PreviewRuntimeState,eventName:string):PreviewRuntimeScriptFrame {
 const event=eventRecords(state.project).get(eventName);if(!event) throw new Error(`Script inexistente: ${eventName}`);
 return {eventName,resolvedEventName:event.name,commands:eventCommands(event.event,state.project),commandIndex:1,callStack:[eventName],skipNextReason:null,conditionalBranch:null,conditionalScopes:[],triggerRoomEnter:true,stepBudget:1};
}
function applyIntegratedNativeSimulation(state:PreviewRuntimeState,parts:string[]):PreviewRuntimeState {
 const [verb,target,arg,extra]=parts;
 let native={...state.nativeEvents};
 if(verb==="start_segment") native.threads={...native.threads,[target!]:{frame:nativeThreadFrame(state,arg!),wait:0,continuations:[]}};
 else if(verb==="stop_segment") {native.threads={...native.threads};delete native.threads[target!];}
 else if(verb==="set_adventure_state") native.adventure={state:target!,frames:["dash","knockback","push"].includes(target!) ? (target==="push" ? 8 : 12) : 0};
 else if(verb==="draw_text") {
  const entry={x:Number(target),y:Number(arg),layer:extra!,text:parts.slice(4).join(" ")};
  native.texts=[...native.texts.filter(text=>text.x!==entry.x || text.y!==entry.y || text.layer!==entry.layer),entry];
 } else if(verb==="open_menu") {
  const dialogue=dialogueByKey(state.project,target!,"choice",state.dialogueLocale);
  if(!dialogue || !dialogue.choices.length) throw new Error("Menu requer opções cadastradas.");
  native.modal={kind:"menu",variable:arg!,cursor:0,pause:true};return {...state,nativeEvents:native,activeDialogue:dialogue};
 } else if(verb==="open_code_lock") native.modal={kind:"code",variable:target!,code:"0".repeat(Number(arg)),expected:Number(extra),cursor:0,pause:true};
 else if(verb==="open_equip_menu") native.modal={kind:"equip-slots",slots:Number(target),cursor:0,pause:arg==="true"};
 else if(verb==="open_shop") {
  const shop=topdownFeatureRuntimeForState(state);if(!shop?.shopEnabled || !shop.shop) throw new Error("Loja não configurada.");
  if(!actorByName(state,target!)) throw new Error("Ator da loja inexistente.");
  native.modal={kind:"shop",cursor:0,pause:true};return {...setPreviewStartMenuPage(state,"shop"),nativeEvents:native};
 } else if(verb==="projectile_load_slot") {
  if(!assetByName(state.project,arg!)) throw new Error("Sprite do projétil inexistente.");
  native.projectileSlots={...native.projectileSlots,[target!]:{sprite:arg!,damage:Number(extra),speed:Number(parts[4])}};
 } else {
  const actor=actorByName(state,target!);if(!actor) throw new Error(`Ator inexistente: ${target}`);
  if(verb==="launch_projectile_slot") {
   const slot=native.projectileSlots[arg!];if(!slot) throw new Error("Slot de projétil não carregado.");
   const direction=extra!;const dx=direction.includes("left") ? -1 : direction.includes("right") ? 1 : 0;
   const dy=direction.includes("up") ? -1 : direction.includes("down") ? 1 : 0;
   if(native.projectiles.length<8) native.projectiles=[...native.projectiles,{...slot,x:actor.x+0.5,y:actor.y+0.5,dx,dy,source:actor.id}];
  } else if(verb==="cancel_actor_movement") native.cancelledMovement={...native.cancelledMovement,[actor.id]:true};
  else if(verb==="actor_effects") native.actorEffects={...native.actorEffects,[actor.id]:{kind:arg!,frames:Number(extra),intensity:Number(parts[4]),visible:actor.visible}};
  else if(verb==="set_actor_animation_state") {
   const matches=projectArray(state.project,"animationStates").filter(entry=>entry.id===arg || (entry.name===arg && entry.spriteSheet===actor.spriteSheet));
   if(matches.length!==1 || !Array.isArray(matches[0]!.animationIDs)) throw new Error("Estado de animação inexistente ou ambíguo.");
   const selected=matches[0]!;const first=String((selected.animationIDs as unknown[])[0] ?? "");
   const animation=projectArray(state.project,"animations").find(entry=>entry.id===first);
   native.actorStates={...native.actorStates,[actor.id]:String(selected.id)};
   state=updateRuntimeActor(state,target!,current=>{
    const next={...current,spriteSheet:String(selected.spriteSheet),animationName:animation ? String(animation.name ?? first) : first};
    const sprite=resolveGbaActorSprite(state.project,next);return {...next,animationFrame:sprite?.frame ?? null,renderDiagnostics:sprite?.diagnostics ?? []};
   });
  } else if(verb==="push_actor") {
   const direction=state.player?.direction ?? "down";const dx=direction.includes("left") ? -1 : direction.includes("right") ? 1 : 0;
   const dy=direction.includes("up") ? -1 : direction.includes("down") ? 1 : 0;
   const limit=arg==="true" ? (state.currentRoom!.width+state.currentRoom!.height)*8 : 8;
   let x=actor.x,y=actor.y;
   for(let i=0;i<limit;++i) {
    const nx=x+dx/8,ny=y+dy/8;
    if(isBlocked(state.currentRoom!,Math.floor(nx),Math.floor(ny)) || state.actors.some(other=>other.id!==actor.id && other.visible && other.active && other.collisionEnabled && Math.abs(other.x-nx)<0.8 && Math.abs(other.y-ny)<0.8)) break;
    x=nx;y=ny;
   }
   state=updateRuntimeActor(state,target!,current=>({...current,x,y}));native.cancelledMovement={...native.cancelledMovement,[actor.id]:true};
  }
 }
 return {...state,nativeEvents:native};
}
function dispatchIntegratedNativeModal(state:PreviewRuntimeState,action:PreviewRuntimeAction):PreviewRuntimeState {
 const modal=state.nativeEvents.modal!;
 const close=(next:PreviewRuntimeState)=>updateDebug({...next,nativeEvents:{...next.nativeEvents,modal:null}});
 if(modal.kind==="menu") {
  if(action==="up" || action==="down") return moveActiveDialogueChoice(state,action==="up" ? -1 : 1);
  if(action==="action" || action==="back") return close({...state,activeDialogue:null,variables:{...state.variables,[modal.variable!]:action==="back" ? -1 : (state.activeDialogue?.selectedChoiceIndex ?? 0)+1}});
  return state;
 }
 if(modal.kind==="code") {
  if(action==="back") return close({...state,variables:{...state.variables,[modal.variable!]:-1}});
  if(action==="action") return close({...state,variables:{...state.variables,[modal.variable!]:Number(modal.code)===modal.expected ? 1 : 0}});
  let next={...modal};
  if(action==="left" || action==="right") next.cursor=(modal.cursor+(action==="left" ? -1 : 1)+modal.code!.length)%modal.code!.length;
  if(action==="up" || action==="down") { const digits=modal.code!.split("");digits[modal.cursor]=String((Number(digits[modal.cursor])+(action==="up" ? 1 : 9))%10);next.code=digits.join(""); }
  return {...state,nativeEvents:{...state.nativeEvents,modal:next}};
 }
 if(modal.kind==="shop") {
  if(action==="back") return close(dismissPreviewStartMenu(state));
  if(action==="up" || action==="down") return movePreviewStartMenuSelection(state,action==="up" ? -1 : 1);
  if(action==="action") {
   if(previewRuntimeStartMenuItems(state)[state.startMenu.selectedIndex]?.id==="back") return close(dismissPreviewStartMenu(state));
   return selectPreviewStartMenuItem(state);
  } return state;
 }
 if(action==="back") return modal.kind==="equip-items" ? {...state,nativeEvents:{...state.nativeEvents,modal:{...modal,kind:"equip-slots",cursor:0}}} : close(state);
 const items=Object.keys(state.inventory).filter(key=>state.inventory[key]!>0).sort();
 const count=modal.kind==="equip-slots" ? modal.slots! : items.length+1;
 if(action==="up" || action==="down") return {...state,nativeEvents:{...state.nativeEvents,modal:{...modal,cursor:(modal.cursor+(action==="up" ? -1 : 1)+count)%count}}};
 if(action==="action") {
  if(modal.kind==="equip-slots") return {...state,nativeEvents:{...state.nativeEvents,modal:{...modal,kind:"equip-items",slot:modal.cursor,cursor:0}}};
  const equipped={...state.equippedItems};if(modal.cursor===0) delete equipped[String(modal.slot)];else equipped[String(modal.slot)]=items[modal.cursor-1]!;
  return {...state,equippedItems:equipped};
 } return state;
}
function tickIntegratedNativeSimulation(state:PreviewRuntimeState,frames:number):PreviewRuntimeState {
 for(let frame=0;frame<frames;++frame) {
  if(!state.nativeEvents.modal?.pause && !state.activeDialogue && !state.startMenu.visible) {
   for(const slot of Object.keys(state.nativeEvents.threads)) {
    const thread=state.nativeEvents.threads[slot];if(!thread) continue;
    if(thread.wait>0) { state={...state,nativeEvents:{...state.nativeEvents,threads:{...state.nativeEvents.threads,[slot]:{...thread,wait:thread.wait-1}}}};continue; }
    const mainWait=state.scriptWaitFrames,mainContinuations=state.scriptContinuations,mainQueue=state.scriptQueue;
    let next=runScriptFrame({...state,nativeEvents:{...state.nativeEvents,executingSegment:slot},scriptWaitFrames:0,scriptContinuations:thread.continuations,scriptQueue:[]},thread.frame);
    const continuations=next.scriptContinuations;
    const threads={...next.nativeEvents.threads};
    if(threads[slot]===thread) {
     if(continuations.length) threads[slot]={frame:continuations[0]!,wait:next.scriptWaitFrames,continuations:continuations.slice(1)};
     else delete threads[slot];
    }
    state={...next,nativeEvents:{...next.nativeEvents,threads,executingSegment:null},scriptWaitFrames:mainWait,scriptContinuations:mainContinuations,scriptQueue:mainQueue};
    if(state.nativeEvents.modal || state.activeDialogue) break;
   }
  }
  const effects={...state.nativeEvents.actorEffects};
  for(const [id,effect] of Object.entries(effects)) {
   const remaining=effect.frames-1;
   if(effect.kind==="shake") state=updateRuntimeActor(state,id,actor=>({...actor,visualOffsetX:remaining>0 ? (state.previewFrame%2===0 ? 1 : -1)*Math.floor(effect.intensity/25) : 0}));
   if(effect.kind==="flash") state=updateRuntimeActor(state,id,actor=>({...actor,visible:remaining>0 ? effect.visible && (state.previewFrame%2!==0 || effect.intensity===0) : effect.visible}));
   if(remaining<=0) delete effects[id];else effects[id]={...effect,frames:remaining};
  }
  state={...state,nativeEvents:{...state.nativeEvents,actorEffects:effects}};
  if(!state.nativeEvents.modal?.pause && !state.activeDialogue && !state.startMenu.visible && state.currentRoom) {
    const room=state.currentRoom;
    const projectiles:PreviewNativeEvents["projectiles"]=[];
    for(const projectile of state.nativeEvents.projectiles) {
      const next={...projectile,x:projectile.x+projectile.dx*projectile.speed/800,y:projectile.y+projectile.dy*projectile.speed/800};
      if(isBlocked(room,Math.floor(next.x),Math.floor(next.y))) continue;
      const hit=state.actors.find(actor=>actor.id!==next.source && actor.active && actor.visible && actor.collisionEnabled && next.x+0.25>=actor.x && next.x-0.25<actor.x+1 && next.y+0.25>=actor.y && next.y-0.25<actor.y+1);
      if(hit) {
        const source=projectActorForPreview(state.project,hit.id);const hp=hit.hitPoints ?? numberToken(String(source?.health ?? 1),1);
        state=updateRuntimeActor(state,hit.id,actor=>({...actor,hitPoints:Math.max(0,hp-next.damage),active:hp>next.damage}));
      } else projectiles.push(next);
    }
    let adventure=state.nativeEvents.adventure;
    if(["dash","knockback","push"].includes(adventure.state) && adventure.frames>0 && state.player) {
      const direction=state.player.direction;let dx=direction.includes("left") ? -1 : direction.includes("right") ? 1 : 0;
      let dy=direction.includes("up") ? -1 : direction.includes("down") ? 1 : 0;
      if(adventure.state==="knockback") {dx=-dx;dy=-dy;}
      const speed=adventure.state==="dash" ? 3 : adventure.state==="knockback" ? 2 : 1;
      const x=state.player.x+dx*speed/8,y=state.player.y+dy*speed/8;
      if(!isBlocked(room,Math.floor(x),Math.floor(y))) state=updateRuntimeActor(state,state.player.id,actor=>({...actor,x,y}));
      adventure={state:adventure.frames<=1 ? "ground" : adventure.state,frames:adventure.frames-1};
    }
    state={...state,nativeEvents:{...state.nativeEvents,projectiles,adventure}};
  }
 }
 return state;
}

function roomBootEventName(state: PreviewRuntimeState): string | null {
  const roomRecord = roomRecordByRuntimeRoom(state.project, state.currentRoom);
  if (!roomRecord) return null;
  return eventBinding(roomRecord, "onInit") ?? nullableString(roomRecord.onInitEventName) ?? nullableString(roomRecord.eventName);
}

function playerActor(state: PreviewRuntimeState): PreviewRuntimeActor | null {
  if (!state.currentRoom || !state.player) return null;
  return runtimeActors(state.project, state.currentRoom.name).find((actor) => actor.id === state.player?.id) ?? null;
}

function actorOnUpdateEventName(actor: PreviewRuntimeActor): string | null {
  return nullableString(actor.eventBindings.onUpdate);
}

function runActorUpdateScripts(state: PreviewRuntimeState): PreviewRuntimeState {
  if (!state.currentRoom || state.activeDialogue) return state;

  let nextState = state;
  for (const actor of actorsForRoom(state.project, state.currentRoom)) {
    const eventName = actorOnUpdateEventName(actor);
    if (!eventName) continue;
    nextState = runEvent(nextState, eventName);
  }
  return nextState;
}

function actorActionEventName(state: PreviewRuntimeState): string | null {
  const actor = playerActor(state);
  if (!actor) return null;
  return nullableString(actor.eventBindings.onInteract) ?? actor.eventName;
}

function triggerContainsPlayer(trigger: PreviewRuntimeTrigger, player: PreviewRuntimePlayer, paddingTiles = 0): boolean {
  return player.x >= trigger.x - paddingTiles &&
    player.x < trigger.x + trigger.width + paddingTiles &&
    player.y >= trigger.y - paddingTiles &&
    player.y < trigger.y + trigger.height + paddingTiles;
}

function triggerEnterEventName(trigger: PreviewRuntimeTrigger): string | null {
  return nullableString(trigger.eventBindings.onEnter) ?? trigger.onEnterEventName ?? trigger.eventName;
}

function triggerInteractEventName(trigger: PreviewRuntimeTrigger): string | null {
  return nullableString(trigger.eventBindings.onInteract) ?? trigger.onInteractEventName;
}

function pointClickCursorAnimationName(state: PreviewRuntimeState, targetState: "idle" | "hover" | "click"): string | null {
  if (state.currentRoom?.sceneType !== "pointAndClick" || !state.player?.spriteSheet) return null;
  const actor = projectArray(state.project, "actors").find((candidate) => nullableString(candidate.id) === state.player?.id);
  const animationStates = projectArray(state.project, "animationStates").flatMap((candidate): SpriteStateContract[] => {
    const id = nullableString(candidate.id);
    const name = nullableString(candidate.name);
    const spriteSheet = nullableString(candidate.spriteSheet);
    if (!id || !name || !spriteSheet || !isSpriteAnimationType(candidate.animationType) || !Array.isArray(candidate.animationIDs)) {
      return [];
    }
    return [{
      id,
      name,
      spriteSheet,
      animationType: candidate.animationType,
      mirrorLeftFromRight: candidate.mirrorLeftFromRight === true,
      animationIDs: candidate.animationIDs.filter((value): value is string => typeof value === "string")
    }];
  });
  const stateContract = resolveSpriteStateForActor(animationStates, {
    animationStateID: state.nativeEvents.actorStates[state.player.id] ?? nullableString(actor?.animationStateID),
    spriteSheet: state.player.spriteSheet
  });
  if (!stateContract || stateContract.animationType !== "cursor") return null;
  const allowedIDs = new Set(stateContract.animationIDs);
  const animations = projectArray(state.project, "animations").filter((candidate) => (
    allowedIDs.has(nullableString(candidate.id) ?? "") && nullableString(candidate.spriteSheet) === state.player?.spriteSheet
  ));
  const technicalState = targetState === "click" ? "attack" : targetState === "hover" ? "walk" : "idle";
  const target = animations.find((candidate) => nullableString(candidate.state)?.toLowerCase() === targetState)
    ?? animations.find((candidate) => nullableString(candidate.state)?.toLowerCase() === technicalState)
    ?? animations.find((candidate) => nullableString(candidate.name)?.toLowerCase() === targetState);
  return nullableString(target?.name) ?? nullableString(target?.id);
}

function pointClickCursorFrameDurationMs(state: PreviewRuntimeState): number {
  const clip = projectArray(state.project, "animations").find(candidate => candidate.spriteSheet === state.player?.spriteSheet
    && (candidate.name === state.player?.animationName || candidate.id === state.player?.animationName));
  return 1000 / positiveInteger(clip?.fps, state.player?.animationFrame?.fps ?? 6);
}

function applyPointClickCursorAnimation(state: PreviewRuntimeState, clicked = false): PreviewRuntimeState {
  if (state.currentRoom?.sceneType !== "pointAndClick" || !state.player) return state;
  const clickName = pointClickCursorAnimationName(state, "click");
  if (!clicked && clickName && state.player.animationName === clickName) {
    const durationMs = animationFrameCount(state.project, state.player.spriteSheet ?? "", clickName)
      * pointClickCursorFrameDurationMs(state);
    if (state.animationElapsedMs < durationMs) return state;
  }
  const pointClickConfig = pointClickSceneConfigFromRuntime(state.currentRoom.runtime);
  const paddingTiles = (pointClickConfig?.hotspotPadding ?? 0) / gbaTileSizePx;
  const hovering = runtimeTriggers(state.project, state.currentRoom.name)
    .some((trigger) => triggerContainsPlayer(trigger, state.player as PreviewRuntimePlayer, paddingTiles));
  const animationName = clicked && clickName ? clickName
    : (hovering ? pointClickCursorAnimationName(state, "hover") : null) ?? pointClickCursorAnimationName(state, "idle");
  if (!animationName || (!clicked && animationName === state.player.animationName)) return state;
  const animationFrame = spriteFrameForActor(state.project, state.player.spriteSheet, animationName);
  const actors = state.actors.map((actor) => actor.id === state.player?.id
    ? { ...actor, animationName, animationFrame, animationFrameIndex: 0 }
    : actor);
  return updateDebug({
    ...state,
    actors,
    playerAnimationFrameIndex: 0,
    animationElapsedMs: 0,
    player: state.player ? { ...state.player, animationName, animationFrame } : state.player
  });
}

function triggerLeaveEventName(trigger: PreviewRuntimeTrigger): string | null {
  return nullableString(trigger.eventBindings.onLeave)
    ?? nullableString(trigger.eventBindings.on_leave)
    ?? trigger.onLeaveEventName;
}

function runTriggerOverlap(state: PreviewRuntimeState): PreviewRuntimeState {
  if (!state.currentRoom || !state.player) return updateDebug(state);
  const pointClickConfig = pointClickSceneConfigFromRuntime(state.currentRoom.runtime);
  const paddingTiles = state.currentRoom.sceneType === "pointAndClick"
    ? (pointClickConfig?.hotspotPadding ?? 0) / gbaTileSizePx
    : 0;
  const overlapping = runtimeTriggers(state.project, state.currentRoom.name)
    .filter((candidate) => candidate.roomName === state.currentRoom?.name && triggerContainsPlayer(candidate, state.player as PreviewRuntimePlayer, paddingTiles));
  const nextIDs = overlapping.map((trigger) => trigger.id);
  const previousIDs = new Set(state.overlappingTriggerIDs);
  const nextIDSet = new Set(nextIDs);

  let nextState: PreviewRuntimeState = {
    ...state,
    overlappingTriggerIDs: nextIDs
  };

  if (state.currentRoom.sceneType === "pointAndClick") {
    return updateDebug(nextState);
  }

  for (const trigger of overlapping) {
    if (!previousIDs.has(trigger.id)) {
      nextState = runEvent(nextState, triggerEnterEventName(trigger));
    }
  }

  for (const previousID of previousIDs) {
    if (nextIDSet.has(previousID)) continue;
    const leftTrigger = runtimeTriggers(state.project, state.currentRoom.name)
      .find((candidate) => candidate.id === previousID);
    if (!leftTrigger) continue;
    nextState = runEvent(nextState, triggerLeaveEventName(leftTrigger));
  }

  return updateDebug(nextState);
}

function isBlocked(room: PreviewRuntimeRoom, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= room.width || y >= room.height) return true;
  return room.collisionCells[y * room.width + x] === true;
}

function isometricFreeMovementEnabled(room: PreviewRuntimeRoom): boolean {
  const config = isometricSceneConfigFromRuntime(room.runtime);
  return room.sceneType === "isometric" && config?.gameplayMode === "adventure" && config.movement === "free";
}

function isometricRampAllowsTransition(
  room: PreviewRuntimeRoom,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  delta: { x: number; y: number },
  fromZ: number,
  toZ: number
): boolean {
  if (fromZ === toZ) return true;
  const higherX = toZ > fromZ ? toX : fromX;
  const higherY = toZ > fromZ ? toY : fromY;
  const ramp = room.collisionTypes[higherY * room.width + higherX];
  const transitionSign = toZ > fromZ ? 1 : -1;
  return (ramp === "slope_up_right" && delta.x === transitionSign && delta.y === 0)
    || (ramp === "slope_up_left" && delta.y === transitionSign && delta.x === 0);
}

function defaultIsometricTacticalState(
  room: PreviewRuntimeRoom | null,
  actors: PreviewRuntimeActor[]
): PreviewIsometricTacticalState {
  const config = room ? isometricSceneConfigFromRuntime(room.runtime) : null;
  const tactical = config?.gameplayMode === "tactical" && config.tactical ? config.tactical : null;
  const state = createIsometricTacticalState(tactical, actors.length);
  const activeUnit = state.activeUnitIndex === null
    ? null
    : state.units[state.activeUnitIndex] ?? null;
  const activeActor = activeUnit
    ? actors[activeUnit.actorIndex] ?? null
    : null;
  const player = actors[0] ?? null;
  return {
    ...state,
    cursor: activeActor
      ? { x: activeActor.x, y: activeActor.y, z: activeActor.z }
      : player
        ? { x: player.x, y: player.y, z: player.z }
        : { x: 0, y: 0, z: 0 },
    lastVisualEvents: [],
    lastAudioCues: []
  };
}

function isometricTacticalActorPositions(state: PreviewRuntimeState): IsometricTacticalActorPosition[] {
  return state.actors
    .filter((actor) => actor.roomName === state.currentRoom?.name)
    .map((actor, actorIndex) => ({
      actorIndex,
      x: actor.x,
      y: actor.y,
      z: actor.z,
      visible: actor.visible && actor.active
    }));
}

function applyPreviewTacticalAudio(
  state: PreviewRuntimeState,
  audioCues: IsoTacticalAudioCue[]
): PreviewRuntimeState {
  const presentation = state.isometricTacticalPresentation;
  if (!presentation?.audio || !presentation.capabilities.includes("tactical_audio") || audioCues.length === 0) {
    return state;
  }
  const cue = audioCues[audioCues.length - 1];
  const cueName = presentation.audio.cues[cue];
  if (!cueName) return state;
  return {
    ...state,
    activeSfx: cueName,
    activeSfxAsset: presentation.audio.cueAssets[cue] ?? assetByReference(state.project, cueName)
  };
}

function applyPreviewTacticalActionResult(
  state: PreviewRuntimeState,
  result: IsometricTacticalActionResult,
  cursor: IsometricTacticalTile
): PreviewRuntimeState {
  const next = {
    ...state,
    isometricTactical: {
      ...state.isometricTactical,
      ...result.state,
      cursor,
      lastVisualEvents: result.visualEvents,
      lastAudioCues: state.isometricTacticalPresentation?.capabilities.includes("tactical_audio")
        ? result.audioCues
        : []
    }
  };
  return updateDebug(applyPreviewTacticalAudio(next, result.audioCues));
}

function moveIsometricTacticalCursor(
  state: PreviewRuntimeState,
  action: Extract<PreviewRuntimeAction, "up" | "down" | "left" | "right">
): PreviewRuntimeState {
  const room = state.currentRoom;
  if (!room || !state.isometricTactical.enabled) return updateDebug(state);
  const delta = action === "left"
    ? { x: 0, y: 1 }
    : action === "right"
      ? { x: 1, y: 0 }
      : action === "up"
        ? { x: 0, y: -1 }
        : { x: -1, y: 0 };
  const cursor = state.isometricTactical.cursor;
  const x = Math.max(0, Math.min(room.width - 1, cursor.x + delta.x));
  const y = Math.max(0, Math.min(room.height - 1, cursor.y + delta.y));
  const z = room.heightLevels[y * room.width + x] ?? 0;
  const nextCursor = { x, y, z };
  const changed = nextCursor.x !== cursor.x || nextCursor.y !== cursor.y || nextCursor.z !== cursor.z;
  const moved = {
    ...state,
    isometricTactical: {
      ...state.isometricTactical,
      cursor: nextCursor,
      notice: null,
      lastVisualEvents: changed
        ? [{ kind: "cursor" as const, tile: nextCursor }]
        : [],
      lastAudioCues: changed && state.isometricTacticalPresentation?.capabilities.includes("tactical_audio")
        ? ["cursor" as const]
        : []
    }
  };
  return updateDebug(applyPreviewTacticalAudio(moved, changed ? ["cursor"] : []));
}

function dispatchIsometricTacticalAction(
  state: PreviewRuntimeState,
  action: "confirm" | "cancel" | "end_turn"
): PreviewRuntimeState {
  const room = state.currentRoom;
  if (!room || !state.isometricTactical.enabled) return updateDebug(state);
  const result = applyIsometricTacticalAction(
    state.isometricTactical,
    isometricTacticalActorPositions(state),
    state.isometricTactical.cursor,
    action,
    (tile) => isBlocked(room, tile.x, tile.y),
    (x, y) => room.heightLevels[y * room.width + x] ?? 0,
    (from, to) => isometricRampAllowsTransition(
      room, from.x, from.y, to.x, to.y,
      { x: to.x - from.x, y: to.y - from.y }, from.z, to.z
    )
  );
  if (result.moves.length === 0 && result.attacks.length === 0 && result.defeatedActorIndexes.length === 0) {
    return applyPreviewTacticalActionResult(state, result, state.isometricTactical.cursor);
  }
  const roomActors = state.actors.filter((actor) => actor.roomName === room.name);
  const actors = state.actors.map((actor) => {
    const actorIndex = roomActors.indexOf(actor);
    const move = result.moves.find((candidate) => candidate.actorIndex === actorIndex);
    const defeated = result.defeatedActorIndexes.includes(actorIndex);
    if (!move && !defeated) return actor;
    return {
      ...actor,
      ...(move ? { x: move.tile.x, y: move.tile.y, z: move.tile.z } : {}),
      ...(defeated ? { visible: false, active: false } : {})
    };
  });
  const nextCursor = result.moves[0]?.tile ?? state.isometricTactical.cursor;
  return applyPreviewTacticalActionResult(stateWithActors({
    ...state,
    isometricTactical: {
      ...result.state,
      cursor: nextCursor,
      lastVisualEvents: result.visualEvents,
      lastAudioCues: state.isometricTacticalPresentation?.capabilities.includes("tactical_audio")
        ? result.audioCues
        : []
    }
  }, actors), result, nextCursor);
}

function closeActiveDialogue(state: PreviewRuntimeState): PreviewRuntimeState {
  const confirmSound = state.activeDialogue?.confirmSound || null;
  return updateDebug({
    ...state,
    activeDialogue: null,
    activeSfx: confirmSound ?? state.activeSfx,
    activeSfxAsset: confirmSound ? assetByName(state.project, confirmSound) : state.activeSfxAsset
  });
}

function moveActiveDialogueChoice(state: PreviewRuntimeState, delta: number): PreviewRuntimeState {
  const dialogue = state.activeDialogue;
  if (!dialogue || dialogue.mode !== "choice" || dialogue.choices.length === 0) return updateDebug(state);
  const choiceCount = dialogue.choices.length;
  const selectedChoiceIndex = (dialogue.selectedChoiceIndex + delta + choiceCount) % choiceCount;
  return updateDebug({
    ...state,
    activeDialogue: {
      ...dialogue,
      selectedChoiceIndex
    }
  });
}

const previewBattleRootMenuItems = ["ATACAR", "EQUIPE", "ITENS", "FUGIR"] as const;

function battleActorRecordsForRoom(
  project: GBAProjectData,
  roomNameValue: string,
  side: "party" | "enemy"
): Record<string, unknown>[] {
  return projectArray(project, "actors").filter((actor) => {
    if (actorRoomName(actor, roomNameValue) !== roomNameValue || !isRecord(actor.battle)) return false;
    return actor.battle.side === side;
  });
}

function battleParticipantMaxHp(actor: Record<string, unknown>, fallback: number): number {
  const battle = isRecord(actor.battle) ? actor.battle : {};
  return Math.max(1, integerField(battle.maxHp, fallback));
}

function battleStateForRoom(project: GBAProjectData, room: PreviewRuntimeRoom | null) {
  const roomNameValue = room?.name ?? "";
  const party = battleActorRecordsForRoom(project, roomNameValue, "party");
  const enemies = battleActorRecordsForRoom(project, roomNameValue, "enemy");
  return {
    battlePartyIndex: 0,
    battleTargetIndex: 0,
    battlePartyHp: party.map((actor) => battleParticipantMaxHp(actor, 24)),
    battleEnemyHp: enemies.map((actor) => battleParticipantMaxHp(actor, 12)),
    battlePartyDefending: party.map(() => false),
    battleEnemyDefending: enemies.map(() => false),
    battleTurnPending: false,
    battleOutcome: "inProgress" as PreviewBattleOutcome,
    battleLastEnemyTargetIndex: -1
  };
}

function defaultBattleMenuForRoom(room: PreviewRuntimeRoom | null): PreviewBattleMenu {
  return {
    visible: room?.sceneType === "battleRpg",
    page: "root",
    selectedIndex: 0,
    notice: null,
    targetSide: null,
    selectedAbilityIndex: 0
  };
}

function battleActorRecords(state: PreviewRuntimeState, side: "party" | "enemy"): Record<string, unknown>[] {
  return battleActorRecordsForRoom(state.project, state.currentRoom?.name ?? "", side);
}

function battleAbilityLabels(state: PreviewRuntimeState): string[] {
  const party = battleActorRecords(state, "party")[state.battlePartyIndex] ?? battleActorRecords(state, "party")[0];
  const battle = party && isRecord(party.battle) ? party.battle : {};
  const abilities = Array.isArray(battle.abilities) ? battle.abilities : [];
  const labels: Record<string, string> = {
    attack: "ATAQUE",
    magic: "TÉCNICA",
    heal: "REPARAR",
    defend: "DEFENDER"
  };
  return abilities.map((ability) => labels[stringField(ability, "attack")] ?? "AÇÃO");
}

function battleAbilityKind(state: PreviewRuntimeState, abilityIndex: number): string {
  const party = battleActorRecords(state, "party")[state.battlePartyIndex] ?? battleActorRecords(state, "party")[0];
  const battle = party && isRecord(party.battle) ? party.battle : {};
  const abilities = Array.isArray(battle.abilities) ? battle.abilities : [];
  return stringField(abilities[abilityIndex], "attack");
}

function battleMenuItems(
  state: PreviewRuntimeState,
  page: PreviewBattleMenuPage,
  targetSide: "party" | "enemy" | null = null
): string[] {
  if (page === "root") return [...previewBattleRootMenuItems];
  if (page === "moves") return battleAbilityLabels(state);
  if (page === "targets") {
    return battleActorRecords(state, targetSide ?? "enemy").map((actor) => stringField(actor.name, "ALVO"));
  }
  if (page === "party") {
    return battleActorRecords(state, "party").map((actor) => stringField(actor.name, "ALIADO"));
  }
  if (page === "items") return ["NENHUM ITEM"];
  return ["CONTINUAR"];
}

export function previewRuntimeBattleMenuItems(state: PreviewRuntimeState): string[] {
  return battleMenuItems(state, state.battleMenu.page, state.battleMenu.targetSide);
}

function moveBattleMenuSelection(state: PreviewRuntimeState, action: PreviewRuntimeAction): PreviewRuntimeState {
  const menu = state.battleMenu;
  if (!menu.visible || !isPreviewMovementAction(action)) return updateDebug(state);
  const items = battleMenuItems(state, menu.page, menu.targetSide);
  if (items.length === 0) return updateDebug(state);

  let selectedIndex = menu.selectedIndex;
  if (menu.page === "root") {
    const row = selectedIndex < 2 ? 0 : 1;
    const column = selectedIndex % 2;
    if (action === "left") selectedIndex = row * 2 + Math.max(0, column - 1);
    if (action === "right") selectedIndex = row * 2 + Math.min(1, column + 1);
    if (action === "up") selectedIndex = row === 0 ? selectedIndex : selectedIndex - 2;
    if (action === "down") selectedIndex = row === 1 ? selectedIndex : selectedIndex + 2;
  } else {
    const delta = action === "up" || action === "left" ? -1 : 1;
    selectedIndex = (selectedIndex + delta + items.length) % items.length;
  }

  return updateDebug({
    ...state,
    battleMenu: {
      ...menu,
      selectedIndex
    }
  });
}

function rootBattleMenu(state: PreviewRuntimeState, selectedIndex = state.battleMenu.selectedIndex): PreviewRuntimeState {
  return updateDebug({
    ...state,
    battleMenu: {
      visible: true,
      page: "root",
      selectedIndex,
      notice: null,
      targetSide: null,
      selectedAbilityIndex: 0
    }
  });
}

function battleAbilityPower(actor: Record<string, unknown>, kind: string): number {
  const battle = isRecord(actor.battle) ? actor.battle : {};
  if (kind === "heal") return Math.max(1, Math.floor(battleParticipantMaxHp(actor, 24) / 4));
  if (kind === "magic") return Math.max(1, integerField(battle.attack, 7));
  return 0;
}

function battleUnitStat(actor: Record<string, unknown>, key: string, fallback: number): number {
  const battle = isRecord(actor.battle) ? actor.battle : {};
  return Math.max(0, integerField(battle[key], fallback));
}

function battleDamageValue(
  attacker: Record<string, unknown>,
  defender: Record<string, unknown>,
  abilityKind: string
): number {
  const attack = Math.max(1, battleUnitStat(attacker, "attack", 7));
  const defense = Math.max(0, battleUnitStat(defender, "defense", 2));
  const rawDamage = abilityKind === "magic"
    ? battleAbilityPower(attacker, abilityKind) + attack - Math.floor(defense / 2)
    : attack - defense;
  return Math.max(1, rawDamage);
}

function battleOutcomeForHp(partyHp: number[], enemyHp: number[]): PreviewBattleOutcome {
  if (enemyHp.every((hp) => hp <= 0)) return "victory";
  if (partyHp.every((hp) => hp <= 0)) return "defeat";
  return "inProgress";
}

function applyPreviewBattleAbility(
  state: PreviewRuntimeState,
  abilityIndex: number,
  targetSide: "party" | "enemy",
  targetIndex: number
): { state: PreviewRuntimeState; started: boolean } {
  const party = battleActorRecords(state, "party");
  const enemies = battleActorRecords(state, "enemy");
  const partyIndex = Math.max(0, Math.min(state.battlePartyIndex, party.length - 1));
  const actor = party[partyIndex];
  const abilityKind = battleAbilityKind(state, abilityIndex);
  if (!actor || abilityIndex < 0 || !abilityKind) return { state, started: false };

  const partyHp = [...state.battlePartyHp];
  const enemyHp = [...state.battleEnemyHp];
  const partyDefending = [...state.battlePartyDefending];
  const enemyDefending = [...state.battleEnemyDefending];
  if (abilityKind === "defend") {
    partyDefending[partyIndex] = true;
  } else if (abilityKind === "heal") {
    const target = party[targetIndex];
    if (!target || partyHp[targetIndex] <= 0 || partyHp[targetIndex] >= battleParticipantMaxHp(target, 24)) {
      return { state, started: false };
    }
    partyHp[targetIndex] = Math.min(
      battleParticipantMaxHp(target, 24),
      partyHp[targetIndex] + battleAbilityPower(actor, abilityKind)
    );
  } else {
    const target = enemies[targetIndex];
    if (!target || enemyHp[targetIndex] <= 0) return { state, started: false };
    let damage = battleDamageValue(actor, target, abilityKind);
    if (enemyDefending[targetIndex]) {
      damage = Math.ceil(damage / 2);
      enemyDefending[targetIndex] = false;
    }
    enemyHp[targetIndex] = Math.max(0, enemyHp[targetIndex] - damage);
  }

  const battleOutcome = battleOutcomeForHp(partyHp, enemyHp);
  return {
    started: true,
    state: {
      ...state,
      battlePartyHp: partyHp,
      battleEnemyHp: enemyHp,
      battlePartyDefending: partyDefending,
      battleEnemyDefending: enemyDefending,
      battleOutcome,
      battleTurnPending: battleOutcome === "inProgress"
    }
  };
}

function applyPreviewEnemyTurn(state: PreviewRuntimeState): PreviewRuntimeState {
  if (!state.battleTurnPending || state.battleOutcome !== "inProgress") return state;
  const party = battleActorRecords(state, "party");
  const enemies = battleActorRecords(state, "enemy");
  const enemyIndex = state.battleEnemyHp.findIndex((hp) => hp > 0);
  const targetIndex = state.battlePartyHp.findIndex((hp) => hp > 0);
  const enemy = enemies[enemyIndex];
  const target = party[targetIndex];
  if (!enemy || !target) {
    return {
      ...state,
      battleTurnPending: false,
      battleOutcome: battleOutcomeForHp(state.battlePartyHp, state.battleEnemyHp)
    };
  }
  const enemyAbilities = isRecord(enemy.battle) && Array.isArray(enemy.battle.abilities) ? enemy.battle.abilities : [];
  const abilityKind = enemyAbilities.some((ability) => stringField(ability, "attack") === "magic") ? "magic" : "attack";
  const partyHp = [...state.battlePartyHp];
  const partyDefending = [...state.battlePartyDefending];
  let damage = battleDamageValue(enemy, target, abilityKind);
  if (partyDefending[targetIndex]) {
    damage = Math.ceil(damage / 2);
    partyDefending[targetIndex] = false;
  }
  partyHp[targetIndex] = Math.max(0, partyHp[targetIndex] - damage);
  return {
    ...state,
    battlePartyHp: partyHp,
    battlePartyDefending: partyDefending,
    battleTurnPending: false,
    battleOutcome: battleOutcomeForHp(partyHp, state.battleEnemyHp),
    battleLastEnemyTargetIndex: targetIndex
  };
}

function battleOutcomeEventName(state: PreviewRuntimeState, outcome: PreviewBattleOutcome): string | null {
  const room = roomRecordByRuntimeRoom(state.project, state.currentRoom);
  if (!room) return null;
  const binding = outcome === "victory"
    ? "onVictory"
    : outcome === "defeat"
      ? "onDefeat"
      : outcome === "escaped"
        ? "onEscape"
        : "";
  return binding ? eventBinding(room, binding) ?? nullableString(room[binding]) : null;
}

function selectBattleMenuItem(state: PreviewRuntimeState): PreviewRuntimeState {
  const menu = state.battleMenu;
  if (!menu.visible) return updateDebug(state);
  const items = battleMenuItems(state, menu.page, menu.targetSide);
  const selectedLabel = items[menu.selectedIndex] ?? items[0] ?? "AÇÃO";

  if (menu.page === "root") {
    if (menu.selectedIndex === 0) {
      return updateDebug({
        ...state,
        battleMenu: {
          ...menu,
          page: "moves",
          selectedIndex: 0,
          notice: null,
          targetSide: null,
          selectedAbilityIndex: 0
        }
      });
    }
    if (menu.selectedIndex === 1) {
      return updateDebug({
        ...state,
        battleMenu: {
          ...menu,
          page: "party",
          selectedIndex: 0,
          notice: null,
          targetSide: null,
          selectedAbilityIndex: 0
        }
      });
    }
    if (menu.selectedIndex === 2) {
      return updateDebug({ ...state, battleMenu: { ...menu, page: "items", selectedIndex: 0, notice: null, targetSide: null, selectedAbilityIndex: 0 } });
    }
    const config = battleRpgSceneConfigFromRuntime(state.currentRoom?.runtime);
    if (config?.escapeEnabled) {
      const escaped = {
        ...state,
        battleEscaped: true,
        battleOutcome: "escaped" as PreviewBattleOutcome,
        battleTurnPending: false,
        battleMenu: { ...menu, visible: false, notice: null }
      };
      const eventName = battleOutcomeEventName(escaped, "escaped");
      return eventName ? runEvent(escaped, eventName) : updateDebug(escaped);
    }
    return updateDebug({
      ...state,
      battleMenu: { ...menu, page: "root", selectedIndex: 3, notice: "Não há rota de fuga!" }
    });
  }

  if (menu.page === "moves") {
    const abilityKind = battleAbilityKind(state, menu.selectedIndex);
    const targetSide = abilityKind === "heal" ? "party" : "enemy";
    const targets = battleActorRecords(state, targetSide);
    if (targets.length > 1) {
      return updateDebug({
        ...state,
        battleMenu: {
          ...menu,
          page: "targets",
          selectedIndex: 0,
          notice: null,
          targetSide,
          selectedAbilityIndex: menu.selectedIndex
        }
      });
    }
    const targetIndex = targetSide === "enemy"
      ? Math.max(0, Math.min(state.battleTargetIndex, targets.length - 1))
      : Math.max(0, Math.min(state.battlePartyIndex, targets.length - 1));
    const result = applyPreviewBattleAbility(state, menu.selectedIndex, targetSide, targetIndex);
    const nextState = result.started
      ? { ...result.state, battleTurnIndex: state.battleTurnIndex + 1 }
      : state;
    const notice = !result.started
      ? "Ação indisponível!"
      : result.state.battleOutcome === "victory"
        ? "Vitória!"
        : result.state.battleOutcome === "defeat"
          ? "Derrota!"
          : `Player usou ${selectedLabel}.`;
    return updateDebug({
      ...nextState,
      battleMenu: {
        visible: true,
        page: "notice",
        selectedIndex: 0,
        notice,
        targetSide: null,
        selectedAbilityIndex: menu.selectedIndex
      }
    });
  }

  if (menu.page === "targets") {
    const abilityLabel = battleAbilityLabels(state)[menu.selectedAbilityIndex] ?? "AÇÃO";
    const targetIndex = menu.selectedIndex;
    const result = applyPreviewBattleAbility(state, menu.selectedAbilityIndex, menu.targetSide ?? "enemy", targetIndex);
    const nextState = result.started
      ? {
          ...result.state,
          battleTargetIndex: menu.targetSide === "enemy" ? targetIndex : state.battleTargetIndex,
          battleTurnIndex: state.battleTurnIndex + 1
        }
      : state;
    const notice = !result.started
      ? "Ação indisponível!"
      : result.state.battleOutcome === "victory"
        ? "Vitória!"
        : result.state.battleOutcome === "defeat"
          ? "Derrota!"
          : `Player usou ${abilityLabel}.`;
    return updateDebug({
      ...nextState,
      battleMenu: {
        visible: true,
        page: "notice",
        selectedIndex: 0,
        notice,
        targetSide: null,
        selectedAbilityIndex: menu.selectedAbilityIndex
      }
    });
  }

  if (menu.page === "party") {
    return updateDebug({
      ...state,
      battlePartyIndex: menu.selectedIndex,
      battleMenu: { visible: true, page: "notice", selectedIndex: 0, notice: `${selectedLabel} está em campo.`, targetSide: null, selectedAbilityIndex: 0 }
    });
  }

  if (menu.page === "items") {
    return updateDebug({
      ...state,
      battleMenu: { visible: true, page: "notice", selectedIndex: 0, notice: "Não há itens disponíveis.", targetSide: null, selectedAbilityIndex: 0 }
    });
  }

  if (menu.page === "notice") {
    if (state.battleOutcome !== "inProgress") {
      const nextState = updateDebug({
        ...state,
        battleMenu: { ...menu, visible: false, notice: null }
      });
      const eventName = battleOutcomeEventName(nextState, state.battleOutcome);
      return eventName ? runEvent(nextState, eventName) : nextState;
    }
    if (state.battleTurnPending) {
      const afterEnemyTurn = applyPreviewEnemyTurn(state);
      if (afterEnemyTurn.battleOutcome !== "inProgress") {
        return updateDebug({
          ...afterEnemyTurn,
          battleMenu: {
            visible: true,
            page: "notice",
            selectedIndex: 0,
            notice: afterEnemyTurn.battleOutcome === "victory" ? "Vitória!" : "Derrota!",
            targetSide: null,
            selectedAbilityIndex: menu.selectedAbilityIndex
          }
        });
      }
      return rootBattleMenu(afterEnemyTurn);
    }
  }

  return rootBattleMenu(state);
}

function backBattleMenu(state: PreviewRuntimeState): PreviewRuntimeState {
  const menu = state.battleMenu;
  if (!menu.visible) return updateDebug(state);
  if (menu.page === "root") return rootBattleMenu(state);
  if (menu.page === "notice" && state.battleTurnPending) return updateDebug(state);
  if (menu.page === "targets") {
    return updateDebug({
      ...state,
      battleMenu: {
        ...menu,
        page: "moves",
        selectedIndex: menu.selectedAbilityIndex,
        notice: null,
        targetSide: null
      }
    });
  }
  const parentIndex = menu.page === "moves" || menu.page === "notice"
    ? 0
    : menu.page === "party"
      ? 1
      : 2;
  return rootBattleMenu(state, parentIndex);
}

function renderingDiagnostics(rooms: PreviewRuntimeRoom[], actors: PreviewRuntimeActor[]): PreviewRuntimeDiagnostic[] {
  return [
    ...rooms.flatMap((room) => activeGbaBackgroundLayers(room.renderLayers).flatMap((layer) => (
      layer.diagnostics.map((diagnostic, index) => ({
        id: `room:${room.id}:${layer.layer.toLowerCase()}:${index}`,
        severity: diagnostic.severity,
        message: diagnostic.message
      }))
    ))),
    ...actors.flatMap((actor) => actor.renderDiagnostics.map((diagnostic, index) => ({
      id: `actor:${actor.id}:obj:${index}`,
      severity: diagnostic.severity,
      message: diagnostic.message
    })))
  ];
}

function applyDataTableLookupPreview(
  state: PreviewRuntimeState,
  eventName: string,
  command: string,
  parts: string[]
): PreviewRuntimeState {
  const tableId = parts[0] ?? "";
  const rowIndex = numberToken(parts[1], 0);
  const row = lookupPluginDataTableRow(state.pluginRegistry.dataTables, tableId, rowIndex);
  if (!row) {
    return updateDebug(appendLog(state, eventName, command, "skipped", `Tabela ou linha nao encontrada: ${tableId}[${rowIndex}].`));
  }

  const nextVariables = { ...state.variables };
  for (let columnIndex = 0; columnIndex < row.values.length; columnIndex += 1) {
    const variableName = parts[2 + columnIndex];
    if (!variableName) continue;
    nextVariables[variableName] = row.values[columnIndex] ?? 0;
  }

  return runtimeScriptLog({
    ...state,
    variables: nextVariables
  }, eventName, command, `${tableId}[${rowIndex}]`);
}

function resolvePreviewCommand(
  state: PreviewRuntimeState,
  command: string
): { command: string; verb: string; parts: string[]; operand: string } {
  const initialParts = command.trim().split(/\s+/).filter(Boolean);
  let verb = initialParts[0] ?? "";
  let parts = initialParts.slice(1);
  let effectiveCommand = command;

  if (isPluginPreviewVerb(state.pluginRegistry, verb)) {
    const rewritten = rewritePluginPreviewCommand(command, state.pluginRegistry);
    if (rewritten) {
      effectiveCommand = rewritten;
      const rewrittenParts = rewritten.trim().split(/\s+/).filter(Boolean);
      verb = rewrittenParts[0] ?? verb;
      parts = rewrittenParts.slice(1);
    }
  }

  return {
    command: effectiveCommand,
    verb,
    parts,
    operand: parts.join(" ").trim()
  };
}

export function createPreviewRuntime(
  project: GBAProjectData,
  options: Pick<BootPreviewRuntimeOptions, "pluginRegistry"> = {}
): PreviewRuntimeState {
  const rooms = projectRooms(project).map((room, index) => toRuntimeRoom(project, room, index));
  const start = startRoomName(project, rooms);
  const roomName = start ?? rooms[0]?.name ?? null;
  return bootPreviewRuntimeAtRoom(project, roomName, options);
}

export interface BootPreviewRuntimeOptions {
  /** Isolated event simulation starts from the room without running its boot scripts. */
  skipBootEvents?: boolean;
  debugger?: PreviewRuntimeDebuggerSession;
  saveSlots?: Record<number, PreviewRuntimeSaveSnapshot>;
  pluginRegistry?: ProjectPluginRegistry;
}

export function bootPreviewRuntimeAtRoom(
  project: GBAProjectData,
  roomName: string | null,
  options: BootPreviewRuntimeOptions = {}
): PreviewRuntimeState {
  const rooms = projectRooms(project).map((room, index) => toRuntimeRoom(project, room, index));
  const currentRoom = roomName ? roomByName(rooms, roomName) ?? rooms[0] ?? null : rooms[0] ?? null;
  const roomActors = actorsForRoom(project, currentRoom);
  const lutaVisualStates = lutaVisualStatesForRoom(project, currentRoom, roomActors);
  const actors = applyLutaVisualStatesToActors(project, roomActors, lutaVisualStates);
  const initialPlayer = playerForRoom(project, currentRoom, actors);
  const initialTacticalPresentation = currentRoom?.tacticalPresentation ?? null;
  const initialTacticalMusic = initialTacticalPresentation?.audio?.music ?? null;
  const runtimeCapabilities = buildProjectRuntimeCapabilityManifest(project);
  const preservedSaveSlots = options.saveSlots
    ? Object.fromEntries(
      Object.entries(options.saveSlots).map(([slot, snapshot]) => [
        Number(slot),
        {
          schema: snapshot.schema ?? 4,
          sequence: snapshot.sequence ?? 0,
          timestampFrames: snapshot.timestampFrames ?? 0,
          title: snapshot.title ?? snapshot.roomName,
          runtime: snapshot.runtime,
          roomName: snapshot.roomName,
          player: snapshot.player ? { ...snapshot.player } : null,
          camera: structuredClone(snapshot.camera),
          variables: { ...snapshot.variables },
          inventory: { ...snapshot.inventory },
          wallet: structuredClone(snapshot.wallet),
          flags: { ...snapshot.flags },
          equippedItems: { ...snapshot.equippedItems },
          dialogueLocale: snapshot.dialogueLocale
        }
      ])
    )
    : {};
  const baseState = updateDebug({
    ready: rooms.length > 0 && currentRoom !== null,
    error: rooms.length > 0 ? null : "Projeto sem rooms para preview.",
    rooms,
    currentRoom,
    runtimeProfile: runtimeProfileForRoom(currentRoom),
    runtimeCapabilities,
    rtc: runtimeCapabilities.capabilities.some((capability) => capability.id === "rtc" && capability.enabled)
      ? previewRuntimeRtcAtFrame(0)
      : null,
    player: initialPlayer,
    actors,
    lutaVisualStates,
    triggers: triggersForRoom(project, currentRoom),
    lutaCombat: lutaCombatForRoom(project, currentRoom, actors),
    activeDialogue: null,
    dialogueUi: dialogueUiSettings(project, currentRoom?.id),
    dialogueLocale: deriveProjectLocalization(project).defaultLocale,
    startMenu: {
      visible: false,
      page: "root",
      selectedIndex: 0,
      notice: null
    },
    sceneMenu: defaultSceneMenuForRoom(project, currentRoom),
    textInput: defaultPreviewTextInputState(),
    battleMenu: defaultBattleMenuForRoom(currentRoom),
    dungeonInteraction: defaultDungeonInteractionForRoom(currentRoom, initialPlayer),
    dungeonHud: defaultDungeonHudForRoom(currentRoom),
    isometricTactical: defaultIsometricTacticalState(currentRoom, actors),
    isometricTacticalPresentation: initialTacticalPresentation,
    activeMusic: initialTacticalMusic,
    activeMusicAsset: assetByReference(project, initialTacticalMusic),
    activeSfx: null,
    activeSfxAsset: null,
    audioMix: defaultRuntimeAudioMixState(),
    camera: initialRuntimeCameraStateForRoom(currentRoom),
    sceneTransition: null,
    platformerPhysics: platformerPreviewBodyForRoom(project, currentRoom, initialPlayer),
    platformerInputRequests: { jump: false, dash: false },
    activeCameraZoneID: null,
    visualEffect: null,
    choiceEvents: [],
    eventLog: [],
    equippedItems: {},
    executionTrace: [],
    flags: {},
    hud: defaultRuntimeHudState(),
    inventory: initialDungeonInventory(currentRoom),
    stats: {},
    variables: {},
    wallet: {},
    saveSlots: preservedSaveSlots,
    linkCable: defaultLinkCablePreviewState(),
    diagnostics: renderingDiagnostics(rooms, actors),
    debug: {
      visible: true,
      lines: []
    },
    debugger: options.debugger ?? defaultPreviewDebuggerSession(),
    project,
    pluginRegistry: options.pluginRegistry ?? emptyProjectPluginRegistry(),
    animationElapsedMs: 0,
    movementElapsedMs: 0,
    vehicleSpeed: 0,
    ...battleStateForRoom(project, currentRoom),
    battleTurnIndex: 0,
    battleEscaped: false,
    playerAnimationFrameIndex: 0,
    overlappingTriggerIDs: [],
    actorUpdateElapsedMs: 0,
    previewFrame: 0,
    previewFrameElapsedMs: 0,
    nativeEvents: initialNativeEvents(),
    scriptWaitFrames: 0,
    scriptContinuations: [],
    scriptQueue: [],
    pausedSceneTypes: {},
    adventureCallbacks: {},
    platformCallbacks: {},
    platformerState: "ground",
    platformerRequestedState: null,
    platformerPlayerActive: true
  });

  const booted = options.skipBootEvents ? applyPointClickCursorAnimation(baseState)
    : runEvent(applyPointClickCursorAnimation(baseState), roomBootEventName(baseState));
  const initialScreen = embeddedMenuScreenForConfig(
    sceneMenuConfigForRoom(booted.currentRoom),
    booted.sceneMenu.screenID
  );
  const entered = !options.skipBootEvents && initialScreen?.onEnterEventName
    ? runEvent(booted, initialScreen.onEnterEventName)
    : booted;
  return entered.currentRoom?.sceneType === "isometric"
    ? applyPreviewCameraZone(entered)
    : entered;
}

/** Simula reboot de hardware: estado volátil zera, slots SRAM do preview permanecem. */
export function rebootPreviewRuntimePreservingSaves(state: PreviewRuntimeState): PreviewRuntimeState {
  const rooms = projectRooms(state.project).map((room, index) => toRuntimeRoom(state.project, room, index));
  const start = startRoomName(state.project, rooms);
  const roomName = start ?? rooms[0]?.name ?? null;
  return bootPreviewRuntimeAtRoom(state.project, roomName, {
    saveSlots: state.saveSlots,
    pluginRegistry: state.pluginRegistry
  });
}

function runtimeBootSignature(project: GBAProjectData): string {
  const settings = isRecord(project.settings) ? project.settings : {};
  const general = isRecord(settings.general) ? settings.general : {};
  return JSON.stringify({
    startScene: nullableString(general.startScene),
    rooms: projectRooms(project),
    actors: projectArray(project, "actors"),
    triggers: projectArray(project, "triggers"),
    events: projectArray(project, "events"),
    runtimeCapabilities: buildProjectRuntimeCapabilityManifest(project)
  });
}

function refreshActiveDialogue(project: GBAProjectData, dialogue: PreviewRuntimeDialogue | null, locale: ProjectLocale): PreviewRuntimeDialogue | null {
  if (!dialogue) return null;
  const refreshed = dialogueByKey(project, dialogue.key, dialogue.mode, locale);
  if (!refreshed) return null;
  return {
    ...refreshed,
    selectedChoiceIndex: refreshed.choices.length > 0
      ? Math.min(dialogue.selectedChoiceIndex, refreshed.choices.length - 1)
      : 0
  };
}

function refreshRuntimeProjectSnapshot(state: PreviewRuntimeState, project: GBAProjectData): PreviewRuntimeState {
  const rooms = projectRooms(project).map((room, index) => toRuntimeRoom(project, room, index));
  const currentRoom = state.currentRoom
    ? roomByName(rooms, state.currentRoom.id) ?? roomByName(rooms, state.currentRoom.name)
    : null;
  const fallbackRoom = currentRoom ?? (startRoomName(project, rooms) ? roomByName(rooms, startRoomName(project, rooms) as string) : null) ?? rooms[0] ?? null;
  const roomActors = actorsForRoom(project, fallbackRoom);
  const lutaVisualStates = lutaVisualStatesForRoom(project, currentRoom, roomActors);
  const actors = applyLutaVisualStatesToActors(project, roomActors, lutaVisualStates);
  const currentPlayer = playerForRoom(project, fallbackRoom, actors);
  const preservedPlayer = currentPlayer && state.player?.id === currentPlayer.id
    ? applyPlayerAnimationFrame(project, { ...currentPlayer, x: state.player.x, y: state.player.y }, state.playerAnimationFrameIndex)
    : applyPlayerAnimationFrame(project, currentPlayer, state.playerAnimationFrameIndex);
  const preservedPlatformerPhysics = fallbackRoom?.platformerPreviewEnabled
    ? state.currentRoom?.id === fallbackRoom.id && state.platformerPhysics
      ? state.platformerPhysics
      : platformerPreviewBodyForRoom(project, fallbackRoom, preservedPlayer)
    : null;
  const activeDialogue = refreshActiveDialogue(project, state.activeDialogue, state.dialogueLocale);
  const activeSfx = activeDialogue?.textSound || state.activeSfx;
  const tacticalPresentation = fallbackRoom?.tacticalPresentation ?? null;
  const tacticalMusic = tacticalPresentation?.audio?.music ?? null;
  const runtimeCapabilities = buildProjectRuntimeCapabilityManifest(project);

  return updateDebug({
    ...state,
    project,
    rooms,
    currentRoom: fallbackRoom,
    camera: roomUsesPagedTacticalSurfaceInPreview(fallbackRoom) ? initialRuntimeCameraStateForRoom(fallbackRoom) : state.camera,
    runtimeCapabilities,
    rtc: runtimeCapabilities.capabilities.some((capability) => capability.id === "rtc" && capability.enabled)
      ? previewRuntimeRtcAtFrame(state.previewFrame)
      : null,
    player: preservedPlayer,
    platformerPhysics: preservedPlatformerPhysics,
    platformerInputRequests: {
      jump: state.platformerInputRequests.jump,
      dash: state.platformerInputRequests.dash
    },
    actors,
    lutaVisualStates,
    isometricTactical: defaultIsometricTacticalState(fallbackRoom, actors),
    lutaCombat: fallbackRoom?.id === state.currentRoom?.id ? state.lutaCombat : lutaCombatForRoom(project, fallbackRoom, actors),
    isometricTacticalPresentation: tacticalPresentation,
    triggers: triggersForRoom(project, fallbackRoom),
    activeDialogue,
    dialogueUi: dialogueUiSettings(project, fallbackRoom?.id),
    ...(tacticalMusic ? { activeMusic: tacticalMusic } : {}),
    activeMusicAsset: assetByReference(project, tacticalMusic ?? state.activeMusic),
    activeSfx,
    activeSfxAsset: assetByName(project, activeSfx),
    diagnostics: renderingDiagnostics(rooms, actors)
  });
}

export function syncPreviewRuntimeProject(
  state: PreviewRuntimeState,
  project: GBAProjectData,
  options: Pick<BootPreviewRuntimeOptions, "pluginRegistry"> = {}
): PreviewRuntimeState {
  if (runtimeBootSignature(state.project) !== runtimeBootSignature(project)) {
    const nextRuntime = createPreviewRuntime(project, {
      pluginRegistry: options.pluginRegistry ?? state.pluginRegistry
    });
    return updateDebug({
      ...nextRuntime,
      debug: {
        ...nextRuntime.debug,
        visible: state.debug.visible
      },
      debugger: state.debugger
    });
  }

  return refreshRuntimeProjectSnapshot({
    ...state,
    pluginRegistry: options.pluginRegistry ?? state.pluginRegistry
  }, project);
}

function tickPreviewAudioMix(state: PreviewRuntimeState, deltaMs: number): PreviewRuntimeState {
  if (deltaMs <= 0 || !previewAudioBuses.some((bus) => state.audioMix.fades[bus] !== null)) {
    return state;
  }
  const audioMix = structuredClone(state.audioMix);
  const frameDurationMs = 1000 / 60;
  let changed = false;
  previewAudioBuses.forEach((bus) => {
    const fade = audioMix.fades[bus];
    if (!fade) return;
    const totalElapsedMs = fade.elapsedMs + deltaMs;
    const elapsedFrames = Math.floor((totalElapsedMs + 0.0001) / frameDurationMs);
    if (elapsedFrames <= 0) {
      fade.elapsedMs = totalElapsedMs;
      changed = true;
      return;
    }
    const remainingFrames = Math.max(0, fade.remainingFrames - elapsedFrames);
    const progressedFrames = fade.totalFrames - remainingFrames;
    audioMix.volumes[bus] = remainingFrames === 0
      ? fade.target
      : Math.max(0, Math.min(15, fade.start + Math.trunc((fade.target - fade.start) * progressedFrames / fade.totalFrames)));
    audioMix.fades[bus] = remainingFrames === 0
      ? null
      : {
          ...fade,
          remainingFrames,
          elapsedMs: totalElapsedMs - elapsedFrames * frameDurationMs
        };
    changed = true;
  });
  return changed ? { ...state, audioMix } : state;
}

function tickPreviewFrameClock(state: PreviewRuntimeState, deltaMs: number): PreviewRuntimeState {
  if (deltaMs <= 0) return state;
  const frameDurationMs = 1000 / 60;
  const elapsed = state.previewFrameElapsedMs + deltaMs;
  const advancedFrames = Math.floor((elapsed + 0.0001) / frameDurationMs);
  if (advancedFrames <= 0) {
    return elapsed === state.previewFrameElapsedMs ? state : { ...state, previewFrameElapsedMs: elapsed };
  }
  const previewFrame = state.previewFrame + advancedFrames;
  return {
    ...state,
    previewFrame,
    rtc: state.rtc ? previewRuntimeRtcAtFrame(previewFrame) : null,
    previewFrameElapsedMs: elapsed - advancedFrames * frameDurationMs
  };
}

function tickPreviewSceneTransition(state: PreviewRuntimeState, frameDelta: number): PreviewRuntimeState {
  const transition = state.sceneTransition;
  if (!transition || frameDelta <= 0) return state;
  const elapsedFrames = Math.min(transition.durationFrames, transition.elapsedFrames + frameDelta);
  if (elapsedFrames >= transition.durationFrames) {
    return {
      ...state,
      camera: {
        ...state.camera,
        fade: null
      },
      sceneTransition: null
    };
  }
  return {
    ...state,
    sceneTransition: {
      ...transition,
      elapsedFrames,
      progress: elapsedFrames / Math.max(1, transition.durationFrames)
    }
  };
}

function previewSceneTypePaused(state: PreviewRuntimeState): boolean {
  return state.pausedSceneTypes[state.currentRoom?.sceneType ?? ""] === true;
}

function previewScriptPending(state: PreviewRuntimeState): boolean {
  return state.scriptWaitFrames > 0 || state.scriptContinuations.length > 0 || state.scriptQueue.length > 0;
}

function runTopdownPortalOverlap(state: PreviewRuntimeState): PreviewRuntimeState {
  const room = state.currentRoom;
  const player = state.player;
  if (room?.sceneType !== "topdown" || !player || previewSceneTypePaused(state)
    || previewScriptPending(state) || isPreviewDebuggerBlocking(state) || state.activeDialogue
    || state.startMenu.visible || state.sceneMenu.visible || state.battleMenu.visible || state.textInput.active) return state;
  const editor = isRecord(state.project.editorState) ? state.project.editorState : {};
  const connections = Array.isArray(editor.scenaConnections) ? editor.scenaConnections.filter(isRecord) : [];
  const settings = isRecord(state.project.settings) ? state.project.settings : {};
  const size = buildEngineTopdownActorSizePx(isRecord(settings.topdown) ? settings.topdown : {}) / gbaTileSizePx;
  const animations = projectArray(state.project, "animations").filter(animation => animation.spriteSheet === player.spriteSheet);
  const animation = animations.find(candidate => candidate.name === player.animationName) ?? animations[0];
  // check_portal_hits uses the native player's size, without its collision offset.
  const width = animation ? Math.max(1, integerField(animation.hitboxWidth, size * gbaTileSizePx)) / gbaTileSizePx : size;
  const height = animation ? Math.max(1, integerField(animation.hitboxHeight, size * gbaTileSizePx)) / gbaTileSizePx : size;
  for (const connection of connections) {
    if (!campaignRoomReferenceMatches(connection.from, room)) continue;
    const target = state.rooms.find(candidate => campaignRoomReferenceMatches(connection.to, candidate));
    if (!target) continue;
    const fallback = defaultRoomConnectionExitArea(room.width, room.height);
    const area = isRecord(connection.exit) ? connection.exit : {};
    const exit = {
      x: integerField(area.x, fallback.x), y: integerField(area.y, fallback.y),
      width: integerField(area.width, fallback.width), height: integerField(area.height, fallback.height)
    };
    if (!(player.x < exit.x + exit.width && player.x + width > exit.x
      && player.y < exit.y + exit.height && player.y + height > exit.y)) continue;
    const entry = isRecord(connection.entry) ? connection.entry : {};
    const defaultEntry = defaultRoomConnectionEntryArea(target.width, target.height);
    const arrival = roomConnectionArrival({
      x: integerField(entry.x, defaultEntry.x), y: integerField(entry.y, defaultEntry.y),
      width: integerField(entry.width, defaultEntry.width), height: integerField(entry.height, defaultEntry.height)
    }, target.width, target.height, target.collisionTypes);
    const eventName = nullableString(connection.eventName);
    const record = eventName ? eventRecords(state.project).get(eventName) : null;
    if (eventName && !record) return appendUnsupported(state, eventName, "portal", `Evento do portal não encontrado: ${eventName}.`);
    let commands = record ? eventCommands(record.event, state.project).filter(command => commandTokens(command)[0] !== "noop") : [];
    const transition = Object.hasOwn(connection, "transition") ? normalizeSceneTransition(connection.transition)
      : sceneTransitionFromProjectSettings(settings.transitions);
    const visual = sceneTransitionUsesVisualEffect(transition);
    const warp = `change_scene ${target.name} ${arrival.x} ${arrival.y} ${arrival.direction}`;
    const crossesRuntime = target.sceneType !== "topdown";
    const hasRuntimeWarp = commands.some(command => {
      const [verb, destination] = commandTokens(command);
      return verb === "change_scene" && state.rooms.some(candidate => candidate.name === destination && candidate.sceneType !== "topdown");
    });
    if ((crossesRuntime && !hasRuntimeWarp) || (!commands.length && visual)) commands = [...commands, warp];
    if (visual && !commands.some(command => ["fade_in", "fade_out", "visual_effect"].includes(commandTokens(command)[0]!))) {
      const effect = transition.style === "fade" ? "fade" : sceneTransitionVisualEffect(transition) ?? "clear";
      commands = [
        ...(transition.fadeOut ? [`visual_effect ${effect} all ${transition.durationFrames} 100 cover`, `wait ${transition.durationFrames}`] : []),
        ...commands,
        ...(transition.fadeIn ? [`visual_effect ${effect} all ${transition.durationFrames} 100 reveal`] : [])
      ];
    }
    if (!commands.length) {
      // Direct native portals call apply_warp without room exit/enter consumers.
      const entered = setCurrentRoom(state, target, false);
      return updateRuntimeActor(entered, "player", actor => ({ ...actor, ...arrival }));
    }
    const source = roomRecordByRuntimeRoom(state.project, room);
    const exitEvent = state.adventureCallbacks[2] ?? (source ? eventBinding(source, "onExit") : null);
    const queued = queuePreviewCallback(state, exitEvent, false);
    return queuePreviewScript(queued, {
      eventName: record?.name ?? `portal:${nullableString(connection.id) ?? room.name}`,
      commands, triggerRoomEnter: true
    });
  }
  return state;
}

function resumeWaitingPreviewScripts(state: PreviewRuntimeState, advancedFrames: number): PreviewRuntimeState {
  let remainingFrames = advancedFrames;
  let next = state;
  let queuedScriptsStarted = 0;
  while (!isPreviewDebuggerBlocking(next) && !next.activeDialogue && !next.nativeEvents.modal) {
    if (next.scriptWaitFrames > remainingFrames) {
      return { ...next, scriptWaitFrames: next.scriptWaitFrames - remainingFrames };
    }
    remainingFrames -= next.scriptWaitFrames;
    next = { ...next, scriptWaitFrames: 0 };
    const continuation = next.scriptContinuations[0];
    if (continuation) {
      if (next.debugger.stepPending && continuation.commandIndex <= continuation.commands.length) {
        return pausePreviewDebugger({ ...next, scriptContinuations: next.scriptContinuations.slice(1) }, continuation,
          `Step em ${continuation.resolvedEventName} linha ${continuation.commandIndex}`);
      }
      next = runScriptFrame({ ...next, scriptContinuations: next.scriptContinuations.slice(1) }, continuation);
      continue;
    }
    const script = next.scriptQueue[0];
    if (script) {
      // Callback cycles must yield to the next tick instead of blocking the editor.
      if (queuedScriptsStarted++ >= 32) return next;
      const ready = { ...next, scriptQueue: next.scriptQueue.slice(1) };
      next = typeof script === "string" ? runEvent(ready, script)
        : runEvent(ready, script.eventName, [], script.triggerRoomEnter, script.commands);
      continue;
    }
    return next;
  }
  return next;
}

export function tickPreviewRuntime(
  state: PreviewRuntimeState,
  deltaMs: number,
  heldMovement: PreviewRuntimeAction | null = null,
  heldActions: PreviewRuntimeAction[] = []
): PreviewRuntimeState {
  if (isPreviewDebuggerBlocking(state)) {
    return updateDebug(state);
  }

  const previousPreviewFrame = state.previewFrame;
  const topdownScriptWasActive = state.currentRoom?.sceneType === "topdown" && previewScriptPending(state);
  state = tickPreviewFrameClock(tickPreviewAudioMix(state, deltaMs), deltaMs);
  if (state.hud.gameClock && state.hud.gameClock.frames > 0) {
    const clock = state.hud.gameClock;
    const elapsed = clock.elapsedFrames + state.previewFrame - previousPreviewFrame;
    state = { ...state, hud: { ...state.hud, gameClock: { ...clock,
      currentMinute: (clock.currentMinute + Math.floor(elapsed / clock.frames) * clock.minutes) % 1440,
      elapsedFrames: elapsed % clock.frames } } };
  }
  state = tickIntegratedNativeSimulation(state,state.previewFrame-previousPreviewFrame);
  if(state.currentRoom?.sceneType==="topdown" && state.nativeEvents.adventure.state==="blank") heldMovement=null;
  state = resumeWaitingPreviewScripts(state, state.previewFrame - previousPreviewFrame);
  state = tickPreviewSceneTransition(state, state.previewFrame - previousPreviewFrame);
  state = tickPreviewSceneMenu(state, state.previewFrame - previousPreviewFrame);
  state = applyPointClickCursorAnimation(state);

  if (state.currentRoom?.sceneType === "isometric" && state.player) {
    const heldDirection = heldMovement && isPreviewMovementAction(heldMovement)
      ? isometricDirectionForAction(heldMovement)
      : null;
    if (!heldDirection) {
      state = applyIsometricPlayerAnimation(state, "idle", state.player.direction);
    }
  }

  if (state.currentRoom?.sceneType === "racing") {
    const config = racingSceneConfigFromRuntime(state.currentRoom.runtime);
    const seconds = Math.max(0, deltaMs) / 1000;
    const vehicleSpeed = heldMovement === "up"
      ? Math.min(config?.maxSpeed ?? 4, state.vehicleSpeed + (config?.acceleration ?? 8) * seconds)
      : heldMovement === "down"
        ? Math.max(0, state.vehicleSpeed - (config?.brakePower ?? 12) * seconds)
        : state.vehicleSpeed;
    if (vehicleSpeed !== state.vehicleSpeed) state = { ...state, vehicleSpeed };
  }

  let nextState = state;
  let nextVisualEffect = state.visualEffect;

  if (nextVisualEffect && deltaMs > 0) {
    const frameDurationMs = 1000 / 60;
    const totalElapsedMs = nextVisualEffect.elapsedMs + deltaMs;
    const elapsedFrames = Math.floor(totalElapsedMs / frameDurationMs);
    if (elapsedFrames > 0) {
      const remainingFrames = Math.max(0, nextVisualEffect.remainingFrames - elapsedFrames);
      nextVisualEffect = remainingFrames === 0
        ? null
        : {
            ...nextVisualEffect,
            remainingFrames,
            elapsedMs: totalElapsedMs - elapsedFrames * frameDurationMs
          };
    }
  }

  const platformerPreviewActive = state.currentRoom?.sceneType === "platformer"
    && state.currentRoom.platformerPreviewEnabled
    && state.player
    && !state.activeDialogue
    && !state.startMenu.visible
    && !state.sceneMenu.visible
    && !state.battleMenu.visible;
  const platformerFrameDelta = state.previewFrame - previousPreviewFrame;

  if (platformerPreviewActive && !previewSceneTypePaused(state)) {
    nextState = tickPlatformerPreview(state, platformerFrameDelta, heldMovement, heldActions);
    nextState = { ...nextState, movementElapsedMs: 0 };
  } else if (
    heldMovement &&
    isPreviewMovementAction(heldMovement) &&
    !state.activeDialogue &&
    !state.startMenu.visible &&
    !state.sceneMenu.visible &&
    !state.battleMenu.visible &&
    state.currentRoom &&
    state.player
    && !previewSceneTypePaused(state)
    && !topdownScriptWasActive && !(state.currentRoom.sceneType === "topdown" && previewScriptPending(state))
  ) {
    if (isometricFreeMovementEnabled(state.currentRoom)) {
      nextState = tryMovePreviewPlayerContinuously(state, heldMovement, deltaMs);
      nextState = { ...nextState, movementElapsedMs: 0 };
    } else {
      const settings = isRecord(state.project.settings) ? state.project.settings : {};
      const topdown = isRecord(settings.topdown) ? settings.topdown : {};
      const platformerConfig = platformerSceneConfigFromRuntime(state.currentRoom.runtime);
      const pointClickConfig = pointClickSceneConfigFromRuntime(state.currentRoom.runtime);
      const shmupConfig = shmupSceneConfigFromRuntime(state.currentRoom.runtime);
      const dungeonConfig = dungeonCrawlerSceneConfigFromRuntime(state.currentRoom.runtime);
      const racingConfig = racingSceneConfigFromRuntime(state.currentRoom.runtime);
      const battleConfig = battleRpgSceneConfigFromRuntime(state.currentRoom.runtime);
      const movementSpeed = state.currentRoom.sceneType === "racing"
        ? (heldMovement === "left" || heldMovement === "right" ? racingConfig?.steeringSpeed : state.vehicleSpeed)
        : state.currentRoom.sceneType === "platformer"
        ? platformerConfig?.walkSpeed
        : state.currentRoom.sceneType === "pointAndClick"
          ? pointClickConfig?.cursorSpeed
          : state.currentRoom.sceneType === "shmup"
            ? shmupConfig?.playerSpeed
          : buildEngineTopdownPlayerSpeed(topdown);
      const stepMs = state.currentRoom.sceneType === "battleRpg"
        ? Math.max(1, battleConfig?.turnDelayFrames ?? 20) * (1000 / 60)
        : state.currentRoom.sceneType === "dungeonCrawler"
        ? (heldMovement === "left" || heldMovement === "right" ? dungeonConfig?.turnDurationMs : dungeonConfig?.stepDurationMs) ?? 180
        : previewPlayerMovementStepMs(movementSpeed);
      const elapsed = state.movementElapsedMs + deltaMs;
      if (elapsed >= stepMs) {
        nextState = state.currentRoom.sceneType === "battleRpg"
          ? (heldMovement === "left" || heldMovement === "right"
              ? { ...state, battleTargetIndex: (state.battleTargetIndex + (heldMovement === "right" ? 1 : -1) + (battleConfig?.maxEnemies ?? 4)) % (battleConfig?.maxEnemies ?? 4) }
              : state)
          : state.currentRoom.sceneType === "dungeonCrawler"
          ? applyDungeonCrawlerMovement(state, heldMovement, dungeonConfig?.allowBackstep ?? true)
          : state.currentRoom.sceneType === "racing" && heldMovement === "down"
            ? state
            : tryMovePreviewPlayer(state, heldMovement);
        nextState = { ...nextState, movementElapsedMs: elapsed % stepMs };
      } else {
        nextState = elapsed === state.movementElapsedMs ? state : { ...state, movementElapsedMs: elapsed };
      }
    }
  } else if (state.movementElapsedMs !== 0) {
    nextState = { ...state, movementElapsedMs: 0 };
  }

  if (nextState.visualEffect !== nextVisualEffect) {
    nextState = { ...nextState, visualEffect: nextVisualEffect };
  }

  nextState = applyPointClickCursorAnimation(nextState);

  if (!nextState.activeDialogue && !nextState.startMenu.visible && !nextState.sceneMenu.visible && deltaMs > 0) {
    const actorUpdateElapsed = nextState.actorUpdateElapsedMs + deltaMs;
    if (actorUpdateElapsed >= PREVIEW_ACTOR_UPDATE_INTERVAL_MS) {
      const remainder = actorUpdateElapsed % PREVIEW_ACTOR_UPDATE_INTERVAL_MS;
      nextState = runActorUpdateScripts({ ...nextState, actorUpdateElapsedMs: remainder });
    } else if (actorUpdateElapsed !== nextState.actorUpdateElapsedMs) {
      nextState = { ...nextState, actorUpdateElapsedMs: actorUpdateElapsed };
    }
  }

  nextState = tickLutaPreviewVisualStates(
    nextState,
    deltaMs,
    nextState.previewFrame - previousPreviewFrame,
    heldMovement
  );
  nextState = applyPreviewTopdownQuest(nextState);
  if (!topdownScriptWasActive && deltaMs > 0) nextState = runTopdownPortalOverlap(nextState);

  if (nextState.currentRoom?.sceneType === "luta") {
    if (nextState.lutaCombat && !nextState.activeDialogue && !nextState.startMenu.visible)
      nextState = { ...nextState, lutaCombat: tickLutaCombat(nextState.lutaCombat, nextState.previewFrame - previousPreviewFrame) };
    return updateDebug(nextState);
  }

  if (!nextState.player?.spriteSheet || deltaMs <= 0) {
    return nextState;
  }

  const frameCount = animationFrameCount(nextState.project, nextState.player.spriteSheet, nextState.player.animationName);
  if (nextState.currentRoom?.sceneType === "pointAndClick" && nextState.player.animationName === pointClickCursorAnimationName(nextState, "click")) {
    const frameDuration = pointClickCursorFrameDurationMs(nextState);
    const elapsed = nextState.animationElapsedMs + deltaMs;
    if (elapsed >= frameCount * frameDuration) return applyPointClickCursorAnimation({ ...nextState, animationElapsedMs: elapsed });
    const index = Math.min(frameCount - 1, Math.floor(elapsed / frameDuration));
    return updateDebug({ ...nextState, animationElapsedMs: elapsed, playerAnimationFrameIndex: index,
      player: applyPlayerAnimationFrame(nextState.project, nextState.player, index) });
  }
  if (frameCount <= 1) {
    return nextState;
  }

  const fps = nextState.player.animationFrame?.fps ?? 6;
  const frameDurationMs = 1000 / Math.max(1, fps);
  const nextElapsed = nextState.animationElapsedMs + deltaMs;
  const nextIndex = Math.floor(nextElapsed / frameDurationMs) % frameCount;

  if (nextIndex === nextState.playerAnimationFrameIndex && nextElapsed - nextState.animationElapsedMs < frameDurationMs) {
    return nextElapsed === nextState.animationElapsedMs ? nextState : { ...nextState, animationElapsedMs: nextElapsed };
  }

  return updateDebug({
    ...nextState,
    animationElapsedMs: nextElapsed,
    playerAnimationFrameIndex: nextIndex,
    player: applyPlayerAnimationFrame(nextState.project, nextState.player, nextIndex)
  });
}

function applyPreviewCameraZone(state: PreviewRuntimeState): PreviewRuntimeState {
  if (!state.currentRoom || !state.player) return state;
  const zone = state.currentRoom.cameraZones.find(({ area }) => (
    state.player!.x >= area.x &&
    state.player!.y >= area.y &&
    state.player!.x < area.x + area.width &&
    state.player!.y < area.y + area.height
  ));
  if (!zone) {
    if (state.activeCameraZoneID === null) return state;
    return {
      ...state,
      activeCameraZoneID: null,
      camera: { ...state.camera, bounds: null }
    };
  }

  const bounds = {
    minX: zone.bounds.x,
    minY: zone.bounds.y,
    maxX: zone.bounds.x + zone.bounds.width,
    maxY: zone.bounds.y + zone.bounds.height
  };
  const isometric = state.currentRoom.sceneType === "isometric";
  const isometricConfig = isometricSceneConfigFromRuntime(state.currentRoom.runtime);
  const isometricCamera = isometric && isometricConfig
    ? deriveIsometricCameraPositionForPlayer({
      config: isometricConfig,
      player: state.player,
      zones: state.currentRoom.cameraZones
    })
    : null;
  const playerPixels = isometricConfig
    ? projectIsometricCoordinate({ x: state.player.x, y: state.player.y, z: state.player.z }, isometricConfig)
    : { x: state.player.x * gbaTileSizePx, y: state.player.y * gbaTileSizePx };
  const rawX = isometricCamera?.cameraX ?? (zone.lockX ? zone.bounds.x + zone.offset.x : playerPixels.x + zone.offset.x);
  const rawY = isometricCamera?.cameraY ?? (zone.lockY ? zone.bounds.y + zone.offset.y : playerPixels.y + zone.offset.y);
  const minX = zone.bounds.width > 240
    ? zone.bounds.x
    : isometric ? zone.bounds.x + Math.floor(zone.bounds.width / 2) - 120 : zone.bounds.x;
  const minY = zone.bounds.height > 160
    ? zone.bounds.y
    : isometric ? zone.bounds.y + Math.floor(zone.bounds.height / 2) - 80 : zone.bounds.y;
  const maxX = zone.bounds.width > 240 ? zone.bounds.x + zone.bounds.width - 240 : minX;
  const maxY = zone.bounds.height > 160 ? zone.bounds.y + zone.bounds.height - 160 : minY;
  const nextState = {
    ...state,
    activeCameraZoneID: zone.id,
    camera: {
      ...state.camera,
      bounds,
      followPlayer: true,
      x: Math.max(minX, Math.min(maxX, rawX)),
      y: Math.max(minY, Math.min(maxY, rawY))
    }
  };
  return nextState;
}

function applyPlatformerPreviewCamera(state: PreviewRuntimeState): PreviewRuntimeState {
  if (!state.currentRoom?.platformerPreviewEnabled || !state.player || !state.platformerPhysics) return state;
  const config = platformerSceneConfigFromRuntime(state.currentRoom.runtime);
  if (!config) return state;

  const viewportWidth = 240;
  const viewportHeight = 160;
  const roomWidth = state.currentRoom.width * gbaTileSizePx;
  const roomHeight = state.currentRoom.height * gbaTileSizePx;
  const minimumX = Math.max(0, Math.min(roomWidth - viewportWidth, state.camera.bounds?.minX ?? 0));
  const maximumX = Math.max(minimumX, Math.min(roomWidth - viewportWidth, state.camera.bounds?.maxX ?? roomWidth - viewportWidth));
  const minimumY = Math.max(0, Math.min(roomHeight - viewportHeight, state.camera.bounds?.minY ?? 0));
  const maximumY = Math.max(minimumY, Math.min(roomHeight - viewportHeight, state.camera.bounds?.maxY ?? roomHeight - viewportHeight));
  const deadzone = Math.max(0, config.cameraDeadzoneX) / 2;
  const playerCenterX = state.platformerPhysics.x + state.platformerPhysics.width / 2;
  const playerCenterY = state.platformerPhysics.y + state.platformerPhysics.height / 2;
  let x = state.camera.x;
  let y = state.camera.y;
  const followRight = (config.cameraFollow & 1) !== 0 && config.cameraLockEdge !== "right";
  const followLeft = (config.cameraFollow & 2) !== 0 && config.cameraLockEdge !== "left";
  const followDown = (config.cameraFollow & 4) !== 0;
  const followUp = (config.cameraFollow & 8) !== 0;

  if (followRight && playerCenterX > x + viewportWidth - deadzone) x = playerCenterX - viewportWidth + deadzone;
  if (followLeft && playerCenterX < x + deadzone) x = playerCenterX - deadzone;
  if (followDown && playerCenterY > y + viewportHeight) y = playerCenterY - viewportHeight;
  if (followUp && playerCenterY < y) y = playerCenterY;

  return {
    ...state,
    camera: {
      ...state.camera,
      followPlayer: true,
      x: Math.max(minimumX, Math.min(maximumX, x)),
      y: Math.max(minimumY, Math.min(maximumY, y))
    }
  };
}

function tickPlatformerPreview(
  state: PreviewRuntimeState,
  frameDelta: number,
  heldMovement: PreviewRuntimeAction | null,
  heldActions: PreviewRuntimeAction[]
): PreviewRuntimeState {
  if (!state.currentRoom?.platformerPreviewEnabled || !state.player) return state;
  const config = platformerSceneConfigFromRuntime(state.currentRoom.runtime);
  if (!config) return state;
  let body = state.platformerPhysics ?? platformerPreviewBodyForRoom(state.project, state.currentRoom, state.player);
  if (!body) return state;
  const requests = state.platformerInputRequests;
  const jumpHeld = heldActions.includes("action");
  const dashHeld = heldActions.includes("back");
  const map: PlatformerPreviewMap = {
    width: state.currentRoom.width,
    height: state.currentRoom.height,
    collisionTypes: state.currentRoom.collisionTypes
  };

  let nextState = state;
  for (let frame = 0; frame < frameDelta; frame += 1) {
    const input: PlatformerPreviewInput = {
      left: heldMovement === "left",
      right: heldMovement === "right",
      up: heldMovement === "up",
      down: heldMovement === "down",
      jumpPressed: frame === 0 && (requests.jump || jumpHeld),
      jumpHeld,
      dashPressed: frame === 0 && (requests.dash || dashHeld),
      glideHeld: heldActions.includes("select")
    };
    const wasOnGround = body.onGround;
    body = nextState.platformerPlayerActive ? stepPlatformerPreview(body, input, config, map)
      : nextState.platformerState === "blank"
        ? stepPlatformerBlankPreview(body, Number(engineFieldValue(nextState, "plat_blank_grav")), config, map) : body;
    const player = nextState.player
      ? {
          ...nextState.player,
          x: (body.x - body.collisionOffsetX) / gbaTileSizePx,
          y: (body.y - body.collisionOffsetY) / gbaTileSizePx,
          direction: body.facing
        }
      : nextState.player;
    nextState = applyPlatformerPreviewCamera({
      ...nextState,
      player,
      platformerPhysics: body
    });
    if (body.onGround !== wasOnGround) nextState = transitionPreviewPlatformerState(nextState, body.onGround ? "ground" : "fall");
  }

  const cleared = {
    ...nextState,
    platformerInputRequests: { jump: false, dash: false }
  };
  return applyPreviewCameraZone(runTriggerOverlap(cleared));
}

function isometricDirectionForAction(action: PreviewRuntimeAction): string | null {
  return ({
    left: "down-left",
    right: "down-right",
    up: "up-right",
    down: "up-left"
  } as Partial<Record<PreviewRuntimeAction, string>>)[action] ?? null;
}

function applyIsometricPlayerAnimation(
  state: PreviewRuntimeState,
  animationState: "idle" | "walk",
  direction: string
): PreviewRuntimeState {
  if (state.currentRoom?.sceneType !== "isometric" || !state.player?.spriteSheet) return state;
  const animations = projectArray(state.project, "animations");
  const actor = projectArray(state.project, "actors").find((candidate) => nullableString(candidate.id) === state.player?.id);
  const animationStates = projectArray(state.project, "animationStates").flatMap((candidate): SpriteStateContract[] => {
    const id = nullableString(candidate.id);
    const name = nullableString(candidate.name);
    const spriteSheet = nullableString(candidate.spriteSheet);
    if (!id || !name || !spriteSheet || !isSpriteAnimationType(candidate.animationType) || !Array.isArray(candidate.animationIDs)) {
      return [];
    }
    return [{
      id,
      name,
      spriteSheet,
      animationType: candidate.animationType,
      mirrorLeftFromRight: candidate.mirrorLeftFromRight === true,
      animationIDs: candidate.animationIDs.filter((value): value is string => typeof value === "string")
    }];
  });
  const selectedState = resolveSpriteStateForActor(animationStates, {
    animationStateID: nullableString(actor?.animationStateID),
    spriteSheet: state.player.spriteSheet
  });
  const normalizedAnimationID = selectedState
    ? normalizeSpriteStateSlots(
        selectedState,
        animations.flatMap((candidate) => {
          const id = nullableString(candidate.id);
          return id ? [{
            id,
            name: nullableString(candidate.name) ?? undefined,
            state: nullableString(candidate.state),
            direction: nullableString(candidate.direction),
            spriteSheet: nullableString(candidate.spriteSheet) ?? undefined
          }] : [];
        }),
        "isometric"
      ).slots[`${animationState === "walk" ? "moving" : "idle"}_${normalizeSpriteDirection(direction, "isometric")}`].animationID
    : null;
  const normalizedAnimation = normalizedAnimationID
    ? animations.find((candidate) => nullableString(candidate.id) === normalizedAnimationID)
    : undefined;
  const animation = normalizedAnimation ?? animations.find((candidate) => (
    nullableString(candidate.spriteSheet) === state.player?.spriteSheet &&
    nullableString(candidate.state) === animationState &&
    nullableString(candidate.direction) === direction
  ));
  const animationName = nullableString(animation?.name);
  if (!animationName) {
    return state.player.direction === direction
      ? state
      : { ...state, player: { ...state.player, direction } };
  }
  if (state.player.direction === direction && state.player.animationName === animationName) {
    return state;
  }
  return {
    ...state,
    playerAnimationFrameIndex: 0,
    animationElapsedMs: 0,
    player: {
      ...state.player,
      direction,
      animationName,
      animationFrame: spriteFrameForActor(state.project, state.player.spriteSheet, animationName)
    }
  };
}

function tryMovePreviewPlayer(state: PreviewRuntimeState, action: PreviewRuntimeAction): PreviewRuntimeState {
  if (!state.currentRoom || !state.player || state.activeDialogue) {
    return updateDebug(state);
  }

  const isometricDirection = state.currentRoom.sceneType === "isometric"
    ? isometricDirectionForAction(action)
    : null;
  const room = state.currentRoom;
  const player = state.player;
  if (!room || !player) return updateDebug(state);
  const delta = room.sceneType === "isometric"
    ? ({
        up: { x: 0, y: -1 },
        down: { x: -1, y: 0 },
        left: { x: 0, y: 1 },
        right: { x: 1, y: 0 }
      }[action as "up" | "down" | "left" | "right"])
    : ({
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 }
      }[action as "up" | "down" | "left" | "right"]);

  const nextX = player.x + delta.x;
  const nextY = player.y + delta.y;
  if (isBlocked(room, nextX, nextY)) {
    return updateDebug(isometricDirection
      ? applyIsometricPlayerAnimation(state, "idle", isometricDirection)
      : state);
  }
  const nextZ = room.sceneType === "isometric"
    ? room.heightLevels[nextY * room.width + nextX] ?? 0
    : player.z;
  if (room.sceneType === "isometric" && Math.abs(nextZ - player.z) > 1) {
    return updateDebug(isometricDirection
      ? applyIsometricPlayerAnimation(state, "idle", isometricDirection)
      : state);
  }

  const movedState = updateDebug({
    ...state,
    player: {
      ...player,
      x: nextX,
      y: nextY,
      z: nextZ
    }
  });
  const animatedState = isometricDirection
    ? applyIsometricPlayerAnimation(movedState, "walk", isometricDirection)
    : movedState;
  return applyPreviewCameraZone(runTopdownPortalOverlap(runTriggerOverlap(animatedState)));
}

function tryMovePreviewPlayerContinuously(
  state: PreviewRuntimeState,
  action: PreviewRuntimeAction,
  deltaMs: number
): PreviewRuntimeState {
  if (!state.currentRoom || !state.player || state.activeDialogue || deltaMs <= 0) {
    return updateDebug(state);
  }

  const isometricDirection = isometricDirectionForAction(action);
  if (!isometricDirection) return updateDebug(state);
  const room = state.currentRoom;
  const player = state.player;
  const delta = ({
    up: { x: 0, y: -1 },
    down: { x: -1, y: 0 },
    left: { x: 0, y: 1 },
    right: { x: 1, y: 0 }
  } as const)[action as "up" | "down" | "left" | "right"];
  if (!delta) return updateDebug(state);

  let x = player.x;
  let y = player.y;
  let z = player.z;
  let remaining = Math.max(0, deltaMs) / 1000 * previewIsometricFreeMovementSpeedTilesPerSecond;
  let moved = false;

  while (remaining > 0) {
    const step = Math.min(remaining, previewIsometricFreeMovementStepTiles);
    const nextX = x + delta.x * step;
    const nextY = y + delta.y * step;
    const nextTileX = Math.floor(nextX);
    const nextTileY = Math.floor(nextY);
    const currentTileX = Math.floor(x);
    const currentTileY = Math.floor(y);
    const changedTile = nextTileX !== currentTileX || nextTileY !== currentTileY;
    const nextZ = changedTile
      ? room.heightLevels[nextTileY * room.width + nextTileX] ?? 0
      : z;

    if (isBlocked(room, nextTileX, nextTileY)
      || (changedTile && Math.abs(nextZ - z) > 1)
      || (changedTile && !isometricRampAllowsTransition(
        room,
        currentTileX,
        currentTileY,
        nextTileX,
        nextTileY,
        delta,
        z,
        nextZ
      ))) {
      break;
    }

    x = nextX;
    y = nextY;
    z = nextZ;
    moved = true;
    remaining -= step;
  }

  const movedState = updateDebug({
    ...state,
    player: {
      ...player,
      x,
      y,
      z
    }
  });
  const animatedState = applyIsometricPlayerAnimation(
    movedState,
    moved ? "walk" : "idle",
    isometricDirection
  );
  return applyPreviewCameraZone(runTriggerOverlap(animatedState));
}

function applyDungeonCrawlerMovement(
  state: PreviewRuntimeState,
  action: PreviewRuntimeAction,
  allowBackstep: boolean
): PreviewRuntimeState {
  if (!state.player) return updateDebug(state);
  const foundIndex = DUNGEON_DIRECTIONS.indexOf(state.player.direction as typeof DUNGEON_DIRECTIONS[number]);
  const facingIndex = foundIndex >= 0 ? foundIndex : 0;
  if (action === "left" || action === "right") {
    const offset = action === "right" ? 1 : -1;
    const direction = DUNGEON_DIRECTIONS[(facingIndex + offset + 4) % 4]!;
    const turned = updateDebug({ ...state, player: { ...state.player, direction } });
    return updateDebug({
      ...turned,
      dungeonInteraction: updateDungeonCompass(turned, turned.dungeonInteraction)
    });
  }
  if (action === "down" && !allowBackstep) return updateDebug(state);
  const directionIndex = action === "down" ? (facingIndex + 2) % 4 : facingIndex;
  const moved = tryMovePreviewPlayer(state, DUNGEON_DIRECTIONS[directionIndex]!);
  if (!moved.player || moved.player.x === state.player.x && moved.player.y === state.player.y) return moved;
  const feature = dungeonFeatureRuntimeForState(moved);
  if (!feature?.mapEnabled) return moved;
  const exploredCells = Array.from(new Set([
    ...moved.dungeonInteraction.exploredCells,
    dungeonCellKey(moved.player.x, moved.player.y)
  ]));
  return updateDebug({
    ...moved,
    dungeonInteraction: updateDungeonCompass(moved, {
      ...moved.dungeonInteraction,
      exploredCells
    })
  });
}

function dungeonForwardDelta(direction: string | null | undefined): { x: number; y: number } {
  const index = Math.max(0, DUNGEON_DIRECTIONS.indexOf(direction as typeof DUNGEON_DIRECTIONS[number]));
  return [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
  ][index] ?? { x: 0, y: -1 };
}

function dungeonActorAhead(state: PreviewRuntimeState): PreviewRuntimeActor | null {
  if (!state.player || state.currentRoom?.sceneType !== "dungeonCrawler") return null;
  const feature = dungeonFeatureRuntimeForState(state);
  const enemyName = feature?.battle?.enemyActor;
  if (!enemyName) return null;
  const forward = dungeonForwardDelta(state.player.direction);
  const viewDistance = dungeonCrawlerSceneConfigFromRuntime(state.currentRoom.runtime)?.viewDistance ?? 5;
  return state.actors.find((actor) => {
    if (actor.name !== enemyName || actor.roomName !== state.currentRoom?.name || !actor.active || !actor.visible) return false;
    const deltaX = actor.x - state.player!.x;
    const deltaY = actor.y - state.player!.y;
    return deltaX * forward.x + deltaY * forward.y > 0
      && deltaX * forward.x + deltaY * forward.y <= viewDistance
      && deltaX * forward.y - deltaY * forward.x === 0;
  }) ?? null;
}

function startDungeonBattle(state: PreviewRuntimeState): PreviewRuntimeState {
  const feature = dungeonFeatureRuntimeForState(state);
  if (!feature?.battleEnabled || !feature.battle || state.dungeonInteraction.enemyDefeated || !dungeonActorAhead(state)) {
    return updateDebug(state);
  }
  const playerHp = state.dungeonInteraction.explorationPlayerHp;
  return updateDebug({
    ...state,
    dungeonHud: { visible: true, panel: "map" },
    dungeonInteraction: updateDungeonCompass(state, {
      ...state.dungeonInteraction,
      mode: "battle",
      selectedIndex: 0,
      notice: null,
      noticeReturnsToBattle: false,
      enemyHp: feature.battle.maxHp,
      playerHp
    }, playerHp)
  });
}

function openDungeonInventory(state: PreviewRuntimeState): PreviewRuntimeState {
  const feature = dungeonFeatureRuntimeForState(state);
  if (!feature?.inventoryEnabled || !feature.inventory) return updateDebug(state);
  return updateDebug({
    ...state,
    dungeonHud: { visible: true, panel: "items" },
    dungeonInteraction: updateDungeonCompass(state, {
      ...state.dungeonInteraction,
      mode: "inventory",
      selectedIndex: 0,
      notice: null,
      noticeReturnsToBattle: false
    })
  });
}

function openDungeonMap(state: PreviewRuntimeState): PreviewRuntimeState {
  const room = state.currentRoom;
  if (!room || room.sceneType !== "dungeonCrawler") return updateDebug(state);
  const feature = dungeonFeatureRuntimeForState(state);
  if (!feature?.mapEnabled) return openDungeonInventory(state);
  const limits = dungeonMapScrollLimits(room);
  const mapX = Math.max(0, Math.min(limits.maxX, Math.floor((state.player?.x ?? 0) / 2) - 7));
  const mapY = Math.max(0, Math.min(limits.maxY, Math.floor((state.player?.y ?? 0) / 2) - 1));
  return updateDebug({
    ...state,
    dungeonHud: { visible: true, panel: "map" },
    dungeonInteraction: updateDungeonCompass(state, {
      ...state.dungeonInteraction,
      mode: "map",
      selectedIndex: 0,
      notice: null,
      mapScrollX: mapX,
      mapScrollY: mapY
    })
  });
}

function closeDungeonInteraction(state: PreviewRuntimeState): PreviewRuntimeState {
  return updateDebug({
    ...state,
    dungeonHud: { visible: false, panel: state.dungeonHud.panel },
    dungeonInteraction: updateDungeonCompass(state, {
      ...state.dungeonInteraction,
      mode: "none",
      selectedIndex: 0,
      notice: null,
      noticeReturnsToBattle: false
    })
  });
}

function dungeonNotice(
  state: PreviewRuntimeState,
  notice: string,
  noticeReturnsToBattle = false,
  playerHp = state.dungeonInteraction.playerHp
): PreviewRuntimeState {
  return updateDebug({
    ...state,
    dungeonInteraction: updateDungeonCompass(state, {
      ...state.dungeonInteraction,
      mode: "notice",
      selectedIndex: 0,
      notice,
      noticeReturnsToBattle,
      playerHp
    }, playerHp)
  });
}

function useDungeonInventoryItem(state: PreviewRuntimeState): PreviewRuntimeState {
  const feature = dungeonFeatureRuntimeForState(state);
  const item = feature?.inventory;
  if (!feature?.inventoryEnabled || !item) return closeDungeonInteraction(state);
  const count = dungeonInventoryCount(state, item.item);
  if (count <= 0) return dungeonNotice(state, "SEM CÉLULA.", false, state.dungeonInteraction.explorationPlayerHp);
  const explorationPlayerHp = Math.min(3, state.dungeonInteraction.explorationPlayerHp + item.healAmount);
  return dungeonNotice({
    ...state,
    inventory: {
      ...state.inventory,
      [String(item.item)]: count - 1
    },
    dungeonInteraction: {
      ...state.dungeonInteraction,
      explorationPlayerHp
    }
  }, "CÉLULA USADA.", false, explorationPlayerHp);
}

function advanceDungeonBattle(state: PreviewRuntimeState): PreviewRuntimeState {
  const feature = dungeonFeatureRuntimeForState(state);
  const battle = feature?.battle;
  if (!feature?.battleEnabled || !battle || state.dungeonInteraction.enemyHp <= 0) return closeDungeonInteraction(state);
  const enemyHp = Math.max(0, state.dungeonInteraction.enemyHp - battle.playerDamage);
  if (enemyHp === 0) {
    return dungeonNotice({
      ...state,
      inventory: {
        ...state.inventory,
        [String(battle.rewardItem)]: dungeonInventoryCount(state, battle.rewardItem) + battle.rewardQuantity
      },
      dungeonInteraction: {
        ...state.dungeonInteraction,
        enemyHp,
        enemyDefeated: true,
        explorationPlayerHp: state.dungeonInteraction.playerHp
      }
    }, "VITÓRIA.", false, state.dungeonInteraction.playerHp);
  }
  const playerHp = Math.max(0, state.dungeonInteraction.playerHp - battle.enemyDamage);
  if (playerHp === 0) {
    return dungeonNotice({
      ...state,
      dungeonInteraction: {
        ...state.dungeonInteraction,
        enemyHp,
        playerHp,
        explorationPlayerHp: playerHp
      }
    }, "DERROTA.", false, playerHp);
  }
  return dungeonNotice({
    ...state,
    dungeonInteraction: {
      ...state.dungeonInteraction,
      enemyHp,
      playerHp,
      explorationPlayerHp: playerHp
    }
  }, "CONTRA-ATAQUE.", true, playerHp);
}

function dispatchDungeonInteractionAction(
  state: PreviewRuntimeState,
  action: PreviewRuntimeAction
): PreviewRuntimeState {
  const interaction = state.dungeonInteraction;
  if (interaction.mode === "map") {
    const room = state.currentRoom;
    if (!room) return state;
    const limits = dungeonMapScrollLimits(room);
    const delta = action === "left" ? { x: -1, y: 0 }
      : action === "right" ? { x: 1, y: 0 }
        : action === "up" ? { x: 0, y: -1 }
          : action === "down" ? { x: 0, y: 1 }
            : { x: 0, y: 0 };
    if (delta.x !== 0 || delta.y !== 0) {
      return updateDebug({
        ...state,
        dungeonInteraction: updateDungeonCompass(state, {
          ...interaction,
          mapScrollX: Math.max(0, Math.min(limits.maxX, interaction.mapScrollX + delta.x)),
          mapScrollY: Math.max(0, Math.min(limits.maxY, interaction.mapScrollY + delta.y))
        })
      });
    }
    return action === "action" || action === "back" ? closeDungeonInteraction(state) : updateDebug(state);
  }

  if (interaction.mode === "inventory") {
    if (action === "up" || action === "down") {
      return updateDebug({
        ...state,
        dungeonInteraction: updateDungeonCompass(state, { ...interaction, selectedIndex: interaction.selectedIndex === 0 ? 1 : 0 })
      });
    }
    if (action === "back") return closeDungeonInteraction(state);
    if (action === "action") return interaction.selectedIndex === 0 ? useDungeonInventoryItem(state) : closeDungeonInteraction(state);
    return updateDebug(state);
  }

  if (interaction.mode === "battle") {
    if (action === "up" || action === "down") {
      return updateDebug({
        ...state,
        dungeonInteraction: updateDungeonCompass(state, { ...interaction, selectedIndex: interaction.selectedIndex === 0 ? 1 : 0 })
      });
    }
    if (action === "back") return closeDungeonInteraction(state);
    if (action === "action") {
      if (interaction.selectedIndex === 1) return closeDungeonInteraction(state);
      return advanceDungeonBattle(state);
    }
    return updateDebug(state);
  }

  if (interaction.mode === "notice") {
    if (action === "action" || action === "back") {
      if (interaction.noticeReturnsToBattle && !interaction.enemyDefeated && interaction.playerHp > 0) {
        return updateDebug({
          ...state,
          dungeonInteraction: updateDungeonCompass(state, {
            ...interaction,
            mode: "battle",
            selectedIndex: 0,
            notice: null,
            noticeReturnsToBattle: false
          }, interaction.playerHp)
        });
      }
      return closeDungeonInteraction(state);
    }
    return updateDebug(state);
  }

  if (action === "start") return openDungeonMap(state);
  if (action === "select") return openDungeonInventory(state);
  if (action === "action") {
    const battle = startDungeonBattle(state);
    if (battle.dungeonInteraction.mode === "battle") return battle;
    const target = state.actors.find((actor) => actor.roomName === state.currentRoom?.name && actor.active && actor.visible);
    const eventName = target?.eventBindings.onInteract as string | undefined ?? target?.eventName ?? actorActionEventName(state);
    return runEvent(state, eventName);
  }
  return updateDebug(state);
}

function setPreviewStartMenuPage(
  state: PreviewRuntimeState,
  page: PreviewRuntimeStartMenuPage,
  notice: string | null = null
): PreviewRuntimeState {
  return updateDebug({
    ...state,
    startMenu: {
      visible: true,
      page,
      selectedIndex: 0,
      notice
    }
  });
}

function openPreviewStartMenuScene(state: PreviewRuntimeState): PreviewRuntimeState | null {
  if (state.currentRoom?.sceneType === "menu") return null;
  const target = state.rooms.find((room) => sceneMenuConfigForRoom(room)?.role === "start");
  const previousRoomID = state.currentRoom?.id ?? state.currentRoom?.name ?? null;
  if (!target || !previousRoomID) return null;
  const entered = setCurrentRoom({
    ...state,
    startMenu: { visible: false, page: "root", selectedIndex: 0, notice: null },
    sceneMenu: {
      ...state.sceneMenu,
      stack: [...state.sceneMenu.stack, previousRoomID]
    }
  }, target);
  return runActiveMenuScreenEnter(entered);
}

function movePreviewStartMenuSelection(state: PreviewRuntimeState, delta: number): PreviewRuntimeState {
  const items = previewRuntimeStartMenuItems(state);
  if (items.length === 0) return updateDebug(state);
  const selectedIndex = (state.startMenu.selectedIndex + delta + items.length) % items.length;
  return updateDebug({
    ...state,
    startMenu: { ...state.startMenu, selectedIndex, notice: null }
  });
}

function purchasePreviewTopdownShopItem(state: PreviewRuntimeState): PreviewRuntimeState {
  const topdown = topdownFeatureRuntimeForState(state);
  const shop = topdown?.shop;
  if (!topdown?.shopEnabled || !shop || !topdownShopItemEnabled(state, shop)) {
    return updateDebug({
      ...state,
      startMenu: { ...state.startMenu, notice: "Compra indisponível." }
    });
  }

  const stock = topdownShopStock(state, shop);
  const currencyKey = topdownInventoryKey(state, shop.currencyItem);
  const itemKey = topdownInventoryKey(state, shop.item);
  const inventory = {
    ...state.inventory,
    [currencyKey]: topdownInventoryCount(state, shop.currencyItem) - shop.price,
    [itemKey]: topdownInventoryCount(state, shop.item) + 1
  };
  const variables = stock.variableName
    ? { ...state.variables, [stock.variableName]: stock.progress + 1 }
    : state.variables;
  return updateDebug({
    ...state,
    inventory,
    variables,
    startMenu: { ...state.startMenu, notice: `Compra realizada: ${shop.label}.` }
  });
}

function selectPreviewStartMenuItem(state: PreviewRuntimeState): PreviewRuntimeState {
  const item = previewRuntimeStartMenuItems(state)[state.startMenu.selectedIndex];
  if (!item || item.enabled === false) return updateDebug(state);

  if (item.id === "missions") return setPreviewStartMenuPage(state, "missions");
  if (item.id === "settings") return setPreviewStartMenuPage(state, "settings");
  if (item.id === "inventory") return setPreviewStartMenuPage(state, "inventory");
  if (item.id === "shop") return setPreviewStartMenuPage(state, "shop");
  if (item.id === "shop:item") return purchasePreviewTopdownShopItem(state);
  if (item.id === "map") return setPreviewStartMenuPage(state, "map");
  if (item.id === "profile") return setPreviewStartMenuPage(state, "profile");
  if (item.id === "back") {
    return state.startMenu.page === "root"
      ? updateDebug({ ...state, startMenu: { visible: false, page: "root", selectedIndex: 0, notice: null } })
      : setPreviewStartMenuPage(state, "root");
  }
  if (item.id === "save") {
    return updateDebug({
      ...state,
      saveSlots: { ...state.saveSlots, 1: runtimeSaveSnapshot(state, nextPreviewRuntimeSaveSequence(state.saveSlots)) },
      startMenu: { ...state.startMenu, notice: "Jogo salvo no slot 1." }
    });
  }
  return updateDebug(state);
}

function dismissPreviewStartMenu(state: PreviewRuntimeState): PreviewRuntimeState {
  if (!state.startMenu.visible) return updateDebug(state);
  if (state.startMenu.page !== "root") return setPreviewStartMenuPage(state, "root");
  return updateDebug({
    ...state,
    startMenu: { visible: false, page: "root", selectedIndex: 0, notice: null }
  });
}

function applyPreviewTopdownQuest(state: PreviewRuntimeState): PreviewRuntimeState {
  if (
    state.currentRoom?.sceneType !== "topdown" ||
    state.activeDialogue ||
    state.startMenu.visible ||
    state.sceneMenu.visible
  ) {
    return state;
  }
  const topdown = topdownFeatureRuntimeForState(state);
  const quest = topdown?.questsEnabled ? topdown.quest : undefined;
  if (!quest) return state;
  const stateVariableName = topdownVariableName(state, quest.stateVariable);
  if (!stateVariableName || variableNumber(state, stateVariableName) !== quest.activeValue) return state;
  if (topdownInventoryCount(state, quest.objectiveItem) < quest.objectiveQuantity) return state;

  const objectiveKey = String(quest.objectiveItem);
  const rewardKey = String(quest.rewardItem);
  const nextObjectiveCount = topdownInventoryCount(state, quest.objectiveItem) - quest.objectiveQuantity;
  const nextRewardCount = (quest.objectiveItem === quest.rewardItem ? nextObjectiveCount : topdownInventoryCount(state, quest.rewardItem)) + quest.rewardQuantity;
  return updateDebug({
    ...state,
    inventory: {
      ...state.inventory,
      [objectiveKey]: nextObjectiveCount,
      [rewardKey]: nextRewardCount
    },
    variables: {
      ...state.variables,
      [stateVariableName]: quest.completedValue
    }
  });
}

function changeSceneMenuValue(state: PreviewRuntimeState, direction: -1 | 1): PreviewRuntimeState {
  const config = sceneMenuConfigForState(state);
  const item = config?.items[state.sceneMenu.selectedIndex];
  if (!item || item.action !== "adjust_variable") return updateDebug(state);
  const variableName = variableNameAtIndex(state, item.variableIndex);
  if (!variableName) {
    return updateDebug({
      ...state,
      sceneMenu: { ...state.sceneMenu, notice: `Variável não encontrada para ${item.label}.` }
    });
  }
  const current = sceneMenuItemValue(state, item);
  const value = Math.max(item.minValue, Math.min(item.maxValue, current + direction * item.step));
  const nextState = applySceneMenuAudioBinding(setRuntimeVariable(state, variableName, value), item, value);
  return updateDebug({
    ...nextState,
    sceneMenu: { ...nextState.sceneMenu, notice: null }
  });
}

function moveSceneMenuSelection(state: PreviewRuntimeState, delta: -1 | 1): PreviewRuntimeState {
  const items = previewRuntimeSceneMenuItems(state);
  if (items.length === 0) return updateDebug(state);
  const selectedIndex = (state.sceneMenu.selectedIndex + delta + items.length) % items.length;
  return updateDebug({
    ...state,
    sceneMenu: { ...state.sceneMenu, selectedIndex, notice: null }
  });
}

function selectSceneMenuItem(state: PreviewRuntimeState): PreviewRuntimeState {
  const config = sceneMenuConfigForState(state);
  const roomConfig = sceneMenuConfigForRoom(state.currentRoom);
  const item = config?.items[state.sceneMenu.selectedIndex];
  if (!item || !item.enabled) return updateDebug(state);

  const eventState = item.eventName ? runEvent(state, item.eventName) : state;
  const sceneChanged = eventState.currentRoom?.id !== state.currentRoom?.id
    || eventState.currentRoom?.name !== state.currentRoom?.name;
  if (sceneChanged) return eventState;

  if (item.action === "push_screen" || item.action === "open_screen") {
    const embeddedTarget = embeddedMenuScreenForConfig(roomConfig, item.targetScreenID);
    if (embeddedTarget) {
      const stack = item.action === "push_screen" && eventState.currentRoom
        ? [...eventState.sceneMenu.stack, embeddedMenuStackEntry(eventState.currentRoom.id, eventState.sceneMenu.screenID)]
        : [...eventState.sceneMenu.stack];
      return setCurrentMenuScreen({
        ...eventState,
        sceneMenu: { ...eventState.sceneMenu, stack }
      }, embeddedTarget.id);
    }
    const target = roomByName(eventState.rooms, item.targetScreenID);
    if (!target || target.sceneType !== "menu") {
      return updateDebug({
        ...eventState,
        sceneMenu: { ...eventState.sceneMenu, notice: `Tela não encontrada: ${item.targetScreenID || "-"}.` }
      });
    }
    const stack = item.action === "push_screen" && eventState.currentRoom
      ? [...eventState.sceneMenu.stack, embeddedMenuStackEntry(eventState.currentRoom.id, eventState.sceneMenu.screenID)]
      : [...eventState.sceneMenu.stack];
    const entered = setCurrentRoom({
      ...eventState,
      sceneMenu: { ...eventState.sceneMenu, stack }
    }, target);
    return runActiveMenuScreenEnter(entered);
  }

  if (item.action === "pop_screen") {
    const previousID = state.sceneMenu.stack.at(-1);
    if (previousID) {
      const previousEntry = parseMenuStackEntry(previousID);
      const previous = roomByName(state.rooms, previousEntry.roomID);
      if (previous) {
        const restored = setCurrentRoom({
          ...state,
          sceneMenu: { ...state.sceneMenu, stack: state.sceneMenu.stack.slice(0, -1) }
        }, previous);
        return previousEntry.screenID
          ? setCurrentMenuScreen(restored, previousEntry.screenID)
          : runActiveMenuScreenEnter(restored);
      }
    }
    const embeddedScreen = embeddedMenuScreenForConfig(sceneMenuConfigForRoom(state.currentRoom), state.sceneMenu.screenID);
    if (embeddedScreen?.onBackEventName) return runEvent(state, embeddedScreen.onBackEventName);
    if (config?.onBackEventName) return runEvent(state, config.onBackEventName);
    return updateDebug({
      ...state,
      sceneMenu: { ...state.sceneMenu, notice: "Não há tela anterior." }
    });
  }

  if (item.action === "toggle_variable") {
    const variableName = variableNameAtIndex(state, item.variableIndex);
    if (!variableName) {
      return updateDebug({
        ...state,
        sceneMenu: { ...state.sceneMenu, notice: `Variável não encontrada para ${item.label}.` }
      });
    }
    const current = sceneMenuItemValue(state, item);
    const value = current === item.checkedValue ? item.minValue : item.checkedValue;
    const nextState = applySceneMenuAudioBinding(setRuntimeVariable(state, variableName, value), item, value);
    return updateDebug({ ...nextState, sceneMenu: { ...nextState.sceneMenu, notice: null } });
  }

  if (item.dialogueKey) {
    const dialogue = dialogueByKey(state.project, item.dialogueKey, "dialogue", state.dialogueLocale);
    if (dialogue) return updateDebug({ ...eventState, activeDialogue: dialogue });
  }
  return updateDebug({
    ...eventState,
    sceneMenu: { ...eventState.sceneMenu, notice: null }
  });
}

export function dispatchPreviewRuntimeAction(
  state: PreviewRuntimeState,
  action: PreviewRuntimeAction
): PreviewRuntimeState {
  if(state.nativeEvents.modal && action!=="debug") return dispatchIntegratedNativeModal(state,action);
  if(state.currentRoom?.sceneType==="topdown" && isPreviewMovementAction(action)) {
    if(state.nativeEvents.adventure.state==="blank") return updateDebug(state);
    if(state.player && state.nativeEvents.cancelledMovement[state.player.id]) {
      const cancelled={...state.nativeEvents.cancelledMovement};delete cancelled[state.player.id];
      return {...state,nativeEvents:{...state.nativeEvents,cancelledMovement:cancelled}};
    }
  }
  if (isPreviewDebuggerBlocking(state) && action !== "debug") {
    return updateDebug(state);
  }
  if (state.currentRoom?.sceneType === "topdown" && previewScriptPending(state) && isPreviewMovementAction(action)) {
    return updateDebug(state);
  }

  if (action === "debug") {
    return updateDebug({
      ...state,
      debug: {
        ...state.debug,
        visible: !state.debug.visible
      }
    });
  }

  if ((previewSceneTypePaused(state) || state.currentRoom?.sceneType === "platformer" && !state.platformerPlayerActive)
    && !state.activeDialogue && !state.textInput.active && !state.startMenu.visible && !state.sceneMenu.visible
    && (isPreviewMovementAction(action) || action === "action" || action === "back")) {
    return updateDebug(state);
  }

  if (state.textInput.active && !state.activeDialogue) {
    return updatePreviewTextInput(state, action);
  }

  if (action === "start" && !(state.sceneMenu.visible && !state.activeDialogue)) {
    if (state.activeDialogue) return updateDebug(state);
    const skippedLogo = skipPreviewLogo(state);
    if (skippedLogo !== state) return skippedLogo;
    if (state.currentRoom?.sceneType === "dungeonCrawler") {
      if (state.dungeonInteraction.mode !== "none") return updateDebug(state);
      return openDungeonMap(state);
    }
    const presentationMode = startMenuPresentationMode(state);
    if (presentationMode === "scene" || presentationMode === "both") {
      const sceneMenu = openPreviewStartMenuScene(state);
      if (sceneMenu) return sceneMenu;
    }
    return state.startMenu.visible
      ? dismissPreviewStartMenu(state)
      : setPreviewStartMenuPage(state, "root");
  }

  if (
    state.currentRoom?.sceneType === "platformer" &&
    state.currentRoom.platformerPreviewEnabled &&
    !state.activeDialogue &&
    !state.startMenu.visible &&
    !state.sceneMenu.visible &&
    !state.battleMenu.visible
  ) {
    if (action === "back") {
      return updateDebug({
        ...state,
        platformerInputRequests: { ...state.platformerInputRequests, dash: true }
      });
    }
    if (action === "action") {
      const requested = updateDebug({
        ...state,
        platformerInputRequests: { ...state.platformerInputRequests, jump: true }
      });
      return runEvent(requested, actorActionEventName(requested));
    }
  }

  if (
    state.currentRoom?.sceneType === "dungeonCrawler" &&
    !state.activeDialogue &&
    (state.dungeonInteraction.mode !== "none" || action === "select" || action === "action" || action === "back")
  ) {
    return dispatchDungeonInteractionAction(state, action);
  }

  if (state.startMenu.visible) {
    if (action === "up") return movePreviewStartMenuSelection(state, -1);
    if (action === "down") return movePreviewStartMenuSelection(state, 1);
    if (action === "action") return selectPreviewStartMenuItem(state);
    if (action === "back") return dismissPreviewStartMenu(state);
    return updateDebug(state);
  }

  if (state.sceneMenu.visible && !state.activeDialogue) {
    if (action === "up") return moveSceneMenuSelection(state, -1);
    if (action === "down") return moveSceneMenuSelection(state, 1);
    if (action === "left") return changeSceneMenuValue(state, -1);
    if (action === "right") return changeSceneMenuValue(state, 1);
    if (action === "action" || action === "start") {
      const skippedLogo = skipPreviewLogo(state);
      return skippedLogo !== state ? skippedLogo : selectSceneMenuItem(state);
    }
    if (action === "back") {
      const skippedLogo = skipPreviewLogo(state);
      if (skippedLogo !== state) return skippedLogo;
      const backIndex = previewRuntimeSceneMenuItems(state).findIndex((item) => item.action === "pop_screen");
      if (backIndex >= 0) {
        return selectSceneMenuItem({ ...state, sceneMenu: { ...state.sceneMenu, selectedIndex: backIndex } });
      }
      const previousID = state.sceneMenu.stack.at(-1);
      const previousEntry = previousID ? parseMenuStackEntry(previousID) : null;
      const previous = previousEntry ? roomByName(state.rooms, previousEntry.roomID) : null;
      if (previous) {
        const restored = setCurrentRoom({
          ...state,
          sceneMenu: { ...state.sceneMenu, stack: state.sceneMenu.stack.slice(0, -1) }
        }, previous);
        return previousEntry?.screenID
          ? setCurrentMenuScreen(restored, previousEntry.screenID)
          : runActiveMenuScreenEnter(restored);
      }
      const config = sceneMenuConfigForRoom(state.currentRoom);
      const embeddedScreen = embeddedMenuScreenForConfig(config, state.sceneMenu.screenID);
      if (embeddedScreen?.onBackEventName) return runEvent(state, embeddedScreen.onBackEventName);
      if (config?.onBackEventName) return runEvent(state, config.onBackEventName);
      return updateDebug(state);
    }
    return updateDebug(state);
  }

  if (state.currentRoom?.sceneType === "battleRpg" && state.battleMenu.visible && !state.activeDialogue) {
    if (isPreviewMovementAction(action)) return moveBattleMenuSelection(state, action);
    if (action === "action") return selectBattleMenuItem(state);
    if (action === "back") return backBattleMenu(state);
    return updateDebug(state);
  }

  if (
    state.currentRoom?.sceneType === "isometric" &&
    state.isometricTactical.enabled &&
    !state.activeDialogue &&
    !state.startMenu.visible &&
    !state.sceneMenu.visible
  ) {
    if (action === "up" || action === "down" || action === "left" || action === "right") {
      return moveIsometricTacticalCursor(state, action);
    }
    if (action === "action") return dispatchIsometricTacticalAction(state, "confirm");
    if (action === "back") return dispatchIsometricTacticalAction(state, "cancel");
    if (action === "select") return dispatchIsometricTacticalAction(state, "end_turn");
    return updateDebug(state);
  }

  if (
    state.currentRoom?.sceneType === "luta" &&
    !state.activeDialogue &&
    !state.startMenu.visible &&
    !state.sceneMenu.visible &&
    !state.battleMenu.visible
  ) {
    if (action === "action") return dispatchLutaPreviewVisualAction(state, "attack");
    // O teclado abstrato do Preview reserva BACK para L e SELECT para R;
    // ambos compartilham a mesma pose especial nesta fatia visual.
    if (action === "back" || action === "select") {
      return dispatchLutaPreviewVisualAction(state, "special");
    }
  }

  if (action === "back") {
    return updateDebug(state);
  }

  if (action === "action") {
    if (state.activeDialogue) {
      if (state.activeDialogue.mode === "choice") {
        const choiceEvent = choiceEventForDialogue(state, state.activeDialogue);
        if (choiceEvent) {
          return runEvent(appendLog({
            ...state,
            activeDialogue: null
          }, state.activeDialogue.key, `choice ${state.activeDialogue.selectedChoiceIndex}`, "event", choiceEvent.eventName), choiceEvent.eventName);
        }
      }
      return closeActiveDialogue(state);
    }
    if (state.currentRoom?.sceneType === "pointAndClick" && state.player) {
      const pointClickConfig = pointClickSceneConfigFromRuntime(state.currentRoom.runtime);
      const paddingTiles = (pointClickConfig?.hotspotPadding ?? 0) / gbaTileSizePx;
      const hotspot = runtimeTriggers(state.project, state.currentRoom.name)
        .find((trigger) => triggerContainsPlayer(trigger, state.player as PreviewRuntimePlayer, paddingTiles));
      return runEvent(applyPointClickCursorAnimation(state, true), hotspot ? triggerInteractEventName(hotspot) : null);
    }
    if (state.currentRoom?.sceneType === "battleRpg") return updateDebug(state);
    if (state.currentRoom?.sceneType === "visualNovel") {
      const config = visualNovelSceneConfigFromRuntime(state.currentRoom.runtime);
      const narrativeRooms = state.rooms.filter((room) => room.sceneType === "visualNovel");
      const currentIndex = narrativeRooms.findIndex((room) => room.id === state.currentRoom?.id);
      const nextIndex = (config?.nextSceneIndex ?? -1) >= 0 ? config!.nextSceneIndex : currentIndex + 1;
      const nextRoom = narrativeRooms[nextIndex];
      return nextRoom ? setCurrentRoom(state, nextRoom) : updateDebug(state);
    }
    if (state.currentRoom?.sceneType === "cutscene") {
      const config = cutsceneSceneConfigFromRuntime(state.currentRoom.runtime);
      const narrativeRooms = state.rooms.filter((room) => room.sceneType === "cutscene");
      const currentIndex = narrativeRooms.findIndex((room) => room.id === state.currentRoom?.id);
      const nextIndex = (config?.nextSceneIndex ?? -1) >= 0 ? config!.nextSceneIndex : currentIndex + 1;
      const nextRoom = narrativeRooms[nextIndex];
      return nextRoom ? setCurrentRoom(state, nextRoom) : updateDebug(state);
    }
    if (state.currentRoom?.sceneType === "topdown" && state.adventureCallbacks[0]) {
      return queuePreviewCallback(state, state.adventureCallbacks[0]);
    }
    return runEvent(state, actorActionEventName(state));
  }

  if (state.activeDialogue) {
    if (action === "up") return moveActiveDialogueChoice(state, -1);
    if (action === "down") return moveActiveDialogueChoice(state, 1);
    return updateDebug(state);
  }

  if (state.currentRoom?.sceneType === "worldMap" && isPreviewMovementAction(action)) {
    const direction = action === "left" || action === "up" ? -1 : 1;
    const currentIndex = Math.max(0, state.rooms.findIndex((room) => room.id === state.currentRoom?.id));
    for (let offset = 1; offset < state.rooms.length; offset += 1) {
      const candidate = state.rooms[(currentIndex + direction * offset + state.rooms.length) % state.rooms.length];
      if (!candidate || candidate.sceneType !== "worldMap") continue;
      const config = worldMapSceneConfigFromRuntime(candidate.runtime);
      const requirementMet = (config?.requiredVariable ?? -1) < 0 || Number(state.variables[String(config?.requiredVariable)]) === config?.requiredValue;
      const unlocked = (config?.unlocked ?? true) && requirementMet;
      if (unlocked || !(config?.hideWhenLocked ?? false)) return setCurrentRoom(state, candidate);
    }
    return updateDebug(state);
  }

  if (!state.currentRoom || !state.player || state.activeDialogue) {
    return updateDebug(state);
  }

  if (state.currentRoom.sceneType === "battleRpg") {
    const config = battleRpgSceneConfigFromRuntime(state.currentRoom.runtime);
    const maxEnemies = config?.maxEnemies ?? 4;
    if (action === "left" || action === "right") {
      const offset = action === "right" ? 1 : -1;
      return updateDebug({ ...state, battleTargetIndex: (state.battleTargetIndex + offset + maxEnemies) % maxEnemies });
    }
    return updateDebug(state);
  }

  return tryMovePreviewPlayer(state, action);
}
