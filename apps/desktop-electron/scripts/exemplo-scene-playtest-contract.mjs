import { dirname, join } from "node:path";

const DEFAULT_THRESHOLDS = Object.freeze({
  maxDroppedFrameRatio: 0.1,
  minEmulationFps: 55,
  minPresentationFps: 55
});

const GBA_FRAMEBUFFER_WIDTH = 240;
const GBA_FRAMEBUFFER_HEIGHT = 160;
const EXEMPLO_SCENE_COUNT = 17;
const EXEMPLO_PLAYER_RUNTIMES = new Set([
  "topdown",
  "platformer",
  "pointAndClick",
  "shmup",
  "isometric",
  "racing",
  "battleRpg",
  "luta"
]);

export function resolveExemploSmokeFaceButton(controls, action) {
  if (action !== "a" && action !== "b") {
    throw new Error(`Botão de ação não suportado no smoke: ${String(action)}.`);
  }
  const setting = action === "a" ? "aButton" : "bButton";
  const alias = String(controls?.[setting] ?? "")
    .split(",")
    .map((token) => token.trim())
    .find((token) => /^[a-z]$/i.test(token));
  if (!alias) {
    throw new Error(`O smoke precisa de uma tecla simples configurada para o botão ${action.toUpperCase()}.`);
  }
  const key = alias.toLowerCase();
  return {
    code: `Key${key.toUpperCase()}`,
    key,
    windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    mask: action === "a" ? 1 << 0 : 1 << 1
  };
}

export function exemploLaunchContract(exported) {
  const runtime = exported?.runtime_dispatch?.initial_runtime;
  const initialScene = exported?.runtime_dispatch?.initial_scene;
  if (typeof initialScene === "string" && initialScene.length > 0) {
    const knownScene = exported?.runtime_contract?.rooms?.find((room) => room?.name === initialScene);
    return {
      startScene: initialScene,
      startSceneType: knownScene?.runtime_profile ?? (runtime === "menu" ? "menu" : null)
    };
  }
  const presentationSceneTypes = {
    menu: "menu",
    cutscene: "cutscene",
    visual_novel: "visualNovel",
    world_map: "worldMap",
    battle_rpg: "battleRpg",
    luta: "luta"
  };
  const presentationSceneType = presentationSceneTypes[runtime];
  if (presentationSceneType) {
    const logicalScene = exported?.runtime_contract?.rooms
      ?.find((room) => room?.runtime_profile === presentationSceneType);
    if (logicalScene?.name) {
      return { startScene: logicalScene.name, startSceneType: presentationSceneType };
    }
  }
  const specs = {
    topdown: [exported?.topdown_project?.rooms, exported?.topdown_project?.initial_room, "topdown"],
    platformer: [exported?.platformer_project?.rooms, exported?.platformer_project?.initial_room, "platformer"],
    point_click: [exported?.point_click_project?.scenes, exported?.point_click_project?.initial_scene, "pointAndClick"],
    shmup: [exported?.shmup_project?.waves, exported?.shmup_project?.initial_wave, "shmup"],
    isometric: [exported?.isometric_project?.rooms, exported?.isometric_project?.initial_room, "isometric"],
    dungeon_crawler: [exported?.dungeon_crawler_project?.rooms, exported?.dungeon_crawler_project?.initial_room, "dungeonCrawler"],
    racing: [exported?.racing_project?.rooms, exported?.racing_project?.initial_room, "racing"],
    menu: [exported?.menu_project?.screens, exported?.menu_project?.initial_screen, "menu"],
    cutscene: [exported?.cutscene_project?.scenes, exported?.cutscene_project?.initial_scene, "cutscene"],
    visual_novel: [exported?.visual_novel_project?.scenes, exported?.visual_novel_project?.initial_scene, "visualNovel"],
    world_map: [exported?.world_map_project?.nodes, exported?.world_map_project?.initial_node, "worldMap"],
  battle_rpg: [exported?.battle_rpg_project?.encounters, exported?.battle_rpg_project?.initial_encounter, "battleRpg"],
  luta: [exported?.luta_project?.stages, exported?.luta_project?.initial_stage, "luta"]
  };
  const [entries, index, sceneType] = specs[runtime] ?? [];
  return {
    startScene: Array.isArray(entries) ? entries[index]?.name ?? null : null,
    startSceneType: sceneType ?? null
  };
}

export function editorProjectReadyForScenePlaytest(text, expectedSceneLabels) {
  const rendered = typeof text === "string" ? text : "";
  const labels = Array.isArray(expectedSceneLabels) ? expectedSceneLabels : [];
  const scenesLoaded = labels.every((label) => rendered.includes(String(label)));
  const projectStatusReady = rendered.includes("Salvo") || rendered.includes("Alterado");
  return scenesLoaded && projectStatusReady;
}

export function exemploRuntimeLaunchContract(exported) {
  const dispatch = exported?.runtime_dispatch;
  const runtime = typeof dispatch?.initial_runtime === "string"
    ? dispatch.initial_runtime
    : null;
  const startScene = typeof dispatch?.initial_scene === "string"
    ? dispatch.initial_scene
    : null;
  if (runtime && Number.isInteger(Number(dispatch?.initial_room))) {
    return {
      currentRoom: Number(dispatch.initial_room),
      runtime,
      startScene
    };
  }

  const projectByRuntime = {
    topdown: ["topdown_project", "initial_room"],
    platformer: ["platformer_project", "initial_room"],
    isometric: ["isometric_project", "initial_room"],
    dungeon_crawler: ["dungeon_crawler_project", "initial_room"],
    racing: ["racing_project", "initial_room"],
    point_click: ["point_click_project", "initial_scene"],
    shmup: ["shmup_project", "initial_wave"],
    menu: ["menu_project", "initial_screen"],
    cutscene: ["cutscene_project", "initial_scene"],
    visual_novel: ["visual_novel_project", "initial_scene"],
    world_map: ["world_map_project", "initial_node"],
    battle_rpg: ["battle_rpg_project", "initial_encounter"],
    luta: ["luta_project", "initial_stage"]
  };
  const [projectKey, indexKey] = projectByRuntime[runtime] ?? [];
  const project = projectKey ? exported?.[projectKey] : null;
  const currentRoom = project && Number.isInteger(Number(project[indexKey]))
    ? Number(project[indexKey])
    : null;
  const entries = project
    ? project.scenes ?? project.screens ?? project.rooms ?? project.waves ?? project.nodes ?? project.encounters ?? project.stages
    : null;
  const selectedEntry = Array.isArray(entries) && currentRoom !== null ? entries[currentRoom] : null;
  return {
    currentRoom,
    runtime,
    startScene: startScene ?? (typeof selectedEntry?.name === "string" ? selectedEntry.name : null)
  };
}

export function exemploProjectAssetSource(project, assetName) {
  const asset = project?.assets?.find((candidate) => candidate?.name === assetName);
  const source = asset?.metadata?.source;
  if (typeof source !== "string" || source.length === 0) {
    throw new Error(`Asset ${assetName} nao possui metadata.source no projeto atual.`);
  }
  return source;
}

export function exemploSceneBackgroundAnimationAssetNames(room) {
  const runtimeConfig = room?.runtime?.config;
  const screens = Array.isArray(runtimeConfig?.screens) ? runtimeConfig.screens : [];
  const screen = screens.find((candidate) => (
    candidate?.id === room?.id
    || candidate?.id === room?.name
    || candidate?.name === room?.name
  )) ?? screens[0];
  const animation = screen?.backgroundAnimation ?? runtimeConfig?.backgroundAnimation;
  const frameAssetNames = Array.isArray(animation?.frameAssetNames)
    ? animation.frameAssetNames
    : [];
  return Array.from(new Set(
    frameAssetNames
      .filter((assetName) => typeof assetName === "string")
      .map((assetName) => assetName.trim())
      .filter((assetName) => assetName.length > 0)
  ));
}

export function auditIntegerFramebufferDisplay(display) {
  const intrinsicWidth = Number(display?.intrinsicWidth);
  const intrinsicHeight = Number(display?.intrinsicHeight);
  const cssWidth = Number(display?.cssWidth);
  const cssHeight = Number(display?.cssHeight);
  const reportedScale = Number(display?.reportedScale);
  const horizontalScale = cssWidth / GBA_FRAMEBUFFER_WIDTH;
  const verticalScale = cssHeight / GBA_FRAMEBUFFER_HEIGHT;
  const scale = Number.isInteger(horizontalScale) && horizontalScale >= 1
    ? horizontalScale
    : null;
  const checks = {
    intrinsicSize: intrinsicWidth === GBA_FRAMEBUFFER_WIDTH && intrinsicHeight === GBA_FRAMEBUFFER_HEIGHT,
    integerScale: scale !== null && verticalScale === scale,
    reportedScale: scale !== null && reportedScale === scale
  };
  return {
    audited: true,
    checks,
    cssHeight,
    cssWidth,
    intrinsicHeight,
    intrinsicWidth,
    ok: Object.values(checks).every(Boolean),
    scale
  };
}

export const EXEMPLO_RGB555_SCENE_THRESHOLDS = Object.freeze({
  // O enquadramento follow_player mostra apenas a porcao navegavel do tileset;
  // as cores dominantes do mapa inteiro nao aparecem todas no viewport inicial.
  porto_lumen: 0.08,
  armazem_das_mares: 0.1,
  observatorio_do_farol: 0.1,
  // A arena de batalha compartilha o framebuffer com HUD e espacos de combate;
  // a cobertura observada do fundo autoral no quadro inicial e de aproximadamente 15%.
  guardiao_rele: 0.1,
  // A primeira pessoa divide o framebuffer com os dois atores aprovados da Usina e
  // A câmera em primeira pessoa divide o viewport com os dois atores aprovados;
  // a cobertura das cores dominantes do tilemap fica em aproximadamente 10% ou mais.
  usina_submersa: 0.1,
  usina_combate: 0.1,
  usina_saida: 0.1,
});

// A corrida agora usa o pacote top-down autorado e os racers promovidos;
// portanto o playtest deve validar fundo, player e rival no framebuffer nativo.
export const EXEMPLO_BACKGROUNDLESS_SCENES = Object.freeze([]);

export const EXEMPLO_RGB555_TRANSITION = Object.freeze({
  from: "titulo",
  intermediate: "title_options",
  settleFrames: 0,
  to: "prologo"
});

export const EXEMPLO_NON_SILENT_AUDIO_SCENES = Object.freeze([
  "porto_lumen",
  "farol_interior",
  "penedos_vento",
  "armazem_das_mares",
  "observatorio_do_farol",
  "tempestade",
  "guardiao_rele",
  "arena_arrancada"
]);

export const EXEMPLO_PLAYER_FRAMEBUFFER_SCENES = Object.freeze([
  "porto_lumen",
  "penedos_vento",
  "armazem_das_mares",
  "observatorio_do_farol",
  "mercado_suspenso",
  "tempestade",
  "guardiao_rele",
  "arena_arrancada",
  "circuito_final"
]);

// Penedos liga o player ao mesmo asset autorado da Nara; a arena tática
// também usa atores explícitos. Nenhuma deve auditar o player padrão.
export const EXEMPLO_EXPLICIT_ACTOR_BINDING_SCENES = Object.freeze([
  "arena_tatica",
  "penedos_vento"
]);

export const EXEMPLO_EXACT_PLAYER_FRAMEBUFFER_SCENES = Object.freeze([
  "penedos_vento",
  "armazem_das_mares",
  "observatorio_do_farol",
  "mercado_suspenso",
  "tempestade",
  "guardiao_rele",
  "arena_arrancada",
  "circuito_final"
]);

// A aeronave da rota e um cursor de viagem, sem player livre.
export const EXEMPLO_PLAYERLESS_SCENES = Object.freeze(["mapa_rota"]);

export const EXEMPLO_EXACT_BACKGROUND_FRAMEBUFFER_SCENES = Object.freeze([
  // O título usa um background 4 BPP com paletas locais aceitas pelo assetc
  // e uma composição separada de logo/press-start; ambos precisam preservar
  // o quadro nativo quando a cena chega ao Play/mGBA.
  "titulo",
  "prologo",
  "abertura",
  "conselho_guardia",
  "mapa_rota",
  "mercado_suspenso",
  "armazem_das_mares",
  "observatorio_do_farol",
  "arena_arrancada",
  "circuito_final"
]);

export function exemploScenePlaytestPlan(project) {
  const scenes = Array.isArray(project?.scenas) ? project.scenas : [];
  return scenes
    .filter((scene) => Boolean(scene?.campaign) || (
      scene?.sceneType === "isometric"
      && scene?.runtime?.config?.gameplayMode === "tactical"

    ) || (
      scene?.sceneType === "pointAndClick"
      && scene?.runtime?.config?.profile === "source-preserving-approved"
    ))
    .map((scene, index) => ({
      id: typeof scene?.id === "string" ? scene.id : null,
      index,
      name: typeof scene?.name === "string" ? scene.name : `scene_${index + 1}`,
      runtime: typeof scene?.sceneType === "string" && scene.sceneType.length > 0
        ? scene.sceneType
        : "topdown"
    }));
}

export function exemploInterfaceScenePlaytestPlan(project) {
  const scenes = Array.isArray(project?.scenas) ? project.scenas : [];
  return scenes
    .filter((scene) => !scene?.campaign && ["menu", "cutscene"].includes(scene?.sceneType))
    .map((scene, index) => ({
      id: typeof scene?.id === "string" ? scene.id : null,
      index,
      name: typeof scene?.name === "string" ? scene.name : `interface_scene_${index + 1}`,
      runtime: scene.sceneType
    }));
}

export function selectExemploScenePlaytestPlan(project, sceneName) {
  const plan = exemploScenePlaytestPlan(project);
  if (typeof sceneName !== "string" || sceneName.length === 0) return plan;
  const affineShowcasePlan = (Array.isArray(project?.scenas) ? project.scenas : [])
    .filter((scene) => scene?.name === sceneName && scene?.runtime?.config?.profile === "affine-showcase")
    .map((scene, index) => ({
      id: typeof scene?.id === "string" ? scene.id : null,
      index,
      name: scene.name,
      runtime: typeof scene?.sceneType === "string" && scene.sceneType.length > 0
        ? scene.sceneType
        : "topdown"
    }));
  const topdownInteriorPlan = (Array.isArray(project?.scenas) ? project.scenas : [])
    .filter((scene) => scene?.name === sceneName && scene?.runtime?.config?.profile === "lighthouse-interior")
    .map((scene, index) => ({
      id: typeof scene?.id === "string" ? scene.id : null,
      index,
      name: scene.name,
      runtime: typeof scene?.sceneType === "string" && scene.sceneType.length > 0
        ? scene.sceneType
        : "topdown"
    }));
  const selected = [...plan, ...exemploInterfaceScenePlaytestPlan(project), ...affineShowcasePlan, ...topdownInteriorPlan]
    .filter((scene, index, scenes) => scenes.findIndex((candidate) => candidate.name === scene.name) === index)
    .filter((scene) => scene.name === sceneName);
  if (selected.length !== 1) {
    throw new Error(`Cena isolada nao encontrada no template: ${sceneName}.`);
  }
  return selected;
}

export function auditExemploInterfaceScenePlaytest(project, results) {
  const interfaceScenes = new Map(
    exemploInterfaceScenePlaytestPlan(project).map((scene) => [scene.name, scene])
  );
  const resultList = Array.isArray(results) ? results : [];
  const expectedScenes = resultList.length > 0
    ? resultList.map((result) => interfaceScenes.get(result?.name)).filter(Boolean)
    : [...interfaceScenes.values()];
  const issues = [];
  let passed = 0;

  for (const expected of expectedScenes) {
    const result = resultList.find((candidate) => candidate?.name === expected.name);
    const sceneIssues = [];
    if (!result) {
      sceneIssues.push(`${expected.name}: resultado de playtest ausente.`);
    } else {
      if (result.runtime !== expected.runtime) sceneIssues.push(`${expected.name}: runtime esperado menu.`);
      if (!Number.isFinite(result.romBytes) || result.romBytes <= 0) sceneIssues.push(`${expected.name}: ROM valida nao foi aberta.`);
      if (result.frame?.meaningful !== true) sceneIssues.push(`${expected.name}: frame significativo nao foi confirmado.`);
      if (result.launchContract?.startScene !== expected.name || result.launchContract?.startSceneType !== expected.runtime) {
        sceneIssues.push(`${expected.name}: contrato de inicializacao nao preservou a tela de interface.`);
      }
      if (!Number.isFinite(result.runtimeState?.frame) || result.runtimeState.frame <= 0) sceneIssues.push(`${expected.name}: runtime nativo nao avancou frames.`);
      if (!Number.isFinite(result.audio?.emittedAudioFrames) || result.audio.emittedAudioFrames <= 0) sceneIssues.push(`${expected.name}: pipeline de audio nao emitiu frames.`);
      if (Number(result.audio?.audioUnderrunCount ?? 0) > 0) sceneIssues.push(`${expected.name}: Player registrou underrun no fluxo PCM.`);
      for (const [key, label] of [["backgroundFidelity", "background"], ["paletteFidelity", "paletas"], ["displayFidelity", "display"]]) {
        if (result[key]?.audited !== true || result[key]?.ok !== true) sceneIssues.push(`${expected.name}: fidelidade de ${label} nao foi comprovada.`);
      }
      if (result.actorFidelity?.audited !== true || result.actorFidelity?.ok !== true) {
        sceneIssues.push(`${expected.name}: fidelidade individual dos atores nao foi comprovada.`);
      }
      if (result.temporalVisualFidelity?.ok !== true) {
        sceneIssues.push(`${expected.name}: estabilidade temporal de background e atores nao foi comprovada.`);
      }
      const cadence = result.performance ?? {};
      if (!(Number(cadence.emulationFps) >= 55 && Number(cadence.presentationFps) >= 55 && Number(cadence.droppedFrameRatio) <= 0.1)) {
        sceneIssues.push(`${expected.name}: cadencia do Player fora dos limites esperados.`);
      }
    }
    if (sceneIssues.length === 0) passed += 1;
    else issues.push(...sceneIssues);
  }

  for (const result of resultList) {
    if (!interfaceScenes.has(result?.name)) issues.push(`${String(result?.name ?? "cena desconhecida")}: resultado nao pertence as telas de interface.`);
  }
  return {
    ok: issues.length === 0,
    counts: { expected: expectedScenes.length, passed, failed: expectedScenes.length - passed },
    issues,
    scenes: expectedScenes.map((scene) => ({ name: scene.name, ok: !issues.some((issue) => issue.startsWith(`${scene.name}:`)) }))
  };
}

export function selectExemploScenePlaytestProjectPath(args, defaultProjectPath) {
  const argument = (Array.isArray(args) ? args : [])
    .find((candidate) => typeof candidate === "string" && candidate.startsWith("--project="));
  if (argument === undefined) return defaultProjectPath;
  const projectPath = argument.slice("--project=".length).trim();
  if (projectPath.length === 0) {
    throw new Error("O argumento --project precisa apontar para um arquivo .gba-project autocontido.");
  }
  return projectPath;
}

export function exemploSceneScreenshotPath(evidencePath, sceneName) {
  return join(dirname(evidencePath), "scenes", `${sceneName}.png`);
}

export function steadyFrameSamples(samples, sampleCount = 3) {
  if (!Array.isArray(samples) || samples.length < sampleCount) return [];
  return samples.slice(-sampleCount);
}

export function parseExemploSceneSoakMinutes(args) {
  const argument = (Array.isArray(args) ? args : [])
    .find((candidate) => typeof candidate === "string" && candidate.startsWith("--soak-minutes="));
  if (argument === undefined) return 0;
  const minutes = Number(argument.slice("--soak-minutes=".length));
  if (!Number.isInteger(minutes) || minutes < 20 || minutes > 30) {
    throw new Error("O soak integrado precisa durar entre 20 e 30 minutos inteiros.");
  }
  return minutes;
}

function averageNumeric(samples, key) {
  if (samples.length === 0) return 0;
  return samples.reduce((total, sample) => total + Number(sample?.[key] ?? 0), 0) / samples.length;
}

export function auditExemploSessionSoak(session, thresholds = {}) {
  const limits = {
    maxDroppedFrameRatio: 0.1,
    maxSteadyMemoryGrowthBytes: 128 * 1024 * 1024,
    minDurationMs: 20 * 60_000,
    minEmulationFps: 55,
    minHealthySampleRatio: 0.95,
    minMemorySamples: 20,
    minPerformanceSamples: 20,
    minPresentationFps: 55,
    ...thresholds
  };
  const memorySamples = Array.isArray(session?.memorySamples) ? session.memorySamples : [];
  const performanceSamples = Array.isArray(session?.performanceSamples) ? session.performanceSamples : [];
  const audioSamples = Array.isArray(session?.audioSamples) ? session.audioSamples : [];
  const sceneSamples = Array.isArray(session?.sceneSamples) ? session.sceneSamples : [];
  const uniqueSceneNames = new Set(
    sceneSamples
      .map((sample) => sample?.sceneName)
      .filter((name) => typeof name === "string" && name.length > 0)
  );
  const edgeSampleCount = Math.max(1, Math.min(5, Math.floor(memorySamples.length / 3)));
  const firstRss = averageNumeric(memorySamples.slice(0, edgeSampleCount), "rssBytes");
  const lastRss = averageNumeric(memorySamples.slice(-edgeSampleCount), "rssBytes");
  const growthBytes = Math.round(lastRss - firstRss);
  const memoryStable = memorySamples.length >= limits.minMemorySamples
    && Number.isFinite(growthBytes)
    && growthBytes <= limits.maxSteadyMemoryGrowthBytes;
  const healthyPerformanceSamples = performanceSamples.filter((sample) => (
    Number(sample?.emulationFps) >= limits.minEmulationFps
    && Number(sample?.presentationFps) >= limits.minPresentationFps
    && Number(sample?.droppedFrameRatio) <= limits.maxDroppedFrameRatio
  ));
  const healthySampleRatio = performanceSamples.length > 0
    ? healthyPerformanceSamples.length / performanceSamples.length
    : 0;
  const performanceHealthy = performanceSamples.length >= limits.minPerformanceSamples
    && healthySampleRatio >= limits.minHealthySampleRatio
    && averageNumeric(performanceSamples, "emulationFps") >= limits.minEmulationFps
    && averageNumeric(performanceSamples, "presentationFps") >= limits.minPresentationFps;
  const durationComplete = Number(session?.durationMs) >= limits.minDurationMs;
  const scenesComplete = uniqueSceneNames.size === EXEMPLO_SCENE_COUNT;
  const audioHealthy = audioSamples.every((sample) => Number(sample?.audioUnderrunCount ?? 0) === 0);
  const saveLoad = session?.saveLoad ?? {};
  const saveLoadHealthy = saveLoad?.attempted === true
    && saveLoad?.saveSucceeded === true
    && saveLoad?.loadSucceeded === true
    && saveLoad?.stateChanged === true
    && saveLoad?.restored === true;
  const issues = [];
  if (!durationComplete) issues.push("A sessao integrada nao atingiu 20 minutos.");
  if (!scenesComplete) issues.push(`A sessao integrada cobriu ${uniqueSceneNames.size}/${EXEMPLO_SCENE_COUNT} cenas.`);
  if (!memoryStable) issues.push(`A memoria nao ficou estavel: crescimento de ${growthBytes} bytes.`);
  if (!performanceHealthy) issues.push("A cadencia sustentada ficou abaixo de 55 FPS ou excedeu 10% de frames descartados.");
  if (!audioHealthy) issues.push("O Player registrou underrun durante o soak de audio PCM.");
  if (!saveLoadHealthy) issues.push("Save/load nao restaurou o estado do Player durante o soak.");
  return {
    audio: { healthy: audioHealthy, sampleCount: audioSamples.length },
    duration: { complete: durationComplete, milliseconds: Number(session?.durationMs ?? 0) },
    issues,
    memory: {
      firstRssBytes: Math.round(firstRss),
      growthBytes,
      lastRssBytes: Math.round(lastRss),
      sampleCount: memorySamples.length,
      stable: memoryStable
    },
    ok: issues.length === 0,
    performance: {
      healthy: performanceHealthy,
      healthySampleCount: healthyPerformanceSamples.length,
      healthySampleRatio,
      sampleCount: performanceSamples.length
    },
    saveLoad: { healthy: saveLoadHealthy, ...saveLoad },
    scenes: { complete: scenesComplete, count: uniqueSceneNames.size },
    thresholds: limits
  };
}

const EXEMPLO_RICH_SPRITE_LOW_COLOR_SCENES = new Set([
  "porto_lumen",
  "penedos_vento",
  "tempestade",
  "mercado_suspenso",
  "circuito_final"
]);

function visualHistogramLuminance(rgb) {
  if (!Array.isArray(rgb) || rgb.length < 3) return 0;
  return ((0.2126 * Number(rgb[0])) + (0.7152 * Number(rgb[1])) + (0.0722 * Number(rgb[2]))) / 255;
}

function visualHistogramPercentile(histogram, percentile) {
  const entries = (Array.isArray(histogram) ? histogram : [])
    .filter((entry) => Number(entry?.count) > 0 && Array.isArray(entry?.rgb))
    .map((entry) => ({ count: Number(entry.count), luminance: visualHistogramLuminance(entry.rgb) }))
    .sort((left, right) => left.luminance - right.luminance);
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  if (total <= 0) return null;
  let remaining = total * percentile;
  for (const entry of entries) {
    remaining -= entry.count;
    if (remaining <= 0) return entry.luminance;
  }
  return entries.at(-1)?.luminance ?? null;
}

function normalizedRgb555(value) {
  const color = Number(value) & 0x7fff;
  return [
    (color & 0x1f) / 31,
    ((color >> 5) & 0x1f) / 31,
    ((color >> 10) & 0x1f) / 31
  ];
}

function visualPaletteRelationship(background, objects) {
  const normalize = (value) => [...new Set(Array.isArray(value) ? value : [])]
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 0x7fff)
    .slice(0, 16)
    .map(normalizedRgb555);
  const backgroundColors = normalize(background);
  const objectColors = normalize(objects);
  let nearestDistance = Number.POSITIVE_INFINITY;
  let farthestDistance = 0;
  for (const bg of backgroundColors) {
    for (const obj of objectColors) {
      const red = bg[0] - obj[0];
      const green = bg[1] - obj[1];
      const blue = bg[2] - obj[2];
      const distance = Math.sqrt((2 * red * red) + (4 * green * green) + (blue * blue)) / Math.sqrt(7);
      nearestDistance = Math.min(nearestDistance, distance);
      farthestDistance = Math.max(farthestDistance, distance);
    }
  }
  return {
    backgroundColorCount: backgroundColors.length,
    objectColorCount: objectColors.length,
    nearestDistance,
    farthestDistance,
    ok: backgroundColors.length >= 2
      && objectColors.length >= 2
      && nearestDistance <= 0.2
      && farthestDistance >= 0.25
  };
}

export function auditExemploVisualQualityGate(project, results) {
  const expectedScenes = exemploScenePlaytestPlan(project);
  const resultsByName = new Map((Array.isArray(results) ? results : []).map((result) => [result?.name, result]));
  const authoredScenes = new Map((Array.isArray(project?.scenas) ? project.scenas : []).map((scene) => [scene?.name, scene]));
  const paletteFamilies = new Map((Array.isArray(project?.paletteFamilies) ? project.paletteFamilies : []).map((family) => [family?.id, family]));
  const issues = [];
  const scenes = expectedScenes.map((expected) => {
    const result = resultsByName.get(expected.name);
    const authored = authoredScenes.get(expected.name);
    const paletteFamily = typeof authored?.paletteFamilyID === "string"
      ? paletteFamilies.get(authored.paletteFamilyID)
      : null;
    const backgroundless = EXEMPLO_BACKGROUNDLESS_SCENES.includes(expected.name);
    const explicitActorBinding = EXEMPLO_EXPLICIT_ACTOR_BINDING_SCENES.includes(expected.name);
    const actorPalette = explicitActorBinding
      ? (result?.actorFidelity?.actors ?? []).flatMap((actor) => Array.isArray(actor?.palette) ? actor.palette : [])
      : [];
    const backgroundPalette = paletteFamily?.background ?? result?.backgroundFidelity?.palette;
    const objectPalette = paletteFamily?.objects
      ?? (explicitActorBinding ? actorPalette : result?.playerFidelity?.palette);
    const relationship = visualPaletteRelationship(backgroundPalette, objectPalette);
    const low = visualHistogramPercentile(result?.frame?.colorHistogram, 0.01);
    const high = visualHistogramPercentile(result?.frame?.colorHistogram, 0.99);
    const contrastSpan = low === null || high === null ? 0 : high - low;
    const minimumColors = EXEMPLO_RICH_SPRITE_LOW_COLOR_SCENES.has(expected.name) ? 10 : 6;
    const uniqueColorCount = Number(result?.frame?.uniqueColorCount ?? 0);
    const requiresPlayerPalette = EXEMPLO_PLAYER_RUNTIMES.has(expected.runtime)
      && !EXEMPLO_PLAYERLESS_SCENES.includes(expected.name)
      && !explicitActorBinding
      && result?.playerFidelity?.checks?.firstPersonRuntime !== true;
    const playerContrastCompensation = requiresPlayerPalette
      && relationship.ok
      && relationship.farthestDistance >= 0.5
      && contrastSpan >= 0.2;
    const checks = {
      geometry: result?.backgroundFidelity?.checks?.dimensions === true
        && result?.displayFidelity?.ok === true
        && Number(result?.frame?.pixelCount) === GBA_FRAMEBUFFER_WIDTH * GBA_FRAMEBUFFER_HEIGHT,
      colorCount: backgroundless || (uniqueColorCount >= minimumColors && uniqueColorCount <= 256),
      contrast: backgroundless || contrastSpan >= 0.3 || playerContrastCompensation,
      paletteCoherence: backgroundless
        || (result?.paletteFidelity?.ok === true
          && (!requiresPlayerPalette || relationship.ok))
    };
    const sceneIssues = [];
    if (!checks.geometry) sceneIssues.push("geometria");
    if (!checks.colorCount) sceneIssues.push("quantidade de cores");
    if (!checks.contrast) sceneIssues.push("contraste");
    if (!checks.paletteCoherence) sceneIssues.push("coerencia BG/OBJ");
    if (sceneIssues.length > 0) issues.push(`${expected.name}: gate visual falhou em ${sceneIssues.join(", ")}.`);
    return {
      checks,
      contrastSpan,
      minimumColors,
      name: expected.name,
      ok: sceneIssues.length === 0,
      paletteFamilyID: paletteFamily?.id ?? null,
      paletteRelationship: relationship,
      playerContrastCompensation,
      uniqueColorCount
    };
  });
  const passed = scenes.filter((scene) => scene.ok).length;
  return {
    counts: { expected: expectedScenes.length, passed, failed: expectedScenes.length - passed },
    issues,
    ok: issues.length === 0,
    scenes
  };
}

export function auditExemploScenePlaytest(project, results, thresholds = {}) {
  const expectedScenes = exemploScenePlaytestPlan(project);
  const resultList = Array.isArray(results) ? results : [];
  const limits = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const resultsByName = new Map(resultList.map((result) => [result?.name, result]));
  const authoredScenes = new Map(
    (Array.isArray(project?.scenas) ? project.scenas : []).map((scene) => [scene?.name, scene])
  );
  const visualGate = auditExemploVisualQualityGate(project, resultList);
  const visualScenesByName = new Map(visualGate.scenes.map((scene) => [scene.name, scene]));
  const issues = [];
  let passed = 0;

  const resultCounts = new Map();
  for (const result of resultList) {
    if (typeof result?.name !== "string") continue;
    resultCounts.set(result.name, (resultCounts.get(result.name) ?? 0) + 1);
  }
  for (const [name, count] of resultCounts) {
    if (count > 1) issues.push(`${name}: resultado de playtest duplicado.`);
  }

  for (const expected of expectedScenes) {
    const result = resultsByName.get(expected.name);
    const authored = authoredScenes.get(expected.name);
    const sceneIssues = [];
    const visualScene = visualScenesByName.get(expected.name);
    if (visualScene?.ok !== true) {
      const failedChecks = Object.entries(visualScene?.checks ?? {})
        .filter(([, ok]) => ok !== true)
        .map(([name]) => name)
        .join(", ");
      sceneIssues.push(`${expected.name}: gate visual falhou${failedChecks ? ` em ${failedChecks}` : ""}.`);
    }
    if (!result) {
      sceneIssues.push(`${expected.name}: resultado de playtest ausente.`);
    } else {
      if (result.runtime !== expected.runtime) {
        sceneIssues.push(`${expected.name}: runtime esperado ${expected.runtime}, recebido ${String(result.runtime)}.`);
      }
      if (!Number.isFinite(result.romBytes) || result.romBytes <= 0) {
        sceneIssues.push(`${expected.name}: ROM valida nao foi aberta.`);
      }
      if (result.frame?.meaningful !== true) {
        sceneIssues.push(`${expected.name}: frame significativo nao foi confirmado.`);
      }
      if (result.launchContract?.startScene !== expected.name || result.launchContract?.startSceneType !== expected.runtime) {
        sceneIssues.push(`${expected.name}: contrato de inicializacao nao preservou cena e runtime ${expected.runtime}.`);
      }
      if (!Number.isFinite(result.runtimeState?.frame) || result.runtimeState.frame <= 0) {
        sceneIssues.push(`${expected.name}: runtime nativo nao avancou frames.`);
      }
      if (!Number.isFinite(result.audio?.emittedAudioFrames) || result.audio.emittedAudioFrames <= 0) {
        sceneIssues.push(`${expected.name}: pipeline de audio nao emitiu frames.`);
      }
      if (Number(result.audio?.audioUnderrunCount ?? 0) > 0) {
        sceneIssues.push(`${expected.name}: Player registrou underrun no fluxo PCM.`);
      }
      if (EXEMPLO_NON_SILENT_AUDIO_SCENES.includes(expected.name)
        && (!Number.isFinite(result.audio?.emittedNonSilentSamples) || result.audio.emittedNonSilentSamples <= 0)) {
        sceneIssues.push(`${expected.name}: musica esperada produziu PCM silencioso.`);
      }

      if (EXEMPLO_RGB555_SCENE_THRESHOLDS[expected.name] !== undefined
        && (result.colorFidelity?.audited !== true || result.colorFidelity?.ok !== true)) {
        sceneIssues.push(`${expected.name}: fidelidade RGB555 do framebuffer nao foi comprovada.`);
      }
      if (result.backgroundFidelity?.audited !== true || result.backgroundFidelity?.ok !== true) {
        sceneIssues.push(`${expected.name}: cadeia background PNG para tilemap RGB555 e framebuffer nao foi comprovada.`);
      }
      if (result.actorFidelity?.audited !== true || result.actorFidelity?.ok !== true) {
        sceneIssues.push(`${expected.name}: fidelidade individual dos atores nao foi comprovada.`);
      }
      if (result.temporalVisualFidelity?.ok !== true) {
        sceneIssues.push(`${expected.name}: estabilidade temporal de background e atores nao foi comprovada.`);
      }
      if (EXEMPLO_EXACT_BACKGROUND_FRAMEBUFFER_SCENES.includes(expected.name)
        && (result.backgroundFidelity?.framebufferPixels?.audited !== true
          || result.backgroundFidelity?.framebufferPixels?.ok !== true)) {
        sceneIssues.push(`${expected.name}: pixels do background nao correspondem exatamente ao PNG fora das areas de HUD e OAM.`);
      }
      const titleOverlayAssetName = authored?.runtime?.config?.titleOverlayAssetName;
      if (typeof titleOverlayAssetName === "string" && titleOverlayAssetName.length > 0
        && (result.titleOverlayFidelity?.audited !== true || result.titleOverlayFidelity?.ok !== true)) {
        sceneIssues.push(`${expected.name}: cadeia RGB555 e composicao do overlay do titulo nao foram comprovadas.`);
      }
      if (!EXEMPLO_BACKGROUNDLESS_SCENES.includes(expected.name)
        && (result.paletteFidelity?.audited !== true || result.paletteFidelity?.ok !== true)) {
        sceneIssues.push(`${expected.name}: paletas RGB555 exportadas nao correspondem integralmente ao framebuffer.`);
      }
      if (result.displayFidelity?.audited !== true || result.displayFidelity?.ok !== true) {
        sceneIssues.push(`${expected.name}: framebuffer 240x160 nao foi apresentado em escala inteira nearest-neighbor.`);
      }
      if (!EXEMPLO_EXPLICIT_ACTOR_BINDING_SCENES.includes(expected.name)
        && EXEMPLO_PLAYER_RUNTIMES.has(expected.runtime)
        && !EXEMPLO_PLAYERLESS_SCENES.includes(expected.name)
        && (result.playerFidelity?.audited !== true || result.playerFidelity?.ok !== true)) {
        sceneIssues.push(`${expected.name}: player padrao ${expected.runtime} nao corresponde ao PNG e ao asset RGB555 exportado.`);
      }
      if (!EXEMPLO_EXPLICIT_ACTOR_BINDING_SCENES.includes(expected.name)
        && EXEMPLO_PLAYER_FRAMEBUFFER_SCENES.includes(expected.name)
        && (result.playerFidelity?.framebufferRequired !== true
          || result.playerFidelity?.framebuffer?.ok !== true)) {
        sceneIssues.push(`${expected.name}: player visivel no framebuffer nao foi comprovado.`);
      }
      if (!EXEMPLO_EXPLICIT_ACTOR_BINDING_SCENES.includes(expected.name)
        && EXEMPLO_EXACT_PLAYER_FRAMEBUFFER_SCENES.includes(expected.name)
        && (result.playerFidelity?.framebufferPixels?.audited !== true
          || result.playerFidelity?.framebufferPixels?.ok !== true)) {
        sceneIssues.push(`${expected.name}: pixels opacos do player nao correspondem exatamente ao PNG na ROM.`);
      }

      if (expected.name === EXEMPLO_RGB555_TRANSITION.from
        && (result.transitionFidelity?.audited !== true
          || result.transitionFidelity?.ok !== true
          || result.transitionFidelity?.targetScene !== EXEMPLO_RGB555_TRANSITION.to)) {
        sceneIssues.push(`${expected.name}: transicao de paleta para ${EXEMPLO_RGB555_TRANSITION.to} nao foi comprovada.`);
      }

      const cadence = result.performance ?? {};
      const cadenceHealthy = Number.isFinite(cadence.emulationFps)
        && cadence.emulationFps >= limits.minEmulationFps
        && Number.isFinite(cadence.presentationFps)
        && cadence.presentationFps >= limits.minPresentationFps
        && Number.isFinite(cadence.droppedFrameRatio)
        && cadence.droppedFrameRatio <= limits.maxDroppedFrameRatio;
      if (!cadenceHealthy) {
        sceneIssues.push(`${expected.name}: cadencia do Player fora dos limites esperados.`);
      }
    }

    if (sceneIssues.length === 0) {
      passed += 1;
    } else {
      issues.push(...sceneIssues);
    }
  }

  const unexpectedNames = resultList
    .map((result) => result?.name)
    .filter((name) => typeof name === "string" && !expectedScenes.some((scene) => scene.name === name));
  for (const name of unexpectedNames) {
    issues.push(`${name}: resultado nao pertence ao template GBA Studio Exemplo.`);
  }

  return {
    ok: issues.length === 0,
    counts: {
      expected: expectedScenes.length,
      passed,
      failed: expectedScenes.length - passed
    },
    issues,
    thresholds: limits,
    visualGate
  };
}

export function consolidateExemploScenePlaytestRuns(project, runs, options = {}) {
  const runList = Array.isArray(runs) ? runs : [];
  const results = runList
    .filter((run) => run?.ok === true && run.result)
    .map((run) => run.result);
  const executionIssues = runList
    .filter((run) => run?.ok !== true)
    .map((run) => `${String(run?.sceneName ?? "cena desconhecida")}: ${String(run?.error ?? "processo isolado falhou")}`);
  const auditPlan = typeof options?.plan === "function" ? options.plan : exemploScenePlaytestPlan;
  const audit = typeof options?.audit === "function"
    ? options.audit(project, results)
    : auditExemploScenePlaytest(project, results);
  return {
    audit,
    executionIssues,
    ok: audit.ok && executionIssues.length === 0,
    results,
    runs: runList,
    sceneCount: auditPlan(project).length
  };
}

export function shouldRetryIsolatedSceneRun(run, attempt, maxAttempts = 2) {
  if (!Number.isInteger(attempt) || attempt >= maxAttempts) return false;
  const diagnostic = [run?.error, run?.stderr, run?.stdout]
    .filter(Boolean)
    .join("\n");
  return /Execution context was destroyed|Target closed|Session closed|Cannot find context|Telemetria de cadencia insuficiente|cadencia do Player fora|instabilidade visual temporal|nao produziu frame\/audio\/runtime/i.test(diagnostic);
}

export function reusableExemploScenePlaytestRuns(project, runs, options = {}) {
  const scenePlan = typeof options?.plan === "function" ? options.plan : exemploScenePlaytestPlan;
  const expectedNames = new Set(scenePlan(project).map((scene) => scene.name));
  const reusableByName = new Map();
  for (const run of Array.isArray(runs) ? runs : []) {
    const name = run?.sceneName;
    if (run?.ok === true && run.result?.name === name && expectedNames.has(name) && !reusableByName.has(name)) {
      reusableByName.set(name, run);
    }
  }
  return scenePlan(project)
    .map((scene) => reusableByName.get(scene.name))
    .filter(Boolean);
}
