import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "./projectTemplates.js";
import { createBlankProjectData } from "./newProject.js";
import { createDialogueInProject } from "./dialoguesWorkspace.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject } from "./projectFile.js";
import { buildAssetcPortraitPackGeneration } from "./engineProjectExport.js";
import { prepareEngineProjectExport } from "../main/exportEngineProject.js";

describe("approved blank dialogue assets", () => {
  it("starts with the approved skin and fixed portrait slots while keeping dialogues empty", () => {
    const data = buildProjectFromTemplate("blank", { name: "Dialogue QA" });
    expect(data.settings).toMatchObject({ uiDialogs: {
      boxImage: "neutral-dialogue-skin.png", defaultPortrait: "neutral-portrait.png",
      portraitLayout: "fixed_slots", boxWidth: 224, boxHeight: 40
    } });
    expect(data.dialogues).toEqual([]);
    expect(data.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({name:"neutral-dialogue-skin.png",kind:"UI"}),
      expect.objectContaining({name:"neutral-portrait.png",kind:"Portrait",metadata:expect.objectContaining({frameWidth:64,frameHeight:64})})
    ]));
  });
  it("uses the portrait on new lines, persists it and permits explicit lines without a portrait", () => {
    const blank = buildProjectFromTemplate("blank", {name:"New lines"});
    const added = createDialogueInProject(blank, {key:"intro",text:"Olá!"});
    const reopened = parseGBAProjectFile(serializeGBAProjectFile({data:added,summary:summarizeGBAProject(added)})).data;
    expect((reopened.dialogues as Record<string,unknown>[])[0]).toMatchObject({portrait:"neutral-portrait.png"});
    const hidden = createDialogueInProject(reopened, {key:"narration",text:"Sem retrato",portrait:""});
    expect((hidden.dialogues as Record<string,unknown>[])[1]).toMatchObject({portrait:""});
    const plain = createDialogueInProject(createBlankProjectData({name:"Existing defaults"}), {key:"plain"});
    expect((plain.dialogues as Record<string,unknown>[])[0]).toMatchObject({portrait:""});
    expect(blank.dialogues).toEqual([]);
  });
  it("exports the existing dialogue consumer with a single 64x64 OBJ portrait", () => {
    const data = createDialogueInProject(buildProjectFromTemplate("blank",{name:"Export"}),{key:"intro",text:"Exemplo"});
    const portrait = buildAssetcPortraitPackGeneration(data,null)!;
    expect(portrait.assetsByPortraitName["neutral-portrait.png"]).toMatchObject({sprite_width:64,sprite_height:64,kind:"obj"});
    const prepared = prepareEngineProjectExport(data);
    expect(prepared.error).toBeUndefined();
    expect(prepared.generated?.assets.some(asset=>asset.name==="neutral-dialogue-skin.png")).toBe(true);
    expect(prepared.generated?.assets.find(asset=>asset.name==="neutral-dialogue-selector.png")?.output).toBe("assets/ui/neutral_dialogue_selector.png");
  });
});
