import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {decodePngRgba,encodePngRgba} from './lib/png-icons.mjs';

assert.ok(process.argv[2]&&process.argv[3],'Usage: node scripts/smoke-observatory-frontal.mjs <observatory-start.gba> <evidence-directory>');
const out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const project=JSON.parse(fs.readFileSync(new URL('exemplo-gba.gba-project',root)));
const room=project.rooms.find(r=>r.name==='observatorio_do_farol');
const asset=name=>decodePngRgba(fs.readFileSync(new URL(project.assets.find(a=>a.name===name).metadata.source,root)));
const actor=project.actors.find(a=>a.roomName===room.name&&a.name===room.playerActorName);
const cursorAsset=project.assets.find(a=>a.name===actor.spriteSheet);
const hotspot=cursorAsset.metadata.hotspot;
assert.deepEqual(hotspot,{x:13,y:6},'the approved fingertip must be the logical target');
const bg=asset(room.backgroundAssetName),cursor=asset(actor.spriteSheet);
assert.equal(cursor.width,32);assert.equal(cursor.height,32);
const rom=fs.readFileSync(process.argv[2]),wasm=fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm',import.meta.url));
const core=await createMGBA({print:()=>{},printErr:()=>{},instantiateWasm(imports,receive){const i=new WebAssembly.Instance(new WebAssembly.Module(wasm),imports);receive(i);return i.exports;}});
const report={ok:false,romBytes:rom.length,romSha256:crypto.createHash('sha256').update(rom).digest('hex'),states:[],directions:[],dialogues:[],exit:null};
const rgb=p=>(p[0]>>3)|((p[1]>>3)<<5)|((p[2]>>3)<<10);
function step(n,k=0){core._gba_set_keys(k);for(let i=0;i<n;i++)core._gba_run_frame();}
function tap(k){step(2,k);step(45);}
function state(){return readRuntimeTelemetry(core);}
function pixels(){const p=core._gba_framebuffer(),a=Buffer.from(core.HEAPU8.subarray(p,p+153600));for(let i=3;i<a.length;i+=4)a[i]=255;return a;}
function expected(frame){
 const result=Buffer.from(bg.pixels),t=state(),x=t.player.x-hotspot.x,y=t.player.y-hotspot.y;
 for(let yy=0;yy<32;yy++)for(let xx=0;xx<32;xx++){
  const i=(yy*cursor.width+xx)*4,dx=x+xx,dy=y+yy;
  if(cursor.pixels[i+3]&&dx>=0&&dx<240&&dy>=0&&dy<160)result.set(cursor.pixels.subarray(i,i+4),(dy*240+dx)*4);
 }
 return result;
}
function difference(actual,want){let mismatch=0;for(let i=0;i<actual.length;i+=4)if(rgb(actual.subarray(i,i+3))!==rgb(want.subarray(i,i+3)))mismatch++;return mismatch;}
function match(){return difference(pixels(),expected(0));}
function capture(label){
 const t=state();assert.equal(t.runtimeKind,5);assert.equal(t.currentRoom,1);
 const a=pixels(),errors=[difference(a,expected(0))],mismatch=errors[0],file=label+'.png';
 fs.writeFileSync(path.join(out,file),encodePngRgba({width:240,height:160,pixels:a}));
 report.states.push({label,file,comparedPixels:38400,rgb555Mismatches:mismatch,cursorFrame:errors.indexOf(mismatch),state:t});
 assert.equal(mismatch,0,label+' must preserve the approved BG and cursor exactly');
}
function moveTo(x,y){
 for(const axis of ['x','y'])for(let n=0;n<130;n++){
  const delta=(axis==='x'?x:y)-state().player[axis];if(Math.abs(delta)<=1)break;
  step(1,axis==='x'?(delta<0?32:16):(delta<0?64:128));step(1);
  assert.ok(n<129,'cursor must reach target');
 }
 const t=state();assert.ok(Math.abs(t.player.x-x)<=1&&Math.abs(t.player.y-y)<=1);
}
function object(id){
 const t=project.triggers.find(t=>t.id==='observatorio_do_farol-'+id+'-trigger');
 moveTo(t.x*8+t.width*4,t.y*8+t.height*4);capture(id+'-hover');
 const before=state().player;tap(1);step(160);
 const actual=pixels(),changed=match();assert.ok(changed>50,id+' must open a dialogue');
 const file=id+'-dialogue.png';fs.writeFileSync(path.join(out,file),encodePngRgba({width:240,height:160,pixels:actual}));
 step(5,16);step(2);assert.deepEqual(state().player,before,'dialogue must suspend cursor movement');
 let closed=false,pages=0;for(;pages<16;pages++){tap(1);if(match()===0){closed=true;break;}}
 assert.ok(closed,id+' dialogue must close and restore BG');
 report.dialogues.push({id,file,changedPixels:changed,pages:pages+1,cursorFrozen:true});capture(id+'-closed');
}
try{
 core._gba_init();const p=core._malloc(rom.length);core.HEAPU8.set(rom,p);assert.equal(core._gba_load_rom(p,rom.length),1);core._free(p);step(180);capture('observatory-idle');
 for(const [name,bit,axis,sign] of [['right',16,'x',1],['down',128,'y',1],['left',32,'x',-1],['up',64,'y',-1]]){
  const before=state().player[axis];step(4,bit);step(2);const after=state().player[axis];assert.ok((after-before)*sign>0,name+' must move cursor');report.directions.push({name,before,after});capture('move-'+name);
 }
 for(const [label,x,y] of [['top-left',0,0],['bottom-right',239,159]]){moveTo(x,y);capture(label);}
 moveTo(116,136);capture('empty-space');tap(1);capture('empty-click');
 object('telescopio');object('mapa');
 const door=project.triggers.find(t=>t.id==='observatorio_do_farol-saida-trigger');moveTo(door.x*8+door.width*4,door.y*8+door.height*4);capture('door-hover');tap(1);step(150);
 const t=state();assert.equal(t.runtimeKind,2);assert.equal(t.currentRoom,0);assert.equal(t.variables[11],1);
 fs.writeFileSync(path.join(out,'market-after-exit.png'),encodePngRgba({width:240,height:160,pixels:pixels()}));report.exit={marketReached:true,observatoryFlag:1,state:t};report.ok=true;
}finally{
 fs.writeFileSync(path.join(out,'observatory-verification.json'),JSON.stringify(report,null,2));core._gba_destroy();
}
console.log(JSON.stringify({ok:report.ok,states:report.states.length,pixels:report.states.length*38400,directions:report.directions.length,dialogues:report.dialogues.length,exit:report.exit?.marketReached}));

