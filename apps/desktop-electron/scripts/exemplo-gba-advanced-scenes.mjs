import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const WIDTH = 30;
const HEIGHT = 20;
const CELL_COUNT = WIDTH * HEIGHT;
const ADVANCED_SCENE_NAMES = new Set([
  "scene_isometric",
  "scene_dungeon_crawler",
  "scene_racing"
]);

const LOW_COLOR_SCENE_PALETTE_IDS = new Map([
  ["scene_deeper_underground", "hidden-cave-vault"],
  ["scene_parallax_example", "alpine-parallax"],
  ["scene_player_s_house", "moonlit-bedroom"],
  ["scene_deep_space", "deep-space-indigo"],
  ["scene_space_battle", "shmup-starlight"]
]);

const LOW_COLOR_SCENE_PALETTE_FAMILIES = [
  {
    id: "hidden-cave-vault",
    name: "Abobada mineral",
    background: [15680, 20965, 7328, 17794, 12512, 12610, 12514, 15749, 17893, 10466, 5184, 15682, 7232, 10464, 10400, 15746],
    objects: [1167, 36, 2354, 203, 7501, 15135, 5624, 0, 5184, 25535, 16056]
  },
  {
    id: "alpine-parallax",
    name: "Cordilheira luminosa",
    background: [7297, 24406, 12775, 18752, 24166, 24268, 12512, 18784, 24371, 24200, 24199, 6273, 17728, 24372, 24373, 24167],
    objects: [1167, 36, 2354, 203, 7501, 15135, 5624, 0, 5184, 25535, 16056]
  },
  {
    id: "moonlit-bedroom",
    name: "Quarto ao luar",
    background: [5524, 4400, 4196, 5525, 5220, 4567, 14077, 6648, 9818, 4164, 2081, 5557, 3543, 3510, 3509, 4600],
    objects: [32494, 4128, 32660, 6046, 32765, 32738, 21792, 6973, 29152, 10765, 18688, 798, 831, 32715, 10368]
  },
  {
    id: "deep-space-indigo",
    name: "Espaco profundo indigo",
    background: [3104, 4128, 9313, 7235, 2048, 6210, 5153, 5152, 7233, 3072, 4129, 7234, 1024, 6209, 2080, 5185],
    objects: [4399, 9918, 7771, 6647, 11660, 6342, 7538, 9686, 8460, 8529, 19192, 24114, 22362, 20943, 10779]
  },
  {
    id: "shmup-starlight",
    name: "Luz estelar SHMUP",
    background: [3104, 2048, 2080, 3072, 14695, 3105, 12482, 5185, 7266, 7299, 4129, 1024, 3073, 4096, 4162, 5218],
    objects: [13084, 0, 4396, 9914, 6842, 23486, 5152, 8290, 11426, 18200, 17768, 30604, 29472, 3482, 16737]
  }
];

function cellIndex(x, y) {
  return (y * WIDTH) + x;
}

function borderedCollisions(extraSolid = []) {
  const solid = new Set(extraSolid.map(([x, y]) => cellIndex(x, y)));
  return Array.from({ length: CELL_COUNT }, (_, index) => {
    const x = index % WIDTH;
    const y = Math.floor(index / WIDTH);
    return x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1 || solid.has(index)
      ? "solid"
      : "free";
  });
}

function racingCollisions() {
  return Array.from({ length: CELL_COUNT }, (_, index) => {
    const x = index % WIDTH;
    const y = Math.floor(index / WIDTH);
    const leftEdge = y < 6 ? 7 - Math.floor(y / 2) : y > 14 ? 5 + Math.floor((y - 14) / 2) : 6;
    const rightEdge = y < 7 ? 21 : y > 13 ? 23 - Math.floor((y - 13) / 2) : 22;
    return x <= leftEdge || x >= rightEdge ? "solid" : "free";
  });
}

function asset(id, name, kind, source, provenance, metadata = {}) {
  return {
    id,
    name,
    kind,
    systemImage: kind === "Background" ? "photo" : "figure.walk",
    metadata: {
      source,
      bundledDefaultAsset: `template:exemplo-gba/${source}`,
      generatedBy: "gba-sprite-prep/production/exemplo-gba-advanced-scenes",
      placeholder: false,
      provenance,
      license: "Original project asset",
      ...metadata
    }
  };
}

function animation({ id, name, spriteSheet, frameWidth, frameHeight, sourceFrames, fps = 6, state = "idle", direction = "none" }) {
  return {
    id,
    name,
    spriteSheet,
    frameWidth,
    frameHeight,
    frameCount: sourceFrames.length,
    fps,
    loops: true,
    state,
    direction,
    colorMode: "4bpp",
    sourceColorMode: "4bpp",
    originX: 0,
    originY: 0,
    hitboxX: frameWidth > 16 ? -8 : 0,
    hitboxY: -8,
    hitboxWidth: 16,
    hitboxHeight: 16,
    frames: sourceFrames.map((sourceFrameIndex, frameIndex) => ({
      id: `${id}-frame-${frameIndex}`,
      frameIndex,
      sourceFrameIndex,
      width: frameWidth,
      height: frameHeight,
      originX: 0,
      originY: 0,
      tiles: [{
        id: `${id}-frame-${frameIndex}-tile-0`,
        sourceSheet: spriteSheet,
        sliceX: sourceFrameIndex * frameWidth,
        sliceY: 0,
        tileWidth: frameWidth,
        tileHeight: frameHeight,
        x: frameWidth > 16 ? -8 : 0,
        y: 0,
        paletteIndex: 0,
        objPalette: "OBP0",
        priority: false,
        flipX: false,
        flipY: false
      }]
    }))
  };
}

function baseScene({
  id,
  name,
  sceneType,
  backgroundAssetName,
  cameraMode,
  collisions,
  runtime,
  paletteFamilyID,
  useBackgroundLayout = false
}) {
  return {
    id,
    name,
    sceneType,
    width: WIDTH,
    height: HEIGHT,
    backgroundAssetName,
    gbStudioUseBackgroundLayout: useBackgroundLayout,
    backgroundRenderMode: "tilemap",
    cameraMode,
    cameraZoom: 100,
    cameraBounds: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    playerActorName: "Player",
    tilemap: Array(CELL_COUNT).fill(sceneType === "isometric" ? 1 : 0),
    collisions: [...collisions],
    collisionTypes: [...collisions],
    music: "",
    parallax: { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
    referenceImages: [],
    runtime,
    paletteFamilyID,
    eventBindings: { onInit: `${name}_on_enter` },
    onEnterEventName: `${name}_on_enter`
  };
}

function event(id, name, roomName, steps, category = "Cena") {
  return {
    id,
    name,
    roomName,
    category,
    detail: "Demonstracao funcional do template Exemplo GBA",
    command: "noop",
    steps: steps.map((command, index) => ({
      id: `${id}-step-${index}`,
      command,
      isEnabled: true
    }))
  };
}

function trigger(id, name, roomName, x, y, width, height, eventName) {
  return {
    id,
    name,
    roomName,
    x,
    y,
    width,
    height,
    eventName,
    onEnterEventName: eventName,
    eventBindings: { onEnter: eventName }
  };
}

function replaceNamed(values, replacements, nameKey = "name") {
  const replacementNames = new Set(replacements.map((value) => value[nameKey]));
  return [
    ...(Array.isArray(values) ? values : []).filter((value) => !replacementNames.has(value?.[nameKey])),
    ...replacements
  ];
}

function replaceIDs(values, replacements) {
  const ids = new Set(replacements.map((value) => value.id));
  return [
    ...(Array.isArray(values) ? values : []).filter((value) => !ids.has(value?.id)),
    ...replacements
  ];
}

export function promoteExemploGBAAdvancedScenes(data) {
  if ((data?.assets ?? []).some((asset) => asset?.metadata?.generatedBy === "canonical-scene-showcases-v1")) {
    return structuredClone(data);
  }
  const promoted = structuredClone(data);
  const isometricGroundTiles = Array.from({ length: CELL_COUNT }, (_, index) => {
    const x = index % WIDTH;
    const y = Math.floor(index / WIDTH);
    if ((x === 15 && y === 10) || (x === 17 && y === 10)) return 3;
    if ((x === 16 && y === 10) || (x === 18 && y === 10)) return 4;
    if (x >= 12 && x <= 22 && y >= 8 && y <= 12) return 37;
    if (x >= 22 && x <= 25 && y >= 5 && y <= 7) return 32;
    if ((y === 10 || y === 11) && x >= 5 && x <= 26) return 73;
    if ((x * 3 + y * 5) % 23 === 0) return 73;
    return 1;
  });
  const isometricRaisedTiles = new Map();
  const isometricHeights = new Map();
  for (let y = 9; y <= 11; y += 1) {
    for (let x = 13; x <= 20; x += 1) {
      const index = cellIndex(x, y);
      isometricRaisedTiles.set(index, (x + y) % 2 === 0 ? 7 : 8);
      isometricHeights.set(index, 1);
    }
  }
  isometricRaisedTiles.set(cellIndex(18, 10), 11);
  isometricHeights.set(cellIndex(18, 10), 3);
  isometricRaisedTiles.set(cellIndex(15, 10), 5);
  isometricHeights.set(cellIndex(15, 10), 4);
  isometricRaisedTiles.set(cellIndex(16, 10), 6);
  isometricHeights.set(cellIndex(16, 10), 3);
  isometricRaisedTiles.set(cellIndex(17, 10), 7);
  isometricHeights.set(cellIndex(17, 10), 2);
  const isometricCollisions = borderedCollisions([
    [11, 7], [12, 9], [17, 13], [14, 14], [9, 11], [10, 11],
    [16, 9], [15, 7], [16, 13], [22, 12]
  ]);
  isometricCollisions[cellIndex(15, 10)] = "slope_up_right";
  isometricCollisions[cellIndex(16, 10)] = "slope_up_left";
  isometricCollisions[cellIndex(17, 10)] = "slope_up_left";
  for (let y = 5; y <= 7; y += 1) {
    for (let x = 22; x <= 24; x += 1) isometricCollisions[cellIndex(x, y)] = "water";
  }
  const dungeonCollisions = borderedCollisions([
    [7, 5], [8, 5], [9, 5], [20, 5], [21, 5], [22, 5],
    [7, 12], [8, 12], [21, 12], [22, 12], [14, 8], [16, 8]
  ]);
  const raceCollisions = racingCollisions();

  const scenes = [
    {
      ...baseScene({
        id: "exemplo-scene-isometric",
        name: "scene_isometric",
        sceneType: "isometric",
        backgroundAssetName: "isometric-sandbox-sheet.png",
        cameraMode: "follow_player",
        collisions: isometricCollisions,
        paletteFamilyID: "isometric-meadow",
        runtime: { type: "isometric", config: { tileWidth: 32, tileHeight: 16, heightStep: 8, originX: 120, originY: 24 } }
      }),
      cameraBounds: { x: 3, y: 1, width: 26, height: 18 },
      cameraZoom: 110,
      tileLayers: [
        { mapping: "BG2", tilemap: isometricGroundTiles },
        { mapping: "BG1", tilemap: Array.from({ length: CELL_COUNT }, (_, index) => isometricRaisedTiles.get(index) ?? -1) }
      ],
      heightLevels: Array.from({ length: CELL_COUNT }, (_, index) => isometricHeights.get(index) ?? 0)
    },
    baseScene({
      id: "exemplo-scene-dungeon-crawler",
      name: "scene_dungeon_crawler",
      sceneType: "dungeonCrawler",
      backgroundAssetName: "dungeon-crawler-gba.png",
      cameraMode: "fixed_center",
      collisions: dungeonCollisions,
      paletteFamilyID: "dungeon-torchlight",
      useBackgroundLayout: true,
      runtime: { type: "dungeonCrawler", config: { stepDurationMs: 180, turnDurationMs: 120, allowBackstep: true, viewDistance: 5 } }
    }),
    baseScene({
      id: "exemplo-scene-racing",
      name: "scene_racing",
      sceneType: "racing",
      backgroundAssetName: "racing-track-gba.png",
      cameraMode: "follow_player",
      collisions: raceCollisions,
      useBackgroundLayout: true,
      runtime: { type: "racing", config: { maxSpeed: 4, acceleration: 8, brakePower: 12, steeringSpeed: 2 } }
    })
  ];

  promoted.scenas = [
    ...(Array.isArray(promoted.scenas) ? promoted.scenas : []).filter((scene) => !ADVANCED_SCENE_NAMES.has(scene?.name)),
    ...scenes
  ].map((scene) => LOW_COLOR_SCENE_PALETTE_IDS.has(scene?.name)
    ? { ...scene, paletteFamilyID: LOW_COLOR_SCENE_PALETTE_IDS.get(scene.name) }
    : scene);
  promoted.rooms = [
    ...(Array.isArray(promoted.rooms) ? promoted.rooms : []).filter((scene) => !ADVANCED_SCENE_NAMES.has(scene?.name)),
    ...structuredClone(scenes)
  ].map((scene) => LOW_COLOR_SCENE_PALETTE_IDS.has(scene?.name)
    ? { ...scene, paletteFamilyID: LOW_COLOR_SCENE_PALETTE_IDS.get(scene.name) }
    : scene);

  const assets = [
    asset(
      "exemplo-asset-isometric-tiles",
      "isometric-sandbox-sheet.png",
      "Tileset",
      "Assets/tilesets/isometric-sandbox-sheet.png",
      "GBA Studio bundled isometric sandbox",
      { tileWidth: 32, tileHeight: 16 }
    ),
    asset("exemplo-asset-isometric-actor", "actor_isometric.png", "Sprite", "Assets/sprites/actor_isometric.png", "GBA Studio bundled isometric actor"),
    asset("exemplo-asset-isometric-tree", "tree_isometric.png", "Sprite", "Assets/sprites/tree_isometric.png", "GBA Studio bundled isometric scenery"),
    asset("exemplo-asset-isometric-chest", "chest-isometric-gba-32x32.png", "Sprite", "Assets/sprites/chest-isometric-gba-32x32.png", "OpenAI ImageGen source prepared by gba-sprite-prep"),
    asset("exemplo-asset-isometric-rock", "rock-isometric-gba-32x32.png", "Sprite", "Assets/sprites/rock-isometric-gba-32x32.png", "OpenAI ImageGen source prepared by gba-sprite-prep"),
    asset("exemplo-asset-isometric-signpost", "signpost-isometric-gba-32x32.png", "Sprite", "Assets/sprites/signpost-isometric-gba-32x32.png", "OpenAI ImageGen source prepared by gba-sprite-prep"),
    asset("exemplo-asset-isometric-barrel", "barrel-isometric-gba-32x32.png", "Sprite", "Assets/sprites/barrel-isometric-gba-32x32.png", "OpenAI ImageGen source prepared by gba-sprite-prep"),
    asset("exemplo-asset-isometric-brazier", "brazier-isometric-gba-32x32.png", "Sprite", "Assets/sprites/brazier-isometric-gba-32x32.png", "OpenAI ImageGen source prepared by gba-sprite-prep"),
    asset("exemplo-asset-dungeon-background", "dungeon-crawler-gba.png", "Background", "Assets/backgrounds/dungeon-crawler-gba.png", "OpenAI ImageGen source prepared for RGB555"),
    asset("exemplo-asset-dungeon-player", "dungeon-player-gba-32x32.png", "Sprite", "Assets/sprites/dungeon-player-gba-32x32.png", "OpenAI ImageGen source prepared by gba-sprite-prep"),
    asset("exemplo-asset-dungeon-watcher", "dungeon-watcher-gba-32x32.png", "Sprite", "Assets/sprites/dungeon-watcher-gba-32x32.png", "Original deterministic GBA Studio pixel art"),
    asset("exemplo-asset-racing-background", "racing-track-gba.png", "Background", "Assets/backgrounds/racing-track-gba.png", "OpenAI ImageGen source prepared for RGB555"),
    asset("exemplo-asset-race-car", "race-car-gba-16x32.png", "Sprite", "Assets/sprites/race-car-gba-16x32.png", "Original deterministic GBA Studio pixel art")
  ];
  promoted.assets = replaceNamed(promoted.assets, assets);

  const isoDirections = ["down-left", "down-right", "up-left", "up-right"];
  const animations = [
    ...isoDirections.flatMap((direction, index) => [
      animation({ id: `exemplo-iso-idle-${index}`, name: `idle_${direction.replace("-", "_")}`, spriteSheet: "actor_isometric.png", frameWidth: 32, frameHeight: 32, sourceFrames: [index * 3], direction }),
      animation({ id: `exemplo-iso-walk-${index}`, name: `walk_${direction.replace("-", "_")}`, spriteSheet: "actor_isometric.png", frameWidth: 32, frameHeight: 32, sourceFrames: [index * 3 + 1, index * 3 + 2], fps: 8, state: "walk", direction })
    ]),
    animation({ id: "exemplo-iso-tree-idle", name: "tree_idle", spriteSheet: "tree_isometric.png", frameWidth: 32, frameHeight: 32, sourceFrames: [0], fps: 1 }),
    animation({ id: "exemplo-iso-chest-idle", name: "isometric_chest_idle", spriteSheet: "chest-isometric-gba-32x32.png", frameWidth: 32, frameHeight: 32, sourceFrames: [0], fps: 1 }),
    animation({ id: "exemplo-iso-rock-idle", name: "isometric_rock_idle", spriteSheet: "rock-isometric-gba-32x32.png", frameWidth: 32, frameHeight: 32, sourceFrames: [0], fps: 1 }),
    animation({ id: "exemplo-iso-signpost-idle", name: "isometric_signpost_idle", spriteSheet: "signpost-isometric-gba-32x32.png", frameWidth: 32, frameHeight: 32, sourceFrames: [0], fps: 1 }),
    animation({ id: "exemplo-iso-barrel-idle", name: "isometric_barrel_idle", spriteSheet: "barrel-isometric-gba-32x32.png", frameWidth: 32, frameHeight: 32, sourceFrames: [0], fps: 1 }),
    animation({ id: "exemplo-iso-brazier-idle", name: "isometric_brazier_idle", spriteSheet: "brazier-isometric-gba-32x32.png", frameWidth: 32, frameHeight: 32, sourceFrames: [0], fps: 1 }),
    animation({ id: "exemplo-dungeon-player-idle", name: "dungeon_player_idle", spriteSheet: "dungeon-player-gba-32x32.png", frameWidth: 32, frameHeight: 32, sourceFrames: [0, 2], fps: 3 }),
    animation({ id: "exemplo-dungeon-player-walk", name: "dungeon_player_walk", spriteSheet: "dungeon-player-gba-32x32.png", frameWidth: 32, frameHeight: 32, sourceFrames: [1, 3], fps: 8, state: "walk", direction: "up" }),
    animation({ id: "exemplo-dungeon-watcher-idle", name: "watcher_idle", spriteSheet: "dungeon-watcher-gba-32x32.png", frameWidth: 32, frameHeight: 32, sourceFrames: [0, 1], fps: 2 }),
    animation({ id: "exemplo-race-car-idle", name: "car_idle", spriteSheet: "race-car-gba-16x32.png", frameWidth: 16, frameHeight: 32, sourceFrames: [0], fps: 1 }),
    animation({ id: "exemplo-race-car-drive", name: "car_drive", spriteSheet: "race-car-gba-16x32.png", frameWidth: 16, frameHeight: 32, sourceFrames: [1, 2], fps: 10, state: "walk", direction: "up" })
  ];
  promoted.animations = replaceIDs(promoted.animations, animations);

  const animationStates = [
    {
      id: "exemplo-state-isometric-player",
      name: "default",
      spriteSheet: "actor_isometric.png",
      animationType: "four_direction",
      mirrorLeftFromRight: false,
      animationIDs: animations.filter((value) => value.spriteSheet === "actor_isometric.png").map((value) => value.id)
    },
    { id: "exemplo-state-isometric-tree", name: "default", spriteSheet: "tree_isometric.png", animationType: "fixed", mirrorLeftFromRight: false, animationIDs: ["exemplo-iso-tree-idle"] },
    { id: "exemplo-state-isometric-chest", name: "default", spriteSheet: "chest-isometric-gba-32x32.png", animationType: "fixed", mirrorLeftFromRight: false, animationIDs: ["exemplo-iso-chest-idle"] },
    { id: "exemplo-state-isometric-rock", name: "default", spriteSheet: "rock-isometric-gba-32x32.png", animationType: "fixed", mirrorLeftFromRight: false, animationIDs: ["exemplo-iso-rock-idle"] },
    { id: "exemplo-state-isometric-signpost", name: "default", spriteSheet: "signpost-isometric-gba-32x32.png", animationType: "fixed", mirrorLeftFromRight: false, animationIDs: ["exemplo-iso-signpost-idle"] },
    { id: "exemplo-state-isometric-barrel", name: "default", spriteSheet: "barrel-isometric-gba-32x32.png", animationType: "fixed", mirrorLeftFromRight: false, animationIDs: ["exemplo-iso-barrel-idle"] },
    { id: "exemplo-state-isometric-brazier", name: "default", spriteSheet: "brazier-isometric-gba-32x32.png", animationType: "fixed", mirrorLeftFromRight: false, animationIDs: ["exemplo-iso-brazier-idle"] },
    { id: "exemplo-state-dungeon-player", name: "default", spriteSheet: "dungeon-player-gba-32x32.png", animationType: "fixed", mirrorLeftFromRight: false, animationIDs: ["exemplo-dungeon-player-idle", "exemplo-dungeon-player-walk"] },
    { id: "exemplo-state-dungeon-watcher", name: "default", spriteSheet: "dungeon-watcher-gba-32x32.png", animationType: "fixed", mirrorLeftFromRight: false, animationIDs: ["exemplo-dungeon-watcher-idle"] },
    { id: "exemplo-state-race-car", name: "default", spriteSheet: "race-car-gba-16x32.png", animationType: "fixed", mirrorLeftFromRight: false, animationIDs: ["exemplo-race-car-idle", "exemplo-race-car-drive"] }
  ];
  promoted.animationStates = replaceIDs(promoted.animationStates, animationStates);

  const actors = [
    { id: "exemplo-actor-isometric-player", name: "Player", roomName: "scene_isometric", x: 12, y: 10, z: 0, spriteSheet: "actor_isometric.png", animationStateID: "exemplo-state-isometric-player", animationName: "idle_down_left", eventBindings: {} },
    { id: "exemplo-actor-isometric-guide", name: "Arvore guia isometrica", roomName: "scene_isometric", x: 11, y: 7, z: 1, spriteSheet: "tree_isometric.png", animationStateID: "exemplo-state-isometric-tree", animationName: "tree_idle", eventName: "scene_isometric_guide_on_interact", eventBindings: { onInteract: "scene_isometric_guide_on_interact" } },
    { id: "exemplo-object-isometric-tree", name: "Arvore isometrica norte", roomName: "scene_isometric", x: 12, y: 9, z: 1, spriteSheet: "tree_isometric.png", animationStateID: "exemplo-state-isometric-tree", animationName: "tree_idle", eventBindings: {} },
    { id: "exemplo-object-isometric-tree-east", name: "Arvore isometrica leste", roomName: "scene_isometric", x: 17, y: 13, z: 1, spriteSheet: "tree_isometric.png", animationStateID: "exemplo-state-isometric-tree", animationName: "tree_idle", eventBindings: {} },
    { id: "exemplo-object-isometric-tree-south", name: "Arvore isometrica sul", roomName: "scene_isometric", x: 14, y: 14, z: 1, spriteSheet: "tree_isometric.png", animationStateID: "exemplo-state-isometric-tree", animationName: "tree_idle", eventBindings: {} },
    { id: "exemplo-object-isometric-rock", name: "Pedra do caminho isometrico", roomName: "scene_isometric", x: 10, y: 11, z: 0, spriteSheet: "rock-isometric-gba-32x32.png", animationStateID: "exemplo-state-isometric-rock", animationName: "isometric_rock_idle", eventBindings: {} },
    { id: "exemplo-object-isometric-signpost", name: "Placa do mirante isometrico", roomName: "scene_isometric", x: 16, y: 9, z: 0, spriteSheet: "signpost-isometric-gba-32x32.png", animationStateID: "exemplo-state-isometric-signpost", animationName: "isometric_signpost_idle", eventBindings: {} },
    { id: "exemplo-object-isometric-chest", name: "Bau do mirante isometrico", roomName: "scene_isometric", x: 15, y: 7, z: 1, spriteSheet: "chest-isometric-gba-32x32.png", animationStateID: "exemplo-state-isometric-chest", animationName: "isometric_chest_idle", eventBindings: {} },
    { id: "exemplo-object-isometric-barrel", name: "Barril do acampamento isometrico", roomName: "scene_isometric", x: 16, y: 13, z: 1, spriteSheet: "barrel-isometric-gba-32x32.png", animationStateID: "exemplo-state-isometric-barrel", animationName: "isometric_barrel_idle", eventBindings: {} },
    { id: "exemplo-object-isometric-brazier", name: "Braseiro do mirante isometrico", roomName: "scene_isometric", x: 22, y: 12, z: 1, spriteSheet: "brazier-isometric-gba-32x32.png", animationStateID: "exemplo-state-isometric-brazier", animationName: "isometric_brazier_idle", eventBindings: {} },
    { id: "exemplo-actor-dungeon-player", name: "Player", roomName: "scene_dungeon_crawler", x: 15, y: 16, z: 0, spriteSheet: "dungeon-player-gba-32x32.png", animationStateID: "exemplo-state-dungeon-player", animationName: "dungeon_player_idle", eventBindings: {} },
    { id: "exemplo-actor-dungeon-watcher", name: "Guardiao da masmorra", roomName: "scene_dungeon_crawler", x: 15, y: 7, z: 0, spriteSheet: "dungeon-watcher-gba-32x32.png", animationStateID: "exemplo-state-dungeon-watcher", animationName: "watcher_idle", eventName: "scene_dungeon_watcher_on_interact", eventBindings: { onInteract: "scene_dungeon_watcher_on_interact" } },
    { id: "exemplo-actor-racing-player", name: "Player", roomName: "scene_racing", x: 15, y: 16, z: 0, spriteSheet: "race-car-gba-16x32.png", animationStateID: "exemplo-state-race-car", animationName: "car_idle", eventBindings: {} },
    { id: "exemplo-actor-racing-rival", name: "Rival", roomName: "scene_racing", x: 12, y: 10, z: 0, spriteSheet: "race-car-gba-16x32.png", animationStateID: "exemplo-state-race-car", animationName: "car_drive", eventName: "scene_racing_rival_on_interact", eventBindings: { onInteract: "scene_racing_rival_on_interact" } }
  ];
  promoted.actors = replaceIDs(promoted.actors, actors);

  const triggers = [
    trigger("exemplo-trigger-advanced-entry", "portal_cenas_avancadas", "scene_sample_town", 28, 28, 2, 2, "trigger_advanced_entry_on_enter"),
    trigger("exemplo-trigger-isometric-exit", "saida_isometrica", "scene_isometric", 24, 15, 2, 2, "trigger_isometric_exit_on_enter"),
    trigger("exemplo-trigger-dungeon-exit", "saida_masmorra", "scene_dungeon_crawler", 14, 2, 2, 1, "trigger_dungeon_exit_on_enter"),
    trigger("exemplo-trigger-racing-exit", "linha_de_chegada", "scene_racing", 14, 2, 2, 1, "trigger_racing_exit_on_enter")
  ];
  promoted.triggers = replaceIDs(promoted.triggers, triggers);

  const events = [
    event("exemplo-event-isometric-enter", "scene_isometric_on_enter", "scene_isometric", ["play_music gba_into_the_woods", "set_variable advanced_mode 1"]),
    event("exemplo-event-isometric-guide", "scene_isometric_guide_on_interact", "scene_isometric", ["play_sfx gba_sfx_ui_confirm"], "Ator"),
    event("exemplo-event-dungeon-enter", "scene_dungeon_crawler_on_enter", "scene_dungeon_crawler", ["play_music gba_underground_cave", "set_variable advanced_mode 2"]),
    event("exemplo-event-dungeon-watcher", "scene_dungeon_watcher_on_interact", "scene_dungeon_crawler", ["play_sfx gba_sfx_alert"], "Ator"),
    event("exemplo-event-racing-enter", "scene_racing_on_enter", "scene_racing", ["play_music gba_speed_race", "set_variable advanced_mode 3"]),
    event("exemplo-event-racing-rival", "scene_racing_rival_on_interact", "scene_racing", ["play_sfx gba_sfx_impact"], "Ator"),
    event("exemplo-event-advanced-entry", "trigger_advanced_entry_on_enter", "scene_sample_town", ["play_sfx gba_sfx_portal", "change_scene scene_isometric 12 10 down"], "Gatilho"),
    event("exemplo-event-isometric-exit", "trigger_isometric_exit_on_enter", "scene_isometric", ["play_sfx gba_sfx_portal", "change_scene scene_dungeon_crawler 15 16 up"], "Gatilho"),
    event("exemplo-event-dungeon-exit", "trigger_dungeon_exit_on_enter", "scene_dungeon_crawler", ["play_sfx gba_sfx_portal", "change_scene scene_racing 15 16 up"], "Gatilho"),
    event("exemplo-event-racing-exit", "trigger_racing_exit_on_enter", "scene_racing", ["play_sfx gba_sfx_portal", "change_scene scene_sample_town 28 31 down"], "Gatilho")
  ];
  promoted.events = replaceIDs(promoted.events, events);

  const settings = promoted.settings && typeof promoted.settings === "object" ? promoted.settings : {};
  const sceneTypes = settings.sceneTypes && typeof settings.sceneTypes === "object" ? settings.sceneTypes : {};
  const enabled = sceneTypes.enabled && typeof sceneTypes.enabled === "object" ? sceneTypes.enabled : {};
  promoted.settings = {
    ...settings,
    sceneTypes: { ...sceneTypes, enabled: { ...enabled, isometric: true, dungeonCrawler: true, racing: true } },
    isometric: { ...(settings.isometric ?? {}), playerSprite: "actor_isometric.png", tileWidth: "32 px", tileHeight: "16 px", heightStep: "8 px", maxHeight: 7, walkSpeed: 1, behavior: "Continuo", movement: "4 direcoes projetadas", ramps: "1 nivel com rampa", depthSort: true },
    dungeonCrawler: { ...(settings.dungeonCrawler ?? {}), playerSprite: "dungeon-player-gba-32x32.png", stepDurationMs: 180, turnDurationMs: 120, allowBackstep: true, viewDistance: 5 },
    racing: { ...(settings.racing ?? {}), playerSprite: "race-car-gba-16x32.png", maxSpeed: 4, acceleration: 8, brakePower: 12, steeringSpeed: 2 }
  };

  promoted.paletteFamilies = replaceIDs(promoted.paletteFamilies, [
    ...LOW_COLOR_SCENE_PALETTE_FAMILIES,
    {
      id: "isometric-meadow",
      name: "Prado isometrico",
      background: [12868, 3525, 28359, 30472, 9611, 13003, 5356, 14897, 14194, 7443, 20117, 24345, 7609, 9820],
      objects: [2114, 5410, 3239, 3241, 10953, 17964, 4365, 11661, 3310, 4434, 5524, 26357, 4601, 6682, 9851, 12987]
    },
    {
      id: "dungeon-torchlight",
      name: "Masmorra a luz de tochas",
      background: [0, 10240, 10560, 21824, 10250, 330, 10570, 21834, 341, 10581, 21845, 10933, 22197, 351, 703, 1023],
      objects: [1056, 6242, 8419, 3205, 10533, 14664, 6410, 12715, 14829, 4367, 24177, 6580, 1371, 8827, 19325]
    }
  ]);

  const editorState = promoted.editorState && typeof promoted.editorState === "object" ? promoted.editorState : {};
  const existingConnections = (Array.isArray(editorState.scenaConnections) ? editorState.scenaConnections : [])
    .filter((connection) => !ADVANCED_SCENE_NAMES.has(connection?.from) && !ADVANCED_SCENE_NAMES.has(connection?.to));
  promoted.editorState = {
    ...editorState,
    scenaConnections: [
      ...existingConnections,
      { from: "scene_sample_town", to: "scene_isometric", exit: { x: 28, y: 28, width: 2, height: 2 }, entry: { x: 12, y: 10, width: 1, height: 1 } },
      { from: "scene_isometric", to: "scene_dungeon_crawler", exit: { x: 24, y: 15, width: 2, height: 2 }, entry: { x: 15, y: 16, width: 1, height: 1 } },
      { from: "scene_dungeon_crawler", to: "scene_racing", exit: { x: 14, y: 2, width: 2, height: 1 }, entry: { x: 15, y: 16, width: 1, height: 1 } },
      { from: "scene_racing", to: "scene_sample_town", exit: { x: 14, y: 2, width: 2, height: 1 }, entry: { x: 28, y: 31, width: 1, height: 1 } }
    ]
  };

  return promoted;
}

const invokedPath = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invokedPath) {
  const projectPath = process.argv[2];
  if (!projectPath) throw new Error("Uso: node exemplo-gba-advanced-scenes.mjs <projeto.gba-project>");
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  await writeFile(projectPath, `${JSON.stringify(promoteExemploGBAAdvancedScenes(project), null, 2)}\n`, "utf8");
}
