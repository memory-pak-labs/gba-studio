import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry,copyModuleSavedata,restoreModuleSavedata} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {encodePngRgba} from './lib/png-icons.mjs';
const [romPath, dir, mode = 'menus', savePath, expectedRuntime, requestedSlot = '2'] = process.argv.slice(2);
if (!dir) throw new Error('Uso: node verify-ingame-menu-rom.mjs <rom> <evidence-dir> [menus|details|load|tactical] [save.sav] [expected-runtime]');
mkdirSync(dir,{recursive:true});
const wasm=readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm', import.meta.url));
const core=await createMGBA({print:()=>{},printErr:()=>{},instantiateWasm(imports,receive){const i=new WebAssembly.Instance(new WebAssembly.Module(wasm),imports);receive(i);return i.exports}});
assert.equal(core._gba_init(),1);const rom=readFileSync(romPath);const ptr=core._malloc(rom.length);core.HEAPU8.set(rom,ptr);assert.equal(core._gba_load_rom(ptr,rom.length),1);core._free(ptr);
const hash=v=>createHash('sha256').update(v).digest('hex');
const run=(keys,n)=>{core._gba_set_keys(keys);for(let i=0;i<n;i++)core._gba_run_frame()};const tap=k=>{run(k,4);run(0,60)};const state=()=>readRuntimeTelemetry(core);const samples=[];
function sample(label){const pixels=Buffer.from(core.HEAPU8.slice(core._gba_framebuffer(),core._gba_framebuffer()+240*160*4));for(let i=3;i<pixels.length;i+=4)pixels[i]=255;writeFileSync(`${dir}/${label}.png`,encodePngRgba({width:240,height:160,pixels}));const s={label,telemetry:state(),saveHash:hash(copyModuleSavedata(core)),frameHash:hash(pixels),topHudHash:hash(pixels.subarray(0,240*24*4))};samples.push(s);console.log(label,JSON.stringify({runtime:s.telemetry.runtimeKind,room:s.telemetry.currentRoom,save:s.saveHash}));return s;}
if (savePath) assert.equal(restoreModuleSavedata(core, readFileSync(savePath)), true);
run(0,180);
if (state().runtimeKind === 6) { for (let i=0;i<4;i++) tap(1); }
if (mode === 'tactical') { tap(4); tap(4); sample('00-advanced-turn'); }
if (mode === 'load') {
 // Initial-menu entry policy intentionally starts at the title after a cold boot.
 if (state().runtimeKind === 3 && state().currentRoom === 0) {
  tap(1); tap(128); tap(1);
 }
 assert.equal(state().currentRoom, 4, 'A tela de carregar precisa estar aberta antes de escolher o slot');
 sample('00-load-screen');
 const save = readFileSync(savePath);
 const enabledSlots = [0,1,2].filter(slot => save.readUInt32LE(slot * 2048) === 0x53554247);
 const ordinal = enabledSlots.indexOf(Number(requestedSlot));
 assert.ok(ordinal >= 0, 'Slot solicitado precisa conter uma gravacao');
 for (let index = 0; index < ordinal; index++) tap(128);
 sample('00-selected-load-slot');
 run(1, 4); run(0, 1);
 for (let waited = 0; waited < 600 && state().runtimeKind !== Number(expectedRuntime); waited++) run(0, 1);
 const loaded = sample(`01-loaded-slot-${Number(requestedSlot)+1}`);assert.equal(loaded.telemetry.runtimeKind, Number(expectedRuntime));
 if (Number(expectedRuntime) === 10) {
  const source = JSON.parse(readFileSync(path.join(path.dirname(savePath), 'evidence.json'), 'utf8')).samples;
  const flight = source.find(s => s.label === 'flight-before-pause');
  if (flight) {
   assert.equal(loaded.telemetry.currentRoom, flight.telemetry.currentRoom, 'Carregar preserva o destino selecionado');
   assert.ok(Math.abs(loaded.telemetry.player.y-flight.telemetry.player.y)<20, 'Carregar retoma o ponto do voo');
   run(0, 600); assert.equal(state().runtimeKind, 1, 'Voo carregado chega a Penedos'); sample('02-loaded-flight-arrival');
  } else {
   const original = source.find(s => s.label === '01-game');
   assert.deepEqual(loaded.telemetry.player, original.telemetry.player, 'Carregar preserva a aeronave parada');
  }
 }
 if (Number(expectedRuntime) === 2) {
  const source = JSON.parse(readFileSync(path.join(path.dirname(savePath), 'evidence.json'), 'utf8')).samples.find(s => s.label === '01-game').telemetry;
  assert.equal(loaded.telemetry.flagBits & 0x7c0000, source.flagBits & 0x7c0000, 'Carregar preserva equipe e turno tatico');
 }
 writeFileSync(`${dir}/evidence.json`,JSON.stringify({romHash:hash(rom),samples},null,2));core._gba_destroy();process.exit(0);
}
const original=sample('01-game');const pauseKey=original.telemetry.runtimeKind===6?256:8;tap(pauseKey);const start=sample('02-start');assert.equal(state().runtimeKind,3);
if (mode === 'pause') {
 tap(2); const resumed=sample('11-resumed');
 assert.equal(resumed.telemetry.runtimeKind,original.telemetry.runtimeKind);
 assert.equal(resumed.topHudHash,original.topHudHash,'Retomar deve restaurar a HUD do jogo');
 writeFileSync(`${dir}/evidence.json`,JSON.stringify({romHash:hash(rom),samples},null,2));
 core._gba_destroy();process.exit(0);
}
if (mode === 'details') {
 for (const [i, name] of ['missoes', 'inventario', 'mapa_menu'].entries()) {
  if (i) tap(128); tap(1); const page = sample(`details-${name}-page`);
  tap(1); run(0, 180); const detail = sample(`details-${name}-text`);
  assert.notEqual(detail.frameHash, page.frameHash, 'A deve mostrar os detalhes');
  tap(2); assert.equal(state().currentRoom, page.telemetry.currentRoom, 'B fecha o detalhe');
  tap(2); assert.equal(state().currentRoom, start.telemetry.currentRoom, 'B volta ao Start');
 }
 writeFileSync(`${dir}/evidence.json`, JSON.stringify({romHash:hash(rom),samples},null,2));
 core._gba_destroy(); process.exit(0);
}
for(const [i,name] of ['missoes','inventario','mapa_menu','salvar','configuracoes'].entries()){
 if(i)tap(128);tap(1);sample(`03-${name}`);
 if(name==='mapa_menu'){for(let n=0;n<6;n++)tap(128);sample('04-map-page-2');tap(128);sample('05-map-next-page-item');}
 if(name==='salvar'){
  const beforeFirstSlot=hash(copyModuleSavedata(core));tap(1);
  if (hash(copyModuleSavedata(core)) === beforeFirstSlot) tap(1);
  assert.notEqual(hash(copyModuleSavedata(core)),beforeFirstSlot,'Salvar slot 1 altera SRAM');sample('06-saved-slot-1');
  tap(128);const before=hash(copyModuleSavedata(core));tap(1);const saved=sample('06-saved-slot-2');assert.notEqual(saved.saveHash,before,'Salvar precisa alterar SRAM');
  tap(1);sample('07-overwrite-confirmation');const confirmed=hash(copyModuleSavedata(core));tap(2);assert.equal(hash(copyModuleSavedata(core)),confirmed,'Cancelar nao grava');sample('08-overwrite-cancel');
  tap(128);tap(1);sample('09-saved-slot-3');
  tap(1);const preOverwrite=hash(copyModuleSavedata(core));tap(1);assert.notEqual(hash(copyModuleSavedata(core)),preOverwrite,'Confirmar sobrescreve o slot');sample('09b-overwritten-slot-3');
 }
 if(name==='configuracoes') {for(let n=0;n<4;n++)tap(128);const oldLanguage=state().variables[15];tap(16);sample('10-language');assert.equal(state().variables[15],oldLanguage+1);}
 tap(2);assert.equal(state().currentRoom,start.telemetry.currentRoom,'B volta ao Start');
}
tap(2);const resumed=sample('11-resumed');assert.equal(state().runtimeKind,original.telemetry.runtimeKind);assert.deepEqual(state().player,original.telemetry.player);
if (mode === 'tactical') assert.equal(state().flagBits & 0x7c0000, original.telemetry.flagBits & 0x7c0000, 'Retomar preserva equipe e turno tatico');
tap(pauseKey);assert.equal(state().runtimeKind,3,'Pausa deve funcionar novamente depois de retomar');tap(2);assert.equal(state().runtimeKind,original.telemetry.runtimeKind);
writeFileSync(`${dir}/save.sav`,copyModuleSavedata(core));writeFileSync(`${dir}/evidence.json`,JSON.stringify({romHash:hash(rom),samples},null,2));core._gba_destroy();
