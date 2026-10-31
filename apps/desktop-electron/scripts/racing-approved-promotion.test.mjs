import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { promoteApprovedRacing } from './racing-approved-promotion.mjs';
import { buildEngineExportProjectContract } from '../src/main/exportEngineProject.js';
const source = () => JSON.parse(readFileSync('default-assets/templates/exemplo-gba/exemplo-gba.gba-project'));
const manifest = JSON.parse(readFileSync('fixtures/asset-provenance/racing-approved-manifest.json'));
const targets = new Set(['circuito_final', 'circuito_perspectiva']);
describe('approved two-view racing integration', () => {
    it('preserves every unrelated room/actor/trigger and approved file and is idempotent', () => {
        const before = source(), snapshot = structuredClone(before), p = promoteApprovedRacing(before);
        expect(before).toEqual(snapshot);
        expect(promoteApprovedRacing(p)).toEqual(p);
        for (const key of ['rooms', 'scenas'])
            expect(p[key].filter(r => !targets.has(r.name))).toEqual(before[key].filter(r => !targets.has(r.name)));
        for (const key of ['actors', 'triggers'])
            expect(p[key].filter(r => !targets.has(r.roomName))).toEqual(before[key].filter(r => !targets.has(r.roomName)));
        for (const a of manifest.assets)
            expect(createHash('sha256').update(readFileSync('default-assets/templates/exemplo-gba/' + a.metadata.source)).digest('hex')).toBe(a.metadata.preparedSha256);
    });
    it('exports the complete circuits, per-room players, ordered gates, distinct music and readable live HUD', () => {
        const p = promoteApprovedRacing(source()), c = buildEngineExportProjectContract(p);
        expect(c.racing_project.rooms).toHaveLength(2);
        const [top, rear] = c.racing_project.rooms;
        for (const r of [top, rear]) {
            expect([r.width_tiles, r.height_tiles]).toEqual([64, 64]);
            expect(r.topdown_track.finish_at_zero).toBe(true);
            expect(r.topdown_track.checkpoints).toHaveLength(4);
            expect(r.actors).toHaveLength(2);
            expect(Object.keys(r.action_sounds)).toHaveLength(4);
        }
        expect(top.player.idle_metasprite.asset).toContain('overhead_nara');
        expect(rear.player.idle_metasprite.asset).toContain('rear_nara');
        expect(rear.floor_tilemap).toHaveLength(4096);
        expect(new Set(rear.floor_tilemap).size).toBe(4096);
        expect(rear.config.rival_speed_x256_per_second).toBe(105 * 256);
        expect(rear.perspective_camera).toEqual({ height: 48, distance: 64, focal_length: 96 });
        for (const name of ['drive', 'steer_left', 'steer_right', 'brake', 'brake_left', 'brake_right', 'hurt'])
            expect(rear.player.animations[name]).toBeDefined();
        for (const direction of ['up', 'right', 'down', 'left'])
            expect(top.player.animations['drive_' + direction].frame_indices).toHaveLength(2);
        expect(top.player.animations.drive_up.frame_metasprites[0].parts[0]).toMatchObject({ x: -16, y: -16 });
        expect(rear.player.animations.drive.frame_metasprites[0].parts[0]).toMatchObject({ x: -32, y: -16 });
        const hud = c.racing_project.dialogue_ui.hud_layouts.find(h => h.id === 'hud-porto-corrida');
        expect(hud.components.filter(h => h.kind === 'text').map(h => [h.x, h.y, h.width, h.text_advance])).toEqual([[10, 7, 49, 7], [95, 7, 49, 7], [180, 7, 49, 7], [180, 145, 49, 7]]);
    });
    it('survives canonical regeneration without restoring the former track', async () => {
        const { promoteExemploGBAVerticeCampaign } = await import('./vertice-showcase-project.mjs');
        const p = promoteExemploGBAVerticeCampaign(promoteApprovedRacing(source()));
        expect(p.rooms.filter(r => targets.has(r.name))).toHaveLength(2);
        expect(p.rooms.find(r => r.name === 'circuito_final').backgroundAssetName).toBe('racing-approved-topdown.png');
    });
});
