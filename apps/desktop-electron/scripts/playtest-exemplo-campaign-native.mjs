import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import createMGBA from "../static/WebPlayer/player/mgba-core.mjs";
import {
  copyModuleSavedata, inspectSavedataBytes, readRuntimeTelemetry, restoreModuleSavedata
} from "../static/WebPlayer/player/mgba-direct-player.mjs";
import { decodePngRgba, encodePngRgba } from "./lib/png-icons.mjs";
import { decodeMGBAHardwareVideoState } from "./native-scene-framebuffer-contract.mjs";
import { playCampaignEvolutions } from "./lib/campaign-evolutions-playthrough.mjs";
import { readNativeCoastState, readNativeUI, readNativeRacing, readNativePausedRace, readNativeSceneMenu, runtimeNativeSymbols } from "./lib/native-ui-diagnostics.mjs";

// Production ROM, native controller input only. No QA driver or RAM writes.
const [romPath, output] = process.argv.slice(2);
assert.ok(romPath && output, "usage: node scripts/playtest-exemplo-campaign-native.mjs ROM OUTPUT [--skip-prologue] [--female] [--chapter-two] [--chapter-three | --finale] --contract=EXPORT_JSON [--map=ROM_MAP]");
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
assert.ok(contractPath, "campaign navigation requires the production export contract");
const exported = contractPath ? JSON.parse(readFileSync(contractPath, "utf8")) : null;
function menuSceneIndex(name) {
  assert.ok(exported?.menu_project, "campaign navigation requires --contract=EXPORT_JSON");
  const index = exported.menu_project.screens.findIndex(screen => screen.name === name);
  assert.ok(index >= 0, `production menu contains ${name}`);
  return index;
}
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
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  const diagnostics = nativeDiagnostics && state.runtimeKind === 1 ? {
    platformer: platformerDiagnostic(),
    variables: Array.from({ length: 64 }, (_, index) => platformerVariable(index)),
    ui: nativeUI()
  } : undefined;
  evidence.push({ label, emulatedFrames, state, diagnostics, ui: nativeDiagnostics ? nativeUI() : undefined });
  return state;
}
function expectRoom(label, kind, room) {
  const state = capture(label);
  assert.equal(state.runtimeKind, kind, `${label}: runtime`);
  assert.equal(state.currentRoom, room, `${label}: room`);
  console.log(`${label}: runtime ${kind}, room ${room}`);
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
  expectRoom(`${label}-title`, 3, menuSceneIndex("title"));
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
function isometricDiagnostic() {
  const d = matchingNativeDiagnostics();
  assert.equal(readRuntimeTelemetry(core).runtimeKind, 2);
  return readNativeCoastState(2, d.symbols, d.layouts, nativeRead8, nativeRead32);
}
function moveIsoTo(tx, ty) {
  closeNativeDialogue();
  const state = readRuntimeTelemetry(core);
  assert.equal(state.runtimeKind, 2, "isometric route uses the native runtime");
  const room = exported.isometric_project.rooms[state.currentRoom];
  const actors = isometricDiagnostic().actors;
  const player = actors.find(actor => actor.index === 0);
  const start = [player.x, player.y], queue = [start], previous = new Map([[start.join(","), null]]);
  for (let i = 0; i < queue.length && !previous.has(`${tx},${ty}`); i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= room.width_tiles || ny >= room.height_tiles
        || previous.has(key) || room.collision_flags[ny * room.width_tiles + nx] & 1
        || actors.some(actor => actor.index > 0 && actor.visible && actor.x === nx && actor.y === ny)) continue;
      const delta = room.height_levels[ny * room.width_tiles + nx] - room.height_levels[y * room.width_tiles + x];
      const ramp = room.ramp_flags[delta > 0 ? ny * room.width_tiles + nx : y * room.width_tiles + x];
      const sign = delta > 0 ? 1 : -1;
      if (Math.abs(delta) > 1 || delta !== 0 && !(ramp & 2 && dx === sign && !dy
        || ramp & 4 && dy === sign && !dx || ramp & 8 && dy === -sign && !dx || ramp & 16 && dx === -sign && !dy)) continue;
      previous.set(key, [x, y]); queue.push([nx, ny]);
    }
  }
  assert.ok(previous.has(`${tx},${ty}`), `native authored ramps reach ${tx},${ty}`);
  const route = [];
  for (let point = [tx, ty]; previous.get(point.join(",")) !== null;) {
    route.push(point); point = previous.get(point.join(","));
  }
  for (const [x, y] of route.reverse()) for (const [axis, coordinate] of [["x256", x * 256], ["y256", y * 256]]) {
    let reached = false;
    for (let frame = 0; frame < 100; frame++) {
      const current = isometricDiagnostic().actors.find(actor => actor.index === 0);
      const delta = coordinate - current[axis];
      if (Math.abs(delta) < 16) { reached = true; break; }
      const key = axis === "x256" ? delta > 0 ? 144 : 96 : delta > 0 ? 160 : 80;
      run(key, Math.max(1, Math.min(4, Math.floor(Math.abs(delta) / 16))));
    }
    assert.ok(reached, `isometric controller reaches ${x},${y} ${axis}`);
  }
  run(0, 8);
}

function faceDungeon(direction) {
  for (let turn = 0; turn < 4 && readRuntimeTelemetry(core).player.direction !== direction; turn++) tap(16, 24);
  assert.equal(readRuntimeTelemetry(core).player.direction, direction, "native dungeon facing");
}
function moveDungeonTo(tx, ty) {
  closeNativeDialogue();
  const initial = readRuntimeTelemetry(core);
  assert.equal(initial.runtimeKind, 6);
  const room = exported.dungeon_crawler_project.rooms[initial.currentRoom];
  const start = [initial.player.x, initial.player.y], queue = [start], previous = new Map([[start.join(","), null]]);
  for (let i = 0; i < queue.length && !previous.has(`${tx},${ty}`); i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= room.width_tiles || ny >= room.height_tiles
        || previous.has(key) || room.collision_flags[ny * room.width_tiles + nx] & 1) continue;
      previous.set(key, [x, y]); queue.push([nx, ny]);
    }
  }
  assert.ok(previous.has(`${tx},${ty}`), "authored dungeon route reaches the target");
  const route = [];
  for (let point = [tx, ty]; previous.get(point.join(",")) !== null;) {
    route.push(point); point = previous.get(point.join(","));
  }
  for (const [x, y] of route.reverse()) {
    const before = readRuntimeTelemetry(core).player;
    faceDungeon(x > before.x ? 1 : x < before.x ? 3 : y > before.y ? 2 : 0);
    tap(64, 28);
    const state = readRuntimeTelemetry(core);
    assert.equal(state.runtimeKind, 6); assert.equal(state.currentRoom, initial.currentRoom);
    assert.deepEqual([state.player.x, state.player.y], [x, y], "ordinary dungeon step follows the corridor");
  }
}
function moveTopdownTo(tx, ty) {
  assert.ok(exported?.topdown_project, "topdown campaign navigation requires --contract=EXPORT_JSON");
  const initial = readRuntimeTelemetry(core);
  assert.equal(initial.runtimeKind, 0, "topdown navigation uses ordinary gameplay");
  const room = exported.topdown_project.rooms[initial.currentRoom];
  const player = exported.topdown_project.player;
  const start = [Math.round(initial.player.x / 8), Math.round(initial.player.y / 8)];
  const queue = [start], previous = new Map([[start.join(","), null]]);
  function valid(x, y) {
    const left = x * 8 + player.collision_offset.x, top = y * 8 + player.collision_offset.y;
    for (let yy = Math.floor(top / 8); yy <= Math.floor((top + player.size.y - 1) / 8); yy++) {
      for (let xx = Math.floor(left / 8); xx <= Math.floor((left + player.size.x - 1) / 8); xx++) {
      if (xx < 0 || yy < 0 || xx >= room.width_tiles || yy >= room.height_tiles
        || room.collision_flags[yy * room.width_tiles + xx] & 1) return false;
      }
    }
    return !room.npcs.some((npc, index) => {
      if (!(player.collision_mask & (1 << npc.collision_group))
        || !(npc.collision_mask & (1 << player.collision_group))) return false;
      const actor = index === 0 ? initial.firstActor : npc.position;
      const ax = actor.x + npc.collision_offset.x, ay = actor.y + npc.collision_offset.y;
      return left < ax + npc.size.x && left + player.size.x > ax
        && top < ay + npc.size.y && top + player.size.y > ay;
    });
  }
  for (let index = 0; index < queue.length && !previous.has(`${tx},${ty}`); index++) {
    const [x, y] = queue[index];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = [x + dx, y + dy], key = next.join(",");
      if (!previous.has(key) && valid(...next)) {
        previous.set(key, [x, y]); queue.push(next);
      }
    }
  }
  assert.ok(previous.has(`${tx},${ty}`), `authored walkable path reaches ${tx},${ty}`);
  const route = [];
  for (let point = [tx, ty]; previous.get(point.join(",")) !== null;) {
    route.push(point); point = previous.get(point.join(","));
  }
  for (const point of route.reverse()) for (const [axis, target] of [["x", point[0] * 8], ["y", point[1] * 8]]) {
    let reached = false, stalled = 0;
    for (let step = 0; step < 200; step++) {
      const state = readRuntimeTelemetry(core);
      assert.equal(state.runtimeKind, 0); assert.equal(state.currentRoom, initial.currentRoom);
      const delta = target - state.player[axis];
      if (delta === 0) { reached = true; break; }
      const key = axis === "x" ? delta < 0 ? 32 : 16 : delta < 0 ? 64 : 128;
      run(key, Math.min(4, Math.abs(delta)));
      if (readRuntimeTelemetry(core).player[axis] === state.player[axis]) {
        assert.ok(++stalled < 24, `controller movement is blocked at ${state.player.x},${state.player.y}`);
      } else stalled = 0;
    }
    assert.ok(reached, `controller reaches ${axis}=${target}`);
    run(0, 4);
  }
}

function closeNativeDialogue() {
  for (let page = 0; page < 40 && nativeUI().dialogue; page++) {
    // The shmup runtime advances dialogue with A; the other campaign families
    // also support B, which closes a page without activating the next actor.
    press(readRuntimeTelemetry(core).runtimeKind === 4 ? 1 : 2, 40);
  }
  assert.equal(nativeUI().dialogue, null, "native dialogue closes through its supported control");
}
function clickPointClickHotspot(name, label) {
  closeNativeDialogue();
  const initial = readRuntimeTelemetry(core);
  assert.equal(initial.runtimeKind, 5);
  const scene = exported.point_click_project.scenes[initial.currentRoom];
  const target = scene.hotspots.find(hotspot => hotspot.name === name);
  assert.ok(target, `production scene contains hotspot ${name}`);
  const tx = target.area.x + Math.floor(target.area.width / 2);
  const ty = target.area.y + Math.floor(target.area.height / 2);
  const tolerance = Math.max(1, scene.cursor_speed ?? exported.point_click_project.cursor_speed);
  for (const [axis, coordinate] of [["x", tx], ["y", ty]]) {
    let reached = false;
    for (let frame = 0; frame < 600; frame++) {
      const state = readRuntimeTelemetry(core);
      assert.equal(state.runtimeKind, 5); assert.equal(state.currentRoom, initial.currentRoom);
      const delta = coordinate - state.player[axis];
      if (Math.abs(delta) <= tolerance) { reached = true; break; }
      run(axis === "x" ? delta < 0 ? 32 : 16 : delta < 0 ? 64 : 128, 1);
    }
    assert.ok(reached, `controller cursor reaches ${name} ${axis}`);
    run(0, 4);
  }
  press(1, 180);
  return capture(label);
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
function nativeRead8(address) {
  return core._gba_audio_register(address & ~1) >>> ((address & 1) * 8) & 255;
}
let nativeDiagnostics;
function matchingNativeDiagnostics() {
  if (nativeDiagnostics) return nativeDiagnostics;
  const directory = path.join(output, "abi");
  const diagnostic = spawnSync(process.execPath, [
    fileURLToPath(new URL("./smoke-lost-signal-mission.mjs", import.meta.url)),
    romPath, path.dirname(path.dirname(path.resolve(romPath))), directory, "--diagnostics-only"
  ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  assert.equal(diagnostic.status, 0, diagnostic.stdout + diagnostic.stderr);
  const report = JSON.parse(readFileSync(path.join(directory, "report.json"), "utf8"));
  assert.equal(report.romSha256, createHash("sha256").update(rom).digest("hex"));
  nativeDiagnostics = report.diagnostics;
  return nativeDiagnostics;
}
function nativeUI() {
  const d = matchingNativeDiagnostics();
  const string = address => {
    let value = "";
    for (let index = 0; index < 2048 && address; index++) {
      const byte = nativeRead8(address + index);
      if (!byte) break;
      value += String.fromCharCode(byte);
    }
    return value;
  };
  return readNativeUI(runtimeNativeSymbols(d.symbols, readRuntimeTelemetry(core).runtimeKind),
    d.layouts, nativeRead8, nativeRead32, string);
}
function platformerDiagnostic() {
  const d = matchingNativeDiagnostics();
  assert.equal(readRuntimeTelemetry(core).runtimeKind, 1);
  return readNativeCoastState(1, d.symbols, d.layouts, nativeRead8, nativeRead32);
}
function nativeVariable(index) {
  const d = matchingNativeDiagnostics(), state = readRuntimeTelemetry(core);
  assert.ok(d.eventStatesByRuntime[state.runtimeKind], "matching ABI contains the current family");
  const address = d.eventStatesByRuntime[state.runtimeKind] + d.layouts.event.variables;
  assert.ok(state.variables.every((value, i) => nativeRead32(address + i * 4) === value),
    "matching event ABI agrees with video telemetry");
  return nativeRead32(address + index * 4);
}
function platformerVariable(index) {
  assert.equal(readRuntimeTelemetry(core).runtimeKind, 1);
  return nativeVariable(index);
}
function runPlatformerTicks(keys, ticks) {
  if (readRuntimeTelemetry(core).runtimeKind !== 1) { run(keys, ticks); return; }
  const d = matchingNativeDiagnostics();
  const address = d.eventStatesByRuntime[1] + d.layouts.event.event_frame_counter;
  const start = nativeRead32(address);
  // Controller durations follow the real simulation counter. A video frame
  // need not contain a physics update while the native renderer streams BGs.
  for (let video = 0; video < ticks * 8 + 120; video++) {
    if (readRuntimeTelemetry(core).runtimeKind !== 1) { run(0, 120); return; }
    if (((nativeRead32(address) - start) >>> 0) >= ticks) return;
    run(keys, 1);
  }
  assert.fail(`platformer did not advance ${ticks} native simulation ticks`);
}
function battleDiagnostic() {
  const d = matchingNativeDiagnostics(), fields = d.layouts.battle;
  const symbols = runtimeNativeSymbols(d.symbols, 11);
  const address = (name, size) => {
    const symbol = symbols.find(s => s.name.endsWith(`::${name}`) && (!size || s.size === size));
    assert.ok(symbol, `matching battle ABI contains ${name}`); return symbol.address;
  };
  const state = address("state", fields.size), effect = address("effect_position");
  let prompt = "";
  for (let i = 0, pointer = address("authored_prompt"); i < 64; i++) {
    const byte = nativeRead8(pointer + i); if (!byte) break; prompt += String.fromCharCode(byte);
  }
  return {
    partyHp: Array.from({ length: 4 }, (_, i) => nativeRead32(state + fields.party_hp + i * 4)),
    enemyHp: nativeRead32(state + fields.enemy_hp),
    selectedParty: nativeRead32(state + fields.selected_party),
    pending: !!nativeRead8(state + fields.enemy_turn_pending), outcome: nativeRead8(state + fields.outcome),
    page: nativeRead8(address("battle_menu_page")), prompt,
    effectPosition: [nativeRead32(effect), nativeRead32(effect + 4)]
  };
}
function campaignDriver() {
  return {
    run(frames, keys) { run(keys, frames); },
    state() { const state = readRuntimeTelemetry(core); return { ...state, variables: Array.from({ length: 64 }, (_, i) => nativeVariable(i)) }; },
    dialogue() { return !!nativeUI().dialogue; }, ui: nativeUI, battle: battleDiagnostic,
    capture,
    frame() { const p = core._gba_framebuffer(); const pixels = core.HEAPU8.slice(p, p + 153600); for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255; return pixels; },
    hardware() { const size = core._gba_state_size(), p = core._malloc(size); assert.equal(core._gba_save_state(p, size), 1); const result = decodeMGBAHardwareVideoState(core.HEAPU8.slice(p, p + size)); core._free(p); return result; }
  };
}
function selectNativeMenuItem(name, index) {
  assert.equal(readRuntimeTelemetry(core).runtimeKind, 3);
  assert.equal(readRuntimeTelemetry(core).currentRoom, menuSceneIndex(name));
  const d = matchingNativeDiagnostics();
  for (let step = 0; step < 30; step++) {
    const selected = readNativeSceneMenu(d.symbols, d.layouts, nativeRead32).selected;
    if (selected === index) { press(1, 120); return; }
    press(selected < index ? 128 : 64, 12);
  }
  assert.fail(`native selection reaches ${name} item ${index}`);
}
function nativeTextSlot(index) {
  const d = matchingNativeDiagnostics(), state = readRuntimeTelemetry(core);
  const address = d.eventStatesByRuntime[state.runtimeKind] + d.layouts.event.text_variables + 17 * index;
  let text = "";
  for (let i = 0; i < 16; i++) { const byte = nativeRead8(address + i); if (!byte) break; text += String.fromCharCode(byte); }
  return text;
}
function readRaceState() {
  const d = matchingNativeDiagnostics();
  for (let attempt = 0; attempt < 8; attempt++) {
    const native = readNativeRacing(d.symbols, d.layouts, nativeRead8, nativeRead32);
    const state = { ...native, checkpoints: native.gates };
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
  expectRoom("title", 3, menuSceneIndex("title"));
  press(8); expectRoom("title-options", 3, menuSceneIndex("title_options"));
  press(1); expectRoom("gender", 3, menuSceneIndex("escolha_genero"));
  if (female) press(16, 20);
  press(1); expectRoom("name", 3, menuSceneIndex("nome_jogador"));
  press(1, 20); // A.
  for (let row = 0; row < 4; row++) press(128, 20);
  press(16, 20); press(16, 20); press(1, 180); // DEL -> Aa -> OK.
  const prologue = expectRoom("prologue-first-frame", 8, 2);
  const introSave = copyModuleSavedata(core);
  const introInspected = inspectSavedataBytes(introSave);
  assert.equal(introInspected.slot?.status, "ok", "name confirmation creates a valid checkpoint");
  assert.equal(introInspected.hasUniversalSlotRecord, true, "intro checkpoint uses the universal format");
  // Video telemetry exposes only the first sixteen variables. The actual
  // universal save contains all sixty-four, including the gender at index 17.
  const introUniversalOffset = introInspected.recordMagicOffset + 40;
  const introView = new DataView(introSave.buffer, introSave.byteOffset, introSave.byteLength);
  assert.equal(introView.getUint16(introUniversalOffset + 4, true), 4, "intro uses the current universal save schema");
  assert.equal(introView.getInt32(introUniversalOffset + 28 + 17 * 4, true), female ? 1 : 0,
    "gender selection is stored in the real prologue checkpoint");
  writeFileSync(path.join(output, "intro.sav"), introSave);
  core._gba_destroy();
  boot(introSave);
  expectRoom("title-before-intro-load", 3, menuSceneIndex("title"));
  assert.deepEqual(copyModuleSavedata(core), introSave, "opening preserves the intro checkpoint");
  press(8); press(16, 20); press(1, 100);
  expectRoom("intro-load-slots", 3, menuSceneIndex("carregar_jogo"));
  press(1, 180);
  const introLoaded = expectRoom("loaded-prologue", 8, 2);
  assert.deepEqual(introLoaded.variables, prologue.variables, "intro Load restores campaign variables");
  // Localized dialogue can span multiple pages within the same authored frame.
  // Advance it with real controls until gameplay publishes its actual scene.
  for (let page = 0; page < 24 && readRuntimeTelemetry(core)?.runtimeKind === 8; page++) {
    press(skipPrologue ? 2 : 1, 180);
    capture(`prologue-page-${page + 1}`);
  }
  expectRoom("port-after-prologue", 0, 0);

  // Walk to the mechanic; the authored event recovers the aircraft and saves.
  for (let attempt = 0; attempt < 8 && readRuntimeTelemetry(core).variables[1] === 0; attempt++) {
    const mechanic = readRuntimeTelemetry(core).firstActor;
    const ax = Math.round(mechanic.x / 8), ay = Math.round(mechanic.y / 8);
    let approached = false;
    for (const [x, y, facing] of [[ax - 2, ay, 16], [ax, ay + 2, 64], [ax, ay - 2, 128], [ax + 2, ay, 32]]) {
      try {
        moveTopdownTo(x, y); run(facing, 1); run(0, 8); press(1, 60);
        approached = true; break;
      } catch (error) {
        if (!/authored walkable path reaches|controller movement is blocked/.test(String(error))) throw error;
      }
    }
    assert.ok(approached || attempt < 7, "the moving mechanic has a reachable interaction side");
  }
  const recovered = expectRoom("aircraft-recovered", 0, 0);
  assert.equal(recovered.variables[1], 1, "mechanic sets the aircraft flag through interaction");
  for (let page = 0; page < 24; page++) {
    const battery = copyModuleSavedata(core), info = inspectSavedataBytes(battery);
    if (info.slot?.status === "ok" && battery[info.recordMagicOffset + 40 + 6] === 0) break;
    press(1, 180);
  }
  expectCheckpoint("aircraft-checkpoint", 0, 0);
  const savedata = copyModuleSavedata(core);
  const inspected = inspectSavedataBytes(savedata);
  assert.equal(inspected.slot?.status, "ok", "autosave has a valid checksum");
  assert.equal(inspected.hasUniversalSlotRecord, true, "autosave contains the universal runtime record");
  writeFileSync(path.join(output, "campaign.sav"), savedata);
  evidence.push({ label: "save-integrity", inspected });

  // Restart the core and restore only battery data, never an emulator checkpoint.
  core._gba_destroy();
  boot(savedata);
  const fresh = expectRoom("fresh-title", 3, menuSceneIndex("title"));
  assert.equal(fresh.variables[1], 0, "new execution has no restored campaign flag before Load");
  assert.deepEqual(copyModuleSavedata(core), savedata, "opening preserves all existing battery data");
  press(8); press(16, 20); press(1, 100);
  expectRoom("load-slots", 3, menuSceneIndex("carregar_jogo"));
  press(1, 180);
  const loaded = expectRoom("loaded-port", 0, 0);
  assert.equal(loaded.variables[1], 1, "Load restores campaign progress");
  assert.equal(loaded.player.x, recovered.player.x, "Load restores player X");
  assert.equal(loaded.player.y, recovered.player.y, "Load restores player Y");

  // Open the in-game menus and resume the suspended gameplay scene.
  press(8, 120); expectRoom("pause-menu", 3, menuSceneIndex("menu_start"));
  press(1); expectRoom("quests", 3, menuSceneIndex("missoes"));
  press(2); expectRoom("pause-after-quests", 3, menuSceneIndex("menu_start"));
  press(128, 20); press(1); expectRoom("inventory", 3, menuSceneIndex("inventario"));
  press(2); expectRoom("pause-after-inventory", 3, menuSceneIndex("menu_start"));
  press(128, 20); press(1); expectRoom("map-menu", 3, menuSceneIndex("mapa_menu"));
  press(2); expectRoom("pause-after-map", 3, menuSceneIndex("menu_start"));
  press(2, 120);
  const resumed = expectRoom("resumed-port", 0, 0);
  assert.deepEqual(resumed.player, loaded.player, "menus preserve the suspended player position");
  assert.equal(resumed.variables[1], 1, "menus preserve campaign progress");

  moveTopdownTo(64, 4);
  for (let frame = 0; frame < 160 && readRuntimeTelemetry(core).runtimeKind === 0; frame++) run(64, 1);
  run(0, 180);
  expectRoom("route-map", 10, 0);
  press(16, 30); press(1, 90);
  const locked = expectRoom("warehouse-still-locked", 10, 2);
  assert.equal(locked.variables[4], 0, "warehouse requires the Penedos upgrade");
  press(64, 30); press(1, 900);
  expectRoom("penedos-from-map", 1, 0);
  if (chapterTwo) {
    const approvedRoute = JSON.parse(readFileSync(new URL("./platformer-approved-playtest-route.json", import.meta.url), "utf8"));
    const restart = approvedRoute.findIndex(([label]) => label === "restart-route");
    const beacon = approvedRoute.findIndex(([label]) => label === "beacon");
    assert.ok(restart >= 0 && beacon > restart);
    let checkpointTested = false;
    for (const [label, keys, frames] of approvedRoute.slice(restart + 1, beacon + 1)) {
      runPlatformerTicks(keys, frames);
      if (label) capture(`penedos-${label}`);
      if (label === "beacon") {
        const checkpoint = expectCheckpoint("farol", 1, 0);
        const restored = loadCheckpoint(checkpoint, "loaded-farol", 1, 0);
        assert.equal(platformerVariable(28), 1, "checkpoint token survives fresh boot and Load");
        evidence.push({ label: "penedos-checkpoint-restored", player: restored.player });
        checkpointTested = true;
      }
    }
    assert.ok(checkpointTested, "the campaign route exercised a real checkpoint");
    function penedosLeap(glideTicks, label) {
      for (const [keys, ticks] of [[17, 12], [16, 2], [17, 16], [272, glideTicks], [0, 40]]) {
        runPlatformerTicks(keys, ticks);
      }
      capture(label);
    }
    runPlatformerTicks(16, 20); runPlatformerTicks(0, 15);
    penedosLeap(45, "penedos-second-cliff");
    runPlatformerTicks(16, 20); runPlatformerTicks(0, 15);
    // Descend before the east cliff and use L against the actual nearby enemy.
    // Keeping R held while descending preserves the native glide ability.
    for (const [keys, ticks] of [[17, 12], [16, 2], [17, 16], [272, 35]]) runPlatformerTicks(keys, ticks);
    let eastCrabDefeated = false;
    for (let step = 0; step < 260; step++) {
      const state = readRuntimeTelemetry(core);
      assert.equal(state.runtimeKind, 1, "combat stays in Penedos");
      if (platformerVariable(31) === 2) { eastCrabDefeated = true; break; }
      const physics = platformerDiagnostic();
      const enemy = physics.actors.find(actor => actor.visible && actor.group === 1
        && Math.abs(actor.x - state.player.x - 8)
          + Math.abs(actor.y - state.player.y - physics.platform.height) <= 29);
      if (enemy) {
        runPlatformerTicks(enemy.x >= state.player.x + 8 ? 16 : 32, 1);
        runPlatformerTicks(512 | 256, 2); runPlatformerTicks(256, 18);
        capture(`penedos-attack-${enemy.index}`);
      } else runPlatformerTicks(physics.platform.onGround ? 16 : 256, 1);
    }
    assert.ok(eastCrabDefeated, "controller attack defeated the east crab");
    assert.equal(platformerVariable(27), 3, "the bridge and combat preserve all three health points");
    for (let step = 0; step < 100 && readRuntimeTelemetry(core).player.x > 600; step++) runPlatformerTicks(32, 1);
    assert.ok(readRuntimeTelemetry(core).player.x <= 600, "controller leaves the slope after combat");
    runPlatformerTicks(0, 15); penedosLeap(35, "penedos-leaving-east-bridge");
    for (let step = 0; step < 100 && readRuntimeTelemetry(core).player.x < 750; step++) runPlatformerTicks(16, 1);
    assert.ok(readRuntimeTelemetry(core).player.x >= 750, "controller approaches the final gap");
    runPlatformerTicks(0, 15); penedosLeap(60, "penedos-final-cliff");
    runPlatformerTicks(16, 100); run(0, 300);
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

    clickPointClickHotspot("Carta Náutica", "warehouse-chart");
    assert.equal(nativeVariable(34), 1, "authored chart hotspot gives the navigation item");
    clickPointClickHotspot("Baú Vermelho", "warehouse-chest");
    assert.equal(nativeVariable(35), 1, "the navigation item unlocks the chest");
    clickPointClickHotspot("Saída do Armazém", "warehouse-exit");
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

    clickPointClickHotspot("Telescópio", "observatory-telescope-step-1");
    assert.equal(nativeVariable(53), 1, "first telescope interaction records the observation");
    clickPointClickHotspot("Telescópio", "observatory-telescope-step-2");
    assert.equal(nativeVariable(36), 1, "second observation completes the telescope puzzle");
    clickPointClickHotspot("Mesa da Maré", "observatory-map");
    assert.equal(nativeVariable(37), 1, "chart plus telescope unlock the tide table");
    clickPointClickHotspot("Saída do Observatório", "observatory-exit");
    const market = expectRoom("market-after-observatory", 2, 0);
    assert.equal(market.variables[11], 1, "observatory exit records completion");
  }
  if (chapterThree) {
    moveIsoTo(41, 24); tap(1, 150);
    const cargo = expectRoom("market-cargo", 2, 0);
    assert.equal(cargo.variables[12], 1, "cargo interaction opens the market shortcut");
    const marketSave = expectCheckpoint("market-checkpoint", 2, 0);
    const loadedCargo = loadCheckpoint(marketSave, "loaded-market", 2, 0);
    assert.deepEqual(loadedCargo.variables, cargo.variables, "market Load preserves all progress");
    assert.equal(loadedCargo.player.x, cargo.player.x, "market Load preserves tile X");
    assert.equal(loadedCargo.player.y, cargo.player.y, "market Load preserves tile Y");
    assert.deepEqual(copyModuleSavedata(core), marketSave, "market Load preserves the battery");
    moveIsoTo(25, 3); tap(1, 300);
    expectRoom("dungeon-after-market", 6, 0);
    closeNativeDialogue();
    for (const [point, direction, value] of [[[1, 8], 1, 1], [[5, 6], 3, 2], [[9, 4], 3, 3]]) {
      moveDungeonTo(...point); faceDungeon(direction); tap(1, 60); closeNativeDialogue();
      assert.equal(nativeVariable(54), value, "the real valve sequence advances in order");
      capture(`dungeon-valve-${value}`);
    }
    const valvesSave = expectCheckpoint("valves-complete", 6, 0);
    loadCheckpoint(valvesSave, "loaded-valves", 6, 0);
    assert.equal(nativeVariable(54), 3, "the completed valve puzzle survives a fresh Load");
    moveDungeonTo(9, 2); faceDungeon(0); tap(64, 250);
    expectRoom("sentinel-before-combat", 6, 1);
    closeNativeDialogue(); tap(1);
    const battle = expectRoom("sentinel-battle-menu", 6, 1);
    assert.equal(battle.collision.currentFlags, 3, "sentinel starts with three HP");
    for (let hit = 1; hit <= 3; hit++) {
      tap(1);
      const attacked = expectRoom(`sentinel-hit-${hit}`, 6, 1);
      assert.equal(attacked.collision.currentFlags, 3 - hit, "native attacks reduce sentinel HP");
      assert.equal(attacked.collision.currentSlope, Math.max(1, 3 - hit), "counterattacks reduce player HP");
      closeNativeDialogue();
    }
    assert.equal(readRuntimeTelemetry(core).firstActor.visible, false, "victory removes the sentinel");
    closeNativeDialogue(); moveDungeonTo(9, 2); faceDungeon(0); tap(64, 250);
    const exit = expectRoom("dungeon-after-victory", 6, 2);
    assert.equal(exit.variables[3], 1, "native victory records completion of the combat");
    const victorySave = expectCheckpoint("sentinel-checkpoint", 6, 1);
    const loadedVictory = loadCheckpoint(victorySave, "loaded-sentinel-exit", 6, 2);
    assert.equal(loadedVictory.variables[3], 1, "loading the victory does not repeat combat");
    assert.deepEqual(copyModuleSavedata(core), victorySave, "loading the victory preserves the battery");
    // Collect through the authored interaction, then restart only from battery data.
    closeNativeDialogue(); tap(1); closeNativeDialogue();
    const cell = expectRoom("energy-cell-collected", 6, 2);
    assert.equal(cell.variables[2], 1, "cell interaction records the upgrade");
    assert.equal(cell.firstActor.visible, false, "collected cell is hidden");
    const cellSave = expectCheckpoint("cell-checkpoint", 6, 2);
    const loadedCell = loadCheckpoint(cellSave, "loaded-cell", 6, 2);
    assert.deepEqual(loadedCell.variables, cell.variables, "cell Load preserves progress");
    assert.deepEqual(loadedCell.player, cell.player, "cell Load preserves the player's tile");
    assert.equal(loadedCell.firstActor.visible, false, "cell stays hidden after Load");
    assert.deepEqual(copyModuleSavedata(core), cellSave, "cell Load preserves the battery");
    moveDungeonTo(9, 2); faceDungeon(0); tap(64, 260);
    expectRoom("council-after-cell", 9, 0);
    assert.deepEqual(copyModuleSavedata(core), cellSave, "council entry preserves the campaign checkpoint");
    tap(1); tap(1); tap(1);
    const storm = expectRoom("storm-after-alliance", 4, 0);
    assert.equal(storm.variables[8], 1, "accepting the alliance records the decision");
    const councilSave = expectCheckpoint("council-alliance-checkpoint", 9, 0);
    const loadedCouncil = loadCheckpoint(councilSave, "loaded-alliance-to-storm", 4, 0, 9);
    assert.equal(loadedCouncil.variables[8], 1, "Load resumes the accepted alliance without repeating the choice");
    assert.deepEqual(copyModuleSavedata(core), councilSave, "council Load preserves the whole battery");
    tap(65, 0); run(1, 600); closeNativeDialogue(); run(0, 180);
    const relay = expectRoom("relay-after-storm", 11, 0);
    assert.equal(relay.variables[6], 1, "native storm clear awards the shield");
    const stormSave = expectCheckpoint("storm-cleared-checkpoint", 4, exported.shmup_project.waves.length - 1);
    const loadedStorm = loadCheckpoint(stormSave, "loaded-cleared-storm-to-battle", 11, 0, 4);
    assert.equal(loadedStorm.variables[6], 1, "Load preserves the awarded shield");
    assert.deepEqual(copyModuleSavedata(core), stormSave, "storm Load preserves the whole battery");
    if (finale) {
      closeNativeDialogue();
      const projectFile = fileURLToPath(new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url));
      const relayProof = await playCampaignEvolutions(campaignDriver(), JSON.parse(readFileSync(projectFile)), exported,
        "relay", { projectRoot: path.dirname(projectFile) });
      assert.equal(relayProof.passed, true); assert.equal(relayProof.victory, true);
      evidence.push({ label: "guardian-party-abilities-and-victory", result: relayProof });
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
      run(0, 200); closeNativeDialogue(); run(0, 120);
      const race = expectRoom("fighting-victory-to-preparation", 3, menuSceneIndex("corrida_preparacao"));
      assert.equal(race.variables[7], 1, "winning both rounds records the racing boost");
      const fightingSave = expectCheckpoint("fighting-victory-checkpoint", 12, 0);
      const loadedFight = loadCheckpoint(fightingSave, "loaded-fighting-to-preparation", 3, menuSceneIndex("corrida_preparacao"), 12);
      assert.equal(loadedFight.variables[7], 1, "Load preserves the racing boost");
      assert.deepEqual(copyModuleSavedata(core), fightingSave, "fighting Load does not repeat completed rounds or rewards");
      press(1, 360); expectRoom("race-from-preparation", 7, 0);
      expectRaceBackground();
      driveRace();
      run(0, 120);
      const finish = expectRoom("racing-victory-results", 3, menuSceneIndex("corrida_resultados"));
      assert.equal(finish.variables[14], 0, "first victory awaits the authored Continue action");
      const record = nativeTextSlot(1);
      assert.match(record, /^\d\d:\d\d\.\d\d$/, "victory records a formatted race time");
      selectNativeMenuItem("corrida_resultados", 2);
      for (let wait = 0; wait < 30 && readRuntimeTelemetry(core).variables[14] !== 1; wait++) run(0, 12);
      assert.equal(readRuntimeTelemetry(core).variables[14], 1, "Continue records campaign completion");
      const raceFinishSave = expectCheckpoint("race-finished-checkpoint", 7, 0);
      let epilogueSeen = false, titleSeen = false;
      for (let step = 0; step < 500; step++) {
        const state = readRuntimeTelemetry(core);
        if (state.runtimeKind === 0 && state.currentRoom === 0 && !epilogueSeen) {
          run(0, 90); capture("campaign-epilogue-port"); epilogueSeen = true;
        }
        if (epilogueSeen && state.runtimeKind === 3 && state.currentRoom === menuSceneIndex("title")) { titleSeen = true; break; }
        press(2, 25);
      }
      assert.ok(epilogueSeen && titleSeen, "the authored ending reaches its epilogue and title through controls");
      const title = expectRoom("title-after-campaign-ending", 3, menuSceneIndex("title"));
      assert.equal(title.variables[14], 1);
      // The epilogue explicitly saves the completed Port before returning to
      // Title. Preserve that latest battery while checking the earlier race.
      const finishSave = expectCheckpoint("campaign-finished-checkpoint", 0, 0);
      loadCheckpoint(raceFinishSave, "loaded-race-finish-results", 3, menuSceneIndex("corrida_resultados"), 7);
      assert.equal(readRuntimeTelemetry(core).variables[14], 1);
      const d = matchingNativeDiagnostics();
      const restoredRace = readNativePausedRace(d.symbols, d.layouts, nativeRead8, nativeRead32);
      assert.equal(restoredRace.laps, 3); assert.equal(restoredRace.gates, 12); assert.equal(restoredRace.result, 1);
      selectNativeMenuItem("corrida_resultados", 2); run(0, 120);
      expectRoom("replayed-finish-returns-to-map", 10, 0);
      const restored = loadCheckpoint(finishSave, "loaded-campaign-finish", 0, 0);
      assert.equal(restored.variables[14], 1, "fresh-ROM Load preserves campaign completion");
      assert.equal(nativeVariable(60), 3, "Load keeps the epilogue completed without replaying it");
      assert.equal(nativeTextSlot(1), record, "the race record survives the ending and latest save/load");
      assert.deepEqual(copyModuleSavedata(core), finishSave, "loading the completed Port preserves its battery");

    } else {
      loadCheckpoint(stormSave, "loaded-storm-again", 11, 0, 4);
      assert.deepEqual(copyModuleSavedata(core), stormSave, "repeated Load preserves the explicit checkpoint");
    }
    evidence.push({label: "checkpoint-policy", note: "Explicit SaveGame updates the universal checkpoint in each family. Fresh-core Load resumes the saved command continuation; gameplay/round autosaves preserve the last explicit checkpoint."});
  }
  passed = true;
  console.log(`PASS: native opening, prologue, mechanic, fresh-ROM save/load, pause menus and map travel${chapterTwo ? ", Penedos upgrade, point-click chapters and checkpoints through Mercado" : ""}${chapterThree ? ", market cargo, sentinel victory, cell save/load, council, storm clear and relay entry" : ""}${finale ? ", Guardian victory, two fighting rounds, background fidelity, three racing laps, ending and fresh-ROM completion Load" : ""}`);
} catch (error) {
  evidence.push({ label: "failure-detail", error: String(error) });
  if (readRuntimeTelemetry(core)) capture("failure");
  throw error;
} finally {
  writeFileSync(path.join(output, "result.json"), JSON.stringify({
    passed, skipPrologue, female, chapterTwo, chapterThree, finale, romSha256: createHash("sha256").update(rom).digest("hex"),
    linkMapSha256: linkMap ? createHash("sha256").update(linkMap).digest("hex") : undefined,
    emulatedFrames, inputs, evidence,
    limitations: [finale ? "Optional branches and arbitrary mid-combat checkpoints are not exercised by this campaign route." : chapterThree ? "Relay victory, fighting match, racing finish and checkpoints in these families are not exercised." : chapterTwo ? "Challenges after entering Mercado and campaign ending are not exercised." : "Remaining challenges and campaign ending are not exercised by this first route.", "Emulator evidence does not validate physical hardware."]
  }, null, 2) + "\n");
  core._gba_destroy();
}
