import { parseGbaVideoMode, type GbaVideoModeId } from "./gbaVideoModes.js";
import {
  affineMatrixForScenePresentation,
  normalizeAffineScenePresentation,
  type AffineScenePresentation,
  type AffineSceneSourceSize
} from "./affineScene.js";

export type AffineCompositionLayer = "BG2" | "BG3";

export interface AffineVideoComposition {
  asset: string;
  layer: AffineCompositionLayer;
  rotationDegrees: number;
  scaleX: number;
  scaleY: number;
  originX: number;
  originY: number;
  wrap: boolean;
}

export interface AdvancedVideoComposition {
  mode: GbaVideoModeId;
  affine: AffineVideoComposition;
  bitmapAsset: string;
  bitmapPage: 0 | 1;
}

export interface ExportedAdvancedVideoComposition {
  display_mode: GbaVideoModeId;
  affine: ({
    asset: string | null;
    layer: AffineCompositionLayer;
    wrap: boolean;
    pa: number;
    pb: number;
    pc: number;
    pd: number;
    reference_x_8: number;
    reference_y_8: number;
  }) | null;
  bitmap: ({
    asset: string;
    page: 0 | 1;
    width: number;
    height: number;
    color_depth: 8 | 15;
  }) | null;
}

export function exportAffineScenePresentation(
  value: AffineScenePresentation,
  resolveAsset: (assetId: string) => string | null = (assetId) => assetId,
  sourceSize?: AffineSceneSourceSize
): NonNullable<ExportedAdvancedVideoComposition["affine"]> | null {
  const presentation = normalizeAffineScenePresentation(value);
  if (!presentation.enabled) return null;
  const matrix = affineMatrixForScenePresentation(presentation, sourceSize);
  return {
    asset: presentation.assetId ? resolveAsset(presentation.assetId) : null,
    layer: presentation.layer,
    wrap: presentation.wrap,
    pa: matrix.pa,
    pb: matrix.pb,
    pc: matrix.pc,
    pd: matrix.pd,
    reference_x_8: matrix.referenceX8,
    reference_y_8: matrix.referenceY8
  };
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function fixed8(value: number): number {
  const normalized = Math.abs(value) < 0.000001 ? 0 : value;
  return Math.round(normalized * 256);
}

export function deriveAdvancedVideoComposition(settings: Record<string, unknown> | null | undefined): AdvancedVideoComposition {
  const source = settings ?? {};
  const mode = parseGbaVideoMode(typeof source.graphicsMode === "string" ? source.graphicsMode : "Mode 0 - Tilemaps");
  const layerValue = typeof source.affineLayer === "string" ? source.affineLayer.toUpperCase() : "BG2";
  const bitmapPage = Math.round(numberValue(source.bitmapPage, 0)) === 1 ? 1 : 0;
  return {
    mode,
    affine: {
      asset: typeof source.affineAsset === "string" ? source.affineAsset.trim() : "",
      layer: layerValue === "BG3" ? "BG3" : "BG2",
      rotationDegrees: clamp(numberValue(source.affineRotation, 0), -360, 360),
      scaleX: clamp(numberValue(source.affineScaleX, 1), 0.0625, 16),
      scaleY: clamp(numberValue(source.affineScaleY, 1), 0.0625, 16),
      originX: clamp(Math.round(numberValue(source.affineOriginX, 120)), -32768, 32767),
      originY: clamp(Math.round(numberValue(source.affineOriginY, 80)), -32768, 32767),
      wrap: typeof source.affineWrap === "boolean" ? source.affineWrap : true
    },
    bitmapAsset: typeof source.bitmapAsset === "string" ? source.bitmapAsset.trim() : "",
    bitmapPage
  };
}

export function affineMatrixForComposition(affine: AffineVideoComposition): {
  pa: number;
  pb: number;
  pc: number;
  pd: number;
  referenceX8: number;
  referenceY8: number;
} {
  const radians = affine.rotationDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    pa: fixed8(cosine / affine.scaleX),
    pb: fixed8(-sine / affine.scaleY),
    pc: fixed8(sine / affine.scaleX),
    pd: fixed8(cosine / affine.scaleY),
    referenceX8: affine.originX * 256,
    referenceY8: affine.originY * 256
  };
}

export function exportAdvancedVideoComposition(composition: AdvancedVideoComposition): ExportedAdvancedVideoComposition {
  const usesAffine = composition.mode === 1 || composition.mode === 2;
  const usesBitmap = composition.mode === 3 || composition.mode === 4 || composition.mode === 5;
  const matrix = affineMatrixForComposition(composition.affine);
  const dimensions = composition.mode === 5 ? { width: 160, height: 128 } : { width: 240, height: 160 };
  return {
    display_mode: composition.mode,
    affine: usesAffine ? {
      asset: composition.affine.asset || null,
      layer: composition.affine.layer,
      wrap: composition.affine.wrap,
      pa: matrix.pa,
      pb: matrix.pb,
      pc: matrix.pc,
      pd: matrix.pd,
      reference_x_8: matrix.referenceX8,
      reference_y_8: matrix.referenceY8
    } : null,
    bitmap: usesBitmap && composition.bitmapAsset ? {
      asset: composition.bitmapAsset,
      page: composition.mode === 3 ? 0 : composition.bitmapPage,
      ...dimensions,
      color_depth: composition.mode === 4 ? 8 : 15
    } : null
  };
}
