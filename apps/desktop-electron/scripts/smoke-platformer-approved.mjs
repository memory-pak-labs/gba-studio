// Real ROM checks. Inputs drive gameplay; ELF symbols are read-only test oracles.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { readRuntimeTelemetry, copyModuleSavedata, inspectSavedataBytes, restoreModuleSavedata } from '../static/WebPlayer/player/mgba-direct-player.mjs';
import { encodePngRgba, decodePngRgba } from './lib/png-icons.mjs';
import { decodeMGBAHardwareVideoState } from './native-scene-framebuffer-contract.mjs';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const romPath = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
fs.mkdirSync(output, { recursive: true });
const symbols = spawnSync('/opt/devkitpro/devkitARM/bin/arm-none-eabi-nm', ['-S', '-C', romPath.replace(/\.gba$/, '.elf')], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).stdout.split('\n').map(l => { const m = l.match(/^([\da-f]+) ([\da-f]+) (\w) (.*)$/); return m ? { address: parseInt(m[1], 16), size: parseInt(m[2], 16), type: m[3], name: m[4] } : null; }).filter(Boolean);
const sym = n => symbols.find(s => s.name.endsWith('::' + n));
const presentation = sym('player_presentation');
assert.ok(presentation, 'matching ELF is required');
const nearest = n => symbols.filter(s => s.name.endsWith('::' + n)).sort((a, b) => Math.abs(a.address - presentation.address) - Math.abs(b.address - presentation.address))[0];
const animator = nearest('player_animator'), event = sym('platformer_event_state'), actor = symbols.find(s => s.name.endsWith('::player') && s.size === 60), npc = sym('platformer_npc_runtimes');
const camera = symbols.filter(s => s.name.endsWith('::camera') && s.size === 32).sort((a, b) => Math.abs(a.address - actor.address) - Math.abs(b.address - actor.address))[0];
const animations = Object.fromEntries(symbols.filter(s => s.name.startsWith('gbastudio_platformer_project::platformer_player_') && s.name.endsWith('_animation')).map(s => [s.address, s.name.match(/player_(.*)_animation/)[1]]));
const rom = fs.readFileSync(romPath), wasm = new WebAssembly.Module(fs.readFileSync(app + '/static/WebPlayer/player/mgba-core.wasm'));
const m = await createMGBA({ print: () => { }, printErr: () => { }, instantiateWasm(imports, done) { const i = new WebAssembly.Instance(wasm, imports); done(i); return i.exports; } });
const rd16 = a => m._gba_audio_register(a) >>> 0, rd32 = a => (rd16(a) | (rd16(a + 2) << 16));
const bytes = (a, n) => Array.from({ length: n }, (_, i) => rd16(a + (i & ~1)) >> ((i & 1) * 8) & 255);
const dialogueSymbols = [...new Set(symbols.filter(s => s.name.endsWith('::dialogue')).map(s => s.address))];
const activeDialogue = () => dialogueSymbols.filter(a => (rd16(a) & 255) === 1 && rd32(a + 1028) >= 0 && rd32(a + 1028) < 20 && rd32(a + 8) >= 0x08000000 && rd32(a + 8) < 0x0a000000);
const samples = [], trace = [], checks = [], fidelity = [];
let checkpointBattery = null;
let renderedState = null;
const manifest = JSON.parse(fs.readFileSync(app + '/fixtures/asset-provenance/platformer-approved-manifest.json'));
const image = n => decodePngRgba(fs.readFileSync(app + '/default-assets/templates/exemplo-gba/Assets/' + n));
const art = { nara: image('sprites/penedos-approved-nara.png'), terrain: image('backgrounds/penedos-approved-terrain.png'), sky: image('backgrounds/penedos-approved-sky.png') };
const rgb = (p, o) => (p[o] >> 3) | ((p[o + 1] >> 3) << 5) | ((p[o + 2] >> 3) << 10);
function check(name, fn) { fn(); checks.push(name); }
function verifyPixels(sample) {
    const screen = m.HEAPU8.slice(m._gba_framebuffer(), m._gba_framebuffer() + 153600), o = sample.native.objects.find(o => o.index === 0);
    // mGBA returns at the next frame boundary: RAM may already describe the
    // next animation pose. Compare pixels to the state that produced this frame.
    const visibleState = sample.renderedState;
    assert.ok(visibleState, 'rendered frame state is required');
    const clip = manifest.animations.find(a => a.state === visibleState.animation && a.spriteSheet === 'penedos-approved-nara.png');
    const frame = clip.frames[visibleState.animationFrame].sourceFrameIndex;
    let actorPixels = 0, bgPixels = 0;
    for (let y = 0; y < o.height; y++)
        for (let x = 0; x < o.width; x++) {
            const sx = frame * 64 + (o.flipX ? 63 - x : x), at = (y * art.nara.width + sx) * 4, dx = o.x + x, dy = o.y + y;
            if (!art.nara.pixels[at + 3] || dx < 0 || dx >= 240 || dy < 0 || dy >= 160)
                continue;
            assert.equal(rgb(screen, (dy * 240 + dx) * 4), rgb(art.nara.pixels, at), 'native Nara source pixel');
            actorPixels++;
        }
    for (let y = 0; y < 160; y++)
        for (let x = 0; x < 240; x++) {
            if (sample.native.objects.some(o => x >= o.x && x < o.x + o.width && y >= o.y && y < o.y + o.height))
                continue;
            const world = ((visibleState.camera.y + y) * 960 + visibleState.camera.x + x) * 4;
            const source = art.terrain.pixels[world + 3] ? art.terrain : art.sky, at = source === art.terrain ? world : (y * 240 + x) * 4;
            assert.equal(rgb(screen, (y * 240 + x) * 4), rgb(source.pixels, at), 'native composed background pixel');
            bgPixels++;
        }
    assert.ok(actorPixels > 300 && bgPixels > 10000);
    fidelity.push({ sample: sample.name, actorPixels, bgPixels, sourceFrame: frame });
}
let started = false;
function run(n, k = 0, track = false) {
    m._gba_set_keys(k);
    for (let i = 0; i < n; i++) {
        if (i === n - 1)
            renderedState = state();
        m._gba_run_frame();
        if (track)
            trace.push(state());
    }
}
function reset(battery = null) {
    if (started)
        m._gba_destroy();
    m._gba_init();
    started = true;
    const p = m._malloc(rom.length);
    m.HEAPU8.set(rom, p);
    assert.equal(m._gba_load_rom(p, rom.length), 1);
    m._free(p);
    if (battery)
        assert.equal(restoreModuleSavedata(m, battery), true);
    run(240);
}
function state() { const t = readRuntimeTelemetry(m); return { ...t, dialogues: activeDialogue().map(a => ({ address: a, page: rd32(a + 1028), complete: rd16(a + 1052) & 255 })), camera: { x: rd32(camera.address), y: rd32(camera.address + 4) }, animation: animations[rd32(animator.address)], animationFrame: rd16(animator.address + 4) & 255, variables: Array.from({ length: 64 }, (_, i) => rd32(event.address + 192 + i * 4)), npcs: Array.from({ length: 6 }, (_, i) => ({ x: rd32(npc.address + i * 68), y: rd32(npc.address + i * 68 + 4), flags: bytes(npc.address + i * 68 + 16, 16) })), physics: actor ? bytes(actor.address + 24, 32) : null }; }
function shot(name) {
    const p = m._gba_framebuffer(), rgba = m.HEAPU8.slice(p, p + 153600);
    for (let i = 3; i < rgba.length; i += 4)
        rgba[i] = 255;
    fs.writeFileSync(path.join(output, name + '.png'), encodePngRgba({ width: 240, height: 160, pixels: rgba }));
    const n = m._gba_state_size(), b = m._malloc(n);
    m._gba_save_state(b, n);
    const native = decodeMGBAHardwareVideoState(m.HEAPU8.slice(b, b + n));
    m._free(b);
    const s = { name, state: state(), renderedState, native };
    samples.push(s);
    console.log(name, JSON.stringify({ player: s.state.player, room: s.state.currentRoom, runtime: s.state.runtimeKind, animation: s.state.animation, frame: s.state.animationFrame, camera: s.state.camera, bg: native.bg[2], vars: s.state.variables.slice(27, 33) }));
    return s;
}
try {
    reset();
    const initial = shot('initial');
    verifyPixels(initial);
    const sequence = JSON.parse(process.env.GBA_PLATFORMER_SEQUENCE ?? fs.readFileSync(new URL('./platformer-approved-playtest-route.json', import.meta.url), 'utf8'));
    for (const [label, key, frames] of sequence) {
        if (label === 'restart-route') {
            // The bridge pixel case and the campaign traversal start in fresh cores.
            reset();
        }
        else if (label === 'attack-east') {
            for (let i = 0; i < 100; i++) {
                const s = state(), dx = s.npcs[4].x - (s.player.x + 8);
                const dy = s.npcs[4].y - (s.player.y + rd32(actor.address + 12));
                if (Math.abs(dx) + Math.abs(dy) <= 29) {
                    run(1, dx >= 0 ? 16 : 32, true);
                    run(2, 512, true);
                    run(38, 0, true);
                    break;
                }
                run(1, dx >= 0 ? 16 : 32, true);
            }
            assert.equal(state().variables[31], 2, 'east crab defeated and hidden');
        }
        else if (label === 'close-dialogue') {
            for (let i = 0; i < 20 && activeDialogue().length; i++) {
                run(6, 2, true);
                run(10, 0, true);
            }
            assert.equal(activeDialogue().length, 0, 'dialogue closes');
        }
        else if (label === 'ladder-top') {
            // Wait below the patrol, then climb while the crab is far enough away.
            for (let i = 0; i < 240 && state().npcs[1].x > 196; i++) run(1, 0, true);
            assert.ok(state().npcs[1].x <= 196, 'a safe opening in the crab patrol');
            run(frames, key, true);
        }
        else
            run(frames, key, true);
        if (label) {
            const captured = shot(label);
            if (label === 'beacon')
                checkpointBattery = copyModuleSavedata(m);
            if (['settle', 'land2', 'east-stand'].includes(label))
                verifyPixels(captured);
        }
    }
    if (!process.env.GBA_PLATFORMER_SEQUENCE) {
        const sample = name => samples.find(s => s.name === name).state;
        check('prepared BG and actor pixels match the native framebuffer', () => assert.equal(fidelity.length, 4));
        check('camera follows past three viewports and remains within the approved world', () => {
            const states = trace.filter(s => s.runtimeKind === 1);
            assert.ok(states.some(s => s.camera.x === 720));
            assert.ok(states.every(s => s.camera.x >= 0 && s.camera.x <= 720 && s.camera.y >= 0 && s.camera.y <= 160));
        });
        check('the full player collider walks across the next rope bridge and onto its right cliff', () => {
            assert.ok(sample('cross-east').player.x >= 416);
            assert.equal(sample('cross-east').player.y, 248);
            assert.equal(sample('cross-east').variables[27], 3);
        });
        check('the bridge also returns to the left cliff without an invisible wall', () => {
            assert.ok(sample('bridge-return').player.x <= 80);
            assert.equal(sample('bridge-return').player.y, 248);
        });
        check('climb and descent use the approved animation and real collision ladder', () => {
            assert.equal(sample('climb-mid').animation, 'climb');
            assert.equal(sample('descend-mid').animation, 'climb');
            assert.ok(sample('descend-mid').player.y - sample('climb-mid').player.y >= 12);
            assert.ok(sample('bottom').player.y > sample('descend-mid').player.y);
        });
        check('checkpoint awards one token and writes a valid battery record', () => {
            assert.equal(sample('beacon').variables[28], 1);
            assert.equal(inspectSavedataBytes(checkpointBattery).slot?.status, 'ok');
        });
        check('L attack defeats the east crab and awards its token once', () => {
            assert.equal(sample('attack-east').variables[31], 2);
            assert.equal(sample('attack-east').variables[28], 2);
        });
        check('end of phase advances the campaign into the warehouse', () => assert.equal(sample('exit-load').runtimeKind, 5));
        const clips = new Set(trace.map(s => s.animation));
        check('approved idle, walk, jump, fall, landing, glide, climb and attack are used', () => {
            for (const clip of ['idle', 'walk', 'jump', 'fall', 'land', 'glide', 'climb', 'attack'])
                assert.ok(clips.has(clip), clip);
        });
        reset(checkpointBattery);
        const reloaded = shot('battery-reload');
        check('fresh core restores saved position and checkpoint variables', () => {
            assert.deepEqual(reloaded.state.player, sample('beacon').player);
            assert.equal(reloaded.state.variables[28], 1);
        });
        run(8, 8);
        run(90);
        shot('pause');
        check('Start opens the approved book menu', () => assert.equal(state().runtimeKind, 3));
        run(8, 2);
        run(140);
        shot('resume');
        check('return retains checkpoint and phase', () => assert.equal(state().runtimeKind, 1));
        reset(checkpointBattery);
        run(25, 32, true);
        run(30, 0, true);
        run(2, 129, true);
        let savedReturn = false;
        for (let i = 0; i < 120; i++) {
            run(1, 0, true);
            if (state().variables[27] === 2) {
                savedReturn = true;
                break;
            }
        }
        run(45, 0, true);
        const damaged = shot('checkpoint-damage-return');
        check('damage returns to the active checkpoint with its token preserved', () => {
            assert.ok(savedReturn);
            assert.equal(damaged.state.player.x, manifest.respawn.x * 8 - 8);
            assert.equal(damaged.state.player.y, manifest.respawn.y * 8 - 24);
            assert.equal(damaged.state.variables[27], 2);
            assert.equal(damaged.state.variables[28], 1);
        });
        reset();
        run(80, 0, true);
        run(14, 32, true);
        shot('left');
        check('left direction mirrors Nara', () => assert.equal(samples.at(-1).native.objects.find(o => o.index === 0).flipX, true));
        reset();
        run(8, 18, true);
        shot('dash');
        run(50);
        check('B activates dash animation', () => assert.ok(trace.slice(-100).some(s => s.animation === 'dash')));
        reset();
        run(22, 16, true);
        run(30, 0, true);
        run(2, 129, true); // Down+A drops through the rope bridge, away from actors.
        let returned = false;
        for (let i = 0; i < 120; i++) {
            run(1, 0, true);
            if (state().variables[27] === 2) {
                returned = true;
                break;
            }
        }
        run(45, 0, true);
        const fall = shot('unactivated-fall');
        check('unactivated fall restores spawn, decrements health and shows hurt animation', () => {
            assert.ok(returned);
            assert.equal(fall.state.player.x, manifest.entry.x * 8 - 8);
            assert.equal(fall.state.player.y, manifest.entry.y * 8 - 24);
            assert.equal(fall.state.variables[27], 2);
            assert.ok(trace.some(s => s.animation === 'hurt'));
        });
        // A single terminal frame may be a rest or have no fresh audio block.
        // Listen to a bounded two-second window without triggering another SFX.
        let audible = false;
        for (let frame = 0; frame < 120 && !audible; frame++) {
            run(1);
            const count = m._gba_audio_sample_count();
            const pcm = new Int16Array(m.HEAPU8.buffer, m._gba_audio_samples(), count * 2);
            audible = pcm.some(value => Math.abs(value) > 100);
        }
        check('native PSG music produces audible samples', () => assert.ok(audible));
    }
    check('scene allocations respect GBA BG, OBJ, palette and OAM limits', () => {
        const measured = samples.filter(s => s.state.runtimeKind === 1 && s.state.hardware);
        assert.ok(measured.length >= 4);
        for (const s of measured) {
            assert.ok(s.state.hardware.bgTiles <= 1024);
            assert.ok(s.state.hardware.objTiles <= 1024);
            assert.ok(s.state.hardware.oam <= 128);
            assert.ok(s.state.hardware.paletteColors <= 512);
        }
    });
    const report = { ok: checks.length > 0, checks, fidelity, romSha256: createHash('sha256').update(rom).digest('hex'), method: 'Real GBA inputs in mGBA WASM; ELF memory read only, no teleport or save injection', symbols: { presentation, animator, event, actor, npc }, samples, trace, save: inspectSavedataBytes(copyModuleSavedata(m)) };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
finally {
    m._gba_destroy();
}
