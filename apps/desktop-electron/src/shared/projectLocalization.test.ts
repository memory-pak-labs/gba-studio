import { describe, expect, it } from "vitest";
import {
  deriveProjectLocalization,
  localizedDialogueChoices,
  localizedDialogueText,
  protectGameTextTokens,
  restoreGameTextTokens,
  type ProjectLocalization
} from "./projectLocalization.js";

describe("project localization", () => {
  const localization: ProjectLocalization = {
    sourceLocale: "en",
    defaultLocale: "pt-BR",
    enabledLocales: ["pt-BR", "en", "es"]
  };

  const dialogue = {
    text: "Hello {player}!\n{pause:30}",
    translations: {
      "pt-BR": "Ola {player}!\n{pause:30}",
      es: "Hola {player}!\n{pause:30}"
    },
    choices: ["Continue", "New Game"],
    choiceTranslations: {
      "pt-BR": ["Continuar", "Novo jogo"],
      es: ["Continuar", "Nueva partida"]
    }
  };

  it("declares Portuguese, English and Spanish as the built-in project languages", () => {
    expect(deriveProjectLocalization({ localization })).toEqual(localization);
  });

  it("keeps the current three-language default until more locales are enabled explicitly", () => {
    expect(deriveProjectLocalization({})).toEqual(localization);
  });

  it("resolves dialogue text and choices by locale with source fallback", () => {
    expect(localizedDialogueText(dialogue, localization, "pt-BR")).toBe("Ola {player}!\n{pause:30}");
    expect(localizedDialogueText(dialogue, localization, "en")).toBe("Hello {player}!\n{pause:30}");
    expect(localizedDialogueChoices(dialogue, localization, "es")).toEqual(["Continuar", "Nueva partida"]);
  });

  it("protects variables, control codes and line breaks during machine translation", () => {
    const protectedText = protectGameTextTokens("Hello {player}!\n$12$ !S4! {pause:30}");
    expect(protectedText.text).not.toContain("{player}");
    expect(restoreGameTextTokens(protectedText.text, protectedText.tokens)).toBe("Hello {player}!\n$12$ !S4! {pause:30}");
  });
});
