import type { GBAProjectData } from "./projectFile.js";
import type { AssetPackBudgetReport } from "./projectBudget.js";
import {
  resolveSceneRuntimeExport,
  type SceneExportKind
} from "./sceneRuntimeExport.js";
import {
  deriveScenePhysicalDiagnostics,
  type ScenePhysicalDiagnostics,
  type ScenePhysicalMetricID
} from "./scenePhysicalDiagnostics.js";
import { gbaSpriteOamEntriesForPixels } from "./gbaRendering.js";

export type HardwareProfilerMetricID = "cpu" | "vram" | "oam" | "palette" | "rom" | "ram";
export type HardwareProfilerTone = "ok" | "warning" | "error";
export type HardwareProfilerSource = "estimate" | "measured";
export type HardwareProfilerUnit = "bytes" | "colors" | "objects" | "percent" | "work";

export interface RomPlayerRuntimeEntityState {
  x: number;
  y: number;
  direction: number;
}

export interface RomPlayerRuntimeCollisionState {
  currentFlags: number;
  currentSlope: number;
  seenEffectBits: number;
  seenSlopeBits: number;
  blockedDirectionBits: number;
}

export interface RomPlayerRuntimeTimingState {
  cpuWorkTicks: number;
  vblankWaitTicks: number;
  peakCpuWorkTicks: number;
  peakVblankWaitTicks: number;
  missedFrameCount: number;
  renderSkipCount: number;
  frameSkipPolicy: number;
}

export interface RomPlayerRuntimeInputState {
  held: number;
  pressed: number;
  released: number;
}

export interface RomPlayerAudioTelemetry {
  pcmSourceBytes: number;
  mixerBufferBytes: number;
  activeVoiceCount: number;
  pcmUnderrunCount: number;
  pcmSubmittedBlocks: number;
}

export interface RomPlayerRuntimeState {
  schema: number;
  frame: number;
  currentRoom: number;
  runtimeKind: number;
  variables: number[];
  flagBits: number;
  player: RomPlayerRuntimeEntityState;
  actorCount: number;
  firstActor: RomPlayerRuntimeEntityState & { visible: boolean };
  lastMusic: number;
  lastSfx: number;
  collision: RomPlayerRuntimeCollisionState;
  triggerEnterCount: number;
  triggerLeaveCount: number;
  roomChangeCount: number;
  timing: RomPlayerRuntimeTimingState;
  input: RomPlayerRuntimeInputState;
  audio?: RomPlayerAudioTelemetry | null;
}

export type RomPlayerHardwareTelemetry = Partial<Record<ScenePhysicalMetricID, number>>;

export interface RomPlayerFrameStats {
  cpuPercent: number;
  droppedFrameRatio: number;
  droppedFrames: number;
  emulationFps: number;
  emulationMs: number;
  fps: number;
  frameMs: number;
  presentationFps: number;
  romBytes: number;
  runtimeState?: RomPlayerRuntimeState | null;
  hardware?: RomPlayerHardwareTelemetry | null;
}

export interface RomPlayerTelemetryEvent {
  state: "running" | "closed";
  windowID: number;
  stats?: RomPlayerFrameStats;
}

export interface HardwareProfilerMetric {
  id: HardwareProfilerMetricID;
  label: string;
  enabled: boolean;
  used: number;
  limit: number;
  percent: number;
  tone: HardwareProfilerTone;
  source: HardwareProfilerSource;
  unit: HardwareProfilerUnit;
  detail: string;
}

export interface HardwareProfilerPresentation {
  activeRoomName: string;
  activeRoomType: SceneExportKind;
  metrics: HardwareProfilerMetric[];
  physical: ScenePhysicalDiagnostics;
  isometric: IsometricHardwareMetrics | null;
  runtime: (Pick<RomPlayerFrameStats, "droppedFrameRatio" | "droppedFrames" | "emulationFps" | "emulationMs" | "fps" | "frameMs" | "presentationFps"> & {
    runtimeState: RomPlayerRuntimeState | null;
  }) | null;
  warningCount: number;
}

export interface IsometricHardwareMetrics {
  tilesUpdated: number;
  vramBytes: number;
  oamObjects: number;
  foregroundTileCount: number;
  foregroundBytes: number;
}

export interface DeriveHardwareProfilerOptions {
  romBytes?: number;
  telemetry?: RomPlayerFrameStats | null;
  assetPackReport?: AssetPackBudgetReport | null;
}

const GBA_CPU_WORK_BUDGET = 1_000;
const GBA_VRAM_BYTES = 96 * 1024;
const GBA_OAM_OBJECTS = 128;
const GBA_PALETTE_COLORS = 512;
const GBA_ROM_BYTES = 32 * 1024 * 1024;
const GBA_RAM_BYTES = (256 + 32) * 1024;
const runtimeKinds: readonly SceneExportKind[] = [
  "topdown",
  "platformer",
  "isometric",
  "menu",
  "shmup",
  "point_click",
  "dungeon_crawler",
  "racing",
  "cutscene",
  "visual_novel",
  "world_map",
  "battle_rpg",
  "luta"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = finiteNumber(value, fallback);
  return number > 0 ? Math.floor(number) : fallback;
}

function roomName(room: Record<string, unknown> | undefined, fallback = "Cena ativa"): string {
  return nullableString(room?.name) ?? nullableString(room?.id) ?? fallback;
}

function projectRooms(data: GBAProjectData): Record<string, unknown>[] {
  const scenes = records(data, "scenas");
  return scenes.length > 0 ? scenes : records(data, "rooms");
}

function activeRoom(data: GBAProjectData): Record<string, unknown> | undefined {
  const rooms = projectRooms(data);
  const selected = isRecord(data.scena) ? data.scena : undefined;
  const selectedID = nullableString(selected?.id);
  const selectedName = nullableString(selected?.name);
  return rooms.find((room) => (
    (selectedID !== null && nullableString(room.id) === selectedID) ||
    (selectedName !== null && nullableString(room.name) === selectedName)
  )) ?? rooms[0] ?? selected;
}

function entityRoomName(entity: Record<string, unknown>): string | null {
  return nullableString(entity.roomName) ?? nullableString(entity.sceneName) ?? nullableString(entity.room);
}

function roomEntities(data: GBAProjectData, key: "actors" | "triggers", name: string): Record<string, unknown>[] {
  return records(data, key).filter((entity) => entityRoomName(entity) === name);
}

function roomTilemaps(room: Record<string, unknown> | undefined): number[][] {
  if (!room) return [];
  const layers = Array.isArray(room.tileLayers) ? room.tileLayers.filter(isRecord) : [];
  const layerMaps = layers
    .map((layer) => Array.isArray(layer.tilemap) ? layer.tilemap.filter((tile): tile is number => typeof tile === "number") : [])
    .filter((tilemap) => tilemap.length > 0);
  if (layerMaps.length > 0) return layerMaps;
  return [Array.isArray(room.tilemap) ? room.tilemap.filter((tile): tile is number => typeof tile === "number") : []];
}

function animationForActor(data: GBAProjectData, actor: Record<string, unknown>): Record<string, unknown> | undefined {
  const spriteSheet = nullableString(actor.spriteSheet);
  const animationName = nullableString(actor.animationName) ?? nullableString(actor.animation);
  const animations = records(data, "animations");
  return animations.find((animation) => (
    spriteSheet !== null
      && animationName !== null
      && nullableString(animation.spriteSheet) === spriteSheet
      && nullableString(animation.name) === animationName
  ))
    ?? animations.find((animation) => (
      spriteSheet !== null && nullableString(animation.spriteSheet) === spriteSheet
    ))
    ?? animations.find((animation) => (
      animationName !== null && nullableString(animation.name) === animationName
    ));
}

function actorObjectCount(data: GBAProjectData, actor: Record<string, unknown>): number {
  const animation = animationForActor(data, actor);
  const frameWidth = positiveInteger(animation?.frameWidth, 8);
  const frameHeight = positiveInteger(animation?.frameHeight, 8);
  return Math.max(1, Math.ceil(frameWidth / 8) * Math.ceil(frameHeight / 8));
}

function actorOamCount(data: GBAProjectData, actor: Record<string, unknown>): number {
  const animation = animationForActor(data, actor);
  const frameWidth = positiveInteger(animation?.frameWidth, 8);
  const frameHeight = positiveInteger(animation?.frameHeight, 8);
  const frames = Array.isArray(animation?.frames) ? animation.frames.filter(isRecord) : [];
  const explicitCounts = frames
    .map((frame) => Array.isArray(frame.tiles) ? frame.tiles.length : 0)
    .filter((count) => count > 0);
  return explicitCounts.length > 0
    ? Math.max(...explicitCounts)
    : gbaSpriteOamEntriesForPixels(frameWidth, frameHeight);
}

function eventCommandCount(data: GBAProjectData): number {
  return records(data, "events").reduce((total, event) => {
    const commands = Array.isArray(event.commands)
      ? event.commands
      : Array.isArray(event.steps) ? event.steps : [];
    return total + commands.length;
  }, 0);
}

function estimateRomBytes(data: GBAProjectData): number {
  const contractBytes = new TextEncoder().encode(JSON.stringify(data)).byteLength;
  const animationBytes = records(data, "animations").reduce((total, animation) => {
    const width = positiveInteger(animation.frameWidth, 8);
    const height = positiveInteger(animation.frameHeight, 8);
    const frames = positiveInteger(animation.frameCount, 1);
    const bytesPerTile = nullableString(animation.colorMode) === "8bpp" ? 64 : 32;
    return total + Math.ceil(width / 8) * Math.ceil(height / 8) * frames * bytesPerTile;
  }, 0);
  const tileBytes = projectRooms(data).reduce((total, room) => {
    const uniqueTiles = new Set(roomTilemaps(room).flat().filter((tile) => tile > 0));
    return total + uniqueTiles.size * 32;
  }, 0);
  return contractBytes + animationBytes + tileBytes;
}

function debugFlag(data: GBAProjectData, key: string): boolean {
  const settings = isRecord(data.settings) ? data.settings : undefined;
  const debug = isRecord(settings?.debug) ? settings.debug : undefined;
  return debug?.[key] === true;
}

function metricTone(percent: number): HardwareProfilerTone {
  if (percent >= 100) return "error";
  if (percent >= 80) return "warning";
  return "ok";
}

function metric(options: Omit<HardwareProfilerMetric, "percent" | "tone">): HardwareProfilerMetric {
  const percent = options.limit > 0 ? Math.round((options.used / options.limit) * 10_000) / 100 : 0;
  return { ...options, percent, tone: metricTone(percent) };
}

export function deriveHardwareProfilerPresentation(
  data: GBAProjectData,
  options: DeriveHardwareProfilerOptions = {}
): HardwareProfilerPresentation {
  const rooms = projectRooms(data);
  const runtimeState = options.telemetry?.runtimeState;
  const runtimeKind = runtimeState && runtimeState.runtimeKind >= 0
    ? runtimeKinds[runtimeState.runtimeKind]
    : undefined;
  const runtimeRooms = runtimeKind
    ? rooms.filter((candidate) => resolveSceneRuntimeExport(nullableString(candidate.sceneType)).kind === runtimeKind)
    : [];
  const room = runtimeState && runtimeState.currentRoom >= 0
    ? runtimeRooms[runtimeState.currentRoom] ?? activeRoom(data)
    : activeRoom(data);
  const activeRoomName = roomName(room);
  const activeRoomType = resolveSceneRuntimeExport(nullableString(room?.sceneType)).kind;
  const actors = roomEntities(data, "actors", activeRoomName);
  const triggers = roomEntities(data, "triggers", activeRoomName);
  const tilemaps = roomTilemaps(room);
  const paintedTiles = tilemaps.flat().filter((tile) => tile > 0).length;
  const uniqueTiles = new Set(tilemaps.flat().filter((tile) => tile > 0));
  const objTiles = actors.reduce((total, actor) => total + actorObjectCount(data, actor), 0);
  const oamObjects = actors.reduce((total, actor) => total + actorOamCount(data, actor), 0);
  const spriteSheets = new Set(actors.map((actor) => nullableString(actor.spriteSheet)).filter(Boolean));
  const bgPaletteCount = Math.max(uniqueTiles.size > 0 ? 1 : 0, tilemaps.filter((tilemap) => tilemap.some((tile) => tile > 0)).length);
  const commandCount = eventCommandCount(data);
  const variableCount = records(data, "variables").length;
  const collisionCells = Array.isArray(room?.collision) ? room.collision.length : 0;
  const cpuWork = 120 + Math.ceil(paintedTiles / 4) + oamObjects * 8 + triggers.length * 12 + commandCount * 4;
  const isometric = nullableString(room?.sceneType)?.toLowerCase() === "isometric"
    ? (() => {
        const layers = Array.isArray(room?.tileLayers) ? room.tileLayers.filter(isRecord) : [];
        const foreground = layers.find((layer) => nullableString(layer.mapping)?.toUpperCase() === "BG1");
        const foregroundTiles = Array.isArray(foreground?.tilemap)
          ? foreground.tilemap.filter((tile): tile is number => typeof tile === "number" && tile >= 0)
          : [];
        const backgroundName = nullableString(room?.backgroundAssetName) ?? nullableString(room?.background);
        const backgroundAsset = records(data, "assets").find((asset) => nullableString(asset.name) === backgroundName);
        const metadata = isRecord(backgroundAsset?.metadata) ? backgroundAsset.metadata : undefined;
        const tileWidth = positiveInteger(metadata?.tileWidth, 32);
        const tileHeight = positiveInteger(metadata?.tileHeight, 16);
        const foregroundBytes = foregroundTiles.length * Math.ceil((tileWidth * tileHeight) / 2);
        const objVramBytes = actors.reduce((total, actor) => total + actorObjectCount(data, actor) * 32, 0);
        return {
          tilesUpdated: tilemaps.reduce(
            (total, tilemap) => total + tilemap.filter((tile) => tile >= 0).length,
            0
          ),
          vramBytes: 30 * 20 * 32 + foregroundBytes + objVramBytes,
          oamObjects: actors.length,
          foregroundTileCount: foregroundTiles.length,
          foregroundBytes
        };
      })()
    : null;
  const vramBytes = isometric?.vramBytes ?? uniqueTiles.size * 32 + objTiles * 32;
  const paletteColors = bgPaletteCount * 16 + spriteSheets.size * 16;
  const ramBytes = 16 * 1024 + tilemaps.reduce((total, tilemap) => total + tilemap.length * 2, 0) +
    collisionCells + actors.length * 64 + triggers.length * 48 + variableCount * 8 + commandCount * 12;
  const telemetry = options.telemetry ?? null;
  const telemetryRomBytes = telemetry && Number.isFinite(telemetry.romBytes) && telemetry.romBytes >= 0
    ? Math.floor(telemetry.romBytes)
    : null;
  const measuredRomBytes = telemetryRomBytes ?? (typeof options.romBytes === "number" && Number.isFinite(options.romBytes) && options.romBytes >= 0
    ? Math.floor(options.romBytes)
    : null);
  const measuredCpuPercent = telemetry && Number.isFinite(telemetry.cpuPercent)
    ? Math.max(0, telemetry.cpuPercent)
    : null;
  const physical = deriveScenePhysicalDiagnostics(data, activeRoomName, {
    assetPackReport: options.assetPackReport,
    measured: {
      ...(telemetry?.hardware ?? {}),
      ...(runtimeState ? {
        cpuWorkTicks: telemetry?.hardware?.cpuWorkTicks ?? runtimeState.timing.peakCpuWorkTicks,
        vblankTicks: telemetry?.hardware?.vblankTicks ?? runtimeState.timing.peakVblankWaitTicks
      } : {})
    }
  });

  const metrics = [
    metric({
      id: "cpu",
      label: "CPU",
      enabled: debugFlag(data, "showCpuUsage"),
      used: measuredCpuPercent ?? cpuWork,
      limit: measuredCpuPercent === null ? GBA_CPU_WORK_BUDGET : 100,
      source: measuredCpuPercent === null ? "estimate" : "measured",
      unit: measuredCpuPercent === null ? "work" : "percent",
      detail: measuredCpuPercent === null
        ? "Carga estimada da cena; execute o Play para medir o custo do emulador."
        : "Tempo de emulacao no host em relacao ao orçamento de 16,67 ms por frame."
    }),
    metric({
      id: "vram",
      label: "VRAM",
      enabled: debugFlag(data, "showVramUsage"),
      used: vramBytes,
      limit: GBA_VRAM_BYTES,
      source: "estimate",
      unit: "bytes",
      detail: `${uniqueTiles.size} tiles BG unicos e ${oamObjects} tiles OBJ ativos.`
    }),
    metric({
      id: "oam",
      label: "OAM",
      enabled: debugFlag(data, "showOamUsage"),
      used: oamObjects,
      limit: GBA_OAM_OBJECTS,
      source: "estimate",
      unit: "objects",
      detail: `${actors.length} atores ativos convertidos em objetos de hardware.`
    }),
    metric({
      id: "palette",
      label: "Paleta",
      enabled: debugFlag(data, "showPaletteUsage"),
      used: paletteColors,
      limit: GBA_PALETTE_COLORS,
      source: "estimate",
      unit: "colors",
      detail: `${bgPaletteCount} bancos BG e ${spriteSheets.size} bancos OBJ estimados.`
    }),
    metric({
      id: "rom",
      label: "ROM",
      enabled: debugFlag(data, "showRomUsage"),
      used: measuredRomBytes ?? estimateRomBytes(data),
      limit: GBA_ROM_BYTES,
      source: measuredRomBytes === null ? "estimate" : "measured",
      unit: "bytes",
      detail: measuredRomBytes === null ? "Estimativa minima antes do build." : "Tamanho medido no arquivo .gba gerado."
    }),
    metric({
      id: "ram",
      label: "RAM",
      enabled: debugFlag(data, "showRamUsage"),
      used: ramBytes,
      limit: GBA_RAM_BYTES,
      source: "estimate",
      unit: "bytes",
      detail: "Cena ativa, colisoes, atores, gatilhos, variaveis e comandos."
    })
  ];

  return {
    activeRoomName,
    activeRoomType,
    metrics,
    physical,
    isometric,
    runtime: telemetry ? {
      droppedFrameRatio: telemetry.droppedFrameRatio,
      droppedFrames: telemetry.droppedFrames,
      emulationFps: telemetry.emulationFps,
      emulationMs: telemetry.emulationMs,
      fps: telemetry.fps,
      frameMs: telemetry.frameMs,
      presentationFps: telemetry.presentationFps,
      runtimeState: telemetry.runtimeState ?? null
    } : null,
    warningCount: metrics.filter((item) => item.enabled && item.tone !== "ok").length
      + physical.metrics.filter((item) => item.tone !== "ok").length
  };
}
