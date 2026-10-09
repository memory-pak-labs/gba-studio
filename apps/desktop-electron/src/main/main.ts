import { createSceneAnalysisService, JevDecisionProvider } from "./sceneAnalysisService.js";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { app, BrowserWindow, dialog, ipcMain, screen, shell } from "electron";
import { delimiter, dirname, join, resolve } from "node:path";
import { prepareEngineProjectExport, resolveSmokeEngineExportRoot } from "./exportEngineProject.js";
import { prepareWebProjectExport, resolveSmokeWebExportRoot, writeWebProjectExport } from "./exportWebProject.js";
import { buildProjectRomArtifact } from "./webRomPipeline.js";
import { launchRomInEmulator } from "./launchRomInEmulator.js";
import { openRomPlayerWindow } from "./romPlayerWindow.js";
import { installAppMenu } from "./appMenu.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { projectPersistentBuildCacheEnabled } from "./engineBuildCache.js";
import { writeProjectMemoryReport } from "./projectMemoryReport.js";
import { writeRomOccupancyArtifact } from "./romOccupancyArtifact.js";
import { readProjectEnginePackPath } from "../shared/engineRomPipeline.js";
import { inspectEnginePack, readEnginePackVersion, runSelectedEnginePackBuild, runSelectedEnginePackBuildDryRun, runSelectedEnginePackDoctor } from "./enginePack.js";
import { copyFilesIntoProjectAssets, copyReferenceImageIntoProjectAssets, reimportFileIntoProjectAsset } from "./importAssets.js";
import { importGifAnimationIntoProjectAssets } from "./gifAnimationImport.js";
import { inspectAssetFile } from "./inspectAssetFile.js";
import { prepareTiledMapImport } from "./importTiledMap.js";
import {
  fetchPluginRepository,
  installPluginFromRepositoryEntry,
  installPluginIntoProject,
  loadProjectPlugins
} from "./gbaStudioPluginLoader.js";
import { serializeProjectPluginRegistry } from "../shared/gbaStudioPlugins.js";
import { loadLaunchProject, resolveLaunchProject, resolveCurrentLaunchProjectPath, resolveLaunchProjectPath } from "./launchProject.js";
import { preloadScriptPath } from "./mainPaths.js";
import { projectOpenDialogOptions, projectSaveDialogOptions } from "./projectDialogs.js";
import { openProjectFile, resolveProjectSaveDestination, saveProjectFileAtomically } from "./projectPersistence.js";
import { createExternalAssetWatcher, type ExternalAssetWatcher } from "./externalAssetWatcher.js";
import { publishEnginePackRomToProjectRoot } from "./projectRomPublication.js";
import { analyzePreparedProjectBudget } from "./projectBudgetAnalysis.js";
import { listRecentProjects } from "./recentProjects.js";
import { configureSmokeDevToolsPort, isPreviewVisualSmokeMode, previewVisualSmokeUrl } from "./smoke.js";
import { resolveSmokeProjectSavePath } from "./smokePaths.js";
import { validateSettingsPathTargets } from "./settingsPathValidation.js";
import { resolveMainWindowBounds, resolveMainWindowChrome } from "./windowOptions.js";
import { createWindowCloseGuard } from "./windowCloseGuard.js";
import { registerDesktopAssetProtocol } from "./desktopAssetProtocol.js";
import {
  registerTranslationModelProtocol,
  registerTranslationModelProtocolScheme,
  registerTranslationPackIpcHandlers
} from "./translationPacks.js";
import { prepareAudioExport } from "../shared/audioWorkspace.js";
import { prepareDialogueExport } from "../shared/dialoguesWorkspace.js";
import { prepareEventExport } from "../shared/eventsWorkspace.js";
import { createCodexMcpServerRegistration, createMcpServerRegistration } from "../shared/mcpSettings.js";
import { createLocalMcpRegistrationInput } from "./mcpRegistration.js";
import { parseMcpServerArguments } from "../mcp/mcpServerArguments.js";
import { runMcpServer } from "../mcp/mcpServer.js";
import {
  ipcChannels,
  type AnalyzeProjectBudgetRequest,
  type ExportAudioRequest,
  type ExportDialogueRequest,
  type FetchPluginRepositoryRequest,
  type InstallPluginFromCatalogRequest,
  type ExportEngineProjectRequest,
  type ExternalAssetChangeEvent,
  type ExportEventRequest,
  type ExportWebProjectRequest,
  type GenerateSpriteReferenceAssetRequest,
  type ImportAssetsRequest,
  type InspectAssetFileRequest,
  type ImportTiledMapRequest,
  type InstallProjectPluginRequest,
  type LaunchRomInEmulatorRequest,
  type LoadProjectPluginsRequest,
  type McpServerRegistrationRequest,
  type OpenProjectResult,
  type OpenRomPlayerWindowRequest,
  type SaveProjectRequest,
  type SelectPathRequest,
  type ValidateSettingsPathsRequest
} from "../shared/ipc.js";
import type { WindowDocumentState } from "../shared/windowDocumentState.js";

configureSmokeDevToolsPort();
registerTranslationModelProtocolScheme();

const mcpServerMode = process.argv.includes("--mcp");

const windowCloseGuards = new WeakMap<BrowserWindow, ReturnType<typeof createWindowCloseGuard>>();
let pendingExternalProjectOpen: OpenProjectResult | null = null;
let externalAssetWatcher: ExternalAssetWatcher | null = null;
const desktopAssetProjectRoots = new Set<string>();

function targetWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

function deliverExternalProjectOpen(result: OpenProjectResult): void {
  const window = targetWindow();
  if (!window || window.webContents.isLoading()) {
    pendingExternalProjectOpen = result;
    return;
  }

  window.webContents.send(ipcChannels.externalProjectOpen, result);
}

function watchProjectAssets(projectPath: string): void {
  externalAssetWatcher?.dispose();
  externalAssetWatcher = null;
  const event: Omit<ExternalAssetChangeEvent, "relativePaths"> = { projectPath };
  try {
    externalAssetWatcher = createExternalAssetWatcher({
      assetsRoot: join(dirname(projectPath), "Assets"),
      onChange: (relativePaths) => {
        const window = targetWindow();
        if (!window || window.isDestroyed() || window.webContents.isLoading()) return;
        window.webContents.send(ipcChannels.externalAssetChange, { ...event, relativePaths });
      }
    });
  } catch {
    // A project without a readable Assets folder remains usable; explicit import still works.
  }
}

async function openExternalProject(projectPath: string): Promise<void> {
  const result = await loadLaunchProject(projectPath);
  registerRecentProject(result);
  deliverExternalProjectOpen(result);
}

function registerRecentProject(result: OpenProjectResult): void {
  if (!result.error && !result.canceled && result.path && result.project) {
    desktopAssetProjectRoots.add(resolve(dirname(result.path)));
    app.addRecentDocument(result.path);
    watchProjectAssets(result.path);
  }
}

function loadRendererSurface(window: BrowserWindow, query?: Record<string, string>): void {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL);
    Object.entries(query ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
    void window.loadURL(url.toString());
    return;
  }

  void window.loadFile(join(__dirname, "../renderer/index.html"), query ? { query } : undefined);
}

function createWindow(): BrowserWindow {
  const mainWindowBounds = resolveMainWindowBounds(screen.getPrimaryDisplay().workAreaSize);
  const window = new BrowserWindow({
    ...mainWindowBounds,
    ...resolveMainWindowChrome(process.platform),
    show: false,
    title: "GBA Studio",
    backgroundColor: "#151719",
    webPreferences: {
      preload: preloadScriptPath(__dirname),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  const closeGuard = createWindowCloseGuard(() => {
    window.webContents.send(ipcChannels.appCommand, "window:request-close");
  });

  window.once("ready-to-show", () => {
    if (window.isDestroyed()) return;
    if (!window.isMaximized()) window.maximize();
    window.show();
    window.focus();
  });

  window.on("close", (event) => {
    closeGuard.handleClose(event);
  });
  windowCloseGuards.set(window, closeGuard);

  loadRendererSurface(window);

  window.webContents.once("did-finish-load", () => {
    if (!pendingExternalProjectOpen) return;
    const pending = pendingExternalProjectOpen;
    pendingExternalProjectOpen = null;
    deliverExternalProjectOpen(pending);
  });

  return window;
}

ipcMain.handle(ipcChannels.confirmWindowClose, (event, confirmed = true) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;

  const closeGuard = windowCloseGuards.get(window);
  if (!confirmed) {
    closeGuard?.cancelClose();
    return;
  }

  const resumeAppQuit = closeGuard?.confirmClose();
  window.close();
  if (resumeAppQuit) app.quit();
});

ipcMain.handle(ipcChannels.setWindowDocumentState, (event, state: WindowDocumentState) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;

  window.setTitle(state.title);
  if (process.platform === "darwin") {
    window.setRepresentedFilename(state.representedFilename);
    window.setDocumentEdited(state.dirty);
  }
});

ipcMain.handle(ipcChannels.getLaunchProject, async () => {
  const result = await resolveLaunchProject();
  registerRecentProject(result);
  return result;
});

ipcMain.handle(ipcChannels.getRecentProjects, async () => listRecentProjects());

ipcMain.handle(ipcChannels.openProjectAtPath, async (_event, projectPath: string) => {
  const result = await loadLaunchProject(projectPath);
  registerRecentProject(result);
  return result;
});

ipcMain.handle(ipcChannels.openProject, async () => {
  const result = await dialog.showOpenDialog(projectOpenDialogOptions());

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const opened = await openProjectFile(result.filePaths[0]);
  registerRecentProject(opened);
  return opened;
});

ipcMain.handle(ipcChannels.saveProject, async (_event, request: SaveProjectRequest) => {
  const selectedDestination =
    request.path ??
    resolveSmokeProjectSavePath() ??
    (
      await dialog.showSaveDialog(projectSaveDialogOptions(request.project.summary.name))
    ).filePath;

  if (!selectedDestination) {
    return { canceled: true };
  }

  const destination = resolveProjectSaveDestination(
    request.path,
    selectedDestination,
    request.project.summary.name
  );

  try {
    await saveProjectFileAtomically(destination, request.project, {
      appPath: app.getAppPath(),
      bundledAssetConflictPolicy: request.path ? "preserve" : "replace"
    });
    desktopAssetProjectRoots.add(resolve(dirname(destination)));
    app.addRecentDocument(destination);
    watchProjectAssets(destination);
    return { canceled: false, path: destination };
  } catch (error) {
    return {
      canceled: false,
      path: destination,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle(ipcChannels.exportDialogue, async (_event, request: ExportDialogueRequest) => {
  const prepared = prepareDialogueExport(request.project.data, request.key);
  if (!prepared) {
    return { canceled: false, error: "Dialogo nao encontrado para exportacao." };
  }

  const destination = (
    await dialog.showSaveDialog({
      title: "Exportar dialogo",
      defaultPath: prepared.fileName,
      filters: [{ name: "GBA Studio Dialogue", extensions: ["json"] }]
    })
  ).filePath;

  if (!destination) {
    return { canceled: true };
  }

  try {
    await writeFile(destination, prepared.contents, "utf8");
    return { canceled: false, path: destination };
  } catch (error) {
    return {
      canceled: false,
      path: destination,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle(ipcChannels.exportAudio, async (_event, request: ExportAudioRequest) => {
  const prepared = prepareAudioExport(request.project.data, request.audioID);
  if (!prepared) {
    return { canceled: false, error: "Audio nao encontrado para exportacao." };
  }

  const destination = (
    await dialog.showSaveDialog({
      title: "Exportar audio",
      defaultPath: prepared.fileName,
      filters: [{ name: "GBA Studio Audio", extensions: ["json"] }]
    })
  ).filePath;

  if (!destination) {
    return { canceled: true };
  }

  try {
    await writeFile(destination, prepared.contents, "utf8");
    return { canceled: false, path: destination };
  } catch (error) {
    return {
      canceled: false,
      path: destination,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle(ipcChannels.exportEvent, async (_event, request: ExportEventRequest) => {
  const prepared = prepareEventExport(request.project.data, request.eventID);
  if (!prepared) {
    return { canceled: false, error: "Evento nao encontrado para exportacao." };
  }

  const destination = (
    await dialog.showSaveDialog({
      title: "Exportar evento",
      defaultPath: prepared.fileName,
      filters: [{ name: "GBA Studio Event", extensions: ["json"] }]
    })
  ).filePath;

  if (!destination) {
    return { canceled: true };
  }

  try {
    await writeFile(destination, prepared.contents, "utf8");
    return { canceled: false, path: destination };
  } catch (error) {
    return {
      canceled: false,
      path: destination,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle(ipcChannels.loadProjectPlugins, async (_event, request: LoadProjectPluginsRequest) => {
  if (!request.projectPath?.trim()) {
    return { ok: false, error: "Projeto sem caminho salvo." };
  }

  try {
    const registry = await loadProjectPlugins(request.projectPath);
    return {
      ok: true,
      registry: serializeProjectPluginRegistry(registry)
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle(ipcChannels.installProjectPlugin, async (_event, request: InstallProjectPluginRequest) => {
  if (!request.projectPath?.trim()) {
    return { ok: false, error: "Salve o projeto antes de instalar plugins." };
  }

  const result = await installPluginIntoProject(request.projectPath, request.sourcePath, {
    replacingExisting: request.replacingExisting
  });
  if (!result.ok || !result.registry) {
    return { ok: false, error: result.error ?? "Falha ao instalar plugin." };
  }

  return {
    ok: true,
    pluginId: result.pluginId,
    destination: result.destination,
    registry: serializeProjectPluginRegistry(result.registry),
    importedAssets: result.importedAssets
  };
});

ipcMain.handle(ipcChannels.fetchPluginRepository, async (_event, request: FetchPluginRepositoryRequest) => {
  const fetched = await fetchPluginRepository(request.repositoryURL);
  if ("error" in fetched) {
    return { ok: false, error: fetched.error };
  }
  return { ok: true, repository: fetched.repository };
});

ipcMain.handle(ipcChannels.installPluginFromCatalog, async (_event, request: InstallPluginFromCatalogRequest) => {
  if (!request.projectPath?.trim()) {
    return { ok: false, error: "Salve o projeto antes de instalar plugins." };
  }

  const result = await installPluginFromRepositoryEntry(
    request.projectPath,
    request.repositoryBaseURL,
    request.entry,
    { replacingExisting: request.replacingExisting }
  );
  if (!result.ok || !result.registry) {
    return { ok: false, error: result.error ?? "Falha ao instalar plugin." };
  }

  return {
    ok: true,
    pluginId: result.pluginId,
    destination: result.destination,
    registry: serializeProjectPluginRegistry(result.registry)
  };
});

ipcMain.handle(ipcChannels.revealPath, (_event, revealPath: string) => {
  if (!revealPath) {
    return { ok: false, error: "Caminho vazio." };
  }

  shell.showItemInFolder(revealPath);
  return { ok: true, path: revealPath };
});

ipcMain.handle(ipcChannels.launchRomInEmulator, (_event, request: LaunchRomInEmulatorRequest) =>
  launchRomInEmulator(request)
);

ipcMain.handle(ipcChannels.openRomPlayerWindow, async (event, request: OpenRomPlayerWindowRequest) => {
  const parent = BrowserWindow.fromWebContents(event.sender);
  return openRomPlayerWindow({
    romPath: request.romPath,
    title: request.title,
    replay: request.replay,
    keyboardBindings: request.keyboardBindings,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    packaged: app.isPackaged,
    parent,
    mainDirectory: __dirname,
    onTelemetry: (telemetry) => {
      if (!parent || parent.isDestroyed()) return;
      parent.webContents.send(ipcChannels.romPlayerTelemetry, telemetry);
    }
  });
});

ipcMain.handle(ipcChannels.selectPath, async (_event, request: SelectPathRequest) => {
  const properties = request.mode === "directory"
    ? ["openDirectory", "createDirectory"]
    : request.mode === "file-or-directory"
      ? ["openFile", "openDirectory", "createDirectory"]
      : ["openFile"];

  const result = await dialog.showOpenDialog({
    title: request.title,
    defaultPath: request.defaultPath,
    properties: properties as Array<"openDirectory" | "openFile" | "createDirectory">,
    ...(request.filters ? { filters: request.filters } : {})
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const selectedPath = result.filePaths[0];
  return {
    canceled: false,
    path: selectedPath
  };
});

ipcMain.handle(ipcChannels.validateSettingsPaths, (_event, request: ValidateSettingsPathsRequest) => {
  return validateSettingsPathTargets(request.targets);
});

ipcMain.handle(ipcChannels.getMcpServerRegistration, (_event, request: McpServerRegistrationRequest) => {
  return createMcpServerRegistration(createLocalMcpRegistrationInput({
    appPath: app.getAppPath(),
    executablePath: process.execPath,
    isPackaged: app.isPackaged,
    projectPath: request.projectPath,
    enginePackPath: request.enginePackPath
  }));
});

ipcMain.handle(ipcChannels.getCodexMcpServerRegistration, (_event, request: McpServerRegistrationRequest) => {
  return createCodexMcpServerRegistration(createLocalMcpRegistrationInput({
    appPath: app.getAppPath(),
    executablePath: process.execPath,
    isPackaged: app.isPackaged,
    projectPath: request.projectPath,
    enginePackPath: request.enginePackPath
  }));
});

function smokeImportAssetPaths(): string[] {
  const rawValue = process.env.GBA_STUDIO_SMOKE_IMPORT_ASSETS?.trim();
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
  } catch {
    // Fall back to path-delimited input for ad-hoc smoke runs.
  }

  return rawValue
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

ipcMain.handle(ipcChannels.importAssets, async (_event, request: ImportAssetsRequest) => {
  if (!request.projectPath) {
    return { canceled: false, error: "Salve o projeto antes de importar assets." };
  }

  const smokeAssetPaths = smokeImportAssetPaths();
  if (smokeAssetPaths.length > 0) {
    try {
      const assets = await copyFilesIntoProjectAssets(request.projectPath, smokeAssetPaths, randomUUID);
      return { canceled: false, assets };
    } catch (error) {
      return {
        canceled: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  const audioScope = request.scope === "audio";
  const animationScope = request.scope === "animation";
  const tilesetScope = request.scope === "tileset";
  const spriteScope = request.scope === "sprite";
  const result = await dialog.showOpenDialog({
    title: animationScope ? "Importar animação GIF" : audioScope ? "Importar audio MOD/WAV" : tilesetScope ? "Importar tileset PNG" : spriteScope ? "Importar sprite PNG" : "Importar assets",
    properties: request.replaceRelativePath ? ["openFile"] : ["openFile", "multiSelections"],
    filters: animationScope
      ? [
        { name: "Animação GIF", extensions: ["gif"] },
        { name: "Todos os arquivos", extensions: ["*"] }
      ]
      : audioScope
      ? [
        { name: "Audio MOD/WAV", extensions: ["mod", "xm", "s3m", "it", "wav", "mp3", "ogg"] },
        { name: "Todos os arquivos", extensions: ["*"] }
      ]
      : tilesetScope || spriteScope
        ? [
          { name: spriteScope ? "Sprite PNG" : "Tileset PNG", extensions: ["png"] },
          { name: "Todos os arquivos", extensions: ["*"] }
        ]
      : [
        {
          name: "Assets comuns",
          extensions: ["png", "jpg", "jpeg", "webp", "bmp", "gif", "mod", "xm", "s3m", "it", "wav", "mp3", "ogg"]
        },
        { name: "Todos os arquivos", extensions: ["*"] }
      ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  try {
    if (animationScope) {
      const imported = await importGifAnimationIntoProjectAssets(request.projectPath, result.filePaths[0]!, randomUUID);
      return { canceled: false, assets: imported.assets, animation: imported.sequence };
    }
    const assets = request.replaceRelativePath
      ? [await reimportFileIntoProjectAsset(
        request.projectPath,
        result.filePaths[0],
        request.replaceRelativePath,
        randomUUID
      )]
      : await copyFilesIntoProjectAssets(
        request.projectPath,
        result.filePaths,
        randomUUID,
        tilesetScope ? { forcedKind: "Tileset" } : spriteScope ? { forcedKind: "Sprite" } : {}
      );
    return { canceled: false, assets };
  } catch (error) {
    return {
      canceled: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle(ipcChannels.inspectAssetFile, async (_event, request: InspectAssetFileRequest) => {
  return inspectAssetFile(request);
});

ipcMain.handle(ipcChannels.importTiledMap, async (_event, request: ImportTiledMapRequest) => {
  if (!request.projectPath) {
    return { canceled: false, error: "Salve o projeto antes de importar mapa Tiled." };
  }

  const result = await dialog.showOpenDialog({
    title: "Importar mapa Tiled",
    properties: ["openFile"],
    filters: [
      { name: "Tiled map", extensions: ["json", "tmx"] },
      { name: "Todos os arquivos", extensions: ["*"] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  try {
    const prepared = await prepareTiledMapImport(request.projectPath, result.filePaths[0]!);
    return {
      canceled: false,
      sourcePath: prepared.sourcePath,
      parsed: prepared.parsed,
      importedTileset: prepared.importedTileset,
      backgroundAssetName: prepared.backgroundAssetName
    };
  } catch (error) {
    return {
      canceled: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle(ipcChannels.generateSpriteReferenceAsset, async (_event, request: GenerateSpriteReferenceAssetRequest) => {
  if (!request.projectPath) {
    return { canceled: false, error: "Salve o projeto antes de gerar o sprite." };
  }

  if (!request.referenceAssetName) {
    return { canceled: false, error: "A referencia nao possui imagem de origem." };
  }

  try {
    const copied = await copyReferenceImageIntoProjectAssets(request);
    return { canceled: false, ...copied };
  } catch (error) {
    return {
      canceled: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle(ipcChannels.inspectEnginePack, (_event, preferredPath?: string) => inspectEnginePack({ preferredPath }));
ipcMain.handle(ipcChannels.runEnginePackDoctor, (_event, options) => runSelectedEnginePackDoctor(options));
ipcMain.handle(ipcChannels.runEnginePackBuildDryRun, (_event, projectDir: string, enginePackPath?: string) =>
  runSelectedEnginePackBuildDryRun(projectDir, enginePackPath)
);
ipcMain.handle(ipcChannels.runEnginePackBuild, async (
  _event,
  projectDir: string,
  enginePackPath?: string,
  projectPath?: string
) => {
  const built = await runSelectedEnginePackBuild(projectDir, enginePackPath);
  const romPath = built.error ? null : built.summary?.romPath;
  const occupancy = romPath
    ? await writeRomOccupancyArtifact(romPath)
    : null;
  const memory = romPath
    ? await writeProjectMemoryReport({
        assetReportPath: join(projectDir, "asset_pack_report.json"),
        romPath
      }).catch((error) => {
        console.warn("[main] writeProjectMemoryReport failed:", error);
        return null;
      })
    : null;
  const published = await publishEnginePackRomToProjectRoot(built, projectPath);
  return published.summary
    ? {
      ...published,
      summary: {
        ...published.summary,
        ...(occupancy ? {
          romOccupancyPath: occupancy.path,
          romOccupancy: occupancy.report
        } : {}),
        ...(memory ? {
          memoryReportPath: memory.path,
          memoryReport: memory.report
        } : {})
      }
    }
    : published;
});
// Opt-in, user-owned credential, main process only. No key is persisted or bridged.
const analyzeScene = createSceneAnalysisService({
  provider: process.env.GBA_STUDIO_JEV_ENABLED === "1" && process.env.TYPESAFE_API_KEY
    ? new JevDecisionProvider(process.env.TYPESAFE_API_KEY, process.env.GBA_STUDIO_JEV_MODEL || "jev-1.13.0")
    : undefined
});
ipcMain.handle(ipcChannels.analyzeScene, async (event, request) => {
  if (!BrowserWindow.fromWebContents(event.sender) || event.senderFrame !== event.sender.mainFrame) {
    throw new Error("Origem de análise inválida.");
  }
  return analyzeScene(request);
});
ipcMain.handle(ipcChannels.analyzeProjectBudget, async (_event, request: AnalyzeProjectBudgetRequest) => {
  const preferredEnginePackPath = readProjectEnginePackPath(request.project.data);
  const enginePackStatus = inspectEnginePack({ preferredPath: preferredEnginePackPath });
  const selectedEnginePack = enginePackStatus.selected;
  if (!selectedEnginePack?.assetcPath || !selectedEnginePack.hasAssetc) {
    return {
      ok: false,
      error: preferredEnginePackPath
        ? `Engine Pack configurado em Settings nao possui assetc: ${preferredEnginePackPath}`
        : "Nenhum GBAStudioEnginePack com assetc foi localizado."
    };
  }

  const pluginRegistry = request.projectPath
    ? await loadProjectPlugins(request.projectPath)
    : undefined;
  return analyzePreparedProjectBudget({
    assetcPath: selectedEnginePack.assetcPath,
    enginePackPath: selectedEnginePack.path,
    enginePackVersion: await readEnginePackVersion(selectedEnginePack.path) ?? undefined,
    pluginRegistry,
    project: request.project.data,
    projectPath: request.projectPath
  });
});
ipcMain.handle(ipcChannels.exportEngineProject, async (_event, request: ExportEngineProjectRequest) => {
  const preferredEnginePackPath = readProjectEnginePackPath(request.project.data);
  const enginePackStatus = inspectEnginePack({ preferredPath: preferredEnginePackPath });
  const selectedEnginePack = enginePackStatus.selected;
  if (!selectedEnginePack?.assetcPath || !selectedEnginePack.hasAssetc) {
    return {
      canceled: false,
      error: preferredEnginePackPath
        ? `Engine Pack configurado em Settings nao possui assetc: ${preferredEnginePackPath}`
        : "Nenhum GBAStudioEnginePack com assetc foi localizado."
    };
  }

  const pluginRegistry = request.projectPath
    ? await loadProjectPlugins(request.projectPath)
    : undefined;
  const prepared = prepareEngineProjectExport(request.project.data, {
    enginePackPath: selectedEnginePack.path,
    enginePackVersion: await readEnginePackVersion(selectedEnginePack.path) ?? undefined,
    pluginRegistry,
    developmentStartScene: request.developmentStartScene
  });
  if (!prepared.generated) {
    return { canceled: false, error: prepared.error ?? "Falha ao preparar exportacao Engine Pack." };
  }

  const generated = prepared.generated;
  const smokeExportRoot = resolveSmokeEngineExportRoot();
  const configuredExportRoot = request.destinationRoot?.trim();
  const result = smokeExportRoot
    ? { canceled: false, filePaths: [smokeExportRoot] }
    : configuredExportRoot
      ? { canceled: false, filePaths: [configuredExportRoot] }
    : await dialog.showOpenDialog({
        title: "Escolher pasta para exportar Engine Pack",
        properties: ["openDirectory", "createDirectory"]
      });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const destination = join(result.filePaths[0], generated.target);
  try {
    const written = await writeEngineSchemaExport({
      destination,
      prepared: generated,
      assetcPath: selectedEnginePack.assetcPath,
      projectPath: request.projectPath,
      cacheEnabled: projectPersistentBuildCacheEnabled(request.project.data)
    });
    return {
      canceled: false,
      destination: written.destination,
      files: written.files,
      warnings: written.warnings,
      target: generated.target
    };
  } catch (error) {
    return {
      canceled: false,
      destination,
      target: generated.target,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle(ipcChannels.exportWebProject, async (_event, request: ExportWebProjectRequest) => {
  const prepared = prepareWebProjectExport(request.project.data);
  if (!prepared.generated) {
    return { canceled: false, error: prepared.error ?? "Falha ao preparar exportacao Web." };
  }

  const generated = prepared.generated;
  const smokeExportRoot = resolveSmokeWebExportRoot();
  const result = smokeExportRoot
    ? { canceled: false, filePaths: [smokeExportRoot] }
    : await dialog.showOpenDialog({
        title: "Escolher pasta para exportar Web / itch.io",
        properties: ["openDirectory", "createDirectory"]
      });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const destination = join(result.filePaths[0], `${generated.target}-web`);
  try {
    const written = await writeWebProjectExport({
      destination,
      generated,
      projectPath: request.projectPath,
      projectData: request.project.data,
      requireRom: true,
      buildRom: request.projectPath
        ? async () => {
            const built = await buildProjectRomArtifact({
              data: request.project.data,
              projectPath: request.projectPath as string
            });
            if (built.error) {
              throw new Error(built.error);
            }
            return built.romPath;
          }
        : undefined
    });
    return {
      canceled: false,
      destination: written.destination,
      files: written.files,
      target: written.target,
      romResolved: written.romResolved,
      romSource: written.romSource,
      romWarning: written.romWarning
    };
  } catch (error) {
    return {
      canceled: false,
      destination,
      target: generated.target,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// Each stdio MCP client needs its own process and must not claim the editor's lock.
const singleInstanceLock = mcpServerMode || app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else if (!mcpServerMode) {
  app.on("second-instance", (_event, argv, cwd) => {
    const externalProjectPath = resolveLaunchProjectPath({ argv, cwd, env: {} });
    if (externalProjectPath) {
      void openExternalProject(externalProjectPath);
    }
    const window = targetWindow();
    window?.show();
    window?.focus();
  });
}

app.on("open-file", (event, projectPath) => {
  event.preventDefault();
  void openExternalProject(projectPath);
});

void app.whenReady().then(async () => {
  if (!singleInstanceLock) return;
  if (mcpServerMode) {
    try {
      await runMcpServer(parseMcpServerArguments(process.argv.slice(2)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Não foi possível iniciar o servidor MCP: ${message}\n`);
      app.exit(1);
    }
    return;
  }

  installAppMenu();
  registerDesktopAssetProtocol(desktopAssetProjectRoots);
  registerTranslationModelProtocol();
  registerTranslationPackIpcHandlers();
  const previewUrl = previewVisualSmokeUrl();
  if (isPreviewVisualSmokeMode() && previewUrl) {
    const previewWindow = new BrowserWindow({
      width: 1280,
      height: 900,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    void previewWindow.loadURL(previewUrl);
    return;
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  for (const window of BrowserWindow.getAllWindows()) {
    windowCloseGuards.get(window)?.requestAppQuit();
  }
});

app.on("window-all-closed", () => {
  externalAssetWatcher?.dispose();
  externalAssetWatcher = null;
  if (process.platform !== "darwin") {
    app.quit();
  }
});
