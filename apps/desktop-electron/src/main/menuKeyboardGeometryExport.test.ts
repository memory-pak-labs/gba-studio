import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
it("exports authored keyboard geometry with every native key position",()=>{
 const project=JSON.parse(readFileSync(new URL("../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",import.meta.url),"utf8"));
 const geometry={columns:6,rows:5,columnGap:1,rowGap:0,keys:Array.from({length:29},(_,i)=>({x:i<26?i%8*2:(i-26)*6,y:i<26?Math.floor(i/8)*2:8}))};
 for(const key of ["rooms","scenas"])project[key].find((r:{name:string})=>r.name==="nome_jogador").runtime.config.textInput.keyboard.geometry=geometry;
 const screen=buildEngineExportProjectContract(project).menu_project!.screens.find(s=>s.name==="nome_jogador")!;
 expect(screen.text_input).toHaveProperty("keyboard_geometry",geometry);
});

it("rejects an Engine Pack that would silently discard authored keyboard geometry",async()=>{
 const {mkdtemp,mkdir,writeFile,rm}=await import("node:fs/promises");
 const path=await import("node:path"),os=await import("node:os");
 const {prepareEngineProjectExport}=await import("./exportEngineProject.js");
 const {writeEngineSchemaExport}=await import("./engineProjectExport.js");
 const root=await mkdtemp(path.join(os.tmpdir(),"gba-keyboard-pack-"));
 try{
  const project=JSON.parse(readFileSync(new URL("../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",import.meta.url),"utf8"));
  for(const key of ["rooms","scenas"])project[key].find((r:{name:string})=>r.name==="nome_jogador").runtime.config.textInput.keyboard.geometry={columns:8,rows:4,columnGap:0,rowGap:0};
  const pack=path.join(root,"pack");await mkdir(pack);await writeFile(path.join(pack,"enginepack.json"),JSON.stringify({capabilities:{engine_sdk:[]}}));
  const prepared=prepareEngineProjectExport(project,{enginePackPath:pack}).generated!;
  await expect(writeEngineSchemaExport({destination:path.join(root,"out"),prepared,assetcPath:path.join(pack,"tools/assetc")})).rejects.toThrow("composição de teclado");
 }finally{await rm(root,{recursive:true,force:true});}
});
