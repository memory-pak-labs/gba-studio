import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/prologue-clean-manifest.json',import.meta.url)));

/** Integrate the approved prologue art, preserving the rest of the project. */
export function promoteApprovedCleanPrologue(source) {
  const project=structuredClone(source);
  const ids=new Set(manifest.assets.map(a=>a.id));
  const names=new Map(manifest.assets.map((a,i)=>[`prologue-frame-${i+1}-gba.png`,a.file]));
  project.assets=project.assets.filter(a=>!ids.has(a.id));
  for(const e of manifest.assets){
    if(!e.approved)throw new Error(`Prologue asset requires approval: ${e.id}`);
    const beforePlatformer=project.assets.findIndex(a=>a.id.startsWith('penedos-v7-'));
    project.assets.splice(beforePlatformer<0?project.assets.length:beforePlatformer,0,{id:e.id,kind:'Background',name:e.file,metadata:{
      source:e.source,width:e.width,height:e.height,colorMode:'4bpp',
      role:e.id.replace('-background',''),sceneRoles:['prologue-storyboard'],
      license:manifest.license,generatedBy:'approved-prologue-clean-v3',
      reviewStatus:'approved',visualStatus:'approved',assetcReviewed:true,
      preparedSha256:e.sha256,sourceSha256:e.sourceSha256,
      provenance:e.preparation,tileCount:e.tiles,paletteBankCount:14,
      backgroundPaletteBankBudget:14,backgroundPaletteReferencePlan:e.palettePlan,
      backgroundTileOptimizer:{enabled:true,tileBudget:600,maxSourcePixelErrorRatio:0,maxFramebufferMismatchRatio:0},
      assetcStatus:'attention',palettePreparationVisuallyApproved:true
    }});
  }
  for(const collection of ['rooms','scenas'])for(const room of project[collection]??[]){
    if(room.name!=='prologo')continue;
    if(names.has(room.backgroundAssetName)&&!room.referenceImages?.some(r=>r.assetName===room.backgroundAssetName)){
      room.referenceImages=[...(room.referenceImages??[]),{id:'prologue-clean-previous-background',assetName:room.backgroundAssetName,title:'Arte anterior preservada',visible:false}];
    }
    room.backgroundAssetName=manifest.assets[0].file;
    if(room.runtime?.config?.steps)room.runtime.config.steps=room.runtime.config.steps.map(step=>({...step,backgroundAssetName:names.get(step.backgroundAssetName)??step.backgroundAssetName}));
  }
  for(const asset of project.assets)if(names.has(asset.name))asset.metadata={...asset.metadata,reusableLibraryAsset:true};
  return project;
}
