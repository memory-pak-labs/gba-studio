import { createBlankProjectData } from "./newProject.js";
import { createRoomInProject } from "./roomsWorkspace.js";
import type { GBAProjectData } from "./projectFile.js";

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

/** Projeto point-and-click minimo para smoke/export nativo (GBA-015). */
export function buildFunctionalPointClickProject(): GBAProjectData {
  let project = createBlankProjectData({
    name: "Electron Point Click Functional",
    exportFolder: "build/electron-point-click"
  });

  project = withSettings(project, {
    general: {
      gameTitle: "Point Click Demo",
      startScene: "office",
      startSceneType: "pointAndClick",
      exportFolder: "build/electron-point-click"
    },
    pointAndClick: {
      cursorSpeed: 2,
      snapHotspots: true,
      interactButton: "A",
      cursor: "cursor",
      cursorImage: "cursor_point_click.png"
    },
    save: { saveType: "sram", slots: 1, autoSave: false },
    build: {
      romFileName: "point_click_demo.gba",
      exportFormat: "gba_rom",
      engineBackend: "gbastudio_engine",
      enginePackPath: "/opt/GBAStudioEnginePack"
    }
  });

  project = {
    ...project,
    actors: [{
      id: "actor-player",
      name: "Player",
      roomName: "office",
      x: 7,
      y: 5,
      spriteSheet: "actor_point_click.png",
      animationName: "point_click_actor_idle"
    }],
    triggers: [{
      id: "trigger-door",
      name: "Door",
      roomName: "office",
      x: 12,
      y: 4,
      width: 2,
      height: 3,
      eventBindings: { onEnter: "door_use" }
    }],
    events: [{
      id: "event-door",
      name: "door_use",
      category: "Cena",
      steps: [{ command: "show_dialogue intro" }]
    }],
    dialogues: [{
      id: "dialogue-intro",
      key: "intro",
      character: "Guide",
      text: "Point click export"
    }],
    scenas: []
  };

  project = createRoomInProject(project, {
    id: "room-office",
    name: "office",
    width: 20,
    height: 16,
    sceneType: "pointAndClick"
  });

  return project;
}
