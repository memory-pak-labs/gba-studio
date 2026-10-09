import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import createMGBA from "../static/WebPlayer/player/mgba-core.mjs";
import { readRuntimeTelemetry } from "../static/WebPlayer/player/mgba-direct-player.mjs";

// Run against an exported canonical ROM, not a replacement project fixture.
assert.ok(process.argv[2], "Informe o caminho da ROM exportada com Mercado Suspenso inicial.");
const log = console.log;
console.log = () => {};
try {
  const wasm = readFileSync(new URL("../static/WebPlayer/player/mgba-core.wasm", import.meta.url));
  const core = await createMGBA({
    instantiateWasm(imports, receive) {
      const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm), imports);
      receive(instance);
      return instance.exports;
    }
  });
  assert.equal(core._gba_init(), 1);
  const rom = readFileSync(process.argv[2]);
  const pointer = core._malloc(rom.length);
  core.HEAPU8.set(rom, pointer);
  assert.equal(core._gba_load_rom(pointer, rom.length), 1);
  core._free(pointer);
  try {
    for (let frame = 0; frame < 220; frame += 1) core._gba_run_frame();
    // mGBA 0.10.5 GBASerializedState.video.frameCounter; fail closed if its
    // serialized ABI changes. This measures video frames independently of the game.
    const stateSize = core._gba_state_size();
    assert.equal(stateSize, 0x61000, "Recalibre o relógio para o novo formato de savestate mGBA.");
    const videoFrame = () => {
      const state = core._malloc(stateSize);
      try {
        assert.equal(core._gba_save_state(state, stateSize), 1);
        return new DataView(core.HEAPU8.buffer).getUint32(state + 0x1fc, true);
      } finally {
        core._free(state);
      }
    };
    const beforeVideo = videoFrame();
    const before = readRuntimeTelemetry(core);
    assert.equal(before?.runtimeKind, 2, "A ROM deve iniciar no runtime isométrico.");
    core._gba_set_keys(1 << 5); // Left, matching the horizontal movement assertion below.
    for (let frame = 0; frame < 120; frame += 1) core._gba_run_frame();
    const after = readRuntimeTelemetry(core);
    assert.equal(after?.runtimeKind, before.runtimeKind, "A medição não pode trocar de runtime.");
    assert.equal(after.currentRoom, before.currentRoom, "A medição não pode trocar de cena.");
    assert.ok(after.frame >= before.frame, "O contador de gameplay foi reiniciado durante a medição.");
    const emulatedFrames = (videoFrame() - beforeVideo) >>> 0;
    const updates = (after.frame - before.frame) >>> 0;
    assert.equal(emulatedFrames, 120, "A ponte deve executar um quadro de vídeo por chamada.");
    log(JSON.stringify({ bridgeCalls: 120, emulatedFrames, updates, before: before.player, after: after.player }));
    assert.ok(after.player.x < before.player.x, "O jogador deve se mover com a tecla mantida.");
    assert.ok(updates >= 100, `Aventura isométrica não sustentou a cadência: apenas ${updates}/${emulatedFrames} quadros de vídeo.`);
  } finally {
    core._gba_destroy();
  }
} finally {
  console.log = log;
}
