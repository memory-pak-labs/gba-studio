import type { GBAProjectData } from "./projectFile.js";
import { projectSlug } from "./projectPaths.js";
import { normalizeSceneTypeId, SCENE_TYPE_OPTIONS } from "./sceneTypes.js";
import {
  defaultPlayerSpriteForSceneType,
  defaultSceneActorForRoom,
  defaultSceneActorPreset
} from "./sceneDefaultActors.js";
import { horizontalTemplateSpriteAnimations } from "./templateSpriteAssets.js";

export interface CreateBlankProjectOptions {
  name: string;
  exportFolder?: string;
  sceneType?: string;
  includeStarterContent?: boolean;
}

const INITIAL_ROOM_ID = "room-1";
const INITIAL_ROOM_NAME = "cena_1";
const INITIAL_ROOM_WIDTH = 30;
const INITIAL_ROOM_HEIGHT = 20;
const INITIAL_CELL_COUNT = INITIAL_ROOM_WIDTH * INITIAL_ROOM_HEIGHT;
const DEFAULT_TOPDOWN_PLAYER_SPRITE = "player_topdown_4dir.png";
const DEFAULT_PLATFORMER_PLAYER_SPRITE = "player_platformer.png";
const DEFAULT_SHMUP_PLAYER_SPRITE = "player_shmup.png";
const DEFAULT_ISOMETRIC_PLAYER_SPRITE = "actor_isometric.png";
const DEFAULT_POINT_CLICK_ACTOR_SPRITE = "actor_point_click.png";
const DEFAULT_RACING_PLAYER_SPRITE = "nara-racer.png";
const DEFAULT_LUTA_PLAYER_SPRITE = "nara-fighter.png";
const DEFAULT_POINT_CLICK_CURSOR_SPRITE = "cursor_point_click.png";
const DEFAULT_DIALOGUE_PORTRAIT_IMAGE = "portrait.png";
const DEFAULT_DIALOGUE_BOX_IMAGE = "dialogue_box.png";
const DEFAULT_DIALOGUE_SELECTOR_IMAGE = "dialogue_selector.png";
const DEFAULT_DIALOGUE_FONT_IMAGE = "gba-dialogue-font-v3.png";
const DEFAULT_VARIABLE_FONT_IMAGE = "gba-variable-font.png";
const DEFAULT_PLAYER_NAME = "Player";
const DEFAULT_PLAYER_ACTOR_ID = "actor-player";
const DEFAULT_SPRITE_FRAME_SIZE = 16;
const DEFAULT_TOPDOWN_PLAYER_HITBOX_HEIGHT = 8;
const DEFAULT_TOPDOWN_PLAYER_ORIGIN = 0;

function normalizedProjectName(name: string): string {
  const trimmedName = name.trim();
  return trimmedName.length > 0 ? trimmedName : "Novo projeto";
}

function romBaseName(name: string): string {
  return projectSlug(name);
}

function initialRoom(sceneType = "topdown", includeStarterContent = true): Record<string, unknown> {
  const normalizedSceneType = normalizeSceneTypeId(sceneType, "topdown");
  return {
    id: INITIAL_ROOM_ID,
    name: INITIAL_ROOM_NAME,
    width: INITIAL_ROOM_WIDTH,
    height: INITIAL_ROOM_HEIGHT,
    sceneType: normalizedSceneType,
    music: "",
    cameraMode: "fixed_center",
    cameraZoom: 100,
    cameraBounds: { x: 0, y: 0, width: INITIAL_ROOM_WIDTH, height: INITIAL_ROOM_HEIGHT },
    parallax: { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
    backgroundAssetName: "",
    backgroundRenderMode: "tilemap",
    ...(includeStarterContent && defaultSceneActorPreset(normalizedSceneType) ? { playerActorName: DEFAULT_PLAYER_NAME } : {}),
    tilemap: Array.from({ length: INITIAL_CELL_COUNT }, () => 0),
    collisions: Array.from({ length: INITIAL_CELL_COUNT }, () => "free"),
    collisionTypes: Array.from({ length: INITIAL_CELL_COUNT }, () => "free"),
    referenceImages: [],
    eventBindings: {}
  };
}

function defaultSpriteAsset(
  id: string,
  name: string,
  kind: string,
  bundledDefaultAsset: string,
  systemImage: string
): Record<string, unknown> {
  return {
    id,
    name,
    kind,
    systemImage,
    metadata: {
      source: `Assets/sprites/${name}`,
      bundledDefaultAsset
    }
  };
}

function defaultUiAsset(
  id: string,
  name: string,
  bundledDefaultAsset: string,
  systemImage: string
): Record<string, unknown> {
  return {
    id,
    name,
    kind: "UI",
    systemImage,
    metadata: {
      source: `Assets/ui/${name}`,
      bundledDefaultAsset
    }
  };
}

function defaultPortraitAsset(): Record<string, unknown> {
  return {
    id: "asset-default-dialogue-portrait",
    name: DEFAULT_DIALOGUE_PORTRAIT_IMAGE,
    kind: "Portrait",
    systemImage: "person.crop.square",
    metadata: {
      source: `Assets/portraits/${DEFAULT_DIALOGUE_PORTRAIT_IMAGE}`,
      bundledDefaultAsset: "dialogue-portrait"
    }
  };
}

function defaultFontAsset(
  id: string,
  name: string,
  variableWidth: boolean
): Record<string, unknown> {
  return {
    id,
    name,
    kind: "FONT",
    metadata: {
      source: `Assets/fonts/${name}`,
      bundledDefaultAsset: `template:exemplo-gba/Assets/fonts/${name}`,
      provenance: "Atlas GBA embarcado no projeto exemplo e preparado para o runtime de diálogos.",
      license: "Project-owned",
      gbaRole: "dialogue-font",
      width: 128,
      height: 112,
      colorCount: 2,
      glyphWidth: 8,
      glyphHeight: 8,
      variableWidth
    }
  };
}

function defaultMetaspriteFrame(
  spriteSheet: string,
  sliceX: number,
  flipX = false
): Record<string, unknown> {
  return {
    frameIndex: 0,
    width: DEFAULT_SPRITE_FRAME_SIZE,
    height: DEFAULT_SPRITE_FRAME_SIZE,
    originX: 8,
    originY: 8,
    tiles: [
      {
        x: 0,
        y: 0,
        sliceX,
        sliceY: 0,
        sourceSheet: spriteSheet,
        tileWidth: DEFAULT_SPRITE_FRAME_SIZE,
        tileHeight: DEFAULT_SPRITE_FRAME_SIZE,
        flipX,
        flipY: false,
        objPalette: "OBP0",
        paletteIndex: 0,
        priority: false
      }
    ]
  };
}

function defaultSpriteAnimation(
  id: string,
  name: string,
  spriteSheet: string,
  state: string,
  direction: string,
  sliceXs: number | number[],
  flipX = false
): Record<string, unknown> {
  const slices = Array.isArray(sliceXs) ? sliceXs : [sliceXs];
  return {
    id,
    name,
    spriteSheet,
    frameWidth: DEFAULT_SPRITE_FRAME_SIZE,
    frameHeight: DEFAULT_SPRITE_FRAME_SIZE,
    fps: 8,
    loops: true,
    frameCount: slices.length,
    state,
    direction,
    colorMode: "4bpp",
    frames: slices.map((sliceX) => defaultMetaspriteFrame(spriteSheet, sliceX, flipX))
  };
}

function defaultTopdownPlayerAnimation(
  id: string,
  name: string,
  state: string,
  direction: string,
  sliceXs: number | number[],
  flipX = false
): Record<string, unknown> {
  const animation = defaultSpriteAnimation(
    id,
    name,
    DEFAULT_TOPDOWN_PLAYER_SPRITE,
    state,
    direction,
    sliceXs,
    flipX
  );
  const frames = Array.isArray(animation.frames) ? animation.frames as Record<string, unknown>[] : [];

  return {
    ...animation,
    originX: DEFAULT_TOPDOWN_PLAYER_ORIGIN,
    originY: DEFAULT_TOPDOWN_PLAYER_ORIGIN,
    hitboxX: 0,
    hitboxY: 0,
    hitboxWidth: DEFAULT_SPRITE_FRAME_SIZE,
    hitboxHeight: DEFAULT_TOPDOWN_PLAYER_HITBOX_HEIGHT,
    frames: frames.map((frame) => ({
      ...frame,
      originX: DEFAULT_TOPDOWN_PLAYER_ORIGIN,
      originY: DEFAULT_TOPDOWN_PLAYER_ORIGIN
    }))
  };
}

function defaultPointClickActorAnimation(): Record<string, unknown> {
  const animation = defaultSpriteAnimation(
    "animation-player-point-click-idle",
    "point_click_actor_idle",
    DEFAULT_POINT_CLICK_ACTOR_SPRITE,
    "idle",
    "cursor",
    0
  );
  const frames = Array.isArray(animation.frames) ? animation.frames as Record<string, unknown>[] : [];

  return {
    ...animation,
    originX: DEFAULT_TOPDOWN_PLAYER_ORIGIN,
    originY: DEFAULT_TOPDOWN_PLAYER_ORIGIN,
    hitboxX: 0,
    hitboxY: 0,
    hitboxWidth: DEFAULT_SPRITE_FRAME_SIZE,
    hitboxHeight: DEFAULT_SPRITE_FRAME_SIZE,
    frames: frames.map((frame) => ({
      ...frame,
      originX: DEFAULT_TOPDOWN_PLAYER_ORIGIN,
      originY: DEFAULT_TOPDOWN_PLAYER_ORIGIN
    }))
  };
}

function defaultPlatformerAnimations(): Record<string, unknown>[] {
  // The approved sheet has six native 40x40 poses; compose legal OBJ sizes
  // without resizing the art or reading past the final pose.
  return horizontalTemplateSpriteAnimations(DEFAULT_PLATFORMER_PLAYER_SPRITE, 40, 40, [
    { name: "idle_right", state: "idle", direction: "right", fps: 8, loops: true, frameCount: 1, sourceFrameIndexes: [0] },
    { name: "walk_right", state: "walk", direction: "right", fps: 12, loops: true, frameCount: 2, sourceFrameIndexes: [1, 2] },
    { name: "jump_right", state: "jump", direction: "right", fps: 8, loops: false, frameCount: 1, sourceFrameIndexes: [3] },
    { name: "fall_right", state: "fall", direction: "right", fps: 8, loops: true, frameCount: 1, sourceFrameIndexes: [4] },
    { name: "attack_right", state: "attack", direction: "right", fps: 10, loops: false, frameCount: 1, sourceFrameIndexes: [0] },
    { name: "hurt_right", state: "hurt", direction: "right", fps: 6, loops: false, frameCount: 1, sourceFrameIndexes: [5] }
  ]).map((animation) => ({
    ...animation,
    frames: (animation.frames as Record<string, unknown>[]).map((frame) => {
      const source = (frame.tiles as Record<string, unknown>[])[0]!;
      return {
        ...frame,
        originX: -8,
        tiles: [[0, 0, 32, 32], [0, 32, 32, 8], [32, 0, 8, 32], [32, 32, 8, 8]].map(([x, y, width, height]) => ({
          ...source,
          x: x! - 12,
          y: 40 - y! - height!,
          sliceX: Number(source.sliceX) + x!,
          sliceY: y!,
          tileWidth: width!,
          tileHeight: height!
        }))
      };
    })
  }));
}

function defaultSpriteAnimations(): Record<string, unknown>[] {
  return [
    defaultTopdownPlayerAnimation("animation-player-idle-down", "idle_down", "idle", "down", 0),
    defaultTopdownPlayerAnimation("animation-player-idle-up", "idle_up", "idle", "up", 16),
    defaultTopdownPlayerAnimation("animation-player-idle-right", "idle_right", "idle", "right", 32),
    defaultTopdownPlayerAnimation("animation-player-idle-left", "idle_left", "idle", "left", 32, true),
    defaultTopdownPlayerAnimation("animation-player-walk-down", "walk_down", "walk", "down", [0, 48]),
    defaultTopdownPlayerAnimation("animation-player-walk-up", "walk_up", "walk", "up", [16, 64]),
    defaultTopdownPlayerAnimation("animation-player-walk-right", "walk_right", "walk", "right", [32, 80]),
    defaultTopdownPlayerAnimation("animation-player-walk-left", "walk_left", "walk", "left", [32, 80], true),
    defaultPointClickActorAnimation(),
    ...defaultPlatformerAnimations(),
    ...horizontalTemplateSpriteAnimations(DEFAULT_SHMUP_PLAYER_SPRITE, 32, 32, [
      { name: "idle", state: "idle", direction: "none", fps: 8, loops: true, frameCount: 1 }
    ]),
    ...horizontalTemplateSpriteAnimations(DEFAULT_ISOMETRIC_PLAYER_SPRITE, 32, 32, [
      { name: "idle_down_left", state: "idle", direction: "down-left", fps: 8, loops: true, frameCount: 1 },
      { name: "idle_down_right", state: "idle", direction: "down-right", fps: 8, loops: true, frameCount: 1 },
      { name: "idle_up_left", state: "idle", direction: "up-left", fps: 8, loops: true, frameCount: 1 },
      { name: "idle_up_right", state: "idle", direction: "up-right", fps: 8, loops: true, frameCount: 1 }
    ]),
    ...horizontalTemplateSpriteAnimations(DEFAULT_RACING_PLAYER_SPRITE, 32, 32, [
      { name: "idle", state: "idle", direction: "none", fps: 1, loops: true, frameCount: 1 },
      { name: "drive", state: "walk", direction: "none", fps: 10, loops: true, frameCount: 2 }
    ]),
    ...horizontalTemplateSpriteAnimations(DEFAULT_LUTA_PLAYER_SPRITE, 32, 64, [
      { name: "idle", state: "idle", direction: "right", fps: 8, loops: true, frameCount: 1, sourceFrameIndexes: [0] },
      { name: "walk", state: "walk", direction: "right", fps: 12, loops: true, frameCount: 1, sourceFrameIndexes: [1] },
      { name: "jump", state: "jump", direction: "right", fps: 10, loops: false, frameCount: 1, sourceFrameIndexes: [2] },
      { name: "fall", state: "fall", direction: "right", fps: 10, loops: true, frameCount: 1, sourceFrameIndexes: [3] },
      { name: "attack", state: "attack", direction: "right", fps: 12, loops: false, frameCount: 2, sourceFrameIndexes: [0, 4] },
      { name: "hurt", state: "hurt", direction: "right", fps: 10, loops: false, frameCount: 1, sourceFrameIndexes: [5] }
    ])
  ];
}

function defaultAnimationStates(): Record<string, unknown>[] {
  return [
    {
      id: "state-player-default",
      name: "default",
      spriteSheet: DEFAULT_TOPDOWN_PLAYER_SPRITE,
      animationType: "four_direction_movement",
      mirrorLeftFromRight: true,
      animationIDs: [
        "animation-player-idle-down",
        "animation-player-idle-up",
        "animation-player-idle-right",
        "animation-player-idle-left",
        "animation-player-walk-down",
        "animation-player-walk-up",
        "animation-player-walk-right",
        "animation-player-walk-left"
      ]
    },
    {
      id: "state-player-point-click",
      name: "point_click",
      spriteSheet: DEFAULT_POINT_CLICK_ACTOR_SPRITE,
      animationType: "fixed",
      mirrorLeftFromRight: false,
      animationIDs: ["animation-player-point-click-idle"]
    },
    {
      id: "state-player-platformer",
      name: "platformer",
      spriteSheet: DEFAULT_PLATFORMER_PLAYER_SPRITE,
      animationType: "platform_player",
      mirrorLeftFromRight: true,
      animationIDs: [
        "animation-player-platformer-idle-right",
        "animation-player-platformer-walk-right",
        "animation-player-platformer-jump-right",
        "animation-player-platformer-fall-right",
        "animation-player-platformer-attack-right",
        "animation-player-platformer-hurt-right"
      ]
    },
    {
      id: "state-player-shmup",
      name: "shmup",
      spriteSheet: DEFAULT_SHMUP_PLAYER_SPRITE,
      animationType: "fixed",
      mirrorLeftFromRight: false,
      animationIDs: ["animation-player-shmup-idle"]
    },
    {
      id: "state-player-isometric",
      name: "isometric",
      spriteSheet: DEFAULT_ISOMETRIC_PLAYER_SPRITE,
      animationType: "four_direction",
      mirrorLeftFromRight: false,
      animationIDs: [
        "animation-actor-isometric-idle-down-left",
        "animation-actor-isometric-idle-down-right",
        "animation-actor-isometric-idle-up-left",
        "animation-actor-isometric-idle-up-right"
      ]
    },
    {
      id: "state-player-racing",
      name: "racing",
      spriteSheet: DEFAULT_RACING_PLAYER_SPRITE,
      animationType: "fixed",
      mirrorLeftFromRight: false,
      animationIDs: [
        "animation-nara-racer-idle",
        "animation-nara-racer-drive"
      ]
    },
    {
      id: "state-player-luta",
      name: "luta",
      spriteSheet: DEFAULT_LUTA_PLAYER_SPRITE,
      animationType: "fixed",
      mirrorLeftFromRight: false,
      animationIDs: [
        "animation-nara-fighter-idle",
        "animation-nara-fighter-walk",
        "animation-nara-fighter-jump",
        "animation-nara-fighter-fall",
        "animation-nara-fighter-attack",
        "animation-nara-fighter-hurt"
      ]
    }
  ];
}

function defaultPlayerSpritesBySceneType(): Record<string, string> {
  return Object.fromEntries(SCENE_TYPE_OPTIONS.map((option) => [
    option.id,
    defaultPlayerSpriteForSceneType(option.id)
  ]));
}

function initialPlayerActor(sceneType: string): Record<string, unknown> | null {
  const room = initialRoom(sceneType);
  const preset = defaultSceneActorPreset(sceneType);
  const actor = defaultSceneActorForRoom({
    roomID: INITIAL_ROOM_ID,
    roomName: INITIAL_ROOM_NAME,
    sceneType,
    width: Number(room.width),
    height: Number(room.height)
  });
  if (!actor || !preset) return null;
  return { ...actor, id: DEFAULT_PLAYER_ACTOR_ID };
}

export function createBlankProjectData(options: CreateBlankProjectOptions): GBAProjectData {
  const name = normalizedProjectName(options.name);
  const sceneType = normalizeSceneTypeId(options.sceneType, "topdown");
  const includeStarterContent = options.includeStarterContent !== false;
  const room = initialRoom(sceneType, includeStarterContent);
  const initialActor = includeStarterContent ? initialPlayerActor(sceneType) : null;

  return {
    schemaVersion: 1,
    name,
    assets: includeStarterContent ? [
      defaultSpriteAsset("asset-default-player-topdown", DEFAULT_TOPDOWN_PLAYER_SPRITE, "Sprite", "topdown-player-4dir", "figure.walk"),
      defaultSpriteAsset("asset-default-player-platformer", DEFAULT_PLATFORMER_PLAYER_SPRITE, "Sprite", "platformer-player", "figure.run"),
      defaultSpriteAsset("asset-default-player-shmup", DEFAULT_SHMUP_PLAYER_SPRITE, "Sprite", "shmup-player", "airplane"),
      defaultSpriteAsset("asset-default-player-isometric", DEFAULT_ISOMETRIC_PLAYER_SPRITE, "Sprite", "isometric-actor", "diamond"),
      defaultSpriteAsset("asset-default-point-click-actor", DEFAULT_POINT_CLICK_ACTOR_SPRITE, "Sprite", "point-click-actor", "figure.stand"),
      defaultSpriteAsset(
        "asset-default-player-racing",
        DEFAULT_RACING_PLAYER_SPRITE,
        "Sprite",
        "template:exemplo-gba/Assets/sprites/nara-racer.png",
        "car"
      ),
      defaultSpriteAsset(
        "asset-default-player-luta",
        DEFAULT_LUTA_PLAYER_SPRITE,
        "Sprite",
        "template:exemplo-gba/Assets/sprites/nara-fighter.png",
        "figure.boxing"
      ),
      defaultSpriteAsset("asset-default-point-click-cursor", DEFAULT_POINT_CLICK_CURSOR_SPRITE, "Sprite", "point-click-cursor", "cursorarrow.click"),
      defaultPortraitAsset(),
      defaultUiAsset("asset-default-dialogue-box", DEFAULT_DIALOGUE_BOX_IMAGE, "dialogue-box", "rectangle"),
      defaultUiAsset("asset-default-dialogue-selector", DEFAULT_DIALOGUE_SELECTOR_IMAGE, "dialogue-selector", "cursorarrow"),
      defaultFontAsset("asset-default-dialogue-font", DEFAULT_DIALOGUE_FONT_IMAGE, false),
      defaultFontAsset("asset-default-variable-font", DEFAULT_VARIABLE_FONT_IMAGE, true)
    ] : [],
    assetGroups: includeStarterContent ? [
      {
        id: "asset-group-default-player",
        name: "Player padrao",
        assetIDs: [
          "asset-default-player-topdown",
          "asset-default-player-platformer",
          "asset-default-player-shmup",
          "asset-default-player-isometric",
          "asset-default-point-click-actor",
          "asset-default-player-racing",
          "asset-default-player-luta"
        ],
        children: []
      },
      {
        id: "asset-group-default-ui",
        name: "UI padrao",
        assetIDs: [
          "asset-default-point-click-cursor",
          "asset-default-dialogue-portrait",
          "asset-default-dialogue-box",
          "asset-default-dialogue-selector",
          "asset-default-dialogue-font",
          "asset-default-variable-font"
        ],
        children: []
      }
    ] : [],
    scenas: [room],
    rooms: [room],
    actors: initialActor ? [initialActor] : [],
    triggers: [],
    dialogues: [],
    animations: includeStarterContent ? defaultSpriteAnimations() : [],
    animationStates: includeStarterContent ? defaultAnimationStates() : [],
    spriteReferenceImages: [],
    events: [],
    audioItems: [],
    editorState: {
      activeScenaID: INITIAL_ROOM_ID,
      activeScenaName: INITIAL_ROOM_NAME,
      startScenaID: INITIAL_ROOM_ID,
      scenaConnections: [],
      eventGraphPositions: {}
    },
    settings: {
      general: {
        gameTitle: name,
        author: "GBA Studio User",
        version: "1.0.0",
        startScene: INITIAL_ROOM_NAME,
        startSceneType: sceneType,
        startPlayer: initialActor ? DEFAULT_PLAYER_NAME : "",
        defaultLanguage: "pt-BR",
        exportFolder: options.exportFolder?.trim() || "build"
      },
      build: {
        romFileName: `${romBaseName(name)}.gba`,
        gameCode: "GBS0",
        makerCode: "00",
        romVersion: 0,
        exportFormat: "gba_rom",
        engineBackend: "gbastudio_engine",
        enginePackPath: "GBAStudioEnginePack",
        toolchain: "devkitARM",
        generateDebugFiles: false,
        runEmulatorAfterBuild: false
      },
      hardware: {
        graphicsMode: "Mode 0 - Tilemaps",
        resolution: "240 x 160",
        tileSize: "8 px",
        spritesPerScene: 128,
        vramBudget: "96 KB",
        profile: "GBA padrao"
      },
      sprites: {
        defaultSize: "16x16",
        defaultPivot: "Centro inferior",
        spritesPerScene: 128,
        warnSpriteLimit: true,
        warnScanlineLimit: true,
        colorMode: "4bpp / 16 cores",
        palette: "auto",
        compression: "Sem compressao",
        showOamUsage: true
      },
      backgrounds: {
        tileSize: "8 px",
        defaultMapSize: "32x32",
        graphicsMode: "Mode 0 - Tilemaps",
        parallax: true,
        scrolling: true,
        collisionLayer: "collision",
        bg0: "ui",
        bg1: "foreground",
        bg2: "mainMap",
        bg3: "parallax",
        colorMode: "4bpp / 16 cores",
        mapCompression: "LZ77"
      },
      preview: {
        defaultMode: "quick_preview",
        scale: 3,
        runAfterBuild: false,
        showCollisions: false,
        showTriggers: false,
        showHitboxes: false,
        showGrid: false,
        showFps: false,
        showVariables: false,
        showEventLog: false,
        muteRoomAudio: false
      },
      audio: {
        audioEngine: "gbastudio_engine_audio",
        audioMode: "chiptune_pcm",
        defaultMusicFormat: "gba_studio_chiptune",
        sampleRate: 0,
        masterVolume: 100,
        musicVolume: 80,
        sfxVolume: 90,
        enablePsgChannels: true,
        enableDirectSoundA: true,
        enableDirectSoundB: true,
        keepMusicBetweenScenes: true
      },
      sceneTypes: {
        defaultSceneType: sceneType,
        defaultPlayerSprites: includeStarterContent ? defaultPlayerSpritesBySceneType() : {},
        enabled: Object.fromEntries(SCENE_TYPE_OPTIONS.map((option) => [
          option.id,
          ["topdown", "pointAndClick"].includes(option.id)
        ]))
      },
      topdown: {
        interactButton: "A",
        movementType: "4 direcoes",
        movementBehavior: "Tile",
        directionalAnimation: "4-way animation",
        gridSize: "16 px",
        allowDiagonal: false,
        walkSpeed: 1,
        mirrorLeftFromRight: true,
        playerSprite: includeStarterContent ? defaultPlayerSpriteForSceneType(sceneType) || DEFAULT_TOPDOWN_PLAYER_SPRITE : ""
      },
      pointAndClick: {
        font: includeStarterContent ? DEFAULT_VARIABLE_FONT_IMAGE : "",
        cursor: "player",
        cursorImage: includeStarterContent ? DEFAULT_POINT_CLICK_CURSOR_SPRITE : "",
        cursorSpeed: 1.5,
        snapHotspots: false,
        interactButton: "A",
        highlightInteractives: true,
        showObjectName: true,
        hotspotPadding: 4
      },
      uiDialogs: {
        boxImage: includeStarterContent ? DEFAULT_DIALOGUE_BOX_IMAGE : "",
        boxPosition: "Inferior",
        boxWidth: 224,
        boxHeight: 40,
        font: includeStarterContent ? DEFAULT_DIALOGUE_FONT_IMAGE : "",
        selectorImage: includeStarterContent ? DEFAULT_DIALOGUE_SELECTOR_IMAGE : "",
        showPortrait: true,
        portraitLayout: "inline",
        portraitPosition: "Esquerda",
        showCharacterName: true,
        nameLabelMode: "above",
        startMenuTitle: "Menu",
        startMenuShowInventory: false,
        startMenuShowMap: false,
        textSpeed: "Normal"
      },
      save: {
        saveType: "sram",
        slots: 3,
        autoSave: true,
        manualSave: true,
        resetSaveInDebug: false
      },
      runtimeCapabilities: {
        rtc: { enabled: false },
        link: { enabled: false }
      },
      debug: {
        developerMode: false,
        preserveTempFiles: false,
        exportReadableButanoProject: false,
        showCpuUsage: false,
        showVramUsage: false,
        showOamUsage: false,
        showPaletteUsage: false,
        showRomUsage: false,
        showRamUsage: false,
        enableEventLogs: false,
        enableAudioLogs: false,
        enableCollisionLogs: false
      }
    }
  };
}
