import { describe, expect, it } from "vitest";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import type { GBAProjectData } from "../shared/projectFile.js";
import { eventCommandSupport } from "../shared/eventCommandSupport.js";
import { bootPreviewRuntimeAtRoom, runPreviewRuntimeEvent } from "../shared/previewRuntime.js";

function project(commands: string[]): GBAProjectData {
  return {
    assets: [], assetGroups: [], animations: [], animationStates: [], spriteReferenceImages: [], audioItems: [],
    scenas: [
      { name: "arena", sceneType: "luta", width: 30, height: 20, eventBindings: { onInit: "boot" } },
      { name: "final", sceneType: "luta", width: 30, height: 20 }
    ],
    actors: [
      { id: "hero", name: "Nara", sceneName: "arena", battle: { side: "player1", maxHp: 100 } },
      { id: "rival", name: "Rival", sceneName: "arena", battle: { side: "player2", maxHp: 120 } }
    ],
    events: [{ id: "boot", name: "boot", category: "Cena", sceneName: "arena", steps: commands.map(command => ({ command, isEnabled: true })) }],
    settings: {
      general: { startScene: "arena", startSceneType: "luta", gameTitle: "Fight events", exportFolder: "build" },
      build: { romFileName: "fight.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
      preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
      audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
      save: { saveType: "sram", slots: 3, autoSave: true },
      debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
    }
  } as unknown as GBAProjectData;
}

describe("authored Luta controls", () => {
  it("runs authored controls in the event simulator without fake variables", () => {
    const data = project(["luta_set_super_gauge Nara 100", "luta_trigger_super Nara ultra", "luta_set_round_timer 60"]);
    const state = runPreviewRuntimeEvent(bootPreviewRuntimeAtRoom(data, "arena", { skipBootEvents: true }), "boot");
    expect(state.lutaCombat?.fighters[1].hp).toBe(80);
    expect(state.lutaCombat?.roundTimerFrames).toBe(3600);
    expect(state.eventLog.some(log => log.result === "unsupported")).toBe(false);
    expect(state.variables).toEqual({});
  });
  it("compiles the ten controls with resolved stage, fighter and action operands", () => {
    const commands = [
      "luta_start_match final", "luta_end_match player2", "luta_set_super_gauge Nara 70",
      "luta_add_super_gauge Rival -20", "luta_set_guard_power player1 45", "luta_set_ism_style Nara v-ism",
      "luta_trigger_super Rival ultra", "luta_enable_alpha_counter player2 false",
      "luta_set_round_timer 60", "luta_set_rounds_to_win 3"
    ];
    const result = prepareEngineProjectExport(project(commands));
    expect(result.error).toBeUndefined();
    expect(result.generated!.contract.luta_project!.scripts![0]!.script).toEqual([
      { op: "luta_start_match", index: 1 }, { op: "luta_end_match", actor: 1 },
      { op: "luta_set_super_gauge", actor: 0, amount: 70 }, { op: "luta_add_super_gauge", actor: 1, amount: -20 },
      { op: "luta_set_guard_power", actor: 0, amount: 45 }, { op: "luta_set_ism_style", actor: 0, index: 2 },
      { op: "luta_trigger_super", actor: 1, index: 1 }, { op: "luta_enable_alpha_counter", actor: 1, value: false },
      { op: "luta_set_round_timer", frames: 3600 }, { op: "luta_set_rounds_to_win", count: 3 }
    ]);
    for (const command of commands) expect(eventCommandSupport(command.split(" ")[0]!).status).toBe("native");
  });

  it.each([
    "luta_start_match absent", "luta_end_match nobody", "luta_set_super_gauge missing 20",
    "luta_set_super_gauge Nara typo", "luta_add_super_gauge Nara 40000", "luta_set_ism_style Nara typo",
    "luta_trigger_super Nara absent", "luta_enable_alpha_counter Nara maybe",
    "luta_set_round_timer 0", "luta_set_round_timer 2000", "luta_set_rounds_to_win 0",
    "luta_set_rounds_to_win 300", "luta_set_guard_power Nara -1", "luta_set_round_timer 10 ignored"
  ])("rejects incomplete or invalid authoring: %s", command => {
    expect(prepareEngineProjectExport(project([command])).error).toBeTruthy();
  });

  it("rejects Luta actions in another runtime", () => {
    const data = project(["luta_set_round_timer 60"]);
    (data.scenas as Array<Record<string, unknown>>).forEach(room => { room.sceneType = "topdown"; });
    expect(prepareEngineProjectExport(data).error).toContain("não possui consumidor");
  });
});
