import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { regressionCases, runRomRegressions, selectCases, validateBaseline } from './verify-rom-regressions.mjs';
import { captureRomFrames, sha256 } from './lib/rom-regression.mjs';
import { createSmokeGbaRom } from './lib/smoke-gba-rom.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const appRoot = path.resolve('.');
const baseline = () => ({ schema: 1, emulator: { sourceRevision: '0.10.5', wasmSha256: 'a'.repeat(64) },
  roms: Object.fromEntries(regressionCases.flatMap(c => c.roms.map(r => [c.id + '/' + r.id,
    [{ label: 'boot', frame: c.id === 'visibility-graphics' && r.id === 'resident' ? 181 : 180, rgbaSha256: 'b'.repeat(64) }, { label: 'idle', frame: c.id === 'visibility-graphics' && r.id === 'resident' ? 241 : 240, rgbaSha256: 'c'.repeat(64) }]]))) });

function environment(script) {
  const root = mkdtempSync(path.join(tmpdir(), 'gbs-rom-runner-')); roots.push(root);
  const appRoot = path.join(root, 'app'), enginePack = path.join(root, 'pack');
  mkdirSync(path.join(appRoot, 'scripts'), { recursive: true }); mkdirSync(path.join(appRoot, 'static'));
  symlinkSync(path.resolve('static/WebPlayer'), path.join(appRoot, 'static/WebPlayer'), 'junction');
  mkdirSync(path.join(enginePack, 'lib'), { recursive: true }); mkdirSync(path.join(enginePack, 'tools'));
  writeFileSync(path.join(enginePack, 'lib/libgbastudio_engine.a'), 'engine');
  writeFileSync(path.join(enginePack, 'enginepack.json'), JSON.stringify({ version: 'test' }));
  for (const name of ['assetc', 'gbsbuild']) writeFileSync(path.join(enginePack, 'tools', name), 'tool');
  for (const name of ['smoke-hardware-diagnostic.mjs', 'smoke-map-states.mjs']) writeFileSync(path.join(appRoot, 'scripts', name), script);
  mkdirSync(path.join(appRoot, 'scripts/lib'));
  for (const name of ['verify-rom-regressions.mjs', 'lib/rom-regression.mjs']) writeFileSync(path.join(appRoot, 'scripts', name), readFileSync(path.join('scripts', name)));
  const reference = baseline();
  reference.emulator = JSON.parse(readFileSync('static/WebPlayer/player/mgba-core.manifest.json', 'utf8')).source;
  reference.emulator = { sourceRevision: reference.emulator.revision, wasmSha256: sha256(readFileSync('static/WebPlayer/player/mgba-core.wasm')) };
  return { appRoot, enginePack, outputRoot: path.join(root, 'runs'), baseline: reference };
}

describe('ROM regression suite', () => {
  it('rejects unknown/empty selections and duplicate IDs', () => {
    expect(selectCases()).toHaveLength(5);
    for (const ids of [[], ['missing'], ['map-states', 'map-states']]) expect(() => selectCases(ids)).toThrow();
    expect(selectCases(['hardware-diagnostic']).map(c => c.id)).toEqual(['hardware-diagnostic']);
  });
  it('requires a complete, valid, pinned baseline instead of blessing current output', () => {
    expect(validateBaseline(baseline())).toEqual(baseline());
    const missing = baseline(); delete missing.roms['map-states/resident'];
    expect(() => validateBaseline(missing)).toThrow();
    const bad = baseline(); bad.roms['map-states/resident'][0].rgbaSha256 = 'unknown';
    expect(() => validateBaseline(bad)).toThrow();
    for (const id of ['map-states/resident', 'visibility-graphics/resident']) {
      const shifted = baseline(); shifted.roms[id][0].frame++;
      expect(() => validateBaseline(shifted)).toThrow(/fixed display frames/);
    }
  });
  it('writes a fresh failing report on preflight errors, preserving earlier evidence', async () => {
    const outputRoot = mkdtempSync(path.join(tmpdir(), 'gbs-rom-suite-')); roots.push(outputRoot);
    const options = { outputRoot, appRoot, enginePack: path.join(outputRoot, 'missing-pack'), baseline: baseline(), caseIDs: ['hardware-diagnostic'] };
    const a = await runRomRegressions(options), b = await runRomRegressions(options);
    expect(a.report.passed).toBe(false); expect(a.report.complete).toBe(false);
    expect(a.report.error).toBeTruthy(); expect(a.report.cases).toEqual([]);
    expect(a.reportPath).not.toBe(b.reportPath);
    expect(JSON.parse(readFileSync(a.reportPath, 'utf8')).passed).toBe(false);
    const missing = await runRomRegressions({ ...options, baseline: undefined, baselinePath: path.join(outputRoot, 'absent.json') });
    expect(missing.report.passed).toBe(false);
    expect(JSON.parse(readFileSync(missing.reportPath, 'utf8')).error).toContain('absent.json');
  });
  it('retains failures and continues independent families when a child exits nonzero', async () => {
    const env = environment("import fs from 'node:fs'; fs.writeFileSync(process.argv[3] + '/attempted', 'yes'); process.exit(7);");
    const { report, reportPath } = await runRomRegressions({ ...env, caseIDs: ['hardware-diagnostic', 'map-states'] });
    expect(report.passed).toBe(false); expect(report.complete).toBe(false);
    expect(report.cases.map(c => c.exitCode)).toEqual([7, 7]);
    for (const id of ['hardware-diagnostic', 'map-states']) expect(readFileSync(path.join(path.dirname(reportPath), id, 'attempted'), 'utf8')).toBe('yes');
    expect(report.cases.every(c => c.roms.every(r => r.error))).toBe(true);
  });
  it('accepts a verified partial run without claiming the complete catalogue passed', async () => {
    const rom = createSmokeGbaRom(), hash = sha256(rom);
    const receipt = { schema: 1, source: 'linked_rom', target: 'hardware_diagnostic', romFile: 'hardware_diagnostic.gba',
      romBytes: rom.length, romSha256: hash, engineVersion: 'test', engineLibrarySha256: sha256('engine'), capacity: 33554432, remaining: 33554432 - rom.length, blocked: false };
    const script = `import fs from 'node:fs'; const root=process.argv[3]; fs.mkdirSync(root+'/project/build',{recursive:true});
fs.writeFileSync(root+'/project/build/hardware_diagnostic.gba',Buffer.from(${JSON.stringify([...rom])}));
fs.writeFileSync(root+'/project/build/rom_build_report.json',${JSON.stringify(JSON.stringify(receipt))});
fs.writeFileSync(root+'/verification.json',${JSON.stringify(JSON.stringify({ ok: true, romSha256: hash }))});`;
    const env = environment(script);
    const captures = await captureRomFrames({ rom, playerRoot: path.resolve('static/WebPlayer/player'), checkpoints: env.baseline.roms['hardware-diagnostic/project'] });
    env.baseline.roms['hardware-diagnostic/project'] = captures.frames.map(({ pixels, ...frame }) => frame);
    const { report } = await runRomRegressions({ ...env, caseIDs: ['hardware-diagnostic'] });
    expect(report.passed).toBe(true); expect(report.scope).toBe('selected_cases'); expect(report.complete).toBe(false);
    expect(report.cases[0].roms[0].captures).toHaveLength(2);
    writeFileSync(path.join(env.appRoot, 'scripts/smoke-hardware-diagnostic.mjs'), script.replace(
      JSON.stringify(JSON.stringify({ ok: true, romSha256: hash })), JSON.stringify(JSON.stringify({ romSha256: hash }))));
    const malformed = await runRomRegressions({ ...env, caseIDs: ['hardware-diagnostic'] });
    expect(malformed.report.passed).toBe(false);
    expect(malformed.report.cases[0].roms[0].error).toContain('Functional test did not pass');
    env.baseline.emulator.wasmSha256 = 'a'.repeat(64);
    const wrongCore = await runRomRegressions({ ...env, caseIDs: ['hardware-diagnostic'] });
    expect(wrongCore.report.passed).toBe(false); expect(wrongCore.report.cases).toEqual([]);
  });
});
