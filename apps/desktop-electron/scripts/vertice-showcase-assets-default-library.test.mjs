import { describe, expect, it } from "vitest";

import { syncVerticeShowcaseAssets } from "./vertice-showcase-assets.mjs";

describe("biblioteca visual padrão de Vértice", () => {
  it("não repopula a biblioteca visual legada", async () => {
    await expect(syncVerticeShowcaseAssets({
      templateProjectPath: "template.gba-project",
      fixtureProjectPath: "fixture.gba-project"
    })).rejects.toThrow(/biblioteca visual legada.*arquivada/i);
  });
});
