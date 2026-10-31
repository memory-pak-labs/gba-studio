/** @vitest-environment happy-dom */
import {cleanup,render,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {buildProjectFromTemplate} from "../shared/projectTemplates";
import {createRoomInProject} from "../shared/roomsWorkspace";
import type {RoomsWorkspaceRoom,RoomsWorkspaceEntity} from "../shared/roomsWorkspace";
import {DungeonScenePreview} from "./DungeonScenePreview";
import * as assetURLs from "../shared/spriteAssetURL";

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it("never renders the disabled first-person hand as a world NPC when looking back",()=>{
  vi.stubGlobal("Image",class {set src(_src:string){}});
  const data=createRoomInProject(buildProjectFromTemplate("blank",{name:"Preview"}),{id:"maze",name:"Maze",sceneType:"dungeonCrawler",width:11,height:11});
  const raw=(data.rooms as Record<string,any>[]).find(r=>r.id==="maze")!;
  const player=(data.actors as Record<string,any>[]).find(a=>a.roomName==="Maze")!;
  raw.playerActorName="";
  const room={...raw,collisionCells:raw.collisionTypes.map((v:string)=>v!=="free")} as RoomsWorkspaceRoom;
  const {container}=render(<DungeonScenePreview room={room} projectData={data} projectPath="/tmp/dungeon/dungeon.gba-project" camera={{x:5,y:8,direction:2}}
    entities={[{...player,kind:"actor",width:1,height:1} as RoomsWorkspaceEntity]}/>);
  expect(container.querySelector("[data-dungeon-actor]")).toBeNull();
  expect(container.querySelector("[data-dungeon-player]")).toBeNull();
});
it.each([[true,false],[false,false],[true,true],[false,true]])("loads local Dungeon images with CORS before reading canvas pixels (generated=%s, Windows=%s)",async (generated,windows)=>{
  const loaded:{src:string;crossOrigin:string}[]=[];
  class LocalImage {
    naturalWidth=64;naturalHeight=64;crossOrigin="";
    onload:(()=>void)|null=null;
    set src(src:string){loaded.push({src,crossOrigin:this.crossOrigin});queueMicrotask(()=>this.onload?.());}
  }
  vi.stubGlobal("Image",LocalImage);
  if(windows)vi.spyOn(assetURLs,"resolveAssetURL").mockReturnValue("file:///C%3A/Meu%20jogo/Assets/material.png");
  vi.stubGlobal("ImageData",class {constructor(public data:Uint8ClampedArray,public width:number,public height:number){}});
  const put=vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({
    drawImage:vi.fn(),clearRect:vi.fn(),putImageData:put,
    getImageData:(_x:number,_y:number,w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4).fill(255)})
  } as unknown as CanvasRenderingContext2D);
  const data=createRoomInProject(buildProjectFromTemplate("blank",{name:"Preview"}),{id:"maze",name:"Maze",sceneType:"dungeonCrawler",width:11,height:11});
  const raw=(data.rooms as Record<string,any>[]).find(r=>r.id==="maze")!;
  if(!generated)delete raw.runtime.config.presentation;
  const room={...raw,collisionCells:raw.collisionTypes.map((v:string)=>v!=="free")} as RoomsWorkspaceRoom;
  render(<DungeonScenePreview room={room} projectData={data} projectPath="/tmp/dungeon/dungeon.gba-project" entities={[]}/>);
  await waitFor(()=>expect(put).toHaveBeenCalled());
  expect(loaded).toHaveLength(generated?8:1);
  expect(loaded.map(image=>image.crossOrigin)).toEqual(Array(generated?8:1).fill("anonymous"));
  expect(loaded.every(image=>image.src.startsWith("gba-asset:"))).toBe(true);
  if(windows)expect(assetURLs.parseDesktopAssetURL(loaded[0].src)).toBe("C:/Meu jogo/Assets/material.png");
});
