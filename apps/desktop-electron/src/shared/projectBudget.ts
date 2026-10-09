import type { GBAProjectData } from "./projectFile.js";
import { gbaSpriteOamEntriesForPixels } from "./gbaRendering.js";

export type ProjectBudgetTone = "ok" | "warning" | "error";
export type ProjectBudgetSource = "compiler" | "estimate";

export interface AssetPackBudgetUsage {
  used: number;
  capacity: number;
  remaining: number;
  percent_used: number;
  severity: ProjectBudgetTone;
}

export interface AssetPackPressureUsage {
  requested: number;
  allocated?: number;
  capacity: number;
  percent_of_pool: number;
  remaining_after_group?: number;
  remaining_after_request?: number;
  bank_count?: number;
}

export interface AssetPackPressureReport {
  name: string;
  id?: string;
  room?: string;
  asset_count: number;
  assets: string[];
  resources: Record<string, AssetPackPressureUsage>;
  severity?: ProjectBudgetTone;
}

export interface AssetPackResourceBank {
  asset?: string;
  count: number;
  resource: string;
}

export interface AssetPackResourceBankGroup {
  name: string;
  assets: string[];
  banks: AssetPackResourceBank[];
}

export interface AssetPackPhysicalBudgetReport {
  schema: number;
  audio_bytes_by_item?: Record<string, number>;
}

export interface AssetPackFragmentationUsage {
  used: number;
  capacity: number;
  remaining: number;
  largest_free_block: number;
  free_fragment_count: number;
}

export interface AssetPackCompressionCandidate {
  asset: string;
  resource: string;
  strategy: string;
  reason: string;
}

export interface AssetPackBudgetReport {
  schema: number;
  budget_summary?: Record<string, AssetPackBudgetUsage>;
  group_pressure_report?: AssetPackPressureReport[];
  room_pressure_report?: AssetPackPressureReport[];
  catalog_pressure_report?: Array<{ name: string; assets?: string[]; resources: Record<string, number | AssetPackPressureUsage> }>;
  resident_sets?: Array<{ id: string; room?: string; groups: string[]; max_resident_groups: number }>;
  resident_pressure_report?: AssetPackPressureReport[];
  resource_bank_groups?: AssetPackResourceBankGroup[];
  fragmentation_report?: Record<string, AssetPackFragmentationUsage>;
  compression_candidates?: AssetPackCompressionCandidate[];
  physical_budget?: AssetPackPhysicalBudgetReport;
  production_summary?: {
    ready_for_large_project?: boolean;
    blocking_overflow_count?: number;
    compression_candidate_count?: number;
    split_recommendation_count?: number;
  };
}

export interface ProjectBudgetAnalysisResult {
  ok: boolean;
  generatedAt?: string;
  report?: AssetPackBudgetReport;
  target?: string;
  error?: string;
}

export interface ProjectBudgetMetric {
  id: string;
  label: string;
  used: number;
  capacity: number;
  remaining: number;
  percent: number;
  tone: ProjectBudgetTone;
  unit: "bytes" | "colors" | "objects" | "tiles";
}

export interface ProjectBudgetCompressionItem {
  asset: string;
  resourceLabel: string;
  strategyLabel: string;
}

export interface ProjectBudgetFragmentationItem {
  id: string;
  label: string;
  freeFragments: number;
  largestFreeBlock: number;
  remaining: number;
}

export interface ProjectBudgetDmaDiagnostic {
  estimatedBytes: number;
  budgetBytes: number;
  percent: number;
  tone: ProjectBudgetTone;
  uploadCount: number;
  action: string;
}

export interface ProjectBudgetPresentation {
  source: ProjectBudgetSource;
  sceneName: string;
  sceneMetrics: ProjectBudgetMetric[];
  projectMetrics: ProjectBudgetMetric[];
  compression: ProjectBudgetCompressionItem[];
  fragmentation: ProjectBudgetFragmentationItem[];
  dma: ProjectBudgetDmaDiagnostic;
  projectReady: boolean;
  blockingOverflowCount: number;
  maxScenePressure: number;
  tone: ProjectBudgetTone;
}

export const DMA_PREFETCH_EDITORIAL_BUDGET_BYTES = 32 * 1024;

const resourceOrder = [
  "bg_tiles",
  "affine_bg_tiles",
  "obj_tiles",
  "oam_sprites",
  "bg_palette_colors",
  "obj_palette_colors",
  "pcm_bytes"
] as const;

const resourceMetadata: Record<string, { label: string; capacity: number; unit: ProjectBudgetMetric["unit"] }> = {
  affine_bg_tiles: { label: "Tiles affine", capacity: 256, unit: "tiles" },
  bg_palette_colors: { label: "Paleta BG", capacity: 256, unit: "colors" },
  bg_tiles: { label: "Tiles BG", capacity: 896, unit: "tiles" },
  oam_sprites: { label: "OAM", capacity: 128, unit: "objects" },
  obj_palette_colors: { label: "Paleta OBJ", capacity: 256, unit: "colors" },
  obj_tiles: { label: "Tiles OBJ", capacity: 1024, unit: "tiles" },
  pcm_bytes: { label: "Áudio PCM", capacity: 65_535, unit: "bytes" }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function projectRooms(data: GBAProjectData): Record<string, unknown>[] {
  const scenes = records(data, "scenas");
  return scenes.length > 0 ? scenes : records(data, "rooms");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = finiteNumber(value, fallback);
  return number > 0 ? Math.floor(number) : fallback;
}

function normalizeIdentifier(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

export function projectBudgetSceneGroupName(sceneName: string): string {
  return `scene_${normalizeIdentifier(sceneName, "room")}`;
}

function toneForUsage(used: number, capacity: number, reported?: ProjectBudgetTone): ProjectBudgetTone {
  if (reported === "error" || used > capacity) return "error";
  const percent = capacity > 0 ? (used / capacity) * 100 : 0;
  if (reported === "warning" || percent >= 80) return "warning";
  return "ok";
}

function metricFromValues(id: string, used: number, capacity: number, reported?: ProjectBudgetTone): ProjectBudgetMetric {
  const metadata = resourceMetadata[id] ?? { label: id, capacity, unit: "tiles" as const };
  const resolvedCapacity = Math.max(0, capacity || metadata.capacity);
  const normalizedUsed = Math.max(0, Math.round(used));
  return {
    id,
    label: metadata.label,
    used: normalizedUsed,
    capacity: resolvedCapacity,
    remaining: Math.max(0, resolvedCapacity - normalizedUsed),
    percent: resolvedCapacity > 0 ? Math.round((normalizedUsed / resolvedCapacity) * 100) : 0,
    tone: toneForUsage(normalizedUsed, resolvedCapacity, reported),
    unit: metadata.unit
  };
}

function roomTileIDs(room: Record<string, unknown>): number[] {
  const layers = Array.isArray(room.tileLayers) ? room.tileLayers.filter(isRecord) : [];
  const layeredTiles = layers.flatMap((layer) => Array.isArray(layer.tilemap)
    ? layer.tilemap.filter((tile): tile is number => typeof tile === "number")
    : []);
  if (layeredTiles.length > 0) return layeredTiles;
  return Array.isArray(room.tilemap)
    ? room.tilemap.filter((tile): tile is number => typeof tile === "number")
    : [];
}

function actorRoomName(actor: Record<string, unknown>): string {
  return stringValue(actor.roomName) || stringValue(actor.sceneName) || stringValue(actor.room);
}

function spritePaletteEstimateKey(data: GBAProjectData, spriteSheet: string): string {
  const asset = records(data, "assets").find((candidate) => (
    stringValue(candidate.name) === spriteSheet || stringValue(candidate.id) === spriteSheet
  ));
  const metadata = asset && isRecord(asset.metadata) ? asset.metadata : undefined;
  const values = metadata?.objectPaletteValues;
  if (
    Array.isArray(values) &&
    values.length > 0 &&
    values.length <= 16 &&
    values.every((value) => (
      typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0x7fff
    ))
  ) {
    return `explicit:${JSON.stringify(values)}`;
  }
  return `asset:${spriteSheet}`;
}

function actorTileCount(data: GBAProjectData, actor: Record<string, unknown>): number {
  const spriteSheet = stringValue(actor.spriteSheet);
  const animations = records(data, "animations").filter((animation) => stringValue(animation.spriteSheet) === spriteSheet);
  if (animations.length === 0) return 4;
  return Math.max(...animations.map((animation) => {
    const width = positiveInteger(animation.frameWidth, 16);
    const height = positiveInteger(animation.frameHeight, 16);
    const frames = Array.isArray(animation.frames) ? animation.frames.filter(isRecord) : [];
    const explicitParts = frames.reduce((maximum, frame) => {
      const parts = Array.isArray(frame.tiles) ? frame.tiles.filter(isRecord) : [];
      return Math.max(maximum, parts.length);
    }, 0);
    return Math.max(explicitParts, Math.ceil(width / 8) * Math.ceil(height / 8));
  }));
}

function actorOamCount(data: GBAProjectData, actor: Record<string, unknown>): number {
  const spriteSheet = stringValue(actor.spriteSheet);
  const animations = records(data, "animations").filter((animation) => stringValue(animation.spriteSheet) === spriteSheet);
  if (animations.length === 0) return 1;
  return Math.max(...animations.map((animation) => {
    const width = positiveInteger(animation.frameWidth, 16);
    const height = positiveInteger(animation.frameHeight, 16);
    const frames = Array.isArray(animation.frames) ? animation.frames.filter(isRecord) : [];
    const explicitParts = frames.reduce((maximum, frame) => {
      const parts = Array.isArray(frame.tiles) ? frame.tiles.filter(isRecord) : [];
      return Math.max(maximum, parts.length);
    }, 0);
    return Math.max(explicitParts, gbaSpriteOamEntriesForPixels(width, height));
  }));
}

function estimateSceneMetrics(data: GBAProjectData, sceneName: string): ProjectBudgetMetric[] {
  const rooms = projectRooms(data);
  const room = rooms.find((candidate) => stringValue(candidate.name) === sceneName) ?? rooms[0] ?? {};
  const tiles = roomTileIDs(room).filter((tile) => tile > 0);
  const uniqueTiles = new Set(tiles);
  const actors = records(data, "actors").filter((actor) => actorRoomName(actor) === sceneName);
  const actorTiles = actors.map((actor) => actorTileCount(data, actor));
  const spriteSheets = new Set(actors.map((actor) => stringValue(actor.spriteSheet)).filter(Boolean));
  const spritePaletteKeys = new Set(
    Array.from(spriteSheets, (spriteSheet) => spritePaletteEstimateKey(data, spriteSheet))
  );
  const layerCount = Array.isArray(room.tileLayers)
    ? room.tileLayers.filter((layer) => isRecord(layer) && roomTileIDs(layer).some((tile) => tile > 0)).length
    : uniqueTiles.size > 0 ? 1 : 0;

  const paletteFamilyID = stringValue(room.paletteFamilyID);
  let bgPaletteColors = layerCount * 16;
  let objPaletteColors = spritePaletteKeys.size * 16;

  if (paletteFamilyID) {
    const paletteFamilies = Array.isArray(data.paletteFamilies) ? data.paletteFamilies.filter(isRecord) : [];
    const family = paletteFamilies.find((f) => stringValue(f.id) === paletteFamilyID);
    if (family) {
      const bgColors = Array.isArray(family.background)
        ? family.background.filter((c): c is number => typeof c === "number" && Number.isInteger(c) && c >= 0 && c <= 0x7fff).length
        : 0;
      const objColors = Array.isArray(family.objects)
        ? family.objects.filter((c): c is number => typeof c === "number" && Number.isInteger(c) && c >= 0 && c <= 0x7fff).length
        : 0;
      bgPaletteColors = Math.max(bgPaletteColors, bgColors > 0 ? 16 : 0);
      objPaletteColors = Math.max(objPaletteColors, objColors > 0 ? 16 : 0);
    }
  }

  const estimates: Record<string, number> = {
    bg_tiles: uniqueTiles.size,
    affine_bg_tiles: 0,
    obj_tiles: actorTiles.reduce((total, count) => total + count, 0),
    oam_sprites: actors.reduce((total, actor) => total + actorOamCount(data, actor), 0),
    bg_palette_colors: bgPaletteColors,
    obj_palette_colors: objPaletteColors,
    pcm_bytes: 0
  };
  return resourceOrder.map((id) => metricFromValues(id, estimates[id] ?? 0, resourceMetadata[id].capacity));
}

function projectMetrics(report: AssetPackBudgetReport): ProjectBudgetMetric[] {
  const summary = report.budget_summary ?? {};
  return resourceOrder.map((id) => {
    const usage = summary[id];
    return metricFromValues(id, usage?.used ?? 0, usage?.capacity ?? resourceMetadata[id].capacity, usage?.severity);
  });
}

function sceneBankGroup(report: AssetPackBudgetReport, sceneName: string): AssetPackResourceBankGroup | undefined {
  const groups = report.resource_bank_groups ?? [];
  const expected = projectBudgetSceneGroupName(sceneName);
  return groups.find((group) => group.name === expected)
    ?? groups.find((group) => group.name === sceneName);
}

function pressureReport(report: AssetPackBudgetReport, sceneName: string): AssetPackPressureReport | undefined {
  const expected = projectBudgetSceneGroupName(sceneName);
  const reports = [...(report.group_pressure_report ?? []), ...(report.room_pressure_report ?? [])];
  return reports.find((item) => item.name === expected || item.name === sceneName)
    ?? (reports.length === 1 ? reports[0] : undefined);
}

function compiledSceneMetrics(report: AssetPackBudgetReport, sceneName: string): { assets: string[]; metrics: ProjectBudgetMetric[] } {
  const bankGroup = sceneBankGroup(report, sceneName);
  if (bankGroup) {
    const counts = bankGroup.banks.reduce<Record<string, number>>((result, bank) => {
      result[bank.resource] = (result[bank.resource] ?? 0) + Math.max(0, finiteNumber(bank.count));
      return result;
    }, {});
    return {
      assets: bankGroup.assets,
      metrics: resourceOrder.map((id) => metricFromValues(id, counts[id] ?? 0, report.budget_summary?.[id]?.capacity ?? resourceMetadata[id].capacity))
    };
  }

  const pressure = pressureReport(report, sceneName);
  if (!pressure) return { assets: [], metrics: [] };
  return {
    assets: pressure.assets,
    metrics: resourceOrder.map((id) => {
      const usage = pressure.resources[id];
      return metricFromValues(id, usage?.requested ?? 0, usage?.capacity ?? report.budget_summary?.[id]?.capacity ?? resourceMetadata[id].capacity);
    })
  };
}

function strategyLabel(strategy: string): string {
  if (strategy === "rle_or_lz77_tilemap") return "RLE ou LZ77";
  if (strategy === "resample_or_stream_pcm") return "Reamostrar ou transmitir PCM";
  if (strategy === "palette_reduce_or_share_bank") return "Reduzir ou compartilhar paleta";
  return strategy.replaceAll("_", " ");
}

function reportCompression(report: AssetPackBudgetReport, sceneAssets: Set<string>): ProjectBudgetCompressionItem[] {
  return (report.compression_candidates ?? [])
    .filter((candidate) => sceneAssets.size === 0 || sceneAssets.has(candidate.asset))
    .map((candidate) => ({
      asset: candidate.asset,
      resourceLabel: resourceMetadata[candidate.resource]?.label ?? candidate.resource.replaceAll("_", " "),
      strategyLabel: strategyLabel(candidate.strategy)
    }));
}

function reportFragmentation(report: AssetPackBudgetReport): ProjectBudgetFragmentationItem[] {
  return Object.entries(report.fragmentation_report ?? {})
    .filter(([, usage]) => usage.free_fragment_count > 1)
    .sort((left, right) => right[1].free_fragment_count - left[1].free_fragment_count)
    .map(([id, usage]) => ({
      id,
      label: resourceMetadata[id]?.label ?? id.replaceAll("_", " "),
      freeFragments: usage.free_fragment_count,
      largestFreeBlock: usage.largest_free_block,
      remaining: usage.remaining
    }));
}

function highestTone(metrics: ProjectBudgetMetric[]): ProjectBudgetTone {
  if (metrics.some((metric) => metric.tone === "error")) return "error";
  if (metrics.some((metric) => metric.tone === "warning")) return "warning";
  return "ok";
}

function dmaDiagnostic(
  metrics: ProjectBudgetMetric[],
  report?: AssetPackBudgetReport,
  sceneName?: string
): ProjectBudgetDmaDiagnostic {
  const byID = new Map(metrics.map((metric) => [metric.id, metric.used]));
  const estimatedBytes =
    ((byID.get("bg_tiles") ?? 0) * 32)
    + ((byID.get("affine_bg_tiles") ?? 0) * 32)
    + ((byID.get("obj_tiles") ?? 0) * 32)
    + ((byID.get("bg_palette_colors") ?? 0) * 2)
    + ((byID.get("obj_palette_colors") ?? 0) * 2)
    + ((byID.get("oam_sprites") ?? 0) * 8);
  const percent = Math.round((estimatedBytes / DMA_PREFETCH_EDITORIAL_BUDGET_BYTES) * 100);
  const tone: ProjectBudgetTone = percent > 100 ? "error" : percent >= 80 ? "warning" : "ok";
  const pressure = report && sceneName ? pressureReport(report, sceneName) : undefined;
  const bankGroup = report && sceneName ? sceneBankGroup(report, sceneName) : undefined;
  const reportedBankCount = pressure
    ? Math.max(0, ...Object.values(pressure.resources).map((resource) => Math.max(0, finiteNumber(resource.bank_count))))
    : 0;
  const uploadCount = bankGroup?.banks.length
    ?? (reportedBankCount > 0 ? reportedBankCount : metrics.filter((metric) => metric.id !== "pcm_bytes" && metric.used > 0).length);
  const action = tone === "error"
    ? "Divida o banco da cena ou comprima tiles antes da próxima transição."
    : tone === "warning"
      ? "Antecipe o prefetch e reduza o banco antes de adicionar novos assets."
      : "Mantenha o prefetch da cena; nenhuma divisão de banco é necessária.";
  return {
    estimatedBytes,
    budgetBytes: DMA_PREFETCH_EDITORIAL_BUDGET_BYTES,
    percent,
    tone,
    uploadCount,
    action
  };
}

export function deriveProjectBudgetPresentation(
  data: GBAProjectData,
  sceneName: string,
  report: AssetPackBudgetReport | null | undefined
): ProjectBudgetPresentation {
  if (!report) {
    const sceneMetrics = estimateSceneMetrics(data, sceneName);
    return {
      source: "estimate",
      sceneName,
      sceneMetrics,
      projectMetrics: sceneMetrics,
      compression: [],
      fragmentation: [],
      dma: dmaDiagnostic(sceneMetrics),
      projectReady: true,
      blockingOverflowCount: 0,
      maxScenePressure: Math.max(0, ...sceneMetrics.map((metric) => metric.percent)),
      tone: highestTone(sceneMetrics)
    };
  }

  const compiled = compiledSceneMetrics(report, sceneName);
  const sceneMetrics = compiled.metrics.length > 0 ? compiled.metrics : estimateSceneMetrics(data, sceneName);
  const blockingOverflowCount = Math.max(0, finiteNumber(report.production_summary?.blocking_overflow_count));
  const projectReady = report.production_summary?.ready_for_large_project !== false && blockingOverflowCount === 0;
  const metricTone = highestTone(sceneMetrics);
  return {
    source: "compiler",
    sceneName,
    sceneMetrics,
    projectMetrics: projectMetrics(report),
    compression: reportCompression(report, new Set(compiled.assets)),
    fragmentation: reportFragmentation(report),
    dma: dmaDiagnostic(sceneMetrics, report, sceneName),
    projectReady,
    blockingOverflowCount,
    maxScenePressure: Math.max(0, ...sceneMetrics.map((metric) => metric.percent)),
    tone: projectReady ? metricTone : "error"
  };
}
