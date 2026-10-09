// Capture all four opening beats and the authored transition from a real ROM.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import createMGBA from "../static/WebPlayer/player/mgba-core.mjs";
import { readRuntimeTelemetry } from "../static/WebPlayer/player/mgba-direct-player.mjs";
import { decodePngRgba, encodePngRgba } from "./lib/png-icons.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [romPath, evidenceDirectory] = process.argv.slice(2);
const skipRequested = process.argv.includes("--skip");
assert.ok(romPath && evidenceDirectory, "usage: node scripts/playtest-opening-v2-rom.mjs ROM.gba EVIDENCE_DIR");
mkdirSync(evidenceDirectory, { recursive: true });

const rom = readFileSync(romPath);
const wasm = readFileSync(path.join(appRoot, "static/WebPlayer/player/mgba-core.wasm"));
const spriteRoot = path.join(appRoot, "default-assets/templates/exemplo-gba/Assets/sprites");
const spritesByShot = {
  "01-vigia-na-praia": [["opening-v2-guardia-idle-48x64.png", 142, 81]],
  "02-vigia-de-costas": [["opening-v2-guardia-turn-48x64.png", 100, 63]],
  "03-sinal-ao-farol": [["opening-v2-guardia-signal-48x64.png", 167, 81]],
  "04-menino-na-praia": [["opening-v2-menino-24x32.png", 56, 110], ["opening-v2-gaivota-24x16.png", 90, 118]],
  "01-abertura-antes-de-pular": [["opening-v2-guardia-idle-48x64.png", 142, 81]]
};
const core = await createMGBA({
  print: () => {},
  printErr: () => {},
  instantiateWasm(imports, receive) {
    const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm), imports);
    receive(instance);
    return instance.exports;
  }
});

function advance(frames) {
  core._gba_set_keys(0);
  for (let frame = 0; frame < frames; frame += 1) core._gba_run_frame();
}

function auditVisibleSprites(label, framebuffer) {
  return (spritesByShot[label] ?? []).map(([file, originX, originY]) => {
    const source = decodePngRgba(readFileSync(path.join(spriteRoot, file)));
    let pixelCount = 0;
    let mismatchCount = 0;
    let maxChannelError = 0;
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const sourceOffset = (y * source.width + x) * 4;
        if (source.pixels[sourceOffset + 3] < 128) continue;
        const screenX = originX + x;
        const screenY = originY + y;
        if (screenX >= 240 || screenY >= 160) continue;
        const screenOffset = (screenY * 240 + screenX) * 4;
        const error = Math.max(...[0, 1, 2].map((channel) =>
          Math.abs(source.pixels[sourceOffset + channel] - framebuffer[screenOffset + channel])));
        pixelCount += 1;
        maxChannelError = Math.max(maxChannelError, error);
        if (error > 7) mismatchCount += 1; // RGB555 round-trip tolerance
      }
    }
    assert.ok(pixelCount > 0, `${file}: nenhum pixel opaco`);
    assert.equal(mismatchCount, 0, `${file}: pixels OBJ divergem da ROM`);
    return { file, pixelCount, mismatchCount, maxChannelError };
  });
}

const samples = [];
function capture(label) {
  const telemetry = readRuntimeTelemetry(core);
  const pixels = Buffer.from(core.HEAPU8.slice(core._gba_framebuffer(), core._gba_framebuffer() + 240 * 160 * 4));
  for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
  writeFileSync(path.join(evidenceDirectory, `${label}.png`), encodePngRgba({ width: 240, height: 160, pixels }));
  samples.push({
    label,
    frame: telemetry.frame,
    currentRoom: telemetry.currentRoom,
    runtimeKind: telemetry.runtimeKind,
    firstActor: telemetry.firstActor,
    lastSfx: telemetry.lastSfx,
    sound1cntH: core._gba_audio_register(0x04000062) >>> 0,
    sound1cntX: core._gba_audio_register(0x04000064) >>> 0,
    spriteFidelity: auditVisibleSprites(label, pixels),
    framebufferSha256: createHash("sha256").update(pixels).digest("hex")
  });
  return telemetry;
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

  if (skipRequested) {
    advance(60);
    assert.equal(capture("01-abertura-antes-de-pular").runtimeKind, 8);
    core._gba_set_keys(2); // B
    core._gba_run_frame();
    advance(30);
    assert.equal(capture("02-titulo-apos-pular").runtimeKind, 3, "B deve pular para o Menu Título");
  } else {
    for (const [frames, label] of [
      [60, "01-vigia-na-praia"],
      [120, "02-vigia-de-costas"],
      [90, "03-sinal-ao-farol"],
      [180, "04-menino-na-praia"],
      [150, "05-titulo"]
    ]) {
      advance(frames);
      capture(label);
    }
    console.log(JSON.stringify(samples.map(({ label, frame, currentRoom, runtimeKind, firstActor }) => ({ label, frame, currentRoom, runtimeKind, firstActor }))));
    assert.ok(samples.slice(0, 4).every((sample) => sample.runtimeKind === 8), "os quatro quadros devem permanecer na cutscene");
    assert.equal(samples[0].firstActor.x, 142);
    assert.equal(samples[0].firstActor.y, 81);
    assert.equal(samples[0].sound1cntH, 0, "o sinal nao deve tocar no primeiro quadro");
    assert.equal(samples[1].sound1cntH, 0, "o sinal nao deve tocar no segundo quadro");
    assert.notEqual(samples[2].sound1cntH, 0, "o sinal deve acionar o canal de audio no terceiro quadro");
    assert.equal(samples[4].runtimeKind, 3, "a abertura deve terminar no Menu Título");
    assert.equal(new Set(samples.map((sample) => sample.framebufferSha256)).size, 5, "cada quadro e o título devem renderizar imagens distintas");
  }

  const evidence = {
    ok: true,
    path: skipRequested ? "skip" : "automatic",
    romSha256: createHash("sha256").update(rom).digest("hex"),
    wasmSha256: createHash("sha256").update(wasm).digest("hex"),
    samples
  };
  writeFileSync(path.join(evidenceDirectory, "playtest.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, evidenceDirectory, samples: samples.length }));
} finally {
  core._gba_destroy();
}
