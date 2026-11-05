import {applyApprovedMenuScenes} from './approved-menu-scenes-project.mjs';
/** Additive showcase authoring. Existing art, tracks, actors and user card positions are retained. */
const clone=value=>structuredClone(value);
export function extendRacingMenus(source) {
  const p=clone(source);
  const room=name=>p.rooms.find(r=>r.name===name);
  const put=(rows,item,key='id')=>{const i=rows.findIndex(v=>v[key]===item[key]);if(i<0)rows.push(item);else rows[i]=item;};
  const edit=(name,change)=>{for(const key of ['rooms','scenas']){const i=p[key].findIndex(r=>r.name===name);if(i>=0)p[key][i]=change(clone(p[key][i]));}if(p.scena?.name===name)p.scena=change(clone(p.scena));};
  const event=(name,roomName,commands)=>put(p.events,{id:name,name,...(roomName?{roomName}:{}),category:roomName?'Exemplo · Corridas e mochila':'Global',commands:commands.join('\n'),steps:commands.map((command,i)=>({id:`${name}-${i}`,command,isEnabled:true}))},'name');
  const dialogue=(key,pt,en,es,choices=[])=>put(p.dialogues,{key,character:'',portrait:'',emote:'',text:en,translations:{'pt-BR':pt,en,es},choices:choices.map(c=>c[1]),choiceTranslations:{'pt-BR':choices.map(c=>c[0]),en:choices.map(c=>c[1]),es:choices.map(c=>c[2])},translationStatus:{'pt-BR':'draft-ai',en:'draft-ai',es:'draft-ai'},textSound:'farol_sfx_texto',confirmSound:'farol_sfx_dialogo'},'key');
  const sounds=clone(room('configuracoes').runtime.config.actionSounds);
  if(!sounds)throw Error('Approved internal menu sounds are required.');
  const prepare='corrida_preparacao',results='corrida_resultados',tools='inventario_ferramentas',confirm='corrida_confirmacao';
  const base=clone(room('menu_start'));
  const menu=(name,title,items)=>{
    const value={...clone(base),id:'scene-'+name,name,displayName:title,playerActorName:'',onEnterEventName:'',eventBindings:{},runtime:{type:'menu',config:{...clone(base.runtime.config),role:'menu',title,items,hudListRows:6,hudHeader:{x:5,y:2,width:9,backgroundColor:11520,textColor:24478},actionSounds:clone(sounds)}}};
    delete value.runtime.config.titleTextVariableName;delete value.onEnterEventName;
    const init='race_menu_'+name+'_init';event(init,name,['noop']);value.eventBindings.onInit=init;
    value.supportBriefing={title,objective:title,success:'Usar A para escolher e B para voltar.'};
    for(const key of ['rooms','scenas'])put(p[key],clone(value),'name');
    const prototypes=p.actors.filter(a=>a.roomName==='menu_start');
    for(const proto of prototypes){
      if(proto.menuActorRole==='option'||proto.id.startsWith('approved-menu-'))continue;
      const actor={...clone(proto),id:'race-menu-'+name+'-'+proto.id,name:title+' '+proto.name,roomName:name};
      delete actor.prefabID;put(p.actors,actor);
    }
    const prototype=prototypes.find(a=>a.menuActorRole==='option');
    if(prototype)for(const item of items){const actor={...clone(prototype),id:'race-menu-'+name+'-'+item.id,name:title+' '+item.label,roomName:name,menuItemID:item.id,menuPositionPixels:{x:item.clickBox.x+2,y:item.clickBox.y+2}};delete actor.prefabID;actor.x=Math.floor(actor.menuPositionPixels.x/8);actor.y=Math.floor(actor.menuPositionPixels.y/8);put(p.actors,actor);}
  };
  const item=(id,label,eventName,index,extra={})=>({id,label,action:'select',targetScreenID:'',eventName,enabled:true,clickBox:{x:20,y:[30,44,58,73,87,101][index%6],width:112,height:12},...extra});
  const bind=(source,index,format='number')=>({source,index,format});
  menu(prepare,'PROVAS',[
    item('topdown','FAROL','race_enter_topdown',0,{detailLines:['3 voltas','L: impulso','Marcos recarregam']}),
    item('perspective','MARÉ','race_enter_perspective',1,{detailLines:['3 voltas','Câmera e minimapa','L: impulso']}),
    item('controls','CONTROLES','race_controls',2),
    item('best-topdown','F','race_records_help',3,{binding:bind('text',1)}),
    item('best-perspective','M','race_records_help',4,{binding:bind('text',2)}),
    {...item('load','CARREGAR','',5),action:'push_screen',targetScreenID:'carregar_jogo',requiresSave:true},
    item('back','VOLTAR','race_return_map',6)
  ]);
  menu(confirm,'REPETIR?',[
    {...item('cancel','CANCELAR','',0),action:'pop_screen',detailLines:['Retomar','a prova','em pausa']},
    item('restart','REINICIAR','race_retry',1,{detailLines:['Nova','largada','itens OK']})
  ]);
  const confirmationHud=clone(p.settings.hudPresets.find(h=>h.id==='hud-book-menu_start'));
  confirmationHud.id='hud-book-race-confirm';confirmationHud.name='Confirmação da corrida';
  confirmationHud.components.forEach((component,i)=>{if(i===3 || i===7)Object.assign(component,{x:0,y:0,width:8});if(i>=4 && i<=6)Object.assign(component,{x:148,y:112+(i-4)*10,width:72});});
  put(p.settings.hudPresets,confirmationHud);
  edit(confirm,r=>{r.hudPresetId=confirmationHud.id;r.runtime.config.hudPresetId=confirmationHud.id;r.runtime.config.hudListRows=2;return r;});
  menu(results,'PROVA',[
    item('position','POS','race_results_help',0,{binding:bind('text',4)}),
    item('time','T','race_results_help',1,{binding:bind('text',3)}),
    item('rating','MED','race_results_help',2,{binding:bind('text',5)}),
    item('best','REC','race_records_help',3,{binding:bind('text',6)}),
    item('retry','REPETIR','race_retry',4),
    item('continue','CONTINUAR','race_results_continue',5)
  ]);
  const resultHud=clone(p.settings.hudPresets.find(h=>h.id==='hud-book-menu_start'));
  resultHud.id='hud-book-race-results';resultHud.name='Resultados da corrida';
  for(const component of resultHud.components)if(component.runtimeText&&component.x===37)component.width=96;
  put(p.settings.hudPresets,resultHud);
  edit(results,r=>{r.hudPresetId=resultHud.id;r.runtime.config.hudPresetId=resultHud.id;return r;});
  const inventoryKeys=new Set();
  for(const e of p.events)for(const step of e.steps??[]){const parts=step.command.split(/\s+/);if(['add_item','has_item'].includes(parts[0]))inventoryKeys.add(parts[1]);if(parts[0]==='set_equipped_item'&&parts[2]!=='none')inventoryKeys.add(parts[2]);}
  const keys=[...inventoryKeys].sort(),keyIndex=key=>{const i=keys.indexOf(key);if(i<0)throw Error('Missing inventory item '+key);return i;};
  const equippedLabels=['NENHUM',...keys.map(key=>({'currency_gold':'MOEDAS','quest_fragment':'FRAGMENTO','usina_cell':'CÉLULA','zz_signal_chart':'CARTA','zz_signal_relay':'RELÉ','zzz_guardian_compass':'BÚSSOLA','zzz_lumen_tool':'FERRAM.'}[key]??key.slice(0,12)))];
  menu(tools,'MOCHILA',[
    item('tool','FERRAM.','race_tool_actions',0,{binding:bind('inventory',keyIndex('zzz_lumen_tool'),'count'),detailLines:['Usada no treino','A: equipar/retirar','Não é consumida']}),
    item('compass','BÚSSOLA','race_compass_help',1,{binding:bind('inventory',keyIndex('zzz_guardian_compass'),'count'),detailLines:['Bônus passivo','Amplia a carga','do treino']}),
    item('chart','CARTA','race_chart_help',2,{binding:bind('inventory',keyIndex('zz_signal_chart'),'count')}),
    item('relay','RELÉ','race_relay_help',3,{binding:bind('inventory',keyIndex('zz_signal_relay'),'count')}),
    item('equipped','EQ','race_tool_actions',4,{binding:bind('equipped',0),valueLabels:equippedLabels}),
    {...item('back','VOLTAR','',5),action:'pop_screen'}
  ]);
  for(const name of ['circuito_final','circuito_perspectiva']){
    const perspective=name==='circuito_perspectiva';
    edit(name,r=>{
      r.hudPresetId='hud-porto-corrida-challenge';
      r.runtime.config.challenge={boostVariableIndex:p.variables.findIndex(v=>v.name==='var_boost'),bestTimeTextIndex:perspective?2:1,resultTimeTextIndex:3,resultPositionTextIndex:4,resultRatingTextIndex:5,resultBestTextIndex:6,goldSeconds:80,silverSeconds:120};
      if(perspective){r.runtime.config.perspectiveCamera={height:56,distance:80,focalLength:96};r.runtime.config.showMinimap=true;}
      r.eventBindings={...r.eventBindings,onVictory:'race_finish',onDefeat:'race_finish'};
      return r;
    });
    const boot=p.events.find(e=>e.name===name+'_ao_entrar');
    const commands=boot.steps.map(s=>s.command).filter(c=>!/^attach_button R /.test(c));
    event(name+'_ao_entrar',name,commands);
  }
  const hud=clone(p.settings.hudPresets.find(h=>h.id==='hud-porto-corrida'));
  hud.id='hud-porto-corrida-challenge';hud.name='Corrida · Impulso';
  hud.description='Painéis aprovados com reserva de impulso no canto inferior esquerdo.';
  const panel=clone(hud.components[0]),text=clone(hud.components[1]);
  Object.assign(panel,{id:'race-boost-panel',label:'Impulso',x:3,y:141});
  Object.assign(text,{id:'race-boost-text',label:'Impulso',text:'L 0/3',x:10,y:145});
  hud.components.push(panel,text);for(const component of hud.components)if(['race-panel-3','race-text-3'].includes(component.id))delete component.behavior;put(p.settings.hudPresets,hud);
  for(const r of [...p.rooms])if(r.runtime?.type==='menu'&&r.runtime.config.menuProfile==='in_game')edit(r.name,v=>{v.runtime.config.actionSounds=clone(sounds);return v;});
  const option=p.actors.find(a=>a.roomName==='menu_start'&&a.menuActorRole==='option');
  edit('menu_start',r=>{
    const c=r.runtime.config;c.items=c.items.filter(i=>!['tools','controls','restart'].includes(i.id));c.items.find(i=>i.id==='inventory').label='MÓDULOS';
    c.items.push({...item('tools','FERRAMENTAS','',7),action:'push_screen',targetScreenID:tools},item('controls','CONTROLES','race_context_controls',8),{...item('restart','REINICIAR','',9),action:'push_screen',targetScreenID:confirm,availableRuntime:'racing'});
    c.items.forEach((i,n)=>i.clickBox={x:20,y:[30,44,58,73,87,101][n%6],width:112,height:12});return r;
  });
  for(const id of ['tools','controls','restart'])if(option){const i=room('menu_start').runtime.config.items.find(v=>v.id===id);const actor={...clone(option),id:'race-pause-'+id,name:i.label,roomName:'menu_start',menuItemID:id,menuPositionPixels:{x:i.clickBox.x+2,y:i.clickBox.y+2},x:Math.floor((i.clickBox.x+2)/8),y:Math.floor((i.clickBox.y+2)/8)};delete actor.prefabID;put(p.actors,actor);}
  for(const actor of p.actors.filter(a=>a.roomName==='menu_start'&&a.menuActorRole==='option')) {
    const entry=room('menu_start').runtime.config.items.find(i=>i.id===actor.menuItemID);
    if(entry){actor.menuPositionPixels={x:entry.clickBox.x+2,y:entry.clickBox.y+2};actor.x=Math.floor(actor.menuPositionPixels.x/8);actor.y=Math.floor(actor.menuPositionPixels.y/8);}
  }
  event('mapa_viajar_circuito','mapa_rota',['set_variable var_active_route 7','change_scene '+prepare]);
  event('race_enter_topdown',prepare,['scene_stack_clear','change_scene circuito_final 29 9 right']);
  event('race_enter_perspective',prepare,['scene_stack_clear','change_scene circuito_perspectiva 29 14 right']);
  event('race_return_map','',['scene_stack_clear','change_scene mapa_rota']);
  event('race_finish','',['play_sfx corrida_chegada','wait 45','save_game 0','scene_stack_push racing','change_scene '+results]);
  event('race_retry','',['if_engine_field previous_room 1','scene_stack_clear','change_scene circuito_perspectiva 29 14 right','else','scene_stack_clear','change_scene circuito_final 29 9 right','condition_end']);
  event('race_results_continue',results,['if_engine_field racing_result 1','if_engine_field previous_room 0','if_variable var_campaign_finished 0','call_procedure circuito_concluir','else','scene_stack_clear','change_scene '+prepare,'condition_end','else','scene_stack_clear','change_scene '+prepare,'condition_end','else','scene_stack_clear','change_scene '+prepare,'condition_end']);
  event('race_context_controls','',['if_engine_field previous_runtime 7','show_dialogue race_controls','else','show_dialogue coast_controls','condition_end']);
  const existingControls=p.dialogues.find(d=>d.key==='coast_controls')??p.dialogues.find(d=>d.key==='controles');
  if(!existingControls){const d=p.dialogues.find(d=>d.key.includes('controls')||d.key.includes('controles'));if(d)event('race_context_controls','',['if_engine_field previous_runtime 7','show_dialogue race_controls','else','show_dialogue '+d.key,'condition_end']);}
  event('race_controls','',['show_dialogue race_controls']);
  event('race_results_help','',['show_dialogue race_results_help']);
  event('race_records_help','',['show_dialogue race_records_help']);
  event('race_tool_actions','',['has_item zzz_lumen_tool 1',`if_engine_field equipped_item_0 ${keyIndex('zzz_lumen_tool')}`,'set_equipped_item 0 none','show_dialogue race_tool_unequipped','else','set_equipped_item 0 zzz_lumen_tool','show_dialogue race_tool_equipped','condition_end','else','show_dialogue showcase_need_tool','condition_end']);
  event('race_compass_help','',['show_dialogue race_compass_help']);
  event('race_chart_help','',['show_dialogue race_chart_help']);
  event('race_relay_help','',['show_dialogue race_relay_help']);
  dialogue('ingame-item-boost','Arena: prêmio da vitória principal; o treino não concede este módulo. Nas corridas, libera impulso no L, uma carga na largada e recarga nos marcos, até 3. Use nas retas.','Arena: reward for winning the main fight; training does not grant it. Races gain L boost, one starting charge and checkpoint refills, up to 3. Use it on straights.','Arena: premio por la victoria principal; el entrenamiento no lo concede. En carreras permite impulso con L, una carga inicial y recargas en controles, hasta 3. Úsalo en rectas.');
  dialogue('tide_module_boost','Módulo de impulso obtido! Nas corridas, L usa uma carga. Você larga com 1 e cada marco repõe uma, até 3. O treino não concede este módulo.','Boost module acquired! In races, L uses one charge. Start with 1; each checkpoint restores one, up to 3. Training does not grant this module.','¡Módulo de impulso obtenido! En carreras, L usa una carga. Empiezas con 1 y cada control repone una, hasta 3. El entrenamiento no lo concede.');
  dialogue('race_controls','A ou cima: acelerar. B ou baixo: frear. Esquerda/direita: virar. L: impulso, se tiver o módulo. Cada marco recarrega uma carga, até 3. Start: pausar. Complete 3 voltas pelos 4 marcos.','A or Up: accelerate. B or Down: brake. Left/Right: steer. L: boost with the module. Each checkpoint restores one charge, up to 3. Start: pause. Finish 3 laps through all 4 checkpoints.','A o arriba: acelerar. B o abajo: frenar. Izquierda/derecha: girar. L: impulso con el módulo. Cada control repone una carga, hasta 3. Start: pausa. Completa 3 vueltas por los 4 controles.');
  dialogue('race_results_help','T: tempo. REC: recorde desta modalidade. MED: avaliação. A posição compara seu progresso com os dois rivais. Ouro: 1º em até 80 s. Prata: até 2º em 120 s. Bronze: concluir. Se os rivais terminam primeiro, a prova conta como treino.','T: time. REC: this race record. MED: rating. Position compares progress against two rivals. Gold: 1st within 80 s. Silver: top 2 within 120 s. Bronze: finish. If the rivals finish first, the race counts as practice.','T: tiempo. REC: récord de la modalidad. MED: valoración. La posición compara tu progreso con dos rivales. Oro: 1.º en 80 s. Plata: hasta 2.º en 120 s. Bronce: terminar. Si los rivales terminan antes, cuenta como práctica.');
  dialogue('race_records_help','Cada modalidade tem seu próprio recorde. Só uma prova concluída pode melhorar o tempo. O resultado é salvo ao terminar; salve também ao continuar a campanha.','Each race has its own record. Only a completed race can improve it. Results save at the finish; save again as you continue the campaign.','Cada prueba tiene su récord. Solo una carrera completada puede mejorarlo. El resultado se guarda al terminar; guarda también al continuar la campaña.');
  dialogue('race_tool_equipped','Ferramenta equipada. Ela continua na mochila e pode ser usada no treino do Porto.','Tool equipped. It stays in your bag and can be used in harbor training.','Herramienta equipada. Sigue en la mochila y se usa en el entrenamiento del puerto.');
  dialogue('race_tool_unequipped','Equipamento retirado. A ferramenta continua na mochila.','Unequipped. The tool stays in your bag.','Equipo retirado. La herramienta sigue en la mochila.');
  dialogue('race_compass_help','A bússola do Conselho é um recurso passivo: amplia a carga do treino. Não precisa equipar e não é consumida.','The Council compass is passive: it increases training charge. No equipping is required and it is not consumed.','La brújula del Consejo es pasiva: amplía la carga del entrenamiento. No necesita equiparse ni se consume.');
  dialogue('race_chart_help','A carta encontrada no Armazém orienta a missão O sinal perdido. Ela permanece na mochila para consulta.','The Warehouse chart guides The Lost Signal mission. It remains in your bag for reference.','La carta del Almacén guía la misión La señal perdida. Permanece en la mochila para consultarla.');
  dialogue('race_relay_help','A peça do Armazém é consumida ao reparar o sinal no Farol. A quantidade aqui acompanha essa instalação.','The Warehouse part is consumed when repairing the lighthouse signal. This quantity tracks that installation.','La pieza del Almacén se consume al reparar la señal del Faro. Esta cantidad refleja la instalación.');
  edit(results,r=>{r.runtime.config.onBackEventName='race_results_continue';return r;});
  edit(prepare,r=>{r.runtime.config.onBackEventName='race_return_map';return r;});
  // Shared continuation runs from the result screen too, including the existing epilogue.
  const conclude=p.events.find(e=>e.name==='circuito_concluir');
  if(conclude){conclude.category='Global';conclude.roomName='circuito_final';conclude.eventKind='procedure';conclude.procedure={parameters:[],locals:[]};}
  edit('arena_arrancada',r=>{r.campaign.nextScene=prepare;return r;});
  // The authored flow mirrors preparation/results; the old R links are retired.
  if(p.editorState?.scenaConnections){
    const owned=new Set(['circuito_final','circuito_perspectiva',prepare,results,confirm]);
    const connections=p.editorState.scenaConnections.filter(c=>!owned.has(c.from)).map(c=>['arena_vencer_rival','mapa_viajar_circuito'].includes(c.eventName)?{...c,to:prepare,entry:{x:0,y:0,width:1,height:1}}:c);
    const link=(from,to,eventName)=>connections.push({id:'race-link-'+from+'-'+to,from,to,eventName,entry:{x:0,y:0,width:1,height:1},transition:{style:'cut',durationFrames:0,fadeOut:false,fadeIn:false}});
    for(const name of ['circuito_final','circuito_perspectiva']){
      link(prepare,name,name==='circuito_final'?'race_enter_topdown':'race_enter_perspective');
      link(name,results,'race_finish');link(results,name,'race_retry');link(confirm,name,'race_retry');
    }
    link(prepare,'mapa_rota','race_return_map');link(results,prepare,'race_results_continue');
    link(results,'porto_lumen','race_results_continue');p.editorState.scenaConnections=connections;
  }
  const explorer=p.editorState?.sceneExplorer;
  if(explorer){const group=explorer.groups.find(g=>g.id==='scene-group-example-game-menus');if(group)for(const name of [prepare,results,tools,confirm])if(!group.sceneIDs.includes('scene-'+name))group.sceneIDs.push('scene-'+name);}
  if(p.editorState?.sceneMapPositions)for(const [i,name] of [prepare,results,tools,confirm].entries())if(!p.editorState.sceneMapPositions[name])p.editorState.sceneMapPositions[name]={x:[324,612,900,36][i],y:i===3?2754:2452};
  // Keep the active document projection when it is outside this task.
  return applyApprovedMenuScenes(p);
}

/** Keep approved authored race/menu work when rebuilding the rest of the example. */
export function preserveRacingMenus(source,generated) {
  if(!source.events?.some(e=>e.name==='race_finish'))return generated;
  const p=extendRacingMenus(generated);
  const rooms=new Set(['circuito_final','circuito_perspectiva','menu_start','inventario','corrida_preparacao','corrida_resultados','corrida_confirmacao','inventario_ferramentas']);
  const upsert=(rows,item,key='id')=>{const i=rows.findIndex(v=>v[key]===item[key]);if(i<0)rows.push(clone(item));else rows[i]=clone(item);};
  for(const key of ['rooms','scenas'])for(const room of source[key].filter(r=>rooms.has(r.name)))upsert(p[key],room,'name');
  const menuRooms=new Set([...rooms].filter(name=>!['circuito_final','circuito_perspectiva'].includes(name)));
  const generatedActors=new Map(p.actors.map(actor=>[actor.id,actor])),sourceIDs=new Set(source.actors.map(actor=>actor.id));
  p.actors=[...source.actors.filter(actor=>menuRooms.has(actor.roomName)||generatedActors.has(actor.id)).map(actor=>clone(menuRooms.has(actor.roomName)?actor:generatedActors.get(actor.id))),...p.actors.filter(actor=>!sourceIDs.has(actor.id)&&!menuRooms.has(actor.roomName))];
  const hooks=new Set(['circuito_final_ao_entrar','circuito_perspectiva_ao_entrar','circuito_concluir','mapa_viajar_circuito','arena_vencer_rival']);
  for(const e of source.events.filter(e=>e.name.startsWith('race_')||hooks.has(e.name)))upsert(p.events,e,'name');
  for(const d of source.dialogues.filter(d=>d.key.startsWith('race_')||['ingame-item-boost','tide_module_boost'].includes(d.key)))upsert(p.dialogues,d,'key');
  for(const h of source.settings.hudPresets.filter(h=>['hud-porto-corrida-challenge','hud-book-race-confirm','hud-book-race-results'].includes(h.id)))upsert(p.settings.hudPresets,h);
  for(const key of ['sceneMapPositions','sceneExplorer'])if(source.editorState?.[key])p.editorState[key]=clone(source.editorState[key]);
  if(source.scena&&rooms.has(source.scena.name))p.scena=clone(source.scena);
  return applyApprovedMenuScenes(p,source.assets.some(a=>a.name==='arrival-v21-background.png'));
}
