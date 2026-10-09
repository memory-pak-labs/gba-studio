import { describe, expect, it } from "vitest";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { nativeEventFixture } from "./nativeEventTestFixture.js";
function project(commands:string[]) {
 const data=nativeEventFixture(commands);
 Object.assign(data,{dialogues:[{id:"prompt",key:"prompt",text:"Escolha",choices:["Sim","Não"]}],actors:[{id:"keeper",name:"Keeper",roomName:"start",x:2,y:2}]});
 return data;
}
describe("interactive events",()=>{
 it("binds menu response, numeric lock and equipment requests",()=>{
 const result=prepareEngineProjectExport(project(["open_menu prompt answer","open_code_lock unlocked 4 4321","open_equip_menu 5 true"]));
 expect(result.error).toBeUndefined();
 expect(result.generated!.contract.topdown_project!.scripts[0]!.script).toEqual([
 {op:"open_menu",group:0,variable:0},{op:"open_code_lock",variable:1,digits:4,code:4321},{op:"open_equip_menu",slots:5,pause:true}]);
 });
 it.each(["open_menu absent answer","open_menu prompt","open_code_lock unlocked 5 12345","open_code_lock unlocked 2 999","open_equip_menu 9 true"])("rejects invalid authoring: %s",command=>expect(prepareEngineProjectExport(project([command])).error).toBeTruthy());
});
