// Measure gameplay updates against emulated GBA VBlanks, independent of host speed.
// Usage: node scripts/verify-play-rom-cadence.mjs ROM_DIR REPORT_JSON [minimum_fps]
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { readRuntimeTelemetry } from '../static/WebPlayer/player/mgba-direct-player.mjs';

const [romDir, output, minimumArg = '59'] = process.argv.slice(2);
if (!romDir || !output) throw new Error('Provide ROM_DIR with manifest.json and REPORT_JSON');
const minimumFps = Number(minimumArg);
assert.ok(Number.isFinite(minimumFps) && minimumFps >= 0 && minimumFps <= 59.7275);
const wasm = await readFile(new URL('../static/WebPlayer/player/mgba-core.wasm', import.meta.url));
const core = await createMGBA({
  print() {}, printErr() {},
  instantiateWasm(imports, receive) {
    const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm), imports);
    receive(instance);
    return instance.exports;
  }
});
assert.equal(core._gba_init(), 1);
const results = [];
const failures = [];
try {
  for (const row of JSON.parse(await readFile(romDir + '/manifest.json', 'utf8'))) {
    const rom = await readFile(romDir + '/' + row.scene + '.gba');
    const pointer = core._malloc(rom.length);
    core.HEAPU8.set(rom, pointer);
    assert.equal(core._gba_load_rom(pointer, rom.length), 1);
    core._free(pointer);
    core._gba_set_keys(0);
    for (let frame = 0; frame < 600; frame++) core._gba_run_frame();
    const samples = [];
    for (const [phase, keys] of [['idle', 0], ['right', 16], ['left', 32], ['button-a', 1]]) {
      const before = readRuntimeTelemetry(core);
      assert.ok(before && Number.isFinite(before.frame), 'ROM must publish runtime telemetry');
      const trace = [];
      core._gba_set_keys(keys);
      for (let frame = 0; frame < 300; frame++) {
        core._gba_run_frame();
        if (frame % 10 === 9) trace.push(readRuntimeTelemetry(core));
      }
      const after = readRuntimeTelemetry(core);
      const updates = after.frame - before.frame;
      const updatesPerSecond = updates / 300 * 59.7275;
      const passed = updatesPerSecond >= minimumFps;
      if (!passed) failures.push(row.scene + '/' + phase + ': ' + updatesPerSecond.toFixed(2) + ' fps');
      samples.push({ phase, keys, emulatorFrames: 300, updates, updatesPerSecond, passed, before, after, trace });
    }
    results.push({
      scene: row.scene, runtime: row.runtime,
      romSha256: createHash('sha256').update(rom).digest('hex'), samples
    });
    console.log(row.scene + ': ' + samples.map(s => s.phase + '=' + s.updatesPerSecond.toFixed(2)).join(', '));
  }
} finally {
  core._gba_destroy();
  await writeFile(output, JSON.stringify({ minimumFps, failures, results }, null, 2) + '\n');
}
assert.deepEqual(failures, [], 'Gameplay cadence is below the requested threshold');
