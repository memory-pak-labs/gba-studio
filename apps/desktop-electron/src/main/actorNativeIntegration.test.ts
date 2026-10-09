import { describe, expect, it } from "vitest";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { nativeEventFixture } from "./nativeEventTestFixture.js";
function project(commands: string[]) {
 const data = nativeEventFixture(commands);
 Object.assign(data, {
 assets: [{id:"asset-hero",name:"hero.png",kind:"Sprite",metadata:{source:"Assets/sprites/hero.png"}}],
 actors: [{id:"hero",name:"Hero",roomName:"start",x:4,y:4,spriteSheet:"hero.png"}],
 animations: [
 {id:"idle",name:"idle",state:"idle",direction:"down",spriteSheet:"hero.png",frameWidth:16,frameHeight:16,frameCount:1,fps:4},
 {id:"walk",name:"walk",state:"walk",direction:"down",spriteSheet:"hero.png",frameWidth:16,frameHeight:16,frameCount:1,fps:4}],
 animationStates:[{id:"combat-state",name:"combat",spriteSheet:"hero.png",animationType:"fixed_movement",mirrorLeftFromRight:false,animationIDs:["idle","walk"]}]
 }); return data;
}
describe("actor resources authored in events", () => {
 it("exports a per-actor effect rather than an emote or whole-screen effect", () => {
 const result=prepareEngineProjectExport(project(["actor_effects Hero flash 30 50"]));
 expect(result.error).toBeUndefined();
 expect(result.generated!.contract.topdown_project!.scripts[0]!.script).toEqual([{op:"actor_effects",actor:0,index:0,frames:30,intensity:50}]);
 });
 it("exports an entire animation state, cancellation and a sprite-bound projectile slot", () => {
 const result=prepareEngineProjectExport(project(["set_actor_animation_state Hero combat-state","cancel_actor_movement Hero","projectile_load_slot 3 hero.png 12 150","launch_projectile_slot Hero 3 down"]));
 expect(result.error).toBeUndefined();
 const p=result.generated!.contract.topdown_project!;
 expect(p.actor_sprites).toHaveLength(2);
 expect(p.actor_sprites?.[0]?.animations).toHaveLength(8);
 expect(p.scripts[0]!.script).toEqual([
 {op:"set_actor_sprite",actor:0,sprite:0},{op:"cancel_actor_movement",actor:0},
 {op:"projectile_load_slot",slot:3,sprite:1,damage:12,speed:150},
 {op:"launch_projectile_slot",actor:1,slot:3,direction:"down"}]);
 });
 it("isolates streamed projectile tiles from the actor's resident range", () => {
 const data=project(["projectile_load_slot 0 hero.png 1 100"]);
 (data.assets as Record<string,unknown>[])[0]!.metadata={source:"Assets/sprites/hero.png",streamFrames:true};
 const result=prepareEngineProjectExport(data);expect(result.error).toBeUndefined();
 const p=result.generated!.contract.topdown_project!;
 expect(p.player.metasprite?.asset).not.toBe(p.actor_sprites?.[0]?.metasprite?.asset);
 });
 it("resolves the player configured by its scene for native actor commands", () => {
 const data=project(["cancel_actor_movement Hero"]);
 (data.scenas as Record<string,unknown>[])[0]!.playerActorName="Hero";
 const result=prepareEngineProjectExport(data);expect(result.error).toBeUndefined();
 expect(result.generated!.contract.topdown_project!.scripts[0]!.script).toEqual([{op:"cancel_actor_movement",actor:-1}]);
 });
 it.each(["set_actor_animation_state Hero absent","cancel_actor_movement absent","projectile_load_slot 8 hero.png 1 100","projectile_load_slot 0 absent.png 1 100","launch_projectile_slot Hero 3 typo"])("rejects unresolved resources and operands: %s", command=>{
 expect(prepareEngineProjectExport(project([command])).error).toBeTruthy();
 });
});
