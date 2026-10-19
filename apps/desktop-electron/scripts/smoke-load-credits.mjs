import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry,copyModuleSavedata,restoreModuleSavedata} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {decodePngRgba,encodePngRgba} from './lib/png-icons.mjs';

// Full canonical export, with titulo as development start. SRAM is generated
// through native gameplay inputs; no project, user save, or core RAM is edited.
assert.ok(process.argv[2]&&process.argv[3],'Usage: node scripts/smoke-load-credits.mjs <title-start.gba> <evidence-directory>');
const out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const project=JSON.parse(fs.readFileSync(new URL('exemplo-gba.gba-project',root)));
const asset=name=>decodePngRgba(fs.readFileSync(new URL(project.assets.find(a=>a.name===name).metadata.source,root)));
const font=asset('porto-hud-b-font.png'),cursor=asset('book-cursor-approved-8x8.png');
const rgb=p=>(p[0]>>3)|((p[1]>>3)<<5)|((p[2]>>3)<<10);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function paste(dst,src,x,y){for(let yy=0;yy<src.height;yy++)for(let xx=0;xx<src.width;xx++){const a=(yy*src.width+xx)*4;if(src.pixels[a+3])dst.pixels.set(src.pixels.subarray(a,a+4),((y+yy)*240+x+xx)*4);}}
function text(dst,s,x,y){for(const [i,c] of Array.from(s).entries()){const g=c.codePointAt(0)-32;for(let yy=0;yy<8;yy++)for(let xx=0;xx<8;xx++){const a=((Math.floor(g/16)*8+yy)*font.width+g%16*8+xx)*4;if(font.pixels[a]!==16||font.pixels[a+1]!==28||font.pixels[a+2]!==48)dst.pixels.set([16,40,48,255],((y+yy)*240+x+i*8+xx)*4);}}}
function expected(scene,selected,saves=[true,true,true]){
 const room=project.rooms.find(r=>r.name===scene),bg=asset(room.backgroundAssetName),im={...bg,pixels:Buffer.from(bg.pixels)};
 if(scene==='carregar_jogo'){
  const ys=[38,61,85,103];['1 AUTO','2','3','VOLTAR'].forEach((s,i)=>text(im,s+(i<3?(saves[i]?' SALVO':' LIVRE'):''),i===3?42:30,ys[i]));
  paste(im,cursor,16,ys[selected]);(selected===3?['MENU','INICIAL']:['CARREGAR',`SLOT ${selected+1}`]).forEach((s,i)=>text(im,s,147,96+i*12));
 }else{
  text(im,'Projeto GBA Studio',48,48);text(im,'O ÚLTIMO FAROL',48,60);
  text(im,'Engine GBA Studio',48,84);text(im,'GBAStudioEngine',48,96);text(im,'OBRIGADO POR JOGAR',52,110);paste(im,cursor,32,selected?84:48);
 }
 return im.pixels;
}
const wasm=fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm',import.meta.url));
const core=await createMGBA({print:()=>{},printErr:()=>{},instantiateWasm(imports,receive){const i=new WebAssembly.Instance(new WebAssembly.Module(wasm),imports);receive(i);return i.exports;}});
const rom=fs.readFileSync(process.argv[2]);
const report={ok:false,romSha256:hash(rom),romBytes:rom.length,states:[],loads:[],dialogs:[],entryGuards:[],saveSnapshots:[]};
function step(n,k=0){core._gba_set_keys(k);for(let i=0;i<n;i++)core._gba_run_frame();}
function tap(k){step(4,k);step(45);}
function telemetry(){return readRuntimeTelemetry(core);}
function room(index){assert.equal(telemetry().runtimeKind,3);assert.equal(telemetry().currentRoom,index);}
function pixels(){const p=core._gba_framebuffer(),a=Buffer.from(core.HEAPU8.subarray(p,p+153600));for(let i=3;i<a.length;i+=4)a[i]=255;return a;}
function capture(scene,selected,saves=[true,true,true],label=''){
 const actual=pixels(),want=expected(scene,selected,saves);let mismatch=0;
 for(let i=0;i<actual.length;i+=4)if(rgb(actual.subarray(i,i+3))!==rgb(want.subarray(i,i+3)))mismatch++;
 const file=`${String(report.states.length).padStart(2,'0')}-${scene}-${selected}${label?'-'+label:''}.png`;
 fs.writeFileSync(path.join(out,file),encodePngRgba({width:240,height:160,pixels:actual}));
 if(mismatch)fs.writeFileSync(path.join(out,file.replace('.png','-expected.png')),encodePngRgba({width:240,height:160,pixels:want}));
 report.states.push({scene,selected,saves,file,rgb555Mismatches:mismatch,telemetry:telemetry()});assert.equal(mismatch,0,file+' differs from approved background/text/cursor');
}
let started=false;
function boot(sram){
 if(started)core._gba_destroy();core._gba_init();started=true;
 const p=core._malloc(rom.length);core.HEAPU8.set(rom,p);assert.equal(core._gba_load_rom(p,rom.length),1);core._free(p);
 if(sram)assert.ok(restoreModuleSavedata(core,sram));step(180);room(0);
}
function titleOption(index){tap(8);room(1);for(let i=0;i<index;i++)tap(16);}
function newGame(){
 boot();titleOption(0);tap(1);room(2);tap(1);room(3);
 tap(1);tap(2);tap(128);tap(1);step(90);assert.equal(telemetry().runtimeKind,8,'name confirmation must enter prologue');
 tap(8);step(90);assert.equal(telemetry().runtimeKind,0,'skip prologue must enter Porto Lumen');
}
function saveAt(slot){
 const before=telemetry();assert.equal(before.runtimeKind,0);
 report.saveSnapshots[slot]={player:before.player,variables:before.variables};
 tap(8);room(11);for(let i=0;i<3;i++)tap(128);tap(1);room(10);for(let i=0;i<slot;i++)tap(128);
 // The first A writes an empty slot or opens overwrite confirmation. A second
 // A safely completes an overwrite; any new confirmation is then canceled.
 tap(1);tap(1);for(let i=0;i<3&&telemetry().runtimeKind===3;i++)tap(2);
 assert.equal(telemetry().runtimeKind,0);const data=copyModuleSavedata(core);assert.ok(data.length>0);return data;
}
function closeDetails(selected){
 tap(1);step(180);const first=pixels();let changed=0;const clean=expected('creditos',selected);
 for(let i=0;i<first.length;i+=4)if(rgb(first.subarray(i,i+3))!==rgb(clean.subarray(i,i+3)))changed++;
 assert.ok(changed>100,'detail dialogue must actually open');
 const skin=asset('frame-lumen-v2.png'),allowed=new Set([0x7fff]);for(let i=0;i<skin.pixels.length;i+=4)if(skin.pixels[i+3])allowed.add(rgb(skin.pixels.subarray(i,i+3)));
 let leaked=0;for(let y=120;y<144;y++)for(let x=16;x<224;x++){const i=(y*240+x)*4;if(!allowed.has(rgb(first.subarray(i,i+3))))leaked++;}
 assert.equal(leaked,0,'credits text must not leak through the modal dialogue');
 const file=`credits-detail-${selected}.png`;fs.writeFileSync(path.join(out,file),encodePngRgba({width:240,height:160,pixels:first}));
 let closed=false,pages=0;for(;pages<12;pages++){tap(1);const a=pixels();if(a.every((v,i)=>i%4===3||(v>>3)===(clean[i]>>3))){closed=true;break;}}
 assert.ok(closed,'credits dialogue must close and restore the approved page');report.dialogs.push({selected,pages:pages+1,file,leakedBackgroundPixels:leaked});capture('creditos',selected);
}
try{
 boot();titleOption(1);tap(1);room(1);report.entryGuards.push({case:'no saves',loadMenuBlocked:true});
 newGame();const one=saveAt(0);fs.writeFileSync(path.join(out,'one-slot.sav'),one);
 step(12,128);step(30);saveAt(1);step(12,16);step(30);const all=saveAt(2);fs.writeFileSync(path.join(out,'three-slots.sav'),all);
 boot(one);titleOption(1);tap(1);room(4);capture('carregar_jogo',0,[true,false,false],'mixed');tap(128);capture('carregar_jogo',3,[true,false,false],'skip-empty');tap(1);room(1);
 boot(one);titleOption(1);tap(1);room(4);tap(2);room(1);report.entryGuards.push({case:'mixed saves',emptySlotsSkipped:true,backActionReturnsToTitle:true,bReturnsToTitle:true});
 for(let slot=0;slot<3;slot++){
  boot(all);titleOption(1);tap(1);room(4);for(let i=0;i<slot;i++)tap(128);capture('carregar_jogo',slot);
  tap(1);step(90);const state=telemetry();assert.equal(state.runtimeKind,0);assert.equal(state.currentRoom,0);
  // UniversalSaveData persists player_x/player_y, not facing. Preserve that
  // existing save-format boundary rather than inventing an orientation field.
  for(const axis of ['x','y'])assert.equal(state.player[axis],report.saveSnapshots[slot].player[axis],'slot '+slot+' restores saved player '+axis);
  assert.deepEqual(state.variables,report.saveSnapshots[slot].variables,'slot '+slot+' restores the campaign variables');
  report.loads.push({slot,before:report.saveSnapshots[slot],after:{player:state.player,variables:state.variables},restored:true,orientationPersistedByExistingSaveFormat:false});
 }
 boot(all);titleOption(1);tap(1);for(let i=0;i<3;i++)tap(128);capture('carregar_jogo',3);tap(1);room(1);
 boot(all);titleOption(4);tap(1);room(6);capture('creditos',0);closeDetails(0);tap(128);capture('creditos',1);closeDetails(1);tap(2);room(1);
 report.entryGuards.push({case:'credits',bReturnsToTitle:true});
 report.saveData={bytes:all.length,sha256:hash(all),source:'created by native gameplay/save inputs in this smoke only'};report.ok=true;
}finally{
 core._gba_destroy();fs.writeFileSync(path.join(out,'load-credits-verification.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({ok:report.ok,states:report.states.length,loads:report.loads.length,dialogs:report.dialogs.length,rgb555Mismatches:report.states.reduce((n,s)=>n+s.rgb555Mismatches,0)},null,2));
}
