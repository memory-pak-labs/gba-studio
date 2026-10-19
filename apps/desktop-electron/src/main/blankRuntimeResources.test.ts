import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createActorInProject, createRoomInProject, updateRoomFieldsInProject } from "../shared/roomsWorkspace.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject } from "../shared/projectFile.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
import { buildAssetcTilesetPackGeneration } from "../shared/engineProjectExport.js";

const blank = () => buildProjectFromTemplate("blank", { name: "My runtime" });
const records = (v: unknown) => v as Record<string, any>[];

describe("current runtime resources in new projects", () => {
  it("creates a bounded Dungeon with independent generated views, without example caches", () => {
    const data = createRoomInProject(blank(), { id: "maze", name: "My maze", sceneType: "dungeonCrawler", width: 30, height: 20 });
    const room = records(data.rooms).find(r => r.id === "maze")!;
    expect(room).toMatchObject({ width: 11, height: 11, runtime: { config: { presentation: { hudAssetName: "" } } } });
    const saved = parseGBAProjectFile(serializeGBAProjectFile({ data, summary: summarizeGBAProject(data) })).data;
    const project = buildEngineExportProjectContract(saved).dungeon_crawler_project!;
    const exported = project.rooms.find(r => r.name === room.name)!;
    expect(project.view_cache).toBeUndefined();
    expect(project.map_enabled).toBe(true);
    expect(exported.presentation).toMatchObject({ hud_background: -1, player_label: "Player", view_recipe: {
      width: 11, height: 11, cells: exported.collision_flags.map(Boolean)
    } });
    expect(exported.background).toBeUndefined();
  });

  it("generates each new Dungeon from its own geometry and preserves custom grids", () => {
    let data = createRoomInProject(blank(), { id: "one", name: "One", sceneType: "dungeonCrawler", width: 4, height: 4 });
    data = createRoomInProject(data, { id: "two", name: "Two", sceneType: "dungeonCrawler", width: 5, height: 3 });
    data = updateRoomFieldsInProject(data, "two", { collisionTypes: ["solid", ...Array(14).fill("free")] });
    const project = buildEngineExportProjectContract(data).dungeon_crawler_project!;
    expect(project.rooms.map(r => r.presentation?.view_recipe)).toEqual([
      expect.objectContaining({ width: 4, height: 4 }), expect.objectContaining({ width: 5, height: 3, cells: [true, ...Array(14).fill(false)] })
    ]);
  });

  it("binds walking and jumping clips for both newly created fighters", () => {
    const data = createRoomInProject(blank(), { id: "fight", name: "Fight", sceneType: "luta", width: 30, height: 20 });
    const withEnemy = createActorInProject(data, { id: "enemy", name: "Enemy", roomID: "fight", x: 20, y: 14 });
    for (const actor of records(withEnemy.actors).filter(a => a.roomName === "Fight")) {
      expect(actor.lutaAnimations).toMatchObject({ walk: "walk_right", jump: "jump_right" });
    }
    const fight = buildEngineExportProjectContract(withEnemy).luta_project!;
    expect(JSON.stringify(fight)).toContain('"walk"');
    expect(JSON.stringify(fight)).toContain('"jump"');
  });

  it("accepts an RPG presentation without requiring unrelated effect or music assets", () => {
    let data = createRoomInProject(blank(), { id: "battle", name: "Battle", sceneType: "battleRpg", width: 30, height: 20 });
    data = updateRoomFieldsInProject(data, "battle", { runtime: { type: "battleRpg", config: { maxPartySize: 4,
      presentation: { victoryLabel: "WIN", effectsActorId: "", disabledEscapeAssetName: "", victoryMusic: "", outcomeHoldFrames: 90, actionSounds: {} } } } });
    const battle = buildEngineExportProjectContract(data).battle_rpg_project!;
    expect(battle.encounters.find(e => e.name === "Battle")?.presentation).toMatchObject({ hud_background: -1, victory_tracker: -1, victory_label: "WIN" });
  });

  it("prepares a selected isometric background for paging without a mandatory foreground image", () => {
    let data=createRoomInProject(blank(),{id:"iso",name:"Iso",sceneType:"isometricAdventure",width:30,height:20});
    const room=records(data.rooms).find(r=>r.id==="iso")!;
    data=updateRoomFieldsInProject(data,"iso",{cameraMode:"follow_player",runtime:{type:"isometric",config:{...room.runtime.config,
      worldMode:"scrollable_tiled_world",presentationZoom:100,pagedSurface:{backgroundAsset:room.backgroundAssetName,foregroundAsset:"",width:240,height:160}}}});
    expect(buildAssetcTilesetPackGeneration(data)?.assetsBySheet[room.backgroundAssetName]?.kind).toBe("paged_bg");
    const exported=buildEngineExportProjectContract(data).isometric_project!.rooms.find(r=>r.name==="Iso")!;
    expect(exported.paged_surface).toMatchObject({width:240,height:160});
    expect(exported.paged_surface?.foreground).toBeUndefined();
  });
});
