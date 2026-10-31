import { describe, expect, it } from "vitest";
import { createPreviewRuntime, tickPreviewRuntime } from "./previewRuntime.js";
function preview(sceneType: string, actor = "Guide", delay = false) {
 return createPreviewRuntime({
  scenas:[{id:"room",name:"room",sceneType,runtime:sceneType === "platformer" ? {type:"platformer",config:{gravity:0,jumpFrames:20}} : undefined,width:16,height:12,eventBindings:{onInit:"boot"}}],
  actors:[{id:"player",name:"Player",roomName:"room",x:1,y:1}, {id:"guide",name:"Guide",roomName:"room",x:actor === "Player" ? 12 : 4,y:actor === "Player" ? 10 : 4}],
  events:[{name:"boot",steps:[...(delay ? [{command:"wait 2"}] : []),{command:`move_actor_to ${actor} 5 4`},{command:"set_variable score 73"}]}],
  settings:{general:{startScene:"room"}}
 });
}
describe("temporal actor movement outside Top-down", () => {
 for (const sceneType of ["platformer","isometricAdventure"]) {
  it(`moves over time before continuing in ${sceneType}`, () => {
   let state=preview(sceneType); const guide=()=>state.actors.find(actor=>actor.id==="guide")!;
   expect(guide().x).toBe(4); expect(state.variables.score).not.toBe(73);
   state=tickPreviewRuntime(state,1000/60);expect(guide().x).toBeGreaterThan(4); expect(guide().x).toBeLessThan(5);
   for(let i=0;i<30;i++)state=tickPreviewRuntime(state,1000/60);
   expect(guide().x).toBe(5); expect(state.variables.score).toBe(73);
  });
  it(`moves the Player without the normal physics overwriting it in ${sceneType}`, () => {
   let state=preview(sceneType,"Player"); expect(state.player?.x).toBe(1); expect(state.variables.score).not.toBe(73);
   for(let i=0;i<130;i++)state=tickPreviewRuntime(state,1000/60);
   expect(state.player?.x).toBe(5); expect(state.player?.y).toBe(4); expect(state.variables.score).toBe(73);
  });
 }
});

describe("batched platformer frames", () => {
 it("preserves movement started after a wait when several frames are simulated at once", () => {
   let state=preview("platformer", "Player", true);
   state=tickPreviewRuntime(state, 130 * 1000 / 60);
   expect(state.player?.x).toBe(5); expect(state.player?.y).toBe(4); expect(state.variables.score).toBe(73);
 });
});
