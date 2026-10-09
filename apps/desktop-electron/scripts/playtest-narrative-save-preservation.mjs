import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import createMGBA from "../static/WebPlayer/player/mgba-core.mjs";
import { copyModuleSavedata, readRuntimeTelemetry, restoreModuleSavedata } from "../static/WebPlayer/player/mgba-direct-player.mjs";
import { encodePngRgba } from "./lib/png-icons.mjs";

const [romPath, savePath, output, expectedRuntime] = process.argv.slice(2);
assert.ok(romPath && savePath && output && expectedRuntime, "usage: node scripts/playtest-narrative-save-preservation.mjs ROM SAVE OUTPUT EXPECTED_RUNTIME");
mkdirSync(output, { recursive: true });
const rom = readFileSync(romPath);
const savedata = readFileSync(savePath);
const wasm = readFileSync(new URL("../static/WebPlayer/player/mgba-core.wasm", import.meta.url));
const core = await createMGBA({
  print: () => {}, printErr: () => {},
  instantiateWasm(imports, receive) {
    const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm), imports);
    receive(instance);
    return instance.exports;
  }
});
const checksum = bytes => createHash("sha256").update(bytes).digest("hex");
let passed = false;
let state;
let after;
try {
  assert.equal(core._gba_init(), 1);
  const pointer = core._malloc(rom.length);
  core.HEAPU8.set(rom, pointer);
  assert.equal(core._gba_load_rom(pointer, rom.length), 1);
  core._free(pointer);
  assert.equal(restoreModuleSavedata(core, savedata), true);
  core._gba_set_keys(0);
  for (let frame = 0; frame < 1000; frame++) core._gba_run_frame();
  state = readRuntimeTelemetry(core);
  after = copyModuleSavedata(core);
  writeFileSync(path.join(output, "frame.png"), encodePngRgba({ width: 240, height: 160,
    pixels: core.HEAPU8.slice(core._gba_framebuffer(), core._gba_framebuffer() + 240 * 160 * 4) }));
  assert.equal(state?.runtimeKind, Number(expectedRuntime), "fixture reaches its narrative runtime");
  assert.equal(checksum(after), checksum(savedata), "entering a mixed narrative scene preserves the full existing battery data");
  passed = true;
  console.log("PASS: narrative entry preserves existing campaign save");
} finally {
  writeFileSync(path.join(output, "result.json"), JSON.stringify({
    passed, state, romSha256: checksum(rom), beforeSha256: checksum(savedata),
    afterSha256: after ? checksum(after) : null,
    scope: "A fixture starts in the narrative scene. This is not a complete campaign playthrough."
  }, null, 2) + "\n");
  core._gba_destroy();
}
