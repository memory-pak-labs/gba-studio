import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyAppWithQaVersion, removeAppImageWrapperIcon } from './updater-qa-fixture.mjs';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');

describe('updater QA fixture', () => {
  it('removes only the extracted AppImage wrapper icons before repacking', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gba-appimage-fixture-'));
    try {
      await writeFile(path.join(root, '.DirIcon'), 'wrapper');
      await writeFile(path.join(root, 'gba-studio.png'), 'wrapper');
      await writeFile(path.join(root, 'AppRun'), 'launcher');
      await removeAppImageWrapperIcon(root);
      await expect(readFile(path.join(root, '.DirIcon'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(path.join(root, 'gba-studio.png'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(path.join(root, 'AppRun'), 'utf8')).toBe('launcher');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('changes only the copied application version and leaves the installed source intact', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gba-updater-fixture-'));
    try {
      const source = path.join(root, 'source');
      const data = path.join(root, 'data');
      const destination = path.join(root, 'target');
      await mkdir(path.join(source, 'resources'), { recursive: true });
      await mkdir(data);
      await writeFile(path.join(data, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.1.0-rc.5' }));
      await writeFile(path.join(data, 'main.js'), 'original');
      await asar.createPackage(data, path.join(source, 'resources', 'app.asar'));
      await writeFile(path.join(source, 'resources', 'keep.txt'), 'safe');
      const before = await readFile(path.join(source, 'resources', 'app.asar'));
      await copyAppWithQaVersion({ source, destination, version: '0.1.0-rc.6', workingDirectory: root });
      expect(await readFile(path.join(source, 'resources', 'app.asar'))).toEqual(before);
      const pkg = JSON.parse(asar.extractFile(path.join(destination, 'resources', 'app.asar'), 'package.json').toString());
      expect(pkg.version).toBe('0.1.0-rc.6');
      expect(asar.extractFile(path.join(destination, 'resources', 'app.asar'), 'main.js').toString()).toBe('original');
      expect(await readFile(path.join(destination, 'resources', 'keep.txt'), 'utf8')).toBe('safe');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
