#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertCanonicalP0Source } from "./p0-source-catalog.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const outputDir = path.join(appRoot, "artifacts", "functional-parity", "latest");
const outputJsonPath = path.join(outputDir, "functional_parity_audit.json");
const outputMarkdownPath = path.join(outputDir, "functional_parity_audit.md");
const strictMode = process.argv.includes("--strict");
const canonicalP0Source = assertCanonicalP0Source(appRoot);

const p0FeatureSet = [
  "project-source",
  "room",
  "tilemap",
  "collision",
  "actor",
  "trigger",
  "event",
  "dialogue",
  "sprite",
  "audio",
  "files-assets",
  "settings",
  "save-reopen",
  "engine-export",
  "gameplay-rom"
];
const p0EditorFeatureSet = p0FeatureSet.filter((feature) => feature !== "gameplay-rom");

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return undefined;
  return JSON.parse(await readFile(filePath, "utf8"));
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function featureSet(functionalPlaytest) {
  return new Set(functionalPlaytest?.features ?? []);
}

function hasFeatures(functionalPlaytest, requiredFeatures) {
  const features = featureSet(functionalPlaytest);
  return functionalPlaytest?.ok === true && requiredFeatures.every((feature) => features.has(feature));
}

function isCanonicalP0Evidence(evidence) {
  return Boolean(
    evidence?.ok === true
      && evidence?.source?.id === canonicalP0Source.id
      && evidence?.source?.role === canonicalP0Source.role
      && evidence?.source?.globalAcceptance === canonicalP0Source.globalAcceptance
  );
}

export function normalizeCanonicalP0Evidence(templateEvidence) {
  if (!isCanonicalP0Evidence(templateEvidence)) return undefined;

  const checked = new Set(Array.isArray(templateEvidence.checked) ? templateEvidence.checked : []);
  const has = (...checks) => checks.every((check) => checked.has(check));
  const projectCounts = templateEvidence.projectCounts && typeof templateEvidence.projectCounts === "object"
    ? templateEvidence.projectCounts
    : {};
  const roms = Array.isArray(templateEvidence.roms) ? templateEvidence.roms : [];
  const features = [];

  if (has("welcome-template-card", "canonical-source-catalog", "single-project-35-scenes-including-presentation-and-interface")) {
    features.push("project-source");
  }
  if (has("edit-scene", "background-layout-visible")) features.push("room", "tilemap");
  if (has("edit-collision", "all-scene-collision-grids-complete")) features.push("collision");
  if (has("edit-actor", "all-actors-resolve-authored-hitboxes")) features.push("actor");
  if (Number(projectCounts.triggers) > 0 && has("edit-actor")) features.push("trigger");
  if (has("edit-event-in-editor-inspector")) features.push("event");
  if (has("dialogues-workspace", "authored-dialogue-box-and-selector-visible")) features.push("dialogue");
  if (has("sprites-workspace", "edit-sprite")) features.push("sprite");
  if (has("audio-workspace-with-authored-music-and-sfx")) features.push("audio");
  if (has("files-workspace", "self-contained-assets")) features.push("files-assets");
  if (has("edit-and-save", "reopen-without-data-loss")) features.push("save-reopen");
  if (has("runtime-dialogue-edit-in-rom-contract") && roms.length === 1) features.push("engine-export");
  if (has("play-full-project") && roms.length === 1) features.push("gameplay-rom");
  if (has("project-health-workspace", "project-health-capabilities-and-budget")) features.push("settings");

  return {
    ok: true,
    source: templateEvidence.source,
    features,
    saveReopenVerified: has("edit-and-save", "reopen-without-data-loss"),
    engineExportVerified: has("runtime-dialogue-edit-in-rom-contract") && roms.length === 1,
    gameplayRomVerified: has("play-full-project") && roms.length === 1,
    previewPlaytestVerified: has("play-full-project"),
    appPreviewRuntimeVerified: false,
    settingsApplied: has("project-health-workspace", "project-health-capabilities-and-budget"),
    project: templateEvidence.projectCounts ?? null,
    canonicalTemplateEvidence: true
  };
}

function hasAnyFeature(functionalPlaytest, candidateFeatures) {
  const features = new Set(functionalPlaytest?.features ?? []);
  return functionalPlaytest?.ok === true && candidateFeatures.some((feature) => features.has(feature));
}

function hasRequiredP0Features(functionalPlaytest) {
  return hasFeatures(functionalPlaytest, p0FeatureSet);
}

function hasRequiredP0EditorFeatures(functionalPlaytest) {
  return hasFeatures(functionalPlaytest, p0EditorFeatureSet);
}

function hasRuntimeAuthoredRomExport(uiP0Evidence) {
  return hasUiP0Checks(uiP0Evidence, [
    "engine-export-authored-contract",
    "engine-project-export",
    "engine-rom-build-from-authored-project"
  ]);
}

function hasRealGameplayRom(engineRom, engineP0Rom, functionalPlaytest, uiP0Evidence) {
  return Boolean(
    functionalPlaytest?.gameplayRomVerified === true ||
      hasRuntimeAuthoredRomExport(uiP0Evidence) ||
      (engineP0Rom?.ok === true && engineP0Rom?.gameplayVerified === true) ||
      (engineRom?.ok === true && engineRom?.gameplayVerified === true)
  );
}

function hasP0RomBuild(engineP0Rom) {
  return engineP0Rom?.ok === true && engineP0Rom?.romBuildVerified === true;
}

function hasPlayWindow(playWindow) {
  const checks = new Set(Array.isArray(playWindow?.checked) ? playWindow.checked : []);
  return Boolean(
    playWindow?.ok === true &&
      playWindow?.canvas?.width === 240 &&
      playWindow?.canvas?.height === 160 &&
      playWindow?.input?.ok === true &&
      [
        "open-rom-player-window-ipc",
        "play-window-target",
        "mgba-direct-canvas",
        "keyboard-input"
      ].every((check) => checks.has(check))
  );
}

function hasItchExport(itchExport) {
  const checks = new Set(Array.isArray(itchExport?.checked) ? itchExport.checked : []);
  const missingFiles = Array.isArray(itchExport?.structure?.missingFiles) ? itchExport.structure.missingFiles : [];
  const forbiddenPresent = Array.isArray(itchExport?.structure?.forbiddenPresent) ? itchExport.structure.forbiddenPresent : [];
  const forbiddenTextPresent = Array.isArray(itchExport?.structure?.forbiddenTextPresent) ? itchExport.structure.forbiddenTextPresent : [];
  return Boolean(
    itchExport?.ok === true &&
      itchExport?.visual?.canvasMounted === true &&
      itchExport?.visual?.canvasWidth === 240 &&
      itchExport?.visual?.canvasHeight === 160 &&
      itchExport?.input?.ok === true &&
      missingFiles.length === 0 &&
      forbiddenPresent.length === 0 &&
      forbiddenTextPresent.length === 0 &&
      [
        "index-html-root",
        "relative-static-package",
        "rom-gba-present",
        "mgba-wasm-direct-assets",
        "mpl-license",
        "no-emulatorjs",
        "no-cdn",
        "http-static-server",
        "direct-canvas",
        "keyboard-input"
      ].every((check) => checks.has(check))
  );
}

function hasProjectPersistence(projectValidation, functionalPlaytest) {
  const sampleKinds = new Set(projectValidation?.samples?.map((sample) => sample.kind).filter(Boolean));
  return Boolean(
    functionalPlaytest?.saveReopenVerified === true ||
      (projectValidation?.ok === true && ["template", "fixture", "real"].every((kind) => sampleKinds.has(kind)))
  );
}

function hasProjectIOP0(projectIOP0) {
  const checks = new Set(Array.isArray(projectIOP0?.checks) ? projectIOP0.checks : []);
  return Boolean(
    projectIOP0?.ok === true &&
      projectIOP0.mode === "packaged-app" &&
      projectIOP0.dataMatchesAfterSaveReopen === true &&
      projectIOP0.unknownEditorStatePreserved === true &&
      projectIOP0.swiftSplitManifestRejected === true &&
      [
        "open-gba-project",
        "render-project-workspace",
        "save-as-gba-project",
        "reopen-saved-gba-project",
        "preserve-project-data",
        "reject-swift-split-project-manifest"
      ].every((check) => checks.has(check))
  );
}

function hasUiP0Checks(uiP0Evidence, requiredChecks) {
  const checks = new Set(Array.isArray(uiP0Evidence?.checked) ? uiP0Evidence.checked : []);
  return uiP0Evidence?.ok === true && requiredChecks.every((check) => checks.has(check));
}

function statusFor(passed, fallback = "parcial") {
  return passed ? "funcional" : fallback;
}

function workspaceStatus({ functional, partial, hasSurface, missing = "ausente" }) {
  if (functional) return "funcional";
  if (partial) return "parcial";
  return hasSurface ? "visual apenas" : missing;
}

function hasWorkspaceSurface(evidence, key) {
  return Boolean(evidence.workspaceSurfaces?.[key]);
}

function item(id, area, status, blocking, evidence, nextStep) {
  return {
    id,
    area,
    status,
    blocking,
    evidence,
    nextStep
  };
}

export function createFunctionalParityReport(evidence = {}) {
  const functionalPlaytest = normalizeCanonicalP0Evidence(evidence.canonicalP0) ?? evidence.functionalPlaytest;
  const hasProjectIO = hasProjectIOP0(evidence.projectIOP0);
  const hasPersistence = hasProjectIO || hasProjectPersistence(evidence.projectValidation, functionalPlaytest);
  const hasGameplayRom = hasRealGameplayRom(evidence.engineRom, evidence.engineP0Rom, functionalPlaytest, evidence.uiP0);
  const hasRuntimeAuthoredRom = hasRuntimeAuthoredRomExport(evidence.uiP0);
  const hasP0Rom = hasP0RomBuild(evidence.engineP0Rom);
  const hasP0RomRuntimeWitness = evidence.engineP0Rom?.runtimeWitnessVerified === true;
  const hasP0NativeVisualRuntime = evidence.engineP0Rom?.nativeVisualRuntimeVerified === true;
  const hasP0PlayableRuntime = evidence.engineP0Rom?.playableRuntimeVerified === true || hasP0NativeVisualRuntime;
  const hasP0RomBootVisual = evidence.engineP0Rom?.bootVisualVerified === true;
  const hasPlayWindowSmoke = hasPlayWindow(evidence.playWindow);
  const hasItchExportSmoke = hasItchExport(evidence.itchExport);
  const hasP0 =
    hasRequiredP0Features(functionalPlaytest) ||
    (hasRequiredP0EditorFeatures(functionalPlaytest) && hasGameplayRom);
  const gameplayLoopFunctional = hasP0 && hasGameplayRom;
  const settingsRuntimeFunctional = functionalPlaytest?.settingsApplied === true && hasGameplayRom;
  const hasEditorProject = hasFeatures(functionalPlaytest, [
    "project-source",
    "room",
    "tilemap",
    "collision",
    "actor",
    "trigger",
    "save-reopen",
    "engine-export"
  ]);
  const hasEvents = hasFeatures(functionalPlaytest, ["event", "save-reopen", "engine-export"]);
  const hasSprites = hasFeatures(functionalPlaytest, ["sprite", "files-assets", "save-reopen", "engine-export"]);
  const hasDialogues = hasFeatures(functionalPlaytest, ["dialogue", "event", "save-reopen", "engine-export"]);
  const hasAudio = hasFeatures(functionalPlaytest, ["audio", "event", "save-reopen", "engine-export"]);
  const hasFileAssets = hasFeatures(functionalPlaytest, [
    "files-assets",
    "sprite",
    "audio",
    "save-reopen",
    "engine-export"
  ]);
  const hasSettings = functionalPlaytest?.settingsApplied === true;
  const hasEngineExport = functionalPlaytest?.engineExportVerified === true || hasAnyFeature(functionalPlaytest, ["engine-export"]);
  const hasEditorUiActions = hasUiP0Checks(evidence.uiP0, [
    "workspace-rooms",
    "workspace-rooms-tile-paint",
    "workspace-rooms-collision-paint"
  ]);
  const hasSpriteUiActions = hasUiP0Checks(evidence.uiP0, [
    "workspace-sprites",
    "workspace-sprites-composer-add-tile",
    "workspace-sprites-composer-paint"
  ]);
  const hasEventsUiActions = hasUiP0Checks(evidence.uiP0, [
    "workspace-eventos",
    "workspace-eventos-add-step",
    "workspace-eventos-edit-step"
  ]);
  const hasDialoguesUiActions = hasUiP0Checks(evidence.uiP0, [
    "workspace-dialogos",
    "workspace-dialogos-edit-text",
    "workspace-dialogos-edit-choices"
  ]);
  const hasAudioUiActions = hasUiP0Checks(evidence.uiP0, [
    "workspace-audio",
    "workspace-audio-edit-bpm",
    "workspace-audio-edit-note"
  ]);
  const hasFilesUiActions = hasUiP0Checks(evidence.uiP0, [
    "workspace-arquivos",
    "workspace-arquivos-duplicate-asset",
    "workspace-arquivos-validate-library"
  ]);
  const hasSettingsUiActions = hasUiP0Checks(evidence.uiP0, [
    "workspace-settings",
    "workspace-settings-edit-title",
    "settings-path-validation"
  ]);
  const hasRequiredWorkspaceUiActions =
    hasEditorUiActions &&
    hasSpriteUiActions &&
    hasEventsUiActions &&
    hasDialoguesUiActions &&
    hasAudioUiActions &&
    hasFilesUiActions &&
    hasSettingsUiActions;
  const hasPackagedAppP0 = evidence.bundle?.ok === true && hasRequiredWorkspaceUiActions && hasPlayWindowSmoke;

  const items = [
    item(
      "shell-project-files",
      "Shell e arquivos de projeto",
      statusFor(hasPersistence, "parcial"),
      false,
      hasProjectIO
        ? "Project I/O P0 no .app macOS provou abrir, validar, salvar como .gba-project, reabrir, preservar dados e rejeitar manifesto split do Swift."
        : hasPersistence
        ? "Ha evidencia de criar/abrir/salvar/reabrir projetos."
        : "Persistencia ainda nao tem evidencia completa de blank, fixture e real.",
      "Manter no gate, mas nao tratar como substituto do Swift sem P0 completo."
    ),
    item(
      "editor-rooms",
      "Editor / Rooms",
      workspaceStatus({
        functional: gameplayLoopFunctional && hasEditorUiActions,
        partial: hasEditorProject || hasEditorUiActions,
        hasSurface: hasWorkspaceSurface(evidence, "editorRooms")
      }),
      true,
      gameplayLoopFunctional
        ? "P0 provou room, tilemap, colisao, ator, trigger, ROM e preview."
        : hasEditorProject
          ? hasEditorUiActions
            ? "Electron ja prova room, tilemap, colisao, ator e trigger persistidos/exportados; smoke UI P0 tambem prova pintura de tile e colisao no Editor empacotado, mas ainda sem ROM jogavel."
            : "Electron ja prova room, tilemap, colisao, ator e trigger persistidos/exportados, mas ainda sem ROM jogavel."
          : hasEditorUiActions
          ? "Smoke UI P0 prova pintura de tile e colisao no Editor empacotado, mas ainda falta persistencia/export/ROM completa desse fluxo."
          : "Falta evidencia de room, tilemap, colisao, ator e trigger em projeto criado no Electron.",
      "Continuar validando o projeto exemplo P0 com duas rooms, tilemap, colisao, ator, trigger e conexao na ROM."
    ),
    item(
      "events",
      "Eventos",
      workspaceStatus({
        functional: gameplayLoopFunctional && hasEventsUiActions,
        partial: hasEvents && hasEventsUiActions,
        hasSurface: hasWorkspaceSurface(evidence, "events")
      }),
      true,
      gameplayLoopFunctional
        ? "P0 provou evento integrado ao fluxo jogavel."
        : hasEvents && hasEventsUiActions
          ? "Eventos reais ja sao criados, editados pela UI, vinculados e exportados, mas ainda falta provar execucao na ROM."
        : hasEvents
          ? "Eventos reais existem nos dados/export, mas ainda falta smoke UI editando evento real no workspace."
        : "Falta evidencia de evento real ligado a ator/trigger/cena e exportado para runtime.",
      "Continuar validando no projeto exemplo P0 o evento de inicio/interacao/troca de cena ou dialogo na ROM."
    ),
    item(
      "sprites",
      "Sprites / Animador",
      workspaceStatus({
        functional: gameplayLoopFunctional && hasSpriteUiActions,
        partial: hasSprites || hasSpriteUiActions,
        hasSurface: hasWorkspaceSurface(evidence, "sprites")
      }),
      true,
      gameplayLoopFunctional
        ? "P0 provou sprite importado/usado em gameplay."
        : hasSprites
          ? hasSpriteUiActions
            ? "Sprite, frame e estado ja sao persistidos/exportados; smoke UI P0 tambem prova adicionar tile e pintar no canvas de montagem, mas ainda falta validar uso observavel na ROM."
            : "Sprite, frame e estado ja sao persistidos/exportados, mas ainda falta validar uso observavel na ROM."
          : hasSpriteUiActions
          ? "Smoke UI P0 prova adicionar tile e pintar no canvas de montagem de sprites, mas ainda falta validar sprite usado em room/ROM."
          : "Falta evidencia de sprite importado, recortado, animado e usado em room exportada.",
      "Continuar no projeto exemplo P0 o fluxo de PNG/sheet, frame, estado/direcao e uso no editor."
    ),
    item(
      "dialogues",
      "Dialogos",
      workspaceStatus({
        functional: gameplayLoopFunctional && hasDialoguesUiActions,
        partial: hasDialogues && hasDialoguesUiActions,
        hasSurface: hasWorkspaceSurface(evidence, "dialogues")
      }),
      true,
      gameplayLoopFunctional
        ? "P0 provou dialogo usado em gameplay."
        : hasDialogues && hasDialoguesUiActions
          ? "Dialogo ja e editado pela UI, referenciado por evento e exportado, mas ainda falta validacao visivel na ROM."
        : hasDialogues
          ? "Dialogo existe nos dados/export, mas ainda falta smoke UI alterando fala/escolhas reais no workspace."
        : "Falta evidencia de fala criada no Electron, chamada por evento e visivel na ROM.",
      "Continuar validando fala/personagem/escolha no evento do projeto exemplo P0."
    ),
    item(
      "audio",
      "Audio",
      workspaceStatus({
        functional: gameplayLoopFunctional && hasAudioUiActions,
        partial: hasAudio && hasAudioUiActions,
        hasSurface: hasWorkspaceSurface(evidence, "audio")
      }),
      true,
      gameplayLoopFunctional
        ? "P0 provou audio usado no projeto jogavel."
        : hasAudio && hasAudioUiActions
          ? "Audio/pattern ja e editado pela UI, persistido e exportado, mas ainda falta ouvir/validar na ROM."
        : hasAudio
          ? "Audio/pattern existe nos dados/export, mas ainda falta smoke UI alterando BPM/nota real no workspace."
        : "Falta evidencia de musica/SFX criado ou importado, persistido e ouvido na ROM.",
      "Continuar validando musica/SFX associados ao projeto exemplo P0 no runtime."
    ),
    item(
      "files-assets",
      "Arquivos / Assets",
      workspaceStatus({
        functional: gameplayLoopFunctional && hasFilesUiActions,
        partial: hasFileAssets && hasFilesUiActions,
        hasSurface: hasWorkspaceSurface(evidence, "filesAssets")
      }),
      true,
      gameplayLoopFunctional
        ? "P0 provou assets usados por editor/sprites/dialogos/audio."
        : hasFileAssets && hasFilesUiActions
          ? "Assets usados por tilemap, sprite, UI e audio sao manipulados pela UI e aparecem no fluxo salvo/exportado, mas ainda sem validacao visual/runtime."
        : hasFileAssets
          ? "Assets existem nos dados/export, mas ainda falta smoke UI duplicando/validando asset real no workspace."
        : "Falta evidencia de assets externos usados sem placeholders no fluxo exportado.",
      "Continuar validando os assets reais do projeto exemplo P0 em editor, sprites, dialogos e audio."
    ),
    item(
      "settings",
      "Ajustes",
      workspaceStatus({
        functional: settingsRuntimeFunctional && hasSettingsUiActions,
        partial: hasSettings && hasSettingsUiActions,
        hasSurface: hasWorkspaceSurface(evidence, "settings")
      }),
      false,
      settingsRuntimeFunctional
        ? "P0 provou settings refletidos no runtime/export da ROM."
        : hasSettings && hasSettingsUiActions
          ? "P0 alterou settings pela UI e declarou no projeto/export, mas ainda falta provar reflexo na ROM."
        : hasSettings
          ? "P0 declarou settings no projeto/export, mas ainda falta smoke UI alterando ajustes reais."
        : "Campos existem, mas ainda falta evidencia de que alteracoes afetam engine/export/ROM.",
      "Alterar settings usados pelo projeto exemplo P0 e conferir reflexo no runtime."
    ),
    item(
      "rom-export",
      "Exportacao ROM",
      statusFor(hasGameplayRom, "parcial"),
      true,
      hasGameplayRom
        ? hasRuntimeAuthoredRom
          ? "O projeto autoral foi exportado pelo Engine Pack e teve a ROM gerada pelo mesmo fluxo usado pelo Play."
          : "Ha evidencia explicita de gameplay ROM verificado."
        : hasP0PlayableRuntime
          ? hasP0NativeVisualRuntime
            ? "ROM da fixture técnica P0 foi gerada via assetc com tilemap e sprites reais no runtime nativo, passou no smoke mGBA check-only e ainda falta playtest visual/manual aprovado."
            : "ROM da fixture técnica P0 foi gerada, passou no smoke mGBA check-only e exporta micro-runtime jogavel com input, colisao, dialogo, trigger, troca de room e renderizacao de tiles, mas ainda falta playtest visual/manual aprovado."
        : hasP0RomRuntimeWitness
          ? "ROM da fixture técnica P0 foi gerada, passou no smoke mGBA check-only e exporta runtime witness para boot, dialogo, ator, trigger e troca de room, mas ainda falta gameplay observavel."
        : hasP0RomBootVisual
          ? "ROM da fixture técnica P0 foi gerada, abriu no mGBA e tem boot visual registrado, mas ainda falta gameplay observavel."
        : hasP0Rom
          ? "ROM da fixture técnica P0 foi gerada e passou no smoke mGBA check-only, mas ainda falta gameplay observavel."
        : hasEngineExport
          ? "Engine export do P0 foi gerado, mas ainda falta .gba jogavel verificado."
          : "Smoke de ROM atual nao prova gameplay minimo real criado no Electron.",
      hasP0Rom
        ? "Executar playtest observavel da ROM do projeto exemplo P0 e validar boot, cena, ator, trigger, dialogo e troca de room."
        : "Gerar a ROM do projeto exemplo P0 e verificar comportamento observavel, nao apenas overlay/debug."
    ),
    item(
      "play-window",
      "Play Window",
      statusFor(hasPlayWindowSmoke, evidence.playWindow?.ok === true ? "parcial" : "ausente"),
      true,
      hasPlayWindowSmoke
        ? "Play Window limpa abriu uma ROM .gba real no app empacotado, montou o canvas mGBA-WASM direto 240x160 e recebeu input de teclado."
        : evidence.playWindow?.ok === true
          ? "Play Window tem evidencia parcial, mas ainda falta canvas direto 240x160 ou input confirmado."
          : "Play Window ainda nao tem smoke empacotado provando ROM real, canvas e input.",
      hasPlayWindowSmoke
        ? "Manter smoke:play-window no gate do pacote macOS."
        : "Rodar npm run smoke:play-window -- --packaged e registrar canvas/input."
    ),
    item(
      "web-itch-export",
      "Export Web / itch.io",
      statusFor(hasItchExportSmoke, evidence.itchExport?.ok === true ? "parcial" : "ausente"),
      true,
      hasItchExportSmoke
        ? "Export itch.io gerou pacote HTML5 estatico com index.html na raiz, ROM .gba, mGBA-WASM direto, licenca MPL, sem EmulatorJS/CDN, e rodou por HTTP local com canvas/input."
        : evidence.itchExport?.ok === true
          ? "Export itch.io tem evidencia parcial, mas ainda falta estrutura completa, ausencia de legados/CDN ou execucao visual com input."
          : "Export itch.io ainda nao tem smoke provando pacote HTML5 estatico jogavel.",
      hasItchExportSmoke
        ? "Manter smoke:itch-export no gate."
        : "Rodar npm run smoke:itch-export e exigir pacote HTML5 jogavel sem EmulatorJS/CDN."
    ),
    item(
      "macos-app",
      "macOS .app",
      statusFor(hasPackagedAppP0, evidence.bundle?.ok === true ? "parcial" : "ausente"),
      true,
      hasPackagedAppP0
        ? "O pacote macOS existe e validou UI P0 com o Play abrindo a ROM real no player integrado."
        : evidence.bundle?.ok === true
        ? "O pacote existe, mas ainda depende de UI P0 e Play Window real para fechar o corte de app."
        : "Pacote macOS sem evidencia atual.",
      hasPackagedAppP0
        ? "Manter smoke:package no gate antes de voltar para ROM."
        : "Empacotar novamente depois que UI P0 e Play Window estiverem funcionais."
    ),
    item(
      "windows-linux",
      "Windows / Linux",
      statusFor(evidence.windowsLinuxCiGreen === true, "ausente"),
      false,
      evidence.windowsLinuxCiGreen === true
        ? "CI cross-platform aprovado."
        : "Validacao real Windows/Linux deve esperar o macOS funcional.",
      "Rodar CI e validar artefatos somente depois do P0 macOS."
    )
  ];

  const blockers = items
    .filter((entry) => entry.blocking && entry.status !== "funcional")
    .map((entry) => `${entry.area}: ${entry.nextStep}`);

  return {
    status: blockers.length === 0 ? "ready" : "blocked",
    generatedAt: new Date().toISOString(),
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
    requiredP0Features: p0FeatureSet,
    playWindowEvidencePath: path.join(
      appRoot,
      "artifacts",
      "play-window",
      "latest",
      "play_window_smoke_evidence.json"
    ),
    itchExportEvidencePath: path.join(
      appRoot,
      "artifacts",
      "itch-export",
      "latest",
      "itch_export_smoke_evidence.json"
    ),
    engineP0RomEvidencePath: path.join(
      appRoot,
      "artifacts",
      "engine-rom-p0",
      "latest",
      "engine_p0_rom_smoke_evidence.json"
    ),
    uiP0EvidencePath: path.join(
      appRoot,
      "artifacts",
      "ui-p0",
      "latest",
      "ui_p0_evidence.json"
    ),
    projectIOP0EvidencePath: path.join(
      appRoot,
      "artifacts",
      "project-io-p0",
      "latest",
      "project_io_p0_evidence.json"
    ),
    workspaceSurfaces: evidence.workspaceSurfaces ?? {},
    blockers,
    items
  };
}

export function renderFunctionalParityMarkdown(report) {
  const lines = [
    "# Functional parity audit",
    "",
    `- Gerado em: ${report.generatedAt}`,
    `- Status: ${report.status === "ready" ? "Projeto real/base do app pronto" : "Projeto real/base do app bloqueado"}`,
    `- Projeto P0 canônico: ${report.canonicalP0ProjectPath}`,
    `- Evidência do P0 canônico: ${report.canonicalP0EvidencePath}`,
    `- Diagnóstico da fixture técnica: ${report.technicalFixtureEvidencePath}`,
    `- Evidencia Play Window esperada: ${report.playWindowEvidencePath}`,
    `- Evidencia itch.io esperada: ${report.itchExportEvidencePath}`,
    `- Evidencia ROM técnica P0 esperada: ${report.engineP0RomEvidencePath}`,
    `- Evidencia UI de diagnóstico: ${report.uiP0EvidencePath}`,
    `- Evidencia Project I/O de diagnóstico: ${report.projectIOP0EvidencePath}`,
    "",
    "## Itens",
    "",
    "| Area | Status | Bloqueador | Evidencia | Proximo passo |",
    "| --- | --- | --- | --- | --- |"
  ];

  for (const entry of report.items) {
    lines.push(
      `| ${escapeMarkdown(entry.area)} | ${entry.status} | ${entry.blocking ? "sim" : "nao"} | ${escapeMarkdown(entry.evidence)} | ${escapeMarkdown(entry.nextStep)} |`
    );
  }

  lines.push("", "## Bloqueios", "");
  if (report.blockers.length === 0) {
    lines.push("- Nenhum bloqueio funcional.");
  } else {
    lines.push(...report.blockers.map((blocker) => `- ${blocker}`));
  }

  lines.push(
    "",
    "## P0 requerido",
    "",
    ...report.requiredP0Features.map((feature) => `- ${feature}`),
    "",
    "## Regra",
    "",
    "- O projeto exemplo completo é o P0 canônico do produto; a fixture técnica reduzida serve apenas para contratos e diagnóstico.",
    "- O gate acompanha o projeto exemplo/base de teste aberto no app; bloqueios neste relatorio sao regressao critica.",
    "- Polish visual fino so volta depois que `Editor / Rooms`, `Eventos`, `Sprites`, `Audio`, `Arquivos / Assets`, `Exportacao ROM`, `Play Window`, `Export Web / itch.io` e `macOS .app` estiverem funcionais."
  );

  return `${lines.join("\n")}\n`;
}

function detectWorkspaceSurfaces() {
  const rendererRoot = path.join(appRoot, "src", "renderer");
  const sharedRoot = path.join(appRoot, "src", "shared");
  return {
    editorRooms: existsSync(path.join(rendererRoot, "roomsWorkspace.tsx")) && existsSync(path.join(sharedRoot, "roomsWorkspace.ts")),
    events: existsSync(path.join(rendererRoot, "eventsWorkspace.tsx")) && existsSync(path.join(sharedRoot, "eventsWorkspace.ts")),
    sprites: existsSync(path.join(rendererRoot, "spritesWorkspace.tsx")) && existsSync(path.join(sharedRoot, "spritesWorkspace.ts")),
    dialogues: existsSync(path.join(rendererRoot, "dialoguesWorkspace.tsx")) && existsSync(path.join(sharedRoot, "dialoguesWorkspace.ts")),
    audio: existsSync(path.join(rendererRoot, "audioWorkspace.tsx")) && existsSync(path.join(sharedRoot, "audioWorkspace.ts")),
    filesAssets: existsSync(path.join(rendererRoot, "filesWorkspace.tsx")) && existsSync(path.join(sharedRoot, "filesWorkspace.ts")),
    settings: existsSync(path.join(rendererRoot, "settingsWorkspace.tsx")) && existsSync(path.join(sharedRoot, "settingsWorkspace.ts"))
  };
}

async function main() {
  const artifactsRoot = path.join(appRoot, "artifacts");
  const technicalFixtureEvidencePath = path.join(
    artifactsRoot,
    "functional-playtest",
    "latest",
    "functional_playtest_evidence.json"
  );
  const evidence = {
    functionalPlaytest: await readJsonIfExists(technicalFixtureEvidencePath),
    canonicalP0: await readJsonIfExists(
      path.join(artifactsRoot, "exemplo-template", "latest", "exemplo_template_evidence.json")
    ),
    projectValidation: await readJsonIfExists(
      path.join(artifactsRoot, "project-validation", "latest", "project_validation_evidence.json")
    ),
    engineRom: await readJsonIfExists(
      path.join(artifactsRoot, "engine-rom", "latest", "engine_rom_smoke_evidence.json")
    ),
    engineP0Rom: await readJsonIfExists(
      path.join(artifactsRoot, "engine-rom-p0", "latest", "engine_p0_rom_smoke_evidence.json")
    ),
    playWindow: await readJsonIfExists(
      path.join(artifactsRoot, "play-window", "latest", "play_window_smoke_evidence.json")
    ),
    itchExport: await readJsonIfExists(
      path.join(artifactsRoot, "itch-export", "latest", "itch_export_smoke_evidence.json")
    ),
    uiP0: await readJsonIfExists(path.join(artifactsRoot, "ui-p0", "latest", "ui_p0_evidence.json")),
    projectIOP0: await readJsonIfExists(
      path.join(artifactsRoot, "project-io-p0", "latest", "project_io_p0_evidence.json")
    ),
    bundle: await readJsonIfExists(path.join(artifactsRoot, "macos-app", "latest", "bundle_evidence.json")),
    windowsLinuxCiGreen: process.env.GBA_STUDIO_WINDOWS_LINUX_CI_GREEN === "1",
    workspaceSurfaces: detectWorkspaceSurfaces()
  };
  const report = createFunctionalParityReport(evidence);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(outputMarkdownPath, renderFunctionalParityMarkdown(report), "utf8");

  console.log(`Functional parity audit: ${report.status}`);
  console.log(`Relatorio JSON: ${outputJsonPath}`);
  console.log(`Relatorio Markdown: ${outputMarkdownPath}`);
  if (report.blockers.length > 0) {
    console.log("Bloqueios:");
    for (const blocker of report.blockers) {
      console.log(`- ${blocker}`);
    }
  }

  if (strictMode && report.status !== "ready") {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
