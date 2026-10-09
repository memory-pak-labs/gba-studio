import { describe, expect, it } from "vitest";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { nativeEventFixture } from "./nativeEventTestFixture.js";
describe("parallel scripts and Adventure actions",()=>{
 it("binds a parallel script and native Adventure actions",()=>{
 const data=nativeEventFixture(["start_segment 3 background","stop_segment 3","set_adventure_state dash","push_actor Crate true"]);
 Object.assign(data,{actors:[{id:"crate",name:"Crate",roomName:"start",x:4,y:4}],events:[...(data.events as Record<string,unknown>[]),{id:"background",name:"background",category:"Cena",roomName:"start",steps:[{command:"wait 30"},{command:"set_variable count 2"}]}]});
 const result=prepareEngineProjectExport(data);expect(result.error).toBeUndefined();
 expect(result.generated!.contract.topdown_project!.scripts[0]!.script).toEqual([
 {op:"start_segment",slot:3,script:1},{op:"stop_segment",slot:3},{op:"set_adventure_state",index:1},{op:"push_actor",actor:0,value:true}]);
 });
 it.each(["start_segment 32 absent","start_segment 0 absent","set_adventure_state invented","push_actor Player tile hole"])("rejects invalid contracts: %s",command=>expect(prepareEngineProjectExport(nativeEventFixture([command])).error).toBeTruthy());
});
