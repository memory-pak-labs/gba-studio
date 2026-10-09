import {describe,it,expect} from "vitest";
import {racingCameraFloorLine,racingCameraSine} from "./racingCameraProjection.js";
const camera={height:48,distance:64,focalLength:96};
describe("racing editor and ARM camera projection",()=>{
  it("places the vehicle ground point at the same coordinate facing north and east",()=>{
    for(const heading of [0,1024]) {
      const line=racingCameraFloorLine({x:256,y:256},heading,camera,48,120)!;
      expect(line.x+line.pa*120).toBe(256*256);
      expect(line.y+line.pc*120).toBe(256*256);
    }
    expect(racingCameraFloorLine({x:0,y:0},0,camera,48,48)).toBeNull();
    expect(racingCameraFloorLine({x:0,y:0},0,camera,48,160)).toBeNull();
  });
  it("wraps smooth clockwise headings with the engine sine table",()=>{
    expect([0,1024,2048,3072,4096].map(racingCameraSine)).toEqual([0,256,0,-256,0]);
    expect(racingCameraSine(128)).toBe(49);
    expect(racingCameraSine(-128)).toBe(-49);
  });
});
