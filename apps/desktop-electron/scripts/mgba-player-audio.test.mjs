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
