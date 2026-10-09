import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { promoteApprovedMarketModularComposition } from './promote-market-modular-composition.mjs';

describe('retired Mercado Suspenso modular composition', () => {
  it('refuses to restore an atlas absent from the current Exemplo GBA manifest', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'market-modular-promotion-'));
    const atlasSourcePath = path.join(root, 'market-atlas-candidate.png');
    const approvedSourcePath = path.join(root, 'market-modules-source.png');
    const templateProjectPath = path.join(root, 'template', 'exemplo-gba.gba-project');
    const fixtureProjectPath = path.join(root, 'fixture', 'exemplo-gba-visuals.gba-project');
    const project = { assets: [{ name: 'mercado-adventure-surface.png' }], scenes: [{ name: 'mercado_suspenso' }] };
    await Promise.all([
      mkdir(path.join(root, 'template', 'Assets', 'backgrounds'), { recursive: true }),
      mkdir(path.join(root, 'fixture', 'Assets', 'backgrounds'), { recursive: true })
    ]);
    await Promise.all([
      writeFile(atlasSourcePath, 'reviewed atlas'),
      writeFile(approvedSourcePath, 'approved source'),
      writeFile(templateProjectPath, JSON.stringify(project)),
      writeFile(fixtureProjectPath, JSON.stringify(project))
    ]);

    const beforeTemplate = await readFile(templateProjectPath, 'utf8');
    const beforeFixture = await readFile(fixtureProjectPath, 'utf8');

    await expect(promoteApprovedMarketModularComposition({
      approvedSourcePath,
      atlasSourcePath,
      fixtureProjectPath,
      templateProjectPath
    })).rejects.toThrow('Composição modular aposentada');

    expect(await readFile(templateProjectPath, 'utf8')).toBe(beforeTemplate);
    expect(await readFile(fixtureProjectPath, 'utf8')).toBe(beforeFixture);
    expect(existsSync(path.join(root, 'template', 'Assets', 'backgrounds', 'mercado-suspenso-modules-v5.png'))).toBe(false);
    expect(existsSync(path.join(root, 'fixture', 'Assets', 'backgrounds', 'mercado-suspenso-modules-v5.png'))).toBe(false);
  });
});
