import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { decodePngRgba } from "./lib/png-icons.mjs";

const SCRIPT_ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BACKGROUND_ROOT = join(
  SCRIPT_ROOT,
  "..",
  "default-assets",
  "templates",
  "exemplo-gba",
  "Assets",
  "backgrounds"
);

const PASSABLE_COLLISION_TYPES = new Set([
  "free",
  "event",
  "ladder",
  "water",
  "damage",
  "down",
  "slope_up_left",
  "slope_up_right"
]);

const PLAYABLE_GRID_RUNTIME_TYPES = new Set([
  "topdown",
  "worldMap",
  "platformer",
  "isometric",
  "dungeonCrawler",
  "racing"
]);

const NO_COLLISION_RUNTIME_TYPES = new Set([
  "cutscene",
  "menu",
  "pointAndClick",
  "visualNovel",
  "shmup",
  "battleRpg",
  "luta"
]);

// O píer inferior é a única faixa visualmente azul que continua caminhável:
// a água ao redor dele precisa permanecer sólida, mas a ponte é a saída do Porto.
const PORT_LUMEN_DOCK_CELLS = new Set(
  Array.from({ length: 7 }, (_row, row) => (
    Array.from({ length: 3 }, (_column, column) => `${22 + column},${31 + row}`)
  )).flat()
);

const RACING_VISUAL_EXPECTATIONS = Object.freeze({
  solid: [
    [25, 9],
    [30, 12],
    [25, 20],
    [30, 20],
    [17, 20]
  ],
  free: [
    [30, 6],
    [32, 30],
    [35, 30],
    [30, 31],
    [34, 31]
  ]
});

function projectArray(project, key) {
  return Array.isArray(project?.[key]) ? project[key] : [];
}

function sceneRuntimeType(scene) {
  return typeof scene?.runtime?.type === "string" ? scene.runtime.type : scene?.sceneType;
}

function expandCollisionSequence(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];

  if (value.encoding === "rle-v1" && Number.isInteger(value.length) && Array.isArray(value.runs)) {
    const expanded = [];
    for (const run of value.runs) {
      if (!Array.isArray(run) || run.length !== 2 || !Number.isInteger(run[1]) || run[1] <= 0) return [];
      for (let index = 0; index < run[1]; index += 1) expanded.push(run[0]);
    }
    return expanded.length === value.length ? expanded : [];
  }

  if (
    value.encoding !== "metatile-v1"
    || !Number.isInteger(value.width)
    || !Number.isInteger(value.height)
    || !Number.isInteger(value.blockWidth)
    || !Number.isInteger(value.blockHeight)
    || value.width <= 0
    || value.height <= 0
    || value.blockWidth <= 0
    || value.blockHeight <= 0
    || value.width % value.blockWidth !== 0
    || value.height % value.blockHeight !== 0
    || !Array.isArray(value.dictionary)
    || !Array.isArray(value.indices)
  ) return [];

  const blockLength = value.blockWidth * value.blockHeight;
  if (value.dictionary.some((block) => !Array.isArray(block) || block.length !== blockLength)) return [];
  const expectedIndices = (value.width / value.blockWidth) * (value.height / value.blockHeight);
  if (
    value.indices.length !== expectedIndices
    || value.indices.some((index) => !Number.isInteger(index) || index < 0 || index >= value.dictionary.length)
  ) return [];

  const expanded = Array.from({ length: value.width * value.height }, () => null);
  let mapIndex = 0;
  for (let blockY = 0; blockY < value.height; blockY += value.blockHeight) {
    for (let blockX = 0; blockX < value.width; blockX += value.blockWidth) {
      const block = value.dictionary[value.indices[mapIndex]];
      mapIndex += 1;
      for (let localY = 0; localY < value.blockHeight; localY += 1) {
        for (let localX = 0; localX < value.blockWidth; localX += 1) {
          expanded[((blockY + localY) * value.width) + blockX + localX] = (
            block[(localY * value.blockWidth) + localX]
          );
        }
      }
    }
  }
  return expanded;
}

function sceneCollisionTypes(scene) {
  return expandCollisionSequence(scene?.collisionTypes);
}

function sceneCollisionCells(scene) {
  const width = Number(scene?.width);
  const height = Number(scene?.height);
  const collisionTypes = sceneCollisionTypes(scene);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return [];
  return Array.from({ length: width * height }, (_value, index) => collisionTypes[index] ?? "free");
}

function cellType(scene, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= scene.width || y >= scene.height) {
    return null;
  }
  return sceneCollisionTypes(scene)[y * scene.width + x] ?? "free";
}

function isPassable(scene, x, y) {
  return PASSABLE_COLLISION_TYPES.has(cellType(scene, x, y));
}

function rectangleCells(rectangle) {
  const cells = [];
  for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) {
    for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) cells.push([x, y]);
  }
  return cells;
}

function assetDimensions(project, assetName) {
  const asset = projectArray(project, "assets").find((candidate) => candidate?.name === assetName);
  const metadata = asset?.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
  return {
    height: Number(metadata.height),
    width: Number(metadata.width)
  };
}

function backgroundDimensions(project, scene) {
  return assetDimensions(project, scene?.backgroundAssetName);
}

function backgroundPath(scene, backgroundsRoot) {
  if (typeof scene?.backgroundAssetName !== "string" || scene.backgroundAssetName.length === 0) return null;
  const path = join(backgroundsRoot, scene.backgroundAssetName);
  return existsSync(path) ? path : null;
}

function loadBackground(scene, backgroundsRoot) {
  const path = backgroundPath(scene, backgroundsRoot);
  if (!path) return null;
  try {
    return decodePngRgba(readFileSync(path));
  } catch {
    return null;
  }
}

function tileFraction(image, x, y, predicate) {
  const tileWidth = image.width / 60;
  const tileHeight = image.height / 40;
  const startX = Math.floor(x * tileWidth);
  const startY = Math.floor(y * tileHeight);
  const endX = Math.min(image.width, Math.floor((x + 1) * tileWidth));
  const endY = Math.min(image.height, Math.floor((y + 1) * tileHeight));
  let matching = 0;
  let total = 0;
  for (let pixelY = startY; pixelY < endY; pixelY += 1) {
    for (let pixelX = startX; pixelX < endX; pixelX += 1) {
      const offset = ((pixelY * image.width) + pixelX) * 4;
      if (predicate(image.pixels[offset], image.pixels[offset + 1], image.pixels[offset + 2])) matching += 1;
      total += 1;
    }
  }
  return total > 0 ? matching / total : 0;
}

function auditVisualAlignment(project, backgroundsRoot) {
  const issues = [];
  let auditedBackgrounds = 0;
  const port = projectArray(project, "scenas").find((scene) => scene?.name === "porto_lumen");
  const portImage = loadBackground(port, backgroundsRoot);
  if (port && portImage) {
    auditedBackgrounds += 1;
    for (let y = 0; y < port.height; y += 1) {
      for (let x = 0; x < port.width; x += 1) {
        const waterFraction = tileFraction(
          portImage,
          x,
          y,
          (red, green, blue) => red < 40 && green >= 80 && green <= 150 && blue >= 120
        );
        if (waterFraction >= 0.5 && !PORT_LUMEN_DOCK_CELLS.has(`${x},${y}`) && isPassable(port, x, y)) {
          issues.push(`porto_lumen: célula de água visual ${x},${y} está caminhável.`);
        }
      }
    }
  }

  const racing = projectArray(project, "scenas").find((scene) => scene?.name === "circuito_final");
  const racingImage = loadBackground(racing, backgroundsRoot);
  if (racing && racingImage) {
    auditedBackgrounds += 1;
    for (const [x, y] of RACING_VISUAL_EXPECTATIONS.solid) {
      if (isPassable(racing, x, y)) issues.push(`circuito_final: gramado visual ${x},${y} está caminhável.`);
    }
    for (const [x, y] of RACING_VISUAL_EXPECTATIONS.free) {
      if (!isPassable(racing, x, y)) issues.push(`circuito_final: pista visual ${x},${y} está bloqueada.`);
    }
  }

  return {
    audited: auditedBackgrounds === 2,
    backgrounds: auditedBackgrounds,
    ok: auditedBackgrounds === 2 && issues.length === 0,
    issues
  };
}

export function auditExemploSceneGeometry(project, options = {}) {
  const issues = [];
  const scenes = projectArray(project, "scenas");
  const actors = projectArray(project, "actors");
  const triggers = projectArray(project, "triggers");
  const assets = new Set(projectArray(project, "assets").map((asset) => asset?.name));

  for (const scene of scenes) {
    const name = scene?.name ?? "sem-nome";
    const runtime = sceneRuntimeType(scene);
    const width = Number(scene?.width);
    const height = Number(scene?.height);
    const collisionTypes = sceneCollisionTypes(scene);
    const collisions = expandCollisionSequence(scene?.collisions);
    const expectedCellCount = width * height;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      issues.push(`Cena ${name}: dimensões inválidas para auditoria geométrica.`);
      continue;
    }
    if (collisionTypes.length !== expectedCellCount) {
      issues.push(`Cena ${name}: collisionTypes não cobre ${expectedCellCount} células.`);
    }
    if (collisions.length > 0 && collisions.length !== expectedCellCount) {
      issues.push(`Cena ${name}: collisions não cobre ${expectedCellCount} células.`);
    }
    if (collisions.length === expectedCellCount && collisionTypes.length === expectedCellCount && collisionTypes.some((value, index) => value !== collisions[index])) {
      issues.push(`Cena ${name}: collisions e collisionTypes estão dessincronizados.`);
    }

    const sceneActors = actors.filter((actor) => actor?.roomName === name);
    const sceneTriggers = triggers.filter((trigger) => trigger?.roomName === name);
    for (const actor of sceneActors) {
      const coordinatesAreValid = runtime === "worldMap"
        ? Number.isFinite(actor?.x) && Number.isFinite(actor?.y)
        : Number.isInteger(actor?.x) && Number.isInteger(actor?.y);
      if (!coordinatesAreValid || actor.x < 0 || actor.y < 0 || actor.x >= width || actor.y >= height) {
        issues.push(`Cena ${name}: ator ${actor?.name ?? actor?.id ?? "sem-nome"} está fora dos limites.`);
      }
      if (actor?.spriteSheet && !assets.has(actor.spriteSheet)) {
        issues.push(`Cena ${name}: ator ${actor?.name ?? actor?.id ?? "sem-nome"} referencia sprite ausente.`);
      }
    }
    for (const trigger of sceneTriggers) {
      const rectangle = {
        height: Number(trigger?.height),
        width: Number(trigger?.width),
        x: Number(trigger?.x),
        y: Number(trigger?.y)
      };
      if (
        !Number.isInteger(rectangle.x) || !Number.isInteger(rectangle.y)
        || !Number.isInteger(rectangle.width) || !Number.isInteger(rectangle.height)
        || rectangle.width <= 0 || rectangle.height <= 0
        || rectangle.x < 0 || rectangle.y < 0
        || rectangle.x + rectangle.width > width || rectangle.y + rectangle.height > height
      ) {
        issues.push(`Cena ${name}: gatilho ${trigger?.id ?? trigger?.name ?? "sem-nome"} está fora dos limites.`);
      }
    }

    if (NO_COLLISION_RUNTIME_TYPES.has(runtime)) {
      if (sceneCollisionCells(scene).some((value) => value !== "free")) {
        issues.push(`Cena ${name}: runtime ${runtime} não usa colisão, mas ainda pinta células bloqueadas.`);
      }
      continue;
    }

    if (PLAYABLE_GRID_RUNTIME_TYPES.has(runtime)) {
      if (scene.playerActorName) {
        const player = sceneActors.find((actor) => actor?.name === scene.playerActorName);
        if (!player) {
          issues.push(`Cena ${name}: playerActorName ${scene.playerActorName} não resolve um ator.`);
        } else if (!isPassable(scene, player.x, player.y)) {
          issues.push(`Cena ${name}: ator jogador ${player.name} começa em célula bloqueada.`);
        }
      }
      for (const actor of sceneActors) {
        if (Number.isInteger(actor?.x) && Number.isInteger(actor?.y) && !isPassable(scene, actor.x, actor.y)) {
          issues.push(`Cena ${name}: ator ${actor?.name ?? actor?.id ?? "sem-nome"} começa em célula bloqueada.`);
        }
      }
      if (runtime !== "worldMap") {
        for (const trigger of sceneTriggers) {
          const rectangle = {
            height: Number(trigger?.height),
            width: Number(trigger?.width),
            x: Number(trigger?.x),
            y: Number(trigger?.y)
          };
          if (rectangleCells(rectangle).some(([x, y]) => !isPassable(scene, x, y))) {
            issues.push(`Cena ${name}: área do gatilho ${trigger?.id ?? trigger?.name ?? "sem-nome"} atravessa célula bloqueada.`);
          }
        }
      }
    }

    if (scene.gbStudioUseBackgroundLayout === true) {
      const dimensions = backgroundDimensions(project, scene);
      const pagedSurface = runtime === "isometric" && scene?.runtime?.config?.pagedSurface;
      const staticComposition = runtime === "isometric"
        && scene?.runtime?.config?.worldMode === "static_composition";
      const cameraBounds = staticComposition && scene?.cameraBounds && typeof scene.cameraBounds === "object"
        ? scene.cameraBounds
        : null;
      const expectedWidth = staticComposition && Number.isFinite(Number(cameraBounds?.width))
        ? Number(cameraBounds.width)
        : width * 8;
      const expectedHeight = staticComposition && Number.isFinite(Number(cameraBounds?.height))
        ? Number(cameraBounds.height)
        : height * 8;
      if (pagedSurface) {
        const pagedWidth = Number(pagedSurface.width);
        const pagedHeight = Number(pagedSurface.height);
        if (!Number.isInteger(pagedWidth) || !Number.isInteger(pagedHeight) || pagedWidth < 240 || pagedHeight < 160) {
          issues.push(`Cena ${name}: superfície paginada tem dimensões inválidas.`);
        } else {
          if (scene.backgroundAssetName !== pagedSurface.backgroundAsset
            || dimensions.width !== pagedWidth || dimensions.height !== pagedHeight) {
            issues.push(`Cena ${name}: background ${dimensions.width}x${dimensions.height} não cobre a superfície paginada ${pagedWidth}x${pagedHeight}.`);
          }
          const foreground = assetDimensions(project, pagedSurface.foregroundAsset);
          if (foreground.width !== pagedWidth || foreground.height !== pagedHeight) {
            issues.push(`Cena ${name}: foreground ${foreground.width}x${foreground.height} não cobre a superfície paginada ${pagedWidth}x${pagedHeight}.`);
          }
        }
      } else {
        const coversExpectedViewport = staticComposition
          ? dimensions.width >= expectedWidth && dimensions.height >= expectedHeight
          : dimensions.width === expectedWidth && dimensions.height === expectedHeight;
        if (Number.isFinite(dimensions.width) && Number.isFinite(dimensions.height) && !coversExpectedViewport) {
          issues.push(`Cena ${name}: background ${dimensions.width}x${dimensions.height} não cobre a área esperada ${expectedWidth}x${expectedHeight}.`);
        }
      }
    }
  }

  const visualAlignment = auditVisualAlignment(
    project,
    options.backgroundsRoot ?? DEFAULT_BACKGROUND_ROOT
  );
  issues.push(...visualAlignment.issues);
  return {
    ok: issues.length === 0,
    issues,
    sceneCount: scenes.length,
    visualAlignment
  };
}
