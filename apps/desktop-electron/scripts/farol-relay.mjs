import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/farol-relay-v2.json',import.meta.url)));
export const FAROL_RELAY = { actor:'farol-relay', variable:'var_farol_relay', sheet:'farol-relay-v2.png' };

/** Approved V2 actor; geometry and the staircase background remain untouched. */
export function promoteFarolRelay(data) {
 const p=structuredClone(data),r=FAROL_RELAY;
 if(!p.rooms?.some(x=>x.name==='farol_interior'))return p;
 const upsert=(key,value,field='name')=>{const i=p[key].findIndex(x=>x[field]===value[field]);if(i<0)p[key].push(value);else p[key][i]=value;};
 // Remove the rejected walkway from the canonical project, including its hint.
 p.events=p.events.filter(e=>!e.name.startsWith('farol_maintenance_'));
 p.dialogues=p.dialogues.filter(d=>!d.key.startsWith('farol_maintenance_'));
 p.triggers=p.triggers.filter(t=>t.id!=='trigger-farol-maintenance');
 p.variables=p.variables.filter(v=>v.name!=='var_farol_maintenance');
 for(const e of p.events)e.steps=e.steps?.filter(s=>!s.id.startsWith('keeper-maintenance-hint-')&&s.id!=='new-game-farol-maintenance');
 for(const key of ['rooms','scenas']){const room=p[key]?.find(x=>x.name==='farol_interior');if(room){room.mapStates=(room.mapStates??[]).filter(s=>s.id!=='farol-maintenance');if(!room.mapStates.length)delete room.mapStates;room.eventBindings={...room.eventBindings,onRestore:'farol_relay_restore'};}}
 if(!p.variables.some(v=>v.name===r.variable))p.variables.push({id:'variable-farol-relay',name:r.variable,displayName:'Rele do Farol',initialValue:0});
 const palette=p.assets.find(a=>a.name==='porto-lighthousekeeper-body48.png').metadata.objectPaletteValues;
 upsert('assets',{id:'farol-relay-v2',name:r.sheet,kind:'Sprite',metadata:{source:'Assets/sprites/'+r.sheet,width:144,height:48,frameWidth:48,frameHeight:48,frameCount:3,colorMode:'8bpp',objectPaletteValues:[...palette],streamFrames:true,sourceSha256:manifest.sourceSha256,preparedSha256:manifest.sha256,license:manifest.license,generatedBy:'approved-farol-relay-v2',reviewStatus:'approved',runtimePaletteReviewStatus:'approved',provenance:'fixtures/asset-provenance/farol-relay-v2.json'}});
 for(const anim of manifest.animations){upsert('animations',{...structuredClone(anim),colorMode:'8bpp'},'id');upsert('animationStates',{id:anim.id+'-state',name:anim.name,spriteSheet:r.sheet,animationType:'fixed',mirrorLeftFromRight:false,animationIDs:[anim.id]},'id');}
 upsert('actors',{id:r.actor,name:'Rele auxiliar do Farol',roomName:'farol_interior',x:33,y:13,z:0,spriteSheet:r.sheet,animationName:'faulty',animationStateID:'farol-relay-faulty-state',eventBindings:{onInteract:'farol_relay_interact'}},'id');
 function event(name,commands,procedure=false){upsert('events',{id:'event-'+name,name,roomName:'farol_interior',category:'O sinal perdido',command:'noop',...(procedure?{eventKind:'procedure',procedure:{parameters:[],locals:[]}}:{}),steps:commands.map((command,i)=>({id:`${name}-${i}`,command,isEnabled:true}))});}
 event('farol_relay_sync',['if_variable_less_than var_signal_stage 2',`set_variable ${r.variable} 0`,`set_actor_animation_state ${r.actor} farol-relay-faulty-state`,'else',`set_variable ${r.variable} 2`,`set_actor_animation_state ${r.actor} farol-relay-working-state`,'condition_end'],true);
 event('farol_relay_restore',['call_procedure showcase_trial_watchdog','call_procedure farol_relay_sync']);
 upsert('dialogues',{key:'farol_relay_faulty',character:'Mecanismo',portrait:'',text:'The auxiliary relay is broken. The mechanic on the eastern dock can help.',translations:{en:'The auxiliary relay is broken. The mechanic on the eastern dock can help.','pt-BR':'O relé auxiliar está avariado. A mecânica no cais leste pode ajudar.',es:'El relé auxiliar está averiado. La mecánica del muelle este puede ayudar.'},choices:[],choiceTranslations:{en:[],'pt-BR':[],es:[]},translationStatus:{en:'draft-ai','pt-BR':'draft-ai',es:'draft-ai'},textSound:'farol_sfx_texto',confirmSound:'farol_sfx_dialogo'},'key');
 event('farol_relay_interact',['call_procedure farol_relay_sync','if_variable var_signal_stage 0','show_dialogue farol_relay_faulty','else','call_event farol_examinar_lente','condition_end']);
 const init=p.events.find(e=>e.name==='farol_interior_ao_entrar');
 if(init&&!init.steps.some(s=>s.command==='call_procedure farol_relay_sync'))init.steps.unshift({id:'farol-relay-entry-sync',command:'call_procedure farol_relay_sync',isEnabled:true});
 const reset=p.events.find(e=>e.name==='titulo_novo_jogo');
 if(reset&&!reset.steps.some(s=>s.command===`set_variable ${r.variable} 0`)){const i=reset.steps.findIndex(s=>s.command.startsWith('change_scene '));reset.steps.splice(i<0?reset.steps.length:i,0,{id:'new-game-farol-relay',command:`set_variable ${r.variable} 0`,isEnabled:true});}
 const timeline=p.events.find(e=>e.name==='timeline_signal_repair');
 const commands=['pause_scene_type topdown','camera_set_position 64 0',`set_variable ${r.variable} 1`,`set_actor_animation_state ${r.actor} farol-relay-installing-state`,'play_music farol_tema_principal','wait 30','play_sfx farol_sfx_sinal','wait 60',`set_variable ${r.variable} 2`,`set_actor_animation_state ${r.actor} farol-relay-working-state`,'play_sfx farol_sfx_confirmar','wait 30','camera_follow_player','resume_scene_type topdown','save_game 0','show_dialogue signal_repaired'];
 timeline.steps=commands.map((command,i)=>({id:'signal-repair-relay-'+i,command,isEnabled:true}));
 const tool=p.advancedTools?.cinematicTimelines?.find(t=>t.id==='signal_repair');
 if(tool){let frame=0;tool.tracks=[{kind:'events',keyframes:commands.flatMap(command=>{if(command.startsWith('wait ')){frame+=Number(command.split(' ')[1]);return [];}return [{frame,command}];})}];tool.durationFrames=frame;}
 return p;
}
