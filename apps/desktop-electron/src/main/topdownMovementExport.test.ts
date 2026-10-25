import { expect, it } from 'vitest';
import { createBlankProjectData } from '../shared/newProject.js';
import { buildEngineExportProjectContract } from './exportEngineProject.js';

it.each([true, false])('exports the authored topdown diagonal setting (%s)', allowDiagonal => {
  const p = createBlankProjectData({ name: 'Movement regression', sceneType: 'topdown' });
  (p.settings as Record<string, unknown>).topdown = { walkSpeed: 1, allowDiagonal };
  expect(buildEngineExportProjectContract(p).topdown_project!.player).toHaveProperty('allow_diagonal', allowDiagonal);
});
