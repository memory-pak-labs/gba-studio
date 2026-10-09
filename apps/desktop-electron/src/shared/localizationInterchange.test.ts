import { describe, expect, it } from "vitest";
import {
  auditGlyphCoverage,
  exportLocalizationCsv,
  exportLocalizationXliff,
  importLocalizationCsv,
  importLocalizationXliff
} from "./localizationInterchange.js";

const entries = [
  { id: "intro.title", values: { "pt-BR": "Olá, mundo", en: "Hello, world" } },
  { id: "shop.quote", values: { "pt-BR": "\"Poção\"", en: "\"Potion\"" } }
];

describe("localization interchange", () => {
  it("round-trips quoted CSV values", () => {
    const csv = exportLocalizationCsv(entries, ["pt-BR", "en"]);
    expect(importLocalizationCsv(csv)).toEqual(entries);
  });

  it("round-trips XLIFF 2.0 and keeps the source and target locale", () => {
    const xliff = exportLocalizationXliff(entries, "pt-BR", "en");
    expect(importLocalizationXliff(xliff)).toEqual({
      sourceLocale: "pt-BR",
      targetLocale: "en",
      entries
    });
  });

  it("reports missing glyphs without counting line breaks", () => {
    expect(auditGlyphCoverage(["Olá!\n"], new Set("Ola! "))).toEqual(["á"]);
  });
});
