import { describe, expect, it } from "vitest";
import { nativeEventFixture } from "../main/nativeEventTestFixture.js";
import { createPreviewRuntime,runPreviewRuntimeEvent,tickPreviewRuntime,dispatchPreviewRuntimeAction } from "./previewRuntime.js";
function project(commands:string[]) {
 const data=nativeEventFixture(commands);
 Object.assign(data,{dialogues:[{key:"prompt",text:"Escolha",choices:["Sim","Não"]}],actors:[{id:"hero",name:"Hero",roomName:"start",x:4,y:4}]});return data;
}
describe("newly integrated interactive events in simulation",()=>{
 it("moves a sprite-bound projectile and applies a hit to another actor",()=>{
 const data=project(["projectile_load_slot 0 bullet.png 3 100","launch_projectile_slot Hero 0 right"]);
 Object.assign(data,{assets:[{id:"bullet",name:"bullet.png",kind:"Sprite",metadata:{source:"Assets/sprites/bullet.png"}}]});
 (data.actors as Record<string,unknown>[]).push({id:"enemy",name:"Enemy",roomName:"start",x:5,y:4,health:2});
 let state=runPreviewRuntimeEvent(createPreviewRuntime(data),"boot");state=tickPreviewRuntime(state,12*1000/60);
 expect(state.actors.find(actor=>actor.id==="enemy")?.active).toBe(false);
 expect(state.nativeEvents.projectiles).toHaveLength(0);
 });
 it("blocks movement in the Adventure blank state",()=>{
 const state=runPreviewRuntimeEvent(createPreviewRuntime(project(["set_adventure_state blank"])),"boot");
 const moved=dispatchPreviewRuntimeAction(state,"right");expect(moved.player?.x).toBe(state.player?.x);
 });
 it("waits for a choice and resumes with its numeric result",()=>{
 let state=runPreviewRuntimeEvent(createPreviewRuntime(project(["open_menu prompt answer","set_variable after 1"])),"boot");
 expect(state.variables.after).toBeUndefined();
 state=dispatchPreviewRuntimeAction(state,"down");state=dispatchPreviewRuntimeAction(state,"action");state=tickPreviewRuntime(state,1000/60);
 expect(state.variables).toMatchObject({answer:2,after:1});
 });
 it("accepts digits and records success or cancellation without an automatic answer",()=>{
 let state=runPreviewRuntimeEvent(createPreviewRuntime(project(["open_code_lock unlocked 2 10","set_variable after 1"])),"boot");
 expect(state.variables.after).toBeUndefined();
 state=dispatchPreviewRuntimeAction(state,"up");state=dispatchPreviewRuntimeAction(state,"action");state=tickPreviewRuntime(state,1000/60);
 expect(state.variables).toMatchObject({unlocked:1,after:1});
 });
 it("equips an owned item without consuming it",()=>{
 let state=runPreviewRuntimeEvent(createPreviewRuntime(project(["add_item sword 1","open_equip_menu 2 true"])),"boot");
 state=dispatchPreviewRuntimeAction(state,"action");state=dispatchPreviewRuntimeAction(state,"down");state=dispatchPreviewRuntimeAction(state,"action");
 expect(state.equippedItems["0"]).toBe("sword");expect(state.inventory.sword).toBe(1);
 });
 it("buys the configured shop item using the same named inventory indices as the ROM",()=>{
 const data=project(["add_item coin 20","add_item sword 1","open_shop Hero","set_variable done 42"]);
 (data.scenas as Record<string,unknown>[])[0]!.runtime={type:"topdown",config:{modules:[
 {id:"inventory",enabled:true,settings:{}},{id:"shop",enabled:true,settings:{label:"POTION",item:1,currencyItem:0,price:7}}
 ]}};
 let state=runPreviewRuntimeEvent(createPreviewRuntime(data),"boot");
 state=dispatchPreviewRuntimeAction(state,"action");
 expect(state.inventory).toMatchObject({coin:13,sword:2});
 expect(state.startMenu.notice).toBe("Compra realizada: POTION.");
 state=dispatchPreviewRuntimeAction(state,"back");state=tickPreviewRuntime(state,1000/60);
 expect(state.variables.done).toBe(42);
 });
 it("runs a segment while the main script waits, then cancels it",()=>{
 const data=project(["start_segment 3 background","wait 30"]);
 (data.events as Record<string,unknown>[]).push({id:"background",name:"background",category:"Cena",steps:[{command:"set_variable child 1"},{command:"wait 3"},{command:"set_variable child 2"}]},{id:"cancel",name:"cancel",category:"Cena",steps:[{command:"stop_segment 3"}]});
 let state=runPreviewRuntimeEvent(createPreviewRuntime(data),"boot");state=tickPreviewRuntime(state,1000/60);
 expect(state.variables.child).toBe(1);expect(state.scriptWaitFrames).toBe(29);
 state=runPreviewRuntimeEvent({...state,scriptWaitFrames:0},"cancel");state=tickPreviewRuntime(state,10*1000/60);expect(state.variables.child).toBe(1);
 });
});
