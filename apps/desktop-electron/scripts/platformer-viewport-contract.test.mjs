import {describe,it,expect} from 'vitest';
import {platformerCameraPosition,composePlatformerViewport} from './platformer-viewport-contract.mjs';
describe('platformer native viewport evidence',()=>{
 it('matches the approved initial framing and clamps at the world edges',()=>{
  const room={width_tiles:120,height_tiles:40,player_start:{width:16,height:24},camera:{position:{x:0,y:0},follow_player:true},config:{camera_deadzone_x_pixels:24},camera_zones:[{area:{x:0,y:0,width:960,height:320},bounds:{x:0,y:0,width:960,height:320},offset:{x:0,y:-16}}]};
  expect(platformerCameraPosition(room,{player:{x:80,y:232}})).toEqual({x:0,y:144});
  expect(platformerCameraPosition(room,{player:{x:940,y:216}})).toEqual({x:720,y:132});
 });
 it('keeps the sky fixed while terrain follows the camera',()=>{
  const sky={width:4,height:1,pixels:Uint8Array.from([1,0,0,255,2,0,0,255,3,0,0,255,4,0,0,255]),parallax:{x:0,y:0}};
  const terrain={width:4,height:1,pixels:Uint8Array.from([0,0,0,0,0,0,0,0,0,9,0,255,0,0,0,0])};
  expect([...composePlatformerViewport([sky,terrain],{x:1,y:0},2,1).pixels]).toEqual([1,0,0,255,0,9,0,255]);
 });
});
