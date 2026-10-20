import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { readRuntimeTelemetry } from '../static/WebPlayer/player/mgba-direct-player.mjs';
import { encodePngRgba, decodePngRgba } from './lib/png-icons.mjs';
import { decodeMGBAHardwareVideoState } from './native-scene-framebuffer-contract.mjs';
const app = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const romPath = path.resolve(process.argv[2] ?? ''), output = path.resolve(process.argv[3] ?? 'artifacts/tactical-arena');
if (!process.argv[2])
    throw Error('Usage: node scripts/smoke-tactical-arena.mjs ROM.gba OUTPUT_DIR');
fs.mkdirSync(output, { recursive: true });
const wasm = fs.readFileSync(app + '/static/WebPlayer/player/mgba-core.wasm');
const module = new WebAssembly.Module(wasm), rom = fs.readFileSync(romPath);
const assets = app + '/default-assets/templates/exemplo-gba/Assets/';
const font = decodePngRgba(fs.readFileSync(assets + 'sprites/tactical-compact-font-8x8.png'));
const room = JSON.parse(fs.readFileSync(app + '/default-assets/templates/exemplo-gba/exemplo-gba.gba-project')).rooms.find(r => r.name === 'arena_tatica');
const background = decodePngRgba(fs.readFileSync(assets + 'backgrounds/' + room.backgroundAssetName));
const core = await createMGBA({ print: () => { }, printErr: () => { }, instantiateWasm(imports, receive) { let i = new WebAssembly.Instance(module, imports); receive(i); return i.exports; } });
let initialized = false;
function reset() { if (initialized)
    core._gba_destroy(); core._gba_init(); initialized = true; const p = core._malloc(rom.length); core.HEAPU8.set(rom, p); core._gba_load_rom(p, rom.length); core._free(p); run(150); for (let i = 0; i < 3; i++)
    tap(1); }
function run(n, k = 0) { core._gba_set_keys(k); for (let i = 0; i < n; i++)
    core._gba_run_frame(); }
function tap(k, n = 6, wait = 20) { run(n, k); run(wait); }
function state() { const s = readRuntimeTelemetry(core), b = s.flagBits; return { ...s, cursor: [b >>> 23 & 15, b >>> 27 & 15], selected: Boolean(b & 1 << 17), team: b >>> 18 & 1, turn: b >>> 19 & 15 }; }
function shot(name) { let p = core._gba_framebuffer(), pixels = core.HEAPU8.slice(p, p + 153600); for (let i = 3; i < pixels.length; i += 4)
    pixels[i] = 255; fs.writeFileSync(path.join(output, name + '.png'), encodePngRgba({ width: 240, height: 160, pixels })); let n = core._gba_state_size(), v = core._malloc(n); core._gba_save_state(v, n); let native = decodeMGBAHardwareVideoState(core.HEAPU8.slice(v, v + n)); core._free(v); const s = state(); fs.writeFileSync(path.join(output, name + '.json'), JSON.stringify({ state: s, native }, null, 2)); console.log(name, JSON.stringify({ frame: s.frame, cursor: s.cursor, selected: s.selected, team: s.team, turn: s.turn, player: s.player, enemy: s.firstActor, bg: native.bg[2], oam: native.objects.length })); return { state: s, native }; }
const checks = [];
function check(name, fn) { fn(); checks.push(name); }
function pixels() { const p = core._gba_framebuffer(); return core.HEAPU8.slice(p, p + 153600); }
const rgb = (p, i) => (p[i] >> 3) | ((p[i + 1] >> 3) << 5) | ((p[i + 2] >> 3) << 10);
const backgroundChecks = [];
function verifyBackground(shotData, label) {
    const [x, y] = shotData.state.cursor, config = room.runtime.config;
    const z = room.heightLevels[y * room.width + x];
    const cameraX = Math.max(0, Math.min(background.width - 240, config.originX + (x - y) * config.tileWidth / 2 - 120));
    const cameraY = Math.max(0, Math.min(background.height - 160, config.originY + (x + y + 1) * config.tileHeight / 2 - z * config.heightStep - 80));
    const frame = pixels();
    let compared = 0;
    for (let yy = 0; yy < 160; yy++) for (let xx = 0; xx < 240; xx++) {
        if (shotData.native.objects.some(o => xx >= o.x && xx < o.x + o.width && yy >= o.y && yy < o.y + o.height)) continue;
        assert.equal(rgb(frame, (yy * 240 + xx) * 4), rgb(background.pixels, ((cameraY + yy) * background.width + cameraX + xx) * 4), `${label}: BG pixel ${xx},${yy}`);
        compared++;
    }
    assert.ok(compared > 2000, `${label}: insufficient unobstructed BG pixels`);
    backgroundChecks.push({ label, cameraX, cameraY, compared });
}
function text(expected, x, y) { const p = pixels(); let count = 0; for (let i = 0; i < expected.length; i++) {
    const code = expected.charCodeAt(i) - 32;
    for (let yy = 0; yy < 8; yy++)
        for (let xx = 0; xx < 8; xx++) {
            const at = (((code / 16 | 0) * 8 + yy) * font.width + code % 16 * 8 + xx) * 4;
            if (!font.pixels[at + 3])
                continue;
            assert.equal(rgb(p, ((y + yy) * 240 + x + i * 7 + xx) * 4), rgb(font.pixels, at), `HUD ${expected} glyph${i} pixel ${xx},${yy}`);
            count++;
        }
} assert.ok(count > 0); }
function point() { return [state().player.x, state().player.y]; }
function go(x, y) { for (let i = 0; i < 40; i++) {
    const [cx, cy] = state().cursor;
    if (cx === x && cy === y)
        return;
    tap(cx < x ? 144 : cx > x ? 96 : cy < y ? 160 : 80);
} throw Error('Cursor failed to reach ' + [x, y]); }
reset();
const initial = shot('initial');
check('initial BG preserves approved source pixels', () => verifyBackground(initial, 'initial'));
check('initial HUD, exact font and 5/5 health', () => { assert.deepEqual(state().cursor, [5, 9]); text('SUA VEZ', 29, 12); text('5/5', 99, 140); });
check('selector centered at actor feet', () => { const n = initial.native.objects.find(o => o.width === 64 && o.height === 64 && o.tile === 0); const marker = initial.native.objects.find(o => o.width === 64 && o.height === 32 && o.priority === 3); assert.ok(n && marker); assert.equal(marker.y + 16, n.y + 62); });
tap(1);
tap(128);
check('action menu keeps world selector fixed', () => assert.deepEqual(state().cursor, [5, 9]));
tap(2);
check('cancel preserves turn', () => { assert.equal(state().turn, 1); assert.equal(state().selected, false); });
for (const [name, key, target] of [['se', 144, [6, 9]], ['nw', 96, [4, 9]], ['sw', 160, [5, 10]], ['ne', 80, [5, 8]]]) {
    reset();
    tap(1);
    tap(1);
    tap(key);
    tap(1, 6, 0);
    const poses = new Set();
    for (let i = 0; i < 18; i++) {
        run(2);
        const p = pixels();
        const region = [];
        for (let y = 22; y < 82; y++)
            for (let x = 90; x < 150; x++)
                region.push(...p.subarray((y * 240 + x) * 4, (y * 240 + x) * 4 + 3));
        poses.add(createHash('sha256').update(Buffer.from(region)).digest('hex'));
    }
    run(30);
    shot('move-' + name);
    check('movement ' + name + ' with animation', () => { assert.deepEqual(point(), target); assert.equal(state().turn, 1); assert.ok(poses.size > 1); });
}
reset();
const cameras = [];
for (const [x, y] of [[0, 15], [15, 0], [0, 0], [15, 15], [5, 9]]) {
    go(x, y);
    run(25);
    const shotData = shot(`camera-${x}-${y}`), z = room.heightLevels[y * 16 + x], cx = Math.max(0, Math.min(528, 384 + (x - y) * 24 - 120)), cy = Math.max(0, Math.min(352, 80 + (x + y) * 12 - z * 8 - 80));
    check('camera follows selector ' + x + ',' + y, () => { assert.equal(shotData.native.bg[2].x, cx % 256); assert.equal(shotData.native.bg[2].y, cy % 256); assert.deepEqual(point(), [5, 9]); });
    check('camera BG preserves source ' + x + ',' + y, () => verifyBackground(shotData, `camera-${x}-${y}`));
    cameras.push({ x, y, camera: { x: cx, y: cy } });
}
reset();
tap(1);
tap(1);
go(4, 9);
tap(1);
run(30);
tap(4);
run(160);
assert.deepEqual(point(), [4, 9]);
assert.equal(room.collisionTypes[10 * room.width + 3], 'solid');
assert.ok(Math.abs(3 - 4) + Math.abs(10 - 9) <= room.runtime.config.tactical.units[0].moveRange);
tap(1);
tap(1);
go(3, 10);
tap(1);
run(30);
shot('blocked-prop');
check('solid prop blocks an in-range movement', () => { assert.deepEqual(point(), [4, 9]); assert.equal(state().turn, 3); });
reset();
tap(1);
tap(1);
go(15, 15);
tap(1);
run(30);
shot('out-of-range');
check('out-of-range movement rejected', () => { assert.deepEqual(point(), [5, 9]); assert.equal(state().turn, 1); });
tap(2);
tap(2);
go(0, 0);
tap(1);
check('empty cell does not select unit', () => assert.equal(state().selected, false));
reset();
tap(1);
tap(1);
tap(144);
tap(1);
run(40);
shot('after-move');
tap(64);
tap(1);
check('second movement in one turn rejected', () => { assert.deepEqual(point(), [6, 9]); text('JA MOVEU', 29, 12); });
tap(128);
tap(1);
shot('no-target');
check('no-target attack preserves action and turn', () => { assert.equal(state().turn, 1); text('SEM ALVO', 29, 12); });
tap(128);
tap(1);
run(160);
shot('after-wait');
check('enemy approaches and deals damage', () => { assert.equal(state().turn, 3); assert.deepEqual([state().firstActor.x, state().firstActor.y], [7, 9]); text('4/5', 99, 140); });
tap(1);
tap(128);
tap(1);
shot('attack-aim');
check('attack preview shows enemy real HP', () => text('4/4', 99, 140));
tap(1);
run(140);
shot('after-attack');
check('counterattack updates player health', () => { assert.equal(state().turn, 5); text('3/5', 99, 140); });
tap(1);
tap(128);
tap(1);
shot('enemy-damaged');
check('attack damage updates enemy health', () => text('2/4', 99, 140));
tap(1);
run(120);
shot('victory');
check('victory and defeated enemy hidden', () => { assert.equal(state().firstActor.visible, false); text('VITORIA', 29, 12); text('0/4', 99, 140); });
reset();
for (let i = 0; i < 6; i++) {
    tap(4);
    run(160);
}
shot('defeat');
check('enemy can defeat Nara', () => { text('DERROTA', 29, 12); assert.equal(state().turn > 1, true); });
tap(512);
run(180);
shot('return-market');
check('L returns to Mercado Suspenso', () => { assert.equal(state().runtimeKind, 2); assert.equal((state().flagBits & (1 << 16)) !== 0, false); });
reset();
const beforePause = state();
tap(8);
run(80);
shot('pause');
check('pause opens book menu', () => assert.equal(state().runtimeKind, 3));
tap(2);
run(100);
shot('resume');
check('resume retains tactical state', () => { assert.equal(state().runtimeKind, 2); assert.deepEqual(point(), [beforePause.player.x, beforePause.player.y]); assert.equal(state().turn, beforePause.turn); });
const final = { ok: true, romSha256: createHash('sha256').update(rom).digest('hex'), checks, cameras, backgroundChecks, method: 'Real GBA inputs in mGBA WASM; no runtime memory or save modification', limits: ['No physical GBA evidence'], initial: initial.state };
fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(final, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, checks: checks.length }));
core._gba_destroy();
