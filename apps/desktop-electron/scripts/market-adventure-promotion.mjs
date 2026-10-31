import {readFileSync} from 'node:fs';
import {fitProjectSpriteFrames} from './lib/sprite-canvas-audit.mjs';
const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/market-approved-manifest.json',import.meta.url)));
export const MARKET_SURFACE=manifest.assets[0].name;
export const MARKET_FRONT=manifest.assets[1].name;
export const MARKET_GRID=manifest.layout.grid;
export const MARKET_POINTS=manifest.layout.points;
export function projectMarketCell(x,y,z=0){const g=MARKET_GRID;return[g.originX+(x-y)*g.tileWidth/2,g.originY+(x+y)*g.tileHeight/2-z*g.heightStep];}
export function marketAdventureGeometry(){const l=manifest.layout;return structuredClone({width:l.width,height:l.height,collision:l.collision,levels:l.levels,ramps:l.ramps});}
const upsert=(rows,items)=>{const ids=new Set(items.map(x=>x.id));return[...rows.filter(x=>!ids.has(x.id)),...structuredClone(items)];};
/** Promote only the approved adventure presentation; keep campaign semantics and unrelated scenes. */
export function promoteMarketAdventure(project){
 if(!manifest.approval.approved||!manifest.approval.visual||!manifest.approval.palette)throw Error('Mercado requires explicit visual and palette approval.');
 const p=structuredClone(project),g=marketAdventureGeometry(),points=MARKET_POINTS,sheet=manifest.assets[2].name;
 const update=r=>{
  if(r.name!=='mercado_suspenso')return r;
  const {collisions:_legacy,...scene}=r;
  return {...scene,width:g.width,height:g.height,backgroundAssetName:MARKET_SURFACE,tilesetAssetName:MARKET_SURFACE,gbStudioUseBackgroundLayout:true,
   backgroundRenderMode:'tilemap',cameraMode:'follow_player',cameraZoom:100,cameraZones:[{id:'market-world-camera',name:'Mercado inteiro',area:{x:0,y:0,width:g.width,height:g.height},bounds:{x:0,y:0,width:768,height:512},lockX:false,lockY:false,offset:{x:0,y:0}}],hudPresetId:manifest.hud.id,
   cameraBounds:{x:0,y:0,width:768,height:512},tilemap:Array(g.width*g.height).fill(0),tileLayers:[],
   collisionTypes:g.collision.map((v,i)=>v?'solid':g.ramps[i]?'slope_up_left':'free'),heightLevels:g.levels,rampFlags:g.ramps,
   runtime:{...r.runtime,type:'isometric',config:{...r.runtime?.config,...MARKET_GRID,profile:'market-suspenso-approved-adventure-v2',gameplayMode:'adventure',movement:'free',worldMode:'scrollable_tiled_world',presentationZoom:100,pagedSurface:{backgroundAsset:MARKET_SURFACE,foregroundAsset:MARKET_FRONT,width:768,height:512}}}};
 };
 for(const k of['rooms','scenas'])p[k]=p[k].map(update);if(p.scena)p.scena=update(p.scena);
 for(const a of p.actors){const role=a.id==='market-nara'?'player':a.id==='market-trader-v2'?'merchant':a.id==='market-guard-v1'?'guard':null;if(!role)continue;
  const[x,y]=points[role];Object.assign(a,{x,y,z:role==='guard'?3:0,spriteSheet:sheet,animationStateID:`market-adventure-${role}-state`,animationName:role==='player'?'idle_down':role+'_idle',direction:role==='player'?'down':'none'});
 }
 for(const t of p.triggers){const point=t.id==='trigger-market-bridge'?points.cargo:t.id==='trigger-market-exit'?points.exit:null;if(point)Object.assign(t,{x:point[0],y:point[1],width:1,height:1});}
 for(const event of p.events){
  for(const s of event.steps??[]){
   if(event.roomName==='mercado_suspenso'){
    if(s.command==='set_camera_property pan_y 24')s.command='set_camera_property pan_y 0';
    if(/^set_actor_position market-guard-v1 /.test(s.command)){const clear=/ (?:18 5|25 12)$/.test(s.command)||s.id?.endsWith('-guard-clear');const pt=clear?points.guardClear:points.guard;s.command=`set_actor_position market-guard-v1 ${pt.join(' ')}`;if(clear)s.id=`${event.name}-guard-clear`;}
   }
   if(/^change_scene mercado_suspenso /.test(s.command))s.command=`change_scene mercado_suspenso ${(event.name==='arena_tatica_sair'?points.arenaReturn:points.arrival).join(' ')} down`;
  }
  if(event.name==='mercado_ao_entrar'&&!event.steps.some(s=>s.id==='mercado-health-default'))event.steps.unshift(
   {id:'mercado-health-if',command:'if_variable porto_player_health 0',isEnabled:true},
   {id:'mercado-health-default',command:'set_variable porto_player_health 3',isEnabled:true},
   {id:'mercado-health-end',command:'condition_end',isEnabled:true});
 }
 for(const c of p.editorState?.scenaConnections??[]){if(c.to==='mercado_suspenso'){const pt=c.eventName==='arena_tatica_sair'?points.arenaReturn:points.arrival;c.entry={x:pt[0],y:pt[1],width:1,height:1};}if(c.from==='mercado_suspenso'&&c.eventName==='mercado_abrir_usina')c.exit={x:points.exit[0],y:points.exit[1],width:1,height:1};}
 for(const t of p.sceneRouteTables??[])for(const r of[...(t.routes??[]),t.fallback].filter(Boolean))if(r.scene==='mercado_suspenso')Object.assign(r,{x:points.arrival[0],y:points.arrival[1]});
 p.assets=upsert(p.assets,manifest.assets.map(({sha256,...a})=>a));
 const retired=new Set(['mercado-adventure-surface.png','mercado-adventure-foreground.png','market-adventure-merchant.png','market-adventure-guard.png','tactical-nara-v5.png','dialogue-sigil.png']);
 // Keep old approved files on disk; remove obsolete registrations only if no other scene uses them.
 for(const name of retired)if(!p.actors.some(a=>a.spriteSheet===name)&&!p.rooms.some(r=>r.backgroundAssetName===name)){p.assets=p.assets.filter(a=>a.name!==name);p.animations=p.animations.filter(a=>a.spriteSheet!==name);p.animationStates=p.animationStates.filter(a=>a.spriteSheet!==name);}
 p.animations=upsert(p.animations,fitProjectSpriteFrames({animations:manifest.animations}).animations);
 p.animationStates=upsert(p.animationStates,manifest.animationStates);
 p.settings.hudPresets=upsert(p.settings.hudPresets,[manifest.hud]);
 for(const[key,prefabKey]of[['actors','actorPrefabs'],['triggers','triggerPrefabs']])for(const entity of p[key].filter(a=>a.roomName==='mercado_suspenso')){
  const prefab=p[prefabKey]?.find(f=>f.id===entity.prefabID);if(!prefab)continue;
  for(const[field,value]of Object.entries(entity))if(!['id','name','roomName','x','y','z','prefabID'].includes(field))prefab[field]=structuredClone(value);
  prefab.authoring={...prefab.authoring,sourcePosition:{x:entity.x,y:entity.y}};
 }
 return p;
}
