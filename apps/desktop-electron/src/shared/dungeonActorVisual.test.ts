import {expect,it} from 'vitest';
import {dungeonActorVisual} from './dungeonSceneView.js';
import type {GBAProjectData} from './projectFile.js';

const data={assets:[{name:'small.png',metadata:{width:128,height:32}},{name:'near.png',metadata:{width:192,height:64}}],animations:[
 {name:'idle',spriteSheet:'small.png',frameWidth:32,frameHeight:32,originX:0,originY:0,frames:[{originX:0,originY:0,tiles:[{x:-8,y:0,tileWidth:32,tileHeight:32,sliceX:32,sliceY:0}]}]},
 {name:'poses',spriteSheet:'near.png',frameWidth:64,frameHeight:64,originX:0,originY:0,frames:[{originX:0,originY:0,tiles:[{x:-32,y:4,tileWidth:64,tileHeight:64,sliceX:0,sliceY:0}]}]}
]} as unknown as GBAProjectData;
const projection={x:88,y:46,size:64,depth:'near',distance:1} as const;
it('uses the native frame size, source crop and actor anchor without scaling a 32px sprite',()=>{
 const actor={spriteSheet:'small.png',animationName:'idle',dungeonDepthSheets:{near:'small.png'},dungeonDepthAnimationName:'idle'};
 expect(dungeonActorVisual(data,actor,projection,true)).toMatchObject({x:112,y:82,width:32,height:32,sheet:'small.png',sourceX:32,sourceY:0,sheetWidth:128,sheetHeight:32,footX:120,footY:110});
});
it('preserves approved 64px depth frames and keeps the old anchor only for legacy rooms',()=>{
 expect(dungeonActorVisual(data,{spriteSheet:'small.png',dungeonDepthSheets:{near:'near.png'}},projection,true)).toMatchObject({x:88,y:46,width:64,height:64});
 expect(dungeonActorVisual(data,{spriteSheet:'small.png',animationName:'idle'},projection,true)).toMatchObject({x:112,y:82,width:32,height:32});
 expect(dungeonActorVisual(data,{spriteSheet:'small.png',animationName:'idle'},projection,false)).toMatchObject({x:80,y:8,width:32,height:32});
});
