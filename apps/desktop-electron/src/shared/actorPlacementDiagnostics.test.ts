import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import { deriveRoomGeometryDiagnostics, deriveRoomsWorkspacePresentation, updateRoomEntityInProject } from "./roomsWorkspace.js";

function fixture() {
  const data = createBlankProjectData({ name: "Placement" });
  const scene = (data.scenas as Record<string, unknown>[])[0]!;
  Object.assign(scene, { sceneType: "platformer", width: 30, height: 20,
    collisionTypes: Array.from({ length: 600 }, (_, i) => i >= 300 ? "solid" : "free") });
  data.actors = [{ id: "lift", name: "Lift", roomName: scene.name, x: 10, y: 10, spriteSheet: "lift.png", animationName: "idle", eventBindings: { onInit: "init" } }];
  data.assets = [{ name: "lift.png", kind: "Sprite", metadata: { width: 64, height: 32 } }];
  data.animations = [{ name: "idle", spriteSheet: "lift.png", frameWidth: 64, frameHeight: 32, originX: 32, originY: 24, frames: [{ tiles: [] }] }];
  data.events = [{ name: "init", steps: [{ command: "set_actor_collision_box lift -32 -16 64 4", isEnabled: true }] }];
  return data;
}

describe("actor placement diagnostics", () => {
  it("uses an unconditional onInit box instead of the visual bottom of a platform", () => {
    const view = deriveRoomsWorkspacePresentation(fixture());
    expect(view.entities[0]?.collisionBounds).toEqual({ x: -32, y: -16, width: 64, height: 4 });
    expect(deriveRoomGeometryDiagnostics(view.rooms[0]!, view.entities).actorPlacement.blocked).toEqual([]);
  });

  it("does not assume that conditional or delayed geometry is active on spawn", () => {
    for (const prefix of ["if_variable flag 1", "wait 1", "call_event other"]) {
      const data = fixture();
      (data.events as any[])[0].steps.unshift({ command: prefix, isEnabled: true });
      const view = deriveRoomsWorkspacePresentation(data);
      expect(view.entities[0]?.collisionBounds).toBeUndefined();
      expect(deriveRoomGeometryDiagnostics(view.rooms[0]!, view.entities).actorPlacement.blocked).toEqual(["Lift"]);
    }
  });

  it("keeps unmarked and zero-mask actors blocked, but accepts an explicit non-player placement intent", () => {
    const data = fixture(); data.events = [];
    const actor = (data.actors as any[])[0];
    actor.collisionMask = 0;
    let view = deriveRoomsWorkspacePresentation(data);
    expect(deriveRoomGeometryDiagnostics(view.rooms[0]!, view.entities).actorPlacement.blocked).toEqual(["Lift"]);
    const updated = updateRoomEntityInProject(data, "actor", "lift", { collisionPlacement: "intentional" });
    view = deriveRoomsWorkspacePresentation(updated);
    expect(view.entities[0]?.collisionPlacement).toBe("intentional");
    expect(deriveRoomGeometryDiagnostics(view.rooms[0]!, view.entities).actorPlacement.blocked).toEqual([]);
    expect(deriveRoomGeometryDiagnostics(view.rooms[0]!, view.entities.map(e => ({ ...e, isPlayer: true }))).actorPlacement.blocked).toEqual(["Lift"]);
    expect(deriveRoomGeometryDiagnostics(view.rooms[0]!, view.entities.map(e => ({ ...e, x: 40 }))).actorPlacement.outsideBounds).toEqual(["Lift"]);
    expect((updated.actors as any[])[0]).toMatchObject({ x: actor.x, y: actor.y, spriteSheet: actor.spriteSheet });
  });
});
