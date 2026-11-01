import type {UpdateRoomFields} from './roomsWorkspace/core.js';

type ImageScene = {sceneType:string;runtime?:{type:string;config?:unknown}};
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};

export function sceneInterfaceImageSupported(room:ImageScene):boolean {
 const config=record(room.runtime?.config);
 if(room.runtime?.type==='luta'||room.runtime?.type==='battleRpg')return true;
 if(room.runtime?.type==='dungeonCrawler')return Boolean(config.presentation);
 return room.runtime?.type==='isometric' && !record(config.tacticalPresentation).compactHud &&
  Array.isArray(config.tacticalCapabilities) && config.tacticalCapabilities.some(value=>record(value).id==='tactical_hud'&&record(value).enabled);
}

/** The image remains a single asset; authored compositions take precedence. */
export function sceneInterfaceImage(room:ImageScene|null):string|undefined {
 if(!room)return undefined;
 const config=record(room.runtime?.config);
 let image:unknown;
 switch(room.runtime?.type){
  case 'luta':case 'battleRpg':image=config.hudAssetName;break;
  case 'dungeonCrawler':image=record(config.presentation).hudAssetName;break;
  case 'isometric':
   if(Array.isArray(config.tacticalCapabilities)&&config.tacticalCapabilities.some(value=>record(value).id==='tactical_hud'&&record(value).enabled))image=record(config.tacticalPresentation).hudLayout;
   break;
 }
 return typeof image==='string'&&image?image:undefined;
}

export function updateSceneInterfaceImage(room:ImageScene,image:string):UpdateRoomFields {
 const runtime=room.runtime;if(!runtime)return {};
 const config=record(runtime.config);
 let next:Record<string,unknown>;
 switch(runtime.type){
  case 'luta':case 'battleRpg':next={...config,hudAssetName:image};break;
  case 'dungeonCrawler':next={...config,presentation:{...record(config.presentation),hudAssetName:image}};break;
  case 'isometric':next={...config,tacticalPresentation:{...record(config.tacticalPresentation),hudLayout:image}};break;
  default:return {};
 }
 return {runtime:{...runtime,config:next} as UpdateRoomFields['runtime']};
}
