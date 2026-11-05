import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import createMGBA from "../static/WebPlayer/player/mgba-core.mjs";
import * as player from "../static/WebPlayer/player/mgba-direct-player.mjs";

// Authored ARM code evolves a pseudo-random value and counter in EWRAM from
// KEYINPUT. It also initializes SRAM. No external game or ROM is used.
function stateRom() {
  const rom = Buffer.alloc(1024);
  rom.writeUInt32LE(0xea00002e, 0);
  rom.write("REPLAYSTATE", 0xa0);
  rom.write("TEST01", 0xac);
  rom[0xb2] = 0x96;
  [0xe59f0030, 0xe59f1030, 0xe59f5030, 0xe3a02001, 0xe5c52000,
    0xe3a04000, 0xe1d130b0, 0xe0222003, 0xe0822082, 0xe2822011,
    0xe5802000, 0xe2844001, 0xe5804004, 0xeafffff7,
    0x02000100, 0x04000130, 0x0e000000
  ].forEach((word, index) => rom.writeUInt32LE(word >>> 0, 0xc0 + index * 4));
  rom.write("SRAM_V113", 0x300);
  let checksum = 0;
  for (let i = 0xa0; i <= 0xbc; i++) checksum -= rom[i];
  rom[0xbd] = (checksum - 0x19) & 255;
  return rom;
}

let wasm;
let coreSha256;
beforeAll(async () => {
  const bytes = await readFile(new URL("../static/WebPlayer/player/mgba-core.wasm", import.meta.url));
  coreSha256 = createHash("sha256").update(bytes).digest("hex");
  wasm = new WebAssembly.Module(bytes);
});
async function boot() {
  const core = await createMGBA({ instantiateWasm(imports, done) {
    const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports;
  } });
  expect(core._gba_init()).toBe(1);
  const rom = stateRom(), pointer = core._malloc(rom.length);
  try { core.HEAPU8.set(rom, pointer); expect(core._gba_load_rom(pointer, rom.length)).toBe(1); }
  finally { core._free(pointer); }
  return { core, identity: { romSha256: createHash("sha256").update(rom).digest("hex"), coreSha256 } };
}
function run(core, masks) {
  for (const mask of masks) { core._gba_set_keys(mask); core._gba_run_frame(); }
}
function words(core) {
  return [0, 4].map(offset => (core._gba_audio_register(0x02000100 + offset)
    | core._gba_audio_register(0x02000102 + offset) << 16) >>> 0);
}

describe("compiled mGBA replay initial state", () => {
  it("restores the exact CPU/RAM/RNG and battery point before replaying the same inputs", async () => {
    const { core, identity } = await boot();
    try {
      run(core, Array(17).fill(16));
      const start = words(core), battery = player.copyModuleSavedata(core);
      expect(start[1]).toBeGreaterThan(0);
      expect(battery.length).toBeGreaterThan(0);
      const snapshot = player.captureReplayInitialState(core, identity);
      expect(words(core)).toEqual(start); // capture itself must not run frames
      const route = [0, 1, 0, 32, 32, 0, 16, 0];
      run(core, route); const expected = words(core);
      player.restoreModuleSavedata(core, new Uint8Array(battery.length).fill(91));
      run(core, Array(23).fill(128));
      expect(words(core)).not.toEqual(start);
      player.restoreReplayInitialState(core, snapshot, identity);
      expect(words(core)).toEqual(start);
      expect(player.copyModuleSavedata(core)).toEqual(battery);
      run(core, route); expect(words(core)).toEqual(expected);
      const fresh = await boot();
      try {
        player.restoreReplayInitialState(fresh.core, snapshot, fresh.identity);
        expect(words(fresh.core)).toEqual(start);
        expect(player.copyModuleSavedata(fresh.core)).toEqual(battery);
        run(fresh.core, route); expect(words(fresh.core)).toEqual(expected);
      } finally { fresh.core._gba_destroy(); }
    } finally { core._gba_destroy(); }
  });

  it("rejects another ROM/core and malformed state instead of silently starting a different run", async () => {
    const { core, identity } = await boot();
    try {
      run(core, [0]);
      const snapshot = player.captureReplayInitialState(core, identity), before = words(core);
      expect(() => player.restoreReplayInitialState(core, snapshot, { ...identity, romSha256: "a".repeat(64) })).toThrow(/ROM/);
      expect(() => player.restoreReplayInitialState(core, snapshot, { ...identity, coreSha256: "b".repeat(64) })).toThrow(/core/);
      expect(() => player.restoreReplayInitialState(core, { ...snapshot, stateBase64: "AAAA" }, identity)).toThrow(/state|estado/);
      expect(words(core)).toEqual(before);
    } finally { core._gba_destroy(); }
  });
});
