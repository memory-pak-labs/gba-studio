import {
  normalizeSceneComposition,
  sceneCompositionFromAffinePresentation,
  type SceneCompositionConfig
} from "./sceneComposition.js";

export const SHMUP_SCENE_VIEWPORT = {
  widthPixels: 240,
  heightPixels: 160
} as const;

export const SHMUP_SCENE_WORLD = {
  widthPixels: 720,
  heightPixels: 160,
  widthTiles: 90,
  heightTiles: 20,
  affineMapWidthTiles: 128,
  affineMapHeightTiles: 128
} as const;

export interface ShmupSceneCompositionContract {
  schema: 1;
  profile: "shmup";
  viewport: typeof SHMUP_SCENE_VIEWPORT;
  world: {
    widthPixels: number;
    heightPixels: number;
    widthTiles: number;
    heightTiles: number;
    affineMapWidthTiles: number;
    affineMapHeightTiles: number;
  };
  video: {
    mode: "mode1";
    affine: {
      enabled: true;
      layer: "BG2";
      assetId: string;
      bpp: 8;
      logicalWidthPixels: 720;
      logicalHeightPixels: 160;
      physicalMapWidthTiles: 128;
      physicalMapHeightTiles: 128;
    } | null;
  };
  planes: {
    hud: { layer: "BG0"; fixed: true };
    actors: { layer: "OBJ"; playerSizePixels: { x: 32; y: 32 } };
    obstacles: {
      visualLayer: "BG1" | null;
      collisionSource: "scene_data";
      collisionEnabled: boolean;
    };
    background: {
      layer: "BG2";
      source: "affine_tiled" | "regular_tiled";
      assetId: string | null;
    };
  };
}

export type ShmupSceneCompositionIssueCode =
  | "INVALID_WORLD_SIZE"
  | "AFFINE_CAPABILITY_REQUIRED"
  | "AFFINE_ASSET_REQUIRED"
  | "AFFINE_LAYER_UNSUPPORTED";

export interface ShmupSceneCompositionIssue {
  code: ShmupSceneCompositionIssueCode;
  field: string;
  message: string;
}

export interface ShmupSceneCompositionResolution {
  config: ShmupSceneCompositionContract;
  composition: SceneCompositionConfig;
  issues: ShmupSceneCompositionIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function affineCapabilityEnabled(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.capabilities)) return false;
  return value.capabilities.some((entry) => (
    isRecord(entry) && entry.id === "affine_background" && entry.enabled === true
  ));
}

function compositionFromSource(source: Record<string, unknown>): SceneCompositionConfig {
  if (Object.hasOwn(source, "composition")) {
    return normalizeSceneComposition(source.composition);
  }
  if (Object.hasOwn(source, "affine")) {
    return sceneCompositionFromAffinePresentation(source.affine);
  }
  return normalizeSceneComposition(source);
}

export function resolveShmupSceneComposition(
  value: unknown,
  roomSize: { widthTiles: number; heightTiles: number } = SHMUP_SCENE_WORLD
): ShmupSceneCompositionResolution {
  const source = isRecord(value) ? value : {};
  const composition = compositionFromSource(source);
  const widthTiles = positiveInteger(roomSize.widthTiles, SHMUP_SCENE_WORLD.widthTiles);
  const heightTiles = positiveInteger(roomSize.heightTiles, SHMUP_SCENE_WORLD.heightTiles);
  const affineLayer = composition.enabled
    ? composition.layers.find((layer) => layer.enabled && layer.kind === "affine_bg")
    : undefined;
  const affineEnabled = Boolean(affineLayer);
  const affineOptedIn = affineEnabled && affineCapabilityEnabled(source);
  const issues: ShmupSceneCompositionIssue[] = [];

  if (affineEnabled && !affineCapabilityEnabled(source)) {
    issues.push({
      code: "AFFINE_CAPABILITY_REQUIRED",
      field: "capabilities",
      message: "Background Affine no SHMUP exige a capability affine_background habilitada explicitamente."
    });
  }
  if (affineEnabled && (widthTiles !== SHMUP_SCENE_WORLD.widthTiles || heightTiles !== SHMUP_SCENE_WORLD.heightTiles)) {
    issues.push({
      code: "INVALID_WORLD_SIZE",
      field: "world",
      message: "O Background Affine do SHMUP exige mundo lógico de 90x20 tiles (720x160 pixels)."
    });
  }
  if (affineLayer && affineLayer.layer !== "BG2") {
    issues.push({
      code: "AFFINE_LAYER_UNSUPPORTED",
      field: "composition.layers",
      message: "O SHMUP usa o BG2 Affine no Mode 1; BG3 Affine não é compatível com HUD BG0 e obstáculos BG1."
    });
  }
  if (affineLayer && !affineLayer.assetId) {
    issues.push({
      code: "AFFINE_ASSET_REQUIRED",
      field: "composition.layers.assetId",
      message: "A camada Affine do SHMUP precisa declarar um asset affine_bg."
    });
  }

  const logicalWorld = affineOptedIn
    ? SHMUP_SCENE_WORLD
    : {
        widthPixels: widthTiles * 8,
        heightPixels: heightTiles * 8,
        widthTiles,
        heightTiles,
        affineMapWidthTiles: SHMUP_SCENE_WORLD.affineMapWidthTiles,
        affineMapHeightTiles: SHMUP_SCENE_WORLD.affineMapHeightTiles
      };
  const regularBackground = composition.layers.find((layer) => (
    layer.enabled && layer.kind === "regular_bg" && layer.layer === "BG2"
  ));

  return {
    composition,
    issues,
    config: {
      schema: 1,
      profile: "shmup",
      viewport: SHMUP_SCENE_VIEWPORT,
      world: logicalWorld,
      video: {
        mode: "mode1",
        affine: affineOptedIn && affineLayer && affineLayer.layer === "BG2" && affineLayer.assetId
          ? {
              enabled: true,
              layer: "BG2",
              assetId: affineLayer.assetId,
              bpp: 8,
              logicalWidthPixels: SHMUP_SCENE_WORLD.widthPixels,
              logicalHeightPixels: SHMUP_SCENE_WORLD.heightPixels,
              physicalMapWidthTiles: SHMUP_SCENE_WORLD.affineMapWidthTiles,
              physicalMapHeightTiles: SHMUP_SCENE_WORLD.affineMapHeightTiles
            }
          : null
      },
      planes: {
        hud: { layer: "BG0", fixed: true },
        actors: { layer: "OBJ", playerSizePixels: { x: 32, y: 32 } },
        obstacles: {
          visualLayer: "BG1",
          collisionSource: "scene_data",
          collisionEnabled: true
        },
        background: {
          layer: "BG2",
          source: affineOptedIn ? "affine_tiled" : "regular_tiled",
          assetId: affineOptedIn
            ? affineLayer?.assetId || null
            : regularBackground?.assetId || null
        }
      }
    }
  };
}
