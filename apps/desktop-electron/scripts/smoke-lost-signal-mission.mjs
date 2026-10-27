import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { copyModuleSavedata, inspectSavedataBytes, readRuntimeTelemetry, restoreModuleSavedata } from '../static/WebPlayer/player/mgba-direct-player.mjs';
import { encodePngRgba } from './lib/png-icons.mjs';
import { nativeLayoutSource, parseNativeLayouts, readNativeUI, readNativePlayerAnimation, readNativeCoastState, readNativeAudio, runtimeNativeSymbols, nativeEventStatesByRuntime } from './lib/native-ui-diagnostics.mjs';
import { playShowcaseEnding } from './lib/showcase-ending-playthrough.mjs';
import { playShowcaseSystems } from './lib/showcase-systems-playthrough.mjs';
import { playFarolRelay } from './lib/farol-relay-playthrough.mjs';
import { playLostSignalMission, lostSignalInventoryIndices } from './lib/lost-signal-playthrough.mjs';
import { playCampaignEvolutions } from './lib/campaign-evolutions-playthrough.mjs';
import { playTopdownMovement } from './lib/topdown-movement-playthrough.mjs';
import { playCoastDepth } from './lib/coast-depth-playthrough.mjs';
import { playBattleDialogue, playDungeonDialogue } from './lib/battle-dialogue-playthrough.mjs';
import { playExampleEncore } from './lib/encore-playthrough.mjs';
import {playTideAnnex} from './lib/tide-annex-playthrough.mjs';
import { createMovementRecorder } from './lib/movement-video-recorder.mjs';
import { decodeMGBAHardwareVideoState } from './native-scene-framebuffer-contract.mjs';
import { createNativeAudioRecorder } from './lib/native-audio-recorder.mjs';

const [romFile, exportDir, output] = process.argv.slice(2);
assert.ok(romFile && exportDir && output, 'Usage: node scripts/smoke-lost-signal-mission.mjs ROM EXPORT OUTPUT');
fs.mkdirSync(output, { recursive: true });
const movementRecorder = createMovementRecorder(output, process.argv.includes('--movement-video'));
const projectFile=process.argv.find(a=>a.startsWith('--project='))?.slice(10)??fileURLToPath(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url));
const project = JSON.parse(fs.readFileSync(projectFile));
const exported = JSON.parse(fs.readFileSync(path.join(exportDir, 'export_project.json')));
const inventoryIndices = lostSignalInventoryIndices(project);
const rom = fs.readFileSync(romFile), wasm = fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm', import.meta.url));
const nm = spawnSync('/opt/devkitpro/devkitARM/bin/arm-none-eabi-objdump', ['-t','-C',romFile.replace(/\.gba$/,'.elf')], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
assert.equal(nm.status, 0);
const symbols = nm.stdout.split('\n').flatMap(line => { const m=line.match(/^([\da-f]+)\s+\w\s+.*?\s(\.[\w.]+)\s+([\da-f]+)\s+(.*)$/);return m?[{address:parseInt(m[1],16),size:parseInt(m[3],16),section:m[2],name:m[4]}]:[]; });
const eventStatesByRuntime=nativeEventStatesByRuntime(symbols);
const dialogues = symbols.filter(s => s.name.endsWith('::dialogue')).map(s => s.address);
const modal = symbols.find(s => s.name.endsWith('::event_interaction'));
const stateSymbols = [...new Set(symbols.filter(s => s.name.endsWith('::event_state')).map(s => s.address))];
assert.ok(modal && stateSymbols.length, 'Matching ELF provides read-only native event diagnostics');
const layoutSource = path.join(output, 'native-layout.cpp');
fs.writeFileSync(layoutSource, nativeLayoutSource());
const include = new URL('../../../packages/GBAStudioEngine/engine/include/', import.meta.url).pathname;
const compile = spawnSync('/opt/devkitpro/devkitARM/bin/arm-none-eabi-g++', ['-std=c++17', '-fdata-sections', '-I', decodeURIComponent(include), '-c', layoutSource, '-o', path.join(output, 'native-layout.o')], { encoding: 'utf8' });
assert.equal(compile.status, 0, compile.stderr);
assert.equal(spawnSync('/opt/devkitpro/devkitARM/bin/arm-none-eabi-objcopy', ['-O','binary','--only-section=.rodata.mission_layout',path.join(output,'native-layout.o'),path.join(output,'native-layout.bin')]).status, 0);
const nativeLayout = fs.readFileSync(path.join(output, 'native-layout.bin'));
const layouts = parseNativeLayouts(nativeLayout);
const e=layouts.event,layout={variables:e.variables,inventory:e.inventory,size:e.size,room:e.current_room,playerX:e.player_x,playerY:e.player_y,equipped:e.equipped_items};
assert.ok(symbols.some(s => s.name.endsWith('::event_state') && s.size === layout.size), 'Read-only layout matches the ROM ABI');
const core = await createMGBA({ print() {}, printErr() {}, instantiateWasm(imports, receive) { const i = new WebAssembly.Instance(new WebAssembly.Module(wasm), imports); receive(i); return i.exports; } });
const audioRecorder=createNativeAudioRecorder(core,output);
const read16 = a => core._gba_audio_register(a), read32 = a => (read16(a) | read16(a + 2) << 16);
const hash = data => createHash('sha256').update(data).digest('hex');
const report = { passed: false, romSha256: hash(rom), captures: [], inputs: [], diagnostics: { layouts, symbols, eventStatesByRuntime, dialogues, modal, eventStates: stateSymbols, layout }, totalFrames: 0 };
const battleSymbols=runtimeNativeSymbols(symbols,11),battleAddress=battleSymbols.find(s=>s.name.endsWith('::state')&&s.size===layouts.battle.size)?.address,battleMenu=battleSymbols.find(s=>s.name.endsWith('::battle_menu_page'))?.address,battlePrompt=battleSymbols.find(s=>s.name.endsWith('::authored_prompt'))?.address;
const battleEffect=battleSymbols.find(s=>s.name.endsWith('::effect_position'))?.address;
report.diagnostics.battle={state:battleAddress,menu:battleMenu,prompt:battlePrompt,effect:battleEffect};
const flightAddress=runtimeNativeSymbols(symbols,4).find(s=>s.name.endsWith('::shmup_state'))?.address;report.diagnostics.flight=flightAddress;
report.diagnostics.cameras=symbols.filter(s=>s.name.endsWith('::camera')&&s.size===layouts.camera.size).map(s=>s.address);
const recordingFile=process.argv.find(a=>a.startsWith('--record-gallery='))?.slice(17);
const recordingFd=recordingFile?fs.openSync(recordingFile,'w'):null;let recordedFrames=0;
function eventAddress(state) {
  const candidates=eventStatesByRuntime[state.runtimeKind]?[eventStatesByRuntime[state.runtimeKind]]:stateSymbols;
  const matches = candidates.filter(a => state.variables.every((v, i) => read32(a + layout.variables + i * 4) === v));
  assert.ok(matches.length, 'Native event variables agree with published telemetry: '+JSON.stringify({state,candidates:candidates.map(a=>({address:a,values:state.variables.map((_,i)=>read32(a+layout.variables+i*4))}))}));
  return matches.sort((a,b) => {
    const score = x => Number(read32(x+layout.room) === state.currentRoom) + Number(read32(x+layout.playerX) === state.player.x) + Number(read32(x+layout.playerY) === state.player.y);
    return score(b) - score(a);
  })[0];
}
let started = false;
function boot(savedata) {
  if (started) core._gba_destroy();
  assert.equal(core._gba_init(), 1); started = true;
  const ptr = core._malloc(rom.length); core.HEAPU8.set(rom, ptr); assert.equal(core._gba_load_rom(ptr, rom.length), 1); core._free(ptr);
  if (savedata) assert.ok(restoreModuleSavedata(core, savedata));
}
const driver = {
  timers(){const a=eventAddress(readRuntimeTelemetry(core));return Array.from({length:read32(a+e.timer_binding_count)},(_,i)=>({script:read32(a+e.timer_bindings+i*12),frames:read32(a+e.timer_bindings+i*12+4),remaining:read32(a+e.timer_bindings+i*12+8)}));},
  recordAudio:label=>audioRecorder.select(label),
  stopAudio:()=>audioRecorder.stop(),
  animation(){return readNativePlayerAnimation(runtimeNativeSymbols(symbols,readRuntimeTelemetry(core).runtimeKind),layouts,a=>read16(a&~1)>>(a%2*8)&255,read32);},
  recordMovement: label => movementRecorder.select(label),
  camera(){const r=exported.topdown_project.rooms[readRuntimeTelemetry(core).currentRoom],c=layouts.camera;const addresses=report.diagnostics.cameras.filter(a=>read32(a+c.bounds_pixels+8)===r.width_tiles*8&&read32(a+c.bounds_pixels+12)===r.height_tiles*8);assert.equal(addresses.length,1,'active camera matches authored room bounds');const a=addresses[0];return {x:read32(a+c.position_pixels),y:read32(a+c.position_pixels+4),follow:!!(read16(a+c.follow_player)&255),bounds:[0,1,2,3].map(i=>read32(a+c.bounds_pixels+i*4))};},
  flight(){assert.ok(flightAddress);return {tick:read16(flightAddress+12),score:read16(flightAddress+14),lives:read16(flightAddress+16)&255,wave:read32(flightAddress+8)};},
  frame(){const p=core._gba_framebuffer(),pixels=core.HEAPU8.slice(p,p+153600);for(let i=3;i<pixels.length;i+=4)pixels[i]=255;return pixels;},
  hardware(){const n=core._gba_state_size(),p=core._malloc(n);assert.equal(core._gba_save_state(p,n),1);const v=decodeMGBAHardwareVideoState(core.HEAPU8.slice(p,p+n));core._free(p);return v;},
  battle(){assert.ok(battleAddress&&battleMenu);const b=layouts.battle;let prompt='';for(let n=0;n<64&&battlePrompt;n++){const a=battlePrompt+n,c=(read16(a&~1)>>(a%2*8))&255;if(!c)break;prompt+=String.fromCharCode(c);}return {partyHp:[0,1,2,3].map(i=>read32(battleAddress+b.party_hp+i*4)),enemyHp:read32(battleAddress+b.enemy_hp),selectedParty:read32(battleAddress+b.selected_party),selectedAlly:read32(battleAddress+b.selected_ally),ability:read32(battleAddress+b.selected_ability),pending:!!(read16(battleAddress+b.enemy_turn_pending)&255),outcome:read16(battleAddress+b.outcome)&255,page:read16(battleMenu)&255,prompt,effectPosition:[read32(battleEffect),read32(battleEffect+4)]};},
  telemetry() { return readRuntimeTelemetry(core); },
  state() { const state = readRuntimeTelemetry(core); if (!state||state.currentRoom<0||state.runtimeKind<0||state.runtimeKind>12) return state; const a = eventAddress(state); return { ...state, variables: Array.from({length:64}, (_, i) => read32(a + layout.variables + i * 4)) }; },
  coast() { return readNativeCoastState(readRuntimeTelemetry(core).runtimeKind,symbols,layouts,a=>read16(a&~1)>>(a%2*8)&255,read32); },
  audioMixer() {return readNativeAudio(symbols,layouts,a=>read16(a&~1)>>(a%2*8)&255);},
  audioEnvelope() { const a=eventAddress(readRuntimeTelemetry(core));return {target:read32(a+layouts.event.audio_fade_target_volume),frames:read32(a+layouts.event.audio_fade_frames)}; },
  run(frames, keys) { report.inputs.push({ frame: report.totalFrames, frames, keys }); core._gba_set_keys(keys); for (let n = 0; n < frames; n++){core._gba_run_frame();audioRecorder.frame();if(movementRecorder.active&&n%4===3)movementRecorder.write(driver.frame());if(recordingFd!==null&&(report.totalFrames+n)%4===0&&recordedFrames<1200){const s=readRuntimeTelemetry(core);if(s?.runtimeKind===0&&exported.topdown_project.rooms[s.currentRoom]?.name==='galeria_das_mares'){fs.writeSync(recordingFd,driver.frame());recordedFrames++;}}} report.totalFrames += frames; },
  dialogue: () => runtimeNativeSymbols(symbols,readRuntimeTelemetry(core).runtimeKind).filter(s=>/::(?:(?:interaction|dungeon|map)_)?dialogue$/.test(s.name)).some(({address:a}) => (read16(a) & 255) === 1 && read32(a + 8) >= 0x02000000 && read32(a + 8) < 0x0a000000),
  modal: () => (read16(modal.address) & 255) === 1,
  ui() { return readNativeUI(runtimeNativeSymbols(symbols,readRuntimeTelemetry(core).runtimeKind),layouts,a=>read16(a&~1)>>(a%2*8)&255,read32,a=>{let s='';for(let n=0;n<2048&&a;n++){const v=read16((a+n)&~1)>>((a+n)%2*8)&255;if(!v)break;s+=String.fromCharCode(v);}return s;}); },
  equipped(slot=0) { return read32(eventAddress(readRuntimeTelemetry(core))+layout.equipped+slot*4); },
  race() { const a=symbols.find(s=>s.name.endsWith('::runtime_state')&&s.size===48).address;return {x:read32(a)/256,y:read32(a+4)/256,laps:read32(a+16),gates:read32(a+24),result:read16(a+32)&255,heading:read16(a+36)&255}; },
  currency() { return read32(eventAddress(readRuntimeTelemetry(core)) + layout.inventory); },
  item(key) { assert.ok(Number.isInteger(inventoryIndices[key]));return read32(eventAddress(readRuntimeTelemetry(core)) + layout.inventory + inventoryIndices[key]*4); },
  saveInfo: () => inspectSavedataBytes(copyModuleSavedata(core)),
  checkpoint(label) { fs.writeFileSync(path.join(output, label + '.sav'), copyModuleSavedata(core)); },
  reboot() { const saved = copyModuleSavedata(core); report.inputs.push({ reset: true }); boot(saved); },
  capture(label) {
    const p = core._gba_framebuffer();
    const pixels = core.HEAPU8.slice(p, p + 153600);
    // mGBA's fourth byte stores internal flags. Match the production canvas.
    for (let offset = 3; offset < pixels.length; offset += 4) pixels[offset] = 255;
    fs.writeFileSync(path.join(output, label + '.png'), encodePngRgba({ width: 240, height: 160, pixels }));
    const nativePlayer=symbols.find(s=>s.name.endsWith('::player')&&s.size===36);
    if(label==='failure'&&nativePlayer)console.log('native-player',Array.from({length:9},(_,i)=>read32(nativePlayer.address+i*4)));
    report.captures.push({ label, frame: report.totalFrames, inputCount: report.inputs.length, ui:driver.ui(), state: driver.state(), coast:[1,2].includes(driver.state().runtimeKind)?driver.coast():undefined, battle:driver.state().runtimeKind===11?driver.battle():undefined, dialogue: driver.dialogue(), modal: driver.modal() });
    console.log(label, JSON.stringify(readRuntimeTelemetry(core)?.player));
    // Locate EWRAM inside this core's own serialized snapshot. The Play runner
    // uses that offset only to read matching ELF symbols, never to restore RAM.
    if (!report.diagnostics.ewramOffset) {
      const address = core._gba_find_runtime_telemetry();
      const signature = Buffer.from(Array.from({ length: 128 }, (_, i) => read16(address + (i & ~1)) >> (i % 2 * 8) & 255));
      const size = core._gba_state_size(), ptr = core._malloc(size);
      assert.equal(core._gba_save_state(ptr, size), 1);
      const state = Buffer.from(core.HEAPU8.slice(ptr, ptr + size)); core._free(ptr);
      const at = state.indexOf(signature); assert.ok(at >= 0, 'Snapshot contains native diagnostic bytes');
      report.diagnostics.ewramOffset = at - (address - 0x02000000);
      const modalBytes = Buffer.from(Array.from({length:256}, (_, i) => read16(modal.address - 128 + (i & ~1)) >> (i % 2 * 8) & 255));
      const modalAt = state.indexOf(modalBytes);
      assert.ok(modalAt >= 0 && state.lastIndexOf(modalBytes) === modalAt, 'Snapshot has unambiguous IWRAM diagnostic bytes');
      report.diagnostics.iwramOffset = modalAt - (modal.address - 128 - 0x03000000);
    }
  }
};
try {
  const returnProbe = process.argv.find(arg => arg.startsWith('--return-probe='))?.slice('--return-probe='.length);
  const batteryFile=process.argv.find(arg=>arg.startsWith('--battery='))?.slice(10);
  boot(returnProbe ? fs.readFileSync(returnProbe) : batteryFile ? fs.readFileSync(batteryFile) : undefined);
  if(batteryFile)report.batterySource={path:batteryFile,sha256:hash(fs.readFileSync(batteryFile)),scope:'Unmodified SRAM written by an earlier controller-only acceptance journey; fresh core boot, loaded through the game menu.'};
  if (returnProbe) {
    const tap = keys => { driver.run(4,keys);driver.run(80,0); };
    driver.run(180,0);tap(8);tap(16);tap(1);tap(1);driver.run(100,0);
    assert.equal(driver.state().runtimeKind,5,'Load resumes the partial point-click save');
    report.restoredInventory={chart:driver.item('zz_signal_chart'),relay:driver.item('zz_signal_relay'),currency:driver.currency()};
    driver.capture('restored-interior');driver.run(28,32);driver.run(18,64);driver.run(4,0);tap(257);
    assert.equal(driver.state().runtimeKind,0,'R+A at the door still returns to Port after loading');
    assert.equal(driver.state().variables[project.variables.findIndex(v=>v.name==='var_signal_stage')],1);
    driver.capture('return-after-load');report.passed=true;
  } else if (process.argv.includes('--diagnostics-only')) { driver.run(180,0); driver.capture('title'); report.passed=true; }
  else if (process.argv.includes('--battle-dialogue')) Object.assign(report, await playBattleDialogue(driver));
  else if (process.argv.includes('--dungeon-dialogue')) Object.assign(report, await playDungeonDialogue(driver));
  else if(process.argv.some(a=>a.startsWith('--tide=')))Object.assign(report,await playTideAnnex(driver,project,exported,process.argv.find(a=>a.startsWith('--tide=')).slice(7),{projectRoot:path.dirname(projectFile)}));
  else if(process.argv.some(a=>a.startsWith('--encore=')))Object.assign(report,await playExampleEncore(driver,project,exported,process.argv.find(a=>a.startsWith('--encore=')).slice(9)));
  else if(process.argv.some(a=>a.startsWith('--coast=')))Object.assign(report,await playCoastDepth(driver,project,exported,process.argv.find(a=>a.startsWith('--coast=')).slice(8),{projectRoot:path.dirname(projectFile),output}));
  else if(process.argv.includes('--topdown-movement'))Object.assign(report,await playTopdownMovement(driver,project,exported,{projectRoot:path.dirname(projectFile),output,walkAnimation:process.argv.includes('--walk-animation')}));
  else if(process.argv.some(a=>a.startsWith('--ending=')))Object.assign(report,await playShowcaseEnding(driver,project,JSON.parse(fs.readFileSync(new URL('../fixtures/asset-provenance/racing-approved-manifest.json',import.meta.url))),Number(process.argv.find(a=>a.startsWith('--ending=')).split('=')[1])));
  else if(process.argv.some(a=>a.startsWith('--evolutions=')))Object.assign(report,await playCampaignEvolutions(driver,project,exported,process.argv.find(a=>a.startsWith('--evolutions=')).slice(13),{projectRoot:path.dirname(projectFile)}));
  else Object.assign(report, await (process.argv.includes('--relay')?playFarolRelay:process.argv.includes('--showcase')?playShowcaseSystems:playLostSignalMission)(driver, project, exported));
}
catch (error) { report.error = String(error); driver.capture('failure'); driver.checkpoint('failure'); throw error; }
finally { report.movementVideos=movementRecorder.close(); if(recordingFd!==null){fs.closeSync(recordingFd);report.recording={path:recordingFile,frames:recordedFrames,fps:15,format:'RGBA 240x160; sampled every four native frames; no audio'};}fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); core._gba_destroy(); }
