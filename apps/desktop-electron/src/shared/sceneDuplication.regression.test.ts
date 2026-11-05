import { describe, expect, it } from "vitest";
import { duplicateRoomInProject, createRoomInProject } from "./roomsWorkspace.js";
import { buildProjectFromTemplate } from "./projectTemplates.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject } from "./projectFile.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { validateGBAProjectMigrationContract } from "../../../../packages/project-contract/src/index.js";

function fixture() {
  return {
    rooms: [{ id:"source", name:"Porto", width:30, height:20, playerActorName:"Player", hudPresetId:"my-hud", eventBindings:{onInit:"boot"}, cameraZones:[{id:"camera",x:1,y:2,width:5,height:4}] }],
    actors: [
      {id:"player",name:"Player",roomName:"Porto",x:2,y:3,spriteSheet:"hero.png"},
      {id:"guard",name:"Guard",roomName:"Porto",x:4,y:5,eventBindings:{onInteract:"talk"}},
      {id:"outside",name:"Outside",roomName:"Elsewhere",x:1,y:1}
    ],
    triggers:[{id:"door",name:"Door",roomName:"Porto",x:7,y:8,width:2,height:1,eventName:"talk"}],
    events:[
      {id:"boot-id",name:"boot",roomName:"Porto",steps:[{id:"s1",command:"call_event talk"}]},
      {id:"talk-id",name:"talk",steps:[{id:"s2",command:'set_actor_visible Guard false'},{id:"s3",command:'if_actor_relative guard Player right'},{command:'change_scene Porto 2 3 down'},{command:'change_scene Elsewhere 1 2 up'},{command:'call_event boot'}]},
      {id:"unrelated",name:"unrelated",steps:[{command:'set_actor_visible Guard true'}]}
    ],
    connections:[{from:"Porto",to:"Elsewhere",eventName:"talk"},{from:"Elsewhere",to:"Porto",eventName:"unrelated"}],
    audioItems:[{id:"music",name:"Theme",assignedScene:"Porto",filePath:"Assets/audio/theme.wav"}]
  };
}

describe("complete authored scene duplication", () => {
  it("copies scene entities and audio ownership with new identities and independent nested data", () => {
    const data=fixture(), before=structuredClone(data);
    const copy=duplicateRoomInProject(data,{sourceRoomID:"source",newRoomID:"copy",newName:"Porto Copy"});
    const actors=(copy.actors as typeof data.actors).filter(a=>a.roomName==="Porto Copy");
    expect(actors).toHaveLength(2);
    expect(actors.map(a=>[a.x,a.y])).toEqual([[2,3],[4,5]]);
    expect(new Set((copy.actors as typeof data.actors).map(a=>a.id)).size).toBe(5);
    const room=(copy.rooms as typeof data.rooms)[1]!;
    expect(room.playerActorName).toBe(actors[0]!.name);
    expect(room.hudPresetId).toBe("my-hud");
    expect((copy.triggers as typeof data.triggers).find(t=>t.roomName==="Porto Copy")).toMatchObject({x:7,y:8,width:2,height:1});
    expect((copy.audioItems as typeof data.audioItems).filter(a=>a.assignedScene==="Porto Copy")).toHaveLength(1);
    room.cameraZones[0]!.x=99;
    expect((copy.rooms as typeof data.rooms)[0]!.cameraZones[0]!.x).toBe(1);
    expect(data).toEqual(before);
  });

  it("copies reachable scripts once, rewires only copy references and preserves incoming routes and resources", () => {
    const data=fixture();
    const copy=duplicateRoomInProject(data,{sourceRoomID:"source",newRoomID:"copy",newName:"Porto Copy"});
    const actors=(copy.actors as typeof data.actors).filter(a=>a.roomName==="Porto Copy"), room=(copy.rooms as typeof data.rooms)[1]!;
    const events=copy.events as typeof data.events;
    const boot=events.find(e=>e.name===room.eventBindings.onInit)!;
    expect(boot.name).not.toBe("boot");
    const talk=events.find(e=>e.name===actors[1]!.eventBindings!.onInteract)!;
    expect(events).toHaveLength(5);
    expect(boot.steps[0]!.command).toBe(`call_event ${talk.name}`);
    expect(talk.steps.map(s=>s.command)).toEqual([
      `set_actor_visible "${actors[1]!.name}" false`,
      `if_actor_relative ${actors[1]!.id} "${actors[0]!.name}" right`,
      'change_scene "Porto Copy" 2 3 down', 'change_scene Elsewhere 1 2 up',`call_event ${boot.name}`
    ]);
    expect(new Set(events.flatMap(e=>e.steps.map(s=>s.id).filter(Boolean))).size).toBe(6);
    expect(events.slice(0,3)).toEqual(data.events);
    expect((copy.triggers as typeof data.triggers).find(t=>t.roomName==="Porto Copy")!.eventName).toBe(talk.name);
    expect(copy.connections).toEqual([...data.connections,{from:"Porto Copy",to:"Elsewhere",eventName:talk.name}]);
    expect(duplicateRoomInProject(copy,{sourceRoomID:"source",newRoomID:"third",newName:"Porto Copy"})).toBe(copy);
  });

  it("retains copied actors and the correct event target through persistence and ROM export", () => {
    const base=createRoomInProject(buildProjectFromTemplate("blank",{name:"Copy export"}),{id:"source",name:"Porto",sceneType:"topdown",width:30,height:20});
    const data={...base,actors:[
      {id:"p",name:"Player",roomName:"Porto",x:1,y:1,spriteSheet:"neutral-player-topdown.png"},
      {id:"g",name:"Guard",roomName:"Porto",x:2,y:2,spriteSheet:"neutral-player-topdown.png",eventBindings:{onInteract:"hide"}}
    ],events:[{id:"hide",name:"hide",category:"Ator",roomName:"Porto",steps:[{id:"hide-step",command:"set_actor_visible Guard false"}]}]};
    expect(() => buildEngineExportProjectContract(data)).not.toThrow();
    const copy=duplicateRoomInProject(data,{sourceRoomID:"source",newRoomID:"copy",newName:"Porto Copy"});
    const reopened=parseGBAProjectFile(serializeGBAProjectFile({data:copy,summary:summarizeGBAProject(copy)})).data;
    expect(validateGBAProjectMigrationContract(reopened)).toEqual([]);
    const guard=(reopened.actors as typeof data.actors).find(a=>a.roomName==="Porto Copy" && a.name!=="Player copy")!;
    expect(reopened.actors).toHaveLength(4);
    // Make the original NPC's index differ from the copy's. Resolving the old
    // actor name would now target index1 instead of the copy's index0.
    (reopened.actors as typeof data.actors).splice(1,0,{id:"diversion",name:"Diversion",roomName:"Porto",x:3,y:3,spriteSheet:"neutral-player-topdown.png"});
    const contract=buildEngineExportProjectContract(reopened).topdown_project!;
    const script=contract.scripts!.find(s=>s.name===guard.eventBindings!.onInteract)!;
    expect(script.script).toEqual(expect.arrayContaining([{op:"set_actor_visible",actor:0,value:0}]));
    expect(contract.scripts!.find(s=>s.name==="hide")!.script).toEqual(expect.arrayContaining([{op:"set_actor_visible",actor:1,value:0}]));
    expect(contract.rooms.find(room=>room.name==="Porto Copy")?.npcs?.map(npc=>npc.name)).toEqual([guard.name]);
  });

  it("copies scripts used only by outgoing routes and allocates distinct identities on repeated copies", () => {
    const data=fixture();
    data.events.push({id:"route",name:"route",steps:[{command:"set_actor_visible Guard false"}]});
    data.connections[0]!.eventName="route";
    const first=duplicateRoomInProject(data,{sourceRoomID:"source",newRoomID:"one",newName:"First"});
    const second=duplicateRoomInProject(first,{sourceRoomID:"source",newRoomID:"two",newName:"Second"});
    const route=(second.connections as typeof data.connections).find(c=>c.from==="Second")!;
    expect(route.eventName).not.toBe("route");
    const actor=(second.actors as typeof data.actors).find(a=>a.roomName==="Second" && a.eventBindings)!;
    expect((second.events as typeof data.events).find(e=>e.name===route.eventName)!.steps[0]!.command).toBe(`set_actor_visible "${actor.name}" false`);
    const all=second.actors as typeof data.actors;
    expect(new Set(all.map(a=>a.id)).size).toBe(all.length);
    expect(new Set(all.map(a=>a.name)).size).toBe(all.length);
  });
});
