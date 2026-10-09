import { hasPagedWorldMap, PAGED_WORLD_MAP } from './pagedWorldMap.js';
import { projectBudgetSceneGroupName, type AssetPackBudgetReport } from "./projectBudget.js";
import type { GBAProjectData } from "./projectFile.js";
import {
  resolveSceneCapabilityManifest,
  type ScenePhysicalBudget
} from "./sceneFeatureModules.js";
import { gbaSpriteOamEntriesForPixels } from "./gbaRendering.js";
import { expandSceneMetatileAuthoring } from "./sceneMetatileContract.js";
import { scenePreflightProfile } from "./scenePreflight.js";
import { estimateComposedAudioPhysicalBytes } from "./audioPhysicalBudget.js";
import { normalizeIsometricTacticalPresentation, type IsoTacticalPresentationConfig } from "./isometricTacticalPresentation.js";

export const SCENE_PHYSICAL_METRIC_IDS = [
  "bgTiles",
  "objTiles",
  "oam",
  "paletteColors",
  "vramBytes",
  "eventBytes",
  "audioBytes",
  "dmaBytes",
  "vblankTicks",
  "cpuWorkTicks"
] as const;

export type ScenePhysicalMetricID = typeof SCENE_PHYSICAL_METRIC_IDS[number];
export type ScenePhysicalMetricUnit = "tiles" | "objects" | "colors" | "bytes" | "ticks";
export type ScenePhysicalTone = "ok" | "warning" | "error";

export interface ScenePhysicalMetric {
  id: ScenePhysicalMetricID;
  label: string;
  unit: ScenePhysicalMetricUnit;
  estimate: number | null;
  planned: number | null;
  measured: number | null;
  safeLimit: number;
  warningLimit: number;
  overflow: number;
  criticalOverflow: boolean;
  tone: ScenePhysicalTone;
}

export interface ScenePhysicalDiagnostics {
  sceneName: string;
  sceneType: string;
  metrics: ScenePhysicalMetric[];
  criticalOverflow: boolean;
  estimatedOverflow: boolean;
  plannedOverflow: boolean;
  measuredOverflow: boolean;
  measuredMetricCount: number;
  catalog: ScenePhysicalMetricValues;
  resident: ScenePhysicalMetricValues;
}

export type ScenePhysicalMetricValues = Partial<Record<ScenePhysicalMetricID, number | null>>;

export interface ScenePhysicalDiagnosticsOptions {
  assetPackReport?: AssetPackBudgetReport | null;
  planned?: ScenePhysicalMetricValues;
  measured?: ScenePhysicalMetricValues;
}

interface SceneRecord {
  [key: string]: unknown;
}

const METRIC_META: Record<ScenePhysicalMetricID, Pick<ScenePhysicalMetric, "label" | "unit">> = {
  bgTiles: { label: "Tiles BG", unit: "tiles" },
  objTiles: { label: "Tiles OBJ", unit: "tiles" },
  oam: { label: "OAM", unit: "objects" },
  paletteColors: { label: "Paletas", unit: "colors" },
  vramBytes: { label: "VRAM", unit: "bytes" },
  eventBytes: { label: "Eventos", unit: "bytes" },
  audioBytes: { label: "Áudio", unit: "bytes" },
  dmaBytes: { label: "DMA", unit: "bytes" },
  vblankTicks: { label: "VBlank", unit: "ticks" },
  cpuWorkTicks: { label: "CPU", unit: "ticks" }
};

function isRecord(value: unknown): value is SceneRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(data: GBAProjectData, key: string): SceneRecord[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function finiteNonnegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = finiteNonnegative(value);
  return number !== null && number > 0 ? number : fallback;
}

function sceneRecords(data: GBAProjectData): SceneRecord[] {
  const scenes = records(data, "scenas");
  return scenes.length > 0 ? scenes : records(data, "rooms");
}

function sceneName(scene: SceneRecord | undefined, fallback = "Cena ativa"): string {
  return stringValue(scene?.name) ?? stringValue(scene?.id) ?? fallback;
}

function sceneByName(data: GBAProjectData, requestedName: string): SceneRecord | undefined {
  const scenes = sceneRecords(data);
  return scenes.find((scene) => sceneName(scene) === requestedName || stringValue(scene.id) === requestedName) ?? scenes[0];
}

function sceneType(scene: SceneRecord | undefined): string {
  return stringValue(scene?.sceneType) ?? stringValue(scene?.type) ?? "topdown";
}

function sceneRuntimeConfig(scene: SceneRecord | undefined): SceneRecord {
  const runtime = isRecord(scene?.runtime) ? scene.runtime : undefined;
  return isRecord(runtime?.config) ? runtime.config : {};
}

function scenePreflightBudget(scene: SceneRecord | undefined): ScenePhysicalBudget {
  const config = sceneRuntimeConfig(scene);
  const configuredProfile = isRecord(scene?.preflight)
    ? scene.preflight.profileId
    : isRecord(config.preflight) ? config.preflight.profileId : config.preflightProfile;
  const profile = configuredProfile ?? (
    sceneType(scene) === "isometric" && config.gameplayMode === "tactical" ? "tacticalGrid" : undefined
  );
  return scenePreflightProfile(sceneType(scene), profile).budget;
}

function entitySceneName(entity: SceneRecord): string | null {
  return stringValue(entity.roomName) ?? stringValue(entity.sceneName) ?? stringValue(entity.room);
}

function sceneEntities(data: GBAProjectData, key: "actors" | "triggers", name: string): SceneRecord[] {
  return records(data, key).filter((entity) => entitySceneName(entity) === name);
}

function tilemaps(scene: SceneRecord | undefined): number[][] {
  if (!scene) return [];
  const layers = Array.isArray(scene.tileLayers) ? scene.tileLayers.filter(isRecord) : [];
  const layerMaps = layers
    .map((layer) => Array.isArray(layer.tilemap) ? layer.tilemap.filter((tile): tile is number => typeof tile === "number") : [])
    .filter((tilemap) => tilemap.length > 0);
  if (layerMaps.length > 0) return layerMaps;
  return [Array.isArray(scene.tilemap) ? scene.tilemap.filter((tile): tile is number => typeof tile === "number") : []];
}

function animationForActor(data: GBAProjectData, actor: SceneRecord): SceneRecord | undefined {
  const spriteSheet = stringValue(actor.spriteSheet);
  const animationName = stringValue(actor.animationName) ?? stringValue(actor.animation);
  const animations = records(data, "animations");
  return animations.find((candidate) => (
    spriteSheet !== null
      && animationName !== null
      && stringValue(candidate.spriteSheet) === spriteSheet
      && stringValue(candidate.name) === animationName
  ))
    ?? animations.find((candidate) => (
      spriteSheet !== null && stringValue(candidate.spriteSheet) === spriteSheet
    ))
    ?? animations.find((candidate) => (
      animationName !== null && stringValue(candidate.name) === animationName
    ));
}

function actorObjectCount(data: GBAProjectData, actor: SceneRecord): number {
  const animation = animationForActor(data, actor);
  const width = positiveInteger(animation?.frameWidth, 8);
  const height = positiveInteger(animation?.frameHeight, 8);
  return Math.max(1, Math.ceil(width / 8) * Math.ceil(height / 8));
}

function actorOamCount(data: GBAProjectData, actor: SceneRecord): number {
  const animation = animationForActor(data, actor);
  const width = positiveInteger(animation?.frameWidth, 8);
  const height = positiveInteger(animation?.frameHeight, 8);
  const frames = Array.isArray(animation?.frames) ? animation.frames.filter(isRecord) : [];
  const explicitCounts = frames
    .map((frame) => Array.isArray(frame.tiles) ? frame.tiles.length : 0)
    .filter((count) => count > 0);
  return explicitCounts.length > 0
    ? Math.max(...explicitCounts)
    : gbaSpriteOamEntriesForPixels(width, height);
}

function eventCommands(event: SceneRecord): unknown[] {
  if (Array.isArray(event.commands) && event.commands.length > 0) return event.commands;
  if (Array.isArray(event.steps) && event.steps.length > 0) return event.steps;
  const command = stringValue(event.command);
  return command ? [command] : [];
}

function eventCommandCount(data: GBAProjectData, sceneNameValue: string): number {
  return records(data, "events")
    .filter((event) => {
      const eventName = entitySceneName(event);
      return eventName === null || eventName === sceneNameValue;
    })
    .reduce((total, event) => {
      return total + eventCommands(event).length;
    }, 0);
}

function audioReferenceMatches(audio: SceneRecord, reference: string): boolean {
  return [audio.name, audio.id, audio.exportID].some((value) => stringValue(value) === reference);
}

function sceneIdentifiers(scene: SceneRecord | undefined, name: string): Set<string> {
  return new Set([name, stringValue(scene?.name), stringValue(scene?.id)].filter((value): value is string => value !== null));
}

function eventCommandStrings(event: SceneRecord): string[] {
  return eventCommands(event).flatMap((command) => {
    if (typeof command === "string") return [command];
    return isRecord(command)
      ? [stringValue(command.command)].filter((value): value is string => value !== null)
      : [];
  });
}

function commandOperand(command: string, verbs: string[]): string | null {
  const parts = command.split(/\s+/).filter(Boolean);
  return verbs.includes(parts[0] ?? "") ? stringValue(parts[1]) : null;
}

function dialogueKey(dialogue: SceneRecord): string | null {
  return stringValue(dialogue.key) ?? stringValue(dialogue.id) ?? stringValue(dialogue.name);
}

function sceneAudioItemIndexes(
  data: GBAProjectData,
  scene: SceneRecord | undefined,
  name: string
): Set<number> {
  const audioItems = records(data, "audioItems");
  const sceneNames = sceneIdentifiers(scene, name);
  const indexes = new Set<number>();
  const addReference = (reference: unknown): void => {
    const value = stringValue(reference);
    if (!value) return;
    const index = audioItems.findIndex((audio) => audioReferenceMatches(audio, value));
    if (index >= 0) indexes.add(index);
  };

  addReference(scene?.music);
  addReference(sceneRuntimeConfig(scene).music);
  const tacticalPresentation = normalizeIsometricTacticalPresentation(sceneRuntimeConfig(scene).tacticalPresentation);
  addReference(tacticalPresentation.audio?.music);
  Object.values(tacticalPresentation.audio?.cues ?? {}).forEach(addReference);

  audioItems.forEach((audio, index) => {
    const assignedScene = stringValue(audio.assignedScene);
    if (assignedScene && sceneNames.has(assignedScene)) indexes.add(index);
  });

  const referencedDialogues = new Set<string>();
  records(data, "events")
    .filter((event) => {
      const owner = entitySceneName(event);
      return owner === null || sceneNames.has(owner);
    })
    .forEach((event) => {
      eventCommandStrings(event).forEach((command) => {
        addReference(commandOperand(command, ["play_music", "play_sfx", "set_text_sfx"]));
        const dialogue = commandOperand(command, ["show_dialogue", "show_choice", "show_dialogue_speaker"]);
        if (dialogue) referencedDialogues.add(dialogue);
      });
    });

  records(data, "dialogues").forEach((dialogue) => {
    const owner = entitySceneName(dialogue);
    const key = dialogueKey(dialogue);
    const belongsToScene = owner !== null && sceneNames.has(owner);
    const isReferencedByScene = key !== null && referencedDialogues.has(key);
    if (!belongsToScene && !isReferencedByScene) return;
    addReference(dialogue.textSound);
    addReference(dialogue.confirmSound);
  });

  return indexes;
}

function audioBytes(data: GBAProjectData, scene: SceneRecord | undefined, name: string): number {
  return [...sceneAudioItemIndexes(data, scene, name)].reduce((total, index) => {
    const audio = records(data, "audioItems")[index];
    const bytes = finiteNonnegative(audio.byteLength)
      ?? finiteNonnegative(audio.bytes)
      ?? finiteNonnegative(audio.sizeBytes)
      ?? finiteNonnegative(audio.pcmBytes)
      ?? finiteNonnegative(audio.sampleCount);
    return total + (bytes ?? estimateComposedAudioPhysicalBytes(audio) ?? 0);
  }, 0);
}

function assetMetadata(asset: SceneRecord): SceneRecord {
  return isRecord(asset.metadata) ? asset.metadata : asset;
}

function assetTileCount(asset: SceneRecord): number {
  const metadata = assetMetadata(asset);
  const direct = finiteNonnegative(metadata.tileCount);
  if (direct !== null) return direct;
  const optimizer = isRecord(metadata.backgroundTileOptimizer) ? metadata.backgroundTileOptimizer : {};
  const optimized = finiteNonnegative(optimizer.tileBudget);
  if (optimized !== null) return optimized;
  const width = positiveInteger(metadata.width, 0);
  const height = positiveInteger(metadata.height, 0);
  return width > 0 && height > 0 ? Math.ceil(width / 8) * Math.ceil(height / 8) : 0;
}

function assetTileBytes(asset: SceneRecord): number {
  const metadata = assetMetadata(asset);
  const bitsPerPixel = finiteNonnegative(metadata.bpp) ?? finiteNonnegative(metadata.bitsPerPixel);
  const colorMode = stringValue(metadata.colorMode)?.toLowerCase() ?? "";
  return bitsPerPixel !== null ? (bitsPerPixel >= 8 ? 64 : 32) : colorMode.includes("8") ? 64 : 32;
}

function assetPaletteColors(asset: SceneRecord): number {
  const metadata = assetMetadata(asset);
  const paletteBanks = finiteNonnegative(metadata.paletteBankCount);
  const visibleColors = finiteNonnegative(metadata.maxVisibleColors);
  const colorsFromBanks = paletteBanks !== null ? paletteBanks * 16 : 0;
  const colorsFromVisible = visibleColors !== null && visibleColors > 0
    ? Math.ceil(visibleColors / 16) * 16
    : 0;
  return Math.max(16, colorsFromBanks, colorsFromVisible);
}

function sceneAssetReferenceNames(scene: SceneRecord | undefined): string[] {
  const names = [scene?.backgroundAssetName, scene?.background, scene?.tilesetAssetName, scene?.backgroundAssetId];
  const layers = Array.isArray(scene?.tileLayers) ? scene.tileLayers.filter(isRecord) : [];
  layers.forEach((layer) => {
    names.push(layer.assetName, layer.tilesetAssetName, layer.sourceAssetName);
    if (Array.isArray(layer.tileSourceAssetNames)) names.push(...layer.tileSourceAssetNames);
  });
  const runtimeConfig = sceneRuntimeConfig(scene);
  names.push(runtimeConfig.hudAssetName, runtimeConfig.hudAssetId);
  return Array.from(new Set(names.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())));
}

function sceneAssetCosts(data: GBAProjectData, scene: SceneRecord | undefined): {
  bgTiles: number;
  tileBytes: number;
  paletteColors: number;
} {
  const references = sceneAssetReferenceNames(scene);
  const usedAssets = new Set<string>();
  return references.reduce((total, reference) => {
    const asset = records(data, "assets").find((candidate) => (
      [candidate.name, candidate.id, candidate.exportID].some((value) => stringValue(value) === reference)
    ));
    if (!asset) return total;
    const metadata = assetMetadata(asset);
    const kind = (stringValue(asset.kind) ?? stringValue(metadata.kind) ?? "").toLowerCase();
    if (["audio", "music", "musica", "sfx", "pcm", "tracker"].includes(kind)) return total;
    const identity = stringValue(asset.id) ?? stringValue(asset.name) ?? reference;
    if (usedAssets.has(identity)) return total;
    usedAssets.add(identity);
    if (metadata.kind === 'paged_bg' && hasPagedWorldMap(data, scene)) {
      return {bgTiles:total.bgTiles+PAGED_WORLD_MAP.tileUnits,
        tileBytes:total.tileBytes+PAGED_WORLD_MAP.tileBytes,
        paletteColors:total.paletteColors+PAGED_WORLD_MAP.paletteColors};
    }
    const tiles = assetTileCount(asset);
    const bytesPerTile = assetTileBytes(asset);
    return {
      bgTiles: total.bgTiles + tiles,
      tileBytes: total.tileBytes + tiles * bytesPerTile,
      paletteColors: total.paletteColors + assetPaletteColors(asset)
    };
  }, { bgTiles: 0, tileBytes: 0, paletteColors: 0 });
}

function editorEstimate(data: GBAProjectData, scene: SceneRecord | undefined, name: string): Record<ScenePhysicalMetricID, number | null> {
  const sceneTilemaps = tilemaps(scene);
  const uniqueBgTiles = new Set(sceneTilemaps.flat().filter((tile) => tile > 0));
  const actors = sceneEntities(data, "actors", name);
  const triggers = sceneEntities(data, "triggers", name);
  const objTiles = actors.reduce((total, actor) => total + actorObjectCount(data, actor), 0);
  const oam = actors.reduce((total, actor) => total + actorOamCount(data, actor), 0);
  const bgPaletteBanks = sceneTilemaps.filter((tilemap) => tilemap.some((tile) => tile > 0)).length;
  const spriteSheets = new Set(actors.map((actor) => stringValue(actor.spriteSheet)).filter(Boolean));
  const visualAssets = sceneAssetCosts(data, scene);
  const bgTiles = visualAssets.bgTiles > 0 ? visualAssets.bgTiles : uniqueBgTiles.size;
  const bgTileBytes = visualAssets.tileBytes > 0 ? visualAssets.tileBytes : uniqueBgTiles.size * 32;
  const bgPaletteColors = visualAssets.paletteColors > 0 ? visualAssets.paletteColors : bgPaletteBanks * 16;
  const paletteColors = bgPaletteColors + (spriteSheets.size * 16);
  const commandCount = eventCommandCount(data, name);
  const eventBytes = commandCount * 12;
  const cpuWorkTicks = 120
    + Math.ceil(sceneTilemaps.flat().filter((tile) => tile > 0).length / 4)
    + oam * 8
    + triggers.length * 12
    + commandCount * 4;
  const dmaBytes = bgTileBytes + objTiles * 32 + paletteColors * 2 + oam * 8;
  const baseEstimate: Record<ScenePhysicalMetricID, number | null> = {
    bgTiles,
    objTiles,
    oam,
    paletteColors,
    vramBytes: bgTileBytes + objTiles * 32,
    eventBytes,
    audioBytes: audioBytes(data, scene, name),
    dmaBytes,
    vblankTicks: null,
    cpuWorkTicks
  };
  const expansion = expandSceneMetatileAuthoring(
    sceneRuntimeConfig(scene).metatiles,
    positiveInteger(scene?.width, 0),
    positiveInteger(scene?.height, 0)
  );
  if (!expansion) return baseEstimate;

  const baseObjectVramBytes = objTiles * 32;
  const baseObjectDmaBytes = baseObjectVramBytes + paletteColors * 2 + oam * 8;
  return {
    ...baseEstimate,
    bgTiles: expansion.cost.bgTiles,
    paletteColors: Math.max(expansion.cost.paletteColors, paletteColors),
    vramBytes: expansion.cost.vramBytes + baseObjectVramBytes,
    eventBytes: eventBytes + expansion.cost.eventBytes,
    audioBytes: (baseEstimate.audioBytes ?? 0) + expansion.cost.audioBytes,
    dmaBytes: expansion.cost.dmaBytes + baseObjectDmaBytes,
    vblankTicks: expansion.cost.vblankTicks,
    cpuWorkTicks: cpuWorkTicks + expansion.cost.cpuWorkTicks
  };
}

function addMetricBudget(
  target: ScenePhysicalMetricValues,
  budget: ScenePhysicalBudget
): void {
  for (const id of SCENE_PHYSICAL_METRIC_IDS) {
    target[id] = (target[id] ?? 0) + budget[id];
  }
}

function addMetricValue(
  target: ScenePhysicalMetricValues,
  id: ScenePhysicalMetricID,
  value: number
): void {
  target[id] = (target[id] ?? 0) + Math.max(0, Math.floor(value));
}

function tacticalUnitActor(
  actors: SceneRecord[],
  actorID: string,
  fallback: SceneRecord | undefined
): SceneRecord | undefined {
  const normalizedID = actorID.trim().toLowerCase();
  return actors.find((actor) => (
    [actor.id, actor.name].some((value) => stringValue(value)?.toLowerCase() === normalizedID)
  )) ?? fallback;
}

function tacticalPresentationPlan(
  data: GBAProjectData,
  scene: SceneRecord | undefined,
  name: string,
  capabilityID: string
): ScenePhysicalMetricValues {
  const config = sceneRuntimeConfig(scene);
  const presentation: IsoTacticalPresentationConfig = normalizeIsometricTacticalPresentation(config.tacticalPresentation);
  const sceneTilemaps = tilemaps(scene);
  const uniqueBgTiles = new Set(sceneTilemaps.flat().filter((tile) => tile > 0));
  const actors = sceneEntities(data, "actors", name);
  const triggers = sceneEntities(data, "triggers", name);
  const commands = eventCommandCount(data, name);
  const planned: ScenePhysicalMetricValues = {};
  const addVisual = (tiles: number, palette: number, dmaExtra = 0, cpu = 0, vblank = 0): void => {
    addMetricValue(planned, "bgTiles", tiles);
    addMetricValue(planned, "paletteColors", palette);
    addMetricValue(planned, "vramBytes", tiles * 32);
    addMetricValue(planned, "dmaBytes", tiles * 32 + dmaExtra);
    addMetricValue(planned, "cpuWorkTicks", cpu);
    addMetricValue(planned, "vblankTicks", vblank);
  };
  const addObjects = (tiles: number, objects: number, palette: number, cpu: number, vblank: number): void => {
    addMetricValue(planned, "objTiles", tiles);
    addMetricValue(planned, "oam", objects);
    addMetricValue(planned, "paletteColors", palette);
    addMetricValue(planned, "vramBytes", tiles * 32);
    addMetricValue(planned, "dmaBytes", tiles * 32 + objects * 8);
    addMetricValue(planned, "cpuWorkTicks", cpu);
    addMetricValue(planned, "vblankTicks", vblank);
  };

  if (capabilityID === "tactical_surface") {
    addVisual(Math.max(1, Math.min(256, uniqueBgTiles.size)), 16, 0, 24, 16);
  } else if (capabilityID === "tactical_grid_overlay") {
    const cells = positiveInteger(scene?.width, 1) * positiveInteger(scene?.height, 1);
    addVisual(Math.max(1, Math.min(128, cells)), 16, 0, Math.min(120, cells), 16);
  } else if (capabilityID === "tactical_hud") {
    addVisual(32, 16, commands * 4, 40 + commands * 4, 12);
    addMetricValue(planned, "eventBytes", Math.max(256, commands * 12));
  } else if (capabilityID === "tactical_units") {
    const units = presentation.units.length > 0
      ? presentation.units
      : actors.map((actor) => ({ actorId: stringValue(actor.id) ?? stringValue(actor.name) ?? "", sheet: stringValue(actor.spriteSheet) ?? "" }));
    const fallbackActor = actors[0];
    const sheets = new Map<string, number>();
    units.forEach((unit, index) => {
      const actor = tacticalUnitActor(actors, unit.actorId, fallbackActor);
      const sheet = unit.sheet || stringValue(actor?.spriteSheet) || `unit-${index}`;
      if (!sheets.has(sheet)) sheets.set(sheet, actor ? actorObjectCount(data, actor) : 4);
    });
    const objTiles = [...sheets.values()].reduce((total, value) => total + Math.min(64, Math.max(4, value)), 0);
    addObjects(objTiles, Math.min(64, units.length * 4), Math.min(64, Math.max(16, sheets.size * 16)), units.length * 16, 24);
  } else if (capabilityID === "tactical_props") {
    const props = presentation.props.length > 0 ? presentation.props : triggers;
    const assets = new Set(props.map((prop) => (
      stringValue(prop.asset)
        ?? (isRecord(prop) ? stringValue(prop.name) : null)
        ?? "prop"
    )));
    addObjects(Math.max(4, assets.size * 4), Math.min(64, props.length), Math.min(64, Math.max(16, assets.size * 4)), props.length * 8, 12);
  } else if (capabilityID === "tactical_feedback") {
    const feedbackAssets = [presentation.cursorAsset, presentation.rangeAsset, presentation.targetAsset, presentation.emotesAsset, presentation.feedbackAsset]
      .filter((asset): asset is string => Boolean(asset));
    const assetCount = Math.max(1, new Set(feedbackAssets).size);
    addObjects(assetCount * 4, Math.min(24, assetCount), Math.min(64, assetCount * 4), assetCount * 12, 12);
    addMetricValue(planned, "eventBytes", 256 + assetCount * 32);
  } else if (capabilityID === "tactical_audio") {
    addMetricValue(planned, "audioBytes", audioBytes(data, scene, name));
    addMetricValue(planned, "eventBytes", 256);
    addMetricValue(planned, "cpuWorkTicks", 24);
  }
  return planned;
}

function enabledCapabilityPlan(
  scene: SceneRecord | undefined,
  type: string,
  data: GBAProjectData,
  name: string
): ScenePhysicalMetricValues {
  const runtimeConfig = sceneRuntimeConfig(scene);
  const manifest = resolveSceneCapabilityManifest(
    type,
    runtimeConfig.modules,
    undefined,
    runtimeConfig.capabilities,
    runtimeConfig.tacticalCapabilities
  );
  const expansion = expandSceneMetatileAuthoring(
    runtimeConfig.metatiles,
    positiveInteger(scene?.width, 0),
    positiveInteger(scene?.height, 0)
  );
  const planned: ScenePhysicalMetricValues = {};
  manifest.capabilities
    .filter((capability) => capability.status.enabled)
    .forEach((capability) => {
      if (capability.id.startsWith("tactical_")) {
        const tacticalPlan = tacticalPresentationPlan(data, scene, name, capability.id);
        for (const id of SCENE_PHYSICAL_METRIC_IDS) {
          const value = metricValue(tacticalPlan, id);
          if (value !== null) addMetricValue(planned, id, value);
        }
        return;
      }
      addMetricBudget(planned, capability.id === "metatiles" && expansion ? expansion.cost : capability.budget);
    });
  return planned;
}

function mergeMetricValues(...values: ScenePhysicalMetricValues[]): ScenePhysicalMetricValues {
  const merged: ScenePhysicalMetricValues = {};
  for (const id of SCENE_PHYSICAL_METRIC_IDS) {
    const numbers = values
      .map((value) => metricValue(value, id))
      .filter((value): value is number => value !== null);
    if (numbers.length > 0) merged[id] = numbers.reduce((total, value) => total + value, 0);
  }
  return merged;
}

function reportValue(resources: Record<string, unknown>, names: string[]): number | null {
  for (const name of names) {
    const resource = resources[name];
    if (typeof resource === "number") return finiteNonnegative(resource);
    if (!isRecord(resource)) continue;
    for (const key of ["planned", "requested", "allocated", "used", "count", "bytes"]) {
      const value = finiteNonnegative(resource[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function audioPhysicalPlanKeys(audio: SceneRecord, index: number): string[] {
  return Array.from(new Set([
    stringValue(audio.id),
    stringValue(audio.exportID),
    stringValue(audio.name),
    `audio:${index}`
  ].filter((value): value is string => value !== null)));
}

function exporterAudioPlanValue(
  report: AssetPackBudgetReport,
  data: GBAProjectData,
  scene: SceneRecord | undefined,
  name: string
): number | null {
  const audioByItem = report.physical_budget?.audio_bytes_by_item;
  if (!audioByItem) return null;

  const audioItems = records(data, "audioItems");
  const indexes = [...sceneAudioItemIndexes(data, scene, name)];
  if (indexes.length === 0) return 0;

  let total = 0;
  for (const index of indexes) {
    const audio = audioItems[index];
    if (!audio) return null;
    const key = audioPhysicalPlanKeys(audio, index).find((candidate) => (
      finiteNonnegative(audioByItem[candidate]) !== null
    ));
    if (!key) return null;
    total += finiteNonnegative(audioByItem[key]) ?? 0;
  }
  return total;
}

function compilerPlan(
  report: AssetPackBudgetReport | null | undefined,
  data: GBAProjectData,
  scene: SceneRecord | undefined,
  name: string
): ScenePhysicalMetricValues {
  if (!report) return {};
  const expectedGroupName = projectBudgetSceneGroupName(name);
  const resident = (report.resident_pressure_report ?? []).find((candidate) => (
    candidate.id === name || candidate.room === name
  ));
  const pressureReports = resident
    ? [resident]
    : [...(report.room_pressure_report ?? []), ...(report.group_pressure_report ?? [])];
  const room = pressureReports.find((candidate) => candidate.name === name || candidate.name === expectedGroupName)
    ?? (pressureReports.length === 1 ? pressureReports[0] : undefined);
  const resources = room?.resources ?? {};
  const bgTiles = reportValue(resources, ["bg_tiles", "background_tiles"]);
  const objTiles = reportValue(resources, ["obj_tiles", "object_tiles", "sprite_tiles"]);
  const oam = reportValue(resources, ["oam", "oam_sprites", "sprites"]);
  const bgPalette = reportValue(resources, ["bg_palette_colors", "bg_palette"]);
  const objPalette = reportValue(resources, ["obj_palette_colors", "obj_palette"]);
  const audio = reportValue(resources, ["pcm_bytes", "audio_bytes"])
    ?? exporterAudioPlanValue(report, data, scene, name);
  const dma = reportValue(resources, ["dma_bytes", "vblank_dma_bytes"]);
  const planned: ScenePhysicalMetricValues = {
    bgTiles,
    objTiles,
    oam,
    paletteColors: bgPalette === null && objPalette === null ? null : (bgPalette ?? 0) + (objPalette ?? 0),
    vramBytes: bgTiles === null && objTiles === null ? null : (bgTiles ?? 0) * 32 + (objTiles ?? 0) * 32,
    audioBytes: audio,
    dmaBytes: dma ?? (bgTiles === null && objTiles === null ? null : (bgTiles ?? 0) * 32 + (objTiles ?? 0) * 32),
    eventBytes: null,
    vblankTicks: null,
    cpuWorkTicks: null
  };
  return planned;
}

function catalogPlan(report: AssetPackBudgetReport | null | undefined, name: string): ScenePhysicalMetricValues {
  const candidate = (report?.catalog_pressure_report ?? []).find((item) => item.name === name);
  const resources = candidate?.resources ?? {};
  const bgTiles = reportValue(resources, ["bg_tiles", "background_tiles"]);
  const objTiles = reportValue(resources, ["obj_tiles", "object_tiles", "sprite_tiles"]);
  const bgPalette = reportValue(resources, ["bg_palette_colors", "bg_palette"]);
  const objPalette = reportValue(resources, ["obj_palette_colors", "obj_palette"]);
  return {
    bgTiles,
    objTiles,
    paletteColors: bgPalette === null && objPalette === null ? null : (bgPalette ?? 0) + (objPalette ?? 0),
    vramBytes: bgTiles === null && objTiles === null ? null : (bgTiles ?? 0) * 32 + (objTiles ?? 0) * 32
  };
}

function metricValue(values: ScenePhysicalMetricValues, id: ScenePhysicalMetricID): number | null {
  return values[id] === undefined ? null : finiteNonnegative(values[id]);
}

function metricTone(
  estimate: number | null,
  planned: number | null,
  measured: number | null,
  safeLimit: number,
  percent: number
): ScenePhysicalTone {
  const criticalOverflow = [planned, measured].some((value) => value !== null && value > safeLimit);
  if (criticalOverflow) return "error";
  if (estimate !== null && estimate > safeLimit) return "warning";
  if (percent >= 80) return "warning";
  return "ok";
}

export function deriveScenePhysicalDiagnostics(
  data: GBAProjectData,
  requestedSceneName?: string,
  options: ScenePhysicalDiagnosticsOptions = {}
): ScenePhysicalDiagnostics {
  const scene = sceneByName(data, requestedSceneName ?? "");
  const name = requestedSceneName ?? sceneName(scene);
  const type = sceneType(scene);
  const baseBudget = scenePreflightBudget(scene);
  const profileBudget = hasPagedWorldMap(data, scene) ? {...baseBudget, bgTiles:PAGED_WORLD_MAP.maxTileUnits, dmaBytes:PAGED_WORLD_MAP.dmaBudget} : baseBudget;
  const estimate = editorEstimate(data, scene, name);
  const resident = compilerPlan(options.assetPackReport, data, scene, name);
  const catalog = catalogPlan(options.assetPackReport, name);
  const planned = {
    ...mergeMetricValues(
      resident,
      enabledCapabilityPlan(scene, type, data, name)
    ),
    ...(options.planned ?? {})
  };
  const measured = options.measured ?? {};
  const metrics = SCENE_PHYSICAL_METRIC_IDS.map((id): ScenePhysicalMetric => {
    const safeLimit = profileBudget[id];
    const estimateValue = finiteNonnegative(estimate[id]);
    const plannedValue = metricValue(planned, id);
    const measuredValue = metricValue(measured, id);
    const observedValues = [estimateValue, plannedValue, measuredValue].filter((value): value is number => value !== null);
    const highest = observedValues.length > 0 ? Math.max(...observedValues) : 0;
    const overflow = Math.max(0, highest - safeLimit);
    const criticalOverflow = [plannedValue, measuredValue].some((value) => value !== null && value > safeLimit);
    const percent = safeLimit > 0 ? (highest / safeLimit) * 100 : 0;
    return {
      id,
      ...METRIC_META[id],
      estimate: estimateValue,
      planned: plannedValue,
      measured: measuredValue,
      safeLimit,
      warningLimit: Math.round(safeLimit * 0.8),
      overflow,
      criticalOverflow,
      tone: metricTone(estimateValue, plannedValue, measuredValue, safeLimit, percent)
    };
  });
  return {
    sceneName: name,
    sceneType: type,
    metrics,
    criticalOverflow: metrics.some((metric) => metric.criticalOverflow),
    estimatedOverflow: metrics.some((metric) => metric.estimate !== null && metric.estimate > metric.safeLimit),
    plannedOverflow: metrics.some((metric) => metric.planned !== null && metric.planned > metric.safeLimit),
    measuredOverflow: metrics.some((metric) => metric.measured !== null && metric.measured > metric.safeLimit),
    measuredMetricCount: metrics.filter((metric) => metric.measured !== null).length,
    catalog,
    resident
  };
}
