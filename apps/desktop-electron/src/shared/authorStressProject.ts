import {
  applyAudioPatternPresetInProject,
  createAudioItemInProject
} from "./audioWorkspace.js";
import { buildFunctionalP0Project } from "./functionalP0Project.js";
import type { GBAProjectData } from "./projectFile.js";

export const AUTHOR_STRESS_ROOM_COUNT = 6;
export const AUTHOR_STRESS_ROOM_WIDTH = 64;
export const AUTHOR_STRESS_ROOM_HEIGHT = 48;
export const AUTHOR_STRESS_NPCS_PER_ROOM = 96;
export const AUTHOR_STRESS_BG_TILE_COUNT = 720;

const LARGE_TILESET = "tiles_topdown_sandbox.png";
const STRESS_AUDIO = [
  ["audio-stress-dawn", "stress_dawn.mod"],
  ["audio-stress-storm", "stress_storm.mod"],
  ["audio-stress-machinery", "stress_machinery.mod"],
  ["audio-stress-alarm", "stress_alarm.mod"],
  ["audio-stress-beacon", "stress_beacon.mod"]
] as const;

function roomName(index: number): string {
  return `observatorio_${String(index + 1).padStart(2, "0")}`;
}

function stressTilemap(seed: number): number[] {
  return Array.from({ length: AUTHOR_STRESS_ROOM_WIDTH * AUTHOR_STRESS_ROOM_HEIGHT }, (_item, index) => {
    const x = index % AUTHOR_STRESS_ROOM_WIDTH;
    const y = Math.floor(index / AUTHOR_STRESS_ROOM_WIDTH);
    if (x === 0 || y === 0 || x === AUTHOR_STRESS_ROOM_WIDTH - 1 || y === AUTHOR_STRESS_ROOM_HEIGHT - 1) {
      return 0;
    }
    return (x * 11 + y * 17 + seed * 29) % AUTHOR_STRESS_BG_TILE_COUNT;
  });
}

function stressCollision(): string[] {
  return Array.from({ length: AUTHOR_STRESS_ROOM_WIDTH * AUTHOR_STRESS_ROOM_HEIGHT }, (_item, index) => {
    const x = index % AUTHOR_STRESS_ROOM_WIDTH;
    const y = Math.floor(index / AUTHOR_STRESS_ROOM_WIDTH);
    return x === 0 || y === 0 || x === AUTHOR_STRESS_ROOM_WIDTH - 1 || y === AUTHOR_STRESS_ROOM_HEIGHT - 1
      ? "solid"
      : "free";
  });
}

function stressActors(): Record<string, unknown>[] {
  const actors: Record<string, unknown>[] = [{
    id: "actor-player",
    name: "Player",
    roomName: roomName(0),
    x: 4,
    y: 4,
    spriteSheet: "player_topdown_4dir.png",
    animationName: "idle_down"
  }];

  for (let roomIndex = 0; roomIndex < AUTHOR_STRESS_ROOM_COUNT; roomIndex += 1) {
    for (let npcIndex = 0; npcIndex < AUTHOR_STRESS_NPCS_PER_ROOM; npcIndex += 1) {
      actors.push({
        id: `actor-${roomIndex + 1}-${npcIndex + 1}`,
        name: `Sentinela ${roomIndex + 1}-${npcIndex + 1}`,
        roomName: roomName(roomIndex),
        x: 8 + (npcIndex % 16) * 3,
        y: 8 + Math.floor(npcIndex / 16) * 6,
        spriteSheet: "player_topdown_4dir.png",
        animationName: npcIndex % 2 === 0 ? "idle_left" : "idle_right"
      });
    }
  }
  return actors;
}

/** Projeto autoral para medir capacidade do editor e da ROM sem depender dos fixtures sintéticos da engine. */
export function buildAuthorStressProject(): GBAProjectData {
  let project = buildFunctionalP0Project();
  project = {
    ...project,
    assets: (Array.isArray(project.assets) ? project.assets : []).filter((asset) => (
      !(typeof asset === "object" && asset !== null && (asset as { name?: unknown }).name === "confirm.wav")
    )),
    audioItems: (Array.isArray(project.audioItems) ? project.audioItems : []).filter((audio) => (
      !(typeof audio === "object" && audio !== null && (audio as { name?: unknown }).name === "confirm.wav")
    ))
  };
  for (const [id, name] of STRESS_AUDIO) {
    project = createAudioItemInProject(project, { id, name, kind: "Musica" });
    project = applyAudioPatternPresetInProject(project, id);
  }

  const roomNames = Array.from({ length: AUTHOR_STRESS_ROOM_COUNT }, (_item, index) => roomName(index));
  const assets = Array.isArray(project.assets) ? project.assets : [];
  const hasLargeTileset = assets.some((asset) => (
    typeof asset === "object" && asset !== null && (asset as { name?: unknown }).name === LARGE_TILESET
  ));
  const assetsWithTileset = hasLargeTileset ? assets : [
    ...assets,
    {
      id: "asset-stress-large-tileset",
      name: LARGE_TILESET,
      kind: "Tileset",
      metadata: { source: `Assets/tiles/${LARGE_TILESET}`, tileWidth: 8, tileHeight: 8 }
    }
  ];
  const audioAssetNames = new Set(assetsWithTileset
    .filter((asset) => typeof asset === "object" && asset !== null)
    .map((asset) => (asset as { name?: unknown }).name)
    .filter((name): name is string => typeof name === "string"));
  const nextAssets = [
    ...assetsWithTileset,
    ...STRESS_AUDIO
      .filter(([, name]) => !audioAssetNames.has(name))
      .map(([id, name]) => ({ id: `asset-${id}`, name, kind: "Audio" }))
  ];

  return {
    ...project,
    name: "Observatório de Bruma — Stress",
    assets: nextAssets,
    scenas: roomNames.map((name, index) => ({
      id: `room-stress-${index + 1}`,
      name,
      width: AUTHOR_STRESS_ROOM_WIDTH,
      height: AUTHOR_STRESS_ROOM_HEIGHT,
      sceneType: "topdown",
      cameraMode: "follow_player",
      backgroundAssetName: LARGE_TILESET,
      music: STRESS_AUDIO[index % STRESS_AUDIO.length][1],
      tilemap: stressTilemap(index),
      collisionTypes: stressCollision(),
      eventBindings: { onInit: `stress_boot_${index + 1}` }
    })),
    actors: stressActors(),
    triggers: roomNames.map((name, index) => ({
      id: `trigger-stress-${index + 1}`,
      name: `Portal ${index + 1}`,
      roomName: name,
      x: AUTHOR_STRESS_ROOM_WIDTH - 3,
      y: AUTHOR_STRESS_ROOM_HEIGHT - 4,
      width: 2,
      height: 2,
      eventName: `stress_to_${(index + 1) % AUTHOR_STRESS_ROOM_COUNT + 1}`,
      onEnterEventName: `stress_to_${(index + 1) % AUTHOR_STRESS_ROOM_COUNT + 1}`
    })),
    events: roomNames.flatMap((name, index) => {
      const nextRoom = roomNames[(index + 1) % AUTHOR_STRESS_ROOM_COUNT];
      return [
        {
          id: `event-stress-boot-${index + 1}`,
          name: `stress_boot_${index + 1}`,
          category: "Cena",
          steps: [{ command: `play_music ${STRESS_AUDIO[index % STRESS_AUDIO.length][1]}` }]
        },
        {
          id: `event-stress-portal-${index + 1}`,
          name: `stress_to_${(index + 1) % AUTHOR_STRESS_ROOM_COUNT + 1}`,
          category: "Trigger",
          steps: [{ command: `change_scene ${nextRoom} 4 4` }]
        }
      ];
    }),
    editorState: {
      activeScenaID: "room-stress-1",
      activeScenaName: roomNames[0],
      startScenaID: "room-stress-1",
      scenaConnections: roomNames.map((name, index) => ({
        from: name,
        to: roomNames[(index + 1) % AUTHOR_STRESS_ROOM_COUNT],
        eventName: `stress_to_${(index + 1) % AUTHOR_STRESS_ROOM_COUNT + 1}`
      }))
    },
    settings: {
      ...(project.settings ?? {}),
      general: {
        ...((project.settings as { general?: Record<string, unknown> } | undefined)?.general ?? {}),
        gameTitle: "Observatório de Bruma — Stress",
        startScene: roomNames[0],
        startSceneType: "topdown"
      },
      build: {
        ...((project.settings as { build?: Record<string, unknown> } | undefined)?.build ?? {}),
        romFileName: "observatorio_de_bruma_stress.gba",
        engineBackend: "gbastudio_engine"
      }
    }
  };
}
