import { createBlankProjectData } from "./newProject.js";
import { createRoomInProject } from "./roomsWorkspace.js";
import type { GBAProjectData } from "./projectFile.js";
import { bundledTemplateSpriteAsset, horizontalTemplateSpriteAnimations } from "./templateSpriteAssets.js";

const SHMUP_PLAYER_SPRITE = "player_shmup.png";
const SHMUP_PROJECTILE_SPRITE = "projectile_shmup.png";
const SHMUP_ENEMY_SPRITE = "enemy_shmup.png";

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

/** Projeto shmup minimo para smoke/export nativo (GBA-015). */
export function buildFunctionalShmupProject(): GBAProjectData {
  let project = createBlankProjectData({
    name: "Electron Shmup Functional",
    exportFolder: "build/electron-shmup"
  });

  project = withSettings(project, {
    general: {
      gameTitle: "Shmup Demo",
      startScene: "wave_1",
      startSceneType: "shmup",
      exportFolder: "build/electron-shmup"
    },
    shmup: {
      playerSpeed: 2,
      scrollSpeed: 1,
      autoFire: true,
      fireRate: 8,
      shootButton: "A",
      defaultProjectile: "player_bullet",
      movementType: "Preso a tela",
      scrollDirection: "Direita",
      clampPlayerToScreen: true,
      playerSprite: SHMUP_PLAYER_SPRITE,
      projectileSprite: SHMUP_PROJECTILE_SPRITE,
      enemySprite: SHMUP_ENEMY_SPRITE
    },
    save: { saveType: "sram", slots: 1, autoSave: false },
    build: {
      romFileName: "shmup_demo.gba",
      exportFormat: "gba_rom",
      engineBackend: "gbastudio_engine",
      enginePackPath: "/opt/GBAStudioEnginePack"
    }
  });

  project = {
    ...project,
    assets: [
      ...(Array.isArray(project.assets) ? project.assets : []),
      bundledTemplateSpriteAsset("asset-default-projectile-shmup", SHMUP_PROJECTILE_SPRITE, "shmup-projectile"),
      bundledTemplateSpriteAsset("asset-default-enemy-shmup", SHMUP_ENEMY_SPRITE, "shmup-enemy")
    ],
    animations: [
      ...(Array.isArray(project.animations) ? project.animations : []),
      ...horizontalTemplateSpriteAnimations(SHMUP_PROJECTILE_SPRITE, 16, 8, [
        { name: "attack", state: "attack", direction: "none", fps: 8, loops: true, frameCount: 1 }
      ]),
      ...horizontalTemplateSpriteAnimations(SHMUP_ENEMY_SPRITE, 32, 32, [
        { name: "idle", state: "idle", direction: "none", fps: 8, loops: true, frameCount: 1 }
      ])
    ],
    actors: [{
      id: "actor-player",
      name: "Player",
      roomName: "wave_1",
      x: 7,
      y: 12,
      spriteSheet: SHMUP_PLAYER_SPRITE,
      animationName: "idle"
    }],
    scenas: []
  };

  project = createRoomInProject(project, {
    id: "room-wave-1",
    name: "wave_1",
    width: 30,
    height: 20,
    sceneType: "shmup"
  });

  return project;
}
