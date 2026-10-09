export type IsometricSceneProfileID = "diamond-2to1";
export type IsometricProjectionID = "diamond";
export type IsometricMovementModel = "free" | "tile";
export type IsometricHeightMode = "levels";
export type IsometricGameplayMode = "adventure" | "tactical";

export interface IsometricSceneProfileOption {
  id: string;
  label: string;
  projection: string;
  movement: string;
  heightMode: string;
  supported: boolean;
  disabledReason?: string;
}

export interface IsometricGameplayModeOption {
  id: IsometricGameplayMode;
  label: string;
  supported: boolean;
  disabledReason?: string;
}

export interface IsometricSceneContract {
  gameplayMode: IsometricGameplayMode;
  profile: IsometricSceneProfileID;
  projection: IsometricProjectionID;
  movement: IsometricMovementModel;
  heightMode: IsometricHeightMode;
}

export const DEFAULT_ISOMETRIC_SCENE_CONTRACT: IsometricSceneContract = {
  gameplayMode: "adventure",
  profile: "diamond-2to1",
  projection: "diamond",
  movement: "free",
  heightMode: "levels"
};

export const ISOMETRIC_GAMEPLAY_MODE_OPTIONS: readonly IsometricGameplayModeOption[] = [
  {
    id: "adventure",
    label: "Aventura — movimento livre",
    supported: true
  },
  {
    id: "tactical",
    label: "Tático — grade, turnos e alcance",
    supported: true
  }
];

/**
 * The runtime deliberately exposes only the contract that is implemented by
 * editor picking, collision, export and the GBA engine. Adventure uses
 * continuous movement over the authored logical grid; tactical mode keeps
 * one-cell turns. Terrain costs, skills and enemy AI remain separate future
 * capabilities.
 */
export const ISOMETRIC_SCENE_PROFILE_OPTIONS: readonly IsometricSceneProfileOption[] = [
  {
    id: "diamond-2to1",
    label: "Diamante 2:1",
    projection: "diamond",
    movement: "free",
    heightMode: "levels",
    supported: true
  },
  {
    id: "staggered-free",
    label: "Escalonada — movimento livre",
    projection: "staggered",
    movement: "free",
    heightMode: "levels",
    supported: false,
    disabledReason: "Disponível quando picking, colisão, exportação e runtime estiverem alinhados."
  },
  {
    id: "diamond-orthogonal-logic",
    label: "Diamante — lógica ortogonal",
    projection: "diamond",
    movement: "orthogonal",
    heightMode: "flat",
    supported: false,
    disabledReason: "Disponível quando a lógica ortogonal tiver contrato próprio de altura e colisão."
  }
];

export function normalizeIsometricSceneContract(value: unknown): IsometricSceneContract {
  const config = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const gameplayMode = config.gameplayMode === "tactical"
    ? "tactical"
    : DEFAULT_ISOMETRIC_SCENE_CONTRACT.gameplayMode;
  return {
    ...DEFAULT_ISOMETRIC_SCENE_CONTRACT,
    // O modo tático é um modo de cena independente das capabilities visuais.
    // A validação detalhada e os limites por ator ficam nos contratos
    // compartilhados do núcleo tático; ausência de capability continua sendo
    // ausência de opt-in.
    gameplayMode,
    // Movement is derived from the gameplay mode so the editor label, export
    // contract and runtime cannot disagree about how the actor is controlled.
    movement: gameplayMode === "tactical" ? "tile" : "free"
  };
}

export function isometricSceneProfileOption(profile: string): IsometricSceneProfileOption {
  return ISOMETRIC_SCENE_PROFILE_OPTIONS.find((option) => option.id === profile)
    ?? ISOMETRIC_SCENE_PROFILE_OPTIONS[0];
}
