import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { inspectMGBAWebCore } from '../verify-mgba-web-core.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const capacity = 32 * 1024 * 1024;

/** Re-read the materialized cartridge and selected library; an old receipt is
 * never sufficient evidence that the current build is the one being tested. */
export function verifyLinkedRom({ romPath, reportPath, enginePack }) {
  const report = readJson(reportPath), rom = readFileSync(romPath);
  const manifest = readJson(path.join(enginePack, 'enginepack.json'));
  assert.equal(report.schema, 1, 'Unsupported ROM receipt');
  assert.equal(report.source, 'linked_rom');
  assert.equal(report.romFile, path.basename(romPath), 'Receipt belongs to another ROM');
  assert.equal(report.target + '.gba', report.romFile);
  assert.equal(report.blocked, false, 'Build receipt is blocked');
  assert.ok(rom.length > 0 && rom.length <= capacity, 'ROM is outside the cartridge budget');
  assert.equal(report.capacity, capacity);
  assert.equal(report.remaining, capacity - rom.length);
  assert.equal(report.romBytes, rom.length, 'ROM size differs from build receipt');
  assert.equal(report.romSha256, sha256(rom), 'ROM hash differs from build receipt');
  assert.ok(typeof manifest.version === 'string' && manifest.version.length > 0, 'Engine version is missing');
  assert.equal(report.engineVersion, manifest.version, 'Receipt uses another engine version');
  assert.equal(report.engineLibrarySha256, sha256(readFileSync(path.join(enginePack, 'lib/libgbastudio_engine.a'))), 'Receipt uses another engine library');
  return { ...report, verified: true };
}

function validateCheckpoints(checkpoints) {
  assert.ok(Array.isArray(checkpoints) && checkpoints.length > 0, 'At least one frame checkpoint is required');
  const labels = new Set(); let previous = 0;
  for (const point of checkpoints) {
    assert.ok(typeof point.label === 'string' && /^[a-z0-9][a-z0-9_-]*$/.test(point.label) && !labels.has(point.label), 'Frame labels must be safe and unique');
    assert.ok(Number.isSafeInteger(point.frame) && point.frame > previous && point.frame <= 60000, 'Frame checkpoints must increase within the run budget');
    labels.add(point.label); previous = point.frame;
  }
}

/** Fresh deterministic boot, no SRAM/state injection, display frames (not
 * native simulation ticks). Keep pixels in RGBA with a defined opaque alpha. */
export async function captureRomFrames({ rom, playerRoot, checkpoints }) {
  validateCheckpoints(checkpoints);
  assert.ok(rom.length > 0 && rom.length <= capacity, 'Invalid cartridge size');
  const inspected = await inspectMGBAWebCore(path.dirname(playerRoot));
  assert.ok(inspected.ok, inspected.failures.join('; '));
  const modulePath = path.join(playerRoot, 'mgba-core.mjs');
  const { default: createMGBA } = await import(pathToFileURL(modulePath).href);
  const wasmBytes = readFileSync(inspected.wasmPath), wasm = new WebAssembly.Module(wasmBytes);
  const core = await createMGBA({ print() {}, printErr() {}, instantiateWasm(imports, done) {
    const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports;
  } });
  const frames = [];
  try {
    assert.equal(core._gba_init(), 1, 'mGBA initialization failed');
    const pointer = core._malloc(rom.length);
    assert.ok(pointer, 'mGBA ROM allocation failed');
    try { core.HEAPU8.set(rom, pointer); assert.equal(core._gba_load_rom(pointer, rom.length), 1, 'mGBA rejected the ROM'); }
    finally { core._free(pointer); }
    core._gba_set_keys(0);
    let frame = 0;
    for (const point of checkpoints) {
      while (frame < point.frame) { core._gba_run_frame(); frame++; }
      const pointer = core._gba_framebuffer();
      assert.ok(pointer > 0 && pointer + 153600 <= core.HEAPU8.length, 'mGBA framebuffer is invalid');
      const pixels = core.HEAPU8.slice(pointer, pointer + 153600);
      for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
      frames.push({ ...point, rgbaSha256: sha256(pixels), pixels });
    }
  } finally { core._gba_destroy(); }
  return { frames, emulator: { sourceRevision: inspected.sourceRevision, wasmSha256: sha256(wasmBytes), bridgeSha256: sha256(readFileSync(modulePath)) } };
}

/** Compare raw pixel hashes, never PNG container/compression bytes. The normal
 * verification path cannot create or update a baseline. */
export function compareFrameHashes(expected, actual) {
  validateCheckpoints(expected);
  for (const point of expected) assert.match(point.rgbaSha256, /^[a-f0-9]{64}$/, 'Invalid frame baseline');
  const checks = expected.map(point => {
    const matches = actual.filter(frame => frame.label === point.label && frame.frame === point.frame);
    const actualSha256 = matches.length === 1 ? matches[0].rgbaSha256 : null;
    return { ...point, actualSha256, passed: actualSha256 === point.rgbaSha256 };
  });
  return { passed: actual.length === expected.length && checks.every(check => check.passed), checks };
}
