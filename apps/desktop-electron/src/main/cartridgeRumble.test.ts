import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "../shared/newProject.js";
import { updateSettingsFieldInProject, deriveSettingsWorkspacePresentation } from "../shared/settingsWorkspace.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

describe("explicit cartridge rumble selection", () => {
  it("defaults to no driver and preserves the original project while configuring a supported board", () => {
    const original = createBlankProjectData({ name: "Cartucho", includeStarterContent: true });
    const before = JSON.stringify(original);
    expect(buildEngineExportProjectContract(original)).toMatchObject({ rumble_cartridge: "none" });
    const selected = updateSettingsFieldInProject(original, "hardware", "rumbleCartridge", "chisflash_v1_2");
    expect(selected).not.toBe(original);
    expect(JSON.stringify(original)).toBe(before);
    const reopened = JSON.parse(JSON.stringify(selected));
    const exported = buildEngineExportProjectContract(reopened);
    expect(exported).toMatchObject({ rumble_cartridge: "chisflash_v1_2" });
    expect(exported.requires?.features).toContain("rumble.rumble_project_configuration");
    expect(exported.requires?.features).toContain("rumble.rumble_chisflash_v12_opt_in");
    const disabled = updateSettingsFieldInProject(reopened, "hardware", "rumbleCartridge", "none");
    expect(buildEngineExportProjectContract(disabled)).toMatchObject({ rumble_cartridge: "none" });
    expect(updateSettingsFieldInProject(original, "hardware", "rumbleCartridge", "unknown")).toBe(original);
    const invalid = structuredClone(original);
    (invalid.settings as any).hardware = { rumbleCartridge: "unknown" };
    expect(() => buildEngineExportProjectContract(invalid)).toThrow(/cartucho/i);
  });
  it("offers a disabled default and labels the board profile as experimental", () => {
    const data = createBlankProjectData({ name: "Cartucho", includeStarterContent: true });
    const hardware = deriveSettingsWorkspacePresentation(data).sections.find(section => section.id === "hardware")!;
    const field = hardware.editableFields.find(field => field.key === "rumbleCartridge")!;
    expect(field.value).toBe("none");
    expect(field.options).toEqual([
      { value: "none", label: "Desativada" },
      { value: "chisflash_v1_2", label: "ChisFlash v1.2 · experimental" }
    ]);
    expect(field.description).toContain("cartucho");
  });
});
