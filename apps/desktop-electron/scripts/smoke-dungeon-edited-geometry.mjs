import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import createMGBA from "../static/WebPlayer/player/mgba-core.mjs";
import { readRuntimeTelemetry } from "../static/WebPlayer/player/mgba-direct-player.mjs";
import { encodePngRgba } from "./lib/png-icons.mjs";
const [romPath, out, headerPath] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const header = fs.readFileSync(headerPath, "utf8"), prefix = "dungeon_generated_0";
const array = name => { const match = header.match(new RegExp(`\\b${name}\\[.*?\\]\\s*=\\s*\\{([\\s\\S]*?)\\};`)); assert.ok(match, name); return match[1].match(/\d+/g).map(Number); };
const tiles = array(`${prefix}_view_tiles`), maps = array(`${prefix}_view_maps`), palettes = array(`${prefix}_view_palettes`);
const views = array(`${prefix}_views`); assert.equal(views.length % 6, 0);
const wasm = new WebAssembly.Module(fs.readFileSync(new URL("../static/WebPlayer/player/mgba-core.wasm", import.meta.url)));
const m = await createMGBA({ print() {}, printErr() {}, instantiateWasm(imports, done) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
const rom = fs.readFileSync(romPath), report = { ok: false, romSha256: createHash("sha256").update(rom).digest("hex"), views: [], blocked: false };
const state = () => readRuntimeTelemetry(m);
function run(n, keys = 0) { m._gba_set_keys(keys); for (let f = 0; f < n; f++) m._gba_run_frame(); }
function tap(keys) { run(2, keys); run(24); }
function pixels() { const p = m._gba_framebuffer(), rgba = m.HEAPU8.slice(p, p + 153600); for (let n = 3; n < rgba.length; n += 4) rgba[n] = 255; return rgba; }
function verify() {
  const { x, y, direction } = state().player; let view;
  for (let i = 0; i < views.length; i += 6) if (views[i] === x && views[i + 1] === y && views[i + 2] === direction) view = views.slice(i, i + 6);
  assert.ok(view, `rebuilt camera ${x},${y},${direction}`);
  const rgba = pixels(); let mismatch = 0;
  for (let yy = 0; yy < 128; yy++) for (let xx = 0; xx < 240; xx++) {
    const at = view[3] + (Math.floor(yy / 8) * 30 + Math.floor(xx / 8)) * 2;
    const id = maps[at], flags = maps[at + 1], tx = flags & 1024 ? 7 - xx % 8 : xx % 8, ty = flags & 2048 ? 7 - yy % 8 : yy % 8;
    const index = tiles[id * 32 + ty * 4 + Math.floor(tx / 2)] >> (tx % 2 * 4) & 15;
    const expected = palettes[view[4] + (flags >> 12) * 16 + index], i = (yy * 240 + xx) * 4;
    const actual = rgba[i] >> 3 | (rgba[i + 1] >> 3) << 5 | (rgba[i + 2] >> 3) << 10;
    if (actual !== expected) mismatch++;
  }
  report.views.push({ x, y, direction, pixels: 30720, mismatch }); assert.equal(mismatch, 0);
  fs.writeFileSync(path.join(out, `camera-${direction}.png`), encodePngRgba({ width: 240, height: 160, pixels: rgba }));
}
try {
  m._gba_init(); const ptr = m._malloc(rom.length); m.HEAPU8.set(rom, ptr); assert.equal(m._gba_load_rom(ptr, rom.length), 1); m._free(ptr);
  run(240); for (let n = 0; n < 12; n++) tap(1); run(24);
  assert.equal(state().runtimeKind, 6); assert.deepEqual([state().player.x, state().player.y], [1, 9]);
  for (let d = 0; d < 4; d++) { assert.equal(state().player.direction, d); verify(); tap(16); }
  tap(64); assert.deepEqual([state().player.x, state().player.y], [1, 9], "new wall blocks the player"); report.blocked = true;
  tap(16); tap(64); assert.deepEqual([state().player.x, state().player.y], [2, 9], "remaining corridor is walkable");
  report.ok = true;
} finally { fs.writeFileSync(path.join(out, "verification.json"), JSON.stringify(report, null, 2)); m._gba_destroy(); }
console.log(JSON.stringify(report));
