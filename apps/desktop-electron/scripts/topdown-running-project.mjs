/** Authored held-R running. New artwork stays in a disposable review project
 * until visual approval; all existing scene geometry and walking pixels remain. */
export function configureTopdownRunning(source, metadata) {
 const p=structuredClone(source),oldSheet='porto-nara-animations48.png',sheet='nara-topdown-walk-run-v1.png';
 const stateID='nara-topdown-walk-run-v1-state',eventName='nara_configurar_corrida';
 const put=(rows,value,key='id')=>{const i=rows.findIndex(r=>r[key]===value[key]);if(i<0)rows.push(value);else rows[i]=value;};
 const original=p.assets.find(a=>a.name===oldSheet);
 original.metadata={...original.metadata,reusableLibraryAsset:true,retainSourceInLibrary:true};
 put(p.assets,{...structuredClone(original),id:'nara-topdown-walk-run-v1',name:sheet,metadata:{...original.metadata,...metadata,source:'Assets/sprites/'+sheet,frameCount:36,width:288,height:192,reviewStatus:metadata?.reviewStatus??'candidate',visualStatus:metadata?.visualStatus??'candidate',runButton:'R',runSpeedPercent:170,reusableLibraryAsset:false,retainSourceInLibrary:false}});
 const oldState=p.animationStates.find(s=>s.id==='porto-nara-animations48-state'),animationIDs=[];
 for(const old of p.animations.filter(a=>a.spriteSheet===oldSheet)) {
  const animation=structuredClone(old);animation.id='nara-running-'+old.id;animation.spriteSheet=sheet;
  for(const frame of animation.frames){for(const tile of frame.tiles)tile.sourceSheet=sheet;const tile=frame.tiles[0];frame.sourceFrameIndex=Math.floor(tile.sliceY/48)*9+Math.floor(tile.sliceX/32);}
  put(p.animations,animation);animationIDs.push(animation.id);
 }
 for(const [row,direction]of ['down','up','left','right'].entries()) {
  const template=p.animations.find(a=>a.spriteSheet===oldSheet&&a.name==='walk_'+direction),animation=structuredClone(template);
  animation.id='nara-running-run-'+direction;animation.spriteSheet=sheet;animation.name='run_'+direction;animation.state='run';animation.fps=12;
  animation.frames=Array.from({length:4},(_,index)=>{const f=structuredClone(template.frames[index]);f.id=animation.id+'-'+index;f.sourceFrameIndex=row*9+5+index;const sx=Math.min(...f.tiles.map(t=>t.sliceX)),sy=Math.min(...f.tiles.map(t=>t.sliceY));for(const t of f.tiles){t.sourceSheet=sheet;t.sliceX=t.sliceX-sx+160+index*32;t.sliceY=t.sliceY-sy+row*48;}return f;});
  put(p.animations,animation);animationIDs.push(animation.id);
 }
 put(p.animationStates,{...structuredClone(oldState),id:stateID,spriteSheet:sheet,animationIDs});
 put(p.events,{id:eventName,name:eventName,category:'Global',detail:'Segurar R corre a 170% da caminhada; soltar R retorna imediatamente. Quatro direções, sem consumo de item.',command:'set_player_speed_profile 100 170 r 0',steps:[{id:eventName+'-profile',command:'set_player_speed_profile 100 170 r 0',isEnabled:true}]},'name');
 const targetNames=new Set(p.rooms.filter(r=>r.sceneType==='topdown').map(r=>r.name)),restoreEvents=new Set();
 for(const actor of p.actors.filter(a=>targetNames.has(a.roomName)&&['port-nara','farol-nara','gallery-nara','tide-nara'].includes(a.id))) {
  actor.spriteSheet=sheet;actor.animationStateID=stateID;actor.eventBindings={...actor.eventBindings,onInit:eventName};
  const prefab=p.actorPrefabs?.find(f=>f.id===actor.prefabID);if(prefab)Object.assign(prefab,{spriteSheet:sheet,animationStateID:stateID,eventBindings:{...prefab.eventBindings,onInit:eventName}});
 }
 for(const key of ['rooms','scenas'])for(const room of p[key].filter(r=>targetNames.has(r.name))) {
  if(room.eventBindings?.onInit)restoreEvents.add(room.eventBindings.onInit);
  if(room.eventBindings?.onRestore)restoreEvents.add(room.eventBindings.onRestore);
  if(room.campaign?.controls&&!room.campaign.controls.includes('R corre'))room.campaign.controls+=' R corre enquanto estiver pressionado.';
 }
 for(const event of p.events) {
  const replace=command=>command?.replaceAll('change_player_sprite '+oldSheet,'change_player_sprite '+sheet).replaceAll('change_player_sprite nara-topdown.png','change_player_sprite '+sheet);
  if(event.command)event.command=replace(event.command);
  if(event.commands)event.commands=replace(event.commands);
  for(const step of event.steps??[])step.command=replace(step.command);
  if(restoreEvents.has(event.name)&&!event.steps?.some(s=>s.command==='call_event '+eventName)) {
   event.steps=[{id:event.name+'-run-profile',command:'call_event '+eventName,isEnabled:true},...(event.steps??[])];
  }
 }
 return p;
}

export function preserveTopdownRunning(source, generated) {
 const asset=source.assets.find(a=>a.name==='nara-topdown-walk-run-v1.png'&&a.metadata?.reviewStatus==='approved');
 return asset?configureTopdownRunning(generated,asset.metadata):generated;
}
