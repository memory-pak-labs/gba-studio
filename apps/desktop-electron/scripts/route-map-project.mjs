/** Approved travel map. Changes only its authored scene, assets and connections. */
export const ROUTE_DESTINATIONS = [
  ['porto','Porto Lumen',79,224,'porto_lumen',-1,15,14],
  ['penedos','Penedos do Vento',123,115,'penedos_vento',-1,4,10],
  ['armazem','Armazem das Mares',111,169,'armazem_das_mares',4,7,8],
  ['observatorio','Observatorio',384,96,'observatorio_do_farol',10,16,13],
  ['mercado','Mercado Suspenso',278,80,'mercado_suspenso',11,18,13],
  ['usina','Usina Submersa',307,208,'usina_submersa',12,15,15],
  ['conselho','Conselho Guardia',424,74,'conselho_guardia',2,7,15],
  ['circuito','Circuito Final',368,244,'circuito_final',7,32,30]
];
export function refineRouteMap(source,{removeLab=false}={}) {
  const p=structuredClone(source);
  const bg='route-map-paged-v2.png', plane='route-airship-v2.png', animation='route-airship-v2';
  const nodes=ROUTE_DESTINATIONS.map(([id,name,x,y,,requiredVariable],i)=>({id,name,x,y,
    connections:ROUTE_DESTINATIONS.filter(d=>d[0]!==id).map(d=>d[0]),
    eventName:`mapa_viajar_${id}`, dialogueKey:'', targetLevel:i, unlocked:true, hideWhenLocked:false,
    requiredVariable,requiredValue:requiredVariable<0?0:1}));
  const transform=r=>r.name!=='mapa_rota'?r:{...r,width:60,height:40,
    backgroundAssetName:bg,backgroundRenderMode:'tilemap',gbStudioUseBackgroundLayout:true,
    cameraMode:'follow_player',cameraBounds:{x:0,y:0,width:60,height:40},hudPresetId:'hud-route-travel',
    tilemap:{encoding:'rle-v1',length:2400,runs:[[0,2400]]},
    collisions:{encoding:'rle-v1',length:2400,runs:[['free',2400]]},
    collisionTypes:{encoding:'rle-v1',length:2400,runs:[['free',2400]]},tileLayers:[],
    runtime:{type:'worldMap',config:{...r.runtime.config,navigable:true,cursorAffine:true,nodes,profile:'route-map-affine-v2-approved'}},
    campaign:{...r.campaign,objective:'Escolher uma regiao liberada e viajar com a aeronave.',controls:'Direcional: destino. A: viajar. B: Porto. Start: pausa.'}};
  for(const key of ['rooms','scenas']) p[key]=p[key].filter(r=>!removeLab||r.name!=='affine_lab').map(transform);
  p.actors=p.actors.filter(a=>a.roomName!=='mapa_rota'&&(!removeLab||a.roomName!=='affine_lab'));
  p.actors.push({id:'map-cursor',name:'Aeronave de viagem',roomName:'mapa_rota',x:79/8-2,y:224/8-2.5,
    spriteSheet:plane,animationName:animation,animationStateID:`${animation}-state`,worldMapRole:'cursor'});
  p.animations=p.animations.filter(a=>a.name!==animation).concat({id:`${animation}-animation`,name:animation,
    spriteSheet:plane,frameWidth:32,frameHeight:32,fps:8,loops:true,frameCount:1,state:'idle',direction:'none',colorMode:'4bpp',sourceColorMode:'4bpp',originX:16,originY:16,
    hitboxX:0,hitboxY:0,hitboxWidth:32,hitboxHeight:32,
    frames:[{id:`${animation}-frame`,frameIndex:0,sourceFrameIndex:0,width:32,height:32,originX:16,originY:16,
      tiles:[{id:`${animation}-tile`,x:0,y:0,sliceX:0,sliceY:0,sourceSheet:plane,tileWidth:32,tileHeight:32,flipX:false,flipY:false,objPalette:'OBP0',paletteIndex:0,priority:false}]}]});
  const assets=[{id:'route-map-paged-v2',kind:'Background',name:bg,systemImage:'map',metadata:{
    source:`Assets/backgrounds/${bg}`,kind:'paged_bg',colorMode:'8bpp-indexed',width:480,height:320,
    profile:'worldMap',role:'route-map',sceneRoles:['route-map','route-islands'],reviewStatus:'approved',visualStatus:'approved',visualProfile:'gba_neutral_cohesive_pixel_art_medium',backgroundPaletteBankBudget:14,
    provenance:'Composicao V2 aprovada; fundo sem marcadores gerado a partir da fonte do usuario. Atlas em ROM; janela BG regular 31x21; bancos 14 e 15 reservados para HUD/dialogo.'}},
    {id:animation,kind:'Sprite',name:plane,systemImage:'airplane',metadata:{source:`Assets/sprites/${plane}`,colorMode:'4bpp',width:32,height:32,profile:'worldMap',role:'route-airship',sceneRoles:['route-airship','route-marker'],reviewStatus:'approved',visualStatus:'approved',visualProfile:'gba_neutral_cohesive_pixel_art_medium',provenance:'Aeronave V2 aprovada, preparada em 32x32, 15 cores RGB555 e alpha binario; affine OBJ na viagem.'}}];
  p.assets=p.assets.filter(a=>!assets.some(b=>a.id===b.id)).concat(assets.map(asset => ({...asset, metadata:{...p.assets.find(old => old.id === asset.id)?.metadata, ...asset.metadata}})));
  const makeEvent=(name,commands)=>({id:`route-v2-${name}`,name,roomName:'mapa_rota',category:'Cena',detail:'Viagem regional aprovada.',command:'noop',steps:commands.map((command,i)=>({id:`route-v2-${name}-${i}`,command,isEnabled:true}))});
  const events=[makeEvent('mapa_ao_entrar',['play_music farol_memorias']),...ROUTE_DESTINATIONS.map(([id,,, ,room,,x,y],i)=>makeEvent(`mapa_viajar_${id}`,[`set_variable var_active_route ${i}`,`change_scene ${room} ${x} ${y} down`]))];
  p.events=p.events.filter(e=>!events.some(n=>n.name===e.name)&&e.name!=='mapa_escolher_penedos'&&(!removeLab||e.roomName!=='affine_lab')).concat(events);
  const component=(id,kind,label,x,y,width,height)=>({id:`route-hud-${id}`,kind,label,text:'',asset:'',x,y,width,height,zIndex:kind==='frame'?0:1,visible:true});
  const hud={id:'hud-route-travel',name:'Mapa de viagem',description:'Destino, disponibilidade e comandos de viagem.',backgroundImage:'',selectorImage:'',font:'',position:'Superior',width:240,height:160,mode:'advanced',components:[
    component('top','frame','',0,0,240,24),component('name','text','Porto Lumen',8,8,216,8),
    component('bottom','frame','',0,128,240,32),component('status','text','A VIAJAR',8,136,80,8),
    component('help','text','D DESTINO B PORTO',8,144,160,8),component('pause','text','START PAUSA',144,136,88,8)]};
  p.settings.hudPresets=p.settings.hudPresets.filter(h=>h.id!==hud.id).concat(hud);
  if(p.editorState){
    p.editorState.scenaConnections=(p.editorState.scenaConnections??[]).filter(c=>c.from!=='mapa_rota'&&(!removeLab||(c.from!=='affine_lab'&&c.to!=='affine_lab')))
      .concat(ROUTE_DESTINATIONS.map(([id,xName,x,y,to,,ex,ey])=>({from:'mapa_rota',to,eventName:`mapa_viajar_${id}`,exit:{x:x/8,y:y/8,width:1,height:1},entry:{x:ex,y:ey,width:1,height:1}})));
    if(removeLab) {
      if (p.editorState.sceneMapPositions) delete p.editorState.sceneMapPositions.affine_lab;
      if (p.editorState.scenaPositions) delete p.editorState.scenaPositions.affine_lab;
      if (p.editorState.sceneExplorer?.order) p.editorState.sceneExplorer.order = p.editorState.sceneExplorer.order.filter(id => id !== 'scene-affine_lab');
      if (p.editorState.activeScenaName === 'affine_lab') {
        const map = p.scenas.find(r => r.name === 'mapa_rota');
        p.editorState.activeScenaName = map.name;
        p.editorState.activeScenaID = map.id;
      }
    }
  }
  if (p.scena?.name === 'mapa_rota') p.scena = transform(p.scena);
  if (removeLab && p.scena?.name === 'affine_lab') p.scena = structuredClone(p.scenas.find(r => r.name === 'mapa_rota'));
  return p;
}
