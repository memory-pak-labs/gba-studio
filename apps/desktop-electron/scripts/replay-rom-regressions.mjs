#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { regressionCases, validateBaseline } from './verify-rom-regressions.mjs';
import { captureRomFrames, compareFrameHashes, sha256, verifyLinkedRom } from './lib/rom-regression.mjs';
import { encodePngRgba } from './lib/png-icons.mjs';
import { inspectMGBAWebCore } from './verify-mgba-web-core.mjs';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = file => JSON.parse(readFileSync(file, 'utf8'));
function contained(root, relative) {
  const file = realpathSync(path.join(root, relative));
  const rel = path.relative(root, file);
  assert.ok(rel && !rel.startsWith('..') && !path.isAbsolute(rel), 'Artifact path escapes its source directory');
  return file;
}

/** Replay the producer's exact cartridges, with no compiler, Python or native
 * fixture process on the consuming host. Functional scripts ran on the producer. */
export async function replayRomRegressions({ inputRoot, enginePack, outputRoot, expectedRevision, appRoot = app, baseline }) {
  mkdirSync(outputRoot, { recursive: true });
  const directory = mkdtempSync(path.join(outputRoot, 'replay-')), reportPath = path.join(directory, 'report.json');
  const report = { schema: 1, kind: 'rom_regression_replay', passed: false, complete: false,
    platform: process.platform, arch: process.arch, functionalReplay: false, physicalTested: false, roms: [] };
  const relative = file => path.relative(directory, file).split(path.sep).join('/');
  try {
    assert.match(expectedRevision ?? '', /^[a-f0-9]{40}$/, 'An exact producer revision is required');
    baseline ??= json(path.join(appRoot, 'fixtures/rom-regressions/frame-baselines.json'));
    validateBaseline(baseline);
    const input = realpathSync(inputRoot);
    const runs = readdirSync(input, { withFileTypes: true }).filter(e => e.isDirectory() && e.name.startsWith('run-'));
    assert.equal(runs.length, 1, 'Artifact root must contain exactly one producer run');
    const sourceRoot = contained(input, runs[0].name), sourceFile = contained(sourceRoot, 'report.json');
    const source = json(sourceFile);
    assert.equal(source.schema, 1); assert.equal(source.kind, 'rom_regressions');
    assert.equal(source.sourceRevision, expectedRevision, 'Artifacts belong to another source revision');
    assert.equal(source.trackedSourceDirty, false, 'Producer source was modified');
    assert.equal(source.passed, true); assert.equal(source.complete, true); assert.equal(source.scope, 'full_catalogue');
    assert.equal(source.baselineSha256, sha256(JSON.stringify(baseline)), 'Producer used another visual baseline');
    const manifest = json(path.join(enginePack, 'enginepack.json'));
    report.engine = { version: manifest.version, librarySha256: sha256(readFileSync(path.join(enginePack, 'lib/libgbastudio_engine.a'))),
      assetcSha256: sha256(readFileSync(path.join(enginePack, 'tools/assetc'))), gbsbuildSha256: sha256(readFileSync(path.join(enginePack, 'tools/gbsbuild'))) };
    assert.deepEqual(source.engine, report.engine, 'Artifacts use another Engine Pack');
    const playerRoot = path.join(appRoot, 'static/WebPlayer/player'), inspected = await inspectMGBAWebCore(path.dirname(playerRoot));
    assert.ok(inspected.ok, inspected.failures.join('; '));
    report.emulator = { sourceRevision: inspected.sourceRevision, wasmSha256: sha256(readFileSync(inspected.wasmPath)),
      bridgeSha256: sha256(readFileSync(path.join(playerRoot, 'mgba-core.mjs'))) };
    assert.deepEqual(source.emulator, report.emulator, 'Artifacts use another emulator');
    const sameIDs = (actual, expected) => {
      assert.deepEqual(actual.map(e => e.id).sort(), expected.sort(), 'Producer catalogue is incomplete or duplicated');
    };
    sameIDs(source.cases, regressionCases.map(c => c.id));
    // Validate the entire manifest before opening any ROM. Paths are derived
    // from the checked-in catalogue, never followed from artifact JSON.
    for (const c of regressionCases) {
      const item = source.cases.find(e => e.id === c.id);
      assert.equal(item.passed, true); assert.equal(item.exitCode, 0);
      sameIDs(item.roms, c.roms.map(r => c.id + '/' + r.id));
      for (const spec of c.roms) {
        const r = item.roms.find(r => r.id === c.id + '/' + spec.id);
        assert.equal(r.passed, true); assert.equal(r.comparison.passed, true);
        assert.equal(r.rom, [c.id, spec.project, 'build', spec.target + '.gba'].join('/'));
        assert.equal(r.functionalVerification, c.id + '/' + spec.verification);
      }
    }
    report.sourceRevision = source.sourceRevision; report.producerReportSha256 = sha256(readFileSync(sourceFile));
    report.baselineSha256 = source.baselineSha256;
    for (const c of regressionCases) for (const spec of c.roms) {
      const id = c.id + '/' + spec.id, item = { id, passed: false }; report.roms.push(item);
      try {
        const producer = source.cases.find(e => e.id === c.id).roms.find(r => r.id === id);
        const build = [c.id, spec.project, 'build'].join('/');
        const romPath = contained(sourceRoot, build + '/' + spec.target + '.gba');
        item.receipt = verifyLinkedRom({ romPath, reportPath: contained(sourceRoot, build + '/rom_build_report.json'), enginePack });
        assert.deepEqual(item.receipt, producer.receipt, 'Materialized receipt differs from producer report');
        const functional = json(contained(sourceRoot, c.id + '/' + spec.verification));
        assert.equal(functional.romSha256, item.receipt.romSha256, 'Functional result belongs to another ROM');
        if (c.id !== 'event-replay') assert.equal(functional.ok, true);
        const captures = await captureRomFrames({ rom: readFileSync(romPath), playerRoot, checkpoints: baseline.roms[id] });
        const images = path.join(directory, c.id, spec.id); mkdirSync(images, { recursive: true });
        for (const frame of captures.frames) writeFileSync(path.join(images, frame.label + '.png'), encodePngRgba({ width: 240, height: 160, pixels: frame.pixels }));
        item.captures = captures.frames.map(({ pixels, ...frame }) => ({ ...frame, png: relative(path.join(images, frame.label + '.png')) }));
        item.comparison = compareFrameHashes(baseline.roms[id], captures.frames); item.passed = item.comparison.passed;
      } catch (error) { item.error = String(error); }
      writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    }
    report.passed = report.roms.length === regressionCases.reduce((count, c) => count + c.roms.length, 0) && report.roms.every(r => r.passed);
    report.complete = report.passed;
  } catch (error) { report.error = String(error); }
  finally { writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); }
  return { report, reportPath };
}

async function main() {
  const options = { enginePack: path.resolve(app, '../../packages/GBAStudioEngine/dist/GBAStudioEnginePack'), outputRoot: path.join(app, 'artifacts/rom-replay') };
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i], value = process.argv[++i]; assert.ok(value && !value.startsWith('--'), `Missing value for ${flag}`);
    if (flag === '--input') options.inputRoot = path.resolve(value);
    else if (flag === '--engine-pack') options.enginePack = path.resolve(value);
    else if (flag === '--output') options.outputRoot = path.resolve(value);
    else if (flag === '--expected-revision') options.expectedRevision = value;
    else throw new Error(`Unknown option: ${flag}`);
  }
  assert.ok(options.inputRoot, '--input is required');
  const { report, reportPath } = await replayRomRegressions(options);
  console.log(`${report.passed ? 'PASS' : 'FAIL'} (${report.platform}/${report.arch}): ${reportPath}`);
  if (!report.passed) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(String(error)); process.exitCode = 1; });
}
