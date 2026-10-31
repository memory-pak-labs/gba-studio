import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const workflow = require('js-yaml').load(readFileSync(new URL('../../../.github/workflows/desktop-packages.yml', import.meta.url), 'utf8'));

describe('installed updater QA workflow', () => {
  it('keeps installer publication steps on the production job and isolates the QA matrix', () => {
    expect(workflow.jobs.desktop.steps.some((step) => step.name === 'Upload validated installer candidates')).toBe(true);
    const qa = workflow.jobs['installed-updater-qa'];
    expect(qa.strategy.matrix.include.map((item) => item.platform).sort()).toEqual(['linux', 'windows']);
    expect(qa.env.GBA_UPDATER_QA_ROOT).toContain('github.workspace');
    expect(qa.env.GBA_UPDATER_QA_ARTIFACTS).toContain('github.workspace');
    expect(qa.steps.some((step) => step.name === 'Upload validated installer candidates')).toBe(false);
    expect(qa.steps.find((step) => step.name === 'Upload updater evidence').if).toBe('always()');
  });
});
