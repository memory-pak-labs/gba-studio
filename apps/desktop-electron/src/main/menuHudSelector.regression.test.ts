import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createRoomInProject } from "../shared/roomsWorkspace.js";
import { buildAssetcSpritePackGeneration } from "../shared/engineProjectExport.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

describe("authored menu HUD selector", () => {
  it("exports the selected image and reserves it with its scene instead of substituting punctuation", () => {
    const data = createRoomInProject(buildProjectFromTemplate("blank", { name: "Menu" }), {
      id: "sound", name: "Sound", sceneType: "menu", width: 30, height: 20
    });
    const contract = buildEngineExportProjectContract(data);
    const layout = contract.menu_project!.dialogue_ui!.hud_layouts!.find(item => item.id === "hud-neutral-menu")!;
    expect(layout).toMatchObject({ selector_asset: "neutral_hud_arrow_right" });
    expect(contract.requires.features).toContain("hud_menu_selector");
    const pack = buildAssetcSpritePackGeneration(data)!;
    expect(pack.assetsBySheet["neutral-hud-arrow-right.png"]).toBeDefined();
    const serialized = JSON.parse(JSON.stringify(data));
    serialized.settings.hudPresets.find((item: { id: string }) => item.id === "hud-neutral-menu").selectorImage = "";
    const without = buildEngineExportProjectContract(serialized);
    expect(without.menu_project!.dialogue_ui!.hud_layouts!.find(item => item.id === "hud-neutral-menu")).not.toHaveProperty("selector_asset");
    // The native runtime still draws its built-in marker without a custom image.
    expect(without.requires.features).toContain("hud_menu_selector");
  });
});
