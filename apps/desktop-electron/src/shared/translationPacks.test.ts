import { describe, expect, it } from "vitest";
import {
  translationPackForLocale,
  translationPackIDsForRegistry,
  translationPackSizeLabel,
  type TranslationPackCatalog
} from "./translationPacks.js";

const catalog: TranslationPackCatalog = {
  formatVersion: 1,
  generatedAt: "2026-09-18T00:00:00.000Z",
  registryURL: "https://example.invalid/registry.json",
  modelBaseURL: "https://example.invalid",
  corePackID: "core",
  packs: [
    {
      id: "core",
      label: "Português e English",
      description: "Básico",
      languages: ["pt-BR", "en"],
      pairs: ["enpt", "pten"],
      bundled: true,
      available: true,
      sizeBytes: 45 * 1024 * 1024,
      files: {}
    },
    {
      id: "es",
      label: "Español",
      description: "Espanhol",
      languages: ["es"],
      pairs: ["enes", "esen"],
      bundled: false,
      available: true,
      sizeBytes: 42 * 1024 * 1024,
      files: {}
    },
    {
      id: "ja",
      label: "日本語",
      description: "Indisponível",
      languages: ["ja"],
      pairs: [],
      bundled: false,
      available: false,
      sizeBytes: 0,
      files: {},
      unavailableReason: "Modelo não publicado"
    }
  ]
};

describe("translation packs", () => {
  it("resolves the optional pack for a project locale", () => {
    expect(translationPackForLocale(catalog, "es")?.id).toBe("es");
    expect(translationPackForLocale(catalog, "ja")?.available).toBe(false);
    expect(translationPackForLocale(catalog, "fr")).toBeNull();
  });

  it("returns only model pairs from installed packs", () => {
    expect(translationPackIDsForRegistry(catalog, ["core", "es"])).toEqual(["enpt", "pten", "enes", "esen"]);
    expect(translationPackIDsForRegistry(catalog, ["core", "ja"])).toEqual(["enpt", "pten"]);
  });

  it("formats model sizes for the settings UI", () => {
    expect(translationPackSizeLabel(45 * 1024 * 1024)).toBe("45.0 MB");
    expect(translationPackSizeLabel(512 * 1024)).toBe("512 KB");
  });
});
