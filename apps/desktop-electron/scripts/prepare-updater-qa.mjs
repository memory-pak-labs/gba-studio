import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { chmod, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyAppWithQaVersion, removeAppImageWrapperIcon } from './updater-qa-fixture.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const root = path.resolve(process.env.GBA_UPDATER_QA_ROOT ?? '');
const input = path.resolve(process.env.GBA_UPDATER_QA_ARTIFACTS ?? '');
const port = Number(process.env.GBA_UPDATER_QA_HTTP_PORT ?? 9758);
const platform = process.platform;
if (!process.env.GBA_UPDATER_QA_ROOT || !process.env.GBA_UPDATER_QA_ARTIFACTS || !['win32', 'linux'].includes(platform)) {
  throw new Error('QA root, artifact directory and supported platform are required');
}
const version = '0.1.0-rc.5';
const targetVersion = '0.1.0-rc.6'; // Fictional version; only the isolated local feed serves it.
const builder = path.join(appRoot, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');

async function run(executable, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: options.cwd ?? appRoot, env: { ...process.env, ...options.env }, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${path.basename(executable)} failed (${code ?? signal})`)));
  });
}
async function findUnique(directory, suffix) {
  const matches = [];
  async function walk(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) await walk(full);
      else if (item.isFile() && item.name.endsWith(suffix)) matches.push(full);
    }
  }
  await walk(directory);
  if (matches.length !== 1) throw new Error(`Expected one ${suffix} artifact, found ${matches.length}`);
  return matches[0];
}
async function buildFromPrepackaged(source, qaVersion, output) {
  const pkg = JSON.parse(await readFile(path.join(appRoot, 'package.json'), 'utf8'));
  const config = structuredClone(pkg.build);
  delete config.afterPack;
  config.publish = [{ provider: 'generic', url: `http://127.0.0.1:${port}` }];
  config.extraMetadata = { ...config.extraMetadata, version: qaVersion };
  config.directories = { ...config.directories, output };
  if (platform === 'win32') config.win.artifactName = 'qa-update-${version}.${ext}';
  else config.linux.artifactName = 'qa-update-${version}-${arch}.${ext}';
  const configPath = path.join(root, `builder-${qaVersion}.json`);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const target = platform === 'win32' ? ['--win', 'nsis'] : ['--linux', 'AppImage'];
  await run(process.execPath, [builder, ...target, '--x64', '--prepackaged', source, '--config', configPath, '--publish', 'never'], {
    env: { CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
  });
  return findUnique(output, platform === 'win32' ? '.exe' : '.AppImage');
}

await mkdir(root, { recursive: true });
let source;
if (platform === 'win32') {
  const installer = await findUnique(input, '.exe');
  source = path.join(root, 'installed');
  await run(installer, ['/S', `/D=${source}`]);
} else {
  const appImage = await findUnique(input, '.AppImage');
  await chmod(appImage, 0o755);
  await run(appImage, ['--appimage-extract'], { cwd: root });
  source = path.join(root, 'squashfs-root');
  await removeAppImageWrapperIcon(source);
}
const archive = path.join(source, 'resources', 'app.asar');
const metadata = JSON.parse(asar.extractFile(archive, 'package.json').toString());
if (metadata.version !== version) throw new Error(`Expected installed ${version}, got ${metadata.version}`);
const target = path.join(root, 'target-prepackaged');
await copyAppWithQaVersion({ source, destination: target, version: targetVersion, workingDirectory: root });
const config = `provider: generic\nurl: http://127.0.0.1:${port}\nupdaterCacheDirName: gba-studio-update-qa\n`;
await writeFile(path.join(source, 'resources', 'app-update.yml'), config);
await writeFile(path.join(target, 'resources', 'app-update.yml'), config);
const sourceExecutable = platform === 'win32'
  ? path.join(source, 'gba-studio.exe')
  : await buildFromPrepackaged(source, version, path.join(root, 'source-image'));
const targetInstaller = await buildFromPrepackaged(target, targetVersion, path.join(root, 'target-installer'));
if (platform === 'linux') await chmod(sourceExecutable, 0o755);
await copyFile(targetInstaller, path.join(root, `target${platform === 'win32' ? '.exe' : '.AppImage'}`));
await writeFile(path.join(root, 'fixture.json'), `${JSON.stringify({ platform, version, targetVersion, sourceExecutable, targetInstaller: path.join(root, `target${platform === 'win32' ? '.exe' : '.AppImage'}`), port }, null, 2)}\n`);
console.log(`Installed updater QA fixture ready: ${platform} ${version} -> ${targetVersion}`);
