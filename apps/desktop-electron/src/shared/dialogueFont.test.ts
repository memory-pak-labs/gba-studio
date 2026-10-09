import { describe, expect, it } from "vitest";
import { dialogueFontContract, dialogueFontCharacter, normalizeDialogueText, unsupportedDialogueCharacters, wrapDialogueText } from "./dialogueFont.js";

describe("shared Latin font", () => {
  it("covers all three game languages with distinct cases in one atlas", () => {
    expect(dialogueFontContract.locales).toEqual(["pt-BR", "en", "es"]);
    for (const text of ["Ação, manutenção, coração. Às três!", "The lighthouse needs repair.", "¡Sí! ¿Qué pasó? Mañana, pingüino."]) {
      expect(unsupportedDialogueCharacters(text)).toEqual([]);
    }
    expect(dialogueFontCharacter("ç")).not.toBe(dialogueFontCharacter("Ç"));
    expect(new Set(dialogueFontContract.glyphs.map(g => g.character)).size).toBe(128);
  });
  it("normalizes keyboard accents and punctuation, and exposes unsupported characters", () => {
    expect(normalizeDialogueText("Ac\u0327a\u0303o… “Olá” — ‘sim’")).toBe('Ação... "Olá" - \'sim\'');
    expect(unsupportedDialogueCharacters("Olá🙂")).toEqual(["🙂"]);
    expect(dialogueFontCharacter("🙂")).toBe("?");
  });
  it("wraps words and preserves explicit lines without losing long words", () => {
    expect(wrapDialogueText("Olá ação agora", 8)).toEqual(["Olá ação", "agora"]);
    expect(wrapDialogueText("manutencao\nfim", 5)).toEqual(["manut", "encao", "fim"]);
    expect(wrapDialogueText("abcde\nfim", 5)).toEqual(["abcde", "fim"]);
    expect(wrapDialogueText("  ab cd\n\nfim", 4)).toEqual(["  ab", "cd", "", "fim"]);
    expect(wrapDialogueText("abc   def", 5)).toEqual(["abc  ", "def"]);
    expect(wrapDialogueText("🙂á🙂", 2)).toEqual(["🙂á", "🙂"]);
    expect(wrapDialogueText("abc", 0)).toEqual(["a", "b", "c"]);
  });
});
