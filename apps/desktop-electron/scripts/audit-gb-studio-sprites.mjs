#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function usage() {
  return [
    "Uso: node scripts/audit-gb-studio-sprites.mjs <projeto.gbsproj|pasta> [opcoes]",
    "",
    "Opcoes:",
    "  --format json|markdown  Formato da saida (padrao: json)",
    "  --out <arquivo>         Grava a saida em arquivo em vez de stdout"
  ].join("\n");
}

function parseArgs(argv) {
  const args = [...argv];
  const source = args.shift();
  if (!source || source === "--help" || source === "-h") {
    return { help: true };
  }
  let format = "json";
  let out = "";
  while (args.length > 0) {
    const option = args.shift();
    if (option === "--format") {
      format = args.shift() ?? "";
    } else if (option === "--out") {
      out = args.shift() ?? "";
    } else {
      throw new Error(`Opcao desconhecida: ${option}`);
    }
  }
  if (format !== "json" && format !== "markdown") {
    throw new Error(`Formato invalido: ${format}`);
  }
  return { help: false, source: path.resolve(source), format, out: out ? path.resolve(out) : "" };
}

async function descendantFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name);
    return entry.isDirectory() ? descendantFiles(entryPath) : [entryPath];
  }));
  return nested.flat();
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function number(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function pngDimensions(filePath) {
  try {
    const bytes = await readFile(filePath);
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 24 || pngSignature.some((value, index) => bytes[index] !== value)) return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  } catch {
    return null;
  }
}

function collectReferences(value, targetKey, jsonPath = "$", results = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectReferences(item, targetKey, `${jsonPath}[${index}]`, results));
    return results;
  }
  if (!value || typeof value !== "object") return results;
  Object.entries(value).forEach(([key, nested]) => {
    const nestedPath = `${jsonPath}.${key}`;
    if (key === targetKey && typeof nested === "string" && nested) {
      results.push({ id: nested, jsonPath: nestedPath });
    }
    collectReferences(nested, targetKey, nestedPath, results);
  });
  return results;
}

function spriteStates(resource) {
  return asArray(resource.states).map((stateValue, stateIndex) => {
    const state = asRecord(stateValue);
    return {
      index: stateIndex,
      name: text(state.name) || "Default",
      animationType: text(state.animationType),
      flipLeft: Boolean(state.flipLeft),
      animations: asArray(state.animations).map((animationValue, animationIndex) => {
        const animation = asRecord(animationValue);
        const frames = asArray(animation.frames).map((frameValue, frameIndex) => {
          const frame = asRecord(frameValue);
          const tiles = asArray(frame.tiles).map((tileValue) => {
            const tile = asRecord(tileValue);
            return {
              x: number(tile.x),
              y: number(tile.y),
              sliceX: number(tile.sliceX),
              sliceY: number(tile.sliceY),
              flipX: Boolean(tile.flipX),
              flipY: Boolean(tile.flipY),
              palette: number(tile.palette)
            };
          });
          return { index: frameIndex, tileCount: tiles.length, tiles };
        });
        return { index: animationIndex, frameCount: frames.length, frames };
      })
    };
  });
}

function requiredSlices(states) {
  const slices = new Map();
  states.forEach((state) => state.animations.forEach((animation) => animation.frames.forEach((frame) => {
    frame.tiles.forEach((tile) => {
      const key = `${tile.sliceY}:${tile.sliceX}`;
      slices.set(key, { x: tile.sliceX, y: tile.sliceY });
    });
  })));
  return [...slices.values()].sort((left, right) => left.y - right.y || left.x - right.x);
}

function markdownReport(inventory) {
  const lines = [
    `# Inventario de sprites: ${inventory.projectName}`,
    "",
    `- Sprites: ${inventory.summary.spriteCount}`,
    `- Usados: ${inventory.summary.usedSpriteCount}`,
    `- Nao usados: ${inventory.summary.unusedSpriteCount}`,
    `- Referencias: ${inventory.summary.usageCount}`,
    "",
    "| Prioridade | Sprite | Uso | Folha | Canvas | Estados | Recortes |",
    "| ---: | --- | ---: | --- | --- | ---: | ---: |"
  ];
  inventory.sprites.forEach((sprite, index) => {
    lines.push(`| ${index + 1} | ${sprite.filename} | ${sprite.usageCount} | ${sprite.sheet.width}x${sprite.sheet.height} | ${sprite.canvas.width}x${sprite.canvas.height} | ${sprite.states.length} | ${sprite.requiredSlices.length} |`);
  });
  lines.push("", "## Contratos de substituicao", "");
  inventory.sprites.forEach((sprite) => {
    lines.push(
      `### ${sprite.filename}`,
      "",
      `Preservar folha ${sprite.sheet.width}x${sprite.sheet.height}, canvas ${sprite.canvas.width}x${sprite.canvas.height}, nome do arquivo e layout dos ${sprite.requiredSlices.length} recortes usados.`,
      `Referencias: ${sprite.usageCount || "nenhuma"}.`,
      ""
    );
  });
  return `${lines.join("\n")}\n`;
}

export async function buildSpriteInventory(source) {
  const sourceStatPath = path.extname(source).toLowerCase() === ".gbsproj" ? source : "";
  const root = sourceStatPath ? path.dirname(sourceStatPath) : source;
  const projectPath = sourceStatPath || (await descendantFiles(root)).find((filePath) => filePath.toLowerCase().endsWith(".gbsproj"));
  if (!projectPath) throw new Error(`Projeto .gbsproj nao encontrado em: ${root}`);

  const resourcePaths = (await descendantFiles(root))
    .filter((filePath) => filePath.toLowerCase().endsWith(".gbsres"))
    .sort();
  const resources = [];
  const warnings = [];
  for (const filePath of resourcePaths) {
    try {
      const value = JSON.parse(await readFile(filePath, "utf8"));
      resources.push({ filePath, relativePath: toPosix(path.relative(root, filePath)), value: asRecord(value) });
    } catch (error) {
      warnings.push(`Recurso invalido: ${toPosix(path.relative(root, filePath))} (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  const usagesBySprite = new Map();
  const addUsage = (spriteID, usage) => {
    if (!spriteID) return;
    const usages = usagesBySprite.get(spriteID) ?? [];
    usages.push(usage);
    usagesBySprite.set(spriteID, usages);
  };

  resources.forEach((resource) => {
    const resourceType = text(resource.value._resourceType);
    if (resourceType === "sprite") return;
    if (resourceType === "settings") {
      const defaults = asRecord(resource.value.defaultPlayerSprites);
      Object.entries(defaults).sort(([left], [right]) => left.localeCompare(right)).forEach(([runtime, spriteID]) => {
        if (typeof spriteID === "string") {
          addUsage(spriteID, {
            kind: "default-player",
            runtime,
            resourceType,
            resourceName: text(resource.value.name),
            resourcePath: resource.relativePath,
            jsonPath: `$.defaultPlayerSprites.${runtime}`
          });
        }
      });
    }
    collectReferences(resource.value, "spriteSheetId").forEach((reference) => {
      addUsage(reference.id, {
        kind: "resource-reference",
        resourceType,
        resourceName: text(resource.value.name),
        resourcePath: resource.relativePath,
        jsonPath: reference.jsonPath
      });
    });
  });

  const sprites = [];
  for (const resource of resources.filter((item) => text(item.value._resourceType) === "sprite")) {
    const filename = text(resource.value.filename);
    const descriptorSource = resource.filePath.endsWith(".gbsres") ? resource.filePath.slice(0, -".gbsres".length) : "";
    const pngPath = descriptorSource && path.basename(descriptorSource) === path.basename(filename)
      ? descriptorSource
      : path.join(path.dirname(resource.filePath), path.basename(filename));
    const dimensions = await pngDimensions(pngPath);
    if (!dimensions) warnings.push(`PNG ausente ou invalido: ${toPosix(path.relative(root, pngPath))}`);
    const states = spriteStates(resource.value);
    const slices = requiredSlices(states);
    const id = text(resource.value.id);
    const usages = (usagesBySprite.get(id) ?? []).sort((left, right) =>
      left.resourcePath.localeCompare(right.resourcePath) || left.jsonPath.localeCompare(right.jsonPath)
    );
    const sheet = dimensions ?? { width: number(resource.value.width), height: number(resource.value.height) };
    const canvas = { width: number(resource.value.canvasWidth), height: number(resource.value.canvasHeight) };
    sprites.push({
      id,
      name: text(resource.value.name) || filename,
      filename,
      sourcePath: toPosix(path.relative(root, pngPath)),
      descriptorPath: resource.relativePath,
      used: usages.length > 0,
      usageCount: usages.length,
      usages,
      sheet,
      canvas,
      bounds: {
        x: number(resource.value.boundsX),
        y: number(resource.value.boundsY),
        width: number(resource.value.boundsWidth),
        height: number(resource.value.boundsHeight)
      },
      numTiles: number(resource.value.numTiles),
      animationSpeed: number(resource.value.animSpeed),
      states,
      requiredSlices: slices,
      replacementContract: {
        filename,
        sheetWidth: sheet.width,
        sheetHeight: sheet.height,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        preserveTileLayout: true,
        requiredSlices: slices
      }
    });
  }

  sprites.sort((left, right) =>
    Number(right.used) - Number(left.used) ||
    right.usageCount - left.usageCount ||
    left.filename.localeCompare(right.filename)
  );
  const usedSpriteCount = sprites.filter((sprite) => sprite.used).length;
  return {
    schemaVersion: 1,
    projectName: path.basename(projectPath, path.extname(projectPath)),
    projectPath: toPosix(path.relative(root, projectPath)),
    summary: {
      spriteCount: sprites.length,
      usedSpriteCount,
      unusedSpriteCount: sprites.length - usedSpriteCount,
      usageCount: sprites.reduce((sum, sprite) => sum + sprite.usageCount, 0)
    },
    warnings,
    sprites
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const inventory = await buildSpriteInventory(options.source);
  const output = options.format === "markdown"
    ? markdownReport(inventory)
    : `${JSON.stringify(inventory, null, 2)}\n`;
  if (options.out) {
    await mkdir(path.dirname(options.out), { recursive: true });
    await writeFile(options.out, output);
  } else {
    process.stdout.write(output);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
