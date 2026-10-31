import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createActorInProject, createRoomInProject, renameRoomInProject, updateRoomEntityInProject, updateRoomFieldsInProject } from "../shared/roomsWorkspace.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject } from "../shared/projectFile.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
import { dungeonPlayerVisual } from "../shared/dungeonSceneView.js";

const records = (v: unknown) => v as Record<string, any>[];
function fixture() {
  const data = createRoomInProject(buildProjectFromTemplate("blank", { name: "Orange dungeon" }), {
    id: "maze", name: "Maze", sceneType: "dungeonCrawler", width: 30, height: 20
  });
  return { data, room: records(data.rooms).find(r => r.id === "maze")! };
}
const exported = (data: ReturnType<typeof fixture>["data"]) => buildEngineExportProjectContract(data).dungeon_crawler_project!.rooms.find(r => r.name === "Maze")! as any;

describe("approved orange dungeon and optional first-person player", () => {
  it("creates the approved corridor layout instead of a border-only empty hall",()=>{
    const {data,room}=fixture();
    expect(room.collisionTypes.filter((v:string)=>v==="free")).toHaveLength(52);
    expect(room.collisionTypes[6*11+5]).toBe("solid");
    expect(room.collisionTypes[8*11+5]).toBe("free");
    expect(room.runtime.config.presentation.door).toEqual({x:5,y:6});
    expect(exported(data).presentation.view_recipe.cells).toEqual(room.collisionTypes.map((v:string)=>v!=="free"));
    expect(exported(data).presentation.view_recipe.door).toEqual({x:5,y:6});
    const edited=renameRoomInProject(data,"maze","My maze");
    expect(records(edited.rooms).find(r=>r.id==="maze")?.collisionTypes).toEqual(room.collisionTypes);
  });
  it("keeps newly placed world NPCs separate from the first-person hand default",()=>{
    const {data}=fixture();
    const next=createActorInProject(data,{id:"npc",name:"Guard",roomID:"maze",x:5,y:8});
    expect(records(next.actors).find(a=>a.id==="npc")).toMatchObject({
      spriteSheet:"neutral-dungeon-guard-near.png", animationName:"idle",
      dungeonDepthSheets:{near:"neutral-dungeon-guard-near.png",mid:"neutral-dungeon-guard-mid.png",far:"neutral-dungeon-guard-far.png"},
      dungeonDepthAnimationName:"idle"
    });
    expect(exported(next).actors).toHaveLength(1);
    const frames=exported(next).actors[0].depth_frames;
    expect(frames.near).toMatchObject({frame_indices:[0]});
    expect(frames.near.frame_metasprites[0].parts).toEqual([
      expect.objectContaining({x:-32,y:-128,width:64,height:64}),
      expect.objectContaining({x:-32,y:-64,width:64,height:64})
    ]);
    expect(frames.mid.frame_metasprites[0].parts).toEqual([expect.objectContaining({x:-16,y:-64,width:32,height:64})]);
    expect(frames.far.frame_metasprites[0].parts).toEqual([expect.objectContaining({x:-8,y:-32,width:16,height:32})]);
    expect(exported(next).player_view).toBeDefined();
    const reopened=parseGBAProjectFile(serializeGBAProjectFile({data:next,summary:summarizeGBAProject(next)})).data;
    expect(exported(reopened).actors).toEqual(exported(next).actors);
  });
  it("preserves an explicitly chosen custom NPC sprite without attaching the guard depths",()=>{
    const {data}=fixture();
    const next=createActorInProject(data,{id:"custom",name:"Custom",roomID:"maze",x:5,y:8,spriteSheet:"neutral-player-topdown.png",animationName:"idle_down"});
    expect(records(next.actors).find(a=>a.id==="custom")).toMatchObject({spriteSheet:"neutral-player-topdown.png",animationName:"idle_down"});
    expect(records(next.actors).find(a=>a.id==="custom")?.dungeonDepthSheets).toBeUndefined();
    expect(exported(next).actors[0].depth_frames.near.frame_metasprites[0].parts).toEqual([expect.objectContaining({width:32,height:32})]);
  });
  it("can still add an NPC to older blank projects without the new guard library",()=>{
    const {data}=fixture();
    for(const key of ["assets","animations","animationStates"] as const)data[key]=records(data[key]).filter(record=>!String(key==="assets"?record.name:record.spriteSheet).startsWith("neutral-dungeon-guard-"));
    data.assetGroups=records(data.assetGroups).filter(group=>group.id!=="asset-group-neutral-dungeon-npcs");
    const next=createActorInProject(data,{id:"legacy",name:"Legacy",roomID:"maze",x:5,y:8});
    expect(records(next.actors).find(a=>a.id==="legacy")?.spriteSheet).toBe("neutral-player-topdown.png");
    expect(exported(next).player_view).toBeDefined();
  });
  it("binds approved materials and a native hand without making the hand a world NPC", () => {
    const { data, room } = fixture();
    expect(room.runtime.config.presentation.materialAssets).toEqual([
      "neutral-dungeon-wall.png", "neutral-dungeon-wall.png", "neutral-dungeon-wall.png", "neutral-dungeon-wall.png",
      "neutral-dungeon-floor.png", "neutral-dungeon-ceiling.png", "neutral-dungeon-door.png", "neutral-dungeon-floor.png"
    ]);
    const player = records(data.actors).find(a => a.roomName === "Maze" && a.name === room.playerActorName)!;
    expect(player.spriteSheet).toBe("neutral-player-dungeon-hand.png");
    expect(player.dungeonViewAnchor).toEqual({ x: 200, y: 120 });
    const result = exported(data);
    expect(result.player_view).toMatchObject({ position_pixels: { x: 200, y: 120 }, metasprite: { asset: expect.any(String) } });
    expect(result.presentation.view_recipe.material_assets).toHaveLength(8);
    expect(result.actors ?? []).toHaveLength(0);
    expect(dungeonPlayerVisual(data, room)).toMatchObject({ x: 176, y: 64, width: 64, height: 64 });
  });

  it("can hide the hand while keeping navigation, the selected actor and orange materials", () => {
    let { data, room } = fixture();
    data = updateRoomFieldsInProject(data, "maze", { runtime: { type: "dungeonCrawler", config: {
      ...room.runtime.config, presentation: { ...room.runtime.config.presentation, playerView: { enabled: false } }
    } } });
    const result = exported(data);
    expect(result.player_view).toBeUndefined();
    expect(result.actors ?? []).toHaveLength(0);
    expect(result.presentation.view_recipe.material_assets).toHaveLength(8);
    expect(result.player_start).toEqual({ x: 5, y: 9, direction: "north" });
  });

  it("saves the screen anchor independently from the player's logical cell and camera", () => {
    let { data, room } = fixture();
    const player = records(data.actors).find(a => a.roomName === "Maze" && a.name === room.playerActorName)!;
    const position = { x: player.x, y: player.y };
    data = updateRoomEntityInProject(data, "actor", player.id, { dungeonViewAnchor: { x: 160, y: 110 } });
    const reopened = parseGBAProjectFile(serializeGBAProjectFile({ summary: summarizeGBAProject(data), data })).data;
    const actor = records(reopened.actors).find(a => a.id === player.id)!;
    expect({ x: actor.x, y: actor.y }).toEqual(position);
    expect(exported(reopened).player_view.position_pixels).toEqual({ x: 160, y: 110 });
    const reopenedRoom = records(reopened.rooms).find(r => r.id === "maze")!;
    expect(dungeonPlayerVisual(reopened, reopenedRoom)).toMatchObject({ x: 136, y: 54 });
    expect(reopenedRoom.runtime.config.playerStart).toEqual(room.runtime.config.playerStart);
  });

  it("keeps the no-player choice even if a default actor named Player remains in the room", () => {
    const { data } = fixture();
    const next = updateRoomFieldsInProject(data, "maze", { playerActorName: "" });
    expect(exported(next).player_view).toBeUndefined();
    expect(dungeonPlayerVisual(next, records(next.rooms).find(r => r.id === "maze")!)).toBeNull();
  });
  it("never promotes the former first-person hand to a world NPC after choosing another player",()=>{
    const {data}=fixture();
    const next=updateRoomFieldsInProject(createActorInProject(data,{id:"replacement",name:"Replacement",roomID:"maze",x:5,y:8}),"maze",{playerActorName:"Replacement"});
    expect(exported(next).player_view).toBeDefined();
    expect(exported(next).actors ?? []).toHaveLength(0);
  });
  it("allows the author to disable the optional Dungeon player default for future rooms",()=>{
    const data=buildProjectFromTemplate("blank",{name:"No hands"});
    (data.settings as any).sceneTypes.defaultPlayerSprites.dungeonCrawler="";
    const next=createRoomInProject(data,{id:"maze",name:"Maze",sceneType:"dungeonCrawler",width:30,height:20});
    expect(records(next.actors).filter(a=>a.roomName==="Maze")).toHaveLength(0);
    expect(exported(next).player_view).toBeUndefined();
  });
  it("keeps the optional player in bounds when shrinking the logical grid, without moving its screen anchor",()=>{
    const {data}=fixture();
    const next=updateRoomFieldsInProject(data,"maze",{width:9,height:7});
    const room=records(next.rooms).find(r=>r.id==="maze")!;
    const player=records(next.actors).find(a=>a.roomName==="Maze"&&a.name===room.playerActorName)!;
    expect(player).toMatchObject({x:5,y:5,dungeonViewAnchor:{x:200,y:120}});
    expect(room.runtime.config.playerStart).toMatchObject({x:5,y:5});
    expect(room.collisionTypes[player.y*room.width+player.x]).toBe("free");
    expect(exported(next)).toMatchObject({width_tiles:9,height_tiles:7,player_view:{position_pixels:{x:200,y:120}}});
  });
  it("can shrink after choosing no player without leaving an invalid hidden visual actor",()=>{
    const {data}=fixture();
    const next=updateRoomFieldsInProject(data,"maze",{playerActorName:"",width:9,height:7});
    expect(exported(next).player_view).toBeUndefined();
    expect(records(next.actors).find(a=>a.roomName==="Maze")?.dungeonViewAnchor).toEqual({x:200,y:120});
  });
});
