import { describe, expect, it } from "vitest";
import { createPreviewRuntime, dispatchPreviewRuntimeAction, runPreviewRuntimeEvent, tickPreviewRuntime } from "./previewRuntime.js";
import { createPlatformerPreviewBody } from "./platformerPreview.js";
import type { GBAProjectData } from "./projectFile.js";

const frame = 1000 / 60;
function project(commands: string[] = [], type = "topdown"): GBAProjectData {
  const collisionTypes = Array<string>(30 * 20).fill("free");
  for (let x = 0; x < 30; x++) collisionTypes[4 * 30 + x] = "solid";
  return {
    scenas: [{ name: "start", sceneType: type, width: 30, height: 20, playerActorName: "Player", collisionTypes,
      runtime: type === "platformer" ? { type: "platformer", config: { jumpFrames: 8, jumpSpeed: 4 } } : undefined }],
    actors: [{ id: "player", name: "Player", roomName: "start", x: 2, y: 3, eventBindings: { onInteract: "default" } }],
    events: [
      { name: "test", steps: commands.map(command => ({ command })) },
      { name: "first", steps: [{ command: "add_variable first 1" }] },
      { name: "second", steps: [{ command: "add_variable second 1" }] },
      { name: "default", steps: [{ command: "add_variable fallback 1" }] },
      { name: "end", steps: [{ command: "set_variable order 1" }] },
      { name: "begin", steps: [{ command: "multiply_variable order 10" }, { command: "add_variable order 2" }] }
    ], settings: { general: { startScene: "start" } }
  };
}
function run(commands: string[], type = "topdown") {
  return runPreviewRuntimeEvent(createPreviewRuntime(project(commands, type)), "test");
}

describe("Preview callback consumers", () => {
  it.each(["on_interact", "interact", "interaction"])("queues %s instead of the default interaction", callback => {
    const bound = run([`attach_adventure_callback ${callback} first`]);
    const pressed = dispatchPreviewRuntimeAction(bound, "action");
    expect(pressed.variables.first).toBeUndefined();
    const executed = tickPreviewRuntime(pressed, frame);
    expect(executed.variables.first).toBe(1);
    expect(executed.variables.fallback).toBeUndefined();
  });

  it("replaces and removes a binding through aliases, restoring the default action", () => {
    let state = run(["attach_adventure_callback interact first", "attach_adventure_callback interaction second"]);
    state = tickPreviewRuntime(dispatchPreviewRuntimeAction(state, "action"), frame);
    expect(state.variables.second).toBe(1);
    expect(state.variables.first).toBeUndefined();
    const data = state.project;
    data.events = [...data.events as Record<string, unknown>[], { name: "remove", steps: [{ command: "remove_adventure_callback on_interact" }] }];
    state = runPreviewRuntimeEvent(state, "remove");
    state = tickPreviewRuntime(dispatchPreviewRuntimeAction(state, "action"), frame);
    expect(state.variables.fallback).toBe(1);
    expect(state.variables.second).toBe(1);
  });

  it("queues room-enter after the caller completes, without treating a warp as a scripted portal exit", () => {
    const data = project(["attach_adventure_callback on_room_enter first", "change_scene other", "set_variable caller_done 1"]);
    data.scenas = [...data.scenas as Record<string, unknown>[], { name: "other", sceneType: "topdown", width: 30, height: 20 }];
    const changed = runPreviewRuntimeEvent(createPreviewRuntime(data), "test");
    expect(changed.variables.caller_done).toBe(1);
    expect(changed.variables.first).toBeUndefined();
    expect(tickPreviewRuntime(changed, frame).variables.first).toBe(1);
  });

  it("accepts exit bindings for the scripted-portal consumer", () => {
    const state = run(["attach_adventure_callback on_room_exit first"]);
    expect(state.adventureCallbacks[2]).toBe("first");
    expect(state.eventLog.some(item => item.result === "unsupported")).toBe(false);
  });

  it.each(["attach_adventure_callback typo first", "attach_adventure_callback interact missing", "remove_platform_callback typo"])("rejects invalid binding %s", command => {
    const state = run([command], command.includes("platform") ? "platformer" : "topdown");
    expect(state.eventLog.at(-1)?.result).toBe("unsupported");
  });

  it("queues the old state's end before the new state's start, without pseudo variables", () => {
    const state = run(["attach_platform_callback on_leave_ground end", "attach_platform_callback on_jump begin", "set_platform_state jump"], "platformer");
    expect(state.variables.jump).toBeUndefined();
    expect(state.variables.order).toBeUndefined();
    expect(tickPreviewRuntime(state, frame).variables.order).toBe(12);
    expect(state.platformerPhysics?.velocityY).toBe(-4);
    expect(tickPreviewRuntime(state, frame).player!.y).toBeLessThan(state.player!.y);
  });

  it("removes a platform binding using a different alias", () => {
    const state = run(["attach_platform_callback jump_start first", "remove_platform_callback on_jump", "set_platform_state jump"], "platformer");
    expect(tickPreviewRuntime(state, frame).variables.first).toBeUndefined();
    expect(state.eventLog.some(item => item.result === "unsupported")).toBe(false);
  });

  it("does not enqueue start/end again for the same state", () => {
    const state = run(["attach_platform_callback groundstart first", "set_platform_state ground"], "platformer");
    expect(tickPreviewRuntime(state, frame).variables.first).toBeUndefined();
    expect(state.platformerPhysics?.onGround).toBe(true);
  });

  it("consumes natural leave-ground and landing transitions", () => {
    let state = run(["attach_platform_callback on_leave_ground first", "attach_platform_callback on_land second"], "platformer");
    state = tickPreviewRuntime(dispatchPreviewRuntimeAction(state, "action"), frame);
    state = tickPreviewRuntime(state, frame);
    expect(state.variables.first).toBe(1);
    for (let i = 0; i < 120 && !state.variables.second; i++) state = tickPreviewRuntime(state, frame);
    expect(state.variables.second).toBe(1);
  });

  it.each(["ground", "run", "float", "ladder", "blank"])("applies native velocity resets for %s", name => {
    const data = project([`set_platform_state ${name}`], "platformer");
    const base = createPreviewRuntime(data);
    const state = runPreviewRuntimeEvent({ ...base, platformerPhysics: { ...createPlatformerPreviewBody(16, 24), velocityX: 2, velocityY: 3, remainderX: 0.4, remainderY: 0.5 } }, "test");
    expect(state.platformerState).toBe(name);
    expect(state.platformerPhysics?.velocityY).toBe(0);
    expect(state.platformerPhysics?.remainderY).toBe(0);
    if (["blank", "ladder"].includes(name)) expect(state.platformerPhysics?.velocityX).toBe(0);
  });

  it.each(["fall", "dash", "wall", "knockback"])("preserves native impulse semantics for %s", name => {
    const data = project([`set_platform_state ${name}`], "platformer");
    const base = createPreviewRuntime(data);
    const state = runPreviewRuntimeEvent({ ...base, platformerPhysics: { ...createPlatformerPreviewBody(16, 24), velocityX: 2, velocityY: 3 } }, "test");
    expect(state.platformerState).toBe(name);
    expect(state.platformerPhysics?.velocityY).toBe(3);
    expect(state.platformerPhysics?.velocityX).toBe(2);
  });

  it("blank disables movement until another state is requested", () => {
    let state = run(["set_platform_state blank"], "platformer");
    const initial = state.player;
    state = tickPreviewRuntime(state, 10 * frame, "right", ["action"]);
    expect(state.player?.x).toBe(initial?.x);
    expect(state.player?.y).toBe(initial?.y);
  });

  it("preserves ladder contact when blank clears motion, matching the native request", () => {
    const data = project(["set_platform_state blank"], "platformer");
    const state = runPreviewRuntimeEvent({ ...createPreviewRuntime(data),
      platformerPhysics: { ...createPlatformerPreviewBody(16, 24), onLadder: true } }, "test");
    expect(state.platformerPhysics?.onLadder).toBe(true);
    expect(state.platformerPlayerActive).toBe(false);
  });

  it("activates physical preview when a state is requested in a basic platform room", () => {
    const data = project(["set_platform_state jump"], "platformer");
    (data.scenas as Record<string, unknown>[])[0]!.runtime = undefined;
    const state = runPreviewRuntimeEvent(createPreviewRuntime(data), "test");
    expect(state.currentRoom?.platformerPreviewEnabled).toBe(true);
    expect(state.platformerPhysics?.velocityY).toBeLessThan(0);
  });

  it("uses a ladder tile for climbing after a ladder request", () => {
    const data = project(["set_platform_state ladder"], "platformer");
    const room = (data.scenas as Record<string, unknown>[])[0]!;
    (room.collisionTypes as string[])[3 * 30 + 2] = "ladder";
    const state = runPreviewRuntimeEvent(createPreviewRuntime(data), "test");
    expect(state.platformerPhysics?.onLadder).toBe(true);
    expect(tickPreviewRuntime(state, frame, "up").player!.y).toBeLessThan(state.player!.y);
  });

  it("consumes only the last state request in a single script", () => {
    const state = run(["attach_platform_callback jumpstart first", "set_platform_state jump", "set_platform_state ground"], "platformer");
    expect(state.platformerState).toBe("ground");
    expect(tickPreviewRuntime(state, frame).variables.first).toBeUndefined();
  });

  it("preserves callbacks already queued before a binding is removed", () => {
    const data = project(["attach_adventure_callback interact first"]);
    data.events = [...data.events as Record<string, unknown>[], { name: "remove", steps: [{ command: "remove_adventure_callback interact" }] }];
    const bound = runPreviewRuntimeEvent(createPreviewRuntime(data), "test");
    const queued = runPreviewRuntimeEvent(dispatchPreviewRuntimeAction(bound, "action"), "remove");
    expect(tickPreviewRuntime(queued, frame).variables.first).toBe(1);
  });
});
