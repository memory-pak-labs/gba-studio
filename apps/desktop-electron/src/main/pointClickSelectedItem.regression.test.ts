import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createRoomInProject } from "../shared/roomsWorkspace.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

function project() {
  const data = createRoomInProject(buildProjectFromTemplate("blank", { name: "Cursor inventory" }), {
    id: "office", name: "Oficina", sceneType: "pointAndClick", width: 30, height: 20
  });
  data.dialogues = [{ key: "blocked", text: "Select the key." }, { key: "opened", text: "Door opened." }];
  data.events = [{ id: "use-key", name: "use_key", roomName: "Oficina", category: "Cena", command: "noop", steps: [{ command: "show_dialogue opened" }] }];
  data.triggers = [
    { id: "key", name: "Key", roomName: "Oficina", x: 6, y: 8, width: 3, height: 3,
      pointClick: { giveItem: "key", ownershipVariable: 20 } },
    { id: "coin", name: "Coin", roomName: "Oficina", x: 12, y: 8, width: 3, height: 3,
      pointClick: { giveItem: "coin", ownershipVariable: 21 } },
    { id: "door", name: "Door", roomName: "Oficina", x: 20, y: 8, width: 3, height: 3,
      pointClick: { requiredItem: "key", consumeRequiredItem: true, unavailableDialogue: "blocked", useItemEvent: "use_key" } }
  ];
  return data;
}

describe("Point and Click selected-item authoring export", () => {
  it("connects collectors, selected-item requirement, failure dialogue and consumption to the native contract", () => {
    const result = buildEngineExportProjectContract(project()).point_click_project!;
    expect(result.inventory_items).toEqual([{ name: "key", variable: 20 }, { name: "coin", variable: 21 }]);
    expect(result.scenes[0].hotspots?.[0]).toMatchObject({ give_item: 0 });
    expect(result.scenes[0].hotspots?.[2]).toMatchObject({ required_item: 0, unavailable_line: 0,
      on_use_item: [{ op: "set_variable", variable: 20, value: 0 }, { op: "show_dialogue", dialogue: 1 }] });
  });

  it("retains the item unless consumption is enabled and falls back to the normal interaction script", () => {
    const data = project();
    const door = (data.triggers as Record<string, any>[])[2];
    door.pointClick = { requiredItem: "key" };
    door.eventBindings = { onInteract: "use_key" };
    const result = buildEngineExportProjectContract(data).point_click_project!;
    expect(result.scenes[0].hotspots?.[2]).toMatchObject({ required_item: 0,
      on_click: [{ op: "show_dialogue", dialogue: 1 }] });
    expect(result.scenes[0].hotspots?.[2]?.on_use_item).toBeUndefined();
  });

  it("rejects a required item with no collector definition instead of silently allowing the target", () => {
    const data = project();
    (data.triggers as Record<string, any>[])[2].pointClick.requiredItem = "missing";
    expect(() => buildEngineExportProjectContract(data)).toThrow(/item.*missing/i);
  });
});
