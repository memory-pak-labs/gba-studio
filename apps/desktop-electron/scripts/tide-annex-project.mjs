import {fitProjectSpriteFrames} from './lib/sprite-canvas-audit.mjs';

const roomName='sala_mare_vazante';
const variable='var_tide_state';
const hooks=['tempestade_ao_entrar','coast_restore_tempestade','tempestade_concluir','tempestade_alcancar_rele','showcase_base_mechanic','penedos_recolher_aderencia','penedos_retornar_armazem','encore_base_arena_vencer_rival','arena_vencer_rival'];
const clone=x=>structuredClone(x);
function upsert(rows,items,key='id'){
 const out=clone(rows??[]);for(const item of items){const i=out.findIndex(r=>r[key]===item[key]);if(i<0)out.push(clone(item));else out[i]=clone(item);}return out;
}
function text(key,pt,en,es){return {key,character:'',portrait:'',emote:'',text:en,translations:{'pt-BR':pt,en,es},choices:[],choiceTranslations:{'pt-BR':[],en:[],es:[]},translationStatus:{'pt-BR':'draft-ai',en:'draft-ai',es:'draft-ai'},textSound:'farol_sfx_texto',confirmSound:'farol_sfx_dialogo'};}

/** One optional room; artwork, actors, tile collision and UI remain separate.
 * Tile attributes come from the exact pinned assetc palette/placement plan. */
export function addTideAnnex(source,manifest){
 const p=clone(source);
 if(p.editorState)p.editorState.scenaConnections=upsert(p.editorState.scenaConnections,[
  {id:'tide-connection-gallery',from:'galeria_das_mares',to:roomName,eventName:'tide_access',exit:{x:0,y:0,width:0,height:0},entry:{x:23,y:24,direction:'up'},transition:{style:'cut',durationFrames:0,fadeOut:false,fadeIn:false}},
  {id:'tide-connection-return',from:roomName,to:'galeria_das_mares',eventName:'tide_leave',exit:{x:0,y:0,width:0,height:0},entry:{x:41,y:11,direction:'left'},transition:{style:'cut',durationFrames:0,fadeOut:false,fadeIn:false}}
 ]);
 for(const name of ['tide-room.png','tide-stabilizer.png','tide-valve.png','tide-stabilizer-menu.png'])if(!manifest.assets.some(a=>a.name===name))throw Error('Missing tide asset: '+name);
 p.assets=upsert(p.assets,manifest.assets);
 if(p.events.some(e=>e.name==='tide_collect'))return p;
 if(!p.variables.some(v=>v.name===variable))p.variables.push({id:variable,name:variable,displayName:'Maré · estado do canal',initialValue:0});
 if(p.variables.length>64)throw Error('Tide room exceeds the 64 saved-variable slots.');
 const add=(name,scene,commands)=>{p.events=upsert(p.events,[{id:name,name,roomName:scene,category:'Exemplo · Maré vazante',command:'noop',steps:commands.map((command,i)=>({id:name+'-'+i,command,isEnabled:true}))}],'name');};
 const append=(name,commands)=>{const e=p.events.find(e=>e.name===name);if(e)e.steps.push(...commands.map((command,i)=>({id:'tide-'+name+'-'+i,command,isEnabled:true})));};
 const edits=state=>{
  const attribute=(x,y)=>manifest.attributes[manifest.tilemaps[state][y*48+x]],commands=[];
  for(let y=13;y<18;y++)for(let x=3;x<45;){
   const tile=attribute(x,y);if(!Number.isInteger(tile)||tile<0||tile>65535)throw Error('Invalid authored tide tile attribute');
   let count=1;while(x+count<45&&attribute(x+count,y)===tile+count)count++;
   const signed=tile>32767?tile-65536:tile,collision=state==='vazante'?'free':'solid';
   commands.push(count>1?`replace_tile_sequence ${x} ${y} ${signed} ${count} bg2 ${collision}`:`replace_tile ${x} ${y} ${signed} bg2 ${collision}`);x+=count;
  }
  return commands;
 };
 const liveEdits=state=>edits(state).flatMap((command,i)=>[command,...((i+1)%6===0?['wait 1']:[])]);
 const flags=Array.from({length:1536},(_,i)=>{
  const x=i%48,y=Math.floor(i/48);
  return x<3||x>44||y<7||(y>=27&&(x<22||x>25))||(([11,12,18,19].includes(y))&&(x<21||x>26))||(y>=13&&y<18)?'solid':'free';
 });
 const gallery=p.rooms.find(r=>r.name==='galeria_das_mares');if(!gallery)throw Error('Missing approved Gallery');
 const room={...clone(gallery),id:'scene-'+roomName,name:roomName,displayName:'Sala de Maré Vazante',gbStudioName:'Sala de Maré Vazante',gbStudioSceneID:roomName,width:48,height:32,backgroundAssetName:'tide-room.png',backgroundRenderMode:'tilemap',gbStudioUseBackgroundLayout:true,tilemap:Array(1536).fill(0),tileLayers:[],collisions:flags,collisionTypes:flags,eventBindings:{onInit:'tide_enter',onRestore:'tide_restore'},cameraMode:'follow_player',cameraBounds:{x:0,y:0,width:48,height:32},playerActorName:'Nara · Maré Vazante',runtime:{...clone(gallery.runtime),type:'topdown',config:{...clone(gallery.runtime.config),profile:'tide-annex-v1'}},showcase:{id:'mare-vazante',lane:'optional',access:'galeria_das_mares',playable:true,retained:true},authoringNotes:'Anexo opcional. Válvula e estabilizador em OBJ; piso BG2 e colisão mudam juntos. Piso seco reutiliza os tiles e a paleta nativa da Galeria, sem perda RGB555. Entrada pelo lampião do arquivo; retorno pela porta sul.'};
 delete room.galleryLayout;delete room.mapStates;delete room.tilemapIndexBase;
 room.supportBriefing={title:'Sala de Maré Vazante',objective:'Esvaziar o canal e recuperar o estabilizador opcional.',controls:'Direcional move Nara; A aciona a válvula ou recolhe o módulo.',success:'Cruzar o piso exposto e reduzir o vento em Tempestade.',failureRecovery:'O canal seco e a coleta permanecem ao voltar ou carregar o save.'};
 for(const key of ['rooms','scenas'])p[key]=[...(p[key]??[]),clone(room)];
 const hero=p.actors.find(a=>a.id==='gallery-nara');if(!hero)throw Error('Missing approved Gallery player');
 const state=(id,animationID,sheet)=>({id,name:id,spriteSheet:sheet,animationType:'fixed',mirrorLeftFromRight:false,animationIDs:[animationID]});
 const valveAnimations=manifest.animations?.filter(a=>a.id.startsWith('tide-valve-')).map(clone)??p.animations.filter(a=>['coast-coast-valve-near-off','coast-coast-valve-near-on'].includes(a.id)).map(a=>({...clone(a),id:'tide-valve-'+a.name,spriteSheet:'tide-valve.png',stateID:'tide-valve-'+a.name+'-state',colorMode:'8bpp',sourceColorMode:'8bpp',...(a.frames?{frames:a.frames.map(f=>({...clone(f),tiles:f.tiles.map(t=>({...clone(t),sourceSheet:'tide-valve.png'}))}))}:{})}));
 p.animations=upsert(p.animations,valveAnimations);
 p.animationStates=upsert(p.animationStates,[state('tide-valve-off-state','tide-valve-off','tide-valve.png'),state('tide-valve-on-state','tide-valve-on','tide-valve.png'),state('tide-stabilizer-state','tide-stabilizer-idle','tide-stabilizer.png')]);
 const rewardAnimation={id:'tide-stabilizer-idle',name:'idle',spriteSheet:'tide-stabilizer.png',stateID:'tide-stabilizer-state',frameWidth:32,frameHeight:32,frameCount:1,fps:1,loops:true,state:'idle',direction:'none',colorMode:'8bpp',sourceColorMode:'8bpp',originX:0,originY:8,frames:[{frameIndex:0,sourceFrameIndex:0,width:32,height:32,originX:0,originY:8,tiles:[{x:-16,y:0,sliceX:0,sliceY:0,sourceSheet:'tide-stabilizer.png',tileWidth:32,tileHeight:32,flipX:false,flipY:false,objPalette:'OBP0',paletteIndex:0,priority:false}]}]};
 const menuFrame={...clone(rewardAnimation.frames[0]),originX:-16,originY:-24};menuFrame.tiles[0].sourceSheet='tide-stabilizer-menu.png';
 const menuAnimation={...clone(rewardAnimation),id:'tide-inventory-stabilizer-idle',name:'tide-inventory-stabilizer',spriteSheet:'tide-stabilizer-menu.png',colorMode:'4bpp',sourceColorMode:'4bpp',stateID:'tide-inventory-stabilizer-state',originY:-24,frames:[menuFrame]};
 p.animations=upsert(p.animations,fitProjectSpriteFrames({animations:[rewardAnimation,menuAnimation]}).animations);
 p.animationStates.push(state('tide-inventory-stabilizer-state','tide-inventory-stabilizer-idle','tide-stabilizer-menu.png'));
 const actor=(id,name,scene,x,y,sheet,animationName,animationStateID,eventBindings={})=>({id,name,roomName:scene,x,y,z:0,spriteSheet:sheet,animationName,animationStateID,collisionMask:0,collisionGroup:0,eventBindings});
 p.actors.push({...clone(hero),id:'tide-nara',name:'Nara · Maré Vazante',roomName,x:23,y:24,eventBindings:{}});
 p.actors.push(actor('tide-valve','Válvula de escoamento',roomName,13,26,'tide-valve.png','off','tide-valve-off-state',{onInteract:'tide_activate'}));
 p.actors.push(actor('tide-stabilizer','Estabilizador de vento',roomName,36,10,'tide-stabilizer.png','idle','tide-stabilizer-state',{onInteract:'tide_collect'}));
 p.actors.push(actor('tide-gallery-access','Lâmpada da passagem técnica','galeria_das_mares',43,11,'gallery-props.png','lantern','gallery-props-lantern-state',{onInteract:'tide_access'}));
 p.triggers.push({id:'tide-exit',name:'Voltar à Galeria',roomName,x:22,y:31,width:4,height:1,eventBindings:{onEnter:'tide_leave'}});
 add('tide_access','galeria_das_mares',['show_dialogue tide_access','change_scene '+roomName+' 23 24 up']);
 add('tide_leave',roomName,['resume_scene_type topdown','change_scene galeria_das_mares 41 11 left']);
 const rewardSync=['if_variable var_stabilizer 1','set_actor_visible tide-stabilizer false','else','set_actor_visible tide-stabilizer true','condition_end'];
 const valveOn=['set_actor_animation_state tide-valve tide-valve-on-state'];
 add('tide_restore',roomName,['clear_visibility','resume_scene_type topdown','if_variable_greater_than '+variable+' 0',...edits('vazante'),'set_variable '+variable+' 2',...valveOn,'condition_end',...rewardSync]);
 const inheritedAudio=['coast_audio_preferences','coast_audio_mute'].filter(name=>p.events.some(e=>e.name===name)).map(name=>'call_procedure '+name);
 add('tide_enter',roomName,[...inheritedAudio,'play_music farol_memorias','change_player_sprite porto-nara-animations48.png','clear_visibility','resume_scene_type topdown','if_variable_greater_than '+variable+' 0','fade_out 1',...liveEdits('vazante'),'set_variable '+variable+' 2',...valveOn,'fade_in 8','else','show_dialogue tide_help','condition_end',...rewardSync]);
 add('tide_activate',roomName,['if_variable '+variable+' 0','call_procedure tide_drain','else','show_dialogue tide_already_low','condition_end']);
 add('tide_drain',roomName,['pause_scene_type topdown','set_variable '+variable+' 1','play_sfx farol_sfx_alarme',...valveOn,...liveEdits('esvaziando'),'wait 30',...liveEdits('vazante'),'set_variable '+variable+' 2','resume_scene_type topdown','play_sfx farol_sfx_confirmar','save_game 0','show_dialogue tide_lowered']);
 add('tide_collect',roomName,['if_variable '+variable+' 2','if_variable var_stabilizer 0','set_variable var_stabilizer 1','set_actor_visible tide-stabilizer false','play_sfx farol_sfx_confirmar','save_game 0','show_dialogue tide_collected','else','show_dialogue tide_owned','condition_end','condition_end']);
 add('tide_inventory_module','inventario',['if_variable var_stabilizer 1','show_dialogue tide_owned','else','show_dialogue tide_location','condition_end']);
 add('tide_wind_setup','tempestade',['timer_remove tide_wind_tick','if_variable var_stabilizer 1','timer_attach 18 tide_wind_tick','else','timer_attach 6 tide_wind_tick','condition_end']);
 add('tide_wind_tick','tempestade',['move_actor_relative player 0 0.125']);
 append('tempestade_ao_entrar',['call_procedure tide_wind_setup']);
 append('coast_restore_tempestade',['call_procedure tide_wind_setup']);
 for(const name of ['tempestade_concluir','tempestade_alcancar_rele']){
  const e=p.events.find(e=>e.name===name);if(e)e.steps.unshift({id:'tide-stop-wind-'+name,command:'timer_remove tide_wind_tick',isEnabled:true});
 }
 const pickup=(eventName,flag,dialogue)=>{
  const e=p.events.find(e=>e.name===eventName);if(!e)return;
  const i=e.steps.findIndex(s=>s.command==='set_variable '+flag+' 1');
  if(i>=0)e.steps.splice(i+1,0,{id:'tide-item-'+eventName,command:'show_dialogue '+dialogue,isEnabled:true});
 };
 pickup('showcase_base_mechanic','var_frame','tide_module_frame');
 for(const name of ['penedos_recolher_aderencia','penedos_retornar_armazem'])pickup(name,'var_grip','tide_module_grip');
 for(const name of ['tempestade_concluir','tempestade_alcancar_rele'])pickup(name,'var_shield','tide_module_shield');
 pickup(p.events.some(e=>e.name==='encore_base_arena_vencer_rival')?'encore_base_arena_vencer_rival':'arena_vencer_rival','var_boost','tide_module_boost');
 const reset=p.events.find(e=>e.name==='titulo_novo_jogo');if(reset)reset.steps.push({id:'tide-reset',command:'set_variable '+variable+' 0',isEnabled:true});
 const inventory=p.rooms.find(r=>r.name==='inventario');if(inventory){
  for(const key of ['rooms','scenas'])for(const r of p[key]??[])if(r.name==='inventario'){
   const items=r.runtime.config.items;items.splice(Math.max(0,items.findIndex(i=>i.id==='back')),0,{id:'stabilizer',label:'ESTABILIZADOR',action:'select',eventName:'tide_inventory_module',binding:{source:'variable',index:p.variables.findIndex(v=>v.name==='var_stabilizer'),format:'on_off'},clickBox:{x:184,y:96,width:40,height:32},detailLines:['Sala de','Mare Vazante','Vento reduzido']});
   const frame=items.find(i=>i.id==='frame');if(frame)frame.label='ESTRUTURA';
  }
  p.actors.push({...actor('tide-inventory-module','Estabilizador no inventário','inventario',23,12,'tide-stabilizer-menu.png','tide-inventory-stabilizer','tide-inventory-stabilizer-state'),menuActorRole:'decorative',menuPositionPixels:{x:188,y:96}});
  const cursor=p.actors.find(a=>a.roomName==='inventario'&&a.menuItemID==='back');if(cursor)p.actors.push({...clone(cursor),id:'tide-inventory-selection',name:'Selecionar estabilizador',menuItemID:'stabilizer',x:22,y:13,menuPositionPixels:{x:176,y:108}});
 }
 p.dialogues=upsert(p.dialogues,[
  text('tide_access','O lampião marca a passagem para a sala de maré. A válvula controla o canal abaixo.','The lamp marks the passage to the tide room. Its valve controls the canal below.','La lámpara señala el paso a la sala de marea. La válvula controla el canal inferior.'),
  text('tide_help','A água cobre a passagem. Acione a válvula na margem seca e atravesse pelas escadas. O módulo do outro lado estabiliza a aeronave contra o vento.','Water covers the crossing. Turn the valve on the dry bank and use the steps. The module across the canal stabilizes the craft against wind.','El agua cubre el paso. Acciona la válvula en la orilla seca y cruza por las escaleras. El módulo estabiliza la nave contra el viento.'),
  text('tide_lowered','Canal esvaziado. O piso da Galeria está livre. O estado da válvula foi salvo; agora você pode alcançar o estabilizador.','Canal drained. The Gallery floor is clear. The valve state is saved; the stabilizer is now within reach.','Canal vaciado. El suelo de la Galería está libre. La válvula quedó guardada; ahora puedes alcanzar el estabilizador.'),
  text('tide_already_low','A válvula está travada na posição aberta. A passagem permanece seca.','The valve is locked open. The crossing stays dry.','La válvula está fijada abierta. El paso permanece seco.'),
  text('tide_collected','Estabilizador obtido! Em Tempestade, a aeronave sofre menos desvio pelo vento. Consulte o módulo no inventário. Esta melhoria é opcional.','Stabilizer acquired! In Storm, wind pushes the craft less. Check the module in your inventory. This upgrade is optional.','¡Estabilizador obtenido! En Tormenta, el viento desvía menos la nave. Consulta el módulo en el inventario. Es una mejora opcional.'),
  text('tide_owned','Estabilizador instalado. Obtido na sala de Maré Vazante, anexa à Galeria. Reduz o desvio causado pelo vento em Tempestade.','Stabilizer installed. Found in the Tide Room beside the Gallery. Reduces wind drift in Storm.','Estabilizador instalado. Obtenido en la sala de Marea junto a la Galería. Reduce el desvío del viento en Tormenta.'),
  text('tide_location','Estabilizador ainda não obtido. Na Galeria, abra o arquivo e examine o lampião da passagem técnica. Esvazie o canal para alcançar o módulo.','Stabilizer not acquired. In the Gallery, open the archive and inspect the maintenance lamp. Drain the canal to reach the module.','Estabilizador pendiente. En la Galería, abre el archivo y examina la lámpara del paso técnico. Vacía el canal para alcanzar el módulo.'),
  text('tide_module_frame','Estrutura recebida da Mecânica. O primeiro módulo já aparece no inventário. A rota do mapa está liberada para os Penedos.','Frame received from the Mechanic. The first module is in your inventory. The map route to the Cliffs is open.','Estructura recibida de la Mecánica. El primer módulo está en el inventario. La ruta a los Peñascos está abierta.'),
  text('tide_module_grip','Módulo de aderência recuperado! A travessia dos Penedos foi concluída. Próximo destino: Armazém das Marés.','Grip module recovered! The Cliffs crossing is complete. Next stop: Tide Warehouse.','¡Módulo de agarre recuperado! Completaste los Peñascos. Próximo destino: Almacén de Mareas.'),
  text('tide_module_shield','Blindagem recuperada na Tempestade. O módulo está no inventário; a rota para o Guardião do Relé está liberada.','Armor recovered in Storm. The module is in your inventory; the route to the Relay Guardian is open.','Blindaje recuperado en Tormenta. El módulo está en el inventario; la ruta al Guardián del Relé está abierta.'),
  text('tide_module_boost','Módulo de impulso conquistado na Arena! O conjunto está completo para o Circuito. Consulte os módulos no inventário.','Boost module won in the Arena! Your set is ready for the Circuit. Check the modules in your inventory.','¡Módulo de impulso ganado en la Arena! El conjunto está listo para el Circuito. Consulta el inventario.')
 ],'key');
 const descriptions={frame:['Estrutura','Porto: entregue pela Mecânica. Libera a rota do mapa para os Penedos.','Port: supplied by the Mechanic. Opens the map route to the Cliffs.','Puerto: entregada por la Mecánica. Abre la ruta a los Peñascos.'],grip:['Aderência','Penedos: obtida ao completar a travessia. A próxima etapa leva ao Armazém das Marés.','Cliffs: recovered after the crossing. The next stage leads to the Tide Warehouse.','Peñascos: obtenida al completar el cruce. La siguiente etapa lleva al Almacén.'],cell:['Célula de energia','Usina: colete a célula na sala de saída. Ela libera a passagem para o Conselho.','Powerhouse: collect the cell in the exit room. It opens the passage to the Council.','Central: recoge la célula en la sala de salida. Abre el paso al Consejo.'],shield:['Blindagem','Tempestade: obtida após a travessia. A rota seguinte leva ao Guardião do Relé.','Storm: recovered after the crossing. The next route leads to the Relay Guardian.','Tormenta: obtenida tras el cruce. La siguiente ruta lleva al Guardián del Relé.'],boost:['Impulso','Arena: prêmio da vitória no combate principal. Libera a etapa final do Circuito. O treino opcional não concede este módulo.','Arena: main-match victory reward. Opens the final Circuit stage. Optional training does not grant it.','Arena: premio del combate principal. Abre el Circuito final. El entrenamiento opcional no lo concede.']};
 for(const [id,[,pt,en,es]]of Object.entries(descriptions)){
  const existing=p.dialogues.find(d=>d.key==='ingame-item-'+id);if(existing)Object.assign(existing,{text:en,translations:{...existing.translations,'pt-BR':pt,en,es}});
 }
 for(const e of p.events)for(const s of e.steps??[])if(s.command.startsWith('call_procedure tide_')){const callee=p.events.find(c=>c.name===s.command.split(' ')[1]);if(callee)Object.assign(callee,{eventKind:'procedure',procedure:{parameters:[],locals:[]}});}
 const positions=p.editorState?.sceneMapPositions;if(positions){const old=positions['scene-galeria_das_mares']??positions.galeria_das_mares;positions[roomName]={x:(old?.x??0)+560,y:old?.y??0};}
 return p;
}

/** Keep the approved optional room and its hooks when rebuilding the example. */
export function preserveTideAnnex(source,generated){
 if(!source.events?.some(e=>e.name==='tide_collect'))return generated;
 const assets=source.assets.filter(a=>a.id?.startsWith('tide-'));
 if(assets.some(a=>a.metadata?.approved!==true))throw Error('Tide assets require explicit approval');
 const p=clone(generated),own=id=>id?.startsWith('tide-'),ownedName=name=>name?.startsWith('tide_');
 if(p.editorState)p.editorState.scenaConnections=upsert(p.editorState.scenaConnections,source.editorState?.scenaConnections?.filter(c=>own(c.id))??[]);
 p.assets=upsert(p.assets,assets);
 for(const key of ['actors','animations','animationStates','triggers'])p[key]=upsert(p[key],source[key].filter(a=>own(a.id)));
 p.events=upsert(p.events,source.events.filter(e=>ownedName(e.name)||hooks.includes(e.name)),'name');
 p.dialogues=upsert(p.dialogues,source.dialogues.filter(d=>ownedName(d.key)||d.key.startsWith('ingame-item-')),'key');
 for(const key of ['rooms','scenas'])p[key]=upsert(p[key],source[key].filter(r=>r.name===roomName||r.name==='inventario'),'name');
 const sourceNames=new Set(source.variables.map(v=>v.name)),byName=new Map(p.variables.map(v=>[v.name,v]));
 p.variables=[...source.variables.map(v=>clone(byName.get(v.name)??v)),...p.variables.filter(v=>!sourceNames.has(v.name))];
 const reset=p.events.find(e=>e.name==='titulo_novo_jogo');if(reset&&!reset.steps.some(s=>s.command==='set_variable '+variable+' 0'))reset.steps.push({id:'tide-reset',command:'set_variable '+variable+' 0',isEnabled:true});
 if(source.editorState?.sceneMapPositions?.[roomName])p.editorState.sceneMapPositions[roomName]=clone(source.editorState.sceneMapPositions[roomName]);
 return p;
}
