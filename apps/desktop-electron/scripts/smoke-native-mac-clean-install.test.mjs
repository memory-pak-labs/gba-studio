import { describe, expect, it } from 'vitest';
import { nativeMacCleanInstallAsset, verifyNativeMacPayload, nativeCleanSmokeEnvironment } from './smoke-native-mac-clean-install.mjs';
const sha = 'a'.repeat(40);
const hashes = ['1'.repeat(64), '2'.repeat(64), '3'.repeat(64)];
const fixture = { platform: 'darwin', architecture: 'x64', targetCommit: sha, targetVersion: '0.1.0-rc.7', targetBundleHashes: hashes };
const asset = { id: 10, state: 'uploaded', name: 'GBA-Studio-0.1.0-rc.7-macOS-x64.dmg', digest: 'sha256:' + 'f'.repeat(64) };
const release = { draft: true, target_commitish: sha, tag_name: 'v0.1.0-rc.7', assets: [asset] };
describe('native clean Mac installation', () => {
  it('keeps CI download credentials out of the installed application environment', () => {
    const source = { PATH: '/usr/bin', GH_TOKEN: 'fixture-only', GITHUB_TOKEN: 'fixture-only' };
    const env = nativeCleanSmokeEnvironment(source, '/qa/app', '/qa/evidence', 'x64');
    expect(env).not.toHaveProperty('GH_TOKEN');
    expect(env).not.toHaveProperty('GITHUB_TOKEN');
    expect(env.GBA_STUDIO_SMOKE_ARCH).toBe('x86_64');
    expect(source.GH_TOKEN).toBe('fixture-only');
  });
  it('selects the final DMG for the exact native candidate and architecture', () => {
    expect(nativeMacCleanInstallAsset(release, fixture, 'darwin', 'x64')).toEqual(asset);
  });
  it.each([['linux', 'x64'], ['darwin', 'arm64']])('rejects a mismatched clean-install host %s/%s', (platform, architecture) => {
    expect(() => nativeMacCleanInstallAsset(release, fixture, platform, architecture)).toThrow();
  });
  it('rejects a different candidate even when its version matches', () => {
    expect(() => nativeMacCleanInstallAsset({ ...release, target_commitish: 'b'.repeat(40) }, fixture, 'darwin', 'x64')).toThrow('source differs');
  });
  it('rejects an image without a verified uploaded digest', () => {
    expect(() => nativeMacCleanInstallAsset({ ...release, assets: [{ ...asset, digest: '' }] }, fixture, 'darwin', 'x64')).toThrow();
  });
  it.each([0, 1, 2])('rejects a clean-install payload mismatch in component %s', index => {
    const changed = [...hashes]; changed[index] = '0'.repeat(64);
    expect(() => verifyNativeMacPayload(changed, hashes)).toThrow('differs');
  });
  it('accepts all three exact final target bundle components', () => {
    expect(() => verifyNativeMacPayload(hashes, hashes)).not.toThrow();
  });
});
