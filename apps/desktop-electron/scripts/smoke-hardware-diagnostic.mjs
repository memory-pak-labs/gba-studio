import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { analyzePcmSamples, copyModuleSavedata, restoreModuleSavedata } from '../static/WebPlayer/player/mgba-direct-player.mjs';
import { encodePngRgba } from './lib/png-icons.mjs';
const [packArg, outputArg] = process.argv.slice(2);
assert.ok(packArg && outputArg, 'Usage: smoke-hardware-diagnostic.mjs PACK OUTPUT');
const pack = path.resolve(packArg), output = path.resolve(outputArg), app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = path.join(output, 'project'); fs.mkdirSync(project, { recursive: true });
for (const name of ['main.cpp', 'gbastudio_project.json']) fs.copyFileSync(path.join(app, '../../packages/GBAStudioEngine/examples/hardware_diagnostic', name), path.join(project, name));
const build = spawnSync('python3', [path.join(pack, 'tools/gbsbuild'), '--engine-pack', pack, '--project-dir', project], { encoding: 'utf8' });
fs.writeFileSync(path.join(output, 'build.log'), build.stdout + build.stderr); assert.equal(build.status, 0, build.stdout + build.stderr);
const rom = fs.readFileSync(path.join(project, 'build/hardware_diagnostic.gba'));
const nm = spawnSync(path.join(process.env.DEVKITARM ?? '/opt/devkitpro/devkitARM', 'bin/arm-none-eabi-nm'), ['-S', '-C', path.join(project, 'build/hardware_diagnostic.elf')], { encoding: 'utf8' }); assert.equal(nm.status, 0);
const symbol = nm.stdout.match(/^([\da-f]+) [\da-f]+ \w \(anonymous namespace\)::diagnostic_result$/m); assert.ok(symbol);
const address = parseInt(symbol[1], 16);
const wasm = new WebAssembly.Module(fs.readFileSync(path.join(app, 'static/WebPlayer/player/mgba-core.wasm')));
let core;
async function boot(save) {
  core = await createMGBA({ print() {}, printErr() {}, instantiateWasm(imports, done) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
  assert.equal(core._gba_init(), 1); const pointer = core._malloc(rom.length); core.HEAPU8.set(rom, pointer); assert.equal(core._gba_load_rom(pointer, rom.length), 1); core._free(pointer);
  if (save) assert.equal(restoreModuleSavedata(core, save), true);
  run(180);
}
const read = offset => (core._gba_audio_register(address + offset) | core._gba_audio_register(address + offset + 2) << 16) >>> 0;
function run(frames, keys = 0) { core._gba_set_keys(keys); for (let i = 0; i < frames; ++i) core._gba_run_frame(); }
const report = { ok: false, physicalTested: false, romSha256: createHash('sha256').update(rom).digest('hex'), audioPeak: 0 };
try {
  await boot(); assert.equal(read(0), 0x47534447);
  for (const key of [1,2,4,8,16,32,64,128,256,512]) { run(4, key); run(4); }
  assert.equal(read(8), 1023, 'all ten keys sampled');
  run(4, 256);
  for (let i = 0; i < 24; ++i) {
    run(1);
    const count = core._gba_audio_sample_count() * 2;
    const samples = new Int16Array(core.HEAPU8.buffer, core._gba_audio_samples(), count);
    report.audioPeak = Math.max(report.audioPeak, analyzePcmSamples(samples).peak);
  }
  assert.ok(report.audioPeak > 0, 'tone reaches the native audio output');
  run(4, 9); run(12); assert.equal(read(16), 1); assert.equal(read(20), 1);
  const save = copyModuleSavedata(core); assert.ok(save?.length);
  const pixels = core.HEAPU8.slice(core._gba_framebuffer(), core._gba_framebuffer() + 153600);
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  fs.writeFileSync(path.join(output, 'diagnostic.png'), encodePngRgba({ width: 240, height: 160, pixels }));
  core._gba_destroy(); core = null; await boot(save); assert.equal(read(20), 1, 'save verified after emulator reboot');
  report.ok = true;
} finally { if (core) core._gba_destroy(); fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2)); }
console.log('PASS: hardware diagnostic ROM boots, ten keys, native audio and save across emulator reboot; physical test pending');
