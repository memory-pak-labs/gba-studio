/** Approved continuous artwork. Logical walking surfaces remain editable cells. */
export const MARKET_SURFACE = 'mercado-adventure-surface.png';
export const MARKET_FRONT = 'mercado-adventure-foreground.png';
export const MARKET_GRID = {tileWidth:24,tileHeight:12,heightStep:16,originX:265,originY:-71};
export const MARKET_POINTS = {player:[16,20],merchant:[15,16],guard:[26,12],guardClear:[25,12],arrival:[15,31],cargo:[28,22],exit:[27,12],arenaReturn:[25,13]};
export function projectMarketCell(x,y,z=0){return [265+(x-y)*12,-71+(x+y)*6-z*16];}
function inside([x,y],polygon){let result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
 const [a,b]=polygon[i],[c,d]=polygon[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)result=!result;
}return result;}
export function marketAdventureGeometry(){
 const width=36,height=36,collision=Array(width*height).fill(1),levels=Array(width*height).fill(0),ramps=Array(width*height).fill(0);
 const ground=[[[139,125],[237,80],[339,127],[239,178]],[[24,192],[64,171],[111,194],[66,218]],[[87,175],[98,185],[158,153],[147,140]],[[272,166],[285,164],[337,187],[328,200]],[[302,216],[339,198],[365,187],[408,228],[351,250]]];
 const terrace=[[365,88],[408,59],[476,91],[434,124]];
 const obstacles=[[[194,95],[222,113],[248,99],[225,82]],[[274,125],[300,138],[324,123],[298,109]],[[155,112],[173,120],[189,110],[174,101]],[[362,223],[383,233],[399,225],[381,210]]];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,p=projectMarketCell(x,y);if(ground.some(poly=>inside(p,poly))&&!obstacles.some(poly=>inside(p,poly)))collision[i]=0;
  if(inside(projectMarketCell(x,y,3),terrace)){collision[i]=0;levels[i]=3;}
 }
 // Bridge thresholds join authored polygons on the same logical grid.
 for(const [x,y] of [[13,22],[14,22],[20,19],[25,19],[25,20],[20,14]])collision[y*width+x]=0;
 // A clipped cargo rim cell has no legal neighbor and must not appear walkable.
 collision[19*width+30]=1;
 // The three stair treads ascend northeast in scene space (positive logical X plus elevation).
 for(const [x,y,z] of [[20,13,0],[21,13,1],[22,13,2],[23,13,3]]){const i=y*width+x;collision[i]=0;levels[i]=z;ramps[i]=2;}
 return {width,height,collision,levels,ramps};
}
export function promoteMarketAdventure(project){
 const result=structuredClone(project),g=marketAdventureGeometry(),size=g.width*g.height;
 const update=scene=>{
  if(scene.name!=='mercado_suspenso')return scene;
  const {collisions: _legacyCollisions,...canonicalScene}=scene;
  return {...canonicalScene,width:g.width,height:g.height,
  backgroundAssetName:MARKET_SURFACE,tilesetAssetName:MARKET_SURFACE,gbStudioUseBackgroundLayout:true,
  backgroundRenderMode:'tilemap',cameraMode:'follow_player',cameraZoom:100,cameraZones:[],
  cameraBounds:{x:0,y:0,width:g.width,height:g.height},tilemap:Array(size).fill(0),tileLayers:[],
  collisionTypes:g.collision.map((v,i)=>v?'solid':g.ramps[i]?'slope_up_right':'free'),heightLevels:g.levels,rampFlags:g.ramps,
  runtime:{...scene.runtime,type:'isometric',config:{...scene.runtime?.config,...MARKET_GRID,gameplayMode:'adventure',movement:'free',worldMode:'scrollable_tiled_world',presentationZoom:100,
   pagedSurface:{backgroundAsset:MARKET_SURFACE,foregroundAsset:MARKET_FRONT,width:512,height:344}}}
  };
 };
 result.rooms=result.rooms.map(update);result.scenas=result.scenas.map(update);
 for(const actor of result.actors){
  if(actor.id==='market-nara')Object.assign(actor,{x:16,y:20,z:0,spriteSheet:'tactical-nara-v5.png',animationStateID:'market-adventure-player-state',animationName:'idle_down',direction:'down'});
  if(actor.id==='market-trader-v2')Object.assign(actor,{x:15,y:16,z:0,spriteSheet:'market-adventure-merchant.png',animationStateID:'market-adventure-merchant-state',animationName:'idle'});
  if(actor.id==='market-guard-v1')Object.assign(actor,{x:26,y:12,z:3,spriteSheet:'market-adventure-guard.png',animationStateID:'market-adventure-guard-state',animationName:'idle'});
 }
 for(const trigger of result.triggers){
  if(trigger.id==='trigger-market-bridge')Object.assign(trigger,{x:28,y:22,width:1,height:1});
  if(trigger.id==='trigger-market-exit')Object.assign(trigger,{x:27,y:12,width:1,height:1});
 }
 for(const event of result.events){
  for(const step of event.steps??[]){
   if(event.roomName==='mercado_suspenso'){
    if(step.command==='set_camera_property pan_y 24')step.command='set_camera_property pan_y 0';
    if(step.command==='set_actor_position market-guard-v1 18 5')step.command='set_actor_position market-guard-v1 25 12';
    if(step.command==='set_actor_position market-guard-v1 19 6')step.command='set_actor_position market-guard-v1 26 12';
   }
   if(/^change_scene mercado_suspenso /.test(step.command))step.command=`change_scene mercado_suspenso ${event.name==='arena_tatica_sair'?'25 13':'15 31'} down`;
  }
 }
 for(const c of result.editorState?.scenaConnections??[]){
  if(c.to==='mercado_suspenso')c.entry={x:c.eventName==='arena_tatica_sair'?25:15,y:c.eventName==='arena_tatica_sair'?13:31,width:1,height:1};
  if(c.from==='mercado_suspenso'&&c.eventName==='mercado_abrir_usina')c.exit={x:27,y:12,width:1,height:1};
 }
 const animations=result.animations.filter(a=>a.spriteSheet==='tactical-nara-v5.png'&&['idle','move'].includes(a.state));
 const state={id:'market-adventure-player-state',name:'adventure',spriteSheet:'tactical-nara-v5.png',animationType:'four_direction_movement',mirrorLeftFromRight:false,animationIDs:animations.map(a=>a.id)};
 result.animationStates=result.animationStates.filter(a=>a.id!==state.id);result.animationStates.push(state);
 for(const role of ['merchant','guard']){
  const id=`market-adventure-${role}`,sheet=`${id}.png`;
  const tiles=[{x:0,y:16,sliceX:0,sliceY:0,tileWidth:32,tileHeight:32},{x:0,y:0,sliceX:0,sliceY:32,tileWidth:32,tileHeight:16}].map((tile,i)=>({...tile,id:`${id}-tile-${i}`,sourceSheet:sheet,flipX:false,flipY:false,objPalette:'OBP0',paletteIndex:0,priority:false}));
  const animation={id,name:'idle',spriteSheet:sheet,frameWidth:32,frameHeight:48,originX:16,originY:48,frameCount:1,fps:1,loops:true,state:'idle',direction:'none',colorMode:'4bpp',frames:[{id:`${id}-frame`,frameIndex:0,sourceFrameIndex:0,width:32,height:48,originX:16,originY:48,tiles}]};
  result.animations=result.animations.filter(a=>a.id!==id);result.animations.push(animation);
  result.animationStates=result.animationStates.filter(a=>a.id!==`${id}-state`);result.animationStates.push({id:`${id}-state`,name:'idle',spriteSheet:sheet,animationType:'fixed',mirrorLeftFromRight:false,animationIDs:[id]});
  const asset={id,name:sheet,kind:'Sprite',metadata:{source:`Assets/sprites/${sheet}`,frameWidth:32,frameHeight:48,width:32,height:48,frameCount:1,colorMode:'4bpp',transparentIndex:0,anchor:'bottom-center',reviewStatus:'approved',provenance:'Approved Mercado adventure composition; original prepared pixels padded without resampling.'}};
  result.assets=result.assets.filter(a=>a.name!==sheet);result.assets.push(asset);
 }
 for(const name of [MARKET_SURFACE,MARKET_FRONT]){
  const asset={id:name.replace('.png',''),name,kind:'Background',metadata:{source:`Assets/backgrounds/${name}`,width:512,height:344,kind:'paged_bg',colorMode:'8bpp-indexed',tileWidth:8,tileHeight:8,reviewStatus:'approved',provenance:'Mercado adventure prepared PNG explicitly approved on 2026-09-27; see adventure/README.md'}};
  result.assets=result.assets.filter(a=>a.name!==name);result.assets.push(asset);
 }
 return result;
}
