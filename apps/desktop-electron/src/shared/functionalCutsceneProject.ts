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

/** Projeto cutscene minimo para smoke/export nativo. */
export function buildFunctionalCutsceneProject(): GBAProjectData {
  let project = createBlankProjectData({
    name: "Electron Cutscene Functional",
    exportFolder: "build/electron-cutscene"
  });

  project = withSettings(project, {
    general: {
      gameTitle: "Cutscene Demo",
      startScene: "intro",
      startSceneType: "cutscene",
      exportFolder: "build/electron-cutscene"
    },
    save: { saveType: "sram", slots: 1, autoSave: false },
    build: {
      romFileName: "cutscene_demo.gba",
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
      steps: [
        { command: "show_dialogue line_a" },
        { command: "show_dialogue line_b" }
      ]
    }, {
      id: "event-end",
      name: "end_boot",
      category: "Cena",
      steps: [{ command: "show_dialogue line_end" }]
    }],
    dialogues: [{
      id: "dialogue-a",
      key: "line_a",
      character: "Narrator",
      text: "Cutscene export"
    }, {
      id: "dialogue-b",
      key: "line_b",
      character: "Narrator",
      text: "A cena avanca sozinha."
    }, {
      id: "dialogue-end",
      key: "line_end",
      character: "Narrator",
      text: "Fim."
    }],
    scenas: []
  };

  project = createRoomInProject(project, {
    id: "room-intro",
    name: "intro",
    width: 16,
    height: 16,
    sceneType: "cutscene"
  });

  project = createRoomInProject(project, {
    id: "room-end",
    name: "end",
    width: 16,
    height: 16,
    sceneType: "cutscene"
  });

  const rooms = Array.isArray(project.scenas) ? [...project.scenas] : [];
  for (const room of rooms) {
    if (!room || typeof room !== "object") continue;
    const name = (room as { name?: string }).name;
    if (name === "intro") {
      Object.assign(room, {
        eventBindings: { onInit: "intro_boot" },
        runtime: {
          type: "cutscene",
          config: {
            nextSceneIndex: 1,
            steps: [{
              id: "intro-line-a",
              dialogueKey: "line_a",
              eventName: "",
              durationFrames: 90,
              autoAdvance: true,
              skippable: false,
              waitForDialogue: true,
              onSkipEventName: "",
              targetSceneIndex: -1,
              branchVariable: -1,
              branchValue: 0,
              branchTargetSceneIndex: -1,
              branchTargetStepIndex: -1
            }, {
              id: "intro-line-b",
              dialogueKey: "line_b",
              eventName: "",
              durationFrames: 120,
              autoAdvance: true,
              skippable: true,
              waitForDialogue: true,
              onSkipEventName: "",
              targetSceneIndex: 1,
              branchVariable: -1,
              branchValue: 0,
              branchTargetSceneIndex: -1,
              branchTargetStepIndex: -1
            }]
          }
        }
      });
    }
    if (name === "end") {
      Object.assign(room, {
        eventBindings: { onInit: "end_boot" },
        runtime: {
          type: "cutscene",
          config: {
            steps: [{
              id: "end-line",
              dialogueKey: "line_end",
              eventName: "",
              durationFrames: 0,
              autoAdvance: false,
              skippable: true,
              waitForDialogue: true,
              onSkipEventName: "",
              targetSceneIndex: -1,
              branchVariable: -1,
              branchValue: 0,
              branchTargetSceneIndex: -1,
              branchTargetStepIndex: -1
            }]
          }
        }
      });
    }
  }

  return {
    ...project,
    scenas: rooms
  };
}
