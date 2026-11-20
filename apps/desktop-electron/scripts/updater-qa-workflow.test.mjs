import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stagedPackage, stagedReleaseAtom } from './prepare-published-updater-qa.mjs';

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
    const matrices = [...qa.strategy.matrix.include.matchAll(/'(\[.*?\])'/g)]
      .map((match) => JSON.parse(match[1]).map(({ runner }) => runner));
    expect(matrices).toEqual([
      ['macos-15-intel', 'macos-15'],
      ['windows-2022', 'ubuntu-24.04'],
      ['windows-2022', 'ubuntu-24.04', 'macos-15-intel', 'macos-15']
    ]);
    expect(workflow.permissions.contents).toBe('read');
    expect(qa.permissions).toBeUndefined();
    expect(qa.needs).toBe('stage-macos-updater');
    const stage = workflow.jobs['stage-macos-updater'];
    expect(stage.permissions.contents).toBe('write');
    expect(stage.steps.map(step => step.run).filter(Boolean).join('\n')).toContain('gh release download');
    expect(stage.steps.map(step => step.run).filter(Boolean).join('\n')).not.toMatch(/gh release (?:edit|upload|delete)|npm /);
    expect(workflow.jobs['engine-pack'].if).toContain('!inputs.updater_qa_published');
    expect(qa.env.GBA_UPDATER_QA_ROOT).toContain('github.workspace');
    expect(qa.steps.map(step => step.run).filter(Boolean).join('\n')).toContain('scripts/prepare-published-updater-qa.mjs');
    expect(qa.steps.find(step => step.name === 'Upload updater evidence').with.path).toMatch(/\/evidence\/$/);
  });
});

describe('staged updater candidate', () => {
  it('puts the exact unpublished target ahead of the real published source', () => {
    const previous = 'https://github.com/memory-pak-labs/gba-studio/releases/tag/v0.1.0-rc.6';
    const atom = '<feed><entry><link href="' + previous + '"/></entry></feed>';
    const updated = stagedReleaseAtom(atom, '0.1.0-rc.7', '2026-11-20T10:00:00Z');
    const links = [...updated.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
    expect(links).toEqual([previous.replace('rc.6', 'rc.7'), previous]);
    expect(() => stagedReleaseAtom(atom, '0.1.0-rc.7"><script', '2026-11-20')).toThrow();
  });

  it('hashes the CI artifact under its public installer filename and rejects ambiguity', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'gba-staged-update-'));
    try {
      const name = 'GBA.Studio.Setup.0.1.0-rc.7.exe';
      const candidate = path.join(directory, 'GBA Studio Setup 0.1.0-rc.7.exe');
      await writeFile(candidate, 'test');
      await expect(stagedPackage(directory, name)).resolves.toMatchObject({
        file: candidate,
        metadata: { url: name, size: 4, sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08' }
      });
      await mkdir(path.join(directory, 'duplicate'));
      await writeFile(path.join(directory, 'duplicate', name), 'test');
      await expect(stagedPackage(directory, name)).rejects.toThrow('Expected one staged candidate');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
