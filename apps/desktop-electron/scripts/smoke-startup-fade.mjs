import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { readRuntimeTelemetry } from '../static/WebPlayer/player/mgba-direct-player.mjs';
import { decodePngRgba, encodePngRgba } from './lib/png-icons.mjs';
import { decodeExportedTilemapRgba } from './rgb555-framebuffer-contract.mjs';

assert.ok(process.argv[2] && process.argv[3] && process.argv[4], 'Usage: node scripts/smoke-startup-fade.mjs <logo-start.gba> <engine-export> <evidence-directory>');
const out=path.resolve(process.argv[4]);fs.mkdirSync(out,{recursive:true});
const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('../fixtures/asset-provenance/startup-fade-a-manifest.json',import.meta.url)));
const exported=JSON.parse(fs.readFileSync(path.join(process.argv[3],'export_project.json')));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function rgb555(pixels){const result=Buffer.alloc(38400*2);for(let i=0;i<38400;i++)result.writeUInt16LE((pixels[i*4]>>3)|((pixels[i*4+1]>>3)<<5)|((pixels[i*4+2]>>3)<<10),i*2);return result;}
const frames=new Map();
for(const asset of manifest.assets){
 const bytes=fs.readFileSync(new URL(asset.source,root));assert.equal(sha(bytes),asset.sha256);
 const image=decodePngRgba(bytes),hash=sha(rgb555(image.pixels));frames.set(asset.file,{...image,hash});
 const packed=exported.asset_pack.assets.find(entry=>entry.id===asset.file.replace('.png','').replaceAll('-','_'));
 assert.ok(packed,asset.file);
 const decoded=decodeExportedTilemapRgba({headerSource:fs.readFileSync(path.join(process.argv[3],packed.header),'utf8'),symbol:packed.symbol,width:240,height:160});
 assert.equal(sha(rgb555(decoded.pixels)),hash,'assetc must preserve '+asset.file);
}
const expected=manifest.timeline.flatMap(step=>Array(step.durationFrames).fill(frames.get(step.file).hash));
// The following scene is an independent regression oracle for upload timing.
const openingURL=new URL('Assets/illustrations/opening/layers.json',root);
const openingTimeline=JSON.parse(fs.readFileSync(openingURL)).runtime;
const openingBase=decodePngRgba(fs.readFileSync(new URL(openingTimeline.staticComposition,openingURL)));
const openingPatches=decodePngRgba(fs.readFileSync(new URL(openingTimeline.localAnimation,openingURL)));
const openingPoses=Array.from({length:openingPatches.width/openingTimeline.frameWidth},(_,pose)=>{
 const pixels=Buffer.from(openingBase.pixels),{frameWidth,frameHeight,patchPosition}=openingTimeline;
 for(let y=0;y<frameHeight;y++)for(let x=0;x<frameWidth;x++){
  const source=(y*openingPatches.width+pose*frameWidth+x)*4;
  const target=((y+patchPosition.y)*240+x+patchPosition.x)*4;
  if(openingPatches.pixels[source+3])pixels.set(openingPatches.pixels.subarray(source,source+4),target);
 }
 return sha(rgb555(pixels));
});
const core=await createMGBA({print:()=>{},printErr:()=>{},instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm',import.meta.url))),imports);receive(instance);return instance.exports;}});
const rom=fs.readFileSync(process.argv[2]);
function init(){core._gba_init();const p=core._malloc(rom.length);core.HEAPU8.set(rom,p);assert.equal(core._gba_load_rom(p,rom.length),1);core._free(p);core._gba_set_keys(0);}
function step(count,keys=0){core._gba_set_keys(keys);for(let i=0;i<count;i++)core._gba_run_frame();}
function screen(){const pointer=core._gba_framebuffer(),pixels=Buffer.from(core.HEAPU8.subarray(pointer,pointer+153600));for(let i=3;i<pixels.length;i+=4)pixels[i]=255;return pixels;}
const report={ok:false,romSha256:sha(rom),assetcBackgrounds:frames.size,assetcRgb555Mismatches:0,comparedFrames:0,comparedPixels:0,skips:[]};
try{
 init();const samples=[];
 for(let tick=0;tick<850;tick++){
  step(1);const pixels=screen(),state=readRuntimeTelemetry(core);samples.push({tick,hash:sha(rgb555(pixels)),kind:state?.runtimeKind,room:state?.currentRoom,gameFrame:state?.frame,timing:state?.timing});
 }
 fs.writeFileSync(path.join(out,'frame-samples.json'),JSON.stringify(samples));
 const known=new Map([...frames].map(([file,frame])=>[frame.hash,file]));
 report.nativeRuns=[];
 for(const sample of samples){const file=known.get(sample.hash)??'other';if(report.nativeRuns.at(-1)?.file===file)report.nativeRuns.at(-1).to=sample.tick+1;else report.nativeRuns.push({file,from:sample.tick,to:sample.tick+1});}
 const firstVisible=expected.findIndex(hash=>hash!==expected[0]);assert.ok(firstVisible>0);
 const firstActual=samples.find(sample=>sample.hash===expected[firstVisible]);assert.ok(firstActual,'Expected fade must become visible');
 const origin=firstActual.tick-firstVisible;report.sequenceOrigin=origin;
 const cutsceneKind=samples[origin+firstVisible].kind;
 for(let frame=0;frame<expected.length;frame++)assert.equal(samples[origin+frame]?.hash,expected[frame],`RGB555 mismatch at startup frame ${frame}`);
 report.comparedFrames=expected.length;report.comparedPixels=expected.length*38400;
 const opening=samples.find(sample=>sample.tick>=origin+216&&sample.room===1&&sample.kind===cutsceneKind);assert.ok(opening,'Auto completion must enter abertura');report.automaticOpening={tick:opening.tick,kind:opening.kind,room:opening.room};
 const blinkStep=openingTimeline.steps.find(step=>step.pose===1);
 const blink=samples.find(sample=>sample.tick>=opening.tick&&sample.hash===openingPoses[1]);assert.ok(blink,'The following opening must show its authored blink');
 const openingOrigin=blink.tick-blinkStep.from;
 for(let frame=0;frame<openingTimeline.durationFrames;frame++){
  const pose=openingTimeline.steps.find(step=>frame>=step.from&&frame<step.to).pose;
  assert.equal(samples[openingOrigin+frame]?.hash,openingPoses[pose],`RGB555 mismatch at following opening frame ${frame}`);
 }
 report.followingOpening={sequenceOrigin:openingOrigin,comparedFrames:openingTimeline.durationFrames,comparedPixels:openingTimeline.durationFrames*38400,rgb555Mismatches:0};
 const title=samples.at(-1);assert.equal(title.kind,3,'The following opening must reach the menu runtime');assert.equal(title.room,0,'The following opening must reach the title');report.titleReached=true;
 core._gba_destroy();
 init();
 for(let tick=0;tick<origin+216;tick++){
  step(1);
  if([24,54,90,120,160,202].includes(tick-origin))fs.writeFileSync(path.join(out,`rom-logo-${tick-origin}.png`),encodePngRgba({width:240,height:160,pixels:screen()}));
 }
 core._gba_destroy();
 for(const key of [2,8])for(const at of [35,90,185]){
  init();step(origin+at+1);step(3,key);step(30);const state=readRuntimeTelemetry(core);
  assert.equal(state.currentRoom,1,'Skip must go directly to abertura');
  assert.equal(state.runtimeKind,cutsceneKind,'Skip must remain in the cutscene runtime');
  const file=`skip-${key===2?'b':'start'}-${at}.png`;fs.writeFileSync(path.join(out,file),encodePngRgba({width:240,height:160,pixels:screen()}));
  report.skips.push({key:key===2?'B':'Start',at,room:state.currentRoom,runtimeKind:state.runtimeKind,file});core._gba_destroy();
 }
 report.ok=true;
}catch(error){report.error=String(error);throw error;}finally{
 core._gba_destroy();fs.writeFileSync(path.join(out,'startup-fade-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
