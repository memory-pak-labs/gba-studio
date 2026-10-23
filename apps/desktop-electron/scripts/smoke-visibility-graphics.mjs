import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { readRuntimeTelemetry } from '../static/WebPlayer/player/mgba-direct-player.mjs';
import { encodePngRgba } from './lib/png-icons.mjs';

const [packArg, outputArg, modeArg] = process.argv.slice(2);
assert.ok(packArg && outputArg, 'Usage: smoke-visibility-graphics.mjs ENGINE_PACK OUTPUT [MODE]');
const pack = path.resolve(packArg), output = path.resolve(outputArg);
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = path.resolve(app, '../../packages/GBAStudioEngine');
fs.mkdirSync(output, { recursive: true });
function command(bin, args, log, env = process.env) {
  const result = spawnSync(bin, args, { cwd: app, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  fs.writeFileSync(log, (result.stdout ?? '') + (result.stderr ?? ''));
  assert.equal(result.status, 0, `${bin} failed; see ${log}`);
}
command(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'src/main/visibilityRomFixture.test.ts'], path.join(output, 'export.log'), { ...process.env, GBA_STUDIO_VISIBILITY_FIXTURE_ROOT: output, GBA_STUDIO_VISIBILITY_ENGINE_PACK: pack });
const wasm = new WebAssembly.Module(fs.readFileSync(path.join(app, 'static/WebPlayer/player/mgba-core.wasm')));
for (const mode of modeArg ? [modeArg] : ['resident', 'paged', 'platformer']) {
  const directory = path.join(output, mode); fs.mkdirSync(directory, { recursive: true });
  const contract = JSON.parse(fs.readFileSync(path.join(output, mode === 'platformer' ? 'platformer.json' : 'topdown.json')));
  command('python3', [path.join(engine, 'tests/host/visibility_rom_fixture.py'), pack, directory, path.join(output, mode === 'platformer' ? 'platformer.json' : 'topdown.json'), '--mode', mode], path.join(output, mode+'-fixture.log'));
  command('python3', [path.join(pack, 'tools/gbsbuild'), '--engine-pack', pack, '--project-dir', directory], path.join(output, mode+'-build.log'));
  const rom = fs.readFileSync(path.join(directory, 'build/replace_tile.gba'));
  const report = { ok: false, mode, romSha256: createHash('sha256').update(rom).digest('hex'), samples: [], inputs: [] };
  const nm = spawnSync(path.join(process.env.DEVKITARM ?? '/opt/devkitpro/devkitARM', 'bin/arm-none-eabi-nm'), ['-S', '-C', path.join(directory, 'build/replace_tile.elf')], { encoding: 'utf8' });
  assert.equal(nm.status, 0);
  const camera = nm.stdout.split('\n').map(line => line.match(/^([\da-f]+) [\da-f]+ \w \(anonymous namespace\)::camera$/)).find(Boolean);
  assert.ok(camera); const cameraAddress = parseInt(camera[1], 16);
  const symbol = name => { const match = nm.stdout.split('\n').find(line => line.endsWith(`(anonymous namespace)::${name}`)); assert.ok(match, `ELF oracle ${name}`); return parseInt(match.slice(0,8),16); };
  const visibilityAddress = symbol('visibility_controller'), visualAddress = symbol('visual_effects');
  const core = await createMGBA({ print: () => {}, printErr: () => {}, instantiateWasm(imports, done) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
  const state = () => readRuntimeTelemetry(core);
  const read16 = address => core._gba_audio_register(address) & 65535;
  const read32 = address => (read16(address) | read16(address + 2) << 16) | 0;
  const visibility = () => ({ actor: read16(visibilityAddress) << 16 >> 16, width: read16(visibilityAddress+2), height: read16(visibilityAddress+4), duration: read16(visibilityAddress+6), remaining: read16(visibilityAddress+8), elapsed: read16(visibilityAddress+10), intensity: read16(visibilityAddress+12)&255, reveal: (read16(visibilityAddress+12)>>>8)!==0, active: (read16(visibilityAddress+14)&255)!==0 });
  const framebufferPixel = (x,y) => { const offset=core._gba_framebuffer()+(y*240+x)*4; return [...core.HEAPU8.slice(offset,offset+3)]; };

  function run(frames, keys = 0) { report.inputs.push({ frames, keys }); core._gba_set_keys(keys); for (let i = 0; i < frames; ++i) core._gba_run_frame(); }
  function until(predicate, description, limit = 600, keys = 0) { for (let i = 0; i < limit && !predicate(); ++i) run(1, keys); assert.ok(predicate(), description); }
  function press(keys) {
    const before = state().frame;
    run(1, keys);
    until(() => state().frame > before && (state().input.held & keys) === keys, 'runtime samples button', 240, keys);
    // Telemetry is published before the next complete framebuffer. Settle by native
    // runtime frames so slower platformer frames cannot leave the previous image.
    advance(3);
  }
  function advance(frames) { const target = state().frame + frames; until(() => state().frame >= target, `advance ${frames} runtime frames`, frames * 12 + 240); }
  function capture(label) {
    const pixels = core.HEAPU8.slice(core._gba_framebuffer(), core._gba_framebuffer() + 153600);
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
    const sample = { label, state: state(), camera: { x: read32(cameraAddress), y: read32(cameraAddress + 4) }, visibility: visibility(), dispcnt: read16(0x04000000), winin: read16(0x04000048), winout: read16(0x0400004a), blend: read16(0x04000050), localEffectIntensity: read16(visualAddress+8)&255, probe: { x: read16(0x070003c2) & 511, y: read16(0x070003c0) & 255, mode: read16(0x070003c0) >>> 10 & 3 } };
    report.samples.push(sample);
    fs.writeFileSync(path.join(directory, label+'.png'), encodePngRgba({ width: 240, height: 160, pixels }));
    return { ...sample, pixels, pixel(x, y) { const offset = (y*240+x)*4; return [...pixels.slice(offset, offset+3)]; } };
  }
  function brightPixels(sample) { let count=0; for(let i=0;i<sample.pixels.length;i+=4) if(sample.pixels[i]===0 && sample.pixels[i+1]===198 && sample.pixels[i+2]===33) ++count; return count; }
  function probeColumns(pixels, red) {
    return Array.from({length:240},(_,x)=>x).filter(x=>{
      const at=(36*240+x)*4;
      return pixels[at]>0 && (red===undefined || pixels[at]===red) && pixels[at+1]===0 && pixels[at+2]===0;
    });
  }
  function presentedProbeIs(red) { return probeColumns(core.HEAPU8.subarray(core._gba_framebuffer(),core._gba_framebuffer()+153600),red).length===8; }
  function assertProbe(sample, color) {
    // OAM has already published the next frame when the completed framebuffer
    // is read. Locate the rendered probe independently, then verify all 64 pixels.
    const columns=probeColumns(sample.pixels);
    assert.equal(columns.length,8,'the framebuffer contains the complete moving probe');
    const x=columns[0];
    for(let y=32;y<40;++y) for(let dx=0;dx<8;++dx) assert.deepEqual(sample.pixel(x+dx,y),color);
    sample.probe.framebufferX=x;
    return x;
  }
  function light(label, actor, width, height) {
    const sample = capture(label), position = actor === 'player' ? sample.state.player : sample.state.firstActor;
    const cx = position.x + 8 - sample.camera.x, cy = position.y + 8 - sample.camera.y;
    assert.ok(sample.dispcnt & (1<<14), 'WIN1 enabled');
    assert.equal(sample.winin >>> 8 & 63, 31); assert.equal(sample.winout & 63, 63);
    const rect = { left: Math.max(0,cx-Math.floor(width/2)), right: Math.min(240,cx-Math.floor(width/2)+width), top: Math.max(0,cy-Math.floor(height/2)), bottom: Math.min(160,cy-Math.floor(height/2)+height) };
    assert.equal(sample.visibility.width,width); assert.equal(sample.visibility.height,height); assert.equal(sample.visibility.intensity,75);
    const y=rect.top+1;
    assert.deepEqual(sample.pixel(cx,y),[0,198,33],'inside stays bright');
    assert.deepEqual(sample.pixel(rect.left,y),[0,198,33],'first inside column');
    assert.deepEqual(sample.pixel(rect.right-1,y),[0,198,33],'last inside column');
    if(rect.left>0) assert.deepEqual(sample.pixel(rect.left-1,y),[0,49,8],'left outside column is dark');
    if(rect.right<240) assert.deepEqual(sample.pixel(rect.right,y),[0,49,8],'right outside column is dark');
    assert.deepEqual(sample.pixel(230,150),[0,49,8],'75% exterior darkening');
    assert.deepEqual(sample.pixel(cx,rect.top),[0,198,33],'first inside row');
    assert.deepEqual(sample.pixel(cx,rect.bottom-1),[0,198,33],'last inside row');
    if(rect.top>0) assert.deepEqual(sample.pixel(cx,rect.top-1),[0,49,8],'top outside row is dark');
    if(rect.bottom<160) assert.deepEqual(sample.pixel(cx,rect.bottom),[0,49,8],'bottom outside row is dark');
    sample.expectedRect=rect;
    return sample;
  }
  try {
    assert.equal(core._gba_init(), 1);
    const pointer = core._malloc(rom.length); core.HEAPU8.set(rom,pointer); assert.equal(core._gba_load_rom(pointer,rom.length),1); core._free(pointer);
    run(180); const initial=capture('initial'); assertProbe(initial,[255,0,0]);
    press(1); const playerLight=light('lantern-player','player',80,64);
    until(() => state().player.x >= playerLight.state.player.x+16,'player moves with lantern',240,16); run(2); const moved=light('lantern-moved','player',80,64); assert.ok(moved.expectedRect.left > playerLight.expectedRect.left);
    press(4); const npcLight=light('lantern-guide','guide',64,48);
    press(256); const npcMoved=light('lantern-guide-moved','guide',64,48); assert.ok(npcMoved.expectedRect.left > npcLight.expectedRect.left);
    press(1); until(() => read32(cameraAddress)>0,'camera scrolls with the lit player',360,16); run(2); light('lantern-camera','player',80,64);
    press(2); assert.equal(read16(0x04000000)&(1<<14),0); const cleared=capture('cleared'); assert.deepEqual(cleared.pixel(230,150),[0,198,33]);
    press(512); const revealStart=capture('reveal-start'); advance(12); const revealMiddle=capture('reveal-middle'); assert.ok(revealMiddle.visibility.elapsed > revealStart.visibility.elapsed); assert.ok(brightPixels(revealMiddle)>brightPixels(revealStart),'the revealed framebuffer area expands'); advance(130); const revealed=capture('reveal-finished'); assert.equal(revealed.dispcnt&(1<<14),0); assert.deepEqual(revealed.pixel(230,150),[0,198,33]);
    press(1); advance(250); assert.equal(read16(0x04000000)&(1<<14),0,'lantern duration expires');
    press(128); until(() => state().variables[contract.coverVariable]===1,'full cover reached'); advance(2); const closed=capture('full-cover'); for(let i=0;i<closed.pixels.length;i+=4) assert.deepEqual([...closed.pixels.slice(i,i+3)],[0,0,0],'closed mask has no 1px seam'); advance(20);
    press(1); press(8);
    until(() => state().variables[contract.modeVariable]===1 && (read16(visualAddress+8)&255)===50 && framebufferPixel(239,159).every(value=>value===0) && presentedProbeIs(128),'mask + 50% fade + blended moving sprite');
    const blended=capture('combined-blended'); assert.equal(blended.dispcnt&(1<<14),0,'transition has priority over lantern'); assert.equal(blended.probe.mode,1); // No second blend target is enabled: mGBA 0.10.5 applies brightness to the OBJ.
    const blendedX=assertProbe(blended,[128,0,0]); assert.deepEqual(blended.pixel(239,159),[0,0,0]);
    until(() => state().variables[contract.modeVariable]===2 && (read16(0x070003c0)>>>10&3)===2 && probeColumns(core.HEAPU8.subarray(core._gba_framebuffer(),core._gba_framebuffer()+153600)).length===0,'object-window sprite mode'); const objectWindow=capture('combined-object-window'); assert.deepEqual(objectWindow.pixel(blendedX+4,36),[0,99,16]);
    until(() => state().variables[contract.modeVariable]===0 && (read16(0x070003c0)>>>10&3)===0 && presentedProbeIs(128),'normal sprite mode restored'); const normal=capture('combined-normal'); const normalX=assertProbe(normal,[128,0,0]); assert.notEqual(normalX,blendedX,'rendered sprite moves during combined effects');
    until(() => state().currentRoom===1,'scene transition completed'); advance(65); const transitioned=capture('after-scene-transition'); assert.equal(transitioned.dispcnt&((1<<13)|(1<<14)),0); assert.equal(transitioned.blend,0); assert.equal(transitioned.probe.mode,0); assertProbe(transitioned,[255,0,0]);
    report.ok=true;
  } catch(error) { report.error=String(error); throw error; }
  finally { report.finalState=state(); fs.writeFileSync(path.join(directory,'verification.json'),JSON.stringify(report,null,2)); core._gba_destroy(); }
  console.log(`PASS ${mode}: actor/camera follow, intensity, reveal, expiry, mask/fade, moving sprite modes and scene reset`);
}
