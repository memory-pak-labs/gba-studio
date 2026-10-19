import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseGBAProjectFile } from "../shared/projectFile.js";
import { expandProjectTilemaps, compactProjectTilemaps } from "../shared/projectResourceFormat.js";
import { createActorInProject, deriveRoomsWorkspacePresentation, updateRoomEntityInProject } from "../shared/roomsWorkspace.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

it("preserves Dungeon cell edits through save/reopen and exports the same actor positions", () => {
  const source = readFileSync("default-assets/templates/exemplo-gba/exemplo-gba.gba-project", "utf8");
  const original = parseGBAProjectFile(source).data, before = JSON.stringify(original);
  const presentation = deriveRoomsWorkspacePresentation(original);
  const room = presentation.rooms.find(r => r.name === "usina_combate")!;
  const enemy = presentation.entities.find(e => e.roomName === room.name && e.kind === "actor")!;
  const destination = {x:9,y:1};
  expect(room.collisionCells[destination.y*room.width+destination.x]).toBe(false);
  const moved = updateRoomEntityInProject(original,"actor",enemy.id,destination);
  const added = createActorInProject(moved,{roomID:room.id,x:9,y:4,id:"viewport-test",name:"Viewport test",spriteSheet:enemy.spriteSheet!});
  const reopened = expandProjectTilemaps(parseGBAProjectFile(JSON.stringify(compactProjectTilemaps(added))).data);
  const entities = deriveRoomsWorkspacePresentation(reopened).entities;
  expect(entities.find(e=>e.id===enemy.id)).toMatchObject(destination);
  expect(entities.find(e=>e.id==="viewport-test")).toMatchObject({x:9,y:4});
  const exported = buildEngineExportProjectContract(reopened).dungeon_crawler_project!.rooms.find(r=>r.name===room.name)!;
  expect(exported.actors).toEqual(expect.arrayContaining([
    expect.objectContaining({name:enemy.name,position:destination}),
    expect.objectContaining({name:"Viewport test",position:{x:9,y:4}})
  ]));
  // The history snapshot still restores the actor and all approved source metadata exactly.
  expect(JSON.stringify(original)).toBe(before);
  expect(deriveRoomsWorkspacePresentation(original).entities.find(e=>e.id===enemy.id)).toMatchObject({x:enemy.x,y:enemy.y});
});
