import { describe, expect, it } from "vitest";
import { updateRoomEntityInProject, createRoomInProject } from "./roomsWorkspace.js";
import { buildProjectFromTemplate } from "./projectTemplates.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject, type GBAProjectData } from "./projectFile.js";

describe("commits an entity name", () => {
  function fixture() {
    const base=createRoomInProject(buildProjectFromTemplate("blank",{name:"Rename"}),{id:"room",name:"Room",sceneType:"topdown",width:30,height:20});
    const data={...base,actors:[
      {id:"p",name:"Player",roomName:"Room",x:1,y:1,spriteSheet:"neutral-player-topdown.png"},
      {id:"other",name:"Other",roomName:"Room",x:2,y:2,spriteSheet:"neutral-player-topdown.png"},
      {id:"g",name:"Guard",roomName:"Room",x:3,y:3,spriteSheet:"neutral-player-topdown.png",eventBindings:{onInteract:"hide"}}
    ],triggers:[{id:"t",name:"Door",roomName:"Room",x:5,y:5,eventName:"hide"}],events:[{id:"hide",name:"hide",category:"Ator",roomName:"Room",steps:[
      {command:'set_actor_visible Guard false'}, {command:'if_actor_relative Guard Other right'}, {command:'condition_end'}, {command:'show_dialogue Guard'}
    ]}],dialogues:[{key:"Guard",character:"Guard",text:"Guard",choices:[]}]};
    return data as typeof data & GBAProjectData;
  }
  it("updates actor operands without changing IDs, event bindings or dialogue resources", () => {
    const data=fixture(), before=structuredClone(data);
    const next=updateRoomEntityInProject(data,"actor","g",{name:'Vigia "Norte"'});
    expect((next.actors as typeof data.actors)[2]).toMatchObject({id:"g",name:'Vigia "Norte"',eventBindings:{onInteract:"hide"}});
    expect((next.events as typeof data.events)[0]!.steps.map(s=>s.command)).toEqual([
      `set_actor_visible ${JSON.stringify('Vigia "Norte"')} false`,
      `if_actor_relative ${JSON.stringify('Vigia "Norte"')} Other right`,
      'condition_end','show_dialogue Guard'
    ]);
    expect(next.dialogues).toEqual(data.dialogues);
    expect(data).toEqual(before);
  });
  it("keeps the configured player and the Player command alias after a rename", () => {
    const data=fixture(); data.events[0]!.steps=[{command:'set_actor_direction Player down'}];
    expect(()=>buildEngineExportProjectContract(data)).not.toThrow();
    const next=updateRoomEntityInProject(data,"actor","p",{name:"Explorer"});
    expect((next.rooms as Array<Record<string,unknown>>)[0]!.playerActorName).toBe("Explorer");
    expect((next.events as typeof data.events)[0]!.steps[0]!.command).toBe('set_actor_direction Player down');
    expect(()=>buildEngineExportProjectContract(next)).not.toThrow();
  });
  it("preserves another scene's implicit player when the start-player setting changes", () => {
    const data=fixture(), rooms=data.rooms as Array<Record<string,unknown>>;
    const other:Record<string,unknown>={...structuredClone(rooms[0]!),id:"elsewhere",name:"Elsewhere"}; delete other.playerActorName;
    rooms.push(other);
    data.actors.push({id:"p2",name:"Player",roomName:"Elsewhere",x:1,y:1,spriteSheet:"neutral-player-topdown.png"});
    const general=(data.settings as {general:Record<string,unknown>}).general;
    general.startPlayer="Player"; general.startScene="Room";
    const next=updateRoomEntityInProject(data,"actor","p",{name:"Explorer"});
    expect((next.settings as {general:Record<string,unknown>}).general.startPlayer).toBe("Explorer");
    expect((next.rooms as Array<Record<string,unknown>>)[1]!.playerActorName).toBe("Player");
    expect(()=>buildEngineExportProjectContract(next)).not.toThrow();
    expect(other).not.toHaveProperty("playerActorName");
  });
  it("updates a unique start-player reference even when the game starts in a menu", () => {
    const data=createRoomInProject(fixture(),{id:"title",name:"Title",sceneType:"menu",width:30,height:20});
    const general=(data.settings as {general:Record<string,unknown>}).general;
    general.startPlayer="Player"; general.startScene="Title";
    expect(()=>buildEngineExportProjectContract(data)).not.toThrow();
    const next=updateRoomEntityInProject(data,"actor","p",{name:"Explorer"});
    expect((next.settings as {general:Record<string,unknown>}).general.startPlayer).toBe("Explorer");
    expect(()=>buildEngineExportProjectContract(next)).not.toThrow();
  });
  it("rejects empty and duplicate names, and supports trigger labels", () => {
    const data=fixture();
    expect(updateRoomEntityInProject(data,"actor","g",{name:" "})).toBe(data);
    expect(updateRoomEntityInProject(data,"actor","g",{name:"other"})).toBe(data);
    expect((updateRoomEntityInProject(data,"trigger","t",{name:"Exit"}).triggers as typeof data.triggers)[0]).toMatchObject({id:"t",name:"Exit",eventName:"hide"});
  });
  it("does not reject a position edit that keeps an existing shared Player label", () => {
    const data=createRoomInProject(fixture(),{id:"second",name:"Second",sceneType:"topdown",width:30,height:20});
    const next=updateRoomEntityInProject(data,"actor","p",{name:"Player",x:4});
    expect((next.actors as Array<Record<string,unknown>>).find(actor=>actor.id==="p")).toMatchObject({name:"Player",x:4});
  });
  it("preserves the renamed target across saving, reopening and export", () => {
    const next=updateRoomEntityInProject(fixture(),"actor","g",{name:"Vigia Norte"});
    const reopened=parseGBAProjectFile(serializeGBAProjectFile({data:next,summary:summarizeGBAProject(next)})).data;
    const room=buildEngineExportProjectContract(reopened).topdown_project!.rooms[0]!;
    expect(room.npcs?.map(npc=>npc.name)).toEqual(["Other","Vigia Norte"]);
    expect(room.npcs![1]!.on_interact).toEqual(expect.arrayContaining([{op:"set_actor_visible",actor:1,value:0}]));
  });
});
