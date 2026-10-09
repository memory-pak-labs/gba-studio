import type { GBAProjectData } from "./projectFile.js";
import type { SceneTileLayerMapping } from "./sceneTileLayers.js";

export const gbaVramTotalBytes = 96 * 1024;
export const gbaObjSpriteLimit = 128;
export const gbaObjMinSpritePx = 8;
export const gbaObjMaxSpritePx = 64;
export const gbaSceneViewportWidthPx = 240;
export const gbaSceneViewportHeightPx = 160;
export const gbaSceneViewportWidthTiles = gbaSceneViewportWidthPx / 8;
export const gbaSceneViewportHeightTiles = gbaSceneViewportHeightPx / 8;
export const gbaTileSizePx = 8;

export type GbaBackgroundMapSizeID = "32x32" | "64x32" | "32x64" | "64x64";

export interface GbaBackgroundMapSizeDefinition {
  heightPixels: number;
  heightTiles: number;
  id: GbaBackgroundMapSizeID;
  label: string;
  screenblocks: number;
  widthPixels: number;
  widthTiles: number;
}

export const gbaBackgroundMapSizeDefinitions: readonly GbaBackgroundMapSizeDefinition[] = [
  { id: "32x32", label: "32×32 tiles · 256×256 px", widthTiles: 32, heightTiles: 32, widthPixels: 256, heightPixels: 256, screenblocks: 1 },
  { id: "64x32", label: "64×32 tiles · 512×256 px", widthTiles: 64, heightTiles: 32, widthPixels: 512, heightPixels: 256, screenblocks: 2 },
  { id: "32x64", label: "32×64 tiles · 256×512 px", widthTiles: 32, heightTiles: 64, widthPixels: 256, heightPixels: 512, screenblocks: 2 },
  { id: "64x64", label: "64×64 tiles · 512×512 px", widthTiles: 64, heightTiles: 64, widthPixels: 512, heightPixels: 512, screenblocks: 4 }
];

export const gbaObjNativeDimensions: readonly { heightPixels: number; id: string; widthPixels: number }[] = [
  { id: "8x8", widthPixels: 8, heightPixels: 8 },
  { id: "16x16", widthPixels: 16, heightPixels: 16 },
  { id: "32x32", widthPixels: 32, heightPixels: 32 },
  { id: "64x64", widthPixels: 64, heightPixels: 64 },
  { id: "16x8", widthPixels: 16, heightPixels: 8 },
  { id: "32x8", widthPixels: 32, heightPixels: 8 },
  { id: "32x16", widthPixels: 32, heightPixels: 16 },
  { id: "64x32", widthPixels: 64, heightPixels: 32 },
  { id: "8x16", widthPixels: 8, heightPixels: 16 },
  { id: "8x32", widthPixels: 8, heightPixels: 32 },
  { id: "16x32", widthPixels: 16, heightPixels: 32 },
  { id: "32x64", widthPixels: 32, heightPixels: 64 }
];

export type GbaVideoModeId = 0 | 1 | 2 | 3 | 4 | 5;
export type GbaBackgroundLayerKind = "text" | "affine" | "bitmap";

export interface GbaBackgroundLayerSpec {
  available: boolean;
  kind: GbaBackgroundLayerKind;
  role: string;
}

export interface GbaVideoModeDefinition {
  backgroundLayers: Record<SceneTileLayerMapping, GbaBackgroundLayerSpec>;
  description: string;
  id: GbaVideoModeId;
  label: string;
  supportsTilePainting: boolean;
}

export const gbaBackgroundLayerDrawOrder: SceneTileLayerMapping[] = ["BG3", "BG2", "BG1", "BG0"];

const mode0Layers: Record<SceneTileLayerMapping, GbaBackgroundLayerSpec> = {
  BG3: { available: true, kind: "text", role: "Fundo distante / parallax" },
  BG2: { available: true, kind: "text", role: "Mapa principal" },
  BG1: { available: true, kind: "text", role: "Overlay sobre o chao" },
  BG0: { available: true, kind: "text", role: "Frente que pode cobrir sprites" }
};

const mode1Layers: Record<SceneTileLayerMapping, GbaBackgroundLayerSpec> = {
  BG3: { available: false, kind: "text", role: "Indisponivel no Modo 1" },
  BG2: { available: true, kind: "affine", role: "Camada afinidade (rotacao/escala)" },
  BG1: { available: true, kind: "text", role: "Tilemap estatico" },
  BG0: { available: true, kind: "text", role: "Tilemap estatico" }
};

const mode2Layers: Record<SceneTileLayerMapping, GbaBackgroundLayerSpec> = {
  BG3: { available: true, kind: "affine", role: "Camada afinidade (rotacao/escala)" },
  BG2: { available: true, kind: "affine", role: "Camada afinidade (rotacao/escala)" },
  BG1: { available: false, kind: "text", role: "Indisponivel no Modo 2" },
  BG0: { available: false, kind: "text", role: "Indisponivel no Modo 2" }
};

const bitmapLayers = (label: string): Record<SceneTileLayerMapping, GbaBackgroundLayerSpec> => ({
  BG3: { available: false, kind: "bitmap", role: label },
  BG2: { available: false, kind: "bitmap", role: label },
  BG1: { available: false, kind: "bitmap", role: label },
  BG0: { available: false, kind: "bitmap", role: label }
});

export const gbaVideoModeDefinitions: GbaVideoModeDefinition[] = [
  {
    id: 0,
    label: "Modo 0 — 4 tilemaps estaticos",
    description: "Quatro camadas de fundo independentes (BG0–BG3) com suporte a parallax, transparencia, mosaico e efeitos de cor.",
    backgroundLayers: mode0Layers,
    supportsTilePainting: true
  },
  {
    id: 1,
    label: "Modo 1 — 2 tilemaps + 1 afinidade",
    description: "BG0 e BG1 estaticos; BG2 com rotacao e escala. BG3 nao esta disponivel como tilemap.",
    backgroundLayers: mode1Layers,
    supportsTilePainting: true
  },
  {
    id: 2,
    label: "Modo 2 — 2 camadas afinidade",
    description: "BG2 e BG3 com rotacao e escala. BG0 e BG1 nao estao disponiveis.",
    backgroundLayers: mode2Layers,
    supportsTilePainting: true
  },
  {
    id: 3,
    label: "Modo 3 — Bitmap 15-bit",
    description: "Framebuffer direct-draw 240×160 em cor direta. Tilemaps BG nao se aplicam.",
    backgroundLayers: bitmapLayers("Renderizacao direct-draw 240×160"),
    supportsTilePainting: false
  },
  {
    id: 4,
    label: "Modo 4 — Bitmap 8-bit",
    description: "Framebuffer direct-draw 240×160 com paleta. Tilemaps BG nao se aplicam.",
    backgroundLayers: bitmapLayers("Renderizacao direct-draw paletizada"),
    supportsTilePainting: false
  },
  {
    id: 5,
    label: "Modo 5 — Bitmap 15-bit 160×128",
    description: "Framebuffer direct-draw 160×128 em cor direta com duas paginas. Tilemaps BG nao se aplicam.",
    backgroundLayers: bitmapLayers("Renderizacao direct-draw 160×128 com page flip"),
    supportsTilePainting: false
  }
];

export interface GbaObjLayerSpec {
  label: string;
  maxSprites: number;
  maxSpritePx: number;
  minSpritePx: number;
  role: string;
  vramBytes: number;
}

export const gbaObjLayerSpec: GbaObjLayerSpec = {
  label: "OBJ — Sprites",
  maxSprites: gbaObjSpriteLimit,
  minSpritePx: gbaObjMinSpritePx,
  maxSpritePx: gbaObjMaxSpritePx,
  role: "Camada dedicada a sprites moveis (ate 128 OBJs, 8×8 a 64×64 px).",
  vramBytes: gbaVramTotalBytes
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

export function gbaVideoModeDefinition(mode: GbaVideoModeId): GbaVideoModeDefinition {
  return gbaVideoModeDefinitions.find((entry) => entry.id === mode) ?? gbaVideoModeDefinitions[0];
}

export function parseGbaVideoMode(value: string): GbaVideoModeId {
  const normalized = value.trim().toLowerCase();
  const modeMatch = normalized.match(/mode\s*(\d)/);
  if (modeMatch) {
    const parsed = Number(modeMatch[1]);
    if (parsed >= 0 && parsed <= 5) return parsed as GbaVideoModeId;
  }
  if (normalized.includes("bitmap") && normalized.includes("8")) return 4;
  if (normalized.includes("bitmap")) return 3;
  if (normalized.includes("affine") && normalized.includes("2")) return 2;
  if (normalized.includes("affine") || normalized.includes("afinidade")) return 1;
  return 0;
}

export function parseGbaBackgroundMapSize(value: unknown): GbaBackgroundMapSizeID | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  const match = gbaBackgroundMapSizeDefinitions.find((definition) => (
    definition.id === normalized || `${definition.widthTiles}x${definition.heightTiles}` === normalized
  ));
  return match?.id ?? null;
}

export function gbaBackgroundMapSizeDefinition(id: GbaBackgroundMapSizeID): GbaBackgroundMapSizeDefinition {
  return gbaBackgroundMapSizeDefinitions.find((definition) => definition.id === id) ?? gbaBackgroundMapSizeDefinitions[0];
}

export function gbaBackgroundMapSizeFits(
  mapSize: GbaBackgroundMapSizeID,
  widthTiles: number,
  heightTiles: number
): boolean {
  const definition = gbaBackgroundMapSizeDefinition(mapSize);
  return widthTiles <= definition.widthTiles && heightTiles <= definition.heightTiles;
}

export function gbaBackgroundMapSizeForDimensions(widthTiles: number, heightTiles: number): GbaBackgroundMapSizeDefinition {
  const normalizedWidth = Math.max(1, Math.ceil(Number.isFinite(widthTiles) ? widthTiles : 1));
  const normalizedHeight = Math.max(1, Math.ceil(Number.isFinite(heightTiles) ? heightTiles : 1));
  return gbaBackgroundMapSizeDefinitions.find((definition) => (
    normalizedWidth <= definition.widthTiles && normalizedHeight <= definition.heightTiles
  )) ?? gbaBackgroundMapSizeDefinitions[gbaBackgroundMapSizeDefinitions.length - 1];
}

export function gbaBackgroundMapSizeFromProject(data: GBAProjectData): GbaBackgroundMapSizeID {
  const settings = isRecord(data.settings) ? data.settings : {};
  const backgrounds = isRecord(settings.backgrounds) ? settings.backgrounds : {};
  const hardware = isRecord(settings.hardware) ? settings.hardware : {};
  return parseGbaBackgroundMapSize(backgrounds.defaultMapSize)
    ?? parseGbaBackgroundMapSize(hardware.backgroundMapSize)
    ?? "32x32";
}

export function gbaObjNativeDimension(widthPixels: number, heightPixels: number): string | null {
  return gbaObjNativeDimensions.find((dimension) => (
    dimension.widthPixels === widthPixels && dimension.heightPixels === heightPixels
  ))?.id ?? null;
}

export function gbaVideoModeFromProject(data: GBAProjectData): GbaVideoModeDefinition {
  const settings = isRecord(data.settings) ? data.settings : {};
  const backgrounds = isRecord(settings.backgrounds) ? settings.backgrounds : {};
  const hardware = isRecord(settings.hardware) ? settings.hardware : {};
  const graphicsMode = stringField(backgrounds.graphicsMode, stringField(hardware.graphicsMode, "Mode 0 - Tilemaps"));
  return gbaVideoModeDefinition(parseGbaVideoMode(graphicsMode));
}

export function availableBackgroundLayersForVideoMode(mode: GbaVideoModeId): SceneTileLayerMapping[] {
  const definition = gbaVideoModeDefinition(mode);
  return gbaBackgroundLayerDrawOrder.filter((mapping) => definition.backgroundLayers[mapping].available);
}

export function sceneTileLayerAvailableForVideoMode(
  mapping: SceneTileLayerMapping,
  mode: GbaVideoModeId
): boolean {
  return gbaVideoModeDefinition(mode).backgroundLayers[mapping].available;
}

export function sceneTileLayerSupportsPainting(sceneType: string, mode: GbaVideoModeId): boolean {
  return gbaVideoModeDefinition(mode).supportsTilePainting;
}

export function gbaBackgroundLayersBeforeObj(mode: GbaVideoModeId): SceneTileLayerMapping[] {
  return availableBackgroundLayersForVideoMode(mode).filter((mapping) => mapping !== "BG0");
}

export function gbaForegroundBackgroundLayers(mode: GbaVideoModeId): SceneTileLayerMapping[] {
  return sceneTileLayerAvailableForVideoMode("BG0", mode) ? ["BG0"] : [];
}
