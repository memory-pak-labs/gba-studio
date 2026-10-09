/** Six authored in-game menus. Reuses approved artwork; never rewrites gameplay scenes/assets. */
export const IN_GAME_MENU_SCENES = Object.freeze(['menu_start', 'missoes', 'inventario', 'mapa_menu', 'salvar', 'configuracoes']);
const affected = new Set([...IN_GAME_MENU_SCENES, 'carregar_jogo']);
const titles = { menu_start: 'PAUSA', missoes: 'MISSOES', inventario: 'INVENTARIO', mapa_menu: 'ROTAS DO FAROL', salvar: 'SALVAR', configuracoes: 'CONFIGURACOES', carregar_jogo: 'CARREGAR JOGO' };
const back = () => ({ id: 'back', label: 'Voltar', action: 'pop_screen', targetScreenID: '', eventName: '', enabled: true });
const option = (id, label, eventName, binding) => ({ id, label, action: 'select', targetScreenID: '', eventName, enabled: true, ...(binding === undefined ? {} : { binding: { source: 'variable', index: binding, format: 'on_off' } }) });
export const IN_GAME_MENU_SPANISH_DIALOGUES = Object.freeze({
  'ingame-next-0': 'La luz del faro ha sido restaurada. La campaña está completa.',
  'ingame-next-1': 'Compite en el Circuito Final y completa las tres vueltas.',
  'ingame-next-2': 'Gana la Arena Arrancada para conseguir el impulso.',
  'ingame-next-3': 'Derrota al Guardián del Relé y libera la arena.',
  'ingame-next-4': 'Atraviesa la Tormenta para obtener el blindaje.',
  'ingame-next-5': 'Lleva la célula al Consejo y confirma la alianza.',
  'ingame-next-6': 'Encuentra la célula a la salida de la Planta Sumergida.',
  'ingame-next-7': 'Atraviesa la Planta Sumergida y derrota al centinela.',
  'ingame-next-8': 'Ve al Mercado Suspendido y encuentra el atajo.',
  'ingame-next-9': 'Examina el Observatorio del Faro.',
  'ingame-next-10': 'Explora el Almacén de los Mares y consulta la carta.',
  'ingame-next-11': 'Usa el mapa de viaje para llegar a los Peñascos del Viento.',
  'ingame-next-start': 'Habla con la Guardiana en Puerto Lumen para obtener la estructura del faro.',
  'ingame-mission-frame': 'Habla con la Guardiana en Puerto Lumen. OK indica que obtuviste la estructura.',
  'ingame-mission-cell': 'Derrota al centinela y encuentra la célula a la salida de la Planta.',
  'ingame-mission-bond': 'Confirma la alianza en el Consejo de la Guardiana.',
  'ingame-mission-final': 'Completa el Circuito Final para restaurar la luz.',
  'ingame-item-frame': 'Estructura del faro obtenida en Puerto Lumen. OK: obtenida. NO: aún falta.',
  'ingame-item-grip': 'Módulo obtenido en los Peñascos del Viento. OK: obtenido. NO: aún falta.',
  'ingame-item-cell': 'Célula recogida a la salida de la Planta Sumergida. OK: obtenida. NO: aún falta.',
  'ingame-item-shield': 'Módulo obtenido al atravesar la Tormenta. OK: obtenido. NO: aún falta.',
  'ingame-item-boost': 'Módulo obtenido al ganar la Arena Arrancada. OK: obtenido. NO: aún falta.',
  'ingame-map-porto': 'Inicio del viaje. Habla con la Guardiana para obtener la estructura. Este mapa es solo de consulta.',
  'ingame-map-penedos': 'Accede desde el mapa de viaje. Completa la ruta de plataformas. Este mapa es solo de consulta.',
  'ingame-map-armazem': 'Después de los Peñascos, examina la carta para ir al Observatorio. Este mapa es solo de consulta.',
  'ingame-map-observatorio': 'Lee el registro del faro antes de ir al Mercado. Este mapa es solo de consulta.',
  'ingame-map-mercado': 'Atraviesa el Mercado y descubre el acceso a la Planta. Este mapa es solo de consulta.',
  'ingame-map-usina': 'Explora, derrota al centinela y recoge la célula de energía. Este mapa es solo de consulta.',
  'ingame-map-conselho': 'Confirma la alianza. Después: Tormenta, Relé, Arena y Circuito Final. Este mapa es solo de consulta.',
  'ingame-map-circuito': 'Completa tres vueltas. Consulta Misiones para ver el próximo objetivo. Este mapa es solo de consulta.',
  'ingame-controls': 'Cruceta: mover y elegir. A: confirmar o interactuar. B: volver. Start: pausa. Mazmorra: R pausa, Start mapa, Select mochila. Carrera: A acelera, B frena; cruceta gira.'
});
function hud(name, items) {
  const id = `hud-ingame-${name}`;
  // Keep authored spacing in text; labels are trimmed by the inspector contract.
  // A blank row uses a space so its internal label is never drawn as game text.
  const component = (suffix, kind, text, x, y, width, height) => ({ id: `${id}-${suffix}`, kind, label: text || suffix, text: kind === 'text' ? text || ' ' : text, asset: '', x, y, width, height, zIndex: kind === 'frame' ? 0 : 1, visible: true });
  const x = name === 'menu_start' ? 72 : 24;
  return { id, name: titles[name], description: 'Menu de consulta com dados da partida e moldura aprovada.', backgroundImage: '', selectorImage: '', font: '', position: 'Superior', width: 240, height: 160, mode: 'advanced', components: [
    component('shell', 'frame', '', 8, 8, 224, 144),
    component('title', 'text', titles[name], 24, 16, 192, 8),
    ...Array.from({ length: 6 }, (_, i) => component(`row-${i}`, 'text', items[i] ? `${i === 0 ? '! ' : '  '}${items[i].label}` : '', x, 40 + i * 16, 216 - x, 8)),
    component('footer', 'text', 'D MOVER A OK B VOLTAR', 24, 136, 192, 8)
  ] };
}
function event(name, roomName, commands) {
  return { id: `ingame-${name}`, name, roomName, category: 'Menu', detail: 'Consulta dos dados reais da campanha.', command: 'noop', steps: commands.map((command, i) => ({ id: `ingame-${name}-${i}`, command, isEnabled: true })) };
}
function dialogue(key, text) {
  const spanish = IN_GAME_MENU_SPANISH_DIALOGUES[key];
  if (!spanish) throw new Error(`Tradução espanhola ausente: ${key}`);
  return { key, character: '', text, portrait: '', emote: '', choices: [], translations: { 'pt-BR': text, es: spanish }, translationStatus: { 'pt-BR': 'approved', es: 'draft' }, choiceTranslations: {}, textSound: 'farol_sfx_texto', confirmSound: 'farol_sfx_dialogo' };
}
export function refineInGameMenus(source) {
  const project = structuredClone(source);
  const events = [];
  const dialogues = [];
  const detail = (key, room, text) => { dialogues.push(dialogue(key, text)); events.push(event(key, room, [`show_dialogue ${key}`])); return key; };
  const items = {};
  items.menu_start = [['missions','Missoes','missoes'], ['inventory','Inventario','inventario'], ['map','Mapa','mapa_menu'], ['save','Salvar','salvar'], ['settings','Configuracoes','configuracoes']].map(([id,label,targetScreenID]) => ({ id,label,targetScreenID,action:'push_screen',eventName:'',enabled:true })).concat({ ...back(), label:'Retomar' });
  const milestones = [
    ['var_campaign_finished', 'A luz do farol foi restaurada. A campanha esta completa.'],
    ['var_boost', 'Dispute o Circuito Final e complete as tres voltas.'],
    ['var_relay_cleared', 'Venca a Arena Arrancada para conquistar o impulso.'],
    ['var_shield', 'Derrote o Guardiao do Rele e libere a arena.'],
    ['var_guardian_bond', 'Atravesse a Tempestade para obter a blindagem.'],
    ['var_energy_cell', 'Leve a celula ao Conselho e confirme a alianca.'],
    ['var_usina_combat_cleared', 'Encontre a celula na saida da Usina Submersa.'],
    ['var_market_shortcut', 'Atravesse a Usina Submersa e derrote a sentinela.'],
    ['var_observatory_read', 'Siga ate o Mercado Suspenso e encontre o atalho.'],
    ['var_warehouse_inspected', 'Examine o Observatorio do Farol.'],
    ['var_grip', 'Explore o Armazem das Mares e consulte a carta.'],
    ['var_frame', 'Use o mapa de viagem para seguir aos Penedos do Vento.']
  ];
  const commands = [];
  for (const [i, [variable, text]] of milestones.entries()) {
    const key = `ingame-next-${i}`; dialogues.push(dialogue(key,text));
    commands.push(`if_variable ${variable} 1`, `show_dialogue ${key}`, 'else');
  }
  dialogues.push(dialogue('ingame-next-start', 'Converse com a Guardia em Porto Lumen para obter a estrutura do farol.'));
  commands.push('show_dialogue ingame-next-start', ...milestones.map(() => 'condition_end'));
  events.push(event('missoes_detalhar_proximo','missoes', commands));
  items.missoes = [option('next','Proximo objetivo','missoes_detalhar_proximo'),
    option('frame','Estrutura do farol',detail('ingame-mission-frame','missoes','Converse com a Guardia em Porto Lumen. OK indica que a estrutura foi obtida.'),1),
    option('cell','Celula de energia',detail('ingame-mission-cell','missoes','Derrote a sentinela e encontre a celula na saida da Usina.'),2),
    option('bond','Alianca da Guardia',detail('ingame-mission-bond','missoes','Confirme a alianca no Conselho da Guardia.'),8),
    option('final','Farol restaurado',detail('ingame-mission-final','missoes','Conclua o Circuito Final para restaurar a luz.'),14),back()];
  items.inventario = [
    ['frame','Estrutura',1,'Estrutura do farol obtida em Porto Lumen.'],
    ['grip','Aderencia',4,'Modulo obtido nos Penedos do Vento.'],
    ['cell','Celula de energia',2,'Celula coletada na saida da Usina Submersa.'],
    ['shield','Blindagem',6,'Modulo obtido ao atravessar a Tempestade.'],
    ['boost','Impulso',7,'Modulo obtido ao vencer a Arena Arrancada.']
  ].map(([id,label,index,text]) => option(id,label,detail(`ingame-item-${id}`,'inventario',`${text} OK: obtido. NAO: ainda nao obtido.`),index)).concat(back());
  items.mapa_menu = [
    ['porto','Porto Lumen',1,'Inicio da jornada. Fale com a Guardia para obter a estrutura.'],
    ['penedos','Penedos do Vento',4,'Acesso pelo mapa de viagem. Complete o percurso de plataforma.'],
    ['armazem','Armazem das Mares',10,'Depois dos Penedos. Examine a carta para seguir ao Observatorio.'],
    ['observatorio','Observatorio',11,'Leia o registro do farol antes de seguir ao Mercado.'],
    ['mercado','Mercado Suspenso',12,'Atravesse o mercado e descubra o acesso a Usina.'],
    ['usina','Usina Submersa',2,'Explore, derrote a sentinela e recolha a celula de energia.'],
    ['conselho','Conselho Guardia',8,'Confirme a alianca. Depois: Tempestade, Rele, Arena e Circuito Final.'],
    ['circuito','Circuito Final',14,'Complete tres voltas. Consulte Missoes para o proximo objetivo.']
  ].map(([id,label,index,text]) => option(id,label,detail(`ingame-map-${id}`,'mapa_menu',`${text} Este mapa serve apenas para consulta.`),index)).concat(back());
  items.salvar = Array.from({length:3},(_,i) => ({ ...option(`slot-${i+1}`,i===0?'Slot 1 Auto':`Slot ${i+1}`,`menu_salvar_slot_${i+1}`),saveSlot:i } )).concat(back());
  items.carregar_jogo = Array.from({length:3},(_,i) => ({ ...option(`load-slot-${i+1}`,`Slot ${i+1}`,`carregar_jogo_slot_${i+1}`),saveSlot:i,requiresSave:true })).concat(back());
  for (let i=0;i<3;i++) {
    events.push(event(`menu_salvar_slot_${i+1}`,'salvar',[`save_game ${i}`]));
    events.push(event(`carregar_jogo_slot_${i+1}`,'carregar_jogo',[`if_save_game ${i}`,`load_game ${i}`,'condition_end']));
  }
  const settings = project.rooms.find(r => r.name === 'configuracoes').runtime.config;
  items.configuracoes = settings.items.map(i => {
    if (i.id==='language') return {...i,eventName:'configuracoes_idioma',valueLabels:['Portugues','English','Espanol']};
    if (i.id==='controls') return {...i,label:'Controles',eventName:detail('ingame-controls','configuracoes','Direcional: mover e selecionar. A: confirmar ou interagir. B: voltar. Start: pausa. Dungeon: R pausa, Start mapa, Select mochila. Na corrida: A acelera, B freia; direcional vira.')};
    return i;
  });
  events.push(event('configuracoes_idioma','configuracoes',['if_variable var_language 0','set_language pt-BR','else','if_variable var_language 1','set_language en','else','set_language es','condition_end','condition_end']));
  const presets = [];
  const transform = r => {
    if (!affected.has(r.name)) return r;
    const x = r.name === 'menu_start' ? 72 : 24;
    const list = items[r.name].map((i,index) => ({...i, clickBox:{x,y:40+(index%6)*16,width:216-x,height:12}}));
    const config = {...r.runtime.config, title:titles[r.name], items:list, hudListRows:6, presentationMode:'hud', hudPresetId:`hud-ingame-${r.name}`};
    delete config.hudMode; delete config.screens; delete config.nodes; delete config.presentation;
    if(r.name==='menu_start') config.titleTextVariableName='var_character_name';
    if(r.name==='mapa_menu') config.mapMode='inspect';
    presets.push(hud(r.name,list));
    return {...r,backgroundAssetName:'menu-inicial-v3-gba.png',backgroundRenderMode:'tilemap',gbStudioUseBackgroundLayout:true,hudPresetId:config.hudPresetId,runtime:{...r.runtime,config}};
  };
  project.rooms = project.rooms.filter(r=>r.name!=='perfil_equipe').map(transform);
  project.scenas = project.scenas.filter(r=>r.name!=='perfil_equipe').map(r => {
    return affected.has(r.name) ? transform(r) : r;
  });
  const genderPortraits = source.actors.filter(a=>a.roomName==='escolha_genero' && /^gender-player-(male|female)-32x64\.png$/.test(a.spriteSheet));
  const portraits = genderPortraits.length ? genderPortraits : source.actors.filter(a=>a.roomName==='menu_start' && /^gender-player-(male|female)-32x64\.png$/.test(a.spriteSheet));
  project.actors = project.actors.filter(a=>!affected.has(a.roomName) && a.roomName!=='perfil_equipe');
  for (const actor of portraits) {
    const { menuItemID, scriptName, eventBindings, ...portrait } = actor;
    project.actors.push({...portrait,id:`pause-${actor.menuCharacterVariant}`,name:`Jogador - ${actor.menuCharacterVariant}`,roomName:'menu_start',x:3,y:6,menuActorRole:'decorative',menuVisibilityVariable:'var_character_gender',menuVisibilityValue:actor.menuCharacterVariant==='male'?0:1,menuEntryAnimation:'slide_down',menuEntryOffsetY:8,menuEntryAnimationFrames:8});
  }
  const replacements = new Set(events.map(e=>e.name));
  project.events = project.events.filter(e=>e.roomName!=='perfil_equipe' && !replacements.has(e.name)).map(e=> affected.has(e.roomName) && /ao_entrar$/.test(e.name) ? {...e,steps:e.steps.filter(s=>!s.command.startsWith('play_music '))} : e).concat(events);
  const keys = new Set(dialogues.map(d=>d.key));
  project.dialogues = project.dialogues.filter(d=>d.key!=='missao_proximo_passo' && !keys.has(d.key)).concat(dialogues);
  const unique = [...new Map(presets.map(h=>[h.id,h])).values()];
  project.settings.hudPresets = project.settings.hudPresets.filter(h=>!unique.some(n=>n.id===h.id)).concat(unique);
  project.settings.uiDialogs = { ...project.settings.uiDialogs, startMenuPresentation: 'scene' };
  if(project.editorState) {
    project.editorState.scenaConnections = project.editorState.scenaConnections?.filter(c=>c.from!=='perfil_equipe' && c.to!=='perfil_equipe');
    if(project.editorState.sceneMapPositions) delete project.editorState.sceneMapPositions.perfil_equipe;
    if(project.editorState.activeScenaName==='perfil_equipe') {
      project.editorState.activeScenaName='menu_start';
      project.editorState.activeScenaID=project.rooms.find(r=>r.name==='menu_start').id;
    }
  }
  return project;
}
