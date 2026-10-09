import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry, copyModuleSavedata} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {encodePngRgba} from './lib/png-icons.mjs';
import {ROUTE_DESTINATIONS} from './route-map-project.mjs';

const [romPath, dir, mode = 'campaign'] = process.argv.slice(2);
if (!dir) throw new Error('Uso: node verify-route-map-rom.mjs <rom> <evidence-dir> [campaign|unlocked]');
const rom = readFileSync(romPath);
const wasm = new WebAssembly.Module(readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm', import.meta.url)));
const samples = [];
mkdirSync(dir, {recursive:true});
async function boot() {
  const core = await createMGBA({print:()=>{}, printErr:()=>{}, instantiateWasm(imports, receive) {
    const instance = new WebAssembly.Instance(wasm, imports); receive(instance); return instance.exports;
  }});
  assert.equal(core._gba_init(), 1);
  const ptr = core._malloc(rom.length); core.HEAPU8.set(rom, ptr);
  assert.equal(core._gba_load_rom(ptr, rom.length), 1); core._free(ptr);
  const run = (keys, frames) => {core._gba_set_keys(keys); for(let i=0;i<frames;i++) core._gba_run_frame();};
  const tap = key => {run(key, 4); run(0, 12);};
  const state = () => readRuntimeTelemetry(core);
  const shot = label => {
    const pixels = Buffer.from(core.HEAPU8.slice(core._gba_framebuffer(), core._gba_framebuffer()+240*160*4));
    const colors = new Set();
    for(let y=24;y<128;y++) for(let x=0;x<240;x++) colors.add(pixels.readUInt32LE((y*240+x)*4)&0xffffff);
    for(let i=3;i<pixels.length;i+=4) pixels[i]=255;
    writeFileSync(`${dir}/${label}.png`, encodePngRgba({width:240,height:160,pixels}));
    const sample = {label, colors:colors.size, telemetry:state(), frameHash:createHash('sha256').update(pixels).digest('hex')};
    if(sample.telemetry.runtimeKind===10) assert.ok(colors.size>40, 'O mapa precisa conter os tiles detalhados, não somente o mar');
    samples.push(sample); return sample;
  };
  run(0, 180); assert.equal(state().runtimeKind, 10);
  return {core, run, tap, state, shot};
}

// Explicit input paths also catch unintended directional-neighbor changes.
// Discoverability is asserted at each endpoint; gated nodes remain selectable.
function pathTo(target) {
  const queue=[[0,[]]], seen=new Set([0]);
  while(queue.length) {
    const [from, keys]=queue.shift(); if(from===target) return keys;
    for(const [key,dx,dy] of [[16,1,0],[32,-1,0],[64,0,-1],[128,0,1]]) {
      const [, ,x,y]=ROUTE_DESTINATIONS[from];
      let next=-1, best=Infinity;
      ROUTE_DESTINATIONS.forEach(([, ,nx,ny],index)=>{
        const ax=nx-x, ay=ny-y;
        if(index===from || (dx && ax*dx<=0) || (dy && ay*dy<=0)) return;
        const score=dx ? Math.abs(ax)+Math.abs(ay)*2 : Math.abs(ay)+Math.abs(ax)*2;
        if(score<best) {best=score;next=index;}
      });
      if(next>=0&&!seen.has(next)) {seen.add(next);queue.push([next,[...keys,key]]);}
    }
  }
  throw new Error(`Destino sem caminho: ${target}`);
}
for(let target=0;target<ROUTE_DESTINATIONS.length;target++) {
  const t=await boot(); for(const key of pathTo(target)) t.tap(key);
  assert.equal(t.state().currentRoom,target);
  const selected=t.shot(`node-${target}-selected`);
  assert.deepEqual(selected.telemetry.player,{x:79,y:224,direction:0},'Selecionar não teletransporta a aeronave');
  t.tap(1);t.run(0,35);t.shot(`node-${target}-action`);
  if(mode==='unlocked'||target<2) {
    assert.equal(t.state().runtimeKind,10,'A viagem não muda de cena antes da chegada');
    const expectedRuntime = [0,1,5,5,2,6,9,7][target];
    for (let waited=0; waited<600 && t.state().runtimeKind!==expectedRuntime; waited++) t.run(0,1);
    t.run(0,30);
    const arrived=t.shot(`node-${target}-arrival`);
    assert.equal(arrived.telemetry.runtimeKind,expectedRuntime);
  } else {
    t.run(0,180);assert.equal(t.state().runtimeKind,10);
    assert.deepEqual(t.state().player,selected.telemetry.player,'Destino bloqueado não inicia voo');
  }
  t.core._gba_destroy();
}
const t=await boot();t.tap(64);t.tap(64);assert.equal(t.state().currentRoom,1);
t.tap(1);t.run(0,35);const flight=t.shot('flight-before-pause');
t.tap(8);t.run(0,60);assert.equal(t.state().runtimeKind,3);t.shot('flight-paused');
t.tap(128);t.tap(128);t.tap(128);t.tap(1);t.tap(1);
writeFileSync(`${dir}/flight-save.sav`,copyModuleSavedata(t.core));t.shot('flight-saved');
t.tap(2);assert.equal(t.state().runtimeKind,3);
t.tap(2);t.run(0,35);t.shot('resume-attempt');assert.equal(t.state().runtimeKind,10);
const resumed=t.shot('flight-resumed');
assert.ok(Math.abs(resumed.telemetry.player.y-flight.telemetry.player.y)<60,'Retomar preserva o ponto do voo');
t.tap(2);assert.equal(t.state().currentRoom,0);assert.equal(t.state().player.y,224);t.shot('flight-cancelled');
t.tap(2);t.run(0,80);assert.equal(t.state().runtimeKind,0);t.shot('back-to-porto');t.core._gba_destroy();
writeFileSync(`${dir}/evidence.json`,JSON.stringify({romSha256:createHash('sha256').update(rom).digest('hex'),mode,samples},null,2));
console.log(`PASS: 8 destinos, ${mode}, pausa durante voo, retomada, cancelamento e Porto.`);
