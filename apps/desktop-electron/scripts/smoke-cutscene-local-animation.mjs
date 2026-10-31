import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {decodePngRgba,encodePngRgba} from './lib/png-icons.mjs';
// The ROM must be exported from the canonical project with the development
// start scene set to abertura. Expected pixels come from the approved assets,
// never a screenshot produced by the runtime under test.
assert.ok(process.argv[2], "Usage: node scripts/smoke-cutscene-local-animation.mjs <opening.gba> [evidence-directory]");
const qa=process.argv[3] ? path.resolve(process.argv[3]) : null;
if(qa) fs.mkdirSync(qa,{recursive:true});
const sourceRoot=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('Assets/illustrations/opening/layers.json',sourceRoot)));
const wasm=fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm',import.meta.url));
const rom=fs.readFileSync(process.argv[2]);
const timeline={steps:manifest.runtime.steps};
const base=decodePngRgba(fs.readFileSync(new URL('Assets/backgrounds/opening-medium-shot-240x160.png',sourceRoot)));
const patches=decodePngRgba(fs.readFileSync(new URL('Assets/sprites/opening-local-animation-128x96.png',sourceRoot)));
const expectedPose=index=>{
  const pixels=Buffer.from(base.pixels);
  for(let y=0;y<96;y++)for(let x=0;x<128;x++){
    const source=(y*patches.width+index*128+x)*4;
    const destination=((y+56)*240+x+64)*4;
    if(patches.pixels[source+3])pixels.set(patches.pixels.subarray(source,source+4),destination);
  }
  return pixels;
};
const rgb555=p=>{const out=Buffer.alloc(38400*2);for(let i=0;i<38400;i++)out.writeUInt16LE((p[i*4]>>3)|((p[i*4+1]>>3)<<5)|((p[i*4+2]>>3)<<10),i*2);return out};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const poseHashes=Array.from({length:10},(_,i)=>sha(rgb555(expectedPose(i))));
const core=await createMGBA({print:()=>{},printErr:()=>{},instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(new WebAssembly.Module(wasm),imports);receive(instance);return instance.exports;}});
function init(){core._gba_init();const p=core._malloc(rom.length);core.HEAPU8.set(rom,p);assert.equal(core._gba_load_rom(p,rom.length),1);core._free(p);core._gba_set_keys(0);}
function frame(){const p=core._gba_framebuffer(),b=Buffer.from(core.HEAPU8.subarray(p,p+153600));for(let i=3;i<b.length;i+=4)b[i]=255;return b;}
function step(count,keys=0){core._gba_set_keys(keys);for(let i=0;i<count;i++)core._gba_run_frame();}
const report={ok:false,romSha256:sha(rom),romBytes:rom.length,runs:[],transitions:[],matchingPixelsPerFrame:38400};
try{
init();const samples=[];const captured=new Set();
for(let tick=0;tick<650;tick++){
 step(1);const rgba=frame(),pose=poseHashes.indexOf(sha(rgb555(rgba))),state=readRuntimeTelemetry(core);
 samples.push({tick,pose,room:state?.currentRoom,kind:state?.runtimeKind});
 if(pose>=0&&!captured.has(pose)){captured.add(pose);if(qa)fs.writeFileSync(qa+'/rom-pose-'+pose+'.png',encodePngRgba({width:240,height:160,pixels:rgba}));}
 if(!report.runs.length||report.runs.at(-1).pose!==pose)report.runs.push({pose,from:tick,to:tick+1});else report.runs.at(-1).to=tick+1;
}
if(qa)fs.writeFileSync(qa+'/frame-samples.json',JSON.stringify(samples));
const blink=samples.find(s=>s.pose===1);assert.ok(blink,'Nara blink must be visible');
const origin=blink.tick-60;report.sequenceOrigin=origin;
let compared=0;
for(const sample of samples){const t=sample.tick-origin;if(t<0||t>=480)continue;const expected=timeline.steps.find(s=>t>=s.from&&t<s.to).pose;assert.equal(sample.pose,expected,'RGB555 mismatch at animation tick '+t);compared++;}
assert.equal(compared,480);assert.equal(captured.size,10);report.comparedFrames=compared;report.comparedPixels=38400*compared;report.differentRgb555Pixels=0;
const final=samples.at(-1);assert.equal(final.kind,3,'Opening must finish in Menu');assert.equal(final.room,0,'Opening must finish at title');report.transitions.push({action:'Auto completion after 480 ticks',...final});
core._gba_destroy();init();step(40);step(1,8);step(45);const skipped=readRuntimeTelemetry(core);assert.equal(skipped.runtimeKind,3);assert.equal(skipped.currentRoom,0);report.transitions.push({action:'Start skips opening to title',room:skipped.currentRoom,kind:skipped.runtimeKind});
if(qa)fs.writeFileSync(qa+'/rom-title-after-skip.png',encodePngRgba({width:240,height:160,pixels:frame()}));
report.ok=true;
}catch(error){report.error=String(error);throw error;}finally{core._gba_destroy();if(qa)fs.writeFileSync(qa+'/rom-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
