import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "../shared/newProject.js";
import { createAdvancedHudPresetInProject, updateHudPresetInProject } from "../shared/hudPresets.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
describe("HUD behavior export",()=>{
 it("exports declared variable indices and preserves state text and bounded actions",()=>{
  let data=createAdvancedHudPresetInProject(createBlankProjectData({name:"HUD"}),"hud-default","interactive","Interactive");
  data.variables=[{id:"v-choice",name:"choice",initialValue:0},{id:"v-result",name:"result",initialValue:0}];
  data=updateHudPresetInProject(data,"interactive",{components:[{id:"button",kind:"text",label:"Button",text:"PORTO",asset:"",x:8,y:8,width:64,height:8,zIndex:0,visible:true,behavior:{states:{selected:{variable:"choice",value:1,text:"FOCO"}},events:[{trigger:"confirm",actions:[{op:"set_variable",variable:"result",value:7}]}]}}]});
  const contract=buildEngineExportProjectContract(data);
  const component=contract.topdown_project?.dialogue_ui?.hud_layouts?.find(layout=>layout.id==="interactive")?.components[0];
  expect(component).toMatchObject({behavior:{states:{selected:{variable:0,value:1,text:"FOCO"}},events:[{trigger:"confirm",actions:[{op:"set_variable",variable:1,value:7}]}]}});
 });
});
