// The complete mixed ROM is driven only by buttons; OAM/state are read-only oracles.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {decodeMGBAHardwareVideoState} from './native-scene-framebuffer-contract.mjs';
import {encodePngRgba,decodePngRgba} from './lib/png-icons.mjs';
import {LUMEN_ROUTE_LABELS} from './world-map-lumen-promotion.mjs';
const [romPath,out]=process.argv.slice(2);assert.ok(romPath&&out,'Usage: smoke-world-map-lumen.mjs ROM evidence-dir');fs.mkdirSync(out,{recursive:true});
const rom=fs.readFileSync(romPath),wasm=new WebAssembly.Module(fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm',import.meta.url)));
const art=(folder,name)=>decodePngRgba(fs.readFileSync(new URL(`../default-assets/templates/exemplo-gba/Assets/${folder}/${name}`,import.meta.url)));
const bg=art('backgrounds','route-lumen-paged.png'),ship=art('sprites','route-dirigible-lumen-64.png'),font=art('fonts','route-lumen-hud-font.png'),cards=[0,1,2].map(i=>art('ui',`route-lumen-hud-card-${i}.png`));
const rgb=(data,i)=>(data[i]>>3)|((data[i+1]>>3)<<5)|((data[i+2]>>3)<<10);
const report={ok:false,romSha256:createHash('sha256').update(rom).digest('hex'),samples:[]};
const core=await createMGBA({print:()=>{},printErr:()=>{},instantiateWasm(imports,done){const instance=new WebAssembly.Instance(wasm,imports);done(instance);return instance.exports;}});
let audioPeak=0,audioSamples=0;
const run=(frames,keys=0)=>{core._gba_set_keys(keys);for(let i=0;i<frames;i++){
 core._gba_run_frame();const n=core._gba_audio_sample_count();
 const samples=new Int16Array(core.HEAPU8.buffer,core._gba_audio_samples(),n*2);
 for(const sample of samples)audioPeak=Math.max(audioPeak,Math.abs(sample));audioSamples+=samples.length;
}};
const tap=keys=>{run(5,keys);run(18);};
const state=()=>readRuntimeTelemetry(core);
function boot(){assert.equal(core._gba_init(),1);const ptr=core._malloc(rom.length);core.HEAPU8.set(rom,ptr);assert.equal(core._gba_load_rom(ptr,rom.length),1);core._free(ptr);run(180);assert.equal(state().runtimeKind,10);}
function snapshot(name){
 const ptr=core._gba_framebuffer(),pixels=core.HEAPU8.slice(ptr,ptr+153600);for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
 const size=core._gba_state_size(),sp=core._malloc(size);assert.equal(core._gba_save_state(sp,size),1);const saved=core.HEAPU8.slice(sp,sp+size);core._free(sp);const video=decodeMGBAHardwareVideoState(saved),v=new DataView(saved.buffer);
 for(const o of video.objects)o.doubleSize=o.affine&&(v.getUint16(0xc00+o.index*8,true)&0x200)!==0;
 const sample={name,state:state(),video};report.samples.push(sample);fs.writeFileSync(path.join(out,name+'.png'),encodePngRgba({width:240,height:160,pixels}));return{pixels,...sample};
}
function verifyText(sample,text,x,y){let count=0;for(const ch of text){const cp=ch.codePointAt(0),ox=((cp-32)%16)*8,oy=Math.floor((cp-32)/16)*8;for(let sy=0;sy<8;sy++)for(let sx=0;sx<8;sx++){
 const at=((oy+sy)*128+ox+sx)*4;if(!font.pixels[at+3])continue;assert.equal(rgb(sample.pixels,((y+sy)*240+x+sx)*4),rgb(font.pixels,at),`${sample.name}: HUD glyph ${ch} at ${x+sx},${y+sy}`);count++;}x+=6;}assert.ok(count>20);return count;}
function verifyIdleArt(sample){
 const o=sample.video.objects.find(o=>o.index===0);assert.ok(o?.affine&&o.doubleSize,'Player uses native affine double-size OBJ');assert.deepEqual([o.width,o.height],[64,64]);assert.deepEqual(o.matrix,{pa:256,pb:0,pc:0,pd:256});
 let actorPixels=0,bgPixels=0,paperPixels=0;
 for(let y=0;y<64;y++)for(let x=0;x<64;x++){const at=(y*64+x)*4;if(!ship.pixels[at+3])continue;const dx=o.x+32+x,dy=o.y+32+y;assert.equal(rgb(sample.pixels,(dy*240+dx)*4),rgb(ship.pixels,at),'Approved player RGB555 including outline');actorPixels++;}
 const camera=sample.video.bg[2];
 for(let y=0;y<160;y++)for(let x=0;x<240;x++){
  if(sample.video.objects.some(o=>x>=o.x&&y>=o.y&&x<o.x+o.width*(o.doubleSize?2:1)&&y<o.y+o.height*(o.doubleSize?2:1)))continue;
  assert.equal(rgb(sample.pixels,(y*240+x)*4),rgb(bg.pixels,((camera.y+y)*480+camera.x+x)*4),`Paged BG ${x},${y}`);bgPixels++;
 }
 for(let i=0;i<3;i++)for(let y=0;y<32;y++)for(let x=0;x<64;x++){
  const at=(y*64+x)*4,dx=6+i*64+x,dy=126+y;if(!cards[i].pixels[at+3]||dx>=240||dy>=160||(dx>=30&&dx<182&&((dy>=131&&dy<139)||(dy>=143&&dy<151))))continue;
  assert.equal(rgb(sample.pixels,(dy*240+dx)*4),rgb(cards[i].pixels,at),'Approved HUD frame RGB555');paperPixels++;
 }
 sample.checked={actorPixels,bgPixels,paperPixels,textPixels:verifyText(sample,'Porto Lumen',30,131)+verifyText(sample,LUMEN_ROUTE_LABELS.available,30,143)};
 report.samples.at(-1).checked=sample.checked;
}
try{
 boot();const idle=snapshot('idle-porto');verifyIdleArt(idle);
 report.audio={sampleRate:core._gba_audio_sample_rate(),samples:audioSamples,peak:audioPeak};assert.ok(audioPeak>0,'The map music produces audible PCM samples');
 tap(64);tap(64);assert.equal(state().currentRoom,1);tap(1);run(75);const flight=snapshot('flight-affine');const o=flight.video.objects.find(o=>o.index===0);
 assert.equal(flight.state.runtimeKind,10);assert.ok(o.affine&&o.doubleSize&&o.width===64);assert.ok(o.matrix.pb!==0&&o.matrix.pc!==0,'Affine inclination remains active in travel');assert.ok(o.matrix.pa!==256,'Affine scale remains active in travel');verifyText(flight,'Penedos do Vento',30,131);verifyText(flight,LUMEN_ROUTE_LABELS.journey,30,143);core._gba_destroy();
 boot();tap(16);assert.equal(state().currentRoom,2);tap(1);run(75);const locked=snapshot('locked-armazem');assert.deepEqual(locked.state.player,{x:79,y:224,direction:0});verifyText(locked,'Armazém das Marés',30,131);verifyText(locked,LUMEN_ROUTE_LABELS.locked,30,143);
 report.ok=true;
}catch(error){report.error=String(error);throw error;}finally{core._gba_destroy();fs.writeFileSync(path.join(out,'world-map-verification.json'),JSON.stringify(report,null,2));}
console.log('PASS: approved RGB555 BG, player, outline, HUD, accents, locked feedback and native affine matrix.');
