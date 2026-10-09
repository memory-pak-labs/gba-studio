import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expandCompactSequence } from "./exemplo-template-audit.mjs";
import { EXEMPLO_GB_STUDIO_SCENE_TYPES } from "./exemplo-gba-scene-types.mjs";
import {
  VERTICE_CAMPAIGN_SCENES,
  VERTICE_SCENE_PACKAGES
} from "./vertice-showcase-contract.mjs";

export const EXEMPLO_SCENE_BATCHES = Object.freeze([
  Object.freeze({
    id: "startup-title",
    label: "Startup e entrada",
    priority: "P0",
    scenes: Object.freeze([
      "logo",
      "abertura",
      "titulo",
      "escolha_genero",
      "nome_jogador"
    ]),
    focus: "boot, navegação, seleção de gênero e entrada do nome"
  }),
  Object.freeze({
    id: "system-menus",
    label: "Menus de suporte",
    priority: "P1",
    scenes: Object.freeze([
      "carregar_jogo",
      "configuracoes",
      "creditos",
      "missoes",
      "inventario",
      "mapa_menu",
      "salvar",
      "menu_start"
    ]),
    focus: "navegação comum, HUD, diálogos e persistência"
  }),
  Object.freeze({
    id: "campaign-world",
    label: "Campanha e mundo",
    priority: "P1",
    scenes: Object.freeze([
      "prologo",
      "porto_lumen",
      "farol_interior",
      "penedos_vento",
      "armazem_das_mares",
      "observatorio_do_farol",
      "mercado_suspenso"
    ]),
    focus: "transições, colisão, atores, triggers e objetivos"
  }),
  Object.freeze({
    id: "dungeon-crawler",
    label: "Dungeon Crawler",
    priority: "P1",
    scenes: Object.freeze([
      "usina_submersa",
      "usina_combate",
      "usina_saida"
    ]),
    focus: "exploração, combate, inventário, portas e HUD contextual"
  }),
  Object.freeze({
    id: "showcase-runtimes",
    label: "Runtimes de demonstração",
    priority: "P2",
    scenes: Object.freeze([
      "conselho_guardia",
      "tempestade",
      "guardiao_rele",
      "arena_arrancada",
      "circuito_final"
    ]),
    focus: "visual novel, SHMUP, batalha RPG, luta e racing"
  }),
  Object.freeze({
    id: "isometric-tactical",
    label: "Isométrico tático",
    priority: "P2",
    scenes: Object.freeze(["arena_tatica"]),
    focus: "grade diagonal, turnos, alcance, ataque e ocupação"
  }),
  Object.freeze({
    id: "affine-showcase",
    label: "Apresentação Affine",
    priority: "P2",
    scenes: Object.freeze(["mapa_rota"]),
    focus: "viagem regional, aeronave com OBJ Affine, câmera e orçamento BG paginado"
  })
]);

const BATCH_BY_SCENE = new Map(
  EXEMPLO_SCENE_BATCHES.flatMap((batch) => batch.scenes.map((sceneName) => [sceneName, batch]))
);

const CAMPAIGN_BY_SCENE = new Map(VERTICE_CAMPAIGN_SCENES.map((scene) => [scene.name, scene]));

function recordsForScene(records, sceneName) {
  return (Array.isArray(records) ? records : []).filter((record) => (
    record?.roomName === sceneName || record?.sceneName === sceneName
  ));
}

function hasApprovedVisualAssets(project, scene) {
  if (!scene || !Array.isArray(project?.assets)) return false;
  const assetNames = [
    scene.backgroundAssetName,
    ...(Array.isArray(project.actors) ? project.actors : [])
      .filter((actor) => actor?.roomName === scene.name)
      .map((actor) => actor?.spriteSheet)
  ].filter((name) => typeof name === "string" && name.length > 0);
  if (assetNames.length === 0) return false;
  const assetsByName = new Map(project.assets.map((asset) => [asset?.name, asset]));
  return assetNames.every((name) => {
    const metadata = assetsByName.get(name)?.metadata;
    return metadata?.reviewStatus === "approved" && metadata?.visualStatus === "approved";
  });
}

function hasExpectedCollisionMap(scene) {
  const expectedCells = Number(scene?.width) * Number(scene?.height);
  const collisionTypes = expandCompactSequence(scene?.collisionTypes);
  return Number.isInteger(expectedCells) && expectedCells > 0 && collisionTypes.length === expectedCells;
}

function sceneChecks(scene, project, expectedType) {
  const eventNames = new Set((Array.isArray(project?.events) ? project.events : []).map((event) => event?.name));
  const onInit = scene?.eventBindings?.onInit ?? scene?.onEnterEventName;
  const supportOverlay = scene?.sceneType === "menu" && scene?.runtime?.config?.role !== "title";
  const presentationScene = scene?.name === "logo" || scene?.name === "abertura";
  const affineShowcase = scene?.name === "mapa_rota" && scene?.runtime?.config?.profile === "route-map-affine-v2-approved";
  const backgroundConfigured = typeof scene?.backgroundAssetName === "string" && scene.backgroundAssetName.length > 0;
  const affineAssetConfigured = typeof scene?.runtime?.config?.affine?.assetId === "string"
    && scene.runtime.config.affine.assetId.length > 0;
  const briefing = scene?.campaign ?? scene?.supportBriefing;
  const hasBriefing = presentationScene || supportOverlay || Boolean(
    briefing?.objective
      && briefing?.controls
      && briefing?.success
      && briefing?.failureRecovery
  );

  return [
    ["tipo da cena", scene?.sceneType === expectedType && scene?.runtime?.type === expectedType],
    ["background configurado", backgroundConfigured || (affineShowcase && affineAssetConfigured)],
    ["evento de entrada", typeof onInit === "string" && eventNames.has(onInit)],
    ["mapa de colisão", hasExpectedCollisionMap(scene)],
    ["briefing funcional", hasBriefing]
  ];
}

export function combineExemploScenePlaytestEvidence(sceneEvidence, interfaceEvidence) {
  const entries = [sceneEvidence, interfaceEvidence]
    .filter((evidence) => evidence && typeof evidence === "object");
  if (entries.length === 0) return null;

  const results = [];
  const resultNames = new Set();
  const issues = [];
  const executionIssues = [];
  let expected = 0;
  let passed = 0;

  for (const evidence of entries) {
    for (const result of Array.isArray(evidence.results) ? evidence.results : []) {
      if (typeof result?.name !== "string" || resultNames.has(result.name)) continue;
      resultNames.add(result.name);
      results.push(result);
    }
    const audit = evidence.audit && typeof evidence.audit === "object" ? evidence.audit : {};
    expected += Number(audit.counts?.expected ?? 0);
    passed += Number(audit.counts?.passed ?? 0);
    issues.push(...(Array.isArray(audit.issues) ? audit.issues : []));
    executionIssues.push(...(Array.isArray(evidence.executionIssues) ? evidence.executionIssues : []));
  }

  return {
    audit: {
      ok: entries.every((evidence) => evidence.audit?.ok === true),
      counts: { expected, passed, failed: Math.max(0, expected - passed) },
      issues
    },
    complete: entries.every((evidence) => evidence.complete !== false),
    executionIssues,
    ok: entries.every((evidence) => evidence.ok !== false)
      && issues.length === 0
      && executionIssues.length === 0,
    results
  };
}

function nextActionForScene(sceneName, sceneType) {
  if (sceneName === "logo") return "confirmar boot e avanço para a Title Screen";
  if (sceneName === "titulo") return "confirmar Play, troca de frames e entrada no menu";
  if (sceneName === "escolha_genero") return "confirmar seleção e transição para nome";
  if (sceneName === "nome_jogador") return "confirmar entrada textual e persistência";
  if (["armazem_das_mares", "observatorio_do_farol"].includes(sceneName)) {
    return "validar Editor, Play, hotspots e saída da campanha";
  }
  if (sceneType === "dungeonCrawler") return "validar o lote Dungeon Crawler como sequência única";
  if (sceneType === "menu") return "validar navegação e HUD no lote de menus";
  return "validar runtime e transição no lote correspondente";
}

function playtestStatusForScene(playtestEvidence, sceneName) {
  if (!playtestEvidence) return "Play/mGBA Web pendente";
  const result = (Array.isArray(playtestEvidence.results) ? playtestEvidence.results : [])
    .find((candidate) => candidate?.name === sceneName);
  if (!result) return "Play/mGBA Web não coberto";
  const issues = Array.isArray(playtestEvidence.audit?.issues) ? playtestEvidence.audit.issues : [];
  return issues.some((issue) => String(issue).startsWith(`${sceneName}:`))
    ? "Play/mGBA Web com falha"
    : "Play/mGBA Web validado";
}

function runtimeEvidenceSummary(playtestEvidence, rows) {
  if (!playtestEvidence) {
    return { status: "Play/mGBA Web pendente", sceneCount: 0 };
  }
  const sceneCount = rows.filter((row) => row.runtimeStatus === "Play/mGBA Web validado").length;
  const failed = rows.some((row) => row.runtimeStatus === "Play/mGBA Web com falha");
  const status = failed
    ? "Play/mGBA Web com falhas"
    : sceneCount === rows.length && playtestEvidence.audit?.ok === true
      ? "Play/mGBA Web validado"
      : sceneCount > 0
        ? "Play/mGBA Web com evidência parcial"
        : "Play/mGBA Web sem cenas cobertas";
  return { status, sceneCount };
}

export function buildExemploGbaSceneMatrix(project, options = {}) {
  const scenes = Array.isArray(project?.scenas) ? project.scenas : [];
  const actors = Array.isArray(project?.actors) ? project.actors : [];
  const triggers = Array.isArray(project?.triggers) ? project.triggers : [];
  const events = Array.isArray(project?.events) ? project.events : [];
  const playtestEvidence = options && typeof options === "object" ? options.playtestEvidence : null;

  const rows = scenes.map((scene) => {
    const batch = BATCH_BY_SCENE.get(scene?.name);
    const expectedType = EXEMPLO_GB_STUDIO_SCENE_TYPES[scene?.name];
    const checks = sceneChecks(scene, project, expectedType);
    const packageDefinition = VERTICE_SCENE_PACKAGES[scene?.name];
    const campaign = CAMPAIGN_BY_SCENE.get(scene?.name);

    return {
      sceneName: scene?.name ?? "",
      sceneType: scene?.sceneType ?? "unknown",
      batchID: batch?.id ?? "unassigned",
      batchLabel: batch?.label ?? "Sem lote",
      priority: batch?.priority ?? "P2",
      focus: batch?.focus ?? "classificar antes de implementar",
      actors: recordsForScene(actors, scene?.name).length,
      triggers: recordsForScene(triggers, scene?.name).length,
      events: recordsForScene(events, scene?.name).length,
      background: scene?.backgroundAssetName ?? "",
      assetRoles: packageDefinition?.assetRoles ?? Object.freeze([`${scene?.sceneType ?? "scene"}-assets`]),
      interactionRoles: packageDefinition?.interactionRoles ?? Object.freeze([`${scene?.sceneType ?? "scene"}-runtime`]),
      functionalStatus: checks.every(([, passed]) => passed) ? "estrutura pronta" : "corrigir contrato",
      functionalChecks: checks.map(([label, passed]) => ({ label, passed })),
      visualStatus: hasApprovedVisualAssets(project, scene) ? "promoção visual aprovada" : "revisão visual em lote",
      runtimeStatus: playtestStatusForScene(playtestEvidence, scene?.name),
      manualStatus: "mGBA nativo/AGB-001 pendente",
      nextAction: nextActionForScene(scene?.name, scene?.sceneType),
      objective: campaign?.objective ?? "Superfície de demonstração do editor e runtime"
    };
  });

  return {
    generatedFrom: "apps/desktop-electron/default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
    batchCount: EXEMPLO_SCENE_BATCHES.length,
    sceneCount: rows.length,
    assignedSceneCount: rows.filter((row) => row.batchID !== "unassigned").length,
    runtimeEvidence: runtimeEvidenceSummary(playtestEvidence, rows),
    rows,
    batches: EXEMPLO_SCENE_BATCHES.map((batch) => ({
      id: batch.id,
      label: batch.label,
      priority: batch.priority,
      sceneCount: batch.scenes.length,
      focus: batch.focus
    }))
  };
}

function checkMark(passed) {
  return passed ? "ok" : "pendente";
}

export function renderExemploGbaSceneMatrixMarkdown(matrix) {
  const lines = [
    "# Matriz de execução do Exemplo GBA",
    "",
    "> Documento operacional para acelerar o desenvolvimento por lotes. Ele separa a estrutura funcional, a revisão visual e a validação manual; não promove assets nem substitui o gate do template completo.",
    "",
    `- Fonte: \`${matrix.generatedFrom}\``,
    `- Cenas: ${matrix.sceneCount}`,
    `- Cenas atribuídas a lotes: ${matrix.assignedSceneCount}/${matrix.sceneCount}`,
    "- Critério de ritmo: fechar primeiro o passe funcional de cada lote; revisar arte e Play em seguida.",
    "",
    "## Lotes",
    "",
    "| Prioridade | Lote | Cenas | Foco |",
    "| --- | --- | ---: | --- |",
    ...matrix.batches.map((batch) => `| ${batch.priority} | ${batch.label} | ${batch.sceneCount} | ${batch.focus} |`),
    "",
    "## Cenas",
    "",
    "| Prioridade | Lote | Cena | Tipo | Atores | Triggers | Eventos | Estrutura | Visual | Runtime | Manual |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |",
    ...matrix.rows.map((row) => (
      `| ${row.priority} | ${row.batchLabel} | \`${row.sceneName}\` | ${row.sceneType} | ${row.actors} | ${row.triggers} | ${row.events} | ${row.functionalStatus} | ${row.visualStatus} | ${row.runtimeStatus} | ${row.manualStatus} |`
    )),
    "",
    "## Próxima ação por cena",
    "",
    ...matrix.rows.map((row) => `- \`${row.sceneName}\`: ${row.nextAction}.`),
    "",
    "## Regra de aprovação",
    "",
    "1. Estrutura funcional: cena, runtime, background, evento de entrada, colisão e briefing resolvidos.",
    "2. Visual: assets revisados em lote e aprovados explicitamente antes da promoção ao template.",
    "3. Runtime: `Runtime` registra o Play/mGBA Web quando há evidência; `Manual` mantém separada a validação do mGBA nativo e do AGB-001.",
    "4. Fechamento: somente depois de todos os lotes, executar `npm run gate:complete-project`."
  ];
  return `${lines.join("\n")}\n`;
}

function readCanonicalProject() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const projectPath = path.resolve(scriptDirectory, "../default-assets/templates/exemplo-gba/exemplo-gba.gba-project");
  return JSON.parse(readFileSync(projectPath, "utf8"));
}

function readLatestPlaytestEvidence() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const evidenceRoot = path.resolve(scriptDirectory, "../artifacts/exemplo-scene-playtest/latest");
  const readEvidence = (filename) => {
    try {
      return JSON.parse(readFileSync(path.join(evidenceRoot, filename), "utf8"));
    } catch {
      return null;
    }
  };
  const sceneEvidence = readEvidence("exemplo_scene_playtest_evidence.json");
  const interfaceEvidence = readEvidence("exemplo_interface_scene_playtest_evidence.json");
  const value = combineExemploScenePlaytestEvidence(sceneEvidence, interfaceEvidence);
  if (!value) return null;
  return {
    path: [sceneEvidence ? "exemplo_scene_playtest_evidence.json" : null, interfaceEvidence ? "exemplo_interface_scene_playtest_evidence.json" : null]
      .filter(Boolean)
      .map((filename) => path.join(evidenceRoot, filename))
      .join(", "),
    value
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const playtestEvidence = readLatestPlaytestEvidence();
  const matrix = buildExemploGbaSceneMatrix(readCanonicalProject(), {
    playtestEvidence: playtestEvidence?.value ?? null
  });
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(matrix, null, 2)}\n`);
  } else {
    process.stdout.write(renderExemploGbaSceneMatrixMarkdown(matrix));
  }
}
