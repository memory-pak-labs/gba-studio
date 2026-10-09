// The files listed here are the six approved derivatives of the V2 opening storyboard.
// Keep source art and the technical evidence in the cutscene candidate package.
export const OPENING_V2_FILES = Object.freeze([
  { folder: "backgrounds", name: "opening-v2-background-240x160.png", sha256: "b1577c986f1e824d790116e07174afd173f42fdd372d3a1bedb8a7fdfea76376" },
  { folder: "sprites", name: "opening-v2-guardia-idle-48x64.png", sha256: "4b82f85a8c042cec051848fcb414c2c9353d588a838481dcbbecfdd956652714" },
  { folder: "sprites", name: "opening-v2-guardia-turn-48x64.png", sha256: "e88fb504418a77edddf1c3141bcc63fb684609ca9265123ab3333b8e086acd60" },
  { folder: "sprites", name: "opening-v2-guardia-signal-48x64.png", sha256: "e4540cf8ff02f740c4d15c0e075cc4f29f6343f1c66c19a5dab33dca949bac15" },
  { folder: "sprites", name: "opening-v2-menino-24x32.png", sha256: "9e38bcc8ce0c8405169b2aefc1906790573440ecc7da3059a43a2ccb4e567d38" },
  { folder: "sprites", name: "opening-v2-gaivota-24x16.png", sha256: "df272227166dce037bcbdfa5439ac99c1d52679a305b3029e617b074edb3624f" }
]);

const POSES = [
  { key: "guardia-idle", label: "Guardiã · Abertura · Quadro 1", name: "opening-v2-guardia-idle-48x64.png", animationName: "opening_guardia_idle_canvas48x64", width: 48, height: 64 },
  { key: "guardia-turn", label: "Guardiã · Abertura · Quadro 2", name: "opening-v2-guardia-turn-48x64.png", animationName: "opening_guardia_turn_canvas48x64", width: 48, height: 64 },
  { key: "guardia-signal", label: "Guardiã · Abertura · Quadro 3", name: "opening-v2-guardia-signal-48x64.png", animationName: "opening_guardia_signal_canvas48x64", width: 48, height: 64 },
  { key: "menino", label: "Menino · Abertura · Quadro 4", name: "opening-v2-menino-24x32.png", animationName: "opening_menino", width: 24, height: 32 },
  { key: "gaivota", label: "Gaivota · Abertura · Quadro 4", name: "opening-v2-gaivota-24x16.png", animationName: "opening_gaivota", width: 24, height: 16 }
];

const OFFSCREEN = { x: 240, y: 160 };
const FRAME_POSITIONS = [
  [{ x: 142, y: 81 }],
  [{ x: 100, y: 63 }],
  [{ x: 167, y: 81 }],
  [{ x: 56, y: 110 }, { x: 90, y: 118 }]
];

function upsert(items, item, key = "id") {
  const index = items.findIndex((value) => value[key] === item[key]);
  if (index < 0) return [...items, item];
  return items.map((value, valueIndex) => valueIndex === index ? item : value);
}

function openingStep(id, durationFrames, from, to, eventName) {
  // The cutscene renderer falls back to the actor's stored position unless each
  // step specifies a motion. Keep every inactive pose entirely off screen.
  const actorMotions = POSES.map((_, actorIndex) => ({
    actorIndex,
    fromPosition: from.get(actorIndex) ?? OFFSCREEN,
    toPosition: to.get(actorIndex) ?? OFFSCREEN,
    durationFrames: 1
  }));
  return {
    id,
    backgroundAssetName: OPENING_V2_FILES[0].name,
    durationFrames,
    autoAdvance: true,
    skippable: true,
    actorMotions,
    onSkipEventName: "abertura_concluir",
    ...(eventName ? { eventName } : {})
  };
}

function openingRuntime(runtime) {
  const ids = [
    "opening-v2-01-vigia-na-praia",
    "opening-v2-02-vigia-de-costas",
    "opening-v2-03-sinal-ao-farol",
    "opening-v2-04-menino-na-praia"
  ];
  const lengths = [120, 90, 120, 150];
  const positions = [
    new Map([[0, FRAME_POSITIONS[0][0]]]),
    new Map([[1, FRAME_POSITIONS[1][0]]]),
    new Map([[2, FRAME_POSITIONS[2][0]]]),
    new Map([[3, FRAME_POSITIONS[3][0]], [4, FRAME_POSITIONS[3][1]]])
  ];
  const steps = ids.map((id, index) => openingStep(
    id, lengths[index], positions[index - 1] ?? new Map(), positions[index],
    index === 2 ? "abertura_sinal" : undefined
  ));
  steps.push({ id: "opening-v2-complete", durationFrames: 0, autoAdvance: false, skippable: false, eventName: "abertura_concluir" });
  return {
    type: "cutscene",
    config: {
      ...(runtime?.config ?? {}),
      stepDurationFrames: lengths[0],
      autoAdvance: true,
      nextSceneIndex: -1,
      backgroundIndex: -1,
      steps
    }
  };
}

function openingAssets() {
  const background = {
    id: "opening-v2-background", kind: "Background", name: OPENING_V2_FILES[0].name, systemImage: "sunrise",
    metadata: {
      source: `Assets/backgrounds/${OPENING_V2_FILES[0].name}`,
      provenance: "Derivação 4bpp da composição V2 aprovada em 2026-09-19; fonte preservada no pacote de cutscene",
      generatedBy: "scene-sequence-v2-focused-assetc-4bpp-approved-derived",
      role: "opening-bg", sceneRoles: ["opening-bg"], profile: "menu", colorMode: "4bpp",
      backgroundPaletteBankBudget: 8, paletteBankCount: 8, width: 240, height: 160, tileCount: 600,
      backgroundTileOptimizer: { enabled: true, tileBudget: 1024, sourceTileCount: 596, optimizedTileCount: 596, maxFramebufferMismatchRatio: 0, totalMappingError: 0 },
      assetcStatus: "attention", assetcReviewed: true, technicalStatus: "within_declared_contract_with_source_color_loss",
      reviewStatus: "approved-derived", visualStatus: "approved", candidateStatus: "promoted", sourcePreserving: true,
      preparedSha256: OPENING_V2_FILES[0].sha256
    }
  };
  const sprites = POSES.map((pose) => ({
    id: `opening-v2-${pose.key}`, kind: "Sprite", name: pose.name, systemImage: "person",
    metadata: {
      source: `Assets/sprites/${pose.name}`,
      provenance: "Variante OBJ da composição V2 aprovada visualmente em 2026-09-19",
      generatedBy: "scene-sequence-v2-alpha128-canvas48x64",
      role: "opening-actor", sceneRoles: ["opening-actor"], profile: "free", colorMode: "4bpp",
      storageFormat: "indexed-4bpp", transparentIndex: 0, preparedBy: "scene-sequence-v2-alpha128-canvas48x64"
    }
  }));
  return [background, ...sprites];
}

export function promoteApprovedOpeningV2(project) {
  const originalScene = project.rooms?.find((room) => room.name === "abertura");
  if (!originalScene) throw new Error("Cena abertura ausente do projeto");
  const scene = {
    ...originalScene,
    backgroundAssetName: OPENING_V2_FILES[0].name,
    runtime: openingRuntime(originalScene.runtime)
  };
  const actors = (project.actors ?? []).filter((actor) => actor.roomName !== "abertura").concat(POSES.map((pose) => ({
    id: `opening-v2-actor-${pose.key}`, name: pose.label, roomName: "abertura", x: 29, y: 19,
    spriteSheet: pose.name, animationName: pose.animationName, animationStateID: `opening-v2-state-${pose.key}`
  })));
  const animations = POSES.reduce((items, pose) => upsert(items, {
    id: `opening-v2-animation-${pose.key}`, name: pose.animationName, spriteSheet: pose.name,
    frameWidth: pose.width, frameHeight: pose.height, fps: 1, loops: false, frameCount: 1,
    state: "idle", direction: "none", colorMode: "4bpp", originX: 0, originY: 0,
    hitboxX: 0, hitboxY: 0, hitboxWidth: pose.width, hitboxHeight: pose.height, sourceColorMode: "4bpp",
    frames: [{ id: `opening-v2-animation-${pose.key}-frame-0`, frameIndex: 0, sourceFrameIndex: 0, width: pose.width, height: pose.height, originX: 0, originY: 0, tiles: [] }]
  }), project.animations ?? []);
  const animationStates = POSES.reduce((items, pose) => upsert(items, {
    id: `opening-v2-state-${pose.key}`, name: "default", spriteSheet: pose.name,
    animationType: "fixed", mirrorLeftFromRight: false, animationIDs: [`opening-v2-animation-${pose.key}`]
  }), project.animationStates ?? []);
  const completed = project.events.find((event) => event.name === "abertura_concluir");
  if (!completed) throw new Error("Evento abertura_concluir ausente do projeto");
  const events = upsert(project.events.map((event) => event.name === "abertura_concluir"
    ? { ...event, steps: event.steps.filter((step) => step.command !== "play_sfx farol_sfx_sinal") }
    : event), {
    id: "event-abertura-signal-v2", name: "abertura_sinal", roomName: "abertura", category: "Cena",
    detail: "Sinal da Guardiã no terceiro quadro da abertura", command: "noop",
    steps: [{ id: "event-abertura-signal-v2-sfx", command: "play_sfx farol_sfx_sinal", isEnabled: true }]
  });
  const assets = openingAssets().reduce((items, asset) => upsert(items, asset), project.assets ?? []);
  return {
    ...project,
    assets,
    actors,
    animations,
    animationStates,
    events,
    rooms: project.rooms.map((room) => room.name === "abertura" ? scene : room),
    scenas: project.scenas.map((room) => room.name === "abertura" ? structuredClone(scene) : room)
  };
}
