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

/** Projeto world map minimo para smoke/export nativo. */
export function buildFunctionalWorldMapProject(): GBAProjectData {
  let project = createBlankProjectData({
    name: "Electron World Map Functional",
    exportFolder: "build/electron-world-map"
  });

  project = withSettings(project, {
    general: {
      gameTitle: "World Map Demo",
      startScene: "start",
      startSceneType: "worldMap",
      exportFolder: "build/electron-world-map"
    },
    save: { saveType: "sram", slots: 1, autoSave: false },
    build: {
      romFileName: "world_map_demo.gba",
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
      roomName: "start",
      x: 4,
      y: 12
    }],
    events: [{
      id: "event-start",
      name: "start_select",
      category: "Cena",
      steps: [{ command: "show_dialogue map_title" }]
    }, {
      id: "event-forest",
      name: "forest_select",
      category: "Cena",
      steps: [{ command: "show_dialogue forest_line" }]
    }],
    dialogues: [{
      id: "dialogue-title",
      key: "map_title",
      character: "System",
      text: "World map export"
    }, {
      id: "dialogue-forest",
      key: "forest_line",
      character: "System",
      text: "Forest selected"
    }, {
      id: "dialogue-castle",
      key: "castle_line",
      character: "System",
      text: "Castle locked"
    }],
    editorState: {
      scenaConnections: [
        { from: "start", to: "forest", eventName: "start_select" },
        { from: "forest", to: "castle", eventName: "forest_select" },
        { from: "start", to: "castle" }
      ]
    },
    scenas: []
  };

  project = createRoomInProject(project, {
    id: "room-start",
    name: "start",
    width: 16,
    height: 16,
    sceneType: "worldMap"
  });

  project = createRoomInProject(project, {
    id: "room-forest",
    name: "forest",
    width: 16,
    height: 16,
    sceneType: "worldMap"
  });

  project = createRoomInProject(project, {
    id: "room-castle",
    name: "castle",
    width: 16,
    height: 16,
    sceneType: "worldMap"
  });

  const rooms = Array.isArray(project.scenas) ? [...project.scenas] : [];
  for (const room of rooms) {
    if (!room || typeof room !== "object") continue;
    const name = (room as { name?: string }).name;
    if (name === "start") {
      Object.assign(room, { eventBindings: { onInit: "start_select" } });
    }
    if (name === "forest") {
      Object.assign(room, { eventBindings: { onInit: "forest_select" } });
    }
    if (name === "castle") {
      Object.assign(room, {
        runtime: {
          type: "worldMap",
          config: { unlocked: false, hideWhenLocked: true, requiredVariable: 2, requiredValue: 1, targetLevel: 7 }
        }
      });
    }
  }

  return {
    ...project,
    scenas: rooms
  };
}
