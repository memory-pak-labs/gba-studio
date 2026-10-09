import { copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const templateURL = new URL(
  "../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
  import.meta.url
);
const topdownPlayerSourceURL = new URL(
  "../../../tools/gba-sprite-prep/production/cohesive-lighthouse-adventure-v2/template-variants/sprites/canonical-topdown-actor-gba.png",
  import.meta.url
);
const platformerPlayerSourceURL = new URL(
  "../../../tools/gba-sprite-prep/production/cohesive-lighthouse-adventure-v2/player-dimensions-v1/platformer/player-platformer-gba-16x32.png",
  import.meta.url
);
const templateTopdownPlayerURL = new URL(
  "../default-assets/templates/exemplo-gba/Assets/sprites/canonical-topdown-actor-gba.png",
  import.meta.url
);
const templatePlatformerPlayerURL = new URL(
  "../default-assets/templates/exemplo-gba/Assets/sprites/player-platformer-gba-16x32.png",
  import.meta.url
);

const TOPDOWN_PLAYER_SPRITE = "canonical-topdown-actor-gba.png";
const PLATFORMER_PLAYER_SPRITE = "player-platformer-gba-16x32.png";
const RETIRED_PLATFORMER_PLAYER_SPRITE = "player-platformer-gba-32x32.png";

export const COMPLETE_PROJECT_PLAYERS = {
  farol_prologo: "Lia · Prólogo",
  farol_titulo: "Cursor da jornada",
  farol_enseada: "Lia",
  farol_falesias: "Player",
  farol_oficina: "Cursor de Lia",
  farol_tempestade: "Planador de Lia",
  farol_guardiao_rele: "Lia · Mecânica",
  farol_memorias: "Retrato de Lia",
  farol_mapa_costa: "Planador no mapa",
  farol_patio: "Lia · Pátio",
  farol_subsolo: "Ferramenta de Lia",
  farol_corrida_final: "Carro de Lia"
};

export const COMPLETE_PROJECT_DEFAULT_PLAYER_SPRITES = {
  battleRpg: "canonical-battle-rpg-actor-gba.png",
  custom: "",
  cutscene: "canonical-cutscene-actor-gba.png",
  dungeonCrawler: "dungeon-player-gba-32x32.png",
  isometric: "canonical-isometric-actor-gba.png",
  menu: "canonical-menu-actor-gba.png",
  platformer: PLATFORMER_PLAYER_SPRITE,
  pointAndClick: "cursor-gba-16x16.png",
  racing: "canonical-racing-actor-gba.png",
  shmup: "canonical-shmup-actor-gba.png",
  topdown: TOPDOWN_PLAYER_SPRITE,
  visualNovel: "canonical-visual-novel-actor-gba.png",
  worldMap: "canonical-world-map-actor-gba.png"
};

const topdownPlayerAsset = {
  id: "canonical-sprite-8b2ab002a016c6c9",
  name: TOPDOWN_PLAYER_SPRITE,
  kind: "Sprite",
  metadata: {
    placeholder: false,
    source: `Assets/sprites/${TOPDOWN_PLAYER_SPRITE}`,
    bundledDefaultAsset: `template:exemplo-gba/Assets/sprites/${TOPDOWN_PLAYER_SPRITE}`,
    provenance: "Project-owned Lia artwork authored directly on a native 16x16 RGB555 grid",
    license: "Project-owned",
    generatedBy: "cohesive-lighthouse-adventure-v2/player-dimensions-v2",
    role: "player",
    profile: "topdown",
    colorMode: "4bpp",
    visualProfile: "cohesive-lighthouse-adventure-v2"
  }
};

const platformerPlayerAsset = {
  id: "asset-player-platformer-gba-16x32-png",
  name: PLATFORMER_PLAYER_SPRITE,
  kind: "Sprite",
  metadata: {
    placeholder: false,
    source: `Assets/sprites/${PLATFORMER_PLAYER_SPRITE}`,
    bundledDefaultAsset: `template:exemplo-gba/Assets/sprites/${PLATFORMER_PLAYER_SPRITE}`,
    provenance: "Project-owned Lia artwork adapted from 32x32 to native 16x32 RGB555 frames",
    license: "Project-owned",
    generatedBy: "cohesive-lighthouse-adventure-v2/player-dimensions-v1",
    role: "player",
    profile: "platformer",
    colorMode: "4bpp",
    visualProfile: "cohesive-lighthouse-adventure-v2"
  }
};

const topdownAnimationSpecs = [
  ["idle_down", "idle", "down", [0], false, 8],
  ["idle_up", "idle", "up", [1], false, 8],
  ["idle_right", "idle", "right", [2], false, 8],
  ["idle_left", "idle", "left", [2], true, 8],
  ["walk_down", "walk", "down", [0, 3], false, 10],
  ["walk_up", "walk", "up", [1, 4], false, 10],
  ["walk_right", "walk", "right", [2, 5], false, 10],
  ["walk_left", "walk", "left", [2, 5], true, 10]
];

const platformerAnimationSpecs = [
  ["idle_right", "idle", "right", [0], true, 8],
  ["run_right", "walk", "right", [1, 2, 3, 4], true, 12],
  ["jump_right", "jump", "right", [5], false, 8],
  ["fall_right", "fall", "right", [6], true, 8],
  ["wall_slide_right", "fall", "left", [7], true, 8],
  ["wall_jump_right", "jump", "left", [8], false, 8],
  ["dash_right", "attack", "right", [9], false, 12],
  ["glide_right", "attack", "left", [10], true, 8],
  ["hurt_right", "hurt", "right", [11], false, 6]
];

function playerAnimation({
  direction,
  flipX = false,
  fps,
  frameHeight,
  frameIndexes,
  frameWidth,
  hitboxHeight,
  hitboxWidth,
  hitboxX,
  hitboxY,
  id,
  loops,
  name,
  spriteSheet,
  state
}) {
  const frames = frameIndexes.map((sourceFrameIndex, frameIndex) => ({
    id: `${id}-frame-${frameIndex}`,
    frameIndex,
    sourceFrameIndex,
    width: frameWidth,
    height: frameHeight,
    originX: 0,
    originY: 0,
    tiles: [{
      id: `${id}-frame-${frameIndex}-tile-0`,
      x: 0,
      y: 0,
      sliceX: sourceFrameIndex * frameWidth,
      sliceY: 0,
      sourceSheet: spriteSheet,
      tileWidth: frameWidth,
      tileHeight: frameHeight,
      flipX,
      flipY: false,
      objPalette: "OBP0",
      paletteIndex: 0,
      priority: false
    }]
  }));
  return {
    id,
    name,
    spriteSheet,
    frameWidth,
    frameHeight,
    fps,
    loops,
    frameCount: frames.length,
    state,
    direction,
    colorMode: "4bpp",
    sourceColorMode: "4bpp",
    frames,
    originX: 0,
    originY: 0,
    hitboxX,
    hitboxY,
    hitboxWidth,
    hitboxHeight
  };
}

const topdownPlayerAnimations = topdownAnimationSpecs.map((
  [name, state, direction, frameIndexes, flipX, fps]
) => playerAnimation({
  id: `canonical-topdown-player-${name.replaceAll("_", "-")}`,
  name,
  spriteSheet: TOPDOWN_PLAYER_SPRITE,
  frameWidth: 16,
  frameHeight: 16,
  frameIndexes,
  state,
  direction,
  fps,
  loops: true,
  flipX,
  hitboxX: 0,
  hitboxY: 0,
  hitboxWidth: 16,
  hitboxHeight: 8
}));

const platformerPlayerAnimations = platformerAnimationSpecs.map((
  [name, state, direction, frameIndexes, loops, fps]
) => playerAnimation({
  id: `canonical-platformer-player-${name.replaceAll("_", "-")}`,
  name,
  spriteSheet: PLATFORMER_PLAYER_SPRITE,
  frameWidth: 16,
  frameHeight: 32,
  frameIndexes,
  state,
  direction,
  fps,
  loops,
  hitboxX: 0,
  hitboxY: -16,
  hitboxWidth: 16,
  hitboxHeight: 24
}));

const topdownPlayerState = {
  id: "canonical-topdown-player-state",
  name: "default",
  spriteSheet: TOPDOWN_PLAYER_SPRITE,
  animationType: "four_direction_movement",
  mirrorLeftFromRight: true,
  animationIDs: topdownPlayerAnimations.map((animation) => animation.id)
};

const platformerPlayerState = {
  id: "canonical-platformer-player-state",
  name: "default",
  spriteSheet: PLATFORMER_PLAYER_SPRITE,
  animationType: "platform_player",
  mirrorLeftFromRight: true,
  animationIDs: platformerPlayerAnimations.map((animation) => animation.id)
};

const cursorAsset = {
  id: "canonical-point-click-cursor-asset",
  name: "cursor-gba-16x16.png",
  kind: "Sprite",
  metadata: {
    placeholder: false,
    source: "Assets/sprites/cursor-gba-16x16.png",
    bundledDefaultAsset: "template:exemplo-gba/Assets/sprites/cursor-gba-16x16.png",
    provenance: "Original project asset prepared for RGB555 and GBA OBJ limits",
    license: "Original project asset",
    generatedBy: "cohesive-lighthouse-adventure-v2",
    role: "player-cursor",
    profile: "pointAndClick",
    colorMode: "4bpp",
    visualProfile: "cohesive-lighthouse-adventure-v2"
  }
};

const cursorAnimation = {
  id: "canonical-point-click-cursor-animation",
  name: "point-click-cursor",
  spriteSheet: "cursor-gba-16x16.png",
  frameWidth: 16,
  frameHeight: 16,
  fps: 8,
  loops: true,
  frameCount: 2,
  state: "idle",
  direction: "none",
  colorMode: "4bpp",
  frames: [0, 1].map((frameIndex) => ({
    id: `canonical-point-click-cursor-animation-frame-${frameIndex}`,
    frameIndex,
    sourceFrameIndex: frameIndex,
    width: 16,
    height: 16,
    originX: 0,
    originY: 0,
    tiles: [{
      id: `canonical-point-click-cursor-animation-frame-${frameIndex}-tile-0`,
      x: 0,
      y: 0,
      sliceX: frameIndex * 16,
      sliceY: 0,
      sourceSheet: "cursor-gba-16x16.png",
      tileWidth: 16,
      tileHeight: 16,
      flipX: false,
      flipY: false,
      objPalette: "OBP0",
      paletteIndex: 0,
      priority: false
    }]
  })),
  originX: 0,
  originY: 0,
  hitboxX: 0,
  hitboxY: 0,
  hitboxWidth: 16,
  hitboxHeight: 16,
  sourceColorMode: "4bpp"
};

const cursorAnimationState = {
  id: "canonical-point-click-cursor-state",
  name: "default",
  spriteSheet: "cursor-gba-16x16.png",
  animationType: "fixed",
  mirrorLeftFromRight: false,
  animationIDs: ["canonical-point-click-cursor-animation"]
};

const cursorActor = {
  id: "canonical-point-click-cursor-actor",
  name: "Cursor de Lia",
  roomName: "farol_oficina",
  spriteSheet: "cursor-gba-16x16.png",
  x: 8,
  y: 8,
  animationName: "point-click-cursor",
  animationStateID: "canonical-point-click-cursor-state",
  eventBindings: {}
};

function upsertByID(items, value) {
  const next = Array.isArray(items) ? [...items] : [];
  const index = next.findIndex((item) => item?.id === value.id);
  if (index >= 0) next[index] = value;
  else next.push(value);
  return next;
}

export function promoteCompleteProjectPlayers(project) {
  const settings = project?.settings && typeof project.settings === "object"
    ? project.settings
    : {};
  const general = settings.general && typeof settings.general === "object"
    ? settings.general
    : {};
  const pointAndClick = settings.pointAndClick && typeof settings.pointAndClick === "object"
    ? settings.pointAndClick
    : {};
  const topdown = settings.topdown && typeof settings.topdown === "object"
    ? settings.topdown
    : {};
  const platformer = settings.platformer && typeof settings.platformer === "object"
    ? settings.platformer
    : {};
  const sceneTypes = settings.sceneTypes && typeof settings.sceneTypes === "object"
    ? settings.sceneTypes
    : {};
  const actors = upsertByID(project.actors, cursorActor).map((actor) => {
    if (actor?.id === "canonical-actor-8b2ab002a016c6c9") {
      return {
        ...actor,
        spriteSheet: TOPDOWN_PLAYER_SPRITE,
        animationName: "idle_down",
        animationStateID: topdownPlayerState.id
      };
    }
    if (actor?.id === "platformer-advanced-player") {
      return {
        ...actor,
        spriteSheet: PLATFORMER_PLAYER_SPRITE,
        animationName: "idle_right",
        animationStateID: platformerPlayerState.id
      };
    }
    return actor;
  });
  const scenes = (Array.isArray(project.scenas) ? project.scenas : []).map((scene) => ({
    ...scene,
    playerActorName: COMPLETE_PROJECT_PLAYERS[scene.name] ?? scene.playerActorName
  }));
  const sceneByName = new Map(scenes.map((scene) => [scene.name, scene]));
  const playerActorByRoom = new Map(actors.flatMap((actor) => {
    const scene = sceneByName.get(actor.roomName);
    return scene?.playerActorName === actor.name ? [[actor.roomName, actor]] : [];
  }));
  const editorState = project?.editorState && typeof project.editorState === "object"
    ? project.editorState
    : {};

  return {
    ...project,
    settings: {
      ...settings,
      general: {
        ...general,
        startPlayer: COMPLETE_PROJECT_PLAYERS.farol_prologo
      },
      pointAndClick: {
        ...pointAndClick,
        cursor: "player",
        cursorImage: cursorAsset.name
      },
      topdown: {
        ...topdown,
        playerSprite: TOPDOWN_PLAYER_SPRITE
      },
      platformer: {
        ...platformer,
        playerSprite: PLATFORMER_PLAYER_SPRITE
      },
      sceneTypes: {
        ...sceneTypes,
        defaultPlayerSprites: COMPLETE_PROJECT_DEFAULT_PLAYER_SPRITES
      }
    },
    assets: [
      ...upsertByID(
        upsertByID(
          upsertByID(
            (Array.isArray(project.assets) ? project.assets : []).filter(
              (asset) => asset?.name !== RETIRED_PLATFORMER_PLAYER_SPRITE
            ),
            topdownPlayerAsset
          ),
          platformerPlayerAsset
        ),
        cursorAsset
      )
    ],
    animations: [
      ...(Array.isArray(project.animations) ? project.animations : []).filter((animation) => (
        animation?.spriteSheet !== TOPDOWN_PLAYER_SPRITE
        && animation?.spriteSheet !== RETIRED_PLATFORMER_PLAYER_SPRITE
        && animation?.spriteSheet !== PLATFORMER_PLAYER_SPRITE
        && animation?.id !== cursorAnimation.id
      )),
      ...topdownPlayerAnimations,
      ...platformerPlayerAnimations,
      cursorAnimation
    ],
    animationStates: [
      ...(Array.isArray(project.animationStates) ? project.animationStates : []).filter((state) => (
        state?.spriteSheet !== TOPDOWN_PLAYER_SPRITE
        && state?.spriteSheet !== RETIRED_PLATFORMER_PLAYER_SPRITE
        && state?.spriteSheet !== PLATFORMER_PLAYER_SPRITE
        && state?.id !== cursorAnimationState.id
      )),
      topdownPlayerState,
      platformerPlayerState,
      cursorAnimationState
    ],
    actors,
    rooms: (Array.isArray(project.rooms) ? project.rooms : []).map((scene) => ({
      ...scene,
      playerActorName: COMPLETE_PROJECT_PLAYERS[scene.name] ?? scene.playerActorName
    })),
    scenas: scenes,
    editorState: {
      ...editorState,
      scenaConnections: (
        Array.isArray(editorState.scenaConnections) ? editorState.scenaConnections : []
      ).map((connection) => {
        const playerActor = playerActorByRoom.get(connection.to);
        if (!playerActor) return connection;
        return {
          ...connection,
          entry: {
            ...connection.entry,
            x: playerActor.x,
            y: playerActor.y,
            width: 1,
            height: 1
          }
        };
      })
    }
  };
}

async function main() {
  const project = JSON.parse(await readFile(templateURL, "utf8"));
  const promoted = promoteCompleteProjectPlayers(project);
  const serialized = `${JSON.stringify(promoted, null, 2)}\n`;
  await Promise.all([
    writeFile(templateURL, serialized, "utf8"),
    copyFile(topdownPlayerSourceURL, templateTopdownPlayerURL),
    copyFile(platformerPlayerSourceURL, templatePlatformerPlayerURL)
  ]);
  process.stdout.write(`${JSON.stringify({
    scenes: promoted.scenas.length,
    players: promoted.scenas.map((scene) => ({
      scene: scene.name,
      player: scene.playerActorName
    })),
    pointClickCursor: promoted.settings.pointAndClick.cursorImage
  }, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
