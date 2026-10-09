import { describe, expect, it } from "vitest";
import { eventCommandLibrary } from "./eventCommandLibrary.js";
import { isNativeEventCommandAcceptedByRomExport } from "./eventCommandRegistry.js";
import { buildEventCommandSupportMatrix } from "./eventCommandSupport.js";
import { deriveEventsWorkspacePresentation, prepareEventExport } from "./eventsWorkspace.js";
import { createPreviewRuntime, runPreviewRuntimeEvent } from "./previewRuntime.js";
import type { GBAProjectData } from "./projectFile.js";

const invalidHistoricalCommands = [
 "projectile_load_slot 0 absent.png 2 100", "launch_projectile_slot Player 0 down",
 "set_actor_animation_state Player absent", "open_shop Player", "set_adventure_state adventure.state 1",
 "push_actor Player tile hole", "draw_text Texto antigo", "open_menu", "start_segment intro", "stop_segment intro"
];
function project(command: string, enabled = true, sceneType = "topdown"): GBAProjectData {
  return {
    scenas: [{ name: "start", sceneType, width: 30, height: 20, playerActorName: "Player" }, { name: "menu", sceneType: "menu" }],
    actors: [{ id: "player", name: "Player", roomName: "start", x: 2, y: 3 }],
    dialogues: [{ key: "intro", text: "Texto atual" }],
    events: [{ id: "review", name: "review", steps: [{ command, isEnabled: enabled }, { command: "set_variable continued 1" }] }],
    settings: { general: { startScene: "start" } }
  };
}

describe("reviewed event block catalog", () => {
  it("offers only authored definitions accepted by the current ROM exporter", () => {
    expect(eventCommandLibrary.filter(d => !isNativeEventCommandAcceptedByRomExport(d.commandTemplate.split(/\s+/)[0]!))).toEqual([]);
  });
  it("retains all historical definitions with every GBA integration resolved", () => {
    const matrix=buildEventCommandSupportMatrix();
    expect(matrix).toHaveLength(200);
    expect(matrix.filter(d=>d.status === "pending")).toEqual([]);
    expect(matrix.filter(d=>d.status === "native")).toHaveLength(190);
    expect(matrix.filter(d=>d.status === "not-applicable")).toHaveLength(2);
  });
  it("explains an old menu block using its product name and actual integration boundary, preserving saved commands", () => {
    const data = project("open_menu");
    const before = JSON.stringify(data);
    const step = deriveEventsWorkspacePresentation(data).groups.flatMap(g => g.events)[0]!.steps[0]!;
    expect(step).toMatchObject({ commandLabel: "Exibir menu", commandBadge: "Parâmetros incompletos", commandAvailability: expect.stringContaining("opções") });
    expect(step.paletteSuggestions.some(item=>item.command.startsWith("open_menu "))).toBe(true);
    expect(JSON.stringify(data)).toBe(before);
    expect(JSON.parse(prepareEventExport(data, "review")!.contents).event.steps[0].command).toBe("open_menu");
  });
  it("explains disabled historical blocks without treating them as active export errors", () => {
    const step = deriveEventsWorkspacePresentation(project("open_menu", false)).groups.flatMap(g => g.events)[0]!.steps[0]!;
    expect(step).toMatchObject({ isEnabled: false, commandAvailability: expect.stringContaining("opções"), missingReferences: [] });
  });
  it("keeps unknown custom actions distinct from reviewed historical definitions", () => {
    const step = deriveEventsWorkspacePresentation(project("custom_action keep raw", false)).groups.flatMap(g => g.events)[0]!.steps[0]!;
    expect(step.command).toBe("custom_action keep raw");
    expect(step.commandAvailability).toBeNull();
    expect(step.commandLabel).toBe("custom action");
  });
});

describe("unavailable historical commands in event simulation", () => {
  it.each([...invalidHistoricalCommands, "gbvm_script draft", "printer intro"])("reports %s without simulating an unimplemented action", command => {
    const data = project(command, true, command.startsWith("luta_") ? "luta" : "topdown");
    const base = createPreviewRuntime(data);
    const state = runPreviewRuntimeEvent(base, "review");
    expect(state.eventLog.find(log => log.command === command)?.result).toBe("unsupported");
    expect(state.variables).toEqual({ continued: 1 });
    expect(state.actors).toEqual(base.actors);
    expect(state.hud).toEqual(base.hud);
    expect(state.currentRoom?.name).toBe("start");
    expect(state.inventory).toEqual(base.inventory);
    expect(state.equippedItems).toEqual(base.equippedItems);
  });
  it("does not report a limitation for a disabled or skipped unavailable block", () => {
    const disabled = runPreviewRuntimeEvent(createPreviewRuntime(project("open_menu", false)), "review");
    expect(disabled.eventLog.some(log => log.result === "unsupported")).toBe(false);
    const data = project("open_menu");
    (data.events as Record<string, unknown>[])[0]!.steps = [{ command: "if_variable gate 1" }, { command: "open_menu" }, { command: "set_variable continued 1" }];
    const skipped = runPreviewRuntimeEvent(createPreviewRuntime(data), "review");
    expect(skipped.eventLog.some(log => log.result === "unsupported")).toBe(false);
    expect(skipped.variables.continued).toBe(1);
  });
});
