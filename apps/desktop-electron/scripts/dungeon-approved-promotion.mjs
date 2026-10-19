import {readFileSync} from 'node:fs';
import {analyzeExampleAssetUsage} from './lib/example-asset-usage.mjs';
const m=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/dungeon-approved-manifest.json',import.meta.url)));
const names=['usina_submersa','usina_combate','usina_saida'];
const upsert=(rows,entries)=>[...rows.map(r=>structuredClone(entries.find(e=>e.id===r.id)??r)),...structuredClone(entries.filter(e=>!rows.some(r=>r.id===e.id)))];
export function promoteApprovedDungeon(source){
 if(!m.approval.approved)throw Error('Dungeon requires visual approval');
 const p=structuredClone(source);if(!p.rooms?.some(r=>names.includes(r.name)))return p;
 p.assets=upsert(p.assets,m.assets);p.animations=upsert(p.animations,m.animations);p.animationStates=upsert(p.animationStates,m.animationStates);p.audioItems=upsert(p.audioItems,m.audioItems);p.settings.hudPresets=upsert(p.settings.hudPresets,m.hud);
 for(const a of p.assets)if(m.scenes.scenes.some(s=>s.background===a.name)){a.metadata.dungeonViewCache=structuredClone(m.cache);a.metadata.runtimeDependencies=[m.cache.tilesAsset,m.cache.mapsAsset,m.cache.palettesAsset];}
 const target=new Map;
 for(const room of p.rooms.filter(r=>names.includes(r.name))){
  const i=names.indexOf(room.name),s=m.scenes.scenes[i],r=structuredClone(room);r.width=11;r.height=11;r.tilemap=Array(121).fill(0);r.collisionTypes=m.scenes.grid.flatMap(row=>[...row].map(c=>c==='#'?'solid':'free'));r.collisions=m.scenes.grid.flatMap(row=>[...row].map(c=>c==='#'?'solid':'free'));
  r.backgroundAssetName=s.background;r.runtimeBaseBackgroundAssetName=s.background;r.runtimeCompositeBackgroundAssetName=s.background;r.music=i===1?'dungeon_patrol':'dungeon_tide';r.dungeonVisualRevision=m.revision;
  r.runtime.config={...r.runtime.config,playerStart:{x:s.x,y:s.y,direction:['up','right','down','left'][s.direction]},presentation:{hudAssetName:m.hudAsset,actionSounds:{step:'dungeon_passo',turn:'dungeon_giro',blocked:'dungeon_bloqueio',hit:'dungeon_impacto',defeat:'dungeon_desativar'}}};
  target.set(r.name,r);
 }
 for(const key of ['rooms','scenas','scenes'])if(Array.isArray(p[key]))p[key]=p[key].map(r=>target.has(r.name)?structuredClone(target.get(r.name)):r);
 if(target.has(p.scena?.name))p.scena=structuredClone(target.get(p.scena.name));
 for(const key of ['scenaConnections','sceneConnections'])for(const link of p.editorState?.[key]??[]){
  const destination=target.get(link.to);if(!destination)continue;
  // Connection areas precede the arrival cell: the exporter takes one step inward.
  const entry={usina_submersa:{x:0,y:9},usina_combate:{x:10,y:3},usina_saida:{x:5,y:4}}[link.to];
  link.entry={...link.entry,...entry};
 }
 for(const [id,who,x,y]of [['usina-sentinel-v2','sentinel',9,2],['usina-energy-cell-v2','cell',5,6]]){
  const a=p.actors.find(a=>a.id===id);if(!a)continue;a.x=x;a.y=y;a.spriteSheet=m[who].near;a.animationName='poses';a.animationFrameIndex=0;a.animationStateID='dungeon-approved-'+who+'-near-state';a.dungeonDepthSheets=structuredClone(m[who]);a.dungeonCell=who==='cell';
 }
 for(const t of p.triggers.filter(t=>names.includes(t.roomName))){t.x=9;t.y=1;t.width=1;t.height=1;}
 // Keep event semantics, rewards and save commands; only destinations and approved sounds change.
 for(const [name,music]of [['usina_ao_entrar','dungeon_tide'],['usina_combate_ao_entrar','dungeon_patrol'],['usina_saida_ao_entrar','dungeon_tide']]){
  const e=p.events.find(e=>e.name===name);if(e&&!e.steps.some(s=>s.command===`play_music ${music}`))e.steps.unshift({id:'dungeon-approved-music-'+name,command:`play_music ${music}`});
 }
 for(const e of p.events)for(const step of e.steps??[]){
  if(typeof step.command!=='string')continue;
  step.command=step.command.replace(/change_scene (usina_submersa|usina_combate|usina_saida) \d+ \d+ (up|right|down|left)/g,(_,name)=>{const s=m.scenes.scenes[names.indexOf(name)];return `change_scene ${name} ${s.x} ${s.y} ${['up','right','down','left'][s.direction]}`;});
  if(e.name==='usina_coletar_celula')step.command=step.command.replace('play_sfx farol_sfx_item','play_sfx dungeon_celula');
  if(e.name==='usina_vencer_combate'||e.name==='usina_encontrar_guardia')step.command=step.command.replace(/play_sfx farol_sfx_(impacto|porta)/,'play_sfx dungeon_porta');
 }
 const roots=JSON.stringify({rooms:p.rooms,events:p.events,settings:p.settings,actors:p.actors});
 p.audioItems=p.audioItems.filter(a=>!m.replacedAudioNames.includes(a.name)||roots.includes('"'+a.name+'"'));
 const retired=new Set(['usina-exploration-background-v3-4bpp.png','usina-combat-background-v3-4bpp.png','usina-exit-background-v3-4bpp.png','hud-usina-exploration-v3-4bpp.png','hud-usina-combat-v3-4bpp.png','hud-usina-exit-v3-4bpp.png','sentinel-depth-far-mid-near-192x64-v3-4bpp.png','usina-energy-cell-v3-4bpp.png','dungeon-approved-hearts-1.png','dungeon-approved-hearts-2.png']);
 const usage=analyzeExampleAssetUsage(p);for(const name of usage.usedNames)retired.delete(name);
 const removed=new Set(p.assets.filter(a=>retired.has(a.name)).map(a=>a.id));p.assets=p.assets.filter(a=>!removed.has(a.id));
 for(const key of ['animations','animationStates'])p[key]=p[key].filter(a=>!retired.has(a.spriteSheet));
 for(const g of p.assetGroups??[])if(Array.isArray(g.assetIDs))g.assetIDs=g.assetIDs.filter(id=>!removed.has(id));
 return p;
}
