/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useState } from "react";
import { buildProjectFromTemplate } from "../shared/projectTemplates";
import { createRoomInProject, updateRoomFieldsInProject } from "../shared/roomsWorkspace";
import { normalizeSceneRuntime } from "../shared/sceneTypeProfiles";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject } from "../shared/projectFile";
import { buildEngineExportProjectContract } from "../main/exportEngineProject";
import { SceneRuntimeResourcesInspector } from "./SceneRuntimeResourcesInspector";

afterEach(cleanup);

it("shows inherited participant limits before a scene overrides them", () => {
  render(<SceneRuntimeResourcesInspector sceneType="battleRpg" roomName="Battle" background="" config={{}}
    data={{ settings: { battleRpg: { maxPartySize: 3, maxEnemies: 8 } } }} onChange={() => {}} />);
  fireEvent.click(screen.getByText("Recursos da cena"));
  expect(screen.getByRole("spinbutton", { name: "Máximo no grupo" })).toHaveValue(3);
  expect(screen.getByRole("spinbutton", { name: "Máximo de inimigos" })).toHaveValue(8);
});

it("edits a scene's participant limits and preserves all twelve combatants through save and export", () => {
  let result = createRoomInProject(buildProjectFromTemplate("blank", { name: "Battle capacity" }), {
    id: "battle", name: "Battle", sceneType: "battleRpg", width: 30, height: 20
  });
  result.actors = Array.from({ length: 12 }, (_, index) => ({
    id: `actor_${index}`, name: `Unit ${index}`, roomName: "Battle", x: index, y: 8,
    battle: { side: index < 4 ? "party" : "enemy", maxHp: 20, attack: 7, defense: 2, speed: 5, abilities: ["attack"] }
  }));
  function Harness() {
    const [data, setData] = useState(result); result = data;
    const room = (data.rooms as Record<string, any>[]).find(r => r.id === "battle")!;
    return <SceneRuntimeResourcesInspector sceneType="battleRpg" roomName="Battle" background="" config={room.runtime.config} data={data}
      onChange={config => setData(updateRoomFieldsInProject(data, "battle", { runtime: normalizeSceneRuntime("battleRpg", { type: "battleRpg", config }) }))} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByText("Recursos da cena"));
  fireEvent.click(screen.getByRole("checkbox", { name: "Inventário da batalha" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Máximo no grupo" }), { target: { value: "4" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Máximo de inimigos" }), { target: { value: "8" } });
  const saved = parseGBAProjectFile(serializeGBAProjectFile({ data: result, summary: summarizeGBAProject(result) })).data;
  const encounter = buildEngineExportProjectContract(saved).battle_rpg_project!.encounters[0];
  expect(encounter.config).toMatchObject({ max_party_size: 4, max_enemies: 8 });
  expect(encounter.party_count).toBe(4);
  expect(encounter.enemy_count).toBe(8);
});

it("authors a battle item and preserves its slot, label, quantity and healing through save and export", () => {
  let result = createRoomInProject(buildProjectFromTemplate("blank", { name: "Battle items" }), {
    id: "battle", name: "Battle", sceneType: "battleRpg", width: 30, height: 20
  });
  function Harness() {
    const [data, setData] = useState(result); result = data;
    const room = (data.rooms as Record<string, any>[]).find(r => r.id === "battle")!;
    return <SceneRuntimeResourcesInspector sceneType="battleRpg" roomName="Battle" background="" config={room.runtime.config} data={data}
      onChange={config => setData(updateRoomFieldsInProject(data, "battle", { runtime: normalizeSceneRuntime("battleRpg", { type: "battleRpg", config }) }))} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByText("Recursos da cena"));
  fireEvent.click(screen.getByRole("checkbox", { name: "Inventário da batalha" }));
  fireEvent.blur(screen.getByRole("textbox", { name: "Chave do item" }), { target: { value: "tonic" } });
  fireEvent.blur(screen.getByRole("textbox", { name: "Rótulo do item" }), { target: { value: "TONICO" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Quantidade inicial" }), { target: { value: "2" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Cura por item" }), { target: { value: "10" } });
  const saved = parseGBAProjectFile(serializeGBAProjectFile({ data: result, summary: summarizeGBAProject(result) })).data;
  const encounter = buildEngineExportProjectContract(saved).battle_rpg_project!.encounters[0] as unknown as Record<string, any>;
  expect(encounter.inventory_items).toEqual([{ item: 0, label: "TONICO", initial_quantity: 2, heal_amount: 10 }]);
});
