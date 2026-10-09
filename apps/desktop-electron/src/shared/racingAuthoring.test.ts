import { describe, expect, it } from "vitest";
import { createRacingCircuitTrack, racingFloorSourceTileIndex } from "./racingAuthoring.js";
import { normalizeSceneRuntime, resolveSceneRuntime } from "./sceneTypeProfiles.js";
import { updateRoomFieldsInProject } from "./roomsWorkspace.js";

describe("authorable perspective racing circuit", () => {
  it("matches the editor tile IDs and keeps erased cells empty", () => {
    expect([0,1,2,256].map(racingFloorSourceTileIndex)).toEqual([-1,0,1,255]);
  });
  it("resizes the editable circuit and keeps its painted tiles and collision cells", () => {
    const project={scenas:[{id:"race",name:"Race",sceneType:"racing",width:32,height:32,
      tilemap:Array.from({length:1024},(_,i)=>i===33?7:0),collisionTypes:Array.from({length:1024},(_,i)=>i===33?"solid":"free")}]};
    const next=updateRoomFieldsInProject(project,"race",{width:64,height:64,runtime:{type:"racing",config:{presentation:"pseudo3d",topdownTrack:createRacingCircuitTrack(64,64)}}});
    const room=(next.scenas as typeof project.scenas)[0]!;
    expect(room.tilemap).toHaveLength(4096);
    expect(room.tilemap[65]).toBe(7);
    expect(room.collisionTypes[65]).toBe("solid");
  });
  it("creates ordered positional gates and an opponent route inside the map", () => {
    const track=createRacingCircuitTrack(64,64);
    expect(track.pathPoints).toHaveLength(4);
    expect(track.checkpoints).toHaveLength(4);
    expect(new Set(track.checkpoints.map(gate=>gate.id)).size).toBe(4);
    expect(track.pathPoints!.every(point=>point.x>=0&&point.y>=0&&point.x<512&&point.y<512)).toBe(true);
    expect(track.startHeading).toBe(4);
  });
  it("persists the camera controls and presentation through room normalization", () => {
    const runtime=normalizeSceneRuntime("racing",{type:"racing",config:{presentation:"pseudo3d",
      perspectiveCamera:{height:48,distance:64,focalLength:96},topdownTrack:createRacingCircuitTrack(64,64)}});
    expect(runtime.config).toMatchObject({perspectiveCamera:{height:48,distance:64,focalLength:96}});
    expect(resolveSceneRuntime("racing",runtime).config).toMatchObject({presentation:"pseudo3d",
      perspectiveCamera:{height:48,distance:64,focalLength:96}});
  });
});
