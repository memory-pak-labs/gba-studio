import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultWelcomeSavedProjectPath } from "./smoke-electron-welcome-paths.mjs";
import { createElectronSmokeEnv, electronExecutablePath as resolveElectronExecutablePath } from "./lib/electron-smoke-helpers.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = process.env.GBA_STUDIO_SMOKE_OUTPUT_DIR ?? join(appRoot, "artifacts/welcome/latest");
const welcomeScreenshotPath = join(outputDir, "00-welcome.png");
const port = Number(process.env.GBA_STUDIO_SMOKE_CDP_PORT ?? 9342);
const usePackagedApp = process.argv.includes("--packaged");

function electronExecutablePath() {
  if (process.env.GBA_STUDIO_PACKAGED_APP_PATH?.trim()) {
    return resolveElectronExecutablePath({ appRoot, usePackagedApp });
  }
  if (usePackagedApp) {
    if (process.platform === "darwin") {
      return [
        join(appRoot, "release/mac-universal/gba-studio.app/Contents/MacOS/gba-studio"),
        join(appRoot, "release/mac-arm64/gba-studio.app/Contents/MacOS/gba-studio"),
        join(appRoot, "release/mac/gba-studio.app/Contents/MacOS/gba-studio"),
        join(appRoot, "release/mac-arm64/GBA Studio.app/Contents/MacOS/GBA Studio"),
        join(appRoot, "release/mac/GBA Studio.app/Contents/MacOS/GBA Studio")
      ].find((item) => existsSync(item)) ?? join(appRoot, "release/mac-universal/gba-studio.app/Contents/MacOS/gba-studio");
    }
    if (process.platform === "win32") {
      return join(appRoot, "release/win-unpacked/GBA Studio.exe");
    }
    return [
      join(appRoot, "release/linux-unpacked/gba-studio"),
      join(appRoot, "release/linux-unpacked/GBA Studio")
    ].find((item) => existsSync(item)) ?? join(appRoot, "release/linux-unpacked/gba-studio");
  }

  if (process.platform === "darwin") {
    return join(appRoot, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
  }
  if (process.platform === "win32") {
    return join(appRoot, "node_modules/electron/dist/electron.exe");
  }
  return join(appRoot, "node_modules/electron/dist/electron");
}

async function terminateChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;

  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 2_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });

  if (!exited && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await new Promise((resolve) => {
      child.once("exit", resolve);
      setTimeout(resolve, 2_000);
    });
  }
}

async function waitForTargets() {
  const deadline = Date.now() + 15_000;
  const url = `http://127.0.0.1:${port}/json/list`;

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
      // The Electron process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`DevTools endpoint did not become available on ${url}.`);
}

function cdpSession(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let nextID = 1;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
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
      return result;
    },
    close() {
      socket.close();
    }
  };
}

async function renderedText(cdp) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: "document.body?.innerText ?? ''",
    returnByValue: true
  });

  return String(result.result?.value ?? "");
}

async function waitForRenderedText(cdp, predicate, description) {
  const deadline = Date.now() + 10_000;
  let lastText = "";

  while (Date.now() < deadline) {
    const text = await renderedText(cdp);
    lastText = text;
    if (predicate(text)) {
      return text;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Renderer did not reach expected state: ${description}.\nRendered text:\n${lastText.slice(0, 2_000)}`);
}

function assertContains(text, expected) {
  if (!text.includes(expected)) {
    throw new Error(`Expected rendered app text to include ${JSON.stringify(expected)}.\nRendered text:\n${text.slice(0, 2_000)}`);
  }
}

async function assertCurrentEditorSurface(cdp) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: `
      (() => ({
        overviewTools: Boolean(document.querySelector('[aria-label="Ferramentas da visão geral do projeto"]')),
        fitCanvas: Boolean(document.querySelector('button[aria-label="Ajustar canvas às cenas visíveis"]')),
        projectTab: Boolean(document.querySelector('[role="tab"][aria-selected="true"]')),
        titleCard: Boolean(document.querySelector('[aria-label*="Card da cena titulo"]')),
      }))()
    `,
    returnByValue: true
  });
  const value = result.result?.value;
  if (!value?.overviewTools || !value?.fitCanvas || !value?.projectTab || !value?.titleCard) {
    throw new Error(`Expected current editor surface controls. Received: ${JSON.stringify(value)}`);
  }
}

async function clickButtonContainingText(cdp, label) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: `
      (() => {
        const label = ${JSON.stringify(label)};
        const buttons = Array.from(document.querySelectorAll("button"));
        const button = buttons.find((item) => item.textContent?.includes(label));
        if (!button) {
          return {
            ok: false,
            available: buttons.map((item) => item.textContent?.trim()).filter(Boolean)
          };
        }
        button.click();
        return { ok: true };
      })()
    `,
    returnByValue: true
  });
  const value = result.result?.value;

  if (!value?.ok) {
    throw new Error(`Button containing ${JSON.stringify(label)} not found. Available buttons: ${(value?.available ?? []).join(", ")}`);
  }
}

async function captureScreenshot(cdp, path) {
  await mkdir(dirname(path), { recursive: true });
  const result = await cdp.send("Page.captureScreenshot", {
    captureBeyondViewport: false,
    format: "png"
  });
  await writeFile(path, Buffer.from(result.data, "base64"));
}

async function assertSavedExampleProject(projectPath) {
  const savedContents = await readFile(projectPath, "utf8");
  const savedProject = JSON.parse(savedContents);

  if (savedProject?.name !== "Novo projeto") {
    throw new Error(`Expected saved example project name to be Novo projeto, got ${JSON.stringify(savedProject?.name)}.`);
  }
  if (!Array.isArray(savedProject?.scenas) || savedProject.scenas.length !== 30 || savedProject.scenas[0]?.name !== "logo") {
    throw new Error(`Expected saved example project to contain its complete scene set. Saved project: ${savedContents.slice(0, 500)}`);
  }
  const assetNames = Array.isArray(savedProject?.assets) ? savedProject.assets.map((asset) => asset?.name).filter(Boolean) : [];
  const materializedAssets = [
    { name: "title-logo-actor-128x88.png", folder: "sprites" },
    { name: "press-start-actor-88x32.png", folder: "sprites" },
    { name: "frame-lumen-v2.png", folder: "ui" },
    { name: "dialogue-selector-gba-v4.png", folder: "ui" }
  ];

  for (const { name: assetName, folder } of materializedAssets) {
    if (!assetNames.includes(assetName)) {
      throw new Error(`Expected saved example project to include bundled asset ${assetName}. Assets: ${assetNames.join(", ")}`);
    }

    const assetPath = join(dirname(projectPath), "Assets", folder, assetName);
    if (!existsSync(assetPath)) {
      throw new Error(`Expected saved example project to materialize ${assetPath}.`);
    }
  }
}

async function assertCanReopenSavedExampleProject(cdp, projectPath) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: `
      (async () => {
        const opened = await window.gbaStudio.openProjectAtPath(${JSON.stringify(projectPath)});
        return {
          canceled: opened.canceled,
          error: opened.error ?? null,
          path: opened.path ?? null,
          title: opened.project?.summary?.name ?? null,
          roomNames: Array.isArray(opened.project?.data?.scenas)
            ? opened.project.data.scenas.map((room) => room?.name).filter(Boolean)
            : []
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  const value = result.result?.value;

  if (value?.error || value?.canceled || value?.title !== "Novo projeto" || value?.roomNames?.length !== 30 || !value?.roomNames?.includes("logo")) {
    throw new Error(`Expected saved example project to reopen cleanly. Result: ${JSON.stringify(value)}`);
  }
}

async function main() {
  const electronPath = electronExecutablePath();
  if (!existsSync(electronPath)) {
    throw new Error(`Electron executable not found: ${electronPath}`);
  }

  const tempRoot = await mkdtemp(join(tmpdir(), "gba-studio-electron-welcome-"));
  const savedProjectPath = defaultWelcomeSavedProjectPath(tempRoot);
  const childEnv = createElectronSmokeEnv({
    GBA_STUDIO_SMOKE_CDP_PORT: String(port),
    GBA_STUDIO_SMOKE_PROJECT_SAVE_PATH: savedProjectPath,
    GBA_STUDIO_SMOKE_USER_DATA_DIR: join(tempRoot, "UserData")
  });
  delete childEnv.GBA_STUDIO_OPEN_PROJECT;

  const child = spawn(electronPath, usePackagedApp ? [] : [appRoot], {
    cwd: appRoot,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    try {
      const targets = await waitForTargets();
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl) ?? targets[0];
      const cdp = cdpSession(page.webSocketDebuggerUrl);
      await cdp.ready;

      try {
        const welcomeText = await waitForRenderedText(
          cdp,
          (nextText) => nextText.includes("GBA Studio") && nextText.includes("Templates") && nextText.includes("Exemplo GBA Completo") && nextText.includes("Projeto em branco"),
          "welcome screen"
        );
        assertContains(welcomeText, "IDE visual para Game Boy Advance");
        assertContains(welcomeText, "Criar projeto");
        assertContains(welcomeText, "Abrir projeto");
        const preview = await cdp.send("Runtime.evaluate", {
          expression: "({ complete: document.querySelector('.welcome-template-preview')?.complete, width: document.querySelector('.welcome-template-preview')?.naturalWidth })",
          returnByValue: true
        });
        if (!preview.result?.value?.complete || preview.result.value.width !== 240) {
          throw new Error(`Expected loaded 240px example template preview. Result: ${JSON.stringify(preview.result?.value)}`);
        }
        await captureScreenshot(cdp, welcomeScreenshotPath);

        await clickButtonContainingText(cdp, "Começar com o exemplo");
        const editorText = await waitForRenderedText(
          cdp,
          (nextText) =>
            nextText.includes("Novo projeto") &&
            nextText.includes("Salvo") &&
            !nextText.includes("Alterado") &&
            nextText.includes("Editor") &&
            nextText.includes("Projeto") &&
            nextText.includes("logo"),
          "new example project editor"
        );
        assertContains(editorText, "Projeto");
        assertContains(editorText, "Pré-fabricados");
        await assertCurrentEditorSurface(cdp);
        assertContains(editorText, "Cena");
        assertContains(editorText, "30 cenas");
        assertContains(editorText, "PRESS START");
        await assertSavedExampleProject(savedProjectPath);
        await assertCanReopenSavedExampleProject(cdp, savedProjectPath);
      } finally {
        cdp.close();
      }

      console.log(JSON.stringify({
        ok: true,
        title: page.title,
        url: page.url,
        welcomeScreenshotPath,
        savedProjectPath,
        checked: [
          "welcome-screen",
          "example-project",
          "example-project-auto-save",
          "editor-ready",
          "contract-ok",
          "example-project-save",
          "example-project-reopen",
          usePackagedApp ? "packaged-app" : "dev-app"
        ]
      }, null, 2));
    } finally {
      await terminateChild(child);
    }
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
    if (stdout.includes("Unhandled") || stderr.includes("Unhandled")) {
      throw new Error(`Electron emitted an unhandled error.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
