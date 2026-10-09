// Focused promotion of the user-approved Porto Lume platformer art.
export const PLATFORMER_V7_BG = 'penedos-platformer-v7.png';
const prefix='penedos-v7-';
const kinds=['player','crab','moth','slime','rock','npc','checkpoint','signpost'];

export function platformerV7CollisionTypes(){
 const width=161, cells=Array(3220).fill('free');
 for(let x=0;x<width;x++){
  if((x>=55&&x<59)||(x>=105&&x<110)){cells[19*width+x]='damage';continue;}
  let top=16;
  if(x>=20&&x<28) top=16-Math.floor((x-20)/2);
  if(x>=28&&x<32) top=11;
  if(x>=32&&x<36) top=13+Math.floor((x-32)/2);
  if(x>=79&&x<89) top=13;
  for(let y=top;y<20;y++) cells[y*width+x]=x>=139?'free':'solid';
  if(x>=139) cells[16*width+x]='down';
 }
 for(let y=7;y<16;y++) cells[y*161+137]='ladder';
 return cells;
}

function animation(kind,state,indexes){
 const sheet=prefix+kind+'.png', id=prefix+kind+'-'+state;
 return {id,name:state+'_right',spriteSheet:sheet,frameWidth:32,frameHeight:32,
  fps:state==='walk'?8:6,loops:!['jump','fall','hurt','attack'].includes(state),frameCount:indexes.length,
  state,direction:'right',colorMode:'4bpp',sourceColorMode:'4bpp',originX:0,originY:0,
  hitboxX:8,hitboxY:kind==='player'?-8:-16,hitboxWidth:16,hitboxHeight:16,
  frames:indexes.map((sourceFrameIndex,frameIndex)=>({id:`${id}-${frameIndex}`,frameIndex,sourceFrameIndex,
   width:32,height:32,originX:0,originY:0,tiles:[{id:`${id}-${frameIndex}-tile`,x:0,y:0,
    sliceX:sourceFrameIndex*32,sliceY:0,sourceSheet:sheet,tileWidth:32,tileHeight:32,
    flipX:false,flipY:false,objPalette:'OBP0',paletteIndex:0,priority:false}]}))};
}

export function promotePlatformerV7(project){
 const next=structuredClone(project);
 if(!next.scenas?.some(s=>s.name==='penedos_vento')) return next;
 const update=s=>{
  if(s.name!=='penedos_vento')return s;
  const collisionTypes=platformerV7CollisionTypes();
  return {...s,width:161,height:20,cameraBounds:{x:0,y:0,width:161,height:20},
   cameraMode:'follow_player',backgroundRenderMode:'tilemap',gbStudioUseBackgroundLayout:true,
   backgroundAssetName:PLATFORMER_V7_BG,runtimeBaseBackgroundAssetName:PLATFORMER_V7_BG,
   runtimeCompositeBackgroundAssetName:PLATFORMER_V7_BG,
   parallax:{mode:'none',offsetX:0,offsetY:0,speedX:256,speedY:256},
   tilemap:Array(3220).fill(0),collisionTypes,collisions:[...collisionTypes],
   tileLayers:[{mapping:'BG2',tilemap:Array(3220).fill(0),tileSourceAssetNames:Array(3220).fill(PLATFORMER_V7_BG)}],
   platformerVisualRevision:'porto-lume-v7-approved'};
 };
 next.scenas=next.scenas.map(update);next.rooms=next.rooms?.map(update);
 if(next.scena?.name==='penedos_vento')next.scena=update(next.scena);
 const assets=[{id:'penedos-platformer-v7',kind:'Background',name:PLATFORMER_V7_BG,systemImage:'figure.run',metadata:{
  source:'Assets/backgrounds/'+PLATFORMER_V7_BG,generatedBy:'platformer-v7-approved',reviewStatus:'approved',
  visualStatus:'approved',assetcStatus:'attention',width:1288,height:160,role:'platformer-full-scene',
  runtimeValidationNote:'Source approved; assetc merges 784 of 1680 tiles to budget 896; framebuffer equivalence not verified',
  sceneRoles:['platformer-full-scene'],backgroundPaletteBankBudget:16,
  backgroundTileOptimizer:{enabled:true,tileBudget:896},sourcePreparation:'Approved v7 logical PNG preserved; runtime pack validation separate'
 }},...kinds.map(kind=>({id:prefix+kind,kind:'Sprite',name:prefix+kind+'.png',systemImage:'figure.run',metadata:{
  source:'Assets/sprites/'+prefix+kind+'.png',generatedBy:'platformer-v7-approved',reviewStatus:'approved',
  visualStatus:'approved',assetcStatus:'pending',frameWidth:32,frameHeight:32,
  frameCount:kind==='player'?8:['crab','moth','slime','rock'].includes(kind)?2:1,
  collisionWidth:16,collisionHeight:16,anchor:'bottom-center',colorMode:'4bpp',
  sourcePreparation:'Approved recovered RGBA frames, horizontal assembly only; exporter owns runtime palette',
  role:'platformer-'+kind,sceneRoles:['platformer-'+kind]
 }}))];
 const names=new Set(assets.map(a=>a.name));
 next.assets=[...(next.assets??[]).filter(a=>!names.has(a.name)),...assets.map(a=>({...a,metadata:{
  ...next.assets?.find(old=>old.name===a.name)?.metadata,...a.metadata
 }}))];
 const animations=[...Object.entries({idle:[0],walk:[1,2,3],jump:[4],fall:[5],attack:[6],hurt:[7],climb:[0]})
  .map(([state,frames])=>animation('player',state,frames)),...kinds.filter(k=>k!=='player').flatMap(k=>[
   animation(k,'idle',[0]),...(['crab','moth','slime','rock'].includes(k)?[animation(k,'attack',[1])]:[])])];
 next.animations=[...(next.animations??[]).filter(a=>!a.id.startsWith(prefix)),...animations];
 next.animationStates=[...(next.animationStates??[]).filter(a=>!a.id.startsWith(prefix)),...kinds.map(k=>({
  id:prefix+k+'-state',name:'default',spriteSheet:prefix+k+'.png',animationType:k==='player'?'platform_player':'fixed',
  mirrorLeftFromRight:k==='player',animationIDs:animations.filter(a=>a.spriteSheet===prefix+k+'.png').map(a=>a.id)
 }))];
 const specs=[['player','Nara · Penedos',14,14],['crab','Caranguejo · Penedos',43,14],
  ['moth','Mariposa · Penedos',97,9],['slime','Gosma · Penedos',70,14],['rock','Rocha · Penedos',84,11],
  ['npc','Trabalhador · Penedos',10,14],['checkpoint','Farol · Penedos',117,14],['signpost','Placa · Penedos',127,14]];
 const oldActors=new Map((next.actors??[]).map(a=>[a.id,a]));
 next.actors=[...(next.actors??[]).filter(a=>a.roomName!=='penedos_vento'),...specs.map(([kind,name,x,y])=>({
  ...(oldActors.get('penedos-'+kind)??{}),id:'penedos-'+kind,name,roomName:'penedos_vento',x,y,z:0,
  spriteSheet:prefix+kind+'.png',animationName:'idle_right',animationStateID:prefix+kind+'-state',
  ...(kind==='player'?{gbStudioPlayerRuntime:'PLATFORM'}:{}),eventBindings:oldActors.get('penedos-'+kind)?.eventBindings??{}
 }))];
 next.triggers=(next.triggers??[]).map(t=>t.id==='trigger-penedos-grip-module'?{...t,x:157,y:12,width:3,height:4}:t);
 next.sceneRouteTables=(next.sceneRouteTables??[]).map(t=>({...t,routes:t.routes?.map(r=>r.scene==='penedos_vento'?{...r,x:14,y:14}:r)}));
 return next;
}
