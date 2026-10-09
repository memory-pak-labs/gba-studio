import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eventCommandCatalog } from "./eventCommandLibrary.js";
import { eventCommandCategory } from "./eventCommandMetadata.js";
import { deriveEventsWorkspacePresentation, filterEventsCommandSuggestions, prepareEventExport } from "./eventsWorkspace.js";

describe("GB Studio event authoring vocabulary", () => {
  it("preserves every historical ID and explicitly records the new authoring contracts", () => {
    const identity = JSON.stringify(eventCommandCatalog.map(d => d.id));
    expect(eventCommandCatalog).toHaveLength(200);
    expect(createHash("sha256").update(identity).digest("hex")).toBe("5b43298c2f390e41100e4381382c7dce4f1adba5faeff8fa073d867a15a735a8");
  });

  it.each(["Câmera", "Tela", "Cores", "Fluxo de controle", "Variáveis", "Matemática", "Temporizador", "Campos do motor"])("keeps %s as its own category", category => {
    expect(eventCommandCategory(category)).toBe(category);
  });
  it("uses localized event names while preserving serialized commands", () => {
    const data = { scenas: [{ name: "porto" }], dialogues: [{ key: "intro", text: "Olá" }],
      events: [{ id: "boot", name: "boot", steps: [{ command: "show_dialogue intro" }, { command: "random_variable dice 1 6" }] }] };
    const before = JSON.stringify(data);
    const script = deriveEventsWorkspacePresentation(data).groups.flatMap(g => g.events)[0]!;
    expect(script.steps[0]!.commandLabel).toBe("Exibir diálogo");
    expect(script.steps[1]!.commandLabel).toBe("Definir variável para valor aleatório");
    expect(JSON.stringify(data)).toBe(before);
    expect(JSON.parse(prepareEventExport(data, "boot")!.contents).event.steps.map((s: {command: string}) => s.command)).toEqual(["show_dialogue intro", "random_variable dice 1 6"]);
  });
  it("finds familiar English names and previous Portuguese names", () => {
    const palette = deriveEventsWorkspacePresentation({}).commandPalette;
    expect(filterEventsCommandSuggestions(palette, { query: "Actor Move To" }).some(s => s.command.startsWith("move_actor_to "))).toBe(true);
    expect(filterEventsCommandSuggestions(palette, { query: "Semente de gerador de numero aleatorio" }).some(s => s.command.startsWith("random_variable "))).toBe(true);
  });
  it("retains the source identity and subgroup for the parallel-script events", () => {
    expect(eventCommandCatalog.find(d => d.id === "misc.start_segment")).toMatchObject({
      title: "Iniciar segmento", category: "Diversos", section: "Segmentos",
      reference: { id: "EVENT_THREAD_START", version: "4.3.2" }
    });
  });
  it("explains menu and positioned text as distinct incomplete saved contracts", () => {
    const script = deriveEventsWorkspacePresentation({ events: [{ name: "saved", steps: [{ command: "open_menu" }, { command: "draw_text Texto" }] }] }).groups.flatMap(g => g.events)[0]!;
    expect(script.steps[0]!.commandAvailability).toContain("opções");
    expect(script.steps[0]!.commandAvailability).not.toContain("Trocar cena");
    expect(script.steps[1]!.commandAvailability).toContain("X/Y");
    expect(script.steps[1]!.commandAvailability).not.toContain("use Exibir diálogo");
    expect(script.steps[0]!.command).toBe("open_menu");
    expect(script.steps[1]!.command).toBe("draw_text Texto");
  });
});
