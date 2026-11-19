export const AFFINE_SCENE_LIMITS = Object.freeze({
  scaleMinimum: 0.5,
  scaleMaximum: 4,
  rotationMinimum: -180,
  rotationMaximum: 180,
  pivotXMinimum: 0,
  pivotXMaximum: 240,
  pivotYMinimum: 0,
  pivotYMaximum: 160,
  scalePrecision: 256
});

export type AffineSceneLayer = "BG2" | "BG3";

export interface AffineSceneSourceSize {
  width: number;
  height: number;
}

export const PAGED_AFFINE_MINIMUM_SCALE = 0.625;

export function isLargeAffineSource(size: AffineSceneSourceSize | undefined): boolean {
  return Boolean(size && (size.width > 1024 || size.height > 1024));
}

export function pagedAffineSceneIssue(
  sceneType: string,
  size: AffineSceneSourceSize | undefined,
  scaleX: number,
  scaleY: number,
  layer: string
): string | null {
  if (!size || !isLargeAffineSource(size)) return null;
  if (size.width !== size.height || ![2048, 4096].includes(size.width)) {
    return "Use um PNG quadrado de 2048 × 2048 ou 4096 × 4096 px para o fundo Affine paginado.";
  }
  if (!["topdown", "platformer"].includes(sceneType)) return "O fundo Affine paginado está disponível em Aventura / Top-down e Plataforma.";
  if (layer !== "BG2") return "O fundo Affine paginado usa a camada BG2 no Modo 1.";
  if (Math.min(scaleX, scaleY) < PAGED_AFFINE_MINIMUM_SCALE) {
    return "O fundo Affine paginado exige escala inicial de pelo menos 62,5% nos dois eixos.";
  }
  return null;
}

export const DEFAULT_AFFINE_SCENE_SOURCE_SIZE: AffineSceneSourceSize = Object.freeze({
  width: 128,
  height: 128
});

export interface AffineScenePresentation {
  enabled: boolean;
  assetId: string;
  layer: AffineSceneLayer;
  scaleX: number;
  scaleY: number;
  rotationDegrees: number;
  pivotX: number;
  pivotY: number;
  wrap: boolean;
  role: "decorative";
}

const DEFAULT_AFFINE_SCENE_PRESENTATION: AffineScenePresentation = {
  enabled: false,
  assetId: "",
  layer: "BG2",
  scaleX: 1,
  scaleY: 1,
  rotationDegrees: 0,
  pivotX: 120,
  pivotY: 80,
  wrap: true,
  role: "decorative"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function quantizeScale(value: unknown, fallback: number): number {
  const normalized = clamp(
    finiteNumber(value, fallback),
    AFFINE_SCENE_LIMITS.scaleMinimum,
    AFFINE_SCENE_LIMITS.scaleMaximum
  );
  return Math.round(normalized * AFFINE_SCENE_LIMITS.scalePrecision) / AFFINE_SCENE_LIMITS.scalePrecision;
}

export function normalizeAffineScenePresentation(value: unknown): AffineScenePresentation {
  const source = isRecord(value) ? value : {};
  return {
    enabled: source.enabled === true,
    assetId: typeof source.assetId === "string" ? source.assetId.trim() : DEFAULT_AFFINE_SCENE_PRESENTATION.assetId,
    layer: source.layer === "BG3" ? "BG3" : DEFAULT_AFFINE_SCENE_PRESENTATION.layer,
    scaleX: quantizeScale(source.scaleX, DEFAULT_AFFINE_SCENE_PRESENTATION.scaleX),
    scaleY: quantizeScale(source.scaleY, DEFAULT_AFFINE_SCENE_PRESENTATION.scaleY),
    rotationDegrees: Math.round(clamp(
      finiteNumber(source.rotationDegrees, DEFAULT_AFFINE_SCENE_PRESENTATION.rotationDegrees),
      AFFINE_SCENE_LIMITS.rotationMinimum,
      AFFINE_SCENE_LIMITS.rotationMaximum
    )),
    pivotX: Math.round(clamp(
      finiteNumber(source.pivotX, DEFAULT_AFFINE_SCENE_PRESENTATION.pivotX),
      AFFINE_SCENE_LIMITS.pivotXMinimum,
      AFFINE_SCENE_LIMITS.pivotXMaximum
    )),
    pivotY: Math.round(clamp(
      finiteNumber(source.pivotY, DEFAULT_AFFINE_SCENE_PRESENTATION.pivotY),
      AFFINE_SCENE_LIMITS.pivotYMinimum,
      AFFINE_SCENE_LIMITS.pivotYMaximum
    )),
    wrap: typeof source.wrap === "boolean" ? source.wrap : DEFAULT_AFFINE_SCENE_PRESENTATION.wrap,
    role: "decorative"
  };
}

function fixed8(value: number): number {
  const result = Math.round(value * 256);
  return Object.is(result, -0) ? 0 : result;
}

function sourceDimension(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Math.round(value as number) : fallback;
}

export function affineMatrixForScenePresentation(
  value: AffineScenePresentation,
  sourceSize: AffineSceneSourceSize = DEFAULT_AFFINE_SCENE_SOURCE_SIZE,
  scroll = { x: 0, y: 0 }
): {
  pa: number;
  pb: number;
  pc: number;
  pd: number;
  referenceX8: number;
  referenceY8: number;
} {
  const affine = normalizeAffineScenePresentation(value);
  const radians = affine.rotationDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const pa = fixed8(cosine / affine.scaleX);
  const pb = fixed8(-sine / affine.scaleY);
  const pc = fixed8(sine / affine.scaleX);
  const pd = fixed8(cosine / affine.scaleY);
  const sourceWidth = sourceDimension(sourceSize.width, DEFAULT_AFFINE_SCENE_SOURCE_SIZE.width);
  const sourceHeight = sourceDimension(sourceSize.height, DEFAULT_AFFINE_SCENE_SOURCE_SIZE.height);
  // Solve dx = p0 - P*q0 using the quantized hardware matrix. Resident assets
  // center the source. Paged assets use the authored world origin at scale 1.
  const paged = isLargeAffineSource(sourceSize);
  const sourcePivotX8 = paged ? (affine.pivotX + scroll.x) * 256 : Math.round((sourceWidth / 2) * 256);
  const sourcePivotY8 = paged ? (affine.pivotY + scroll.y) * 256 : Math.round((sourceHeight / 2) * 256);
  return {
    pa,
    pb,
    pc,
    pd,
    referenceX8: sourcePivotX8 - (pa * affine.pivotX + pb * affine.pivotY),
    referenceY8: sourcePivotY8 - (pc * affine.pivotX + pd * affine.pivotY)
  };
}
