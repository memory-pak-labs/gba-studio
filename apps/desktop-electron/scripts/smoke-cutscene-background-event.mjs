import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import createMGBA from "../static/WebPlayer/player/mgba-core.mjs";
import { readRuntimeTelemetry } from "../static/WebPlayer/player/mgba-direct-player.mjs";
import { encodePngRgba } from "./lib/png-icons.mjs";

// Run the synthetic ROM produced by backgroundEvent.test.ts, not a visual candidate.
assert.ok(process.argv[2], "Informe a ROM de teste da troca de fundo.");
const log = console.log;
console.log = () => {};
try {
  const wasm = readFileSync(new URL("../static/WebPlayer/player/mgba-core.wasm", import.meta.url));
  const core = await createMGBA({ instantiateWasm(imports, receive) {
    const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm), imports);
    receive(instance); return instance.exports;
  } });
  assert.equal(core._gba_init(), 1);
  const rom = readFileSync(process.argv[2]);
  const pointer = core._malloc(rom.length);
  core.HEAPU8.set(rom, pointer);
  assert.equal(core._gba_load_rom(pointer, rom.length), 1);
  core._free(pointer);
  try {
    const run = count => { for (let frame = 0; frame < count; frame += 1) core._gba_run_frame(); };
    const sample = label => {
      const pixels = new Uint8Array(core.HEAPU8.subarray(core._gba_framebuffer(), core._gba_framebuffer() + 240 * 160 * 4));
      let actorPixels = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset] < 10 && pixels[offset + 1] > 230 && pixels[offset + 2] < 10) actorPixels += 1;
      }
      assert.equal(actorPixels, 16 * 16 - 1, `O sprite deve permanecer íntegro após a troca (${label}).`);
      if (process.argv[3]) writeFileSync(`${process.argv[3]}-${label}.png`, encodePngRgba({ width: 240, height: 160, pixels }));
      return Array.from(pixels.subarray((80 * 240 + 120) * 4, (80 * 240 + 120) * 4 + 3));
    };
    run(220);
    const initial = readRuntimeTelemetry(core);
    const night = sample("night");
    assert.ok(night[2] > 230 && night[0] < 10 && night[1] < 10, `Ao iniciar deve mostrar azul: ${night}`);
    core._gba_set_keys(1); run(1); core._gba_set_keys(0); run(12);
    const after = readRuntimeTelemetry(core);
    const day = sample("day");
    assert.ok(day[0] > 230 && day[1] < 10 && day[2] < 10, `O evento do próximo quadro deve mostrar vermelho: ${day}`);
    assert.equal(after?.currentRoom, initial?.currentRoom, "A troca de fundo não deve trocar a cena.");
    log(JSON.stringify({ ok: true, night, day, currentRoom: after?.currentRoom }));
  } finally { core._gba_destroy(); }
} finally { console.log = log; }
