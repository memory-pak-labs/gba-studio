#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCanonicalP0Evidence } from "./audit-functional-parity.mjs";
import { assertCanonicalP0Source } from "./p0-source-catalog.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const artifactsRoot = path.join(appRoot, "artifacts");
const outputDir = path.join(artifactsRoot, "real-project-readiness", "latest");
const outputJsonPath = path.join(outputDir, "real_project_readiness.json");
const outputMarkdownPath = path.join(outputDir, "real_project_readiness.md");
const canonicalP0Source = assertCanonicalP0Source(appRoot);

const statuses = {
  ready: "pronto para projeto real",
  limited: "funcional mas limitado",
  visual: "visual apenas",
  missing: "ausente",
  blocker: "bloqueador"
};

const focusOrder = [
  "Eventos",
  "Sprites / Animador",
  "Audio",
  "Rooms",
  "Build ROM"
];

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return undefined;
  return JSON.parse(await readFile(filePath, "utf8"));
}

function featureSet(evidence) {
  return new Set(Array.isArray(evidence?.features) ? evidence.features : []);
}

function checkedSet(evidence) {
  return new Set(Array.isArray(evidence?.checked) ? evidence.checked : []);
}

function sampleKindSet(evidence) {
  return new Set(Array.isArray(evidence?.samples) ? evidence.samples.map((sample) => sample.kind).filter(Boolean) : []);
}

function hasFeatures(evidence, features) {
  const available = featureSet(evidence);
  return evidence?.ok === true && features.every((feature) => available.has(feature));
}

function hasChecks(evidence, checks) {
  const available = checkedSet(evidence);
  return evidence?.ok === true && checks.every((check) => available.has(check));
}

function hasAppBaseProject(evidence) {
  const sampleKinds = sampleKindSet(evidence);
  return evidence?.ok === true && sampleKinds.has("app-base");
}

function hasRealProjectEvidence(evidence) {
  const sampleKinds = sampleKindSet(evidence);
  return evidence?.ok === true && sampleKinds.has("real");
}

function hasEventsRuntimeExportEvidence(evidence) {
  const coveredCommands = new Set(Array.isArray(evidence?.coveredCommands) ? evidence.coveredCommands : []);
  const requiredCommands = [
    "play_music",
    "play_sfx",
    "show_dialogue",
    "show_choice",
    "change_scene",
    "call_event",
    "set_variable",
    "add_variable",
    "multiply_variable",
    "set_flag",
    "add_item",
    "modify_wallet",
    "set_equipped_item"
  ];
  return Boolean(
    evidence?.ok === true &&
      evidence.previewRuntimeVerified === true &&
      evidence.engineContractVerified === true &&
      evidence.engineHeaderVerified === true &&
      evidence.generatedRuntimeVerified === true &&
      requiredCommands.every((command) => coveredCommands.has(command))
  );
}

function hasSpritesRuntimeExportEvidence(evidence) {
  const coveredFlow = new Set(Array.isArray(evidence?.coveredFlow) ? evidence.coveredFlow : []);
  const requiredFlow = [
    "reference-import",
    "sprite-asset",
    "metasprite-frame",
    "state-direction",
    "room-actor",
    "preview-player",
    "engine-contract",
    "engine-header",
    "generated-runtime"
  ];
  return Boolean(
    evidence?.ok === true &&
      evidence.workspaceVerified === true &&
      evidence.previewRuntimeVerified === true &&
      evidence.engineContractVerified === true &&
      evidence.engineHeaderVerified === true &&
      evidence.generatedRuntimeVerified === true &&
      requiredFlow.every((flow) => coveredFlow.has(flow))
  );
}

function hasAudioRuntimeExportEvidence(evidence) {
  const coveredFlow = new Set(Array.isArray(evidence?.coveredFlow) ? evidence.coveredFlow : []);
  const requiredFlow = [
    "music-item",
    "sfx-item",
    "tracker-pattern",
    "pattern-sequence",
    "channel-notes",
    "preview-audio",
    "event-audio",
    "engine-contract",
    "engine-header",
    "generated-runtime"
  ];
  return Boolean(
    evidence?.ok === true &&
      evidence.workspaceVerified === true &&
      evidence.previewRuntimeVerified === true &&
      evidence.engineContractVerified === true &&
      evidence.engineHeaderVerified === true &&
      evidence.generatedRuntimeVerified === true &&
      requiredFlow.every((flow) => coveredFlow.has(flow))
  );
}

function hasRoomsRuntimeExportEvidence(evidence) {
  const coveredFlow = new Set(Array.isArray(evidence?.coveredFlow) ? evidence.coveredFlow : []);
  const requiredFlow = [
    "multi-room",
    "dense-tilemap",
    "collision-map",
    "actors",
    "triggers",
    "connections",
    "preview-rooms",
    "engine-contract",
    "engine-header",
    "generated-runtime",
    "save-reopen"
  ];
  return Boolean(
    evidence?.ok === true &&
      evidence.workspaceVerified === true &&
      evidence.previewRuntimeVerified === true &&
      evidence.engineContractVerified === true &&
      evidence.engineHeaderVerified === true &&
      evidence.generatedRuntimeVerified === true &&
      evidence.persistenceVerified === true &&
      requiredFlow.every((flow) => coveredFlow.has(flow))
  );
}

function hasEngineRomEvidence(evidence) {
  const hasNativeVisualRuntime = evidence?.nativeVisualRuntimeVerified === true
    || Array.isArray(evidence?.nativeVisualRuntimeFeatures);
  return Boolean(
    evidence?.ok === true &&
      evidence.romBuildVerified === true &&
      hasNativeVisualRuntime &&
      evidence.mgbaCheckOnlyPassed === true
  );
}

function item(area, status, blocking, evidence, missing, nextStep) {
  return { area, status, blocking, evidence, missing, nextStep };
}

function statusFromSurface(functional, visual) {
  if (functional) return statuses.limited;
  if (visual) return statuses.visual;
  return statuses.missing;
}

export function createRealProjectReadinessReport(evidence = {}) {
  const functionalPlaytest = normalizeCanonicalP0Evidence(evidence.canonicalP0) ?? evidence.functionalPlaytest;
  const appBase = hasAppBaseProject(evidence.projectValidation);
  const realSamples = hasRealProjectEvidence(evidence.projectValidation);
  const saveReady = Boolean(
    appBase &&
      realSamples &&
      functionalPlaytest?.saveReopenVerified === true &&
      evidence.projectIOP0?.ok === true
  );
  const filesFunctional = hasFeatures(functionalPlaytest, ["files-assets", "sprite", "audio", "save-reopen"]);
  const roomsFunctional = hasFeatures(functionalPlaytest, ["room", "tilemap", "collision", "actor", "trigger", "save-reopen"]);
  const spritesFunctional = hasFeatures(functionalPlaytest, ["sprite", "files-assets", "save-reopen", "engine-export"]);
  const eventsFunctional = hasFeatures(functionalPlaytest, ["event", "dialogue", "audio", "save-reopen", "engine-export"]);
  const eventsRuntimeExportReady = hasEventsRuntimeExportEvidence(evidence.eventsRuntimeExport);
  const spritesRuntimeExportReady = hasSpritesRuntimeExportEvidence(evidence.spritesRuntimeExport);
  const audioRuntimeExportReady = hasAudioRuntimeExportEvidence(evidence.audioRuntimeExport);
  const roomsRuntimeExportReady = hasRoomsRuntimeExportEvidence(evidence.roomsRuntimeExport);
  const dialoguesFunctional = hasFeatures(functionalPlaytest, ["dialogue", "event", "save-reopen"]);
  const audioFunctional = hasFeatures(functionalPlaytest, ["audio", "event", "save-reopen", "engine-export"]);
  const settingsFunctional = functionalPlaytest?.settingsApplied === true;
  const exportFunctional = Boolean(
    functionalPlaytest?.engineExportVerified === true &&
      hasChecks(evidence.uiP0, ["engine-export-authored-contract", "engine-project-export"])
  );
  const engineRomReady = hasEngineRomEvidence(evidence.engineRom);
  const packageFunctional = evidence.bundle?.ok === true;

  const items = [
    item(
      "Arquivos",
      filesFunctional && hasChecks(evidence.uiP0, ["workspace-arquivos", "workspace-arquivos-validate-library"])
        ? statuses.limited
        : statusFromSurface(filesFunctional, hasChecks(evidence.uiP0, ["workspace-arquivos"])),
      false,
      "Importacao, organizacao e uso por workspace ja aparecem nos smokes, mas ainda falta provar pipeline amplo de assets reais e validacao de hardware.",
      ["Validar imagens, tilesets, sprites, audio e UI de dialogo em um projeto autoral maior."],
      "Expandir o projeto real com assets externos variados e checar uso em editor, sprites, audio, dialogos e export."
    ),
    item(
      "Rooms",
      roomsRuntimeExportReady
        ? statuses.limited
        : roomsFunctional ? statuses.limited : statusFromSurface(false, hasChecks(evidence.uiP0, ["workspace-rooms"])),
      !roomsRuntimeExportReady,
      roomsRuntimeExportReady
        ? "Rooms tem evidencia dedicada para multiplas rooms, tilemap denso, colisao, atores, triggers, conexoes, contrato de export, runtime C++ gerado e salvar/reabrir."
        : "Rooms tem autoria P0, tile/collision paint, atores, triggers e conexoes, mas ainda precisa cobrir edicao densa de projeto real.",
      roomsRuntimeExportReady
        ? ["Equivalencia ROM observavel", "stress com tilesets autorais maiores", "camadas adicionais"]
        : ["Stress de mapa maior", "camadas/tilesets reais", "conexoes e entidades em quantidade", "equivalencia no Play da ROM"],
      roomsRuntimeExportReady
        ? "Usar o projeto real/base para validar o comportamento de rooms densas no Play da ROM."
        : "Validar no projeto P0 canonico um cenario com multiplas rooms, tilemap, colisao, atores, triggers e conexoes persistidas."
    ),
    item(
      "Sprites / Animador",
      spritesRuntimeExportReady
        ? statuses.limited
        : spritesFunctional ? statuses.blocker : statusFromSurface(false, hasChecks(evidence.uiP0, ["workspace-sprites"])),
      !spritesRuntimeExportReady,
      spritesRuntimeExportReady
        ? "Sprites tem evidencia dedicada para importacao/referencia, sheet, metasprite/frame, estado/direcao, ator na Room, contrato de export e runtime C++ gerado."
        : "O animador ja edita frames/metasprites e prova sprite no P0, mas ainda falta fluxo completo para sprites autorais de projeto real.",
      spritesRuntimeExportReady
        ? ["Validacao OAM/VRAM", "ROM observavel", "stress com sheets autorais maiores"]
        : ["Importacao e recorte robustos", "estados/direcoes completos", "validacao OAM/VRAM", "uso em room e ROM"],
      spritesRuntimeExportReady
        ? "Usar o projeto real/base para estressar sheets maiores, limites de hardware e o Play da ROM."
        : "Fechar fluxo de PNG/sheet -> frames -> estados/direcoes -> ator na room -> Play da ROM."
    ),
    item(
      "Eventos",
      eventsRuntimeExportReady
        ? statuses.limited
        : eventsFunctional ? statuses.blocker : statusFromSurface(false, hasChecks(evidence.uiP0, ["workspace-eventos"])),
      !eventsRuntimeExportReady,
      eventsRuntimeExportReady
        ? "Eventos ja tem evidencia dedicada para dialogo, escolha, audio, troca de room e estado no contrato de export e runtime C++ gerado."
        : "Eventos ja criam passos e comandos P0, mas o projeto real precisa de cobertura maior de comandos, validacao contextual e runtime/export alinhados.",
      eventsRuntimeExportReady
        ? ["Validacao contextual visual", "bindings em projeto real maior", "playtest ROM observavel"]
        : ["Comandos restantes", "bindings visuais com atores/triggers/scenes", "variaveis/flags/inventario", "execucao na ROM"],
      eventsRuntimeExportReady
        ? "Usar o projeto real/base para estressar bindings visuais e validar a execucao observavel na ROM."
        : "Ampliar comandos suportados e provar um fluxo jogavel com dialogo, escolha, audio, troca de room e estado."
    ),
    item(
      "Dialogos",
      dialoguesFunctional && hasChecks(evidence.uiP0, ["workspace-dialogos-edit-text", "workspace-dialogos-edit-choices"])
        ? statuses.limited
        : statusFromSurface(dialoguesFunctional, hasChecks(evidence.uiP0, ["workspace-dialogos"])),
      false,
      "Dialogos tem CRUD, escolhas e uso em evento P0; ainda precisa provar variações reais de UI, retrato, sons e localizacao.",
      ["Personagens/retratos", "escolhas ramificadas", "sons e UI customizada", "textos maiores"],
      "Adicionar dialogos reais ao projeto base e validar chamada por evento no Play da ROM."
    ),
    item(
      "Audio",
      audioRuntimeExportReady
        ? statuses.limited
        : audioFunctional ? statuses.blocker : statusFromSurface(false, hasChecks(evidence.uiP0, ["workspace-audio"])),
      !audioRuntimeExportReady,
      audioRuntimeExportReady
        ? "Audio tem evidencia dedicada para musica/SFX compostos, patterns, sequencia, notas por canal, contrato de export e runtime C++ gerado."
        : "Audio ja cria/edita itens e toca no P0, mas projeto real precisa provar musica/SFX autorais, tracker e export consistente.",
      audioRuntimeExportReady
        ? ["Playback audivel no hardware", "limites de canais/tempo", "ROM observavel com musica/SFX autorais maiores"]
        : ["Musica e SFX reais", "sequencia/tracker completos", "audicao no Play", "export para ROM"],
      audioRuntimeExportReady
        ? "Usar o projeto real/base para validar limites de canais, timing e playback audivel na ROM."
        : "Fechar uma musica curta e SFX real usados por cena/evento, com evidencia na ROM."
    ),
    item(
      "Settings",
      settingsFunctional && hasChecks(evidence.uiP0, ["workspace-settings-edit-title", "settings-path-validation"])
        ? statuses.limited
        : statusFromSurface(settingsFunctional, hasChecks(evidence.uiP0, ["workspace-settings"])),
      false,
      "Settings ja afeta runtime/export no P0, mas ainda precisa de presets e paths exercitados por plataforma e por projeto real.",
      ["Paths reais", "presets por tipo de jogo", "opcoes que alteram Play/export", "plataformas"],
      "Exercitar settings do projeto base e registrar quais campos mudam Play, export e build."
    ),
    item(
      "Export Engine Pack",
      exportFunctional ? statuses.limited : statusFromSurface(false, hasChecks(evidence.uiP0, ["engine-project-export"])),
      false,
      "Export Engine Pack ja gera contrato e pacote no fluxo atual; falta endurecer projeto autoral maior e assets variados.",
      ["Projeto maior", "assets variados", "diagnosticos de contrato", "rebuild repetido"],
      "Exportar o projeto real/base completo e tratar qualquer diagnostico como bug de contrato ou editor."
    ),
    item(
      "Build ROM",
      engineRomReady ? statuses.limited : statuses.blocker,
      !engineRomReady,
      engineRomReady
        ? "Build ROM tem evidencia do Engine Pack, runtime visual nativo (assetc) e mGBA check-only."
        : "Ainda falta evidencia de uma ROM gerada a partir de um projeto real/base e validada pelo runtime nativo.",
      engineRomReady
        ? ["Playtest visual/manual final no mGBA", "validacao audivel", "comparacao observavel Preview/ROM em sessoes longas"]
        : ["ROM do projeto real", "mGBA check-only", "boot/cena/ator/dialogo/audio/troca de room", "checklist versionado"],
      engineRomReady
        ? "Executar playtest visual/manual da ROM Engine Pack como gate de qualidade antes de promover novas referencias."
        : "Gerar a ROM do projeto P0 canonico pelo Engine Pack e validar o checklist automatizado no mGBA."
    ),
    item(
      "Salvar / reabrir",
      saveReady ? statuses.ready : statuses.blocker,
      !saveReady,
      "Salvar/reabrir ja cobre blank, fixture, template completo e amostra real, incluindo preservacao de dados.",
      saveReady ? [] : ["Project I/O incompleto", "amostra template/real ausente"],
      "Manter como gate permanente para qualquer mudanca em schema, workspace ou persistencia."
    ),
    item(
      "Pacote .app",
      packageFunctional ? statuses.limited : statuses.missing,
      false,
      "Pacote macOS existe e valida fluxo P0; distribuicao publica ainda depende de assinatura/notarizacao e smoke com projeto real completo.",
      ["Smoke do projeto real no .app", "assinatura Developer ID", "notarizacao"],
      "Rodar pacote macOS com o projeto real/base depois que as lacunas bloqueadoras ficarem verdes."
    )
  ];

  const blockingEntries = items.filter((entry) => entry.blocking === true && entry.status !== statuses.ready);
  const prioritizedNextFocus = focusOrder
    .map((area) => items.find((entry) => entry.area === area))
    .filter((entry) => entry?.blocking === true && entry.status !== statuses.ready);
  const prioritizedAreas = new Set(prioritizedNextFocus.map((entry) => entry.area));
  const nextFocus = [
    ...prioritizedNextFocus,
    ...blockingEntries.filter((entry) => !prioritizedAreas.has(entry.area))
  ];
  return {
    generatedAt: new Date().toISOString(),
    status: blockingEntries.length === 0 ? "ready" : "blocked",
    source: "current-artifacts",
    canonicalP0Source: {
      id: canonicalP0Source.id,
      role: canonicalP0Source.role,
      globalAcceptance: canonicalP0Source.globalAcceptance,
      projectPath: canonicalP0Source.projectPath,
      visualMirrorPath: canonicalP0Source.visualMirrorPath,
      acceptanceSurfaces: canonicalP0Source.acceptanceSurfaces
    },
    canonicalP0ProjectPath: canonicalP0Source.projectPath,
    canonicalP0EvidencePath: path.join(
      appRoot,
      "artifacts",
      "exemplo-template",
      "latest",
      "exemplo_template_evidence.json"
    ),
    technicalFixtureEvidencePath: path.join(
      appRoot,
      "artifacts",
      "functional-playtest",
      "latest",
      "functional_playtest_evidence.json"
    ),
    appBaseProject: path.relative(appRoot, canonicalP0Source.projectPath),
    items,
    nextFocus
  };
}

export function renderRealProjectReadinessMarkdown(report) {
  const lines = [
    "# Real Project Readiness",
    "",
    `- Gerado em: ${report.generatedAt}`,
    `- Status: ${report.status === "ready" ? "pronto para validar o projeto P0 canonico" : "bloqueado para validar o projeto P0 canonico"}`,
    `- Projeto P0 canônico: ${report.canonicalP0ProjectPath}`,
    `- Evidência do P0 canônico: ${report.canonicalP0EvidencePath}`,
    `- Diagnóstico da fixture técnica: ${report.technicalFixtureEvidencePath}`,
    "",
    "## Matriz",
    "",
    "| Area | Status | Bloqueador | Evidencia | Lacunas | Proximo passo |",
    "| --- | --- | --- | --- | --- | --- |"
  ];

  for (const entry of report.items) {
    lines.push(
      `| ${escapeMarkdown(entry.area)} | ${entry.status} | ${entry.blocking ? "sim" : "nao"} | ${escapeMarkdown(entry.evidence)} | ${escapeMarkdown(entry.missing.join("; ") || "nenhuma lacuna obrigatoria")} | ${escapeMarkdown(entry.nextStep)} |`
    );
  }

  lines.push("", "## Proximas lacunas", "");
  if (report.nextFocus.length === 0) {
    lines.push("- Nenhuma lacuna bloqueadora antes do projeto real base.");
  } else {
    report.nextFocus.forEach((entry, index) => {
      lines.push(`${index + 1}. ${entry.area}: ${entry.nextStep}`);
    });
  }

  return `${lines.join("\n")}\n`;
}

async function loadEvidence() {
  return {
    canonicalP0: await readJsonIfExists(path.join(artifactsRoot, "exemplo-template", "latest", "exemplo_template_evidence.json")),
    functionalPlaytest: await readJsonIfExists(path.join(artifactsRoot, "functional-playtest", "latest", "functional_playtest_evidence.json")),
    projectValidation: await readJsonIfExists(path.join(artifactsRoot, "project-validation", "latest", "project_validation_evidence.json")),
    projectIOP0: await readJsonIfExists(path.join(artifactsRoot, "project-io-p0", "latest", "project_io_p0_evidence.json")),
    uiP0: await readJsonIfExists(path.join(artifactsRoot, "ui-p0", "latest", "ui_p0_evidence.json")),
    eventsRuntimeExport: await readJsonIfExists(path.join(artifactsRoot, "events-runtime-export", "latest", "events_runtime_export_evidence.json")),
    spritesRuntimeExport: await readJsonIfExists(path.join(artifactsRoot, "sprites-runtime-export", "latest", "sprites_runtime_export_evidence.json")),
    audioRuntimeExport: await readJsonIfExists(path.join(artifactsRoot, "audio-runtime-export", "latest", "audio_runtime_export_evidence.json")),
    roomsRuntimeExport: await readJsonIfExists(path.join(artifactsRoot, "rooms-runtime-export", "latest", "rooms_runtime_export_evidence.json")),
    engineRom: await readJsonIfExists(path.join(artifactsRoot, "engine-rom", "latest", "engine_rom_smoke_evidence.json")),
    bundle: await readJsonIfExists(path.join(artifactsRoot, "macos-app", "latest", "bundle_evidence.json"))
  };
}

async function main() {
  const report = createRealProjectReadinessReport(await loadEvidence());
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(outputMarkdownPath, renderRealProjectReadinessMarkdown(report), "utf8");
  console.log(`Real project readiness: ${report.status}`);
  console.log(`Relatorio JSON: ${outputJsonPath}`);
  console.log(`Relatorio Markdown: ${outputMarkdownPath}`);
  if (report.status !== "ready") {
    process.exitCode = 1;
  }
}

if (process.argv[1] === scriptPath) {
  void main();
}
