import {readFileSync} from 'node:fs';

const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/world-map-lumen-manifest.json',import.meta.url)));
export const LUMEN_ROUTE_POSITIONS=[[79,224],[119,99],[140,196],[384,96],[275,86],[312,227],[453,62],[410,263]];
export const LUMEN_ROUTE_LABELS={available:'! Viajar    / Porto',journey:'Travessia',locked:'Rota bloqueada'};

/** Promote only the approved world-map presentation; campaign gates and scripts survive. */
export function promoteApprovedWorldMapLumen(source){
 const p=structuredClone(source),bg='route-lumen-paged.png',ship='route-dirigible-lumen-64.png',animation='route-dirigible-lumen';
 const update=r=>{
  if(r.name!=='mapa_rota')return r;
  r.backgroundAssetName=bg;r.music='mapa_mar_aberto';r.hudPresetId='hud-route-travel';
  r.runtime.config={...r.runtime.config,cursorAffine:true,hudLabels:LUMEN_ROUTE_LABELS,profile:'route-lumen-dirigible-approved',nodes:r.runtime.config.nodes.map((n,i)=>({...n,x:LUMEN_ROUTE_POSITIONS[i][0],y:LUMEN_ROUTE_POSITIONS[i][1],name:{armazem:'Armazém das Marés',observatorio:'Observatório'}[n.id]??n.name}))};
  return r;
 };
 for(const key of ['rooms','scenas'])p[key]=p[key].map(update);
 if(p.scena)p.scena=update(p.scena);
 for(const actor of p.actors)if(actor.id==='map-cursor')Object.assign(actor,{name:'Dirigível Lumen',spriteSheet:ship,animationName:animation,animationStateID:`${animation}-state`,x:79/8-4,y:(224-20-32)/8,worldMapRole:'cursor'});
 const a={id:`${animation}-animation`,name:animation,spriteSheet:ship,frameWidth:64,frameHeight:64,frameCount:1,fps:8,loops:true,state:'idle',direction:'none',colorMode:'4bpp',sourceColorMode:'4bpp',originSpace:'animator',originX:-24,originY:-56,hitboxX:0,hitboxY:0,hitboxWidth:64,hitboxHeight:64,frames:[{id:`${animation}-frame`,frameIndex:0,sourceFrameIndex:0,width:64,height:64,originX:-24,originY:-56,tiles:[{id:`${animation}-tile`,x:-24,y:0,sliceX:0,sliceY:0,sourceSheet:ship,tileWidth:64,tileHeight:64,flipX:false,flipY:false,objPalette:'OBP0',paletteIndex:0,priority:false}]}]};
 p.animations=p.animations.filter(x=>x.name!==animation).concat(a);
 p.animationStates=p.animationStates.filter(x=>x.id!==`${animation}-state`).concat({id:`${animation}-state`,name:animation,spriteSheet:ship,animationType:'fixed',mirrorLeftFromRight:false,animationIDs:[a.id]});
 // Retire only the replaced map records; source PNGs stay archived on disk.
 p.assets=p.assets.filter(x=>x.id!=='world-map-lumen-hud'&&!['route-map-paged-v2.png','route-airship-v2.png'].includes(x.name));
 p.animations=p.animations.filter(x=>x.spriteSheet!=='route-airship-v2.png');
 p.animationStates=p.animationStates.filter(x=>x.spriteSheet!=='route-airship-v2.png');
 for(const item of Object.values(manifest.assets)){
  p.assets=p.assets.filter(x=>x.id!==item.id).concat(structuredClone(item));
 }
 p.audioItems=p.audioItems.filter(x=>x.name!=='mapa_mar_aberto').concat(structuredClone(manifest.music));
 for(const event of p.events)if(event.name==='mapa_ao_entrar')for(const step of event.steps??[])if(step.command.startsWith('play_music '))step.command='play_music mapa_mar_aberto';
 const text=(id,label,text,x,y,width,runtimeText)=>({id,kind:'text',label,text,x,y,width,height:8,zIndex:1,visible:true,asset:'',pixelPosition:true,textAdvance:6,...(runtimeText?{runtimeText:true}:{})});
 const hud={id:'hud-route-travel',name:'Carta de navegação · Lumen',description:'Carta compacta aprovada: destino, viagem e bloqueio em tempo real.',backgroundImage:'',selectorImage:'',font:'route-lumen-hud-font.png',textColor:9478,position:'Inferior',width:240,height:160,mode:'advanced',components:[...[0,1,2].map(i=>({id:`lumen-route-paper-${i}`,kind:'frame',label:'Carta e bússola',text:'',asset:`route-lumen-hud-card-${i}.png`,x:6+64*i,y:126,width:64,height:32,zIndex:0,visible:true,pixelPosition:true})),text('lumen-route-name','Destino','Porto Lumen',30,131,150,true),text('lumen-route-status','Viagem',LUMEN_ROUTE_LABELS.available,30,143,144,true)]};
 p.settings.hudPresets=p.settings.hudPresets.filter(x=>x.id!==hud.id).concat(hud);
 for(const c of p.editorState?.scenaConnections??[])if(c.from==='mapa_rota'){
  const n=p.rooms.find(r=>r.name==='mapa_rota').runtime.config.nodes.find(n=>n.eventName===c.eventName);
  if(n)c.exit={x:n.x/8,y:n.y/8,width:1,height:1};
 }
 return p;
}
