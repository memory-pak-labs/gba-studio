import { describe, expect, it } from "vitest";
import { deriveSettingsWorkspacePresentation } from "./settingsWorkspace.js";
import { deriveExportSettingsSections, exportStartReferenceOptions, resetExportSettingsPageInProject, exportRomOutputPath } from "./exportSettingsLayout.js";

describe("export settings pages", () => {
  it("shows the actual export target directory and normalized ROM filename", () => {
    expect(exportRomOutputPath({ settings: { general: { exportFolder: "/" }, build: { romFileName: "game.gba" } } })).toBe("/game/game.gba");
    expect(exportRomOutputPath({ settings: { general: { exportFolder: "build" }, build: { romFileName: "Meu Jogo!.gba" } } })).toBe("build/meu_jogo/meu_jogo.gba");
    expect(exportRomOutputPath({ settings: { general: { exportFolder: "/tmp/output/" }, build: { romFileName: "layout-test.gba" } } })).toBe("/tmp/output/layout_test/layout_test.gba");
  });

  it("uses the exporter's real title and project-name fallbacks when the ROM name is empty", () => {
    expect(exportRomOutputPath({ name: "Projeto", settings: { general: { gameTitle: "O Último Farol" }, build: { romFileName: "" } } }))
      .toBe("build/o_ultimo_farol/o_ultimo_farol.gba");
    expect(exportRomOutputPath({ name: "Projeto" })).toBe("build/projeto/projeto.gba");
    expect(exportRomOutputPath(null)).toBe("build/projeto_sem_nome/projeto_sem_nome.gba");
  });

  it("partitions every operational field exactly once without changing its storage section", () => {
    const original = deriveSettingsWorkspacePresentation({ settings: {} });
    const pages = deriveExportSettingsSections(original);
    const general = pages.find(section => section.id === "general")!;
    const build = pages.find(section => section.id === "build")!;
    expect(general.title).toBe("Projeto e ROM");
    expect(general.editableFields.map(field => field.key)).toContain("romFileName");
    expect(build.title).toBe("Compilação");
    expect(build.editableFields.map(field => field.key)).not.toContain("romFileName");
    expect([...general.editableFields, ...build.editableFields].map(field => field.key).sort())
      .toEqual(original.sections.filter(section => ["general", "build"].includes(section.id)).flatMap(section => section.editableFields.map(field => field.key)).sort());
  });
  it("restores only the displayed project/ROM fields, preserving compilation and unknown data", () => {
    const data = { settings: { general: { gameTitle: "Teste", startScene: "intro", startSceneType: "cutscene", custom: 7 }, build: { romFileName: "test.gba", gameCode: "TEST", persistentBuildCache: false, enginePackPath: "/pack", custom: 9 } }, actors: [{ name: "Nara" }] };
    const next = resetExportSettingsPageInProject(data, "general");
    expect((next.settings as Record<string, unknown>).general).toMatchObject({ gameTitle: "", startScene: "", startSceneType: "cutscene", custom: 7 });
    expect((next.settings as Record<string, unknown>).build).toMatchObject({ romFileName: "game.gba", gameCode: "GBS0", persistentBuildCache: false, enginePackPath: "/pack", custom: 9 });
    expect(next.actors).toEqual(data.actors);
    expect(data.settings.general.gameTitle).toBe("Teste");
  });
  it("restores compilation independently and never overwrites informational fields", () => {
    const data = { settings: { general: { gameTitle: "Jogo" }, build: { romFileName: "test.gba", gameCode: "TEST", persistentBuildCache: false, enginePackPath: "/pack", compilerPath: "/old", engineBackend: "stored" } } };
    const next = resetExportSettingsPageInProject(data, "build");
    expect((next.settings as Record<string, unknown>).general).toEqual(data.settings.general);
    expect((next.settings as Record<string, unknown>).build).toMatchObject({ romFileName: "test.gba", gameCode: "TEST", persistentBuildCache: true, enginePackPath: "", compilerPath: "/old", engineBackend: "stored" });
  });
  it("lists real scene and actor names, deduplicates actors and preserves an unset option", () => {
    expect(exportStartReferenceOptions({ scenas: [{ name: "logo" }, { name: "port" }], actors: [{ name: "Nara" }, { name: "Nara" }, { name: "Guard" }] })).toEqual({
      scenes: [{ value: "", label: "Primeira cena do projeto" }, { value: "logo", label: "logo" }, { value: "port", label: "port" }],
      players: [{ value: "", label: "Padrão da cena (opcional)" }, { value: "Nara", label: "Nara" }, { value: "Guard", label: "Guard" }]
    });
  });
});
