import type { ScenePhysicalBudget } from "./sceneFeatureModules.js";
import {
  isRoomCollisionType,
  normalizeRoomCollisionType,
  type RoomCollisionType
} from "./roomCollisionTypes.js";

export const SCENE_METATILE_AUTHORING_CONTRACT_ID = "gba-authored-metatile-2x2-v1" as const;

export interface SceneMetatileSemantic {
  collision: RoomCollisionType;
  terrain: string;
  damage: number;
  speedPercent: number;
  animation: string;
  onEnterEvent: string;
  stepSound: string;
  tags: string[];
}

export interface SceneMetatileDefinition {
  id: string;
  label: string;
  tiles: [number, number, number, number];
  semantic: SceneMetatileSemantic;
}

export interface SceneMetatileAuthoringConfig {
  schema: 1;
  enabled: boolean;
  contract: typeof SCENE_METATILE_AUTHORING_CONTRACT_ID;
  fallback: "error" | "tiled_default";
  blockWidth: 2;
  blockHeight: 2;
  logicalWidth: number;
  logicalHeight: number;
  library: SceneMetatileDefinition[];
  map: number[];
}

export interface SceneMetatilePhysicalExpansion {
  physicalWidthTiles: number;
  physicalHeightTiles: number;
  logicalWidth: number;
  logicalHeight: number;
  visualTiles: number[];
  collisionTypes: RoomCollisionType[];
  cost: ScenePhysicalBudget;
}

export interface ExportedSceneMetatileAuthoring {
  schema: 1;
  enabled: true;
  contract: typeof SCENE_METATILE_AUTHORING_CONTRACT_ID;
  fallback: "error" | "tiled_default";
  block_width: 2;
  block_height: 2;
  logical_width: number;
  logical_height: number;
  library: Array<{
    id: string;
    label: string;
    tiles: [number, number, number, number];
    semantic: {
      collision: RoomCollisionType;
      terrain: string;
      damage: number;
      speed_percent: number;
      animation: string;
      on_enter_event: string;
      step_sound: string;
      tags: string[];
    };
  }>;
  map: number[];
  physical: {
    width_tiles: number;
    height_tiles: number;
    visual_tiles: number[];
    collision_types: RoomCollisionType[];
  };
  export_cost: ScenePhysicalBudget;
}

export type SceneMetatileIssueCode =
  | "INVALID_CONFIG"
  | "INVALID_CONTRACT"
  | "INVALID_DIMENSIONS"
  | "INVALID_LIBRARY"
  | "DUPLICATE_METATILE_ID"
  | "INVALID_METATILE_ID"
  | "INVALID_TILE_SET"
  | "INVALID_COLLISION"
  | "MAP_LENGTH_MISMATCH"
  | "MAP_INDEX_OUT_OF_RANGE";

export interface SceneMetatileIssue {
  code: SceneMetatileIssueCode;
  field?: string;
  message: string;
}

export interface SceneMetatileResolution {
  config: SceneMetatileAuthoringConfig;
  issues: SceneMetatileIssue[];
}

const EMPTY_BUDGET: ScenePhysicalBudget = {
  bgTiles: 0,
  objTiles: 0,
  oam: 0,
  paletteColors: 0,
  vramBytes: 0,
  eventBytes: 0,
  audioBytes: 0,
  dmaBytes: 0,
  vblankTicks: 0,
  cpuWorkTicks: 0
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

function logicalDimension(value: number): number {
  return Number.isInteger(value) && value > 0 && value % 2 === 0 ? value / 2 : 0;
}

function defaultSemantic(): SceneMetatileSemantic {
  return {
    collision: "free",
    terrain: "",
    damage: 0,
    speedPercent: 100,
    animation: "",
    onEnterEvent: "",
    stepSound: "",
    tags: []
  };
}

function normalizeSemantic(value: unknown): SceneMetatileSemantic {
  const source = isRecord(value) ? value : {};
  const defaults = defaultSemantic();
  return {
    collision: normalizeRoomCollisionType(source.collision, defaults.collision),
    terrain: stringValue(source.terrain, defaults.terrain),
    damage: numberValue(source.damage, defaults.damage, 0, 255),
    speedPercent: numberValue(source.speedPercent ?? source.speed_percent, defaults.speedPercent, 0, 200),
    animation: stringValue(source.animation, defaults.animation),
    onEnterEvent: stringValue(source.onEnterEvent ?? source.on_enter_event, defaults.onEnterEvent),
    stepSound: stringValue(source.stepSound ?? source.step_sound, defaults.stepSound),
    tags: Array.isArray(source.tags)
      ? Array.from(new Set(source.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0).map((tag) => tag.trim())))
      : []
  };
}

function normalizeDefinition(value: unknown, index: number): SceneMetatileDefinition {
  const source = isRecord(value) ? value : {};
  const rawTiles = Array.isArray(source.tiles) ? source.tiles : [];
  const tiles = Array.from({ length: 4 }, (_entry, tileIndex) => numberValue(rawTiles[tileIndex], 0, 0, 1023)) as [number, number, number, number];
  return {
    id: stringValue(source.id, `metatile_${index + 1}`),
    label: stringValue(source.label, `Metatile ${index + 1}`),
    tiles,
    semantic: normalizeSemantic(source.semantic)
  };
}

export function defaultSceneMetatileAuthoring(): SceneMetatileAuthoringConfig {
  return {
    schema: 1,
    enabled: false,
    contract: SCENE_METATILE_AUTHORING_CONTRACT_ID,
    fallback: "error",
    blockWidth: 2,
    blockHeight: 2,
    logicalWidth: 0,
    logicalHeight: 0,
    library: [],
    map: []
  };
}

export function resolveSceneMetatileAuthoring(
  value: unknown,
  physicalWidthTiles: number,
  physicalHeightTiles: number
): SceneMetatileResolution {
  const defaults = defaultSceneMetatileAuthoring();
  if (value === undefined || value === null) return { config: defaults, issues: [] };
  if (!isRecord(value)) {
    return { config: defaults, issues: [{ code: "INVALID_CONFIG", message: "A autoria de metatiles deve ser um objeto." }] };
  }
  const enabled = value.enabled === true;
  const authoredLogicalWidth = numberValue(value.logicalWidth, 0, 0, 4096);
  const authoredLogicalHeight = numberValue(value.logicalHeight, 0, 0, 4096);
  const logicalWidth = physicalWidthTiles > 0 ? logicalDimension(physicalWidthTiles) : authoredLogicalWidth;
  const logicalHeight = physicalHeightTiles > 0 ? logicalDimension(physicalHeightTiles) : authoredLogicalHeight;
  const rawLibrary = Array.isArray(value.library) ? value.library : [];
  const library = rawLibrary.map(normalizeDefinition);
  const map = Array.isArray(value.map)
    ? value.map.map((entry) => numberValue(entry, -1, -1, Number.MAX_SAFE_INTEGER))
    : [];
  const config: SceneMetatileAuthoringConfig = {
    schema: 1,
    enabled,
    contract: SCENE_METATILE_AUTHORING_CONTRACT_ID,
    fallback: value.fallback === "tiled_default" ? "tiled_default" : "error",
    blockWidth: 2,
    blockHeight: 2,
    logicalWidth,
    logicalHeight,
    library,
    map
  };
  if (!enabled) return { config, issues: [] };

  const issues: SceneMetatileIssue[] = [];
  if (value.contract !== SCENE_METATILE_AUTHORING_CONTRACT_ID) {
    issues.push({ code: "INVALID_CONTRACT", field: "contract", message: "A autoria de metatiles precisa usar o contrato gba-authored-metatile-2x2-v1." });
  }
  if (logicalWidth <= 0 || logicalHeight <= 0 || physicalWidthTiles % 2 !== 0 || physicalHeightTiles % 2 !== 0) {
    issues.push({ code: "INVALID_DIMENSIONS", field: "dimensions", message: "Metatiles 2x2 exigem dimensões físicas positivas e pares." });
  }
  if (!Array.isArray(value.library) || library.length === 0) {
    issues.push({ code: "INVALID_LIBRARY", field: "library", message: "A biblioteca de metatiles habilitada não pode ser vazia." });
  }
  const ids = new Set<string>();
  library.forEach((definition, index) => {
    if (!isRecord(rawLibrary[index])) {
      issues.push({ code: "INVALID_LIBRARY", field: `library[${index}]`, message: "Cada metatile precisa ser um objeto." });
    }
    if (ids.has(definition.id)) {
      issues.push({ code: "DUPLICATE_METATILE_ID", field: `library[${index}].id`, message: `O id de metatile ${definition.id} foi declarado mais de uma vez.` });
    }
    ids.add(definition.id);
    const raw = isRecord(rawLibrary[index]) ? rawLibrary[index] : {};
    const rawTiles = isRecord(raw) && Array.isArray(raw.tiles) ? raw.tiles : [];
    if (rawTiles.length !== 4 || rawTiles.some((tile) => typeof tile !== "number" || !Number.isInteger(tile) || tile < 0 || tile > 1023)) {
      issues.push({ code: "INVALID_TILE_SET", field: `library[${index}].tiles`, message: "Cada metatile precisa declarar exatamente quatro índices de tile BG entre 0 e 1023." });
    }
    const rawSemantic = isRecord(raw) && isRecord(raw.semantic) ? raw.semantic : {};
    if (!isRoomCollisionType(rawSemantic.collision)) {
      issues.push({ code: "INVALID_COLLISION", field: `library[${index}].semantic.collision`, message: "A semântica do metatile precisa declarar uma colisão válida." });
    }
  });
  const expectedMapLength = Math.max(0, logicalWidth * logicalHeight);
  if (map.length !== expectedMapLength) {
    issues.push({ code: "MAP_LENGTH_MISMATCH", field: "map", message: `O mapa lógico precisa conter ${expectedMapLength} índices de metatile.` });
  }
  map.forEach((index, mapIndex) => {
    if (!Number.isInteger(index) || index < 0 || index >= library.length) {
      issues.push({ code: "MAP_INDEX_OUT_OF_RANGE", field: `map[${mapIndex}]`, message: `O índice ${index} não aponta para uma definição da biblioteca.` });
    }
  });
  return { config, issues };
}

function metatileCost(config: SceneMetatileAuthoringConfig, referenced: SceneMetatileDefinition[]): ScenePhysicalBudget {
  const tileIds = new Set(referenced.flatMap((definition) => definition.tiles));
  const eventDefinitions = referenced.filter((definition) => definition.semantic.onEnterEvent.length > 0);
  const sounds = new Set(referenced.map((definition) => definition.semantic.stepSound).filter(Boolean));
  return {
    ...EMPTY_BUDGET,
    bgTiles: tileIds.size,
    paletteColors: referenced.length > 0 ? 16 : 0,
    vramBytes: tileIds.size * 32,
    eventBytes: eventDefinitions.length * 16,
    audioBytes: sounds.size * 4,
    dmaBytes: tileIds.size * 32,
    vblankTicks: Math.ceil((config.logicalWidth * config.logicalHeight) / 32),
    cpuWorkTicks: config.map.length * 2 + referenced.length * 8
  };
}

export function expandSceneMetatileAuthoring(
  value: unknown,
  physicalWidthTiles: number,
  physicalHeightTiles: number
): SceneMetatilePhysicalExpansion | null {
  const resolution = resolveSceneMetatileAuthoring(value, physicalWidthTiles, physicalHeightTiles);
  if (!resolution.config.enabled || resolution.issues.length > 0) return null;
  const { config } = resolution;
  const visualTiles = Array.from({ length: physicalWidthTiles * physicalHeightTiles }, () => 0);
  const collisionTypes = Array.from({ length: physicalWidthTiles * physicalHeightTiles }, () => "free" as RoomCollisionType);
  const referenced = config.map.map((mapIndex) => config.library[mapIndex]).filter((definition): definition is SceneMetatileDefinition => Boolean(definition));
  for (let logicalY = 0; logicalY < config.logicalHeight; logicalY += 1) {
    for (let logicalX = 0; logicalX < config.logicalWidth; logicalX += 1) {
      const definition = config.library[config.map[logicalY * config.logicalWidth + logicalX]];
      if (!definition) continue;
      const physicalX = logicalX * 2;
      const physicalY = logicalY * 2;
      const tileOffsets = [[0, 0], [1, 0], [0, 1], [1, 1]] as const;
      tileOffsets.forEach(([offsetX, offsetY], tileIndex) => {
        const cellIndex = (physicalY + offsetY) * physicalWidthTiles + physicalX + offsetX;
        visualTiles[cellIndex] = definition.tiles[tileIndex];
        collisionTypes[cellIndex] = definition.semantic.collision;
      });
    }
  }
  return {
    physicalWidthTiles,
    physicalHeightTiles,
    logicalWidth: config.logicalWidth,
    logicalHeight: config.logicalHeight,
    visualTiles,
    collisionTypes,
    cost: metatileCost(config, referenced)
  };
}

export function exportSceneMetatileAuthoring(
  value: unknown,
  physicalWidthTiles: number,
  physicalHeightTiles: number
): ExportedSceneMetatileAuthoring | null {
  const resolution = resolveSceneMetatileAuthoring(value, physicalWidthTiles, physicalHeightTiles);
  const expansion = expandSceneMetatileAuthoring(value, physicalWidthTiles, physicalHeightTiles);
  if (!resolution.config.enabled || !expansion || resolution.issues.length > 0) return null;
  return {
    schema: 1,
    enabled: true,
    contract: SCENE_METATILE_AUTHORING_CONTRACT_ID,
    fallback: resolution.config.fallback,
    block_width: 2,
    block_height: 2,
    logical_width: resolution.config.logicalWidth,
    logical_height: resolution.config.logicalHeight,
    library: resolution.config.library.map((definition) => ({
      id: definition.id,
      label: definition.label,
      tiles: [...definition.tiles] as [number, number, number, number],
      semantic: {
        collision: definition.semantic.collision,
        terrain: definition.semantic.terrain,
        damage: definition.semantic.damage,
        speed_percent: definition.semantic.speedPercent,
        animation: definition.semantic.animation,
        on_enter_event: definition.semantic.onEnterEvent,
        step_sound: definition.semantic.stepSound,
        tags: [...definition.semantic.tags]
      }
    })),
    map: [...resolution.config.map],
    physical: {
      width_tiles: expansion.physicalWidthTiles,
      height_tiles: expansion.physicalHeightTiles,
      visual_tiles: [...expansion.visualTiles],
      collision_types: [...expansion.collisionTypes]
    },
    export_cost: { ...expansion.cost }
  };
}
