// Drives the complete mixed ROM with buttons; matching ELF and telemetry are read-only oracles.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { readRuntimeTelemetry } from '../static/WebPlayer/player/mgba-direct-player.mjs';
import { encodePngRgba, decodePngRgba } from './lib/png-icons.mjs';
import { decodeMGBAHardwareVideoState } from './native-scene-framebuffer-contract.mjs';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const romPath = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
fs.mkdirSync(out, { recursive: true });
const nm = spawnSync('/opt/devkitpro/devkitARM/bin/arm-none-eabi-nm', ['-S', '-C', romPath.replace(/\.gba$/, '.elf')], { encoding: 'utf8' });
assert.equal(nm.status, 0);
const symbols = nm.stdout.split('\n').map(l => { const m = l.match(/^([\da-f]+) ([\da-f]+) (\w) (.*)$/); return m ? { address: parseInt(m[1], 16), size: parseInt(m[2], 16), name: m[4] } : null; }).filter(Boolean);
const nativeState = symbols.find(s => /::runtime_state$/.test(s.name) && s.size === 48);
assert.ok(nativeState, 'matching racing ELF state');
const animator = symbols.find(s => /::vehicle_animator$/.test(s.name));
const animations = Object.fromEntries(symbols.filter(s => s.name.startsWith('gbastudio_racing_project::racing_room_') && s.name.endsWith('_animation')).map(s => [s.address, s.name]));
const wasm = new WebAssembly.Module(fs.readFileSync(app + '/static/WebPlayer/player/mgba-core.wasm'));
const m = await createMGBA({ print: () => { }, printErr: () => { }, instantiateWasm(imports, done) { const i = new WebAssembly.Instance(wasm, imports); done(i); return i.exports; } });
const rd16 = a => m._gba_audio_register(a) >>> 0, rd32 = a => rd16(a) | (rd16(a + 2) << 16), a = nativeState.address;
function state() { return { ...readRuntimeTelemetry(m), registers: { display: rd16(0x04000000), bg0: rd16(0x04000008), bg1: rd16(0x0400000a), bg2: rd16(0x0400000c), window: rd16(0x04000048), outside: rd16(0x0400004a) }, race: { x: rd32(a) / 256, y: rd32(a + 4) / 256, speed: rd32(a + 8) / 256, distance: rd32(a + 12) / 256, laps: rd32(a + 16), rival: rd32(a + 20) / 256, gates: rd32(a + 24), result: rd16(a + 32) & 255, heading: rd16(a + 36) & 255, angle: rd16(a + 38), collision: rd16(a + 40) & 255, elapsed: rd32(a + 44) }, animation: animations[rd32(animator.address)], animationFrame: rd16(animator.address + 4) & 255 }; }
function run(frames, keys = 0) {
    m._gba_set_keys(keys);
    for (let i = 0; i < frames; i++) {
        m._gba_run_frame();
        const count = m._gba_audio_sample_count(), p = m._gba_audio_samples(), room = readRuntimeTelemetry(m)?.currentRoom ?? 0;
        if (audio[room] && count > 0) {
            const samples = new Int16Array(m.HEAPU8.buffer, p, count * 2), a = audio[room];
            for (const value of samples) {
                const v = value / 32768;
                a.peak = Math.max(a.peak, Math.abs(v));
                a.sum += v * v;
                a.count++;
            }
        }
    }
}
const manifest = JSON.parse(fs.readFileSync(app + '/fixtures/asset-provenance/racing-approved-manifest.json'));
const art = n => decodePngRgba(fs.readFileSync(app + '/default-assets/templates/exemplo-gba/Assets/' + n));
const images = { top: art('backgrounds/racing-approved-topdown.png'), floor: art('backgrounds/racing-approved-floor.png'), panorama: art('backgrounds/racing-approved-panorama.png'), panel: art('ui/racing-approved-hud-panel.png') };
const raster = symbols.find(s => s.name.endsWith('::pseudo3d_affine_raster'));
const rgb = (pixels, i) => (pixels[i] >> 3) | ((pixels[i + 1] >> 3) << 5) | ((pixels[i + 2] >> 3) << 10);
const checks = [], fidelity = [], audio = [{ peak: 0, sum: 0, count: 0 }, { peak: 0, sum: 0, count: 0 }];
function verifyPixels(sample) {
    if (sample.state.currentRoom === 1) {
        const byte = a => (rd16(a & ~1) >> ((a & 1) * 8)) & 255;
        const points = [[232, 112], [240, 112], [256, 128]];
        console.log('floor-hardware', JSON.stringify({ samples: points.map(([x, y]) => { const tile = byte(0x06000000 + (y >> 3) * 64 + (x >> 3)), index = byte(0x06008000 + tile * 64 + (y & 7) * 8 + (x & 7)); return { x, y, tile, index, color: rd16(0x05000000 + index * 2), png: rgb(images.floor.pixels, (y * 512 + x) * 4) }; }), raster120: Array.from({ length: 6 }, (_, i) => rd32(raster.address + 120 * 16 + i * 4)), affine: [rd16(0x04000020), rd16(0x04000024), rd32(0x04000028), rd32(0x0400002c)], dma0: [rd32(0x040000b0), rd32(0x040000b4), rd32(0x040000b8)] }));
    }
    const screen = m.HEAPU8.slice(m._gba_framebuffer(), m._gba_framebuffer() + 153600), room = sample.state.currentRoom, objects = sample.video.objects;
    const sheet = art('sprites/' + (room === 0 ? 'racing-approved-overhead-nara.png' : 'racing-approved-rear-nara.png'));
    const o = objects.find(o => o.index === 0), name = sample.state.animation?.split('_player_')[1]?.replace(/_animation$/, ''), clip = manifest.animations.find(c => c.spriteSheet === (room === 0 ? 'racing-approved-overhead-nara.png' : 'racing-approved-rear-nara.png') && c.name === name);
    assert.ok(o && clip, 'player and source clip are known');
    let actorPixels = 0, bgPixels = 0, panelPixels = 0;
    const frame = clip.frames[sample.state.animationFrame].sourceFrameIndex;
    for (let y = 0; y < o.height; y++)
        for (let x = 0; x < o.width; x++) {
            const at = (y * sheet.width + frame * o.width + x) * 4, dx = o.x + x, dy = o.y + y;
            if (!sheet.pixels[at + 3] || dx < 0 || dx >= 240 || dy < 0 || dy >= 160)
                continue;
            assert.equal(rgb(screen, (dy * 240 + dx) * 4), rgb(sheet.pixels, at), 'approved player RGB555');
            actorPixels++;
        }
    for (const [px, py] of [[3, 3], [88, 3], [173, 3], [173, 141]])
        for (let y = 0; y < 16; y++)
            for (let x = 0; x < 64; x++) {
                const at = (y * 64 + x) * 4;
                if (!images.panel.pixels[at + 3] || (y >= 4 && y < 12 && x >= 7 && x < 56))
                    continue;
                assert.equal(rgb(screen, ((py + y) * 240 + px + x) * 4), rgb(images.panel.pixels, at), 'approved HUD border RGB555');
                panelPixels++;
            }
    const misses = [];
    for (let y = 0; y < 160; y++)
        for (let x = 0; x < 240; x++) {
            if (objects.some(o => x >= o.x && x < o.x + o.width && y >= o.y && y < o.y + o.height))
                continue;
            let source, at;
            if (room === 0) {
                source = images.top;
                at = ((sample.video.bg[2].y + y) * 512 + sample.video.bg[2].x + x) * 4;
            }
            else if (y < 48) {
                source = images.panorama;
                at = (y * 256 + ((x + sample.video.bg[1].x) & 255)) * 4;
            }
            else {
                const base = raster.address + y * 16, sign = n => n & 0x8000 ? n - 65536 : n;
                const wx = (rd32(base + 4) + sign(rd16(base)) * x) >> 8, wy = (rd32(base + 8) + sign(rd16(base + 2)) * x) >> 8;
                source = images.floor;
                at = wx >= 0 && wy >= 0 && wx < 512 && wy < 512 ? (wy * 512 + wx) * 4 : 0;
            }
            const expected = rgb(source.pixels, at), actual = rgb(screen, (y * 240 + x) * 4);
            if (expected !== actual && misses.length < 8)
                misses.push({ x, y, expected, actual });
            bgPixels++;
        }
    assert.deepEqual(misses, [], 'approved world RGB555 and affine camera sampling');
    assert.ok(actorPixels > 150 && bgPixels > 15000 && panelPixels > 1000);
    fidelity.push({ sample: sample.name, actorPixels, bgPixels, panelPixels, sourceFrame: frame });
}
function autoRace(roomName) {
    const path = manifest.scenes.find(r => r.name === roomName).pathPoints, headings = new Set(), clips = new Set();
    let lastGate = 0;
    function target(s) {
        let best = null;
        for (let i = 0; i < path.length; i++) {
            const p = path[i], q = path[(i + 1) % path.length], dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy);
            const t = Math.max(0, Math.min(1, ((s.x - p.x) * dx + (s.y - p.y) * dy) / (len * len))), x = p.x + dx * t, y = p.y + dy * t, d = (s.x - x) ** 2 + (s.y - y) ** 2;
            if (!best || d < best.d)
                best = { i, t, len, d };
        }
        let i = best.i, d = best.t * best.len + 44;
        for (let n = 0; n < path.length; n++) {
            const p = path[i], q = path[(i + 1) % path.length], len = Math.hypot(q.x - p.x, q.y - p.y);
            if (d <= len)
                return { x: p.x + (q.x - p.x) * d / len, y: p.y + (q.y - p.y) * d / len };
            d -= len;
            i = (i + 1) % path.length;
        }
        return path[0];
    }
    for (let f = 0; f < 18000; f++) {
        const s = state(), r = s.race;
        if (r.result !== 0) {
            assert.equal(r.result, 1, roomName + ' race victory');
            assert.equal(r.laps, 3);
            assert.equal(r.gates, 12);
            checks.push(roomName + ': three laps through ordered gates');
            return { frames: f, state: s, headings: [...headings], clips: [...clips] };
        }
        const point = target(r), desired = (Math.atan2(point.x - r.x, -(point.y - r.y)) * 8 / Math.PI + 16) % 16, current = roomName === 'circuito_final' ? r.heading : r.angle / 256;
        let error = (desired - current + 24) % 16 - 8;
        const steer = Math.abs(error) > (roomName === 'circuito_final' ? .35 : .16) ? (error > 0 ? 16 : 32) : 0;
        headings.add(r.heading);
        if (s.animation)
            clips.add(s.animation);
        run(1, 1 | steer);
        if (r.gates > lastGate) {
            lastGate = r.gates;
            console.log(roomName, 'gate', r.gates, 'at', Math.round(r.x), Math.round(r.y));
        }
    }
    throw Error(roomName + ' did not finish: ' + JSON.stringify(state().race));
}
const shots = [];
function shot(name) { const rgba = m.HEAPU8.slice(m._gba_framebuffer(), m._gba_framebuffer() + 153600); for (let i = 3; i < rgba.length; i += 4)
    rgba[i] = 255; fs.writeFileSync(path.join(out, name + '.png'), encodePngRgba({ width: 240, height: 160, pixels: rgba })); const n = m._gba_state_size(), p = m._malloc(n); m._gba_save_state(p, n); const video = decodeMGBAHardwareVideoState(m.HEAPU8.slice(p, p + n)); m._free(p); const s = { name, state: state(), video }; shots.push(s); console.log(name, JSON.stringify({ room: s.state.currentRoom, race: s.state.race, animation: s.state.animation })); return s; }
try {
    m._gba_init();
    const rom = fs.readFileSync(romPath), p = m._malloc(rom.length);
    m.HEAPU8.set(rom, p);
    assert.equal(m._gba_load_rom(p, rom.length), 1);
    m._free(p);
    run(600);
    const topInitial = shot('topdown-initial');
    verifyPixels(topInitial);
    run(40, 1);
    shot('topdown-driving');
    run(15, 2);
    shot('topdown-braking');
    run(4, 256);
    run(620);
    const pseudoInitial = shot('pseudo-initial');
    assert.equal(pseudoInitial.state.currentRoom, 1);
    assert.ok(pseudoInitial.state.registers.display & 0x2000, 'perspective horizon window remains active');
    assert.equal((pseudoInitial.state.registers.bg0 >> 2) & 3, 2, 'HUD blank/font tiles have isolated VRAM');
    verifyPixels(pseudoInitial);
    // Every hardware frame must reuse a complete HDMA table, including frames between renders.
    for(let frame=0;frame<60;frame++){
        run(1);
        const bytes=m.HEAPU8.slice(m._gba_framebuffer(),m._gba_framebuffer()+153600),base=raster.address+144*16;
        const sign=n=>n&0x8000?n-65536:n;
        for(const x of [80,100,120,140,160]){
            const wx=(rd32(base+4)+sign(rd16(base))*x)>>8,wy=(rd32(base+8)+sign(rd16(base+2))*x)>>8;
            assert.equal(rgb(bytes,(144*240+x)*4),rgb(images.floor.pixels,(wy*512+wx)*4),'stable affine floor on each display frame');
        }
    }
    checks.push('60 consecutive display frames retain exact affine floor samples');

    run(40, 1);
    shot('pseudo-driving');
    run(8, 1 | 16);
    shot('pseudo-right');
    run(6, 2 | 32);
    shot('pseudo-brake-left');
    assert.match(state().animation, /brake_left_animation$/);
    run(20, 1 | 16);
    shot('pseudo-steer-right');
    run(6, 2 | 16);
    shot('pseudo-brake-right');
    assert.match(state().animation, /brake_right_animation$/);
    m._gba_reset();
    run(600);
    const topRace = autoRace('circuito_final');
    shot('topdown-victory');
    assert.ok([0, 4, 8, 12].every(h => topRace.headings.includes(h)), 'all overhead directions driven');
    m._gba_reset();
    run(600);
    run(4, 256);
    run(620);
    const rearRace = autoRace('circuito_perspectiva');
    shot('pseudo-victory');
    m._gba_reset();
    run(600);
    run(240, 1);
    const impact = shot('topdown-impact');
    assert.ok(impact.state.race.collision > 0);
    assert.match(impact.state.animation, /hurt/);
    checks.push('solid track boundary, hurt animation and recovery');
    for (const [i, a] of audio.entries()) {
        assert.ok(a.peak > .005 && a.peak < .99, 'audible unclipped scene ' + i);
        a.rms = Math.sqrt(a.sum / a.count);
        delete a.sum;
    }
    fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ ok: true, checks, fidelity, audio, races: [topRace, rearRace], shots }, null, 2));
}
finally {
    m._gba_destroy();
}
