import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createRoomInProject } from "../shared/roomsWorkspace.js";
import { createSceneHudVariationInProject } from "../shared/hudSceneAuthoring.js";
import { deriveHudPresetsWorkspacePresentation, updateHudPresetInProject } from "../shared/hudPresets.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject } from "../shared/projectFile.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

describe("authored HUD text profiles", () => {
  it("retains the Dungeon text contract across a scene variation, save/reopen and export", () => {
    const data = createRoomInProject(buildProjectFromTemplate("blank", { name: "HUD copy" }),
      { id: "lab", name: "Lab", sceneType: "dungeonCrawler", width: 11, height: 11 });
    const source = deriveHudPresetsWorkspacePresentation(data).presets.find(p => p.id === "hud-neutral-dungeon-crawler")!;
    expect(source).toMatchObject({ runtimeTextProfile: "dungeon-status" });
    const copy = createSceneHudVariationInProject(data, "lab", source.id, "my-custom-hud", "My HUD");
    const reopened = parseGBAProjectFile(serializeGBAProjectFile({ data: copy, summary: summarizeGBAProject(copy) })).data;
    const preset = deriveHudPresetsWorkspacePresentation(reopened).presets.find(p => p.id === "my-custom-hud")!;
    expect(preset).toMatchObject({ runtimeTextProfile: "dungeon-status", components: source.components });
    const contract = buildEngineExportProjectContract(reopened);
    expect(contract.dungeon_crawler_project!.dialogue_ui!.hud_layouts!.find(p => p.id === preset.id)).toMatchObject({ text_profile: "dungeon-status" });
    expect(contract.requires.features).toContain("hud_runtime_text_profiles");
    const standard = updateHudPresetInProject(reopened, preset.id, { runtimeTextProfile: "standard" });
    expect(buildEngineExportProjectContract(standard).dungeon_crawler_project!.dialogue_ui!.hud_layouts!.find(p => p.id === preset.id)).not.toHaveProperty("text_profile");
  });
  it.each([
    ["hud-neutral-dungeon-crawler", "dungeon-status"],
    ["hud-usina-lateral", "dungeon-sidebar-contextual"],
    ["hud-usina-exploration-v3", "dungeon-sidebar"],
    ["hud-usina-combat-v3", "dungeon-sidebar"],
    ["hud-usina-exit-v3", "dungeon-sidebar"]
  ])("preserves the current shipped contract of %s when it is copied", (id, profile) => {
    const data = { settings: { hudPresets: [{ id, name: "Source", mode: "advanced", components: [] }] } };
    expect(deriveHudPresetsWorkspacePresentation(data).presets.find(p => p.id === id)).toMatchObject({ runtimeTextProfile: profile });
    const explicit = { settings: { hudPresets: [{ id, name: "User override", runtimeTextProfile: "standard", components: [] }] } };
    expect(deriveHudPresetsWorkspacePresentation(explicit).presets.find(p => p.id === id)?.runtimeTextProfile ?? "standard").toBe("standard");
  });
});
