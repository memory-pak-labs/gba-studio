import { describe, expect, it } from "vitest";
import {
  bootPreviewRuntimeAtRoom, createPreviewRuntime, dispatchPreviewRuntimeAction,
  enablePreviewDebugger, resumePreviewDebugger, togglePreviewDebuggerBreakpoint,
  stepPreviewDebuggerScript,
  runPreviewRuntimeEvent, tickPreviewRuntime
} from "./previewRuntime.js";
import type { GBAProjectData } from "./projectFile.js";
import { createPlatformerPreviewBody } from "./platformerPreview.js";

const frameMs = 1000 / 60;
function project(commands: string[] = [], sceneType = "topdown"): GBAProjectData {
  return {
    scenas: [{ id: "start", name: "start", sceneType, width: 30, height: 20, playerActorName: "Player" }],
    actors: [{ id: "player", name: "Player", roomName: "start", x: 2, y: 3 }],
    events: [{ id: "test", name: "test", steps: commands.map(command => ({ command })) }],
    settings: { general: { startScene: "start" }, save: { saveType: "sram", slots: 3 } }
  };
}
function run(commands: string[], sceneType = "topdown") {
  return runPreviewRuntimeEvent(createPreviewRuntime(project(commands, sceneType)), "test");
}

describe("Quick Preview native command parity", () => {
  it.each(["topdown", "platformer"])("stores 0/1 save presence in the destination in %s", sceneType => {
    const state = run([
      "store_save_variable 2 empty", "save_game 2", "store_save_variable 2 present",
      "remove_save_game 2", "store_save_variable 2 removed"
    ], sceneType);
    expect(state.variables).toEqual({ empty: 0, present: 1, removed: 0 });
  });

  it("rejects a save slot beyond the project's configured slots", () => {
    const state = run(["store_save_variable 3 present"]);
    expect(state.variables.present).toBeUndefined();
    expect(state.eventLog.at(-1)?.result).toBe("unsupported");
  });

  it.each(["current_scene_index", "current_room", "scene", "room"])("reads %s using the current runtime's room index", field => {
    const data = project([`store_engine_field ${field} result`]);
    data.scenas = [
      { name: "menu", sceneType: "menu", width: 30, height: 20 },
      ...(data.scenas as Record<string, unknown>[]),
      { name: "second", sceneType: "topdown", width: 30, height: 20 }
    ];
    const state = runPreviewRuntimeEvent(bootPreviewRuntimeAtRoom(data, "second"), "test");
    expect(state.variables.result).toBe(1);
  });

  it.each(["topdown", "platformer"])("reads player coordinates in native pixels in %s", sceneType => {
    const state = run(["store_engine_field player_x x", "store_engine_field player_y y"], sceneType);
    expect(state.variables).toEqual({ x: 16, y: 24 });
  });

  it("retains the isometric engine's tile coordinates", () => {
    const state = run(["store_engine_field player_x x", "store_engine_field player_y y"], "isometric");
    expect(state.variables).toEqual({ x: 2, y: 3 });
  });

  it("reads the platformer's collision body position, including hitbox offsets", () => {
    const data = project(["store_engine_field player_x x", "store_engine_field player_y y"], "platformer");
    const base = createPreviewRuntime(data);
    const state = runPreviewRuntimeEvent({ ...base, platformerPhysics: createPlatformerPreviewBody(18, 20, 8, 8, 2, -4) }, "test");
    expect(state.variables).toEqual({ x: 18, y: 20 });
  });

  it("pauses actual platformer physics and consumes no held jump or dash", () => {
    const data = project(["pause_scene_type platformer"], "platformer");
    data.scenas = [{ name: "start", sceneType: "platformer", width: 30, height: 20, playerActorName: "Player",
      runtime: { type: "platformer", config: { gravity: 0.375, jumpFrames: 8, dash: true } } }];
    const paused = runPreviewRuntimeEvent(createPreviewRuntime(data), "test");
    expect(paused.platformerPhysics).not.toBeNull();
    const advanced = tickPreviewRuntime(paused, 10 * frameMs, "right", ["action", "back"]);
    expect(advanced.platformerPhysics).toEqual(paused.platformerPhysics);
  });

  it("uses live camera coordinates for reads and conditions", () => {
    const data = project([
      "store_engine_field camera_x x", "store_engine_field camera_y y",
      "if_engine_field player_x 16", "set_variable matches 1"
    ]);
    const state = runPreviewRuntimeEvent({ ...createPreviewRuntime(data), camera: {
      ...createPreviewRuntime(data).camera, x: 31, y: 17
    } }, "test");
    expect(state.variables).toEqual({ x: 31, y: 17, matches: 1 });
  });

  it.each(["idle", "wait"])("%s yields and resumes only after the requested frames", verb => {
    let state = run(["set_variable before 1", `${verb} 3`, "set_variable after 1"]);
    expect(state.variables).toEqual({ before: 1 });
    state = tickPreviewRuntime(state, 2.5 * frameMs);
    expect(state.variables.after).toBeUndefined();
    state = tickPreviewRuntime(state, 0.5 * frameMs);
    expect(state.variables.after).toBe(1);
  });

  it("preserves the caller continuation when a called event yields", () => {
    const data = project(["call_event child", "set_variable parentDone 1"]);
    data.events = [...data.events as Record<string, unknown>[], {
      name: "child", steps: [{ command: "idle 2" }, { command: "set_variable childDone 1" }]
    }];
    const waiting = runPreviewRuntimeEvent(createPreviewRuntime(data), "test");
    expect(waiting.variables).toEqual({});
    expect(tickPreviewRuntime(waiting, 2 * frameMs).variables).toEqual({ childDone: 1, parentDone: 1 });
  });

  it("consumes a long tick across consecutive waits without skipping commands", () => {
    const state = run(["idle 2", "set_variable first 1", "wait 3", "set_variable second 1"]);
    const advanced = tickPreviewRuntime(state, 5 * frameMs);
    expect(advanced.variables).toEqual({ first: 1, second: 1 });
  });

  it("keeps caller order when a resumed script calls another yielding event", () => {
    const data = project(["call_event child", "set_variable parentDone 1"]);
    data.events = [...data.events as Record<string, unknown>[],
      { name: "child", steps: [{ command: "idle 1" }, { command: "call_event leaf" }, { command: "set_variable childDone 1" }] },
      { name: "leaf", steps: [{ command: "idle 1" }, { command: "set_variable leafDone 1" }] }
    ];
    const state = tickPreviewRuntime(runPreviewRuntimeEvent(createPreviewRuntime(data), "test"), 2 * frameMs);
    expect(state.eventLog.filter(item => item.command.startsWith("set_variable")).map(item => item.command))
      .toEqual(["set_variable leafDone 1", "set_variable childDone 1", "set_variable parentDone 1"]);
  });

  it.each(["switch_variable mode 1 child", "repeat_expression count lt 2 child 2"])("preserves a yielding control flow: %s", command => {
    const data = project(["set_variable mode 1", command, "set_variable done 1"]);
    data.events = [...data.events as Record<string, unknown>[],
      { name: "child", steps: [{ command: "idle 1" }, { command: "add_variable count 1" }] }
    ];
    const waiting = runPreviewRuntimeEvent(createPreviewRuntime(data), "test");
    expect(waiting.variables.done).toBeUndefined();
    const finished = tickPreviewRuntime(waiting, 2 * frameMs);
    expect(finished.variables.done).toBe(1);
    expect(finished.variables.count).toBe(command.startsWith("repeat") ? 2 : 1);
  });

  it("freezes waits while a debugger breakpoint is active and retains callers", () => {
    const data = project(["call_event child", "set_variable done 1"]);
    data.events = [...data.events as Record<string, unknown>[],
      { name: "child", steps: [{ command: "idle 2" }, { command: "set_variable childDone 1" }] }
    ];
    let state = enablePreviewDebugger(createPreviewRuntime(data), true);
    state = togglePreviewDebuggerBreakpoint(state, "child#2");
    state = tickPreviewRuntime(runPreviewRuntimeEvent(state, "test"), 2 * frameMs);
    expect(state.debugger.paused).toBe(true);
    expect(tickPreviewRuntime(state, 1000).previewFrame).toBe(state.previewFrame);
    expect(state.variables.done).toBeUndefined();
    state = tickPreviewRuntime(resumePreviewDebugger(state), frameMs);
    expect(state.variables).toEqual({ childDone: 1, done: 1 });
  });

  it("queues another event while the current script is waiting", () => {
    const data = project(["idle 2", "set_variable first 1"]);
    data.events = [...data.events as Record<string, unknown>[], { name: "next", steps: [{ command: "set_variable second 1" }] }];
    const queued = runPreviewRuntimeEvent(runPreviewRuntimeEvent(createPreviewRuntime(data), "test"), "next");
    expect(queued.variables).toEqual({});
    expect(tickPreviewRuntime(queued, 2 * frameMs).variables).toEqual({ first: 1, second: 1 });
  });

  it("runs idle 0 without delaying the continuation", () => {
    expect(run(["idle 0", "set_variable done 1"]).variables.done).toBe(1);
  });

  it("does not execute integrated commands from a skipped structured branch", () => {
    const state = run([
      "set_variable mode 0", "if_variable mode 1", "pause_scene_type topdown", "idle 90",
      "run_audio_routine missing", "attach_adventure_callback on_interact test", "else",
      "set_variable correct 1", "condition_end"
    ]);
    expect(state.variables.correct).toBe(1);
    expect(state.scriptWaitFrames).toBe(0);
    expect(state.pausedSceneTypes.topdown).not.toBe(true);
    expect(state.eventLog.some(item => item.result === "unsupported")).toBe(false);
  });

  it("finishes a debugger step at the wait boundary before executing the next instruction", () => {
    const data = project(["idle 2", "set_variable done 1"]);
    let state = togglePreviewDebuggerBreakpoint(enablePreviewDebugger(createPreviewRuntime(data), true), "test#1");
    state = stepPreviewDebuggerScript(runPreviewRuntimeEvent(state, "test"));
    state = tickPreviewRuntime(state, 2 * frameMs);
    expect(state.debugger.paused).toBe(true);
    expect(state.variables.done).toBeUndefined();
    expect(resumePreviewDebugger(state).variables.done).toBe(1);
  });

  it("isolates a selected event without running its onInit binding twice", () => {
    const data = project(["add_variable count 1"]);
    (data.scenas as Record<string, unknown>[])[0]!.eventBindings = { onInit: "test" };
    expect(createPreviewRuntime(data).variables.count).toBe(1);
    expect(runPreviewRuntimeEvent(bootPreviewRuntimeAtRoom(data, "start", { skipBootEvents: true }), "test").variables.count).toBe(1);
  });

  it.each(["topdown", "platformer"])("pauses and resumes movement in %s while events keep running", sceneType => {
    const data = project([`pause_scene_type ${sceneType}`, "set_variable reached 1"], sceneType);
    data.events = [...data.events as Record<string, unknown>[], { name: "resume", steps: [{ command: `resume_scene_type ${sceneType}` }] }];
    const paused = runPreviewRuntimeEvent(createPreviewRuntime(data), "test");
    expect(paused.variables.reached).toBe(1);
    expect(dispatchPreviewRuntimeAction(paused, "right").player?.x).toBe(2);
    expect(tickPreviewRuntime(paused, 1000, "right").player?.x).toBe(2);
    const resumed = runPreviewRuntimeEvent(paused, "resume");
    expect(tickPreviewRuntime(resumed, 1000, "right").player!.x).toBeGreaterThan(2);
  });

  it("does not pause a different runtime or leave a queued jump on resume", () => {
    const other = run(["pause_scene_type platformer"]);
    expect(dispatchPreviewRuntimeAction(other, "right").player!.x).toBeGreaterThan(2);
    const platform = run(["pause_scene_type platformer"], "platformer");
    expect(dispatchPreviewRuntimeAction(platform, "action").platformerInputRequests.jump).toBe(false);
  });

  it("keeps text input interactive while movement is paused", () => {
    const state = run(["pause_scene_type topdown", "open_text_input name 4"]);
    expect(state.textInput.active).toBe(true);
    expect(dispatchPreviewRuntimeAction(state, "action").variables.name).toBe("A");
  });

  it("resolves a composed tracker through its exportID rather than treating it as a missing file", () => {
    const data = project(["run_audio_routine theme_export"]);
    data.audioItems = [{ name: "Theme", exportID: "theme_export", kind: "Musica", format: "MOD",
      patterns: [{ id: "main", name: "Main", steps: 4, channels: [{ id: "pulse", name: "Pulse 1", type: "pulse1", notes: ["C4", "", "E4", ""] }] }], patternOrder: ["main"] }];
    const state = runPreviewRuntimeEvent(createPreviewRuntime(data), "test");
    expect(state.activeMusic).toBe("Theme");
    expect(state.eventLog.at(-1)?.result).toBe("audio");
  });

  it.each(["missing", "noise"])("rejects routine %s when it has no tracker resource", name => {
    const data = project([`run_audio_routine ${name}`]);
    data.audioItems = [{ name: "noise", kind: "SFX", format: "WAV" }];
    const state = runPreviewRuntimeEvent(createPreviewRuntime(data), "test");
    expect(state.activeMusic).toBeNull();
    expect(state.eventLog.at(-1)?.result).toBe("unsupported");
  });

  it("binds an imported tracker to its real source asset", () => {
    const data = project(["run_audio_routine music"]);
    data.audioItems = [{ name: "Music", exportID: "music", kind: "Musica", format: "MOD", sourceAssetID: "mod" }];
    data.assets = [{ id: "mod", name: "song.mod", kind: "Audio", metadata: { source: "Assets/song.mod" } }];
    const state = runPreviewRuntimeEvent(createPreviewRuntime(data), "test");
    expect(state.activeMusic).toBe("Music");
    expect(state.activeMusicAsset?.source).toBe("Assets/song.mod");
  });

  it.each([
    "store_engine_field typo dest", "store_save_variable 8 dest", "idle -1",
    "pause_scene_type luta", "resume_scene_type isometric"
  ])("reports an invalid integrated contract: %s", command => {
    const state = run([command]);
    expect(state.variables).toEqual({});
    expect(state.eventLog.at(-1)?.result).toBe("unsupported");
  });

  it.each([
    "attach_adventure_callback on_interact test", "remove_adventure_callback on_interact",
    "remove_platform_callback on_land", "set_platform_state jump"
  ])("rejects a callback or state command in the wrong runtime: %s", command => {
    const state = run([command], command.includes("platform") ? "topdown" : "platformer");
    expect(state.variables).toEqual({});
    expect(state.eventLog.at(-1)?.result).toBe("unsupported");
    expect(state.diagnostics.at(-1)?.message).toMatch(/topdown|platformer/i);
  });
});
