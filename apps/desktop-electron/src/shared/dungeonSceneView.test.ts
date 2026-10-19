import {describe,it,expect} from 'vitest';
import {dungeonActorVisual,dungeonGeometryKey,projectDungeonActor,renderDungeonWorld} from './dungeonSceneView.js';
import type {GBAProjectData} from './projectFile.js';
describe('Dungeon authoring camera contract',()=>{
 it('anchors ordinary NPCs to the modern floor without requiring depth sheets, preserving their native frame',()=>{
  const data={animations:[{name:'idle',spriteSheet:'guard.png',frameWidth:32,frameHeight:32,frames:[{}]}]} as GBAProjectData;
  const grid={width:19,height:19,cells:Array(361).fill(false)},camera={x:9,y:9,direction:0};
  const actor={spriteSheet:'guard.png',animationName:'idle'};
  for(const distance of [1,2,4,8]){
   const projection=projectDungeonActor(grid,camera,{x:9,y:9-distance},false,{modern:true})!;
   expect(dungeonActorVisual(data,actor,projection,true)).toMatchObject({x:112,y:58+48/distance-24,width:32,height:32});
   expect(dungeonActorVisual(data,{...actor,dungeonDepthSheets:{near:'guard.png',mid:'guard.png',far:'guard.png'}},projection,true)).toEqual(dungeonActorVisual(data,actor,projection,true));
  }
  const projection=projectDungeonActor(grid,camera,{x:9,y:5},false)!;
  expect(dungeonActorVisual(data,actor,projection,false)).toMatchObject({x:80,y:-16});
 });
 const room={width:5,height:5,cells:['#####','#...#','#...#','#...#','#####'].join('').split('').map(x=>x==='#')};
 it('uses the native first-person field of view and the authored view distance for actors',()=>{
  const camera={x:2,y:3,direction:0};
  expect(projectDungeonActor(room,camera,{x:3,y:2},false,{modern:true,viewDistance:5})).toBeNull();
  expect(projectDungeonActor(room,camera,{x:3,y:1},false,{modern:true,viewDistance:5})).not.toBeNull();
  expect(projectDungeonActor(room,camera,{x:2,y:1},false,{modern:true,viewDistance:1})).toBeNull();
 });
 it('invalidates views after closing as well as opening a corridor',()=>{
  const key=dungeonGeometryKey(room);const edited={...room,cells:[...room.cells]};edited.cells[12]=true;
  expect(dungeonGeometryKey(edited)).not.toBe(key);expect(dungeonGeometryKey({...room,cells:[...room.cells]})).toBe(key);
 });
 it('projects an actor from logical cells, respecting occlusion and depth',()=>{
  const camera={x:2,y:3,direction:0};
  expect(projectDungeonActor(room,camera,{x:2,y:2},false)).toMatchObject({x:88,y:46,size:64});
  expect(projectDungeonActor(room,camera,{x:2,y:4},false)).toBeNull();
  const wall={...room,cells:[...room.cells]};wall.cells[12]=true;
  expect(projectDungeonActor(wall,camera,{x:2,y:1},false)).toBeNull();
 });
 it('renders the camera at 240x160 and reflects an edited wall',()=>{
  const camera={x:2,y:3,direction:0};const a=renderDungeonWorld(room,camera);
  expect(a).toHaveLength(240*160*4);
  const wall={...room,cells:[...room.cells]};wall.cells[12]=true;
  expect(renderDungeonWorld(wall,camera)).not.toEqual(a);
 });
});
