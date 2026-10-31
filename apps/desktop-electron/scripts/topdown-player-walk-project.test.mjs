import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { integrateApprovedPlayerWalk } from './topdown-player-walk-project.mjs';
import { promoteExemploGBAVerticeCampaign } from './vertice-showcase-project.mjs';

const source = () => JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));
it('continues to normalize the legacy sheet when it is present', () => {
  const sheet = 'porto-nara-animations48.png';
  const project = { assets: [{ name: sheet, metadata: {} }], animations: [{
    spriteSheet: sheet, state: 'walk', direction: 'down', frames: Array.from({length: 4}, () => ({tiles: [{tileHeight: 32}]}))
  }] };
  const result = integrateApprovedPlayerWalk(project);
  expect(result.animations[0]).toMatchObject({fps: 15, frameCount: 4});
  expect(result.animations[0].frames.map(frame => frame.sourceFrameIndex)).toEqual([1, 2, 3, 4]);
  expect(result.assets[0].metadata.preparedSha256).toBeTruthy();
  expect(project.assets[0].metadata).toEqual({});
});
it('reapplies the four-phase walk without changing scenes, actors, collisions, HUD or idle poses', () => {
  const before = source(), copy = structuredClone(before);
  expect(before.assets.some(a => a.name === 'nara-topdown-walk-run-v1.png')).toBe(true);
  const after = integrateApprovedPlayerWalk(before);
  expect(before).toEqual(copy);
  for (const key of ['rooms', 'scenas', 'actors', 'events', 'settings', 'triggers', 'variables']) expect(after[key]).toEqual(before[key]);
  expect(integrateApprovedPlayerWalk(after)).toEqual(after);
  const regenerated = promoteExemploGBAVerticeCampaign(before);
  for (const a of before.animations.filter(a => a.spriteSheet === 'nara-topdown-walk-run-v1.png')) {
    expect(after.animations.find(b => b.id === a.id)).toEqual(a);
    expect(regenerated.animations.find(b => b.id === a.id)).toEqual(a);
  }
});
