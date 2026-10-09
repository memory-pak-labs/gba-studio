import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createRoomInProject } from "../shared/roomsWorkspace.js";
import { summarizeGBAProject } from "../shared/projectFile.js";
import { saveProjectFileAtomically, openProjectFile } from "./projectPersistence.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

// Optional native evidence writes only to an explicitly supplied QA directory.
describe.skipIf(!process.env.GBA_SELECTED_PLAYER_QA_OUTPUT)("selected scene player native workflow", () => {
  it.each(["pointAndClick", "shmup"] as const)("saves, reopens and compiles the second %s scene", async (sceneType) => {
    let data = buildProjectFromTemplate("blank", { name: `QA ${sceneType}` });
    for (const name of ["first", "second"]) {
      data = createRoomInProject(data, { id: name, name, width: 30, height: 20, sceneType });
    }
    const second = (data.actors as Record<string, unknown>[]).find(actor => actor.roomName === "second" && actor.name === "Player")!;
    Object.assign(second, { spriteSheet: "neutral-player-racing-rear.png", animationName: "idle",
      animationStateID: "state-neutral-racing-rear", x: 9, y: 12 });
    const projectRoot = path.join(process.env.GBA_SELECTED_PLAYER_QA_OUTPUT!, sceneType);
    const projectPath = path.join(projectRoot, `qa-${sceneType}.gba-project`);
    await mkdir(projectRoot, { recursive: true });
    await saveProjectFileAtomically(projectPath, { data, summary: summarizeGBAProject(data) }, { appPath: process.cwd() });
    const opened = await openProjectFile(projectPath);
    expect(opened.error).toBeUndefined();
    expect(opened.project?.data).toEqual(data);
    const pack = path.resolve("../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const prepared = prepareEngineProjectExport(opened.project!.data, {
      enginePackPath: pack, developmentStartScene: { name: "second", x: 9, y: 12 }
    });
    expect(prepared.error).toBeUndefined();
    const destination = path.join(projectRoot, "export");
    await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath, destination,
      assetcPath: path.join(pack, "tools/assetc"), cacheEnabled: false });
    const built = await runGbsbuild({ enginePackPath: pack, gbsbuildPath: path.join(pack, "tools/gbsbuild"), projectDir: destination });
    await writeFile(path.join(projectRoot, "native-build.json"), JSON.stringify(built, null, 2));
    expect(built.exitCode, built.stderr).toBe(0);
  }, 120_000);
});
