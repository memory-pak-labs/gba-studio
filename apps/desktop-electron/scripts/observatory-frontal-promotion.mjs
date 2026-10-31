import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/observatory-frontal-manifest.json',import.meta.url)));
const handManifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/warehouse-white-hand-manifest.json',import.meta.url)));

/** Apply the approved presentation without changing investigation or campaign events. */
export function promoteApprovedFrontalObservatory(source) {
  if (!manifest.approval.approved || !manifest.approval.visual || !manifest.approval.palette) {
    throw new Error('Frontal observatory requires explicit visual and palette approval.');
  }
  const project=structuredClone(source),entry=manifest.asset,name=manifest.scene;
  const room=project.rooms.find(r=>r.name===name);
  if (!room) throw new Error(`Observatory scene missing: ${name}`);
  const metadata={
    source:entry.source,width:240,height:160,colorMode:'4bpp',license:manifest.license,
    generatedBy:'approved-observatory-frontal-v1',role:'point-click-background',sceneRoles:[name],
    reviewStatus:'approved',visualStatus:'approved',assetcReviewed:true,assetcStatus:'attention',
    visualApproval:{date:manifest.approval.date,contract:'observatory-frontal-v1-approved'},
    sourceSha256:entry.sourceSha256,preparedSha256:entry.sha256,runtimeSourceSha256:entry.sha256,
    provenance:entry.preparation,palettePreparationVisuallyApproved:true,
    backgroundPaletteBankBudget:14,paletteBankCount:14,backgroundPaletteReferencePlan:entry.palettePlan,
    backgroundTileOptimizer:{enabled:true,tileBudget:600,maxSourcePixelErrorRatio:0,maxFramebufferMismatchRatio:0}
  };
  project.assets=project.assets.filter(a=>a.id!==entry.id);
  const old=project.assets.find(a=>a.name===manifest.retainedAsset);
  if (old) old.metadata={...old.metadata,reusableLibraryAsset:true};
  const oldIndex=project.assets.findIndex(a=>a.name===manifest.retainedAsset);
  project.assets.splice(oldIndex<0?project.assets.length:oldIndex+1,0,{id:entry.id,name:entry.file,kind:'Background',systemImage:'photo',metadata});
  for (const key of ['rooms','scenas']) project[key]=project[key].map(r=>r.name===name?{
    ...r,backgroundAssetName:entry.file,backgroundRenderMode:'tilemap',gbStudioUseBackgroundLayout:true,
    runtime:{...r.runtime,config:{...r.runtime.config,profile:'observatory-frontal-v1-approved'}}
  }:r);
  const retired=new Set(manifest.retiredActorIds);
  project.actors=project.actors.filter(a=>!retired.has(a.id)).map(a=>a.id===`${name}-cursor`?{...a,...manifest.cursorStart}:a);
  project.triggers=project.triggers.map(t=>{
    const area=manifest.hotspots.find(h=>t.id===`${name}-${h.id}-trigger`);
    return area?{...t,x:area.x,y:area.y,width:area.width,height:area.height}:t;
  });
  const hand=handManifest.asset;
  if (!handManifest.approval.approved || !handManifest.approval.visual || !handManifest.approval.palette) {
    throw new Error('White hand requires explicit visual and palette approval.');
  }
  const cursorAsset=project.assets.find(a=>a.id===hand.id);
  if (!cursorAsset) throw new Error('Approved white hand asset missing. Promote Warehouse first.');
  cursorAsset.metadata={...cursorAsset.metadata,sceneRoles:[...new Set([...(cursorAsset.metadata.sceneRoles??[]),name])]};
  project.actors=project.actors.map(a=>a.id===`${name}-cursor`?{...a,spriteSheet:hand.file}:a);
  const retiredSheets=new Set(source.actors.filter(a=>retired.has(a.id)).map(a=>a.spriteSheet));
  for (const asset of project.assets) {
    if ((retiredSheets.has(asset.name) || asset.name==='point-click-cursor.png') && !project.actors.some(a=>a.spriteSheet===asset.name)) {
      asset.metadata={...asset.metadata,reusableLibraryAsset:true};
    }
  }
  project.animationStates=project.animationStates.map(s=>s.id===`${name}-cursor-state`?{...s,spriteSheet:hand.file}:s);
  project.animations=project.animations.map(animation=>{
    if (![`${name}-cursor-idle`,`${name}-cursor-hover`].includes(animation.id)) return animation;
    return {...animation,spriteSheet:hand.file,frameWidth:32,frameHeight:32,fps:1,loops:false,frameCount:1,
      originX:hand.originX,originY:hand.originY,originSpace:'animator',hitboxX:0,hitboxY:0,hitboxWidth:1,hitboxHeight:1,
      frames:[{id:`${animation.id}-frame-0`,frameIndex:0,sourceFrameIndex:0,width:32,height:32,
        originX:hand.originX,originY:hand.originY,
        tiles:[{id:`${animation.id}-frame-0-tile-0`,x:-8,y:0,sliceX:0,sliceY:0,sourceSheet:hand.file,
          tileWidth:32,tileHeight:32,flipX:false,flipY:false,objPalette:'OBP0',paletteIndex:0,priority:false}]}]};
  });
  return project;
}
