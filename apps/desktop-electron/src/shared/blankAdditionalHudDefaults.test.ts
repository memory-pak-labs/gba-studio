import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "./projectTemplates.js";
import { createRoomInProject } from "./roomsWorkspace.js";
import { deriveHudPresetsWorkspacePresentation } from "./hudPresets.js";
import { buildEngineExportProjectContract, prepareEngineProjectExport } from "../main/exportEngineProject.js";
import { buildAssetcSpritePackGeneration } from "./engineProjectExport.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject } from "./projectFile.js";

describe("remaining approved scene HUDs", () => {
  it("keeps compact RPG status separate from the live battle dialogue and binds both health bars", () => {
    const data = createRoomInProject(buildProjectFromTemplate("blank", { name: "Compact battle" }),
      { id: "qa", name: "QA", sceneType: "battleRpg", width: 30, height: 20 });
    const hud = deriveHudPresetsWorkspacePresentation(data).presets.find(p => p.id === "hud-neutral-batalha-rpg")!;
    const frames = hud.components.filter(c => c.kind === "frame");
    expect(frames).toHaveLength(2);
    for (const frame of frames) {
      expect(frame.width).toBe(104);
      expect(frame.height).toBe(32);
      expect(frame.y + frame.height).toBeLessThanOrEqual(104);
    }
    const bars = hud.components.filter(c => c.kind === "bar");
    expect(bars.map(c => c.valueBinding)).toEqual(["p1-health", "p2-health"]);
    // Independently changing gauges cannot write into the same OBJ tile range.
    expect(new Set(bars.map(c => c.asset)).size).toBe(2);
    expect(bars.every(c => c.gauge?.emptyAsset === "neutral-hud-bar-empty.png")).toBe(true);
    for (const side of ["party", "enemy"]) {
      const name = hud.components.find(c => c.id === `battle-${side}-name`)!;
      const hp = hud.components.find(c => c.id === `battle-${side}-hp`)!;
      const bar = hud.components.find(c => c.id === `battle-${side}-health`)!;
      expect(hp.x).toBeGreaterThanOrEqual(name.x + name.width + 8);
      expect(bar.y).toBeGreaterThanOrEqual(name.y + name.height);
    }
    expect(hud.components.filter(c => c.runtimeText).map(c => c.id)).toEqual([
      "battle-party-name", "battle-enemy-name", "battle-party-hp", "battle-enemy-hp"
    ]);
    expect(hud.components.some(c => c.asset.includes("batalha-rpg-commands"))).toBe(false);
    const contract = buildEngineExportProjectContract(data);
    const nativeHud = contract.battle_rpg_project!.dialogue_ui!.hud_layouts!.find((p: any) => p.id === hud.id)!;
    expect(nativeHud.components.filter((c: any) => c.kind === "bar").map((c: any) => c.value_binding)).toEqual(["p1-health", "p2-health"]);
  });
  it("exports dialogue-only blank scenes without unrelated HUD and ship reservations", () => {
    const data=buildProjectFromTemplate("blank",{name:"Budget"});
    const pack=buildAssetcSpritePackGeneration(data)!;
    expect(pack.assetsBySheet["neutral-hud-frame-wide.png"]).toBeUndefined();
    expect(pack.assetsBySheet["neutral-player-shmup-horizontal.png"]).toBeUndefined();
  });
  it("exports empty menu, world map and RPG defaults within the native scene contracts", () => {
    for(const sceneType of ["menu","worldMap","battleRpg"]){
      const data=createRoomInProject(buildProjectFromTemplate("blank",{name:"Empty"}),{id:"qa",name:"QA",sceneType,width:30,height:20});
      const room=(data.rooms as Record<string,unknown>[]).find(r=>r.id==="qa")!;
      data.rooms=[room];data.scenas=data.rooms;data.scena=data.rooms;
      data.actors=(data.actors as Record<string,unknown>[]).filter(a=>a.roomName==="QA");
      (data.settings as Record<string,any>).general.startScene="QA";
      (data.settings as Record<string,any>).general.startSceneType=sceneType;
      const contract=buildEngineExportProjectContract(data);
      if(sceneType==="menu") expect(contract.menu_project?.screens[0]).toMatchObject({title_line:-1,presentation_mode:"hud",hud_list_rows:3});
      if(sceneType==="worldMap") expect(contract.world_map_project?.nodes[0].line).toBe(-1);
      if(sceneType==="battleRpg") expect(contract.battle_rpg_project?.encounters[0].config.max_party_size).toBeLessThanOrEqual(4);
    }
  });
  it("keeps unused HUD artwork in the authoring library without reserving it in the ROM sprite pack", () => {
    const data=createRoomInProject(buildProjectFromTemplate("blank",{name:"Budget"}),{id:"qa",name:"QA",sceneType:"platformer",width:30,height:20});
    const pack=buildAssetcSpritePackGeneration(data)!;
    expect(pack.assetsBySheet["neutral-hud-plataforma-life.png"]).toBeDefined();
    expect(pack.assetsBySheet["neutral-hud-menu-frame.png"]).toBeUndefined();
    expect((data.assets as Record<string,unknown>[]).some(a=>a.name==="neutral-hud-menu-frame.png")).toBe(true);
  });
  it.each([
    ["platformer","plataforma"],["racing","corrida"],["dungeonCrawler","dungeon-crawler"],
    ["isometricTactical","tatica-isometrica"],["battleRpg","batalha-rpg"],
    ["pointAndClick","apontar-clicar"],["menu","menu"],["worldMap","mapa-mundial"]
  ])("assigns %s to a new blank scene and retains its asset pieces after reopening", (sceneType, key) => {
    const next = createRoomInProject(buildProjectFromTemplate("blank",{name:"New HUDs"}),{id:"qa",name:"QA",sceneType,width:30,height:20});
    const room = (next.rooms as Record<string,unknown>[]).find(r=>r.id==="qa")!;
    expect(room.hudPresetId).toBe(`hud-neutral-${key}`);
    const reopened = parseGBAProjectFile(serializeGBAProjectFile({data:next,summary:summarizeGBAProject(next)})).data;
    const preset = deriveHudPresetsWorkspacePresentation(reopened).presets.find(p=>p.id===room.hudPresetId)!;
    expect(preset).toBeDefined();
    expect(preset.components.filter(c=>c.asset).length).toBeLessThanOrEqual(8);
    for (const c of preset.components.filter(c=>c.asset)) {
      expect((reopened.assets as Record<string,unknown>[]).some(a=>a.name===c.asset)).toBe(true);
      expect(c.x+c.width).toBeLessThanOrEqual(240);
      expect(c.y+c.height).toBeLessThanOrEqual(160);
    }
    expect(prepareEngineProjectExport(reopened,{developmentStartScene:{id:"qa",name:"QA"}}).error).toBeUndefined();
  });
  it("keeps adventure isometric and dialogue scenes independent from gameplay HUDs", () => {
    const original = buildProjectFromTemplate("blank",{name:"No forced HUD"});
    for(const sceneType of ["isometricAdventure","visualNovel","cutscene"]){
      const data=createRoomInProject(original,{id:"qa",name:"QA",sceneType,width:30,height:20});
      expect((data.rooms as Record<string,unknown>[]).find(r=>r.id==="qa")?.hudPresetId).toBeUndefined();
    }
  });
});
