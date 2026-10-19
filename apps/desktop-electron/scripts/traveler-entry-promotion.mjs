import {readFileSync} from 'node:fs';
import {fitProjectSpriteFrames} from './lib/sprite-canvas-audit.mjs';
const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/traveler-entry-manifest.json',import.meta.url)));
export const TRAVELER_ENTRY_SCENES = Object.freeze(['escolha_genero', 'nome_jogador']);
const affected=new Set(TRAVELER_ENTRY_SCENES);
const prefix='traveler-entry-';

function animation(key,entry,index){
 const id=prefix+key,w=entry.width,h=entry.height;
 return {id,name:id,spriteSheet:entry.file,frameWidth:w,frameHeight:h,frameCount:1,fps:6,loops:true,state:'idle',direction:'none',colorMode:`${entry.bpp}bpp`,sourceColorMode:`${entry.bpp}bpp`,originSpace:'animator',originX:0,originY:8-h,hitboxX:0,hitboxY:0,hitboxWidth:w,hitboxHeight:h,
  frames:[{id:id+'-frame',frameIndex:0,width:w,height:h,originX:0,originY:8-h,sourceFrameIndex:index,tiles:[{id:id+'-tile',x:0,y:0,sliceX:index*w,sliceY:0,sourceSheet:entry.file,tileWidth:w,tileHeight:h,flipX:false,flipY:false,objPalette:'OBP0',paletteIndex:0,priority:false}]}]};
}

/** Integrate the approved registration art without changing campaign events or player assets. */
export function promoteApprovedTravelerEntry(source) {
 const project=structuredClone(source);
 const retired=new Set(project.rooms.filter(r=>affected.has(r.name)).map(r=>r.backgroundAssetName));
 for(const actor of project.actors.filter(a=>affected.has(a.roomName)))retired.add(actor.spriteSheet);
 project.actors=project.actors.filter(a=>!affected.has(a.roomName));
 project.assets=project.assets.filter(a=>!a.id.startsWith(prefix));
 project.animations=project.animations.filter(a=>!a.id.startsWith(prefix));
 project.animationStates=project.animationStates.filter(a=>!a.id.startsWith(prefix));
 for(const entry of Object.values(manifest.assets)){
  const metadata={source:entry.source,width:entry.width,height:entry.height,colorMode:`${entry.bpp}bpp`,license:entry.license,generatedBy:'approved-traveler-entry-v2',reviewStatus:'approved',visualStatus:'approved',preparedSha256:entry.sha256,sourceSha256:entry.sha256,provenance:entry.preparation};
  if(entry.kind==='bg')Object.assign(metadata,{backgroundPaletteBankBudget:14,backgroundPaletteReferencePlan:entry.palettePlan,backgroundTileOptimizer:{enabled:true,tileBudget:600,maxSourcePixelErrorRatio:0,maxFramebufferMismatchRatio:0},titleBakedIntoBackground:true,titleLanguage:'pt-BR',assetcStatus:'attention',palettePreparationVisuallyApproved:true});
  else Object.assign(metadata,{frameWidth:entry.width,frameHeight:entry.height,frameCount:entry.frames});
  const beforePlatformer=project.assets.findIndex(a=>a.id.startsWith('penedos-v7-'));
  project.assets.splice(beforePlatformer<0?project.assets.length:beforePlatformer,0,{id:prefix+entry.id,name:entry.file,kind:entry.kind==='bg'?'Background':'Sprite',metadata});
 }
 function actor(id,name,scene,key,frame,x,y,extra={}){
  const entry=manifest.assets[key],animKey=`${key}-${frame}`,anim=animation(animKey,entry,frame);
  if(!project.animations.some(a=>a.id===anim.id)){
   project.animations.push(anim);project.animationStates.push({id:anim.id+'-state',name:'default',spriteSheet:entry.file,animationType:'fixed',mirrorLeftFromRight:false,animationIDs:[anim.id]});
  }
  project.actors.push({id,name,roomName:scene,x:Math.floor(x/8),y:Math.floor(y/8),menuPositionPixels:{x,y},spriteSheet:entry.file,animationName:anim.name,animationStateID:anim.id+'-state',menuActorRole:'decorative',...extra});
 }
 for(const [index,variant]of ['male','female'].entries())actor(`gender-portrait-${variant}-gba`,`gender-portrait-${variant}-gba`,'escolha_genero','gender-portraits',index,index?140:36,48,{menuActorRole:'option',menuItemID:variant,menuCharacterVariant:variant});
 for(let i=0;i<4;i++){
  const dx=i%2*80,dy=Math.floor(i/2)*104;
  actor(i===0?'gender-gold-frame-male-gba':prefix+`focus-${i}`,i===0?'Moldura de seleção':`Canto de seleção ${i+1}`,'escolha_genero','focus-corners',i,24+dx,32+dy,{menuActorRole:'cursor',cursorForMenu:'escolha_genero',menuCursorFollowsOption:true,menuCursorOffsetPixels:{x:-12+dx,y:-16+dy}});
 }
 actor(prefix+'label-male','Homem · rótulo','escolha_genero','gender-labels',0,44,124);
 actor(prefix+'label-female','Mulher · rótulo','escolha_genero','gender-labels',1,148,124);
 for(const [index,variant]of ['male','female'].entries())actor(`name-portrait-${variant}-gba`,`name-portrait-${variant}-gba`,'nome_jogador','name-portraits',index,20,40,{menuVisibilityVariable:'var_character_gender',menuVisibilityValue:index});
 for(const room of project.rooms.filter(r=>affected.has(r.name))){
  const gender=room.name==='escolha_genero',entry=manifest.assets[gender?'gender-bg':'name-bg'];
  if(room.backgroundAssetName!==entry.file&&!room.referenceImages?.some(r=>r.assetName===room.backgroundAssetName))room.referenceImages=[...(room.referenceImages??[]),{id:prefix+`previous-${room.name}`,assetName:room.backgroundAssetName,title:'Arte anterior preservada',visible:false}];
  room.backgroundAssetName=entry.file;room.backgroundRenderMode='tilemap';room.paletteBankPolicy='ui-reserved';
  const config=room.runtime.config;Object.assign(config,{title:'',titleOverlayAssetName:'',hudMode:'none'});
  if(gender)config.items=config.items.map((item,i)=>({...item,clickBox:{x:i?128:24,y:32,width:88,height:112}}));
  else{
   config.textInput={...config.textInput,x:15,y:5,width:8,maxLength:8,keyboard:{...config.textInput.keyboard,x:11,y:8,width:16,height:10,controlLayout:'bottom_grid',surface:'background',allowLowercase:true}};
   config.items=config.items.map(item=>({...item,clickBox:item.id==='name'?{x:80,y:32,width:148,height:20}:{x:184,y:128,width:40,height:16}}));
  }
 }
 project.scenas=project.scenas.map(s=>affected.has(s.name)?structuredClone(project.rooms.find(r=>r.name===s.name)):s);
 // Keep prior resources in the asset library without exporting unused alternatives.
 for(const asset of project.assets)if(retired.has(asset.name)&&!asset.id.startsWith(prefix)&&!project.rooms.some(r=>r.backgroundAssetName===asset.name)&&!project.actors.some(a=>a.spriteSheet===asset.name))asset.metadata={...asset.metadata,reusableLibraryAsset:true};
 return fitProjectSpriteFrames(project);
}
