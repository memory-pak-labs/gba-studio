import path from "node:path";
import { mkdir, writeFile, readFile, cp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createRoomInProject } from "../shared/roomsWorkspace.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject } from "../shared/projectFile.js";
import { saveProjectFileAtomically, openProjectFile } from "./projectPersistence.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

// Opt-in proof materializes public blank-project defaults in an external QA copy.
// It never edits the canonical example or any user's project.
describe.skipIf(!process.env.GBA_DEFAULT_ASSET_QA_OUTPUT)("corrected default assets native proof", () => {
  it("saves, reopens and exports the affected scene defaults", async () => {
    const output = path.resolve(process.env.GBA_DEFAULT_ASSET_QA_OUTPUT!);
    const phase = process.env.GBA_DEFAULT_ASSET_QA_PHASE ?? "after";
    const projectRoot = path.join(output, phase, "project");
    await mkdir(projectRoot, { recursive: true });
    let data: any = buildProjectFromTemplate("blank", { name: `QA Assets ${phase}` });
    for (const sceneType of ["dungeonCrawler", "battleRpg", "racing", "platformer", "luta", "isometricAdventure"]) {
      data = createRoomInProject(data, { id: `qa-${sceneType}`, name: `qa_${sceneType}`, sceneType, width: 30, height: 20 });
    }
    data.settings.general = { ...data.settings.general, startScene: "qa_dungeonCrawler", startSceneType: "dungeonCrawler" };
    data.editorState = { ...data.editorState, activeScenaID: "qa-dungeonCrawler", activeScenaName: "qa_dungeonCrawler" };
    const projectPath = path.join(projectRoot, "default_assets_qa.gba-project");
    await saveProjectFileAtomically(projectPath, { data, summary: summarizeGBAProject(data) }, { appPath: process.cwd() });
    const opened = await openProjectFile(projectPath);
    expect(opened.project?.data).toEqual(data);
    await writeFile(path.join(output, phase, "reopened-project.json"), JSON.stringify(opened.project!.data, null, 2));
    // Split-resource manifests retain references to the copied UI and sprite PNGs.
    expect(parseGBAProjectFile(serializeGBAProjectFile({ data, summary: summarizeGBAProject(data) })).data).toEqual(data);
    if (!process.env.GBA_DEFAULT_ASSET_QA_BUILD) return;
    const enginePackPath = path.resolve("../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const prepared = prepareEngineProjectExport(opened.project!.data, { enginePackPath });
    expect(prepared.error).toBeUndefined();
    const destination = path.join(output, phase, "export");
    await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath, cacheEnabled: false, assetcPath: path.join(enginePackPath, "tools/assetc"), destination });
    const build = await runGbsbuild({ enginePackPath, gbsbuildPath: path.join(enginePackPath, "tools/gbsbuild"), projectDir: destination });
    await writeFile(path.join(output, phase, "native-build.json"), JSON.stringify(build, null, 2));
    expect(build.exitCode).toBe(0);
    const contract = JSON.parse(await readFile(path.join(destination, "export_project.json"), "utf8"));
    await writeFile(path.join(output, phase, "exported-contract.json"), JSON.stringify(contract, null, 2));
    await cp(path.join(destination, "build"), path.join(output, phase, "roms"), { recursive: true });
  }, 120_000);
});
