import { readFileSync } from 'node:fs';
const m = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/platformer-approved-manifest.json', import.meta.url)));
const name = m.scene;
const upsert = (rows, entries) => { const byID = new Map(entries.map(e => [e.id, e])); return [...rows.map(r => structuredClone(byID.get(r.id) ?? r)), ...structuredClone(entries.filter(e => !rows.some(r => r.id === e.id)))]; };
const event = (name, commands) => ({ id: 'event-' + name, name, roomName: m.scene, category: 'Cena', command: 'noop', steps: commands.map((command, i) => ({ id: name + '-' + i, command, isEnabled: true })) });
/** Promote only the explicitly reviewed wide platformer presentation and its authored events. */
export function promoteApprovedPlatformer(source) {
    if (!m.approval.approved || !m.approval.visual || !m.approval.palette || !m.approval.audio)
        throw Error('Platformer requires visual, palette and audio approval.');
    const p = structuredClone(source);
    if (!p.rooms?.some(r => r.name === name))
        return p;
    if (p.editorState?.sceneMapPositions)
        p.editorState.sceneMapPositions[name] = structuredClone(m.editorPosition);
    p.assets = upsert(p.assets, m.assets);
    p.animations = upsert(p.animations, m.animations);
    p.animationStates = upsert(p.animationStates, m.animationStates);
    p.audioItems = upsert(p.audioItems.filter(a => !m.replacedAudioIDs.includes(a.id)), m.audioItems);
    p.settings.hudPresets = upsert(p.settings.hudPresets, [m.hud]);
    const update = r => r.name !== name ? r : { ...r, width: 120, height: 40, backgroundAssetName: 'penedos-approved-terrain.png',
        runtimeBaseBackgroundAssetName: 'penedos-approved-terrain.png', runtimeCompositeBackgroundAssetName: 'penedos-approved-terrain.png', backgroundRenderMode: 'tilemap', gbStudioUseBackgroundLayout: true,
        cameraMode: 'follow_player', cameraBounds: { x: 0, y: 0, width: 120, height: 40 }, cameraZoom: 100,
        cameraPosition: structuredClone(m.cameraPosition),
        cameraZones: [structuredClone(m.cameraZone)],
        tilemap: Array(4800).fill(0), collisionTypes: [...m.collisionTypes], collisions: [...m.collisionTypes],
        tileLayers: [['BG3', 'penedos-approved-sky.png'], ['BG2', 'penedos-approved-terrain.png']].map(([mapping, asset]) => ({ mapping, tilemap: Array(4800).fill(0), tileSourceAssetNames: Array(4800).fill(asset) })),
        parallax: { mode: 'bg3', speedX: 0, speedY: 0, offsetX: 0, offsetY: 0 }, hudPresetId: m.hud.id, music: m.audioItems[0].id,
        runtime: { ...r.runtime, type: 'platformer', config: { ...r.runtime.config, cameraFollow: 3, cameraDeadzoneX: 24, profile: m.revision } },
        eventBindings: { ...r.eventBindings, onInit: 'penedos_ao_entrar', onHitGroup1: 'penedos_teste_contato_inimigo' },
        referenceImages: [], platformerVisualRevision: m.visualRevision ?? m.revision, visualPromotionStatus: 'canonical-integrated' };
    for (const key of ['rooms', 'scenas', 'scenes'])
        if (Array.isArray(p[key]))
            p[key] = p[key].map(update);
    if (p.scena)
        p.scena = update(p.scena);
    const actors = structuredClone(m.actors), enemies = actors.filter(a => a.collisionGroup === 1), events = [];
    const add = (n, c) => { events.push(event(n, c)); return n; };
    const callback = (n, sfx) => add('penedos_player_' + n, ['play_sfx penedos_' + sfx + '_candidato']);
    const jump = callback('jump', 'salto'), ground = callback('ground', 'pouso'), dash = callback('dash', 'impulso');
    const enter = ['play_music ' + m.audioItems[0].id, 'call_event aplicar_perfil_jogador', 'if_variable penedos_player_health 0', 'set_variable penedos_player_health 3', 'condition_end',
        `attach_platform_callback jumpStart ${jump}`, `attach_platform_callback groundStart ${ground}`, `attach_platform_callback dashStart ${dash}`, 'attach_button L penedos_player_attack false'];
    add('penedos_ao_entrar', enter);
    const health = ['add_variable penedos_player_health -1', 'if_variable penedos_player_health 0', 'set_variable penedos_player_health 3', 'condition_end'];
    const respawn = ['play_sfx penedos_impacto_candidato', ...health, 'set_platformer_state knockback', 'if_variable var_penedos_farol 1', `set_actor_position player ${m.respawn.x} ${m.respawn.y}`, 'else', `set_actor_position player ${m.entry.x} ${m.entry.y}`, 'condition_end'];
    add('penedos_teste_queda', respawn);
    add('penedos_teste_contato_inimigo', ['rate_limit 45 30', ...respawn, 'rate_limit_end']);
    const attack = ['play_sfx penedos_impulso_candidato'];
    for (const a of enemies) {
        const suffix = a.id.replace('penedos-', ''), flag = 'penedos_defeated_' + suffix.replaceAll('-', '_'), moth = suffix.startsWith('moth'), min = a.x - 2, max = a.x + 2;
        a.eventBindings.onInit = add(`penedos_${suffix}_iniciar`, [`if_variable ${flag} 2`, `set_actor_visible ${a.id} false`, `set_actor_active ${a.id} false`, 'else', `set_actor_collision_box ${a.id} -8 ${moth ? -8 : -16} 16 16`, `set_actor_animation ${a.id} idle_right`, 'condition_end']);
        a.eventBindings.onUpdate = add(`penedos_${suffix}_patrulhar`, [`if_variable ${flag} 1`, `set_actor_animation ${a.id} hurt_right`, 'wait 12', `set_actor_visible ${a.id} false`, `set_actor_active ${a.id} false`, `set_variable ${flag} 2`, 'play_sfx penedos_item_candidato', 'else',
            `if_actor_at_position ${a.id} ${max} ${a.y}`, `set_actor_direction ${a.id} left`, 'condition_end', `if_actor_at_position ${a.id} ${min} ${a.y}`, `set_actor_direction ${a.id} right`, 'condition_end',
            `if_actor_direction ${a.id} right`, `move_actor_relative ${a.id} 0.125 0`, 'else', `move_actor_relative ${a.id} -0.125 0`, 'condition_end', 'wait 1', 'condition_end']);
        const hit = [`set_variable ${flag} 1`, `set_actor_collision_enabled ${a.id} false`, `set_actor_animation ${a.id} hurt_right`, 'add_variable penedos_tokens 1', 'play_sfx penedos_impacto_candidato'];
        attack.push(`if_variable ${flag} 0`, `if_actor_distance ${a.id} player 4`, 'if_actor_direction player right', `if_actor_relative ${a.id} player right`, ...hit, 'condition_end', 'else', `if_actor_relative ${a.id} player left`, ...hit, 'condition_end', 'condition_end', 'condition_end', 'condition_end');
    }
    add('penedos_player_attack', attack);
    const worker = actors.find(a => a.id === 'penedos-npc');
    worker.eventBindings = { onInit: add('penedos_teste_npc_iniciar', ['set_actor_collision_box penedos-npc -8 -16 16 16', 'set_actor_collision_enabled penedos-npc false', 'set_actor_animation penedos-npc idle_right']),
        onInteract: add('penedos_teste_npc_interagir', ['set_actor_animation penedos-npc talk_right', 'play_sfx farol_sfx_dialogo', 'show_dialogue penedos_teste_npc_fala', 'set_actor_animation penedos-npc idle_right']) };
    const checkpoint = actors.find(a => a.id === 'penedos-checkpoint');
    checkpoint.eventBindings = { onInit: add('penedos_teste_checkpoint_iniciar', ['set_actor_collision_box penedos-checkpoint -8 -24 16 24', 'set_actor_collision_enabled penedos-checkpoint false', 'if_variable var_penedos_farol 1', 'set_actor_animation penedos-checkpoint active_right', 'else', 'set_actor_animation penedos-checkpoint idle_right', 'condition_end']),
        onInteract: add('penedos_teste_checkpoint_interagir', ['if_variable var_penedos_farol 0', 'add_variable penedos_tokens 1', 'condition_end', 'set_variable var_penedos_farol 1', 'set_actor_animation penedos-checkpoint active_right', 'play_sfx penedos_checkpoint_candidato', 'save_game 0', 'show_dialogue penedos_teste_checkpoint_fala']) };
    const exit = ['set_variable var_grip 1', 'play_sfx penedos_item_candidato', 'save_game 0', 'advance_campaign'];
    add('penedos_recolher_aderencia', exit);
    add('penedos_retornar_armazem', exit);
    p.actors = [...p.actors.filter(a => a.roomName !== name), ...actors, ...p.actors.filter(a=>a.roomName===name&&a.id?.startsWith('coast-'))];
    p.events = [...p.events.filter(e => e.roomName !== name), ...events, ...p.events.filter(e=>e.roomName===name&&e.name?.startsWith('coast_'))];
    const variables = [['penedos_player_health', 3], ['penedos_tokens', 0], ...enemies.map(a => ['penedos_defeated_' + a.id.replace('penedos-', '').replaceAll('-', '_'), 0]), ['var_penedos_farol',0]].map(([name, initialValue]) => ({ id: 'variable-' + name, name, displayName: name, initialValue }));
    for (const v of variables)
        if (!p.variables.some(x => x.name === v.name))
            p.variables.push(v);
    const text = { penedos_teste_npc_fala: 'A salta; A no ar dá outro salto. B dá impulso, R plana e CIMA sobe escadas. Use L para golpear e A perto do farol para salvar.', penedos_teste_checkpoint_fala: 'Sinal aceso. Progresso salvo! Você retorna aqui se cair ou tocar em um inimigo.' };
    for (const d of p.dialogues)
        if (text[d.key]) {
            d.text = text[d.key];
            d.translations = { ...d.translations, 'pt-BR': d.text };
            d.translationStatus = { ...d.translationStatus, 'pt-BR': 'approved' };
        }
    p.triggers = [...p.triggers.filter(t => t.roomName !== name), { id: 'trigger-penedos-grip-module', name: 'Módulo de aderência · saída', roomName: name, ...m.exit, eventBindings: { onEnter: 'penedos_recolher_aderencia' } },
        ...m.fallZones.map((area, i) => ({ id: `trigger-penedos-fall-${i + 1}`, name: `Queda no vão ${i + 1}`, roomName: name, ...area, eventBindings: { onEnter: 'penedos_teste_queda' } }))];
    for (const e of p.events)
        for (const s of e.steps ?? [])
            if (/^change_scene penedos_vento(?:\s|$)/.test(s.command ?? ''))
                s.command = `change_scene penedos_vento ${m.entry.x} ${m.entry.y} ${m.entry.direction}`;
    for (const table of p.sceneRouteTables ?? [])
        for (const route of [...(table.routes ?? []), table.fallback].filter(Boolean))
            if (route.scene === name)
                Object.assign(route, m.entry);
    for (const connection of p.editorState?.scenaConnections ?? []) {
        if (connection.to === name)
            Object.assign(connection.entry, m.entry);
        if (connection.from === name)
            connection.exit = { ...m.exit };
    }
    return p;
}
