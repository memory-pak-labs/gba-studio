// Exercise the actual GBA ROM in the same mGBA core used by Play, without UI automation.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { readRuntimeTelemetry, copyModuleSavedata, inspectSavedataBytes, restoreModuleSavedata } from '../static/WebPlayer/player/mgba-direct-player.mjs';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const romPath = path.resolve(process.argv[2] ?? path.join(app, 'default-assets/templates/exemplo-gba/exemplo.gba'));
const out = process.argv[3];
const log = console.log;
console.log = (...args) => { if (!String(args[0]).startsWith('GBA ')) log(...args); };
const m = await createMGBA({ instantiateWasm(imports, done) {
  WebAssembly.instantiate(fs.readFileSync(path.join(app, 'static/WebPlayer/player/mgba-core.wasm')), imports)
    .then(({ instance }) => done(instance));
  return {};
} });
m._gba_init();
const rom = fs.readFileSync(romPath), pointer = m._malloc(rom.length);
m.HEAPU8.set(rom, pointer);
if (m._gba_load_rom(pointer, rom.length) !== 1) throw new Error('ROM load failed');
m._free(pointer);
if (out) fs.mkdirSync(out, { recursive: true });
const samples = [];
const elfPath = romPath.replace(/\.gba$/, '.elf');
const symbols = fs.existsSync(elfPath) ? spawnSync('/opt/devkitpro/devkitARM/bin/arm-none-eabi-nm', ['-S', '-C', elfPath], { encoding: 'utf8' }).stdout : '';
const address = name => Number.parseInt(symbols.split('\n').find(l => l.endsWith(`::${name}`))?.split(' ')[0] ?? '0', 16);
const npcBase = address('platformer_npc_runtimes'), animatorBase = address('platformer_npc_animators');
// This bridge delegates to core->busRead16 for any address (mgba_web.c).
const read16 = a => m._gba_audio_register(a) >>> 0;
const read32 = a => (read16(a) | (read16(a + 2) << 16));
const npcs = () => npcBase ? Array.from({ length: 7 }, (_, i) => ({
  x: read32(npcBase + i * 68), y: read32(npcBase + i * 68 + 4),
  direction: read16(npcBase + i * 68 + 20) & 255,
  animationFrame: read16(animatorBase + i * 12 + 4) & 255
})) : [];
function run(label, keys, frames) {
  m._gba_set_keys(keys);
  for (let i = 0; i < frames; i++) m._gba_run_frame();
  const t = readRuntimeTelemetry(m);
  const rgba = Buffer.from(m.HEAPU8.subarray(m._gba_framebuffer(), m._gba_framebuffer() + 240 * 160 * 4));
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  const sample = { label, keys, coreFrames: frames, telemetry: t, npcs: npcs(), framebufferSha256: createHash('sha256').update(rgba).digest('hex') };
  samples.push(sample);
  log(JSON.stringify({ label, frame: t?.frame, player: t?.player, enemy: t?.firstActor, sfx: t?.lastSfx, room: t?.currentRoom, npcs: sample.npcs }));
  if (out && !label.startsWith('patrol-check-')) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', '240x160', '-i', 'pipe:0', '-frames:v', '1', '-y', path.join(out, `${label}.png`)], { input: rgba });
    if (r.status !== 0) throw new Error(r.stderr.toString());
  }
  return t;
}
try {
  run('idle', 0, 240);
  const verifyRoute = process.argv.includes('--verify-route');
  const sequence = verifyRoute
    ? JSON.parse(fs.readFileSync(new URL('./platformer-playtest-route.json', import.meta.url), 'utf8'))
    : JSON.parse(process.env.GBA_PLAYTEST_SEQUENCE ?? '[ ["idle-stable",0,180], ["dash",18,8], ["stop",0,60], ["right",16,45], ["jump",17,20], ["land",0,100], ["stop-final",0,60] ]');
  const unactivatedFall = process.argv.includes('--verify-unactivated-fall');
  const selectedSequence = unactivatedFall
    ? JSON.parse(fs.readFileSync(new URL('./platformer-playtest-route.json', import.meta.url), 'utf8')).slice(0, 9)
    : sequence;
  for (const [label, keys, frames] of selectedSequence) run(label, keys, frames);
  if (unactivatedFall) {
    let previous = readRuntimeTelemetry(m)?.player;
    assert.ok(previous?.x > 350 && previous.x < 480, 'start at first gap');
    let returned = false;
    m._gba_set_keys(16);
    for (let frame = 0; frame < 180; frame++) {
      m._gba_run_frame();
      const current = readRuntimeTelemetry(m)?.player;
      if (current && previous && previous.x - current.x > 100) {
        assert.equal(current.x, 120, 'without beacon return to initial spawn');
        assert.equal(current.y, 112);
        returned = true;
        break;
      }
      previous = current;
    }
    assert.ok(returned, 'first gap must cause a return');
    run('unactivated-fall-return', 0, 60);
    log('PASS: first gap returns to initial spawn before beacon activation');
  }
  if (process.argv.includes('--verify-save')) {
    const savedata = inspectSavedataBytes(copyModuleSavedata(m));
    if (out) fs.writeFileSync(path.join(out, 'save-report.json'), JSON.stringify(savedata, null, 2));
    log(JSON.stringify(savedata));
    assert.equal(savedata.hasUniversalSlotRecord, true, 'farol must write an actual save record');
    assert.equal(savedata.slot?.status, 'ok', 'save checksum must be valid');
  }
  if (verifyRoute) {
    for (const [label, x, y] of [['settle-beacon', 933, 96], ['walk-sign', 986, 112],
      ['stop-sign', 1007, 112], ['touch-moth', 920, 112]]) {
      const t = samples.find(s => s.label === label)?.telemetry;
      assert.equal(t?.currentRoom, 0, `${label}: remain in platformer scene`);
      assert.equal(t?.player.x, x, `${label}: player x`);
      assert.equal(t?.player.y, y, `${label}: player y`);
    }
    log('PASS: cross the scene, walk off the beacon, reach the sign and return to activated checkpoint after enemy contact');
  }
  if (process.argv.includes('--verify-patrol')) {
    assert.ok(npcBase && animatorBase, 'ELF symbols required for animation verification');
    const trace = [];
    m._gba_set_keys(0);
    for (let i = 0; i < 1600; i++) {
      m._gba_run_frame();
      if (i % 10 === 0) trace.push(npcs());
    }
    const limits = [[328,392], [744,808], [528,592], [656,696]];
    if (out) fs.writeFileSync(path.join(out, 'patrol-trace.json'), JSON.stringify(trace));
    for (let i = 0; i < 4; i++) {
      const states = trace.map(s => s[i]);
      // Direction changes are queued; the same event iteration can travel one last pixel.
      assert.ok(states.every(s => s.x >= limits[i][0] - 1 && s.x <= limits[i][1] + 1), `enemy ${i}: patrol bounds`);
      assert.deepEqual([...new Set(states.map(s => s.direction))].sort(), [2,3], `enemy ${i}: both directions`);
      assert.deepEqual([...new Set(states.map(s => s.animationFrame))].sort(), [0,1], `enemy ${i}: both frames`);
    }
    log('PASS: all four enemies reverse at boundaries and animate both frames');
  }
  if (process.argv.includes('--verify-reload')) {
    const battery = copyModuleSavedata(m);
    assert.equal(inspectSavedataBytes(battery).slot?.status, 'ok');
    m._gba_destroy();
    m._gba_init();
    const ptr = m._malloc(rom.length);
    m.HEAPU8.set(rom, ptr);
    assert.equal(m._gba_load_rom(ptr, rom.length), 1);
    m._free(ptr);
    assert.equal(restoreModuleSavedata(m, battery), true);
    // This runtime restores the battery slot during boot. Start opens the
    // project's authored menu scene, not the standalone template's pause menu.
    const loaded = run('fresh-boot', 0, 240);
    assert.equal(loaded?.player.x, 933, 'load must restore beacon position from battery data');
    assert.equal(loaded?.player.y, 96);
    log('PASS: fresh core restored beacon position from battery save at boot');
  }
  if (process.argv.includes('--verify-falls')) {
    // Start at the activated beacon (also valid immediately after battery reload).
    for (let attempt = 1; attempt <= 2; attempt++) {
      let previous = readRuntimeTelemetry(m)?.player;
      assert.ok(previous?.x >= 900, 'fall test must start beside the activated beacon');
      let returned = false;
      m._gba_set_keys(32);
      for (let frame = 0; frame < 220; frame++) {
        m._gba_run_frame();
        const current = readRuntimeTelemetry(m)?.player;
        if (current && previous && Math.abs(current.x - previous.x) > 40) {
          assert.equal(current.x, 920, 'fall must return to activated beacon, not initial spawn');
          assert.equal(current.y, 112);
          returned = true;
          break;
        }
        previous = current;
      }
      assert.ok(returned, 'walking into the gap must cause a return');
      const settled = run(`fall-return-${attempt}`, 0, 60);
      assert.equal(settled?.player.x, 920, 'return must clear horizontal momentum');
      assert.equal(settled?.player.y, 112);
    }
    log('PASS: repeated falls return to activated beacon');
  }
  if (out) fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ romPath, romSha256: createHash('sha256').update(rom).digest('hex'), samples }, null, 2));
} finally { m._gba_destroy(); console.log = log; }
