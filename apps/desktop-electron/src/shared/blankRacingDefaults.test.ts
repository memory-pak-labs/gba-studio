import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "./projectTemplates.js";
import { createRoomInProject, updateRoomFieldsInProject } from "./roomsWorkspace.js";
import { resolveGbaActorSprite } from "./gbaRendering.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject } from "./projectFile.js";

const rows=(data:any,key:string):any[]=>data[key];
const player=(data:any)=>rows(data,"actors").find(actor=>actor.roomName==="race"&&actor.name==="Player");

describe("approved racing players in blank projects",()=>{
  it("uses the overhead car and switches the default car with presentation without moving it",()=>{
    const base=buildProjectFromTemplate("blank",{name:"Cars"});
    const overhead=createRoomInProject(base,{id:"race",name:"race",width:64,height:64,sceneType:"racing"});
    expect(player(overhead).spriteSheet).toBe("neutral-player-racing-topdown.png");
    expect(resolveGbaActorSprite(overhead,player(overhead))!.frame).toMatchObject({originX:16,originY:16});
    const rear=updateRoomFieldsInProject(overhead,"race",{runtime:{type:"racing",config:{presentation:"pseudo3d"}}});
    expect(player(rear)).toMatchObject({spriteSheet:"neutral-player-racing-rear.png",animationName:"idle",x:32,y:32});
    const back=updateRoomFieldsInProject(rear,"race",{runtime:{type:"racing",config:{presentation:"topdown"}}});
    expect(player(back)).toMatchObject({spriteSheet:"neutral-player-racing-topdown.png",animationName:"idle_up",x:32,y:32});
    const reopened=parseGBAProjectFile(serializeGBAProjectFile({data:rear,summary:summarizeGBAProject(rear)})).data;
    expect(player(reopened).spriteSheet).toBe("neutral-player-racing-rear.png");
  });

  it("preserves a custom car while changing presentation",()=>{
    let data=createRoomInProject(buildProjectFromTemplate("blank",{name:"Custom"}),{id:"race",name:"race",width:64,height:64,sceneType:"racing"});
    player(data).spriteSheet="custom-car.png";
    data=updateRoomFieldsInProject(data,"race",{runtime:{type:"racing",config:{presentation:"pseudo3d"}}});
    expect(player(data).spriteSheet).toBe("custom-car.png");
  });

  it("exports each racing scene's own player and every rear action",()=>{
    let data=createRoomInProject(buildProjectFromTemplate("blank",{name:"Two cars"}),{id:"race",name:"race",width:64,height:64,sceneType:"racing"});
    data=createRoomInProject(data,{id:"rear",name:"rear",width:64,height:64,sceneType:"racing"});
    data=updateRoomFieldsInProject(data,"rear",{runtime:{type:"racing",config:{presentation:"pseudo3d",pseudo3dVisuals:{floorTilemapId:"floor.png",horizonY:48}}}});
    rows(data,"assets").push({id:"floor",name:"floor.png",kind:"Background",metadata:{source:"Assets/backgrounds/floor.png",width:128,height:128,colorMode:"8bpp-affine"}});
    const contract=buildEngineExportProjectContract(data).racing_project!;
    const overhead=contract.rooms.find(room=>room.name==="race") as any;
    const rear=contract.rooms.find(room=>room.name==="rear") as any;
    expect(overhead.player.idle_metasprite.asset).toBe("neutral_player_racing_topdown");
    expect(rear.player.idle_metasprite.asset).toBe("neutral_player_racing_rear");
    for(const [direction,index] of [["up",0],["right",4],["down",8],["left",12]] as const) {
      expect(overhead.player.animations[`idle_${direction}`].frame_metasprites[0].parts[0].slice_x).toBe(index*32);
      expect(overhead.player.animations[`drive_${direction}`].frame_metasprites.map((frame:any)=>frame.parts[0].slice_x)).toEqual([(index+1)*32,(index+2)*32]);
      expect(overhead.player.animations[`hurt_${direction}`].loops).toBe(false);
    }
    expect(Object.keys(rear.player.animations)).toEqual(expect.arrayContaining(["idle","drive","steer_left","steer_right","brake","brake_left","brake_right","hurt"]));
    // Centered cars use custom metasprites: the clip indices are local,
    // and the source slices retain the approved packed PNG frame indices.
    expect(rear.player.animations.drive.frame_indices).toEqual([0,1]);
    expect(rear.player.animations.drive.frame_metasprites.map((frame:any)=>frame.parts[0].slice_x)).toEqual([32,64]);
    expect(rear.player.animations.drive.frame_metasprites[0].parts[0]).toMatchObject({x:-16,y:-16,width:32,height:32});
  });
});
