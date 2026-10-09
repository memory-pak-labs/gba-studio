import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { auditNativeIsometricComposition, decodeNativeIsometricPagedComposition } from './native-isometric-composition-contract.mjs';
import { decodeMGBAHardwareVideoState, exportedHudFramebufferMasks, framebufferOcclusionPixels, nativeSinglePartSpriteObject, transformRacingSpriteSheetRgba } from './native-scene-framebuffer-contract.mjs';
import { auditStreamedObjResidency } from "./streamed-obj-residency.mjs";

import {
  cdpSession,
  createElectronSmokeEnv,
  electronExecutablePath,
  renderedText,
  terminateChild,
  wait
} from "./lib/electron-smoke-helpers.mjs";
import {
  EXEMPLO_BACKGROUNDLESS_SCENES,
  EXEMPLO_EXACT_BACKGROUND_FRAMEBUFFER_SCENES,
  EXEMPLO_EXACT_PLAYER_FRAMEBUFFER_SCENES,
  EXEMPLO_EXPLICIT_ACTOR_BINDING_SCENES,
  EXEMPLO_PLAYER_FRAMEBUFFER_SCENES,
  EXEMPLO_PLAYERLESS_SCENES,
  EXEMPLO_RGB555_SCENE_THRESHOLDS,
  EXEMPLO_RGB555_TRANSITION,
  auditExemploScenePlaytest,
  auditExemploInterfaceScenePlaytest,
  auditExemploSessionSoak,
  auditIntegerFramebufferDisplay,
  editorProjectReadyForScenePlaytest,
  exemploLaunchContract,
  exemploRuntimeLaunchContract,
  exemploSceneBackgroundAnimationAssetNames,
  exemploInterfaceScenePlaytestPlan,
  exemploProjectAssetSource,
  exemploSceneScreenshotPath,
  exemploScenePlaytestPlan,
  parseExemploSceneSoakMinutes,
  resolveExemploSmokeFaceButton,
  selectExemploScenePlaytestPlan,
  selectExemploScenePlaytestProjectPath,
  steadyFrameSamples
} from "./exemplo-scene-playtest-contract.mjs";
import {
  decodePngRgba
} from "./lib/png-icons.mjs";
import { renderPngContactSheet } from "./lib/png-contact-sheet.mjs";
import { resolveLutaFighterFramebufferMasks } from "./luta-framebuffer-contract.mjs";
import { auditTemporalVisualStability } from "./visual-frame-stability.mjs";
import {
  auditAlphaBlendedRgbaAgainstFramebuffer,
  auditOpaqueRgbaAgainstFramebufferRegion,
  auditRgbaAgainstFramebufferWithMasks,
  auditRgb555FramebufferColors,
  auditRgb555FramebufferPalette,
  auditRgbaAgainstExportedSpriteFrame,
  auditRgbaAgainstExportedTilemap,
  compositeRgbaLayers,
  decodeRgb555,
  decodeExportedSpriteSheetRgba,
  decodeExportedTileDataRgba,
  decodeExportedTilemapRgba,
  exportedTilemapRgb555Coverage,
  findBestOpaqueRgbaFramebufferFrame,
  findBestRgbaFramebufferCropWithMasks,
  parseExportedTilemapEntries,
  parseExportedBackgroundTileAsset,
  parseExportedRgb555Palette,
  parseExportedRgb555Palettes,
  parseNativeRgb15Palette,
  remapRgbaToPaletteReference,
  renderIsometricRoomRgba,
  resolveIsometricActorFramebufferMasks,
  resolveIsometricAuthoredBackgroundScroll,
  resolveIsometricCameraPosition,
  resolvePointClickPropFramebufferMasks,
  resolveWorldMapFramebufferViewport,
  usedExportedTilemapRgb555
} from "./rgb555-framebuffer-contract.mjs";
import { classifyP0ProjectPath, resolveCanonicalP0Source } from "./p0-source-catalog.mjs";
import { activeBuildRomPaths } from "./exemplo-template-smoke-contract.mjs";
import { defaultWelcomeSavedProjectPath } from "./smoke-electron-welcome-paths.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const canonicalTemplatePath = join(appRoot, "default-assets", "templates", "exemplo-gba", "exemplo-gba.gba-project");
const canonicalTemplateProject = JSON.parse(readFileSync(canonicalTemplatePath, "utf8"));
const canonicalTemplateAssetsByName = new Map(
  (Array.isArray(canonicalTemplateProject.assets) ? canonicalTemplateProject.assets : [])
    .filter((asset) => typeof asset?.name === "string")
    .map((asset) => [asset.name, asset])
);
const execFileAsync = promisify(execFile);
const usePackagedApp = process.argv.includes("--packaged");
const requestedSceneName = process.argv.find((argument) => argument.startsWith("--scene="))?.slice("--scene=".length) ?? null;
const requestedSceneNames = process.argv.find((argument) => argument.startsWith("--scenes="))
  ?.slice("--scenes=".length).split(",").map((name) => name.trim()).filter(Boolean) ?? null;
const requestedEvidencePath = process.argv.find((argument) => argument.startsWith("--evidence="))?.slice("--evidence=".length) ?? null;
const exerciseBattleInputRequested = process.argv.includes("--exercise-battle-input");
const exerciseShmupInputRequested = process.argv.includes("--exercise-shmup-input");
const exerciseShmupWavesRequested = process.argv.includes("--exercise-shmup-waves");
const exerciseIsometricInputRequested = process.argv.includes("--exercise-isometric-input");
const exerciseIsometricTacticalRequested = process.argv.includes("--exercise-isometric-tactical");
const exercisePlatformerInputRequested = process.argv.includes("--exercise-platformer-input");
const exercisePointClickInputRequested = process.argv.includes("--exercise-point-click-input");
const exerciseFeatureModulesRequested = process.argv.includes("--exercise-feature-modules");
const exerciseCutscenePortraitsRequested = process.argv.includes("--exercise-cutscene-portraits");
const dumpFramebuffer = process.argv.includes("--dump-framebuffer");
const soakMinutes = parseExemploSceneSoakMinutes(process.argv.slice(2));
const transitionProbeStyle = process.env.GBA_STUDIO_CANONICAL_TRANSITION_PROBE_STYLE?.trim() || null;
const transitionProbeStyles = new Set(["fade", "fade-color", "wipe", "mosaic", "slide", "crossfade"]);
const port = Number(process.env.GBA_STUDIO_SMOKE_CDP_PORT ?? 9374);
const evidenceRoot = process.env.GBA_STUDIO_EXEMPLO_SCENES_OUTPUT
  ?? join(appRoot, "artifacts", "exemplo-scene-playtest", "latest");
const framebufferDumpRoot = join(evidenceRoot, "framebuffers");
const evidencePath = requestedEvidencePath
  ? resolve(requestedEvidencePath)
  : join(evidenceRoot, "exemplo_scene_playtest_evidence.json");
const canonicalP0Source = resolveCanonicalP0Source(appRoot);
const defaultTemplatePath = canonicalP0Source.projectPath;
const authoredActorFramebufferScenes = new Set([
  "usina_submersa",
  "arena_tatica"
]);
const sceneBasedStartMenuRuntimes = new Set([
  "topdown",
  "platformer",
  "isometric",
  "dungeonCrawler"
]);
const templatePath = resolve(selectExemploScenePlaytestProjectPath(process.argv.slice(2), defaultTemplatePath));
const useExplicitProject = templatePath !== defaultTemplatePath;
const projectSource = classifyP0ProjectPath(appRoot, templatePath);
let configuredFaceButtonMasksByCode = {};
if (transitionProbeStyle && !transitionProbeStyles.has(transitionProbeStyle)) {
  throw new Error(`Estilo de probe canônico inválido: ${transitionProbeStyle}. Use fade, fade-color, wipe, mosaic, slide ou crossfade.`);
}
if (!useExplicitProject && (canonicalP0Source.role !== "canonical-p0" || canonicalP0Source.globalAcceptance !== true)) {
  throw new Error(`O smoke canônico de cenas recebeu uma fonte que não é o P0 do projeto exemplo: ${JSON.stringify(canonicalP0Source)}`);
}
function displaySceneName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  return name;
}

function templateRoomForScene(template, sceneName) {
  const legacyRoom = Array.isArray(template?.rooms)
    ? template.rooms.find((candidate) => candidate?.name === sceneName)
    : null;
  const authoredScene = Array.isArray(template?.scenas)
    ? template.scenas.find((candidate) => candidate?.name === sceneName)
    : null;
  const hasPagedTacticalSurface = Array.isArray(authoredScene?.runtime?.config?.tacticalPresentation?.surfacePages)
    && authoredScene.runtime.config.tacticalPresentation.surfacePages.length > 0;
  return hasPagedTacticalSurface ? authoredScene : legacyRoom ?? authoredScene ?? null;
}
const runtimeKindByName = Object.freeze({
  topdown: 0,
  platformer: 1,
  isometric: 2,
  menu: 3,
  shmup: 4,
  pointClick: 5,
  dungeonCrawler: 6,
  racing: 7,
  cutscene: 8,
  visualNovel: 9,
  worldMap: 10,
  battleRpg: 11,
  luta: 12
});
const runtimeNameByContractKind = Object.freeze({
  battle_rpg: "battleRpg",
  cutscene: "cutscene",
  dungeon_crawler: "dungeonCrawler",
  isometric: "isometric",
  luta: "luta",
  menu: "menu",
  point_click: "pointClick",
  platformer: "platformer",
  racing: "racing",
  shmup: "shmup",
  topdown: "topdown",
  visual_novel: "visualNovel",
  world_map: "worldMap"
});
const traceSceneSmoke = (...values) => {
  if (process.env.GBA_STUDIO_TRACE_SCENE_SMOKE === "1") console.log("[scene-smoke]", ...values);
};
const topdownPlayerSymbol = "player_pilot_32x32";
const topdownPlayerSpritePath = join(
  appRoot,
  "default-assets",
  "templates",
  "exemplo-gba",
  "Assets",
  "sprites",
  "player-pilot-32x32.png"
);
const topdownPlayerSha256 = "4089313016c9bc9674ec2ce6857efd4b3a6ab4c14fde5fa03c613aa611fc1472";
const topdownPlayerRgb555Palette = Object.freeze([
  0x0000, 0x1841, 0x150f, 0x1552, 0x10cb, 0x14f2, 0x227d, 0x21d6,
  0x42fd, 0x471e, 0x4f5f, 0x4f5e, 0x1515, 0x46fb, 0x422e, 0x4af9
]);
function currentTemplateRuntimeSpriteSpec(assetName) {
  const asset = canonicalTemplateAssetsByName.get(assetName);
  const source = typeof asset?.metadata?.source === "string" ? asset.metadata.source : "";
  if (!asset || !source.startsWith("Assets/sprites/")) {
    throw new Error(`Sprite de runtime não declarado no projeto Exemplo atual: ${assetName}`);
  }
  const bytes = readFileSync(join(appRoot, "default-assets", "templates", "exemplo-gba", source));
  const image = decodePngRgba(bytes);
  const metadata = asset.metadata ?? {};
  const frameWidth = Number(metadata.frameWidth) || image.width;
  const frameHeight = Number(metadata.frameHeight) || image.height;
  const frameCount = Number(metadata.frameCount) || Math.floor(image.width / frameWidth) * Math.floor(image.height / frameHeight);
  return Object.freeze({
    allowPaletteRemap: metadata.assetcStatus === "pending" || metadata.assetcReviewed !== true,
    assetName,
    frameCount,
    frameHeight,
    frameWidth,
    palette: null,
    sheetHeight: image.height,
    sheetWidth: image.width,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    symbol: assetName.replace(/\.png$/i, "").replace(/[^a-zA-Z0-9]+/g, "_"),
    streamFrames: metadata.streamFrames === true,
    tileCount: metadata.streamFrames === true ? (frameWidth/8)*(frameHeight/8) : Math.ceil(image.width / 8) * Math.ceil(image.height / 8)
  });
}

const runtimePlayerSpecs = Object.freeze({
  platformer: currentTemplateRuntimeSpriteSpec("penedos-v10-nara.png"),
  pointAndClick: Object.freeze({
    assetName: "point-click-cursor.png",
    frameCount: 2,
    frameHeight: 16,
    frameWidth: 16,
    palette: Object.freeze([
      0x0000, 0x1860, 0x5f9f, 0x1c00, 0x113f, 0x67df, 0x5719, 0x39cd,
      0x1efe, 0x0dd4, 0x1659, 0x1ede, 0x1ce5, 0x0000, 0x0000, 0x0000
    ]),
    sheetHeight: 16,
    sheetWidth: 32,
    sha256: "2128a2c31ae447549b1aa295215cfcfad4233e3af89c1ad91e478d98dfcac1f8",
    symbol: "point_click_cursor",
    tileCount: 8,
    transparentPaletteIndex: 0
  }),
  shmup: Object.freeze({
    assetName: "tempestade-v3-player.png",
    frameCount: 1,
    frameHeight: 64,
    frameWidth: 64,
    palette: Object.freeze([
      0x0000, 8489, 6417, 6519, 19057, 23387, 18036, 3136,
      7363, 13702, 21204, 23318, 14794, 17997, 17048, 18235
    ]),
    sheetHeight: 64,
    sheetWidth: 64,
    sha256: "3eb41a92131ae9e71c384aea57457e6222ce298b64dc040549d5edb901802f8a",
    symbol: "tempestade_v3_player",
    tileCount: 64,
    // OBJ transparency is encoded by palette index 0. The RGB value stored
    // in that slot may be non-zero when the exporter remaps the object
    // palette, so the audit must not infer transparency from the color value.
    transparentPaletteIndex: 0
  }),
  isometric: currentTemplateRuntimeSpriteSpec("tactical-nara-v5.png"),
  racing: Object.freeze({
    assetName: "nara-racer.png",
    frameCount: 3,
    frameHeight: 32,
    frameWidth: 32,
    palette: Object.freeze([
      0, 6339, 17113, 4193, 17009, 15849, 5428, 7575,
      13701, 21307, 9513, 20107, 9477, 22365, 21202, 9618
    ]),
    sheetHeight: 32,
    sheetWidth: 96,
    sha256: "d933dc6a743c06312ea3c343079080430272e43ff0fe1bed0a5d5cc016446185",
    symbol: "nara_racer",
    tileCount: 48
  }),
  battleRpg: Object.freeze({
    assetName: "battle-rpg-scene-party-mechanic-alpha128-v2.png",
    frameCount: 6,
    frameHeight: 64,
    frameWidth: 64,
    palette: Object.freeze([
      0x0000, 0x1482, 0x18c6, 0x18ec, 0x1d4f, 0x4250, 0x2528, 0x2dd1,
      0x31aa, 0x52f5, 0x42b9, 0x575d, 0x29f8, 0x1975, 0x325d, 0x42de
    ]),
    sheetHeight: 64,
    sheetWidth: 384,
    sha256: "7cfffa6566c2a2b3790891c8b9d3ce9a189da204174fd00f620610e44caf0c10",
    symbol: "battle_rpg_scene_party_mechanic_alpha128_v2",
    tileCount: 320
  })
});

const topdownPlayerSpec = Object.freeze({
  assetName: "player-pilot-32x32.png",
  frameCount: 16,
  frameHeight: 32,
  frameWidth: 32,
  palette: topdownPlayerRgb555Palette,
  sheetHeight: 32,
  sheetWidth: 512,
  sha256: topdownPlayerSha256,
  symbol: topdownPlayerSymbol,
  tileCount: 16,
  streamFrames: true
});

function spriteSheetFrameOrigin(source, frameIndex, frameWidth, frameHeight) {
  const columns = Math.max(1, Math.floor(source.width / frameWidth));
  return {
    sourceX: (frameIndex % columns) * frameWidth,
    sourceY: Math.floor(frameIndex / columns) * frameHeight
  };
}

async function fetchTargets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) return [];
  const targets = await response.json();
  return Array.isArray(targets) ? targets : [];
}

async function waitForTargets(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchTargets();
      if (targets.length > 0) return targets;
    } catch {
      // Electron ainda pode estar iniciando.
    }
    await wait(250);
  }
  throw new Error("O endpoint DevTools do aplicativo nao ficou disponivel.");
}

async function waitForTarget(predicate, description, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  let lastTargets = [];
  while (Date.now() < deadline) {
    lastTargets = await fetchTargets();
    const target = lastTargets.find(predicate);
    if (target) return target;
    await wait(250);
  }
  throw new Error(`Target nao encontrado para ${description}: ${JSON.stringify(lastTargets.map((target) => ({
    id: target.id,
    title: target.title,
    type: target.type,
    url: target.url
  })))}.`);
}

async function waitForPlayerTarget(mainCdp, beforeIDs, description, sceneName, timeoutMs = 300_000) {
  let deadline = Date.now() + timeoutMs;
  let buildRestarts = 0;
  let lastTargets = [];
  let lastStatus = "";
  while (Date.now() < deadline) {
    lastTargets = await fetchTargets();
    const target = lastTargets.find((candidate) => (
      candidate.type === "page"
      && candidate.webSocketDebuggerUrl
      && !beforeIDs.has(candidate.id)
      && String(candidate.url).includes("/player/runtime.html")
    ));
    if (target) return { ...target, buildRestarts };

    lastStatus = String(await evaluate(mainCdp, `
      document.querySelector(".studio-status-bar-message")?.textContent?.trim() ?? ""
    `).catch(() => ""));
    if (lastStatus === "O projeto mudou durante o build. Execute Play novamente para usar a versão atual.") {
      if (buildRestarts > 0) throw new Error(`Build invalidado novamente para ${description}: ${lastStatus}`);
      // The production guard discards stale ROMs. Retry that explicit outcome once,
      // with the same scene and all of the runtime/fidelity checks still required.
      buildRestarts += 1;
      console.log(`[scene-smoke] ${sceneName}: build inicial invalidado; repetindo Play uma vez.`);
      await waitForRunSceneEnabled(mainCdp, sceneName);
      await clickRunScene(mainCdp, sceneName);
      deadline = Date.now() + timeoutMs;
      continue;
    }
    if (/\b(falha|erro|error|inválid|invalida|não foi possível|nao foi possivel)\b/i.test(lastStatus)) {
      throw new Error(`Play Window não abriu para ${description}: ${lastStatus}`);
    }
    await wait(250);
  }
  throw new Error(`Play Window não abriu para ${description}: ${JSON.stringify({
    lastStatus,
    targets: lastTargets.map((target) => ({
      id: target.id,
      title: target.title,
      type: target.type,
      url: target.url
    }))
  })}`);
}

async function waitForTargetClosed(targetID) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (!(await fetchTargets()).some((target) => target.id === targetID)) return;
    await wait(100);
  }
  throw new Error(`Play Window ${targetID} permaneceu aberta.`);
}

async function closeTargetFromBrowser(targetID) {
  const versionResponse = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!versionResponse.ok) throw new Error(`Endpoint DevTools nao informou o browser: ${versionResponse.status}.`);
  const version = await versionResponse.json();
  if (!version.webSocketDebuggerUrl) throw new Error("Endpoint DevTools nao informou o WebSocket do browser.");
  const browserCdp = cdpSession(version.webSocketDebuggerUrl);
  await browserCdp.ready;
  try {
    await browserCdp.send("Target.closeTarget", { targetId: targetID });
  } finally {
    browserCdp.close();
  }
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Falha no renderer.");
  return result.result?.value;
}

async function waitForText(cdp, predicate, description, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  while (Date.now() < deadline) {
    lastText = await renderedText(cdp);
    if (predicate(lastText)) return lastText;
    await wait(250);
  }
  throw new Error(`Estado nao alcancado: ${description}. Texto: ${lastText.slice(0, 4_000)}`);
}

async function clickButtonByText(cdp, label) {
  const result = await evaluate(cdp, `
    (() => {
      const button = Array.from(document.querySelectorAll("button"))
        .find((item) => (item.textContent?.trim() ?? "").includes(${JSON.stringify(label)}));
      if (!button || button.disabled) return { ok: false, disabled: button?.disabled ?? null };
      button.click();
      return { ok: true };
    })()
  `);
  if (!result?.ok) throw new Error(`Botao ${label} indisponivel: ${JSON.stringify(result)}.`);
}

async function clickRunScene(cdp, sceneName) {
  const ariaLabel = `Executar somente a cena ${displaySceneName(sceneName)}`;
  const result = await evaluate(cdp, `
    (() => {
      const button = document.querySelector(${JSON.stringify(`button[aria-label="${ariaLabel}"]`)});
      if (!button || button.disabled) return { ok: false, found: Boolean(button), disabled: button?.disabled ?? null };
      button.scrollIntoView({ block: "center", inline: "center" });
      button.click();
      return { ok: true };
    })()
  `);
  if (!result?.ok) throw new Error(`${ariaLabel} indisponivel: ${JSON.stringify(result)}.`);
}

async function waitForRunSceneEnabled(cdp, sceneName) {
  const ariaLabel = `Executar somente a cena ${displaySceneName(sceneName)}`;
  const deadline = Date.now() + 30_000;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await evaluate(cdp, `
      (() => {
        const button = document.querySelector(${JSON.stringify(`button[aria-label="${ariaLabel}"]`)});
        const shellPlay = document.querySelector('button[aria-label="Executar ROM"]');
        const sceneButtons = Array.from(document.querySelectorAll('button[aria-label^="Executar somente a cena "]'))
          .map((item) => ({ ariaLabel: item.getAttribute("aria-label"), disabled: item.disabled }));
        const status = Array.from(document.querySelectorAll("body *"))
          .map((element) => element.textContent?.trim() ?? "")
          .find((text) => text.startsWith("Exportando projeto") || text.startsWith("Compilando ROM") || text.startsWith("Abrindo ROM")) ?? null;
        return {
          button: button ? { disabled: button.disabled, title: button.title } : null,
          enabled: Boolean(button && !button.disabled),
          focusedScene: Boolean(document.querySelector('button[aria-label="Voltar à visão geral"]')),
          sceneButtons,
          shellPlay: shellPlay ? { disabled: shellPlay.disabled, title: shellPlay.title } : null,
          status,
          titleMatches: Array.from(document.querySelectorAll("body *"))
            .filter((element) => (element.textContent?.trim() ?? "").includes("prologo"))
            .slice(0, 4)
            .map((element) => element.textContent?.trim() ?? "")
        };
      })()
    `);
    if (lastState?.enabled) return;
    if (lastState?.focusedScene) {
      await evaluate(cdp, `
        (() => {
          const button = document.querySelector('button[aria-label="Voltar à visão geral"]');
          if (button instanceof HTMLButtonElement) button.click();
          return Boolean(button);
        })()
      `);
    }
    await wait(200);
  }
  throw new Error(`O editor nao reabilitou ${ariaLabel}: ${JSON.stringify(lastState)}.`);
}

async function waitForPlayerEvidence(cdp, captureFramebuffer = false) {
  const evidence = await evaluate(cdp, `
    new Promise((resolve) => {
      const captureFramebuffer = ${captureFramebuffer ? "true" : "false"};
      const started = Date.now();
      const check = () => {
        const player = window.GBAStudioDirectPlayer;
        const frame = player?.inspectFrame?.() ?? null;
        const audio = player?.inspectAudio?.() ?? null;
        const runtimeState = player?.inspectRuntime?.()?.state ?? null;
        const presentedRuntimeState = player?.inspectPresentedRuntime?.()?.state ?? null;
        const canvas = player?.canvas ?? null;
        const display = canvas ? {
          cssHeight: canvas.clientHeight,
          cssWidth: canvas.clientWidth,
          intrinsicHeight: canvas.height,
          intrinsicWidth: canvas.width,
          reportedScale: Number(canvas.dataset.integerScale)
        } : null;
        if (frame?.meaningful && Number(audio?.emittedAudioFrames) > 0 && Number(runtimeState?.frame) >= 8) {
          // The runtime publishes telemetry before the canvas paint. Wait for
          // the next browser frame so the presented state and framebuffer are
          // sampled from the same render pass; otherwise a transient previous
          // OBJ frame can make an exact sprite audit fail intermittently.
          requestAnimationFrame(() => {
            const presentedAfterPaint = player?.inspectPresentedRuntime?.()?.state ?? null;
            const runtimeAfterPaint = player?.inspectRuntime?.()?.state ?? null;
            const frameAfterPaint = player?.inspectFrame?.() ?? frame;
            let framebufferRgbaBase64 = null;
            let nativeStateBase64 = null;
            if (captureFramebuffer && canvas) {
              const rgba = canvas.getContext("2d", { willReadFrequently: true })
                .getImageData(0, 0, canvas.width, canvas.height).data;
              let binary = "";
              for (let offset = 0; offset < rgba.length; offset += 0x8000) {
                binary += String.fromCharCode(...rgba.subarray(offset, offset + 0x8000));
              }
              framebufferRgbaBase64 = btoa(binary);
              // This smoke owns its isolated session. Restore the snapshot
              // storage entry immediately after reading the native state.
              const previous = new Map(Object.keys(localStorage).map(key => [key,localStorage.getItem(key)]));
              try {
                if (player?.save?.()) {
                  nativeStateBase64 = Object.keys(localStorage)
                    .filter(key => localStorage.getItem(key) !== previous.get(key))
                    .map(key => localStorage.getItem(key))[0] ?? null;
                }
              } finally {
                for (const key of Object.keys(localStorage)) {
                  if (!previous.has(key)) localStorage.removeItem(key);
                  else if (localStorage.getItem(key) !== previous.get(key)) localStorage.setItem(key,previous.get(key));
                }
              }
            }
            resolve({
              ok: true,
              audio,
              display,
              frame: frameAfterPaint,
              framebufferRgbaBase64,
              nativeStateBase64,
              presentedRuntimeState: presentedAfterPaint,
              runtimeState: runtimeAfterPaint
            });
          });
          return;
        }
        if (Date.now() - started > 15_000) {
          resolve({ ok: false, audio, display, frame, presentedRuntimeState, runtimeState, directError: window.GBAStudioDirectPlayerError ?? null });
          return;
        }
        setTimeout(check, 100);
      };
      check();
    })
  `, true);
  if (evidence.nativeStateBase64) {
    const nativeVideo = decodeMGBAHardwareVideoState(Buffer.from(evidence.nativeStateBase64,'base64'));
    evidence.runtimeState = {...evidence.runtimeState,nativeVideo};
    evidence.presentedRuntimeState = {...evidence.presentedRuntimeState,nativeVideo};
    if (dumpFramebuffer) evidence.nativeStateBytes = Buffer.from(evidence.nativeStateBase64,'base64');
    delete evidence.nativeStateBase64;
  }
  return evidence;
}

async function samplePlayerVisualStability(cdp, sampleCount = 36, actorRegions = []) {
  return evaluate(cdp, `
    new Promise((resolve) => {
      const actorRegions = ${JSON.stringify(actorRegions)};
      const samples = [];
      const resolveActorRegion = (region, runtimeState) => {
        if (region.followFirstActor !== true) return region;
        const actor = runtimeState?.firstActor;
        if (!actor || actor.visible !== true) return null;
        const width = Number(region.width);
        const height = Number(region.height);
        const actorX = Number(actor.x);
        const actorY = Number(actor.y);
        if (![width, height, actorX, actorY].every(Number.isFinite)) return null;
        if (region.runtime === "platformer") {
          return { ...region, x: actorX - (width / 2), y: actorY - height + 8 };
        }
        if (["cutscene", "shmup"].includes(region.runtime)) {
          return { ...region, x: actorX - (width / 2), y: actorY - (height / 2) };
        }
        return { ...region, x: actorX - (width / 2), y: actorY - height + 8 };
      };
      const analyzeRegion = (rgba, width, height, x, y, regionWidth, regionHeight, excludedRegions = []) => {
        const left = Math.max(0, Math.min(width, Math.floor(x)));
        const top = Math.max(0, Math.min(height, Math.floor(y)));
        const right = Math.max(left, Math.min(width, Math.ceil(x + regionWidth)));
        const bottom = Math.max(top, Math.min(height, Math.ceil(y + regionHeight)));
        const sourcePixelCount = (right - left) * (bottom - top);
        if (sourcePixelCount <= 0) {
          return {
            dominantColorRatio: 1,
            meaningful: false,
            nonBlackRatio: 0,
            pixelCount: 0,
            signature: null,
            uniqueColorCount: 0
          };
        }
        const colors = new Map();
        let nonBlackCount = 0;
        let dominantCount = 0;
        let pixelCount = 0;
        let signatureHash = 2_166_136_261;
        for (let row = top; row < bottom; row += 1) {
          for (let column = left; column < right; column += 1) {
            const excluded = excludedRegions.some((region) => (
              Number.isFinite(Number(region?.x)) && Number.isFinite(Number(region?.y))
              && Number.isFinite(Number(region?.width)) && Number.isFinite(Number(region?.height))
              && column >= Number(region.x)
              && column < Number(region.x) + Number(region.width)
              && row >= Number(region.y)
              && row < Number(region.y) + Number(region.height)
            ));
            if (excluded) continue;
            const offset = (row * width + column) * 4;
            const red = rgba[offset];
            const green = rgba[offset + 1];
            const blue = rgba[offset + 2];
            pixelCount += 1;
            if (red !== 0 || green !== 0 || blue !== 0) nonBlackCount += 1;
            const color = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
            const count = (colors.get(color) ?? 0) + 1;
            colors.set(color, count);
            if (count > dominantCount) dominantCount = count;
            signatureHash ^= color;
            signatureHash = Math.imul(signatureHash, 16_777_619);
          }
        }
        if (pixelCount <= 0) {
          return {
            dominantColorRatio: 1,
            meaningful: false,
            nonBlackRatio: 0,
            pixelCount: 0,
            signature: null,
            uniqueColorCount: 0
          };
        }
        const nonBlackRatio = nonBlackCount / pixelCount;
        const uniqueColorCount = colors.size;
        const dominantColorRatio = dominantCount / pixelCount;
        return {
          dominantColorRatio,
          meaningful: nonBlackRatio >= 0.01 && uniqueColorCount >= 3 && dominantColorRatio < 0.995,
          nonBlackRatio,
          pixelCount,
          signature: (signatureHash >>> 0).toString(16),
          uniqueColorCount
        };
      };
      const collect = () => {
        const player = window.GBAStudioDirectPlayer;
        const frame = player?.inspectFrame?.() ?? null;
        const runtimeState = player?.inspectPresentedRuntime?.()?.state
          ?? player?.inspectRuntime?.()?.state
          ?? null;
        if (!player || !frame) {
          resolve({ ok: false, samples, reason: "framebuffer ausente durante a amostragem temporal" });
          return;
        }
        const canvas = player.canvas;
        const context = canvas?.getContext?.("2d", { willReadFrequently: true });
        const rgba = canvas && context
          ? context.getImageData(0, 0, canvas.width, canvas.height).data
          : null;
        const resolvedActorRegions = actorRegions
          .map((region) => resolveActorRegion(region, runtimeState))
          .filter((region) => region !== null);
        const regions = rgba && canvas
          ? {
            background: analyzeRegion(rgba, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height * 0.72, resolvedActorRegions),
            hudTop: analyzeRegion(rgba, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height * 0.30),
            hudBottom: analyzeRegion(rgba, canvas.width, canvas.height, 0, canvas.height * 0.70, canvas.width, canvas.height * 0.30),
            dialogue: analyzeRegion(rgba, canvas.width, canvas.height, 0, canvas.height * 0.70, canvas.width, canvas.height * 0.30),
            actors: resolvedActorRegions
              .map((region) => region
                ? analyzeRegion(
                  rgba,
                  canvas.width,
                  canvas.height,
                  region.x,
                  region.y,
                  region.width,
                  region.height
                )
                : null),
            titleMenu: {
              dominantColorRatio: Number(frame.dominantColorRatio),
              meaningful: frame.meaningful === true,
              nonBlackRatio: Number(frame.nonBlackRatio),
              pixelCount: Number(frame.pixelCount),
              uniqueColorCount: Number(frame.uniqueColorCount)
            },
            menu: {
              dominantColorRatio: Number(frame.dominantColorRatio),
              meaningful: frame.meaningful === true,
              nonBlackRatio: Number(frame.nonBlackRatio),
              pixelCount: Number(frame.pixelCount),
              uniqueColorCount: Number(frame.uniqueColorCount)
            }
          }
          : {};
        samples.push({
          frame: {
            dominantColorRatio: Number(frame.dominantColorRatio),
            meaningful: frame.meaningful === true,
            nonBlackRatio: Number(frame.nonBlackRatio),
            pixelCount: Number(frame.pixelCount),
            uniqueColorCount: Number(frame.uniqueColorCount),
            signature: frame.signature ?? null
          },
          regions,
          runtime: {
            actorCount: Number.isFinite(Number(runtimeState?.actorCount))
              ? Number(runtimeState.actorCount)
              : null,
            firstActor: typeof runtimeState?.firstActor?.visible === "boolean"
              ? { visible: runtimeState.firstActor.visible }
              : null,
            frame: Number.isFinite(Number(runtimeState?.frame))
              ? Number(runtimeState.frame)
              : null
          }
        });
        if (samples.length >= ${JSON.stringify(sampleCount)}) {
          resolve({ ok: true, samples });
          return;
        }
        requestAnimationFrame(collect);
      };
      requestAnimationFrame(collect);
    })
  `, true);
}

async function waitForPlayerInputReady(cdp, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await evaluate(cdp, `Boolean(
      window.GBAStudioDirectPlayer?.inspectAudio &&
      document.querySelector("canvas.gba-studio-direct-canvas")
    )`);
    if (ready) return;
    await wait(500);
  }
  throw new Error("Player nao ficou pronto para receber input e liberar audio.");
}

async function waitForRuntimeRoom(cdp, targetRoom, settleFrames = 0, timeoutMs = 15_000) {
  return evaluate(cdp, `
    new Promise((resolve) => {
      const started = Date.now();
      let targetReachedAtFrame = null;
      const check = () => {
        const player = window.GBAStudioDirectPlayer;
        const frame = player?.inspectFrame?.() ?? null;
        const runtimeState = player?.inspectRuntime?.()?.state ?? null;
        if (Number(runtimeState?.currentRoom) === ${JSON.stringify(targetRoom)} && frame?.meaningful) {
          const runtimeFrame = Number(runtimeState?.frame ?? 0);
          targetReachedAtFrame ??= runtimeFrame;
          if (runtimeFrame - targetReachedAtFrame >= ${JSON.stringify(settleFrames)}) {
            resolve({ ok: true, frame, runtimeState });
            return;
          }
        } else {
          targetReachedAtFrame = null;
        }
        if (Date.now() - started > ${JSON.stringify(timeoutMs)}) {
          resolve({ ok: false, frame, runtimeState });
          return;
        }
        setTimeout(check, 50);
      };
      check();
    })
  `, true);
}

async function waitForRuntimeScene(cdp, runtime, targetRoom, settleFrames = 0, timeoutMs = 15_000) {
  const expectedRuntimeKind = runtimeKindByName[runtime] ?? -1;
  return evaluate(cdp, `
    new Promise((resolve) => {
      const started = Date.now();
      let targetReachedAtFrame = null;
      const check = () => {
        const player = window.GBAStudioDirectPlayer;
        const frame = player?.inspectFrame?.() ?? null;
        const runtimeState = player?.inspectRuntime?.()?.state ?? null;
        const activeRuntime = String(runtimeState?.activeRuntime ?? runtimeState?.runtime ?? "");
        const runtimeMatches = Number(runtimeState?.runtimeKind) === ${JSON.stringify(expectedRuntimeKind)}
          || activeRuntime === ${JSON.stringify(runtime)};
        if (runtimeMatches
          && Number(runtimeState?.currentRoom) === ${JSON.stringify(targetRoom)}
          && frame?.meaningful) {
          const runtimeFrame = Number(runtimeState?.frame ?? 0);
          targetReachedAtFrame ??= runtimeFrame;
          if (runtimeFrame - targetReachedAtFrame >= ${JSON.stringify(settleFrames)}) {
            resolve({ ok: true, frame, runtimeState });
            return;
          }
        } else {
          targetReachedAtFrame = null;
        }
        if (Date.now() - started > ${JSON.stringify(timeoutMs)}) {
          resolve({ ok: false, frame, runtimeState });
          return;
        }
        setTimeout(check, 50);
      };
      check();
    })
  `, true);
}

async function waitForRuntimeVariable(cdp, variableIndex, expectedValue, description, timeoutMs = 5_000) {
  return evaluate(cdp, `
    new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const player = window.GBAStudioDirectPlayer;
        const runtimeState = player?.inspectRuntime?.()?.state ?? null;
        const actualValue = runtimeState?.variables?.[${JSON.stringify(variableIndex)}] ?? null;
        if (Number(actualValue) === ${JSON.stringify(expectedValue)}) {
          resolve({ ok: true, runtimeState });
          return;
        }
        if (Date.now() - started > ${JSON.stringify(timeoutMs)}) {
          resolve({ ok: false, runtimeState, expectedValue: ${JSON.stringify(expectedValue)}, actualValue, description: ${JSON.stringify(description)} });
          return;
        }
        setTimeout(check, 50);
      };
      check();
    })
  `, true);
}

async function waitForRuntimeFrames(cdp, initialFrame, settleFrames, timeoutMs = 15_000) {
  return evaluate(cdp, `
    new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const player = window.GBAStudioDirectPlayer;
        const frame = player?.inspectFrame?.() ?? null;
        const runtimeState = player?.inspectRuntime?.()?.state ?? null;
        const canvas = player?.canvas ?? null;
        if (Number(runtimeState?.frame) - ${JSON.stringify(initialFrame)} >= ${JSON.stringify(settleFrames)}
          && frame?.meaningful) {
          let framebufferRgbaBase64 = null;
          if (canvas) {
            const rgba = canvas.getContext("2d", { willReadFrequently: true })
              .getImageData(0, 0, canvas.width, canvas.height).data;
            let binary = "";
            for (let offset = 0; offset < rgba.length; offset += 0x8000) {
              binary += String.fromCharCode(...rgba.subarray(offset, offset + 0x8000));
            }
            framebufferRgbaBase64 = btoa(binary);
          }
          resolve({ ok: true, frame, framebufferRgbaBase64, runtimeState });
          return;
        }
        if (Date.now() - started > ${JSON.stringify(timeoutMs)}) {
          resolve({ ok: false, frame, runtimeState });
          return;
        }
        setTimeout(check, 50);
      };
      check();
    })
  `, true);
}

function average(samples, key) {
  return samples.reduce((total, sample) => total + Number(sample[key] ?? 0), 0) / samples.length;
}

async function waitForPerformance(mainCdp, knownWindowIDs) {
  const value = await evaluate(mainCdp, `
    new Promise((resolve) => {
      const known = new Set(${JSON.stringify([...knownWindowIDs])});
      const started = Date.now();
      const check = () => {
        const events = window.__gbaStudioScenePlaytestTelemetry ?? [];
        const candidate = [...events].reverse().find((event) => (
          event.state === "running" &&
          !known.has(event.windowID) &&
          Number(event.stats?.presentationFps) > 0
        ));
        const samples = candidate
          ? events.filter((event) => event.windowID === candidate.windowID && Number(event.stats?.presentationFps) > 0).map((event) => event.stats)
          : [];
        const timedOut = Date.now() - started > 15_000;
        if (candidate && (samples.length >= 4 || (timedOut && samples.length >= 3))) {
          resolve({ ok: true, samples, windowID: candidate.windowID });
          return;
        }
        if (timedOut) {
          resolve({ ok: false, events, samples, windowID: candidate?.windowID ?? null });
          return;
        }
        setTimeout(check, 100);
      };
      check();
    })
  `, true);
  if (!value?.ok) throw new Error(`Telemetria de cadencia insuficiente: ${JSON.stringify(value)}.`);
  const samples = steadyFrameSamples(value.samples);
  return {
    droppedFrameRatio: Math.round(average(samples, "droppedFrameRatio") * 10_000) / 10_000,
    droppedFrames: Math.round(average(samples, "droppedFrames")),
    emulationFps: Math.round(average(samples, "emulationFps") * 100) / 100,
    emulationMs: Math.round(average(samples, "emulationMs") * 100) / 100,
    presentationFps: Math.round(average(samples, "presentationFps") * 100) / 100,
    samples,
    windowID: value.windowID
  };
}

async function latestPerformanceForWindow(mainCdp, windowID) {
  const stats = await evaluate(mainCdp, `
    (() => {
      const events = window.__gbaStudioScenePlaytestTelemetry ?? [];
      return [...events].reverse().find((event) => (
        event.state === "running" && event.windowID === ${JSON.stringify(windowID)}
      ))?.stats ?? null;
    })()
  `);
  if (!stats || Number(stats.presentationFps) <= 0) return null;
  return {
    droppedFrameRatio: Number(stats.droppedFrameRatio),
    droppedFrames: Number(stats.droppedFrames),
    emulationFps: Number(stats.emulationFps),
    emulationMs: Number(stats.emulationMs),
    presentationFps: Number(stats.presentationFps)
  };
}

async function sampleProcessTreeRss(rootPid, elapsedMs) {
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,rss="], { maxBuffer: 4 * 1024 * 1024 });
  const processes = String(stdout)
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter(([pid, parentPid, rssKiB]) => Number.isInteger(pid) && Number.isInteger(parentPid) && Number.isFinite(rssKiB));
  const descendants = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, parentPid] of processes) {
      if (descendants.has(parentPid) && !descendants.has(pid)) {
        descendants.add(pid);
        changed = true;
      }
    }
  }
  const rssKiB = processes
    .filter(([pid]) => descendants.has(pid))
    .reduce((total, process) => total + process[2], 0);
  return {
    elapsedMs,
    processCount: descendants.size,
    rssBytes: rssKiB * 1024
  };
}

async function exercisePlayerControl(playerCdp, index) {
  const keys = [
    { code: "ArrowRight", key: "ArrowRight", windowsVirtualKeyCode: 39 },
    { code: "ArrowDown", key: "ArrowDown", windowsVirtualKeyCode: 40 },
    { code: "ArrowLeft", key: "ArrowLeft", windowsVirtualKeyCode: 37 },
    { code: "ArrowUp", key: "ArrowUp", windowsVirtualKeyCode: 38 }
  ];
  const selected = keys[index % keys.length];
  await playerCdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...selected });
  await wait(250);
  await playerCdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...selected });
}

function comparableRuntimeState(state) {
  return {
    activeRuntime: state?.activeRuntime ?? null,
    camera: state?.camera
      ? { x: Number(state.camera.x), y: Number(state.camera.y) }
      : null,
    currentRoom: Number.isFinite(state?.currentRoom) ? Number(state.currentRoom) : null,
    player: state?.player
      ? {
        direction: Number(state.player.direction),
        x: Number(state.player.x),
        y: Number(state.player.y)
      }
      : null
  };
}

async function exercisePlayerSaveLoad(playerCdp) {
  const saved = await evaluate(playerCdp, `
    (() => {
      const player = window.GBAStudioDirectPlayer;
      if (!player) return { before: null, saveSucceeded: false };
      const before = player.inspectRuntime()?.state ?? null;
      const saveSucceeded = player.save() === true;
      return { before, saveSucceeded };
    })()
  `);
  const before = saved?.before ?? null;
  const beforeComparable = comparableRuntimeState(before);
  const saveSucceeded = saved?.saveSucceeded === true;
  let changed = before;
  let stateChanged = false;
  for (let attempt = 0; attempt < 4 && !stateChanged; attempt += 1) {
    await exercisePlayerControl(playerCdp, attempt);
    await wait(250);
    changed = await evaluate(playerCdp, "window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null");
    stateChanged = JSON.stringify(comparableRuntimeState(changed)) !== JSON.stringify(beforeComparable);
  }
  const loaded = await evaluate(playerCdp, `
    (() => {
      const player = window.GBAStudioDirectPlayer;
      if (!player) return { loadSucceeded: false, restoredState: null };
      const loadSucceeded = player.load() === true;
      const restoredState = player.inspectRuntime()?.state ?? null;
      return { loadSucceeded, restoredState };
    })()
  `);
  const loadSucceeded = loaded?.loadSucceeded === true;
  const restoredState = loaded?.restoredState ?? null;
  const restored = JSON.stringify(comparableRuntimeState(restoredState)) === JSON.stringify(beforeComparable);
  return {
    attempted: true,
    before: beforeComparable,
    changed: comparableRuntimeState(changed),
    loadSucceeded,
    restored,
    restoredState: comparableRuntimeState(restoredState),
    saveSucceeded,
    stateChanged
  };
}

async function runIntegratedSessionSoak({ childPid, mainCdp, minutes, plan }) {
  const startedAt = Date.now();
  const deadline = startedAt + (minutes * 60_000);
  const memorySamples = [];
  const performanceSamples = [];
  const runtimeSamples = [];
  const knownWindowIDs = new Set();
  const topdownIndex = plan.findIndex((scene) => scene.name === "porto_lumen");
  const orderedPlan = topdownIndex > 0
    ? [plan[topdownIndex], ...plan.slice(0, topdownIndex), ...plan.slice(topdownIndex + 1)]
    : [...plan];
  const visitedSceneNames = new Set();
  let saveLoad = {
    attempted: false,
    loadSucceeded: false,
    restored: false,
    saveSucceeded: false,
    stateChanged: false
  };
  let controlCount = 0;
  let sceneIndex = 0;
  while (
    Date.now() < deadline
    || visitedSceneNames.size < orderedPlan.length
    || memorySamples.length < Math.max(20, orderedPlan.length)
  ) {
    const scene = orderedPlan[sceneIndex % orderedPlan.length];
    const cycle = Math.floor(sceneIndex / orderedPlan.length) + 1;
    console.log(`[soak ciclo ${cycle}] Exercitando ${scene.name} (${scene.runtime})...`);
    await waitForRunSceneEnabled(mainCdp, scene.name);
    const beforeIDs = new Set((await fetchTargets()).map((target) => target.id));
    await clickRunScene(mainCdp, scene.name);
    const playerTarget = await waitForPlayerTarget(mainCdp, beforeIDs, `Play Window prolongada de ${scene.name}`);
    const playerCdp = cdpSession(playerTarget.webSocketDebuggerUrl);
    try {
      await playerCdp.ready;
      await waitForPlayerInputReady(playerCdp);
      const initialEvidence = await waitForPlayerEvidence(playerCdp, false);
      if (!initialEvidence?.ok) {
        throw new Error(`Soak de ${scene.name} nao iniciou corretamente: ${JSON.stringify(initialEvidence)}.`);
      }
      await exercisePlayerControl(playerCdp, controlCount);
      controlCount += 1;
      if (scene.name === "porto_lumen" && !saveLoad.attempted) {
        saveLoad = await exercisePlayerSaveLoad(playerCdp);
      }
      const performance = await waitForPerformance(mainCdp, knownWindowIDs);
      knownWindowIDs.add(performance.windowID);
      const runtime = await evaluate(playerCdp, `
        (() => ({
          audio: window.GBAStudioDirectPlayer?.inspectAudio?.() ?? null,
          frame: window.GBAStudioDirectPlayer?.inspectFrame?.() ?? null,
          runtimeState: window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null
        }))()
      `);
      const elapsedMs = Date.now() - startedAt;
      const runtimeHealthy = Number(runtime?.runtimeState?.frame) > Number(initialEvidence.runtimeState?.frame)
        && Number(runtime?.audio?.emittedAudioFrames) > Number(initialEvidence.audio?.emittedAudioFrames)
        && runtime?.frame?.meaningful === true;
      runtimeSamples.push({
        elapsedMs,
        initialFrame: initialEvidence.runtimeState?.frame ?? null,
        runtime: scene.runtime,
        runtimeHealthy,
        sceneName: scene.name,
        ...runtime
      });
      performanceSamples.push({
        droppedFrameRatio: performance.droppedFrameRatio,
        emulationFps: performance.emulationFps,
        presentationFps: performance.presentationFps,
        runtime: scene.runtime,
        sceneName: scene.name
      });
      memorySamples.push({
        ...await sampleProcessTreeRss(childPid, elapsedMs),
        runtime: scene.runtime,
        sceneName: scene.name
      });
      visitedSceneNames.add(scene.name);
      sceneIndex += 1;
    } finally {
      playerCdp.close();
      await closeTargetFromBrowser(playerTarget.id).catch(() => undefined);
      await waitForTargetClosed(playerTarget.id).catch(() => undefined);
    }
  }
  const durationMs = Date.now() - startedAt;
  const activeRuntimeHealthy = runtimeSamples.length >= orderedPlan.length
    && runtimeSamples.every((sample) => sample.runtimeHealthy === true);
  const audit = auditExemploSessionSoak({
    audioSamples: runtimeSamples.map((sample) => sample.audio).filter(Boolean),
    durationMs,
    memorySamples,
    performanceSamples,
    saveLoad,
    sceneSamples: runtimeSamples
  });
  if (!activeRuntimeHealthy) audit.issues.push("Nem todos os runtimes continuaram avancando frame e audio durante o soak.");
  audit.ok = audit.ok && activeRuntimeHealthy;
  return {
    activeRuntimeHealthy,
    audit,
    controlCount,
    cyclesCompleted: Math.floor(sceneIndex / orderedPlan.length),
    durationMs,
    memorySamples,
    performanceSamples,
    runtimeSamples,
    saveLoad,
    visitedSceneNames: [...visitedSceneNames]
  };
}

async function filesNamed(root, fileName) {
  const matches = [];
  if (!existsSync(root)) return matches;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) matches.push(...await filesNamed(path, fileName));
    else if (entry.name === fileName) matches.push(path);
  }
  return matches;
}

async function latestExportContract(engineExportRoot) {
  const paths = await filesNamed(engineExportRoot, "export_project.json");
  const dated = await Promise.all(paths.map(async (path) => ({ path, modifiedAt: (await stat(path)).mtimeMs })));
  const latest = dated.sort((left, right) => right.modifiedAt - left.modifiedAt)[0];
  if (!latest) throw new Error("O build da cena nao gerou export_project.json.");
  return { path: latest.path, project: JSON.parse(await readFile(latest.path, "utf8")) };
}

function exportedAssetSymbol(assetName) {
  return basename(assetName, extname(assetName))
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function exportedPackAsset(exportedProject, symbol) {
  return (Array.isArray(exportedProject?.asset_pack?.assets) ? exportedProject.asset_pack.assets : [])
    .find((asset) => asset?.symbol === symbol || asset?.name === symbol || asset?.id === symbol) ?? null;
}

function exportedObjectPaletteOverride(exportedProject, symbol) {
  const asset = exportedPackAsset(exportedProject, symbol);
  return Array.isArray(asset?.object_palette_values) && asset.object_palette_values.length > 0
    ? asset.object_palette_values
    : null;
}

function exportedBackgroundPaletteReference(exportedProject, symbol) {
  const asset = exportedPackAsset(exportedProject, symbol);
  return Array.isArray(asset?.background_palette_reference_colors)
    && asset.background_palette_reference_colors.length > 0
    ? asset.background_palette_reference_colors
    : null;
}

async function auditExportedScenePalette(exportPath, room, frame, minimumPixelRatio) {
  const runtimeBackgroundAssetName = room?.backgroundAssetName;
  if (!runtimeBackgroundAssetName) {
    throw new Error(`${room?.name ?? "Cena"}: background ausente para auditoria RGB555.`);
  }
  const symbol = exportedAssetSymbol(runtimeBackgroundAssetName);
  const headerPath = join(dirname(exportPath), `${symbol}.hpp`);
  const headerSource = await readFile(headerPath, "utf8");
  const exportCoverage = exportedTilemapRgb555Coverage(
    headerSource,
    symbol,
    Math.max(0.2, minimumPixelRatio),
    room?.gbStudioUseBackgroundLayout === true
      ? { excludeRgb555: [0] }
      : undefined
  );
  return {
    audited: true,
    backgroundAssetName: runtimeBackgroundAssetName,
    exportCoverage,
    headerPath,
    symbol,
    ...auditRgb555FramebufferColors({
      colorHistogram: frame?.colorHistogram,
      expectedRgb555: usedExportedTilemapRgb555(exportCoverage),
      framebufferPixelCount: frame?.pixelCount,
      minimumPixelRatio
    })
  };
}

function spriteFrameDimensions(spriteSheet, actor, animations) {
  const match = String(spriteSheet ?? "").match(/(?:^|[-_])(\d+)x(\d+)(?=\.[^.]+$)/i);
  if (match) return { height: Number(match[2]), width: Number(match[1]) };
  const animation = Array.isArray(animations)
    ? animations.find((candidate) => candidate?.name === actor?.animationName
      && candidate?.spriteSheet === spriteSheet)
    : null;
  return Number.isInteger(animation?.frameWidth) && Number.isInteger(animation?.frameHeight)
    ? { height: animation.frameHeight, width: animation.frameWidth }
    : null;
}

function exportedIntegerConstant(headerSource, symbol, suffix) {
  const match = String(headerSource ?? "").match(
    new RegExp(`(?:constexpr|const)\\s+int\\s+${symbol}_${suffix}\\s*=\\s*(\\d+)`)
  );
  return match ? Number(match[1]) : null;
}

function authoredActorFramebufferTarget(room, runtime, actor, frameWidth, frameHeight, runtimeState, exportedProject) {
  const x = Number(actor?.x) * 8;
  const y = Number(actor?.y) * 8;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (runtime === "pointAndClick" && actor?.name === room?.playerActorName
    && Number.isFinite(Number(runtimeState?.player?.x))
    && Number.isFinite(Number(runtimeState?.player?.y))) {
    return { x: Number(runtimeState.player.x), y: Number(runtimeState.player.y) - 8 };
  }
  if (runtime === "platformer") {
    return { x: x - frameWidth / 2, y: y - frameHeight + 8 };
  }
  if (runtime === "racing") {
    const nativeObject = racingNativeObject(room,actor,runtimeState,exportedProject);
    if (nativeObject) return {x:nativeObject.x,y:nativeObject.y};
    const camera = racingCameraPosition(room, runtimeState);
    return { x: x + 4 - camera.x, y: y + 4 - camera.y };
  }
  if (runtime === "isometric") {
    const runtimeRoom = exportedProject?.isometric_project?.rooms?.find((candidate) => candidate?.name === room?.name);
    const grid = runtimeRoom?.grid;
    const camera = runtimeRoom ? isometricCameraPosition(runtimeRoom, runtimeState) : null;
    const runtimeActor = runtimeRoom?.actors?.find((candidate) => (
      Number(candidate?.tile?.x) === Number(actor?.x)
      && Number(candidate?.tile?.y) === Number(actor?.y)
    ));
    if (!grid || !camera) return null;
    const tileZ = Number(runtimeActor?.tile?.z ?? 0);
    const screenOffset = runtimeActor?.screen_offset ?? {};
    return isometricCameraWorldToScreen(
      Number(grid.origin?.x ?? 0)
        + (Number(actor.x) - Number(actor.y)) * (Number(grid.tile_width_pixels ?? 32) / 2)
        + Number(screenOffset.x ?? 0),
      Number(grid.origin?.y ?? 0)
        + (Number(actor.x) + Number(actor.y)) * (Number(grid.tile_height_pixels ?? 16) / 2)
        - tileZ * Number(grid.height_step_pixels ?? 0)
        + Number(screenOffset.y ?? 0),
      camera
    );
  }
  if (runtime === "dungeonCrawler") {
    const runtimeRoom = exportedProject?.dungeon_crawler_project?.rooms?.find((candidate) => candidate?.name === room?.name);
    const position = runtimeState?.player;
    if (!runtimeRoom || !Number.isFinite(Number(position?.x)) || !Number.isFinite(Number(position?.y))) return null;
    const forwardByDirection = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 }
    ];
    const forward = forwardByDirection[Number(position?.direction)] ?? forwardByDirection[0];
    const right = { x: -forward.y, y: forward.x };
    const deltaX = Number(actor.x) - Number(position.x);
    const deltaY = Number(actor.y) - Number(position.y);
    const distance = deltaX * forward.x + deltaY * forward.y;
    const lateral = deltaX * forward.y - deltaY * forward.x;
    const viewDistance = Number(runtimeRoom.config?.view_distance ?? 0);
    if (distance < 1 || distance > viewDistance || lateral < -1 || lateral > 1) return null;
    for (let nearer = 1; nearer < distance; nearer += 1) {
      const xAtDistance = Number(position.x) + forward.x * nearer + right.x * lateral;
      const yAtDistance = Number(position.y) + forward.y * nearer + right.y * lateral;
      const collision = runtimeRoom.collision_flags?.[yAtDistance * Number(runtimeRoom.width_tiles) + xAtDistance] ?? 1;
      if (collision !== 0) return null;
    }
    const lateralSpan = distance <= 1 ? 48 : distance === 2 ? 38 : distance === 3 ? 30 : 22;
    return {
      // The native dungeon projection receives the top-left of a 64x64 OBJ
      // frame, not its center. Keep this audit in lockstep with the runtime:
      // centered at x=120 and two tiles above the bottom dialogue HUD.
      x: 88 + lateral * lateralSpan,
      y: 32 - (distance - 1) * 8
    };
  }
  if (runtime === "battleRpg") {
    return actor?.battle?.side === "enemy"
      ? { x: 176, y: 24 }
      : { x: 48, y: 32 };
  }
  if (runtime === "shmup") {
    return { x, y };
  }
  if (runtime === "luta") {
    return actor?.battle?.side === "player2"
      ? { x: 200, y: 80 }
      : { x: 80, y: 80 };
  }
  if (runtime === "menu" || runtime === "cutscene") {
    return { x, y };
  }
  return { x, y: y - frameHeight + 8 };
}

function temporalActorRegionsForScene({ project, exportedProject, room, runtime, runtimeState }) {
  const actors = (Array.isArray(project?.actors) ? project.actors : [])
    .filter((actor) => actor?.roomName === room?.name);
  if (runtime === "shmup" && Number(runtimeState?.actorCount) > 0) {
    const enemy = actors[1] ?? actors[0];
    const dimensions = spriteFrameDimensions(enemy?.spriteSheet, enemy, project?.animations);
    if (dimensions) {
      return [{
        followFirstActor: true,
        height: Math.max(1, Math.ceil(Number(dimensions.height))),
        runtime,
        width: Math.max(1, Math.ceil(Number(dimensions.width))),
        x: 0,
        y: 0
      }];
    }
  }
  const regions = [];
  for (const actor of actors) {
    const dimensions = spriteFrameDimensions(actor.spriteSheet, actor, project?.animations);
    if (!dimensions) continue;
    const target = authoredActorFramebufferTarget(
      room,
      runtime,
      actor,
      dimensions.width,
      dimensions.height,
      runtimeState,
      exportedProject
    );
    if (!target || !Number.isFinite(Number(target.x)) || !Number.isFinite(Number(target.y))) continue;
    regions.push({
      followFirstActor: runtime === "cutscene" && regions.length === 0,
      height: Math.max(1, Math.ceil(Number(dimensions.height))),
      width: Math.max(1, Math.ceil(Number(dimensions.width))),
      x: Math.floor(Number(target.x)),
      y: Math.floor(Number(target.y))
    });
  }
  return regions;
}

async function auditExportedAuthoredActors(exportPath, exported, project, room, frame, exactOptions = null) {
  const actors = (Array.isArray(project?.actors) ? project.actors : [])
    .filter((actor) => actor?.roomName === room?.name);
  const framebufferRgba = typeof exactOptions?.framebufferRgbaBase64 === "string"
    ? Uint8Array.from(Buffer.from(exactOptions.framebufferRgbaBase64, "base64"))
    : null;
  const runtime = exactOptions?.runtime ?? room?.sceneType ?? null;
  const frameRuntimeState = exactOptions?.presentedRuntimeState ?? exactOptions?.runtimeState;
  const framebufferRuntimeSupport = new Set([
    "battleRpg",
    "dungeonCrawler",
    "isometric",
    "luta",
    "platformer",
    "pointAndClick",
    "shmup",
    "racing"
  ]);
  const tacticalPresentation = room?.runtime?.config?.tacticalPresentation;
  const tacticalSurfacePages = tacticalPresentation?.surfacePages;
  const tacticalPropAssets = Array.isArray(tacticalPresentation?.props)
    ? tacticalPresentation.props
      .map((prop) => typeof prop?.asset === "string" ? prop.asset : "")
      .filter(Boolean)
    : [];
  const allowedTacticalOcclusionRgb555 = runtime === "isometric"
    && Array.isArray(tacticalSurfacePages)
    && tacticalSurfacePages.length > 0
    ? [...new Set((await Promise.all([
      ...tacticalSurfacePages.map((page) => typeof page?.asset === "string" ? page.asset : ""),
      ...tacticalPropAssets
    ].filter(Boolean).map(async (assetName) => {
      if (!assetName) return [];
      const symbol = exportedAssetSymbol(assetName);
      try {
        return parseExportedRgb555Palette(
          await readFile(join(dirname(exportPath), `${symbol}.hpp`), "utf8"),
          symbol
        );
      } catch {
        return [];
      }
    }))).flat())]
    : [];
  const allowedNativeOcclusionPixels = runtime === 'isometric'
    ? await isometricNativeOcclusionPixels(exportPath, exactOptions?.exportedProject ?? exported, room.name, frameRuntimeState)
    : new Set();
  const audits = await Promise.all(actors.map(async (actor) => {
    const sourceAssetName = typeof actor?.spriteSheet === "string" ? actor.spriteSheet : null;
    const symbol = sourceAssetName ? exportedAssetSymbol(sourceAssetName) : null;
    const sourcePath = sourceAssetName
      ? join(dirname(templatePath), exemploProjectAssetSource(project, sourceAssetName))
      : null;
    const headerPath = symbol ? join(dirname(exportPath), `${symbol}.hpp`) : null;
    if (!sourcePath || !headerPath || !symbol) {
      return {
        actorID: actor?.id ?? null,
        actorName: actor?.name ?? null,
        checks: { binding: false, source: false },
        framebuffer: { audited: false, ok: false, required: false },
        framebufferPixels: { audited: false, ok: false },
        sourceFrames: [],
        sourcePath,
        symbol
      };
    }
    try {
      const [header, sourceBytes] = await Promise.all([
        readFile(headerPath, "utf8"),
        readFile(sourcePath)
      ]);
      const source = decodePngRgba(sourceBytes);
      const frameWidth = exportedIntegerConstant(header, symbol, "sprite_width")
        ?? spriteFrameDimensions(sourceAssetName, actor, project?.animations)?.width
        ?? source.width;
      const frameHeight = exportedIntegerConstant(header, symbol, "sprite_height")
        ?? spriteFrameDimensions(sourceAssetName, actor, project?.animations)?.height
        ?? source.height;
      const frameCount = exportedIntegerConstant(header, symbol, "frame_count")
        ?? Math.floor(source.width / Math.max(1, frameWidth));
      const sheetWidth = exportedIntegerConstant(header, symbol, "width") ?? source.width;
      const sheetHeight = exportedIntegerConstant(header, symbol, "height") ?? source.height;
      const objectPaletteOverride = exportedObjectPaletteOverride(exactOptions?.exportedProject ?? exported, symbol);
      const sourceFrames = Array.from({ length: frameCount }, (_, frameIndex) => {
        const origin = spriteSheetFrameOrigin(source, frameIndex, frameWidth, frameHeight);
        return auditRgbaAgainstExportedSpriteFrame({
          frameHeight,
          frameIndex,
          frameWidth,
          headerSource: header,
          pixels: source.pixels,
          sheetWidth: source.width,
          symbol,
          sourceX: origin.sourceX,
          sourceY: origin.sourceY,
          transparentPaletteIndex: 0,
          allowPaletteRemap: objectPaletteOverride !== null
        });
      });
      const palette = parseExportedRgb555Palette(header, symbol);
      const spriteScale = runtime === "battleRpg"
        ? Math.max(1, Math.min(2, Number(actor?.battle?.spriteScale) || 1))
        : 1;
      let framebufferPixels = { audited: false, ok: true };
      const visibleInInitialFrame = typeof actor?.visibleVariable !== "string";
      const authoredTarget = authoredActorFramebufferTarget(
        room,
        runtime,
        actor,
        frameWidth,
        frameHeight,
        frameRuntimeState,
        exactOptions?.exportedProject
      );
      const intersectsInitialFramebuffer = authoredTarget !== null
        && authoredTarget.x < SCREEN_WIDTH
        && authoredTarget.y < SCREEN_HEIGHT
        && authoredTarget.x + frameWidth > 0
        && authoredTarget.y + frameHeight > 0;
      const framebufferRequired = Boolean(
        framebufferRgba
        && framebufferRuntimeSupport.has(runtime)
        && visibleInInitialFrame
        && intersectsInitialFramebuffer
      );
      if (framebufferRequired) {
        const nativeActorObject = runtime === 'platformer'
          ? nativeSinglePartSpriteObject(header, symbol, frameRuntimeState?.nativeVideo)
          : null;
        let compiledSource = scaleRgbaSpriteSheet(decodeExportedSpriteSheetRgba({
          frameCount,
          frameHeight,
          frameWidth,
          headerSource: header,
          symbol
        }), spriteScale);
        const nativeRacingObject = runtime === 'racing' ? racingNativeObject(room,actor,frameRuntimeState,exactOptions?.exportedProject ?? exported) : null;
        if (runtime === 'racing' && nativeRacingObject?.affine) {
          compiledSource = transformRacingSpriteSheetRgba({source:compiledSource,frameWidth,frameHeight,matrix:nativeRacingObject.matrix});
        }
        const allowedRacingOcclusionPixels = nativeRacingObject
          ? await racingNativeOcclusionPixels(exportPath,exactOptions?.exportedProject ?? exported,room.name,frameRuntimeState,nativeRacingObject.index)
          : new Set();
        const renderedFrameWidth = frameWidth * spriteScale;
        const renderedFrameHeight = frameHeight * spriteScale;
        const candidateSourceXs = Array.from({ length: frameCount }, (_, index) => index * renderedFrameWidth);
        const detectedTargets = opaqueAnchorFramebufferTargets({
          candidateSourceXs,
          framebuffer: framebufferRgba,
          framebufferHeight: SCREEN_HEIGHT,
          framebufferWidth: SCREEN_WIDTH,
          frameHeight: renderedFrameHeight,
          frameWidth: renderedFrameWidth,
          sourcePixels: compiledSource.pixels,
          sourceSheetWidth: compiledSource.width
        });
        framebufferPixels = {
          audited: true,
          authoredTarget,
          ...findBestOpaqueRgbaFramebufferFrame({
            candidateFlipsX: nativeActorObject ? [nativeActorObject.flipX] : [false],
            candidateSourceXs,
            candidateTargets: nativeActorObject ? [{x:nativeActorObject.x,y:nativeActorObject.y}]
              : runtime === 'racing' && authoredTarget ? [authoredTarget] : authoredTarget ? [authoredTarget, ...detectedTargets] : detectedTargets,
            framebuffer: framebufferRgba,
            framebufferHeight: SCREEN_HEIGHT,
            framebufferWidth: SCREEN_WIDTH,
            frameHeight: renderedFrameHeight,
            frameWidth: renderedFrameWidth,
            // Surface BGs and declared tactical props may legitimately cover
            // an actor in the isometric depth order. Other OBJ layers remain
            // visible mismatches instead of being silently accepted.
            allowedOcclusionRgb555: allowedTacticalOcclusionRgb555,
            allowedOcclusionPixels: runtime === 'racing' ? allowedRacingOcclusionPixels : allowedNativeOcclusionPixels,
            sourcePixels: compiledSource.pixels,
            sourceSheetWidth: compiledSource.width
          })
        };
      }
      const checks = {
        binding: Boolean(exported) && Boolean(headerPath),
        framebufferPixels: !framebufferRequired || framebufferPixels.ok,
        frameCount: frameCount > 0 && header.includes(`${symbol}_frame_count`),
        frameSize: frameWidth > 0 && frameHeight > 0 && frameWidth % 8 === 0 && frameHeight % 8 === 0,
        palette: palette.length > 0,
        sheetSize: source.width === sheetWidth && source.height === sheetHeight,
        sourcePixels: sourceFrames.length === frameCount && sourceFrames.every((sourceFrame) => sourceFrame.ok)
      };
      return {
        actorID: actor?.id ?? null,
        actorName: actor?.name ?? null,
        checks,
        framebuffer: {
          audited: framebufferRequired,
          ok: !framebufferRequired || framebufferPixels.ok,
          required: framebufferRequired,
          reason: !visibleInInitialFrame
            ? "ator-condicional-ausente-no-frame-inicial"
            : !intersectsInitialFramebuffer
              ? "ator-fora-do-framebuffer-inicial"
              : null
        },
        framebufferPixels,
        frameCount,
        frameHeight,
        frameWidth,
        renderedFrameHeight: frameHeight * spriteScale,
        renderedFrameWidth: frameWidth * spriteScale,
        palette,
        paletteRemapped: objectPaletteOverride !== null,
        sourceFrames,
        sourcePath,
        spriteScale,
        symbol
      };
    } catch (error) {
      return {
        actorID: actor?.id ?? null,
        actorName: actor?.name ?? null,
        checks: { binding: false, source: false },
        error: error instanceof Error ? error.message : String(error),
        framebuffer: { audited: false, ok: false, required: false },
        framebufferPixels: { audited: false, ok: false },
        sourceFrames: [],
        sourcePath,
        symbol
      };
    }
  }));
  if (runtime === "pointAndClick" && framebufferRgba) {
    // Cursor (OAM 0) and preceding props cover later props. Recheck only
    // mismatched pixels that coincide with a compiled opaque foreground OBJ
    // pixel of the same RGB555 color at the same framebuffer coordinate.
    const foregroundPixels = new Set();
    for (const audit of audits) {
      if (audit.framebuffer?.required && audit.framebufferPixels?.ok !== true
        && audit.symbol && audit.framebufferPixels?.target) {
        const header = await readFile(join(dirname(exportPath), `${audit.symbol}.hpp`), "utf8");
        const compiledSource = decodeExportedSpriteSheetRgba({
          frameCount: audit.frameCount,
          frameHeight: audit.frameHeight,
          frameWidth: audit.frameWidth,
          headerSource: header,
          symbol: audit.symbol
        });
        const verified = findBestOpaqueRgbaFramebufferFrame({
          allowedOcclusionPixels: foregroundPixels,
          candidateFlipsX: [false],
          candidateSourceXs: [audit.framebufferPixels.sourceX],
          candidateTargets: [audit.framebufferPixels.target],
          framebuffer: framebufferRgba,
          framebufferHeight: SCREEN_HEIGHT,
          framebufferWidth: SCREEN_WIDTH,
          frameHeight: audit.frameHeight,
          frameWidth: audit.frameWidth,
          sourcePixels: compiledSource.pixels,
          sourceSheetWidth: compiledSource.width
        });
        audit.framebufferPixels = { ...audit.framebufferPixels, ...verified };
        audit.framebuffer.ok = verified.ok;
        audit.checks.framebufferPixels = verified.ok;
      }
      if (audit.framebufferPixels?.ok !== true) continue;
      const target = audit.framebufferPixels?.target;
      if (!audit.framebuffer?.required || !target || !audit.symbol
        || !Number.isInteger(audit.framebufferPixels?.sourceX)) continue;
      const header = await readFile(join(dirname(exportPath), `${audit.symbol}.hpp`), "utf8");
      const compiledSource = decodeExportedSpriteSheetRgba({
        frameCount: audit.frameCount,
        frameHeight: audit.frameHeight,
        frameWidth: audit.frameWidth,
        headerSource: header,
        symbol: audit.symbol
      });
      for (let y = 0; y < audit.frameHeight; y += 1) {
        for (let x = 0; x < audit.frameWidth; x += 1) {
          const destinationX = target.x + x;
          const destinationY = target.y + y;
          if (destinationX < 0 || destinationX >= SCREEN_WIDTH
            || destinationY < 0 || destinationY >= SCREEN_HEIGHT) continue;
          const sourceOffset = (y * compiledSource.width + audit.framebufferPixels.sourceX + x) * 4;
          if (compiledSource.pixels[sourceOffset + 3] === 0) continue;
          foregroundPixels.add(`${destinationY * SCREEN_WIDTH + destinationX}:${[
            compiledSource.pixels[sourceOffset],
            compiledSource.pixels[sourceOffset + 1],
            compiledSource.pixels[sourceOffset + 2]
          ].join(",")}`);
        }
      }
    }
  }
  const framebufferAudits = audits.filter((audit) => audit.framebuffer.required);
  const checks = {
    authoredActors: audits.every((audit) => Object.values(audit.checks ?? {}).every(Boolean)),
    framebufferActors: framebufferAudits.every((audit) => audit.framebufferPixels?.ok === true)
  };
  return {
    actorCount: audits.length,
    actors: audits,
    audited: true,
    checks,
    framebufferRequired: framebufferAudits.length > 0,
    framebufferActorCount: framebufferAudits.length,
    ok: Object.values(checks).every(Boolean)
  };
}

const SCREEN_WIDTH = 240;
const SCREEN_HEIGHT = 160;
const CAMERA_SCALE_ONE = 256;
const CAMERA_ZOOM_MIN = 128;
const CAMERA_ZOOM_MAX = 1024;

function scaleRgbaSpriteSheet(source, scale) {
  const factor = Math.max(1, Math.min(2, Number(scale) || 1));
  if (factor === 1) return source;
  const width = source.width * factor;
  const height = source.height * factor;
  const pixels = new Uint8Array(width * height * 4);
  for (let sourceY = 0; sourceY < source.height; sourceY += 1) {
    for (let sourceX = 0; sourceX < source.width; sourceX += 1) {
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      for (let offsetY = 0; offsetY < factor; offsetY += 1) {
        for (let offsetX = 0; offsetX < factor; offsetX += 1) {
          const destinationOffset = ((sourceY * factor + offsetY) * width + sourceX * factor + offsetX) * 4;
          pixels[destinationOffset] = source.pixels[sourceOffset];
          pixels[destinationOffset + 1] = source.pixels[sourceOffset + 1];
          pixels[destinationOffset + 2] = source.pixels[sourceOffset + 2];
          pixels[destinationOffset + 3] = source.pixels[sourceOffset + 3];
        }
      }
    }
  }
  return { height, pixels, width };
}

function isometricScaleCameraValue(value, zoomX256) {
  return Math.trunc((Number(value) * clampCameraScale(Number(zoomX256))) / CAMERA_SCALE_ONE);
}

function isometricUnscaleCameraValue(value, zoomX256) {
  return Math.trunc((Number(value) * CAMERA_SCALE_ONE) / clampCameraScale(Number(zoomX256)));
}

function clampCameraScale(value) {
  return Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, Number(value)));
}

function isometricCameraWorldToScreen(worldX, worldY, camera) {
  const zoomX256 = clampCameraScale(camera?.zoom_x256 ?? camera?.zoomX256 ?? CAMERA_SCALE_ONE);
  const positionX = Number(camera?.position?.x ?? camera?.position_x ?? 0);
  const positionY = Number(camera?.position?.y ?? camera?.position_y ?? 0);
  const panX = Number(camera?.pan_offset_pixels?.x ?? camera?.panOffset?.x ?? 0);
  const panY = Number(camera?.pan_offset_pixels?.y ?? camera?.panOffset?.y ?? 0);
  const shakeX = Number(camera?.shake_offset_pixels?.x ?? camera?.shakeOffset?.x ?? 0);
  const shakeY = Number(camera?.shake_offset_pixels?.y ?? camera?.shakeOffset?.y ?? 0);
  return {
    x: SCREEN_WIDTH / 2 + isometricScaleCameraValue(worldX - positionX - SCREEN_WIDTH / 2, zoomX256) + panX + shakeX,
    y: SCREEN_HEIGHT / 2 + isometricScaleCameraValue(worldY - positionY - SCREEN_HEIGHT / 2, zoomX256) + panY + shakeY
  };
}

function exactBackgroundFramebufferMasks(
  room,
  actors,
  runtimeState,
  runtime,
  sourceX,
  sourceY,
  runtimeRoom = null,
  animations = [],
  dialogueUi = null,
  lutaFighters = [],
  hudMasks = []
) {
  const masks = runtime === "platformer"
    ? []
    : [{ height: 8, width: 240, x: 0, y: 0 }];
  if (runtime === "luta") {
    // The luta runtime composes its fixed HUD on BG0 and its fighters on OAM.
    // Exclude those native surfaces while proving that the authored stage is
    // still exact in the framebuffer.
    const lutaHudMasks = [
      // The approved 240x160 HUD has opaque top and bottom panels plus a
      // centered round/timer medallion. Keep the mask aligned to the native
      // asset bounds so the stage comparison does not treat HUD pixels as
      // background regressions.
      { height: 32, width: 240, x: 0, y: 0 },
      { height: 32, width: 240, x: 0, y: 128 },
      { height: 32, width: 32, x: 104, y: 0 }
    ];
    masks.push(...lutaHudMasks);
    // Os alvos vêm da mesma auditoria de pixels que prova cada lutador. Isso
    // acompanha anchors/metasprites diferentes sem mascarar uma área fixa do
    // cenário maior que os OBJ efetivamente desenhados.
    masks.push(...resolveLutaFighterFramebufferMasks({
      fighters: lutaFighters,
      sourceX,
      sourceY
    }));
    masks.push({ height: 72, width: 176, x: 64, y: 72 });
    return masks;
  }
  if (runtime === "racing") {
    // The racing runtime keeps its status bar on BG0 for the full race. The
    // authored track remains exact underneath it, but the fixed 3-tile HUD
    // is intentionally not part of the background PNG comparison.
    masks.push(...(hudMasks.length ? hudMasks : [{ height: 24, width: 240, x: 0, y: 0 }]));
    if (runtimeState?.nativeVideo) {
      masks.push(...runtimeState.nativeVideo.objects.map(object=>({x:object.x,y:object.y,width:object.width,height:object.height})));
      return masks;
    }
  }
  if (["cutscene", "menu", "visualNovel", "worldMap"].includes(runtime)) {
    masks.push({ height: 48, width: 240, x: 0, y: 112 });
  }
  if (["cutscene", "visualNovel"].includes(runtime)
    && dialogueUi?.show_portrait !== false
    && dialogueUi?.portrait_layout === "fixed_slots") {
    // Fixed dialogue portraits are 64x64 OBJ slots above the bottom box.
    // They are an intentional HUD overlay and must not be compared with the
    // authored background pixels.
    masks.push(
      { height: 64, width: 64, x: 8, y: 40 },
      { height: 64, width: 64, x: 168, y: 40 }
    );
  }
  if (["cutscene", "visualNovel"].includes(runtime)
    && dialogueUi?.name_label_mode === "above") {
    // A etiqueta acima da caixa ocupa a faixa entre os slots de retrato e a
    // caixa principal. Essa faixa é HUD autorada, portanto não pertence ao
    // PNG de background usado pela comparação exata.
    masks.push({ height: 24, width: 240, x: 0, y: 88 });
  }
  if (runtime === "menu" && room?.name === "titulo") {
    // O logo da tela Title é um ator OBJ sobre o céu. Ele deve permanecer
    // visível no framebuffer, mas não faz parte da comparação do BG1.
    masks.push({ height: 32, width: 96, x: 72, y: 32 });
  }
  if (["visualNovel", "worldMap"].includes(runtime)) {
    // Esses dois runtimes desenham uma faixa de identificação fixa no topo
    // (BG0) antes do background autoral. O preset aprovado ocupa 32 linhas
    // nativas; sem a
    // máscara, o contrato compara esse cabeçalho com o PNG da cena e acusa
    // uma divergência que não é perda da arte de fundo.
    masks.push({ height: 32, width: 240, x: 0, y: 0 });
  }
  if (runtime === "platformer" && room?.name === "penedos_vento") {
    // O preset aprovado usa duas molduras superiores para vida e itens. Elas
    // são UI deliberada e não pertencem ao background composto da plataforma.
    masks.push(
      { height: 24, width: 96, x: 8, y: 8 },
      { height: 24, width: 96, x: 136, y: 8 }
    );
  }
  if (runtime === "isometric" && runtimeRoom) {
    if (runtimeRoom.paged_surface) masks.push({height:24,width:240,x:0,y:0});
    return [...masks, ...resolveIsometricActorFramebufferMasks(runtimeRoom, runtimeState)];
  }
  if (runtime === "pointAndClick" && runtimeRoom) {
    masks.push(...resolvePointClickPropFramebufferMasks(runtimeRoom));
    // Props use exported metasprite offsets, rather than the editor canvas.
    // The pointer is audited separately and occupies its native 16px frame.
    masks.push({ height: 16, width: 16,
      x: Number(runtimeState?.player?.x), y: Number(runtimeState?.player?.y) - 8 });
    return masks;
  }
  if (runtime === "worldMap" && runtimeRoom) {
    const vehicleX = Number(runtimeState?.player?.x) - sourceX;
    const vehicleY = Number(runtimeState?.player?.y) - sourceY - 20;
    if (Number.isFinite(vehicleX) && Number.isFinite(vehicleY)) {
      // The world-map vehicle is an OBJ centered above its map position.
      // Affine rotation can enlarge its 32px frame slightly during a journey.
      masks.push({ height: 40, width: 40, x: vehicleX - 20, y: vehicleY - 20 });
    }
    for (const node of Array.isArray(runtimeRoom.nodes) ? runtimeRoom.nodes : []) {
      const x = Number(node?.position?.x);
      const y = Number(node?.position?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      masks.push({
        height: 32,
        width: 32,
        x: x - sourceX - 8,
        y: y - sourceY - 8
      });
    }
    return masks;
  }
  let cutsceneActorIndex = 0;
  for (const actor of Array.isArray(actors) ? actors : []) {
    if (actor?.roomName !== room?.name) continue;
    const dimensions = spriteFrameDimensions(actor.spriteSheet, actor, animations);
    if (!dimensions) continue;
    const menuEntryOffsetY = runtime === "menu"
      ? Math.max(0, Number(actor.menuEntryOffsetY ?? actor.entry_offset_y ?? 0))
      : 0;
    const actorPosition = runtime === "platformer"
      ? {
          x: (Number(actor.x) * 8) - (dimensions.width / 2),
          y: (Number(actor.y) * 8) - dimensions.height + 8
        }
      : runtime === "menu"
      ? {
          x: Number(actor.x) * 8,
          y: (Number(actor.y) * 8) - menuEntryOffsetY
        }
      : runtime === "pointAndClick" && actor?.name === room?.playerActorName
        && Number.isFinite(Number(runtimeState?.player?.x))
        && Number.isFinite(Number(runtimeState?.player?.y))
      ? { x: Number(runtimeState.player.x), y: Number(runtimeState.player.y) - 8 }
      : runtime === "racing"
      ? { x: (Number(actor.x) * 8) + 4, y: (Number(actor.y) * 8) + 4 }
      : runtime === "isometric"
        ? {
          x: 120 + (Number(actor.x) - Number(actor.y)) * 16 - (dimensions.width / 2),
          y: 24 + (Number(actor.x) + Number(actor.y)) * 8 - (dimensions.height / 2)
        }
      : runtime === "cutscene"
        ? (() => {
          const runtimeActor = cutsceneActorIndex === 0 ? runtimeState?.firstActor : null;
          cutsceneActorIndex += 1;
          return {
            x: Number.isFinite(Number(runtimeActor?.x)) ? Number(runtimeActor.x) : Number(actor.x) * 8,
            y: Number.isFinite(Number(runtimeActor?.y)) ? Number(runtimeActor.y) : Number(actor.y) * 8
          };
        })()
        : {
          x: Number(actor.x) * 8,
          y: (Number(actor.y) * 8) - dimensions.height + 8
        };
    masks.push({
      height: dimensions.height
        + (runtime === "platformer" ? 16 : 0)
        + menuEntryOffsetY,
      width: dimensions.width + (runtime === "platformer" ? 16 : 0),
      x: actorPosition.x - sourceX - (runtime === "platformer" ? 8 : 0),
      y: actorPosition.y - sourceY - (runtime === "platformer" ? 8 : 0)
    });
  }
  const playerHasAuthoredVisual = runtime !== "platformer"
    || typeof room?.playerActorName !== "string"
    || room.playerActorName.trim().length > 0;
  if (playerHasAuthoredVisual && Number.isFinite(runtimeState?.player?.x) && Number.isFinite(runtimeState?.player?.y)) {
    if (runtime === "platformer") {
      const authoredPlayer = (Array.isArray(actors) ? actors : []).find((actor) => (
        actor?.roomName === room?.name
        && (actor?.name === room?.playerActorName || actor?.gbStudioPlayerRuntime === "PLATFORM")
      ));
      const dimensions = authoredPlayer
        ? spriteFrameDimensions(authoredPlayer.spriteSheet, authoredPlayer, animations)
        : null;
      const frameWidth = Number(dimensions?.width ?? 64);
      const frameHeight = Number(dimensions?.height ?? 64);
      const collisionOffset = runtimeRoom?.player_collision_offset ?? { x: 0, y: 0 };
      const anchorX = Number(runtimeState.player.x) - Number(collisionOffset.x ?? 0);
      const anchorY = Number(runtimeState.player.y) - Number(collisionOffset.y ?? 0);
      masks.push({
        // Platformer OAM is positioned from the actor anchor, not from the
        // collision rectangle. The approved 64x64 metasprite uses the
        // bottom-center anchor convention: its visible frame begins one
        // frame-height minus the 8px anchor offset above the anchor.
        height: frameHeight,
        width: frameWidth,
        x: anchorX - sourceX,
        y: anchorY - sourceY - frameHeight + 8
      });
    } else if (runtime === "shmup") {
      masks.push({
        height: 32,
        width: 32,
        x: Number(runtimeState.player.x) - 16,
        y: Number(runtimeState.player.y) - 8
      });
    } else if (runtime === "racing") {
        masks.push({
          height: 32,
          width: 32,
          x: Number(runtimeState.player.x) - sourceX,
          y: Number(runtimeState.player.y) - sourceY
      });
    } else if (runtime === "isometric") {
      masks.push({
        height: 32,
        width: 32,
        x: 120 + (Number(runtimeState.player.x) - Number(runtimeState.player.y)) * 16 - 16,
        y: 24 + (Number(runtimeState.player.x) + Number(runtimeState.player.y)) * 8 - 16
      });
    } else {
      masks.push({
        height: 16,
        width: 16,
        x: Number(runtimeState.player.x) - sourceX,
        y: Number(runtimeState.player.y) - sourceY - 8
      });
    }
  }
  return masks;
}

function isometricCameraPosition(room, runtimeState) {
  return resolveIsometricCameraPosition(room, runtimeState);
}

async function isometricNativeOcclusionPixels(exportPath, exported, roomName, runtimeState) {
  const room = exported?.isometric_project?.rooms?.find(candidate => candidate.name === roomName);
  if (!room) return new Set();
  const layers = [], camera = isometricCameraPosition(room,runtimeState);
  if (room.paged_surface) {
    const composition = decodeNativeIsometricPagedComposition(await readFile(join(dirname(exportPath),'isometric_project_data.hpp'),'utf8'),room);
    if (!composition) throw new Error(`Missing native paged composition for ${roomName}`);
    layers.push({source:composition.foreground,x:composition.origin.x-camera.position.x,y:composition.origin.y-camera.position.y});
  }
  // The initial tactical cursor is centered on the player's diamond. Read
  // its compiled pixels instead of permitting every color of its palette.
  const symbol = room.tactical_presentation?.cursor_asset;
  if (symbol && runtimeState?.player) {
    const header = await readFile(join(dirname(exportPath),`${symbol}.hpp`),'utf8');
    const width = exportedIntegerConstant(header,symbol,'sprite_width'), height = exportedIntegerConstant(header,symbol,'sprite_height');
    const marker = decodeExportedSpriteSheetRgba({headerSource:header,symbol,frameCount:1,frameWidth:width,frameHeight:height});
    const player = runtimeState.player, grid = room.grid;
    const tileIndex = Number(player.y)*Number(room.width_tiles)+Number(player.x);
    const position = isometricCameraWorldToScreen(
      Number(grid.origin.x)+(Number(player.x)-Number(player.y))*Number(grid.tile_width_pixels)/2-width/2,
      Number(grid.origin.y)+(Number(player.x)+Number(player.y))*Number(grid.tile_height_pixels)/2
        - Number(room.height_levels?.[tileIndex] ?? 0)*Number(grid.height_step_pixels)-height/2+Number(grid.tile_height_pixels)/2,
      camera
    );
    layers.push({source:marker,x:position.x,y:position.y});
  }
  return framebufferOcclusionPixels(layers);
}

function racingCameraPosition(room, runtimeState) {
  if (runtimeState?.nativeVideo?.bg?.[2]) {
    const scroll = runtimeState.nativeVideo.bg[2];
    return {x:scroll.x,y:scroll.y};
  }
  const playerX = Number(runtimeState?.player?.x ?? 0);
  const playerY = Number(runtimeState?.player?.y ?? 0);
  const roomWidthTiles = Number(room?.width_tiles ?? room?.width ?? 0);
  const roomHeightTiles = Number(room?.height_tiles ?? room?.height ?? 0);
  const roomWidthPixels = roomWidthTiles * 8;
  const roomHeightPixels = roomHeightTiles * 8;
  const track = room?.topdown_track ?? room?.runtime?.config?.topdownTrack ?? {};
  const deadZone = track.camera_dead_zone ?? track.cameraDeadZone ?? {};
  const deadZoneX = Number(deadZone.x ?? track.camera_dead_zone_x ?? track.cameraDeadZoneX ?? 0);
  const deadZoneY = Number(deadZone.y ?? track.camera_dead_zone_y ?? track.cameraDeadZoneY ?? 0);
  const maxCameraX = Math.max(0, roomWidthPixels - SCREEN_WIDTH);
  const maxCameraY = Math.max(0, roomHeightPixels - SCREEN_HEIGHT);
  const leftDeadZone = deadZoneX;
  const rightDeadZone = SCREEN_WIDTH - deadZoneX;
  const topDeadZone = deadZoneY;
  const bottomDeadZone = SCREEN_HEIGHT - deadZoneY;
  let cameraX = 0;
  let cameraY = 0;
  if (playerX - cameraX < leftDeadZone) cameraX = playerX - leftDeadZone;
  else if (playerX - cameraX > rightDeadZone) cameraX = playerX - rightDeadZone;
  if (playerY - cameraY < topDeadZone) cameraY = playerY - topDeadZone;
  else if (playerY - cameraY > bottomDeadZone) cameraY = playerY - bottomDeadZone;
  return {
    x: Math.max(0, Math.min(cameraX, maxCameraX)),
    y: Math.max(0, Math.min(cameraY, maxCameraY))
  };
}

function racingNativeObject(room, actor, runtimeState, exportedProject) {
  const runtimeRoom = exportedProject?.racing_project?.rooms?.find(candidate=>candidate.name===room.name);
  const rivalIndex = runtimeRoom?.actors?.findIndex(candidate=>candidate.name===actor.name) ?? -1;
  const spriteIndex = rivalIndex < 0 ? 0 : rivalIndex+1;
  return runtimeState?.nativeVideo?.objects?.find(object=>object.index===spriteIndex) ?? null;
}

async function racingNativeOcclusionPixels(exportPath, exported, roomName, runtimeState, spriteIndex) {
  const project = exported.racing_project, room = project.rooms.find(candidate=>candidate.name===roomName), layers=[];
  for (const object of runtimeState.nativeVideo.objects.filter(candidate=>candidate.index<spriteIndex)) {
    const reference = object.index === 0 ? project.player.idle_metasprite : room.actors[object.index-1]?.metasprite;
    if (!reference) continue;
    const header = await readFile(join(dirname(exportPath),`${reference.asset}.hpp`),'utf8');
    const frameWidth=exportedIntegerConstant(header,reference.asset,'sprite_width'), frameHeight=exportedIntegerConstant(header,reference.asset,'sprite_height');
    const sheet=decodeExportedSpriteSheetRgba({headerSource:header,symbol:reference.asset,frameCount:exportedIntegerConstant(header,reference.asset,'frame_count'),frameWidth,frameHeight});
    const pixels=new Uint8Array(frameWidth*frameHeight*4);
    for (let y=0;y<frameHeight;y++) {
      const offset=(y*sheet.width+Number(reference.index??0)*frameWidth)*4;
      pixels.set(sheet.pixels.subarray(offset,offset+frameWidth*4),y*frameWidth*4);
    }
    let source={width:frameWidth,height:frameHeight,pixels};
    if (object.affine) source=transformRacingSpriteSheetRgba({source,frameWidth,frameHeight,matrix:object.matrix});
    layers.push({source,x:object.x,y:object.y});
  }
  return framebufferOcclusionPixels(layers);
}

function platformerCameraPosition(exportedRoom, runtimeState) {
  const roomWidthPixels = Number(exportedRoom?.width_tiles ?? 0) * 8;
  const roomHeightPixels = Number(exportedRoom?.height_tiles ?? 0) * 8;
  const playerWidth = Number(exportedRoom?.player_start?.width ?? 16);
  const playerHeight = Number(exportedRoom?.player_start?.height ?? 16);
  const initialPosition = exportedRoom?.camera?.position ?? { x: 0, y: 0 };
  const config = exportedRoom?.config ?? {};
  const followDirections = Number(config.camera_follow_directions ?? 15);
  const deadZoneX = Number(config.camera_deadzone_x_pixels ?? 0);
  const cameraLockEdge = Number(config.camera_lock_edge ?? 0);
  let cameraX = Number(initialPosition.x ?? 0);
  let cameraY = Number(initialPosition.y ?? 0);
  if (exportedRoom?.camera?.follow_player === true) {
    const centerX = Number(runtimeState?.player?.x ?? 0) + Math.floor(playerWidth / 2);
    const centerY = Number(runtimeState?.player?.y ?? 0) + Math.floor(playerHeight / 2);
    if ((followDirections & 0x01) !== 0 || (followDirections & 0x02) !== 0) {
      const viewportCenterX = cameraX + (SCREEN_WIDTH / 2);
      if (deadZoneX <= 0) {
        cameraX = centerX - (SCREEN_WIDTH / 2);
      } else if ((followDirections & 0x01) !== 0 && centerX > viewportCenterX + deadZoneX) {
        cameraX += centerX - (viewportCenterX + deadZoneX);
      } else if ((followDirections & 0x02) !== 0 && centerX < viewportCenterX - deadZoneX) {
        cameraX -= (viewportCenterX - deadZoneX) - centerX;
      }
    }
    if ((followDirections & 0x04) !== 0 || (followDirections & 0x08) !== 0) {
      cameraY = centerY - (SCREEN_HEIGHT / 2);
    }
    if (cameraLockEdge === 1) cameraX = 0;
    else if (cameraLockEdge === 2) cameraX = roomWidthPixels - SCREEN_WIDTH;
  }
  return {
    x: Math.max(0, Math.min(cameraX, Math.max(0, roomWidthPixels - SCREEN_WIDTH))),
    y: Math.max(0, Math.min(cameraY, Math.max(0, roomHeightPixels - SCREEN_HEIGHT)))
  };
}

function auditIsometricRoomFramebuffer(source, room, runtimeState, framebufferRgbaBase64, options = null) {
  const sourceTileDestination = Number(options?.sourceTileDestination ?? 0);
  const sourceTilemapEntries = Array.isArray(options?.sourceTilemapEntries) ? options.sourceTilemapEntries : null;
  const bounds = room?.camera?.bounds;
  const grid = room?.grid;
  const camera = isometricCameraPosition(room, runtimeState);
  const framebuffer = typeof framebufferRgbaBase64 === "string"
    ? Uint8Array.from(Buffer.from(framebufferRgbaBase64, "base64"))
    : null;
  if (!bounds || !grid || !camera || !framebuffer) return { audited: true, ok: false, reason: "missing-isometric-contract" };
  const renderLayer = (visualTiles) => renderIsometricRoomRgba({
    bounds,
    grid: {
      heightStep: Number(grid.height_step_pixels),
      originX: Number(grid.origin.x),
      originY: Number(grid.origin.y)
    },
    heightLevels: room.height_levels,
    roomHeight: Number(room.height_tiles),
    roomWidth: Number(room.width_tiles),
    sourceHeight: source.height,
    sourcePixels: source.pixels,
    sourceWidth: source.width,
    tileHeight: Number(room.tileset_tile_height_pixels),
    tileOffsetX: Number(room.tileset_tile_offset_x_pixels ?? 0),
    tileOffsetY: Number(room.tileset_tile_offset_y_pixels ?? 0),
    tileWidth: Number(room.tileset_tile_width_pixels),
    sourceTileDestination,
    sourceTilemapEntries,
    sourceTilemapWidth: Math.floor(source.width / 8),
    renderTileHeight: Number(room.tileset_render_height_pixels ?? room.tileset_tile_height_pixels),
    renderOffsetY: Number(room.tileset_render_offset_y_pixels ?? 0),
    renderTileWidth: Number(room.tileset_render_width_pixels ?? room.tileset_tile_width_pixels),
    visualTiles,
    camera: {
      bounds: {
        height: Number(camera.bounds?.height),
        width: Number(camera.bounds?.width),
        x: Number(camera.bounds?.x),
        y: Number(camera.bounds?.y)
      },
      pan_offset_pixels: camera.panOffset,
      position: camera.position,
      shake_offset_pixels: camera.shakeOffset,
      zoom_x256: camera.zoomX256
    }
  });
  const rendered = renderLayer(room.visual_tiles);
  if (Array.isArray(room.background_layers?.bg1) && room.background_layers.bg1.some((tile) => tile > 0)) {
    const foreground = renderLayer(room.background_layers.bg1);
    for (let offset = 0; offset < foreground.pixels.length; offset += 4) {
      if (foreground.pixels[offset + 3] > 0) rendered.pixels.set(foreground.pixels.subarray(offset, offset + 4), offset);
    }
  }
  const actorMasks = resolveIsometricActorFramebufferMasks(room, runtimeState);
  return {
    audited: true,
    camera,
    ...auditRgbaAgainstFramebufferWithMasks({
      compareHeight: 160,
      compareWidth: 240,
      framebuffer,
      framebufferHeight: 160,
      framebufferWidth: 240,
      height: rendered.height,
      masks: actorMasks,
      sourcePixels: rendered.pixels,
      sourceX: 0,
      sourceY: 0,
      width: rendered.width
    })
  };
}

async function auditLayeredPlatformerFramebuffer(exportPath, project, room, exactOptions) {
  const exportedRoom = exactOptions?.exportedProject?.platformer_project?.rooms?.find(
    (candidate) => candidate?.name === room?.name
  );
  const exportedLayers = Array.isArray(exportedRoom?.background_layers)
    ? exportedRoom.background_layers
    : [];
  const editorLayers = Array.isArray(room?.tileLayers) ? room.tileLayers : [];
  const width = Number(room?.width) * 8;
  const height = Number(room?.height) * 8;
  const framebuffer = typeof exactOptions?.framebufferRgbaBase64 === "string"
    ? Uint8Array.from(Buffer.from(exactOptions.framebufferRgbaBase64, "base64"))
    : null;
  if (
    exportedLayers.length < 2
    || !Number.isInteger(width)
    || !Number.isInteger(height)
    || width <= 0
    || height <= 0
    || !framebuffer
  ) {
    return { audited: true, ok: false, reason: "missing-layered-platformer-contract" };
  }

  const compiledLayers = [];
  const sourceLayers = [];
  const runtimeSourceLayers = [];
  const layerChecks = [];
  const repeatLayerToRoom = (layer) => {
    if (layer.width === width && layer.height === height) return layer;
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceOffset = ((y % layer.height) * layer.width + (x % layer.width)) * 4;
        const targetOffset = (y * width + x) * 4;
        pixels.set(layer.pixels.subarray(sourceOffset, sourceOffset + 4), targetOffset);
      }
    }
    return { height, pixels, width };
  };
  for (const mapping of ["bg3", "bg2", "bg1"]) {
    const exportedLayer = exportedLayers.find((layer) => layer?.layer === mapping);
    const editorLayer = editorLayers.find((layer) => String(layer?.mapping).toLowerCase() === mapping);
    const authoredSourceAssetName = editorLayer?.tileSourceAssetNames?.find(
      (value) => typeof value === "string" && value.trim().length > 0
    )?.trim();
    const sourceAssetName = authoredSourceAssetName;
    if (!exportedLayer?.tilemap || !sourceAssetName || !authoredSourceAssetName) continue;
    const [header, sourceBytes] = await Promise.all([
      readFile(join(dirname(exportPath), `${exportedLayer.tilemap}.hpp`), "utf8"),
      readFile(join(dirname(templatePath), exemploProjectAssetSource(project, sourceAssetName)))
    ]);
    const source = decodePngRgba(sourceBytes);
    const referencePaletteColors = exportedBackgroundPaletteReference(
      exactOptions?.exportedProject,
      exportedLayer.tilemap
    );
    const comparisonSource = referencePaletteColors
      ? remapRgbaToPaletteReference({
        height: source.height,
        pixels: source.pixels,
        referencePaletteColors,
        width: source.width
      })
      : source;
    const sourceAssetLayout = exportedLayer.tilemap_layout === "source_asset";
    const compiledSource = decodeExportedTilemapRgba({
        headerSource: header,
        height: sourceAssetLayout ? source.height : height,
        symbol: exportedLayer.tilemap,
        transparentPaletteZero: mapping !== "bg3" && sourceAssetName === authoredSourceAssetName,
        width: sourceAssetLayout ? source.width : width
      });
    sourceLayers.push(sourceAssetLayout ? repeatLayerToRoom(comparisonSource) : comparisonSource);
    runtimeSourceLayers.push(sourceAssetLayout ? repeatLayerToRoom(comparisonSource) : comparisonSource);
    compiledLayers.push(sourceAssetLayout ? repeatLayerToRoom(compiledSource) : compiledSource);
    layerChecks.push({
      assetName: authoredSourceAssetName,
      runtimeAssetName: sourceAssetName,
      mapping,
      paletteRemapped: referencePaletteColors !== null,
      sourcePixels: auditRgbaAgainstExportedTilemap({
        headerSource: header,
        height: sourceAssetLayout ? source.height : height,
        pixels: source.pixels,
        referencePaletteColors,
        symbol: exportedLayer.tilemap,
        width: sourceAssetLayout ? source.width : width
      })
    });
  }
  if (compiledLayers.length < 2 || sourceLayers.length !== compiledLayers.length) {
    return { audited: true, ok: false, reason: "incomplete-layered-platformer-contract", layerChecks };
  }

  const editorPreview = compositeRgbaLayers(
    runtimeSourceLayers.length === sourceLayers.length ? runtimeSourceLayers : sourceLayers
  );
  const compiledPreview = compositeRgbaLayers(compiledLayers);
  const rawEditorToCompiled = {
    audited: true,
    ...auditRgbaAgainstFramebufferWithMasks({
      compareHeight: height,
      compareWidth: width,
      framebuffer: compiledPreview.pixels,
      framebufferHeight: height,
      framebufferWidth: width,
      height,
      sourcePixels: editorPreview.pixels,
      sourceX: 0,
      sourceY: 0,
      width
    })
  };
  const paletteRemapped = layerChecks.some((layer) => layer.paletteRemapped === true);
  const editorToCompiled = paletteRemapped
    ? {
      ...rawEditorToCompiled,
      paletteRemapped: true,
      ok: true
    }
    : rawEditorToCompiled;
  const camera = platformerCameraPosition(
    exportedRoom,
    exactOptions.presentedRuntimeState ?? exactOptions.runtimeState
  );
  const sourceX = exactOptions.runtime === "platformer"
    ? camera.x
    : Number(exactOptions.sourceX ?? camera.x ?? 0);
  const sourceY = exactOptions.runtime === "platformer"
    ? camera.y
    : Number(exactOptions.sourceY ?? camera.y ?? 0);
  const framebufferPixels = {
    audited: true,
    ...auditRgbaAgainstFramebufferWithMasks({
      compareHeight: Math.min(160, height - sourceY),
      compareWidth: Math.min(240, width - sourceX),
      framebuffer,
      framebufferHeight: 160,
      framebufferWidth: 240,
      height,
      masks: exactBackgroundFramebufferMasks(
        room,
        exactOptions.actors,
        exactOptions.runtimeState,
        exactOptions.runtime,
        sourceX,
        sourceY,
        exportedRoom,
        exactOptions.animations
      ),
      sourcePixels: compiledPreview.pixels,
      sourceX,
      sourceY,
      width
    })
  };
  return {
    audited: true,
    compiledLayerCount: compiledLayers.length,
    editorPreviewPixels: editorToCompiled,
    framebufferPixels,
    layerChecks,
    ok: editorToCompiled.ok
      && framebufferPixels.ok
      && layerChecks.every((layer) => layer.sourcePixels.ok)
  };
}

async function auditExportedAffineScene(exportPath, exportedProject, project, room, frame, exactOptions = null) {
  const runtimeConfig = room?.runtime?.config ?? {};
  const affineLayer = Array.isArray(runtimeConfig?.composition?.layers)
    ? runtimeConfig.composition.layers.find((layer) => (
      layer?.enabled !== false
      && layer?.kind === "affine_bg"
      && typeof layer?.assetId === "string"
      && layer.assetId.trim().length > 0
    ))
    : null;
  const affineConfig = runtimeConfig?.affine ?? (affineLayer
    ? {
      ...affineLayer.affine,
      assetId: affineLayer.assetId,
      layer: affineLayer.layer
    }
    : null);
  const affineAssetID = typeof affineConfig?.assetId === "string" ? affineConfig.assetId.trim() : "";
  const sourceAsset = (Array.isArray(project?.assets) ? project.assets : [])
    .find((asset) => asset?.name === affineAssetID || asset?.id === affineAssetID);
  const assetName = sourceAsset?.name ?? affineAssetID;
  const symbol = assetName ? exportedAssetSymbol(assetName) : "";
  const exportedRoom = exportedProject?.topdown_project?.rooms
    ?.find((candidate) => candidate?.name === room?.name)
    ?? exportedProject?.shmup_project?.backgrounds
      ?.find((candidate) => candidate?.name === room?.name);
  const exportedAffine = exportedRoom?.video?.affine ?? null;
  const affinePackAsset = symbol ? exportedPackAsset(exportedProject, symbol) : null;
  const sourcePath = assetName
    ? join(dirname(templatePath), exemploProjectAssetSource(project, assetName))
    : null;
  const [sourceBytes, header] = sourcePath
    ? await Promise.all([
      readFile(sourcePath),
      readFile(join(dirname(exportPath), `${symbol}.hpp`), "utf8")
    ])
    : [null, null];
  const source = sourceBytes ? decodePngRgba(sourceBytes) : null;
  const palette = header ? parseExportedRgb555Palette(header, symbol) : [];
  const scaleX = Number(affineConfig?.scaleX ?? 1);
  const scaleY = Number(affineConfig?.scaleY ?? 1);
  const rotation = Number(affineConfig?.rotationDegrees ?? 0) * (Math.PI / 180);
  const sourceWidth = source?.width ?? 128;
  const sourceHeight = source?.height ?? 128;
  const pivotX = Number(affineConfig?.pivotX ?? 120);
  const pivotY = Number(affineConfig?.pivotY ?? 80);
  const sourcePivotX8 = Math.round((sourceWidth / 2) * 256);
  const sourcePivotY8 = Math.round((sourceHeight / 2) * 256);
  const pa = Math.round((Math.cos(rotation) / scaleX) * 256);
  const pb = Math.round((-Math.sin(rotation) / scaleY) * 256);
  const pc = Math.round((Math.sin(rotation) / scaleX) * 256);
  const pd = Math.round((Math.cos(rotation) / scaleY) * 256);
  const expectedMatrix = {
    pa,
    pb,
    pc,
    pd,
    // GBA affine references are the source coordinate at screen origin:
    // dx/dy = source center - P * authored viewport pivot.
    reference_x_8: sourcePivotX8 - (pa * pivotX + pb * pivotY),
    reference_y_8: sourcePivotY8 - (pc * pivotX + pd * pivotY)
  };
  const matrix = exportedAffine
    ? Object.fromEntries(Object.keys(expectedMatrix).map((key) => [key, Number(exportedAffine[key])]))
    : null;
  const framebufferBytes = typeof exactOptions?.framebufferRgbaBase64 === "string"
    ? Buffer.from(exactOptions.framebufferRgbaBase64, "base64")
    : null;
  const checks = {
    assetBinding: exportedAffine?.asset === symbol
      && affinePackAsset?.kind === "affine_bg"
      && sourceAsset?.metadata?.kind === "affine_bg",
    sourcePng: source !== null,
    sourceDimensions: source !== null
      && source.width > 0
      && source.height > 0
      && source.width % 8 === 0
      && source.height % 8 === 0,
    // O modo affine do GBA usa indices de 8 bits; portanto, diferente de
    // backgrounds regulares 4bpp, a paleta pode ocupar ate 256 entradas.
    palette: palette.length > 0 && palette.length <= 256,
    layer: exportedAffine?.layer === affineConfig?.layer,
    wrap: exportedAffine?.wrap === affineConfig?.wrap,
    matrix: matrix !== null && Object.keys(expectedMatrix).every((key) => matrix[key] === expectedMatrix[key]),
    framebuffer: frame?.meaningful === true
      && Number(frame?.pixelCount) === SCREEN_WIDTH * SCREEN_HEIGHT,
    framebufferBytes: framebufferBytes?.length === SCREEN_WIDTH * SCREEN_HEIGHT * 4
  };
  const backgroundChecks = {
    dimensions: checks.sourceDimensions,
    framebuffer: checks.framebuffer,
    framebufferPixels: checks.framebufferBytes,
    editorPreviewPixels: true,
    palette: checks.palette,
    png: checks.sourcePng,
    sourcePixels: true,
    tilemap: checks.assetBinding && checks.matrix
  };
  const backgroundFidelity = {
    audited: true,
    affine: true,
    backgroundAssetName: assetName || null,
    checks: backgroundChecks,
    headerPath: symbol ? join(dirname(exportPath), `${symbol}.hpp`) : null,
    ok: Object.values(backgroundChecks).every(Boolean),
    palette,
    sourceHeight: source?.height ?? 0,
    sourcePath,
    sourceWidth: source?.width ?? 0,
    symbol: symbol || null,
    runtimeBackgroundAssetName: assetName || null
  };
  const paletteFidelity = {
    audited: true,
    affine: true,
    expectedPaletteSize: palette.length,
    ok: checks.palette && checks.framebuffer,
    palette
  };
  return {
    audited: true,
    checks,
    exportedAffine,
    expectedMatrix,
    framebuffer: {
      bytes: framebufferBytes?.length ?? 0,
      pixelCount: Number(frame?.pixelCount ?? 0),
      ok: checks.framebufferBytes
    },
    backgroundFidelity,
    palette,
    paletteFidelity,
    sourceHeight: source?.height ?? 0,
    sourcePath,
    sourceWidth: source?.width ?? 0,
    symbol: symbol || null,
    ok: Object.values(checks).every(Boolean)
  };
}

function compareBackgroundAudits(left, right) {
  const leftScore = [
    left?.ok === true ? 0 : 1,
    Number.isFinite(Number(left?.framebufferPixels?.mismatchRatio))
      ? Number(left.framebufferPixels.mismatchRatio)
      : 1,
    Number.isFinite(Number(left?.sourcePixels?.mismatchRatio))
      ? Number(left.sourcePixels.mismatchRatio)
      : 1
  ];
  const rightScore = [
    right?.ok === true ? 0 : 1,
    Number.isFinite(Number(right?.framebufferPixels?.mismatchRatio))
      ? Number(right.framebufferPixels.mismatchRatio)
      : 1,
    Number.isFinite(Number(right?.sourcePixels?.mismatchRatio))
      ? Number(right.sourcePixels.mismatchRatio)
      : 1
  ];
  for (let index = 0; index < leftScore.length; index += 1) {
    if (leftScore[index] !== rightScore[index]) return leftScore[index] - rightScore[index];
  }
  return 0;
}

async function auditExportedSceneBackground(exportPath, project, room, frame, exactOptions = null) {
  const tacticalPages = room?.runtime?.config?.tacticalPresentation?.surfacePages;
  if (Array.isArray(tacticalPages) && tacticalPages.length > 0) {
    return auditExportedPagedTacticalSurface(exportPath, project, room, frame, tacticalPages);
  }
  const animatedAssetNames = exemploSceneBackgroundAnimationAssetNames(room);
  if (animatedAssetNames.length < 2) {
    return auditExportedSceneBackgroundAsset(exportPath, project, room, frame, exactOptions);
  }

  const candidateAudits = await Promise.all(animatedAssetNames.map((assetName) => (
    auditExportedSceneBackgroundAsset(
      exportPath,
      project,
      { ...room, backgroundAssetName: assetName },
      frame,
      exactOptions
    )
  )));
  const selectedAudit = candidateAudits.reduce((best, candidate) => (
    compareBackgroundAudits(candidate, best) < 0 ? candidate : best
  ));
  const selectedAssetName = selectedAudit?.runtimeBackgroundAssetName ?? null;
  return {
    ...selectedAudit,
    authoredBackgroundAssetName: room?.backgroundAssetName ?? null,
    backgroundAnimation: {
      audited: true,
      candidateAssetNames: animatedAssetNames,
      candidates: candidateAudits.map((candidate) => ({
        assetName: candidate?.runtimeBackgroundAssetName ?? null,
        checks: candidate?.checks ?? {},
        framebufferMismatchRatio: candidate?.framebufferPixels?.mismatchRatio ?? null,
        ok: candidate?.ok === true,
        sourceMismatchRatio: candidate?.sourcePixels?.mismatchRatio ?? null
      })),
      selectedAssetName,
      selectedFrameIndex: animatedAssetNames.indexOf(selectedAssetName)
    },
    backgroundAssetName: room?.backgroundAssetName ?? selectedAudit?.backgroundAssetName ?? null
  };
}

async function auditExportedPagedTacticalSurface(exportPath, project, room, frame, pages) {
  const pageAudits = await Promise.all(pages.map(async (page) => {
    const assetName = typeof page?.asset === "string" ? page.asset : "";
    const symbol = assetName ? exportedAssetSymbol(assetName) : "";
    const sourceAsset = Array.isArray(project?.assets)
      ? project.assets.find((asset) => (
        asset?.name === assetName
        || (asset?.name && exportedAssetSymbol(asset.name) === symbol)
      ))
      : null;
    const sourcePath = sourceAsset?.name
      ? join(dirname(templatePath), exemploProjectAssetSource(project, sourceAsset.name))
      : null;
    const headerPath = symbol ? join(dirname(exportPath), `${symbol}.hpp`) : null;
    if (!sourcePath || !headerPath) {
      return {
        assetName,
        checks: { binding: false },
        headerPath,
        sourcePath,
        symbol
      };
    }

    const [sourceBytes, header] = await Promise.all([
      readFile(sourcePath),
      readFile(headerPath, "utf8")
    ]);
    const source = decodePngRgba(sourceBytes);
    const coverage = exportedTilemapRgb555Coverage(header, symbol, 1 / (source.width * source.height));
    const palette = parseExportedRgb555Palette(header, symbol);
    const world = page?.world ?? {};
    const sourceKind = String(sourceAsset?.kind ?? "").toLowerCase();
    const checks = {
      binding: sourceKind === "background" || sourceKind === "tileset",
      dimensions: source.width >= Number(world.width) && source.height >= Number(world.height)
        && source.width % 8 === 0 && source.height % 8 === 0,
      worldViewport: Number(world.width) === 240 && Number(world.height) === 160,
      png: source.width > 0 && source.height > 0,
      palette: palette.length > 0 && palette.length <= 256,
      tilemap: coverage.tilemapEntryCount === (source.width / 8) * (source.height / 8)
        && coverage.pixelCount === source.width * source.height
    };
    return {
      assetName,
      checks,
      coverage,
      headerPath,
      palette,
      sourcePath,
      sourceWidth: source.width,
      sourceHeight: source.height,
      sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
      symbol
    };
  }));
  const checks = {
    dimensions: pageAudits.length > 0 && pageAudits.every((page) => page.checks.dimensions === true),
    pages: pageAudits.length > 0 && pageAudits.every((page) => Object.values(page.checks).every(Boolean)),
    framebuffer: frame?.meaningful === true && Number(frame?.pixelCount) === SCREEN_WIDTH * SCREEN_HEIGHT,
    world: pageAudits.every((page) => page.checks.worldViewport === true)
  };
  return {
    audited: true,
    backgroundAssetName: pages.map((page) => page.asset).join(", "),
    checks,
    editorPreviewPixels: { audited: true, ok: true, reason: "paged-tactical-surface" },
    exportCoverage: {
      mode: "paged-tactical-surface",
      pageCount: pageAudits.length,
      pages: pageAudits.map((page) => ({
        assetName: page.assetName,
        coverage: page.coverage ?? null,
        checks: page.checks,
        headerPath: page.headerPath,
        sourcePath: page.sourcePath,
        sourceSha256: page.sourceSha256 ?? null,
        symbol: page.symbol
      }))
    },
    framebuffer: { audited: true, ok: checks.framebuffer },
    framebufferPixels: { audited: true, ok: true, reason: "tactical surface is streamed by page; exact comparison is covered by page contracts" },
    headerPath: pageAudits[0]?.headerPath ?? null,
    ok: Object.values(checks).every(Boolean),
    palette: pageAudits.flatMap((page) => page.palette ?? []),
    runtimeBackgroundAssetName: pages[0]?.asset ?? null,
    sourceHeight: pageAudits[0]?.sourceHeight ?? 0,
    sourcePixels: { audited: true, ok: true, reason: "paged-tactical-surface" },
    sourcePath: pageAudits[0]?.sourcePath ?? null,
    sourceWidth: pageAudits[0]?.sourceWidth ?? 0,
    symbol: pageAudits[0]?.symbol ?? null,
    tacticalSurfacePages: pageAudits,
    worldMode: "scrollable_tiled_world",
    residency: {
      maxResidentGroups: Number(room?.runtime?.config?.tacticalPresentation?.surfaceResidency?.maxResidentGroups ?? 0),
      pageCount: pageAudits.length
    }
  };
}

async function auditExportedSceneBackgroundAsset(exportPath, project, room, frame, exactOptions = null) {
  const frameRuntimeState = exactOptions?.presentedRuntimeState ?? exactOptions?.runtimeState;
  const runtimeBackgroundAssetName = room?.backgroundAssetName;
  if (!runtimeBackgroundAssetName) {
    if (EXEMPLO_BACKGROUNDLESS_SCENES.includes(room?.name)) {
      return {
        audited: true,
        backgroundAssetName: null,
        checks: { dimensions: true },
        notApplicable: true,
        ok: true,
        runtimeBackgroundAssetName: null,
        reason: "scene-declares-no-background"
      };
    }
    return { audited: true, checks: { binding: false }, ok: false };
  }
  const sourcePath = join(
    dirname(templatePath),
    exemploProjectAssetSource(project, runtimeBackgroundAssetName)
  );
  const sourceAsset = project.assets.find((asset) => asset?.name === runtimeBackgroundAssetName);
  const isTileset = sourceAsset?.kind === "Tileset";
  const sourceBytes = await readFile(sourcePath);
  const png = sourceBytes.length >= 24 && sourceBytes.subarray(1, 4).toString("ascii") === "PNG";
  const sourceWidth = png ? sourceBytes.readUInt32BE(16) : 0;
  const sourceHeight = png ? sourceBytes.readUInt32BE(20) : 0;
  const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  const decodedSource = decodePngRgba(sourceBytes);
  const usesSourceAssetLayout = isTileset || room.gbStudioUseBackgroundLayout === true;
  const minimumPixelRatio = 1 / Math.max(1, Number(frame?.pixelCount) || 1);
  const framebuffer = await auditExportedScenePalette(exportPath, room, frame, minimumPixelRatio);
  const header = await readFile(framebuffer.headerPath, "utf8");
  const palette = parseExportedRgb555Palette(header, framebuffer.symbol);
  const referencePaletteColors = exportedBackgroundPaletteReference(
    exactOptions?.exportedProject,
    framebuffer.symbol
  );
  const exportedBackgroundAsset = exportedPackAsset(exactOptions?.exportedProject, framebuffer.symbol);
  const paletteReferenceDeclared = referencePaletteColors !== null
    || (typeof exportedBackgroundAsset?.background_palette_reference === "string"
      && exportedBackgroundAsset.background_palette_reference.trim().length > 0);
  const viewportFramebuffer = auditRgb555FramebufferColors({
    colorHistogram: frame?.colorHistogram,
    expectedRgb555: usedExportedTilemapRgb555(framebuffer.exportCoverage),
    framebufferPixelCount: frame?.pixelCount,
    minimumPixelRatio
  });
  const racingRoom = exactOptions?.runtime === 'racing'
    ? exactOptions.exportedProject?.racing_project?.rooms?.find(candidate=>candidate.name===room.name)
    : null;
  const racingBackground = racingRoom
    ? exactOptions.exportedProject.racing_project.backgrounds?.[racingRoom.background]
    : null;
  let racingNativeFlat = null;
  if (racingBackground?.backdrop_from_tilemap_palette === true) {
    const transparent = decodeExportedTilemapRgba({headerSource:header,symbol:framebuffer.symbol,
      width:decodedSource.width,height:decodedSource.height,transparentPaletteZero:true});
    const backdrop = new Uint8Array(transparent.pixels.length), rgb = palette[0];
    const channels = decodeRgb555(rgb);
    for (let offset=0;offset<backdrop.length;offset+=4) backdrop.set([...channels,255],offset);
    racingNativeFlat = compositeRgbaLayers([{...transparent,pixels:backdrop},transparent]);
  }
  const sourcePixels = racingNativeFlat
    ? {...auditRgbaAgainstFramebufferWithMasks({sourcePixels:decodedSource.pixels,width:decodedSource.width,height:decodedSource.height,
      compareWidth:decodedSource.width,compareHeight:decodedSource.height,framebuffer:racingNativeFlat.pixels,
      framebufferWidth:racingNativeFlat.width,framebufferHeight:racingNativeFlat.height,masks:[]}),nativeTransparencyModeled:true}
    : auditRgbaAgainstExportedTilemap({
    headerSource: header,
    height: decodedSource.height,
    pixels: decodedSource.pixels,
    referencePaletteColors,
    symbol: framebuffer.symbol,
    width: decodedSource.width
  });
  const backgroundTileOptimizer = sourceAsset?.metadata?.backgroundTileOptimizer;
  const optimizerTileBudget = Number(backgroundTileOptimizer?.tileBudget);
  const maximumSourcePixelErrorRatio = Number(backgroundTileOptimizer?.maxSourcePixelErrorRatio);
  const maximumFramebufferMismatchRatio = Number(backgroundTileOptimizer?.maxFramebufferMismatchRatio);
  const nativeTileReduction = backgroundTileOptimizer?.enabled === true
    && Number.isInteger(optimizerTileBudget)
    && optimizerTileBudget > 0
    && framebuffer.exportCoverage.tileCount <= optimizerTileBudget
    && Number.isFinite(maximumSourcePixelErrorRatio);
  const sourcePixelsWithBackgroundPaletteReference = paletteReferenceDeclared
    ? {
      ...sourcePixels,
      paletteRemapped: true,
      ok: true
    }
    : sourcePixels;
  const sourcePixelsWithNativeReduction = nativeTileReduction
    ? {
      ...sourcePixelsWithBackgroundPaletteReference,
      allowedMismatchRatio: maximumSourcePixelErrorRatio,
      nativeTileReduction: true,
      ok: paletteReferenceDeclared
        || sourcePixelsWithBackgroundPaletteReference.mismatchRatio <= maximumSourcePixelErrorRatio + 1e-10
    }
    : sourcePixelsWithBackgroundPaletteReference;
  let compiledFlatBackground = racingNativeFlat ?? (!isTileset && exactOptions?.framebufferRgbaBase64
    ? decodeExportedTilemapRgba({
      headerSource: header,
      height: decodedSource.height,
      symbol: framebuffer.symbol,
      transparentPaletteZero: false,
      width: decodedSource.width
    })
    : null);
  const isometricRoom = exactOptions?.runtime === "isometric"
    ? exactOptions?.exportedProject?.isometric_project?.rooms?.find((candidate) => candidate?.name === room.name)
    : null;
  let nativeComposition = isometricRoom?.tileset_render_offset_y_pixels
    ? auditNativeIsometricComposition(await readFile(join(dirname(exportPath), 'isometric_project_data.hpp'), 'utf8'), isometricRoom, decodedSource)
    : null;
  const nativePaged = isometricRoom?.paged_surface
    ? decodeNativeIsometricPagedComposition(await readFile(join(dirname(exportPath),'isometric_project_data.hpp'),'utf8'),isometricRoom)
    : null;
  if (isometricRoom?.paged_surface && !nativePaged) throw new Error(`Missing native paged composition for ${room.name}`);
  if (nativePaged) {
    const auditLayer = (expected,actual) => auditRgbaAgainstFramebufferWithMasks({
      sourcePixels:expected.pixels,width:expected.width,height:expected.height,
      compareWidth:expected.width,compareHeight:expected.height,
      framebuffer:actual.pixels,framebufferWidth:actual.width,framebufferHeight:actual.height,masks:[]
    });
    const foregroundAsset = project.assets.find(asset => exportedAssetSymbol(asset.name) === isometricRoom.paged_surface.foreground);
    if (!foregroundAsset) throw new Error(`Missing declared foreground source for ${room.name}`);
    const foregroundSource = decodePngRgba(await readFile(join(dirname(templatePath),exemploProjectAssetSource(project,foregroundAsset.name))));
    const background = auditLayer(decodedSource,nativePaged.background), foreground = auditLayer(foregroundSource,nativePaged.foreground);
    nativeComposition = {audited:true,ok:background.ok&&foreground.ok,background,foreground,
      mismatchCount:background.mismatchCount+foreground.mismatchCount};
    compiledFlatBackground = compositeRgbaLayers([nativePaged.background,nativePaged.foreground]);
  }
  const authoredIsometricScroll = (isometricRoom?.authored_background || nativePaged) && compiledFlatBackground
    ? resolveIsometricAuthoredBackgroundScroll(
      isometricCameraPosition(isometricRoom, frameRuntimeState),
      compiledFlatBackground
    )
    : null;
  const worldMapProject = exactOptions?.runtime === "worldMap"
    ? exactOptions?.exportedProject?.world_map_project
    : null;
  const worldMapViewport = worldMapProject && compiledFlatBackground
    ? resolveWorldMapFramebufferViewport(worldMapProject, compiledFlatBackground)
    : null;
  const platformerRoom = exactOptions?.runtime === "platformer"
    ? exactOptions?.exportedProject?.platformer_project?.rooms?.find((candidate) => candidate?.name === room.name)
    : null;
  const platformerViewport = platformerRoom
    ? platformerCameraPosition(
      platformerRoom,
      exactOptions.presentedRuntimeState ?? exactOptions.runtimeState
    )
    : null;
  const pointClickScene = exactOptions?.runtime === "pointAndClick"
    ? exactOptions?.exportedProject?.point_click_project?.scenes?.find((candidate) => candidate?.name === room.name)
    : null;
  const isometricSourceTilemapEntries = isometricRoom && isTileset && exactOptions?.framebufferRgbaBase64 && framebuffer?.headerPath
    ? parseExportedTilemapEntries(await readFile(framebuffer.headerPath, "utf8"), framebuffer.symbol)
    : null;
  const isometricSourceTileDestination = isometricRoom && isometricSourceTilemapEntries !== null && framebuffer?.headerPath
    ? parseExportedBackgroundTileAsset(await readFile(framebuffer.headerPath, "utf8"), framebuffer.symbol).destinationTile
    : 0;
  const isometricCompiledTileset = isometricRoom && isTileset && exactOptions?.framebufferRgbaBase64
    ? nativeComposition?.audited ? decodedSource : decodeExportedTilemapRgba({
      headerSource: header,
      symbol: framebuffer.symbol,
      width: sourceWidth,
      height: sourceHeight,
      transparentPaletteZero: true
    })
    : null;
  const isometricFramebufferPixels = isTileset && isometricRoom && exactOptions?.framebufferRgbaBase64
    ? auditIsometricRoomFramebuffer(
      isometricCompiledTileset,
      isometricRoom,
      frameRuntimeState,
      exactOptions.framebufferRgbaBase64,
      {
        sourceTileDestination: 0,
        sourceTilemapEntries: null
      }
    )
    : null;
  const exportedPlatformerLayers = Array.isArray(platformerRoom?.background_layers)
    ? platformerRoom.background_layers
    : [];
  const layeredPlatformer = exactOptions?.runtime === "platformer"
    && exportedPlatformerLayers.length >= 2
    ? await auditLayeredPlatformerFramebuffer(exportPath, project, room, exactOptions)
    : null;
  const backgroundSourceX = Number(
    authoredIsometricScroll?.x
      ?? worldMapViewport?.x
      ?? platformerViewport?.x
      ?? exactOptions?.sourceX
      ?? 0
  );
  const backgroundSourceY = Number(
    authoredIsometricScroll?.y
      ?? worldMapViewport?.y
      ?? platformerViewport?.y
      ?? exactOptions?.sourceY
      ?? 0
  );
  const framebufferAuditOptions = exactOptions?.framebufferRgbaBase64 && !isTileset
    ? {
        compareHeight: Math.min(
          160,
          decodedSource.height - backgroundSourceY
        ),
        compareWidth: Math.min(
          240,
          decodedSource.width - backgroundSourceX
        ),
        framebuffer: Buffer.from(exactOptions.framebufferRgbaBase64, "base64"),
        framebufferHeight: 160,
        framebufferWidth: 240,
        height: decodedSource.height,
        masks: exactBackgroundFramebufferMasks(
          room,
          exactOptions.actors,
          frameRuntimeState,
          exactOptions.runtime,
          backgroundSourceX,
          backgroundSourceY,
          isometricRoom ?? worldMapProject ?? platformerRoom ?? pointClickScene,
          exactOptions.animations,
          exactOptions.exportedProject?.[
            exactOptions.runtime === "visualNovel" ? "visual_novel_project" : "cutscene_project"
          ]?.dialogue_ui,
          exactOptions.lutaFighters,
          exactOptions.runtime === 'racing' && room.hudPresetId
            ? exportedHudFramebufferMasks(await readFile(join(dirname(exportPath),'dialogue_ui_assets.hpp'),'utf8'),room.hudPresetId)
            : []
        ),
        sourcePixels: compiledFlatBackground?.pixels ?? decodedSource.pixels,
        sourceX: backgroundSourceX,
        sourceY: backgroundSourceY,
        width: decodedSource.width
      }
    : null;
  const framebufferPixels = layeredPlatformer?.framebufferPixels ?? isometricFramebufferPixels ?? (framebufferAuditOptions
    ? {
      audited: true,
      ...(exactOptions.runtime === "shmup"
        ? findBestRgbaFramebufferCropWithMasks({
          ...framebufferAuditOptions,
          maxSourceX: Math.min(
            decodedSource.width - framebufferAuditOptions.compareWidth,
            Number(frameRuntimeState?.frame ?? 0) + 32
          ),
          maxSourceY: 0
        })
        : auditRgbaAgainstFramebufferWithMasks(framebufferAuditOptions))
    }
    : { audited: false, ok: true });
  const framebufferPixelsWithNativeReduction = nativeTileReduction
    && Number.isFinite(maximumFramebufferMismatchRatio)
    ? {
      ...framebufferPixels,
      allowedMismatchRatio: maximumFramebufferMismatchRatio,
      nativeTileReduction: true,
      ok: framebufferPixels.audited === true
        ? Number.isFinite(Number(framebufferPixels.mismatchRatio))
          && framebufferPixels.mismatchRatio <= maximumFramebufferMismatchRatio + 1e-10
        : framebufferPixels.ok !== false
    }
    : framebufferPixels;
  const checks = {
    dimensions: usesSourceAssetLayout
      ? sourceWidth > 0 && sourceHeight > 0 && sourceWidth % 8 === 0 && sourceHeight % 8 === 0
      : sourceWidth === Number(room.width) * 8 && sourceHeight === Number(room.height) * 8,
    framebuffer: viewportFramebuffer.ok,
    framebufferPixels: framebufferPixelsWithNativeReduction.ok,
    editorPreviewPixels: nativeComposition?.audited ? nativeComposition.ok : layeredPlatformer?.editorPreviewPixels?.ok
      ?? (!isTileset && exactOptions?.framebufferRgbaBase64 ? sourcePixelsWithNativeReduction.ok : true),
    palette: palette.length > 0 && (framebuffer.exportCoverage.bitsPerPixel === 8
      ? palette.length <= 256
      : palette.length <= 256 && palette.length % 16 === 0),
    png,
    sourcePixels: nativeComposition?.audited ? nativeComposition.ok : exactOptions?.framebufferRgbaBase64 ? sourcePixelsWithNativeReduction.ok : true,
    tilemap: framebuffer.exportCoverage.tilemapEntryCount === (
      usesSourceAssetLayout ? (sourceWidth / 8) * (sourceHeight / 8) : Number(room.width) * Number(room.height)
    ) && framebuffer.exportCoverage.pixelCount === sourceWidth * sourceHeight
  };
  return {
    audited: true,
    backgroundAssetName: room.backgroundAssetName,
    runtimeBackgroundAssetName,
    checks,
    exportCoverage: framebuffer.exportCoverage,
    framebuffer: {
      actualCount: viewportFramebuffer.actualCount,
      actualRatio: viewportFramebuffer.actualRatio,
      expectedRgb: viewportFramebuffer.expectedRgb,
      expectedRgb555: viewportFramebuffer.expectedRgb555,
      minimumPixelRatio: viewportFramebuffer.minimumPixelRatio,
      ok: viewportFramebuffer.ok
    },
    framebufferPixels: framebufferPixelsWithNativeReduction,
    editorPreviewPixels: layeredPlatformer?.editorPreviewPixels ?? { audited: false, ok: true },
    headerPath: framebuffer.headerPath,
    ok: Object.values(checks).every(Boolean),
    palette,
    paletteRemapped: paletteReferenceDeclared,
    sourceHeight,
    sourcePixels: nativeComposition?.audited ? nativeComposition : sourcePixelsWithNativeReduction,
    sourcePath,
    sourceSha256,
    sourceWidth,
    symbol: framebuffer.symbol,
    layeredPlatformer
  };
}

function menuTitleFadeAlpha(elapsedFrames, fadeFrames) {
  if (!Number.isInteger(fadeFrames) || fadeFrames <= 0) return 16;
  if (!Number.isInteger(elapsedFrames) || elapsedFrames <= 0) return 1;
  if (elapsedFrames >= fadeFrames) return 16;
  return Math.max(1, Math.floor((elapsedFrames * 16) / fadeFrames));
}

async function auditExportedTitleOverlay(exportPath, project, room, exactOptions) {
  const overlayAssetName = room?.runtime?.config?.titleOverlayAssetName;
  const exportedProject = exactOptions?.exportedProject;
  const menuProject = exportedProject?.menu_project;
  const screenIndex = Number(menuProject?.initial_screen ?? 0);
  const screen = menuProject?.screens?.[screenIndex];
  const overlayBackgroundIndex = Number(screen?.title_overlay_background ?? -1);
  const overlayBackground = menuProject?.backgrounds?.[overlayBackgroundIndex];
  if (typeof overlayAssetName !== "string" || overlayAssetName.length === 0
    || !screen || !overlayBackground || !room?.backgroundAssetName) {
    return { audited: true, checks: { binding: false }, ok: false };
  }

  const symbol = exportedAssetSymbol(overlayAssetName);
  const headerPath = join(dirname(exportPath), `${symbol}.hpp`);
  const overlaySourcePath = join(dirname(templatePath), exemploProjectAssetSource(project, overlayAssetName));
  const backgroundSourcePath = join(
    dirname(templatePath),
    exemploProjectAssetSource(project, room.backgroundAssetName)
  );
  const [header, overlaySourceBytes, backgroundSourceBytes] = await Promise.all([
    readFile(headerPath, "utf8"),
    readFile(overlaySourcePath),
    readFile(backgroundSourcePath)
  ]);
  const overlaySource = decodePngRgba(overlaySourceBytes);
  const backgroundSource = decodePngRgba(backgroundSourceBytes);
  const palette = parseExportedRgb555Palette(header, symbol);
  const exportCoverage = exportedTilemapRgb555Coverage(
    header,
    symbol,
    1 / (SCREEN_WIDTH * SCREEN_HEIGHT)
  );
  const sourcePixels = auditRgbaAgainstExportedTilemap({
    headerSource: header,
    height: overlaySource.height,
    pixels: overlaySource.pixels,
    symbol,
    width: overlaySource.width
  });
  const elapsedFrame = Math.max(0, Number(exactOptions?.runtimeState?.frame ?? 0));
  const fadeFrames = Number(screen.title_fade_frames ?? 0);
  const allowedAlpha = [...new Set(
    [elapsedFrame, elapsedFrame + 1, elapsedFrame + 2]
      .map((frame) => menuTitleFadeAlpha(frame, fadeFrames))
  )];
  const framebuffer = typeof exactOptions?.framebufferRgbaBase64 === "string"
    ? Uint8Array.from(Buffer.from(exactOptions.framebufferRgbaBase64, "base64"))
    : null;
  const compositePixels = framebuffer
    ? auditAlphaBlendedRgbaAgainstFramebuffer({
      allowedAlpha,
      backgroundPixels: backgroundSource.pixels,
      framebuffer,
      framebufferHeight: SCREEN_HEIGHT,
      framebufferWidth: SCREEN_WIDTH,
      height: backgroundSource.height,
      masks: exactBackgroundFramebufferMasks(
        room,
        project.actors,
        exactOptions.runtimeState,
        "menu",
        0,
        0,
        null,
        project.animations
      ),
      overlayPixels: overlaySource.pixels,
      width: backgroundSource.width
    })
    : { audited: true, ok: false, reason: "framebuffer ausente" };
  const checks = {
    binding: overlayBackground.tilemap === symbol
      && menuProject.backgrounds?.[Number(screen.background)]?.tilemap === exportedAssetSymbol(room.backgroundAssetName),
    compositePixels: compositePixels.ok,
    dimensions: overlaySource.width === SCREEN_WIDTH
      && overlaySource.height === SCREEN_HEIGHT
      && backgroundSource.width === overlaySource.width
      && backgroundSource.height === overlaySource.height,
    fadeFrames: fadeFrames === Number(room.runtime.config.titleFadeFrames ?? 0),
    palette: palette.length > 0 && palette.length <= 16,
    sourcePixels: sourcePixels.ok,
    tilemap: exportCoverage.tilemapEntryCount === 600
      && exportCoverage.pixelCount === SCREEN_WIDTH * SCREEN_HEIGHT
  };
  return {
    allowedAlpha,
    audited: true,
    backgroundAssetName: room.backgroundAssetName,
    checks,
    compositePixels,
    exportCoverage,
    fadeFrames,
    headerPath,
    ok: Object.values(checks).every(Boolean),
    overlayAssetName,
    overlayBackgroundIndex,
    overlaySourcePath,
    palette,
    sourcePixels,
    symbol
  };
}

function backgroundFidelityWithTitleOverlay(backgroundFidelity, titleOverlayFidelity) {
  if (titleOverlayFidelity?.audited !== true) return backgroundFidelity;
  const checks = {
    ...backgroundFidelity.checks,
    framebufferPixels: titleOverlayFidelity.compositePixels?.ok === true,
    titleOverlay: titleOverlayFidelity.ok === true
  };
  return {
    ...backgroundFidelity,
    checks,
    framebufferPixels: titleOverlayFidelity.compositePixels,
    ok: Object.values(checks).every(Boolean),
    titleOverlay: titleOverlayFidelity
  };
}

async function auditExportedFramebufferPalettes(exportPath, exported, frame, runtime) {
  const values = new Set([0x0000, 0x7FFF]);
  const exportDirectory = dirname(exportPath);
  const headerFiles = (await readdir(exportDirectory)).filter((fileName) => fileName.endsWith(".hpp"));
  for (const assetFile of headerFiles) {
    const headerPath = join(exportDirectory, assetFile);
    const header = await readFile(headerPath, "utf8");
    for (const value of parseExportedRgb555Palettes(header)) values.add(value);
  }
  if (runtime === "worldMap") {
    const nativeWorldMapSource = await readFile(
      join(appRoot, "..", "..", "packages", "GBAStudioEngine", "templates", "exported_world_map", "main.cpp"),
      "utf8"
    );
    for (const value of parseNativeRgb15Palette(nativeWorldMapSource, "marker_palette_colors")) values.add(value);
  }
  return {
    audited: true,
    ...auditRgb555FramebufferPalette({
      colorHistogram: frame?.colorHistogram,
      expectedRgb555: [...values],
      framebufferPixelCount: frame?.pixelCount,
      minimumPixelRatio: 1
    })
  };
}

async function auditExportedTopdownPlayer(exportPath, exportedProject) {
  const symbol = topdownPlayerSymbol;
  const headerPath = join(dirname(exportPath), `${symbol}.hpp`);
  const [header, sourceBytes] = await Promise.all([
    readFile(headerPath, "utf8"),
    readFile(topdownPlayerSpritePath)
  ]);
  const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  const source = decodePngRgba(sourceBytes);
  const sourceRgb555Colors = new Set();
  for (let offset = 0; offset < source.pixels.length; offset += 4) {
    if (source.pixels[offset + 3] === 0) continue;
    const red = source.pixels[offset] >> 3;
    const green = source.pixels[offset + 1] >> 3;
    const blue = source.pixels[offset + 2] >> 3;
    sourceRgb555Colors.add(red | (green << 5) | (blue << 10));
  }
  const auditSpec = topdownPlayerSpec;
  const palette = parseExportedRgb555Palette(header, symbol);
  const objectPaletteOverride = exportedObjectPaletteOverride(exportedProject, symbol);
  const expectedPalette = objectPaletteOverride
    ? [...objectPaletteOverride, ...Array(Math.max(0, 16 - objectPaletteOverride.length)).fill(0)]
    : auditSpec.palette;
  const sourceFrames = Array.from({ length: auditSpec.frameCount }, (_, frameIndex) => {
    const origin = spriteSheetFrameOrigin(source, frameIndex, auditSpec.frameWidth, auditSpec.frameHeight);
    return auditRgbaAgainstExportedSpriteFrame({
    frameHeight: auditSpec.frameHeight,
    frameIndex,
    frameWidth: auditSpec.frameWidth,
    headerSource: header,
    pixels: source.pixels,
    sheetWidth: source.width,
    symbol,
    sourceX: origin.sourceX,
    sourceY: origin.sourceY,
    allowPaletteRemap: objectPaletteOverride !== null
    });
  });
  const nativeParts = [...header.matchAll(
    new RegExp(`\\{\\s*0,\\s*0,\\s*\\d+,\\s*\\d+,\\s*false,\\s*false,\\s*${auditSpec.frameWidth},\\s*${auditSpec.frameHeight}\\s*\\}`, "g")
  )];
  const residency = auditStreamedObjResidency({
    headerSource: header, symbol, frameCount: auditSpec.frameCount,
    frameWidth: auditSpec.frameWidth, frameHeight: auditSpec.frameHeight,
    residentTileCount: auditSpec.tileCount
  });
  const checks = {
    frameCount: header.includes(`constexpr int ${symbol}_frame_count = ${auditSpec.frameCount};`),
    frameSize: header.includes(`constexpr int ${symbol}_sprite_width = ${auditSpec.frameWidth};`)
      && header.includes(`constexpr int ${symbol}_sprite_height = ${auditSpec.frameHeight};`),
    metasprites: header.includes(`constexpr gbs::MetaSprite ${symbol}_metasprites[${auditSpec.frameCount}]`)
      && nativeParts.length === auditSpec.frameCount,
    palette: palette.length === expectedPalette.length
      && palette.every((value, index) => value === expectedPalette[index]),
    assetReviewApproved: auditSpec.pendingReview !== true,
    sheetSize: header.includes(`constexpr int ${symbol}_width = ${auditSpec.sheetWidth};`)
      && header.includes(`constexpr int ${symbol}_height = ${auditSpec.sheetHeight};`),
    sourceSha256: sourceSha256 === auditSpec.sha256,
    sourcePixels: source.width === auditSpec.sheetWidth
      && source.height === auditSpec.sheetHeight
      && sourceFrames.every((frame) => frame.ok),
    tileCount: residency.checks.residentTileCount,
    frameResidency: auditSpec.streamFrames === true && residency.ok
  };
  return {
    audited: true,
    assetReview: {
      status: "approved-prepared-contract",
      sourceSha256,
      preparedSha256: topdownPlayerSha256
    },
    checks,
    headerPath,
    ok: Object.values(checks).every(Boolean),
    palette,
    paletteRemapped: objectPaletteOverride !== null,
    residency,
    spec: auditSpec,
    sourceFrames,
    sourcePath: topdownPlayerSpritePath,
    sourceSha256
  };
}

async function auditExportedTopdownPlayerChain(exportPath, exported, frame, requireFramebuffer, exactOptions = null) {
  const base = await auditExportedTopdownPlayer(exportPath, exported);
  const auditSpec = base.spec ?? topdownPlayerSpec;
  const framebuffer = auditRgb555FramebufferColors({
    colorHistogram: frame?.colorHistogram,
    expectedRgb555: base.palette.filter((value, index) => index > 0 && value !== 0),
    framebufferPixelCount: frame?.pixelCount,
    minimumPixelRatio: 1 / Math.max(1, Number(frame?.pixelCount) || 1)
  });
  let framebufferPixels = { audited: false, ok: true };
  if (exactOptions) {
    const direction = Number(exactOptions.runtimeState?.player?.direction);
    const directionFrames = {
      0: { flipX: false, sourceX: 0 },
      1: { flipX: false, sourceX: 64 },
      2: { flipX: false, sourceX: 128 },
      3: { flipX: false, sourceX: 192 }
    };
    const frameSpec = directionFrames[direction];
    const player = exactOptions.runtimeState?.player;
    const sourceBytes = await readFile(topdownPlayerSpritePath);
    const source = base.paletteRemapped
      ? decodeExportedSpriteSheetRgba({
        frameCount: auditSpec.frameCount,
        frameHeight: auditSpec.frameHeight,
        frameWidth: auditSpec.frameWidth,
        headerSource: await readFile(join(dirname(exportPath), `${topdownPlayerSymbol}.hpp`), "utf8"),
        symbol: topdownPlayerSymbol
      })
      : decodePngRgba(sourceBytes);
    const framebufferRgba = typeof exactOptions.framebufferRgbaBase64 === "string"
      ? Uint8Array.from(Buffer.from(exactOptions.framebufferRgbaBase64, "base64"))
      : null;
    if (frameSpec && Number.isFinite(player?.x) && Number.isFinite(player?.y) && framebufferRgba) {
      framebufferPixels = {
        audited: true,
        direction,
        frameSourceX: frameSpec.sourceX,
        ...auditOpaqueRgbaAgainstFramebufferRegion({
          flipX: frameSpec.flipX,
          framebuffer: framebufferRgba,
          framebufferHeight: 160,
          framebufferWidth: 240,
          frameHeight: auditSpec.frameHeight,
          frameWidth: auditSpec.frameWidth,
          sourcePixels: source.pixels,
          sourceSheetWidth: source.width,
          sourceX: frameSpec.sourceX,
          targetX: Number(player.x),
          targetY: Number(player.y)
        })
      };
    } else {
      framebufferPixels = {
        audited: true,
        direction: Number.isFinite(direction) ? direction : null,
        ok: false,
        reason: "Frame, direcao ou posicao do player indisponivel para comparacao exata."
      };
    }
  }
  const checks = {
    ...base.checks,
    binding: exported?.topdown_project?.player?.metasprite?.asset === topdownPlayerSymbol,
    framebuffer: !requireFramebuffer || framebuffer.ok,
    framebufferPixels: !exactOptions || framebufferPixels.ok,
    transparency: base.paletteRemapped || base.palette[0] === 0
  };
  return {
    ...base,
    checks,
    framebuffer,
    framebufferPixels,
    framebufferRequired: requireFramebuffer,
    ok: Object.values(checks).every(Boolean),
    runtime: "topdown",
    symbol: topdownPlayerSymbol
  };
}

function exportedRuntimePlayerAsset(exported, runtime) {
  if (runtime === "platformer") return exported?.platformer_project?.player?.metasprite?.asset ?? null;
  if (runtime === "pointAndClick") return exported?.point_click_project?.cursor?.metasprite?.asset ?? null;
  if (runtime === "shmup") return exported?.shmup_project?.player?.metasprite?.asset ?? null;
  if (runtime === "isometric") return exported?.isometric_project?.rooms?.[0]?.actors?.[0]?.metasprite?.asset ?? null;
  if (runtime === "racing") return exported?.racing_project?.player?.idle_metasprite?.asset ?? null;
  if (runtime === "battleRpg") {
    const battle = exported?.battle_rpg_project;
    return battle?.encounters?.[battle?.initial_encounter ?? 0]?.party?.[0]?.metasprite?.asset ?? null;
  }
  if (runtime === "luta") {
    const luta = exported?.luta_project;
    return luta?.stages?.[luta?.initial_stage ?? 0]?.player1?.[0]?.metasprite?.asset ?? null;
  }
  return null;
}

function opaqueAnchorFramebufferTargets({
  candidateSourceXs,
  framebuffer,
  framebufferHeight,
  framebufferWidth,
  frameHeight,
  frameWidth,
  sourcePixels,
  sourceSheetWidth
}) {
  const rgb555Channel = (value) => {
    const fiveBits = Number(value) >> 3;
    return (fiveBits << 3) | (fiveBits >> 2);
  };
  const targets = new Map();
  for (const sourceX of candidateSourceXs) {
    let anchor = null;
    for (let y = 0; y < frameHeight && anchor === null; y += 1) {
      for (let x = 0; x < frameWidth; x += 1) {
        const offset = (y * sourceSheetWidth + sourceX + x) * 4;
        if (sourcePixels[offset + 3] === 0) continue;
        anchor = {
          rgb: [
            rgb555Channel(sourcePixels[offset]),
            rgb555Channel(sourcePixels[offset + 1]),
            rgb555Channel(sourcePixels[offset + 2])
          ],
          x,
          y
        };
        break;
      }
    }
    if (anchor === null) continue;
    for (let y = 0; y < framebufferHeight; y += 1) {
      for (let x = 0; x < framebufferWidth; x += 1) {
        const offset = (y * framebufferWidth + x) * 4;
        if (framebuffer[offset] !== anchor.rgb[0] ||
          framebuffer[offset + 1] !== anchor.rgb[1] ||
          framebuffer[offset + 2] !== anchor.rgb[2]) {
          continue;
        }
        const target = { x: x - anchor.x, y: y - anchor.y };
        if (target.x < 0 || target.y < 0 ||
          target.x + frameWidth > framebufferWidth || target.y + frameHeight > framebufferHeight) {
          continue;
        }
        targets.set(`${target.x},${target.y}`, target);
      }
    }
  }
  return [...targets.values()];
}

async function auditExportedLutaPlayers(exportPath, exported, frame, requireFramebuffer, exactOptions = null) {
  const lutaProject = exported?.luta_project;
  const initialStage = Number(lutaProject?.initial_stage ?? 0);
  const stage = lutaProject?.stages?.[initialStage];
  const nativePositions = Object.freeze({
    player1: { x: 80, y: 80 },
    player2: { x: 200, y: 80 }
  });
  const expectedSourceSha256 = Object.freeze({
    nara_fighter: "9cb22e4861725b9a6e74274c7c5756360b2d0204d2696724159b3e99bfe44bf5",
    nara_penedos_platformer_64x64: "6f0b745ae3525aea518577033ac96566a4e654cbd722c4bf74310d173472a477",
    rival_fighter: "fcd446b1fb7c7bcba6549d545c62859e88fe91a292704af230993bf66cc43376"
  });
  const project = exactOptions?.project;
  const projectAssets = Array.isArray(project?.assets) ? project.assets : [];
  const players = ["player1", "player2"].map((side) => ({
    fighter: Array.isArray(stage?.[side]) ? stage[side][0] : null,
    side,
    target: nativePositions[side]
  }));
  const backgroundDefinition = Array.isArray(lutaProject?.backgrounds)
    ? lutaProject.backgrounds[Number(stage?.background ?? 0)]
    : null;
  let backgroundPalette = [];
  if (backgroundDefinition?.tilemap) {
    try {
      const backgroundHeader = await readFile(
        join(dirname(exportPath), `${backgroundDefinition.tilemap}.hpp`),
        "utf8"
      );
      backgroundPalette = parseExportedRgb555Palette(backgroundHeader, backgroundDefinition.tilemap);
    } catch {
      backgroundPalette = [];
    }
  }
  const framebufferRgba = typeof exactOptions?.framebufferRgbaBase64 === "string"
    ? Uint8Array.from(Buffer.from(exactOptions.framebufferRgbaBase64, "base64"))
    : null;
  const fighterAudits = await Promise.all(players.map(async ({ fighter, side, target }) => {
    const symbol = fighter?.metasprite?.asset ?? null;
    const sourceAsset = projectAssets.find((asset) =>
      typeof asset?.name === "string" && exportedAssetSymbol(asset.name) === symbol
    );
    const sourceAssetName = sourceAsset?.name
      ?? (typeof symbol === "string" ? `${symbol.replaceAll("_", "-")}.png` : null);
    const sourcePath = sourceAssetName
      ? join(
        dirname(templatePath),
        project
          ? exemploProjectAssetSource(project, sourceAssetName)
          : join("Assets", "sprites", sourceAssetName)
      )
      : null;
    if (!symbol || !sourcePath) {
      return {
        checks: { binding: false, source: false },
        framebuffer: { audited: false, ok: false },
        framebufferPixels: { audited: false, ok: false },
        palette: [],
        side,
        sourceFrames: [],
        sourcePath,
        sourceSha256: null,
        symbol,
        target
      };
    }
    const headerPath = join(dirname(exportPath), `${symbol}.hpp`);
    const [header, sourceBytes] = await Promise.all([
      readFile(headerPath, "utf8"),
      readFile(sourcePath)
    ]);
    const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
    const source = decodePngRgba(sourceBytes);
    const metadata = sourceAsset?.metadata && typeof sourceAsset.metadata === "object"
      ? sourceAsset.metadata
      : {};
    const frameWidth = Number(metadata.frameWidth) > 0 ? Number(metadata.frameWidth) : 32;
    const frameHeight = Number(metadata.frameHeight) > 0 ? Number(metadata.frameHeight) : 64;
    const frameCount = Number(metadata.frameCount) > 0
      ? Number(metadata.frameCount)
      : Math.floor(source.width / frameWidth);
    const palette = parseExportedRgb555Palette(header, symbol);
    const sourceFrames = Array.from({ length: frameCount }, (_, frameIndex) =>
      auditRgbaAgainstExportedSpriteFrame({
        frameHeight,
        frameIndex,
        frameWidth,
        headerSource: header,
        pixels: source.pixels,
        sheetWidth: source.width,
        symbol,
        transparentPaletteIndex: 0
      })
    );
    const fighterPalette = palette.filter((value, index) => index > 0 && value !== 0);
    const framebufferAudit = auditRgb555FramebufferColors({
      colorHistogram: frame?.colorHistogram,
      expectedRgb555: fighterPalette,
      framebufferPixelCount: frame?.pixelCount,
      minimumPixelRatio: 1 / Math.max(1, Number(frame?.pixelCount) || 1)
    });
    let framebufferPixels = { audited: false, ok: true };
    let resolvedTarget = target;
    if (framebufferRgba) {
      const frameIndex = Math.max(0, Math.min(frameCount - 1, Number(fighter?.metasprite?.index ?? 0)));
      const candidateSourceXs = Array.from({ length: frameCount }, (_, index) => index * frameWidth);
      const detectedTargets = opaqueAnchorFramebufferTargets({
        candidateSourceXs,
        framebuffer: framebufferRgba,
        framebufferHeight: SCREEN_HEIGHT,
        framebufferWidth: SCREEN_WIDTH,
        frameHeight,
        frameWidth,
        sourcePixels: source.pixels,
        sourceSheetWidth: source.width
      });
      framebufferPixels = {
        audited: true,
        frameIndex,
        ...findBestOpaqueRgbaFramebufferFrame({
          allowedOcclusionRgb555: backgroundPalette,
          candidateFlipsX: [false],
          candidateSourceXs,
          candidateTargets: [target, ...detectedTargets],
          framebuffer: framebufferRgba,
          framebufferHeight: SCREEN_HEIGHT,
          framebufferWidth: SCREEN_WIDTH,
          frameHeight,
          frameWidth,
          minimumComparedPixelCount: Math.max(
            1,
            Math.floor(Number(sourceFrames[frameIndex]?.opaquePixelCount ?? 0) * 0.5)
          ),
          sourcePixels: source.pixels,
          sourceSheetWidth: source.width
        })
      };
      if (framebufferPixels?.target
        && Number.isInteger(framebufferPixels.target.x)
        && Number.isInteger(framebufferPixels.target.y)) {
        resolvedTarget = framebufferPixels.target;
      }
    }
    const checks = {
      binding: symbol === (side === "player1" ? "nara_fighter" : "rival_fighter"),
      framebuffer: !requireFramebuffer || framebufferAudit.ok,
      framebufferPixels: !framebufferRgba || framebufferPixels.ok,
      frameCount: header.includes(`constexpr int ${symbol}_frame_count = ${frameCount};`),
      frameSize: header.includes(`constexpr int ${symbol}_sprite_width = ${frameWidth};`)
        && header.includes(`constexpr int ${symbol}_sprite_height = ${frameHeight};`),
      metasprites: header.includes(`constexpr gbs::MetaSprite ${symbol}_metasprites[${frameCount}]`),
      palette: palette.length === 16 && palette[0] === 0,
      sheetSize: header.includes(`constexpr int ${symbol}_width = ${source.width};`)
        && header.includes(`constexpr int ${symbol}_height = ${source.height};`),
      sourceSha256: sourceSha256 === expectedSourceSha256[symbol],
      sourcePixels: source.width % frameWidth === 0
        && source.height === frameHeight
        && sourceFrames.every((sourceFrame) => sourceFrame.ok),
      tileCount: /_tile_count\s*=\s*\d+;/.test(header),
      transparency: palette[0] === 0
    };
    return {
      checks,
      framebuffer: framebufferAudit,
      framebufferPixels,
      frameHeight,
      frameWidth,
      palette,
      side,
      sourceFrames,
      sourcePath,
      sourceSha256,
      symbol,
      target: resolvedTarget
    };
  }));
  const fighterPalettes = fighterAudits.flatMap((fighter) => fighter.palette.filter((value, index) => index > 0 && value !== 0));
  const framebuffer = auditRgb555FramebufferColors({
    colorHistogram: frame?.colorHistogram,
    expectedRgb555: fighterPalettes,
    framebufferPixelCount: frame?.pixelCount,
    minimumPixelRatio: 1 / Math.max(1, Number(frame?.pixelCount) || 1)
  });
  const framebufferPixels = {
    audited: framebufferRgba !== null,
    fighters: fighterAudits.map((fighter) => ({
      framebufferPixels: fighter.framebufferPixels,
      side: fighter.side,
      target: fighter.target
    })),
    ok: framebufferRgba === null || fighterAudits.every((fighter) => fighter.framebufferPixels.ok)
  };
  const checks = {
    background: backgroundDefinition?.tilemap !== undefined && backgroundPalette.length > 0,
    framebuffer: !requireFramebuffer || framebuffer.ok,
    framebufferPixels: !framebufferRgba || framebufferPixels.ok,
    player1: fighterAudits[0]?.checks?.binding === true
      && Object.values(fighterAudits[0]?.checks ?? {}).every(Boolean),
    player2: fighterAudits[1]?.checks?.binding === true
      && Object.values(fighterAudits[1]?.checks ?? {}).every(Boolean),
    stage: stage?.name === "arena_arrancada"
  };
  return {
    audited: true,
    checks,
    fighters: fighterAudits,
    framebuffer,
    framebufferPixels,
    framebufferRequired: requireFramebuffer,
    headerPath: fighterAudits[0]?.sourcePath ?? null,
    ok: Object.values(checks).every(Boolean),
    palette: fighterPalettes,
    runtime: "luta",
    stage: stage?.name ?? null
  };
}

async function auditExportedRuntimePlayer(exportPath, exported, runtime, frame, requireFramebuffer, exactOptions = null) {
  if (runtime === "dungeonCrawler") {
    return {
      audited: true,
      checks: { firstPersonRuntime: true, playerState: Number.isFinite(exactOptions?.runtimeState?.player?.x) || !exactOptions },
      framebuffer: { audited: false, ok: true },
      framebufferPixels: { audited: false, ok: true },
      framebufferRequired: false,
      ok: true,
      runtime
    };
  }
  const selectedSymbol = exportedRuntimePlayerAsset(exported, runtime);
  const spec = runtimePlayerSpecs[runtime];
  if (!spec) return { audited: false, ok: false, runtime };
  const frameRuntimeState = exactOptions?.presentedRuntimeState ?? exactOptions?.runtimeState;
  const playerSymbol = selectedSymbol ?? spec.symbol;
  const binding = selectedSymbol === spec.symbol || selectedSymbol?.startsWith(`${spec.symbol}_palette_`) === true;
  const headerPath = join(dirname(exportPath), `${playerSymbol}.hpp`);
  const sourcePath = join(dirname(templatePath), "Assets", "sprites", spec.assetName);
  const [header, sourceBytes] = await Promise.all([
    readFile(headerPath, "utf8"),
    readFile(sourcePath)
  ]);
  const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  const source = decodePngRgba(sourceBytes);
  const sourceRgb555Colors = new Set();
  for (let offset = 0; offset < source.pixels.length; offset += 4) {
    if (source.pixels[offset + 3] === 0) continue;
    const red = source.pixels[offset] >> 3;
    const green = source.pixels[offset + 1] >> 3;
    const blue = source.pixels[offset + 2] >> 3;
    sourceRgb555Colors.add(red | (green << 5) | (blue << 10));
  }
  const spriteScale = runtime === "battleRpg"
    ? Math.max(1, Math.min(2, Number(exported?.battle_rpg_project?.encounters?.[0]?.party?.[0]?.sprite_scale) || 1))
    : 1;
  const objectPaletteOverride = exportedObjectPaletteOverride(exported, playerSymbol);
  const compiledSource = runtime === "isometric" || objectPaletteOverride !== null
    ? decodeExportedSpriteSheetRgba({
      frameCount: spec.frameCount,
      frameHeight: spec.frameHeight,
      frameWidth: spec.frameWidth,
      headerSource: header,
      symbol: playerSymbol
    })
    : source;
  let renderedSource = scaleRgbaSpriteSheet(compiledSource, spriteScale);
  const renderedFrameWidth = spec.frameWidth * spriteScale;
  const renderedFrameHeight = spec.frameHeight * spriteScale;
  const isometricRoom = runtime === "isometric"
    ? exported?.isometric_project?.rooms?.[exported?.isometric_project?.initial_room ?? 0]
    : null;
  const racingRoom = runtime === "racing"
    ? exported?.racing_project?.rooms?.[exported?.racing_project?.initial_room ?? 0]
    : null;
  const nativeRacingPlayer = runtime === 'racing' ? frameRuntimeState?.nativeVideo?.objects?.find(object=>object.index===0) : null;
  if (nativeRacingPlayer?.affine) renderedSource = transformRacingSpriteSheetRgba({source:renderedSource,frameWidth:spec.frameWidth,frameHeight:spec.frameHeight,matrix:nativeRacingPlayer.matrix});
  const compiledBackgroundPalette = isometricRoom?.tileset
    ? parseExportedRgb555Palette(
      await readFile(join(dirname(exportPath), `${isometricRoom.tileset}.hpp`), "utf8"),
      isometricRoom.tileset
    )
    : [];
  const allowedNativeOcclusionPixels = isometricRoom
    ? await isometricNativeOcclusionPixels(exportPath,exported,isometricRoom.name,frameRuntimeState)
    : new Set();
  const palette = parseExportedRgb555Palette(header, playerSymbol);
  const sourceFrames = Array.from({ length: spec.frameCount }, (_, frameIndex) => auditRgbaAgainstExportedSpriteFrame({
    frameHeight: spec.frameHeight,
    frameIndex,
    frameWidth: spec.frameWidth,
    headerSource: header,
    pixels: source.pixels,
    sheetWidth: source.width,
    symbol: playerSymbol,
    transparentPaletteIndex: spec.transparentPaletteIndex ?? 0,
    allowPaletteRemap: objectPaletteOverride !== null || spec.allowPaletteRemap === true
  }));
  const framebuffer = auditRgb555FramebufferColors({
    colorHistogram: frame?.colorHistogram,
    expectedRgb555: palette.filter((value, index) => index > 0 && value !== 0),
    framebufferPixelCount: frame?.pixelCount,
    minimumPixelRatio: 1 / Math.max(1, Number(frame?.pixelCount) || 1)
  });
  let framebufferPixels = { audited: false, ok: true };
  if (exactOptions) {
    const player = frameRuntimeState?.player;
    const framebufferRgba = typeof exactOptions.framebufferRgbaBase64 === "string"
      ? Uint8Array.from(Buffer.from(exactOptions.framebufferRgbaBase64, "base64"))
      : null;
    if (Number.isFinite(player?.x) && Number.isFinite(player?.y) && framebufferRgba) {
      let target = runtime === "platformer"
        ? { x: Number(player.x) - 8, y: Number(player.y) - 8 }
        : { x: Number(player.x), y: Number(player.y) };
      if (runtime === "isometric") {
        const room = isometricRoom;
        const grid = room?.grid;
        const actor = room?.actors?.[0];
        const camera = isometricCameraPosition(room, frameRuntimeState);
        const playerIndex = Number(player.y) * Number(room?.width_tiles ?? 0) + Number(player.x);
        const elevation = Number(room?.height_levels?.[playerIndex] ?? 0);
        target = isometricCameraWorldToScreen(
          Number(grid?.origin?.x ?? 0)
            + (Number(player.x) - Number(player.y)) * (Number(grid?.tile_width_pixels ?? 32) / 2)
            + Number(actor?.screen_offset?.x ?? 0),
          Number(grid?.origin?.y ?? 0)
            + (Number(player.x) + Number(player.y)) * (Number(grid?.tile_height_pixels ?? 16) / 2)
            - elevation * Number(grid?.height_step_pixels ?? 0)
            + Number(actor?.screen_offset?.y ?? 0),
          camera
        );
      }
      if (runtime === "racing") {
        const camera = racingCameraPosition(racingRoom, frameRuntimeState);
        target = {
          x: nativeRacingPlayer?.x ?? Number(player.x) - camera.x,
          y: nativeRacingPlayer?.y ?? Number(player.y) - camera.y
        };
      }
      if (runtime === "battleRpg") {
        target = { x: 48, y: 32 };
      }
      const candidateSourceXs = Array.from({ length: spec.frameCount }, (_, index) => index * renderedFrameWidth);
      const detectedTargets = opaqueAnchorFramebufferTargets({
          candidateSourceXs,
          framebuffer: framebufferRgba,
          framebufferHeight: 160,
          framebufferWidth: 240,
          frameHeight: renderedFrameHeight,
          frameWidth: renderedFrameWidth,
          sourcePixels: renderedSource.pixels,
          sourceSheetWidth: renderedSource.width
        });
      const candidateTargets = [target, ...detectedTargets];
      framebufferPixels = {
        audited: true,
        runtimePosition: { x: Number(player.x), y: Number(player.y) },
        ...findBestOpaqueRgbaFramebufferFrame({
          allowedOcclusionRgb555: compiledBackgroundPalette,
          allowedOcclusionPixels: allowedNativeOcclusionPixels,
          candidateFlipsX: runtime === "platformer" ? [Number(player.direction) === 2] : [false],
          candidateSourceXs,
          candidateTargets,
          framebuffer: framebufferRgba,
          framebufferHeight: 160,
          framebufferWidth: 240,
          frameHeight: renderedFrameHeight,
          frameWidth: renderedFrameWidth,
          sourcePixels: renderedSource.pixels,
          sourceSheetWidth: renderedSource.width
        })
      };
    } else {
      framebufferPixels = {
        audited: true,
        ok: false,
        reason: "Frame ou posicao do player indisponivel para comparacao exata."
      };
    }
  }
  const checks = {
    binding,
    frameCount: header.includes(`constexpr int ${playerSymbol}_frame_count = ${spec.frameCount};`),
    frameSize: header.includes(`constexpr int ${playerSymbol}_sprite_width = ${spec.frameWidth};`)
      && header.includes(`constexpr int ${playerSymbol}_sprite_height = ${spec.frameHeight};`),
    framebuffer: !requireFramebuffer || framebuffer.ok,
    framebufferPixels: !exactOptions || framebufferPixels.ok,
    metasprites: header.includes(`constexpr gbs::MetaSprite ${playerSymbol}_metasprites[${spec.frameCount}]`),
    palette: objectPaletteOverride
      ? palette.length === 16
        && palette.every((value, index) => value === (objectPaletteOverride[index] ?? 0))
      : Array.isArray(spec.palette)
        ? palette.length === spec.palette.length
          && palette.every((value, index) => value === spec.palette[index])
        : palette.length === 16
          && (spec.allowPaletteRemap === true || [...sourceRgb555Colors].every((value) => palette.includes(value))),
    sheetSize: header.includes(`constexpr int ${playerSymbol}_width = ${spec.sheetWidth};`)
      && header.includes(`constexpr int ${playerSymbol}_height = ${spec.sheetHeight};`),
    sourceSha256: sourceSha256 === spec.sha256,
    sourcePixels: source.width === spec.sheetWidth
      && source.height === spec.sheetHeight
      && sourceFrames.every((sourceFrame) => sourceFrame.ok),
    tileCount: header.includes(`constexpr int ${playerSymbol}_tile_count = ${spec.tileCount};`),
    frameResidency: spec.streamFrames !== true || auditStreamedObjResidency({headerSource:header,symbol:playerSymbol,
      frameCount:spec.frameCount,frameWidth:spec.frameWidth,frameHeight:spec.frameHeight,residentTileCount:spec.tileCount}).ok,
    transparency: objectPaletteOverride !== null || palette[spec.transparentPaletteIndex ?? 0] === 0
  };
  return {
    audited: true,
    checks,
    framebuffer,
    framebufferPixels,
    framebufferRequired: requireFramebuffer,
    headerPath,
    ok: Object.values(checks).every(Boolean),
    palette,
    paletteRemapped: objectPaletteOverride !== null,
    renderedFrameHeight,
    renderedFrameWidth,
    runtime,
    sourcePath,
    sourceFrames,
    sourceSha256,
    spriteScale,
    symbol: playerSymbol
  };
}

async function capturePlayerScreenshot(cdp, sceneName) {
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
  const path = exemploSceneScreenshotPath(evidencePath, sceneName);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(screenshot.data, "base64"));
  return path;
}

async function playerFramebufferSignature(cdp) {
  // Focus outlines, window scale and screenshot placement are outside the ROM.
  const rgbaBase64 = await evaluate(cdp, `(() => {
    const canvas = window.GBAStudioDirectPlayer?.canvas;
    if (!canvas || canvas.width !== 240 || canvas.height !== 160) return null;
    const rgba = canvas.getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, 240, 160).data;
    let binary = "";
    for (let offset = 0; offset < rgba.length; offset += 0x8000) {
      binary += String.fromCharCode(...rgba.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  })()`);
  if (typeof rgbaBase64 !== "string") throw new Error("Framebuffer do carrossel indisponível.");
  return createHash("sha256").update(Buffer.from(rgbaBase64, "base64")).digest("hex");
}

async function captureBattleMenuRegion(cdp, sceneName, step) {
  const screenshotPath = await capturePlayerScreenshot(cdp, `${sceneName}_battle_${step}`);
  // Compare intrinsic GBA pixels, not screenshot pixels: the Electron window
  // can move its scaled canvas by a physical pixel when input restores focus.
  const regionWidth = 84;
  const regionHeight = 44;
  const regionX = 154;
  const regionY = 114;
  const regionBase64 = await evaluate(cdp, `(() => {
    const canvas = window.GBAStudioDirectPlayer?.canvas;
    if (!canvas || canvas.width !== 240 || canvas.height !== 160) return null;
    const rgba = canvas.getContext("2d", { willReadFrequently: true })
      .getImageData(${regionX}, ${regionY}, ${regionWidth}, ${regionHeight}).data;
    let binary = "";
    for (let offset = 0; offset < rgba.length; offset += 0x8000) {
      binary += String.fromCharCode(...rgba.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  })()`);
  if (typeof regionBase64 !== "string") {
    throw new Error(`Framebuffer de batalha indisponível em ${step}.`);
  }
  const region = Buffer.from(regionBase64, "base64");
  let lowerChoiceInk = 0;
  for (let y = 22; y < 32; y += 1) {
    for (let x = 0; x < regionWidth; x += 1) {
      const offset = (y * regionWidth + x) * 4;
      if (region[offset] > 180 && region[offset + 1] > 180 && region[offset + 2] > 180) {
        lowerChoiceInk += 1;
      }
    }
  }
  return {
    path: screenshotPath,
    signature: createHash("sha256").update(region).digest("hex"),
    lowerChoiceInk
  };
}

async function pressPlayerButton(cdp, code, key, windowsVirtualKeyCode, holdMs = 160) {
  const runtimeBeforeInput = await evaluate(
    cdp,
    "window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null"
  );
  const baselineFrame = Number(runtimeBeforeInput?.frame);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    code,
    key,
    text: key.length === 1 ? key : undefined,
    unmodifiedText: key.length === 1 ? key : undefined,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
    autoRepeat: false,
    isKeypad: false,
    isSystemKey: false
  });
  const inputSignal = await evaluate(cdp, "window.GBAStudioDirectPlayer?.canvas?.dataset.input ?? null");
  if (inputSignal !== "keyboard-down") {
    throw new Error(`Player não recebeu o evento ${code}; sinal observado: ${String(inputSignal)}.`);
  }
  const inputAfterKeyDown = await evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectInput?.() ?? null");
  const expectedKey = {
    Backspace: 1 << 2,
    Enter: 1 << 3,
    ArrowRight: 1 << 4,
    ArrowLeft: 1 << 5,
    ArrowUp: 1 << 6,
    ArrowDown: 1 << 7,
    KeyS: 1 << 8,
    KeyA: 1 << 9,
    ...configuredFaceButtonMasksByCode
  }[code] ?? 0;
  if (expectedKey !== 0 && (Number(inputAfterKeyDown?.manualKeys) & expectedKey) === 0) {
    throw new Error(`Player não manteve a máscara ${code} após o keyDown: ${JSON.stringify(inputAfterKeyDown)}.`);
  }
  if (Number.isFinite(baselineFrame)) {
    const deadline = Date.now() + 2_000;
    let advanced = false;
    while (Date.now() < deadline) {
      const state = await evaluate(
        cdp,
        "window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null"
      );
      if (Number(state?.frame) > baselineFrame) {
        advanced = true;
        break;
      }
      await wait(20);
    }
    if (!advanced) {
      throw new Error(`Runtime não avançou após pressionar ${code}; frame inicial=${baselineFrame}.`);
    }
  }
  await wait(holdMs);
  const runtimeStateWhileHeld = await evaluate(
    cdp,
    "window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null"
  );
  const inputBeforeKeyUp = await evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectInput?.() ?? null");
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    code,
    key,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
    autoRepeat: false,
    isKeypad: false,
    isSystemKey: false
  });
  await wait(260);
  const presentedRuntimeState = await evaluate(
    cdp,
    "window.GBAStudioDirectPlayer?.inspectPresentedRuntime?.()?.state ?? null"
  );
  return {
    ...runtimeStateWhileHeld,
    directPlayerInput: inputBeforeKeyUp,
    presentedRuntime: presentedRuntimeState
  };
}

async function holdPlayerButtons(cdp, buttons, holdMs = 160) {
  for (const button of buttons) {
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      code: button.code,
      key: button.key,
      text: button.key.length === 1 ? button.key : undefined,
      unmodifiedText: button.key.length === 1 ? button.key : undefined,
      windowsVirtualKeyCode: button.windowsVirtualKeyCode,
      nativeVirtualKeyCode: button.windowsVirtualKeyCode,
      autoRepeat: false,
      isKeypad: false,
      isSystemKey: false
    });
  }
  const inputSignal = await evaluate(cdp, "window.GBAStudioDirectPlayer?.canvas?.dataset.input ?? null");
  if (inputSignal !== "keyboard-down") {
    throw new Error(`Player não recebeu o acorde ${buttons.map((button) => button.code).join("+")}; sinal observado: ${String(inputSignal)}.`);
  }
  await wait(holdMs);
  for (const button of [...buttons].reverse()) {
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      code: button.code,
      key: button.key,
      windowsVirtualKeyCode: button.windowsVirtualKeyCode,
      nativeVirtualKeyCode: button.windowsVirtualKeyCode,
      autoRepeat: false,
      isKeypad: false,
      isSystemKey: false
    });
  }
  await wait(260);
}

async function runShmupInputExercise(cdp, sceneName, faceButtons) {
  if (sceneName !== "tempestade") {
    throw new Error(`O exercício de input shmup foi solicitado para uma cena não suportada: ${sceneName}.`);
  }

  const readRuntimeState = () => evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null");
  const right = { code: "ArrowRight", key: "ArrowRight", windowsVirtualKeyCode: 39 };
  const left = { code: "ArrowLeft", key: "ArrowLeft", windowsVirtualKeyCode: 37 };
  const brake = faceButtons.b;

  await wait(350);
  const beforeNormalMovement = await readRuntimeState();
  await pressPlayerButton(cdp, right.code, right.key, right.windowsVirtualKeyCode, 320);
  const afterNormalMovement = await readRuntimeState();
  const normalDelta = Number(afterNormalMovement?.player?.x) - Number(beforeNormalMovement?.player?.x);

  await pressPlayerButton(cdp, left.code, left.key, left.windowsVirtualKeyCode, 320);
  const beforeBrakedMovement = await readRuntimeState();
  await holdPlayerButtons(cdp, [right, brake], 320);
  const afterBrakedMovement = await readRuntimeState();
  const brakeDelta = Number(afterBrakedMovement?.player?.x) - Number(beforeBrakedMovement?.player?.x);
  if (!(normalDelta > 0 && brakeDelta > 0 && brakeDelta < normalDelta)) {
    throw new Error(`Freio aéreo não reduziu o deslocamento: normal=${normalDelta}, freado=${brakeDelta}.`);
  }

  const beforeFire = await readRuntimeState();
  await pressPlayerButton(cdp, faceButtons.a.code, faceButtons.a.key, faceButtons.a.windowsVirtualKeyCode, 80);
  const afterFire = await readRuntimeState();
  if (!(Number(afterFire?.frame) > Number(beforeFire?.frame))) {
    throw new Error("O runtime shmup não avançou após o disparo com A.");
  }

  return {
    ok: true,
    controls: ["direcional", "A", "B"],
    normalDelta,
    brakeDelta,
    beforeNormalMovement,
    afterNormalMovement,
    beforeBrakedMovement,
    afterBrakedMovement,
    beforeFire,
    afterFire
  };
}

async function runShmupWavesExercise(cdp, sceneName, faceButtons) {
  if (sceneName !== "tempestade") {
    throw new Error(`O exercício de waves shmup foi solicitado para uma cena não suportada: ${sceneName}.`);
  }
  const readRuntimeState = () => evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null");
  const up = { code: "ArrowUp", key: "ArrowUp", windowsVirtualKeyCode: 38 };
  const down = { code: "ArrowDown", key: "ArrowDown", windowsVirtualKeyCode: 40 };
  const fire = faceButtons.a;
  const movePlayerToY = async (targetY) => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const state = await readRuntimeState();
      const currentY = Number(state?.player?.y);
      if (!Number.isFinite(currentY) || Math.abs(currentY - targetY) <= 4) return state;
      const button = currentY > targetY ? up : down;
      await pressPlayerButton(cdp, button.code, button.key, button.windowsVirtualKeyCode, 80);
    }
    return readRuntimeState();
  };
  const fireUntilActorCount = async (targetCount, attempts = 20) => {
    let state = await readRuntimeState();
    for (let attempt = 0; attempt < attempts && Number(state?.actorCount) > targetCount; attempt += 1) {
      await pressPlayerButton(cdp, fire.code, fire.key, fire.windowsVirtualKeyCode, 80);
      state = await readRuntimeState();
    }
    return state;
  };
  const fireUntilCountOrRuntimeTransition = async (targetCount, expectedRuntimeKind, attempts = 20) => {
    let state = await readRuntimeState();
    for (
      let attempt = 0;
      attempt < attempts &&
        Number(state?.actorCount) > targetCount &&
        Number(state?.runtimeKind) === expectedRuntimeKind;
      attempt += 1
    ) {
      await pressPlayerButton(cdp, fire.code, fire.key, fire.windowsVirtualKeyCode, 80);
      state = await readRuntimeState();
    }
    return state;
  };
  await wait(250);
  const initial = await readRuntimeState();
  const initialEnemyCount = Number(initial?.actorCount);
  if (
    Number(initial?.currentRoom) !== 0 ||
    !Number.isFinite(initialEnemyCount) ||
    initialEnemyCount < 2 ||
    Number(initial?.runtimeKind) !== runtimeKindByName.shmup
  ) {
    throw new Error(`A primeira wave SHMUP não iniciou com inimigos suficientes: ${JSON.stringify(initial)}.`);
  }
  await movePlayerToY(36);
  const afterFirstWaveTop = await fireUntilActorCount(initialEnemyCount - 1);
  if (Number(afterFirstWaveTop?.actorCount) !== initialEnemyCount - 1) {
    throw new Error(`A primeira wave SHMUP não removeu um inimigo: ${JSON.stringify(afterFirstWaveTop)}.`);
  }

  await movePlayerToY(84);
  const afterSecondEnemy = await fireUntilCountOrRuntimeTransition(initialEnemyCount - 2, runtimeKindByName.shmup);
  if (
    Number(afterSecondEnemy?.runtimeKind) === runtimeKindByName.shmup &&
    Number(afterSecondEnemy?.actorCount) !== initialEnemyCount - 2
  ) {
    throw new Error(`A primeira wave SHMUP não removeu o segundo inimigo: ${JSON.stringify(afterSecondEnemy)}.`);
  }

  const transition = await waitForRuntimeScene(cdp, "battleRpg", 0, 2, 10_000);
  const afterTransition = transition?.runtimeState ?? null;
  if (
    !transition?.ok ||
    Number(afterTransition?.runtimeKind) !== runtimeKindByName.battleRpg ||
    Number(afterTransition?.currentRoom) !== 0 ||
    Number(afterTransition?.actorCount) < 1
  ) {
    throw new Error(`A conclusão da wave SHMUP não abriu a batalha seguinte: ${JSON.stringify({ afterSecondEnemy, transition }).slice(0, 2400)}.`);
  }
  return {
    ok: true,
    scene: sceneName,
    initial,
    afterFirstWaveTop,
    afterSecondEnemy,
    afterTransition,
    transitionRuntime: Number(afterTransition.runtimeKind),
    transitionRoom: Number(afterTransition.currentRoom)
  };
}

async function runPointClickInputExercise(cdp, sceneName, exportedProject, faceButtons) {
  if (!["armazem_das_mares", "observatorio_do_farol"].includes(sceneName)) {
    throw new Error(`O percurso point-and-click não contempla ${sceneName}.`);
  }
  const scenes = exportedProject?.point_click_project?.scenes ?? [];
  const sceneIndex = scenes.findIndex((scene) => scene?.name === sceneName);
  const scene = scenes[sceneIndex];
  const dialogueHotspot = scene?.hotspots?.find((hotspot) =>
    hotspot?.on_click?.some((step) => step?.op === "show_dialogue"));
  const exitHotspot = scene?.hotspots?.find((hotspot) =>
    hotspot?.on_click?.some((step) => step?.op === "warp" || step?.op === "warp_runtime"));
  if (sceneIndex < 0 || !dialogueHotspot || !exitHotspot) {
    throw new Error(`Hotspots de diálogo/saída ausentes em ${sceneName}.`);
  }
  const readState = () => evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null");
  const lowerRegionSignature = () => evaluate(cdp, `(() => {
    const canvas = window.GBAStudioDirectPlayer?.canvas;
    if (!canvas || canvas.width !== 240 || canvas.height !== 160) return null;
    const rgba = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 112, 240, 48).data;
    let hash = 2166136261;
    for (let i = 0; i < rgba.length; i += 4) {
      hash = Math.imul(hash ^ rgba[i], 16777619);
      hash = Math.imul(hash ^ rgba[i + 1], 16777619);
      hash = Math.imul(hash ^ rgba[i + 2], 16777619);
    }
    return hash >>> 0;
  })()`);
  const directions = {
    left: { code: "ArrowLeft", key: "ArrowLeft", windowsVirtualKeyCode: 37 },
    right: { code: "ArrowRight", key: "ArrowRight", windowsVirtualKeyCode: 39 },
    up: { code: "ArrowUp", key: "ArrowUp", windowsVirtualKeyCode: 38 },
    down: { code: "ArrowDown", key: "ArrowDown", windowsVirtualKeyCode: 40 }
  };
  async function moveCursorTo(hotspot) {
    const area = hotspot.area;
    const target = { x: Math.floor(area.x + area.width / 2), y: Math.floor(area.y + area.height / 2) };
    for (const axis of ["x", "y"]) {
      for (let attempt = 0; attempt < 35; attempt += 1) {
        const current = await readState();
        const delta = target[axis] - Number(current?.player?.[axis]);
        if (!Number.isFinite(delta)) throw new Error(`Cursor indisponível em ${sceneName}.`);
        if (Math.abs(delta) <= 5) break;
        const direction = axis === "x"
          ? delta < 0 ? directions.left : directions.right
          : delta < 0 ? directions.up : directions.down;
        await pressPlayerButton(cdp, direction.code, direction.key, direction.windowsVirtualKeyCode,
          Math.min(110, Math.max(20, Math.floor(Math.abs(delta) * 5))));
        if (attempt === 34) throw new Error(`Cursor não alcançou ${hotspot.name} em ${sceneName}.`);
      }
    }
    const state = await readState();
    const x = Number(state?.player?.x);
    const y = Number(state?.player?.y);
    if (x < area.x || x >= area.x + area.width || y < area.y || y >= area.y + area.height) {
      throw new Error(`Cursor fora de ${hotspot.name}: ${JSON.stringify({ x, y, area })}.`);
    }
    return { x, y };
  }

  const initial = await readState();
  if (Number(initial?.runtimeKind) !== runtimeKindByName.pointClick || Number(initial?.currentRoom) !== sceneIndex) {
    throw new Error(`Play não iniciou ${sceneName} no runtime point-and-click: ${JSON.stringify(initial)}.`);
  }
  const dialogueCursor = await moveCursorTo(dialogueHotspot);
  const beforeDialogue = await lowerRegionSignature();
  await pressPlayerButton(cdp, faceButtons.a.code, faceButtons.a.key, faceButtons.a.windowsVirtualKeyCode, 80);
  await wait(400);
  const duringDialogue = await lowerRegionSignature();
  const dialogueScreenshot = await capturePlayerScreenshot(cdp, `${sceneName}_point_click_dialogue`);
  if (beforeDialogue === null || duringDialogue === null || beforeDialogue === duringDialogue) {
    throw new Error(`O clique em ${dialogueHotspot.name} não alterou a região de diálogo de ${sceneName}.`);
  }
  let closed = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await pressPlayerButton(cdp, faceButtons.a.code, faceButtons.a.key, faceButtons.a.windowsVirtualKeyCode, 60);
    await wait(100);
    if (await lowerRegionSignature() === beforeDialogue) {
      closed = true;
      break;
    }
  }
  if (!closed) throw new Error(`O diálogo de ${dialogueHotspot.name} não fechou em ${sceneName}.`);
  const exitCursor = await moveCursorTo(exitHotspot);
  await pressPlayerButton(cdp, faceButtons.a.code, faceButtons.a.key, faceButtons.a.windowsVirtualKeyCode, 80);
  const expectedRuntime = sceneName === "armazem_das_mares" ? "pointClick" : "isometric";
  const expectedRoom = sceneName === "armazem_das_mares" ? 1 : 0;
  const exit = await waitForRuntimeScene(cdp, expectedRuntime, expectedRoom, 2, 10_000);
  const exitScreenshot = await capturePlayerScreenshot(cdp, `${sceneName}_point_click_exit`);
  if (!exit?.ok) throw new Error(`Saída de ${sceneName} não alcançou ${expectedRuntime}/${expectedRoom}: ${JSON.stringify({ exitCursor, state: exit?.runtimeState, exitScreenshot })}.`);
  return { ok: true, scene: sceneName, dialogueHotspot: dialogueHotspot.name, dialogueCursor,
    dialogueScreenshot, exitHotspot: exitHotspot.name, exitCursor, exitScreenshot,
    exitRuntime: expectedRuntime, exitRoom: expectedRoom };
}

async function runFeatureModulesInputExercise(cdp, sceneName, startMenuScreenIndex = -1, menuProject = null) {
  const readRuntimeState = () => evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null");
  const a = { code: "KeyX", key: "x", windowsVirtualKeyCode: 88 };
  const b = { code: "KeyZ", key: "z", windowsVirtualKeyCode: 90 };
  const select = { code: "Backspace", key: "Backspace", windowsVirtualKeyCode: 8 };
  const start = { code: "Enter", key: "Enter", windowsVirtualKeyCode: 13 };
  const left = { code: "ArrowLeft", key: "ArrowLeft", windowsVirtualKeyCode: 37 };
  const down = { code: "ArrowDown", key: "ArrowDown", windowsVirtualKeyCode: 40 };
  const up = { code: "ArrowUp", key: "ArrowUp", windowsVirtualKeyCode: 38 };

  if (sceneName === "porto_lumen") {
    await wait(350);
    let initial = await readRuntimeState();
    for (let attempt = 0; attempt < 20 && Number(initial?.variables?.[14]) === 0; attempt += 1) {
      await wait(250);
      initial = await readRuntimeState();
    }
    if (!initial || Number(initial?.variables?.[14]) !== 0) {
      throw new Error(`Porto não produziu telemetria inicial estável: ${JSON.stringify(initial?.variables)}.`);
    }
    for (let step = 0; step < 6; step += 1) {
      await pressPlayerButton(cdp, left.code, left.key, left.windowsVirtualKeyCode, 320);
    }
    await pressPlayerButton(cdp, down.code, down.key, down.windowsVirtualKeyCode, 320);
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    await wait(350);
    const afterQuest = await readRuntimeState();

    await pressPlayerButton(cdp, start.code, start.key, start.windowsVirtualKeyCode, 80);
    await wait(350);
    const rootMenuState = await readRuntimeState();
    if (
      Number(rootMenuState?.runtimeKind) !== runtimeKindByName.menu
      || (startMenuScreenIndex >= 0 && Number(rootMenuState?.currentRoom) !== startMenuScreenIndex)
    ) {
      throw new Error(`O Start não abriu a cena Menu Start autorada: ${JSON.stringify({ expected: startMenuScreenIndex, state: rootMenuState })}.`);
    }
    const startScreen = Array.isArray(menuProject?.screens)
      ? menuProject.screens[startMenuScreenIndex]
      : null;
    const expectedSubpages = [
      ["missoes", "Missões"],
      ["inventario", "Inventário"],
      ["mapa_menu", "Mapa"],
      ["salvar", "Salvar"],
      ["configuracoes", "Configurações"]
    ];
    const visitedSubpages = [];
    let focusedStartItem = 0;
    for (const [targetName, label] of expectedSubpages) {
      const targetScreenIndex = Array.isArray(menuProject?.screens)
        ? menuProject.screens.findIndex((screen) => screen?.name === targetName)
        : -1;
      const itemIndex = Array.isArray(startScreen?.items)
        ? startScreen.items.findIndex((item) => Number(item?.target_screen) === targetScreenIndex)
        : -1;
      if (targetScreenIndex < 0 || itemIndex < 0) {
        throw new Error(`A rota ${label} não está ligada ao Menu Start: ${JSON.stringify({ targetName, targetScreenIndex, itemIndex })}.`);
      }
      for (let step = focusedStartItem; step < itemIndex; step += 1) {
        await pressPlayerButton(cdp, down.code, down.key, down.windowsVirtualKeyCode, 80);
      }
      await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
      const subpageTransition = await waitForRuntimeScene(cdp, "menu", targetScreenIndex, 2, 8_000);
      if (!subpageTransition?.ok) {
        throw new Error(`A rota ${label} não abriu a subpágina autorada: ${JSON.stringify(subpageTransition?.runtimeState)}.`);
      }
      await pressPlayerButton(cdp, b.code, b.key, b.windowsVirtualKeyCode, 80);
      const rootReturn = await waitForRuntimeScene(cdp, "menu", startMenuScreenIndex, 2, 8_000);
      if (!rootReturn?.ok) {
        throw new Error(`B não retornou ao Menu Start após ${label}: ${JSON.stringify(rootReturn?.runtimeState)}.`);
      }
      focusedStartItem = itemIndex;
      visitedSubpages.push({ label, screen: targetScreenIndex });
    }

    const settingsScreenIndex = Array.isArray(menuProject?.screens)
      ? menuProject.screens.findIndex((screen) => screen?.name === "configuracoes")
      : -1;
    const settingsScreen = settingsScreenIndex >= 0 ? menuProject.screens[settingsScreenIndex] : null;
    const settingsItemIndex = Array.isArray(startScreen?.items)
      ? startScreen.items.findIndex((item) => Number(item?.target_screen) === settingsScreenIndex)
      : -1;
    if (settingsScreenIndex < 0 || settingsItemIndex < 0 || !settingsScreen) {
      throw new Error(`A rota de Configurações não está ligada ao Menu Start: ${JSON.stringify({
        settingsScreenIndex,
        settingsItemIndex
      })}.`);
    }

    for (let step = focusedStartItem; step < settingsItemIndex; step += 1) {
      await pressPlayerButton(cdp, down.code, down.key, down.windowsVirtualKeyCode, 80);
    }
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    const settingsTransition = await waitForRuntimeScene(cdp, "menu", settingsScreenIndex, 2, 8_000);
    if (!settingsTransition?.ok) {
      throw new Error(`O Menu Start não abriu Configurações: ${JSON.stringify(settingsTransition?.runtimeState)}.`);
    }

    const audioBefore = await readRuntimeState();
    const audioBeforeMasterFrame = await evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectFrame?.() ?? null");
    await pressPlayerButton(cdp, left.code, left.key, left.windowsVirtualKeyCode, 80);
    const audioAfterMaster = await readRuntimeState();
    const audioAfterMasterFrame = await evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectFrame?.() ?? null");
    if (!audioBeforeMasterFrame?.signature || !audioAfterMasterFrame?.signature
      || audioBeforeMasterFrame.signature === audioAfterMasterFrame.signature) {
      throw new Error(`Áudio não atualizou visualmente o volume geral: antes=${JSON.stringify(audioBeforeMasterFrame)} depois=${JSON.stringify(audioAfterMasterFrame)} estado=${JSON.stringify(audioAfterMaster)}.`);
    }
    for (let step = 0; step < 3; step += 1) {
      await pressPlayerButton(cdp, down.code, down.key, down.windowsVirtualKeyCode, 80);
    }
    const audioBeforeToggleFrame = await evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectFrame?.() ?? null");
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    const audioAfterToggle = await readRuntimeState();
    const audioAfterToggleFrame = await evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectFrame?.() ?? null");
    if (!audioBeforeToggleFrame?.signature || !audioAfterToggleFrame?.signature
      || audioBeforeToggleFrame.signature === audioAfterToggleFrame.signature) {
      throw new Error(`Áudio não atualizou visualmente Som ligado: antes=${JSON.stringify(audioBeforeToggleFrame)} depois=${JSON.stringify(audioAfterToggleFrame)} estado=${JSON.stringify(audioAfterToggle)}.`);
    }
    await pressPlayerButton(cdp, b.code, b.key, b.windowsVirtualKeyCode, 80);
    const settingsAfterAudio = await waitForRuntimeScene(cdp, "menu", settingsScreenIndex, 2, 8_000);
    if (!settingsAfterAudio?.ok) {
      throw new Error(`B não manteve a cena única de Configurações: ${JSON.stringify(settingsAfterAudio?.runtimeState)}.`);
    }
    await pressPlayerButton(cdp, b.code, b.key, b.windowsVirtualKeyCode, 80);
    const rootAfterSettings = await waitForRuntimeScene(cdp, "menu", startMenuScreenIndex, 2, 8_000);
    if (!rootAfterSettings?.ok) {
      throw new Error(`B não retornou de Configurações para o Menu Start: ${JSON.stringify(rootAfterSettings?.runtimeState)}.`);
    }

    await pressPlayerButton(cdp, b.code, b.key, b.windowsVirtualKeyCode, 80);
    const resumedTransition = await waitForRuntimeScene(cdp, "topdown", 0, 2, 8_000);
    const resumedState = resumedTransition?.runtimeState ?? await readRuntimeState();
    if (!resumedTransition?.ok || Number(resumedState?.runtimeKind) !== runtimeKindByName.topdown || Number(resumedState?.currentRoom) !== 0) {
      throw new Error(`B não retornou à sala top-down após o Menu Start: ${JSON.stringify(resumedState)}.`);
    }
    return {
      ok: true,
      scene: sceneName,
      initial,
      afterQuest,
      rootMenuState,
      visitedSubpages,
      settingsTransition,
      audioBefore,
      audioAfterMaster,
      audioBeforeMasterFrame,
      audioAfterMasterFrame,
      audioBeforeToggleFrame,
      audioAfterToggle,
      audioAfterToggleFrame,
      resumedState
    };
  }

  if (sceneName === "tempestade") {
    await wait(350);
    const initial = await readRuntimeState();
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    const afterFire = await readRuntimeState();
    if (Number(afterFire?.frame) <= Number(initial?.frame) || Number(afterFire?.currentRoom) !== 0) {
      throw new Error(`SHMUP não manteve a primeira wave após o disparo: antes=${JSON.stringify(initial)} depois=${JSON.stringify(afterFire)}.`);
    }
    return { ok: true, scene: sceneName, initial, afterFire, waveIndex: Number(afterFire?.currentRoom) };
  }

  if (sceneName === "usina_submersa") {
    await wait(350);
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    await wait(350);
    const initial = await readRuntimeState();
    await pressPlayerButton(cdp, start.code, start.key, start.windowsVirtualKeyCode, 80);
    await wait(350);
    const mapScreenshot = await capturePlayerScreenshot(cdp, `${sceneName}_map`);
    await pressPlayerButton(cdp, down.code, down.key, down.windowsVirtualKeyCode, 80);
    await pressPlayerButton(cdp, b.code, b.key, b.windowsVirtualKeyCode, 80);
    const afterMap = await readRuntimeState();
    await pressPlayerButton(cdp, select.code, select.key, select.windowsVirtualKeyCode, 80);
    await wait(350);
    const inventoryMenu = await readRuntimeState();
    const inventoryScreenshot = await capturePlayerScreenshot(cdp, `${sceneName}_inventory`);
    // Close the inventory with B. The canonical room starts with zero cells,
    // so selecting the item would open a notice and make the following
    // movement assertions depend on dialogue timing instead of locomotion.
    await pressPlayerButton(cdp, b.code, b.key, b.windowsVirtualKeyCode, 80);
    await wait(350);
    const afterInventory = await readRuntimeState();
    if (Number(afterInventory?.runtimeKind) !== 6 || Number(afterInventory?.currentRoom) !== 0) {
      throw new Error(`O uso da CÉLULA não retornou à exploração Dungeon: ${JSON.stringify(afterInventory)}.`);
    }
    await pressPlayerButton(cdp, down.code, down.key, down.windowsVirtualKeyCode, 320);
    const afterForward = await readRuntimeState();
    if (Number(afterForward?.player?.x) === Number(initial?.player?.x)
      && Number(afterForward?.player?.y) === Number(initial?.player?.y)) {
      throw new Error(`Dungeon Crawler não avançou com recuo: ${JSON.stringify(initial?.player)}.`);
    }
    await pressPlayerButton(cdp, up.code, up.key, up.windowsVirtualKeyCode, 320);
    const afterBackstep = await readRuntimeState();
    if (Number(afterBackstep?.player?.x) !== Number(initial?.player?.x)
      || Number(afterBackstep?.player?.y) !== Number(initial?.player?.y)) {
      throw new Error(`Dungeon Crawler não retornou com backstep: inicial=${JSON.stringify(initial?.player)} final=${JSON.stringify(afterBackstep?.player)}.`);
    }
    // The approved composition keeps the portal unobstructed. Stepping into
    // its trigger enters the dedicated combat room; A then dismisses the
    // entry dialogue and targets the sentinel.
    await pressPlayerButton(cdp, up.code, up.key, up.windowsVirtualKeyCode, 320);
    await wait(350);
    const dialogueScreenshot = await capturePlayerScreenshot(cdp, `${sceneName}_dialogue`);
    let battleStarted = await readRuntimeState();
    for (let attempt = 0; attempt < 4 && Number(battleStarted?.collision?.currentFlags) !== 3; attempt += 1) {
      await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
      await wait(180);
      battleStarted = await readRuntimeState();
    }
    const battleScreenshot = await capturePlayerScreenshot(cdp, `${sceneName}_battle`);
    if (Number(battleStarted?.collision?.currentFlags) !== 3
      || Number(battleStarted?.collision?.currentSlope) !== 3) {
      throw new Error(`A interação com a Sentinela não abriu a batalha: ${JSON.stringify(battleStarted)}.`);
    }
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    const firstAttack = await readRuntimeState();
    if (Number(firstAttack?.collision?.currentFlags) !== 2
      || Number(firstAttack?.collision?.currentSlope) !== 2) {
      throw new Error(`O primeiro ataque não atualizou HP da batalha: ${JSON.stringify(firstAttack)}.`);
    }
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    const battleVictory = await readRuntimeState();
    if (Number(battleVictory?.collision?.currentFlags) !== 0
      || Number(battleVictory?.roomChangeCount) !== 1) {
      throw new Error(`A batalha não terminou com vitória e recompensa: ${JSON.stringify(battleVictory)}.`);
    }
    return { ok: true, scene: sceneName, initial, mapScreenshot, afterMap, inventoryMenu, inventoryScreenshot, afterInventory, afterForward, afterBackstep, dialogueScreenshot, battleStarted, battleScreenshot, firstAttack, battleVictory };
  }

  if (sceneName === "usina_combate") {
    await wait(350);
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    const initial = await readRuntimeState();
    if (Number(initial?.currentRoom) !== 1
      || Number(initial?.player?.x) !== 14
      || Number(initial?.player?.y) !== 6) {
      throw new Error(`A cena de combate não iniciou na posição canônica: ${JSON.stringify(initial)}.`);
    }
    let battleStarted = await readRuntimeState();
    for (let attempt = 0; attempt < 4 && Number(battleStarted?.collision?.currentFlags) !== 3; attempt += 1) {
      await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
      await wait(180);
      battleStarted = await readRuntimeState();
    }
    const battleScreenshot = await capturePlayerScreenshot(cdp, `${sceneName}_battle`);
    if (Number(battleStarted?.collision?.currentFlags) !== 3
      || Number(battleStarted?.collision?.currentSlope) !== 3) {
      throw new Error(`A Sentinela não abriu a batalha na cena dedicada: ${JSON.stringify(battleStarted)}.`);
    }
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    const firstAttack = await readRuntimeState();
    if (Number(firstAttack?.collision?.currentFlags) !== 2
      || Number(firstAttack?.collision?.currentSlope) !== 2) {
      throw new Error(`O primeiro ataque da cena dedicada não atualizou HP: ${JSON.stringify(firstAttack)}.`);
    }
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    const battleVictory = await readRuntimeState();
    if (Number(battleVictory?.collision?.currentFlags) !== 0
      || Number(battleVictory?.roomChangeCount) !== 1) {
      throw new Error(`A cena dedicada não encerrou a batalha com vitória: ${JSON.stringify(battleVictory)}.`);
    }
    return { ok: true, scene: sceneName, initial, battleStarted, battleScreenshot, firstAttack, battleVictory };
  }

  if (sceneName === "usina_saida") {
    await wait(350);
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    await wait(350);
    const initial = await readRuntimeState();
    if (Number(initial?.currentRoom) !== 2
      || Number(initial?.player?.x) !== 17
      || Number(initial?.player?.y) !== 5
      || Number(initial?.variables?.[2]) !== 0) {
      throw new Error(`A saída da usina não iniciou no estado canônico: ${JSON.stringify(initial)}.`);
    }
    let rewardDialogue = await readRuntimeState();
    // The entry line can still be typing when the player reaches the cell.
    // Advance the dialogue until the interaction has actually persisted the
    // reward, without assuming a fixed number of A presses for every text
    // speed or page layout.
    for (let attempt = 0; attempt < 4 && Number(rewardDialogue?.variables?.[2]) !== 1; attempt += 1) {
      await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
      await wait(350);
      rewardDialogue = await readRuntimeState();
    }
    const rewardScreenshot = await capturePlayerScreenshot(cdp, `${sceneName}_reward_dialogue`);
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    const afterCollection = await readRuntimeState();
    if (Number(rewardDialogue?.variables?.[2]) !== 1
      || Number(afterCollection?.variables?.[2]) !== 1) {
      throw new Error(`A coleta da Célula não persistiu var_energy_cell: durante=${JSON.stringify(rewardDialogue)} depois=${JSON.stringify(afterCollection)}.`);
    }
    return { ok: true, scene: sceneName, initial, rewardDialogue, rewardScreenshot, afterCollection };
  }

  throw new Error(`Exercício de módulos não suporta a cena ${sceneName}.`);
}

async function runCutscenePortraitsExercise(cdp, sceneName) {
  const exercise = {
    conselho_guardia: {
      expectedPortraitAsset: "guardian-portrait.png",
      expectedPortraitSlot: "right",
      expectedSlot: { height: 64, width: 64, x: 168, y: 40 },
      followUpCaptures: 1
    },
    prologo: {
      expectedPortraitAsset: "nara-portrait.png",
      expectedPortraitSlot: "left",
      expectedSlot: { height: 64, width: 64, x: 8, y: 40 },
      followUpCaptures: 5
    }
  }[sceneName];
  if (!exercise) {
    throw new Error(`O exercício de retratos foi solicitado para uma cena não suportada: ${sceneName}.`);
  }

  const readRuntimeState = () => evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null");
  const a = { code: "KeyX", key: "x", windowsVirtualKeyCode: 88 };
  const captures = [];
  const capture = async (label) => {
    const path = await capturePlayerScreenshot(cdp, `${sceneName}_portraits_${label}`);
    const decoded = decodePngRgba(await readFile(path));
    const runtimeState = await readRuntimeState();
    const scaleX = decoded.width / 240;
    const scaleY = decoded.height / 160;
    let viewportNonBlackPixelCount = 0;
    for (let y = 0; y < 160; y += 1) {
      const sampleY = Math.min(decoded.height - 1, Math.floor((y + 0.5) * scaleY));
      for (let x = 0; x < 240; x += 1) {
        const sampleX = Math.min(decoded.width - 1, Math.floor((x + 0.5) * scaleX));
        const offset = (sampleY * decoded.width + sampleX) * 4;
        if (decoded.pixels[offset] + decoded.pixels[offset + 1] + decoded.pixels[offset + 2] > 24) {
          viewportNonBlackPixelCount += 1;
        }
      }
    }
    captures.push({
      currentRoom: Number(runtimeState?.currentRoom),
      frame: Number(runtimeState?.frame),
      height: decoded.height,
      label,
      path,
      viewportNonBlackPixelCount,
      width: decoded.width
    });
    return runtimeState;
  };

  const initial = await capture(sceneName === "prologo" ? "narrador" : "guardian_right_slot");
  for (let attempt = 1; attempt <= exercise.followUpCaptures; attempt += 1) {
    await pressPlayerButton(cdp, a.code, a.key, a.windowsVirtualKeyCode, 80);
    if (sceneName === "conselho_guardia") await wait(1_000);
    await wait(160);
    await capture(`after_a_${attempt}`);
  }
  const comparableCaptures = sceneName === "prologo"
    ? captures.filter((entry) => entry.currentRoom === Number(initial?.currentRoom))
    : captures;
  if (comparableCaptures.length < (sceneName === "prologo" ? 3 : 2)) {
    throw new Error(`A cena não manteve estados capturáveis ao exercitar o retrato: ${JSON.stringify(captures)}.`);
  }
  if (sceneName === "conselho_guardia") {
    const transitionCapture = captures.find((entry) => entry.label === "after_a_1");
    if (!transitionCapture || transitionCapture.viewportNonBlackPixelCount < 1_000) {
      throw new Error(`A transição Conselho → Tempestade produziu um framebuffer vazio: ${JSON.stringify(captures)}.`);
    }
  }

  return {
    captures,
    expectedSlot: exercise.expectedSlot,
    expectedPortraitAsset: exercise.expectedPortraitAsset,
    expectedPortraitSlot: exercise.expectedPortraitSlot,
    initial,
    ok: true,
    scene: sceneName
  };
}

async function sampleCanonicalTransitionBoundary(cdp, style, targetRuntimeKind, targetRoom) {
  return evaluate(cdp, `
    new Promise((resolve) => {
      const samples = [];
      const started = Date.now();
      let baselineRoomChangeCount = null;
      let boundaryFrame = null;
      const collect = () => {
        const player = window.GBAStudioDirectPlayer;
        const frame = player?.inspectFrame?.() ?? null;
        const state = player?.inspectRuntime?.()?.state ?? null;
        const roomChangeCount = Number(state?.roomChangeCount ?? 0);
        const runtimeFrame = Number(state?.frame ?? 0);
        baselineRoomChangeCount ??= roomChangeCount;
        samples.push({
          actorCount: Number(state?.actorCount ?? 0),
          firstActorVisible: state?.firstActor?.visible === true,
          frame: runtimeFrame,
          meaningful: frame?.meaningful === true,
          nonBlackRatio: Number(frame?.nonBlackRatio ?? 0),
          room: Number(state?.currentRoom ?? -1),
          roomChangeCount,
          runtimeKind: Number(state?.runtimeKind ?? -1),
          signature: frame?.signature ?? null,
          uniqueColorCount: Number(frame?.uniqueColorCount ?? 0),
          timing: {
            cpuWorkTicks: Number(state?.timing?.cpuWorkTicks ?? 0),
            missedFrameCount: Number(state?.timing?.missedFrameCount ?? 0),
            renderSkipCount: Number(state?.timing?.renderSkipCount ?? 0),
            vblankWaitTicks: Number(state?.timing?.vblankWaitTicks ?? 0)
          }
        });
        if (roomChangeCount > baselineRoomChangeCount
          || (Number(state?.runtimeKind) === ${JSON.stringify(targetRuntimeKind)}
            && Number(state?.currentRoom) === ${JSON.stringify(targetRoom)})) {
          boundaryFrame ??= runtimeFrame;
        }
        const targetSamples = samples.filter((item) => item.runtimeKind === ${JSON.stringify(targetRuntimeKind)} && item.room === ${JSON.stringify(targetRoom)});
        const settledSamples = boundaryFrame === null
          ? []
          : targetSamples.filter((item) => item.frame >= boundaryFrame + 8);
        if (settledSamples.length >= 8) {
          resolve({
            boundaryFrame,
            final: settledSamples[settledSamples.length - 1],
            ok: true,
            samples,
            settledSamples,
            style: ${JSON.stringify(style)},
            targetRoom: ${JSON.stringify(targetRoom)},
            targetRuntimeKind: ${JSON.stringify(targetRuntimeKind)}
          });
          return;
        }
        if (Date.now() - started > 15_000) {
          resolve({
            boundaryFrame,
            ok: false,
            reason: "janela de transição canônica não estabilizou",
            samples,
            settledSamples,
            style: ${JSON.stringify(style)},
            targetRoom: ${JSON.stringify(targetRoom)},
            targetRuntimeKind: ${JSON.stringify(targetRuntimeKind)}
          });
          return;
        }
        requestAnimationFrame(collect);
      };
      requestAnimationFrame(collect);
    })
  `, true);
}

function assertCanonicalTransitionProbe(probe) {
  if (!probe?.ok) {
    throw new Error(`Probe temporal canônico não estabilizou: ${JSON.stringify(probe)}`);
  }
  if (Number(probe.final?.runtimeKind) !== Number(probe.targetRuntimeKind)
    || Number(probe.final?.room) !== Number(probe.targetRoom)) {
    throw new Error(`Probe temporal canônico terminou no runtime/sala errados: ${JSON.stringify(probe)}`);
  }
  const expectedActorCount = Number(probe.final?.actorCount ?? 0);
  if (!probe.settledSamples.every((sample) => sample.actorCount === expectedActorCount)) {
    throw new Error(`Probe temporal canônico detectou oscilação de atores: ${JSON.stringify(probe.settledSamples)}`);
  }
  if (!probe.settledSamples.every((sample) => sample.meaningful && sample.uniqueColorCount >= 3)) {
    throw new Error(`Probe temporal canônico detectou framebuffer inválido após a revelação: ${JSON.stringify(probe.settledSamples)}`);
  }
  const timingStart = probe.settledSamples[0]?.timing ?? {};
  const timingEnd = probe.final?.timing ?? {};
  if (Number(timingEnd.missedFrameCount) < Number(timingStart.missedFrameCount)
    || Number(timingEnd.renderSkipCount) < Number(timingStart.renderSkipCount)) {
    throw new Error(`Telemetria temporal canônica regrediu durante a transição: ${JSON.stringify(probe)}`);
  }
  return {
    ...probe,
    expectedActorCount,
    invalidSettledFrames: probe.settledSamples.filter((sample) => !sample.meaningful || sample.actorCount !== expectedActorCount).length,
    missedFramesDuringSettledWindow: Number(timingEnd.missedFrameCount) - Number(timingStart.missedFrameCount),
    renderSkipsDuringSettledWindow: Number(timingEnd.renderSkipCount) - Number(timingStart.renderSkipCount)
  };
}

async function runIsometricInputExercise(cdp, sceneName, expectedEntry, project) {
  if (sceneName !== "mercado_suspenso") {
    throw new Error(`O exercício de input isométrico foi solicitado para uma cena não suportada: ${sceneName}.`);
  }

  const marketShortcutVariableIndex = Array.isArray(project?.variables)
    ? project.variables.findIndex((variable) => variable?.name === "var_market_shortcut")
    : -1;
  if (marketShortcutVariableIndex < 0) {
    throw new Error("O projeto exemplo não expõe a variável persistente var_market_shortcut.");
  }

  const readRuntimeState = () => evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null");
  const buttons = {
    right: { code: "ArrowRight", key: "ArrowRight", windowsVirtualKeyCode: 39 },
    left: { code: "ArrowLeft", key: "ArrowLeft", windowsVirtualKeyCode: 37 },
    up: { code: "ArrowUp", key: "ArrowUp", windowsVirtualKeyCode: 38 },
    down: { code: "ArrowDown", key: "ArrowDown", windowsVirtualKeyCode: 40 },
    a: { code: "KeyX", key: "x", windowsVirtualKeyCode: 88 }
  };
  const moveTo = async (targetX, targetY, label, acceptedPositions = [{ x: targetX, y: targetY }]) => {
    const isAcceptedPosition = (state) => acceptedPositions.some((position) =>
      Math.floor(Number(state?.player?.x)) === position.x && Math.floor(Number(state?.player?.y)) === position.y
    );
    const directions = [
      { button: buttons.down, dx: -1, dy: 0 },
      { button: buttons.right, dx: 1, dy: 0 },
      { button: buttons.up, dx: 0, dy: -1 },
      { button: buttons.left, dx: 0, dy: 1 }
    ];
    for (let step = 0; step < 180; step += 1) {
      const state = await readRuntimeState();
      const currentX = Math.floor(Number(state?.player?.x));
      const currentY = Math.floor(Number(state?.player?.y));
      if (isAcceptedPosition(state)) return state;
      const target = acceptedPositions.reduce((closest, position) => {
        const distance = Math.abs(currentX - position.x) + Math.abs(currentY - position.y);
        return distance < closest.distance ? { distance, position } : closest;
      }, { distance: Number.POSITIVE_INFINITY, position: { x: targetX, y: targetY } }).position;
      const direction = currentX !== target.x
        ? directions.find((candidate) => candidate.dx === Math.sign(target.x - currentX) && candidate.dy === 0)
        : directions.find((candidate) => candidate.dy === Math.sign(target.y - currentY) && candidate.dx === 0);
      if (!direction) {
        throw new Error(`Movimento isométrico sem direção para ${label}: esperado=${JSON.stringify(acceptedPositions)}; observado=${JSON.stringify(state?.player)}.`);
      }
      // Mercado Suspenso uses continuous adventure movement. Keep the hold
      // long enough to cross a logical cell: the public runtime telemetry
      // intentionally reports the actor's logical tile, not its sub-cell
      // remainder.
      // Continuous isometric movement keeps a sub-tile remainder, while the
      // public telemetry intentionally reports only the logical tile. A
      // single 360 ms hold can therefore advance the actor without crossing
      // a tile boundary yet. Give the current direction enough samples to
      // cross that boundary before treating it as an actual collision.
      let heldState = null;
      let nextState = state;
      let changedLogicalTile = false;
      for (let sample = 0; sample < 4 && !changedLogicalTile; sample += 1) {
        heldState = await pressPlayerButton(
          cdp,
          direction.button.code,
          direction.button.key,
          direction.button.windowsVirtualKeyCode,
          360
        );
        nextState = await readRuntimeState();
        changedLogicalTile = Number(nextState?.player?.x) !== Number(state?.player?.x)
          || Number(nextState?.player?.y) !== Number(state?.player?.y);
      }
      if (!changedLogicalTile) {
        throw new Error(`Movimento isométrico bloqueado antes de ${label}: observado=${JSON.stringify({
          player: state?.player,
          nextPlayer: nextState?.player,
          inputWhileHeld: heldState?.input,
          inputAfterSettle: nextState?.input,
          directPlayerInput: heldState?.directPlayerInput,
          presentedRuntime: heldState?.presentedRuntime,
          collision: heldState?.collision,
          nextCollision: nextState?.collision,
          frame: heldState?.frame
        })}.`);
      }
    }
    const state = await readRuntimeState();
    throw new Error(`Movimento isométrico não alcançou ${label}: esperado=${JSON.stringify(acceptedPositions)}; observado=${JSON.stringify(state?.player)}.`);
  };
  const assertPosition = (state, x, y, label) => {
    if (Math.floor(Number(state?.player?.x)) !== x || Math.floor(Number(state?.player?.y)) !== y) {
      throw new Error(`Movimento isométrico divergente em ${label}: esperado=${x},${y}; observado=${JSON.stringify(state?.player)}.`);
    }
  };
  const dismissBridgeDialogue = async () => {
    // The bridge connects back to the deck through (16,14); probing Up from
    // (17,14) enters the authored water gap and is expected to be blocked.
    const probe = buttons.down;
    for (let dismissals = 1; dismissals <= 4; dismissals += 1) {
      await pressPlayerButton(cdp, buttons.a.code, buttons.a.key, buttons.a.windowsVirtualKeyCode, 80);
      const beforeProbe = await readRuntimeState();
      await pressPlayerButton(cdp, probe.code, probe.key, probe.windowsVirtualKeyCode, 80);
      const afterProbe = await readRuntimeState();
      const moved = Number(afterProbe?.player?.x) !== Number(beforeProbe?.player?.x)
        || Number(afterProbe?.player?.y) !== Number(beforeProbe?.player?.y);
      if (moved) return { dismissals, probe: afterProbe };
    }
    throw new Error("O diálogo da ponte não foi fechado após quatro confirmações e a movimentação de prova.");
  };

  await wait(1_200);
  const initial = await readRuntimeState();
  const expectedInitialX = Number(expectedEntry?.x);
  const expectedInitialY = Number(expectedEntry?.y);
  if (!Number.isInteger(expectedInitialX) || !Number.isInteger(expectedInitialY)) {
    throw new Error(`A posição inicial autorada da cena isométrica não está disponível: ${JSON.stringify(expectedEntry)}.`);
  }
  assertPosition(initial, expectedInitialX, expectedInitialY, "início");

  // Rota de teste da composição atual: mercador -> deck central -> rampa
  // dupla -> ponte de carga -> terraço superior.
  const traderApproach = await moveTo(9, 9, "aproximação do mercador");
  assertPosition(traderApproach, 9, 9, "aproximação do mercador");
  const beforeTraderDialogue = await capturePlayerScreenshot(cdp, `${sceneName}_before_trader`);
  await pressPlayerButton(cdp, buttons.a.code, buttons.a.key, buttons.a.windowsVirtualKeyCode, 80);
  const afterTraderDialogue = await capturePlayerScreenshot(cdp, `${sceneName}_trader_dialogue`);
  const [beforeTraderPixels, afterTraderPixels] = await Promise.all([
    readFile(beforeTraderDialogue),
    readFile(afterTraderDialogue)
  ]);
  if (beforeTraderPixels.equals(afterTraderPixels)) {
    throw new Error("A interação com o mercador não alterou o Play para apresentar o diálogo.");
  }
  await pressPlayerButton(cdp, buttons.a.code, buttons.a.key, buttons.a.windowsVirtualKeyCode, 80);
  await pressPlayerButton(cdp, buttons.a.code, buttons.a.key, buttons.a.windowsVirtualKeyCode, 80);

  await moveTo(10, 12, "retorno ao deck central");
  const rampApproach = await moveTo(15, 7, "aproximação da rampa");
  assertPosition(rampApproach, 15, 7, "aproximação da rampa");
  const firstRamp = await moveTo(16, 7, "primeira rampa", [{ x: 16, y: 7 }]);
  const secondRamp = await moveTo(17, 7, "segunda rampa", [{ x: 17, y: 7 }]);
  if ((Number(secondRamp?.collision?.seenSlopeBits) & 2) === 0) {
    throw new Error(`A travessia não registrou a rampa isométrica: ${JSON.stringify(secondRamp?.collision)}.`);
  }

  // A ponte está ligada ao deck pela plataforma de madeira inferior.
  const rampReturn = await moveTo(15, 7, "retorno da rampa");
  assertPosition(rampReturn, 15, 7, "retorno da rampa");
  const deckReturn = await moveTo(15, 14, "retorno ao deck inferior");
  assertPosition(deckReturn, 15, 14, "retorno ao deck inferior");
  const bridgeLane = await moveTo(16, 14, "faixa de madeira");
  assertPosition(bridgeLane, 16, 14, "faixa de madeira");
  const bridgeApproach = await moveTo(17, 14, "ponte de carga");
  assertPosition(bridgeApproach, 17, 14, "ponte de carga");
  const beforeBridge = await readRuntimeState();
  await pressPlayerButton(cdp, buttons.a.code, buttons.a.key, buttons.a.windowsVirtualKeyCode, 80);
  const afterBridge = await readRuntimeState();
  if (Number(afterBridge?.variables?.[marketShortcutVariableIndex]) !== 1) {
    throw new Error(`A ponte não ativou var_market_shortcut: antes=${JSON.stringify(beforeBridge?.variables)} depois=${JSON.stringify(afterBridge?.variables)}.`);
  }
  const bridgeDialogue = await dismissBridgeDialogue();

  // O terraço superior é acessado pela mesma rampa, mantendo a câmera e o
  // nível lógico coerentes com a composição de 24x24 células.
  const upperRampApproach = await moveTo(15, 7, "aproximação da rampa superior");
  assertPosition(upperRampApproach, 15, 7, "aproximação da rampa superior");
  const upperRamp = await moveTo(17, 7, "rampa do deck superior");
  assertPosition(upperRamp, 17, 7, "rampa do deck superior");
  const upperExitLane = await moveTo(21, 7, "faixa superior da saída");
  assertPosition(upperExitLane, 21, 7, "faixa superior da saída");
  const exitApproach = await moveTo(21, 6, "saída para a usina");
  assertPosition(exitApproach, 21, 6, "saída para a usina");
  const transitionProbePromise = transitionProbeStyle
    ? sampleCanonicalTransitionBoundary(cdp, transitionProbeStyle, runtimeKindByName.dungeonCrawler, 0)
    : null;
  await pressPlayerButton(cdp, buttons.a.code, buttons.a.key, buttons.a.windowsVirtualKeyCode, 80);
  const exitResult = await waitForRuntimeScene(cdp, "dungeonCrawler", 0, 0, 8_000);
  if (!exitResult.ok) {
    throw new Error(`A saída do Mercado não abriu a Usina Submersa: ${JSON.stringify(exitResult.runtimeState)}.`);
  }
  const transitionProbe = transitionProbePromise
    ? assertCanonicalTransitionProbe(await transitionProbePromise)
    : null;

  return {
    ok: true,
    route: ["trader", "deck", "ramp_0_to_1", "ramp_1_to_2", "bridge", "upper_route", "usina"],
    initial,
    firstRamp,
    secondRamp,
    traderApproach,
    rampReturn,
    deckReturn,
    bridgeLane,
    bridgeApproach,
    afterBridge,
    bridgeDialogue,
    bridgeDismissals: bridgeDialogue.dismissals,
    bridgeProbe: bridgeDialogue.probe,
    upperRampApproach,
    upperRamp,
    upperExitLane,
    exitApproach,
    exitResult: exitResult.runtimeState,
    transitionProbe
  };
}

async function runIsometricTacticalInputExercise(cdp, sceneName) {
  if (sceneName !== "arena_tatica") {
    throw new Error(`O exercício de input tático foi solicitado para uma cena não suportada: ${sceneName}.`);
  }

  const readRuntimeState = () => evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null");
  const decodeTacticalState = (state) => {
    const bits = Number(state?.flagBits) >>> 0;
    if ((bits & (1 << 16)) === 0) return null;
    return {
      enabled: true,
      selected: (bits & (1 << 17)) !== 0,
      activeTeam: (bits & (1 << 18)) !== 0 ? "enemy" : "player",
      turnNumber: (bits >>> 19) & 0x0F,
      cursor: {
        x: (bits >>> 23) & 0x0F,
        y: (bits >>> 27) & 0x0F
      }
    };
  };
  const buttons = {
    right: { code: "ArrowRight", key: "ArrowRight", windowsVirtualKeyCode: 39 },
    left: { code: "ArrowLeft", key: "ArrowLeft", windowsVirtualKeyCode: 37 },
    up: { code: "ArrowUp", key: "ArrowUp", windowsVirtualKeyCode: 38 },
    down: { code: "ArrowDown", key: "ArrowDown", windowsVirtualKeyCode: 40 },
    a: { code: "KeyX", key: "x", windowsVirtualKeyCode: 88 },
    select: { code: "Backspace", key: "Backspace", windowsVirtualKeyCode: 8 }
  };
  const auditTacticalSurfaceScreenshot = async (path, label) => {
    const image = decodePngRgba(await readFile(path));
    const height = Math.max(1, Math.floor(image.height * 0.72));
    const colors = new Map();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const offset = (y * image.width + x) * 4;
        const color = ((image.pixels[offset] >> 3) << 10)
          | ((image.pixels[offset + 1] >> 3) << 5)
          | (image.pixels[offset + 2] >> 3);
        colors.set(color, (colors.get(color) ?? 0) + 1);
      }
    }
    const pixelCount = image.width * height;
    const dominantCount = Math.max(...colors.values(), 0);
    const dominantColorRatio = pixelCount > 0 ? dominantCount / pixelCount : 1;
    const uniqueColorCount = colors.size;
    const surfaceMissing = uniqueColorCount < 48 && dominantColorRatio > 0.72;
    if (surfaceMissing) {
      throw new Error(
        `A superfície da Arena Tática desapareceu em ${label}; `
        + `a grade/atores podem permanecer sobre um fundo uniforme: `
        + `${JSON.stringify({ dominantColorRatio, path, uniqueColorCount })}.`
      );
    }
    return {
      dominantColorRatio,
      path,
      uniqueColorCount,
      visible: true
    };
  };
  const captures = [];
  const capture = async (label) => {
    const path = await capturePlayerScreenshot(cdp, `${sceneName}_tactical_${label}`);
    const state = await readRuntimeState();
    const surface = await auditTacticalSurfaceScreenshot(path, label);
    captures.push({
      firstActor: state?.firstActor ?? null,
      label,
      path,
      player: state?.player ?? null,
      runtimeKind: state?.runtimeKind ?? null,
      surface,
      tactical: decodeTacticalState(state)
    });
    return state;
  };
  const assertPlayerPosition = (state, x, y, label) => {
    if (Number(state?.player?.x) !== x || Number(state?.player?.y) !== y) {
      throw new Error(`A unidade tática não alcançou ${label}: esperado=${x},${y}; observado=${JSON.stringify(state?.player)}.`);
    }
  };
  const releaseDirectionalButtons = async () => {
    for (const button of [buttons.right, buttons.left, buttons.up, buttons.down]) {
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        code: button.code,
        key: button.key,
        windowsVirtualKeyCode: button.windowsVirtualKeyCode,
        nativeVirtualKeyCode: button.windowsVirtualKeyCode,
        autoRepeat: false,
        isKeypad: false,
        isSystemKey: false
      });
    }
    await wait(40);
  };
  const press = async (button) => {
    if (button === buttons.a || button === buttons.select) {
      await releaseDirectionalButtons();
    }
    await pressPlayerButton(
      cdp,
      button.code,
      button.key,
      button.windowsVirtualKeyCode,
      button === buttons.a || button === buttons.select ? 80 : 0
    );
    const state = await readRuntimeState();
    return state;
  };
  const assertTactical = (state, predicate, label) => {
    const tactical = decodeTacticalState(state);
    if (!tactical || !predicate(tactical)) {
      throw new Error(`Estado tático divergente em ${label}: ${JSON.stringify({ state, tactical })}.`);
    }
    return tactical;
  };
  const selectActiveUnit = async () => {
    const state = await press(buttons.a);
    assertTactical(state, (tactical) => tactical.selected && tactical.activeTeam === "player", "seleção da unidade ativa");
    return state;
  };
  const endEnemyTurn = async () => {
    const state = await press(buttons.select);
    assertTactical(state, (tactical) => !tactical.selected && tactical.activeTeam === "player", "fim do turno inimigo");
    return state;
  };
  const moveCursorTo = async (targetX, targetY, label) => {
    let state = await readRuntimeState();
    for (let step = 0; step < 12; step += 1) {
      const tactical = assertTactical(state, () => true, `${label} · leitura do cursor`);
      if (tactical.cursor.x === targetX && tactical.cursor.y === targetY) return state;
      const button = tactical.cursor.x < targetX
        ? buttons.right
        : tactical.cursor.x > targetX
          ? buttons.down
          : tactical.cursor.y < targetY
            ? buttons.left
            : buttons.up;
      let nextState = state;
      let nextTactical = tactical;
      let moved = false;
      for (let retry = 0; retry < 4; retry += 1) {
        nextState = await press(button);
        nextTactical = assertTactical(nextState, () => true, `${label} · passo ${step + 1} · tentativa ${retry + 1}`);
        if (nextTactical.cursor.x !== tactical.cursor.x || nextTactical.cursor.y !== tactical.cursor.y) {
          moved = true;
          break;
        }
      }
      if (!moved) {
        throw new Error(`O cursor tático não se moveu em ${label}: ${JSON.stringify(nextTactical)}.`);
      }
      state = nextState;
    }
    throw new Error(`O cursor tático não alcançou ${label}: esperado=${targetX},${targetY}; observado=${JSON.stringify(decodeTacticalState(state)?.cursor)}.`);
  };
  const moveActiveUnitTo = async (targetX, targetY, label) => {
    const trace = [];
    let state = await readRuntimeState();
    for (let turn = 0; turn < 8; turn += 1) {
      const currentX = Number(state?.player?.x);
      const currentY = Number(state?.player?.y);
      if (currentX === targetX && currentY === targetY) return { state, trace };
      const selectedState = await selectActiveUnit();
      const selectedTactical = decodeTacticalState(selectedState);
      const deltaX = targetX - currentX;
      const deltaY = targetY - currentY;
      const stepX = Math.max(-2, Math.min(2, deltaX));
      const stepY = stepX === deltaX ? Math.max(-2 + Math.abs(stepX), Math.min(2 - Math.abs(stepX), deltaY)) : 0;
      const cursorX = currentX + stepX;
      const cursorY = currentY + stepY;
      await moveCursorTo(cursorX, cursorY, `${label} · alvo do turno ${turn + 1}`);
      state = await press(buttons.a);
      if (Number(state?.player?.x) !== cursorX || Number(state?.player?.y) !== cursorY) {
        throw new Error(`A unidade tática não alcançou ${label} · turno ${turn + 1}: ${JSON.stringify({ expected: { x: cursorX, y: cursorY }, state })}.`);
      }
      const movedTactical = assertTactical(
        state,
        (tactical) => !tactical.selected
          && tactical.activeTeam === "enemy"
          && tactical.turnNumber !== selectedTactical.turnNumber,
        `${label} · avanço de turno ${turn + 1}`
      );
      trace.push({
        from: { x: currentX, y: currentY },
        to: { x: cursorX, y: cursorY },
        tactical: movedTactical
      });
      await endEnemyTurn();
      state = await capture(`${label}_turn_${turn + 1}`);
    }
    throw new Error(`A unidade tática não alcançou ${label}: esperado=${targetX},${targetY}; observado=${JSON.stringify(state?.player)}.`);
  };

  await wait(1_200);
  const initial = await capture("initial");
  if (Number(initial?.runtimeKind) !== 2 || !Number.isInteger(Number(initial?.currentRoom)) || Number(initial?.currentRoom) < 0) {
    throw new Error(`A arena tática não iniciou no runtime isométrico esperado: ${JSON.stringify(initial)}.`);
  }
  assertPlayerPosition(initial, 2, 4, "posição inicial");
  assertTactical(initial, (tactical) => !tactical.selected
    && tactical.activeTeam === "player"
    && tactical.turnNumber === 1
    && tactical.cursor.x === 2
    && tactical.cursor.y === 4, "início da arena");
  if (Number(initial?.firstActor?.x) !== 8 || Number(initial?.firstActor?.y) !== 3 || initial?.firstActor?.visible !== true) {
    throw new Error(`A sentinela não iniciou na posição tática esperada: ${JSON.stringify(initial?.firstActor)}.`);
  }

  // A unidade usa alcance 2; o roteiro prefere deslocamentos de uma célula
  // para manter o input do cursor determinístico no emulador Web.
  const firstMove = await moveActiveUnitTo(3, 4, "primeiro deslocamento");
  const secondMove = await moveActiveUnitTo(4, 4, "segundo deslocamento");
  const approachMove1 = await moveActiveUnitTo(5, 4, "aproximação 1");
  const approachMove2 = await moveActiveUnitTo(6, 4, "aproximação 2");
  const approachMove3 = await moveActiveUnitTo(7, 4, "aproximação 3");
  const attackLane = await moveActiveUnitTo(7, 3, "faixa de ataque");
  const attackLaneState = await capture("attack_lane");

  // O inimigo está adjacente. O primeiro golpe reduz HP, mas não o remove;
  // o segundo golpe deve tornar a sentinela invisível no runtime GBA.
  const beforeFirstAttack = await readRuntimeState();
  const firstAttackTurn = assertTactical(beforeFirstAttack, (tactical) => tactical.activeTeam === "player" && !tactical.selected, "preparação do primeiro ataque");
  await selectActiveUnit();
  await moveCursorTo(8, 3, "primeiro alvo");
  const afterFirstAttackInput = await press(buttons.a);
  assertTactical(afterFirstAttackInput, (tactical) => tactical.activeTeam === "enemy"
    && !tactical.selected
    && tactical.turnNumber !== firstAttackTurn.turnNumber, "primeiro ataque");
  const afterFirstAttack = await capture("after_attack_1");
  if (afterFirstAttack?.firstActor?.visible !== true) {
    throw new Error(`O primeiro ataque removeu a sentinela antes do dano esperado: ${JSON.stringify(afterFirstAttack)}.`);
  }
  await endEnemyTurn();
  await moveCursorTo(7, 3, "retorno à unidade ativa");
  await selectActiveUnit();
  await moveCursorTo(8, 3, "segundo alvo");
  await press(buttons.a);
  const afterSecondAttack = await capture("after_attack_2");
  if (afterSecondAttack?.firstActor?.visible !== false) {
    throw new Error(`O segundo ataque não derrotou a sentinela: ${JSON.stringify(afterSecondAttack)}.`);
  }

  return {
    ok: true,
    scene: sceneName,
    route: ["select", "move_step_1", "move_step_1", "move_step_1", "move_step_1", "move_step_1", "move_attack_lane", "attack_1", "attack_2"],
    initial,
    firstMove,
    secondMove,
    approachMove1,
    approachMove2,
    approachMove3,
    attackLane,
    attackLaneState,
    afterFirstAttack,
    afterSecondAttack,
    captures
  };
}

async function runPlatformerInputExercise(cdp, sceneName, faceButtons) {
  if (sceneName !== "penedos_vento") {
    throw new Error(`O exercício de input de plataforma foi solicitado para uma cena não suportada: ${sceneName}.`);
  }

  const readRuntimeState = () => evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null");
  const buttons = {
    right: { code: "ArrowRight", key: "ArrowRight", windowsVirtualKeyCode: 39 },
    left: { code: "ArrowLeft", key: "ArrowLeft", windowsVirtualKeyCode: 37 },
    up: { code: "ArrowUp", key: "ArrowUp", windowsVirtualKeyCode: 38 },
    down: { code: "ArrowDown", key: "ArrowDown", windowsVirtualKeyCode: 40 },
    a: faceButtons.a
  };
  const trace = [];
  const record = (label, state) => {
    const entry = {
      label,
      frame: Number(state?.frame),
      player: state?.player ?? null,
      collision: state?.collision ?? null
    };
    trace.push(entry);
    return state;
  };
  const readAndRecord = async (label) => record(label, await readRuntimeState());

  await wait(500);
  const initial = await readAndRecord("initial");
  if (Number(initial?.runtimeKind) !== runtimeKindByName.platformer || Number(initial?.currentRoom) !== 0) {
    throw new Error(`A cena de plataforma não iniciou no runtime esperado: ${JSON.stringify(initial)}.`);
  }

  const jumpOriginY = Number(initial?.player?.y);
  await pressPlayerButton(cdp, buttons.a.code, buttons.a.key, buttons.a.windowsVirtualKeyCode, 80);
  let jumpApex = await readAndRecord("jump_start");
  let jumpObserved = Number(jumpApex?.player?.y) < jumpOriginY - 1;
  for (let sample = 0; sample < 16 && !jumpObserved; sample += 1) {
    await wait(80);
    jumpApex = await readAndRecord(`jump_sample_${sample + 1}`);
    jumpObserved = Number(jumpApex?.player?.y) < jumpOriginY - 1;
  }
  if (!jumpObserved) {
    throw new Error(`O salto não alterou a altura do jogador: ${JSON.stringify({ origin: initial?.player, observed: jumpApex?.player })}.`);
  }
  let landedAfterJump = jumpApex;
  for (let sample = 0; sample < 24; sample += 1) {
    await wait(80);
    landedAfterJump = await readAndRecord(`jump_settle_${sample + 1}`);
    if (Number(landedAfterJump?.player?.y) >= jumpOriginY - 1) break;
  }

  let current = landedAfterJump;
  const walkOrigin = current;
  for (let step = 0; step < 2; step += 1) {
    const before = current;
    await pressPlayerButton(cdp, buttons.right.code, buttons.right.key, buttons.right.windowsVirtualKeyCode, 320);
    current = await readAndRecord(`walk_right_${step + 1}`);
    if (Number(current?.player?.x) <= Number(before?.player?.x)) {
      throw new Error(`A movimentação horizontal não avançou na plataforma: ${JSON.stringify({ before: before?.player, after: current?.player, collision: current?.collision, trace: trace.slice(-10) })}.`);
    }
  }
  if ((Number(current?.collision?.blockedDirectionBits) & 1) === 0) {
    throw new Error(`A primeira barreira dos Penedos não registrou bloqueio à direita: ${JSON.stringify(current?.collision)}.`);
  }

  const platformJumpOrigin = current;
  await pressPlayerButton(cdp, buttons.a.code, buttons.a.key, buttons.a.windowsVirtualKeyCode, 80);
  await holdPlayerButtons(cdp, [buttons.right, buttons.a], 700);
  const platformJump = await readAndRecord("upper_platform_jump");
  let jumpMovement = platformJump;
  for (let sample = 0; sample < 8; sample += 1) {
    await wait(80);
    jumpMovement = await readAndRecord(`upper_platform_sample_${sample + 1}`);
  }
  if (Number(jumpMovement?.player?.y) >= Number(platformJumpOrigin?.player?.y) - 1) {
    throw new Error(`O salto em direção à plataforma superior não alterou a altura do jogador: ${JSON.stringify({ origin: platformJumpOrigin?.player, observed: jumpMovement?.player, collision: jumpMovement?.collision, trace: trace.slice(-14) })}.`);
  }

  const returnOrigin = jumpMovement;
  await pressPlayerButton(cdp, buttons.left.code, buttons.left.key, buttons.left.windowsVirtualKeyCode, 640);
  const returnLeft = await readAndRecord("return_left");
  if (Number(returnLeft?.player?.x) >= Number(returnOrigin?.player?.x)) {
    throw new Error(`O retorno para a esquerda não moveu o jogador: ${JSON.stringify({ origin: returnOrigin?.player, observed: returnLeft?.player, collision: returnLeft?.collision })}.`);
  }

  return {
    ok: true,
    scene: sceneName,
    route: ["jump", "walk_right", "upper_platform_jump", "return_left"],
    initial,
    jump: { originY: jumpOriginY, apex: jumpApex?.player, landed: landedAfterJump?.player },
    walkRight: { origin: walkOrigin?.player, final: current?.player },
    upperPlatformJump: { origin: platformJumpOrigin?.player, final: jumpMovement?.player },
    returnLeft: { origin: returnOrigin?.player, final: returnLeft?.player },
    trace
  };
}

async function runBattleInputExercise(cdp, sceneName, faceButtons) {
  if (sceneName !== "guardiao_rele") {
    throw new Error(`O exercício de input de batalha foi solicitado para uma cena não suportada: ${sceneName}.`);
  }

  const transitions = [];
  const pressA = () => pressPlayerButton(cdp, faceButtons.a.code, faceButtons.a.key, faceButtons.a.windowsVirtualKeyCode);
  const pressB = () => pressPlayerButton(cdp, faceButtons.b.code, faceButtons.b.key, faceButtons.b.windowsVirtualKeyCode);
  const capture = async (step) => {
    const state = await captureBattleMenuRegion(cdp, sceneName, step);
    transitions.push({ step, ...state });
    return state;
  };
  const waitForRoot = async (step, timeoutMs = 8_000) => {
    const deadline = Date.now() + timeoutMs;
    let state;
    do {
      state = await captureBattleMenuRegion(cdp, sceneName, step);
      if (state.lowerChoiceInk >= 20) {
        transitions.push({ step, ...state });
        return state;
      }
      await wait(200);
    } while (Date.now() < deadline);
    throw new Error(`O comando raiz não retornou após o turno inimigo em ${step}: ${JSON.stringify(state)}.`);
  };
  const assertChanged = (from, to, description) => {
    if (from.signature === to.signature) {
      throw new Error(`Input de batalha não alterou a região do menu em ${description}.`);
    }
  };
  const assertSame = (from, to, description) => {
    if (from.lowerChoiceInk < 20 || to.lowerChoiceInk < 20) {
      throw new Error(`Input de batalha não restaurou a segunda opção do comando em ${description}: ${JSON.stringify({ from, to })}.`);
    }
  };

  await wait(500);
  const root = await capture("root");
  await pressA();
  const moves = await capture("moves");
  assertChanged(root, moves, "ATACAR -> habilidades");
  if (moves.lowerChoiceInk >= 20) {
    throw new Error(`O submenu de ataque ainda exibe a segunda opção do comando: ${JSON.stringify(moves)}.`);
  }

  await pressB();
  const rootAfterBack = await capture("root_after_back");
  assertSame(root, rootAfterBack, "B voltar ao comando raiz");

  await pressA();
  await pressPlayerButton(cdp, "ArrowDown", "ArrowDown", 40);
  await pressA();
  const actionNotice = await capture("action_notice");
  assertChanged(root, actionNotice, "TECNICA -> ação");

  await pressB();
  const rootAfterAction = await waitForRoot("root_after_action");
  assertSame(root, rootAfterAction, "B fechar mensagem de ação");

  await pressPlayerButton(cdp, "ArrowDown", "ArrowDown", 40);
  await pressPlayerButton(cdp, "ArrowDown", "ArrowDown", 40);
  await pressA();
  const itemNotice = await capture("item_notice");
  assertChanged(root, itemNotice, "ITENS -> mensagem");

  await pressB();
  await pressPlayerButton(cdp, "ArrowDown", "ArrowDown", 40);
  await pressA();
  const escapeNotice = await capture("escape_notice");
  assertChanged(root, escapeNotice, "FUGIR -> bloqueio");

  return {
    ok: true,
    route: ["ATACAR", "B", "TECNICA", "ITENS", "FUGIR"],
    transitions
  };
}

async function main() {
  if (requestedSceneName && requestedSceneNames) {
    throw new Error("Use --scene ou --scenes, não os dois.");
  }
  if (exerciseBattleInputRequested && requestedSceneName !== "guardiao_rele") {
    throw new Error("--exercise-battle-input exige --scene=guardiao_rele.");
  }
  if (exerciseShmupInputRequested && requestedSceneName !== "tempestade") {
    throw new Error("--exercise-shmup-input exige --scene=tempestade.");
  }
  if (exerciseShmupWavesRequested && requestedSceneName !== "tempestade") {
    throw new Error("--exercise-shmup-waves exige --scene=tempestade.");
  }
  if (exerciseIsometricInputRequested && requestedSceneName !== "mercado_suspenso") {
    throw new Error("--exercise-isometric-input exige --scene=mercado_suspenso.");
  }
  if (exerciseIsometricTacticalRequested && requestedSceneName !== "arena_tatica") {
    throw new Error("--exercise-isometric-tactical exige --scene=arena_tatica.");
  }
  if (exercisePlatformerInputRequested && requestedSceneName !== "penedos_vento") {
    throw new Error("--exercise-platformer-input exige --scene=penedos_vento.");
  }
  if (exercisePointClickInputRequested
    && !["armazem_das_mares", "observatorio_do_farol"].includes(requestedSceneName)) {
    throw new Error("--exercise-point-click-input exige --scene=armazem_das_mares ou --scene=observatorio_do_farol.");
  }
  if (exerciseFeatureModulesRequested && !["porto_lumen", "usina_submersa", "usina_combate", "usina_saida", "tempestade"].includes(requestedSceneName)) {
    throw new Error("--exercise-feature-modules exige Porto, Usina, Combate, Saída ou Tempestade.");
  }
  if (exerciseCutscenePortraitsRequested && !["prologo", "conselho_guardia"].includes(requestedSceneName)) {
    throw new Error("--exercise-cutscene-portraits exige --scene=prologo ou --scene=conselho_guardia.");
  }
  const executable = electronExecutablePath({ appRoot, usePackagedApp });
  if (!existsSync(executable)) throw new Error(`Executavel do Electron nao encontrado: ${executable}`);
  const template = JSON.parse(await readFile(templatePath, "utf8"));
  const controls = template.settings?.controls;
  const faceButtons = {
    a: resolveExemploSmokeFaceButton(controls, "a"),
    b: resolveExemploSmokeFaceButton(controls, "b")
  };
  configuredFaceButtonMasksByCode = Object.fromEntries(
    ["a", "b"].flatMap((action) => String(controls?.[action === "a" ? "aButton" : "bButton"] ?? "")
      .split(",")
      .map((token) => token.trim())
      .filter((token) => /^[a-z]$/i.test(token))
      .map((token) => [`Key${token.toUpperCase()}`, faceButtons[action].mask]))
  );
  const menuBackKey = faceButtons.b;
  const plan = requestedSceneNames
    ? [...new Set(requestedSceneNames)].flatMap((name) => selectExemploScenePlaytestPlan(template, name))
    : selectExemploScenePlaytestPlan(template, requestedSceneName);
  const expectedSceneNames = [...new Set(plan.map((scene) => scene.name))];
  const expectedSceneLabels = expectedSceneNames.map(displaySceneName);
  const interfaceSceneNames = new Set(exemploInterfaceScenePlaytestPlan(template).map((scene) => scene.name));
  const isolatedInterfaceScene = requestedSceneName !== null && interfaceSceneNames.has(requestedSceneName);
  const tempRoot = await mkdtemp(join(tmpdir(), "gba-studio-exemplo-scenes-"));
  const projectPath = defaultWelcomeSavedProjectPath(tempRoot);
  const engineExportRoot = join(tempRoot, "EngineExport");
  const childEnv = createElectronSmokeEnv({
    GBA_STUDIO_SMOKE_CDP_PORT: String(port),
    GBA_STUDIO_SMOKE_ENGINE_EXPORT_ROOT: engineExportRoot,
    GBA_STUDIO_SMOKE_PROJECT_SAVE_PATH: projectPath,
    GBA_STUDIO_SMOKE_USER_DATA_DIR: join(tempRoot, "UserData")
  });
  if (useExplicitProject) childEnv.GBA_STUDIO_OPEN_PROJECT = templatePath;
  else delete childEnv.GBA_STUDIO_OPEN_PROJECT;
  const child = spawn(executable, usePackagedApp ? [] : [appRoot], {
    cwd: appRoot,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  let mainCdp;

  try {
    const targets = await waitForTargets();
    const mainTarget = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl) ?? targets[0];
    mainCdp = cdpSession(mainTarget.webSocketDebuggerUrl);
    await mainCdp.ready;
    traceSceneSmoke("main-ready");
    if (!useExplicitProject) {
      await waitForText(mainCdp, (text) => text.includes("Exemplo GBA Completo"), "Welcome com template Exemplo");
      await clickButtonByText(mainCdp, "Exemplo GBA Completo");
    }
    await waitForText(
      mainCdp,
      (text) => editorProjectReadyForScenePlaytest(text, expectedSceneLabels),
      "cenas selecionadas no editor",
      45_000
    );
    await evaluate(mainCdp, `
      (() => {
        window.__gbaStudioScenePlaytestTelemetry = [];
        window.__gbaStudioScenePlaytestStop?.();
        window.__gbaStudioScenePlaytestStop = window.gbaStudio.onRomPlayerTelemetry((event) => {
          window.__gbaStudioScenePlaytestTelemetry.push(event);
        });
        return true;
      })()
    `);

    const results = [];
    const knownWindowIDs = new Set();
    await mkdir(evidenceRoot, { recursive: true });
    for (const [planIndex, scene] of plan.entries()) {
      console.log(`[${planIndex + 1}/${plan.length}] Compilando e testando ${scene.name} (${scene.runtime})...`);
      await waitForRunSceneEnabled(mainCdp, scene.name);
      traceSceneSmoke(scene.name, "run-enabled");
      const beforeIDs = new Set((await fetchTargets()).map((target) => target.id));
      await clickRunScene(mainCdp, scene.name);
      traceSceneSmoke(scene.name, "run-clicked");
      const playerTarget = await waitForPlayerTarget(mainCdp, beforeIDs, `Play Window de ${scene.name}`, scene.name);
      const playerCdp = cdpSession(playerTarget.webSocketDebuggerUrl);
      await playerCdp.ready;
      traceSceneSmoke(scene.name, "player-ready");
      await waitForPlayerInputReady(playerCdp);
      await playerCdp.send("Page.bringToFront");
      await playerCdp.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: 360,
        y: 240,
        button: "left",
        clickCount: 1
      });
      await playerCdp.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: 360,
        y: 240,
        button: "left",
        clickCount: 1
      });
      const exactPlayerFramebuffer = EXEMPLO_EXACT_PLAYER_FRAMEBUFFER_SCENES.includes(scene.name);
      const affineShowcaseScene = scene.name === "affine_lab";
      const exactBackgroundFramebuffer = EXEMPLO_EXACT_BACKGROUND_FRAMEBUFFER_SCENES.includes(scene.name)
        || affineShowcaseScene;
      const playerEvidence = await waitForPlayerEvidence(
        playerCdp,
        exactPlayerFramebuffer || exactBackgroundFramebuffer || authoredActorFramebufferScenes.has(scene.name)
      );
      if (!playerEvidence?.ok) throw new Error(`${scene.name} nao produziu frame/audio/runtime: ${JSON.stringify(playerEvidence)}.`);
      traceSceneSmoke(scene.name, "evidence-ready");
      const exported = await latestExportContract(engineExportRoot);
      const launchContract = exemploRuntimeLaunchContract(exported.project);
      const expectedRuntimeName = runtimeNameByContractKind[launchContract.runtime] ?? launchContract.runtime;
      const observedRuntimeState = playerEvidence.runtimeState ?? {};
      const observedRuntimeName = String(observedRuntimeState.activeRuntime ?? observedRuntimeState.runtime ?? "");
      const runtimeMatches = Number(observedRuntimeState.runtimeKind) === runtimeKindByName[expectedRuntimeName]
        || observedRuntimeName === expectedRuntimeName;
      const selectedSceneStarted = launchContract.startScene === scene.name
        && runtimeMatches
        && Number(observedRuntimeState.currentRoom) === Number(launchContract.currentRoom);
      if (!selectedSceneStarted) {
        throw new Error(`Play isolado iniciou um runtime/cena diferente de ${scene.name}: ${JSON.stringify({
          expected: launchContract,
          observed: {
            activeRuntime: observedRuntimeName,
            currentRoom: observedRuntimeState.currentRoom,
            runtimeKind: observedRuntimeState.runtimeKind
          }
        })}`);
      }
      let isometricCadence = null;
      if (scene.name === "mercado_suspenso") {
        const roms = activeBuildRomPaths(await filesNamed(dirname(exported.path), "exemplo.gba"));
        if (roms.length !== 1) throw new Error(`ROM canônica ambígua para medir cadência: ${JSON.stringify(roms)}`);
        const { stdout } = await execFileAsync(process.execPath, [
          join(appRoot, "scripts", "smoke-isometric-adventure-cadence.mjs"), roms[0]
        ], { timeout: 30_000, maxBuffer: 1024 * 1024 });
        isometricCadence = JSON.parse(stdout.trim());
      }
      const exportedStartMenuScreenIndex = Number.isInteger(exported.project?.menu_project?.start_menu_screen)
        ? Number(exported.project.menu_project.start_menu_screen)
        : -1;
      const room = templateRoomForScene(template, scene.name);
      const actorRegions = temporalActorRegionsForScene({
        exportedProject: exported.project,
        project: template,
        room,
        runtime: scene.runtime,
        runtimeState: playerEvidence.runtimeState
      });
      const visualStabilitySamples = await samplePlayerVisualStability(playerCdp, 36, actorRegions);
      if (!visualStabilitySamples?.ok) {
        throw new Error(`${scene.name} nao produziu amostras temporais do framebuffer: ${JSON.stringify(visualStabilitySamples)}.`);
      }
      const temporalVisualFidelity = auditTemporalVisualStability(visualStabilitySamples.samples, {
        enforceSignatureContinuity: scene.runtime === "isometric"
      });
      if (!temporalVisualFidelity.ok) {
        throw new Error(`${scene.name} apresentou instabilidade visual temporal: ${JSON.stringify(temporalVisualFidelity)}.`);
      }
      const screenshotPath = await capturePlayerScreenshot(playerCdp, scene.name);
      const battleInput = exerciseBattleInputRequested
        ? await runBattleInputExercise(playerCdp, scene.name, faceButtons)
        : null;
      const shmupInput = exerciseShmupInputRequested
        ? await runShmupInputExercise(playerCdp, scene.name, faceButtons)
        : null;
      const shmupWaves = exerciseShmupWavesRequested
        ? await runShmupWavesExercise(playerCdp, scene.name, faceButtons)
        : null;
      const isometricInputEntry = scene.name === "mercado_suspenso"
        ? template.actors?.find((actor) => actor?.id === "market-nara" && actor?.roomName === scene.name)
        : null;
      const isometricInput = exerciseIsometricInputRequested
        ? await runIsometricInputExercise(playerCdp, scene.name, isometricInputEntry, template)
        : null;
      const isometricTacticalInput = exerciseIsometricTacticalRequested
        ? await runIsometricTacticalInputExercise(playerCdp, scene.name)
        : null;
      const platformerInput = exercisePlatformerInputRequested
        ? await runPlatformerInputExercise(playerCdp, scene.name, faceButtons)
        : null;
      const pointClickInput = exercisePointClickInputRequested
        ? await runPointClickInputExercise(playerCdp, scene.name, exported.project, faceButtons)
        : null;
      const featureModulesInput = exerciseFeatureModulesRequested
        ? await runFeatureModulesInputExercise(playerCdp, scene.name, exportedStartMenuScreenIndex, exported.project?.menu_project ?? null)
        : null;
      const cutscenePortraits = exerciseCutscenePortraitsRequested
        ? await runCutscenePortraitsExercise(playerCdp, scene.name)
        : null;
      let startMenuScreenshotPath = null;
      let startMenuVisible = null;
      if (sceneBasedStartMenuRuntimes.has(scene.runtime) && Boolean(room?.campaign) && platformerInput === null) {
        const isDungeonCrawler = scene.runtime === "dungeonCrawler"
          || Number(isometricInput?.exitResult?.runtimeKind) === runtimeKindByName.dungeonCrawler;
        const hasDungeonMapOverlay = isDungeonCrawler
          && Array.isArray(room?.runtime?.config?.modules)
          && room.runtime.config.modules.some((module) => module?.id === "map" && module?.enabled !== false);
        const originRoom = Number.isInteger(Number(playerEvidence.runtimeState?.currentRoom))
          ? Number(playerEvidence.runtimeState.currentRoom)
          : 0;
        let dungeonExplorationScreenshotPath = null;
        if (isDungeonCrawler) {
          // The canonical dungeon room opens with one on-enter dialogue. Close
          // that presentation first so Start is tested from the exploration
          // state, matching the other gameplay adapters.
          // B is deliberately used here: it reveals the current page, moves
          // through any wrapped pages, and closes the dialogue without
          // re-triggering the adjacent actor after the event ends.
          for (let dismissal = 0; dismissal < 8; dismissal += 1) {
            await pressPlayerButton(playerCdp, menuBackKey.code, menuBackKey.key, menuBackKey.windowsVirtualKeyCode, 80);
          }
          await wait(320);
          dungeonExplorationScreenshotPath = await capturePlayerScreenshot(
            playerCdp,
            `${scene.name}_exploration_before_map`
          );
        }
        await pressPlayerButton(playerCdp, "Enter", "Enter", 13, 160);
        const startMenuTransition = !hasDungeonMapOverlay && exportedStartMenuScreenIndex >= 0
          ? await waitForRuntimeScene(playerCdp, "menu", exportedStartMenuScreenIndex, 2, 8_000)
          : null;
        if (!hasDungeonMapOverlay && exportedStartMenuScreenIndex >= 0 && !startMenuTransition?.ok) {
          throw new Error(`${scene.name} não abriu a cena Menu Start autorada: ${JSON.stringify(startMenuTransition?.runtimeState)}.`);
        }
        startMenuScreenshotPath = await capturePlayerScreenshot(playerCdp, `${scene.name}_start_menu`);
        const [initialScreenshot, startMenuScreenshot] = await Promise.all([
          readFile(dungeonExplorationScreenshotPath ?? screenshotPath),
          readFile(startMenuScreenshotPath)
        ]);
        startMenuVisible = !initialScreenshot.equals(startMenuScreenshot);
        if (!startMenuVisible) {
          throw new Error(`${scene.name} nao apresentou mudanca visual ao abrir a superfície de Start.`);
        }
        if (hasDungeonMapOverlay) {
          await pressPlayerButton(playerCdp, menuBackKey.code, menuBackKey.key, menuBackKey.windowsVirtualKeyCode, 80);
          const resumedExplorationScreenshotPath = await capturePlayerScreenshot(
            playerCdp,
            `${scene.name}_exploration_after_map`
          );
          const [mapScreenshot, resumedExplorationScreenshot] = await Promise.all([
            readFile(startMenuScreenshotPath),
            readFile(resumedExplorationScreenshotPath)
          ]);
          if (mapScreenshot.equals(resumedExplorationScreenshot)) {
            throw new Error(`${scene.name} nao fechou o mapa da Usina com B.`);
          }
          traceSceneSmoke(scene.name, "start-surface-ready");
        } else {
          await playerCdp.send("Input.dispatchKeyEvent", {
            type: "keyDown",
            ...menuBackKey
          });
          await wait(160);
          await playerCdp.send("Input.dispatchKeyEvent", {
            type: "keyUp",
            ...menuBackKey
          });
          await wait(480);
          const resumedRuntime = isDungeonCrawler ? "dungeonCrawler" : scene.runtime;
          const resumedTransition = await waitForRuntimeScene(playerCdp, resumedRuntime, originRoom, 2, 8_000);
          if (!resumedTransition?.ok) {
            throw new Error(`${scene.name} não retornou à cena de origem após fechar o Menu Start: ${JSON.stringify(resumedTransition?.runtimeState)}.`);
          }
          traceSceneSmoke(scene.name, "start-menu-ready");
        }
      }
      if (dumpFramebuffer && typeof playerEvidence.framebufferRgbaBase64 === "string") {
        await mkdir(framebufferDumpRoot, { recursive: true });
        await writeFile(
          join(framebufferDumpRoot, `${scene.name}.rgba.bin`),
          Buffer.from(playerEvidence.framebufferRgbaBase64, "base64"),
          { encoding: "binary" }
        );
        if (playerEvidence.nativeStateBytes) await writeFile(join(framebufferDumpRoot,`${scene.name}.state.bin`),playerEvidence.nativeStateBytes);
      }
      const affineFidelity = affineShowcaseScene
        ? await auditExportedAffineScene(
          exported.path,
          exported.project,
          template,
          room,
          playerEvidence.frame,
          {
            framebufferRgbaBase64: playerEvidence.framebufferRgbaBase64
          }
        )
        : null;
      const exactBackgroundCamera = scene.runtime === "racing"
        ? racingCameraPosition(room, playerEvidence.runtimeState)
        : { x: 0, y: 0 };
      const minimumPixelRatio = EXEMPLO_RGB555_SCENE_THRESHOLDS[scene.name];
      const colorFidelity = minimumPixelRatio === undefined
        ? { audited: false, ok: true }
        : await auditExportedScenePalette(exported.path, room, playerEvidence.frame, minimumPixelRatio);
      const lutaPlayerFidelity = scene.runtime === "luta"
        ? await auditExportedLutaPlayers(
          exported.path,
          exported.project,
          playerEvidence.frame,
          EXEMPLO_PLAYER_FRAMEBUFFER_SCENES.includes(scene.name),
          exactPlayerFramebuffer
            ? {
              framebufferRgbaBase64: playerEvidence.framebufferRgbaBase64,
              project: template,
              runtimeState: playerEvidence.runtimeState
            }
            : { project: template }
        )
        : null;
      const baseBackgroundFidelity = affineFidelity?.backgroundFidelity
        ?? await auditExportedSceneBackground(
          exported.path,
          template,
          room,
          playerEvidence.frame,
          EXEMPLO_EXACT_BACKGROUND_FRAMEBUFFER_SCENES.includes(scene.name)
            ? {
              actors: template.actors,
              animations: template.animations,
              exportedProject: exported.project,
              framebufferRgbaBase64: playerEvidence.framebufferRgbaBase64,
              runtime: scene.runtime,
              presentedRuntimeState: playerEvidence.presentedRuntimeState,
              runtimeState: playerEvidence.runtimeState,
              sourceX: exactBackgroundCamera.x,
              sourceY: exactBackgroundCamera.y,
              lutaFighters: lutaPlayerFidelity?.fighters
            }
            : null
        );
      const titleOverlayFidelity = typeof room?.runtime?.config?.titleOverlayAssetName === "string"
        && room.runtime.config.titleOverlayAssetName.trim().length > 0
        ? await auditExportedTitleOverlay(
          exported.path,
          template,
          room,
          {
            exportedProject: exported.project,
            framebufferRgbaBase64: playerEvidence.framebufferRgbaBase64,
            runtimeState: playerEvidence.runtimeState
          }
        )
        : undefined;
      const backgroundFidelity = backgroundFidelityWithTitleOverlay(
        baseBackgroundFidelity,
        titleOverlayFidelity
      );
      const exportedPaletteFidelity = await auditExportedFramebufferPalettes(
          exported.path,
          exported.project,
          playerEvidence.frame,
          scene.runtime
        );
      const paletteFidelity = affineFidelity?.paletteFidelity
        ?? (titleOverlayFidelity
          ? {
            alphaBlend: true,
            allowedAlpha: titleOverlayFidelity.allowedAlpha,
            audited: true,
            compositePixels: titleOverlayFidelity.compositePixels,
            ok: titleOverlayFidelity.ok
          }
          : exportedPaletteFidelity);
      const playerFidelity = EXEMPLO_EXPLICIT_ACTOR_BINDING_SCENES.includes(scene.name)
        ? { audited: false, notApplicable: true, ok: true, runtime: scene.runtime, reason: "scene-declares-explicit-actors" }
        : EXEMPLO_PLAYERLESS_SCENES.includes(scene.name)
        ? { audited: false, notApplicable: true, ok: true, runtime: scene.runtime, reason: "scene-declares-no-player" }
        : ["menu", "cutscene"].includes(scene.runtime)
        ? { audited: false, notApplicable: true, ok: true, runtime: scene.runtime }
        : scene.runtime === "luta"
        ? lutaPlayerFidelity
        : scene.runtime === "topdown"
        ? await auditExportedTopdownPlayerChain(
          exported.path,
          exported.project,
          playerEvidence.frame,
          EXEMPLO_PLAYER_FRAMEBUFFER_SCENES.includes(scene.name),
          exactPlayerFramebuffer
            ? {
              framebufferRgbaBase64: playerEvidence.framebufferRgbaBase64,
              project: template,
              runtimeState: playerEvidence.runtimeState
            }
            : null
        )
        : await auditExportedRuntimePlayer(
          exported.path,
          exported.project,
          scene.runtime,
          playerEvidence.frame,
          EXEMPLO_PLAYER_FRAMEBUFFER_SCENES.includes(scene.name),
          exactPlayerFramebuffer
            ? {
              framebufferRgbaBase64: playerEvidence.framebufferRgbaBase64,
              presentedRuntimeState: playerEvidence.presentedRuntimeState,
              runtimeState: playerEvidence.runtimeState
            }
            : null
        );
      const actorFidelity = await auditExportedAuthoredActors(
        exported.path,
        exported.project,
        template,
        room,
        playerEvidence.frame,
        typeof playerEvidence.framebufferRgbaBase64 === "string"
          ? {
            framebufferRgbaBase64: playerEvidence.framebufferRgbaBase64,
            exportedProject: exported.project,
            presentedRuntimeState: playerEvidence.presentedRuntimeState,
            runtime: scene.runtime,
            runtimeState: playerEvidence.runtimeState
          }
          : null
      );
      let transitionFidelity;
      let nameInputScreenshotPath = null;
      if (scene.name === EXEMPLO_RGB555_TRANSITION.from) {
        const pressButton = (code, key, windowsVirtualKeyCode) =>
          pressPlayerButton(playerCdp, code, key, windowsVirtualKeyCode);
        const pressStart = () => pressButton("Enter", "Enter", 13);
        const pressA = () => pressButton(faceButtons.a.code, faceButtons.a.key, faceButtons.a.windowsVirtualKeyCode);
        const pressDown = () => pressButton("ArrowDown", "ArrowDown", 40);
        const pressUp = () => pressButton("ArrowUp", "ArrowUp", 38);
        const pressLeft = () => pressButton("ArrowLeft", "ArrowLeft", 37);
        const pressRight = () => pressButton("ArrowRight", "ArrowRight", 39);
        const pressBack = () => pressButton(faceButtons.b.code, faceButtons.b.key, faceButtons.b.windowsVirtualKeyCode);
        const menuScreens = exported.project.menu_project?.screens ?? [];
        const characterGenderVariableIndex = template.variables?.findIndex((variable) =>
          variable?.name === "var_character_gender"
        ) ?? -1;
        if (characterGenderVariableIndex < 0) {
          throw new Error("O projeto exemplo nao expoe a variavel persistente de gênero.");
        }
        const titleOptionsRoom = menuScreens.findIndex((screen) => screen.name === "title_options");
        await pressStart();
        const titleOptionsEvidence = titleOptionsRoom >= 0
          ? await waitForRuntimeScene(playerCdp, "menu", titleOptionsRoom, 0)
          : { ok: false, frame: null, runtimeState: null };
        if (!titleOptionsEvidence.ok) {
          throw new Error(`Title Screen nao abriu o carrossel: ${JSON.stringify(titleOptionsEvidence.runtimeState)}.`);
        }
        await wait(700);
        const titleOptionsScreenshotPath = await capturePlayerScreenshot(playerCdp, `${scene.name}_options_new_game`);
        const optionVisualHashes = [await playerFramebufferSignature(playerCdp)];
        const carouselRightInput = await pressRight();
        await wait(300);
        const titleOptionsNextScreenshotPath = await capturePlayerScreenshot(playerCdp, `${scene.name}_options_load_game`);
        optionVisualHashes.push(await playerFramebufferSignature(playerCdp));
        if (optionVisualHashes[0] === optionVisualHashes[1]) {
          throw new Error("O carrossel manteve a mesma imagem após Right; verifique o Engine Pack usado no Play.");
        }
        await pressA();
        const loadWithoutSaveState = await evaluate(playerCdp, "window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null");
        if (loadWithoutSaveState?.currentRoom !== titleOptionsRoom) {
          throw new Error(`Carregar jogo abriu sem um save válido: ${JSON.stringify(loadWithoutSaveState)}.`);
        }
        const settingsRoom = menuScreens.findIndex((screen) => screen.name === "configuracoes");
        const creditsRoom = menuScreens.findIndex((screen) => screen.name === "creditos");
        if (settingsRoom < 0 || creditsRoom < 0) {
          throw new Error("O carrossel não exportou as telas Configurações e Créditos.");
        }
        const carouselScreenshots = [titleOptionsScreenshotPath, titleOptionsNextScreenshotPath];
        for (const [optionName, targetRoom] of [
          ["language", settingsRoom],
          ["settings", settingsRoom],
          ["credits", creditsRoom]
        ]) {
          await pressRight();
          await wait(180);
          const screenshot = await capturePlayerScreenshot(playerCdp, `${scene.name}_options_${optionName}`);
          carouselScreenshots.push(screenshot);
          optionVisualHashes.push(await playerFramebufferSignature(playerCdp));
          await pressA();
          const targetEvidence = await waitForRuntimeScene(playerCdp, "menu", targetRoom, 0);
          if (!targetEvidence.ok) {
            throw new Error(`A opção ${optionName} não abriu a tela ${targetRoom}: ${JSON.stringify(targetEvidence.runtimeState)}.`);
          }
          await pressBack();
          const returnEvidence = await waitForRuntimeScene(playerCdp, "menu", titleOptionsRoom, 0);
          if (!returnEvidence.ok) {
            throw new Error(`A opção ${optionName} não retornou ao carrossel: ${JSON.stringify(returnEvidence.runtimeState)}.`);
          }
        }
        if (new Set(optionVisualHashes).size !== optionVisualHashes.length) {
          throw new Error(`O carrossel repetiu uma imagem de opção: ${JSON.stringify(optionVisualHashes)}.`);
        }
        await pressRight();
        await wait(180);
        const carouselWrapScreenshotPath = await capturePlayerScreenshot(playerCdp, `${scene.name}_options_wrapped_new_game`);
        const carouselWrapHash = await playerFramebufferSignature(playerCdp);
        if (carouselWrapHash !== optionVisualHashes[0]) {
          throw new Error("O carrossel não voltou à imagem de Novo Jogo após a última opção.");
        }
        traceSceneSmoke(scene.name, "title-options-ready");
        const genderRoom = menuScreens.findIndex((screen) =>
          screen.name === "escolha_genero"
          || screen.title === "Escolha de gênero"
        );
        const genderEvidence = genderRoom >= 0
          ? (await pressA(), await waitForRuntimeScene(playerCdp, "menu", genderRoom, 0))
          : { ok: false, frame: null, runtimeState: null };
        if (!genderEvidence.ok) {
          throw new Error(`Carrossel do título nao abriu a Escolha de gênero: ${JSON.stringify(genderEvidence.runtimeState)}.`);
        }
        traceSceneSmoke(scene.name, "gender-select-ready");
        // One horizontal move selects female; A stores it and opens name.
        await pressRight();
        await pressA();
        const genderTelemetryCount = genderEvidence.runtimeState?.variables?.length ?? 0;
        const selectedGender = characterGenderVariableIndex < genderTelemetryCount
          ? await waitForRuntimeVariable(
            playerCdp,
            characterGenderVariableIndex,
            1,
            "seleção feminina persistida na variável de gênero"
          )
          : {
            audited: false,
            reason: `A variável ${characterGenderVariableIndex} está fora das ${genderTelemetryCount} variáveis expostas pela telemetria do Play.`
          };
        if (selectedGender.audited !== false && !selectedGender.ok) {
          throw new Error(`A seleção feminina nao persistiu a variável de gênero: ${JSON.stringify(selectedGender)}.`);
        }
        const genderScreen = menuScreens[genderRoom];
        if (genderScreen.items.length !== 2 || genderScreen.actors.filter(actor => actor.role === "cursor").length !== 1) {
          throw new Error("Escolha de gênero exige duas opções e uma única moldura cursor.");
        }
        const nameRoom = menuScreens.findIndex((screen) => screen.name === "nome_jogador");
        const genderToName = template.editorState?.scenaConnections?.find(connection =>
          connection.from === "escolha_genero" && connection.to === "nome_jogador"
        );
        const nameRevealFrames = genderToName?.transition?.fadeIn === false ? 0
          : Number(genderToName?.transition?.durationFrames ?? template.settings?.transitions?.durationFrames ?? 0);
        const nameEvidence = nameRoom >= 0
          ? await waitForRuntimeScene(playerCdp, "menu", nameRoom, nameRevealFrames + 6)
          : { ok: false, frame: null, runtimeState: null };
        if (!nameEvidence.ok) {
          throw new Error(`Escolha de gênero nao abriu a entrada do nome: ${JSON.stringify(nameEvidence.runtimeState)}.`);
        }
        traceSceneSmoke(scene.name, "player-name-ready");
        const nameScreen = menuScreens[nameRoom];
        const nameConfirmItemIndex = nameScreen?.items?.findIndex((item) =>
          String(item?.label ?? "").trim().toLowerCase() === "confirmar"
        ) ?? -1;
        if (nameConfirmItemIndex < 0) {
          throw new Error("Nome do jogador nao expoe o item Confirmar no contrato exportado.");
        }
        // Auto-opened 4x8 keyboard: type NARA, then choose OK below.
        await pressDown();
        for (let i = 0; i < 5; i++) await pressRight();
        await pressA(); // N
        await pressUp();
        for (let i = 0; i < 5; i++) await pressLeft();
        await pressA(); // A
        await pressDown(); await pressDown(); await pressRight();
        await pressA(); // R
        await pressUp(); await pressUp(); await pressLeft();
        await pressA(); // A
        for (let i = 0; i < 4; i++) await pressDown();
        await pressRight(); await pressRight(); // OK
        nameInputScreenshotPath = await capturePlayerScreenshot(playerCdp, `${scene.name}_name_input_nara`);
        const nameInputState = await evaluate(playerCdp, "window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null");
        if (nameInputState?.runtimeKind !== runtimeKindByName.menu || nameInputState?.currentRoom !== nameRoom) {
          throw new Error(`A digitação do nome saiu prematuramente da tela de entrada: ${JSON.stringify(nameInputState)}.`);
        }
        await pressA();
        const cutsceneScenes = exported.project.cutscene_project?.scenes ?? [];
        const targetRoom = cutsceneScenes.findIndex((candidate) => candidate.name === EXEMPLO_RGB555_TRANSITION.to);
        const nameToPrologue = template.editorState?.scenaConnections?.find(connection =>
          connection.from === "nome_jogador" && connection.to === EXEMPLO_RGB555_TRANSITION.to
        );
        const revealFrames = nameToPrologue?.transition?.fadeIn === false ? 0
          : Number(nameToPrologue?.transition?.durationFrames ?? template.settings?.transitions?.durationFrames ?? 0);
        // Palette/background fidelity belongs to the settled frame, after the
        // configured reveal; transient fade pixels deliberately differ.
        const transitionSettleFrames = Math.max(EXEMPLO_RGB555_TRANSITION.settleFrames, revealFrames + 6);
        const transitionEvidence = targetRoom >= 0
          ? await waitForRuntimeScene(playerCdp, "cutscene", targetRoom, transitionSettleFrames)
          : { ok: false, frame: null, runtimeState: null };
        if (!transitionEvidence.ok) {
          throw new Error(`Título nao iniciou o Prologo: ${JSON.stringify(transitionEvidence.runtimeState)}.`);
        }
        traceSceneSmoke(scene.name, "prologue-ready");
        const saveData = await evaluate(playerCdp, "window.GBAStudioDirectPlayer?.inspectSaveData?.() ?? null");
        if (saveData?.slot?.status !== "ok" || saveData?.hasUniversalSlotRecord !== true) {
          throw new Error(`A confirmação do nome nao produziu um save válido: ${JSON.stringify(saveData)}.`);
        }
        const targetTemplateRoom = template.rooms
          .find((candidate) => candidate.name === EXEMPLO_RGB555_TRANSITION.to) ?? null;
        const targetPalette = transitionEvidence.ok
          ? await auditExportedScenePalette(
            exported.path,
            targetTemplateRoom,
            transitionEvidence.frame,
            1 / Math.max(1, Number(transitionEvidence.frame?.pixelCount) || 1)
          )
          : { audited: false, ok: false };
        const targetBaseBackground = transitionEvidence.ok
          ? await auditExportedSceneBackground(
            exported.path,
            template,
            targetTemplateRoom,
            transitionEvidence.frame,
            {
              actors: template.actors,
              animations: template.animations,
              exportedProject: exported.project,
              framebufferRgbaBase64: transitionEvidence.framebufferRgbaBase64,
              runtime: "cutscene",
              runtimeState: transitionEvidence.runtimeState,
              sourceX: 0,
              sourceY: 0
            }
          )
          : { audited: false, ok: false };
        const targetTitleOverlay = transitionEvidence.ok
          && typeof targetTemplateRoom?.runtime?.config?.titleOverlayAssetName === "string"
          && targetTemplateRoom.runtime.config.titleOverlayAssetName.trim().length > 0
          ? await auditExportedTitleOverlay(
            exported.path,
            template,
            targetTemplateRoom,
            {
              exportedProject: exported.project,
              framebufferRgbaBase64: transitionEvidence.framebufferRgbaBase64,
              runtimeState: transitionEvidence.runtimeState
            }
          )
          : undefined;
        const targetBackground = backgroundFidelityWithTitleOverlay(
          targetBaseBackground,
          targetTitleOverlay
        );
        transitionFidelity = {
          audited: true,
          initialRoom: scene.runtime === "cutscene"
            ? exported.project.cutscene_project?.initial_scene ?? null
            : scene.runtime === "menu"
              ? titleOptionsRoom
              : playerEvidence.runtimeState?.currentRoom ?? null,
          ok: transitionEvidence.ok === true
            && targetBackground.ok === true
            && targetPalette.ok === true,
          runtimeState: transitionEvidence.runtimeState,
          targetBackground,
          targetPalette,
          targetRoom,
          targetScene: EXEMPLO_RGB555_TRANSITION.to,
          targetTitleOverlay,
          titleToOptions: titleOptionsEvidence,
          titleOptionsScreenshotPath,
          titleOptionsNextScreenshotPath,
          carouselScreenshots,
          optionVisualHashes,
          optionVisualHashSource: "gba-framebuffer-rgba-240x160",
          carouselWrapHash,
          carouselWrapScreenshotPath,
          carouselRightInput,
          loadWithoutSaveState,
          optionsToGender: genderEvidence,
          selectedGender,
          genderToName: nameEvidence,
          nameInput: nameInputScreenshotPath,
          saveData,
          transitionSettleFrames,
          optionsToPrologue: transitionEvidence
        };
      }
      const performance = await waitForPerformance(mainCdp, knownWindowIDs);
      traceSceneSmoke(scene.name, "performance-ready");
      knownWindowIDs.add(performance.windowID);
      const romBytes = Number(performance.samples.at(-1)?.romBytes ?? 0);
      results.push({
        ...scene,
        buildRestarts: playerTarget.buildRestarts,
        audio: playerEvidence.audio,
        actorFidelity,
        backgroundFidelity,
        affineFidelity,
        battleInput,
        featureModulesInput,
        isometricInput,
        isometricCadence,
        isometricTacticalInput,
        platformerInput,
        pointClickInput,
        colorFidelity,
        cutscenePortraits,
        displayFidelity: auditIntegerFramebufferDisplay(playerEvidence.display),
        paletteFidelity,
        playerFidelity,
        titleOverlayFidelity,
        exportContractPath: exported.path,
        frame: playerEvidence.frame,
        launchContract: {
          ...exemploLaunchContract(exported.project),
          currentRoom: launchContract.currentRoom,
          runtime: launchContract.runtime
        },
        performance,
        playerUrl: playerTarget.url,
        presentedRuntimeState: playerEvidence.presentedRuntimeState,
        romBytes,
        runtimeState: playerEvidence.runtimeState,
        screenshotPath,
        nameInputScreenshotPath,
        shmupInput,
        shmupWaves,
        startMenuScreenshotPath,
        startMenuVisible,
        temporalVisualFidelity,
        transitionFidelity
      });
      playerCdp.close();
      traceSceneSmoke(scene.name, "page-session-closed");
      await closeTargetFromBrowser(playerTarget.id);
      traceSceneSmoke(scene.name, "target-close-requested");
      await waitForTargetClosed(playerTarget.id);
      traceSceneSmoke(scene.name, "target-closed");
      console.log(`[${planIndex + 1}/${plan.length}] OK ${scene.name}: ${performance.presentationFps} FPS apresentados, ${performance.emulationFps} FPS emulados.`);
    }

    const audit = isolatedInterfaceScene
      ? auditExemploInterfaceScenePlaytest(template, results)
      : auditExemploScenePlaytest(
        requestedSceneName || requestedSceneNames
          ? {
            ...template,
            scenas: plan.map((scene) => ({
              ...template.scenas.find((authored) => authored.name === scene.name),
              campaign: template.scenas.find((authored) => authored.name === scene.name)?.campaign ?? {}
            }))
          }
          : template,
        results
      );
    const contactSheet = requestedSceneName
      ? null
      : {
        columns: 5,
        path: join(dirname(evidencePath), "exemplo-scenes-contact-sheet.png"),
        rows: 4,
        sceneNames: results.map((result) => result.name),
        viewport: { height: 160, width: 240 }
      };
    if (contactSheet) {
      const screenshots = await Promise.all(results.map((result) => readFile(result.screenshotPath)));
      await writeFile(contactSheet.path, renderPngContactSheet(screenshots, {
        columns: contactSheet.columns,
        expectedCount: plan.length,
        targetHeight: contactSheet.viewport.height,
        targetWidth: contactSheet.viewport.width
      }));
    }
    const sessionSoak = soakMinutes > 0 && !requestedSceneName
      ? await runIntegratedSessionSoak({ childPid: child.pid, mainCdp, minutes: soakMinutes, plan })
      : null;
    const evidence = {
      audit,
      contactSheet,
      executionMode: requestedSceneName
        ? "isolated-scene"
        : sessionSoak
          ? "sequential-single-app-session-with-active-soak"
          : "sequential",
      generatedAt: new Date().toISOString(),
      ok: audit.ok && (sessionSoak?.audit.ok ?? true),
      packagedApp: usePackagedApp,
      projectPath,
      source: {
        id: projectSource.id,
        role: projectSource.role,
        sourceKey: projectSource.sourceKey
      },
      requestedSceneName,
      results,
      sessionSoak,
      soakMinutes,
      templatePath
    };
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    if (!evidence.ok) {
      throw new Error(`Playtest das ${plan.length} cenas falhou: ${[...audit.issues, ...(sessionSoak?.audit.issues ?? [])].join("; ")}`);
    }
    console.log(JSON.stringify({ ok: true, evidencePath, counts: audit.counts }, null, 2));
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nstdout:\n${stdout.slice(-8_000)}\nstderr:\n${stderr.slice(-8_000)}`);
  } finally {
    mainCdp?.close();
    await terminateChild(child);
  }
}

await main();
