import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {promotePlatformerV8, PLATFORMER_V8_BG} from './promote-platformer-v8.mjs';
import {promotePlatformerV7} from './promote-platformer-v7.mjs';
describe('approved platformer v8 background', () => {
  it('preserves other scenes, events and actor art while aligning grid surfaces', () => {
    const p = promotePlatformerV7(JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url))));
    const n = promotePlatformerV8(p);
    expect(n.events).toEqual(p.events);
    expect(n.animations).toEqual(p.animations);
    expect(n.animationStates).toEqual(p.animationStates);
    expect(n.scenas.filter(s => s.name !== 'penedos_vento')).toEqual(p.scenas.filter(s => s.name !== 'penedos_vento'));
    expect(n.actors.filter(a => a.id !== 'penedos-rock')).toEqual(p.actors.filter(a => a.id !== 'penedos-rock'));
    const s = n.scenas.find(s => s.name === 'penedos_vento');
    expect(s.backgroundAssetName).toBe(PLATFORMER_V8_BG);
    expect(s.visualPromotionStatus).toBe('canonical-integrated');
    for (const layer of s.tileLayers) {
      const sources = layer.tileSourceAssetNames;
      if (Array.isArray(sources)) {
        expect(sources.every(name => name === PLATFORMER_V8_BG)).toBe(true);
      } else {
        expect(sources).toMatchObject({encoding:'rle-v1',length:161*20});
        expect(sources.runs.every(([name]) => name === PLATFORMER_V8_BG)).toBe(true);
      }
    }
    const names = new Set(n.actors.filter(a => a.roomName === 'penedos_vento').map(a => a.spriteSheet));
    names.add(PLATFORMER_V8_BG);
    expect(names.size).toBe(9);
    for (const name of names) expect(n.assets.find(a => a.name === name)?.metadata.candidateStatus).toBe('canonical-integrated');
    expect(n.assets.find(a => a.name === PLATFORMER_V8_BG).metadata.assetcStatus).toBe('attention');
    expect([s.width,s.height]).toEqual([161,20]);
    expect(s.collisionTypes[16*161+55]).toBe('solid');
    expect(s.collisionTypes[16*161+56]).toBe('free');
    expect(s.collisionTypes[12*161+84]).toBe('solid');
    expect(s.collisionTypes[6*161+137]).toBe('ladder');
    expect(promotePlatformerV8(n)).toEqual(n);
  });
});
