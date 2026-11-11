import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createBlankProjectData } from "../shared/newProject.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

const output=process.env.GBA_QUEUE_ROM_QA;
describe.skipIf(!output)("authored queued multiplayer in ROM",()=>{
  it("exports visual commands and retains a full 16-bit message while the cable is absent",async()=>{
    const root=path.resolve(output!);await mkdir(root,{recursive:true});
    const pack=path.resolve(process.env.GBA_TRACKER_ENGINE_PACK??"../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const template=path.resolve("default-assets/templates/exemplo-gba"),templatePath=path.join(template,"exemplo-gba.gba-project");
    const example=Boolean(process.env.GBA_QUEUE_ROM_EXAMPLE),original=example ? await readFile(templatePath) : undefined;
    const data=example ? JSON.parse(original!.toString()) : createBlankProjectData({name:"QA Filas",includeStarterContent:false});
    if(example) {
      const assets=path.join(root,"Assets");
      try {await symlink(path.join(template,"Assets"),assets,"dir");}
      catch(error) {expect(await readlink(assets)).toBe(path.join(template,"Assets"));}
    }
    (data.settings as any).runtimeCapabilities.link.enabled=true;
    let commands=["set_variable net.message 65535","multiplayer_queue_open 2 115200 4","multiplayer_queue_send net.message net.accepted",
      "multiplayer_queue_receive net.value net.sender net.received","multiplayer_queue_status net.state net.local net.pending"];
    if(example) {
      // The complete template already uses all 64 variables. Reuse eight QA
      // slots only in this disposable copy; never increase the engine limit.
      const keys=["net.message","net.accepted","net.value","net.sender","net.received","net.state","net.local","net.pending"];
      const slots=data.variables.slice(-8);
      expect(slots).toHaveLength(8);
      const names=new Map(keys.map((key,index)=>[key,slots[index].name]));
      commands=commands.map(command=>command.split(" ").map(token=>names.get(token)??token).join(" "));
    }
    const initial=example ? data.rooms.find((room:any)=>room.name==="porto_lumen").eventBindings?.onInit : undefined;
    data.events.push({id:"network",name:"network",category:"Cena",steps:[...commands,...(initial ? [`call_event ${initial}`] : [])].map(command=>({command}))});
    for(const rooms of [data.rooms,data.scenas]) for(const room of rooms) if(!example||room.name==="porto_lumen") room.eventBindings={...room.eventBindings,onInit:"network"};
    const projectPath=path.join(root,"source.gba-project");await writeFile(projectPath,JSON.stringify(data));
    const source=await readFile(projectPath),destination=path.join(root,"export"),temporary=path.join(root,"layout");
    const evidence:Record<string,unknown>={passed:false,scope:"exported ROM without cable; delivery is tested separately with modeled peers"};
    let ownedCache: string | undefined;
    try {
      const prepared=prepareEngineProjectExport(data,{enginePackPath:pack,...(example ? {developmentStartScene:{name:"porto_lumen"}} : {})});
      expect(prepared.error).toBeUndefined();expect(prepared.generated).toBeDefined();
      expect(prepared.generated!.contract.topdown_project!.rooms.find(room=>room.name===(example ? "porto_lumen" : "cena_1"))!.on_enter!.map(command=>command.op)).toContain("multiplayer_queue_open");
      await writeEngineSchemaExport({prepared:prepared.generated!,projectPath,destination,assetcPath:path.join(pack,"tools/assetc"),cacheEnabled:false});
      const identity=createHash("sha256").update(JSON.stringify([await realpath(destination),path.resolve(destination,"build"),await realpath(pack)])).digest("hex");
      ownedCache=path.join(os.tmpdir(),"gbastudio-engine-build-cache",identity);
      const build=await runGbsbuild({enginePackPath:pack,gbsbuildPath:path.join(pack,"tools/gbsbuild"),projectDir:destination});
      expect(build.exitCode,build.stderr).toBe(0);
      const romPath=path.join(destination,`build/${prepared.generated!.target}.gba`);
      const tool=(name:string)=>path.join(process.env.DEVKITARM??"/opt/devkitpro/devkitARM","bin/arm-none-eabi-"+name);
      const symbols=execFileSync(tool("nm"),["-C",romPath.replace(/\.gba$/,".elf")],{encoding:"utf8",maxBuffer:16*1024*1024});
      const symbol=(name:string)=>{const line=symbols.split("\n").find(line=>line.endsWith("::"+name));expect(line,name).toBeDefined();return parseInt(line!.split(" ")[0],16);};
      const connection=symbol("connection_storage");
      const serialLine=symbols.split("\n").find(line=>line.endsWith(" sio_multiplayer_async"));
      expect(serialLine).toBeDefined();
      const serial=parseInt(serialLine!.split(" ")[0]!,16);
      expect(serial).toBeGreaterThanOrEqual(0x02000000);expect(serial).toBeLessThan(0x02040000);
      evidence.serialBufferAddress=serial;
      // Mixed ROMs contain an anonymous event_state per runtime. Resolve the
      // local symbol under its ELF file entry, not the first same-named state.
      const table=execFileSync(tool("objdump"),["-t","-C",romPath.replace(/\.gba$/,".elf")],{encoding:"utf8",maxBuffer:16*1024*1024});
      let file="",event=0;
      const eventCandidates:string[]=[];
      for(const line of table.split("\n")) {
        if(/\sdf\s+\*ABS\*/.test(line)) file=line.trim().split(/\s+/).at(-1)!;
        if(line.endsWith("::event_state")) {
          eventCandidates.push(`${file}: ${line}`);
          if(file===(example ? "topdown_runtime.cpp" : "main.cpp")) event=parseInt(line.split(/\s+/)[0]!,16);
        }
      }
      await writeFile(path.join(root,"event-state-symbols.txt"),eventCandidates.join("\n"));
      expect(event,"active topdown event state").toBeGreaterThanOrEqual(0x02000000);
      expect(connection).toBeGreaterThanOrEqual(0x02000000);expect(connection).toBeLessThan(0x02040000);
      await mkdir(temporary,{recursive:true});
      const layoutSource=path.join(temporary,"layout.cpp"),object=path.join(temporary,"layout.o"),binary=path.join(temporary,"layout.bin");
      await writeFile(layoutSource,'#include <cstddef>\n#include "gbs/multiplayer.hpp"\n#include "gbs/event.hpp"\nextern "C" const unsigned layout[] __attribute__((section(".rodata.layout")))={offsetof(gbs::MultiplayerQueue,state),offsetof(gbs::MultiplayerQueue,send_count),offsetof(gbs::MultiplayerQueue,outgoing),offsetof(gbs::MultiplayerQueue,recoveries),offsetof(gbs::EventState,variables)};\n');
      execFileSync(tool("g++"),["-std=c++17","-I",path.join(pack,"include"),"-c",layoutSource,"-o",object]);
      execFileSync(tool("objcopy"),["-O","binary","--only-section=.rodata.layout",object,binary]);
      const layout=await readFile(binary),offset=(i:number)=>layout.readUInt32LE(i*4);
      const {default:create}=await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-core.mjs")).href);
      const wasm=new WebAssembly.Module(await readFile("static/WebPlayer/player/mgba-core.wasm"));
      const core=await create({print(){},printErr(){},instantiateWasm(imports:WebAssembly.Imports,done:(instance:WebAssembly.Instance)=>void){const instance=new WebAssembly.Instance(wasm,imports);done(instance);return instance.exports;}});
      try {
        expect(core._gba_init()).toBe(1);const rom=await readFile(romPath),pointer=core._malloc(rom.length);
        core.HEAPU8.set(rom,pointer);expect(core._gba_load_rom(pointer,rom.length)).toBe(1);core._free(pointer);
        for(let frame=0;frame<240;++frame)core._gba_run_frame();
        const read16=(at:number)=>core._gba_audio_register(at),read32=(at:number)=>(read16(at)|(read16(at+2)<<16))>>>0;
        const read8=(at:number)=>(read16(at&~1)>>((at&1)*8))&255;
        const contract=JSON.parse(await readFile(path.join(destination,"export_project.json"),"utf8"));
        const script=contract.topdown_project.scripts.find((item:any)=>item.name==="network").script;
        const send=script.find((command:any)=>command.op==="multiplayer_queue_send");
        const receive=script.find((command:any)=>command.op==="multiplayer_queue_receive");
        const accepted=read32(event+offset(4)+send.var_accepted*4),received=read32(event+offset(4)+receive.var_received*4);
        Object.assign(evidence,{state:read8(connection+offset(0)),pending:read8(connection+offset(1)),message:read16(connection+offset(2)),recoveries:read32(connection+offset(3)),accepted,received,romBytes:rom.length});
        expect(evidence.state).toBe(3);expect(evidence.pending).toBe(1);expect(evidence.message).toBe(65535);
        expect(evidence.recoveries).toBeGreaterThan(1);expect(accepted).toBe(1);expect(received).toBe(0);
        if(example) {
          const {encodePngRgba}=await import(/* @vite-ignore */ pathToFileURL(path.resolve("scripts/lib/png-icons.mjs")).href);
          const pointer=core._gba_framebuffer();
          await writeFile(path.join(root,"porto-lumen.png"),encodePngRgba({width:240,height:160,pixels:core.HEAPU8.slice(pointer,pointer+240*160*4)}));
        }
        evidence.passed=true;
      } finally {core._gba_destroy();}
      expect(await readFile(projectPath)).toEqual(source);
      if(original) expect(await readFile(templatePath)).toEqual(original);
    } finally {
      await writeFile(path.join(root,"evidence.json"),JSON.stringify(evidence,null,2));
      await rm(destination,{recursive:true,force:true});await rm(temporary,{recursive:true,force:true});
      if(ownedCache)await rm(ownedCache,{recursive:true,force:true});
    }
  },300_000);
});
