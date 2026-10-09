import { describe, expect, it } from "vitest";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { nativeEventFixture } from "./nativeEventTestFixture.js";
describe("positioned text",()=>{
 it("exports literal UTF-8 text at world or screen coordinates",()=>{
 const result=prepareEngineProjectExport(nativeEventFixture(["draw_text 2 3 overlay Olá mundo","draw_text 30 20 background Vila"]));
 expect(result.error).toBeUndefined();
 const p=result.generated!.contract.topdown_project!;
 expect(p.dialogue_lines.map(line=>line.text)).toEqual(["Olá mundo","Vila"]);
 expect(p.scripts[0]!.script).toEqual([{op:"draw_text",line:0,x:2,y:3,layer:"overlay"},{op:"draw_text",line:1,x:30,y:20,layer:"background"}]);
 });
 it.each(["draw_text Texto direto no jogo","draw_text 2 3 typo texto","draw_text 29 3 overlay abc","draw_text -1 2 background x"])("rejects invalid coordinates and incomplete contracts: %s",command=>expect(prepareEngineProjectExport(nativeEventFixture([command])).error).toBeTruthy());
});
