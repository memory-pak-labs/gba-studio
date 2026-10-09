import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { readRuntimeTelemetry, copyModuleSavedata, inspectSavedataBytes } from '../static/WebPlayer/player/mgba-direct-player.mjs';
import { encodePngRgba } from './lib/png-icons.mjs';
const [romPath, output] = process.argv.slice(2);
assert.ok(romPath && output, 'usage: node scripts/playtest-character-selection-rom.mjs ROM OUTPUT');
mkdirSync(output, {recursive:true});
const app = path.resolve(import.meta.dirname, '..');
const wasm = readFileSync(path.join(app, 'static/WebPlayer/player/mgba-core.wasm'));
const rom = readFileSync(romPath);
const exported = JSON.parse(readFileSync(path.join(path.dirname(path.dirname(romPath)), 'export_project.json'), 'utf8'));
const nameVariableIndex = exported.menu_project.screens.find(screen => screen.name === 'nome_jogador').text_input.variable_index;
const symbols = execFileSync('/opt/devkitpro/devkitARM/bin/arm-none-eabi-nm', ['-C', romPath.replace(/\.gba$/, '.elf')], {encoding:'utf8'});
const eventStates = [...new Set([...symbols.matchAll(/^([0-9a-f]+) [bd] \(anonymous namespace\)::event_state$/gm)].map(match => parseInt(match[1], 16)))];
assert.ok(eventStates.length);
assert.equal(exported.menu_project.screens.find(screen=>screen.name==='escolha_genero').actors.filter(actor=>actor.role==='cursor').length,1,'one cursor actor');
const core = await createMGBA({print:()=>{},printErr:()=>{}, instantiateWasm(imports,receive){const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm),imports);receive(instance);return instance.exports;}});
function run(keys, frames=1){core._gba_set_keys(keys);for(let i=0;i<frames;i++)core._gba_run_frame();}
function press(keys, settle=8){run(keys,4);run(0,settle);}
// gba_audio_register is the existing core's busRead16 bridge (verified in mgba_web.c).
function read16(address){return core._gba_audio_register(address);}
function genderValues(){return eventStates.map(address=>read16(address+28+17*4));}
function names(){return eventStates.map(address=>Array.from({length:17},(_,index)=>{const word=read16(address+284+nameVariableIndex*17+(index&~1));return String.fromCharCode(index%2 ? word>>8 : word&255);}).join('').split('\0')[0].trimEnd());}
const evidence=[];
let passed=false;
function capture(label){const pixels=core.HEAPU8.slice(core._gba_framebuffer(),core._gba_framebuffer()+240*160*4);for(let i=3;i<pixels.length;i+=4)pixels[i]=255;writeFileSync(path.join(output,label+'.png'),encodePngRgba({width:240,height:160,pixels}));const state=readRuntimeTelemetry(core);evidence.push({label,state,genderValues:genderValues(),names:names()});return state;}
function boot(){assert.equal(core._gba_init(),1);const p=core._malloc(rom.length);core.HEAPU8.set(rom,p);assert.equal(core._gba_load_rom(p,rom.length),1);core._free(p);run(0,120);}
try {
  boot();
  const initial=capture('gender-left');
  press(16);capture('gender-right');press(32);capture('gender-left-return');press(1,90);
  const maleName=capture('name-male');
  assert.notEqual(maleName.currentRoom,initial.currentRoom,'A transitions directly to name');
  assert.ok(genderValues().includes(0));
  press(1);press(16);press(1);capture('name-male-AB');assert.ok(names().includes('AB'),'A and B are stored in var_character_name');
  for(let index=0;index<10;index++)press(1);
  capture('name-eight-character-limit');assert.equal(names().at(-1).length,8,'native input remains bounded to eight characters');
  core._gba_destroy();boot();press(16);press(1,90);capture('name-female');assert.ok(genderValues().includes(1),'right portrait stores female gender');
  press(1);press(16);press(1);assert.ok(names().includes('AB'));
  for(let row=0;row<4;row++)press(128); // B -> J -> R -> Z -> DEL.
  press(16);press(1); // Aa toggles lowercase.
  press(64);press(1);capture('name-lowercase');assert.ok(names().some(name=>/^AB[a-z]$/.test(name)),'case control affects typed glyphs');
  press(128);press(1);capture('name-delete');assert.ok(names().includes('AB'),'DEL removes the last character');
  press(16);press(16);press(1,120);const done=capture('name-done');assert.notEqual(done.currentRoom,maleName.currentRoom,'OK continues to prologue');
  const save = inspectSavedataBytes(copyModuleSavedata(core));
  assert.equal(save.slot?.status,'ok','OK writes a valid save slot checksum');
  evidence.push({label:'save-integrity',save});
  core._gba_destroy();boot();press(16);press(1,90);
  press(128);for(let index=0;index<5;index++)press(16);press(1); // N
  press(64);for(let index=0;index<5;index++)press(32);press(1); // A
  press(128);press(128);press(16);press(1); // R
  press(64);press(64);press(32);press(1); // A
  capture('name-NARA');assert.ok(names().includes('NARA'));
  for(let index=0;index<4;index++)press(128);press(16);press(16);press(1,120);
  capture('prologue-NARA');assert.ok(names().includes('NARA'),'name transfers to prologue EventState');
  const namedSave=copyModuleSavedata(core);
  assert.equal(inspectSavedataBytes(namedSave).slot?.status,'ok');
  assert.ok(Buffer.from(namedSave).includes(Buffer.from('NARA')),'typed name is present in save payload');
  evidence.push({label:'save-name-NARA',save:inspectSavedataBytes(namedSave)});
  passed=true;
  console.log('PASS: single-frame selection, both genders, eight-character bound, native name entry, case, delete and OK');
} finally {writeFileSync(path.join(output,'runtime-evidence.json'),JSON.stringify({passed,checks:["single cursor","left/right","both genders stored","A direct transition","4x8 navigation","eight-character limit","case","delete","OK","save checksum","NARA save payload"],eventStateAddresses:eventStates,evidence},null,2)+'\n');core._gba_destroy();}
