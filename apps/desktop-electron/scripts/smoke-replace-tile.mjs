// Generate through assetc, compile the packaged runtime, then drive only GBA buttons.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {encodePngRgba} from './lib/png-icons.mjs';

const [packArg, outputArg, modeArg] = process.argv.slice(2);
assert.ok(packArg && outputArg, 'Usage: smoke-replace-tile.mjs ENGINE_PACK OUTPUT [MODE]');
const pack = path.resolve(packArg), output = path.resolve(outputArg);
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = path.resolve(app, '../../packages/GBAStudioEngine');
const python = process.env.PYTHON ?? 'python3';
const armBin = path.join(process.env.DEVKITARM ?? '/opt/devkitpro/devkitARM', 'bin');
const wasm = new WebAssembly.Module(fs.readFileSync(path.join(app, 'static/WebPlayer/player/mgba-core.wasm')));
const modes = modeArg ? [modeArg] : ['tiled', 'resident', 'paged', 'paged-large', 'platformer', 'resident-keep'];

function command(bin, args, log) {
  const result = spawnSync(bin, args, {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
  fs.writeFileSync(log, (result.stdout ?? '') + (result.stderr ?? ''));
  assert.equal(result.status, 0, `${bin}: ${result.stderr ?? result.error ?? ''} (see ${log})`);
}

for (const name of modes) {
  const dir = path.join(output, name);
  fs.mkdirSync(dir, {recursive: true});
  const mode = name.replace('-keep', '');
  command(python, [path.join(engine, 'tests/host/replace_tile_rom_fixture.py'), pack, dir, '--mode', mode,
    ...(name.endsWith('-keep') ? ['--keep-collision'] : [])], path.join(dir, 'fixture.log'));
  command(python, [path.join(pack, 'tools/gbsbuild'), '--engine-pack', pack, '--project-dir', dir], path.join(dir, 'build.log'));
  const fixture = JSON.parse(fs.readFileSync(path.join(dir, 'replace-tile-fixture.json')));
  const rom = fs.readFileSync(path.join(dir, 'build/replace_tile.gba'));
  const nm = spawnSync(path.join(armBin, 'arm-none-eabi-nm'), ['-S', '-C', path.join(dir, 'build/replace_tile.elf')], {encoding:'utf8'});
  assert.equal(nm.status, 0);
  const camera = nm.stdout.split('\n').map(line => line.match(/^([\da-f]+) [\da-f]+ \w \(anonymous namespace\)::camera$/)).find(Boolean);
  assert.ok(camera, 'read-only camera oracle in ELF');
  const cameraAddress = parseInt(camera[1], 16);
  const report = {ok: false, mode: name, romSha256: createHash('sha256').update(rom).digest('hex'), inputs: [], samples: []};
  const core = await createMGBA({print:()=>{}, printErr:()=>{}, instantiateWasm(imports, done) {
    const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports;
  }});
  const state = () => readRuntimeTelemetry(core);
  const read32 = address => (core._gba_audio_register(address) | (core._gba_audio_register(address + 2) << 16)) | 0;
  function run(frames, keys = 0) {
    report.inputs.push({frames, keys});
    core._gba_set_keys(keys);
    for (let i = 0; i < frames; ++i) core._gba_run_frame();
  }
  function tapA() { run(2, 1); run(18); }
  function moveToX(target) {
    // Uploads may span emulated display frames. Stop by the observed game
    // position instead of assuming every display frame advances movement.
    const limit = Math.abs(state().player.x - target) * 8 + 120;
    for (let i = 0; i < limit && state().player.x !== target; ++i)
      run(1, state().player.x < target ? 16 : 32);
    run(2);
    assert.equal(state().player.x, target, 'movement reaches the requested position');
  }
  function capture(label) {
    const pixels = core.HEAPU8.slice(core._gba_framebuffer(), core._gba_framebuffer() + 153600);
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
    const cx = read32(cameraAddress), cy = read32(cameraAddress + 4);
    const x = fixture.x * 8 - cx, y = fixture.y * 8 - cy;
    assert.ok(x >= 0 && y >= 0 && x + 8 <= 240 && y + 8 <= 160, 'target is visible');
    const at = (y * 240 + x) * 4;
    const tilePixels = [];
    for (let dy = 0; dy < 8; ++dy) for (let dx = 0; dx < 8; ++dx) {
      const index = ((y + dy) * 240 + x + dx) * 4;
      tilePixels.push([...pixels.slice(index, index + 4)]);
    }
    const sample = {label, state: state(), camera: {x:cx, y:cy}, pixel:[...pixels.slice(at, at + 4)], tilePixels};
    report.samples.push(sample);
    fs.writeFileSync(path.join(dir, label + '.png'), encodePngRgba({width:240, height:160, pixels}));
    return sample;
  }
  function assertColor(sample, red) {
    // The entire procedural 8x8 source tile is a single RGB555 color.
    const expected = red ? [231, 8, 8, 255] : [0, 198, 33, 255];
    assert.deepEqual(sample.pixel, expected, `${name}/${sample.label}: ReplaceTile RGB555`);
    for (const pixel of sample.tilePixels) assert.deepEqual(pixel, expected, `${name}/${sample.label}: all 64 source pixels`);
  }
  try {
    assert.equal(core._gba_init(), 1);
    const ptr = core._malloc(rom.length); core.HEAPU8.set(rom, ptr);
    assert.equal(core._gba_load_rom(ptr, rom.length), 1); core._free(ptr);
    run(180);
    const initial = capture('initial');
    assert.equal(initial.state.currentRoom, 0, 'runtime initialized');
    assertColor(initial, true);
    const startX = initial.state.player.x;
    run(32, 16); run(2);
    assert.equal(state().player.x, startX, 'closed door blocks movement');
    tapA();
    const opened = capture('opened');
    assert.equal(opened.state.variables[0], 1, 'A ran the event');
    assertColor(opened, false);
    if (fixture.keepCollision) {
      run(64, 16); run(2);
      assert.equal(state().player.x, startX, 'omitting collision preserves the wall');
    } else {
      moveToX(startX + 48);
      assert.ok(state().player.x > startX + 32, 'explicit free permits crossing');
      moveToX(startX);
      assert.equal(state().player.x, startX, 'returned before closing');
      tapA(); assertColor(capture('closed-again'), true);
      assert.equal(state().variables[0], 0);
      run(32, 16); run(2);
      assert.equal(state().player.x, startX, 'solid restores blocking');
      tapA(); assertColor(capture('reopened'), false);
      const direction = startX + 272 + 16 < fixture.width * 8 ? 16 : 32;
      moveToX(startX + (direction === 16 ? 272 : -272));
      const screenX = fixture.x * 8 - read32(cameraAddress);
      assert.ok(screenX < -8 || screenX >= 240, 'edited tile left the viewport');
      moveToX(startX);
      assert.equal(state().player.x, startX);
      assertColor(capture('after-scrolling'), false);
    }
    report.ok = true;
  } catch (error) {
    report.error = String(error);
    throw error;
  } finally {
    report.finalState = state();
    fs.writeFileSync(path.join(dir, 'verification.json'), JSON.stringify(report, null, 2));
    core._gba_destroy();
  }
  console.log(`PASS ${name}: pixels, collision, event execution and camera refresh`);
}
