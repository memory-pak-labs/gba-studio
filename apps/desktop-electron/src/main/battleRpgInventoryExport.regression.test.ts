import { expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createRoomInProject } from "../shared/roomsWorkspace.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

it("binds the battle item by its event key when another item sorts before it", () => {
  const data = createRoomInProject(buildProjectFromTemplate("blank", { name: "Item identity" }), {
    id: "battle", name: "Battle", sceneType: "battleRpg", width: 30, height: 20
  });
  const room = (data.rooms as Record<string, any>[]).find(r => r.id === "battle")!;
  room.runtime.config.modules = [{ id: "inventory", enabled: true, settings: { itemKey: "potion", label: "POCAO", initialQuantity: 0, healAmount: 10 } }];
  room.eventBindings = { onInit: "grant" };
  data.events = [{ id: "grant", name: "grant", category: "Custom", command: "noop", steps: [{ command: "add_item apple 3" }, { command: "add_item potion 1" }] }];
  const battle = buildEngineExportProjectContract(data).battle_rpg_project!.encounters[0];
  expect(battle.on_enter).toEqual([{ op: "add_inventory_item", item: 0, quantity: 3 }, { op: "add_inventory_item", item: 1, quantity: 1 }]);
  expect(battle.inventory_items).toEqual([{ item: 1, label: "POCAO", initial_quantity: 0, heal_amount: 10 }]);
});

it("registers an initially supplied battle item without requiring a grant event", () => {
  const data = createRoomInProject(buildProjectFromTemplate("blank", { name: "Initial items" }), {
    id: "battle", name: "Battle", sceneType: "battleRpg", width: 30, height: 20
  });
  const room = (data.rooms as Record<string, any>[]).find(r => r.id === "battle")!;
  room.runtime.config.modules = [{ id: "inventory", enabled: true, settings: { itemKey: "tonic", label: "TONICO", initialQuantity: 2, healAmount: 8 } }];
  expect(buildEngineExportProjectContract(data).battle_rpg_project!.encounters[0].inventory_items)
    .toEqual([{ item: 0, label: "TONICO", initial_quantity: 2, heal_amount: 8 }]);
});
