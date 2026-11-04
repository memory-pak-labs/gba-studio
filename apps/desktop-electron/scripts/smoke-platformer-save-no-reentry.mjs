// Build the actual Platformer runtime with a save-on-entry fixture, then restart
// mGBA with the battery bytes. on_enter must not repeat after loading.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { copyModuleSavedata, readRuntimeTelemetry, restoreModuleSavedata } from '../static/WebPlayer/player/mgba-direct-player.mjs';

const engine = resolve(process.cwd(), '../../packages/GBAStudioEngine');
const pack = resolve(process.argv[2] ?? join(engine, 'dist/GBAStudioEnginePack'));
const loadDuringScript = process.argv[3] === 'load';
const missingSlot = process.argv[3] === 'missing';
const devkitarm = process.env.DEVKITARM ?? '/opt/devkitpro/devkitARM';
const gbafix = join(process.env.DEVKITPRO ?? '/opt/devkitpro', 'tools/bin/gbafix');
const out = mkdtempSync(join(tmpdir(), 'gbs-platformer-save-onenter-'));
const path = (...parts) => join(out, ...parts);
function run(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${binary} falhou: ${result.stderr}`);
}
const fixturePath = join(engine, 'examples/platformer_basic/src/platformer_project_data.hpp');
let fixture = readFileSync(fixturePath, 'utf8');
const saveBank = '    1024,\n    1,';
assert.ok(fixture.includes(saveBank));
fixture = fixture.replace(saveBank, '    4096,\n    1,');
const enter = /constexpr gbs::EventCommand room_on_enter_commands\[\] = \{[\s\S]*?\n\};/;
assert.match(fixture, enter);
fixture = fixture.replace(enter, `constexpr gbs::EventCommand room_on_enter_commands[] = {
    {gbs::EventOp::AddVariable, 0, 1, 0},
    ${missingSlot ? `{gbs::EventOp::LoadGame, 2, 0, 0},
    {gbs::EventOp::AddVariable, 0, 10, 0},` : `{gbs::EventOp::SaveGame, 0, 0, 0},`}
    ${loadDuringScript ? `{gbs::EventOp::AddVariable, 0, 1, 0},
    {gbs::EventOp::LoadGame, 0, 0, 0},
    {gbs::EventOp::AddVariable, 0, 10, 0},` : ''}
    {gbs::EventOp::End, 0, 0, 0}
};`);
const entry = 'gbs::EventScript { room_on_enter_commands, 2 }';
assert.ok(fixture.includes(entry));
fixture = fixture.replace(entry, `gbs::EventScript { room_on_enter_commands, ${loadDuringScript ? 6 : missingSlot ? 4 : 3} }`);
const roomStart = 'constexpr gbs::PlatformerRoomData rooms[] = {\n    gbs::PlatformerRoomData {';
assert.ok(fixture.includes(roomStart));
fixture = fixture.replace(roomStart, `constexpr gbs::EventCommand restore_events[] = {
    {gbs::EventOp::AddVariable, 1, 5, 0}, {gbs::EventOp::End, 0, 0, 0}
};
constexpr gbs::PlatformerRoomData add_restore(gbs::PlatformerRoomData room) {
    room.on_restore = {restore_events, 2};
    return room;
}
constexpr gbs::PlatformerRoomData rooms[] = {
    add_restore(gbs::PlatformerRoomData {`);
const firstRoomEnd = '        sizeof(moving_platforms) / sizeof(moving_platforms[0])\n    },';
assert.ok(fixture.includes(firstRoomEnd));
fixture = fixture.replace(firstRoomEnd, '        sizeof(moving_platforms) / sizeof(moving_platforms[0])\n    }),');
writeFileSync(path('fixture.hpp'), fixture);
const gcc = join(devkitarm, 'bin/arm-none-eabi-g++');
const arch = ['-mthumb', '-mthumb-interwork', '-mcpu=arm7tdmi', '-mtune=arm7tdmi'];
run(gcc, [...arch, '-Os', '-ffreestanding', '-fdata-sections', '-ffunction-sections', '-std=c++17', '-fno-exceptions', '-fno-rtti', '-fno-threadsafe-statics',
  `-I${join(engine, 'engine/include')}`, `-I${join(engine, 'engine/src')}`, `-I${join(engine, 'examples/platformer_basic/src')}`,
  `-I${out}`, '-DGBS_PLATFORMER_PROJECT_DATA_HEADER="fixture.hpp"', '-c', join(engine, 'examples/platformer_basic/src/main.cpp'), '-o', path('main.o')]);
run(gcc, [...arch, '-nostartfiles', '-Wl,--gc-sections', '-T', join(pack, 'templates/gba.ld'), path('main.o'), join(pack, 'lib/libgbastudio_engine.a'), '-lgcc', '-o', path('test.elf')]);
run(join(devkitarm, 'bin/arm-none-eabi-objcopy'), ['-O', 'binary', path('test.elf'), path('test.gba')]);
run(gbafix, [path('test.gba'), '-tGBS_TEST', '-cGBS0', '-m00', '-r00']);
const rom = readFileSync(path('test.gba'));
const wasm = new WebAssembly.Module(readFileSync('static/WebPlayer/player/mgba-core.wasm'));
const core = await createMGBA({ print() {}, printErr() {}, instantiateWasm(imports, receive) { receive(new WebAssembly.Instance(wasm, imports)); return {}; } });
let live = false;
function boot(save) {
  if (live) core._gba_destroy();
  assert.equal(core._gba_init(), 1); live = true;
  const ptr = core._malloc(rom.length); core.HEAPU8.set(rom, ptr);
  assert.equal(core._gba_load_rom(ptr, rom.length), 1); core._free(ptr);
  if (save) assert.ok(restoreModuleSavedata(core, save));
}
boot();
if (loadDuringScript || missingSlot) {
  let state;
  for (let frame = 0; frame < 300; frame++) {
    core._gba_run_frame();
    const current = readRuntimeTelemetry(core);
    if (current?.currentRoom === 0) state = current;
  }
  assert.equal(state?.variables?.[0], missingSlot ? 11 : 1, 'carga inválida preserva o roteiro; carga válida o substitui');
  assert.equal(state?.variables?.[1], missingSlot ? 0 : 5, 'on_restore só executa após carga válida');
  core._gba_destroy();
  console.log(`PASS: ${missingSlot ? 'slot vazio preserva roteiro' : 'carga durante roteiro'}; artefatos: ${out}`);
  process.exit(0);
}
let saved;
for (let frame = 0; frame < 300; frame++) {
  core._gba_run_frame();
  const data = copyModuleSavedata(core), state = readRuntimeTelemetry(core);
  if (data.length && data.some(byte => byte !== 255) && state?.variables?.[0] === 1) { saved = data; break; }
}
assert.ok(saved, 'a entrada deve gravar o save');
boot(saved); let restored;
for (let frame = 0; frame < 300; frame++) {
  core._gba_run_frame(); const state = readRuntimeTelemetry(core);
  if (state?.currentRoom === 0) restored = state;
}
assert.equal(restored?.variables?.[0], 1, 'on_enter não pode ser repetido ao carregar');
assert.equal(restored?.variables?.[1], 5, 'on_restore deve executar uma vez ao carregar');
core._gba_destroy();
console.log(`PASS: on_enter executou uma vez e o save foi reaberto; artefatos: ${out}`);
