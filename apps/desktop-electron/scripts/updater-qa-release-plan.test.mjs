import { describe, expect, it } from 'vitest';
import { updaterQaReleasePlan, validateUpdaterQaRelease, updaterQaAtom, loadUpdaterQaRelease, validateUpdaterQaFeed } from './updater-qa-release-plan.mjs';

const sha = 'a'.repeat(40);
const environment = {
  GBA_UPDATER_QA_SOURCE_VERSION: '0.1.0-rc.6', GBA_UPDATER_QA_TARGET_VERSION: '0.1.0-rc.7',
  GBA_UPDATER_QA_TARGET_DRAFT: '1', GBA_UPDATER_QA_TARGET_SHA: sha
};
const release = { tag_name: 'v0.1.0-rc.7', draft: true, target_commitish: sha, created_at: '2026-11-12T00:00:00Z' };

describe('immutable release pair for installed updater QA', () => {
  const files = ['arm64', 'x64'].map(arch => ({ url: `GBA-Studio-0.1.0-rc.7-macOS-${arch}.zip`, size: 123, sha512: `${arch}-verified-digest` }));
  const feed = { version: '0.1.0-rc.7', files, path: files[0].url, sha512: files[0].sha512 };
  it('uses the actual final feed only when both architecture packages match the verified bytes', () => {
    expect(validateUpdaterQaFeed(feed, '0.1.0-rc.7', files)).toBe(feed);
  });
  it.each([
    { version: '0.1.0-rc.6' }, { files: files.slice(0, 1) },
    { files: [files[0], files[0]] },
    { files: [files[0], { ...files[1], size: 124 }] },
    { files: [files[0], { ...files[1], sha512: 'incorrect' }] },
    { path: files[1].url }, { sha512: 'incorrect' }
  ])('rejects stale or incompatible final update metadata: %j', change => {
    expect(() => validateUpdaterQaFeed({ ...feed, ...change }, '0.1.0-rc.7', files)).toThrow(/feed/i);
  });
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
  it('finds an unpublished candidate in authenticated releases without publishing its tag', async () => {
    const calls = [];
    const request = async (url, options) => {
      calls.push({ url, options });
      return url.endsWith('/releases?per_page=100')
        ? { ok: true, json: async () => [release] }
        : { ok: false, status: 404 };
    };
    await expect(loadUpdaterQaRelease(updaterQaReleasePlan(environment), 'target', request, 'fixture-token')).resolves.toEqual(release);
    expect(calls).toHaveLength(1);
    expect(calls[0].options.headers.Authorization).toBe('Bearer fixture-token');
  });
  it('loads the public source from its immutable published tag', async () => {
    const source = { ...release, tag_name: 'v0.1.0-rc.6', draft: false };
    const request = async url => {
      expect(url).toBe('https://api.github.com/repos/memory-pak-labs/gba-studio/releases/tags/v0.1.0-rc.6');
      return { ok: true, json: async () => source };
    };
    await expect(loadUpdaterQaRelease(updaterQaReleasePlan(environment), 'source', request)).resolves.toEqual(source);
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
