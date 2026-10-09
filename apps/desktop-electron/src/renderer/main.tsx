import { createAudioInstrumentFromChannel, updateAudioInstrumentInProject, removeAudioInstrumentFromProject, type UpdateAudioInstrumentFields } from "../shared/audioInstruments.js";
import { audioPhysicalChannel } from "../shared/audioContract.js";
import { listLogicValueUsages, updateLogicValueInProject, type LogicValuePatch } from "../shared/logicWorkspace";
import { updateInterfaceThemeInProject, type InterfaceThemeChange } from "../shared/interfaceThemes";
import { dialogueEditorScene } from "../shared/dialogueSceneAuthoring";
import { bindSceneHudInProject, createSceneHudVariationInProject, hudPresetUsages } from "../shared/hudSceneAuthoring";
import { executeSceneReviewAction, type SceneActionRequest, type SceneActionOutcome, type SceneActionAuditEntry } from "../shared/sceneActionRouting.js";
import React, { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  appendImportedAssetsToProject,
  duplicateAssetInProject,
  moveAssetsToGroupInProject,
  removeAssetsFromProject,
  removeAssetFromProject,
  renameAssetsWithPatternInProject,
  renameAssetInProject,
  repairAssetGroupReferencesInProject,
  replaceAssetFileInProject,
  resolveAssetSourcePath,
  updateAssetKindsInProject
} from "../shared/filesWorkspace";
import { applyImportedAnimationToCutscene } from "../shared/cutsceneAnimationImport";
import {
  updateEditorSceneOrganizationInProject,
  type EditorSceneOrganization
} from "../shared/editorProjectRail";
import {
  applyAudioPatternPresetInProject,
  clearAudioPatternSequenceInProject,
  createAudioChannelInProject,
  createAudioPatternInProject,
  createAudioItemInProject,
  duplicateAudioItemInProject,
  duplicateAudioPatternInProject,
  moveAudioChannelNoteInProject,
  moveAudioPatternOrderSlotInProject,
  nextAudioChannelTypePreset,
  normalizeAudioInProject,
  removeAudioChannelFromProject,
  removeAudioItemFromProject,
  removeAudioPatternFromProject,
  renameAudioPatternInProject,
  renameAudioItemInProject,
  setActiveAudioPatternInProject,
  suggestAudioItemName,
  transposeAudioChannelInProject,
  transposeAudioChannelNoteInProject,
  updateAudioChannelFieldsInProject,
  updateAudioChannelNoteInProject,
  updateAudioItemFieldsInProject,
  updateAudioPatternOrderSlotInProject,
  type UpdateAudioItemFields
} from "../shared/audioWorkspace";
import {
  addEventStepInProject,
  bindEventToTargetInProject,
  createBoundEventsForTargetsInProject,
  connectEventGraphNodesInProject,
  createBoundEventForTargetInProject,
  createEventInProject,
  createEventWithGraphPositionInProject,
  deriveEventsWorkspacePresentation,
  duplicateEventInProject,
  removeEventFromProject,
  removeEventGraphEdgeInProject,
  removeEventStepInProject,
  removeEventTargetBindingInProject,
  insertEventStepsInProject,
  retargetEventGraphEdgeInProject,
  renameEventInProject,
  relayoutEventsGraphInProject,
  setEventUpdateFrequencyInProject,
  updateEventFieldsInProject,
  updateEventGraphNodePositionInProject,
  updateEventStepInProject,
  type BindEventToTargetOptions,
  type ConnectEventGraphNodesOptions,
  type RemoveEventGraphEdgeOptions,
  type RetargetEventGraphEdgeOptions,
  type UpdateEventFields,
  type UpdateEventGraphNodePosition,
  type UpdateEventStepFields
} from "../shared/eventsWorkspace";
import type { EventStructureInsertionTarget } from "../shared/eventStructure";
import { updateSceneRouteTableInProject, type SceneRouteTablePatch } from "../shared/sceneRouteTables";
import {
  createProjectVariableInProject,
  listProjectVariables,
  removeProjectVariableFromProject,
  type ProjectVariableKind
} from "../shared/variablesWorkspace";
import {
  connectDialogueToStartEventInProject,
  createDialogueInProject,
  duplicateDialogueInProject,
  normalizeDialogueInProject,
  removeDialogueFromProject,
  updateDialogueInProject,
  updateDialoguesUiInProject,
  type UpdateDialogueFields,
  type UpdateDialoguesUiFields
} from "../shared/dialoguesWorkspace";
import {
  createAdvancedHudPresetInProject,
  deriveHudPresetsWorkspacePresentation,
  duplicateHudPresetInProject,
  removeHudPresetInProject,
  setActiveHudPresetInProject,
  updateHudPresetInProject,
  type UpdateHudPresetFields
} from "../shared/hudPresets";
import type {
  AppCommand,
  OpenProjectResult,
  SaveProjectResult,
  ValidateSettingsPathsResult
} from "../shared/ipc";
import { summarizeGBAProject, type ParsedGBAProject } from "../shared/projectFile";
import {
  createProjectPrefabFromEntity,
  instantiateProjectPrefab,
  synchronizeProjectPrefabInstances,
  updateProjectPrefab,
  type ProjectPrefabKind,
  type ProjectPrefabPlacement
} from "../shared/projectPrefabs";
import {
  pushProjectHistory,
  redoProjectHistory,
  updateProjectHistoryPresent,
  undoProjectHistory
} from "../shared/projectHistory";
import { canDiscardUnsavedChangesAsync } from "../shared/unsavedChanges";
import {
  applyRoomCollisionFillInProject,
  applyRoomTileBrushInProject,
  alignRoomEntitiesInProject,
  createRoomConnectionInProject,
  createRoomWarpConnectionInProject,
  createRoomInProject,
  createActorInProject,
  createTriggerInProject,
  distributeRoomEntitiesInProject,
  duplicateRoomEntitiesInProject,
  duplicateRoomInProject,
  nudgeRoomEntitiesInProject,
  placeRoomEntityInRoomInProject,
  removeRoomEntitiesInProject,
  removeRoomFromProject,
  removeRoomConnectionFromProject,
  updateRoomConnectionInProject,
  renameRoomInProject,
  resizeRoomTriggerToTileInProject,
  setActiveRoomInProject,
  setActiveTileLayerMappingInProject,
  setStartRoomInProject,
  setRoomCollisionCellInProject,
  setRoomCollisionTypeInProject,
  setRoomHeightLevelInProject,
  toggleRoomCollisionCellInProject,
  updateRoomBackgroundTilesetGridInProject,
  updateRoomEntityInProject,
  updateRoomFieldsInProject,
  organizeSceneMapPositionsInProject,
  updateSceneMapPositionInProject,
  type RoomCollisionType,
  type RoomConnectionArea,
  type RoomTileBrushOptions,
  type RoomPresetID,
  type RoomsWorkspaceEntityKind,
  type CreateActorInProjectOptions,
  type CreateTriggerInProjectOptions,
  type PlaceRoomEntityInRoomOptions,
  type ResizeRoomTriggerToTileOptions,
  type UpdateRoomBackgroundTilesetGridFields,
  type UpdateRoomConnectionFields,
  type UpdateRoomEntityFields,
  type UpdateRoomFields
} from "../shared/roomsWorkspace";
import { importTiledMapIntoProject } from "../shared/tiledImport";
import type { SceneMapPosition } from "../shared/sceneMapLayout";
import {
  deriveSettingsPathValidationTargets,
  resetSettingsSectionInProject,
  updateSettingsFieldInProject,
  type SettingsEditableField,
  type SettingsEditableValue,
  type SettingsSectionID,
  type SettingsWorkspaceScope
} from "../shared/settingsWorkspace";
import { mcpEnginePackPath } from "../shared/mcpSettings";
import {
  addSpriteMetaspriteTileInProject,
  copySpriteAnimationGeometryToSheetSiblingsInProject,
  createSpriteAnimationInProject,
  duplicateSpriteAnimationInProject,
  fitSpriteAnimationHitboxToVisibleTilesInProject,
  generateSpriteFromReferenceInProject,
  moveSpriteMetaspriteTilesInProject,
  removeSpriteMetaspriteTilesInProject,
  removeSpriteMetaspriteTileInProject,
  removeSpriteAnimationFromProject,
  renameSpriteAnimationInProject,
  reorderSpriteMetaspriteTilesInProject,
  toggleSpriteMetaspriteTilesFlipInProject,
  updateSpriteAnimationFieldsInProject,
  updateSpriteAnimationStateInProject,
  updateSpriteMetaspriteTileInProject,
  updateSpriteMetaspriteFrameInProject,
  type AddSpriteMetaspriteTileOptions,
  type MoveSpriteMetaspriteTilesOptions,
  type RemoveSpriteMetaspriteTileOptions,
  type ReorderSpriteMetaspriteTilesOptions,
  type ToggleSpriteMetaspriteTilesFlipOptions,
  type UpdateSpriteAnimationFields,
  type UpdateSpriteAnimationStateFields,
  type UpdateSpriteMetaspriteTileOptions,
  type UpdateSpriteMetaspriteFrameOptions
} from "../shared/spritesWorkspace";
import { droppedProjectPath, type DroppedFileLike } from "../shared/dropProject";
import { deriveProjectActionMenuItems, type ProjectActionID } from "../shared/projectActions";
import {
  projectAssetReferenceOptions,
  projectAudioReferenceOptions,
  projectRoomReferenceOptions
} from "../shared/projectReferenceOptions";
import {
  projectReferenceDeletionGuard,
  type ProjectReferenceTarget
} from "../shared/projectReferenceUsages";
import {
  AlertTriangle,
  Activity,
  Archive,
  Command,
  Disc3,
  FolderOpen,
  Globe,
  Maximize2,
  MoreHorizontal,
  Play,
  Redo2,
  Save,
  Undo2,
  X
} from "lucide-react";
import { studioWordmarkURL } from "./brandingAssets";
import { AudioWorkspace } from "./audioWorkspace";
import { WorkspaceAdvancedTools } from "./contextualAdvancedTools";
import { DialoguesWorkspace } from "./dialoguesWorkspace";
import { EventInspectorPanel } from "./eventsWorkspace";
import { updateMenuSliderItemInProject, type MenuSliderItemPatch } from "../shared/menuSlider";
import { runFilesImportFlow } from "./filesImportFlow";
import { FilesWorkspace, type FilesWorkspaceOpenRequest } from "./filesWorkspace";
import {
  resolvePersistedProjectPathAfterSave,
  resolveProjectSessionPathAfterDataCommit
} from "../shared/projectImportPath";
import { buildProjectFromTemplate, type ProjectTemplateID } from "../shared/projectTemplates";
import {
  exportArtifactFeedback,
  saveProjectFeedback,
  settingsPathValidationFeedback,
  type FeedbackMessage
} from "../shared/feedbackMessages";
import {
  deserializeProjectPluginRegistry,
  emptyProjectPluginRegistry,
  type ProjectPluginRegistry
} from "../shared/gbaStudioPlugins";
import { PluginCatalogModal } from "./PluginCatalogModal";
import { saveNewProjectSession } from "./newProjectCreationFlow";
import { selectProjectSessionRoom, type ProjectSession } from "./projectSession";
import { copyName, uniqueDefaultRoomName, droppedFiles, statusText } from "./rendererHelpers";
import { RoomsWorkspace } from "./roomsWorkspace";
import { SettingsWorkspace } from "./settingsWorkspace";
import { SpritesWorkspace } from "./spritesWorkspace";
import { TestingDiagnosticsDrawer } from "./testingDiagnosticsDrawer";
import { StudioThemeToggle } from "./StudioThemeToggle";
import { WelcomeScreen } from "./WelcomeScreen";
import { useEngineActions } from "./useEngineActions";
import { resetExportSettingsPageInProject } from "../shared/exportSettingsLayout";
import { useWorkspacePresentations } from "./useWorkspacePresentations";
import { workspaceIcons, workspaceNames, type WorkspaceName } from "./workspaceNavigation";
import type { RoomInspectorTabID } from "../shared/roomInspectorTabs";
import { deriveWindowDocumentState } from "../shared/windowDocumentState";
import {
  deriveAdvancedToolsPresentation,
  enableAdvancedToolInProject,
  saveInputReplayInProject,
  type AdvancedToolID
} from "../shared/advancedTools";
import {
  appendInputReplayFrame,
  createInputReplay,
  inputFrameFromBitmasks,
  inputReplayStartRoom,
  type InputReplay
} from "../shared/inputReplay";
import {
  appendHardwareProfilerFrame,
  createHardwareProfilerSession,
  type HardwareProfilerSession
} from "../shared/hardwareProfilerSessions";
import { StudioProviders } from "./studioProviders";
import { useStudioDialog } from "./studioDialog";
import { useStudioToast } from "./studioToast";
import { StudioStatusBar, WorkspaceEmptyState } from "./studioUi";
import {
  ProjectProblemsDrawer,
  StudioCommandPalette,
  WorkspaceNavigationTrail,
  type StudioCommandAction
} from "./StudioShellOverlays";
import { StudioLanguageSwitcher, projectActionLabelKey, useStudioI18n, workspaceLabelKey } from "./i18n";
import { deriveProjectProblems, type ProjectProblem } from "../shared/projectProblems";
import { deriveProjectHealthReport } from "../shared/projectHealth";
import { clampSceneMapZoom } from "../shared/sceneMapLayout";
import { readSceneMapViewZoom, writeSceneMapViewZoom } from "./sceneMapViewPreferences";
import { deriveHardwareProfilerPresentation, type RomPlayerTelemetryEvent } from "../shared/hardwareProfiler";
import { applyStudioUiFontSize, readStudioUiFontSize } from "../shared/studioUiFontSize";
import { applyStudioUiAppearance, readStudioUiAppearance } from "../shared/studioUiAppearance";
import "./styles.css";

applyStudioUiFontSize(readStudioUiFontSize());
applyStudioUiAppearance(readStudioUiAppearance());

const projectActionIcons: Record<ProjectActionID, React.ReactElement> = {
  "create-backup": <Archive aria-hidden="true" strokeWidth={2.2} />,
  "export-rom-engine": <Disc3 aria-hidden="true" strokeWidth={2.2} />,
  "export-web": <Globe aria-hidden="true" strokeWidth={2.2} />,
  "close-project": <X aria-hidden="true" strokeWidth={2.2} />
};

type ToolbarMenuActionID = "save" | "open" | "commands" | "focus" | "diagnostics";

function App(): React.ReactElement {
  const { t } = useStudioI18n();
  const [session, setSession] = useState<ProjectSession | null>(null);
  const dialogueSessionRef = useRef(session);
  dialogueSessionRef.current = session;
  const projectHistoryGroupRef = useRef<{ changed: boolean; id: string } | null>(null);
  const [externalAssetRevision, setExternalAssetRevision] = useState(0);
  const [sceneMapView, setSceneMapView] = useState<{ path?: string; zoom: number } | null>(null);
  const [pluginRegistry, setPluginRegistry] = useState<ProjectPluginRegistry | null>(null);
  const [pluginCatalogOpen, setPluginCatalogOpen] = useState(false);
  const [status, setStatus] = useState(() => t("app.readyToOpen"));
  const { confirm, prompt } = useStudioDialog();
  const { pushToast } = useStudioToast();
  const readyStatusRef = useRef(t("app.readyToOpen"));
  const workspaceListRef = useRef<HTMLElement | null>(null);

  const confirmDiscard = useCallback(async (): Promise<boolean> => {
    return canDiscardUnsavedChangesAsync(session, (message) =>
      confirm(message, {
        title: "Alteracoes nao salvas",
        confirmLabel: "Continuar sem salvar",
        variant: "danger"
      })
    );
  }, [session, confirm]);

  function notifySuccess(message: string): void {
    setStatus(message);
    pushToast(message, { kind: "success" });
  }

  function notifyError(message: string): void {
    setStatus(message);
    pushToast(message, { kind: "error" });
  }

  function blockReferencedDeletion(target: ProjectReferenceTarget): boolean {
    if (!session) return true;
    const guard = projectReferenceDeletionGuard(session.project.data, target);
    if (guard.canDelete) return false;
    notifyError(guard.message ?? `Nao foi possivel remover ${target.name}.`);
    return true;
  }

  function publishStatus(message: string, tone: "info" | "success" | "error" = "info"): void {
    if (tone === "success") {
      notifySuccess(message);
      return;
    }
    if (tone === "error") {
      notifyError(message);
      return;
    }
    setStatus(message);
  }

  function publishFeedback(feedback: FeedbackMessage): void {
    publishStatus(feedback.message, feedback.tone);
  }
  const [projectActionsOpen, setProjectActionsOpen] = useState(false);
  const [settingsPathValidation, setSettingsPathValidation] = useState<ValidateSettingsPathsResult | null>(null);
  const [settingsPathValidationRunning, setSettingsPathValidationRunning] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceName>("Arquivos");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [testingDiagnosticsOpen, setTestingDiagnosticsOpen] = useState(false);
  const [romPlayerTelemetry, setRomPlayerTelemetry] = useState<RomPlayerTelemetryEvent | null>(null);
  const [hardwareProfilerSession, setHardwareProfilerSession] = useState(() => createHardwareProfilerSession("play-session"));
  const [hardwareProfilerHistory, setHardwareProfilerHistory] = useState<HardwareProfilerSession[]>([]);
  const lastProfiledFrame = useRef(-1);
  const archivedProfilerWindow = useRef<number | null>(null);
  const [inputRecording, setInputRecording] = useState(false);
  const [inputReplaySession, setInputReplaySession] = useState<InputReplay | null>(null);
  const lastRecordedInputFrame = useRef(-1);
  const [focusMode, setFocusMode] = useState(false);
  const [navigationTrail, setNavigationTrail] = useState<{
    currentLabel: string;
    sourceLabel: string;
    sourceWorkspace: WorkspaceName;
  } | null>(null);
  const [focusedAssetRequest, setFocusedAssetRequest] = useState<FilesWorkspaceOpenRequest | null>(null);
  const [focusedExportSectionRequest, setFocusedExportSectionRequest] = useState<{ sectionID: "health"; requestID: number } | null>(null);
  const [focusedEventRequest, setFocusedEventRequest] = useState<{ eventName: string; requestID: number } | null>(null);
  const appCommandHandler = useRef<(command: AppCommand) => void>(() => undefined);
  const projectMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusedEventRequestSequence = useRef(0);
  const launchProjectLoaded = useRef(false);
  const [sceneActionHistory, setSceneActionHistory] = useState<SceneActionAuditEntry[]>([]);
  useEffect(() => { setSceneActionHistory([]); }, [session?.path]);
  const [sceneDialogueFocus, setSceneDialogueFocus] = useState<{ key: string; requestID: number } | null>(null);
  const [pendingFocusInspectorTab, setPendingFocusInspectorTab] = useState<RoomInspectorTabID | null>(null);

  useEffect(() => {
    void loadLaunchProject();
  }, []);

  function openEventsInspector(eventName?: string): void {
    setPendingFocusInspectorTab("events");
    requestAnimationFrame(() => {
      setSelectedWorkspace("Editor");
      setStatus(eventName ? `Evento aberto no inspetor: ${eventName}.` : "Aba Eventos aberta no inspetor.");
    });
  }

  function openProjectHealth(): void {
    setFocusedExportSectionRequest({ sectionID: "health", requestID: Date.now() });
    setNavigationTrail({
      currentLabel: "Saúde do projeto",
      sourceLabel: "Editor",
      sourceWorkspace: "Editor"
    });
    setSelectedWorkspace("Exportar");
    setStatus("Saúde do projeto aberta.");
  }

  useEffect(() => {
    const nextReadyStatus = t("app.readyToOpen");
    setStatus((current) => current === readyStatusRef.current ? nextReadyStatus : current);
    readyStatusRef.current = nextReadyStatus;
  }, [t]);

  useEffect(() => {
    const activeWorkspace = workspaceListRef.current?.querySelector<HTMLElement>("[aria-current='page']");
    activeWorkspace?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedWorkspace]);

  useEffect(() => {
    return window.gbaStudio.onAppCommand((command) => appCommandHandler.current(command));
  }, []);

  useEffect(() => {
    return window.gbaStudio.onRomPlayerTelemetry((telemetry) => {
      setRomPlayerTelemetry((current) => {
        if (telemetry.state === "running" && telemetry.stats) return telemetry;
        if (telemetry.state === "closed" && current?.windowID === telemetry.windowID) return telemetry;
        return current;
      });
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && !event.altKey && key === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      if (event.key === "Escape") {
        setCommandPaletteOpen(false);
        setProblemsOpen(false);
        setTestingDiagnosticsOpen(false);
        if (projectActionsOpen) {
          setProjectActionsOpen(false);
          projectMenuButtonRef.current?.focus();
        }
        return;
      }
      const isProjectUndo = (event.metaKey || event.ctrlKey) && !event.altKey && key === "z";
      if (!isProjectUndo) return;

      event.preventDefault();
      if (event.shiftKey) {
        redoProjectEdit();
      } else {
        undoProjectEdit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [projectActionsOpen, session]);

  useEffect(() => {
    if (!projectActionsOpen) return;

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest(".project-action-menu-wrap")) return;
      setProjectActionsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [projectActionsOpen]);

  useEffect(() => {
    return window.gbaStudio.onExternalProjectOpen((result) => {
      void (async () => {
        if (await confirmDiscard()) {
          applyOpenProjectResult(result);
        }
      })();
    });
  }, [confirmDiscard, session]);

  useEffect(() => {
    return window.gbaStudio.onExternalAssetChange((change) => {
      if (!session?.path || change.projectPath !== session.path) return;
      setExternalAssetRevision((current) => current + 1);
      setStatus(`Assets externos atualizados: ${change.relativePaths.join(", ")}.`);
    });
  }, [session?.path]);

  useEffect(() => {
    void window.gbaStudio.setWindowDocumentState(deriveWindowDocumentState(session
      ? {
          dirty: session.dirty,
          path: session.path,
          projectName: session.project.summary.name
        }
      : null));
  }, [session]);

  useEffect(() => {
    const handleDragOver = (event: DragEvent): void => {
      event.preventDefault();
    };
    const handleDrop = (event: DragEvent): void => {
      event.preventDefault();
      void (async () => {
        const projectPath = droppedProjectPath(droppedFiles(event));
        if (!projectPath || !(await confirmDiscard())) return;
        void window.gbaStudio.openProjectAtPath(projectPath).then(applyOpenProjectResult);
      })();
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [confirmDiscard, session]);

  const presentationSession = useDeferredValue(session);

  const {
    audioPresentation,
    contractDiagnostics,
    dialoguesPresentation,
    filesPresentation,
    projectHealthReport,
    projectData,
    roomsPresentation,
    settingsPresentation,
    spritesPresentation
  } = useWorkspacePresentations(presentationSession, selectedWorkspace, pluginRegistry);
  const eventsPresentation = useMemo(
    () => projectData ? deriveEventsWorkspacePresentation(projectData) : null,
    [projectData]
  );
  const authoringReferenceOptions = useMemo(() => projectData ? {
    assets: projectAssetReferenceOptions(projectData),
    audio: projectAudioReferenceOptions(projectData),
    rooms: projectRoomReferenceOptions(projectData)
  } : { assets: [], audio: [], rooms: [] }, [projectData]);
  const advancedToolsPresentation = useMemo(
    () => deriveAdvancedToolsPresentation(projectData ?? {}),
    [projectData]
  );
  const activeSceneType = useMemo(() => {
    const activeRoomType = roomsPresentation?.rooms.find((room) => room.isActive)?.sceneType;
    if (activeRoomType) return activeRoomType;
    const activeScene = projectData?.scena;
    if (!activeScene || typeof activeScene !== "object" || Array.isArray(activeScene)) return null;
    const sceneType = (activeScene as Record<string, unknown>).sceneType;
    return typeof sceneType === "string" ? sceneType : null;
  }, [projectData, roomsPresentation]);
  const deferredProblemData = useDeferredValue(projectData);
  const projectProblems = useMemo(
    () => deferredProblemData ? deriveProjectProblems(deferredProblemData) : [],
    [deferredProblemData]
  );
  const projectHealthExportReady = useMemo(
    () => deferredProblemData ? deriveProjectHealthReport(deferredProblemData).exportReady : null,
    [deferredProblemData]
  );

  async function refreshProjectPlugins(projectPath: string | undefined): Promise<void> {
    if (!projectPath) {
      setPluginRegistry(null);
      return;
    }

    const result = await window.gbaStudio.loadProjectPlugins({ projectPath });
    if (!result.ok || !result.registry) {
      setPluginRegistry(emptyProjectPluginRegistry());
      if (result.error) {
        setStatus(`Plugins: ${result.error}`);
      }
      return;
    }

    setPluginRegistry(deserializeProjectPluginRegistry(result.registry));
  }

  useEffect(() => {
    void refreshProjectPlugins(session?.path);
  }, [session?.path]);

  const {
    analyzeProjectBudget,
    audioPreviewStopRequest,
    buildDryRunResult,
    buildDryRunRunning,
    buildResult,
    buildRunning,
    clearEngineSessionState,
    doctorResult,
    doctorRunning,
    exportEngineProject,
    exportRunning,
    exportWebProject,
    generateRom,
    generateRomDisabled,
    hasEngineAssetc,
    hasEngineBuild,
    hasCurrentEngineExport,
    engineStatus,
    playProject,
    playProjectBlockedReasonText,
    playProjectDisabled,
    playRunning,
    projectBudgetAnalysis,
    projectBudgetAnalysisRunning,
    runBuildDryRun,
    runBuildRom,
    runDoctor,
  } = useEngineActions({
    contractDiagnosticsOK: contractDiagnostics?.ok ?? null,
    projectHealthExportReady,
    publishStatus,
    session,
    setStatus
  });
  const hardwareProfiler = useMemo(
    () => projectData
      ? deriveHardwareProfilerPresentation(projectData, {
        romBytes: buildResult?.summary?.romBytes,
        assetPackReport: projectBudgetAnalysis?.report,
        telemetry: romPlayerTelemetry?.state === "running" ? romPlayerTelemetry.stats : null
      })
      : null,
    [buildResult?.summary?.romBytes, projectBudgetAnalysis?.report, projectData, romPlayerTelemetry]
  );
  useEffect(() => {
    const runtime = romPlayerTelemetry?.stats?.runtimeState;
    if (!runtime || !hardwareProfiler || runtime.frame === lastProfiledFrame.current) return;
    lastProfiledFrame.current = runtime.frame;
    const physicalMetric = (id: "vramBytes" | "oam" | "dmaBytes") => {
      const metric = hardwareProfiler.physical.metrics.find((entry) => entry.id === id);
      return metric?.measured ?? metric?.planned ?? metric?.estimate ?? 0;
    };
    setHardwareProfilerSession((current) => appendHardwareProfilerFrame(current, {
      frame: runtime.frame,
      roomIndex: runtime.currentRoom,
      runtime: hardwareProfiler.activeRoomType,
      sceneName: hardwareProfiler.activeRoomName,
      cpu: romPlayerTelemetry?.stats?.cpuPercent ?? 0,
      dma: physicalMetric("dmaBytes"),
      vram: physicalMetric("vramBytes"),
      oam: physicalMetric("oam"),
      scanline: runtime.timing.renderSkipCount
    }));
  }, [hardwareProfiler, romPlayerTelemetry]);
  useEffect(() => {
    if (
      romPlayerTelemetry?.state !== "closed"
      || archivedProfilerWindow.current === romPlayerTelemetry.windowID
      || hardwareProfilerSession.frames.length === 0
    ) return;
    archivedProfilerWindow.current = romPlayerTelemetry.windowID;
    setHardwareProfilerHistory((current) => [...current.slice(-9), hardwareProfilerSession]);
    setHardwareProfilerSession(createHardwareProfilerSession(`play-${Date.now()}`));
    lastProfiledFrame.current = -1;
  }, [hardwareProfilerSession, romPlayerTelemetry]);
  useEffect(() => {
    const runtime = romPlayerTelemetry?.stats?.runtimeState;
    if (!inputRecording || !runtime || runtime.frame === lastRecordedInputFrame.current) return;
    lastRecordedInputFrame.current = runtime.frame;
    setInputReplaySession((current) => current
      ? appendInputReplayFrame(
        current,
        inputFrameFromBitmasks(runtime.input.held, runtime.input.pressed),
        {
          room: String(runtime.currentRoom),
          variables: Object.fromEntries(runtime.variables.map((value, index) => [`v${index}`, value]))
        }
      )
      : current);
  }, [inputRecording, romPlayerTelemetry]);

  const projectActionItems = useMemo(() => deriveProjectActionMenuItems({
    hasSession: session !== null,
    hasProjectPath: Boolean(session?.path),
    hasEngineAssetc,
    hasEngineBuild,
    contractDiagnosticsOK: contractDiagnostics?.ok ?? null,
    projectHealthExportReady,
    buildRunning,
    exportRunning
  }), [buildRunning, contractDiagnostics?.ok, exportRunning, hasEngineAssetc, hasEngineBuild, projectHealthExportReady, session]);
  const localizedProjectActionItems = useMemo(
    () => projectActionItems.map((item) => ({ ...item, label: t(projectActionLabelKey(item.id)) })),
    [projectActionItems, t]
  );

  const statusBusy = playRunning || buildRunning || exportRunning || doctorRunning || buildDryRunRunning || settingsPathValidationRunning;

  function applyOpenProjectResult(result: OpenProjectResult): void {
    setStatus(statusText(result));
    if (!result.canceled && result.project) {
      const openedProject = result.project;
      startTransition(() => {
        projectHistoryGroupRef.current = null;
        setSession({ path: result.path, project: openedProject, dirty: false, redoStack: [], undoStack: [] });
        setSceneActionHistory([]);
        setPendingFocusInspectorTab(null);
        setSettingsPathValidation(null);
        setFocusedAssetRequest(null);
        setFocusedEventRequest(null);
        setSelectedWorkspace("Editor");
      });
    }
  }

  async function openProject(): Promise<void> {
    if (!(await confirmDiscard())) return;
    const result = await window.gbaStudio.openProject();
    applyOpenProjectResult(result);
  }

  async function openRecentProject(path: string): Promise<void> {
    if (!(await confirmDiscard())) return;
    const result = await window.gbaStudio.openProjectAtPath(path);
    applyOpenProjectResult(result);
  }

  async function loadLaunchProject(): Promise<void> {
    if (launchProjectLoaded.current) return;
    launchProjectLoaded.current = true;

    const result = await window.gbaStudio.getLaunchProject();
    if (result.canceled) return;

    if (!result.error) {
      applyOpenProjectResult(result);
    } else {
      setStatus(statusText(result));
    }
  }

  async function installProjectPlugin(): Promise<void> {
    if (!session?.path) {
      setStatus("Salve o projeto antes de instalar plugins.");
      return;
    }

    const selection = await window.gbaStudio.selectPath({
      title: "Instalar plugin",
      mode: "file-or-directory",
      defaultPath: session.path,
      filters: [{ name: "Plugin ZIP", extensions: ["zip"] }]
    });
    if (selection.canceled || !selection.path) return;

    const result = await window.gbaStudio.installProjectPlugin({
      projectPath: session.path,
      sourcePath: selection.path,
      replacingExisting: await confirm("Substituir instalacao existente se o plugin ja estiver no projeto?", {
        title: "Instalar plugin",
        confirmLabel: "Substituir"
      })
    });
    if (!result.ok) {
      setStatus(result.error ?? "Falha ao instalar plugin.");
      return;
    }

    if (result.registry) {
      setPluginRegistry(deserializeProjectPluginRegistry(result.registry));
    } else {
      await refreshProjectPlugins(session.path);
    }
    const importedCount = result.importedAssets?.length ?? 0;
    const importedSuffix = importedCount > 0 ? ` · ${importedCount} asset(s) importado(s)` : "";
    notifySuccess((result.pluginId ? `Plugin instalado: ${result.pluginId}` : "Plugin instalado.") + importedSuffix);
  }

  async function saveProject(): Promise<void> {
    if (!session) return;
    const result = await window.gbaStudio.saveProject(session);
    publishFeedback(saveProjectFeedback(result));
    if (!result.canceled && result.path) {
      setSession({ ...session, path: result.path, dirty: false });
    }
  }

  async function saveProjectAs(): Promise<void> {
    if (!session) return;
    const result = await window.gbaStudio.saveProject({ project: session.project });
    publishFeedback(saveProjectFeedback(result));
    if (!result.canceled && result.path) {
      setSession({ ...session, path: result.path, dirty: false });
    }
  }

  async function createBackup(): Promise<void> {
    if (!session) return;
    const result = await window.gbaStudio.saveProject({ project: session.project });
    if (result.canceled) {
      setStatus("Criacao de backup cancelada.");
      return;
    }
    if (result.error || !result.path) {
      notifyError(result.error ?? "Falha ao criar backup.");
      return;
    }

    notifySuccess(`Backup criado: ${result.path}`);
  }

  async function closeProject(): Promise<void> {
    if (!(await confirmDiscard())) return;
    projectHistoryGroupRef.current = null;
    setSession(null);
    setSceneActionHistory([]);
    setPendingFocusInspectorTab(null);
    setSettingsPathValidation(null);
    clearEngineSessionState();
    setProjectActionsOpen(false);
    setFocusedAssetRequest(null);
    setFocusedEventRequest(null);
    notifySuccess("Projeto fechado.");
  }

  function openAssetWorkspaceFromFiles(request: FilesWorkspaceOpenRequest): void {
    setPendingFocusInspectorTab(null);
    setFocusedAssetRequest(request);
    if (request.workspace === "Eventos" && request.targetName) {
      setFocusedEventRequest({
        eventName: request.targetName,
        requestID: request.requestID
      });
    }
    setNavigationTrail({
      currentLabel: request.label,
      sourceLabel: `Arquivos · ${request.assetName}`,
      sourceWorkspace: "Arquivos"
    });
    if (request.workspace === "Eventos") {
      openEventsInspector(request.targetName ?? undefined);
    } else {
      setSelectedWorkspace(request.workspace);
    }
    setStatus(`Arquivo aberto em ${request.workspace}: ${request.assetName}.`);
  }

  function runProjectAction(actionID: ProjectActionID): void {
    setProjectActionsOpen(false);
    if (actionID === "create-backup") {
      void createBackup();
    } else if (actionID === "export-rom-engine") {
      void generateRom();
    } else if (actionID === "export-web") {
      void exportWebProject();
    } else if (actionID === "close-project") {
      void closeProject();
    }
  }

  function runToolbarMenuAction(actionID: ToolbarMenuActionID): void {
    setProjectActionsOpen(false);
    if (actionID === "save") {
      void saveProject();
    } else if (actionID === "open") {
      void openProject();
    } else if (actionID === "commands") {
      setCommandPaletteOpen(true);
    } else if (actionID === "focus") {
      setFocusMode((current) => !current);
    } else if (actionID === "diagnostics") {
      setTestingDiagnosticsOpen(true);
    }
  }

  appCommandHandler.current = (command: AppCommand) => {
    if (command === "project:open") {
      void openProject();
    } else if (command === "project:save") {
      void saveProject();
    } else if (command === "project:save-as") {
      void saveProjectAs();
    } else if (command === "engine:export") {
      void exportEngineProject();
    } else if (command === "project:play") {
      void playProject();
    } else if (command === "project:export-rom") {
      void generateRom();
    } else if (command === "project:install-plugin") {
      void installProjectPlugin();
    } else if (command === "project:plugin-catalog") {
      if (!session?.path) {
        setStatus("Salve o projeto antes de abrir o catalogo de plugins.");
        return;
      }
      setPluginCatalogOpen(true);
    } else if (command === "edit:undo") {
      undoProjectEdit();
    } else if (command === "edit:redo") {
      redoProjectEdit();
    } else if (command === "window:request-close") {
      void (async () => {
        await window.gbaStudio.confirmWindowClose(await confirmDiscard());
      })();
    }
  };

  function commitProjectData(
    nextData: ParsedGBAProject["data"],
    options?: { dirty?: boolean; historyGroupID?: string; path?: string }
  ): void {
    if (!session) return;
    const activeHistoryGroup = options?.historyGroupID
      && projectHistoryGroupRef.current?.id === options.historyGroupID
      ? projectHistoryGroupRef.current
      : null;
    const history = activeHistoryGroup?.changed
      ? updateProjectHistoryPresent({
        present: session.project.data,
        redoStack: session.redoStack,
        undoStack: session.undoStack
      }, nextData)
      : pushProjectHistory({
        present: session.project.data,
        redoStack: session.redoStack,
        undoStack: session.undoStack
      }, nextData);
    if (activeHistoryGroup && history.present !== session.project.data) {
      activeHistoryGroup.changed = true;
    }
    setSession({
      ...session,
      dirty: options?.dirty ?? true,
      path: resolveProjectSessionPathAfterDataCommit(session.path, options?.path),
      project: {
        data: history.present,
        summary: summarizeGBAProject(history.present)
      },
      redoStack: history.redoStack,
      undoStack: history.undoStack
    });
  }

  function beginProjectHistoryGroup(id: string): void {
    if (!session) return;
    projectHistoryGroupRef.current = { changed: false, id };
  }

  function endProjectHistoryGroup(id: string): void {
    if (projectHistoryGroupRef.current?.id === id) {
      projectHistoryGroupRef.current = null;
    }
  }

  function updateProjectData(
    nextData: ParsedGBAProject["data"],
    options?: { historyGroupID?: string }
  ): void {
    commitProjectData(nextData, options);
  }

  function updateSceneOrganization(organization: EditorSceneOrganization): void {
    if (!session) return;
    const nextData = updateEditorSceneOrganizationInProject(session.project.data, organization);
    if (nextData !== session.project.data) {
      commitProjectData(nextData);
    }
  }

  function enableAdvancedTool(toolID: AdvancedToolID): void {
    if (!session) return;
    commitProjectData(enableAdvancedToolInProject(session.project.data, toolID));
    setStatus("Ferramenta adicionada ao projeto.");
  }

  function toggleInputRecording(): void {
    if (inputRecording) {
      if (session && inputReplaySession) {
        commitProjectData(saveInputReplayInProject(session.project.data, inputReplaySession));
        notifySuccess(`Replay salvo com ${inputReplaySession.frameCount} frames.`);
      }
      setInputRecording(false);
      return;
    }
    if (!session) return;
    const nextData = enableAdvancedToolInProject(session.project.data, "inputReplay");
    if (nextData !== session.project.data) commitProjectData(nextData);
    const runtime = romPlayerTelemetry?.stats?.runtimeState;
    setInputReplaySession(createInputReplay({
      id: `replay-${Date.now()}`,
      seed: Date.now() >>> 0,
      initialVariables: Object.fromEntries((runtime?.variables ?? []).map((value, index) => [`v${index}`, value]))
    }));
    lastRecordedInputFrame.current = -1;
    setInputRecording(true);
    setStatus("Gravação de inputs iniciada.");
  }

  function runReplay(replay: InputReplay): void {
    void playProject({
      replay,
      roomName: inputReplayStartRoom(replay)
    });
  }

  function undoProjectEdit(): void {
    if (!session) return;
    projectHistoryGroupRef.current = null;
    const history = undoProjectHistory({
      present: session.project.data,
      redoStack: session.redoStack,
      undoStack: session.undoStack
    });
    if (history.present === session.project.data) return;
    setSession({
      ...session,
      dirty: true,
      project: {
        data: history.present,
        summary: summarizeGBAProject(history.present)
      },
      redoStack: history.redoStack,
      undoStack: history.undoStack
    });
    setStatus("Alteracao desfeita.");
  }

  function redoProjectEdit(): void {
    if (!session) return;
    projectHistoryGroupRef.current = null;
    const history = redoProjectHistory({
      present: session.project.data,
      redoStack: session.redoStack,
      undoStack: session.undoStack
    });
    if (history.present === session.project.data) return;
    setSession({
      ...session,
      dirty: true,
      project: {
        data: history.present,
        summary: summarizeGBAProject(history.present)
      },
      redoStack: history.redoStack,
      undoStack: history.undoStack
    });
    setStatus("Alteracao refeita.");
  }

  async function createProject(projectName: string, templateID: ProjectTemplateID = "exemplo-gba"): Promise<void> {
    const data = buildProjectFromTemplate(templateID, { name: projectName });
    const { saveResult, session: createdSession } = await saveNewProjectSession({
      data,
      summary: summarizeGBAProject(data)
    }, (request) => window.gbaStudio.saveProject(request));
    if (!createdSession) {
      publishFeedback(saveProjectFeedback(saveResult));
      return;
    }

    setSession(createdSession);
    setSceneActionHistory([]);
    setPendingFocusInspectorTab(null);
    setSettingsPathValidation(null);
    clearEngineSessionState();
    setFocusedAssetRequest(null);
    setFocusedEventRequest(null);
    setSelectedWorkspace("Editor");
    notifySuccess(`Template ${templateID} criado em ${createdSession.path}.`);
  }

  async function renameAsset(assetID: string, currentName: string): Promise<void> {
    if (!session) return;
    const nextName = await prompt("Novo nome do asset", currentName);
    if (nextName === null) return;
    const nextData = renameAssetInProject(session.project.data, assetID, nextName);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      notifySuccess(`Asset renomeado para ${nextName.trim()}.`);
    }
  }

  async function removeAsset(assetID: string, currentName: string): Promise<void> {
    if (!session) return;
    if (blockReferencedDeletion({ kind: "asset", id: assetID, name: currentName })) return;
    if (!(await confirm(`Remover o asset "${currentName}" do projeto?`, { variant: "danger", title: "Remover asset" }))) return;
    const nextData = removeAssetFromProject(session.project.data, assetID);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      notifySuccess(`Asset removido: ${currentName}.`);
    }
  }

  async function duplicateAsset(assetID: string, currentName: string): Promise<void> {
    if (!session) return;
    const defaultName = copyName(currentName);
    const nextName = await prompt("Nome do asset duplicado", defaultName);
    if (nextName === null) return;
    const nextData = duplicateAssetInProject(session.project.data, {
      sourceAssetID: assetID,
      newAssetID: globalThis.crypto.randomUUID(),
      newName: nextName
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Asset duplicado: ${nextName.trim()}.`);
    }
  }

  function moveAssetsInBatch(assetIDs: string[], groupID: string | null): void {
    if (!session) return;
    const nextData = moveAssetsToGroupInProject(session.project.data, assetIDs, groupID);
    if (nextData === session.project.data) return;
    updateProjectData(nextData);
    notifySuccess(`${assetIDs.length} assets organizados.`);
  }

  function convertAssetsInBatch(assetIDs: string[], kind: string): void {
    if (!session) return;
    const nextData = updateAssetKindsInProject(session.project.data, assetIDs, kind);
    if (nextData === session.project.data) return;
    updateProjectData(nextData);
    notifySuccess(`${assetIDs.length} assets convertidos para ${kind}.`);
  }

  async function renameAssetsInBatch(assetIDs: string[]): Promise<void> {
    if (!session) return;
    const prefix = await prompt("Prefixo para os nomes selecionados", "");
    if (prefix === null) return;
    const suffix = await prompt("Sufixo para os nomes selecionados", "");
    if (suffix === null || (!prefix && !suffix)) return;
    const nextData = renameAssetsWithPatternInProject(session.project.data, assetIDs, { prefix, suffix });
    if (nextData === session.project.data) return;
    updateProjectData(nextData);
    notifySuccess(`${assetIDs.length} assets renomeados.`);
  }

  async function removeAssetsInBatch(assetIDs: string[]): Promise<void> {
    if (!session || assetIDs.length === 0) return;
    const selectedAssets = (Array.isArray(session.project.data.assets) ? session.project.data.assets : [])
      .filter((asset): asset is Record<string, unknown> => Boolean(asset) && typeof asset === "object" && !Array.isArray(asset))
      .filter((asset) => assetIDs.includes(String(asset.id ?? "")));
    for (const asset of selectedAssets) {
      if (blockReferencedDeletion({ kind: "asset", id: String(asset.id ?? ""), name: String(asset.name ?? "Asset") })) return;
    }
    if (!(await confirm(`Remover ${selectedAssets.length} assets selecionados do projeto?`, { variant: "danger", title: "Remover assets" }))) return;
    const nextData = removeAssetsFromProject(session.project.data, assetIDs);
    if (nextData === session.project.data) return;
    updateProjectData(nextData);
    notifySuccess(`${selectedAssets.length} assets removidos.`);
  }

  function repairAssetReferences(): void {
    if (!session) return;
    const count = filesPresentation?.missingGroupAssetReferenceCount ?? 0;
    const nextData = repairAssetGroupReferencesInProject(session.project.data);
    updateProjectData(nextData);
    notifySuccess(`${count} referências inválidas reparadas.`);
  }

  async function replaceAssetFile(assetID: string, currentName: string): Promise<void> {
    if (!session) return;
    const currentAsset = (Array.isArray(session.project.data.assets) ? session.project.data.assets : [])
      .find((asset) => (
        asset && typeof asset === "object" && !Array.isArray(asset)
        && String((asset as Record<string, unknown>).id ?? "") === assetID
      )) as Record<string, unknown> | undefined;
    const metadata = currentAsset?.metadata && typeof currentAsset.metadata === "object" && !Array.isArray(currentAsset.metadata)
      ? currentAsset.metadata as Record<string, unknown>
      : {};
    const replaceRelativePath = typeof metadata.source === "string" ? metadata.source : undefined;
    const flow = await runFilesImportFlow({
      projectPath: session.path,
      saveProject: () => window.gbaStudio.saveProject(session),
      importAssets: (request) => window.gbaStudio.importAssets({ ...request, replaceRelativePath }),
      onSaveResult: (saveResult) => {
        publishFeedback(saveProjectFeedback(saveResult));
        if (saveResult.canceled) pushToast("Salvamento cancelado.", { kind: "info" });
        if (!saveResult.canceled && !saveResult.error && saveResult.path) {
          setSession({ ...session, path: saveResult.path, dirty: false });
        }
      }
    });
    if (!flow) return;
    const { projectPath, result } = flow;
    if (result.canceled) {
      setStatus("Substituicao cancelada.");
      pushToast("Substituicao cancelada.", { kind: "info" });
      return;
    }
    if (result.error) {
      notifyError(result.error);
      return;
    }
    const replacements = result.assets ?? [];
    if (replacements.length !== 1) {
      notifyError("Selecione exatamente um arquivo para substituir o asset.");
      return;
    }
    const nextData = replaceAssetFileInProject(session.project.data, assetID, replacements[0]);
    if (nextData === session.project.data) return;
    commitProjectData(nextData, { path: projectPath });
    notifySuccess(`Arquivo de ${currentName} substituído sem quebrar referências.`);
  }

  async function importAssets(): Promise<void> {
    if (!session) return;
    const flow = await runFilesImportFlow({
      projectPath: session.path,
      saveProject: () => window.gbaStudio.saveProject(session),
      importAssets: (request) => window.gbaStudio.importAssets(request),
      onSaveResult: (saveResult) => {
        publishFeedback(saveProjectFeedback(saveResult));
        if (saveResult.canceled) pushToast("Salvamento cancelado.", { kind: "info" });
        if (!saveResult.canceled && !saveResult.error && saveResult.path) {
          setSession({ ...session, path: saveResult.path, dirty: false });
        }
      }
    });
    if (!flow) return;
    const { projectPath, result } = flow;
    if (result.canceled) {
      setStatus("Importação cancelada.");
      pushToast("Importação cancelada.", { kind: "info" });
      return;
    }

    if (result.error) {
      notifyError(result.error);
      return;
    }

    const importedAssets = result.assets ?? [];
    if (importedAssets.length === 0) {
      notifyError("Nenhum asset importado.");
      return;
    }

    commitProjectData(appendImportedAssetsToProject(session.project.data, importedAssets), { path: projectPath });
    const plural = importedAssets.length === 1 ? "" : "s";
    notifySuccess(`${importedAssets.length} asset${plural} importado${plural}.`);
  }

  async function importGifAnimation(): Promise<void> {
    if (!session) return;
    const activeScene = session.project.data.scena;
    if (!activeScene || typeof activeScene !== "object" || Array.isArray(activeScene)) {
      notifyError("Abra uma cena Cutscene antes de importar uma animação GIF.");
      return;
    }
    const activeSceneRecord = activeScene as Record<string, unknown>;
    if (activeSceneRecord.sceneType !== "cutscene") {
      notifyError("A animação GIF é aplicada automaticamente à cena Cutscene ativa.");
      return;
    }
    const targetRoomID = typeof activeSceneRecord.id === "string" && activeSceneRecord.id.trim()
      ? activeSceneRecord.id
      : typeof activeSceneRecord.name === "string" ? activeSceneRecord.name : "";
    if (!targetRoomID) {
      notifyError("A cena Cutscene ativa não possui uma identificação válida.");
      return;
    }

    const flow = await runFilesImportFlow({
      projectPath: session.path,
      saveProject: () => window.gbaStudio.saveProject(session),
      importAssets: (request) => window.gbaStudio.importAssets({ ...request, scope: "animation" }),
      onSaveResult: (saveResult) => {
        publishFeedback(saveProjectFeedback(saveResult));
        if (saveResult.canceled) pushToast("Salvamento cancelado.", { kind: "info" });
        if (!saveResult.canceled && !saveResult.error && saveResult.path) {
          setSession({ ...session, path: saveResult.path, dirty: false });
        }
      }
    });
    if (!flow) return;
    const { projectPath, result } = flow;
    if (result.canceled) {
      setStatus("Importação de GIF cancelada.");
      pushToast("Importação de GIF cancelada.", { kind: "info" });
      return;
    }
    if (result.error) {
      notifyError(result.error);
      return;
    }
    if (!result.animation || !result.assets?.length) {
      notifyError("Nenhuma animação GIF foi importada.");
      return;
    }

    const withAssets = appendImportedAssetsToProject(session.project.data, result.assets);
    const nextData = applyImportedAnimationToCutscene(withAssets, targetRoomID, result.animation);
    if (nextData === withAssets) {
      notifyError("Não foi possível aplicar a animação à Cutscene ativa.");
      return;
    }
    commitProjectData(nextData, { path: projectPath });
    notifySuccess(`GIF convertido: ${result.animation.frameCount} frames em ${result.animation.totalDurationFrames} frames GBA.`);
  }

  async function importAudio(): Promise<void> {
    if (!session?.path) {
      setStatus("Salve o projeto antes de importar áudio.");
      return;
    }

    const result = await window.gbaStudio.importAssets({ projectPath: session.path, scope: "audio" });
    if (result.canceled) {
      setStatus("Importação de áudio cancelada.");
      return;
    }

    if (result.error) {
      setStatus(result.error);
      return;
    }

    const importedAssets = result.assets ?? [];
    if (importedAssets.length === 0) {
      setStatus("Nenhum arquivo de áudio importado.");
      return;
    }

    updateProjectData(appendImportedAssetsToProject(session.project.data, importedAssets));
    const plural = importedAssets.length === 1 ? "" : "s";
    notifySuccess(`${importedAssets.length} áudio${plural} importado${plural}.`);
  }

  async function importSpriteSheets(): Promise<void> {
    if (!session) return;

    let projectPath = session.path;
    if (!projectPath) {
      const saveResult = await window.gbaStudio.saveProject({ project: session.project });
      publishFeedback(saveProjectFeedback(saveResult));
      if (saveResult.canceled || !saveResult.path) return;
      projectPath = saveResult.path;
      setSession({ ...session, path: projectPath, dirty: false });
    }

    const result = await window.gbaStudio.importAssets({ projectPath, scope: "sprite" });
    if (result.canceled) {
      setStatus("Importação de sprite cancelada.");
      return;
    }

    if (result.error) {
      setStatus(result.error);
      return;
    }

    const importedAssets = result.assets ?? [];
    if (importedAssets.length === 0) {
      setStatus("Nenhum sprite importado.");
      return;
    }

    const nextData = appendImportedAssetsToProject(session.project.data, importedAssets);
    commitProjectData(nextData, { path: projectPath });
    const spriteAssets = importedAssets.filter((asset) => asset.kind === "Sprite");
    const lastImported = spriteAssets[spriteAssets.length - 1] ?? importedAssets[importedAssets.length - 1];
    setFocusedAssetRequest({
      assetID: lastImported.id,
      assetName: lastImported.name,
      kind: lastImported.kind,
      label: lastImported.name,
      requestID: Date.now(),
      targetName: lastImported.name,
      workspace: "Sprites"
    });
    setSelectedWorkspace("Sprites");
    const plural = importedAssets.length === 1 ? "" : "s";
    notifySuccess(`${importedAssets.length} sprite${plural} importado${plural}.`);
  }

  async function importTilesetForRoom(roomID: string): Promise<void> {
    if (!session) return;

    const saveResult = session.path
      ? { path: session.path }
      : await window.gbaStudio.saveProject({ project: session.project });
    const resolvedPath = resolvePersistedProjectPathAfterSave(session.path, saveResult);
    if (resolvedPath.canceled) {
      setStatus("Importação de tileset cancelada.");
      return;
    }
    if (!resolvedPath.path) {
      setStatus(resolvedPath.error ?? "Salve o projeto antes de importar tileset.");
      return;
    }

    const result = await window.gbaStudio.importAssets({ projectPath: resolvedPath.path, scope: "tileset" });
    if (result.canceled) {
      setStatus("Importação de tileset cancelada.");
      return;
    }

    if (result.error) {
      setStatus(result.error);
      return;
    }

    const importedAssets = result.assets ?? [];
    if (importedAssets.length === 0) {
      setStatus("Nenhum tileset importado.");
      return;
    }

    const imported = importedAssets[0];
    let nextData = appendImportedAssetsToProject(session.project.data, importedAssets);
    nextData = updateRoomFieldsInProject(nextData, roomID, { backgroundAssetName: imported.name });
    commitProjectData(nextData, { path: resolvedPath.path });
    const plural = importedAssets.length === 1 ? "" : "s";
    notifySuccess(`${importedAssets.length} tileset${plural} importado${plural} e aplicado${plural} na room.`);
  }

  async function importTiledMapForRoom(roomID: string): Promise<void> {
    if (!session) return;

    const saveResult = session.path
      ? { path: session.path }
      : await window.gbaStudio.saveProject({ project: session.project });
    const resolvedPath = resolvePersistedProjectPathAfterSave(session.path, saveResult);
    if (resolvedPath.canceled) {
      setStatus("Importação de mapa Tiled cancelada.");
      return;
    }
    if (!resolvedPath.path) {
      setStatus(resolvedPath.error ?? "Salve o projeto antes de importar mapa Tiled.");
      return;
    }

    const result = await window.gbaStudio.importTiledMap({ projectPath: resolvedPath.path });
    if (result.canceled) {
      setStatus("Importação de mapa Tiled cancelada.");
      return;
    }
    if (result.error) {
      setStatus(result.error);
      return;
    }
    if (!result.parsed) {
      setStatus("Mapa Tiled invalido.");
      return;
    }

    let nextData = session.project.data;
    if (result.importedTileset) {
      nextData = appendImportedAssetsToProject(nextData, [result.importedTileset]);
    }
    try {
      nextData = importTiledMapIntoProject(nextData, result.parsed, {
        targetRoomId: roomID,
        backgroundAssetName: result.backgroundAssetName
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      return;
    }

    commitProjectData(nextData, { path: resolvedPath.path });
    const mapLabel = result.sourcePath ? result.sourcePath.split(/[\\/]/).pop() : "mapa";
    notifySuccess(`Mapa Tiled importado (${mapLabel}) na room.`);
  }

  async function revealAsset(source: string | null): Promise<void> {
    const resolvedPath = resolveAssetSourcePath(session?.path, source);
    if (!resolvedPath) {
      setStatus("Nao foi possivel resolver o caminho do asset.");
      return;
    }

    const result = await window.gbaStudio.revealPath(resolvedPath);
    setStatus(result.ok ? `Revelando asset: ${resolvedPath}` : result.error ?? "Falha ao revelar asset.");
  }

  async function createRoom(anchorRoomID?: string, roomName?: string, presetID?: RoomPresetID): Promise<string | void> {
    if (!session) return;
    const currentRooms = roomsPresentation?.rooms ?? [];
    const anchorRoom = anchorRoomID
      ? currentRooms.find((room) => room.id === anchorRoomID) ?? null
      : null;
    const activeRoomName = anchorRoom?.name
      ?? currentRooms.find((room) => room.isActive)?.name
      ?? null;
    const promptedName = roomName === undefined
      ? await prompt("Nome da nova room", uniqueDefaultRoomName(currentRooms.map((room) => room.name)))
      : roomName;
    if (promptedName === null) return;
    const trimmedName = promptedName.trim();
    if (!trimmedName) {
      setStatus("Não foi possível criar a cena. Verifique o nome informado.");
      return;
    }
    const newRoomID = globalThis.crypto.randomUUID();
    const createdData = createRoomInProject(session.project.data, {
      id: newRoomID,
      name: trimmedName,
      width: 30,
      height: 20,
      sceneType: "topdown",
      anchorRoomID,
      presetID
    });
    const connectedData = activeRoomName && createdData !== session.project.data
      ? createRoomConnectionInProject(createdData, {
        eventName: "",
        from: activeRoomName,
        to: trimmedName
      })
      : createdData;
    const nextData = setActiveRoomInProject(connectedData, newRoomID);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      notifySuccess(activeRoomName ? `Room criada e conectada: ${activeRoomName} -> ${trimmedName}.` : `Room criada: ${trimmedName}.`);
      return newRoomID;
    }
    setStatus("Não foi possível criar a cena. Verifique o nome informado.");
  }

  async function duplicateRoom(roomID: string, currentName: string): Promise<string | void> {
    if (!session) return;
    const currentRooms = roomsPresentation?.rooms ?? [];
    const promptedName = await prompt("Nome da cópia", uniqueDefaultRoomName(currentRooms.map((room) => room.name)));
    if (promptedName === null) return;
    const trimmedName = promptedName.trim();
    if (!trimmedName) {
      setStatus("Não foi possível duplicar a cena. Verifique o nome informado.");
      return;
    }
    const newRoomID = globalThis.crypto.randomUUID();
    const nextData = duplicateRoomInProject(session.project.data, {
      newName: trimmedName,
      newRoomID,
      sourceRoomID: roomID
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Cena duplicada: ${currentName} -> ${trimmedName}.`);
      return newRoomID;
    }
    setStatus("Não foi possível duplicar a cena. Verifique o nome informado.");
  }

  function renameRoom(roomID: string, nextName: string): void {
    if (!session) return;
    const trimmedName = nextName.trim();
    if (!trimmedName) {
      setStatus("Não foi possível renomear a cena. Verifique o nome informado.");
      return;
    }
    const nextData = renameRoomInProject(session.project.data, roomID, trimmedName);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Cena renomeada para ${trimmedName}.`);
    }
  }

  async function removeRoom(roomID: string, currentName: string): Promise<void> {
    if (!session) return;
    if (blockReferencedDeletion({ kind: "room", id: roomID, name: currentName })) return;
    if (!await confirm(`Remover a cena "${currentName}" do projeto?`)) return;
    const nextData = removeRoomFromProject(session.project.data, roomID);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Cena removida: ${currentName}.`);
    }
  }

  function setActiveRoom(roomID: string, currentName: string): void {
    if (!session) return;
    setSession((current) => current ? selectProjectSessionRoom(current, roomID) : current);
    setStatus(`Cena aberta: ${currentName}.`);
  }

  function updateRoomFields(roomID: string, fields: UpdateRoomFields, historyGroupID?: string): void {
    if (!session) return;
    const nextData = updateRoomFieldsInProject(session.project.data, roomID, fields);
    if (nextData !== session.project.data) {
      updateProjectData(nextData, { historyGroupID });
      setStatus("Cena atualizada.");
    }
  }

  function updateRoomBackgroundTilesetGrid(roomID: string, fields: UpdateRoomBackgroundTilesetGridFields): void {
    if (!session) return;
    const nextData = updateRoomBackgroundTilesetGridInProject(session.project.data, roomID, fields);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Grade do tileset atualizada.");
    }
  }

  function applyRoomTileBrush(roomID: string, options: RoomTileBrushOptions, historyGroupID?: string): void {
    if (!session) return;
    const nextData = applyRoomTileBrushInProject(session.project.data, roomID, options);
    if (nextData !== session.project.data) {
      updateProjectData(nextData, { historyGroupID });
      const toolStatus = options.tool === "fill" ? "preenchido" : options.tool === "eraser" ? "apagado" : "atualizado";
      setStatus(`Tilemap da cena ${toolStatus}.`);
    }
  }

  function setActiveTileLayerMapping(mapping: string): void {
    if (!session) return;
    const nextData = setActiveTileLayerMappingInProject(session.project.data, mapping);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Camada de pintura atualizada.");
    }
  }

  function toggleRoomCollisionCell(roomID: string, cellIndex: number): void {
    if (!session) return;
    const nextData = toggleRoomCollisionCellInProject(session.project.data, roomID, cellIndex);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Colisão da cena atualizada.");
    }
  }

  function setRoomCollisionType(roomID: string, cellIndex: number, collisionType: RoomCollisionType, historyGroupID?: string): void {
    if (!session) return;
    const nextData = setRoomCollisionTypeInProject(session.project.data, roomID, cellIndex, collisionType);
    if (nextData !== session.project.data) {
      updateProjectData(nextData, { historyGroupID });
      setStatus("Colisao atualizada no canvas.");
    }
  }

  function applyRoomCollisionFill(roomID: string, cellIndex: number, collisionType: RoomCollisionType, historyGroupID?: string): void {
    if (!session) return;
    const nextData = applyRoomCollisionFillInProject(session.project.data, roomID, cellIndex, collisionType);
    if (nextData !== session.project.data) {
      updateProjectData(nextData, { historyGroupID });
      setStatus("Região de colisão preenchida no canvas.");
    }
  }

  function setRoomHeightLevel(roomID: string, cellIndex: number, heightLevel: number, historyGroupID?: string): void {
    if (!session) return;
    const nextData = setRoomHeightLevelInProject(session.project.data, roomID, cellIndex, heightLevel);
    if (nextData !== session.project.data) {
      updateProjectData(nextData, { historyGroupID });
      setStatus(`Altura isometrica atualizada para o nivel ${heightLevel}.`);
    }
  }

  function createRoomConnection(fromName: string, toName: string, eventName: string): number | null {
    if (!session) return null;
    const nextData = createRoomConnectionInProject(session.project.data, { from: fromName, to: toName, eventName });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      notifySuccess(`Conexao criada: ${fromName} -> ${toName}.`);
      const connections = nextData.editorState && typeof nextData.editorState === "object" && !Array.isArray(nextData.editorState)
        ? (nextData.editorState as Record<string, unknown>).scenaConnections
        : null;
      return Array.isArray(connections) ? connections.length - 1 : null;
    }
    return null;
  }

  function createRoomWarpConnection(
    fromName: string,
    toName: string,
    eventName: string,
    side: "exit" | "entry",
    area: RoomConnectionArea,
    historyGroupID?: string
  ): number | null {
    if (!session) return null;
    const nextData = createRoomWarpConnectionInProject(session.project.data, { area, from: fromName, side, to: toName, eventName });
    if (nextData !== session.project.data) {
      updateProjectData(nextData, { historyGroupID });
      notifySuccess(`Zona de ${side === "exit" ? "saída" : "entrada"} criada: ${fromName} -> ${toName}.`);
      const connections = nextData.editorState && typeof nextData.editorState === "object" && !Array.isArray(nextData.editorState)
        ? (nextData.editorState as Record<string, unknown>).scenaConnections
        : null;
      return Array.isArray(connections) ? connections.length - 1 : null;
    }
    return null;
  }

  function removeRoomConnection(connectionIndex: number): void {
    if (!session) return;
    const nextData = removeRoomConnectionFromProject(session.project.data, connectionIndex);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      notifySuccess("Conexão de cena removida.");
    }
  }

  function updateRoomConnection(connectionIndex: number, fields: UpdateRoomConnectionFields, historyGroupID?: string): void {
    if (!session) return;
    const nextData = updateRoomConnectionInProject(session.project.data, connectionIndex, fields);
    if (nextData !== session.project.data) {
      updateProjectData(nextData, { historyGroupID });
      notifySuccess("Conexão de cena atualizada.");
    }
  }

  function updateSceneMapPosition(sceneName: string, position: SceneMapPosition): void {
    if (!session) return;
    const nextData = updateSceneMapPositionInProject(session.project.data, sceneName, position);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Posicao da cena ${sceneName} atualizada.`);
    }
  }

  function organizeSceneMapPositions(): void {
    if (!session) return;
    const nextData = organizeSceneMapPositionsInProject(session.project.data);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Cards das cenas organizados por ordem e tamanho.");
    }
  }

  function updateSceneMapZoom(zoom: number): void {
    if (!session) return;
    const nextZoom = clampSceneMapZoom(zoom);
    setSceneMapView({ path: session.path, zoom: nextZoom });
    writeSceneMapViewZoom(session.path, nextZoom);
  }

  function setStartRoom(roomID: string, currentName: string): void {
    if (!session) return;
    const nextData = setStartRoomInProject(session.project.data, roomID);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Cena inicial definida: ${currentName}.`);
    }
  }

  function updateRoomEntity(kind: RoomsWorkspaceEntityKind, entityID: string, fields: UpdateRoomEntityFields, historyGroupID?: string): void {
    if (!session) return;
    const nextData = updateRoomEntityInProject(session.project.data, kind, entityID, fields);
    if (nextData !== session.project.data) {
      updateProjectData(nextData, { historyGroupID });
      setStatus(kind === "actor" ? "Ator da cena atualizado." : "Trigger da cena atualizado.");
    }
  }

  function synchronizePrefabs(): void {
    if (!session) return;
    updateProjectData(synchronizeProjectPrefabInstances(session.project.data));
    setStatus("Pre-fabricados aplicados as instancias vinculadas.");
  }

  function createPrefabFromEntity(kind: ProjectPrefabKind, entityID: string): void {
    if (!session) return;
    const result = createProjectPrefabFromEntity(session.project.data, kind, entityID);
    if (!result.prefabID) return;
    updateProjectData(result.data);
    setStatus(kind === "actor" ? "Pre-fabricado de ator criado." : "Pre-fabricado de trigger criado.");
  }

  function instantiatePrefab(kind: ProjectPrefabKind, prefabID: string, placement: ProjectPrefabPlacement): void {
    if (!session) return;
    const result = instantiateProjectPrefab(session.project.data, kind, prefabID, placement);
    if (!result.entityID) return;
    updateProjectData(result.data);
    setStatus(kind === "actor" ? "Instancia de ator criada na cena." : "Instancia de trigger criada na cena.");
  }

  function updatePrefab(kind: ProjectPrefabKind, prefabID: string, fields: Record<string, unknown>): void {
    if (!session) return;
    const nextData = updateProjectPrefab(session.project.data, kind, prefabID, fields);
    if (nextData === session.project.data) return;
    updateProjectData(nextData);
    setStatus("Pre-fabricado e instancias vinculadas atualizados.");
  }

  function placeRoomEntity(kind: RoomsWorkspaceEntityKind, entityID: string, options: PlaceRoomEntityInRoomOptions, historyGroupID?: string): void {
    if (!session) return;
    const nextData = placeRoomEntityInRoomInProject(session.project.data, kind, entityID, options);
    if (nextData !== session.project.data) {
      updateProjectData(nextData, { historyGroupID });
      setStatus(kind === "actor" ? "Ator reposicionado no canvas." : "Trigger reposicionado no canvas.");
    }
  }

  function resizeRoomTrigger(triggerID: string, options: ResizeRoomTriggerToTileOptions, historyGroupID?: string): void {
    if (!session) return;
    const nextData = resizeRoomTriggerToTileInProject(session.project.data, triggerID, options);
    if (nextData !== session.project.data) {
      updateProjectData(nextData, { historyGroupID });
      setStatus("Area da trigger atualizada no canvas.");
    }
  }

  function createActor(options: CreateActorInProjectOptions, historyGroupID?: string): string | void {
    if (!session) return;
    const actors = Array.isArray(session.project.data.actors) ? session.project.data.actors : [];
    const previousActorIDs = new Set(
      actors
        .map((actor) => (typeof actor === "object" && actor !== null && "id" in actor ? String((actor as { id?: unknown }).id ?? "") : ""))
        .filter((id) => id.length > 0)
    );
    const nextData = createActorInProject(session.project.data, options);
    if (nextData === session.project.data) return;
    const nextActors = Array.isArray(nextData.actors) ? nextData.actors : [];
    const createdActor = nextActors.find((actor) => {
      const id = typeof actor === "object" && actor !== null && "id" in actor ? String((actor as { id?: unknown }).id ?? "") : "";
      return id.length > 0 && !previousActorIDs.has(id);
    }) as { id?: string } | undefined;
    updateProjectData(nextData, { historyGroupID });
    setStatus("Ator criado no canvas.");
    return createdActor?.id;
  }

  function createTrigger(options: CreateTriggerInProjectOptions, historyGroupID?: string): string | void {
    if (!session) return;
    const triggers = Array.isArray(session.project.data.triggers) ? session.project.data.triggers : [];
    const previousTriggerIDs = new Set(
      triggers
        .map((trigger) => (typeof trigger === "object" && trigger !== null && "id" in trigger ? String((trigger as { id?: unknown }).id ?? "") : ""))
        .filter((id) => id.length > 0)
    );
    const nextData = createTriggerInProject(session.project.data, options);
    if (nextData === session.project.data) return;
    const nextTriggers = Array.isArray(nextData.triggers) ? nextData.triggers : [];
    const createdTrigger = nextTriggers.find((trigger) => {
      const id = typeof trigger === "object" && trigger !== null && "id" in trigger ? String((trigger as { id?: unknown }).id ?? "") : "";
      return id.length > 0 && !previousTriggerIDs.has(id);
    }) as { id?: string } | undefined;
    updateProjectData(nextData, { historyGroupID });
    setStatus("Trigger criada no canvas.");
    return createdTrigger?.id;
  }

  function nudgeRoomEntities(roomID: string, selectedKeys: string[], deltaX: number, deltaY: number, stepSize?: number): void {
    if (!session) return;
    const nextData = nudgeRoomEntitiesInProject(session.project.data, {
      deltaX,
      deltaY,
      roomID,
      selectedKeys,
      stepSize
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Selecao movida: ${selectedKeys.length} entidades.`);
    }
  }

  function alignRoomEntities(roomID: string, selectedKeys: string[], axis: "x" | "y"): void {
    if (!session || selectedKeys.length < 2) return;
    const nextData = alignRoomEntitiesInProject(session.project.data, {
      axis,
      roomID,
      selectedKeys
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(axis === "x" ? "Selecao alinhada no eixo X." : "Selecao alinhada no eixo Y.");
    }
  }

  function distributeRoomEntities(roomID: string, selectedKeys: string[], axis: "x" | "y"): void {
    if (!session || selectedKeys.length < 3) return;
    const nextData = distributeRoomEntitiesInProject(session.project.data, {
      axis,
      roomID,
      selectedKeys
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(axis === "x" ? "Selecao distribuida no eixo X." : "Selecao distribuida no eixo Y.");
    }
  }

  async function removeRoomEntities(roomID: string, selectedKeys: string[]): Promise<void> {
    if (!session || selectedKeys.length === 0) return;
    const confirmed = await confirm(`Remover ${selectedKeys.length} entidades selecionadas desta cena?`);
    if (!confirmed) return;

    const nextData = removeRoomEntitiesInProject(session.project.data, {
      roomID,
      selectedKeys
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Selecao removida: ${selectedKeys.length} entidades.`);
    }
  }

  function duplicateRoomEntities(roomID: string, selectedKeys: string[]): void {
    if (!session || selectedKeys.length === 0) return;
    const nextData = duplicateRoomEntitiesInProject(session.project.data, {
      idForCopy: () => globalThis.crypto.randomUUID(),
      roomID,
      selectedKeys
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Selecao duplicada: ${selectedKeys.length} entidades.`);
    }
  }

  async function createSpriteAnimation(spriteSheet: string): Promise<void> {
    if (!session) return;
    const nextName = await prompt("Nome da nova animacao", "idle_down");
    if (nextName === null) return;
    const trimmedName = nextName.trim();
    const nextData = createSpriteAnimationInProject(session.project.data, {
      id: globalThis.crypto.randomUUID(),
      name: trimmedName,
      spriteSheet
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Animacao criada: ${trimmedName}.`);
    }
  }

  async function renameSpriteAnimation(animationID: string, currentName: string): Promise<void> {
    if (!session) return;
    const nextName = await prompt("Novo nome da animacao", currentName);
    if (nextName === null) return;
    const nextData = renameSpriteAnimationInProject(session.project.data, animationID, nextName);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Animacao renomeada para ${nextName.trim()}.`);
    }
  }

  function updateSpriteAnimationFields(animationID: string, fields: UpdateSpriteAnimationFields): void {
    if (!session) return;
    const nextData = updateSpriteAnimationFieldsInProject(session.project.data, animationID, fields);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Animacao atualizada.");
    }
  }

  function updateSpriteAnimationState(animationStateID: string, fields: UpdateSpriteAnimationStateFields): void {
    if (!session) return;
    const nextData = updateSpriteAnimationStateInProject(session.project.data, animationStateID, fields);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Tipo do conjunto de animacoes atualizado.");
    }
  }

  function updateSpriteMetaspriteFrame(animationID: string, options: UpdateSpriteMetaspriteFrameOptions): void {
    if (!session) return;
    const nextData = updateSpriteMetaspriteFrameInProject(session.project.data, animationID, options);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Metasprite atualizado no frame ${options.frameIndex + 1}.`);
    }
  }

  function addSpriteMetaspriteTile(animationID: string, options: AddSpriteMetaspriteTileOptions): void {
    if (!session) return;
    const nextData = addSpriteMetaspriteTileInProject(session.project.data, animationID, options);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Tile adicionado ao metasprite no frame ${options.frameIndex + 1}.`);
    }
  }

  function removeSpriteMetaspriteTile(animationID: string, options: RemoveSpriteMetaspriteTileOptions): void {
    if (!session) return;
    const nextData = removeSpriteMetaspriteTileInProject(session.project.data, animationID, options);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Tile removido do metasprite no frame ${options.frameIndex + 1}.`);
    }
  }

  function updateSpriteMetaspriteTile(animationID: string, options: UpdateSpriteMetaspriteTileOptions): void {
    if (!session) return;
    const nextData = updateSpriteMetaspriteTileInProject(session.project.data, animationID, options);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Tile de metasprite atualizado no frame ${options.frameIndex + 1}.`);
    }
  }

  function moveSpriteMetaspriteTiles(animationID: string, options: MoveSpriteMetaspriteTilesOptions): void {
    if (!session) return;
    const nextData = moveSpriteMetaspriteTilesInProject(session.project.data, animationID, options);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`${options.tileIndexes.length} tile(s) movidos no frame ${options.frameIndex + 1}.`);
    }
  }

  function toggleSpriteMetaspriteTilesFlip(animationID: string, options: ToggleSpriteMetaspriteTilesFlipOptions): void {
    if (!session) return;
    const nextData = toggleSpriteMetaspriteTilesFlipInProject(session.project.data, animationID, options);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(options.horizontal ? "Flip X aplicado aos tiles selecionados." : "Flip Y aplicado aos tiles selecionados.");
    }
  }

  function reorderSpriteMetaspriteTiles(animationID: string, options: ReorderSpriteMetaspriteTilesOptions): void {
    if (!session) return;
    const nextData = reorderSpriteMetaspriteTilesInProject(session.project.data, animationID, options);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(options.placement === "front" ? "Tiles enviados para frente." : "Tiles enviados para tras.");
    }
  }

  function removeSpriteMetaspriteTiles(animationID: string, frameIndex: number, tileIndexes: number[]): void {
    if (!session || tileIndexes.length === 0) return;
    const nextData = removeSpriteMetaspriteTilesInProject(session.project.data, animationID, {
      frameIndex,
      tileIndexes
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`${tileIndexes.length} tile(s) removidos do frame ${frameIndex + 1}.`);
    }
  }

  function fitSpriteAnimationHitbox(animationID: string, frameIndex: number): void {
    if (!session) return;
    const nextData = fitSpriteAnimationHitboxToVisibleTilesInProject(session.project.data, animationID, frameIndex);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Hitbox ajustada ao frame ${frameIndex + 1}.`);
    }
  }

  function copySpriteAnimationGeometry(animationID: string): void {
    if (!session) return;
    const nextData = copySpriteAnimationGeometryToSheetSiblingsInProject(session.project.data, animationID);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Geometria copiada para animacoes irmas.");
    }
  }

  async function generateSpriteFromReference(referenceID: string, title: string, assetName: string | null, generatedSpriteAssetName: string | null): Promise<void> {
    if (!session) return;
    const fallbackName = generatedSpriteAssetName ?? `${title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "sprite"}.png`;
    const nextName = await prompt("Nome do sprite gerado", fallbackName);
    if (nextName === null) return;
    const trimmedName = nextName.trim();
    if (!trimmedName) return;

    let spriteSheetName = trimmedName;
    let assetSourceRelativePath: string | undefined;
    if (session.path && assetName) {
      const copied = await window.gbaStudio.generateSpriteReferenceAsset({
        projectPath: session.path,
        referenceAssetName: assetName,
        spriteSheetName: trimmedName
      });
      if (copied.error || !copied.name || !copied.relativePath) {
        setStatus(copied.error ?? "Falha ao copiar imagem de referencia.");
        return;
      }

      spriteSheetName = copied.name;
      assetSourceRelativePath = copied.relativePath;
    }

    const nextData = generateSpriteFromReferenceInProject(session.project.data, {
      animationID: globalThis.crypto.randomUUID(),
      assetSourceRelativePath,
      referenceID,
      spriteAssetID: globalThis.crypto.randomUUID(),
      spriteSheetName
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Sprite gerado a partir da referencia: ${spriteSheetName}.`);
    }
  }

  async function duplicateSpriteAnimation(animationID: string, currentName: string): Promise<void> {
    if (!session) return;
    const defaultName = copyName(currentName);
    const nextName = await prompt("Nome da animacao duplicada", defaultName);
    if (nextName === null) return;
    const nextData = duplicateSpriteAnimationInProject(session.project.data, {
      sourceAnimationID: animationID,
      newAnimationID: globalThis.crypto.randomUUID(),
      newName: nextName
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Animacao duplicada: ${nextName.trim()}.`);
    }
  }

  async function removeSpriteAnimation(animationID: string, currentName: string): Promise<void> {
    if (!session) return;
    if (blockReferencedDeletion({ kind: "spriteAnimation", id: animationID, name: currentName })) return;
    if (!await confirm(`Remover a animacao "${currentName}" do projeto?`)) return;
    const nextData = removeSpriteAnimationFromProject(session.project.data, animationID);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Animacao removida: ${currentName}.`);
    }
  }

  async function createEvent(): Promise<string | void> {
    if (!session) return;
    const nextName = await prompt("Nome do novo evento", "novo_evento");
    if (nextName === null) return;
    const trimmedName = nextName.trim();
    if (!trimmedName) return;
    const nextData = createEventWithGraphPositionInProject(session.project.data, {
      id: globalThis.crypto.randomUUID(),
      name: trimmedName,
      category: "Custom"
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Evento criado: ${trimmedName}.`);
      return trimmedName;
    }
  }

  async function createVariable(
    kind: ProjectVariableKind = "variable",
    valueType: "number" | "text" = "number"
  ): Promise<string | void> {
    if (!session) return;
    const label = kind === "constant" ? "constante" : valueType === "text" ? "variável textual" : "variável";
    const nextName = await prompt(`Nome da nova ${label}`, kind === "constant" ? "max_score" : valueType === "text" ? "player.name" : "score");
    if (nextName === null) return;
    const trimmedName = nextName.trim();
    if (!trimmedName) return;
    const nextData = createProjectVariableInProject(session.project.data, {
      name: trimmedName,
      kind,
      valueType
    });
    if (nextData === session.project.data) {
      setStatus(`${label[0]!.toUpperCase()}${label.slice(1)} ja existe ou nome invalido.`);
      return;
    }
    updateProjectData(nextData);
    setStatus(`${label[0]!.toUpperCase()}${label.slice(1)} criada: ${trimmedName}.`);
    return trimmedName;
  }

  function updateLogicValue(name: string, kind: ProjectVariableKind, patch: LogicValuePatch): void {
    if (!session) return;
    const next = updateLogicValueInProject(session.project.data, name, kind, patch);
    if (next !== session.project.data) updateProjectData(next);
  }

  async function removeVariable(name: string, kind: ProjectVariableKind): Promise<void> {
    if (!session) return;
    const label = kind === "constant" ? "constante" : "variavel";
    if (listLogicValueUsages(session.project.data, name).length) { setStatus("Este item possui referências. Remova os vínculos antes de excluir."); return; }
    if (!await confirm(`Remover ${label} "${name}"?`)) return;
    const nextData = removeProjectVariableFromProject(session.project.data, { name, kind });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`${label[0]!.toUpperCase()}${label.slice(1)} removida: ${name}.`);
    }
  }

  async function renameEvent(eventID: string, currentName: string): Promise<void> {
    if (!session) return;
    const nextName = await prompt("Novo nome do evento", currentName);
    if (nextName === null) return;
    const nextData = renameEventInProject(session.project.data, eventID, nextName);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Evento renomeado para ${nextName.trim()}.`);
    }
  }

  async function duplicateEvent(eventID: string, currentName: string): Promise<void> {
    if (!session) return;
    const defaultName = copyName(currentName);
    const nextName = await prompt("Nome do evento duplicado", defaultName);
    if (nextName === null) return;
    const nextData = duplicateEventInProject(session.project.data, {
      sourceEventID: eventID,
      newEventID: globalThis.crypto.randomUUID(),
      newName: nextName
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Evento duplicado: ${nextName.trim()}.`);
    }
  }

  async function exportEvent(eventID: string, currentName: string): Promise<void> {
    if (!session) return;
    const result = await window.gbaStudio.exportEvent({ project: session.project, eventID });
    publishFeedback(exportArtifactFeedback("Evento", currentName, result));
  }

  async function removeEvent(eventID: string, currentName: string): Promise<void> {
    if (!session) return;
    if (blockReferencedDeletion({ kind: "event", id: eventID, name: currentName })) return;
    if (!await confirm(`Remover o evento "${currentName}" do projeto?`)) return;
    const nextData = removeEventFromProject(session.project.data, eventID);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      notifySuccess(`Evento removido: ${currentName}.`);
    }
  }

  function updateEventFields(eventID: string, fields: UpdateEventFields): void {
    if (!session) return;
    const nextData = updateEventFieldsInProject(session.project.data, eventID, fields);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Evento atualizado.");
    }
  }

  function addEventStep(eventID: string, eventName: string, command = "noop"): void {
    if (!session) return;
    const nextData = addEventStepInProject(session.project.data, eventID, command);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Passo adicionado em ${eventName}.`);
    }
  }

  function insertEventSteps(eventID: string, target: EventStructureInsertionTarget, commands: string[]): void {
    if (!session) return;
    const nextData = insertEventStepsInProject(session.project.data, eventID, target, commands);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Comando inserido no ramo do evento.");
    }
  }

  function updateEventFrequency(eventName: string, frames: number): void {
    if (!session || !Number.isFinite(frames)) return;
    const event = eventsPresentation?.groups.flatMap((group) => group.events).find((candidate) => candidate.name === eventName);
    if (!event) return;
    const nextData = setEventUpdateFrequencyInProject(session.project.data, event.id, frames, 0);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Frequência de ${eventName} atualizada.`);
    }
  }

  function updateEventStep(eventID: string, stepIndex: number, fields: UpdateEventStepFields): void {
    if (!session) return;
    const nextData = updateEventStepInProject(session.project.data, eventID, stepIndex, fields);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Passo de evento atualizado.");
    }
  }

  function updateSceneRouteTable(tableID: string, patch: SceneRouteTablePatch): void {
    if (!session) return;
    const nextData = updateSceneRouteTableInProject(session.project.data, tableID, patch);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Tabela de rotas atualizada.");
    }
  }

  function updateMenuSliderItem(sceneName: string, screenID: string, itemID: string, patch: MenuSliderItemPatch): void {
    if (!session) return;
    const nextData = updateMenuSliderItemInProject(session.project.data, sceneName, screenID, itemID, patch);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Opção ${itemID} do Slider atualizada.`);
    }
  }

  function updateEventGraphNodePosition(eventID: string, position: UpdateEventGraphNodePosition): void {
    if (!session) return;
    const nextData = updateEventGraphNodePositionInProject(session.project.data, eventID, position);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Grafo de eventos atualizado.");
    }
  }

  function relayoutEventsGraph(): void {
    if (!session) return;
    const nextData = relayoutEventsGraphInProject(session.project.data);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Canvas de eventos reorganizado.");
    }
  }

  function retargetEventGraphEdge(options: RetargetEventGraphEdgeOptions): void {
    if (!session) return;
    const nextData = retargetEventGraphEdgeInProject(session.project.data, options);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Chamada de evento redirecionada para ${options.targetEventName}.`);
    }
  }

  function connectEventGraphNodes(options: ConnectEventGraphNodesOptions): void {
    if (!session) return;
    const nextData = connectEventGraphNodesInProject(session.project.data, options);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Chamada criada para ${options.targetEventName}.`);
    }
  }

  function removeEventGraphEdge(options: RemoveEventGraphEdgeOptions): void {
    if (!session) return;
    const nextData = removeEventGraphEdgeInProject(session.project.data, options);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Chamada entre eventos removida.");
    }
  }

  function bindEventToTarget(eventID: string, options: BindEventToTargetOptions): void {
    if (!session) return;
    const nextData = bindEventToTargetInProject(session.project.data, eventID, options);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Evento vinculado a ${options.targetName}.${options.bindingKey}.`);
    }
  }

  function createBoundEventForTarget(options: BindEventToTargetOptions): string | null {
    if (!session) return null;
    const result = createBoundEventForTargetInProject(session.project.data, {
      ...options,
      eventID: globalThis.crypto.randomUUID()
    });
    if (!result) return null;

    if (result.data !== session.project.data) {
      updateProjectData(result.data);
      setStatus(
        result.created
          ? `Evento criado e vinculado a ${options.targetName}.${options.bindingKey}.`
          : `Evento vinculado a ${options.targetName}.${options.bindingKey}.`
      );
    }

    return result.eventID;
  }

  function createBoundEventsForTargets(options: { initialCommands: string[]; targets: BindEventToTargetOptions[] }): string[] {
    if (!session) return [];
    const result = createBoundEventsForTargetsInProject(session.project.data, {
      eventIDs: options.targets.map(() => globalThis.crypto.randomUUID()),
      initialCommands: options.initialCommands,
      targets: options.targets
    });
    if (!result) return [];
    if (result.data !== session.project.data) {
      updateProjectData(result.data);
      setStatus(`${result.eventNames.length} comportamento${result.eventNames.length === 1 ? "" : "s"} criado${result.eventNames.length === 1 ? "" : "s"}.`);
    }
    return result.eventNames;
  }

  function removeEventTargetBinding(options: BindEventToTargetOptions): void {
    if (!session) return;
    const nextData = removeEventTargetBindingInProject(session.project.data, options);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Vinculo removido de ${options.targetName}.${options.bindingKey}.`);
    }
  }

  async function removeEventStep(eventID: string, stepIndex: number, eventName: string): Promise<void> {
    if (!session) return;
    if (!await confirm(`Remover o passo ${stepIndex + 1} de "${eventName}"?`)) return;
    const nextData = removeEventStepInProject(session.project.data, eventID, stepIndex);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Passo removido de ${eventName}.`);
    }
  }

  async function createAudio(kind: "Musica" | "SFX" | "Audio" = "SFX"): Promise<void> {
    if (!session) return;
    const defaultName = suggestAudioItemName(session.project.data, kind);
    const prompted = window.gbaStudio
      ? defaultName
      : await prompt(`Nome do novo ${kind}`, defaultName);
    if (prompted === null) return;
    const trimmedName = prompted.trim();
    if (!trimmedName) return;
    const nextData = createAudioItemInProject(session.project.data, {
      id: globalThis.crypto.randomUUID(),
      name: trimmedName,
      kind
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Áudio criado: ${trimmedName}.`);
    }
  }

  async function createAudioInstrument(audioID: string, channelID: string): Promise<void> {
    if (!session) return;
    const name = await prompt("Nome do instrumento compartilhado", "Novo instrumento");
    if (name === null) return;
    const next = createAudioInstrumentFromChannel(session.project.data, audioID, channelID, { id: globalThis.crypto.randomUUID(), name });
    if (next !== session.project.data) { updateProjectData(next); setStatus(`Instrumento salvo no banco: ${name.trim()}.`); }
  }
  function updateAudioInstrument(id: string, fields: UpdateAudioInstrumentFields): void {
    if (!session) return;
    const next = updateAudioInstrumentInProject(session.project.data, id, fields);
    if (next !== session.project.data) { updateProjectData(next); setStatus("Instrumento compartilhado atualizado em todas as músicas que o usam."); }
  }
  function removeAudioInstrument(id: string): void {
    if (!session) return;
    const next = removeAudioInstrumentFromProject(session.project.data, id);
    if (next !== session.project.data) { updateProjectData(next); setStatus("Instrumento removido do banco."); }
    else setStatus("O instrumento está em uso. Troque-o nas faixas antes de remover.");
  }

  async function renameAudio(audioID: string, currentName: string): Promise<void> {
    if (!session) return;
    const nextName = await prompt("Novo nome do áudio", currentName);
    if (nextName === null) return;
    const nextData = renameAudioItemInProject(session.project.data, audioID, nextName);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Áudio renomeado para ${nextName.trim()}.`);
    }
  }

  function updateAudioFields(audioID: string, fields: UpdateAudioItemFields): void {
    if (!session) return;
    const nextData = updateAudioItemFieldsInProject(session.project.data, audioID, fields);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Áudio atualizado.");
    }
  }

  async function updateAudioChannelNote(audioID: string, channelID: string, stepIndex: number, currentNote: string | null): Promise<void> {
    if (!session) return;
    const nextNote = await prompt(`Nota do passo ${stepIndex + 1}`, currentNote ?? "");
    if (nextNote === null) return;

    setAudioChannelNote(audioID, channelID, stepIndex, nextNote);
  }

  function setAudioChannelNote(audioID: string, channelID: string, stepIndex: number, note: string): void {
    if (!session) return;
    const nextData = updateAudioChannelNoteInProject(session.project.data, audioID, {
      channelID,
      stepIndex,
      note
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Nota do tracker atualizada.");
    }
  }

  function moveAudioChannelNote(audioID: string, channelID: string, stepIndex: number, direction: -1 | 1): void {
    if (!session) return;
    const nextData = moveAudioChannelNoteInProject(session.project.data, audioID, {
      channelID,
      stepIndex,
      direction
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Nota movida no tracker.");
    }
  }

  function applyAudioPatternPreset(audioID: string): void {
    if (!session) return;
    const nextData = applyAudioPatternPresetInProject(session.project.data, audioID);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Preset aplicado ao pattern ativo.");
    }
  }

  function transposeAudioChannelNote(audioID: string, channelID: string, stepIndex: number, deltaSemitones: number): void {
    if (!session) return;
    const nextData = transposeAudioChannelNoteInProject(session.project.data, audioID, {
      channelID,
      deltaSemitones,
      stepIndex
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Nota transposta no piano roll.");
    }
  }

  function transposeAudioChannel(audioID: string, channelID: string, deltaSemitones: number): void {
    if (!session) return;
    const nextData = transposeAudioChannelInProject(session.project.data, audioID, {
      channelID,
      deltaSemitones
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Canal transposto no piano roll.");
    }
  }

  function updateAudioChannelFields(audioID: string, channelID: string, fields: { name?: string; type?: string; muted?: boolean; solo?: boolean; instrument?: string; envelope?: string; volume?: number; sampleAssetID?: string | null; sampleRootNote?: string; sampleLoop?: boolean; instrumentID?: string | null; pan?: number }): void {
    if (!session) return;
    const nextData = updateAudioChannelFieldsInProject(session.project.data, audioID, {
      channelID,
      ...fields
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Canal de áudio atualizado.");
    } else if (fields.type) {
      setStatus("Esse tipo já está ocupado no pattern ou não é uma voz PSG válida.");
    }
  }

  async function renameAudioChannel(audioID: string, channelID: string, currentName: string): Promise<void> {
    const nextName = await prompt("Nome do canal", currentName);
    if (nextName === null) return;
    updateAudioChannelFields(audioID, channelID, { name: nextName });
  }

  function updateAudioChannelType(audioID: string, channelID: string, currentType: string): void {
    const rows = audioPresentation?.items.find(item => item.id === audioID)?.previewRows ?? [];
    const item = audioPresentation?.items.find(item => item.id === audioID);
    const available = (item?.kind === "SFX" ? ["pulse1", "noise"] : ["pulse1", "pulse2", "wave", "noise"]).filter(type => !rows.some(row => row.id !== channelID && audioPhysicalChannel(row.type) === audioPhysicalChannel(type)));
    let nextType = currentType;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      nextType = nextAudioChannelTypePreset(nextType);
      if (nextType !== currentType && available.includes(nextType)) { updateAudioChannelFields(audioID, channelID, { type: nextType, instrument: nextType === "noise" ? "Noise Kit" : nextType === "wave" ? "Wave Bass" : "Pulse Lead" }); return; }
    }
    setStatus("Todas as outras vozes PSG já estão ocupadas neste pattern.");

  }

  async function createAudioChannel(audioID: string, patternID: string | null): Promise<void> {
    if (!session) return;
    const item = audioPresentation?.items.find(candidate => candidate.id === audioID);
    const available = (item?.kind === "SFX" ? ["pulse1", "noise"] : ["pulse1", "pulse2", "wave", "noise"]).filter(type => !item?.previewRows.some(row => audioPhysicalChannel(row.type) === audioPhysicalChannel(type)));
    if (!item || item.previewRows.length >= (item.kind === "SFX" ? 1 : 4) || !available.length) { setStatus("O pattern já usa todas as vozes disponíveis."); return; }
    const channelName = await prompt("Nome do canal", "Novo canal");
    if (channelName === null) return;
    const trimmedName = channelName.trim();
    if (!trimmedName) return;

    const channelType = await prompt(`Voz PSG disponível: ${available.join(", ")}`, available[0]);
    if (channelType === null) return;
    const trimmedType = channelType.trim();
    if (!trimmedType) return;

    const nextData = createAudioChannelInProject(session.project.data, audioID, {
      id: globalThis.crypto.randomUUID(),
      name: trimmedName,
      type: trimmedType,
      patternID: patternID ?? undefined
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Canal criado: ${trimmedName}.`);
    } else {
      setStatus("Canal não criado: revise o limite e escolha uma voz PSG livre (pulse1, pulse2, wave ou noise).");
    }
  }

  async function removeAudioChannel(audioID: string, channelID: string, currentName: string): Promise<void> {
    if (!session) return;
    const confirmed = await confirm(`Remover o canal "${currentName}"?`);
    if (!confirmed) return;
    const nextData = removeAudioChannelFromProject(session.project.data, audioID, channelID);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Canal removido: ${currentName}.`);
    }
  }

  function updateAudioPatternOrderSlot(audioID: string, slotIndex: number, patternID: string): void {
    if (!session) return;
    const nextData = updateAudioPatternOrderSlotInProject(session.project.data, audioID, slotIndex, patternID);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(patternID ? "Sequencia de padroes atualizada." : "Slot da sequencia removido.");
    }
  }

  async function createAudioPattern(audioID: string): Promise<void> {
    if (!session) return;
    const patternName = await prompt("Nome do padrao", "Novo padrao");
    if (patternName === null) return;
    const trimmedName = patternName.trim();
    if (!trimmedName) return;
    const nextData = createAudioPatternInProject(session.project.data, audioID, {
      id: globalThis.crypto.randomUUID(),
      name: trimmedName
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Padrão criado: ${trimmedName}.`);
    }
  }

  async function renameAudioPattern(audioID: string, patternID: string, currentName: string): Promise<void> {
    if (!session) return;
    const nextName = await prompt("Novo nome do padrao", currentName);
    if (nextName === null) return;
    const nextData = renameAudioPatternInProject(session.project.data, audioID, patternID, nextName);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Padrão renomeado para ${nextName.trim()}.`);
    }
  }

  async function removeAudioPattern(audioID: string, patternID: string, currentName: string): Promise<void> {
    if (!session) return;
    const confirmed = await confirm(`Remover o padrao "${currentName}" e limpar a sequencia?`);
    if (!confirmed) return;
    const nextData = removeAudioPatternFromProject(session.project.data, audioID, patternID);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Padrão removido: ${currentName}.`);
    }
  }

  function setActiveAudioPattern(audioID: string, patternID: string): void {
    if (!session) return;
    const nextData = setActiveAudioPatternInProject(session.project.data, audioID, patternID);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
    }
  }

  async function duplicateAudioPattern(audioID: string, patternID: string, currentName: string): Promise<void> {
    if (!session) return;
    const nextName = await prompt("Nome do pattern duplicado", `${currentName} copy`);
    if (!nextName?.trim()) return;
    const nextData = duplicateAudioPatternInProject(session.project.data, audioID, {
      sourcePatternID: patternID,
      newPatternID: globalThis.crypto.randomUUID(),
      newName: nextName.trim()
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Pattern duplicado: ${nextName.trim()}.`);
    }
  }

  function clearAudioPatternSequence(audioID: string): void {
    if (!session) return;
    const nextData = clearAudioPatternSequenceInProject(session.project.data, audioID);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Sequencia de patterns limpa.");
    }
  }

  function moveAudioPatternOrderSlot(audioID: string, slotIndex: number, direction: -1 | 1): void {
    if (!session) return;
    const nextData = moveAudioPatternOrderSlotInProject(session.project.data, audioID, slotIndex, direction);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
    }
  }

  function normalizeAudio(audioID: string): void {
    if (!session) return;
    const nextData = normalizeAudioInProject(session.project.data, audioID);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Parâmetros do áudio corrigidos para as faixas aceitas.");
    }
  }

  async function duplicateAudio(audioID: string, currentName: string): Promise<void> {
    if (!session) return;
    const defaultName = copyName(currentName);
    const nextName = await prompt("Nome do áudio duplicado", defaultName);
    if (nextName === null) return;
    const nextData = duplicateAudioItemInProject(session.project.data, {
      sourceAudioID: audioID,
      newAudioID: globalThis.crypto.randomUUID(),
      newName: nextName
    });
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Áudio duplicado: ${nextName.trim()}.`);
    }
  }

  async function exportAudio(audioID: string, currentName: string): Promise<void> {
    if (!session) return;
    const result = await window.gbaStudio.exportAudio({ project: session.project, audioID });
    publishFeedback(exportArtifactFeedback("Audio", currentName, result));
  }

  async function removeAudio(audioID: string, currentName: string): Promise<void> {
    if (!session) return;
    if (blockReferencedDeletion({ kind: "audio", id: audioID, name: currentName })) return;
    if (!await confirm(`Remover o audio "${currentName}" do projeto?`)) return;
    const nextData = removeAudioItemFromProject(session.project.data, audioID);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Áudio removido: ${currentName}.`);
    }
  }

  function openDialogueInEditor(key: string, sceneID?: string): void {
    if (!session) return;
    const room = dialogueEditorScene(session.project.data, key, sceneID);
    if (!room) { setStatus("Crie uma cena para editar diálogos."); return; }
    const requestID = Date.now();
    setPendingFocusInspectorTab("dialogues");
    setFocusedEventRequest(null);
    setSceneDialogueFocus({ key, requestID });
    setFocusedAssetRequest({ assetID: room.id, assetName: room.name, kind: "Room", label: room.name, targetID: room.id, targetName: room.name, workspace: "Editor", requestID });
    setSelectedWorkspace("Editor");
    setStatus(`Fala aberta no Editor: ${key}.`);
  }

  async function createDialogue(): Promise<string | null> {
    const current = dialogueSessionRef.current;
    if (!current) return null;
    const dialogueCount = Array.isArray(current.project.data.dialogues) ? current.project.data.dialogues.length : 0;
    const key = await prompt("Chave do diálogo", `dialogue_${dialogueCount + 1}`);
    const trimmedKey = key?.trim();
    const latest = dialogueSessionRef.current;
    if (!trimmedKey || !latest || latest.path !== current.path) return null;
    if (Array.isArray(latest.project.data.dialogues) && latest.project.data.dialogues.some(item => item.key === trimmedKey)) {
      setStatus(`A chave ${trimmedKey} já existe. Escolha outra para criar uma fala.`); return null;
    }
    const nextData = createDialogueInProject(latest.project.data, { key: trimmedKey, character: "Narrador", text: "Nova fala.", choices: [] });
    updateProjectData(nextData);
    setStatus(`Fala criada no catálogo: ${trimmedKey}. Vincule a chave em um evento para executá-la.`);
    return trimmedKey;
  }

  function updateDialogue(key: string, fields: UpdateDialogueFields): void {
    if (!session) return;
    const nextData = updateDialogueInProject(session.project.data, key, fields);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Dialogo atualizado: ${key}.`);
    }
  }

  function connectDialogueToStartEvent(key: string): void {
    if (!session) return;
    const nextData = connectDialogueToStartEventInProject(session.project.data, key);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Dialogo conectado ao inicio: ${key}.`);
      return;
    }
    setStatus(`Dialogo ja conectado ao inicio: ${key}.`);
  }

  function openDialogueEvent(eventName: string): void {
    setFocusedEventRequest({
      eventName,
      requestID: ++focusedEventRequestSequence.current
    });
    setNavigationTrail({
      currentLabel: `Eventos · ${eventName}`,
      sourceLabel: "Diálogos",
      sourceWorkspace: "Dialogos"
    });
    openEventsInspector(eventName);
  }

  function updateInterfaceTheme(change: InterfaceThemeChange): void {
    if (!session) return;
    const nextData = updateInterfaceThemeInProject(session.project.data, change);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("Tema das molduras atualizado.");
    }
  }

  function updateDialoguesUi(fields: UpdateDialoguesUiFields): void {
    if (!session) return;
    const nextData = updateDialoguesUiInProject(session.project.data, fields);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus("UI de diálogos atualizada.");
    }
  }

  function setActiveHudPreset(presetID: string): void {
    if (!session) return;
    const nextData = setActiveHudPresetInProject(session.project.data, presetID);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`HUD ativo: ${presetID}.`);
    }
  }

  function updateHudPreset(presetID: string, fields: UpdateHudPresetFields): void {
    if (!session) return;
    const nextData = updateHudPresetInProject(session.project.data, presetID, fields);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Preset de HUD atualizado: ${presetID}.`);
    }
  }

  function bindSceneHud(roomID: string, presetID: string | null, screenID?: string): void {
    if (!session) return;
    const nextData = bindSceneHudInProject(session.project.data, roomID, presetID, screenID);
    if (nextData !== session.project.data) updateProjectData(nextData);
  }

  async function createHudVariationForRoom(roomID: string, sourcePresetID: string, screenID?: string): Promise<void> {
    if (!session) return;
    const source = deriveHudPresetsWorkspacePresentation(session.project.data).presets.find(preset => preset.id === sourcePresetID);
    if (!source) return;
    const newID = await prompt("ID da nova HUD da cena", `${copyName(sourcePresetID)}-scene`);
    if (!newID?.trim()) return;
    const newName = await prompt("Nome da nova HUD da cena", `${source.name} · cena`);
    if (newName === null) return;
    const nextData = createSceneHudVariationInProject(session.project.data, roomID, sourcePresetID, newID.trim(), newName, screenID);
    if (nextData === session.project.data) {
      setStatus("Não foi possível criar a HUD: o ID já existe ou é inválido.");
      return;
    }
    updateProjectData(nextData);
    setStatus(`HUD criada e vinculada à cena: ${newName}.`);
  }

  async function duplicateHudPreset(presetID: string): Promise<void> {
    if (!session) return;
    const presentation = deriveHudPresetsWorkspacePresentation(session.project.data);
    const source = presentation.presets.find((preset) => preset.id === presetID);
    if (!source) return;
    const newID = await prompt("ID do novo preset de HUD", copyName(presetID));
    if (newID === null || !newID.trim()) return;
    const newName = await prompt("Nome do novo preset de HUD", `${source.name} cópia`);
    if (newName === null) return;
    const nextData = duplicateHudPresetInProject(session.project.data, presetID, newID, newName);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Preset de HUD duplicado: ${newID.trim()}.`);
    } else {
      setStatus("Não foi possível duplicar o preset: o ID já existe ou é inválido.");
    }
  }

  async function removeHudPreset(presetID: string): Promise<void> {
    if (!session) return;
    const preset = deriveHudPresetsWorkspacePresentation(session.project.data).presets.find((item) => item.id === presetID);
    if (!preset || preset.builtIn) return;
    const usages = hudPresetUsages(session.project.data, presetID);
    if (usages.length) {
      setStatus(`Substitua a HUD nas cenas antes de remover: ${usages.map(scene => scene.name).join(", ")}.`);
      return;
    }
    if (!await confirm(`Remover o preset de HUD "${preset.name}" do projeto?`)) return;
    const nextData = removeHudPresetInProject(session.project.data, presetID);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Preset de HUD removido: ${preset.name}.`);
    }
  }

  async function duplicateDialogue(key: string): Promise<string | null> {
    const current = dialogueSessionRef.current;
    if (!current) return null;
    const nextKey = await prompt("Chave do diálogo duplicado", copyName(key));
    const trimmedKey = nextKey?.trim();
    const latest = dialogueSessionRef.current;
    if (!trimmedKey || !latest || latest.path !== current.path) return null;
    if (Array.isArray(latest.project.data.dialogues) && latest.project.data.dialogues.some(item => item.key === trimmedKey)) { setStatus("Esta chave de diálogo já existe."); return null; }
    const nextData = duplicateDialogueInProject(latest.project.data, { sourceKey: key, newKey: trimmedKey });
    if (nextData === latest.project.data) return null;
    updateProjectData(nextData);
    setStatus(`Diálogo duplicado: ${trimmedKey}.`);
    return trimmedKey;
  }

  function normalizeDialogue(key: string): void {
    if (!session) return;
    const nextData = normalizeDialogueInProject(session.project.data, key);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      setStatus(`Dialogo normalizado: ${key}.`);
    }
  }

  async function exportDialogue(key: string): Promise<void> {
    if (!session) return;
    const result = await window.gbaStudio.exportDialogue({ project: session.project, key });
    publishFeedback(exportArtifactFeedback("Dialogo", key, result));
  }

  async function removeDialogue(key: string): Promise<void> {
    if (!session) return;
    if (blockReferencedDeletion({ kind: "dialogue", name: key })) return;
    if (!await confirm(`Remover o dialogo "${key}" do projeto?`)) return;
    const nextData = removeDialogueFromProject(session.project.data, key);
    if (nextData !== session.project.data) {
      updateProjectData(nextData);
      notifySuccess(`Dialogo removido: ${key}.`);
    }
  }

  function updateSetting(sectionID: SettingsSectionID, fieldKey: string, value: SettingsEditableValue): void {
    if (!session) return;
    const nextData = updateSettingsFieldInProject(session.project.data, sectionID, fieldKey, value);
    if (nextData !== session.project.data) {
      setSettingsPathValidation(null);
      updateProjectData(nextData);
      setStatus(`Ajustes atualizado: ${sectionID}.${fieldKey}.`);
    }
  }

  function applySettingsPreset(sectionID: SettingsSectionID, changes: Array<{ fieldKey: string; value: SettingsEditableValue }>): void {
    if (!session) return;
    // Reduce against the same project and commit once: React batches synchronous edits.
    const nextData = changes.reduce((data, change) => updateSettingsFieldInProject(data, sectionID, change.fieldKey, change.value), session.project.data);
    if (nextData !== session.project.data) {
      setSettingsPathValidation(null);
      updateProjectData(nextData);
      setStatus(`Preset aplicado: ${sectionID}.`);
    }
  }

  async function selectSettingsPath(sectionID: SettingsSectionID, field: SettingsEditableField): Promise<void> {
    if (!session || !field.pathPicker) return;
    const result = await window.gbaStudio.selectPath({
      defaultPath: typeof field.value === "string" && field.value.trim().length > 0 ? field.value : undefined,
      mode: field.pathPicker,
      title: `Escolher ${field.label}`
    });
    if (result.canceled) return;
    if (result.error) {
      setStatus(`Falha ao escolher caminho: ${result.error}`);
      return;
    }
    if (!result.path) return;

    const nextData = updateSettingsFieldInProject(session.project.data, sectionID, field.key, result.path);
    if (nextData !== session.project.data) {
      setSettingsPathValidation(null);
      updateProjectData(nextData);
      setStatus(`Ajustes atualizado: ${sectionID}.${field.key}.`);
    }
  }

  async function resetSettingsSection(sectionID: SettingsSectionID): Promise<void> {
    if (!session) return;
    if (!await confirm(`Restaurar defaults editaveis da secao "${sectionID}"?`)) return;
    const nextData = selectedWorkspace === "Exportar" && (sectionID === "general" || sectionID === "build")
      ? resetExportSettingsPageInProject(session.project.data, sectionID)
      : resetSettingsSectionInProject(session.project.data, sectionID);
    if (nextData !== session.project.data) {
      setSettingsPathValidation(null);
      updateProjectData(nextData);
      setStatus(`Ajustes restaurado: ${sectionID}.`);
    }
  }

  async function validateSettingsPaths(scope: SettingsWorkspaceScope = "global"): Promise<void> {
    if (!settingsPresentation) return;

    const detectedEnginePackPath = hasEngineAssetc && hasEngineBuild && engineStatus?.selected?.label !== "Settings do projeto"
      ? engineStatus?.selected?.path
      : undefined;
    const targets = deriveSettingsPathValidationTargets(settingsPresentation, scope, {
      enginePackFallbackPath: detectedEnginePackPath,
      projectPath: session?.path
    });
    if (targets.length === 0) {
      setSettingsPathValidation({ ok: true, items: [] });
      setStatus(scope === "export" ? "Nenhum path configurado para exportação." : "Nenhum path configurado em Ajustes.");
      return;
    }

    setSettingsPathValidationRunning(true);
    try {
      const result = await window.gbaStudio.validateSettingsPaths({ targets });
      setSettingsPathValidation(result);
      publishFeedback(settingsPathValidationFeedback(result));
    } finally {
      setSettingsPathValidationRunning(false);
    }
  }

  function openSceneReviewAction(request: SceneActionRequest): SceneActionOutcome {
    const outcome: SceneActionOutcome = projectData
      ? executeSceneReviewAction(projectData, request, ({ sceneName, inspectorTab }) => {
          setPendingFocusInspectorTab(inspectorTab);
          setFocusedEventRequest(null);
          setFocusedAssetRequest({ assetID: "", assetName: sceneName, kind: "", label: sceneName,
            targetName: sceneName, workspace: "Editor", requestID: Date.now() });
          setNavigationTrail({ currentLabel: sceneName, sourceLabel: "Análise da cena", sourceWorkspace: "Exportar" });
          setSelectedWorkspace("Editor");
        })
      : { status: "rejected", message: "Abra um projeto antes de abrir a ferramenta." };
    setSceneActionHistory(entries => [...entries.slice(-19), { ...request, ...outcome, timestamp: new Date().toISOString() }]);
    setStatus(outcome.message);
    return outcome;
  }

  function openProjectProblem(problem: ProjectProblem): void {
    setPendingFocusInspectorTab(null);
    const requestID = Date.now();
    setNavigationTrail({
      currentLabel: problem.targetName ?? problem.message,
      sourceLabel: `Central de pendências · ${selectedWorkspace}`,
      sourceWorkspace: selectedWorkspace
    });
    if ((problem.code?.startsWith("events.") || problem.code === "runtime.event_projection.invalid") && problem.targetName) {
      setFocusedEventRequest({ eventName: problem.targetName, requestID });
    }
    if (problem.workspace !== "Arquivos" && problem.workspace !== "Exportar" && (problem.targetName || problem.targetID)) {
      setFocusedAssetRequest({
        assetID: problem.targetID ?? "",
        assetName: problem.targetName ?? problem.message,
        kind: "",
        label: problem.targetName ?? problem.message,
        requestID,
        targetID: problem.targetID,
        targetName: problem.targetName,
        workspace: problem.workspace
      });
    }
    setSelectedWorkspace(problem.workspace);
    setProblemsOpen(false);
    setStatus(`Pendencia aberta em ${problem.workspace}: ${problem.message}`);
  }

  const commandActions: StudioCommandAction[] = [
    ...workspaceNames.map((workspace) => ({
      id: `workspace-${workspace}`,
      label: `Ir para ${workspace}`,
      detail: "Trocar workspace",
      keywords: ["abrir", "navegar", workspace],
      run: () => {
        setNavigationTrail(null);
        setSelectedWorkspace(workspace);
      }
    })),
    { id: "create-room", label: "Criar cena", detail: "Editor", keywords: ["nova cena"], run: () => { setSelectedWorkspace("Editor"); void createRoom(); } },
    { id: "create-event", label: "Criar evento", detail: "Eventos", keywords: ["novo fluxo"], run: () => { void createEvent(); openEventsInspector(); } },
    { id: "create-dialogue", label: "Criar diálogo", detail: "Editor · Diálogos", keywords: ["nova fala"], run: async () => { const key = await createDialogue(); if (key) openDialogueInEditor(key); } },
    { id: "create-audio", label: "Criar SFX", detail: "Áudio", keywords: ["novo som"], run: () => { setSelectedWorkspace("Audio"); void createAudio("SFX"); } },
    { id: "import-assets", label: "Importar arquivos", detail: "Arquivos", keywords: ["asset sprite audio"], run: () => { setSelectedWorkspace("Arquivos"); void importAssets(); } },
    { id: "project-play", label: "Executar ROM", detail: "Projeto", keywords: ["play testar jogo"], run: () => void playProject() },
    { id: "project-save", label: "Salvar projeto", detail: "Projeto", keywords: ["gravar"], run: () => void saveProject() },
    {
      id: "testing-diagnostics",
      label: "Abrir testes e diagnóstico",
      detail: "Replay, saves, Link Cable, hardware e ROM",
      keywords: ["ferramentas profiler fluxo ocupacao"],
      run: () => setTestingDiagnosticsOpen(true)
    },
    { id: "edit-undo", label: "Desfazer alteração", detail: `${session?.undoStack.length ?? 0} disponível(is)`, keywords: ["undo"], run: undoProjectEdit },
    { id: "edit-redo", label: "Refazer alteração", detail: `${session?.redoStack.length ?? 0} disponível(is)`, keywords: ["redo"], run: redoProjectEdit },
    { id: "view-focus", label: focusMode ? "Sair do modo foco" : "Entrar no modo foco", detail: selectedWorkspace, keywords: ["canvas tela cheia"], run: () => setFocusMode((current) => !current) },
    { id: "project-problems", label: "Abrir central de pendências", detail: `${projectProblems.length} problema(s)`, keywords: ["erros avisos validar"], run: () => setProblemsOpen(true) }
  ];

  if (!session) {
    return (
      <WelcomeScreen
        status={status}
        onCreateProject={createProject}
        onOpenProject={() => void openProject()}
        onOpenRecentProject={(path) => void openRecentProject(path)}
      />
    );
  }

  return (
    <main className={`app-shell${focusMode ? " focus-mode" : ""}`}>
      <header className={`app-topbar${window.gbaStudio.platform === "darwin" ? " native-macos-titlebar" : ""}`}>
        <div className="topbar-brand">
          <img alt="GBA Studio" className="topbar-brand-logo" src={studioWordmarkURL} />
        </div>

        <div
          aria-label={`${session?.project.summary.name ?? t("shell.noProject")} · ${session?.dirty ? t("shell.dirty") : session ? t("shell.saved") : t("shell.noProjectState")}`}
          className="topbar-project"
          title={`${session?.project.summary.name ?? t("shell.noProject")} · ${session?.dirty ? t("shell.dirty") : session ? t("shell.saved") : t("shell.noProjectState")}`}
        >
          <span>{session?.project.summary.name ?? t("shell.noProject")}</span>
          <em className={session?.dirty ? "dirty" : session ? "saved" : ""}>
            {session?.dirty ? t("shell.dirty") : session ? t("shell.saved") : t("shell.noProjectState")}
          </em>
        </div>

        <nav className="workspace-list" aria-label={t("shell.workspaces")} ref={workspaceListRef}>
          {workspaceNames.map((item) => {
            const WorkspaceIcon = workspaceIcons[item];
            const workspaceLabel = t(workspaceLabelKey(item));

            return (
              <button
                className={selectedWorkspace === item ? "workspace active" : "workspace"}
                key={item}
                type="button"
                aria-label={t("shell.workspaceAria", { workspace: workspaceLabel })}
                aria-current={selectedWorkspace === item ? "page" : undefined}
                title={workspaceLabel}
                onClick={() => startTransition(() => {
                  setNavigationTrail(null);
                  if (item !== "Editor" && status.startsWith("Evento aberto no inspetor")) {
                    setStatus(t("app.readyToOpen"));
                  }
                  setSelectedWorkspace(item);
                })}
              >
                <span className="workspace-icon" aria-hidden="true">
                  <WorkspaceIcon strokeWidth={2.2} />
                </span>
                <span>{workspaceLabel}</span>
              </button>
            );
          })}
        </nav>

        <div className="topbar-actions">
          <button
            aria-label={t("project.save")}
            className="topbar-save-button"
            disabled={!session.dirty}
            onClick={() => void saveProject()}
            title={session.dirty ? t("project.save") : t("project.saveDisabledTitle")}
            type="button"
          >
            <Save aria-hidden="true" strokeWidth={2.2} />
          </button>
          <StudioThemeToggle className="topbar-theme-toggle icon-button" />
          <button
            className="topbar-history-button"
            aria-label="Desfazer alteração"
            disabled={session.undoStack.length === 0}
            onClick={undoProjectEdit}
            title={session.undoStack.length > 0 ? `Desfazer (${session.undoStack.length})` : "Nada para desfazer"}
            type="button"
          >
            <Undo2 aria-hidden="true" strokeWidth={2.2} />
          </button>
          <button
            className="topbar-history-button"
            aria-label="Refazer alteração"
            disabled={session.redoStack.length === 0}
            onClick={redoProjectEdit}
            title={session.redoStack.length > 0 ? `Refazer (${session.redoStack.length})` : "Nada para refazer"}
            type="button"
          >
            <Redo2 aria-hidden="true" strokeWidth={2.2} />
          </button>
          <button
            aria-label="Abrir central de pendências"
            className={projectProblems.length > 0 ? "topbar-problems-button has-problems" : "topbar-problems-button"}
            onClick={() => setProblemsOpen(true)}
            title="Central de pendências"
            type="button"
          >
            <AlertTriangle aria-hidden="true" strokeWidth={2.2} />
            <span>{projectProblems.length}</span>
          </button>
          <button
            className="run-button"
            type="button"
            aria-label={t("shell.play")}
            title={playProjectDisabled ? playProjectBlockedReasonText ?? t("shell.playDisabledTitle") : t("shell.playTitle")}
            onClick={() => void playProject()}
            disabled={playProjectDisabled}
          >
            <Play aria-hidden="true" strokeWidth={2.4} />
            <span className="topbar-action-label">{playRunning ? t("shell.playRunning") : t("shell.play")}</span>
          </button>
          <div className="project-action-menu-wrap">
            <button
              aria-expanded={projectActionsOpen}
              aria-haspopup="menu"
              aria-label={t("shell.projectMenuOpen")}
              aria-controls="project-action-menu"
              className="icon-button"
              ref={projectMenuButtonRef}
              type="button"
              onClick={() => setProjectActionsOpen((isOpen) => !isOpen)}
            >
              <MoreHorizontal aria-hidden="true" strokeWidth={2.4} />
            </button>
            {projectActionsOpen ? (
              <div className="project-action-menu" id="project-action-menu" role="menu" aria-label={t("shell.projectMenu")}>
                <button
                  aria-label={t("project.save")}
                  disabled={!session.dirty}
                  role="menuitem"
                  title={session.dirty ? t("project.save") : t("project.saveDisabledTitle")}
                  type="button"
                  onClick={() => runToolbarMenuAction("save")}
                >
                  <span aria-hidden="true"><Save strokeWidth={2.2} /></span>
                  {t("project.save")}
                </button>
                <button
                  aria-label={t("shell.openProject")}
                  role="menuitem"
                  title={t("shell.openProject")}
                  type="button"
                  onClick={() => runToolbarMenuAction("open")}
                >
                  <span aria-hidden="true"><FolderOpen strokeWidth={2.2} /></span>
                  {t("shell.openProject")}
                </button>
                {localizedProjectActionItems.map((item) => (
                  <button
                    aria-label={item.label}
                    disabled={item.disabled}
                    key={item.id}
                    role="menuitem"
                    title={item.reason}
                    type="button"
                    onClick={() => runProjectAction(item.id)}
                  >
                    <span aria-hidden="true">{projectActionIcons[item.id]}</span>
                    {item.label}
                  </button>
                ))}
                <div className="project-menu-divider" />
                <button
                  aria-label={t("project.globalCommandsAria")}
                  role="menuitem"
                  title={t("project.globalCommands")}
                  type="button"
                  onClick={() => runToolbarMenuAction("commands")}
                >
                  <span aria-hidden="true"><Command strokeWidth={2.2} /></span>
                  {t("project.globalCommands")}
                </button>
                <button
                  aria-label={focusMode ? t("project.exitFocus") : t("project.enterFocus")}
                  aria-pressed={focusMode}
                  role="menuitem"
                  title={focusMode ? t("project.exitFocus") : t("project.focusMode")}
                  type="button"
                  onClick={() => runToolbarMenuAction("focus")}
                >
                  <span aria-hidden="true"><Maximize2 strokeWidth={2.2} /></span>
                  {focusMode ? t("project.exitFocus") : t("project.enterFocus")}
                </button>
                <button
                  aria-label={t("project.diagnosticsAria")}
                  aria-pressed={testingDiagnosticsOpen}
                  role="menuitem"
                  title={t("project.diagnostics")}
                  type="button"
                  onClick={() => runToolbarMenuAction("diagnostics")}
                >
                  <span aria-hidden="true"><Activity strokeWidth={2.2} /></span>
                  {t("project.diagnostics")}
                </button>
                <div className="project-menu-divider" />
                <div className="project-menu-preferences" role="group" aria-label={t("project.preferences")}>
                  <StudioLanguageSwitcher className="project-menu-language" />
                  <StudioThemeToggle className="project-menu-theme" />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <section className="content">
        <section className="work-area">
          {navigationTrail ? (
            <WorkspaceNavigationTrail
              currentLabel={navigationTrail.currentLabel}
              onReturn={() => {
                setSelectedWorkspace(navigationTrail.sourceWorkspace);
                setNavigationTrail(null);
              }}
              sourceLabel={navigationTrail.sourceLabel}
            />
          ) : null}
          {selectedWorkspace === "Arquivos" ? (
            <FilesWorkspace
              advancedTools={projectData ? (
                <WorkspaceAdvancedTools
                  onChangeProjectData={commitProjectData}
                  onEnableTool={enableAdvancedTool}
                  presentation={advancedToolsPresentation}
                  projectData={projectData}
                  sceneType={activeSceneType}
                  surface="Arquivos"
                />
              ) : null}
              presentation={filesPresentation}
              projectPath={session?.path}
              assetRefreshToken={externalAssetRevision}
              onBatchConvertAssets={convertAssetsInBatch}
              onBatchMoveAssets={moveAssetsInBatch}
              onBatchRemoveAssets={(assetIDs) => void removeAssetsInBatch(assetIDs)}
              onBatchRenameAssets={(assetIDs) => void renameAssetsInBatch(assetIDs)}
              onImportAssets={() => void importAssets()}
              onImportGifAnimation={() => void importGifAnimation()}
              onRenameAsset={renameAsset}
              onRemoveAsset={removeAsset}
              onDuplicateAsset={duplicateAsset}
              onRevealAsset={(source) => void revealAsset(source)}
              onRepairReferences={repairAssetReferences}
              onReplaceAsset={(assetID, currentName) => void replaceAssetFile(assetID, currentName)}
              onOpenAssetWorkspace={openAssetWorkspaceFromFiles}
            />
          ) : selectedWorkspace === "Editor" ? (
            <RoomsWorkspace
              logicEvents={eventsPresentation}
              onCreateLogicVariable={createVariable}
              onUpdateLogicValue={updateLogicValue}
              onRemoveLogicValue={removeVariable}
              budgetAnalysisError={projectBudgetAnalysis?.error ?? null}
              budgetAnalysisGeneratedAt={projectBudgetAnalysis?.generatedAt ?? null}
              budgetAnalysisRunning={projectBudgetAnalysisRunning}
              budgetReport={projectBudgetAnalysis?.report ?? null}
              commandSuggestions={eventsPresentation?.commandPalette ?? []}
              hardwareProfiler={hardwareProfiler}
              projectData={projectData}
              presentation={roomsPresentation}
              projectPath={session?.path}
              focusedTargetID={focusedAssetRequest?.workspace === "Editor" ? focusedAssetRequest.targetID ?? null : null}
              focusedTargetName={focusedAssetRequest?.workspace === "Editor" ? focusedAssetRequest.targetName ?? null : null}
              focusRequestID={focusedAssetRequest?.workspace === "Editor" ? focusedAssetRequest.requestID : 0}
              focusInspectorTab={pendingFocusInspectorTab}
              focusedDialogueKey={sceneDialogueFocus?.key}
              dialogueFocusRequestID={sceneDialogueFocus?.requestID}
              onCreateDialogue={createDialogue} onDuplicateDialogue={duplicateDialogue}
              onRemoveDialogue={removeDialogue} onNormalizeDialogue={normalizeDialogue}
              focusedEventName={focusedEventRequest?.eventName ?? null}
              focusedEventRequestID={focusedEventRequest?.requestID ?? 0}
              onCreateRoom={createRoom}
              onCreateBoundEventsForTargets={createBoundEventsForTargets}
              onSetEventUpdateFrequency={updateEventFrequency}
              onBeginHistoryGroup={beginProjectHistoryGroup}
              onEndHistoryGroup={endProjectHistoryGroup}
              onApplyCollisionFill={applyRoomCollisionFill}
              onSetActiveRoom={setActiveRoom}
              onUpdateRoomFields={updateRoomFields}
              onUpdateRoomBackgroundTilesetGrid={updateRoomBackgroundTilesetGrid}
              onApplyTileBrush={applyRoomTileBrush}
              onSetActiveTileLayerMapping={setActiveTileLayerMapping}
              onToggleCollisionCell={toggleRoomCollisionCell}
              onSetCollisionType={setRoomCollisionType}
              onSetHeightLevel={setRoomHeightLevel}
              onCreateRoomConnection={createRoomConnection}
              onCreateRoomWarpConnection={createRoomWarpConnection}
              onCreateEventReference={createEvent}
              onRemoveRoomConnection={removeRoomConnection}
              onUpdateRoomConnection={updateRoomConnection}
              onUpdateRoomEntity={updateRoomEntity}
              onSynchronizePrefabs={synchronizePrefabs}
              onCreatePrefabFromEntity={createPrefabFromEntity}
              onInstantiatePrefab={instantiatePrefab}
              onUpdatePrefab={updatePrefab}
              onPlaceRoomEntity={placeRoomEntity}
              onCreateTrigger={createTrigger}
              onCreateActor={createActor}
              onResizeRoomTrigger={resizeRoomTrigger}
              onNudgeRoomEntities={nudgeRoomEntities}
              onAlignRoomEntities={alignRoomEntities}
              onDistributeRoomEntities={distributeRoomEntities}
              onDuplicateRoomEntities={duplicateRoomEntities}
              onRemoveRoomEntities={removeRoomEntities}
              onUpdateSceneMapPosition={updateSceneMapPosition}
              onOrganizeSceneMap={organizeSceneMapPositions}
              onUpdateSceneMapZoom={updateSceneMapZoom}
              sceneMapZoom={sceneMapView && sceneMapView.path === session?.path
                ? sceneMapView.zoom : readSceneMapViewZoom(session?.path, roomsPresentation?.sceneMapZoom)}
              assetRefreshToken={externalAssetRevision}
              onUpdateSceneOrganization={updateSceneOrganization}
              onRenameRoom={renameRoom}
              onDuplicateRoom={duplicateRoom}
              onRemoveRoom={removeRoom}
              onSetStartRoom={setStartRoom}
              onRunRoom={(roomID, roomName, start) => void playProject({ roomID, roomName, startX: start?.x, startY: start?.y, startDirection: start?.direction })}
              runRoomDisabled={playProjectDisabled}
              onImportTileset={importTilesetForRoom}
              onImportTiledMap={importTiledMapForRoom}
              onUpdateHudPreset={updateHudPreset}
              onCreateHudVariationForRoom={createHudVariationForRoom}
              onBindHud={bindSceneHud}
              onSetActiveHudPreset={setActiveHudPreset}
              onDuplicateHudPreset={presetID => void duplicateHudPreset(presetID)}
              onRemoveHudPreset={presetID => void removeHudPreset(presetID)}
              onUpdateDialoguesUi={updateDialoguesUi}
              onUpdateInterfaceTheme={updateInterfaceTheme}
              onImportAssets={importAssets}
              onAnalyzeProjectBudget={() => void analyzeProjectBudget()}
              onOpenProjectHealth={openProjectHealth}
              onOpenEvent={(eventName, sourceRoomName) => {
                const requestID = ++focusedEventRequestSequence.current;
                if (sourceRoomName) {
                  setFocusedAssetRequest({
                    assetID: sourceRoomName,
                    assetName: sourceRoomName,
                    kind: "Room",
                    label: `Cena · ${sourceRoomName}`,
                    requestID,
                    targetName: sourceRoomName,
                    workspace: "Editor"
                  });
                }
                setFocusedEventRequest({
                  eventName,
                  requestID
                });
                openEventsInspector(eventName);
              }}
              onUpdateEventStep={updateEventStep}
              onOpenDialoguesWorkspace={(dialogueKey) => {
                if (dialogueKey) {
                  setFocusedAssetRequest({
                    assetID: dialogueKey,
                    assetName: dialogueKey,
                    kind: "Dialogue",
                    label: dialogueKey,
                    requestID: Date.now(),
                    targetName: dialogueKey,
                    workspace: "Dialogos"
                  });
                }
                setSelectedWorkspace("Dialogos");
                setStatus(dialogueKey ? `Diálogo selecionado no workspace: ${dialogueKey}.` : "Workspace Diálogos aberto.");
              }}
              onUpdateDialogue={updateDialogue}
              renderEventInspector={(eventName, triggerLabel) => (
                <EventInspectorPanel
                  eventName={eventName}
                  onAddEventStep={addEventStep}
                  onInsertEventSteps={insertEventSteps}
                  onBindEventToTarget={bindEventToTarget}
                  onConnectEventGraphNodes={connectEventGraphNodes}
                  onCreateBoundEventForTarget={createBoundEventForTarget}
                  onCreateEvent={createEvent}
                  onCreateVariable={createVariable}
                  onDuplicateEvent={duplicateEvent}
                  onExportEvent={exportEvent}
                  onRelayoutEventsGraph={relayoutEventsGraph}
                  onRemoveEvent={removeEvent}
                  onRemoveEventGraphEdge={removeEventGraphEdge}
                  onRemoveEventStep={removeEventStep}
                  onRemoveEventTargetBinding={removeEventTargetBinding}
                  onRemoveVariable={removeVariable}
                  onRenameEvent={renameEvent}
                  onRetargetEventGraphEdge={retargetEventGraphEdge}
                  onUpdateEventFields={updateEventFields}
                  onUpdateEventGraphNodePosition={updateEventGraphNodePosition}
                  onUpdateEventStep={updateEventStep}
                  onUpdateSceneRouteTable={updateSceneRouteTable}
                  onUpdateMenuSliderItem={updateMenuSliderItem}
                  presentation={eventsPresentation}
                  projectData={projectData ?? {}}
                  variables={session ? listProjectVariables(session.project.data) : []}
                  triggerLabel={triggerLabel}
                />
              )}
            />
          ) : selectedWorkspace === "Sprites" ? (
            <SpritesWorkspace
              presentation={spritesPresentation}
              projectPath={session?.path}
              focusedAssetName={focusedAssetRequest?.workspace === "Sprites" ? focusedAssetRequest.targetName ?? focusedAssetRequest.assetName : null}
              focusRequestID={focusedAssetRequest?.workspace === "Sprites" ? focusedAssetRequest.requestID : 0}
              onCreateAnimation={createSpriteAnimation}
              onImportSpriteSheets={importSpriteSheets}
              onUpdateAnimationFields={updateSpriteAnimationFields}
              onUpdateAnimationState={updateSpriteAnimationState}
              onUpdateMetaspriteFrame={updateSpriteMetaspriteFrame}
              onAddMetaspriteTile={addSpriteMetaspriteTile}
              onRemoveMetaspriteTile={removeSpriteMetaspriteTile}
              onUpdateMetaspriteTile={updateSpriteMetaspriteTile}
              onMoveMetaspriteTiles={moveSpriteMetaspriteTiles}
              onToggleMetaspriteTilesFlip={toggleSpriteMetaspriteTilesFlip}
              onReorderMetaspriteTiles={reorderSpriteMetaspriteTiles}
              onRemoveMetaspriteTiles={removeSpriteMetaspriteTiles}
              onFitAnimationHitbox={fitSpriteAnimationHitbox}
              onCopyAnimationGeometry={copySpriteAnimationGeometry}
              onGenerateSpriteFromReference={generateSpriteFromReference}
              onRenameAnimation={renameSpriteAnimation}
              onDuplicateAnimation={duplicateSpriteAnimation}
              onRemoveAnimation={removeSpriteAnimation}
              onRenameSpriteSheet={renameAsset}
              onDuplicateSpriteSheet={duplicateAsset}
              onRemoveSpriteSheet={removeAsset}
            />
          ) : selectedWorkspace === "Dialogos" ? (
            <DialoguesWorkspace
              key={selectedWorkspace}
              presentation={dialoguesPresentation}
              projectData={session?.project.data}
              projectPath={session?.path}

              focusedDialogueKey={focusedAssetRequest?.workspace === selectedWorkspace ? focusedAssetRequest.targetName ?? null : null}
              focusRequestID={focusedAssetRequest?.workspace === selectedWorkspace ? focusedAssetRequest.requestID : 0}
              onEditDialogue={openDialogueInEditor}



              onOpenDialogueEvent={openDialogueEvent}
              onExportDialogue={(key) => void exportDialogue(key)}
              onUpdateDialogue={updateDialogue}


            />
          ) : selectedWorkspace === "Audio" ? (
            <AudioWorkspace
              presentation={audioPresentation}
              projectPath={session?.path}
              previewStopRequest={audioPreviewStopRequest}
              sceneOptions={authoringReferenceOptions.rooms}
              focusedAssetName={focusedAssetRequest?.workspace === "Audio" ? focusedAssetRequest.targetName ?? focusedAssetRequest.assetName : null}
              focusRequestID={focusedAssetRequest?.workspace === "Audio" ? focusedAssetRequest.requestID : 0}
              onCreateAudioInstrument={createAudioInstrument}
              onUpdateAudioInstrument={updateAudioInstrument}
              onRemoveAudioInstrument={removeAudioInstrument}
              onCreateAudio={createAudio}
              onUpdateAudioFields={updateAudioFields}
              onUpdateAudioChannelFields={updateAudioChannelFields}
              onRenameAudioChannel={renameAudioChannel}
              onUpdateAudioChannelType={updateAudioChannelType}
              onCreateAudioChannel={createAudioChannel}
              onRemoveAudioChannel={removeAudioChannel}
              onSetAudioChannelNote={setAudioChannelNote}
              onApplyAudioPatternPreset={applyAudioPatternPreset}
              onMoveAudioChannelNote={moveAudioChannelNote}
              onTransposeAudioChannel={transposeAudioChannel}
              onTransposeAudioChannelNote={transposeAudioChannelNote}
              onUpdateAudioChannelNote={updateAudioChannelNote}
              onUpdateAudioPatternOrderSlot={updateAudioPatternOrderSlot}
              onCreateAudioPattern={createAudioPattern}
              onRenameAudioPattern={renameAudioPattern}
              onRemoveAudioPattern={removeAudioPattern}
              onSetActivePattern={setActiveAudioPattern}
              onDuplicatePattern={duplicateAudioPattern}
              onClearPatternSequence={clearAudioPatternSequence}
              onMovePatternOrderSlot={moveAudioPatternOrderSlot}
              onNormalizeAudio={normalizeAudio}
              onRenameAudio={renameAudio}
              onDuplicateAudio={duplicateAudio}
              onExportAudio={(audioID, currentName) => void exportAudio(audioID, currentName)}
              onImportAudio={() => void importAudio()}
              onRemoveAudio={removeAudio}
            />
          ) : selectedWorkspace === "Ajustes" || selectedWorkspace === "Cenas" || selectedWorkspace === "Exportar" ? (
            <SettingsWorkspace
              scope={selectedWorkspace === "Cenas" ? "scene" : selectedWorkspace === "Exportar" ? "export" : "global"}
              title={selectedWorkspace === "Cenas" ? "Cenas" : selectedWorkspace === "Exportar" ? "Exportar" : "Ajustes"}
              onOpenPluginCatalog={selectedWorkspace === "Ajustes" ? () => setPluginCatalogOpen(true) : undefined}
              advancedTools={selectedWorkspace === "Exportar" && projectData ? (
                <WorkspaceAdvancedTools
                  onChangeProjectData={commitProjectData}
                  onEnableTool={enableAdvancedTool}
                  presentation={advancedToolsPresentation}
                  projectData={projectData}
                  detail="Fontes, idiomas e dados avançados usados na exportação dos diálogos."
                  surface="Dialogos"
                  title="Diálogos: fontes e localização"
                />
              ) : null}
              presentation={settingsPresentation}
              pathValidation={settingsPathValidation}
              pathValidationRunning={settingsPathValidationRunning}
              engineStatus={engineStatus}
              doctorResult={doctorResult}
              doctorRunning={doctorRunning}
              buildDryRunResult={buildDryRunResult}
              buildDryRunRunning={buildDryRunRunning}
              hasEngineAssetc={hasEngineAssetc}
              hasEngineBuild={hasEngineBuild}
              hasCurrentEngineExport={hasCurrentEngineExport}
              focusedSectionID={selectedWorkspace === "Exportar"
                ? focusedExportSectionRequest?.sectionID ?? null
                : focusedAssetRequest?.workspace === selectedWorkspace ? focusedAssetRequest.targetName ?? null : null}
              focusRequestID={selectedWorkspace === "Exportar"
                ? focusedExportSectionRequest?.requestID ?? 0
                : focusedAssetRequest?.workspace === selectedWorkspace ? focusedAssetRequest.requestID : 0}
              projectData={projectData}
              roomsPresentation={roomsPresentation}
              assetPackReport={projectBudgetAnalysis?.report ?? null}
              projectPath={session?.path}
              enginePackPath={session ? mcpEnginePackPath(session.project.data) : undefined}
              getMcpServerRegistration={window.gbaStudio.getMcpServerRegistration}
              getCodexMcpServerRegistration={window.gbaStudio.getCodexMcpServerRegistration}
              onUpdateSetting={updateSetting}
              onApplySettingsPreset={applySettingsPreset}
              onSelectPath={(sectionID, field) => void selectSettingsPath(sectionID, field)}
              onValidatePaths={() => void validateSettingsPaths(selectedWorkspace === "Exportar" ? "export" : "global")}
              onResetSection={resetSettingsSection}
              onRunEngineDoctor={() => void runDoctor()}
              onRunEngineBuildDryRun={() => void runBuildDryRun()}
              onGenerateRom={() => void generateRom()}
              generateRomDisabled={generateRomDisabled}
              romRunning={playRunning}
              onPlayProject={() => void playProject()}
              playProjectDisabled={playProjectDisabled}
              onSceneAction={openSceneReviewAction}
              sceneActionHistory={sceneActionHistory}
              onOpenProjectDiagnostic={(diagnostic) => openProjectProblem({
                code: diagnostic.code,
                id: diagnostic.id,
                message: diagnostic.message,
                severity: diagnostic.severity,
                targetID: diagnostic.targetID,
                targetName: diagnostic.targetName,
                workspace: diagnostic.workspace
              })}
              projectHealthReport={selectedWorkspace === "Exportar" ? projectHealthReport : null}
            />
          ) : (
            <WorkspaceEmptyState
              title={t(workspaceLabelKey(selectedWorkspace))}
              description={t("shell.unportedDescription")}
              hint={t("shell.unportedHint")}
            />
          )}

        </section>
      </section>
      <StudioCommandPalette actions={commandActions} isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      <ProjectProblemsDrawer
        isOpen={problemsOpen}
        onClose={() => setProblemsOpen(false)}
        onOpenProblem={openProjectProblem}
        problems={projectProblems}
      />
      <TestingDiagnosticsDrawer
        inputRecording={inputRecording}
        inputReplay={inputReplaySession}
        isOpen={testingDiagnosticsOpen}
        onChangeProjectData={commitProjectData}
        onClose={() => setTestingDiagnosticsOpen(false)}
        onEnableTool={enableAdvancedTool}
        onRunReplay={runReplay}
        onToggleInputRecording={toggleInputRecording}
        presentation={advancedToolsPresentation}
        profilerHistory={hardwareProfilerHistory}
        profilerSession={hardwareProfilerSession}
        projectData={session.project.data}
        memoryReport={buildResult?.summary?.memoryReport}
        romOccupancy={buildResult?.summary?.romOccupancy}
        runtimeAudio={romPlayerTelemetry?.state === "running" ? romPlayerTelemetry.stats?.runtimeState?.audio : null}
      />
      <StudioStatusBar message={status} workspace={selectedWorkspace} isBusy={statusBusy} />
      {pluginCatalogOpen && session?.path ? (
        <PluginCatalogModal
          projectPath={session.path}
          onClose={() => setPluginCatalogOpen(false)}
          onInstalled={(registry) => {
            setPluginRegistry(registry);
            setPluginCatalogOpen(false);
          }}
          setStatus={setStatus}
        />
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StudioProviders>
      <App />
    </StudioProviders>
  </React.StrictMode>
);
