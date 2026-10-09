import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { promoteExemploGBAVerticeCampaign } from './vertice-showcase-project.mjs';

const source = () => JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));
describe('approved platformer viewport composition', () => {
  it('materializes a 240x160 room without restoring the rejected expansion', () => {
    const p = promoteExemploGBAVerticeCampaign(source());
    for (const key of ['rooms', 'scenas']) {
      const s = p[key].find(s => s.name === 'penedos_vento');
      expect([s.width, s.height]).toEqual([30, 20]);
      expect(s.cameraMode).toBe('fixed_center');
      expect(s.tileLayers.map(l => l.mapping)).toEqual(['BG3', 'BG2']);
      expect(s.hudPresetId).toBeUndefined();
    }
    expect(p.actors.filter(a => a.roomName === 'penedos_vento')).toHaveLength(5);
    const assets = new Set(p.assets.map(a => a.name));
    for (const a of p.actors.filter(a => a.roomName === 'penedos_vento')) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThan(30);
      expect(a.y).toBeLessThan(20);
      expect(assets.has(a.spriteSheet)).toBe(true);
    }
    for (const s of p.events.flatMap(e => e.steps ?? [])) {
      if (s.command?.startsWith('change_scene penedos_vento '))
        expect(s.command).toBe('change_scene penedos_vento 6 11 right');
    }
  });
});
