import { describe, expect, it } from "vitest";

import { workspaceNames } from "./workspaceNavigation.js";

describe("workspace navigation", () => {
  it("mantem apenas workspaces de autoria com responsabilidade propria", () => {
    expect(workspaceNames).toEqual([
      "Editor",
      "Cenas",
      "Sprites",
      "Dialogos",
      "Audio",
      "Arquivos",
      "Exportar",
      "Ajustes"
    ]);
    expect(workspaceNames).not.toContain("Ferramentas");
    expect(workspaceNames).not.toContain("Interfaces");
  });
});
