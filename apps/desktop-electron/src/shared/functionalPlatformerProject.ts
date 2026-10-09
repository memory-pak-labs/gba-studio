import { createBlankProjectData } from "./newProject.js";
import { createRoomInProject } from "./roomsWorkspace.js";
import type { GBAProjectData } from "./projectFile.js";

const PLATFORMER_PLAYER_SPRITE = "player_platformer.png";

function withSettings(project: GBAProjectData, patch: Record<string, unknown>): GBAProjectData {
  const current = project.settings && typeof project.settings === "object"
    ? project.settings as Record<string, unknown>
    : {};
  return {
    ...project,
    settings: {
      ...current,
      ...patch
    }
  };
}

/** Projeto platformer minimo para smoke/export de paridade nativa (GBA-011). */
export function buildFunctionalPlatformerProject(): GBAProjectData {
  const roomWidth = 30;
  const roomHeight = 20;
  const floorRows = 2;
  let project = createBlankProjectData({
    name: "Electron Platformer Functional",
    exportFolder: "build/electron-platformer"
  });

  project = withSettings(project, {
    general: {
      gameTitle: "Platformer Demo",
      startScene: "stage_1",
      startSceneType: "platformer",
      exportFolder: "build/electron-platformer"
    },
    platformer: {
      walkSpeed: 1.5,
      gravity: 0.5,
      maxFallSpeed: 4,
      coyoteTime: 4,
      jumpBuffer: 5,
      ladders: true
    },
    save: { saveType: "sram", slots: 1, autoSave: false },
    build: {
      romFileName: "platformer_demo.gba",
      exportFormat: "gba_rom",
      engineBackend: "gbastudio_engine",
      enginePackPath: "/opt/GBAStudioEnginePack"
    }
  });

  project = {
    ...project,
    scenas: [],
    actors: [{
      id: "actor-player",
      name: "Player",
      roomName: "stage_1",
      x: 2,
      y: 10,
      spriteSheet: PLATFORMER_PLAYER_SPRITE,
      animationName: "idle_right"
    }]
  };

  project = createRoomInProject(project, {
    id: "room-stage-1",
    name: "stage_1",
    width: roomWidth,
    height: roomHeight,
    sceneType: "platformer"
  });

  const rooms = Array.isArray(project.scenas)
    ? project.scenas.filter((room): room is Record<string, unknown> => Boolean(room) && typeof room === "object")
    : [];
  return {
    ...project,
    scenas: rooms.map((room) => room.id === "room-stage-1"
      ? {
          ...room,
          cameraMode: "follow_player",
          collisionTypes: Array.from(
            { length: roomWidth * roomHeight },
            (_value, index) => index >= roomWidth * (roomHeight - floorRows) ? "solid" : "free"
          )
        }
      : room)
  };
}
