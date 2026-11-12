import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

assert.equal(process.platform, 'darwin');
assert.equal(process.arch, 'x64');
const root = process.env.GBA_UPDATER_QA_ROOT;
assert(root && path.isAbsolute(root));
const evidence = path.join(root, 'evidence');
await mkdir(evidence, { recursive: true });
const app = path.join(root, 'reference', 'gba-studio.app');
const romRoot = path.join(evidence, 'rom');
const env = { ...process.env, GBA_STUDIO_PACKAGED_APP_PATH: app,
  GBA_STUDIO_SMOKE_ARCH: 'x86_64', GBA_STUDIO_MAC_ARCH: 'x64',
  GBA_STUDIO_OFFLINE_SMOKE: '1', GBA_STUDIO_TRACE_SCENE_SMOKE: '1',
  GBA_STUDIO_EXEMPLO_SCENE_BUILD_TIMEOUT_MS: '900000',
  GBA_STUDIO_EXEMPLO_SCENES_OUTPUT: path.join(evidence, 'original-arena-smoke'),
  GBA_STUDIO_DIAGNOSTIC_ROM_OUTPUT: romRoot };
const baseline = spawnSync(process.execPath, ['scripts/smoke-electron-exemplo-scenes.mjs', '--packaged', '--scene=arena_arrancada'],
  { env, stdio: 'inherit', timeout: 20 * 60_000 });
// The original 55 FPS presentation audit is preserved and expected to reject
// this 30 Hz host. It does not select or modify the diagnostic measurements.
await writeFile(path.join(evidence, 'original-smoke-exit.json'), JSON.stringify({ status: baseline.status, signal: baseline.signal }));
const rom = path.join(romRoot, 'arena_arrancada.gba');
const romHash = createHash('sha256').update(await readFile(rom)).digest('hex');
const webRoot = path.join(app, 'Contents', 'Resources', 'WebPlayer');
const coreHash = createHash('sha256').update(await readFile(path.join(webRoot, 'player', 'mgba-core.wasm'))).digest('hex');
const policies = [
  ['baseline', ''],
  ['eager-wasm', '--no-liftoff --no-wasm-lazy-compilation --no-wasm-tier-up'],
  ['js-baseline', '--max-opt=1 --always-sparkplug'],
  ['combined', '--max-opt=1 --always-sparkplug --no-liftoff --no-wasm-lazy-compilation --no-wasm-tier-up']
];
// Reverse the second round to reduce order/host drift; each process/profile is new.
const results = [];
const nativeEnv = { ...process.env };
delete nativeEnv.ELECTRON_RUN_AS_NODE;
delete nativeEnv.ATOM_SHELL_INTERNAL_RUN_AS_NODE;
for (let round = 0; round < 2; round++) {
  for (const [policy, flags] of round ? [...policies].reverse() : policies) {
    const id = `${round + 1}-${policy}`;
    const output = path.join(evidence, `${id}.json`);
    const run = spawnSync(path.resolve('node_modules/.bin/electron'), ['scripts/diagnose-intel-player.cjs'], {
      env: { ...nativeEnv, GBA_INTEL_ROM: rom, GBA_INTEL_WEB_ROOT: webRoot,
        GBA_INTEL_FLAGS: flags, GBA_INTEL_OUTPUT: output, GBA_INTEL_PROFILE: path.join(root, 'profiles', id) },
      stdio: 'inherit', timeout: 90_000
    });
    assert.equal(run.status, 0, `Diagnostic ${id} failed`);
    const report = JSON.parse(await readFile(output, 'utf8'));
    results.push({ id, policy, ...report });
    console.log(JSON.stringify({ id, firstWindow: report.firstWindow, audio: report.audio }));
  }
}
await writeFile(path.join(evidence, 'comparison.json'), JSON.stringify({
  kind: 'compiler-policy-isolation-not-release-approval', candidate: process.env.GBA_UPDATER_QA_TARGET_SHA,
  romHash, coreHash, originalSmokeExit: baseline.status, results
}, null, 2) + '\n');
