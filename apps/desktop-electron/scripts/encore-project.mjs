import {fitProjectSpriteFrames} from './lib/sprite-canvas-audit.mjs';
const clone=value=>structuredClone(value);
const upsert=(rows,items,key='id')=>{const out=clone(rows??[]);for(const item of items){const i=out.findIndex(r=>r[key]===item[key]);if(i<0)out.push(clone(item));else out[i]=clone(item);}return out;};
const line=(key,pt,en,es,choices=[])=>({key,character:'',portrait:'',emote:'',text:en,translations:{'pt-BR':pt,en,es},choices:choices.map(c=>c[1]),choiceTranslations:{'pt-BR':choices.map(c=>c[0]),en:choices.map(c=>c[1]),es:choices.map(c=>c[2])},translationStatus:{'pt-BR':'draft-ai',en:'draft-ai',es:'draft-ai'},textSound:'farol_sfx_texto',confirmSound:'farol_sfx_dialogo'});
export const ENCORE_VARIABLES=['var_radio_heard','var_epilogue_phase','var_epilogue_tick','var_arena_lesson'].map(name=>({id:name,name,initialValue:0}));

/** Additive authoring only: all approved background, fighter and HUD data stay intact. */
export function extendExampleEncore(source,manifest) {
  const p=clone(source);
  for(const name of ['recovered-radio.png','radio-lume-pcm.wav'])if(!manifest?.assets?.some(a=>a.name===name))throw Error('Missing reviewed encore asset: '+name);
  p.assets=upsert(p.assets,manifest.assets);
  const fitRadio=()=>{p.animations=upsert(p.animations,fitProjectSpriteFrames({animations:p.animations.filter(a=>a.id==='encore-radio-idle')}).animations);};
  if(p.events.some(e=>e.name==='encore_radio_play')){fitRadio();return p;}
  p.variables=upsert(p.variables,ENCORE_VARIABLES,'name');if(p.variables.length>64)throw Error('Encore exceeds the 64 saved-variable slots.');
  const add=(name,roomName,commands)=>{p.events=upsert(p.events,[{id:name,name,roomName,category:roomName?'Exemplo · Rádio, epílogo e treino':'Global',command:'noop',steps:commands.map((command,i)=>({id:name+'-'+i,command,isEnabled:true}))}],'name');};
  const base=name=>{const e=p.events.find(e=>e.name===name);if(!e)throw Error('Missing campaign event: '+name);const n='encore_base_'+name;p.events.push({...clone(e),id:n,name:n,eventKind:'procedure',procedure:{parameters:[],locals:[]}});return n;};
  const room=(name,fn)=>{for(const key of ['rooms','scenas','scenes'])if(Array.isArray(p[key]))p[key]=p[key].map(r=>r.name===name?fn(clone(r)):r);if(p.scena?.name===name)p.scena=fn(clone(p.scena));};
  const wrap=(name,scene,commands)=>{const b=base(name);add(name,scene,['call_procedure '+b,...commands]);};

  p.animations=upsert(p.animations,[{id:'encore-radio-idle',name:'idle',spriteSheet:'recovered-radio.png',stateID:'encore-radio-state',frameWidth:32,frameHeight:32,frameCount:1,fps:1,loops:true,state:'idle',direction:'none',colorMode:'4bpp',sourceColorMode:'4bpp',originX:0,originY:8,frames:[{frameIndex:0,sourceFrameIndex:0,width:32,height:32,originX:0,originY:8,tiles:[{x:-16,y:0,sliceX:0,sliceY:0,sourceSheet:'recovered-radio.png',tileWidth:32,tileHeight:32,flipX:false,flipY:false,objPalette:'OBP0',paletteIndex:0,priority:false}]}]}]);
  p.animationStates=upsert(p.animationStates,[{id:'encore-radio-state',name:'default',spriteSheet:'recovered-radio.png',animationType:'fixed',mirrorLeftFromRight:false,animationIDs:['encore-radio-idle']}]);
  p.actors.push({id:'encore-radio',name:'Rádio de Lúmen',roomName:'armazem_das_mares',x:24,y:10,z:0,spriteSheet:'recovered-radio.png',animationName:'idle',animationStateID:'encore-radio-state',collisionMask:0,eventBindings:{}});
  p.triggers.push({id:'encore-radio-hotspot',name:'Rádio de Lúmen',roomName:'armazem_das_mares',x:23,y:7,width:3,height:3,eventBindings:{onInteract:'encore_radio_menu'},scriptName:'encore_radio_menu'});
  p.audioItems=upsert(p.audioItems,[{id:'encore-radio-pcm',name:'radio-lume-pcm.wav',kind:'SFX',format:'WAV',sourceAssetID:manifest.assets.find(a=>a.name==='radio-lume-pcm.wav').id,exportID:'radio_lume_pcm',loops:false,volume:80}]);
  add('encore_radio_menu','armazem_das_mares',['call_procedure encore_radio_play']);
  add('encore_radio_play','armazem_das_mares',['play_sfx radio-lume-pcm.wav 80 12','show_dialogue encore_radio_message','set_variable var_radio_heard 1','save_game 0']);

  const trader=p.dialogues.find(d=>d.key==='showcase_trader_menu');
  trader.choices.push('Arena training');for(const [lang,label]of Object.entries({'pt-BR':'Treino da Arena',en:'Arena training',es:'Entrenamiento de Arena'}))trader.choiceTranslations[lang].push(label);
  const entry=p.events.find(e=>e.name==='porto_conversar_traveler');entry.steps.unshift({id:'encore-trader-training',command:'choice_event showcase_trader_menu 3 encore_arena_begin',isEnabled:true});
  add('encore_arena_begin','porto_lumen',['set_variable var_arena_lesson 1','change_scene arena_arrancada 9 15 right']);
  wrap('arena_ao_entrar','arena_arrancada',['if_variable_greater_than var_arena_lesson 0','call_procedure encore_arena_lesson','condition_end']);
  add('encore_arena_lesson','arena_arrancada',['attach_button select encore_arena_leave_button true','luta_set_rounds_to_win 1','luta_set_round_timer 60','luta_set_guard_power nara-fighter 100','if_variable var_arena_lesson 1','luta_set_ism_style nara-fighter x-ism','show_dialogue encore_arena_guard','else','luta_set_ism_style nara-fighter a-ism','luta_set_super_gauge nara-fighter 100','luta_enable_alpha_counter nara-fighter true','show_dialogue encore_arena_super','condition_end','save_game 0']);
  add('encore_arena_leave_button','arena_arrancada',['call_procedure encore_arena_exit']);
  const won=base('arena_vencer_rival');
  add('arena_vencer_rival','arena_arrancada',['if_variable var_arena_lesson 1','set_variable var_arena_lesson 2','luta_start_match arena_arrancada','call_procedure encore_arena_lesson','else','if_variable var_arena_lesson 2','set_variable var_arena_lesson 3','show_dialogue encore_arena_done','call_procedure encore_arena_exit','else','call_procedure '+won,'condition_end','condition_end']);
  const lost=base('arena_derrota');
  add('arena_derrota','arena_arrancada',['if_variable_greater_than var_arena_lesson 0','show_dialogue encore_arena_retry','luta_start_match arena_arrancada','call_procedure encore_arena_lesson','else','call_procedure '+lost,'condition_end']);
  add('encore_arena_exit','arena_arrancada',['remove_button select','set_variable var_arena_lesson 0','change_scene porto_lumen 41 64 down']);

  // Timer callbacks leave the ordinary pause menu available throughout the tour.
  add('encore_epilogue_begin','circuito_final',['set_variable var_epilogue_phase 1','change_scene porto_lumen 37 68 up']);
  const ending=p.events.find(e=>e.name==='circuito_concluir');ending.steps=ending.steps.map(s=>s.command==='advance_campaign'?{...s,command:'call_procedure encore_epilogue_begin'}:s);
  add('encore_epilogue_replay','porto_lumen',['set_variable var_epilogue_phase 4','set_actor_position port-nara 37 68','set_actor_direction port-nara up','call_procedure encore_epilogue_1_restore']);
  const captain=base('porto_conversar_captain');
  add('encore_epilogue_talk','porto_lumen',['call_procedure '+captain]);
  add('porto_conversar_captain','porto_lumen',['if_variable var_campaign_finished 1','choice_event encore_epilogue_menu 0 encore_epilogue_replay','choice_event encore_epilogue_menu 1 encore_epilogue_talk','show_choice encore_epilogue_menu','else','call_procedure '+captain,'condition_end']);
  for(const [scene,entryName,phase,replay,x,y,steps]of [['porto_lumen','porto_ao_entrar',1,4,200,460,64],['farol_interior','farol_interior_ao_entrar',2,5,0,0,48]]){
    const sync='encore_epilogue_'+phase+'_restore',tick='encore_epilogue_'+phase+'_tick';
    add(sync,scene,['if_variable var_epilogue_phase '+phase,'call_procedure '+sync+'_start','else','if_variable var_epilogue_phase '+replay,'call_procedure '+sync+'_start','condition_end','condition_end']);
    add(sync+'_start',scene,['pause_scene_type topdown','attach_button b encore_epilogue_skip true','set_variable var_epilogue_tick 0',`camera_set_position ${x} ${y}`,'timer_attach 6 '+tick]);
    // A callback already queued in this frame must stay inert after B finishes
    // the tour, even though its repeating timer has just been removed.
    add(tick,scene,['if_variable var_epilogue_phase 3','noop','else','camera_move 1 0','add_variable var_epilogue_tick 1','if_variable_greater_than var_epilogue_tick '+(steps-1),'timer_remove '+tick,...(phase===1?['if_variable var_epilogue_phase 1','set_variable var_epilogue_phase 2','else','set_variable var_epilogue_phase 5','condition_end','change_scene farol_interior 23 27 up']:['call_procedure encore_epilogue_finish']),'condition_end','condition_end']);
    const r=p.rooms.find(r=>r.name===scene),restore=r.eventBindings?.onRestore;
    const boot=base(entryName),cinematic=sync+'_boot';
    add(cinematic,scene,['call_procedure coast_audio_preferences','call_procedure coast_audio_mute','play_music '+(scene==='farol_interior'?'farol_memorias':'farol_enseada'),...(restore?['call_event '+restore]:[]),'call_procedure '+sync]);
    add(entryName,scene,['if_variable var_epilogue_phase '+phase,'call_procedure '+cinematic,'else','if_variable var_epilogue_phase '+replay,'call_procedure '+cinematic,'else','call_procedure '+boot,'condition_end','condition_end']);
    add('encore_restore_'+scene,scene,[...(restore?['call_event '+restore]:[]),'call_procedure '+sync]);
    room(scene,r=>({...r,eventBindings:{...r.eventBindings,onRestore:'encore_restore_'+scene}}));
  }
  add('encore_epilogue_skip',undefined,['call_procedure encore_epilogue_finish']);
  add('encore_epilogue_finish',undefined,['timer_remove encore_epilogue_1_tick','timer_remove encore_epilogue_2_tick','remove_button b','resume_scene_type topdown','camera_follow_player','if_variable_greater_than var_epilogue_phase 3','set_variable var_epilogue_phase 3','change_scene porto_lumen 37 68 up','else','set_variable var_epilogue_phase 3','save_game 0','change_scene titulo','condition_end']);

  p.dialogues=upsert(p.dialogues,[
    line('encore_radio_message','Transcrição: L U M E. Indicativo recebido. A rede da costa responde. O operador anotou: o Farol é o ponto de manutenção do relé.','Transcript: L U M E. Call sign received. The coastal network responds. The operator noted: the Lighthouse is the relay maintenance point.','Transcripción: L U M E. Indicativo recibido. La red costera responde. El operador anotó: el Faro es el punto de mantenimiento del relé.'),
    line('encore_arena_guard','Treino 1/2: X-ISM. Esquerda/direita: aproximar. Baixo: defender. A: soco; B: chute. Vença um round para avançar. Select: sair. O início de cada etapa é salvo no espaço 1.','Training 1/2: X-ISM. Left/right: move. Down: guard. A: punch; B: kick. Win one round to advance. Select: leave. Each lesson starts with a save in slot 1.','Entrenamiento 1/2: X-ISM. Izquierda/derecha: mover. Abajo: defender. A: puño; B: patada. Gana un asalto para avanzar. Select: salir. Cada etapa se guarda al inicio en el espacio 1.'),
    line('encore_arena_super','Treino 2/2: A-ISM. A barra SUPER começa cheia. L: especial; R: contra-ataque alfa logo após receber um golpe (meia barra). Observe a barra diminuir. Vença um round. Select: sair.','Training 2/2: A-ISM. SUPER starts full. L: super; R: alpha counter just after taking a hit (half gauge). Watch the gauge decrease. Win one round. Select: leave.','Entrenamiento 2/2: A-ISM. SUPER empieza lleno. L: especial; R: contraataque alfa justo después de recibir un golpe (media barra). Observa la barra bajar. Gana un asalto. Select: salir.'),
    line('encore_arena_retry','Vamos repetir esta etapa. Defenda antes de responder e observe a distância dos golpes.','Let us repeat this lesson. Guard before answering and watch your attack range.','Repitamos esta etapa. Defiende antes de responder y observa el alcance de los golpes.'),
    line('encore_arena_done','Treino concluído! Você experimentou defesa, dois estilos e a barra SUPER. Pode repetir com o Viajante. O resultado da campanha continua separado.','Training complete! You tried guard, two styles and the SUPER gauge. Ask the Trader to repeat. Campaign results are tracked separately.','¡Entrenamiento completo! Probaste defensa, dos estilos y la barra SUPER. Pide al Viajero repetir. El resultado de la campaña se registra por separado.'),
    line('encore_epilogue_menu','A rota está livre. Quer rever o caminho que reconectou a costa? B pula o passeio; Start permite salvar.','The route is open. Revisit the path that reconnected the coast? B skips the tour; Start lets you save.','La ruta está libre. ¿Revisitar el camino que reconectó la costa? B omite el paseo; Start permite guardar.',[['Rever epílogo','Replay epilogue','Repetir epílogo'],['Conversar','Talk','Conversar']])
  ],'key');
  const newGame=p.events.find(e=>e.name==='titulo_novo_jogo'),at=newGame.steps.findIndex(s=>/^(change_scene|advance_campaign)\b/.test(s.command));
  newGame.steps.splice(at<0?newGame.steps.length:at,0,...ENCORE_VARIABLES.map(v=>({id:'encore-reset-'+v.name,command:'set_variable '+v.name+' 0',isEnabled:true})));
  for(const e of p.events)for(const s of e.steps??[])if(s.command.startsWith('call_procedure encore_')){const callee=p.events.find(r=>r.name===s.command.split(/\s+/)[1]);if(callee)Object.assign(callee,{eventKind:'procedure',procedure:{parameters:[],locals:[]}});}
  fitRadio();return p;
}

export function preserveExampleEncore(source,generated){
  if(!source.events?.some(e=>e.name==='encore_radio_play'))return generated;
  const assets=source.assets.filter(a=>a.id?.startsWith('encore-'));
  if(assets.some(a=>a.metadata?.approved!==true))throw Error('Encore assets require explicit approval before regeneration.');
  const p=clone(generated),hooks=new Set(['porto_ao_entrar','farol_interior_ao_entrar','porto_conversar_captain','porto_conversar_traveler','arena_ao_entrar','arena_vencer_rival','arena_derrota','circuito_concluir','coast_restore_porto_lumen','coast_restore_farol_interior']);
  p.assets=upsert(p.assets,assets);
  for(const key of ['actors','animations','animationStates','triggers','audioItems'])p[key]=upsert(p[key],source[key].filter(a=>a.id?.startsWith('encore-')));
  p.events=upsert(p.events,source.events.filter(e=>e.name.startsWith('encore-')||e.name.startsWith('encore_')||hooks.has(e.name)),'name');
  p.dialogues=upsert(p.dialogues,source.dialogues.filter(d=>d.key.startsWith('encore_')||d.key==='showcase_trader_menu'),'key');
  p.variables=upsert(p.variables,source.variables.filter(v=>ENCORE_VARIABLES.some(n=>n.name===v.name)),'name');
  const byName=new Map(p.variables.map(v=>[v.name,v])),sourceNames=new Set(source.variables.map(v=>v.name));
  p.variables=[...source.variables.map(v=>clone(byName.get(v.name)??v)),...p.variables.filter(v=>!sourceNames.has(v.name))];
  for(const key of ['rooms','scenas'])for(const r of p[key]??[])if(['porto_lumen','farol_interior'].includes(r.name))r.eventBindings=clone(source.rooms.find(s=>s.name===r.name).eventBindings);
  if(['porto_lumen','farol_interior'].includes(p.scena?.name))p.scena.eventBindings=clone(source.rooms.find(s=>s.name===p.scena.name).eventBindings);
  const reset=p.events.find(e=>e.name==='titulo_novo_jogo');
  for(const v of ENCORE_VARIABLES)if(!reset.steps.some(s=>s.command==='set_variable '+v.name+' 0'))reset.steps.push({id:'encore-reset-'+v.name,command:'set_variable '+v.name+' 0',isEnabled:true});
  return p;
}
