import{readFileSync}from'node:fs';
import{it,expect}from'vitest';
import{configureTopdownRunning}from'./topdown-running-project.mjs';

it('adds a reusable player event and twelve directional clips while preserving scene geometry and other work',()=>{
 const source=JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url),'utf8'));
 const sheet="nara-topdown-walk-run-v1.png",oldSheet="porto-nara-animations48.png";
 source.assets=source.assets.filter(a=>a.name!==oldSheet);
 const player=source.assets.find(a=>a.name===sheet);player.id="porto-approved-nara-animations48";player.name=oldSheet;player.metadata.source="Assets/sprites/"+oldSheet;
 source.animations=source.animations.filter(a=>a.spriteSheet!==sheet||a.state!=="run");
 for(const animation of source.animations.filter(a=>a.spriteSheet===sheet)){animation.id=animation.id.replace(/^nara-running-/,"");animation.spriteSheet=oldSheet;for(const frame of animation.frames)for(const tile of frame.tiles)tile.sourceSheet=oldSheet;}
 const playerState=source.animationStates.find(a=>a.spriteSheet===sheet);playerState.id="porto-nara-animations48-state";playerState.spriteSheet=oldSheet;
 playerState.animationIDs=source.animations.filter(a=>a.spriteSheet===oldSheet).map(a=>a.id);
 const before=structuredClone(source);
 const next=configureTopdownRunning(source,{sourceSha256:'candidate-source',preparedSha256:'candidate-prepared'});
 expect(source).toEqual(before);
 const names=['porto_lumen','farol_interior','galeria_das_mares','sala_mare_vazante'];
 for(const room of source.rooms) {
  const changed=next.rooms.find(r=>r.id===room.id);
  if(!names.includes(room.name))expect(changed).toEqual(room);
  else for(const key of ['collisionTypes','collisions','backgroundAssetName','hudPresetId','width','height','cameraBounds'])expect(changed[key]).toEqual(room[key]);
 }
 expect(next.editorState).toEqual(source.editorState);
 for(const animation of source.animations)expect(next.animations.find(a=>a.id===animation.id)).toEqual(animation);
 const event=next.events.find(e=>e.name==='nara_configurar_corrida');
 expect(event.steps.map(s=>s.command)).toEqual(['set_player_speed_profile 100 170 r 0']);
 for(const actor of next.actors.filter(a=>['port-nara','farol-nara','gallery-nara','tide-nara'].includes(a.id))) {
  expect(actor.eventBindings.onInit).toBe(event.name);
  expect(actor.spriteSheet).toBe('nara-topdown-walk-run-v1.png');
 }
 expect(next.animations.filter(a=>a.spriteSheet==='nara-topdown-walk-run-v1.png'&&a.state==='run').map(a=>[a.name,a.frameCount,a.fps])).toEqual(['down','up','left','right'].map(d=>['run_'+d,4,12]));
 expect(configureTopdownRunning(next,{sourceSha256:'candidate-source',preparedSha256:'candidate-prepared'})).toEqual(next);
});
