import { describe, expect, it } from "vitest";
import { pointClickInventoryItems, pointClickItemNames } from "./pointClickTargets.js";
import { buildProjectFromTemplate } from "./projectTemplates.js";
import { createRoomInProject, updateRoomEntityInProject } from "./roomsWorkspace.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject } from "./projectFile.js";

function project() {
  const data = createRoomInProject(buildProjectFromTemplate("blank", { name: "Items" }), {
    id: "office", name: "Oficina", sceneType: "pointAndClick", width: 30, height: 20
  });
  data.triggers = [{ id: "key", name: "Chave", roomName: "Oficina", x: 6, y: 8, width: 3, height: 3 }];
  return data;
}

describe("Point and Click target persistence", () => {
  it("merges target edits, preserves geometry and round-trips the authored item", () => {
    const original = project();
    const collector = updateRoomEntityInProject(original, "trigger", "key", { pointClick: { giveItem: " key ", ownershipVariable: 20 } });
    const next = updateRoomEntityInProject(collector, "trigger", "key", { pointClick: { requiredItem: "key", consumeRequiredItem: true } });
    const reopened = parseGBAProjectFile(serializeGBAProjectFile({ data: next, summary: summarizeGBAProject(next) })).data;
    expect(reopened.triggers).toEqual([expect.objectContaining({ x: 6, y: 8, width: 3, height: 3,
      pointClick: expect.objectContaining({ giveItem: "key", ownershipVariable: 20, requiredItem: "key", consumeRequiredItem: true }) })]);
    expect((original.triggers as Record<string, unknown>[])[0].pointClick).toBeUndefined();
    expect(pointClickInventoryItems(reopened)).toEqual([{ name: "key", variable: 20 }]);
    expect((updateRoomEntityInProject(next, "trigger", "key", { pointClick: null }).triggers as Record<string, unknown>[])[0].pointClick).toBeUndefined();
  });

  it("does not register collectors from other scene types and deduplicates matching collectors", () => {
    const data = project();
    data.triggers = [
      { id: "a", roomName: "Oficina", pointClick: { giveItem: "key", ownershipVariable: 20 } },
      { id: "b", roomName: "Oficina", pointClick: { giveItem: "key", ownershipVariable: 20 } },
      { id: "c", roomName: "Other scene", pointClick: { giveItem: "coin", ownershipVariable: 21 } }
    ];
    expect(pointClickInventoryItems(data)).toEqual([{ name: "key", variable: 20 }]);
    expect(pointClickItemNames(data)).toEqual(["key"]);
  });

  it.each([64, -1, 1.5, "20"])("rejects invalid imported ownership variable %s", (variable) => {
    const data = project();
    (data.triggers as Record<string, unknown>[])[0].pointClick = { giveItem: "key", ownershipVariable: variable };
    expect(() => pointClickInventoryItems(data)).toThrow(/0 e 63/);
  });

  it("rejects two different items sharing a variable and one item sharing different variables", () => {
    const data = project();
    data.triggers = [
      { id: "a", roomName: "Oficina", pointClick: { giveItem: "key", ownershipVariable: 20 } },
      { id: "b", roomName: "Oficina", pointClick: { giveItem: "coin", ownershipVariable: 20 } }
    ];
    expect(() => pointClickInventoryItems(data)).toThrow(/variáveis de posse diferentes/);
    (data.triggers as Record<string, any>[])[1].pointClick = { giveItem: "key", ownershipVariable: 21 };
    expect(() => pointClickInventoryItems(data)).toThrow(/variáveis de posse diferentes/);
  });
});
