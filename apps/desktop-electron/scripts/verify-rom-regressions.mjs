#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { captureRomFrames, compareFrameHashes, sha256, verifyLinkedRom } from './lib/rom-regression.mjs';
import { encodePngRgba } from './lib/png-icons.mjs';
import { inspectMGBAWebCore } from './verify-mgba-web-core.mjs';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modes = ['tiled', 'resident', 'paged', 'paged-large', 'platformer', 'resident-keep'];
const rooms = ['resident', 'paged', 'platformer'];
const roms = names => names.map(id => ({ id, project: id, target: 'replace_tile', verification: id + '/verification.json' }));
export const regressionCases = [
  { id: 'replace-tile', script: 'smoke-replace-tile.mjs', covers: ['tilemap', 'sprites', 'palettes', 'camera', 'collision', 'large-map'], roms: roms(modes) },
  { id: 'event-replay', script: 'smoke-event-replay.mjs', covers: ['events', 'collision', 'save'], roms: [{ id: 'rom', project: 'rom', target: 'replace_tile', verification: 'actual.json' }] },
  { id: 'hardware-diagnostic', script: 'smoke-hardware-diagnostic.mjs', covers: ['input', 'audio', 'save'], roms: [{ id: 'project', project: 'project', target: 'hardware_diagnostic', verification: 'verification.json' }] },
  { id: 'map-states', script: 'smoke-map-states.mjs', covers: ['tilemap', 'collision', 'save', 'camera'], roms: roms(rooms) },
  { id: 'visibility-graphics', script: 'smoke-visibility-graphics.mjs', covers: ['sprites', 'palettes', 'camera', 'effects'], roms: roms(rooms) }
];

export function selectCases(ids = regressionCases.map(c => c.id)) {
  assert.ok(ids.length > 0 && new Set(ids).size === ids.length, 'Select unique regression case IDs');
  return ids.map(id => { const found = regressionCases.find(c => c.id === id); assert.ok(found, `Unknown regression case: ${id}`); return found; });
}

export function validateBaseline(baseline) {
  assert.equal(baseline.schema, 1, 'Unsupported frame baseline');
  assert.ok(typeof baseline.emulator?.sourceRevision === 'string' && baseline.emulator.sourceRevision.length > 0);
  assert.match(baseline.emulator?.wasmSha256 ?? '', /^[a-f0-9]{64}$/);
  const expectedIDs = regressionCases.flatMap(c => c.roms.map(r => c.id + '/' + r.id));
  assert.deepEqual(Object.keys(baseline.roms).sort(), expectedIDs.sort(), 'Baseline must cover the exact ROM catalogue');
  for (const frames of Object.values(baseline.roms)) {
    assert.deepEqual(frames.map(f => [f.label, f.frame]), [['boot', 180], ['idle', 240]], 'Baseline must use the fixed display frames');
    compareFrameHashes(frames, frames); // validates labels, ordering and pixel hashes
  }
  return baseline;
}

/** A new owned directory for every attempt prevents old ROMs, captures or PASS
 * reports from satisfying this run. Failures keep their logs and screenshots. */
export async function runRomRegressions({ enginePack, outputRoot, caseIDs, appRoot = app, baseline, baselinePath }) {
  const selected = selectCases(caseIDs);
  mkdirSync(outputRoot, { recursive: true });
  const directory = mkdtempSync(path.join(outputRoot, 'run-'));
  const reportPath = path.join(directory, 'report.json');
  const report = { schema: 1, kind: 'rom_regressions', passed: false, complete: false, physicalTested: false,
    scope: selected.length === regressionCases.length ? 'full_catalogue' : 'selected_cases', selected: selected.map(c => c.id), cases: [] };
  const relative = file => path.relative(directory, file).split(path.sep).join('/');
  try {
    baseline ??= JSON.parse(readFileSync(baselinePath ?? path.join(appRoot, 'fixtures/rom-regressions/frame-baselines.json'), 'utf8'));
    validateBaseline(baseline);
    const manifest = JSON.parse(readFileSync(path.join(enginePack, 'enginepack.json'), 'utf8'));
    report.engine = { version: manifest.version, librarySha256: sha256(readFileSync(path.join(enginePack, 'lib/libgbastudio_engine.a'))),
      assetcSha256: sha256(readFileSync(path.join(enginePack, 'tools/assetc'))), gbsbuildSha256: sha256(readFileSync(path.join(enginePack, 'tools/gbsbuild'))) };
    const playerRoot = path.join(appRoot, 'static/WebPlayer/player');
    const inspected = await inspectMGBAWebCore(path.dirname(playerRoot));
    assert.ok(inspected.ok, inspected.failures.join('; '));
    report.emulator = { sourceRevision: inspected.sourceRevision, wasmSha256: sha256(readFileSync(inspected.wasmPath)),
      bridgeSha256: sha256(readFileSync(path.join(playerRoot, 'mgba-core.mjs'))) };
    assert.equal(report.emulator.sourceRevision, baseline.emulator.sourceRevision, 'Baseline uses another mGBA revision');
    assert.equal(report.emulator.wasmSha256, baseline.emulator.wasmSha256, 'Baseline uses another mGBA binary');
    const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: appRoot, encoding: 'utf8' });
    report.sourceRevision = revision.status === 0 ? revision.stdout.trim() : null;
    const dirty = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: appRoot, encoding: 'utf8' });
    report.trackedSourceDirty = dirty.status === 0 ? dirty.stdout.trim().length > 0 : null;
    report.harness = Object.fromEntries(['scripts/verify-rom-regressions.mjs', 'scripts/lib/rom-regression.mjs'].map(file => [file, sha256(readFileSync(path.join(appRoot, file)))]));
    report.baselineSha256 = sha256(JSON.stringify(baseline));
    for (const entry of selected) {
      const root = path.join(directory, entry.id); mkdirSync(root);
      const item = { id: entry.id, covers: entry.covers, passed: false, log: relative(path.join(root, 'runner.log')), roms: [] };
      report.cases.push(item);
      try {
        const script = path.join(appRoot, 'scripts', entry.script);
        item.scriptSha256 = sha256(readFileSync(script));
        console.log(`ROM regression: ${entry.id}`);
        const run = spawnSync(process.execPath, [script, enginePack, root], { cwd: appRoot, env: process.env,
          encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 10 * 60 * 1000 });
        writeFileSync(path.join(root, 'runner.log'), (run.stdout ?? '') + (run.stderr ?? '') + (run.error ? String(run.error) : ''));
        item.exitCode = run.status; item.signal = run.signal;
        for (const spec of entry.roms) {
          const sample = { id: entry.id + '/' + spec.id, passed: false }; item.roms.push(sample);
          try {
            const build = path.join(root, spec.project, 'build'), romPath = path.join(build, spec.target + '.gba');
            sample.rom = relative(romPath);
            sample.receipt = verifyLinkedRom({ romPath, reportPath: path.join(build, 'rom_build_report.json'), enginePack });
            const functional = JSON.parse(readFileSync(path.join(root, spec.verification), 'utf8'));
            assert.equal(functional.romSha256, sample.receipt.romSha256, 'Functional test observed another ROM');
            if (entry.id !== 'event-replay') assert.equal(functional.ok, true, 'Functional test did not pass');
            sample.functionalVerification = relative(path.join(root, spec.verification));
            const checkpoints = baseline.roms[sample.id];
            const captured = await captureRomFrames({ rom: readFileSync(romPath), playerRoot, checkpoints });
            for (const frame of captured.frames) {
              const file = path.join(root, spec.project, frame.label + '-fixed.png');
              writeFileSync(file, encodePngRgba({ width: 240, height: 160, pixels: frame.pixels }));
            }
            sample.comparison = compareFrameHashes(checkpoints, captured.frames);
            sample.captures = captured.frames.map(({ pixels, ...frame }) => ({ ...frame, png: relative(path.join(root, spec.project, frame.label + '-fixed.png')) }));
            sample.passed = sample.comparison.passed;
          } catch (error) { sample.error = String(error); }
        }
        item.passed = run.status === 0 && item.roms.length === entry.roms.length && item.roms.every(r => r.passed);
      } catch (error) { item.error = String(error); }
      writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    }
    report.passed = report.cases.length === selected.length && report.cases.every(c => c.passed);
    report.complete = report.scope === 'full_catalogue' && report.passed;
  } catch (error) { report.error = String(error); }
  finally { writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); }
  return { report, reportPath };
}

async function main() {
  const options = { enginePack: path.resolve(app, '../../packages/GBAStudioEngine/dist/GBAStudioEnginePack'), outputRoot: path.join(app, 'artifacts/rom-regressions') };
  let baselinePath = path.join(app, 'fixtures/rom-regressions/frame-baselines.json');
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i], value = process.argv[++i];
    assert.ok(value && !value.startsWith('--'), `Missing value for ${flag}`);
    if (flag === '--engine-pack') options.enginePack = path.resolve(value);
    else if (flag === '--output') options.outputRoot = path.resolve(value);
    else if (flag === '--baseline') baselinePath = path.resolve(value);
    else if (flag === '--case') (options.caseIDs ??= []).push(value);
    else throw new Error(`Unknown option: ${flag}`);
  }
  options.baselinePath = baselinePath;
  const { report, reportPath } = await runRomRegressions(options);
  console.log(`${report.passed ? 'PASS' : 'FAIL'} (${report.scope}): ${reportPath}`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(String(error)); process.exitCode = 1; });
}
