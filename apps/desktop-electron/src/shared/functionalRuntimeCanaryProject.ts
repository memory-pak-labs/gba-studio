import {
  addEventStepInProject,
  bindEventToTargetInProject,
  createEventInProject
} from "./eventsWorkspace.js";
import { buildFunctionalP0Project } from "./functionalP0Project.js";
import type { GBAProjectData } from "./projectFile.js";
import { ROOM_COLLISION_TYPES } from "./roomCollisionTypes.js";
import {
  createActorInProject,
  createTriggerInProject,
  renameRoomInProject,
  setRoomCollisionTypeInProject
} from "./roomsWorkspace.js";
import { createProjectVariableInProject } from "./variablesWorkspace.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(project: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = project[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function withRecordPatch(
  project: GBAProjectData,
  key: string,
  predicate: (record: Record<string, unknown>) => boolean,
  patch: Record<string, unknown>
): GBAProjectData {
  return {
    ...project,
    [key]: records(project, key).map((record) => predicate(record) ? { ...record, ...patch } : record)
  };
}

function withCanarySettings(project: GBAProjectData): GBAProjectData {
  const settings = isRecord(project.settings) ? project.settings : {};
  const general = isRecord(settings.general) ? settings.general : {};
  const build = isRecord(settings.build) ? settings.build : {};
  return {
    ...project,
    name: "Electron Runtime Canary",
    settings: {
      ...settings,
      general: {
        ...general,
        gameTitle: "Runtime Canary",
        startScene: "canary_gameplay",
        exportFolder: "build/runtime-canary"
      },
      build: {
        ...build,
        romFileName: "runtime_canary.gba"
      }
    }
  };
}

/** Projeto de integracao usado para provar os principais contratos de runtime numa unica ROM. */
export function buildFunctionalRuntimeCanaryProject(): GBAProjectData {
  let project = buildFunctionalP0Project();
  project = renameRoomInProject(project, "room-1", "canary_gameplay");
  project = {
    ...project,
    actors: records(project, "actors").map((actor) => actor.roomName === "cena_1"
      ? { ...actor, roomName: "canary_gameplay" }
      : actor),
    triggers: records(project, "triggers").map((trigger) => trigger.roomName === "cena_1"
      ? { ...trigger, roomName: "canary_gameplay" }
      : trigger)
  };
  project = withCanarySettings(project);

  const gameplayRoom = records(project, "scenas").find((room) => room.name === "canary_gameplay");
  const ground = Array.isArray(gameplayRoom?.tilemap) ? [...gameplayRoom.tilemap] : [];
  const foreground = ground.map((_tile, index) => [336, 337, 368, 369].includes(index) ? 142 : -1);
  const tileLayers = [
    { mapping: "BG2", tilemap: ground },
    { mapping: "BG1", tilemap: foreground }
  ];
  project = withRecordPatch(project, "scenas", (room) => room.id === "room-1", { tileLayers });
  project = withRecordPatch(project, "rooms", (room) => room.id === "room-1", { tileLayers });

  ROOM_COLLISION_TYPES.forEach((collisionType, offset) => {
    // O contrato atual pinta um metatile 2x2 por edição. Use âncoras
    // alinhadas e não sobrepostas para que o canário continue cobrindo todos
    // os tipos de colisão sem perder casos por sobreposição.
    project = setRoomCollisionTypeInProject(project, "room-1", 64 + offset * 2, collisionType);
  });
  const collisionLabCells: Array<[number, (typeof ROOM_COLLISION_TYPES)[number]]> = [
    [300, "left"],
    [302, "up"],
    [304, "down"],
    [306, "right"],
    [308, "solid"],
    [310, "water"],
    [312, "damage"],
    [314, "ladder"],
    [316, "event"],
    [318, "slope_up_left"],
    [320, "slope_up_right"]
  ];
  for (const [cellIndex, collisionType] of collisionLabCells) {
    project = setRoomCollisionTypeInProject(project, "room-2", cellIndex, collisionType);
  }

  project = createActorInProject(project, {
    id: "actor-canary-npc",
    name: "NPC_Canary",
    roomID: "room-1",
    x: 18,
    y: 10,
    spriteSheet: "player_topdown_4dir.png",
    animationStateID: "state-player-default",
    animationName: "idle_down"
  });
  project = createTriggerInProject(project, {
    id: "trigger-state-witness",
    name: "State Witness",
    roomID: "room-1",
    x: 16,
    y: 10,
    width: 1,
    height: 1
  });

  project = withRecordPatch(project, "actors", (actor) => actor.id === "actor-canary-npc", {
    prefabID: "actor-prefab-canary-npc"
  });
  project = withRecordPatch(project, "triggers", (trigger) => trigger.id === "trigger-state-witness", {
    eventName: "canary_state",
    prefabID: "trigger-prefab-state-witness"
  });
  project = withRecordPatch(project, "triggers", (trigger) => trigger.id === "trigger-door", {
    name: "Room Exit"
  });
  project = {
    ...project,
    actorPrefabs: [{
      id: "actor-prefab-canary-npc",
      name: "NPC Canary",
      spriteSheet: "player_topdown_4dir.png",
      animationStateID: "state-player-default",
      animationName: "idle_down",
      collisionEnabled: true
    }],
    triggerPrefabs: [{
      id: "trigger-prefab-state-witness",
      name: "State Witness",
      width: 1,
      height: 1,
      onEnterEventName: "canary_state",
      onLeaveEventName: "canary_leave"
    }]
  };

  project = createProjectVariableInProject(project, { name: "canary.counter" });
  project = createProjectVariableInProject(project, { name: "canary.started" });
  project = createProjectVariableInProject(project, { name: "canary.left" });
  project = createEventInProject(project, {
    id: "event-canary-state",
    name: "canary_state",
    category: "Trigger"
  });
  project = addEventStepInProject(project, "event-canary-state", "add_variable canary.counter 1");
  project = addEventStepInProject(project, "event-canary-state", "set_flag canary.triggered true");
  project = bindEventToTargetInProject(project, "event-canary-state", {
    targetKind: "trigger",
    targetName: "State Witness",
    bindingKey: "onEnter"
  });
  project = createEventInProject(project, {
    id: "event-canary-leave",
    name: "canary_leave",
    category: "Trigger"
  });
  project = addEventStepInProject(project, "event-canary-leave", "set_variable canary.left 1");
  project = bindEventToTargetInProject(project, "event-canary-leave", {
    targetKind: "trigger",
    targetName: "State Witness",
    bindingKey: "onLeave"
  });
  project = createEventInProject(project, {
    id: "event-collision-lab-reset",
    name: "collision_lab_reset",
    category: "Cena"
  });
  project = addEventStepInProject(project, "event-collision-lab-reset", "change_scene room_2 4 10");
  project = bindEventToTargetInProject(project, "event-collision-lab-reset", {
    targetKind: "room",
    targetName: "room_2",
    bindingKey: "onInteract"
  });

  const bootSteps = [
    "set_variable canary.counter 1",
    "add_variable canary.counter 2",
    "set_flag canary.started true",
    "set_actor_direction NPC_Canary left",
    "set_actor_animation NPC_Canary idle_left",
    "set_actor_visible NPC_Canary true"
  ];
  for (const command of bootSteps) {
    project = addEventStepInProject(project, "event-room-boot", command);
  }

  return project;
}
