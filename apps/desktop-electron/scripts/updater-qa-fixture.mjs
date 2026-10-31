import { createRequire } from 'node:module';
import { cp, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');

/** NSIS restarts through the Windows shell, which does not inherit the test's environment. */
export function findWindowsUpdatedProcess(processes, executable) {
  const expected = path.win32.normalize(executable).toLowerCase();
  return processes.find((process) => process.ExecutablePath
    && path.win32.normalize(process.ExecutablePath).toLowerCase() === expected
    && /(?:^|\s)--updated(?:\s|$)/.test(process.CommandLine ?? ''))?.ProcessId ?? null;
}

/** AppImageTarget recreates these wrapper symlinks when repacking the extracted QA copy. */
export async function removeAppImageWrapperIcon(directory) {
  await rm(path.join(directory, '.DirIcon'), { force: true });
  await rm(path.join(directory, 'gba-studio.png'), { force: true });
}

/** Copy an installed application and change the copy's version for isolated QA. */
export async function copyAppWithQaVersion({ source, destination, version, workingDirectory }) {
  if (!/^\d+\.\d+\.\d+-rc\.\d+$/.test(version)) throw new Error('Invalid QA version');
  await cp(source, destination, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
  const archive = path.join(destination, 'resources', 'app.asar');
  const extracted = await mkdtemp(path.join(workingDirectory, 'qa-asar-'));
  try {
    asar.extractAll(archive, extracted);
    const packagePath = path.join(extracted, 'package.json');
    const metadata = JSON.parse(await readFile(packagePath, 'utf8'));
    metadata.version = version;
    await writeFile(packagePath, `${JSON.stringify(metadata, null, 2)}\n`);
    const replacement = `${archive}.qa`;
    await asar.createPackage(extracted, replacement);
    await rename(replacement, archive);
    asar.uncache(archive);
  } finally {
    await rm(extracted, { recursive: true, force: true });
  }
}
