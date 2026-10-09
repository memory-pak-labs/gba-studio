import { createBlankProjectData } from "./newProject.js";
import { createRoomInProject } from "./roomsWorkspace.js";
import type { GBAProjectData } from "./projectFile.js";
import { DEFAULT_ISOMETRIC_TILESET_NAME } from "./isometricDefaultTileset.js";

const ISOMETRIC_ACTOR_SPRITE = "actor_isometric.png";

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

/** Projeto isometric minimo para smoke/export de paridade nativa (GBA-014). */
export function buildFunctionalIsometricProject(): GBAProjectData {
  const roomWidth = 30;
  const roomHeight = 20;
  const cellCount = roomWidth * roomHeight;
  const cellIndex = (x: number, y: number): number => (y * roomWidth) + x;
  let project = createBlankProjectData({
    name: "Electron Isometric Functional",
    exportFolder: "build/electron-isometric"
  });

  project = withSettings(project, {
    general: {
      gameTitle: "Isometric Demo",
      startScene: "market",
      startSceneType: "isometric",
      exportFolder: "build/electron-isometric"
    },
    isometric: {
      tileWidth: "32 px",
      tileHeight: "16 px",
      heightStep: "8 px",
      maxHeight: 7,
      walkSpeed: 1,
      behavior: "Continuo",
      movement: "4 direcoes projetadas",
      ramps: "1 nivel com rampa"
    },
    save: { saveType: "sram", slots: 1, autoSave: false },
    build: {
      romFileName: "isometric_demo.gba",
      exportFormat: "gba_rom",
      engineBackend: "gbastudio_engine",
      enginePackPath: "/opt/GBAStudioEnginePack"
    }
  });

  project = {
    ...project,
    actors: [
      {
        id: "actor-player-market",
        name: "Player",
        roomName: "market",
        x: 2,
        y: 2,
        z: 0,
        spriteSheet: ISOMETRIC_ACTOR_SPRITE,
        animationStateID: "state-player-isometric",
        animationName: "idle_down_left"
      },
      {
        id: "actor-guide-market",
        name: "NPC Guia",
        roomName: "market",
        x: 4,
        y: 3,
        z: 0,
        spriteSheet: ISOMETRIC_ACTOR_SPRITE,
        animationStateID: "state-player-isometric",
        animationName: "idle_up_right"
      },
      {
        id: "object-reference-market",
        name: "Objeto de referência",
        roomName: "market",
        x: 5,
        y: 4,
        z: 0,
        spriteSheet: ISOMETRIC_ACTOR_SPRITE,
        animationStateID: "state-player-isometric",
        animationName: "idle_down_left"
      },
      {
        id: "actor-player-garden",
        name: "Player",
        roomName: "garden",
        x: 1,
        y: 1,
        z: 0,
        spriteSheet: ISOMETRIC_ACTOR_SPRITE,
        animationStateID: "state-player-isometric",
        animationName: "idle_down_right"
      }
    ],
    scenas: []
  };

  project = createRoomInProject(project, {
    id: "room-market",
    name: "market",
    width: roomWidth,
    height: roomHeight,
    sceneType: "isometric"
  });
  project = createRoomInProject(project, {
    id: "room-garden",
    name: "garden",
    width: roomWidth,
    height: roomHeight,
    sceneType: "isometric"
  });

  const rooms = Array.isArray(project.scenas) ? [...project.scenas] : [];
  const market = rooms.find((room) => room && typeof room === "object" && (room as { name?: string }).name === "market");
  if (market && typeof market === "object") {
    const groundTiles = Array.from({ length: cellCount }, () => 1);
    groundTiles[cellIndex(3, 2)] = 3;
    groundTiles[cellIndex(3, 3)] = 4;
    groundTiles[cellIndex(4, 3)] = 3;
    const foregroundTiles = Array.from({ length: cellCount }, (_, index) => index === cellIndex(4, 2) ? 7 : index === cellIndex(5, 2) ? 6 : -1);
    const collisionTypes = Array.from({ length: cellCount }, (_, index) => {
      if (index === cellIndex(3, 2) || index === cellIndex(4, 3)) return "slope_up_right";
      if (index === cellIndex(3, 3)) return "slope_up_left";
      if (index === cellIndex(5, 2)) return "solid";
      return "free";
    });
    const heightLevels = Array.from({ length: cellCount }, (_, index) => {
      if ([cellIndex(3, 2), cellIndex(4, 2), cellIndex(5, 2)].includes(index)) return 1;
      if (index === cellIndex(3, 3)) return 2;
      if (index === cellIndex(4, 3)) return 3;
      return 0;
    });
    Object.assign(market, {
      backgroundAssetName: DEFAULT_ISOMETRIC_TILESET_NAME,
      tilemap: groundTiles,
      collisionTypes,
      tileLayers: [
        { mapping: "BG2", tilemap: groundTiles },
        { mapping: "BG1", tilemap: foregroundTiles }
      ],
      heightLevels
    });
  }

  const garden = rooms.find((room) => room && typeof room === "object" && (room as { name?: string }).name === "garden");
  if (garden && typeof garden === "object") {
    const groundTiles = Array.from({ length: cellCount }, () => 1);
    Object.assign(garden, {
      backgroundAssetName: DEFAULT_ISOMETRIC_TILESET_NAME,
      tilemap: groundTiles,
      collisionTypes: Array.from({ length: cellCount }, (_, index) => index === cellIndex(2, 2) ? "solid" : "free"),
      tileLayers: [
        { mapping: "BG2", tilemap: groundTiles },
        { mapping: "BG1", tilemap: Array.from({ length: cellCount }, (_, index) => index === cellIndex(2, 2) ? 7 : -1) }
      ],
      heightLevels: Array.from({ length: cellCount }, () => 0)
    });
  }

  return {
    ...project,
    scenas: rooms,
    editorState: {
      ...(project.editorState ?? {}),
      activeScenaID: "room-market",
      activeScenaName: "market",
      startScenaID: "room-market",
      scenaConnections: [
        {
          from: "market",
          to: "garden",
          exit: { x: 6, y: 6, width: 1, height: 1 },
          entry: { x: 1, y: 1, width: 1, height: 1 }
        },
        {
          from: "garden",
          to: "market",
          exit: { x: 0, y: 0, width: 1, height: 1 },
          entry: { x: 5, y: 5, width: 1, height: 1 }
        }
      ]
    }
  };
}
