import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { readRuntimeTelemetry } from '../static/WebPlayer/player/mgba-direct-player.mjs';
const [packArg, outputArg] = process.argv.slice(2);
assert.ok(packArg && outputArg, 'Usage: smoke-event-replay.mjs PACK OUTPUT');
const pack = path.resolve(packArg), output = path.resolve(outputArg), app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.mkdirSync(output, { recursive: true });
function command(bin, args, log, extra = {}) {
  const result = spawnSync(bin, args, { cwd: app, env: { ...process.env, GBA_STUDIO_EVENT_REPLAY_ROOT: output, ...extra }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  fs.writeFileSync(path.join(output, log), (result.stdout ?? '') + (result.stderr ?? ''));
  assert.equal(result.status, 0, `${bin} failed: ${log}`);
}
const vitest = ['node_modules/vitest/vitest.mjs', 'run', 'src/shared/eventReplay.test.ts'];
command(process.execPath, vitest, 'preview-export.log');
const directory = path.join(output, 'rom'); fs.mkdirSync(directory, { recursive: true });
command('python3', [path.join(app, '../../packages/GBAStudioEngine/tests/host/map_state_rom_fixture.py'), pack, directory, path.join(output, 'contract.json'), '--replay-inputs', '--restore-actors'], 'fixture.log');
command('python3', [path.join(pack, 'tools/gbsbuild'), '--engine-pack', pack, '--project-dir', directory], 'build.log');
const rom = fs.readFileSync(path.join(directory, 'build/replace_tile.gba'));
const sourceMap = JSON.parse(fs.readFileSync(path.join(directory, 'build/event_source_map.json')));
assert.equal(sourceMap.romSha256, createHash('sha256').update(rom).digest('hex'));
assert.ok(sourceMap.entries.some(entry => entry.eventID === 'open'), 'native command addresses resolve to visual event steps');
const wasm = new WebAssembly.Module(fs.readFileSync(path.join(app, 'static/WebPlayer/player/mgba-core.wasm')));
const core = await createMGBA({ print() {}, printErr() {}, instantiateWasm(imports, done) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
assert.equal(core._gba_init(), 1);
const pointer = core._malloc(rom.length); core.HEAPU8.set(rom, pointer);
assert.equal(core._gba_load_rom(pointer, rom.length), 1); core._free(pointer);
function run(frames, buttons = 0) { core._gba_set_keys(buttons); for (let i = 0; i < frames; ++i) core._gba_run_frame(); }
const expected = JSON.parse(fs.readFileSync(path.join(output, 'expected.json')));
const report = { schema: 1, romSha256: sourceMap.romSha256, inputs: expected.inputs, checkpoints: {}, trace: [] };
try {
  run(180);
  for (const [index, input] of expected.inputs.entries()) {
    run(4, input.button); run(28);
    const native = readRuntimeTelemetry(core); assert.ok(native);
    assert.equal(native.firstActor.visible, index !== 3, 'restore applies commands beyond actor queue capacity after NPC initialization');
    report.checkpoints[index] = { variables: { 'map.door': native.variables[0] }, collision: { cell: 780, type: 'unverified' } };
    // Collision is also exercised by walking into/through the same cell below.
    const x = native.player.x;
    run(40, 16); run(2);
    const moved = readRuntimeTelemetry(core).player.x;
    report.checkpoints[index].collision.type = moved === x ? 'solid' : 'free';
    if (native.variables[0] === 0) assert.equal(moved, x, 'closed collision blocks the native player');
    else assert.ok(moved > x, 'open collision permits native movement');
    // Return exactly to the fixture origin before the next input checkpoint.
    for (let f = 0; f < 400 && readRuntimeTelemetry(core).player.x > x; ++f) run(1, 32);
    run(2);
    const trace = readRuntimeTelemetry(core).eventTrace;
    assert.ok(trace?.entries.length, 'bounded native trace is published');
    report.trace.push(...trace.entries.map(entry => ({ ...entry, source: sourceMap.entries.find(source => source.address === entry.commandAddress) ?? null })));
  }
  fs.writeFileSync(path.join(output, 'actual.json'), JSON.stringify(report, null, 2));
} finally { core._gba_destroy(); }
command(process.execPath, vitest, 'parity-verification.log', { GBA_STUDIO_EVENT_REPLAY_VERIFY: '1' });
console.log('PASS: same A/START/B/SELECT replay in Preview and ARM ROM, saved state, collision and event source map');
