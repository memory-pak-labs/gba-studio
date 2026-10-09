import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import createMGBA from "../static/WebPlayer/player/mgba-core.mjs";
import { planEmulationFrames, planPcmBufferSchedule } from "../static/WebPlayer/player/mgba-direct-player.mjs";
import { createSmokeGbaRom } from "./lib/smoke-gba-rom.mjs";

const frameSeconds = 280896 / 16777216;
let core;
function loadRom() {
  const rom = createSmokeGbaRom();
  const pointer = core._malloc(rom.length);
  try {
    core.HEAPU8.set(rom, pointer);
    expect(core._gba_load_rom(pointer, rom.length)).toBe(1);
  } finally { core._free(pointer); }
}
function capture(frames) {
  let samples = 0;
  for (let frame = 0; frame < frames; frame++) {
    core._gba_run_frame();
    samples += core._gba_audio_sample_count();
  }
  return samples / core._gba_audio_sample_rate();
}
beforeEach(async () => {
  const wasm = await readFile(new URL("../static/WebPlayer/player/mgba-core.wasm", import.meta.url));
  core = await createMGBA({ print() {}, printErr() {}, instantiateWasm(imports, receive) {
    const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm), imports);
    receive(instance); return instance.exports;
  } });
  expect(core._gba_init()).toBe(1);
  loadRom();
});
afterEach(() => core?._gba_destroy());

describe("bundled mGBA audio clock (real WASM and bootable cartridge)", () => {
  it.each(["boot", "reset", "state", "reload"])("matches emulated time after %s", (operation) => {
    capture(60);
    if (operation === "reset") core._gba_reset();
    if (operation === "reload") loadRom();
    if (operation === "state") {
      const size = core._gba_state_size(), pointer = core._malloc(size);
      try {
        expect(core._gba_save_state(pointer, size)).toBe(1);
        capture(30);
        expect(core._gba_load_state(pointer, size)).toBe(1);
        expect(core._gba_audio_sample_count()).toBe(0);
      } finally { core._free(pointer); }
    }
    // Warm up the partial first video/audio block after a lifecycle boundary.
    capture(4);
    const duration = capture(600);
    expect(Math.abs(duration - 600 * frameSeconds)).toBeLessThan(0.005);
  });

  it("keeps the player queue bounded for 30 seconds at a 60 Hz presentation cadence", () => {
    let accumulatorMs = frameSeconds * 1000, nextAudioTime = 0, maxQueuedSeconds = 0;
    for (let tick = 0; tick < 1800; tick++) {
      const now = tick / 60;
      const plan = planEmulationFrames({ accumulatorMs, elapsedMs: 1000 / 60 });
      accumulatorMs = plan.accumulatorMs;
      for (let frame = 0; frame < plan.framesToRun; frame++) {
        core._gba_run_frame();
        nextAudioTime = planPcmBufferSchedule({ currentTime: now, nextAudioTime }).nextAudioTime;
        nextAudioTime += core._gba_audio_sample_count() / core._gba_audio_sample_rate();
        maxQueuedSeconds = Math.max(maxQueuedSeconds, nextAudioTime - now);
      }
    }
    expect(maxQueuedSeconds).toBeLessThan(0.15);
  });
});
