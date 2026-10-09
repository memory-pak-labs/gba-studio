import type { RacingPerspectiveCamera } from "./sceneTypeProfiles.js";
export function racingCameraSine(angle:number):number {
  const values=[0,98,181,237,256,237,181,98,0,-98,-181,-237,-256,-237,-181,-98,0];
  const bounded=angle&4095,step=bounded>>8;
  return values[step]+Math.trunc((values[step+1]-values[step])*(bounded&255)/256);
}
/** Uses the same integer projection and compass convention as racing_camera.hpp. */
export function racingCameraFloorLine(player:{x:number;y:number},heading:number,camera:RacingPerspectiveCamera,horizon:number,y:number) {
  if(y<=horizon || y>=160)return null;
  const sine=racingCameraSine(heading),cosine=racingCameraSine(heading+1024);
  const scale=Math.trunc(camera.height*256/(y-horizon)),depth=Math.trunc(camera.height*camera.focalLength*256/(y-horizon));
  const pa=Math.trunc(scale*cosine/256),pc=Math.trunc(scale*sine/256);
  return {pa,pc,x:player.x*256-sine*camera.distance+Math.trunc(sine*depth/256)-pa*120,
    y:player.y*256+cosine*camera.distance-Math.trunc(cosine*depth/256)-pc*120};
}
