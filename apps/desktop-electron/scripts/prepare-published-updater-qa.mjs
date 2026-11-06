import { execFile } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const repo = 'memory-pak-labs/gba-studio';
const github = `https://github.com/${repo}/releases`;
const releasePath = `/${repo}/releases`;
const version = '0.1.0-rc.5';
const targetVersion = '0.1.0-rc.6';

async function hashFile(file, algorithm, encoding) {
  const hash = createHash(algorithm);
  for await (const block of createReadStream(file)) hash.update(block);
  return hash.digest(encoding);
}

async function releaseMetadata(tag) {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/tags/v${tag}`);
  if (!response.ok) throw new Error(`GitHub release v${tag} returned ${response.status}`);
  const release = await response.json();
  if (release.draft || release.tag_name !== `v${tag}`) throw new Error(`Expected published v${tag}`);
  return release;
}

function assetFor(release, name) {
  const asset = release.assets.find(item => item.name === name && item.state === 'uploaded');
  const expectedUrl = `${github}/download/${release.tag_name}/${name}`;
  if (!asset || asset.browser_download_url !== expectedUrl || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)) {
    throw new Error(`Missing published asset with checksum: ${name}`);
  }
  return asset;
}

async function fetchPackage(asset, file) {
  await run('curl', ['-q', '--fail', '--location', '--retry', '3', '--output', file, asset.browser_download_url]);
  const sha256 = await hashFile(file, 'sha256', 'hex');
  if (`sha256:${sha256}` !== asset.digest || (await stat(file)).size !== asset.size) {
    throw new Error(`Published package failed verification: ${asset.name}`);
  }
  return { url: asset.name, size: asset.size, sha256, sha512: await hashFile(file, 'sha512', 'base64') };
}

async function prepare() {
  if (!process.env.GBA_UPDATER_QA_ROOT) throw new Error('QA root is required');
  const root = path.resolve(process.env.GBA_UPDATER_QA_ROOT);
  const platform = process.platform;
  const architecture = process.arch;
  const packageName = {
    'win32-x64': release => `GBA.Studio.Setup.${release}.exe`,
    'linux-x64': release => `GBA-Studio-${release}-linux-x86_64.AppImage`,
    'darwin-x64': release => `GBA-Studio-${release}-macOS-x64.zip`,
    'darwin-arm64': release => `GBA-Studio-${release}-macOS-arm64.zip`
  }[`${platform}-${architecture}`];
  if (!packageName) throw new Error(`Unsupported updater QA host: ${platform}-${architecture}`);
  await mkdir(root, { recursive: true });
  const [previous, candidate] = await Promise.all([releaseMetadata(version), releaseMetadata(targetVersion)]);
  const sourceAsset = assetFor(previous, packageName(version));
  const targetAsset = assetFor(candidate, packageName(targetVersion));
  const source = path.join(root, sourceAsset.name);
  const targetInstaller = path.join(root, targetAsset.name);
  const [sourceFile, targetFile] = await Promise.all([fetchPackage(sourceAsset, source), fetchPackage(targetAsset, targetInstaller)]);
  const targetFiles = [targetFile];
  if (platform === 'darwin') {
    // Use the same two-architecture feed that will be published if QA passes.
    const otherArch = architecture === 'arm64' ? 'x64' : 'arm64';
    const other = assetFor(candidate, `GBA-Studio-${targetVersion}-macOS-${otherArch}.zip`);
    targetFiles.push(await fetchPackage(other, path.join(root, other.name)));
    targetFiles.sort((a, b) => a.url.localeCompare(b.url));
  }
  const checks = ['Verified the exact published RC5 and RC6 package bytes'];
  let sourceExecutable;
  let targetBundleHashes;
  if (platform === 'win32') {
    const directory = path.join(root, 'installed');
    await run(source, ['/S', `/D=${directory}`]);
    sourceExecutable = path.join(directory, 'gba-studio.exe');
  } else if (platform === 'linux') {
    await chmod(source, 0o755);
    sourceExecutable = source;
  } else {
    const bundles = ['installed', 'reference'].map(folder => path.join(root, folder));
    for (const [index, archive] of [source, targetInstaller].entries()) {
      await run('/usr/bin/ditto', ['-x', '-k', archive, bundles[index]]);
      const app = path.join(bundles[index], 'gba-studio.app');
      await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
      await run('/usr/bin/xcrun', ['stapler', 'validate', app]);
    }
    sourceExecutable = path.join(bundles[0], 'gba-studio.app', 'Contents', 'MacOS', 'gba-studio');
    const contents = path.join(bundles[1], 'gba-studio.app', 'Contents');
    targetBundleHashes = await Promise.all(['MacOS/gba-studio', 'Resources/app.asar']
      .map(file => hashFile(path.join(contents, file), 'sha256', 'hex')));
    checks.push('Verified Developer ID signatures and notarization tickets for both macOS apps');
  }
  const atom = await fetch(`${github}.atom`);
  if (!atom.ok) throw new Error(`Published GitHub Atom feed returned ${atom.status}`);
  const xml = await atom.text();
  if (!xml.includes(`/tag/v${targetVersion}`)) throw new Error('Published RC6 absent from the GitHub Atom feed');
  await writeFile(path.join(root, 'github-releases.atom'), xml);
  await run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=github.com',
    '-addext', 'subjectAltName=DNS:github.com,DNS:api.github.com', '-keyout', 'qa-key.pem', '-out', 'qa-cert.pem'], { cwd: root });
  const fixture = { published: true, platform, architecture, version, targetVersion, sourceExecutable,
    sourceFile, targetFile, targetFiles, targetInstaller, targetBundleHashes, releaseDate: candidate.created_at, checks, port: 9758 };
  await writeFile(path.join(root, 'fixture.json'), JSON.stringify(fixture, null, 2));
}

export async function startPublishedUpdaterFixture(root, fixture, requests) {
  const [cert, key, atom] = await Promise.all(['qa-cert.pem', 'qa-key.pem', 'github-releases.atom']
    .map(file => readFile(path.join(root, file))));
  const spki = createHash('sha256').update(new X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
  const channel = { darwin: 'latest-mac.yml', linux: 'latest-linux.yml', win32: 'latest.yml' }[fixture.platform];
  const target = fixture.targetFile;
  const files = fixture.targetFiles.map(({ url, size, sha512 }) => ({ url, size, sha512 }));
  const feed = { version: fixture.targetVersion, files, path: files[0].url, sha512: files[0].sha512, releaseDate: fixture.releaseDate };
  const downloadPath = `${releasePath}/download/v${fixture.targetVersion}`;
  const server = createServer({ cert, key }, (req, res) => {
    const name = new URL(req.url, 'https://github.com').pathname;
    requests.push(name);
    if (name === `${releasePath}.atom`) return res.writeHead(200, { 'Content-Type': 'application/atom+xml' }).end(atom);
    if (name === `${downloadPath}/${channel}`) return res.writeHead(200, { 'Content-Type': 'application/yaml' }).end(JSON.stringify(feed));
    if (name === `${downloadPath}/${target.url}`) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': target.size });
      const stream = createReadStream(fixture.targetInstaller);
      stream.on('error', error => res.destroy(error));
      res.on('close', () => stream.destroy());
      stream.pipe(res);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(fixture.port, '127.0.0.1', resolve); });
  return {
    server, feed,
    args: ['--no-proxy-server', `--host-resolver-rules=MAP github.com 127.0.0.1:${fixture.port}, MAP api.github.com 127.0.0.1:${fixture.port}`,
      `--ignore-certificate-errors-spki-list=${spki}`]
  };
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await prepare();
