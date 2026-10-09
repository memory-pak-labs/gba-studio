import { describe, expect, it } from "vitest";
import {
  parsePluginRepositoryJson,
  pluginRepositoryEntryArchiveURL,
  DEFAULT_PLUGIN_REPOSITORY_URL
} from "./gbaStudioPluginRepository.js";

describe("gbaStudioPluginRepository", () => {
  it("valida repository.json minimo", () => {
    const parsed = parsePluginRepositoryJson(JSON.stringify({
      name: "Catalogo",
      plugins: [
        {
          id: "acme/demo",
          type: "eventCommandPack",
          gbaStudioVersion: ">=0.1.0",
          name: "Demo",
          author: "Acme",
          description: "Plugin demo.",
          version: "1.0.0",
          filename: "acme/demo/plugin.zip"
        }
      ]
    }));

    expect(parsed).toMatchObject({
      repository: {
        name: "Catalogo",
        plugins: [{ id: "acme/demo", filename: "acme/demo/plugin.zip" }]
      }
    });
  });

  it("resolve archiveURL relativo ao catalogo", () => {
    const url = pluginRepositoryEntryArchiveURL("https://example.com/plugins/repository.json", {
      id: "acme/demo",
      type: "eventCommandPack",
      gbaStudioVersion: ">=0.1.0",
      name: "Demo",
      author: "Acme",
      description: "Plugin demo.",
      version: "1.0.0",
      filename: "acme/demo/plugin.zip"
    });

    expect(url).toBe("https://example.com/plugins/acme/demo/plugin.zip");
  });

  it("starts without a public catalog and accepts an empty future repository", () => {
    expect(DEFAULT_PLUGIN_REPOSITORY_URL).toBe("");
    expect(parsePluginRepositoryJson('{"name":"GBA Studio Community","plugins":[]}')).toEqual({ repository: { name: "GBA Studio Community", plugins: [] } });
  });

  it.each(["eventsPlugin", "enginePlugin", "template", "theme", "lang"])("rejects GB Studio entry type %s", (type) => {
    const parsed = parsePluginRepositoryJson(JSON.stringify({ name: "Community", plugins: [{ id: "acme/demo", type, gbaStudioVersion: ">=0.1.0", name: "Demo", author: "Acme", description: "Demo", version: "1.0.0", filename: "demo.zip" }] }));
    expect(parsed).toEqual({ error: expect.stringContaining("GBA Studio") });
  });

  it("requires an explicit GBA Studio version instead of gbsVersion", () => {
    const parsed = parsePluginRepositoryJson(JSON.stringify({ name: "Community", plugins: [{ id: "acme/demo", type: "eventCommandPack", gbsVersion: ">=0.1.0", name: "Demo", author: "Acme", description: "Demo", version: "1.0.0", filename: "demo.zip" }] }));
    expect(parsed).toEqual({ error: expect.stringContaining("gbaStudioVersion") });
  });

  it("rejects a repository entry requiring a newer GBA Studio", () => {
    const parsed = parsePluginRepositoryJson(JSON.stringify({ name: "Community", plugins: [{ id: "acme/demo", type: "eventCommandPack", gbaStudioVersion: ">=99.0.0", name: "Demo", author: "Acme", description: "Demo", version: "1.0.0", filename: "demo.zip" }] }));
    expect(parsed).toEqual({ error: expect.stringContaining("99.0.0") });
  });
});
