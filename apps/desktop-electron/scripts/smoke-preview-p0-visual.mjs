#!/usr/bin/env node
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { applyPreviewP0VisualEvidence } from "./verify-preview-p0-playtest.mjs";
import { createElectronSmokeEnv, electronExecutablePath, terminateChild } from "./lib/electron-smoke-helpers.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const evidenceRoot = path.join(appRoot, "artifacts", "preview-playtest", "latest");
const previewEvidencePath = path.join(evidenceRoot, "preview_playtest_evidence.json");
const visualEvidencePath = path.join(evidenceRoot, "preview_visual_evidence.json");
const screenshotPath = path.join(evidenceRoot, "preview_visual_smoke.png");
const port = Number(process.env.GBA_STUDIO_PREVIEW_VISUAL_PORT ?? 9359);
const cdpPort = Number(process.env.GBA_STUDIO_PREVIEW_VISUAL_CDP_PORT ?? 9360);
const commandTimeoutMs = Number(process.env.GBA_STUDIO_PREVIEW_VISUAL_COMMAND_TIMEOUT_MS ?? 8_000);
const totalTimeoutMs = Number(process.env.GBA_STUDIO_PREVIEW_VISUAL_TOTAL_TIMEOUT_MS ?? 45_000);

function logStep(message) {
  console.log(`[preview-p0-visual] ${message}`);
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} excedeu ${ms}ms.`)), ms);
    })
  ]);
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".wasm")) return "application/wasm";
  if (filePath.endsWith(".gba") || filePath.endsWith(".data")) return "application/octet-stream";
  if (filePath.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

function createStaticServer(root) {
  const server = createServer(async (request, response) => {
    try {
      const requestURL = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
      const decodedPath = decodeURIComponent(requestURL.pathname === "/" ? "/index.html" : requestURL.pathname);
      const filePath = path.resolve(root, `.${decodedPath}`);

      if (!filePath.startsWith(root)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const bytes = await readFile(filePath);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": contentType(filePath)
      });
      response.end(bytes);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function waitForTargets() {
  const deadline = Date.now() + 15_000;
  const url = `http://127.0.0.1:${cdpPort}/json/list`;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const targets = await response.json();
        if (Array.isArray(targets) && targets.length > 0) {
          return targets;
        }
      }
    } catch {
      // Electron may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Endpoint DevTools nao ficou disponivel em ${url}.`);
}

function cdpSession(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let nextID = 1;

  async function messageText(data) {
    if (typeof data === "string") return data;
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
    if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
    if (typeof data?.text === "function") return data.text();
    return String(data);
  }

  socket.addEventListener("message", async (event) => {
    let message;
    try {
      message = JSON.parse(await messageText(event.data));
    } catch (error) {
      for (const callbacks of pending.values()) {
        callbacks.reject(error);
      }
      pending.clear();
      return;
    }
    if (!message.id) return;
    const callbacks = pending.get(message.id);
    if (!callbacks) return;
    pending.delete(message.id);
    if (message.error) {
      callbacks.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
    } else {
      callbacks.resolve(message.result);
    }
  });

  return {
    ready: new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    }),
    send(method, params = {}) {
      const id = nextID;
      nextID += 1;
      const result = new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
      socket.send(JSON.stringify({ id, method, params }));
      return withTimeout(result, commandTimeoutMs, `CDP ${method}`);
    },
    close() {
      socket.close();
    }
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true
  });
  return result.result?.value;
}

async function waitForPreviewVisualState(cdp) {
  const deadline = Date.now() + 15_000;
  let lastState = null;

  while (Date.now() < deadline) {
    const state = await evaluate(cdp, `
      (() => {
        const game = document.querySelector("#game");
        const player = window.GBAStudioPlayerConfig;
        const frame = game ? game.querySelector("iframe.gba-studio-player-frame") : null;
        const runtimeDocument = frame && frame.contentDocument;
        const directCanvas = runtimeDocument?.querySelector("canvas.gba-studio-direct-canvas");
        const legacyStartButton = runtimeDocument?.querySelector(".ejs_start_button");
        return {
          domReady: document.readyState === "complete" || document.readyState === "interactive",
          gameContainerFound: Boolean(game),
          playerConfigFound: player?.core === "gba" && player?.romUrl === "roms/electron_p0_functional.gba" && player?.runtimeUrl === "player/runtime.html",
          playerDomMounted: Boolean(frame) && Boolean(directCanvas || legacyStartButton),
          runtimeMode: directCanvas ? "direct" : legacyStartButton ? "legacy" : "missing",
          directError: runtimeDocument?.querySelector("#runtime-game")?.dataset.directError ?? null,
          expectedCore: player?.core,
          expectedRomPath: player?.romUrl,
          expectedPlayerPath: "player/gbastudio-player.js",
          renderedText: document.body?.innerText ?? ""
        };
      })()
    `);
    lastState = state;

    if (
      state?.domReady &&
      state?.gameContainerFound &&
      state?.playerConfigFound &&
      state?.playerDomMounted
    ) {
      return state;
    }

    await evaluate(cdp, "document.querySelector('#game')?.click()");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Preview técnico P0 nao montou visualmente no Electron.\nUltimo estado: ${JSON.stringify(lastState, null, 2)}`);
}

async function startPreviewRuntime(cdp) {
  const clicked = await evaluate(cdp, `
    (() => {
      const frame = document.querySelector("#game iframe.gba-studio-player-frame");
      if (frame?.contentDocument?.querySelector("canvas.gba-studio-direct-canvas")) return "direct";
      const startButton = frame?.contentDocument?.querySelector(".ejs_start_button");
      if (!startButton) return false;
      startButton.click();
      return "legacy";
    })()
  `);
  if (clicked === "direct") {
    const inputState = await evaluate(cdp, `
      (() => {
        const frame = document.querySelector("#game iframe.gba-studio-player-frame");
        const runtime = frame?.contentDocument;
        const canvas = runtime?.querySelector("canvas.gba-studio-direct-canvas");
        frame?.contentWindow?.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", bubbles: true }));
        return canvas?.dataset.input ?? "missing";
      })()
    `);
    if (inputState !== "keyboard-down") {
      throw new Error(`O player mGBA direto montou o canvas, mas nao recebeu input. Estado: ${inputState}`);
    }
    return true;
  }
  if (clicked !== "legacy") {
    throw new Error("O controle Jogar do GBA Studio Player nao foi encontrado.");
  }

  const deadline = Date.now() + 15_000;
  let lastState = null;
  while (Date.now() < deadline) {
    const state = await evaluate(cdp, `
      (() => {
        const frame = document.querySelector("#game iframe.gba-studio-player-frame");
        const runtime = frame?.contentDocument;
        return {
          startButtonVisible: Boolean(runtime?.querySelector(".ejs_start_button")),
          canvasMounted: Boolean(runtime?.querySelector("canvas, .ejs_canvas")),
          runtimeText: runtime?.body?.innerText ?? ""
        };
      })()
    `);
    lastState = state;
    if (state?.canvasMounted === true && state?.startButtonVisible === false) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`O runtime GBA nao iniciou apos clicar em Jogar. Ultimo estado: ${JSON.stringify(lastState, null, 2)}`);
}

async function captureScreenshot(cdp) {
  const screenshot = await cdp.send("Page.captureScreenshot", {
    captureBeyondViewport: false,
    format: "png"
  });
  const data = String(screenshot.data ?? "");
  const bytes = Buffer.from(data, "base64");
  await writeFile(screenshotPath, bytes);
  return bytes.length;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const totalTimeout = setTimeout(() => {
    console.error(`Smoke visual do preview técnico P0 excedeu ${totalTimeoutMs}ms.`);
    process.exit(1);
  }, totalTimeoutMs);

  if (!existsSync(previewEvidencePath)) {
    throw new Error(`Evidencia do preview técnico P0 nao encontrada: ${previewEvidencePath}`);
  }

  const previewEvidence = await readJson(previewEvidencePath);
  const previewRoot = previewEvidence.destination;
  if (typeof previewRoot !== "string" || !existsSync(path.join(previewRoot, "index.html"))) {
    throw new Error(`Pacote Web do preview técnico P0 nao encontrado: ${previewRoot}`);
  }

  const electronPath = electronExecutablePath({ appRoot, usePackagedApp: false });
  if (!existsSync(electronPath)) {
    throw new Error(`Electron nao encontrado: ${electronPath}`);
  }
  if (!existsSync(path.join(appRoot, "dist/main/main.js"))) {
    throw new Error("Build Electron ausente. Rode npm run build antes do smoke visual do preview técnico P0.");
  }

  await mkdir(evidenceRoot, { recursive: true });
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gbastudio-preview-p0-visual-"));
  logStep(`subindo servidor estatico em http://127.0.0.1:${port}`);
  const server = await createStaticServer(previewRoot);
  const url = `http://127.0.0.1:${port}/index.html`;

  const child = spawn(electronPath, [appRoot], {
    cwd: appRoot,
    env: createElectronSmokeEnv({
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
      GBA_STUDIO_PREVIEW_VISUAL_URL: url,
      GBA_STUDIO_PREVIEW_VISUAL_CDP_PORT: String(cdpPort),
      GBA_STUDIO_SMOKE_CDP_PORT: String(cdpPort),
      GBA_STUDIO_SMOKE_USER_DATA_DIR: tempRoot
    }),
    stdio: "pipe"
  });
  logStep(`Electron iniciado com CDP em ${cdpPort}`);

  let cdp;
  try {
    logStep("aguardando alvos DevTools");
    const targets = await waitForTargets();
    const target = targets.find((item) => item.url === url && item.type === "page")
      ?? targets.find((item) => item.url === url)
      ?? targets.find((item) => item.type === "page")
      ?? targets[0];
    if (!target?.webSocketDebuggerUrl) {
      throw new Error(`Nenhum alvo DevTools valido encontrado: ${JSON.stringify(targets, null, 2)}`);
    }
    logStep(`conectando ao alvo ${target.type ?? "desconhecido"} ${target.url ?? ""}`);
    cdp = cdpSession(target.webSocketDebuggerUrl);
    await withTimeout(cdp.ready, commandTimeoutMs, "abertura do WebSocket CDP");
    logStep("habilitando Page/Runtime");
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    logStep("validando estado visual do preview");
    const visualState = await waitForPreviewVisualState(cdp);
    logStep("iniciando runtime GBA no player");
    visualState.runtimeStarted = await startPreviewRuntime(cdp);
    logStep("capturando screenshot");
    const screenshotBytes = await captureScreenshot(cdp);
    const visualEvidence = {
      ...visualState,
      screenshotBytes,
      screenshotPath
    };
    await writeFile(visualEvidencePath, `${JSON.stringify(visualEvidence, null, 2)}\n`, "utf8");

    const updatedEvidence = applyPreviewP0VisualEvidence(previewEvidence, visualEvidence);
    await writeFile(previewEvidencePath, `${JSON.stringify(updatedEvidence, null, 2)}\n`, "utf8");
    console.log(`Preview técnico P0 visual smoke OK: ${previewEvidencePath}`);
  } finally {
    clearTimeout(totalTimeout);
    cdp?.close();
    await terminateChild(child);
    await new Promise((resolve) => server.close(resolve));
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
