import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { buildAssetcSpritePackGeneration } from '../shared/engineProjectExport.js';
import { buildEngineExportProjectContract } from './exportEngineProject.js';
function fixture() {
    const p = JSON.parse(readFileSync('default-assets/templates/exemplo-gba/exemplo-gba.gba-project', 'utf8'));
    for (const rooms of [p.rooms, p.scenas]) {
        const r = rooms.find((r: any) => r.name === 'arena_tatica');
        Object.assign(r, { width: 16, height: 16, cameraMode: 'follow_player', cameraBounds: { x: 0, y: 0, width: 768, height: 512 } });
        Object.assign(r.runtime.config, { worldMode: 'scrollable_tiled_world', tileWidth: 48, tileHeight: 24, originX: 384, originY: 68,
            pagedSurface: { backgroundAsset: 'arena-test-back.png', foregroundAsset: 'arena-test-front.png', width: 768, height: 512 } });
        delete r.runtime.config.tacticalPresentation.surfacePages;
        delete r.runtime.config.tacticalPresentation.surfaceResidency;
        r.runtime.config.tacticalPresentation.surfaceAsset = 'arena-test-back.png';
        r.tilemap = Array(256).fill(0);
        r.collisions = r.collisionTypes = Array(256).fill('free');
        r.heightLevels = Array(256).fill(0);
    }
    for (const name of ['arena-test-back.png', 'arena-test-front.png'])
        p.assets.push({ id: name, name, kind: 'Background', metadata: { source: 'Assets/backgrounds/' + name, kind: 'paged_bg', colorMode: '8bpp-indexed', width: 768, height: 512 } });
    return p;
}
describe('tactical paged surface', () => {
    it('keeps combat, units and cursor camera while streaming the world', () => {
        const p = fixture(), room = buildEngineExportProjectContract(p).isometric_project!.rooms.find(r => r.name === 'arena_tatica')!;
        expect(room.paged_surface).toMatchObject({ width: 768, height: 512 });
        expect(room.grid).toMatchObject({ gameplay_mode: 'tactical', movement_model: 'tile', tile_width_pixels: 48, tile_height_pixels: 24 });
        expect(room.tactical?.units).toHaveLength(2);
        expect(room.camera).toMatchObject({ position: { x: 168, y: 168 }, dead_zone: { x: 120, y: 80, width: 0, height: 0 } });
        expect(room.camera).toMatchObject({ follow_enabled: true, bounds: { width: 768, height: 512 } });
        expect(room.tactical_presentation?.surface_asset).toBeUndefined();
        expect(room.tactical_presentation?.audio).toBeDefined();
        expect(room.tactical_presentation?.compact_hud?.font).toBe('tactical_compact_font_8x8');
        expect(room.tactical_presentation?.units[0]).toMatchObject({ label: 'NARA', portrait: 'tactical_compact_nara_portrait' });
        expect(room.actors![0].screen_offset).toEqual({ x: -32, y: -50 });
        const pack = buildAssetcSpritePackGeneration(p)!;
        for (const asset of pack.packAssets.filter(a => a.name.startsWith('tactical_compact_') || /tactical_(cursor|range|target)_48x24/.test(a.name)))
            expect(asset.bank_groups).toEqual(['scene_arena_tatica']);
    });
});
