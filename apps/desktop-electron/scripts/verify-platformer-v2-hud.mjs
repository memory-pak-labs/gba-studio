// Compare actual ROM captures to the independent HUD assets and live values.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { decodePngRgba } from './lib/png-icons.mjs';
import { parseExportedRgb555Palette, decodeRgb555 } from './rgb555-framebuffer-contract.mjs';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(app, 'default-assets/templates/exemplo-gba');
const project = JSON.parse(fs.readFileSync(path.join(root, 'exemplo-gba.gba-project')));
const hud = project.settings.hudPresets.find(hud => hud.id === 'hud-penedos-approved');
const assets = new Map(project.assets.map(asset => [asset.name, asset]));
const source = name => decodePngRgba(fs.readFileSync(path.join(root, assets.get(name).metadata.source)));
const rgb555 = (pixels, at) => (pixels[at] >> 3) | ((pixels[at + 1] >> 3) << 5) | ((pixels[at + 2] >> 3) << 10);
const output = path.resolve(process.argv[2]);
const exported = path.resolve(process.argv[3]);
const header = fs.readFileSync(path.join(exported, 'dialogue_ui_assets.hpp'), 'utf8');
const textColor = decodeRgb555(parseExportedRgb555Palette(header, 'hud_preset_hud_penedos_approved_skin')[2]);
const report = JSON.parse(fs.readFileSync(path.join(output, 'report.json')));
assert.equal(report.ok, true, 'a successful gameplay smoke is required');
const fullSymbol = 'penedos_v2_hearts_full', emptySymbol = 'penedos_v2_hearts_empty';
assert.deepEqual(
  parseExportedRgb555Palette(fs.readFileSync(path.join(exported, fullSymbol + '.hpp'), 'utf8'), fullSymbol),
  parseExportedRgb555Palette(fs.readFileSync(path.join(exported, emptySymbol + '.hpp'), 'utf8'), emptySymbol),
  'the live gauge mixes full/empty tile indices and requires the same palette'
);
const proofs = [];
for (const name of ['initial', 'beacon', 'attack-east', 'checkpoint-damage-return', 'unactivated-fall']) {
  const sample = report.samples.find(sample => sample.name === name);
  assert.ok(sample, name);
  const health = sample.state.variables[27], tokens = sample.state.variables[28];
  const expected = new Uint8Array(240 * 160 * 4);
  function place(image, dx, dy, clip = image.width, sx = 0, sy = 0, width = image.width, height = image.height) {
    for (let y = 0; y < height; y++) for (let x = 0; x < Math.min(clip, width); x++) {
      const at = ((sy + y) * image.width + sx + x) * 4;
      if (!image.pixels[at + 3]) continue;
      const target = ((dy + y) * 240 + dx + x) * 4;
      expected.set(image.pixels.subarray(at, at + 4), target);
    }
  }
  for (const component of [...hud.components].sort((a, b) => a.zIndex - b.zIndex)) {
    if (component.id === 'hearts') {
      const image = source(component.gauge.emptyAsset), full = source(component.asset);
      const fill = component.gauge.width * health / component.valueMaximum;
      for (let y = 0; y < image.height; y++) for (let x = 0; x < fill; x++) {
        const at = (y * image.width + x) * 4;
        image.pixels.set(full.pixels.subarray(at, at + 4), at);
      }
      place(image, component.x, component.y);
    } else if (component.id === 'coins') {
      const font = source(hud.font);
      // Opaque font atlases use their top-left color as transparent glyph ink
      // background. The HUD frame remains visible through those pixels.
      const background = [...font.pixels.subarray(0, 3)];
      for (let at = 0; at < font.pixels.length; at += 4) {
        if (background.every((value, channel) => font.pixels[at + channel] === value)) font.pixels[at + 3] = 0;
        else font.pixels.set(textColor.slice(0, 3), at);
      }
      const text = String(tokens).padStart(component.text.length, '0');
      for (const [index, character] of [...text].entries()) {
        const glyph = character.charCodeAt(0) - 32;
        place(font, component.x + index * component.textAdvance, component.y, 8, glyph % 16 * 8, Math.floor(glyph / 16) * 8, 8, 8);
      }
    } else if (component.asset) place(source(component.asset), component.x, component.y);
  }
  const screen = decodePngRgba(fs.readFileSync(path.join(output, name + '.png')));
  let pixels = 0;
  for (let at = 0; at < expected.length; at += 4) if (expected[at + 3]) {
    assert.equal(rgb555(screen.pixels, at), rgb555(expected, at), `${name}: HUD pixel at ${at / 4 % 240},${Math.floor(at / 4 / 240)}`);
    pixels++;
  }
  assert.ok(pixels > 1000, 'both HUD frames and their content must be checked');
  proofs.push({ name, health, tokens, pixels });
}
fs.writeFileSync(path.join(output, 'hud-pixel-proof.json'), JSON.stringify({ ok: true, romSha256: report.romSha256, method: 'actual framebuffer compared to PNGs and glyphs in RGB555; health/tokens from read-only runtime telemetry', proofs }, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, proofs }, null, 2));
