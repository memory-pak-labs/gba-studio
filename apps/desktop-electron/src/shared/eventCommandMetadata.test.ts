import { describe, expect, it } from "vitest";
import { eventCommandCategory, eventCommandDescription, eventCommandParameterLabel } from "./eventCommandMetadata.js";
import { deriveEventsWorkspacePresentation, prepareEventExport } from "./eventsWorkspace.js";

describe("event authoring metadata", () => {
  it("names arrival parameters without changing command tokens or export", () => {
    const data = { rooms: [{ name: "farol_interior" }], events: [{ id: "entrar", name: "entrar", steps: [{ command: "change_scene farol_interior 22 24 up", isEnabled: true }] }] };
    const before = JSON.stringify(data);
    const step = deriveEventsWorkspacePresentation(data).groups[0]!.events[0]!.steps[0]!;
    expect(step.commandParameters.map(p => p.label)).toEqual(["Cena", "X (tiles)", "Y (tiles)", "Direção"]);
    expect(step.commandParameters.map(p => p.value)).toEqual(["farol_interior", "22", "24", "up"]);
    expect(JSON.stringify(data)).toBe(before);
    expect(JSON.parse(prepareEventExport(data, "entrar")!.contents).event.steps[0].command).toBe("change_scene farol_interior 22 24 up");
  });
  it("normalizes navigation labels without conflating operations", () => {
    expect(eventCommandCategory("Audio")).toBe("Música e efeitos sonoros");
    expect(eventCommandCategory("Música e efeitos sonoros")).toBe("Música e efeitos sonoros");
    expect(eventCommandCategory("Variavel")).toBe("Variáveis");
    expect(eventCommandCategory("Diálogo e menus")).toBe("Diálogo e menus");
    expect(eventCommandDescription("change_scene")).toContain("chegada");
  });
  it("keeps arbitrary custom commands editable with a safe label fallback", () => {
    expect(eventCommandParameterLabel("custom_action", 2, "Argumento 2")).toBe("Parâmetro 2");
    const step = deriveEventsWorkspacePresentation({ events: [{ name: "custom", steps: [{ command: "custom_action keep raw words", isEnabled: false }] }] }).groups[0]!.events[0]!.steps[0]!;
    expect(step.command).toBe("custom_action keep raw words");
    expect(step.isEnabled).toBe(false);
  });
});
