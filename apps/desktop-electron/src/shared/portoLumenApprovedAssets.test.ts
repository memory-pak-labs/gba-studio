import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseGBAProjectFile } from "./projectFile.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { buildAssetcSpritePackGeneration } from "./engineProjectExport.js";

const data = parseGBAProjectFile(readFileSync(new URL("../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8")).data;

describe("approved Porto Lumen actor and HUD integration", () => {
  it("keeps one approved front pose, body48, 8bpp color and independent foot collision", () => {
    for (const name of ["porto-nara-body48.png", "porto-mechanic-body48.png"]) {
      const source = (data.assets as any[]).find(asset => asset.name === name);
      expect(source.metadata).toMatchObject({ frameWidth: 32, frameHeight: 48, colorMode: "8bpp", reusableLibraryAsset: true });
      const animations = (data.animations as any[]).filter((animation: any) => animation.spriteSheet === name);
      expect(animations).toHaveLength(1);
      expect(animations[0]).toMatchObject({ frameCount: 1, hitboxWidth: 16, hitboxHeight: 16, originX: 0, originY: 0 });
    }
    expect((data.actors as any[]).find(actor => actor.id === "port-nara").spriteSheet).toBe("porto-nara-animations48.png");
  });

  it("exports the approved HUD pixel layout with live project bindings and compact digits", () => {
    const contract = buildEngineExportProjectContract(data);
    expect(contract.requires.features).toContain("hud_project_value_bindings");
    expect(contract.requires.features).toContain("hud_compact_text");
    expect(contract.requires.features).toContain("hud_foreground_images");
    const ui = contract.topdown_project!.dialogue_ui!;
    const layout = ui.hud_layouts!.find(layout => layout.id === "hud-porto-lumen-b")!;
    expect(ui.hud_scene_bindings).toContainEqual({ scene_name: "porto_lumen", preset_id: layout.id });
    expect(layout.components.find(component => component.id === "life-frame")).toMatchObject({ x: 4, y: 4, width: 60, height: 18 });
    expect(layout.components.find(component => component.id === "coins")).toMatchObject({ x: 204, y: 9, text: "000", inventory_item: 0, text_advance: 6 });
    expect(layout.components.find(component => component.id === "hearts")).toMatchObject({ value_variable: (data.variables as any[]).findIndex(variable => variable.name === "porto_player_health"), value_maximum: 3, foreground_image: true, gauge: { width: 48 } });
    const actor = contract.topdown_project!.actor_sprites!.find((actor: any) => actor.name === "porto-nara-animations48.png")!;
    expect(actor.animations).toHaveLength(8);
    expect(actor.animations![0]!.frame_metasprites![0]!.parts).toHaveLength(2);
    expect(actor.animations![0]!.frame_metasprites![0]!.parts[0]).toMatchObject({ x: -8, y: -40 });
  });
});
