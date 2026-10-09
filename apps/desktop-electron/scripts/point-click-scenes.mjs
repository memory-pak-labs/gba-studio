import approvedBackgrounds from "../fixtures/asset-provenance/runtime-metadata.json" with { type: "json" };

const POINT_CLICK_CANDIDATE_ROOT =
  "tools/gba-sprite-prep/production/exemplo-gba-point-and-click-v1-candidate";
const POINT_CLICK_NPC_V2_ROOT =
  "apps/desktop-electron/fixtures/asset-provenance/point-click";

const SOURCE_HASHES = Object.freeze({
  warehouseBackground: "8c603bed1b50feff42028fdf0b39cdecd7676163e1b2ae8669312a12fd224715",
  observatoryBackground: "e196f8947707e2886e558ff0cf2efe00b9bbfcad5dfad4df16d732a00e16acf2",
  characters: "37f9f503aa27622990c45eb778bcedda6089a70df61d9713f639882ec954956d",
  props: "0fc4f1b8d23866bdd736e20aab27873f366275e0ef706c7c9f42f2a4451fc2a5",
  cursor: "63345815673fcc200d74e095deab5762d1fcc1e691ee464b0f4cd423e8d88714"
});

const PREPARED_HASHES = Object.freeze({
  "armazem-das-mares-gba.png": "5bc96ac23111cd634e5048ac67605f8a9bffe2dd78c04f7c8c8f521f4d8c09d6",
  "observatorio-do-farol-gba.png": "8e9dc38d2dd772d2bcaa710a3684542e4ca8bcfbef83b878aaca2f3767276d0f",
  "point-click-cursor.png": "2128a2c31ae447549b1aa295215cfcfad4233e3af89c1ad91e478d98dfcac1f8",
  "point-click-brass-lantern.png": "26b7b69073d633592670e1ca2273e98603ff2aa8d8596bbeb0f9e31c7777483b",
  "point-click-chart-compass.png": "e573ce392ed3f0c8440c15ff28f390773383cacedca2b1f3443d4482c317e227",
  "point-click-dock-mechanic.png": "92affc7975e87a8392a85e50349eb4676bb84a92e4441ccc92775c88936df5f9",
  "point-click-keeper-lantern.png": "1f329d1a7e6ac111a171e186ebf813105eac8100bc062e370729bde93a357232",
  "point-click-lia-scroll.png": "5fd4d8fea4d5ecb1553502165f50a22b1207843bcbcb8c6f29483a3d59be2ee0",
  "point-click-red-chest.png": "d33ed1a05128bc7ec5ca18142ba65dfdb551cc228e7ba02b7f0dc257e9a5d485",
  "point-click-storm-lamp.png": "d4ae66e9b9b27eb3d7e43d32d8517834eca486af2fbf6267e58f5055596e032e",
  "point-click-tide-gauge.png": "0843df67fb1ed03acb19e8bfbc59558bcd38f41c240adcd87a0017bc73a62143"
});

const SPRITE_SPECS = Object.freeze({
  cursor: Object.freeze({
    name: "point-click-cursor.png",
    source: "player-cursor/cursor-point-click-idle-hover-v1.png",
    sourceHash: SOURCE_HASHES.cursor,
    frameWidth: 16,
    frameHeight: 16,
    frameCount: 2,
    profile: "pointAndClick",
    visibleColors: 12,
    role: "point-click-cursor"
  }),
  lia: Object.freeze({
    name: "point-click-lia-scroll.png",
    source: "composicoes/scene-assemblies-v1-candidate/sprites/actors/lia-scroll.png",
    sourceHash: "4413b1ecc4b216acf8a2417a6e9a8795ce5f7e17113914f296cdf0ae03a7d6b8",
    sourceCandidate: `${POINT_CLICK_NPC_V2_ROOT}/lia-scroll-32x48-4bpp.png`,
    frameWidth: 32,
    frameHeight: 48,
    frameCount: 1,
    profile: "free",
    visibleColors: 15,
    role: "point-click-actor",
    promotionVersion: "v2"
  }),
  dock: Object.freeze({
    name: "point-click-dock-mechanic.png",
    source: "composicoes/scene-assemblies-v1-candidate/sprites/actors/dock-mechanic.png",
    sourceHash: "4edd239ae61d63c3e257e77e2e4cab01d86b422ebeed5398cb69bd285c5b637c",
    sourceCandidate: `${POINT_CLICK_NPC_V2_ROOT}/dock-mechanic-32x48-4bpp.png`,
    frameWidth: 32,
    frameHeight: 48,
    frameCount: 1,
    profile: "free",
    visibleColors: 15,
    role: "point-click-actor",
    promotionVersion: "v2"
  }),
  keeper: Object.freeze({
    name: "point-click-keeper-lantern.png",
    source: "composicoes/scene-assemblies-v1-candidate/sprites/actors/keeper-lantern.png",
    sourceHash: "8e58770b3eabfbb65f2904bae856a466ee96625561a4c7c5dba2bdc97b4306d9",
    sourceCandidate: `${POINT_CLICK_NPC_V2_ROOT}/keeper-lantern-32x48-4bpp.png`,
    frameWidth: 32,
    frameHeight: 48,
    frameCount: 1,
    profile: "free",
    visibleColors: 15,
    role: "point-click-actor",
    promotionVersion: "v2"
  }),
  chart: Object.freeze({
    name: "point-click-chart-compass.png",
    source: "composicoes/scene-assemblies-v1-candidate/props/chart-compass.png",
    sourceHash: SOURCE_HASHES.props,
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 1,
    profile: "free",
    visibleColors: 15,
    role: "point-click-prop"
  }),
  brass: Object.freeze({
    name: "point-click-brass-lantern.png",
    source: "composicoes/scene-assemblies-v1-candidate/props/brass-lantern.png",
    sourceHash: SOURCE_HASHES.props,
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 1,
    profile: "free",
    visibleColors: 15,
    role: "point-click-prop"
  }),
  chest: Object.freeze({
    name: "point-click-red-chest.png",
    source: "composicoes/scene-assemblies-v1-candidate/props/red-chest.png",
    sourceHash: SOURCE_HASHES.props,
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 1,
    profile: "free",
    visibleColors: 15,
    role: "point-click-prop"
  }),
  storm: Object.freeze({
    name: "point-click-storm-lamp.png",
    source: "composicoes/scene-assemblies-v1-candidate/props/storm-lamp.png",
    sourceHash: SOURCE_HASHES.props,
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 1,
    profile: "free",
    visibleColors: 13,
    role: "point-click-prop"
  }),
  tide: Object.freeze({
    name: "point-click-tide-gauge.png",
    source: "composicoes/scene-assemblies-v1-candidate/props/tide-gauge.png",
    sourceHash: SOURCE_HASHES.props,
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 1,
    profile: "free",
    visibleColors: 15,
    role: "point-click-prop"
  })
});

export const POINT_CLICK_SCENE_NAMES = Object.freeze([
  "armazem_das_mares",
  "observatorio_do_farol"
]);

const BACKGROUND_BAKED_ACTOR_IDS = Object.freeze([
  "armazem_das_mares-chart",
  "armazem_das_mares-brass",
  "armazem_das_mares-chest",
  "observatorio_do_farol-chart",
  "observatorio_do_farol-storm",
  "observatorio_do_farol-tide"
]);

export const POINT_CLICK_SCENE_SPECS = Object.freeze([
  Object.freeze({
    name: "armazem_das_mares",
    title: "Armazém das Marés",
    background: "armazem-das-mares-gba.png",
    backgroundSourceHash: SOURCE_HASHES.warehouseBackground,
    cursorName: "Cursor do Armazém",
    onEnterEventName: "armazem_das_mares_ao_entrar",
    objective: "Examinar a carta náutica, o baú e a saída do armazém.",
    controls: "Mova o cursor com o direcional; A examina o hotspot; B cancela.",
    success: "Reconhecer a rota que liga o armazém ao observatório.",
    failureRecovery: "Cada hotspot pode ser reaberto sem perder o estado da cena.",
    actors: Object.freeze([
      Object.freeze({ id: "lia", name: "Lia do Pergaminho", sprite: "lia", x: 5, y: 11 }),
      Object.freeze({ id: "dock", name: "Mecânico do Cais", sprite: "dock", x: 13, y: 11 }),
      Object.freeze({ id: "keeper", name: "Guardião da Lanterna", sprite: "keeper", x: 21, y: 11 })
    ]),
    hotspots: Object.freeze([
      Object.freeze({ id: "carta", name: "Carta Náutica", x: 3, y: 5, width: 4, height: 3, dialogue: "A carta ainda marca a rota do farol." }),
      Object.freeze({ id: "bau", name: "Baú Vermelho", x: 20, y: 10, width: 6, height: 5, dialogue: "O baú guarda um mecanismo lacrado." }),
      Object.freeze({ id: "saida", name: "Saída do Armazém", x: 13, y: 17, width: 4, height: 3, dialogue: "A porta leva de volta ao cais." })
    ])
  }),
  Object.freeze({
    name: "observatorio_do_farol",
    title: "Observatório do Farol",
    background: "observatorio-do-farol-gba.png",
    backgroundSourceHash: SOURCE_HASHES.observatoryBackground,
    cursorName: "Cursor do Observatório",
    onEnterEventName: "observatorio_do_farol_ao_entrar",
    objective: "Examinar o telescópio, o mapa da maré e a saída do observatório.",
    controls: "Mova o cursor com o direcional; A examina o hotspot; B cancela.",
    success: "Confirmar a leitura do farol antes de seguir para o Mercado Suspenso.",
    failureRecovery: "Os hotspots permanecem disponíveis depois de cada diálogo.",
    actors: Object.freeze([
      Object.freeze({ id: "dock", name: "Mecânico do Cais", sprite: "dock", x: 5, y: 11 }),
      Object.freeze({ id: "lia", name: "Lia do Pergaminho", sprite: "lia", x: 15, y: 11 }),
      Object.freeze({ id: "keeper", name: "Guardião da Lanterna", sprite: "keeper", x: 23, y: 12 })
    ]),
    hotspots: Object.freeze([
      Object.freeze({ id: "telescopio", name: "Telescópio", x: 3, y: 5, width: 5, height: 5, dialogue: "O telescópio ainda encontra o último farol." }),
      Object.freeze({ id: "mapa", name: "Mesa da Maré", x: 11, y: 9, width: 8, height: 5, dialogue: "A mesa reúne a rota e a maré." }),
      Object.freeze({ id: "saida", name: "Saída do Observatório", x: 13, y: 17, width: 4, height: 3, dialogue: "A porta leva de volta ao cais." })
    ])
  })
]);

export const POINT_CLICK_ASSET_NAMES = Object.freeze([
  "armazem-das-mares-gba.png",
  "observatorio-do-farol-gba.png",
  ...Object.values(SPRITE_SPECS).map((sprite) => sprite.name)
]);

export const POINT_CLICK_EVENT_NAMES = Object.freeze(
  POINT_CLICK_SCENE_SPECS.flatMap((scene) => scene.hotspots.map((hotspot) => `${scene.name}_${hotspot.id}`))
);

const sceneSpecByName = new Map(POINT_CLICK_SCENE_SPECS.map((scene) => [scene.name, scene]));
const spriteSpecByName = new Map(Object.values(SPRITE_SPECS).map((sprite) => [sprite.name, sprite]));

function sourceCandidate(sprite) {
  return sprite.sourceCandidate ?? `${POINT_CLICK_CANDIDATE_ROOT}/prepared/sprites/${sprite.name}`;
}

function backgroundSourceCandidate(name) {
  return `${POINT_CLICK_CANDIDATE_ROOT}/prepared/backgrounds/${name}`;
}

function backgroundAsset(spec) {
  return {
    id: `${spec.name}-background`,
    kind: "Background",
    name: spec.background,
    systemImage: "rectangle.inset.filled",
    metadata: {
      source: `Assets/backgrounds/${spec.background}`,
      sourceOriginal: spec.name === "armazem_das_mares"
        ? "user-provided: /Users/example/Pictures/Assets Exemplo/point-and-click/backgrounds/armazem-das-mares-v1.png"
        : "user-provided: /Users/example/Pictures/Assets Exemplo/point-and-click/backgrounds/observatorio-do-farol-v2.png",
      sourceSha256: spec.backgroundSourceHash,
      sourceCandidate: backgroundSourceCandidate(spec.background),
      preparedSha256: PREPARED_HASHES[spec.background],
      provenance: "Fonte fornecida pelo usuário; redução nearest-only para 240x160 preservando o original. Conversão técnica RGB para RGBA opaco sem alteração dos canais RGB. Promoção visual aprovada; assetc isolado em attention por quantização de cor; ROM e hardware permanecem pendentes.",
      generatedBy: "exemplo-gba-point-and-click-v1-approved",
      role: "point-click-background",
      sceneRoles: [spec.name],
      profile: "pointAndClick",
      visualProfile: "gba_point_click_source_preserving_nearest_approved",
      colorMode: "4bpp",
      width: 240,
      height: 160,
      tileCount: 600,
      backgroundPaletteBankBudget: 16,
      sourcePipeline: "source-preserving-nearest-only-240x160",
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "approved",
      visualStatus: "approved",
      sourcePreserving: true,
      ...approvedBackgrounds[spec.background]
    }
  };
}

function spriteAsset(sprite) {
  return {
    id: `point-click-${sprite.name.replace(/\.png$/, "")}`,
    kind: "Sprite",
    name: sprite.name,
    systemImage: sprite.role === "point-click-cursor" ? "cursorarrow" : "figure.walk",
    metadata: {
      source: `Assets/sprites/${sprite.name}`,
      sourceOriginal: `user-provided: /Users/example/Pictures/Assets Exemplo/point-and-click/${sprite.source}`,
      sourceSha256: sprite.sourceHash,
      sourceCandidate: sourceCandidate(sprite),
      preparedSha256: PREPARED_HASHES[sprite.name],
      provenance: sprite.promotionVersion === "v2"
        ? "Fonte individual fornecida pelo usuário; revisão nearest-only 32x48 antes da preparação adaptativa 4bpp. Escala aprovada visualmente para Armazém e Observatório; validação de cena/ROM e hardware registrada separadamente."
        : "Recorte da composição fornecida pelo usuário, alpha binário e nearest-only. Promoção visual aprovada; pack assetc isolado sem erro no sprite; ROM e hardware permanecem pendentes.",
      generatedBy: sprite.promotionVersion === "v2" ? "exemplo-gba-point-click-npcs-v2-approved" : "exemplo-gba-point-and-click-v1-approved",
      role: sprite.role,
      sceneRoles: ["pointAndClick"],
      profile: sprite.profile,
      colorMode: "4bpp",
      frameWidth: sprite.frameWidth,
      frameHeight: sprite.frameHeight,
      frameCount: sprite.frameCount,
      visibleColors: sprite.visibleColors,
      sourcePipeline: sprite.promotionVersion === "v2"
        ? "source-preserving-nearest-32x48-then-adaptive-4bpp"
        : "source-preserving-alpha-crop-nearest-only",
      assetcStatus: "safe",
      assetcReviewed: true,
      reviewStatus: "approved",
      visualStatus: "approved",
      sourcePreserving: true
    }
  };
}

function animationFrame(id, sprite, sourceFrameIndex) {
  const tileRegions = sprite.promotionVersion === "v2"
    ? [
      { x: -8, y: 16, sliceX: 0, sliceY: 0, width: 32, height: 32 },
      { x: -8, y: 0, sliceX: 0, sliceY: 32, width: 32, height: 16 }
    ]
    : [{ x: 0, y: 0, sliceX: 0, sliceY: 0, width: sprite.frameWidth, height: sprite.frameHeight }];
  return {
    id,
    frameIndex: sourceFrameIndex,
    sourceFrameIndex,
    width: sprite.frameWidth,
    height: sprite.frameHeight,
    originX: 0,
    originY: 0,
    tiles: tileRegions.map((region, index) => ({
      id: `${id}-tile-${index}`,
      x: region.x,
      y: region.y,
      sliceX: sourceFrameIndex * sprite.frameWidth + region.sliceX,
      sliceY: region.sliceY,
      sourceSheet: sprite.name,
      tileWidth: region.width,
      tileHeight: region.height,
      flipX: false,
      flipY: false,
      objPalette: "OBP0",
      paletteIndex: 0,
      priority: false
    }))
  };
}

function animation(id, name, sprite, sourceFrameIndexes, state = "idle") {
  return {
    id,
    name,
    spriteSheet: sprite.name,
    frameWidth: sprite.frameWidth,
    frameHeight: sprite.frameHeight,
    fps: state === "hover" ? 8 : 4,
    loops: true,
    frameCount: sourceFrameIndexes.length,
    state,
    direction: "none",
    colorMode: "4bpp",
    originX: 0,
    originY: 0,
    hitboxX: 0,
    hitboxY: -Math.min(8, sprite.frameHeight),
    hitboxWidth: Math.min(16, sprite.frameWidth),
    hitboxHeight: Math.min(16, sprite.frameHeight),
    sourceColorMode: "4bpp",
    frames: sourceFrameIndexes.map((sourceFrameIndex, frameIndex) => animationFrame(`${id}-frame-${frameIndex}`, sprite, sourceFrameIndex))
  };
}

function actorAnimationState(id, sprite, animationIDs, animationType = "fixed") {
  return {
    id,
    name: animationType === "cursor" ? "default" : "default",
    spriteSheet: sprite.name,
    animationType,
    mirrorLeftFromRight: false,
    animationIDs
  };
}

function candidateActor(scene, actor, sprite) {
  const animationID = `${scene.name}-${actor.id}-idle`;
  return {
    id: `${scene.name}-${actor.id}`,
    name: actor.name,
    roomName: scene.name,
    x: actor.x,
    y: actor.y,
    z: 0,
    spriteSheet: sprite.name,
    animationName: "idle",
    animationStateID: `${scene.name}-${actor.id}-state`,
    eventBindings: {}
  };
}

function candidateCursor(scene) {
  const sprite = SPRITE_SPECS.cursor;
  return {
    id: `${scene.name}-cursor`,
    name: scene.cursorName,
    roomName: scene.name,
    x: scene.name === "armazem_das_mares" ? 7 : 16,
    y: scene.name === "armazem_das_mares" ? 8 : 13,
    z: 0,
    spriteSheet: sprite.name,
    animationName: "idle",
    animationStateID: `${scene.name}-cursor-state`,
    eventBindings: {}
  };
}

function candidateScene(spec, existing = {}) {
  const tileCount = 30 * 20;
  const free = Array.from({ length: tileCount }, () => "free");
  return {
    ...existing,
    backgroundAssetName: spec.background,
    backgroundRenderMode: "tilemap",
    cameraBounds: { x: 0, y: 0, width: 30, height: 20 },
    cameraMode: "fixed_center",
    cameraZoom: 100,
    collisionTypes: free.slice(),
    collisions: free.slice(),
    eventBindings: { ...(existing.eventBindings ?? {}), onInit: spec.onEnterEventName },
    gbStudioName: existing.gbStudioName ?? spec.title,
    gbStudioUseBackgroundLayout: true,
    height: 20,
    id: existing.id ?? `scene-${spec.name}`,
    music: existing.music ?? "farol_enseada",
    name: spec.name,
    paletteBankPolicy: "full-screen",
    parallax: existing.parallax ?? { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
    playerActorName: spec.cursorName,
    referenceImages: existing.referenceImages ?? [],
    sceneType: "pointAndClick",
    tilemap: Array.from({ length: tileCount }, () => 0),
    tileLayers: [],
    width: 30,
    runtime: {
      type: "pointAndClick",
      config: { cursorSpeed: 2, hotspotPadding: 0, profile: "source-preserving-approved" }
    },
    displayName: spec.title,
    showcase: { id: "o-ultimo-farol", lane: "campaign", access: "campaign", playable: true, retained: true },
    onEnterEventName: spec.onEnterEventName,
    supportBriefing: {
      title: spec.title,
      objective: spec.objective,
      controls: spec.controls,
      success: spec.success,
      failureRecovery: spec.failureRecovery
    }
  };
}

function candidateDialogue(scene, hotspot) {
  const key = `${scene.name}_${hotspot.id}`;
  return {
    character: "Nara",
    choiceTranslations: {},
    choices: [],
    confirmSound: "farol_sfx_dialogo",
    emote: "",
    key,
    portrait: "",
    text: hotspot.dialogue,
    textSound: "farol_sfx_texto",
    translations: { "pt-BR": hotspot.dialogue, es: hotspot.dialogue },
    translationStatus: { "pt-BR": "approved", es: "approved" }
  };
}

function candidateEvent(scene, hotspot) {
  const name = `${scene.name}_${hotspot.id}`;
  const isCampaignExit = hotspot.id === "saida";
  return {
    id: `${name}-event`,
    name,
    roomName: scene.name,
    category: isCampaignExit ? "Cena" : "Hotspot",
    detail: isCampaignExit
      ? "Saída da cena point-and-click promovida à campanha canônica"
      : "Cena point-and-click promovida do pacote fornecido pelo usuário",
    command: "noop",
    steps: [{
      id: `${name}-step-1`,
      command: isCampaignExit ? "advance_campaign" : `show_dialogue ${name}`,
      isEnabled: true
    }]
  };
}

function candidateTrigger(scene, hotspot) {
  const eventName = `${scene.name}_${hotspot.id}`;
  return {
    id: `${scene.name}-${hotspot.id}-trigger`,
    name: hotspot.name,
    roomName: scene.name,
    x: hotspot.x,
    y: hotspot.y,
    width: hotspot.width,
    height: hotspot.height,
    eventName,
    eventBindings: { onInteract: eventName }
  };
}

function ensureScene(project, spec) {
  const existing = (project.scenas ?? []).find((scene) => scene.name === spec.name);
  return candidateScene(spec, existing);
}

function replaceByNames(items, names, replacement) {
  const firstIndex = items.findIndex((item) => names.has(item.name));
  if (firstIndex < 0) return [...items, ...replacement];
  const result = [];
  items.forEach((item, index) => {
    if (index === firstIndex) result.push(...replacement);
    if (!names.has(item.name)) result.push(item);
  });
  return result;
}

function insertScenesAfterPenedos(records, replacementScenes) {
  const pointClickNames = new Set(replacementScenes.map((scene) => scene.name));
  const withoutPointClick = records.filter((record) => !pointClickNames.has(record.name));
  const penedosIndex = withoutPointClick.findIndex((record) => record.name === "penedos_vento");
  if (penedosIndex < 0) return [...withoutPointClick, ...replacementScenes];
  return [
    ...withoutPointClick.slice(0, penedosIndex + 1),
    ...replacementScenes,
    ...withoutPointClick.slice(penedosIndex + 1)
  ];
}

export function promotePointClickSceneCandidates(project) {
  const scenes = Array.isArray(project.scenas) ? project.scenas : [];
  const existingRooms = Array.isArray(project.rooms) ? project.rooms : scenes;
  const pointClickScenes = POINT_CLICK_SCENE_SPECS.map((spec) => ensureScene(project, spec));
  const pointClickSceneNames = new Set(POINT_CLICK_SCENE_NAMES);
  const candidateAssets = [
    ...POINT_CLICK_SCENE_SPECS.map(backgroundAsset),
    ...Object.values(SPRITE_SPECS).map(spriteAsset)
  ];
  const cursorAnimations = POINT_CLICK_SCENE_SPECS.flatMap((scene) => [
    animation(`${scene.name}-cursor-idle`, "idle", SPRITE_SPECS.cursor, [0]),
    animation(`${scene.name}-cursor-hover`, "hover", SPRITE_SPECS.cursor, [1], "hover")
  ]);
  const propAnimations = POINT_CLICK_SCENE_SPECS.flatMap((scene) => scene.actors.map((actor) => {
    const sprite = SPRITE_SPECS[actor.sprite];
    return animation(`${scene.name}-${actor.id}-idle`, "idle", sprite, [0]);
  }));
  const animations = [...cursorAnimations, ...propAnimations];
  const animationStates = POINT_CLICK_SCENE_SPECS.flatMap((scene) => [
    actorAnimationState(`${scene.name}-cursor-state`, SPRITE_SPECS.cursor, [
      `${scene.name}-cursor-idle`,
      `${scene.name}-cursor-hover`
    ], "cursor"),
    ...scene.actors.map((actor) => actorAnimationState(
      `${scene.name}-${actor.id}-state`,
      SPRITE_SPECS[actor.sprite],
      [`${scene.name}-${actor.id}-idle`]
    ))
  ]);
  const actors = POINT_CLICK_SCENE_SPECS.flatMap((scene) => [
    candidateCursor(scene),
    ...scene.actors.map((actor) => candidateActor(scene, actor, SPRITE_SPECS[actor.sprite]))
  ]);
  const triggers = POINT_CLICK_SCENE_SPECS.flatMap((scene) => scene.hotspots.map((hotspot) => candidateTrigger(scene, hotspot)));
  const events = POINT_CLICK_SCENE_SPECS.flatMap((scene) => scene.hotspots.map((hotspot) => candidateEvent(scene, hotspot)));
  const dialogues = POINT_CLICK_SCENE_SPECS.flatMap((scene) => scene.hotspots
    .filter((hotspot) => hotspot.id !== "saida")
    .map((hotspot) => candidateDialogue(scene, hotspot)));
  const animationNames = new Set(animations.map((item) => item.id));
  const animationStateNames = new Set(animationStates.map((item) => item.id));
  const actorNames = new Set(actors.map((item) => item.id));
  const retiredActorIds = new Set(BACKGROUND_BAKED_ACTOR_IDS);
  const retiredAnimationIds = new Set(BACKGROUND_BAKED_ACTOR_IDS.map((id) => `${id}-idle`));
  const retiredAnimationStateIds = new Set(BACKGROUND_BAKED_ACTOR_IDS.map((id) => `${id}-state`));
  const triggerNames = new Set(triggers.map((item) => item.id));
  const eventNames = new Set(events.map((item) => item.name));
  const dialogueNames = new Set(dialogues.map((item) => item.key));
  const assetNames = new Set(candidateAssets.map((item) => item.name));

  const sceneMap = new Map(scenes.filter((scene) => !pointClickSceneNames.has(scene.name)).map((scene) => [scene.name, scene]));
  for (const scene of pointClickScenes) sceneMap.set(scene.name, scene);
  const roomMap = new Map(existingRooms.filter((room) => !pointClickSceneNames.has(room.name)).map((room) => [room.name, room]));
  for (const scene of pointClickScenes) roomMap.set(scene.name, scene);
  const orderedScenes = insertScenesAfterPenedos([...sceneMap.values()], pointClickScenes);
  const orderedRooms = insertScenesAfterPenedos([...roomMap.values()], pointClickScenes);

  return {
    ...project,
    scenas: orderedScenes,
    rooms: orderedRooms,
    assets: replaceByNames(project.assets ?? [], assetNames, candidateAssets),
    animations: [...(project.animations ?? []).filter((item) => !animationNames.has(item.id) && !retiredAnimationIds.has(item.id)), ...animations],
    animationStates: [...(project.animationStates ?? []).filter((item) => !animationStateNames.has(item.id) && !retiredAnimationStateIds.has(item.id)), ...animationStates],
    actors: [...(project.actors ?? []).filter((item) => !actorNames.has(item.id) && !retiredActorIds.has(item.id)), ...actors],
    triggers: [...(project.triggers ?? []).filter((item) => !triggerNames.has(item.id)), ...triggers],
    events: [...(project.events ?? []).filter((item) => !eventNames.has(item.name)), ...events],
    dialogues: [...(project.dialogues ?? []).filter((item) => !dialogueNames.has(item.key)), ...dialogues]
  };
}

export function getPointClickSceneSpec(name) {
  return sceneSpecByName.get(name) ?? null;
}

export function getPointClickSpriteSpec(name) {
  return spriteSpecByName.get(name) ?? null;
}
