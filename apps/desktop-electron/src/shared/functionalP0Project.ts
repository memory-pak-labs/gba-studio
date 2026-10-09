import {
  applyAudioPatternPresetInProject,
  createAudioItemInProject
} from "./audioWorkspace.js";
import { createDialogueInProject, updateDialogueInProject } from "./dialoguesWorkspace.js";
import {
  addEventStepInProject,
  bindEventToTargetInProject,
  createEventInProject
} from "./eventsWorkspace.js";
import { createBlankProjectData } from "./newProject.js";
import {
  createRoomConnectionInProject,
  createRoomInProject,
  setRoomCollisionCellInProject,
  setRoomTileCellInProject,
  updateRoomBackgroundTilesetGridInProject,
  updateRoomFieldsInProject
} from "./roomsWorkspace.js";
import type { GBAProjectData } from "./projectFile.js";
import { importTiledMapIntoProject } from "./tiledImport.js";
import {
  TOPDOWN_SANDBOX_STAGE1_HEIGHT,
  TOPDOWN_SANDBOX_STAGE1_LAYER_NAME,
  TOPDOWN_SANDBOX_STAGE1_TILE_HEIGHT,
  TOPDOWN_SANDBOX_STAGE1_TILE_WIDTH,
  TOPDOWN_SANDBOX_STAGE1_TILEMAP,
  TOPDOWN_SANDBOX_STAGE1_TILESET,
  TOPDOWN_SANDBOX_STAGE1_WIDTH
} from "./topdownSandboxStage1Tilemap.js";

const DEFAULT_TOPDOWN_PLAYER_SPRITE = "player_topdown_4dir.png";
const TOPDOWN_SANDBOX_TILESET = TOPDOWN_SANDBOX_STAGE1_TILESET;

export const provenEditorFeatures = [
  "new-project",
  "room",
  "tilemap",
  "collision",
  "actor",
  "npc",
  "trigger",
  "event",
  "dialogue",
  "sprite",
  "audio",
  "files-assets",
  "settings",
  "save-reopen",
  "engine-export"
];

function appendRecord(data: GBAProjectData, key: string, record: Record<string, unknown>): GBAProjectData {
  return {
    ...data,
    [key]: [...(Array.isArray(data[key]) ? data[key] as unknown[] : []), record]
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function updateRecordByID(
  data: GBAProjectData,
  key: string,
  id: string,
  fields: Record<string, unknown>
): GBAProjectData {
  const records = Array.isArray(data[key]) ? data[key].filter(isRecord) : [];
  return {
    ...data,
    [key]: records.map((record) => record.id === id ? { ...record, ...fields } : record)
  };
}

export function buildFunctionalP0Project(): GBAProjectData {
  let project = createBlankProjectData({
    name: "Electron P0 Functional",
    exportFolder: "build/electron-p0"
  });

  project = createRoomInProject(project, {
    id: "room-2",
    name: "room_2",
    width: 30,
    height: 20,
    sceneType: "topdown"
  });
  project = createRoomConnectionInProject(project, {
    from: "cena_1",
    to: "room_2",
    eventName: "door_to_room_2"
  });

  project = appendRecord(project, "assets", {
    id: "asset-tiles",
    name: TOPDOWN_SANDBOX_TILESET,
    kind: "Tileset",
    metadata: {
      source: `Assets/tiles/${TOPDOWN_SANDBOX_TILESET}`,
      tileWidth: TOPDOWN_SANDBOX_STAGE1_TILE_WIDTH,
      tileHeight: TOPDOWN_SANDBOX_STAGE1_TILE_HEIGHT
    }
  });
  project = appendRecord(project, "assets", {
    id: "asset-theme",
    name: "intro_theme.mod",
    kind: "Audio",
    metadata: { source: "Assets/audio/intro_theme.mod" }
  });
  project = appendRecord(project, "assets", {
    id: "asset-confirm",
    name: "confirm.wav",
    kind: "SFX",
    metadata: { source: "Assets/audio/confirm.wav" }
  });

  project = importTiledMapIntoProject(project, {
    width: TOPDOWN_SANDBOX_STAGE1_WIDTH,
    height: TOPDOWN_SANDBOX_STAGE1_HEIGHT,
    tileWidth: TOPDOWN_SANDBOX_STAGE1_TILE_WIDTH,
    tileHeight: TOPDOWN_SANDBOX_STAGE1_TILE_HEIGHT,
    tilemap: TOPDOWN_SANDBOX_STAGE1_TILEMAP,
    layerName: TOPDOWN_SANDBOX_STAGE1_LAYER_NAME,
    tilesetImage: TOPDOWN_SANDBOX_TILESET,
    tilesetName: "tiles_topdown_sandbox"
  }, {
    targetRoomId: "room-1",
    backgroundAssetName: TOPDOWN_SANDBOX_TILESET
  });
  project = updateRoomBackgroundTilesetGridInProject(project, "room-1", {
    tileWidth: TOPDOWN_SANDBOX_STAGE1_TILE_WIDTH,
    tileHeight: TOPDOWN_SANDBOX_STAGE1_TILE_HEIGHT
  });
  project = updateRoomFieldsInProject(project, "room-1", {
    music: "intro_theme.mod",
    playerActorName: "Player"
  });
  project = updateRoomFieldsInProject(project, "room-2", {
    backgroundAssetName: TOPDOWN_SANDBOX_TILESET,
    music: "intro_theme.mod"
  });
  project = updateRoomBackgroundTilesetGridInProject(project, "room-2", {
    tileWidth: TOPDOWN_SANDBOX_STAGE1_TILE_WIDTH,
    tileHeight: TOPDOWN_SANDBOX_STAGE1_TILE_HEIGHT
  });
  project = setRoomCollisionCellInProject(project, "room-1", 31, true);
  project = setRoomTileCellInProject(project, "room-2", 0, 3);
  project = setRoomTileCellInProject(project, "room-2", 1, 4);
  project = setRoomTileCellInProject(project, "room-2", 30, 5);

  project = updateRecordByID(project, "actors", "actor-player", {
    x: 15,
    y: 10,
    eventName: "player_start",
    spriteSheet: DEFAULT_TOPDOWN_PLAYER_SPRITE,
    animationName: "idle_down"
  });
  project = appendRecord(project, "actors", {
    id: "actor-guide",
    name: "Guide",
    roomName: "cena_1",
    x: 18,
    y: 13,
    spriteSheet: DEFAULT_TOPDOWN_PLAYER_SPRITE,
    animationName: "idle_right",
    eventName: "guide_talk",
    eventBindings: {}
  });
  project = appendRecord(project, "triggers", {
    id: "trigger-door",
    name: "Door to room 2",
    roomName: "cena_1",
    x: 28,
    y: 10,
    width: 2,
    height: 2,
    eventName: "door_to_room_2",
    onEnterEventName: "door_to_room_2"
  });

  project = createDialogueInProject(project, {
    key: "intro_001",
    character: "Ana",
    portrait: "portrait.png",
    text: "ROM OK. TESTE A CENA.",
    choices: ["Sim", "Abrir editor"]
  });
  project = updateDialogueInProject(project, "intro_001", {
    textSound: "confirm.wav",
    confirmSound: "confirm.wav"
  });
  project = createDialogueInProject(project, {
    key: "guide_001",
    character: "Guia",
    portrait: "portrait.png",
    text: "A PORTA LEVA AO SEGUNDO CAIS.",
    choices: []
  });
  project = updateDialogueInProject(project, "guide_001", {
    textSound: "confirm.wav",
    confirmSound: "confirm.wav"
  });

  project = createAudioItemInProject(project, {
    id: "audio-theme",
    name: "intro_theme.mod",
    kind: "Musica"
  });
  project = applyAudioPatternPresetInProject(project, "audio-theme");
  project = createAudioItemInProject(project, {
    id: "audio-confirm",
    sourceAssetID: "asset-confirm",
    name: "confirm.wav",
    kind: "SFX"
  });

  project = createEventInProject(project, {
    id: "event-room-boot",
    name: "room_boot",
    category: "Cena"
  });
  project = addEventStepInProject(project, "event-room-boot", "play_music intro_theme.mod");
  project = addEventStepInProject(project, "event-room-boot", "play_sfx confirm.wav");
  project = addEventStepInProject(project, "event-room-boot", "call_event boot_dialogue");
  project = createEventInProject(project, {
    id: "event-boot-dialogue",
    name: "boot_dialogue",
    category: "Dialogo"
  });
  project = addEventStepInProject(project, "event-boot-dialogue", "show_dialogue intro_001");
  project = createEventInProject(project, {
    id: "event-player-start",
    name: "player_start",
    category: "Ator"
  });
  project = addEventStepInProject(project, "event-player-start", "show_choice intro_001");
  project = createEventInProject(project, {
    id: "event-door",
    name: "door_to_room_2",
    category: "Trigger"
  });
  project = addEventStepInProject(project, "event-door", "change_scene room_2");
  project = createEventInProject(project, {
    id: "event-guide-talk",
    name: "guide_talk",
    category: "Ator"
  });
  project = addEventStepInProject(project, "event-guide-talk", "show_dialogue guide_001");
  project = bindEventToTargetInProject(project, "event-room-boot", {
    targetKind: "room",
    targetName: "cena_1",
    bindingKey: "onInit"
  });
  project = bindEventToTargetInProject(project, "event-player-start", {
    targetKind: "actor",
    targetName: "Player",
    bindingKey: "onInteract"
  });
  project = bindEventToTargetInProject(project, "event-door", {
    targetKind: "trigger",
    targetName: "Door to room 2",
    bindingKey: "onEnter"
  });
  project = bindEventToTargetInProject(project, "event-guide-talk", {
    targetKind: "actor",
    targetName: "Guide",
    bindingKey: "onInteract"
  });

  return project;
}
