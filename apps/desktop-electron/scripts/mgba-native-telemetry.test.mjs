import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import createMGBA from "../static/WebPlayer/player/mgba-core.mjs";
import { readRuntimeTelemetry } from "../static/WebPlayer/player/mgba-direct-player.mjs";

// Authored ARM fixture: copy 100 words into EWRAM, then loop. It exercises the
// actual mGBA bus and bridge without relying on an emulator-memory mock.
function telemetryRom(address, words) {
  const rom = Buffer.alloc(1024);
  rom.writeUInt32LE(0xea00002e, 0);
  rom.write("TELEMETRY", 0xa0);
  rom.write("TEST01", 0xac);
  rom[0xb2] = 0x96;
  const instructions = [0xe59f0018, 0xe28f1018, 0xe3a02064, 0xe4913004,
    0xe4803004, 0xe2522001, 0x1afffffb, 0xeafffffe, address];
  instructions.forEach((word, index) => rom.writeUInt32LE(word >>> 0, 0xc0 + index * 4));
  words.forEach((word, index) => rom.writeUInt32LE(word >>> 0, 0xe4 + index * 4));
  let checksum = 0;
  for (let i = 0xa0; i <= 0xbc; ++i) checksum -= rom[i];
  rom[0xbd] = (checksum - 0x19) & 255;
  return rom;
}

let wasm;
beforeAll(async () => {
  wasm = new WebAssembly.Module(await readFile(new URL("../static/WebPlayer/player/mgba-core.wasm", import.meta.url)));
});

async function boot(address, words) {
  const core = await createMGBA({ instantiateWasm(imports, done) {
    const instance = new WebAssembly.Instance(wasm, imports);
    done(instance);
    return instance.exports;
  } });
  try {
    expect(typeof core._gba_runtime_telemetry_snapshot).toBe("function");
    expect(core._gba_init()).toBe(1);
    const rom = telemetryRom(address, words);
    const pointer = core._malloc(rom.length);
    try {
      core.HEAPU8.set(rom, pointer);
      expect(core._gba_load_rom(pointer, rom.length)).toBe(1);
    } finally { core._free(pointer); }
    expect(core._gba_runtime_telemetry_snapshot()).toBe(0);
    core._gba_run_frame();
    return core;
  } catch (error) {
    core._gba_destroy();
    throw error;
  }
}

describe("compiled mGBA telemetry snapshot", () => {
  it.each([[2, 50], [3, 59], [4, 64]])("copies schema %s through the real GBA bus", async (schema, count) => {
    const words = Uint32Array.from({ length: 100 }, (_, index) => index + 100);
    words.set([0x47535452, schema, count, 42]);
    if (schema === 4) {
      words.set([0x47535046, 1, 16, 42, 262144, 31, 10, 20, 30, 40, 50, 11, 22, 33, 44, 55], 64);
      words.set([0x47534554, 1, 20, 1, 0x08000100, 42, 7 | (3 << 16), 4 | (12 << 16)], 80);
    }
    const core = await boot(0x02000100, words);
    try {
      const pointer = core._gba_runtime_telemetry_snapshot();
      expect(pointer).toBeGreaterThan(0);
      const snapshot = new Uint32Array(core.HEAPU8.buffer, pointer, 100).slice();
      expect(Array.from(snapshot.subarray(0, count))).toEqual(Array.from(words.subarray(0, count)));
      expect(Array.from(snapshot.subarray(count))).toEqual(schema === 4
        ? Array.from(words.subarray(count)) : Array(100 - count).fill(0));
      for (let i = 0; i < count; ++i) expect(core._gba_runtime_telemetry_word(i)).toBe(snapshot[i]);
      const state = readRuntimeTelemetry(core);
      expect(readRuntimeTelemetry({
        HEAPU8: core.HEAPU8,
        _gba_find_runtime_telemetry: core._gba_find_runtime_telemetry,
        _gba_runtime_telemetry_word: core._gba_runtime_telemetry_word,
        _gba_audio_register: core._gba_audio_register
      })).toEqual(state);
      expect(state.frame).toBe(42);
      if (schema === 4) {
        expect(state.subsystems.frameTicks.render).toBe(30);
        expect(state.eventTrace.entries[0].waitFrames).toBe(12);
      }
      // Reading a snapshot must not advance the game or alter its diagnostic data.
      expect(readRuntimeTelemetry(core)).toEqual(state);
    } finally { core._gba_destroy(); }
  });

  it("does not read extensions beyond the end of EWRAM", async () => {
    const words = new Uint32Array(100);
    words.set([0x47535452, 4, 64, 7]);
    const core = await boot(0x0203ff00, words);
    try {
      const state = readRuntimeTelemetry(core);
      expect(state).toMatchObject({ frame: 7, subsystems: null, eventTrace: null });
    } finally { core._gba_destroy(); }
  });
});
