// Input-only playtest of the complete example. Symbols and registers are read-only oracles.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { armEventVariablesOffset } from './lib/arm-event-layout.mjs';
import create from '../static/WebPlayer/player/mgba-core.mjs';
import { readRuntimeTelemetry, copyModuleSavedata, inspectSavedataBytes } from '../static/WebPlayer/player/mgba-direct-player.mjs';
import { encodePngRgba } from './lib/png-icons.mjs';
import { decodeMGBAHardwareVideoState } from './native-scene-framebuffer-contract.mjs';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2]);
const contract = JSON.parse(fs.readFileSync(path.join(out, 'export_project.json')));
const rom = fs.readFileSync(path.join(out, 'example-flows.gba'));
const buildEvidence = JSON.parse(fs.readFileSync(path.join(out, 'build-evidence.json')));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(digest(rom), buildEvidence.romSha256, 'ROM matches its build evidence');
assert.equal(digest(fs.readFileSync(path.join(app, 'default-assets/templates/exemplo-gba/exemplo-gba.gba-project'))), buildEvidence.templateSha256, 'canonical template matches the tested build');
const arm = process.env.DEVKITARM ?? '/opt/devkitpro/devkitARM';
const variablesOffset = armEventVariablesOffset(out, arm);
const symbolText = execFileSync(path.join(arm, 'bin/arm-none-eabi-nm'), ['-S', '-C', path.join(out, 'example-flows.elf')], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const symbols = symbolText.split('\n').flatMap(line => { const m = line.match(/^([\da-f]+) ([\da-f]+) \w (.*)$/); return m ? [{ address: parseInt(m[1], 16), size: parseInt(m[2], 16), name: m[3] }] : []; });
const symbol = name => { const s = symbols.find(s => s.name.endsWith('::' + name)); assert.ok(s, 'symbol ' + name); return s; };
const presentation = symbol('player_presentation');
const near = name => symbols.filter(s => s.name.endsWith('::' + name)).sort((a,b) => Math.abs(a.address - presentation.address) - Math.abs(b.address - presentation.address))[0];
const player = symbols.find(s => s.name.endsWith('::player') && s.size === 60);
const animator = near('player_animator'), event = symbol('platformer_event_state'), npc = symbol('platformer_npc_runtimes');
const flight = symbol('shmup_state');
const animations = Object.fromEntries(symbols.filter(s => s.name.startsWith('gbastudio_platformer_project::platformer_player_') && s.name.endsWith('_animation')).map(s => [s.address, s.name.match(/player_(.*)_animation/)[1]]));
const wasm = new WebAssembly.Module(fs.readFileSync(path.join(app, 'static/WebPlayer/player/mgba-core.wasm')));
const core = await create({ print(){}, printErr(){}, instantiateWasm(imports, done){ const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
const r16 = a => core._gba_audio_register(a) >>> 0;
const r32 = a => (r16(a) | (r16(a+2) << 16));
const r8 = a => r16(a & ~1) >> ((a & 1) * 8) & 255;
const state = () => ({ ...readRuntimeTelemetry(core), animation: animations[r32(animator.address)], animationFrame: r8(animator.address+4),
  onLadder: !!r8(player.address+26), dashing: !!r8(player.address+52),
  variables: Array.from({length:64}, (_,i) => r32(event.address+variablesOffset+i*4)),
  bounds: {x:r32(player.address),y:r32(player.address+4),w:r32(player.address+8),h:r32(player.address+12)},
  npcs: Array.from({length:6},(_,i) => ({x:r32(npc.address+i*68),y:r32(npc.address+i*68+4)})),
  flight: {wave:r32(flight.address+8),tick:r16(flight.address+12),score:r16(flight.address+14),lives:r8(flight.address+16)} });
const report = {ok:false, checks:[], states:[], inputs:[]};
let portoState;
function run(frames, keys=0, trace){core._gba_set_keys(keys); for(let i=0;i<frames;i++){core._gba_run_frame();if(trace)trace.push(state());}}
function press(key){ report.inputs.push(key);run(4,key);run(5); }
function until(predicate, limit=1200, keys=0){for(let i=0;i<limit;i++){if(predicate(state()))return state();run(1,keys);}throw Error('Timed out: '+JSON.stringify(brief(state())));}
function brief(s){return {kind:s.runtimeKind,room:s.currentRoom,player:s.player,animation:s.animation,onLadder:s.onLadder,flight:s.flight,bounds:s.bounds,vars:s.variables.slice(27,33)};}
function shot(name){const p=core._gba_framebuffer();fs.writeFileSync(path.join(out,name+'.png'),encodePngRgba({width:240,height:160,pixels:core.HEAPU8.slice(p,p+240*160*4)}));report.states.push({name,...brief(state())});console.log(name,JSON.stringify(brief(state())));}
function save(){const n=core._gba_state_size(),p=core._malloc(n);assert.equal(core._gba_save_state(p,n),1);const bytes=core.HEAPU8.slice(p,p+n);core._free(p);return bytes;}
function video(){return decodeMGBAHardwareVideoState(save());}
function restore(bytes){const p=core._malloc(bytes.length);core.HEAPU8.set(bytes,p);assert.equal(core._gba_load_state(p,bytes.length),1);core._free(p);core._gba_set_keys(0);run(2);}
function check(name, fn){fn();report.checks.push(name);console.log('PASS',name);}
const menuIndex = name => contract.menu_project.screens.findIndex(s => s.name === name);
function menu(name){until(s => s.runtimeKind===3 && s.currentRoom===menuIndex(name));run(65);}
function qa(index){restore(portoState);press(8);menu('menu_start');for(let i=0;i<index;i++)press(128);press(1);until(s=>s.runtimeKind===[3,1,4][index] && (index!==0 || s.currentRoom===menuIndex('nome_jogador')));run(4);}
function typeName(){press(128);for(let i=0;i<5;i++)press(16);press(1);press(64);for(let i=0;i<5;i++)press(32);press(1);press(128);press(128);press(16);press(1);press(64);press(64);press(32);press(1);}
function enterNormalName(){
 core._gba_reset();run(400);
 for(let i=0;i<40 && !(state().runtimeKind===3 && state().currentRoom===menuIndex('title'));i++){press(1);run(80);}
 menu('title');press(8);menu('title_options');press(1);menu('escolha_genero');press(16);press(1);menu('nome_jogador');
}
try {
 assert.equal(core._gba_init(),1);const p=core._malloc(rom.length);core.HEAPU8.set(rom,p);assert.equal(core._gba_load_rom(p,rom.length),1);core._free(p);
 enterNormalName();shot('name-entry');const keyboard=save();
 typeName();shot('name-nara');press(8);
 until(s=>s.runtimeKind===8 && contract.cutscene_project.scenes[s.currentRoom]?.name==='prologo');run(100);shot('name-start-prologue');
 check('title > new game > gender > name > Start > prologue',()=>assert.equal(state().runtimeKind,8));
 // The normal campaign prologue must still reach Porto, with a valid save.
 for(let i=0;i<60 && state().runtimeKind!==0;i++){press(1);run(90);}
 until(s=>s.runtimeKind===0);run(180);portoState=save();shot('name-start-porto');
 check('name confirmation produces a valid save containing NARA',()=>{const bytes=copyModuleSavedata(core);assert.equal(inspectSavedataBytes(bytes).slot?.status,'ok');assert.ok(Buffer.from(bytes).includes(Buffer.from('NARA')));});
 restore(keyboard);typeName();for(let i=0;i<4;i++)press(128);press(16);press(16);shot('name-ok-selected');press(1);
 until(s=>s.runtimeKind===8 && contract.cutscene_project.scenes[s.currentRoom]?.name==='prologo');run(100);shot('name-ok-prologue');
 check('same normal name flow completes with OK/A',()=>assert.equal(state().runtimeKind,8));
 qa(0);typeName();press(8);until(s=>s.runtimeKind===8);check('scene shortcut also confirms the name with Start',()=>assert.equal(state().runtimeKind,8));
 qa(1);until(s=>s.runtimeKind===1);run(240);shot('platform-entry');const platformStart=save();
 const route=JSON.parse(fs.readFileSync(path.join(app,'scripts/platformer-approved-playtest-route.json')));
 const trace=[], samples={};
 for(const [label,key,frames] of route){
  if(label==='restart-route'){restore(platformStart);}
  else if(label==='close-dialogue'){for(let i=0;i<20;i++){run(6,2,trace);run(10,0,trace);}}
  else if(label==='ladder-center'){
   for(let i=0;i<25;i++){const x=state().bounds.x;if(x>=216 && x<=222)break;run(2,x>222?32:16,trace);run(8,0,trace);}
  }
  else if(label==='ladder-center-stop'){run(1,0,trace);}
  else if(label==='ladder-top'){for(let i=0;i<240 && state().npcs[1].x>196;i++)run(1,0,trace);run(frames,key,trace);}
  else if(label==='attack-east'){
   for(let i=0;i<100;i++){const s=state(),dx=s.npcs[4].x-(s.bounds.x+8),dy=s.npcs[4].y-(s.bounds.y+s.bounds.h);
    if(Math.abs(dx)+Math.abs(dy)<=29){run(1,dx>=0?16:32,trace);run(2,2,trace);run(38,0,trace);break;}run(1,dx>=0?16:32,trace);}
   until(s=>s.variables[31]===2,180);
   assert.equal(state().variables[31],2,'B defeats and hides the east crab');
  } else run(frames,key,trace);
  samples[label]=state();if(['settle','descend-mid','climb-mid','attack-east','exit-load'].includes(label))shot('platform-'+label);
 }
 check('crosses the ladder without vertical input',()=>assert.equal(samples['ladder-center-stop'].onLadder,false));
 check('Down/Up initiate and control ladder climbing',()=>{assert.equal(samples['descend-mid'].onLadder,true);assert.ok(trace.some(s=>s.onLadder && s.input.held===64));assert.ok(samples['climb-mid'].player.y < samples['descend-mid'].player.y);});
 check('B attacks with the approved animation and defeats the enemy',()=>assert.ok(trace.some(s=>s.animation?.includes('attack'))));
 check('platformer reward advances to the warehouse',()=>assert.equal(samples['exit-load'].runtimeKind,5));
 restore(platformStart);const attackRight=[];run(8,16|2,attackRight);shot('platform-attack-right');run(18,16|2,attackRight);
 check('B attacks without activating native dash and movement continues',()=>{assert.ok(attackRight.some(s=>s.animation?.includes('attack')));assert.ok(attackRight.every(s=>!s.dashing));assert.ok(state().bounds.x>64);});
 restore(platformStart);run(14,32);const attackLeft=[];run(8,32|2,attackLeft);shot('platform-attack-left');
 check('left attack uses the same approved mirrored clip',()=>{assert.ok(attackLeft.some(s=>s.animation?.includes('attack')));assert.equal(video().objects.find(object=>object.index===0).flipX,true);});
 restore(platformStart);const dash=[];run(10,16|512,dash);shot('platform-dash-L');check('L activates dash',()=>assert.ok(dash.some(s=>s.animation==='dash')));
 qa(2);until(s=>s.runtimeKind===4);run(4);shot('shmup-entry');
 const scrolling=[];for(let i=0;i<12;i++){run(1);scrolling.push(video().bg[2].x);}
 report.travelScroll=scrolling;
 check('travel background scrolls',()=>assert.ok(new Set(scrolling).size>1));
 // Fight both travel enemies with the normal fire button.
 for(let enemy=0;enemy<2;enemy++){
  const initial=state(), count=initial.actorCount, targetY=initial.firstActor.y-8, score=initial.flight.score;
  for(let f=0;f<360 && state().runtimeKind===4 && state().currentRoom===0 && state().actorCount===count;f++){const y=state().player.y;run(1,1|(y>targetY+1?64:y<targetY-1?128:0));}
  assert.ok(state().flight.score>=score+100, 'travel enemy defeated by normal shots');
 }
 until(s=>s.runtimeKind===4&&s.currentRoom===1,600,1);
 check('both travel enemies are defeated with A',()=>assert.equal(state().flight.score,200));
 run(70,64);shot('boss-arrival');const boss=state().firstActor;
 const stopped=[];for(let i=0;i<600;i++){run(1,64);stopped.push(video().bg[2].x);}
 shot('boss-waiting');
 check('boss remains alive in its arena when not attacked',()=>{assert.equal(state().runtimeKind,4);assert.equal(state().currentRoom,1);assert.equal(state().actorCount,1);assert.deepEqual(state().firstActor,boss);});
 report.bossScroll=stopped;
 check('boss background stays stopped',()=>assert.equal(new Set(stopped).size,1));
 // Align with the boss, defeat it, acknowledge the reward dialogue and advance.
 for(let i=0;i<100 && state().player.y<62;i++)run(1,128);
 for(let i=0;i<1800 && state().runtimeKind===4;i++){run(1,1);if(i%40===0)press(1);}
 until(s=>s.runtimeKind===11,600);run(80);
 shot('boss-defeated-next-scene');check('defeating the boss advances to the Guardian battle',()=>assert.equal(state().runtimeKind,11));
 const reward=contract.shmup_project.waves[1].on_clear.find(command=>command.op==='set_variable');
 check('boss victory preserves the shield reward',()=>assert.equal(readRuntimeTelemetry(core).variables[reward.variable],reward.value));
 report.ok=true;
} catch(error){report.error=String(error.stack??error);shot('failure');throw error;}
finally{fs.writeFileSync(path.join(out,'flows-verification.json'),JSON.stringify(report,null,2));core._gba_destroy();}
