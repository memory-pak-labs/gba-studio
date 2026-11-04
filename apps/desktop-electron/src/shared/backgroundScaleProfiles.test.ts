import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { createBlankProjectData } from "./newProject.js";
import { eventCommandIntegrationIssue } from "./eventCommandSupport.js";

const profiles = [
  ["menu", "menu_project", "screens"], ["cutscene", "cutscene_project", "scenes"],
  ["visualNovel", "visual_novel_project", "scenes"], ["pointAndClick", "point_click_project", "scenes"],
  ["battleRpg", "battle_rpg_project", "encounters"], ["luta", "luta_project", "stages"],
  ["worldMap", "world_map_project", null], ["dungeonCrawler", "dungeon_crawler_project", "rooms"],
  ["racing", "racing_project", "rooms"], ["isometric", "isometric_project", "rooms"]
] as const;

function project(type: string, command = "animate_background_scale BG2 200 75 12") {
  const data = createBlankProjectData({ name: "Background Scale" });
  const room = (data.rooms as Record<string, unknown>[])[0]!;
  room.sceneType = type;
  room.runtime = { type, config: { affine: { enabled: true, assetId: "qa-affine.png", layer: "BG2", scaleX: 1, scaleY: 1, wrap: true } } };
  room.eventBindings = { onInit: "scale" };
  data.assets = [...data.assets as object[], { id: "affine", name: "qa-affine.png", kind: "Background", colorMode: "8bpp-affine", metadata: { kind: "affine_bg", colorMode: "8bpp-affine", width: 256, height: 256 } }];
  data.events = [{ name: "scale", category: "Cena", sceneName: room.name, steps: [{ command }] }];
  return data;
}

describe("background scale in native scene profiles", () => {
  it.each(profiles)("exports the prepared background and event for %s", (type, key, rows) => {
    const contract = buildEngineExportProjectContract(project(type));
    expect(contract.requires.features).toContain("events.background_scale_profiles");
    const native = contract[key] as unknown as Record<string, unknown>;
    const scene = rows ? (native[rows] as Record<string, unknown>[])[0]! : native;
    expect(scene.video).toMatchObject({ display_mode: 1, affine: { layer: "BG2", asset: expect.any(String) } });
    expect(JSON.stringify(native)).toContain('"op":"set_background_scale","actor":2,"x":512,"y":192,"frames":12');
  });
  it.each(["menu", "cutscene", "visual_novel", "point_click", "world_map", "battle_rpg", "luta", "dungeon_crawler", "racing", "isometric"])("registers a consumer in %s", runtime => {
    expect(eventCommandIntegrationIssue("set_background_scale BG2 150 75", runtime)).toBeNull();
  });
  it.each(profiles)("still rejects unprepared layers in %s", (type) => {
    expect(() => buildEngineExportProjectContract(project(type, "set_background_scale BG3 150 75"))).toThrow(/camada affine preparada/);
  });
  it("does not reserve the unused regular scene image alongside a flat affine backdrop", () => {
    const data=project("visualNovel");
    const room=(data.rooms as Record<string, unknown>[])[0]!;
    const regularName="legacy.png";room.backgroundAssetName=regularName;
    data.assets=[...data.assets as object[],{id:"legacy",name:regularName,kind:"Background",metadata:{kind:"bg",width:256,height:256}}];
    const contract=buildEngineExportProjectContract(data);
    expect(contract.visual_novel_project?.scenes[0]?.background).toBe(-1);
    expect(contract.asset_pack?.assets.some(asset=>asset.png?.endsWith(regularName) === true)).toBe(false);
  });
  it("uses the native perspective floor without allocating a second affine plane", () => {
    const data = project("racing");
    const room = (data.rooms as Record<string, unknown>[])[0]!;
    room.runtime = {type:"racing",config:{presentation:"pseudo3d",pseudo3dVisuals:{floorTilemapId:"qa-affine.png",horizonY:48}}};
    const contract = buildEngineExportProjectContract(data);
    expect(JSON.stringify(contract.racing_project)).toContain('"op":"set_background_scale","actor":2');
    expect(contract.racing_project?.rooms[0]?.pseudo3d_visual).toBe(0);
    expect(contract.requires.features).toContain("events.background_scale_profiles");
  });
  it("rejects a second prepared plane on the native perspective floor even without events", () => {
    const data=project("racing");data.events=[];
    const room=(data.rooms as Record<string,unknown>[])[0]!;
    room.runtime={type:"racing",config:{presentation:"pseudo3d",pseudo3dVisuals:{floorTilemapId:"qa-affine.png",horizonY:48},affine:{enabled:true,assetId:"qa-affine.png",layer:"BG2"}}};
    expect(()=>buildEngineExportProjectContract(data)).toThrow(/já ocupa BG2/);
  });
  it("ignores disabled compositions when checking native perspective floor ownership", () => {
    const data=project("racing");
    const room=(data.rooms as Record<string,unknown>[])[0]!;
    room.runtime={type:"racing",config:{presentation:"pseudo3d",pseudo3dVisuals:{floorTilemapId:"qa-affine.png",horizonY:48},composition:{enabled:false,layers:[{id:"off",enabled:true,kind:"affine_bg",layer:"BG2",assetId:"qa-affine.png"}]}}};
    expect(()=>buildEngineExportProjectContract(data)).not.toThrow();
  });
  it.each(profiles)("keeps BG0 available to the fixed UI in %s", type => {
    const data = project(type,"set_background_scale BG3 150 75");
    const room = (data.rooms as Record<string, unknown>[])[0]!;
    (room.runtime as {config:{affine:{layer:string}}}).config.affine.layer = "BG3";
    expect(() => buildEngineExportProjectContract(data)).toThrow(/BG2.*[Mm]odo 1/);
  });

  it.each(profiles)("reserves a separate map and fixed UI for %s", type => {
    const data = project(type);
    const asset = (data.assets as {name:string;metadata:Record<string,unknown>}[]).find(asset => asset.name === "qa-affine.png")!;
    asset.metadata.width = 1024; asset.metadata.height = 1024;
    expect(() => buildEngineExportProjectContract(data)).toThrow(/512/);
  });

});
