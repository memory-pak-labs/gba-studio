import { describe, expect, it, vi } from "vitest";

import { runFilesImportFlow } from "./filesImportFlow.js";

describe("runFilesImportFlow", () => {
  it("salva um projeto novo e continua a importacao com o caminho criado", async () => {
    const saveProject = vi.fn().mockResolvedValue({
      canceled: false,
      path: "/tmp/My Game/My Game.gba-project"
    });
    const importAssets = vi.fn().mockResolvedValue({ canceled: false, assets: [] });
    const onSaveResult = vi.fn();

    const result = await runFilesImportFlow({
      importAssets,
      onSaveResult,
      projectPath: undefined,
      saveProject
    });

    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(onSaveResult).toHaveBeenCalledWith({
      canceled: false,
      path: "/tmp/My Game/My Game.gba-project"
    });
    expect(importAssets).toHaveBeenCalledWith({ projectPath: "/tmp/My Game/My Game.gba-project" });
    expect(result).toEqual({
      projectPath: "/tmp/My Game/My Game.gba-project",
      result: { canceled: false, assets: [] }
    });
  });

  it("nao pede novo salvamento quando o projeto ja tem caminho", async () => {
    const saveProject = vi.fn();
    const importAssets = vi.fn().mockResolvedValue({ canceled: true });

    await runFilesImportFlow({
      importAssets,
      projectPath: "/tmp/game/game.gba-project",
      saveProject
    });

    expect(saveProject).not.toHaveBeenCalled();
    expect(importAssets).toHaveBeenCalledWith({ projectPath: "/tmp/game/game.gba-project" });
  });

  it("interrompe a importacao quando o salvamento e cancelado", async () => {
    const importAssets = vi.fn();

    const result = await runFilesImportFlow({
      importAssets,
      projectPath: undefined,
      saveProject: vi.fn().mockResolvedValue({ canceled: true })
    });

    expect(importAssets).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
