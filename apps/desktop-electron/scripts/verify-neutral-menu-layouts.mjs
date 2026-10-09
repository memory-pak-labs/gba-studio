import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry,restoreModuleSavedata} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {encodePngRgba,decodePngRgba} from './lib/png-icons.mjs';
const [romPath,dir,mode='inventory',savePath]=process.argv.slice(2);
mkdirSync(dir,{recursive:true});
const wasm=readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm',import.meta.url));
const core=await createMGBA({print:()=>{},printErr:()=>{},instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(new WebAssembly.Module(wasm),imports);receive(instance);return instance.exports;}});
assert.equal(core._gba_init(),1);const rom=readFileSync(romPath),ptr=core._malloc(rom.length);core.HEAPU8.set(rom,ptr);assert.equal(core._gba_load_rom(ptr,rom.length),1);core._free(ptr);
if(savePath)assert.equal(restoreModuleSavedata(core,readFileSync(savePath)),true);
const run=(keys,n)=>{core._gba_set_keys(keys);for(let i=0;i<n;i++)core._gba_run_frame();};
const tap=keys=>{run(keys,4);run(0,60);};
const frame=()=>Buffer.from(core.HEAPU8.slice(core._gba_framebuffer(),core._gba_framebuffer()+240*160*4));
const state=()=>readRuntimeTelemetry(core);
const hash=data=>createHash('sha256').update(data).digest('hex');
const samples=[];
function capture(label){const pixels=frame();for(let i=3;i<pixels.length;i+=4)pixels[i]=255;writeFileSync(`${dir}/${label}.png`,encodePngRgba({width:240,height:160,pixels}));samples.push({label,hash:hash(pixels),telemetry:state()});return pixels;}
function matchesSprite(pixels,id,x,y){const sprite=decodePngRgba(readFileSync(new URL(`../default-assets/templates/exemplo-gba/Assets/sprites/neutral-${id}-gba.png`,import.meta.url)));let visible=0,matching=0;for(let py=0;py<sprite.height;py++)for(let px=0;px<sprite.width;px++){const s=(py*sprite.width+px)*4;if(!sprite.pixels[s+3])continue;visible++;const d=((y+py)*240+x+px)*4;if([0,1,2].every(k=>Math.abs(pixels[d+k]-sprite.pixels[s+k])<=8))matching++;}assert.ok(matching/visible>0.85,`${id}: ${matching}/${visible} visible pixels match`);}
run(0,180);
if(mode==='inventory') {
  const gameplay=state();tap(8);tap(128);tap(1);
  const first=capture('inventory-estrutura');matchesSprite(first,'detail-item-estrutura',148,40);
  tap(16);const grip=capture('inventory-aderencia');matchesSprite(grip,'detail-item-aderencia',148,40);assert.notEqual(hash(first),hash(grip));
  tap(16);const cell=capture('inventory-celula');matchesSprite(cell,'detail-item-celula',148,40);assert.notEqual(hash(grip),hash(cell));
  tap(32);const back=capture('inventory-left-aderencia');matchesSprite(back,'detail-item-aderencia',148,40);
  tap(2);tap(2);assert.equal(state().runtimeKind,gameplay.runtimeKind);assert.deepEqual(state().player,gameplay.player);
} else {
  // Full mixed-project ROM with development boot at the title; SRAM comes from the save regression.
  tap(1);tap(16);tap(1);assert.equal(state().currentRoom,4);capture('carregar-jogo');
  tap(1);run(0,180);assert.equal(state().runtimeKind,0,'Load returns to Porto Lumen');capture('loaded-porto');
  core._gba_reset();run(0,180);tap(1);for(let i=0;i<4;i++)tap(16);tap(1);assert.equal(state().currentRoom,6);capture('creditos');
  tap(1);capture('creditos-dialogue');tap(2);tap(2);assert.equal(state().currentRoom,1,'Back closes detail and returns to title options');
}
writeFileSync(`${dir}/evidence.json`,JSON.stringify({romHash:hash(rom),mode,samples},null,2));core._gba_destroy();
