import { readFileSync } from 'node:fs';
import { fitProjectSpriteFrames } from './lib/sprite-canvas-audit.mjs';
const manifest = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/tactical-arena-manifest.json', import.meta.url)));
const upsert = (rows, items) => { const ids = new Set(items.map(x => x.id)); return [...rows.filter(x => !ids.has(x.id)), ...structuredClone(items)]; };
/** Promote only the approved Arena presentation and geometry; preserve combat and campaign. */
export function promoteApprovedTacticalArena(source) {
    if (!manifest.approval.approved || !manifest.approval.visual || !manifest.approval.palette)
        throw Error('Tactical arena requires explicit visual and palette approval.');
    const p = structuredClone(source), l = manifest.layout;
    const additions = manifest.assets.map(({ sha256, ...asset }) => asset);
    const newIDs = new Set(additions.map(a => a.id));
    const assets = p.assets.filter(a => !newIDs.has(a.id));
    const beforePlatformer = assets.findIndex(a => a.id.startsWith('penedos-v7-'));
    assets.splice(beforePlatformer < 0 ? assets.length : beforePlatformer, 0, ...structuredClone(additions));
    p.assets = assets;
    p.animations = upsert(p.animations, fitProjectSpriteFrames({ animations: manifest.animations }).animations);
    p.animationStates = upsert(p.animationStates, manifest.animationStates);
    p.actors = upsert(p.actors, manifest.actors);
    const update = r => {
        if (r.name !== manifest.scene)
            return r;
        const config = structuredClone(r.runtime.config), t = config.tacticalPresentation;
        Object.assign(config, { tileWidth: 48, tileHeight: 24, originX: 384, originY: 68, heightStep: 8, presentationZoom: 100,
            worldMode: 'scrollable_tiled_world', movement: 'tile', gameplayMode: 'tactical',
            pagedSurface: { backgroundAsset: l.background, foregroundAsset: l.foreground, width: 768, height: 512 } });
        delete t.surfacePages;
        delete t.surfaceResidency;
        delete t.hudLayout;
        t.surfaceAsset = l.background;
        t.compactHud = structuredClone(l.compactHud);
        t.units = t.units.map(u => { const role = u.actorId === 'tactical-nara' ? 'nara' : 'sentinel'; return { ...u, animations: Object.fromEntries(Object.keys(u.animations).map(key => [key, key.replace(/^move_/, 'walk_')])), sheet: `tactical-approved-${role}-64x64.png`, portrait: `tactical-compact-${role}-portrait.png`, label: role === 'nara' ? 'NARA' : 'SENTINELA' }; });
        t.cursorAsset = 'tactical-cursor-48x24.png';
        t.rangeAsset = 'tactical-range-48x24.png';
        t.targetAsset = 'tactical-target-48x24.png';
        t.emotesAsset = t.cursorAsset;
        t.feedbackAsset = t.cursorAsset;
        t.assets = [...t.assets.filter(a => a.consumer === 'audio'), ...manifest.assets.map(a => ({ id: a.id, path: a.name, consumer: a.kind === 'Background' ? 'bg' : 'obj', required: true, status: 'approved' }))];
        return { ...r, showcase: { ...r.showcase, access: 'market-guard' }, width: 16, height: 16, backgroundAssetName: l.background, tilesetAssetName: l.background, backgroundRenderMode: 'tilemap', gbStudioUseBackgroundLayout: true,
            cameraMode: 'follow_player', cameraZoom: 100, cameraBounds: { x: 0, y: 0, width: 768, height: 512 }, tilemap: Array(256).fill(0), tileLayers: [],
            collisions: [...l.collisionTypes], collisionTypes: [...l.collisionTypes], heightLevels: [...l.heightLevels], rampFlags: [...l.rampFlags], runtime: { ...r.runtime, config } };
    };
    for (const k of ['rooms', 'scenas'])
        p[k] = p[k].map(update);
    if (p.scena)
        p.scena = update(p.scena);
    for (const a of p.assets)
        if (manifest.retainedAssets.includes(a.name))
            a.metadata = { ...a.metadata, reusableLibraryAsset: true };
    for (const e of p.events)
        for (const s of e.steps ?? [])
            if (s.command.startsWith('change_scene arena_tatica '))
                s.command = 'change_scene arena_tatica 5 9 down';
    for (const c of p.editorState?.scenaConnections ?? [])
        if (c.to === 'arena_tatica')
            c.entry = { x: 5, y: 9, width: 1, height: 1 };
    const positions = p.editorState?.sceneMapPositions;
    if (positions)
        positions.arena_tatica = { x: 36, y: Math.max(0, ...Object.entries(positions).filter(([name]) => name !== manifest.scene).map(([, pos]) => pos.y)) + 800 };
    return p;
}
