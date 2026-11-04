import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import { deriveRoomGeometryDiagnostics, deriveRoomsWorkspacePresentation, type RoomsWorkspaceEntity } from "./roomsWorkspace.js";

describe("topdown runtime collision footprint", () => {
  it("accepts explicitly wall-mounted Dungeon props while retaining actual wall and bounds failures", () => {
    const data = createBlankProjectData({ name: "Wall mechanisms" });
    const source = (data.scenas as Array<Record<string, unknown>>)[0]!;
    Object.assign(source, { sceneType: "dungeonCrawler", width: 11, height: 11,
      collisionTypes: Array.from({ length: 121 }, () => "solid") });
    data.actors = [
      { id: "valve", name: "Valve", roomName: source.name, x: 2, y: 8, dungeonWallMounted: true },
      { id: "cell", name: "Cell", roomName: source.name, x: 3, y: 8 }
    ];
    const presentation = deriveRoomsWorkspacePresentation(data);
    const wallRoom = presentation.rooms[0]!;
    expect(deriveRoomGeometryDiagnostics(wallRoom, presentation.entities).actorPlacement.blocked).toEqual(["Cell"]);
    expect(deriveRoomGeometryDiagnostics(wallRoom, presentation.entities.map(e => e.id === "valve" ? { ...e, x: 11 } : e)).actorPlacement.outsideBounds).toEqual(["Valve"]);
  });

  const base = deriveRoomsWorkspacePresentation(createBlankProjectData({ name: "Collision" })).rooms[0]!;
  const room = { ...base, sceneType: "topdown" as const, width: 48, height: 32,
    collisionTypes: Array.from({ length: 48 * 32 }, (_, i) => i === 27 * 48 + 21 ? "solid" as const : "free" as const) };
  const actor: RoomsWorkspaceEntity = { kind: "actor", id: "nara", name: "Nara", roomName: room.name,
    x: 23, y: 27, width: 1, height: 1, eventName: null, isInActiveRoom: true,
    spriteFrame: { frameWidth: 32, frameHeight: 48, widthTiles: 4, heightTiles: 6, originX: 16, originY: 40,
      sourceX: 0, sourceY: 0, sourceWidth: 32, sourceHeight: 48, layer: "OBJ" },
    collisionBounds: { x: 0, y: 0, width: 16, height: 8 } };

  it("keeps the authored visual footprint over a wall when the runtime hitbox is free", () => {
    expect(deriveRoomGeometryDiagnostics(room, [actor]).actorPlacement.blocked).toEqual([]);
  });

  it("still flags a physical hitbox inside the wall", () => {
    expect(deriveRoomGeometryDiagnostics(room, [{ ...actor, x: 21 }]).actorPlacement.blocked).toEqual(["Nara"]);
  });

  it("includes hitbox offsets and partial tile intersections", () => {
    expect(deriveRoomGeometryDiagnostics(room, [{ ...actor, collisionBounds: { x: -9, y: 0, width: 16, height: 8 } }]).actorPlacement.blocked).toEqual(["Nara"]);
  });

  it("matches exported animation hitboxes even when actor selection bounds are customized", () => {
    expect(deriveRoomGeometryDiagnostics(room, [{ ...actor, width: 8, hasCustomBounds: true }]).actorPlacement.blocked).toEqual([]);
  });
});
