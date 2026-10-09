import { createBlankProjectData } from "./newProject.js";
import { createRoomInProject } from "./roomsWorkspace.js";
import type { GBAProjectData } from "./projectFile.js";

/** Projeto Battle RPG pequeno, mas completo, para autoria, export e ROM nativa. */
export function buildFunctionalBattleRpgProject(): GBAProjectData {
  let project = createBlankProjectData({
    name: "Electron Battle RPG Functional",
    exportFolder: "build/electron-battle-rpg"
  });

  project = {
    ...project,
    settings: {
      ...(project.settings as Record<string, unknown>),
      general: {
        gameTitle: "Battle RPG Demo",
        startScene: "forest_battle",
        startSceneType: "battleRpg",
        exportFolder: "build/electron-battle-rpg"
      },
      save: { saveType: "sram", slots: 1, autoSave: false },
      build: {
        romFileName: "battle_rpg_demo.gba",
        exportFormat: "gba_rom",
        engineBackend: "gbastudio_engine",
        enginePackPath: "/opt/GBAStudioEnginePack"
      }
    },
    actors: [{
      id: "battle-hero", name: "Hero", roomName: "forest_battle", x: 3, y: 6,
      battle: { side: "party", maxHp: 40, attack: 12, defense: 5, speed: 8, abilities: ["attack", "magic", "heal"] }
    }, {
      id: "battle-mage", name: "Mage", roomName: "forest_battle", x: 3, y: 10,
      battle: { side: "party", maxHp: 28, attack: 9, defense: 3, speed: 7, abilities: ["magic", "heal", "defend"] }
    }, {
      id: "battle-slime", name: "Slime", roomName: "forest_battle", x: 12, y: 6,
      battle: { side: "enemy", maxHp: 15, attack: 6, defense: 2, speed: 4, abilities: ["attack"] }
    }, {
      id: "battle-bat", name: "Bat", roomName: "forest_battle", x: 12, y: 10,
      battle: { side: "enemy", maxHp: 12, attack: 7, defense: 1, speed: 9, abilities: ["attack", "defend"] }
    }],
    scenas: []
  };

  project = createRoomInProject(project, {
    id: "room-forest-battle",
    name: "forest_battle",
    width: 16,
    height: 16,
    sceneType: "battleRpg"
  });

  const rooms = Array.isArray(project.scenas) ? project.scenas.map((room) => {
    if (!room || typeof room !== "object" || Array.isArray(room)) return room;
    if ((room as { name?: string }).name !== "forest_battle") return room;
    return {
      ...room,
      runtime: {
        type: "battleRpg",
        config: {
          maxPartySize: 4,
          maxEnemies: 2,
          turnDelayFrames: 18,
          escapeEnabled: true,
          experienceMultiplier: 1,
          typeEffectivenessEnabled: true,
          criticalHitEnabled: true,
          statusConditionsEnabled: true,
          abilitiesEnabled: true,
          showExperienceBar: true,
          showHealthBars: true,
          battleStyle: "single",
          weatherEffect: "none",
          rewardGold: 40,
          rewardExperience: 25
        }
      }
    };
  }) : [];

  return { ...project, scenas: rooms };
}
