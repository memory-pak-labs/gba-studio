// Exercise the authored menu flow in the same mGBA core used by Play.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { readRuntimeTelemetry } from '../static/WebPlayer/player/mgba-direct-player.mjs';
import { encodePngRgba } from './lib/png-icons.mjs';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const romPath = process.argv[2];
assert.ok(romPath, 'usage: node scripts/playtest-menu-settings-rom.mjs <rom.gba> [captures-dir]');
const capturesDir = process.argv[3];
if (capturesDir) mkdirSync(capturesDir, { recursive: true });

const wasm = readFileSync(path.join(app, 'static/WebPlayer/player/mgba-core.wasm'));
const rom = readFileSync(romPath);
const core = await createMGBA({
  print: () => {},
  printErr: () => {},
  instantiateWasm(imports, receive) {
    const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm), imports);
    receive(instance);
    return instance.exports;
  }
});

function run(keys, frames) {
  core._gba_set_keys(keys);
  for (let frame = 0; frame < frames; frame += 1) core._gba_run_frame();
}

function sample(label) {
  const pixels = core.HEAPU8.slice(core._gba_framebuffer(), core._gba_framebuffer() + 240 * 160 * 4);
  for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
  if (capturesDir) {
    writeFileSync(path.join(capturesDir, `${label}.png`), encodePngRgba({ width: 240, height: 160, pixels }));
  }
  const brightPixels = (x1, y1, x2, y2) => {
    let count = 0;
    for (let y = y1; y < y2; y += 1) {
      for (let x = x1; x < x2; x += 1) {
        const offset = (y * 240 + x) * 4;
        if (pixels[offset] >= 180 && pixels[offset + 1] >= 180 && pixels[offset + 2] >= 180) count += 1;
      }
    }
    return count;
  };
  return {
    titlePixels: brightPixels(18, 10, 220, 30),
    optionPixels: brightPixels(20, 32, 220, 115),
    language: readRuntimeTelemetry(core)?.variables?.[15]
  };
}

try {
  assert.equal(core._gba_init(), 1);
  const pointer = core._malloc(rom.length);
  core.HEAPU8.set(rom, pointer);
  assert.equal(core._gba_load_rom(pointer, rom.length), 1);
  core._free(pointer);

  run(0, 600);
  run(8, 8); // Start: title -> initial menu.
  run(0, 30);
  assert.ok(sample('initial').titlePixels < 50, 'the initial menu must not show the settings HUD');

  run(128, 8); run(0, 8); // Down: Carregar jogo.
  run(128, 8); run(0, 8); // Down: Idioma.
  run(1, 8); run(0, 120); // A: open settings with Idioma focused.
  const language = sample('language');
  assert.ok(language.titlePixels > 100 && language.optionPixels > 500, 'the settings HUD must be visible without a background image');
  assert.equal(language.language, 0);
  run(16, 8); run(0, 30); // Right: change language.
  assert.equal(sample('language-right').language, 1, 'Idioma must receive focus from the shortcut');

  run(2, 8); run(0, 40); // B: return to initial menu.
  assert.ok(sample('back').titlePixels < 50, 'B must return to the initial menu');
  run(128, 8); run(0, 8);
  run(128, 8); run(0, 8);
  run(128, 8); run(0, 8); // Down x3: Configurações.
  run(1, 8); run(0, 120); // A: first settings page.
  const settings = sample('settings');
  assert.ok(settings.titlePixels > 100 && settings.optionPixels > 1000, 'Configurações must open the first settings page');
  assert.equal(settings.language, 1, 'opening settings must preserve the language value');
  console.log('PASS: initial menu, Idioma shortcut, settings HUD, language adjustment, B return, Configurações');
} finally {
  core._gba_destroy();
}
