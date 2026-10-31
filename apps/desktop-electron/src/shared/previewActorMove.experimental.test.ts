import { describe, expect, it } from "vitest";
import { createPreviewRuntime, tickPreviewRuntime, runPreviewRuntimeEvent } from "./previewRuntime.js";

function preview(commands: string[], events: Array<{name:string;steps:Array<{command:string}>}> = []) {
  return createPreviewRuntime({
    scenas: [{id:"room",name:"room",sceneType:"topdown",width:16,height:12,eventBindings:{onInit:"boot"}}],
    actors: [{id:"player",name:"Player",roomName:"room",x:1,y:1},
      {id:"guide",name:"Guide",roomName:"room",x:4,y:4}],
    events: [{name:"boot",steps:commands.map(command=>({command}))}, ...events],
    settings:{general:{startScene:"room"}}
  });
}
const guide=(state:ReturnType<typeof preview>) => state.actors.find(actor=>actor.id === "guide")!;
const frame=(state:ReturnType<typeof preview>) => tickPreviewRuntime(state,1000/60);

describe("temporal actor motion in preview", () => {
  it("moves one pixel per frame and only executes the next event after arrival", () => {
    let state=preview(["move_actor_to Guide 5 4","set_variable score 73"]);
    expect(guide(state).x).toBe(4);
    expect(state.variables.score).not.toBe(73);
    state=frame(state);
    expect(guide(state).x).toBe(4.125);
    expect(state.variables.score).not.toBe(73);
    for(let i=0;i<7;i++) state=frame(state);
    expect(guide(state).x).toBe(5);
    expect(state.variables.score).toBe(73);
  });
  it("moves relative offsets over time while relative positioning remains instant", () => {
    let moving=preview(["move_actor_relative Guide -2 1","set_variable score 73"]);
    expect(guide(moving).x).toBe(4); expect(moving.variables.score).toBeUndefined();
    moving=frame(moving); expect(guide(moving).x).toBe(3.875);
    for(let i=0;i<23;i++) moving=frame(moving);
    expect(guide(moving).x).toBe(2); expect(guide(moving).y).toBe(5); expect(moving.variables.score).toBe(73);
    const positioned=preview(["set_actor_relative_position Guide -2 1","set_variable score 73"]);
    expect(guide(positioned).x).toBe(2); expect(guide(positioned).y).toBe(5); expect(positioned.variables.score).toBe(73);
  });
  it("keeps teleport immediate", () => {
    const state=preview(["teleport_actor Guide 5 4","set_variable score 73"]);
    expect(guide(state).x).toBe(5);
    expect(state.variables.score).toBe(73);
  });
  it("preserves ordering through nested event calls", () => {
    let state=preview(["call_event child","add_variable score 1"],[{name:"child",steps:[{command:"move_actor_to Guide 5 4"},{command:"set_variable score 10"}]}]);
    expect(state.variables.score).not.toBe(11);
    for(let i=0;i<8;i++) state=frame(state);
    expect(guide(state).x).toBe(5);
    expect(state.variables.score).toBe(11);
  });
  it("stops at a wall using the actor's 16-pixel collision box", () => {
    let state=preview(["move_actor_to Guide 8 4","set_variable score 73"]);
    state.currentRoom!.collisionCells[4 * 16 + 6] = true;
    state=frame(state);
    expect(guide(state).x).toBe(4);
    expect(state.variables.score).toBe(73);
  });
  it("uses fractional movement speed and releases a zero-speed move", () => {
    let slow=preview(["set_actor_movement_speed Guide 50","move_actor_to Guide 5 4","set_variable score 73"]);
    slow=frame(slow); expect(guide(slow).x).toBe(4);
    slow=frame(slow); expect(guide(slow).x).toBe(4.125);
    for(let i=0;i<14;i++) slow=frame(slow);
    expect(guide(slow).x).toBe(5); expect(slow.variables.score).toBe(73);
    let stopped=preview(["set_actor_movement_speed Guide 0","move_actor_to Guide 5 4","set_variable score 73"]);
    stopped=frame(stopped);
    expect(guide(stopped).x).toBe(4); expect(stopped.variables.score).toBe(73);
  });

  it("does not spend movement frames on a subsequent wait when a tick spans multiple frames", () => {
    let state=preview(["move_actor_to Guide 5 4","wait 5","set_variable score 73"]);
    state=tickPreviewRuntime(state,8*1000/60);
    expect(guide(state).x).toBe(5);
    expect(state.variables.score).not.toBe(73);
    for(let i=0;i<5;i++) state=frame(state);
    expect(state.variables.score).toBe(73);
  });

  it("stops a segment's movement when the segment is stopped", () => {
    let state=preview(["start_segment 3 mover","wait 30"],[
      {name:"mover",steps:[{command:"move_actor_to Guide 8 4"},{command:"set_variable child 1"}]},
      {name:"cancel",steps:[{command:"stop_segment 3"}]}
    ]);
    state=frame(frame(state));
    expect(guide(state).x).toBeGreaterThan(4);
    state=runPreviewRuntimeEvent({...state,scriptWaitFrames:0},"cancel");
    const stoppedX=guide(state).x;
    for(let i=0;i<10;i++) state=frame(state);
    expect(guide(state).x).toBe(stoppedX);
    expect(state.variables.child).toBeUndefined();
  });
  it("cancel_actor_movement releases the waiting script without reaching its target", () => {
    let state=preview(["start_segment 3 mover","start_segment 4 canceler","wait 30"],[
      {name:"mover",steps:[{command:"move_actor_to Guide 8 4"},{command:"set_variable child 1"}]},
      {name:"canceler",steps:[{command:"wait 3"},{command:"cancel_actor_movement Guide"}]}
    ]);
    for(let i=0;i<15;i++) state=frame(state);
    expect(guide(state).x).toBeLessThan(8);
    expect(state.variables.child).toBe(1);
  });

});
