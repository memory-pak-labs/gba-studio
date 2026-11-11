import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { readRuntimeTelemetry } from '../static/WebPlayer/player/mgba-direct-player.mjs';
import { createNativeAudioRecorder } from './lib/native-audio-recorder.mjs';

// Use a QA export starting in the scene under test with sixteen sustained voices.
const [romArg, outputArg] = process.argv.slice(2);
assert.ok(romArg && outputArg, 'usage: node scripts/verify-scene-tracker-cadence.mjs ROM OUTPUT');
const output = path.resolve(outputArg), rom = fs.readFileSync(path.resolve(romArg));
fs.mkdirSync(output, { recursive: true });
const wasm = new WebAssembly.Module(fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm', import.meta.url)));
const core = await createMGBA({ print() {}, printErr() {}, instantiateWasm(imports, done) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
const evidence = { passed: false, romPath: path.resolve(romArg), romSha256: createHash('sha256').update(rom).digest('hex'), windows: [] };
try {
  assert.equal(core._gba_init(), 1);
  const pointer = core._malloc(rom.length);
  try { core.HEAPU8.set(rom, pointer); assert.equal(core._gba_load_rom(pointer, rom.length), 1); } finally { core._free(pointer); }
  for (let i = 0; i < 180; ++i) core._gba_run_frame();
  const recorder = createNativeAudioRecorder(core, output); recorder.select('scene-16-channels');
  for (const [name, keys] of [['idle', 0], ['right', 16], ['stop', 0]]) {
    core._gba_set_keys(keys);
    const start = readRuntimeTelemetry(core), samples = [];
    assert.ok(start, 'runtime telemetry is present');
    for (let i = 0; i < 240; ++i) {
      core._gba_run_frame(); recorder.frame();
      const telemetry = readRuntimeTelemetry(core);
      assert.equal(telemetry.audio.activeVoiceCount, 16, 'all sixteen voices stay active');
      assert.equal(telemetry.audio.pcmUnderrunCount, 0, 'no audio underruns');
      assert.equal(core._gba_audio_register(0x04000204), 0x4317, 'cartridge timing remains configured');
      if (i % 30 === 29) samples.push(telemetry);
    }
    const end = readRuntimeTelemetry(core), updates = end.frame - start.frame;
    evidence.windows.push({ name, videoFrames: 240, gameUpdates: updates, start, end, samples });
    assert.equal(end.currentRoom, start.currentRoom, 'measurement stays in the selected scene');
    assert.ok(updates >= 117, `${name}: at least 98% of the 30 Hz game cadence (${updates}/240)`);
  }
  evidence.wav = recorder.stop();
  evidence.passed = true;
  console.log(JSON.stringify(evidence.windows.map(({ name, gameUpdates }) => ({ name, gameUpdates, videoFrames: 240 }))));
} finally {
  core._gba_destroy();
  fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
}
