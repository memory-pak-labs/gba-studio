import { describe, expect, it, vi } from "vitest";

import { createBlankProjectData } from "../shared/newProject.js";
import { summarizeGBAProject } from "../shared/projectFile.js";
import { saveNewProjectSession } from "./newProjectCreationFlow.js";

function blankProject() {
  const data = createBlankProjectData({ name: "Meu Jogo" });
  return { data, summary: summarizeGBAProject(data) };
}

describe("saveNewProjectSession", () => {
  it("salva o projeto antes de criar a sessao aberta", async () => {
    const project = blankProject();
    const saveProject = vi.fn().mockResolvedValue({
      canceled: false,
      path: "/tmp/meu_jogo/meu_jogo.gba-project"
    });

    const result = await saveNewProjectSession(project, saveProject);

    expect(saveProject).toHaveBeenCalledWith({ project });
    expect(result.session).toEqual({
      dirty: false,
      path: "/tmp/meu_jogo/meu_jogo.gba-project",
      project,
      redoStack: [],
      undoStack: []
    });
  });

  it("nao abre uma sessao quando o usuario cancela o destino", async () => {
    const result = await saveNewProjectSession(
      blankProject(),
      vi.fn().mockResolvedValue({ canceled: true })
    );

    expect(result.saveResult).toEqual({ canceled: true });
    expect(result.session).toBeNull();
  });

  it("nao abre uma sessao quando a gravacao falha", async () => {
    const result = await saveNewProjectSession(
      blankProject(),
      vi.fn().mockResolvedValue({ canceled: false, error: "Falha ao criar pasta" })
    );

    expect(result.session).toBeNull();
  });
});
