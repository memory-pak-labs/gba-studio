import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { regressionCases } from './verify-rom-regressions.mjs';
import { captureRomFrames, sha256 } from './lib/rom-regression.mjs';
import { createSmokeGbaRom } from './lib/smoke-gba-rom.mjs';
import { replayRomRegressions } from './replay-rom-regressions.mjs';

const roots = [], revision = '1'.repeat(40), appRoot = path.resolve('.');
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'gbs-ci-replay-')); roots.push(root);
  const enginePack = path.join(root, 'pack'), inputRoot = path.join(root, 'input'), sourceRoot = path.join(inputRoot, 'run-fixture');
  mkdirSync(path.join(enginePack, 'lib'), { recursive: true }); mkdirSync(path.join(enginePack, 'tools'));
  writeFileSync(path.join(enginePack, 'lib/libgbastudio_engine.a'), 'engine');
  writeFileSync(path.join(enginePack, 'enginepack.json'), JSON.stringify({ version: 'test' }));
  for (const name of ['assetc', 'gbsbuild']) writeFileSync(path.join(enginePack, 'tools', name), name);
  const rom = createSmokeGbaRom(), romSha256 = sha256(rom);
  const captured = await captureRomFrames({ rom, playerRoot: path.resolve('static/WebPlayer/player'), checkpoints: [{ label: 'boot', frame: 180 }, { label: 'idle', frame: 240 }] });
  const frames = captured.frames.map(({ pixels, ...frame }) => frame);
  const baseline = { schema: 1, emulator: { sourceRevision: captured.emulator.sourceRevision, wasmSha256: captured.emulator.wasmSha256 },
    roms: Object.fromEntries(regressionCases.flatMap(c => c.roms.map(r => [c.id + '/' + r.id, frames]))) };
  const source = { schema: 1, kind: 'rom_regressions', passed: true, complete: true, scope: 'full_catalogue',
    sourceRevision: revision, trackedSourceDirty: false, emulator: captured.emulator, baselineSha256: sha256(JSON.stringify(baseline)),
    engine: { version: 'test', librarySha256: sha256('engine'), assetcSha256: sha256('assetc'), gbsbuildSha256: sha256('gbsbuild') }, cases: [] };
  for (const c of regressionCases) {
    const item = { id: c.id, passed: true, exitCode: 0, roms: [] }; source.cases.push(item);
    for (const spec of c.roms) {
      const build = path.join(sourceRoot, c.id, spec.project, 'build'); mkdirSync(build, { recursive: true });
      const receipt = { schema: 1, source: 'linked_rom', target: spec.target, romFile: spec.target + '.gba', romBytes: rom.length,
        romSha256, capacity: 33554432, remaining: 33554432 - rom.length, blocked: false, engineVersion: 'test', engineLibrarySha256: sha256('engine') };
      writeFileSync(path.join(build, spec.target + '.gba'), rom); writeFileSync(path.join(build, 'rom_build_report.json'), JSON.stringify(receipt));
      const functional = path.join(sourceRoot, c.id, spec.verification); mkdirSync(path.dirname(functional), { recursive: true });
      writeFileSync(functional, JSON.stringify({ ok: true, romSha256 }));
      item.roms.push({ id: c.id + '/' + spec.id, passed: true, comparison: { passed: true }, receipt: { ...receipt, verified: true },
        rom: [c.id, spec.project, 'build', spec.target + '.gba'].join('/'), functionalVerification: [c.id, spec.verification].join('/') });
    }
  }
  const save = () => writeFileSync(path.join(sourceRoot, 'report.json'), JSON.stringify(source)); save();
  return { root, sourceRoot, enginePack, inputRoot, outputRoot: path.join(root, 'output'), expectedRevision: revision, appRoot, baseline, source, save };
}

describe('cross-host ROM artifact replay', () => {
  it('replays the same 14 cartridges without invoking the compiler or fixture scripts', async () => {
    const f = await fixture(), result = await replayRomRegressions(f);
    expect(result.report.passed).toBe(true); expect(result.report.complete).toBe(true);
    expect(result.report.roms).toHaveLength(14);
    expect(result.report.functionalReplay).toBe(false);
    expect(result.report.roms.every(r => r.receipt.romSha256 === f.source.cases[0].roms[0].receipt.romSha256 && r.captures.length === 2)).toBe(true);
  });
  it.each(['revision', 'failed', 'dirty', 'partial', 'missing', 'duplicate', 'core', 'baseline', 'path'])('rejects an invalid producer %s', async field => {
    const f = await fixture();
    if (field === 'revision') f.source.sourceRevision = '2'.repeat(40);
    if (field === 'failed') f.source.cases[0].passed = false;
    if (field === 'dirty') f.source.trackedSourceDirty = true;
    if (field === 'partial') f.source.complete = false;
    if (field === 'missing') f.source.cases.pop();
    if (field === 'duplicate') f.source.cases[1] = f.source.cases[0];
    if (field === 'core') f.source.emulator.wasmSha256 = 'f'.repeat(64);
    if (field === 'baseline') f.source.baselineSha256 = 'f'.repeat(64);
    if (field === 'path') f.source.cases[0].roms[0].rom = '../outside.gba';
    f.save(); const { report } = await replayRomRegressions(f);
    expect(report.passed).toBe(false); expect(report.complete).toBe(false); expect(report.error).toBeTruthy();
  });
  it('detects a materialized cartridge change while preserving other results and failure evidence', async () => {
    const f = await fixture(), file = path.join(f.sourceRoot, f.source.cases[0].roms[0].rom), rom = readFileSync(file); rom[256] ^= 1; writeFileSync(file, rom);
    const a = await replayRomRegressions(f), b = await replayRomRegressions(f);
    expect(a.report.passed).toBe(false); expect(a.report.roms[0].error).toContain('ROM hash differs');
    expect(a.report.roms.filter(r => r.passed)).toHaveLength(13);
    expect(a.reportPath).not.toBe(b.reportPath); expect(JSON.parse(readFileSync(a.reportPath, 'utf8')).passed).toBe(false);
  });
  it('rejects ambiguous artifact roots instead of selecting an old PASS report', async () => {
    const f = await fixture(); mkdirSync(path.join(f.inputRoot, 'run-other'));
    writeFileSync(path.join(f.inputRoot, 'run-other/report.json'), JSON.stringify(f.source));
    const { report } = await replayRomRegressions(f); expect(report.passed).toBe(false); expect(report.error).toContain('exactly one');
  });
});
