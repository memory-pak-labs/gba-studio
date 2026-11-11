import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import create from '../static/WebPlayer/player/mgba-core.mjs';

// No cable is connected to this single mGBA instance. This proves that a lost
// link keeps the ROM running, retains pending data and releases SIO on close.
// It does not prove physical cable delivery or multiplayer emulator lockstep.
const [packArg, outputArg] = process.argv.slice(2);
assert.ok(packArg && outputArg, 'usage: verify-multiplayer-queue-rom.mjs ENGINE_PACK EVIDENCE');
const pack=path.resolve(packArg), output=path.resolve(outputArg);
fs.mkdirSync(output,{recursive:true});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gba-multiplayer-rom-'));
const report={passed:false,scope:'single ROM without cable; rumble driver selection/timing in emulation, not physical motor; queued delivery verified separately in host protocol tests'};
let core;
try {
  fs.writeFileSync(path.join(temporary,'main.cpp'),`#include "gbs/engine.hpp"
extern "C" { volatile uint32_t queue_witness[13]={}; }
static gbs::MultiplayerQueue connection;
extern "C" int gbs_main() {
 gbs::init();
 const auto ie=*reinterpret_cast<volatile uint16_t*>(0x04000200);
 const auto ime=*reinterpret_cast<volatile uint16_t*>(0x04000208);
 gbs::MultiplayerConfig config;config.timeout_frames=4;config.retry_frames=2;
 queue_witness[8]=gbs::multiplayer_queue_open(connection,config);
 gbs::multiplayer_queue_send(connection,0xFFFF);
 for(unsigned frame=0;;++frame) {
  if(frame<120) {
   gbs::multiplayer_queue_update(connection);
   queue_witness[1]=static_cast<unsigned>(connection.state);
   queue_witness[2]=gbs::multiplayer_queue_pending_send(connection);
   queue_witness[3]=connection.recoveries;
   queue_witness[4]=*reinterpret_cast<volatile uint16_t*>(0x04000200)&128;
  } else if(frame==120) {
   gbs::multiplayer_queue_close(connection);
   queue_witness[5]=(*reinterpret_cast<volatile uint16_t*>(0x04000200)==ie && *reinterpret_cast<volatile uint16_t*>(0x04000208)==ime);
   queue_witness[6]=static_cast<unsigned>(connection.state);
   queue_witness[7]=sizeof(connection);
  }
  if(frame==121) {
   queue_witness[9]=gbs::rumble_configure_cartridge(gbs::RumbleCartridge::ChisFlashV12);
   gbs::rumble_on_for(3);queue_witness[10]=gbs::rumble_active();
  }
  if(frame==125) {
   queue_witness[11]=!gbs::rumble_active() && gbs::rumble_available();
   gbs::rumble_configure_cartridge(gbs::RumbleCartridge::None);
   queue_witness[12]=!gbs::rumble_available();
  }
  queue_witness[0]=frame;gbs::wait_vblank();
 }
}`);
  fs.writeFileSync(path.join(temporary,'gbastudio_project.json'),JSON.stringify({schema:1,backend:'gbastudio_engine',kind:'topdown',entry:'main.cpp',build:{target:'queued_link',make_target:'all'},requires:{features:['link.link_queued_messages','link.link_nonblocking_irq','link.link_automatic_recovery']}}));
  const build=execFileSync(process.env.PYTHON??'python3',[path.join(pack,'tools/gbsbuild'),'--engine-pack',pack,'--project-dir',temporary],{encoding:'utf8',maxBuffer:4*1024*1024});
  fs.writeFileSync(path.join(output,'rom-build.log'),build);
  const symbols=execFileSync(path.join(process.env.DEVKITARM??'/opt/devkitpro/devkitARM','bin/arm-none-eabi-nm'),[path.join(temporary,'build/queued_link.elf')],{encoding:'utf8'});
  const symbol=symbols.split('\n').find(line=>line.endsWith(' queue_witness'));
  assert.ok(symbol);
  const at=parseInt(symbol,16);
  for(const name of ['gbs_hw_chisflash_rumble_prepare','gbs_hw_chisflash_rumble_set']) {
    const line=symbols.split('\n').find(line=>line.endsWith(' '+name));
    assert.ok(line);const address=parseInt(line,16);
    assert.ok(address>=0x03000000 && address<0x03008000,'cartridge writes execute from IWRAM');
  }
  const wasm=new WebAssembly.Module(fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm',import.meta.url)));
  core=await create({print(){},printErr(){},instantiateWasm(imports,done){const instance=new WebAssembly.Instance(wasm,imports);done(instance);return instance.exports;}});
  assert.equal(core._gba_init(),1);
  const rom=fs.readFileSync(path.join(temporary,'build/queued_link.gba')),pointer=core._malloc(rom.length);
  core.HEAPU8.set(rom,pointer);assert.equal(core._gba_load_rom(pointer,rom.length),1);core._free(pointer);
  for(let frame=0;frame<260;++frame)core._gba_run_frame();
  const read=a=>(core._gba_audio_register(a)|(core._gba_audio_register(a+2)<<16))>>>0;
  report.witness=Array.from({length:13},(_,i)=>read(at+i*4));
  const [frames,state,pending,recoveries,serialEnabled,released,closed,bytes,opened]=report.witness;
  assert.ok(frames>=250,'no blocking waits during a missing connection');
  assert.equal(opened,1);assert.equal(state,3);assert.equal(pending,1);
  assert.ok(recoveries>1);assert.equal(serialEnabled,128);
  assert.equal(released,1);assert.equal(closed,0);assert.ok(bytes<=384);
  assert.deepEqual(report.witness.slice(9),[1,1,1,1]);
  report.passed=true;
  console.log(JSON.stringify(report));
} finally {
  core?._gba_destroy();
  report.temporaryBytes=fs.readdirSync(temporary,{recursive:true}).reduce((total,entry)=>{const file=path.join(temporary,entry);return total+(fs.statSync(file).isFile()?fs.statSync(file).size:0);},0);
  fs.rmSync(temporary,{recursive:true,force:true});
  report.temporaryRemoved=!fs.existsSync(temporary);
  fs.writeFileSync(path.join(output,'rom-evidence.json'),JSON.stringify(report,null,2)+'\n');
}
