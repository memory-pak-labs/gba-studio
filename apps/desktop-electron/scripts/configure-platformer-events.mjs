import { promotePlatformerViewport } from './promote-platformer-viewport.mjs';

// Event authoring only: keep the approved scene geometry and PNGs intact.
export function configurePlatformerEvents(project) {
  if ((project.scenas ?? project.rooms ?? []).some(s => s.name === 'penedos_vento' && s.platformerVisualRevision === 'v13-approved-viewport')) return promotePlatformerViewport(project);
  const next = structuredClone(project);
  if (!next.scenas?.some(s => s.name === 'penedos_vento')) return next;
  // The approved wide scene replaced the former 80-tile map. Keep its exit at the edge.
  for (const connection of next.editorState?.scenaConnections ?? []) {
    if (connection.from === 'penedos_vento' && connection.eventName === 'penedos_retornar_armazem') {
      connection.exit = { ...connection.exit, x: 158 };
    }
  }
  const events = [];
  const event = (suffix, title, commands) => {
    const name = `penedos_teste_${suffix}`;
    events.push({ id: `event-${name}`, name, roomName: 'penedos_vento', category: 'Ator',
      detail: title, command: 'noop', steps: [`group ${title}`, ...commands].map((command, i) => ({
        id: `${name}-${i}`, command, isEnabled: true
      })) });
    return name;
  };
  const actor = kind => next.actors.find(a => a.id === `penedos-${kind}`);
  const patrols = [ ['crab', 41, 49, 15, 1], ['moth', 93, 101, 9, 1],
    ['slime', 66, 74, 15, 2], ['rock', 82, 87, 11, 3] ];
  for (const [kind, minX, maxX, y, wait] of patrols) {
    const a = actor(kind), ref = a.id;
    a.y = y;
    a.collisionGroup = 1;
    const idle = next.animations.find(an => an.id === `penedos-v7-${kind}-idle`);
    const attack = next.animations.find(an => an.id === `penedos-v7-${kind}-attack`);
    const id = `penedos-v7-${kind}-patrol`;
    const animation = { ...structuredClone(idle), id, name: 'patrol_right', state: 'walk',
      fps: kind === 'moth' ? 8 : 4, loops: true, frameCount: 2,
      frames: [idle.frames[0], attack.frames[0]].map((f, i) => ({ ...structuredClone(f), id: `${id}-${i}`, frameIndex: i })) };
    next.animations = [...next.animations.filter(an => an.id !== id), animation];
    const state = next.animationStates.find(s => s.id === a.animationStateID);
    state.animationIDs = state.animationIDs.filter(an => an !== id);
    const patrolStateID = `${id}-state`;
    next.animationStates = [...next.animationStates.filter(s => s.id !== patrolStateID), {
      id: patrolStateID, name: 'patrol_right', spriteSheet: a.spriteSheet,
      animationType: 'fixed', mirrorLeftFromRight: false, animationIDs: [id]
    }];
    a.eventBindings = { ...a.eventBindings,
      onInit: event(`${kind}_iniciar`, `Iniciar ${kind}`, [
        `set_actor_direction ${ref} right`,
        `set_actor_collision_box ${ref} 8 -8 16 16`,
        `set_actor_animation ${ref} patrol_right`
      ]),
      onUpdate: event(`${kind}_patrulhar`, `Patrulha ${kind}`, [
        `if_actor_at_position ${ref} ${maxX} ${y}`, `set_actor_direction ${ref} left`, 'condition_end',
        `if_actor_at_position ${ref} ${minX} ${y}`, `set_actor_direction ${ref} right`, 'condition_end',
        `if_actor_direction ${ref} right`, `move_actor_relative ${ref} 0.125 0`,
        'else', `move_actor_relative ${ref} -0.125 0`, 'condition_end', `wait ${wait}`
      ])
    };
  }
  const hints = {
    npc: ['Trabalhador', 'Use o direcional para andar, A para pular e B para o impulso. Fale comigo usando A.'],
    checkpoint: ['Farol', 'Progresso salvo. O farol marca seu retorno ao cair ou tocar em um inimigo.'],
    signpost: ['Placa', 'Suba a escada com CIMA. Na ponte, BAIXO + A permite descer. O modulo esta a direita.']
  };
  for (const [kind, [character, text]] of Object.entries(hints)) {
    const a = actor(kind), key = `penedos_teste_${kind}_fala`;
    a.y = 15;
    a.collisionGroup = kind === 'checkpoint' ? 2 : 0;
    next.dialogues = [...next.dialogues.filter(d => d.key !== key), {
      key, character, text, portrait: '', emote: '', choices: [], translations: { 'pt-BR': text },
      translationStatus: { 'pt-BR': 'approved' }
    }];
    a.eventBindings = { ...a.eventBindings,
      onInit: event(`${kind}_iniciar`, `Iniciar ${kind}`, [
        `set_actor_collision_box ${a.id} 8 -8 16 16`
      ]),
      onInteract: event(`${kind}_interagir`, `Interagir ${character}`, [
        ...(kind === 'checkpoint' ? ['set_variable var_penedos_farol 1', 'save_game 0'] : []),
        'play_sfx farol_sfx_dialogo', `show_dialogue ${key}`
      ])
    };
  }
  const damage = event('contato_inimigo', 'Grupo 1 - Contato com inimigos', [
    'rate_limit 45 30', 'play_sfx farol_sfx_salto',
    'if_variable var_penedos_farol 1', 'set_actor_position player 114 15',
    'else', 'set_actor_position player 14 15', 'condition_end', 'rate_limit_end'
  ]);
  const fall = event('queda', 'Queda - Retornar ao farol', [
    'if_variable var_penedos_farol 1', 'set_actor_position player 114 15',
    'else', 'set_actor_position player 14 15', 'condition_end'
  ]);
  // Detect below walkable ground, before the native hazard at the bottom row.
  // No cooldown: each fall must return, including repeated falls after loading.
  next.triggers = [...(next.triggers ?? []).filter(t => !t.id.startsWith('trigger-penedos-fall-')),
    ...[[56, 3], [105, 5]].map(([x, width], i) => ({
      id: `trigger-penedos-fall-${i + 1}`, name: `Queda no vão ${i + 1}`,
      roomName: 'penedos_vento', x, y: 17, width, height: 3,
      eventBindings: { onEnter: fall }
    }))
  ];
  for (const rooms of [next.scenas, next.rooms, next.scena ? [next.scena] : []]) {
    for (const r of rooms ?? []) if (r.name === 'penedos_vento') {
      r.eventBindings = { ...r.eventBindings, onHitGroup1: damage };
    }
  }
  if (!next.variables.some(v => v.name === 'var_penedos_farol')) next.variables.push({
    id: 'variable-penedos-farol', name: 'var_penedos_farol', displayName: 'Penedos - farol ativado', initialValue: 0
  });
  next.events = [...next.events.filter(e => !e.name.startsWith('penedos_teste_')), ...events];
  return next;
}
