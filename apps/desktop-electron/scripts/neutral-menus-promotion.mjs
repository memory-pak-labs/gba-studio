import { readFileSync } from 'node:fs';
import { fitProjectSpriteFrames } from './lib/sprite-canvas-audit.mjs';
const manifest = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/neutral-menu-manifest.json', import.meta.url)));
export const NEUTRAL_MENU_SCENES = Object.freeze(['carregar_jogo','configuracoes','creditos','missoes','inventario','mapa_menu','salvar','menu_start']);
const titles = {carregar_jogo:'CARREGAR JOGO',configuracoes:'AJUSTES',creditos:'CREDITOS',missoes:'MISSOES',inventario:'INVENTARIO',mapa_menu:'ROTAS DO FAROL',salvar:'SALVAR',menu_start:'PAUSA'};
const itemIcons = ['item-estrutura','item-aderencia','item-celula','item-blindagem','item-impulso','return'];
const mapIcons = ['marker-porto','marker-penedos','marker-armazem','marker-observatorio','marker-mercado','marker-usina','marker-conselho','marker-circuito','return'];
const details = {
  inventario:[['Estrutura','do farol','Porto'],['Modulo de','aderencia','Penedos'],['Energia do','farol','Usina'],['Protecao','do jogador','Tempestade'],['Modulo de','impulso','Arena'],['Retomar','o menu','anterior']],
  mapa_menu:[['Inicio','Porto','Lumen'],['Rota de','salto','Penedos'],['Carta','das','mares'],['Registro','do','farol'],['Atalho','para a','Usina'],['Celula','de','energia'],['Alianca','da','Guardia'],['Tres','voltas','final'],['Voltar','','']],
  missoes:[['Jornada','do farol',''],['Porto','Lumen',''],['Usina','Submersa',''],['Conselho','Guardia',''],['Circuito','Final',''],['Retomar','o menu','']]
};
function geometry(name,index) {
  if(name==='inventario') return {x:16+(index%3)*40,y:40+Math.floor(index/3)*40,width:32,height:32};
  if(name==='mapa_menu') {const positions=[[16,40],[64,40],[112,40],[112,72],[64,72],[16,72],[16,100],[64,100],[112,100]];return {x:positions[index][0],y:positions[index][1],width:32,height:32};}
  const rows=name==='menu_start'?6:name==='configuracoes'?5:name==='creditos'?2:4;
  const x=name==='menu_start'?88:name==='missoes'?8:16;
  const y=name==='creditos'?56:name==='salvar'||name==='carregar_jogo'?32:40;
  const pitch=name==='creditos'?24:name==='salvar'||name==='carregar_jogo'?32:name==='menu_start'||name==='configuracoes'?16:24;
  if((name==='salvar'||name==='carregar_jogo') && index===3) return {x:72,y:124,width:96,height:16};
  return {x,y:y+(index%rows)*pitch,width:name==='menu_start'?144:name==='missoes'?128:208,height:name==='salvar'||name==='carregar_jogo'?28:16};
}
function text(id,text,x,y,width=208) {return {id,kind:'text',label:text||' ',text:text||' ',pixelPosition:true,asset:'',x,y,width,height:8,zIndex:1,visible:true};}
export function promoteNeutralMenus(source) {
  const project=structuredClone(source), affected=new Set(NEUTRAL_MENU_SCENES);
  project.assets=project.assets.filter(a=>!a.id.startsWith('neutral-'));
  project.animations=project.animations.filter(a=>!a.id.startsWith('neutral-'));
  project.animationStates=project.animationStates.filter(a=>!a.id.startsWith('neutral-'));
  project.actors=project.actors.filter(a=>!affected.has(a.roomName));
  for(const asset of project.assets)if(['menu-inicial-v3-gba.png','gender-player-male-32x64.png','gender-player-female-32x64.png','menu-inicial-cursor.png','menu-project.png','menu-engine.png'].includes(asset.name))asset.metadata={...asset.metadata,reusableLibraryAsset:true};
  for(const [id,sprite] of Object.entries(manifest.sprites)) {
    const key=`neutral-${id}`;
    project.assets.push({id:key,name:sprite.file,kind:'Sprite',metadata:{source:`Assets/sprites/${sprite.file}`,frameWidth:sprite.width,frameHeight:sprite.height,frameCount:1,colorMode:'4bpp',sourceContract:'gba-native',visibleColors:sprite.visibleColors,transparentIndex:0,generatedBy:'approved-neutral-menus-v3',reviewStatus:'approved',preparedSha256:sprite.sha256}});
    project.animations.push({id:`${key}-animation`,name:key,spriteSheet:sprite.file,frameWidth:sprite.width,frameHeight:sprite.height,frameCount:1,fps:6,loops:true,state:'idle',direction:'none',colorMode:'4bpp',sourceColorMode:'4bpp',originX:0,originY:0,hitboxX:0,hitboxY:0,hitboxWidth:sprite.width,hitboxHeight:sprite.height,frames:[{id:`${key}-frame`,width:sprite.width,height:sprite.height,originX:0,originY:0,sourceFrameIndex:0,tiles:[{id:`${key}-tile`,x:0,y:0,sliceX:0,sliceY:0,sourceSheet:sprite.file,tileWidth:sprite.width,tileHeight:sprite.height,flipX:false,flipY:false,objPalette:'OBP0',paletteIndex:0,priority:false}]}]});
    project.animationStates.push({id:`${key}-state`,name:'default',spriteSheet:sprite.file,animationType:'fixed',mirrorLeftFromRight:false,animationIDs:[`${key}-animation`]});
  }
  project.assets.push({id:'neutral-font',name:'neutral-menu-font-gba.png',kind:'FONT',metadata:{source:'Assets/fonts/neutral-menu-font-gba.png',width:128,height:112,colorMode:'4bpp',generatedBy:'approved-neutral-menus-v3',reviewStatus:'approved'}});
  const actor=(scene,suffix,icon,x,y,role='decorative',extra={})=>{
    const sprite=manifest.sprites[icon];
    project.actors.push({id:`neutral-${scene}-${suffix}`,name:suffix,roomName:scene,x:Math.floor(x/8),y:Math.floor(y/8),menuPositionPixels:{x,y},spriteSheet:sprite.file,animationName:`neutral-${icon}`,animationStateID:`neutral-${icon}-state`,menuActorRole:role,...extra});
  };
  const presets=[];
  for(const name of NEUTRAL_MENU_SCENES) {
    const room=project.rooms.find(r=>r.name===name);if(!room)throw new Error(`Menu ausente: ${name}`);
    const rows=name==='inventario'||name==='mapa_menu'?0:name==='menu_start'?6:name==='configuracoes'?5:name==='creditos'?2:4;
    const items=room.runtime.config.items.map((item,i)=>({...item,clickBox:geometry(name,i),...(details[name]?{detailLines:details[name][i]}:{}),...(name==='inventario'&&i===2?{label:'Celula'}:{}),...(name==='creditos'?{label:['Projeto GBA Studio','Engine GBA Studio'][i]}:{}),...(name==='missoes'?{label:['Objetivo','Estrut.','Celula','Alianca','Farol','Voltar'][i]}:{})}));
    const config={...room.runtime.config,title:'',items,hudPresetId:`hud-neutral-${name}`,presentationMode:'hud',hudTextColor:3171,hudTransparentText:true};
    delete config.screens;delete config.hudMode;delete config.hudListRows;delete config.carousel;delete config.titleTextVariableName;
    if(name==='menu_start')config.titleTextVariableName='var_character_name';
    if(rows)config.hudListRows=rows;
    room.backgroundAssetName=`neutral-${name}-gba.png`;room.backgroundRenderMode='tilemap';room.hudPresetId=config.hudPresetId;room.runtime={...room.runtime,config};
    const bg=manifest.backgrounds[name];
    project.assets.push({id:`neutral-background-${name}`,kind:'Background',name:bg.file,metadata:{source:`Assets/backgrounds/${bg.file}`,generatedBy:'approved-neutral-menus-v3',width:240,height:160,colorMode:'4bpp',backgroundPaletteBankBudget:12,backgroundPaletteReferencePlan:{banks:bg.report.banks,tile_palette_banks:bg.report.tile_palette_banks},backgroundTileOptimizer:{enabled:true,tileBudget:896},reviewStatus:'approved',visualStatus:'approved',candidateStatus:'canonical-integrated',preparedSha256:bg.sha256,titleBakedIntoBackground:true,fixedTitle:bg.title,titleLanguage:'pt-BR',assetcStatus:'attention'}});
    // Preserve the eight positional runtime slots without drawing a second title.
    // The runtime centers the name in this eight-cell field, preserving eight-character names.
    const components=[name==='menu_start'
      ? {...text(`${name}-player-name`,'  Nara',16,116,64),label:'Nome do jogador'}
      : {...text(`${name}-runtime-slot-0`,' ',0,0,8),label:'Slot reservado'}];
    if(rows) {
      for(let i=0;i<rows;i++) {const box=geometry(name,i);const tx=name==='missoes'?32:name==='menu_start'?112:(name==='salvar'||name==='carregar_jogo')&&i===3?96:56;const ty=(name==='salvar'||name==='carregar_jogo')&&i===3?128:box.y+(['menu_start','configuracoes','missoes'].includes(name)?4:8);components.push(text(`${name}-row-${i}`,items[i]?.label??' ',tx,ty,box.x+box.width-tx-8));}
      components.push(text(`${name}-footer`,'D MOVER A OK B VOLTAR',36,name==='mapa_menu'?146:144,168));
      while(components.length<8) {const n=components.length-rows-2;components.push(text(`${name}-detail-${n}`,details[name]?.[0]?.[n]??' ',152,96+n*16,72));}
    } else {
      components.push(text(`${name}-sub`,' ',16,32,208),text(`${name}-selected`,items[0].label,16,name==='inventario'?120:138,name==='inventario'?120:208));
      for(let i=0;i<3;i++)components.push(text(`${name}-detail-${i}`,details[name][0][i],name==='inventario'?142:166,name==='inventario'?96+i*8:64+i*16,name==='inventario'?72:56));
      components.push(text(`${name}-status`,' ',name==='inventario'?142:166,name==='inventario'?120:112,name==='inventario'?72:56),text(`${name}-footer`,'D MOVER A OK B VOLTAR',36,name==='mapa_menu'?146:144,168));
    }
    components.forEach((component,i)=>{ if(rows ? i<rows+2 || Boolean(details[name]) : i>=2) component.runtimeText=true; });
    presets.push({id:config.hudPresetId,name:titles[name],description:'Composição neutra aprovada, atores e dados da partida separados do fundo.',backgroundImage:'',selectorImage:'',font:'neutral-menu-font-gba.png',textColor:3171,position:'Superior',width:240,height:160,mode:'advanced',components});
    const icons=name==='inventario'?itemIcons:name==='mapa_menu'?mapIcons:name==='menu_start'?['mission','bag','map','save','gear','return']:name==='missoes'?['mission','item-estrutura','item-celula','marker-conselho','marker-circuito','return']:name==='configuracoes'?['gear','mission','gear','gear','gear','gear','gear','return']:name==='creditos'?['mission','gear']:['portrait-small-male','portrait-small-male','portrait-small-male','return'];
    for(const [i,item] of items.entries()) {
      const box=item.clickBox;const icon=rows&&!icons[i].startsWith('portrait-small-')?`compact-${icons[i]}`:icons[i];let x=box.x,y=box.y;
      if(rows)x=box.x+8;
      if(icon.startsWith('portrait-small-'))y+=2;
      actor(name,`option-${item.id}`,icon,x,y,'option',{menuItemID:item.id});
      if(name==='inventario'&&i<5) actor(name,`detail-${item.id}`,`detail-${icon}`,148,40,'option',{menuItemID:item.id,menuActorSelectedOnly:true});
      if(name==='missoes') actor(name,`detail-${item.id}`,icon,168,48,'option',{menuItemID:item.id,menuActorSelectedOnly:true});
    }
    if(name==='menu_start') for(const gender of ['male','female']) actor(name,`portrait-${gender}`,`portrait-${gender}`,16,44,'decorative',{menuVisibilityVariable:'var_character_gender',menuVisibilityValue:gender==='male'?0:1});
    const first=project.actors.find(a=>a.roomName===name&&a.menuActorRole==='option');
    actor(name,'cursor',rows?'arrow-right':'selection-frame',first.menuPositionPixels.x,first.menuPositionPixels.y,'cursor',{cursorForMenu:name,menuCursorFollowsOption:true,menuCursorOffsetPixels:rows?{x:-12,y:0}:{x:0,y:0}});
  }
  project.scenas=project.scenas.map(scene=>affected.has(scene.name)?structuredClone(project.rooms.find(r=>r.name===scene.name)):scene);
  project.settings.hudPresets=project.settings.hudPresets.filter(p=>!p.id.startsWith('hud-neutral-')&&!NEUTRAL_MENU_SCENES.some(n=>p.id===`hud-ingame-${n}`)).concat(presets);
  for(const asset of project.assets)if(asset.id.startsWith('neutral-')&&asset.kind==='Sprite')asset.metadata.reusableLibraryAsset=!project.actors.some(actor=>actor.spriteSheet===asset.name);
  return fitProjectSpriteFrames(project);
}
