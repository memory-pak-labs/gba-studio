#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  cdpSession,
  createElectronSmokeEnv,
  electronExecutablePath,
  renderedText,
  terminateChild,
  wait
} from "./lib/electron-smoke-helpers.mjs";
import { resolveCanonicalP0Source } from "./p0-source-catalog.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const execFileAsync = promisify(execFile);
const canonicalP0Source = resolveCanonicalP0Source(appRoot);
const sceneName = process.argv.find((argument) => argument.startsWith("--scene="))?.slice("--scene=".length)
  ?? "mercado_suspenso";
const cycles = Math.max(1, Number(process.argv.find((argument) => argument.startsWith("--cycles="))?.slice("--cycles=".length) ?? 3));
const port = Number(process.env.GBA_STUDIO_SMOKE_CDP_PORT ?? 9434);
const requestedEvidencePath = process.argv.find((argument) => argument.startsWith("--evidence="))?.slice("--evidence=".length);
const evidenceRoot = requestedEvidencePath
  ? dirname(resolve(requestedEvidencePath))
  : join(appRoot, "artifacts", "mgba-transition-review", "latest");
const evidencePath = requestedEvidencePath
  ? resolve(requestedEvidencePath)
  : join(evidenceRoot, "visual_transition_evidence.json");
const usePackagedApp = process.argv.includes("--packaged");
const canonicalMenuRooms = Object.freeze({
  start: 15,
  missions: 10,
  inventory: 11,
  map: 12,
  profile: 13
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function displaySceneName(value) {
  return String(value);
}

async function fetchTargets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) return [];
  const targets = await response.json();
  return Array.isArray(targets) ? targets : [];
}

async function waitForTargets(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastTargets = [];
  while (Date.now() < deadline) {
    try {
      lastTargets = await fetchTargets();
      if (lastTargets.some((target) => target.type === "page" && target.webSocketDebuggerUrl)) return lastTargets;
    } catch {
      // Electron can take a moment to publish DevTools.
    }
    await wait(250);
  }
  throw new Error(`DevTools indisponível na porta ${port}: ${JSON.stringify(lastTargets)}`);
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send("Runtime.evaluate", {
    awaitPromise,
    expression,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Falha no renderer.");
  }
  return result.result?.value;
}

async function waitForText(cdp, predicate, description, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  while (Date.now() < deadline) {
    lastText = await renderedText(cdp);
    if (predicate(lastText)) return;
    await wait(250);
  }
  throw new Error(`Estado não alcançado: ${description}.\n${lastText.slice(0, 4_000)}`);
}

async function waitForPlayerTarget(beforeIDs, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  let lastTargets = [];
  while (Date.now() < deadline) {
    lastTargets = await fetchTargets();
    const target = lastTargets.find((item) => (
      item.type === "page"
      && item.webSocketDebuggerUrl
      && !beforeIDs.has(item.id)
      && String(item.url).includes("/player/runtime.html")
    ));
    if (target) return target;
    await wait(250);
  }
  throw new Error(`Play Window não abriu: ${JSON.stringify(lastTargets.map((target) => ({ id: target.id, title: target.title, url: target.url })))}`);
}

async function waitForPlayerReady(cdp, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await evaluate(cdp, `(() => {
      const player = window.GBAStudioDirectPlayer;
      const canvas = player?.canvas ?? document.querySelector("canvas.gba-studio-direct-canvas");
      return {
        canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
        frame: player?.inspectFrame?.() ?? null,
        runtime: player?.inspectRuntime?.()?.state ?? null,
        audio: player?.inspectAudio?.() ?? null,
        error: window.GBAStudioDirectPlayerError ?? null
      };
    })()`);
    if (
      lastState?.canvas?.width === 240
      && lastState?.canvas?.height === 160
      && lastState?.frame?.meaningful === true
      && !lastState.error
    ) return lastState;
    await wait(250);
  }
  throw new Error(`Player não ficou pronto: ${JSON.stringify(lastState)}`);
}

async function waitForRuntime(cdp, predicate, description, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectPresentedRuntime?.()?.state ?? window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null");
    if (predicate(lastState)) return lastState;
    await wait(80);
  }
  throw new Error(`Runtime não alcançou ${description}: ${JSON.stringify(lastState)}`);
}

async function clickRunScene(cdp) {
  const label = `Executar somente a cena ${displaySceneName(sceneName)}`;
  const result = await evaluate(cdp, `(() => {
    const button = document.querySelector(${JSON.stringify(`button[aria-label="${label}"]`)});
    if (!button || button.disabled) return { ok: false, found: Boolean(button), disabled: button?.disabled ?? null };
    button.scrollIntoView({ block: "center", inline: "center" });
    button.click();
    return { ok: true };
  })()`);
  assert(result?.ok, `${label} indisponível: ${JSON.stringify(result)}`);
}

async function closeTarget(targetID) {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!response.ok) return;
  const version = await response.json();
  if (!version.webSocketDebuggerUrl) return;
  const browserCdp = cdpSession(version.webSocketDebuggerUrl);
  await browserCdp.ready;
  try {
    await browserCdp.send("Target.closeTarget", { targetId: targetID });
  } finally {
    browserCdp.close();
  }
}

function phaseName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "frame";
}

async function installFrameSampler(cdp, maxSamples) {
  await evaluate(cdp, `(() => {
    window.__gbaVisualTransitionCaptureStop?.();
    const trace = {
      startedAt: performance.now(),
      label: "boot",
      samples: [],
      running: true
    };
    const hashRegion = (rgba, width, height, x, y, regionWidth, regionHeight) => {
      const left = Math.max(0, Math.min(width, Math.floor(x)));
      const top = Math.max(0, Math.min(height, Math.floor(y)));
      const right = Math.max(left, Math.min(width, Math.ceil(x + regionWidth)));
      const bottom = Math.max(top, Math.min(height, Math.ceil(y + regionHeight)));
      let hash = 2166136261;
      let nonBlack = 0;
      const colors = new Set();
      let pixels = 0;
      for (let row = top; row < bottom; row += 1) {
        for (let column = left; column < right; column += 1) {
          const offset = (row * width + column) * 4;
          const red = rgba[offset];
          const green = rgba[offset + 1];
          const blue = rgba[offset + 2];
          if (red !== 0 || green !== 0 || blue !== 0) nonBlack += 1;
          colors.add(((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3));
          hash ^= red | (green << 8) | (blue << 16);
          hash = Math.imul(hash, 16777619);
          pixels += 1;
        }
      }
      return {
        meaningful: pixels > 0 && nonBlack / pixels >= 0.01 && colors.size >= 3,
        nonBlackRatio: pixels > 0 ? nonBlack / pixels : 0,
        pixelCount: pixels,
        signature: (hash >>> 0).toString(16),
        uniqueColorCount: colors.size
      };
    };
    const sample = (timestamp) => {
      if (!trace.running) return;
      const player = window.GBAStudioDirectPlayer;
      const canvas = player?.canvas;
      const context = canvas?.getContext?.("2d", { willReadFrequently: true });
      const rgba = canvas && context ? context.getImageData(0, 0, canvas.width, canvas.height).data : null;
      const frame = player?.inspectFrame?.() ?? null;
      const runtime = player?.inspectPresentedRuntime?.()?.state ?? player?.inspectRuntime?.()?.state ?? null;
      const input = player?.inspectInput?.() ?? null;
      const audio = player?.inspectAudio?.() ?? null;
      const regions = rgba && canvas ? {
        all: hashRegion(rgba, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height),
        background: hashRegion(rgba, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height * 0.72),
        center: hashRegion(rgba, canvas.width, canvas.height, canvas.width * 0.25, canvas.height * 0.20, canvas.width * 0.50, canvas.height * 0.60),
        hudBottom: hashRegion(rgba, canvas.width, canvas.height, 0, canvas.height * 0.70, canvas.width, canvas.height * 0.30)
      } : null;
      trace.samples.push({
        index: trace.samples.length,
        label: trace.label,
        timestampMs: Number((timestamp - trace.startedAt).toFixed(3)),
        frame: frame ? {
          meaningful: frame.meaningful === true,
          nonBlackRatio: Number(frame.nonBlackRatio),
          pixelCount: Number(frame.pixelCount),
          signature: frame.signature ?? null,
          uniqueColorCount: Number(frame.uniqueColorCount)
        } : null,
        regions,
        runtime: runtime ? {
          activeRuntime: runtime.activeRuntime ?? runtime.runtime ?? null,
          actorCount: Number(runtime.actorCount),
          currentRoom: Number(runtime.currentRoom),
          firstActor: runtime.firstActor ? {
            direction: Number(runtime.firstActor.direction),
            visible: runtime.firstActor.visible === true,
            x: Number(runtime.firstActor.x),
            y: Number(runtime.firstActor.y)
          } : null,
          frame: Number(runtime.frame),
          missedFrameCount: Number(runtime.missedFrameCount ?? runtime.timing?.missedFrameCount),
          renderSkipCount: Number(runtime.renderSkipCount ?? runtime.timing?.renderSkipCount),
          roomChangeCount: Number(runtime.roomChangeCount),
          triggerEnterCount: Number(runtime.triggerEnterCount),
          triggerLeaveCount: Number(runtime.triggerLeaveCount),
          runtimeKind: Number(runtime.runtimeKind),
          timing: runtime.timing ?? null
        } : null,
        input: input ? {
          held: Number(input.held),
          manualKeys: Number(input.manualKeys),
          pressed: Number(input.pressed),
          released: Number(input.released),
          replay: input.replay ?? null
        } : null,
        audio: audio ? {
          emittedAudioFrames: Number(audio.emittedAudioFrames),
          nonSilentSamples: Number(audio.nonSilentSamples),
          underruns: Number(audio.underruns)
        } : null
      });
      if (trace.samples.length >= ${JSON.stringify(maxSamples)}) {
        trace.running = false;
        return;
      }
      requestAnimationFrame(sample);
    };
    trace.stop = () => { trace.running = false; };
    window.__gbaVisualTransitionCapture = trace;
    window.__gbaVisualTransitionCaptureStop = trace.stop;
    requestAnimationFrame(sample);
    return true;
  })()`);
}

async function setPhase(cdp, label) {
  await evaluate(cdp, `window.__gbaVisualTransitionCapture && (window.__gbaVisualTransitionCapture.label = ${JSON.stringify(label)})`);
}

async function captureSnapshot(cdp, outputRoot, snapshots, label) {
  await setPhase(cdp, label);
  await evaluate(cdp, "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))", true);
  const index = snapshots.length;
  const stem = `${String(index + 1).padStart(2, "0")}-${phaseName(label)}`;
  const pngPath = join(outputRoot, `${stem}.png`);
  const rawPath = join(outputRoot, `${stem}.rgba.bin`);
  const state = await evaluate(cdp, `(() => {
    const player = window.GBAStudioDirectPlayer;
    const canvas = player?.canvas;
    if (!canvas) return null;
    const rgba = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
    let binary = "";
    for (let offset = 0; offset < rgba.length; offset += 0x8000) binary += String.fromCharCode(...rgba.subarray(offset, offset + 0x8000));
    return {
      framebufferRgbaBase64: btoa(binary),
      frame: player.inspectFrame?.() ?? null,
      runtime: player.inspectPresentedRuntime?.()?.state ?? player.inspectRuntime?.()?.state ?? null
    };
  })()`);
  assert(state?.framebufferRgbaBase64, `Framebuffer ausente no snapshot ${label}.`);
  await writeFile(rawPath, Buffer.from(state.framebufferRgbaBase64, "base64"));
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
  await writeFile(pngPath, Buffer.from(screenshot.data, "base64"));
  const snapshot = {
    label,
    pngPath,
    rawPath,
    frame: state.frame,
    runtime: state.runtime
  };
  snapshots.push(snapshot);
  return snapshot;
}

async function pressButton(cdp, code, key, windowsVirtualKeyCode, holdMs = 120) {
  const event = {
    code,
    key,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
    windowsVirtualKeyCode
  };
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...event });
  await wait(holdMs);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
  await wait(220);
}

async function readPresentedRuntime(cdp) {
  return evaluate(
    cdp,
    "window.GBAStudioDirectPlayer?.inspectPresentedRuntime?.()?.state ?? window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null"
  );
}

async function returnToStartMenu(cdp, cycle, startRoom) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await readPresentedRuntime(cdp);
    if (Number(current?.runtimeKind) === 3 && Number(current?.currentRoom) === startRoom) {
      return current;
    }
    await setPhase(cdp, `cycle-${cycle}-submenu-${attempt + 1}-returning-start`);
    await pressButton(cdp, "KeyZ", "z", 90);
  }
  const current = await readPresentedRuntime(cdp);
  throw new Error(`Não foi possível retornar ao Menu Start no ciclo ${cycle}: ${JSON.stringify(current)}`);
}

async function openStartSubmenu(cdp, outputRoot, snapshots, cycle, startRoom, targetRoom, downCount, name) {
  for (let index = 0; index < downCount; index += 1) {
    await setPhase(cdp, `cycle-${cycle}-opening-${name}-move-${index + 1}`);
    await pressButton(cdp, "ArrowDown", "ArrowDown", 40);
  }
  await setPhase(cdp, `cycle-${cycle}-opening-${name}`);
  await pressButton(cdp, "Enter", "Enter", 13);
  await waitForRuntime(
    cdp,
    (state) => Number(state?.runtimeKind) === 3 && Number(state?.currentRoom) === targetRoom,
    `${name} no ciclo ${cycle}`
  );
  const snapshot = await captureSnapshot(cdp, outputRoot, snapshots, `cycle-${cycle}-${name}`);
  assert(Number(snapshot.runtime?.currentRoom) === targetRoom, `Snapshot ${name} não está na tela esperada.`);
  await returnToStartMenu(cdp, cycle, startRoom);
}

async function exerciseStartSubmenus(cdp, outputRoot, snapshots, cycle) {
  const startState = await waitForRuntime(
    cdp,
    (state) => Number(state?.runtimeKind) === 3 && Number(state?.currentRoom) === canonicalMenuRooms.start,
    `Menu Start canônico no ciclo ${cycle}`
  );
  const startRoom = Number(startState.currentRoom);
  await openStartSubmenu(cdp, outputRoot, snapshots, cycle, startRoom, canonicalMenuRooms.missions, 0, "missions");

  // Open the first mission detail to exercise the dialogue overlay lifecycle
  // as well as the background/actor resource transaction.
  await setPhase(cdp, `cycle-${cycle}-opening-missions-dialogue`);
  await pressButton(cdp, "Enter", "Enter", 13);
  await waitForRuntime(
    cdp,
    (state) => Number(state?.runtimeKind) === 3 && Number(state?.currentRoom) === canonicalMenuRooms.missions,
    `Missões para o detalhe no ciclo ${cycle}`
  );
  await setPhase(cdp, `cycle-${cycle}-missions-dialogue`);
  await pressButton(cdp, "Enter", "Enter", 13);
  await wait(160);
  await captureSnapshot(cdp, outputRoot, snapshots, `cycle-${cycle}-missions-dialogue`);
  await returnToStartMenu(cdp, cycle, startRoom);

  await openStartSubmenu(cdp, outputRoot, snapshots, cycle, startRoom, canonicalMenuRooms.inventory, 1, "inventory");
  await openStartSubmenu(cdp, outputRoot, snapshots, cycle, startRoom, canonicalMenuRooms.map, 2, "map");
  await openStartSubmenu(cdp, outputRoot, snapshots, cycle, startRoom, canonicalMenuRooms.profile, 3, "profile");
}

function auditSamples(samples) {
  const transientBlankFrames = [];
  const signatureChanges = [];
  for (let index = 1; index < samples.length - 1; index += 1) {
    const before = samples[index - 1];
    const current = samples[index];
    const after = samples[index + 1];
    if (before.frame?.meaningful && !current.frame?.meaningful && after.frame?.meaningful) {
      transientBlankFrames.push({ index, label: current.label, timestampMs: current.timestampMs });
    }
    if (
      current.regions?.background?.signature
      && before.regions?.background?.signature
      && current.regions.background.signature !== before.regions.background.signature
      && current.runtime?.runtimeKind === before.runtime?.runtimeKind
      && current.runtime?.currentRoom === before.runtime?.currentRoom
    ) {
      signatureChanges.push({ index, label: current.label, timestampMs: current.timestampMs });
    }
  }
  return {
    ok: transientBlankFrames.length === 0,
    sampleCount: samples.length,
    signatureChangeCount: signatureChanges.length,
    signatureChanges,
    transientBlankFrames,
    nonMeaningfulSampleCount: samples.filter((sample) => sample.frame?.meaningful !== true).length,
    menuRoomCoverage: Array.from(new Set(
      samples
        .filter((sample) => sample.runtime?.runtimeKind === 3)
        .map((sample) => sample.runtime.currentRoom)
        .filter((room) => Number.isInteger(room))
    )).sort((left, right) => left - right)
  };
}

async function screenRecordingCapability() {
  try {
    const result = await execFileAsync("/usr/sbin/screencapture", ["-h"], { maxBuffer: 32 * 1024 });
    return { available: /video|records screen/i.test(`${result.stdout}\n${result.stderr}`), help: `${result.stdout}\n${result.stderr}`.trim() };
  } catch (error) {
    const help = `${error.stdout ?? ""}\n${error.stderr ?? ""}`.trim();
    return { available: /video|records screen/i.test(help), help };
  }
}

async function main() {
  assert(canonicalP0Source.globalAcceptance === true, "Fonte P0 canônica inválida.");
  assert(sceneName === "mercado_suspenso", "Este capturador inicial cobre o fluxo do Mercado Suspenso.");
  const executable = electronExecutablePath({ appRoot, usePackagedApp });
  assert(existsSync(executable), `Executável Electron não encontrado: ${executable}`);
  await mkdir(evidenceRoot, { recursive: true });
  const captureRoot = join(evidenceRoot, "frames");
  await mkdir(captureRoot, { recursive: true });
  const tempRoot = await mkdtemp(join(tmpdir(), "gba-studio-visual-transition-"));
  const child = spawn(executable, usePackagedApp ? [] : [appRoot], {
    cwd: appRoot,
    env: createElectronSmokeEnv({
      GBA_STUDIO_OPEN_PROJECT: canonicalP0Source.projectPath,
      GBA_STUDIO_SMOKE_CDP_PORT: String(port),
      GBA_STUDIO_SMOKE_ENGINE_EXPORT_ROOT: join(tempRoot, "EngineExport"),
      GBA_STUDIO_SMOKE_USER_DATA_DIR: join(tempRoot, "UserData")
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });
  let mainCdp;
  let playerCdp;
  let playerTarget;
  const snapshots = [];
  let evidence = null;
  try {
    const targets = await waitForTargets();
    const mainTarget = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl && !String(target.url).includes("/player/runtime.html"));
    assert(mainTarget, `Página principal não encontrada: ${JSON.stringify(targets)}`);
    mainCdp = cdpSession(mainTarget.webSocketDebuggerUrl);
    await mainCdp.ready;
    await waitForText(mainCdp, (text) => text.includes("O Último Farol") && text.includes(displaySceneName(sceneName)), "projeto canônico no Editor");
    const beforeIDs = new Set((await fetchTargets()).map((target) => target.id));
    await clickRunScene(mainCdp);
    playerTarget = await waitForPlayerTarget(beforeIDs);
    playerCdp = cdpSession(playerTarget.webSocketDebuggerUrl);
    await playerCdp.ready;
    await playerCdp.send("Page.enable");
    await playerCdp.send("Runtime.enable");
    await playerCdp.send("Page.bringToFront");
    const initial = await waitForPlayerReady(playerCdp);
    const originRoom = Number(initial.runtime?.currentRoom ?? 0);
    await installFrameSampler(playerCdp, 600);
    await captureSnapshot(playerCdp, captureRoot, snapshots, "baseline");
    for (let cycle = 1; cycle <= cycles; cycle += 1) {
      await captureSnapshot(playerCdp, captureRoot, snapshots, `cycle-${cycle}-before-start`);
      await setPhase(playerCdp, `cycle-${cycle}-opening-start`);
      await pressButton(playerCdp, "Enter", "Enter", 13);
      await waitForRuntime(playerCdp, (state) => Number(state?.runtimeKind) === 3 || state?.activeRuntime === "menu", `Menu Start no ciclo ${cycle}`);
      await captureSnapshot(playerCdp, captureRoot, snapshots, `cycle-${cycle}-start-menu`);
      await exerciseStartSubmenus(playerCdp, captureRoot, snapshots, cycle);
      await setPhase(playerCdp, `cycle-${cycle}-returning-scene`);
      await pressButton(playerCdp, "KeyZ", "z", 90);
      await waitForRuntime(
        playerCdp,
        (state) => (Number(state?.runtimeKind) === 2 || state?.activeRuntime === "isometric") && Number(state?.currentRoom) === originRoom,
        `retorno ao Mercado no ciclo ${cycle}`
      );
      await captureSnapshot(playerCdp, captureRoot, snapshots, `cycle-${cycle}-scene-settled`);
    }
    await setPhase(playerCdp, "complete");
    await evaluate(playerCdp, "window.__gbaVisualTransitionCaptureStop?.()");
    const trace = await evaluate(playerCdp, "window.__gbaVisualTransitionCapture ?? null");
    const samples = Array.isArray(trace?.samples) ? trace.samples : [];
    const audit = auditSamples(samples);
    const requiredSnapshotLabels = [
      "missions",
      "missions-dialogue",
      "inventory",
      "map",
      "profile"
    ];
    const missingSnapshotLabels = requiredSnapshotLabels.filter((name) => (
      !snapshots.some((snapshot) => snapshot.label.endsWith(`-${name}`))
    ));
    assert(missingSnapshotLabels.length === 0, `Submenus não cobertos: ${missingSnapshotLabels.join(", ")}`);
    const screenRecording = await screenRecordingCapability();
    evidence = {
      ok: audit.ok && missingSnapshotLabels.length === 0,
      generatedAt: new Date().toISOString(),
      capture: {
        sceneName,
        cycles,
        canvas: { width: 240, height: 160 },
        frameSampling: "requestAnimationFrame + canvas.getImageData",
        menuCoverage: {
          expectedRooms: canonicalMenuRooms,
          requiredSnapshots: requiredSnapshotLabels,
          missingSnapshotLabels
        },
        snapshots,
        screenRecording
      },
      audit,
      initial,
      samples
    };
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    console.log(`Captura visual de transição concluída: ${evidencePath}`);
    console.log(JSON.stringify({ ok: evidence.ok, sampleCount: samples.length, snapshots: snapshots.length, transientBlankFrames: audit.transientBlankFrames.length, screenRecording: screenRecording.available }, null, 2));
    if (!evidence.ok) process.exitCode = 1;
  } finally {
    playerCdp?.close();
    mainCdp?.close();
    if (playerTarget) await closeTarget(playerTarget.id).catch(() => undefined);
    await terminateChild(child);
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
