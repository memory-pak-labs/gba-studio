import path from "node:path";
import { mkdir, writeFile, readFile, cp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createRoomInProject } from "../shared/roomsWorkspace.js";
import { summarizeGBAProject } from "../shared/projectFile.js";
import { saveProjectFileAtomically, openProjectFile } from "./projectPersistence.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

describe.skipIf(!process.env.GBA_BATTLE_HUD_QA_OUTPUT)("compact blank battle native proof", () => {
  it("exports Luta and Shoot-up to check the shared image-bar renderer", async () => {
    const output = path.join(path.resolve(process.env.GBA_BATTLE_HUD_QA_OUTPUT!), "other-huds");
    const projectRoot = path.join(output, "project");
    await mkdir(projectRoot, { recursive: true });
    let data: any = buildProjectFromTemplate("blank", { name: "QA Barras compartilhadas" });
    for (const sceneType of ["luta","shmup"]) {
      data = createRoomInProject(data, { id:`qa-${sceneType}`,name:`QA_${sceneType}`,sceneType,width:30,height:20 });
    }
    data.rooms = data.rooms.filter((r: any) => ["qa-luta","qa-shmup"].includes(r.id));
    data.scenas = data.scena = data.rooms;
    data.actors = data.actors.filter((a: any) => ["QA_luta","QA_shmup"].includes(a.roomName));
    data.settings.general = { ...data.settings.general, startScene:"QA_luta",startSceneType:"luta" };
    const projectPath = path.join(projectRoot, "other_huds_qa.gba-project");
    await saveProjectFileAtomically(projectPath, { data,summary:summarizeGBAProject(data) }, { appPath:process.cwd() });
    const enginePackPath = path.resolve("../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const prepared = prepareEngineProjectExport((await openProjectFile(projectPath)).project!.data, { enginePackPath });
    expect(prepared.error).toBeUndefined();
    const destination = path.join(output,"export");
    await writeEngineSchemaExport({ prepared:prepared.generated!,projectPath,cacheEnabled:false,
      assetcPath:path.join(enginePackPath,"tools/assetc"),destination });
    const build = await runGbsbuild({ enginePackPath,gbsbuildPath:path.join(enginePackPath,"tools/gbsbuild"),projectDir:destination });
    await writeFile(path.join(output,"native-build.json"),JSON.stringify(build,null,2));
    expect(build.exitCode).toBe(0);
  }, 120_000);
  it("preserves status bindings through save, reopen, assetc and ROM export", async () => {
    const output = path.resolve(process.env.GBA_BATTLE_HUD_QA_OUTPUT!);
    const projectRoot = path.join(output, "after", "project");
    await mkdir(projectRoot, { recursive: true });
    let data: any = createRoomInProject(buildProjectFromTemplate("blank", { name: "QA Batalha compacta" }),
      { id: "qa-battle", name: "Batalha", sceneType: "battleRpg", width: 30, height: 20 });
    data.rooms = data.rooms.filter((r: any) => r.id === "qa-battle");
    data.scenas = data.scena = data.rooms;
    data.actors = data.actors.filter((a: any) => a.roomName === "Batalha");
    data.settings.general = { ...data.settings.general, startScene: "Batalha", startSceneType: "battleRpg" };
    data.editorState = { ...data.editorState, activeScenaID: "qa-battle", activeScenaName: "Batalha" };
    const projectPath = path.join(projectRoot, "battle_compact_qa.gba-project");
    await saveProjectFileAtomically(projectPath, { data, summary: summarizeGBAProject(data) }, { appPath: process.cwd() });
    const opened = await openProjectFile(projectPath);
    expect((opened.project!.data.settings as any).hudPresets).toEqual(data.settings.hudPresets);
    expect((opened.project!.data.rooms as any[])[0]).toMatchObject({ id:"qa-battle",hudPresetId:"hud-neutral-batalha-rpg" });
    const enginePackPath = path.resolve("../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const prepared = prepareEngineProjectExport(opened.project!.data, { enginePackPath });
    expect(prepared.error).toBeUndefined();
    const destination = path.join(output, "after", "export");
    await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath, cacheEnabled: false,
      assetcPath: path.join(enginePackPath, "tools/assetc"), destination });
    const contract = JSON.parse(await readFile(path.join(destination, "export_project.json"), "utf8"));
    const components = contract.battle_rpg_project.dialogue_ui.hud_layouts.find((h: any) => h.id === "hud-neutral-batalha-rpg").components;
    expect(components.filter((c: any) => c.kind === "bar").map((c: any) => c.value_binding)).toEqual(["p1-health", "p2-health"]);
    expect(components.some((c: any) => c.asset.includes("commands"))).toBe(false);
    const build = await runGbsbuild({ enginePackPath, gbsbuildPath: path.join(enginePackPath, "tools/gbsbuild"), projectDir: destination });
    await writeFile(path.join(output, "after", "native-build.json"), JSON.stringify(build, null, 2));
    expect(build.exitCode).toBe(0);
    await cp(path.join(destination, "build"), path.join(output, "after", "roms"), { recursive: true });
  }, 120_000);
});
