import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { copyModuleSavedata, readRuntimeTelemetry, restoreModuleSavedata } from '../static/WebPlayer/player/mgba-direct-player.mjs';
import { encodePngRgba } from './lib/png-icons.mjs';

const [packArg, outputArg] = process.argv.slice(2);
assert.ok(packArg && outputArg, 'Usage: smoke-map-states.mjs ENGINE_PACK OUTPUT');
const pack = path.resolve(packArg), output = path.resolve(outputArg);
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = path.resolve(app, '../../packages/GBAStudioEngine');
fs.mkdirSync(output, { recursive: true });
function command(bin, args, log, env = process.env) {
  const result = spawnSync(bin, args, { cwd: app, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  fs.writeFileSync(log, (result.stdout ?? '') + (result.stderr ?? ''));
  assert.equal(result.status, 0, `${bin} failed; see ${log}`);
}
command(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'src/main/mapStatesRomFixture.test.ts'], path.join(output, 'export.log'), { ...process.env, GBA_STUDIO_MAP_STATE_FIXTURE_ROOT: output });
const wasm = new WebAssembly.Module(fs.readFileSync(path.join(app, 'static/WebPlayer/player/mgba-core.wasm')));
for (const mode of ['resident', 'paged', 'platformer']) {
  const directory = path.join(output, mode); fs.mkdirSync(directory, { recursive: true });
  command('python3', [path.join(engine, 'tests/host/map_state_rom_fixture.py'), pack, directory, path.join(output, mode === 'platformer' ? 'platformer.json' : 'topdown.json'), '--mode', mode], path.join(directory, 'fixture.log'));
  command('python3', [path.join(pack, 'tools/gbsbuild'), '--engine-pack', pack, '--project-dir', directory], path.join(directory, 'build.log'));
  const rom = fs.readFileSync(path.join(directory, 'build/replace_tile.gba'));
  const report = { ok: false, mode, romSha256: createHash('sha256').update(rom).digest('hex'), samples: [], inputs: [] };
  const nm = spawnSync(path.join(process.env.DEVKITARM ?? '/opt/devkitpro/devkitARM', 'bin/arm-none-eabi-nm'), ['-S', '-C', path.join(directory, 'build/replace_tile.elf')], { encoding: 'utf8' });
  assert.equal(nm.status, 0);
  const profilerStorage = nm.stdout.match(/^[\da-f]+ ([\da-f]+) b gbs::\(anonymous namespace\)::s_subsystems$/m);
  assert.ok(profilerStorage, 'compact native subsystem profiler is linked');
  report.nativeProfilerStateBytes = parseInt(profilerStorage[1], 16);
  assert.ok(report.nativeProfilerStateBytes <= 128, 'native profiler stays within its RAM budget');
  assert.ok(!nm.stdout.includes('gbs::(anonymous namespace)::s_regions'), 'automatic profiling does not pull in the optional label registry');
  const camera = nm.stdout.split('\n').map(line => line.match(/^([\da-f]+) [\da-f]+ \w \(anonymous namespace\)::camera$/)).find(Boolean);
  assert.ok(camera);
  const cameraAddress = parseInt(camera[1], 16);
  let core;
  async function boot(save) {
    core = await createMGBA({ print: () => {}, printErr: () => {}, instantiateWasm(imports, done) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
    assert.equal(core._gba_init(), 1);
    const pointer = core._malloc(rom.length); core.HEAPU8.set(rom, pointer);
    assert.equal(core._gba_load_rom(pointer, rom.length), 1); core._free(pointer);
    if (save) assert.equal(restoreModuleSavedata(core, save), true);
    run(180);
  }
  const state = () => readRuntimeTelemetry(core);
  const read32 = address => (core._gba_audio_register(address) | core._gba_audio_register(address + 2) << 16) | 0;
  function run(frames, keys = 0) { report.inputs.push({ frames, keys }); core._gba_set_keys(keys); for (let i = 0; i < frames; ++i) core._gba_run_frame(); }
  function tap(keys) {
    const before = state().frame;
    for (let i = 0; i < 240; ++i) {
      run(1, keys);
      if (state().frame > before && (state().input.held & keys) === keys) break;
    }
    assert.equal(state().input.held & keys, keys, 'the runtime sampled the requested button');
    const sampled = state().frame;
    for (let i = 0; i < 240; ++i) {
      run(1);
      if (state().frame >= sampled + 12 && state().input.held === 0) break;
    }
  }
  function capture(label, open, room = 0) {
    const runtime = state(); assert.ok(runtime); assert.equal(runtime.currentRoom, room);
    const pixels = core.HEAPU8.slice(core._gba_framebuffer(), core._gba_framebuffer() + 153600);
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
    const x = 96 - read32(cameraAddress), y = 96 - read32(cameraAddress + 4);
    assert.ok(x >= 0 && x < 240 && y >= 0 && y < 160);
    const expected = open ? [0, 198, 33, 255] : [231, 8, 8, 255];
    for (let dy = 0; dy < 8; ++dy) for (let dx = 0; dx < 8; ++dx) {
      const at = ((y + dy) * 240 + x + dx) * 4;
      assert.deepEqual([...pixels.slice(at, at + 4)], expected, `${mode}/${label}: tile pixels`);
    }
    report.samples.push({ label, runtime });
    fs.writeFileSync(path.join(directory, label + '.png'), encodePngRgba({ width: 240, height: 160, pixels }));
  }
  function blocked() { const x = state().player.x; run(32, 16); run(2); assert.equal(state().player.x, x, 'closed collision blocks the player'); }
  function cross() {
    const start = state().player.x;
    function moveTo(target) {
      for (let i = 0; i < 600 && state().player.x !== target; ++i) run(1, state().player.x < target ? 16 : 32);
      run(2);
      assert.equal(state().player.x, target, 'restored free collision permits crossing and returning');
    }
    moveTo(start + 48); moveTo(start);
  }

  try {
    await boot(); capture('initial', false); blocked();
    tap(1); capture('opened', true); assert.equal(state().variables[0], 1); cross();
    tap(2); const save = copyModuleSavedata(core); assert.ok(save?.length);
    tap(512); capture('closed-after-save', false); assert.equal(state().variables[0], 0); blocked();
    tap(4); capture('loaded', true); assert.equal(state().variables[0], 1); cross();
    tap(256); capture('other-room', false, 1);
    tap(256); capture('returned', true); cross();
    run(1500);
    const profiler = state().subsystems;
    assert.ok(profiler?.scenePeakTicks.render > 0, 'native rendering is measured after more than 16 frames');
    assert.ok(profiler.scenePeakTicks.scripts > 0, 'native scripts are measured');
    assert.ok(profiler.scenePeakTicks.audio > 0, 'native audio is measured');
    assert.ok(profiler.scenePeakTicks.interrupts > 0, 'native interrupts are measured');
    core._gba_destroy(); core = null;
    await boot(save); capture('rebooted-save', true); assert.equal(state().variables[0], 1); cross();
    report.ok = true;
  } catch (error) { report.error = String(error); throw error; }
  finally { if (core) { report.finalState = state(); core._gba_destroy(); } fs.writeFileSync(path.join(directory, 'verification.json'), JSON.stringify(report, null, 2)); }
  console.log(`PASS ${mode}: editor export, visual/collision state, scene revisit, SRAM reload/reboot and native profiler`);
}
