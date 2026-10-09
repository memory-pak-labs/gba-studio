import type { RacingTopdownTrackConfig } from "./sceneTypeProfiles.js";

/** Editor IDs start at one; zero is an erased cell. */
export function racingFloorSourceTileIndex(tileID:number):number {
  return Number.isFinite(tileID) && tileID>0 ? Math.round(tileID)-1 : -1;
}

/** Gate zero is the finish; the other gates must be crossed in order first. */
export function createRacingCircuitTrack(widthTiles: number, heightTiles: number): RacingTopdownTrackConfig {
  const width = Math.max(128, widthTiles * 8);
  const height = Math.max(128, heightTiles * 8);
  const left = Math.round(width / 4), right = Math.round(width * 3 / 4);
  const top = Math.round(height / 4), bottom = Math.round(height * 3 / 4);
  const pathPoints = [{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];
  return {cameraDeadZoneX:0,cameraDeadZoneY:0,startHeading:4,finishAtZero:true,pathPoints,
    checkpoints:pathPoints.map((point,index)=>({id:index===0?"finish":`checkpoint-${index}`,
      x:point.x,y:point.y,width:32,height:32}))};
}
