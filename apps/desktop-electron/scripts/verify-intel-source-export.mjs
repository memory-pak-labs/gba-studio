import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Preserve the original 55/55 FPS full audit and nonzero exit on this 30 Hz
// display. This separate functional result never authorizes publication.
const script = fileURLToPath(new URL('./smoke-electron-exemplo-scenes.mjs', import.meta.url));
const run = spawnSync(process.execPath, [script, '--scene=arena_arrancada'], { env: process.env, stdio: 'inherit', timeout: 20 * 60_000 });
const root = process.env.GBA_STUDIO_EXEMPLO_SCENES_OUTPUT;
const raw = JSON.parse(await readFile(path.join(root, 'exemplo_scene_playtest_evidence.json'), 'utf8'));
const scene = raw.results[0];
const checks = {
  scene: raw.results.length === 1 && scene.name === 'arena_arrancada',
  thresholds: raw.audit.thresholds.minEmulationFps === 55 && raw.audit.thresholds.minPresentationFps === 55 && raw.audit.thresholds.maxDroppedFrameRatio === 0.1,
  emulation: scene.performance.emulationFps >= 55 && scene.performance.droppedFrameRatio <= 0.1,
  firstWindow: scene.performance.observedSamples.length === 4,
  engineAudio: scene.performance.observedSamples.every(sample => sample.runtimeState?.audio?.pcmUnderrunCount === 0),
  outputAudio: scene.audio.state === 'running' && scene.audio.emittedNonSilentSamples > 0 && scene.audio.audioUnderrunCount === 0,
  visuals: raw.audit.visualGate.ok === true,
  remainingAssertions: raw.audit.issues.every(issue => issue === 'arena_arrancada: cadencia do Player fora dos limites esperados.')
};
const summary = { scope: 'exact fixed source with frozen verified engine resources; full cold export and playback',
  checks, functionalPassed: Object.values(checks).every(Boolean), strictAuditPassed: raw.ok,
  rawExitCode: run.status, publicationApproved: false,
  perSampleDiagnosticPassed: scene.performance.observedSamples.every(sample => sample.emulationFps >= 55 && sample.droppedFrameRatio <= 0.1), performance: scene.performance };
await writeFile(path.join(root, 'functional-summary.json'), JSON.stringify(summary, null, 2) + '\n');
assert(summary.functionalPassed, JSON.stringify(checks));
