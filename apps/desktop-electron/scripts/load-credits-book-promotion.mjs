import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/load-credits-book-manifest.json',import.meta.url)));
const scenes=new Set(['carregar_jogo','creditos']);
const labels={carregar_jogo:['1 AUTO','2','3','VOLTAR'],creditos:['Projeto GBA Studio','Engine GBA Studio']};
const ys={carregar_jogo:[38,61,85,103],creditos:[48,84]};

function preset(name,items){
 const components=Array.from({length:8},(_,i)=>({id:`book-entry-${name}-slot-${i}`,kind:'text',label:`Runtime slot ${i}`,text:' ',pixelPosition:true,asset:'',x:0,y:0,width:8,height:8,zIndex:1,visible:true,runtimeText:false}));
 const field=(slot,text,x,y,width,runtimeText=false)=>Object.assign(components[slot],{text,x,y,width,runtimeText});
 for(const [i,item] of items.entries())field(i+1,item.label+(item.saveSlot!==undefined?' LIVRE':''),name==='creditos'?48:i===3?42:30,ys[name][i],name==='creditos'?168:i===3?64:96,true);
 if(name==='carregar_jogo'){
  field(6,'CARREGAR',147,96,80,true);field(7,'SLOT 1',147,108,80,true);
 }else{
  field(3,'OBRIGADO POR JOGAR',52,110,144);
  field(4,'O ÚLTIMO FAROL',48,60,168);
  field(5,'GBAStudioEngine',48,96,168);
 }
 return {id:`hud-book-${name}`,name:name==='creditos'?'CRÉDITOS':'CARREGAR',description:'Livro aprovado; conteúdo e seleção separados do fundo. Slots consultam os saves reais.',backgroundImage:'',selectorImage:'',font:'porto-hud-b-font.png',textColor:6306,position:'Superior',width:240,height:160,mode:'advanced',components};
}

/** Promote approved pixels and presentation while retaining save and dialogue actions. */
export function promoteApprovedLoadCredits(source){
 const project=structuredClone(source),ids=new Set(manifest.assets.map(a=>a.id));
 project.assets=project.assets.filter(a=>!ids.has(a.id));
 for(const entry of manifest.assets){
  if(!entry.approved)throw new Error(`Load/credits asset requires approval: ${entry.id}`);
  const beforePlatformer=project.assets.findIndex(a=>a.id.startsWith('penedos-v7-'));
  project.assets.splice(beforePlatformer<0?project.assets.length:beforePlatformer,0,{id:entry.id,kind:'Background',name:entry.file,metadata:{
   source:entry.source,width:240,height:160,colorMode:'4bpp',license:manifest.license,
   generatedBy:'approved-load-credits-book-v1',reviewStatus:'approved',visualStatus:'approved',assetcReviewed:true,
   sourceSha256:entry.sourceSha256,preparedSha256:entry.sha256,provenance:entry.preparation,
   backgroundPaletteBankBudget:14,paletteBankCount:14,backgroundPaletteReferencePlan:entry.palettePlan,
   backgroundTileOptimizer:{enabled:true,tileBudget:600,maxSourcePixelErrorRatio:0,maxFramebufferMismatchRatio:0},
   assetcStatus:'attention',palettePreparationVisuallyApproved:true,titleBakedIntoBackground:true,titleLanguage:'pt-BR',fixedTitle:entry.scene==='creditos'?'CRÉDITOS':'CARREGAR'
  }});
 }
 project.actors=project.actors.filter(a=>!scenes.has(a.roomName));
 const presets=[];
 for(const name of scenes){
  const room=project.rooms.find(r=>r.name===name);if(!room)throw new Error(`Menu missing: ${name}`);
  const config=room.runtime.config;
  config.items=config.items.map((item,i)=>({...item,label:labels[name][i],clickBox:{x:name==='creditos'?30:16,y:ys[name][i]-2,width:name==='creditos'?188:112,height:12},
   ...(name==='carregar_jogo'?{detailLines:i===3?['MENU','INICIAL']:['CARREGAR',`SLOT ${i+1}`]}:{})}));
  Object.assign(config,{title:'',titleOverlayAssetName:'',presentationMode:'hud',hudPresetId:`hud-book-${name}`,hudTextColor:6306,hudTransparentText:true,hudListRows:name==='creditos'?2:4});
  room.backgroundAssetName=manifest.assets.find(a=>a.scene===name).file;room.backgroundRenderMode='tilemap';room.hudPresetId=config.hudPresetId;
  presets.push(preset(name,config.items));
  for(const [i,item] of config.items.entries()){
   const x=name==='creditos'?32:16,y=ys[name][i];
   project.actors.push({id:`book-entry-${name}-selection-${item.id}`,name:`Selection ${item.id}`,roomName:name,x:Math.floor(x/8),y:Math.floor(y/8),menuPositionPixels:{x,y},spriteSheet:'book-cursor-approved-8x8.png',animationName:'book-menu-book-cursor',menuActorRole:'option',menuItemID:item.id,menuActorSelectedOnly:true});
  }
  const old=project.assets.find(a=>a.name===`neutral-${name}-gba.png`);if(old)old.metadata={...old.metadata,reusableLibraryAsset:true};
 }
 project.settings.hudPresets=project.settings.hudPresets.filter(h=>!Array.from(scenes).some(n=>h.id===`hud-book-${n}`||h.id===`hud-neutral-${n}`)).concat(presets);
 const oldFont=project.assets.find(a=>a.name==='neutral-menu-font-gba.png');
 if(oldFont&&!project.settings.hudPresets.some(h=>h.font===oldFont.name))oldFont.metadata={...oldFont.metadata,reusableLibraryAsset:true};
 for(const retained of manifest.retainedAssets){
  const old=project.assets.find(a=>a.metadata?.source===retained.file);
  if(old&&!project.actors.some(a=>a.spriteSheet===old.name)&&!project.settings.hudPresets.some(h=>h.font===old.name||h.backgroundImage===old.name||h.selectorImage===old.name))old.metadata={...old.metadata,reusableLibraryAsset:true};
 }
 project.scenas=project.scenas.map(r=>scenes.has(r.name)?structuredClone(project.rooms.find(room=>room.name===r.name)):r);
 return project;
}
