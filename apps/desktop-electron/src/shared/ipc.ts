import type { AnalyzeSceneRequest, SceneAnalysisResult } from "./sceneAnalysis.js";
import type { ParsedGBAProject } from "./projectFile.js";
import type { WindowDocumentState } from "./windowDocumentState.js";
import type { SerializableProjectPluginRegistry } from "./gbaStudioPlugins.js";
import type { PluginRepository, PluginRepositoryEntry } from "./gbaStudioPluginRepository.js";
import type { RomPlayerFrameStats, RomPlayerTelemetryEvent } from "./hardwareProfiler.js";
import type { ProjectBudgetAnalysisResult } from "./projectBudget.js";
import type { InputReplay } from "./inputReplay.js";
import type { GBAKeyboardBindings } from "./gbaControls.js";
import type { TranslationPackStatus } from "./translationPacks.js";

export type AppCommand =
  | "project:open"
  | "project:save"
  | "project:save-as"
  | "project:play"
  | "project:export-rom"
  | "project:install-plugin"
  | "project:plugin-catalog"
  | "engine:export"
  | "edit:undo"
  | "edit:redo"
  | "window:request-close";

export interface OpenProjectResult {
  canceled: boolean;
  path?: string;
  project?: ParsedGBAProject;
  importReport?: GBStudioProjectImportSummary;
  error?: string;
}

export interface ExternalAssetChangeEvent {
  projectPath: string;
  relativePaths: string[];
}

export interface GBStudioProjectImportSummary {
  kind: "gb-studio";
  sourcePath: string;
  resourceCount: number;
  copiedAssetCount: number;
  translatedEventCount: number;
  unsupportedEventCount: number;
  warningCount: number;
  diagnosticCount: number;
}

export interface RecentProjectEntry {
  path: string;
  name: string;
}

export interface SaveProjectRequest {
  path?: string;
  project: ParsedGBAProject;
}

export interface SaveProjectResult {
  canceled: boolean;
  path?: string;
  error?: string;
}

export interface RevealPathResult {
  ok: boolean;
  path?: string;
  error?: string;
}

export interface LaunchRomInEmulatorRequest {
  romPath: string;
  emulatorPath?: string;
}

export interface LaunchRomInEmulatorResult {
  ok: boolean;
  error?: string;
  launchMethod?: string;
}

export interface OpenRomPlayerWindowRequest {
  romPath: string;
  title?: string;
  replay?: InputReplay;
  keyboardBindings?: GBAKeyboardBindings;
}

export interface OpenRomPlayerWindowResult {
  ok: boolean;
  windowID?: number;
  windowState?: {
    width: number;
    height: number;
    fullscreen: boolean;
    maximized: boolean;
  };
  error?: string;
}

export interface SelectPathRequest {
  title: string;
  mode: "directory" | "file" | "file-or-directory";
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

export interface SelectPathResult {
  canceled: boolean;
  path?: string;
  error?: string;
}

export interface SettingsPathValidationTarget {
  id: string;
  label: string;
  path: string;
  validationPath?: string;
  allowCreate?: boolean;
  mode: "directory" | "file";
  expectedTools?: string[];
  expectedFiles?: string[];
}

export interface ValidateSettingsPathsRequest {
  targets: SettingsPathValidationTarget[];
}

export type SettingsPathValidationKind = "directory" | "file" | "missing" | "other";

export interface SettingsPathValidationItem {
  id: string;
  label: string;
  path: string;
  resolvedPath?: string;
  mode: "directory" | "file";
  kind: SettingsPathValidationKind;
  exists: boolean;
  creatable?: boolean;
  ok: boolean;
  missingTools: string[];
  missingFiles: string[];
  error?: string;
}

export interface ValidateSettingsPathsResult {
  ok: boolean;
  items: SettingsPathValidationItem[];
  error?: string;
}

export interface ImportAssetsRequest {
  projectPath: string;
  scope?: "animation" | "audio" | "all" | "sprite" | "tileset";
  replaceRelativePath?: string;
}

export interface ImportedAssetFile {
  id: string;
  metadata?: Record<string, unknown>;
  name: string;
  relativePath: string;
  kind: string;
  systemImage: string;
}

export interface ImportedAnimationSequence {
  frameAssetNames: string[];
  frameCount: number;
  frameDurations: number[];
  height: number;
  sourceAssetName: string;
  totalDurationFrames: number;
  width: number;
}

export interface ImportAssetsResult {
  canceled: boolean;
  assets?: ImportedAssetFile[];
  animation?: ImportedAnimationSequence;
  error?: string;
}

export interface InspectAssetFileRequest {
  projectPath: string;
  source: string;
  assetID?: string;
  colorMode?: "4bpp" | "8bpp";
}

export type AssetPipelineStageStatus = "complete" | "attention" | "pending";

export interface InspectAssetPipelineResult {
  preparedStatus: AssetPipelineStageStatus;
  preparedDetail?: string;
  exportedStatus: AssetPipelineStageStatus;
  exportedDetail?: string;
  reportPath?: string;
  exportPath?: string;
}

export interface InspectAssetFileResult {
  exists: boolean;
  format: string;
  byteSize?: number;
  width?: number;
  height?: number;
  estimatedGbaBytes?: number;
  gbaBudgetPercent?: number;
  pipeline?: InspectAssetPipelineResult;
}

export interface ImportTiledMapRequest {
  projectPath: string;
}

export interface ImportTiledMapResult {
  canceled: boolean;
  error?: string;
  sourcePath?: string;
  parsed?: {
    width: number;
    height: number;
    tileWidth: number;
    tileHeight: number;
    tilemap: number[];
    layerName: string;
    tilesetImage: string | null;
    tilesetName: string | null;
  };
  importedTileset?: ImportedAssetFile;
  backgroundAssetName?: string;
}

export interface GenerateSpriteReferenceAssetRequest {
  projectPath: string;
  referenceAssetName: string;
  spriteSheetName: string;
}

export interface GenerateSpriteReferenceAssetResult {
  canceled: boolean;
  name?: string;
  relativePath?: string;
  error?: string;
}

export interface EnginePackCandidate {
  label: string;
  path: string;
  exists: boolean;
  assetcPath?: string;
  hasAssetc: boolean;
  gbsdoctorPath?: string;
  hasGbsdoctor: boolean;
  gbsbuildPath?: string;
  hasGbsbuild: boolean;
}

export interface EnginePackStatus {
  platform: NodeJS.Platform;
  candidates: EnginePackCandidate[];
  selected?: EnginePackCandidate;
}

export interface EnginePackDoctorBlocker {
  id: string;
  message: string;
}

export interface EnginePackDoctorSummary {
  ok: boolean;
  version: string | null;
  enginePackPath: string | null;
  platform: string | null;
  engineVersion: string | null;
  checksPassed: number;
  checksTotal: number;
  blockers: EnginePackDoctorBlocker[];
}

export interface EnginePackDoctorResult {
  ran: boolean;
  exitCode: number | null;
  command?: string;
  summary?: EnginePackDoctorSummary;
  stderr?: string;
  error?: string;
}

export interface EnginePackBuildDryRunSummary {
  command: string[];
  target: string | null;
  projectDir: string | null;
  buildDir: string | null;
}

export interface EnginePackBuildDryRunResult {
  ran: boolean;
  exitCode: number | null;
  command?: string;
  summary?: EnginePackBuildDryRunSummary;
  stderr?: string;
  error?: string;
}

export interface EnginePackBuildSummary {
  target: string;
  projectDir: string;
  buildDir: string;
  romPath: string;
  romBytes?: number;
  romOccupancyPath?: string;
  romOccupancy?: import("./romOccupancy.js").RomOccupancyReport;
  memoryReportPath?: string;
  memoryReport?: import("./projectMemory.js").ProjectMemoryReport;
}

export interface EnginePackBuildResult {
  ran: boolean;
  exitCode: number | null;
  command?: string;
  summary?: EnginePackBuildSummary;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface ExportEngineProjectRequest {
  project: ParsedGBAProject;
  projectPath?: string;
  destinationRoot?: string;
  developmentStartScene?: DevelopmentSceneLaunch;
}

export interface DevelopmentSceneLaunch {
  id?: string;
  name?: string;
  x?: number;
  y?: number;
  direction?: string;
}

export interface AnalyzeProjectBudgetRequest {
  project: ParsedGBAProject;
  projectPath?: string;
}

export interface EnginePackInvocationOptions {
  projectDir?: string;
  enginePackPath?: string;
}

export interface ExportEngineProjectResult {
  canceled: boolean;
  destination?: string;
  files?: string[];
  warnings?: string[];
  target?: string;
  error?: string;
}

export interface ExportWebProjectRequest {
  project: ParsedGBAProject;
  projectPath?: string;
}

export interface ExportWebProjectResult {
  canceled: boolean;
  destination?: string;
  files?: string[];
  target?: string;
  error?: string;
  romResolved?: boolean;
  romSource?: "explicit" | "discovered" | "built";
  romWarning?: string;
}

export interface ExportDialogueRequest {
  project: ParsedGBAProject;
  key: string;
}

export interface ExportDialogueResult {
  canceled: boolean;
  path?: string;
  error?: string;
}

export interface ExportAudioRequest {
  project: ParsedGBAProject;
  audioID: string;
}

export interface ExportAudioResult {
  canceled: boolean;
  path?: string;
  error?: string;
}

export interface ExportEventRequest {
  project: ParsedGBAProject;
  eventID: string;
}

export interface ExportEventResult {
  canceled: boolean;
  path?: string;
  error?: string;
}

export interface LoadProjectPluginsRequest {
  projectPath: string;
}

export interface LoadProjectPluginsResult {
  ok: boolean;
  registry?: SerializableProjectPluginRegistry;
  error?: string;
}

export interface InstallProjectPluginRequest {
  projectPath: string;
  sourcePath: string;
  replacingExisting?: boolean;
}

export interface InstallProjectPluginResult {
  ok: boolean;
  pluginId?: string;
  destination?: string;
  registry?: SerializableProjectPluginRegistry;
  importedAssets?: Array<{
    pluginId: string;
    source: string;
    relativePath: string;
    name: string;
    kind: string;
  }>;
  error?: string;
}

export interface FetchPluginRepositoryRequest {
  repositoryURL: string;
}

export interface McpServerRegistrationRequest {
  projectPath: string;
  enginePackPath?: string;
}

export interface FetchPluginRepositoryResult {
  ok: boolean;
  repository?: PluginRepository;
  error?: string;
}

export interface InstallPluginFromCatalogRequest {
  projectPath: string;
  repositoryBaseURL: string;
  entry: PluginRepositoryEntry;
  replacingExisting?: boolean;
}

export interface InstallPluginFromCatalogResult {
  ok: boolean;
  pluginId?: string;
  destination?: string;
  registry?: SerializableProjectPluginRegistry;
  error?: string;
}

export interface TranslationPackStatusResult {
  ok: boolean;
  packs: TranslationPackStatus[];
  error?: string;
}

export interface DownloadTranslationPackResult {
  ok: boolean;
  packID?: string;
  error?: string;
}

export interface GBAStudioDesktopAPI {
  platform: NodeJS.Platform;
  onAppCommand(listener: (command: AppCommand) => void): () => void;
  onExternalProjectOpen(listener: (result: OpenProjectResult) => void): () => void;
  onExternalAssetChange(listener: (event: ExternalAssetChangeEvent) => void): () => void;
  onRomPlayerTelemetry(listener: (telemetry: RomPlayerTelemetryEvent) => void): () => void;
  publishRomPlayerTelemetry(stats: RomPlayerFrameStats): void;
  confirmWindowClose(confirmed?: boolean): Promise<void>;
  setWindowDocumentState(state: WindowDocumentState): Promise<void>;
  getLaunchProject(): Promise<OpenProjectResult>;
  getRecentProjects(): Promise<RecentProjectEntry[]>;
  openProject(): Promise<OpenProjectResult>;
  openProjectAtPath(path: string): Promise<OpenProjectResult>;
  saveProject(request: SaveProjectRequest): Promise<SaveProjectResult>;
  revealPath(path: string): Promise<RevealPathResult>;
  launchRomInEmulator(request: LaunchRomInEmulatorRequest): Promise<LaunchRomInEmulatorResult>;
  openRomPlayerWindow(request: OpenRomPlayerWindowRequest): Promise<OpenRomPlayerWindowResult>;
  selectPath(request: SelectPathRequest): Promise<SelectPathResult>;
  validateSettingsPaths(request: ValidateSettingsPathsRequest): Promise<ValidateSettingsPathsResult>;
  getMcpServerRegistration(request: McpServerRegistrationRequest): Promise<string>;
  getCodexMcpServerRegistration(request: McpServerRegistrationRequest): Promise<string>;
  importAssets(request: ImportAssetsRequest): Promise<ImportAssetsResult>;
  inspectAssetFile(request: InspectAssetFileRequest): Promise<InspectAssetFileResult>;
  importTiledMap(request: ImportTiledMapRequest): Promise<ImportTiledMapResult>;
  generateSpriteReferenceAsset(request: GenerateSpriteReferenceAssetRequest): Promise<GenerateSpriteReferenceAssetResult>;
  inspectEnginePack(preferredPath?: string): Promise<EnginePackStatus>;
  runEnginePackDoctor(options?: EnginePackInvocationOptions): Promise<EnginePackDoctorResult>;
  runEnginePackBuildDryRun(projectDir: string, enginePackPath?: string): Promise<EnginePackBuildDryRunResult>;
  runEnginePackBuild(projectDir: string, enginePackPath?: string, projectPath?: string): Promise<EnginePackBuildResult>;
  analyzeScene(request: AnalyzeSceneRequest): Promise<SceneAnalysisResult>;
  analyzeProjectBudget(request: AnalyzeProjectBudgetRequest): Promise<ProjectBudgetAnalysisResult>;
  exportEngineProject(request: ExportEngineProjectRequest): Promise<ExportEngineProjectResult>;
  exportWebProject(request: ExportWebProjectRequest): Promise<ExportWebProjectResult>;
  exportDialogue(request: ExportDialogueRequest): Promise<ExportDialogueResult>;
  exportAudio(request: ExportAudioRequest): Promise<ExportAudioResult>;
  exportEvent(request: ExportEventRequest): Promise<ExportEventResult>;
  loadProjectPlugins(request: LoadProjectPluginsRequest): Promise<LoadProjectPluginsResult>;
  installProjectPlugin(request: InstallProjectPluginRequest): Promise<InstallProjectPluginResult>;
  fetchPluginRepository(request: FetchPluginRepositoryRequest): Promise<FetchPluginRepositoryResult>;
  installPluginFromCatalog(request: InstallPluginFromCatalogRequest): Promise<InstallPluginFromCatalogResult>;
  getTranslationPackStatus(): Promise<TranslationPackStatusResult>;
  downloadTranslationPack(packID: string): Promise<DownloadTranslationPackResult>;
  removeTranslationPack(packID: string): Promise<DownloadTranslationPackResult>;
}

export const ipcChannels = {
  appCommand: "app:command",
  confirmWindowClose: "window:confirm-close",
  setWindowDocumentState: "window:set-document-state",
  externalProjectOpen: "project:external-open",
  externalAssetChange: "assets:external-change",
  getLaunchProject: "project:get-launch",
  getRecentProjects: "project:get-recent",
  openProject: "project:open",
  openProjectAtPath: "project:open-at-path",
  saveProject: "project:save",
  revealPath: "shell:reveal-path",
  launchRomInEmulator: "shell:launch-rom-in-emulator",
  openRomPlayerWindow: "rom-player:open-window",
  romPlayerTelemetry: "rom-player:telemetry",
  selectPath: "shell:select-path",
  validateSettingsPaths: "settings:validate-paths",
  getMcpServerRegistration: "mcp:get-server-registration",
  getCodexMcpServerRegistration: "mcp:get-codex-server-registration",
  importAssets: "assets:import",
  inspectAssetFile: "assets:inspect-file",
  importTiledMap: "assets:import-tiled-map",
  generateSpriteReferenceAsset: "assets:generate-sprite-reference",
  inspectEnginePack: "engine-pack:inspect",
  runEnginePackDoctor: "engine-pack:doctor",
  runEnginePackBuildDryRun: "engine-pack:build-dry-run",
  runEnginePackBuild: "engine-pack:build",
  analyzeScene: "scene:analyze",
  analyzeProjectBudget: "engine-project:analyze-budget",
  exportEngineProject: "engine-project:export",
  exportWebProject: "web-project:export",
  exportDialogue: "dialogue:export",
  exportAudio: "audio:export",
  exportEvent: "event:export",
  loadProjectPlugins: "plugins:load",
  installProjectPlugin: "plugins:install",
  fetchPluginRepository: "plugins:fetch-repository",
  installPluginFromCatalog: "plugins:install-from-catalog",
  getTranslationPackStatus: "translation-pack:status",
  downloadTranslationPack: "translation-pack:download",
  removeTranslationPack: "translation-pack:remove"
} as const;
