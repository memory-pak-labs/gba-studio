export const SHOWCASE_ITEMS = Object.freeze({ tool: 'zzz_lumen_tool', compass: 'zzz_guardian_compass' });
export const SHOWCASE_VARIABLES = Object.freeze([
  'var_council_path', 'var_council_visit',
  'var_tool_stock', 'var_trial_active', 'var_trial_charge', 'var_trial_result',
  'var_trial_attempts', 'var_trial_reward'
]);

/** Connected authoring examples; approved pixels and scene geometry remain intact. */
export function promoteShowcaseSystems(source) {
  const p = structuredClone(source);
  if (!['porto_lumen', 'farol_interior', 'conselho_guardia'].every(name => p.scenas.some(r => r.name === name))) return p;
  const upsert = (key, item, field = 'name') => {
    const index = p[key].findIndex(old => old[field] === item[field]);
    if (index < 0) p[key].push(item); else p[key][index] = item;
  };
  const event = (name, roomName, commands, detail = 'Exemplo de sistemas conectados: estado persistente, requisitos e efeitos separados do cenário.') => {
    const old = p.events.find(e => e.name === name);
    upsert('events', { ...old, id: old?.id ?? `event-${name}`, name, roomName, category: 'Exemplo · Sistemas conectados', detail, command: 'noop', steps: commands.map((command, i) => ({ id: `${name}-${i + 1}`, command, isEnabled: true })) });
  };
  const procedure = (name, room, commands, detail) => {
    event(name, room, commands, detail);
    Object.assign(p.events.find(e => e.name === name), { eventKind: 'procedure', procedure: { parameters: [], locals: [] } });
  };
  const base = (name, alias) => {
    if (!p.events.some(e => e.name === alias)) {
      const original = p.events.find(e => e.name === name);
      procedure(alias, original.roomName, original.steps.map(s => s.command), 'Comportamento anterior preservado como procedimento compartilhado.');
      p.events.find(e => e.name === alias).steps = structuredClone(original.steps);
    }
    return p.events.find(e => e.name === alias).steps.map(s => s.command);
  };
  for (const name of SHOWCASE_VARIABLES) if (!p.variables.some(v => v.name === name)) p.variables.push({ id: `variable-${name}`, name, displayName: `Sistemas conectados · ${name.slice(4)}`, initialValue: 0 });
  const itemKeys = new Set(Object.values(SHOWCASE_ITEMS));
  for (const e of p.events) for (const s of e.steps ?? []) {
    const t = s.command.split(/\s+/);
    if (['add_item', 'has_item'].includes(t[0])) itemKeys.add(t[1]);
    if (t[0] === 'set_equipped_item' && t[2] !== 'none') itemKeys.add(t[2]);
  }
  const toolIndex = [...itemKeys].sort().indexOf(SHOWCASE_ITEMS.tool);
  const dialogue = (key, pt, en, es, choices = []) => upsert('dialogues', {
    key, character: '', portrait: '', emote: '', text: en, translations: { 'pt-BR': pt, es },
    choices: choices.map(c => c[1]), choiceTranslations: { 'pt-BR': choices.map(c => c[0]), es: choices.map(c => c[2]) },
    translationStatus: { 'pt-BR': 'draft-ai', es: 'draft-ai' }, textSound: 'farol_sfx_texto', confirmSound: 'farol_sfx_dialogo'
  }, 'key');
  const texts = [
    ['showcase_captain_menu', 'Qual é o próximo passo?', 'What comes next?', '¿Cuál es el siguiente paso?', [['Visitar o Conselho', 'Visit the Council', 'Visitar el Consejo'], ['Estado da costa', 'Coast report', 'Estado de la costa'], ['Conversar', 'Talk', 'Conversar']]],
    ['showcase_trader_menu', 'Viajante: o que deseja?', 'Trader: what do you need?', 'Viajero: ¿qué deseas?', [['Comprar ferramenta', 'Buy tool', 'Comprar herramienta'], ['Equipamento', 'Equipment', 'Equipo'], ['Conversar', 'Talk', 'Conversar']]],
    ['showcase_equipment_help', 'Escolha a ferramenta no primeiro slot. Ter o item na mochila é diferente de usá-lo. B retorna ao menu anterior.', 'Choose the tool in the first slot. Carrying it is different from equipping it. B goes back.', 'Elige la herramienta en el primer espacio. Llevarla no es lo mismo que equiparla. B vuelve.'],
    ['showcase_keeper_menu', 'Calibrar o farol?', 'Calibrate the lighthouse?', '¿Calibramos el faro?', [['Iniciar calibração', 'Start calibration', 'Iniciar calibración'], ['Equipamento', 'Equipment', 'Equipo'], ['Conversar', 'Talk', 'Conversar']]],
    ['showcase_need_signal', 'Primeiro conclua O sinal perdido e receba a recompensa da mecânica.', 'Finish The lost signal and collect the mechanic reward first.', 'Primero completa La señal perdida y recoge la recompensa.'],
    ['showcase_need_tool', 'Equipe a ferramenta do viajante do Porto no primeiro slot. Só carregá-la na mochila não aciona o calibrador.', 'Equip the Port trader tool in the first slot. Carrying it in the bag does not activate the calibrator.', 'Equipa la herramienta del viajero del Puerto en el primer espacio. Llevarla en la mochila no activa el calibrador.'],
    ['showcase_trial_help', 'Ao fechar esta fala, corra até a porta inferior antes do tempo acabar. O número central mostra a carga restante. Errar permite tentar outra vez.', 'After closing this text, reach the lower door before time runs out. The center number shows remaining charge. You can retry.', 'Al cerrar este texto, llega a la puerta inferior antes de que termine el tiempo. El número central indica la carga restante. Puedes reintentar.'],
    ['showcase_trial_failed', 'O sinal de teste apagou. Sua ferramenta continua equipada. Volte ao guardião para tentar novamente.', 'The test signal faded. Your tool stays equipped. Return to the keeper to retry.', 'La señal de prueba se apagó. La herramienta sigue equipada. Vuelve al guardián para reintentar.'],
    ['showcase_trial_success', 'Circuito calibrado! Você recebe uma moeda pela primeira calibração. O resultado e os equipamentos foram salvos.', 'Circuit calibrated! One coin for the first calibration. Your result and equipment are saved.', '¡Circuito calibrado! Una moneda por la primera calibración. El resultado y el equipo están guardados.'],
    ['showcase_trial_done', 'O circuito de emergência já foi calibrado. A recompensa só pode ser recebida uma vez.', 'The emergency circuit is calibrated. Its reward can only be collected once.', 'El circuito de emergencia ya está calibrado. Su recompensa solo se recibe una vez.'],
    ['showcase_trial_active', 'O circuito está ativo. Leve o sinal até a porta inferior antes que o tempo acabe.', 'The circuit is active. Carry the signal to the lower door before time runs out.', 'El circuito está activo. Lleva la señal a la puerta inferior a tiempo.'],
    ['showcase_community', 'Sua escolha protege os abrigos da costa. A Guardiã enviou duas moedas para ajudar nos reparos; o Porto se lembra do acordo.', 'Your choice protects coastal shelters. The Guardian sent two repair coins; the Port remembers the pact.', 'Tu elección protege los refugios costeros. La Guardiana envió dos monedas; el Puerto recuerda el acuerdo.'],
    ['showcase_exploration', 'Sua escolha abriu novas rotas. A bússola da Guardiã amplia a janela de calibração para 18 unidades de carga.', 'Your choice opens new routes. The Guardian compass extends the calibration window to 18 charge units.', 'Tu elección abre nuevas rutas. La brújula de la Guardiana amplía la calibración a 18 unidades de carga.'],
    ['showcase_undecided', 'A Guardiã espera sua decisão: apoiar os abrigos ou explorar novas rotas. O capitão pode levar você ao Conselho após restaurar o sinal.', 'The Guardian awaits your choice: shelters or new routes. The captain can take you to the Council after the signal is restored.', 'La Guardiana espera tu decisión: refugios o nuevas rutas. El capitán te lleva al Consejo tras restaurar la señal.'],
    ['showcase_mechanic_tool', 'Você trouxe a ferramenta do viajante. Equipe-a antes de pedir ao guardião para calibrar o circuito do Farol.', 'You have the trader tool. Equip it before asking the keeper to calibrate the lighthouse circuit.', 'Tienes la herramienta del viajero. Equípala antes de pedir la calibración al guardián.'],
    ['showcase_fisher_success', 'Eu vi o teste do farol! Agora a costa tem também um sinal de emergência.', 'I saw the lighthouse test! Now the coast has an emergency signal too.', '¡Vi la prueba del faro! Ahora la costa tiene una señal de emergencia.'],
    ['showcase_epilogue_community', 'Com os faróis acesos, os abrigos voltaram a receber viajantes. A costa prospera pelo pacto de proteção que você escolheu.', 'With the beacons lit, coastal shelters welcome travelers again. The protection pact you chose helps the coast thrive.', 'Con los faros encendidos, los refugios reciben viajeros. El pacto de protección que elegiste hace prosperar la costa.'],
    ['showcase_epilogue_exploration', 'Com os faróis acesos, a bússola aponta além da tempestade. O pacto de exploração que você escolheu abre uma nova jornada.', 'With the beacons lit, the compass points beyond the storm. Your exploration pact opens a new journey.', 'Con los faros encendidos, la brújula señala más allá de la tormenta. Tu pacto de exploración abre otra aventura.']
  ];
  for (const text of texts) dialogue(...text);
  const council = p.dialogues.find(d => d.key === 'conselho');
  Object.assign(council, { text: 'Which pact shall we make?', translations: { ...council.translations, 'pt-BR': 'Qual será o nosso pacto?', es: '¿Cuál será nuestro pacto?' }, choices: ['Protect the coast', 'Explore new routes'], choiceTranslations: { 'pt-BR': ['Proteger a costa', 'Explorar novas rotas'], es: ['Proteger la costa', 'Explorar nuevas rutas'] }, translationStatus: { 'pt-BR': 'draft-ai', es: 'draft-ai' } });

  base('porto_conversar_captain', 'showcase_base_captain');
  base('porto_conversar_traveler', 'showcase_base_traveler');
  base('porto_recuperar_estrutura', 'showcase_base_mechanic');
  base('porto_conversar_fisherchild', 'showcase_base_fisher');
  base('farol_falar_guardiao', 'showcase_base_keeper');
  base('farol_sair_porto', 'showcase_base_exit');
  base('porto_ao_entrar', 'showcase_base_port_enter');
  base('farol_interior_ao_entrar', 'showcase_base_farol_enter');
  base('menu_start_ao_entrar', 'showcase_base_start_enter');
  base('mercado_falar_guarda', 'showcase_base_market_guard');
  const ending = base('circuito_concluir', 'showcase_base_ending');
  procedure('showcase_coast_report', 'porto_lumen', ['if_variable var_council_path 1', 'show_dialogue showcase_community', 'else', 'if_variable var_council_path 2', 'show_dialogue showcase_exploration', 'else', 'show_dialogue showcase_undecided', 'condition_end', 'condition_end']);
  event('porto_conversar_captain', 'porto_lumen', ['if_variable var_signal_stage 3', 'choice_event showcase_captain_menu 0 showcase_visit_council', 'choice_event showcase_captain_menu 1 showcase_coast_report_event', 'choice_event showcase_captain_menu 2 showcase_captain_talk', 'show_choice showcase_captain_menu', 'else', 'call_procedure showcase_base_captain', 'condition_end']);
  event('showcase_coast_report_event', 'porto_lumen', ['call_procedure showcase_coast_report']);
  event('showcase_captain_talk', 'porto_lumen', ['call_procedure showcase_base_captain']);
  event('showcase_visit_council', 'porto_lumen', ['set_variable var_council_visit 1', 'change_scene conselho_guardia 0 0 down']);
  procedure('showcase_leave_council', 'conselho_guardia', ['if_variable var_council_visit 1', 'change_scene porto_lumen 37 68 up', 'else', 'set_variable var_guardian_bond 1', 'save_game 0', 'advance_campaign', 'condition_end']);
  event('conselho_ao_entrar', 'conselho_guardia', ['choice_event conselho 0 conselho_confirmar_alianca', 'choice_event conselho 1 conselho_escolher_exploracao', 'if_variable var_council_path 0', 'show_dialogue conselho_nara', 'else', 'call_procedure showcase_coast_report', 'call_procedure showcase_leave_council', 'condition_end']);
  for (const [name, path, reward] of [['conselho_confirmar_alianca', 1, 'add_item currency_gold 2'], ['conselho_escolher_exploracao', 2, 'add_item zzz_guardian_compass 1']]) event(name, 'conselho_guardia', [
    'if_variable var_council_path 0', `set_variable var_council_path ${path}`, reward, 'condition_end',
    'call_procedure showcase_leave_council'
  ]);

  event('porto_conversar_traveler', 'porto_lumen', ['choice_event showcase_trader_menu 0 showcase_open_shop', 'choice_event showcase_trader_menu 1 showcase_open_equipment', 'choice_event showcase_trader_menu 2 showcase_traveler_talk', 'show_choice showcase_trader_menu']);
  event('showcase_traveler_talk', 'porto_lumen', ['call_procedure showcase_base_traveler']);
  event('showcase_open_shop', 'porto_lumen', ['open_shop porto-lume-traveler-pilot', 'save_game 0']);
  event('showcase_open_equipment', 'porto_lumen', ['show_dialogue showcase_equipment_help', 'open_equip_menu 1 true', 'save_game 0']);
  event('porto_recuperar_estrutura', 'porto_lumen', ['call_procedure showcase_base_mechanic', 'has_item zzz_lumen_tool 1', 'show_dialogue showcase_mechanic_tool', 'condition_end']);
  event('porto_ao_entrar', 'porto_lumen', ['call_procedure showcase_base_port_enter', 'if_variable var_council_visit 1', 'set_variable var_council_visit 0', 'save_game 0', 'condition_end', 'if_variable var_council_path 1', 'set_actor_animation port-mechanic idle_left', 'else', 'if_variable var_council_path 2', 'set_actor_animation port-mechanic idle_right', 'condition_end', 'condition_end']);
  event('porto_conversar_fisherchild', 'porto_lumen', ['if_variable var_trial_result 1', 'show_dialogue showcase_fisher_success', 'else', 'call_procedure showcase_base_fisher', 'condition_end']);
  event('mercado_falar_guarda', 'mercado_suspenso', ['call_procedure showcase_base_market_guard', 'if_variable_greater_than var_council_path 0', 'call_procedure showcase_coast_report', 'condition_end']);
  procedure('showcase_council_epilogue', 'circuito_final', ['if_variable var_council_path 1', 'show_dialogue showcase_epilogue_community', 'else', 'if_variable var_council_path 2', 'show_dialogue showcase_epilogue_exploration', 'condition_end', 'condition_end']);
  event('circuito_concluir', 'circuito_final', ending.flatMap(command => command === 'show_dialogue epilogo' ? ['call_procedure showcase_council_epilogue', command] : [command]));

  event('farol_falar_guardiao', 'farol_interior', ['if_variable var_signal_stage 3', 'choice_event showcase_keeper_menu 0 showcase_begin_trial', 'choice_event showcase_keeper_menu 1 showcase_open_equipment', 'choice_event showcase_keeper_menu 2 showcase_keeper_talk', 'show_choice showcase_keeper_menu', 'else', 'call_procedure showcase_base_keeper', 'condition_end']);
  event('showcase_keeper_talk', 'farol_interior', ['call_procedure showcase_coast_report']);
  event('showcase_begin_trial', 'farol_interior', [
    'if_variable var_signal_stage 3', 'if_variable var_trial_result 1', 'show_dialogue showcase_trial_done', 'else',
    'if_variable var_trial_active 1', 'show_dialogue showcase_trial_active', 'else',
    `if_engine_field equipped_item_0 ${toolIndex}`, 'has_item zzz_lumen_tool 1', 'show_dialogue showcase_trial_help',
    'set_variable var_trial_charge 12', 'has_item zzz_guardian_compass 1', 'set_variable var_trial_charge 18', 'condition_end',
    'set_variable var_trial_result 0', 'set_variable var_trial_active 1', 'add_variable var_trial_attempts 1',
    'timer_attach 60 showcase_trial_tick', 'start_segment 7 showcase_trial_pulse',
    'else', 'show_dialogue showcase_need_tool', 'condition_end', 'else', 'show_dialogue showcase_need_tool', 'condition_end',
    'condition_end', 'condition_end', 'else', 'show_dialogue showcase_need_signal', 'condition_end'
  ]);
  event('showcase_trial_pulse', 'farol_interior', ['actor_effects farol-keeper flash 16 50', 'play_sfx farol_sfx_sinal', 'wait 60', 'actor_effects farol-keeper flash 16 50', 'wait 60', 'play_sfx farol_sfx_sinal']);
  event('showcase_trial_tick', 'farol_interior', ['if_variable var_trial_active 1', 'add_variable var_trial_charge -1', 'if_variable var_trial_charge 3', 'play_sfx farol_sfx_sinal', 'condition_end', 'if_variable_less_than var_trial_charge 1', 'call_procedure showcase_trial_timeout', 'condition_end', 'else', 'timer_remove showcase_trial_tick', 'condition_end']);
  procedure('showcase_trial_timeout', 'farol_interior', ['timer_remove showcase_trial_tick', 'stop_segment 7', 'set_variable var_trial_active 0', 'set_variable var_trial_charge 0', 'set_variable var_trial_result -1', 'play_sfx farol_sfx_sinal', 'show_dialogue showcase_trial_failed']);
  procedure('showcase_finish_trial', 'farol_interior', ['if_variable var_trial_active 1', 'timer_remove showcase_trial_tick', 'stop_segment 7', 'set_variable var_trial_active 0', 'set_variable var_trial_charge 0', 'set_variable var_trial_result 1', 'if_variable var_trial_reward 0', 'set_variable var_trial_reward 1', 'add_item currency_gold 1', 'condition_end', 'play_sfx farol_sfx_confirmar', 'save_game 0', 'show_dialogue showcase_trial_success', 'condition_end']);
  event('farol_sair_porto', 'farol_interior', ['if_variable var_trial_active 1', 'call_procedure showcase_finish_trial', 'condition_end', 'call_procedure showcase_base_exit']);
  procedure('showcase_interrupt_trial', 'farol_interior', ['if_variable var_trial_active 1', 'set_variable var_trial_active 0', 'set_variable var_trial_charge 0', 'set_variable var_trial_result -2', 'condition_end']);
  procedure('showcase_trial_watchdog', 'farol_interior', ['if_variable var_trial_active 1', 'if_engine_field timer_count 0', 'call_procedure showcase_interrupt_trial', 'condition_end', 'condition_end'], 'Carregar sem timer interrompe a tentativa, preserva os equipamentos e permite reiniciar.');
  event('farol_interior_ao_entrar', 'farol_interior', ['call_procedure showcase_trial_watchdog', 'call_procedure showcase_base_farol_enter']);
  event('menu_start_ao_entrar', 'menu_start', ['call_procedure showcase_interrupt_trial', 'call_procedure showcase_base_start_enter'], 'Abrir Start interrompe o teste antes de salvar; cronômetros transitórios não são persistidos.');
  for (const id of ['port-nara', 'farol-nara']) {
    const actor=p.actors.find(a=>a.id===id);
    if(actor.eventBindings?.onUpdate==='showcase_trial_watchdog')delete actor.eventBindings.onUpdate;
  }

  for (const key of ['rooms', 'scenas']) {
    const port = p[key].find(r => r.name === 'porto_lumen');
    const modules = port.runtime.config.modules;
    const shop = modules.find(m => m.id === 'shop');
    shop.enabled = true; shop.settings = { label: 'FERRAMENTA', item: toolIndex, currencyItem: 0, price: 4, stockVariable: p.variables.findIndex(v => v.name === 'var_tool_stock'), stock: 1 };
    const lighthouse = p[key].find(r => r.name === 'farol_interior');
    lighthouse.hudPresetId = 'hud-farol-trial';
    lighthouse.runtime.config.modules = structuredClone(modules.filter(m => m.id !== 'quests'));
  }
  const hud = structuredClone(p.settings.hudPresets.find(h => h.id === 'hud-porto-lumen-b'));
  hud.id = 'hud-farol-trial'; hud.name = 'Farol · Calibração contextual'; hud.description = 'HUD aprovada com cronômetro independente, visível somente durante o teste.';
  const hidden = { states: { hidden: { variable: 'var_trial_active', value: 0 } }, events: [] };
  hud.components.push({ ...structuredClone(hud.components.find(c => c.id === 'money-frame')), id: 'trial-frame', label: 'Tempo do teste', x: 92, behavior: structuredClone(hidden) });
  hud.components.push({ id: 'trial-charge', kind: 'text', label: 'Carga restante', text: '000', asset: '', x: 111, y: 9, width: 18, height: 8, zIndex: 2, visible: true, pixelPosition: true, valueVariable: 'var_trial_charge', textAdvance: 6, behavior: structuredClone(hidden) });
  const oldHud = p.settings.hudPresets.findIndex(h => h.id === hud.id);
  if (oldHud < 0) p.settings.hudPresets.push(hud); else p.settings.hudPresets[oldHud] = hud;

  for(const component of p.settings.hudPresets.find(h=>h.id==='hud-porto-corrida').components) {
    if(['race-panel-3','race-text-3'].includes(component.id))component.behavior={...component.behavior,states:{...component.behavior?.states,hidden:{variable:'var_campaign_finished',value:1}},events:component.behavior?.events??[]};
  }

  const newGame = p.events.find(e => e.name === 'titulo_novo_jogo');
  const retained = newGame.steps.filter(s => { const t = s.command.split(/\s+/); return s.command !== 'set_equipped_item 0 none' && !(t[0] === 'set_variable' && SHOWCASE_VARIABLES.includes(t[1])) && !(t[0] === 'add_item' && Object.values(SHOWCASE_ITEMS).includes(t[1])); });
  const reset = ['set_equipped_item 0 none', ...SHOWCASE_VARIABLES.map(name => `set_variable ${name} 0`), ...Object.values(SHOWCASE_ITEMS).map(key => `add_item ${key} -99`)];
  const transition = retained.findIndex(s => s.command.startsWith('change_scene '));
  retained.splice(transition < 0 ? retained.length : transition, 0, ...reset.map((command, i) => ({ id: `showcase-new-game-${i}`, command, isEnabled: true })));
  newGame.steps = retained;
  return p;
}
