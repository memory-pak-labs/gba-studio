import { describe, expect, it } from "vitest";
import { buildProjectPluginRegistry, loadedPluginFromManifest } from "./gbaStudioPlugins.js";
import { isPluginPreviewVerb, rewritePluginPreviewCommand } from "./gbaStudioPluginPreview.js";

describe("gbaStudioPluginPreview", () => {
  it("reescreve verbo de plugin para op nativa do preview", () => {
    const plugin = loadedPluginFromManifest({
      id: "acme/custom-events",
      type: "eventCommandPack",
      version: "1.0.0",
      gbaStudioVersion: ">=0.1.0",
      name: "Custom Events",
      author: "Acme",
      description: "Eventos customizados.",
      commands: [
        {
          id: "custom_wait",
          title: "Espera customizada",
          category: "Plugin",
          commandTemplate: "acme_wait {value}",
          export: {
            op: "wait",
            opcode: "Wait",
            arg0Token: 1
          }
        }
      ]
    }, "/tmp/acme/custom-events", "/tmp/acme/custom-events/plugin.json");

    if (!plugin) throw new Error("plugin ausente");
    const registry = buildProjectPluginRegistry([plugin]);

    expect(isPluginPreviewVerb(registry, "acme_wait")).toBe(true);
    expect(rewritePluginPreviewCommand("acme_wait 18", registry)).toBe("wait 18");
  });
});
