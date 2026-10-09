import {
  gbaVideoModeDefinition,
  gbaVideoModeFromProject,
  sceneTileLayerAvailableForVideoMode,
  sceneTileLayerSupportsPainting,
  type GbaVideoModeId
} from "./gbaVideoModes.js";
import type { GBAProjectData } from "./projectFile.js";

export { sceneTileLayerAvailableForVideoMode } from "./gbaVideoModes.js";

export const sceneTileLayerEmptyTile = -1;
export const sceneTileLayerDefaultMapping = "BG2";
export const sceneTileLayerOrderedMappings = ["BG3", "BG2", "BG1", "BG0"] as const;

export type SceneTileLayerMapping = typeof sceneTileLayerOrderedMappings[number];

export interface SceneTileLayer {
  mapping: SceneTileLayerMapping;
  tilemap: number[];
  tileSourceAssetNames: string[];
}

export interface SceneTileLayerCatalogEntry {
  description: string;
  label: string;
  mapping: SceneTileLayerMapping;
}

export const sceneTileLayerCatalog: SceneTileLayerCatalogEntry[] = [
  {
    mapping: "BG3",
    label: "BG3 — Fundo distante",
    description: "Camada mais ao fundo; ideal para ceu, parallax e elementos distantes (Modo 0 e Modo 2 afinidade)."
  },
  {
    mapping: "BG2",
    label: "BG2 — Mapa principal",
    description: "Tilemap principal da cena; no Modo 1 tambem suporta rotacao e escala (afinidade)."
  },
  {
    mapping: "BG1",
    label: "BG1 — Overlay",
    description: "Detalhes sobre o chao, props e vegetacao alta; suporta transparencia via canal alpha."
  },
  {
    mapping: "BG0",
    label: "BG0 — Frente",
    description: "Camada frontal que pode cobrir o jogador e sprites OBJ quando a prioridade exige."
  }
];

export interface SceneTileLayerPaintOption extends SceneTileLayerCatalogEntry {
  available: boolean;
  disabledReason: string | null;
  layerKind: string;
}

export interface NormalizeSceneTileLayersOptions {
  fallbackTilemap: number[];
  height: number;
  layers: SceneTileLayer[];
  sceneType: string;
  width: number;
}

export interface DefaultSceneTileLayersOptions {
  fallbackTilemap: number[];
  height: number;
  sceneType: string;
  width: number;
}

export interface SetSceneTileLayerCellOptions {
  backgroundAssetName: string | null;
  cellIndex: number;
  height: number;
  layers: SceneTileLayer[];
  mapping: string;
  sceneType: string;
  tileID: number;
  tool: "brush" | "eraser" | "fill";
  width: number;
}

export interface SetSceneTileLayerCellResult {
  exportTilemap: number[];
  layers: SceneTileLayer[];
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeSceneTileLayerMapping(value: string): SceneTileLayerMapping {
  const normalized = value.trim().toUpperCase();
  return sceneTileLayerOrderedMappings.includes(normalized as SceneTileLayerMapping)
    ? normalized as SceneTileLayerMapping
    : sceneTileLayerDefaultMapping;
}

export function sceneTileLayerSupportsLayers(sceneType: string, videoMode: GbaVideoModeId = 0): boolean {
  return sceneTileLayerSupportsPainting(sceneType, videoMode);
}

export function gbaVideoModeFromProjectData(data: GBAProjectData): GbaVideoModeId {
  return gbaVideoModeFromProject(data).id;
}

export function sceneTileLayerPaintOptions(videoMode: GbaVideoModeId): SceneTileLayerPaintOption[] {
  const definition = gbaVideoModeDefinition(videoMode);
  return sceneTileLayerCatalog.map((entry) => {
    const spec = definition.backgroundLayers[entry.mapping];
    const available = spec.available;
    return {
      ...entry,
      available,
      disabledReason: available ? null : `${entry.mapping} indisponivel no ${definition.label}.`,
      layerKind: spec.kind
    };
  });
}

export function normalizeActiveTileLayerForVideoMode(
  mapping: SceneTileLayerMapping,
  videoMode: GbaVideoModeId
): SceneTileLayerMapping {
  return sceneTileLayerAvailableForVideoMode(mapping, videoMode)
    ? mapping
    : sceneTileLayerDefaultMapping;
}

export function runtimeTileValue(value: number): number {
  return value === sceneTileLayerEmptyTile ? 0 : value;
}

export function normalizeSceneTileLayerTilemap(
  values: number[],
  width: number,
  height: number,
  fill: number = sceneTileLayerEmptyTile
): number[] {
  const count = Math.max(0, width * height);
  if (values.length === count) return values;
  if (values.length === 0) return Array.from({ length: count }, () => fill);
  return [...values.slice(0, count), ...Array.from({ length: Math.max(0, count - values.length) }, () => fill)];
}

function legacyTilemapToLayerValues(tilemap: number[]): number[] {
  return tilemap.map((value) => (
    typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : sceneTileLayerEmptyTile
  ));
}

function exportTilemapFromLayerValues(values: number[]): number[] {
  return values.map((value) => (value === sceneTileLayerEmptyTile ? 0 : value));
}

function normalizeTileSourceAssetNames(
  values: string[],
  tilemap: number[],
  width: number,
  height: number
): string[] {
  const count = Math.max(0, width * height);
  const normalizedValues = values.map((value) => value.trim());
  const padded = [
    ...normalizedValues.slice(0, count),
    ...Array.from({ length: Math.max(0, count - normalizedValues.length) }, () => "")
  ];
  const normalizedTilemap = normalizeSceneTileLayerTilemap(tilemap, width, height);
  return padded.map((sourceName, index) => (
    normalizedTilemap[index] !== sceneTileLayerEmptyTile ? sourceName : ""
  ));
}

export function defaultSceneTileLayers(options: DefaultSceneTileLayersOptions): SceneTileLayer[] {
  if (!sceneTileLayerSupportsLayers(options.sceneType)) return [];

  const width = positiveInteger(options.width, 1);
  const height = positiveInteger(options.height, 1);
  const mainTilemap = normalizeSceneTileLayerTilemap(
    legacyTilemapToLayerValues(options.fallbackTilemap),
    width,
    height
  );

  return sceneTileLayerOrderedMappings.map((mapping) => ({
    mapping,
    tilemap: mapping === sceneTileLayerDefaultMapping
      ? mainTilemap
      : normalizeSceneTileLayerTilemap([], width, height),
    tileSourceAssetNames: []
  }));
}

export function normalizeSceneTileLayers(options: NormalizeSceneTileLayersOptions): SceneTileLayer[] {
  if (!sceneTileLayerSupportsLayers(options.sceneType)) return [];

  const width = positiveInteger(options.width, 1);
  const height = positiveInteger(options.height, 1);
  const fallback = normalizeSceneTileLayerTilemap(
    legacyTilemapToLayerValues(options.fallbackTilemap),
    width,
    height
  );
  const grouped = new Map(options.layers.map((layer) => [normalizeSceneTileLayerMapping(layer.mapping), layer]));

  return sceneTileLayerOrderedMappings.map((mapping) => {
    const existing = grouped.get(mapping);
    const normalizedTilemap = normalizeSceneTileLayerTilemap(
      existing?.tilemap ?? (mapping === sceneTileLayerDefaultMapping ? fallback : []),
      width,
      height
    );
    return {
      mapping,
      tilemap: normalizedTilemap,
      tileSourceAssetNames: normalizeTileSourceAssetNames(
        existing?.tileSourceAssetNames ?? [],
        normalizedTilemap,
        width,
        height
      )
    };
  });
}

export function composeSceneTilemap(layers: SceneTileLayer[], width: number, height: number): number[] {
  const count = Math.max(0, width * height);
  const composed = Array.from({ length: count }, () => sceneTileLayerEmptyTile);

  for (const mapping of sceneTileLayerOrderedMappings) {
    const layer = layers.find((candidate) => candidate.mapping === mapping);
    if (!layer) continue;
    const tilemap = normalizeSceneTileLayerTilemap(layer.tilemap, width, height);
    tilemap.forEach((value, index) => {
      if (value !== sceneTileLayerEmptyTile) {
        composed[index] = value;
      }
    });
  }

  return exportTilemapFromLayerValues(composed);
}

export function paintedTileCount(layers: SceneTileLayer[], width: number, height: number): number {
  return composeSceneTilemap(layers, width, height).filter((value) => value > 0).length;
}

export function readActiveLayerTileCells(
  layers: SceneTileLayer[],
  mapping: string,
  width: number,
  height: number
): number[] {
  const normalizedMapping = normalizeSceneTileLayerMapping(mapping);
  const layer = layers.find((candidate) => candidate.mapping === normalizedMapping);
  const tilemap = layer
    ? normalizeSceneTileLayerTilemap(layer.tilemap, width, height)
    : normalizeSceneTileLayerTilemap([], width, height);
  return tilemap.map(runtimeTileValue);
}

function filledLayerCells(
  cells: number[],
  width: number,
  startIndex: number,
  nextTileID: number
): number[] {
  const targetTileID = cells[startIndex];
  if (targetTileID === nextTileID) return cells;

  const nextCells = [...cells];
  const pending = [startIndex];
  const visited = new Set<number>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || visited.has(current) || cells[current] !== targetTileID) continue;

    visited.add(current);
    nextCells[current] = nextTileID;

    const column = current % width;
    const left = current - 1;
    const right = current + 1;
    const up = current - width;
    const down = current + width;

    if (column > 0) pending.push(left);
    if (column < width - 1) pending.push(right);
    if (up >= 0) pending.push(up);
    if (down < cells.length) pending.push(down);
  }

  return nextCells;
}

export function readSceneTileLayersFromRoom(room: Record<string, unknown>): SceneTileLayer[] {
  const rawLayers = Array.isArray(room.tileLayers) ? room.tileLayers : [];
  return rawLayers.flatMap((layer) => {
    if (!isRecord(layer)) return [];
    const mapping = normalizeSceneTileLayerMapping(stringField(layer.mapping, sceneTileLayerDefaultMapping));
    const tilemap = Array.isArray(layer.tilemap)
      ? layer.tilemap.filter((value): value is number => typeof value === "number" && Number.isFinite(value)).map(Math.floor)
      : [];
    const tileSourceAssetNames = Array.isArray(layer.tileSourceAssetNames)
      ? layer.tileSourceAssetNames.filter((value): value is string => typeof value === "string")
      : [];
    return [{ mapping, tilemap, tileSourceAssetNames }];
  });
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

export function ensureRoomSceneTileLayers(
  room: Record<string, unknown>,
  sceneType: string
): SceneTileLayer[] {
  if (!sceneTileLayerSupportsLayers(sceneType)) {
    room.tileLayers = [];
    return [];
  }

  const width = positiveInteger(typeof room.width === "number" ? room.width : Number.NaN, 1);
  const height = positiveInteger(typeof room.height === "number" ? room.height : Number.NaN, 1);
  const fallbackTilemap = Array.isArray(room.tilemap)
    ? room.tilemap.filter((value): value is number => typeof value === "number" && Number.isFinite(value)).map(Math.floor)
    : [];
  const existing = readSceneTileLayersFromRoom(room);
  const normalized = existing.length > 0
    ? normalizeSceneTileLayers({ fallbackTilemap, height, layers: existing, sceneType, width })
    : defaultSceneTileLayers({ fallbackTilemap, height, sceneType, width });

  room.tileLayers = normalized;
  room.tilemap = composeSceneTilemap(normalized, width, height);
  return normalized;
}

export function setSceneTileLayerCell(options: SetSceneTileLayerCellOptions): SetSceneTileLayerCellResult {
  const width = positiveInteger(options.width, 1);
  const height = positiveInteger(options.height, 1);
  const mapping = normalizeSceneTileLayerMapping(options.mapping);
  const layers = normalizeSceneTileLayers({
    fallbackTilemap: composeSceneTilemap(options.layers, width, height),
    height,
    layers: options.layers,
    sceneType: options.sceneType,
    width
  });
  const layerIndex = layers.findIndex((layer) => layer.mapping === mapping);
  if (layerIndex < 0 || options.cellIndex < 0 || options.cellIndex >= width * height) {
    return { layers, exportTilemap: composeSceneTilemap(layers, width, height) };
  }

  const nextTileID = options.tool === "eraser"
    ? sceneTileLayerEmptyTile
    : Math.max(0, Math.floor(options.tileID));
  const layer = layers[layerIndex];
  const nextTilemap = options.tool === "fill"
    ? filledLayerCells(layer.tilemap, width, options.cellIndex, nextTileID)
    : layer.tilemap.map((value, index) => (index === options.cellIndex ? nextTileID : value));
  const normalizedSourceNames = normalizeTileSourceAssetNames(
    layer.tileSourceAssetNames,
    nextTilemap,
    width,
    height
  );
  if (normalizedSourceNames[options.cellIndex] !== undefined) {
    normalizedSourceNames[options.cellIndex] = nextTileID === sceneTileLayerEmptyTile
      ? ""
      : (options.backgroundAssetName ?? "");
  }

  layers[layerIndex] = {
    ...layer,
    tilemap: nextTilemap,
    tileSourceAssetNames: normalizedSourceNames
  };

  return {
    layers,
    exportTilemap: composeSceneTilemap(layers, width, height)
  };
}

export function activeTileLayerMappingFromProject(data: Record<string, unknown>): SceneTileLayerMapping {
  const editorState = isRecord(data.editorState) ? data.editorState : {};
  return normalizeSceneTileLayerMapping(stringField(editorState.activeTileLayerMapping, sceneTileLayerDefaultMapping));
}

export function setActiveTileLayerMappingInProject(
  data: Record<string, unknown>,
  mapping: string
): Record<string, unknown> {
  const editorState = isRecord(data.editorState) ? { ...data.editorState } : {};
  editorState.activeTileLayerMapping = normalizeSceneTileLayerMapping(mapping);
  return { ...data, editorState };
}
