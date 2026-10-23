// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ core: null }));
vi.mock("../static/WebPlayer/player/mgba-core.mjs", () => ({ default: async () => harness.core }));
import { startMGBAPlayer } from "../static/WebPlayer/player/mgba-direct-player.mjs";

let player, container, render, now, sources, audio;
beforeEach(async () => {
  now = 0; sources = [];
  container = document.createElement("div"); document.body.append(container);
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", vi.fn(callback => { render = callback; return 1; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    createImageData: () => ({ data: new Uint8ClampedArray(240 * 160 * 4) }), putImageData() {}
  });
  vi.stubGlobal("AudioContext", class {
    constructor() { audio = this; }
    state = "running";
    destination = {};
    get currentTime() { return now / 1000; }
    createGain() { return { gain: {}, connect() {} }; }
    createBuffer(channels, frames, sampleRate) {
      return { duration: frames / sampleRate, getChannelData: () => new Float32Array(frames) };
    }
    createBufferSource() {
      const source = { buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
      sources.push(source); return source;
    }
    close = vi.fn(async () => {});
  });
  harness.core = {
    HEAPU8: new Uint8Array(240 * 160 * 4 + 8192),
    _gba_init: () => 1, _malloc: () => 4096, _free() {}, _gba_load_rom: () => 1,
    _gba_destroy: vi.fn(), _gba_run_frame() {}, _gba_set_keys: vi.fn(), _gba_reset: vi.fn(),
    _gba_audio_sample_rate: () => 32768, _gba_audio_sample_count: () => 548, _gba_audio_samples: () => 0,
    _gba_framebuffer: () => 8192, _gba_find_runtime_telemetry: () => 0,
    _gba_load_state: vi.fn(() => 1)
  };
  player = await startMGBAPlayer({ container, romUrl: "test.gba", storageKey: "audio-test" });
  player.canvas.dispatchEvent(new PointerEvent("pointerdown"));
  now = 17; render(now);
  expect(sources.length).toBeGreaterThan(0);
});

describe("Play telemetry producer clock", () => {
  it("stamps the actual sample before asynchronous delivery, without advancing a preparation frame", async () => {
    player.destroy();
    now = 100;
    const stats = vi.fn();
    player = await startMGBAPlayer({ container, romUrl: "test.gba", storageKey: "clock-test", onFrameStats: stats });
    expect(stats).toHaveBeenCalledTimes(1);
    expect(stats.mock.calls[0][0]).toMatchObject({ presentationFps: 0, sampledAtUnixMs: performance.timeOrigin + 100 });
    now = 634;
    render(now);
    expect(stats).toHaveBeenCalledTimes(2);
    const produced = stats.mock.calls[1][0];
    expect(produced.sampledAtUnixMs).toBe(performance.timeOrigin + 634);
    now = 9000;
    expect(produced.sampledAtUnixMs).toBe(performance.timeOrigin + 634);
  });
});

describe("Play system keyboard shortcuts", () => {
  beforeEach(async () => {
    player.destroy();
    player = await startMGBAPlayer({ container, romUrl: "test.gba", keyboardBindings: { l: ["q"] } });
  });
  it.each(["metaKey", "ctrlKey", "altKey"])("does not capture a Q shortcut with %s", modifier => {
    const event = new KeyboardEvent("keydown", { code: "KeyQ", [modifier]: true, cancelable: true });
    window.dispatchEvent(event);
    now += 34; render(now);
    expect(event.defaultPrevented).toBe(false);
    expect(harness.core._gba_set_keys).toHaveBeenLastCalledWith(0);
  });

  it("releases a held game key even when a modifier is pressed before keyup", () => {
    const down = new KeyboardEvent("keydown", { code: "KeyQ", cancelable: true });
    window.dispatchEvent(down);
    now += 34; render(now);
    expect(down.defaultPrevented).toBe(true);
    expect(harness.core._gba_set_keys).toHaveBeenLastCalledWith(1 << 9);
    const up = new KeyboardEvent("keyup", { code: "KeyQ", metaKey: true, cancelable: true });
    window.dispatchEvent(up);
    now += 34; render(now);
    expect(up.defaultPrevented).toBe(false);
    expect(harness.core._gba_set_keys).toHaveBeenLastCalledWith(0);
  });

  it("preserves a standalone modifier configured as a game button", async () => {
    player.destroy();
    player = await startMGBAPlayer({ container, romUrl: "test.gba", keyboardBindings: { a: ["Alt"] } });
    const event = new KeyboardEvent("keydown", { code: "AltLeft", altKey: true, cancelable: true });
    window.dispatchEvent(event);
    now += 34; render(now);
    expect(event.defaultPrevented).toBe(true);
    expect(harness.core._gba_set_keys).toHaveBeenLastCalledWith(1);
  });

  it.each([["AltLeft", "altKey", 1], ["ControlLeft", "ctrlKey", 2]])(
    "keeps a configured %s game button usable together with movement", async (code, modifier, mask) => {
      player.destroy();
      player = await startMGBAPlayer({ container, romUrl: "test.gba",
        keyboardBindings: { a: ["Alt"], b: ["Control"], up: ["ArrowUp"] } });
      const button = new KeyboardEvent("keydown", { code, [modifier]: true, cancelable: true });
      const movement = new KeyboardEvent("keydown", { code: "ArrowUp", [modifier]: true, cancelable: true });
      window.dispatchEvent(button);
      window.dispatchEvent(movement);
      now += 34; render(now);
      expect(button.defaultPrevented).toBe(true);
      expect(movement.defaultPrevented).toBe(true);
      expect(harness.core._gba_set_keys).toHaveBeenLastCalledWith(mask | (1 << 6));
    }
  );
});
afterEach(() => {
  player?.destroy(); document.body.replaceChildren(); localStorage.clear();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("Play queued audio lifecycle", () => {
  it("starts the playback clock when the first PCM block is available", async () => {
    player.destroy();
    sources = [];
    player = await startMGBAPlayer({ container, romUrl: "test.gba", storageKey: "audio-test" });
    player.canvas.dispatchEvent(new PointerEvent("pointerdown"));
    now += 1000; // A cold core can take time before it produces its first block.
    render(now);
    expect(player.inspectAudio().audioUnderrunCount).toBe(0);
    expect(sources[0].start.mock.calls[0][0]).toBeCloseTo(audio.currentTime + 0.08, 5);
  });

  it("still counts a real playback gap when the user presses another game key", () => {
    now += 1000;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyX" }));
    render(now);
    expect(player.inspectAudio().audioUnderrunCount).toBe(1);
  });

  it("schedules the first block after cold WebAudio buffer allocation", async () => {
    player.destroy();
    sources = [];
    player = await startMGBAPlayer({ container, romUrl: "test.gba", storageKey: "audio-test" });
    player.canvas.dispatchEvent(new PointerEvent("pointerdown"));
    const createBuffer = audio.createBuffer.bind(audio);
    vi.spyOn(audio, "createBuffer").mockImplementationOnce((...args) => {
      now += 250;
      return createBuffer(...args);
    });
    now += 17;
    render(now);
    expect(sources[0].start.mock.calls[0][0]).toBeCloseTo(audio.currentTime + 0.08, 5);
    expect(player.inspectAudio().audioUnderrunCount).toBe(0);
  });

  it("reports the pending audio duration", () => {
    expect(player.inspectAudio().queuedAudioSeconds).toBeGreaterThan(0);
    expect(player.inspectAudio().queuedAudioSeconds).toBeLessThan(0.15);
    expect(player.inspectAudio().maxQueuedAudioSeconds).toBeGreaterThan(0);
  });
  it.each(["reset", "load"])("discards old scheduled sound on successful %s", operation => {
    const pending = [...sources];
    localStorage.setItem("audio-test", btoa("snapshot"));
    player[operation]();
    expect(player.inspectAudio().queuedAudioSeconds).toBe(0);
    for (const source of pending) {
      expect(source.stop).toHaveBeenCalledTimes(1);
      expect(source.disconnect).toHaveBeenCalledTimes(1);
    }
    now += 17; render(now);
    expect(sources.at(-1).start.mock.calls[0][0]).toBeCloseTo(audio.currentTime + 0.08, 5);
  });
  it("preserves scheduled sound when state loading fails", () => {
    localStorage.setItem("audio-test", btoa("snapshot"));
    harness.core._gba_load_state.mockReturnValue(0);
    expect(player.load()).toBe(false);
    for (const source of sources) expect(source.stop).not.toHaveBeenCalled();
  });
  it("disconnects completed buffers and cancels only remaining ones on destroy", () => {
    const first = sources[0];
    expect(first.onended).toBeTypeOf("function");
    first.onended();
    expect(first.disconnect).toHaveBeenCalledTimes(1);
    player.destroy(); player.destroy();
    expect(first.stop).not.toHaveBeenCalled();
    for (const source of sources.slice(1)) expect(source.stop).toHaveBeenCalledTimes(1);
    expect(audio.close).toHaveBeenCalledTimes(1);
  });
});

describe("Play snapshot binary serialization", () => {
  const snapshot = Uint8Array.from({ length: 512 * 1024 + 7 }, (_, i) => (i * 37) & 255);
  beforeEach(() => {
    harness.core.HEAPU8 = new Uint8Array(1024 * 1024);
    harness.core._gba_state_size = () => snapshot.length;
    harness.core._gba_save_state = (pointer) => { harness.core.HEAPU8.set(snapshot, pointer); return 1; };
  });
  it("uses the native bounded byte encoder without a large JS argument spread", () => {
    const old = Object.getOwnPropertyDescriptor(Uint8Array.prototype, "toBase64");
    const encode = vi.fn(function () { return Buffer.from(this.buffer, this.byteOffset, this.byteLength).toString("base64"); });
    Object.defineProperty(Uint8Array.prototype, "toBase64", { configurable: true, value: encode });
    vi.stubGlobal("btoa", () => { throw Error("slow JS encoding path"); });
    try {
      expect(player.save()).toBe(true);
      expect(encode).toHaveBeenCalledOnce();
      expect(localStorage.getItem("audio-test")).toBe(Buffer.from(snapshot).toString("base64"));
    } finally {
      if (old) Object.defineProperty(Uint8Array.prototype, "toBase64", old);
      else delete Uint8Array.prototype.toBase64;
    }
  });
  it("uses the native decoder and restores the exact snapshot bytes", () => {
    const old = Object.getOwnPropertyDescriptor(Uint8Array, "fromBase64");
    const decode = vi.fn(value => Uint8Array.from(Buffer.from(value, "base64")));
    Object.defineProperty(Uint8Array, "fromBase64", { configurable: true, value: decode });
    localStorage.setItem("audio-test", Buffer.from(snapshot).toString("base64"));
    vi.stubGlobal("atob", () => { throw Error("slow JS decoding path"); });
    try {
      expect(player.load()).toBe(true);
      expect(decode).toHaveBeenCalledOnce();
      expect(harness.core.HEAPU8.slice(4096, 4096 + snapshot.length)).toEqual(snapshot);
    } finally {
      if (old) Object.defineProperty(Uint8Array, "fromBase64", old);
      else delete Uint8Array.fromBase64;
    }
  });
  it("round-trips bytes through the existing browser fallback", () => {
    const encode = Object.getOwnPropertyDescriptor(Uint8Array.prototype, "toBase64");
    const decode = Object.getOwnPropertyDescriptor(Uint8Array, "fromBase64");
    Object.defineProperty(Uint8Array.prototype, "toBase64", { configurable: true, value: undefined });
    Object.defineProperty(Uint8Array, "fromBase64", { configurable: true, value: undefined });
    try {
      expect(player.save()).toBe(true);
      harness.core.HEAPU8.fill(0, 4096, 4096 + snapshot.length);
      expect(player.load()).toBe(true);
      expect(harness.core.HEAPU8.slice(4096, 4096 + snapshot.length)).toEqual(snapshot);
    } finally {
      if (encode) Object.defineProperty(Uint8Array.prototype, "toBase64", encode);
      else delete Uint8Array.prototype.toBase64;
      if (decode) Object.defineProperty(Uint8Array, "fromBase64", decode);
      else delete Uint8Array.fromBase64;
    }
  });
});
