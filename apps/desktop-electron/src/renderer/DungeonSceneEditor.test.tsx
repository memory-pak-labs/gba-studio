/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DungeonSceneEditor } from "./DungeonSceneEditor";
import type { RoomsWorkspaceRoom } from "../shared/roomsWorkspace/core";
vi.mock("./DungeonScenePreview", () => ({
  dungeonStart: () => ({ x: 1, y: 1, direction: 0 }),
  DungeonScenePreview: ({ camera }: { camera: { x:number;y:number;direction:number } }) => <div role="img" aria-label={`Vista ${camera.x},${camera.y},${camera.direction}`} />
}));
afterEach(cleanup);
function props() {
  return { room: { id:"dungeon",name:"maze",width:3,height:3,collisionCells:[true,true,true,true,false,false,true,true,true],runtime:{type:"dungeonCrawler",config:{playerStart:{x:1,y:1,direction:"up"}}} } as unknown as RoomsWorkspaceRoom,
    entities:[],mode:"select",tool:"brush" as const,collision:"solid" as const,locked:false,selected:[],viewMode:"viewport" as const,previewVisible:true,onClosePreview:vi.fn(),renderHud:()=>null,
    onSelect:vi.fn(),onCell:vi.fn(),onCollision:vi.fn(),onFill:vi.fn(),onUpdate:vi.fn(),onEntity:vi.fn() };
}
describe("Dungeon follows the scene editor view contract",()=>{
  it("defaults to the camera and exposes the entire maze only in Map mode",()=>{
    const p=props(),view=render(<DungeonSceneEditor {...p}/>);
    expect(screen.getAllByLabelText("Vista 1,1,0")).toHaveLength(2);
    expect(screen.getByRole("complementary",{name:"Prévia e minimapa da cena"})).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    view.rerender(<DungeonSceneEditor {...p} previewVisible={false}/>);
    expect(screen.getAllByLabelText("Vista 1,1,0")).toHaveLength(1);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    view.rerender(<DungeonSceneEditor {...p} viewMode="map"/>);
    expect(screen.getAllByRole("gridcell")).toHaveLength(9);
    expect(screen.getByRole("complementary",{name:"Prévia e minimapa da cena"})).toBeInTheDocument();
  });
  it("inspects temporary camera cells without changing the saved start",()=>{
    const p=props();render(<DungeonSceneEditor {...p} viewMode="map"/>);
    fireEvent.click(screen.getByRole("gridcell",{name:"Célula 2, 1 · passagem"}));
    expect(screen.getByLabelText("Vista 2,1,0")).toBeInTheDocument();expect(p.onUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Definir como início"}));
    expect(p.onUpdate).toHaveBeenCalledWith("dungeon",expect.objectContaining({runtime:expect.objectContaining({config:expect.objectContaining({playerStart:{x:2,y:1,direction:"up"}})})}));
  });
  it("selects the newly placed actor and opens its existing inspector workflow",()=>{
    const p=props(),onCreateActor=vi.fn(()=>"new-enemy");
    const room={...p.room,width:3,height:3,collisionCells:Array(9).fill(false)};
    render(<DungeonSceneEditor {...p} room={room} mode="actor" onCreateActor={onCreateActor}/>);
    fireEvent.click(screen.getByRole("button",{name:"Célula 1, 0 · passagem"}));
    expect(onCreateActor).toHaveBeenCalledWith({roomID:"dungeon",x:1,y:0});
    expect(p.onSelect).toHaveBeenCalledWith(["actor:new-enemy"]);
  });
  it("edits a wall using the existing project collision callback and respects locks",()=>{
    const p=props(),v=render(<DungeonSceneEditor {...p} viewMode="map" mode="collision"/>);
    fireEvent.click(screen.getByRole("gridcell",{name:"Célula 2, 1 · passagem"}));expect(p.onCollision).toHaveBeenCalledWith("dungeon",5,"solid",undefined);
    p.onCollision.mockClear();v.rerender(<DungeonSceneEditor {...p} viewMode="map" mode="collision" locked/>);
    fireEvent.click(screen.getByRole("gridcell",{name:"Célula 2, 1 · passagem"}));expect(p.onCollision).not.toHaveBeenCalled();
  });
});
