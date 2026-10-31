import {fitProjectSpriteFrames} from './lib/sprite-canvas-audit.mjs';
const clone = value => structuredClone(value);
const upsert = (rows, items, key = 'id') => {
  const result = clone(rows ?? []);
  for (const item of items) {
    const index = result.findIndex(row => row[key] === item[key]);
    if (index < 0) result.push(clone(item)); else result[index] = clone(item);
  }
  return result;
};
const event = (name, roomName, commands) => ({id:name,name,roomName,category:'Cena',command:'noop',steps:commands.map((command,i)=>({id:name+'-'+i,command,isEnabled:true}))});
const text = (key, pt, en, es) => ({key,character:'',portrait:'',emote:'',text:en,textSound:'farol_sfx_texto',confirmSound:'farol_sfx_dialogo',choices:[],translations:{'pt-BR':pt,en,es},choiceTranslations:{'pt-BR':[],en:[],es:[]},translationStatus:{'pt-BR':'draft-ai',en:'draft-ai',es:'draft-ai'}});
export const COAST_DEPTH_VARIABLES = [
  {name:'var_coast_usina',initialValue:0,displayName:'Usina · sequência de energia'},
  {name:'var_coast_minute',initialValue:1020,displayName:'Porto · minutos do expediente'},
  {name:'var_coast_evening',initialValue:0,displayName:'Porto · fim de tarde'},
  {name:'var_coast_lift',initialValue:0,displayName:'Penedos · montacargas ligado'},
  {name:'var_coast_clock_ready',initialValue:1,displayName:'Porto · relógio inicializado'}
];

/** Pure authoring transformation. New artwork stays in a review project until
 * its manifest has explicit visual approval; scenery files are never rewritten. */
export function deepenExampleCampaign(source, manifest) {
  const p = clone(source);
  const required = ['coast-freight-lift.png','coast-port-lantern.png',...['near','mid','far'].map(d=>'coast-valve-'+d+'.png')];
  for (const name of required) if (!manifest?.assets?.some(a=>a.name===name)) throw Error('Missing reviewed coast asset: '+name);
  p.assets=upsert(p.assets,manifest.assets);
  if (p.events.some(e=>e.name==='coast_port_clock_tick')) return p;
  p.variables=upsert(p.variables,COAST_DEPTH_VARIABLES.map(v=>({id:v.name,...v})),'name');
  if(p.variables.length>64) throw Error('Coastal additions exceed the 64 saved-variable slots.');
  const room = name => p.rooms.find(r=>r.name===name);
  const updateRoom = (name, fn) => {
    for(const key of ['rooms','scenas','scenes']) if(Array.isArray(p[key])) p[key]=p[key].map(r=>r.name===name?fn(clone(r)):r);
    if(p.scena?.name===name)p.scena=fn(clone(p.scena));
  };
  const addEvent = (name, scene, commands) => {p.events=upsert(p.events,[event(name,scene,commands)],'name');};
  const baseEvent = name => {
    const current=p.events.find(e=>e.name===name);if(!current)throw Error('Missing campaign event: '+name);
    const base='coast_base_'+name;
    if(!p.events.some(e=>e.name===base))p.events.push({...clone(current),id:base,name:base});
    return base;
  };
  // Native OBJ parts retain bottom-center anchors. Source pixels and all
  // existing animation metadata remain untouched.
  for(const asset of manifest.assets){
    const {frameWidth:w,frameHeight:h,frameCount}=asset.metadata;
    const state=asset.id+'-state';
    const animations=Array.from({length:frameCount},(_,i)=>{
      const name=frameCount===1?'idle':i?'on':'off',id=asset.id+'-'+name;
      return {id,name,spriteSheet:asset.name,stateID:state,frameWidth:w,frameHeight:h,frameCount:1,fps:1,loops:true,state:name,direction:'none',colorMode:'8bpp',sourceColorMode:'8bpp',originX:0,originY:8,originSpace:'animator',frames:[{frameIndex:0,sourceFrameIndex:i,width:w,height:h,originX:0,originY:8,tiles:[{x:-w/2,y:0,sliceX:i*w,sliceY:0,sourceSheet:asset.name,tileWidth:w,tileHeight:h,flipX:false,flipY:false,objPalette:'OBP0',paletteIndex:0,priority:false}]}]};
    });
    p.animations=upsert(p.animations,animations);
    p.animationStates=upsert(p.animationStates,[{id:state,name:'default',spriteSheet:asset.name,animationType:'fixed',mirrorLeftFromRight:false,animationIDs:animations.map(a=>a.id)}]);
  }
  const stateFor = name => manifest.assets.find(a=>a.name===name).id+'-state';
  const coastAnimations=fitProjectSpriteFrames({animations:p.animations.filter(a=>a.id?.startsWith('coast-'))}).animations;
  p.animations=upsert(p.animations,coastAnimations);
  updateRoom('menu_start',r=>{
    const items=r.runtime.config.items,save=items.findIndex(i=>i.id==='save');
    if(!items.some(i=>i.id==='load'))items.splice(save+1,0,{id:'load',label:'CARREGAR',action:'push_screen',targetScreenID:'carregar_jogo',eventName:''});
    const boxes=items.filter(i=>i.clickBox).map(i=>clone(i.clickBox));
    for(const [i,item]of items.entries())item.clickBox=clone(boxes[i%r.runtime.config.hudListRows]);
    return r;
  });
  const pauseItems=room('menu_start').runtime.config.items;
  const saveCursor=p.actors.find(a=>a.roomName==='menu_start'&&a.menuItemID==='save');
  if(saveCursor&&!p.actors.some(a=>a.roomName==='menu_start'&&a.menuItemID==='load')){
    const loadCursor={...clone(saveCursor),id:'coast-menu-load',name:'Selection load',menuItemID:'load'};
    delete loadCursor.prefabID;p.actors.push(loadCursor);
  }
  for(const a of p.actors.filter(a=>a.roomName==='menu_start'&&a.menuActorRole==='option')){
    const item=pauseItems.find(i=>i.id===a.menuItemID);
    if(!item)continue;
    a.menuPositionPixels={x:item.clickBox.x+2,y:item.clickBox.y+2};
    a.x=Math.floor(a.menuPositionPixels.x/8);a.y=Math.floor(a.menuPositionPixels.y/8);
  }

  // Four-unit optional training. Approved combatants and portraits are reused.
  const sentinel=p.actors.find(a=>a.id==='tactical-sentinel');
  // The HUD reads the full font from ROM and uploads visible glyphs into its
  // dedicated cache. Reserve one streaming frame instead of the full atlas.
  const tacticalFont=p.assets.find(a=>a.name==='tactical-compact-font-8x8.png');
  tacticalFont.metadata.streamFrames=true;
  const copySentinel=(id,name,x,y)=>{const a={...clone(sentinel),id,name,x,y};delete a.prefabID;return a;};
  p.actors=upsert(p.actors,[copySentinel('coast-tactical-support','Autômato de apoio',5,11),copySentinel('coast-tactical-ranged','Vigia de treino',8,11)]);
  updateRoom('arena_tatica',r=>{
    const c=r.runtime.config,t=c.tacticalPresentation,base=t.units.find(u=>u.actorId==='tactical-sentinel');
    // These three approved marker PNGs are byte-identical. Reuse one physical
    // resource instead of reserving three copies of its OBJ tiles.
    const duplicateMarkers=new Set([t.rangeAsset,t.targetAsset].filter(name=>name!==t.cursorAsset));
    const markerHash=p.assets.find(a=>a.name===t.cursorAsset)?.metadata?.preparedSha256;
    if(!markerHash||[...duplicateMarkers].some(name=>p.assets.find(a=>a.name===name)?.metadata?.preparedSha256!==markerHash)) throw Error('Shared tactical markers require byte-identical approved artwork.');
    t.rangeAsset=t.cursorAsset;t.targetAsset=t.cursorAsset;
    t.assets=t.assets.filter(a=>!duplicateMarkers.has(a.path));
    c.tactical.units=[{actorIndex:0,team:'player',moveRange:2,attackRange:1,maxHp:6,attackPower:2},{actorIndex:1,team:'enemy',moveRange:2,attackRange:1,maxHp:4,attackPower:1},{actorIndex:2,team:'player',moveRange:3,attackRange:2,maxHp:4,attackPower:1},{actorIndex:3,team:'enemy',moveRange:1,attackRange:2,maxHp:3,attackPower:1}];
    t.units.push({...clone(base),actorId:'coast-tactical-support',label:'APOIO'},{...clone(base),actorId:'coast-tactical-ranged',label:'VIGIA'});
    r.supportBriefing={...r.supportBriefing,objective:'Treinar em dupla contra duas sentinelas, combinando os alcances de Nara e do autômato de apoio.',success:'Derrotar as duas sentinelas. O treino pode ser repetido sem alterar a campanha.'};
    return r;
  });
  p.assets=p.assets.filter(a=>!['tactical-range-48x24.png','tactical-target-48x24.png'].includes(a.name));

  // Three valves use depth-specific actors, independent of the approved walls.
  for(const [i,key,x,y]of [[0,'a',2,8],[1,'b',4,6],[2,'c',8,4]]) for(const on of [false,true]){
    const id='coast-valve-'+key+'-'+(on?'on':'off');
    p.actors.push({id,name:['Admissão','Turbina','Saída'][i]+(on?' · pronta':' · desligada'),roomName:'usina_submersa',x,y,z:0,spriteSheet:'coast-valve-near.png',animationName:on?'on':'off',animationStateID:stateFor('coast-valve-near.png'),dungeonDepthSheets:Object.fromEntries(['near','mid','far'].map(d=>[d,'coast-valve-'+d+'.png'])),dungeonDepthAnimationName:on?'on':'off',dungeonWallMounted:true,eventBindings:{onInteract:'coast_usina_'+key},scriptName:'coast_usina_'+key});
  }
  const valveVisibility=()=>['a','b','c'].flatMap((key,i)=>['if_variable_less_than var_coast_usina '+(i+1),'set_actor_visible coast-valve-'+key+'-off true','set_actor_visible coast-valve-'+key+'-on false','else','set_actor_visible coast-valve-'+key+'-off false','set_actor_visible coast-valve-'+key+'-on true','condition_end']);
  addEvent('coast_usina_sync','usina_submersa',valveVisibility());
  updateRoom('usina_submersa',r=>({...r,eventBindings:{...r.eventBindings,onRestore:'coast_usina_sync'}}));
  for(const [i,key]of ['a','b','c'].entries())addEvent('coast_usina_'+key,'usina_submersa',[
    'if_variable var_coast_usina '+i,'set_variable var_coast_usina '+(i+1),'call_procedure coast_usina_sync',
    ...(i===2?['fade_audio_volume music 0 18 var_audio_music_volume var_audio_master_volume']:[]),'play_sfx dungeon_porta','save_game 0','show_dialogue coast_usina_'+key+'_ready','else',
    'if_variable_greater_than var_coast_usina '+i,'show_dialogue coast_usina_already','else','set_variable var_coast_usina 0','call_procedure coast_usina_sync','play_sfx dungeon_bloqueio','save_game 0','show_dialogue coast_usina_order','condition_end','condition_end'
  ]);
  const usinaBoot=baseEvent('usina_ao_entrar');
  addEvent('usina_ao_entrar','usina_submersa',['call_procedure '+usinaBoot,'call_procedure coast_usina_sync']);
  const usinaDoor=baseEvent('usina_abrir_combate');
  addEvent('usina_abrir_combate','usina_submersa',['if_variable var_usina_combat_cleared 1','call_procedure '+usinaDoor,'else','if_variable var_coast_usina 3','call_procedure '+usinaDoor,'else','show_dialogue coast_usina_order','condition_end','condition_end']);

  // The guard takes one visible step aside. The same saved campaign flag keeps
  // its existing meaning, reward and route requirements.
  const delivery=p.events.find(e=>e.name==='mercado_abrir_atalho');
  delivery.steps=delivery.steps.map(s=>s.command==='set_actor_position market-guard-v1 23 3'?{...s,command:'move_actor_relative market-guard-v1 -1 0'}:s);
  const merchant=baseEvent('mercado_falar_mercador');
  addEvent('mercado_falar_mercador','mercado_suspenso',['if_variable var_relay_cleared 1','show_dialogue coast_market_relay','else','if_variable var_gallery_record 1','show_dialogue coast_market_memory','else','if_variable var_market_shortcut 1','show_dialogue coast_market_delivery','else','call_procedure '+merchant,'condition_end','condition_end','condition_end']);

  // The short harbor routine uses the software game clock, never cartridge RTC.
  for(const [i,x,y]of [[0,35,66],[1,41,66]])p.actors.push({id:'coast-port-lamp-'+i,name:'Lanterna do cais '+(i+1),roomName:'porto_lumen',x,y,z:0,spriteSheet:'coast-port-lantern.png',animationName:'off',animationStateID:stateFor('coast-port-lantern.png'),collisionMask:0,eventBindings:{}});
  addEvent('coast_port_sync','porto_lumen',[
    'if_variable_greater_than var_coast_minute 1079','if_variable var_coast_evening 0','set_variable var_coast_evening 1','set_actor_direction porto-lume-captain-pilot right','condition_end','condition_end',
    'if_variable_greater_than var_coast_minute 1109','set_variable var_coast_evening 2','condition_end',
    'if_variable_greater_than var_coast_evening 0','set_actor_direction porto-lume-captain-pilot right','condition_end',
    'if_variable var_coast_evening 2','set_actor_animation coast-port-lamp-0 on','set_actor_animation coast-port-lamp-1 on','else','set_actor_animation coast-port-lamp-0 off','set_actor_animation coast-port-lamp-1 off','condition_end'
  ]);
  addEvent('coast_port_restore','porto_lumen',['if_variable var_coast_clock_ready 0','set_variable var_coast_minute 1020','set_variable var_coast_clock_ready 1','condition_end','start_game_clock 1 60 hidden var_coast_minute','call_procedure coast_port_sync','timer_attach 60 coast_port_clock_tick']);
  addEvent('coast_port_clock_tick','porto_lumen',['call_procedure coast_port_sync']);
  const portBoot=baseEvent('porto_ao_entrar');addEvent('porto_ao_entrar','porto_lumen',['call_procedure '+portBoot,'call_procedure coast_port_restore']);
  updateRoom('porto_lumen',r=>({...r,eventBindings:{...r.eventBindings,onRestore:'coast_port_restore'}}));
  const captain=baseEvent('porto_conversar_captain');addEvent('porto_conversar_captain','porto_lumen',['if_variable_greater_than var_coast_evening 0','show_dialogue coast_captain_shift','condition_end','call_procedure '+captain]);

  // A fully separate event-driven lift fits the existing open gap. The worker
  // controls it; loading restores the native platform and rider positions.
  p.actors.push({id:'coast-freight-lift',name:'Montacargas do Vento',roomName:'penedos_vento',x:45,y:36,z:0,spriteSheet:'coast-freight-lift.png',animationName:'idle',animationStateID:stateFor('coast-freight-lift.png'),collisionGroup:2,direction:'left',eventBindings:{onInit:'coast_lift_init',onUpdate:'coast_lift_update'}});
  const worker={...clone(p.actors.find(a=>a.id==='penedos-npc')),id:'coast-lift-worker',name:'Operador do montacargas',x:39,y:34,eventBindings:{onInit:'coast_worker_init',onInteract:'coast_lift_toggle'}};delete worker.prefabID;p.actors.push(worker);
  addEvent('coast_worker_init','penedos_vento',['set_actor_collision_enabled coast-lift-worker false','set_actor_animation coast-lift-worker idle_right']);
  addEvent('coast_lift_init','penedos_vento',['set_actor_collision_box coast-freight-lift -32 -16 64 4','set_actor_collision_enabled coast-freight-lift true']);
  addEvent('coast_lift_update','penedos_vento',['if_variable var_coast_lift 1','if_actor_at_position coast-freight-lift 45 29','set_actor_direction coast-freight-lift right','condition_end','if_actor_at_position coast-freight-lift 45 36','set_actor_direction coast-freight-lift left','condition_end','if_actor_direction coast-freight-lift left','move_actor_relative coast-freight-lift 0 -0.125','else','move_actor_relative coast-freight-lift 0 0.125','condition_end','condition_end','wait 2']);
  addEvent('coast_lift_toggle','penedos_vento',['if_variable var_coast_lift 0','set_variable var_coast_lift 1','play_sfx penedos_checkpoint_candidato','show_dialogue coast_lift_on','else','set_variable var_coast_lift 0','play_sfx farol_sfx_confirmar','show_dialogue coast_lift_off','condition_end','save_game 0']);

  const additions=[
    text('coast_usina_order','O painel indica: ADMISSÃO → TURBINA → SAÍDA. Uma manobra fora de ordem desarma apenas este circuito. As três válvulas ficam no caminho até o núcleo.','The panel reads: INTAKE → TURBINE → OUTPUT. An out-of-order adjustment resets only this circuit. All three valves lie on the way to the core.','El panel indica: ADMISIÓN → TURBINA → SALIDA. Una maniobra fuera de orden reinicia solo este circuito. Las tres válvulas están de camino al núcleo.'),
    text('coast_usina_a_ready','Admissão aberta. A água agora alimenta a turbina.','Intake opened. Water now feeds the turbine.','Admisión abierta. El agua alimenta la turbina.'),
    text('coast_usina_b_ready','Turbina estabilizada. Falta conectar a saída ao núcleo.','Turbine stabilized. Connect the output to the core next.','Turbina estabilizada. Falta conectar la salida al núcleo.'),
    text('coast_usina_c_ready','Os três indicadores ficaram azuis. O circuito está estável e a porta do núcleo foi liberada.','All three indicators turned blue. The circuit is stable and the core door is unlocked.','Los tres indicadores están azules. El circuito está estable y la puerta del núcleo está abierta.'),
    text('coast_usina_already','Esta válvula já está na posição correta.','This valve is already in the correct position.','Esta válvula ya está en la posición correcta.'),
    text('coast_market_delivery','A passagem está liberada. Sua entrega já está registrada; pode seguir para a Usina.','The passage is clear. Your delivery is registered; you can head to the power station.','El paso está libre. Tu entrega está registrada; puedes ir a la central.'),
    text('coast_market_memory','A Memória das Marés chegou ao diário? Então o antigo arquivo ainda tem histórias para contar.','You recorded the Tide Memory? Then the old archive still has stories to tell.','¿Registraste la Memoria de las Mareas? El viejo archivo aún tiene historias que contar.'),
    text('coast_market_relay','Já recebemos o sinal do relé! O trabalho de vocês está reconectando a costa.','We have received the relay signal! Your work is reconnecting the coast.','¡Ya recibimos la señal del relé! Su trabajo está reconectando la costa.'),
    text('coast_captain_shift','O expediente está terminando. As lanternas do cais entram em serviço ao anoitecer; a rota continua aberta para você.','The shift is ending. The dock lanterns come on at dusk; your route stays open.','La jornada termina. Las linternas del muelle se encienden al anochecer; tu ruta sigue abierta.'),
    text('coast_lift_on','Montacargas ligado! Suba na plataforma e salte para continuar. É um apoio opcional; o caminho normal continua livre. Fale comigo para pausá-lo.','Freight lift on! Ride the platform and jump to continue. It is optional; the normal route stays clear. Talk to me to pause it.','¡Montacargas en marcha! Sube y salta para continuar. Es opcional; la ruta normal sigue libre. Habla conmigo para pausarlo.'),
    text('coast_lift_off','Montacargas pausado na posição atual. Pode ligá-lo novamente quando quiser.','The lift is paused at its current position. You can restart it whenever you want.','El montacargas está pausado en su posición actual. Puedes volver a activarlo cuando quieras.')
  ];
  p.dialogues=upsert(p.dialogues,additions,'key');
  const controls=p.dialogues.find(d=>d.key==='arena_tatica_controles');
  if(controls)Object.assign(controls,text(controls.key,'Treino em dupla: Nara ataca de perto; APOIO alcança dois espaços. Selecione uma unidade aliada com A. Mover, Atacar ou Esperar; B volta; Select encerra o turno; L retorna ao Mercado.','Team training: Nara attacks up close; SUPPORT reaches two tiles. Select an allied unit with A. Move, Attack or Wait; B goes back; Select ends the turn; L returns to the market.','Entrenamiento en pareja: Nara ataca de cerca; APOYO alcanza dos casillas. Selecciona un aliado con A. Mover, Atacar o Esperar; B vuelve; Select termina el turno; L regresa al mercado.'));
  const usinaObjective=p.dialogues.find(d=>d.key==='usina_objetivo');
  if(usinaObjective)Object.assign(usinaObjective,text(usinaObjective.key,'A Usina perdeu a pressão. Examine com A as válvulas no caminho: admissão, turbina e saída, nessa ordem. Depois alcance a porta do núcleo.','The power station has lost pressure. Press A to inspect the valves along the path: intake, turbine, then output. Afterward, reach the core door.','La central perdió presión. Pulsa A para examinar las válvulas del camino: admisión, turbina y salida, en ese orden. Después, llega a la puerta del núcleo.'));

  // Music envelopes are relative to the player's saved volume, including mute.
  addEvent('coast_audio_preferences','porto_lumen',['if_variable var_audio_initialized 0','set_variable var_audio_master_volume 100','set_variable var_audio_music_volume 80','set_variable var_audio_sfx_volume 90','set_variable var_audio_enabled 1','set_audio_volume all 100','set_audio_volume music 80','set_audio_volume sfx 90','set_variable var_audio_initialized 1','condition_end']);
  addEvent('coast_audio_mute','porto_lumen',['if_variable var_audio_master_volume 0','mute_audio_channel all true','else','if_variable var_audio_enabled 0','mute_audio_channel all true','else','mute_audio_channel all false','condition_end','condition_end']);
  for(const e of p.events.filter(e=>['coast_audio_preferences','coast_audio_mute'].includes(e.name))){delete e.roomName;delete e.sceneName;e.category='Global';}
  const interior=new Set(['farol_interior','galeria_das_mares','armazem_das_mares','observatorio_do_farol','usina_submersa','usina_combate','usina_saida','conselho_guardia']);
  for(const r of p.rooms){
    if(r.sceneType==='menu'||r.sceneType==='cutscene')continue;
    const entry=p.events.find(e=>e.name===r.eventBindings?.onInit);if(!entry)continue;
    entry.steps=entry.steps.filter(s=>![entry.name+'-coast-audio-preferences',entry.name+'-coast-audio-mute',entry.name+'-coast-music'].includes(s.id));
    entry.steps.unshift(
      {id:entry.name+'-coast-audio-preferences',command:'call_procedure coast_audio_preferences',isEnabled:true},
      {id:entry.name+'-coast-audio-mute',command:'call_procedure coast_audio_mute',isEnabled:true},
      {id:entry.name+'-coast-music',command:`fade_audio_volume music ${interior.has(r.name)?70:100} 45 var_audio_music_volume var_audio_master_volume`,isEnabled:true}
    );
    if(['topdown','platformer','isometric','dungeonCrawler'].includes(r.sceneType)){
      const restore='coast_restore_'+r.name;
      let original=r.eventBindings?.onRestore;
      if(original===restore){
        const previous=p.events.find(e=>e.name===restore);
        original=previous?.steps?.map(s=>s.command).find(command=>command.startsWith('call_event '))?.split(/\s+/)[1];
      }
      addEvent(restore,r.name,[...(original?[(original.startsWith('coast_')?'call_procedure ':'call_event ')+original]:[]),'call_procedure coast_audio_mute',`fade_audio_volume music ${interior.has(r.name)?70:100} 45 var_audio_music_volume var_audio_master_volume`]);
      updateRoom(r.name,row=>({...row,eventBindings:{...row.eventBindings,onRestore:restore}}));
    }
  }
  const newGame=p.events.find(e=>e.name==='titulo_novo_jogo');
  const at=newGame.steps.findIndex(s=>/^(change_scene|advance_campaign)\b/.test(s.command));
  newGame.steps.splice(at<0?newGame.steps.length:at,0,...COAST_DEPTH_VARIABLES.map(v=>({id:'coast-reset-'+v.name,command:'set_variable '+v.name+' '+v.initialValue,isEnabled:true})));
  for (const e of p.events) for (const step of e.steps ?? []) {
    const [verb, target] = step.command.split(/\s+/);
    if (verb === 'call_procedure' && target.startsWith('coast_')) {
      const procedure = p.events.find(item=>item.name===target);
      if (procedure) Object.assign(procedure,{eventKind:'procedure',procedure:{parameters:[],locals:[]}});
    }
  }
  return p;
}

/** Regeneration only carries artwork that has passed its explicit visual gate. */
export function preserveCoastDepthCampaign(source, generated) {
  if(!source.events?.some(e=>e.name==='coast_port_clock_tick'))return generated;
  const assets=source.assets.filter(a=>a.id?.startsWith('coast-'));
  if(assets.some(a=>a.metadata?.approved!==true))throw Error('Coastal artwork requires explicit visual approval before canonical regeneration.');
  const base=clone(generated);
  if(!base.events.some(e=>e.name==='coast_port_clock_tick')){
    base.actors=base.actors.filter(a=>!a.id?.startsWith('coast-'));
    if(base.actorPrefabs)base.actorPrefabs=base.actorPrefabs.filter(a=>!a.id?.startsWith('example-actor-coast-'));
    for(const key of ['rooms','scenas'])for(const r of base[key]??[])if(r.name==='arena_tatica'){
      const config=r.runtime?.config;
      if(config?.tacticalPresentation?.units)config.tacticalPresentation.units=config.tacticalPresentation.units.filter(u=>!u.actorId?.startsWith('coast-'));
    }
  }
  return deepenExampleCampaign(base,{assets});
}
