/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoomsWorkspaceEntity, RoomsWorkspaceRoom } from "../shared/roomsWorkspace/core";
import { DungeonViewportEditor } from "./DungeonViewportEditor";
import { buildProjectFromTemplate } from "../shared/projectTemplates";
import { createRoomInProject, deriveRoomsWorkspacePresentation } from "../shared/roomsWorkspace";
afterEach(cleanup);
const room = {id:"maze",width:19,height:19,collisionCells:Array(361).fill(false)} as RoomsWorkspaceRoom;
const enemy = {id:"enemy",name:"Sentinela",kind:"actor",roomName:"maze",x:9,y:8,width:1,height:1} as RoomsWorkspaceEntity;
function props() { return {room,entities:[enemy],camera:{x:9,y:9,direction:0},scale:2.5,mode:"actor",locked:false,selected:[],onSelect:vi.fn(),onMove:vi.fn(),onPlace:vi.fn()}; }
function surface() {
  const element=screen.getByLabelText("Canvas editável Dungeon · 240 × 160");
  vi.spyOn(element,"getBoundingClientRect").mockReturnValue({left:10,top:20,width:600,height:400} as DOMRect);
  return element;
}
describe("Dungeon camera is an editing canvas",()=>{
  it("keeps a disabled first-person hand out of world handles when the camera looks back",()=>{
    const data=createRoomInProject(buildProjectFromTemplate("blank",{name:"Hands"}),{id:"hands",name:"Hands",sceneType:"dungeonCrawler",width:11,height:11});
    const raw=(data.rooms as Record<string,any>[]).find(r=>r.id==="hands")!;
    const player=(data.actors as Record<string,any>[]).find(a=>a.roomName==="Hands")!;
    raw.playerActorName="";
    render(<DungeonViewportEditor {...props()} projectData={data} room={deriveRoomsWorkspacePresentation(data).rooms.find(r=>r.id==="hands")!}
      entities={[{...player,kind:"actor",width:1,height:1} as RoomsWorkspaceEntity]} camera={{x:5,y:8,direction:2}}/>);
    expect(screen.queryByRole("button",{name:/Selecionar Player/})).toBeNull();
  });
  it("moves the optional first-person player in viewport pixels, independently from cells and camera",()=>{
    const data=createRoomInProject(buildProjectFromTemplate("blank",{name:"Hands"}),{id:"hands",name:"Hands",sceneType:"dungeonCrawler",width:30,height:20});
    const raw=(data.rooms as Record<string,any>[]).find(r=>r.id==="hands")!;
    const player=(data.actors as Record<string,any>[]).find(a=>a.roomName==="Hands")!;
    const p={...props(),projectData:data,room:{...raw,collisionCells:raw.collisionTypes.map((v:string)=>v!=="free")} as RoomsWorkspaceRoom,
      entities:[{...player,kind:"actor",width:1,height:1} as RoomsWorkspaceEntity],camera:{x:5,y:9,direction:0}};
    const view=render(<DungeonViewportEditor {...p}/>);
    const canvas=surface(),handle=screen.getByRole("button",{name:"Selecionar Player · primeira pessoa"});
    fireEvent.pointerDown(handle,{button:0,pointerId:1,clientX:510,clientY:200});
    fireEvent.pointerMove(canvas,{pointerId:1,clientX:530,clientY:190});
    fireEvent.pointerUp(canvas,{pointerId:1,clientX:530,clientY:190});
    expect(p.onMove).toHaveBeenCalledExactlyOnceWith("actor",player.id,{dungeonViewAnchor:{x:208,y:116}});
    expect(raw.runtime.config.playerStart).toEqual({x:5,y:9,direction:"up"});
    view.rerender(<DungeonViewportEditor {...p} camera={{x:4,y:8,direction:2}}/>);
    expect(screen.getByRole("button",{name:"Selecionar Player · primeira pessoa"}).style.left).toBe("440px");
    view.rerender(<DungeonViewportEditor {...p} showActors={false}/>);
    expect(screen.queryByRole("button",{name:"Selecionar Player · primeira pessoa"})).toBeNull();
  });
  it("selects an enemy and commits a drag to a logical cell at fractional zoom, once",()=>{
    const p=props();render(<DungeonViewportEditor {...p}/>);const canvas=surface(),actor=screen.getByRole("button",{name:/Selecionar Sentinela/});
    fireEvent.pointerDown(actor,{button:0,pointerId:1,clientX:310,clientY:170});
    expect(p.onSelect).toHaveBeenCalledWith(["actor:enemy"]);
    fireEvent.pointerMove(canvas,{pointerId:1,clientX:310,clientY:110});expect(p.onMove).not.toHaveBeenCalled();
    fireEvent.pointerUp(canvas,{pointerId:1,clientX:310,clientY:110});
    expect(p.onMove).toHaveBeenCalledExactlyOnceWith("actor","enemy",{x:9,y:7});
  });
  it("adds actors using visible floor cells, without changing camera start",()=>{
    const p=props();render(<DungeonViewportEditor {...p}/>);
    fireEvent.click(screen.getByRole("button",{name:"Célula 9, 7 · passagem"}));
    expect(p.onPlace).toHaveBeenCalledExactlyOnceWith({x:9,y:7});expect(p.onMove).not.toHaveBeenCalled();
  });
  it("cancels invalid drops, Escape, and layer-locked movement",()=>{
    const p=props(),view=render(<DungeonViewportEditor {...p}/>);let canvas=surface();
    const drag=()=>fireEvent.pointerDown(screen.getByRole("button",{name:/Selecionar Sentinela/}),{button:0,pointerId:1,clientX:310,clientY:170});
    drag();fireEvent.pointerMove(canvas,{pointerId:1,clientX:310,clientY:450});fireEvent.pointerUp(canvas,{pointerId:1,clientX:310,clientY:450});
    drag();fireEvent.pointerMove(canvas,{pointerId:1,clientX:310,clientY:110});fireEvent.keyDown(canvas,{key:"Escape"});fireEvent.pointerUp(canvas,{pointerId:1,clientX:310,clientY:110});
    view.rerender(<DungeonViewportEditor {...p} locked/>);canvas=surface();drag();fireEvent.pointerMove(canvas,{pointerId:1,clientX:310,clientY:110});fireEvent.pointerUp(canvas,{pointerId:1,clientX:310,clientY:110});
    expect(p.onMove).not.toHaveBeenCalled();expect(p.onPlace).not.toHaveBeenCalled();
  });
  it("respects the selected entity layer lock in Select mode",()=>{
    const p=props();render(<DungeonViewportEditor {...p} mode="select" actorsLocked/>);const canvas=surface();
    fireEvent.pointerDown(screen.getByRole("button",{name:/Selecionar Sentinela/}),{button:0,pointerId:1,clientX:310,clientY:170});
    fireEvent.pointerMove(canvas,{pointerId:1,clientX:310,clientY:110});fireEvent.pointerUp(canvas,{pointerId:1,clientX:310,clientY:110});
    expect(p.onSelect).toHaveBeenCalledWith(["actor:enemy"]);expect(p.onMove).not.toHaveBeenCalled();
  });
  it("honors grid and actor visibility and leaves HUD controls interactive",()=>{
    const p=props();render(<DungeonViewportEditor {...p} showGrid={false} showActors={false}><button>Editar HUD</button></DungeonViewportEditor>);
    expect(screen.queryByLabelText("Grade de tiles · 8 × 8 px")).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:/Selecionar Sentinela/})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Editar HUD"}));expect(p.onPlace).not.toHaveBeenCalled();
  });
});
