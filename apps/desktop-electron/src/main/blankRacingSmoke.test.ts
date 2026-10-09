import path from "node:path";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createRoomInProject, updateRoomFieldsInProject } from "../shared/roomsWorkspace.js";
import { parseGBAProjectFile, summarizeGBAProject } from "../shared/projectFile.js";
import { expandProjectTilemaps } from "../shared/projectResourceFormat.js";
import { openProjectFile, saveProjectFileAtomically } from "./projectPersistence.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

// Optional native proof uses an isolated, user-approved QA circuit as scenery.
// Players are created exclusively through the production blank-project APIs.
describe.skipIf(!process.env.GBA_RACING_APPROVED_QA_SOURCE)("approved blank racing native workflow", () => {
  it("creates both views, saves, reopens and builds the scene-specific cars", async () => {
    const source = process.env.GBA_RACING_APPROVED_QA_SOURCE!;
    const root = process.env.GBA_RACING_APPROVED_QA_OUTPUT!;
    const old = parseGBAProjectFile(await readFile(source,"utf8")).data as any;
    const reference = old.rooms.find((room:any)=>room.sceneType==="racing");
    let data:any = buildProjectFromTemplate("blank",{name:"QA Carros roxos aprovados"});
    const projectRoot=path.join(root,"project");
    await mkdir(path.join(projectRoot,"Assets/backgrounds"),{recursive:true});
    for(const name of ["qa-circuit-atlas.png","qa-overhead-atlas.png"]) {
      await copyFile(path.join(path.dirname(source),"Assets/backgrounds/qa-circuit-atlas.png"),path.join(projectRoot,"Assets/backgrounds",name));
      data.assets.push({id:`qa-${name}`,name,kind:"Background",metadata:{source:`Assets/backgrounds/${name}`,width:128,height:128,colorMode:name.includes("overhead")?"4bpp":"8bpp-affine"}});
    }
    for(const [id,presentation] of [["overhead","topdown"],["perspective","pseudo3d"]] as const) {
      data=createRoomInProject(data,{id,name:id,width:64,height:64,sceneType:"racing"});
      data=updateRoomFieldsInProject(data,id,{runtime:{type:"racing",config:{...reference.runtime.config,presentation}},
        backgroundAssetName:presentation==="topdown"?"qa-overhead-atlas.png":"qa-circuit-atlas.png"});
      Object.assign(data.rooms.find((room:any)=>room.id===id),{
        tilemap:reference.tilemap,collisionTypes:reference.collisionTypes,tileLayers:[]});
      const car=data.actors.find((actor:any)=>actor.roomName===id&&actor.name==="Player");
      car.x=16;car.y=16;
    }
    data.triggers.push({id:"qa-view-portal",name:"Trocar vista",roomName:"overhead",x:23,y:15,width:2,height:3,onEnterEventName:"qa_to_perspective"});
    data.events.push({id:"qa-view-change",name:"qa_to_perspective",category:"Trigger",steps:[{command:"change_scene perspective 16 16"}]});
    data.settings.general={...data.settings.general,startScene:"overhead",startSceneType:"racing"};
    data.editorState={...data.editorState,activeScenaID:"overhead",activeScenaName:"overhead",startScenaID:"overhead"};
    // Decode the saved QA scenery and canonicalize its legacy trigger shape
    // before using the ordinary editor save/reopen contract.
    data=parseGBAProjectFile(JSON.stringify(expandProjectTilemaps(data))).data;
    const projectPath=path.join(projectRoot,"qa_approved_racing.gba-project");
    await saveProjectFileAtomically(projectPath,{data,summary:summarizeGBAProject(data)},{appPath:process.cwd()});
    const opened=await openProjectFile(projectPath);
    await writeFile(path.join(root,"expected-project.json"),JSON.stringify(data,null,2));
    await writeFile(path.join(root,"reopened-project.json"),JSON.stringify(opened.project?.data,null,2));
    expect(opened.project?.data).toEqual(data);
    const pack=path.resolve("../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const prepared=prepareEngineProjectExport(opened.project!.data,{enginePackPath:pack});
    expect(prepared.error).toBeUndefined();
    const contract=prepared.generated!.contract;
    expect(contract.racing_project!.rooms.map(room=>room.player!.idle_metasprite.asset)).toEqual(["neutral_player_racing_topdown","neutral_player_racing_rear"]);
    const destination=path.join(root,"export");
    await writeEngineSchemaExport({prepared:prepared.generated!,projectPath,cacheEnabled:false,assetcPath:path.join(pack,"tools/assetc"),destination});
    const header=await readFile(path.join(destination,"racing_project_data.hpp"),"utf8");
    expect(header).toContain("&neutral_player_racing_rear_frame_9_tile_asset");
    expect(header).toContain("&racing_room_1_player_visual");
    const build=await runGbsbuild({enginePackPath:pack,gbsbuildPath:path.join(pack,"tools/gbsbuild"),projectDir:destination});
    await writeFile(path.join(root,"native-build.json"),JSON.stringify(build,null,2));
    expect(build.exitCode).toBe(0);
  },120_000);
});
