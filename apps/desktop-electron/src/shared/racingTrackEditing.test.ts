import {expect,it} from 'vitest';
import {changeRacingTrackGeometry,insertRacingRoutePoint,removeRacingTrackElement} from './racingTrackEditing.js';
import {createRacingCircuitTrack} from './racingAuthoring.js';
it('moves and resizes a centered gate without changing order, event or other geometry',()=>{
 const t=createRacingCircuitTrack(64,64);t.checkpoints[1].eventName='pass';
 const moved=changeRacingTrackGeometry(t,{kind:'gate',id:t.checkpoints[1].id},8,-8,512,512);
 expect(moved.checkpoints[1]).toMatchObject({x:392,y:120,eventName:'pass'});expect(t.checkpoints[1].x).toBe(384);expect(moved.pathPoints).toEqual(t.pathPoints);
 const resized=changeRacingTrackGeometry(t,{kind:'gate',id:t.checkpoints[1].id},16,8,512,512,true);
 expect(resized.checkpoints[1]).toMatchObject({x:392,y:132,width:48,height:40,eventName:'pass'});
 expect(changeRacingTrackGeometry(t,{kind:'gate',id:'missing'},8,0,512,512)).toBe(t);
});
it('bounds route edits, inserts a midpoint and keeps a closed route with at least two points',()=>{
 const t=createRacingCircuitTrack(64,64);const moved=changeRacingTrackGeometry(t,{kind:'point',index:0},-900,900,512,512);
 expect(moved.pathPoints![0]).toEqual({x:0,y:511});expect(moved.checkpoints).toEqual(t.checkpoints);
 expect(insertRacingRoutePoint(t,0).pathPoints![1]).toEqual({x:256,y:128});
 expect(removeRacingTrackElement(t,{kind:'gate',id:'finish'})).toBe(t);
 const two={...t,pathPoints:t.pathPoints!.slice(0,2)};expect(removeRacingTrackElement(two,{kind:'point',index:0})).toBe(two);
});
