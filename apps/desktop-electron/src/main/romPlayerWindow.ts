import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import type { BrowserWindow as ElectronBrowserWindow, BrowserWindowConstructorOptions } from "electron";
import { preloadScriptPath } from "./mainPaths.js";
import { profilerSubsystems } from "../shared/hardwareProfiler.js";
import type {
  RomPlayerFrameStats,
  RomPlayerFrameBudgetTelemetry,
  RomPlayerEventTrace,
  RomPlayerHardwareTelemetry,
  RomPlayerAudioTelemetry,
  RomPlayerRuntimeEntityState,
  RomPlayerRuntimeState,
  RomPlayerSubsystemTelemetry,
  RomPlayerTelemetryEvent
} from "../shared/hardwareProfiler.js";
import { isInputReplayInitialState, type InputReplay, type InputReplayInitialState } from "../shared/inputReplay.js";
import type { GBAKeyboardBindings } from "../shared/gbaControls.js";
import { ipcChannels } from "../shared/ipc.js";
import { createRomPlayerBattery, registerRomPlayerBattery } from "./romPlayerBattery.js";
import { registerRomPlayerRecording } from "./romPlayerRecording.js";

export interface ResolveWebPlayerRootOptions {
  appPath: string;
  resourcesPath: string;
  packaged: boolean;
}

export interface RomPlayerServerOptions {
  recordingID?: string;
  recordInput?: boolean;
  recordingLaunch?: InputReplayInitialState["launch"];
  locale?: string;
  romPath: string;
  title: string;
  webPlayerRoot: string;
  inputReplay?: InputReplay;
  keyboardBindings?: GBAKeyboardBindings;
  desktopBattery?: boolean;
  softwareFramebuffer?: boolean;
}

export interface RomPlayerServer {
  url: string;
  close(): Promise<void>;
}

export interface OpenRomPlayerWindowRequest {
  recordingID?: string;
  recordInput?: boolean;
  recordingLaunch?: InputReplayInitialState["launch"];
  locale?: string;
  romPath: string;
  title?: string;
  saveScope?: string;
  replay?: InputReplay;
  keyboardBindings?: GBAKeyboardBindings;
}

export interface OpenRomPlayerWindowOptions extends OpenRomPlayerWindowRequest {
  appPath: string;
  resourcesPath: string;
  packaged: boolean;
  parent?: ElectronBrowserWindow | null;
  mainDirectory: string;
  onTelemetry?(telemetry: RomPlayerTelemetryEvent): void;
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

// The software GBA framebuffer does not need a GPU canvas backing store.
// Native Intel's initial GPU synchronization can stall its first frames.
export function preferSoftwarePlayerFramebuffer(
  platform: NodeJS.Platform = process.platform,
  architecture: string = process.arch,
  translated = false
): boolean {
  return platform === "darwin" && architecture === "x64" && !translated;
}

export function romPlayerBrowserWindowOptions(mainDirectory: string): BrowserWindowConstructorOptions {
  return {
    width: 720,
    height: 480,
    minWidth: 600,
    minHeight: 460,
    useContentSize: true,
    fullscreen: false,
    fullscreenable: false,
    simpleFullscreen: false,
    maximizable: false,
    show: false,
    title: "Play",
    backgroundColor: "#05060a",
    webPreferences: {
      preload: preloadScriptPath(mainDirectory),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  };
}

export function resolveWebPlayerRoot(options: ResolveWebPlayerRootOptions): string {
  return options.packaged
    ? path.join(options.resourcesPath, "WebPlayer")
    : path.join(options.appPath, "static", "WebPlayer");
}

export function contentTypeForPlayerPath(filePath: string): string {
  const lowercased = filePath.toLowerCase();
  if (lowercased.endsWith(".html")) return "text/html; charset=utf-8";
  if (lowercased.endsWith(".js") || lowercased.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (lowercased.endsWith(".css")) return "text/css; charset=utf-8";
  if (lowercased.endsWith(".json")) return "application/json; charset=utf-8";
  if (lowercased.endsWith(".wasm")) return "application/wasm";
  if (lowercased.endsWith(".gba") || lowercased.endsWith(".data")) return "application/octet-stream";
  return "application/octet-stream";
}

function sendText(response: ServerResponse, statusCode: number, message: string): void {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(message);
}

async function sendFile(response: ServerResponse, filePath: string, requestPath: string): Promise<void> {
  const info = await stat(filePath);
  if (!info.isFile()) {
    sendText(response, 404, "Arquivo nao encontrado.");
    return;
  }
  response.writeHead(200, {
    "Content-Type": contentTypeForPlayerPath(requestPath),
    "Content-Length": String(info.size),
    "Cache-Control": "no-store"
  });
  createReadStream(filePath).pipe(response);
}

function safePlayerAssetPath(webPlayerRoot: string, requestPath: string): string | null {
  const decoded = decodeURIComponent(requestPath);
  const relativePath = decoded.replace(/^\/+/, "");
  const resolvedRoot = path.resolve(webPlayerRoot);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)
    ? resolvedPath
    : null;
}

function runtimePlayerPath(options: Pick<RomPlayerServerOptions, "romPath" | "title" | "inputReplay" | "keyboardBindings" | "locale" | "desktopBattery" | "softwareFramebuffer" | "recordInput" | "recordingLaunch" | "recordingID">): string {
  const query = new URLSearchParams({
    rom: `../roms/${path.basename(options.romPath)}`,
    title: options.title
  });
  if (options.inputReplay) query.set("replay", "1");
  if (options.keyboardBindings) query.set("keyboard", "1");
  if (options.locale) query.set("locale", options.locale);
  if (options.desktopBattery) query.set("desktopBattery", "1");
  if (options.softwareFramebuffer) query.set("framebuffer", "cpu");
  if (options.recordInput) query.set("recordInput", "1");
  if (options.recordingID) query.set("recordingID", options.recordingID);
  if (options.recordingLaunch) query.set("recordingLaunch", JSON.stringify(options.recordingLaunch));
  return `/player/runtime.html?${query.toString()}`;
}

function finiteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

function nonnegativeInteger(value: unknown): value is number {
  return finiteInteger(value) && value >= 0;
}

function normalizeRuntimeEntityState(value: unknown): RomPlayerRuntimeEntityState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<RomPlayerRuntimeEntityState>;
  if (![candidate.x, candidate.y, candidate.direction].every(finiteInteger)) return null;
  return { x: candidate.x!, y: candidate.y!, direction: candidate.direction! };
}

const RUNTIME_HARDWARE_METRIC_IDS = [
  "bgTiles",
  "objTiles",
  "oam",
  "paletteColors",
  "vramBytes",
  "eventBytes",
  "audioBytes",
  "dmaBytes",
  "vblankTicks",
  "cpuWorkTicks"
] as const;

function normalizeHardwareTelemetry(value: unknown): RomPlayerHardwareTelemetry | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const telemetry: RomPlayerHardwareTelemetry = {};
  for (const id of RUNTIME_HARDWARE_METRIC_IDS) {
    const candidate = (value as Record<string, unknown>)[id];
    if (candidate === undefined) continue;
    if (!nonnegativeInteger(candidate)) return null;
    telemetry[id] = candidate;
  }
  return telemetry;
}

function normalizeAudioTelemetry(value: unknown): RomPlayerAudioTelemetry | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<RomPlayerAudioTelemetry>;
  if (![
    candidate.pcmSourceBytes,
    candidate.mixerBufferBytes,
    candidate.activeVoiceCount,
    candidate.pcmUnderrunCount,
    candidate.pcmSubmittedBlocks
  ].every(nonnegativeInteger)) return null;
  return {
    pcmSourceBytes: candidate.pcmSourceBytes!,
    mixerBufferBytes: candidate.mixerBufferBytes!,
    activeVoiceCount: candidate.activeVoiceCount!,
    pcmUnderrunCount: candidate.pcmUnderrunCount!,
    pcmSubmittedBlocks: candidate.pcmSubmittedBlocks!
  };
}

function normalizeSubsystemTelemetry(value: unknown): RomPlayerSubsystemTelemetry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<RomPlayerSubsystemTelemetry>;
  if (candidate.ticksPerSecond !== 262144 || !candidate.frameTicks || !candidate.scenePeakTicks ||
      typeof candidate.frameTicks !== "object" || typeof candidate.scenePeakTicks !== "object" ||
      Array.isArray(candidate.frameTicks) || Array.isArray(candidate.scenePeakTicks)) return null;
  const frameTicks: RomPlayerSubsystemTelemetry["frameTicks"] = {};
  const scenePeakTicks: RomPlayerSubsystemTelemetry["scenePeakTicks"] = {};
  for (const label of profilerSubsystems) {
    const frame = candidate.frameTicks[label], peak = candidate.scenePeakTicks[label];
    if (frame === undefined && peak === undefined) continue;
    if (!nonnegativeInteger(frame) || !nonnegativeInteger(peak) || frame > 0xFFFFFFFF || peak > 0xFFFFFFFF) return null;
    frameTicks[label] = frame;
    scenePeakTicks[label] = peak;
  }
  return { ticksPerSecond: 262144, frameTicks, scenePeakTicks };
}

function normalizeEventTrace(value: unknown): RomPlayerEventTrace | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as RomPlayerEventTrace;
  if (!nonnegativeInteger(candidate.sequence) || !Array.isArray(candidate.entries) || candidate.entries.length > 4) return null;
  const entries = candidate.entries.map(entry => {
    if (!entry || ![entry.commandAddress, entry.frame, entry.step, entry.op, entry.status, entry.waitFrames].every(nonnegativeInteger) || !Number.isInteger(entry.room)) return null;
    return { commandAddress: entry.commandAddress, frame: entry.frame, step: entry.step, op: entry.op, status: entry.status, room: entry.room, waitFrames: entry.waitFrames };
  });
  return entries.every(entry => entry !== null) ? { sequence: candidate.sequence, entries } : null;
}

function normalizeFrameBudget(value: unknown, runtime: Partial<RomPlayerRuntimeState>): RomPlayerFrameBudgetTelemetry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const b = value as RomPlayerFrameBudgetTelemetry;
  const uint = (n: unknown): n is number => nonnegativeInteger(n) && (n as number) <= 0xffffffff;
  if (b.frame !== runtime.frame || b.room !== runtime.currentRoom || b.runtimeKind !== runtime.runtimeKind || b.ticksPerSecond !== 262144 ||
    ![b.frame,b.dmaQueuedBytes,b.dmaDroppedTotal,b.sceneFrameCount].every(uint) || !b.sceneFrameCount ||
    ![b.dmaBytes,b.dmaTransfers,b.vblankWorkTicks,b.oamEnabled,b.sceneDmaBytes].every(n => n === null || uint(n)) ||
    !b.peaks || typeof b.peaks !== "object" || (b.oamEnabled !== null && b.oamEnabled > 128)) return null;
  for (const [key,current] of [["dma",b.dmaBytes],["vblank",b.vblankWorkTicks],["oam",b.oamEnabled]] as const) {
    const peak = b.peaks[key];
    if (current === null ? peak !== null : !peak || !uint(peak.value) || !uint(peak.frame) || peak.frame > b.frame || peak.value < current || (key === "oam" && peak.value > 128)) return null;
  }
  return {frame:b.frame,room:b.room,runtimeKind:b.runtimeKind,ticksPerSecond:b.ticksPerSecond,dmaBytes:b.dmaBytes,dmaTransfers:b.dmaTransfers,
    dmaQueuedBytes:b.dmaQueuedBytes,dmaDroppedTotal:b.dmaDroppedTotal,vblankWorkTicks:b.vblankWorkTicks,oamEnabled:b.oamEnabled,
    sceneFrameCount:b.sceneFrameCount,sceneDmaBytes:b.sceneDmaBytes,peaks:{dma:b.peaks.dma ? {...b.peaks.dma} : null,vblank:b.peaks.vblank ? {...b.peaks.vblank} : null,oam:b.peaks.oam ? {...b.peaks.oam} : null}};
}

function normalizeRuntimeState(value: unknown): RomPlayerRuntimeState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<RomPlayerRuntimeState>;
  const schema = candidate.schema;
  const player = normalizeRuntimeEntityState(candidate.player);
  const actor = normalizeRuntimeEntityState(candidate.firstActor);
  const collision = candidate.collision;
  const timing = candidate.timing;
  const input = candidate.input;
  if (
    (schema !== 2 && schema !== 3 && schema !== 4) || !finiteInteger(candidate.frame) || candidate.frame < 0 ||
    !finiteInteger(candidate.currentRoom) || !Array.isArray(candidate.variables) || candidate.variables.length !== 16 ||
    !finiteInteger(candidate.runtimeKind) || candidate.runtimeKind < -1 || candidate.runtimeKind > 12 ||
    !candidate.variables.every(finiteInteger) || !finiteInteger(candidate.flagBits) || candidate.flagBits < 0 ||
    !player || !actor || !finiteInteger(candidate.actorCount) || candidate.actorCount < 0 ||
    typeof candidate.firstActor?.visible !== "boolean" ||
    !finiteInteger(candidate.lastMusic) || !finiteInteger(candidate.lastSfx) ||
    !collision || typeof collision !== "object" ||
    ![
      collision.currentFlags,
      collision.currentSlope,
      collision.seenEffectBits,
      collision.seenSlopeBits,
      collision.blockedDirectionBits,
      candidate.triggerEnterCount,
      candidate.triggerLeaveCount,
      candidate.roomChangeCount,
      timing?.cpuWorkTicks,
      timing?.vblankWaitTicks,
      timing?.peakCpuWorkTicks,
      timing?.peakVblankWaitTicks,
      timing?.missedFrameCount,
      timing?.renderSkipCount,
      timing?.frameSkipPolicy,
      input?.held,
      input?.pressed,
      input?.released
    ].every(nonnegativeInteger)
  ) return null;
  const frameBudget = candidate.frameBudget == null ? null : normalizeFrameBudget(candidate.frameBudget,candidate);
  if (candidate.frameBudget != null && !frameBudget) return null;
  const audio = normalizeAudioTelemetry(candidate.audio);
  if (candidate.audio != null && !audio) return null;
  const subsystems = normalizeSubsystemTelemetry(candidate.subsystems);
  if (candidate.subsystems != null && !subsystems) return null;
  return {
    schema,
    frame: candidate.frame,
    currentRoom: candidate.currentRoom,
    runtimeKind: candidate.runtimeKind,
    variables: [...candidate.variables],
    flagBits: candidate.flagBits,
    player,
    actorCount: candidate.actorCount,
    firstActor: { ...actor, visible: candidate.firstActor.visible },
    lastMusic: candidate.lastMusic,
    lastSfx: candidate.lastSfx,
    collision: {
      currentFlags: collision.currentFlags,
      currentSlope: collision.currentSlope,
      seenEffectBits: collision.seenEffectBits,
      seenSlopeBits: collision.seenSlopeBits,
      blockedDirectionBits: collision.blockedDirectionBits
    },
    triggerEnterCount: candidate.triggerEnterCount!,
    triggerLeaveCount: candidate.triggerLeaveCount!,
    roomChangeCount: candidate.roomChangeCount!,
    timing: {
      cpuWorkTicks: timing!.cpuWorkTicks,
      vblankWaitTicks: timing!.vblankWaitTicks,
      peakCpuWorkTicks: timing!.peakCpuWorkTicks,
      peakVblankWaitTicks: timing!.peakVblankWaitTicks,
      missedFrameCount: timing!.missedFrameCount,
      renderSkipCount: timing!.renderSkipCount,
      frameSkipPolicy: timing!.frameSkipPolicy
    },
    input: {
      held: input!.held,
      pressed: input!.pressed,
      released: input!.released
    },
    ...(frameBudget ? {frameBudget} : {}),
    ...(schema === 4 ? { audio } : {}),
    ...(subsystems ? { subsystems } : {}),
    ...(candidate.eventTrace ? { eventTrace: normalizeEventTrace(candidate.eventTrace) } : {})
  };
}

export function normalizeRomPlayerFrameStats(value: unknown): RomPlayerFrameStats | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<RomPlayerFrameStats>;
  if (candidate.sampledAtUnixMs !== undefined && (typeof candidate.sampledAtUnixMs !== "number"
      || !Number.isFinite(candidate.sampledAtUnixMs) || candidate.sampledAtUnixMs < 0)) return null;
  const numbers = [
    candidate.cpuPercent,
    candidate.droppedFrameRatio,
    candidate.droppedFrames,
    candidate.emulationFps,
    candidate.emulationMs,
    candidate.fps,
    candidate.frameMs,
    candidate.presentationFps,
    candidate.romBytes
  ];
  if (!numbers.every((number) => typeof number === "number" && Number.isFinite(number) && number >= 0)) return null;
  const runtimeState = candidate.runtimeState == null ? null : normalizeRuntimeState(candidate.runtimeState);
  if (candidate.runtimeState != null && !runtimeState) return null;
  const hardware = normalizeHardwareTelemetry(candidate.hardware);
  if (candidate.hardware != null && !hardware) return null;
  const inputFrames = candidate.inputFrames;
  const recordingStart = candidate.recordingStart;
  if (candidate.recordingID !== undefined && (typeof candidate.recordingID !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(candidate.recordingID))) return null;
  if (recordingStart !== undefined && !isInputReplayInitialState(recordingStart)) return null;
  if (inputFrames !== undefined && (!inputFrames || !Number.isSafeInteger(inputFrames.firstFrame)
      || inputFrames.firstFrame < 0 || !Array.isArray(inputFrames.masks) || inputFrames.masks.length > 600
      || !inputFrames.masks.every(mask => Number.isInteger(mask) && mask >= 0 && mask <= 1023))) return null;
  return {
    ...(candidate.recordingID ? { recordingID: candidate.recordingID } : {}),
    ...(isInputReplayInitialState(recordingStart) ? { recordingStart: { ...recordingStart } } : {}),
    ...(candidate.sampledAtUnixMs !== undefined ? { sampledAtUnixMs: candidate.sampledAtUnixMs } : {}),
    ...(inputFrames ? { inputFrames: { firstFrame: inputFrames.firstFrame, masks: [...inputFrames.masks] } } : {}),
    cpuPercent: candidate.cpuPercent!,
    droppedFrameRatio: candidate.droppedFrameRatio!,
    droppedFrames: candidate.droppedFrames!,
    emulationFps: candidate.emulationFps!,
    emulationMs: candidate.emulationMs!,
    fps: candidate.fps!,
    frameMs: candidate.frameMs!,
    presentationFps: candidate.presentationFps!,
    romBytes: candidate.romBytes!,
    runtimeState,
    hardware
  };
}

export async function createRomPlayerServer(options: RomPlayerServerOptions): Promise<RomPlayerServer> {
  const romFileName = path.basename(options.romPath);
  const encodedRomFileName = encodeURIComponent(romFileName);
  const runtimePath = runtimePlayerPath(options);
  const replayPayload = options.inputReplay ? JSON.stringify(options.inputReplay) : null;
  const keyboardBindingsPayload = options.keyboardBindings ? JSON.stringify(options.keyboardBindings) : null;
  const server: Server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/") {
        response.writeHead(302, {
          Location: runtimePath
        });
        response.end();
        return;
      }

      if (url.pathname === `/roms/${encodedRomFileName}` || url.pathname === `/roms/${romFileName}`) {
        await sendFile(response, options.romPath, url.pathname);
        return;
      }

      if (url.pathname === "/player/input-replay.json") {
        if (!replayPayload) {
          sendText(response, 404, "Replay nao encontrado.");
          return;
        }
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": String(Buffer.byteLength(replayPayload, "utf8")),
          "Cache-Control": "no-store"
        });
        response.end(replayPayload);
        return;
      }

      if (url.pathname === "/player/input-config.json") {
        if (!keyboardBindingsPayload) {
          sendText(response, 404, "Configuracao de teclado nao encontrada.");
          return;
        }
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": String(Buffer.byteLength(keyboardBindingsPayload, "utf8")),
          "Cache-Control": "no-store"
        });
        response.end(keyboardBindingsPayload);
        return;
      }

      const assetPath = safePlayerAssetPath(options.webPlayerRoot, url.pathname);
      if (!assetPath) {
        sendText(response, 403, "Caminho invalido.");
        return;
      }
      await sendFile(response, assetPath, url.pathname);
    })().catch(() => {
      if (!response.headersSent) {
        sendText(response, 404, "Arquivo nao encontrado.");
      } else {
        response.end();
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  let closePromise: Promise<void> | null = null;
  return {
    url: `http://127.0.0.1:${port}${runtimePath}`,
    close: () => {
      if (closePromise) return closePromise;
      closePromise = new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
            reject(error);
            return;
          }
          resolve();
        });
        server.closeAllConnections();
      });
      return closePromise;
    }
  };
}

export async function openRomPlayerWindow(options: OpenRomPlayerWindowOptions): Promise<OpenRomPlayerWindowResult> {
  const romPath = options.romPath.trim();
  if (!romPath) {
    return { ok: false, error: "ROM invalida para abrir no Play Window." };
  }

  let closeServer: (() => Promise<void>) | undefined;
  let acquiredWindow: ElectronBrowserWindow | undefined;
  try {
    const webPlayerRoot = resolveWebPlayerRoot(options);
    const title = options.title?.trim() || path.basename(romPath);
    const romInfo = await stat(romPath);
    if (!romInfo.isFile()) {
      return { ok: false, error: "ROM invalida para abrir no Play Window." };
    }
    const sourceByAddress = new Map<number, { eventID: string; stepID: string }>();
    try {
      let contents: string;
      try { contents = await readFile(`${romPath}.events.json`, "utf8"); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        contents = await readFile(path.join(path.dirname(romPath), "event_source_map.json"), "utf8");
      }
      const map = JSON.parse(contents);
      const hash = createHash("sha256").update(await readFile(romPath)).digest("hex");
      if (map.schema === 1 && map.romSha256 === hash && Array.isArray(map.entries)) for (const entry of map.entries) {
        if (Number.isInteger(entry.address) && typeof entry.eventID === "string" && typeof entry.stepID === "string") sourceByAddress.set(entry.address, { eventID: entry.eventID, stepID: entry.stepID });
      }
    } catch { /* External ROMs may have no source map. */ }
    const { BrowserWindow, app } = await import("electron");
    const server = await createRomPlayerServer({
      locale: options.locale,
      romPath,
      title,
      webPlayerRoot,
      inputReplay: options.replay,
      keyboardBindings: options.keyboardBindings,
      desktopBattery: !options.replay,
      softwareFramebuffer: preferSoftwarePlayerFramebuffer(process.platform, process.arch, app.runningUnderARM64Translation),
      recordInput: options.recordInput,
      recordingID: options.recordingID,
      recordingLaunch: options.recordingLaunch
    });
    closeServer = server.close;
    const window = new BrowserWindow({
      ...romPlayerBrowserWindowOptions(options.mainDirectory),
      title: `Play - ${title}`
    });

    acquiredWindow = window;
    registerRomPlayerRecording({ window, ownerID: options.parent?.webContents.id ?? -1,
      normalize: normalizeRomPlayerFrameStats, onTelemetry: options.onTelemetry });
    if (!options.replay) registerRomPlayerBattery(window.webContents, createRomPlayerBattery(app.getPath("userData"), romPath, options.saveScope), server.url);
    window.webContents.on("ipc-message", (_event, channel, ...args) => {
      if (channel !== ipcChannels.romPlayerTelemetry) return;
      const stats = normalizeRomPlayerFrameStats(args[0]);
      if (!stats) return;
      const trace = stats.runtimeState?.eventTrace;
      if (trace) trace.entries = trace.entries.map(entry => ({ ...entry, ...sourceByAddress.get(entry.commandAddress) }));
      options.onTelemetry?.({ state: "running", windowID: window.id, stats });
    });

    window.on("closed", () => {
      void server.close().catch(() => undefined);
      options.onTelemetry?.({ state: "closed", windowID: window.id });
      const parent = options.parent;
      if (parent && !parent.isDestroyed()) {
        if (parent.isMinimized()) parent.restore();
        parent.show();
        parent.focus();
      }
    });
    await window.loadURL(server.url);
    window.show();
    window.focus();
    const [width, height] = window.getContentSize();
    return {
      ok: true,
      windowID: window.id,
      windowState: {
        width,
        height,
        fullscreen: window.isFullScreen(),
        maximized: window.isMaximized()
      }
    };
  } catch (error) {
    try {
      if (acquiredWindow && !acquiredWindow.isDestroyed()) acquiredWindow.destroy();
    } finally {
      await closeServer?.().catch((closeError) => console.warn("Falha ao encerrar servidor do Play.", closeError));
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
