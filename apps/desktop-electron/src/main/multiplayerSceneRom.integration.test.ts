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
const controls=Boolean(process.env.GBA_LINK_CONTROLS_QA);
const output=process.env.GBA_LINK_CONTROLS_QA??process.env.GBA_LINK_SCENES_QA;
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
    const evidence:{passed:boolean;scope:string;cases:any[];[key:string]:unknown}={passed:false,scope:controls?"complete scenes, shared player controlled in turn via twelve bounded input actions; actual physics, common simulation steps with network barriers, original scripts and sixteen PCM voices; presentation and simulation cadence measured separately; native linked mGBA, not physical hardware":"complete exported scenes, stationary player, original scene scripts and actors, synthetic 16-channel long-sample XM; native linked mGBA, not physical hardware",cases:[]};
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
      const selectedScenes=process.env.GBA_LINK_SCENES?.split(",")??["porto_lumen","penedos_vento","mercado_suspenso"];
      expect(selectedScenes.every(name=>["porto_lumen","penedos_vento","mercado_suspenso"].includes(name))).toBe(true);
      for(const scene of selectedScenes) {
        const destination=path.join(temporary,"export");
        const prepared=prepareEngineProjectExport(data,{enginePackPath:pack,developmentStartScene:{name:scene}});
        expect(prepared.error).toBeUndefined();expect(prepared.generated!.target).toBeDefined();
        await writeEngineSchemaExport({prepared:prepared.generated!,projectPath,destination,assetcPath:path.join(pack,"tools/assetc"),cacheEnabled:false});
        const identity=hash(Buffer.from(JSON.stringify([await realpath(destination),path.resolve(destination,"build"),await realpath(pack)])));
        caches.add(path.join(os.tmpdir(),"gbastudio-engine-build-cache",identity));
        const main=path.join(destination,"main.cpp"),unmodified=await readFile(main,"utf8");
        expect(unmodified.split("        nullptr,\n        &runtime_rtc_provider")).toHaveLength(2);
        const kind=scene==="porto_lumen"?0:scene==="penedos_vento"?1:2;
        const captureDeclaration=controls?'extern "C" void qa_capture_topdown(int32_t*);\nextern "C" void qa_capture_platformer(int32_t*);\nextern "C" void qa_capture_isometric(int32_t*);\nextern "C" void qa_capture_control_state(int32_t* out){'+['qa_capture_topdown(out);','qa_capture_platformer(out);','qa_capture_isometric(out);'][kind]+'}\n'+["topdown","platformer","isometric"].map(runtime=>`extern "C" gbs::RuntimeAdapterFrameResult gbs_update_${runtime}(const gbs::RuntimeFrameContext&);\nextern "C" bool qa_control_should_update();\ngbs::RuntimeAdapterFrameResult qa_update_${runtime}(const gbs::RuntimeFrameContext& context){return qa_control_should_update()?gbs_update_${runtime}(context):gbs::RuntimeAdapterFrameResult::Continue;}\n`).join(""):"";
        let instrumented=unmodified.replace('#include "mixed_project_data.hpp"','#include "mixed_project_data.hpp"\n'+captureDeclaration+'#include "qa-service.hpp"')
          .replace("        nullptr,\n        &runtime_rtc_provider","        scene_link_frame,\n        &runtime_rtc_provider");
        if(controls)for(const runtime of ["topdown","platformer","isometric"])instrumented=instrumented.replace(`        gbs_update_${runtime},`,`        qa_update_${runtime},`);
        await writeFile(path.join(destination,"qa-service.hpp"),await readFile(path.join(fixtures,controls?"multiplayer-control-service.hpp":"multiplayer-scene-service.hpp")));
        await writeFile(path.join(destination,"qa-song.hpp"),await readFile(path.join(audio,"qa-song.hpp")));
        if(controls) {
          const bodies={
            topdown:'out[0]=player.position_pixels.x*256;out[1]=player.position_pixels.y*256;out[4]=0;out[5]=player.direction;',
            platformer:'out[0]=player.bounds_pixels.x*256+player.movement_remainder_x256.x;out[1]=player.bounds_pixels.y*256+player.movement_remainder_x256.y;out[4]=(player.on_ground?1:2)|(player.hit_wall?4:0);out[5]=int(player.facing);',
            isometric:'out[0]=actors[0].position_x256;out[1]=actors[0].position_y256;out[4]=0;out[5]=int(actor_animation_states[0].direction);'
          };
          for(const [runtime,body] of Object.entries(bodies)) {
            const inc=path.join(destination,`${runtime}_runtime.inc`),code=await readFile(inc,"utf8");
            expect(code).toContain("gbs::begin_frame().input");
            await writeFile(inc,code.replaceAll("gbs::begin_frame().input","qa_control_input(gbs::begin_frame().input)"));
            const cpp=path.join(destination,`${runtime}_runtime.cpp`);
            await writeFile(cpp,'#include "gbs/input.hpp"\nextern "C" gbs::InputState qa_control_input(gbs::InputState);\n'+await readFile(cpp,"utf8")+`\nextern "C" void qa_capture_${runtime}(int32_t* out){${body}}\n`);
          }
        }
        const selectedPlayers=process.env.GBA_LINK_PLAYERS?.split(",").map(Number)??(controls?[2,4]:[0,2,4]);
        expect(selectedPlayers.every(n=>(controls?[2,4]:[0,2,4]).includes(n))).toBe(true);
        for(const players of selectedPlayers) {
          const name=`${scene}-${players}`;console.log("Native scene:",name);
          await writeFile(main,`#define QA_PLAYERS ${players}\n#define QA_CONTROL_KIND ${kind}\n#define QA_SCENE ${JSON.stringify(scene)}\n`+instrumented);
          const result=await runGbsbuild({enginePackPath:pack,gbsbuildPath:path.join(pack,"tools/gbsbuild"),projectDir:destination});
          await writeFile(path.join(root,`${name}-build.json`),JSON.stringify(result));expect(result.exitCode,result.stderr).toBe(0);
          const rom=path.join(destination,`build/${prepared.generated!.target}.gba`);
          const symbols=run(tool("nm"),[rom.replace(/\.gba$/,".elf")]);
          const address=symbols.split("\n").find(line=>line.endsWith(" scene_link_witness"))?.split(" ")[0];expect(address).toBeDefined();
          let log="";
          const history=controls?symbols.split("\n").find(line=>line.endsWith(" control_history"))?.split(" ")[0]:undefined;
          if(controls)expect(history).toBeDefined();
          try {log=run(runner,[String(players||1),rom,address!,"6000",path.join(root,name),...(controls?[history!,"12"]:[])],240_000);}
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
            if(players&&!controls) {
              expect(w[3]).toBe(64);expect(w[25]).toBe(64);expect(w[5]).toBe((players-1)*64);
              for(let other=0;other<4;++other)expect(w[10+other]).toBe(other<players&&other!==peer?64:0);
            }
            if(controls) {
              expect(w[3]).toBe(12/players);expect(w[5]).toBe(12-12/players);expect(w[25]).toBe(12+12/players);
              expect(w[39]).toBe(12*(8+(kind===1?48:12)));
            }
            expect(result.peak).toBeGreaterThan(100);expect(result.samples).toBeGreaterThan(100_000);
            const raw=path.join(root,`${name}-${peer}.rgba`);
            await writeFile(path.join(root,`${name}-${peer}.png`),encodePngRgba({width:240,height:160,pixels:await readFile(raw)}));
            await rm(raw);
          }
          if(controls) {
            const checkpoints=records.filter((r:any)=>r.type==="control");expect(checkpoints).toHaveLength(players*12);
            let maximumLatency=0,moving=0,foreignInput=0;
            for(let seq=0;seq<12;++seq) {
              const group=checkpoints.filter((r:any)=>r.seq===seq),owner=group.find((r:any)=>r.peer===seq%players);
              expect(owner.keyVideo).toBeGreaterThan(0);
              for(const record of group) {
                const h=record.history;
                expect(h[1]).toBe(seq%players);expect(h[2]).toBe(owner.history[2]);expect(h[13]).toBe(8);expect(h[15]).toBe(1);
                expect(h[8],`${name} seq ${seq} X`).toBe(owner.history[8]);expect(h[9],`${name} seq ${seq} Y`).toBe(owner.history[9]);
                expect(h[11]).toBe(h[2]);expect(h[12]).toBe(h[2]);
                if(record.peer!==seq%players&&h[14]!==h[2])++foreignInput;
                maximumLatency=Math.max(maximumLatency,record.startVideo-owner.keyVideo);
              }
              if(owner.history[8]!==owner.history[6]||owner.history[9]!==owner.history[7])++moving;
              if(kind===1&&(owner.history[2]&1))expect(owner.history[16]).toBeLessThan(owner.history[7]);
              if(kind===0&&seq===4) {
                const walk=checkpoints.find((r:any)=>r.seq===0&&r.peer===0).history;
                expect(Math.abs(owner.history[8]-owner.history[6]),"authored R sprint moves farther than walking").toBeGreaterThan(Math.abs(walk[8]-walk[6]));
              }
            }
            expect(moving).toBeGreaterThanOrEqual(4);expect(foreignInput).toBeGreaterThan(0);
            const firstKey=Math.min(...checkpoints.filter((r:any)=>r.keyVideo>0).map((r:any)=>r.keyVideo));
            const lastEnd=Math.max(...checkpoints.map((r:any)=>r.endVideo));
            Object.assign(item,{maximumLatencyVideoFrames:maximumLatency,maximumLatencyMs:maximumLatency*1000/59.72750057,movingActions:moving,simulationUpdatesPerSecond:12*(8+(kind===1?48:12))*59.72750057/(lastEnd-firstKey)});
            expect(maximumLatency,"remote action starts within about 250 ms").toBeLessThanOrEqual(15);
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
