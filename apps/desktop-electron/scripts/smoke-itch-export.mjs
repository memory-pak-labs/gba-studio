#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  cdpSession,
  createElectronSmokeEnv,
  electronExecutablePath,
  terminateChild,
  wait
} from "./lib/electron-smoke-helpers.mjs";
import { writeSmokeGbaRom } from "./lib/smoke-gba-rom.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const evidenceRoot = path.join(appRoot, "artifacts", "itch-export", "latest");
const packageEvidencePath = path.join(evidenceRoot, "itch_export_package_evidence.json");
const visualEvidencePath = path.join(evidenceRoot, "itch_export_visual_evidence.json");
const finalEvidencePath = path.join(evidenceRoot, "itch_export_smoke_evidence.json");
const engineEvidencePath = path.join(appRoot, "artifacts", "engine-rom-p0", "latest", "engine_p0_rom_smoke_evidence.json");
const smokeRomPath = path.join(appRoot, "artifacts", "smoke-rom", "latest", "electron_p0_functional.gba");
const forceMinimalSmokeRom = process.env.GBA_STUDIO_FORCE_MINIMAL_SMOKE_ROM === "1";
const port = Number(process.env.GBA_STUDIO_ITCH_EXPORT_PORT ?? 9370);
const cdpPort = Number(process.env.GBA_STUDIO_ITCH_EXPORT_CDP_PORT ?? 9371);
const commandTimeoutMs = Number(process.env.GBA_STUDIO_ITCH_EXPORT_COMMAND_TIMEOUT_MS ?? 8_000);
const totalTimeoutMs = Number(process.env.GBA_STUDIO_ITCH_EXPORT_TOTAL_TIMEOUT_MS ?? 60_000);

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".wasm")) return "application/wasm";
  if (filePath.endsWith(".gba")) return "application/octet-stream";
  return "application/octet-stream";
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} excedeu ${ms}ms.`)), ms))
  ]);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? appRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: options.stdio ?? "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} saiu com codigo ${code ?? "desconhecido"}.`));
      }
    });
  });
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readTextIfExists(filePath) {
  return existsSync(filePath) ? readFile(filePath, "utf8") : "";
}

async function fileBytes(filePath) {
  const info = await stat(filePath);
  return info.size;
}

export async function validateItchExportPackage(root) {
  const requiredFiles = [
    "index.html",
    ".itch.toml",
    "manifest.json",
    "README.md",
    "roms/electron_p0_functional.gba",
    "player/gbastudio-player.js",
    "player/gbastudio-player.css",
    "player/runtime.html",
    "player/mgba-direct-player.mjs",
    "player/mgba-core.mjs",
    "player/mgba-core.wasm",
    "player/mgba-core.manifest.json",
    "licenses/mGBA-MPL-2.0.txt"
  ];
  const forbiddenFiles = [
    "player/loader.js",
    "player/emulator.min.js",
    "player/emulator.min.css",
    "player/cores/mgba-wasm.data",
    "player/cores/mgba-legacy-wasm.data",
    "player/compression/extract7z.js",
    "licenses/EMULATORJS-GPL-3.0.txt"
  ];
  const missingFiles = requiredFiles.filter((relativePath) => !existsSync(path.join(root, relativePath)));
  const forbiddenPresent = forbiddenFiles.filter((relativePath) => existsSync(path.join(root, relativePath)));
  const index = await readTextIfExists(path.join(root, "index.html"));
  const runtime = await readTextIfExists(path.join(root, "player", "runtime.html"));
  const playerEntry = await readTextIfExists(path.join(root, "player", "gbastudio-player.js"));
  const manifest = existsSync(path.join(root, "manifest.json"))
    ? await readJson(path.join(root, "manifest.json"))
    : {};
  const scannedText = [index, runtime, playerEntry, JSON.stringify(manifest)].join("\n");
  const forbiddenText = ["EmulatorJS", "window.EJS_", "loader.js", "emulator.min.js", "cdn.", "https://cdn", "http://cdn"];
  const forbiddenTextPresent = forbiddenText.filter((needle) => scannedText.includes(needle));
  const romPath = path.join(root, "roms", "electron_p0_functional.gba");
  const wasmPath = path.join(root, "player", "mgba-core.wasm");
  const romBytes = existsSync(romPath) ? await fileBytes(romPath) : 0;
  const wasmBytes = existsSync(wasmPath) ? await fileBytes(wasmPath) : 0;

  const failures = [
    ...missingFiles.map((file) => `Arquivo obrigatorio ausente: ${file}`),
    ...forbiddenPresent.map((file) => `Arquivo legado proibido presente: ${file}`),
    ...forbiddenTextPresent.map((text) => `Texto legado/CDN proibido presente: ${text}`),
    ...(manifest?.distribution?.adapter === "mgba-wasm-direct" ? [] : ["Manifesto nao declara adapter mgba-wasm-direct."]),
    ...(manifest?.licenses?.mgba === "licenses/mGBA-MPL-2.0.txt" ? [] : ["Manifesto nao aponta para a licenca MPL do mGBA."]),
    ...(romBytes > 0 ? [] : ["ROM .gba ausente ou vazia."]),
    ...(wasmBytes > 1024 ? [] : ["mgba-core.wasm ausente ou pequeno demais."])
  ];

  return {
    ok: failures.length === 0,
    root,
    requiredFiles,
    forbiddenFiles,
    missingFiles,
    forbiddenPresent,
    forbiddenTextPresent,
    romPath,
    wasmPath,
    romBytes,
    wasmBytes,
    manifest,
    failures
  };
}

function createStaticServer(root) {
  const resolvedRoot = path.resolve(root);
  const server = createServer(async (request, response) => {
    try {
      const requestURL = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
      const decodedPath = decodeURIComponent(requestURL.pathname === "/" ? "/index.html" : requestURL.pathname);
      const filePath = path.resolve(resolvedRoot, `.${decodedPath}`);
      if (filePath !== resolvedRoot && !filePath.startsWith(`${resolvedRoot}${path.sep}`)) {
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

async function fetchTargets() {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
  if (!response.ok) return [];
  const targets = await response.json();
  return Array.isArray(targets) ? targets : [];
}

async function waitForTargets() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchTargets();
      if (targets.length > 0) return targets;
    } catch {
      // Electron may still be starting.
    }
    await wait(250);
  }
  throw new Error(`Endpoint DevTools nao ficou disponivel na porta ${cdpPort}.`);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  return result.result?.value;
}

async function waitForItchPlayer(cdp) {
  const deadline = Date.now() + 20_000;
  let lastState = null;
  while (Date.now() < deadline) {
    const state = await evaluate(cdp, `
      (() => {
        const game = document.querySelector("#game");
        const frame = game?.querySelector("iframe.gba-studio-player-frame");
        const runtime = frame?.contentDocument;
        const canvas = runtime?.querySelector("canvas.gba-studio-direct-canvas");
        return {
          domReady: document.readyState === "complete" || document.readyState === "interactive",
          gameContainerFound: Boolean(game),
          playerConfigFound: window.GBAStudioPlayerConfig?.romUrl === "roms/electron_p0_functional.gba",
          frameMounted: Boolean(frame),
          canvasMounted: Boolean(canvas),
          canvasWidth: canvas?.width ?? 0,
          canvasHeight: canvas?.height ?? 0,
          directError: runtime?.querySelector("#runtime-game")?.dataset?.directError ?? null,
          renderedText: document.body?.innerText ?? ""
        };
      })()
    `);
    lastState = state;
    if (
      state?.domReady &&
      state?.gameContainerFound &&
      state?.playerConfigFound &&
      state?.frameMounted &&
      state?.canvasMounted &&
      state?.canvasWidth === 240 &&
      state?.canvasHeight === 160 &&
      !state?.directError
    ) {
      return state;
    }
    await wait(250);
  }
  throw new Error(`Pacote itch.io nao montou o player mGBA direto. Ultimo estado: ${JSON.stringify(lastState, null, 2)}`);
}

async function assertItchInput(cdp) {
  const state = await evaluate(cdp, `
    (() => {
      const frame = document.querySelector("#game iframe.gba-studio-player-frame");
      const runtimeWindow = frame?.contentWindow;
      const canvas = frame?.contentDocument?.querySelector("canvas.gba-studio-direct-canvas");
      if (!runtimeWindow || !canvas) return { ok: false, reason: "runtime missing" };
      runtimeWindow.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", bubbles: true, cancelable: true }));
      const afterDown = canvas.dataset.input;
      runtimeWindow.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", bubbles: true, cancelable: true }));
      const afterUp = canvas.dataset.input;
      return { ok: afterDown === "keyboard-down" && afterUp === "keyboard-up", afterDown, afterUp };
    })()
  `);
  if (!state?.ok) {
    throw new Error(`Input nao chegou ao player do pacote itch.io: ${JSON.stringify(state)}`);
  }
  return state;
}

async function generateWebExportPackage(romPath) {
  await mkdir(evidenceRoot, { recursive: true });
  await run("npm", ["test", "--", "--run", "src/main/previewP0Flow.test.ts"], {
    env: {
      GBA_STUDIO_PREVIEW_PLAYTEST_EVIDENCE: packageEvidencePath,
      GBA_STUDIO_PREVIEW_ROM_SOURCE: romPath
    }
  });
  const evidence = await readJson(packageEvidencePath);
  if (evidence?.ok !== true || evidence?.previewPackageGenerated !== true || typeof evidence?.destination !== "string") {
    throw new Error(`Evidencia de export itch.io invalida: ${JSON.stringify(evidence, null, 2)}`);
  }
  return evidence;
}

async function resolveRomForItchSmoke() {
  if (!forceMinimalSmokeRom && existsSync(engineEvidencePath)) {
    const engineEvidence = await readJson(engineEvidencePath);
    const romPath = engineEvidence?.romPath;
    if (engineEvidence?.ok === true && typeof romPath === "string" && existsSync(romPath)) {
      return { romPath, romSource: "engine-p0-rom" };
    }
  }

  return {
    romPath: await writeSmokeGbaRom(smokeRomPath),
    romSource: "minimal-smoke-rom"
  };
}

async function main() {
  const totalTimeout = setTimeout(() => {
    console.error(`Smoke itch.io excedeu ${totalTimeoutMs}ms.`);
    process.exit(1);
  }, totalTimeoutMs);

  let server;
  let child;
  let cdp;
  try {
    const { romPath, romSource } = await resolveRomForItchSmoke();

    const packageEvidence = await generateWebExportPackage(romPath);
    const packageRoot = packageEvidence.destination;
    const validation = await validateItchExportPackage(packageRoot);
    if (!validation.ok) {
      throw new Error(`Pacote itch.io invalido:\n- ${validation.failures.join("\n- ")}`);
    }

    if (!existsSync(path.join(appRoot, "dist", "main", "main.js"))) {
      throw new Error("Build Electron ausente. Rode npm run build antes do smoke itch.io.");
    }

    server = await createStaticServer(packageRoot);
    const url = `http://127.0.0.1:${port}/index.html`;
    const electronPath = electronExecutablePath({ appRoot, usePackagedApp: false });
    child = spawn(electronPath, [appRoot], {
      cwd: appRoot,
      env: createElectronSmokeEnv({
        ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
        GBA_STUDIO_PREVIEW_VISUAL_URL: url,
        GBA_STUDIO_PREVIEW_VISUAL_CDP_PORT: String(cdpPort),
        GBA_STUDIO_SMOKE_CDP_PORT: String(cdpPort),
        GBA_STUDIO_SMOKE_USER_DATA_DIR: path.join(evidenceRoot, "user-data")
      }),
      stdio: ["ignore", "pipe", "pipe"]
    });

    const targets = await waitForTargets();
    const target = targets.find((item) => item.url === url && item.type === "page")
      ?? targets.find((item) => item.type === "page")
      ?? targets[0];
    if (!target?.webSocketDebuggerUrl) {
      throw new Error(`Nenhum alvo DevTools valido encontrado: ${JSON.stringify(targets, null, 2)}`);
    }
    cdp = cdpSession(target.webSocketDebuggerUrl);
    await withTimeout(cdp.ready, commandTimeoutMs, "abertura do WebSocket CDP");
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    const visualState = await waitForItchPlayer(cdp);
    const inputState = await assertItchInput(cdp);

    const evidence = {
      ok: true,
      generatedAt: new Date().toISOString(),
      packageRoot,
      url,
      romSource,
      romPath: validation.romPath,
      romSha256: await sha256(validation.romPath),
      wasmPath: validation.wasmPath,
      wasmSha256: await sha256(validation.wasmPath),
      structure: {
        requiredFiles: validation.requiredFiles,
        forbiddenFiles: validation.forbiddenFiles,
        missingFiles: validation.missingFiles,
        forbiddenPresent: validation.forbiddenPresent,
        forbiddenTextPresent: validation.forbiddenTextPresent
      },
      visual: visualState,
      input: inputState,
      checked: [
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
      ]
    };
    await writeFile(visualEvidencePath, `${JSON.stringify({ visual: visualState, input: inputState }, null, 2)}\n`, "utf8");
    await writeFile(finalEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    console.log(`itch.io export smoke OK: ${finalEvidencePath}`);
  } finally {
    clearTimeout(totalTimeout);
    cdp?.close();
    if (child) await terminateChild(child);
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
