import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assetFor, fetchPackage, macBundleFiles, verifyPublishedMacBundle } from './prepare-published-updater-qa.mjs';
import { updaterQaReleasePlan, loadUpdaterQaRelease } from './updater-qa-release-plan.mjs';

const run = promisify(execFile);
export function nativeMacCleanInstallAsset(release, fixture, platform = process.platform, architecture = process.arch) {
  assert(platform === 'darwin' && ['arm64', 'x64'].includes(architecture), 'Clean DMG install requires a native Mac host');
  assert(fixture.platform === platform && fixture.architecture === architecture, 'Clean install host and fixture architecture differ');
  assert(fixture.targetCommit === release.target_commitish, 'Clean install candidate source differs');
  assert(release.tag_name === `v${fixture.targetVersion}`, 'Clean install release version differs');
  assert(fixture.targetBundleHashes?.length === macBundleFiles.length && fixture.targetBundleHashes.every(hash => /^[a-f0-9]{64}$/.test(hash)), 'Verified target bundle hashes required');
  return assetFor(release, `GBA-Studio-${fixture.targetVersion}-macOS-${architecture}.dmg`);
}

export function verifyNativeMacPayload(actual, expected) {
  assert(actual.length === macBundleFiles.length && actual.every((hash, index) => hash === expected[index]), 'Clean DMG payload differs from the verified target ZIP');
}

export function nativeCleanSmokeEnvironment(environment, app, evidence, architecture) {
  const env = { ...environment, GBA_STUDIO_PACKAGED_APP_PATH: app, GBA_STUDIO_OFFLINE_SMOKE: '1',
    GBA_STUDIO_MAC_ARCH: architecture, GBA_STUDIO_SMOKE_ARCH: architecture === 'x64' ? 'x86_64' : 'arm64',
    GBA_STUDIO_SMOKE_OUTPUT_DIR: path.join(evidence, 'welcome') };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  return env;
}

async function digest(file) {
  const hash = createHash('sha256');
  for await (const block of createReadStream(file)) hash.update(block);
  return hash.digest('hex');
}

async function enoughDisk(root, bytes) {
  const fs = await statfs(root);
  assert(fs.bavail * fs.bsize > bytes + 2 * 1024 ** 3, 'Clean install would cross the two GiB free-space floor');
}

async function main() {
  assert(process.env.GBA_UPDATER_QA_ROOT, 'Isolated QA root required');
  const root = path.resolve(process.env.GBA_UPDATER_QA_ROOT);
  const fixture = JSON.parse(await readFile(path.join(root, 'fixture.json'), 'utf8'));
  const plan = updaterQaReleasePlan();
  const release = await loadUpdaterQaRelease(plan, 'target');
  const asset = nativeMacCleanInstallAsset(release, fixture);
  const stage = path.join(root, 'clean-final-dmg');
  await mkdir(stage); // No reuse or overwrite of any pre-existing install.
  const image = path.join(stage, asset.name);
  await enoughDisk(root, asset.size);
  const verified = await fetchPackage(asset, image, plan.targetDraft);
  const mount = path.join(stage, 'mount');
  await mkdir(mount);
  let mounted = false;
  const app = path.join(stage, 'installed', 'gba-studio.app');
  const evidence = path.join(root, 'evidence', 'native-clean-install');
  await mkdir(evidence, { recursive: true });
  try {
    await run('/usr/bin/codesign', ['--verify', '--strict', image]);
    await run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, image]);
    mounted = true;
    const reference = path.join(root, 'reference', 'gba-studio.app');
    const size = Number((await run('/usr/bin/du', ['-sk', reference])).stdout.trim().split(/\s+/)[0]) * 1024;
    assert(Number.isFinite(size) && size > 0);
    await enoughDisk(root, size);
    await mkdir(path.dirname(app));
    await run('/usr/bin/ditto', [path.join(mount, 'gba-studio.app'), app]);
    const trust = await verifyPublishedMacBundle(app);
    const hashes = await Promise.all(macBundleFiles.map(file => digest(path.join(app, 'Contents', file))));
    verifyNativeMacPayload(hashes, fixture.targetBundleHashes);
    const config = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const info = path.join(app, 'Contents', 'Info.plist');
    const build = (await run('/usr/bin/plutil', ['-extract', 'CFBundleVersion', 'raw', '-o', '-', info])).stdout.trim();
    assert(build === config.build.mac.bundleVersion, 'Clean DMG bundle build differs');
    const welcome = fileURLToPath(new URL('./smoke-electron-welcome.mjs', import.meta.url));
    await run(process.execPath, [welcome, '--packaged'], { timeout: 180_000, maxBuffer: 4 * 1024 ** 2,
      env: nativeCleanSmokeEnvironment(process.env, app, evidence, process.arch) });
    await writeFile(path.join(evidence, 'result.json'), JSON.stringify({ sourceCommit: fixture.targetCommit,
      platform: process.platform, architecture: process.arch, bundleBuild: build, image: verified,
      signatureAndTicket: trust, payloadMatchesTargetZip: true, welcomeSmokePassed: true, cleanInstallPassed: true,
      systemApplicationsUntouched: true, publicationApproved: false }, null, 2) + '\n');
  } finally {
    if (mounted) await run('/usr/bin/hdiutil', ['detach', mount]);
  }
  // Only the new isolated stage is removed, after the receipt was written.
  await rm(stage, { recursive: true });
  console.log(`Native ${process.arch} clean final-DMG installation verified`);
}
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main();
