import {expect,it} from 'vitest';
import {sceneInterfaceImage,sceneInterfaceImageSupported,updateSceneInterfaceImage} from './sceneInterfaceImage.js';
it.each(['luta','battleRpg','dungeonCrawler','isometric'])('edits the native interface image in %s without replacing scene data',type=>{
 const config={hudAssetName:'old.png',tacticalCapabilities:[{id:'tactical_hud',enabled:true}],presentation:{hudAssetName:'old.png',wall:'wall.png'},tacticalPresentation:{hudLayout:'old.png',surface:'floor.png'},physics:{speed:2}};
 const room={sceneType:type,runtime:{type,config}};
 expect(sceneInterfaceImage(room)).toBe('old.png');
 const next=updateSceneInterfaceImage(room,'new.png');
 expect(sceneInterfaceImage({...room,...next})).toBe('new.png');
 expect((next.runtime?.config as Record<string,unknown>).physics).toEqual({speed:2});
 expect(config.hudAssetName).toBe('old.png');
 const cleared={...room,...updateSceneInterfaceImage(room,'')};expect(sceneInterfaceImage(cleared)).toBeUndefined();expect(sceneInterfaceImageSupported(cleared)).toBe(true);
});
it('does not invent an image interface for other runtimes',()=>{
 expect(sceneInterfaceImage({sceneType:'topdown',runtime:{type:'topdown',config:{}}})).toBeUndefined();
 expect(updateSceneInterfaceImage({sceneType:'topdown',runtime:{type:'topdown',config:{}}},'a.png')).toEqual({});
});
