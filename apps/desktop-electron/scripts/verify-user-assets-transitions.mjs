// Usage: node scripts/verify-user-assets-transitions.mjs MATRIX_DIR OUTPUT_DIR [entry-wait]
// Fixture: GBA_USER_ASSETS_QA_TRANSITIONS=1, GBA_USER_ASSETS_QA_SCENE=topdown.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { readRuntimeTelemetry } from '../static/WebPlayer/player/mgba-direct-player.mjs';
import { encodePngRgba } from './lib/png-icons.mjs';

const [root, out, mode] = process.argv.slice(2);
assert(mode == null || mode === 'entry-wait');
const entryWait = mode === 'entry-wait';
assert(root && out, 'Provide MATRIX_DIR and OUTPUT_DIR');
await mkdir(out, { recursive: true });
const document = JSON.parse(await readFile(root + '/project/user_assets_native_qa.gba-project', 'utf8'));
const data = document.data ?? document;
const expectedRooms = [0, ...['platformer', 'menu'].map(id => data.rooms.findIndex(r => r.id === id))];
assert(expectedRooms.every(index => index >= 0));
// currentRoom is local to each renderer; runtimeKind identifies mixed runtimes.
const expectedRuntimes = [0, 1, 3];
const sources = JSON.parse(await readFile(root + '/sources.json', 'utf8'));
const manifest = JSON.parse(await readFile(root + '/roms/manifest.json', 'utf8'));
const row = manifest.find(r => r.runtime === 'topdown');
assert(row?.mixedColorDepth);
const rom = await readFile(root + '/roms/' + row.scene + '.gba');
assert.equal(createHash('sha256').update(rom).digest('hex'), row.romSha256);
const wasm = await readFile(new URL('../static/WebPlayer/player/mgba-core.wasm', import.meta.url));
const core = await createMGBA({
  print() {}, printErr() {},
  instantiateWasm(imports, receive) {
    const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm), imports);
    receive(instance); return instance.exports;
  }
});
assert.equal(core._gba_init(), 1);
const entries = [], snapshots = [], failures = [];
const platformerFrames = new Set();
let previousRuntime = -1, enteredAt = -1;
try {
  const pointer = core._malloc(rom.length);
  core.HEAPU8.set(rom, pointer);
  assert.equal(core._gba_load_rom(pointer, rom.length), 1);
  core._free(pointer); core._gba_set_keys(0);
  for (let frame = 0; frame < 600; frame++) {
    core._gba_set_keys(!entryWait && previousRuntime === 1 && frame - enteredAt >= 180 ? 16 : 0);
    core._gba_run_frame();
    const telemetry = readRuntimeTelemetry(core);
    if (!telemetry || telemetry.runtimeKind < 0) continue;
    if (telemetry.runtimeKind === 1) platformerFrames.add(telemetry.frame);
    if (telemetry.runtimeKind !== previousRuntime) {
      previousRuntime = telemetry.runtimeKind; enteredAt = frame;
      entries.push({ frame, runtimeKind: previousRuntime, telemetry });
    }
    if (frame - enteredAt !== 30) continue;
    const family = previousRuntime === 0 ? 'topdown' : previousRuntime === 1 ? 'platformer' : null;
    const palette = Array.from({ length: 208 }, (_, i) => core._gba_audio_register(0x05000200 + i * 2) >>> 0);
    if (family) {
      const source = sources.find(s => s.family === family);
      assert.equal(source.colorMode, '8bpp');
      for (const [r, g, b] of source.palette) {
        const color = (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10);
        if (!palette.includes(color)) failures.push(family + ': source color missing after transition');
      }
    }
    const rgba = Uint8Array.from(core.HEAPU8.subarray(core._gba_framebuffer(), core._gba_framebuffer() + 240 * 160 * 4));
    assert(rgba.some((value, index) => index % 4 !== 3 && value > 0), 'Transition remained on a black framebuffer');
    await writeFile(out + '/runtime-' + previousRuntime + '.png', encodePngRgba({ width: 240, height: 160, pixels: rgba }));
    snapshots.push({ frame, runtimeKind: previousRuntime, family, palette, telemetry });
  }
} finally {
  core._gba_destroy();
  await writeFile(out + '/report.json', JSON.stringify({ romSha256: row.romSha256, expectedRooms, expectedRuntimes, entryWait, platformerUpdateCount: platformerFrames.size, entries, snapshots, failures }, null, 2) + '\n');
}
assert.deepEqual(entries.map(entry => entry.runtimeKind), expectedRuntimes, 'Mixed scene transitions failed');
assert.deepEqual(snapshots.map(snapshot => snapshot.runtimeKind), expectedRuntimes);
assert.deepEqual(failures, [], 'A scene retained another 8bpp palette');
if (entryWait) assert(platformerFrames.size >= 90, 'Platformer onInit wait 90 skipped gameplay updates');
console.log('PASS 8bpp Top-down → 8bpp Platformer → 4bpp Menu');
