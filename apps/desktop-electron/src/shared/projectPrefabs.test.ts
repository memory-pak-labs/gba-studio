import { describe, expect, it } from "vitest";

import {
  createProjectPrefabFromEntity,
  instantiateProjectPrefab,
  synchronizeProjectPrefabInstances,
  updateProjectPrefab
} from "./projectPrefabs.js";
import type { GBAProjectData } from "./projectFile.js";

describe("project prefabs", () => {
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
