import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  contentTypeForPlayerPath,
  createRomPlayerServer,
  normalizeRomPlayerFrameStats,
  romPlayerBrowserWindowOptions,
  resolveWebPlayerRoot
} from "./romPlayerWindow.js";
import { createInputReplay } from "../shared/inputReplay.js";

const tempRoots: string[] = [];
const desktopElectronRoot = path.resolve(__dirname, "../..");

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "gba-studio-rom-player-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("romPlayerWindow", () => {
  it("preserves validated native Luta runtime state in Play telemetry", () => {
    const runtimeState = {
      schema: 2,
      frame: 120,
      currentRoom: 0,
      runtimeKind: 12,
      variables: [3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      flagBits: 3,
      player: { x: 120, y: 80, direction: 2 },
      actorCount: 1,
      firstActor: { x: 144, y: 80, direction: 2, visible: true },
      lastMusic: -1,
      lastSfx: -1,
      collision: {
        currentFlags: 32,
        currentSlope: 2,
        seenEffectBits: 224,
        seenSlopeBits: 20,
        blockedDirectionBits: 15
      },
      triggerEnterCount: 2,
      triggerLeaveCount: 1,
      roomChangeCount: 1,
      timing: {
        cpuWorkTicks: 1200,
        vblankWaitTicks: 240,
        peakCpuWorkTicks: 1600,
        peakVblankWaitTicks: 320,
        missedFrameCount: 2,
        renderSkipCount: 1,
        frameSkipPolicy: 1
      },
      input: { held: 48, pressed: 16, released: 32 }
    };

    expect(normalizeRomPlayerFrameStats({
      cpuPercent: 8,
      emulationMs: 1.2,
      fps: 60,
      frameMs: 16.67,
      presentationFps: 59.8,
      emulationFps: 59.73,
      droppedFrames: 1,
      droppedFrameRatio: 0.0167,
      romBytes: 85_000,
      runtimeState
    })).toEqual(expect.objectContaining({
      presentationFps: 59.8,
      emulationFps: 59.73,
      droppedFrames: 1,
      droppedFrameRatio: 0.0167,
      runtimeState
    }));

    expect(normalizeRomPlayerFrameStats({
      cpuPercent: 8,
      emulationMs: 1.2,
      fps: 60,
      frameMs: 16.67,
      presentationFps: 59.8,
      emulationFps: 59.73,
      droppedFrames: 1,
      droppedFrameRatio: 0.0167,
      romBytes: 85_000,
      runtimeState: { ...runtimeState, schema: 3 },
      hardware: {
        bgTiles: 96,
        objTiles: 24,
        oam: 18,
        paletteColors: 64,
        vramBytes: 3840,
        eventBytes: 512,
        audioBytes: 2048,
        dmaBytes: 128,
        vblankTicks: 240,
        cpuWorkTicks: 1200
      }
    })).toEqual(expect.objectContaining({
      hardware: {
        bgTiles: 96,
        objTiles: 24,
        oam: 18,
        paletteColors: 64,
        vramBytes: 3840,
        eventBytes: 512,
        audioBytes: 2048,
        dmaBytes: 128,
        vblankTicks: 240,
        cpuWorkTicks: 1200
      },
      runtimeState: expect.objectContaining({ schema: 3 })
    }));

    expect(normalizeRomPlayerFrameStats({
      cpuPercent: 8,
      emulationMs: 1.2,
      fps: 60,
      frameMs: 16.67,
      presentationFps: 59.8,
      emulationFps: 59.73,
      droppedFrames: 1,
      droppedFrameRatio: 0.0167,
      romBytes: 85_000,
      runtimeState: {
        ...runtimeState,
        schema: 4,
        audio: {
          pcmSourceBytes: 600,
          mixerBufferBytes: 4096,
          activeVoiceCount: 3,
          pcmUnderrunCount: 2,
          pcmSubmittedBlocks: 18
        }
      }
    })).toEqual(expect.objectContaining({
      runtimeState: expect.objectContaining({
        schema: 4,
        audio: {
          pcmSourceBytes: 600,
          mixerBufferBytes: 4096,
          activeVoiceCount: 3,
          pcmUnderrunCount: 2,
          pcmSubmittedBlocks: 18
        }
      })
    }));
  });

  it("abre o Play em uma janela normal sem fullscreen", () => {
    const options = romPlayerBrowserWindowOptions("/repo/dist/main");

    expect(options).toMatchObject({
      width: 720,
      height: 480,
      fullscreen: false,
      fullscreenable: false,
      maximizable: false,
      simpleFullscreen: false,
      useContentSize: true,
      webPreferences: {
        backgroundThrottling: false
      }
    });
    expect(options.parent).toBeUndefined();
  });

  it("resolves WebPlayer from app resources when packaged and from static assets in dev", () => {
    expect(resolveWebPlayerRoot({
      appPath: "/repo/apps/desktop-electron",
      resourcesPath: "/repo/apps/desktop-electron/release/mac-arm64/GBA Studio.app/Contents/Resources",
      packaged: false
    })).toBe(path.join("/repo/apps/desktop-electron", "static", "WebPlayer"));

    expect(resolveWebPlayerRoot({
      appPath: "/repo/apps/desktop-electron/resources/app.asar",
      resourcesPath: "/Applications/GBA Studio.app/Contents/Resources",
      packaged: true
    })).toBe(path.join("/Applications/GBA Studio.app/Contents/Resources", "WebPlayer"));
  });

  it("serves the selected ROM and player files while blocking path traversal", async () => {
    const root = await tempRoot();
    const webPlayerRoot = path.join(root, "WebPlayer");
    const romPath = path.join(root, "build", "demo.gba");
    await mkdir(path.join(webPlayerRoot, "player"), { recursive: true });
    await mkdir(path.dirname(romPath), { recursive: true });
    await writeFile(path.join(webPlayerRoot, "player", "runtime.html"), "<!doctype html><title>Runtime</title>", "utf8");
    await writeFile(romPath, "rom-bytes", "utf8");

    const server = await createRomPlayerServer({ romPath, webPlayerRoot, title: "Demo" });
    try {
      const rom = await fetch(new URL("/roms/demo.gba", server.url));
      expect(rom.ok).toBe(true);
      expect(await rom.text()).toBe("rom-bytes");

      const runtime = await fetch(new URL("/player/runtime.html", server.url));
      expect(runtime.headers.get("content-type")).toContain("text/html");
      expect(await runtime.text()).toContain("Runtime");

      const traversal = await fetch(new URL("/%2e%2e/build/demo.gba", server.url));
      expect(traversal.status).not.toBe(200);
    } finally {
      await server.close();
    }
  });

  it("serve replay JSON quando solicitado", async () => {
    const root = await tempRoot();
    const webPlayerRoot = path.join(root, "WebPlayer");
    const romPath = path.join(root, "build", "demo.gba");
    const replay = createInputReplay({ id: "runtime-replay", seed: 11 });
    await mkdir(path.join(webPlayerRoot, "player"), { recursive: true });
    await mkdir(path.dirname(romPath), { recursive: true });
    await writeFile(path.join(webPlayerRoot, "player", "runtime.html"), "<!doctype html><title>Runtime</title>", "utf8");
    await writeFile(romPath, "rom-bytes", "utf8");

    const server = await createRomPlayerServer({
      romPath,
      webPlayerRoot,
      title: "Replay",
      inputReplay: replay,
      keyboardBindings: {
        up: ["ArrowUp", "w"],
        down: ["ArrowDown"],
        left: ["ArrowLeft"],
        right: ["ArrowRight"],
        a: ["Alt", "z", "j"],
        b: ["Control", "k", "x"],
        l: ["Q"],
        r: ["E"],
        start: ["Enter"],
        select: ["Shift"]
      }
    });
    try {
      const runtime = await fetch(new URL("/player/runtime.html?rom=../roms/demo.gba&title=Replay&replay=1", server.url));
      expect(await runtime.text()).toContain("Runtime");

      const replayRequest = await fetch(new URL("/player/input-replay.json", server.url));
      expect(replayRequest.ok).toBe(true);
      expect(await replayRequest.json()).toMatchObject({ id: "runtime-replay", seed: 11 });

      const keyboardConfig = await fetch(new URL("/player/input-config.json", server.url));
      expect(keyboardConfig.ok).toBe(true);
      expect(await keyboardConfig.json()).toMatchObject({
        up: ["ArrowUp", "w"],
        a: ["Alt", "z", "j"]
      });

      const withoutReplay = await createRomPlayerServer({ romPath, webPlayerRoot, title: "NoReplay" });
      try {
        const notFound = await fetch(new URL("/player/input-replay.json", withoutReplay.url));
        expect(notFound.status).toBe(404);
      } finally {
        await withoutReplay.close();
      }
    } finally {
      await server.close();
    }
  });

  it("keeps the ROM canvas clean and publishes telemetry to the app debugger", async () => {
    const runtime = await readFile(path.join(desktopElectronRoot, "static/WebPlayer/player/runtime.html"), "utf8");
    const player = await readFile(path.join(desktopElectronRoot, "static/WebPlayer/player/mgba-direct-player.mjs"), "utf8");
    const wrapper = await readFile(path.join(desktopElectronRoot, "third_party/mgba-web/mgba_web.c"), "utf8");

    expect(runtime).not.toContain("hardware-profiler");
    expect(runtime).not.toContain("Profiler GBA");
    expect(runtime).toContain("publishRomPlayerTelemetry");
    expect(runtime).toContain("onFrameStats: publishProfilerTelemetry");
    expect(player).toContain("runtimeState: nativeTelemetry");
    expect(player).toContain("hardware: nativeTelemetry?.hardware ?? null");
    expect(wrapper).toContain("gba_find_runtime_telemetry");
    expect(wrapper).toContain("gba_runtime_telemetry_word");
  });

  it("renders the 240x160 framebuffer with integer nearest-neighbor scaling", async () => {
    const [runtime, player] = await Promise.all([
      readFile(path.join(desktopElectronRoot, "static/WebPlayer/player/runtime.html"), "utf8"),
      readFile(path.join(desktopElectronRoot, "static/WebPlayer/player/mgba-direct-player.mjs"), "utf8")
    ]);

    expect(runtime).toContain("image-rendering: pixelated");
    expect(runtime).toContain("image-rendering: crisp-edges");
    expect(runtime).toContain("place-items: center");
    expect(runtime).toContain("width: 240px");
    expect(runtime).toContain("height: 160px");
    expect(player).toContain("integerFramebufferScale(container.clientWidth, container.clientHeight)");
    expect(player).toContain("canvas.dataset.integerScale = String(layout.scale)");
  });

  it("sets browser-safe content types for module and wasm player assets", () => {
    expect(contentTypeForPlayerPath("player/mgba-direct-player.mjs")).toBe("text/javascript; charset=utf-8");
    expect(contentTypeForPlayerPath("player/mgba-core.wasm")).toBe("application/wasm");
    expect(contentTypeForPlayerPath("roms/game.gba")).toBe("application/octet-stream");
  });

  it("fecha o servidor rapidamente e de forma idempotente mesmo com conexao ativa", async () => {
    const root = await tempRoot();
    const webPlayerRoot = path.join(root, "WebPlayer");
    const romPath = path.join(root, "demo.gba");
    await mkdir(path.join(webPlayerRoot, "player"), { recursive: true });
    await writeFile(path.join(webPlayerRoot, "player", "runtime.html"), "<!doctype html>", "utf8");
    await writeFile(romPath, "rom", "utf8");
    const server = await createRomPlayerServer({ romPath, webPlayerRoot, title: "Demo" });
    const port = Number(new URL(server.url).port);
    const socket = connect({ host: "127.0.0.1", port });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    socket.write("GET /player/runtime.html HTTP/1.1\r\nHost: 127.0.0.1\r\n");

    const firstClose = server.close();
    const closedQuickly = await Promise.race([
      firstClose.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 250))
    ]);
    socket.destroy();

    expect(closedQuickly).toBe(true);
    await expect(firstClose).resolves.toBeUndefined();
    await expect(server.close()).resolves.toBeUndefined();
  });
});
