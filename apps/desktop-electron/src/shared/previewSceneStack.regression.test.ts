import { describe, expect, it } from "vitest";
import { bootPreviewRuntimeAtRoom, runPreviewRuntimeEvent } from "./previewRuntime.js";

const steps = (...commands: string[]) => commands.map(command => ({ command, isEnabled: true }));

describe("authored scene stack in Preview", () => {
  it("exposes the previous gameplay runtime and room after an event opens results", () => {
    const project = {
      scenas: [
        { id: "race-id", name: "race", width: 30, height: 20, sceneType: "racing" },
        { id: "results-id", name: "results", width: 30, height: 20, sceneType: "menu" }
      ],
      events: [
        { name: "finish", steps: steps("scene_stack_push racing", "change_scene results") },
        { name: "continue", steps: steps("if_engine_field previous_runtime 7", "if_engine_field previous_room 0", "set_variable completed 1", "condition_end", "condition_end") }
      ]
    };
    const results = runPreviewRuntimeEvent(bootPreviewRuntimeAtRoom(project, "race", { skipBootEvents: true }), "finish");
    expect(results.currentRoom?.name).toBe("results");
    expect(runPreviewRuntimeEvent(results, "continue").variables.completed).toBe(1);
    const menuProject = { ...project, events: [...project.events,
      { name: "push_menu", steps: steps("scene_stack_push menu", "change_scene race") },
      { name: "check_menu", steps: steps("if_engine_field previous_runtime 3", "set_variable previous_was_menu 1", "condition_end") }
    ] };
    const fromMenu = runPreviewRuntimeEvent(bootPreviewRuntimeAtRoom(menuProject, "results", { skipBootEvents: true }), "push_menu");
    expect(runPreviewRuntimeEvent(fromMenu, "check_menu").variables.previous_was_menu).toBe(1);

  });

  it("retains the last eight scene entries like the engine and clears the history", () => {
    const rooms = Array.from({ length: 9 }, (_, i) => ({ id: `room-${i}`, name: `room_${i}`, width: 30, height: 20, sceneType: "topdown" }));
    const project = { scenas: rooms, events: [
      { name: "push_all", steps: steps(...rooms.flatMap(room => [`change_scene ${room.name}`, "scene_stack_push topdown"])) },
      { name: "clear", steps: steps("scene_stack_clear") }
    ] };
    const stacked = runPreviewRuntimeEvent(bootPreviewRuntimeAtRoom(project, "room_0", { skipBootEvents: true }), "push_all");
    expect(stacked.eventSceneStack).toEqual(rooms.slice(1).map(room => room.id));
    expect(runPreviewRuntimeEvent(stacked, "clear").eventSceneStack).toEqual([]);
  });
});
