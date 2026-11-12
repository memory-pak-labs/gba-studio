import { describe, expect, it } from 'vitest';
import { updaterQaReleasePlan, validateUpdaterQaRelease, updaterQaAtom } from './updater-qa-release-plan.mjs';

const sha = 'a'.repeat(40);
const environment = {
  GBA_UPDATER_QA_SOURCE_VERSION: '0.1.0-rc.6', GBA_UPDATER_QA_TARGET_VERSION: '0.1.0-rc.7',
  GBA_UPDATER_QA_TARGET_DRAFT: '1', GBA_UPDATER_QA_TARGET_SHA: sha
};
const release = { tag_name: 'v0.1.0-rc.7', draft: true, target_commitish: sha, created_at: '2026-11-12T00:00:00Z' };

describe('immutable release pair for installed updater QA', () => {
  it('keeps the historical published pair available by default', () => {
    expect(updaterQaReleasePlan({})).toEqual({ sourceVersion: '0.1.0-rc.5', targetVersion: '0.1.0-rc.6', targetDraft: false, targetSha: '' });
  });
  it('requires the exact source commit before accepting a draft candidate', () => {
    const plan = updaterQaReleasePlan(environment);
    expect(plan.targetDraft).toBe(true);
    expect(() => validateUpdaterQaRelease(release, plan, 'target')).not.toThrow();
    expect(() => validateUpdaterQaRelease({ ...release, target_commitish: 'b'.repeat(40) }, plan, 'target')).toThrow(/commit/);
    expect(() => validateUpdaterQaRelease({ ...release, draft: false }, plan, 'target')).toThrow(/draft/);
    expect(() => validateUpdaterQaRelease({ ...release, tag_name: 'v0.1.0-rc.8' }, plan, 'target')).toThrow(/tag/);
  });
  it('never accepts a draft as the installed public source', () => {
    const plan = updaterQaReleasePlan(environment);
    expect(() => validateUpdaterQaRelease({ ...release, tag_name: 'v0.1.0-rc.6' }, plan, 'source')).toThrow(/published/);
  });
  it.each([
    { GBA_UPDATER_QA_TARGET_SHA: '' }, { GBA_UPDATER_QA_TARGET_SHA: 'develop' },
    { GBA_UPDATER_QA_TARGET_VERSION: '0.1.0-rc.6' }, { GBA_UPDATER_QA_TARGET_VERSION: '0.1.0-rc.5' },
    { GBA_UPDATER_QA_TARGET_VERSION: '<script>' }, { GBA_UPDATER_QA_TARGET_DRAFT: 'yes' }
  ])('rejects an ambiguous candidate before downloading: %j', change => {
    expect(() => updaterQaReleasePlan({ ...environment, ...change })).toThrow();
  });
  it('adds only the pinned draft to the isolated Atom fixture', () => {
    const atom = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>v0.1.0-rc.6</title></entry></feed>';
    const actual = updaterQaAtom(atom, release, updaterQaReleasePlan(environment));
    expect(actual).toContain('<title>v0.1.0-rc.7</title>');
    expect(actual).toContain('https://github.com/memory-pak-labs/gba-studio/releases/tag/v0.1.0-rc.7');
    expect(actual).toContain('<entry><title>v0.1.0-rc.6</title></entry>');
    expect(() => updaterQaAtom('broken feed', release, updaterQaReleasePlan(environment))).toThrow();
  });
  it('requires the target to already appear when testing public releases', () => {
    const plan = updaterQaReleasePlan({});
    expect(() => updaterQaAtom('<feed></feed>', {}, plan)).toThrow(/absent/);
    const atom = '<feed><entry><link href="https://github.com/memory-pak-labs/gba-studio/releases/tag/v0.1.0-rc.6" /></entry></feed>';
    expect(updaterQaAtom(atom, {}, plan)).toBe(atom);
  });
});
