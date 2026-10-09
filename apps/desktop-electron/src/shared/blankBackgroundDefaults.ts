import catalog from "../../default-assets/templates/blank/background-defaults.json" with { type: "json" };
import type { GBAProjectData } from "./projectFile.js";
import { normalizeSceneTypeId } from "./sceneTypes.js";
import { defaultSceneTileLayers } from "./sceneTileLayers.js";
import { normalizeIsometricSceneConfig } from "./sceneTypeProfiles.js";

export const BLANK_BACKGROUND_DEFAULTS_PROFILE = "neutral-orange";

export function defaultBackgroundKeyForRoom(room: Record<string, unknown>): string {
  const runtime = room.runtime as { config?: { gameplayMode?: string; presentation?: string } } | undefined;
  const type = normalizeSceneTypeId(String(room.sceneType ?? "topdown"));
  return type === "racing" && runtime?.config?.presentation === "pseudo3d" ? "racingPerspective"
    : type === "isometric" && runtime?.config?.gameplayMode === "tactical" ? "isometricTactical" : type;
}

/** An explicit empty selection disables automatic backgrounds, including in blank projects. */
export function defaultBackgroundForRoom(data: GBAProjectData, room: Record<string, unknown>): string {
  const settings = data.settings as { sceneTypes?: { defaultBackgrounds?: Record<string, string> } } | undefined;
  return settings?.sceneTypes?.defaultBackgrounds?.[defaultBackgroundKeyForRoom(room)]?.trim() ?? "";
}

/** Keep the new isometric player inside a fixed authored image, independently of grid size. */
export function defaultBackgroundActorPosition(data: GBAProjectData, room: Record<string, unknown>, enemy = false): { x: number; y: number } | undefined {
  if (room.sceneType !== "isometric" || !room.gbStudioUseBackgroundLayout) return undefined;
  const asset = (data.assets as Record<string, unknown>[] | undefined)?.find(item => item.name === room.backgroundAssetName);
  const metadata = asset?.metadata as { visualProfile?: string; width?: number; height?: number } | undefined;
  if (metadata?.visualProfile !== BLANK_BACKGROUND_DEFAULTS_PROFILE) return undefined;
  const runtime = room.runtime as { config?: unknown } | undefined;
  const config = normalizeIsometricSceneConfig(runtime?.config);
  const dx = ((metadata.width ?? 240) / 2 - config.originX) / (config.tileWidth / 2);
  const dy = ((metadata.height ?? 160) / 2 - config.originY) / (config.tileHeight / 2);
  return {
    x: Math.max(0, Math.min(Number(room.width) - 1, Math.floor((dy + dx) / 2) + (enemy ? 1 : 0))),
    y: Math.max(0, Math.min(Number(room.height) - 1, Math.floor((dy - dx) / 2) - (enemy ? 1 : 0)))
  };
}

/** New scenes use the source layout. Existing scenes are never migrated by changing defaults. */
export function applyDefaultRoomBackground(data: GBAProjectData, room: Record<string, unknown>): void {
  const background = defaultBackgroundForRoom(data, room);
  room.backgroundAssetName = background;
  if (!background) {
    room.gbStudioUseBackgroundLayout = false;
    return;
  }
  room.backgroundRenderMode = "tilemap";
  room.gbStudioUseBackgroundLayout = true;
  const width = Number(room.width) || 30;
  const height = Number(room.height) || 20;
  const asset = (data.assets as Record<string, unknown>[] | undefined)?.find(item => item.name === background);
  const metadata = asset?.metadata as { width?: number; height?: number } | undefined;
  const sourceWidth = Math.ceil((metadata?.width ?? 240) / 8);
  const sourceHeight = Math.ceil((metadata?.height ?? 160) / 8);
  room.tilemap = Array.from({ length: width * height }, (_, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    return x < sourceWidth && y < sourceHeight ? y * sourceWidth + x + 1 : 0;
  });
  // Isometric navigation uses its own logical grid; the authored image is loaded separately.
  room.tileLayers = defaultSceneTileLayers({ width, height, sceneType: String(room.sceneType),
    fallbackTilemap: room.sceneType === "isometric" ? Array(width * height).fill(0) : room.tilemap as number[] });
  if (room.sceneType === "isometric") {
    const runtime = room.runtime as { type?: string; config?: Record<string, unknown> };
    room.runtime = { ...runtime, config: { ...runtime?.config, worldMode: "static_composition" } };
  }
  if (room.sceneType === "cutscene") {
    const runtime = room.runtime as { type?: string; config?: Record<string, unknown> };
    room.runtime = { ...runtime, config: { ...runtime?.config, autoAdvance: false } };
  }
}

export function blankBackgroundContent(): {
  assets: Record<string, unknown>[];
  defaultBackgrounds: Record<string, string>;
} {
  return {
    assets: catalog.backgrounds.map(background => ({
      id: `asset-neutral-background-${background.family}`, name: background.file, kind: "Background", systemImage: "photo",
      metadata: {
        source: `Assets/backgrounds/${background.file}`,
        bundledDefaultAsset: `template:blank/Assets/backgrounds/${background.file}`,
        width: background.width, height: background.height, tileWidth: 8, tileHeight: 8,
        visualProfile: BLANK_BACKGROUND_DEFAULTS_PROFILE, colorMode: "4bpp", backgroundPaletteBankBudget: 14,
        backgroundPaletteReferencePlan: background.palettePlan,
        provenance: "Original OpenAI Imagegen artwork visually approved by the user.",
        license: "Project-owned", sourceSha256: background.sourceSha256,
        backgroundTileOptimizer: { enabled: true, tileBudget: 640 }
      }
    })),
    defaultBackgrounds: Object.fromEntries(catalog.backgrounds.map(background => [background.key, background.file]))
  };
}
