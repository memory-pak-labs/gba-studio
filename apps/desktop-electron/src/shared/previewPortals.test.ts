import { describe, expect, it } from "vitest";
import {
  createPreviewRuntime, dispatchPreviewRuntimeAction, runPreviewRuntimeEvent,
  tickPreviewRuntime, resumePreviewDebugger, enablePreviewDebugger
} from "./previewRuntime.js";
import type { GBAProjectData } from "./projectFile.js";

const frame = 1000 / 60;
const event = (name: string, commands: string[]) => ({ name, steps: commands.map(command => ({ command })) });
function project(portalCommands: string[] | null = ["add_variable portal 1", "change_scene other 4 5 down"]): GBAProjectData {
  return {
    scenas: [
      { name: "start", sceneType: "topdown", width: 30, height: 20, playerActorName: "Player", eventBindings: { onExit: "default_exit" } },
      { name: "other", sceneType: "topdown", width: 30, height: 20, playerActorName: "Player", eventBindings: { onInit: "default_enter" } }
    ],
    actors: [{ id: "player", name: "Player", roomName: "start", x: 2, y: 3 }],
    editorState: { scenaConnections: [{ id: "door", from: "start", to: "other", exit: { x: 3, y: 3, width: 1, height: 1 }, entry: { x: 0, y: 7, width: 1, height: 1 }, ...(portalCommands ? { eventName: "portal" } : {}) }] },
    events: [event("bind", ["attach_adventure_callback on_room_exit exit", "attach_adventure_callback on_room_enter enter"]),
      event("exit", ["add_variable exit 1", "set_variable order 1"]),
      event("enter", ["add_variable enter 1", "multiply_variable order 10", "add_variable order 3"]),
      event("default_exit", ["add_variable default_exit 1"]), event("default_enter", ["add_variable default_enter 1"]),
      ...(portalCommands ? [event("portal", portalCommands)] : [])],
    settings: { general: { startScene: "start" }, topdown: { gridSize: "8" } }
  };
}
function enter(data = project(), bind = true) {
  let state = createPreviewRuntime(data);
  if (bind) state = runPreviewRuntimeEvent(state, "bind");
  return dispatchPreviewRuntimeAction(state, "right");
}

describe("Quick Preview topdown portals", () => {
  it("queues exit before the portal script and enter after it, preserving explicit coordinates", () => {
    const data = project(["multiply_variable order 10", "add_variable order 2", "change_scene other 4 5 down"]);
    const queued = enter(data);
    expect(queued.variables.exit).toBeUndefined();
    const done = tickPreviewRuntime(queued, frame);
    expect(done.variables).toMatchObject({ exit: 1, enter: 1, order: 123 });
    expect(done.variables.default_exit).toBeUndefined();
    expect(done.variables.default_enter).toBeUndefined();
    expect(done.currentRoom?.name).toBe("other");
    expect(done.player).toMatchObject({ x: 4, y: 5, direction: "down" });
    expect(done.eventLog.some(entry => entry.result === "unsupported")).toBe(false);
  });

  it.each(["on_room_exit", "room_exit", "exit", "on_exit"])("binds/removes %s and restores the room exit fallback", name => {
    const data = project();
    data.events = [...data.events as Record<string, unknown>[], event("remove", [`remove_adventure_callback ${name}`])];
    let state = runPreviewRuntimeEvent(createPreviewRuntime(data), "bind");
    state = runPreviewRuntimeEvent(state, "remove");
    state = tickPreviewRuntime(dispatchPreviewRuntimeAction(state, "right"), frame);
    expect(state.variables.default_exit).toBe(1);
    expect(state.variables.exit).toBeUndefined();
  });

  it("runs the room defaults without callbacks", () => {
    const done = tickPreviewRuntime(enter(project(), false), frame);
    expect(done.variables).toMatchObject({ default_exit: 1, default_enter: 1, portal: 1 });
  });

  it("warps a direct portal to the walkable arrival without exit or enter scripts", () => {
    const data = project(null);
    (data.scenas as Record<string, unknown>[])[1]!.collisionTypes = Array<string>(600).fill("free");
    ((data.scenas as Record<string, unknown>[])[1]!.collisionTypes as string[])[7 * 30 + 1] = "solid";
    const done = tickPreviewRuntime(enter(data), frame);
    expect(done.currentRoom?.name).toBe("other");
    expect(done.player).toMatchObject({ x: 2, y: 7, direction: "right" });
    expect(done.variables).toEqual({});
  });

  it("does not invent a warp at the end of a local portal script", () => {
    const done = tickPreviewRuntime(enter(project(["add_variable portal 1"])), frame);
    expect(done.currentRoom?.name).toBe("start");
    expect(done.variables.portal).toBe(1);
    expect(done.variables.exit).toBe(1);
  });

  it("does not emit exit for an ordinary change_scene command", () => {
    const data = project();
    data.events = [...data.events as Record<string, unknown>[], event("warp", ["change_scene other 4 5 down"])];
    let state = runPreviewRuntimeEvent(createPreviewRuntime(data), "bind");
    state = tickPreviewRuntime(runPreviewRuntimeEvent(state, "warp"), frame);
    expect(state.variables.enter).toBe(1);
    expect(state.variables.exit).toBeUndefined();
  });

  it("preserves exit flags through nested scripts and waits, avoiding premature enter or duplicate portals", () => {
    const data = project();
    const events = data.events as ReturnType<typeof event>[];
    events.find(e => e.name === "exit")!.steps = event("exit", ["call_event child", "add_variable exit 1"]).steps;
    events.push(event("child", ["idle 2", "change_scene other 2 2 right"]));
    let state = tickPreviewRuntime(enter(data), frame);
    expect(state.scriptWaitFrames).toBe(1);
    expect(state.variables.portal).toBeUndefined();
    state = dispatchPreviewRuntimeAction(state, "right");
    expect(state.player?.x).toBe(3);
    state = tickPreviewRuntime(state, frame * 2);
    expect(state.currentRoom?.name).toBe("other");
    expect(state.variables.exit).toBe(1);
    expect(state.variables.portal).toBe(1);
    expect(state.variables.enter).toBeUndefined();
    expect(state.scriptQueue).toHaveLength(0);
  });

  it("does not drain the portal while its exit dialogue is open", () => {
    const data = project();
    (data.events as ReturnType<typeof event>[]).find(e => e.name === "exit")!.steps = event("exit", ["show_dialogue farewell"]).steps;
    data.dialogues = [{ key: "farewell", text: "Até logo" }];
    let state = tickPreviewRuntime(enter(data), frame);
    expect(state.activeDialogue).not.toBeNull();
    state = tickPreviewRuntime(state, frame * 5);
    expect(state.variables.portal).toBeUndefined();
    state = tickPreviewRuntime(dispatchPreviewRuntimeAction(state, "action"), frame);
    expect(state.variables.portal).toBe(1);
    expect(state.currentRoom?.name).toBe("other");
  });

  it("preserves the pending portal and exit flags across debugger pauses", () => {
    let state = enter();
    state = enablePreviewDebugger(state, true);
    state = { ...state, debugger: { ...state.debugger, breakpoints: ["exit#1"] } };
    state = tickPreviewRuntime(state, frame);
    expect(state.debugger.paused).toBe(true);
    expect(state.variables.portal).toBeUndefined();
    state = tickPreviewRuntime(resumePreviewDebugger(state), frame);
    expect(state.variables).toMatchObject({ exit: 1, portal: 1, enter: 1 });
  });

  it("checks a stationary overlapping player on active frames, but respects paused scenes", () => {
    const data = project();
    (data.actors as Record<string, unknown>[])[0]!.x = 3;
    data.events = [...data.events as Record<string, unknown>[], event("pause", ["pause_scene_type topdown"]), event("resume", ["resume_scene_type topdown"])];
    let state = runPreviewRuntimeEvent(createPreviewRuntime(data), "pause");
    state = tickPreviewRuntime(state, frame * 2);
    expect(state.scriptQueue).toHaveLength(0);
    state = tickPreviewRuntime(runPreviewRuntimeEvent(state, "resume"), frame);
    expect(state.scriptQueue.length).toBeGreaterThan(0);
    expect(tickPreviewRuntime(state, frame).variables.portal).toBe(1);
  });

  it("uses the player's native rectangle instead of only its origin", () => {
    const data = project(null);
    data.settings = { ...data.settings as object, topdown: { gridSize: "16" } };
    const state = tickPreviewRuntime(createPreviewRuntime(data), frame);
    expect(state.currentRoom?.name).toBe("other");
  });

  it("keeps the first overlapping connection's priority and ignores absent destinations", () => {
    const data = project();
    const editor = data.editorState as { scenaConnections: Record<string, unknown>[] };
    editor.scenaConnections.unshift({ ...editor.scenaConnections[0], to: "missing" });
    editor.scenaConnections.push({ ...editor.scenaConnections[1], eventName: "other_portal" });
    data.events = [...data.events as Record<string, unknown>[], event("other_portal", ["add_variable wrong 1"])];
    const state = tickPreviewRuntime(enter(data), frame);
    expect(state.variables.portal).toBe(1);
    expect(state.variables.wrong).toBeUndefined();
  });

  it("generates the transition script, including exit, for an automatic visual passage", () => {
    const data = project(null);
    const editor = data.editorState as { scenaConnections: Record<string, unknown>[] };
    editor.scenaConnections[0]!.transition = { style: "fade", durationFrames: 2, fadeOut: true, fadeIn: true };
    let state = tickPreviewRuntime(enter(data), frame);
    expect(state.variables.exit).toBe(1);
    expect(state.currentRoom?.name).toBe("start");
    expect(state.scriptWaitFrames).toBe(1);
    state = tickPreviewRuntime(state, frame * 2);
    expect(state.currentRoom?.name).toBe("other");
    expect(state.variables.enter).toBe(1);
    expect(state.player).toMatchObject({ x: 1, y: 7, direction: "right" });
  });

  it("appends the destination warp when crossing to a different runtime", () => {
    const data = project(["add_variable portal 1"]);
    (data.scenas as Record<string, unknown>[])[1]!.sceneType = "platformer";
    const state = tickPreviewRuntime(enter(data), frame);
    expect(state.currentRoom?.sceneType).toBe("platformer");
    expect(state.variables).toMatchObject({ exit: 1, portal: 1 });
    expect(state.adventureCallbacks).toEqual({});
    expect(state.player).toMatchObject({ x: 1, y: 7 });
  });

  it.each([{ commands: [] }, { commands: ["noop"] }])("treats an event with no executable native commands ($commands) as a direct portal", ({ commands }) => {
    const state = tickPreviewRuntime(enter(project(commands)), frame);
    expect(state.currentRoom?.name).toBe("other");
    expect(state.player).toMatchObject({ x: 1, y: 7 });
    expect(state.variables).toEqual({});
  });

  it("resolves the connection arrival when the portal warp omits coordinates", () => {
    const state = tickPreviewRuntime(enter(project(["change_scene other"])), frame);
    expect(state.player).toMatchObject({ x: 1, y: 7, direction: "right" });
    expect(state.variables).toMatchObject({ exit: 1, enter: 1 });
  });

  it("preserves the global player alongside the destination NPCs and actor commands", () => {
    const data = project();
    (data.actors as Record<string, unknown>[]).push({ id: "guide", name: "Guide", roomName: "other", x: 8, y: 8 });
    (data.events as ReturnType<typeof event>[]).find(e => e.name === "enter")!.steps = event("enter", ["set_actor_position player 6 7"]).steps;
    const state = tickPreviewRuntime(enter(data), frame);
    expect(state.player).toMatchObject({ id: "player", name: "Player", x: 6, y: 7 });
    expect(state.actors.find(actor => actor.id === "guide")).toMatchObject({ x: 8, y: 8 });
  });

  it("uses animation hitbox size for overlap and does not apply its collision offset", () => {
    const data = project(null);
    (data.actors as Record<string, unknown>[])[0]!.spriteSheet = "player.png";
    (data.actors as Record<string, unknown>[])[0]!.animationName = "idle";
    data.animations = [{ name: "idle", spriteSheet: "player.png", hitboxX: -16, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 8 }];
    const state = tickPreviewRuntime(createPreviewRuntime(data), frame);
    expect(state.currentRoom?.name).toBe("other");
  });

  it("uses the destination's own player without carrying the source as an extra actor", () => {
    const data = project();
    const destination = (data.scenas as Record<string, unknown>[])[1]!;
    destination.sceneType = "platformer";
    destination.playerActorName = "Platform Player";
    (data.actors as Record<string, unknown>[]).push({ id: "platform-player", name: "Platform Player", roomName: "other", x: 8, y: 8 });
    const state = tickPreviewRuntime(enter(data), frame);
    expect(state.player).toMatchObject({ id: "platform-player", x: 4, y: 5 });
    expect(state.actors.map(actor => actor.id)).toEqual(["platform-player"]);
  });
});
