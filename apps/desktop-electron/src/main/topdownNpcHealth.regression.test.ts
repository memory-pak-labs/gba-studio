import { expect, it } from "vitest";
import { createBlankProjectData } from "../shared/newProject.js";
import { deriveRoomsWorkspacePresentation, updateRoomEntityInProject } from "../shared/roomsWorkspace.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

function project() {
  const base = createBlankProjectData({ name: "Dano QA", includeStarterContent: false });
  const settings = base.settings as { general: Record<string, unknown> };
  return {
    ...base,
    scenas: [{ id: "room", name: "Sala", sceneType: "topdown", width: 30, height: 20, playerActorName: "Player" }],
    actors: [
      { id: "player", name: "Player", roomName: "Sala", x: 2, y: 2 },
      { id: "target", name: "Alvo 3 HP", roomName: "Sala", x: 10, y: 10,
        battle: { side: "none", maxHp: 99, attack: 6, defense: 3, speed: 4, abilities: ["attack"] }, eventBindings: { onHitActor: "hit", onDefeated: "defeat" } }
    ],
    events: [
      { id: "hit", name: "hit", category: "Ator", steps: [{ command: "set_variable ultimo 1" }] },
      { id: "defeat", name: "defeat", category: "Ator", steps: [{ command: "set_variable ultimo 2" }] }
    ],
    settings: { ...settings, general: { ...settings.general, startScene: "Sala", startSceneType: "topdown" } }
  };
}

it("persists the authored projectile HP and exports it with the existing callbacks", () => {
  const original = project();
  const updated = updateRoomEntityInProject(original, "actor", "target", { health: 3 });
  const saved = JSON.parse(JSON.stringify(updated));
  expect(saved.actors[1]).toMatchObject({ health: 3, battle: { maxHp: 99 } });
  expect(original.actors[1]).not.toHaveProperty("health");
  expect(deriveRoomsWorkspacePresentation(saved).entities.find(actor => actor.id === "target")?.health).toBe(3);
  const npc = buildEngineExportProjectContract(saved).topdown_project?.rooms[0]?.npcs?.[0];
  expect(npc).toMatchObject({ name: "Alvo 3 HP", health: 3,
    on_hit_actor: [expect.objectContaining({ op: "set_variable", value: 1 })],
    on_defeated: [expect.objectContaining({ op: "set_variable", value: 2 })] });
});

it("defaults projectile HP to one independently from RPG battle HP", () => {
  const data = project();
  expect(deriveRoomsWorkspacePresentation(data).entities.find(actor => actor.id === "target")?.health).toBe(1);
  expect(buildEngineExportProjectContract(data).topdown_project?.rooms[0]?.npcs?.[0]?.health).toBe(1);
});

it.each([[0,1],[5000,999],[4.8,4]] as const)("normalizes HP %s to %s before saving", (requested, expected) => {
  const updated = updateRoomEntityInProject(project(), "actor", "target", { health: requested });
  const saved = JSON.parse(JSON.stringify(updated));
  expect(saved.actors[1].health).toBe(expected);
  expect(buildEngineExportProjectContract(saved).topdown_project?.rooms[0]?.npcs?.[0]?.health).toBe(expected);
});

it("does not replace valid HP with non-finite input", () => {
  const updated = updateRoomEntityInProject(project(), "actor", "target", { health: 3 });
  const invalid = updateRoomEntityInProject(updated, "actor", "target", { health: Number.NaN });
  expect(JSON.parse(JSON.stringify(invalid)).actors[1].health).toBe(3);
});
