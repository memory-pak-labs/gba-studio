// Native mGBA-core route through the three approved Usina scenes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import createMGBA from "../static/WebPlayer/player/mgba-core.mjs";
import { readRuntimeTelemetry } from "../static/WebPlayer/player/mgba-direct-player.mjs";
import { encodePngRgba } from "./lib/png-icons.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const romPath = process.argv[2];
const evidenceDirectory = process.argv[3];
assert.ok(romPath && evidenceDirectory, "usage: node scripts/playtest-usina-v3-rom.mjs ROM.gba EVIDENCE_DIR");
mkdirSync(evidenceDirectory, { recursive: true });

const rom = readFileSync(romPath);
const wasm = readFileSync(path.join(appRoot, "static/WebPlayer/player/mgba-core.wasm"));
const core = await createMGBA({
  print: () => {},
  printErr: () => {},
  instantiateWasm(imports, receive) {
    const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm), imports);
    receive(instance);
    return instance.exports;
  }
});

const samples = [];
function run(mask, frames) {
  core._gba_set_keys(mask);
  for (let frame = 0; frame < frames; frame += 1) core._gba_run_frame();
}
function press(mask) {
  run(mask, 6);
  run(0, 12);
  return readRuntimeTelemetry(core);
}
function capture(label) {
  const telemetry = readRuntimeTelemetry(core);
  const pixels = Buffer.from(core.HEAPU8.slice(core._gba_framebuffer(), core._gba_framebuffer() + 240 * 160 * 4));
  for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
  const dialogueBand = createHash("sha256");
  const hudCountBand = createHash("sha256");
  for (let y = 112; y < 144; y += 1) {
    dialogueBand.update(pixels.subarray((y * 240) * 4, (y * 240 + 176) * 4));
  }
  for (let y = 72; y < 80; y += 1) {
    hudCountBand.update(pixels.subarray((y * 240 + 184) * 4, (y * 240 + 232) * 4));
  }
  writeFileSync(path.join(evidenceDirectory, `${label}.png`), encodePngRgba({ width: 240, height: 160, pixels }));
  samples.push({
    label,
    framebufferSha256: createHash("sha256").update(pixels).digest("hex"),
    dialogueBandSha256: dialogueBand.digest("hex"),
    hudCountBandSha256: hudCountBand.digest("hex"),
    room: telemetry.currentRoom,
    player: telemetry.player,
    firstActor: telemetry.firstActor,
    variables: telemetry.variables.slice(0, 5),
    enemyHp: telemetry.collision.currentFlags,
    playerHp: telemetry.collision.currentSlope,
    battleWon: telemetry.roomChangeCount === 1
  });
  return telemetry;
}
function pressUntil(mask, predicate, limit, message) {
  let state = readRuntimeTelemetry(core);
  for (let attempt = 0; attempt < limit && !predicate(state); attempt += 1) state = press(mask);
  assert.ok(predicate(state), `${message}: ${JSON.stringify(state)}`);
  return state;
}

try {
  assert.equal(core._gba_init(), 1);
  const pointer = core._malloc(rom.length);
  try {
    core.HEAPU8.set(rom, pointer);
    assert.equal(core._gba_load_rom(pointer, rom.length), 1);
  } finally {
    core._free(pointer);
  }

  run(0, 180);
  assert.equal(capture("01-exploracao").currentRoom, 0);
  const clearDialogueBand = samples.at(-1).dialogueBandSha256;
  for (let index = 0; index < 6; index += 1) press(1); // finish entry dialogue
  press(8); // Start: authored map
  capture("01a-mapa");
  assert.notEqual(samples.at(-1).dialogueBandSha256, clearDialogueBand, "Mapa deve abrir no painel inferior");
  press(2); // B: close map
  press(4); // Select: inventory
  capture("01b-inventario");
  assert.notEqual(samples.at(-1).dialogueBandSha256, clearDialogueBand, "Inventário deve abrir no painel inferior");
  press(2); // B: return to exploration
  assert.equal(readRuntimeTelemetry(core).currentRoom, 0);
  pressUntil(64, (state) => state.currentRoom === 1, 3, "Portal da exploração não abriu o combate");
  run(0, 30); // allow palette/tile streaming to settle before visual capture
  const combat = capture("02-sentinela");
  assert.equal(combat.player.direction, 0, "O evento 'up' deve apontar para o norte Dungeon");
  assert.equal(combat.firstActor.visible, true);

  pressUntil(1, (state) => state.collision.currentFlags === 3, 10, "Batalha não começou");
  capture("03-batalha");
  pressUntil(1, (state) => state.collision.currentFlags === 2, 4, "Primeiro ataque não reduziu HP");
  pressUntil(1, (state) => state.roomChangeCount === 1, 12, "Batalha não terminou com vitória");
  assert.equal(capture("04-vitoria").firstActor.visible, false, "Sentinela deve desaparecer após a vitória");

  press(1); // dismiss the victory notice before moving into the exit trigger
  pressUntil(64, (state) => state.currentRoom === 2, 4, "Saída da batalha não abriu");
  run(0, 30);
  assert.equal(capture("05-saida").variables[3], 1);
  const countBeforeReward = samples.at(-1).hudCountBandSha256;
  pressUntil(1, (state) => state.variables[2] === 1, 8, "Célula não foi coletada");
  const reward = capture("06-celula-coletada");
  assert.equal(reward.firstActor.visible, false, "Célula deve desaparecer após a coleta");
  assert.notEqual(samples.at(-1).hudCountBandSha256, countBeforeReward, "HUD deve atualizar QTD após a coleta");

  const evidence = {
    ok: true,
    romFile: path.basename(romPath),
    romSha256: createHash("sha256").update(rom).digest("hex"),
    wasmSha256: createHash("sha256").update(wasm).digest("hex"),
    samples
  };
  writeFileSync(path.join(evidenceDirectory, "playtest.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, romSha256: evidence.romSha256, samples: samples.length, evidenceDirectory }));
} finally {
  core._gba_destroy();
}
