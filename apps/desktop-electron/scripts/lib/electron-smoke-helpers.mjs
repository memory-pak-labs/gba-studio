import { existsSync } from "node:fs";
import { cp } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const electronRunAsNodeKeys = ["ELECTRON_RUN_AS_NODE", "ATOM_SHELL_INTERNAL_RUN_AS_NODE"];

// Copy authored resources, not previous builds or machine-specific caches.
// Apply exclusions at the project root: Assets/build can be an authored folder.
export async function copySmokeProject(source, destination) {
  const excluded = new Set(["build", ".gba-cache", "node_modules", ".git"]);
  await cp(source, destination, {
    recursive: true,
    filter: (entry) => !excluded.has(relative(source, entry).split(sep)[0])
  });
}

export function createElectronSmokeEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  for (const key of electronRunAsNodeKeys) {
    delete env[key];
  }
  return env;
}

function firstExistingPath(paths) {
  return paths.find((item) => existsSync(item)) ?? paths[0];
}

export function packagedDarwinElectronExecutableCandidates(appRoot) {
  return [
    join(appRoot, "release/mac-universal/gba-studio.app/Contents/MacOS/gba-studio"),
    join(appRoot, "release/mac-arm64/gba-studio.app/Contents/MacOS/gba-studio"),
    join(appRoot, "release/mac/gba-studio.app/Contents/MacOS/gba-studio"),
    join(appRoot, "release/mac-arm64/GBA Studio.app/Contents/MacOS/GBA Studio"),
    join(appRoot, "release/mac/GBA Studio.app/Contents/MacOS/GBA Studio")
  ];
}

export function electronExecutablePath({ appRoot, usePackagedApp }) {
  if (usePackagedApp) {
    const configuredAppPath = process.env.GBA_STUDIO_PACKAGED_APP_PATH?.trim();
    if (configuredAppPath) {
      const executable = process.platform === "darwin"
        ? join(configuredAppPath, "Contents/MacOS/gba-studio")
        : configuredAppPath;
      if (!existsSync(executable)) {
        throw new Error(`Aplicativo empacotado configurado nao encontrado: ${executable}`);
      }
      return executable;
    }
    if (process.platform === "darwin") {
      return firstExistingPath(packagedDarwinElectronExecutableCandidates(appRoot));
    }
    if (process.platform === "win32") {
      return join(appRoot, "release/win-unpacked/GBA Studio.exe");
    }
    return firstExistingPath([
      join(appRoot, "release/linux-unpacked/gba-studio"),
      join(appRoot, "release/linux-unpacked/GBA Studio")
    ]);
  }

  if (process.platform === "darwin") {
    return join(appRoot, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
  }
  if (process.platform === "win32") {
    return join(appRoot, "node_modules/electron/dist/electron.exe");
  }
  return join(appRoot, "node_modules/electron/dist/electron");
}

export async function terminateChild(child) {
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

export async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function cdpSession(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let nextID = 1;
  let terminalError = null;

  const rejectPending = (error) => {
    terminalError ??= error;
    for (const callbacks of pending.values()) callbacks.reject(terminalError);
    pending.clear();
  };

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
  socket.addEventListener("close", (event) => {
    const detail = [event.code, event.reason].filter(Boolean).join(": ");
    rejectPending(new Error(`CDP connection closed${detail ? ` (${detail})` : ""}.`));
  });

  return {
    ready: new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    }),
    send(method, params = {}) {
      if (terminalError) return Promise.reject(terminalError);
      const id = nextID;
      nextID += 1;
      const result = new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
      try {
        socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        pending.delete(id);
        return Promise.reject(error);
      }
      return result;
    },
    close() {
      socket.close();
    }
  };
}

export async function renderedText(cdp) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: "document.body?.innerText ?? ''",
    returnByValue: true
  });

  return String(result.result?.value ?? "");
}

export async function waitForRenderedText(cdp, predicate, description) {
  const deadline = Date.now() + 10_000;
  let lastText = "";

  while (Date.now() < deadline) {
    const text = await renderedText(cdp);
    lastText = text;
    if (predicate(text)) {
      return text;
    }
    await wait(250);
  }

  throw new Error(`Renderer did not reach expected state: ${description}.\nRendered text:\n${lastText.slice(0, 8_000)}`);
}
