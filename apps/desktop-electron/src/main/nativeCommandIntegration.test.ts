import { describe, expect, it } from "vitest";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { isNativeEventCommandSupportedInRom, nativeEventCommandReferencedEvents } from "../shared/eventCommandRegistry.js";
import { deriveEventsWorkspacePresentation } from "../shared/eventsWorkspace.js";
import type { GBAProjectData } from "../shared/projectFile.js";
import { buildEventCommandSupportMatrix, eventCommandSupport } from "../shared/eventCommandSupport.js";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { saveProjectFileAtomically } from "./projectPersistence.js";
import { summarizeGBAProject } from "../shared/projectFile.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";
import { resolveSceneRuntimeExport } from "../shared/sceneRuntimeExport.js";

function project(commands: string[], sceneType = "topdown"): GBAProjectData {
  return {
    assets: [], assetGroups: [], animations: [], animationStates: [], spriteReferenceImages: [], audioItems: [],
    scenas: [{ name: "start", sceneType, width: 30, height: 20, eventBindings: { onInit: "boot" } }],
    events: [
      { id: "boot", name: "boot", category: "Cena", sceneName: "start", steps: commands.map(command => ({ command, isEnabled: true })) },
      { id: "callback", name: "callback", category: "Cena", sceneName: "start", steps: [{ command: "wait 1" }] }
    ],
    settings: {
      general: { gameTitle: "Commands", startScene: "start", startSceneType: sceneType, exportFolder: "build" },
      build: { romFileName: "commands.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
      preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
      audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
      save: { saveType: "sram", slots: 3, autoSave: true },
      debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
    }
  };
}

function script(commands: string[], sceneType = "topdown") {
  const result = prepareEngineProjectExport(project(commands, sceneType));
  expect(result.error).toBeUndefined();
  const contract = result.generated!.contract;
  return sceneType === "platformer" ? contract.platformer_project!.scripts[0]!.script : contract.topdown_project!.scripts[0]!.script;
}

describe("native command integration", () => {
  it.each([
    "store_engine_field", "attach_adventure_callback", "remove_adventure_callback",
    "remove_platform_callback", "store_save_variable", "visual_effect", "idle",
    "run_audio_routine", "pause_scene_type", "resume_scene_type", "set_platform_state"
  ])("declares %s only after a complete native path is available", verb => {
    expect(isNativeEventCommandSupportedInRom(verb)).toBe(true);
  });

  it("reads the live engine field into the variable registry rather than assigning a literal", () => {
    expect(script(["store_engine_field player_x position.x"])).toEqual([
      { op: "store_engine_field", field: "player_x", variable: 0 }
    ]);
  });

  it("reads cached save presence into the destination variable", () => {
    expect(script(["store_save_variable 2 save.exists"])).toEqual([
      { op: "store_save_exists", slot: 2, variable: 0 }
    ]);
  });

  it("attaches and removes adventure callbacks using stable script indexes", () => {
    expect(script(["attach_adventure_callback on_interact callback", "remove_adventure_callback on_interact"])).toEqual([
      { op: "attach_adventure_callback", callback: "on_interact", index: 1 },
      { op: "remove_adventure_callback", callback: "on_interact" }
    ]);
    expect(nativeEventCommandReferencedEvents("attach_adventure_callback on_interact callback")).toEqual(["callback"]);
  });

  it("removes a platform callback through its real native opcode", () => {
    expect(script(["remove_platform_callback on_land"], "platformer")).toEqual([
      { op: "remove_platform_callback", callback: "on_land" }
    ]);
  });

  it("uses the real platformer state request instead of writing an unrelated variable", () => {
    expect(script(["set_platform_state ground"], "platformer")).toEqual([{ op: "set_platformer_state", state: "ground" }]);
  });

  it("exports idle as a yielding Wait and pause/resume as scene flags", () => {
    expect(script(["idle 3", "pause_scene_type topdown", "resume_scene_type topdown"])).toEqual([
      { op: "wait", frames: 3 }, { op: "pause_scene_type", scene_type: "topdown" },
      { op: "resume_scene_type", scene_type: "topdown" }
    ]);
  });

  it("exports an actual composed music routine and visual effect", () => {
    const data = project(["run_audio_routine theme", "visual_effect wave bg1 20 30"]);
    data.audioItems = [{ id: "theme", name: "theme", kind: "Musica", format: "MOD", exportID: "theme", loops: true,
      patterns: [{ id: "main", name: "Main", steps: 4, channels: [{ id: "pulse", name: "Pulse 1", type: "pulse1", notes: ["C4", "", "E4", ""] }] }], patternOrder: ["main"] }];
    const result = prepareEngineProjectExport(data);
    expect(result.error).toBeUndefined();
    expect(result.generated!.contract.topdown_project!.scripts[0]!.script).toEqual([
      { op: "run_audio_routine", index: 0 }, { op: "visual_effect", effect: "wave", layer: "bg1", frames: 20, intensity: 30 }
    ]);
    expect(result.generated!.audioPack?.document.tracker).toHaveLength(1);
  });

  it("resolves a called unbound callback event only in its owning runtime in a mixed project", () => {
    const data = project(["call_event callback"]);
    data.scenas = [...data.scenas as Record<string, unknown>[], { name: "platform", sceneType: "platformer", width: 30, height: 20 }];
    const callback = (data.events as Record<string, unknown>[])[1]!;
    delete callback.sceneName;
    callback.steps = [{ command: "attach_adventure_callback on_interact boot" }];
    const result = prepareEngineProjectExport(data);
    expect(result.error).toBeUndefined();
    expect(result.generated!.contract.topdown_project!.scripts[1]!.script).toEqual([{ op: "attach_adventure_callback", callback: "on_interact", index: 0 }]);
    expect(result.generated!.contract.platformer_project!.scripts[1]!.script).toEqual([]);
  });

  it.each([
    ["attach_adventure_callback on_interact callback", "platformer"],
    ["remove_platform_callback on_land", "topdown"],
    ["set_platform_state jump", "topdown"],
    ["store_save_variable 0 present", "luta"],
    ["visual_effect wave bg1 20 30", "shmup"]
  ])("blocks %s in a runtime without its consumer (%s)", (command, runtime) => {
    expect(prepareEngineProjectExport(project([command, "wait 1"], runtime)).error).toContain("não possui consumidor");
  });

  it("permits explicit transition phases in other runtimes", () => {
    expect(prepareEngineProjectExport(project(["visual_effect mosaic all 20 30 cover"], "shmup")).error).toBeUndefined();
  });

  it("classifies every catalog entry without mistaking pending handlers for native support", () => {
    const matrix = buildEventCommandSupportMatrix();
    expect(matrix).toHaveLength(200);
    expect(matrix.filter(entry => entry.status === "unknown")).toEqual([]);
    expect(matrix.filter(entry => entry.status === "pending")).toHaveLength(0);
    expect(matrix.filter(entry => entry.status === "not-applicable")).toHaveLength(2);
    expect(eventCommandSupport("open_code_lock").status).toBe("native");
    expect(eventCommandSupport("luta_start_match").status).toBe("native");
  });

  it("offers the newly integrated commands in the normal command palette", () => {
    const palette = deriveEventsWorkspacePresentation(project([])).commandPalette;
    for (const id of ["engine.store_field", "engine.attach_adventure_callback", "engine.remove_adventure_callback", "engine.remove_platform_callback", "save.store_variable", "visual.apply_effect", "timer.idle", "audio.routine", "scene.pause_type", "scene.resume_type"]) {
      expect(palette.find(entry => entry.id === `command:${id}`)?.runtimeStatus, id).toBe("ok-rom");
    }
  });

  it.each([
    "store_engine_field unknown_field value", "store_engine_field player_x",
    "store_save_variable 9 save.exists", "store_save_variable 0",
    "attach_adventure_callback typo callback", "attach_adventure_callback on_interact absent",
    "remove_platform_callback typo", "pause_scene_type luta", "idle nonsense",
    "run_audio_routine absent", "gbvm_script script_1", "luta_set_super_gauge Player 100",
    "unknown_action 1"
  ])("rejects %s instead of silently generating an empty script", command => {
    expect(prepareEngineProjectExport(project([command])).error).toBeTruthy();
  });

  it("ignores disabled unsupported commands and keeps editor organization", () => {
    const data = project(["group intro", "comment nota", "wait 2"]);
    (data.events as Array<{ steps: Array<Record<string, unknown>> }>)[0]!.steps.push({ command: "gbvm_script draft", isEnabled: false });
    const result = prepareEngineProjectExport(data);
    expect(result.error).toBeUndefined();
    expect(result.generated!.contract.topdown_project!.scripts[0]!.script).toEqual([{ op: "wait", frames: 2 }]);
  });
});

describe.skipIf(!process.env.GBA_COMMAND_SUPPORT_QA_OUTPUT)("native command ROM proof", () => {
  it("saves authored commands and compiles topdown and platformer through the real Engine Pack", async () => {
    const output = path.resolve(process.env.GBA_COMMAND_SUPPORT_QA_OUTPUT!);
    const enginePackPath = path.resolve("../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const matrix = buildEventCommandSupportMatrix();
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, "catalog-matrix.json"), JSON.stringify(matrix, null, 2));
    const runtimeMatrix: Array<{ sceneType: string; commands: string[]; exportVerified: boolean; scoped: Array<{ command: string; allowed: boolean }> }> = [];
    for (const sceneType of ["topdown", "platformer", "isometricAdventure", "shmup", "racing", "luta", "pointAndClick", "visualNovel", "cutscene", "battleRpg", "dungeonCrawler", "menu", "worldMap"]) {
      const commands = ["store_engine_field player_x position", "idle 1", "pause_scene_type topdown", "resume_scene_type topdown", "run_audio_routine theme", "visual_effect mosaic all 20 30 cover"];
      const data = project(commands, sceneType);
      data.audioItems = [{ id: "theme", name: "theme", kind: "Musica", format: "MOD", exportID: "theme", loops: true,
        patterns: [{ id: "main", name: "Main", steps: 4, channels: [{ id: "pulse", name: "Pulse 1", type: "pulse1", notes: ["C4", "", "E4", ""] }] }], patternOrder: ["main"] }];
      const result = prepareEngineProjectExport(data);
      expect(result.error, sceneType).toBeUndefined();
      const ops: string[] = [];
      JSON.stringify(result.generated!.contract, (key, value) => { if (key === "op") ops.push(value); return value; });
      expect(ops, sceneType).toEqual(expect.arrayContaining(["store_engine_field", "wait", "pause_scene_type", "resume_scene_type", "run_audio_routine", "visual_effect"]));
      const scoped = [];
      for (const command of ["attach_adventure_callback on_interact callback", "remove_adventure_callback on_interact", "remove_platform_callback on_land", "set_platform_state ground", "store_save_variable 0 present", "visual_effect wave bg1 20 30"]) {
        const support = eventCommandSupport(command.split(" ")[0]!);
        const allowed = support.runtimes!.includes(resolveSceneRuntimeExport(sceneType).kind);
        const scopedResult = prepareEngineProjectExport(project([command], sceneType));
        if (allowed) expect(scopedResult.error, `${sceneType}: ${command}`).toBeUndefined();
        else expect(scopedResult.error, `${sceneType}: ${command}`).toContain("não possui consumidor");
        scoped.push({ command, allowed });
      }
      runtimeMatrix.push({ sceneType, commands, exportVerified: true, scoped });
    }
    await writeFile(path.join(output, "runtime-export-matrix.json"), JSON.stringify(runtimeMatrix, null, 2));
    for (const runtime of ["topdown", "platformer"]) {
      const data = project([
        "store_engine_field player_x position", "store_save_variable 0 present",
        ...(runtime === "topdown" ? ["attach_adventure_callback on_interact callback"] : ["remove_platform_callback on_land", "set_platform_state ground"]),
        "run_audio_routine theme", "visual_effect mosaic all 30 30",
        `pause_scene_type ${runtime}`, "idle 90", `resume_scene_type ${runtime}`,
        "set_variable result 42"
      ], runtime);
      data.variables = ["position", "present", "result"].map((name, index) => ({ id: `variable-${index}`, name, value: 0 }));
      (data.events as Record<string, unknown>[])[1]!.steps = [
        { command: "set_variable result 77" },
        { command: runtime === "topdown" ? "remove_adventure_callback on_interact" : "remove_platform_callback on_land" }
      ];
      data.audioItems = [{ id: "theme", name: "theme", kind: "Musica", format: "MOD", exportID: "theme", loops: true,
        patterns: [{ id: "main", name: "Main", steps: 4, channels: [{ id: "pulse", name: "Pulse 1", type: "pulse1", notes: ["C4", "", "E4", ""] }] }], patternOrder: ["main"] }];
      const projectPath = path.join(output, runtime, "commands.gba-project");
      await mkdir(path.dirname(projectPath), { recursive: true });
      await saveProjectFileAtomically(projectPath, { data, summary: summarizeGBAProject(data) }, { appPath: process.cwd() });
      const prepared = prepareEngineProjectExport(data, { enginePackPath });
      expect(prepared.error).toBeUndefined();
      await writeFile(path.join(output, runtime, "contract.json"), JSON.stringify(prepared.generated!.contract, null, 2));
      const destination = path.join(output, runtime, "export");
      await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath, cacheEnabled: false,
        assetcPath: path.join(enginePackPath, "tools/assetc"), destination });
      const build = await runGbsbuild({ enginePackPath, gbsbuildPath: path.join(enginePackPath, "tools/gbsbuild"), projectDir: destination });
      await writeFile(path.join(output, runtime, "build.json"), JSON.stringify(build, null, 2));
      expect(build.exitCode, runtime).toBe(0);
    }
  }, 180_000);
});
