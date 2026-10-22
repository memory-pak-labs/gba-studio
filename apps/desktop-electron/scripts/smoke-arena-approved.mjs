import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry,analyzePcmSamples} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {decodePngRgba,encodePngRgba} from './lib/png-icons.mjs';
import {decodeMGBAHardwareVideoState,nativeSinglePartSpriteObject} from './native-scene-framebuffer-contract.mjs';
import {decodeExportedSpriteSheetRgba,decodeExportedTilemapRgba,parseExportedRgb555Palette} from './rgb555-framebuffer-contract.mjs';

const [romPath,exportDir,out]=process.argv.slice(2);
assert.ok(romPath&&exportDir&&out,'Usage: node scripts/smoke-arena-approved.mjs ROM EXPORT_DIR OUTPUT');
fs.mkdirSync(out,{recursive:true});
const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('../fixtures/asset-provenance/arena-approved-manifest.json',import.meta.url)));
const project=JSON.parse(fs.readFileSync(new URL('exemplo-gba.gba-project',root)));
const rom=fs.readFileSync(romPath),wasm=fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm',import.meta.url));
const report={ok:false,romBytes:rom.length,romSha256:crypto.createHash('sha256').update(rom).digest('hex'),headers:[],states:[],actions:[],inputs:[]};
const rgb=p=>(p[0]>>3)|((p[1]>>3)<<5)|((p[2]>>3)<<10);
const sheets={};
const actionSounds=JSON.parse(fs.readFileSync(path.join(exportDir,'export_project.json'))).luta_project.stages[0].action_sounds;
const font=decodePngRgba(fs.readFileSync(new URL('Assets/fonts/gba-dialogue-font-v3.png',root)));
const fontPaper=rgb(font.pixels.subarray(0,3));
const ink=parseExportedRgb555Palette(fs.readFileSync(path.join(exportDir,'dialogue_ui_assets.hpp'),'utf8'),'hud_preset_hud_arena_approved_skin')[4];
for(const entry of manifest.assets){
 const symbol=entry.name.replace(/\.png$/,'').replace(/[^a-zA-Z0-9]/g,'_');
 if(!fs.existsSync(path.join(exportDir,symbol+'.hpp'))){assert.ok(manifest.retainedAssets.includes(entry.name),'only retained library art may be omitted');continue;}
 const headerSource=fs.readFileSync(path.join(exportDir,symbol+'.hpp'),'utf8');
 const source=decodePngRgba(fs.readFileSync(new URL(entry.metadata.source,root)));
 const frameWidth=entry.metadata.frameWidth,frameHeight=entry.metadata.frameHeight,frameCount=entry.metadata.frameCount;
 const decoded=entry.kind==='Background'?decodeExportedTilemapRgba({headerSource,symbol,width:240,height:160,transparentPaletteZero:false}):decodeExportedSpriteSheetRgba({headerSource,symbol,frameWidth,frameHeight,frameCount});
 assert.equal(decoded.width,source.width);assert.equal(decoded.height,source.height);let differences=0;
 for(let i=0;i<source.pixels.length;i+=4)if(Boolean(source.pixels[i+3])!==Boolean(decoded.pixels[i+3])||(source.pixels[i+3]&&rgb(source.pixels.subarray(i,i+3))!==rgb(decoded.pixels.subarray(i,i+3))))differences++;
 assert.equal(differences,0,entry.name+' changes during export');
 report.headers.push({file:entry.name,pixels:source.width*source.height,differences});sheets[entry.name]=decoded;
}
const core=await createMGBA({print:()=>{},printErr:()=>{},instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(new WebAssembly.Module(wasm),imports);receive(instance);return instance.exports;}});
const state=()=>readRuntimeTelemetry(core);
function run(frames,keys=0){core._gba_set_keys(keys);report.inputs.push({frames,keys});for(let i=0;i<frames;i++)core._gba_run_frame();}
function collectAudio(frames,keys=0){
 const result=[];
 for(let i=0;i<frames;i++){
  run(1,keys);const count=core._gba_audio_sample_count();
  result.push(...new Int16Array(core.HEAPU8.buffer,core._gba_audio_samples(),count*2));
 }
 return result;
}
function video(){const n=core._gba_state_size(),p=core._malloc(n);try{assert.equal(core._gba_save_state(p,n),1);return decodeMGBAHardwareVideoState(core.HEAPU8.slice(p,p+n));}finally{core._free(p);}}
function pixels(){const p=core._gba_framebuffer(),a=core.HEAPU8.slice(p,p+153600);for(let i=3;i<a.length;i+=4)a[i]=255;return a;}
function boot(){
 core._gba_init();const p=core._malloc(rom.length);core.HEAPU8.set(rom,p);assert.equal(core._gba_load_rom(p,rom.length),1);core._free(p);
 const chunks=[];
 for(let i=0;i<90;i++){run(1);const count=core._gba_audio_sample_count();if(count>0)chunks.push(new Int16Array(core.HEAPU8.buffer,core._gba_audio_samples(),count*2).slice());}
 const samples=new Int16Array(chunks.reduce((n,a)=>n+a.length,0));let offset=0;for(const chunk of chunks){samples.set(chunk,offset);offset+=chunk.length;}
 report.audio=analyzePcmSamples(samples);assert.ok(report.audio.nonSilentSampleCount>0,'authored composed music must produce native audio');
 assert.equal(state().runtimeKind,12);
}
const inRect=(x,y,r)=>x>=r.x&&y>=r.y&&x<r.x+r.width&&y<r.y+r.height;
function capture(label,{audit=true}={}){
 const actual=pixels(),native=video(),snapshot=state(),item={label,state:snapshot,objects:native.objects};
 fs.writeFileSync(path.join(out,label+'.png'),encodePngRgba({width:240,height:160,pixels:actual}));
 if(audit){
  assert.equal(snapshot.runtimeKind,12);let bgPixels=0,bgDifferences=0;
  const bg=sheets['arena-coastal-240x160.png'];
  for(let y=42;y<143;y++)for(let x=0;x<240;x++){
   if(native.objects.some(o=>inRect(x,y,o)))continue;
   const i=(y*240+x)*4;bgPixels++;bgDifferences+=rgb(actual.subarray(i,i+3))!==rgb(bg.pixels.subarray(i,i+3));
  }
  assert.equal(bgDifferences,0,label+' background');item.background={pixels:bgPixels,differences:bgDifferences};
  item.fighters=[];
  for(const side of ['nara','rival']){
   const symbol=`arena_${side}_complete_64x64`,header=fs.readFileSync(path.join(exportDir,symbol+'.hpp'),'utf8');
   const o=nativeSinglePartSpriteObject(header,symbol,native);assert.ok(o,label+' '+side+' fighter OAM missing');
   const index=o.index;
   const sheet=sheets[`arena-${side}-complete-64x64.png`];let best={differences:Infinity};
   for(let frame=0;frame<24;frame++){
    let compared=0,differences=0;
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
     const dx=o.x+x,dy=o.y+y,sx=o.flipX?63-x:x,sy=o.flipY?63-y:y;
     if(dx<0||dy<42||dx>=240||dy>=143||native.objects.some(other=>other.index<index&&inRect(dx,dy,other)))continue;
     const i=(sy*sheet.width+frame*64+sx)*4;if(!sheet.pixels[i+3])continue;
     compared++;differences+=rgb(actual.subarray((dy*240+dx)*4,(dy*240+dx)*4+3))!==rgb(sheet.pixels.subarray(i,i+3));
    }
    if(differences<best.differences)best={frame,pixels:compared,differences,oam:o};
   }
   assert.ok(best.pixels>50,label+' visible fighter pixels');assert.equal(best.differences,0,label+' '+side+' sprite');item.fighters.push({side,...best});
  }
  item.gauges=[];
  for(const [side,x,value,max]of [['p1',36,snapshot.firstActor.x,100],['p2',144,snapshot.firstActor.y,96]]){
   const filled=Array.from({length:60},(_,i)=>rgb(actual.subarray((24*240+x+i)*4,(24*240+x+i)*4+3))).filter(c=>c===rgb([40,192,168])).length;
   assert.equal(filled,Math.floor(value*60/max),label+' '+side+' independent gauge');item.gauges.push({side,value,max,filled});
  }
  item.specialGauges=[];
  for(const [side,x,value,reverse]of [['p1',28,snapshot.player.x,false],['p2',152,snapshot.player.y,true]]){
   const filled=Math.floor(Math.min(value,100)*60/100);let differences=0;
   for(let yy=0;yy<3;yy++)for(let xx=0;xx<60;xx++){
    const expected=(reverse?xx>=60-filled:xx<filled)?rgb([40,192,168]):rgb([8,40,48]);
    differences+=rgb(actual.subarray(((147+yy)*240+x+xx)*4,((147+yy)*240+x+xx)*4+3))!==expected;
   }
   assert.equal(differences,0,label+' '+side+' special gauge');
   item.specialGauges.push({side,value,filled,pixels:180,differences});
  }
  item.labels=[];
  for(const [text,x,y,file,ox]of [['NARA',48,13,'arena-ui-left.png',0],['RIVAL',152,13,'arena-ui-right.png',136]]){
   const backing=sheets[file];let differences=0;
   for(let c=0;c<text.length;c++)for(let yy=0;yy<8;yy++)for(let xx=0;xx<8;xx++){
    const glyph=text.charCodeAt(c)-32,fi=((Math.floor(glyph/16)*8+yy)*font.width+(glyph%16)*8+xx)*4;
    const dx=x+c*8+xx,dy=y+yy,bi=(dy*backing.width+dx-ox)*4;
    const expected=rgb(font.pixels.subarray(fi,fi+3))!==fontPaper?ink:rgb(backing.pixels.subarray(bi,bi+3));
    differences+=rgb(actual.subarray((dy*240+dx)*4,(dy*240+dx)*4+3))!==expected;
   }
   assert.equal(differences,0,label+' '+text+' glyph fit');item.labels.push({text,pixels:text.length*64,differences});
  }
  for(const [file,ox,rect]of [['arena-ui-left.png',0,[48,13,80,21]],['arena-ui-right.png',136,[152,13,192,21]],['arena-ui-timer.png',104,[112,12,128,20]]]){
   const frame=sheets[file];let compared=0,differences=0;
   for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++){
    const dx=ox+x,i=(y*frame.width+x)*4;
    if(!frame.pixels[i+3]||(dx>=rect[0]&&dx<rect[2]&&y>=rect[1]&&y<rect[3])||(y>=23&&dx>=36&&dx<100)||(y>=23&&dx>=144&&dx<208))continue;
    compared++;differences+=rgb(actual.subarray((y*240+dx)*4,(y*240+dx)*4+3))!==rgb(frame.pixels.subarray(i,i+3));
   }
   assert.equal(differences,0,label+' frame must not be erased');(item.frames??=[]).push({file,pixels:compared,differences});
  }
  for(const [file,ox,gaugeX]of [['arena-ui-super-left.png',0,28],['arena-ui-super-right.png',136,152]]){
   const frame=sheets[file];let compared=0,differences=0;
   for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++){
    const dx=ox+x,dy=144+y,i=(y*frame.width+x)*4;
    if(!frame.pixels[i+3]||(dx>=gaugeX&&dx<gaugeX+60&&dy>=147&&dy<150))continue;
    compared++;differences+=rgb(actual.subarray((dy*240+dx)*4,(dy*240+dx)*4+3))!==rgb(frame.pixels.subarray(i,i+3));
   }
   assert.equal(differences,0,label+' special frame artwork');item.frames.push({file,pixels:compared,differences});
  }
 }
 report.states.push(item);return item;
}
try{
 // Identical native runs isolate an accepted whiff from the unchanged music.
 boot();const controlAudio=collectAudio(24,32);core._gba_destroy();
 boot();const whiffAudio=collectAudio(24,33);
 assert.equal(state().lastSfx,actionSounds.miss,'accepted whiff selects its authored SFX');
 assert.equal(controlAudio.length,whiffAudio.length);
 const changedSamples=controlAudio.reduce((n,sample,i)=>n+(sample!==whiffAudio[i]),0);
 assert.ok(changedSamples>100,'action SFX must change the actual native PCM, not only telemetry');
 report.actionAudio={cue:'miss',samples:whiffAudio.length,changedSamples,analysis:analyzePcmSamples(Int16Array.from(whiffAudio))};
 core._gba_destroy();
 boot();capture('initial');
 const before=video().objects.find(o=>o.index===0);run(8,32);const left=capture('move-left');assert.ok(left.fighters[0].frame>=16&&left.fighters[0].frame<=19,'dedicated left walk pose');run(2);assert.ok(left.fighters[0].oam.x<before.x);report.actions.push('move-left');
 run(8,16);const right=capture('move-right');assert.ok(right.fighters[0].frame>=16&&right.fighters[0].frame<=19,'dedicated right walk pose');run(2);assert.ok(right.fighters[0].oam.x>left.fighters[0].oam.x);report.actions.push('move-right');
 run(1,64);run(3);const jump=capture('jump');assert.ok(jump.fighters[0].oam.y<right.fighters[0].oam.y);assert.ok(jump.fighters[0].frame>=20,'dedicated jump pose');run(60);report.actions.push('jump-and-land');
 run(6,128);capture('guard');run(2);report.actions.push('guard');
 const hp=state().firstActor.y;run(1,1);run(4);capture('punch');assert.ok(state().firstActor.y<hp);assert.equal(state().lastSfx,actionSounds.hit,'connected punch selects impact SFX');run(16);run(1,2);run(4);capture('kick');report.actions.push('punch-and-kick');
 run(1,8);run(2);const paused=state();const timer=pixels().slice(12*240*4,21*240*4);run(120);capture('paused');assert.deepEqual(state().firstActor,paused.firstActor,'pause freezes health');assert.deepEqual(pixels().slice(12*240*4,21*240*4),timer,'pause freezes timer');
 run(1,8);run(120);capture('resumed');assert.notDeepEqual(state().firstActor,paused.firstActor,'Start must resume combat');report.actions.push('pause-and-resume');
 // Charge through real hits, then spend the real P1 gauge with L.
 core._gba_destroy();boot();
 for(let n=0;n<24&&state().player.x<100;n++){run(1,1);run(13);}
 assert.equal(state().player.x,100,'real hits must charge P1 special to its cap');
 capture('special-ready');
 run(1,512);run(2);
 assert.equal(state().lastSfx,actionSounds.special,'special selects its authored SFX');
 assert.ok(state().player.x<100,'L spends the charged special');
 capture('special-spent');report.actions.push('p1-special-charge-cap-consumption-and-sound');
 // Holding guard until the CPU connects selects defense, not impact.
 core._gba_destroy();boot();run(130,128);
 assert.equal(state().lastSfx,actionSounds.guard,'guarded CPU hit selects defense SFX');
 capture('guard-impact');report.actions.push('defense-action-sound');
 core._gba_destroy();boot();const jumpFrames=new Set();
 for(let frame=0;frame<18;frame++){
  run(1,frame===0?64:0);
  const item=capture('jump-phase-'+String(frame).padStart(2,'0'));
  jumpFrames.add(item.fighters[0].frame);
 }
 for(const frame of [20,21,22,23])assert.ok(jumpFrames.has(frame),'native jump phase '+frame);
 report.jumpPhases=[...jumpFrames];report.actions.push('four-native-jump-phases');
 core._gba_destroy();boot();run(30,16);const walkFrames=new Set();
 for(let frame=0;frame<4;frame++){
  // Separate the fighters before sampling all poses; an overlap cannot prove
  // the pixels of the occluded fighter, and must not relax the pixel oracle.
  run(frame===0?5:6,16);const item=capture('walk-cycle-'+frame);walkFrames.add(item.fighters[0].frame);
 }
 assert.deepEqual([...walkFrames].sort((a,b)=>a-b),[16,17,18,19]);
 report.walkPhases=[...walkFrames];report.actions.push('four-native-walk-poses');
 core._gba_destroy();boot();let cpuSpecial=false;
 for(let frame=0;frame<2000;frame++){
  const before=state().player.y;run(1);
  if(before===100&&state().player.y<100){
   assert.equal(state().lastSfx,actionSounds.special);run(2);capture('cpu-special-spent');cpuSpecial=true;break;
  }
 }
 assert.ok(cpuSpecial,'CPU must spend its full independent gauge');report.actions.push('p2-special-charge-and-consumption');
 core._gba_destroy();boot();
 for(let n=0;n<20&&state().player.x<60;n++){run(1,1);run(13);}
 assert.ok(state().player.x>=50,'counter needs at least half a real gauge');
 let damaged=false;
 for(let frame=0;frame<180;frame++){
  const hpBefore=state().firstActor.x;run(1);
  if(state().firstActor.x<hpBefore){damaged=true;break;}
 }
 assert.ok(damaged,'counter begins during a real CPU hit');
 const gaugeBeforeCounter=state().player.x,hpBeforeCounter=state().firstActor.y;
 run(1,256);run(2);
 assert.ok(state().player.x<gaugeBeforeCounter&&state().firstActor.y<hpBeforeCounter,'R spends half a gauge and counterattacks');
 assert.equal(state().lastSfx,actionSounds.special);capture('alpha-counter');report.actions.push('half-gauge-counter-and-sound');
 // A fresh native run exercises the real two-round victory event and next runtime.
 core._gba_destroy();boot();
 for(let n=0;n<1800&&state().runtimeKind===12;n++){run(1,1);run(9);}
 run(120);
 assert.notEqual(state().runtimeKind,12,'two-round victory must leave the arena');capture('victory-transition',{audit:false});
 assert.equal(state().runtimeKind,7,'victory must enter the racing runtime');
 assert.equal(state().variables[7],1,'victory must install the campaign boost module');report.actions.push('two-round-victory-and-campaign-transition');
 // Let the CPU win, close the authored defeat dialogue, and verify the rematch.
 core._gba_destroy();boot();run(6000);capture('defeat-dialogue',{audit:false});
 assert.equal(state().firstActor.x,0,'CPU must complete the match');
 for(let n=0;n<14;n++){run(1,1);run(30);if(state().firstActor.x===100)break;}
 // Health can reset one frame before the new runtime publishes its telemetry.
 for(let frame=0;frame<300&&state().runtimeKind===-1;frame++)run(1);
 assert.equal(state().runtimeKind,12);assert.equal(state().firstActor.x,100,'defeat must restart the match');run(90);
 // Wait two VBlank boundaries for queued HUD uploads before comparing pixels.
 run(2);capture('rematch');report.actions.push('defeat-dialogue-and-rematch');
 report.ok=true;
}catch(error){report.error=String(error);report.failureState=state();fs.writeFileSync(path.join(out,'failure.png'),encodePngRgba({width:240,height:160,pixels:pixels()}));throw error;}
finally{fs.writeFileSync(path.join(out,'arena-verification.json'),JSON.stringify(report,null,2));core._gba_destroy();}
console.log(JSON.stringify({ok:report.ok,headers:report.headers.length,states:report.states.length,actions:report.actions}));
