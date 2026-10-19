import { describe, expect, it } from "vitest";

import {
  createProjectPrefabFromEntity,
  instantiateProjectPrefab,
  synchronizeProjectPrefabInstances,
  updateProjectPrefab
} from "./projectPrefabs.js";
import type { GBAProjectData } from "./projectFile.js";

describe("project prefabs", () => {
  it("keeps a moved instance in its room and copies nested properties independently", () => {
    const data = {
      rooms: [{ id: "north", name: "North" }, { id: "south", name: "South" }],
      actors: [{ id: "source", name: "Guard", roomName: "North", x: 2, y: 3, z: 1, eventBindings: { onInteract: "talk" } }]
    } as GBAProjectData;
    const created = createProjectPrefabFromEntity(data, "actor", "source");
    const placed = instantiateProjectPrefab(created.data, "actor", created.prefabID!, { roomID: "south", x: 5, y: 6 });
    const instance = (placed.data.actors as any[]).find(actor => actor.id === placed.entityID)!;
    expect(instance).toMatchObject({ roomID: "south", roomName: "South", x: 5, y: 6 });
    const source = (placed.data.actors as any[])[0];
    instance.eventBindings.onInteract = "different";
    expect(source.eventBindings.onInteract).toBe("talk");
    expect((placed.data.actorPrefabs as any[])[0].eventBindings.onInteract).toBe("talk");
    source.roomName = "South";
    expect((synchronizeProjectPrefabInstances(placed.data).actors as any[])[0].roomName).toBe("South");
  });

  it("keeps native trigger event bindings in sync with prefab event fields", () => {
    const data = {
      triggerPrefabs: [{ id: "door", name: "Door", eventBindings: { onEnter: "old", onInteract: "examine" } }],
      triggers: [{ id: "instance", prefabID: "door", roomName: "Room", x: 1, y: 1 }]
    } as GBAProjectData;
    const updated = updateProjectPrefab(data, "trigger", "door", { onEnterEventName: "new" });
    expect((updated.triggers as any[])[0].eventBindings).toEqual({ onEnter: "new", onInteract: "examine" });
  });

  it("copies scripts that address the source actor and keeps the copy after synchronization", () => {
    const data = {
      rooms: [{ id: "source-room", name: "Source" }, { id: "target-room", name: "Target" }],
      actors: [{ id: "cell", name: "Cell", roomName: "Source", x: 1, y: 1, eventBindings: { onInteract: "collect" } }],
      events: [{ id: "collect", name: "collect", roomName: "Source", steps: [{ id: "hide", command: "set_actor_visible cell false" }, { id: "sound", command: "play_sfx collect_sound" }] }]
    } as GBAProjectData;
    const created = createProjectPrefabFromEntity(data, "actor", "cell");
    const placed = instantiateProjectPrefab(created.data, "actor", created.prefabID!, { roomID: "target-room", x: 3, y: 4 });
    const actor = (placed.data.actors as any[]).find(a => a.id === placed.entityID)!;
    expect(actor.eventBindings.onInteract).not.toBe("collect");
    const event = (placed.data.events as any[]).find(e => e.name === actor.eventBindings.onInteract)!;
    expect(event.roomName).toBe("Target");
    expect(event.steps.map((s:any) => s.command)).toEqual([`set_actor_visible ${actor.id} false`, "play_sfx collect_sound"]);
    expect((synchronizeProjectPrefabInstances(placed.data).actors as any[]).find(a => a.id === actor.id).eventBindings).toEqual(actor.eventBindings);
    expect((placed.data.events as any[])[0].steps[0].command).toBe("set_actor_visible cell false");
  });

  it("translates native wander bounds with the instance instead of sending it back to the source", () => {
    const project = { rooms: [{ id: "port", name: "Port" }], actors: [{
      id: "mechanic", name: "Mechanic", roomName: "Port", x: 94, y: 47,
      topdownMovement: { kind: "wander_box", bounds: { x: 92, y: 47, width: 4, height: 4 }, stepIntervalFrames: 2 }
    }] } as GBAProjectData;
    const created = createProjectPrefabFromEntity(project, "actor", "mechanic");
    const placed = instantiateProjectPrefab(created.data, "actor", created.prefabID!, { roomID: "port", x: 10, y: 12 });
    for (const next of [placed.data, synchronizeProjectPrefabInstances(placed.data)]) {
      expect((next.actors as any[]).find(actor => actor.id === placed.entityID).topdownMovement.bounds).toEqual({ x: 8, y: 12, width: 4, height: 4 });
      expect((next.actors as any[])[0].topdownMovement.bounds).toEqual({ x: 92, y: 47, width: 4, height: 4 });
    }
  });

  it("retargets transitive event calls independently for two copies", () => {
    const source = {
      rooms: [{ id: "room", name: "Room" }],
      actors: [{ id: "cell", name: "Cell", roomName: "Room", x: 1, y: 1, eventBindings: { onInteract: "collect" } }],
      events: [
        { id: "collect", name: "collect", steps: [{ id: "call", command: "call_event reward" }] },
        { id: "reward", name: "reward", steps: [{ id: "hide", command: "set_actor_visible cell false" }, { id: "flag", command: "set_var reward_granted 1" }] }
      ]
    } as GBAProjectData;
    const created = createProjectPrefabFromEntity(source, "actor", "cell");
    const first = instantiateProjectPrefab(created.data, "actor", created.prefabID!, { roomID: "room", x: 2, y: 2 });
    const second = instantiateProjectPrefab(first.data, "actor", created.prefabID!, { roomID: "room", x: 3, y: 3 });
    const data = synchronizeProjectPrefabInstances(second.data);
    for (const id of [first.entityID, second.entityID]) {
      const actor = (data.actors as any[]).find(a => a.id === id);
      const root = (data.events as any[]).find(e => e.name === actor.eventBindings.onInteract);
      const child = (data.events as any[]).find(e => e.name === root.steps[0].command.split(" ")[1]);
      expect(child.steps.map((s: any) => s.command)).toEqual([`set_actor_visible ${id} false`, "set_var reward_granted 1"]);
    }
    expect(source.events).toHaveLength(2);
    expect((data.events as any[]).map(e => e.name).length).toBe(new Set((data.events as any[]).map(e => e.name)).size);
  });
  it("propagates actor prefab fields while preserving instance identity and placement", () => {
    const project = {
      actorPrefabs: [{ id: "npc", name: "NPC base", spriteSheet: "npc.png", animationName: "walk_left", collisionEnabled: false }],
      actors: [{ id: "actor-1", name: "Guarda", roomID: "room-2", x: 7, y: 9, prefabID: "npc", animationName: "idle_down", collisionEnabled: true }]
    } as GBAProjectData;

    expect(synchronizeProjectPrefabInstances(project).actors).toEqual([expect.objectContaining({
      id: "actor-1",
      name: "Guarda",
      roomID: "room-2",
      x: 7,
      y: 9,
      prefabID: "npc",
      spriteSheet: "npc.png",
      animationName: "walk_left",
      collisionEnabled: false
    })]);
  });

  it("propagates trigger dimensions and enter/leave events without moving the instance", () => {
    const project = {
      triggerPrefabs: [{ id: "door", name: "Porta", width: 2, height: 3, onEnterEventName: "open", onLeaveEventName: "close" }],
      triggers: [{ id: "trigger-1", name: "Porta norte", roomID: "room-1", x: 4, y: 5, width: 1, height: 1, prefabID: "door" }]
    } as GBAProjectData;

    expect(synchronizeProjectPrefabInstances(project).triggers).toEqual([expect.objectContaining({
      id: "trigger-1",
      name: "Porta norte",
      roomID: "room-1",
      x: 4,
      y: 5,
      width: 2,
      height: 3,
      prefabID: "door",
      onEnterEventName: "open",
      onLeaveEventName: "close"
    })]);
  });

  it("creates an actor prefab from an instance and links the source actor", () => {
    const project = {
      actors: [{ id: "actor-1", name: "Guarda", roomID: "room-1", x: 2, y: 3, spriteSheet: "guard.png", collisionEnabled: true }]
    } as GBAProjectData;
    const result = createProjectPrefabFromEntity(project, "actor", "actor-1", "Guarda Base");

    expect(result.prefabID).toBe("actor-prefab-guarda-base");
    expect(result.data.actorPrefabs).toEqual([expect.objectContaining({
      id: "actor-prefab-guarda-base",
      name: "Guarda Base",
      spriteSheet: "guard.png",
      collisionEnabled: true
    })]);
    expect(result.data.actors).toEqual([expect.objectContaining({ prefabID: "actor-prefab-guarda-base" })]);
  });

  it("updates a prefab, propagates it and instantiates a linked copy", () => {
    const project = {
      actorPrefabs: [{ id: "npc", name: "NPC", spriteSheet: "npc.png", animationName: "idle" }],
      actors: [{ id: "actor-1", name: "Original", roomID: "room-1", x: 1, y: 1, prefabID: "npc", animationName: "old" }]
    } as GBAProjectData;
    const updated = updateProjectPrefab(project, "actor", "npc", { animationName: "walk", collisionEnabled: false });
    const instantiated = instantiateProjectPrefab(updated, "actor", "npc", { roomID: "room-2", x: 8, y: 9 });

    expect(updated.actors).toEqual([expect.objectContaining({ name: "Original", x: 1, y: 1, animationName: "walk", collisionEnabled: false })]);
    expect(instantiated.entityID).toBe("actor-npc");
    expect(instantiated.data.actors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "actor-npc", roomID: "room-2", x: 8, y: 9, prefabID: "npc", animationName: "walk" })
    ]));
  });
});
