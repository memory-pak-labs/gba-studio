import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const workflow = () => load(readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8'));
const steps = job => job.steps ?? [];
const commands = job => steps(job).map(s => s.run ?? '').join('\n');
const osSet = job => job.strategy.matrix.include.map(e => e.platform).sort();
const artifacts = job => steps(job).filter(s => s.uses?.startsWith('actions/upload-artifact@'));

describe('CI platform coverage and evidence', () => {
  it('builds and tests the Editor on Linux, Windows and macOS before rendered E2E', () => {
    const job = workflow().jobs.editor;
    expect(osSet(job)).toEqual(['linux', 'macos', 'windows']);
    const runs = steps(job).filter(s => s.run).map(s => s.run);
    expect(runs.indexOf('node node_modules/electron/install.js')).toBeGreaterThan(runs.indexOf('npm ci'));
    expect(runs.indexOf('node node_modules/electron/install.js')).toBeLessThan(runs.findIndex(s => s.includes('smoke-electron-welcome.mjs')));
    expect(runs.findIndex(s => s.includes('npm run build'))).toBeLessThan(runs.findIndex(s => s.includes('smoke-electron-welcome.mjs')));
    expect(commands(job)).toContain('xvfb-run -a node scripts/smoke-electron-welcome.mjs');
    expect(steps(job).some(s => s.if === "runner.os != 'Linux'" && s.run?.includes('node scripts/smoke-electron-welcome.mjs'))).toBe(true);
    expect(commands(job)).toContain('--reporter=json');
    expect(artifacts(job).some(s => s.if === 'always()' && s.with.path.includes('artifacts/ci-editor'))).toBe(true);
  });
  it('covers macOS host engine tests while preserving the native MSYS Windows suite', () => {
    const jobs = workflow().jobs;
    expect(jobs.engine.strategy.matrix.include.map(e => e.runner)).toContain('macos-15');
    expect(commands(jobs.engine)).toContain('make host-test');
    expect(commands(jobs['engine-windows'])).toContain('HOST_POSIX_FIXTURE_PYTHON=/usr/bin/python3');
    expect(artifacts(jobs.engine).some(s => s.if === 'always()')).toBe(true);
    expect(artifacts(jobs['engine-windows']).some(s => s.if === 'always()')).toBe(true);
  });
  it('replays only same-run producer artifacts and enforces the workflow commit', () => {
    const jobs = workflow().jobs, producer = jobs['rom-regressions'], replay = jobs['rom-replay'];
    expect(replay.needs).toBe('rom-regressions');
    expect(osSet(replay)).toEqual(['linux', 'macos', 'windows']);
    const uploads = artifacts(producer).map(s => s.with.name);
    for (const step of steps(replay).filter(s => s.uses?.startsWith('actions/download-artifact@'))) {
      expect(uploads).toContain(step.with.name);
      expect(step.with['run-id']).toBeUndefined(); expect(step.with['github-token']).toBeUndefined();
    }
    expect(commands(replay)).toContain('--expected-revision "${{ github.sha }}"');
    expect(commands(replay)).not.toMatch(/make|python|npm ci/);
    expect(artifacts(replay).some(s => s.if === 'always()')).toBe(true);
    expect(commands(producer)).toContain('git config --global --add safe.directory /work');
    expect(commands(producer)).toContain('tee "$RUNNER_TEMP/rom-regressions/producer.log"');
    const producerSteps = steps(producer);
    const restore = producerSteps.findIndex(s => s.name === 'Restore ownership of ROM evidence');
    const upload = producerSteps.findIndex(s => s.with?.name === 'ARM-ROM-regressions');
    expect(restore).toBeGreaterThan(producerSteps.findIndex(s => s.name === 'Compile ARM and replay native regressions'));
    expect(restore).toBeLessThan(upload);
    expect(producerSteps[restore].if).toBe('always()');
    expect(producerSteps[restore].run).toContain('"$RUNNER_TEMP/rom-regressions"');
  });
  it('keeps actions pinned and grants no publishing permissions', () => {
    const w = workflow(); expect(w.permissions).toEqual({ contents: 'read' });
    for (const job of Object.values(w.jobs)) for (const step of steps(job)) {
      if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
    }
  });
});
