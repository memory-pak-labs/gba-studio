export const GBA_SCENE_VIEWPORT_WIDTH_PX = 240;
export const GBA_SCENE_VIEWPORT_HEIGHT_PX = 160;
export const GBA_SCENE_GRID_PX = 8;
export const GBA_SCENE_DEFAULT_WIDTH_TILES = GBA_SCENE_VIEWPORT_WIDTH_PX / GBA_SCENE_GRID_PX;
export const GBA_SCENE_DEFAULT_HEIGHT_TILES = GBA_SCENE_VIEWPORT_HEIGHT_PX / GBA_SCENE_GRID_PX;

export interface GBAAssetMetadataDocument {
  license?: string;
  provenance?: string;
  generatedBy?: string;
  role?: string;
  sceneRoles: string[];
  profile?: string;
  visualProfile?: string;
  colorMode?: string;
  width?: number;
  height?: number;
  tileWidth?: number;
  tileHeight?: number;
  tileCount?: number;
  paletteBankCount?: number;
  backgroundPaletteBankBudget?: number;
  transparentIndex?: number;
  sourcePipeline?: string;
  assetcStatus?: string;
  reviewStatus?: string;
}

export interface GBAAssetDocument {
  schema: "gba-asset/v1";
  id: string;
  name: string;
  kind: string;
  source: string | null;
  metadata: GBAAssetMetadataDocument;
}

export type GBAScenePaletteBankPolicy = "shared-ui" | "full-screen";

export interface GBASceneCampaignDocument {
  chapter: number;
  title: string;
  objective: string;
  nextScene: string | null;
  completionVariable: string | null;
  completedValue: number;
  controls: string;
  success: string;
  failureRecovery: string;
  tutorialDialogue: string | null;
}

export interface GBASceneDocument {
  schema: "gba-scene/v1";
  id: string;
  name: string;
  displayName?: string;
  campaign?: GBASceneCampaignDocument;
  sceneType: string;
  runtimeProfile: string | null;
  paletteBankPolicy: GBAScenePaletteBankPolicy;
  sizeTiles: {
    width: number;
    height: number;
  };
  viewport: {
    widthPx: typeof GBA_SCENE_VIEWPORT_WIDTH_PX;
    heightPx: typeof GBA_SCENE_VIEWPORT_HEIGHT_PX;
    gridPx: typeof GBA_SCENE_GRID_PX;
  };
  background: {
    assetName: string | null;
    renderMode: string;
  };
  tilemap: {
    base: number[];
    foreground: number[];
  };
  collisionTypes: string[];
  hudPresetId: string | null;
  music: string | null;
  eventBindings: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function finiteInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)).map(Math.floor)
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function eventBindings(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, rawValue]) => {
      const normalized = stringValue(rawValue);
      return normalized ? [[key, normalized]] : [];
    })
  );
}

function metadataString(metadata: Record<string, unknown>, key: string): string | undefined {
  return stringValue(metadata[key]) ?? undefined;
}

function metadataNumber(metadata: Record<string, unknown>, key: string): number | undefined {
  const value = finiteInteger(metadata[key]);
  return value === null ? undefined : value;
}

function campaignDocument(value: unknown, fallbackTitle: string): GBASceneCampaignDocument | undefined {
  if (!isRecord(value)) return undefined;
  return {
    chapter: finiteInteger(value.chapter) ?? 0,
    title: stringValue(value.title) ?? fallbackTitle,
    objective: stringValue(value.objective) ?? "",
    nextScene: stringValue(value.nextScene),
    completionVariable: stringValue(value.completionVariable),
    completedValue: finiteInteger(value.completedValue) ?? 1,
    controls: stringValue(value.controls) ?? "",
    success: stringValue(value.success) ?? "",
    failureRecovery: stringValue(value.failureRecovery) ?? "",
    tutorialDialogue: stringValue(value.tutorialDialogue)
  };
}

export function normalizeGBAAssetDocument(asset: unknown, fallbackIndex = 0): GBAAssetDocument {
  const record = isRecord(asset) ? asset : {};
  const metadata = isRecord(record.metadata) ? record.metadata : {};
  const name = stringValue(record.name) ?? `asset-${fallbackIndex + 1}`;
  const source = stringValue(metadata.source) ?? stringValue(record.relativePath) ?? stringValue(record.source);
  const metadataDocument: GBAAssetMetadataDocument = {
    sceneRoles: stringArray(metadata.sceneRoles),
    ...(metadataString(metadata, "license") ? { license: metadataString(metadata, "license") } : {}),
    ...(metadataString(metadata, "provenance") ? { provenance: metadataString(metadata, "provenance") } : {}),
    ...(metadataString(metadata, "generatedBy") ? { generatedBy: metadataString(metadata, "generatedBy") } : {}),
    ...(metadataString(metadata, "role") ? { role: metadataString(metadata, "role") } : {}),
    ...(metadataString(metadata, "profile") ? { profile: metadataString(metadata, "profile") } : {}),
    ...(metadataString(metadata, "visualProfile") ? { visualProfile: metadataString(metadata, "visualProfile") } : {}),
    ...(metadataString(metadata, "colorMode") ? { colorMode: metadataString(metadata, "colorMode") } : {}),
    ...(metadataNumber(metadata, "width") !== undefined ? { width: metadataNumber(metadata, "width") } : {}),
    ...(metadataNumber(metadata, "height") !== undefined ? { height: metadataNumber(metadata, "height") } : {}),
    ...(metadataNumber(metadata, "tileWidth") !== undefined ? { tileWidth: metadataNumber(metadata, "tileWidth") } : {}),
    ...(metadataNumber(metadata, "tileHeight") !== undefined ? { tileHeight: metadataNumber(metadata, "tileHeight") } : {}),
    ...(metadataNumber(metadata, "tileCount") !== undefined ? { tileCount: metadataNumber(metadata, "tileCount") } : {}),
    ...(metadataNumber(metadata, "paletteBankCount") !== undefined ? { paletteBankCount: metadataNumber(metadata, "paletteBankCount") } : {}),
    ...(metadataNumber(metadata, "backgroundPaletteBankBudget") !== undefined ? { backgroundPaletteBankBudget: metadataNumber(metadata, "backgroundPaletteBankBudget") } : {}),
    ...(metadataNumber(metadata, "transparentIndex") !== undefined ? { transparentIndex: metadataNumber(metadata, "transparentIndex") } : {}),
    ...(metadataString(metadata, "sourcePipeline") ? { sourcePipeline: metadataString(metadata, "sourcePipeline") } : {}),
    ...(metadataString(metadata, "assetcStatus") ? { assetcStatus: metadataString(metadata, "assetcStatus") } : {}),
    ...(metadataString(metadata, "reviewStatus") ? { reviewStatus: metadataString(metadata, "reviewStatus") } : {})
  };

  return {
    schema: "gba-asset/v1",
    id: stringValue(record.id) ?? `asset-${fallbackIndex + 1}`,
    name,
    kind: stringValue(record.kind) ?? "Unknown",
    source,
    metadata: metadataDocument
  };
}

function foregroundTilemap(room: Record<string, unknown>): number[] {
  const explicit = numberArray(room.foregroundTiles);
  if (explicit.length > 0) return explicit;

  const layers = Array.isArray(room.tileLayers) ? room.tileLayers.filter(isRecord) : [];
  const foreground = layers.find((layer) => {
    const mapping = stringValue(layer.mapping)?.toUpperCase();
    return mapping === "BG1" || mapping === "TOP" || mapping === "FOREGROUND";
  });
  return foreground ? numberArray(foreground.tilemap) : [];
}

export function normalizeGBASceneDocument(room: unknown, fallbackIndex = 0): GBASceneDocument {
  const record = isRecord(room) ? room : {};
  const runtime = isRecord(record.runtime) ? record.runtime : {};
  const name = stringValue(record.name) ?? `room_${fallbackIndex + 1}`;
  const displayName = stringValue(record.displayName);
  const campaign = campaignDocument(record.campaign, displayName ?? name);
  const runtimeProfile = stringValue(runtime.type) ?? stringValue(record.runtimeProfile);
  const backgroundAssetName = stringValue(record.backgroundAssetName) ?? stringValue(record.background);
  const tilemap = numberArray(record.tilemap);

  return {
    schema: "gba-scene/v1",
    id: stringValue(record.id) ?? name,
    name,
    ...(displayName ? { displayName } : {}),
    ...(campaign ? { campaign } : {}),
    sceneType: stringValue(record.sceneType) ?? "topdown",
    runtimeProfile,
    paletteBankPolicy: record.paletteBankPolicy === "full-screen" ? "full-screen" : "shared-ui",
    sizeTiles: {
      width: positiveInteger(record.width, GBA_SCENE_DEFAULT_WIDTH_TILES),
      height: positiveInteger(record.height, GBA_SCENE_DEFAULT_HEIGHT_TILES)
    },
    viewport: {
      widthPx: GBA_SCENE_VIEWPORT_WIDTH_PX,
      heightPx: GBA_SCENE_VIEWPORT_HEIGHT_PX,
      gridPx: GBA_SCENE_GRID_PX
    },
    background: {
      assetName: backgroundAssetName,
      renderMode: stringValue(record.backgroundRenderMode) ?? "tilemap"
    },
    tilemap: {
      base: tilemap,
      foreground: foregroundTilemap(record)
    },
    collisionTypes: stringArray(record.collisionTypes).length > 0
      ? stringArray(record.collisionTypes)
      : stringArray(record.collisions),
    hudPresetId: stringValue(record.hudPresetId) ?? stringValue(isRecord(runtime.config) ? runtime.config.hudPresetId : undefined),
    music: stringValue(record.music),
    eventBindings: eventBindings(record.eventBindings)
  };
}
