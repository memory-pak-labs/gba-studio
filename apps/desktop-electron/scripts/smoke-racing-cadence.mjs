import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {encodePngRgba} from './lib/png-icons.mjs';

// A video frame from the emulator is not necessarily a game update. Keep both
// clocks independent, drive ordinary controls, and retain failures for profiling.
const [romPath, output] = process.argv.slice(2);
assert.ok(romPath && output, 'Usage: node scripts/smoke-racing-cadence.mjs ROM OUTPUT [--profile-only]');
fs.mkdirSync(output, {recursive:true});
const rom=fs.readFileSync(romPath), wasm=new WebAssembly.Module(fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm',import.meta.url)));
const core=await createMGBA({print(){},printErr(){},instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(wasm,imports);receive(instance);return instance.exports;}});
const report={passed:false,romSha256:createHash('sha256').update(rom).digest('hex'),minimumHz:55,windows:[],scope:'Native ROM, actual input and independent video/gameplay clocks. No RAM or save injection.'};
const videoPath=path.join(output,'cadence.rgba');
const videoFd=process.argv.includes('--video')?fs.openSync(videoPath,'w'):null;
let snapshot=0;
try {
 assert.equal(core._gba_init(),1);
 const bytes=core._malloc(rom.length);core.HEAPU8.set(rom,bytes);assert.equal(core._gba_load_rom(bytes,rom.length),1);core._free(bytes);
 let state;
 for(let n=0;n<6000;n++) {state=readRuntimeTelemetry(core);if(state?.runtimeKind===7&&state.frame>=260)break;core._gba_run_frame();}
 assert.equal(state?.runtimeKind,7,'The canonical ROM starts in a racing scene');
 assert.ok(state.frame>=260,'The authored countdown has completed');
 const initialRoom=state.currentRoom, size=core._gba_state_size();
 assert.equal(size,0x61000,'Calibrate the video clock if the mGBA snapshot format changes');
 snapshot=core._malloc(size);
 const video=()=>{assert.equal(core._gba_save_state(snapshot,size),1);return new DataView(core.HEAPU8.buffer).getUint32(snapshot+0x1fc,true);};
 const symbols=spawnSync('/opt/devkitpro/devkitARM/bin/arm-none-eabi-objdump',['-t','-C',romPath.replace(/\.gba$/,'.elf')],{encoding:'utf8',maxBuffer:8*1024*1024});
 const regions=symbols.stdout?.split('\n').find(line=>/::s_regions$/.test(line));
 const profileAddress=regions?parseInt(regions.split(/\s+/)[0],16):0;
 const read8=a=>(core._gba_audio_register(a&~1)>>((a&1)*8))&255;
 const read32=a=>(core._gba_audio_register(a)|(core._gba_audio_register(a+2)<<16))>>>0;
 const profiles=()=>!profileAddress?[]:Array.from({length:16},(_,i)=>{const address=profileAddress+i*44;let label='';for(let c=0;c<24;c++){const byte=read8(address+c);if(!byte)break;label+=String.fromCharCode(byte);}return{label,samples:read32(address+24),total:read32(address+28),max:read32(address+36)};}).filter(r=>r.label);
 for(const [name,keys]of [['idle',0],['accelerate',1],['steer-left',33],['steer-right',17],['brake',2]]) {
  const before=readRuntimeTelemetry(core), start=video(), samples=[];
  let previous=before.frame, repeated=0,longestRepeat=0,inputLatency=null;
  core._gba_set_keys(keys);
  for(let frame=0;frame<120;frame++) {
   core._gba_run_frame();state=readRuntimeTelemetry(core);
   if(videoFd!==null){const pixels=core.HEAPU8.slice(core._gba_framebuffer(),core._gba_framebuffer()+153600);for(let i=3;i<pixels.length;i+=4)pixels[i]=255;fs.writeSync(videoFd,pixels);}
   assert.equal(state?.runtimeKind,7,'The probe remains in racing');assert.equal(state.currentRoom,initialRoom,'The probe remains in the same race');
   if(inputLatency===null&&state.input?.held===keys)inputLatency=frame+1;
   if(state.frame===previous){repeated++;longestRepeat=Math.max(longestRepeat,repeated);}else{samples.push({cpu:state.timing.cpuWorkTicks,...state.subsystems.frameTicks});repeated=0;}
   previous=state.frame;
  }
  const after=readRuntimeTelemetry(core), emulatedFrames=(video()-start)>>>0,updates=after.frame-before.frame;
  assert.equal(emulatedFrames,120,'The bridge advances one video frame per call');
  const timing=Object.fromEntries(Object.keys(samples[0]??{}).map(key=>[key,{mean:samples.reduce((sum,s)=>sum+s[key],0)/samples.length,max:Math.max(...samples.map(s=>s[key]))}]));
  report.windows.push({name,emulatedFrames,updates,hz:updates*59.7275/emulatedFrames,minimumUpdates:Math.ceil(emulatedFrames*55/59.7275),inputLatencyVideoFrames:inputLatency,longestRepeatedVideoFrames:longestRepeat,timing,before:before.player,after:after.player,profile:profiles()});
  const pixels=core.HEAPU8.slice(core._gba_framebuffer(),core._gba_framebuffer()+153600);for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
  fs.writeFileSync(path.join(output,name+'.png'),encodePngRgba({width:240,height:160,pixels}));
 }
 report.passed=report.windows.every(w=>w.updates>=w.minimumUpdates&&w.inputLatencyVideoFrames<=2);
 console.log(JSON.stringify(report,null,2));
 if(!process.argv.includes('--profile-only'))assert.ok(report.passed,'Racing must sustain at least 55 real gameplay updates/s and react within two video frames');
}catch(error){report.error=String(error);throw error;}
finally{if(videoFd!==null){fs.closeSync(videoFd);const result=spawnSync('/opt/homebrew/bin/ffmpeg',['-y','-loglevel','error','-f','rawvideo','-pixel_format','rgba','-video_size','240x160','-framerate','59.7275','-i',videoPath,'-vf','scale=720:480:flags=neighbor','-c:v','libx264','-pix_fmt','yuv420p','-crf','18',path.join(output,'cadence.mp4')],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);fs.unlinkSync(videoPath);}fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');if(snapshot)core._free(snapshot);core._gba_destroy();}
