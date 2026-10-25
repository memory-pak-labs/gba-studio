import { describe, it, expect } from 'vitest';
import { dungeonActorViewCoordinates } from './native-scene-framebuffer-contract.mjs';

describe('native dungeon actor field of view', () => {
  const room={config:{view_distance:4},presentation:{}};
  it('does not require a wall panel outside the initial presentation cone', () => {
    expect(dungeonActorViewCoordinates(room,{x:2,y:8},{player:{x:1,y:9,direction:0}})).toBeNull();
  });
  it('keeps actors directly ahead required, with the native lateral sign', () => {
    expect(dungeonActorViewCoordinates(room,{x:1,y:8},{player:{x:1,y:9,direction:0}})).toEqual({distance:1,lateral:0});
    expect(dungeonActorViewCoordinates(room,{x:2,y:7},{player:{x:1,y:9,direction:0}})).toEqual({distance:2,lateral:1});
    expect(dungeonActorViewCoordinates(room,{x:3,y:5},{player:{x:1,y:9,direction:0}})).toEqual({distance:4,lateral:2});
    expect(dungeonActorViewCoordinates(room,{x:4,y:8},{player:{x:1,y:9,direction:0}})).toBeNull();
  });
  it('preserves the legacy view and rejects actors behind or beyond the range', () => {
    expect(dungeonActorViewCoordinates({config:room.config},{x:2,y:8},{player:{x:1,y:9,direction:0}})).toEqual({distance:1,lateral:-1});
    expect(dungeonActorViewCoordinates(room,{x:1,y:10},{player:{x:1,y:9,direction:0}})).toBeNull();
    expect(dungeonActorViewCoordinates(room,{x:1,y:4},{player:{x:1,y:9,direction:0}})).toBeNull();
  });
});
