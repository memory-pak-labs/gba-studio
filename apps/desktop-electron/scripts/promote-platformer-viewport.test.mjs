import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { promoteExemploGBAVerticeCampaign } from './vertice-showcase-project.mjs';

const source = () => JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));
describe('approved wide platformer composition', () => {
  it('materializes the approved 960x320 world with a following viewport', () => {
    const p = promoteExemploGBAVerticeCampaign(source());
    for (const key of ['rooms', 'scenas']) {
      const s = p[key].find(s => s.name === 'penedos_vento');
      expect([s.width, s.height]).toEqual([120, 40]);
      expect(s.cameraMode).toBe('follow_player');
      expect(s.tileLayers.map(l => l.mapping)).toEqual(['BG3', 'BG2']);
      expect(s.hudPresetId).toBe('hud-penedos-approved');
      expect(s.cameraBounds).toEqual({x:0,y:0,width:120,height:40});
    }
    expect(p.actors.filter(a => a.roomName === 'penedos_vento')).toHaveLength(7);
    const assets = new Set(p.assets.map(a => a.name));
    for (const a of p.actors.filter(a => a.roomName === 'penedos_vento')) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThan(120);
      expect(a.y).toBeLessThan(40);
      expect(assets.has(a.spriteSheet)).toBe(true);
    }
    for (const s of p.events.flatMap(e => e.steps ?? [])) {
      if (s.command?.startsWith('change_scene penedos_vento '))
        expect(s.command).toBe('change_scene penedos_vento 8 34 right');
    }
  });
});
