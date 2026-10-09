import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  ipcChannels,
  type AppCommand,
  type GBAStudioDesktopAPI,
  type ExternalAssetChangeEvent,
  type GenerateSpriteReferenceAssetRequest,
  type ImportAssetsRequest,
  type McpServerRegistrationRequest,
  type InspectAssetFileRequest,
  type ImportTiledMapRequest,
  type OpenProjectResult,
  type SaveProjectRequest,
  type SelectPathRequest,
  type ValidateSettingsPathsRequest
} from "../shared/ipc.js";
import type { RomPlayerFrameStats, RomPlayerTelemetryEvent } from "../shared/hardwareProfiler.js";
import type { WindowDocumentState } from "../shared/windowDocumentState.js";

const api: GBAStudioDesktopAPI = {
  platform: process.platform,
  onAppCommand: (listener: (command: AppCommand) => void) => {
    const subscription = (_event: IpcRendererEvent, command: AppCommand) => listener(command);
    ipcRenderer.on(ipcChannels.appCommand, subscription);
    return () => ipcRenderer.removeListener(ipcChannels.appCommand, subscription);
  },
  onExternalProjectOpen: (listener: (result: OpenProjectResult) => void) => {
    const subscription = (_event: IpcRendererEvent, result: OpenProjectResult) => listener(result);
    ipcRenderer.on(ipcChannels.externalProjectOpen, subscription);
    return () => ipcRenderer.removeListener(ipcChannels.externalProjectOpen, subscription);
  },
  onExternalAssetChange: (listener: (change: ExternalAssetChangeEvent) => void) => {
    const subscription = (_event: IpcRendererEvent, change: ExternalAssetChangeEvent) => listener(change);
    ipcRenderer.on(ipcChannels.externalAssetChange, subscription);
    return () => ipcRenderer.removeListener(ipcChannels.externalAssetChange, subscription);
  },
  onRomPlayerTelemetry: (listener: (telemetry: RomPlayerTelemetryEvent) => void) => {
    const subscription = (_event: IpcRendererEvent, telemetry: RomPlayerTelemetryEvent) => listener(telemetry);
    ipcRenderer.on(ipcChannels.romPlayerTelemetry, subscription);
    return () => ipcRenderer.removeListener(ipcChannels.romPlayerTelemetry, subscription);
  },
  publishRomPlayerTelemetry: (stats: RomPlayerFrameStats) => {
    ipcRenderer.send(ipcChannels.romPlayerTelemetry, stats);
  },
  confirmWindowClose: (confirmed = true) => ipcRenderer.invoke(ipcChannels.confirmWindowClose, confirmed),
  setWindowDocumentState: (state: WindowDocumentState) => ipcRenderer.invoke(ipcChannels.setWindowDocumentState, state),
  getLaunchProject: () => ipcRenderer.invoke(ipcChannels.getLaunchProject),
  getRecentProjects: () => ipcRenderer.invoke(ipcChannels.getRecentProjects),
  openProject: () => ipcRenderer.invoke(ipcChannels.openProject),
  openProjectAtPath: (path: string) => ipcRenderer.invoke(ipcChannels.openProjectAtPath, path),
  saveProject: (request: SaveProjectRequest) => ipcRenderer.invoke(ipcChannels.saveProject, request),
  revealPath: (path: string) => ipcRenderer.invoke(ipcChannels.revealPath, path),
  launchRomInEmulator: (request) => ipcRenderer.invoke(ipcChannels.launchRomInEmulator, request),
  openRomPlayerWindow: (request) => ipcRenderer.invoke(ipcChannels.openRomPlayerWindow, request),
  selectPath: (request: SelectPathRequest) => ipcRenderer.invoke(ipcChannels.selectPath, request),
  validateSettingsPaths: (request: ValidateSettingsPathsRequest) => ipcRenderer.invoke(ipcChannels.validateSettingsPaths, request),
  getMcpServerRegistration: (request: McpServerRegistrationRequest) => ipcRenderer.invoke(ipcChannels.getMcpServerRegistration, request),
  getCodexMcpServerRegistration: (request: McpServerRegistrationRequest) => ipcRenderer.invoke(ipcChannels.getCodexMcpServerRegistration, request),
  importAssets: (request: ImportAssetsRequest) => ipcRenderer.invoke(ipcChannels.importAssets, request),
  inspectAssetFile: (request: InspectAssetFileRequest) => ipcRenderer.invoke(ipcChannels.inspectAssetFile, request),
  importTiledMap: (request: ImportTiledMapRequest) => ipcRenderer.invoke(ipcChannels.importTiledMap, request),
  generateSpriteReferenceAsset: (request: GenerateSpriteReferenceAssetRequest) => ipcRenderer.invoke(ipcChannels.generateSpriteReferenceAsset, request),
  inspectEnginePack: (preferredPath) => ipcRenderer.invoke(ipcChannels.inspectEnginePack, preferredPath),
  runEnginePackDoctor: (options) => ipcRenderer.invoke(ipcChannels.runEnginePackDoctor, options),
  runEnginePackBuildDryRun: (projectDir, enginePackPath) => ipcRenderer.invoke(ipcChannels.runEnginePackBuildDryRun, projectDir, enginePackPath),
  runEnginePackBuild: (projectDir, enginePackPath, projectPath) => ipcRenderer.invoke(
    ipcChannels.runEnginePackBuild,
    projectDir,
    enginePackPath,
    projectPath
  ),
  analyzeScene: (request) => ipcRenderer.invoke(ipcChannels.analyzeScene, request),
  analyzeProjectBudget: (request) => ipcRenderer.invoke(ipcChannels.analyzeProjectBudget, request),
  exportEngineProject: (request) => ipcRenderer.invoke(ipcChannels.exportEngineProject, request),
  exportWebProject: (request) => ipcRenderer.invoke(ipcChannels.exportWebProject, request),
  exportDialogue: (request) => ipcRenderer.invoke(ipcChannels.exportDialogue, request),
  exportAudio: (request) => ipcRenderer.invoke(ipcChannels.exportAudio, request),
  exportEvent: (request) => ipcRenderer.invoke(ipcChannels.exportEvent, request),
  loadProjectPlugins: (request) => ipcRenderer.invoke(ipcChannels.loadProjectPlugins, request),
  installProjectPlugin: (request) => ipcRenderer.invoke(ipcChannels.installProjectPlugin, request),
  fetchPluginRepository: (request) => ipcRenderer.invoke(ipcChannels.fetchPluginRepository, request),
  installPluginFromCatalog: (request) => ipcRenderer.invoke(ipcChannels.installPluginFromCatalog, request),
  getTranslationPackStatus: () => ipcRenderer.invoke(ipcChannels.getTranslationPackStatus),
  downloadTranslationPack: (packID: string) => ipcRenderer.invoke(ipcChannels.downloadTranslationPack, packID),
  removeTranslationPack: (packID: string) => ipcRenderer.invoke(ipcChannels.removeTranslationPack, packID)
};

contextBridge.exposeInMainWorld("gbaStudio", api);
