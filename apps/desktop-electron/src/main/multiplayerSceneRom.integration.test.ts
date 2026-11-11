import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

// Opt-in native linked cores; uses the complete example and cleans owned builds.
const output=process.env.GBA_LINK_SCENES_QA;
const hash=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
describe.skipIf(!output)("queued multiplayer under complete-scene audio load",()=>{
  it("preserves delivery and cadence with sixteen long-sample voices in three runtimes",async()=>{
    const root=path.resolve(output!);await mkdir(root,{recursive:true});
    expect(process.env.GBA_LINK_MGBA_SOURCE,"GBA_LINK_MGBA_SOURCE is required").toBeTruthy();
    expect(process.env.GBA_LINK_MGBA_BUILD,"GBA_LINK_MGBA_BUILD is required").toBeTruthy();
    const temporary=await mkdtemp(path.join(os.tmpdir(),"gba-linked-scenes-export-"));
    const pack=path.resolve(process.env.GBA_TRACKER_ENGINE_PACK??"../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const source=path.resolve(process.env.GBA_LINK_MGBA_SOURCE!),build=path.resolve(process.env.GBA_LINK_MGBA_BUILD!);
    const fixtures=path.resolve("scripts/fixtures"),engine=path.resolve("../../packages/GBAStudioEngine");
    const run=(bin:string,args:string[],timeout=60_000)=>execFileSync(bin,args,{encoding:"utf8",maxBuffer:32*1024*1024,timeout});
    const python=process.env.PYTHON??"python3";
    const template=path.resolve("default-assets/templates/exemplo-gba");
    const templateFile=path.join(template,"exemplo-gba.gba-project"),original=await readFile(templateFile);
    const evidence:{passed:boolean;scope:string;cases:any[];[key:string]:unknown}={passed:false,scope:"complete exported scenes, stationary player, original scene scripts and actors, synthetic 16-channel long-sample XM; native linked mGBA, not physical hardware",cases:[]};
    const caches=new Set<string>();
    try {
      const revision=run("git",["-C",source,"rev-parse","HEAD"]).trim();
      expect(revision).toBe("26b7884bc25a5933960f3cdcd98bac1ae14d42e2");
      expect(run("git",["-C",source,"status","--porcelain","--untracked-files=no"]).trim()).toBe("");
      Object.assign(evidence,{revision,templateSha256:hash(original),engineSha256:hash(await readFile(path.join(pack,"lib/libgbastudio_engine.a")))});
      const data=JSON.parse(original.toString());data.settings.runtimeCapabilities.link.enabled=true;
      data.settings.audio.mixingRate=31536;
      await symlink(path.join(template,"Assets"),path.join(temporary,"Assets"),"dir");
      const projectPath=path.join(temporary,"source.gba-project");await writeFile(projectPath,JSON.stringify(data));
      const saved=await readFile(projectPath);
      const audio=path.join(temporary,"audio");
      run(python,[path.join(engine,"tests/host/tracker_stress_fixtures.py"),audio,"--pitch-channels","16","--sample-length","16384"]);
      await writeFile(path.join(audio,"audio.json"),JSON.stringify({tracker:[{name:"song",xm:"load-effects.xm",loop:true,native_primary_volume:Math.round(data.settings.audio.musicVolume*15/100)}]}));
      run(python,[path.join(pack,"tools/assetc"),path.join(audio,"audio.json"),"--audio-json","-o",path.join(audio,"qa-song.hpp"),"--name","qa_stress"]);
      const runner=path.join(temporary,"runner");
      run(process.env.CC??"cc",["-O2","-DNDEBUG","-D_GNU_SOURCE","-I"+path.join(source,"include"),"-I"+path.join(build,"include"),path.join(fixtures,"multiplayer-scene-runner.c"),path.join(build,"libmgba.a"),"-lz","-lpthread","-lm",...(process.platform==="darwin"?["-framework","CoreFoundation"]:[]),"-o",runner]);
      const {encodePngRgba}=await import(/* @vite-ignore */ pathToFileURL(path.resolve("scripts/lib/png-icons.mjs")).href);
      const tool=(name:string)=>path.join(process.env.DEVKITARM??"/opt/devkitpro/devkitARM","bin/arm-none-eabi-"+name);
      for(const scene of ["porto_lumen","penedos_vento","mercado_suspenso"]) {
        const destination=path.join(temporary,"export");
        const prepared=prepareEngineProjectExport(data,{enginePackPath:pack,developmentStartScene:{name:scene}});
        expect(prepared.error).toBeUndefined();expect(prepared.generated!.target).toBeDefined();
        await writeEngineSchemaExport({prepared:prepared.generated!,projectPath,destination,assetcPath:path.join(pack,"tools/assetc"),cacheEnabled:false});
        const identity=hash(Buffer.from(JSON.stringify([await realpath(destination),path.resolve(destination,"build"),await realpath(pack)])));
        caches.add(path.join(os.tmpdir(),"gbastudio-engine-build-cache",identity));
        const main=path.join(destination,"main.cpp"),unmodified=await readFile(main,"utf8");
        expect(unmodified.split("        nullptr,\n        &runtime_rtc_provider")).toHaveLength(2);
        const instrumented=unmodified.replace('#include "mixed_project_data.hpp"','#include "mixed_project_data.hpp"\n#include "qa-service.hpp"')
          .replace("        nullptr,\n        &runtime_rtc_provider","        scene_link_frame,\n        &runtime_rtc_provider");
        await writeFile(path.join(destination,"qa-service.hpp"),await readFile(path.join(fixtures,"multiplayer-scene-service.hpp")));
        await writeFile(path.join(destination,"qa-song.hpp"),await readFile(path.join(audio,"qa-song.hpp")));
        for(const players of [0,2,4]) {
          const name=`${scene}-${players}`;console.log("Native scene:",name);
          await writeFile(main,`#define QA_PLAYERS ${players}\n#define QA_SCENE ${JSON.stringify(scene)}\n`+instrumented);
          const result=await runGbsbuild({enginePackPath:pack,gbsbuildPath:path.join(pack,"tools/gbsbuild"),projectDir:destination});
          await writeFile(path.join(root,`${name}-build.json`),JSON.stringify(result));expect(result.exitCode,result.stderr).toBe(0);
          const rom=path.join(destination,`build/${prepared.generated!.target}.gba`);
          const symbols=run(tool("nm"),[rom.replace(/\.gba$/,".elf")]);
          const address=symbols.split("\n").find(line=>line.endsWith(" scene_link_witness"))?.split(" ")[0];expect(address).toBeDefined();
          let log="";
          try {log=run(runner,[String(players||1),rom,address!,"6000",path.join(root,name)],240_000);}
          catch(error:any) {log=String(error.stdout??"")+String(error.stderr??"");throw error;}
          finally {await writeFile(path.join(root,`${name}.jsonl`),log);}
          const records=log.trim().split("\n").map(line=>JSON.parse(line));
          const romBytes=await readFile(rom);
          expect(romBytes.length).toBeLessThanOrEqual(32*1024*1024);
          const item={scene,players,romBytes:romBytes.length,romSha256:hash(romBytes),records,passed:false};evidence.cases.push(item);
          for(let peer=0;peer<(players||1);++peer) {
            const windows=records.filter((r:any)=>r.type==="window"&&r.peer===peer);expect(windows).toHaveLength(3);
            for(const window of windows) {
              window.updatesPerSecond=window.gameFrames*59.72750057/window.videoFrames;
              expect(window.updatesPerSecond,`${name} peer ${peer} window ${window.window}`).toBeGreaterThanOrEqual(29);
              expect(window.voices).toBeGreaterThanOrEqual(16);expect(window.underruns).toBe(0);
            }
            const result=records.find((r:any)=>r.type==="peer"&&r.peer===peer),w=result.witness;
            expect(w[0]).toBe(0x53434C4B);expect(w[2],`${name} scene/value/order errors`).toBe(0);
            expect(w[16]).toBeGreaterThanOrEqual(16);expect(w[17]).toBe(0);expect(w[18]).toBeGreaterThan(100);
            expect(w[31]).toBe(1);expect(w[32]).toBe(players);expect(w[6]).toBe(0);
            expect(w[23]&0x80).toBe(w[24]&0x80);
            if(players) {
              expect(w[3]).toBe(64);expect(w[25]).toBe(64);expect(w[5]).toBe((players-1)*64);
              for(let other=0;other<4;++other)expect(w[10+other]).toBe(other<players&&other!==peer?64:0);
            }
            expect(result.peak).toBeGreaterThan(100);expect(result.samples).toBeGreaterThan(100_000);
            const raw=path.join(root,`${name}-${peer}.rgba`);
            await writeFile(path.join(root,`${name}-${peer}.png`),encodePngRgba({width:240,height:160,pixels:await readFile(raw)}));
            await rm(raw);
          }
          const pcm=path.join(root,`${name}.pcm`),bytes=await readFile(pcm),header=Buffer.alloc(44);
          header.write("RIFF");header.writeUInt32LE(bytes.length+36,4);header.write("WAVEfmt ",8);header.writeUInt32LE(16,16);
          header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(44100,24);header.writeUInt32LE(176400,28);
          header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write("data",36);header.writeUInt32LE(bytes.length,40);
          await writeFile(path.join(root,`${name}.wav`),Buffer.concat([header,bytes]));await rm(pcm);
          item.passed=true;await writeFile(path.join(root,"evidence.json"),JSON.stringify(evidence,null,2));
        }
        await rm(destination,{recursive:true,force:true});
      }
      expect(await readFile(projectPath)).toEqual(saved);expect(await readFile(templateFile)).toEqual(original);
      evidence.passed=true;
    } finally {
      const keep=process.env.GBA_LINK_SCENES_KEEP_TEMP==="1";
      if(keep)await writeFile(path.join(root,"retained-export.json"),JSON.stringify({temporary,caches:[...caches]}));
      else {await rm(temporary,{recursive:true,force:true});for(const cache of caches)await rm(cache,{recursive:true,force:true});}
      evidence.temporaryRemoved=!keep;await writeFile(path.join(root,"evidence.json"),JSON.stringify(evidence,null,2));
    }
  },1_800_000);
});
