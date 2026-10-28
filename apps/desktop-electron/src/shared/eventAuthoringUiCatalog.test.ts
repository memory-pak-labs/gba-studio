import { describe, expect, it } from "vitest";
import { deriveEventsWorkspacePresentation } from "./eventsWorkspace.js";
import { eventCommandCategory, eventCommandDescription } from "./eventCommandMetadata.js";
import { studioUiMessages, translateStudioMessage } from "./studioUiMessages.js";

describe("event library application copy", () => {
  it("has complete primary-locale messages for every event, template and preview field", () => {
    const sources = new Set<string>();
    for (const item of deriveEventsWorkspacePresentation({}).commandPalette) {
      sources.add(item.label);
      for (const group of item.authoringCategories ?? [{ category: item.category, section: item.section }]) {
        sources.add(eventCommandCategory(group.category));
        if (group.section) sources.add(group.section);
      }
      item.parameters.forEach(parameter => sources.add(parameter.label));
      const description = eventCommandDescription(item.command.split(/\s+/)[0] ?? "");
      if (description) sources.add(description);
      if (item.adaptation) sources.add(item.adaptation);
    }
    for (const source of sources) {
      const messages = studioUiMessages[source];
      expect(messages, source).toBeDefined();
      for (const [index, locale] of ["pt-BR", "en-US", "es-ES"].entries()) {
        expect(messages?.[index]?.trim(), `${locale}: ${source}`).toBeTruthy();
        expect(translateStudioMessage(locale, source), `${locale}: ${source}`).toBe(messages?.[index]);
      }
    }
  });

  it("translates complete phrases while preserving command tokens, ranges and placeholders", () => {
    expect(translateStudioMessage("en-US", "Abrir diálogo de loja")).toBe("Open shop dialogue");
    expect(translateStudioMessage("es-ES", "Carregar projétil para espaço")).toBe("Cargar proyectil en una ranura");
    expect(translateStudioMessage("en-US", "Ação: {0}. Configure os valores no inspetor após adicionar.", { 0: "Salvador" }))
      .toBe("Action: Salvador. Set the values in the inspector after adding.");
    for (const messages of Object.values(studioUiMessages)) {
      const placeholders = (text: string) => text.match(/\{\d+\}/g) ?? [];
      expect(placeholders(messages[1]), messages[0]).toEqual(placeholders(messages[0]));
      expect(placeholders(messages[2]), messages[0]).toEqual(placeholders(messages[0]));
    }
  });
});
