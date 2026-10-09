import { createBlankProjectData } from "./newProject.js";
import { createRoomInProject } from "./roomsWorkspace.js";
import type { GBAProjectData } from "./projectFile.js";

export function buildFunctionalLutaProject(): GBAProjectData {
  let project = createBlankProjectData({
    name: "Electron Luta Functional",
    exportFolder: "build/electron-luta"
  });

  project = {
    ...project,
    settings: {
      ...(project.settings as Record<string, unknown>),
      general: {
        gameTitle: "Luta Demo",
        startScene: "dojo_arena",
        startSceneType: "luta",
        exportFolder: "build/electron-luta"
      },
      save: { saveType: "sram", slots: 1, autoSave: false },
      build: {
        romFileName: "luta_demo.gba",
        exportFormat: "gba_rom",
        engineBackend: "gbastudio_engine",
        enginePackPath: "/opt/GBAStudioEnginePack"
      }
    },
    actors: [{
      id: "luta-ryu", name: "Ryu", roomName: "dojo_arena", x: 3, y: 6,
      battle: { side: "player1", maxHp: 100, attack: 14, defense: 10, speed: 12, weight: 70, guardPower: 48, throwRange: 16, superLevel: 2, abilities: ["attack", "special"] }
    }, {
      id: "luta-chun", name: "Chun-Li", roomName: "dojo_arena", x: 12, y: 6,
      battle: { side: "player2", maxHp: 95, attack: 13, defense: 9, speed: 13, weight: 65, guardPower: 48, throwRange: 16, superLevel: 1, abilities: ["attack", "special"] }
    }],
    scenas: []
  };

  project = createRoomInProject(project, {
    id: "room-dojo-arena",
    name: "dojo_arena",
    width: 40,
    height: 20,
    sceneType: "luta"
  });

  const rooms = Array.isArray(project.scenas) ? project.scenas.map((room) => {
    if (!room || typeof room !== "object" || Array.isArray(room)) return room;
    if ((room as { name?: string }).name !== "dojo_arena") return room;
    return {
      ...room,
      runtime: {
        type: "luta",
        config: {
          roundTime: 99,
          roundsToWin: 2,
          maxSuperGauge: 100,
          superGaugeGainOnHit: 8,
          superGaugeGainOnReceive: 4,
          guardPowerRecovery: 2,
          chipDamageEnabled: true,
          airBlockingEnabled: true,
          alphaCounterEnabled: true,
          throwEscapeWindow: 8,
          parryWindow: 4,
          hitstunDecay: 0.85,
          comboLimit: 60,
          vismCustomComboGauge: 100,
          defaultStyle: "a-ism",
          stageId: "dojo_arena",
          player1StartX: 80,
          player2StartX: 200
        }
      }
    };
  }) : [];

  return { ...project, scenas: rooms };
}
