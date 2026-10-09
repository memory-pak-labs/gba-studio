import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createRoomInProject, removeRoomFromProject, updateRoomFieldsInProject } from "../shared/roomsWorkspace.js";
import { summarizeGBAProject } from "../shared/projectFile.js";
import { saveProjectFileAtomically, openProjectFile } from "./projectPersistence.js";
import { prepareEngineProjectExport, buildEngineExportProjectContract } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

describe("orange background native framing", () => {
  it("exports an empty cutscene without an invalid dialogue index", () => {
    const data = createRoomInProject(buildProjectFromTemplate("blank", {name: "Cutscene"}), {
      id: "cut", name: "cut", sceneType: "cutscene", width: 30, height: 20
    });
    expect(buildEngineExportProjectContract(data).cutscene_project?.scenes[0]?.steps[0]).toMatchObject({
      line: -1, auto_advance: false
    });
  });
  it("uses the authored isometric image bounds for the camera", () => {
    const data = createRoomInProject(buildProjectFromTemplate("blank", {name: "Framing"}), {
      id: "iso", name: "iso", sceneType: "isometricAdventure", width: 30, height: 20
    });
    expect(buildEngineExportProjectContract(data).isometric_project?.rooms[0]?.camera).toMatchObject({
      position: {x: 0, y: 0}, bounds: {x: 0, y: 0, width: 240, height: 160}
    });
  });
});

describe.skipIf(!process.env.GBA_BACKGROUND_QA_OUTPUT)("approved blank background native proof", () => {
  it("saves all sixteen defaults and exports the supported scene runtimes", async () => {
    const output = path.resolve(process.env.GBA_BACKGROUND_QA_OUTPUT!);
    const projectPath = path.join(output, "project", "orange_backgrounds_qa.gba-project");
    await mkdir(path.dirname(projectPath), { recursive: true });
    let data = buildProjectFromTemplate("blank", { name: "QA Backgrounds laranja" });
    for (const sceneType of ["platformer", "isometricAdventure", "isometricTactical", "shmup", "racing",
      "luta", "pointAndClick", "visualNovel", "cutscene", "battleRpg", "dungeonCrawler", "menu", "worldMap", "custom"]) {
      data = createRoomInProject(data, { id: sceneType, name: `qa_${sceneType}`, sceneType, width: 30, height: 20 });
    }
    data = createRoomInProject(data, { id: "racingPerspective", name: "qa_racingPerspective", sceneType: "racing", width: 30, height: 20 });
    data = updateRoomFieldsInProject(data, "racingPerspective", { runtime: { type: "racing", config: { presentation: "pseudo3d" } } });
    await saveProjectFileAtomically(projectPath, { data, summary: summarizeGBAProject(data) }, { appPath: process.cwd() });
    const opened = await openProjectFile(projectPath);
    expect(opened.project?.data).toEqual(data);
    const backgrounds = (data.assets as Record<string, any>[]).filter(asset => asset.kind === "Background");
    for (const asset of backgrounds) {
      const copied = await readFile(path.join(path.dirname(projectPath), asset.metadata.source));
      const bundled = await readFile(path.join(process.cwd(), "default-assets/templates", asset.metadata.bundledDefaultAsset.slice("template:".length)));
      expect(copied.equals(bundled)).toBe(true);
    }
    const enginePackPath = path.resolve("../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    // Custom scenes have no native runtime yet. Preserve their editor proof, while
    // compiling the fifteen supported background variants in a separate QA project.
    const supported = removeRoomFromProject(data, "custom");
    const supportedProjectPath = path.join(output, "supported-project", "orange_supported_qa.gba-project");
    await mkdir(path.dirname(supportedProjectPath), { recursive: true });
    await saveProjectFileAtomically(supportedProjectPath, { data: supported, summary: summarizeGBAProject(supported) }, { appPath: process.cwd() });
    const prepared = prepareEngineProjectExport(supported, { enginePackPath });
    await writeFile(path.join(output, "preflight.json"), JSON.stringify(prepared, null, 2));
    expect(prepared.error).toBeUndefined();
    if (!process.env.GBA_BACKGROUND_QA_BUILD) return;
    const destination = path.join(output, "export");
    await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath: supportedProjectPath, cacheEnabled: false,
      assetcPath: path.join(enginePackPath, "tools/assetc"), destination });
    const build = await runGbsbuild({ enginePackPath, gbsbuildPath: path.join(enginePackPath, "tools/gbsbuild"), projectDir: destination });
    await writeFile(path.join(output, "native-build.json"), JSON.stringify(build, null, 2));
    expect(build.exitCode).toBe(0);
  }, 180_000);
});
