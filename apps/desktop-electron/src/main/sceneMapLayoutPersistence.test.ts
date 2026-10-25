import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {it,expect} from "vitest";
import {openProjectFile,saveProjectFileAtomically} from "./projectPersistence.js";
import {buildProjectFromTemplate} from "../shared/projectTemplates.js";
import {summarizeGBAProject} from "../shared/projectFile.js";
import {organizeSceneMapPositionsInProject,updateSceneMapPositionInProject,sceneMapPositions} from "../shared/roomsWorkspace.js";

it.each(["compact","monolithic","split"])("preserves the complete example card layout after saving and reopening %s projects",async mode=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"gba-scene-layout-"));
  try {
    const source=buildProjectFromTemplate("exemplo-gba",{name:"Saved scene layout"});
    const organized=organizeSceneMapPositionsInProject(source);
    const data=updateSceneMapPositionInProject(organized,"porto_lumen",{x:777,y:555});
    const settings=data.settings as Record<string,unknown>;
    settings.build={...(settings.build as Record<string,unknown>),compactTilemaps:mode!=="monolithic",splitProjectResources:mode==="split"};
    const file=path.join(root,"layout.gba-project");
    await saveProjectFileAtomically(file,{data,summary:summarizeGBAProject(data)},{appPath:process.cwd()});
    const reopened=await openProjectFile(file);
    expect(reopened.error).toBeUndefined();
    expect(sceneMapPositions(reopened.project!.data)).toEqual(sceneMapPositions(data));
    expect(sceneMapPositions(reopened.project!.data).porto_lumen).toEqual({x:777,y:555});
    expect(Object.keys(sceneMapPositions(reopened.project!.data))).toHaveLength(33);
    expect(reopened.project!.data.editorState).toEqual(data.editorState);
    expect((source.editorState as Record<string,unknown>).sceneMapPositions).not.toEqual(sceneMapPositions(data));
  } finally {await rm(root,{recursive:true,force:true});}
},30000);
