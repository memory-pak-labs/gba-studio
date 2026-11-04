import { expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createRoomInProject } from "../shared/roomsWorkspace.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

it("exports all four allies and eight authored enemies without dropping slots", () => {
  const data = createRoomInProject(buildProjectFromTemplate("blank", { name: "Full battle" }), {
    id: "battle", name: "Battle", sceneType: "battleRpg", width: 30, height: 20
  });
  data.settings = { ...(data.settings as Record<string, unknown>), battleRpg: { maxPartySize: 4, maxEnemies: 8 } };
  data.actors = Array.from({ length: 12 }, (_, index) => ({
    id: `actor_${index}`, name: `Unit ${index}`, roomName: "Battle", x: index, y: 8,
    battle: { side: index < 4 ? "party" : "enemy", maxHp: 20, attack: 7, defense: 2, speed: 5, abilities: ["attack"] }
  }));
  const encounter = buildEngineExportProjectContract(data).battle_rpg_project!.encounters[0];
  expect(encounter.config).toMatchObject({ max_party_size: 4, max_enemies: 8 });
  expect(encounter.party_count).toBe(4);
  expect(encounter.enemy_count).toBe(8);
  expect(encounter.enemies.map(unit => unit.name)).toEqual(Array.from({ length: 8 }, (_, i) => `Unit ${i + 4}`));
});
