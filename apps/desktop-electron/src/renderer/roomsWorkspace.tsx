import { RacingCircuitCamera } from "./RacingCircuitCamera";
import { RacingSceneInspector } from "./RacingSceneInspector";
import { LogicNavigator, LogicValueInspector, type LogicSelection } from "./LogicNavigator";
import type { LogicValuePatch } from "../shared/logicWorkspace";
import type { EventsWorkspacePresentation } from "../shared/eventsWorkspace";
import type { ProjectVariableKind } from "../shared/variablesWorkspace";
import { HudCanvasToolbar } from "./HudCanvasToolbar";
import { resolveSceneDialogueUiSettings, type InterfaceThemeChange } from "../shared/interfaceThemes";
import { updateRuntimeEventState, menuActorRuntimeState } from "../shared/sceneEventStates";
import { dialogueSelectionScope } from "../shared/dialogueSceneAuthoring";
import { hudPresetUsages, updateHudComponentGeometry } from "../shared/hudSceneAuthoring";
import { DialogueAppearanceInspector } from "./DialogueAppearanceInspector";
import { DialogueScenePreview } from "./DialogueScenePreview";
import { cloneElement, Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  Box,
  Camera,
  Check,
  ChevronRight,
  Diamond,
  Folder,
  GitFork,
  Grid3X3,
  FolderPlus,
  ListOrdered,
  Map as MapIcon,
  Mountain,
  Monitor,
  MoreHorizontal,
  MousePointer2,
  Paintbrush,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Shield,
  SquarePlus,
  ScanSearch,
  Trash2,
  UserRound,
  UsersRound,
  X,
  ZoomIn,
  ZoomOut,
  Zap,
  type LucideIcon
} from "lucide-react";

import {
  wheelZoomCanvasViewport
} from "../shared/canvasWorkspace";
import {
  defaultEditorRailExpandState,
  createEditorSceneGroup,
  deriveEditorSceneOrganization,
  moveEditorSceneToGroup,
  removeEditorSceneGroup,
  renameEditorSceneGroup,
  reorderEditorScene,
  roomTreeSubtitle,
  toggleEditorRailSection,
  type EditorRailExpandState,
  type EditorSceneGroup,
  type EditorSceneOrganization
} from "../shared/editorProjectRail";
import type { GBAProjectData } from "../shared/projectFile";
import { playerArrivalPreview } from "../shared/playerArrivalPreview";
import { SCENE_TRANSITION_STYLES, type SceneTransitionStyle } from "../shared/sceneTransition";
import { sceneDisplayName } from "../shared/sceneDisplayName";
import { deriveHudPresetsWorkspacePresentation, hudPresetBindingSourceLabel, resolveExplicitHudPresetBinding, type HudComponent, type HudPresetBinding, type UpdateHudPresetFields } from "../shared/hudPresets";
import { deriveDialogueCharacterProfiles, deriveDialoguesWorkspacePresentation, deriveDialoguesForScene, type UpdateDialogueFields, type UpdateDialoguesUiFields } from "../shared/dialoguesWorkspace";
import {
  projectActorPrefabs,
  projectTriggerPrefabs,
  type ProjectPrefabKind,
  type ProjectPrefabPlacement
} from "../shared/projectPrefabs";
import type { HardwareProfilerMetric, HardwareProfilerPresentation } from "../shared/hardwareProfiler";
import type { ScenePhysicalMetric } from "../shared/scenePhysicalDiagnostics";
import {
  deriveProjectBudgetPresentation,
  type AssetPackBudgetReport,
  type ProjectBudgetMetric,
  type ProjectBudgetPresentation
} from "../shared/projectBudget";
import { projectEventReferenceOptions, type ProjectReferenceOption } from "../shared/projectReferenceOptions";
import { normalizeRoomInspectorTab, roomInspectorTabs, type RoomInspectorContextKind, type RoomInspectorTabID } from "../shared/roomInspectorTabs";
import { gbaActorSpriteRoomPlacementFromFrame, gbaActorSpriteRoomPlacementPercent } from "../shared/gbaRendering";
import {
  compileIsometricRoomTiles,
  deriveIsometricGeometryContract,
  isometricRoomTileDiamondPoints,
  orderedIsometricPreviewTileLayers,
  isometricProjectionCanvasOffset,
  projectIsometricRoomPoint
} from "../shared/isometricProjection";
import type { IsometricProjectionBounds } from "../shared/isometricProjection";
import { compileRgbaToRgb555, remapRgbaToRgb555Palette } from "../shared/rgb555";
import {
  clampSceneMapZoom,
  defaultSceneMapPosition,
  displayedSceneMapCardSize,
  displayedSceneMapContentSize,
  displayedSceneMapPosition,
  deriveSceneMapCardDragPosition,
  deriveSceneMapCardDragTransform,
  fitSceneMapViewToCards,
  integerNearestNeighborPreviewFit,
  roomTilemapPreviewSignature,
  SCENE_MAP_MAX_ZOOM,
  SCENE_MAP_MIN_ZOOM,
  SCENE_MAP_PREVIEW_MAX_SIZE,
  sceneMapCardChromeSize,
  sceneMapCardSize,
  sceneMapContentSize,
  sceneMapTileGridBackgroundStyle,
  type SceneMapPosition
} from "../shared/sceneMapLayout";
import { EditorSideStack } from "./EditorSideStack";
import { SceneInspectorHealthSummary } from "./SceneInspectorHealthSummary";
import { InspectorInfoTip, InspectorNumber, InspectorSection, InspectorVector2 } from "./InspectorControls";
import { AffineSceneInspector } from "./AffineSceneInspector";
import { WorkspaceExplorerRail } from "./WorkspaceExplorerRail";
import { ProjectReferencePicker, WorkspaceEmptyState } from "./studioUi";
import { HudPreviewSnapshot } from "./hudPreviewSnapshot";
import { EditorPopover } from "./EditorPopover";
import { RoomInspectorNavigation } from "./RoomInspectorNavigation";
import { FocusScenePreviewPanel } from "./FocusScenePreviewPanel";
import { RoomEditorCanvasControls, RoomEditorSecondaryToolbar } from "./RoomEditorSecondaryToolbar";
import { HudSceneInspector } from "./HudSceneInspector";
import { RoomEventBindingsInspector } from "./RoomEventBindingsInspector";
import { RoomEntityGroupEventsInspector } from "./RoomEntityGroupEventsInspector";
import type { BindEventToTargetOptions, EventsWorkspaceCommandSuggestion, UpdateEventStepFields } from "../shared/eventsWorkspace";
import { RoomDialoguesInspector } from "./RoomDialoguesInspector";
import { RoomPaintPaletteInspector } from "./RoomPaintPaletteInspector";
import { uniqueDefaultRoomName } from "./rendererHelpers";
import {
  canvasPointToRoomTile,
  canvasPointToTilesetTileID,
  deriveRoomCanvasActions,
  deriveRoomEntityAlignmentGuides,
  deriveRoomEntitySelection,
  deriveRoomEventSceneLinks,
  deriveRoomSelectedEntityCells,
  deriveMetatileTilesetStamp,
  deriveRoomTileOverlayCells,
  composeVisibleRoomTileCells,
  roomEntitySelectionFootprint,
  selectRoomEntityAtTile,
  isometricRoomAreaPlacement,
  isometricRoomTilePlacement,
  defaultRoomConnectionEntryArea,
  defaultRoomConnectionExitArea,
  deriveRoomConnectionAreasForRoom,
  deriveTriggerPlacementFromCells,
  moveRoomConnectionAreaToCell,
  resolveActorAnimationName,
  tilesetRegionForTileID,
  ROOM_PRESETS,
  type RoomConnectionArea,
  type RoomEventSceneLink,
  type RoomTileStamp,
  type RoomsWorkspaceConnection,
  type UpdateRoomConnectionFields,
  type RoomPresetID,
  updateRoomEventSceneLinkCommand,
} from "../shared/roomsWorkspace";
import { roomInspectorSceneTypeOptions, sceneTypeLabel, sceneTypeSelectionValue } from "../shared/sceneTypes";
import {
  ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS,
  formatRoomEditorShortcut,
  roomEditorShortcutAriaKey,
  resolveRoomEditorToolShortcuts,
  roomEditorShortcutSource,
  roomEditorToolModeFromShortcut
} from "../shared/roomEditorShortcuts";
import { resolveDungeonCrawlerFeatureRuntime } from "../shared/sceneFeatureModules";
import { buildScenePreflightReport } from "../shared/scenePreflight";
import { normalizeDungeonCrawlerSceneConfig, normalizeIsometricSceneConfig, normalizeRacingSceneConfig, normalizeSceneRuntime, normalizeShmupSceneConfig, resolveSceneRuntime, sceneTypeProfile, type DungeonCrawlerSceneConfig, type IsometricSceneConfig, type RacingSceneConfig, type SceneFeatureRuntimeConfig } from "../shared/sceneTypeProfiles";
import {
  affineMatrixForScenePresentation,
  normalizeAffineScenePresentation,
  type AffineScenePresentation,
  type AffineSceneSourceSize
} from "../shared/affineScene";
import {
  normalizeSceneComposition,
  sceneCompositionFromAffinePresentation,
  sceneCompositionToAffinePresentation,
  type SceneCompositionConfig
} from "../shared/sceneComposition";
import { resolveSceneMetatileAuthoring, type SceneMetatileAuthoringConfig } from "../shared/sceneMetatileContract";
import {
  resolveSceneAdvancedCapabilities,
  resolveSceneAffineObjPreview
} from "../shared/sceneAdvancedCapabilities";
import type { IsoTacticalSurfacePage } from "../shared/isometricTacticalPresentation";
import {
  cameraModeDescription,
  GBA_VIEWPORT_TILES,
  parallaxModeDescription,
  roomInspectorCameraModeOptions,
  roomInspectorParallaxOptions
} from "../shared/roomCamera";
import {
  deriveFocusSceneCameraScroll,
  deriveFocusSceneActorScroll,
  deriveIsometricCameraPositionForPlayer,
  deriveFocusSceneViewportGeometry,
  GBA_VIEWPORT_PIXELS
} from "../shared/focusSceneViewport";
import { deriveIsometricWorldSize, type IsometricWorldSize } from "../shared/isometricAuthoring";
import { buildRacingPseudo3dPreviewModel } from "../shared/racingPseudo3dPreview";
import { isDesktopAssetURL, resolveAssetURL, resolveAssetURLWithBundledDefault } from "../shared/spriteAssetURL";
import { listProjectVariables } from "../shared/variablesWorkspace";
import {
  sceneTilemapCellIndexesForCell,
  sceneTilemapCellIndexesForRectangle
} from "../shared/sceneTilemapContract";
import { deriveMenuSceneEditorPreview, normalizeMenuSceneConfig, type MenuSceneConfig } from "../shared/menuScene";
import type {
  RoomCanvasAction,
  RoomCanvasEditMode,
  RoomCanvasLayerID,
  RoomCollisionPlacementMode,
  RoomEditorToolPanelMode,
  RoomEntityCanvasTool,
  RoomCameraZone,
  PlaceRoomEntityInRoomOptions,
  CreateActorInProjectOptions,
  CreateTriggerInProjectOptions,
  ResizeRoomTriggerToTileOptions,
  RoomTileBrushOptions,
  RoomTilePaintTool,
  RoomCollisionType,
  RoomsWorkspaceActorAnimationVariant,
  RoomsWorkspaceEntity,
  RoomsWorkspaceEntityKind,
  RoomGeometryDiagnostics,
  RoomsWorkspaceRoom,
  RoomsWorkspaceOptions,
  RoomsWorkspacePresentation,
  UpdateRoomBackgroundTilesetGridFields,
  UpdateRoomEntityFields,
  UpdateRoomFields
} from "../shared/roomsWorkspace";
import { roomCollisionTypeLabel } from "../shared/roomsWorkspace";
import { SceneCompositionInspector } from "./SceneCompositionInspector";
import { SceneMetatileInspector } from "./SceneMetatileInspector";
import { ShmupSceneCompositionInspector } from "./ShmupSceneCompositionInspector";

const actorAnimationStateLabels: Record<string, string> = {
  attack: "Atacando",
  celebrate: "Comemorando",
  hurt: "Ferido",
  idle: "Parado",
  walk: "Andando"
};

const actorAnimationDirectionLabels: Record<string, string> = {
  down: "Baixo",
  left: "Esquerda",
  right: "Direita",
  up: "Cima"
};

function actorAnimationTokenLabel(value: string, labels: Record<string, string>): string {
  const knownLabel = labels[value.toLowerCase()];
  if (knownLabel) return knownLabel;
  const words = value.replaceAll(/[_-]+/g, " ").trim();
  return words.length > 0 ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : value;
}

function uniqueActorAnimationValues(
  variants: RoomsWorkspaceActorAnimationVariant[],
  field: "state" | "direction"
): string[] {
  return Array.from(new Set(variants.map((variant) => variant[field]).filter((value): value is string => Boolean(value))));
}

const sceneMapCardDragActiveRef = { current: false };
let sceneMapCardDragFrameRequest: number | null = null;
let sceneMapCardDragPendingPointer = { x: 0, y: 0 };
let roomCanvasHistorySequence = 0;

interface RoomEntityPointerDrag {
  captureTarget: HTMLButtonElement;
  entityID: string;
  entityKey: string;
  frameRequest: number | null;
  kind: RoomsWorkspaceEntityKind;
  offsetX: number;
  offsetY: number;
  originX: number;
  originY: number;
  pointerID: number;
  startClientX: number;
  startClientY: number;
  previewX: number;
  previewY: number;
}

function invokeHistoryAware<Result>(
  callback: (...args: never[]) => Result,
  args: readonly unknown[],
  historyGroupID?: string
): Result {
  const nextArgs = historyGroupID ? [...args, historyGroupID] : args;
  return callback(...nextArgs as never[]);
}

interface RoomsWorkspaceProps {
  logicEvents?: EventsWorkspacePresentation | null;
  onCreateLogicVariable?(kind: ProjectVariableKind, valueType?: "number" | "text"): Promise<string | void> | string | void;
  onUpdateLogicValue?(name: string, kind: ProjectVariableKind, patch: LogicValuePatch): void;
  onRemoveLogicValue?(name: string, kind: ProjectVariableKind): void;
  projectData?: GBAProjectData | null;
  presentation: RoomsWorkspacePresentation | null;
  hardwareProfiler?: HardwareProfilerPresentation | null;
  budgetAnalysisError?: string | null;
  budgetAnalysisGeneratedAt?: string | null;
  budgetAnalysisRunning?: boolean;
  budgetReport?: AssetPackBudgetReport | null;
  projectPath?: string;
  sceneMapZoom?: number;
  assetRefreshToken?: number;
  focusedTargetID?: string | null;
  focusedTargetName?: string | null;
  focusRequestID?: number | null;
  focusInspectorTab?: RoomInspectorTabID | null;
  focusedEventName?: string | null;
  focusedEventRequestID?: number;
  onCreateRoom(anchorRoomID?: string, roomName?: string, presetID?: RoomPresetID): string | void | Promise<string | void>;
  onSetActiveRoom(roomID: string, currentName: string): void;
  onUpdateRoomFields(roomID: string, fields: UpdateRoomFields, historyGroupID?: string): void;
  onUpdateRoomBackgroundTilesetGrid(roomID: string, fields: UpdateRoomBackgroundTilesetGridFields): void;
  onApplyTileBrush(roomID: string, options: RoomTileBrushOptions, historyGroupID?: string): void;
  onSetActiveTileLayerMapping(mapping: string): void;
  onToggleCollisionCell(roomID: string, cellIndex: number): void;
  onSetCollisionType(roomID: string, cellIndex: number, collisionType: RoomCollisionType, historyGroupID?: string): void;
  onApplyCollisionFill(roomID: string, cellIndex: number, collisionType: RoomCollisionType, historyGroupID?: string): void;
  onSetHeightLevel(roomID: string, cellIndex: number, heightLevel: number, historyGroupID?: string): void;
  onCreateRoomConnection(fromName: string, toName: string, eventName: string): number | null | void;
  onCreateRoomWarpConnection?(
    fromName: string,
    toName: string,
    eventName: string,
    side: "exit" | "entry",
    area: RoomConnectionArea,
    historyGroupID?: string
  ): number | null | void;
  onRemoveRoomConnection(connectionIndex: number): void;
  onUpdateRoomConnection(connectionIndex: number, fields: UpdateRoomConnectionFields, historyGroupID?: string): void;
  onUpdateRoomEntity(kind: RoomsWorkspaceEntityKind, entityID: string, fields: UpdateRoomEntityFields, historyGroupID?: string): void;
  onPlaceRoomEntity(kind: RoomsWorkspaceEntityKind, entityID: string, options: PlaceRoomEntityInRoomOptions, historyGroupID?: string): void;
  onResizeRoomTrigger(triggerID: string, options: ResizeRoomTriggerToTileOptions, historyGroupID?: string): void;
  onCreateTrigger(options: CreateTriggerInProjectOptions, historyGroupID?: string): string | void;
  onCreateActor(options: CreateActorInProjectOptions, historyGroupID?: string): string | void;
  onNudgeRoomEntities(roomID: string, selectedKeys: string[], deltaX: number, deltaY: number, stepSize?: number): void;
  onAlignRoomEntities(roomID: string, selectedKeys: string[], axis: "x" | "y"): void;
  onDistributeRoomEntities(roomID: string, selectedKeys: string[], axis: "x" | "y"): void;
  onDuplicateRoomEntities(roomID: string, selectedKeys: string[]): void;
  onRemoveRoomEntities(roomID: string, selectedKeys: string[]): void;
  onUpdateSceneMapPosition(sceneName: string, position: SceneMapPosition): void;
  onOrganizeSceneMap?(): void;
  onUpdateSceneMapZoom(zoom: number): void;
  onUpdateSceneOrganization(organization: EditorSceneOrganization): void;
  onRenameRoom(roomID: string, nextName: string): void;
  onDuplicateRoom?(roomID: string, currentName: string): string | void | Promise<string | void>;
  onRemoveRoom(roomID: string, currentName: string): void;
  onSetStartRoom(roomID: string, currentName: string): void;
  onRunRoom(roomID: string, currentName: string, start?: { x: number; y: number; direction: string }): void;
  runRoomDisabled?: boolean;
  onOpenEvent?(eventName: string, sourceRoomName?: string): void;
  onUpdateEventStep?(eventID: string, stepIndex: number, fields: UpdateEventStepFields): void;
  onUpdateDialogue?(key: string, fields: UpdateDialogueFields): void;
  onUpdateInterfaceTheme?(change: InterfaceThemeChange): void;
  onUpdateDialoguesUi?(fields: UpdateDialoguesUiFields): void;
  onImportAssets?(): void | Promise<void>;
  onBindHud?(roomID: string, presetID: string | null, screenID?: string): void;
  onSetActiveHudPreset?(presetID: string): void;
  onDuplicateHudPreset?(presetID: string): void;
  onRemoveHudPreset?(presetID: string): void;
  onOpenDialoguesWorkspace?(key?: string): void;
  focusedDialogueKey?: string | null;
  dialogueFocusRequestID?: number | null;
  onCreateDialogue?(): Promise<string | null>;
  onDuplicateDialogue?(key: string): Promise<string | null>;
  onRemoveDialogue?(key: string): void;
  onNormalizeDialogue?(key: string): void;

  renderEventInspector?(eventName: string, triggerLabel: string): ReactNode;
  onCreateEventReference?(): string | void | Promise<string | void>;
  onCreateBoundEventsForTargets?(options: { initialCommands: string[]; targets: BindEventToTargetOptions[] }): string[];
  onSetEventUpdateFrequency?(eventName: string, frames: number): void;
  commandSuggestions?: EventsWorkspaceCommandSuggestion[];
  onImportTileset(roomID: string): Promise<void>;
  onImportTiledMap(roomID: string): Promise<void>;
  onUpdateHudPreset?(presetID: string, fields: UpdateHudPresetFields): void;
  onCreateHudVariationForRoom?(roomID: string, sourcePresetID: string, screenID?: string): void | Promise<void>;
  onBeginHistoryGroup?(historyGroupID: string): void;
  onEndHistoryGroup?(historyGroupID: string): void;
  onAnalyzeProjectBudget?(): void;
  onOpenProjectHealth?(): void;
  onSynchronizePrefabs?(): void;
  onCreatePrefabFromEntity?(kind: ProjectPrefabKind, entityID: string): void;
  onInstantiatePrefab?(kind: ProjectPrefabKind, prefabID: string, placement: ProjectPrefabPlacement): void;
  onUpdatePrefab?(kind: ProjectPrefabKind, prefabID: string, fields: Record<string, unknown>): void;
}

function formatHardwareProfilerBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

function formatHardwareProfilerMetric(metric: HardwareProfilerMetric): string {
  if (metric.unit === "bytes") return `${formatHardwareProfilerBytes(metric.used)} / ${formatHardwareProfilerBytes(metric.limit)}`;
  if (metric.unit === "colors") return `${metric.used} / ${metric.limit} cores`;
  if (metric.unit === "objects") return `${metric.used} / ${metric.limit} objetos`;
  if (metric.unit === "percent") return `${metric.used.toFixed(1)}% / ${metric.limit}%`;
  return `${metric.percent.toFixed(1)}% da carga estimada`;
}

function formatScenePhysicalValue(metric: ScenePhysicalMetric, value: number | null): string {
  if (value === null) return "—";
  if (metric.unit === "bytes") return formatHardwareProfilerBytes(value);
  if (metric.unit === "colors") return `${value} cores`;
  if (metric.unit === "objects") return `${value} objetos`;
  if (metric.unit === "tiles") return `${value} tiles`;
  return `${value} ticks`;
}

type MenuTextInputPreviewState = NonNullable<ReturnType<typeof deriveMenuSceneEditorPreview>["textInput"]>;
type MenuTextInputPreviewKeyboard = NonNullable<MenuTextInputPreviewState["keyboard"]>;

function RoomHardwareDebugger({ presentation }: { presentation: HardwareProfilerPresentation }): React.ReactElement {
  const sceneLabel = sceneDisplayName(presentation.activeRoomName);
  const enabledMetrics = presentation.metrics.filter((metric) => metric.enabled);
  return (
    <details aria-label="Depurador de hardware" className="rooms-debugger" role="group">
      <summary>
        <span>
          <ChevronRight aria-hidden="true" className="rooms-debugger-chevron" size={15} strokeWidth={2.4} />
          <strong>Depurador</strong>
          <em>Hardware · {sceneLabel}</em>
        </span>
        <em className={presentation.warningCount > 0 ? "warning" : "ok"}>
          {presentation.runtime ? "Play conectado" : "Aguardando Play"}
          {presentation.warningCount > 0 ? ` · ${presentation.warningCount} alerta(s)` : ""}
        </em>
      </summary>
      <div className="rooms-debugger-body">
        {presentation.runtime ? (
          <>
            <div aria-label="Telemetria ao vivo" className="rooms-debugger-live">
              <span><strong>{presentation.runtime.presentationFps.toFixed(1)} FPS</strong><small>Apresentação do Player</small></span>
              <span><strong>{presentation.runtime.emulationFps.toFixed(1)} FPS emulados</strong><small>Cadência da ROM</small></span>
              <span><strong>{(presentation.runtime.droppedFrameRatio * 100).toFixed(1)}% descartados</strong><small>{presentation.runtime.droppedFrames} frame(s) no período</small></span>
              <span><strong>{presentation.runtime.frameMs.toFixed(2)} ms/frame</strong><small>Tempo total</small></span>
              <span><strong>{presentation.runtime.emulationMs.toFixed(2)} ms de emulação</strong><small>Custo no host</small></span>
            </div>
            {presentation.runtime.runtimeState ? (
              <section aria-label="Estado nativo da ROM" className="rooms-debugger-live" role="region">
                <span>
                  <strong>Sala {presentation.runtime.runtimeState.currentRoom + 1}</strong>
                  <small>Frame nativo {presentation.runtime.runtimeState.frame}</small>
                </span>
                <span>
                  <strong>
                    VAR0 {presentation.runtime.runtimeState.variables[0] ?? 0} · FLAGS 0x
                    {presentation.runtime.runtimeState.flagBits.toString(16).padStart(8, "0").toUpperCase()}
                  </strong>
                  <small>Variáveis e flags do runtime</small>
                </span>
                <span>
                  <strong>
                    Player {presentation.runtime.runtimeState.player.x}, {presentation.runtime.runtimeState.player.y}
                    {` · dir ${presentation.runtime.runtimeState.player.direction}`}
                  </strong>
                  <small>Posição e direção reais</small>
                </span>
                <span>
                  <strong>
                    Ator {presentation.runtime.runtimeState.firstActor.visible ? 1 : 0}/{presentation.runtime.runtimeState.actorCount}
                    {` · ${presentation.runtime.runtimeState.firstActor.x}, ${presentation.runtime.runtimeState.firstActor.y}`}
                    {` · dir ${presentation.runtime.runtimeState.firstActor.direction}`}
                  </strong>
                  <small>Primeiro NPC e OAM lógico</small>
                </span>
                <span>
                  <strong>
                    Colisão 0x{presentation.runtime.runtimeState.collision.currentFlags.toString(16).padStart(2, "0").toUpperCase()}
                    {` · rampa ${presentation.runtime.runtimeState.collision.currentSlope}`}
                  </strong>
                  <small>
                    Efeitos 0x{presentation.runtime.runtimeState.collision.seenEffectBits.toString(16).toUpperCase()}
                    {` · rampas 0x${presentation.runtime.runtimeState.collision.seenSlopeBits.toString(16).toUpperCase()}`}
                    {` · bloqueios 0x${presentation.runtime.runtimeState.collision.blockedDirectionBits.toString(16).toUpperCase()}`}
                  </small>
                </span>
                <span>
                  <strong>
                    Triggers {presentation.runtime.runtimeState.triggerEnterCount} enter / {presentation.runtime.runtimeState.triggerLeaveCount} leave
                    {` · ${presentation.runtime.runtimeState.roomChangeCount} troca(s)`}
                  </strong>
                  <small>Eventos espaciais observados na ROM</small>
                </span>
              </section>
            ) : null}
          </>
        ) : (
          <p>Execute o Play para complementar as estimativas com telemetria ao vivo.</p>
        )}
        {presentation.isometric ? (
          <section aria-label="Métricas isométricas" className="rooms-debugger-isometric" role="region">
            <span><strong>{presentation.isometric.tilesUpdated} tiles atualizados</strong><small>BG2 + BG1 da cena</small></span>
            <span><strong>{formatHardwareProfilerBytes(presentation.isometric.vramBytes)} VRAM</strong><small>Superfície, foreground e OBJ</small></span>
            <span><strong>{presentation.isometric.oamObjects} / 128 OAM</strong><small>Atores isométricos ativos</small></span>
            <span>
              <strong>
                {presentation.isometric.foregroundTileCount} {presentation.isometric.foregroundTileCount === 1 ? "tile" : "tiles"} BG1
              </strong>
              <small>{formatHardwareProfilerBytes(presentation.isometric.foregroundBytes)} de foreground</small>
            </span>
          </section>
        ) : null}
        <section aria-label="Diagnóstico físico da cena" className="rooms-debugger-physical" role="region">
          <header>
            <div>
              <strong>Diagnóstico físico</strong>
              <small>Estimativa do editor · plano do exportador · medição do runtime · limite seguro</small>
            </div>
            <span className={presentation.physical.criticalOverflow ? "error" : "ok"}>
              {presentation.physical.criticalOverflow ? "Excedente crítico" : `${presentation.physical.measuredMetricCount}/10 medidos`}
            </span>
          </header>
          <div aria-label="Matriz de recursos físicos" className="rooms-debugger-physical-table" role="table">
            <div className="rooms-debugger-physical-row is-header" role="row">
              <span role="columnheader">Recurso</span>
              <span role="columnheader">Editor</span>
              <span role="columnheader">Exportador</span>
              <span role="columnheader">Runtime</span>
              <span role="columnheader">Limite seguro</span>
              <span role="columnheader">Crítico</span>
            </div>
            {presentation.physical.metrics.map((metric) => (
              <div className={`rooms-debugger-physical-row ${metric.tone}`} key={metric.id} role="row">
                <strong role="rowheader">{metric.label}</strong>
                <span role="cell">{formatScenePhysicalValue(metric, metric.estimate)}</span>
                <span role="cell">{formatScenePhysicalValue(metric, metric.planned)}</span>
                <span role="cell">{formatScenePhysicalValue(metric, metric.measured)}</span>
                <span role="cell">{formatScenePhysicalValue(metric, metric.safeLimit)}</span>
                <em role="cell">{metric.criticalOverflow ? `+${formatScenePhysicalValue(metric, metric.overflow)} crítico` : "—"}</em>
              </div>
            ))}
          </div>
          <small className="rooms-debugger-physical-note">
            CPU/VBlank aparecem como medidos quando a ROM publica telemetria nativa. As demais colunas só mudam para “Runtime” quando o perfil fornecer amostra física correspondente.
            {presentation.physical.catalog.bgTiles !== undefined || presentation.physical.resident.bgTiles !== undefined
              ? ` Catálogo total BG: ${presentation.physical.catalog.bgTiles ?? "—"} · pico residente: ${presentation.physical.resident.bgTiles ?? "—"}.`
              : ""}
          </small>
        </section>
        {enabledMetrics.length > 0 ? (
          <div className="rooms-debugger-hardware-grid">
            {enabledMetrics.map((metric) => (
              <article aria-label={`Métrica ${metric.label}`} className={`rooms-debugger-hardware-card ${metric.tone}`} key={metric.id}>
                <div>
                  <strong>{metric.label}</strong>
                  <span>{metric.source === "measured" ? "Medido" : "Estimado"}</span>
                </div>
                <b>{formatHardwareProfilerMetric(metric)}</b>
                <div aria-hidden="true" className="rooms-debugger-hardware-meter">
                  <span style={{ width: `${Math.min(100, metric.percent)}%` }} />
                </div>
                <small>{metric.detail}</small>
              </article>
            ))}
          </div>
        ) : (
          <p>Ative CPU, VRAM, OAM, paleta, ROM ou RAM em Ajustes → Debug.</p>
        )}
      </div>
    </details>
  );
}

function formatProjectBudgetValue(metric: ProjectBudgetMetric): string {
  if (metric.unit === "bytes") {
    return `${formatHardwareProfilerBytes(metric.used)} / ${formatHardwareProfilerBytes(metric.capacity)}`;
  }
  const suffix = metric.unit === "colors" ? " cores" : metric.unit === "objects" ? " OBJ" : "";
  return `${metric.used} / ${metric.capacity}${suffix}`;
}

function projectBudgetStatusLabel(presentation: ProjectBudgetPresentation): string {
  if (!presentation.projectReady || presentation.tone === "error") return "Limite excedido";
  if (presentation.tone === "warning") return "Atenção necessária";
  return "Dentro dos limites";
}

function RoomProjectBudgetPanel({
  analysisError,
  generatedAt,
  onAnalyze,
  presentation,
  running
}: {
  analysisError?: string | null;
  generatedAt?: string | null;
  onAnalyze?(): void;
  presentation: ProjectBudgetPresentation;
  running?: boolean;
}): React.ReactElement {
  const sceneLabel = sceneDisplayName(presentation.sceneName);
  return (
    <section
      aria-label={`Orçamento GBA da cena ${sceneLabel}`}
      className={`room-project-budget ${presentation.tone}`}
    >
      <header className="room-project-budget-header">
        <div>
          <span>{presentation.source === "compiler" ? "Relatório do compilador" : "Estimativa ao vivo"}</span>
          <strong>{projectBudgetStatusLabel(presentation)}</strong>
          <small>
            {presentation.source === "compiler"
              ? `Cena ${sceneLabel} · pressão máxima ${presentation.maxScenePressure}%`
              : "Use a análise para validar compressão, bancos e fragmentação com o assetc."}
          </small>
        </div>
        <button
          aria-label="Analisar orçamento agora"
          disabled={running || !onAnalyze}
          onClick={onAnalyze}
          type="button"
        >
          {running ? "Analisando…" : "Analisar agora"}
        </button>
      </header>

      {analysisError ? <p className="room-project-budget-error">{analysisError}</p> : null}
      {generatedAt && presentation.source === "compiler" ? (
        <p className="room-project-budget-timestamp">Atualizado em {new Date(generatedAt).toLocaleString("pt-BR")}</p>
      ) : null}

      <div aria-label="Pressão de recursos da cena" className="room-project-budget-grid">
        {presentation.sceneMetrics.map((metric) => (
          <article aria-label={`Pressão ${metric.label}`} className={metric.tone} key={metric.id}>
            <div><strong>{metric.label}</strong><span>{metric.percent}%</span></div>
            <b>{formatProjectBudgetValue(metric)}</b>
            <div aria-hidden="true" className="room-project-budget-meter">
              <span style={{ width: `${Math.min(100, metric.percent)}%` }} />
            </div>
            <small>{metric.remaining} restante(s)</small>
          </article>
        ))}
      </div>

      <section aria-label="Compressão sugerida" className="room-project-budget-detail">
        <h5>Compressão</h5>
        {presentation.compression.length > 0 ? (
          <ul>
            {presentation.compression.map((candidate) => (
              <li key={`${candidate.asset}-${candidate.resourceLabel}`}>
                <strong>{candidate.strategyLabel}</strong>
                <span>{candidate.asset} · {candidate.resourceLabel}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>{presentation.source === "compiler" ? "Nenhum candidato detectado." : "Disponível depois da análise do compilador."}</p>
        )}
      </section>

      <section aria-label="Carga DMA por troca de banco" className="room-project-budget-detail">
        <h5>Carga DMA estimada</h5>
        <p>
          <strong>{formatHardwareProfilerBytes(presentation.dma.estimatedBytes)} / {formatHardwareProfilerBytes(presentation.dma.budgetBytes)}</strong>
          {` · ${presentation.dma.percent}% · ${presentation.dma.uploadCount} upload(s)`}
        </p>
        <p>{presentation.dma.action}</p>
        <small>Orçamento editorial de prefetch; não representa um limite físico isolado do DMA do GBA.</small>
      </section>

      <section aria-label="Fragmentação do projeto" className="room-project-budget-detail">
        <h5>Fragmentação do projeto</h5>
        {presentation.fragmentation.length > 0 ? (
          <ul>
            {presentation.fragmentation.map((item) => (
              <li key={item.id}>
                <strong>{item.label}</strong>
                <span>{item.freeFragments} blocos livres · maior bloco {item.largestFreeBlock}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>{presentation.source === "compiler" ? "Sem fragmentação relevante." : "Disponível depois da análise do compilador."}</p>
        )}
      </section>

      <footer>
        <span>Projeto: {presentation.projectReady ? "apto para exportação" : `${presentation.blockingOverflowCount} estouro(s) bloqueante(s)`}</span>
        <small>A análise roda fora da ROM e não adiciona overlays ao jogo.</small>
      </footer>
    </section>
  );
}

interface SceneMapCardDragState {
  canvasZoom: number;
  cleanup?: () => void;
  pointerID: number;
  previewPosition: SceneMapPosition;
  roomName: string;
  startPosition: SceneMapPosition;
  startX: number;
  startY: number;
}

interface CanvasPanDragState {
  pointerID: number;
  startScrollLeft: number;
  startScrollTop: number;
  startX: number;
  startY: number;
}

interface SelectedRoomCellState {
  roomID: string;
  cellIndex: number;
}

interface RoomImageSize {
  width: number;
  height: number;
}

const roomEditorToolModes: Array<{ id: RoomEditorToolPanelMode; label: string; hint: string; shortcut: string; Icon: LucideIcon }> = [
  { id: "select", label: "Selecionar", hint: "Mover", shortcut: ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS.find((binding) => binding.mode === "select")?.defaultKey ?? "v", Icon: MousePointer2 },
  { id: "paint", label: "Pintura", hint: "Tiles", shortcut: ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS.find((binding) => binding.mode === "paint")?.defaultKey ?? "b", Icon: Paintbrush },
  { id: "collision", label: "Colisao", hint: "Solidos", shortcut: ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS.find((binding) => binding.mode === "collision")?.defaultKey ?? "c", Icon: Shield },
  { id: "height", label: "Altura", hint: "Niveis 0 a 3", shortcut: ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS.find((binding) => binding.mode === "height")?.defaultKey ?? "h", Icon: Mountain },
  { id: "actor", label: "Ator", hint: "OBJ", shortcut: ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS.find((binding) => binding.mode === "actor")?.defaultKey ?? "a", Icon: UserRound },
  { id: "trigger", label: "Trigger", hint: "Eventos", shortcut: ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS.find((binding) => binding.mode === "trigger")?.defaultKey ?? "t", Icon: Zap },
  { id: "camera", label: "Zonas de câmera", hint: "Áreas", shortcut: ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS.find((binding) => binding.mode === "camera")?.defaultKey ?? "z", Icon: Camera },
  { id: "warp", label: "Chegada avançada", hint: "Portais", shortcut: ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS.find((binding) => binding.mode === "warp")?.defaultKey ?? "p", Icon: GitFork },
  { id: "hud", label: "HUD", hint: "240×160", shortcut: ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS.find((binding) => binding.mode === "hud")?.defaultKey ?? "u", Icon: Monitor }
];

const defaultCanvasLayerVisibility: Record<RoomCanvasLayerID, boolean> = {
  actors: true,
  background: true,
  collision: true,
  grid: true,
  hud: true,
  composition: false,
  hitboxes: true,
  triggers: true,
  cameraBounds: true,
  worldBounds: true
};

const defaultCanvasLayerLocks: Record<RoomCanvasLayerID, boolean> = {
  actors: false,
  background: false,
  collision: false,
  grid: false,
  hud: false,
  composition: false,
  hitboxes: false,
  triggers: false,
  cameraBounds: false,
  worldBounds: false
};

function roomToolUnavailableReason(
  mode: RoomEditorToolPanelMode,
  room: RoomsWorkspaceRoom,
  availableTools: readonly string[]
): string | null {
  if (mode === "warp" || mode === "hud") return null;
  const isometricConfig = roomIsometricConfig(room);
  if (mode === "paint" && (isometricConfig?.pagedSurface || isometricConfig?.worldMode === "static_composition")) {
    return "O cenário usa imagens compostas. Edite o fundo na seção Fundo; colisão e altura continuam editáveis.";
  }
  if (availableTools.includes(mode)) return null;
  if (mode === "collision") return "Colisão por tiles não é exportada para este tipo de cena.";
  if (mode === "trigger") return "Gatilhos de gameplay não são exportados para este tipo de cena.";
  if (mode === "height") return "Altura está disponível apenas em cenas isométricas.";
  return `A ferramenta não faz parte do runtime ${sceneTypeLabel(room.sceneType)}.`;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

const ROOM_CANVAS_ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.61, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const ROOM_CANVAS_WORLD_MIN_WIDTH = 1240;
const ROOM_CANVAS_WORLD_MIN_HEIGHT = 860;

interface SceneMapVisualMetrics {
  cardDensity: "mini" | "compact" | "comfortable";
  connectorMarkerSize: number;
  worldStyle: CSSProperties;
}

function sceneMapVisualMetrics(zoom: number): SceneMapVisualMetrics {
  const normalizedZoom = Math.min(1, Math.max(0, (clampSceneMapZoom(zoom) - SCENE_MAP_MIN_ZOOM) / (2 - SCENE_MAP_MIN_ZOOM)));
  const value = (minimum: number, maximum: number): string => (
    `${Math.round((minimum + (maximum - minimum) * normalizedZoom) * 100) / 100}px`
  );
  const connectorMarkerSize = Math.round((4 + 4 * normalizedZoom) * 100) / 100;
  const cardChrome = sceneMapCardChromeSize(zoom);

  return {
    cardDensity: zoom <= 0.5 ? "mini" : zoom <= 1 ? "compact" : "comfortable",
    connectorMarkerSize,
    worldStyle: {
      "--room-map-action-icon-size": value(10, 13),
      "--room-map-action-size": value(18, 24),
      "--room-map-card-footer-height": `${cardChrome.footerHeight}px`,
      "--room-map-card-gap": value(3, 8),
      "--room-map-card-header-height": `${cardChrome.headerHeight}px`,
      "--room-map-card-meta-font-size": value(8, 10),
      "--room-map-card-padding-x": value(5, 9),
      "--room-map-card-padding-y": value(4, 7),
      "--room-map-card-title-font-size": value(11, 15),
      "--room-map-connector-derived-stroke": value(1.5, 3),
      "--room-map-connector-label-font-size": value(9, 15),
      "--room-map-connector-label-stroke": value(2.5, 5),
      "--room-map-connector-selected-stroke": value(2.25, 5),
      "--room-map-connector-stroke": value(1.75, 4)
    } as CSSProperties
  };
}

interface RoomStageCardSize {
  canvasDisplayHeight: number;
  canvasHeight: number;
  height: number;
  width: number;
}

function editModeForToolPanel(mode: RoomEditorToolPanelMode): RoomCanvasEditMode {
  if (mode === "select") return "select";
  if (mode === "collision") return "collision";
  if (mode === "height") return "height";
  if (mode === "actor" || mode === "trigger") return "entities";
  if (mode === "camera") return "select";
  if (mode === "warp") return "select";
  if (mode === "hud") return "select";
  return "tiles";
}

function projectDisplayName(projectPath: string | undefined): string {
  if (!projectPath) return "Novo projeto";
  const fileName = projectPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  return fileName.replace(/\.gba-project$/i, "") || "Novo projeto";
}

function resolveRoomAssetURL(
  projectPath: string | undefined,
  source: string | null,
  bundledDefaultAsset?: string | null
): string | null {
  return resolveAssetURL(projectPath, source, bundledDefaultAsset);
}

function resolveProjectAssetURL(
  projectData: GBAProjectData | null | undefined,
  projectPath: string | undefined,
  assetName: string
): string | null {
  const assets = Array.isArray(projectData?.assets) ? projectData.assets : [];
  const asset = assets.find((candidate) => (
    typeof candidate === "object" && candidate !== null && candidate.name === assetName
  ));
  if (!asset || typeof asset !== "object") return null;
  const metadata = typeof asset.metadata === "object" && asset.metadata !== null
    ? asset.metadata as Record<string, unknown>
    : {};
  const source = typeof metadata.source === "string"
    ? metadata.source
    : typeof asset.relativePath === "string"
      ? asset.relativePath
      : null;
  const bundledDefaultAsset = typeof asset.bundledDefaultAsset === "string"
    ? asset.bundledDefaultAsset
    : typeof metadata.bundledDefaultAsset === "string"
      ? metadata.bundledDefaultAsset
      : null;
  return resolveAssetURL(projectPath, source, bundledDefaultAsset);
}

function affineAssetOptions(projectData: GBAProjectData | null | undefined): Array<{ label: string; value: string }> {
  const assets = Array.isArray(projectData?.assets) ? projectData.assets : [];
  return assets.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const asset = candidate as Record<string, unknown>;
    const metadata = asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
      ? asset.metadata as Record<string, unknown>
      : {};
    const kind = typeof metadata.kind === "string"
      ? metadata.kind
      : typeof asset.kind === "string"
        ? asset.kind
        : "";
    const name = typeof asset.name === "string" ? asset.name.trim() : "";
    return kind.toLowerCase() === "affine_bg" && name
      ? [{ label: name, value: name }]
      : [];
  });
}

function sceneCompositionAssetOptions(projectData: GBAProjectData | null | undefined): Array<{ label: string; value: string }> {
  const assets = Array.isArray(projectData?.assets) ? projectData.assets : [];
  const excludedKinds = new Set(["audio", "music", "sfx", "pcm", "tracker", "font"]);
  return assets.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const asset = candidate as Record<string, unknown>;
    const metadata = asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
      ? asset.metadata as Record<string, unknown>
      : {};
    const kind = typeof metadata.kind === "string"
      ? metadata.kind
      : typeof asset.kind === "string" ? asset.kind : "";
    const name = typeof asset.name === "string" ? asset.name.trim() : "";
    return name && !excludedKinds.has(kind.toLowerCase())
      ? [{ label: name, value: name }]
      : [];
  });
}

function affineAssetSourceSize(
  projectData: GBAProjectData | null | undefined,
  assetName: string
): AffineSceneSourceSize | undefined {
  const assets = Array.isArray(projectData?.assets) ? projectData.assets : [];
  const asset = assets.find((candidate) => (
    candidate && typeof candidate === "object" && !Array.isArray(candidate) && candidate.name === assetName
  ));
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) return undefined;
  const metadata = asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
    ? asset.metadata as Record<string, unknown>
    : {};
  const width = typeof metadata.width === "number" && Number.isFinite(metadata.width) ? Math.round(metadata.width) : 0;
  const height = typeof metadata.height === "number" && Number.isFinite(metadata.height) ? Math.round(metadata.height) : 0;
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function resolveRoomBackgroundURL(
  projectPath: string | undefined,
  room: RoomsWorkspaceRoom
): string | null {
  return resolveAssetURLWithBundledDefault(
    projectPath,
    room.backgroundSource,
    room.backgroundBundledDefaultAsset
  );
}

function resolveRoomBackgroundLayerURLs(
  projectPath: string | undefined,
  room: RoomsWorkspaceRoom
): Array<{ fallbackURL: string | null; mapping: string; url: string }> {
  const authoredLayers = (room.backgroundLayers ?? []).flatMap((layer) => {
    const url = resolveRoomAssetURL(projectPath, layer.source, layer.bundledDefaultAsset);
    const fallbackURL = resolveAssetURL(undefined, null, layer.bundledDefaultAsset);
    return url ? [{ fallbackURL, mapping: layer.mapping, url }] : [];
  });
  if (authoredLayers.length > 0) return authoredLayers;

  const fallbackURL = resolveRoomBackgroundURL(projectPath, room);
  return fallbackURL ? [{
    fallbackURL: resolveAssetURL(undefined, null, room.backgroundBundledDefaultAsset),
    mapping: "BG2",
    url: fallbackURL
  }] : [];
}

function roomIsometricConfig(room: RoomsWorkspaceRoom): IsometricSceneConfig | undefined {
  if (room.sceneType !== "isometric") return undefined;
  return normalizeIsometricSceneConfig(room.runtime?.type === "isometric" ? room.runtime.config : undefined);
}

function roomRuntimeHudAsset(room: RoomsWorkspaceRoom | null): string | undefined {
  if (!room) return undefined;
  if (room.runtime?.type === "luta") {
    const asset = (room.runtime.config as Record<string, unknown> | undefined)?.hudAssetName;
    return typeof asset === "string" ? asset : undefined;
  }
  const config = roomIsometricConfig(room);
  return config?.tacticalCapabilities?.some(capability => capability.id === "tactical_hud" && capability.enabled)
    ? config.tacticalPresentation?.hudLayout : undefined;
}

function roomIsometricSurfaceSize(room: RoomsWorkspaceRoom): IsometricWorldSize | undefined {
  const config = roomIsometricConfig(room);
  if (!config) return undefined;
  if (config.pagedSurface) return { width: config.pagedSurface.width, height: config.pagedSurface.height };
  const pages = config.tacticalPresentation?.surfacePages ?? [];
  const bounds = pages.reduce(
    (current, page) => ({
      maxX: Math.max(current.maxX, page.world.x + page.world.width),
      maxY: Math.max(current.maxY, page.world.y + page.world.height),
      minX: Math.min(current.minX, page.world.x),
      minY: Math.min(current.minY, page.world.y)
    }),
    { maxX: 0, maxY: 0, minX: 0, minY: 0 }
  );
  const width = Math.max(0, bounds.maxX - bounds.minX);
  const height = Math.max(0, bounds.maxY - bounds.minY);
  if (width > 0 && height > 0) return { height, width };
  if (config.worldMode === "static_composition" && room.gbStudioUseBackgroundLayout
    && (room.backgroundPixelWidth ?? 0) > 0 && (room.backgroundPixelHeight ?? 0) > 0) {
    return { width: room.backgroundPixelWidth!, height: room.backgroundPixelHeight! };
  }
  return undefined;
}

function roomIsometricElevationPercent(room: RoomsWorkspaceRoom, x: number, y: number, z?: number): number {
  const config = roomIsometricConfig(room);
  if (!config) return 0;
  const surfaceSize = roomIsometricSurfaceSize(room) ?? deriveIsometricWorldSize({
    config, atlasTileHeight: room.backgroundAtlasTileHeight, height: room.height, width: room.width
  });
  const elevation = z ?? room.heightLevels?.[Math.floor(y) * room.width + Math.floor(x)] ?? 0;
  return elevation * config.heightStep / Math.max(1, surfaceSize.height) * 100;
}

function roomTileCenterStyle(room: RoomsWorkspaceRoom, x: number, y: number): CSSProperties {
  if (room.sceneType === "isometric") {
    const placement = isometricRoomTilePlacement(room.width, room.height, x, y,
      roomIsometricConfig(room), room.backgroundAtlasTileHeight, roomIsometricSurfaceSize(room));
    return {
      left: `${placement.leftPercent + placement.widthPercent / 2}%`,
      top: `${placement.topPercent + placement.heightPercent / 2 - roomIsometricElevationPercent(room, x, y)}%`
    };
  }
  return { left: `${(x + 0.5) / room.width * 100}%`, top: `${(y + 0.5) / room.height * 100}%` };
}

function roomSceneResolutionLabel(room: RoomsWorkspaceRoom): string {
  if (room.sceneType !== "isometric") return room.gbaResolution;
  const size = roomIsometricSurfaceSize(room) ?? deriveIsometricWorldSize({
    atlasTileHeight: room.backgroundAtlasTileHeight,
    config: roomIsometricConfig(room),
    height: room.height,
    width: room.width
  });
  return `${size.width} × ${size.height}`;
}

function IsometricPagedForeground({room, projectData, projectPath, assetRefreshToken = 0}: {
  room: RoomsWorkspaceRoom; projectData: GBAProjectData | null | undefined; projectPath: string | undefined;
  assetRefreshToken?: number;
}): React.ReactElement | null {
  const surface = roomIsometricConfig(room)?.pagedSurface;
  const url = refreshedPreviewAssetURL(surface ? resolveProjectAssetURL(projectData, projectPath, surface.foregroundAsset) : null, assetRefreshToken);
  return url ? <img alt="Corrimãos frontais" className="room-stage-background-layout" data-isometric-paged-foreground
    draggable={false} src={url} style={{zIndex: 100}} /> : null;
}

function tacticalSurfacePagesForRoom(room: RoomsWorkspaceRoom): IsoTacticalSurfacePage[] {
  const config = roomIsometricConfig(room);
  if (!config) return [];
  return config.tacticalPresentation?.surfacePages ?? [];
}

function roomIsometricInitialCameraBounds(room: RoomsWorkspaceRoom): IsometricProjectionBounds | undefined {
  const firstPage = tacticalSurfacePagesForRoom(room)[0];
  return firstPage ? { ...firstPage.world } : undefined;
}

function hasResolvableTacticalSurfacePage(
  pages: IsoTacticalSurfacePage[],
  projectData: GBAProjectData | null | undefined,
  projectPath: string | undefined
): boolean {
  return pages.some((page) => Boolean(resolveProjectAssetURL(projectData, projectPath, page.asset)));
}

interface RoomStagePreviewSize {
  height: number;
  width: number;
}

interface TacticalSurfacePreviewOverlayProps {
  previewSize: RoomStagePreviewSize;
  pages: IsoTacticalSurfacePage[];
  projectData?: GBAProjectData | null;
  projectPath?: string;
  assetRefreshToken?: number;
}

function TacticalSurfacePreviewOverlay({
  previewSize,
  pages,
  projectData,
  projectPath,
  assetRefreshToken = 0
}: TacticalSurfacePreviewOverlayProps): React.ReactElement | null {
  const [sourceSizes, setSourceSizes] = useState<Record<string, { width: number; height: number }>>({});
  const bounds = pages.reduce(
    (current, page) => ({
      maxX: Math.max(current.maxX, page.world.x + page.world.width),
      maxY: Math.max(current.maxY, page.world.y + page.world.height),
      minX: Math.min(current.minX, page.world.x),
      minY: Math.min(current.minY, page.world.y)
    }),
    { maxX: 0, maxY: 0, minX: 0, minY: 0 }
  );
  const worldWidth = Math.max(1, bounds.maxX - bounds.minX);
  const worldHeight = Math.max(1, bounds.maxY - bounds.minY);
  const resolvedPages = pages.flatMap((page) => {
    const url = refreshedPreviewAssetURL(resolveProjectAssetURL(projectData, projectPath, page.asset), assetRefreshToken);
    return url ? [{ page, url }] : [];
  });
  if (resolvedPages.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="room-stage-tactical-surface-preview"
      data-tactical-surface-pages={resolvedPages.length}
      style={{ height: `${previewSize.height}px`, width: `${previewSize.width}px` }}
      >
        {resolvedPages.map(({ page, url }) => {
          const sourceSize = sourceSizes[url] ?? { width: 256, height: 256 };
          return (
        <div
          aria-hidden="true"
          className="room-stage-tactical-surface-page"
          data-tactical-surface-page={page.id}
          data-tactical-surface-source-crop={`${sourceSize.width}x${sourceSize.height}-to-${page.world.width}x${page.world.height}`}
          key={`${page.id}-${url}`}
          style={{
            height: `${(page.world.height / worldHeight) * 100}%`,
            left: `${((page.world.x - bounds.minX) / worldWidth) * 100}%`,
            top: `${((page.world.y - bounds.minY) / worldHeight) * 100}%`,
            width: `${(page.world.width / worldWidth) * 100}%`
          }}
        >
          <img
            alt=""
            className="room-stage-tactical-surface-page-image"
            draggable={false}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth > 0 && naturalHeight > 0) {
                setSourceSizes((current) => current[url]?.width === naturalWidth && current[url]?.height === naturalHeight
                  ? current
                  : { ...current, [url]: { width: naturalWidth, height: naturalHeight } });
              }
            }}
            src={url}
            style={{
              height: `${(sourceSize.height / page.world.height) * 100}%`,
              width: `${(sourceSize.width / page.world.width) * 100}%`
            }}
          />
        </div>
          );
        })}
    </div>
  );
}

function roomDungeonConfig(room: RoomsWorkspaceRoom): DungeonCrawlerSceneConfig | undefined {
  if (room.sceneType !== "dungeonCrawler") return undefined;
  return normalizeDungeonCrawlerSceneConfig(room.runtime?.type === "dungeonCrawler" ? room.runtime.config : undefined);
}

function dungeonHudPreviewText(component: HudComponent, room?: RoomsWorkspaceRoom): string | null {
  if (!room || room.sceneType !== "dungeonCrawler") return null;
  const config = roomDungeonConfig(room);
  const feature = resolveDungeonCrawlerFeatureRuntime(config?.modules);
  const componentID = component.id.toLocaleLowerCase("pt-BR");
  const componentLabel = component.label.toLocaleLowerCase("pt-BR");
  if (componentID.includes("map-row") || componentLabel.startsWith("mapa")) {
    return feature.mapEnabled ? "??????" : "------";
  }
  if (componentID.endsWith("-hp") || componentLabel === "vida") {
    return `HP ${String(feature.battle?.maxHp ?? 3).padStart(2, "0")}`;
  }
  if (componentID.endsWith("-item") || componentLabel === "item") {
    return feature.inventory?.label ?? "ITEM";
  }
  if (componentID.endsWith("-count") || componentLabel === "quantidade") {
    return `QTD ${String(feature.inventory?.initialQuantity ?? 0).padStart(2, "0")}`;
  }
  return null;
}

interface RoomHudOverlayProps {
  labelPrefix?: string;
  canEdit?: boolean;
  guides?: boolean;
  libraryPreview?: boolean;
  onUpdateHudPreset?(presetID: string, fields: UpdateHudPresetFields): void;
  binding: HudPresetBinding;
  entities?: RoomsWorkspaceEntity[];
  editable?: boolean;
  onSelectComponent?(componentID: string | null): void;
  projectData?: GBAProjectData | null;
  projectPath?: string;
  room?: RoomsWorkspaceRoom;
  selectedComponentID?: string | null;
  viewportAnchored?: boolean;
  viewportScale: number;
}

export function RoomHudOverlay({
  labelPrefix = "Preview da HUD",
  canEdit = false,
  guides = true,
  libraryPreview = false,
  onUpdateHudPreset,
  binding,
  entities = [],
  editable = false,
  onSelectComponent,
  projectData,
  projectPath,
  room,
  selectedComponentID,
  viewportAnchored = false,
  viewportScale
}: RoomHudOverlayProps): React.ReactElement {
  const [draft, setDraft] = useState<HudComponent | null>(null);
  const gesture = useRef<{ original: HudComponent; draft: HudComponent; x: number; y: number; pointerID: number; resize: boolean } | null>(null);
  useEffect(() => { gesture.current = null; setDraft(null); }, [binding.presetId, editable, canEdit]);
  const preset = draft ? { ...binding.preset, components: binding.preset.components.map(component => component.id === draft.id ? draft : component) } : binding.preset;
  const commit = (component: HudComponent) => {
    if (!canEdit) return;
    onUpdateHudPreset?.(preset.id, { components: binding.preset.components.map(item => item.id === component.id ? component : item) });
  };
  const startGesture = (event: React.PointerEvent<HTMLButtonElement>, component: HudComponent, resize = false) => {
    event.stopPropagation();
    onSelectComponent?.(component.id);
    if (!canEdit || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { original: component, draft: component, x: event.clientX, y: event.clientY, pointerID: event.pointerId, resize };
  };
  const moveGesture = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointerID !== event.pointerId) return;
    event.stopPropagation();
    const dx = (event.clientX - current.x) / scale;
    const dy = (event.clientY - current.y) / scale;
    current.draft = updateHudComponentGeometry(current.original, current.resize
      ? { width: current.original.width + dx, height: current.original.height + dy }
      : { x: current.original.x + dx, y: current.original.y + dy });
    setDraft(current.draft);
  };
  const finishGesture = (event: React.PointerEvent<HTMLButtonElement>, cancel = false) => {
    const current = gesture.current;
    if (!current || current.pointerID !== event.pointerId) return;
    event.stopPropagation();
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDraft(null);
    if (!cancel && ["x", "y", "width", "height"].some(key => current.original[key as keyof HudComponent] !== current.draft[key as keyof HudComponent])) commit(current.draft);
  };
  const keyboardGeometry = (event: React.KeyboardEvent<HTMLButtonElement>, component: HudComponent, resize = false) => {
    if (event.key === "Escape") { event.stopPropagation(); gesture.current = null; setDraft(null); return; }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction) return;
    event.stopPropagation();
    event.preventDefault();
    if (!canEdit) return;
    const step = event.shiftKey ? 16 : 8;
    commit(updateHudComponentGeometry(component, resize
      ? { width: component.width + direction[0] * step, height: component.height + direction[1] * step }
      : { x: component.x + direction[0] * step, y: component.y + direction[1] * step }));
  };
  const scale = Number.isFinite(viewportScale) && viewportScale > 0 ? viewportScale : 1;
  const assetURL = (assetName: string): string | null => resolveProjectAssetURL(projectData, projectPath, assetName);
  const presetBackgroundURL = assetURL(preset.backgroundImage);
  const componentAssetURL = (component: HudComponent): string | null => (
    assetURL(component.asset) ?? (component.kind === "frame" ? presetBackgroundURL : null)
  );
  const componentStyle = (component: HudComponent): CSSProperties => ({
    height: `${component.height * scale}px`,
    left: `${component.x * scale}px`,
    top: `${component.y * scale}px`,
    width: `${component.width * scale}px`,
    zIndex: component.zIndex + 4
  });

  return (
    <div
      aria-label={`${labelPrefix} ${preset.name} · origem ${hudPresetBindingSourceLabel(binding.source)}`}
      className={`room-hud-overlay${editable ? " is-editable" : ""}${viewportAnchored ? " is-viewport-anchored" : ""}${guides ? "" : " without-guides"}`}
      data-hud-binding-source={binding.source}
      data-hud-binding-status={binding.status}
      data-hud-preset-id={preset.id}
      data-hud-requested-preset-id={binding.requestedPresetId ?? undefined}
      data-hud-preview-state={room?.sceneType === "dungeonCrawler" ? "frozen" : undefined}
      role={editable ? "group" : "img"}
      style={{
        backgroundSize: `${8 * scale}px ${8 * scale}px`,
        height: `${160 * scale}px`,
        width: `${240 * scale}px`
      }}
    >
      <span aria-hidden="true" className="room-hud-overlay-meta">
        <strong>HUD · 240×160</strong>
        <span>{libraryPreview ? "Prévia da biblioteca" : `Origem: ${hudPresetBindingSourceLabel(binding.source)}`}</span>
        {room?.sceneType === "dungeonCrawler" ? <span>Estado: congelado</span> : null}
      </span>
      <HudPreviewSnapshot
        actionLabel="A: confirmar"
        backgroundAssetURL={presetBackgroundURL}
        fontAssetURL={assetURL(preset.font || (projectData ? resolveSceneDialogueUiSettings(projectData, room?.id).font : ""))}
        className="room-hud-overlay-rendered"
        preset={preset}
        resolveComponentAssetURL={componentAssetURL}
        transparentBackground
      />
      {room?.sceneType === "menu" && entities.filter(entity => {
        if (entity.kind !== "actor") return false;
        const actor = Array.isArray(projectData?.actors) ? projectData.actors.find(actor => actor.id === entity.id) : null;
        if (actor?.menuActorSelectedOnly === true && actor.menuItemID !== normalizeMenuSceneConfig(room.runtime?.config).items[0]?.id) return false;
        if (!actor?.menuVisibilityVariable) return true;
        const variable = Array.isArray(projectData?.variables) ? projectData.variables.find(variable => variable.name === actor.menuVisibilityVariable) : null;
        return Number(variable?.initialValue ?? 0) === Number(actor.menuVisibilityValue ?? 0);
      }).map(entity => (
        <span
          aria-hidden="true"
          data-hud-menu-actor={entity.id}
          key={entity.id}
          style={{ ...roomEntityStyle(room, entity, resolveRoomAssetURL(projectPath, entity.spriteSource ?? null, entity.spriteBundledDefaultAsset ?? null), entity.spriteSource && entity.spriteFrame ? { [entity.spriteSource]: { width: entity.spriteFrame.sourceWidth, height: entity.spriteFrame.sourceHeight } } : {}), position: "absolute", backgroundRepeat: "no-repeat", imageRendering: "pixelated", zIndex: 2 }}
        />
      ))}
      {binding.status === "missing" ? (
        <span aria-hidden="true" className="room-hud-overlay-status">Preset não encontrado · fallback do projeto</span>
      ) : null}
      {preset.mode === "advanced" ? preset.components.filter((component) => component.visible).map((component) => (
        editable ? (
          <Fragment key={`${preset.id}-${component.id}`}>
          <button
            aria-label={`Editar ${component.label || component.kind}`}
            aria-pressed={selectedComponentID === component.id}
            className={`room-hud-overlay-component kind-${component.kind}${selectedComponentID === component.id ? " is-selected" : ""}`}
            data-hud-component-id={component.id}
            data-hud-component-state={component.kind === "bar" ? "geometry-only" : undefined}
            key={`${preset.id}-${component.id}`}
            onClick={(event) => {
              event.stopPropagation();
              onSelectComponent?.(component.id);
            }}
            onPointerDown={event => startGesture(event, component)}
            onPointerMove={moveGesture}
            onPointerUp={event => finishGesture(event)}
            onPointerCancel={event => finishGesture(event, true)}
            onLostPointerCapture={event => finishGesture(event, true)}
            onKeyDown={event => keyboardGeometry(event, component)}
            style={componentStyle(component)}
            type="button"
          >
            {dungeonHudPreviewText(component, room) ? <span className="studio-visually-hidden">{dungeonHudPreviewText(component, room)}</span> : null}
          </button>
          {canEdit && selectedComponentID === component.id ? <button
            type="button" className="room-hud-resize-handle" aria-label={`Redimensionar ${component.label || component.kind}`}
            style={{ left: (component.x + component.width) * scale - 12, top: (component.y + component.height) * scale - 12, zIndex: 24 }}
            onClick={event => event.stopPropagation()}
            onPointerDown={event => startGesture(event, component, true)} onPointerMove={moveGesture}
            onPointerUp={event => finishGesture(event)} onPointerCancel={event => finishGesture(event, true)}
            onLostPointerCapture={event => finishGesture(event, true)} onKeyDown={event => keyboardGeometry(event, component, true)}
          /> : null}
          </Fragment>
        ) : (
          <span
            aria-hidden="true"
            className={`room-hud-overlay-component kind-${component.kind}`}
            data-hud-component-id={component.id}
            data-hud-component-state={component.kind === "bar" ? "geometry-only" : undefined}
            key={`${preset.id}-${component.id}`}
            style={componentStyle(component)}
          >
            {dungeonHudPreviewText(component, room) ? <span className="studio-visually-hidden">{dungeonHudPreviewText(component, room)}</span> : null}
          </span>
        )
      )) : (
        <span aria-hidden="true" data-hud-component-id="standard-frame" />
      )}
    </div>
  );
}

interface AffineScenePreviewOverlayProps {
  cardSize: RoomStageCardSize;
  presentation: AffineScenePresentation;
  projectData?: GBAProjectData | null;
  projectPath?: string;
  room: RoomsWorkspaceRoom;
}

function sceneCompositionForRoomPreview(room: RoomsWorkspaceRoom): SceneCompositionConfig {
  const config = room.runtime?.config as SceneFeatureRuntimeConfig | undefined;
  return Object.hasOwn(config ?? {}, "composition")
    ? normalizeSceneComposition(config?.composition)
    : sceneCompositionFromAffinePresentation(config?.affine);
}

function roomAffineObjPreview(room: RoomsWorkspaceRoom) {
  const config = room.runtime?.config as SceneFeatureRuntimeConfig | undefined;
  return resolveSceneAffineObjPreview(room.sceneType, config?.capabilities);
}

function AffineScenePreviewOverlay({
  cardSize,
  presentation,
  projectData,
  projectPath,
  room
}: AffineScenePreviewOverlayProps): React.ReactElement | null {
  const normalized = normalizeAffineScenePresentation(presentation);
  if (!normalized.enabled) return null;
  const matrix = affineMatrixForScenePresentation(
    normalized,
    affineAssetSourceSize(projectData, normalized.assetId)
  );
  const affineURL = normalized.assetId
    ? resolveProjectAssetURL(projectData, projectPath, normalized.assetId)
    : null;
  const previewStyle: CSSProperties = {
    height: `${cardSize.canvasDisplayHeight}px`,
    transform: `rotate(${normalized.rotationDegrees}deg) scale(${normalized.scaleX}, ${normalized.scaleY})`,
    transformOrigin: `${(normalized.pivotX / 240) * 100}% ${(normalized.pivotY / 160) * 100}%`,
    width: `${cardSize.width}px`
  };

  return (
    <div
      aria-label={`Prévia congelada da camada Affine da cena ${sceneDisplayName(room.name)}`}
      className="room-affine-preview-layer"
      data-affine-asset-id={normalized.assetId || undefined}
      data-affine-layer={normalized.layer}
      data-affine-pa={matrix.pa}
      data-affine-pb={matrix.pb}
      data-affine-pc={matrix.pc}
      data-affine-pd={matrix.pd}
      data-affine-preview-state="frozen"
      data-affine-wrap={normalized.wrap ? "true" : "false"}
      role="img"
      style={previewStyle}
    >
      {affineURL ? <img alt="" draggable={false} src={affineURL} /> : null}
      <span className="room-affine-preview-label">
        {normalized.assetId ? `Affine · ${normalized.layer}` : "Affine ativado · selecione um asset"}
      </span>
    </div>
  );
}

function SceneCompositionPreviewOverlay({
  cardSize,
  composition,
  projectData,
  projectPath,
  room
}: {
  cardSize: RoomStageCardSize;
  composition: SceneCompositionConfig;
  projectData?: GBAProjectData | null;
  projectPath?: string;
  room: RoomsWorkspaceRoom;
}): React.ReactElement | null {
  if (!composition.enabled) return null;
  if (composition.mode === "affine") {
    return (
      <AffineScenePreviewOverlay
        cardSize={cardSize}
        presentation={sceneCompositionToAffinePresentation(composition)}
        projectData={projectData}
        projectPath={projectPath}
        room={room}
      />
    );
  }
  if (!composition.mode.startsWith("bitmap")) return null;
  const bitmapLayer = composition.layers.find((layer) => layer.enabled && layer.kind === "bitmap");
  const bitmapURL = bitmapLayer?.assetId
    ? resolveProjectAssetURL(projectData, projectPath, bitmapLayer.assetId)
    : null;
  const effectLabels = [
    composition.effects.blend.enabled ? "blend" : null,
    composition.effects.mosaic.enabled ? "mosaic" : null,
    composition.effects.window0.enabled || composition.effects.window1.enabled ? "window" : null,
    composition.effects.hblank.enabled ? "HBlank/HDMA" : null
  ].filter((entry): entry is string => Boolean(entry));
  return (
    <div
      aria-label={`Prévia congelada da composição ${composition.mode} da cena ${sceneDisplayName(room.name)}`}
      className="room-affine-preview-layer"
      data-composition-effects={effectLabels.join(",") || undefined}
      data-composition-mode={composition.mode}
      data-composition-page={bitmapLayer ? bitmapLayer.bitmapPage : undefined}
      role="img"
      style={{ height: `${cardSize.canvasDisplayHeight}px`, width: `${cardSize.width}px` }}
    >
      {bitmapURL ? <img alt="" draggable={false} src={bitmapURL} /> : null}
      <span className="room-affine-preview-label">
        {bitmapLayer?.assetId ? `${composition.mode} · ${bitmapLayer.assetId}` : `${composition.mode} ativado · selecione um asset`}
      </span>
    </div>
  );
}

function menuOverlayBoxStyle(box: { x: number; y: number; width: number; height: number }): CSSProperties {
  return {
    height: `${Math.max(1, box.height) / 160 * 100}%`,
    left: `${Math.max(0, box.x) / 240 * 100}%`,
    top: `${Math.max(0, box.y) / 160 * 100}%`,
    width: `${Math.max(1, box.width) / 240 * 100}%`
  };
}

interface RoomMenuCompositionOverlayProps {
  room: RoomsWorkspaceRoom;
  screenID?: string;
  selectedItemIndex?: number;
}

function RoomMenuCompositionOverlay({ room, screenID, selectedItemIndex = 0 }: RoomMenuCompositionOverlayProps): React.ReactElement | null {
  if (room.runtime?.type !== "menu") return null;
  const config = normalizeMenuSceneConfig(room.runtime.config);
  const screen = config.screens?.find((candidate) => candidate.id === screenID);
  const preview = deriveMenuSceneEditorPreview(screen ? { ...config, ...screen, role: config.role } : config);
  const isGenderSelection = preview.role === "gender_select";
  const textInput = preview.textInput;

  return (
    <div
      aria-label={isGenderSelection
        ? "Prévia visual da escolha de gênero"
        : textInput
          ? "Prévia visual da entrada do nome"
          : `Prévia visual do menu ${preview.title}`}
      className={`room-menu-composition-overlay is-${preview.screenType} is-${preview.role}`}
      data-menu-preview-role={preview.role}
      data-menu-preview-screen-type={preview.screenType}
      data-menu-preview-cursor-index={textInput ? String(textInput.cursorIndex) : undefined}
      data-menu-preview-selected-item={preview.selectedItemID ?? undefined}
      role="img"
    >
      {preview.items.filter((_, index) => !screen?.carousel || index === selectedItemIndex).map((item) => (
        <span
          aria-hidden="true"
          className={`room-menu-item-guide${item.selected ? " is-selected" : ""}${item.enabled ? "" : " is-disabled"}`}
          key={`menu-item-guide-${item.id}`}
          style={menuOverlayBoxStyle(item.clickBox)}
        >
          <strong>{item.label}</strong>
          <small>{item.id === "male" ? "gênero = 0" : item.id === "female" ? "gênero = 1" : item.action}</small>
        </span>
      ))}
      {isGenderSelection ? (
        <span aria-hidden="true" className="room-menu-profile-status">
          <strong>Perfil do jogador</strong>
          <span>Escolha o sprite e a animação antes de confirmar.</span>
        </span>
      ) : null}
      {textInput ? (
        <>
          <span
            aria-hidden="true"
            className="room-menu-name-input-guide"
            style={menuOverlayBoxStyle({
              x: textInput.surface.x * 8,
              y: textInput.surface.y * 8,
              width: textInput.surface.width * 8,
              height: textInput.surface.height * 8
            })}
          >
            <strong>
              {textInput.slots.map((slot, index) => (
                <span className={index === textInput.cursorIndex ? "is-cursor" : ""} key={`name-slot-${index}`}>{slot}</span>
              ))}
            </strong>
            <small>{textInput.variableName} · {textInput.maxLength} caracteres</small>
          </span>
          {textInput.keyboard ? (
            <>
              <span
                aria-hidden="true"
                className={`room-menu-keyboard-guide${textInput.keyboard.controlLayout === "side" ? " is-side" : ""}`}
                style={menuOverlayBoxStyle({
                  height: textInput.keyboard.height * 8,
                  width: textInput.keyboard.width * 8,
                  x: textInput.keyboard.x * 8,
                  y: textInput.keyboard.y * 8
                })}
              >
                <span className="room-menu-keyboard-guide-letters">
                  {textInput.keyboard.letterRows.map((row, rowIndex) => (
                    <span className="room-menu-keyboard-guide-row" key={`keyboard-row-${rowIndex}`}>
                      {row.map((letter, columnIndex) => <span key={`keyboard-key-${rowIndex}-${columnIndex}`}>{letter || "·"}</span>)}
                    </span>
                  ))}
                </span>
                <span className="room-menu-keyboard-guide-controls">
                  {textInput.keyboard.controls.map((control) => (
                    <span className={control.enabled ? "" : "is-disabled"} key={control.id}>{control.label}</span>
                  ))}
                </span>
              </span>
              {textInput.keyboard.controlLayout === "side" ? (
                <span
                  aria-hidden="true"
                  className="room-menu-keyboard-side-controls"
                  style={menuOverlayBoxStyle({
                    height: (textInput.keyboard.controlsHeight ?? 6) * 8,
                    width: (textInput.keyboard.controlsWidth ?? 6) * 8,
                    x: (textInput.keyboard.controlsX ?? textInput.keyboard.x + textInput.keyboard.width + 1) * 8,
                    y: (textInput.keyboard.controlsY ?? textInput.keyboard.y) * 8
                  })}
                >
                  {textInput.keyboard.controls.map((control) => (
                    <span className={control.enabled ? "" : "is-disabled"} key={`side-${control.id}`}>{control.label}</span>
                  ))}
                </span>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function roomEntityStyle(
  room: RoomsWorkspaceRoom,
  entity: RoomsWorkspaceEntity,
  spriteURL: string | null,
  spriteImageSizes: Record<string, RoomImageSize>
): CSSProperties {
  const frame = entity.kind === "actor" ? entity.spriteFrame ?? null : null;
  const affineObj = entity.kind === "actor" ? roomAffineObjPreview(room) : null;
  const imageSize = entity.spriteSource ? spriteImageSizes[entity.spriteSource] : undefined;
  const basePlacement = frame
    ? gbaActorSpriteRoomPlacementFromFrame(entity.x, entity.y, frame)
    : {
        leftTiles: entity.x,
        topTiles: entity.y,
        widthTiles: Math.max(1, entity.width),
        heightTiles: Math.max(1, entity.height)
      };
  const spriteScale = entity.kind === "actor" && entity.battle?.side !== "none"
    ? Math.max(1, Math.min(2, entity.battle?.spriteScale ?? 1))
    : 1;
  const placement = spriteScale === 1
    ? basePlacement
    : {
        leftTiles: entity.x - (entity.x - basePlacement.leftTiles) * spriteScale,
        topTiles: entity.y - (entity.y - basePlacement.topTiles) * spriteScale,
        widthTiles: basePlacement.widthTiles * spriteScale,
        heightTiles: basePlacement.heightTiles * spriteScale
      };
  const position = gbaActorSpriteRoomPlacementPercent(room.width, room.height, placement);
  const isIsometric = room.sceneType === "isometric";
  const isometricConfig = roomIsometricConfig(room);
  const isometricSurfaceSize = isIsometric ? roomIsometricSurfaceSize(room) : undefined;
  const isometricArea = isIsometric && entity.kind === "trigger"
    ? isometricRoomAreaPlacement(room.width, room.height, {
        x: entity.x,
        y: entity.y,
        width: entity.width,
        height: entity.height
      }, isometricConfig, room.backgroundAtlasTileHeight, isometricSurfaceSize, room.heightLevels)
    : null;
  const isometricTile = isIsometric
    ? isometricRoomTilePlacement(
        room.width,
        room.height,
        entity.x,
        entity.y,
        isometricConfig,
        room.backgroundAtlasTileHeight,
        isometricSurfaceSize
      )
    : null;
  const isometricSpan = room.width + room.height;
  const isometricTileWidth = isometricConfig?.tileWidth ?? room.backgroundTileWidth;
  const isometricTileHeight = isometricConfig?.tileHeight ?? room.backgroundTileHeight;
  const isometricWorldSize = isIsometric
    ? isometricSurfaceSize ?? deriveIsometricWorldSize({
      atlasTileHeight: room.backgroundAtlasTileHeight,
      config: isometricConfig,
      height: room.height,
      width: room.width
    })
    : null;
  const isometricFrameWidth = frame
    ? (frame.frameWidth / Math.max(1, isometricWorldSize?.width ?? (isometricTileWidth / 2) * isometricSpan)) * 100
    : isometricTile?.widthPercent ?? 0;
  const isometricFrameHeight = frame
    ? (frame.frameHeight / Math.max(1, isometricWorldSize?.height ?? (isometricTileHeight / 2) * isometricSpan)) * 100
    : isometricTile?.heightPercent ?? 0;
  const isometricElevation = entity.z ?? room.heightLevels?.[Math.floor(entity.y) * room.width + Math.floor(entity.x)] ?? 0;
  // The engine anchors sprites at the diamond center, after applying elevation.
  const isometricFeet = isometricTile
    ? isometricTile.topPercent + isometricTile.heightPercent / 2
      - isometricElevation * (isometricConfig?.heightStep ?? 0) / Math.max(1, isometricWorldSize?.height ?? 1) * 100
    : 0;
  const style: CSSProperties = {
    backgroundImage: spriteURL ? `url("${spriteURL}")` : undefined,
    clipPath: isometricArea?.clipPath,
    height: isometricArea ? `${isometricArea.heightPercent}%` : isometricTile ? `${isometricFrameHeight}%` : position.height,
    left: isometricArea ? `${isometricArea.leftPercent}%` : isometricTile ? `${isometricTile.leftPercent + (isometricTile.widthPercent - isometricFrameWidth) / 2}%` : position.left,
    top: isometricArea ? `${isometricArea.topPercent}%` : isometricTile ? `${isometricFeet - isometricFrameHeight}%` : position.top,
    transform: affineObj ? `rotate(${affineObj.rotationDegrees}deg) scale(${affineObj.scaleX}, ${affineObj.scaleY})` : undefined,
    transformOrigin: affineObj ? "center center" : undefined,
    width: isometricArea ? `${isometricArea.widthPercent}%` : isometricTile ? `${isometricFrameWidth}%` : position.width,
    overflow: affineObj ? "visible" : undefined,
    zIndex: isometricTile ? 10 + isometricTile.depth : undefined
  };

  if (spriteURL && frame && imageSize && frame.sourceWidth > 0 && frame.sourceHeight > 0) {
    const maxX = Math.max(0, imageSize.width - frame.frameWidth);
    const maxY = Math.max(0, imageSize.height - frame.frameHeight);
    style.backgroundPosition = `${maxX === 0 ? 0 : (frame.sourceX / maxX) * 100}% ${maxY === 0 ? 0 : (frame.sourceY / maxY) * 100}%`;
    style.backgroundSize = `${(imageSize.width / frame.frameWidth) * 100}% ${(imageSize.height / frame.frameHeight) * 100}%`;
  }

  return style;
}

function roomEntityHitboxStyle(
  room: RoomsWorkspaceRoom,
  entity: RoomsWorkspaceEntity
): CSSProperties {
  const footprint = roomEntitySelectionFootprint(entity, room.sceneType);
  if (room.sceneType === "isometric") {
    const surfaceSize = roomIsometricSurfaceSize(room);
    const area = isometricRoomAreaPlacement(
      room.width,
      room.height,
      {
        height: footprint.height,
        width: footprint.width,
        x: footprint.x,
        y: footprint.y
      },
      roomIsometricConfig(room),
      room.backgroundAtlasTileHeight,
      surfaceSize
    );
    if (area) {
      return {
        clipPath: area.clipPath,
        height: `${area.heightPercent}%`,
        left: `${area.leftPercent}%`,
        top: `${area.topPercent - roomIsometricElevationPercent(room, entity.x, entity.y, entity.kind === "actor" ? entity.z : undefined)}%`,
        width: `${area.widthPercent}%`
      };
    }
  }

  return gbaActorSpriteRoomPlacementPercent(room.width, room.height, {
    heightTiles: footprint.height,
    leftTiles: footprint.x,
    topTiles: footprint.y,
    widthTiles: footprint.width
  });
}

interface IsometricGridOverlayProps {
  cameraBounds?: IsometricProjectionBounds;
  config?: IsometricSceneConfig;
  heightLevels?: readonly number[];
  hoverCellIndex: number | null;
  roomHeight: number;
  roomWidth: number;
  selectedCellIndex?: number | null;
  surfaceSize: IsometricWorldSize;
  showCameraBounds?: boolean;
  showGridCells?: boolean;
  showWorldBounds?: boolean;
  useWorldCoordinates?: boolean;
  worldMode?: IsometricSceneConfig["worldMode"];
}

function IsometricGridOverlay({
  cameraBounds,
  config,
  heightLevels,
  hoverCellIndex,
  roomHeight,
  roomWidth,
  selectedCellIndex = null,
  surfaceSize,
  showCameraBounds = false,
  showGridCells = true,
  showWorldBounds = false,
  useWorldCoordinates = false,
  worldMode = "scrollable_tiled_world"
}: IsometricGridOverlayProps): React.ReactElement {
  const geometry = useMemo(() => deriveIsometricGeometryContract({
    cameraBounds,
    config,
    roomHeight,
    roomWidth,
    surfaceSize,
    useWorldCoordinates
  }), [cameraBounds, config, roomHeight, roomWidth, surfaceSize, useWorldCoordinates]);
  const cells = useMemo(() => Array.from({ length: roomWidth * roomHeight }, (_entry, index) => {
    const points = isometricRoomTileDiamondPoints(
      roomHeight,
      index % roomWidth,
      Math.floor(index / roomWidth),
      config,
      useWorldCoordinates ? surfaceSize : undefined,
      heightLevels?.[index] ?? 0
    );
    return {
      index,
      points: points.map((point) => `${point.x},${point.y}`).join(" ")
    };
  }).sort((left, right) => (left.index % roomWidth + Math.floor(left.index / roomWidth))
    - (right.index % roomWidth + Math.floor(right.index / roomWidth))), [config, heightLevels, roomHeight, roomWidth, surfaceSize, useWorldCoordinates]);
  const projectionLabel = config?.tileWidth && config.tileHeight
    ? `${config.tileWidth}×${config.tileHeight}`
    : "2:1";
  const worldWidth = Math.max(1, surfaceSize.width);
  const worldHeight = Math.max(1, surfaceSize.height);

  return (
    <svg
      aria-label={`Mundo isométrico ${projectionLabel} · ${roomWidth}×${roomHeight} células · mundo ${worldWidth}×${worldHeight} · viewport ${geometry.cameraBounds.width}×${geometry.cameraBounds.height}`}
      className={`room-stage-isometric-grid${worldMode === "static_composition" ? " is-static-composition" : ""}`}
      data-grid-cell-count={cells.length}
      data-grid-bounds={`${geometry.gridBounds.x},${geometry.gridBounds.y},${geometry.gridBounds.width},${geometry.gridBounds.height}`}
      data-grid-projection={projectionLabel}
      data-camera-bounds={`${geometry.cameraBounds.x},${geometry.cameraBounds.y},${geometry.cameraBounds.width},${geometry.cameraBounds.height}`}
      data-world-size={`${worldWidth}x${worldHeight}`}
      data-world-mode={worldMode}
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${worldWidth} ${worldHeight}`}
    >
      {showWorldBounds ? <rect className="room-stage-isometric-grid-world-bounds" height={geometry.worldBounds.height} width={geometry.worldBounds.width} x={geometry.worldBounds.x} y={geometry.worldBounds.y} /> : null}
      {showCameraBounds ? <rect className="room-stage-isometric-grid-camera-bounds" height={geometry.cameraBounds.height} width={geometry.cameraBounds.width} x={geometry.cameraBounds.x} y={geometry.cameraBounds.y} /> : null}
      {showGridCells ? <rect className="room-stage-isometric-grid-grid-bounds" height={geometry.gridBounds.height} width={geometry.gridBounds.width} x={geometry.gridBounds.x} y={geometry.gridBounds.y} /> : null}
      {showGridCells ? (
        <g className="room-stage-isometric-grid-cells">
          {cells.map((cell) => (
            <polygon
              className={[
                "room-stage-isometric-grid-cell",
                cell.index === hoverCellIndex ? "is-hovered" : "",
                cell.index === selectedCellIndex ? "is-selected" : ""
              ].filter(Boolean).join(" ")}
              data-cell-index={cell.index}
              key={`isometric-grid-cell-${cell.index}`}
              points={cell.points}
            />
          ))}
        </g>
      ) : null}
      {showGridCells ? (
        <path
          className="room-stage-isometric-grid-origin"
          d={`M ${geometry.origin.x - 6} ${geometry.origin.y} H ${geometry.origin.x + 6} M ${geometry.origin.x} ${geometry.origin.y - 6} V ${geometry.origin.y + 6}`}
        />
      ) : null}
    </svg>
  );
}

function markerText(isActive: boolean, isStart: boolean): string | null {
  if (isActive && isStart) {
    return "Ativa e inicial";
  }

  if (isActive) {
    return "Ativa";
  }

  return isStart ? "Inicial" : null;
}

function selectOptionsWithCurrent(options: Array<{ label: string; value: string }>, currentValue: string | null): Array<{ label: string; value: string }> {
  if (!currentValue || options.some((option) => option.value === currentValue)) {
    return options;
  }

  return [{ label: currentValue, value: currentValue }, ...options];
}

function collisionOverlayClass(collisionType: RoomCollisionType): string {
  if (collisionType === "free") return "";
  return `tile-overlay-collision tile-overlay-collision--${collisionType}`;
}

function roomCollisionInspector(
  room: RoomsWorkspaceRoom,
  selectedCellIndex: number | null,
  selectedCollisionType: RoomCollisionType,
  collisionPlacementMode: RoomCollisionPlacementMode,
  onSetCollisionType: RoomsWorkspaceProps["onSetCollisionType"],
  setCollisionPlacementMode: (mode: RoomCollisionPlacementMode) => void,
  setSelectedCollisionType: (collisionType: RoomCollisionType) => void,
  collisionHoverPreviewEnabled: boolean,
  onSetBorderCollision: () => void,
  onClearCollision: () => void
): React.ReactElement {
  const allowedCollisionTypes = sceneTypeProfile(room.sceneType).collisionTypes;
  const activeCollisionType = allowedCollisionTypes.includes(selectedCollisionType)
    ? selectedCollisionType
    : allowedCollisionTypes.includes("solid")
      ? "solid"
      : "free";

  function updateSelectedCellCollision(collisionType: RoomCollisionType): void {
    if (selectedCellIndex === null) return;
    onSetCollisionType(room.id, selectedCellIndex, collisionType);
  }

  return (
    <section className="room-collision-inspector" aria-label="Inspector Colisão">
      <div className="room-collision-inspector-title">
        <div className="room-collision-title-line">
            <span>Células com colisão</span>
            <InspectorInfoTip label="Colisão">
              {collisionPlacementMode === "rectangle"
                ? "Arraste no canvas para preencher uma área retangular."
                : collisionPlacementMode === "fill"
                  ? "Clique no canvas para preencher a região conectada do mesmo tipo."
                  : room.tilemapContract
                    ? "Clique ou arraste para pintar metatiles de 16×16 (quatro células físicas)."
                    : "Clique ou arraste para pintar células."}
              {" Alt+clique captura o tipo da célula; clique direito apaga a colisão."}
              {collisionHoverPreviewEnabled ? " A prévia ao passar o cursor está ativa." : " A prévia ao passar o cursor está desativada."}
              {room.sceneType === "platformer" ? " Plataforma: cada célula representa 8×8 px; rampas mostram a área triangular de piso e escadas são regiões verticais acionáveis." : null}
            </InspectorInfoTip>
        </div>
        <em>{room.collisionCount}</em>
      </div>
      <div aria-label="Modo de aplicação da colisão" className="room-collision-placement-mode" role="group">
        <button
          aria-pressed={collisionPlacementMode === "brush"}
          className={collisionPlacementMode === "brush" ? "active" : ""}
          onClick={() => setCollisionPlacementMode("brush")}
          type="button"
        >
          Pincel <small>{room.tilemapContract ? "Metatiles" : "Células"}</small>
        </button>
        <button
          aria-pressed={collisionPlacementMode === "rectangle"}
          className={collisionPlacementMode === "rectangle" ? "active" : ""}
          onClick={() => setCollisionPlacementMode("rectangle")}
          type="button"
        >
          Retângulo <small>Área</small>
        </button>
        <button
          aria-pressed={collisionPlacementMode === "fill"}
          className={collisionPlacementMode === "fill" ? "active" : ""}
          onClick={() => setCollisionPlacementMode("fill")}
          type="button"
        >
          Preencher <small>Região</small>
        </button>
      </div>
      <div className="room-collision-type-group">
        <span>Tipo aplicado</span>
        <div aria-label="Tipos de colisão" className="room-collision-type-grid" role="group">
          {allowedCollisionTypes.map((collisionType) => (
            <button
              aria-label={`Tipo de colisão ${roomCollisionTypeLabel(collisionType)}`}
              aria-pressed={activeCollisionType === collisionType}
              className={activeCollisionType === collisionType ? "active" : ""}
              key={collisionType}
              onClick={() => setSelectedCollisionType(collisionType)}
              type="button"
            >
              {roomCollisionTypeLabel(collisionType)}
            </button>
          ))}
        </div>
      </div>
      <div className={selectedCellIndex === null ? "room-collision-selected-cell is-empty" : "room-collision-selected-cell"}>
        <span>{room.tilemapContract ? "Metatile selecionado" : "Célula selecionada"}</span>
        <strong>{selectedCellIndex === null ? "Nenhuma" : selectedCellIndex + 1}</strong>
        {selectedCellIndex !== null ? <div>
          <button disabled={selectedCellIndex === null} onClick={() => updateSelectedCellCollision("free")} type="button">Livre</button>
          <button disabled={selectedCellIndex === null} onClick={() => updateSelectedCellCollision("solid")} type="button">Sólido</button>
        </div> : null}
        {selectedCellIndex !== null && room.sceneType === "isometric" ? (
          <div className="room-collision-ramp-actions">
            <button
              aria-label="Rampa subindo à direita"
              disabled={selectedCellIndex === null}
              onClick={() => updateSelectedCellCollision("slope_up_right")}
              type="button"
            >Rampa ↗</button>
            <button
              aria-label="Rampa subindo à esquerda"
              disabled={selectedCellIndex === null}
              onClick={() => updateSelectedCellCollision("slope_up_left")}
              type="button"
            >Rampa ↖</button>
          </div>
        ) : null}
      </div>
      <div className="room-collision-actions">
        <button onClick={onSetBorderCollision} type="button">
          <Grid3X3 aria-hidden="true" size={16} strokeWidth={2.2} />
          <span>Borda</span>
        </button>
        <button onClick={onClearCollision} type="button">
          <Trash2 aria-hidden="true" size={16} strokeWidth={2.2} />
          <span>Limpar</span>
        </button>
      </div>
    </section>
  );
}

export function RoomGeometryDiagnosticsPanel({ room }: { room: RoomsWorkspaceRoom }): React.ReactElement {
  const diagnostics = room.geometryDiagnostics;
  if (!diagnostics) {
    return (
      <section aria-label="Diagnóstico geométrico da cena" className="room-geometry-diagnostics" role="region">
        <div className="room-geometry-diagnostics-header">
          <div>
            <span>Validação</span>
            <h5>Diagnóstico geométrico</h5>
          </div>
          <strong className="unknown">Não verificado</strong>
        </div>
        <p>Este diagnóstico fica disponível quando a cena é carregada pelo modelo atual do workspace.</p>
      </section>
    );
  }

  const backgroundStatusLabels: Record<RoomGeometryDiagnostics["backgroundAlignment"]["status"], string> = {
    aligned: "Alinhado",
    mismatch: "Desalinhado",
    not_applicable: "Não aplicável",
    unknown: "Não verificado"
  };
  const background = diagnostics.backgroundAlignment;
  const actorIssues = diagnostics.actorPlacement.blocked.length + diagnostics.actorPlacement.outsideBounds.length;
  const triggerIssues = diagnostics.triggerPlacement.blocked.length + diagnostics.triggerPlacement.outsideBounds.length;
  const totalIssues = actorIssues + triggerIssues + (background.status === "mismatch" ? 1 : 0);
  const overallStatus = totalIssues > 0 ? "warning" : background.status === "unknown" ? "unknown" : "ready";
  const dimensionSummary = background.actualWidth !== null && background.actualHeight !== null
    ? `${background.actualWidth}×${background.actualHeight}px · esperado ${background.expectedWidth}×${background.expectedHeight}px`
    : `Esperado ${background.expectedWidth}×${background.expectedHeight}px · medida não disponível`;
  const placementSummary = (blocked: string[], outsideBounds: string[]): string => (
    `${blocked.length} bloqueado(s) · ${outsideBounds.length} fora da grade`
  );

  return (
    <section aria-label="Diagnóstico geométrico da cena" className="room-geometry-diagnostics" role="region">
      <div className="room-geometry-diagnostics-header">
        <div>
          <span>Validação</span>
          <h5>Diagnóstico geométrico</h5>
        </div>
        <strong className={overallStatus}>
          {totalIssues > 0 ? `${totalIssues} alerta(s)` : overallStatus === "unknown" ? "Não verificado" : "Pronto"}
        </strong>
      </div>
      <p>Confere a grade lógica com o fundo e sinaliza posições que podem quebrar a jogabilidade.</p>
      <div className="room-geometry-diagnostics-grid">
        <div className={`room-geometry-diagnostic-card ${background.status}`}>
          <span>Grade visual</span>
          <strong>{backgroundStatusLabels[background.status]}</strong>
          <small>{dimensionSummary}</small>
        </div>
        <div className={`room-geometry-diagnostic-card ${actorIssues > 0 ? "warning" : "ready"}`}>
          <span>Atores</span>
          <strong>{actorIssues > 0 ? `${actorIssues} alerta(s)` : "Sem alertas"}</strong>
          <small>{placementSummary(diagnostics.actorPlacement.blocked, diagnostics.actorPlacement.outsideBounds)}</small>
        </div>
        <div className={`room-geometry-diagnostic-card ${triggerIssues > 0 ? "warning" : "ready"}`}>
          <span>Triggers</span>
          <strong>{triggerIssues > 0 ? `${triggerIssues} alerta(s)` : "Sem alertas"}</strong>
          <small>{placementSummary(diagnostics.triggerPlacement.blocked, diagnostics.triggerPlacement.outsideBounds)}</small>
        </div>
      </div>
      {background.status === "mismatch" ? (
        <p className="room-geometry-diagnostic-warning" role="status">
          O tamanho do asset de fundo não corresponde à grade da cena.
        </p>
      ) : null}
      {diagnostics.actorPlacement.blocked.map((name) => (
        <p className="room-geometry-diagnostic-warning" key={`actor-blocked-${name}`} role="status">
          Ator sobre colisão bloqueante: {name}.
        </p>
      ))}
      {diagnostics.actorPlacement.outsideBounds.map((name) => (
        <p className="room-geometry-diagnostic-warning" key={`actor-outside-${name}`} role="status">
          Ator fora da grade: {name}.
        </p>
      ))}
      {diagnostics.triggerPlacement.blocked.map((name) => (
        <p className="room-geometry-diagnostic-warning" key={`trigger-blocked-${name}`} role="status">
          Trigger atravessa colisão bloqueante: {name}.
        </p>
      ))}
      {diagnostics.triggerPlacement.outsideBounds.map((name) => (
        <p className="room-geometry-diagnostic-warning" key={`trigger-outside-${name}`} role="status">
          Trigger fora da grade: {name}.
        </p>
      ))}
    </section>
  );
}

function roomVisualFidelityPercent(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return "Não disponível";
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    style: "percent"
  }).format(Number(value));
}

function RoomBackgroundFidelityComparison({
  projectPath,
  room
}: {
  projectPath?: string;
  room: RoomsWorkspaceRoom;
}): React.ReactElement | null {
  const backgroundURL = resolveRoomBackgroundURL(projectPath, room);
  const [isOpen, setIsOpen] = useState(false);
  const [compiledURL, setCompiledURL] = useState<string | null>(null);
  const [compileError, setCompileError] = useState(false);

  useEffect(() => {
    setCompiledURL(null);
    setCompileError(false);
    if (!isOpen || !backgroundURL) return undefined;

    let cancelled = false;
    const image = new Image();
    if (isDesktopAssetURL(backgroundURL)) image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      try {
        setCompiledURL(compileImageElementToRgb555DataURL(image, room.backgroundPalette ?? []));
      } catch {
        setCompileError(true);
      }
    };
    image.onerror = () => {
      if (!cancelled) setCompileError(true);
    };
    image.src = backgroundURL;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [backgroundURL, isOpen, room.backgroundPalette?.join(",")]);

  if (!backgroundURL) return null;

  return (
    <section aria-label="Comparação PNG original e RGB555" className="room-visual-fidelity-comparison" role="region">
      <button
        aria-expanded={isOpen}
        aria-label="Comparar PNG original e RGB555"
        className="room-visual-fidelity-compare-button"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        {isOpen ? "Ocultar comparação" : "Comparar PNG original e RGB555"}
      </button>
      {isOpen ? (
        <div className="room-visual-fidelity-comparison-grid">
          <figure>
            <img alt="Background PNG original" crossOrigin={isDesktopAssetURL(backgroundURL) ? "anonymous" : undefined} src={backgroundURL} />
            <figcaption>PNG original</figcaption>
          </figure>
          <figure>
            {compiledURL ? (
              <img alt="Preview RGB555 compilado" src={compiledURL} />
            ) : (
              <div aria-live="polite" className="room-visual-fidelity-compare-loading" role="status">
                {compileError ? "Não foi possível compilar o preview." : "Compilando preview RGB555…"}
              </div>
            )}
            <figcaption>Preview RGB555 compilado</figcaption>
          </figure>
        </div>
      ) : null}
    </section>
  );
}

export function RoomVisualFidelityPanel({
  entities,
  projectPath,
  room
}: {
  entities: RoomsWorkspaceEntity[];
  projectPath?: string;
  room: RoomsWorkspaceRoom;
}): React.ReactElement {
  const background = room.backgroundFidelity ?? null;
  const actors = entities.filter((entity) => entity.kind === "actor");
  const triggers = entities.filter((entity) => entity.kind === "trigger");
  const actorBoundsCount = actors.filter((actor) => actor.spriteFrame !== null && actor.spriteFrame !== undefined).length;
  const backgroundWarning = Boolean(
    background?.assetcStatus === "attention"
      || Number(background?.maxSourcePixelErrorRatio ?? 0) > 0
      || Number(background?.maxFramebufferMismatchRatio ?? 0) > 0
  );
  const backgroundStatus = background === null ? "unknown" : backgroundWarning ? "warning" : "ready";
  const backgroundStatusLabel = background === null
    ? "Não verificado"
    : backgroundWarning
      ? "Revisar quantização"
      : "Contrato RGB555";
  const backgroundDetail = background === null
    ? "Sem orçamento declarado para PNG → tiles 4bpp."
    : `${background.optimizerEnabled ? "PNG → tiles 4bpp/RGB555" : "Preview RGB555"}${background.tileBudget ? ` · ${background.tileBudget} tiles` : ""}`;

  return (
    <section aria-label="Diagnóstico de fidelidade visual da cena" className="room-visual-fidelity" role="region">
      <div className="room-geometry-diagnostics-header">
        <div>
          <span>Render</span>
          <h5>Fidelidade visual</h5>
        </div>
        <strong className={backgroundStatus}>{backgroundStatusLabel}</strong>
      </div>
      <p>Compara a origem autorada com o preview compilado e deixa explícitos bounds, hitbox e posição.</p>
      <RoomBackgroundFidelityComparison projectPath={projectPath} room={room} />
      <div className="room-visual-fidelity-grid">
        <div className={`room-visual-fidelity-card ${backgroundStatus}`}>
          <span>Background</span>
          <strong>{background?.maxSourcePixelErrorRatio !== null && background?.maxSourcePixelErrorRatio !== undefined
            ? `Erro até ${roomVisualFidelityPercent(background.maxSourcePixelErrorRatio)}`
            : backgroundStatusLabel}</strong>
          <small>{backgroundDetail}</small>
        </div>
        <div className="room-visual-fidelity-card ready">
          <span>Atores</span>
          <strong>{actorBoundsCount}/{actors.length} com bounds do sprite</strong>
          <small>{actors.length ? "A posição usa a origem do frame; a hitbox permanece editável." : "Nenhum ator autorado nesta cena."}</small>
        </div>
        <div className="room-visual-fidelity-card ready">
          <span>Triggers</span>
          <strong>{triggers.length} área(s) configurada(s)</strong>
          <small>{triggers.length ? "Posição e área são mostradas em tiles da cena." : "Nenhum trigger autorado nesta cena."}</small>
        </div>
      </div>
      {backgroundWarning ? (
        <p className="room-visual-fidelity-warning" role="status">
          O editor mostra o preview RGB555 compilado; o PNG do background tem perda de quantização declarada de até {roomVisualFidelityPercent(background?.maxSourcePixelErrorRatio)}.
        </p>
      ) : null}
      {actors.length > 0 ? (
        <div className="room-visual-fidelity-entity-list">
          <strong>Atores autorados</strong>
          {actors.map((actor) => (
            <small key={`visual-actor-${actor.id}`}>
              {actor.name}: posição {actor.x},{actor.y} · hitbox {actor.width}×{actor.height} · sprite {actor.spriteFrame ? `${actor.spriteFrame.frameWidth}×${actor.spriteFrame.frameHeight}px` : "sem bounds"}
            </small>
          ))}
        </div>
      ) : null}
      {triggers.length > 0 ? (
        <div className="room-visual-fidelity-entity-list">
          <strong>Triggers autorados</strong>
          {triggers.map((trigger) => (
            <small key={`visual-trigger-${trigger.id}`}>
              {trigger.name}: posição {trigger.x},{trigger.y} · área {trigger.width}×{trigger.height}
            </small>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function roomHeightInspector(
  room: RoomsWorkspaceRoom,
  selectedCellIndex: number | null,
  selectedHeightLevel: number,
  onSelectHeightLevel: (heightLevel: number) => void
): React.ReactElement {
  const cellHeight = selectedCellIndex === null ? null : room.heightLevels?.[selectedCellIndex] ?? 0;
  const elevatedCount = (room.heightLevels ?? []).filter((level) => level > 0).length;
  return (
    <section aria-label="Pincel de altura" className="room-height-inspector" role="region">
      <div className="room-collision-inspector-title">
        <div>
          <span>Células elevadas</span>
        </div>
        <em>{elevatedCount}</em>
      </div>
      <p>Níveis de 0 a 3. Células sem indicação estão no chão (Z0). Use rampas no modo Colisão para conectar elevações.</p>
      <div aria-label="Níveis de altura" className="room-height-levels" role="group">
        {[0, 1, 2, 3].map((level) => (
          <button
            aria-label={`Nivel ${level}`}
            aria-pressed={selectedHeightLevel === level}
            className={selectedHeightLevel === level ? "active" : ""}
            key={level}
            onClick={() => onSelectHeightLevel(level)}
            type="button"
          >
            <span>{level}</span>
            <small>{level === 0 ? "Chão" : `+${level}`}</small>
          </button>
        ))}
      </div>
      <dl className="room-height-summary">
        <div><dt>Célula</dt><dd>{selectedCellIndex === null ? "—" : selectedCellIndex + 1}</dd></div>
        <div><dt>Altura atual</dt><dd>{cellHeight === null ? "—" : cellHeight}</dd></div>
        <div><dt>{roomIsometricConfig(room)?.pagedSurface ? "Frente BG3" : "Foreground BG1"}</dt><dd>{roomIsometricConfig(room)?.pagedSurface ? "Imagem" : room.foregroundTileCount ?? 0}</dd></div>
      </dl>
    </section>
  );
}

function roomDetailsEditor(
  room: RoomsWorkspaceRoom,
  options: RoomsWorkspaceOptions,
  onUpdateRoomFields: RoomsWorkspaceProps["onUpdateRoomFields"],
  projectData: GBAProjectData | null | undefined,
  activeTab: RoomInspectorTabID,
  scenePreflight: ReturnType<typeof buildScenePreflightReport> | null,
  onOpenProjectHealth?: RoomsWorkspaceProps["onOpenProjectHealth"]
): React.ReactElement {
  const roomLabel = sceneDisplayName(room.name);
  const projectSettings = projectData?.settings;
  const backgroundOptions = selectOptionsWithCurrent(options.backgroundAssets, room.background);
  const playerOptions = selectOptionsWithCurrent(options.playerActors, room.playerActorName);
  const sceneTypeOptions = roomInspectorSceneTypeOptions(room.sceneType);
  const cameraModeOptions = roomInspectorCameraModeOptions(room.cameraMode);
  const parallaxOptions = roomInspectorParallaxOptions(room.parallax.mode);
  const cameraBoundsEnabled = room.cameraBoundsEditable;
  const parallaxEnabled = room.parallax.mode !== "disabled";
  const runtime = normalizeSceneRuntime(room.sceneType, room.runtime);
  const runtimeFeatureConfig = runtime.config as SceneFeatureRuntimeConfig;
  // Runtime capabilities remain persisted and are consumed by preview/export.
  // Their opt-in controls are authored in the appropriate workspace or event
  // timeline instead of being duplicated in the scene profile.
  const metatilesCapabilityEnabled = runtimeFeatureConfig.capabilities?.some((capability) => (
    capability.id === "metatiles" && capability.enabled
  )) ?? false;
  const affineBackgroundCapabilityEnabled = runtimeFeatureConfig.capabilities?.some((capability) => (
    capability.id === "affine_background" && capability.enabled
  )) ?? false;
  const resolvedRuntime = resolveSceneRuntime(room.sceneType, room.runtime, projectSettings);
  const shmupConfig = resolvedRuntime.type === "shmup"
    ? normalizeShmupSceneConfig(resolvedRuntime.config)
    : null;
  const isometricConfig = resolvedRuntime.type === "isometric"
    ? normalizeIsometricSceneConfig(resolvedRuntime.config)
    : null;
  const isometricCompositionMode = isometricConfig?.pagedSurface ? "adventure"
    : isometricConfig?.tacticalPresentation?.surfacePages?.length ? "tactical" : null;
  const affinePresentation = normalizeAffineScenePresentation(
    (runtime.config as SceneFeatureRuntimeConfig).affine
  );
  const affineOptions = affineAssetOptions(projectData);
  const sceneComposition = Object.hasOwn(runtime.config, "composition")
    ? normalizeSceneComposition((runtime.config as SceneFeatureRuntimeConfig).composition)
    : sceneCompositionFromAffinePresentation(affinePresentation);
  const sceneCompositionOptions = sceneCompositionAssetOptions(projectData);
  const sceneMetatiles = resolveSceneMetatileAuthoring(
    (runtime.config as SceneFeatureRuntimeConfig).metatiles,
    room.width,
    room.height
  ).config;

  function updateCameraBound(field: "x" | "y" | "width" | "height", value: number): void {
    if (!Number.isFinite(value)) return;
    onUpdateRoomFields(room.id, {
      cameraBounds: {
        ...room.cameraBounds,
        [field]: value
      }
    });
  }

  function updateCameraZone(zoneID: string, update: (zone: RoomCameraZone) => RoomCameraZone): void {
    onUpdateRoomFields(room.id, {
      cameraZones: (room.cameraZones ?? []).map((zone) => zone.id === zoneID ? update(zone) : zone)
    });
  }

  function addCameraZone(): void {
    const cameraZones = room.cameraZones ?? [];
    const zoneIndex = cameraZones.length + 1;
    onUpdateRoomFields(room.id, {
      cameraZones: [...cameraZones, {
        id: `camera-zone-${zoneIndex}`,
        name: `Zona ${zoneIndex}`,
        area: { x: 0, y: 0, width: Math.min(4, room.width), height: Math.min(4, room.height) },
        bounds: { x: 0, y: 0, width: room.width * 16, height: room.height * 16 },
        offset: { x: 0, y: 0 },
        lockX: false,
        lockY: false
      }]
    });
  }

  function updateParallaxField(field: "offsetX" | "offsetY" | "speedX" | "speedY", value: number): void {
    if (!Number.isFinite(value)) return;
    onUpdateRoomFields(room.id, {
      parallax: {
        ...room.parallax,
        [field]: value
      }
    });
  }

  function updateIsometricField<K extends keyof IsometricSceneConfig>(field: K, value: IsometricSceneConfig[K]): void {
    if (!isometricConfig) return;
    onUpdateRoomFields(room.id, {
      runtime: {
        type: "isometric",
        config: normalizeSceneRuntime("isometric", {
          type: "isometric",
          config: { ...runtime.config, [field]: value }
        }).config
      }
    });
  }

  function updateIsometricPagedAsset(field: "backgroundAsset" | "foregroundAsset", asset: string): void {
    if (!isometricConfig?.pagedSurface) return;
    onUpdateRoomFields(room.id, {
      ...(field === "backgroundAsset" ? { backgroundAssetName: asset } : {}),
      runtime: {
        type: "isometric",
        config: { ...runtime.config, pagedSurface: { ...isometricConfig.pagedSurface, [field]: asset } }
      }
    });
  }

  function updateAffinePresentation(value: AffineScenePresentation): void {
    onUpdateRoomFields(room.id, {
      runtime: {
        type: runtime.type,
        config: normalizeSceneRuntime(room.sceneType, {
          type: runtime.type,
          config: { ...runtime.config, affine: value }
        }).config
      }
    });
  }

  function updateSceneComposition(value: SceneCompositionConfig): void {
    const hblankUsed = value.effects.hblank.enabled || (value.effects.hblank.timeline?.length ?? 0) > 0;
    const advancedResolution = resolveSceneAdvancedCapabilities(
      room.sceneType,
      runtimeFeatureConfig.capabilities,
      sceneTypeProfile(room.sceneType).editorTools
    );
    const existingHblank = advancedResolution.capabilities.find((capability) => capability.id === "hblank_timeline");
    const capabilities = hblankUsed
      ? existingHblank
        ? advancedResolution.capabilities.map((capability) => capability.id === "hblank_timeline" ? { ...capability, enabled: true } : capability)
        : [...advancedResolution.capabilities, { id: "hblank_timeline", enabled: true, settings: {} }]
      : undefined;
    onUpdateRoomFields(room.id, {
      runtime: {
        type: runtime.type,
        config: normalizeSceneRuntime(room.sceneType, {
          type: runtime.type,
          config: { ...runtime.config, composition: value, ...(capabilities ? { capabilities } : {}) }
        }).config
      }
    });
  }

  function updateSceneMetatiles(value: SceneMetatileAuthoringConfig): void {
    const advancedResolution = resolveSceneAdvancedCapabilities(
      room.sceneType,
      runtimeFeatureConfig.capabilities,
      sceneTypeProfile(room.sceneType).editorTools
    );
    const existingMetatiles = advancedResolution.capabilities.find((capability) => capability.id === "metatiles");
    const capabilities = value.enabled
      ? existingMetatiles
        ? advancedResolution.capabilities.map((capability) => capability.id === "metatiles" ? { ...capability, enabled: true } : capability)
        : [...advancedResolution.capabilities, { id: "metatiles", enabled: true, settings: { blockSize: "2x2" } }]
      : existingMetatiles
        ? advancedResolution.capabilities.map((capability) => capability.id === "metatiles" ? { ...capability, enabled: false } : capability)
        : undefined;
    onUpdateRoomFields(room.id, {
      runtime: {
        type: runtime.type,
        config: normalizeSceneRuntime(room.sceneType, {
          type: runtime.type,
          config: { ...runtime.config, metatiles: value, ...(capabilities ? { capabilities } : {}) }
        }).config
      }
    });
  }

  return (
    <div className="room-detail-editor" aria-label={`Editar ${roomLabel}`}>
      {activeTab === "scene" ? <>
      {resolvedRuntime.type === "racing" ? <RacingSceneInspector
        config={normalizeRacingSceneConfig(resolvedRuntime.config)} width={room.width} height={room.height}
        background={room.background??""} assets={backgroundOptions}
        onChange={patch=>onUpdateRoomFields(room.id,{runtime:{type:"racing",config:{...runtime.config,...patch}},
          ...(patch.pseudo3dVisuals?.floorTilemapId ? {backgroundAssetName:patch.pseudo3dVisuals.floorTilemapId} : {})})}
        onPrepare={track=>onUpdateRoomFields(room.id,{...(normalizeRacingSceneConfig(resolvedRuntime.config).presentation==="pseudo3d"?{width:64,height:64}:{}),
          runtime:{type:"racing",config:{...runtime.config,topdownTrack:track}}})}
      /> : null}
      <InspectorSection
        ariaLabel="Essencial da cena"
        className="room-detail-editor-span-2 scene-inspector-group scene-inspector-essential"
        defaultOpen
        persistKey="rooms.scene.essential"
        role="region"
        title="Essencial"
      >
        <label>
          <span>Tipo de cena</span>
          <select
            aria-label="Tipo de cena"
            onChange={(event) => onUpdateRoomFields(room.id, { sceneType: event.currentTarget.value })}
            value={sceneTypeSelectionValue(room.sceneType, isometricConfig?.gameplayMode)}
          >
            {sceneTypeOptions.map((option) => (
              <option key={option.value} value={option.value}
                disabled={Boolean(isometricCompositionMode && (
                  option.value === "isometricAdventure" && isometricCompositionMode !== "adventure"
                  || option.value === "isometricTactical" && isometricCompositionMode !== "tactical"
                ))}>{option.label}</option>
            ))}
          </select>
        </label>
        {isometricCompositionMode ? <p className="room-detail-section-help">Este cenário possui uma composição de {isometricCompositionMode === "adventure" ? "aventura" : "batalha tática"}. Para o outro tipo, crie uma cena usando Modelos.</p> : null}
        {scenePreflight ? <SceneInspectorHealthSummary onOpenHealth={onOpenProjectHealth} report={scenePreflight} /> : null}
        <div className="scene-inspector-essential-fields">
          <label>
            <span>{room.sceneType === "isometric" ? "Largura (células)" : "Largura (tiles)"}</span>
            <input
              min={room.sceneType === "isometric" ? 1 : 30}
              onChange={(event) => {
                const nextValue = event.currentTarget.valueAsNumber;
                if (Number.isFinite(nextValue)) onUpdateRoomFields(room.id, { width: nextValue });
              }}
              type="number"
              value={room.width}
            />
          </label>
          <label>
            <span>{room.sceneType === "isometric" ? "Altura (células)" : "Altura (tiles)"}</span>
            <input
              min={room.sceneType === "isometric" ? 1 : 20}
              onChange={(event) => {
                const nextValue = event.currentTarget.valueAsNumber;
                if (Number.isFinite(nextValue)) onUpdateRoomFields(room.id, { height: nextValue });
              }}
              type="number"
              value={room.height}
            />
          </label>
          <label>
            <span>Jogador</span>
            <select
              aria-label="Ator do jogador"
              onChange={(event) => onUpdateRoomFields(room.id, { playerActorName: event.currentTarget.value })}
              value={room.playerActorName ?? ""}
            >
              <option value="">Sem jogador</option>
              {playerOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      </InspectorSection>

      </> : null}

      {activeTab === "camera" ? (
      <section className="room-detail-section room-detail-editor-span-2" aria-label="Câmera">
        <h5>Câmera</h5>
        <label>
          <span>Modo</span>
          <select
            aria-label="Modo da câmera"
            onChange={(event) => onUpdateRoomFields(room.id, { cameraMode: event.currentTarget.value })}
            value={room.cameraMode}
          >
            {cameraModeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <p className="room-detail-section-help">{cameraModeDescription(room.cameraMode)}</p>
        {cameraBoundsEnabled ? <>
        <div className="room-detail-bounds-grid">
          <InspectorNumber
            disabled={!cameraBoundsEnabled}
            label="X"
            max={Math.max(0, room.width - room.cameraBounds.width)}
            min={0}
            onChange={(value) => updateCameraBound("x", value)}
            unit="tile"
            value={room.cameraBounds.x}
          />
          <InspectorNumber
            disabled={!cameraBoundsEnabled}
            label="Y"
            max={Math.max(0, room.height - room.cameraBounds.height)}
            min={0}
            onChange={(value) => updateCameraBound("y", value)}
            unit="tile"
            value={room.cameraBounds.y}
          />
          <InspectorNumber
            disabled={!cameraBoundsEnabled}
            label="W"
            max={room.width}
            min={1}
            onChange={(value) => updateCameraBound("width", value)}
            unit="tile"
            value={room.cameraBounds.width}
          />
          <InspectorNumber
            disabled={!cameraBoundsEnabled}
            label="H"
            max={room.height}
            min={1}
            onChange={(value) => updateCameraBound("height", value)}
            unit="tile"
            value={room.cameraBounds.height}
          />
        </div>
        <div className="room-camera-zones-editor">
          <div className="room-detail-section-actions">
            <strong>Zonas de câmera</strong>
            <button onClick={addCameraZone} type="button">
              <Plus aria-hidden="true" size={14} strokeWidth={2.2} />
              Adicionar zona
            </button>
          </div>
          {(room.cameraZones ?? []).length === 0 ? (
            <p className="room-detail-section-help">Use a ferramenta Câmera e arraste sobre a grade para criar uma zona.</p>
          ) : (room.cameraZones ?? []).map((zone) => {
            const updateNestedNumber = (
              group: "area" | "bounds" | "offset",
              field: string,
              value: number
            ): void => {
              if (!Number.isFinite(value)) return;
              updateCameraZone(zone.id, (current) => ({
                ...current,
                [group]: { ...current[group], [field]: value }
              }));
            };
            return (
              <fieldset className="room-camera-zone-fields" key={zone.id}>
                <legend>{zone.name}</legend>
                <label><span>Nome</span><input value={zone.name} onChange={(event) => updateCameraZone(zone.id, (current) => ({ ...current, name: event.currentTarget.value }))} /></label>
                <div className="room-detail-bounds-grid">
                  {(["x", "y", "width", "height"] as const).map((field) => (
                    <label key={`area-${field}`}><span>Área {field.toUpperCase()}</span><input min={field === "width" || field === "height" ? 1 : 0} type="number" value={zone.area[field]} onChange={(event) => updateNestedNumber("area", field, event.currentTarget.valueAsNumber)} /></label>
                  ))}
                  {(["x", "y", "width", "height"] as const).map((field) => (
                    <label key={`bounds-${field}`}><span>Limite {field.toUpperCase()}</span><input min={field === "width" || field === "height" ? 1 : undefined} type="number" value={zone.bounds[field]} onChange={(event) => updateNestedNumber("bounds", field, event.currentTarget.valueAsNumber)} /></label>
                  ))}
                  {(["x", "y"] as const).map((field) => (
                    <label key={`offset-${field}`}><span>Offset {field.toUpperCase()}</span><input type="number" value={zone.offset[field]} onChange={(event) => updateNestedNumber("offset", field, event.currentTarget.valueAsNumber)} /></label>
                  ))}
                </div>
                <label className="room-detail-section-note"><input type="checkbox" checked={zone.lockX} onChange={(event) => updateCameraZone(zone.id, (current) => ({ ...current, lockX: event.currentTarget.checked }))} /><span>Bloquear eixo X</span></label>
                <label className="room-detail-section-note"><input type="checkbox" checked={zone.lockY} onChange={(event) => updateCameraZone(zone.id, (current) => ({ ...current, lockY: event.currentTarget.checked }))} /><span>Bloquear eixo Y</span></label>
                <button type="button" onClick={() => onUpdateRoomFields(room.id, { cameraZones: (room.cameraZones ?? []).filter((candidate) => candidate.id !== zone.id) })}>Remover zona</button>
              </fieldset>
            );
          })}
        </div>
        </> : (
          <p className="room-detail-section-help">
            Esta cena já ocupa o viewport GBA completo; limites e zonas só se aplicam a cenas maiores.
          </p>
        )}
      </section>
      ) : null}

      {activeTab === "background" ? <>
      <section className="room-detail-section room-detail-editor-span-2" aria-label="Fundo da cena">
        <div className="room-background-section-heading">
          <h5>Fundo da cena</h5>
          <InspectorInfoTip label="Fundo da cena">
            Selecione, visualize e bloqueie BG1/BG2 na barra CAMADAS do editor.
            {scenePreflight?.hardware ? ` Viewport ${scenePreflight.hardware.viewport.widthPixels}×${scenePreflight.hardware.viewport.heightPixels} px; mapa BG ${scenePreflight.hardware.effectiveMapSize.id} (${scenePreflight.hardware.screenblocks} screenblock${scenePreflight.hardware.screenblocks === 1 ? "" : "s"}).` : null}
            {scenePreflight?.hardware?.mapSizeExpandedAutomatically ? ` O exportador amplia automaticamente o mapa ${scenePreflight.hardware.configuredMapSize.id} para ${scenePreflight.hardware.effectiveMapSize.id}.` : null}
          </InspectorInfoTip>
        </div>
        {isometricConfig?.pagedSurface ? <>
        <p className="room-detail-section-help">Fundo e frente usam imagens completas. Importe imagens com {isometricConfig.pagedSurface.width} × {isometricConfig.pagedSurface.height} px; a grade lógica permanece editável.</p>
        <div className="room-detail-bounds-grid">
          {([ ["backgroundAsset", "Fundo isométrico BG2"], ["foregroundAsset", "Frente isométrica BG3"] ] as const).map(([field, label]) => (
            <label key={field}><span>{label}</span>
              <select aria-label={label} value={isometricConfig.pagedSurface![field]}
                onChange={event => updateIsometricPagedAsset(field, event.currentTarget.value)}>
                {selectOptionsWithCurrent(options.backgroundAssets, isometricConfig.pagedSurface![field]).map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        </> : isometricConfig?.tacticalPresentation?.surfacePages?.length ? <>
        <p className="room-detail-section-help">Cada imagem ocupa a área configurada da superfície tática. Colisão e altura usam a grade lógica.</p>
        <div className="room-detail-bounds-grid">
          {isometricConfig.tacticalPresentation.surfacePages.map((page, index) => (
            <label key={page.id}><span>Superfície {index + 1} · {page.world.width} × {page.world.height} px</span>
              <select aria-label={`Superfície isométrica ${index + 1}`} value={page.asset}
                onChange={event => updateIsometricField("tacticalPresentation", {
                  ...isometricConfig.tacticalPresentation!,
                  surfacePages: isometricConfig.tacticalPresentation!.surfacePages!.map((current, pageIndex) => (
                    pageIndex === index ? { ...current, asset: event.currentTarget.value } : current
                  ))
                })}>
                {selectOptionsWithCurrent(options.backgroundAssets, page.asset).map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        </> : <div className="room-detail-bounds-grid">
          <label>
            <span>Asset</span>
            <select
              onChange={(event) => onUpdateRoomFields(room.id, { backgroundAssetName: event.currentTarget.value })}
              value={room.background ?? ""}
            >
              <option value="">Sem fundo</option>
              {backgroundOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Modo de renderização</span>
            <select
              onChange={(event) => onUpdateRoomFields(room.id, { backgroundRenderMode: event.currentTarget.value })}
              value={room.backgroundRenderMode}
            >
              <option value="tilemap">Tilemap</option>
              <option value="image">Imagem</option>
              <option value="hybrid">Híbrido</option>
            </select>
          </label>
        </div>}
      </section>
      <section className="room-detail-section room-detail-editor-span-2" aria-label="Paralaxe">
        <div className="room-background-section-heading">
          <h5>Paralaxe</h5>
          <InspectorInfoTip label="Paralaxe">{parallaxModeDescription(room.parallax.mode)}</InspectorInfoTip>
        </div>
        <label>
          <span>Camadas</span>
          <select
            aria-label="Camadas de paralaxe"
            onChange={(event) => onUpdateRoomFields(room.id, {
              parallax: {
                ...room.parallax,
                mode: event.currentTarget.value
              }
            })}
            value={room.parallax.mode}
          >
            {parallaxOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        {parallaxEnabled ? (
          <div className="room-detail-bounds-grid">
            <label>
              <span>Offset X</span>
              <input
                onChange={(event) => updateParallaxField("offsetX", event.currentTarget.valueAsNumber)}
                type="number"
                value={room.parallax.offsetX}
              />
            </label>
            <label>
              <span>Offset Y</span>
              <input
                onChange={(event) => updateParallaxField("offsetY", event.currentTarget.valueAsNumber)}
                type="number"
                value={room.parallax.offsetY}
              />
            </label>
            <label>
              <span>Vel. X</span>
              <input
                min={0}
                onChange={(event) => updateParallaxField("speedX", event.currentTarget.valueAsNumber)}
                type="number"
                value={room.parallax.speedX}
              />
            </label>
            <label>
              <span>Vel. Y</span>
              <input
                min={0}
                onChange={(event) => updateParallaxField("speedY", event.currentTarget.valueAsNumber)}
                type="number"
                value={room.parallax.speedY}
              />
            </label>
          </div>
        ) : null}
      </section>
      <section className="room-detail-section room-detail-editor-span-2" aria-label="Composição avançada">
        <details className="room-background-advanced-details">
          <summary>Composição avançada</summary>
          <div className="room-background-advanced-content">
            <p className="room-detail-section-help">
              Controles técnicos de composição e camadas especiais. Comportamentos, música e efeitos de execução ficam exclusivamente na aba Eventos.
            </p>
            <SceneCompositionInspector
              assetOptions={sceneCompositionOptions}
              onChange={updateSceneComposition}
              sceneType={room.sceneType}
              value={sceneComposition}
            />
            {shmupConfig ? (
              <ShmupSceneCompositionInspector
                capabilityEnabled={affineBackgroundCapabilityEnabled}
                composition={sceneComposition}
                roomHeight={room.height}
                roomWidth={room.width}
              />
            ) : null}
            <SceneMetatileInspector
              height={room.height}
              onChange={updateSceneMetatiles}
              capabilityEnabled={metatilesCapabilityEnabled}
              sceneType={room.sceneType}
              value={sceneMetatiles}
              width={room.width}
            />
            <AffineSceneInspector
              assetOptions={affineOptions}
              onChange={updateAffinePresentation}
              value={affinePresentation}
            />
          </div>
        </details>
      </section>
      </> : null}
    </div>
  );
}

function connectionZoneAtCell(
  cellIndex: number,
  roomWidth: number,
  zones: Array<{ connectionIndex: number; side: "exit" | "entry"; area: RoomConnectionArea }>
): { connectionIndex: number; side: "exit" | "entry" } | null {
  const x = cellIndex % roomWidth;
  const y = Math.floor(cellIndex / roomWidth);
  for (const zone of zones) {
    const area = zone.area;
    if (x >= area.x && x < area.x + area.width && y >= area.y && y < area.y + area.height) {
      return { connectionIndex: zone.connectionIndex, side: zone.side };
    }
  }
  return null;
}

function beginConnectionZonePlacement(
  cellIndex: number,
  event: React.PointerEvent<HTMLElement>,
  setStart: (value: number) => void,
  setEnd: (value: number) => void
): void {
  setStart(cellIndex);
  setEnd(cellIndex);
  const canvas = event.currentTarget.closest(".room-stage-card-canvas");
  if (canvas instanceof HTMLElement) {
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  event.currentTarget.setPointerCapture(event.pointerId);
}

function cellIndexFromCanvasPointer(
  event: React.PointerEvent<HTMLElement>,
  canvas: HTMLElement,
  roomWidth: number,
  roomHeight: number,
  sceneType: string,
  isometricConfig?: IsometricSceneConfig,
  isometricSurfaceSize?: IsometricWorldSize,
  isometricAtlasTileHeight?: number,
  heightLevels?: readonly number[]
): number {
  const rect = canvas.getBoundingClientRect();
  const tile = canvasPointToRoomTile({
    canvasHeight: rect.height,
    canvasWidth: rect.width,
    isometricAtlasTileHeight,
    isometricConfig,
    heightLevels,
    isometricSurfaceSize,
    pointX: event.clientX - rect.left,
    pointY: event.clientY - rect.top,
    projection: sceneType === "isometric" ? "isometric" : "orthogonal",
    roomHeight,
    roomWidth
  });
  return tile.y * roomWidth + tile.x;
}

function roomConnectionAreaStyle(room: RoomsWorkspaceRoom, area: RoomConnectionArea): CSSProperties {
  if (room.sceneType === "isometric") {
    const surfaceSize = roomIsometricSurfaceSize(room);
    const placement = isometricRoomAreaPlacement(
      room.width,
      room.height,
      area,
      roomIsometricConfig(room),
      room.backgroundAtlasTileHeight,
      surfaceSize,
      room.heightLevels
    );
    return {
      clipPath: placement.clipPath,
      height: `${placement.heightPercent}%`,
      left: `${placement.leftPercent}%`,
      top: `${placement.topPercent}%`,
      width: `${placement.widthPercent}%`
    };
  }
  return {
    height: `${Math.min(100, (area.height / room.height) * 100)}%`,
    left: `${(area.x / room.width) * 100}%`,
    top: `${(area.y / room.height) * 100}%`,
    width: `${Math.min(100, (area.width / room.width) * 100)}%`
  };
}

type RoomsInspectorContext =
  | { kind: "paint" }
  | { kind: "collision" }
  | { kind: "height" }
  | { kind: "entity"; entity: RoomsWorkspaceEntity }
  | { kind: "connection"; connection: RoomsWorkspaceConnection }
  | { kind: "room" };

function deriveRoomsInspectorContext(
  selectedToolPanelMode: RoomEditorToolPanelMode,
  selectedEditMode: RoomCanvasEditMode,
  selectedEntityKeys: string[],
  entities: RoomsWorkspaceEntity[],
  roomName: string,
  selectedConnectionIndex: number | null,
  connections: RoomsWorkspaceConnection[]
): RoomsInspectorContext {
  if (selectedToolPanelMode === "paint") return { kind: "paint" };
  if (selectedToolPanelMode === "hud") return { kind: "room" };
  if (selectedEditMode === "collision") return { kind: "collision" };
  if (selectedEditMode === "height") return { kind: "height" };

  const selectedKey = selectedEntityKeys.at(-1) ?? null;
  if (selectedKey) {
    const entity = entities.find((candidate) => entityKey(candidate) === selectedKey);
    if (entity) return { kind: "entity", entity };
  }

  if (selectedToolPanelMode === "trigger") {
    const entityKind = "trigger" as const;
    return {
      entity: {
        eventName: null,
        height: 1,
        id: `empty-${entityKind}-inspector`,
        isInActiveRoom: true,
        kind: entityKind,
        name: "Novo gatilho",
        roomName,
        width: 1,
        x: 0,
        y: 0
      },
      kind: "entity"
    };
  }

  if (selectedConnectionIndex !== null) {
    const connection = connections.find((candidate) => candidate.index === selectedConnectionIndex);
    if (connection) return { kind: "connection", connection };
  }

  return { kind: "room" };
}

function connectionAreaFields(
  label: string,
  area: RoomConnectionArea,
  onChange: (area: RoomConnectionArea) => void
): React.ReactElement {
  const updateField = (field: keyof RoomConnectionArea, rawValue: string): void => {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed)) return;
    onChange({ ...area, [field]: parsed });
  };

  return (
    <fieldset className="room-connection-area-fields">
      <legend>{label}</legend>
      <div className="room-connection-area-grid">
        {(["x", "y", "width", "height"] as const).map((field) => (
          <label key={field}>
            <span>{field.toUpperCase()}</span>
            <input
              min={field === "width" || field === "height" ? 1 : 0}
              onChange={(event) => updateField(field, event.currentTarget.value)}
              type="number"
              value={area[field]}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function roomConnectionInspector(
  connection: RoomsWorkspaceConnection,
  presentation: RoomsWorkspacePresentation,
  inspectorRoom: RoomsWorkspaceRoom,
  eventOptions: ProjectReferenceOption[],
  selectedZoneSide: "exit" | "entry",
  setSelectedZoneSide: (side: "exit" | "entry") => void,
  onCreateEventReference: RoomsWorkspaceProps["onCreateEventReference"],
  onUpdateRoomConnection: RoomsWorkspaceProps["onUpdateRoomConnection"],
  onRemoveRoomConnection: RoomsWorkspaceProps["onRemoveRoomConnection"],
  activeTab: RoomInspectorTabID
): React.ReactElement {
  const fromRoom = presentation.rooms.find((room) => room.name === connection.from);
  const toRoom = presentation.rooms.find((room) => room.name === connection.to);
  const exitArea = connection.exit ?? (fromRoom
    ? defaultRoomConnectionExitArea(fromRoom.width, fromRoom.height)
    : { x: 0, y: 0, width: 1, height: 1 });
  const entryArea = connection.entry ?? (toRoom
    ? defaultRoomConnectionEntryArea(toRoom.width, toRoom.height)
    : { x: 0, y: 0, width: 1, height: 1 });
  const canEditExit = inspectorRoom.name === connection.from;
  const canEditEntry = inspectorRoom.name === connection.to;

  return (
    <div className="room-connection-inspector" aria-label={`Conexao ${connection.from} para ${connection.to}`}>
      {activeTab === "connection" ? <div className="room-connection-side-toggle">
        <p className="room-connection-advanced-note">
          Para uma transição comum, selecione um Trigger e use Eventos → Trocar cena. Esta rota explícita é uma configuração avançada.
        </p>
        <button
          aria-pressed={selectedZoneSide === "exit"}
          className={selectedZoneSide === "exit" ? "active" : ""}
          disabled={!canEditExit}
          onClick={() => setSelectedZoneSide("exit")}
          type="button"
        >
          Saida
        </button>
        <button
          aria-pressed={selectedZoneSide === "entry"}
          className={selectedZoneSide === "entry" ? "active" : ""}
          disabled={!canEditEntry}
          onClick={() => setSelectedZoneSide("entry")}
          type="button"
        >
          Entrada
        </button>
      </div> : null}
      {activeTab === "events" ? <div className="room-reference-field">
        <span>Evento</span>
        <ProjectReferencePicker
          actions={onCreateEventReference ? [{ label: "Criar evento", run: onCreateEventReference }] : []}
          ariaLabel="Evento da conexão"
          emptyLabel="Sem evento"
          invalidLabel="Evento não encontrado"
          onChange={(eventName) => onUpdateRoomConnection(connection.index, { eventName })}
          options={eventOptions}
          value={connection.eventName ?? ""}
        />
      </div> : null}
      {activeTab === "transition" ? (
        <section aria-label="Configuração da transição" className="room-connection-transition-inspector">
          <div className="room-connection-transition-source" role="status">
            <span>{connection.transitionSource === "project-default" ? "Padrão do projeto" : "Personalizada nesta conexão"}</span>
            {connection.transitionSource === "custom" ? (
              <button
                aria-label="Usar padrão do projeto nesta conexão"
                onClick={() => onUpdateRoomConnection(connection.index, { transition: null })}
                type="button"
              >
                Usar padrão do projeto
              </button>
            ) : null}
          </div>
          <label>
            <span>Tipo</span>
            <select
              aria-label="Tipo de transição"
              onChange={(event) => onUpdateRoomConnection(connection.index, {
                transition: { style: event.currentTarget.value as SceneTransitionStyle }
              })}
              value={connection.transition.style}
            >
              <option value={SCENE_TRANSITION_STYLES[0]}>Corte imediato</option>
              <option value={SCENE_TRANSITION_STYLES[1]}>Fade preto</option>
              <option value={SCENE_TRANSITION_STYLES[2]}>Fade claro</option>
              <option value={SCENE_TRANSITION_STYLES[3]}>Máscara lateral</option>
              <option value={SCENE_TRANSITION_STYLES[4]}>Mosaico</option>
              <option value={SCENE_TRANSITION_STYLES[5]}>Deslize lateral</option>
              <option value={SCENE_TRANSITION_STYLES[6]}>Crossfade de paleta</option>
            </select>
          </label>
          <label>
            <span>Duração (frames)</span>
            <input
              aria-label="Duração da transição em frames"
              disabled={connection.transition.style === "cut"}
              max={600}
              min={0}
              onChange={(event) => {
                const value = event.currentTarget.valueAsNumber;
                if (Number.isFinite(value)) onUpdateRoomConnection(connection.index, { transition: { durationFrames: value } });
              }}
              type="number"
              value={connection.transition.durationFrames}
            />
          </label>
          <label className="room-connection-transition-toggle">
            <input
              aria-label="Aplicar fade ao sair"
              checked={connection.transition.fadeOut}
              disabled={connection.transition.style === "cut"}
              onChange={(event) => onUpdateRoomConnection(connection.index, { transition: { fadeOut: event.currentTarget.checked } })}
              type="checkbox"
            />
            <span>Aplicar ao sair</span>
          </label>
          <label className="room-connection-transition-toggle">
            <input
              aria-label="Aplicar fade ao entrar"
              checked={connection.transition.fadeIn}
              disabled={connection.transition.style === "cut"}
              onChange={(event) => onUpdateRoomConnection(connection.index, { transition: { fadeIn: event.currentTarget.checked } })}
              type="checkbox"
            />
            <span>Aplicar ao entrar</span>
          </label>
          <p className="muted room-connection-transition-note">A troca é coberta antes do carregamento da sala e revelada depois. Deslize usa o push nativo; crossfade usa a mistura de paleta compatível com o GBA.</p>
        </section>
      ) : null}
      {activeTab === "exit" ? connectionAreaFields("Saída", exitArea, (area) => onUpdateRoomConnection(connection.index, { exit: area })) : null}
      {activeTab === "entry" ? connectionAreaFields("Entrada", entryArea, (area) => onUpdateRoomConnection(connection.index, { entry: area })) : null}
      {activeTab === "exit" || activeTab === "entry" ? <p className="muted room-connection-placement-hint">
        Arraste no grid da cena de origem para posicionar a saída; na cena de destino para a entrada.
      </p> : null}
      {activeTab === "connection" ? <button onClick={() => onRemoveRoomConnection(connection.index)} type="button">Remover conexão</button> : null}
    </div>
  );
}

function roomConnectionsEditor(
  room: RoomsWorkspaceRoom,
  presentation: RoomsWorkspacePresentation,
  eventOptions: ProjectReferenceOption[],
  selectedTargetName: string,
  setSelectedTargetName: (name: string) => void,
  connectionEventName: string,
  setConnectionEventName: (name: string) => void,
  selectedConnectionIndex: number | null,
  setSelectedConnectionIndex: (index: number | null) => void,
  onCreateEventReference: RoomsWorkspaceProps["onCreateEventReference"],
  onCreateRoomConnection: (fromName: string, toName: string, eventName: string) => void,
  onRemoveRoomConnection: RoomsWorkspaceProps["onRemoveRoomConnection"],
  warpMode = false
): React.ReactElement {
  const roomLabel = sceneDisplayName(room.name);
  const targetRooms = presentation.rooms.filter((targetRoom) => targetRoom.name !== room.name);
  const resolvedTarget = targetRooms.some((targetRoom) => targetRoom.name === selectedTargetName)
    ? selectedTargetName
    : targetRooms[0]?.name ?? "";
  const visibleConnections = presentation.connections.filter((connection) => {
    return connection.from === room.name || connection.to === room.name;
  });

  return (
    <div className="room-connections-editor" aria-label={`Conexoes de ${roomLabel}`}>
      <div className="room-connections-header">
        <strong>Conexoes</strong>
        <span>{visibleConnections.length}</span>
      </div>
      {warpMode ? (
        <p className="muted room-warp-tool-hint" role="status">
          Escolha um destino e arraste no grid para criar uma nova saída. Selecione uma conexão abaixo para editar a saída ou a entrada correspondente.
        </p>
      ) : null}
      <div className="room-connection-form">
        <label>
          <span>Destino</span>
          <select
            disabled={targetRooms.length === 0}
            onChange={(event) => setSelectedTargetName(event.currentTarget.value)}
            value={resolvedTarget}
          >
            {targetRooms.length === 0 ? <option value="">Sem destino</option> : null}
            {targetRooms.map((targetRoom) => (
              <option key={targetRoom.id} value={targetRoom.name}>{sceneDisplayName(targetRoom.name)}</option>
            ))}
          </select>
        </label>
        <div className="room-reference-field">
          <span>Evento</span>
          <ProjectReferencePicker
            actions={onCreateEventReference ? [{ label: "Criar evento", run: onCreateEventReference }] : []}
            ariaLabel="Evento da nova conexão"
            emptyLabel="Sem evento"
            invalidLabel="Evento não encontrado"
            onChange={setConnectionEventName}
            options={eventOptions}
            value={connectionEventName}
          />
        </div>
        <button
          disabled={!resolvedTarget}
          onClick={() => {
            onCreateRoomConnection(room.name, resolvedTarget, connectionEventName);
            setConnectionEventName("");
          }}
          type="button"
        >
          Conectar
        </button>
      </div>
      {visibleConnections.length === 0 ? (
        <p className="muted">Nenhuma conexão vinculada a esta cena.</p>
      ) : (
        <ul className="room-connection-list">
          {visibleConnections.map((connection) => (
            <li
              className={selectedConnectionIndex === connection.index ? "selected" : ""}
              key={connection.index}
            >
              <button
                className="room-connection-select"
                onClick={() => setSelectedConnectionIndex(connection.index)}
                type="button"
              >
                <strong>{connection.from}</strong>
                <em>{connection.to}</em>
                {connection.eventName ? <small>{connection.eventName}</small> : null}
              </button>
              <button type="button" onClick={() => onRemoveRoomConnection(connection.index)}>Remover</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface RoomEntitiesEditorProps {
  activeTab: RoomInspectorTabID;
  hasMixedEntitySelection?: boolean;
  mixedEntitySelectionCount?: number;
  projectData?: GBAProjectData | null;
  room: RoomsWorkspaceRoom;
  presentation: RoomsWorkspacePresentation;
  selectedEntityKeys: string[];
  selectedEntityTool: RoomEntityCanvasTool;
  lockedEntityKeys?: ReadonlySet<string>;
  setSelectedEntityKeys: (keys: string[]) => void;
  setSelectedEntityTool: (tool: RoomEntityCanvasTool) => void;
  inspectorKind?: RoomsWorkspaceEntityKind;
  onCreateTrigger: RoomsWorkspaceProps["onCreateTrigger"];
  onUpdateRoomEntity: RoomsWorkspaceProps["onUpdateRoomEntity"];
  onUpdateRoomFields?: RoomsWorkspaceProps["onUpdateRoomFields"];
  onNudgeRoomEntities: RoomsWorkspaceProps["onNudgeRoomEntities"];
  onAlignRoomEntities: RoomsWorkspaceProps["onAlignRoomEntities"];
  onDistributeRoomEntities: RoomsWorkspaceProps["onDistributeRoomEntities"];
  onDuplicateRoomEntities: RoomsWorkspaceProps["onDuplicateRoomEntities"];
  onRemoveRoomEntities: RoomsWorkspaceProps["onRemoveRoomEntities"];
  onOpenEvent?: RoomsWorkspaceProps["onOpenEvent"];
  onCreateEventReference?: RoomsWorkspaceProps["onCreateEventReference"];
  onCreateBoundEventsForTargets?: RoomsWorkspaceProps["onCreateBoundEventsForTargets"];
  onSetEventUpdateFrequency?: RoomsWorkspaceProps["onSetEventUpdateFrequency"];
  renderEventInspector?: RoomsWorkspaceProps["renderEventInspector"];
  eventOptions: ProjectReferenceOption[];
  commandSuggestions: EventsWorkspaceCommandSuggestion[];
}

function sourceRecordForRoomEntity(
  projectData: GBAProjectData | null | undefined,
  entity: RoomsWorkspaceEntity
): Record<string, unknown> | null {
  const records = entity.kind === "actor" ? projectData?.actors : projectData?.triggers;
  if (!Array.isArray(records)) return null;
  return (records.find((record) => (
    record
    && typeof record === "object"
    && !Array.isArray(record)
    && (record as Record<string, unknown>).id === entity.id
  )) as Record<string, unknown> | undefined) ?? null;
}

function RoomEntitiesEditor({
  activeTab,
  hasMixedEntitySelection = false,
  mixedEntitySelectionCount = 0,
  projectData,
  room,
  presentation,
  selectedEntityKeys,
  selectedEntityTool,
  lockedEntityKeys,
  setSelectedEntityKeys,
  setSelectedEntityTool,
  inspectorKind,
  onCreateTrigger,
  onUpdateRoomEntity,
  onUpdateRoomFields,
  onNudgeRoomEntities,
  onAlignRoomEntities,
  onDistributeRoomEntities,
  onDuplicateRoomEntities,
  onRemoveRoomEntities,
  onOpenEvent,
  onCreateEventReference,
  onCreateBoundEventsForTargets,
  onSetEventUpdateFrequency,
  renderEventInspector,
  eventOptions,
  commandSuggestions
}: RoomEntitiesEditorProps): React.ReactElement {
  const roomLabel = sceneDisplayName(room.name);
  const roomEntities = presentation.entities.filter((entity) => entity.roomName === room.name);
  const visibleEntities = inspectorKind ? roomEntities.filter((entity) => entity.kind === inspectorKind) : roomEntities;
  const isTriggerInspector = inspectorKind === "trigger";
  const selectedVisibleKeys = selectedEntityKeys.filter((key) => visibleEntities.some((entity) => entityKey(entity) === key));
  const selectedEntities = visibleEntities.filter((entity) => selectedVisibleKeys.includes(entityKey(entity)));
  const hasLockedSelection = selectedVisibleKeys.some((key) => lockedEntityKeys?.has(key));
  const isMixedGroupEventContext = activeTab === "events" && hasMixedEntitySelection;
  const selectedEntityKey = selectedVisibleKeys.at(-1) ?? null;
  const selectedEntity = visibleEntities.find((entity) => entityKey(entity) === selectedEntityKey) ?? visibleEntities[0] ?? null;
  const selectedEntitySource = selectedEntity ? sourceRecordForRoomEntity(projectData, selectedEntity) : null;
  const ownerScene = Array.isArray(projectData?.scenas) ? projectData.scenas.find((scene) => scene.name === room.name) as Record<string, unknown> | undefined : undefined;
  const menuRuntimeConfig = room.runtime?.type === "menu" ? normalizeMenuSceneConfig(room.runtime.config) : null;
  const selectedMenuActorRole = selectedEntitySource && typeof selectedEntitySource.menuActorRole === "string"
    ? selectedEntitySource.menuActorRole
    : null;
  const selectedMenuItemID = selectedEntitySource && typeof selectedEntitySource.menuItemID === "string"
    ? selectedEntitySource.menuItemID
    : null;
  const isMenuVisualActor = room.sceneType === "menu"
    && selectedEntity?.kind === "actor"
    && Boolean(selectedMenuActorRole || selectedMenuItemID);
  const selectedMenuItem = menuRuntimeConfig?.items.find((item) => item.id === selectedMenuItemID) ?? null;
  const projectActors = Array.isArray(projectData?.actors)
    ? projectData.actors.filter((actor): actor is Record<string, unknown> => Boolean(actor) && typeof actor === "object" && !Array.isArray(actor))
    : [];
  const selectedMenuVisualPartCount = selectedMenuItemID
    ? projectActors.filter((actor) => actor.roomName === room.name && actor.menuItemID === selectedMenuItemID).length
    : 0;
  const isGroupEventContext = activeTab === "events"
    && !hasMixedEntitySelection
    && selectedEntities.length > 1;
  const resolvedSelectedKeys = selectedEntity
    ? (selectedVisibleKeys.length > 0 ? selectedVisibleKeys : [entityKey(selectedEntity)])
    : [];
  const canNudgeSelection = selectedVisibleKeys.length > 0;
  const entityTools: Array<{ id: RoomEntityCanvasTool; label: string }> = [
    { id: "move", label: "Mover" },
    { id: "resize", label: "Tamanho" }
  ];
  const [nudgeStepSize, setNudgeStepSize] = useState(1);
  const isGeneralTab = activeTab === "actor" || activeTab === "trigger";
  const isPositionTab = activeTab === "movement" || activeTab === "area" || activeTab === "actor" || activeTab === "trigger";
  const actorAnimationVariants = selectedEntity?.kind === "actor"
    ? presentation.options.actorAnimationVariants.filter((variant) => variant.spriteSheet === selectedEntity.spriteSheet)
    : [];
  const actorAnimationSetOptions = selectedEntity?.kind === "actor"
    ? presentation.options.actorAnimationStates.filter((state) => state.spriteSheet === selectedEntity.spriteSheet)
    : [];
  const selectedActorAnimation = actorAnimationVariants.find((variant) => variant.animationName === selectedEntity?.animationName)
    ?? actorAnimationVariants[0]
    ?? null;
  const actorAnimationStates = uniqueActorAnimationValues(actorAnimationVariants, "state");
  const actorAnimationDirections = selectedActorAnimation
    ? uniqueActorAnimationValues(
        actorAnimationVariants.filter((variant) => variant.state === selectedActorAnimation.state),
        "direction"
      )
    : [];

  function createTriggerFromInspector(): void {
    const width = Math.min(2, room.width);
    const height = Math.min(2, room.height);
    const createdTriggerID = onCreateTrigger({
      height,
      roomID: room.id,
      width,
      x: Math.max(0, Math.floor((room.width - width) / 2)),
      y: Math.max(0, Math.floor((room.height - height) / 2))
    });
    if (createdTriggerID) setSelectedEntityKeys([`trigger:${createdTriggerID}`]);
  }

  return (
    <div className="room-entities-editor" aria-label={`Atores e triggers de ${roomLabel}`}>
      {activeTab !== "events" ? <div className="room-entities-header">
        {resolvedSelectedKeys.length > 1 || !selectedEntity ? <strong>{inspectorKind === "actor" ? "Atores" : inspectorKind === "trigger" ? "Gatilhos" : "Atores e gatilhos"}</strong> : null}
        <div className="room-entity-batch-actions">
          {resolvedSelectedKeys.length > 1 || !selectedEntity ? <span>{resolvedSelectedKeys.length > 0 ? `${resolvedSelectedKeys.length}/${visibleEntities.length}` : visibleEntities.length}</span> : null}
          {isPositionTab ? <div className="room-entity-tool-segment" role="group" aria-label="Ferramenta de entidade">
            {entityTools.map((tool) => (
              <button
                aria-pressed={selectedEntityTool === tool.id}
                className={selectedEntityTool === tool.id ? "active" : ""}
                disabled={!selectedEntity || hasLockedSelection}
                key={tool.id}
                onClick={() => setSelectedEntityTool(tool.id)}
                type="button"
              >
                {tool.label}
              </button>
            ))}
          </div> : null}
          {activeTab === "movement" && !isTriggerInspector ? (
            <>
              <div className="room-entity-step-segment" aria-label="Passo do nudge">
                {[1, 8, 16].map((stepSize) => (
                  <button
                    aria-pressed={nudgeStepSize === stepSize}
                    className={nudgeStepSize === stepSize ? "active" : ""}
                    key={stepSize}
                    onClick={() => setNudgeStepSize(stepSize)}
                    type="button"
                  >
                    {stepSize}
                  </button>
                ))}
              </div>
              <button disabled={!canNudgeSelection} onClick={() => onNudgeRoomEntities(room.id, selectedVisibleKeys, -1, 0, nudgeStepSize)} type="button">X-</button>
              <button disabled={!canNudgeSelection} onClick={() => onNudgeRoomEntities(room.id, selectedVisibleKeys, 1, 0, nudgeStepSize)} type="button">X+</button>
              <button disabled={!canNudgeSelection} onClick={() => onNudgeRoomEntities(room.id, selectedVisibleKeys, 0, -1, nudgeStepSize)} type="button">Y-</button>
              <button disabled={!canNudgeSelection} onClick={() => onNudgeRoomEntities(room.id, selectedVisibleKeys, 0, 1, nudgeStepSize)} type="button">Y+</button>
              <button disabled={selectedVisibleKeys.length < 2} onClick={() => onAlignRoomEntities(room.id, selectedVisibleKeys, "x")} type="button">Alinhar X</button>
              <button disabled={selectedVisibleKeys.length < 2} onClick={() => onAlignRoomEntities(room.id, selectedVisibleKeys, "y")} type="button">Alinhar Y</button>
              <button disabled={selectedVisibleKeys.length < 3} onClick={() => onDistributeRoomEntities(room.id, selectedVisibleKeys, "x")} type="button">Distribuir X</button>
              <button disabled={selectedVisibleKeys.length < 3} onClick={() => onDistributeRoomEntities(room.id, selectedVisibleKeys, "y")} type="button">Distribuir Y</button>
            </>
          ) : null}
          {isGeneralTab ? <>
            <button disabled={!canNudgeSelection || hasLockedSelection} onClick={() => onDuplicateRoomEntities(room.id, selectedVisibleKeys)} type="button">Duplicar</button>
            <button className="danger-button" disabled={!canNudgeSelection || hasLockedSelection} onClick={() => onRemoveRoomEntities(room.id, selectedVisibleKeys)} type="button">Remover</button>
          </> : null}
        </div>
      </div> : null}
      {isTriggerInspector && !selectedEntity ? (
        <p className="room-entity-workflow-hint">Arraste no grid para criar um gatilho.</p>
      ) : null}
      {visibleEntities.length === 0 ? (
        inspectorKind === "trigger" ? (
          <div className="room-entity-empty-state">
            <p className="muted">Nenhum gatilho vinculado a esta cena.</p>
            <p>Crie uma área no centro ou arraste no canvas para desenhar um gatilho.</p>
            <button onClick={createTriggerFromInspector} type="button">Criar gatilho</button>
          </div>
        ) : (
          <p className="muted">{inspectorKind === "actor" ? "Nenhum ator vinculado a esta cena." : "Nenhum ator ou gatilho vinculado a esta cena."}</p>
        )
      ) : (
        <>
          {selectedEntity ? (
            <article className="room-selected-entity-inspector">
              {isMixedGroupEventContext || isGroupEventContext ? (
                <div className="room-entity-title">
                  {isMixedGroupEventContext ? (
                    <>
                      <strong>Grupo misto de {mixedEntitySelectionCount} entidades</strong>
                      <span>Comportamentos em lote exigem entidades do mesmo tipo</span>
                    </>
                  ) : (
                    <>
                      <strong>Grupo de {selectedEntities.length} {selectedEntity.kind === "actor" ? "atores" : "triggers"}</strong>
                      <span>Comportamentos independentes por entidade</span>
                    </>
                  )}
                </div>
              ) : null}
              {isGeneralTab ? <label>
                <span>Cena</span>
                <select
                  onChange={(event) => onUpdateRoomEntity(selectedEntity.kind, selectedEntity.id, { roomName: event.currentTarget.value })}
                  value={selectedEntity.roomName}
                >
                  {presentation.rooms.map((targetRoom) => (
                    <option key={targetRoom.id} value={targetRoom.name}>{sceneDisplayName(targetRoom.name)}</option>
                  ))}
                </select>
              </label> : null}
              {isPositionTab ? (
                <InspectorVector2
                  onChange={(axis, value) => onUpdateRoomEntity(selectedEntity.kind, selectedEntity.id, axis === "x" ? { x: value } : { y: value })}
                  values={{ x: selectedEntity.x, y: selectedEntity.y }}
                />
              ) : null}
              {activeTab === "area" || activeTab === "trigger" ? entityNumberInput("W", selectedEntity.width, (value) => onUpdateRoomEntity(selectedEntity.kind, selectedEntity.id, { width: value }), 1) : null}
              {activeTab === "area" || activeTab === "trigger" ? entityNumberInput("H", selectedEntity.height, (value) => onUpdateRoomEntity(selectedEntity.kind, selectedEntity.id, { height: value }), 1) : null}
              {(activeTab === "sprite" || activeTab === "actor") && selectedEntity.kind === "actor" ? (
                <label className="room-actor-sprite-sheet-field">
                  <span>Sprite do ator</span>
                  <select
                    onChange={(event) => {
                      const spriteSheet = event.currentTarget.value;
                      const animationName = presentation.options.actorAnimationVariants
                        .find((variant) => variant.spriteSheet === spriteSheet)?.animationName ?? "";
                      const animationStateID = presentation.options.actorAnimationStates
                        .find((state) => state.spriteSheet === spriteSheet)?.value ?? "";
                      onUpdateRoomEntity("actor", selectedEntity.id, { spriteSheet, animationName, animationStateID });
                    }}
                    value={selectedEntity.spriteSheet ?? ""}
                  >
                    <option value="">Sem sprite</option>
                    {selectOptionsWithCurrent(presentation.options.actorSpriteSheets, selectedEntity.spriteSheet ?? null).map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {activeTab === "actor" && selectedEntity.kind === "actor" && actorAnimationDirections.length > 0 ? <label>
                <span>Direção inicial</span>
                <select aria-label="Direção inicial do ator" value={selectedActorAnimation?.direction ?? ""}
                  onChange={(event) => {
                    if (!selectedActorAnimation) return;
                    const animationName = resolveActorAnimationName(actorAnimationVariants, {
                      spriteSheet: selectedEntity.spriteSheet ?? "", state: selectedActorAnimation.state, direction: event.currentTarget.value
                    });
                    if (animationName) onUpdateRoomEntity("actor", selectedEntity.id, { animationName });
                  }}>
                  {actorAnimationDirections.map((direction) => <option key={direction} value={direction}>{actorAnimationTokenLabel(direction, actorAnimationDirectionLabels)}</option>)}
                </select>
              </label> : null}
              {activeTab === "sprite" && selectedEntity.kind === "actor" ? (
                <div className="room-actor-animation-selectors">
                  <label>
                    <span>Conjunto de animação</span>
                    <select
                      disabled={actorAnimationSetOptions.length === 0}
                      onChange={(event) => onUpdateRoomEntity("actor", selectedEntity.id, {
                        animationStateID: event.currentTarget.value
                      })}
                      value={selectedEntity.animationStateID ?? actorAnimationSetOptions[0]?.value ?? ""}
                    >
                      {actorAnimationSetOptions.length === 0 ? <option value="">Sem conjunto</option> : null}
                      {actorAnimationSetOptions.map((state) => (
                        <option key={state.value} value={state.value}>{state.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Estado inicial</span>
                    <select
                      disabled={actorAnimationStates.length === 0}
                      onChange={(event) => {
                        const animationName = resolveActorAnimationName(actorAnimationVariants, {
                          spriteSheet: selectedEntity.spriteSheet ?? "",
                          state: event.currentTarget.value,
                          direction: selectedActorAnimation?.direction ?? null
                        });
                        if (animationName) onUpdateRoomEntity("actor", selectedEntity.id, { animationName });
                      }}
                      value={selectedActorAnimation?.state ?? ""}
                    >
                      {actorAnimationStates.length === 0 ? <option value="">Sem animações</option> : null}
                      {actorAnimationStates.map((state) => (
                        <option key={state} value={state}>{actorAnimationTokenLabel(state, actorAnimationStateLabels)}</option>
                      ))}
                    </select>
                  </label>
                  {actorAnimationDirections.length > 0 ? <label>
                    <span>Direção inicial</span>
                    <select
                      onChange={(event) => {
                        if (!selectedActorAnimation) return;
                        const animationName = resolveActorAnimationName(actorAnimationVariants, {
                          spriteSheet: selectedEntity.spriteSheet ?? "",
                          state: selectedActorAnimation.state,
                          direction: event.currentTarget.value
                        });
                        if (animationName) onUpdateRoomEntity("actor", selectedEntity.id, { animationName });
                      }}
                      value={selectedActorAnimation?.direction ?? ""}
                    >
                      {actorAnimationDirections.map((direction) => (
                        <option key={direction} value={direction}>{actorAnimationTokenLabel(direction, actorAnimationDirectionLabels)}</option>
                      ))}
                    </select>
                  </label> : null}
                </div>
              ) : null}
              {isGeneralTab && isMenuVisualActor ? (
                <section aria-label="Vínculo visual do menu" className="room-menu-actor-summary">
                  <strong>{selectedMenuItem ? `Parte visual de ${selectedMenuItem.label}` : "Parte visual do menu"}</strong>
                  <p>{selectedMenuVisualPartCount || 1} parte{selectedMenuVisualPartCount === 1 ? "" : "s"} compartilha{selectedMenuVisualPartCount === 1 ? "" : "m"} o mesmo item lógico.</p>
                  <small>A montagem visual e a seleção do menu continuam vinculadas ao item lógico; a lógica deste ator é configurada na aba Eventos.</small>
                </section>
              ) : null}
              {isGeneralTab && selectedEntity.kind === "actor" && selectedEntity.battle && !isMenuVisualActor ? (
                <InspectorSection
                  ariaLabel="Batalha RPG"
                  className="room-actor-battle-section"
                  defaultOpen={room.sceneType === "battleRpg"}
                  persistKey={`rooms.entity.${selectedEntity.id}.battle`}
                  role="region"
                  title="Batalha RPG"
                >
                  <div aria-label="Batalha RPG" className="room-actor-battle-fields" role="group">
                  <label>
                    <span>Lado</span>
                    <select
                      onChange={(event) => onUpdateRoomEntity("actor", selectedEntity.id, { battle: { side: event.currentTarget.value as "none" | "party" | "enemy" } })}
                      value={selectedEntity.battle.side}
                    >
                      <option value="none">Fora da batalha</option>
                      <option value="party">Grupo</option>
                      <option value="enemy">Inimigo</option>
                    </select>
                  </label>
                  {entityNumberInput("HP", selectedEntity.battle.maxHp, (value) => onUpdateRoomEntity("actor", selectedEntity.id, { battle: { maxHp: value } }), 1)}
                  {entityNumberInput("Ataque", selectedEntity.battle.attack, (value) => onUpdateRoomEntity("actor", selectedEntity.id, { battle: { attack: value } }), 1)}
                  {entityNumberInput("Defesa", selectedEntity.battle.defense, (value) => onUpdateRoomEntity("actor", selectedEntity.id, { battle: { defense: value } }), 0)}
                  {entityNumberInput("Velocidade", selectedEntity.battle.speed, (value) => onUpdateRoomEntity("actor", selectedEntity.id, { battle: { speed: value } }), 1)}
                  {entityNumberInput("Escala visual", selectedEntity.battle.spriteScale ?? 1, (value) => onUpdateRoomEntity("actor", selectedEntity.id, { battle: { spriteScale: value } }), 1, 2)}
                  <div className="room-actor-battle-abilities">
                    <span>Comandos</span>
                    {([
                      ["attack", "Ataque"],
                      ["magic", "Magia"],
                      ["heal", "Cura"],
                      ["defend", "Defesa"]
                    ] as const).map(([ability, label]) => (
                      <label key={ability}>
                        <input
                          checked={selectedEntity.battle?.abilities.includes(ability) ?? false}
                          onChange={(event) => {
                            const current = selectedEntity.battle?.abilities ?? ["attack"];
                            const abilities = event.currentTarget.checked
                              ? [...current, ability]
                              : current.filter((item) => item !== ability);
                            onUpdateRoomEntity("actor", selectedEntity.id, { battle: { abilities } });
                          }}
                          type="checkbox"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="room-actor-battle-hint">
                    {selectedEntity.battle.side === "enemy"
                      ? "A IA usa somente estes comandos e prioriza Cura ou Defesa quando estiver em risco."
                      : "ATACAR abre os golpes configurados; L/R escolhe o membro ativo e Cura permite escolher o aliado."}
                  </p>
                  </div>
                </InspectorSection>
              ) : null}
              {isGeneralTab && selectedEntity.kind === "actor" && !isMenuVisualActor ? (
                <InspectorSection
                  ariaLabel="Colisão ator-ator"
                  className="room-actor-collision-section"
                  defaultOpen={false}
                  persistKey={`rooms.entity.${selectedEntity.id}.collision`}
                  role="region"
                  title="Colisão ator-ator"
                >
                  <div aria-label="Colisão ator-ator" className="room-actor-collision-fields" role="group">
                  {entityNumberInput("Máscara", selectedEntity.collisionMask ?? 0xFFFF, (value) => onUpdateRoomEntity("actor", selectedEntity.id, { collisionMask: value }), 0, 0xFFFF)}
                  {entityNumberInput("Prioridade de push", selectedEntity.pushPriority ?? 0, (value) => onUpdateRoomEntity("actor", selectedEntity.id, { pushPriority: value }), 0, 255)}
                  <label className="room-actor-pushable-field">
                    <input
                      checked={selectedEntity.pushable === true}
                      onChange={(event) => onUpdateRoomEntity("actor", selectedEntity.id, { pushable: event.currentTarget.checked })}
                      type="checkbox"
                    />
                    <span>Pode ser empurrado</span>
                  </label>
                  <p className="room-actor-battle-hint">A máscara usa bits dos grupos 0–15. Um ator só empurra outro marcado quando sua prioridade é maior.</p>
                  </div>
                </InspectorSection>
              ) : null}
              {isMixedGroupEventContext ? (
                <section aria-label="Comportamento em grupo indisponível" className="room-mixed-entity-events-inspector">
                  <strong>Comportamento em grupo indisponível</strong>
                  <p>Selecione apenas atores ou apenas triggers para criar cópias independentes do mesmo comportamento.</p>
                </section>
              ) : isGroupEventContext ? (
                <RoomEntityGroupEventsInspector
                  commandSuggestions={commandSuggestions}
                  entities={selectedEntities.map((entity) => ({
                    id: entity.id,
                    kind: entity.kind,
                    name: entity.name
                  }))}
                  onCreateBehaviors={(options) => onCreateBoundEventsForTargets?.(options) ?? []}
                  sceneType={room.sceneType}
                />
              ) : activeTab === "events" ? (
                <RoomEventBindingsInspector
                  commandSuggestions={commandSuggestions}
                  contextKind={selectedEntity.kind}
                  collisionGroup={selectedEntity.collisionGroup ?? 0}
                  entity={selectedEntitySource ?? {
                    eventName: selectedEntity.eventName,
                    id: selectedEntity.id,
                    name: selectedEntity.name
                  }}
                  eventOptions={eventOptions}
                  ownerScene={ownerScene}
                  onUpdateRuntimeState={(bindingKey, field, value) => {
                    if (!ownerScene) return;
                    const next = updateRuntimeEventState(ownerScene, bindingKey, field, value);
                    if (next !== ownerScene) onUpdateRoomFields?.(room.id, { runtime: next.runtime as UpdateRoomFields["runtime"] });
                  }}
                  isPlayer={selectedEntity.isPlayer === true}
                  onChangeBinding={(bindingKey, eventName) => {
                    if (bindingKey === "onInteract" && ownerScene && selectedEntitySource) {
                      const state = menuActorRuntimeState(ownerScene, selectedEntitySource);
                      if (state) {
                        const next = updateRuntimeEventState(ownerScene, state.bindingKey, "eventName", eventName);
                        onUpdateRoomFields?.(room.id, { runtime: next.runtime as UpdateRoomFields["runtime"] });
                      }
                    }
                    const currentBindings = selectedEntitySource?.eventBindings
                      && typeof selectedEntitySource.eventBindings === "object"
                      && !Array.isArray(selectedEntitySource.eventBindings)
                      ? selectedEntitySource.eventBindings as Record<string, string>
                      : {};
                    onUpdateRoomEntity(selectedEntity.kind, selectedEntity.id, {
                      eventBindings: { ...currentBindings, [bindingKey]: eventName }
                    });
                  }}
                  onChangeCollisionGroup={selectedEntity.kind === "actor"
                    ? (group) => onUpdateRoomEntity("actor", selectedEntity.id, { collisionGroup: group })
                    : undefined}
                  onCreateBehavior={(options) => onCreateBoundEventsForTargets?.({
                    initialCommands: options.initialCommands,
                    targets: [{
                      bindingKey: options.bindingKey,
                      targetKind: options.targetKind,
                      targetName: options.targetName
                    }]
                  })?.[0]}
                  onCreateEvent={() => onCreateEventReference?.()}
                  onOpenEvent={onOpenEvent}
                  onUpdateEventFrequency={onSetEventUpdateFrequency}
                  renderEventInspector={renderEventInspector}
                  sceneType={room.sceneType}
                />
              ) : null}
            </article>
          ) : null}
        </>
      )}
    </div>
  );
}

function entityKey(entity: Pick<RoomsWorkspaceEntity, "kind" | "id">): string {
  return `${entity.kind}:${entity.id}`;
}

function roomEntityCanvas(
  room: RoomsWorkspaceRoom,
  entities: RoomsWorkspaceEntity[],
  projectPath: string | undefined,
  spriteImageSizes: Record<string, RoomImageSize>,
  selectedEntityKeys: string[],
  setSelectedEntityKeys: (keys: string[]) => void,
  onPlaceRoomEntity: RoomsWorkspaceProps["onPlaceRoomEntity"],
  onResizeRoomTrigger: RoomsWorkspaceProps["onResizeRoomTrigger"]
): React.ReactElement {
  const selectedEntityKey = selectedEntityKeys.at(-1) ?? null;
  const selectedEntity = entities.find((entity) => entityKey(entity) === selectedEntityKey) ?? entities[0] ?? null;
  const resolvedSelectedEntityKey = selectedEntity ? entityKey(selectedEntity) : null;
  const alignmentGuides = deriveRoomEntityAlignmentGuides(room, entities, selectedEntityKeys);

  function tileFromCanvasPoint(target: HTMLElement, clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = target.closest(".room-entity-canvas");
    if (!(canvas instanceof HTMLElement)) return null;

    const bounds = canvas.getBoundingClientRect();
    return canvasPointToRoomTile({
      canvasHeight: bounds.height,
      canvasWidth: bounds.width,
      isometricAtlasTileHeight: room.backgroundAtlasTileHeight,
      isometricConfig: roomIsometricConfig(room),
      heightLevels: room.heightLevels,
      isometricSurfaceSize: roomIsometricSurfaceSize(room),
      pointX: clientX - bounds.left,
      pointY: clientY - bounds.top,
      projection: room.sceneType === "isometric" ? "isometric" : "orthogonal",
      roomHeight: room.height,
      roomWidth: room.width
    });
  }

  function placeSelectedEntityAtPoint(target: HTMLElement, clientX: number, clientY: number): void {
    if (!selectedEntity) return;

    setSelectedEntityKeys([entityKey(selectedEntity)]);
    const tile = tileFromCanvasPoint(target, clientX, clientY);
    if (!tile) return;

    onPlaceRoomEntity(selectedEntity.kind, selectedEntity.id, {
      roomID: room.id,
      x: tile.x,
      y: tile.y
    });
  }

  function resizeSelectedTriggerAtPoint(target: HTMLElement, clientX: number, clientY: number): void {
    if (!selectedEntity || selectedEntity.kind !== "trigger") return;

    setSelectedEntityKeys([entityKey(selectedEntity)]);
    const tile = tileFromCanvasPoint(target, clientX, clientY);
    if (!tile) return;

    onResizeRoomTrigger(selectedEntity.id, {
      roomID: room.id,
      tileX: tile.x,
      tileY: tile.y
    });
  }

  function startEntityDrag(event: React.PointerEvent<HTMLButtonElement>): void {
    if (!selectedEntity) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    placeSelectedEntityAtPoint(event.currentTarget, event.clientX, event.clientY);
  }

  function selectEntityMarker(event: React.PointerEvent<HTMLSpanElement>, entity: RoomsWorkspaceEntity): void {
    event.stopPropagation();
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    setSelectedEntityKeys(deriveRoomEntitySelection({
      additive,
      currentKeys: selectedEntityKeys,
      entities,
      roomName: room.name,
      targetKey: entityKey(entity)
    }));
  }

  function continueEntityDrag(event: React.PointerEvent<HTMLButtonElement>): void {
    if (!selectedEntity || event.buttons !== 1) return;
    placeSelectedEntityAtPoint(event.currentTarget, event.clientX, event.clientY);
  }

  function endEntityDrag(event: React.PointerEvent<HTMLButtonElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function startTriggerResize(event: React.PointerEvent<HTMLSpanElement>): void {
    if (!selectedEntity || selectedEntity.kind !== "trigger") return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeSelectedTriggerAtPoint(event.currentTarget, event.clientX, event.clientY);
  }

  function continueTriggerResize(event: React.PointerEvent<HTMLSpanElement>): void {
    if (!selectedEntity || selectedEntity.kind !== "trigger" || event.buttons !== 1) return;
    event.stopPropagation();
    resizeSelectedTriggerAtPoint(event.currentTarget, event.clientX, event.clientY);
  }

  function endTriggerResize(event: React.PointerEvent<HTMLSpanElement>): void {
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className="room-entity-canvas-editor" aria-label={`Canvas de entidades de ${sceneDisplayName(room.name)}`}>
      <div className="room-entities-header">
        <strong>Canvas</strong>
        <span>{selectedEntityKeys.length > 1 ? `${selectedEntityKeys.length} selecionados` : selectedEntity ? `${selectedEntity.name} selecionado` : "Sem entidades"}</span>
      </div>
      <button
        aria-label={selectedEntity ? `Reposicionar ${selectedEntity.name}` : "Canvas sem entidades"}
        className="room-entity-canvas"
        disabled={!selectedEntity}
        onPointerDown={startEntityDrag}
        onPointerMove={continueEntityDrag}
        onPointerUp={endEntityDrag}
        style={{ aspectRatio: `${room.width} / ${room.height}` }}
        type="button"
      >
        <span className="room-entity-canvas-size">{room.width} x {room.height}</span>
        {alignmentGuides.map((guide) => (
          <span
            aria-hidden="true"
            className={`room-entity-alignment-guide ${guide.axis}`}
            key={`${guide.axis}-${guide.coordinate}`}
            style={guide.axis === "x" ? { left: `${guide.percent}%` } : { top: `${guide.percent}%` }}
          />
        ))}
        {entities.map((entity) => {
          const width = Math.max(1, entity.width);
          const height = Math.max(1, entity.height);
          const spriteURL = entity.kind === "actor"
            ? resolveRoomAssetURL(projectPath, entity.spriteSource ?? null, entity.spriteBundledDefaultAsset ?? null)
            : null;
          return (
            <span
              className={selectedEntityKeys.includes(entityKey(entity)) ? `room-entity-marker ${entity.kind} selected` : `room-entity-marker ${entity.kind}`}
              key={entityKey(entity)}
              onPointerDown={(event) => selectEntityMarker(event, entity)}
              style={roomEntityStyle(room, { ...entity, width, height }, spriteURL, spriteImageSizes)}
              title={entity.spriteSheet ? `${entity.name}: ${entity.spriteSheet}` : entity.name}
            >
              <span>{entity.name}</span>
            </span>
          );
        })}
        {selectedEntity?.kind === "trigger" ? (
          <span
            aria-hidden="true"
            className="room-trigger-resize-handle"
            onPointerDown={startTriggerResize}
            onPointerMove={continueTriggerResize}
            onPointerUp={endTriggerResize}
            style={{
              left: `${((selectedEntity.x + selectedEntity.width) / room.width) * 100}%`,
              top: `${((selectedEntity.y + selectedEntity.height) / room.height) * 100}%`
            }}
          />
        ) : null}
      </button>
    </div>
  );
}

function entityNumberInput(label: string, value: number, onChange: (value: number) => void, min?: number, max?: number): React.ReactElement {
  return <InspectorNumber label={label} max={max} min={min} onChange={onChange} value={value} />;
}

interface RoomNamePromptState {
  anchorRoomID?: string;
  presetID?: RoomPresetID;
  renameRoomID?: string;
  sceneGroupAction?: "create" | "rename";
  sceneGroupID?: string;
  sceneGroupSceneIDs?: string[];
  defaultName: string;
  fieldLabel?: string;
  title: string;
  confirmLabel: string;
}

interface RoomNamePromptDialogProps {
  state: RoomNamePromptState;
  onCancel(): void;
  onConfirm(name: string): void;
}

interface ExplorerContextMenuState {
  room: RoomsWorkspaceRoom;
  x: number;
  y: number;
}

interface EditorExplorerContextMenuProps {
  state: ExplorerContextMenuState;
  groups?: ReadonlyArray<Pick<EditorSceneGroup, "id" | "name">>;
  currentGroupID?: string | null;
  onClose(): void;
  onAddRoomBeside?(): void;
  onConnectNextScene?(): void;
  onDelete(): void;
  onDuplicate(): void;
  onMoveToGroup?(groupID: string | null): void;
  onRunRoom?(): void;
  onRename(): void;
  onSetStartRoom?(): void;
  runRoomDisabled?: boolean;
  isStart?: boolean;
}

function EditorExplorerContextMenu({
  state,
  groups = [],
  currentGroupID = null,
  onClose,
  onAddRoomBeside,
  onConnectNextScene,
  onDelete,
  onDuplicate,
  onMoveToGroup,
  onRunRoom,
  onRename,
  onSetStartRoom,
  runRoomDisabled = false,
  isStart = false
}: EditorExplorerContextMenuProps): React.ReactElement {
  const [moveGroupOpen, setMoveGroupOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const menuLeft = Math.min(state.x, window.innerWidth - 188);
  const contextualActionCount = [onAddRoomBeside, onConnectNextScene, onRunRoom, onSetStartRoom && !isStart]
    .filter(Boolean)
    .length;
  const moveGroupOptionCount = moveGroupOpen ? Math.max(1, groups.length + 1) : 0;
  const estimatedMenuHeight = 12
    + (contextualActionCount + 4 + moveGroupOptionCount) * 34
    + (contextualActionCount > 0 ? 8 : 0)
    + (moveGroupOpen ? 4 : 0);
  const menuTop = Math.max(8, Math.min(state.y, window.innerHeight - estimatedMenuHeight));
  const roomLabel = sceneDisplayName(state.room.name);
  const hasContextualActions = contextualActionCount > 0;

  function selectGroup(groupID: string | null): void {
    onMoveToGroup?.(groupID);
    onClose();
  }

  return (
    <div
      className="editor-explorer-context-menu-backdrop"
      onContextMenu={(event) => event.preventDefault()}
      onMouseDown={onClose}
      role="presentation"
    >
      <menu
        aria-label={`Ações para ${roomLabel}`}
        className="editor-explorer-context-menu"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ left: `${menuLeft}px`, top: `${menuTop}px` }}
      >
        {onAddRoomBeside ? (
          <li>
            <button onClick={onAddRoomBeside} type="button">Adicionar cena ao lado</button>
          </li>
        ) : null}
        {onConnectNextScene ? (
          <li>
            <button onClick={onConnectNextScene} type="button">Conectar próxima cena</button>
          </li>
        ) : null}
        {onRunRoom ? (
          <li>
            <button disabled={runRoomDisabled} onClick={onRunRoom} type="button">Testar cena</button>
          </li>
        ) : null}
        {onSetStartRoom && !isStart ? (
          <li>
            <button onClick={onSetStartRoom} type="button">Definir como cena inicial</button>
          </li>
        ) : null}
        {onMoveToGroup ? (
          <>
            <li>
              <button
                aria-expanded={moveGroupOpen}
                aria-haspopup="true"
                className="editor-explorer-context-menu-disclosure"
                onClick={() => setMoveGroupOpen((current) => !current)}
                type="button"
              >
                <span>Mover para o grupo</span>
                <ChevronRight aria-hidden="true" className={moveGroupOpen ? "is-open" : ""} size={15} strokeWidth={2.2} />
              </button>
            </li>
            {moveGroupOpen ? (
              <li className="editor-explorer-context-menu-group-options">
                <div aria-label="Grupos de cenas" role="group">
                  <button
                    aria-pressed={currentGroupID === null}
                    className={currentGroupID === null ? "is-selected" : ""}
                    onClick={() => selectGroup(null)}
                    type="button"
                  >
                    <span className="editor-explorer-context-menu-group-check">
                      {currentGroupID === null ? <Check aria-hidden="true" size={13} strokeWidth={2.5} /> : null}
                    </span>
                    Sem grupo
                  </button>
                  {groups.map((group) => (
                    <button
                      aria-pressed={currentGroupID === group.id}
                      className={currentGroupID === group.id ? "is-selected" : ""}
                      key={group.id}
                      onClick={() => selectGroup(group.id)}
                      type="button"
                    >
                      <span className="editor-explorer-context-menu-group-check">
                        {currentGroupID === group.id ? <Check aria-hidden="true" size={13} strokeWidth={2.5} /> : null}
                      </span>
                      {group.name}
                    </button>
                  ))}
                  {groups.length === 0 ? <span className="editor-explorer-context-menu-group-empty">Nenhum grupo criado</span> : null}
                </div>
              </li>
            ) : null}
          </>
        ) : null}
        {hasContextualActions ? <li aria-hidden="true" className="editor-explorer-context-menu-separator" role="separator" /> : null}
        <li>
          <button onClick={onRename} type="button">Renomear</button>
        </li>
        <li>
          <button onClick={onDuplicate} type="button">Duplicar</button>
        </li>
        <li>
          <button className="danger" onClick={onDelete} type="button">Excluir</button>
        </li>
      </menu>
    </div>
  );
}

function RoomNamePromptDialog({ state, onCancel, onConfirm }: RoomNamePromptDialogProps): React.ReactElement {
  const [name, setName] = useState(state.defaultName);

  useEffect(() => {
    setName(state.defaultName);
  }, [state.defaultName, state.title]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onConfirm(name.trim());
  }

  return (
    <div className="room-name-prompt-backdrop" onMouseDown={onCancel} role="presentation">
      <form
        aria-label={state.title}
        aria-modal="true"
        className="room-name-prompt"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        role="dialog"
      >
        <header className="room-name-prompt-header">
          <strong>{state.title}</strong>
          <button aria-label="Cancelar" onClick={onCancel} type="button">
            <X aria-hidden="true" size={14} strokeWidth={2.2} />
          </button>
        </header>
        <label className="room-name-prompt-field">
          <span>{state.fieldLabel ?? "Nome da cena"}</span>
          <input
            aria-label={state.fieldLabel ?? "Nome da cena"}
            autoFocus
            onChange={(event) => setName(event.currentTarget.value)}
            value={name}
          />
        </label>
        <div className="room-name-prompt-actions">
          <button onClick={onCancel} type="button">Cancelar</button>
          <button disabled={!name.trim()} type="submit">{state.confirmLabel}</button>
        </div>
      </form>
    </div>
  );
}

interface RoomSceneEventMarkerProps {
  projectData?: GBAProjectData | null;
  projectPath?: string;
  playerEntity?: RoomsWorkspaceEntity;
  onArrivalPreviewVisibilityChange?: (linkID: string, visible: boolean) => void;
  link: RoomEventSceneLink;
  room: RoomsWorkspaceRoom;
  editable?: boolean;
  onSelectArrival?: (link: RoomEventSceneLink) => void;
  onOpenEvent?: (eventName: string, sourceRoomName?: string) => void;
  onUpdateEventStep?: (eventID: string, stepIndex: number, fields: UpdateEventStepFields) => void;
}

const roomEventMarkerDirections = ["down", "left", "up", "right"] as const;

function roomEventMarkerDirection(value: RoomEventSceneLink["direction"]): typeof roomEventMarkerDirections[number] {
  return value && roomEventMarkerDirections.includes(value as typeof roomEventMarkerDirections[number])
    ? value as typeof roomEventMarkerDirections[number]
    : "down";
}

function roomEventMarkerRotation(direction: typeof roomEventMarkerDirections[number]): number {
  return { down: 90, left: 180, up: 270, right: 0 }[direction];
}

export function RoomSceneEventMarker({
  projectData,
  projectPath,
  playerEntity,
  onArrivalPreviewVisibilityChange,
  link,
  room,
  editable = true,
  onOpenEvent,
  onSelectArrival,
  onUpdateEventStep
}: RoomSceneEventMarkerProps): React.ReactElement | null {
  if (link.eventID === null || link.stepIndex === null || link.x === null || link.y === null) return null;

  const [position, setPosition] = useState({ x: link.x, y: link.y });
  const [direction, setDirection] = useState(roomEventMarkerDirection(link.direction));
  const [previewVisible, setPreviewVisible] = useState(false);
  const [imageSizes, setImageSizes] = useState<Record<string, RoomImageSize>>({});
  const arrival = projectData && playerEntity
    ? playerArrivalPreview(projectData, room.name, room.playerActorName, direction) : null;
  const arrivalURL = arrival ? resolveRoomAssetURL(projectPath, arrival.sprite.source, arrival.sprite.bundledDefaultAsset) : null;
  const arrivalEntity = arrival && playerEntity ? {
    ...playerEntity, x: position.x, y: position.y, spriteFrame: arrival.sprite.frame,
    spriteSource: arrival.sprite.source
  } : null;
  const arrivalPreviewAvailable = Boolean(arrivalEntity && arrivalURL && arrival);
  const arrivalStyle = arrivalEntity && arrivalURL
    ? roomEntityStyle(room, arrivalEntity, arrivalURL, imageSizes) : {};
  const markerRef = useRef<HTMLButtonElement | null>(null);
  const positionRef = useRef(position);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  positionRef.current = position;

  useEffect(() => {
    if (draggingRef.current) return;
    setPosition({ x: link.x ?? 0, y: link.y ?? 0 });
    setDirection(roomEventMarkerDirection(link.direction));
  }, [link.direction, link.x, link.y]);

  useEffect(() => {
    if (previewVisible && !arrivalPreviewAvailable) {
      setPreviewVisible(false);
      onArrivalPreviewVisibilityChange?.(link.id, false);
    }
  }, [arrivalPreviewAvailable, link.id, onArrivalPreviewVisibilityChange, previewVisible]);

  const command = link.command ?? `change_scene ${link.to}`;
  const commit = (nextPosition: { x: number; y: number }, nextDirection = direction): void => {
    setPosition(nextPosition);
    setDirection(nextDirection);
    onUpdateEventStep?.(link.eventID!, link.stepIndex!, {
      command: updateRoomEventSceneLinkCommand(command, {
        direction: nextDirection,
        x: nextPosition.x,
        y: nextPosition.y
      })
    });
  };

  const positionFromPointer = (clientX: number, clientY: number): { x: number; y: number } => {
    const layer = markerRef.current?.closest<HTMLElement>(".room-stage-card-canvas, .room-stage-card-preview-layer");
    const rect = layer?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return positionRef.current;
    return {
      x: Math.max(0, Math.min(room.width - 1, Math.floor(((clientX - rect.left) / rect.width) * room.width))),
      y: Math.max(0, Math.min(room.height - 1, Math.floor(((clientY - rect.top) / rect.height) * room.height)))
    };
  };

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0 || !onUpdateEventStep) return;
    event.preventDefault();
    event.stopPropagation();
    draggingRef.current = true;
    movedRef.current = false;
    const pointerID = event.pointerId;
    const handleMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== pointerID) return;
      const next = positionFromPointer(moveEvent.clientX, moveEvent.clientY);
      if (next.x !== positionRef.current.x || next.y !== positionRef.current.y) {
        movedRef.current = true;
        positionRef.current = next;
        setPosition(next);
      }
    };
    const finish = (endEvent: PointerEvent, cancelled = false): void => {
      if (endEvent.pointerId !== pointerID) return;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
      draggingRef.current = false;
      if (!cancelled && movedRef.current) commit(positionRef.current);
      movedRef.current = false;
    };
    const handleUp = (upEvent: PointerEvent): void => finish(upEvent);
    const handleCancel = (cancelEvent: PointerEvent): void => finish(cancelEvent, true);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
  };

  const cycleDirection = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    const currentIndex = roomEventMarkerDirections.indexOf(direction);
    const nextDirection = roomEventMarkerDirections[(currentIndex + 1) % roomEventMarkerDirections.length]!;
    commit(positionRef.current, nextDirection);
  };

  const markerLeft = ((position.x + 0.5) / Math.max(1, room.width)) * 100;
  const markerTop = ((position.y + 0.5) / Math.max(1, room.height)) * 100;
  const markerHorizontalAnchor = position.x <= 1
    ? "start"
    : position.x >= room.width - 2
      ? "end"
      : "center";
  const updateArrivalPreviewVisibility = (visible: boolean): void => {
    const showPreview = visible && arrivalPreviewAvailable;
    setPreviewVisible(showPreview);
    onArrivalPreviewVisibilityChange?.(link.id, showPreview);
  };
  return (
    <>
    {previewVisible && arrivalEntity && arrivalURL && arrival ? <>
      <img alt="" aria-hidden="true" className="room-stage-sprite-probe" src={arrivalURL}
        onLoad={event => setImageSizes({ [arrival.sprite.source ?? '']: { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight } })} />
      <span aria-label={`Prévia de chegada do player: ${position.x}, ${position.y}, ${direction}`}
        data-player-arrival-preview="true" data-direction={direction}
        className="room-stage-entity actor has-sprite room-player-arrival-preview"
        style={{ ...arrivalStyle,
          pointerEvents: 'none', zIndex: 7,
          transform: arrival.flipX ? `${arrivalStyle.transform ?? ''} scaleX(-1)` : arrivalStyle.transform }} />
    </> : null}
    <span
      className={`room-scene-event-marker room-scene-event-marker-${markerHorizontalAnchor}${editable ? "" : " is-readonly"}`}
      data-event-id={link.eventID}
      data-scene-event-marker="true"
      data-step-index={link.stepIndex}
      onMouseEnter={() => updateArrivalPreviewVisibility(true)}
      onMouseLeave={event => {
        if (!draggingRef.current && !event.currentTarget.contains(document.activeElement)) updateArrivalPreviewVisibility(false);
      }}
      onFocus={() => updateArrivalPreviewVisibility(true)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) updateArrivalPreviewVisibility(false); }}
      style={{ left: `${markerLeft}%`, top: `${markerTop}%` }}
    >
      <button
        aria-label={`Destino de ${link.eventName}: ${position.x}, ${position.y}, direção ${direction}`}
        className="room-scene-event-marker-point"
        ref={markerRef}
        onClick={(event) => {
          event.stopPropagation();
          if (movedRef.current) {
            movedRef.current = false;
            return;
          }
          if (onSelectArrival) onSelectArrival(link);
          else onOpenEvent?.(link.eventName, link.from);
        }}
        onPointerDown={editable ? startDrag : undefined}
        title={editable
          ? `Chegada de transição · ${link.from} → ${link.to}. Arrastar altera o evento ${link.eventName}. Direção: ${direction}`
          : `Destino ${position.x}, ${position.y}, direção ${direction}. Abra a cena para editar.`}
        type="button"
      >
        <span
          aria-hidden="true"
          className="room-scene-event-marker-arrow"
          style={{ transform: `rotate(${roomEventMarkerRotation(direction)}deg)` }}
        >
          ➜
        </span>
      </button>
      {editable ? (
        <button
          aria-label={`Alterar direção de chegada de ${link.eventName}`}
          className="room-scene-event-marker-direction"
          onClick={cycleDirection}
          title="Alterar direção"
          type="button"
        >
          {direction}
        </button>
      ) : (
        <span aria-hidden="true" className="room-scene-event-marker-direction is-readonly">{direction}</span>
      )}
      <span className="room-arrival-source-label" title={`Script ${link.eventName} · evento ${(link.stepIndex ?? 0) + 1}`}>Chegada de {link.from}</span>
    </span>
    </>
  );
}

interface RoomSceneMapInactivePreviewProps {
  room: RoomsWorkspaceRoom;
  cardSize: RoomStageCardSize;
  entities: RoomsWorkspaceEntity[];
  showCardChrome?: boolean;
  isActiveRoom?: boolean;
  projectData?: GBAProjectData | null;
  projectPath?: string;
  assetRefreshToken?: number;
  connectionZones: Array<{ connectionIndex: number; side: "exit" | "entry"; area: RoomConnectionArea }>;
  onActivateRoom(): void;
  onFocusScene?(): void;
  onOpenContextMenu?(event: React.MouseEvent<HTMLElement>): void;
  onRunRoom?(): void;
  runRoomDisabled?: boolean;
}

function compileCanvasToRgb555(canvas: HTMLCanvasElement, palette: readonly number[] = []): void {
  const context = canvas.getContext("2d");
  if (!context || canvas.width <= 0 || canvas.height <= 0) return;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  image.data.set(palette.length > 0
    ? remapRgbaToRgb555Palette(image.data, palette)
    : compileRgbaToRgb555(image.data));
  context.putImageData(image, 0, 0);
}

function compileImageElementToRgb555DataURL(image: HTMLImageElement, palette: readonly number[] = []): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) return image.src;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  compileCanvasToRgb555(canvas, palette);
  return canvas.toDataURL("image/png");
}

function paintRoomTilemapPreview(
  canvas: HTMLCanvasElement,
  room: RoomsWorkspaceRoom,
  tileset: HTMLImageElement,
  outputSize: { height: number; width: number },
  previewFit: { height: number; width: number },
  palette: readonly number[] = []
): void {
  const tileWidth = room.backgroundTileWidth;
  const tileHeight = room.backgroundTileHeight;
  const atlasTileWidth = room.backgroundAtlasTileWidth ?? tileWidth;
  const atlasTileHeight = room.backgroundAtlasTileHeight ?? tileHeight;
  const isIsometric = room.sceneType === "isometric";
  const isometricConfig = isIsometric ? roomIsometricConfig(room) : undefined;
  const isometricWorldSize = isIsometric
    ? roomIsometricSurfaceSize(room) ?? deriveIsometricWorldSize({
        atlasTileHeight,
        config: isometricConfig,
        height: room.height,
        width: room.width
      })
    : null;
  const pixelWidth = isometricWorldSize?.width ?? room.width * tileWidth;
  const pixelHeight = isometricWorldSize?.height
    ?? room.height * tileHeight + Math.max(0, atlasTileHeight - tileHeight);
  const offscreen = document.createElement("canvas");
  offscreen.width = previewFit.width;
  offscreen.height = previewFit.height;

  const offscreenContext = offscreen.getContext("2d");
  if (!offscreenContext) return;

  offscreenContext.clearRect(0, 0, previewFit.width, previewFit.height);
  offscreenContext.imageSmoothingEnabled = false;
  if (room.gbStudioUseBackgroundLayout) {
    offscreenContext.drawImage(tileset, 0, 0, previewFit.width, previewFit.height);
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.drawImage(offscreen, 0, 0, previewFit.width, previewFit.height, 0, 0, outputSize.width, outputSize.height);
    compileCanvasToRgb555(canvas, palette);
    return;
  }

  const previewLayers = isIsometric
    ? orderedIsometricPreviewTileLayers(compileIsometricRoomTiles({
      height: room.height,
      heightLevels: room.heightLevels,
      tileLayers: room.tileLayers,
      visualTiles: room.tileCells,
      width: room.width
    }))
    : [{ mapping: "BG2" as const, tilemap: room.tileCells }];
  const previewScaleX = previewFit.width / pixelWidth;
  const previewScaleY = previewFit.height / pixelHeight;
  for (const previewLayer of previewLayers) {
    for (let index = 0; index < previewLayer.tilemap.length; index += 1) {
      const tileID = previewLayer.tilemap[index] ?? 0;
      if (tileID <= 0) continue;

      const region = tilesetRegionForTileID({
        imageHeight: tileset.naturalHeight,
        imageWidth: tileset.naturalWidth,
        tileHeight: atlasTileHeight,
        tileID,
        tileOffsetX: room.backgroundTileOffsetX,
        tileOffsetY: room.backgroundTileOffsetY,
        tileWidth: atlasTileWidth
      });
      const cartX = index % room.width;
      const cartY = Math.floor(index / room.width);
      const isometricPoint = isIsometric && isometricConfig
        ? projectIsometricRoomPoint({ x: cartX, y: cartY, z: room.heightLevels?.[index] ?? 0 }, room.height, isometricConfig)
        : null;
      const x = isometricPoint && isometricConfig
        ? isometricPoint.x - atlasTileWidth / 2
        : cartX * tileWidth;
      const y = isometricPoint
        ? isometricPoint.y + (room.backgroundAtlasRenderOffsetY ?? 0)
        : cartY * tileHeight;
      offscreenContext.drawImage(
        tileset,
        region.x, region.y, region.width, region.height,
        x * previewScaleX, y * previewScaleY, atlasTileWidth * previewScaleX, atlasTileHeight * previewScaleY
      );
    }
  }

  canvas.width = outputSize.width;
  canvas.height = outputSize.height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.imageSmoothingEnabled = false;
  context.drawImage(offscreen, 0, 0, previewFit.width, previewFit.height, 0, 0, outputSize.width, outputSize.height);
  compileCanvasToRgb555(canvas, palette);
}

function paintRoomLayeredBackgroundPreview(
  canvas: HTMLCanvasElement,
  layers: HTMLImageElement[],
  outputSize: { height: number; width: number },
  previewFit: { height: number; width: number },
  palette: readonly number[] = []
): void {
  canvas.width = outputSize.width;
  canvas.height = outputSize.height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, outputSize.width, outputSize.height);
  context.imageSmoothingEnabled = false;
  layers.forEach((layer) => {
    context.drawImage(layer, 0, 0, layer.naturalWidth, layer.naturalHeight, 0, 0, outputSize.width, outputSize.height);
  });
  compileCanvasToRgb555(canvas, palette);
}

function refreshedPreviewAssetURL(url: string | null, revision: number): string | null {
  return url && revision ? `${url}${url.includes("?") ? "&" : "?"}assetRevision=${revision}` : url;
}

function RoomSceneMapInactivePreview({
  room,
  cardSize,
  entities,
  showCardChrome = true,
  isActiveRoom = false,
  projectData,
  projectPath,
  assetRefreshToken = 0,
  connectionZones,
  onActivateRoom,
  onFocusScene,
  onOpenContextMenu,
  onRunRoom,
  runRoomDisabled = false
}: RoomSceneMapInactivePreviewProps): React.ReactElement {
  const roomLabel = sceneDisplayName(room.name);
  const sceneComposition = sceneCompositionForRoomPreview(room);
  const affinePresentation = sceneCompositionToAffinePresentation(sceneComposition);
  const backgroundURL = refreshedPreviewAssetURL(resolveRoomBackgroundURL(projectPath, room), assetRefreshToken);
  const backgroundLayerURLs = resolveRoomBackgroundLayerURLs(projectPath, room).map(layer => ({
    ...layer, url: refreshedPreviewAssetURL(layer.url, assetRefreshToken)!,
    fallbackURL: layer.fallbackURL ? refreshedPreviewAssetURL(layer.fallbackURL, assetRefreshToken)! : undefined
  }));
  const tacticalSurfacePages = tacticalSurfacePagesForRoom(room);
  const hasTacticalSurfacePreview = hasResolvableTacticalSurfacePage(tacticalSurfacePages, projectData, projectPath);
  const useLayeredBackgroundLayout = room.gbStudioUseBackgroundLayout && backgroundLayerURLs.length > 1;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [spriteImageSizes, setSpriteImageSizes] = useState<Record<string, RoomImageSize>>({});
  const [compiledSpriteURLs, setCompiledSpriteURLs] = useState<Record<string, string>>({});
  const roomPaintRef = useRef(room);
  roomPaintRef.current = room;
  const tilemapSignature = roomTilemapPreviewSignature(
    room.id,
    room.width,
    room.height,
    room.backgroundSource,
    room.tileCells,
    [room.tileLayers, room.heightLevels, room.runtime, room.backgroundTileWidth, room.backgroundTileHeight,
      room.backgroundAtlasTileWidth, room.backgroundAtlasTileHeight, room.backgroundTileOffsetX,
      room.backgroundTileOffsetY, room.backgroundAtlasRenderOffsetY]
  );
  const tilemapPixelSize = room.sceneType === "isometric"
    ? roomIsometricSurfaceSize(room) ?? deriveIsometricWorldSize({
        atlasTileHeight: room.backgroundAtlasTileHeight,
        config: roomIsometricConfig(room),
        height: room.height,
        width: room.width
      })
    : {
        height: room.height * room.backgroundTileHeight,
        width: room.width * room.backgroundTileWidth
      };
  const previewOutputSize = {
    height: cardSize.canvasDisplayHeight,
    width: cardSize.width
  };
  const preserveIsometricCardAspect = !hasTacticalSurfacePreview;
  const displayScale = Math.min(previewOutputSize.width / tilemapPixelSize.width, previewOutputSize.height / tilemapPixelSize.height);
  const previewLayerSize = { width: tilemapPixelSize.width * displayScale, height: tilemapPixelSize.height * displayScale };
  // Keep the composition bitmap independent of zoom; CSS scales it with the card.
  const previewFit = integerNearestNeighborPreviewFit(tilemapPixelSize, SCENE_MAP_PREVIEW_MAX_SIZE);
  const cardPreviewMode = hasTacticalSurfacePreview
    ? "tactical-surface"
    : room.sceneType === "isometric"
      ? "isometric-tilemap"
      : room.gbStudioUseBackgroundLayout
        ? "layered-background"
        : "tilemap";
  const spriteSources = Array.from(new Set(entities.flatMap((entity) => (
    entity.kind === "actor" && entity.spriteSource ? [entity.spriteSource] : []
  ))));

  function rememberSpriteImageSize(source: string, image: HTMLImageElement): void {
    const size = { height: image.naturalHeight, width: image.naturalWidth };
    setSpriteImageSizes((current) => {
      const previous = current[source];
      if (previous?.width === size.width && previous.height === size.height) return current;
      return { ...current, [source]: size };
    });
    const compiledURL = compileImageElementToRgb555DataURL(image, room.objectPalette ?? []);
    setCompiledSpriteURLs((current) => current[source] === compiledURL
      ? current
      : { ...current, [source]: compiledURL });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !backgroundURL) return;

    let cancelled = false;
    if (useLayeredBackgroundLayout) {
      const images = backgroundLayerURLs.map((layer) => {
        const image = new Image();
        if (isDesktopAssetURL(layer.url)) image.crossOrigin = "anonymous";
        return image;
      });
      Promise.all(images.map((image, index) => new Promise<HTMLImageElement>((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Falha ao carregar ${backgroundLayerURLs[index]?.mapping ?? "BG"}.`));
        image.src = backgroundLayerURLs[index]?.url ?? "";
      }))).then((loadedLayers) => {
        if (cancelled) return;
        paintRoomLayeredBackgroundPreview(canvas, loadedLayers, previewFit, previewFit, roomPaintRef.current.backgroundPalette ?? []);
      }).catch(() => {
        // Mantém o card utilizável mesmo quando uma camada visual está ausente.
      });
      return () => {
        cancelled = true;
      };
    }

    const tileset = new Image();
    if (isDesktopAssetURL(backgroundURL)) tileset.crossOrigin = "anonymous";
    tileset.onload = () => {
      if (cancelled) return;
      paintRoomTilemapPreview(canvas, roomPaintRef.current, tileset, previewFit, previewFit, roomPaintRef.current.backgroundPalette ?? []);
    };
    tileset.src = backgroundURL;

    return () => {
      cancelled = true;
    };
  }, [backgroundURL, backgroundLayerURLs.map(layer => layer.url).join("|"), previewFit.height, previewFit.width,
    room.backgroundPalette?.join(",") ?? "", tilemapSignature, useLayeredBackgroundLayout]);

  function openSceneEditor(event: React.SyntheticEvent<HTMLElement>): void {
    if (!onFocusScene) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, input, select, textarea, [contenteditable='true']")) return;
    onActivateRoom();
    onFocusScene();
  }

  function handleSceneCardKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!onFocusScene) return;
    event.preventDefault();
    openSceneEditor(event);
  }

  return (
    <article
      className={`room-stage-card${isActiveRoom ? " is-active-room" : ""}${showCardChrome ? "" : " is-chrome-hidden"}`}
      aria-label={`Card da cena ${roomLabel} · visão geral somente leitura`}
      data-scene-map-preview="true"
      data-scene-map-mode="overview"
      data-card-preview-state="frozen"
      onDoubleClick={onFocusScene ? openSceneEditor : undefined}
      onKeyDown={handleSceneCardKeyDown}
      onContextMenu={onOpenContextMenu}
      tabIndex={onFocusScene ? 0 : undefined}
      style={{
        height: `${cardSize.height}px`,
        width: `${cardSize.width}px`
      }}
    >
      {showCardChrome ? <div className="room-stage-card-header">
          <div className="room-stage-card-title-block">
          <div className="room-stage-card-title-row">
            <span
              aria-hidden="true"
              className="room-stage-card-drag room-stage-card-title-drag"
              title="Mover card da cena"
            >
              <strong>{roomLabel}</strong>
              {room.isStart ? <em>Início do jogo</em> : null}
            </span>
          </div>
          <div className="room-stage-card-tags">
            <span className="room-stage-card-type-tag">{sceneTypeLabel(room.sceneType, roomIsometricConfig(room)?.gameplayMode)}</span>
            {affinePresentation.enabled ? (
              <span className="room-stage-card-affine-tag" title="Esta cena possui uma camada Affine decorativa configurada no Editor.">
                Affine · {affinePresentation.layer}
              </span>
            ) : null}
            {room.collisionCount === 0 ? (
              <span className="room-stage-card-warning warning" title="Sem colisão">
                <AlertTriangle aria-hidden="true" size={11} strokeWidth={2.5} />
                Sem colisão
              </span>
            ) : null}
          </div>
        </div>
        <div className="room-stage-card-actions">
          {onFocusScene ? (
            <button
              aria-label={`Editar cena ${roomLabel}`}
              className="room-stage-card-edit-button"
              onClick={(event) => {
                event.stopPropagation();
                onFocusScene();
              }}
              onPointerDown={(event) => event.stopPropagation()}
              title="Editar cena"
              type="button"
            >
              <ScanSearch aria-hidden="true" size={14} strokeWidth={2.3} />
              <span>Editar cena</span>
            </button>
          ) : null}
          {onOpenContextMenu ? (
            <button
              aria-label={`Mais opções da cena ${roomLabel}`}
              onClick={(event) => {
                event.stopPropagation();
                onOpenContextMenu(event);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              title="Mais opções da cena"
              type="button"
            >
              <MoreHorizontal aria-hidden="true" size={14} strokeWidth={2.3} />
            </button>
          ) : null}
          {onRunRoom ? (
            <button
              aria-label={`Executar somente a cena ${roomLabel}`}
              disabled={runRoomDisabled}
              onClick={(event) => {
                event.stopPropagation();
                onRunRoom();
              }}
              onPointerDown={(event) => event.stopPropagation()}
              title="Executar somente esta cena"
              type="button"
            >
              <Zap aria-hidden="true" size={14} strokeWidth={2.2} />
              <span>Testar</span>
            </button>
          ) : null}
        </div>
      </div> : null}
      <div
        className={`room-stage-card-canvas room-stage-card-canvas-readonly${room.sceneType === "isometric" ? " isometric" : ""}${room.gbStudioUseBackgroundLayout ? " has-background-layout" : ""}`}
        onPointerDown={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest("button")) return;
          onActivateRoom();
        }}
        style={{
          height: `${cardSize.canvasDisplayHeight}px`
        }}
      >
        <div
          className="room-stage-card-preview-layer"
          data-card-preview-mode={cardPreviewMode}
          data-card-preview-projection={preserveIsometricCardAspect ? room.sceneType === "isometric" ? "isometric-contain" : "contain" : "fill"}
          style={{
            height: `${previewLayerSize.height}px`,
            width: `${previewLayerSize.width}px`
          }}
        >
          {hasTacticalSurfacePreview ? (
            <TacticalSurfacePreviewOverlay
              previewSize={previewLayerSize}
              pages={tacticalSurfacePages}
              projectData={projectData}
              projectPath={projectPath}
              assetRefreshToken={assetRefreshToken}
            />
          ) : room.gbStudioUseBackgroundLayout ? backgroundLayerURLs.map((layer) => (
            <img
              alt=""
              aria-hidden="true"
              className="room-stage-background-layout"
              data-background-layer={layer.mapping}
              draggable={false}
              key={`${room.id}-map-background-${layer.mapping}-${layer.url}`}
              onError={(event) => {
                if (layer.fallbackURL && !event.currentTarget.dataset.fallbackTried) {
                  event.currentTarget.dataset.fallbackTried = "true";
                  event.currentTarget.hidden = false;
                  event.currentTarget.src = layer.fallbackURL;
                  return;
                }
                event.currentTarget.hidden = true;
              }}
              src={layer.url}
            />
          )) : (
            <canvas
              aria-hidden="true"
              className="room-stage-card-preview-canvas"
              ref={canvasRef}
              style={{ height: `${previewLayerSize.height}px`, width: `${previewLayerSize.width}px` }}
            />
          )}
          <IsometricPagedForeground room={room} projectData={projectData} projectPath={projectPath} assetRefreshToken={assetRefreshToken} />
          {spriteSources.map((source) => {
            const bundledDefaultAsset = entities.find((entity) => entity.kind === "actor" && entity.spriteSource === source)?.spriteBundledDefaultAsset ?? null;
            const sourceURL = refreshedPreviewAssetURL(resolveRoomAssetURL(projectPath, source, bundledDefaultAsset), assetRefreshToken);
            return sourceURL ? (
              <img
                alt=""
                aria-hidden="true"
                className="room-stage-sprite-probe"
                crossOrigin={isDesktopAssetURL(sourceURL) ? "anonymous" : undefined}
                key={`${room.id}-inactive-sprite-probe-${source}-${room.objectPalette?.join("-") ?? "default"}-${assetRefreshToken}`}
                onLoad={(event) => rememberSpriteImageSize(source, event.currentTarget)}
                src={sourceURL}
              />
            ) : null;
          })}
          {connectionZones.map((zone) => (
            <span
              aria-hidden="true"
              className={[
                "room-connection-zone",
                zone.side,
                "readonly"
              ].filter(Boolean).join(" ")}
              key={`${room.id}-connection-zone-${zone.connectionIndex}-${zone.side}`}
              style={{
                ...roomConnectionAreaStyle(room, zone.area),
                pointerEvents: "none"
              }}
            />
          ))}
          {entities.map((entity) => {
            const width = Math.max(1, entity.width);
            const height = Math.max(1, entity.height);
            const sourceSpriteURL = entity.kind === "actor"
              ? refreshedPreviewAssetURL(resolveRoomAssetURL(projectPath, entity.spriteSource ?? null, entity.spriteBundledDefaultAsset ?? null), assetRefreshToken)
              : null;
            const spriteURL = entity.kind === "actor" && entity.spriteSource
              ? compiledSpriteURLs[entity.spriteSource] ?? sourceSpriteURL
              : sourceSpriteURL;
            return (
              <span
                className={[
                  "room-stage-entity",
                  entity.kind,
                  "readonly",
                  entity.isPlayer ? "is-player" : "",
                  spriteURL ? "has-sprite" : ""
                ].filter(Boolean).join(" ")}
                key={`${entityKey(entity)}-stage-overlay`}
                style={roomEntityStyle(room, { ...entity, width, height }, spriteURL, spriteImageSizes)}
                title={entity.name}
              >
              </span>
            );
          })}
        </div>
      </div>
      {showCardChrome ? <div className="room-stage-card-footer">
        <span className="room-stage-card-dimensions">{roomSceneResolutionLabel(room)} px</span>
        <span>{entities.filter((entity) => entity.kind === "actor" && !entity.isPlayer).length} atores</span>
        {entities.some((entity) => entity.isPlayer) ? <span className="player-present">Player visível</span> : null}
        <span>{entities.filter((entity) => entity.kind === "trigger").length} gatilhos</span>
        {isActiveRoom ? <span className="active">Ativa</span> : null}
      </div> : null}
    </article>
  );
}

function racingPseudo3dConfigForRoom(room: RoomsWorkspaceRoom): RacingSceneConfig | null {
  const runtime = normalizeSceneRuntime(room.sceneType, room.runtime);
  return runtime.type === "racing" ? normalizeRacingSceneConfig(runtime.config) : null;
}

function isPseudo3dRacingRoom(room: RoomsWorkspaceRoom): boolean {
  return racingPseudo3dConfigForRoom(room)?.presentation === "pseudo3d";
}

function racingBackgroundAssetURL(projectPath: string | undefined, assetName: string | undefined): string | null {
  if (!assetName) return null;
  return resolveRoomAssetURL(projectPath, `Assets/backgrounds/${assetName}`)
    ?? resolveRoomAssetURL(projectPath, assetName);
}

function RacingPseudo3dCameraPreview({
  room,
  entities,
  projectPath,
  onOpenTechnicalMap
}: {
  room: RoomsWorkspaceRoom;
  entities: RoomsWorkspaceEntity[];
  projectPath?: string;
  onOpenTechnicalMap(): void;
}): React.ReactElement | null {
  const config = racingPseudo3dConfigForRoom(room);
  if (!config || config.presentation !== "pseudo3d") return null;
  const roomLabel = sceneDisplayName(room.name);

  const visuals = config.pseudo3dVisuals;
  const panoramaURL = racingBackgroundAssetURL(projectPath, visuals?.panoramaBackgroundId);
  const floorURL = racingBackgroundAssetURL(projectPath, visuals?.floorTilemapId);
  const minimapURL = racingBackgroundAssetURL(projectPath, visuals?.minimapAssetId);
  const player = entities.find((entity) => entity.kind === "actor" && entity.name === room.playerActorName)
    ?? entities.find((entity) => entity.kind === "actor")
    ?? null;
  const rival = entities.find((entity) => entity.kind === "actor" && entity !== player) ?? null;
  const playerURL = player
    ? resolveRoomAssetURL(projectPath, player.spriteSource ?? null, player.spriteBundledDefaultAsset ?? null)
    : null;
  const rivalURL = rival
    ? resolveRoomAssetURL(projectPath, rival.spriteSource ?? null, rival.spriteBundledDefaultAsset ?? null)
    : null;
  const preview = buildRacingPseudo3dPreviewModel(config, {
    floorURL,
    minimapURL,
    panoramaURL,
    playerURL,
    rivalURL
  });
  const backgroundStyle = (url: string | null): CSSProperties => url ? { backgroundImage: `url("${url}")` } : {};
  const floorBandStyle = (band: typeof preview.perspectiveBands[number]): CSSProperties => ({
    ...backgroundStyle(preview.floorURL),
    backgroundPosition: `${50 + ((band.lateralOffset / preview.logicalWidth) * 100)}% ${band.sourceY}%`,
    backgroundSize: `${band.scale * 100}% ${band.scale * 100}%`,
    height: `${((band.bottom - band.top) / preview.logicalHeight) * 100}%`,
    top: `${(band.top / preview.logicalHeight) * 100}%`
  });

  return (
    <section
      aria-label={`Câmera pseudo-3D da cena ${roomLabel}`}
      className="racing-pseudo3d-camera-preview"
      data-logical-height={preview.logicalHeight}
      data-logical-width={preview.logicalWidth}
      role="region"
    >
      <span aria-hidden="true" className="racing-pseudo3d-panorama" style={{ ...backgroundStyle(preview.panoramaURL), height: `${(preview.horizonY / preview.logicalHeight) * 100}%` }} />
      <span aria-hidden="true" className="racing-pseudo3d-floor">
        {preview.perspectiveBands.map((band) => (
          <span
            aria-hidden="true"
            className="racing-pseudo3d-floor-band"
            data-band-index={band.index}
            key={band.index}
            style={floorBandStyle(band)}
          />
        ))}
      </span>
      <span aria-hidden="true" className="racing-pseudo3d-horizon" style={{ top: `${(preview.horizonY / preview.logicalHeight) * 100}%` }} />
      {!config.topdownTrack ? <span aria-hidden="true" className="racing-pseudo3d-vehicle rival" style={backgroundStyle(preview.rivalURL)} /> : null}
      {!config.topdownTrack ? <span aria-hidden="true" className="racing-pseudo3d-vehicle player" style={backgroundStyle(preview.playerURL)} /> : null}
      {!config.topdownTrack ? <span aria-hidden="true" className="racing-pseudo3d-hud">
        <b>PRÉVIA</b>
        <i>CURVA</i>
      </span> : null}
      {config.topdownTrack ? <RacingCircuitCamera room={room} config={config} floorURL={floorURL} panoramaURL={panoramaURL} player={player} playerURL={playerURL}/> : null}
      {preview.minimapVisible ? (
        <span
          aria-label={`Minimapa de corrida da cena ${roomLabel}`}
          className="racing-pseudo3d-minimap"
          style={backgroundStyle(preview.minimapURL)}
        />
      ) : null}
      {preview.technicalMapAvailable ? (
        <button
          aria-label={`Abrir mapa técnico da cena ${roomLabel}`}
          className="racing-pseudo3d-technical-map-toggle"
          onClick={onOpenTechnicalMap}
          type="button"
        >
          Editar pista
        </button>
      ) : null}
    </section>
  );
}


function focusSceneWorldLogicalSize(room: RoomsWorkspaceRoom): { width: number; height: number } {
  const geometry = deriveFocusSceneViewportGeometry({ availableWidth: 240, availableHeight: 160,
    isometricConfig: roomIsometricConfig(room), isometricSurfaceSize: roomIsometricSurfaceSize(room),
    projection: room.sceneType === "isometric" ? "isometric" : "orthogonal", atlasTileHeight: room.backgroundAtlasTileHeight,
    roomWidthTiles: room.width, roomHeightTiles: room.height });
  return { width: geometry.worldWidth, height: geometry.worldHeight };
}

interface RoomFocusMinimapProps {
  room: RoomsWorkspaceRoom;
  entities: RoomsWorkspaceEntity[];
  projectData?: GBAProjectData | null;
  projectPath?: string;
  viewport: { height: number; left: number; top: number; width: number };
  worldHeight: number;
  worldWidth: number;
  onNavigate(x: number, y: number): void;
}

function RoomFocusMinimap({
  room,
  entities,
  projectData,
  projectPath,
  viewport,
  worldHeight,
  worldWidth,
  onNavigate
}: RoomFocusMinimapProps): React.ReactElement {
  const minimapCardSize = {
    canvasDisplayHeight: 160, canvasHeight: 160, height: 160, width: 240
  };
  const viewportStyle: CSSProperties = {
    height: `${Math.min(100, (viewport.height / Math.max(1, worldHeight)) * 100)}%`,
    left: `${Math.min(100, (viewport.left / Math.max(1, worldWidth)) * 100)}%`,
    top: `${Math.min(100, (viewport.top / Math.max(1, worldHeight)) * 100)}%`,
    width: `${Math.min(100, (viewport.width / Math.max(1, worldWidth)) * 100)}%`
  };
  const roomLabel = sceneDisplayName(room.name);
  return (
    <aside aria-label={`Minimapa da cena ${roomLabel}`} className="room-focus-minimap">
      <div aria-hidden="true" className="room-focus-minimap-preview">
        <RoomSceneMapInactivePreview
          cardSize={minimapCardSize}
          connectionZones={[]}
          entities={entities}
          onActivateRoom={() => undefined}
          projectData={projectData}
          projectPath={projectPath}
          room={room}
          showCardChrome={false}
        />
      </div>
      <button
        aria-label={`Navegar no minimapa da cena ${roomLabel}`}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)));
          const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height)));
          onNavigate(x, y);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        type="button"
      >
        <span aria-hidden="true" className="room-focus-minimap-viewport" style={viewportStyle} />
      </button>
      <strong>Minimapa</strong>
    </aside>
  );
}

function RoomSceneOverviewButton({ onClick }: { onClick(): void }): React.ReactElement {
  return (
    <button
      aria-label="Voltar à visão geral"
      className="rooms-editor-scene-overview-button"
      onClick={onClick}
      title="Voltar à visão geral do projeto"
      type="button"
    >
      <ScanSearch aria-hidden="true" size={14} strokeWidth={2.2} />
      <span>Visão geral</span>
    </button>
  );
}

interface RoomEditorSceneActionsProps {
  room: RoomsWorkspaceRoom;
  onRunRoom(): void;
  runRoomDisabled?: boolean;
  menuScreens?: MenuSceneConfig["screens"];
  menuScreenID?: string;
  menuItemIndex?: number;
  testStartControl?: React.ReactNode;
  onMenuScreenChange?(screenID: string): void;
  onMenuItemStep?(direction: number): void;
}

function RoomEditorSceneActions({
  room,
  onRunRoom,
  runRoomDisabled = false,
  menuScreens = [],
  menuScreenID,
  menuItemIndex = 0,
  onMenuScreenChange,
  onMenuItemStep,
  testStartControl
}: RoomEditorSceneActionsProps): React.ReactElement {
  const roomLabel = sceneDisplayName(room.name);
  const selectedScreen = menuScreens.find((screen) => screen.id === menuScreenID) ?? menuScreens[0];

  return (
    <div
      aria-label={`Ações da cena ${roomLabel}`}
      className="rooms-editor-scene-actions"
      role="group"
    >
      <span className="rooms-editor-scene-actions-title" title={roomLabel}>{roomLabel}</span>
      <div className="rooms-editor-scene-actions-buttons">
        {menuScreens.length > 1 ? (
          <div className="rooms-editor-menu-preview" role="group" aria-label="Prévia das telas do menu">
            <select aria-label="Tela do menu na prévia" onChange={(event) => onMenuScreenChange?.(event.currentTarget.value)} value={selectedScreen?.id ?? ""}>
              {menuScreens.map((screen) => <option key={screen.id} value={screen.id}>{screen.carousel ? "Opções" : screen.screenType === "title" ? "Título" : screen.title || screen.id}</option>)}
            </select>
            {selectedScreen?.carousel ? (
              <>
                <button aria-label="Opção anterior da prévia" onClick={() => onMenuItemStep?.(-1)} type="button">‹</button>
                <span aria-live="polite">{selectedScreen.items[menuItemIndex]?.label ?? ""}</span>
                <button aria-label="Próxima opção da prévia" onClick={() => onMenuItemStep?.(1)} type="button">›</button>
              </>
            ) : null}
          </div>
        ) : null}
        {testStartControl}
        <button
          aria-label={`Testar cena ${roomLabel}`}
          className="rooms-editor-test-scene-button"
          disabled={runRoomDisabled}
          onClick={onRunRoom}
          title="Testar cena aberta"
          type="button"
        >
          <Play aria-hidden="true" size={14} strokeWidth={2.2} />
          <span>Testar cena</span>
        </button>
      </div>
    </div>
  );
}

interface RoomTilemapEditorProps {
  room: RoomsWorkspaceRoom;
  cardSize: RoomStageCardSize;
  entities: RoomsWorkspaceEntity[];
  hudBinding?: HudPresetBinding | null;
  hudViewportScale?: number;
  projectData?: GBAProjectData | null;
  ghostOpacity: number;
  ghostPreviewEnabled: boolean;
  projectPath?: string;
  renderHudOverlay?: boolean;
  isActiveRoom?: boolean;
  isSceneMapPreview?: boolean;
  isFocusedSceneEditor?: boolean;
  menuPreviewScreenID?: string;
  menuPreviewItemIndex?: number;
  selectedTileID: number;
  setSelectedTileID(tileID: number): void;
  selectedTileStamp: RoomTileStamp;
  setSelectedTileStamp(stamp: RoomTileStamp): void;
  selectedTool: RoomTilePaintTool;
  setSelectedTool(tool: RoomTilePaintTool): void;
  selectedEditMode: RoomCanvasEditMode;
  setSelectedEditMode(mode: RoomCanvasEditMode): void;
  selectedCollisionType: RoomCollisionType;
  setSelectedCollisionType(collisionType: RoomCollisionType): void;
  collisionPlacementMode: RoomCollisionPlacementMode;
  selectedHeightLevel: number;
  collisionHoverPreviewEnabled: boolean;
  selectedEntityKeys: string[];
  selectedHudComponentID?: string | null;
  onSelectHudComponent?(componentID: string | null): void;
  setSelectedEntityKeys(keys: string[]): void;
  selectedEntityTool: RoomEntityCanvasTool;
  canvasLayerLocks: Record<RoomCanvasLayerID, boolean>;
  canvasLayerVisibility: Record<RoomCanvasLayerID, boolean>;
  onApplyTileBrush: RoomsWorkspaceProps["onApplyTileBrush"];
  onSetCollisionType: RoomsWorkspaceProps["onSetCollisionType"];
  onApplyCollisionFill: RoomsWorkspaceProps["onApplyCollisionFill"];
  onApplyCollisionRectangle(roomID: string, startCellIndex: number, endCellIndex: number, collisionType: RoomCollisionType, historyGroupID?: string): void;
  onSetHeightLevel: RoomsWorkspaceProps["onSetHeightLevel"];
  onPlaceRoomEntity: RoomsWorkspaceProps["onPlaceRoomEntity"];
  onUpdateRoomEntity: RoomsWorkspaceProps["onUpdateRoomEntity"];
  onResizeRoomTrigger: RoomsWorkspaceProps["onResizeRoomTrigger"];
  onCreateTrigger: RoomsWorkspaceProps["onCreateTrigger"];
  onCreateActor: RoomsWorkspaceProps["onCreateActor"];
  selectedToolPanelMode?: RoomEditorToolPanelMode;
  triggerPlacementEnabled?: boolean;
  cameraZones?: RoomCameraZone[];
  cameraZonePlacementEnabled?: boolean;
  selectedCameraZoneID?: string | null;
  onSelectCameraZone?: (zoneID: string) => void;
  onCreateCameraZone?: (area: RoomConnectionArea, historyGroupID?: string) => void;
  connectionZones?: Array<{ connectionIndex: number; side: "exit" | "entry"; area: RoomConnectionArea }>;
  connectionZonePlacementEnabled?: boolean;
  connectionZoneSide?: "exit" | "entry" | null;
  selectedConnectionIndex?: number | null;
  connectionZoneTargetRoomName?: string | null;
  connectionZoneEventName?: string;
  eventLinks?: RoomEventSceneLink[];
  onSelectArrival?: (link: RoomEventSceneLink) => void;
  testStart?: { x: number; y: number; direction: string };
  onOpenEvent?: (eventName: string, sourceRoomName?: string) => void;
  onUpdateEventStep?: (eventID: string, stepIndex: number, fields: UpdateEventStepFields) => void;
  onUpdateRoomConnection?: RoomsWorkspaceProps["onUpdateRoomConnection"];
  onCreateRoomWarpConnection?: RoomsWorkspaceProps["onCreateRoomWarpConnection"];
  onSelectConnectionZone?: (connectionIndex: number, side: "exit" | "entry", roomName: string) => void;
  onSelectCanvasCell(roomID: string, cellIndex: number): void;
  onSelectSceneContext?(roomID: string): void;
  onBeginHistoryGroup?: RoomsWorkspaceProps["onBeginHistoryGroup"];
  onEndHistoryGroup?: RoomsWorkspaceProps["onEndHistoryGroup"];
  onActivateRoom?(): void;
  canvasGridVisible?: boolean;
  selectedCanvasCellIndex?: number | null;
  visibleTileCells?: number[];
  racingMapView?: boolean;
  onRacingMapViewChange?: (open:boolean)=>void;
}

function RoomTilemapEditor({
  room,
  cardSize,
  entities,
  hudBinding = null,
  hudViewportScale = 1,
  projectData,
  ghostOpacity,
  ghostPreviewEnabled,
  projectPath,
  renderHudOverlay = true,
  isActiveRoom = false,
  isSceneMapPreview = false,
  isFocusedSceneEditor = false,
  menuPreviewScreenID,
  menuPreviewItemIndex = 0,
  selectedTileID,
  setSelectedTileID,
  selectedTileStamp,
  setSelectedTileStamp,
  selectedTool,
  setSelectedTool,
  selectedEditMode,
  setSelectedEditMode,
  selectedCollisionType,
  setSelectedCollisionType,
  collisionPlacementMode,
  selectedHeightLevel,
  collisionHoverPreviewEnabled,
  selectedEntityKeys,
  selectedHudComponentID,
  onSelectHudComponent,
  setSelectedEntityKeys,
  selectedEntityTool,
  canvasLayerLocks,
  canvasLayerVisibility,
  onApplyTileBrush,
  onSetCollisionType,
  onApplyCollisionFill,
  onApplyCollisionRectangle,
  onSetHeightLevel,
  onPlaceRoomEntity,
  onUpdateRoomEntity,
  onResizeRoomTrigger,
  onCreateTrigger,
  onCreateActor,
  selectedToolPanelMode = "select",
  triggerPlacementEnabled = false,
  cameraZones = [],
  cameraZonePlacementEnabled = false,
  selectedCameraZoneID = null,
  onSelectCameraZone,
  onCreateCameraZone,
  connectionZones = [],
  connectionZonePlacementEnabled = false,
  connectionZoneSide = null,
  selectedConnectionIndex = null,
  connectionZoneTargetRoomName = null,
  connectionZoneEventName = "",
  eventLinks = [],
  onOpenEvent,
  onSelectArrival,
  testStart,
  onUpdateEventStep,
  onUpdateRoomConnection,
  onCreateRoomWarpConnection,
  onSelectConnectionZone,
  onSelectCanvasCell,
  onSelectSceneContext,
  onBeginHistoryGroup,
  onEndHistoryGroup,
  onActivateRoom,
  canvasGridVisible,
  selectedCanvasCellIndex = null,
  visibleTileCells,
  racingMapView,
  onRacingMapViewChange
}: RoomTilemapEditorProps): React.ReactElement {
  const roomLabel = sceneDisplayName(room.name);
  const isometricConfig = roomIsometricConfig(room);
  const isometricSurfaceSize = roomIsometricSurfaceSize(room);
  const isometricGridSurfaceSize = room.sceneType === "isometric"
    ? isometricSurfaceSize ?? deriveIsometricWorldSize({
      atlasTileHeight: room.backgroundAtlasTileHeight,
      config: isometricConfig,
      height: room.height,
      width: room.width
    })
    : null;
  const backgroundURL = resolveRoomBackgroundURL(projectPath, room);
  const backgroundLayerURLs = resolveRoomBackgroundLayerURLs(projectPath, room);
  const [tilesetSize, setTilesetSize] = useState<{ width: number; height: number } | null>(null);
  const [spriteImageSizes, setSpriteImageSizes] = useState<Record<string, RoomImageSize>>({});
  const [compiledBackground, setCompiledBackground] = useState<{ key: string; url: string } | null>(null);
  const [compiledSpriteURLs, setCompiledSpriteURLs] = useState<Record<string, string>>({});
  const [activeArrivalPreviewLinkID, setActiveArrivalPreviewLinkID] = useState<string | null>(null);
  const [localRacingMapOpen, setLocalRacingMapOpen] = useState(false);
  const racingTechnicalMapOpen = racingMapView ?? localRacingMapOpen;
  const setRacingTechnicalMapOpen = onRacingMapViewChange ?? setLocalRacingMapOpen;
  const [collisionPaintType, setCollisionPaintType] = useState<RoomCollisionType | null>(null);
  const [collisionPlacementStart, setCollisionPlacementStart] = useState<number | null>(null);
  const [collisionPlacementEnd, setCollisionPlacementEnd] = useState<number | null>(null);
  const [backgroundPreviewError, setBackgroundPreviewError] = useState(false);
  const [hoverCellIndex, setHoverCellIndex] = useState<number | null>(null);
  const [triggerPlacementStart, setTriggerPlacementStart] = useState<number | null>(null);
  const [triggerPlacementEnd, setTriggerPlacementEnd] = useState<number | null>(null);
  const [connectionZonePlacementStart, setConnectionZonePlacementStart] = useState<number | null>(null);
  const [connectionZonePlacementEnd, setConnectionZonePlacementEnd] = useState<number | null>(null);
  const [cameraZonePlacementStart, setCameraZonePlacementStart] = useState<number | null>(null);
  const [cameraZonePlacementEnd, setCameraZonePlacementEnd] = useState<number | null>(null);
  const [entityDragPreview, setEntityDragPreview] = useState<{ entityKey: string; x: number; y: number } | null>(null);
  const collisionPaintTypeRef = useRef<RoomCollisionType | null>(null);
  const entityPointerDrag = useRef<RoomEntityPointerDrag | null>(null);
  const pendingEmptySceneSelection = useRef<{ pointerID: number; startCellIndex: number; moved: boolean } | null>(null);
  const entityResizePointer = useRef<string | null>(null);
  const pendingEntitySelection = useRef<string[] | null>(null);
  const lastPaintCellIndex = useRef<number | null>(null);
  const canvasHistoryGroupID = useRef<string | null>(null);
  const collisionErasePointer = useRef(false);
  const canvasEntities = entities.filter((entity) => canvasLayerVisibility[entity.kind === "actor" ? "actors" : "triggers"]);
  const arrivalPreviewReplacesPlayer = isFocusedSceneEditor
    && activeArrivalPreviewLinkID !== null
    && eventLinks.some((link) => link.id === activeArrivalPreviewLinkID);
  const canvasRenderEntities = canvasEntities.map((entity) => {
    if (entityDragPreview?.entityKey !== entityKey(entity)) return entity;
    return { ...entity, x: entityDragPreview.x, y: entityDragPreview.y,
      ...(room.sceneType === "isometric" && entity.kind === "actor" ? {
        z: room.heightLevels?.[entityDragPreview.y * room.width + entityDragPreview.x] ?? 0
      } : {})
    };
  });
  const menuConfig = room.runtime?.type === "menu" ? normalizeMenuSceneConfig(room.runtime.config) : null;
  const menuScreens = menuConfig?.screens ?? [];
  const menuPreviewScreen = menuScreens.find((screen) => screen.id === menuPreviewScreenID) ?? menuScreens[0];
  const menuPreviewItemID = (menuPreviewScreen?.items ?? menuConfig?.items)?.[menuPreviewItemIndex]?.id;
  const projectMenuActors = Array.isArray(projectData?.actors) ? projectData.actors as Record<string, unknown>[] : [];
  const canvasDisplayEntities = canvasRenderEntities.filter((entity) => {
    if (arrivalPreviewReplacesPlayer && entity.isPlayer === true) return false;
    if (entity.kind !== "actor" || !menuConfig) return true;
    const actor = projectMenuActors.find((candidate) => candidate.id === entity.id);
    if (menuPreviewScreen && Array.isArray(actor?.menuScreenIDs) && !actor.menuScreenIDs.includes(menuPreviewScreen.id)) return false;
    if (actor?.menuVisibilityVariable) {
      const variable = Array.isArray(projectData?.variables) ? projectData.variables.find(v => v.name === actor.menuVisibilityVariable) : null;
      if (Number(variable?.initialValue ?? 0) !== Number(actor.menuVisibilityValue ?? 0)) return false;
    }
    return !(menuPreviewScreen?.carousel || menuConfig.carousel || actor?.menuActorSelectedOnly === true) || actor?.menuActorRole !== "option" || actor.menuItemID === menuPreviewItemID;
  });
  const canvasVisibleEntityKeys = new Set(canvasDisplayEntities.map((entity) => entityKey(entity)));
  const overlayCells = deriveRoomTileOverlayCells(room, canvasDisplayEntities);
  const selectedEntityCells = deriveRoomSelectedEntityCells(room, canvasDisplayEntities, selectedEntityKeys);
  const selectedEntityKey = selectedEntityKeys.at(-1) ?? null;
  const selectedEntity = entities.find((entity) => entityKey(entity) === selectedEntityKey) ?? null;
  const selectedTrigger = selectedEntity?.kind === "trigger" ? selectedEntity : null;
  const collisionOverlayVisible = isFocusedSceneEditor && canvasLayerVisibility.collision;
  const collisionRectanglePlacementActive = selectedEditMode === "collision"
    && collisionPlacementMode === "rectangle"
    && !canvasLayerLocks.collision;
  const triggerPlacementActive = triggerPlacementEnabled
    && selectedEditMode === "entities"
    && selectedEntityTool === "resize"
    && !selectedTrigger;
  const connectionZoneCreationActive = connectionZonePlacementEnabled
    && selectedToolPanelMode === "warp"
    && selectedConnectionIndex === null
    && connectionZoneSide === "exit"
    && Boolean(connectionZoneTargetRoomName)
    && Boolean(onCreateRoomWarpConnection);
  const connectionZonePlacementActive = connectionZonePlacementEnabled
    && selectedEditMode === "select"
    && connectionZoneSide !== null
    && (selectedConnectionIndex !== null
      ? Boolean(onUpdateRoomConnection)
      : connectionZoneCreationActive);
  const cameraZonePlacementActive = cameraZonePlacementEnabled
    && selectedEditMode === "select"
    && selectedToolPanelMode === "camera"
    && Boolean(onCreateCameraZone);
  const cameraZoneInteractionEnabled = selectedEditMode === "select" && selectedToolPanelMode === "camera";
  const connectionZoneInteractionEnabled = selectedEditMode === "select" && selectedToolPanelMode === "warp";
  const spriteSources = Array.from(new Set(entities.flatMap((entity) => (
    entity.kind === "actor" && entity.spriteSource ? [entity.spriteSource] : []
  ))));
  const backgroundCompilationKey = `${backgroundURL ?? "none"}|${room.backgroundPalette?.join(",") ?? "default"}`;
  const previewBackgroundURL = compiledBackground?.key === backgroundCompilationKey
    ? compiledBackground.url
    : backgroundURL;
  const backgroundPreviewReady = Boolean(
    backgroundURL &&
    tilesetSize &&
    compiledBackground?.key === backgroundCompilationKey
  );
  const objectPaletteKey = room.objectPalette?.join(",") ?? "default";
  const isPseudo3dRacing = isPseudo3dRacingRoom(room);
  useEffect(()=>{if(isPseudo3dRacing && selectedEditMode!=="select") setRacingTechnicalMapOpen(true);},[isPseudo3dRacing,selectedEditMode]);
  const showRacingPseudo3dCamera = isPseudo3dRacing && !racingTechnicalMapOpen;
  const showRacingTechnicalMap = false;
  const sceneComposition = sceneCompositionForRoomPreview(room);
  const affinePresentation = sceneCompositionToAffinePresentation(sceneComposition);
  const tacticalSurfacePages = tacticalSurfacePagesForRoom(room);
  const hasTacticalSurfacePreview = hasResolvableTacticalSurfacePage(tacticalSurfacePages, projectData, projectPath);

  useEffect(() => {
    setBackgroundPreviewError(false);
    setTilesetSize(null);
    setCompiledBackground(null);
  }, [backgroundCompilationKey, backgroundLayerURLs.map((layer) => layer.url).join("|")]);

  function beginCanvasHistoryGroup(): string {
    if (canvasHistoryGroupID.current) return canvasHistoryGroupID.current;
    const historyGroupID = `room-canvas-${room.id}-${roomCanvasHistorySequence += 1}`;
    canvasHistoryGroupID.current = historyGroupID;
    onBeginHistoryGroup?.(historyGroupID);
    return historyGroupID;
  }

  function endCanvasHistoryGroup(): void {
    const historyGroupID = canvasHistoryGroupID.current;
    if (!historyGroupID) return;
    canvasHistoryGroupID.current = null;
    onEndHistoryGroup?.(historyGroupID);
  }

  function rememberSpriteImageSize(source: string, image: HTMLImageElement): void {
    const size = { height: image.naturalHeight, width: image.naturalWidth };
    setSpriteImageSizes((current) => {
      const previous = current[source];
      if (previous?.width === size.width && previous.height === size.height) return current;
      return { ...current, [source]: size };
    });
    const compiledURL = compileImageElementToRgb555DataURL(image, room.objectPalette ?? []);
    const compiledKey = `${source}|${objectPaletteKey}`;
    setCompiledSpriteURLs((current) => current[compiledKey] === compiledURL
      ? current
      : { ...current, [compiledKey]: compiledURL });
  }

  function selectTileFromTileset(event: React.PointerEvent<HTMLImageElement>): void {
    const image = event.currentTarget;
    const bounds = image.getBoundingClientRect();
    const tileID = canvasPointToTilesetTileID({
      imageHeight: image.naturalHeight,
      imageWidth: image.naturalWidth,
      pointX: event.clientX - bounds.left,
      pointY: event.clientY - bounds.top,
      renderedHeight: bounds.height,
      renderedWidth: bounds.width,
      tileHeight: room.backgroundAtlasTileHeight ?? room.backgroundTileHeight,
      tileOffsetX: room.backgroundTileOffsetX,
      tileOffsetY: room.backgroundTileOffsetY,
      tileWidth: room.backgroundAtlasTileWidth ?? room.backgroundTileWidth
    });
    setSelectedTool(selectedTool === "eraser" ? "brush" : selectedTool);
    const stamp = room.tilemapContract
      ? deriveMetatileTilesetStamp({
          anchorTileID: tileID,
          blockHeight: room.tilemapContract.metatileHeight,
          blockWidth: room.tilemapContract.metatileWidth,
          imageHeight: image.naturalHeight,
          imageWidth: image.naturalWidth,
          tileHeight: room.backgroundTileHeight,
          tileOffsetX: room.backgroundTileOffsetX,
          tileOffsetY: room.backgroundTileOffsetY,
          tileWidth: room.backgroundTileWidth
        })
      : { height: 1, tileIDs: [tileID], width: 1 };
    setSelectedTileID(stamp.tileIDs[0] ?? tileID);
    setSelectedTileStamp(stamp);
  }

  function resetTriggerPlacement(): void {
    setTriggerPlacementStart(null);
    setTriggerPlacementEnd(null);
  }

  function resetCollisionPlacement(): void {
    setCollisionPlacementStart(null);
    setCollisionPlacementEnd(null);
  }

  useEffect(() => {
    if (!collisionRectanglePlacementActive) resetCollisionPlacement();
    if (!triggerPlacementActive || canvasLayerLocks.triggers) resetTriggerPlacement();
    if (!connectionZonePlacementActive) resetConnectionZonePlacement();
    if (!cameraZonePlacementActive) resetCameraZonePlacement();
  }, [
    cameraZonePlacementActive,
    canvasLayerLocks.triggers,
    collisionRectanglePlacementActive,
    connectionZonePlacementActive,
    triggerPlacementActive
  ]);

  function isCollisionPlacementCell(index: number): boolean {
    if (collisionPlacementStart === null || collisionPlacementEnd === null) return false;
    return sceneTilemapCellIndexesForRectangle(
      room.width,
      room.height,
      collisionPlacementStart,
      collisionPlacementEnd,
      room.tilemapContract
    ).includes(index);
  }

  function finalizeCollisionPlacement(endCellIndex: number): void {
    if (collisionPlacementStart === null || canvasLayerLocks.collision) return;
    invokeHistoryAware(
      onApplyCollisionRectangle,
      [
        room.id,
        collisionPlacementStart,
        endCellIndex,
        collisionErasePointer.current ? "free" : selectedCollisionType
      ],
      canvasHistoryGroupID.current ?? undefined
    );
    resetCollisionPlacement();
  }

  function resetConnectionZonePlacement(): void {
    setConnectionZonePlacementStart(null);
    setConnectionZonePlacementEnd(null);
  }

  function resetCameraZonePlacement(): void {
    setCameraZonePlacementStart(null);
    setCameraZonePlacementEnd(null);
  }

  function isCameraZonePlacementCell(index: number): boolean {
    if (cameraZonePlacementStart === null || cameraZonePlacementEnd === null) return false;
    const rect = deriveTriggerPlacementFromCells(room.width, cameraZonePlacementStart, cameraZonePlacementEnd);
    const x = index % room.width;
    const y = Math.floor(index / room.width);
    return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
  }

  function finalizeCameraZonePlacement(endCellIndex: number): void {
    if (cameraZonePlacementStart === null || !onCreateCameraZone) return;
    invokeHistoryAware(
      onCreateCameraZone,
      [deriveTriggerPlacementFromCells(room.width, cameraZonePlacementStart, endCellIndex)],
      canvasHistoryGroupID.current ?? undefined
    );
    resetCameraZonePlacement();
  }

  function isConnectionZonePlacementCell(index: number): boolean {
    if (connectionZonePlacementStart === null || connectionZonePlacementEnd === null) return false;
    const rect = deriveTriggerPlacementFromCells(room.width, connectionZonePlacementStart, connectionZonePlacementEnd);
    const x = index % room.width;
    const y = Math.floor(index / room.width);
    return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
  }

  function finalizeConnectionZonePlacement(endCellIndex: number): void {
    if (connectionZonePlacementStart === null || !connectionZoneSide) return;
    const selectedZone = connectionZones.find((zone) => (
      zone.connectionIndex === selectedConnectionIndex && zone.side === connectionZoneSide
    ));
    const rect = connectionZonePlacementStart === endCellIndex && selectedZone
      ? moveRoomConnectionAreaToCell(selectedZone.area, room.width, room.height, endCellIndex)
      : deriveTriggerPlacementFromCells(room.width, connectionZonePlacementStart, endCellIndex);
    if (selectedConnectionIndex === null) {
      if (!onCreateRoomWarpConnection || !connectionZoneTargetRoomName || connectionZoneSide !== "exit") return;
      const createdConnectionIndex = invokeHistoryAware(
        onCreateRoomWarpConnection,
        [room.name, connectionZoneTargetRoomName, connectionZoneEventName, connectionZoneSide, rect],
        canvasHistoryGroupID.current ?? undefined
      );
      if (typeof createdConnectionIndex === "number" && Number.isInteger(createdConnectionIndex)) {
        onSelectConnectionZone?.(createdConnectionIndex, connectionZoneSide, room.name);
      }
      resetConnectionZonePlacement();
      return;
    }
    if (!onUpdateRoomConnection) return;
    invokeHistoryAware(
      onUpdateRoomConnection,
      [selectedConnectionIndex, connectionZoneSide === "exit" ? { exit: rect } : { entry: rect }],
      canvasHistoryGroupID.current ?? undefined
    );
    resetConnectionZonePlacement();
  }

  function isTriggerPlacementCell(index: number): boolean {
    if (triggerPlacementStart === null || triggerPlacementEnd === null) return false;
    const rect = deriveTriggerPlacementFromCells(room.width, triggerPlacementStart, triggerPlacementEnd);
    const x = index % room.width;
    const y = Math.floor(index / room.width);
    return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
  }

  function finalizeTriggerPlacement(endCellIndex: number): void {
    if (triggerPlacementStart === null || canvasLayerLocks.triggers) return;
    const rect = deriveTriggerPlacementFromCells(room.width, triggerPlacementStart, endCellIndex);
    const createdTriggerID = invokeHistoryAware(onCreateTrigger, [{
      height: rect.height,
      roomID: room.id,
      width: rect.width,
      x: rect.x,
      y: rect.y
    }], canvasHistoryGroupID.current ?? undefined);
    resetTriggerPlacement();
    if (createdTriggerID) {
      setSelectedEntityKeys([`trigger:${createdTriggerID}`]);
    }
  }

  function roomTileFromStagePointer(event: React.PointerEvent<HTMLElement>): { x: number; y: number } | null {
    const canvas = event.currentTarget.closest(".room-stage-card-canvas");
    if (!(canvas instanceof HTMLElement)) return null;
    const bounds = canvas.getBoundingClientRect();
    return canvasPointToRoomTile({
      canvasHeight: bounds.height,
      canvasWidth: bounds.width,
      heightLevels: room.heightLevels,
      isometricAtlasTileHeight: room.backgroundAtlasTileHeight,
      isometricConfig: roomIsometricConfig(room),
      isometricSurfaceSize: roomIsometricSurfaceSize(room),
      pointX: event.clientX - bounds.left,
      pointY: event.clientY - bounds.top,
      projection: room.sceneType === "isometric" ? "isometric" : "orthogonal",
      roomHeight: room.height,
      roomWidth: room.width
    });
  }

  function scheduleEntityDragPreview(): void {
    const drag = entityPointerDrag.current;
    if (!drag || drag.frameRequest !== null) return;
    drag.frameRequest = requestAnimationFrame(() => {
      const current = entityPointerDrag.current;
      if (!current || current !== drag) return;
      current.frameRequest = null;
      setEntityDragPreview({
        entityKey: current.entityKey,
        x: current.previewX,
        y: current.previewY
      });
    });
  }

  function previewEntityDragAtTile(tile: { x: number; y: number }): void {
    const drag = entityPointerDrag.current;
    if (!drag) return;
    const entity = canvasEntities.find((candidate) => entityKey(candidate) === drag.entityKey);
    if (!entity) return;
    const nextX = Math.floor(entity.x + tile.x - drag.offsetX - roomEntitySelectionFootprint(entity, room.sceneType).x);
    const nextY = Math.floor(entity.y + tile.y - drag.offsetY - roomEntitySelectionFootprint(entity, room.sceneType).y);
    if (nextX === drag.previewX && nextY === drag.previewY) return;
    drag.previewX = nextX;
    drag.previewY = nextY;
    scheduleEntityDragPreview();
  }

  function previewEntityDragFromPointer(event: React.PointerEvent<HTMLElement>): void {
    const tile = roomTileFromStagePointer(event);
    if (tile) previewEntityDragAtTile(tile);
  }

  function entityResizeHandleStyle(entity: RoomsWorkspaceEntity): CSSProperties {
    const footprint = roomEntitySelectionFootprint(entity, room.sceneType);
    if (room.sceneType === "isometric") {
      const surfaceSize = roomIsometricSurfaceSize(room);
      const endX = Math.min(room.width - 1, footprint.x + footprint.width - 1);
      const endY = Math.min(room.height - 1, footprint.y + footprint.height - 1);
      const placement = isometricRoomTilePlacement(room.width, room.height, endX, endY,
        roomIsometricConfig(room), room.backgroundAtlasTileHeight, surfaceSize);
      return {
        left: `${placement.leftPercent + placement.widthPercent / 2}%`,
        top: `${placement.topPercent + placement.heightPercent - roomIsometricElevationPercent(room, endX, endY, entity.kind === "actor" ? entity.z : undefined)}%`
      };
    }
    return {
      left: `${((footprint.x + footprint.width) / room.width) * 100}%`,
      top: `${((footprint.y + footprint.height) / room.height) * 100}%`
    };
  }

  function startEntityResize(event: React.PointerEvent<HTMLSpanElement>, entity: RoomsWorkspaceEntity): void {
    const layer = entity.kind === "actor" ? "actors" : "triggers";
    if (canvasLayerLocks[layer] || !canvasLayerVisibility[layer]) return;
    event.preventDefault();
    event.stopPropagation();
    beginCanvasHistoryGroup();
    setSelectedEntityKeys([entityKey(entity)]);
    entityResizePointer.current = entityKey(entity);
    event.currentTarget.setPointerCapture(event.pointerId);
    const tile = roomTileFromStagePointer(event);
    if (tile) {
      const footprint = roomEntitySelectionFootprint(entity, room.sceneType);
      invokeHistoryAware(onUpdateRoomEntity, [entity.kind, entity.id, {
        height: Math.max(1, tile.y - footprint.y + 1),
        width: Math.max(1, tile.x - footprint.x + 1)
      }], canvasHistoryGroupID.current ?? undefined);
    }
  }

  function continueEntityResize(event: React.PointerEvent<HTMLSpanElement>, entity: RoomsWorkspaceEntity): void {
    if (entityResizePointer.current !== entityKey(entity) || event.buttons !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    const tile = roomTileFromStagePointer(event);
    if (!tile || canvasLayerLocks[entity.kind === "actor" ? "actors" : "triggers"]) return;
    const footprint = roomEntitySelectionFootprint(entity, room.sceneType);
    invokeHistoryAware(onUpdateRoomEntity, [entity.kind, entity.id, {
      height: Math.max(1, tile.y - footprint.y + 1),
      width: Math.max(1, tile.x - footprint.x + 1)
    }], canvasHistoryGroupID.current ?? undefined);
  }

  function endEntityResize(event: React.PointerEvent<HTMLSpanElement>): void {
    event.preventDefault();
    event.stopPropagation();
    entityResizePointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    endCanvasHistoryGroup();
  }

  function executeCanvasAction(action: RoomCanvasAction, historyGroupID = canvasHistoryGroupID.current ?? undefined): void {
    if (action.type === "tile") {
      if (room.layerEditing?.[room.activeTileLayerMapping]?.locked || canvasLayerLocks.background) return;
      invokeHistoryAware(onApplyTileBrush, [action.roomID, action.options], historyGroupID);
      return;
    }

    if (action.type === "collision") {
      if (canvasLayerLocks.collision) return;
      invokeHistoryAware(onSetCollisionType, [action.roomID, action.cellIndex, action.collisionType], historyGroupID);
      return;
    }

    if (action.type === "collision_fill") {
      if (canvasLayerLocks.collision) return;
      invokeHistoryAware(onApplyCollisionFill, [action.roomID, action.cellIndex, action.collisionType], historyGroupID);
      return;
    }

    if (action.type === "height") {
      invokeHistoryAware(onSetHeightLevel, [action.roomID, action.cellIndex, action.heightLevel], historyGroupID);
      return;
    }

    if (action.type === "select_entity") {
      if (entityPointerDrag.current) {
        pendingEntitySelection.current = action.selectedKeys;
        return;
      }
      setSelectedEntityKeys(action.selectedKeys);
      return;
    }

    if (action.type === "create_actor") {
      if (canvasLayerLocks.actors) return;
      const createdActorID = invokeHistoryAware(onCreateActor, [{
        roomID: action.roomID,
        x: action.options.x,
        y: action.options.y
      }], historyGroupID);
      if (createdActorID) {
        setSelectedEntityKeys([`actor:${createdActorID}`]);
      }
      return;
    }

    if (action.type === "resize_entity") {
      if (canvasLayerLocks[action.kind === "actor" ? "actors" : "triggers"]) return;
      invokeHistoryAware(onUpdateRoomEntity, [action.kind, action.entityID, action.fields], historyGroupID);
      return;
    }

    setSelectedEntityKeys(action.selectedKeys);
    if (action.type === "resize_trigger") {
      if (canvasLayerLocks.triggers) return;
      invokeHistoryAware(onResizeRoomTrigger, [action.triggerID, action.options], historyGroupID);
      return;
    }

    if (canvasLayerLocks[action.kind === "actor" ? "actors" : "triggers"]) return;
    invokeHistoryAware(onPlaceRoomEntity, [action.kind, action.entityID, action.options], historyGroupID);
  }

  function setActiveCollisionPaintType(value: RoomCollisionType | null): void {
    collisionPaintTypeRef.current = value;
    setCollisionPaintType(value);
  }

  function finishEntityPointerInteraction(commit = false): void {
    const drag = entityPointerDrag.current;
    const pendingSelection = pendingEntitySelection.current;
    pendingEntitySelection.current = null;
    if (drag && drag.frameRequest !== null) {
      cancelAnimationFrame(drag.frameRequest);
    }
    if (drag && commit && (drag.previewX !== drag.originX || drag.previewY !== drag.originY)) {
      const layer = drag.kind === "actor" ? "actors" : "triggers";
      if (!canvasLayerLocks[layer]) {
        invokeHistoryAware(onPlaceRoomEntity, [drag.kind, drag.entityID, {
          roomID: room.id,
          x: drag.previewX,
          y: drag.previewY
        }], canvasHistoryGroupID.current ?? undefined);
      }
    }
    if (drag?.captureTarget.hasPointerCapture(drag.pointerID)) {
      drag.captureTarget.releasePointerCapture(drag.pointerID);
    }
    entityPointerDrag.current = null;
    setEntityDragPreview(null);
    if (pendingSelection) {
      setSelectedEntityKeys(pendingSelection);
    }
  }

  useEffect(() => {
    const handleCanvasEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;
      const hasActiveGesture = entityPointerDrag.current !== null
        || entityResizePointer.current !== null
        || collisionPlacementStart !== null
        || triggerPlacementStart !== null
        || connectionZonePlacementStart !== null
        || cameraZonePlacementStart !== null
        || canvasHistoryGroupID.current !== null;
      if (!hasActiveGesture) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finishEntityPointerInteraction(false);
      entityResizePointer.current = null;
      collisionErasePointer.current = false;
      setActiveCollisionPaintType(null);
      lastPaintCellIndex.current = null;
      resetCollisionPlacement();
      resetTriggerPlacement();
      resetConnectionZonePlacement();
      resetCameraZonePlacement();
      endCanvasHistoryGroup();
    };

    window.addEventListener("keydown", handleCanvasEscape, true);
    return () => window.removeEventListener("keydown", handleCanvasEscape, true);
  }, [cameraZonePlacementStart, collisionPlacementStart, connectionZonePlacementStart, triggerPlacementStart]);

  function applyCanvasActions(
    cellIndex: number,
    previousCellIndex: number | null,
    additive = false,
    collisionPaintTypeOverride?: RoomCollisionType
  ): void {
    const entityDrag = entityPointerDrag.current;
    if ((selectedEditMode === "collision" && canvasLayerLocks.collision)
      || (selectedEditMode === "entities" && canvasLayerLocks.actors && selectedEntityTool === "move")
      || (selectedEditMode === "entities" && canvasLayerLocks.triggers && selectedEntityTool === "resize")) {
      return;
    }

    const result = deriveRoomCanvasActions({
      additive,
      cellIndex,
      collisionPaintType: selectedEditMode === "collision"
        ? collisionPaintTypeOverride ?? collisionPaintTypeRef.current ?? collisionPaintType ?? selectedCollisionType
        : collisionPaintTypeRef.current ?? collisionPaintType,
      entities: canvasEntities,
      entityGrabOffset: entityDrag ? { x: entityDrag.offsetX, y: entityDrag.offsetY } : null,
      previousCellIndex,
      room,
      selectedEditMode: entityDrag ? "entities" : selectedEditMode,
      selectedHeightLevel,
      selectedEntityKey: entityDrag?.entityKey ?? selectedEntityKey,
      selectedEntityKeys: entityDrag && previousCellIndex !== null ? [entityDrag.entityKey] : selectedEntityKeys,
      selectedEntityTool,
      selectedTileID,
      selectedTileStamp,
      selectedTool: selectedEditMode === "collision" && collisionPlacementMode === "fill" ? "fill" : selectedTool,
      selectedToolPanelMode,
      visibleEntityKeys: canvasVisibleEntityKeys
    });
    setActiveCollisionPaintType(result.collisionPaintType);
    lastPaintCellIndex.current = result.lastPaintCellIndex;
    result.actions.forEach((action) => executeCanvasAction(action));
  }

  function handleGridPointerDown(event: React.PointerEvent<HTMLButtonElement>, cellIndex: number): void {
    if (sceneMapCardDragActiveRef.current) return;
    const collisionErase = event.button === 2
      && selectedEditMode === "collision"
      && !canvasLayerLocks.collision;
    if (event.button !== 0 && !collisionErase) return;
    event.preventDefault();
    collisionErasePointer.current = collisionErase;
    beginCanvasHistoryGroup();
    if (!isActiveRoom) {
      onActivateRoom?.();
    }
    onSelectCanvasCell(room.id, cellIndex);

    if (event.button === 0 && selectedEditMode === "collision" && event.altKey) {
      const capturedCollisionType = overlayCells[cellIndex]?.collisionType
        ?? room.collisionTypes?.[cellIndex]
        ?? "free";
      setSelectedCollisionType(capturedCollisionType);
      setActiveCollisionPaintType(capturedCollisionType);
      collisionErasePointer.current = false;
      endCanvasHistoryGroup();
      return;
    }

    const tileX = cellIndex % room.width;
    const tileY = Math.floor(cellIndex / room.width);
    if (collisionRectanglePlacementActive) {
      entityPointerDrag.current = null;
      pendingEntitySelection.current = null;
      setCollisionPlacementStart(cellIndex);
      setCollisionPlacementEnd(cellIndex);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const contextualEntity = selectedEditMode === "select" || selectedEditMode === "entities"
      ? selectRoomEntityAtTile(canvasEntities, {
        roomName: room.name,
        sceneType: room.sceneType,
        tileX,
        tileY
      })
      : null;
    const canStartEntityDrag = Boolean(contextualEntity)
      && selectedEntityTool === "move"
      && !connectionZoneInteractionEnabled
      && !connectionZonePlacementActive
      && !cameraZonePlacementActive
      && !triggerPlacementActive
      && (contextualEntity
        ? !canvasLayerLocks[contextualEntity.kind === "actor" ? "actors" : "triggers"]
        : false);
    if (canStartEntityDrag && contextualEntity) {
      const footprint = roomEntitySelectionFootprint(contextualEntity, room.sceneType);
      entityPointerDrag.current = {
        captureTarget: event.currentTarget,
        entityID: contextualEntity.id,
        entityKey: entityKey(contextualEntity),
        frameRequest: null,
        kind: contextualEntity.kind,
        offsetX: tileX - footprint.x,
        offsetY: tileY - footprint.y,
        originX: contextualEntity.x,
        originY: contextualEntity.y,
        pointerID: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        previewX: contextualEntity.x,
        previewY: contextualEntity.y
      };
      pendingEntitySelection.current = null;
      setSelectedEntityKeys(deriveRoomEntitySelection({
        additive: event.shiftKey || event.metaKey || event.ctrlKey,
        currentKeys: selectedEntityKeys,
        entities: canvasEntities,
        roomName: room.name,
        targetKey: entityKey(contextualEntity)
      }));
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    } else {
      entityPointerDrag.current = null;
      pendingEntitySelection.current = null;
    }

    const zoneHit = connectionZoneInteractionEnabled
      ? connectionZoneAtCell(cellIndex, room.width, connectionZones)
      : null;
    if (zoneHit && onSelectConnectionZone) {
      onSelectConnectionZone(zoneHit.connectionIndex, zoneHit.side, room.name);
      beginConnectionZonePlacement(cellIndex, event, setConnectionZonePlacementStart, setConnectionZonePlacementEnd);
      return;
    }

    if (connectionZonePlacementActive) {
      beginConnectionZonePlacement(cellIndex, event, setConnectionZonePlacementStart, setConnectionZonePlacementEnd);
      return;
    }

    if (cameraZonePlacementActive) {
      setCameraZonePlacementStart(cellIndex);
      setCameraZonePlacementEnd(cellIndex);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (triggerPlacementActive) {
      const result = deriveRoomCanvasActions({
        additive: event.shiftKey || event.metaKey || event.ctrlKey,
        cellIndex,
        collisionPaintType: collisionPaintTypeRef.current ?? collisionPaintType,
        entities: canvasEntities,
        previousCellIndex: null,
        room,
        selectedEditMode,
        selectedHeightLevel,
        selectedEntityKey,
        selectedEntityKeys,
        selectedEntityTool,
        selectedTileID,
        selectedTileStamp,
        selectedTool,
        selectedToolPanelMode,
        visibleEntityKeys: canvasVisibleEntityKeys
      });
      if (result.actions.some((action) => action.type === "select_entity")) {
        resetTriggerPlacement();
        result.actions.forEach((action) => executeCanvasAction(action));
        return;
      }

      setTriggerPlacementStart(cellIndex);
      setTriggerPlacementEnd(cellIndex);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const shouldSelectSceneContext = !contextualEntity
      && (selectedEditMode === "select" || selectedEditMode === "entities")
      && (selectedToolPanelMode === "select" || Boolean(selectedEntity));
    pendingEmptySceneSelection.current = shouldSelectSceneContext
      ? { moved: false, pointerID: event.pointerId, startCellIndex: cellIndex }
      : null;

    applyCanvasActions(
      cellIndex,
      null,
      event.shiftKey || event.metaKey || event.ctrlKey,
      collisionErase ? "free" : undefined
    );
  }

  function handleGridPointerEnter(event: React.PointerEvent<HTMLButtonElement>, cellIndex: number): void {
    if (sceneMapCardDragActiveRef.current) return;
    if (entityPointerDrag.current && event.buttons === 1) {
      previewEntityDragAtTile({
        x: cellIndex % room.width,
        y: Math.floor(cellIndex / room.width)
      });
      return;
    }
    setHoverCellIndex(cellIndex);

    if (connectionZonePlacementStart !== null) {
      if (event.buttons === 1) {
        setConnectionZonePlacementEnd(cellIndex);
      }
      return;
    }

    if (pendingEmptySceneSelection.current && event.buttons === 1 && pendingEmptySceneSelection.current.startCellIndex !== cellIndex) {
      pendingEmptySceneSelection.current.moved = true;
    }

    if (collisionErasePointer.current && selectedEditMode === "collision") {
      if (collisionPlacementStart !== null) {
        if (event.buttons === 2) setCollisionPlacementEnd(cellIndex);
      } else if (event.buttons === 2) {
        const previousCellIndex = lastPaintCellIndex.current ?? cellIndex;
        applyCanvasActions(cellIndex, previousCellIndex, false, "free");
      }
      return;
    }

    if (collisionPlacementStart !== null) {
      if (event.buttons === 1) setCollisionPlacementEnd(cellIndex);
      return;
    }

    if (triggerPlacementStart !== null) {
      if (event.buttons === 1) {
        setTriggerPlacementEnd(cellIndex);
      }
      return;
    }


    if (cameraZonePlacementStart !== null) {
      if (event.buttons === 1) setCameraZonePlacementEnd(cellIndex);
      return;
    }

    if (event.buttons !== 1) return;
    const previousCellIndex = lastPaintCellIndex.current ?? cellIndex;
    applyCanvasActions(cellIndex, previousCellIndex);
  }

  function handleGridPointerUp(event: React.PointerEvent<HTMLButtonElement>, cellIndex: number): void {
    if (sceneMapCardDragActiveRef.current) return;
    const collisionErase = collisionErasePointer.current;
    if (event.button !== 0 && !(event.button === 2 && collisionErase)) return;
    if (collisionErase) {
      if (collisionPlacementStart !== null) finalizeCollisionPlacement(cellIndex);
      collisionErasePointer.current = false;
      setActiveCollisionPaintType(null);
      lastPaintCellIndex.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      endCanvasHistoryGroup();
      return;
    }
    if (collisionPlacementStart !== null) {
      finalizeCollisionPlacement(cellIndex);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      endCanvasHistoryGroup();
      return;
    }
    if (entityPointerDrag.current) {
      const drag = entityPointerDrag.current;
      if (event.clientX !== drag.startClientX || event.clientY !== drag.startClientY) {
        previewEntityDragFromPointer(event);
      }
      finishEntityPointerInteraction(true);
      lastPaintCellIndex.current = null;
      endCanvasHistoryGroup();
      return;
    }
    finishEntityPointerInteraction();
    const emptySceneSelection = pendingEmptySceneSelection.current;
    pendingEmptySceneSelection.current = null;
    if (emptySceneSelection?.pointerID === event.pointerId && !emptySceneSelection.moved) {
      onSelectSceneContext?.(room.id);
    }
    if (connectionZonePlacementStart !== null) {
      finalizeConnectionZonePlacement(cellIndex);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      endCanvasHistoryGroup();
      return;
    }

    if (triggerPlacementStart !== null) {
      finalizeTriggerPlacement(cellIndex);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      endCanvasHistoryGroup();
      return;
    }
    if (cameraZonePlacementStart !== null) {
      finalizeCameraZonePlacement(cellIndex);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      endCanvasHistoryGroup();
      return;
    }
    collisionErasePointer.current = false;
    setActiveCollisionPaintType(null);
    lastPaintCellIndex.current = null;
    endCanvasHistoryGroup();
  }

  function gridCellAriaLabel(index: number): string {
    const cellX = index % room.width;
    const cellY = Math.floor(index / room.width);
    const location = room.sceneType === "isometric"
      ? ` · coordenada ${cellX},${cellY} · altura Z${overlayCells[index]?.heightLevel ?? 0}`
      : "";
    if (selectedEditMode === "collision") {
      return collisionPlacementMode === "rectangle"
        ? `Selecionar área de colisão ${index + 1}${location}`
        : collisionPlacementMode === "fill"
          ? `Preencher região de colisão ${index + 1}${location}`
        : `Pintar colisão ${index + 1}${location}`;
    }

    if (selectedEditMode === "height") {
      return `Pintar altura ${index + 1}${location}`;
    }

    if (selectedEditMode === "entities") {
      return selectedEntity
        ? `Editar ${selectedEntity.name} no tile ${index + 1}${location}`
        : `Tile ${index + 1} sem entidade selecionada${location}`;
    }

    return `Pintar tile ${index + 1}${location}`;
  }

  function tileCellStyle(tileID: number, opacity = 1): React.CSSProperties | undefined {
    if (tileID <= 0 || !backgroundURL || !tilesetSize || !backgroundPreviewReady) return undefined;

    const region = tilesetRegionForTileID({
      imageHeight: tilesetSize.height,
      imageWidth: tilesetSize.width,
      tileHeight: room.backgroundAtlasTileHeight ?? room.backgroundTileHeight,
      tileID,
      tileOffsetX: room.backgroundTileOffsetX,
      tileOffsetY: room.backgroundTileOffsetY,
      tileWidth: room.backgroundAtlasTileWidth ?? room.backgroundTileWidth
    });
    return {
      backgroundImage: `url("${previewBackgroundURL}")`,
      backgroundPosition: `${tilesetSize.width === region.width ? 0 : (region.x / (tilesetSize.width - region.width)) * 100}% ${tilesetSize.height === region.height ? 0 : (region.y / (tilesetSize.height - region.height)) * 100}%`,
      backgroundRepeat: "no-repeat",
      backgroundSize: `${(tilesetSize.width / region.width) * 100}% ${(tilesetSize.height / region.height) * 100}%`,
      color: "transparent",
      opacity: opacity < 1 ? opacity : undefined,
      "--room-stage-atlas-height-ratio": String(region.height / Math.max(1, room.backgroundTileHeight)),
      "--room-stage-atlas-offset-y": `${((room.backgroundAtlasRenderOffsetY ?? 0) / Math.max(1, room.backgroundTileHeight)) * 100}%`,
      "--room-stage-atlas-width-ratio": String(region.width / Math.max(1, room.backgroundTileWidth))
    } as React.CSSProperties;
  }

  function paintGhostTileID(cellIndex: number): number | null {
    if (hoverCellIndex === null) return null;
    const anchorX = hoverCellIndex % room.width;
    const anchorY = Math.floor(hoverCellIndex / room.width);
    const cellX = cellIndex % room.width;
    const cellY = Math.floor(cellIndex / room.width);
    const stampX = cellX - anchorX;
    const stampY = cellY - anchorY;
    if (stampX < 0 || stampY < 0 || stampX >= selectedTileStamp.width || stampY >= selectedTileStamp.height) {
      return null;
    }
    return selectedTileStamp.tileIDs[stampY * selectedTileStamp.width + stampX] ?? null;
  }

  const paintLayerMode = selectedEditMode === "tiles" && room.layeredPaintingEnabled;
  const soloLayerMappings = (room.tileLayers ?? [])
    .filter((layer) => room.layerEditing?.[layer.mapping]?.solo)
    .map((layer) => layer.mapping);
  const visibleLayerMappings = (room.tileLayers ?? [])
    .filter((layer) => (
      soloLayerMappings.length > 0
        ? soloLayerMappings.includes(layer.mapping)
        : !room.layerEditing?.[layer.mapping]?.hidden
    ))
    .map((layer) => layer.mapping);
  const editorComposedTiles = room.layeredPaintingEnabled
    ? composeVisibleRoomTileCells(room, visibleLayerMappings)
    : room.tileCells;
  const compiledIsometricPreview = room.sceneType === "isometric"
    ? compileIsometricRoomTiles({
      height: room.height,
      heightLevels: room.heightLevels,
      tileLayers: room.tileLayers,
      visualTiles: room.tileCells,
      width: room.width
    })
    : null;
  const compiledPreviewTiles = compiledIsometricPreview
    ? compiledIsometricPreview.visualTiles
    : editorComposedTiles;
  const isometricPreviewLayers = compiledIsometricPreview
    ? orderedIsometricPreviewTileLayers(compiledIsometricPreview)
    : [];
  const activeLayerEditing = room.layerEditing?.[room.activeTileLayerMapping];
  const staticSurfaceOnly = room.sceneType === "isometric"
    && hasTacticalSurfacePreview;
  const displayCells = staticSurfaceOnly
    ? Array.from({ length: room.width * room.height }, () => -1)
    : paintLayerMode
    ? (activeLayerEditing?.hidden ? room.activeLayerTileCells.map(() => -1) : room.activeLayerTileCells)
    : visibleTileCells ?? compiledPreviewTiles;
  const showGrid = canvasGridVisible ?? true;

  return (
    <article
      className={`room-stage-card${isFocusedSceneEditor ? " is-focused-scene-editor" : ""}`}
      aria-label={isFocusedSceneEditor
        ? `Editor da cena ${roomLabel}`
        : `Card da cena ${roomLabel} · visão geral somente leitura`}
      data-scene-map-mode={isFocusedSceneEditor ? "scene-editor" : "overview"}
      style={{
        height: `${cardSize.height}px`,
        width: `${cardSize.width}px`
      }}
    >
      <div className="room-stage-card-header">
        <div className="room-stage-card-title-block">
          <div className="room-stage-card-title-row">
            <span
              aria-hidden="true"
              className="room-stage-card-drag room-stage-card-title-drag"
              title="Mover card da cena"
            >
              <strong>{roomLabel}</strong>
              {room.isStart ? <em>Início do jogo</em> : null}
            </span>
          </div>
          <div className="room-stage-card-tags">
            <span className="room-stage-card-type-tag">{sceneTypeLabel(room.sceneType, roomIsometricConfig(room)?.gameplayMode)}</span>
            {room.collisionCount === 0 ? (
              <span className="room-stage-card-warning warning" title="Sem colisão">
                <AlertTriangle aria-hidden="true" size={11} strokeWidth={2.5} />
                Sem colisão
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div
        className={[
          "room-stage-card-canvas",
          room.sceneType === "isometric" ? "isometric" : "",
          room.sceneType === "isometric" && isometricConfig?.worldMode === "static_composition" ? "isometric-static-composition" : "",
          room.gbStudioUseBackgroundLayout ? "has-background-layout" : "",
          collisionOverlayVisible ? "is-collision-overlay-visible" : "",
          showGrid && canvasLayerVisibility.grid && !showRacingPseudo3dCamera && !showRacingTechnicalMap ? "is-grid-visible" : "",
          showRacingPseudo3dCamera ? "is-racing-pseudo3d-preview" : "",
          showRacingTechnicalMap ? "is-racing-technical-map-preview" : ""
        ].filter(Boolean).join(" ")}
        data-isometric-world-mode={room.sceneType === "isometric" ? isometricConfig?.worldMode : undefined}
        onPointerLeave={(event) => {
          if (sceneMapCardDragActiveRef.current) return;
          if (event.buttons !== 0) return;
          collisionErasePointer.current = false;
          entityResizePointer.current = null;
          setActiveCollisionPaintType(null);
          setHoverCellIndex(null);
          finishEntityPointerInteraction();
          lastPaintCellIndex.current = null;
          resetCollisionPlacement();
          resetTriggerPlacement();
          resetConnectionZonePlacement();
          resetCameraZonePlacement();
          endCanvasHistoryGroup();
        }}
        onPointerMove={(event) => {
          if (sceneMapCardDragActiveRef.current) return;
          if (entityPointerDrag.current && event.buttons === 1) {
            previewEntityDragFromPointer(event);
          } else if (connectionZonePlacementStart !== null && event.buttons === 1) {
            const cellIndex = cellIndexFromCanvasPointer(event, event.currentTarget, room.width, room.height, room.sceneType, isometricConfig, isometricSurfaceSize, room.backgroundAtlasTileHeight, room.heightLevels);
            setConnectionZonePlacementEnd(cellIndex);
          } else if (triggerPlacementStart !== null && event.buttons === 1) {
            const cellIndex = cellIndexFromCanvasPointer(event, event.currentTarget, room.width, room.height, room.sceneType, isometricConfig, isometricSurfaceSize, room.backgroundAtlasTileHeight, room.heightLevels);
            setTriggerPlacementEnd(cellIndex);
          } else if (cameraZonePlacementStart !== null && event.buttons === 1) {
            const cellIndex = cellIndexFromCanvasPointer(event, event.currentTarget, room.width, room.height, room.sceneType, isometricConfig, isometricSurfaceSize, room.backgroundAtlasTileHeight, room.heightLevels);
            setCameraZonePlacementEnd(cellIndex);
          }
        }}
        onPointerUp={(event) => {
          if (sceneMapCardDragActiveRef.current) return;
          const collisionErase = collisionErasePointer.current;
          if (event.button !== 0 && !(event.button === 2 && collisionErase)) return;
          if (collisionErase) {
            collisionErasePointer.current = false;
            entityResizePointer.current = null;
            setActiveCollisionPaintType(null);
            setHoverCellIndex(null);
            finishEntityPointerInteraction();
            lastPaintCellIndex.current = null;
            resetCollisionPlacement();
            resetTriggerPlacement();
            resetConnectionZonePlacement();
            resetCameraZonePlacement();
            endCanvasHistoryGroup();
            return;
          }
          if (entityPointerDrag.current) {
            const drag = entityPointerDrag.current;
            if (event.clientX !== drag.startClientX || event.clientY !== drag.startClientY) {
              previewEntityDragFromPointer(event);
            }
            finishEntityPointerInteraction(true);
            lastPaintCellIndex.current = null;
            endCanvasHistoryGroup();
            return;
          }
          if (connectionZonePlacementStart !== null) {
            const cellIndex = cellIndexFromCanvasPointer(event, event.currentTarget, room.width, room.height, room.sceneType, isometricConfig, isometricSurfaceSize, room.backgroundAtlasTileHeight, room.heightLevels);
            finalizeConnectionZonePlacement(cellIndex);
            resetConnectionZonePlacement();
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            endCanvasHistoryGroup();
            return;
          }
          if (triggerPlacementStart !== null) {
            const cellIndex = cellIndexFromCanvasPointer(event, event.currentTarget, room.width, room.height, room.sceneType, isometricConfig, isometricSurfaceSize, room.backgroundAtlasTileHeight, room.heightLevels);
            finalizeTriggerPlacement(cellIndex);
            resetTriggerPlacement();
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            endCanvasHistoryGroup();
            return;
          }
          if (cameraZonePlacementStart !== null) {
            const cellIndex = cellIndexFromCanvasPointer(event, event.currentTarget, room.width, room.height, room.sceneType, isometricConfig, isometricSurfaceSize, room.backgroundAtlasTileHeight, room.heightLevels);
            finalizeCameraZonePlacement(cellIndex);
            resetCameraZonePlacement();
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            endCanvasHistoryGroup();
            return;
          }
          collisionErasePointer.current = false;
          entityResizePointer.current = null;
          setActiveCollisionPaintType(null);
          setHoverCellIndex(null);
          finishEntityPointerInteraction(false);
          lastPaintCellIndex.current = null;
          resetCollisionPlacement();
          endCanvasHistoryGroup();
        }}
        onPointerCancel={() => {
          collisionErasePointer.current = false;
          entityResizePointer.current = null;
          setActiveCollisionPaintType(null);
          setHoverCellIndex(null);
          finishEntityPointerInteraction(false);
          lastPaintCellIndex.current = null;
          resetCollisionPlacement();
          resetTriggerPlacement();
          resetConnectionZonePlacement();
          resetCameraZonePlacement();
          endCanvasHistoryGroup();
        }}
        onContextMenu={(event) => {
          if (selectedEditMode === "collision") event.preventDefault();
        }}
        role={showRacingPseudo3dCamera || showRacingTechnicalMap ? undefined : "grid"}
        style={{
          ...(showGrid && canvasLayerVisibility.grid && room.sceneType !== "isometric" && !showRacingPseudo3dCamera && !showRacingTechnicalMap
            ? sceneMapTileGridBackgroundStyle(cardSize.width, cardSize.canvasDisplayHeight, room.width, room.height)
            : {}),
          gridTemplateColumns: showRacingPseudo3dCamera || showRacingTechnicalMap || room.sceneType === "isometric" ? undefined : `repeat(${room.width}, minmax(0, 1fr))`,
          gridTemplateRows: showRacingPseudo3dCamera || showRacingTechnicalMap || room.sceneType === "isometric" ? undefined : `repeat(${room.height}, minmax(0, 1fr))`,
          height: `${cardSize.canvasDisplayHeight}px`,
          transform: isSceneMapPreview || isFocusedSceneEditor ? undefined : `scale(${room.cameraZoom / 100})`,
          transformOrigin: "center"
        }}
      >
        {isFocusedSceneEditor && selectedEditMode === "collision" && collisionOverlayVisible && room.gbStudioUseBackgroundLayout ? (
          <div aria-label="Colisão sobre preview RGB555" className="room-collision-overlay-badge" role="status">
            Colisão sobre preview RGB555
          </div>
        ) : null}
        {isFocusedSceneEditor && canvasLayerVisibility.background ? (
          <SceneCompositionPreviewOverlay
            cardSize={cardSize}
            composition={sceneComposition}
            projectData={projectData}
            projectPath={projectPath}
            room={room}
          />
        ) : null}
        {canvasLayerVisibility.background && hasTacticalSurfacePreview ? (
          <TacticalSurfacePreviewOverlay
            previewSize={cardSize}
            pages={tacticalSurfacePages}
            projectData={projectData}
            projectPath={projectPath}
          />
        ) : canvasLayerVisibility.background && room.gbStudioUseBackgroundLayout ? backgroundLayerURLs.map((layer) => (
          <img
            alt={layer.mapping === "BG2" && room.background ? `Fundo ${room.background}` : `Fundo ${layer.mapping}`}
            className="room-stage-background-layout"
            data-background-layer={layer.mapping}
            draggable={false}
            key={`${room.id}-background-${layer.mapping}-${layer.url}`}
            onError={(event) => {
              if (layer.fallbackURL && !event.currentTarget.dataset.fallbackTried) {
                event.currentTarget.dataset.fallbackTried = "true";
                event.currentTarget.hidden = false;
                event.currentTarget.src = layer.fallbackURL;
                return;
              }
              event.currentTarget.hidden = true;
              if (isFocusedSceneEditor) setBackgroundPreviewError(true);
            }}
            src={layer.url === backgroundURL ? (previewBackgroundURL ?? layer.url) : layer.url}
          />
        )) : null}
        {canvasLayerVisibility.background ? <IsometricPagedForeground room={room} projectData={projectData} projectPath={projectPath} /> : null}
        {showGrid && canvasLayerVisibility.grid && canvasLayerVisibility.background && room.sceneType !== "isometric" && room.gbStudioUseBackgroundLayout && backgroundURL ? (
          <span
            aria-hidden="true"
            className="room-stage-background-grid"
            style={sceneMapTileGridBackgroundStyle(
              cardSize.width,
              cardSize.canvasDisplayHeight,
              room.width,
              room.height
            )}
          />
        ) : null}
        {room.sceneType === "isometric"
          && isometricGridSurfaceSize
          && (showGrid && canvasLayerVisibility.grid
            || isFocusedSceneEditor && (canvasLayerVisibility.cameraBounds || canvasLayerVisibility.worldBounds)) ? (
          <IsometricGridOverlay
            cameraBounds={roomIsometricInitialCameraBounds(room)}
            config={isometricConfig}
            heightLevels={room.heightLevels}
            hoverCellIndex={hoverCellIndex}
            roomHeight={room.height}
            roomWidth={room.width}
            selectedCellIndex={selectedCanvasCellIndex}
            surfaceSize={isometricGridSurfaceSize}
            showCameraBounds={isFocusedSceneEditor && canvasLayerVisibility.cameraBounds}
            showGridCells={showGrid && canvasLayerVisibility.grid}
            showWorldBounds={isFocusedSceneEditor && canvasLayerVisibility.worldBounds}
            useWorldCoordinates={Boolean(roomIsometricSurfaceSize(room))}
            worldMode={isometricConfig?.worldMode}
          />
        ) : null}
        {room.sceneType === "isometric" && hoverCellIndex !== null ? (
          <div className="room-stage-isometric-readout" role="status">
            <strong>Célula {hoverCellIndex % room.width},{Math.floor(hoverCellIndex / room.width)}</strong>
            <span>Z{overlayCells[hoverCellIndex]?.heightLevel ?? 0} · {isometricConfig?.tileWidth ?? 32}×{isometricConfig?.tileHeight ?? 16}</span>
          </div>
        ) : null}
        {room.sceneType === "isometric" && isometricConfig ? (
          <div aria-label="Modo do mundo isométrico" className="room-stage-isometric-mode-badge">
            <strong>{isometricConfig.worldMode === "static_composition" ? "Composição estática" : "Mundo navegável"}</strong>
            <span>Grade {isometricConfig.tileWidth}×{isometricConfig.tileHeight}</span>
          </div>
        ) : null}
        {isFocusedSceneEditor && (backgroundPreviewError || (Boolean(room.background) && !backgroundURL)) ? (
          <div aria-live="polite" className="room-stage-asset-fallback" role="status">
            <strong>Fundo não disponível</strong>
            <span>Selecione ou importe um tileset no Inspetor de Pintura.</span>
          </div>
        ) : null}
        {isFocusedSceneEditor && backgroundURL && !backgroundPreviewReady && !backgroundPreviewError ? (
          <div aria-live="polite" className="room-stage-preview-loading" role="status">
            Preparando preview da cena…
          </div>
        ) : null}
        {backgroundURL ? (
          <img
            alt={room.background ? `Tileset ${room.background}` : "Tileset da cena"}
            className="room-stage-tileset-probe"
            crossOrigin={isDesktopAssetURL(backgroundURL) ? "anonymous" : undefined}
            onLoad={(event) => {
              setBackgroundPreviewError(false);
              setTilesetSize({
                height: event.currentTarget.naturalHeight,
                width: event.currentTarget.naturalWidth
              });
              setCompiledBackground({
                key: backgroundCompilationKey,
                url: compileImageElementToRgb555DataURL(event.currentTarget, room.backgroundPalette ?? [])
              });
            }}
            onError={(event) => {
              event.currentTarget.hidden = true;
              setBackgroundPreviewError(true);
              setTilesetSize(null);
            }}
            onPointerDown={selectTileFromTileset}
            src={backgroundURL}
          />
        ) : null}
        {displayCells.map((tileID, index) => (
          (() => {
            const overlay = overlayCells[index];
            const collisionType = overlay?.collisionType ?? "free";
            const hasCollision = canvasLayerVisibility.collision && collisionType !== "free";
            const actorCount = canvasLayerVisibility.actors ? (overlay?.actorCount ?? 0) : 0;
            const triggerCount = canvasLayerVisibility.triggers ? (overlay?.triggerCount ?? 0) : 0;
            const heightLevel = overlay?.heightLevel ?? 0;
            const isSelectedEntityCell = selectedEntityCells[index] === true;
            const isTriggerPlacementPreview = triggerPlacementActive && isTriggerPlacementCell(index);
            const isConnectionZonePlacementPreview = connectionZonePlacementActive && isConnectionZonePlacementCell(index);
            const isCameraZonePlacementPreview = cameraZonePlacementActive && isCameraZonePlacementCell(index);
            const isCollisionPlacementPreview = collisionRectanglePlacementActive && isCollisionPlacementCell(index);
            const underlayTileID = paintLayerMode ? (visibleTileCells ?? editorComposedTiles)[index] ?? 0 : 0;
            const displayTileID = tileID ?? 0;
            const visibleIsometricOverlayLayers = room.sceneType === "isometric" && !paintLayerMode
              ? isometricPreviewLayers
                .map((layer, layerIndex) => ({ layer, layerIndex }))
                .filter(({ layer }) => layer.mapping !== "BG2" && visibleLayerMappings.includes(layer.mapping))
                .map(({ layer, layerIndex }) => ({
                  layerIndex,
                  tileID: layer.tilemap[index] ?? 0
                }))
                .filter(({ tileID: overlayTileID }) => overlayTileID > 0)
              : [];
            const ghostTileID = paintGhostTileID(index);
            const showHoverPreview = selectedEditMode === "collision"
              && collisionHoverPreviewEnabled
              && canvasLayerVisibility.collision
              && hoverCellIndex === index;
            const showPaintGhost = selectedEditMode === "tiles"
              && ghostPreviewEnabled
              && selectedTool === "brush"
              && ghostTileID !== null
              && backgroundURL
              && tilesetSize;
            const overlayClass = showHoverPreview
              ? collisionOverlayClass(selectedCollisionType)
              : collisionOverlayVisible
                ? collisionOverlayClass(collisionType)
                : "";
            return (
              <button
                aria-label={gridCellAriaLabel(index)}
                className={[
                  "room-stage-cell",
                  hasCollision ? "has-collision" : "",
                  hasCollision ? `has-collision-${collisionType}` : "",
                  isSelectedEntityCell ? "selected-entity-cell" : "",
                  isTriggerPlacementPreview ? "trigger-placement-preview" : "",
                  isConnectionZonePlacementPreview ? "connection-zone-placement-preview" : "",
                  isCameraZonePlacementPreview ? "camera-zone-placement-preview" : "",
                  isCollisionPlacementPreview ? "collision-rectangle-preview" : "",
                  selectedEditMode === "collision" ? "collision-mode" : "",
                  selectedEditMode === "height" ? "height-mode" : "",
                  overlay?.ramp ? "has-isometric-ramp" : "",
                  room.sceneType === "isometric" && overlay?.foreground ? "has-isometric-foreground" : "",
                  heightLevel > 0 ? `has-isometric-height-${heightLevel}` : "",
                  selectedEditMode === "entities" && (actorCount > 0 || triggerCount > 0) ? "entity-mode" : ""
                ].filter(Boolean).join(" ")}
                key={`${room.id}-stage-tile-${index}`}
                onPointerDown={(event) => handleGridPointerDown(event, index)}
                onPointerEnter={(event) => handleGridPointerEnter(event, index)}
                onPointerUp={(event) => handleGridPointerUp(event, index)}
                role="gridcell"
                style={room.sceneType === "isometric" ? (() => {
                  const placement = isometricRoomTilePlacement(
                    room.width,
                    room.height,
                    index % room.width,
                    Math.floor(index / room.width),
                    roomIsometricConfig(room),
                    room.backgroundAtlasTileHeight,
                    roomIsometricSurfaceSize(room)
                  );
                  return {
                    height: `${placement.heightPercent}%`,
                    left: `${placement.leftPercent}%`,
                    top: `${placement.topPercent - heightLevel * (isometricConfig?.heightStep ?? 0) / Math.max(1, isometricGridSurfaceSize?.height ?? 1) * 100}%`,
                    width: `${placement.widthPercent}%`,
                    zIndex: placement.depth
                  };
                })() : undefined}
                type="button"
              >
                {canvasLayerVisibility.background && paintLayerMode && underlayTileID > 0 ? (
                  <span
                    aria-hidden="true"
                    className="room-stage-cell-layer-underlay"
                    style={tileCellStyle(underlayTileID, 0.35)}
                  />
                ) : null}
                {canvasLayerVisibility.background && displayTileID > 0 && (!room.gbStudioUseBackgroundLayout || selectedEditMode === "tiles") ? (
                  <span
                    aria-hidden="true"
                    className="room-stage-cell-tile"
                    style={tileCellStyle(displayTileID, paintLayerMode ? activeLayerEditing?.opacity ?? 1 : 1)}
                  />
                ) : null}
                {canvasLayerVisibility.background ? visibleIsometricOverlayLayers.map(({ layerIndex, tileID: overlayTileID }) => (
                  <span
                    aria-hidden="true"
                    className="room-stage-cell-isometric-layer"
                    key={`${room.id}-stage-tile-${index}-layer-${layerIndex}`}
                    style={{
                      ...tileCellStyle(overlayTileID),
                      zIndex: 2 + layerIndex
                    }}
                  />
                )) : null}
                {showPaintGhost ? (
                  <span
                    aria-hidden="true"
                    className="room-stage-cell-paint-ghost"
                    style={{ ...tileCellStyle(ghostTileID ?? selectedTileID), opacity: ghostOpacity }}
                  />
                ) : null}
                {overlayClass ? (
                  <span
                    aria-hidden="true"
                    className={overlayClass}
                    data-collision-overlay="true"
                    data-collision-type={showHoverPreview ? selectedCollisionType : collisionType}
                  />
                ) : null}
                {room.sceneType === "isometric" && ((heightLevel > 0 && (selectedEditMode === "height" || canvasLayerVisibility.grid))
                  || (selectedEditMode === "height" && (selectedCanvasCellIndex === index || hoverCellIndex === index))) ? (
                  <span aria-hidden="true" className="room-stage-height-badge">Z{heightLevel}</span>
                ) : null}
                {room.sceneType === "isometric" && (selectedEditMode === "height" || canvasLayerVisibility.grid) && overlay?.ramp ? (
                  <span aria-hidden="true" className="room-stage-ramp-badge">↗</span>
                ) : null}
              </button>
            );
          })()
        ))}
        {cameraZones.map((zone) => (
          <button
            aria-label={`Zona de câmera ${zone.name}`}
            className={`room-camera-zone${selectedCameraZoneID === zone.id ? " selected" : ""}`}
            key={`${room.id}-camera-zone-${zone.id}`}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!isActiveRoom) onActivateRoom?.();
              onSelectCameraZone?.(zone.id);
            }}
            style={{
              ...roomConnectionAreaStyle(room, zone.area),
              pointerEvents: cameraZoneInteractionEnabled ? "auto" : "none"
            }}
            type="button"
          />
        ))}
        {spriteSources.map((source) => {
          const bundledDefaultAsset = entities.find((entity) => entity.kind === "actor" && entity.spriteSource === source)?.spriteBundledDefaultAsset ?? null;
          const sourceURL = resolveRoomAssetURL(projectPath, source, bundledDefaultAsset);
          return sourceURL ? (
            <img
              alt=""
              aria-hidden="true"
              className="room-stage-sprite-probe"
              crossOrigin={isDesktopAssetURL(sourceURL) ? "anonymous" : undefined}
              key={`${room.id}-sprite-probe-${source}`}
              onLoad={(event) => rememberSpriteImageSize(source, event.currentTarget)}
              src={sourceURL}
            />
          ) : null;
        })}
        {connectionZoneInteractionEnabled ? connectionZones.map((zone) => (
          <button
            aria-label={zone.side === "exit" ? "Zona de saída da conexão" : "Zona de entrada da conexão"}
            className={[
              "room-connection-zone",
              zone.side,
              selectedConnectionIndex === zone.connectionIndex ? "selected" : ""
            ].filter(Boolean).join(" ")}
            key={`${room.id}-connection-zone-${zone.connectionIndex}-${zone.side}`}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!isActiveRoom) {
                onActivateRoom?.();
              }
              onSelectConnectionZone?.(zone.connectionIndex, zone.side, room.name);
              const startCellIndex = zone.area.y * room.width + zone.area.x;
              beginConnectionZonePlacement(
                startCellIndex,
                event,
                setConnectionZonePlacementStart,
                setConnectionZonePlacementEnd
              );
            }}
            style={{
              ...roomConnectionAreaStyle(room, zone.area),
              pointerEvents: connectionZoneInteractionEnabled ? "auto" : "none"
            }}
            type="button"
          />
        )) : null}
        {canvasDisplayEntities.map((entity) => {
          const width = Math.max(1, entity.width);
          const height = Math.max(1, entity.height);
          const replacedByArrivalPreview = arrivalPreviewReplacesPlayer && entity.isPlayer === true;
          const sourceSpriteURL = entity.kind === "actor"
            ? resolveRoomAssetURL(projectPath, entity.spriteSource ?? null, entity.spriteBundledDefaultAsset ?? null)
            : null;
          const spriteURL = entity.kind === "actor" && entity.spriteSource
            ? compiledSpriteURLs[`${entity.spriteSource}|${objectPaletteKey}`] ?? sourceSpriteURL
            : sourceSpriteURL;
          const affineObj = entity.kind === "actor" ? roomAffineObjPreview(room) : null;
          const menuActor = entity.kind === "actor" && room.sceneType === "menu"
            ? projectMenuActors.find((candidate) => candidate.id === entity.id)
            : undefined;
          return (
            <Fragment key={`${entityKey(entity)}-stage-group`}>
              {entity.kind === "actor" && canvasLayerVisibility.hitboxes && !replacedByArrivalPreview ? (
                <span
                  aria-hidden="true"
                  className={`room-stage-entity-hitbox${room.sceneType === "isometric" ? " isometric" : ""}`}
                  data-entity-overlay="hitbox"
                  key={`${entityKey(entity)}-hitbox-overlay`}
                  style={roomEntityHitboxStyle(room, { ...entity, width, height })}
                />
              ) : null}
              {canvasLayerVisibility[entity.kind === "actor" ? "actors" : "triggers"] && !replacedByArrivalPreview ? <span
                className={[
                  "room-stage-entity",
                  entity.kind,
                  selectedEntityKeys.includes(entityKey(entity)) ? "selected" : "",
                  entity.isPlayer ? "is-player" : "",
                  spriteURL ? "has-sprite" : "",
                  affineObj ? "has-affine-obj" : ""
                ].filter(Boolean).join(" ")}
                data-affine-obj={affineObj ? "true" : undefined}
                data-affine-obj-double-size={affineObj?.doubleSize ? "true" : undefined}
                data-affine-obj-matrix={affineObj ? String(affineObj.matrixIndex) : undefined}
                data-sprite-frame-height={entity.kind === "actor" && entity.spriteFrame ? String(entity.spriteFrame.frameHeight) : undefined}
                data-sprite-frame-width={entity.kind === "actor" && entity.spriteFrame ? String(entity.spriteFrame.frameWidth) : undefined}
                data-sprite-image-height={entity.kind === "actor" && entity.spriteSource && spriteImageSizes[entity.spriteSource] ? String(spriteImageSizes[entity.spriteSource].height) : undefined}
                data-sprite-image-width={entity.kind === "actor" && entity.spriteSource && spriteImageSizes[entity.spriteSource] ? String(spriteImageSizes[entity.spriteSource].width) : undefined}
                key={`${entityKey(entity)}-stage-overlay`}
                style={{ ...roomEntityStyle(room, { ...entity, width, height }, spriteURL, spriteImageSizes),
                  ...(menuActor?.menuMirrorX === true ? { transform: "scaleX(-1)" } : {}) }}
                title={entity.isPlayer
                  ? `Player · ${entity.name} · posição padrão da cena. As transições usam suas próprias chegadas.`
                  : entity.spriteSheet ? `${entity.name}: ${entity.spriteSheet}` : entity.name}
              >
                <span className={`room-stage-entity-label${isFocusedSceneEditor && entity.isPlayer ? " is-player-default-label" : ""}`}>{isFocusedSceneEditor && entity.isPlayer ? "Player · posição padrão" : entity.name}</span>
              </span> : null}
              {selectedEntityTool === "resize"
                && selectedEntityKeys.includes(entityKey(entity))
                && canvasLayerVisibility[entity.kind === "actor" ? "actors" : "triggers"]
                && !canvasLayerLocks[entity.kind === "actor" ? "actors" : "triggers"]
                && !replacedByArrivalPreview ? (
                <span
                  aria-label={`Redimensionar ${entity.name}`}
                  className={`room-stage-entity-resize-handle ${entity.kind}`}
                  onPointerDown={(event) => startEntityResize(event, entity)}
                  onPointerMove={(event) => continueEntityResize(event, entity)}
                  onPointerUp={endEntityResize}
                  style={entityResizeHandleStyle(entity)}
                />
              ) : null}
            </Fragment>
          );
        })}
        {isFocusedSceneEditor && room.isStart ? <span className="room-game-start-label" aria-label="Cena de início do jogo">● Início do jogo</span> : null}
        {isFocusedSceneEditor && testStart ? <span className="room-test-start-marker" aria-label={`Início do teste: ${testStart.x}, ${testStart.y}, ${testStart.direction}`} style={roomTileCenterStyle(room, testStart.x, testStart.y)}>T</span> : null}
        {isFocusedSceneEditor ? eventLinks.map((link) => (
          <RoomSceneEventMarker
            editable
            projectData={projectData}
            projectPath={projectPath}
            playerEntity={canvasRenderEntities.find(entity => entity.isPlayer)}
            onArrivalPreviewVisibilityChange={(linkID, visible) => {
              setActiveArrivalPreviewLinkID((current) => visible
                ? linkID
                : current === linkID ? null : current);
            }}
            key={`${room.id}-${link.id}`}
            link={link}
            onOpenEvent={onOpenEvent}
            onSelectArrival={onSelectArrival}
            onUpdateEventStep={onUpdateEventStep}
            room={room}
          />
        )) : null}
        {isFocusedSceneEditor && canvasLayerVisibility.composition ? <RoomMenuCompositionOverlay room={room} screenID={menuPreviewScreen?.id} selectedItemIndex={menuPreviewItemIndex} /> : null}
        {isFocusedSceneEditor && renderHudOverlay && canvasLayerVisibility.hud && hudBinding ? (
          <RoomHudOverlay
            binding={hudBinding}
            editable={selectedToolPanelMode === "hud"}
            onSelectComponent={onSelectHudComponent}
            projectData={projectData}
            projectPath={projectPath}
            room={room}
            selectedComponentID={selectedHudComponentID}
            viewportScale={hudViewportScale}
          />
        ) : null}
        {showRacingPseudo3dCamera ? (
          <RacingPseudo3dCameraPreview
            entities={entities}
            onOpenTechnicalMap={() => setRacingTechnicalMapOpen(true)}
            projectPath={projectPath}
            room={room}
          />
        ) : null}
        {isPseudo3dRacing && racingTechnicalMapOpen && racingPseudo3dConfigForRoom(room)?.topdownTrack ? <svg
          aria-label="Checkpoints e rota do circuito" viewBox={`0 0 ${room.width*8} ${room.height*8}`}
          style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:4}}>
          <polyline fill="none" stroke="#9b77db" strokeWidth="1" strokeDasharray="4 4" points={(racingPseudo3dConfigForRoom(room)?.topdownTrack?.pathPoints??[]).map(point=>`${point.x},${point.y}`).join(" ")}/>
          {racingPseudo3dConfigForRoom(room)?.topdownTrack?.checkpoints.map((gate,index)=><g key={gate.id}><rect x={gate.x-gate.width/2} y={gate.y-gate.height/2} width={gate.width} height={gate.height} fill={index===0?"#36bf8060":"#aa73ee50"} stroke={index===0?"#36bf80":"#aa73ee"}/><text x={gate.x} y={gate.y} fontSize="8" textAnchor="middle" fill="#251936">{index===0?'Chegada':index}</text></g>)}
        </svg> : null}
        {isPseudo3dRacing && racingTechnicalMapOpen ? <button
          className="racing-pseudo3d-technical-map-toggle" type="button"
          aria-label={`Voltar à prévia GBA da cena ${sceneDisplayName(room.name)}`}
          onClick={()=>setRacingTechnicalMapOpen(false)}>Prévia em perspectiva</button> : null}
      </div>
      <div className="room-stage-card-footer">
        <span>{entities.filter((entity) => entity.kind === "actor" && !entity.isPlayer).length} atores</span>
        {entities.some((entity) => entity.isPlayer) ? <span className="player-present">Player visível</span> : null}
        <span>{entities.filter((entity) => entity.kind === "trigger").length} gatilhos</span>
        {isActiveRoom ? <span className="active">Ativa</span> : null}
      </div>
    </article>
  );
}

export function RoomsWorkspace({
  logicEvents, onCreateLogicVariable, onUpdateLogicValue, onRemoveLogicValue,
  projectData,
  presentation,
  hardwareProfiler,
  budgetAnalysisError,
  budgetAnalysisGeneratedAt,
  budgetAnalysisRunning,
  budgetReport,
  projectPath,
  sceneMapZoom,
  assetRefreshToken = 0,
  focusedTargetID,
  focusedTargetName,
  focusRequestID,
  focusInspectorTab,
  focusedEventName,
  focusedEventRequestID,
  onCreateRoom,
  onSetActiveRoom,
  onUpdateRoomFields,
  onApplyTileBrush,
  onSetActiveTileLayerMapping,
  onSetCollisionType,
  onApplyCollisionFill,
  onSetHeightLevel,
  onCreateRoomConnection,
  onCreateRoomWarpConnection,
  onRemoveRoomConnection,
  onUpdateRoomConnection,
  onUpdateRoomEntity,
  onPlaceRoomEntity,
  onResizeRoomTrigger,
  onCreateTrigger,
  onCreateActor,
  onNudgeRoomEntities,
  onAlignRoomEntities,
  onDistributeRoomEntities,
  onDuplicateRoomEntities,
  onRemoveRoomEntities,
  onUpdateSceneMapPosition,
  onOrganizeSceneMap,
  onUpdateSceneMapZoom,
  onUpdateSceneOrganization,
  onRenameRoom,
  onDuplicateRoom,
  onRemoveRoom,
  onRunRoom,
  runRoomDisabled = false,
  onSetStartRoom,
  onOpenEvent,
  onUpdateEventStep,
  onUpdateDialogue,
  onOpenDialoguesWorkspace, focusedDialogueKey, dialogueFocusRequestID, onCreateDialogue, onDuplicateDialogue, onRemoveDialogue, onNormalizeDialogue,
  renderEventInspector,
  onCreateEventReference,
  onCreateBoundEventsForTargets,
  onSetEventUpdateFrequency,
  commandSuggestions = [],
  onImportTileset,
  onImportTiledMap,
  onUpdateHudPreset,
  onCreateHudVariationForRoom,
  onBindHud,
  onSetActiveHudPreset,
  onDuplicateHudPreset,
  onRemoveHudPreset,
  onImportAssets,
  onUpdateDialoguesUi,
  onUpdateInterfaceTheme,
  onBeginHistoryGroup,
  onEndHistoryGroup,
  onAnalyzeProjectBudget,
  onOpenProjectHealth,
  onSynchronizePrefabs,
  onCreatePrefabFromEntity,
  onInstantiatePrefab,
  onUpdatePrefab
}: RoomsWorkspaceProps): React.ReactElement {
  const [selectedTileID, setSelectedTileID] = useState(1);
  const [selectedTileStamp, setSelectedTileStamp] = useState<RoomTileStamp>({
    height: 1,
    tileIDs: [1],
    width: 1
  });
  const [selectedTool, setSelectedTool] = useState<RoomTilePaintTool>("brush");
  const [ghostPreviewEnabled, setGhostPreviewEnabled] = useState(true);
  const [ghostOpacity, setGhostOpacity] = useState(0.65);
  const [selectedEditMode, setSelectedEditMode] = useState<RoomCanvasEditMode>("select");
  const [selectedToolPanelMode, setSelectedToolPanelMode] = useState<RoomEditorToolPanelMode>("select");
  const [selectedCollisionType, setSelectedCollisionType] = useState<RoomCollisionType>("solid");
  const [collisionPlacementMode, setCollisionPlacementMode] = useState<RoomCollisionPlacementMode>("brush");
  const [selectedHeightLevel, setSelectedHeightLevel] = useState(0);
  const [collisionHoverPreviewEnabled, setCollisionHoverPreviewEnabled] = useState(true);
  const [selectedEntityTool, setSelectedEntityTool] = useState<RoomEntityCanvasTool>("move");
  const [selectedHudComponentID, setSelectedHudComponentID] = useState<string | null>(null);
  const [hudLibraryPresetID, setHudLibraryPresetID] = useState<string | null>(null);
  const [editingSharedHudID, setEditingSharedHudID] = useState<string | null>(null);
  const [hudViewMode, setHudViewMode] = useState<"edit" | "preview">("edit");
  const [hudMenuScreenID, setHudMenuScreenID] = useState("");
  const [sceneMenuScreenID, setSceneMenuScreenID] = useState("");
  const [sceneMenuItemIndex, setSceneMenuItemIndex] = useState(0);
  const [dialoguePreviewKey, setDialoguePreviewKey] = useState<string | null>(null);
  const [canvasLayerVisibility, setCanvasLayerVisibilityState] = useState(defaultCanvasLayerVisibility);
  const [canvasLayerLocks, setCanvasLayerLocks] = useState(defaultCanvasLayerLocks);
  const [selectedConnectionTarget, setSelectedConnectionTarget] = useState("");
  const [connectionEventName, setConnectionEventName] = useState("");
  const [selectedEntityKeys, setSelectedEntityKeys] = useState<string[]>([]);
  const [selectedConnectionIndex, setSelectedConnectionIndex] = useState<number | null>(null);
  const [selectedCameraZoneID, setSelectedCameraZoneID] = useState<string | null>(null);
  const [selectedConnectionZoneSide, setSelectedConnectionZoneSide] = useState<"exit" | "entry">("exit");
  const [selectedSceneMapRoomName, setSelectedSceneMapRoomName] = useState<string | null>(null);
  const [selectedCanvasCell, setSelectedCanvasCell] = useState<SelectedRoomCellState | null>(null);
  const canvasStageRef = useRef<HTMLElement | null>(null);
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const canvasPointerRef = useRef<{ x: number; y: number } | null>(null);
  const pendingCanvasZoomRef = useRef<{ zoom: number; scrollLeft: number; scrollTop: number; focusID: string | null } | null>(null);
  const canvasWheelHandlerRef = useRef<(event: WheelEvent) => void>(() => undefined);
  const focusViewportHostRef = useRef<HTMLDivElement | null>(null);
  const [focusSceneMapRoomID, setFocusSceneMapRoomID] = useState<string | null>(null);
  const [focusedSceneEditorRoomID, setFocusedSceneEditorRoomID] = useState<string | null>(null);
  const [focusSceneZoom, setFocusSceneZoom] = useState(1);
  useEffect(() => { setFocusSceneZoom(1); }, [focusedSceneEditorRoomID]);
  const [focusViewportAvailableSize, setFocusViewportAvailableSize] = useState<{ height: number; width: number }>({
    height: GBA_VIEWPORT_PIXELS.height,
    width: GBA_VIEWPORT_PIXELS.width
  });
  const [focusMinimapViewport, setFocusMinimapViewport] = useState({ height: 0, left: 0, top: 0, width: 0 });
  const [focusMinimapVisible, setFocusMinimapVisible] = useState(true);
  const [focusViewMode, setFocusViewMode] = useState<"viewport" | "map">("viewport");
  const focusViewModeRef = useRef(focusViewMode);
  focusViewModeRef.current = focusViewMode;
  const focusViewportScaleRef = useRef(1);
  const [focusCameraOrigin, setFocusCameraOrigin] = useState({ left: 0, top: 0 });
  const focusCameraOriginRef = useRef(focusCameraOrigin);
  focusCameraOriginRef.current = focusCameraOrigin;
  const focusInitialCameraRoomRef = useRef<string | null>(null);
  const [sceneMapDragPreview, setSceneMapDragPreview] = useState<{ position: SceneMapPosition; roomName: string } | null>(null);
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);
  const [roomNamePrompt, setRoomNamePrompt] = useState<RoomNamePromptState | null>(null);
  const [explorerContextMenu, setExplorerContextMenu] = useState<ExplorerContextMenuState | null>(null);
  const [sceneSearchQuery, setSceneSearchQuery] = useState("");
  const [sceneMultiSelectMode, setSceneMultiSelectMode] = useState(false);
  const [selectedSceneIDs, setSelectedSceneIDs] = useState<Set<string>>(new Set());
  const [lastSelectedSceneID, setLastSelectedSceneID] = useState<string | null>(null);
  const [expandedSceneGroupIDs, setExpandedSceneGroupIDs] = useState<Set<string>>(new Set());
  const [draggedSceneID, setDraggedSceneID] = useState<string | null>(null);
  const [draggedSceneIDs, setDraggedSceneIDs] = useState<string[]>([]);
  const [dragOverSceneID, setDragOverSceneID] = useState<string | null>(null);
  const [dragOverSceneGroupID, setDragOverSceneGroupID] = useState<string | null>(null);
  const [railExpanded, setRailExpanded] = useState<EditorRailExpandState>(defaultEditorRailExpandState);
  const [expandedSceneIDs, setExpandedSceneIDs] = useState<Set<string>>(
    () => new Set(presentation?.rooms.filter((room) => room.isActive).map((room) => room.id) ?? [])
  );
  const [navigatorTab, setNavigatorTab] = useState<"project" | "prefabs" | "logic">("project");
  const [selectedArrivalID, setSelectedArrivalID] = useState<string | null>(null);
  const [testArrivalID, setTestArrivalID] = useState<string>("");
  useEffect(() => { setSelectedArrivalID(null); setTestArrivalID(""); }, [focusedSceneEditorRoomID]);
  const [logicSelection, setLogicSelection] = useState<LogicSelection | null>(null);
  useEffect(() => { setLogicSelection(null); setNavigatorTab("project"); }, [projectPath]);
  const [inspectorTabByContext, setInspectorTabByContext] = useState<Partial<Record<RoomInspectorContextKind, RoomInspectorTabID>>>({});
  const appliedFocusRequestKey = useRef<string | null>(null);
  const appliedEventFocusRequestID = useRef<number | null>(null);
  const canvasWorldRef = useRef<HTMLDivElement | null>(null);
  const sceneMapCardDrag = useRef<SceneMapCardDragState | null>(null);
  const sceneMapCardFrameRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const canvasPanDrag = useRef<CanvasPanDragState | null>(null);

  useEffect(() => {
    setSelectedHudComponentID(null);
    setHudLibraryPresetID(null);
    setEditingSharedHudID(null);
    setHudMenuScreenID("");
    setSceneMenuScreenID("");
    setSceneMenuItemIndex(0);
    setHudViewMode("edit");
  }, [focusedSceneEditorRoomID]);

  useEffect(() => {
    if (selectedToolPanelMode !== "hud") setSelectedHudComponentID(null);
  }, [selectedToolPanelMode]);

  useEffect(() => {
    if (!presentation || !focusInspectorTab) return;
    setInspectorTabByContext((current) => {
      if (current.room === focusInspectorTab) return current;
      return { ...current, room: focusInspectorTab };
    });
  }, [focusRequestID, focusInspectorTab]);

  useEffect(() => {
    if (!presentation || !focusedEventName || !focusedEventRequestID) return;
    if (appliedEventFocusRequestID.current === focusedEventRequestID) return;
    appliedEventFocusRequestID.current = focusedEventRequestID;
    setSelectedEntityKeys([]);
    setSelectedConnectionIndex(null);
    setSelectedToolPanelMode("select");
    setSelectedEditMode("select");
    setInspectorTabByContext((current) => ({ ...current, room: "events" }));
  }, [focusedEventName, focusedEventRequestID, presentation]);

  useEffect(() => {
    if (!presentation || (!focusedTargetID && !focusedTargetName)) return;
    const requestKey = `${focusRequestID ?? "none"}:${focusedTargetID ?? ""}:${focusedTargetName ?? ""}`;
    if (appliedFocusRequestKey.current === requestKey) return;
    const room = presentation.rooms.find((candidate) => (
      candidate.id === focusedTargetID ||
      candidate.name === focusedTargetName
    ));
    if (!room) return;

    appliedFocusRequestKey.current = requestKey;
    if (focusInspectorTab) {
      setFocusedSceneEditorRoomID(room.id);
      setSelectedSceneMapRoomName(room.name);
      setSelectedConnectionIndex(null);
    }
    setSelectedEntityKeys([]);
    setSelectedCanvasCell(null);
    const focusCollision = focusInspectorTab === "collision" && sceneTypeProfile(room.sceneType).editorTools.includes("collision");
    setSelectedEditMode(focusCollision ? "collision" : "select");
    setSelectedToolPanelMode(focusCollision ? "collision" : focusInspectorTab === "hud" ? "hud" : "select");
    setSelectedCameraZoneID(null);
    if (!room.isActive) {
      onSetActiveRoom(room.id, room.name);
    }
  }, [focusRequestID, focusedTargetID, focusedTargetName, focusInspectorTab, presentation]);

  const activeRoom = presentation?.rooms.find((room) => room.isActive) ?? presentation?.rooms[0] ?? null;
  const preflightRoom = presentation?.rooms.find(room => room.name === selectedSceneMapRoomName) ?? activeRoom;
  const inspectorScenePreflight = useMemo(() => projectData && preflightRoom
    ? buildScenePreflightReport(projectData, preflightRoom.name) : null, [projectData, preflightRoom]);
  const focusedEditorRoom = focusedSceneEditorRoomID
    ? presentation?.rooms.find((room) => room.id === focusedSceneEditorRoomID) ?? null
    : null;
  const currentCanvasZoom = focusedEditorRoom ? focusViewMode === "viewport" ? 1 : focusSceneZoom
    : clampSceneMapZoom(sceneMapZoom ?? presentation?.sceneMapZoom ?? 1);
  canvasWheelHandlerRef.current = zoomRoomsCanvas;

  useEffect(() => {
    const scroll = canvasScrollRef.current;
    if (!scroll) return;
    const onWheel = (event: WheelEvent): void => canvasWheelHandlerRef.current(event);
    scroll.addEventListener("wheel", onWheel, { passive: false });
    return () => scroll.removeEventListener("wheel", onWheel);
  }, [Boolean(presentation), focusedSceneEditorRoomID]);

  useEffect(() => {
    canvasPointerRef.current = null;
    pendingCanvasZoomRef.current = null;
  }, [projectPath, focusedSceneEditorRoomID, focusViewMode]);

  useLayoutEffect(() => {
    const scroll = canvasScrollRef.current;
    const pending = pendingCanvasZoomRef.current;
    if (!scroll || !pending || pending.zoom !== currentCanvasZoom || pending.focusID !== focusedSceneEditorRoomID) return;
    scroll.scrollLeft = pending.scrollLeft;
    scroll.scrollTop = pending.scrollTop;
    pendingCanvasZoomRef.current = null;
  }, [currentCanvasZoom, focusedSceneEditorRoomID]);
  const activeSceneProfile = activeRoom ? sceneTypeProfile(activeRoom.sceneType) : null;
  const editorSceneProfile = focusedEditorRoom
    ? sceneTypeProfile(focusedEditorRoom.sceneType)
    : activeSceneProfile;
  const editorToolShortcuts = resolveRoomEditorToolShortcuts(roomEditorShortcutSource(projectData?.settings));
  const activeTileLayers = activeRoom?.tileLayers ?? [];
  const eventReferenceOptions = useMemo(
    () => projectData ? projectEventReferenceOptions(projectData) : [],
    [projectData]
  );
  const activeRoomEntities = activeRoom && presentation
    ? presentation.entities.filter((entity) => entity.roomName === activeRoom.name)
    : [];
  const contextualDialogues = useMemo(() => {
    if (!projectData || !presentation) return null;
    const room = presentation.rooms.find((candidate) => candidate.name === selectedSceneMapRoomName) ?? activeRoom;
    return room ? deriveDialoguesForScene(projectData, { id: room.id, name: room.name }) : null;
  }, [activeRoom, presentation, projectData, selectedSceneMapRoomName]);
  const dialogueCatalog = useMemo(() => projectData ? deriveDialoguesWorkspacePresentation(projectData).dialogues : [], [projectData]);
  const dialogueProfiles = useMemo(() => deriveDialogueCharacterProfiles(dialogueCatalog), [dialogueCatalog]);
  const dialogueUsages = useMemo(() => Object.fromEntries(dialogueCatalog.map(item => [item.key, item.usages])), [dialogueCatalog]);
  const dialogueSceneNames = useMemo(() => {
    const result: Record<string, string[]> = {};
    if (projectData && presentation) for (const room of presentation.rooms) {
      for (const item of deriveDialoguesForScene(projectData, room).dialogues) (result[item.key] ??= []).push(room.name);
    }
    return result;
  }, [projectData, presentation]);
  const dialogueAssetOptions = useMemo(() => {
    if (!Array.isArray(projectData?.assets)) return [];
    return projectData.assets
      .filter((asset): asset is Record<string, unknown> => Boolean(asset) && typeof asset === "object" && !Array.isArray(asset))
      .map((asset) => typeof asset.name === "string" ? asset.name.trim() : "")
      .filter(Boolean);
  }, [projectData]);
  const dialogueSfxOptions = useMemo(() => {
    if (!Array.isArray(projectData?.audioItems)) return [];
    return projectData.audioItems
      .filter((audio): audio is Record<string, unknown> => Boolean(audio) && typeof audio === "object" && !Array.isArray(audio))
      .filter((audio) => typeof audio.kind !== "string" || audio.kind.toLowerCase() === "sfx")
      .map((audio) => typeof audio.name === "string" ? audio.name.trim() : "")
      .filter(Boolean);
  }, [projectData]);

  useEffect(() => {
    if (!editorSceneProfile || selectedToolPanelMode === "warp" || selectedToolPanelMode === "hud" || editorSceneProfile.editorTools.includes(selectedToolPanelMode)) return;
    setSelectedToolPanelMode("select");
    setSelectedEditMode("select");
  }, [editorSceneProfile, selectedToolPanelMode]);

  useEffect(() => {
    if (!focusedSceneEditorRoomID || !focusedEditorRoom) return;

    const handleSceneShortcut = (event: KeyboardEvent): void => {
      if (isEditableKeyboardTarget(event.target)) return;
      const key = event.key.toLocaleLowerCase("en-US");
      const mode = roomEditorToolModeFromShortcut(event, editorToolShortcuts);
      if (mode) {
        if (roomToolUnavailableReason(mode, focusedEditorRoom, sceneTypeProfile(focusedEditorRoom.sceneType).editorTools)) return;
        event.preventDefault();
        setEditorToolPanelMode(mode);
        return;
      }

      if (selectedToolPanelMode === "paint" && (key === "e" || key === "f")) {
        event.preventDefault();
        setSelectedTool(key === "e" ? "eraser" : "fill");
        return;
      }

      if (selectedToolPanelMode === "collision" && ["1", "2", "3"].includes(key)) {
        event.preventDefault();
        setCollisionPlacementMode(key === "1" ? "brush" : key === "2" ? "rectangle" : "fill");
      }
    };

    window.addEventListener("keydown", handleSceneShortcut);
    return () => window.removeEventListener("keydown", handleSceneShortcut);
  }, [editorToolShortcuts, focusedEditorRoom, focusedSceneEditorRoomID, selectedToolPanelMode]);

  useEffect(() => {
    if (!focusedSceneEditorRoomID || !focusedEditorRoom) return;

    const focusRoomEntities = presentation?.entities.filter((entity) => entity.roomName === focusedEditorRoom.name) ?? [];
    const editableSelectedEntityKeys = selectedEntityKeys.filter((key) => {
      const entity = focusRoomEntities.find((candidate) => entityKey(candidate) === key);
      if (!entity) return false;
      return !canvasLayerLocks[entity.kind === "actor" ? "actors" : "triggers"];
    });

    const handleSceneEditShortcut = (event: KeyboardEvent): void => {
      if (isEditableKeyboardTarget(event.target) || editableSelectedEntityKeys.length === 0) return;
      const key = event.key;
      if (!event.metaKey && !event.ctrlKey && !event.altKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) {
        event.preventDefault();
        const stepSize = event.shiftKey ? 8 : 1;
        const delta = key === "ArrowLeft"
          ? { x: -1, y: 0 }
          : key === "ArrowRight"
            ? { x: 1, y: 0 }
            : key === "ArrowUp"
              ? { x: 0, y: -1 }
              : { x: 0, y: 1 };
        onNudgeRoomEntities(focusedEditorRoom.id, editableSelectedEntityKeys, delta.x, delta.y, stepSize);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && key.toLocaleLowerCase("en-US") === "d") {
        event.preventDefault();
        onDuplicateRoomEntities(focusedEditorRoom.id, editableSelectedEntityKeys);
      }
    };

    window.addEventListener("keydown", handleSceneEditShortcut);
    return () => window.removeEventListener("keydown", handleSceneEditShortcut);
  }, [canvasLayerLocks, focusedEditorRoom, focusedSceneEditorRoomID, onDuplicateRoomEntities, onNudgeRoomEntities, presentation?.entities, selectedEntityKeys]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (selectedToolPanelMode === "hud") return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;

      if (activeRoom && selectedEntityKeys.length > 0) {
        const removableEntityKeys = selectedEntityKeys.filter((key) => {
          const entity = activeRoomEntities.find((candidate) => entityKey(candidate) === key);
          if (!entity) return false;
          return !canvasLayerLocks[entity.kind === "actor" ? "actors" : "triggers"];
        });
        if (removableEntityKeys.length === 0) return;
        event.preventDefault();
        onRemoveRoomEntities(activeRoom.id, removableEntityKeys);
        setSelectedEntityKeys(selectedEntityKeys.filter((key) => !removableEntityKeys.includes(key)));
        return;
      }

      if (!selectedSceneMapRoomName) return;
      const selectedRoom = presentation?.rooms.find((room) => room.name === selectedSceneMapRoomName);
      if (!selectedRoom) return;
      event.preventDefault();
      onRemoveRoom(selectedRoom.id, selectedRoom.name);
      setSelectedSceneMapRoomName(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedToolPanelMode, activeRoom?.id, activeRoomEntities, canvasLayerLocks, onRemoveRoom, onRemoveRoomEntities, presentation?.rooms, selectedEntityKeys, selectedSceneMapRoomName]);

  useEffect(() => {
    if (!focusedSceneEditorRoomID) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      if (isEditableKeyboardTarget(event.target)) return;
      if (selectedEntityKeys.length > 0 || selectedConnectionIndex !== null) {
        event.preventDefault();
        setSelectedEntityKeys([]);
        setSelectedConnectionIndex(null);
        return;
      }
      event.preventDefault();
      setFocusedSceneEditorRoomID(null);
      window.requestAnimationFrame(() => fitSceneMapView());
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedSceneEditorRoomID, selectedConnectionIndex, selectedEntityKeys.length]);

  const sceneMapRoomIDsKey = presentation?.rooms.map((room) => room.id).join("|") ?? "";

  useEffect(() => {
    if (!presentation || !focusSceneMapRoomID) return;
    const room = presentation.rooms.find((candidate) => candidate.id === focusSceneMapRoomID);
    if (!room) return;

    setFocusSceneMapRoomID(null);
    setSelectedSceneMapRoomName(room.name);

    const frameID = window.requestAnimationFrame(() => {
      const scroll = canvasScrollRef.current;
      if (!scroll) return;
      const zoom = clampSceneMapZoom(sceneMapZoom ?? presentation.sceneMapZoom);
      const index = presentation.rooms.findIndex((candidate) => candidate.id === room.id);
      const position = presentation.sceneMapPositions[room.name]
        ?? defaultSceneMapPosition(index, presentation.rooms);
      const cardSize = displayedSceneMapCardSize(room, zoom);
      const padding = 48;
      const cardPosition = displayedSceneMapPosition(position, zoom);
      const cardLeft = cardPosition.x;
      const cardTop = cardPosition.y;
      const cardRight = cardLeft + cardSize.width;
      const cardBottom = cardTop + cardSize.height;
      const viewportLeft = scroll.scrollLeft;
      const viewportTop = scroll.scrollTop;
      const viewportRight = viewportLeft + scroll.clientWidth;
      const viewportBottom = viewportTop + scroll.clientHeight;

      if (cardLeft < viewportLeft + padding) {
        scroll.scrollLeft = Math.max(0, cardLeft - padding);
      } else if (cardRight > viewportRight - padding) {
        scroll.scrollLeft = Math.max(0, cardRight - scroll.clientWidth + padding);
      }

      if (cardTop < viewportTop + padding) {
        scroll.scrollTop = Math.max(0, cardTop - padding);
      } else if (cardBottom > viewportBottom - padding) {
        scroll.scrollTop = Math.max(0, cardBottom - scroll.clientHeight + padding);
      }
    });

    return () => window.cancelAnimationFrame(frameID);
  }, [focusSceneMapRoomID, presentation, sceneMapRoomIDsKey]);

  useEffect(() => {
    if (!focusSceneMapRoomID) return;
    const timeoutID = window.setTimeout(() => setFocusSceneMapRoomID(null), 3000);
    return () => window.clearTimeout(timeoutID);
  }, [focusSceneMapRoomID]);

  useEffect(() => {
    if (!focusedSceneEditorRoomID) return;
    if (!presentation?.rooms.some((room) => room.id === focusedSceneEditorRoomID)) {
      setFocusedSceneEditorRoomID(null);
    }
  }, [focusedSceneEditorRoomID, presentation?.rooms]);

  useEffect(() => {
    if (!focusedSceneEditorRoomID) return;
    const host = focusViewportHostRef.current;
    if (!host) return;

    const updateAvailableSize = (): void => {
      const bounds = host.getBoundingClientRect();
      const navigation = host.querySelector(".room-scene-navigation");
      const height = Math.floor(bounds.height - (navigation?.getBoundingClientRect().height ?? 0));
      const width = Math.floor(bounds.width);
      if (height < 1 || width < 1) return;
      setFocusViewportAvailableSize((current) => (
        current.height === height && current.width === width
          ? current
          : { height, width }
      ));
    };

    updateAvailableSize();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateAvailableSize);
    observer?.observe(host);
    const navigation = host.querySelector(".room-scene-navigation");
    if (navigation) observer?.observe(navigation);
    window.addEventListener("resize", updateAvailableSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateAvailableSize);
    };
  }, [focusedSceneEditorRoomID]);

  useEffect(() => {
    if (!focusedSceneEditorRoomID) return;
    const scroll = canvasScrollRef.current;
    if (!scroll) return;
    const updateViewport = () => {
      if (focusViewModeRef.current === "viewport") {
        const scale = focusViewportScaleRef.current;
        const left = Math.round(scroll.scrollLeft / scale), top = Math.round(scroll.scrollTop / scale);
        setFocusCameraOrigin(current => current.left === left && current.top === top ? current : { left, top });
      }
      setFocusMinimapViewport({
        height: scroll.clientHeight,
        left: scroll.scrollLeft,
        top: scroll.scrollTop,
        width: scroll.clientWidth
      });
    };
    updateViewport();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateViewport);
    observer?.observe(scroll);
    scroll.addEventListener("scroll", updateViewport, { passive: true });
    window.addEventListener("resize", updateViewport);
    return () => {
      observer?.disconnect();
      scroll.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, [focusedSceneEditorRoomID]);

  useLayoutEffect(() => {
    const scroll = canvasScrollRef.current;
    if (!scroll || !focusedSceneEditorRoomID || focusViewMode !== "viewport") return;
    scroll.scrollLeft = focusCameraOriginRef.current.left * focusViewportScaleRef.current;
    scroll.scrollTop = focusCameraOriginRef.current.top * focusViewportScaleRef.current;
  }, [focusedSceneEditorRoomID, focusViewMode, focusViewportAvailableSize.height, focusViewportAvailableSize.width]);

  useEffect(() => {
    const focusSceneRoom = focusedSceneEditorRoomID
      ? presentation?.rooms.find((room) => room.id === focusedSceneEditorRoomID) ?? null
      : null;
    if (!focusSceneRoom || focusInitialCameraRoomRef.current === focusSceneRoom.id || focusViewModeRef.current !== "viewport") return;
    const frameID = window.requestAnimationFrame(() => {
      const scroll = canvasScrollRef.current;
      if (!scroll) return;
      focusInitialCameraRoomRef.current = focusSceneRoom.id;
      if (focusSceneRoom.sceneType !== "isometric") {
        const scale = focusViewportScaleRef.current;
        const player = presentation?.entities.find(entity => entity.roomName === focusSceneRoom.name && entity.isPlayer);
        const center = focusSceneRoom.cameraMode === "follow_player" && player
          ? { left: player.x * 8 - 120, top: player.y * 8 - 80 }
          : focusSceneRoom.cameraMode === "fixed_position" || focusSceneRoom.cameraMode === "manual"
            ? { left: focusSceneRoom.cameraBounds.x * 8, top: focusSceneRoom.cameraBounds.y * 8 }
            : { left: (focusSceneRoom.width * 8 - 240) / 2, top: (focusSceneRoom.height * 8 - 160) / 2 };
        scroll.scrollLeft = Math.max(0, center.left * scale);
        scroll.scrollTop = Math.max(0, center.top * scale);
        return;
      }

      const isometricConfig = roomIsometricConfig(focusSceneRoom);
      const playerEntity = presentation?.entities.find((entity) => (
        entity.kind === "actor"
        && entity.roomName === focusSceneRoom.name
        && entity.name === focusSceneRoom.playerActorName
      ));
      const cameraPosition = isometricConfig && playerEntity
        ? deriveIsometricCameraPositionForPlayer({
          config: isometricConfig,
          player: { x: playerEntity.x, y: playerEntity.y, z: playerEntity.z ?? 0 },
          zones: focusSceneRoom.cameraZones ?? []
        })
        : null;
      if (cameraPosition && isometricConfig && focusViewportAvailableSize.width > 0 && focusViewportAvailableSize.height > 0) {
        const geometry = deriveFocusSceneViewportGeometry({
          zoom: 1,
          availableHeight: focusViewportAvailableSize.height,
          availableWidth: focusViewportAvailableSize.width,
          isometricConfig,
          isometricSurfaceSize: roomIsometricSurfaceSize(focusSceneRoom),
          projection: "isometric",
          roomHeightTiles: focusSceneRoom.height,
          roomWidthTiles: focusSceneRoom.width
        });
        const projectionOffset = isometricProjectionCanvasOffset(
          focusSceneRoom.height,
          isometricConfig,
          roomIsometricSurfaceSize(focusSceneRoom)
        );
        const nextScroll = deriveFocusSceneCameraScroll({
          cameraX: cameraPosition.cameraX,
          cameraY: cameraPosition.cameraY,
          maxScrollLeft: scroll.scrollWidth - scroll.clientWidth,
          maxScrollTop: scroll.scrollHeight - scroll.clientHeight,
          projectionOffset,
          scale: geometry.scale
        });
        scroll.scrollLeft = nextScroll.scrollLeft;
        scroll.scrollTop = nextScroll.scrollTop;
        return;
      }

      const actorElements = Array.from(
        scroll.querySelectorAll<HTMLElement>('.room-stage-card-canvas.isometric .room-stage-entity.actor')
      );
      if (actorElements.length === 0) {
        scroll.scrollLeft = Math.max(0, Math.round((scroll.scrollWidth - scroll.clientWidth) / 2));
        scroll.scrollTop = Math.max(0, Math.round((scroll.scrollHeight - scroll.clientHeight) / 2));
        return;
      }
      const actorBounds = actorElements.reduce((bounds, actor) => {
        const rect = actor.getBoundingClientRect();
        return {
          bottom: Math.max(bounds.bottom, rect.bottom),
          left: Math.min(bounds.left, rect.left),
          right: Math.max(bounds.right, rect.right),
          top: Math.min(bounds.top, rect.top)
        };
      }, {
        bottom: Number.NEGATIVE_INFINITY,
        left: Number.POSITIVE_INFINITY,
        right: Number.NEGATIVE_INFINITY,
        top: Number.POSITIVE_INFINITY
      });
      const viewport = scroll.getBoundingClientRect();
      const nextScroll = deriveFocusSceneActorScroll({
        actorBounds,
        currentScrollLeft: scroll.scrollLeft,
        currentScrollTop: scroll.scrollTop,
        maxScrollLeft: scroll.scrollWidth - scroll.clientWidth,
        maxScrollTop: scroll.scrollHeight - scroll.clientHeight,
        viewportHeight: scroll.clientHeight,
        viewportLeft: viewport.left,
        viewportTop: viewport.top,
        viewportWidth: scroll.clientWidth
      });
      scroll.scrollLeft = nextScroll.scrollLeft;
      scroll.scrollTop = nextScroll.scrollTop;
    });
    return () => {
      window.cancelAnimationFrame(frameID);
    };
  }, [
    focusedSceneEditorRoomID,
    focusViewportAvailableSize.height,
    focusViewportAvailableSize.width,
    presentation?.entities,
    presentation?.rooms
  ]);

  if (!presentation) {
    return (
      <WorkspaceEmptyState
        title="Editor"
        description="Abra um projeto para editar cenas, tipos de cena e configurações de câmera."
      />
    );
  }

  const resolvedPresentation = presentation;
  const inspectorRoom = resolvedPresentation.rooms.find((room) => room.name === selectedSceneMapRoomName)
    ?? activeRoom
    ?? null;
  const hudInspectorRoom = focusedEditorRoom ?? inspectorRoom;
  const inspectorHudMenu = inspectorRoom?.runtime?.type === "menu" ? normalizeMenuSceneConfig(inspectorRoom.runtime.config) : undefined;
  const inspectorHudBinding = projectData && inspectorRoom && inspectorHudMenu?.hudMode !== "none"
    && (inspectorRoom.sceneType !== "menu" || inspectorHudMenu?.screenType === "menu")
    ? resolveExplicitHudPresetBinding(projectData, { roomID: inspectorRoom.id, scenePresetId: inspectorHudMenu?.hudPresetId, roomPresetId: inspectorRoom.hudPresetId }) : null;
  const inspectorRoomEntities = inspectorRoom
    ? resolvedPresentation.entities.filter((entity) => entity.roomName === inspectorRoom.name)
    : [];
  const lockedEntityKeys = new Set(
    resolvedPresentation.entities
      .filter((entity) => canvasLayerLocks[entity.kind === "actor" ? "actors" : "triggers"])
      .map((entity) => entityKey(entity))
  );
  const inspectorContext = deriveRoomsInspectorContext(
    selectedToolPanelMode,
    selectedEditMode,
    selectedEntityKeys,
    inspectorRoomEntities,
    inspectorRoom?.name ?? "",
    selectedConnectionIndex,
    resolvedPresentation.connections
  );
  const selectedInspectorEntities = inspectorRoomEntities.filter((entity) => selectedEntityKeys.includes(entityKey(entity)));
  const dialogueScope = dialogueSelectionScope(contextualDialogues, inspectorContext.kind === "entity" ? selectedInspectorEntities : []);
  const dialogueContextKey = `${inspectorRoom?.id}:${inspectorContext.kind === "entity" ? selectedEntityKeys.join(",") : "scene"}`;
  const selectedInspectorEntityKind = selectedInspectorEntities.length > 1
    && selectedInspectorEntities.every((entity) => entity.kind === selectedInspectorEntities[0]?.kind)
    ? selectedInspectorEntities[0]?.kind ?? null
    : null;
  const inspectorHasEntityGroup = selectedInspectorEntityKind !== null;
  const inspectorHasMixedEntityGroup = selectedInspectorEntities.length > 1 && !inspectorHasEntityGroup;
  const inspectorContextKind: RoomInspectorContextKind = inspectorContext.kind === "entity"
    ? inspectorContext.entity.kind
    : inspectorContext.kind;
  const inspectorTabs = roomInspectorTabs(inspectorContextKind);
  const visibleInspectorTabs = selectedToolPanelMode === "hud" ? [{ id: "scene" as const, label: "Cena" }, { id: "hud" as const, label: "HUD" }] : inspectorTabs;
  const activeInspectorTab = selectedToolPanelMode === "hud"
    ? "hud"
    : normalizeRoomInspectorTab(
      inspectorContextKind,
      inspectorTabByContext[inspectorContextKind] ?? null
    );
  const selectedConnection = selectedConnectionIndex !== null
    ? resolvedPresentation.connections.find((connection) => connection.index === selectedConnectionIndex) ?? null
    : null;
  const inspectorSelectedCanvasCell = inspectorRoom && selectedCanvasCell?.roomID === inspectorRoom.id
    ? selectedCanvasCell
    : null;
  const activeSelectedCanvasCell = activeRoom && selectedCanvasCell?.roomID === activeRoom.id
    ? selectedCanvasCell
    : null;
  const inspectorTitle = inspectorContext.kind === "paint"
    ? "Pintura"
    : inspectorContext.kind === "height"
      ? "Altura"
    : inspectorContext.kind === "collision"
      ? "Colisão"
      : inspectorHasMixedEntityGroup
        ? `Grupo misto de ${selectedInspectorEntities.length} entidades`
      : inspectorHasEntityGroup
        ? `Grupo de ${selectedInspectorEntities.length} ${selectedInspectorEntityKind === "actor" ? "atores" : "triggers"}`
      : inspectorContext.kind === "entity"
        ? inspectorContext.entity.name
        : inspectorContext.kind === "connection"
          ? `${sceneDisplayName(inspectorContext.connection.from)} → ${sceneDisplayName(inspectorContext.connection.to)}`
          : sceneDisplayName(inspectorRoom?.name) || "Inspector";
  const inspectorSubtitle = inspectorContext.kind === "paint"
    ? inspectorRoom ? `Cena · ${sceneDisplayName(inspectorRoom.name)}` : ""
    : inspectorContext.kind === "height"
      ? inspectorRoom ? `Isométrico · ${sceneDisplayName(inspectorRoom.name)}` : ""
    : inspectorContext.kind === "collision"
      ? inspectorRoom ? `Cena · ${sceneDisplayName(inspectorRoom.name)}` : ""
      : inspectorHasMixedEntityGroup
        ? `Seleção mista · Cena ${sceneDisplayName(inspectorRoom?.name)}`
      : inspectorHasEntityGroup
        ? `${selectedInspectorEntityKind === "actor" ? "Atores" : "Triggers"} · Cena ${sceneDisplayName(inspectorRoom?.name)}`
      : inspectorContext.kind === "entity"
        ? `${inspectorContext.entity.kind === "actor" ? "Ator" : "Trigger"} · Cena ${sceneDisplayName(inspectorContext.entity.roomName)}`
        : inspectorContext.kind === "connection"
          ? inspectorContext.connection.eventName ?? "Conexão entre cenas"
          : inspectorRoom
            ? `Cena · ${sceneTypeLabel(inspectorRoom.sceneType, roomIsometricConfig(inspectorRoom)?.gameplayMode)} · ${inspectorRoom.sceneType === "isometric" ? `${inspectorRoom.width}×${inspectorRoom.height} células · ${roomIsometricConfig(inspectorRoom)?.tileWidth}×${roomIsometricConfig(inspectorRoom)?.tileHeight} px/célula` : inspectorRoom.gbaResolution}`
            : "";
  const inspectorRoleBadge = !inspectorHasEntityGroup && !inspectorHasMixedEntityGroup && inspectorContext.kind === "entity"
    && inspectorContext.entity.kind === "actor"
    && inspectorRoom?.playerActorName === inspectorContext.entity.name
    ? "Jogador"
    : null;
  const projectBudget = projectData && inspectorRoom
    ? deriveProjectBudgetPresentation(projectData, inspectorRoom.name, budgetReport)
    : null;
  const inspectorSceneRecord = inspectorRoom
    ? (Array.isArray(projectData?.scenas)
      ? projectData.scenas.find((scene) => {
          if (!scene || typeof scene !== "object" || Array.isArray(scene)) return false;
          const source = scene as Record<string, unknown>;
          return source.id === inspectorRoom.id || source.name === inspectorRoom.name;
        }) as Record<string, unknown> | undefined
      : undefined) ?? { id: inspectorRoom.id, name: inspectorRoom.name }
    : null;
  const sceneEventInspector = inspectorContext.kind === "room" && inspectorRoom && inspectorSceneRecord ? (
    <RoomEventBindingsInspector
      commandSuggestions={commandSuggestions}
      contextKind="room"
      entity={inspectorSceneRecord}
      eventOptions={eventReferenceOptions}
      focusedEventName={focusedEventName}
      focusedEventRequestID={focusedEventRequestID}
      onChangeBinding={(bindingKey, eventName) => {
        if (bindingKey.startsWith("runtime:/")) {
          const next = updateRuntimeEventState(inspectorSceneRecord, bindingKey, "eventName", eventName);
          if (next !== inspectorSceneRecord) onUpdateRoomFields(inspectorRoom.id, { runtime: next.runtime as UpdateRoomFields["runtime"] });
          return;
        }
        const currentBindings = inspectorSceneRecord.eventBindings
          && typeof inspectorSceneRecord.eventBindings === "object"
          && !Array.isArray(inspectorSceneRecord.eventBindings)
          ? inspectorSceneRecord.eventBindings as Record<string, string | undefined>
          : {};
        onUpdateRoomFields(inspectorRoom.id, { eventBindings: { ...currentBindings, [bindingKey]: eventName } });
      }}
      onUpdateRuntimeState={(bindingKey, field, value) => {
        const next = updateRuntimeEventState(inspectorSceneRecord, bindingKey, field, value);
        if (next !== inspectorSceneRecord) onUpdateRoomFields(inspectorRoom.id, { runtime: next.runtime as UpdateRoomFields["runtime"] });
      }}
      onCreateBehavior={(eventOptions) => onCreateBoundEventsForTargets?.({
        initialCommands: eventOptions.initialCommands,
        targets: [{
          bindingKey: eventOptions.bindingKey,
          targetKind: eventOptions.targetKind,
          targetName: eventOptions.targetName
        }]
      })?.[0]}
      onCreateEvent={() => onCreateEventReference?.()}
      onOpenEvent={(eventName) => onOpenEvent?.(eventName)}
      onUpdateEventFrequency={onSetEventUpdateFrequency}
      renderEventInspector={renderEventInspector}
      sceneType={inspectorRoom.sceneType}
    />
  ) : null;

  function removeSelectedConnection(connectionIndex: number): void {
    onRemoveRoomConnection(connectionIndex);
    if (selectedConnectionIndex === connectionIndex) {
      setSelectedConnectionIndex(null);
    } else if (selectedConnectionIndex !== null && selectedConnectionIndex > connectionIndex) {
      setSelectedConnectionIndex(selectedConnectionIndex - 1);
    }
  }

  function setCollisionBorderForActiveRoom(): void {
    if (!activeRoom) return;
    const borderIndexes = new Set<number>();
    const collisionTypes: RoomCollisionType[] = Array.from({ length: activeRoom.width * activeRoom.height }, (_value, index) => {
      const x = index % activeRoom.width;
      const y = Math.floor(index / activeRoom.width);
      if (x === 0 || y === 0 || x === activeRoom.width - 1 || y === activeRoom.height - 1) {
        sceneTilemapCellIndexesForCell(
          activeRoom.width,
          activeRoom.height,
          index,
          activeRoom.tilemapContract
        ).forEach((borderIndex) => borderIndexes.add(borderIndex));
      }
      return "free" as const;
    });
    borderIndexes.forEach((index) => {
      collisionTypes[index] = "solid";
    });
    onUpdateRoomFields(activeRoom.id, { collisionTypes });
  }

  function applyCollisionRectangleForRoom(
    roomID: string,
    startCellIndex: number,
    endCellIndex: number,
    collisionType: RoomCollisionType,
    historyGroupID?: string
  ): void {
    const room = resolvedPresentation.rooms.find((candidate) => candidate.id === roomID);
    if (!room) return;
    const allowedCollisionTypes = sceneTypeProfile(room.sceneType).collisionTypes;
    const safeCollisionType = allowedCollisionTypes.includes(collisionType)
      ? collisionType
      : allowedCollisionTypes.includes("solid")
        ? "solid"
        : "free";
    const collisionTypes = Array.from({ length: room.width * room.height }, (_value, index) => (
      room.collisionTypes?.[index] ?? "free"
    ));
    sceneTilemapCellIndexesForRectangle(
      room.width,
      room.height,
      startCellIndex,
      endCellIndex,
      room.tilemapContract
    ).forEach((index) => {
      collisionTypes[index] = safeCollisionType;
    });
    invokeHistoryAware(onUpdateRoomFields, [room.id, { collisionTypes }], historyGroupID);
  }

  function clearCollisionForActiveRoom(): void {
    if (!activeRoom) return;
    const collisionTypes = activeRoom.collisionTypes
      ?? activeRoom.collisionCells.map((blocked) => (blocked ? "solid" : "free"));
    collisionTypes.forEach((collisionType, index) => {
      if (collisionType !== "free") {
        onSetCollisionType(activeRoom.id, index, "free");
      }
    });
  }
  function createTriggerAtSelectedCell(width = 1, height = 1): void {
    if (!activeRoom || activeSelectedCanvasCell?.roomID !== activeRoom.id) return;
    const cellIndex = activeSelectedCanvasCell.cellIndex;
    const createdTriggerID = onCreateTrigger({
      height,
      roomID: activeRoom.id,
      width,
      x: cellIndex % activeRoom.width,
      y: Math.floor(cellIndex / activeRoom.width)
    });
    if (createdTriggerID) {
      selectRoomEntityKeys([`trigger:${createdTriggerID}`]);
    }
  }

  const actorEntities = presentation.entities.filter((entity) => entity.kind === "actor");
  const triggerEntities = presentation.entities.filter((entity) => entity.kind === "trigger");
  const actorPrefabs = projectActorPrefabs(projectData);
  const triggerPrefabs = projectTriggerPrefabs(projectData);
  const actorPrefabCount = actorPrefabs.length;
  const triggerPrefabCount = triggerPrefabs.length;
  const prefabCount = actorPrefabCount + triggerPrefabCount;
  const selectedPrefabSource = presentation.entities.find((entity) => selectedEntityKeys.includes(entityKey(entity))) ?? null;
  const prefabPlacement: ProjectPrefabPlacement | null = activeRoom ? {
    roomID: activeRoom.id,
    x: activeSelectedCanvasCell?.roomID === activeRoom.id ? activeSelectedCanvasCell.cellIndex % activeRoom.width : 1,
    y: activeSelectedCanvasCell?.roomID === activeRoom.id ? Math.floor(activeSelectedCanvasCell.cellIndex / activeRoom.width) : 1
  } : null;
  const projectTreeName = projectDisplayName(projectPath);
  const sceneOrganization = deriveEditorSceneOrganization(
    presentation.rooms,
    projectData?.editorState
  );
  const sceneByID = new Map(presentation.rooms.map((room) => [room.id, room]));
  const normalizedSceneSearchQuery = sceneSearchQuery.trim().toLocaleLowerCase("pt-BR");
  const sceneMatchesSearch = (room: RoomsWorkspaceRoom): boolean => {
    if (!normalizedSceneSearchQuery) return true;
    return [room.name, room.displayName ?? "", room.sceneType]
      .some((value) => value.toLocaleLowerCase("pt-BR").includes(normalizedSceneSearchQuery));
  };
  const orderedVisibleSceneIDs = sceneOrganization.order.filter((sceneID) => {
    const room = sceneByID.get(sceneID);
    return room ? sceneMatchesSearch(room) : false;
  });
  const sceneGroupSceneIDs = (group: EditorSceneGroup): string[] => (
    orderedVisibleSceneIDs.filter((sceneID) => group.sceneIDs.includes(sceneID))
  );
  const ungroupedSceneIDs = orderedVisibleSceneIDs.filter((sceneID) => (
    !sceneOrganization.groups.some((group) => group.sceneIDs.includes(sceneID))
  ));
  const canvasZoom = currentCanvasZoom;
  const focusSceneRoom = focusedEditorRoom;
  const warpTargetRoomName = selectedConnectionTarget
    || (focusSceneRoom
      ? resolvedPresentation.rooms.find((room) => room.name !== focusSceneRoom.name)?.name ?? ""
      : "");
  const focusSceneMenuConfig = focusSceneRoom?.sceneType === "menu" && focusSceneRoom.runtime?.type === "menu"
    ? normalizeMenuSceneConfig(focusSceneRoom.runtime.config)
    : undefined;
  const sceneMenuScreens = focusSceneMenuConfig?.screens ?? [];
  const selectedSceneMenuScreen = sceneMenuScreens.find((screen) => screen.id === sceneMenuScreenID) ?? sceneMenuScreens[0];
  const focusSceneLutaHudAssetName = roomRuntimeHudAsset(focusSceneRoom);
  const focusSceneLutaHudAssetURL = projectData && projectPath && typeof focusSceneLutaHudAssetName === "string"
    ? resolveProjectAssetURL(projectData, projectPath, focusSceneLutaHudAssetName)
    : null;
  const focusSceneHudBinding = !focusSceneLutaHudAssetName && projectData && focusSceneRoom && focusSceneMenuConfig?.hudMode !== "none" && (
    focusSceneRoom.sceneType !== "menu" || focusSceneMenuConfig?.screenType === "menu"
  ) ? resolveExplicitHudPresetBinding(projectData, {
    roomID: focusSceneRoom.id,
    scenePresetId: focusSceneMenuConfig?.screenType === "menu" ? focusSceneMenuConfig.hudPresetId : undefined,
    roomPresetId: focusSceneRoom.hudPresetId
  }) : null;
  const hudPresentation = projectData ? deriveHudPresetsWorkspacePresentation(projectData) : null;
  const hudSelectedScreen = hudMenuScreenID ? focusSceneMenuConfig?.screens?.find(screen => screen.id === hudMenuScreenID) : undefined;
  const hudSelectedMenu = hudSelectedScreen ? { ...hudSelectedScreen,
    hudMode: hudSelectedScreen.hudMode ?? (hudSelectedScreen.hudPresetId ? undefined : focusSceneMenuConfig?.hudMode),
    hudPresetId: hudSelectedScreen.hudPresetId ?? focusSceneMenuConfig?.hudPresetId
  } : focusSceneMenuConfig;
  const hudUnavailableReason = focusSceneLutaHudAssetName ? `Esta cena usa uma HUD ${focusSceneRoom?.sceneType === "isometric" ? "tática" : "de luta"} por imagem. A prévia aparece sobre a cena; a imagem e os recursos são configurados na aba Cena.`
    : focusSceneRoom?.sceneType === "menu" && hudSelectedMenu?.screenType !== "menu" ? "Telas de logo e título usam atores e fundo. Escolha uma tela de menu para editar sua HUD." : undefined;
  const hudAppliedBinding = projectData && focusSceneRoom && !hudUnavailableReason && hudSelectedMenu?.hudMode !== "none"
    ? resolveExplicitHudPresetBinding(projectData, { roomID: focusSceneRoom.id, scenePresetId: hudSelectedMenu?.hudPresetId, roomPresetId: focusSceneRoom.hudPresetId }) : null;
  const hudLibraryPreset = hudPresentation?.presets.find(preset => preset.id === hudLibraryPresetID) ?? null;
  const focusSceneHudAuthoringBinding: HudPresetBinding | null = hudLibraryPreset
    ? { preset: hudLibraryPreset, presetId: hudLibraryPreset.id, requestedPresetId: hudLibraryPreset.id, source: "room", status: "resolved" }
    : hudAppliedBinding;
  const hudEditingPreset = focusSceneHudAuthoringBinding?.preset;
  const canEditHudCanvas = Boolean(hudEditingPreset && !hudEditingPreset.builtIn && onUpdateHudPreset && !canvasLayerLocks.hud
    && (editingSharedHudID === hudEditingPreset.id || (hudEditingPreset.id !== hudPresentation?.activePresetId && projectData && hudPresetUsages(projectData, hudEditingPreset.id).every(use => use.id === focusSceneRoom?.id))));
  const focusSceneUsesPseudo3dCamera = Boolean(focusSceneRoom && isPseudo3dRacingRoom(focusSceneRoom) && focusViewMode === "viewport");
  const focusSceneIsometricConfig = focusSceneRoom ? roomIsometricConfig(focusSceneRoom) : undefined;
  const focusViewportGeometry = focusSceneRoom
    ? deriveFocusSceneViewportGeometry({
        zoom: canvasZoom,
        viewMode: focusSceneUsesPseudo3dCamera ? "viewport" : focusViewMode,
        atlasTileHeight: focusSceneRoom.backgroundAtlasTileHeight,
        availableHeight: focusViewportAvailableSize.height,
        availableWidth: focusViewportAvailableSize.width,
        isometricConfig: focusSceneIsometricConfig,
        isometricSurfaceSize: roomIsometricSurfaceSize(focusSceneRoom),
        projection: focusSceneRoom.sceneType === "isometric" ? "isometric" : "orthogonal",
        roomHeightTiles: focusSceneRoom.height,
        roomWidthTiles: focusSceneRoom.width
      })
    : null;
  if (focusViewportGeometry) focusViewportScaleRef.current = focusViewportGeometry.scale;
  const focusMinimapAvailable = Boolean(focusSceneRoom && !focusSceneUsesPseudo3dCamera && (
    focusSceneWorldLogicalSize(focusSceneRoom).width > 240 || focusSceneWorldLogicalSize(focusSceneRoom).height > 160
  ));
  const focusSceneWorldWidth = focusSceneRoom?.sceneType === "isometric" && focusViewportGeometry
    ? focusViewportGeometry.worldWidth
    : focusSceneRoom
      ? focusSceneRoom.width * GBA_VIEWPORT_PIXELS.width / GBA_VIEWPORT_TILES.width * (focusViewportGeometry?.scale ?? 1)
      : 0;
  const focusSceneWorldHeight = focusSceneRoom?.sceneType === "isometric" && focusViewportGeometry
    ? focusViewportGeometry.worldHeight
    : focusSceneRoom
      ? focusSceneRoom.height * GBA_VIEWPORT_PIXELS.height / GBA_VIEWPORT_TILES.height * (focusViewportGeometry?.scale ?? 1)
      : 0;
  const focusedSceneEditorCardSize: RoomStageCardSize | null = focusSceneRoom && focusViewportGeometry ? {
    canvasDisplayHeight: focusSceneUsesPseudo3dCamera ? GBA_VIEWPORT_PIXELS.height * focusViewportGeometry.scale : focusSceneWorldHeight,
    canvasHeight: focusSceneUsesPseudo3dCamera ? GBA_VIEWPORT_PIXELS.height * focusViewportGeometry.scale : focusSceneWorldHeight,
    height: focusSceneUsesPseudo3dCamera ? GBA_VIEWPORT_PIXELS.height * focusViewportGeometry.scale : focusSceneWorldHeight,
    width: focusSceneUsesPseudo3dCamera ? GBA_VIEWPORT_PIXELS.width * focusViewportGeometry.scale : focusSceneWorldWidth
  } : null;
  const sceneMapRooms = focusSceneRoom ? [focusSceneRoom] : presentation.rooms;
  const visibleSceneMapCards = sceneMapRooms.map((room) => {
    const projectRoomIndex = presentation.rooms.findIndex((candidate) => candidate.id === room.id);
    const storedPosition = focusSceneRoom
      ? { x: 72, y: 72 }
      : presentation.sceneMapPositions[room.name] ?? defaultSceneMapPosition(projectRoomIndex, presentation.rooms);
    const connectorPosition = sceneMapDragPreview?.roomName === room.name
      ? sceneMapDragPreview.position
      : storedPosition;
    const contentSize = sceneMapContentSize(room);
    const displayedCard = displayedSceneMapCardSize(room, canvasZoom);
    const displayedContent = displayedSceneMapContentSize(room, canvasZoom);
    const cardSize: RoomStageCardSize = {
      canvasDisplayHeight: displayedContent.height,
      canvasHeight: contentSize.height,
      height: displayedCard.height,
      width: displayedCard.width
    };
    return {
      cardSize,
      connectorPosition,
      position: storedPosition,
      room,
      z: room.name === selectedSceneMapRoomName ? 3 : room.isActive ? 2 : 1
    };
  });
  const canvasWorldWidth = focusViewportGeometry
    ? focusSceneUsesPseudo3dCamera ? focusViewportGeometry.viewportWidth : focusViewportGeometry.worldWidth
    : Math.max(
      ROOM_CANVAS_WORLD_MIN_WIDTH,
      ...visibleSceneMapCards.map((item) => {
        const position = displayedSceneMapPosition(item.connectorPosition, canvasZoom);
        return position.x + item.cardSize.width + 160;
      })
    );
  const canvasWorldHeight = focusViewportGeometry
    ? focusSceneUsesPseudo3dCamera ? focusViewportGeometry.viewportHeight : focusViewportGeometry.worldHeight
    : Math.max(
      ROOM_CANVAS_WORLD_MIN_HEIGHT,
      ...visibleSceneMapCards.map((item) => {
        const position = displayedSceneMapPosition(item.connectorPosition, canvasZoom);
        return position.y + item.cardSize.height + 160;
      })
    );
  const canvasZoomIndex = ROOM_CANVAS_ZOOM_LEVELS.reduce((bestIndex, zoom, index) => (
    Math.abs(zoom - canvasZoom) < Math.abs(ROOM_CANVAS_ZOOM_LEVELS[bestIndex] - canvasZoom) ? index : bestIndex
  ), 0);
  const canvasZoomPercent = Math.round(canvasZoom * 100);
  const canvasVisualMetrics = sceneMapVisualMetrics(canvasZoom);

  function applySceneMapZoom(nextZoom: number, pointer?: { x: number; y: number }): void {
    if (focusSceneRoom && focusViewMode === "viewport") return;
    const scroll = canvasScrollRef.current;
    if (!scroll) {
      if (focusSceneRoom) setFocusSceneZoom(nextZoom);
      else onUpdateSceneMapZoom(nextZoom);
      return;
    }

    const anchor = pointer ?? canvasPointerRef.current ?? { x: scroll.clientWidth / 2, y: scroll.clientHeight / 2 };
    const current = pendingCanvasZoomRef.current ?? { zoom: canvasZoom, scrollLeft: scroll.scrollLeft, scrollTop: scroll.scrollTop };
    const worldX = (current.scrollLeft + anchor.x) / current.zoom;
    const worldY = (current.scrollTop + anchor.y) / current.zoom;
    if (nextZoom === current.zoom) return;
    pendingCanvasZoomRef.current = {
      zoom: nextZoom, focusID: focusedSceneEditorRoomID,
      scrollLeft: Math.round(worldX * nextZoom - anchor.x),
      scrollTop: Math.round(worldY * nextZoom - anchor.y)
    };
    if (focusSceneRoom) setFocusSceneZoom(nextZoom);
    else onUpdateSceneMapZoom(nextZoom);
  }

  function setCanvasZoomByStep(delta: number): void {
    const currentIndex = canvasZoomIndex;
    const nextIndex = Math.min(ROOM_CANVAS_ZOOM_LEVELS.length - 1, Math.max(0, currentIndex + delta));
    applySceneMapZoom(ROOM_CANVAS_ZOOM_LEVELS[nextIndex]);
  }

  function fitSceneMapView(): void {
    const scroll = canvasScrollRef.current;
    if (!scroll || visibleSceneMapCards.length === 0) return;

    if (focusSceneRoom && focusViewportGeometry) {
      if (focusViewMode === "viewport") return;
      setFocusSceneZoom(focusSceneZoom * Math.min(
        focusViewportGeometry.viewportWidth / focusViewportGeometry.worldWidth,
        focusViewportGeometry.viewportHeight / focusViewportGeometry.worldHeight
      ));
      scroll.scrollLeft = 0;
      scroll.scrollTop = 0;
      return;
    }

    const nextViewport = fitSceneMapViewToCards({
      cards: visibleSceneMapCards.map((item) => ({
        position: item.connectorPosition,
        size: sceneMapCardSize(item.room)
      })),
      maxZoom: SCENE_MAP_MAX_ZOOM,
      minZoom: SCENE_MAP_MIN_ZOOM,
      padding: 48,
      viewportHeight: scroll.clientHeight,
      viewportWidth: scroll.clientWidth
    });
    if (focusSceneRoom) setFocusSceneZoom(nextViewport.zoom);
    else onUpdateSceneMapZoom(nextViewport.zoom);
    window.requestAnimationFrame(() => {
      scroll.scrollLeft = nextViewport.scrollLeft;
      scroll.scrollTop = nextViewport.scrollTop;
    });
  }

  function enterSceneFocus(room: RoomsWorkspaceRoom): void {
    setFocusViewMode("viewport");
    setFocusCameraOrigin({ left: 0, top: 0 });
    focusCameraOriginRef.current = { left: 0, top: 0 };
    focusInitialCameraRoomRef.current = null;
    setFocusedSceneEditorRoomID(room.id);
    setSelectedSceneMapRoomName(room.name);
    setSelectedEntityKeys([]);
    setSelectedConnectionIndex(null);
    setFocusMinimapVisible(true);
    if (!room.isActive) onSetActiveRoom(room.id, room.name);
  }

  function openFocusedSceneInspector(): void {
    if (!focusedEditorRoom) return;
    setSelectedEntityKeys([]);
    setSelectedCanvasCell(null);
    setSelectedConnectionIndex(null);
    setSelectedCameraZoneID(null);
    setSelectedEditMode("select");
    setSelectedToolPanelMode("select");
    setInspectorTabByContext((current) => ({ ...current, room: "scene" }));
  }

  function exitSceneFocus(): void {
    setFocusedSceneEditorRoomID(null);
    window.requestAnimationFrame(() => fitSceneMapView());
  }

  function navigateFocusMinimap(x: number, y: number): void {
    const scroll = canvasScrollRef.current;
    if (!scroll) return;
    const maxLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
    const maxTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    scroll.scrollLeft = Math.round(Math.max(0, Math.min(maxLeft, x * scroll.scrollWidth - scroll.clientWidth / 2)));
    scroll.scrollTop = Math.round(Math.max(0, Math.min(maxTop, y * scroll.scrollHeight - scroll.clientHeight / 2)));
  }

  function rememberCanvasPointer(event: React.PointerEvent<HTMLDivElement>): void {
    const scroll = canvasScrollRef.current;
    if (!scroll) return;
    const bounds = scroll.getBoundingClientRect();
    canvasPointerRef.current = {
      x: Math.max(0, Math.min(scroll.clientWidth, event.clientX - bounds.left - scroll.clientLeft)),
      y: Math.max(0, Math.min(scroll.clientHeight, event.clientY - bounds.top - scroll.clientTop))
    };
  }

  function zoomRoomsCanvas(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    const scroll = canvasScrollRef.current;
    if (!scroll) return;
    event.preventDefault();
    if (focusSceneRoom && focusViewMode === "viewport") return;
    const bounds = scroll.getBoundingClientRect();
    const nextViewport = wheelZoomCanvasViewport({
      current: pendingCanvasZoomRef.current ?? {
        scrollLeft: scroll.scrollLeft,
        scrollTop: scroll.scrollTop,
        zoom: canvasZoom
      },
      deltaY: event.deltaY,
      maxZoom: SCENE_MAP_MAX_ZOOM,
      minZoom: SCENE_MAP_MIN_ZOOM,
      pointer: {
        x: event.clientX - bounds.left - scroll.clientLeft,
        y: event.clientY - bounds.top - scroll.clientTop
      }
    });
    canvasPointerRef.current = { x: event.clientX - bounds.left - scroll.clientLeft, y: event.clientY - bounds.top - scroll.clientTop };
    applySceneMapZoom(nextViewport.zoom, canvasPointerRef.current);
  }

  function canStartCanvasPan(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return !target.closest(".room-stage-card-frame, button, input, select, textarea, [contenteditable='true']");
  }

  function startRoomsCanvasPan(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || !canStartCanvasPan(event.target)) return;
    const scroll = canvasScrollRef.current;
    if (!scroll) return;
    canvasPanDrag.current = {
      pointerID: event.pointerId,
      startScrollLeft: scroll.scrollLeft,
      startScrollTop: scroll.scrollTop,
      startX: event.clientX,
      startY: event.clientY
    };
    setIsCanvasPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continueRoomsCanvasPan(event: React.PointerEvent<HTMLDivElement>): void {
    const pan = canvasPanDrag.current;
    const scroll = canvasScrollRef.current;
    if (!pan || pan.pointerID !== event.pointerId || !scroll) return;
    scroll.scrollLeft = pan.startScrollLeft - (event.clientX - pan.startX);
    scroll.scrollTop = pan.startScrollTop - (event.clientY - pan.startY);
  }

  function endRoomsCanvasPan(event: React.PointerEvent<HTMLDivElement>): void {
    const pan = canvasPanDrag.current;
    if (!pan || pan.pointerID !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    canvasPanDrag.current = null;
    setIsCanvasPanning(false);
  }

  function setEditorToolPanelMode(mode: RoomEditorToolPanelMode): void {
    if (mode === "room") {
      setSelectedToolPanelMode("select");
      setSelectedEditMode("select");
      setSelectedEntityKeys([]);
      setSelectedConnectionIndex(null);
      setInspectorTabByContext((current) => ({ ...current, room: "scene" }));
      return;
    }

    const room = focusedEditorRoom ?? activeRoom;
    if (room && roomToolUnavailableReason(mode, room, sceneTypeProfile(room.sceneType).editorTools)) return;

    setSelectedToolPanelMode(mode);
    setSelectedEditMode(editModeForToolPanel(mode));
    if (mode === "select") {
      setSelectedEntityTool("move");
      return;
    }
    if (mode === "actor") {
      setSelectedEntityTool("move");
      setSelectedEntityKeys([]);
      return;
    }
    if (mode === "camera") {
      setSelectedEntityKeys([]);
      setSelectedConnectionIndex(null);
      setSelectedCameraZoneID(activeRoom?.cameraZones?.[0]?.id ?? null);
      setInspectorTabByContext((current) => ({ ...current, room: "camera" }));
      return;
    }
    if (mode === "warp") {
      setSelectedEntityKeys([]);
      setInspectorTabByContext((current) => ({ ...current, room: "connections" }));
      return;
    }
    if (mode === "hud") {
      setSelectedEntityKeys([]);
      setSelectedConnectionIndex(null);
      setSelectedHudComponentID(null);
      setInspectorTabByContext((current) => ({ ...current, room: "hud" }));
      return;
    }
    if (mode === "trigger") {
      setSelectedEntityTool("resize");
      setSelectedEntityKeys([]);
      return;
    }

    setSelectedEntityKeys([]);
  }

  function setCanvasLayerVisibility(layer: RoomCanvasLayerID, visible: boolean): void {
    setCanvasLayerVisibilityState((current) => ({ ...current, [layer]: visible }));
  }

  function setCanvasLayerLock(layer: RoomCanvasLayerID, locked: boolean): void {
    setCanvasLayerLocks((current) => ({ ...current, [layer]: locked }));
  }

  function setCanvasEditMode(mode: RoomCanvasEditMode): void {
    const room = focusedEditorRoom ?? activeRoom;
    if (mode === "tiles" && room && roomToolUnavailableReason("paint", room, sceneTypeProfile(room.sceneType).editorTools)) return;
    setSelectedEditMode(mode);
    if (mode === "select") {
      setSelectedToolPanelMode("select");
    } else if (mode === "tiles") {
      setSelectedToolPanelMode("paint");
    } else if (mode === "collision") {
      setSelectedToolPanelMode("collision");
    } else if (mode === "height") {
      setSelectedToolPanelMode("height");
    } else {
      const selectedKey = selectedEntityKeys.at(-1) ?? null;
      const selectedEntity = activeRoomEntities.find((entity) => entityKey(entity) === selectedKey) ?? activeRoomEntities[0] ?? null;
      setSelectedToolPanelMode(selectedEntity?.kind === "trigger" ? "trigger" : "actor");
      setSelectedEntityTool("move");
      if (selectedEntity) {
        setSelectedEntityKeys([entityKey(selectedEntity)]);
      }
    }
  }

  function selectConnection(connectionIndex: number | null): void {
    setSelectedConnectionIndex(connectionIndex);
    setSelectedEntityKeys([]);
    if (connectionIndex === null) return;

    setSelectedToolPanelMode((current) => current === "warp" ? "warp" : "select");
    setSelectedEditMode("select");

    const connection = resolvedPresentation.connections.find((item) => item.index === connectionIndex);
    const room = resolvedPresentation.rooms.find((item) => item.name === selectedSceneMapRoomName) ?? activeRoom;
    if (!connection || !room) return;
    setSelectedConnectionZoneSide(room.name === connection.to ? "entry" : "exit");
  }

  function selectConnectionZone(connectionIndex: number, side: "exit" | "entry", roomName: string): void {
    setSelectedConnectionIndex(connectionIndex);
    setSelectedConnectionZoneSide(side);
    setSelectedEntityKeys([]);
    setSelectedToolPanelMode((current) => current === "warp" ? "warp" : "select");
    setSelectedEditMode("select");
    setSelectedSceneMapRoomName(roomName);
    const room = resolvedPresentation.rooms.find((item) => item.name === roomName);
    if (room && !room.isActive) {
      onSetActiveRoom(room.id, room.name);
    }
  }

  function createConnectionFromRoom(fromName: string, toName: string, eventName: string): void {
    const nextIndex = resolvedPresentation.connections.length;
    const createdIndex = onCreateRoomConnection(fromName, toName, eventName);
    const selectedIndex = typeof createdIndex === "number" && Number.isInteger(createdIndex)
      ? createdIndex
      : createdIndex === null
        ? null
        : nextIndex;
    if (selectedIndex !== null) selectConnectionZone(selectedIndex, "exit", fromName);
  }

  function selectRoomEntityKeys(keys: string[]): void {
    setSelectedEntityKeys(keys);
    if (keys.length > 0) {
      setSelectedConnectionIndex(null);
    }
    const selectedKey = keys.at(-1) ?? null;
    const entity = selectedKey
      ? resolvedPresentation.entities.find((item) => entityKey(item) === selectedKey) ?? null
      : null;
    if (entity) {
      setSelectedEditMode("entities");
      setSelectedToolPanelMode(entity.kind);
      setSelectedEntityTool("move");
      const room = resolvedPresentation.rooms.find((item) => item.name === entity.roomName);
      if (room && !room.isActive) {
        onSetActiveRoom(room.id, room.name);
      }
    }
  }

  function selectSceneContextFromCanvas(roomID: string): void {
    const room = resolvedPresentation.rooms.find((candidate) => candidate.id === roomID) ?? null;
    if (room) {
      setSelectedSceneMapRoomName(room.name);
      if (!room.isActive) onSetActiveRoom(room.id, room.name);
    }
    setSelectedEntityKeys([]);
    setSelectedConnectionIndex(null);
    setSelectedCanvasCell(null);
    setSelectedToolPanelMode("select");
    setSelectedEntityTool("move");
    setSelectedEditMode("select");
    setInspectorTabByContext((current) => ({ ...current, room: "scene" }));
  }

  function selectCanvasCell(roomID: string, cellIndex: number): void {
    setSelectedCanvasCell({ roomID, cellIndex });
  }

  function toggleRailSection(section: keyof EditorRailExpandState): void {
    setRailExpanded((current) => toggleEditorRailSection(current, section));
  }

  function focusRoomInExplorer(room: RoomsWorkspaceRoom): void {
    if (focusedSceneEditorRoomID) setFocusedSceneEditorRoomID(room.id);
    onSetActiveRoom(room.id, room.name);
    setSelectedSceneMapRoomName(room.name);
    setSelectedEntityKeys([]);
    setSelectedConnectionIndex(null);
  }

  function focusEntityInExplorer(entity: RoomsWorkspaceEntity): void {
    const room = resolvedPresentation.rooms.find((item) => item.name === entity.roomName);
    if (room) {
      if (focusedSceneEditorRoomID) setFocusedSceneEditorRoomID(room.id);
      onSetActiveRoom(room.id, room.name);
      setSelectedSceneMapRoomName(room.name);
    }
    setEditorToolPanelMode(entity.kind);
    selectRoomEntityKeys([entityKey(entity)]);
  }

  function openCreateRoomPrompt(anchorRoomID?: string, presetID?: RoomPresetID): void {
    const roomNames = presentation?.rooms.map((room) => room.name) ?? [];
    setRoomNamePrompt({
      anchorRoomID,
      presetID,
      defaultName: uniqueDefaultRoomName(roomNames),
      title: anchorRoomID ? "Adicionar cena à direita" : "Nova cena",
      confirmLabel: "Criar cena"
    });
  }

  function openRenameRoomPrompt(room: RoomsWorkspaceRoom): void {
    setExplorerContextMenu(null);
    setRoomNamePrompt({
      renameRoomID: room.id,
      defaultName: room.name,
      title: `Renomear ${room.name}`,
      confirmLabel: "Salvar"
    });
  }

  function openCreateSceneGroupPrompt(): void {
    const selectedIDs = Array.from(selectedSceneIDs).filter((sceneID) => sceneByID.has(sceneID));
    setRoomNamePrompt({
      sceneGroupAction: "create",
      sceneGroupSceneIDs: selectedIDs,
      defaultName: "Novo grupo",
      fieldLabel: "Nome do grupo",
      title: selectedIDs.length > 0 ? `Agrupar ${selectedIDs.length} cenas` : "Novo grupo de cenas",
      confirmLabel: selectedIDs.length > 0 ? "Agrupar cenas" : "Criar grupo"
    });
  }

  function openRenameSceneGroupPrompt(group: EditorSceneGroup): void {
    setRoomNamePrompt({
      sceneGroupAction: "rename",
      sceneGroupID: group.id,
      defaultName: group.name,
      fieldLabel: "Nome do grupo",
      title: `Renomear grupo ${group.name}`,
      confirmLabel: "Salvar"
    });
  }

  async function confirmRoomNamePrompt(name: string): Promise<void> {
    const promptState = roomNamePrompt;
    setRoomNamePrompt(null);
    if (!name || !promptState) return;

    if (promptState.renameRoomID) {
      onRenameRoom(promptState.renameRoomID, name);
      return;
    }

    if (promptState.sceneGroupAction === "create") {
      const groupID = `scene-group-${Date.now()}`;
      const createdOrganization = createEditorSceneGroup(sceneOrganization, groupID, name);
      const nextOrganization = (promptState.sceneGroupSceneIDs ?? []).reduce(
        (organization, sceneID) => moveEditorSceneToGroup(organization, sceneID, groupID),
        createdOrganization
      );
      onUpdateSceneOrganization(nextOrganization);
      setSelectedSceneIDs(new Set());
      setLastSelectedSceneID(null);
      setExpandedSceneGroupIDs((current) => new Set(current).add(groupID));
      return;
    }

    if (promptState.sceneGroupAction === "rename" && promptState.sceneGroupID) {
      onUpdateSceneOrganization(renameEditorSceneGroup(sceneOrganization, promptState.sceneGroupID, name));
      return;
    }

    const anchorRoomID = promptState.anchorRoomID;
    const newRoomID = await onCreateRoom(anchorRoomID, name, promptState.presetID);
    if (typeof newRoomID === "string" && newRoomID.trim()) {
      onSetActiveRoom(newRoomID, name);
      setFocusSceneMapRoomID(newRoomID);
    }
  }

  function openRoomContextMenu(event: React.MouseEvent<HTMLElement>, room: RoomsWorkspaceRoom): void {
    event.preventDefault();
    event.stopPropagation();
    focusRoomInExplorer(room);
    setExplorerContextMenu({
      room,
      x: event.clientX,
      y: event.clientY
    });
  }

  async function duplicateRoomFromExplorer(room: RoomsWorkspaceRoom): Promise<void> {
    setExplorerContextMenu(null);
    const newRoomID = await onDuplicateRoom?.(room.id, room.name);
    if (typeof newRoomID === "string" && newRoomID.trim()) {
      setFocusSceneMapRoomID(newRoomID);
      setSelectedSceneMapRoomName(room.name);
    }
  }

  function deleteRoomFromExplorer(room: RoomsWorkspaceRoom): void {
    setExplorerContextMenu(null);
    onRemoveRoom(room.id, room.name);
    if (selectedSceneMapRoomName === room.name) {
      setSelectedSceneMapRoomName(null);
    }
  }

  function createRoomFromEditor(anchorRoomID?: string): void {
    openCreateRoomPrompt(anchorRoomID);
  }

  function persistSceneOrganization(nextOrganization: EditorSceneOrganization): void {
    onUpdateSceneOrganization(nextOrganization);
  }

  function finishSceneDrag(): void {
    setDraggedSceneID(null);
    setDraggedSceneIDs([]);
    setDragOverSceneID(null);
    setDragOverSceneGroupID(null);
  }

  function moveDraggedScene(beforeSceneID: string | null, groupID: string | null): void {
    if (!draggedSceneID || draggedSceneIDs.length === 0) return;
    const draggedIDs = draggedSceneIDs.filter((sceneID) => sceneOrganization.order.includes(sceneID));
    if (draggedIDs.length === 0) return;
    const reordered = draggedIDs.reduce(
      (organization, sceneID) => reorderEditorScene(organization, sceneID, beforeSceneID),
      sceneOrganization
    );
    const nextOrganization = draggedIDs.reduce(
      (organization, sceneID) => moveEditorSceneToGroup(organization, sceneID, groupID),
      reordered
    );
    persistSceneOrganization(nextOrganization);
    finishSceneDrag();
  }

  function moveSceneIntoGroup(sceneID: string, groupID: string | null): void {
    const sceneIDs = draggedSceneIDs.length > 0 ? draggedSceneIDs : [sceneID];
    const nextOrganization = sceneIDs.reduce(
      (organization, draggedID) => moveEditorSceneToGroup(organization, draggedID, groupID),
      sceneOrganization
    );
    persistSceneOrganization(nextOrganization);
    setDragOverSceneGroupID(null);
    setDraggedSceneID(null);
    setDraggedSceneIDs([]);
  }

  function moveContextSceneIntoGroup(groupID: string | null): void {
    if (!explorerContextMenu) return;
    const roomID = explorerContextMenu.room.id;
    const sceneIDs = selectedSceneIDs.has(roomID) && selectedSceneIDs.size > 1
      ? Array.from(selectedSceneIDs)
      : [roomID];
    const nextOrganization = sceneIDs.reduce(
      (organization, selectedID) => moveEditorSceneToGroup(organization, selectedID, groupID),
      sceneOrganization
    );
    persistSceneOrganization(nextOrganization);
    setExplorerContextMenu(null);
  }

  function selectSceneInExplorer(event: React.MouseEvent<HTMLElement>, room: RoomsWorkspaceRoom): void {
    const additiveSelection = event.metaKey || event.ctrlKey;
    const visibleIndex = orderedVisibleSceneIDs.indexOf(room.id);
    const lastVisibleIndex = lastSelectedSceneID ? orderedVisibleSceneIDs.indexOf(lastSelectedSceneID) : -1;
    if (event.shiftKey && visibleIndex >= 0 && lastVisibleIndex >= 0) {
      const [start, end] = [visibleIndex, lastVisibleIndex].sort((a, b) => a - b);
      setSelectedSceneIDs(new Set(orderedVisibleSceneIDs.slice(start, end + 1)));
    } else if (additiveSelection) {
      setSelectedSceneIDs((current) => {
        const next = new Set(current);
        if (next.has(room.id)) next.delete(room.id);
        else next.add(room.id);
        return next;
      });
    } else {
      setSelectedSceneIDs(new Set([room.id]));
    }
    setLastSelectedSceneID(room.id);
    focusRoomInExplorer(room);
  }

  function toggleSceneSelection(roomID: string): void {
    setSelectedSceneIDs((current) => {
      const next = new Set(current);
      if (next.has(roomID)) next.delete(roomID);
      else next.add(roomID);
      return next;
    });
    setLastSelectedSceneID(roomID);
  }

  function renderSceneTreeScene(room: RoomsWorkspaceRoom, groupID: string | null): React.ReactElement {
    const roomLabel = sceneDisplayName(room.name);
    const roomEntities = resolvedPresentation.entities.filter((entity) => entity.roomName === room.name);
    const roomPlayer = roomEntities.find((entity) => entity.isPlayer);
    const roomActors = roomEntities.filter((entity) => entity.kind === "actor" && !entity.isPlayer);
    const roomHasPlayer = roomEntities.some((entity) => entity.isPlayer);
    const roomTriggers = roomEntities.filter((entity) => entity.kind === "trigger");
    const roomTreeMeta = `${roomTreeSubtitle(room)} · ${roomActors.length} atores${roomHasPlayer ? " · Player visível" : ""} · ${roomTriggers.length} gatilhos`;
    const isDropTarget = dragOverSceneID === room.id;
    const isSceneSelected = selectedSceneIDs.has(room.id);
    return (
      <details
        className={["editor-tree-scene-branch", room.isActive ? "is-selected" : "", isSceneSelected ? "is-multi-selected" : "", isDropTarget ? "is-drop-target" : ""].filter(Boolean).join(" ")}
        key={room.id}
        onToggle={(event) => {
          const nextOpen = event.currentTarget.open;
          setExpandedSceneIDs((current) => {
            const next = new Set(current);
            if (nextOpen) next.add(room.id);
            else next.delete(room.id);
            return next;
          });
        }}
        open={expandedSceneIDs.has(room.id)}
      >
        <summary
          aria-current={room.isActive ? "true" : undefined}
          aria-label={`${roomLabel}. ${roomTreeMeta}${isSceneSelected ? " · selecionada" : ""}`}
          className={["editor-tree-row", "nested", "scene-tree-row", room.isActive ? "is-selected" : "", isSceneSelected ? "is-multi-selected" : ""].filter(Boolean).join(" ")}
          draggable
          onContextMenu={(event) => openRoomContextMenu(event, room)}
          onClick={(event) => selectSceneInExplorer(event, room)}
          onDragEnd={finishSceneDrag}
          onDragOver={(event) => {
            if (!draggedSceneID || draggedSceneID === room.id) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDragOverSceneID(room.id);
            setDragOverSceneGroupID(groupID);
          }}
          onDragStart={(event) => {
            const nextDraggedIDs = selectedSceneIDs.has(room.id) ? Array.from(selectedSceneIDs) : [room.id];
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", room.id);
            setDraggedSceneID(room.id);
            setDraggedSceneIDs(nextDraggedIDs);
          }}
          onDrop={(event) => {
            event.preventDefault();
            moveDraggedScene(room.id, groupID);
          }}
          title={`${roomTreeMeta}. Marque a caixa para selecionar cenas para um grupo; Command/Control-clique e Shift-clique também funcionam. Arraste para reordenar ou mover para um grupo.`}
        >
          {sceneMultiSelectMode ? <input
            aria-label={`${isSceneSelected ? "Desmarcar" : "Selecionar"} cena ${roomLabel}`}
            checked={isSceneSelected}
            className="scene-tree-selection-checkbox"
            onChange={() => toggleSceneSelection(room.id)}
            onClick={(event) => event.stopPropagation()}
            type="checkbox"
          /> : null}
          <ChevronRight aria-hidden="true" className="editor-tree-chevron" size={18} strokeWidth={2.4} />
          <Folder aria-hidden="true" className="editor-tree-icon folder" size={18} strokeWidth={2.2} />
          <span>
            <strong>{roomLabel}</strong>
          </span>
        </summary>
        <div className="editor-tree-children scene-tree-children">
          {roomPlayer ? (
            <button
              aria-label={`Player ${roomPlayer.name}`}
              className={["editor-tree-row", "nested", "leaf", "is-player", selectedEntityKeys.includes(entityKey(roomPlayer)) ? "is-selected" : ""].filter(Boolean).join(" ")}
              key={entityKey(roomPlayer)}
              onClick={() => focusEntityInExplorer(roomPlayer)}
              title={roomPlayer.spriteSheet ? `Player · ${roomPlayer.spriteSheet}` : "Player"}
              type="button"
            >
              <span aria-hidden="true" className="editor-tree-chevron spacer" />
              <UserRound aria-hidden="true" className="editor-tree-icon" size={17} strokeWidth={2.2} />
              <span>
                <strong>Player · {roomPlayer.name}</strong>
              </span>
            </button>
          ) : null}
          {roomActors.map((entity) => (
            <button
              aria-label={`Ator ${entity.name}${entity.spriteSheet ? ` · ${entity.spriteSheet}` : ""}`}
              className={["editor-tree-row", "nested", "leaf", selectedEntityKeys.includes(entityKey(entity)) ? "is-selected" : ""].filter(Boolean).join(" ")}
              key={entityKey(entity)}
              onClick={() => focusEntityInExplorer(entity)}
              title={entity.spriteSheet ? `Ator · ${entity.spriteSheet}` : "Ator"}
              type="button"
            >
              <span aria-hidden="true" className="editor-tree-chevron spacer" />
              <UserRound aria-hidden="true" className="editor-tree-icon" size={17} strokeWidth={2.2} />
              <span>
                <strong>{entity.name}</strong>
              </span>
            </button>
          ))}
          {roomTriggers.map((entity) => {
            const source = sourceRecordForRoomEntity(projectData, entity);
            const bindings = source?.eventBindings;
            const eventNames = [...new Set([entity.eventName, ...(bindings && typeof bindings === "object" && !Array.isArray(bindings) ? Object.values(bindings) : [])]
              .filter((name): name is string => typeof name === "string" && Boolean(name.trim())).map(name => name.trim()))];
            return (
            <button
              aria-label={`Gatilho ${entity.name}${entity.eventName ? ` · ${entity.eventName}` : ""}`}
              className={["editor-tree-row", "nested", "leaf", selectedEntityKeys.includes(entityKey(entity)) ? "is-selected" : ""].filter(Boolean).join(" ")}
              key={entityKey(entity)}
              onClick={() => focusEntityInExplorer(entity)}
              title={eventNames.length ? `Gatilho · ${eventNames.join(", ")}` : "Gatilho sem fluxo vinculado"}
              type="button"
            >
              <span aria-hidden="true" className="editor-tree-chevron spacer" />
              <Diamond aria-hidden="true" className="editor-tree-icon filled" size={17} strokeWidth={2.2} />
              <span>
                <strong>{entity.name}</strong>
              </span>
            </button>
            );
          })}
          {roomEntities.length === 0 ? (
            <div className="editor-empty-row nested">
              <MapIcon aria-hidden="true" size={17} strokeWidth={2.1} />
              <strong>Cena sem entidades</strong>
            </div>
          ) : null}
        </div>
      </details>
    );
  }

  function renderSceneGroup(group: EditorSceneGroup): React.ReactElement | null {
    const groupSceneIDs = sceneGroupSceneIDs(group);
    if (normalizedSceneSearchQuery && groupSceneIDs.length === 0) return null;
    const isDropTarget = dragOverSceneGroupID === group.id && dragOverSceneID === null;
    return (
      <div className="scene-tree-group-wrapper" key={group.id}>
        <details
          className={["scene-tree-group-branch", isDropTarget ? "is-drop-target" : ""].filter(Boolean).join(" ")}
          open={expandedSceneGroupIDs.has(group.id)}
          onToggle={(event) => {
            const nextOpen = event.currentTarget.open;
            setExpandedSceneGroupIDs((current) => {
              const next = new Set(current);
              if (nextOpen) next.add(group.id);
              else next.delete(group.id);
              return next;
            });
          }}
        >
          <summary
            aria-label={`${group.name}, ${groupSceneIDs.length} cenas`}
            className="editor-tree-row scene-tree-group-row"
            onDragOver={(event) => {
              if (!draggedSceneID) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDragOverSceneID(null);
              setDragOverSceneGroupID(group.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              moveSceneIntoGroup(draggedSceneID ?? "", group.id);
            }}
            title="Solte uma cena aqui para movê-la para este grupo."
          >
            <ChevronRight aria-hidden="true" className="editor-tree-chevron" size={16} strokeWidth={2.4} />
            <Folder aria-hidden="true" className="editor-tree-icon folder" size={17} strokeWidth={2.2} />
            <span>
              <strong>{group.name}</strong>
              <small>{groupSceneIDs.length} cenas</small>
            </span>
          </summary>
          <div className="editor-tree-children scene-tree-group-children">
            {groupSceneIDs.length > 0
              ? groupSceneIDs.map((sceneID) => {
                  const room = sceneByID.get(sceneID);
                  return room ? renderSceneTreeScene(room, group.id) : null;
                })
              : <div className="editor-empty-row nested"><Folder aria-hidden="true" size={16} /><strong>Arraste cenas para cá</strong></div>}
          </div>
        </details>
        <span className="scene-tree-group-actions">
          <button
            aria-label={`Renomear grupo ${group.name}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openRenameSceneGroupPrompt(group);
            }}
            title="Renomear grupo"
            type="button"
          >
            <Pencil aria-hidden="true" size={13} strokeWidth={2.2} />
          </button>
          <button
            aria-label={`Remover grupo ${group.name}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              persistSceneOrganization(removeEditorSceneGroup(sceneOrganization, group.id));
              setExpandedSceneGroupIDs((current) => {
                const next = new Set(current);
                next.delete(group.id);
                return next;
              });
            }}
            title="Remover grupo; as cenas ficam sem grupo"
            type="button"
          >
            <Trash2 aria-hidden="true" size={13} strokeWidth={2.2} />
          </button>
        </span>
      </div>
    );
  }

  function createRoomFromPreset(presetID: RoomPresetID): void {
    openCreateRoomPrompt(undefined, presetID);
  }

  function createRoomBesideCard(room: RoomsWorkspaceRoom): void {
    openCreateRoomPrompt(room.id);
  }

  function updateSceneMapCardDrag(clientX: number, clientY: number): void {
    const drag = sceneMapCardDrag.current;
    if (!drag) return;

    const nextPosition = deriveSceneMapCardDragPosition({
      canvasZoom: drag.canvasZoom,
      clientX,
      clientY,
      startPosition: drag.startPosition,
      startX: drag.startX,
      startY: drag.startY
    });
    drag.previewPosition = nextPosition;

    const frame = sceneMapCardFrameRefs.current[drag.roomName];
    if (!frame) return;

    const offset = deriveSceneMapCardDragTransform({
      nextPosition,
      startPosition: drag.startPosition
    });
    const scale = clampSceneMapZoom(drag.canvasZoom);
    frame.style.transform = `translate3d(${offset.x * scale}px, ${offset.y * scale}px, 0)`;
    setSceneMapDragPreview((current) => {
      if (
        current?.roomName === drag.roomName &&
        current.position.x === nextPosition.x &&
        current.position.y === nextPosition.y
      ) {
        return current;
      }
      return { roomName: drag.roomName, position: nextPosition };
    });
  }

  function scheduleSceneMapCardDragUpdate(clientX: number, clientY: number): void {
    sceneMapCardDragPendingPointer.x = clientX;
    sceneMapCardDragPendingPointer.y = clientY;
    if (sceneMapCardDragFrameRequest !== null) return;
    sceneMapCardDragFrameRequest = window.requestAnimationFrame(() => {
      sceneMapCardDragFrameRequest = null;
      updateSceneMapCardDrag(sceneMapCardDragPendingPointer.x, sceneMapCardDragPendingPointer.y);
    });
  }

  function clearSceneMapCardDragVisualState(roomName: string, nextPosition: SceneMapPosition, zoom: number): void {
    const frame = sceneMapCardFrameRefs.current[roomName];
    if (!frame) return;
    const displayedPosition = displayedSceneMapPosition(nextPosition, zoom);
    frame.classList.remove("is-dragging");
    frame.style.left = `${displayedPosition.x}px`;
    frame.style.top = `${displayedPosition.y}px`;
    frame.style.transform = "";
    frame.style.willChange = "";
  }

  function finishSceneMapCardDrag(pointerID: number): void {
    const drag = sceneMapCardDrag.current;
    if (!drag || drag.pointerID !== pointerID) return;

    const nextPosition = drag.previewPosition;
    sceneMapCardDragActiveRef.current = false;
    document.body.classList.remove("room-scene-map-card-dragging");
    if (sceneMapCardDragFrameRequest !== null) {
      window.cancelAnimationFrame(sceneMapCardDragFrameRequest);
      sceneMapCardDragFrameRequest = null;
    }
    clearSceneMapCardDragVisualState(drag.roomName, nextPosition, drag.canvasZoom);
    drag.cleanup?.();
    sceneMapCardDrag.current = null;
    setSceneMapDragPreview(null);
    setSelectedSceneMapRoomName(drag.roomName);
    onUpdateSceneMapPosition(drag.roomName, nextPosition);
  }

  function startSceneMapCardDrag(room: RoomsWorkspaceRoom, event: React.PointerEvent<HTMLElement>): void {
    event.preventDefault();
    event.stopPropagation();
    sceneMapCardDragActiveRef.current = true;
    document.body.classList.add("room-scene-map-card-dragging");
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events in smoke tests may not register an active pointer.
    }
    sceneMapCardDrag.current?.cleanup?.();
    const startPosition = resolvedPresentation.sceneMapPositions[room.name]
      ?? defaultSceneMapPosition(resolvedPresentation.rooms.findIndex((candidate) => candidate.id === room.id), resolvedPresentation.rooms);
    const pointerID = event.pointerId;
    const frame = sceneMapCardFrameRefs.current[room.name];
    if (frame) {
      frame.classList.add("is-dragging");
      frame.style.willChange = "transform";
    }
    const handlePointerMove = (moveEvent: PointerEvent): void => {
      scheduleSceneMapCardDragUpdate(moveEvent.clientX, moveEvent.clientY);
    };
    const handlePointerUp = (upEvent: PointerEvent): void => {
      finishSceneMapCardDrag(upEvent.pointerId);
    };
    const handlePointerCancel = (cancelEvent: PointerEvent): void => {
      finishSceneMapCardDrag(cancelEvent.pointerId);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", handlePointerCancel, { once: true });
    sceneMapCardDrag.current = {
      canvasZoom,
      cleanup: () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerCancel);
        sceneMapCardDragActiveRef.current = false;
        document.body.classList.remove("room-scene-map-card-dragging");
        if (sceneMapCardDragFrameRequest !== null) {
          window.cancelAnimationFrame(sceneMapCardDragFrameRequest);
          sceneMapCardDragFrameRequest = null;
        }
        setSceneMapDragPreview(null);
      },
      pointerID,
      previewPosition: startPosition,
      roomName: room.name,
      startPosition,
      startX: event.clientX,
      startY: event.clientY
    };
  }

  function continueSceneMapCardDrag(event: React.PointerEvent<HTMLElement>): void {
    const drag = sceneMapCardDrag.current;
    if (!drag || drag.pointerID !== event.pointerId) return;
    scheduleSceneMapCardDragUpdate(event.clientX, event.clientY);
  }

  function endSceneMapCardDrag(event: React.PointerEvent<HTMLElement>): void {
    finishSceneMapCardDrag(event.pointerId);
  }

  function connectRoomToNextScene(room: RoomsWorkspaceRoom): void {
    const index = resolvedPresentation.rooms.findIndex((candidate) => candidate.id === room.id);
    const target = resolvedPresentation.rooms[index + 1] ?? resolvedPresentation.rooms.find((candidate) => candidate.id !== room.id) ?? null;
    if (!target) return;
    createConnectionFromRoom(room.name, target.name, "");
  }

  const roomCardByName = new Map<string, {
    cardSize: RoomStageCardSize;
    connectorPosition: SceneMapPosition;
    position: SceneMapPosition;
    room: RoomsWorkspaceRoom;
  }>();
  visibleSceneMapCards.forEach((item) => {
    if (!roomCardByName.has(item.room.name)) {
      roomCardByName.set(item.room.name, item);
    }
  });
  const explicitSceneLinkPairs = new Set(presentation.connections.map((connection) => `${connection.from}\u0000${connection.to}`));
  const roomEventSceneLinks = projectData ? deriveRoomEventSceneLinks(projectData) : [];
  const incomingArrivals = roomEventSceneLinks.filter(link => link.to === focusSceneRoom?.name && link.x !== null && link.y !== null);
  const selectedArrival = incomingArrivals.find(link => link.id === selectedArrivalID);
  const testArrival = incomingArrivals.find(link => link.id === testArrivalID);
  const selectArrival = (link: RoomEventSceneLink): void => {
    setSelectedArrivalID(link.id);
    setSelectedEntityKeys([]);
    setSelectedEditMode("select");
    setSelectedToolPanelMode("select");
    setInspectorTabByContext(current => ({ ...current, room: "connections" }));
  };
  const updateSelectedArrival = (patch: { x?: number; y?: number; direction?: RoomEventSceneLink["direction"] }): void => {
    if (!selectedArrival || selectedArrival.eventID === null || selectedArrival.stepIndex === null) return;
    onUpdateEventStep?.(selectedArrival.eventID, selectedArrival.stepIndex, {
      command: updateRoomEventSceneLinkCommand(selectedArrival.command ?? `change_scene ${selectedArrival.to}`, patch)
    });
  };
  const sceneMapConnections = [
    ...presentation.connections.map((connection) => ({
      connectionIndex: connection.index as number | null,
      from: connection.from,
      id: `room-connection-${connection.index}`,
      label: connection.eventName || `${connection.from} -> ${connection.to}`,
      showLabel: true,
      to: connection.to,
      eventLink: null
    })),
    ...roomEventSceneLinks.filter((link) => (
      !explicitSceneLinkPairs.has(`${link.from}\u0000${link.to}`)
    )).map((link) => ({
      connectionIndex: null,
      from: link.from,
      id: link.id,
      label: link.eventName,
      showLabel: false,
      to: link.to,
      eventLink: link
    }))
  ];
  const sceneMapSelectionName = resolvedPresentation.rooms.find((room) => room.name === selectedSceneMapRoomName)?.name
    ?? activeRoom?.name
    ?? null;
  const roomCardConnectors = sceneMapConnections.filter((connection) => (
    sceneMapSelectionName !== null
      && (connection.from === sceneMapSelectionName || connection.to === sceneMapSelectionName)
  )).flatMap((connection) => {
    const from = roomCardByName.get(connection.from);
    const to = roomCardByName.get(connection.to);
    if (!from || !to || from.room.id === to.room.id) return [];
    const fromPosition = displayedSceneMapPosition(from.connectorPosition, canvasZoom);
    const toPosition = displayedSceneMapPosition(to.connectorPosition, canvasZoom);
    const fromX = fromPosition.x;
    const fromY = fromPosition.y;
    const toX = toPosition.x;
    const toY = toPosition.y;
    const fromCenterX = fromX + from.cardSize.width / 2;
    const toCenterX = toX + to.cardSize.width / 2;
    const direction = toCenterX >= fromCenterX ? 1 : -1;
    const x1 = direction > 0 ? fromX + from.cardSize.width : fromX;
    const x2 = direction > 0 ? toX : toX + to.cardSize.width;
    const y1 = fromY + from.cardSize.height / 2;
    const y2 = toY + to.cardSize.height / 2;
    const handle = Math.max(80, Math.abs(x2 - x1) / 2);
    return [{
      connectionIndex: connection.connectionIndex,
      d: `M ${x1} ${y1} C ${x1 + direction * handle} ${y1}, ${x2 - direction * handle} ${y2}, ${x2} ${y2}`,
      from: connection.from,
      id: `room-card-connector-${connection.id}-${from.room.id}-${to.room.id}`,
      label: connection.label,
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2 - 8,
      showLabel: connection.showLabel,
      to: connection.to,
      eventLink: connection.eventLink
    }];
  });
  const focusedSceneEditorElement = focusSceneRoom && focusedSceneEditorCardSize ? (
    <RoomTilemapEditor
      cardSize={focusedSceneEditorCardSize}
      ghostOpacity={ghostOpacity}
      ghostPreviewEnabled={ghostPreviewEnabled}
      isActiveRoom
      isFocusedSceneEditor
      racingMapView={focusViewMode === "map"}
      onRacingMapViewChange={open=>setFocusViewMode(open?"map":"viewport")}
      menuPreviewScreenID={selectedSceneMenuScreen?.id}
      menuPreviewItemIndex={sceneMenuItemIndex}
      onApplyTileBrush={onApplyTileBrush}
      onCreateActor={onCreateActor}
      onCreateTrigger={onCreateTrigger}
      onApplyCollisionRectangle={applyCollisionRectangleForRoom}
      onBeginHistoryGroup={onBeginHistoryGroup}
      onPlaceRoomEntity={onPlaceRoomEntity}
      onUpdateRoomEntity={onUpdateRoomEntity}
      onResizeRoomTrigger={onResizeRoomTrigger}
      onSelectCanvasCell={selectCanvasCell}
      onSelectSceneContext={selectSceneContextFromCanvas}
      onSetCollisionType={onSetCollisionType}
      onApplyCollisionFill={onApplyCollisionFill}
      onSetHeightLevel={onSetHeightLevel}
      onUpdateRoomConnection={onUpdateRoomConnection}
      onEndHistoryGroup={onEndHistoryGroup}
      projectPath={projectPath}
      projectData={projectData}
      room={focusSceneRoom}
      renderHudOverlay={false}
      entities={presentation.entities.filter((entity) => entity.roomName === focusSceneRoom.name)}
      hudBinding={selectedToolPanelMode === "hud" ? focusSceneHudAuthoringBinding : focusSceneHudBinding}
      hudViewportScale={focusViewportGeometry?.scale ?? 1}
      selectedHudComponentID={selectedHudComponentID}
      onSelectHudComponent={(componentID) => {
        setSelectedHudComponentID(componentID);
        setInspectorTabByContext((current) => ({ ...current, room: "hud" }));
      }}
      selectedCanvasCellIndex={selectedCanvasCell?.roomID === focusSceneRoom.id ? selectedCanvasCell.cellIndex : null}
      selectedCollisionType={selectedCollisionType}
      setSelectedCollisionType={setSelectedCollisionType}
      collisionPlacementMode={collisionPlacementMode}
      selectedEditMode={selectedEditMode}
      selectedEntityKeys={selectedEntityKeys}
      selectedEntityTool={selectedEntityTool}
      selectedHeightLevel={selectedHeightLevel}
      selectedTileID={selectedTileID}
      selectedTileStamp={selectedTileStamp}
      selectedTool={selectedTool}
      selectedToolPanelMode={selectedToolPanelMode}
      canvasLayerLocks={canvasLayerLocks}
      canvasLayerVisibility={focusViewMode === "map" ? { ...canvasLayerVisibility, cameraBounds: false } : canvasLayerVisibility}
      canvasGridVisible
      setSelectedEditMode={setCanvasEditMode}
      setSelectedEntityKeys={selectRoomEntityKeys}
      setSelectedTileID={setSelectedTileID}
      setSelectedTileStamp={setSelectedTileStamp}
      setSelectedTool={setSelectedTool}
      triggerPlacementEnabled={selectedToolPanelMode === "trigger"}
      cameraZones={focusSceneRoom.cameraZones ?? []}
      cameraZonePlacementEnabled={selectedToolPanelMode === "camera"}
      selectedCameraZoneID={selectedCameraZoneID}
      onSelectCameraZone={(zoneID) => {
        setSelectedCameraZoneID(zoneID);
        setInspectorTabByContext((current) => ({ ...current, room: "camera" }));
      }}
      onCreateCameraZone={(area, historyGroupID) => {
        const zones = focusSceneRoom.cameraZones ?? [];
        let suffix = zones.length + 1;
        while (zones.some((zone) => zone.id === `camera-zone-${suffix}`)) suffix += 1;
        const zone: RoomCameraZone = {
          id: `camera-zone-${suffix}`,
          name: `Zona ${suffix}`,
          area,
          bounds: { x: 0, y: 0, width: focusSceneRoom.width * 16, height: focusSceneRoom.height * 16 },
          offset: { x: 0, y: 0 },
          lockX: false,
          lockY: false
        };
        invokeHistoryAware(
          onUpdateRoomFields,
          [focusSceneRoom.id, { cameraZones: [...zones, zone] }],
          historyGroupID
        );
        setSelectedCameraZoneID(zone.id);
      }}
      collisionHoverPreviewEnabled={collisionHoverPreviewEnabled}
      connectionZones={deriveRoomConnectionAreasForRoom(focusSceneRoom.name, presentation.connections)}
      connectionZonePlacementEnabled={selectedToolPanelMode === "warp" && (
        selectedConnection !== null
          ? (selectedConnectionZoneSide === "exit" && focusSceneRoom.name === selectedConnection.from)
            || (selectedConnectionZoneSide === "entry" && focusSceneRoom.name === selectedConnection.to)
          : selectedConnectionZoneSide === "exit" && Boolean(warpTargetRoomName) && focusSceneRoom.name !== warpTargetRoomName
      )}
      connectionZoneSide={selectedConnectionZoneSide}
      selectedConnectionIndex={selectedConnectionIndex}
      connectionZoneTargetRoomName={warpTargetRoomName}
      connectionZoneEventName={connectionEventName}
      eventLinks={roomEventSceneLinks.filter((link) => link.to === focusSceneRoom.name)}
      onOpenEvent={onOpenEvent}
      onSelectArrival={selectArrival}
      testStart={testArrival ? { x: testArrival.x!, y: testArrival.y!, direction: testArrival.direction ?? "down" } : undefined}
      onUpdateEventStep={onUpdateEventStep}
      onCreateRoomWarpConnection={onCreateRoomWarpConnection}
      onSelectConnectionZone={selectConnectionZone}
    />
  ) : null;
  const focusLogicalWorld = focusSceneRoom ? focusSceneWorldLogicalSize(focusSceneRoom) : { width: 240, height: 160 };
  const focusNativePreview = focusedSceneEditorElement && focusSceneRoom ? (
    <div className="room-focus-native-preview" data-logical-width="240" data-logical-height="160"
      data-camera-x={focusCameraOrigin.left} data-camera-y={focusCameraOrigin.top} aria-hidden="true" ref={node => { node?.setAttribute("inert", ""); }}>
      <div className="room-focus-native-world" style={{ width: focusLogicalWorld.width, height: focusLogicalWorld.height,
        transform: `translate(${-focusCameraOrigin.left}px, ${-focusCameraOrigin.top}px)` }}>
        {cloneElement(focusedSceneEditorElement, {
          racingMapView: false,
          cardSize: {
            width: isPseudo3dRacingRoom(focusSceneRoom) ? 240 : focusedSceneEditorElement.props.cardSize.width / (focusViewportGeometry?.scale ?? 1),
            height: isPseudo3dRacingRoom(focusSceneRoom) ? 160 : focusedSceneEditorElement.props.cardSize.height / (focusViewportGeometry?.scale ?? 1),
            canvasHeight: isPseudo3dRacingRoom(focusSceneRoom) ? 160 : focusedSceneEditorElement.props.cardSize.canvasHeight / (focusViewportGeometry?.scale ?? 1),
            canvasDisplayHeight: isPseudo3dRacingRoom(focusSceneRoom) ? 160 : focusedSceneEditorElement.props.cardSize.canvasDisplayHeight / (focusViewportGeometry?.scale ?? 1)
          },
          canvasGridVisible: false, ghostPreviewEnabled: false, collisionHoverPreviewEnabled: false,
          canvasLayerVisibility: { ...defaultCanvasLayerVisibility, background: true, actors: true, hud: true, grid: false,
            composition: false, collision: false, hitboxes: false, triggers: false, cameraBounds: false, worldBounds: false },
          selectedToolPanelMode: "select", selectedEditMode: "select", selectedEntityKeys: [],
          selectedCanvasCellIndex: null, selectedCameraZoneID: null, selectedConnectionIndex: null,
          cameraZones: [], connectionZones: [], eventLinks: [], testStart: undefined,
          triggerPlacementEnabled: false, cameraZonePlacementEnabled: false, connectionZonePlacementEnabled: false,
          hudViewportScale: 1
        })}
      </div>
      {focusSceneHudBinding ? <RoomHudOverlay binding={focusSceneHudBinding} guides={false} labelPrefix="HUD na prévia GBA"
        entities={presentation.entities.filter(entity => entity.roomName === focusSceneRoom.name)}
        projectData={projectData} projectPath={projectPath} room={focusSceneRoom} viewportScale={1} viewportAnchored /> : null}
      {focusSceneLutaHudAssetURL ? <img className="room-focus-native-runtime-hud" alt="" src={focusSceneLutaHudAssetURL} /> : null}
      {projectData && activeInspectorTab === "dialogues" && dialoguePreviewKey ? <DialogueScenePreview
        roomId={focusSceneRoom.id} projectData={projectData} projectPath={projectPath}
        dialogue={contextualDialogues?.dialogues.find(dialogue => dialogue.key === dialoguePreviewKey) ?? dialogueCatalog.find(dialogue => dialogue.key === dialoguePreviewKey)}
        scale={1} ariaLabel="Diálogo na prévia GBA em tamanho real" /> : null}
    </div>
  ) : null;
  return (
    <section className="rooms-workspace" aria-label="Workspace Rooms">
      {roomNamePrompt ? (
        <RoomNamePromptDialog
          onCancel={() => setRoomNamePrompt(null)}
          onConfirm={confirmRoomNamePrompt}
          state={roomNamePrompt}
        />
      ) : null}
      {explorerContextMenu ? (
        <EditorExplorerContextMenu
          currentGroupID={sceneOrganization.groups.find((group) => group.sceneIDs.includes(explorerContextMenu.room.id))?.id ?? null}
          groups={sceneOrganization.groups}
          isStart={explorerContextMenu.room.isStart}
          onAddRoomBeside={() => {
            const room = explorerContextMenu.room;
            setExplorerContextMenu(null);
            createRoomBesideCard(room);
          }}
          onConnectNextScene={() => {
            const room = explorerContextMenu.room;
            setExplorerContextMenu(null);
            connectRoomToNextScene(room);
          }}
          onClose={() => setExplorerContextMenu(null)}
          onDelete={() => deleteRoomFromExplorer(explorerContextMenu.room)}
          onDuplicate={() => void duplicateRoomFromExplorer(explorerContextMenu.room)}
          onMoveToGroup={moveContextSceneIntoGroup}
          onRunRoom={() => {
            const room = explorerContextMenu.room;
            setExplorerContextMenu(null);
            onRunRoom(room.id, room.name);
          }}
          onRename={() => openRenameRoomPrompt(explorerContextMenu.room)}
          onSetStartRoom={() => {
            const room = explorerContextMenu.room;
            setExplorerContextMenu(null);
            onSetStartRoom(room.id, room.name);
          }}
          runRoomDisabled={runRoomDisabled}
          state={explorerContextMenu}
        />
      ) : null}
      <div
        className="rooms-editor-layout"
      >
        <div className="rooms-event-focus-host" />
        <WorkspaceExplorerRail
          ariaLabel="Navegador do projeto"
          workspaceId="rooms-explorer"
        >
          <div aria-label="Navegador do projeto" className="editor-project-tabs" role="tablist">
            <button
              aria-selected={navigatorTab === "project"}
              className={navigatorTab === "project" ? "active" : ""}
              onClick={() => setNavigatorTab("project")}
              role="tab"
              type="button"
            >
              Projeto
            </button>
            <button
              aria-selected={navigatorTab === "prefabs"}
              className={navigatorTab === "prefabs" ? "active" : ""}
              onClick={() => setNavigatorTab("prefabs")}
              role="tab"
              type="button"
            >
              Pré-fabricados
            </button>
            <button role="tab" type="button" aria-selected={navigatorTab === "logic"} className={navigatorTab === "logic" ? "active" : ""} onClick={() => setNavigatorTab("logic")}>Lógica</button>
          </div>
          {navigatorTab === "logic" && projectData ? <LogicNavigator projectData={projectData} events={logicEvents ?? null} selection={logicSelection} onSelect={setLogicSelection} onCreateVariable={onCreateLogicVariable} onCreateScript={onCreateEventReference} /> : null}
          {navigatorTab === "project" ? (
          <section className="editor-rail-section project-section" aria-label="Projeto">
            <div className="editor-rail-section-header project-tree-toolbar">
              <label className="editor-project-search-field">
                <ScanSearch aria-hidden="true" size={14} />
                <span className="sr-only">Buscar cenas</span>
                <input aria-label="Buscar cenas" onChange={(event) => setSceneSearchQuery(event.currentTarget.value)}
                  placeholder="Buscar cenas" type="search" value={sceneSearchQuery} />
                {sceneSearchQuery ? <button aria-label="Limpar busca de cenas" onClick={() => setSceneSearchQuery("")} type="button"><X aria-hidden="true" size={13} /></button> : null}
              </label>
              <div className="editor-rail-actions">
                <button aria-label="Selecionar várias cenas" aria-pressed={sceneMultiSelectMode}
                  onClick={() => setSceneMultiSelectMode((current) => !current)} title="Seleção múltipla de cenas" type="button">
                  <Check aria-hidden="true" size={14} />
                </button>
                <button
                  aria-label={selectedSceneIDs.size > 0 ? `Agrupar ${selectedSceneIDs.size} cenas selecionadas` : "Novo grupo de cenas"}
                  onClick={openCreateSceneGroupPrompt}
                  title={selectedSceneIDs.size > 0 ? "Criar grupo com as cenas selecionadas" : "Novo grupo de cenas"}
                  type="button"
                >
                  <FolderPlus aria-hidden="true" size={18} strokeWidth={2.2} />
                </button>
                <button aria-label="Nova cena" onClick={() => createRoomFromEditor()} title="Nova cena" type="button">
                  <SquarePlus aria-hidden="true" size={20} strokeWidth={2.4} />
                </button>
              </div>
            </div>
            <div className="editor-tree-branch">
              <button
                aria-expanded={railExpanded.project}
                className={["editor-tree-row", "project-tree-row", railExpanded.project ? "is-expanded" : ""].filter(Boolean).join(" ")}
                onClick={() => toggleRailSection("project")}
                type="button"
              >
                <ChevronRight aria-hidden="true" className="editor-tree-chevron" size={18} strokeWidth={2.4} />
                <Folder aria-hidden="true" className="editor-tree-icon folder" size={18} strokeWidth={2.4} />
                <span>
                  <strong>{projectTreeName}</strong>
                  <small>{presentation.summary.roomCount} cenas</small>
                </span>
              </button>
              {railExpanded.project ? (
                <div className="editor-tree-children">
                  {presentation.rooms.length && orderedVisibleSceneIDs.length > 0 ? (
                    sceneOrganization.groups.length > 0 ? (
                      <>
                        {sceneOrganization.groups.map(renderSceneGroup)}
                        <details
                          className={["scene-tree-group-branch", dragOverSceneGroupID === null && draggedSceneID ? "is-drop-target" : ""].filter(Boolean).join(" ")}
                          open
                          onDragOver={(event) => {
                            if (!draggedSceneID) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setDragOverSceneID(null);
                            setDragOverSceneGroupID(null);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            moveSceneIntoGroup(draggedSceneID ?? "", null);
                          }}
                        >
                          <summary aria-label={`Sem grupo, ${ungroupedSceneIDs.length} cenas`} className="editor-tree-row scene-tree-group-row">
                            <ChevronRight aria-hidden="true" className="editor-tree-chevron" size={16} strokeWidth={2.4} />
                            <Folder aria-hidden="true" className="editor-tree-icon folder" size={17} strokeWidth={2.2} />
                            <span><strong>Sem grupo</strong><small>{ungroupedSceneIDs.length} cenas</small></span>
                          </summary>
                          <div className="editor-tree-children scene-tree-group-children">
                            {ungroupedSceneIDs.map((sceneID) => {
                              const room = sceneByID.get(sceneID);
                              return room ? renderSceneTreeScene(room, null) : null;
                            })}
                            {ungroupedSceneIDs.length === 0 ? <div className="editor-empty-row nested"><Folder aria-hidden="true" size={16} /><strong>Arraste cenas para cá</strong></div> : null}
                          </div>
                        </details>
                      </>
                    ) : orderedVisibleSceneIDs.map((sceneID) => {
                      const room = sceneByID.get(sceneID);
                      return room ? renderSceneTreeScene(room, null) : null;
                    })
                  ) : normalizedSceneSearchQuery ? (
                    <div className="editor-empty-row scene-tree-empty-search">
                      <ScanSearch aria-hidden="true" size={17} strokeWidth={2.1} />
                      <strong>Nenhuma cena encontrada</strong>
                    </div>
                  ) : (
                    <div className="editor-empty-row">
                      <MapIcon aria-hidden="true" size={18} strokeWidth={2.1} />
                      <strong>Nenhuma cena</strong>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </section>
          ) : null}
          {navigatorTab === "prefabs" ? (
          <section className="editor-rail-section prefabs-section" aria-label="Pre-fabricados">
            <div className="editor-rail-section-header">
              <h4>Pre-fabricados</h4>
              <button
                aria-label="Criar pre-fabricado do selecionado"
                className="editor-rail-diamond-action"
                disabled={!onCreatePrefabFromEntity || !selectedPrefabSource}
                onClick={() => {
                  if (selectedPrefabSource) onCreatePrefabFromEntity?.(selectedPrefabSource.kind, selectedPrefabSource.id);
                }}
                title="Criar um modelo reutilizavel a partir da instancia selecionada"
                type="button"
              >
                <Plus aria-hidden="true" size={18} strokeWidth={2.4} />
              </button>
              <button
                aria-label="Aplicar pre-fabricados as instancias"
                className="editor-rail-diamond-action"
                disabled={!onSynchronizePrefabs || prefabCount === 0}
                onClick={() => onSynchronizePrefabs?.()}
                title="Aplicar propriedades dos pre-fabricados as instancias vinculadas"
                type="button"
              >
                <RefreshCw aria-hidden="true" size={18} strokeWidth={2.4} />
              </button>
            </div>
            <div className="editor-tree-branch">
              <button
                aria-expanded={railExpanded.prefabsLibrary}
                className={["editor-tree-row", "library-row", railExpanded.prefabsLibrary ? "is-expanded" : ""].filter(Boolean).join(" ")}
                onClick={() => toggleRailSection("prefabsLibrary")}
                type="button"
              >
                <ChevronRight aria-hidden="true" className="editor-tree-chevron" size={18} strokeWidth={2.4} />
                <Box aria-hidden="true" className="editor-tree-icon" size={18} strokeWidth={2.2} />
                <span>
                  <strong>Biblioteca</strong>
                  <small>{prefabCount} prefabs</small>
                </span>
              </button>
              {railExpanded.prefabsLibrary ? (
                <div className="editor-tree-children">
                  {actorPrefabs.map((prefab) => (
                    <details className="editor-prefab-editor" data-prefab-kind="actor" key={`actor-prefab:${prefab.id}`}>
                      <summary className="editor-tree-row nested leaf">
                        <ChevronRight aria-hidden="true" className="editor-tree-chevron" size={17} strokeWidth={2.2} />
                        <Box aria-hidden="true" className="editor-tree-icon" size={17} strokeWidth={2.2} />
                        <span><strong>{prefab.name}</strong><small>Ator · {prefab.id}</small></span>
                      </summary>
                      <div className="editor-prefab-fields">
                        <label>
                          <span>Nome</span>
                          <input
                            aria-label={`Nome do prefab ${prefab.name}`}
                            onChange={(event) => onUpdatePrefab?.("actor", prefab.id, { name: event.currentTarget.value })}
                            value={String(prefab.name ?? "")}
                          />
                        </label>
                        <label>
                          <span>Sprite</span>
                          <input
                            aria-label={`Sprite do prefab ${prefab.name}`}
                            onChange={(event) => onUpdatePrefab?.("actor", prefab.id, { spriteSheet: event.currentTarget.value })}
                            value={String(prefab.spriteSheet ?? "")}
                          />
                        </label>
                        <label>
                          <span>Animacao</span>
                          <input
                            aria-label={`Animacao do prefab ${prefab.name}`}
                            onChange={(event) => onUpdatePrefab?.("actor", prefab.id, { animationName: event.currentTarget.value })}
                            value={String(prefab.animationName ?? "")}
                          />
                        </label>
                        <label>
                          <input
                            aria-label={`Colisão do prefab ${prefab.name}`}
                            checked={prefab.collisionEnabled !== false}
                            onChange={(event) => onUpdatePrefab?.("actor", prefab.id, { collisionEnabled: event.currentTarget.checked })}
                            type="checkbox"
                          />
                          <span>Colisão ativa</span>
                        </label>
                        <button
                          aria-label={`Instanciar ${prefab.name}`}
                          disabled={!onInstantiatePrefab || !prefabPlacement}
                          onClick={() => {
                            if (prefabPlacement) onInstantiatePrefab?.("actor", prefab.id, prefabPlacement);
                          }}
                          type="button"
                        >Instanciar na cena ativa</button>
                      </div>
                    </details>
                  ))}
                  {triggerPrefabs.map((prefab) => (
                    <details className="editor-prefab-editor" data-prefab-kind="trigger" key={`trigger-prefab:${prefab.id}`}>
                      <summary className="editor-tree-row nested leaf">
                        <ChevronRight aria-hidden="true" className="editor-tree-chevron" size={17} strokeWidth={2.2} />
                        <Diamond aria-hidden="true" className="editor-tree-icon filled" size={17} strokeWidth={2.2} />
                        <span><strong>{prefab.name}</strong><small>Trigger · {prefab.id}</small></span>
                      </summary>
                      <div className="editor-prefab-fields">
                        <label>
                          <span>Nome</span>
                          <input
                            aria-label={`Nome do prefab ${prefab.name}`}
                            onChange={(event) => onUpdatePrefab?.("trigger", prefab.id, { name: event.currentTarget.value })}
                            value={String(prefab.name ?? "")}
                          />
                        </label>
                        <label>
                          <span>Largura</span>
                          <input
                            aria-label={`Largura do prefab ${prefab.name}`}
                            min={1}
                            onChange={(event) => onUpdatePrefab?.("trigger", prefab.id, { width: Math.max(1, Number(event.currentTarget.value) || 1) })}
                            type="number"
                            value={Number(prefab.width ?? 1)}
                          />
                        </label>
                        <label>
                          <span>Altura</span>
                          <input
                            aria-label={`Altura do prefab ${prefab.name}`}
                            min={1}
                            onChange={(event) => onUpdatePrefab?.("trigger", prefab.id, { height: Math.max(1, Number(event.currentTarget.value) || 1) })}
                            type="number"
                            value={Number(prefab.height ?? 1)}
                          />
                        </label>
                        <label>
                          <span>Evento ao entrar</span>
                          <input
                            aria-label={`Evento enter do prefab ${prefab.name}`}
                            onChange={(event) => onUpdatePrefab?.("trigger", prefab.id, { onEnterEventName: event.currentTarget.value })}
                            value={String(prefab.onEnterEventName ?? "")}
                          />
                        </label>
                        <label>
                          <span>Evento ao sair</span>
                          <input
                            aria-label={`Evento leave do prefab ${prefab.name}`}
                            onChange={(event) => onUpdatePrefab?.("trigger", prefab.id, { onLeaveEventName: event.currentTarget.value })}
                            value={String(prefab.onLeaveEventName ?? "")}
                          />
                        </label>
                        <button
                          aria-label={`Instanciar ${prefab.name}`}
                          disabled={!onInstantiatePrefab || !prefabPlacement}
                          onClick={() => {
                            if (prefabPlacement) onInstantiatePrefab?.("trigger", prefab.id, prefabPlacement);
                          }}
                          type="button"
                        >Instanciar na cena ativa</button>
                      </div>
                    </details>
                  ))}
                  {prefabCount === 0 ? <div className="editor-empty-row"><strong>Nenhum modelo reutilizável</strong></div> : null}
                  <button
                    aria-expanded={railExpanded.prefabsActors}
                    className={["editor-tree-row", "nested", railExpanded.prefabsActors ? "is-expanded" : ""].filter(Boolean).join(" ")}
                    onClick={() => toggleRailSection("prefabsActors")}
                    type="button"
                  >
                    <ChevronRight aria-hidden="true" className="editor-tree-chevron" size={18} strokeWidth={2.4} />
                    <UsersRound aria-hidden="true" className="editor-tree-icon" size={18} strokeWidth={2.2} />
                    <span>
                      <strong>Instâncias de atores</strong>
                      <small>{actorEntities.length}</small>
                    </span>
                  </button>
                  {railExpanded.prefabsActors ? (
                    <div className="editor-tree-children">
                      {actorEntities.length ? actorEntities.map((entity) => (
                        <button
                          className={[
                            "editor-tree-row",
                            "nested",
                            "leaf",
                            "deeper",
                            selectedEntityKeys.includes(entityKey(entity)) ? "is-selected" : ""
                          ].filter(Boolean).join(" ")}
                          key={entityKey(entity)}
                          onClick={() => focusEntityInExplorer(entity)}
                          type="button"
                        >
                          <span aria-hidden="true" className="editor-tree-chevron spacer" />
                          <UserRound aria-hidden="true" className="editor-tree-icon" size={18} strokeWidth={2.2} />
                          <span>
                            <strong>{entity.name}</strong>
                            <small>{sceneDisplayName(entity.roomName)}</small>
                          </span>
                        </button>
                      )) : (
                        <div className="editor-empty-row deeper">
                          <UserRound aria-hidden="true" size={18} strokeWidth={2.1} />
                          <strong>Nenhum ator</strong>
                        </div>
                      )}
                    </div>
                  ) : null}
                  <button
                    aria-expanded={railExpanded.prefabsTriggers}
                    className={["editor-tree-row", "nested", railExpanded.prefabsTriggers ? "is-expanded" : ""].filter(Boolean).join(" ")}
                    onClick={() => toggleRailSection("prefabsTriggers")}
                    type="button"
                  >
                    <ChevronRight aria-hidden="true" className="editor-tree-chevron" size={18} strokeWidth={2.4} />
                    <Diamond aria-hidden="true" className="editor-tree-icon filled" size={18} strokeWidth={2.4} />
                    <span>
                      <strong>Instâncias de triggers</strong>
                      <small>{triggerEntities.length}</small>
                    </span>
                  </button>
                  {railExpanded.prefabsTriggers ? (
                    <div className="editor-tree-children">
                      {triggerEntities.length ? triggerEntities.map((entity) => (
                        <button
                          className={[
                            "editor-tree-row",
                            "nested",
                            "leaf",
                            "deeper",
                            selectedEntityKeys.includes(entityKey(entity)) ? "is-selected" : ""
                          ].filter(Boolean).join(" ")}
                          key={entityKey(entity)}
                          onClick={() => focusEntityInExplorer(entity)}
                          type="button"
                        >
                          <span aria-hidden="true" className="editor-tree-chevron spacer" />
                          <Diamond aria-hidden="true" className="editor-tree-icon filled" size={18} strokeWidth={2.2} />
                          <span>
                            <strong>{entity.name}</strong>
                            <small>{sceneDisplayName(entity.roomName)}</small>
                          </span>
                        </button>
                      )) : (
                        <div className="editor-empty-row deeper">
                          <Diamond aria-hidden="true" className="editor-tree-icon filled" size={18} strokeWidth={2.1} />
                          <strong>Nenhum trigger</strong>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
          ) : null}
        </WorkspaceExplorerRail>
        <section
          className={[
            "rooms-canvas-stage",
            focusSceneRoom ? "has-scene-actions" : "",
            focusMinimapAvailable && focusMinimapVisible && focusSceneRoom ? "has-focus-minimap" : ""
          ].filter(Boolean).join(" ")}
          aria-label={focusSceneRoom ? `Editor da cena ${sceneDisplayName(focusSceneRoom.name)}` : "Visão geral do projeto"}
          data-card-density={canvasVisualMetrics.cardDensity}
          data-zoom={`${canvasZoomPercent}%`}
          onPointerMove={continueSceneMapCardDrag}
          onPointerUp={endSceneMapCardDrag}
          ref={canvasStageRef}
        >
          {activeRoom ? (
            <>
              <div
                aria-label={focusSceneRoom ? "Ferramentas de edição da cena" : "Ferramentas da visão geral do projeto"}
                className={`room-editor-tool-rail${focusSceneRoom ? " is-scene-focus" : " is-scene-map"}`}
                data-editor-mode={focusSceneRoom ? "scene-editor" : "project-overview"}
              >
                <strong>Ferramentas do Editor</strong>
                <div className={`room-editor-tool-rail-stack${focusSceneRoom ? " is-scene-focus" : " is-scene-map"}`}>
                  <div className="room-editor-tool-rail-actions">
                    {!focusSceneRoom ? (
                      <div aria-label="Adicionar cenas" className="room-editor-tool-group room-editor-tool-group-add">
                        <span className="room-editor-tool-group-label">Adicionar</span>
                        <button
                          aria-label="Nova cena"
                          className="room-editor-tool-rail-add"
                          onClick={() => createRoomFromEditor()}
                          title="Nova cena em branco"
                          type="button"
                        >
                          <Plus aria-hidden="true" size={16} strokeWidth={2.3} />
                          <span>Nova cena</span>
                          <small>Em branco</small>
                        </button>
                        <EditorPopover label="Modelos" ariaLabel="Modelos de cena" closeOnAction>
                          {ROOM_PRESETS.map((preset) => <button key={preset.id} type="button"
                            onClick={() => createRoomFromPreset(preset.id)} title={preset.description}>{preset.label}</button>)}
                        </EditorPopover>
                      </div>
                    ) : null}
                    {focusSceneRoom ? (
                      <div aria-label="Ferramentas da cena" className="room-editor-tool-group room-editor-tool-group-focus">
                        <span className="room-editor-tool-group-label">Editar</span>
                        {roomEditorToolModes.map((mode) => {
                          const ToolIcon = mode.Icon;
                          const shortcut = editorToolShortcuts[mode.id] ?? mode.shortcut;
                          const shortcutLabel = formatRoomEditorShortcut(shortcut);
                          const unavailableReason = editorSceneProfile
                            ? roomToolUnavailableReason(mode.id, focusSceneRoom, editorSceneProfile.editorTools)
                            : null;
                          return (
                            <button
                              aria-label={unavailableReason
                                ? `${mode.label} - indisponível: ${unavailableReason}`
                                : `${mode.label} - ${mode.hint}`}
                              aria-keyshortcuts={roomEditorShortcutAriaKey(shortcut)}
                              aria-pressed={selectedToolPanelMode === mode.id}
                              className={selectedToolPanelMode === mode.id ? "active" : ""}
                              data-shortcut={shortcut}
                              disabled={Boolean(unavailableReason)}
                              key={mode.id}
                              onClick={() => setEditorToolPanelMode(mode.id)}
                              title={unavailableReason ?? `${mode.label}: ${mode.hint} · Atalho ${shortcutLabel}`}
                              type="button"
                            >
                              <ToolIcon aria-hidden="true" size={16} strokeWidth={2.2} />
                              <span>{mode.label}</span>
                              <small>{mode.hint}</small>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  {!focusSceneRoom ? (
                  <div className="room-editor-tool-rail-zoom rooms-canvas-zoom" role="group" aria-label="Zoom do canvas">
                  {!focusSceneRoom && onOrganizeSceneMap ? (
                    <button
                      aria-label="Organizar cards das cenas"
                      onClick={onOrganizeSceneMap}
                      title="Organizar cards por ordem e tamanho"
                      type="button"
                    >
                      <ListOrdered aria-hidden="true" size={14} strokeWidth={2.3} />
                      <span>Organizar</span>
                    </button>
                  ) : null}
                  <button
                    aria-label="Ajustar canvas às cenas visíveis"
                    onClick={fitSceneMapView}
                    title="Ajustar"
                    type="button"
                  >
                    <ScanSearch aria-hidden="true" size={14} strokeWidth={2.3} />
                    <span>Ajustar</span>
                  </button>
                  <button
                    aria-label="Reduzir zoom do canvas"
                    disabled={Boolean(focusSceneRoom && focusViewMode === "viewport") || canvasZoomIndex <= 0}
                    onClick={() => setCanvasZoomByStep(-1)}
                    title="Reduzir zoom"
                    type="button"
                  >
                    <ZoomOut aria-hidden="true" size={15} strokeWidth={2.3} />
                  </button>
                  <strong>{focusViewMode === "viewport" && focusViewportGeometry ? `${Math.round(focusViewportGeometry.scale * 100)}%` : `${canvasZoomPercent}%`}</strong>
                  <button
                    aria-label="Aumentar zoom do canvas"
                    disabled={Boolean(focusSceneRoom && focusViewMode === "viewport") || canvasZoomIndex >= ROOM_CANVAS_ZOOM_LEVELS.length - 1}
                    onClick={() => setCanvasZoomByStep(1)}
                    title="Aumentar zoom"
                    type="button"
                  >
                    <ZoomIn aria-hidden="true" size={15} strokeWidth={2.3} />
                  </button>
                  </div>
                  ) : null}
                </div>
              </div>
              {focusSceneRoom ? (
                <>
                  <RoomEditorSecondaryToolbar
                    canvasLayerLocks={canvasLayerLocks}
                    canvasLayerVisibility={canvasLayerVisibility}
                    collisionHoverPreviewEnabled={collisionHoverPreviewEnabled}
                    ghostOpacity={ghostOpacity}
                    ghostPreviewEnabled={ghostPreviewEnabled}
                    minimapAvailable={focusMinimapAvailable}
                    minimapVisible={focusMinimapVisible}
                    onClearCollision={clearCollisionForActiveRoom}
                    onSetActiveTileLayerMapping={onSetActiveTileLayerMapping}
                    onSetBorderCollision={setCollisionBorderForActiveRoom}
                    projectPath={projectPath}
                    room={activeRoom}
                    selectedCellIndex={activeSelectedCanvasCell?.cellIndex ?? null}
                    selectedCollisionType={selectedCollisionType}
                    selectedTileID={selectedTileID}
                    selectedTool={selectedTool}
                    selectedToolPanelMode={selectedToolPanelMode}
                    hudTools={<HudCanvasToolbar
                      preset={hudEditingPreset} canEdit={canEditHudCanvas} selectedComponentID={selectedHudComponentID}
                      onSelectComponent={setSelectedHudComponentID} onUpdateHudPreset={onUpdateHudPreset}
                      viewMode={hudViewMode} onViewMode={setHudViewMode}
                      gridVisible={canvasLayerVisibility.grid}
                      onToggleGrid={() => setCanvasLayerVisibility("grid", !canvasLayerVisibility.grid)}
                    />}
                    sceneActions={focusSceneRoom ? (
                      <>
                        <RoomSceneOverviewButton onClick={exitSceneFocus} />
                        <div className="room-focus-view-controls" role="group" aria-label="Visualização da cena">
                          <button type="button" aria-pressed={focusViewMode === "viewport"} onClick={() => setFocusViewMode("viewport")}>Tela ampliada</button>
                          <button type="button" aria-pressed={focusViewMode === "map"} disabled={false}
                            onClick={() => {
                              if (focusViewMode === "map") return;
                              const world = focusSceneWorldLogicalSize(focusSceneRoom);
                              const fitScale = Math.min(focusViewportAvailableSize.width / world.width, focusViewportAvailableSize.height / world.height);
                              const baseScale = Math.min(focusViewportAvailableSize.width / 240, focusViewportAvailableSize.height / 160);
                              setFocusSceneZoom(fitScale / baseScale);
                              setFocusViewMode("map");
                              window.requestAnimationFrame(() => { const scroll = canvasScrollRef.current; if (scroll) { scroll.scrollLeft = 0; scroll.scrollTop = 0; } });
                            }}>Mapa</button>
                        </div>
                        <button className="room-focus-preview-toggle" type="button" aria-label={`${focusMinimapVisible ? "Ocultar" : "Mostrar"} painel de prévia`}
                          aria-pressed={focusMinimapVisible} onClick={() => setFocusMinimapVisible(!focusMinimapVisible)}><Monitor size={14} aria-hidden="true" /><span>Prévia GBA</span></button>
                        <RoomEditorSceneActions
                          onRunRoom={() => testArrival ? onRunRoom(focusSceneRoom.id, focusSceneRoom.name, { x: testArrival.x!, y: testArrival.y!, direction: testArrival.direction ?? "down" }) : onRunRoom(focusSceneRoom.id, focusSceneRoom.name)}
                          room={focusSceneRoom}
                          testStartControl={<label className="room-test-start-control"><span>Início do teste</span><select aria-label="Início do teste da cena" value={testArrival?.id ?? ""} onChange={event => setTestArrivalID(event.currentTarget.value)}><option value="">{focusSceneRoom.isStart ? "Início do jogo" : "Posição padrão da cena"}</option>{incomingArrivals.map(link => <option key={link.id} value={link.id}>{link.from} · {link.eventName} · {link.x},{link.y}</option>)}</select></label>}
                          runRoomDisabled={runRoomDisabled}
                          menuScreens={sceneMenuScreens}
                          menuScreenID={selectedSceneMenuScreen?.id}
                          menuItemIndex={sceneMenuItemIndex}
                          onMenuScreenChange={(screenID) => { setSceneMenuScreenID(screenID); setSceneMenuItemIndex(0); }}
                          onMenuItemStep={(direction) => setSceneMenuItemIndex((current) => {
                            const count = selectedSceneMenuScreen?.items.length ?? 0;
                            return count ? (current + direction + count) % count : 0;
                          })}
                        />
                      </>
                    ) : null}
                    setCollisionHoverPreviewEnabled={setCollisionHoverPreviewEnabled}
                    setCanvasLayerLock={setCanvasLayerLock}
                    setCanvasLayerVisibility={setCanvasLayerVisibility}
                    setGhostOpacity={setGhostOpacity}
                    setGhostPreviewEnabled={setGhostPreviewEnabled}
                    setMinimapVisible={setFocusMinimapVisible}
                    setSelectedCollisionType={setSelectedCollisionType}
                    setSelectedTool={setSelectedTool}
                    videoModeId={presentation.videoModeId}
                    videoModeLabel={presentation.videoModeLabel}
                  />
                </>
              ) : null}
              <div
                aria-label={focusSceneRoom ? `Viewport GBA da cena ${sceneDisplayName(focusSceneRoom.name)}` : undefined}
                className={`rooms-canvas-viewport-host${focusSceneRoom ? ` is-focused-scene is-${focusViewMode}-view` : ""}`}
                data-view-mode={focusSceneRoom ? focusViewMode : undefined}
                style={focusSceneRoom && focusViewportGeometry ? { "--focus-camera-left": `${focusCameraOrigin.left * focusViewportGeometry.scale - focusMinimapViewport.left}px`, "--focus-camera-top": `${focusCameraOrigin.top * focusViewportGeometry.scale - focusMinimapViewport.top}px` } as CSSProperties : undefined}
                data-logical-height={focusSceneRoom ? GBA_VIEWPORT_PIXELS.height : undefined}
                data-logical-width={focusSceneRoom ? GBA_VIEWPORT_PIXELS.width : undefined}
                ref={focusViewportHostRef}
                role={focusSceneRoom ? "region" : undefined}
              >
              {focusSceneRoom?.sceneType === "isometric" || focusSceneRoom?.sceneType === "dungeonCrawler" ? (
                <span aria-hidden="true" className="room-isometric-viewport-label">
                  {focusSceneRoom.sceneType === "dungeonCrawler" ? "Viewport Play · 240×160 · primeira pessoa" : focusSceneZoom === 1 ? "Viewport Play · 240×160" : `Revisão da cena · ${Math.round(focusSceneZoom * 100)}%`}
                </span>
              ) : null}
              <div
                className={[
                  "rooms-canvas-world-scroll",
                  isCanvasPanning ? "panning" : "",
                  focusSceneRoom ? "is-focused-scene-viewport" : "",
                  !focusSceneRoom ? "is-scene-map-overview" : "",
                  focusViewportGeometry?.hasOverflow && !focusSceneUsesPseudo3dCamera ? "has-overflow" : ""
                ].filter(Boolean).join(" ")}
                onPointerDown={startRoomsCanvasPan}
                onPointerMove={continueRoomsCanvasPan}
                onPointerMoveCapture={rememberCanvasPointer}
                onPointerUp={endRoomsCanvasPan}
                onPointerCancel={endRoomsCanvasPan}
                ref={canvasScrollRef}
                style={focusViewportGeometry ? {
                  height: `${focusViewportGeometry.viewportHeight}px`,
                  width: `${focusViewportGeometry.viewportWidth}px`
                } : undefined}
              >
                <div
                  className={`rooms-canvas-world-scale-space${focusSceneRoom ? " is-focused-scene" : ""}`}
                  style={{
                    height: `${canvasWorldHeight}px`,
                    width: `${canvasWorldWidth}px`
                  }}
                >
                  <div
                    className={`rooms-canvas-world${focusSceneRoom ? " is-focused-scene" : ""}`}
                    data-scene-map-selection={!focusSceneRoom ? (sceneMapSelectionName ?? "") : undefined}
                    ref={canvasWorldRef}
                    style={{
                      height: `${canvasWorldHeight}px`,
                      width: `${canvasWorldWidth}px`,
                      ...(focusSceneRoom ? {} : canvasVisualMetrics.worldStyle)
                    }}
                  >
                    {focusSceneRoom && focusedSceneEditorCardSize ? (
                      <section aria-label={`Editor focado da cena ${sceneDisplayName(focusSceneRoom.name)}`} className="room-focused-scene-editor-frame">
                        {focusedSceneEditorElement}
                        {focusViewMode === "map" && canvasLayerVisibility.cameraBounds && focusViewportGeometry ? <div aria-label="Recorte da tela GBA no mapa"
                          className="room-focus-map-camera" style={{ left: focusCameraOrigin.left * focusViewportGeometry.scale, top: focusCameraOrigin.top * focusViewportGeometry.scale,
                            width: 240 * focusViewportGeometry.scale, height: 160 * focusViewportGeometry.scale }}><span>Tela GBA · 240 × 160</span></div> : null}
                      </section>
                    ) : (
                      <>
                    {roomCardConnectors.length ? (
                      <svg
                        aria-label="Conectores entre cenas"
                        className="room-card-connector-layer"
                        height={canvasWorldHeight}
                        role="img"
                        viewBox={`0 0 ${canvasWorldWidth} ${canvasWorldHeight}`}
                        width={canvasWorldWidth}
                      >
                        <defs>
                          <marker
                            id="room-card-connector-arrow"
                            markerHeight={canvasVisualMetrics.connectorMarkerSize}
                            markerUnits="userSpaceOnUse"
                            markerWidth={canvasVisualMetrics.connectorMarkerSize}
                            orient="auto"
                            refX="7"
                            refY="4"
                            viewBox="0 0 8 8"
                          >
                            <path d="M 0 0 L 8 4 L 0 8 z" />
                          </marker>
                        </defs>
                        {roomCardConnectors.map((connector) => (
                          <g key={connector.id}>
                            <path
                              aria-label={`Abrir transição ${connector.label}`}
                              className={[
                                "room-card-connector-path",
                                connector.connectionIndex !== null && selectedConnectionIndex === connector.connectionIndex ? "selected" : "",
                                connector.connectionIndex === null ? "derived" : ""
                              ].filter(Boolean).join(" ")}
                              data-connector-from={connector.from}
                              data-connector-to={connector.to}
                              d={connector.d}
                              markerEnd="url(#room-card-connector-arrow)"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (connector.connectionIndex !== null) {
                                  selectConnection(connector.connectionIndex);
                                } else if (connector.eventLink) {
                                  onOpenEvent?.(connector.eventLink.eventName, connector.eventLink.from);
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  if (connector.connectionIndex !== null) {
                                    selectConnection(connector.connectionIndex);
                                  } else if (connector.eventLink) {
                                    onOpenEvent?.(connector.eventLink.eventName, connector.eventLink.from);
                                  }
                                }
                              }}
                              role="button"
                              tabIndex={0}
                            />
                            {connector.showLabel ? <text className="room-card-connector-label" x={connector.labelX} y={connector.labelY}>
                              {connector.label}
                            </text> : null}
                          </g>
                        ))}
                      </svg>
                    ) : null}
                    {visibleSceneMapCards.map(({ cardSize, position, room, z }) => {
                      const roomEntities = presentation.entities.filter((entity) => entity.roomName === room.name);
                      const displayedPosition = displayedSceneMapPosition(position, canvasZoom);
                      return (
                        <div
                          className={[
                            "room-stage-card-frame",
                            selectedSceneMapRoomName === room.name || room.isActive ? "selected" : ""
                          ].filter(Boolean).join(" ")}
                          key={room.id}
                          ref={(element) => {
                            sceneMapCardFrameRefs.current[room.name] = element;
                          }}
                          onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            if (event.target instanceof HTMLElement && event.target.closest(".room-stage-card-canvas, .room-entity-canvas, button, input, select, textarea, [contenteditable='true']")) return;
                            startSceneMapCardDrag(room, event);
                            setSelectedSceneMapRoomName(room.name);
                            onSetActiveRoom(room.id, room.name);
                            setSelectedEntityKeys([]);
                            setSelectedConnectionIndex(null);
                          }}
                          style={{
                            left: `${displayedPosition.x}px`,
                            top: `${displayedPosition.y}px`,
                            zIndex: z
                          }}
                        >
                          <RoomSceneMapInactivePreview
                            cardSize={cardSize}
                            assetRefreshToken={assetRefreshToken}
                            connectionZones={deriveRoomConnectionAreasForRoom(room.name, presentation.connections)}
                            entities={roomEntities}
                            isActiveRoom={room.isActive}
                            onActivateRoom={() => onSetActiveRoom(room.id, room.name)}
                            onFocusScene={() => enterSceneFocus(room)}
                            onOpenContextMenu={(event) => openRoomContextMenu(event, room)}
                            onRunRoom={() => onRunRoom(room.id, room.name)}
                            runRoomDisabled={runRoomDisabled}
                            projectData={projectData}
                            projectPath={projectPath}
                            room={room}
                          />
                        </div>
                      );
                    })}
                      </>
                    )}
                  </div>
                </div>
              </div>
              {focusSceneRoom && canvasLayerVisibility.hud && (selectedToolPanelMode === "hud" ? focusSceneHudAuthoringBinding : focusSceneHudBinding) ? (
                <RoomHudOverlay
                  binding={(selectedToolPanelMode === "hud" ? focusSceneHudAuthoringBinding : focusSceneHudBinding)!}
                  entities={canvasLayerVisibility.actors ? presentation.entities.filter(entity => entity.roomName === focusSceneRoom.name) : []}
                  editable={selectedToolPanelMode === "hud" && hudViewMode === "edit"}
                  guides={selectedToolPanelMode === "hud" && hudViewMode === "edit"}
                  canEdit={canEditHudCanvas}
                  libraryPreview={Boolean(hudLibraryPreset && selectedToolPanelMode === "hud")}
                  onUpdateHudPreset={onUpdateHudPreset}
                  onSelectComponent={(componentID) => {
                    setSelectedHudComponentID(componentID);
                    setInspectorTabByContext((current) => ({ ...current, room: "hud" }));
                  }}
                  projectData={projectData}
                  projectPath={projectPath}
                  room={focusSceneRoom}
                  selectedComponentID={selectedHudComponentID}
                  viewportAnchored
                  viewportScale={focusViewportGeometry?.scale ?? 1}
                />
              ) : null}
              {focusSceneRoom && projectData && activeInspectorTab === "dialogues" && dialoguePreviewKey ? <DialogueScenePreview
                roomId={focusSceneRoom.id}
                projectData={projectData} projectPath={projectPath}
                dialogue={contextualDialogues?.dialogues.find(dialogue => dialogue.key === dialoguePreviewKey) ?? dialogueCatalog.find(dialogue => dialogue.key === dialoguePreviewKey)}
                scale={focusViewportGeometry?.scale ?? 1}
              /> : null}
              {canvasLayerVisibility.hud && focusSceneLutaHudAssetURL && typeof focusSceneLutaHudAssetName === "string" ? (
                <div
                  aria-label={`Prévia da HUD ${focusSceneRoom?.sceneType === "isometric" ? "tática" : "de luta"} ${focusSceneLutaHudAssetName}`}
                  className="room-hud-overlay is-viewport-anchored room-runtime-hud-overlay"
                  role="img"
                  style={{
                    height: `${160 * (focusViewportGeometry?.scale ?? 1)}px`,
                    width: `${240 * (focusViewportGeometry?.scale ?? 1)}px`
                  }}
                >
                  <img alt="" aria-hidden="true" src={focusSceneLutaHudAssetURL} />
                </div>
              ) : null}
              {focusSceneRoom ? (
                <div className="room-scene-navigation" aria-label="Camadas e navegação">
                  <span className="room-scene-navigation-size">{roomSceneResolutionLabel(focusSceneRoom)} px · {focusSceneRoom.width} × {focusSceneRoom.height} {focusSceneRoom.sceneType === "isometric" ? "células" : "tiles"}</span>
                    <RoomEditorCanvasControls
                      canvasLayerLocks={canvasLayerLocks} canvasLayerVisibility={canvasLayerVisibility}
                      minimapAvailable={focusMinimapAvailable} minimapVisible={focusMinimapVisible}
                      hideMinimapToggle
                      room={focusSceneRoom} setCanvasLayerLock={setCanvasLayerLock}
                      setCanvasLayerVisibility={setCanvasLayerVisibility} setMinimapVisible={setFocusMinimapVisible}
                    />
                  <div className="room-scene-navigation-zoom rooms-canvas-zoom" role="group" aria-label="Zoom do canvas">
                  {focusViewMode === "viewport" ? <span className="room-focus-display-scale">240 × 160 · {Math.round((focusViewportGeometry?.scale ?? 1) * 100)}%</span> : <>
                  {!focusSceneRoom && onOrganizeSceneMap ? (
                    <button
                      aria-label="Organizar cards das cenas"
                      onClick={onOrganizeSceneMap}
                      title="Organizar cards por ordem e tamanho"
                      type="button"
                    >
                      <ListOrdered aria-hidden="true" size={14} strokeWidth={2.3} />
                      <span>Organizar</span>
                    </button>
                  ) : null}
                  <button
                    aria-label="Ajustar canvas às cenas visíveis"
                    onClick={fitSceneMapView}
                    title="Ajustar"
                    type="button"
                  >
                    <ScanSearch aria-hidden="true" size={14} strokeWidth={2.3} />
                    <span>Ajustar</span>
                  </button>
                  <button
                    aria-label="Reduzir zoom do canvas"
                    disabled={canvasZoomIndex <= 0}
                    onClick={() => setCanvasZoomByStep(-1)}
                    title="Reduzir zoom"
                    type="button"
                  >
                    <ZoomOut aria-hidden="true" size={15} strokeWidth={2.3} />
                  </button>
                  <strong>{`${canvasZoomPercent}%`}</strong>
                  <button
                    aria-label="Aumentar zoom do canvas"
                    disabled={canvasZoomIndex >= ROOM_CANVAS_ZOOM_LEVELS.length - 1}
                    onClick={() => setCanvasZoomByStep(1)}
                    title="Aumentar zoom"
                    type="button"
                  >
                    <ZoomIn aria-hidden="true" size={15} strokeWidth={2.3} />
                  </button>
                  </>}
                  </div>
                </div>
              ) : null}
              {focusMinimapVisible && focusSceneRoom ? <FocusScenePreviewPanel onClose={() => setFocusMinimapVisible(false)}
                preview={focusNativePreview}
                minimap={focusMinimapAvailable ? <div className="room-focus-minimap-dock"><RoomFocusMinimap
                  entities={presentation.entities.filter((entity) => entity.roomName === focusSceneRoom.name)} onNavigate={navigateFocusMinimap}
                  projectData={projectData} projectPath={projectPath} room={focusSceneRoom}
                  viewport={focusMinimapViewport} worldHeight={canvasWorldHeight} worldWidth={canvasWorldWidth}
                /></div> : null} /> : null}
              </div>
            </>
          ) : (
            <p className="muted">Crie uma cena para abrir o editor visual.</p>
          )}
        </section>

        {hardwareProfiler ? <RoomHardwareDebugger presentation={hardwareProfiler} /> : null}

        <EditorSideStack
          ariaLabel="Painel lateral do Editor"
          className="rooms-side-stack"
          hideProjectPane
          workspaceId="rooms"
          inspectorPane={navigatorTab === "logic" && projectData ? (logicSelection ? (logicSelection.kind === "script" ? <section className="logic-script-inspector"><div className="rooms-inspector-context"><h4>{logicSelection.name}</h4><p>Script do projeto</p></div>{renderEventInspector?.(logicSelection.name, "Script do projeto")}</section> : <LogicValueInspector key={`${logicSelection.kind}:${logicSelection.name}`} projectData={projectData} selection={logicSelection} onUpdate={(name, kind, patch) => { onUpdateLogicValue?.(name, kind, patch); if (patch.name && !listProjectVariables(projectData).some(item => item.name === patch.name) && patch.name.trim()) setLogicSelection({kind,name:patch.name.trim()}); }} onRemove={onRemoveLogicValue} />) : <section className="logic-value-inspector"><h4>Lógica do projeto</h4><p className="muted">Selecione uma variável, script ou constante no navegador para editar suas propriedades.</p></section>) : inspectorRoom ? (
            <>
              <div className="rooms-inspector-context">
                <div className="rooms-inspector-header">
                  <div>
                    <h4>{inspectorTitle}</h4>
                    <p>{inspectorSubtitle}</p>
                  </div>
                  <div className="rooms-inspector-header-badges">
                    {inspectorRoleBadge ? <em>{inspectorRoleBadge}</em> : null}
                    {inspectorContext.kind === "room" && markerText(inspectorRoom.isActive, inspectorRoom.isStart) ? <em>{markerText(inspectorRoom.isActive, inspectorRoom.isStart)}</em> : null}
                    {focusedEditorRoom && inspectorContext.kind !== "room" ? <button className="room-inspector-scene-return" aria-label="Propriedades da cena"
                      title="Propriedades da cena" onClick={openFocusedSceneInspector} type="button"><MapIcon aria-hidden="true" size={15}/></button> : null}
                  </div>
                </div>
                {visibleInspectorTabs.length ? <RoomInspectorNavigation
                  key={inspectorContextKind}
                  title={inspectorTitle} tabs={visibleInspectorTabs}
                  activeTab={activeInspectorTab && (activeInspectorTab !== "scene" || inspectorContext.kind === "room") ? activeInspectorTab : null}
                  onSelect={(tab) => {
                    if (tab === "scene" && (inspectorContext.kind !== "room" || selectedToolPanelMode === "hud")) {
                      openFocusedSceneInspector(); return;
                    }
                    setInspectorTabByContext((current) => ({ ...current, [inspectorContextKind]: tab }));
                  }}
                /> : null}
                {!focusedEditorRoom && inspectorContext.kind === "room" ? <div className="room-overview-scene-actions">
                  <button aria-label={`Abrir editor da cena ${sceneDisplayName(inspectorRoom.name)}`} className="primary-action"
                    onClick={() => enterSceneFocus(inspectorRoom)} type="button"><Pencil aria-hidden="true" size={14} />Editar cena</button>
                  <button disabled={runRoomDisabled} onClick={() => onRunRoom(inspectorRoom.id, inspectorRoom.name)} type="button"><Play aria-hidden="true" size={14} />Testar cena</button>
                </div> : null}
              </div>
              <div
                aria-labelledby={activeInspectorTab ? `rooms-inspector-tab-${activeInspectorTab}` : undefined}
                className="rooms-inspector-tab-panel"
                id={activeInspectorTab ? `rooms-inspector-panel-${activeInspectorTab}` : undefined}
                role={activeInspectorTab ? "tabpanel" : undefined}
              >
                  {selectedArrival && activeInspectorTab === "connections" ? <section className="room-arrival-inspector" aria-label="Chegada de transição">
                <h4>Chegada de transição</h4>
                <p>{selectedArrival.from} → {selectedArrival.to}</p>
                <p>Script: {selectedArrival.eventName} · evento {(selectedArrival.stepIndex ?? 0) + 1}</p>
                <p>Esta posição pertence à transição e será usada no jogo exportado.</p>
                <label>X<input aria-label="X da chegada de transição" type="number" min={0} max={focusSceneRoom!.width - 1} value={selectedArrival.x ?? 0} onChange={event => { const x = Number(event.currentTarget.value); if (Number.isInteger(x) && x >= 0 && x < focusSceneRoom!.width) updateSelectedArrival({ x }); }} /></label>
                <label>Y<input aria-label="Y da chegada de transição" type="number" min={0} max={focusSceneRoom!.height - 1} value={selectedArrival.y ?? 0} onChange={event => { const y = Number(event.currentTarget.value); if (Number.isInteger(y) && y >= 0 && y < focusSceneRoom!.height) updateSelectedArrival({ y }); }} /></label>
                <label>Direção<select aria-label="Direção da chegada de transição" value={selectedArrival.direction ?? "down"} onChange={event => updateSelectedArrival({ direction: event.currentTarget.value as RoomEventSceneLink["direction"] })}><option value="down">Baixo</option><option value="up">Cima</option><option value="left">Esquerda</option><option value="right">Direita</option></select></label>
                <button type="button" onClick={() => onOpenEvent?.(selectedArrival.eventName, selectedArrival.from)}>Editar evento de transição</button>
                <button type="button" onClick={() => setTestArrivalID(selectedArrival.id)}>Usar como início do teste</button>
                <button type="button" onClick={() => setSelectedArrivalID(null)}>Fechar chegada</button>
              </section> : null}
              {activeInspectorTab === "dialogues" && (inspectorContext.kind === "room" || inspectorContext.kind === "entity") ? (
                    <RoomDialoguesInspector
                      key={dialogueContextKey}
                      selectionName={inspectorContext.kind === "entity" ? selectedInspectorEntities.map(entity => entity.name).join(", ") : undefined}
                      appearance={projectData && onUpdateDialoguesUi ? <DialogueAppearanceInspector roomId={inspectorRoom.id} projectPath={projectPath} onUpdateInterfaceTheme={onUpdateInterfaceTheme} projectData={projectData} onUpdateDialoguesUi={onUpdateDialoguesUi} onImportAssets={onImportAssets} /> : undefined}
                      onPreviewChange={setDialoguePreviewKey}
                      catalog={dialogueCatalog}
                      focusedDialogueKey={inspectorContext.kind === "room" && (inspectorRoom.id === focusedTargetID || inspectorRoom.name === focusedTargetName) ? focusedDialogueKey : null}
                      focusRequestID={dialogueFocusRequestID}
                      onCreateDialogue={onCreateDialogue} onDuplicateDialogue={onDuplicateDialogue}
                      onRemoveDialogue={onRemoveDialogue} onNormalizeDialogue={onNormalizeDialogue}
                      onImportAssets={onImportAssets} onOpenDialogueEvent={name => onOpenEvent?.(name, inspectorRoom.name)}
                      usages={dialogueUsages} sceneUsageNames={dialogueSceneNames} characterProfiles={dialogueProfiles}
                      variables={projectData ? listProjectVariables(projectData).map(option => option.name) : []}
                      actorOptions={contextualDialogues?.actors ?? []}
                      assetOptions={dialogueAssetOptions}
                      dialogues={dialogueScope.dialogues}
                      missingDialogueKeys={dialogueScope.missing.map(reference => reference.key)}
                      onOpenDialoguesWorkspace={onOpenDialoguesWorkspace}
                      onUpdateDialogue={onUpdateDialogue}
                      sfxOptions={dialogueSfxOptions}
                    />
                  ) : null}
              {activeInspectorTab === "dialogues" ? null : inspectorContext.kind === "height" ? (
                roomHeightInspector(
                  inspectorRoom,
                  inspectorSelectedCanvasCell?.cellIndex ?? null,
                  selectedHeightLevel,
                  setSelectedHeightLevel
                )
              ) : inspectorContext.kind === "collision" ? (
                roomCollisionInspector(
                  inspectorRoom,
                  inspectorSelectedCanvasCell?.cellIndex ?? null,
                  selectedCollisionType,
                  collisionPlacementMode,
                  onSetCollisionType,
                  setCollisionPlacementMode,
                  setSelectedCollisionType,
                  collisionHoverPreviewEnabled,
                  setCollisionBorderForActiveRoom,
                  clearCollisionForActiveRoom
                )
              ) : inspectorContext.kind === "entity" ? (
                <RoomEntitiesEditor
                  activeTab={activeInspectorTab ?? (inspectorContext.entity.kind === "actor" ? "actor" : "trigger")}
                  commandSuggestions={commandSuggestions}
                  eventOptions={eventReferenceOptions}
                  hasMixedEntitySelection={inspectorHasMixedEntityGroup}
                  inspectorKind={inspectorContext.entity.kind}
                  lockedEntityKeys={lockedEntityKeys}
                  mixedEntitySelectionCount={selectedInspectorEntities.length}
                  onAlignRoomEntities={onAlignRoomEntities}
                  onDistributeRoomEntities={onDistributeRoomEntities}
                  onDuplicateRoomEntities={onDuplicateRoomEntities}
                  onNudgeRoomEntities={onNudgeRoomEntities}
                  onCreateBoundEventsForTargets={onCreateBoundEventsForTargets}
                  onCreateEventReference={onCreateEventReference}
                  onCreateTrigger={(options) => {
                    const createdTriggerID = onCreateTrigger(options);
                    if (createdTriggerID) {
                      setInspectorTabByContext((current) => ({ ...current, trigger: "area" }));
                    }
                    return createdTriggerID;
                  }}
                  onOpenEvent={onOpenEvent}
                  onRemoveRoomEntities={onRemoveRoomEntities}
                  onSetEventUpdateFrequency={onSetEventUpdateFrequency}
                  onUpdateRoomEntity={onUpdateRoomEntity}
                  onUpdateRoomFields={onUpdateRoomFields}
                  presentation={presentation}
                  projectData={projectData}
                  renderEventInspector={renderEventInspector}
                  room={resolvedPresentation.rooms.find((room) => room.name === inspectorContext.entity.roomName) ?? inspectorRoom}
                  selectedEntityKeys={selectedEntityKeys}
                  selectedEntityTool={selectedEntityTool}
                  setSelectedEntityKeys={selectRoomEntityKeys}
                  setSelectedEntityTool={setSelectedEntityTool}
                />
              ) : inspectorContext.kind === "connection" ? (
                roomConnectionInspector(
                  inspectorContext.connection,
                  presentation,
                  inspectorRoom,
                  eventReferenceOptions,
                  selectedConnectionZoneSide,
                  setSelectedConnectionZoneSide,
                  onCreateEventReference,
                  onUpdateRoomConnection,
                  removeSelectedConnection,
                  activeInspectorTab ?? "connection"
                )
              ) : inspectorContext.kind === "paint" ? (
                <RoomPaintPaletteInspector
                  backgroundAssets={presentation.options.backgroundAssets}
                  onImportTileset={onImportTileset}
                  onImportTiledMap={onImportTiledMap}
                  onUpdateRoomFields={onUpdateRoomFields}
                  projectPath={projectPath}
                  room={inspectorRoom}
                  selectedCellIndex={inspectorSelectedCanvasCell?.cellIndex ?? null}
                  selectedTileID={selectedTileID}
                  selectedTileStamp={selectedTileStamp}
                  selectedTool={selectedTool}
                  setSelectedTileID={setSelectedTileID}
                  setSelectedTileStamp={setSelectedTileStamp}
                  setSelectedTool={setSelectedTool}
                  videoModeId={presentation.videoModeId}
                  videoModeLabel={presentation.videoModeLabel}
                />
              ) : (
                <>
                  {activeInspectorTab === "scene" ? <>
                  <section className="hud-authoring-section room-scene-hud-summary" aria-label="Resumo da HUD da cena">
                    <div><strong>HUD da cena</strong><span>{roomRuntimeHudAsset(inspectorRoom) ? `HUD ${inspectorRoom.sceneType === "isometric" ? "tática" : "de luta"} · ${roomRuntimeHudAsset(inspectorRoom)}` : inspectorHudBinding?.preset.name ?? "Sem HUD"}</span></div>
                    <button type="button" onClick={() => { enterSceneFocus(inspectorRoom); setEditorToolPanelMode("hud"); setCanvasLayerVisibilityState(current => ({ ...current, hud: true })); }}>Editar HUD</button>
                  </section>
                  {inspectorRoom.warnings.length ? (
                    <div className="room-warnings inspector">
                      {inspectorRoom.warnings.map((warning) => (
                        <p key={`${inspectorRoom.id}-${warning}`}>{warning}</p>
                      ))}
                    </div>
                  ) : null}</> : null}
                  {activeInspectorTab === "budget" && projectBudget ? (
                    <RoomProjectBudgetPanel
                      analysisError={budgetAnalysisError}
                      generatedAt={budgetAnalysisGeneratedAt}
                      onAnalyze={onAnalyzeProjectBudget}
                      presentation={projectBudget}
                      running={budgetAnalysisRunning}
                    />
                  ) : null}
                  {activeInspectorTab && activeInspectorTab !== "connections" && activeInspectorTab !== "budget" && activeInspectorTab !== "events" && (activeInspectorTab !== "hud" || selectedToolPanelMode !== "hud")
                    ? roomDetailsEditor(
                      inspectorRoom,
                      presentation.options,
                      onUpdateRoomFields,
                      projectData,
                      activeInspectorTab,
                      inspectorScenePreflight,
                      onOpenProjectHealth
                    )
                    : null}
                  {activeInspectorTab === "hud" && selectedToolPanelMode === "hud" && hudInspectorRoom ? (
                    <HudSceneInspector
                      readOnly={canvasLayerLocks.hud}
                      onUpdateInterfaceTheme={onUpdateInterfaceTheme}
                      binding={hudAppliedBinding}
                      previewPreset={hudLibraryPreset}
                      onPreviewPreset={setHudLibraryPresetID}
                      onBindHud={onBindHud}
                      onCreateHudVariationForRoom={onCreateHudVariationForRoom}
                      onSelectComponent={setSelectedHudComponentID}
                      onUpdateHudPreset={onUpdateHudPreset}
                      onSetActiveHudPreset={onSetActiveHudPreset}
                      onDuplicateHudPreset={onDuplicateHudPreset}
                      onRemoveHudPreset={onRemoveHudPreset}
                      onImportAssets={onImportAssets}
                      editingSharedPresetID={editingSharedHudID}
                      onEditSharedPreset={setEditingSharedHudID}
                      presets={hudPresentation?.presets ?? []}
                      activePresetID={hudPresentation?.activePresetId ?? ""}
                      projectData={projectData}
                      projectPath={projectPath}
                      room={hudInspectorRoom}
                      selectedComponentID={selectedHudComponentID}
                      viewMode={hudViewMode}
                      onViewMode={setHudViewMode}
                      screenID={hudMenuScreenID || undefined}
                      screens={focusSceneMenuConfig?.screens?.length ? [{ id: "", title: focusSceneMenuConfig.title || "Tela principal" }, ...focusSceneMenuConfig.screens] : undefined}
                      onSelectScreen={id => { setHudMenuScreenID(id); setHudLibraryPresetID(null); setSelectedHudComponentID(null); }}
                      unavailableReason={hudUnavailableReason}
                    />
                  ) : null}
                  {activeInspectorTab === "connections" && !selectedArrival ? roomConnectionsEditor(
                    inspectorRoom,
                    presentation,
                    eventReferenceOptions,
                    selectedConnectionTarget,
                    setSelectedConnectionTarget,
                    connectionEventName,
                    setConnectionEventName,
                    selectedConnectionIndex,
                    selectConnection,
                    onCreateEventReference,
                    createConnectionFromRoom,
                    removeSelectedConnection,
                    selectedToolPanelMode === "warp"
                  ) : null}
                  {activeInspectorTab === "events" && inspectorContext.kind === "room" ? sceneEventInspector : null}

                </>
              )}
              </div>
            </>
          ) : (
            <p className="muted">Sem cena ativa.</p>
          )}
        />
      </div>
    </section>
  );
}
