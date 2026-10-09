import { spriteColorModeForSheet } from "./spriteColorDepth.js";
import { decomposeGbaMetaspriteFrame } from "./gbaMetaspriteLayout.js";
import { resolveAudioInstrumentComposition } from "./audioInstruments.js";
import type { GBAProjectData } from "./projectFile.js";
import { usesBlankPlayerDefaults } from "./blankPlayerDefaults.js";
import { audioComposed, audioSampleRootFrequency, audioContractIssues, audioSourceAsset, audioSourceFormat } from "./audioContract.js";
import {
  normalizeSceneResourceManifest,
  type SceneResourceCompressionPolicy,
  type SceneResourceKind
} from "./sceneResourceContract.js";
import { blockedCollisionCellsFromRoom, collisionTypeCellsFromRoom } from "./roomCollisionTypes.js";
import {
  gbaMetaspritePartLimit,
  gbaRenderLayers,
  isGbaObjNativeDimension,
  resolveGbaActorSprite,
  resolveGbaRoomTileset
} from "./gbaRendering.js";
import { validateGBAProjectMigrationContract } from "../../../../packages/project-contract/src/index.js";
import { compilePluginMappedEventCommand } from "./gbaStudioPluginExport.js";
import { emptyProjectPluginRegistry, type ProjectPluginRegistry } from "./gbaStudioPlugins.js";
import { projectWithCompiledAdvancedTools } from "./advancedTools.js";
import { buildProjectRuntimeCapabilityManifest } from "./runtimeCapabilities.js";
import {
  DEFAULT_SCENE_PALETTE_BANK_POLICY,
  effectiveBackgroundPaletteBankBudget,
  normalizeScenePaletteBankPolicy,
  type ScenePaletteBankPolicy
} from "./paletteContract.js";
import {
  isSpriteAnimationType,
  normalizeSpriteStateSlots,
  resolveSpriteStateForActor,
  SPRITE_ANIMATION_SLOT_ORDER,
  type SpriteAnimationSlot,
  type SpriteDirectionAdapter,
  type SpriteStateContract
} from "./spriteAnimationState.js";

export interface EngineProjectExportFile {
  path: string;
  contents: string;
}

export interface EngineProjectExportAsset {
  id: string;
  name: string;
  kind: string;
  source: string;
  output: string;
  bundledDefaultAsset?: string;
}

export interface EngineProjectExport {
  target: string;
  files: EngineProjectExportFile[];
  assets: EngineProjectExportAsset[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(source: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const value = source?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function nullableStringField(source: Record<string, unknown> | undefined, key: string): string {
  const value = source?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function integerField(source: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function booleanField(source: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const value = source?.[key];
  return typeof value === "boolean" ? value : fallback;
}

function child(source: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  return isRecord(source?.[key]) ? source[key] : undefined;
}

function projectArray(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function projectRooms(data: GBAProjectData): Record<string, unknown>[] {
  const scenas = projectArray(data, "scenas");
  if (scenas.length > 0) return scenas;

  const rooms = projectArray(data, "rooms");
  if (rooms.length > 0) return rooms;

  return [];
}

function normalizeIdentifier(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

export function engineSceneResourceBankGroupName(room: Record<string, unknown>, index: number): string {
  const roomName = stringField(room, "name", `room_${index + 1}`);
  return `scene_${normalizeIdentifier(roomName, `room_${index + 1}`)}`;
}

export function engineCutsceneStepResourceBankGroupName(
  room: Record<string, unknown>,
  roomIndex: number,
  stepIndex: number
): string {
  return `${engineSceneResourceBankGroupName(room, roomIndex)}_step_${stepIndex}`;
}

export function engineEventBackgroundGroupName(room: Record<string, unknown>, index: number, assetName: string): string {
  return `${engineSceneResourceBankGroupName(room, index)}_background_${tilesetPackAssetId(assetName)}`;
}

function eventBackgroundAssetNames(data: GBAProjectData): string[] {
  return [...new Set(projectArray(data, "events").flatMap(event => {
    const steps = Array.isArray(event.steps) ? recordArray(event, "steps") : [event];
    return steps.filter(step => step.isEnabled !== false).flatMap(step => {
      const parts = commandParts(stringField(step, "command", ""));
      return parts[0] === "set_background" && parts[1] ? [parts.slice(1).join(" ")] : [];
    });
  }))];
}

export function engineSceneResourceBankGroups(data: GBAProjectData): string[] {
  return projectRooms(data).map(engineSceneResourceBankGroupName);
}

interface AssetcSceneBankFields {
  bank_group: string;
  bank_groups: string[];
}

interface AssetcTilesetPlacement {
  bg_tiles: { start: number };
}

export type AssetcCompressionPolicy = "auto" | SceneResourceCompressionPolicy;

function globalSceneBankFields(data: GBAProjectData): AssetcSceneBankFields {
  return {
    bank_group: "global",
    bank_groups: ["global", ...engineSceneResourceBankGroups(data)]
  };
}

function layerTilesetNamesForRoom(room: Record<string, unknown>): string[] {
  const layers = Array.isArray(room.tileLayers) ? room.tileLayers.filter(isRecord) : [];
  const names = new Set<string>();
  layers.forEach((layer) => {
    if (!Array.isArray(layer.tileSourceAssetNames)) return;
    layer.tileSourceAssetNames.forEach((value) => {
      if (typeof value === "string" && value.trim().length > 0) names.add(value.trim());
    });
  });
  return Array.from(names);
}

function dialogueKeysInRuntimeConfig(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((entry) => dialogueKeysInRuntimeConfig(entry, output));
    return output;
  }
  if (!isRecord(value)) return output;

  Object.entries(value).forEach(([key, entry]) => {
    if (key === "dialogueKey" && typeof entry === "string" && entry.trim().length > 0) {
      output.add(entry.trim());
    } else if (key === "dialogueKeys" && Array.isArray(entry)) {
      entry.forEach((dialogueKey) => {
        if (typeof dialogueKey === "string" && dialogueKey.trim().length > 0) {
          output.add(dialogueKey.trim());
        }
      });
    }
    dialogueKeysInRuntimeConfig(entry, output);
  });
  return output;
}

function dialogueResourceBankGroupsForAsset(data: GBAProjectData, assetName: string): string[] {
  const rooms = projectRooms(data);
  const roomGroups = rooms.map((room, index) => engineSceneResourceBankGroupName(room, index));
  const portraitDialogueKeys = new Set(
    projectArray(data, "dialogues")
      .filter((dialogue) => nullableStringField(dialogue, "portrait") === assetName)
      .map((dialogue) => nullableStringField(dialogue, "key"))
      .filter(Boolean)
  );
  if (portraitDialogueKeys.size === 0) return [];

  const groups = new Set<string>();
  let hasUnscopedReference = false;
  const addRoomGroup = (roomIndex: number): void => {
    if (roomIndex >= 0 && roomIndex < roomGroups.length) {
      groups.add(roomGroups[roomIndex]!);
    } else {
      hasUnscopedReference = true;
    }
  };

  rooms.forEach((room, roomIndex) => {
    const runtime = child(room, "runtime");
    const runtimeKeys = dialogueKeysInRuntimeConfig(child(runtime, "config"));
    if (Array.from(runtimeKeys).some((dialogueKey) => portraitDialogueKeys.has(dialogueKey))) {
      addRoomGroup(roomIndex);
    }
  });

  projectArray(data, "events").forEach((event) => {
    const eventUsesPortrait = eventSteps(event).some((step) => {
      const parts = commandParts(nullableStringField(step, "command"));
      return parts[0] === "show_dialogue" && portraitDialogueKeys.has(parts[1] ?? "");
    });
    if (!eventUsesPortrait) return;

    const hasRoomReference = ["roomID", "roomId", "roomName", "room", "sceneID", "sceneId", "sceneName"]
      .some((key) => nullableStringField(event, key).length > 0);
    if (!hasRoomReference) {
      hasUnscopedReference = true;
      return;
    }
    addRoomGroup(roomIndexForEntity(event, rooms));
  });

  if (hasUnscopedReference || groups.size === 0) {
    return ["global", ...roomGroups];
  }
  return Array.from(groups);
}

function hudPresetIDsInValue(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((entry) => hudPresetIDsInValue(entry, output));
    return output;
  }
  if (!isRecord(value)) return output;

  Object.entries(value).forEach(([key, entry]) => {
    if ((key === "hudPresetId" || key === "hud_preset_id") && typeof entry === "string" && entry.trim().length > 0) {
      output.add(entry.trim());
    }
    hudPresetIDsInValue(entry, output);
  });
  return output;
}

/** Indexes authored HUD references once per pack, without retaining project data. */
export function engineUsedHudPresetIDs(data: GBAProjectData): Set<string> {
  const projectSettings = settings(data);
  const presets = recordArray(projectSettings ?? {}, "hudPresets");
  const knownIDs = new Set(presets.map(preset => nullableStringField(preset, "id")));
  const requestedActiveID = nullableStringField(projectSettings, "hudPresetId") || "hud-default";
  const activeID = presets.length && !knownIDs.has(requestedActiveID)
    ? nullableStringField(presets[0], "id") : requestedActiveID;
  if (!usesBlankPlayerDefaults(data)) return new Set([...knownIDs, "hud-default"]);
  const ids = new Set<string>();
  projectRooms(data).forEach(room => {
    const requested = hudPresetIDsInValue(room);
    if (!requested.size && !usesBlankPlayerDefaults(data)) requested.add(activeID);
    requested.forEach(id => ids.add(presets.length && !knownIDs.has(id) ? activeID : id));
  });
  if (!ids.size && !usesBlankPlayerDefaults(data)) ids.add(activeID);
  return ids;
}

function hudSceneGroupsByIcon(data: GBAProjectData): ReadonlyMap<string, readonly string[]> {
  const projectSettings = settings(data);
  const presets = recordArray(projectSettings ?? {}, "hudPresets");
  const groupsByIcon = new Map<string, string[]>();
  if (presets.length === 0) return groupsByIcon;
  const presetByID = new Map(
    presets.map((preset) => [nullableStringField(preset, "id"), preset] as const)
      .filter(([id]) => id.length > 0)
  );
  const requestedActiveID = nullableStringField(projectSettings, "hudPresetId") || "hud-default";
  const activePreset = presetByID.get(requestedActiveID) ?? presets[0];
  const iconsByPreset = new Map(presets.map((preset) => [preset, recordArray(preset, "components")
    .filter((component) => ["icon", "frame", "bar"].includes(nullableStringField(component, "kind")) && nullableStringField(component, "asset"))
    .flatMap((component) => [nullableStringField(component, "asset"), nullableStringField(child(component,"gauge"),"emptyAsset"), ...(Array.isArray(component.stateAssets) ? component.stateAssets.filter((v):v is string => typeof v === "string") : [])].filter(Boolean))]));
  projectRooms(data).forEach((room, index) => {
    const presetIDs = hudPresetIDsInValue(room);
    if (presetIDs.size === 0 && activePreset && !usesBlankPlayerDefaults(data)) presetIDs.add(nullableStringField(activePreset, "id"));
    const icons = new Set<string>();
    presetIDs.forEach((id) => {
      const preset = presetByID.get(id) ?? activePreset;
      if (preset) (iconsByPreset.get(preset) ?? []).forEach((icon) => icons.add(icon));
    });
    const group = engineSceneResourceBankGroupName(room, index);
    icons.forEach((icon) => {
      const groups = groupsByIcon.get(icon) ?? [];
      if (!groups.includes(group)) groups.push(group);
      groupsByIcon.set(icon, groups);
    });
  });
  return groupsByIcon;
}

function roomUsesAuthoredIsometricBackground(room: Record<string, unknown>): boolean {
  const runtime = child(room, "runtime");
  return nullableStringField(runtime, "type") === "isometric" &&
    nullableStringField(child(runtime, "config"), "worldMode") === "static_composition" &&
    booleanField(room, "gbStudioUseBackgroundLayout", false) &&
    stringField(room, "backgroundRenderMode", "tilemap") === "tilemap";
}

function roomUsesPagedTacticalSurface(room: Record<string, unknown>): boolean {
  const runtime = child(room, "runtime");
  if (nullableStringField(runtime, "type") !== "isometric") return false;
  const presentation = child(child(runtime, "config"), "tacticalPresentation");
  return recordArray(presentation ?? {}, "surfacePages").length > 0;
}

interface TacticalSurfacePageBankGroups {
  surface: string[];
  shared: string[];
  objects: string[];
  pageRooms: string[];
}

function tacticalSurfacePageBankGroupsForAsset(
  data: GBAProjectData,
  assetName: string
): TacticalSurfacePageBankGroups {
  const surface = new Set<string>();
  const shared = new Set<string>();
  const objects = new Set<string>();
  const pageRooms = new Set<string>();

  projectRooms(data).forEach((room, index) => {
    const runtime = child(room, "runtime");
    if (nullableStringField(runtime, "type") !== "isometric") return;
    const config = child(runtime, "config");
    const presentation = child(config, "tacticalPresentation");
    const pages = recordArray(presentation ?? {}, "surfacePages");
    if (pages.length === 0) return;

    const pageGroups = pages
      .map((page) => nullableStringField(page, "bankGroup"))
      .filter(Boolean);
    const matchingPages = pages.filter((page) => nullableStringField(page, "asset") === assetName);
    matchingPages.forEach((page) => {
      const group = nullableStringField(page, "bankGroup");
      if (group) surface.add(group);
    });
    if (matchingPages.length > 0) {
      pageRooms.add(engineSceneResourceBankGroupName(room, index));
      return;
    }

    const tacticalObjectReferences = [
      ...recordArray(presentation ?? {}, "units").map((unit) => nullableStringField(unit, "sheet")),
      ...recordArray(presentation ?? {}, "props").map((prop) => nullableStringField(prop, "asset")),
      nullableStringField(presentation, "cursorAsset"),
      nullableStringField(presentation, "rangeAsset"),
      nullableStringField(presentation, "targetAsset"),
      nullableStringField(presentation, "emotesAsset"),
      nullableStringField(presentation, "feedbackAsset")
    ]
      .filter(Boolean)
      .map((reference) => reference.split("#", 1)[0].replace(/^.*[\\/]/, ""));
    const assetFileName = assetName.replace(/^.*[\\/]/, "");
    if (tacticalObjectReferences.includes(assetFileName)) {
      pageGroups.forEach((group) => objects.add(group));
    }

    const sharedReferences = [
      nullableStringField(presentation, "surfaceAsset"),
      nullableStringField(presentation, "gridAsset"),
      nullableStringField(presentation, "hudLayout"),
      ...recordArray(presentation ?? {}, "assets")
        .filter((asset) => ["bg", "ui"].includes(nullableStringField(asset, "consumer")))
        .flatMap((asset) => [nullableStringField(asset, "path"), nullableStringField(asset, "id")])
    ].filter(Boolean);
    if (sharedReferences.includes(assetName)) {
      pageGroups.forEach((group) => shared.add(group));
    }
  });

  return {
    surface: Array.from(surface),
    shared: Array.from(shared),
    objects: Array.from(objects),
    pageRooms: Array.from(pageRooms)
  };
}

function sceneBankFieldsForAsset(
  data: GBAProjectData, assetName: string, kind: "sprite" | "tileset",
  hudGroups?: ReadonlyMap<string, readonly string[]>
): AssetcSceneBankFields {
  const rooms = projectRooms(data);
  const roomEntries = rooms.map((room, index) => ({
    id: stringField(room, "id", stringField(room, "name", `room_${index + 1}`)),
    name: stringField(room, "name", `room_${index + 1}`),
    sceneType: nullableStringField(room, "sceneType").toLowerCase(),
    group: engineSceneResourceBankGroupName(room, index)
  }));
  const groups = new Set<string>();

  if (kind === "tileset") {
    rooms.forEach((room, index) => {
      const authoredIsometricBackground = roomUsesAuthoredIsometricBackground(room);
      const affineReference = affineBackgroundAssetReference(room);
      const affineAssetName = affineReference
        ? stringField(assetRecordByReference(data, affineReference) ?? undefined, "name", affineReference)
        : "";
      const runtime = child(room, "runtime");
      const tacticalConfig = nullableStringField(runtime, "type") === "isometric"
        ? child(runtime, "config")
        : undefined;
      const tacticalPresentation = tacticalConfig
        ? child(tacticalConfig, "tacticalPresentation")
        : undefined;
      const tacticalReferences = tacticalPresentation
        ? [
            nullableStringField(tacticalPresentation, "surfaceAsset"),
            ...recordArray(tacticalPresentation, "surfacePages")
              .flatMap((page) => [nullableStringField(page, "asset")]),
            nullableStringField(tacticalPresentation, "gridAsset"),
            nullableStringField(tacticalPresentation, "hudLayout"),
            ...recordArray(tacticalPresentation, "assets")
              .filter((asset) => ["bg", "ui"].includes(nullableStringField(asset, "consumer")))
              .flatMap((asset) => [
                nullableStringField(asset, "path"),
                nullableStringField(asset, "id")
              ])
          ]
            .filter(Boolean)
            .map((reference) => reference.split("#", 1)[0])
        : [];
      const tilesetNames = [
        nullableStringField(room, "backgroundAssetName"),
        nullableStringField(room, "background"),
        authoredIsometricBackground ? "" : nullableStringField(room, "tilesetAssetName"),
        affineReference,
        affineAssetName,
        nullableStringField(child(tacticalConfig, "pagedSurface"), "backgroundAsset"),
        nullableStringField(child(tacticalConfig, "pagedSurface"), "foregroundAsset")
      ].filter(Boolean);
      const runtimeConfig = nullableStringField(runtime, "type") === "menu"
        ? child(runtime, "config")
        : undefined;
      const lutaHudName = nullableStringField(runtime, "type") === "luta"
        ? nullableStringField(child(runtime, "config"), "hudAssetName")
        : "";
      const menuOverlayNames = runtimeConfig
        ? [
            nullableStringField(runtimeConfig, "titleOverlayAssetName"),
            ...(isRecord(runtimeConfig.backgroundAnimation) && Array.isArray(runtimeConfig.backgroundAnimation.frameAssetNames)
              ? runtimeConfig.backgroundAnimation.frameAssetNames.filter((name): name is string => typeof name === "string")
              : []),
            ...recordArray(runtimeConfig, "screens").flatMap((screen) => [
              nullableStringField(screen, "titleOverlayAssetName"),
              ...(isRecord(screen.backgroundAnimation) && Array.isArray(screen.backgroundAnimation.frameAssetNames)
                ? screen.backgroundAnimation.frameAssetNames.filter((name): name is string => typeof name === "string")
                : [])
            ])
          ].filter(Boolean)
        : [];
      const cutsceneSteps = nullableStringField(runtime, "type") === "cutscene"
        ? recordArray(child(runtime, "config") ?? {}, "steps")
        : [];
      if (
        tilesetNames.includes(assetName) ||
        (!authoredIsometricBackground && layerTilesetNamesForRoom(room).includes(assetName)) ||
        racingPseudo3dVisualAssetNamesForRoom(room).includes(assetName) ||
        menuOverlayNames.includes(assetName) ||
        lutaHudName === assetName ||
        tacticalReferences.includes(assetName)
      ) {
        groups.add(roomEntries[index]?.group ?? engineSceneResourceBankGroupName(room, index));
      }
      cutsceneSteps.forEach((step, stepIndex) => {
        if (nullableStringField(step, "backgroundAssetName") === assetName) {
          groups.add(engineCutsceneStepResourceBankGroupName(room, index, stepIndex));
        }
      });
    });
    projectArray(data, "events").forEach((event) => {
      const referencesAsset = recordArray(event, "steps").some((step) => {
        const parts = commandParts(stringField(step, "command", ""));
        return parts[0] === "replace_tile_animation" && parts[6] === assetName;
      });
      if (!referencesAsset) return;
      const hasRoomReference = ["roomID", "roomId", "roomName", "room", "sceneID", "sceneId", "sceneName"]
        .some((key) => nullableStringField(event, key).length > 0);
      if (!hasRoomReference) return;
      const roomIndex = roomIndexForEntity(event, rooms);
      if (roomIndex >= 0) {
        groups.add(roomEntries[roomIndex]?.group ?? engineSceneResourceBankGroupName(rooms[roomIndex], roomIndex));
      }
    });
  } else {
    const general = child(settings(data), "general");
    const shmup = child(settings(data), "shmup");
    const defaultPlayerName = nullableStringField(general, "startPlayer") || "Player";
    const playerNames = new Set<string>([
      defaultPlayerName,
      ...rooms.map((room) => nullableStringField(room, "playerActorName")).filter(Boolean)
    ]);
    projectArray(data, "actors").forEach((actor) => {
      if (nullableStringField(actor, "spriteSheet") !== assetName) return;
      const actorName = nullableStringField(actor, "name");
      const actorRoom = nullableStringField(actor, "roomName");
      const configuredPlayerEntries = roomEntries.filter((entry, index) => (
        nullableStringField(rooms[index], "playerActorName") === actorName
      ));
      const actorRoomEntry = actorRoom
        ? roomEntries.find((entry) => entry.name === actorRoom || entry.id === actorRoom)
        : undefined;
      const actorRoomIsConfiguredPlayer = Boolean(
        actorRoomEntry && configuredPlayerEntries.some((entry) => entry === actorRoomEntry)
      );
      const importedRuntime = nullableStringField(actor, "gbStudioPlayerRuntime").toUpperCase();
      const runtimeSceneType = {
        TOPDOWN: "topdown",
        PLATFORM: "platformer",
        POINTNCLICK: "pointandclick",
        SHMUP: "shmup"
      }[importedRuntime];

      if (actorRoomIsConfiguredPlayer) {
        // Blank projects have a local Player in every controlled scene. Equal
        // actor names do not make their different sprite sheets co-resident.
        if (usesBlankPlayerDefaults(data)) groups.add(actorRoomEntry!.group);
        else configuredPlayerEntries.forEach((entry) => groups.add(entry.group));
        return;
      }
      if (runtimeSceneType) {
        roomEntries
          .filter((entry) => entry.sceneType.replace(/[^a-z]/g, "") === runtimeSceneType)
          .forEach((entry) => groups.add(entry.group));
        return;
      }
      if (!actorRoom || (!actorRoomEntry && playerNames.has(actorName))) {
        roomEntries.forEach((entry) => groups.add(entry.group));
        return;
      }
      roomEntries
        .filter((entry) => entry === actorRoomEntry)
        .forEach((entry) => groups.add(entry.group));
    });
    if (["playerSprite", "projectileSprite", "enemyProjectileSprite", "enemySprite"].some((key) => (
      nullableStringField(shmup, key) === assetName
    ))) {
      rooms.forEach((room, index) => {
        if (nullableStringField(room, "sceneType") === "shmup") {
          groups.add(roomEntries[index]?.group ?? engineSceneResourceBankGroupName(room, index));
        }
      });
    }

    hudGroups?.get(assetName)?.forEach((group) => groups.add(group));

    dialogueResourceBankGroupsForAsset(data, assetName).forEach((group) => groups.add(group));
  }

  if (kind === "tileset") {
    const tacticalPageGroups = tacticalSurfacePageBankGroupsForAsset(data, assetName);
    tacticalPageGroups.pageRooms.forEach((group) => groups.delete(group));
    tacticalPageGroups.surface.forEach((group) => groups.add(group));
    tacticalPageGroups.shared.forEach((group) => groups.add(group));
  } else {
    tacticalSurfacePageBankGroupsForAsset(data, assetName).objects.forEach((group) => groups.add(group));
  }

  // Replacements use independent residency groups; never reserve all BGs at once.
  rooms.forEach((room, index) => {
    if (nullableStringField(room, "sceneType").toLowerCase() !== "cutscene") return;
    for (const backgroundName of eventBackgroundAssetNames(data)) {
      if ((kind === "tileset" && backgroundName === assetName) ||
          (kind === "sprite" && groups.has(engineSceneResourceBankGroupName(room, index)))) {
        groups.add(engineEventBackgroundGroupName(room, index, backgroundName));
      }
    }
  });
  const sceneGroups = roomEntries.map((entry) => entry.group).filter((group) => groups.has(group));
  const bankGroups = new Set(groups);
  if (kind === "sprite") {
    rooms.forEach((room, index) => {
      const sceneGroup = roomEntries[index]?.group ?? engineSceneResourceBankGroupName(room, index);
      if (!bankGroups.has(sceneGroup) || nullableStringField(room, "sceneType").toLowerCase() !== "cutscene") {
        return;
      }
      const runtime = child(room, "runtime");
      if (nullableStringField(runtime, "type") !== "cutscene") return;
      recordArray(child(runtime, "config") ?? {}, "steps").forEach((_step, stepIndex) => {
        bankGroups.add(engineCutsceneStepResourceBankGroupName(room, index, stepIndex));
      });
    });
  }
  const resolvedBankGroups = roomEntries
    .map((entry) => entry.group)
    .filter((group) => bankGroups.has(group));
  const stepBankGroups = Array.from(bankGroups).filter((group) => !roomEntries.some((entry) => entry.group === group));
  const orderedBankGroups = [...resolvedBankGroups, ...stepBankGroups];
  if (kind === "tileset" && orderedBankGroups.length > 0) {
    return { bank_group: orderedBankGroups[0], bank_groups: orderedBankGroups };
  }
  if (orderedBankGroups.length === 1) {
    return { bank_group: orderedBankGroups[0], bank_groups: orderedBankGroups };
  }
  if (orderedBankGroups.length > 1) {
    return { bank_group: orderedBankGroups[0], bank_groups: orderedBankGroups };
  }
  return {
    bank_group: "global",
    bank_groups: ["global", ...roomEntries.map((entry) => entry.group)]
  };
}

function settings(data: GBAProjectData): Record<string, unknown> | undefined {
  return isRecord(data.settings) ? data.settings : undefined;
}

function projectTitle(data: GBAProjectData): string {
  const general = child(settings(data), "general");
  return stringField(general, "gameTitle", stringField(data, "name", "Projeto sem nome"));
}

function projectKind(data: GBAProjectData): string {
  const general = child(settings(data), "general");
  return normalizeIdentifier(stringField(general, "startSceneType", "topdown"), "topdown");
}

export function projectTarget(data: GBAProjectData): string {
  const build = child(settings(data), "build");
  const romFileName = stringField(build, "romFileName", "");
  return normalizeIdentifier(romFileName || projectTitle(data), "game");
}

function assetOutputFolder(kind: string): string {
  const normalized = normalizeIdentifier(kind, "asset");
  if (["musica", "audio", "sfx", "sound"].includes(normalized)) return "audio";
  if (["sprite", "sprites", "portrait", "portraits", "emote", "emotes"].includes(normalized)) return "sprite";
  if (["background", "tilemap", "tileset", "image", "imagem"].includes(normalized)) return "image";
  return normalized;
}

function assetSource(asset: Record<string, unknown>): string {
  const metadata = child(asset, "metadata");
  return nullableStringField(metadata, "source") || nullableStringField(asset, "relativePath") || nullableStringField(asset, "source");
}

function exportableAssets(data: GBAProjectData): EngineProjectExportAsset[] {
  return projectArray(data, "assets").flatMap((asset, index) => {
    const metadata = child(asset, "metadata");
    const source = assetSource(asset);
    if (!source) return [];

    const name = stringField(asset, "name", `asset-${index + 1}`);
    const kind = stringField(asset, "kind", "Unknown");
    const parsedName = name.replace(/\.[a-z0-9]+$/i, "");
    const extension = name.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? "";
    return [{
      id: stringField(asset, "id", `asset-${index + 1}`),
      name,
      kind,
      source,
      ...(nullableStringField(metadata, "bundledDefaultAsset")
        ? { bundledDefaultAsset: nullableStringField(metadata, "bundledDefaultAsset") }
        : {}),
      output: `assets/${assetOutputFolder(kind)}/${normalizeIdentifier(parsedName, `asset_${index + 1}`)}${extension}`
    }];
  });
}

function engineManifest(data: GBAProjectData, target: string, generatedAssets: EngineProjectExportAsset[]): string {
  const runtimeCapabilities = buildProjectRuntimeCapabilityManifest(data);
  return `${JSON.stringify(
    {
      schema: 1,
      backend: "gbastudio_engine",
      kind: projectKind(data),
      build: {
        target,
        make_target: "all"
      },
      entry: "main.cpp",
      project_data: "gbastudio_project_data.hpp",
      runtime_capabilities: runtimeCapabilities,
      generated_assets: generatedAssets.map((asset) => asset.output),
      requires: {
        engine_pack: ">=0.36.0",
        features: ["topdown_project_data", "dialogue", "audio"]
      }
    },
    null,
    2
  )}\n`;
}

function cppString(value: string): string {
  return JSON.stringify(value);
}

const runtimeDialogueColumns = 20;

function runtimeTextWords(line: string): string[] {
  return line.split(/\s+/).filter(Boolean);
}

function pushWrappedRuntimeWord(lines: string[], word: string): void {
  if (word.length > runtimeDialogueColumns) {
    if ((lines.at(-1) ?? "").length > 0) {
      lines.push("");
    }

    for (let index = 0; index < word.length; index += runtimeDialogueColumns) {
      lines.push(word.slice(index, index + runtimeDialogueColumns));
    }
    return;
  }

  const current = lines.at(-1) ?? "";
  if (current.length === 0) {
    lines[lines.length - 1] = word;
    return;
  }

  const candidate = `${current} ${word}`;
  if (candidate.length <= runtimeDialogueColumns) {
    lines[lines.length - 1] = candidate;
    return;
  }

  lines.push(word);
}

function wrapRuntimeDialogueText(value: string): string {
  const lines: string[] = [""];
  value.split("\n").forEach((paragraph, paragraphIndex) => {
    if (paragraphIndex > 0 && (lines.at(-1) ?? "").length > 0) {
      lines.push("");
    }

    runtimeTextWords(paragraph).forEach((word) => {
      pushWrappedRuntimeWord(lines, word);
    });
  });

  return lines.filter((line, index) => line.length > 0 || index === 0).join("\n");
}

function runtimeDialogueText(value: string): string {
  const sanitized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[,;]/g, ".")
    .replace(/[?]/g, ".")
    .replace(/[^A-Za-z0-9 !\-.:/\n]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim()
    .toUpperCase();

  return wrapRuntimeDialogueText(sanitized);
}

function cppBool(value: boolean): string {
  return value ? "true" : "false";
}

function arrayInitializer(lines: string[], fallback: string): string {
  const items = lines.length > 0 ? lines : [fallback];
  return items.map((line) => `  ${line}`).join(",\n");
}

function eventSteps(event: Record<string, unknown>): Record<string, unknown>[] {
  const steps = event.steps;
  if (Array.isArray(steps)) {
    const validSteps = steps.filter(isRecord);
    if (validSteps.length > 0) {
      return validSteps;
    }
  }

  return [{ command: stringField(event, "command", "noop"), isEnabled: true }];
}

function commandParts(command: string): string[] {
  return command.split(/\s+/).filter(Boolean);
}

function integerPart(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function recordIndexByValue(
  records: Record<string, unknown>[],
  value: string,
  fields: string[],
  fallbackName: (record: Record<string, unknown>, index: number) => string
): number {
  if (!value) return -1;
  return records.findIndex((record, index) => {
    if (fields.some((field) => nullableStringField(record, field) === value)) {
      return true;
    }

    return fallbackName(record, index) === value;
  });
}

function roomTileCount(room: Record<string, unknown>): number {
  return Math.max(1, integerField(room, "width", 1)) * Math.max(1, integerField(room, "height", 1));
}

function roomTileCells(room: Record<string, unknown>): number[] {
  const layers = projectArray(room, "tileLayers");
  const bg2 = layers.find((layer) => nullableStringField(layer, "mapping").toUpperCase() === "BG2");
  const tilemap = Array.isArray(bg2?.tilemap) ? bg2.tilemap : (Array.isArray(room.tilemap) ? room.tilemap : []);
  return Array.from({ length: roomTileCount(room) }, (_, index) => {
    const value = tilemap[index];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  });
}

function roomForegroundTileCells(room: Record<string, unknown>): Array<{ cellIndex: number; tileID: number }> {
  const layers = projectArray(room, "tileLayers");
  const bg1 = layers.find((layer) => nullableStringField(layer, "mapping").toUpperCase() === "BG1");
  const tilemap = Array.isArray(bg1?.tilemap) ? bg1.tilemap : [];
  return Array.from({ length: roomTileCount(room) }, (_, cellIndex) => ({ cellIndex, value: tilemap[cellIndex] }))
    .filter((cell): cell is { cellIndex: number; value: number } => (
      typeof cell.value === "number" && Number.isFinite(cell.value) && cell.value >= 0
    ))
    .map((cell) => ({ cellIndex: cell.cellIndex, tileID: Math.floor(cell.value) }));
}

function roomCollisionCells(room: Record<string, unknown>): boolean[] {
  return blockedCollisionCellsFromRoom(room, Math.max(1, integerField(room, "width", 1)), Math.max(1, integerField(room, "height", 1)));
}

function roomCollisionTypeValues(room: Record<string, unknown>): string[] {
  return collisionTypeCellsFromRoom(room, Math.max(1, integerField(room, "width", 1)), Math.max(1, integerField(room, "height", 1)));
}

function roomIndexForEntity(entity: Record<string, unknown>, rooms: Record<string, unknown>[]): number {
  const candidates = ["roomID", "roomId", "roomName", "room", "sceneID", "sceneId", "sceneName"]
    .map((key) => nullableStringField(entity, key))
    .filter((value) => value.length > 0);

  if (candidates.length === 0) {
    return rooms.length > 0 ? 0 : -1;
  }

  const index = rooms.findIndex((room, roomIndex) => {
    const id = stringField(room, "id", `room-${roomIndex + 1}`);
    const name = stringField(room, "name", `Room ${roomIndex + 1}`);
    return candidates.includes(id) || candidates.includes(name);
  });

  return index >= 0 ? index : -1;
}

function positionedIntegerField(source: Record<string, unknown>, key: string, fallback: number): number {
  const directValue = source[key];
  if (typeof directValue === "number" && Number.isFinite(directValue)) {
    return Math.floor(directValue);
  }

  return integerField(child(source, "position"), key, fallback);
}

function sizedIntegerField(source: Record<string, unknown>, key: string, fallback: number): number {
  const directValue = source[key];
  if (typeof directValue === "number" && Number.isFinite(directValue)) {
    return Math.max(1, Math.floor(directValue));
  }

  return Math.max(1, integerField(child(source, "size"), key, fallback));
}

function tileCellInitializer(roomIndex: number, cellIndex: number, tileID: number): string {
  return `{${[roomIndex.toString(), cellIndex.toString(), tileID.toString()].join(", ")}}`;
}

function collisionCellInitializer(roomIndex: number, cellIndex: number, isBlocked: boolean): string {
  return `{${[roomIndex.toString(), cellIndex.toString(), cppBool(isBlocked)].join(", ")}}`;
}

function roomInitializer(
  data: GBAProjectData,
  room: Record<string, unknown>,
  index: number,
  firstTileIndex: number,
  tileCount: number,
  firstForegroundIndex: number,
  foregroundCount: number,
  firstCollisionIndex: number,
  collisionCount: number
): string {
  const eventBindings = child(room, "eventBindings");
  const bg2 = resolveGbaRoomTileset(data, room);
  return `{${[
    cppString(stringField(room, "id", `room-${index + 1}`)),
    cppString(stringField(room, "name", `Room ${index + 1}`)),
    integerField(room, "width", 1).toString(),
    integerField(room, "height", 1).toString(),
    cppString(stringField(room, "sceneType", "topdown")),
    cppString(nullableStringField(room, "music")),
    cppString(nullableStringField(room, "backgroundAssetName")),
    cppString(bg2.layer),
    cppString(nullableStringField(eventBindings, "onInit")),
    firstTileIndex.toString(),
    tileCount.toString(),
    firstForegroundIndex.toString(),
    foregroundCount.toString(),
    firstCollisionIndex.toString(),
    collisionCount.toString()
  ].join(", ")}}`;
}

function assetInitializer(asset: Record<string, unknown>, index: number): string {
  const metadata = child(asset, "metadata");
  return `{${[
    cppString(stringField(asset, "id", `asset-${index + 1}`)),
    cppString(stringField(asset, "name", `Asset ${index + 1}`)),
    cppString(stringField(asset, "kind", "Unknown")),
    cppString(nullableStringField(metadata, "source"))
  ].join(", ")}}`;
}

function audioInitializer(audio: Record<string, unknown>, index: number): string {
  return `{${[
    cppString(stringField(audio, "id", `audio-${index + 1}`)),
    cppString(stringField(audio, "name", `Audio ${index + 1}`)),
    cppString(stringField(audio, "kind", "Audio")),
    cppString(stringField(audio, "format", "Unknown")),
    cppString(stringField(audio, "exportID", normalizeIdentifier(stringField(audio, "name", `audio_${index + 1}`), `audio_${index + 1}`))),
    cppBool(booleanField(audio, "loops", false)),
    integerField(audio, "volume", 100).toString()
  ].join(", ")}}`;
}

function recordArray(source: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = source[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function audioPatternID(pattern: Record<string, unknown>, index: number): string {
  return stringField(pattern, "id", `pattern-${index + 1}`);
}

function audioPatternName(pattern: Record<string, unknown>, index: number): string {
  return stringField(pattern, "name", `Pattern ${index + 1}`);
}

function audioPatternSteps(pattern: Record<string, unknown>, channels: Record<string, unknown>[]): number {
  const explicitSteps = integerField(pattern, "steps", 0);
  if (explicitSteps > 0) return Math.min(explicitSteps, 64);
  const noteCounts = channels.map((channel) => {
    const notes = Array.isArray(channel.notes) ? channel.notes : [];
    return notes.length;
  });
  return Math.min(64, Math.max(1, 64, ...noteCounts));
}

export interface AudioEngineExportDiagnostic {
  audioID: string;
  audioName: string;
  level: "ok" | "warning" | "info";
  message: string;
}

export function deriveAudioEngineExportDiagnostics(audioItems: Record<string, unknown>[], data?: GBAProjectData): AudioEngineExportDiagnostic[] {
  const diagnostics: AudioEngineExportDiagnostic[] = [];

  audioItems.forEach((audio, index) => {
    const audioID = stringField(audio, "id", `audio-${index + 1}`);
    const audioName = stringField(audio, "name", `Audio ${index + 1}`);
    const kind = stringField(audio, "kind", "Audio");
    const format = audioSourceFormat(data, audio);
    const patterns = recordArray(audio, "patterns");
    const patternOrder = Array.isArray(audio.patternOrder)
      ? audio.patternOrder.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [];
    const bpm = integerField(audio, "bpm", 0);

    const issues = audioContractIssues(audio, data);
    issues.forEach(issue => diagnostics.push({ audioID, audioName, level: "warning", message: issue.level === "error" ? `Exportação bloqueada: ${issue.message}` : issue.message }));
    if (issues.some(issue => issue.level === "error")) return;

    if (audioComposed(audio)) {
      diagnostics.push({
        audioID,
        audioName,
        level: "ok",
        message: kind === "SFX"
          ? "Composição de SFX será exportada para assetc com uma voz."
          : "Composição tracker será exportada como patterns/order para runtime PSG da engine."
      });
    } else if (kind === "SFX" && format === "WAV") {
      diagnostics.push({
        audioID,
        audioName,
        level: "ok",
        message: "SFX WAV sera resolvido pela engine via assetc (pcm/wav)."
      });
    } else if (kind === "Musica" && ["MOD", "S3M"].includes(format)) {
      diagnostics.push({
        audioID,
        audioName,
        level: "ok",
        message: `Música ${format} será processada pelo assetc. A fonte será validada no build.`
      });
    }

    if (patternOrder.length === 0 && patterns.length > 1) {
      diagnostics.push({
        audioID,
        audioName,
        level: "warning",
        message: "Varios patterns sem patternOrder; export usara ordem de declaracao."
      });
    }

    if (bpm > 0 && (bpm < 40 || bpm > 240)) {
      diagnostics.push({
        audioID,
        audioName,
        level: "warning",
        message: `BPM ${bpm} fora da faixa 40-240 recomendada pela engine subset.`
      });
    }

    patterns.forEach((pattern, patternIndex) => {
      const steps = audioPatternSteps(pattern, recordArray(pattern, "channels"));
      if (steps > 64) {
        diagnostics.push({
          audioID,
          audioName,
          level: "warning",
          message: `Pattern ${audioPatternName(pattern, patternIndex)} excede 64 passos (${steps}).`
        });
      }
    });
  });

  return diagnostics;
}

function audioPatternsForExport(audio: Record<string, unknown>, audioIndex: number): Record<string, unknown>[] {
  const patterns = recordArray(audio, "patterns");
  if (patterns.length > 0) return patterns;

  const channels = recordArray(audio, "channels");
  if (channels.length === 0) return [];

  return [{
    id: `${stringField(audio, "id", `audio-${audioIndex + 1}`)}-direct`,
    name: "direct",
    steps: audioPatternSteps({}, channels),
    channels
  }];
}

function audioPatternOrderIDs(audio: Record<string, unknown>, patterns: Record<string, unknown>[]): string[] {
  if (Array.isArray(audio.patternOrder)) {
    return audio.patternOrder
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
  }

  return patterns.map((pattern, index) => audioPatternID(pattern, index));
}

function audioNoteAt(channel: Record<string, unknown>, stepIndex: number): string | null {
  const notes = Array.isArray(channel.notes) ? channel.notes : [];
  const value = notes[stepIndex];
  if (typeof value !== "string") return null;

  const note = value.trim();
  return note.length > 0 && note !== "---" ? note : null;
}

function defaultInstrumentForChannelType(channelType: string): string {
  const normalized = channelType.toLowerCase();
  if (normalized.includes("pulse")) return "Pulse Lead";
  if (normalized.includes("wave")) return "Wave Bass";
  if (normalized.includes("noise")) return "Noise Kit";
  return "Pulse Lead";
}

function defaultEnvelopeForChannelType(channelType: string): string {
  const normalized = channelType.toLowerCase();
  if (normalized.includes("noise")) return "Short Decay";
  return "Soft ADSR";
}

interface AudioExportData {
  patternLines: string[];
  patternOrderLines: string[];
  noteLines: string[];
}

function buildAudioExportData(audioItems: Record<string, unknown>[]): AudioExportData {
  const patternLines: string[] = [];
  const patternOrderLines: string[] = [];
  const noteLines: string[] = [];

  audioItems.forEach((audio, audioIndex) => {
    const patterns = audioPatternsForExport(audio, audioIndex);
    const patternIndexByID = new Map<string, number>();

    patterns.forEach((pattern, localPatternIndex) => {
      const globalPatternIndex = patternLines.length;
      const id = audioPatternID(pattern, localPatternIndex);
      const name = audioPatternName(pattern, localPatternIndex);
      const channels = recordArray(pattern, "channels");
      const steps = audioPatternSteps(pattern, channels);
      const firstNoteIndex = noteLines.length;

      channels.forEach((channel, channelIndex) => {
        const channelID = stringField(channel, "id", `channel-${channelIndex + 1}`);
        const channelName = stringField(channel, "name", `Channel ${channelIndex + 1}`);
        const channelType = stringField(channel, "type", "audio");
        for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
          const note = audioNoteAt(channel, stepIndex);
          if (!note) continue;
          noteLines.push(`{${[
            audioIndex.toString(),
            globalPatternIndex.toString(),
            cppString(channelID),
            cppString(channelName),
            cppString(channelType),
            stepIndex.toString(),
            cppString(note),
            cppString(stringField(channel, "instrument", defaultInstrumentForChannelType(channelType))),
            cppString(stringField(channel, "envelope", defaultEnvelopeForChannelType(channelType)))
          ].join(", ")}}`);
        }
      });

      patternIndexByID.set(id, globalPatternIndex);
      patternLines.push(`{${[
        audioIndex.toString(),
        cppString(id),
        cppString(name),
        steps.toString(),
        firstNoteIndex.toString(),
        (noteLines.length - firstNoteIndex).toString()
      ].join(", ")}}`);
    });

    audioPatternOrderIDs(audio, patterns).forEach((patternID, orderIndex) => {
      const patternIndex = patternIndexByID.get(patternID);
      if (patternIndex === undefined) return;
      patternOrderLines.push(`{${[
        audioIndex.toString(),
        orderIndex.toString(),
        patternIndex.toString()
      ].join(", ")}}`);
    });
  });

  return { patternLines, patternOrderLines, noteLines };
}

interface EventCommandContext {
  rooms: Record<string, unknown>[];
  events: Record<string, unknown>[];
  audioItems: Record<string, unknown>[];
  dialogues: Record<string, unknown>[];
  pluginRegistry?: ProjectPluginRegistry;
}

interface CompiledEventCommand {
  opcode: string;
  targetKind: string;
  targetIndex: number;
  arg0: number;
  arg1: number;
  operand: string;
  rawCommand: string;
  enabled: boolean;
}

function eventIndexByName(events: Record<string, unknown>[], value: string): number {
  return recordIndexByValue(events, value, ["name"], (event, index) => stringField(event, "name", `event_${index + 1}`));
}

function audioIndexByName(audioItems: Record<string, unknown>[], value: string): number {
  return recordIndexByValue(audioItems, value, ["name", "exportID"], (audio, index) =>
    stringField(audio, "name", `Audio ${index + 1}`)
  );
}

function dialogueIndexByKey(dialogues: Record<string, unknown>[], value: string): number {
  return recordIndexByValue(dialogues, value, ["key"], () => "");
}

function roomIndexByName(rooms: Record<string, unknown>[], value: string): number {
  return recordIndexByValue(rooms, value, ["id", "name"], (room, index) =>
    stringField(room, "name", `Room ${index + 1}`)
  );
}

function rtcFieldIndex(value: string | undefined): number {
  const normalized = (value ?? "").trim().toLowerCase().replaceAll("-", "_");
  const fields: Record<string, number> = {
    year: 0,
    month: 1,
    day: 2,
    weekday: 3,
    hour: 4,
    minute: 5,
    second: 6
  };
  return fields[normalized] ?? 0;
}

function resolveCompiledTargetIndex(context: EventCommandContext, targetKind: string, operand: string): number {
  switch (targetKind) {
    case "Audio":
      return audioIndexByName(context.audioItems, operand);
    case "Dialogue":
      return dialogueIndexByKey(context.dialogues, operand);
    case "Room":
      return roomIndexByName(context.rooms, operand);
    case "Event":
      return eventIndexByName(context.events, operand);
    default:
      return -1;
  }
}

function compiledEventCommand(step: Record<string, unknown>, context: EventCommandContext): CompiledEventCommand {
  const rawCommand = stringField(step, "command", "noop");
  const parts = commandParts(rawCommand);
  const verb = parts[0] ?? "noop";
  const enabled = booleanField(step, "isEnabled", true);
  const pluginRegistry = context.pluginRegistry ?? emptyProjectPluginRegistry();
  const pluginMapping = pluginRegistry.exportMappingByVerb.get(verb);
  if (pluginMapping) {
    return compilePluginMappedEventCommand(
      rawCommand,
      enabled,
      pluginMapping,
      (targetKind, operand) => resolveCompiledTargetIndex(context, targetKind, operand)
    );
  }

  switch (verb) {
    case "noop":
      return { opcode: "Noop", targetKind: "None", targetIndex: -1, arg0: 0, arg1: 0, operand: "", rawCommand, enabled };
    case "play_music": {
      const operand = parts[1] ?? "";
      return { opcode: "PlayMusic", targetKind: "Audio", targetIndex: audioIndexByName(context.audioItems, operand), arg0: 0, arg1: 0, operand, rawCommand, enabled };
    }
    case "play_sfx": {
      const operand = parts[1] ?? "";
      return { opcode: "PlaySfx", targetKind: "Audio", targetIndex: audioIndexByName(context.audioItems, operand), arg0: 0, arg1: 0, operand, rawCommand, enabled };
    }
    case "show_dialogue": {
      const operand = parts[1] ?? "";
      return { opcode: "ShowDialogue", targetKind: "Dialogue", targetIndex: dialogueIndexByKey(context.dialogues, operand), arg0: 0, arg1: 0, operand, rawCommand, enabled };
    }
    case "show_choice": {
      const operand = parts[1] ?? "";
      return { opcode: "ShowChoice", targetKind: "Dialogue", targetIndex: dialogueIndexByKey(context.dialogues, operand), arg0: 0, arg1: 0, operand, rawCommand, enabled };
    }
    case "change_scene": {
      const operand = parts[1] ?? "";
      return {
        opcode: "ChangeScene",
        targetKind: "Room",
        targetIndex: roomIndexByName(context.rooms, operand),
        arg0: integerPart(parts[2], 0),
        arg1: integerPart(parts[3], 0),
        operand,
        rawCommand,
        enabled
      };
    }
    case "call_event":
    case "lock_script":
    case "unlock_script":
    case "timer_restart":
    case "timer_remove": {
      const operand = parts[1] ?? "";
      const opcodeByVerb: Record<string, string> = {
        call_event: "CallEvent",
        lock_script: "LockScript",
        unlock_script: "UnlockScript",
        timer_restart: "TimerRestart",
        timer_remove: "TimerRemove"
      };
      return { opcode: opcodeByVerb[verb] ?? "Unknown", targetKind: "Event", targetIndex: eventIndexByName(context.events, operand), arg0: 0, arg1: 0, operand, rawCommand, enabled };
    }
    case "choice_event": {
      const operand = parts[3] ?? "";
      return {
        opcode: "ChoiceEvent",
        targetKind: "Event",
        targetIndex: eventIndexByName(context.events, operand),
        arg0: integerPart(parts[2], 0),
        arg1: 0,
        operand,
        rawCommand,
        enabled
      };
    }
    case "multiplayer_host":
    case "multiplayer_join": {
      const operand = parts[1] ?? "";
      return {
        opcode: verb === "multiplayer_host" ? "LinkHost" : "LinkJoin",
        targetKind: "Event",
        targetIndex: eventIndexByName(context.events, operand),
        arg0: Math.max(1, Math.min(600, integerPart(parts[2], 120))),
        arg1: 0,
        operand,
        rawCommand,
        enabled
      };
    }
    case "multiplayer_transfer": {
      const operand = parts[1] ?? "";
      return {
        opcode: "LinkTransfer",
        targetKind: "Variable",
        targetIndex: -1,
        arg0: Math.max(0, Math.min(255, integerPart(parts[2], 0))),
        arg1: Math.max(1, Math.min(600, integerPart(parts[3], 120))),
        operand,
        rawCommand,
        enabled
      };
    }
    case "multiplayer_close":
      return { opcode: "LinkClose", targetKind: "None", targetIndex: -1, arg0: 0, arg1: 0, operand: "", rawCommand, enabled };
    case "rumble_on":
      return { opcode: "RumbleOn", targetKind: "None", targetIndex: -1, arg0: 0, arg1: 0, operand: "", rawCommand, enabled };
    case "rumble_on_for":
      return {
        opcode: "RumbleOnFor",
        targetKind: "None",
        targetIndex: -1,
        arg0: Math.max(1, Math.min(600, integerPart(parts[1], 60))),
        arg1: 0,
        operand: "",
        rawCommand,
        enabled
      };
    case "rumble_off":
      return { opcode: "RumbleOff", targetKind: "None", targetIndex: -1, arg0: 0, arg1: 0, operand: "", rawCommand, enabled };
    case "multiplayer4_open":
      return {
        opcode: "MultiplayerOpen",
        targetKind: "None",
        targetIndex: -1,
        arg0: Math.max(2, Math.min(4, integerPart(parts[1], 2))),
        arg1: 0,
        operand: "",
        rawCommand,
        enabled
      };
    case "multiplayer4_set":
      return {
        opcode: "MultiplayerSetData",
        targetKind: "None",
        targetIndex: -1,
        arg0: Math.max(0, Math.min(65535, integerPart(parts[1], 0))),
        arg1: 0,
        operand: "",
        rawCommand,
        enabled
      };
    case "multiplayer4_sync":
      return { opcode: "MultiplayerTransfer", targetKind: "None", targetIndex: -1, arg0: 0, arg1: 0, operand: "", rawCommand, enabled };
    case "multiplayer4_read":
      return {
        opcode: "MultiplayerGetData",
        targetKind: "None",
        targetIndex: -1,
        arg0: 0,
        arg1: 0,
        operand: [parts[1] ?? "", parts[2] ?? "", parts[3] ?? ""].filter(Boolean).join(" "),
        rawCommand,
        enabled
      };
    case "multiplayer4_close":
      return { opcode: "MultiplayerClose", targetKind: "None", targetIndex: -1, arg0: 0, arg1: 0, operand: "", rawCommand, enabled };
    case "read_rtc":
      return {
        opcode: "ReadRtc",
        targetKind: "Variable",
        targetIndex: -1,
        arg0: rtcFieldIndex(parts[1]),
        arg1: 0,
        operand: parts[2] ?? "",
        rawCommand,
        enabled
      };
    case "if_rtc":
      return {
        opcode: "JumpIfRtcEquals",
        targetKind: "None",
        targetIndex: -1,
        arg0: rtcFieldIndex(parts[1]),
        arg1: integerPart(parts[2], 0),
        operand: "",
        rawCommand,
        enabled
      };
    case "set_variable":
    case "set_engine_field":
    case "store_save_variable":
    case "set_adventure_state":
    case "set_platform_state": {
      const operand = parts[1] ?? "";
      const opcodeByVerb: Record<string, string> = {
        set_variable: "SetVariable",
        set_engine_field: "SetEngineField",
        store_save_variable: "StoreSaveVariable",
        set_adventure_state: "SetAdventureState",
        set_platform_state: "SetPlatformState"
      };
      return { opcode: opcodeByVerb[verb] ?? "SetVariable", targetKind: "Variable", targetIndex: -1, arg0: integerPart(parts[2], 0), arg1: 0, operand, rawCommand, enabled };
    }
    case "add_variable":
    case "mod_variable":
    case "multiply_variable":
    case "random_variable":
    case "add_variable_flags":
    case "set_variable_flags":
    case "clear_variable_flags": {
      const operand = parts[1] ?? "";
      const opcodeByVerb: Record<string, string> = {
        add_variable: "AddVariable",
        mod_variable: "ModVariable",
        multiply_variable: "MultiplyVariable",
        random_variable: "RandomVariable",
        add_variable_flags: "AddVariableFlags",
        set_variable_flags: "SetVariableFlags",
        clear_variable_flags: "ClearVariableFlags"
      };
      return { opcode: opcodeByVerb[verb] ?? "AddVariable", targetKind: "Variable", targetIndex: -1, arg0: integerPart(parts[2], 0), arg1: 0, operand, rawCommand, enabled };
    }
    case "reset_variables_false":
      return { opcode: "ResetVariablesFalse", targetKind: "Variable", targetIndex: -1, arg0: 0, arg1: 0, operand: "", rawCommand, enabled };
    case "set_flag": {
      const operand = parts[1] ?? "";
      return { opcode: "SetFlag", targetKind: "Flag", targetIndex: -1, arg0: parts[2] === "false" ? 0 : 1, arg1: 0, operand, rawCommand, enabled };
    }
    case "add_item": {
      const operand = parts[1] ?? "";
      return { opcode: "AddItem", targetKind: "Inventory", targetIndex: -1, arg0: integerPart(parts[2], 1), arg1: 0, operand, rawCommand, enabled };
    }
    case "modify_wallet": {
      const operand = parts[1] ?? "";
      return { opcode: "ModifyWallet", targetKind: "Inventory", targetIndex: -1, arg0: integerPart(parts[2], 0), arg1: integerPart(parts[3], 0), operand, rawCommand, enabled };
    }
    case "set_equipped_item": {
      const slot = parts[1] ?? "";
      const item = parts[2] ?? "";
      return { opcode: "SetEquippedItem", targetKind: "Inventory", targetIndex: -1, arg0: integerPart(slot, 0), arg1: 0, operand: `${slot}:${item}`, rawCommand, enabled };
    }
    case "attach_button":
    case "timer_attach": {
      const operand = parts[2] ?? "";
      return {
        opcode: verb === "attach_button" ? "AttachButton" : "TimerAttach",
        targetKind: "Event",
        targetIndex: eventIndexByName(context.events, operand),
        arg0: 0,
        arg1: 0,
        operand,
        rawCommand,
        enabled
      };
    }
    default:
      return { opcode: "Unknown", targetKind: "None", targetIndex: -1, arg0: 0, arg1: 0, operand: parts[1] ?? "", rawCommand, enabled };
  }
}

function eventStepInitializer(eventIndex: number, step: Record<string, unknown>, context: EventCommandContext): string {
  const command = compiledEventCommand(step, context);
  return `{${[
    eventIndex.toString(),
    `EventCommandOpcode::${command.opcode}`,
    `EventCommandTargetKind::${command.targetKind}`,
    command.targetIndex.toString(),
    command.arg0.toString(),
    command.arg1.toString(),
    cppString(command.operand),
    cppString(command.rawCommand),
    cppBool(command.enabled)
  ].join(", ")}}`;
}

function eventInitializer(event: Record<string, unknown>, index: number, firstStepIndex: number, stepCount: number): string {
  return `{${[
    cppString(stringField(event, "id", `event-${index + 1}`)),
    cppString(stringField(event, "name", `event_${index + 1}`)),
    cppString(stringField(event, "category", "Custom")),
    cppString(nullableStringField(event, "detail")),
    firstStepIndex.toString(),
    stepCount.toString()
  ].join(", ")}}`;
}

function actorInitializer(data: GBAProjectData, actor: Record<string, unknown>, index: number, rooms: Record<string, unknown>[]): string {
  const eventBindings = child(actor, "eventBindings");
  const sprite = resolveGbaActorSprite(data, actor);
  return `{${[
    cppString(stringField(actor, "id", `actor-${index + 1}`)),
    cppString(stringField(actor, "name", `Actor ${index + 1}`)),
    roomIndexForEntity(actor, rooms).toString(),
    positionedIntegerField(actor, "x", 0).toString(),
    positionedIntegerField(actor, "y", 0).toString(),
    cppString(nullableStringField(actor, "eventName")),
    cppString(nullableStringField(eventBindings, "onInteract")),
    cppString(nullableStringField(actor, "spriteSheet")),
    cppString(nullableStringField(actor, "animationName")),
    cppString(sprite?.layer ?? gbaRenderLayers.obj),
    (sprite?.frame?.widthTiles ?? 1).toString(),
    (sprite?.frame?.heightTiles ?? 1).toString()
  ].join(", ")}}`;
}

function triggerInitializer(trigger: Record<string, unknown>, index: number, rooms: Record<string, unknown>[]): string {
  return `{${[
    cppString(stringField(trigger, "id", `trigger-${index + 1}`)),
    cppString(stringField(trigger, "name", `Trigger ${index + 1}`)),
    roomIndexForEntity(trigger, rooms).toString(),
    positionedIntegerField(trigger, "x", 0).toString(),
    positionedIntegerField(trigger, "y", 0).toString(),
    sizedIntegerField(trigger, "width", 1).toString(),
    sizedIntegerField(trigger, "height", 1).toString(),
    cppString(nullableStringField(trigger, "eventName")),
    cppString(nullableStringField(trigger, "onEnterEventName")),
    cppString(nullableStringField(trigger, "onLeaveEventName"))
  ].join(", ")}}`;
}

function dialogueChoices(dialogue: Record<string, unknown>): string[] {
  const choices = dialogue.choices;
  return Array.isArray(choices) ? choices.filter((choice): choice is string => typeof choice === "string") : [];
}

function dialogueChoiceInitializer(dialogueIndex: number, choice: string): string {
  return `{${[dialogueIndex.toString(), cppString(choice)].join(", ")}}`;
}

function dialogueInitializer(dialogue: Record<string, unknown>, firstChoiceIndex: number, choiceCount: number): string {
  return `{${[
    cppString(stringField(dialogue, "key", "")),
    cppString(nullableStringField(dialogue, "character")),
    cppString(nullableStringField(dialogue, "portrait")),
    cppString(nullableStringField(dialogue, "actorId")),
    cppString(runtimeDialogueText(nullableStringField(dialogue, "text"))),
    firstChoiceIndex.toString(),
    choiceCount.toString()
  ].join(", ")}}`;
}

function projectDataHeader(data: GBAProjectData, pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()): string {
  const rooms = projectRooms(data);
  const events = projectArray(data, "events");
  const audioItems = projectArray(data, "audioItems");
  const assets = projectArray(data, "assets");
  const actors = projectArray(data, "actors");
  const triggers = projectArray(data, "triggers");
  const dialogues = projectArray(data, "dialogues");
  const firstRoom = rooms[0];
  const startScene = stringField(child(settings(data), "general"), "startScene", stringField(firstRoom, "name", ""));
  const runtimeCapabilities = buildProjectRuntimeCapabilityManifest(data);
  const runtimeCapabilityCppIDs: Record<string, string> = {
    save: "Save",
    rtc: "Rtc",
    link: "Link",
    affine: "Affine"
  };
  const runtimeCapabilityLines = runtimeCapabilities.capabilities.map((capability) => (
    `    {gbs::RuntimeCapabilityID::${runtimeCapabilityCppIDs[capability.id]}, ${capability.enabled ? "true" : "false"}, ${capability.required ? "true" : "false"}}`
  )).join(",\n");
  const eventStepLines: string[] = [];
  const eventLines: string[] = [];
  const dialogueChoiceLines: string[] = [];
  const dialogueLines: string[] = [];
  const tileCellLines: string[] = [];
  const foregroundCellLines: string[] = [];
  const collisionCellLines: string[] = [];
  const roomLines: string[] = [];
  const eventCommandContext: EventCommandContext = { rooms, events, audioItems, dialogues, pluginRegistry };
  const audioExportData = buildAudioExportData(audioItems);

  rooms.forEach((room, index) => {
    const firstTileIndex = tileCellLines.length;
    const tiles = roomTileCells(room);
    tileCellLines.push(...tiles.map((tileID, cellIndex) => tileCellInitializer(index, cellIndex, tileID)));

    const firstForegroundIndex = foregroundCellLines.length;
    const foreground = roomForegroundTileCells(room);
    foregroundCellLines.push(...foreground.map((cell) => tileCellInitializer(index, cell.cellIndex, cell.tileID)));

    const firstCollisionIndex = collisionCellLines.length;
    const collisions = roomCollisionCells(room);
    collisionCellLines.push(...collisions.map((isBlocked, cellIndex) => collisionCellInitializer(index, cellIndex, isBlocked)));

    roomLines.push(roomInitializer(
      data,
      room,
      index,
      firstTileIndex,
      tiles.length,
      firstForegroundIndex,
      foreground.length,
      firstCollisionIndex,
      collisions.length
    ));
  });

  events.forEach((event, index) => {
    const firstStepIndex = eventStepLines.length;
    const steps = eventSteps(event);
    eventStepLines.push(...steps.map((step) => eventStepInitializer(index, step, eventCommandContext)));
    eventLines.push(eventInitializer(event, index, firstStepIndex, steps.length));
  });

  dialogues.forEach((dialogue, index) => {
    const firstChoiceIndex = dialogueChoiceLines.length;
    const choices = dialogueChoices(dialogue);
    dialogueChoiceLines.push(...choices.map((choice) => dialogueChoiceInitializer(index, choice)));
    dialogueLines.push(dialogueInitializer(dialogue, firstChoiceIndex, choices.length));
  });

  return `#pragma once

#include "gbs/runtime_capabilities.hpp"

// Generated by the Electron migration shell.
// This header is the incremental runtime bridge between .gba-project and
// GBAStudioEnginePack. Keep this data-only and deterministic.

namespace gbastudio_project {

constexpr const char* title = ${cppString(projectTitle(data))};
constexpr const char* start_scene = ${cppString(startScene)};
constexpr int room_count = ${rooms.length};
constexpr int actor_count = ${actors.length};
constexpr int trigger_count = ${triggers.length};
constexpr int event_count = ${events.length};
constexpr int event_step_count = ${eventStepLines.length};
constexpr int dialogue_count = ${dialogues.length};
constexpr int dialogue_choice_count = ${dialogueChoiceLines.length};
constexpr int audio_count = ${audioItems.length};
constexpr int audio_pattern_count = ${audioExportData.patternLines.length};
constexpr int audio_pattern_order_count = ${audioExportData.patternOrderLines.length};
constexpr int audio_note_count = ${audioExportData.noteLines.length};
constexpr int asset_count = ${assets.length};
constexpr int tile_cell_count = ${tileCellLines.length};
constexpr int foreground_cell_count = ${foregroundCellLines.length};
constexpr int collision_cell_count = ${collisionCellLines.length};
constexpr int runtime_capability_count = ${runtimeCapabilities.capabilities.length};
constexpr int room_storage_count = room_count > 0 ? room_count : 1;
constexpr int actor_storage_count = actor_count > 0 ? actor_count : 1;
constexpr int trigger_storage_count = trigger_count > 0 ? trigger_count : 1;
constexpr int event_storage_count = event_count > 0 ? event_count : 1;
constexpr int event_step_storage_count = event_step_count > 0 ? event_step_count : 1;
constexpr int dialogue_storage_count = dialogue_count > 0 ? dialogue_count : 1;
constexpr int dialogue_choice_storage_count = dialogue_choice_count > 0 ? dialogue_choice_count : 1;
constexpr int audio_storage_count = audio_count > 0 ? audio_count : 1;
constexpr int audio_pattern_storage_count = audio_pattern_count > 0 ? audio_pattern_count : 1;
constexpr int audio_pattern_order_storage_count = audio_pattern_order_count > 0 ? audio_pattern_order_count : 1;
constexpr int audio_note_storage_count = audio_note_count > 0 ? audio_note_count : 1;
constexpr int asset_storage_count = asset_count > 0 ? asset_count : 1;
constexpr int tile_cell_storage_count = tile_cell_count > 0 ? tile_cell_count : 1;
constexpr int foreground_cell_storage_count = foreground_cell_count > 0 ? foreground_cell_count : 1;
constexpr int collision_cell_storage_count = collision_cell_count > 0 ? collision_cell_count : 1;

constexpr gbs::RuntimeCapabilityDescriptor runtime_capability_entries[] = {
${runtimeCapabilityLines}
};
constexpr gbs::RuntimeCapabilityManifest runtime_capability_manifest {
    1,
    runtime_capability_entries,
    runtime_capability_count
};

struct RoomData {
    const char* id;
    const char* name;
    int width;
    int height;
    const char* scene_type;
    const char* music;
    const char* background_asset;
    const char* background_layer;
    const char* on_init_event;
    int first_tile_index;
    int tile_count;
    int first_foreground_index;
    int foreground_count;
    int first_collision_index;
    int collision_count;
};

struct TileCellData {
    int room_index;
    int cell_index;
    int tile_id;
};

struct ForegroundCellData {
    int room_index;
    int cell_index;
    int tile_id;
};

struct CollisionCellData {
    int room_index;
    int cell_index;
    bool blocked;
};

struct AssetData {
    const char* id;
    const char* name;
    const char* kind;
    const char* source;
};

struct AudioData {
    const char* id;
    const char* name;
    const char* kind;
    const char* format;
    const char* export_id;
    bool loops;
    int volume;
};

struct AudioPatternData {
    int audio_index;
    const char* id;
    const char* name;
    int steps;
    int first_note_index;
    int note_count;
};

struct AudioPatternOrderData {
    int audio_index;
    int order_index;
    int pattern_index;
};

struct AudioNoteData {
    int audio_index;
    int pattern_index;
    const char* channel_id;
    const char* channel;
    const char* channel_type;
    int step;
    const char* note;
    const char* instrument;
    const char* envelope;
};

struct ActorData {
    const char* id;
    const char* name;
    int room_index;
    int x;
    int y;
    const char* event_name;
    const char* on_interact_event;
    const char* sprite_sheet;
    const char* animation_name;
    const char* render_layer;
    int sprite_width_tiles;
    int sprite_height_tiles;
};

struct TriggerData {
    const char* id;
    const char* name;
    int room_index;
    int x;
    int y;
    int width;
    int height;
    const char* event_name;
    const char* on_enter_event;
    const char* on_leave_event;
};

struct DialogueChoiceData {
    int dialogue_index;
    const char* text;
};

struct DialogueData {
    const char* key;
    const char* character;
    const char* portrait;
    const char* actor_id;
    const char* text;
    int first_choice_index;
    int choice_count;
};

enum class EventCommandOpcode {
    Noop,
    PlayMusic,
    PlaySfx,
    ShowDialogue,
    ShowChoice,
    ChangeScene,
    CallEvent,
    ChoiceEvent,
    AttachButton,
    TimerAttach,
    LockScript,
    UnlockScript,
    TimerRestart,
    TimerRemove,
    SetVariable,
    AddVariable,
    ModVariable,
    MultiplyVariable,
    RandomVariable,
    AddVariableFlags,
    SetVariableFlags,
    ClearVariableFlags,
    ResetVariablesFalse,
    SetFlag,
    AddItem,
    ModifyWallet,
    SetEquippedItem,
    SetEngineField,
    StoreSaveVariable,
    SetAdventureState,
    SetPlatformState,
    ReadRtc,
    JumpIfRtcEquals,
    LinkHost,
    LinkJoin,
    LinkTransfer,
    LinkClose,
    RumbleOn,
    RumbleOnFor,
    RumbleOff,
    MultiplayerOpen,
    MultiplayerClose,
    MultiplayerSetData,
    MultiplayerTransfer,
    MultiplayerGetData,
    Unknown
};

enum class EventCommandTargetKind {
    None,
    Audio,
    Dialogue,
    Room,
    Event,
    Variable,
    Flag,
    Inventory
};

struct EventStepData {
    int event_index;
    EventCommandOpcode opcode;
    EventCommandTargetKind target_kind;
    int target_index;
    int arg0;
    int arg1;
    const char* operand;
    const char* raw_command;
    bool enabled;
};

struct EventData {
    const char* id;
    const char* name;
    const char* category;
    const char* detail;
    int first_step_index;
    int step_count;
};

constexpr RoomData rooms[room_storage_count] = {
${arrayInitializer(roomLines, "{\"\", \"\", 1, 1, \"topdown\", \"\", \"\", \"BG2\", \"\", 0, 0, 0, 0, 0, 0}")}
};

constexpr TileCellData tile_cells[tile_cell_storage_count] = {
${arrayInitializer(tileCellLines, "{0, 0, 0}")}
};

constexpr ForegroundCellData foreground_cells[foreground_cell_storage_count] = {
${arrayInitializer(foregroundCellLines, "{0, 0, 0}")}
};

constexpr CollisionCellData collision_cells[collision_cell_storage_count] = {
${arrayInitializer(collisionCellLines, "{0, 0, false}")}
};

constexpr AssetData assets[asset_storage_count] = {
${arrayInitializer(assets.map(assetInitializer), "{\"\", \"\", \"Unknown\", \"\"}")}
};

constexpr AudioData audio_items[audio_storage_count] = {
${arrayInitializer(audioItems.map(audioInitializer), "{\"\", \"\", \"Audio\", \"Unknown\", \"\", false, 100}")}
};

constexpr AudioPatternData audio_patterns[audio_pattern_storage_count] = {
${arrayInitializer(audioExportData.patternLines, "{0, \"\", \"\", 1, 0, 0}")}
};

constexpr AudioPatternOrderData audio_pattern_order[audio_pattern_order_storage_count] = {
${arrayInitializer(audioExportData.patternOrderLines, "{0, 0, 0}")}
};

constexpr AudioNoteData audio_notes[audio_note_storage_count] = {
${arrayInitializer(audioExportData.noteLines, "{0, 0, \"\", \"\", \"audio\", 0, \"\", \"Pulse Lead\", \"Soft ADSR\"}")}
};

constexpr ActorData actors[actor_storage_count] = {
${arrayInitializer(actors.map((actor, index) => actorInitializer(data, actor, index, rooms)), "{\"\", \"\", -1, 0, 0, \"\", \"\", \"\", \"\", \"OBJ\", 1, 1}")}
};

constexpr TriggerData triggers[trigger_storage_count] = {
${arrayInitializer(triggers.map((trigger, index) => triggerInitializer(trigger, index, rooms)), "{\"\", \"\", -1, 0, 0, 1, 1, \"\", \"\", \"\"}")}
};

constexpr DialogueChoiceData dialogue_choices[dialogue_choice_storage_count] = {
${arrayInitializer(dialogueChoiceLines, "{0, \"\"}")}
};

constexpr DialogueData dialogues[dialogue_storage_count] = {
${arrayInitializer(dialogueLines, "{\"\", \"\", \"\", \"\", \"\", 0, 0}")}
};

constexpr EventStepData event_steps[event_step_storage_count] = {
${arrayInitializer(eventStepLines, "{0, EventCommandOpcode::Noop, EventCommandTargetKind::None, -1, 0, 0, \"\", \"noop\", true}")}
};

constexpr EventData events[event_storage_count] = {
${arrayInitializer(eventLines, "{\"\", \"\", \"Custom\", \"\", 0, 0}")}
};

} // namespace gbastudio_project
`;
}

function mainCpp(): string {
  return `#include "gbs/debug.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/engine.hpp"
#include "gbs/input.hpp"
#include "gbs/render.hpp"
#include "gbs/runtime.hpp"
#include "gbastudio_project_data.hpp"

namespace {

constexpr int max_runtime_room_tiles = 64 * 64;
constexpr int runtime_bg_width = 32;
constexpr int runtime_bg_height = 32;
constexpr int max_runtime_variables = 32;
constexpr int max_runtime_flags = 32;
constexpr int max_runtime_inventory = 32;
constexpr int max_runtime_wallets = 16;
constexpr int max_runtime_equipped_items = 8;
constexpr int max_event_call_depth = 8;
constexpr uint16_t tile_runtime_empty = 1;
constexpr uint16_t tile_runtime_collision = 2;
constexpr uint16_t tile_runtime_trigger = 3;
constexpr uint16_t tile_runtime_player = 4;

struct RuntimeNamedNumber {
    const char* key;
    int value;
    bool used;
};

struct RuntimeWallet {
    const char* key;
    int value;
    int max_value;
    bool used;
};

struct RuntimeEquippedItem {
    int slot;
    const char* item;
    bool used;
};

struct RuntimeWitnessState {
    unsigned int frame;
    unsigned int phase;
    int current_room;
    int boot_event;
    int dialogue;
    int actor;
    int trigger;
    int change_room;
    int audio;
    int state;
    bool ok;
};

struct PlayableRuntimeState {
    int current_room;
    int player_x;
    int player_y;
    int player_actor_index;
    int active_dialogue;
    int active_trigger;
    int room_changes;
    int event_step_count;
    int last_music_index;
    int last_sfx_index;
    int audio_event_count;
    int audio_pattern_count;
    int audio_note_count;
    int state_mutation_count;
    int event_call_depth;
    const char* player_sprite_sheet;
    const char* player_animation_name;
    bool boot_event_ran;
    bool player_visible;
    bool debug_overlay_visible;
};

RuntimeWitnessState runtime_witness {
    0u,
    0u,
    0,
    0,
    -1,
    -1,
    -1,
    -1,
    0,
    0,
    false
};

PlayableRuntimeState runtime {
    0,
    1,
    1,
    -1,
    -1,
    -1,
    0,
    0,
    -1,
    -1,
    0,
    gbastudio_project::audio_pattern_count,
    gbastudio_project::audio_note_count,
    0,
    0,
    "",
    "",
    false,
    false,
    false
};

gbs::DialogueState dialogue_state;
uint16_t runtime_room_tiles[max_runtime_room_tiles];
RuntimeNamedNumber runtime_variables[max_runtime_variables];
RuntimeNamedNumber runtime_flags[max_runtime_flags];
RuntimeNamedNumber runtime_inventory[max_runtime_inventory];
RuntimeWallet runtime_wallets[max_runtime_wallets];
RuntimeEquippedItem runtime_equipped_items[max_runtime_equipped_items];

bool has_text(const char* value) {
    return value != nullptr && value[0] != '\\0';
}

bool same_text(const char* left, const char* right) {
    if (!has_text(left) || !has_text(right)) {
        return false;
    }
    while (*left != '\\0' || *right != '\\0') {
        if (*left != *right) {
            return false;
        }
        ++left;
        ++right;
    }
    return true;
}

const gbastudio_project::EventStepData* find_first_enabled_step(
    gbastudio_project::EventCommandOpcode opcode,
    gbastudio_project::EventCommandTargetKind target_kind
) {
    for (int index = 0; index < gbastudio_project::event_step_count; ++index) {
        const gbastudio_project::EventStepData& step = gbastudio_project::event_steps[index];
        if (step.enabled && step.opcode == opcode && step.target_kind == target_kind && step.target_index >= 0) {
            return &step;
        }
    }
    return nullptr;
}

int find_event_index_by_name(const char* name) {
    if (!has_text(name)) {
        return -1;
    }
    for (int index = 0; index < gbastudio_project::event_count; ++index) {
        if (gbastudio_project::events[index].name == nullptr) {
            continue;
        }
        if (same_text(gbastudio_project::events[index].name, name)) {
            return index;
        }
    }
    return -1;
}

int find_runtime_number_slot(RuntimeNamedNumber* slots, int slot_count, const char* key, bool create) {
    if (!has_text(key)) {
        return -1;
    }
    for (int index = 0; index < slot_count; ++index) {
        if (slots[index].used && same_text(slots[index].key, key)) {
            return index;
        }
    }
    if (!create) {
        return -1;
    }
    for (int index = 0; index < slot_count; ++index) {
        if (!slots[index].used) {
            slots[index].key = key;
            slots[index].value = 0;
            slots[index].used = true;
            return index;
        }
    }
    return -1;
}

int get_runtime_number(RuntimeNamedNumber* slots, int slot_count, const char* key, int fallback) {
    const int index = find_runtime_number_slot(slots, slot_count, key, false);
    return index >= 0 ? slots[index].value : fallback;
}

void set_runtime_number(RuntimeNamedNumber* slots, int slot_count, const char* key, int value) {
    const int index = find_runtime_number_slot(slots, slot_count, key, true);
    if (index >= 0) {
        slots[index].value = value;
        ++runtime.state_mutation_count;
    }
}

void add_runtime_number(RuntimeNamedNumber* slots, int slot_count, const char* key, int amount) {
    set_runtime_number(slots, slot_count, key, get_runtime_number(slots, slot_count, key, 0) + amount);
}

void set_runtime_variable(const char* key, int value) {
    set_runtime_number(runtime_variables, max_runtime_variables, key, value);
}

bool read_runtime_rtc_field(int field, int& value) {
    gbs::RtcDateTime date_time {};
    if (!gbs::runtime_read_rtc_datetime(date_time)) {
        return false;
    }
    return gbs::rtc_field_value(date_time, static_cast<gbs::RtcField>(field), value);
}

void add_runtime_variable(const char* key, int amount) {
    add_runtime_number(runtime_variables, max_runtime_variables, key, amount);
}

void multiply_runtime_variable(const char* key, int amount) {
    set_runtime_number(runtime_variables, max_runtime_variables, key, get_runtime_number(runtime_variables, max_runtime_variables, key, 1) * amount);
}

void set_runtime_flag(const char* key, int value) {
    set_runtime_number(runtime_flags, max_runtime_flags, key, value != 0 ? 1 : 0);
}

void add_runtime_inventory(const char* key, int amount) {
    add_runtime_number(runtime_inventory, max_runtime_inventory, key, amount);
}

void modify_runtime_wallet(const char* key, int amount, int max_value) {
    if (!has_text(key)) {
        return;
    }
    int slot = -1;
    for (int index = 0; index < max_runtime_wallets; ++index) {
        if (runtime_wallets[index].used && same_text(runtime_wallets[index].key, key)) {
            slot = index;
            break;
        }
    }
    if (slot < 0) {
        for (int index = 0; index < max_runtime_wallets; ++index) {
            if (!runtime_wallets[index].used) {
                runtime_wallets[index].key = key;
                runtime_wallets[index].value = 0;
                runtime_wallets[index].max_value = max_value;
                runtime_wallets[index].used = true;
                slot = index;
                break;
            }
        }
    }
    if (slot >= 0) {
        runtime_wallets[slot].value += amount;
        runtime_wallets[slot].max_value = max_value;
        ++runtime.state_mutation_count;
    }
}

const char* equipped_item_from_operand(const char* operand) {
    if (!has_text(operand)) {
        return "";
    }
    const char* item = operand;
    while (*item != '\\0' && *item != ':') {
        ++item;
    }
    return *item == ':' ? item + 1 : "";
}

void set_runtime_equipped_item(int slot, const char* item) {
    if (slot < 0) {
        return;
    }
    for (int index = 0; index < max_runtime_equipped_items; ++index) {
        if (runtime_equipped_items[index].used && runtime_equipped_items[index].slot == slot) {
            runtime_equipped_items[index].item = item;
            ++runtime.state_mutation_count;
            return;
        }
    }
    for (int index = 0; index < max_runtime_equipped_items; ++index) {
        if (!runtime_equipped_items[index].used) {
            runtime_equipped_items[index].slot = slot;
            runtime_equipped_items[index].item = item;
            runtime_equipped_items[index].used = true;
            ++runtime.state_mutation_count;
            return;
        }
    }
}

bool reset_player_for_room() {
    runtime.player_actor_index = -1;
    runtime.player_visible = false;
    runtime.player_x = 1;
    runtime.player_y = 1;
    runtime.player_sprite_sheet = "";
    runtime.player_animation_name = "";
    for (int index = 0; index < gbastudio_project::actor_count; ++index) {
        const gbastudio_project::ActorData& actor = gbastudio_project::actors[index];
        if (actor.room_index == runtime.current_room) {
            runtime.player_actor_index = index;
            runtime.player_x = actor.x;
            runtime.player_y = actor.y;
            runtime.player_sprite_sheet = actor.sprite_sheet;
            runtime.player_animation_name = actor.animation_name;
            runtime.player_visible = true;
            return true;
        }
    }
    return false;
}

void initialize_playable_runtime() {
    runtime.current_room = 0;
    if (gbastudio_project::start_scene != nullptr && gbastudio_project::start_scene[0] != '\\0') {
        for (int index = 0; index < gbastudio_project::room_count; ++index) {
            if (gbastudio_project::rooms[index].name == nullptr) {
                continue;
            }
            const char* left = gbastudio_project::rooms[index].name;
            const char* right = gbastudio_project::start_scene;
            bool same = true;
            while (*left != '\\0' || *right != '\\0') {
                if (*left != *right) {
                    same = false;
                    break;
                }
                ++left;
                ++right;
            }
            if (same) {
                runtime.current_room = index;
                break;
            }
        }
    }
    reset_player_for_room();
}

int clamp_to_room_axis(int value, int max_value) {
    if (max_value <= 0) {
        return 0;
    }
    if (value < 0) {
        return 0;
    }
    if (value >= max_value) {
        return max_value - 1;
    }
    return value;
}

bool is_blocked_tile(int room_index, int x, int y) {
    if (room_index < 0 || room_index >= gbastudio_project::room_count) {
        return true;
    }
    const gbastudio_project::RoomData& room = gbastudio_project::rooms[room_index];
    if (x < 0 || y < 0 || x >= room.width || y >= room.height) {
        return true;
    }
    const int cell_index = y * room.width + x;
    if (cell_index < 0 || cell_index >= room.collision_count) {
        return false;
    }
    const gbastudio_project::CollisionCellData& collision =
        gbastudio_project::collision_cells[room.first_collision_index + cell_index];
    return collision.blocked;
}

void show_dialogue_by_index(int dialogue_index) {
    if (dialogue_index < 0 || dialogue_index >= gbastudio_project::dialogue_count) {
        return;
    }
    const gbastudio_project::DialogueData& dialogue = gbastudio_project::dialogues[dialogue_index];
    gbs::DialogueLine dialogue_line {};
    dialogue_line.text = dialogue.text;
    dialogue_line.speaker = dialogue.character;
    dialogue_line.portrait = dialogue.portrait;
    dialogue_line.key = dialogue.key;
    dialogue_line.actor_id = dialogue.actor_id;
    runtime.active_dialogue = dialogue_index;
    gbs::show_dialogue(dialogue_state, &dialogue_line, 1, 0);
}

void change_room(int room_index, int fallback_x, int fallback_y) {
    if (room_index < 0 || room_index >= gbastudio_project::room_count) {
        return;
    }
    const int previous_x = runtime.player_x;
    const int previous_y = runtime.player_y;
    runtime.current_room = room_index;
    ++runtime.room_changes;
    runtime.active_trigger = -1;
    if (!reset_player_for_room()) {
        const gbastudio_project::RoomData& room = gbastudio_project::rooms[runtime.current_room];
        const bool has_explicit_position = fallback_x != 0 || fallback_y != 0;
        runtime.player_x = clamp_to_room_axis(has_explicit_position ? fallback_x : previous_x, room.width);
        runtime.player_y = clamp_to_room_axis(has_explicit_position ? fallback_y : previous_y, room.height);
        runtime.player_visible = true;
    }
}

void run_event_by_index(int event_index);

void run_event_step(const gbastudio_project::EventStepData& step) {
    if (!step.enabled) {
        return;
    }
    ++runtime.event_step_count;
    switch (step.opcode) {
    case gbastudio_project::EventCommandOpcode::ShowDialogue:
    case gbastudio_project::EventCommandOpcode::ShowChoice:
        if (step.target_kind == gbastudio_project::EventCommandTargetKind::Dialogue) {
            show_dialogue_by_index(step.target_index);
        }
        break;
    case gbastudio_project::EventCommandOpcode::ChangeScene:
        if (step.target_kind == gbastudio_project::EventCommandTargetKind::Room) {
            change_room(step.target_index, step.arg0, step.arg1);
        }
        break;
    case gbastudio_project::EventCommandOpcode::PlayMusic:
        runtime.last_music_index = step.target_index;
        ++runtime.audio_event_count;
        break;
    case gbastudio_project::EventCommandOpcode::PlaySfx:
        runtime.last_sfx_index = step.target_index;
        ++runtime.audio_event_count;
        break;
    case gbastudio_project::EventCommandOpcode::CallEvent:
        if (step.target_kind == gbastudio_project::EventCommandTargetKind::Event) {
            run_event_by_index(step.target_index);
        }
        break;
    case gbastudio_project::EventCommandOpcode::SetVariable:
    case gbastudio_project::EventCommandOpcode::SetEngineField:
    case gbastudio_project::EventCommandOpcode::StoreSaveVariable:
    case gbastudio_project::EventCommandOpcode::SetAdventureState:
    case gbastudio_project::EventCommandOpcode::SetPlatformState:
    case gbastudio_project::EventCommandOpcode::RandomVariable:
    case gbastudio_project::EventCommandOpcode::SetVariableFlags:
        set_runtime_variable(step.operand, step.arg0);
        break;
    case gbastudio_project::EventCommandOpcode::ReadRtc: {
        int value = 0;
        if (read_runtime_rtc_field(step.arg0, value)) {
            set_runtime_variable(step.operand, value);
        }
        break;
    }
    case gbastudio_project::EventCommandOpcode::LinkHost:
    case gbastudio_project::EventCommandOpcode::LinkJoin:
        if (step.target_kind == gbastudio_project::EventCommandTargetKind::Event) {
            run_event_by_index(step.target_index);
        }
        break;
    case gbastudio_project::EventCommandOpcode::LinkTransfer:
        set_runtime_variable(step.operand, step.arg0);
        break;
    case gbastudio_project::EventCommandOpcode::LinkClose:
        break;
    case gbastudio_project::EventCommandOpcode::RumbleOn:
    case gbastudio_project::EventCommandOpcode::RumbleOnFor:
    case gbastudio_project::EventCommandOpcode::RumbleOff:
    case gbastudio_project::EventCommandOpcode::MultiplayerOpen:
    case gbastudio_project::EventCommandOpcode::MultiplayerClose:
    case gbastudio_project::EventCommandOpcode::MultiplayerSetData:
    case gbastudio_project::EventCommandOpcode::MultiplayerTransfer:
    case gbastudio_project::EventCommandOpcode::MultiplayerGetData:
        // Preview records haptics/multiplayer intent; the GBA runtime drives GPIO/SIO.
        break;
    case gbastudio_project::EventCommandOpcode::AddVariable:
    case gbastudio_project::EventCommandOpcode::ModVariable:
        add_runtime_variable(step.operand, step.arg0);
        break;
    case gbastudio_project::EventCommandOpcode::MultiplyVariable:
        multiply_runtime_variable(step.operand, step.arg0);
        break;
    case gbastudio_project::EventCommandOpcode::AddVariableFlags:
        set_runtime_variable(step.operand, get_runtime_number(runtime_variables, max_runtime_variables, step.operand, 0) | step.arg0);
        break;
    case gbastudio_project::EventCommandOpcode::ClearVariableFlags:
        set_runtime_variable(step.operand, get_runtime_number(runtime_variables, max_runtime_variables, step.operand, 0) & ~step.arg0);
        break;
    case gbastudio_project::EventCommandOpcode::ResetVariablesFalse:
        for (int index = 0; index < max_runtime_variables; ++index) {
            if (runtime_variables[index].used) {
                runtime_variables[index].value = 0;
            }
        }
        ++runtime.state_mutation_count;
        break;
    case gbastudio_project::EventCommandOpcode::SetFlag:
        set_runtime_flag(step.operand, step.arg0);
        break;
    case gbastudio_project::EventCommandOpcode::AddItem:
        add_runtime_inventory(step.operand, step.arg0);
        break;
    case gbastudio_project::EventCommandOpcode::ModifyWallet:
        modify_runtime_wallet(step.operand, step.arg0, step.arg1);
        break;
    case gbastudio_project::EventCommandOpcode::SetEquippedItem:
        set_runtime_equipped_item(step.arg0, equipped_item_from_operand(step.operand));
        break;
    default:
        break;
    }
}

void run_event_by_index(int event_index) {
    if (event_index < 0 || event_index >= gbastudio_project::event_count) {
        return;
    }
    if (runtime.event_call_depth >= max_event_call_depth) {
        return;
    }
    ++runtime.event_call_depth;
    const gbastudio_project::EventData& event = gbastudio_project::events[event_index];
    for (int offset = 0; offset < event.step_count; ++offset) {
        run_event_step(gbastudio_project::event_steps[event.first_step_index + offset]);
    }
    --runtime.event_call_depth;
}

void run_event_by_name(const char* event_name) {
    run_event_by_index(find_event_index_by_name(event_name));
}

void run_room_boot_event() {
    if (runtime.boot_event_ran || runtime.current_room < 0 || runtime.current_room >= gbastudio_project::room_count) {
        return;
    }
    runtime.boot_event_ran = true;
    run_event_by_name(gbastudio_project::rooms[runtime.current_room].on_init_event);
}

void try_move_player(int dx, int dy) {
    if (!runtime.player_visible) {
        return;
    }
    const int next_x = runtime.player_x + dx;
    const int next_y = runtime.player_y + dy;
    if (is_blocked_tile(runtime.current_room, next_x, next_y)) {
        return;
    }
    runtime.player_x = next_x;
    runtime.player_y = next_y;
}

void run_player_interaction() {
    if (runtime.player_actor_index < 0 || runtime.player_actor_index >= gbastudio_project::actor_count) {
        return;
    }
    const gbastudio_project::ActorData& actor = gbastudio_project::actors[runtime.player_actor_index];
    run_event_by_name(has_text(actor.on_interact_event) ? actor.on_interact_event : actor.event_name);
}

void handle_trigger_overlap() {
    runtime.active_trigger = -1;
    for (int index = 0; index < gbastudio_project::trigger_count; ++index) {
        const gbastudio_project::TriggerData& trigger = gbastudio_project::triggers[index];
        if (trigger.room_index != runtime.current_room) {
            continue;
        }
        if (
            runtime.player_x >= trigger.x &&
            runtime.player_x < trigger.x + trigger.width &&
            runtime.player_y >= trigger.y &&
            runtime.player_y < trigger.y + trigger.height
        ) {
            runtime.active_trigger = index;
            run_event_by_name(has_text(trigger.on_enter_event) ? trigger.on_enter_event : trigger.event_name);
            return;
        }
    }
}

void set_runtime_room_tile(int x, int y, uint16_t tile) {
    if (runtime.current_room < 0 || runtime.current_room >= gbastudio_project::room_count) {
        return;
    }
    const gbastudio_project::RoomData& room = gbastudio_project::rooms[runtime.current_room];
    if (x < 0 || y < 0 || x >= room.width || y >= room.height) {
        return;
    }
    const int cell_index = y * room.width + x;
    if (cell_index >= 0 && cell_index < max_runtime_room_tiles) {
        runtime_room_tiles[cell_index] = tile;
    }
}

void update_playable_runtime(gbs::InputState input) {
    if (input.was_pressed(gbs::ButtonSelect)) {
        runtime.debug_overlay_visible = !runtime.debug_overlay_visible;
    }
    if (dialogue_state.visible) {
        gbs::advance_dialogue(dialogue_state, input);
        return;
    }
    if (input.is_held(gbs::ButtonLeft)) {
        try_move_player(-1, 0);
    } else if (input.is_held(gbs::ButtonRight)) {
        try_move_player(1, 0);
    } else if (input.is_held(gbs::ButtonUp)) {
        try_move_player(0, -1);
    } else if (input.is_held(gbs::ButtonDown)) {
        try_move_player(0, 1);
    }
    if (input.was_pressed(gbs::ButtonA)) {
        run_player_interaction();
    }
    handle_trigger_overlap();
}

void build_runtime_room_tiles() {
    for (int index = 0; index < max_runtime_room_tiles; ++index) {
        runtime_room_tiles[index] = 0;
    }
    if (runtime.current_room < 0 || runtime.current_room >= gbastudio_project::room_count) {
        return;
    }
    const gbastudio_project::RoomData& room = gbastudio_project::rooms[runtime.current_room];
    const int tile_count = room.tile_count < max_runtime_room_tiles ? room.tile_count : max_runtime_room_tiles;
    for (int offset = 0; offset < tile_count; ++offset) {
        const gbastudio_project::TileCellData& cell = gbastudio_project::tile_cells[room.first_tile_index + offset];
        runtime_room_tiles[offset] = cell.tile_id > 0 ? static_cast<uint16_t>(cell.tile_id) : tile_runtime_empty;
    }
    for (int offset = 0; offset < room.collision_count && offset < max_runtime_room_tiles; ++offset) {
        const gbastudio_project::CollisionCellData& cell =
            gbastudio_project::collision_cells[room.first_collision_index + offset];
        if (cell.blocked && cell.cell_index >= 0 && cell.cell_index < max_runtime_room_tiles) {
            runtime_room_tiles[cell.cell_index] = tile_runtime_collision;
        }
    }
    for (int index = 0; index < gbastudio_project::trigger_count; ++index) {
        const gbastudio_project::TriggerData& trigger = gbastudio_project::triggers[index];
        if (trigger.room_index != runtime.current_room) {
            continue;
        }
        for (int dy = 0; dy < trigger.height; ++dy) {
            for (int dx = 0; dx < trigger.width; ++dx) {
                set_runtime_room_tile(trigger.x + dx, trigger.y + dy, tile_runtime_trigger);
            }
        }
    }
    if (runtime.player_visible) {
        set_runtime_room_tile(runtime.player_x, runtime.player_y, tile_runtime_player);
    }
}

void draw_runtime_room_layer(const gbastudio_project::RoomData& room) {
    for (int y = 0; y < runtime_bg_height; ++y) {
        for (int x = 0; x < runtime_bg_width; ++x) {
            uint16_t tile = 0;
            if (x >= 0 && y >= 0 && x < room.width && y < room.height) {
                const int cell_index = y * room.width + x;
                if (cell_index >= 0 && cell_index < max_runtime_room_tiles) {
                    tile = runtime_room_tiles[cell_index];
                }
            }
            gbs::set_bg_tile(gbs::BackgroundLayer::BG2, x, y, runtime_bg_width, runtime_bg_height, tile);
        }
    }
}

void draw_runtime_foreground_layer(const gbastudio_project::RoomData& room) {
    for (int y = 0; y < runtime_bg_height; ++y) {
        for (int x = 0; x < runtime_bg_width; ++x) {
            gbs::set_bg_tile(gbs::BackgroundLayer::BG1, x, y, runtime_bg_width, runtime_bg_height, 0);
        }
    }
    for (int offset = 0; offset < room.foreground_count; ++offset) {
        const gbastudio_project::ForegroundCellData& cell =
            gbastudio_project::foreground_cells[room.first_foreground_index + offset];
        if (cell.cell_index < 0) {
            continue;
        }
        const int x = cell.cell_index % room.width;
        const int y = cell.cell_index / room.width;
        if (x >= 0 && y >= 0 && x < runtime_bg_width && y < runtime_bg_height) {
            gbs::set_bg_tile(gbs::BackgroundLayer::BG1, x, y, runtime_bg_width, runtime_bg_height, static_cast<uint16_t>(cell.tile_id));
        }
    }
}

void draw_playable_scene() {
    if (runtime.current_room < 0 || runtime.current_room >= gbastudio_project::room_count) {
        return;
    }
    const gbastudio_project::RoomData& room = gbastudio_project::rooms[runtime.current_room];
    build_runtime_room_tiles();
    draw_runtime_room_layer(room);
    draw_runtime_foreground_layer(room);
}

void advance_runtime_witness() {
    const gbastudio_project::EventStepData* dialogue_step = find_first_enabled_step(
        gbastudio_project::EventCommandOpcode::ShowDialogue,
        gbastudio_project::EventCommandTargetKind::Dialogue
    );
    const gbastudio_project::EventStepData* change_step = find_first_enabled_step(
        gbastudio_project::EventCommandOpcode::ChangeScene,
        gbastudio_project::EventCommandTargetKind::Room
    );

    ++runtime_witness.frame;
    runtime_witness.phase = runtime_witness.frame / 60u;
    if (runtime_witness.phase > 5u) {
        runtime_witness.phase = 5u;
    }

    runtime_witness.boot_event = runtime.boot_event_ran ? 1 : 0;
    runtime_witness.dialogue = runtime.active_dialogue >= 0
        ? runtime.active_dialogue
        : (dialogue_step != nullptr ? dialogue_step->target_index : -1);
    runtime_witness.actor = runtime.player_actor_index;
    runtime_witness.trigger = runtime.active_trigger >= 0
        ? runtime.active_trigger
        : (gbastudio_project::trigger_count > 0 ? 0 : -1);
    runtime_witness.change_room = runtime.room_changes > 0
        ? runtime.current_room
        : (change_step != nullptr ? change_step->target_index : -1);
    runtime_witness.audio = runtime.audio_event_count;
    runtime_witness.state = runtime.state_mutation_count;
    runtime_witness.current_room = runtime.current_room;
    runtime_witness.ok =
        gbastudio_project::room_count > 1 &&
        runtime_witness.boot_event == 1 &&
        runtime_witness.dialogue >= 0 &&
        runtime_witness.actor >= 0 &&
        runtime_witness.trigger >= 0 &&
        runtime_witness.change_room > 0 &&
        runtime_witness.audio > 0 &&
        runtime.audio_pattern_count > 0 &&
        runtime.audio_note_count > 0 &&
        runtime_witness.state > 0 &&
        runtime.event_step_count > 0;
}

void draw_runtime_witness_overlay() {
    gbs::debug_set_counter(0, "phase", runtime_witness.phase);
    gbs::debug_set_counter(1, "room", runtime_witness.current_room + 1);
    gbs::debug_set_counter(2, "boot", runtime_witness.boot_event);
    gbs::debug_set_counter(3, "dialog", runtime_witness.dialogue + 1);
    gbs::debug_set_counter(4, "actor", runtime_witness.actor + 1);
    gbs::debug_set_counter(5, "trigger", runtime_witness.trigger + 1);
    gbs::debug_set_counter(6, "change", runtime_witness.change_room + 1);
    gbs::debug_set_counter(7, "audio", runtime_witness.audio);
    gbs::debug_set_counter(8, "state", runtime_witness.state);
    gbs::debug_set_counter(9, "ok", runtime_witness.ok ? 1u : 0u);
    gbs::draw_debug_overlay(true);
}

} // namespace

extern "C" int gbs_main() {
    gbs::init();
    gbs::set_backdrop_color(gbs::rgb15(1, 3, 6));
    gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);
    gbs::set_bg_priority(gbs::BackgroundLayer::BG1, 1);
    gbs::set_bg_priority(gbs::BackgroundLayer::BG2, 2);
    gbs::set_bg_priority(gbs::BackgroundLayer::BG3, 3);
    gbs::set_bg_scroll(gbs::BackgroundLayer::BG0, 0, 0);
    gbs::set_bg_scroll(gbs::BackgroundLayer::BG1, 0, 0);
    gbs::set_bg_scroll(gbs::BackgroundLayer::BG2, 0, 0);
    gbs::set_bg_scroll(gbs::BackgroundLayer::BG3, 0, 0);
    gbs::init_dialogue(dialogue_state);
    initialize_playable_runtime();
    run_room_boot_event();
    while(true) {
        gbs::InputState input = gbs::poll_input();
        update_playable_runtime(input);
        gbs::update_dialogue(dialogue_state);
        advance_runtime_witness();
        draw_playable_scene();
        if (runtime.debug_overlay_visible) {
            draw_runtime_witness_overlay();
        } else {
            gbs::draw_debug_overlay(false);
        }
        gbs::draw_dialogue(dialogue_state);
        gbs::wait_vblank();
    }
    return 0;
}
`;
}

function readme(data: GBAProjectData, target: string): string {
  return `# ${projectTitle(data)}

Pacote minimo gerado pela trilha Electron do GBA Studio.

- Backend: gbastudio_engine
- Target: ${target}
- Rooms: ${projectRooms(data).length}
- Eventos: ${projectArray(data, "events").length}
- Audio: ${projectArray(data, "audioItems").length}

Este pacote ja e suficiente para diagnostico, \`gbsbuild --dry-run --json\` e build real de ROM.
A geracao runtime de \`gbastudio_project_data.hpp\` ja materializa rooms, tilemap, colisoes, atores,
triggers, assets, audio, eventos, passos e comandos compilados. Assets importados sao listados em
\`generated_assets\` e copiados para \`assets/...\`. O \`main.cpp\` ja mostra um overlay runtime
com contadores derivados do projeto exportado, mas a equivalencia visual/jogavel com o editor Swift
continua como etapa posterior.
`;
}

export interface AssetcAudioJsonDocument {
  sfx: Array<{
    name: string;
    tones: Array<{
      frequency_hz: number;
      duration_frames: number;
      volume: number;
      duty?: number;
      noise?: boolean;
      attack_frames?: number;
      release_frames?: number;
      waveform?: number;
      pan?: number;
    }>;
  }>;
  music: Array<{
    name: string;
    loop?: boolean;
    steps: Array<{
      frequency_hz: number;
      duration_frames: number;
      volume: number;
      duty?: number;
    }>;
  }>;
  tracker: Array<{
    name: string;
    mod?: string;
    s3m?: string;
    loop?: boolean;
    row_duration_frames?: number;
    samples?: Array<{ asset_id: string; wav: string; loop: boolean }>;
    patterns?: Array<{
      steps: Array<{
        channel: number;
        frequency_hz: number;
        duration_frames: number;
        volume: number;
        duty: number;
        attack_frames: number;
        release_frames: number;
        waveform: number;
        note?: string;
        sample_index?: number;
        sample_pitch_ratio?: number;
        sample_only?: boolean;
        pan?: number;
      }>;
    }>;
    order?: number[];
  }>;
  pcm: Array<{
    name: string;
    sample_rate_hz?: number;
    wav?: string;
    loop?: boolean;
  }>;
}

/**
 * ROM data layout emitted by assetc for the target ARM ABI.
 *
 * These sizes describe the generated audio payload and descriptors. Linker
 * section padding is intentionally excluded because it depends on the final
 * pack layout, while the generated element counts are deterministic here.
 */
export const GBA_AUDIO_ROM_LAYOUT = {
  sfxToneBytes: 10,
  sfxAssetBytes: 8,
  trackerStepBytes: 16,
  trackerPatternBytes: 8,
  trackerOrderEntryBytes: 1,
  trackerAssetBytes: 28
} as const;

export function physicalBytesForCompiledTracker(
  tracker: AssetcAudioJsonDocument["tracker"][number]
): number {
  const patterns = tracker.patterns ?? [];
  const patternBytes = patterns.reduce(
    (total, pattern) => total + GBA_AUDIO_ROM_LAYOUT.trackerPatternBytes
      + pattern.steps.length * GBA_AUDIO_ROM_LAYOUT.trackerStepBytes,
    0
  );
  const orderBytes = (tracker.order?.length ?? 0) * GBA_AUDIO_ROM_LAYOUT.trackerOrderEntryBytes;
  return patternBytes + orderBytes + GBA_AUDIO_ROM_LAYOUT.trackerAssetBytes;
}

export function physicalBytesForCompiledSfx(
  sfx: AssetcAudioJsonDocument["sfx"][number]
): number {
  return sfx.tones.length * GBA_AUDIO_ROM_LAYOUT.sfxToneBytes + GBA_AUDIO_ROM_LAYOUT.sfxAssetBytes;
}

export interface AssetcAudioPackAsset extends AssetcSceneBankFields {
  id: string;
  name: string;
  kind: "audio";
  audio_json: string;
  header: string;
  symbol: string;
}

export interface EngineExportAudioPhysicalBudgetPlan {
  schema: 1;
  audio_bytes_by_item: Record<string, number>;
}

export interface AssetcAudioPackGeneration {
  document: AssetcAudioJsonDocument;
  packAsset: AssetcAudioPackAsset;
  sourceCopies: EngineProjectExportAsset[];
  physicalBudget?: EngineExportAudioPhysicalBudgetPlan;
}

function audioItemHasComposedPatterns(audio: Record<string, unknown>): boolean {
  const patterns = recordArray(audio, "patterns");
  if (patterns.length > 0) return true;

  return recordArray(audio, "channels").some((channel) => {
    const notes = Array.isArray(channel.notes) ? channel.notes : [];
    return notes.some((note) => typeof note === "string" && note.trim().length > 0 && note.trim() !== "---");
  });
}

function trackerChannelForType(channelType: string): number {
  const normalized = channelType.toLowerCase();
  if (normalized.includes("noise")) return 4;
  if (normalized.includes("wave")) return 3;
  if (normalized.includes("pulse2") || normalized.includes("square2")) return 2;
  return 1;
}

function frequencyForEditorNote(note: string, channelType: string): number {
  const trimmed = note.trim();
  if (!trimmed || trimmed === "---") return 0;

  const pitched = /^([A-G])(#?)(-?\d+)$/i.exec(trimmed);
  if (pitched) {
    const [, base, sharp, octaveText] = pitched;
    const semitoneByNote: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const octave = Number(octaveText);
    const semitone = (semitoneByNote[base.toUpperCase()] ?? 0) + (sharp ? 1 : 0);
    if (!Number.isFinite(octave)) return 0;
    const midi = (octave + 1) * 12 + semitone;
    return Math.max(16, Math.min(32767, Math.round(440 * 2 ** ((midi - 69) / 12))));
  }

  if (channelType.toLowerCase().includes("noise")) return 64;
  return 0;
}

function rowDurationFramesFromBpm(bpm: number): number {
  const stepDurationMs = Math.max(80, (60 / Math.max(1, bpm) / 2) * 1000);
  return Math.max(1, Math.min(255, Math.round((stepDurationMs * 60) / 1000)));
}

function trackerVolumeFromAudioVolume(volume: number): number {
  return Math.max(0, Math.min(15, Math.round(volume * 15 / 100)));
}

function trackerDutyForInstrument(instrument: string, channelType: string): number {
  const normalized = instrument.toLowerCase();
  if (channelType.toLowerCase().includes("noise")) {
    return normalized.includes("short") || normalized.includes("tight") ? 1 : 0;
  }
  if (normalized.includes("warm")) return 1;
  if (normalized.includes("lead")) return 2;
  if (normalized.includes("bright") || normalized.includes("thin")) return 3;
  return 2;
}

function trackerWaveformForInstrument(instrument: string, channelType: string): number {
  if (!channelType.toLowerCase().includes("wave")) return 0;
  const normalized = instrument.toLowerCase();
  if (normalized.includes("bass")) return 1;
  if (normalized.includes("organ")) return 2;
  if (normalized.includes("saw") || normalized.includes("bright")) return 3;
  return 0;
}

function trackerEnvelopeFrames(envelope: string, rowDurationFrames: number): { attack: number; release: number } {
  const normalized = envelope.toLowerCase();
  if (normalized.includes("soft") || normalized.includes("adsr")) {
    return { attack: Math.min(2, rowDurationFrames), release: Math.min(4, rowDurationFrames) };
  }
  if (normalized.includes("short") || normalized.includes("decay")) {
    return { attack: 0, release: Math.min(4, rowDurationFrames) };
  }
  if (normalized.includes("pad") || normalized.includes("long")) {
    return { attack: Math.min(4, rowDurationFrames), release: Math.min(8, rowDurationFrames) };
  }
  if (normalized.includes("sharp") || normalized.includes("pluck")) {
    return { attack: 0, release: Math.min(2, rowDurationFrames) };
  }
  return { attack: 0, release: 0 };
}

interface CompiledTrackerStep {
  pan?: number;
  channel: number;
  frequency_hz: number;
  duration_frames: number;
  volume: number;
  duty: number;
  attack_frames: number;
  release_frames: number;
  waveform: number;
  note?: string;
  sample_index?: number;
  sample_pitch_ratio?: number;
  sample_only?: boolean;
}

function compilePatternChannelsToTrackerSteps(
  pattern: Record<string, unknown>,
  rowDurationFrames: number,
  volume: number,
  samples: NonNullable<AssetcAudioJsonDocument["tracker"][number]["samples"]>
): CompiledTrackerStep[] {
  const steps: CompiledTrackerStep[] = [];
  const rowCount = positiveSpriteInteger(pattern.steps, 64);
  const channels = Array.isArray(pattern.channels) ? pattern.channels.filter(isRecord) : [];

  for (let row = 0; row < rowCount; row += 1) {
    const rowSteps: CompiledTrackerStep[] = [];
    for (const channel of channels) {
      if (booleanField(channel, "muted", false)) continue;
      const notes = Array.isArray(channel.notes) ? channel.notes : [];
      const raw = notes[row];
      const note = typeof raw === "string" ? raw.trim() : "";
      if (!note || note === "---") continue;
      const channelType = stringField(channel, "type", "pulse1");
      const frequency = frequencyForEditorNote(note, channelType);
      if (frequency <= 0) continue;
      const instrument = stringField(channel, "instrument", defaultInstrumentForChannelType(channelType));
      const envelope = stringField(channel, "envelope", defaultEnvelopeForChannelType(channelType));
      const envelopeFrames = trackerEnvelopeFrames(envelope, rowDurationFrames);
      rowSteps.push({
        channel: trackerChannelForType(channelType),
        frequency_hz: frequency,
        duration_frames: 0,
        volume: trackerVolumeFromAudioVolume(Math.max(0, Math.min(100, integerField(channel, "volume", 100))) * volume / 100),
        duty: trackerDutyForInstrument(instrument, channelType),
        attack_frames: envelopeFrames.attack,
        release_frames: envelopeFrames.release,
        waveform: trackerWaveformForInstrument(instrument, channelType),
        note,
        ...(channel.pan !== undefined ? { pan: Math.max(-127, Math.min(127, Number(channel.pan))) } : {}),
        ...(channel.sampleAssetID ? { sample_index: samples.findIndex(sample => sample.asset_id === channel.sampleAssetID && sample.loop === (channel.sampleLoop === true)), sample_pitch_ratio: frequency / (audioSampleRootFrequency(channel.sampleRootNote) ?? 262), sample_only: true } : {})
      });
    }
    if (rowSteps.length > 0) {
      rowSteps[rowSteps.length - 1].duration_frames = rowDurationFrames;
      steps.push(...rowSteps);
    } else {
      steps.push({
        channel: 1,
        frequency_hz: 64,
        duration_frames: rowDurationFrames,
        volume: 0,
        duty: 2,
        attack_frames: 0,
        release_frames: 0,
        waveform: 0,
        note: "---"
      });
    }
  }

  if (steps.length === 0) {
    steps.push({
      channel: 1,
      frequency_hz: 440,
      duration_frames: rowDurationFrames,
      volume: 0,
      duty: 2,
      attack_frames: 0,
      release_frames: 0,
      waveform: 0,
      note: "---"
    });
  }

  return steps;
}

function resolveAudioSampleRate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const normalized = Math.floor(value);
  if (normalized < 4000 || normalized > 32768) {
    return null;
  }
  return normalized;
}

function patternOrderIndices(audio: Record<string, unknown>, patterns: Record<string, unknown>[]): number[] {
  const patternIDs = patterns.map((pattern, index) => stringField(pattern, "id", `pattern-${index + 1}`));
  const orderIDs = Array.isArray(audio.patternOrder)
    ? audio.patternOrder
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0)
    : patternIDs;

  const order = orderIDs
    .map((patternID) => patternIDs.indexOf(patternID))
    .filter((index) => index >= 0);

  return order.length > 0 ? order : [0];
}

export function compileComposedMusicaToTracker(
  audio: Record<string, unknown>,
  exportID: string,
  data?: GBAProjectData
): AssetcAudioJsonDocument["tracker"][number] | null {
  if (data) audio = resolveAudioInstrumentComposition(data, audio);
  const patterns = recordArray(audio, "patterns");
  if (patterns.length === 0) return null;

  const bpm = integerField(audio, "bpm", 120);
  const rowDurationFrames = rowDurationFramesFromBpm(bpm);
  const volume = Math.max(0, Math.min(100, integerField(audio, "volume", 80)));
  const samples: NonNullable<AssetcAudioJsonDocument["tracker"][number]["samples"]> = [];
  for (const pattern of patterns) for (const channel of recordArray(pattern, "channels")) {
    if (!channel.sampleAssetID || channel.muted) continue;
    const id = String(channel.sampleAssetID);
    const loop = channel.sampleLoop === true;
    if (!samples.some(sample => sample.asset_id === id && sample.loop === loop)) samples.push({ asset_id: id, wav: `sample_${normalizeIdentifier(id, "instrument")}.wav`, loop });
  }
  const compiledPatterns = patterns.map((pattern) => ({
    steps: compilePatternChannelsToTrackerSteps(pattern, rowDurationFrames, volume, samples)
  }));

  return {
    name: exportID,
    ...(samples.length ? { samples } : {}),
    loop: booleanField(audio, "loops", false),
    row_duration_frames: rowDurationFrames,
    patterns: compiledPatterns,
    order: patternOrderIndices(audio, patterns)
  };
}

function compileChannelsToSfxTones(
  channels: Record<string, unknown>[],
  rowDurationFrames: number,
  volume: number
): AssetcAudioJsonDocument["sfx"][number]["tones"] {
  const tones: AssetcAudioJsonDocument["sfx"][number]["tones"] = [];
  const rowCount = channels.reduce((max, channel) => {
    const notes = Array.isArray(channel.notes) ? channel.notes : [];
    return Math.max(max, notes.length);
  }, 1);

  for (let row = 0; row < rowCount; row += 1) {
    let rowTone: AssetcAudioJsonDocument["sfx"][number]["tones"][number] | null = null;
    for (const channel of channels) {
      if (booleanField(channel, "muted", false)) continue;
      const notes = Array.isArray(channel.notes) ? channel.notes : [];
      const raw = notes[row];
      const note = typeof raw === "string" ? raw.trim() : "";
      if (!note || note === "---") continue;
      const channelType = stringField(channel, "type", "noise");
      const frequency = frequencyForEditorNote(note, channelType);
      if (frequency <= 0) continue;
      const isNoise = channelType.toLowerCase().includes("noise") || !/^([A-G])(#?)(-?\d+)$/i.test(note);
      const instrument = stringField(channel, "instrument", defaultInstrumentForChannelType(channelType));
      const envelope = stringField(channel, "envelope", defaultEnvelopeForChannelType(channelType));
      const envelopeFrames = trackerEnvelopeFrames(envelope, rowDurationFrames);
      rowTone = {
        frequency_hz: frequency,
        duration_frames: rowDurationFrames,
        volume: trackerVolumeFromAudioVolume(Math.max(0, Math.min(100, integerField(channel, "volume", 100))) * volume / 100),
        duty: trackerDutyForInstrument(instrument, channelType),
        noise: isNoise,
        attack_frames: envelopeFrames.attack,
        release_frames: envelopeFrames.release,
        waveform: trackerWaveformForInstrument(instrument, channelType),
        ...(channel.pan !== undefined ? { pan: Math.max(-127, Math.min(127, Number(channel.pan))) } : {})
      };
      break;
    }
    tones.push(rowTone ?? {
      frequency_hz: 64,
      duration_frames: rowDurationFrames,
      volume: 0,
      duty: 0,
      noise: false,
      attack_frames: 0,
      release_frames: 0,
      waveform: 0
    });
  }

  return tones;
}

export function compileComposedSfxToAssetc(
  audio: Record<string, unknown>,
  exportID: string
): AssetcAudioJsonDocument["sfx"][number] | null {
  const patterns = recordArray(audio, "patterns");
  const rowDurationFrames = rowDurationFramesFromBpm(integerField(audio, "bpm", 120));
  const volume = Math.max(0, Math.min(100, integerField(audio, "volume", 80)));

  const tones = patterns.length > 0
    ? patternOrderIndices(audio, patterns).flatMap(index => {
        const pattern = patterns[index];
        const rows = positiveSpriteInteger(pattern.steps, Math.max(1, ...recordArray(pattern, "channels").map(channel => Array.isArray(channel.notes) ? channel.notes.length : 0)));
        const channels = recordArray(pattern, "channels").map(channel => ({ ...channel, notes: Array.from({ length: rows }, (_, row) => Array.isArray(channel.notes) ? channel.notes[row] ?? "---" : "---") }));
        return compileChannelsToSfxTones(channels, rowDurationFrames, volume);
      })
    : compileChannelsToSfxTones(recordArray(audio, "channels"), rowDurationFrames, volume);
  if (tones.length === 0) return null;

  return {
    name: exportID,
    tones
  };
}

function trackerSourceKeyForFormat(format: string): "mod" | "s3m" | null {
  if (format === "MOD") return "mod";
  if (format === "S3M") return "s3m";
  return null;
}


function assetRecordByName(data: GBAProjectData, assetName: string): Record<string, unknown> | null {
  return projectArray(data, "assets").find((asset) => stringField(asset, "name", "") === assetName) ?? null;
}

function assetRecordByReference(data: GBAProjectData, reference: string): Record<string, unknown> | null {
  return projectArray(data, "assets").find((asset) => (
    stringField(asset, "name", "") === reference || stringField(asset, "id", "") === reference
  )) ?? null;
}

function compressionPolicyKindMatchesResource(
  resourceKind: SceneResourceKind,
  packKind: string | undefined
): boolean {
  return (
    (resourceKind === "regular_bg" && packKind === "bg")
    || (resourceKind === "affine_bg" && packKind === "affine_bg")
    || (resourceKind === "obj" && packKind === "obj")
    || (["bitmap3", "bitmap4", "bitmap5"].includes(resourceKind) && packKind === resourceKind)
    || (resourceKind === "palette" && packKind === "palette")
  );
}

function compressionPolicyKeysForSource(data: GBAProjectData, assetId: string): string[] {
  const source = assetRecordByReference(data, assetId);
  const values = [
    assetId,
    source ? stringField(source, "name", "") : "",
    source ? stringField(source, "id", "") : ""
  ];
  return values.flatMap((value) => value ? [value, normalizeIdentifier(value, "asset")] : []);
}

function compressionPolicyKeysForPackAsset(asset: { id?: string; name?: string; png?: string }): string[] {
  const values = [asset.id ?? "", asset.name ?? "", asset.png ?? ""];
  const baseValues = values.flatMap((value) => {
    if (!value) return [];
    const fileName = value.replace(/^.*[\\/]/, "");
    return [value, fileName, fileName.replace(/\.[a-z0-9]+$/i, ""), normalizeIdentifier(fileName, "asset")];
  });
  const variants = baseValues.flatMap((value) => value.split("_palette_", 1));
  return Array.from(new Set([...baseValues, ...variants]));
}

export function applySceneResourceCompressionPolicies<T extends { id?: string; name?: string; kind?: string; png?: string; sprite_bpp?: 4 | 8 }>(
  data: GBAProjectData,
  packAssets: T[]
): T[] {
  const declarations: Array<{ assetKeys: Set<string>; kind: SceneResourceKind; bpp: number; policy: SceneResourceCompressionPolicy }> = [];
  projectRooms(data).forEach((room) => {
    const runtimeConfig = child(child(room, "runtime"), "config");
    const manifest = normalizeSceneResourceManifest(runtimeConfig?.resources);
    manifest.resources.filter((resource) => resource.enabled && resource.assetId).forEach((resource) => {
      declarations.push({
        assetKeys: new Set(compressionPolicyKeysForSource(data, resource.assetId)),
        kind: resource.kind,
        bpp: resource.bpp,
        policy: resource.compression
      });
    });
  });

  return packAssets.map((asset) => {
    const assetKeys = new Set(compressionPolicyKeysForPackAsset(asset));
    const matching = declarations.filter((declaration) => (
      compressionPolicyKindMatchesResource(declaration.kind, asset.kind)
      && Array.from(declaration.assetKeys).some((key) => assetKeys.has(key))
    ));
    if (matching.length === 0) return asset;
    if (asset.kind === "obj" && matching.some(entry => entry.bpp !== (asset.sprite_bpp ?? 4))) {
      throw new Error(`O recurso OBJ ${asset.name ?? asset.id} declara um BPP diferente da folha. Defina o formato de cores no workspace Sprites.`);
    }

    const manualPolicies = matching
      .map((entry) => entry.policy)
      .filter((policy): policy is Extract<SceneResourceCompressionPolicy, { strategy: "manual" }> => policy.strategy === "manual");
    const serializedManualPolicies = new Set(manualPolicies.map((policy) => JSON.stringify(policy)));
    if (serializedManualPolicies.size > 1) {
      throw new Error(`Asset ${asset.name ?? asset.id ?? "desconhecido"} recebeu políticas manuais de compressão conflitantes entre cenas.`);
    }
    const selected = manualPolicies[0] ?? (matching.some((entry) => entry.policy.strategy === "auto") ? "auto" : undefined);
    return selected ? { ...asset, compression_policy: selected } as T : asset;
  });
}

export interface ExportPaletteFamily {
  id: string;
  name: string;
  background: number[];
  objects: number[];
}

function rgb555(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(0x7fff, Math.trunc(value)))
    : 0;
}

function referencedPaletteFamilyIDs(data: GBAProjectData): Set<string> {
  const referenced = new Set<string>();
  projectRooms(data).forEach((room) => {
    const familyID = nullableStringField(room, "paletteFamilyID");
    if (familyID) referenced.add(familyID);
  });
  projectArray(data, "actors").forEach((actor) => {
    const familyID = nullableStringField(actor, "spritePaletteFamilyID");
    if (familyID) referenced.add(familyID);
  });
  return referenced;
}

function exportPaletteFamilies(data: GBAProjectData): ExportPaletteFamily[] {
  const referenced = referencedPaletteFamilyIDs(data);
  return projectArray(data, "paletteFamilies").flatMap((family, index) => {
    const id = nullableStringField(family, "id") || `palette-family-${index + 1}`;
    if (!referenced.has(id)) return [];
    const background = Array.isArray(family.background)
      ? family.background.filter((value): value is number => typeof value === "number" && Number.isFinite(value)).slice(0, 16).map(rgb555)
      : [];
    const objects = Array.isArray(family.objects)
      ? family.objects.filter((value): value is number => typeof value === "number" && Number.isFinite(value)).slice(0, 16).map(rgb555)
      : [];
    if (background.length === 0 && objects.length === 0) return [];
    return [{
      id,
      name: stringField(family, "name", id),
      background,
      objects
    }];
  });
}

function paletteFamilyAssetName(familyID: string, slot: "background" | "objects"): string {
  return normalizeIdentifier(`palette_family_${familyID}_${slot}`, `palette_family_${slot}`);
}

function rgb555ToRgb888(value: number): [number, number, number] {
  return [
    (value & 0x1f) << 3,
    ((value >> 5) & 0x1f) << 3,
    ((value >> 10) & 0x1f) << 3
  ];
}

function roomPaletteFamilyID(room: Record<string, unknown>): string {
  return nullableStringField(room, "paletteFamilyID");
}

function roomForSpriteActor(data: GBAProjectData, actor: Record<string, unknown>): Record<string, unknown> | null {
  const rooms = projectRooms(data);
  const actorRoom = nullableStringField(actor, "roomName") || nullableStringField(actor, "sceneName");
  if (actorRoom) {
    return rooms.find((room, index) => (
      actorRoom === stringField(room, "name", `room_${index + 1}`)
      || actorRoom === stringField(room, "id", "")
    )) ?? null;
  }
  const actorName = nullableStringField(actor, "name");
  if (!actorName) return null;
  return rooms.find((room) => nullableStringField(room, "playerActorName") === actorName) ?? null;
}

function spritePaletteFamilyIDForActor(data: GBAProjectData, actor: Record<string, unknown>): string {
  const explicitFamilyID = nullableStringField(actor, "spritePaletteFamilyID");
  if (explicitFamilyID) return explicitFamilyID;
  const room = roomForSpriteActor(data, actor);
  return room ? roomPaletteFamilyID(room) : "";
}

function spritePaletteVariantKey(spriteSheet: string, familyID: string): string {
  return `${spriteSheet}::${familyID}`;
}

function roomReferencesTileset(room: Record<string, unknown>, assetName: string): boolean {
  const authoredIsometricBackground = roomUsesAuthoredIsometricBackground(room);
  const directNames = [
    nullableStringField(room, "backgroundAssetName"),
    nullableStringField(room, "background"),
    authoredIsometricBackground ? "" : nullableStringField(room, "tilesetAssetName"),
    nullableStringField(room, "runtimeBaseBackgroundAssetName")
  ];
  if (directNames.includes(assetName)) return true;
  return !authoredIsometricBackground && layerTilesetNamesForRoom(room).includes(assetName);
}

function roomReferencesPaletteAsset(room: Record<string, unknown>, assetName: string): boolean {
  if (roomReferencesTileset(room, assetName)) return true;
  const runtime = child(room, "runtime");
  return nullableStringField(runtime, "type") === "luta"
    && nullableStringField(child(runtime, "config"), "hudAssetName") === assetName;
}

export function backgroundPaletteBankPolicyForAsset(
  data: GBAProjectData,
  assetName: string
): ScenePaletteBankPolicy {
  const references = projectRooms(data).filter((room) => roomReferencesPaletteAsset(room, assetName));
  if (references.length === 0) return DEFAULT_SCENE_PALETTE_BANK_POLICY;
  // Point-and-click keeps the shared HUD/dialogue palettes resident in BG
  // banks 14 and 15, even when the scene metadata requests a full-screen
  // background. The runtime contract takes precedence over that hint.
  if (references.some((room) => nullableStringField(child(room, "runtime"), "type") === "pointAndClick")) {
    return DEFAULT_SCENE_PALETTE_BANK_POLICY;
  }
  return references.every((room) => normalizeScenePaletteBankPolicy(room.paletteBankPolicy) === "full-screen")
    ? "full-screen"
    : DEFAULT_SCENE_PALETTE_BANK_POLICY;
}

const POINT_CLICK_RUNTIME_RESERVED_BG_TILE_START = 4;

function pointClickBackgroundPlacement(
  data: GBAProjectData,
  assetName: string,
  backgroundBpp: 4 | 8
): AssetcTilesetPlacement | undefined {
  if (backgroundBpp !== 4) return undefined;
  const isPointClickBackground = projectRooms(data).some((room) => (
    roomReferencesTileset(room, assetName)
      && nullableStringField(child(room, "runtime"), "type") === "pointAndClick"
  ));
  return isPointClickBackground
    ? { bg_tiles: { start: POINT_CLICK_RUNTIME_RESERVED_BG_TILE_START } }
    : undefined;
}

function paletteFamilyForAsset(
  data: GBAProjectData,
  assetName: string,
  kind: "sprite" | "tileset",
  families: ExportPaletteFamily[]
): ExportPaletteFamily | null {
  const familyIDs = new Set<string>();
  let hasUnconfiguredReference = false;
  const rooms = projectRooms(data);
  if (kind === "tileset") {
    rooms.forEach((room) => {
      if (roomReferencesTileset(room, assetName)) {
        const familyID = roomPaletteFamilyID(room);
        if (familyID) familyIDs.add(familyID);
      }
    });
  } else {
    projectArray(data, "actors").forEach((actor) => {
      if (nullableStringField(actor, "spriteSheet") !== assetName) return;
      const actorRoom = nullableStringField(actor, "roomName") || nullableStringField(actor, "sceneName");
      if (actorRoom) {
        const room = rooms.find((candidate, index) => (
          actorRoom === stringField(candidate, "name", `room_${index + 1}`) || actorRoom === stringField(candidate, "id", "")
        ));
        const familyID = room ? roomPaletteFamilyID(room) : "";
        if (familyID) familyIDs.add(familyID);
        else hasUnconfiguredReference = true;
        return;
      }
      const actorName = nullableStringField(actor, "name");
      rooms.forEach((room) => {
        if (nullableStringField(room, "playerActorName") === actorName || !actorName) {
          const familyID = roomPaletteFamilyID(room);
          if (familyID) familyIDs.add(familyID);
          else hasUnconfiguredReference = true;
        }
      });
    });
  }

  if (hasUnconfiguredReference || familyIDs.size !== 1) return null;
  return families.find((family) => family.id === Array.from(familyIDs)[0]) ?? null;
}

export interface AssetcPaletteFamilyPackAsset extends AssetcSceneBankFields {
  id: string;
  name: string;
  kind: "palette";
  palette_slot: "background" | "objects";
  palette_values: number[];
  header: string;
  symbol: string;
}

export interface AssetcPaletteFamilyPackGeneration {
  packAssets: AssetcPaletteFamilyPackAsset[];
  assetsByFamilyID: Record<string, { background?: AssetcPaletteFamilyPackAsset; objects?: AssetcPaletteFamilyPackAsset }>;
  families: ExportPaletteFamily[];
  assetNames: string[];
}

export function buildAssetcPaletteFamilyPackGeneration(data: GBAProjectData): AssetcPaletteFamilyPackGeneration | null {
  const families = exportPaletteFamilies(data);
  if (families.length === 0) return null;

  const packAssets: AssetcPaletteFamilyPackAsset[] = [];
  const assetsByFamilyID: AssetcPaletteFamilyPackGeneration["assetsByFamilyID"] = {};
  families.forEach((family) => {
    const familyAssets = assetsByFamilyID[family.id] ?? {};
    (["background", "objects"] as const).forEach((slot) => {
      const values = slot === "background" ? family.background : family.objects;
      if (values.length === 0) return;
      const name = paletteFamilyAssetName(family.id, slot);
      const asset: AssetcPaletteFamilyPackAsset = {
        id: `palette-family-${family.id}-${slot}`,
        name,
        kind: "palette",
        palette_slot: slot,
        palette_values: values,
        header: `${name}.hpp`,
        symbol: name,
        ...globalSceneBankFields(data)
      };
      packAssets.push(asset);
      familyAssets[slot] = asset;
    });
    assetsByFamilyID[family.id] = familyAssets;
  });

  if (packAssets.length === 0) return null;
  return {
    packAssets,
    assetsByFamilyID,
    families,
    assetNames: packAssets.map((asset) => asset.name)
  };
}

export function buildAssetcAudioPackGeneration(data: GBAProjectData): AssetcAudioPackGeneration | null {
  const tracker: AssetcAudioJsonDocument["tracker"] = [];
  const pcm: AssetcAudioJsonDocument["pcm"] = [];
  const sfx: AssetcAudioJsonDocument["sfx"] = [];
  const sourceCopies: EngineProjectExportAsset[] = [];
  const audioBytesByItem: Record<string, number> = {};
  const projectAudioSampleRate = resolveAudioSampleRate(integerField(child(settings(data), "audio"), "sampleRate", 0));

  const registerPhysicalAudioBytes = (audio: Record<string, unknown>, index: number, bytes: number): void => {
    const keys = new Set([
      nullableStringField(audio, "id"),
      nullableStringField(audio, "exportID"),
      nullableStringField(audio, "name"),
      `audio:${index}`
    ]);
    keys.forEach((key) => {
      if (key) audioBytesByItem[key] = bytes;
    });
  };

  projectArray(data, "audioItems").forEach((audio, index) => {
    const name = stringField(audio, "name", `audio-${index + 1}`);
    const kind = stringField(audio, "kind", "Audio");
    const exportID = normalizeIdentifier(stringField(audio, "exportID", name), `audio_${index + 1}`);

    if (audioItemHasComposedPatterns(audio)) {
      if (kind === "Musica") {
        const compiled = compileComposedMusicaToTracker(audio, exportID, data);
        if (compiled) {
          tracker.push(compiled);
          if (!compiled.samples?.length) registerPhysicalAudioBytes(audio, index, physicalBytesForCompiledTracker(compiled));
          for (const sample of compiled.samples ?? []) {
            const asset = projectArray(data, "assets").find(asset => asset.id === sample.asset_id);
            if (!asset || !assetSource(asset)) throw new Error(`Sample WAV ausente: ${sample.asset_id}`);
            const output = `assets/audio/${sample.wav}`;
            const existingCopy = sourceCopies.find(copy => copy.output === output);
            if (existingCopy && existingCopy.id !== sample.asset_id) {
              throw new Error(`Dois samples geram o mesmo arquivo de exportação: ${existingCopy.name} e ${String(asset.name)}.`);
            }
            if (!existingCopy) sourceCopies.push({ id: sample.asset_id, name: String(asset.name), kind: String(asset.kind), source: assetSource(asset)!, output });
          }
          return;
        }
      }
      if (kind === "SFX") {
        const compiled = compileComposedSfxToAssetc(audio, exportID);
        if (compiled) {
          sfx.push(compiled);
          registerPhysicalAudioBytes(audio, index, physicalBytesForCompiledSfx(compiled));
          return;
        }
      }
      return;
    }

    const format = audioSourceFormat(data, audio);
    const asset = audioSourceAsset(data, audio);
    if (!asset) return;
    const source = assetSource(asset);
    if (!source) return;

    const loops = booleanField(audio, "loops", false);
    const fileName = stringField(asset, "name", name).replace(/^.*[\\/]/, "");
    const output = `assets/audio/${normalizeIdentifier(fileName.replace(/\.[a-z0-9]+$/i, ""), exportID)}${fileName.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? ""}`;
    const audioReference = fileName;

    sourceCopies.push({
      id: stringField(asset, "id", `asset-${index + 1}`),
      name,
      kind: stringField(asset, "kind", "Audio"),
      source,
      output
    });

    if (kind === "Musica") {
      const trackerKey = trackerSourceKeyForFormat(format);
      if (!trackerKey) return;
      tracker.push({
        name: exportID,
        [trackerKey]: audioReference,
        loop: loops,
        row_duration_frames: 4
      });
      return;
    }

    if (kind === "SFX" && format === "WAV") {
      const pcmItem: AssetcAudioJsonDocument["pcm"][number] = {
        name: exportID,
        wav: audioReference,
        loop: loops
      };
      if (projectAudioSampleRate !== null) {
        pcmItem.sample_rate_hz = projectAudioSampleRate;
      }
      pcm.push(pcmItem);
    }
  });

  if (tracker.length === 0 && pcm.length === 0 && sfx.length === 0) return null;

  return {
    document: { sfx, music: [], tracker, pcm },
    packAsset: {
      id: "project_audio",
      name: "project_audio",
      kind: "audio",
      audio_json: "assets/audio/project_audio.json",
      header: "project_audio.hpp",
      symbol: "project_audio",
      ...globalSceneBankFields(data)
    },
    sourceCopies,
    ...(Object.keys(audioBytesByItem).length > 0 ? {
      physicalBudget: {
        schema: 1 as const,
        audio_bytes_by_item: audioBytesByItem
      }
    } : {})
  };
}

export interface AssetcSpritePackAsset extends AssetcSceneBankFields {
  id: string;
  name: string;
  kind: "obj";
  png: string;
  sprite_width: number;
  sprite_height: number;
  header: string;
  symbol: string;
  transparent_color_index?: number | "top_left";
  reserve_obj_transparent_color?: boolean;
  object_palette_values?: number[];
  stream_frames?: true;
  sprite_bpp?: 4 | 8;
}

export interface AssetcSpriteAnimationExportEntry {
  name: string;
  asset: string;
  frame_indices: number[];
  durations?: number[];
  loops?: boolean;
  frame_metasprites?: AssetcFrameMetaspriteExport[];
}

export type AssetcLutaAnimationState = "idle" | "attack" | "special" | "guard" | "hurt";

export type AssetcLutaAnimationExport = Omit<AssetcSpriteAnimationExportEntry, "name">;

export interface AssetcLutaAnimationSetExport {
  fallback: "static_metasprite" | "idle_animation";
  idle?: AssetcLutaAnimationExport;
  attack?: AssetcLutaAnimationExport;
  special?: AssetcLutaAnimationExport;
  guard?: AssetcLutaAnimationExport;
  hurt?: AssetcLutaAnimationExport;
}

export interface AssetcMetaspritePartExport {
  x: number;
  y: number;
  slice_x: number;
  slice_y: number;
  width: number;
  height: number;
  palette?: number;
  hflip?: boolean;
  vflip?: boolean;
}

export interface AssetcFrameMetaspriteExport {
  parts: AssetcMetaspritePartExport[];
}

export interface AssetcActorSpriteExportFields {
  metasprite: { asset: string; index: number };
  animation: string | { asset: string };
  animations?: AssetcSpriteAnimationExportEntry[];
  luta_animation_set?: AssetcLutaAnimationSetExport;
  emit_animation_fallback: false;
}

export interface AssetcSpritePackGeneration {
  packAssets: AssetcSpritePackAsset[];
  assetsBySheet: Record<string, AssetcSpritePackAsset>;
  assetNames: string[];
}

function positiveSpriteInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function nonNegativeSpriteInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function signedSpriteInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function spriteSheetAssetId(spriteSheet: string): string {
  return normalizeIdentifier(spriteSheet.replace(/\.[a-z0-9]+$/i, ""), "sprite");
}

function objectPaletteValuesFromMetadata(
  metadata: Record<string, unknown>,
  assetName: string,
  limit = 16
): number[] | undefined {
  const rawValues = metadata.objectPaletteValues;
  if (rawValues === undefined) return undefined;
  if (!Array.isArray(rawValues) || rawValues.length === 0 || rawValues.length > limit) {
    throw new Error(`A paleta OBJ explícita de ${assetName} precisa ter entre 1 e ${limit} valores RGB555.`);
  }
  if (rawValues.some((value) => (
    typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0x7fff
  ))) {
    throw new Error(`A paleta OBJ explícita de ${assetName} contém um valor RGB555 inválido.`);
  }
  return rawValues;
}

function uniqueSpriteSheetsFromActors(data: GBAProjectData, hudGroups: ReadonlyMap<string, readonly string[]>): string[] {
  const sheets = new Set<string>();
  projectArray(data, "actors").forEach((actor) => {
    const spriteSheet = nullableStringField(actor, "spriteSheet");
    if (spriteSheet) sheets.add(spriteSheet);
  });
  projectArray(data, "events").forEach((event) => {
    const steps = Array.isArray(event.steps) ? event.steps.filter(isRecord) : [];
    steps.forEach((step) => {
      const command = nullableStringField(step, "command");
      if (!command) return;
      const parts = command.split(/\s+/).filter(Boolean);
      if ((parts[0] === "set_actor_sprite" || parts[0] === "change_actor_sprite") && parts[2]) {
        sheets.add(parts[2]);
      }
      if (parts[0] === "change_player_sprite" && parts[1]) sheets.add(parts[1]);
    });
  });
  const shmupSettings = child(settings(data), "shmup");
  if (!usesBlankPlayerDefaults(data) || projectRooms(data).some(room => nullableStringField(room, "sceneType") === "shmup"))
  ["playerSprite", "playerExplosionSprite", "projectileSprite", "enemyProjectileSprite", "enemySprite"].forEach((key) => {
    const spriteSheet = nullableStringField(shmupSettings, key);
    if (spriteSheet) sheets.add(spriteSheet);
  });
  // The authoring catalog is not a residency list. Only bound compositions
  // reserve HUD images (including gauge variants and round states) in OBJ VRAM.
  hudGroups.forEach((_groups, asset) => sheets.add(asset));
  projectRooms(data).forEach((room) => {
    const runtime = child(room, "runtime");
    const config = child(runtime, "config");
    if (nullableStringField(runtime, "type") !== "isometric" || !config) return;
    const presentation = child(config, "tacticalPresentation");
    if (!presentation) return;
    recordArray(presentation, "units").forEach((unit) => {
      const sheet = nullableStringField(unit, "sheet") || nullableStringField(unit, "spriteSheet");
      if (sheet) sheets.add(sheet);
    });
    recordArray(presentation, "props").forEach((prop) => {
      const asset = nullableStringField(prop, "asset");
      if (asset) sheets.add(asset.split("#", 1)[0]);
    });
    [
      nullableStringField(presentation, "cursorAsset"),
      nullableStringField(presentation, "rangeAsset"),
      nullableStringField(presentation, "targetAsset"),
      nullableStringField(presentation, "emotesAsset"),
      nullableStringField(presentation, "feedbackAsset")
    ].forEach((asset) => {
      if (asset) sheets.add(asset.split("#", 1)[0]);
    });
    recordArray(presentation, "assets").forEach((asset) => {
      if (nullableStringField(asset, "consumer") !== "obj") return;
      const reference = nullableStringField(asset, "path") || nullableStringField(asset, "id");
      if (reference) sheets.add(reference.split("#", 1)[0]);
    });
  });
  return Array.from(sheets);
}

function animationsForSpriteSheet(data: GBAProjectData, spriteSheet: string): Record<string, unknown>[] {
  return projectArray(data, "animations").filter((animation) => nullableStringField(animation, "spriteSheet") === spriteSheet);
}

function spriteStateContracts(data: GBAProjectData): SpriteStateContract[] {
  return projectArray(data, "animationStates").flatMap((state, index) => {
    const id = nullableStringField(state, "id");
    const spriteSheet = nullableStringField(state, "spriteSheet");
    if (!id || !spriteSheet || !isSpriteAnimationType(state.animationType) || !Array.isArray(state.animationIDs)) {
      return [];
    }
    return [{
      id,
      name: stringField(state, "name", `state-${index + 1}`),
      spriteSheet,
      animationType: state.animationType,
      mirrorLeftFromRight: booleanField(state, "mirrorLeftFromRight", false),
      animationIDs: state.animationIDs.filter((animationID): animationID is string => typeof animationID === "string")
    }];
  });
}

const TOPDOWN_IDLE_ANIMATION_ORDER = ["idle_down", "idle_up", "idle_right", "idle_left"] as const;
const TOPDOWN_WALK_ANIMATION_ORDER = ["walk_down", "walk_up", "walk_right", "walk_left"] as const;

export function sortTopdownSpriteAnimationsForExport(animations: Record<string, unknown>[]): Record<string, unknown>[] {
  const hasWalk = animations.some((animation) => stringField(animation, "name", "").startsWith("walk_"));
  const order = hasWalk
    ? [
      ...TOPDOWN_IDLE_ANIMATION_ORDER.slice(0, 3),
      ...TOPDOWN_WALK_ANIMATION_ORDER.slice(0, 3),
      "idle_left",
      "walk_left"
    ]
    : [...TOPDOWN_IDLE_ANIMATION_ORDER];
  const rank = new Map(order.map((name, index) => [name, index]));
  return [...animations].sort((left, right) => {
    const leftRank = rank.get(stringField(left, "name", "")) ?? 999;
    const rightRank = rank.get(stringField(right, "name", "")) ?? 999;
    return leftRank === rightRank ? 0 : leftRank - rightRank;
  });
}

function inferSpriteSheetImageSize(
  data: GBAProjectData,
  spriteSheet: string,
  defaultFrameWidth: number,
  defaultFrameHeight: number
): { width: number; height: number } {
  const reference = projectArray(data, "spriteReferenceImages").find(
    (entry) => stringField(entry, "assetName", "") === spriteSheet
  );
  if (reference) {
    const width = positiveSpriteInteger(reference.imageWidth, 0);
    const height = positiveSpriteInteger(reference.imageHeight, 0);
    if (width > 0 && height > 0) return { width, height };
  }

  let maxRight = 0;
  let maxBottom = 0;
  animationsForSpriteSheet(data, spriteSheet).forEach((animation) => {
    const frameWidth = positiveSpriteInteger(animation.frameWidth, defaultFrameWidth);
    const frameHeight = positiveSpriteInteger(animation.frameHeight, defaultFrameHeight);
    const frames = Array.isArray(animation.frames) ? animation.frames.filter(isRecord) : [];
    const frameCount = frames.length > 0 ? frames.length : positiveSpriteInteger(animation.frameCount, 1);
    for (let index = 0; index < frameCount; index += 1) {
      const frame = isRecord(frames[index]) ? frames[index] : {};
      const tiles = Array.isArray(frame.tiles) ? frame.tiles.filter(isRecord) : [];
      const firstTile = tiles[0];
      const sliceX = firstTile ? nonNegativeSpriteInteger(firstTile.sliceX, index * frameWidth) : index * frameWidth;
      const sliceY = firstTile ? nonNegativeSpriteInteger(firstTile.sliceY, 0) : 0;
      maxRight = Math.max(maxRight, sliceX + frameWidth);
      maxBottom = Math.max(maxBottom, sliceY + frameHeight);
    }
  });

  return {
    width: Math.max(maxRight, defaultFrameWidth),
    height: Math.max(maxBottom, defaultFrameHeight)
  };
}

function resolveSpriteSheetDimensions(data: GBAProjectData, spriteSheet: string): { spriteWidth: number; spriteHeight: number } {
  const frameDimensions = new Map<string, { width: number; height: number }>();
  animationsForSpriteSheet(data, spriteSheet).forEach((animation) => {
    const width = positiveSpriteInteger(animation.frameWidth, 16);
    const height = positiveSpriteInteger(animation.frameHeight, 16);
    frameDimensions.set(`${width}x${height}`, { width, height });
  });
  if (frameDimensions.size > 1) {
    throw new Error(`Sprite ${spriteSheet} usa mais de um tamanho de frame; cada spritesheet exportada precisa de dimensoes uniformes.`);
  }
  const metadata = child(assetRecordByName(data, spriteSheet) ?? {}, "metadata");
  const [{ width, height } = {
    width: positiveSpriteInteger(metadata?.frameWidth, 16),
    height: positiveSpriteInteger(metadata?.frameHeight, 16)
  }] = [...frameDimensions.values()];
  if (width < 8 || width > 128 || height < 8 || height > 128 || width % 8 !== 0 || height % 8 !== 0) {
    throw new Error(`Sprite ${spriteSheet} usa frame ${width}x${height}; cada dimensao precisa ser multiplo de 8 entre 8 e 128.`);
  }
  const partCount = decomposeGbaMetaspriteFrame(width, height).length;
  if (partCount > gbaMetaspritePartLimit) {
    throw new Error(`Sprite ${spriteSheet} usa frame ${width}x${height} com ${partCount} partes; isso excede o limite de ${gbaMetaspritePartLimit} partes por MetaSprite.`);
  }
  return { spriteWidth: width, spriteHeight: height };
}

export function computeAssetcMetaspriteIndex(
  spriteWidth: number,
  spriteHeight: number,
  sheetWidth: number,
  sliceX: number,
  sliceY: number
): number {
  const framesPerRow = Math.max(1, Math.floor(sheetWidth / spriteWidth));
  return Math.floor(sliceY / spriteHeight) * framesPerRow + Math.floor(sliceX / spriteWidth);
}

function metaspriteIndexForAnimationFrame(
  data: GBAProjectData,
  spriteSheet: string,
  animation: Record<string, unknown>,
  frameIndex: number,
  spriteWidth: number,
  spriteHeight: number
): number {
  const frameWidth = positiveSpriteInteger(animation.frameWidth, spriteWidth);
  const frameHeight = positiveSpriteInteger(animation.frameHeight, spriteHeight);
  const sheetSize = inferSpriteSheetImageSize(data, spriteSheet, frameWidth, frameHeight);
  const frames = Array.isArray(animation.frames) ? animation.frames.filter(isRecord) : [];
  const normalizedIndex = frames.length > 0
    ? ((Math.floor(frameIndex) % frames.length) + frames.length) % frames.length
    : Math.max(0, Math.floor(frameIndex));
  const frame = isRecord(frames[normalizedIndex]) ? frames[normalizedIndex] : {};
  const tiles = Array.isArray(frame.tiles) ? frame.tiles.filter(isRecord) : [];
  const firstTile = tiles[0];
  const sliceX = firstTile ? nonNegativeSpriteInteger(firstTile.sliceX, normalizedIndex * frameWidth) : normalizedIndex * frameWidth;
  const sliceY = firstTile ? nonNegativeSpriteInteger(firstTile.sliceY, 0) : 0;
  return computeAssetcMetaspriteIndex(spriteWidth, spriteHeight, sheetSize.width, sliceX, sliceY);
}

function animationMatchesActorExport(
  animation: Record<string, unknown>,
  index: number,
  spriteSheet: string,
  animationName: string
): boolean {
  const candidateID = nullableStringField(animation, "id") ?? `animation-${index + 1}`;
  const candidateName = nullableStringField(animation, "name");
  const candidateSheet = nullableStringField(animation, "spriteSheet");
  const nameMatches = candidateName === animationName || candidateID === animationName;
  return nameMatches && candidateSheet === spriteSheet;
}

function animationFrameDuration(animation: Record<string, unknown>): number {
  const fps = positiveSpriteInteger(animation.fps, 10);
  return Math.max(1, Math.min(255, Math.round(60 / fps)));
}


function splitMetaspritePartIntoTiles(part: AssetcMetaspritePartExport): AssetcMetaspritePartExport[] {
  const atoms: AssetcMetaspritePartExport[] = [];
  for (let sourceY = 0; sourceY < part.height; sourceY += 8) {
    for (let sourceX = 0; sourceX < part.width; sourceX += 8) {
      atoms.push({
        ...part,
        x: part.x + (part.hflip ? part.width - 8 - sourceX : sourceX),
        y: part.y + (part.vflip ? part.height - 8 - sourceY : sourceY),
        slice_x: part.slice_x + sourceX,
        slice_y: part.slice_y + sourceY,
        width: 8,
        height: 8
      });
    }
  }
  return atoms;
}

function splitMetaspritePartAlongBacking(
  part: AssetcMetaspritePartExport,
  backingParts: AssetcMetaspritePartExport[]
): AssetcMetaspritePartExport[] {
  if (part.width > 128 || part.height > 128) return splitMetaspritePartIntoTiles(part);
  const nativeParts = decomposeGbaMetaspriteFrame(part.width, part.height).map((layout) => ({
    ...part,
    x: part.x + (part.hflip ? part.width - layout.width - layout.x : layout.x),
    y: part.y + (part.vflip ? part.height - layout.height - layout.y : layout.y),
    slice_x: part.slice_x + layout.x,
    slice_y: part.slice_y + layout.y,
    width: layout.width,
    height: layout.height
  }));
  const matchesBacking = nativeParts.every((native) => backingParts.some((backing) => (
    backing.slice_x === native.slice_x
    && backing.slice_y === native.slice_y
    && backing.width === native.width
    && backing.height === native.height
  )));
  return matchesBacking ? nativeParts : splitMetaspritePartIntoTiles(part);
}

function buildFrameMetaspriteParts(
  frame: Record<string, unknown>,
  frameIndex: number,
  frameWidth: number,
  frameHeight: number,
  animationOriginX: number,
  animationOriginY: number
): AssetcMetaspritePartExport[] {
  const tiles = Array.isArray(frame.tiles) ? frame.tiles.filter(isRecord) : [];
  const firstTile = tiles[0];
  const frameSliceX = firstTile ? nonNegativeSpriteInteger(firstTile.sliceX, frameIndex * frameWidth) : frameIndex * frameWidth;
  const frameSliceY = firstTile ? nonNegativeSpriteInteger(firstTile.sliceY, 0) : 0;
  const frameOriginX = signedSpriteInteger(frame.originX, animationOriginX);
  const frameOriginY = signedSpriteInteger(frame.originY, animationOriginY);
  const defaultCanvasOriginX = Math.max(0, Math.floor(frameWidth / 2) - 8);
  const backingParts = decomposeGbaMetaspriteFrame(frameWidth, frameHeight).map((part) => ({
    ...part,
    x: part.x - defaultCanvasOriginX - frameOriginX,
    y: part.y - frameHeight + 8 - frameOriginY,
    slice_x: frameSliceX + part.x,
    slice_y: frameSliceY + part.y
  }));
  if (tiles.length === 0) {
    return backingParts;
  }
  const requestedParts = tiles.map((tile): AssetcMetaspritePartExport => {
    const palette = nonNegativeSpriteInteger(tile.paletteIndex, 0);
    return {
      x: signedSpriteInteger(tile.x, 0) - frameOriginX,
      y: 8
        - frameOriginY
        - signedSpriteInteger(tile.y, 0)
        - positiveSpriteInteger(tile.tileHeight, 8),
      slice_x: nonNegativeSpriteInteger(tile.sliceX, 0),
      slice_y: nonNegativeSpriteInteger(tile.sliceY, 0),
      width: positiveSpriteInteger(tile.tileWidth, 8),
      height: positiveSpriteInteger(tile.tileHeight, 8),
      ...(palette > 0 ? { palette } : {}),
      hflip: Boolean(tile.flipX),
      vflip: Boolean(tile.flipY)
    };
  });
  const exportedParts = requestedParts.flatMap((part) => {
    if (
      part.width < 8 || part.height < 8
      || part.width % 8 !== 0 || part.height % 8 !== 0
      || part.slice_x % 8 !== 0 || part.slice_y % 8 !== 0
    ) {
      throw new Error(`Parte de metasprite ${part.width}x${part.height} precisa usar tamanho e slice alinhados a 8 pixels.`);
    }
    const isContiguousBackingPart = backingParts.some((backing) => (
      backing.slice_x === part.slice_x
      && backing.slice_y === part.slice_y
      && backing.width === part.width
      && backing.height === part.height
    ));
    return isContiguousBackingPart ? [part] : splitMetaspritePartAlongBacking(part, backingParts);
  });
  if (exportedParts.length > gbaMetaspritePartLimit) {
    throw new Error(`Frame ${frameIndex} do metasprite possui ${exportedParts.length} partes; o limite do engine é ${gbaMetaspritePartLimit} por MetaSprite.`);
  }
  return exportedParts;
}

function frameNeedsCustomMetasprite(parts: AssetcMetaspritePartExport[]): boolean {
  if (parts.length > 1) return true;
  const only = parts[0];
  return only.x !== 0 || only.y !== 0;
}

function buildSpriteAnimationExportEntry(
  data: GBAProjectData,
  spriteSheet: string,
  spriteWidth: number,
  spriteHeight: number,
  packAssetName: string,
  animation: Record<string, unknown>,
  index: number,
  name: string,
  flipX = false
): AssetcSpriteAnimationExportEntry {
    const frameWidth = positiveSpriteInteger(animation.frameWidth, spriteWidth);
    const frameHeight = positiveSpriteInteger(animation.frameHeight, spriteHeight);
    const frames = Array.isArray(animation.frames) ? animation.frames.filter(isRecord) : [];
    const frameCount = frames.length > 0 ? frames.length : positiveSpriteInteger(animation.frameCount, 1);
    const animationOriginX = signedSpriteInteger(animation.originX, 0);
    const animationOriginY = signedSpriteInteger(animation.originY, 0);
    const frameParts = Array.from({ length: frameCount }, (_item, frameIndex) => {
      try {
        return buildFrameMetaspriteParts(
        isRecord(frames[frameIndex]) ? frames[frameIndex] : {},
        frameIndex,
        frameWidth,
        frameHeight,
        animationOriginX,
        animationOriginY
        );
      } catch (error) {
        throw new Error(`Metasprite ${spriteSheet} / ${String(animation.id ?? name)}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
    });
    const exportedFrameParts = flipX
      ? frameParts.map((parts) => parts.map((part) => ({
        ...part,
        x: 16 - part.x - part.width,
        hflip: !Boolean(part.hflip)
      })))
      : frameParts;
    const usesCustomMetasprites = flipX || exportedFrameParts.some((parts) => frameNeedsCustomMetasprite(parts));
    const frame_indices = usesCustomMetasprites
      ? Array.from({ length: frameCount }, (_item, frameIndex) => frameIndex)
      : Array.from({ length: frameCount }, (_item, frameIndex) => (
        metaspriteIndexForAnimationFrame(data, spriteSheet, animation, frameIndex, frameWidth, frameHeight)
      ));
    const duration = animationFrameDuration(animation);
    const entry: AssetcSpriteAnimationExportEntry = {
      name,
      asset: packAssetName,
      durations: frame_indices.map(() => duration),
      loops: booleanField(animation, "loops", true),
      frame_indices
    };
    if (usesCustomMetasprites) {
      entry.frame_metasprites = exportedFrameParts.map((parts) => ({ parts }));
    }
    return entry;
}

function animationExportName(
  animationType: SpriteStateContract["animationType"],
  slot: SpriteAnimationSlot
): string {
  if (animationType === "directional_view") {
    return slot.startsWith("moving_")
      ? slot.replace("moving_", "moving_view_")
      : slot.replace("idle_", "view_");
  }
  return slot.replace("moving_", "walk_");
}

function buildSpriteAnimationExportEntries(
  data: GBAProjectData,
  actor: Record<string, unknown>,
  spriteSheet: string,
  spriteWidth: number,
  spriteHeight: number,
  packAssetName: string,
  directionAdapter: SpriteDirectionAdapter,
  preserveAuthoredAnimations = false
): AssetcSpriteAnimationExportEntry[] {
  const animations = animationsForSpriteSheet(data, spriteSheet);
  const spriteState = resolveSpriteStateForActor(spriteStateContracts(data), {
    animationStateID: nullableStringField(actor, "animationStateID"),
    spriteSheet
  });
  if (preserveAuthoredAnimations || !spriteState || spriteState.animationType === "platform_player" || spriteState.animationType === "cursor") {
    const allowedAnimationIDs = spriteState ? new Set(spriteState.animationIDs) : null;
    const selectedAnimations = allowedAnimationIDs
      ? animations.filter((animation, index) => allowedAnimationIDs.has(nullableStringField(animation, "id") || `animation-${index + 1}`))
      : animations;
    return sortTopdownSpriteAnimationsForExport(selectedAnimations).map((animation) => {
      const sourceIndex = animations.indexOf(animation);
      return (
      buildSpriteAnimationExportEntry(
        data,
        spriteSheet,
        spriteWidth,
        spriteHeight,
        packAssetName,
        animation,
        sourceIndex,
        stringField(animation, "name", `animation_${sourceIndex + 1}`)
      )
    );
    });
  }

  const recordsByID = new Map(animations.map((animation, index) => [
    nullableStringField(animation, "id") || `animation-${index + 1}`,
    { animation, index }
  ]));
  const normalized = normalizeSpriteStateSlots(
    spriteState,
    animations.map((animation, index) => ({
      id: nullableStringField(animation, "id") || `animation-${index + 1}`,
      name: nullableStringField(animation, "name"),
      state: nullableStringField(animation, "state"),
      direction: nullableStringField(animation, "direction"),
      spriteSheet
    })),
    directionAdapter
  );
  if (normalized.missingSlots.length > 0) {
    throw new Error(`SpriteState ${spriteState.name} nao preenche os slots: ${normalized.missingSlots.join(", ")}.`);
  }

  return SPRITE_ANIMATION_SLOT_ORDER.map((slot) => {
    const resolved = normalized.slots[slot];
    const record = resolved.animationID ? recordsByID.get(resolved.animationID) : undefined;
    if (!record) throw new Error(`SpriteState ${spriteState.name} referencia uma animacao ausente no slot ${slot}.`);
    return buildSpriteAnimationExportEntry(
      data,
      spriteSheet,
      spriteWidth,
      spriteHeight,
      packAssetName,
      record.animation,
      record.index,
      animationExportName(spriteState.animationType, slot),
      resolved.flipX
    );
  });
}

function buildIsometricTacticalAnimationExportEntries(
  data: GBAProjectData,
  spriteSheet: string,
  spriteWidth: number,
  spriteHeight: number,
  packAssetName: string,
  existingNames: ReadonlySet<string>
): AssetcSpriteAnimationExportEntry[] {
  const animations = animationsForSpriteSheet(data, spriteSheet);
  return animations.flatMap((animation, index) => {
    const animationName = nullableStringField(animation, "name") || "";
    const tokens = animationName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const state = tokens.includes("attack") || tokens.includes("attacking")
      ? "attack"
      : tokens.includes("hurt") || tokens.includes("hit") || tokens.includes("damaged")
        ? "hurt"
        : tokens.includes("defeat") || tokens.includes("defeated") || tokens.includes("death") || tokens.includes("dead")
          ? "defeat"
          : null;
    const direction = ["down", "up", "left", "right"].find((candidate) => tokens.includes(candidate));
    if (!state || !direction) return [];

    const exportName = `${state}_${direction}`;
    if (existingNames.has(exportName)) return [];
    return [buildSpriteAnimationExportEntry(
      data,
      spriteSheet,
      spriteWidth,
      spriteHeight,
      packAssetName,
      animation,
      index,
      exportName
    )];
  });
}

function buildFixedSpriteStateAliasExportEntries(
  data: GBAProjectData,
  spriteSheet: string,
  spriteWidth: number,
  spriteHeight: number,
  packAssetName: string,
  existingNames: Set<string>
): AssetcSpriteAnimationExportEntry[] {
  const animations = animationsForSpriteSheet(data, spriteSheet);
  const recordsByID = new Map(animations.map((animation, index) => [
    nullableStringField(animation, "id") || `animation-${index + 1}`,
    { animation, index }
  ]));
  const exportedNames = new Set(existingNames);

  return spriteStateContracts(data).flatMap((state) => {
    const name = state.name.trim();
    if (
      state.spriteSheet !== spriteSheet
      || state.animationType !== "fixed"
      || state.animationIDs.length !== 1
      || !name
      || exportedNames.has(name)
    ) {
      return [];
    }
    const record = recordsByID.get(state.animationIDs[0]);
    if (!record) return [];

    exportedNames.add(name);
    return [buildSpriteAnimationExportEntry(
      data,
      spriteSheet,
      spriteWidth,
      spriteHeight,
      packAssetName,
      record.animation,
      record.index,
      name
    )];
  });
}

export interface BuildActorEngineSpriteExportOptions {
  directionAdapter?: SpriteDirectionAdapter;
  includeIsometricTacticalAnimations?: boolean;
  preserveAuthoredAnimations?: boolean;
}

export function buildActorEngineSpriteExport(
  data: GBAProjectData,
  actor: Record<string, unknown>,
  spritePack: AssetcSpritePackGeneration | null,
  options: BuildActorEngineSpriteExportOptions = {}
): AssetcActorSpriteExportFields | null {
  const spriteSheet = nullableStringField(actor, "spriteSheet");
  if (!spriteSheet || !spritePack) return null;

  const paletteFamilyID = spritePaletteFamilyIDForActor(data, actor);
  const actorID = nullableStringField(actor, "id");
  const packAsset = (actorID ? spritePack.assetsBySheet[`${spriteSheet}::actor:${actorID}`] : undefined) ?? (paletteFamilyID
    ? spritePack.assetsBySheet[spritePaletteVariantKey(spriteSheet, paletteFamilyID)]
    : undefined) ?? spritePack.assetsBySheet[spriteSheet];
  if (!packAsset) return null;

  const animationName = nullableStringField(actor, "animationName");
  const frameIndex = integerField(actor, "animationFrameIndex", 0);
  const { spriteWidth, spriteHeight } = resolveSpriteSheetDimensions(data, spriteSheet);
  const baseAnimations = buildSpriteAnimationExportEntries(
    data,
    actor,
    spriteSheet,
    spriteWidth,
    spriteHeight,
    packAsset.name,
    options.directionAdapter ?? "topdown",
    options.preserveAuthoredAnimations
  );
  const tacticalAnimations = options.includeIsometricTacticalAnimations
    ? buildIsometricTacticalAnimationExportEntries(
      data,
      spriteSheet,
      spriteWidth,
      spriteHeight,
      packAsset.name,
      new Set(baseAnimations.map((animation) => animation.name))
    )
    : [];
  const animations = [
    ...baseAnimations,
    ...tacticalAnimations,
    ...buildFixedSpriteStateAliasExportEntries(
      data,
      spriteSheet,
      spriteWidth,
      spriteHeight,
      packAsset.name,
      new Set(baseAnimations.map((animation) => animation.name))
    )
  ];
  const matchedAnimation = animationName
    ? animationsForSpriteSheet(data, spriteSheet).find((animation, index) => (
      animationMatchesActorExport(animation, index, spriteSheet, animationName)
    ))
    : animationsForSpriteSheet(data, spriteSheet)[0];

  const metaspriteIndex = matchedAnimation
    ? metaspriteIndexForAnimationFrame(data, spriteSheet, matchedAnimation, frameIndex, spriteWidth, spriteHeight)
    : 0;
  const selectedAnimationName = animationName && animations.some((animation) => animation.name === animationName)
    ? animationName
    : animations[0]?.name;

  const fields: AssetcActorSpriteExportFields = {
    metasprite: { asset: packAsset.name, index: metaspriteIndex },
    animation: selectedAnimationName
      ? selectedAnimationName
      : { asset: packAsset.name },
    emit_animation_fallback: false
  };

  if (animations.length > 0) {
    fields.animations = animations;
  }

  return fields;
}

const LUTA_ANIMATION_STATES: AssetcLutaAnimationState[] = ["idle", "attack", "special", "guard", "hurt"];

/**
 * Builds the explicit animation map used only by the native Luta runtime.
 * Generic SpriteState export remains responsible for the actor's initial
 * metasprite; Luta states are authored by name so a fixed top-down state
 * cannot accidentally turn every animation into a combat capability.
 */
export function buildLutaActorEngineSpriteExport(
  data: GBAProjectData,
  actor: Record<string, unknown>,
  spritePack: AssetcSpritePackGeneration | null
): AssetcActorSpriteExportFields | null {
  const base = buildActorEngineSpriteExport(data, actor, spritePack);
  if (!base) return null;

  const rawConfig = actor.lutaAnimations ?? actor.luta_animations;
  if (rawConfig === undefined) return base;
  if (!isRecord(rawConfig)) {
    throw new Error("Actor lutaAnimations precisa ser um objeto quando configurado.");
  }

  const fallback = rawConfig.fallback === undefined ? "static_metasprite" : rawConfig.fallback;
  if (fallback !== "static_metasprite" && fallback !== "idle_animation") {
    throw new Error("Actor lutaAnimations.fallback precisa ser static_metasprite ou idle_animation.");
  }

  const spriteSheet = nullableStringField(actor, "spriteSheet");
  const animations = animationsForSpriteSheet(data, spriteSheet);
  const { spriteWidth, spriteHeight } = resolveSpriteSheetDimensions(data, spriteSheet);
  const packAsset = base.metasprite.asset;
  const animationSet: AssetcLutaAnimationSetExport = { fallback };

  LUTA_ANIMATION_STATES.forEach((state) => {
    const sourceName = rawConfig[state];
    if (sourceName === undefined || sourceName === null || sourceName === "") return;
    if (typeof sourceName !== "string" || sourceName.trim().length === 0) {
      throw new Error(`Actor lutaAnimations.${state} precisa ser o nome ou id de uma animacao.`);
    }
    const sourceIndex = animations.findIndex((animation, index) => (
      animationMatchesActorExport(animation, index, spriteSheet, sourceName.trim())
    ));
    if (sourceIndex < 0) {
      throw new Error(`Actor lutaAnimations.${state} referencia uma animacao ausente: ${sourceName}.`);
    }
    const sourceAnimation = animations[sourceIndex];
    const { name: _name, ...entry } = buildSpriteAnimationExportEntry(
      data,
      spriteSheet,
      spriteWidth,
      spriteHeight,
      packAsset,
      sourceAnimation,
      sourceIndex,
      state
    );
    animationSet[state] = entry;
  });

  return { ...base, luta_animation_set: animationSet };
}

export function buildAssetcSpritePackGeneration(data: GBAProjectData): AssetcSpritePackGeneration | null {
  const hudGroups = hudSceneGroupsByIcon(data);
  const spriteSheets = uniqueSpriteSheetsFromActors(data, hudGroups);
  if (spriteSheets.length === 0) return null;

  const packAssets: AssetcSpritePackAsset[] = [];
  const assetsBySheet: Record<string, AssetcSpritePackAsset> = {};
  const paletteFamilies = exportPaletteFamilies(data);
  const paletteFamiliesByID = new Map(paletteFamilies.map((family) => [family.id, family]));

  spriteSheets.forEach((spriteSheet, index) => {
    const asset = assetRecordByReference(data, spriteSheet);
    if (!asset) return;

    const assetName = stringField(asset, "name", spriteSheet);
    const assetID = stringField(asset, "id", "");
    const assetId = spriteSheetAssetId(assetName);
    const metadata = isRecord(asset.metadata) ? asset.metadata : {};
    const { spriteWidth, spriteHeight } = resolveSpriteSheetDimensions(data, spriteSheet);
    const fileName = assetName.replace(/^.*[\\/]/, "");
    const output = `assets/sprite/${normalizeIdentifier(fileName.replace(/\.[a-z0-9]+$/i, ""), assetId)}${fileName.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? ".png"}`;
    const paletteFamily = paletteFamilyForAsset(data, spriteSheet, "sprite", paletteFamilies);
    const spriteBpp = spriteColorModeForSheet(data, spriteSheet) === "8bpp" ? 8 : 4;
    const configuredObjectPaletteValues = objectPaletteValuesFromMetadata(metadata, assetName, spriteBpp === 8 ? 256 : 16);

    const buildPackAsset = (variantFamily?: ExportPaletteFamily): AssetcSpritePackAsset => {
      const variantSuffix = variantFamily ? `_palette_${normalizeIdentifier(variantFamily.id, "family")}` : "";
      const variantAssetID = `${assetId}${variantSuffix}`;
      return {
        id: variantAssetID,
        name: variantAssetID,
        kind: "obj",
        png: output,
        sprite_width: spriteWidth,
        sprite_height: spriteHeight,
        ...(spriteBpp === 8 ? { sprite_bpp: 8 as const } : {}),
        header: `${variantAssetID}.hpp`,
        symbol: variantAssetID,
        ...(metadata.gbStudioResourceType === "sprite" ? { transparent_color_index: "top_left" as const } : {}),
        ...(metadata.reserveObjTransparentColor === true ? { reserve_obj_transparent_color: true } : {}),
        ...(metadata.streamFrames === true ? { stream_frames: true as const } : {}),
        ...(configuredObjectPaletteValues
          ? { object_palette_values: configuredObjectPaletteValues }
          : variantFamily?.objects.length
          ? { object_palette_values: variantFamily.objects }
          : paletteFamily?.objects.length ? { object_palette_values: paletteFamily.objects } : {}),
        ...sceneBankFieldsForAsset(data, spriteSheet, "sprite", hudGroups)
      };
    };

    const packAsset = buildPackAsset();
    packAssets.push(packAsset);
    assetsBySheet[spriteSheet] = packAsset;
    assetsBySheet[assetName] = packAsset;
    if (assetID) assetsBySheet[assetID] = packAsset;

    const variantFamilyIDs = paletteFamily
      ? new Set<string>()
      : new Set(
        projectArray(data, "actors")
          .filter((actor) => nullableStringField(actor, "spriteSheet") === spriteSheet)
          .map((actor) => spritePaletteFamilyIDForActor(data, actor))
          .filter((familyID): familyID is string => Boolean(familyID) && Boolean(paletteFamiliesByID.get(familyID)?.objects.length))
      );
    variantFamilyIDs.forEach((familyID) => {
      const variantFamily = paletteFamiliesByID.get(familyID);
      if (!variantFamily || variantFamily.objects.length === 0) return;
      const variant = buildPackAsset(variantFamily);
      packAssets.push(variant);
      const variantKey = spritePaletteVariantKey(spriteSheet, familyID);
      assetsBySheet[variantKey] = variant;
      assetsBySheet[`${assetName}::${familyID}`] = variant;
      if (assetID) assetsBySheet[`${assetID}::${familyID}`] = variant;
    });
    if (metadata.streamFrames === true) {
      // Projectile instances share a synchronized animation, with a resident
      // range separate from actors using the same authored sheet.
      const usedByProjectile = projectArray(data, "events").some(event =>
        projectArray(event, "steps").some(step => String(step.command ?? "").trim().startsWith(`projectile_load_slot `)
          && String(step.command).trim().split(/\s+/)[2] === spriteSheet));
      if (usedByProjectile) {
        const base = buildPackAsset();
        const name = `${base.name}_projectile`;
        const variant = { ...base, id: name, name, header: `${name}.hpp`, symbol: name };
        packAssets.push(variant);
        assetsBySheet[`${spriteSheet}::actor:__projectile__`] = variant;
      }
      const roomOwners = new Map<string, string>();
      projectArray(data, "actors").forEach((actor, actorIndex) => {
        if (nullableStringField(actor, "spriteSheet") !== spriteSheet) return;
        const actorID = nullableStringField(actor, "id");
        const roomReference = nullableStringField(actor, "roomName") || nullableStringField(actor, "sceneName");
        if (!actorID || !roomReference) return;
        const room = projectRooms(data).find((room, index) => (
          roomReference === stringField(room, "name", `room_${index + 1}`) || roomReference === nullableStringField(room, "id")
        ));
        const roomKey = room ? stringField(room, "id", roomReference) : roomReference;
        if (!roomOwners.has(roomKey)) {
          roomOwners.set(roomKey, actorID);
          return;
        }
        // Streaming rewrites a resident range. Actors in the same room must not
        // overwrite each other's frame, even when the PNG and palette are shared.
        const familyID = spritePaletteFamilyIDForActor(data, actor);
        const family = familyID ? paletteFamiliesByID.get(familyID) : undefined;
        const base = buildPackAsset(family);
        const name = `${base.name}_actor_${normalizeIdentifier(actorID, "actor")}_${actorIndex + 1}`;
        const group = room ? engineSceneResourceBankGroupName(room, projectRooms(data).indexOf(room)) : base.bank_group;
        const variant = { ...base, id: name, name, header: `${name}.hpp`, symbol: name, bank_group: group, bank_groups: [group] };
        packAssets.push(variant);
        assetsBySheet[`${spriteSheet}::actor:${actorID}`] = variant;
      });
    }
  });

  if (packAssets.length === 0) return null;

  return {
    packAssets,
    assetsBySheet,
    assetNames: packAssets.map((asset) => asset.name)
  };
}

export interface AssetcPortraitPackAsset extends AssetcSceneBankFields {
  id: string;
  name: string;
  kind: "obj";
  png: string;
  sprite_width: number;
  sprite_height: number;
  header: string;
  symbol: string;
  portraitName: string;
}

export interface AssetcPortraitPackGeneration {
  packAssets: AssetcPortraitPackAsset[];
  assetsByPortraitName: Record<string, AssetcPortraitPackAsset>;
  assetNames: string[];
}

export interface EngineExportPortraitAsset {
  name: string;
  metasprite: { asset: string; index: number };
}

function portraitPackAssetId(portraitName: string): string {
  return normalizeIdentifier(portraitName.replace(/\.[a-z0-9]+$/i, ""), "portrait");
}

export function uniqueDialoguePortraitNames(data: GBAProjectData): string[] {
  const names = new Set<string>();
  projectArray(data, "dialogues").forEach((dialogue) => {
    const portrait = nullableStringField(dialogue, "portrait");
    if (portrait) names.add(portrait);
  });
  return Array.from(names);
}

export function buildAssetcPortraitPackGeneration(
  data: GBAProjectData,
  spritePack: AssetcSpritePackGeneration | null
): AssetcPortraitPackGeneration | null {
  const portraitNames = uniqueDialoguePortraitNames(data).filter((portraitName) => !spritePack?.assetsBySheet[portraitName]);
  if (portraitNames.length === 0) return null;

  const hudGroups = hudSceneGroupsByIcon(data);
  const packAssets: AssetcPortraitPackAsset[] = [];
  const assetsByPortraitName: Record<string, AssetcPortraitPackAsset> = {};

  portraitNames.forEach((portraitName) => {
    const asset = assetRecordByName(data, portraitName);
    if (!asset) return;

    const assetId = portraitPackAssetId(portraitName);
    const { spriteWidth, spriteHeight } = resolveSpriteSheetDimensions(data, portraitName);
    const fileName = portraitName.replace(/^.*[\\/]/, "");
    const output = `assets/sprite/${normalizeIdentifier(fileName.replace(/\.[a-z0-9]+$/i, ""), assetId)}${fileName.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? ".png"}`;

    const packAsset: AssetcPortraitPackAsset = {
      id: assetId,
      name: assetId,
      kind: "obj",
      png: output,
      sprite_width: spriteWidth,
      sprite_height: spriteHeight,
      header: `${assetId}.hpp`,
      symbol: assetId,
      portraitName,
      ...sceneBankFieldsForAsset(data, portraitName, "sprite", hudGroups)
    };

    packAssets.push(packAsset);
    assetsByPortraitName[portraitName] = packAsset;
  });

  if (packAssets.length === 0) return null;

  return {
    packAssets,
    assetsByPortraitName,
    assetNames: packAssets.map((asset) => asset.name)
  };
}

export function buildDialoguePortraitAssetsExport(
  data: GBAProjectData,
  portraitPack: AssetcPortraitPackGeneration | null,
  spritePack: AssetcSpritePackGeneration | null
): EngineExportPortraitAsset[] {
  return uniqueDialoguePortraitNames(data).flatMap((portraitName) => {
    const packAsset = portraitPack?.assetsByPortraitName[portraitName]
      ?? (spritePack?.assetsBySheet[portraitName]
        ? spritePack.assetsBySheet[portraitName]
        : null);
    if (!packAsset) return [];
    return [{
      name: portraitName,
      metasprite: { asset: packAsset.name, index: 0 }
    }];
  });
}

export interface AssetcEmotePackAsset extends AssetcSceneBankFields {
  id: string;
  name: string;
  kind: "obj";
  png: string;
  sprite_width: 16;
  sprite_height: 16;
  header: string;
  symbol: string;
  emoteName: string;
}

export interface AssetcEmotePackGeneration {
  packAssets: AssetcEmotePackAsset[];
  assetsByEmoteName: Record<string, AssetcEmotePackAsset>;
  assetNames: string[];
}

export interface EngineExportEmoteAsset {
  name: string;
  metasprite: { asset: string; index: number };
}

function emotePackAssetId(emoteName: string): string {
  return normalizeIdentifier(emoteName.replace(/\.[a-z0-9]+$/i, ""), "emote");
}

function sceneBankFieldsForEmote(data: GBAProjectData, emoteName: string): AssetcSceneBankFields {
  const rooms = projectRooms(data);
  const dialogueKeys = new Set(
    projectArray(data, "dialogues")
      .filter((dialogue) => nullableStringField(dialogue, "emote") === emoteName)
      .map((dialogue) => nullableStringField(dialogue, "key"))
      .filter(Boolean)
  );
  const groupIndexes = new Set<number>();
  let hasUnscopedReference = false;

  projectArray(data, "events").forEach((event) => {
    const referencesEmote = eventSteps(event).some((step) => {
      const parts = commandParts(nullableStringField(step, "command"));
      return (
        (parts[0] === "show_dialogue" && dialogueKeys.has(parts[1] ?? "")) ||
        (parts[0] === "show_actor_gesture" && parts[2] === emoteName)
      );
    });
    if (!referencesEmote) return;

    const hasRoomReference = ["roomID", "roomId", "roomName", "room", "sceneID", "sceneId", "sceneName"]
      .some((key) => nullableStringField(event, key).length > 0);
    if (!hasRoomReference) {
      hasUnscopedReference = true;
      return;
    }

    const roomIndex = roomIndexForEntity(event, rooms);
    if (roomIndex < 0) {
      hasUnscopedReference = true;
      return;
    }
    groupIndexes.add(roomIndex);
  });

  if (hasUnscopedReference || groupIndexes.size === 0) {
    return globalSceneBankFields(data);
  }

  const bankGroups = rooms
    .map((room, index) => ({ index, group: engineSceneResourceBankGroupName(room, index) }))
    .filter((entry) => groupIndexes.has(entry.index))
    .map((entry) => entry.group);
  return {
    bank_group: bankGroups[0] ?? "global",
    bank_groups: bankGroups.length > 0 ? bankGroups : globalSceneBankFields(data).bank_groups
  };
}

export function uniqueDialogueEmoteNames(data: GBAProjectData): string[] {
  const names = new Set<string>();
  projectArray(data, "dialogues").forEach((dialogue) => {
    const emote = nullableStringField(dialogue, "emote");
    if (emote) names.add(emote);
  });
  projectArray(data, "events").forEach((event) => {
    const steps = Array.isArray(event.steps) ? event.steps.filter(isRecord) : [];
    steps.forEach((step) => {
      const command = nullableStringField(step, "command");
      if (!command) return;
      const parts = command.split(/\s+/).filter(Boolean);
      if (parts[0] === "show_actor_gesture" && parts[2]) names.add(parts[2]);
    });
  });
  return Array.from(names);
}

export function buildAssetcEmotePackGeneration(
  data: GBAProjectData,
  spritePack: AssetcSpritePackGeneration | null,
  portraitPack: AssetcPortraitPackGeneration | null
): AssetcEmotePackGeneration | null {
  const emoteNames = uniqueDialogueEmoteNames(data).filter((emoteName) => (
    !spritePack?.assetsBySheet[emoteName] && !portraitPack?.assetsByPortraitName[emoteName]
  ));
  if (emoteNames.length === 0) return null;

  const packAssets: AssetcEmotePackAsset[] = [];
  const assetsByEmoteName: Record<string, AssetcEmotePackAsset> = {};

  emoteNames.forEach((emoteName) => {
    const asset = assetRecordByName(data, emoteName);
    if (!asset) return;

    const assetId = emotePackAssetId(emoteName);
    const fileName = emoteName.replace(/^.*[\\/]/, "");
    const output = `assets/sprite/${normalizeIdentifier(fileName.replace(/\.[a-z0-9]+$/i, ""), assetId)}${fileName.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? ".png"}`;

    const packAsset: AssetcEmotePackAsset = {
      id: assetId,
      name: assetId,
      kind: "obj",
      png: output,
      sprite_width: 16,
      sprite_height: 16,
      header: `${assetId}.hpp`,
      symbol: assetId,
      emoteName,
      ...sceneBankFieldsForEmote(data, emoteName)
    };

    packAssets.push(packAsset);
    assetsByEmoteName[emoteName] = packAsset;
  });

  if (packAssets.length === 0) return null;

  return {
    packAssets,
    assetsByEmoteName,
    assetNames: packAssets.map((asset) => asset.name)
  };
}

export function buildDialogueEmoteAssetsExport(
  data: GBAProjectData,
  emotePack: AssetcEmotePackGeneration | null,
  portraitPack: AssetcPortraitPackGeneration | null,
  spritePack: AssetcSpritePackGeneration | null
): EngineExportEmoteAsset[] {
  return uniqueDialogueEmoteNames(data).flatMap((emoteName) => {
    const packAsset = emotePack?.assetsByEmoteName[emoteName]
      ?? portraitPack?.assetsByPortraitName[emoteName]
      ?? (spritePack?.assetsBySheet[emoteName]
        ? spritePack.assetsBySheet[emoteName]
        : null);
    if (!packAsset) return [];
    return [{
      name: emoteName,
      metasprite: { asset: packAsset.name, index: 0 }
    }];
  });
}

export interface AssetcTilesetPackAsset extends AssetcSceneBankFields {
  id: string;
  name: string;
  kind: "bg" | "affine_bg" | "indexed_bg" | "paged_bg";
  paged_palette_owner?: string;
  background_bpp: 4 | 8;
  optimize_affine_tiles?: true;
  affine_tile_budget?: number;
  optimize_background_tiles?: true;
  background_tile_budget?: number;
  background_palette_banks?: number;
  background_palette_reference?: string;
  background_palette_reference_colors?: Array<[number, number, number]>;
  background_palette_reference_plan?: AssetcBackgroundPaletteReferencePlan;
  placement?: AssetcTilesetPlacement;
  png: string;
  header: string;
  symbol: string;
}

export interface AssetcBackgroundPaletteReferencePlan {
  banks: Array<Array<[number, number, number] | null>>;
  tile_palette_banks: number[];
}

export interface AssetcTilesetPackGeneration {
  packAssets: AssetcTilesetPackAsset[];
  assetsBySheet: Record<string, AssetcTilesetPackAsset>;
  assetNames: string[];
}

function tilesetPackAssetId(tilesetName: string): string {
  return normalizeIdentifier(tilesetName.replace(/\.[a-z0-9]+$/i, ""), "tileset");
}

function backgroundPaletteReferencePlanForAsset(
  metadata: Record<string, unknown> | undefined,
  assetName: string
): AssetcBackgroundPaletteReferencePlan | undefined {
  const rawPlan = metadata?.backgroundPaletteReferencePlan;
  if (rawPlan === undefined) return undefined;
  if (!isRecord(rawPlan)) {
    throw new Error(`Background asset ${assetName} backgroundPaletteReferencePlan must be an object.`);
  }

  const rawBanks = rawPlan.banks;
  if (!Array.isArray(rawBanks) || rawBanks.length === 0 || rawBanks.length > 16) {
    throw new Error(`Background asset ${assetName} backgroundPaletteReferencePlan must contain between 1 and 16 banks.`);
  }
  const banks = rawBanks.map((rawBank, bankIndex) => {
    if (!Array.isArray(rawBank) || rawBank.length > 16) {
      throw new Error(`Background asset ${assetName} palette bank ${bankIndex} must contain at most 16 colors.`);
    }
    return rawBank.map((color) => {
      if (color === null) return null;
      if (!Array.isArray(color) || color.length !== 3 || color.some((channel) => (
        !Number.isInteger(channel) || channel < 0 || channel > 255
      ))) {
        throw new Error(`Background asset ${assetName} has an invalid RGB color in palette bank ${bankIndex}.`);
      }
      return [color[0] as number, color[1] as number, color[2] as number] as [number, number, number];
    });
  });

  const rawAssignments = rawPlan.tile_palette_banks;
  if (!Array.isArray(rawAssignments) || rawAssignments.some((assignment) => (
    !Number.isInteger(assignment) || assignment < 0 || assignment >= banks.length
  ))) {
    throw new Error(`Background asset ${assetName} backgroundPaletteReferencePlan has invalid tile palette assignments.`);
  }

  return { banks, tile_palette_banks: rawAssignments as number[] };
}

function racingPseudo3dVisualAssetNamesForRoom(room: Record<string, unknown>): string[] {
  const runtime = child(room, "runtime");
  const config = child(runtime, "config");
  if (nullableStringField(runtime, "type") !== "racing" || nullableStringField(config, "presentation") !== "pseudo3d") {
    return [];
  }
  const visuals = child(config, "pseudo3dVisuals");
  return [
    nullableStringField(visuals, "panoramaBackgroundId"),
    nullableStringField(visuals, "floorTilemapId"),
    nullableStringField(visuals, "minimapAssetId")
  ].filter((assetName): assetName is string => Boolean(assetName));
}

function racingPseudo3dFloorAssetNames(data: GBAProjectData): Set<string> {
  const floorAssets = new Set<string>();
  projectRooms(data).forEach((room) => {
    const runtime = child(room, "runtime");
    const config = child(runtime, "config");
    if (nullableStringField(runtime, "type") !== "racing" || nullableStringField(config, "presentation") !== "pseudo3d") {
      return;
    }
    const floor = nullableStringField(child(config, "pseudo3dVisuals"), "floorTilemapId");
    if (floor) floorAssets.add(floor);
  });
  return floorAssets;
}

function affineBackgroundAssetReference(room: Record<string, unknown>): string {
  const runtime = child(room, "runtime");
  const config = child(runtime, "config");
  const composition = child(config, "composition");
  if (composition?.enabled === true && Array.isArray(composition.layers)) {
    const affineLayer = composition.layers.find((layer) => (
      isRecord(layer) && layer.enabled !== false && layer.kind === "affine_bg" && typeof layer.assetId === "string" && layer.assetId.trim().length > 0
    ));
    if (isRecord(affineLayer)) return stringField(affineLayer, "assetId", "");
  }
  const affine = child(config, "affine");
  if (affine?.enabled !== true) return "";
  return nullableStringField(affine, "assetId");
}

function uniqueTilesetsFromRooms(data: GBAProjectData): string[] {
  const tilesets = new Set<string>();
  projectRooms(data).forEach((room) => {
    const authoredIsometricBackground = roomUsesAuthoredIsometricBackground(room);
    const pagedTacticalSurface = roomUsesPagedTacticalSurface(room);
    const background = nullableStringField(room, "backgroundAssetName") || nullableStringField(room, "background");
    if (background && !pagedTacticalSurface) tilesets.add(background);
    const authoredTileset = nullableStringField(room, "tilesetAssetName");
    if (authoredTileset && !authoredIsometricBackground && !pagedTacticalSurface) tilesets.add(authoredTileset);
    const runtimeBase = nullableStringField(room, "runtimeBaseBackgroundAssetName");
    if (runtimeBase) tilesets.add(runtimeBase);
    if (!authoredIsometricBackground) {
      layerTilesetNamesForRoom(room).forEach((layerTileset) => tilesets.add(layerTileset));
    }
    racingPseudo3dVisualAssetNamesForRoom(room).forEach((assetName) => tilesets.add(assetName));
    const affineAssetReference = affineBackgroundAssetReference(room);
    if (affineAssetReference) {
      const affineAsset = assetRecordByReference(data, affineAssetReference);
      tilesets.add(affineAsset ? stringField(affineAsset, "name", affineAssetReference) : affineAssetReference);
    }
    const runtime = child(room, "runtime");
    if (nullableStringField(runtime, "type") === "menu") {
      const config = child(runtime, "config");
      const titleOverlay = nullableStringField(config, "titleOverlayAssetName");
      if (titleOverlay) tilesets.add(titleOverlay);
      const backgroundAnimation = child(config, "backgroundAnimation");
      const frameAssetNames = backgroundAnimation?.frameAssetNames;
      if (Array.isArray(frameAssetNames)) {
        frameAssetNames.forEach((frameAssetName) => {
          if (typeof frameAssetName === "string" && frameAssetName.trim()) tilesets.add(frameAssetName.trim());
        });
      }
      recordArray(config ?? {}, "screens").forEach((screen) => {
        const embeddedOverlay = nullableStringField(screen, "titleOverlayAssetName");
        if (embeddedOverlay) tilesets.add(embeddedOverlay);
        const embeddedAnimation = child(screen, "backgroundAnimation");
        const embeddedFrameAssetNames = embeddedAnimation?.frameAssetNames;
        if (Array.isArray(embeddedFrameAssetNames)) {
          embeddedFrameAssetNames.forEach((frameAssetName) => {
            if (typeof frameAssetName === "string" && frameAssetName.trim()) tilesets.add(frameAssetName.trim());
          });
        }
      });
    }
    if (nullableStringField(runtime, "type") === "cutscene") {
      const config = child(runtime, "config");
      recordArray(config ?? {}, "steps").forEach((step) => {
        const backgroundAssetName = nullableStringField(step, "backgroundAssetName");
        if (backgroundAssetName) tilesets.add(backgroundAssetName);
      });
    }
    if (nullableStringField(runtime, "type") === "luta") {
      const config = child(runtime, "config");
      const hudAssetName = nullableStringField(config, "hudAssetName");
      if (hudAssetName) tilesets.add(hudAssetName);
    }
    if (nullableStringField(runtime, "type") === "isometric") {
      const config = child(runtime, "config");
      const surface = child(config, "pagedSurface");
      for (const key of ["backgroundAsset", "foregroundAsset"]) {
        const name = nullableStringField(surface, key);
        if (name) tilesets.add(name);
      }
      const presentation = child(config, "tacticalPresentation");
      if (presentation) {
        [
          nullableStringField(presentation, "surfaceAsset"),
          nullableStringField(presentation, "gridAsset"),
          nullableStringField(presentation, "hudLayout")
        ].forEach((assetName) => {
          if (assetName) tilesets.add(assetName.split("#", 1)[0]);
        });
        recordArray(presentation, "assets").forEach((asset) => {
          const consumer = nullableStringField(asset, "consumer");
          if (consumer !== "bg" && consumer !== "ui") return;
          const reference = nullableStringField(asset, "path") || nullableStringField(asset, "id");
          if (reference) tilesets.add(reference.split("#", 1)[0]);
        });
      }
    }
  });
  return Array.from(tilesets);
}

function uniqueTilesetsForPack(data: GBAProjectData): string[] {
  const tilesets = new Set([...uniqueTilesetsFromRooms(data), ...eventBackgroundAssetNames(data)]);
  projectRooms(data).forEach((room) => {
    const config = child(child(room, "runtime"), "config");
    const presentation = child(config, "tacticalPresentation");
    const pages = isRecord(presentation) ? presentation.surfacePages : undefined;
    if (Array.isArray(pages)) {
      pages.filter(isRecord).forEach((page) => {
        const asset = nullableStringField(page, "asset");
        if (asset) tilesets.add(asset);
      });
    }
  });
  projectArray(data, "events").forEach((event) => {
    recordArray(event, "steps").forEach((step) => {
      const parts = commandParts(stringField(step, "command", ""));
      if (parts[0] === "replace_tile_animation" && parts[6]) tilesets.add(parts[6]);
    });
  });
  return Array.from(tilesets);
}

export function buildAssetcTilesetPackGeneration(data: GBAProjectData): AssetcTilesetPackGeneration | null {
  const tilesetNames = uniqueTilesetsForPack(data);
  if (tilesetNames.length === 0) return null;

  const affineFloorAssets = racingPseudo3dFloorAssetNames(data);

  const packAssets: AssetcTilesetPackAsset[] = [];
  const assetsBySheet: Record<string, AssetcTilesetPackAsset> = {};
  const paletteFamilies = exportPaletteFamilies(data);

  tilesetNames.forEach((tilesetName) => {
    const asset = assetRecordByName(data, tilesetName);
    if (!asset) return;
    const metadata = child(asset, "metadata");
    const affineTileOptimizer = child(metadata, "affineTileOptimizer");
    const metadataKind = nullableStringField(metadata, "kind").toLowerCase();
    const assetKind = nullableStringField(asset, "kind").toLowerCase();
    const isAffineAsset = affineFloorAssets.has(tilesetName)
      || metadataKind === "affine_bg"
      || assetKind === "affine_bg";
    const isPagedBackground = metadataKind === "paged_bg" || assetKind === "paged_bg";
    const isIndexedIsometricSource = isPagedBackground || metadataKind === "indexed_bg"
      || assetKind === "indexed_bg";
    const colorMode = nullableStringField(asset, "colorMode") || nullableStringField(metadata, "colorMode");
    const normalizedColorMode = colorMode.toLowerCase();
    const validColorModes = isAffineAsset
      ? ["4bpp", "8bpp-affine"]
      : isIndexedIsometricSource
        ? ["8bpp-indexed"]
        : ["4bpp"];
    if (normalizedColorMode && !validColorModes.includes(normalizedColorMode)) {
      const expectedColorMode = isAffineAsset
        ? "4bpp or 8bpp-affine"
        : isIndexedIsometricSource
          ? "8bpp-indexed"
          : "4bpp";
      throw new Error(`Background asset ${tilesetName} must use the ${expectedColorMode} color contract.`);
    }
    const backgroundBpp = (isAffineAsset || isIndexedIsometricSource ? 8 : 4) as 4 | 8;
    const backgroundTileOptimizer = child(metadata, "backgroundTileOptimizer");
    const optimizeBackgroundTiles = backgroundBpp === 4 && booleanField(backgroundTileOptimizer, "enabled", false);
    const backgroundTileBudget = Math.max(1, Math.min(1024, integerField(backgroundTileOptimizer, "tileBudget", 1024)));
    const optimizeAffineTiles = isAffineAsset && booleanField(affineTileOptimizer, "enabled", false);
    const affineTileBudget = Math.max(1, Math.min(256, integerField(affineTileOptimizer, "tileBudget", 256)));
    const configuredBackgroundPaletteBankBudget = integerField(metadata, "backgroundPaletteBankBudget", 16);
    const paletteBankPolicy = backgroundPaletteBankPolicyForAsset(data, tilesetName);
    const backgroundPaletteBankBudget = effectiveBackgroundPaletteBankBudget(
      configuredBackgroundPaletteBankBudget,
      paletteBankPolicy
    );
    const backgroundPaletteReferenceAssetName = nullableStringField(metadata, "backgroundPaletteReferenceAssetName");
    const configuredBackgroundPaletteReferencePlan = backgroundPaletteReferencePlanForAsset(metadata, tilesetName);
    const paletteFamily = paletteFamilyForAsset(data, tilesetName, "tileset", paletteFamilies);
    const pointClickPlacement = pointClickBackgroundPlacement(data, tilesetName, backgroundBpp);

    const assetId = tilesetPackAssetId(tilesetName);
    const fileName = tilesetName.replace(/^.*[\\/]/, "");
    const output = `assets/image/${normalizeIdentifier(fileName.replace(/\.[a-z0-9]+$/i, ""), assetId)}${fileName.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? ".png"}`;

    const pagedOwner = projectArray(data, "rooms").map(room => child(child(child(room, "runtime"), "config"), "pagedSurface"))
      .find(surface => nullableStringField(surface, "foregroundAsset") === tilesetName);
    const packAsset: AssetcTilesetPackAsset = {
      ...(isPagedBackground && pagedOwner ? { paged_palette_owner: tilesetPackAssetId(nullableStringField(pagedOwner, "backgroundAsset")) } : {}),
      id: assetId,
      name: assetId,
      kind: isAffineAsset ? "affine_bg" : isPagedBackground ? "paged_bg" : isIndexedIsometricSource ? "indexed_bg" : "bg",
      background_bpp: backgroundBpp,
      ...(optimizeAffineTiles ? {
        optimize_affine_tiles: true as const,
        affine_tile_budget: affineTileBudget
      } : {}),
      ...(optimizeBackgroundTiles ? {
        optimize_background_tiles: true as const,
        background_tile_budget: backgroundTileBudget
      } : {}),
      ...(backgroundBpp === 4 ? {
        background_palette_banks: backgroundPaletteBankBudget
      } : {}),
      ...(configuredBackgroundPaletteReferencePlan ? {
        background_palette_reference_plan: configuredBackgroundPaletteReferencePlan
      } : backgroundPaletteReferenceAssetName ? {
        background_palette_reference: `assets/image/${normalizeIdentifier(
          backgroundPaletteReferenceAssetName.replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]+$/i, ""),
          "background"
        )}.png`
      } : {}),
      ...(!configuredBackgroundPaletteReferencePlan && !backgroundPaletteReferenceAssetName && paletteFamily?.background.length ? {
        background_palette_reference_colors: paletteFamily.background.map(rgb555ToRgb888)
      } : {}),
      ...(pointClickPlacement ? { placement: pointClickPlacement } : {}),
      png: output,
      header: `${assetId}.hpp`,
      symbol: assetId,
      ...sceneBankFieldsForAsset(data, tilesetName, "tileset")
    };

    packAssets.push(packAsset);
    assetsBySheet[tilesetName] = packAsset;
  });

  if (packAssets.length === 0) return null;

  return {
    packAssets,
    assetsBySheet,
    assetNames: packAssets.map((asset) => asset.name)
  };
}

export interface GenerateEngineProjectExportOptions {
  pluginRegistry?: ProjectPluginRegistry;
}

export function generateEngineProjectExport(
  data: GBAProjectData,
  options: GenerateEngineProjectExportOptions = {}
): EngineProjectExport {
  const advancedTools = projectWithCompiledAdvancedTools(data);
  data = advancedTools.data;
  const contractIssues = validateGBAProjectMigrationContract(data);
  if (contractIssues.length > 0) {
    const validators = Array.from(new Set(contractIssues.map((issue) => issue.validator))).join(", ");
    throw new Error(`Contrato de migracao invalido: ${validators}`);
  }

  const pluginRegistry = options.pluginRegistry ?? emptyProjectPluginRegistry();
  const target = projectTarget(data);
  const assets = exportableAssets(data);
  return {
    target,
    assets,
    files: [
      { path: "main.cpp", contents: mainCpp() },
      { path: "gbastudio_project_data.hpp", contents: projectDataHeader(data, pluginRegistry) },
      { path: "gbastudio_project.json", contents: engineManifest(data, target, assets) },
      ...(advancedTools.compiled.hasResources
        ? [{
            path: "advanced_tools.json",
            contents: `${JSON.stringify(advancedTools.compiled.contract, null, 2)}\n`
          }]
        : []),
      { path: "README.md", contents: readme(data, target) }
    ]
  };
}
