import { readFileSync } from 'node:fs';
const m = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/racing-approved-manifest.json', import.meta.url)));
const targets = new Set(m.scenes.map(s => s.name));
const upsert = (rows, entries) => [...rows.map(r => structuredClone(entries.find(e => e.id === r.id) ?? r)), ...structuredClone(entries.filter(e => !rows.some(r => r.id === e.id)))];
/** Integrates only the two explicitly approved racing presentations. */
export function promoteApprovedRacing(source) {
    if (!m.approval.approved || !m.approval.visual || !m.approval.palette || !m.approval.audio)
        throw Error('Racing requires visual, palette and audio approval.');
    const p = structuredClone(source), base = p.rooms?.find(r => r.name === 'circuito_final');
    if (!base)
        return p;
    p.assets = upsert(p.assets, m.assets);
    p.animations = upsert(p.animations, m.animations);
    p.animationStates = upsert(p.animationStates, m.animationStates);
    p.audioItems = upsert(p.audioItems, m.audioItems);
    p.settings.hudPresets = upsert(p.settings.hudPresets, [m.hud]);
    const updated = m.scenes.map((s, index) => {
        const r = p.rooms.find(r => r.name === s.name) ?? { ...base, id: 'room-' + s.name, name: s.name };
        const room = { ...r };
        // The approved entry script lives in eventBindings.onInit. Do not
        // resurrect the retired racing script through an inherited alias.
        delete room.onEnterEventName;
        const pseudo = s.presentation === 'pseudo3d';
        const config = { maxSpeed: 4, acceleration: 8, brakePower: 12, steeringSpeed: 2, presentation: s.presentation, lapsToWin: 3, checkpointsPerLap: 4, pickupsPerLap: 0,
            rivalSpeed: 105, roadCurve: 0, showMinimap: false, topdownTrack: { cameraDeadZoneX: 120, cameraDeadZoneY: 80, startHeading: 4, finishAtZero: true, pathPoints: s.pathPoints, checkpoints: s.checkpoints },
            actionSounds: { accelerate: 'corrida_motor', brake: 'corrida_freio', collision: 'corrida_impacto', checkpoint: 'corrida_checkpoint' },
            ...(pseudo ? { perspectiveCamera: { height: 48, distance: 64, focalLength: 96 }, pseudo3dVisuals: { horizonY: 48, panoramaBackgroundId: 'racing-approved-panorama.png', floorTilemapId: s.background, minimapAssetId: '' } } : {}) };
        return { ...room, name: s.name, displayName: s.displayName, gbStudioName: s.displayName, width: 64, height: 64, playerActorName: 'Player · Nara',
            backgroundAssetName: s.background, runtimeBaseBackgroundAssetName: s.background, runtimeCompositeBackgroundAssetName: s.background, backgroundRenderMode: 'tilemap', gbStudioUseBackgroundLayout: true,
            tilemap: Array.from({ length: 4096 }, (_, i) => pseudo ? i + 1 : 0), collisions: [...s.collisionTypes], collisionTypes: [...s.collisionTypes], heightLevels: Array(4096).fill(0), tileLayers: [], referenceImages: [],
            cameraMode: 'follow_player', cameraZoom: 100, cameraBounds: { x: 0, y: 0, width: 64, height: 64 }, cameraZones: [], hudPresetId: m.hud.id,
            music: m.audioItems[index].id, runtime: { type: 'racing', config }, eventBindings: { onInit: s.name + '_ao_entrar', onVictory: pseudo ? 'circuito_perspectiva_concluir' : 'circuito_concluir', onDefeat: s.name + '_reiniciar' },
            ...(pseudo ? { campaign: undefined, supportBriefing: { objective: 'Completar três voltas na Rota da Maré.', controls: 'A ou CIMA acelera; B ou BAIXO freia; ESQUERDA/DIREITA conduzem; R troca a pista.', success: 'Cruzar os quatro checkpoints em ordem por três voltas.', failureRecovery: 'A corrida reinicia sem alterar a progressão da campanha.' } } : {}), visualPromotionStatus: 'canonical-integrated', racingVisualRevision: m.revision };
    });
    for (const key of ['rooms', 'scenas', 'scenes'])
        if (Array.isArray(p[key]))
            p[key] = [...p[key].map(r => structuredClone(updated.find(s => s.name === r.name) ?? r)), ...structuredClone(updated.filter(r => !p[key].some(s => s.name === r.name)))];
    if (p.scena && targets.has(p.scena.name))
        p.scena = structuredClone(updated.find(r => r.name === p.scena.name));
    p.actors = [...p.actors.filter(a => !targets.has(a.roomName)), ...structuredClone(m.actors)];
    p.triggers = p.triggers.filter(t => !targets.has(t.roomName));
    const events = [];
    const add = (name, roomName, commands) => events.push({ id: 'event-' + name, name, roomName, category: 'Cena', command: 'noop', steps: commands.map((command, i) => ({ id: name + '-' + i, command, isEnabled: true })) });
    for (const [i, s] of m.scenes.entries()) {
        const other = m.scenes[1 - i];
        add(s.name + '_ao_entrar', s.name, ['play_music ' + m.audioItems[i].id, 'attach_button R ' + s.name + '_alternar false', ...Array.from({ length: 3 }, () => ['play_sfx corrida_contagem', 'wait 60']).flat(), 'play_sfx corrida_largada']);
        add(s.name + '_alternar', s.name, [`change_scene ${other.name} ${other.entry.x} ${other.entry.y} right`]);
        add(s.name + '_reiniciar', s.name, ['play_sfx corrida_impacto', 'wait 45', `change_scene ${s.name} ${s.entry.x} ${s.entry.y} right`]);
    }
    add('circuito_perspectiva_concluir', 'circuito_perspectiva', ['play_sfx corrida_chegada', 'wait 90', 'change_scene circuito_final 29 9 right']);
    // Preserve the campaign victory cue after the newly authored racing finish jingle.
    const finale = p.events.find(e => e.name === 'circuito_concluir');
    if (finale) {
        finale.steps = (finale.steps ?? []).filter(s => !s.id?.startsWith('racing-finish-'));
        const cue = finale.steps.find(s => s.command.startsWith('play_sfx '));
        if (cue)
            cue.command = 'play_sfx farol_sfx_vitoria';
        finale.steps.unshift({ id: 'racing-finish-jingle', command: 'play_sfx corrida_chegada', isEnabled: true }, { id: 'racing-finish-wait', command: 'wait 90', isEnabled: true });
    }
    const ids = new Set(events.map(e => e.name));
    p.events = [...p.events.filter(e => !ids.has(e.name)), ...events];
    for (const e of p.events)
        for (const step of e.steps ?? []) {
            const s = m.scenes.find(s => new RegExp('^change_scene ' + s.name + '(?:\\s|$)').test(step.command ?? ''));
            if (s)
                step.command = `change_scene ${s.name} ${s.entry.x} ${s.entry.y} right`;
        }
    for (const table of p.sceneRouteTables ?? [])
        for (const route of [...(table.routes ?? []), table.fallback].filter(Boolean)) {
            const s = m.scenes.find(s => s.name === route.scene);
            if (s)
                Object.assign(route, s.entry);
        }
    if (p.editorState?.scenaConnections) {
        for (const c of p.editorState.scenaConnections) {
            const s = m.scenes.find(s => s.name === c.to);
            if (s)
                c.entry = { ...c.entry, ...s.entry };
        }
        for (const s of m.scenes) {
            const other = m.scenes.find(o => o.name !== s.name);
            const id = 'connection-' + s.name + '-' + other.name;
            const existing = p.editorState.scenaConnections.find(c => c.id === id);
            if (existing)
                existing.transition = { style: 'fade', durationFrames: 20, fadeOut: true, fadeIn: true };
            if (!existing)
                p.editorState.scenaConnections.push({ id, from: s.name, to: other.name, entry: { ...other.entry }, transition: { style: 'fade', durationFrames: 20, fadeOut: true, fadeIn: true }, exit: { x: s.entry.x, y: s.entry.y, width: 1, height: 1 } });
        }
    }
    if (p.editorState?.sceneMapPositions) {
        const positions = p.editorState.sceneMapPositions;
        const bottom = Math.max(0, ...p.rooms.filter(r => !targets.has(r.name)).map(r => (positions[r.name]?.y ?? 0) + (Number(r.height) || 20) * 8));
        positions.circuito_final = { x: 0, y: bottom + 200 };
        positions.circuito_perspectiva = { x: 700, y: bottom + 200 };
    }
    return p;
}
