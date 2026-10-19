import { readFileSync } from 'node:fs';
import { analyzeExampleAssetUsage } from './lib/example-asset-usage.mjs';
const m=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/tempestade-approved-manifest.json',import.meta.url)));
const upsert=(rows,entries)=>[...rows.map(r=>structuredClone(entries.find(e=>e.id===r.id)??r)),...structuredClone(entries.filter(e=>!rows.some(r=>r.id===e.id)))];
export function promoteApprovedTempestade(source){
 if(!m.approval.approved||!m.approval.visual||!m.approval.palette||!m.approval.audio)throw Error('Tempestade requires explicit approval.');
 const p=structuredClone(source),room=p.rooms?.find(r=>r.name==='tempestade');if(!room)return p;
 const oldNames=new Set(['porto-lume-shmup-wide-v3.png','tempestade-v3-player.png','tempestade-v3-drone-horizontal.png','tempestade-v3-drone-vertical.png','tempestade-v3-boss-lighthouse.png','storm-shot.png','storm-bolt.png']);
 p.assets=upsert(p.assets,m.assets);p.animations=upsert(p.animations,m.animations);p.animationStates=upsert(p.animationStates,m.animationStates);p.audioItems=upsert(p.audioItems,m.audioItems);
 p.settings.hudPresets=upsert(p.settings.hudPresets,[m.hud]);
 p.settings.shmup={...p.settings.shmup,projectileOffset:{x:40,y:12},projectileSize:{x:8,y:8},playerSprite:m.names.player,playerExplosionSprite:m.names.explosion,enemySprite:m.names['drone-a'],projectileSprite:m.names.shot,enemyProjectileSprite:m.names.bolt};
 const target={...room,width:96,height:20,backgroundAssetName:m.names.background,runtimeBaseBackgroundAssetName:m.names.background,runtimeCompositeBackgroundAssetName:m.names.background,cameraZoom:100,cameraBounds:{x:0,y:0,width:96,height:20},music:m.audioItems[0].id,hudPresetId:m.hud.id,tileLayers:[],referenceImages:[],tilemap:Array(1920).fill(0),collisions:Array(1920).fill("free"),collisionTypes:Array(1920).fill("free"),heightLevels:Array(1920).fill(0),tempestadeVisualRevision:m.revision,visualPromotionStatus:'canonical-integrated'};
 target.eventBindings={...target.eventBindings,onDefeat:"tempestade_reiniciar"};
 delete target.tilemapRLE;target.runtime=structuredClone(room.runtime);const cfg=target.runtime.config;
 cfg.wavePlan=[{name:'tempestade_inicial',startFrame:0,playerSpeed:2,fireCooldown:8,scrollSpeed:1},{name:'tempestade_farol',startFrame:0,playerSpeed:2,fireCooldown:8,scrollSpeed:1}];
 for(const mod of cfg.modules??[])if(mod.id==='waves')mod.settings={...mod.settings,maxWaves:2,loop:false};
 for(const layer of cfg.composition?.layers??[])if(layer.kind==='regular_bg')layer.assetId=m.names.background;
 for(const res of cfg.resources?.resources??[])if(res.kind==='regular_bg'){res.assetId=m.names.background;res.tileLimit=896;}
 for(const key of ['rooms','scenas','scenes'])if(Array.isArray(p[key]))p[key]=p[key].map(r=>r.name==='tempestade'?structuredClone(target):r);
 if(p.scena?.name==='tempestade')p.scena=structuredClone(target);
 const actors=structuredClone(m.actors);p.actors=[...p.actors.filter(a=>a.roomName!=='tempestade'),...actors];
 for(const a of actors){
  const player=a.id.endsWith('-player'),boss=a.id.includes('boss'),vertical=a.id.includes('vertical')||a.id.endsWith('drone-b'),key=player?'player':boss?'boss':vertical?'drone-b':'drone-a';
  a.id='tempestade-approved-actor-'+key;a.spriteSheet=m.names[key];a.animationStateID='tempestade-approved-'+key+'-state';a.animationName=player?'fly_right':'idle';a.waveIndex=boss?1:0;
  if(player){a.x=5;a.y=8;a.eventBindings={...a.eventBindings,onInteract:'tempestade_disparar',onHit1:'tempestade_dano'};}
  else{a.name=boss?'Farol da Tempestade':vertical?'Drone de carga':'Drone de patrulha';a.x=boss?43:vertical?64:46;a.y=boss?7:vertical?13:5;a.shmup={width:boss?48:16,height:boss?48:16,health:boss?6:2,fireInterval:boss?40:60};a.eventBindings={...(boss?{onInit:'tempestade_farol_entrar'}:{}),onInteract:'tempestade_dano',onHit1:'tempestade_destruir'};a.scriptName='tempestade_drone_disparar';}
 }
 const event=(name,commands)=>({id:'approved-'+name,name,roomName:'tempestade',category:'Cena',command:'noop',steps:commands.map((command,i)=>({id:name+'-'+i,command,isEnabled:true}))});
 const entries=[event('tempestade_reiniciar',['wait 30','change_scene tempestade 5 8 right']),event('tempestade_ao_entrar',['play_music tempestade_travessia']),event('tempestade_farol_entrar',['play_music tempestade_farol','play_sfx tempestade_alerta']),event('tempestade_disparar',['play_sfx tempestade_disparo']),event('tempestade_dano',['play_sfx tempestade_dano']),event('tempestade_destruir',['play_sfx tempestade_explosao']),event('tempestade_drone_disparar',actors.filter(a=>!a.id.endsWith('-player')).map(a=>'launch_projectile '+a.id+' left 2 '+m.names.bolt))];
 for(const e of entries){const at=p.events.findIndex(row=>row.name===e.name);if(at<0)p.events.push(e);else p.events[at]={...p.events[at],...e};}
 const reward=p.events.find(e=>e.name==='tempestade_concluir');
 if(reward&&!reward.steps.some(s=>s.id==='tempestade-module-sound'))reward.steps.unshift({id:'tempestade-module-sound',command:'play_sfx tempestade_modulo',isEnabled:true},{id:'tempestade-module-wait',command:'wait 60',isEnabled:true});
 // Replaced PNGs remain intact on disk; remove only dormant Tempestade library records.
 const usage=analyzeExampleAssetUsage(p),removed=new Set(p.assets.filter(a=>oldNames.has(a.name)&&!usage.usedNames.has(a.name)).map(a=>a.id));
 p.assets=p.assets.filter(a=>!removed.has(a.id));p.animations=p.animations.filter(a=>!oldNames.has(a.spriteSheet)||usage.usedNames.has(a.spriteSheet));p.animationStates=p.animationStates.filter(a=>!oldNames.has(a.spriteSheet)||usage.usedNames.has(a.spriteSheet));
 for(const g of p.assetGroups??[])if(Array.isArray(g.assetIDs))g.assetIDs=g.assetIDs.filter(id=>!removed.has(id));
 return p;
}

