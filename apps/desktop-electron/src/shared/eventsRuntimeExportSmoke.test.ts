import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";

import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { addEventStepInProject } from "./eventsWorkspace.js";
import { generateEngineProjectExport } from "./engineProjectExport.js";
import { buildFunctionalP0Project } from "./functionalP0Project.js";
import { createPreviewRuntime, dispatchPreviewRuntimeAction } from "./previewRuntime.js";

const coveredCommands = [
  "play_music",
  "play_sfx",
  "show_dialogue",
  "show_choice",
  "change_scene",
  "call_event",
  "set_variable",
  "add_variable",
  "multiply_variable",
  "set_flag",
  "add_item",
  "modify_wallet",
  "set_equipped_item"
];

function writeEvidenceIfRequested(evidence: Record<string, unknown>): void {
  const outputPath = process.env.GBA_STUDIO_EVENTS_RUNTIME_EXPORT_EVIDENCE;
  if (!outputPath) return;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

function buildEventsRuntimeExportProject() {
  let project = buildFunctionalP0Project();
  project = addEventStepInProject(project, "event-room-boot", "set_variable score 10");
  project = addEventStepInProject(project, "event-room-boot", "add_variable score 5");
  project = addEventStepInProject(project, "event-room-boot", "multiply_variable score 2");
  project = addEventStepInProject(project, "event-room-boot", "set_flag story.progress true");
  project = addEventStepInProject(project, "event-room-boot", "add_item potion 2");
  project = addEventStepInProject(project, "event-room-boot", "modify_wallet wallet.gold 25 999");
  project = addEventStepInProject(project, "event-room-boot", "set_equipped_item 0 sword");
  return project;
}

describe("Events runtime/export smoke", () => {
  it("proves the real-project event command set across preview, Engine contract, header and generated runtime", () => {
    const project = buildEventsRuntimeExportProject();
    const preview = createPreviewRuntime(project);
    const previewAfterAction = dispatchPreviewRuntimeAction(
      dispatchPreviewRuntimeAction(preview, "action"),
      "action"
    );
    const contract = buildEngineExportProjectContract(project);
    const exported = generateEngineProjectExport(project);
    const header = exported.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents ?? "";
    const main = exported.files.find((file) => file.path === "main.cpp")?.contents ?? "";
    const roomBootContractScript = contract.topdown_project?.scripts.find((script) => script.name === "room_boot")?.script ?? [];

    expect(preview.activeMusic).toBe("intro_theme.mod");
    expect(preview.activeSfx).toBe("confirm.wav");
    expect(preview.activeDialogue?.key).toBe("intro_001");
    expect(preview.variables.score).toBe(30);
    expect(preview.flags["story.progress"]).toBe(true);
    expect(preview.inventory.potion).toBe(2);
    expect(preview.wallet["wallet.gold"]).toEqual({ value: 25, max: 999 });
    expect(preview.equippedItems[0]).toBe("sword");
    expect(previewAfterAction.activeDialogue?.mode).toBe("choice");
    expect(preview.eventLog.map((item) => item.command)).toEqual([
      "play_music intro_theme.mod",
      "play_sfx confirm.wav",
      "call_event boot_dialogue",
      "show_dialogue intro_001",
      "set_variable score 10",
      "add_variable score 5",
      "multiply_variable score 2",
      "set_flag story.progress true",
      "add_item potion 2",
      "modify_wallet wallet.gold 25 999",
      "set_equipped_item 0 sword"
    ]);

    // Contrato assetc real: variaveis/itens sao indices numericos estaveis (ordem alfabetica das
    // chaves usadas no projeto), e "set_flag" vira "set_variable" 0/1 (o motor nao tem op de flag).
    // Registro de variaveis: score=0, story.progress=1, wallet.gold=2. Registro de itens: potion=0, sword=1.
    // "intro_theme.mod" tem patterns compostos no editor -> tracker inline no audio pack e
    // "play_music" vira "run_audio_routine" (EventOp que liga project.tracker_assets na ROM).
    // "confirm.wav" sem patterns compostos entra no audio pack como pcm[0] -> "play_pcm_sfx".
    expect(roomBootContractScript).toEqual(expect.arrayContaining([
      { op: "run_audio_routine", index: 0 },
      { op: "play_pcm_sfx", index: 0 },
      { op: "call_script", index: 1 },
      { op: "set_variable", variable: 0, value: 10 },
      { op: "add_variable", variable: 0, amount: 5 },
      { op: "multiply_variable", variable: 0, amount: 2 },
      { op: "set_variable", variable: 1, value: 1 },
      { op: "add_inventory_item", item: 0, quantity: 2 },
      { op: "modify_wallet", variable: 2, amount: 25, max: 999 },
      { op: "set_equipped_item", slot: 0, item: 1 }
    ]));

    expect(header).toContain("EventCommandOpcode::PlayMusic");
    expect(header).toContain("EventCommandOpcode::PlaySfx");
    expect(header).toContain("EventCommandOpcode::CallEvent");
    expect(header).toContain("EventCommandOpcode::ShowDialogue");
    expect(header).toContain("EventCommandOpcode::ShowChoice");
    expect(header).toContain("EventCommandOpcode::ChangeScene");
    expect(header).toContain("EventCommandOpcode::SetVariable");
    expect(header).toContain("EventCommandOpcode::AddVariable");
    expect(header).toContain("EventCommandOpcode::MultiplyVariable");
    expect(header).toContain("EventCommandOpcode::SetFlag");
    expect(header).toContain("EventCommandOpcode::AddItem");
    expect(header).toContain("EventCommandOpcode::ModifyWallet");
    expect(header).toContain("EventCommandOpcode::SetEquippedItem");

    expect(main).toContain("runtime.last_music_index = step.target_index;");
    expect(main).toContain("runtime.last_sfx_index = step.target_index;");
    expect(main).toContain("run_event_by_index(step.target_index);");
    expect(main).toContain("set_runtime_variable(step.operand, step.arg0);");
    expect(main).toContain("add_runtime_variable(step.operand, step.arg0);");
    expect(main).toContain("multiply_runtime_variable(step.operand, step.arg0);");
    expect(main).toContain("set_runtime_flag(step.operand, step.arg0);");
    expect(main).toContain("add_runtime_inventory(step.operand, step.arg0);");
    expect(main).toContain("modify_runtime_wallet(step.operand, step.arg0, step.arg1);");
    expect(main).toContain("set_runtime_equipped_item(step.arg0, equipped_item_from_operand(step.operand));");
    expect(main).toContain("runtime_witness.audio > 0 &&");
    expect(main).toContain("runtime_witness.state > 0 &&");

    writeEvidenceIfRequested({
      ok: true,
      generatedAt: new Date().toISOString(),
      previewRuntimeVerified: true,
      engineContractVerified: true,
      engineHeaderVerified: true,
      generatedRuntimeVerified: true,
      coveredCommands,
      preview: {
        activeMusic: preview.activeMusic,
        activeSfx: preview.activeSfx,
        dialogue: preview.activeDialogue?.key,
        choiceModeAfterAction: previewAfterAction.activeDialogue?.mode,
        score: preview.variables.score,
        flag: preview.flags["story.progress"],
        inventoryPotion: preview.inventory.potion,
        walletGold: preview.wallet["wallet.gold"],
        equippedSlot0: preview.equippedItems[0]
      },
      export: {
        target: exported.target,
        scripts: contract.topdown_project?.scripts.length ?? 0,
        generatedFiles: exported.files.map((file) => file.path)
      }
    });
  });
});
