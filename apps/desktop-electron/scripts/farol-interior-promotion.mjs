import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/farol-interior-manifest.json',import.meta.url)));

/** Ground collisions are authored on8pxcells; fixture silhouettes and actors remain separate. */
export function approvedFarolCollisionTypes() {
 const {width,height,solidRects,stairEllipsePixels:stairs}=manifest.layout;
 return Array.from({length:width*height},(_,i)=>{
  const x=i%width,y=Math.floor(i/width);
  const floor=x>=3&&x<45&&y>=6&&y<28 || x>=5&&x<43&&y===28 || x>=22&&x<26&&y>=28;
  if(!floor)return 'solid';
  if(solidRects.some(([rx,ry,w,h])=>x>=rx&&x<rx+w&&y>=ry&&y<ry+h))return 'solid';
  const dx=(x*8+4-stairs.x)/stairs.radiusX,dy=(y*8+4-stairs.y)/stairs.radiusY;
  return dx*dx+dy*dy<1.15?'solid':'free';
 });
}

/** Promote the reviewed Farol presentation, preserving existing campaign behavior. */
export function promoteApprovedFarolInterior(source) {
 if(!manifest.approval.approved||!manifest.approval.visual||!manifest.approval.palette)throw Error('Farol requires explicit visual and palette approval.');
 const p=structuredClone(source),name=manifest.scene,entry=manifest.asset,{width,height,playerStart,keeperPosition,lensTrigger,exitTrigger}=manifest.layout;
 if(!p.rooms.some(r=>r.name===name))throw Error('Farol Interior scene missing.');
 const metadata={source:entry.source,kind:'paged_bg',colorMode:'8bpp-indexed',backgroundBpp:8,width:384,height:256,tileCount:entry.uniqueTiles,
  visibleColors:entry.visibleColors,sourceSha256:entry.sourceSha256,preparedSha256:entry.sha256,generatedBy:'approved-farol-interior-scale-v2',
  provenance:entry.preparation,license:manifest.license,reviewStatus:'approved',visualStatus:'approved',assetcReviewed:true,profile:'topdown-paged',
  role:'lighthouse-interior-topdown',sceneRoles:[name],visualApproval:{date:manifest.approval.date,contract:'farol-interior-scale-v2-approved'},
  backgroundTileOptimizer:{enabled:false},compressionPolicy:{tiles:'none',tilemap:'none',palette:'none'}};
 const previousIndex=p.assets.findIndex(a=>a.id===entry.id);
 p.assets=p.assets.filter(a=>a.id!==entry.id);
 const old=p.assets.findIndex(a=>a.name===entry.retainedAsset);
 p.assets.splice(old>=0?old+1:previousIndex>=0?previousIndex:p.assets.length,0,{id:entry.id,name:entry.file,kind:'Background',systemImage:'building.columns.fill',metadata});
 if(old>=0)p.assets[old].metadata={...p.assets[old].metadata,reusableLibraryAsset:true};
 const collision=approvedFarolCollisionTypes();
 const update=r=>{
  if(r.name!==name)return r;
  const result={...r,width,height,backgroundAssetName:entry.file,backgroundRenderMode:'tilemap',gbStudioUseBackgroundLayout:true,
   cameraMode:'follow_player',cameraZoom:100,cameraBounds:{x:0,y:0,width,height},hudPresetId:r.hudPresetId==='hud-farol-trial'?r.hudPresetId:manifest.preservedActors.hudPresetId,
   tilemap:Array(width*height).fill(0),collisions:[...collision],collisionTypes:[...collision],tileLayers:[],heightLevels:Array(width*height).fill(0),
   runtime:{...r.runtime,type:'topdown',config:{...r.runtime?.config,presentation:'topdown',profile:'farol-interior-scale-v2-approved'}}};
  delete result.tilesetAssetName;return result;
 };
 for(const key of ['rooms','scenas'])p[key]=p[key].map(update);
 if(p.scena)p.scena=update(p.scena);
 p.actors=p.actors.map(a=>a.id==='farol-nara'?{...a,...playerStart,spriteSheet:manifest.preservedActors.player,
  animationName:'idle_up',animationStateID:'porto-nara-animations48-state'}:a.id==='farol-keeper'?{...a,...keeperPosition,
  spriteSheet:manifest.preservedActors.keeper,animationName:'idle_down',animationStateID:'porto-approved-lighthousekeeper-body48-state'}:a);
 const retiredSheets=new Set(['player-pilot-32x32.png','lighthousekeeper-pilot-32x32.png','nara-topdown.png']);
 for(const asset of p.assets)if(retiredSheets.has(asset.name)&&!p.actors.some(a=>a.spriteSheet===asset.name)){
  asset.metadata={...asset.metadata,reusableLibraryAsset:true};
 }
 p.triggers=p.triggers.map(t=>t.id==='trigger-lighthouse-lens'?{...t,...lensTrigger}:t.id==='trigger-lighthouse-exit'?{...t,...exitTrigger}:t);
 for(const event of p.events){
  if(event.name==='farol_interior_ao_entrar')for(const step of event.steps??[]){
   if(step.command.startsWith('change_player_sprite '))step.command='change_player_sprite '+manifest.preservedActors.player;
   if(step.command.startsWith('set_actor_animation Player '))step.command='set_actor_animation Player idle_up';
  }
  for(const step of event.steps??[])if(step.command.startsWith('change_scene farol_interior '))step.command=`change_scene farol_interior ${playerStart.x} ${playerStart.y} up`;
 }
 for(const c of p.editorState?.scenaConnections??[]){
  if(c.to===name)Object.assign(c.entry,playerStart);
  if(c.from===name)c.exit={...exitTrigger};
 }
 return p;
}
