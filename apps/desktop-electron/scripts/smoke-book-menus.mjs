import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {decodePngRgba,encodePngRgba} from './lib/png-icons.mjs';

// Export the complete canonical project with Porto Lumen as development start.
// Expected pixels come from the approved PNGs and independent native coordinates.
assert.ok(process.argv[2] && process.argv[3], 'Usage: node scripts/smoke-book-menus.mjs <porto-start.gba> <evidence-directory>');
const out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const project=JSON.parse(fs.readFileSync(new URL('exemplo-gba.gba-project',root)));
const png=source=>decodePngRgba(fs.readFileSync(new URL(source,root)));
const resources=new Map(project.assets.map(a=>[a.name,a.metadata.source]));
const sprite=name=>png(resources.get(name));
const font=sprite('porto-hud-b-font.png');
const dialogueSkin=sprite('frame-lumen-v2.png');
const dialogueColors=new Set([0x7FFF]);
for(let i=0;i<dialogueSkin.pixels.length;i+=4)if(dialogueSkin.pixels[i+3])dialogueColors.add(rgb(dialogueSkin.pixels.subarray(i,i+3)));
const cursor=sprite('book-cursor-approved-8x8.png'),pages=sprite('book-pages-32x8.png');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function rgb(p){return (p[0]>>3)|((p[1]>>3)<<5)|((p[2]>>3)<<10)}
const ink=[16,40,48,255];
function paste(dst,src,x,y,sx=0,w=src.width,h=src.height){for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
 const a=(yy*src.width+xx+sx)*4,b=((yy+y)*240+x+xx)*4;
 if(src.pixels[a+3])dst.pixels.set(src.pixels.subarray(a,a+4),b);
}}
function text(dst,value,x,y){for(const [i,c]of Array.from(value).entries()){
 const cell=c.codePointAt(0)-32;
 for(let yy=0;yy<8;yy++)for(let xx=0;xx<8;xx++){
  const a=((Math.floor(cell/16)*8+yy)*128+cell%16*8+xx)*4;
  if(font.pixels[a]!==16||font.pixels[a+1]!==28||font.pixels[a+2]!==48)dst.pixels.set(ink,((y+yy)*240+x+i*8+xx)*4);
 }
}}
const saveSlots=[false,false,false],audio=[100,80,90],vars=project.variables.map(v=>Number(v.initialValue)||0);let sound=true,language=0;
const pause=['MISSÕES','INVENTÁRIO','MAPA','SALVAR','AJUSTES','RETOMAR'];
const missions=['OBJETIVO','ESTRUT.','CÉLULA','ALIANÇA','FAROL','VOLTAR'];
const missionVars=[-1,1,2,8,14,-1];
const missionDetails=[['JORNADA','DO FAROL'],['PORTO','LUMEN'],['USINA','SUBMERSA'],['CONSELHO','GUARDIÃ'],['CIRCUITO','FINAL'],['RETOMAR','O MENU']];
const nodes=[[47,41],[94,41],[94,63],[47,63],[47,85],[94,85],[94,107],[47,107]];
const places=['PORTO','PENEDOS','ARMAZÉM','OBSERVAT.','MERCADO','USINA','CONSELHO','CIRCUITO','VOLTAR'];
const placeVars=[1,4,10,11,12,2,8,14,-1];
const placeDetails=[['INÍCIO','PORTO','LUMEN'],['ROTA DE','SALTO','PENEDOS'],['CARTA','DAS','MARÉS'],['REGISTRO','DO','FAROL'],['ATALHO','PARA A','USINA'],['CÉLULA','DE','ENERGIA'],['ALIANÇA','DA','GUARDIÃ'],['TRÊS','VOLTAS','FINAL'],['RETOMAR','O MENU','']];
const items=['ESTRUTURA DO FAROL','ADERÊNCIA','CÉLULA DE ENERGIA','BLINDAGEM','IMPULSO','VOLTAR'];
function expected(scene,selected,feedback){
 const room=project.rooms.find(r=>r.name===scene),base=sprite(room.backgroundAssetName),dst={...base,pixels:Buffer.from(base.pixels)};
 const pointer=(x,y)=>paste(dst,cursor,x,y);
 if(scene==='menu_start'){
  paste(dst,sprite('book-nara-approved-32x48.png'),164,29);pause.forEach((s,i)=>text(dst,s,37,[32,46,60,75,89,103][i]));
  text(dst,'  Nara',150,90);pointer(22,[32,46,60,75,89,103][selected]);
 }else if(scene==='missoes'){
  const page=Math.floor(selected/4);for(let i=0;i<4;i++){const n=page*4+i;if(n<6)text(dst,missions[n]+(missionVars[n]>=0?(vars[missionVars[n]]?' OK':' NÃO'):''),37,[32,48,64,80][i]);}
  missionDetails[selected].forEach((s,i)=>text(dst,s,147,94+i*12));pointer(16,[32,48,64,80][selected%4]);paste(dst,pages,100,137,page*32,32,8);
 }else if(scene==='inventario'){
  ['frame','grip','cell','shield','boost'].forEach((s,i)=>paste(dst,sprite(`toolcase-item-${s}-40x48.png`),20+40*i,48));
  paste(dst,sprite('toolcase-commands-128x8.png'),56,132);text(dst,items[selected],20,112);
  if(selected<5)paste(dst,sprite('toolcase-selection-40x48.png'),20+40*selected,48);else pointer(48,132);
 }else if(scene==='mapa_menu'){
  text(dst,'VOLTAR',74,139);text(dst,places[selected],146,82);placeDetails[selected].forEach((s,i)=>text(dst,s,146,92+i*10));
  if(selected<8){text(dst,vars[placeVars[selected]]?'OK':'NÃO',147,132);pointer(nodes[selected][0]-14,nodes[selected][1]-4);}else pointer(62,139);
 }else if(scene==='salvar'){
  const ys=[38,61,85,103];['1 AUTO','2','3','VOLTAR'].forEach((s,i)=>text(dst,s+(i<3?(saveSlots[i]?' SALVO':' LIVRE'):''),i===3?42:30,ys[i]));pointer(16,ys[selected]);
  const lines=feedback==='confirm'?['REGRAVAR?','A SIM','B NÃO']:feedback==='saved'?['JOGO','SALVO']:selected<3?['GRAVAR',`SLOT ${selected+1}`]:['RETOMAR','O MENU'];
  lines.forEach((s,i)=>text(dst,s,147,95+i*11));
 }else{
  const labels=[`VOLUME GERAL ${audio[0]}%`,`MÚSICA ${audio[1]}%`,`EFEITOS ${audio[2]}%`,`SOM LIGADO ${sound?'ON':'OFF'}`,`IDIOMA ${['PORTUGUÊS','ENGLISH','ESPAÑOL'][language]}`,'CONTROLES','RELÓGIO RTC 0','VOLTAR'];
  const page=Math.floor(selected/5);for(let i=0;i<5;i++){const n=page*5+i;if(n<8)text(dst,labels[n],39,[36,52,70,87,104][i]);}
  pointer(24,[36,52,70,87,104][selected%5]);paste(dst,pages,104,138,page*32,32,8);
 }
 return dst.pixels;
}
const wasm=fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm',import.meta.url));
const core=await createMGBA({print:()=>{},printErr:()=>{},instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(new WebAssembly.Module(wasm),imports);receive(instance);return instance.exports;}});
const rom=fs.readFileSync(process.argv[2]);const report={ok:false,romSha256:sha(rom),romBytes:rom.length,states:[],transitions:[],dialogues:[]};
function step(n,k=0){core._gba_set_keys(k);for(let i=0;i<n;i++)core._gba_run_frame()}
function tap(k){step(4,k);step(45)}
function pixels(){const p=core._gba_framebuffer(),b=Buffer.from(core.HEAPU8.subarray(p,p+153600));for(let i=3;i<b.length;i+=4)b[i]=255;return b;}
function capture(scene,selected,feedback){
 const actual=pixels(),want=expected(scene,selected,feedback);let mismatch=0;
 for(let i=0;i<actual.length;i+=4)if(rgb(actual.subarray(i,i+3))!==rgb(want.subarray(i,i+3)))mismatch++;
 const file=`${scene}-${String(selected).padStart(2,'0')}${feedback?'-'+feedback:''}.png`;
 fs.writeFileSync(path.join(out,file),encodePngRgba({width:240,height:160,pixels:actual}));
 if(mismatch)fs.writeFileSync(path.join(out,file.replace('.png','-expected.png')),encodePngRgba({width:240,height:160,pixels:want}));
 report.states.push({scene,selected,feedback,file,rgb555Mismatches:mismatch,telemetry:readRuntimeTelemetry(core)});
 assert.equal(mismatch,0,`${scene} selection ${selected}: pixels differ from approved layers`);
}
try{
 core._gba_init();const p=core._malloc(rom.length);core.HEAPU8.set(rom,p);assert.equal(core._gba_load_rom(p,rom.length),1);core._free(p);step(180);
 const before=readRuntimeTelemetry(core);assert.equal(before.runtimeKind,0);vars.splice(0,16,...before.variables);
 tap(8);capture('menu_start',0);tap(1);
 for(let i=0;i<6;i++){capture('missoes',i);if(i<5)tap(128)}tap(1);capture('menu_start',0);
 tap(128);capture('menu_start',1);tap(1);
 for(let i=0;i<5;i++){
  capture('inventario',i);
  if(i===0){
   tap(1);step(200);const modal=pixels();let leaked=0;
   for(let y=120;y<144;y++)for(let x=16;x<224;x++)if(!dialogueColors.has(rgb(modal.subarray((y*240+x)*4,(y*240+x)*4+3))))leaked++;
   fs.writeFileSync(path.join(out,'inventory-detail-dialogue.png'),encodePngRgba({width:240,height:160,pixels:modal}));
   report.dialogues.push({scene:'inventario',leakedBackgroundPixels:leaked});
   assert.equal(leaked,0,'modal dialogue must cover HUD text and command sprites with its opaque UI palette');
   let restored=false;
   for(let page=0;page<12;page++){
    tap(1);const current=pixels(),want=expected('inventario',0);
    if(current.every((v,i)=>i%4===3||(v>>3)===(want[i]>>3))){restored=true;break;}
   }
   assert.ok(restored,'closing item details must restore the exact approved inventory layers');capture('inventario',0);
  }
  if(i<4)tap(16)
 }tap(128);capture('inventario',5);tap(1);capture('menu_start',1);
 tap(128);capture('menu_start',2);tap(1);capture('mapa_menu',0);
 for(const [i,key]of [16,128,32,128,16,128,32,128].entries()){tap(key);capture('mapa_menu',i+1)}tap(1);capture('menu_start',2);
 tap(128);capture('menu_start',3);tap(1);
 for(let i=0;i<4;i++){capture('salvar',i);if(i<3)tap(128)}
 tap(64);tap(64);tap(64);tap(1);saveSlots[0]=true;capture('salvar',0,'saved');
 tap(1);capture('salvar',0,'confirm');tap(2);capture('salvar',0);tap(1);tap(1);capture('salvar',0,'saved');
 tap(128);tap(1);saveSlots[1]=true;capture('salvar',1,'saved');tap(128);tap(1);saveSlots[2]=true;capture('salvar',2,'saved');
 const size=core._gba_savedata_size(),savePointer=core._malloc(size);assert.ok(size>0);core._gba_savedata_copy(savePointer,size);const saved=Buffer.from(core.HEAPU8.subarray(savePointer,savePointer+size));core._free(savePointer);assert.ok(saved.some(b=>b!==255));report.saveData={bytes:size,sha256:sha(saved),slots:saveSlots};
 tap(2);capture('menu_start',3);tap(128);capture('menu_start',4);tap(1);capture('configuracoes',0);
 tap(32);audio[0]=90;capture('configuracoes',0);tap(16);audio[0]=100;capture('configuracoes',0);
 for(let i=1;i<8;i++){tap(128);capture('configuracoes',i);if(i===3){tap(1);sound=false;capture('configuracoes',i);tap(1);sound=true;capture('configuracoes',i)}}
 tap(1);capture('menu_start',4);tap(128);capture('menu_start',5);tap(1);step(60);
 const after=readRuntimeTelemetry(core);assert.equal(after.runtimeKind,0);assert.deepEqual(after.player,before.player);assert.deepEqual(after.variables,before.variables);
 report.transitions.push({action:'Resume after all six menus',before:before.player,after:after.player});report.ok=true;
}finally{core._gba_destroy();fs.writeFileSync(path.join(out,'rom-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:report.ok,states:report.states.length,mismatchedPixels:report.states.reduce((n,s)=>n+s.rgb555Mismatches,0)},null,2));}
