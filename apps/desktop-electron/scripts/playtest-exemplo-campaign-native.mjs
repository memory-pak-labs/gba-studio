import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import createMGBA from "../static/WebPlayer/player/mgba-core.mjs";
import {
  copyModuleSavedata, inspectSavedataBytes, readRuntimeTelemetry, restoreModuleSavedata
} from "../static/WebPlayer/player/mgba-direct-player.mjs";
import { decodePngRgba, encodePngRgba } from "./lib/png-icons.mjs";

// Production ROM, native controller input only. No QA driver or RAM writes.
const [romPath, output] = process.argv.slice(2);
assert.ok(romPath && output, "usage: node scripts/playtest-exemplo-campaign-native.mjs ROM OUTPUT [--skip-prologue] [--female] [--chapter-two] [--chapter-three | --finale --contract=EXPORT_JSON --map=ROM_MAP]");
mkdirSync(output, { recursive: true });
const rom = readFileSync(romPath);
const wasm = readFileSync(new URL("../static/WebPlayer/player/mgba-core.wasm", import.meta.url));
const core = await createMGBA({
  print: () => {}, printErr: () => {},
  instantiateWasm(imports, receive) {
    const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm), imports);
    receive(instance);
    return instance.exports;
  }
});
const skipPrologue = process.argv.includes("--skip-prologue");
const female = process.argv.includes("--female");
const finale = process.argv.includes("--finale");
const chapterThree = finale || process.argv.includes("--chapter-three");
const chapterTwo = chapterThree || process.argv.includes("--chapter-two");
const contractPath = process.argv.find((argument) => argument.startsWith("--contract="))?.slice("--contract=".length);
assert.ok(!chapterThree || contractPath, "chapter three requires the production export contract");
const exported = contractPath ? JSON.parse(readFileSync(contractPath, "utf8")) : null;
const mapPath = process.argv.find((argument) => argument.startsWith("--map="))?.slice("--map=".length) || romPath?.replace(/\.gba$/, ".map");
const linkMap = finale ? readFileSync(mapPath, "utf8") : null;
const evidence = [];
const inputs = [];
let emulatedFrames = 0;
let passed = false;
let restoreTrace = null;
function run(keys, frames) {
  inputs.push({ startFrame: emulatedFrames, keys, frames });
  core._gba_set_keys(keys);
  for (let index = 0; index < frames; index++) {
    core._gba_run_frame(); emulatedFrames++;
    if (restoreTrace) {
      const state = readRuntimeTelemetry(core);
      if (state?.runtimeKind === restoreTrace.kind && !restoreTrace.state &&
          state.variables.every((value, index) => value === restoreTrace.variables[index])) {
        restoreTrace.state = capture(`${restoreTrace.label}-source-restored`);
      }
    }
  }
}
function press(keys, settle = 90) { run(keys, 4); run(0, settle); }
function boot(savedata) {
  assert.equal(core._gba_init(), 1);
  const pointer = core._malloc(rom.length);
  core.HEAPU8.set(rom, pointer);
  assert.equal(core._gba_load_rom(pointer, rom.length), 1);
  core._free(pointer);
  if (savedata) assert.equal(restoreModuleSavedata(core, savedata), true);
  run(0, 1500);
}
function capture(label) {
  const state = readRuntimeTelemetry(core);
  assert.ok(state, `${label}: valid telemetry`);
  const pixels = core.HEAPU8.slice(core._gba_framebuffer(), core._gba_framebuffer() + 240 * 160 * 4);
  writeFileSync(path.join(output, `${label}.png`), encodePngRgba({ width: 240, height: 160, pixels }));
  evidence.push({ label, emulatedFrames, state });
  return state;
}
function expectRoom(label, kind, room) {
  const state = capture(label);
  assert.equal(state.runtimeKind, kind, `${label}: runtime`);
  assert.equal(state.currentRoom, room, `${label}: room`);
  return state;
}
function expectCheckpoint(label, kind, room) {
  const savedata = copyModuleSavedata(core);
  const inspected = inspectSavedataBytes(savedata);
  assert.equal(inspected.slot?.status, "ok", `${label}: valid save checksum`);
  // save.hpp: slot header, GBSM metadata record (40 bytes), then UniversalSaveData.
  // The outer GBUS/GBSM signatures alone also match legacy runtime-local saves.
  const offset = inspected.recordMagicOffset + 40;
  assert.ok(inspected.slot.payloadSize >= 52, `${label}: universal header fits inside the record`);
  assert.deepEqual([...savedata.slice(offset, offset + 4)], [71, 66, 85, 83], `${label}: universal payload magic`);
  const view = new DataView(savedata.buffer, savedata.byteOffset, savedata.byteLength);
  assert.equal(view.getUint16(offset + 4, true), 4, `${label}: universal schema`);
  assert.equal(savedata[offset + 6], kind, `${label}: saved runtime`);
  assert.equal(view.getInt32(offset + 8, true), room, `${label}: saved scene`);
  writeFileSync(path.join(output, `${label}.sav`), savedata);
  evidence.push({label, inspected, runtimeKind: kind, room});
  return savedata;
}
function loadCheckpoint(savedata, label, kind, room, sourceKind = null) {
  core._gba_destroy(); boot(savedata);
  expectRoom(`${label}-title`, 3, 0);
  assert.deepEqual(copyModuleSavedata(core), savedata, `${label}: opening preserves the whole battery`);
  const inspectedSave = inspectSavedataBytes(savedata);
  const saveView = new DataView(savedata.buffer, savedata.byteOffset, savedata.byteLength);
  const expectedVariables = Array.from({length: 16}, (_, index) => saveView.getInt32(inspectedSave.recordMagicOffset + 40 + 28 + index * 4, true));
  restoreTrace = sourceKind === null ? null : { kind: sourceKind, label, state: null, variables: expectedVariables };
  press(8); press(16, 20); press(1, 100); press(1, 180);
  if (restoreTrace) {
    assert.ok(restoreTrace.state, `${label}: source family was restored before its saved continuation`);
    const inspected = inspectSavedataBytes(savedata);
    const view = new DataView(savedata.buffer, savedata.byteOffset, savedata.byteLength);
    const variablesOffset = inspected.recordMagicOffset + 40 + 28;
    const savedVariables = Array.from({length: restoreTrace.state.variables.length}, (_, index) => view.getInt32(variablesOffset + index * 4, true));
    assert.deepEqual(restoreTrace.state.variables, savedVariables, `${label}: the source publishes the saved progress before its continuation`);
    evidence.push({label: `${label}-restore-continuation`, source: restoreTrace.state});
    restoreTrace = null;
  }
  return expectRoom(label, kind, room);
}
function expectMusic(label) {
  const audio = {samples: 0, nonSilentSamples: 0, peak: 0};
  inputs.push({startFrame: emulatedFrames, keys: 0, frames: 180});
  core._gba_set_keys(0);
  for (let frame = 0; frame < 180; frame++) {
    core._gba_run_frame(); emulatedFrames++;
    const count = core._gba_audio_sample_count() * 2;
    const samples = new Int16Array(core.HEAPU8.buffer, core._gba_audio_samples(), count);
    audio.samples += count;
    for (const value of samples) {
      if (value !== 0) audio.nonSilentSamples++;
      audio.peak = Math.max(audio.peak, Math.abs(value));
    }
  }
  evidence.push({label, audio, emulatedFrames});
  assert.ok(audio.nonSilentSamples > 1000 && audio.peak > 1000, `${label}: music produces audible samples`);
}
function moveIsoTo(tx, ty) {
  const state = readRuntimeTelemetry(core);
  assert.equal(state.runtimeKind, 2, "isometric route uses the native runtime");
  const room = exported.isometric_project.rooms[state.currentRoom];
  const width = room.width_tiles; const height = room.height_tiles;
  const start = [state.player.x, state.player.y]; const queue = [start]; const previous = new Map([[start.join(","), null]]);
  const directions = [[1,0,144],[-1,0,96],[0,1,160],[0,-1,80]];
  for (let i=0;i<queue.length;i++) {
    const [x,y] = queue[i]; if(x===tx && y===ty)break;
    for(const [dx,dy,keys] of directions) {
      const nx=x+dx,ny=y+dy,key=[nx,ny].join(",");
      if(nx<0||ny<0||nx>=width||ny>=height||previous.has(key)||room.collision_flags[ny*width+nx]&1)continue;
      if(room.actors.some((a,i)=>i>0 && a.tile.x===nx && a.tile.y===ny))continue;
      const h=room.height_levels[y*width+x],nh=room.height_levels[ny*width+nx],dh=nh-h;
      const ramp=room.ramp_flags[dh>0?ny*width+nx:y*width+x];
      if(Math.abs(dh)>1 || dh!==0 && !(dx===Math.sign(dh)&&dy===0&&(ramp&2) || dy===Math.sign(dh)&&dx===0&&(ramp&4)))continue;
      previous.set(key,{from:[x,y],keys});queue.push([nx,ny]);
    }
  }
  let end=[tx,ty],steps=[];assert.ok(previous.has(end.join(",")),"reachable native path");
  while(previous.get(end.join(","))!==null){const link=previous.get(end.join(","));steps.push({tile:end,keys:link.keys});end=link.from;}
  for(const step of steps.reverse()) {
    let reached=false;
    for(let frame=0;frame<240;frame++) {
      const current=readRuntimeTelemetry(core);
      if(current.player.x===step.tile[0]&&current.player.y===step.tile[1]){reached=true;break;}
      run(step.keys,1);
    }
    assert.ok(reached,"iso route reaches "+step.tile.join(","));
    run(0,4);
  }
}

function tap(keys, settle = 80) { run(keys, 16); run(0, settle); }

const racingAddresses = new Map();
function racingSymbol(symbol, size) {
  if (racingAddresses.has(symbol)) return racingAddresses.get(symbol);
  const match = linkMap.match(new RegExp(`\\.bss\\.\\S*L${symbol.length}${symbol}E\\s*\n\\s*(0x[\\da-fA-F]+)\\s+(0x[\\da-fA-F]+)\\s+[^\n]*racing_runtime\\.o`));
  assert.ok(match, `production link map contains racing ${symbol}`);
  assert.equal(Number(match[2]), size, `${symbol}: native layout matches the tested header`);
  const address = Number(match[1]);
  assert.ok(address >= 0x02000000 && address + size <= 0x02040000, "diagnostic symbol is in EWRAM");
  racingAddresses.set(symbol, address);
  return address;
}
function nativeRead32(address) {
  // The existing adapter exports busRead16 as gba_audio_register. This is a
  // read-only diagnostic; every gameplay action still uses controller input.
  return (core._gba_audio_register(address) | core._gba_audio_register(address + 2) << 16) | 0;
}
function readRaceState() {
  const address = racingSymbol("runtime_state", 40);
  for (let attempt = 0; attempt < 8; attempt++) {
    const packed = nativeRead32(address + 32);
    const state = {
      x: nativeRead32(address) / 256, y: nativeRead32(address + 4) / 256,
      speed: nativeRead32(address + 8) / 256, distance: nativeRead32(address + 12) / 256,
      laps: nativeRead32(address + 16), rivalDistance: nativeRead32(address + 20) / 256,
      checkpoints: nativeRead32(address + 24), result: packed & 255,
      heading: nativeRead32(address + 36) & 255
    };
    const telemetry = readRuntimeTelemetry(core);
    assert.equal(telemetry.runtimeKind, 7, "native racing diagnostic is read only during a race");
    if (Math.trunc(state.x) === telemetry.player.x && Math.trunc(state.y) === telemetry.player.y) return state;
    // mGBA may stop at a video boundary while the game is still drawing. Keep
    // the current controls until render publishes the same physics update;
    // preserve the strict equality check instead of accepting coordinate drift.
    evidence.push({label: "racing-await-render", attempt, x: state.x, y: state.y,
      telemetryX: telemetry.player.x, telemetryY: telemetry.player.y,
      phase: telemetry.collision.seenEffectBits});
    run(inputs.at(-1)?.keys ?? 0, 1);
  }
  assert.fail("racing physics and rendered telemetry did not synchronize within eight video frames");
}
function expectRaceBackground() {
  const room = exported.racing_project.rooms[0];
  const background = exported.racing_project.backgrounds[room.background];
  const layer = Number(background.layer.slice(2));
  const enabled = core._gba_audio_register(0x04000000) & 0x0F00;
  assert.equal(enabled, 0x0100 | 1 << (8 + layer), "race enables only the UI and its authored background");
  const exportRoot = path.dirname(path.dirname(path.resolve(romPath)));
  const source = decodePngRgba(readFileSync(path.join(exportRoot, "assets", "image", `${background.tilemap}.png`)));
  const cameraX = nativeRead32(racingSymbol("camera_x", 4));
  const cameraY = nativeRead32(racingSymbol("camera_y", 4));
  const frame = core.HEAPU8.slice(core._gba_framebuffer(), core._gba_framebuffer() + 240 * 160 * 4);
  const spriteBounds = [];
  const dimensions = [[[8,8],[16,16],[32,32],[64,64]], [[16,8],[32,8],[32,16],[64,32]], [[8,16],[8,32],[16,32],[32,64]]];
  for (let index = 0; index < 128; index++) {
    const attr0 = core._gba_audio_register(0x07000000 + index * 8);
    const attr1 = core._gba_audio_register(0x07000002 + index * 8);
    if (!(attr0 & 0x100) && attr0 & 0x200) continue;
    const shape = attr0 >> 14;
    if (shape > 2) continue;
    const [width, height] = dimensions[shape][attr1 >> 14];
    const multiplier = attr0 & 0x100 && attr0 & 0x200 ? 2 : 1;
    let x = attr1 & 511, y = attr0 & 255;
    if (x >= 256) x -= 512;
    if (y >= 160) y -= 256;
    spriteBounds.push({x, y, width: width * multiplier, height: height * multiplier});
  }
  let sampled = 0, matched = 0;
  // Leave the fixed HUD/dialogue bands out; mask actual OAM sprite bounds.
  for (let y = 32; y < 88; y++) for (let x = 0; x < 240; x++) {
    if (spriteBounds.some((b) => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height)) continue;
    const sx = x + cameraX, sy = y + cameraY;
    if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue;
    const actual = (y * 240 + x) * 4, expected = (sy * source.width + sx) * 4;
    sampled++;
    if ([0,1,2].every((channel) => Math.abs(frame[actual + channel] - source.pixels[expected + channel]) <= 8)) matched++;
  }
  evidence.push({label: "racing-background-fidelity", enabledLayers: enabled, cameraX, cameraY, sampled, matched, tolerance: 8});
  assert.ok(sampled > 8000 && matched / sampled >= 0.99, "native race background matches the approved source at GBA color precision");
}
function driveRace() {
  const points = exported.racing_project.rooms[0].topdown_track.path_points;
  const initial = readRaceState();
  const nearest = points.reduce((best, point, index) => Math.hypot(point.x - initial.x, point.y - initial.y) <
    Math.hypot(points[best].x - initial.x, points[best].y - initial.y) ? index : best, 0);
  let target = (nearest + 1) % points.length;
  let lastCheckpoint = -1;
  for (let step = 0; step < 2200; step++) {
    const state = readRaceState();
    if (state.checkpoints !== lastCheckpoint) {
      capture(`race-checkpoint-${state.checkpoints}`);
      evidence.push({label: `race-progress-${state.checkpoints}`, racing: state});
      lastCheckpoint = state.checkpoints;
    }
    if (state.result !== 0) {
      assert.equal(state.result, 1, "native checkpoint sequence wins the race");
      assert.equal(state.laps, 3, "victory completes all three laps");
      assert.equal(state.checkpoints, 12, "all four authored checkpoints count in each lap");
      return;
    }
    let point = points[target];
    if (Math.hypot(point.x - state.x, point.y - state.y) < 18) {
      target = (target + 1) % points.length;
      point = points[target];
    }
    const desired = (Math.round(Math.atan2(point.x - state.x, state.y - point.y) * 8 / Math.PI) + 16) % 16;
    const difference = (desired - state.heading + 24) % 16 - 8;
    const steering = difference < 0 ? 32 : difference > 0 ? 16 : 0;
    const brake = Math.abs(difference) > 1 && state.speed > 1.8;
    run((brake ? 2 : 1) | steering, 2);
  }
  assert.fail("native race reaches victory within the input budget");
}
try {
  boot();
  expectRoom("title", 3, 0);
  press(8); expectRoom("title-options", 3, 1);
  press(1); expectRoom("gender", 3, 2);
  if (female) press(16, 20);
  press(1); expectRoom("name", 3, 3);
  press(1, 20); // A.
  for (let row = 0; row < 4; row++) press(128, 20);
  press(16, 20); press(16, 20); press(1, 180); // DEL -> Aa -> OK.
  const prologue = expectRoom("prologue-first-frame", 8, 2);
  const introSave = copyModuleSavedata(core);
  const introInspected = inspectSavedataBytes(introSave);
  assert.equal(introInspected.slot?.status, "ok", "name confirmation creates a valid checkpoint");
  assert.equal(introInspected.hasUniversalSlotRecord, true, "intro checkpoint uses the universal format");
  writeFileSync(path.join(output, "intro.sav"), introSave);
  core._gba_destroy();
  boot(introSave);
  expectRoom("title-before-intro-load", 3, 0);
  assert.deepEqual(copyModuleSavedata(core), introSave, "opening preserves the intro checkpoint");
  press(8); press(16, 20); press(1, 100);
  expectRoom("intro-load-slots", 3, 4);
  press(1, 180);
  const introLoaded = expectRoom("loaded-prologue", 8, 2);
  assert.deepEqual(introLoaded.variables, prologue.variables, "intro Load restores campaign variables");
  if (skipPrologue) {
    press(2, 180);
  } else {
    press(1, 150); capture("prologue-second-frame");
    press(1, 150); capture("prologue-third-frame");
    press(1, 180);
  }
  expectRoom("port-after-prologue", 0, 0);

  // Walk to the mechanic; the authored event recovers the aircraft and saves.
  run(16, 90); run(128, 90); run(16, 70); run(64, 28); run(0, 4);
  press(1, 40);
  const recovered = expectRoom("aircraft-recovered", 0, 0);
  assert.equal(recovered.variables[1], 1, "mechanic sets the aircraft flag through interaction");
  const savedata = copyModuleSavedata(core);
  const inspected = inspectSavedataBytes(savedata);
  assert.equal(inspected.slot?.status, "ok", "autosave has a valid checksum");
  assert.equal(inspected.hasUniversalSlotRecord, true, "autosave contains the universal runtime record");
  writeFileSync(path.join(output, "campaign.sav"), savedata);
  evidence.push({ label: "save-integrity", inspected });

  // Restart the core and restore only battery data, never an emulator checkpoint.
  core._gba_destroy();
  boot(savedata);
  const fresh = expectRoom("fresh-title", 3, 0);
  assert.equal(fresh.variables[1], 0, "new execution has no restored campaign flag before Load");
  assert.deepEqual(copyModuleSavedata(core), savedata, "opening preserves all existing battery data");
  press(8); press(16, 20); press(1, 100);
  expectRoom("load-slots", 3, 4);
  press(1, 180);
  const loaded = expectRoom("loaded-port", 0, 0);
  assert.equal(loaded.variables[1], 1, "Load restores campaign progress");
  assert.equal(loaded.player.x, recovered.player.x, "Load restores player X");
  assert.equal(loaded.player.y, recovered.player.y, "Load restores player Y");

  // Open the in-game menus and resume the suspended gameplay scene.
  press(8, 120); expectRoom("pause-menu", 3, 11);
  press(1); expectRoom("quests", 3, 7);
  press(2); expectRoom("pause-after-quests", 3, 11);
  press(128, 20); press(1); expectRoom("inventory", 3, 8);
  press(2); expectRoom("pause-after-inventory", 3, 11);
  press(128, 20); press(1); expectRoom("map-menu", 3, 9);
  press(2); expectRoom("pause-after-map", 3, 11);
  press(2, 120);
  const resumed = expectRoom("resumed-port", 0, 0);
  assert.deepEqual(resumed.player, loaded.player, "menus preserve the suspended player position");
  assert.equal(resumed.variables[1], 1, "menus preserve campaign progress");

  run(32, 96); run(128, 100); run(0, 180);
  expectRoom("route-map", 10, 0);
  press(16, 30); press(1, 90);
  const locked = expectRoom("warehouse-still-locked", 10, 2);
  assert.equal(locked.variables[4], 0, "warehouse requires the Penedos upgrade");
  press(64, 30); press(1, 900);
  expectRoom("penedos-from-map", 1, 0);
  if (chapterTwo) {
    run(17, 50); run(0, 70);
    run(17, 55); run(16, 8); run(17, 45); run(0, 70);
    capture("farol-checkpoint-dialogue");
    press(1, 60);
    const checkpoint = copyModuleSavedata(core);
    assert.equal(inspectSavedataBytes(checkpoint).hasUniversalSlotRecord, true);
    writeFileSync(path.join(output, "farol.sav"), checkpoint);
    core._gba_destroy(); boot(checkpoint);
    assert.deepEqual(copyModuleSavedata(core), checkpoint, "opening preserves the farol checkpoint");
    press(8); press(16, 20); press(1, 100); press(1, 180);
    const restored = expectRoom("loaded-farol", 1, 0);
    run(16, 80);
    const moved = expectRoom("move-after-farol-load", 1, 0);
    assert.ok(moved.player.x > restored.player.x, "player can move after restoring the farol checkpoint");
    run(32, 48); run(0, 8); run(17, 120);
    run(16, 40); run(17, 100); run(16, 58); run(0, 8);
    run(129, 60); run(0, 300);
    const warehouse = expectRoom("warehouse-after-grip", 5, 0);
    assert.equal(warehouse.variables[4], 1, "native pickup awards the grip module");
    const warehouseSave = expectCheckpoint("warehouse-checkpoint", 5, 0);
    run(2, 16); run(0, 40);
    expectRoom("warehouse-after-cancel", 5, 0);
    assert.deepEqual(copyModuleSavedata(core), warehouseSave, "B preserves the campaign checkpoint in the warehouse");
    const loadedWarehouse = loadCheckpoint(warehouseSave, "loaded-warehouse", 5, 0);
    assert.deepEqual(loadedWarehouse.variables, warehouse.variables, "warehouse Load restores campaign flags");
    assert.deepEqual(loadedWarehouse.player, warehouse.player, "warehouse Load restores the cursor");
    assert.deepEqual(copyModuleSavedata(core), warehouseSave, "Load does not rewrite the checkpoint");
    expectMusic("music-after-warehouse-load");
    assert.deepEqual(copyModuleSavedata(core), warehouseSave, "music restoration preserves the whole warehouse checkpoint");

    run(32, 12); run(64, 6); run(1, 16); run(0, 100); capture("warehouse-chart");
    run(1, 16); run(0, 30); run(16, 70); run(128, 30);
    run(1, 16); run(0, 100); capture("warehouse-chest");
    run(1, 16); run(0, 40); run(32, 30); run(128, 13);
    run(1, 16); run(0, 150);
    const observatory = expectRoom("observatory-after-warehouse", 5, 1);
    assert.equal(observatory.variables[10], 1, "warehouse exit records completion");
    const observatorySave = expectCheckpoint("observatory-checkpoint", 5, 1);
    run(2, 16); run(0, 40);
    assert.deepEqual(copyModuleSavedata(core), observatorySave, "B preserves the observatory checkpoint");
    const loadedObservatory = loadCheckpoint(observatorySave, "loaded-observatory", 5, 1);
    assert.deepEqual(loadedObservatory.variables, observatory.variables, "observatory Load restores completion of the warehouse");
    assert.deepEqual(loadedObservatory.player, observatory.player, "observatory Load restores the cursor");
    assert.deepEqual(copyModuleSavedata(core), observatorySave, "observatory Load does not rerun entry SaveGame");
    expectMusic("music-after-observatory-load");
    assert.deepEqual(copyModuleSavedata(core), observatorySave, "music restoration preserves the whole observatory checkpoint");

    run(1, 16); run(0, 100); capture("observatory-map");
    run(1, 16); run(0, 40); run(32, 42); run(64, 18);
    run(1, 16); run(0, 100); capture("observatory-telescope");
    run(1, 16); run(0, 40); run(16, 38); run(128, 40);
    run(1, 16); run(0, 200);
    const market = expectRoom("market-after-observatory", 2, 0);
    assert.equal(market.variables[11], 1, "observatory exit records completion");
  }
  if (chapterThree) {
    moveIsoTo(28, 22); tap(1, 150);
    const cargo = expectRoom("market-cargo", 2, 0);
    assert.equal(cargo.variables[12], 1, "cargo interaction opens the market shortcut");
    const marketSave = expectCheckpoint("market-checkpoint", 2, 0);
    const loadedCargo = loadCheckpoint(marketSave, "loaded-market", 2, 0);
    assert.deepEqual(loadedCargo.variables, cargo.variables, "market Load preserves all progress");
    assert.equal(loadedCargo.player.x, cargo.player.x, "market Load preserves tile X");
    assert.equal(loadedCargo.player.y, cargo.player.y, "market Load preserves tile Y");
    assert.deepEqual(copyModuleSavedata(core), marketSave, "market Load preserves the battery");
    moveIsoTo(27, 12); tap(1, 300);
    expectRoom("dungeon-after-market", 6, 0);
    tap(1); tap(1); tap(1);
    for (let step = 0; step < 9; step++) tap(64, 30);
    run(0, 250); expectRoom("sentinel-before-combat", 6, 1);
    tap(1); tap(1); tap(1);
    const battle = expectRoom("sentinel-battle-menu", 6, 1);
    assert.equal(battle.collision.currentFlags, 3, "sentinel starts with three HP");
    for (let hit = 1; hit <= 3; hit++) {
      tap(1);
      const attacked = expectRoom(`sentinel-hit-${hit}`, 6, 1);
      assert.equal(attacked.collision.currentFlags, 3 - hit, "native attacks reduce sentinel HP");
      assert.equal(attacked.collision.currentSlope, Math.max(1, 3 - hit), "counterattacks reduce player HP");
      if (hit < 3) tap(1);
    }
    assert.equal(readRuntimeTelemetry(core).firstActor.visible, false, "victory removes the sentinel");
    tap(1); tap(64, 250);
    const exit = expectRoom("dungeon-after-victory", 6, 2);
    assert.equal(exit.variables[3], 1, "native victory records completion of the combat");
    const victorySave = expectCheckpoint("sentinel-checkpoint", 6, 1);
    const loadedVictory = loadCheckpoint(victorySave, "loaded-sentinel-exit", 6, 2);
    assert.equal(loadedVictory.variables[3], 1, "loading the victory does not repeat combat");
    assert.deepEqual(copyModuleSavedata(core), victorySave, "loading the victory preserves the battery");
    // Collect through the authored interaction, then restart only from battery data.
    tap(1); tap(1); tap(1);
    const cell = expectRoom("energy-cell-collected", 6, 2);
    assert.equal(cell.variables[2], 1, "cell interaction records the upgrade");
    assert.equal(cell.firstActor.visible, false, "collected cell is hidden");
    const cellSave = expectCheckpoint("cell-checkpoint", 6, 2);
    const loadedCell = loadCheckpoint(cellSave, "loaded-cell", 6, 2);
    assert.deepEqual(loadedCell.variables, cell.variables, "cell Load preserves progress");
    assert.deepEqual(loadedCell.player, cell.player, "cell Load preserves the player's tile");
    assert.equal(loadedCell.firstActor.visible, false, "cell stays hidden after Load");
    assert.deepEqual(copyModuleSavedata(core), cellSave, "cell Load preserves the battery");
    tap(32, 40); tap(64, 260);
    expectRoom("council-after-cell", 9, 0);
    assert.deepEqual(copyModuleSavedata(core), cellSave, "council entry preserves the campaign checkpoint");
    tap(1); tap(1); tap(1);
    const storm = expectRoom("storm-after-alliance", 4, 0);
    assert.equal(storm.variables[8], 1, "accepting the alliance records the decision");
    const councilSave = expectCheckpoint("council-alliance-checkpoint", 9, 0);
    const loadedCouncil = loadCheckpoint(councilSave, "loaded-alliance-to-storm", 4, 0, 9);
    assert.equal(loadedCouncil.variables[8], 1, "Load resumes the accepted alliance without repeating the choice");
    assert.deepEqual(copyModuleSavedata(core), councilSave, "council Load preserves the whole battery");
    tap(65, 0); run(1, 600); run(0, 180);
    const relay = expectRoom("relay-after-storm", 11, 0);
    assert.equal(relay.variables[6], 1, "native storm clear awards the shield");
    const stormSave = expectCheckpoint("storm-cleared-checkpoint", 4, 0);
    const loadedStorm = loadCheckpoint(stormSave, "loaded-cleared-storm-to-battle", 11, 0, 4);
    assert.equal(loadedStorm.variables[6], 1, "Load preserves the awarded shield");
    assert.deepEqual(copyModuleSavedata(core), stormSave, "storm Load preserves the whole battery");
    if (finale) {
      for (let cast = 1; cast <= 9; cast++) {
        const before = readRuntimeTelemetry(core).firstActor.x;
        tap(1, 100); tap(128, 40); tap(1, 100);
        const hit = expectRoom(`guardian-magic-${cast}`, 11, 0);
        assert.ok(hit.firstActor.x < before, "exported magic damages the Guardian through native combat");
        tap(1, 250);
      }
      const fight = expectRoom("guardian-victory-to-fighting", 12, 0);
      assert.equal(fight.variables[13], 1, "native Guardian victory records the relay upgrade");
      const guardianSave = expectCheckpoint("guardian-victory-checkpoint", 11, 0);
      const loadedGuardian = loadCheckpoint(guardianSave, "loaded-guardian-to-fighting", 12, 0, 11);
      assert.equal(loadedGuardian.variables[13], 1, "Load preserves the relay reward");
      assert.deepEqual(copyModuleSavedata(core), guardianSave, "Guardian Load does not repeat the victory hook or rewards");
      for (let round = 1; round <= 2; round++) {
        run(16, 25);
        for (let hit = 0; hit < 24; hit++) {
          run(1, 4); run(0, 12);
          if (readRuntimeTelemetry(core).collision.currentFlags >= round) break;
        }
        const won = expectRoom(`fighting-round-${round}`, 12, 0);
        assert.equal(won.collision.currentFlags, round, "native punches win the round");
        if (round === 1) assert.deepEqual(copyModuleSavedata(core), guardianSave,
          "an intermediate round preserves the last explicit checkpoint");
      }
      run(0, 200);
      const race = expectRoom("fighting-victory-to-racing", 7, 0);
      assert.equal(race.variables[7], 1, "winning both rounds records the racing boost");
      const fightingSave = expectCheckpoint("fighting-victory-checkpoint", 12, 0);
      const loadedFight = loadCheckpoint(fightingSave, "loaded-fighting-to-racing", 7, 0, 12);
      assert.equal(loadedFight.variables[7], 1, "Load preserves the racing boost");
      assert.deepEqual(copyModuleSavedata(core), fightingSave, "fighting Load does not repeat completed rounds or rewards");
      expectRaceBackground();
      driveRace();
      run(0, 120);
      const finish = expectRoom("racing-victory-dialogue", 7, 0);
      assert.equal(finish.variables[14], 1, "three laps record campaign completion");
      const finishSave = expectCheckpoint("campaign-finished-checkpoint", 7, 0);
      tap(1, 250);
      const title = expectRoom("title-after-campaign-ending", 3, 0);
      assert.equal(title.variables[14], 1, "returning to the title preserves completion");
      assert.deepEqual(copyModuleSavedata(core), finishSave, "title preserves the completed campaign battery");
      const restored = loadCheckpoint(finishSave, "loaded-campaign-finish", 7, 0);
      assert.equal(restored.variables[14], 1, "fresh-ROM Load preserves completion");
      assert.equal(readRaceState().laps, 3, "fresh-ROM Load preserves all completed laps");
      assert.equal(readRaceState().result, 1, "fresh-ROM Load preserves racing victory");
      tap(1, 250);
      expectRoom("title-after-loaded-ending", 3, 0);
    } else {
      loadCheckpoint(stormSave, "loaded-storm-again", 11, 0, 4);
      assert.deepEqual(copyModuleSavedata(core), stormSave, "repeated Load preserves the explicit checkpoint");
    }
    evidence.push({label: "checkpoint-policy", note: "Explicit SaveGame updates the universal checkpoint in each family. Fresh-core Load resumes the saved command continuation; gameplay/round autosaves preserve the last explicit checkpoint."});
  }
  passed = true;
  console.log(`PASS: native opening, prologue, mechanic, fresh-ROM save/load, pause menus and map travel${chapterTwo ? ", Penedos upgrade, point-click chapters and checkpoints through Mercado" : ""}${chapterThree ? ", market cargo, sentinel victory, cell save/load, council, storm clear and relay entry" : ""}${finale ? ", Guardian victory, two fighting rounds, background fidelity, three racing laps, ending and fresh-ROM completion Load" : ""}`);
} finally {
  writeFileSync(path.join(output, "result.json"), JSON.stringify({
    passed, skipPrologue, female, chapterTwo, chapterThree, finale, romSha256: createHash("sha256").update(rom).digest("hex"),
    linkMapSha256: linkMap ? createHash("sha256").update(linkMap).digest("hex") : undefined,
    emulatedFrames, inputs, evidence,
    limitations: [finale ? "Optional branches and arbitrary mid-combat checkpoints are not exercised by this campaign route." : chapterThree ? "Relay victory, fighting match, racing finish and checkpoints in these families are not exercised." : chapterTwo ? "Challenges after entering Mercado and campaign ending are not exercised." : "Remaining challenges and campaign ending are not exercised by this first route.", "Emulator evidence does not validate physical hardware."]
  }, null, 2) + "\n");
  core._gba_destroy();
}
