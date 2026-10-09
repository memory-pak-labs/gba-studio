import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cdpSession,
  copySmokeProject,
  createElectronSmokeEnv,
  packagedDarwinElectronExecutableCandidates
} from "./electron-smoke-helpers.mjs";

it("copies authored project files without copying generated builds and caches", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "gba-smoke-copy-test-"));
  const source = join(temporary, "source");
  const destination = join(temporary, "isolated");
  try {
    for (const folder of ["Assets/build", "plugins", "build", ".gba-cache", "node_modules", ".git"]) {
      await mkdir(join(source, folder), { recursive: true });
      await writeFile(join(source, folder, "content.txt"), folder);
    }
    await writeFile(join(source, "game.gba-project"), "project");
    await writeFile(join(source, "game.gbares"), "split resource");
    await copySmokeProject(source, destination);
    expect((await readdir(destination)).sort()).toEqual(["Assets", "game.gba-project", "game.gbares", "plugins"]);
    expect(await readFile(join(destination, "Assets/build/content.txt"), "utf8")).toBe("Assets/build");
    await writeFile(join(destination, "game.gba-project"), "edited isolated project");
    expect(await readFile(join(source, "game.gba-project"), "utf8")).toBe("project");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("cdpSession", () => {
  it("rejects pending commands when the renderer connection closes", async () => {
    const sockets = [];
    class FakeWebSocket {
      constructor(url) {
        this.url = url;
        this.listeners = new Map();
        sockets.push(this);
      }

      addEventListener(type, listener) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      }

      emit(type, event = {}) {
        for (const listener of this.listeners.get(type) ?? []) listener(event);
      }

      send() {}
      close() {}
    }
    vi.stubGlobal("WebSocket", FakeWebSocket);

    const cdp = cdpSession("ws://renderer");
    sockets[0].emit("open");
    await cdp.ready;
    const command = cdp.send("Runtime.evaluate");

    sockets[0].emit("close", { code: 1006, reason: "renderer exited" });

    await expect(command).rejects.toThrow("CDP connection closed");
  });
});

describe("createElectronSmokeEnv", () => {
  it("removes external compiler and Python discovery only for the offline installation smoke", () => {
    vi.stubEnv("GBA_STUDIO_OFFLINE_SMOKE", "1");
    const env = createElectronSmokeEnv({ Path: "C:/external/bin", PATH: "/external/bin", MAKE: "/external/make", PYTHONHOME: "/external/python", GBA_STUDIO_SMOKE_CDP_PORT: "9339" });
    expect(env.Path).toBeUndefined();
    expect(env.PATH).toBe("");
    expect(env.MAKE).toBeUndefined();
    expect(env.PYTHONHOME).toBeUndefined();
    expect(env.DEVKITPRO).toBe("missing-external-toolchain");
    expect(env.GBA_STUDIO_PYTHON).toBe("missing-external-python");
    expect(env.GBA_STUDIO_SMOKE_CDP_PORT).toBe("9339");
  });
  it("removes Electron run-as-node flags that break browser boot and CDP", () => {
    const env = createElectronSmokeEnv({
      ELECTRON_RUN_AS_NODE: "1",
      ATOM_SHELL_INTERNAL_RUN_AS_NODE: "1",
      GBA_STUDIO_SMOKE_CDP_PORT: "9339"
    });

    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(env.ATOM_SHELL_INTERNAL_RUN_AS_NODE).toBeUndefined();
    expect(env.GBA_STUDIO_SMOKE_CDP_PORT).toBe("9339");
  });
});

describe("packagedDarwinElectronExecutableCandidates", () => {
  it("prefers the safe executableName bundle while keeping legacy bundle paths as fallback", () => {
    expect(packagedDarwinElectronExecutableCandidates("/repo/apps/desktop-electron")).toEqual([
      "/repo/apps/desktop-electron/release/mac-universal/gba-studio.app/Contents/MacOS/gba-studio",
      "/repo/apps/desktop-electron/release/mac-arm64/gba-studio.app/Contents/MacOS/gba-studio",
      "/repo/apps/desktop-electron/release/mac/gba-studio.app/Contents/MacOS/gba-studio",
      "/repo/apps/desktop-electron/release/mac-arm64/GBA Studio.app/Contents/MacOS/GBA Studio",
      "/repo/apps/desktop-electron/release/mac/GBA Studio.app/Contents/MacOS/GBA Studio"
    ]);
  });
});
