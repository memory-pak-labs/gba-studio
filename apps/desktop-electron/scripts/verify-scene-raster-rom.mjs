import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import create from '../static/WebPlayer/player/mgba-core.mjs';
import {encodePngRgba} from './lib/png-icons.mjs';

const [packArg, outputArg] = process.argv.slice(2);
assert.ok(packArg && outputArg, 'usage: verify-scene-raster-rom.mjs ENGINE_PACK OUTPUT');
const pack=path.resolve(packArg), output=path.resolve(outputArg), python=process.env.PYTHON??'python3';
fs.mkdirSync(output,{recursive:true});
const engine=fileURLToPath(new URL('../../../packages/GBAStudioEngine/',import.meta.url));
const raster={ripple:{enabled:true,layer:'BG2',amplitude:8,wavelength:32,speed:4,top:80,bottom:160},gradient:{enabled:true,from:'#000000',to:'#ffffff',top:0,bottom:80}};
fs.writeFileSync(path.join(output,'video.json'),JSON.stringify({video:{display_mode:0,raster}}));
execFileSync(python,['-c',`import runpy,sys,json; a=runpy.run_path(sys.argv[1],run_name='qa_assetc'); print('#include "gbs/render.hpp"\\nconstexpr auto video = '+a['video_composition_literal'](json.load(open(sys.argv[2])),'qa')+';')`,path.join(pack,'tools/assetc'),path.join(output,'video.json')],{stdio:['ignore',fs.openSync(path.join(output,'video.hpp'),'w'),'pipe']});
execFileSync(python,[path.join(engine,'tests/host/tracker_stress_fixtures.py'),output,'--pitch-channels','16','--sample-length','128']);
execFileSync(python,['-c',`import pathlib,struct,sys; p=pathlib.Path(sys.argv[1]); b=bytearray(p.read_bytes()); rows=8; old=345+192*16*5; b=b[:345+rows*16*5]+b[old:]; struct.pack_into('<HH',b,341,rows,rows*16*5); p.write_bytes(b)`,path.join(output,'load-effects.xm')]);
fs.writeFileSync(path.join(output,'audio.json'),JSON.stringify({tracker:[{name:'song',xm:'load-effects.xm',loop:true,native_primary_volume:15}]}));
execFileSync(python,[path.join(pack,'tools/assetc'),path.join(output,'audio.json'),'--audio-json','-o',path.join(output,'song.hpp'),'--name','qa']);
const tiles=Array(32).fill(0).concat(Array.from({length:32},(_,i)=>i%4<2?17:34));
const map=Array.from({length:1024},(_,i)=>Math.floor(i/32)<10?0:1);
fs.writeFileSync(path.join(output,'main.cpp'),`#include "gbs/engine.hpp"
#include "gbs/audio.hpp"
#include "video.hpp"
#include "song.hpp"
static const uint8_t tiles[]={${tiles.join(',')}};
static const uint16_t map[]={${map.join(',')}};
static const uint16_t colors[]={0,gbs::rgb15(0,10,16),gbs::rgb15(2,20,24)};
extern "C" { volatile uint32_t raster_witness[4]={}; }
extern "C" int gbs_main(){
 gbs::init();gbs::hide_all_sprites();
 for(int layer=0;layer<4;++layer)gbs::set_bg_enabled(static_cast<gbs::BackgroundLayer>(layer),layer==2);
 gbs::set_bg_screen_base(gbs::BackgroundLayer::BG2,20);gbs::set_bg_character_base(gbs::BackgroundLayer::BG2,0);
 gbs::load_tiles(gbs::TileAsset{tiles,2,0,false});gbs::load_palette(gbs::PaletteAsset{colors,3,0},false);
 gbs::load_tilemap(gbs::BackgroundLayer::BG2,gbs::TileMapAsset{map,32,32});gbs::set_bg_scroll(gbs::BackgroundLayer::BG2,3,0);
 gbs::apply_video_composition(video);unsigned previous=0;
 for(;;){
  const unsigned keys=(~*reinterpret_cast<volatile uint16_t*>(0x04000130))&1023,pressed=keys&~previous;previous=keys;
  if(pressed&1)gbs::set_scene_raster_effects(gbs::SceneRasterEffects{},gbs::DisplayMode::Mode0Text);
  if(pressed&2)gbs::set_scene_raster_effects(video.raster,gbs::DisplayMode::Mode0Text);
  if(pressed&4)gbs::play_tracker_music(qa_song_asset);
  if(pressed&256)gbs::set_bg_scroll(gbs::BackgroundLayer::BG2,10,0);
  gbs::set_backdrop_color(0); // Regular scene redraws must not overwrite the gradient.
  ++raster_witness[0];const auto usage=gbs::audio_runtime_usage();raster_witness[1]=usage.active_voice_count;raster_witness[2]=usage.pcm_underrun_count;
  gbs::wait_vblank();
 }
}`);
fs.writeFileSync(path.join(output,'gbastudio_project.json'),JSON.stringify({schema:1,backend:'gbastudio_engine',kind:'topdown',entry:'main.cpp',build:{target:'raster',make_target:'all'},requires:{features:['render_runtime.scene_raster_effects']}}));
execFileSync(python,[path.join(pack,'tools/gbsbuild'),'--engine-pack',pack,'--project-dir',output],{stdio:'pipe'});
const symbols=execFileSync(path.join(process.env.DEVKITARM??'/opt/devkitpro/devkitARM','bin/arm-none-eabi-nm'),['-C',path.join(output,'build/raster.elf')],{encoding:'utf8'});
const at=name=>{const l=symbols.split('\n').find(l=>(l.endsWith(` ${name}`)||l.endsWith(`::${name}`)));assert.ok(l,name);return parseInt(l.split(' ')[0],16);};
const phaseAt=at('scene_raster_phase'),witness=at('raster_witness');
const wasm=new WebAssembly.Module(fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm',import.meta.url)));
const core=await create({print(){},printErr(){},instantiateWasm(imports,done){const instance=new WebAssembly.Instance(wasm,imports);done(instance);return instance.exports;}});
const report={passed:false,cases:[]};
const sine=[0,6,13,19,25,31,38,44,50,56,62,68,74,80,86,92,98,104,109,115,121,126,132,137,142,147,152,157,162,167,172,177,181,185,190,194,198,202,206,209,213,216,220,223,226,229,231,234,237,239,241,243,245,247,248,250,251,252,253,254,255,255,256,256,256];
try{
 assert.equal(core._gba_init(),1);const rom=fs.readFileSync(path.join(output,'build/raster.gba')),p=core._malloc(rom.length);core.HEAPU8.set(rom,p);assert.equal(core._gba_load_rom(p,rom.length),1);core._free(p);
 const read16=a=>core._gba_audio_register(a),read32=a=>(read16(a)|read16(a+2)<<16)>>>0;
 const audio=[];let recording=false;
 const run=n=>{for(let i=0;i<n;++i){core._gba_run_frame();if(recording&&audio.length<120){const count=core._gba_audio_sample_count(),pointer=core._gba_audio_samples();if(count)audio.push(Buffer.from(core.HEAPU8.slice(pointer,pointer+count*4)));}}};
 const press=key=>{core._gba_set_keys(key);run(4);core._gba_set_keys(0);run(4);};
 const rgb=color=>[0,5,10].map(shift=>{const c=(color>>shift)&31;return (c<<3)|(c>>2);});
 const check=(label,enabled,base=3,save=true)=>{
  const addr=core._gba_framebuffer(),pixels=core.HEAPU8.slice(addr,addr+240*160*4);
  const phase=(read16(phaseAt&~1)>>((phaseAt&1)*8))&255;
  const errorsFor=(phase,rows)=>{
   let errors=0;for(let y=0;y<160;++y){let offset=0;
    if(enabled&&y>=80){const a=(Math.floor((y-80)*256/32)+phase)&255,q=a>>6,i=a&63,v=sine[q&1?64-i:i]*(q>=2?-1:1)*8;offset=Math.trunc((v+(v>=0?128:-128))/256);}
    for(let x=0;x<240;++x){const level=Math.floor(31*Math.min(79,y)/79);const color=y<80?(enabled?(level|(level<<5)|(level<<10)):0):(((x+base+offset+256)%8)<4?gbsColor1:gbsColor2);const expected=rgb(color),i=(y*240+x)*4;
     if(expected.some((v,c)=>Math.abs(v-pixels[i+c])>1)){++errors;if(rows)rows[y]=(rows[y]??0)+1;}
    }
   }return errors;
  };
  const candidates=[phase,(phase-4)&255,(phase+4)&255],errors=candidates.map(p=>errorsFor(p)),minimum=Math.min(...errors);
  const rows={};errorsFor(candidates[errors.indexOf(minimum)],rows);const result={label,phase,errors,minimum,rows,frames:read32(witness),active:read16(at('scene_raster_active')&~1),display:read16(0x04000000),bg2:read16(0x0400000c),tile:read16(0x0600a280),palette:read16(0x05000002),voices:read32(witness+4),underruns:read32(witness+8)};report.cases.push(result);
  if(save||minimum){fs.writeFileSync(path.join(output,label+'.png'),encodePngRgba({width:240,height:160,pixels}));console.log(JSON.stringify(result));}
  assert.equal(minimum,0,`${label}: every pixel matches the exported effect parameters`);assert.equal(result.underruns,0);
 };
 const gbsColor1=(10<<5)|(16<<10),gbsColor2=2|(20<<5)|(24<<10);
 run(20);check('effects',true);press(256);check('camera',true,10);
 press(1);check('disabled',false,10);assert.equal(read16(0x04000200)&2,0,'raster releases only its HBlank reference');
 press(2);check('reenabled',true,10);press(4);run(300);const before=read32(witness);recording=true;run(600);recording=false;check('sixteen-voice-audio',true,10);assert.equal(read32(witness+4),16);report.audioFrames=read32(witness)-before;assert.ok(report.audioFrames>=295,'game loop remains responsive with sixteen PCM voices');
 const pcm=Buffer.concat(audio);let peak=0;for(let i=0;i<pcm.length;i+=2)peak=Math.max(peak,Math.abs(pcm.readInt16LE(i)));assert.ok(peak>100,'ROM emits audible PCM');report.audioPeak=peak;report.mixingRate=read32(at('pcm_mix_rate_hz'));assert.equal(report.mixingRate,31536);
 for(let i=0;i<60;++i){run(1);check('audio-frame-'+i,true,10,false);}
 const header=Buffer.alloc(44),rate=core._gba_audio_sample_rate();header.write('RIFF',0);header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);fs.writeFileSync(path.join(output,'sixteen-voice-audio.wav'),Buffer.concat([header,pcm]));
 press(1);check('audio-effects-disabled',false,10);press(2);run(30);check('audio-effects-reenabled',true,10);
 report.passed=true;
}finally{core._gba_destroy();fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(report,null,2));}
