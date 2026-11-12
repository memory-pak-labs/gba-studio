import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const workflow = require('js-yaml').load(readFileSync(new URL('../../../.github/workflows/desktop-packages.yml', import.meta.url), 'utf8'));

describe('installed updater QA workflow', () => {
  it('keeps installer publication steps on the production job and isolates the QA matrix', () => {
    expect(workflow.jobs.desktop.steps.some((step) => step.name === 'Upload validated installer candidates')).toBe(true);
    const qa = workflow.jobs['installed-updater-qa'];
    expect(qa.strategy.matrix.include).toContain('updater_qa_platform');
    expect(qa.strategy.matrix.include).toContain('ubuntu-24.04');
    expect(qa.strategy.matrix.include).toContain('windows-2022');
    expect(workflow.concurrency.group).toContain('github.run_id');
    expect(qa.env.GBA_UPDATER_QA_ROOT).toContain('github.workspace');
    expect(qa.env.GBA_UPDATER_QA_ARTIFACTS).toContain('github.workspace');
    expect(qa.steps.some((step) => step.name === 'Upload validated installer candidates')).toBe(false);
    expect(qa.steps.find((step) => step.name === 'Upload updater evidence').if).toBe('always()');
  });

  it('runs the published updater against the four native platforms in a read-only workflow', () => {
    const qa = workflow.jobs['published-updater-qa'];
    expect(qa.strategy.matrix.include.map(({ runner }) => runner)).toEqual([
      'windows-2022', 'ubuntu-24.04', 'macos-15-intel', 'macos-15'
    ]);
    expect(workflow.permissions.contents).toBe('read');
    expect(workflow.jobs['engine-pack'].if).toContain('!inputs.updater_qa_published');
    expect(qa.env.GBA_UPDATER_QA_ROOT).toContain('github.workspace');
    expect(qa.steps.map(step => step.run).filter(Boolean).join('\n')).toContain('scripts/prepare-published-updater-qa.mjs');
    expect(qa.steps.find(step => step.name === 'Upload updater evidence').with.path).toMatch(/\/evidence\/$/);
  });
  it('pins unpublished candidates without granting release publication permissions', () => {
    const inputs = workflow.on.workflow_dispatch.inputs;
    expect(Object.keys(inputs).length).toBeLessThanOrEqual(10);
    expect(inputs.updater_qa_source_version.default).toBe('0.1.0-rc.6');
    expect(inputs.updater_qa_target_version.default).toBe('0.1.0-rc.7');
    expect(inputs.updater_qa_target_draft.default).toBe(false);
    const qa = workflow.jobs['published-updater-qa'];
    expect(qa.env.GBA_UPDATER_QA_TARGET_SHA).toContain('inputs.updater_qa_target_sha');
    expect(qa.env.GBA_UPDATER_QA_TARGET_DRAFT).toContain('inputs.updater_qa_target_draft');
    expect(workflow.permissions.contents).toBe('read');
    expect(qa.steps.some(step => /gh release (create|edit|upload)/.test(step.run ?? ''))).toBe(false);
  });
});
