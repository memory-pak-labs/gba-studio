import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { promoteApprovedTacticalArena } from './tactical-arena-promotion.mjs';
const root = new URL('../default-assets/templates/exemplo-gba/', import.meta.url);
const read = () => JSON.parse(readFileSync(new URL('exemplo-gba.gba-project', root)));
const m = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/tactical-arena-manifest.json', import.meta.url)));
describe('approved tactical Arena', () => {
    it('promotes the reviewed bytes and retains all other scenes, actors, music and combat rules', () => {
        const p = read(), out = promoteApprovedTacticalArena(p);
        expect(promoteApprovedTacticalArena(out)).toEqual(out);
        for (const k of ['rooms', 'scenas'])
            expect(out[k].filter(x => x.name !== 'arena_tatica')).toEqual(p[k].filter(x => x.name !== 'arena_tatica'));
        expect(out.audioItems).toEqual(p.audioItems);
        expect(out.actors.filter(x => !x.id.startsWith('tactical-'))).toEqual(p.actors.filter(x => !x.id.startsWith('tactical-')));
        expect(out.rooms.find(x => x.name === 'arena_tatica').runtime.config.tactical).toEqual(p.rooms.find(x => x.name === 'arena_tatica').runtime.config.tactical);
        expect(out.settings).toEqual(p.settings);
        for (const a of m.assets)
            expect(createHash('sha256').update(readFileSync(new URL(a.metadata.source, root))).digest('hex')).toBe(a.sha256);
    });
});
