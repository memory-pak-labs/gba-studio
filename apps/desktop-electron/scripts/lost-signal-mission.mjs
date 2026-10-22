// The zz_ item prefix retains the existing alphabetically allocated native
// inventory slots, including the Porto shop/quest module's numeric references.
export const LOST_SIGNAL_ITEMS = Object.freeze({ chart: 'zz_signal_chart', relay: 'zz_signal_relay' });
export const LOST_SIGNAL_VARIABLES = Object.freeze(['stage', 'chart', 'part', 'observation', 'code', 'lock', 'trip'].map(key => `var_signal_${key}`));

const timeline = {
  id: 'signal_repair', name: 'O sinal perdido · Reativação do farol', durationFrames: 120,
  tracks: [{ kind: 'events', keyframes: [
    { frame: 0, command: 'pause_scene_type topdown' },
    { frame: 0, command: 'camera_set_position 64 0' },
    { frame: 0, command: 'play_music farol_tema_principal' },
    { frame: 30, command: 'play_sfx farol_sfx_sinal' },
    { frame: 90, command: 'play_sfx farol_sfx_confirmar' },
    { frame: 120, command: 'camera_follow_player' },
    { frame: 120, command: 'resume_scene_type topdown' },
    { frame: 120, command: 'save_game 0' },
    { frame: 120, command: 'show_dialogue signal_repaired' }
  ] }]
};

/** Idempotent, data-only mission. Approved pixels, scene geometry, actors and HUD stay independent. */
export function promoteLostSignalMission(source) {
  const p = structuredClone(source);
  const scenes = ['porto_lumen', 'armazem_das_mares', 'observatorio_do_farol', 'farol_interior'];
  if (!scenes.every(name => p.rooms.some(r => r.name === name))) return p;
  const upsert = (key, value, field = 'name') => {
    const index = p[key].findIndex(entry => entry[field] === value[field]);
    if (index < 0) p[key].push(value); else p[key][index] = value;
  };
  for (const name of LOST_SIGNAL_VARIABLES) {
    if (!p.variables.some(v => v.name === name)) p.variables.push({ id: `variable-${name}`, name, displayName: `O sinal perdido · ${name.slice(11)}`, initialValue: 0 });
  }
  const event = (name, roomName, commands, detail) => {
    const old = p.events.find(e => e.name === name);
    upsert('events', {
      ...old, id: old?.id ?? `event-${name}`, name, roomName, category: 'O sinal perdido', command: 'noop',
      detail: detail ?? 'Missão opcional: condições e recompensas persistentes, sem modificar as camadas visuais aprovadas.',
      steps: commands.map((command, i) => ({ id: `${name}-step-${i + 1}`, command, isEnabled: true }))
    });
  };
  const dialogue = (key, pt, en, es, choices = []) => upsert('dialogues', {
    key, character: 'Nara', portrait: '', emote: '', text: en,
    textSound: 'farol_sfx_texto', confirmSound: 'farol_sfx_dialogo',
    choices: choices.map(c => c[1]), translations: { 'pt-BR': pt, es },
    choiceTranslations: { 'pt-BR': choices.map(c => c[0]), es: choices.map(c => c[2]) },
    translationStatus: { 'pt-BR': 'draft-ai', es: 'draft-ai' }
  }, 'key');
  const lines = [
    ['signal_request', 'O sinal perdido: busque a carta e a peça no Armazém. Fale com o cartógrafo. Durante a viagem, R + A na porta volta ao Porto.', 'The lost signal: find the chart and relay in the Warehouse. Speak to the cartographer. During the trip, hold R and press A on a door to return to Port.', 'La señal perdida: busca la carta y la pieza en el Almacén. Habla con el cartógrafo. Durante el viaje, R + A en la puerta vuelve al Puerto.'],
    ['signal_progress', 'O sinal perdido: consulte OBJETIVO no diário. A carta e a peça estão no Armazém; a pista final está no Observatório.', 'The lost signal: check OBJECTIVE in the journal. The chart and relay are in the Warehouse; the final clue is in the Observatory.', 'La señal perdida: consulta OBJETIVO en el diario. La carta y la pieza están en el Almacén; la pista final está en el Observatorio.'],
    ['signal_chest_locked', 'O baú tem uma trava náutica. Examine primeiro a carta sobre a mesa.', 'The chest has a nautical latch. Examine the chart on the table first.', 'El cofre tiene un cierre náutico. Examina primero la carta de la mesa.'],
    ['signal_find_relay', 'O sinal perdido: a carta já está com você. Examine o baú do Armazém para recolher a peça.', 'The lost signal: you have the chart. Examine the Warehouse chest to collect the relay.', 'La señal perdida: ya tienes la carta. Examina el cofre del Almacén para recoger la pieza.'],
    ['signal_chart', 'Carta recolhida: leia os sinais de LESTE para OESTE. O telescópio e a mesa da maré revelam os três números.', 'Chart collected: read the signals EAST to WEST. The telescope and tide table reveal the three numbers.', 'Carta recogida: lee las señales de ESTE a OESTE. El telescopio y la mesa de mareas revelan los tres números.'],
    ['signal_chart_again', 'A carta já está com você. A leitura segue de LESTE para OESTE.', 'You already have the chart. Read it EAST to WEST.', 'Ya tienes la carta. La lectura va de ESTE a OESTE.'],
    ['signal_relay', 'Peça de relé recolhida. Leve-a ao farol depois de decifrar os sinais no Observatório.', 'Relay collected. Take it to the lighthouse after decoding the signals in the Observatory.', 'Pieza de relé recogida. Llévala al faro después de descifrar las señales en el Observatorio.'],
    ['signal_chest_empty', 'A peça já foi recolhida. Não há outra no baú.', 'You already collected the relay. The chest is empty.', 'Ya recogiste la pieza. El cofre está vacío.'],
    ['signal_stars', 'Pelo telescópio: três sinais a LESTE, um ao CENTRO e quatro a OESTE. Confira a ordem na mesa da maré.', 'Through the telescope: three signals EAST, one CENTER and four WEST. Check their order on the tide table.', 'Por el telescopio: tres señales al ESTE, una al CENTRO y cuatro al OESTE. Comprueba el orden en la mesa de mareas.'],
    ['signal_need_observation', 'A mesa mostra a ordem da carta, mas faltam os sinais. Examine o telescópio e volte aqui.', 'The table shows the chart order, but the signals are missing. Examine the telescope and return here.', 'La mesa muestra el orden de la carta, pero faltan las señales. Examina el telescopio y vuelve.'],
    ['signal_code', 'LESTE, CENTRO, OESTE: 3, 1, 4. A combinação é 314. Volte pela porta e fale com o guardião junto à lente do farol.', 'EAST, CENTER, WEST: 3, 1, 4. The code is 314. Return through the door and speak to the keeper beside the lighthouse lens.', 'ESTE, CENTRO, OESTE: 3, 1, 4. La combinación es 314. Vuelve por la puerta y habla con el guardián junto a la lente del faro.'],
    ['signal_need_parts', 'O painel precisa da carta e da peça do Armazém. O cartógrafo pode levar você de volta.', 'The panel needs the Warehouse chart and relay. The cartographer can take you back.', 'El panel necesita la carta y la pieza del Almacén. El cartógrafo puede llevarte de vuelta.'],
    ['signal_need_code', 'A peça serve, mas falta a combinação. Examine o telescópio e a mesa da maré no Observatório.', 'The relay fits, but you still need the code. Examine the telescope and tide table in the Observatory.', 'La pieza encaja, pero falta la combinación. Examina el telescopio y la mesa de mareas del Observatorio.'],
    ['signal_lock_help', 'Painel do farol: esquerda/direita escolhe o dígito; cima/baixo altera. A confirma; B cancela.', 'Lighthouse panel: left/right selects a digit; up/down changes it. A confirms; B cancels.', 'Panel del faro: izquierda/derecha elige el dígito; arriba/abajo lo cambia. A confirma; B cancela.'],
    ['signal_wrong_code', 'A combinação não confere. A pista é 314. Você pode tentar novamente sem perder a peça.', 'Incorrect code. The clue is 314. Try again without losing the relay.', 'La combinación no coincide. La pista es 314. Puedes intentarlo de nuevo sin perder la pieza.'],
    ['signal_cancelled', 'Painel fechado. A peça continua com você.', 'Panel closed. You still have the relay.', 'Panel cerrado. La pieza sigue contigo.'],
    ['signal_repaired', 'O sinal voltou! A peça foi instalada. Volte à mecânica no Porto para concluir a missão.', 'The signal is back! The relay is installed. Return to the mechanic in the Port to finish the mission.', '¡La señal volvió! La pieza está instalada. Vuelve con la mecánica del Puerto para completar la misión.'],
    ['signal_reward', 'Missão concluída: O sinal perdido. A mecânica agradece e entrega 2 moedas. Progresso salvo.', 'Mission complete: The lost signal. The mechanic thanks you and gives you 2 coins. Progress saved.', 'Misión completada: La señal perdida. La mecánica te agradece y entrega 2 monedas. Progreso guardado.'],
    ['signal_done', 'O sinal perdido: missão concluída e recompensa recebida. O farol segue operando.', 'The lost signal: mission complete and reward collected. The lighthouse is operating.', 'La señal perdida: misión completada y recompensa recibida. El faro sigue funcionando.'],
    ['signal_available', 'O sinal perdido: fale com a mecânica no cais leste do Porto de Lúmen.', 'The lost signal: speak to the mechanic on the eastern dock in Lumen Port.', 'La señal perdida: habla con la mecánica del muelle este del Puerto de Lumen.']
  ];
  for (const line of lines) dialogue(...line);
  dialogue('signal_travel', 'O sinal perdido: para onde vamos?', 'The lost signal: where shall we go?', 'La señal perdida: ¿adónde vamos?', [['Armazém', 'Warehouse', 'Almacén'], ['Observatório', 'Observatory', 'Observatorio'], ['Farol', 'Lighthouse', 'Faro']]);
  p.dialogues = p.dialogues.filter(d => !['signal_warehouse_exit', 'signal_observatory_exit'].includes(d.key));

  event('porto_recuperar_estrutura', 'porto_lumen', [
    'if_variable var_frame 0', 'set_variable var_frame 1', 'add_item quest_fragment 1', 'condition_end',
    'if_variable var_signal_stage 0', 'set_variable var_signal_stage 1', 'save_game 0', 'show_dialogue signal_request',
    'else', 'if_variable var_signal_stage 2', 'call_event signal_claim_reward', 'else', 'call_procedure signal_mission_status', 'condition_end', 'condition_end'
  ]);
  event('porto_conversar_cartographer', 'porto_lumen', [
    'if_variable var_signal_stage 1', 'choice_event signal_travel 0 signal_go_warehouse', 'choice_event signal_travel 1 signal_go_observatory', 'choice_event signal_travel 2 signal_return_lighthouse', 'show_choice signal_travel',
    'else', 'show_dialogue porto-cartographer-conversa', 'condition_end'
  ]);
  event('signal_go_warehouse', 'porto_lumen', ['set_variable var_signal_trip 1', 'change_scene armazem_das_mares 15 16 down']);
  event('signal_go_observatory', 'armazem_das_mares', ['set_variable var_signal_trip 1', 'change_scene observatorio_do_farol 15 16 down']);
  event('signal_return_port', 'observatorio_do_farol', ['set_variable var_signal_trip 0', 'remove_button r', 'change_scene porto_lumen 88 50 down']);
  event('signal_return_lighthouse', 'observatorio_do_farol', ['set_variable var_signal_trip 0', 'remove_button r', 'change_scene farol_interior 23 27 up']);
  for (const [room, music] of [['armazem_das_mares', 'farol_enseada'], ['observatorio_do_farol', 'farol_memorias']]) {
    event(`${room}_ao_entrar`, room, ['play_music ' + music, 'save_game 0']);
  }
  event('armazem_das_mares_carta', 'armazem_das_mares', [
    'if_variable var_signal_stage 1', 'if_variable var_signal_chart 0', 'add_item zz_signal_chart 1', 'set_variable var_signal_chart 1', 'save_game 0', 'show_dialogue signal_chart',
    'else', 'show_dialogue signal_chart_again', 'condition_end', 'else', 'show_dialogue armazem_das_mares_carta', 'condition_end'
  ]);
  event('armazem_das_mares_bau', 'armazem_das_mares', [
    'if_variable var_signal_stage 1', 'has_item zz_signal_chart 1', 'if_variable var_signal_part 0', 'add_item zz_signal_relay 1', 'set_variable var_signal_part 1', 'save_game 0', 'show_dialogue signal_relay',
    'else', 'show_dialogue signal_chest_empty', 'condition_end', 'else', 'show_dialogue signal_chest_locked', 'condition_end', 'else', 'show_dialogue armazem_das_mares_bau', 'condition_end'
  ]);
  event('armazem_das_mares_saida', 'armazem_das_mares', [
    'if_variable var_signal_trip 1', 'if_button r', 'set_variable var_signal_trip 0', 'change_scene porto_lumen 88 50 down',
    'else', 'change_scene observatorio_do_farol 15 16 down', 'condition_end',
    'else', 'advance_campaign', 'condition_end'
  ]);
  event('observatorio_do_farol_telescopio', 'observatorio_do_farol', [
    'if_variable var_signal_stage 1', 'set_variable var_signal_observation 1', 'save_game 0', 'show_dialogue signal_stars', 'else', 'show_dialogue observatorio_do_farol_telescopio', 'condition_end'
  ]);
  event('observatorio_do_farol_mapa', 'observatorio_do_farol', [
    'if_variable var_signal_stage 1', 'has_item zz_signal_chart 1', 'if_variable var_signal_observation 1', 'set_variable var_signal_code 1', 'save_game 0', 'show_dialogue signal_code',
    'else', 'show_dialogue signal_need_observation', 'condition_end', 'else', 'show_dialogue signal_need_parts', 'condition_end', 'else', 'show_dialogue observatorio_do_farol_mapa', 'condition_end'
  ]);
  event('observatorio_do_farol_saida', 'observatorio_do_farol', [
    'if_variable var_signal_trip 1', 'set_variable var_signal_trip 0', 'if_button r', 'change_scene porto_lumen 88 50 down',
    'else', 'change_scene farol_interior 23 27 up', 'condition_end',
    'else', 'advance_campaign', 'condition_end'
  ]);
  event('farol_examinar_lente', 'farol_interior', [
    'if_variable var_signal_stage 1', 'has_item zz_signal_chart 1', 'has_item zz_signal_relay 1', 'if_variable var_signal_code 1',
    'show_dialogue signal_lock_help', 'open_code_lock var_signal_lock 3 314', 'if_variable var_signal_lock 1', 'call_event signal_finish_repair',
    'else', 'if_variable var_signal_lock 0', 'show_dialogue signal_wrong_code', 'else', 'show_dialogue signal_cancelled', 'condition_end', 'condition_end',
    'else', 'show_dialogue signal_need_code', 'condition_end', 'else', 'show_dialogue signal_need_parts', 'condition_end', 'else', 'show_dialogue signal_need_parts', 'condition_end',
    'else', 'if_variable var_signal_stage 2', 'show_dialogue signal_repaired', 'else', 'if_variable var_signal_stage 3', 'show_dialogue signal_done',
    'else', 'play_sfx farol_sfx_sinal', 'show_dialogue farol_lente', 'condition_end', 'condition_end', 'condition_end'
  ]);
  event('farol_falar_guardiao', 'farol_interior', [
    'if_variable var_signal_stage 0', 'show_dialogue farol_guardiao', 'else', 'call_event farol_examinar_lente', 'condition_end'
  ]);
  event('signal_finish_repair', 'farol_interior', [
    'if_variable var_signal_stage 1', 'has_item zz_signal_chart 1', 'has_item zz_signal_relay 1', 'if_variable var_signal_code 1', 'if_variable var_signal_lock 1',
    'add_item zz_signal_relay -1', 'set_variable var_signal_part 0', 'set_variable var_signal_stage 2', 'set_variable var_signal_trip 0',
    'call_event timeline_signal_repair',
    'condition_end', 'condition_end', 'condition_end', 'condition_end', 'condition_end'
  ]);
  event('signal_claim_reward', 'porto_lumen', [
    'if_variable var_signal_stage 2', 'add_item currency_gold 2', 'set_variable var_signal_stage 3', 'save_game 0', 'show_dialogue signal_reward',
    'else', 'call_procedure signal_mission_status', 'condition_end'
  ]);
  event('signal_mission_status', 'missoes', [
    'if_variable var_signal_stage 0', 'show_dialogue signal_available', 'else', 'if_variable var_signal_stage 1',
    'if_variable var_signal_chart 0', 'show_dialogue signal_progress', 'else', 'if_variable var_signal_part 0', 'show_dialogue signal_find_relay',
    'else', 'if_variable var_signal_code 0', 'show_dialogue signal_need_code', 'else', 'show_dialogue signal_code', 'condition_end', 'condition_end', 'condition_end',
    'else', 'if_variable var_signal_stage 2', 'show_dialogue signal_repaired', 'else', 'show_dialogue signal_done', 'condition_end', 'condition_end', 'condition_end'
  ]);
  if (!p.events.some(e => e.name === 'signal_campaign_objective')) {
    const old = p.events.find(e => e.name === 'missoes_detalhar_proximo');
    event('signal_campaign_objective', 'missoes', old.steps.map(s => s.command), 'Objetivo original da campanha, preservado como procedimento compartilhado.');
  }
  for (const name of ['signal_mission_status', 'signal_campaign_objective']) {
    const procedure = p.events.find(e => e.name === name);
    procedure.eventKind = 'procedure'; procedure.procedure = { parameters: [], locals: [] };
  }
  event('missoes_detalhar_proximo', 'missoes', ['call_procedure signal_mission_status', 'call_procedure signal_campaign_objective']);

  p.advancedTools ??= {};
  p.advancedTools.cinematicTimelines = [...(p.advancedTools.cinematicTimelines ?? []).filter(t => t.id !== timeline.id), structuredClone(timeline)];
  let previous = 0;
  const cinematicCommands = timeline.tracks[0].keyframes.flatMap(k => {
    const wait = k.frame - previous; previous = k.frame;
    return [...(wait ? [`wait ${wait}`] : []), k.command];
  });
  event('timeline_signal_repair', 'farol_interior', cinematicCommands, 'Timeline editável em Ferramentas avançadas; câmera e áudio, sem rasterizar atores ou HUD no background.');
  const newGame = p.events.find(e => e.name === 'titulo_novo_jogo');
  const retained = newGame.steps.filter(s => !/^set_variable var_signal_|^add_item zz_signal_/.test(s.command));
  const reset = [...LOST_SIGNAL_VARIABLES.map(name => `set_variable ${name} 0`), ...Object.values(LOST_SIGNAL_ITEMS).map(name => `add_item ${name} -99`)];
  const transition = retained.findIndex(s => s.command.startsWith('change_scene '));
  retained.splice(transition < 0 ? retained.length : transition, 0, ...reset.map((command, i) => ({ id: `signal-new-game-reset-${i}`, command, isEnabled: true })));
  newGame.steps = retained;
  return p;
}
