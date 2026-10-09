import type { ScenePhysicalBudget } from "./sceneFeatureModules.js";

export const SCENE_RESOURCE_KINDS = [
  "regular_bg",
  "affine_bg",
  "bitmap3",
  "bitmap4",
  "bitmap5",
  "obj",
  "palette",
  "audio",
  "hblank_table"
] as const;

export type SceneResourceKind = typeof SCENE_RESOURCE_KINDS[number];
export type SceneResourceBpp = 4 | 8 | 15;
export const SCENE_RESOURCE_COMPRESSION_STRATEGIES = ["none", "rle16", "lz77", "huffman"] as const;
export type SceneResourceCompression = typeof SCENE_RESOURCE_COMPRESSION_STRATEGIES[number];
export type SceneResourceCompressionSelection = SceneResourceCompression | "auto";
export type SceneResourceCompressionComponent = "tiles" | "tilemap" | "palette";
export type SceneResourceCompressionPolicy =
  | { strategy: "auto"; tiles: "auto"; tilemap: "auto"; palette: "auto" }
  | { strategy: "manual"; tiles: SceneResourceCompression; tilemap: SceneResourceCompression; palette: SceneResourceCompression };
export type SceneResourceCompressionInput = SceneResourceCompressionSelection | Partial<SceneResourceCompressionPolicy>;
export type SceneResourcePrefetch = "none" | "scene" | "camera" | "manual";
export type SceneResourceCachePolicy = "resident" | "evictable";
export type SceneResourceFallbackMode = "error" | "omit_decorative" | "tiled_default";
export type SceneResourcePaletteSlot = "background" | "objects" | "none";

export interface SceneResourcePalette {
  id: string;
  slot: SceneResourcePaletteSlot;
  colors: number;
}

export interface SceneResourceFallback {
  mode: SceneResourceFallbackMode;
  assetId?: string;
}

export interface SceneResourceDescriptor {
  id: string;
  assetId: string;
  kind: SceneResourceKind;
  enabled: boolean;
  required: boolean;
  bpp: SceneResourceBpp;
  palette: SceneResourcePalette;
  compression: SceneResourceCompressionPolicy;
  tileLimit: number;
  resourceGroup: string;
  prefetch: SceneResourcePrefetch;
  cache: SceneResourceCachePolicy;
  evictionPriority: number;
  dependencies: string[];
  fallback: SceneResourceFallback;
  budget: ScenePhysicalBudget;
}

export interface SceneResourceManifest {
  schema: 1;
  resources: SceneResourceDescriptor[];
  dependencies: string[];
}

export type SceneResourceIssueCode =
  | "INVALID_MANIFEST"
  | "INVALID_SCHEMA"
  | "INVALID_RESOURCE"
  | "DUPLICATE_RESOURCE"
  | "MISSING_RESOURCE_FIELD"
  | "INVALID_KIND"
  | "INVALID_BPP"
  | "INVALID_PALETTE"
  | "INVALID_COMPRESSION"
  | "INVALID_TILE_LIMIT"
  | "INVALID_RESOURCE_GROUP"
  | "INVALID_PREFETCH"
  | "INVALID_CACHE"
  | "INVALID_EVICTION_PRIORITY"
  | "DUPLICATE_DEPENDENCY"
  | "INVALID_FALLBACK"
  | "INVALID_BUDGET";

export interface SceneResourceIssue {
  code: SceneResourceIssueCode;
  resourceId?: string;
  field?: string;
  message: string;
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

const DEFAULT_PALETTE: SceneResourcePalette = { id: "", slot: "none", colors: 0 };
const DEFAULT_FALLBACK: SceneResourceFallback = { mode: "error" };

export function sceneResourceSupportedBpp(kind: SceneResourceKind): SceneResourceBpp[] {
  if (kind === "affine_bg" || kind === "bitmap4") return [8];
  if (kind === "bitmap3" || kind === "bitmap5") return [15];
  if (kind === "obj") return [4, 8];
  if (kind === "palette" || kind === "hblank_table") return [15];
  return [4];
}

const RESOURCE_DEFAULT_BPP: Record<SceneResourceKind, SceneResourceBpp> = {
  regular_bg: 4,
  affine_bg: 8,
  bitmap3: 15,
  bitmap4: 8,
  bitmap5: 15,
  obj: 4,
  palette: 15,
  audio: 4,
  hblank_table: 15
};

const RESOURCE_KINDS_WITH_TILES = new Set<SceneResourceKind>([
  "regular_bg",
  "affine_bg",
  "obj"
]);

const RESOURCE_KINDS_WITH_PALETTE = new Set<SceneResourceKind>([
  "regular_bg",
  "affine_bg",
  "bitmap4",
  "obj",
  "palette"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function integerValue(value: unknown, fallback: number, minimum = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.floor(value))
    : fallback;
}

function isResourceKind(value: unknown): value is SceneResourceKind {
  return typeof value === "string" && (SCENE_RESOURCE_KINDS as readonly string[]).includes(value);
}

function resourceKind(value: unknown): SceneResourceKind {
  return isResourceKind(value) ? value : "obj";
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function normalizeBudget(value: unknown): ScenePhysicalBudget {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(Object.keys(EMPTY_BUDGET).map((key) => [
    key,
    integerValue(source[key], EMPTY_BUDGET[key as keyof ScenePhysicalBudget])
  ])) as unknown as ScenePhysicalBudget;
}

function normalizePalette(value: unknown): SceneResourcePalette {
  const source = isRecord(value) ? value : {};
  return {
    id: stringValue(source.id),
    slot: enumValue(source.slot, ["background", "objects", "none"] as const, "none"),
    colors: integerValue(source.colors, 0)
  };
}

function normalizeFallback(value: unknown): SceneResourceFallback {
  const source = isRecord(value) ? value : {};
  const mode = enumValue(source.mode, ["error", "omit_decorative", "tiled_default"] as const, "error");
  const assetId = stringValue(source.assetId ?? source.asset_id);
  return assetId ? { mode, assetId } : { mode };
}

function autoCompressionPolicy(): SceneResourceCompressionPolicy {
  return { strategy: "auto", tiles: "auto", tilemap: "auto", palette: "auto" };
}

function manualCompressionPolicy(
  tiles: SceneResourceCompression = "none",
  tilemap: SceneResourceCompression = "none",
  palette: SceneResourceCompression = "none"
): SceneResourceCompressionPolicy {
  return { strategy: "manual", tiles, tilemap, palette };
}

function normalizeLegacyCompression(value: SceneResourceCompression, kind: SceneResourceKind): SceneResourceCompressionPolicy {
  if (value === "none") return manualCompressionPolicy();
  if (value === "rle16") return manualCompressionPolicy("none", kind === "regular_bg" ? "rle16" : "none", "none");
  return manualCompressionPolicy(
    RESOURCE_KINDS_WITH_TILES.has(kind) && kind !== "affine_bg" ? value : "none",
    kind === "regular_bg" ? value : "none",
    RESOURCE_KINDS_WITH_PALETTE.has(kind) ? value : "none"
  );
}

function normalizeCompressionPolicy(value: unknown, kind: SceneResourceKind): SceneResourceCompressionPolicy {
  if (value === "auto") return autoCompressionPolicy();
  if (typeof value === "string" && (SCENE_RESOURCE_COMPRESSION_STRATEGIES as readonly string[]).includes(value)) {
    return normalizeLegacyCompression(value as SceneResourceCompression, kind);
  }
  if (!isRecord(value)) return manualCompressionPolicy();
  if (value.strategy === "auto") return autoCompressionPolicy();
  return manualCompressionPolicy(
    enumValue(value.tiles, SCENE_RESOURCE_COMPRESSION_STRATEGIES, "none"),
    enumValue(value.tilemap, SCENE_RESOURCE_COMPRESSION_STRATEGIES, "none"),
    enumValue(value.palette, SCENE_RESOURCE_COMPRESSION_STRATEGIES, "none")
  );
}

function compressionComponentSupported(
  kind: SceneResourceKind,
  component: SceneResourceCompressionComponent,
  strategy: SceneResourceCompression
): boolean {
  if (strategy === "none") return true;
  if (strategy === "rle16") return kind === "regular_bg" && component === "tilemap";
  if (component === "palette") return RESOURCE_KINDS_WITH_PALETTE.has(kind);
  if (component === "tiles") return kind === "regular_bg";
  return kind === "regular_bg";
}

function compressionPolicyIssues(value: unknown, kind: SceneResourceKind, resourceId: string): SceneResourceIssue[] {
  if (value === undefined) return [];
  if (typeof value === "string") {
    if (value === "auto") return [];
    if (!(SCENE_RESOURCE_COMPRESSION_STRATEGIES as readonly string[]).includes(value)) {
      return [issue("INVALID_COMPRESSION", "compression deve ser auto, none, rle16, lz77 ou huffman.", resourceId, "compression")];
    }
    if (value === "rle16" && kind !== "regular_bg") {
      return [issue("INVALID_COMPRESSION", "rle16 só pode ser usado no tilemap de um regular_bg.", resourceId, "compression")];
    }
    return [];
  }
  if (!isRecord(value)) {
    return [issue("INVALID_COMPRESSION", "compression deve ser auto ou uma política manual.", resourceId, "compression")];
  }
  const issues: SceneResourceIssue[] = [];
  if (value.strategy !== "auto" && value.strategy !== "manual") {
    issues.push(issue("INVALID_COMPRESSION", "compression.strategy deve ser auto ou manual.", resourceId, "compression.strategy"));
    return issues;
  }
  if (value.strategy === "auto") {
    (["tiles", "tilemap", "palette"] as const).forEach((component) => {
      if (value[component] !== undefined && value[component] !== "auto") {
        issues.push(issue("INVALID_COMPRESSION", `compression.${component} deve ser auto quando strategy é auto.`, resourceId, `compression.${component}`));
      }
    });
    return issues;
  }
  (["tiles", "tilemap", "palette"] as const).forEach((component) => {
    const selected = value[component];
    if (!(SCENE_RESOURCE_COMPRESSION_STRATEGIES as readonly string[]).includes(selected as string)) {
      issues.push(issue("INVALID_COMPRESSION", `compression.${component} deve ser none, rle16, lz77 ou huffman.`, resourceId, `compression.${component}`));
      return;
    }
    if (!compressionComponentSupported(kind, component, selected as SceneResourceCompression)) {
      issues.push(issue("INVALID_COMPRESSION", `${selected} não é compatível com ${kind}.${component}.`, resourceId, `compression.${component}`));
    }
  });
  return issues;
}

function normalizeResource(value: unknown, index: number): SceneResourceDescriptor | null {
  if (!isRecord(value)) return null;
  const kind = resourceKind(value.kind);
  const dependencies = Array.isArray(value.dependencies)
    ? value.dependencies.filter((dependency): dependency is string => typeof dependency === "string" && dependency.trim().length > 0).map((dependency) => dependency.trim())
    : [];
  return {
    id: stringValue(value.id, `resource_${index + 1}`),
    assetId: stringValue(value.assetId ?? value.asset_id),
    kind,
    enabled: booleanValue(value.enabled, false),
    required: booleanValue(value.required, false),
    bpp: [4, 8, 15].includes(value.bpp as number) ? value.bpp as SceneResourceBpp : RESOURCE_DEFAULT_BPP[kind],
    palette: normalizePalette(value.palette),
    compression: normalizeCompressionPolicy(value.compression, kind),
    tileLimit: integerValue(value.tileLimit ?? value.tile_limit, 0),
    resourceGroup: stringValue(value.resourceGroup ?? value.resource_group, "global"),
    prefetch: enumValue(value.prefetch, ["none", "scene", "camera", "manual"] as const, "none"),
    cache: enumValue(value.cache, ["resident", "evictable"] as const, "resident"),
    evictionPriority: integerValue(value.evictionPriority ?? value.eviction_priority, 0, 0),
    dependencies,
    fallback: normalizeFallback(value.fallback),
    budget: normalizeBudget(value.budget)
  };
}

export function defaultSceneResourceManifest(): SceneResourceManifest {
  return { schema: 1, resources: [], dependencies: [] };
}

export function normalizeSceneResourceManifest(value: unknown): SceneResourceManifest {
  if (!isRecord(value)) return defaultSceneResourceManifest();
  const resources = Array.isArray(value.resources)
    ? value.resources.map((entry, index) => normalizeResource(entry, index)).filter((entry): entry is SceneResourceDescriptor => entry !== null)
    : [];
  const dependencies = Array.isArray(value.dependencies)
    ? value.dependencies.filter((dependency): dependency is string => typeof dependency === "string" && dependency.trim().length > 0).map((dependency) => dependency.trim())
    : [];
  return {
    schema: 1,
    resources,
    dependencies: Array.from(new Set(dependencies))
  };
}

function issue(
  code: SceneResourceIssueCode,
  message: string,
  resourceId?: string,
  field?: string
): SceneResourceIssue {
  return { code, message, ...(resourceId ? { resourceId } : {}), ...(field ? { field } : {}) };
}

function budgetIsValid(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.keys(EMPTY_BUDGET).every((key) => (
    typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0
  ));
}

function maxTileLimit(kind: SceneResourceKind): number {
  if (kind === "affine_bg") return 256;
  if (kind === "regular_bg" || kind === "obj") return 1024;
  return 0;
}

export function sceneResourceManifestIssues(value: unknown): SceneResourceIssue[] {
  if (value === undefined || value === null) return [];
  if (!isRecord(value)) return [issue("INVALID_MANIFEST", "O manifesto de recursos da cena deve ser um objeto.")];
  const issues: SceneResourceIssue[] = [];
  if (value.schema !== undefined && value.schema !== 1) {
    issues.push(issue("INVALID_SCHEMA", "O manifesto de recursos deve usar schema 1.", undefined, "schema"));
  }
  if (value.dependencies !== undefined && !Array.isArray(value.dependencies)) {
    issues.push(issue("INVALID_MANIFEST", "dependencies deve ser uma lista de IDs.", undefined, "dependencies"));
  }
  const dependencies = Array.isArray(value.dependencies)
    ? value.dependencies.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (new Set(dependencies).size !== dependencies.length) {
    issues.push(issue("DUPLICATE_DEPENDENCY", "dependencies não pode conter IDs repetidos.", undefined, "dependencies"));
  }
  if (!Array.isArray(value.resources)) {
    issues.push(issue("INVALID_MANIFEST", "resources deve ser uma lista.", undefined, "resources"));
    return issues;
  }

  const seen = new Set<string>();
  value.resources.forEach((raw, index) => {
    const pathID = isRecord(raw) ? stringValue(raw.id, `resource_${index + 1}`) : `resource_${index + 1}`;
    if (!isRecord(raw)) {
      issues.push(issue("INVALID_RESOURCE", "Cada recurso deve ser um objeto.", pathID));
      return;
    }
    if (seen.has(pathID)) issues.push(issue("DUPLICATE_RESOURCE", `O recurso ${pathID} foi declarado mais de uma vez.`, pathID, "id"));
    seen.add(pathID);

    const kind = raw.kind;
    if (!isResourceKind(kind)) {
      issues.push(issue("INVALID_KIND", "kind não pertence ao registro tipado de recursos.", pathID, "kind"));
    }
    const normalizedKind = resourceKind(kind);
    const assetId = raw.assetId ?? raw.asset_id;
    if (typeof assetId !== "string" || assetId.trim().length === 0) {
      issues.push(issue("MISSING_RESOURCE_FIELD", "assetId deve vincular o recurso a um asset do projeto.", pathID, "assetId"));
    }
    if (typeof raw.enabled !== "boolean") issues.push(issue("MISSING_RESOURCE_FIELD", "enabled deve ser booleano explícito.", pathID, "enabled"));
    if (typeof raw.required !== "boolean") issues.push(issue("MISSING_RESOURCE_FIELD", "required deve ser booleano explícito.", pathID, "required"));

    const bpp = raw.bpp;
    if (![4, 8, 15].includes(bpp as number)) {
      issues.push(issue("INVALID_BPP", "bpp deve ser 4, 8 ou 15.", pathID, "bpp"));
    } else if (!sceneResourceSupportedBpp(normalizedKind).includes(bpp as SceneResourceBpp)) {
      issues.push(issue("INVALID_BPP", `bpp ${String(bpp)} não é compatível com ${normalizedKind}.`, pathID, "bpp"));
    }

    const palette = raw.palette;
    if (RESOURCE_KINDS_WITH_PALETTE.has(normalizedKind)) {
      if (!isRecord(palette) || typeof palette.id !== "string" || typeof palette.slot !== "string" || typeof palette.colors !== "number") {
        issues.push(issue("INVALID_PALETTE", "Recursos visuais precisam declarar id, slot e colors da paleta.", pathID, "palette"));
      } else {
        const maxColors = bpp === 4 ? 16 : 256;
        if (!Number.isInteger(palette.colors) || palette.colors <= 0 || palette.colors > maxColors || palette.slot === "none") {
          issues.push(issue("INVALID_PALETTE", `A paleta de ${normalizedKind} deve ter 1-${maxColors} cores e um slot válido.`, pathID, "palette"));
        }
      }
    }

    const tileLimit = raw.tileLimit ?? raw.tile_limit;
    if (RESOURCE_KINDS_WITH_TILES.has(normalizedKind) && (
      typeof tileLimit !== "number" || !Number.isInteger(tileLimit) || tileLimit <= 0 || tileLimit > maxTileLimit(normalizedKind)
    )) {
      issues.push(issue("INVALID_TILE_LIMIT", `tileLimit de ${normalizedKind} deve estar entre 1 e ${maxTileLimit(normalizedKind)}.`, pathID, "tileLimit"));
    }
    const resourceGroup = raw.resourceGroup ?? raw.resource_group;
    if (typeof resourceGroup !== "string" || resourceGroup.trim().length === 0) {
      issues.push(issue("INVALID_RESOURCE_GROUP", "resourceGroup deve ser uma string não vazia.", pathID, "resourceGroup"));
    }
    issues.push(...compressionPolicyIssues(raw.compression, normalizedKind, pathID));
    if (raw.prefetch !== undefined && !["none", "scene", "camera", "manual"].includes(raw.prefetch as string)) {
      issues.push(issue("INVALID_PREFETCH", "prefetch deve ser none, scene, camera ou manual.", pathID, "prefetch"));
    }
    if (raw.cache !== undefined && !["resident", "evictable"].includes(raw.cache as string)) {
      issues.push(issue("INVALID_CACHE", "cache deve ser resident ou evictable.", pathID, "cache"));
    }
    const evictionPriority = raw.evictionPriority ?? raw.eviction_priority;
    if (evictionPriority !== undefined && (typeof evictionPriority !== "number" || !Number.isInteger(evictionPriority) || evictionPriority < 0 || evictionPriority > 255)) {
      issues.push(issue("INVALID_EVICTION_PRIORITY", "evictionPriority deve ser um inteiro entre 0 e 255.", pathID, "evictionPriority"));
    }
    if (raw.dependencies !== undefined && (!Array.isArray(raw.dependencies) || new Set(raw.dependencies).size !== raw.dependencies.length)) {
      issues.push(issue("DUPLICATE_DEPENDENCY", "dependencies do recurso devem ser IDs únicos.", pathID, "dependencies"));
    }
    if (!isRecord(raw.fallback) || !["error", "omit_decorative", "tiled_default"].includes(raw.fallback.mode as string)) {
      issues.push(issue("INVALID_FALLBACK", "fallback deve declarar error, omit_decorative ou tiled_default.", pathID, "fallback"));
    }
    if (!budgetIsValid(raw.budget)) {
      issues.push(issue("INVALID_BUDGET", "budget deve declarar os dez custos físicos como números não negativos.", pathID, "budget"));
    }
  });
  return issues;
}

export interface ExportedSceneResourceManifest {
  schema: 1;
  resources: Array<{
    id: string;
    asset: string;
    kind: SceneResourceKind;
    enabled: boolean;
    required: boolean;
    bpp: SceneResourceBpp;
    palette: SceneResourcePalette;
    compression: "auto" | SceneResourceCompressionPolicy;
    tile_limit: number;
    resource_group: string;
    prefetch: SceneResourcePrefetch;
    cache: SceneResourceCachePolicy;
    eviction_priority: number;
    dependencies: string[];
    fallback: SceneResourceFallback;
    budget: ScenePhysicalBudget;
  }>;
  dependencies: string[];
}

export function exportSceneResourceManifest(value: unknown): ExportedSceneResourceManifest {
  const manifest = normalizeSceneResourceManifest(value);
  return {
    schema: 1,
    resources: manifest.resources
      .filter((resource) => resource.enabled)
      .map((resource) => ({
        id: resource.id,
        asset: resource.assetId,
        kind: resource.kind,
        enabled: resource.enabled,
        required: resource.required,
        bpp: resource.bpp,
        palette: { ...resource.palette },
        compression: resource.compression.strategy === "auto" ? "auto" : { ...resource.compression },
        tile_limit: resource.tileLimit,
        resource_group: resource.resourceGroup,
        prefetch: resource.prefetch,
        cache: resource.cache,
        eviction_priority: resource.evictionPriority,
        dependencies: [...resource.dependencies],
        fallback: { ...resource.fallback },
        budget: { ...resource.budget }
      })),
    dependencies: [...manifest.dependencies]
  };
}

export function defaultSceneResourceBudget(): ScenePhysicalBudget {
  return { ...EMPTY_BUDGET };
}
