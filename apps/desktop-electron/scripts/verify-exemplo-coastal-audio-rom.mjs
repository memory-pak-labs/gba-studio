import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createNativeAudioRecorder } from './lib/native-audio-recorder.mjs';

// Run from apps/desktop-electron; artifacts stay outside source control.
const app=process.cwd();
const output=path.resolve(process.argv[2] ?? (()=>{throw new Error('Informe a pasta de evidências.');})());
const pack=path.resolve(process.argv[3] ?? '../../packages/GBAStudioEngine/dist/GBAStudioEnginePack');
const bank=path.join(app,'default-assets/templates/exemplo-gba/Assets/audio/coastal-v1');
const manifest=JSON.parse(fs.readFileSync(path.join(bank,'manifest.json')));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const dir=path.join(output,'bank-rom');fs.mkdirSync(dir,{recursive:true});
const previews=path.join(output,'recordings');fs.mkdirSync(previews,{recursive:true});
const document={tracker:manifest.music.map(item=>({name:item.exportID,mod:path.basename(item.source),loop:item.loop,native_primary_volume:12})),pcm:manifest.sfx.map(item=>({name:item.exportID,wav:path.basename(item.source),loop:false})),sfx:manifest.sfx.map(item=>({name:item.exportID,pcm:item.exportID,pcm_volume:13}))};
for(const item of [...manifest.music,...manifest.sfx]){
  const bytes=fs.readFileSync(path.join(bank,item.source));assert.equal(hash(bytes),manifest.files[item.source]);
  fs.writeFileSync(path.join(dir,path.basename(item.source)),bytes);
}
fs.writeFileSync(path.join(dir,'audio.json'),JSON.stringify(document));
execFileSync('python3',[path.join(pack,'tools/assetc'),path.join(dir,'audio.json'),'--audio-json','-o',path.join(dir,'bank.hpp'),'--name','coastal'],{stdio:'pipe',maxBuffer:16*1024*1024});
const segments=[...manifest.music.map((item,index)=>({id:item.exportID,kind:'music',index,frames:item.rows*item.row_frames+65,loop:item.loop})),...manifest.sfx.map((item,index)=>({id:item.exportID,kind:'sfx',index,frames:Math.ceil(item.duration*59.7275)+18})),{id:'music-and-all-effects',kind:'mixed',index:0,frames:90*manifest.sfx.length}];
fs.writeFileSync(path.join(dir,'main.cpp'),`#include "gbs/engine.hpp"
#include "bank.hpp"
extern "C" { volatile unsigned witness[7] = {}; }
struct Segment { unsigned kind,index,frames; };
constexpr Segment segments[] = { ${segments.map(x=>`{${{music:0,sfx:1,mixed:2}[x.kind]},${x.index},${x.frames}}`).join(',')} };
extern "C" int gbs_main() {
 gbs::init(); gbs::set_audio_channel_volume(gbs::AudioChannel::Music,12); witness[5]=1;
 for(unsigned segment=0;segment<${segments.length};++segment){
  gbs::stop_tracker_music();gbs::stop_sfx();gbs::stop_all_pcm_sfx();
  const auto entry=segments[segment];witness[4]=0;
  bool accepted=entry.kind==0 ? gbs::play_tracker_music(coastal_tracker_assets[entry.index]) : entry.kind==1 ? gbs::play_sfx(coastal_sfx_assets[entry.index]) : gbs::play_tracker_music(coastal_tracker_assets[5]);
  if(!accepted)witness[5]=0;
  for(unsigned frame=0;frame<entry.frames;++frame){
   if(entry.kind==2 && frame%90==0 && !gbs::play_sfx(coastal_sfx_assets[frame/90]))witness[5]=0;
   gbs::wait_vblank();auto usage=gbs::audio_runtime_usage();
   witness[0]++;witness[1]=segment;witness[2]=frame+1;witness[3]=usage.pcm_underrun_count;
   if(usage.active_voice_count>witness[4])witness[4]=usage.active_voice_count;
  }
 }
 witness[6]=1;for(;;)gbs::wait_vblank();
}
`);
fs.writeFileSync(path.join(dir,'gbastudio_project.json'),JSON.stringify({schema:1,backend:'gbastudio_engine',kind:'topdown',entry:'main.cpp',build:{target:'coastal',make_target:'all'},requires:{engine_pack:'>=2.27.0',features:['audio.tracker_pcm_16_channels','audio.tracker_sample_sustain','audio.pcm_sfx_aliases']}}));
execFileSync('python3',[path.join(pack,'tools/gbsbuild'),'--engine-pack',pack,'--project-dir',dir],{stdio:'pipe',maxBuffer:16*1024*1024});
const rom=fs.readFileSync(path.join(dir,'build/coastal.gba'));
assert.ok(rom.length<=32*1024*1024,'GBA ROM cap');
const nm=execFileSync('/opt/devkitpro/devkitARM/bin/arm-none-eabi-nm',[path.join(dir,'build/coastal.elf')],{encoding:'utf8',maxBuffer:16*1024*1024});
const address=parseInt(nm.match(/^([0-9a-f]+) [BbDd] witness$/m)?.[1],16);assert.ok(address);
const {default:create}=await import(pathToFileURL(path.join(app,'static/WebPlayer/player/mgba-core.mjs')));
const wasmBytes=fs.readFileSync(path.join(app,'static/WebPlayer/player/mgba-core.wasm'));
const module=new WebAssembly.Module(wasmBytes);
const core=await create({print(){},printErr(){},instantiateWasm(imports,done){const instance=new WebAssembly.Instance(module,imports);done(instance);return instance.exports;}});
const evidence={passed:false,romBytes:rom.length,romSha256:hash(rom),engineLibrarySha256:hash(fs.readFileSync(path.join(pack,'lib/libgbastudio_engine.a'))),wasmSha256:hash(wasmBytes),cases:[]};
let current=-1,peakVoices=0,peak=0,squares=0,samples=0,clipped=0,frames=0,previousGame=0,stalled=0;
const recorder=createNativeAudioRecorder(core,previews);
function finish(){
 if(current<0)return;
 const wav=recorder.stop(),entry=segments[current];
 const result={...entry,wav,wavSha256:hash(fs.readFileSync(wav)),peakVoices,peakDbfs:20*Math.log10(Math.max(1,peak)/32768),rmsDbfs:10*Math.log10(Math.max(1,squares/Math.max(1,samples))/(32768**2)),clippedSamples:clipped,recordedFrames:frames};
 assert.ok(peak>100,`${entry.id} is audible`);assert.equal(clipped,0,`${entry.id} has no saturated output`);
 if(entry.kind==='music')assert.ok(peakVoices>4,`${entry.id} uses sampled multichannel arrangement`);
 evidence.cases.push(result);fs.writeFileSync(path.join(output,'bank-rom-evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({id:entry.id,voices:peakVoices,peak:result.peakDbfs,frames}));
}
try{
 assert.equal(core._gba_init(),1);const pointer=core._malloc(rom.length);core.HEAPU8.set(rom,pointer);assert.equal(core._gba_load_rom(pointer,rom.length),1);core._free(pointer);
 const read=i=>(core._gba_audio_register(address+i*4)|(core._gba_audio_register(address+i*4+2)<<16))>>>0;
 const maximum=segments.reduce((sum,x)=>sum+x.frames,0)+600;
 for(let frame=0;frame<maximum;frame++){
  core._gba_run_frame();if(!read(0))continue;
  const game=read(0);stalled=game===previousGame?stalled+1:0;previousGame=game;
  assert.ok(stalled<5,'audio processing keeps up with VBlank');assert.equal(read(3),0,'no FIFO underruns');assert.equal(read(5),1,'all native playback requests accepted');
  if(read(1)!==current){finish();current=read(1);peakVoices=peak=squares=samples=clipped=frames=0;recorder.select(segments[current].id);}
  recorder.frame();frames++;peakVoices=Math.max(peakVoices,read(4));
  const count=core._gba_audio_sample_count()*2;const data=core._gba_audio_samples();
  const rendered=new Int16Array(core.HEAPU8.buffer,data,count);
  for(let i=0;i<count;i++){const value=rendered[i];peak=Math.max(peak,Math.abs(value));squares+=value*value;samples++;if(value===32767||value===-32768)clipped++;}
  if(read(6)){finish();break;}
  if(frame%240===0)await new Promise(resolve=>setImmediate(resolve));
 }
 assert.equal(read(6),1,'bank suite completes');assert.equal(evidence.cases.length,75);evidence.passed=true;
}finally{core._gba_destroy();fs.writeFileSync(path.join(output,'bank-rom-evidence.json'),JSON.stringify(evidence,null,2));}
