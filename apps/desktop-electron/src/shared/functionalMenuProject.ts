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

/** Projeto menu minimo para smoke/export nativo. */
export function buildFunctionalMenuProject(): GBAProjectData {
  let project = createBlankProjectData({
    name: "Electron Menu Functional",
    exportFolder: "build/electron-menu"
  });

  project = withSettings(project, {
    general: {
      gameTitle: "Menu Demo",
      startScene: "logo",
      startSceneType: "menu",
      exportFolder: "build/electron-menu"
    },
    save: { saveType: "sram", slots: 1, autoSave: false },
    build: {
      romFileName: "menu_demo.gba",
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
      roomName: "title",
      x: 8,
      y: 8
    }],
    variables: [{ name: "player.name", valueType: "text", maxLength: 8 }],
    events: [{
      id: "event-start",
      name: "start_selected",
      category: "Cena",
      steps: [
        { command: "open_text_input player.name 8 latin_upper" },
        { command: "show_dialogue start_feedback" }
      ]
    }],
    dialogues: [{
      id: "dialogue-start",
      key: "start_feedback",
      character: "System",
      text: "Start selected"
    }],
    scenas: []
  };

  project = createRoomInProject(project, {
    id: "room-logo",
    name: "logo",
    width: 30,
    height: 20,
    sceneType: "menu",
    presetID: "logo"
  });

  project = createRoomInProject(project, {
    id: "room-title",
    name: "title",
    width: 30,
    height: 20,
    sceneType: "menu",
    presetID: "title"
  });

  project = createRoomInProject(project, {
    id: "room-options",
    name: "options",
    width: 30,
    height: 20,
    sceneType: "menu",
    presetID: "menu"
  });

  project = createRoomInProject(project, {
    id: "room-game",
    name: "game",
    width: 30,
    height: 20,
    sceneType: "topdown"
  });

  const rooms = Array.isArray(project.scenas) ? [...project.scenas] : [];
  for (const room of rooms) {
    if (!room || typeof room !== "object") continue;
    const scene = room as Record<string, unknown>;
    const name = scene.name;
    if (name === "logo") scene.runtime = { type: "menu", config: {
      screenType: "logo", title: "GBA Studio", autoAdvanceFrames: 90, allowSkip: true,
      nextScreenID: "room-title", items: []
    } };
    if (name === "title") scene.runtime = { type: "menu", config: {
      screenType: "title", role: "new_game", title: "Sample Game", autoAdvanceFrames: 0, allowSkip: true, nextScreenID: "",
      textInput: { variableName: "player.name", maxLength: 8, x: 10, y: 8, width: 8 },
      items: [
        { id: "start", label: "Press Start", action: "open_screen", targetScreenID: "room-game", eventName: "start_selected", clickBox: { x: 72, y: 104, width: 96, height: 24 } },
        { id: "options", label: "Options", action: "push_screen", targetScreenID: "room-options", clickBox: { x: 72, y: 132, width: 96, height: 20 } }
      ]
    } };
    if (name === "options") scene.runtime = { type: "menu", config: {
      screenType: "menu", title: "Options", autoAdvanceFrames: 0, allowSkip: true, nextScreenID: "",
      items: [
        { id: "sound", label: "Sound", action: "toggle_variable", variableIndex: 1, minValue: 0, maxValue: 1, checkedValue: 1, clickBox: { x: 56, y: 56, width: 128, height: 24 } },
        { id: "back", label: "Back", action: "pop_screen", clickBox: { x: 72, y: 112, width: 96, height: 24 } }
      ]
    } };
  }

  return {
    ...project,
    scenas: rooms
  };
}
