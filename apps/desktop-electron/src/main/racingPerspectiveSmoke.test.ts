import path from "node:path";
import { readFile } from "node:fs/promises";
import { describe,it,expect } from "vitest";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import type { GBAProjectData } from "../shared/projectFile.js";

describe.skipIf(!process.env.GBA_RACING_QA_PROJECT)("perspective Racing native export",()=>{
  it("exports the painted circuit, ordered gates, camera and streamed vehicle",async()=>{
    const projectPath=process.env.GBA_RACING_QA_PROJECT!;
    const data=JSON.parse(await readFile(projectPath,"utf8")) as GBAProjectData;
    const prepared=prepareEngineProjectExport(data);
    expect(prepared.error).toBeUndefined();
    const contract=prepared.generated!.contract;
    expect(contract.racing_project!.rooms[0].floor_tilemap).toHaveLength(4096);
    expect(contract.racing_project!.rooms[0].topdown_track?.finish_at_zero).toBe(true);
    expect(contract.racing_project!.player?.animations?.drive?.frame_indices).toHaveLength(2);
    await writeEngineSchemaExport({prepared:prepared.generated!,projectPath,cacheEnabled:false,
      assetcPath:path.join(path.dirname(path.dirname(contract.template_dir)),"tools","assetc"),
      destination:process.env.GBA_RACING_QA_EXPORT!});
  },120_000);
});
