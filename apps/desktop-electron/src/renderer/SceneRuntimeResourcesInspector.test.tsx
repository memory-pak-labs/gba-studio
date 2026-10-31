/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useState } from "react";
import { buildProjectFromTemplate } from "../shared/projectTemplates";
import { createActorInProject, createRoomInProject, updateRoomEntityInProject, updateRoomFieldsInProject } from "../shared/roomsWorkspace";
import { normalizeSceneRuntime } from "../shared/sceneTypeProfiles";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject } from "../shared/projectFile";
import { buildEngineExportProjectContract } from "../main/exportEngineProject";
import { ActorRuntimeResourcesInspector, SceneRuntimeResourcesInspector } from "./SceneRuntimeResourcesInspector";

afterEach(cleanup);
type Row = Record<string, any>;
const rows = (value:unknown) => value as Row[];

it("authors a wall-mounted Dungeon actor and preserves it through save and export", () => {
  let result=createRoomInProject(buildProjectFromTemplate("blank",{name:"Panels"}),{id:"maze",name:"Maze",sceneType:"dungeonCrawler",width:11,height:11});
  result=createActorInProject(result,{id:"panel",name:"Panel",roomID:"maze",x:2,y:2});
  function Harness(){
    const [data,setData]=useState(result);result=data;
    return <ActorRuntimeResourcesInspector sceneType="dungeonCrawler" actorID="panel" data={data} onChange={fields=>setData(updateRoomEntityInProject(data,"actor","panel",fields))}/>;
  }
  render(<Harness/>);fireEvent.click(screen.getByText("Recursos do ator"));
  fireEvent.click(screen.getByRole("checkbox",{name:"Fixado à parede"}));
  const saved=parseGBAProjectFile(serializeGBAProjectFile({data:result,summary:summarizeGBAProject(result)})).data;
  expect(rows(saved.actors).find(a=>a.id==='panel')?.dungeonWallMounted).toBe(true);
  expect(rows(saved.actors).find(a=>a.id==='panel')?.x).toBe(2);
});

it("edits Dungeon resources and preserves them through save and export", () => {
  let result=createRoomInProject(buildProjectFromTemplate("blank",{name:"Resources"}),{id:"maze",name:"Maze",sceneType:"dungeonCrawler",width:11,height:11});
  function Harness(){
    const [data,setData]=useState(result);result=data;
    const room=rows(data.rooms).find(r=>r.id==="maze")!;
    return <SceneRuntimeResourcesInspector sceneType="dungeonCrawler" roomName="Maze" background="" config={room.runtime.config} data={data}
      onChange={config=>setData(updateRoomFieldsInProject(data,"maze",{runtime:normalizeSceneRuntime("dungeonCrawler",{type:"dungeonCrawler",config})}))}/>;
  }
  render(<Harness/>);
  fireEvent.click(screen.getByText("Recursos da cena"));
  fireEvent.click(screen.getByRole("checkbox",{name:"Mostrar ator do jogador em primeira pessoa"}));
  fireEvent.blur(screen.getByRole("textbox",{name:"Nome na HUD do labirinto"}),{target:{value:"Ari"}});
  fireEvent.click(screen.getByRole("checkbox",{name:"Inventário do labirinto"}));
  fireEvent.change(screen.getByRole("spinbutton",{name:"Quantidade inicial"}),{target:{value:"3"}});
  const saved=parseGBAProjectFile(serializeGBAProjectFile({data:result,summary:summarizeGBAProject(result)})).data;
  const project=buildEngineExportProjectContract(saved).dungeon_crawler_project!;
  expect(project.rooms[0]?.presentation?.player_label).toBe("Ari");
  expect(project.inventory_enabled).toBe(true);
  expect(project.inventory_items?.[0]?.initial_quantity).toBe(3);
  expect(project.rooms[0]?.player_view).toBeUndefined();
});

it("starts a paged isometric world with the current background", () => {
  const data=createRoomInProject(buildProjectFromTemplate("blank",{name:"World"}),{id:"iso",name:"Iso",sceneType:"isometricAdventure",width:30,height:20});
  const room=rows(data.rooms).find(r=>r.id==="iso")!;let result:Row={};
  render(<SceneRuntimeResourcesInspector sceneType="isometric" roomName="Iso" background={room.backgroundAssetName} config={room.runtime.config} data={data} onChange={config=>{result=config;}}/>);
  fireEvent.click(screen.getByText("Recursos da cena"));
  fireEvent.change(screen.getByRole("combobox",{name:"Composição isométrica"}),{target:{value:"paged"}});
  expect(result.pagedSurface.backgroundAsset).toBe(room.backgroundAssetName);
  expect(normalizeSceneRuntime("isometric",{type:"isometric",config:result}).config).toMatchObject({worldMode:"scrollable_tiled_world",pagedSurface:{backgroundAsset:room.backgroundAssetName}});
});

it("authors a SHMUP wave and assigns a new enemy to it", () => {
  let result=createRoomInProject(buildProjectFromTemplate("blank",{name:"Waves"}),{id:"sky",name:"Sky",sceneType:"shmup",width:30,height:20});
  result=createActorInProject(result,{id:"enemy",name:"Enemy",roomID:"sky",x:24,y:8});
  function Harness(){
    const [data,setData]=useState(result);result=data;
    const room=rows(data.rooms).find(r=>r.id==="sky")!;
    return <><SceneRuntimeResourcesInspector sceneType="shmup" roomName="Sky" background="" config={room.runtime.config} data={data}
      onChange={config=>setData(updateRoomFieldsInProject(data,"sky",{runtime:normalizeSceneRuntime("shmup",{type:"shmup",config})}))}/>
      <ActorRuntimeResourcesInspector sceneType="shmup" actorID="enemy" data={data} onChange={fields=>setData(updateRoomEntityInProject(data,"actor","enemy",fields))}/></>;
  }
  render(<Harness/>);
  fireEvent.click(screen.getByText("Recursos da cena"));
  fireEvent.click(screen.getByRole("button",{name:"Adicionar onda"}));
  fireEvent.click(screen.getByRole("button",{name:"Adicionar onda"}));
  fireEvent.click(screen.getByText("Recursos do ator"));
  fireEvent.change(screen.getByRole("spinbutton",{name:"Onda do inimigo"}),{target:{value:"2"}});
  fireEvent.change(screen.getByRole("spinbutton",{name:"HP do inimigo"}),{target:{value:"7"}});
  expect(rows(result.actors).find(a=>a.id==="enemy")).toMatchObject({waveIndex:1,shmup:{health:7}});
  const exported=buildEngineExportProjectContract(result).shmup_project!;
  expect(exported.waves).toHaveLength(2);
  expect(exported.waves[1]?.enemies?.[0]).toMatchObject({health:7});
});
