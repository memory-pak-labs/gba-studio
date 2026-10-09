import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "./projectTemplates.js";
import { createRoomInProject, updateRoomFieldsInProject } from "./roomsWorkspace.js";
import { deriveSettingsWorkspacePresentation, updateSettingsFieldInProject } from "./settingsWorkspace.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject, type GBAProjectData } from "./projectFile.js";
import { buildAssetcTilesetPackGeneration } from "./engineProjectExport.js";
const rooms = (p:GBAProjectData) => p.rooms as Record<string,any>[];
const assets = (p:GBAProjectData) => p.assets as Record<string,any>[];
const cases = [
 ["topdown","topdown"],["platformer","platformer"],["isometricAdventure","isometric-adventure"],
 ["isometricTactical","isometric-tactical"],["shmup","shmup"],["racing","racing-topdown"],
 ["luta","fight"],["pointAndClick","point-click"],["visualNovel","visual-novel"],
 ["cutscene","cutscene"],["battleRpg","battle-rpg"],["dungeonCrawler","dungeon-crawler"],
 ["menu","menu"],["worldMap","world-map"],["custom","custom"]
] as const;
const image=(family:string)=>`neutral-background-${family}.png`;
describe("approved orange backgrounds in blank scenes",()=>{
 it("exports the reviewed tile palettes without quantizing the colors a second time",()=>{
  const p=buildProjectFromTemplate("blank",{name:"Palette"});
  const asset=assets(p).find(a=>a.name===image("topdown"))!;
  const plan=asset.metadata.backgroundPaletteReferencePlan;
  expect(plan.banks).toHaveLength(14);
  expect(plan.banks.every((bank:any[])=>bank[0]===null)).toBe(true);
  expect(plan.tile_palette_banks).toHaveLength(600);
  expect(buildAssetcTilesetPackGeneration(p)?.assetsBySheet[image("topdown")]?.background_palette_reference_plan).toEqual(plan);
 });
 it.each(["isometricAdventure","isometricTactical"])("places %s players inside the fixed background while keeping the requested grid",scene=>{
  const p=createRoomInProject(buildProjectFromTemplate("blank",{name:"Iso"}),{id:"iso",name:"iso",sceneType:scene,width:30,height:20});
  expect(rooms(p).find(r=>r.id==="iso")).toMatchObject({width:30,height:20});
  const actors=(p.actors as Record<string,any>[]).filter(a=>a.roomName==="iso");
  expect(actors.find(a=>a.name==="Player")).toMatchObject({x:4,y:4});
  if(scene==="isometricTactical") expect(actors.find(a=>a.name==="Enemy")).toMatchObject({x:5,y:3});
 });
 it("starts with an editable topdown background and owns all sixteen families",()=>{
  const p=buildProjectFromTemplate("blank",{name:"Orange"});
  expect(rooms(p)[0]).toMatchObject({backgroundAssetName:image("topdown"),gbStudioUseBackgroundLayout:true});
  const backgrounds=assets(p).filter(a=>a.kind==="Background");
  expect(backgrounds).toHaveLength(16);
  expect(backgrounds.every(a=>a.metadata.bundledDefaultAsset.startsWith("template:blank/Assets/backgrounds/"))).toBe(true);
  expect(p.settings).toMatchObject({sceneTypes:{backgroundDefaultsProfile:"neutral-orange",defaultBackgrounds:{topdown:image("topdown"),racingPerspective:image("racing-rear")}}});
 });
 it("keeps the default cutscene background visible until the author defines its timeline",()=>{
  const p=createRoomInProject(buildProjectFromTemplate("blank",{name:"Cutscene"}),{id:"cut",name:"cut",sceneType:"cutscene",width:30,height:20});
  expect(rooms(p).find(r=>r.id==="cut")!.runtime.config.autoAdvance).toBe(false);
 });
 it.each(cases)("creates %s with its approved default and preserves existing scenes",(scene,family)=>{
  const base=buildProjectFromTemplate("blank",{name:"Orange"});
  const before=structuredClone(rooms(base));
  const next=createRoomInProject(base,{id:"new",name:"new",width:30,height:20,sceneType:scene});
  expect(rooms(next).find(r=>r.id==="new")).toMatchObject({backgroundAssetName:image(family),gbStudioUseBackgroundLayout:true});
  expect(rooms(next).filter(r=>r.id!=="new")).toEqual(before);
  expect(rooms(base)).toEqual(before);
 });
 it("selects both perspective variants and preserves a custom background during mode changes",()=>{
  let p=createRoomInProject(buildProjectFromTemplate("blank",{name:"Orange"}),{id:"race",name:"race",width:30,height:20,sceneType:"racing"});
  p=updateRoomFieldsInProject(p,"race",{runtime:{type:"racing",config:{presentation:"pseudo3d"}}});
  expect(rooms(p).find(r=>r.id==="race")!.backgroundAssetName).toBe(image("racing-rear"));
  p=updateRoomFieldsInProject(p,"race",{backgroundAssetName:"custom-road.png"});
  p=updateRoomFieldsInProject(p,"race",{runtime:{type:"racing",config:{presentation:"topdown"}}});
  expect(rooms(p).find(r=>r.id==="race")!.backgroundAssetName).toBe("custom-road.png");
 });
 it("respects an explicitly disabled automatic background and settings changes only affect future scenes",()=>{
  const base=buildProjectFromTemplate("blank",{name:"Orange"});
  const before=structuredClone(rooms(base));
  const disabled=updateSettingsFieldInProject(base,"sceneTypes","defaultBackgrounds.topdown","");
  expect(disabled.settings).toMatchObject({sceneTypes:{defaultBackgrounds:{topdown:""}}});
  const next=createRoomInProject(disabled,{id:"none",name:"none",width:30,height:20,sceneType:"topdown"});
  expect(rooms(next).find(r=>r.id==="none")!.backgroundAssetName??"").toBe("");
  expect(rooms(next).filter(r=>r.id!=="none")).toEqual(before);
 });
 it("offers only backgrounds, sixteen selections and a no-default choice, with roundtrip persistence",()=>{
  const p=buildProjectFromTemplate("blank",{name:"Orange"});
  assets(p).push({id:"custom",name:"my-background.png",kind:"Background",metadata:{source:"Assets/backgrounds/my-background.png"}});
  const fields=deriveSettingsWorkspacePresentation(p).sections.find(s=>s.id==="sceneTypes")!.editableFields.filter(f=>f.key.startsWith("defaultBackgrounds."));
  expect(fields).toHaveLength(16);
  const top=fields.find(f=>f.key==="defaultBackgrounds.topdown")!;
  expect(top.options).toEqual(expect.arrayContaining([{value:"",label:"Sem background automático"},{value:"my-background.png",label:"my-background.png"}]));
  expect(top.options!.some(o=>String(o.value).startsWith("neutral-player-"))).toBe(false);
  const changed=updateSettingsFieldInProject(p,"sceneTypes","defaultBackgrounds.topdown","my-background.png");
  const next=createRoomInProject(changed,{id:"custom-room",name:"custom-room",width:30,height:20,sceneType:"topdown"});
  expect(rooms(next).find(r=>r.id==="custom-room")!.backgroundAssetName).toBe("my-background.png");
  const reopened=parseGBAProjectFile(serializeGBAProjectFile({data:next,summary:summarizeGBAProject(next)})).data;
  expect(rooms(reopened)).toEqual(rooms(next));
 });
 it("does not inject the profile or background into projects that do not opt in",()=>{
  const base=buildProjectFromTemplate("blank",{name:"Old"});
  delete (base.settings as any).sceneTypes.defaultBackgrounds;
  delete (base.settings as any).sceneTypes.backgroundDefaultsProfile;
  const next=createRoomInProject(base,{id:"old",name:"old",width:30,height:20,sceneType:"topdown"});
  expect(rooms(next).find(r=>r.id==="old")!.backgroundAssetName??"").toBe("");
 });
});
