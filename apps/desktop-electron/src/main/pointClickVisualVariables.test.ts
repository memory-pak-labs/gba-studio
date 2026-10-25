import { expect, it } from 'vitest';
import { createBlankProjectData } from '../shared/newProject.js';
import { buildEngineExportProjectContract } from './exportEngineProject.js';

it('keeps point-click visibility in the declared 64-variable save layout',()=>{
 const p=createBlankProjectData({name:'Late visual state',sceneType:'pointAndClick'});
 const room=(p.rooms as Array<Record<string,unknown>>)[0]!;
 p.variables=Array.from({length:64},(_,i)=>({id:'v'+i,name:'v'+i,initialValue:0}));
 (p.assets as Record<string,unknown>[]).push({id:'dial',name:'dial.png',kind:'Sprite',metadata:{source:'Assets/sprites/dial.png',frameWidth:32,frameHeight:32}});
 (p.animations as Record<string,unknown>[]).push({id:'dial-idle',name:'idle',spriteSheet:'dial.png',frameWidth:32,frameHeight:32,frameCount:1,frames:[{frameIndex:0,tiles:[{x:0,y:0,sliceX:0,sliceY:0,tileWidth:32,tileHeight:32}]}]});
 (p.actors as Record<string,unknown>[]).push({id:'dial',name:'Dial',roomName:room.name,x:5,y:5,spriteSheet:'dial.png',animationName:'idle',visibleVariable:'v63',visibleValue:2});
 room.eventBindings={onInit:'enter'};
 p.events=[{id:'enter',name:'enter',roomName:room.name,category:'Cena',command:'noop',steps:[{command:'set_variable v0 12'},{command:'set_variable v63 2'}]}];
 const contract=buildEngineExportProjectContract(p);
 expect(contract.point_click_project!.scenes[0]!.props).toEqual(expect.arrayContaining([expect.objectContaining({name:'Dial',visible_variable:63,visible_value:2})]));
 expect(contract.point_click_project!.scenes[0]!.on_enter).toEqual(expect.arrayContaining([{op:'set_variable',variable:0,value:12},{op:'set_variable',variable:63,value:2}]));
});
