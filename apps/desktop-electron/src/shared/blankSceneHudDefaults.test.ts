import { createBlankProjectData } from "./newProject.js";
import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "./projectTemplates.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject } from "./projectFile.js";
import { createRoomInProject } from "./roomsWorkspace.js";
import { deriveHudPresetsWorkspacePresentation } from "./hudPresets.js";
import { prepareEngineProjectExport } from "../main/exportEngineProject.js";
import { buildAssetcSpritePackGeneration } from "./engineProjectExport.js";

describe("approved scene HUD defaults", () => {
  it.each([["luta", "hud-neutral-fight"], ["shmup", "hud-neutral-shmup"]])("assigns %s only to new blank-profile scenes and preserves bindings on reopen", (sceneType, presetID) => {
    const original = buildProjectFromTemplate("blank", {name:"HUD QA"});
    const next = createRoomInProject(original, {id:"qa",name:"QA",sceneType,width:30,height:20});
    expect((next.rooms as any[]).find(room => room.id === "qa").hudPresetId).toBe(presetID);
    expect((original.rooms as any[])).toHaveLength(1);
    expect((original.rooms as any[])[0].hudPresetId).toBeUndefined();
    const reopened = parseGBAProjectFile(serializeGBAProjectFile({data:next,summary:summarizeGBAProject(next)})).data;
    const preset = deriveHudPresetsWorkspacePresentation(reopened).presets.find(p => p.id === presetID)!;
    expect(preset?.components.some((c:any) => c.valueBinding)).toBe(true);
    const plain = createRoomInProject(createBlankProjectData({name:"Plain"}), {id:"other",name:"Other",sceneType,width:30,height:20});
    expect((plain.rooms as any[]).find(room => room.id === "other").hudPresetId).toBeUndefined();
  });
  it("exports named gameplay values, independent bar sources and round states through the real sprite pack", () => {
    const data = createRoomInProject(buildProjectFromTemplate("blank",{name:"Bindings"}),{id:"fight",name:"Fight",sceneType:"luta",width:30,height:20});
    const prepared = prepareEngineProjectExport(data);
    expect(prepared.error).toBeUndefined();
    const contract = prepared.generated!.contract as any;
    const ui = contract.luta_project.dialogue_ui;
    const components = ui.hud_layouts.find((p:any) => p.id === "hud-neutral-fight").components;
    expect(components.find((c:any) => c.value_binding === "p1-health").gauge).toMatchObject({empty_asset:"neutral_hud_fight_life_empty",x:5,y:5,width:86,height:6});
    expect(components.find((c:any) => c.value_binding === "p2-health").gauge.reverse).toBe(true);
    expect(components.find((c:any) => c.value_binding === "p1-rounds").state_assets).toHaveLength(2);
    const pack = buildAssetcSpritePackGeneration(data)!;
    expect(pack.assetsBySheet["neutral-hud-fight-life-empty.png"]).toMatchObject({sprite_width:96,sprite_height:32});
    expect(pack.assetsBySheet["neutral-hud-fight-rounds-2.png"]).toBeDefined();
  });
  it("starts the blank Shoot-up with scoring enabled so its default counter can change", () => {
    const data = createRoomInProject(buildProjectFromTemplate("blank",{name:"Score"}),{id:"flight",name:"Flight",sceneType:"shmup",width:30,height:20});
    const prepared = prepareEngineProjectExport(data,{developmentStartScene:{id:"flight",name:"Flight"}});
    expect(prepared.error).toBeUndefined();
    expect((prepared.generated!.contract as any).shmup_project).toMatchObject({score_enabled:true,initial_score:0,initial_lives:3});
  });
});
