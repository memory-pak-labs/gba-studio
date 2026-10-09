import { describe, expect, it } from "vitest";
import { defaultProjectSaveRelativePath, projectSlug } from "./projectPaths.js";

describe("projectPaths", () => {
  it("slugifies project names for filesystem-safe folders", () => {
    expect(projectSlug("Meu Jogo")).toBe("meu_jogo");
    expect(projectSlug("  Meu Jogo: Alpha!  ")).toBe("meu_jogo_alpha");
    expect(projectSlug("")).toBe("novo_projeto");
  });

  it("builds the default save path inside a project folder", () => {
    expect(defaultProjectSaveRelativePath("Meu Jogo")).toBe("meu_jogo/meu_jogo.gba-project");
    expect(defaultProjectSaveRelativePath("Novo projeto")).toBe("novo_projeto/novo_projeto.gba-project");
  });
});
