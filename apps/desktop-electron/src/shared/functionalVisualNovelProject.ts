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

/** Projeto visual novel minimo para smoke/export nativo. */
export function buildFunctionalVisualNovelProject(): GBAProjectData {
  let project = createBlankProjectData({
    name: "Electron Visual Novel Functional",
    exportFolder: "build/electron-visual-novel"
  });

  project = withSettings(project, {
    general: {
      gameTitle: "Visual Novel Demo",
      startScene: "intro",
      startSceneType: "visualNovel",
      exportFolder: "build/electron-visual-novel"
    },
    save: { saveType: "sram", slots: 1, autoSave: false },
    build: {
      romFileName: "visual_novel_demo.gba",
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
      roomName: "intro",
      x: 8,
      y: 8
    }],
    events: [{
      id: "event-intro",
      name: "intro_boot",
      category: "Cena",
      steps: [{ command: "show_dialogue intro" }]
    }, {
      id: "event-choice-ok",
      name: "choice_ok",
      category: "Cena",
      steps: [{ command: "show_dialogue ending" }]
    }, {
      id: "event-choice-bind",
      name: "choice_bind",
      category: "Cena",
      steps: [{ command: "choice_event branch 0 choice_ok" }]
    }],
    dialogues: [{
      id: "dialogue-intro",
      key: "intro",
      character: "Narrator",
      text: "Visual novel export"
    }, {
      id: "dialogue-branch",
      key: "branch",
      character: "Narrator",
      text: "Escolha uma resposta.",
      choices: ["OK", "Fim"]
    }, {
      id: "dialogue-ending",
      key: "ending",
      character: "Narrator",
      text: "Cena final."
    }],
    scenas: []
  };

  project = createRoomInProject(project, {
    id: "room-intro",
    name: "intro",
    width: 16,
    height: 16,
    sceneType: "visualNovel"
  });

  project = createRoomInProject(project, {
    id: "room-choice",
    name: "choice",
    width: 16,
    height: 16,
    sceneType: "visualNovel"
  });

  const rooms = Array.isArray(project.scenas) ? [...project.scenas] : [];
  for (const room of rooms) {
    if (!room || typeof room !== "object") continue;
    const name = (room as { name?: string }).name;
    if (name === "intro") {
      Object.assign(room, { eventBindings: { onInit: "intro_boot" } });
    }
    if (name === "choice") {
      Object.assign(room, { eventBindings: { onInit: "choice_bind" } });
    }
  }

  return {
    ...project,
    scenas: rooms
  };
}
