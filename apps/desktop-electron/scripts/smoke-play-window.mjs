#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertCanonicalP0Source } from "./p0-source-catalog.mjs";
import { buildPlayWindowCheckedFeatures } from "./play-window-smoke-evidence.mjs";
import {
  cdpSession,
  createElectronSmokeEnv,
  electronExecutablePath,
  renderedText,
  terminateChild,
  wait
} from "./lib/electron-smoke-helpers.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const canonicalP0Source = assertCanonicalP0Source(appRoot);
const usePackagedApp = process.argv.includes("--packaged");
const port = Number(process.env.GBA_STUDIO_PLAY_WINDOW_CDP_PORT ?? process.env.GBA_STUDIO_SMOKE_CDP_PORT ?? 9398);
const evidenceRoot = path.join(appRoot, "artifacts", "play-window", "latest");
const evidencePath = path.join(evidenceRoot, "play_window_smoke_evidence.json");
const screenshotPath = path.join(evidenceRoot, "play_window_rom.png");
const keepTemp = process.env.GBA_STUDIO_KEEP_SMOKE_TEMP === "1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchTargets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) return [];
  const targets = await response.json();
  return Array.isArray(targets) ? targets : [];
}

async function waitForTargets(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastTargets = [];
  while (Date.now() < deadline) {
    try {
      lastTargets = await fetchTargets();
      if (lastTargets.some((target) => target.type === "page" && target.webSocketDebuggerUrl)) {
        return lastTargets;
      }
    } catch {
      // O processo Electron pode ainda estar iniciando.
    }
    await wait(250);
  }
  throw new Error(`Endpoint DevTools indisponível na porta ${port}: ${JSON.stringify(lastTargets)}`);
}

async function waitForText(cdp, predicate, description, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  while (Date.now() < deadline) {
    lastText = await renderedText(cdp);
    if (predicate(lastText)) return lastText;
    await wait(250);
  }
  throw new Error(`Estado não alcançado: ${description}.\n${lastText.slice(0, 8_000)}`);
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Falha no renderer.");
  }
  return result.result?.value;
}

async function clickRunRom(cdp) {
  const result = await evaluate(cdp, `
    (() => {
      const button = document.querySelector('button[aria-label="Executar ROM"]');
      if (!button) return { ok: false, reason: "missing" };
      if (button.disabled) return { ok: false, reason: "disabled", title: button.title };
      button.click();
      return { ok: true };
    })()
  `);
  assert(result?.ok, `Executar ROM indisponível: ${JSON.stringify(result)}`);
}

async function waitForPlayerTarget(beforeIDs, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  let lastTargets = [];
  while (Date.now() < deadline) {
    lastTargets = await fetchTargets();
    const target = lastTargets.find((item) =>
      item.type === "page"
      && item.webSocketDebuggerUrl
      && !beforeIDs.has(item.id)
      && String(item.url).includes("/player/runtime.html")
    );
    if (target) return target;
    await wait(250);
  }
  throw new Error(`Play Window não abriu após a compilação: ${JSON.stringify(lastTargets.map((target) => ({ id: target.id, title: target.title, url: target.url })))}`);
}

async function waitForPlayerReady(cdp, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await evaluate(cdp, `
      (() => {
        const canvas = document.querySelector("canvas.gba-studio-direct-canvas");
        const player = window.GBAStudioDirectPlayer;
        const frame = player?.inspectFrame?.() ?? null;
        const runtime = player?.inspectRuntime?.()?.state ?? null;
        const audio = player?.inspectAudio?.() ?? null;
        return {
          canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
          frame,
          runtime,
          audio,
          inputMarker: canvas?.dataset?.input ?? null,
          directError: window.GBAStudioDirectPlayerError ?? null
        };
      })()
    `);
    if (
      lastState?.canvas?.width === 240
      && lastState?.canvas?.height === 160
      && lastState?.frame?.meaningful === true
      && !lastState?.directError
    ) {
      return lastState;
    }
    await wait(250);
  }
  throw new Error(`Player mGBA não ficou pronto: ${JSON.stringify(lastState)}`);
}

async function exerciseKeyboard(cdp) {
  const key = { code: "ArrowRight", key: "ArrowRight", windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 };
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...key });
  await wait(250);
  const afterDown = await evaluate(cdp, "document.querySelector('canvas.gba-studio-direct-canvas')?.dataset?.input ?? null");
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
  await wait(100);
  const afterUp = await evaluate(cdp, "document.querySelector('canvas.gba-studio-direct-canvas')?.dataset?.input ?? null");
  return {
    ok: afterDown === "keyboard-down" && afterUp === "keyboard-up",
    afterDown,
    afterUp,
    code: key.code
  };
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

async function listFiles(root) {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

async function main() {
  assert(canonicalP0Source.role === "canonical-p0" && canonicalP0Source.globalAcceptance === true, "Fonte P0 canônica inválida.");
  const executable = electronExecutablePath({ appRoot, usePackagedApp });
  assert(existsSync(executable), `Executável Electron não encontrado: ${executable}`);

  await mkdir(evidenceRoot, { recursive: true });
  const tempRoot = await mkdtemp(path.join(tmpdir(), "gba-studio-play-window-"));
  const engineExportRoot = path.join(tempRoot, "EngineExport");
  const childEnv = createElectronSmokeEnv({
    GBA_STUDIO_OPEN_PROJECT: canonicalP0Source.projectPath,
    GBA_STUDIO_SMOKE_CDP_PORT: String(port),
    GBA_STUDIO_SMOKE_ENGINE_EXPORT_ROOT: engineExportRoot,
    GBA_STUDIO_SMOKE_USER_DATA_DIR: path.join(tempRoot, "UserData")
  });
  const child = spawn(executable, usePackagedApp ? [] : [appRoot], {
    cwd: appRoot,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let playerCdp;
  let playerTarget;
  try {
    const targets = await waitForTargets();
    const mainTarget = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl && !String(target.url).includes("/player/runtime.html"));
    assert(mainTarget?.webSocketDebuggerUrl, `Página principal não encontrada: ${JSON.stringify(targets)}`);
    const mainCdp = cdpSession(mainTarget.webSocketDebuggerUrl);
    await mainCdp.ready;
    try {
      await waitForText(mainCdp, (text) => text.includes("O Último Farol") && text.includes("titulo"), "projeto exemplo P0 no Editor");
      const beforeIDs = new Set((await fetchTargets()).map((target) => target.id));
      await clickRunRom(mainCdp);
      await waitForText(mainCdp, (text) => text.includes("Compilando ROM...") || text.includes("Play Window aberto:"), "compilação da ROM canônica", 300_000);
      playerTarget = await waitForPlayerTarget(beforeIDs);
    } finally {
      mainCdp.close();
    }

    playerCdp = cdpSession(playerTarget.webSocketDebuggerUrl);
    await playerCdp.ready;
    await playerCdp.send("Page.enable");
    await playerCdp.send("Runtime.enable");
    await playerCdp.send("Page.bringToFront");
    const initial = await waitForPlayerReady(playerCdp);
    const input = await exerciseKeyboard(playerCdp);
    assert(input.ok, `Input não chegou ao Play Window: ${JSON.stringify(input)}`);
    const lifecycle = await evaluate(playerCdp, `(async () => {
      const { startMGBAPlayer } = await import('./mgba-direct-player.mjs');
      const container = document.querySelector('#runtime-game');
      const romUrl = new URLSearchParams(location.search).get('rom');
      window.GBAStudioDirectPlayer.destroy();
      const add = window.addEventListener;
      const remove = window.removeEventListener;
      const listeners = new Map(['keydown', 'keyup', 'resize'].map(name => [name, new Set()]));
      window.addEventListener = function(name, handler, ...rest) {
        listeners.get(name)?.add(handler);
        return add.call(this, name, handler, ...rest);
      };
      window.removeEventListener = function(name, handler, ...rest) {
        listeners.get(name)?.delete(handler);
        return remove.call(this, name, handler, ...rest);
      };
      const cycles = [];
      try {
        for (let index = 0; index < 10; index++) {
          const player = await startMGBAPlayer({ container, romUrl, storageKey: 'lifecycle-smoke' });
          await new Promise(resolve => requestAnimationFrame(resolve));
          player.destroy();
          player.destroy();
          cycles.push({ listeners: [...listeners.values()].reduce((sum, handlers) => sum + handlers.size, 0), canvases: container.querySelectorAll('canvas').length });
        }
      } finally {
        window.addEventListener = add;
        window.removeEventListener = remove;
      }
      window.GBAStudioDirectPlayer = await startMGBAPlayer({ container, romUrl, storageKey: 'lifecycle-smoke' });
      return { cycles, ok: cycles.length === 10 && cycles.every(cycle => cycle.listeners === 0 && cycle.canvases === 0) };
    })()`, true);
    assert(lifecycle.ok, `Recursos retidos após destruir o Play: ${JSON.stringify(lifecycle)}`);
    const afterInput = await waitForPlayerReady(playerCdp);
    const fullscreen = await evaluate(playerCdp, "window.matchMedia('(display-mode: fullscreen)').matches");
    const romPath = (await listFiles(engineExportRoot)).find((file) => file.endsWith(".gba")) ?? null;
    const screenshot = await playerCdp.send("Page.captureScreenshot", { format: "png" });
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

    const checked = buildPlayWindowCheckedFeatures({
      audioOutput: initial.audio,
      gameplayInputState: input,
      runtimeInspection: { state: initial.runtime },
      startInputState: initial
    });
    const evidence = {
      ok: true,
      generatedAt: new Date().toISOString(),
      packagedApp: usePackagedApp,
      source: canonicalP0Source,
      projectPath: canonicalP0Source.projectPath,
      romPath,
      target: {
        id: playerTarget.id,
        title: playerTarget.title,
        url: playerTarget.url,
        type: playerTarget.type
      },
      canvas: initial.canvas,
      input,
      initial,
      afterInput,
      fullscreen,
      lifecycle,
      checked
    };
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    console.log(`Play Window smoke OK: ${evidencePath}`);
  } finally {
    playerCdp?.close();
    if (playerTarget) await closeTarget(playerTarget.id).catch(() => undefined);
    await terminateChild(child);
    if (!keepTemp) await rm(tempRoot, { recursive: true, force: true });
    else console.log(`Arquivos temporários preservados: ${tempRoot}`);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
