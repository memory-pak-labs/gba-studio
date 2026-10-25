import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import createMGBA from "../static/WebPlayer/player/mgba-core.mjs";
import { readRuntimeTelemetry } from "../static/WebPlayer/player/mgba-direct-player.mjs";

// Use the exported canonical mixed ROM; the video clock is independent of gameplay.
assert.ok(process.argv[2], "Informe a ROM exportada com Penedos do Vento inicial.");
const wasm = new WebAssembly.Module(readFileSync(new URL("../static/WebPlayer/player/mgba-core.wasm", import.meta.url)));
const core = await createMGBA({
  print() {}, printErr() {},
  instantiateWasm(imports, receive) {
    const instance = new WebAssembly.Instance(wasm, imports);
    receive(instance);
    return instance.exports;
  }
});
assert.equal(core._gba_init(), 1);
let statePointer = 0;
try {
  const rom = readFileSync(process.argv[2]);
  const pointer = core._malloc(rom.length);
  core.HEAPU8.set(rom, pointer);
  assert.equal(core._gba_load_rom(pointer, rom.length), 1);
  core._free(pointer);
  for (let frame = 0; frame < 240; ++frame) core._gba_run_frame();
  const stateSize = core._gba_state_size();
  assert.equal(stateSize, 0x61000, "Recalibre o relógio para o novo formato de savestate mGBA.");
  statePointer = core._malloc(stateSize);
  const videoFrame = () => {
    assert.equal(core._gba_save_state(statePointer, stateSize), 1);
    return new DataView(core.HEAPU8.buffer).getUint32(statePointer + 0x1fc, true);
  };
  const initial = readRuntimeTelemetry(core);
  assert.equal(initial?.runtimeKind, 1, "A ROM deve iniciar no runtime de plataforma.");
  const windows = [];
  for (const [name, keys, frames] of [
    ["idle", 0, 120], ["right", 16, 60], ["left", 32, 60],
    ["jump-right", 17, 60], ["settle", 0, 120]
  ]) {
    const before = readRuntimeTelemetry(core);
    const beforeVideo = videoFrame();
    let moved = false;
    core._gba_set_keys(keys);
    for (let frame = 0; frame < frames; ++frame) {
      core._gba_run_frame();
      const state = readRuntimeTelemetry(core);
      assert.equal(state?.runtimeKind, initial.runtimeKind, "A janela não pode trocar de runtime.");
      assert.equal(state.currentRoom, initial.currentRoom, "A janela não pode trocar de cena.");
      assert.ok(state.frame >= before.frame, "O contador de gameplay não pode reiniciar.");
      moved ||= state.player.x !== before.player.x || state.player.y !== before.player.y;
    }
    const after = readRuntimeTelemetry(core);
    windows.push({
      name, bridgeCalls: frames, emulatedFrames: (videoFrame() - beforeVideo) >>> 0,
      updates: after.frame - before.frame, minimumUpdates: Math.ceil(frames * 55 / 59.7275),
      moved, before: before.player, after: after.player,
      missedFrames: after.timing.missedFrameCount - before.timing.missedFrameCount,
      peakCpuWorkTicks: after.timing.peakCpuWorkTicks
    });
  }
  console.log(JSON.stringify({ runtimeKind: initial.runtimeKind, currentRoom: initial.currentRoom, windows }));
  for (const window of windows) {
    assert.equal(window.emulatedFrames, window.bridgeCalls, "A ponte deve executar um quadro de vídeo por chamada.");
    assert.ok(window.updates >= window.minimumUpdates,
      `Plataforma ${window.name}: apenas ${window.updates}/${window.emulatedFrames} updates; mínimo ${window.minimumUpdates} (55 Hz).`);
    if (window.name === "right" || window.name === "left")
      assert.ok(window.moved, `O jogador precisa se mover na janela ${window.name}.`);
  }
} finally {
  if (statePointer) core._free(statePointer);
  core._gba_destroy();
}
