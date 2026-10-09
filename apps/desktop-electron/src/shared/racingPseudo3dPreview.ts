import type { RacingSceneConfig } from "./sceneTypeProfiles.js";

export const RACING_PSEUDO3D_LOGICAL_VIEWPORT = {
  height: 160,
  width: 240
} as const;

export const RACING_PSEUDO3D_PERSPECTIVE_BAND_COUNT = 14;

export type RacingPseudo3dPreviewLayer =
  | "panorama"
  | "affine-floor"
  | "racing-hud"
  | "racer-player"
  | "racer-rival";

export interface RacingPseudo3dPreviewAssets {
  panoramaURL: string | null;
  floorURL: string | null;
  minimapURL: string | null;
  playerURL: string | null;
  rivalURL: string | null;
}

export interface RacingPseudo3dPerspectiveBand {
  index: number;
  top: number;
  bottom: number;
  scale: number;
  sourceY: number;
  lateralOffset: number;
}

export interface RacingPseudo3dPreviewModel extends RacingPseudo3dPreviewAssets {
  logicalWidth: number;
  logicalHeight: number;
  horizonY: number;
  layers: RacingPseudo3dPreviewLayer[];
  perspectiveBands: RacingPseudo3dPerspectiveBand[];
  minimapVisible: boolean;
  technicalMapAvailable: boolean;
}

function perspectiveBandEdge(index: number, horizonY: number): number {
  const floorHeight = RACING_PSEUDO3D_LOGICAL_VIEWPORT.height - horizonY;
  const progress = index / RACING_PSEUDO3D_PERSPECTIVE_BAND_COUNT;
  return horizonY + Math.round(floorHeight * Math.pow(progress, 1.7));
}

/**
 * Descreve o mesmo enquadramento lógico da corrida GBA no Editor. O piso
 * continua sendo um mapa técnico top-down; as bandas simulam a projeção afim
 * usada pelo runtime, sem converter o asset em uma arte de pista em perspectiva.
 */
export function buildRacingPseudo3dPreviewModel(
  config: RacingSceneConfig,
  assets: RacingPseudo3dPreviewAssets
): RacingPseudo3dPreviewModel {
  const horizonY = config.pseudo3dVisuals?.horizonY ?? 48;
  const perspectiveBands = Array.from({ length: RACING_PSEUDO3D_PERSPECTIVE_BAND_COUNT }, (_, index) => {
    const progress = (index + 1) / RACING_PSEUDO3D_PERSPECTIVE_BAND_COUNT;
    const top = perspectiveBandEdge(index, horizonY);
    const bottom = index === RACING_PSEUDO3D_PERSPECTIVE_BAND_COUNT - 1
      ? RACING_PSEUDO3D_LOGICAL_VIEWPORT.height
      : Math.max(top + 1, perspectiveBandEdge(index + 1, horizonY));
    return {
      index,
      top,
      bottom,
      scale: 1 + (progress * progress * 7.5),
      sourceY: Math.round((1 - progress) * 100),
      lateralOffset: Math.round((config.roadCurve / 64) * progress * progress * 30)
    };
  });

  return {
    ...assets,
    logicalWidth: RACING_PSEUDO3D_LOGICAL_VIEWPORT.width,
    logicalHeight: RACING_PSEUDO3D_LOGICAL_VIEWPORT.height,
    horizonY,
    layers: ["panorama", "affine-floor", "racing-hud", "racer-player", "racer-rival"],
    perspectiveBands,
    minimapVisible: config.showMinimap,
    technicalMapAvailable: Boolean(config.pseudo3dVisuals?.floorTilemapId)
  };
}
