import { expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import { configureInteractiveObject } from "./interactiveObjects.js";
import { createPreviewRuntime, runPreviewRuntimeEvent } from "./previewRuntime.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { setProjectPrefabOverrides, updateProjectPrefab, prefabUpdateImpact, clearProjectPrefabOverrides } from "./projectPrefabs.js";

it("keeps explicit instance overrides and identifies affected instances before updates", () => {
  const data = { actors: [{ id: "a", prefabID: "p", spriteSheet: "old" }, { id: "b", prefabID: "p", spriteSheet: "old" }], actorPrefabs: [{ id: "p", name: "P", spriteSheet: "old" }] };
  const customized = setProjectPrefabOverrides(data, "actor", "a", { spriteSheet: "custom" });
  expect(prefabUpdateImpact(customized, "actor", "p", ["spriteSheet"])).toEqual([{ id: "a", inherited: [], overridden: ["spriteSheet"] }, { id: "b", inherited: ["spriteSheet"], overridden: [] }]);
  const changed = updateProjectPrefab(customized, "actor", "p", { spriteSheet: "new" });
  expect((changed.actors as Record<string, unknown>[]).map(a => a.spriteSheet)).toEqual(["custom", "new"]);
  const extra = setProjectPrefabOverrides(changed, "actor", "a", { interactiveObject: { kind: "mission" } });
  const reset = (clearProjectPrefabOverrides(extra, "actor", "a").actors as Record<string, unknown>[])[0]!;
  expect(reset.spriteSheet).toBe("new");
  expect(reset.interactiveObject).toBeUndefined();
});
it("compiles a once-only chest into existing events, restores its appearance and never duplicates rewards", () => {
  const data = createBlankProjectData({ name: "Objects", sceneType: "topdown" });
  const room = (data.rooms as Record<string, unknown>[])[0]!;
  data.actors = [...data.actors as Record<string, unknown>[], { id: "chest", name: "Chest", roomName: room.name, x: 8, y: 8 }];
  data.items = [{ id: "coin", name: "Coin" }];
  const configured = configureInteractiveObject(JSON.parse(JSON.stringify(data)), "chest", { kind: "chest", variable: "chest.open", rewardItem: "coin", quantity: 2 });
  let state = createPreviewRuntime(configured.data);
  state = runPreviewRuntimeEvent(state, configured.eventName);
  state = runPreviewRuntimeEvent(state, configured.eventName);
  expect(state.inventory.coin).toBe(2);
  expect(state.variables["chest.open"]).toBe(1);
  expect(state.actors.find(a => a.id === "chest")?.visible).toBe(false);
  const exported = buildEngineExportProjectContract(configured.data).topdown_project!;
  expect(exported.rooms[0]?.on_restore?.length).toBeGreaterThan(0);
  expect(exported.rooms[0]?.on_restore?.some(command => command.op === "call_script")).toBe(false);
});

it("rejects attaching an object interaction to the player lifecycle", () => {
  const data = createBlankProjectData({ name: "Player guard", sceneType: "topdown" });
  const player = (data.actors as Record<string, unknown>[])[0]!;
  expect(() => configureInteractiveObject(data, String(player.id), { kind: "mission", variable: "quest.test" })).toThrow(/NPC/);
});

it("gives each chest prefab instance its own saved state without duplicating rewards", async () => {
  const { createProjectPrefabFromEntity, instantiateProjectPrefab } = await import("./projectPrefabs.js");
  const data = createBlankProjectData({ name: "Independent chests", sceneType: "topdown" });
  const room = (data.rooms as Record<string, unknown>[])[0]!;
  data.actors = [...data.actors as Record<string, unknown>[], { id: "chest", name: "Chest", roomName: room.name, x: 8, y: 8 }];
  const source = configureInteractiveObject(data, "chest", { kind: "chest", variable: "chest.open", rewardItem: "coin" });
  const prefab = createProjectPrefabFromEntity(source.data, "actor", "chest");
  const placed = instantiateProjectPrefab(prefab.data, "actor", prefab.prefabID!, { roomID: String(room.id), x: 10, y: 8 });
  const instance = (placed.data.actors as Record<string, unknown>[]).find(actor => actor.id === placed.entityID)!;
  const copiedEvent = (instance.eventBindings as Record<string, string>).onInteract!;
  let state = createPreviewRuntime(placed.data);
  for (const event of [source.eventName, copiedEvent, source.eventName, copiedEvent]) state = runPreviewRuntimeEvent(state, event);
  expect(state.inventory.coin).toBe(2);
  expect(instance.interactiveObject).toMatchObject({ variable: `chest.open.${placed.entityID}` });
  expect((placed.data.events as Record<string, unknown>[]).filter(event => String(event.name).startsWith(`prefab-${placed.entityID}-`))).toHaveLength(0);
});

it("removes generated restoration hooks when an NPC returns to ordinary prefab inheritance", async () => {
  const { createProjectPrefabFromEntity } = await import("./projectPrefabs.js");
  const data = createBlankProjectData({ name: "Reset object", sceneType: "topdown" });
  const room = (data.rooms as Record<string, unknown>[])[0]!;
  data.actors = [...data.actors as Record<string, unknown>[], { id: "chest", name: "Chest", roomName: room.name, x: 8, y: 8 }];
  const prefab = createProjectPrefabFromEntity(data, "actor", "chest");
  const configured = configureInteractiveObject(prefab.data, "chest", { kind: "chest", variable: "chest.open", rewardItem: "coin" });
  const reset = clearProjectPrefabOverrides(configured.data, "actor", "chest");
  let state = createPreviewRuntime(reset);
  state = { ...state, variables: { ...state.variables, "chest.open": 1 } };
  const hook = ((reset.scenas as Record<string, unknown>[])[0]!.eventBindings as Record<string, string>).onInit!;
  state = runPreviewRuntimeEvent(state, hook);
  expect(state.actors.find(actor => actor.id === "chest")?.visible).toBe(true);
});
