import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const driver = fileURLToPath(new URL('./diagnose-intel-installed.mjs', import.meta.url));
const root = path.join(process.env.GBA_UPDATER_QA_ROOT, 'evidence');
const modes = { default: '', cpu: 'cpu', desync: 'desync', both: '1' };
const orders = [['default', 'cpu', 'desync', 'both'], ['both', 'desync', 'cpu', 'default'], ['cpu', 'default', 'both', 'desync']];
for (const [index, order] of orders.entries()) for (const mode of order) {
  const result = spawnSync(process.execPath, [driver], { stdio: 'inherit', timeout: 90000,
    env: { ...process.env, GBA_INTEL_TRACE_PACING: '1', GBA_INTEL_SOFTWARE_CANVAS: modes[mode],
      GBA_INTEL_LABEL: `balanced-${mode}`, GBA_INTEL_FIRST_TRIAL: String(index + 1),
      GBA_INTEL_TRIAL_COUNT: '1', GBA_INTEL_REQUIRE_PASS: '0' } });
  assert.equal(result.status, 0, `Invalid instrumentation: ${mode}/${index + 1}`);
}
for (const mode of Object.keys(modes)) {
  const trials = await Promise.all([1, 2, 3].map(async trial => JSON.parse(await readFile(path.join(root, `installed-balanced-${mode}-${trial}.json`), 'utf8'))));
  assert.equal(new Set(trials.map(trial => trial.romHash)).size, 1);
  const passed = trials.every(trial => trial.audio.state === 'running' && trial.audio.audioUnderrunCount === 0
    && trial.audio.emittedNonSilentSamples > 0 && trial.firstWindow.observedSamples.length === 4
    && trial.firstWindow.observedSamples.every(sample => sample.emulationFps >= 55 && sample.droppedFrameRatio <= 0.1
      && sample.runtimeState?.audio?.pcmUnderrunCount === 0));
  const report = { kind: 'counterbalanced-canvas-experiment', mode, orders, passed, publicationApproved: false, trials };
  await writeFile(path.join(root, `counterbalanced-${mode}.json`), JSON.stringify(report, null, 2) + '\n');
}
