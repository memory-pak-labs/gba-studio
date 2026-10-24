import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { copyModuleSavedata, inspectSavedataBytes, readRuntimeTelemetry, restoreModuleSavedata } from '../static/WebPlayer/player/mgba-direct-player.mjs';
import { encodePngRgba } from './lib/png-icons.mjs';
import { nativeLayoutSource, parseNativeLayouts, readNativeUI, runtimeNativeSymbols, nativeEventStatesByRuntime } from './lib/native-ui-diagnostics.mjs';
import { playShowcaseEnding } from './lib/showcase-ending-playthrough.mjs';
import { playShowcaseSystems } from './lib/showcase-systems-playthrough.mjs';
import { playFarolRelay } from './lib/farol-relay-playthrough.mjs';
import { playLostSignalMission, lostSignalInventoryIndices } from './lib/lost-signal-playthrough.mjs';

const [romFile, exportDir, output] = process.argv.slice(2);
assert.ok(romFile && exportDir && output, 'Usage: node scripts/smoke-lost-signal-mission.mjs ROM EXPORT OUTPUT');
fs.mkdirSync(output, { recursive: true });
const project = JSON.parse(fs.readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));
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
const read16 = a => core._gba_audio_register(a), read32 = a => (read16(a) | read16(a + 2) << 16);
const hash = data => createHash('sha256').update(data).digest('hex');
const report = { passed: false, romSha256: hash(rom), captures: [], inputs: [], diagnostics: { layouts, symbols, eventStatesByRuntime, dialogues, modal, eventStates: stateSymbols, layout }, totalFrames: 0 };
function eventAddress(state) {
  const candidates=eventStatesByRuntime[state.runtimeKind]?[eventStatesByRuntime[state.runtimeKind]]:stateSymbols;
  const matches = candidates.filter(a => state.variables.every((v, i) => read32(a + layout.variables + i * 4) === v));
  assert.ok(matches.length, 'Native event variables agree with published telemetry');
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
  telemetry() { return readRuntimeTelemetry(core); },
  state() { const state = readRuntimeTelemetry(core); if (![0,3,5,7,8,9].includes(state.runtimeKind)) return state; const a = eventAddress(state); return { ...state, variables: Array.from({length:64}, (_, i) => read32(a + layout.variables + i * 4)) }; },
  run(frames, keys) { report.inputs.push({ frame: report.totalFrames, frames, keys }); core._gba_set_keys(keys); for (let n = 0; n < frames; n++) core._gba_run_frame(); report.totalFrames += frames; },
  dialogue: () => dialogues.some(a => (read16(a) & 255) === 1 && read32(a + 8) >= 0x08000000 && read32(a + 8) < 0x0a000000),
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
    report.captures.push({ label, frame: report.totalFrames, inputCount: report.inputs.length, ui:driver.ui(), state: driver.state(), dialogue: driver.dialogue(), modal: driver.modal() });
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
  boot(returnProbe ? fs.readFileSync(returnProbe) : undefined);
  if (returnProbe) {
    const tap = keys => { driver.run(4,keys);driver.run(80,0); };
    driver.run(180,0);tap(8);tap(16);tap(1);tap(1);driver.run(100,0);
    assert.equal(driver.state().runtimeKind,5,'Load resumes the partial point-click save');
    driver.capture('restored-interior');driver.run(28,32);driver.run(18,64);driver.run(4,0);tap(257);
    assert.equal(driver.state().runtimeKind,0,'R+A at the door still returns to Port after loading');
    assert.equal(driver.state().variables[project.variables.findIndex(v=>v.name==='var_signal_stage')],1);
    driver.capture('return-after-load');report.passed=true;
  } else if (process.argv.includes('--diagnostics-only')) { driver.run(180,0); driver.capture('title'); report.passed=true; }
  else if(process.argv.some(a=>a.startsWith('--ending=')))Object.assign(report,await playShowcaseEnding(driver,project,JSON.parse(fs.readFileSync(new URL('../fixtures/asset-provenance/racing-approved-manifest.json',import.meta.url))),Number(process.argv.find(a=>a.startsWith('--ending=')).split('=')[1])));
  else Object.assign(report, await (process.argv.includes('--relay')?playFarolRelay:process.argv.includes('--showcase')?playShowcaseSystems:playLostSignalMission)(driver, project, exported));
}
catch (error) { report.error = String(error); driver.capture('failure'); driver.checkpoint('failure'); throw error; }
finally { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); core._gba_destroy(); }
