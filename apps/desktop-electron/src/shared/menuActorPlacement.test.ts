import {describe,it,expect} from 'vitest';
import {deriveRoomsWorkspacePresentation} from './roomsWorkspace.js';
import {gbaActorSpriteRoomPlacementFromFrame} from './gbaRendering.js';
describe('authored menu pixel positions',()=>{
 it('places the cursor at native pixel coordinates without changing grid authoring',()=>{
  const actor={id:'cursor',name:'Cursor',roomName:'gender',x:7,y:5,menuPositionPixels:{x:58,y:47}};
  const data={scenas:[{name:'gender',width:30,height:20,sceneType:'menu'}],actors:[actor]};
  const result=deriveRoomsWorkspacePresentation(data);
  expect(result.entities[0]).toMatchObject({x:58/8,y:47/8});
  expect(actor).toMatchObject({x:7,y:5});
 });
 it('keeps menu icons and portraits at the runtime top-left instead of applying the gameplay pivot twice',()=>{
  for (const width of [16,32,64]) {
   const actor={id:'icon',name:'Icon',roomName:'menu',x:18,y:5,menuPositionPixels:{x:148,y:40},spriteSheet:'icon.png',animationName:'idle'};
   const data={scenas:[{name:'menu',width:30,height:20,sceneType:'menu'}],actors:[actor],assets:[{id:'sheet',kind:'Sprite',name:'icon.png',metadata:{frameWidth:width,frameHeight:width}}],animations:[{id:'idle',name:'idle',spriteSheet:'icon.png',frameWidth:width,frameHeight:width,frameCount:1,originX:-(width/2-8),originY:0}]};
   const entity=deriveRoomsWorkspacePresentation(data).entities[0];
   expect(entity.spriteFrame).not.toBeNull();
   const placement=gbaActorSpriteRoomPlacementFromFrame(entity.x,entity.y,entity.spriteFrame!);
   expect({x:placement.leftTiles*8,y:placement.topTiles*8}).toEqual({x:148,y:40});
   expect(data.animations[0].originX).toBe(-(width/2-8));
  }
 });
});
