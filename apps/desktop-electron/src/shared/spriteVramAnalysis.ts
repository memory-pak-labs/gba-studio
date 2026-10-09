import { spriteColorMode } from "./spriteColorDepth.js";
import { gbaSpriteOamEntriesForPixels, gbaSpriteTilesForPixels } from "./gbaRendering.js";
import { gbaObjNativeDimension } from "./gbaVideoModes.js";
import type { GBAProjectData } from "./projectFile.js";

export const spriteVramHorizontalObjTileLimit = 8;
export const spriteVramHighUsageThresholdBytes = 32 * 1024;

export const spriteVramWarningLabels = {
  horizontalOBJTileLimit: "Frame largo: sera decomposto em multiplos OBJs do GBA.",
  highVRAMUsage: "Uso estimado de VRAM acima de 32 KB; reduza frames unicos ou reutilize frames."
} as const;

export type SpriteVramWarning = typeof spriteVramWarningLabels[keyof typeof spriteVramWarningLabels];

export const spriteVramRecommendationLabels = {
  splitWideSprite: "Acao: reduza a largura do frame ou divida o sprite para controlar o orcamento de OAM.",
  reuseDuplicateFrames: "Acao: reutilize frames repetidos para economizar tiles unicos."
} as const;

export type SpriteVramRecommendation = keyof typeof spriteVramRecommendationLabels;

export interface SpriteVramAnalysisInput {
  name: string;
  spriteSheet: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  colorMode: string;
  frameIndices?: number[];
  streamFrames?: boolean;
}

export interface SpriteVramAnalysis {
  animationName: string;
  spriteSheet: string;
  tilesWide: number;
  tilesHigh: number;
  tilesPerFrame: number;
  bytesPerTile: number;
  frameCount: number;
  uniqueFrameCount: number;
  totalTileBytes: number;
  uniqueTileBytes: number;
  repeatedFrameSavingsBytes: number;
  residentTileBytes: number;
  nativeObjDimension: string | null;
  oamEntriesPerFrame: number;
  tileAligned: boolean;
  warnings: SpriteVramWarning[];
  recommendations: SpriteVramRecommendation[];
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function uniqueFrameCount(input: SpriteVramAnalysisInput): number {
  const frameCount = positiveInteger(input.frameCount, 1);
  const frameIndices = Array.isArray(input.frameIndices)
    ? input.frameIndices.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    : [];
  if (frameIndices.length > 0) {
    return Math.max(1, new Set(frameIndices.slice(0, frameCount)).size);
  }
  return frameCount;
}

export function auditProjectSpriteVramWarnings(data: GBAProjectData): string[] {
  const animations = Array.isArray(data.animations) ? data.animations : [];
  const warnings = new Set<string>();

  for (const animation of animations) {
    if (!animation || typeof animation !== "object") continue;
    const record = animation as Record<string, unknown>;
    const name = typeof record.name === "string" && record.name.trim().length > 0 ? record.name.trim() : "animacao";
    const spriteSheet = typeof record.spriteSheet === "string" ? record.spriteSheet : "";
    if (!spriteSheet) continue;

    const analysis = analyzeSpriteVram({
      name,
      spriteSheet,
      frameWidth: typeof record.frameWidth === "number" ? record.frameWidth : 16,
      frameHeight: typeof record.frameHeight === "number" ? record.frameHeight : 16,
      frameCount: typeof record.frameCount === "number" ? record.frameCount : 1,
      colorMode: typeof record.colorMode === "string" ? record.colorMode : "4bpp",
      streamFrames: (data.assets as Record<string, any>[] | undefined)?.some(asset => (asset.name === spriteSheet || asset.id === spriteSheet) && asset.metadata?.streamFrames === true)
    });

    for (const warning of analysis.warnings) {
      warnings.add(`${name} (${spriteSheet}): ${warning}`);
    }
  }

  return [...warnings];
}

function auditProjectSpriteVramMessages(data: GBAProjectData, label: string): string[] {
  return auditProjectSpriteVramWarnings(data).filter((warning) => warning.includes(label));
}

/** Wide logical frames are supported by the metasprite exporter and remain visible as export notes. */
export function auditProjectSpriteVramExportNotices(data: GBAProjectData): string[] {
  return auditProjectSpriteVramMessages(data, spriteVramWarningLabels.horizontalOBJTileLimit);
}

/** High estimated OBJ VRAM pressure needs review in the Sprites workspace. */
export function auditProjectSpriteVramHealthWarnings(data: GBAProjectData): string[] {
  return auditProjectSpriteVramMessages(data, spriteVramWarningLabels.highVRAMUsage);
}

/** Over-budget VRAM blocks export; wide logical frames are decomposed into native OBJ parts. */
export function auditProjectSpriteVramBlockingErrors(data: GBAProjectData): string[] {
  return auditProjectSpriteVramHealthWarnings(data)
    .map((warning) => `Sprite VRAM: ${warning}`);
}

export function analyzeSpriteVram(input: SpriteVramAnalysisInput): SpriteVramAnalysis {
  const frameCount = positiveInteger(input.frameCount, 1);
  const frameWidth = positiveInteger(input.frameWidth, 8);
  const frameHeight = positiveInteger(input.frameHeight, 8);
  const tilesWide = gbaSpriteTilesForPixels(frameWidth);
  const tilesHigh = gbaSpriteTilesForPixels(frameHeight);
  const tilesPerFrame = Math.max(1, tilesWide * tilesHigh);
  const bytesPerTile = spriteColorMode(input.colorMode) === "8bpp" ? 64 : 32;
  const uniqueFrames = uniqueFrameCount(input);
  const totalTileBytes = tilesPerFrame * frameCount * bytesPerTile;
  const uniqueTileBytes = tilesPerFrame * uniqueFrames * bytesPerTile;
  const repeatedFrameSavingsBytes = Math.max(0, totalTileBytes - uniqueTileBytes);
  const residentTileBytes = input.streamFrames ? tilesPerFrame * bytesPerTile : totalTileBytes;

  const warnings: SpriteVramWarning[] = [];
  if (tilesWide > spriteVramHorizontalObjTileLimit) {
    warnings.push(spriteVramWarningLabels.horizontalOBJTileLimit);
  }
  if (residentTileBytes > spriteVramHighUsageThresholdBytes) {
    warnings.push(spriteVramWarningLabels.highVRAMUsage);
  }

  const recommendations: SpriteVramRecommendation[] = [];
  if (tilesWide > spriteVramHorizontalObjTileLimit) {
    recommendations.push("splitWideSprite");
  }
  if (repeatedFrameSavingsBytes > 0) {
    recommendations.push("reuseDuplicateFrames");
  }

  return {
    animationName: input.name,
    spriteSheet: input.spriteSheet,
    tilesWide,
    tilesHigh,
    tilesPerFrame,
    bytesPerTile,
    frameCount,
    uniqueFrameCount: uniqueFrames,
    totalTileBytes,
    uniqueTileBytes,
    repeatedFrameSavingsBytes,
    residentTileBytes,
    nativeObjDimension: gbaObjNativeDimension(frameWidth, frameHeight),
    oamEntriesPerFrame: gbaSpriteOamEntriesForPixels(frameWidth, frameHeight),
    tileAligned: frameWidth % 8 === 0 && frameHeight % 8 === 0,
    warnings,
    recommendations
  };
}
