import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/approved-menu-scenes-v21.json',import.meta.url),'utf8'));
const clone=value=>structuredClone(value);

/** Approved pause, toolcase pages and arrival. Reuses the existing game state. */
export function applyApprovedMenuScenes(source,promote=false) {
 if(!promote&&!source.assets.some(a=>a.name==='arrival-v21-background.png'))return source;
 const p=clone(source),find=name=>p.rooms.find(r=>r.name===name);
 // The rejected pause restart flow has no entry in the approved book or results.
 for(const key of ['rooms','scenas'])p[key]=p[key].filter(r=>r.name!=='corrida_confirmacao');
 p.events=p.events.filter(e=>e.roomName!=='corrida_confirmacao');
 if(p.editorState?.scenaConnections)p.editorState.scenaConnections=p.editorState.scenaConnections.filter(c=>c.from!=='corrida_confirmacao'&&c.to!=='corrida_confirmacao');
 for(const group of p.editorState?.sceneExplorer?.groups??[])group.sceneIDs=group.sceneIDs.filter(id=>id!=='scene-corrida_confirmacao');
 if(p.editorState?.sceneMapPositions)delete p.editorState.sceneMapPositions.corrida_confirmacao;
 const put=(rows,value,key='id')=>{const i=rows.findIndex(v=>v[key]===value[key]);if(i<0)rows.push(value);else rows[i]=value;};
 const edit=(name,fn)=>{for(const k of ['rooms','scenas']){const i=p[k].findIndex(r=>r.name===name);if(i>=0)p[k][i]=fn(clone(p[k][i]));}if(p.scena?.name===name)p.scena=fn(clone(p.scena));};
 const event=(name,roomName,commands)=>put(p.events,{id:name,name,roomName,category:roomName?'Exemplo · Menus aprovados':'Global',commands:commands.join('\n'),steps:commands.map((command,i)=>({id:`${name}-${i}`,command,isEnabled:true}))},'name');
 const bind=(source,index,format='number')=>({source,index,format});
 const condition=(source,index,value,negate=false)=>({binding:bind(source,index),value,...(negate?{negate:true}:{})});
 const itemKeys=[...new Set(p.events.flatMap(e=>(e.steps??[]).flatMap(s=>{const a=s.command.split(/\s+/);return ['add_item','has_item'].includes(a[0])?[a[1]]:a[0]==='set_equipped_item'&&a[2]!=='none'?[a[2]]:[]})))].sort();
 const toolIndex=itemKeys.indexOf('zzz_lumen_tool');
 const oldCommands=p.assets.find(a=>a.name==='toolcase-commands-128x8.png');if(oldCommands)oldCommands.metadata={...oldCommands.metadata,reusableLibraryAsset:true,retainSourceInLibrary:true};
 const variable=name=>p.variables.findIndex(v=>v.name===name);
 const anim=name=>'approved-menu-'+name.replace(/\.png$/,'');
 for(const asset of catalog.assets) {
  put(p.assets,clone(asset));
  if(asset.kind!=='Sprite')continue;
  const width=asset.metadata.width,height=asset.metadata.height,id=anim(asset.name),canvasX=Math.min(0,8-Math.floor(width/2));
  put(p.animations,{id,name:id,spriteSheet:asset.name,frameWidth:width,frameHeight:height,frameCount:1,fps:6,loops:false,state:'idle',direction:'none',colorMode:'4bpp',sourceColorMode:'4bpp',originSpace:'animator',originX:0,originY:0,hitboxX:0,hitboxY:0,hitboxWidth:width,hitboxHeight:height,frames:[{id:id+'-frame',width,height,originX:canvasX,originY:0,sourceFrameIndex:0,tiles:[{id:id+'-tile',x:canvasX,y:0,sliceX:0,sliceY:0,sourceSheet:asset.name,tileWidth:width,tileHeight:height,flipX:false,flipY:false,objPalette:'OBP0',paletteIndex:0,priority:false}]}]});
 }
 const addActor=(roomName,id,spriteSheet,x,y,extra={})=>put(p.actors,{id:'approved-menu-'+id,name:id,roomName,x:Math.floor(x/8),y:Math.floor(y/8),menuPositionPixels:{x,y},spriteSheet,animationName:anim(spriteSheet),menuActorRole:'decorative',...extra});
 const addImage=(roomName,id,file,x,y,extra={})=>{for(const [i,part]of catalog.parts[file].entries())addActor(roomName,id+'-'+i,part.file,x+part.x,y+part.y,extra);};
 const firstWin=[condition('context',0,0),condition('context',1,1),condition('variable',variable('var_campaign_finished'),0)];
 const otherResult=firstWin.map(c=>({...c,negate:true}));
 const owned=new Set(['inventario','inventario_ferramentas','corrida_resultados','corrida_confirmacao']);
 p.actors=p.actors.filter(a=>!owned.has(a.roomName)&&!a.id.startsWith('approved-menu-')&&!(a.roomName==='menu_start'&&['tools','controls','restart'].includes(a.menuItemID)));
 edit('menu_start',r=>{const c=r.runtime.config;c.items=c.items.filter(i=>!['tools','controls','restart'].includes(i.id));c.items.find(i=>i.id==='inventory').label='INVENTÁRIO';return r;});
 addImage('menu_start','pause-back','pause-v2-back.png',145,121);
 for(const [index,item]of find('menu_start').runtime.config.items.entries())addImage('menu_start','pause-page-'+item.id,`pause-v2-page-${index<6?1:2}.png`,196,140,{menuActorRole:'option',menuItemID:item.id,menuActorSelectedOnly:true});

 const blank=(id,index)=>({id:id+'-slot-'+index,kind:'text',label:'Runtime slot '+index,text:' ',pixelPosition:true,asset:'',x:0,y:0,width:8,height:8,zIndex:1,visible:true,textAdvance:6});
 function inventoryHud(id) {
  const components=Array.from({length:8},(_,i)=>blank(id,i));
  for(const [slot,y]of [[2,104],[3,116]])Object.assign(components[slot],{text:'',runtimeText:true,x:20,y,width:204});
  const hud={id,name:'Caixa de itens aprovada',description:'Fundo, itens e interface independentes; dados reais da partida.',backgroundImage:'',selectorImage:'',font:'porto-hud-b-font.png',textColor:6306,position:'Superior',width:240,height:160,mode:'advanced',components};
  put(p.settings.hudPresets,hud);return id;
 }
 const moduleConfig=clone(find('inventario').runtime.config);
 const originalModules=moduleConfig.items.filter(i=>['frame','grip','cell','shield','boost'].includes(i.id));
 const places=['OBTIDO NO PORTO','OBTIDA NOS PENEDOS','OBTIDA NA USINA','OBTIDA NO GUARDIÃO','USO NA CORRIDA: L'];
 for(const [i,item]of originalModules.entries()){item.valueLabels=['AINDA NÃO OBTIDO',places[i]];item.detailLines=[];item.clickBox={x:20+40*i,y:48,width:40,height:48};}
 const stabilizerSource=moduleConfig.items.find(i=>i.id==='stabilizer')??moduleConfig.screens?.find(s=>s.id==='inventario_modulos_2')?.items.find(i=>i.id==='stabilizer');
 const stabilizer={...clone(stabilizerSource),clickBox:{x:20,y:48,width:40,height:48},valueLabels:['AINDA NÃO OBTIDO','REDUZ O VENTO'],detailLines:[]};
 const common={...moduleConfig,title:'',items:originalModules,hudBindings:[{slot:3,selectedItem:true}],hudPresetId:inventoryHud('hud-toolcase-approved-modules'),pageNavigation:{previousScreenID:'inventario_ferramentas',nextScreenID:'inventario_modulos_2'}};
 delete common.hudListRows;
 delete common.screens;
 const second={...clone(common),id:'inventario_modulos_2',items:[stabilizer],hudPresetId:inventoryHud('hud-toolcase-approved-stabilizer'),pageNavigation:{previousScreenID:'inventario',nextScreenID:'inventario_ferramentas'},onEnterEventName:''};
 edit('inventario',r=>{r.hudPresetId=common.hudPresetId;r.runtime.config={...common,screens:[{...clone(common),id:'inventario',onEnterEventName:''},second]};return r;});
 const moduleAssets=['frame','grip','cell','shield','boost'];
 for(const [i,name]of moduleAssets.entries()) {
  const x=20+40*i;
  // Existing approved item animations retain their original placement contract.
  const old=source.actors.find(a=>a.roomName==='inventario'&&a.name==='Item '+name);
  if(old)put(p.actors,{...clone(old),menuScreenIDs:['inventario']});
  const selection=source.actors.find(a=>a.roomName==='inventario'&&a.menuItemID===name);
  if(selection)put(p.actors,{...clone(selection),menuScreenIDs:['inventario']});
 }
 const stabilizerActor=source.actors.find(a=>a.roomName==='inventario'&&a.spriteSheet==='tide-stabilizer-menu.png');
 if(stabilizerActor)put(p.actors,{...clone(stabilizerActor),x:2,y:7,menuPositionPixels:{x:24,y:56},menuScreenIDs:['inventario_modulos_2']});
 addActor('inventario','stabilizer-selection','toolcase-selection-40x48.png',20,48,{animationName:'book-menu-toolcase-selection',menuActorRole:'option',menuItemID:'stabilizer',menuActorSelectedOnly:true,menuScreenIDs:['inventario_modulos_2']});
 for(const [id,page]of [['inventario',0],['inventario_modulos_2',1]]) {
  addImage('inventario','page-label-'+page,`toolcase-v2-page-${page}.png`,24,39,{menuScreenIDs:[id]});
  addImage('inventario','page-footer-'+page,'toolcase-v2-view.png',24,132,{menuScreenIDs:[id]});
 }
 const tools=find('inventario_ferramentas').runtime.config.items.filter(i=>['tool','compass','chart','relay'].includes(i.id)).map((i,index)=>({...clone(i),label:['FERRAMENTA','BÚSSOLA','CARTA NÁUTICA','PEÇA DO RELÉ'][index],clickBox:{x:20+40*index,y:48,width:40,height:48},binding:{...i.binding,format:'number'},valueLabels:[['AINDA NÃO OBTIDA','REUTILIZÁVEL'],['AINDA NÃO OBTIDA','EFEITO PASSIVO'],['AINDA NÃO OBTIDA','MISSÃO: O SINAL PERDIDO'],['AINDA NÃO OBTIDA','INSTALAR NO FAROL']][index],detailLines:[]}));
 const toolHud=inventoryHud('hud-toolcase-approved-tools');
 const quantities=p.settings.hudPresets.find(h=>h.id===toolHud);
 for(const [i,item]of tools.entries())quantities.components.push({id:'tool-quantity-'+item.id,kind:'icon',label:'Quantidade '+item.id,text:'',asset:'toolcase-v2-mark-0.png',stateAssets:['toolcase-v2-mark-1.png','toolcase-v2-mark-2.png'],inventoryItem:item.binding.index,pixelPosition:true,x:50+i*40,y:82,width:8,height:8,zIndex:2,visible:true});
 edit('inventario_ferramentas',r=>{r.backgroundAssetName='toolcase-toolcase-bg-240x160.png';r.hudPresetId=toolHud;r.displayName='Inventário · Ferramentas';r.runtime.config={...common,role:'inventory',items:tools,hudPresetId:toolHud,pageNavigation:{previousScreenID:'inventario_modulos_2',nextScreenID:'inventario'}};return r;});
 for(const [i,item]of tools.entries()) {
  const x=20+40*i;
  addImage('inventario_ferramentas','item-'+item.id,'toolcase-v2-'+item.id+'.png',x,48);
  addActor('inventario_ferramentas','select-'+item.id,'toolcase-selection-40x48.png',x,48,{animationName:'book-menu-toolcase-selection',menuActorRole:'option',menuItemID:item.id,menuActorSelectedOnly:true});
  if(i) addImage('inventario_ferramentas','footer-'+item.id,'toolcase-v2-view.png',24,132,{menuActorRole:'option',menuItemID:item.id,menuActorSelectedOnly:true});
 }
 addImage('inventario_ferramentas','equipped-marker','toolcase-v2-mark-e.png',22,82,{menuVisibilityConditions:[condition('equipped',0,toolIndex)]});
 addImage('inventario_ferramentas','footer-equip','toolcase-v2-equip.png',24,132,{menuActorRole:'option',menuItemID:'tool',menuActorSelectedOnly:true,menuVisibilityConditions:[condition('equipped',0,toolIndex,true)]});
 addImage('inventario_ferramentas','footer-remove','toolcase-v2-remove.png',24,132,{menuActorRole:'option',menuItemID:'tool',menuActorSelectedOnly:true,menuVisibilityConditions:[condition('equipped',0,toolIndex)]});
 addImage('inventario_ferramentas','page-label-tools','toolcase-v2-page-2.png',24,39);
 for(const key of ['race_tool_equipped','race_tool_unequipped','race_chart_help','race_relay_help']) {
  const dialogue=p.dialogues.find(d=>d.key===key);if(!dialogue)continue;
  if(dialogue.translations?.['pt-BR'])dialogue.translations['pt-BR']=dialogue.translations['pt-BR'].replaceAll('mochila','caixa');
  if(dialogue.translations?.en)dialogue.translations.en=dialogue.translations.en.replaceAll('bag','toolcase');
  if(dialogue.translations?.es)dialogue.translations.es=dialogue.translations.es.replaceAll('mochila','caja');
  dialogue.text=dialogue.translations?.en??dialogue.text;
 }

 const resultItems=[['retry','TENTAR NOVAMENTE','race_retry'],['choose','ESCOLHER PROVA','race_results_choose'],['continue','CONTINUAR','race_results_continue']].map(([id,label,eventName],i)=>({id,label,eventName,action:'select',targetScreenID:'',enabled:true,clickBox:{x:8,y:108+i*16,width:224,height:14}}));
 const resultComponents=[0,1,2,3].map((i)=>({...blank('arrival',i),text:'',runtimeText:true,x:[99,69,69,69][i],y:39+i*14,width:[18,48,48,48][i]}));
 for(const part of catalog.parts['arrival-v21-interface.png'])resultComponents.push({id:'arrival-frame-'+part.file,kind:'frame',label:'Interface da chegada',text:'',asset:part.file,pixelPosition:true,x:part.x,y:part.y,width:part.width,height:part.height,zIndex:0,visible:true});
 const resultHud={id:'hud-arrival-approved-v21',name:'Chegada V2.1',description:'Interface independente do pátio e dos carros; placar real, sem opções selecionáveis nos valores.',backgroundImage:'',selectorImage:'',font:'porto-hud-b-font.png',textColor:6306,position:'Superior',width:240,height:160,mode:'advanced',components:resultComponents};
 put(p.settings.hudPresets,resultHud);
 edit('corrida_resultados',r=>{r.backgroundAssetName='arrival-v21-background.png';r.hudPresetId=resultHud.id;r.displayName='Chegada · Corridas';r.runtime.config={...r.runtime.config,title:'',items:resultItems,hudPresetId:resultHud.id,hudListRows:3,hudBindings:[4,3,6,5].map((index,slot)=>({slot,binding:bind('text',index),columns:slot===0?3:8})),onBackEventName:'race_results_continue'};delete r.runtime.config.hudHeader;return r;});
 for(const [i,item]of resultItems.entries())addActor('corrida_resultados','arrival-cursor-'+item.id,'book-cursor-approved-8x8.png',20,111+i*16,{animationName:'book-menu-book-cursor',menuActorRole:'option',menuItemID:item.id,menuActorSelectedOnly:true});
 const positions=[[147,76],[178,69],[210,77]];
 for(const place of [1,2,3]) {
  const names=place===1?['rival','nara','rival2']:place===2?['nara','rival','rival2']:['rival','rival2','nara'];
  for(const [i,name]of names.entries())addImage('corrida_resultados',`podium-${place}-${i}`,`arrival-v21-${name}.png`,positions[i][0]-16,positions[i][1]-32,{menuVisibilityConditions:[condition('text',4,place)]});
  addImage('corrida_resultados','nameplate-'+place,'arrival-v21-nameplate.png',positions[place===1?1:place===2?0:2][0]-16,94,{menuVisibilityConditions:[condition('text',4,place)]});
 }
 addImage('corrida_resultados','title-farol','arrival-v21-title-farol.png',56,10,{menuVisibilityConditions:[condition('context',0,0)]});
 addImage('corrida_resultados','title-mare','arrival-v21-title-mare.png',56,10,{menuVisibilityConditions:[condition('context',0,1)]});
 addImage('corrida_resultados','continue-story','arrival-v21-story.png',56,143,{menuVisibilityConditions:firstWin});
 addImage('corrida_resultados','continue-map','arrival-v21-map.png',56,143,{menuVisibilityConditions:otherResult,menuVisibilityAny:true});
 const returnMap=p.events.find(e=>e.name==='race_return_map');if(returnMap){returnMap.eventKind='procedure';returnMap.procedure={parameters:[],locals:[]};}
 event('race_results_choose','corrida_resultados',['scene_stack_clear','change_scene corrida_preparacao']);
 event('race_results_continue','corrida_resultados',['if_engine_field racing_result 1','if_engine_field previous_room 0','if_variable var_campaign_finished 0','call_procedure circuito_concluir','else','call_procedure race_return_map','condition_end','else','call_procedure race_return_map','condition_end','else','call_procedure race_return_map','condition_end']);
 if(p.editorState?.scenaConnections) {
  p.editorState.scenaConnections=p.editorState.scenaConnections.filter(c=>!(c.id??'').startsWith('approved-menu-result-')&&!(c.from==='corrida_resultados'&&c.to==='corrida_preparacao'));
  for(const [to,eventName]of [['corrida_preparacao','race_results_choose'],['mapa_rota','race_results_continue']])put(p.editorState.scenaConnections,{id:'approved-menu-result-'+to,from:'corrida_resultados',to,eventName,entry:{x:0,y:0,width:1,height:1},transition:{style:'cut',durationFrames:0,fadeOut:false,fadeIn:false}});
 }
 return p;
}
