import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { integrateApprovedPlayerWalk } from './topdown-player-walk-project.mjs';
import { promoteExemploGBAVerticeCampaign } from './vertice-showcase-project.mjs';

const source = () => JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));
it('reapplies the four-phase walk without changing scenes, actors, collisions, HUD or idle poses', () => {
  const before = source(), copy = structuredClone(before);
  const after = integrateApprovedPlayerWalk(before);
  expect(before).toEqual(copy);
  for (const key of ['rooms', 'scenas', 'actors', 'events', 'settings', 'triggers', 'variables']) expect(after[key]).toEqual(before[key]);
  expect(integrateApprovedPlayerWalk(after)).toEqual(after);
  const regenerated = promoteExemploGBAVerticeCampaign(before);
  for (const a of before.animations.filter(a => a.spriteSheet === 'porto-nara-animations48.png')) {
    expect(after.animations.find(b => b.id === a.id)).toEqual(a);
    expect(regenerated.animations.find(b => b.id === a.id)).toEqual(a);
  }
});
