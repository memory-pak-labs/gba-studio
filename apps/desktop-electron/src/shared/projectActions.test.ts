import { describe, expect, it } from "vitest";
import { deriveProjectActionMenuItems } from "./projectActions.js";

describe("deriveProjectActionMenuItems", () => {
  it("matches the project action menu labels from the desktop reference", () => {
    const items = deriveProjectActionMenuItems({
      hasSession: true,
      hasProjectPath: true,
      hasEngineAssetc: true,
      hasEngineBuild: true,
      contractDiagnosticsOK: true,
      buildRunning: false,
      exportRunning: false
    });

    expect(items.map((item) => item.label)).toEqual([
      "Criar backup",
      "Exportar ROM .gba",
      "Exportar Web / itch.io",
      "Fechar projeto"
    ]);
  });

  it("keeps destructive or unavailable project actions disabled until prerequisites exist", () => {
    const items = deriveProjectActionMenuItems({
      hasSession: false,
      hasProjectPath: false,
      hasEngineAssetc: false,
      hasEngineBuild: false,
      contractDiagnosticsOK: null,
      buildRunning: false,
      exportRunning: false
    });

    expect(items.find((item) => item.id === "create-backup")?.disabled).toBe(true);
    expect(items.find((item) => item.id === "export-rom-engine")?.reason).toBe("Abra ou crie um projeto antes de gerar a ROM.");
    expect(items.find((item) => item.id === "export-web")?.reason).toBe("Abra ou crie um projeto antes de exportar Web.");
    expect(items.find((item) => item.id === "close-project")?.disabled).toBe(true);
  });

  it("enables backup and close for an unsaved project while requiring a saved path for ROM and Web exports", () => {
    const items = deriveProjectActionMenuItems({
      hasSession: true,
      hasProjectPath: false,
      hasEngineAssetc: true,
      hasEngineBuild: true,
      contractDiagnosticsOK: true,
      buildRunning: false,
      exportRunning: false
    });

    expect(items.find((item) => item.id === "create-backup")?.disabled).toBe(false);
    expect(items.find((item) => item.id === "close-project")?.disabled).toBe(false);
    expect(items.find((item) => item.id === "export-rom-engine")?.reason).toBe("Salve o projeto antes de gerar a ROM.");
    expect(items.find((item) => item.id === "export-web")?.reason).toBe("Salve o projeto antes de exportar Web.");
  });

  it("enables Web export when the saved project and Engine Pack prerequisites exist", () => {
    const items = deriveProjectActionMenuItems({
      hasSession: true,
      hasProjectPath: true,
      hasEngineAssetc: true,
      hasEngineBuild: true,
      contractDiagnosticsOK: true,
      buildRunning: false,
      exportRunning: false
    });

    expect(items.find((item) => item.id === "export-web")).toEqual({
      id: "export-web",
      label: "Exportar Web / itch.io",
      disabled: false,
      reason: undefined
    });
  });
});
