import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { createBlankProjectData } from "./newProject.js";
import type { GBAProjectData } from "./projectFile.js";

describe("native scale event export",()=>{
  it("exports Player and an actor with spaces as independent instance slots",()=>{
    const data=createBlankProjectData({name:"Scale"});
    const room=(data.rooms as Record<string,unknown>[])[0]!;
    const actors=data.actors as Record<string,unknown>[];
    const npc={...actors[0],id:"guard",name:"Guarda do Porto"}; actors.push(npc);
    room.eventBindings={onInit:"scale"};
    data.events=[{name:"scale",category:"Ator",steps:[{command:'set_actor_scale Player 150 75'},{command:'animate_actor_scale "Guarda do Porto" 50 200 12'},{command:'reset_actor_scale Player'}]}];
    const contract=buildEngineExportProjectContract(data);
    const json=JSON.stringify(contract);
    expect(json).toContain('"op":"set_actor_scale","actor":-1,"x":384,"y":192,"frames":0');
    expect(json).toContain('"actor":0,"x":128,"y":512,"frames":12');
    expect(contract.requires.features).toContain("events.visual_scale");
    expect((data.animations as Record<string,unknown>[]).every(row=>row.scaleX===undefined)).toBe(true);
  });
  it("rejects regular backgrounds even through called events",()=>{
    const data=createBlankProjectData({name:"Scale"});
    (data.rooms as Record<string,unknown>[])[0]!.eventBindings={onInit:"parent"};
    data.events=[{name:"parent",category:"Ator",steps:[{command:'call_event scale'}]},{name:"scale",category:"Ator",steps:[{command:'set_background_scale BG2 150 75'}]}];
    expect(()=>buildEngineExportProjectContract(data)).toThrow(/camada affine preparada/);
  });
  it("exports scale only for the prepared affine layer",()=>{
    const data=createBlankProjectData({name:"Affine"});
    const room=(data.rooms as Record<string,unknown>[])[0]!;
    data.assets=[...(data.assets as object[]),{id:"affine",name:"qa-affine.png",kind:"Background",colorMode:"8bpp-affine",metadata:{kind:"affine_bg",colorMode:"8bpp-affine",width:128,height:128}}];
    room.runtime={type:"topdown",config:{affine:{enabled:true,assetId:"qa-affine.png",layer:"BG2",scaleX:1,scaleY:1,wrap:true}}};
    room.eventBindings={onInit:"scale"};
    data.events=[{name:"scale",category:"Cena",steps:[{command:"animate_background_scale BG2 200 100 30"}]}];
    expect(JSON.stringify(buildEngineExportProjectContract(data))).toContain('"op":"set_background_scale","actor":2,"x":512,"y":256,"frames":30');
  });
  it("resolves renderable actors in the native scene profiles",()=>{
    const canonical=JSON.parse(readFileSync('default-assets/templates/exemplo-gba/exemplo-gba.gba-project','utf8')) as GBAProjectData;
    const data=structuredClone(canonical);
    for(const type of ['topdown','platformer','isometric','dungeonCrawler','racing','pointAndClick','shmup','menu','cutscene','battleRpg','luta']){
      const rooms=data.rooms as Record<string,unknown>[];
      const room=rooms.find(row=>row.sceneType===type && (data.actors as Record<string,unknown>[]).some(a=>a.roomName===row.name && a.spriteSheet));
      if(!room)throw Error('Missing fixture '+type);
      const actor=(data.actors as Record<string,unknown>[]).find(a=>a.roomName===room.name && a.spriteSheet && (type!=='battleRpg' && type!=='luta' || ['party','enemy','player1','player2'].includes((a.battle as Record<string,unknown>)?.side as string)));
      if(!actor)throw Error('Missing actor '+type);
      data.events=[...(data.events as object[]),{name:'scale_'+type,category:'Ator',sceneName:room.name,steps:[{command:'set_actor_scale '+JSON.stringify(actor.id)+' 125 75'}]}];
      room.eventBindings={...(room.eventBindings as object),onInit:'scale_'+type};
    }
    const contract=buildEngineExportProjectContract(data);
    expect(contract.requires.features).toContain("events.visual_scale");
    for(const [key,project] of Object.entries(contract).filter(([key])=>key.endsWith("_project") && !["mixed_project","world_map_project","visual_novel_project"].includes(key))) {
      expect(JSON.stringify(project),key).toContain('"op":"set_actor_scale"');
    }
  });
});
