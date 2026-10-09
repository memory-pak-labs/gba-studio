import { access, copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { unsupportedNativeEventCommandVerbs } from "../shared/eventCommandRegistry.js";
import { createBlankProjectData } from "../shared/newProject.js";
import type { ParsedGBAProject } from "../shared/projectFile.js";
import { parseGBAProjectFile, serializeGBAProjectFile } from "../shared/projectFile.js";
import { projectSlug } from "../shared/projectPaths.js";

interface GBStudioResource extends Record<string, unknown> {
  _resourceType?: string;
  id?: string;
  name?: string;
  filename?: string;
}

export interface GBStudioImportReport {
  resourceCount: number;
  copiedAssetCount: number;
  sourceVersion: string;
  warnings: string[];
  translatedEventCount: number;
  unsupportedEventCount: number;
  diagnostics: GBStudioImportDiagnostic[];
}

export interface GBStudioImportDiagnostic {
  code: "unsupported-event" | "invalid-collisions" | "missing-reference" | "sprite-placeholder-normalized" | "runtime-placeholder-consolidated";
  message: string;
  sourceCommand?: string;
  sourceEventID?: string;
  sourceResourceID?: string;
}

export interface GBStudioImportResult {
  sourceProjectPath: string;
  projectPath: string;
  project: ParsedGBAProject;
  report: GBStudioImportReport;
}

const BLOCKING_IMPORT_DIAGNOSTIC_CODES = new Set<GBStudioImportDiagnostic["code"]>([
  "unsupported-event",
  "invalid-collisions",
  "missing-reference"
]);

export function blockingGBStudioImportDiagnostics(value: unknown): GBStudioImportDiagnostic[] {
  if (!isRecord(value) || !isRecord(value.gbStudioImport) || !Array.isArray(value.gbStudioImport.diagnostics)) return [];
  return value.gbStudioImport.diagnostics.filter((diagnostic): diagnostic is GBStudioImportDiagnostic =>
    isRecord(diagnostic) &&
    typeof diagnostic.code === "string" &&
    BLOCKING_IMPORT_DIAGNOSTIC_CODES.has(diagnostic.code as GBStudioImportDiagnostic["code"]) &&
    typeof diagnostic.message === "string"
  );
}

interface LoadedResource {
  filePath: string;
  value: GBStudioResource;
}

interface AssetMapping {
  folder: string;
  kind: string;
  systemImage: string;
}

interface ConvertedWorld {
  rooms: Record<string, unknown>[];
  actors: Record<string, unknown>[];
  triggers: Record<string, unknown>[];
  dialogues: Record<string, unknown>[];
  events: Record<string, unknown>[];
  animations: Record<string, unknown>[];
  animationStates: Record<string, unknown>[];
  audioItems: Record<string, unknown>[];
  variables: Record<string, unknown>[];
  defaultPlayerSpriteSheets: Record<string, string>;
  startRoomID: string;
  startRoomName: string;
  translatedEventCount: number;
  unsupportedEventCount: number;
  diagnostics: GBStudioImportDiagnostic[];
}

const ASSET_MAPPINGS: Record<string, AssetMapping> = {
  avatar: { folder: "portraits", kind: "Portrait", systemImage: "person.crop.square" },
  background: { folder: "backgrounds", kind: "Background", systemImage: "photo" },
  emote: { folder: "emotes", kind: "Emote", systemImage: "face.smiling" },
  font: { folder: "fonts", kind: "Font", systemImage: "textformat" },
  music: { folder: "music", kind: "Musica", systemImage: "music.note" },
  sound: { folder: "sounds", kind: "SFX", systemImage: "speaker.wave.2" },
  sprite: { folder: "sprites", kind: "Sprite", systemImage: "figure.walk" },
  tileset: { folder: "tilesets", kind: "Tileset", systemImage: "square.grid.3x3" }
};

const GB_STUDIO_MIT_LICENSE = `MIT License

Copyright (c) 2019 Chris Maltby

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function descendantFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name);
    return entry.isDirectory() ? descendantFiles(entryPath) : [entryPath];
  }));
  return files.flat();
}

async function loadResources(sourceRoot: string): Promise<LoadedResource[]> {
  const files = (await descendantFiles(sourceRoot)).filter((filePath) => filePath.toLowerCase().endsWith(".gbsres"));
  return Promise.all(files.map(async (filePath) => {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      throw new Error(`Recurso GB Studio invalido: ${path.relative(sourceRoot, filePath)}`);
    }
    return { filePath, value: parsed as GBStudioResource };
  }));
}

async function uniqueDestinationRoot(sourceRoot: string): Promise<string> {
  const parent = path.dirname(sourceRoot);
  const basename = path.basename(sourceRoot);
  for (let suffix = 1; ; suffix += 1) {
    const candidate = path.join(parent, suffix === 1 ? `${basename}-gba-import` : `${basename}-gba-import-${suffix}`);
    if (!await exists(candidate)) return candidate;
  }
}

function assetSourcePath(resource: LoadedResource): string | null {
  const filename = stringValue(resource.value.filename);
  if (!filename) return null;
  const descriptorSource = resource.filePath.endsWith(".gbsres") ? resource.filePath.slice(0, -".gbsres".length) : "";
  return descriptorSource && path.basename(descriptorSource) === path.basename(filename)
    ? descriptorSource
    : path.join(path.dirname(resource.filePath), path.basename(filename));
}

function importedAsset(resource: LoadedResource, mapping: AssetMapping, filename: string): Record<string, unknown> {
  const resourceType = stringValue(resource.value._resourceType).toLowerCase();
  const resourceID = stringValue(resource.value.id) || projectSlug(filename);
  return {
    id: `gb-${resourceType}-${resourceID}`,
    name: filename,
    kind: mapping.kind,
    systemImage: mapping.systemImage,
    metadata: {
      source: path.posix.join("Assets", mapping.folder, filename),
      placeholder: true,
      provenance: "GB Studio placeholder",
      gbStudioResourceID: resourceID,
      gbStudioResourceType: resourceType
    }
  };
}

async function materializeAssets(
  resources: LoadedResource[],
  destinationRoot: string,
  warnings: string[]
): Promise<Record<string, unknown>[]> {
  const assets: Record<string, unknown>[] = [];
  for (const resource of resources) {
    const resourceType = stringValue(resource.value._resourceType).toLowerCase();
    const mapping = ASSET_MAPPINGS[resourceType];
    if (!mapping) continue;

    const filename = path.basename(stringValue(resource.value.filename));
    const sourcePath = assetSourcePath(resource);
    if (!filename || !sourcePath || !await exists(sourcePath)) {
      warnings.push(`Asset ausente para ${resourceType}: ${stringValue(resource.value.name) || stringValue(resource.value.id)}`);
      continue;
    }

    const destinationPath = path.join(destinationRoot, "Assets", mapping.folder, filename);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
    assets.push(importedAsset(resource, mapping, filename));
  }
  return assets;
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (isRecord(value)) {
    if (typeof value.value === "number" && Number.isFinite(value.value)) return value.value;
    if (value.type === "true") return 1;
    if (value.type === "false") return 0;
  }
  return fallback;
}

function sourceStringValue(value: unknown, fallback = ""): string {
  const direct = stringValue(value);
  if (direct) return direct;
  if (isRecord(value)) return stringValue(value.value) || fallback;
  return fallback;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function identifier(value: unknown, fallback: string): string {
  const normalized = projectSlug(stringValue(value) || fallback);
  return normalized || projectSlug(fallback) || "imported_resource";
}

function sceneType(value: unknown): string {
  switch (stringValue(value).toUpperCase()) {
    case "PLATFORM": return "platformer";
    case "SHMUP": return "shmup";
    case "POINTNCLICK": return "pointAndClick";
    default: return "topdown";
  }
}

function importedCameraMode(sceneType: string): "follow_player" | "fixed_center" {
  return sceneType === "topdown" || sceneType === "platformer"
    ? "follow_player"
    : "fixed_center";
}

export function decompressGBStudio8BitNumberString(value: string): number[] {
  const result: number[] = [];
  let offset = 0;
  while (offset < value.length) {
    const encodedValue = Number.parseInt(value.slice(offset, offset + 2), 16);
    if (!Number.isFinite(encodedValue)) return [];
    offset += 2;

    if (offset >= value.length) return [];
    let count = 1;
    if (value[offset] === "!") {
      offset += 1;
    } else {
      const end = value.indexOf("+", offset);
      if (end <= offset) return [];
      count = Number.parseInt(value.slice(offset, end), 16);
      if (!Number.isSafeInteger(count) || count < 1) return [];
      offset = end + 1;
    }

    result.push(...Array.from({ length: count }, () => encodedValue));
  }
  return result;
}

function collisionType(value: number): string {
  const properties = value & 0xf0;
  if (properties === 0x10) return "ladder";
  if (properties === 0x20 || properties === 0x40 || properties === 0x60) return "slope_up_right";
  if (properties === 0x30 || properties === 0x50 || properties === 0x70) return "slope_up_left";

  switch (value & 0x0f) {
    case 0x0: return "free";
    case 0x1: return "down";
    case 0x2: return "up";
    case 0x4: return "right";
    case 0x8: return "left";
    default: return "solid";
  }
}

function collisionTypes(
  resource: GBStudioResource,
  width: number,
  height: number,
  diagnostics: GBStudioImportDiagnostic[]
): string[] {
  const expectedCount = width * height;
  const compressed = stringValue(resource.collisions);
  const decoded = decompressGBStudio8BitNumberString(compressed);
  if (decoded.length !== expectedCount) {
    diagnostics.push({
      code: "invalid-collisions",
      message: `Mapa de colisoes possui ${decoded.length} celulas; eram esperadas ${expectedCount}.`,
      sourceResourceID: stringValue(resource.id)
    });
  }
  return Array.from({ length: expectedCount }, (_, index) => collisionType(decoded[index] ?? 0));
}

function resourceType(resource: LoadedResource): string {
  return stringValue(resource.value._resourceType).toLowerCase();
}

function sceneOwner(resource: LoadedResource, scenes: LoadedResource[]): LoadedResource | null {
  const matches = scenes.filter((scene) => {
    const relative = path.relative(path.dirname(scene.filePath), resource.filePath);
    return relative.length > 0 && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  });
  return matches.sort((left, right) => right.filePath.length - left.filePath.length)[0] ?? null;
}

function textArgument(args: Record<string, unknown>): string {
  const text = args.text;
  if (Array.isArray(text)) return text.map((line) => String(line)).join("\n");
  return typeof text === "string" ? text : "";
}

interface ConvertedSprites {
  animations: Record<string, unknown>[];
  states: Record<string, unknown>[];
  spriteSheetByID: Map<string, string>;
  firstAnimationBySpriteID: Map<string, string>;
  firstStateBySpriteID: Map<string, string>;
  animationTickBySpriteID: Map<string, number>;
}

const ANIMATION_NAMES = [
  "idle_right", "idle_left", "idle_up", "idle_down",
  "walk_right", "walk_left", "walk_up", "walk_down"
];

function gbAnimationName(animationType: string, index: number): string {
  if (animationType === "fixed") return index === 0 ? "idle" : `fixed_${index}`;
  if (animationType === "fixed_movement") return index === 0 ? "idle" : index === 4 ? "moving" : `fixed_${index}`;
  if (animationType === "cursor") return index === 0 ? "idle" : index === 1 ? "hover" : `cursor_${index}`;
  if (animationType === "platform_player") {
    return [
      "idle_right", "idle_left", "jump_right", "jump_left",
      "walk_right", "walk_left", "climb", "platform_7"
    ][index] ?? `platform_${index}`;
  }
  return ANIMATION_NAMES[index] ?? `animation_${index}`;
}

function nativeAnimationType(animationType: string): string {
  if (animationType === "multi") return "four_direction";
  if (animationType === "multi_movement") return "four_direction_movement";
  return [
    "fixed", "fixed_movement", "horizontal", "horizontal_movement",
    "four_direction", "four_direction_movement", "directional_view", "platform_player", "cursor"
  ].includes(animationType) ? animationType : "fixed";
}

function animationDirection(name: string): string {
  if (name.endsWith("_right")) return "right";
  if (name.endsWith("_left")) return "left";
  if (name.endsWith("_up")) return "up";
  if (name.endsWith("_down")) return "down";
  return "none";
}

const GBA_PLACEHOLDER_OBJ_DIMENSIONS = new Set([
  "8x8", "16x16", "32x32", "64x64",
  "16x8", "32x8", "32x16", "64x32",
  "8x16", "8x32", "16x32", "32x64"
]);

function gbaPlaceholderPartCount(width: number, height: number): number {
  const tilesWide = width / 8;
  const tilesHigh = height / 8;
  const costs = Array.from(
    { length: tilesWide + 1 },
    () => Array<number>(tilesHigh + 1).fill(Number.POSITIVE_INFINITY)
  );
  for (let x = 0; x <= tilesWide; x += 1) costs[x][0] = 0;
  for (let y = 0; y <= tilesHigh; y += 1) costs[0][y] = 0;

  for (let currentWidth = 1; currentWidth <= tilesWide; currentWidth += 1) {
    for (let currentHeight = 1; currentHeight <= tilesHigh; currentHeight += 1) {
      if (GBA_PLACEHOLDER_OBJ_DIMENSIONS.has(`${currentWidth * 8}x${currentHeight * 8}`)) {
        costs[currentWidth][currentHeight] = 1;
        continue;
      }
      for (let split = 1; split < currentWidth; split += 1) {
        costs[currentWidth][currentHeight] = Math.min(
          costs[currentWidth][currentHeight],
          costs[split][currentHeight] + costs[currentWidth - split][currentHeight]
        );
      }
      for (let split = 1; split < currentHeight; split += 1) {
        costs[currentWidth][currentHeight] = Math.min(
          costs[currentWidth][currentHeight],
          costs[currentWidth][split] + costs[currentWidth][currentHeight - split]
        );
      }
    }
  }
  return costs[tilesWide][tilesHigh];
}

function normalizedPlaceholderFrameDimensions(source: Record<string, unknown>): { width: number; height: number } {
  const sourceWidth = Math.max(8, Math.round(numberValue(source.canvasWidth, numberValue(source.width, 16))));
  const sourceHeight = Math.max(8, Math.round(numberValue(source.canvasHeight, numberValue(source.height, 16))));
  const sheetWidth = Math.max(8, Math.round(numberValue(source.width, sourceWidth)));
  const sheetHeight = Math.max(8, Math.round(numberValue(source.height, sourceHeight)));
  const originalIsExportable = sourceWidth <= 128
    && sourceHeight <= 128
    && sourceWidth % 8 === 0
    && sourceHeight % 8 === 0
    && sheetWidth % sourceWidth === 0
    && sheetHeight % sourceHeight === 0
    && gbaPlaceholderPartCount(sourceWidth, sourceHeight) <= 4;
  if (originalIsExportable) return { width: sourceWidth, height: sourceHeight };

  const widths = Array.from({ length: Math.floor(Math.min(128, sourceWidth) / 8) }, (_, index) => (index + 1) * 8)
    .filter((candidate) => sheetWidth % candidate === 0);
  const heights = Array.from({ length: Math.floor(Math.min(128, sourceHeight) / 8) }, (_, index) => (index + 1) * 8)
    .filter((candidate) => sheetHeight % candidate === 0);
  const candidates = widths.flatMap((width) => heights.map((height) => ({ width, height })))
    .filter(({ width, height }) => gbaPlaceholderPartCount(width, height) <= 4)
    .sort((left, right) => {
      const areaDifference = right.width * right.height - left.width * left.height;
      if (areaDifference !== 0) return areaDifference;
      return Math.abs(sourceWidth - left.width) + Math.abs(sourceHeight - left.height)
        - Math.abs(sourceWidth - right.width) - Math.abs(sourceHeight - right.height);
    });
  return candidates[0] ?? { width: 8, height: 8 };
}

function convertSprites(resources: LoadedResource[], diagnostics: GBStudioImportDiagnostic[]): ConvertedSprites {
  const animations: Record<string, unknown>[] = [];
  const states: Record<string, unknown>[] = [];
  const spriteSheetByID = new Map<string, string>();
  const firstAnimationBySpriteID = new Map<string, string>();
  const firstStateBySpriteID = new Map<string, string>();
  const animationTickBySpriteID = new Map<string, number>();

  for (const resource of resources.filter((item) => resourceType(item) === "sprite")) {
    const source = resource.value;
    const spriteID = stringValue(source.id);
    const spriteSheet = path.basename(stringValue(source.filename));
    if (!spriteID || !spriteSheet) continue;
    spriteSheetByID.set(spriteID, spriteSheet);
    animationTickBySpriteID.set(spriteID, Math.max(1, numberValue(source.animSpeed, 15)));

    const sourceFrameWidth = Math.max(8, Math.round(numberValue(source.canvasWidth, numberValue(source.width, 16))));
    const sourceFrameHeight = Math.max(8, Math.round(numberValue(source.canvasHeight, numberValue(source.height, 16))));
    const { width: frameWidth, height: frameHeight } = normalizedPlaceholderFrameDimensions(source);
    let placeholderWasNormalized = sourceFrameWidth !== frameWidth || sourceFrameHeight !== frameHeight;
    for (const [stateIndex, stateValue] of arrayValue(source.states).entries()) {
      if (!isRecord(stateValue)) continue;
      const stateID = stringValue(stateValue.id) || `${spriteID}-state-${stateIndex + 1}`;
      const importedStateID = `gb-state-${stateID}`;
      const animationType = stringValue(stateValue.animationType) || "fixed";
      const animationIDs: string[] = [];

      for (const [animationIndex, animationValue] of arrayValue(stateValue.animations).entries()) {
        if (!isRecord(animationValue)) continue;
        const sourceFrames = arrayValue(animationValue.frames).filter(isRecord);
        if (sourceFrames.length === 0 || !sourceFrames.some((frame) => arrayValue(frame.tiles).length > 0)) continue;
        const sourceAnimationID = stringValue(animationValue.id) || `${stateID}-animation-${animationIndex + 1}`;
        const importedAnimationID = `gb-animation-${sourceAnimationID}`;
        const name = gbAnimationName(animationType, animationIndex);
        const frames = sourceFrames.map((frame, frameIndex) => ({
          id: `gb-frame-${stringValue(frame.id) || `${sourceAnimationID}-${frameIndex + 1}`}`,
          frameIndex,
          width: frameWidth,
          height: frameHeight,
          originX: numberValue(source.canvasOriginX),
          originY: numberValue(source.canvasOriginY),
          tiles: arrayValue(frame.tiles).filter(isRecord).slice(0, 4).map((tile, tileIndex) => ({
            id: `gb-tile-${stringValue(tile.id) || `${sourceAnimationID}-${frameIndex + 1}-${tileIndex + 1}`}`,
            x: numberValue(tile.x),
            y: numberValue(tile.y),
            sliceX: Math.max(0, numberValue(tile.sliceX)),
            sliceY: Math.max(0, numberValue(tile.sliceY)),
            sourceSheet: spriteSheet,
            tileWidth: 8,
            tileHeight: 8,
            flipX: tile.flipX === true,
            flipY: tile.flipY === true,
            objPalette: stringValue(tile.objPalette) || "OBP0",
            paletteIndex: Math.max(0, Math.min(15, Math.round(numberValue(tile.paletteIndex)))),
            priority: tile.priority === true
          }))
        }));
        if (sourceFrames.some((frame) => arrayValue(frame.tiles).length > 4)) placeholderWasNormalized = true;
        animations.push({
          id: importedAnimationID,
          name,
          spriteSheet,
          frameWidth,
          frameHeight,
          fps: Math.max(1, Math.min(60, Math.round(60 / Math.max(1, numberValue(source.animSpeed, 8))))),
          loops: true,
          frameCount: frames.length,
          state: identifier(stateValue.name, `state_${stateIndex + 1}`),
          direction: animationDirection(name),
          colorMode: "4bpp",
          sourceColorMode: "2bpp",
          frames,
          originX: numberValue(source.canvasOriginX),
          originY: numberValue(source.canvasOriginY),
          hitboxX: numberValue(source.boundsX),
          hitboxY: numberValue(source.boundsY),
          hitboxWidth: Math.max(1, numberValue(source.boundsWidth, frameWidth)),
          hitboxHeight: Math.max(1, numberValue(source.boundsHeight, frameHeight))
        });
        animationIDs.push(importedAnimationID);
        if (!firstAnimationBySpriteID.has(spriteID)) firstAnimationBySpriteID.set(spriteID, name);
      }

      if (animationIDs.length > 0) {
        states.push({
          id: importedStateID,
          name: identifier(stateValue.name, "default"),
          spriteSheet,
          animationType: nativeAnimationType(animationType),
          mirrorLeftFromRight: stateValue.flipLeft === true,
          animationIDs
        });
        if (!firstStateBySpriteID.has(spriteID)) firstStateBySpriteID.set(spriteID, importedStateID);
      }
    }
    if (placeholderWasNormalized) {
      diagnostics.push({
        code: "sprite-placeholder-normalized",
        message: `Sprite placeholder ${spriteSheet} foi limitado a frame ${frameWidth}x${frameHeight} e quatro tiles por frame para o runtime GBA atual.`,
        sourceResourceID: spriteID
      });
    }
  }

  return { animations, states, spriteSheetByID, firstAnimationBySpriteID, firstStateBySpriteID, animationTickBySpriteID };
}

function resourceContainsBuiltInSoundEffect(value: unknown, soundType: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => resourceContainsBuiltInSoundEffect(item, soundType));
  }
  if (!isRecord(value)) return false;
  if (stringValue(value.command) === "EVENT_SOUND_PLAY_EFFECT") {
    const args = isRecord(value.args) ? value.args : {};
    if (stringValue(args.type) === soundType) return true;
  }
  return Object.values(value).some((item) => resourceContainsBuiltInSoundEffect(item, soundType));
}

function convertAudio(resources: LoadedResource[]): { items: Record<string, unknown>[]; namesByID: Map<string, string> } {
  const namesByID = new Map<string, string>();
  const items: Record<string, unknown>[] = resources
    .filter((resource) => ["music", "sound"].includes(resourceType(resource)))
    .flatMap((resource, index) => {
      const sourceID = stringValue(resource.value.id) || `audio-${index + 1}`;
      const filename = path.basename(stringValue(resource.value.filename));
      if (!filename) return [];
      const kind = resourceType(resource) === "music" ? "Musica" : "SFX";
      namesByID.set(sourceID, filename);
      return [{
        id: `gb-audio-${sourceID}`,
        name: filename,
        kind,
        format: path.extname(filename).slice(1).toUpperCase() || stringValue(resource.value.type).toUpperCase(),
        assignedScene: "",
        loops: kind === "Musica",
        bpm: 120,
        exportID: identifier(resource.value.symbol, path.basename(filename, path.extname(filename))),
        volume: kind === "Musica" ? 80 : 90,
        channels: [],
        patterns: []
      }];
    });
  if (resources.some((resource) => resourceContainsBuiltInSoundEffect(resource.value, "crash"))) {
    const name = "gb_builtin_crash";
    namesByID.set("crash", name);
    items.push({
      id: "gb-audio-builtin-crash",
      name,
      kind: "SFX",
      format: "COMPOSED",
      assignedScene: "",
      loops: false,
      bpm: 60,
      exportID: name,
      volume: 90,
      channels: [],
      patterns: [{
        id: "gb-pattern-builtin-crash",
        name: "Crash",
        steps: 1,
        channels: [{
          id: "gb-channel-builtin-crash-noise",
          name: "Noise",
          type: "noise",
          notes: ["K"]
        }]
      }]
    });
  }
  return { items, namesByID };
}

function convertVariables(resources: LoadedResource[]): { items: Record<string, unknown>[]; namesByID: Map<string, string> } {
  const namesByID = new Map<string, string>();
  const variablesResource = resources.find((resource) => resourceType(resource) === "variables")?.value;
  const items = arrayValue(variablesResource?.variables).filter(isRecord).map((variable, index) => {
    const sourceID = stringValue(variable.id) || `${index}`;
    const name = identifier(variable.symbol, `var_${sourceID}`);
    namesByID.set(sourceID, name);
    return {
      id: `gb-variable-${sourceID}`,
      name,
      displayName: stringValue(variable.name) || name,
      initialValue: 0,
      gbStudioVariableID: sourceID
    };
  });
  return { items, namesByID };
}

interface ScriptConversionContext {
  category: string;
  character: string;
  eventName: string;
  sourceResourceID: string;
  actorName?: string;
  roomName?: string;
}

interface ScriptConversionState {
  dialogues: Record<string, unknown>[];
  diagnostics: GBStudioImportDiagnostic[];
  roomNamesByID: Map<string, string>;
  actorNamesByID: Map<string, string>;
  audioNamesByID: Map<string, string>;
  variableNamesByID: Map<string, string>;
  customEventNamesByID: Map<string, string>;
  customEventScriptsByID: Map<string, unknown>;
  spriteSheetNamesByID: Map<string, string>;
  emoteNamesByID: Map<string, string>;
  tilesetNamesByID: Map<string, string>;
  actorAnimationTicksByName: Map<string, number>;
  generatedEvents: Record<string, unknown>[];
  translatedEventCount: number;
  unsupportedEventCount: number;
}

function resolveGBStudioScriptBinding(value: unknown, bindings: Map<string, unknown>): unknown {
  if (typeof value === "string" && bindings.has(value)) {
    const resolved = bindings.get(value);
    return isRecord(resolved) && Object.hasOwn(resolved, "value") ? resolved.value : resolved;
  }
  if (Array.isArray(value)) return value.map((item) => resolveGBStudioScriptBinding(item, bindings));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveGBStudioScriptBinding(item, bindings)]));
}

function customEventCallBindings(args: Record<string, unknown>, inherited: Map<string, unknown>): Map<string, unknown> {
  const bindings = new Map(inherited);
  for (const [key, rawValue] of Object.entries(args)) {
    const match = /^\$(?:actor|variable)\[([^\]]+)\]\$$/.exec(key);
    if (!match) continue;
    const value = resolveGBStudioScriptBinding(rawValue, inherited);
    bindings.set(key, value);
    bindings.set(match[1], value);
  }
  return bindings;
}

function flattenGBStudioScript(
  script: unknown,
  state: ScriptConversionState,
  bindings = new Map<string, unknown>()
): Record<string, unknown>[] {
  const flattened: Record<string, unknown>[] = [];
  for (const rawSourceEvent of arrayValue(script).filter(isRecord)) {
    const sourceEvent = resolveGBStudioScriptBinding(rawSourceEvent, bindings) as Record<string, unknown>;
    const command = stringValue(sourceEvent.command);
    const children = isRecord(sourceEvent.children) ? sourceEvent.children : {};
    const inlineScript = arrayValue(children.script);
    if (command === "EVENT_CALL_CUSTOM_EVENT") {
      const args = isRecord(sourceEvent.args) ? sourceEvent.args : {};
      const customEventID = stringValue(args.customEventId);
      const parameterizedCustomScript = state.customEventScriptsByID.get(customEventID);
      const customScript = parameterizedCustomScript
        ? (inlineScript.length > 0 ? inlineScript : parameterizedCustomScript)
        : undefined;
      if (arrayValue(customScript).length > 0) {
        flattened.push(...flattenGBStudioScript(customScript, state, customEventCallBindings(args, bindings)));
        continue;
      }
    }
    if (command === "EVENT_GROUP") {
      Object.values(children).forEach((childScript) => flattened.push(...flattenGBStudioScript(childScript, state, bindings)));
      continue;
    }
    if (command === "EVENT_IF_COLOR_SUPPORTED") {
      flattened.push(...flattenGBStudioScript(children.true, state, bindings));
      continue;
    }
    if (command === "EVENT_RATE_LIMIT") {
      flattened.push({ ...sourceEvent, children: {} });
      flattened.push(...flattenGBStudioScript(children.true, state, bindings));
      flattened.push({
        id: `${stringValue(sourceEvent.id) || "rate-limit"}-end`,
        command: "GB_STUDIO_RATE_LIMIT_END",
        args: {}
      });
      continue;
    }
    if (["EVENT_IF", "EVENT_IF_INPUT", "EVENT_IF_SAVED_DATA", "EVENT_IF_ACTOR_RELATIVE_TO_ACTOR", "EVENT_IF_ACTOR_AT_POSITION"].includes(command)) {
      flattened.push({ ...sourceEvent, children: {} });
      flattened.push(...flattenGBStudioScript(children.true, state, bindings));
      const falseBranch = flattenGBStudioScript(children.false, state, bindings);
      if (falseBranch.length > 0) {
        flattened.push({
          id: `${stringValue(sourceEvent.id) || "condition"}-else`,
          command: "GB_STUDIO_ELSE",
          args: {}
        });
        flattened.push(...falseBranch);
      }
      flattened.push({
        id: `${stringValue(sourceEvent.id) || "condition"}-end`,
        command: "GB_STUDIO_CONDITION_END",
        args: {}
      });
      continue;
    }
    if (command === "EVENT_LOOP") {
      const loopID = identifier(sourceEvent.id, `loop_${flattened.length + 1}`);
      flattened.push({
        id: `${stringValue(sourceEvent.id) || loopID}-begin`,
        command: "GB_STUDIO_LOOP_BEGIN",
        args: { loopID }
      });
      flattened.push(...flattenGBStudioScript(children.true, state, bindings));
      flattened.push({
        id: `${stringValue(sourceEvent.id) || loopID}-end`,
        command: "GB_STUDIO_LOOP_END",
        args: { loopID }
      });
      continue;
    }
    flattened.push(sourceEvent);
  }
  return flattened;
}

function actorNameForSourceID(
  sourceActorID: string,
  context: ScriptConversionContext,
  state: ScriptConversionState
): string | undefined {
  if (sourceActorID === "$self$" || sourceActorID === "0") return context.actorName ?? "Player";
  if (sourceActorID === "player") return "Player";
  return state.actorNamesByID.get(sourceActorID);
}

function variableNameForSourceID(
  sourceVariableID: string,
  context: ScriptConversionContext,
  state: ScriptConversionState
): string {
  const globalName = state.variableNamesByID.get(sourceVariableID);
  if (globalName) return globalName;
  if (/^L\d+$/.test(sourceVariableID) && context.actorName) {
    return identifier(`${context.actorName}_${sourceVariableID}`, `var_${sourceVariableID}`);
  }
  return identifier(sourceVariableID, `var_${sourceVariableID || "imported"}`);
}

function gbStudioOverlayMoveDurationFrames(
  from: { x: number; y: number },
  to: { x: number; y: number },
  speed: number
): number {
  if (speed === -3) return 0;
  const distancePixels = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) * 8;
  if (distancePixels === 0) return 0;
  if (speed <= 0) return Math.ceil(distancePixels / 2);
  const frameInterval = 1 << Math.max(0, Math.min(6, Math.round(speed) - 1));
  return distancePixels * frameInterval;
}

const gbaViewportWidthTiles = 30;
const gbaViewportHeightTiles = 20;
const gbStudioViewportWidthTiles = 20;
const gbStudioViewportHeightTiles = 18;

function gbaOverlayCoordinate(sourceCoordinate: number, sourceEdge: number, gbaEdge: number): number {
  return sourceCoordinate === sourceEdge ? gbaEdge : sourceCoordinate;
}

function convertScript(
  script: unknown,
  context: ScriptConversionContext,
  state: ScriptConversionState
): Record<string, unknown> | null {
  const sourceEvents = flattenGBStudioScript(script, state);
  if (sourceEvents.length === 0) return null;
  let overlayPosition = { x: 0, y: gbaViewportHeightTiles };

  const steps = sourceEvents.flatMap((sourceEvent, eventIndex) => {
    const command = stringValue(sourceEvent.command);
    const args = isRecord(sourceEvent.args) ? sourceEvent.args : {};
    const sourceEventID = stringValue(sourceEvent.id) || `${context.eventName}-${eventIndex + 1}`;
    let translatedCommand = "noop";
    let gbStudioNoopReason: string | undefined;

    if (command === "EVENT_SET_INPUT_SCRIPT") {
      const children = isRecord(sourceEvent.children) ? sourceEvent.children : {};
      const handlerName = `${context.eventName}_input_${identifier(sourceEventID, `handler_${eventIndex + 1}`)}`;
      const handlerEvent = convertScript(children.true, { ...context, eventName: handlerName }, state);
      if (handlerEvent) state.generatedEvents.push(handlerEvent);
      const inputs = arrayValue(args.input).map((input) => stringValue(input).toLowerCase()).filter(Boolean);
      const override = args.override !== false;
      state.translatedEventCount += 1;
      return (inputs.length > 0 ? inputs : ["b"]).map((input) => ({
        id: `gb-step-${sourceEventID}-${input}`,
        command: `attach_button ${input} ${handlerName} ${override}`,
        isEnabled: sourceEvent.disabled !== true,
        gbStudioCommand: command
      }));
    }

    if (command === "EVENT_SET_PLATFORMER_CALLBACK_SCRIPT") {
      const children = isRecord(sourceEvent.children) ? sourceEvent.children : {};
      const callback = stringValue(args.event) || "fallStart";
      const handlerName = `${context.eventName}_platform_callback_${identifier(callback, "fall_start")}_${identifier(sourceEventID, `handler_${eventIndex + 1}`)}`;
      const handlerEvent = convertScript(children.script, { ...context, eventName: handlerName }, state);
      if (handlerEvent) state.generatedEvents.push(handlerEvent);
      state.translatedEventCount += 1;
      return [{
        id: `gb-step-${sourceEventID}`,
        command: `attach_platform_callback ${callback} ${handlerName}`,
        isEnabled: sourceEvent.disabled !== true,
        gbStudioCommand: command
      }];
    }

    if (command === "EVENT_SET_TIMER_SCRIPT") {
      const children = isRecord(sourceEvent.children) ? sourceEvent.children : {};
      const timer = Math.max(1, Math.min(4, Math.round(numberValue(args.timer, 1))));
      const frames = Math.max(1, Math.round(
        stringValue(args.units) === "frames"
          ? numberValue(args.frames, 30)
          : numberValue(args.duration, 0.5) * 60
      ));
      const handlerName = `${context.eventName}_timer_${timer}_${identifier(sourceEventID, `handler_${eventIndex + 1}`)}`;
      const handlerEvent = convertScript(children.script, { ...context, eventName: handlerName }, state);
      if (handlerEvent) state.generatedEvents.push(handlerEvent);
      state.translatedEventCount += 1;
      return [{
        id: `gb-step-${sourceEventID}`,
        command: `timer_attach ${frames} ${handlerName}`,
        isEnabled: sourceEvent.disabled !== true,
        gbStudioCommand: command
      }];
    }

    if (command === "EVENT_SWITCH") {
      const children = isRecord(sourceEvent.children) ? sourceEvent.children : {};
      const variableName = variableNameForSourceID(stringValue(args.variable), context, state);
      const choices = Math.max(1, Math.min(16, Math.round(numberValue(args.choices, 2))));
      const commandParts = ["switch_variable", variableName];
      for (let choiceIndex = 0; choiceIndex < choices; choiceIndex += 1) {
        const handlerName = `${context.eventName}_switch_${identifier(sourceEventID, `switch_${eventIndex + 1}`)}_case_${choiceIndex}`;
        const handlerEvent = convertScript(children[`true${choiceIndex}`], { ...context, eventName: handlerName }, state);
        state.generatedEvents.push(handlerEvent ?? {
          id: `gb-event-${handlerName}`,
          name: handlerName,
          category: "GB Studio",
          steps: [{ id: `gb-step-${sourceEventID}-case-${choiceIndex}-end`, command: "end_event", isEnabled: true }]
        });
        commandParts.push(String(Math.round(numberValue(args[`value${choiceIndex}`], choiceIndex + 1))), handlerName);
      }
      const falseScript = arrayValue(children.false);
      if (falseScript.length > 0 && args.__disableElse !== true) {
        const handlerName = `${context.eventName}_switch_${identifier(sourceEventID, `switch_${eventIndex + 1}`)}_else`;
        const handlerEvent = convertScript(falseScript, { ...context, eventName: handlerName }, state);
        if (handlerEvent) state.generatedEvents.push(handlerEvent);
        commandParts.push("else", handlerName);
      }
      state.translatedEventCount += 1;
      return [{
        id: `gb-step-${sourceEventID}`,
        command: commandParts.join(" "),
        isEnabled: sourceEvent.disabled !== true,
        gbStudioCommand: command
      }];
    }

    if (command === "EVENT_ACTOR_SET_MOVEMENT_SPEED") {
      const sourceActorID = stringValue(args.actorId);
      const actorName = actorNameForSourceID(sourceActorID, context, state);
      if (actorName) {
        const speedX100 = Math.max(0, Math.round(numberValue(args.speed, 1) * 100));
        state.translatedEventCount += 1;
        return [
          {
            id: `gb-step-${sourceEventID}-activate`,
            command: `set_actor_active ${actorName} true`,
            isEnabled: sourceEvent.disabled !== true,
            gbStudioCommand: command
          },
          {
            id: `gb-step-${sourceEventID}-speed`,
            command: `set_actor_movement_speed ${actorName} ${speedX100}`,
            isEnabled: sourceEvent.disabled !== true,
            gbStudioCommand: command
          }
        ];
      }
      state.diagnostics.push({
        code: "missing-reference",
        message: `Ator nao encontrado: ${sourceActorID}`,
        sourceCommand: command,
        sourceEventID,
        sourceResourceID: context.sourceResourceID
      });
      state.unsupportedEventCount += 1;
      return [{
        id: `gb-step-${sourceEventID}`,
        command: "noop",
        isEnabled: sourceEvent.disabled !== true,
        gbStudioCommand: command
      }];
    }

    if (command === "EVENT_ACTOR_PUSH") {
      if (context.actorName) {
        const distanceTiles = args.continue === true ? 100 : 2;
        state.translatedEventCount += 1;
        return [
          {
            id: `gb-step-${sourceEventID}-activate`,
            command: `set_actor_active ${context.actorName} true`,
            isEnabled: sourceEvent.disabled !== true,
            gbStudioCommand: command
          },
          {
            id: `gb-step-${sourceEventID}-push`,
            command: `push_actor_away_from_player ${context.actorName} ${distanceTiles}`,
            isEnabled: sourceEvent.disabled !== true,
            gbStudioCommand: command
          }
        ];
      }
      state.diagnostics.push({
        code: "unsupported-event",
        message: `${command} precisa estar associado a um ator.`,
        sourceCommand: command,
        sourceEventID,
        sourceResourceID: context.sourceResourceID
      });
      state.unsupportedEventCount += 1;
      return [{
        id: `gb-step-${sourceEventID}`,
        command: "noop",
        isEnabled: sourceEvent.disabled !== true,
        gbStudioCommand: command
      }];
    }

    if (command === "EVENT_RATE_LIMIT") {
      const usesFrames = stringValue(args.units) === "frames";
      const frames = Math.max(1, Math.round(usesFrames ? numberValue(args.frames, 1) : numberValue(args.time, 0.5) * 60));
      const parsedSlot = Number.parseInt(stringValue(args.variable), 10);
      const slot = Number.isFinite(parsedSlot) ? Math.max(0, Math.min(31, parsedSlot)) : eventIndex % 32;
      translatedCommand = `rate_limit ${frames} ${slot}`;
      state.translatedEventCount += 1;
    } else if (command === "GB_STUDIO_RATE_LIMIT_END") {
      translatedCommand = "rate_limit_end";
    } else if (command === "GB_STUDIO_LOOP_BEGIN") {
      translatedCommand = `loop_begin ${stringValue(args.loopID) || identifier(sourceEventID, "loop")}`;
      state.translatedEventCount += 1;
    } else if (command === "GB_STUDIO_LOOP_END") {
      translatedCommand = `loop_end ${stringValue(args.loopID) || identifier(sourceEventID, "loop")}`;
    } else if (command === "GB_STUDIO_CONDITION_END") {
      translatedCommand = "condition_end";
    } else if (command === "EVENT_PLATFORMER_STATE_SET") {
      translatedCommand = `set_platformer_state ${stringValue(args.state) || "fall"}`;
      state.translatedEventCount += 1;
    } else if (command === "EVENT_ENGINE_FIELD_SET") {
      translatedCommand = `set_engine_field ${identifier(args.engineFieldKey, "engine_field")} ${Math.round(numberValue(args.value))}`;
      state.translatedEventCount += 1;
    } else if (command === "EVENT_REPLACE_TILE_XY_SEQUENCE") {
      const variableName = variableNameForSourceID(stringValue(args.variable), context, state);
      const sourceTilesetID = stringValue(args.tilesetId);
      const tilesetName = state.tilesetNamesByID.get(sourceTilesetID) || identifier(sourceTilesetID, "tileset");
      translatedCommand = [
        "replace_tile_animation",
        Math.round(numberValue(args.x)),
        Math.round(numberValue(args.y)),
        Math.round(numberValue(args.tileIndex)),
        Math.max(1, Math.round(numberValue(args.frames, 1))),
        variableName,
        tilesetName
      ].join(" ");
      state.translatedEventCount += 1;
    } else if (command === "EVENT_IF_INPUT") {
      const inputs = arrayValue(args.input).map((input) => stringValue(input).toLowerCase()).filter(Boolean);
      translatedCommand = `if_button ${inputs[0] || "a"}`;
      state.translatedEventCount += 1;
    } else if (command === "EVENT_IF_SAVED_DATA") {
      translatedCommand = `if_save_game ${Math.max(0, Math.round(numberValue(args.saveSlot)))}`;
      state.translatedEventCount += 1;
    } else if (command === "EVENT_RNG_SEED") {
      translatedCommand = "seed_random";
      state.translatedEventCount += 1;
    } else if (command === "EVENT_VARIABLE_MATH") {
      const variableName = variableNameForSourceID(stringValue(args.vectorX), context, state);
      const operation = stringValue(args.operation) || "set";
      const other = stringValue(args.other) || "true";
      if (operation === "set" && other === "rnd") {
        translatedCommand = `random_variable ${variableName} ${Math.round(numberValue(args.minValue))} ${Math.round(numberValue(args.maxValue, 32767))}`;
        state.translatedEventCount += 1;
      } else if (other === "true" || other === "false" || other === "val") {
        const value = other === "true" ? 1 : other === "false" ? 0 : Math.round(numberValue(args.value));
        if (operation === "set") translatedCommand = `set_variable ${variableName} ${value}`;
        if (operation === "add") translatedCommand = `add_variable ${variableName} ${value}`;
        if (operation === "sub") translatedCommand = `add_variable ${variableName} ${-value}`;
        if (operation === "mul") translatedCommand = `multiply_variable ${variableName} ${value}`;
        if (operation === "div") translatedCommand = `divide_variable ${variableName} ${value}`;
        if (operation === "mod") translatedCommand = `mod_variable ${variableName} ${value}`;
        if (translatedCommand !== "noop") state.translatedEventCount += 1;
      }
      if (translatedCommand === "noop") {
        state.diagnostics.push({
          code: "unsupported-event",
          message: `Operacao matematica ainda nao suportada: ${operation}/${other}`,
          sourceCommand: command,
          sourceEventID,
          sourceResourceID: context.sourceResourceID
        });
        state.unsupportedEventCount += 1;
      }
    } else if (command === "EVENT_TEXT") {
      const dialogueKey = `gb_dialogue_${state.dialogues.length + 1}`;
      state.dialogues.push({
        key: dialogueKey,
        character: context.character,
        portrait: "",
        emote: "",
        textSound: "",
        confirmSound: "",
        text: textArgument(args),
        translation: "",
        translationLanguageCode: "en",
        choices: [],
        choiceTranslations: []
      });
      translatedCommand = `show_dialogue ${dialogueKey}`;
      state.translatedEventCount += 1;
    } else if (command === "EVENT_CHOICE") {
      const dialogueKey = `gb_dialogue_${state.dialogues.length + 1}`;
      state.dialogues.push({
        key: dialogueKey,
        character: context.character,
        portrait: "",
        emote: "",
        textSound: "",
        confirmSound: "",
        text: "",
        translation: "",
        translationLanguageCode: "en",
        choices: [stringValue(args.trueText), stringValue(args.falseText)].filter(Boolean),
        choiceTranslations: []
      });
      translatedCommand = `show_choice ${dialogueKey}`;
      state.translatedEventCount += 1;
    } else if (command === "EVENT_IF") {
      const variableID = stringValue(args.variable)
        || (isRecord(args.condition) ? stringValue(args.condition.value) : "");
      const variableName = variableNameForSourceID(variableID, context, state);
      translatedCommand = `if_variable ${variableName} 1`;
      state.translatedEventCount += 1;
    } else if (["EVENT_IF_ACTOR_RELATIVE_TO_ACTOR", "EVENT_IF_ACTOR_AT_POSITION"].includes(command)) {
      const actorName = actorNameForSourceID(stringValue(args.actorId), context, state);
      if (actorName) {
        if (command === "EVENT_IF_ACTOR_RELATIVE_TO_ACTOR") {
          const otherActorName = actorNameForSourceID(stringValue(args.otherActorId), context, state);
          if (otherActorName) {
            translatedCommand = `if_actor_relative ${actorName} ${otherActorName} ${stringValue(args.operation) || "left"}`;
            state.translatedEventCount += 1;
          }
        } else {
          translatedCommand = `if_actor_at_position ${actorName} ${numberValue(args.x)} ${numberValue(args.y)}`;
          state.translatedEventCount += 1;
        }
      }
      if (translatedCommand === "noop") {
        state.diagnostics.push({
          code: "missing-reference",
          message: `Ator de condicao nao encontrado em ${command}.`,
          sourceCommand: command,
          sourceEventID,
          sourceResourceID: context.sourceResourceID
        });
        state.unsupportedEventCount += 1;
      }
    } else if (command === "GB_STUDIO_ELSE") {
      translatedCommand = "else";
    } else if (command === "EVENT_SCENE_PUSH_STATE") {
      translatedCommand = "scene_stack_push";
      state.translatedEventCount += 1;
    } else if (command === "EVENT_SCENE_POP_STATE") {
      translatedCommand = "scene_stack_previous";
      state.translatedEventCount += 1;
    } else if (command === "EVENT_SWITCH_SCENE") {
      const targetSceneID = stringValue(args.sceneId);
      const targetRoom = state.roomNamesByID.get(targetSceneID);
      if (targetRoom) {
        const x = numberValue(args.x);
        const y = numberValue(args.y);
        const direction = stringValue(args.direction) || "down";
        translatedCommand = `change_scene ${targetRoom} ${x} ${y} ${direction}`;
        state.translatedEventCount += 1;
        return [
          {
            id: `gb-step-${sourceEventID}`,
            command: translatedCommand,
            isEnabled: sourceEvent.disabled !== true,
            gbStudioCommand: command
          },
          {
            id: `gb-step-${sourceEventID}-end`,
            command: "end_event",
            isEnabled: sourceEvent.disabled !== true,
            gbStudioCommand: command
          }
        ];
      } else {
        state.diagnostics.push({
          code: "missing-reference",
          message: `Cena de destino nao encontrada: ${targetSceneID}`,
          sourceCommand: command,
          sourceEventID,
          sourceResourceID: context.sourceResourceID
        });
        state.unsupportedEventCount += 1;
      }
    } else if (command === "EVENT_WAIT") {
      translatedCommand = `wait ${Math.max(0, Math.round(numberValue(args.frames, numberValue(args.time) * 60)))}`;
      state.translatedEventCount += 1;
    } else if (command === "EVENT_MUSIC_PLAY") {
      const audioName = state.audioNamesByID.get(stringValue(args.musicId));
      if (audioName) {
        translatedCommand = `play_music ${audioName}`;
        state.translatedEventCount += 1;
      } else {
        state.diagnostics.push({
          code: "missing-reference",
          message: `Musica nao encontrada: ${stringValue(args.musicId)}`,
          sourceCommand: command,
          sourceEventID,
          sourceResourceID: context.sourceResourceID
        });
        state.unsupportedEventCount += 1;
      }
    } else if (command === "EVENT_SOUND_PLAY_EFFECT") {
      const audioName = state.audioNamesByID.get(stringValue(args.type));
      if (audioName) {
        translatedCommand = `play_sfx ${audioName}`;
        state.translatedEventCount += 1;
      } else {
        state.diagnostics.push({
          code: "missing-reference",
          message: `Efeito sonoro externo nao encontrado para: ${stringValue(args.type)}`,
          sourceCommand: command,
          sourceEventID,
          sourceResourceID: context.sourceResourceID
        });
        state.unsupportedEventCount += 1;
      }
    } else if (command === "EVENT_LAUNCH_PROJECTILE") {
      const sourceActorID = stringValue(args.actorId);
      const actorName = actorNameForSourceID(sourceActorID, context, state);
      const directionType = stringValue(args.directionType) || "direction";
      if (actorName && directionType === "direction") {
        const direction = stringValue(args.direction) || "right";
        const speed = Math.max(0.5, numberValue(args.speed, 2));
        const spriteSheet = state.spriteSheetNamesByID.get(stringValue(args.spriteSheetId));
        translatedCommand = `launch_projectile ${actorName} ${direction} ${speed}${spriteSheet ? ` ${spriteSheet}` : ""}`;
        state.translatedEventCount += 1;
      } else {
        state.diagnostics.push({
          code: actorName ? "unsupported-event" : "missing-reference",
          message: actorName
            ? `Direcao de projetil ainda nao suportada: ${directionType}`
            : `Ator de origem do projetil nao encontrado: ${sourceActorID}`,
          sourceCommand: command,
          sourceEventID,
          sourceResourceID: context.sourceResourceID
        });
        state.unsupportedEventCount += 1;
      }
    } else if (command === "EVENT_CALL_CUSTOM_EVENT") {
      const customEventName = state.customEventNamesByID.get(stringValue(args.customEventId));
      if (customEventName) {
        translatedCommand = `call_event ${customEventName}`;
        state.translatedEventCount += 1;
      } else {
        state.diagnostics.push({
          code: "missing-reference",
          message: `Script personalizado nao encontrado: ${stringValue(args.customEventId)}`,
          sourceCommand: command,
          sourceEventID,
          sourceResourceID: context.sourceResourceID
        });
        state.unsupportedEventCount += 1;
      }
    } else if (command === "EVENT_SET_VALUE") {
      const variableName = variableNameForSourceID(stringValue(args.variable), context, state);
      translatedCommand = `set_variable ${variableName} ${numberValue(args.value)}`;
      state.translatedEventCount += 1;
    } else if (command === "EVENT_DEC_VALUE") {
      const variableID = stringValue(args.variable);
      const variableName = variableNameForSourceID(variableID, context, state);
      translatedCommand = `add_variable ${variableName} -1`;
      state.translatedEventCount += 1;
    } else if (command === "EVENT_ACTOR_MOVE_RELATIVE") {
      const sourceActorID = stringValue(args.actorId);
      const actorName = actorNameForSourceID(sourceActorID, context, state);
      if (actorName) {
        translatedCommand = `move_actor_relative ${actorName} ${numberValue(args.x)} ${numberValue(args.y)}`;
        state.translatedEventCount += 1;
      } else {
        state.diagnostics.push({
          code: "missing-reference",
          message: `Ator nao encontrado: ${sourceActorID}`,
          sourceCommand: command,
          sourceEventID,
          sourceResourceID: context.sourceResourceID
        });
        state.unsupportedEventCount += 1;
      }
    } else if (["EVENT_ACTOR_MOVE_TO", "EVENT_ACTOR_SET_POSITION"].includes(command)) {
      const sourceActorID = stringValue(args.actorId);
      const actorName = actorNameForSourceID(sourceActorID, context, state);
      if (actorName) {
        translatedCommand = `${command === "EVENT_ACTOR_MOVE_TO" ? "move_actor_to" : "set_actor_position"} ${actorName} ${numberValue(args.x)} ${numberValue(args.y)}`;
        state.translatedEventCount += 1;
      } else {
        state.diagnostics.push({
          code: "missing-reference",
          message: `Ator nao encontrado: ${sourceActorID}`,
          sourceCommand: command,
          sourceEventID,
          sourceResourceID: context.sourceResourceID
        });
        state.unsupportedEventCount += 1;
      }
    } else if (["EVENT_ACTOR_SET_DIRECTION", "EVENT_ACTOR_SET_FRAME", "EVENT_ACTOR_SET_STATE", "EVENT_ACTOR_STOP_UPDATE"].includes(command)) {
      const sourceActorID = stringValue(args.actorId);
      const actorName = actorNameForSourceID(sourceActorID, context, state);
      if (actorName && (actorName !== "Player" || ["EVENT_ACTOR_SET_DIRECTION", "EVENT_ACTOR_SET_STATE"].includes(command))) {
        if (command === "EVENT_ACTOR_SET_DIRECTION") {
          translatedCommand = `set_actor_direction ${actorName} ${sourceStringValue(args.direction, "down")}`;
        } else if (command === "EVENT_ACTOR_SET_FRAME") {
          translatedCommand = `set_actor_animation_frame ${actorName} ${Math.max(0, Math.round(numberValue(args.frame)))}`;
        } else if (command === "EVENT_ACTOR_SET_STATE") {
          translatedCommand = `set_actor_animation ${actorName} ${identifier(args.spriteStateId, "idle")}`;
        } else {
          translatedCommand = `set_actor_movement_speed ${actorName} 0`;
        }
        state.translatedEventCount += 1;
      } else {
        state.diagnostics.push({
          code: actorName === "Player" ? "unsupported-event" : "missing-reference",
          message: actorName === "Player" ? `O export atual nao aplica ${command} ao player.` : `Ator nao encontrado: ${sourceActorID}`,
          sourceCommand: command,
          sourceEventID,
          sourceResourceID: context.sourceResourceID
        });
        state.unsupportedEventCount += 1;
      }
    } else if (command === "EVENT_MUSIC_STOP") {
      translatedCommand = "stop_music";
      state.translatedEventCount += 1;
    } else if (command === "EVENT_SAVE_DATA") {
      translatedCommand = `save_game ${Math.max(0, Math.round(numberValue(args.saveSlot)))}`;
      state.translatedEventCount += 1;
    } else if (command === "EVENT_LOAD_DATA") {
      translatedCommand = `load_game ${Math.max(0, Math.round(numberValue(args.saveSlot)))}`;
      state.translatedEventCount += 1;
    } else if (command === "EVENT_AWAIT_INPUT") {
      const inputs = arrayValue(args.input).map((input) => stringValue(input)).filter(Boolean);
      translatedCommand = `wait_button ${inputs.join(",") || "a"}`;
      state.translatedEventCount += 1;
    } else if (command === "EVENT_PLAYER_BOUNCE") {
      const height = ({ low: 1, medium: 2, high: 3 } as Record<string, number>)[stringValue(args.height)] ?? 1;
      translatedCommand = `player_bounce ${height} 20`;
      state.translatedEventCount += 1;
    } else if (["EVENT_ACTOR_DEACTIVATE", "EVENT_ACTOR_ACTIVATE", "EVENT_ACTOR_COLLISIONS_DISABLE", "EVENT_ACTOR_COLLISIONS_ENABLE"].includes(command)) {
      const sourceActorID = stringValue(args.actorId);
      const actorName = actorNameForSourceID(sourceActorID, context, state);
      const supportsPlayer = command === "EVENT_ACTOR_DEACTIVATE" || command === "EVENT_ACTOR_ACTIVATE";
      if (actorName && (actorName !== "Player" || supportsPlayer)) {
        if (command === "EVENT_ACTOR_DEACTIVATE" || command === "EVENT_ACTOR_ACTIVATE") {
          translatedCommand = `set_actor_active ${actorName} ${command === "EVENT_ACTOR_ACTIVATE"}`;
        } else {
          translatedCommand = `set_actor_collision_enabled ${actorName} ${command === "EVENT_ACTOR_COLLISIONS_ENABLE"}`;
        }
        state.translatedEventCount += 1;
      } else {
        state.diagnostics.push({
          code: actorName === "Player" ? "unsupported-event" : "missing-reference",
          message: actorName === "Player" ? `O export atual nao aplica ${command} ao player.` : `Ator nao encontrado: ${sourceActorID}`,
          sourceCommand: command,
          sourceEventID,
          sourceResourceID: context.sourceResourceID
        });
        state.unsupportedEventCount += 1;
      }
    } else if (command === "EVENT_ACTOR_SET_SPRITE") {
      const sourceActorID = stringValue(args.actorId);
      const actorName = actorNameForSourceID(sourceActorID, context, state);
      const spriteSheet = state.spriteSheetNamesByID.get(stringValue(args.spriteSheetId));
      if (actorName && spriteSheet) {
        translatedCommand = `set_actor_sprite ${actorName} ${spriteSheet}`;
        state.translatedEventCount += 1;
      } else {
        state.diagnostics.push({
          code: "missing-reference",
          message: actorName
            ? `Sprite de destino nao encontrado: ${stringValue(args.spriteSheetId)}`
            : `Ator nao encontrado: ${sourceActorID}`,
          sourceCommand: command,
          sourceEventID,
          sourceResourceID: context.sourceResourceID
        });
        state.unsupportedEventCount += 1;
      }
    } else if (command === "EVENT_ACTOR_EMOTE") {
      const sourceActorID = stringValue(args.actorId);
      const actorName = actorNameForSourceID(sourceActorID, context, state);
      const emoteName = state.emoteNamesByID.get(stringValue(args.emoteId));
      if (actorName && emoteName) {
        translatedCommand = `show_actor_gesture ${actorName} ${emoteName} 60`;
        state.translatedEventCount += 1;
      } else {
        state.diagnostics.push({
          code: "missing-reference",
          message: actorName
            ? `Emote nao encontrado: ${stringValue(args.emoteId)}`
            : `Ator nao encontrado: ${sourceActorID}`,
          sourceCommand: command,
          sourceEventID,
          sourceResourceID: context.sourceResourceID
        });
        state.unsupportedEventCount += 1;
      }
    } else if (command === "EVENT_ACTOR_SET_ANIMATION_SPEED") {
      const sourceActorID = stringValue(args.actorId);
      const actorName = actorNameForSourceID(sourceActorID, context, state);
      if (actorName) {
        const sourceTick = Math.max(1, numberValue(args.speed, 15));
        const baseTick = Math.max(1, state.actorAnimationTicksByName.get(actorName) ?? 15);
        const percent = Math.max(1, Math.min(400, Math.round((baseTick * 100) / sourceTick)));
        translatedCommand = `set_actor_animation_speed ${actorName} ${percent}`;
        state.translatedEventCount += 1;
      } else {
        state.diagnostics.push({
          code: "missing-reference",
          message: `Ator nao encontrado: ${sourceActorID}`,
          sourceCommand: command,
          sourceEventID,
          sourceResourceID: context.sourceResourceID
        });
        state.unsupportedEventCount += 1;
      }
    } else if (command === "EVENT_CAMERA_SHAKE") {
      const frames = Math.max(1, Math.round(numberValue(args.frames, numberValue(args.time, 0.5) * 60)));
      translatedCommand = `shake_screen ${frames} ${Math.max(1, Math.round(numberValue(args.magnitude, 2)))}`;
      state.translatedEventCount += 1;
    } else if (command === "EVENT_OVERLAY_SHOW") {
      const sourceX = Math.max(0, Math.min(gbStudioViewportWidthTiles, Math.round(numberValue(args.x))));
      const sourceY = Math.max(0, Math.min(gbStudioViewportHeightTiles, Math.round(numberValue(args.y))));
      const x = gbaOverlayCoordinate(sourceX, gbStudioViewportWidthTiles, gbaViewportWidthTiles);
      const y = gbaOverlayCoordinate(sourceY, gbStudioViewportHeightTiles, gbaViewportHeightTiles);
      overlayPosition = { x, y };
      translatedCommand = `overlay_show ${x * 8} ${y * 8} ${(gbaViewportWidthTiles - x) * 8} ${(gbaViewportHeightTiles - y) * 8}`;
      state.translatedEventCount += 1;
    } else if (command === "EVENT_OVERLAY_MOVE_TO") {
      const sourceX = Math.max(0, Math.min(gbStudioViewportWidthTiles, Math.round(numberValue(args.x))));
      const sourceY = Math.max(0, Math.min(gbStudioViewportHeightTiles, Math.round(numberValue(args.y))));
      const target = {
        x: gbaOverlayCoordinate(sourceX, gbStudioViewportWidthTiles, gbaViewportWidthTiles),
        y: gbaOverlayCoordinate(sourceY, gbStudioViewportHeightTiles, gbaViewportHeightTiles)
      };
      const frames = gbStudioOverlayMoveDurationFrames(overlayPosition, target, numberValue(args.speed, -3));
      overlayPosition = target;
      translatedCommand = `overlay_move ${target.x * 8} ${target.y * 8} ${frames}`;
      state.translatedEventCount += 1;
    } else if (command === "EVENT_OVERLAY_HIDE") {
      translatedCommand = "overlay_hide 0";
      state.translatedEventCount += 1;
    } else if (command === "EVENT_ACTOR_SET_ANIMATE") {
      gbStudioNoopReason = "deprecated-upstream";
      state.translatedEventCount += 1;
    } else {
      state.diagnostics.push({
        code: "unsupported-event",
        message: `Comando do GB Studio ainda nao suportado: ${command || "desconhecido"}`,
        sourceCommand: command,
        sourceEventID,
        sourceResourceID: context.sourceResourceID
      });
      state.unsupportedEventCount += 1;
    }

    return [{
      id: `gb-step-${sourceEventID}`,
      command: translatedCommand,
      isEnabled: sourceEvent.disabled !== true,
      gbStudioCommand: command,
      ...(gbStudioNoopReason ? { gbStudioNoopReason } : {})
    }];
  });

  return {
    id: `gb-event-${context.eventName}`,
    name: context.eventName,
    category: context.category,
    detail: `Importado do GB Studio (${context.sourceResourceID})`,
    command: "noop",
    steps,
    ...(context.roomName ? { roomName: context.roomName } : {})
  };
}

function convertWorld(resources: LoadedResource[], assets: Record<string, unknown>[]): ConvertedWorld {
  const diagnostics: GBStudioImportDiagnostic[] = [];
  const sceneResources = resources.filter((resource) => resourceType(resource) === "scene");
  const settings = resources.find((resource) => resourceType(resource) === "settings")?.value;
  const startSceneID = stringValue(settings?.startSceneId);
  sceneResources.sort((left, right) => {
    const leftStart = stringValue(left.value.id) === startSceneID ? 0 : 1;
    const rightStart = stringValue(right.value.id) === startSceneID ? 0 : 1;
    return leftStart - rightStart || left.filePath.localeCompare(right.filePath);
  });

  const roomNamesByID = new Map(sceneResources.map((resource, index) => {
    const sceneID = stringValue(resource.value.id) || `scene-${index + 1}`;
    return [sceneID, identifier(resource.value.symbol, `scene_${sceneID}`)];
  }));
  const backgroundNamesByID = new Map<string, string>();
  for (const asset of assets) {
    const metadata = isRecord(asset.metadata) ? asset.metadata : {};
    const resourceID = stringValue(metadata.gbStudioResourceID);
    if (resourceID && typeof asset.name === "string") backgroundNamesByID.set(resourceID, asset.name);
  }

  const sprites = convertSprites(resources, diagnostics);
  const audio = convertAudio(resources);
  const variables = convertVariables(resources);
  const actorResources = resources.filter((resource) => resourceType(resource) === "actor");
  const actorPrefabsByID = new Map(resources
    .filter((resource) => resourceType(resource) === "actorprefab")
    .map((resource) => [stringValue(resource.value.id), resource.value]));
  const actorPrefabFor = (source: GBStudioResource): GBStudioResource | undefined => actorPrefabsByID.get(stringValue(source.prefabId));
  const actorValue = (source: GBStudioResource, key: string): unknown => {
    if (source[key] !== undefined) return source[key];
    return actorPrefabFor(source)?.[key];
  };
  const defaultPlayerSprites = isRecord(settings?.defaultPlayerSprites) ? settings.defaultPlayerSprites : {};
  const defaultPlayerSpriteSheets = Object.fromEntries(Object.entries(defaultPlayerSprites).flatMap(([runtime, spriteID]) => {
    const spriteSheet = sprites.spriteSheetByID.get(stringValue(spriteID));
    return spriteSheet ? [[runtime, spriteSheet]] : [];
  }));
  const actorDisplayNameCounts = new Map<string, number>();
  actorResources.forEach((resource, index) => {
    const sourceName = stringValue(resource.value.name) || identifier(resource.value.symbol, `Actor_${index + 1}`);
    actorDisplayNameCounts.set(sourceName, (actorDisplayNameCounts.get(sourceName) ?? 0) + 1);
  });
  const usedActorNames = new Set<string>();
  const actorNamesByID = new Map(actorResources.map((resource, index) => {
    const sourceID = stringValue(resource.value.id) || `actor-${index + 1}`;
    const sourceName = stringValue(resource.value.name) || identifier(resource.value.symbol, `Actor_${index + 1}`);
    const displayNameIsUnique = actorDisplayNameCounts.get(sourceName) === 1;
    const preferredName = displayNameIsUnique && /^[A-Za-z0-9_.-]+$/.test(sourceName)
      ? sourceName
      : identifier(resource.value.symbol, sourceID);
    let name = preferredName;
    let suffix = 2;
    while (usedActorNames.has(name)) {
      name = `${preferredName}_${suffix}`;
      suffix += 1;
    }
    usedActorNames.add(name);
    return [sourceID, name];
  }));
  const customScriptResources = resources.filter((resource) => resourceType(resource) === "script");
  const customEventNamesByID = new Map(customScriptResources.map((resource, index) => {
    const sourceID = stringValue(resource.value.id) || `script-${index + 1}`;
    return [sourceID, identifier(resource.value.symbol, resource.value.name ? String(resource.value.name) : `script_${index + 1}`)];
  }));
  const customEventScriptsByID = new Map(customScriptResources.flatMap((resource, index) => {
    const hasParameters = Object.keys(isRecord(resource.value.actors) ? resource.value.actors : {}).length > 0
      || Object.keys(isRecord(resource.value.variables) ? resource.value.variables : {}).length > 0;
    return hasParameters ? [[stringValue(resource.value.id) || `script-${index + 1}`, resource.value.script] as const] : [];
  }));
  const emoteNamesByID = new Map(resources
    .filter((resource) => resourceType(resource) === "emote")
    .flatMap((resource) => {
      const sourceID = stringValue(resource.value.id);
      const filename = path.basename(stringValue(resource.value.filename));
      return sourceID && filename ? [[sourceID, filename] as const] : [];
    }));
  const tilesetNamesByID = new Map(assets.flatMap((asset) => {
    const metadata = isRecord(asset.metadata) ? asset.metadata : {};
    const sourceID = stringValue(metadata.gbStudioResourceID);
    const sourceType = stringValue(metadata.gbStudioResourceType);
    const assetName = stringValue(asset.name);
    return sourceType === "tileset" && sourceID && assetName ? [[sourceID, assetName] as const] : [];
  }));
  const actorAnimationTicksByName = new Map(actorResources.flatMap((resource, index) => {
    const sourceID = stringValue(resource.value.id) || `actor-${index + 1}`;
    const actorName = actorNamesByID.get(sourceID);
    const spriteID = stringValue(actorValue(resource.value, "spriteSheetId"));
    if (!actorName || !spriteID) return [];
    return [[actorName, sprites.animationTickBySpriteID.get(spriteID) ?? 15] as const];
  }));

  const state: ScriptConversionState = {
    dialogues: [],
    diagnostics,
    roomNamesByID,
    actorNamesByID,
    audioNamesByID: audio.namesByID,
    variableNamesByID: variables.namesByID,
    customEventNamesByID,
    customEventScriptsByID,
    spriteSheetNamesByID: sprites.spriteSheetByID,
    emoteNamesByID,
    tilesetNamesByID,
    actorAnimationTicksByName,
    generatedEvents: [],
    translatedEventCount: 0,
    unsupportedEventCount: 0
  };
  const events: Record<string, unknown>[] = [];
  for (const [index, resource] of customScriptResources.entries()) {
    if (Object.keys(isRecord(resource.value.actors) ? resource.value.actors : {}).length > 0
      || Object.keys(isRecord(resource.value.variables) ? resource.value.variables : {}).length > 0) {
      continue;
    }
    const sourceID = stringValue(resource.value.id) || `script-${index + 1}`;
    const eventName = customEventNamesByID.get(sourceID) ?? `script_${index + 1}`;
    const event = convertScript(resource.value.script, {
      category: "Script",
      character: "Narrador",
      eventName,
      sourceResourceID: sourceID
    }, state);
    if (event) events.push(event);
  }
  const rooms = sceneResources.map((resource, index) => {
    const source = resource.value;
    const sourceID = stringValue(source.id) || `scene-${index + 1}`;
    const name = roomNamesByID.get(sourceID) ?? identifier(source.symbol, `scene_${index + 1}`);
    const sourceWidth = Math.max(1, Math.round(numberValue(source.width, 20)));
    const sourceHeight = Math.max(1, Math.round(numberValue(source.height, 18)));
    const width = sourceWidth;
    const height = sourceHeight;
    const sourceCollisionTypes = collisionTypes(source, sourceWidth, sourceHeight, diagnostics);
    const types = Array.from({ length: width * height }, (_, index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      return sourceCollisionTypes[y * sourceWidth + x] ?? "free";
    });
    const sourceSceneType = sceneType(source.type);
    const sourceBackgroundAssetName = backgroundNamesByID.get(stringValue(source.backgroundId)) ?? "";
    const onEnterEventName = `${name}_on_enter`;
    const onEnterEvent = convertScript(source.script, {
      category: "Cena",
      character: "Narrador",
      eventName: onEnterEventName,
      sourceResourceID: sourceID,
      roomName: name
    }, state);
    if (onEnterEvent) events.push(onEnterEvent);

    return {
      id: `gb-scene-${sourceID}`,
      name,
      gbStudioName: stringValue(source.name) || name,
      gbStudioSceneID: sourceID,
      width,
      height,
      sceneType: sourceSceneType,
      music: "",
      cameraMode: importedCameraMode(sourceSceneType),
      cameraZoom: 100,
      cameraBounds: { x: 0, y: 0, width, height },
      parallax: { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
      backgroundAssetName: sourceBackgroundAssetName,
      gbStudioUseBackgroundLayout: Boolean(sourceBackgroundAssetName),
      backgroundRenderMode: "tilemap",
      playerActorName: "",
      tilemap: Array.from({ length: width * height }, () => 0),
      collisions: types,
      collisionTypes: types,
      referenceImages: [],
      eventBindings: onEnterEvent ? { onInit: onEnterEventName } : {}
    };
  });

  const actors = actorResources.flatMap((resource, index) => {
    const owner = sceneOwner(resource, sceneResources);
    const ownerID = stringValue(owner?.value.id);
    const roomName = roomNamesByID.get(ownerID);
    if (!roomName) return [];
    const sourceID = stringValue(resource.value.id) || `actor-${index + 1}`;
    const name = actorNamesByID.get(sourceID) ?? identifier(resource.value.symbol, `Actor_${index + 1}`);
    const sourceName = stringValue(resource.value.name) || name;
    const prefabID = stringValue(resource.value.prefabId);
    const spriteID = stringValue(actorValue(resource.value, "spriteSheetId"));
    const sourceSpriteSheet = sprites.spriteSheetByID.get(spriteID) ?? "";
    const sourceX = numberValue(resource.value.x);
    const sourceY = numberValue(resource.value.y);
    const x = sourceX;
    const y = sourceY;
    const eventBaseName = identifier(resource.value.symbol, `actor_${sourceID}`);
    const eventName = `${eventBaseName}_on_interact`;
    const onInitEventName = `${eventBaseName}_on_init`;
    const onUpdateEventName = `${eventBaseName}_on_update`;
    const onHit1EventName = `${eventBaseName}_on_hit_1`;
    const onHit2EventName = `${eventBaseName}_on_hit_2`;
    const onHit3EventName = `${eventBaseName}_on_hit_3`;
    const event = convertScript(actorValue(resource.value, "script"), {
      category: "Ator",
      character: name,
      eventName,
      sourceResourceID: sourceID,
      actorName: name,
      roomName
    }, state);
    const onInitEvent = convertScript(actorValue(resource.value, "startScript"), {
      category: "Ator",
      character: name,
      eventName: onInitEventName,
      sourceResourceID: sourceID,
      actorName: name,
      roomName
    }, state);
    const onUpdateEvent = convertScript(actorValue(resource.value, "updateScript"), {
      category: "Ator",
      character: name,
      eventName: onUpdateEventName,
      sourceResourceID: sourceID,
      actorName: name,
      roomName
    }, state);
    const hitEvents = [
      [onHit1EventName, actorValue(resource.value, "hit1Script")],
      [onHit2EventName, actorValue(resource.value, "hit2Script")],
      [onHit3EventName, actorValue(resource.value, "hit3Script")]
    ].map(([hitEventName, hitScript]) => convertScript(hitScript, {
      category: "Ator",
      character: name,
      eventName: String(hitEventName),
      sourceResourceID: sourceID,
      actorName: name,
      roomName
    }, state));
    [event, onInitEvent, onUpdateEvent, ...hitEvents].filter(Boolean).forEach((actorEvent) => events.push(actorEvent as Record<string, unknown>));
    return [{
      id: `gb-actor-${sourceID}`,
      name,
      ...(sourceName !== name ? { gbStudioName: sourceName } : {}),
      roomName,
      x,
      y,
      spriteSheet: sourceSpriteSheet,
      animationStateID: sprites.firstStateBySpriteID.get(spriteID) ?? "",
      animationName: sprites.firstAnimationBySpriteID.get(spriteID) ?? "",
      eventBindings: {
        ...(event ? { onInteract: eventName } : {}),
        ...(onInitEvent ? { onInit: onInitEventName } : {}),
        ...(onUpdateEvent ? { onUpdate: onUpdateEventName } : {}),
        ...(hitEvents[0] ? { onHit1: onHit1EventName } : {}),
        ...(hitEvents[1] ? { onHit2: onHit2EventName } : {}),
        ...(hitEvents[2] ? { onHit3: onHit3EventName } : {})
      },
      gbStudioActorID: sourceID,
      ...(prefabID ? { gbStudioPrefabID: prefabID } : {})
    }];
  });
  const runtimePlayerSources = [
    { sceneType: "topdown", sourceRuntime: "TOPDOWN" },
    { sceneType: "platformer", sourceRuntime: "PLATFORM" },
    { sceneType: "pointAndClick", sourceRuntime: "POINTNCLICK" }
  ];
  const importedPlayerActors = runtimePlayerSources.flatMap(({ sceneType: playerSceneType, sourceRuntime }) => {
    const spriteID = stringValue(defaultPlayerSprites[sourceRuntime]);
    const spriteSheet = sprites.spriteSheetByID.get(spriteID);
    const room = rooms.find((candidate) => candidate.sceneType === playerSceneType);
    if (!spriteID || !spriteSheet || !room || typeof room.name !== "string") return [];
    const isStartRoom = room.gbStudioSceneID === startSceneID;
    return [{
      id: `gb-player-${identifier(sourceRuntime, playerSceneType)}`,
      name: "Player",
      roomName: room.name,
      x: isStartRoom ? numberValue(settings?.startX) : 0,
      y: isStartRoom ? numberValue(settings?.startY) : 0,
      direction: isStartRoom ? sourceStringValue(settings?.startDirection, "down").toLowerCase() : "down",
      spriteSheet,
      animationStateID: sprites.firstStateBySpriteID.get(spriteID) ?? "",
      animationName: sprites.firstAnimationBySpriteID.get(spriteID) ?? "",
      eventBindings: {},
      gbStudioPlayerRuntime: sourceRuntime
    }];
  });

  const triggers = resources.filter((resource) => resourceType(resource) === "trigger").flatMap((resource, index) => {
    const owner = sceneOwner(resource, sceneResources);
    const ownerID = stringValue(owner?.value.id);
    const roomName = roomNamesByID.get(ownerID);
    if (!roomName) return [];
    const sourceID = stringValue(resource.value.id) || `trigger-${index + 1}`;
    const name = stringValue(resource.value.name) || identifier(resource.value.symbol, `Trigger_${index + 1}`);
    const baseName = identifier(resource.value.symbol, `trigger_${sourceID}`);
    const onEnterEventName = `${baseName}_on_enter`;
    const onLeaveEventName = `${baseName}_on_leave`;
    const onEnterEvent = convertScript(resource.value.script, {
      category: "Trigger",
      character: "Narrador",
      eventName: onEnterEventName,
      sourceResourceID: sourceID,
      roomName
    }, state);
    const onLeaveEvent = convertScript(resource.value.leaveScript, {
      category: "Trigger",
      character: "Narrador",
      eventName: onLeaveEventName,
      sourceResourceID: sourceID,
      roomName
    }, state);
    if (onEnterEvent) events.push(onEnterEvent);
    if (onLeaveEvent) events.push(onLeaveEvent);
    const sourceX = numberValue(resource.value.x);
    const sourceY = numberValue(resource.value.y);
    const sourceWidth = Math.max(1, numberValue(resource.value.width, 1));
    const sourceHeight = Math.max(1, numberValue(resource.value.height, 1));
    const x = sourceX;
    const y = sourceY;
    const width = sourceWidth;
    const height = sourceHeight;
    return [{
      id: `gb-trigger-${sourceID}`,
      name,
      roomName,
      x,
      y,
      width,
      height,
      eventBindings: {
        ...(onEnterEvent ? { onEnter: onEnterEventName } : {}),
        ...(onLeaveEvent ? { onLeave: onLeaveEventName } : {})
      },
      gbStudioTriggerID: sourceID
    }];
  });

  events.push(...state.generatedEvents);
  const unsupportedNativeVerbs = unsupportedNativeEventCommandVerbs(
    events.flatMap((event) => arrayValue(event.steps).filter(isRecord).map((step) => stringValue(step.command)))
  );
  for (const verb of unsupportedNativeVerbs) {
    diagnostics.push({
      code: "unsupported-event",
      message: `Comando nativo gerado sem suporte no exportador: ${verb}`,
      sourceCommand: verb,
      sourceEventID: "",
      sourceResourceID: "native-event-registry"
    });
    state.unsupportedEventCount += 1;
  }
  const firstRoom = rooms[0];
  return {
    rooms,
    actors: [...actors, ...importedPlayerActors],
    triggers,
    dialogues: state.dialogues,
    events,
    animations: sprites.animations,
    animationStates: sprites.states,
    audioItems: audio.items,
    variables: variables.items,
    defaultPlayerSpriteSheets,
    startRoomID: typeof firstRoom?.id === "string" ? firstRoom.id : "",
    startRoomName: typeof firstRoom?.name === "string" ? firstRoom.name : "",
    translatedEventCount: state.translatedEventCount,
    unsupportedEventCount: state.unsupportedEventCount,
    diagnostics
  };
}

function provenanceDocument(sourceProjectPath: string, assets: Record<string, unknown>[]): string {
  const assetLines = assets.map((asset) => {
    const metadata = isRecord(asset.metadata) ? asset.metadata : {};
    const provenance = stringValue(metadata.provenance);
    return provenance === "GBA Studio native"
      ? `- \`${String(metadata.source ?? asset.name ?? "asset")}\` - sprite colorido nativo do GBA Studio usado como substituto executavel.`
      : `- \`${String(metadata.source ?? asset.name ?? "asset")}\` - placeholder importado do GB Studio.`;
  });
  return [
    "# Procedencia dos assets importados",
    "",
    `Projeto de origem: \`${path.basename(sourceProjectPath)}\``,
    "",
    "Os arquivos abaixo foram importados como placeholder. Verifique a licenca especifica de cada asset antes de distribuir o jogo final.",
    "",
    ...assetLines,
    ""
  ].join("\n");
}

export async function importGBStudioProject(sourceProjectPath: string): Promise<GBStudioImportResult> {
  if (path.extname(sourceProjectPath).toLowerCase() !== ".gbsproj") {
    throw new Error("O importador do GB Studio requer um arquivo .gbsproj.");
  }

  const sourceRoot = path.dirname(sourceProjectPath);
  const manifestValue = JSON.parse(await readFile(sourceProjectPath, "utf8")) as unknown;
  if (!isRecord(manifestValue) || stringValue(manifestValue._resourceType) !== "project") {
    throw new Error("Manifesto .gbsproj invalido: recurso project esperado.");
  }

  const projectName = stringValue(manifestValue.name) || path.basename(sourceProjectPath, path.extname(sourceProjectPath));
  const resources = await loadResources(sourceRoot);
  const destinationRoot = await uniqueDestinationRoot(sourceRoot);
  const projectPath = path.join(destinationRoot, `${projectSlug(projectName)}.gba-project`);
  const warnings: string[] = [];

  await mkdir(path.join(destinationRoot, "Assets"), { recursive: true });
  const importedAssets = await materializeAssets(resources, destinationRoot, warnings);
  const data = createBlankProjectData({ name: projectName });
  const world = convertWorld(resources, importedAssets);
  data.assets = importedAssets;
  data.assetGroups = [];
  data.animations = world.animations;
  data.animationStates = world.animationStates;
  data.spriteReferenceImages = [];
  data.audioItems = world.audioItems;
  data.variables = world.variables;
  if (world.rooms.length > 0) {
    data.scenas = world.rooms;
    data.rooms = world.rooms;
    data.actors = world.actors;
    data.triggers = world.triggers;
    data.dialogues = world.dialogues;
    data.events = world.events;

    const editorState = isRecord(data.editorState) ? data.editorState : {};
    editorState.activeScenaID = world.startRoomID;
    editorState.activeScenaName = world.startRoomName;
    editorState.startScenaID = world.startRoomID;
    data.editorState = editorState;

    const settings = isRecord(data.settings) ? data.settings : {};
    const general = isRecord(settings.general) ? settings.general : {};
    const startRoom = world.rooms[0];
    general.author = stringValue(manifestValue.author) || "GB Studio User";
    general.startScene = world.startRoomName;
    general.startSceneType = typeof startRoom?.sceneType === "string" ? startRoom.sceneType : "topdown";
    settings.general = general;
    const sceneTypes = isRecord(settings.sceneTypes) ? settings.sceneTypes : {};
    const enabled = isRecord(sceneTypes.enabled) ? sceneTypes.enabled : {};
    for (const room of world.rooms) {
      if (typeof room.sceneType === "string") enabled[room.sceneType] = true;
    }
    sceneTypes.enabled = enabled;
    settings.sceneTypes = sceneTypes;
    const playerProjectileSprite = world.events.flatMap((event) => arrayValue(event.steps))
      .filter(isRecord)
      .map((step) => stringValue(step.command).split(/\s+/))
      .find((parts) => parts[0] === "launch_projectile" && parts[1] === "Player" && parts[4])?.[4];
    const enemyProjectileSprite = world.events.flatMap((event) => arrayValue(event.steps))
      .filter(isRecord)
      .map((step) => stringValue(step.command).split(/\s+/))
      .find((parts) => parts[0] === "launch_projectile" && parts[1] !== "Player" && parts[4])?.[4];
    const shmup = isRecord(settings.shmup) ? settings.shmup : {};
    const topdown = isRecord(settings.topdown) ? settings.topdown : {};
    const platformer = isRecord(settings.platformer) ? settings.platformer : {};
    const pointAndClick = isRecord(settings.pointAndClick) ? settings.pointAndClick : {};
    if (world.defaultPlayerSpriteSheets.TOPDOWN) topdown.playerSprite = world.defaultPlayerSpriteSheets.TOPDOWN;
    if (world.defaultPlayerSpriteSheets.PLATFORM) platformer.playerSprite = world.defaultPlayerSpriteSheets.PLATFORM;
    if (world.defaultPlayerSpriteSheets.POINTNCLICK) pointAndClick.cursorImage = world.defaultPlayerSpriteSheets.POINTNCLICK;
    if (world.defaultPlayerSpriteSheets.SHMUP) shmup.playerSprite = world.defaultPlayerSpriteSheets.SHMUP;
    if (playerProjectileSprite) shmup.projectileSprite = playerProjectileSprite;
    if (enemyProjectileSprite) shmup.enemyProjectileSprite = enemyProjectileSprite;
    settings.topdown = topdown;
    settings.platformer = platformer;
    settings.pointAndClick = pointAndClick;
    settings.shmup = shmup;
    data.settings = settings;
  }
  data.gbStudioImport = {
    sourceVersion: stringValue(manifestValue._version),
    sourceRelease: stringValue(manifestValue._release),
    sourceAuthor: stringValue(manifestValue.author),
    sourceProjectFile: path.basename(sourceProjectPath),
    importedAt: new Date().toISOString(),
    resourceCount: resources.length,
    placeholderAssetCount: importedAssets.filter((asset) => isRecord(asset.metadata) && asset.metadata.placeholder === true).length,
    translatedEventCount: world.translatedEventCount,
    unsupportedEventCount: world.unsupportedEventCount,
    diagnostics: world.diagnostics
  };

  const project = parseGBAProjectFile(JSON.stringify(data));
  await writeFile(projectPath, serializeGBAProjectFile(project), "utf8");
  await writeFile(path.join(destinationRoot, "ASSET_PROVENANCE.md"), provenanceDocument(sourceProjectPath, importedAssets), "utf8");
  await writeFile(path.join(destinationRoot, "LICENSE-GB-STUDIO-MIT.txt"), GB_STUDIO_MIT_LICENSE, "utf8");

  return {
    sourceProjectPath,
    projectPath,
    project,
    report: {
      resourceCount: resources.length,
      copiedAssetCount: importedAssets.length,
      sourceVersion: stringValue(manifestValue._version),
      warnings,
      translatedEventCount: world.translatedEventCount,
      unsupportedEventCount: world.unsupportedEventCount,
      diagnostics: world.diagnostics
    }
  };
}
