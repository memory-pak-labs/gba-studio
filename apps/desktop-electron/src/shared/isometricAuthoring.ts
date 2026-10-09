import {
  DEFAULT_ISOMETRIC_SCENE_CONFIG,
  type IsometricWorldMode,
  type IsometricSceneGeometryConfig
} from "./sceneTypeProfiles.js";

export interface IsometricAtlasGridInput {
  atlasTileHeight?: number;
  atlasTileWidth?: number;
  bitsPerPixel?: number;
  imageHeight: number;
  imageWidth: number;
  paletteColorCount?: number;
  tileHeight: number;
  tileWidth: number;
  transparentIndex?: number;
}

export interface IsometricAtlasGrid {
  columns: number;
  rows: number;
  tileCount: number;
}

export interface IsometricWorldSizeInput {
  atlasTileHeight?: number;
  config?: IsometricSceneGeometryConfig;
  height: number;
  width: number;
}

export interface IsometricWorldSize {
  height: number;
  width: number;
}

export interface IsometricAuthoringTileLayer {
  mapping: string;
  tilemap: readonly unknown[];
}

export interface IsometricAuthoringTrigger {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface IsometricAuthoringActor {
  id?: string;
  x: number;
  y: number;
  z?: number;
}

export interface IsometricAuthoringValidationInput {
  atlas?: IsometricAtlasGridInput;
  actors?: readonly IsometricAuthoringActor[];
  collisionTypes?: readonly unknown[];
  hasAuthoredBackground?: boolean;
  hasPagedSurface?: boolean;
  heightLevels?: readonly unknown[];
  tileLayers?: readonly IsometricAuthoringTileLayer[];
  tilemap?: readonly unknown[];
  triggers?: readonly IsometricAuthoringTrigger[];
  worldMode?: IsometricWorldMode;
  width: number;
  height: number;
}

export interface IsometricAuthoringIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
  cellIndex?: number;
}

function positiveInteger(value: number, fallback = 1): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function cellIndex(width: number, x: number, y: number): number {
  return y * width + x;
}

function inBounds(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}

export function deriveIsometricAtlasGrid(input: IsometricAtlasGridInput): IsometricAtlasGrid {
  const tileWidth = positiveInteger(input.tileWidth);
  const tileHeight = positiveInteger(input.tileHeight);
  const atlasTileWidth = positiveInteger(input.atlasTileWidth ?? tileWidth, tileWidth);
  const atlasTileHeight = positiveInteger(input.atlasTileHeight ?? tileHeight, tileHeight);
  const columns = Math.max(0, Math.floor(input.imageWidth / atlasTileWidth));
  const rows = Math.max(0, Math.floor(input.imageHeight / atlasTileHeight));
  return { columns, rows, tileCount: columns * rows };
}

export function deriveIsometricWorldSize({
  atlasTileHeight,
  config = DEFAULT_ISOMETRIC_SCENE_CONFIG,
  height,
  width
}: IsometricWorldSizeInput): IsometricWorldSize {
  const span = positiveInteger(width) + positiveInteger(height);
  const visualTileHeight = positiveInteger(atlasTileHeight ?? config.tileHeight, config.tileHeight);
  return {
    height: span * (config.tileHeight / 2) + Math.max(0, visualTileHeight - config.tileHeight),
    width: span * (config.tileWidth / 2)
  };
}

function hasOneLevelRampTransition(
  collisionTypes: readonly unknown[],
  heightLevels: readonly unknown[],
  width: number,
  height: number,
  x: number,
  y: number
): boolean {
  const currentLevel = Number(heightLevels[cellIndex(width, x, y)]);
  if (!Number.isFinite(currentLevel)) return false;
  const neighbours = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
  return neighbours.some(([nextX, nextY]) => {
    if (!inBounds(width, height, nextX, nextY)) return false;
    const nextIndex = cellIndex(width, nextX, nextY);
    const nextCollision = collisionTypes[nextIndex];
    const nextLevel = Number(heightLevels[nextIndex]);
    return nextCollision !== "solid" && Number.isFinite(nextLevel) && Math.abs(nextLevel - currentLevel) === 1;
  });
}

export function validateIsometricRoomAuthoring(
  input: IsometricAuthoringValidationInput
): IsometricAuthoringIssue[] {
  const width = positiveInteger(input.width);
  const height = positiveInteger(input.height);
  const count = width * height;
  const issues: IsometricAuthoringIssue[] = [];

  const worldMode = input.worldMode ?? "scrollable_tiled_world";
  const validatesVisualTilemap = worldMode !== "static_composition" && !input.hasPagedSurface;
  if (worldMode !== "scrollable_tiled_world" && worldMode !== "static_composition") {
    issues.push({
      code: "world_mode_unsupported",
      message: "A cena isométrica precisa declarar scrollable_tiled_world ou static_composition.",
      severity: "error"
    });
  }
  if (worldMode === "static_composition" && input.hasAuthoredBackground !== true) {
    issues.push({
      code: "static_background_missing",
      message: "Uma composição isométrica estática precisa apontar para um background autoral convertido.",
      severity: "error"
    });
  }

  let atlasTileCount: number | null = null;
  if (input.atlas && !input.hasPagedSurface) {
    const atlas = input.atlas;
    const atlasTileWidth = positiveInteger(atlas.atlasTileWidth ?? atlas.tileWidth, atlas.tileWidth);
    const atlasTileHeight = positiveInteger(atlas.atlasTileHeight ?? atlas.tileHeight, atlas.tileHeight);
    if (
      positiveInteger(atlas.tileWidth) <= 0
      || positiveInteger(atlas.tileHeight) <= 0
      || atlas.imageWidth % atlasTileWidth !== 0
      || atlas.imageHeight % atlasTileHeight !== 0
    ) {
      issues.push({
        code: "atlas_not_aligned",
        message: "O atlas isométrico precisa ser divisível exatamente em células lógicas.",
        severity: "error"
      });
    } else {
      atlasTileCount = deriveIsometricAtlasGrid(atlas).tileCount;
    }
    if (atlas.bitsPerPixel !== undefined && atlas.bitsPerPixel !== 4) {
      issues.push({
        code: "atlas_bpp_unsupported",
        message: "O atlas isométrico de background precisa ser preparado em 4bpp para o caminho GBA regular.",
        severity: "error"
      });
    }
    if (atlas.paletteColorCount !== undefined && atlas.paletteColorCount > 16) {
      issues.push({
        code: "atlas_palette_overflow",
        message: "Cada paleta 4bpp do atlas isométrico pode conter no máximo 16 cores.",
        severity: "error"
      });
    }
    if (atlas.transparentIndex !== undefined && atlas.transparentIndex !== 0) {
      issues.push({
        code: "atlas_transparency_index",
        message: "O índice 0 deve permanecer reservado para transparência nos losangos isométricos.",
        severity: "error"
      });
    }
  }

  const bg2 = input.tileLayers?.find((layer) => layer.mapping.toUpperCase() === "BG2");
  const visualTiles = bg2 && bg2.tilemap.length === count ? bg2.tilemap : input.tilemap;
  if (!Array.isArray(visualTiles) || visualTiles.length !== count) {
    issues.push({
      code: "visual_tilemap_size",
      message: `O mapa visual precisa conter exatamente ${count} células.`,
      severity: "error"
    });
  }

  if (!bg2 && !input.hasPagedSurface) {
    issues.push({
      code: "bg2_layer_missing",
      message: "A camada BG2 — Mapa principal ainda não está explícita; o editor usará o tilemap legado.",
      severity: "warning"
    });
  } else if (bg2 && bg2.tilemap.length !== count) {
    issues.push({
      code: "bg2_layer_size",
      message: `A camada BG2 precisa conter exatamente ${count} células.`,
      severity: "error"
    });
  }

  if (!Array.isArray(input.collisionTypes) || input.collisionTypes.length !== count) {
    issues.push({
      code: "collision_layer_size",
      message: `A camada de colisão precisa conter exatamente ${count} células.`,
      severity: "error"
    });
  }

  if (!Array.isArray(input.heightLevels) || input.heightLevels.length !== count) {
    issues.push({
      code: "height_layer_size",
      message: `A camada de altura precisa conter exatamente ${count} células.`,
      severity: "error"
    });
  }

  const heights = input.heightLevels ?? [];
  heights.forEach((level, index) => {
    if (!Number.isInteger(level) || Number(level) < 0 || Number(level) > 3) {
      issues.push({
        cellIndex: index,
        code: "height_level_out_of_range",
        message: "Cada célula isométrica deve usar um nível de altura entre 0 e 3.",
        severity: "error"
      });
    }
  });

  const collisionTypes = input.collisionTypes ?? [];
  const effectiveVisualTiles = visualTiles ?? [];
  // A static composition uses its authored background as the visual source;
  // its logical cells still drive authoring, collision and height data but do
  // not represent indexes into that background image's one-cell metadata.
  if (validatesVisualTilemap && Array.isArray(effectiveVisualTiles) && effectiveVisualTiles.length === count && atlasTileCount !== null) {
    effectiveVisualTiles.forEach((tile, index) => {
      if (!Number.isInteger(tile) || Number(tile) < 0 || Number(tile) >= atlasTileCount) {
        issues.push({
          cellIndex: index,
          code: "visual_tile_id_out_of_range",
          message: `O tile visual da célula precisa estar entre 0 e ${atlasTileCount - 1}.`,
          severity: "error"
        });
      }
    });
  }
  if (validatesVisualTilemap && Array.isArray(effectiveVisualTiles) && effectiveVisualTiles.length === count && collisionTypes.length === count) {
    effectiveVisualTiles.forEach((tile, index) => {
      if (collisionTypes[index] !== "solid" && Number(tile) === 0) {
        issues.push({
          cellIndex: index,
          code: "walkable_visual_missing",
          message: "Uma célula caminhável não deveria ficar sem meta-tile visual.",
          severity: "warning"
        });
      }
    });
  }
  collisionTypes.forEach((collisionType, index) => {
    if (collisionType !== "slope_up_right" && collisionType !== "slope_up_left") return;
    const x = index % width;
    const y = Math.floor(index / width);
    if (!hasOneLevelRampTransition(collisionTypes, heights, width, height, x, y)) {
      issues.push({
        cellIndex: index,
        code: "ramp_height_transition",
        message: "Cada rampa precisa conectar esta célula a uma célula vizinha com um nível de altura adjacente.",
        severity: "error"
      });
    }
  });

  const heightsAreValid = heights.length === count;
  if (heightsAreValid && collisionTypes.length === count) {
    for (const actor of input.actors ?? []) {
      const actorID = actor.id ? ` (${actor.id})` : "";
      if (!Number.isInteger(actor.x) || !Number.isInteger(actor.y) || !inBounds(width, height, actor.x, actor.y)) {
        issues.push({
          code: "actor_out_of_bounds",
          message: `O ator${actorID} precisa permanecer dentro do mapa isométrico.`,
          severity: "error"
        });
        continue;
      }
      const index = cellIndex(width, actor.x, actor.y);
      if (collisionTypes[index] === "solid") {
        issues.push({
          cellIndex: index,
          code: "actor_on_solid",
          message: `O ator${actorID} está sobre uma célula sólida.`,
          severity: "error"
        });
      }
      if (actor.z !== undefined) {
        if (!Number.isInteger(actor.z) || actor.z < 0 || actor.z > 3) {
          issues.push({
            cellIndex: index,
            code: "actor_height_out_of_range",
            message: `A altura do ator${actorID} precisa estar entre 0 e 3.`,
            severity: "error"
          });
        } else if (actor.z !== Number(heights[index])) {
          issues.push({
            cellIndex: index,
            code: "actor_height_mismatch",
            message: `A altura do ator${actorID} precisa coincidir com a célula de apoio.`,
            severity: "error"
          });
        }
      }
    }
  }

  for (const trigger of input.triggers ?? []) {
    if (
      !Number.isInteger(trigger.x)
      || !Number.isInteger(trigger.y)
      || !Number.isInteger(trigger.width)
      || !Number.isInteger(trigger.height)
      || trigger.width < 1
      || trigger.height < 1
      || trigger.x < 0
      || trigger.y < 0
      || trigger.x + trigger.width > width
      || trigger.y + trigger.height > height
    ) {
      issues.push({
        code: "trigger_out_of_bounds",
        message: "A área de um gatilho precisa permanecer dentro do mapa isométrico.",
        severity: "error"
      });
    }
  }

  return issues;
}
