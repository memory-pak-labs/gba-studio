import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { promoteApprovedPlatformer } from './platformer-approved-promotion.mjs';
import { buildEngineExportProjectContract } from '../src/main/exportEngineProject.js';
import { resolveGbaActorSprite, gbaActorSpriteRoomPlacementFromFrame } from '../src/shared/gbaRendering.js';
const root = new URL('../default-assets/templates/exemplo-gba/', import.meta.url);
const source = () => JSON.parse(readFileSync(new URL('exemplo-gba.gba-project', root)));
const manifest = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/platformer-approved-manifest.json', import.meta.url)));
describe('approved wide Penedos integration', () => {
    it('preserves approved pixels and all unrelated authoring while promoting idempotently', () => {
        const before = source(), snapshot = structuredClone(before), p = promoteApprovedPlatformer(before);
        expect(before).toEqual(snapshot);
        expect(promoteApprovedPlatformer(p)).toEqual(p);
        for (const k of ['rooms', 'scenas'])
            expect(p[k].filter(r => r.name !== manifest.scene)).toEqual(before[k].filter(r => r.name !== manifest.scene));
        for (const k of ['actors', 'triggers'])
            expect(p[k].filter(r => r.roomName !== manifest.scene)).toEqual(before[k].filter(r => r.roomName !== manifest.scene));
        expect(p.audioItems.filter(a => !manifest.audioItems.some(n => n.id === a.id) && !manifest.replacedAudioIDs.includes(a.id))).toEqual(before.audioItems.filter(a => !manifest.audioItems.some(n => n.id === a.id) && !manifest.replacedAudioIDs.includes(a.id)));
        expect(p.settings.hudPresets.filter(h => h.id !== manifest.hud.id)).toEqual(before.settings.hudPresets.filter(h => h.id !== manifest.hud.id));
        for (const asset of manifest.assets)
            expect(createHash('sha256').update(readFileSync(new URL(asset.metadata.source, root))).digest('hex')).toBe(asset.metadata.preparedSha256);
    });
    it('exports separate resident BG layers, a clamped larger camera, and all approved player clips', () => {
        const p = promoteApprovedPlatformer(source()), r = p.rooms.find(r => r.name === manifest.scene);
        expect([r.width, r.height, r.cameraMode, r.cameraZoom]).toEqual([120, 40, 'follow_player', 100]);
        expect(r.cameraBounds).toEqual({ x: 0, y: 0, width: 120, height: 40 });
        expect(r.collisionTypes).toHaveLength(4800);
        expect(r.runtime.config.cameraFollow).toBe(15);
        expect(r.tileLayers.map(l => l.mapping)).toEqual(['BG3', 'BG2']);
        expect(r.hudPresetId).toBe(manifest.hud.id);
        const c = buildEngineExportProjectContract(p), room = c.platformer_project.rooms.find(r => r.name === manifest.scene);
        expect([room.width_tiles, room.height_tiles, room.camera.follow_player]).toEqual([120, 40, true]);
        expect(room.background_layers[0].parallax).toEqual({ x: 0, y: 0 });
        expect(Object.keys(c.platformer_project.player.animations).sort()).toEqual(['idle', 'walk', 'jump', 'fall', 'climb', 'wall_slide', 'dash', 'glide', 'attack', 'hurt', 'land'].sort());
        expect(c.platformer_project.player.animations.attack.loops).toBe(false);
        for (const a of p.actors.filter(a => a.roomName === manifest.scene)) {
            const frame = resolveGbaActorSprite(p, a).frame;
            expect(frame.originX).toBe(a.originX);
            expect(frame.originY).toBe(a.originY);
            const place = gbaActorSpriteRoomPlacementFromFrame(a.x, a.y, frame);
            expect(place.leftTiles).toBe(a.x - a.originX / 8);
        }
        expect(p.actors.filter(a => a.roomName === manifest.scene)).toHaveLength(7);
    });
    it('keeps the new presentation through complete example regeneration and scene entries', async () => {
        const { promoteExemploGBAVerticeCampaign } = await import('./vertice-showcase-project.mjs');
        const p = promoteExemploGBAVerticeCampaign(promoteApprovedPlatformer(source()));
        expect(p.rooms.find(r => r.name === manifest.scene).backgroundAssetName).toBe('penedos-approved-terrain.png');
        expect(p.scenas.find(r => r.name === manifest.scene)).toEqual(p.rooms.find(r => r.name === manifest.scene));
        expect(p.actors.filter(a => a.roomName === manifest.scene)).toHaveLength(7);
        for (const e of p.events)
            for (const s of e.steps ?? [])
                if (s.command.startsWith('change_scene penedos_vento '))
                    expect(s.command).toBe('change_scene penedos_vento 11 32 right');
    });
});
