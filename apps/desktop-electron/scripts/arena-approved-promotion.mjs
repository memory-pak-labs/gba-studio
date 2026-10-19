import {readFileSync} from 'node:fs';

const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/arena-approved-manifest.json',import.meta.url)));
const upsert=(current,entries)=>{
 const replacements=new Map(entries.map(entry=>[entry.id,entry]));
 const currentIds=new Set(current.map(entry=>entry.id));
 return current.map(entry=>structuredClone(replacements.get(entry.id)??entry))
  .concat(structuredClone(entries.filter(entry=>!currentIds.has(entry.id))));
};

/** Integrate only the reviewed arena presentation; retain campaign and combat rules. */
export function promoteApprovedArena(source){
 if(!manifest.approval.approved||!manifest.approval.visual||!manifest.approval.palette)throw new Error('Arena requires visual and palette approval.');
 const p=structuredClone(source),scene=manifest.scene;
 if(!p.rooms.some(room=>room.name===scene))throw new Error('Arena scene missing.');
 const assetIds=new Set(manifest.assets.map(asset=>asset.id));
 p.assets=p.assets.filter(asset=>!assetIds.has(asset.id));
 const beforePlatformer=p.assets.findIndex(asset=>asset.id.startsWith('penedos-v7-'));
 p.assets.splice(beforePlatformer<0?p.assets.length:beforePlatformer,0,...structuredClone(manifest.assets.map(({sha256,...asset})=>asset)));
 for(const asset of p.assets)if(manifest.retainedAssets.includes(asset.name))asset.metadata={...asset.metadata,reusableLibraryAsset:true};
 p.animations=upsert(p.animations,manifest.animations);
 p.animationStates=upsert(p.animationStates,manifest.animationStates);
 p.audioItems=upsert(p.audioItems,manifest.audioItems);
 p.actors=p.actors.map(actor=>{
  const approved=manifest.actors.find(entry=>entry.id===actor.id);
  return approved?{...actor,...structuredClone(approved)}:actor;
 });
 p.settings.hudPresets=upsert(p.settings.hudPresets,[manifest.hud]);
 const update=room=>{
  if(room.name!==scene)return room;
  const config={...room.runtime.config,player1StartX:64,player2StartX:176,hudPresetId:manifest.hud.id,actionSounds:structuredClone(manifest.actionSounds)};
  delete config.hudAssetName;
  return {...room,backgroundAssetName:'arena-coastal-240x160.png',backgroundRenderMode:'tilemap',music:manifest.music,
   hudPresetId:manifest.hud.id,runtime:{...room.runtime,config}};
 };
 for(const key of ['rooms','scenas'])p[key]=p[key].map(update);
 if(p.scena)p.scena=update(p.scena);
 const enter=p.events.find(event=>event.name==='arena_ao_entrar');
 if(enter){
  const music=enter.steps.find(step=>step.command.startsWith('play_music '));
  if(music)music.command='play_music '+manifest.music;
  else enter.steps.push({id:'event-arena-enter-music',command:'play_music '+manifest.music,isEnabled:true});
 }
 return p;
}
