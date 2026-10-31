// Controller-only native regression for the complete example menu and approved audio.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {encodePngRgba} from './lib/png-icons.mjs';
import {createNativeAudioRecorder} from './lib/native-audio-recorder.mjs';

import {resolveEnginePackRoot} from './resolve-engine-pack-root.mjs';
const app=path.resolve(import.meta.dirname,'..'),repo=path.resolve(app,'../..');
const [romArgument,exportArgument,outputArgument]=process.argv.slice(2);
assert.ok(romArgument&&exportArgument&&outputArgument,'Usage: smoke-initial-menu-audio.mjs ROM EXPORT OUTPUT [--video]');
const romFile=path.resolve(romArgument),exportDir=path.resolve(exportArgument),captureVideo=process.argv.includes('--video');
const output=path.resolve(outputArgument);fs.mkdirSync(output,{recursive:true});
const exported=JSON.parse(fs.readFileSync(path.join(exportDir,'export_project.json')));
const arm='/opt/devkitpro/devkitARM/bin/arm-none-eabi-';
const layoutSource=path.join(output,'layout.cpp');
fs.writeFileSync(layoutSource,`#include <cstddef>
#include "gbs/menu.hpp"
extern "C" const unsigned layout[] __attribute__((section(".rodata.layout")))={
sizeof(gbs::MenuRuntimeState),offsetof(gbs::MenuRuntimeState,screen_index),offsetof(gbs::MenuRuntimeState,selected_item_index),
offsetof(gbs::EventState,variables),sizeof(gbs::EventState)};
`);
const compile=spawnSync(arm+'g++',['-std=c++17','-I',path.join(resolveEnginePackRoot(app),'include'),'-c',layoutSource,'-o',path.join(output,'layout.o')],{encoding:'utf8'});
assert.equal(compile.status,0,compile.stderr);
assert.equal(spawnSync(arm+'objcopy',['-O','binary','--only-section=.rodata.layout',path.join(output,'layout.o'),path.join(output,'layout.bin')]).status,0);
const layout=fs.readFileSync(path.join(output,'layout.bin'));
const nm=spawnSync(arm+'objdump',['-t','-C',romFile.replace('.gba','.elf')],{encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(nm.status,0);
const symbols=nm.stdout.split('\n').flatMap(line=>{const m=line.match(/^([\da-f]+)\s+\w\s+.*?\s(\.[\w.]+)\s+([\da-f]+)\s+(.*)$/);return m?[{address:parseInt(m[1],16),size:parseInt(m[3],16),section:m[2],name:m[4]}]:[];});
const menus=symbols.filter(s=>s.name.endsWith('::menu_state')&&s.section.endsWith('_runtime_menu')&&s.size===layout.readUInt32LE(0));assert.equal(menus.length,1);
const menu=menus[0],prefix=menu.name.slice(0,-'menu_state'.length),event=symbols.find(s=>s.name===prefix+'event_state'&&s.section===menu.section);assert.ok(event);assert.equal(event.size,layout.readUInt32LE(16),'Event state ABI matches the menu ELF section');
const wasm=fs.readFileSync(path.join(repo,'apps/desktop-electron/static/WebPlayer/player/mgba-core.wasm'));
const core=await createMGBA({print(){},printErr(){},instantiateWasm(imports,receive){const i=new WebAssembly.Instance(new WebAssembly.Module(wasm),imports);receive(i);return i.exports;}});
const cueRecorder=createNativeAudioRecorder(core,output),demoRecorder=createNativeAudioRecorder(core,output);
let recordingVideo=false,videoFD=null,videoFrames=0;
const report={passed:false,inputs:[],cues:{},screens:{},layout:{menu,event,menuOffsets:Array.from({length:5},(_,i)=>layout.readUInt32LE(i*4))}};
const read16=a=>core._gba_audio_register(a), read32=a=>(read16(a)|(read16(a+2)<<16))>>>0;
const state=()=>({screen:read32(menu.address+layout.readUInt32LE(4)),selected:read32(menu.address+layout.readUInt32LE(8)),telemetry:readRuntimeTelemetry(core)});
const screenIndex=name=>exported.menu_project.screens.findIndex(s=>s.name===name);
function frame(){const p=core._gba_framebuffer(),pixels=core.HEAPU8.slice(p,p+153600);for(let i=3;i<pixels.length;i+=4)pixels[i]=255;return pixels;}
function capture(name){fs.writeFileSync(path.join(output,name+'.png'),encodePngRgba({width:240,height:160,pixels:frame()}));report.screens[name]=state();}
function run(frames,keys=0){report.inputs.push({frames,keys});core._gba_set_keys(keys);for(let i=0;i<frames;i++){core._gba_run_frame();cueRecorder.frame();demoRecorder.frame();if(recordingVideo){fs.writeSync(videoFD,frame());videoFrames++;}}}
const tap=(keys,rest=60)=>{run(4,keys);run(rest);};
function boot(){assert.equal(core._gba_init(),1);const rom=fs.readFileSync(romFile),p=core._malloc(rom.length);core.HEAPU8.set(rom,p);assert.equal(core._gba_load_rom(p,rom.length),1);core._free(p);run(180);assert.equal(state().screen,screenIndex('title'));}
function measure(file){const b=fs.readFileSync(file),samples=(b.length-44)/2;let square=0,peak=0,clipped=0;for(let i=44;i<b.length;i+=2){const s=b.readInt16LE(i);square+=s*s;peak=Math.max(peak,Math.abs(s));if(Math.abs(s)>=32767)clipped++;}const halfSecond=b.readUInt32LE(24)*2/2;let tail=0;for(let i=Math.max(44,b.length-halfSecond*2);i<b.length;i+=2)tail=Math.max(tail,Math.abs(b.readInt16LE(i)));return {file:path.basename(file),peak,rms:Math.sqrt(square/samples),clippedSamples:clipped,lastHalfSecondPeak:tail};}
function finishCue(name){const result=measure(cueRecorder.stop());assert.ok(result.peak>30&&result.clippedSamples===0,name+' has quiet non-clipped audio');assert.equal(result.lastHalfSecondPeak,0,name+' finishes in silence');report.cues[name]=result;assert.equal(read16(0x04000084)&15,0,'No old PSG feedback or looping music');}
try{
 boot();cueRecorder.select('title-idle');run(180);report.idle=measure(cueRecorder.stop());assert.equal(report.idle.peak,0);capture('title');
 if(captureVideo)videoFD=fs.openSync(path.join(output,'demo.rgba'),'w');recordingVideo=captureVideo;demoRecorder.select('menu-integrado-demo');
 cueRecorder.select('abrir');tap(8,70);assert.equal(state().screen,screenIndex('title_options'));finishCue('abrir');capture('options');
 cueRecorder.select('navegar');run(120,16);run(40);assert.equal(state().selected,1,'Held right advances once');finishCue('navegar');capture('load-selected');
 cueRecorder.select('indisponivel');tap(1,70);assert.equal(state().screen,screenIndex('title_options'));assert.equal(state().selected,1);finishCue('indisponivel');
 cueRecorder.select('voltar');tap(2,70);assert.equal(state().screen,screenIndex('title'));finishCue('voltar');
 tap(8,70);assert.equal(state().selected,0);
 cueRecorder.select('confirmar');tap(1,70);assert.equal(state().screen,screenIndex('escolha_genero'));finishCue('confirmar');capture('new-game');
 recordingVideo=false;if(videoFD!==null)fs.closeSync(videoFD);videoFD=null;demoRecorder.stop();report.videoFrames=videoFrames;
 core._gba_destroy();boot();tap(8);for(let i=0;i<3;i++)tap(16,12);assert.equal(state().selected,3);tap(1);assert.equal(state().screen,screenIndex('configuracoes'));
 tap(128,12);tap(128,12);const settings=exported.menu_project.screens[screenIndex('configuracoes')],sfxIndex=settings.items.findIndex(item=>item.audio_channel==='sfx');assert.equal(state().selected,sfxIndex);
 for(let i=0;i<9;i++)tap(32,8);run(80);
 const variable=settings.items[sfxIndex].adjust_variable,volume=()=>read32(event.address+layout.readUInt32LE(12)+variable*4);assert.equal(volume(),0,'SFX slider reached zero');capture('sfx-muted');
 cueRecorder.select('sfx-muted-navigation');tap(64,60);report.mutedUp={screen:state().screen,selected:state().selected,volume:volume()};tap(128,60);report.mutedDown={screen:state().screen,selected:state().selected,volume:volume()};report.muted=measure(cueRecorder.stop());assert.equal(report.muted.peak,0,'PCM effects respect the SFX volume slider');
 report.restoreSteps=[];for(let i=0;i<9;i++){tap(16,8);report.restoreSteps.push({screen:state().screen,selected:state().selected,volume:volume()});}run(80);capture('sfx-restored');assert.equal(volume(),90);
 cueRecorder.select('sfx-restored-navigation');tap(64,60);report.restored=measure(cueRecorder.stop());assert.ok(report.restored.peak>30,'Effects return when SFX volume is restored');
 report.passed=true;
}finally{if(videoFD!==null)fs.closeSync(videoFD);report.finalState=state();fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');core._gba_destroy();}
console.log(JSON.stringify({passed:report.passed,cues:report.cues,idle:report.idle,muted:report.muted,restored:report.restored,videoFrames:report.videoFrames},null,2));
