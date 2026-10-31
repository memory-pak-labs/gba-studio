import { readFileSync } from 'node:fs';
import { fitProjectSpriteFrames } from './lib/sprite-canvas-audit.mjs';

const manifest = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/book-menu-manifest.json', import.meta.url)));
export const BOOK_MENU_SCENES = Object.freeze(['menu_start', 'missoes', 'inventario', 'mapa_menu', 'salvar', 'configuracoes']);
const affected = new Set(BOOK_MENU_SCENES);
const titles = {menu_start:'PAUSA',missoes:'MISSÕES',inventario:'INVENTÁRIO',mapa_menu:'MAPA',salvar:'SALVAR',configuracoes:'AJUSTES'};
const labels = {
  menu_start:['MISSÕES','INVENTÁRIO','MAPA','SALVAR','AJUSTES','RETOMAR'],
  missoes:['OBJETIVO','ESTRUT.','CÉLULA','ALIANÇA','FAROL','VOLTAR'],
  inventario:['ESTRUTURA DO FAROL','ADERÊNCIA','CÉLULA DE ENERGIA','BLINDAGEM','IMPULSO','VOLTAR'],
  mapa_menu:['PORTO','PENEDOS','ARMAZÉM','OBSERVAT.','MERCADO','USINA','CONSELHO','CIRCUITO','VOLTAR'],
  salvar:['1 AUTO','2','3','VOLTAR'],
  configuracoes:['VOLUME GERAL','MÚSICA','EFEITOS','SOM LIGADO','IDIOMA','CONTROLES','RELÓGIO RTC','VOLTAR']
};
const details = {
  missoes:[['JORNADA','DO FAROL'],['PORTO','LUMEN'],['USINA','SUBMERSA'],['CONSELHO','GUARDIÃ'],['CIRCUITO','FINAL'],['RETOMAR','O MENU']],
  mapa_menu:[['INÍCIO','PORTO','LUMEN'],['ROTA DE','SALTO','PENEDOS'],['CARTA','DAS','MARÉS'],['REGISTRO','DO','FAROL'],['ATALHO','PARA A','USINA'],['CÉLULA','DE','ENERGIA'],['ALIANÇA','DA','GUARDIÃ'],['TRÊS','VOLTAS','FINAL'],['RETOMAR','O MENU','']],
  salvar:[['GRAVAR','SLOT 1'],['GRAVAR','SLOT 2'],['GRAVAR','SLOT 3'],['RETOMAR','O MENU']]
};
const rowsByScene = {menu_start:6,missoes:4,inventario:0,mapa_menu:0,salvar:4,configuracoes:5};
const ysByScene = {menu_start:[32,46,60,75,89,103],missoes:[32,48,64,80],salvar:[38,61,85,103],configuracoes:[36,52,70,87,104]};
const nodes = [[47,41],[94,41],[94,63],[47,63],[47,85],[94,85],[94,107],[47,107]];
const sprite = key => manifest.assets[key];

function animation(id, file, width, height, bpp, sourceFrameIndex = 0) {
  return {id, name:id, spriteSheet:file,frameWidth:width,frameHeight:height,frameCount:1,fps:6,loops:true,state:'idle',direction:'none',colorMode:`${bpp}bpp`,sourceColorMode:`${bpp}bpp`,originSpace:'animator',originX:0,originY:8-height,hitboxX:0,hitboxY:0,hitboxWidth:width,hitboxHeight:height,
    frames:[{id:`${id}-frame`,width,height,originX:0,originY:8-height,sourceFrameIndex,tiles:[{id:`${id}-tile`,x:0,y:0,sliceX:sourceFrameIndex*width,sliceY:0,sourceSheet:file,tileWidth:width,tileHeight:height,flipX:false,flipY:false,objPalette:'OBP0',paletteIndex:0,priority:false}]}]};
}

function selectionPosition(name, index) {
  if(name==='inventario') return index<5 ? [20+40*index,48] : [48,132];
  if(name==='mapa_menu') return index<8 ? [nodes[index][0]-14,nodes[index][1]-4] : [62,139];
  return [name==='menu_start'?22:name==='configuracoes'?24:16,ysByScene[name][index%rowsByScene[name]]];
}

function clickBox(name, index) {
  if(name==='inventario') return index<5?{x:20+40*index,y:48,width:40,height:48}:{x:48,y:128,width:144,height:16};
  if(name==='mapa_menu') return index<8?{x:nodes[index][0]-10,y:nodes[index][1]-8,width:24,height:16}:{x:60,y:136,width:72,height:16};
  const x=name==='menu_start'?20:name==='configuracoes'?24:16;
  return {x,y:selectionPosition(name,index)[1]-2,width:name==='configuracoes'?200:112,height:12};
}

function hud(name, items, project) {
  const components=Array.from({length:8},(_,i)=>({id:`book-${name}-slot-${i}`,kind:'text',label:`Runtime slot ${i}`,text:' ',pixelPosition:true,asset:'',x:0,y:0,width:8,height:8,zIndex:1,visible:true}));
  const field=(slot,text,x,y,width,runtimeText=true)=>Object.assign(components[slot],{text:text||' ',x,y,width,visible:true,runtimeText});
  if(name==='menu_start')field(0,'  Nara',150,90,64);
  const rows=rowsByScene[name];
  const initialLabel=item=>{
    if(!item)return ' ';
    let value=item.label;
    const initial=index=>Number(project.variables?.[index]?.initialValue)||0;
    if(item.action==='adjust_variable')value+=` ${item.valueLabels?.[initial(item.variableIndex)]??initial(item.variableIndex)}${item.audioChannel?'%':''}`;
    if(item.action==='toggle_variable')value+=initial(item.variableIndex)===item.checkedValue?' ON':' OFF';
    if(item.saveSlot!==undefined)value+=' LIVRE';
    if(item.binding?.format==='on_off')value+=initial(item.binding.index)?' OK':' NÃO';
    return value;
  };
  if(rows) {
    for(let i=0;i<rows;i++)field(i+1,initialLabel(items[i]),name==='menu_start'||name==='missoes'?37:name==='configuracoes'?39:i===3?42:30,ysByScene[name][i],name==='configuracoes'?176:name==='salvar'?96:88);
    if(name==='missoes'){field(6,details[name][0][0],147,94,80);field(7,details[name][0][1],147,106,80);}
    if(name==='salvar')for(let i=0;i<3;i++)field(5+i,details[name][0][i],147,95+i*11,80);
  } else if(name==='inventario') {
    field(2,items[0].label,20,112,184);
  } else {
    field(0,'VOLTAR',74,139,48,false);
    field(2,items[0].label,146,82,80);
    for(let i=0;i<3;i++)field(3+i,details[name][0][i],146,92+i*10,80);
    field(6,Number(project.variables?.[items[0].binding?.index]?.initialValue)?'OK':'NÃO',147,132,80);
  }
  return {id:`hud-book-${name}`,name:titles[name],description:'Menus aprovados: livro de viagem e inventário na mala; dados da partida em camadas independentes.',backgroundImage:'',selectorImage:'',font:'porto-hud-b-font.png',textColor:6306,position:'Superior',width:240,height:160,mode:'advanced',components};
}

/** Promote approved native pixels, preserving the gameplay and menu action contracts. */
export function promoteApprovedBookMenus(source) {
  const project=structuredClone(source);
  project.assets=project.assets.filter(a=>!a.id.startsWith('book-menu-'));
  project.animations=project.animations.filter(a=>!a.id.startsWith('book-menu-')&&!a.id.startsWith('book-page-'));
  project.animationStates=project.animationStates.filter(a=>!a.id.startsWith('book-menu-')&&!a.id.startsWith('book-page-'));
  project.actors=project.actors.filter(a=>!affected.has(a.roomName));
  for(const entry of Object.values(manifest.assets)) {
    const id=`book-menu-${entry.id}`;
    const metadata={source:entry.source,license:entry.license,generatedBy:'approved-book-menus-v5-toolcase-v3',reviewStatus:'approved',visualStatus:'approved',preparedSha256:entry.sha256,sourceSha256:entry.sha256,provenance:entry.preparedBy,width:entry.width,height:entry.height};
    if(entry.kind==='bg')Object.assign(metadata,{colorMode:'4bpp',backgroundPaletteBankBudget:14,backgroundPaletteReferencePlan:entry.palettePlan,backgroundTileOptimizer:{enabled:true,tileBudget:895},titleBakedIntoBackground:true,titleLanguage:'pt-BR',assetcStatus:'attention',palettePreparationVisuallyApproved:true});
    else Object.assign(metadata,{frameWidth:entry.width,frameHeight:entry.height,frameCount:entry.frames,colorMode:`${entry.bpp}bpp`});
    const beforePlatformer=project.assets.findIndex(asset=>asset.id.startsWith('penedos-v7-'));
    project.assets.splice(beforePlatformer<0?project.assets.length:beforePlatformer,0,{id,name:entry.file,kind:entry.kind==='bg'?'Background':'Sprite',metadata});
    if(entry.kind!=='bg') {
      if(entry.id==='book-pages')for(let frame=0;frame<2;frame++)project.animations.push(animation(`book-page-${frame}`,entry.file,entry.width,entry.height,entry.bpp,frame));
      else project.animations.push(animation(id,entry.file,entry.width,entry.height,entry.bpp));
    }
  }
  const actor=(scene,suffix,key,x,y,extra={})=>{
    const entry=sprite(key);
    project.actors.push({id:`book-menu-${scene}-${suffix}`,name:suffix,roomName:scene,x:Math.floor(x/8),y:Math.floor(y/8),menuPositionPixels:{x,y},spriteSheet:entry.file,animationName:`book-menu-${entry.id}`,menuActorRole:'decorative',...extra});
  };
  const presets=[];
  for(const name of BOOK_MENU_SCENES) {
    const room=project.rooms.find(r=>r.name===name);
    if(!room)throw new Error(`Menu ausente: ${name}`);
    const config=room.runtime.config;
    config.items=config.items.map((item,i)=>({...item,label:labels[name][i],clickBox:clickBox(name,i),...(details[name]?{detailLines:details[name][i]}:{}),...(name==='configuracoes'&&item.id==='language'?{valueLabels:['PORTUGUÊS','ENGLISH','ESPAÑOL']}:{})}));
    Object.assign(config,{title:'',titleOverlayAssetName:'',presentationMode:'hud',hudPresetId:`hud-book-${name}`,hudTextColor:6306,hudTransparentText:true});
    delete config.hudListRows;
    if(rowsByScene[name])config.hudListRows=rowsByScene[name];
    if(name==='salvar')config.hudFeedbackInDetails=true;
    room.backgroundAssetName=sprite(name==='inventario'?'toolcase-toolcase_bg':`book-${name}_bg`).file;
    room.backgroundRenderMode='tilemap';room.hudPresetId=config.hudPresetId;
    project.assets.find(asset=>asset.name===room.backgroundAssetName).metadata.fixedTitle=titles[name];
    presets.push(hud(name,config.items,project));
    if(name==='menu_start') {
      actor(name,'Nara','book-nara',164,29,{menuVisibilityVariable:'var_character_gender',menuVisibilityValue:0});
      actor(name,'Player female variant','book-female',156,29,{menuVisibilityVariable:'var_character_gender',menuVisibilityValue:1});
    }
    for(const [i,item] of config.items.entries()) {
      const [x,y]=selectionPosition(name,i);
      const cursor=name==='inventario'&&i<5?'toolcase-selection':'book-cursor';
      actor(name,`Selection ${item.id}`,cursor,x,y,{menuActorRole:'option',menuItemID:item.id,menuActorSelectedOnly:true});
      if(name==='missoes'||name==='configuracoes')actor(name,`Page ${item.id}`,'book-pages',name==='missoes'?100:104,name==='missoes'?137:138,{animationName:`book-page-${Math.floor(i/rowsByScene[name])}`,menuActorRole:'option',menuItemID:item.id,menuActorSelectedOnly:true});
    }
    // Lower OAM indices win ties: focus ticks must be in front of opaque panels.
    if(name==='inventario') {
      for(const [i,key] of ['frame','grip','cell','shield','boost'].entries())actor(name,`Item ${key}`,`toolcase-${key}`,20+40*i,48);
      actor(name,'Compact commands','toolcase-commands',56,132);
    }
  }
  project.settings.hudPresets=project.settings.hudPresets.filter(p=>!BOOK_MENU_SCENES.some(n=>p.id===`hud-book-${n}`||p.id===`hud-neutral-${n}`)).concat(presets);
  project.scenas=project.scenas.map(scene=>affected.has(scene.name)?structuredClone(project.rooms.find(r=>r.name===scene.name)):scene);
  // Retain old approved art in the library without exporting unused resources.
  for(const asset of project.assets)if(asset.id.startsWith('neutral-')&&asset.kind==='Sprite')asset.metadata.reusableLibraryAsset=!project.actors.some(actor=>actor.spriteSheet===asset.name);
  for(const name of BOOK_MENU_SCENES) {
    const old=project.assets.find(asset=>asset.name===`neutral-${name}-gba.png`);
    if(old)old.metadata.reusableLibraryAsset=true;
  }
  return fitProjectSpriteFrames(project);
}
