// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ core: null }));
vi.mock("../static/WebPlayer/player/mgba-core.mjs", () => ({ default: async () => harness.core }));
import { startMGBAPlayer } from "../static/WebPlayer/player/mgba-direct-player.mjs";

let container;
let frames;
let audioCreated;
let audioClosed;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  frames = new Set();
  let frameID = 0;
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => { frames.add(++frameID); return frameID; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id) => frames.delete(id)));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    createImageData: () => ({ data: new Uint8ClampedArray(240 * 160 * 4) }),
    putImageData: vi.fn()
  });
  audioCreated = vi.fn();
  audioClosed = vi.fn(async () => {});
  vi.stubGlobal("AudioContext", class {
    constructor() { audioCreated(); }
    state = "running";
    currentTime = 0;
    destination = {};
    createGain() { return { gain: {}, connect() {} }; }
    close = audioClosed;
  });
  harness.core = {
    HEAPU8: new Uint8Array(1024),
    _gba_init: vi.fn(() => 1),
    _malloc: vi.fn(() => 16),
    _free: vi.fn(),
    _gba_load_rom: vi.fn(() => 1),
    _gba_destroy: vi.fn(),
    _gba_state_size: vi.fn(() => 8),
    _gba_save_state: vi.fn(() => 1),
    _gba_load_state: vi.fn(() => 1)
  };
});
afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const start = () => startMGBAPlayer({ container, romUrl: "test.gba", storageKey: "test-state" });

describe("Play resource ownership", () => {
  it("removes keyboard listeners across repeated starts and destroys", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    for (let index = 0; index < 20; index += 1) {
      const player = await start();
      player.destroy();
      player.destroy();
    }
    for (const event of ["keydown", "keyup"]) {
      const handlers = add.mock.calls.filter(([name]) => name === event).map(([, handler]) => handler);
      expect(handlers).toHaveLength(20);
      for (const handler of handlers) expect(remove).toHaveBeenCalledWith(event, handler);
      // Clean up even on a failing regression run to avoid cross-test contamination.
      handlers.forEach((handler) => window.removeEventListener(event, handler));
    }
    expect(harness.core._gba_destroy).toHaveBeenCalledTimes(20);
    expect(frames.size).toBe(0);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("does not restart audio or save after destruction", async () => {
    const player = await start();
    player.canvas.dispatchEvent(new PointerEvent("pointerdown"));
    expect(audioCreated).toHaveBeenCalledTimes(1);
    player.destroy();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyX" }));
    expect(player.save()).toBe(false);
    expect(player.load()).toBe(false);
    expect(audioClosed).toHaveBeenCalledTimes(1);
    expect(harness.core._gba_save_state).not.toHaveBeenCalled();
  });

  it.each(["rejected-rom", "canvas", "init"])("releases the core after startup failure: %s", async (failure) => {
    if (failure === "rejected-rom") harness.core._gba_load_rom.mockReturnValue(0);
    if (failure === "canvas") HTMLCanvasElement.prototype.getContext.mockReturnValue(null);
    if (failure === "init") harness.core._gba_init.mockReturnValue(0);
    await expect(start()).rejects.toThrow();
    expect(harness.core._gba_destroy).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it("frees save memory when browser storage rejects the write", async () => {
    const player = await start();
    vi.stubGlobal("localStorage", { setItem() { throw new Error("quota"); }, clear() {} });
    harness.core._free.mockClear();
    expect(() => player.save()).toThrow("quota");
    expect(harness.core._free).toHaveBeenCalledTimes(1);
    player.destroy();
  });

  it("frees load memory when the core rejects a state with an exception", async () => {
    const player = await start();
    localStorage.setItem("test-state", btoa("save"));
    harness.core._gba_load_state.mockImplementation(() => { throw new Error("invalid state"); });
    harness.core._free.mockClear();
    expect(() => player.load()).toThrow("invalid state");
    expect(harness.core._free).toHaveBeenCalledTimes(1);
    player.destroy();
  });
});
