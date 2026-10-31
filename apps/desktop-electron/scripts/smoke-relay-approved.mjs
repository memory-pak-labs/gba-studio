// Drives the mixed production ROM with buttons; ELF/RAM/OAM are read-only oracles.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {decodePngRgba,encodePngRgba} from './lib/png-icons.mjs';
import {decodeMGBAHardwareVideoState} from './native-scene-framebuffer-contract.mjs';
const [romPath,exportDir,out]=process.argv.slice(2);
assert.ok(romPath&&exportDir&&out,'Usage: smoke-relay-approved.mjs ROM EXPORT_DIR OUTPUT');
fs.mkdirSync(out,{recursive:true});
const rom=fs.readFileSync(romPath),wasm=new WebAssembly.Module(fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm',import.meta.url)));
const contract=JSON.parse(fs.readFileSync(path.join(exportDir,'export_project.json'))),battle=contract.battle_rpg_project.encounters.find(e=>e.name==='guardiao_rele');
const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const image=(folder,key)=>decodePngRgba(fs.readFileSync(new URL('Assets/'+folder+'/relay-approved-'+key+'.png',root)));
const images={bg:image('backgrounds','background'),hud:image('backgrounds','hud-frames'),nara:image('sprites','nara'),guardian:image('sprites','guardian'),effects:image('sprites','effects'),disabled:image('ui','disabled-escape'),cursor:image('ui','cursor'),font:decodePngRgba(fs.readFileSync(new URL('Assets/fonts/porto-hud-b-font.png',root)))};
const nm=spawnSync('/opt/devkitpro/devkitARM/bin/arm-none-eabi-nm',['-S','-C',romPath.replace(/\.gba$/,'.elf')],{encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(nm.status,0);
const symbols=nm.stdout.split('\n').map(l=>{const x=l.match(/^([\da-f]+) ([\da-f]+) \w (.*)$/);return x?{address:parseInt(x[1],16),size:parseInt(x[2],16),name:x[3]}:null;}).filter(Boolean);
const symbol=name=>{const s=symbols.find(s=>s.name.endsWith('::'+name));assert.ok(s,'ELF symbol '+name);return s.address;};
const a=symbols.find(s=>s.name.endsWith('::state')&&s.size===112)?.address;assert.ok(a,'BattleRpgRuntimeState unchanged checkpoint size');
const party=symbol('party_visuals'),enemy=symbol('enemy_visuals'),menu=symbol('battle_menu_page'),outcomeFrames=symbol('outcome_visual_frames');
const clips=Object.fromEntries(symbols.filter(s=>s.name.startsWith('gbastudio_battle_rpg_project::encounter_')&&s.name.endsWith('_animation')).map(s=>[s.address,s.name.split('::')[1]]));
const m=await createMGBA({print:()=>{},printErr:()=>{},instantiateWasm(imports,done){const i=new WebAssembly.Instance(wasm,imports);done(i);return i.exports;}});
const r16=a=>m._gba_audio_register(a)>>>0,r32=a=>(r16(a)|(r16(a+2)<<16))>>>0;
const state=()=>({...readRuntimeTelemetry(m),partyHp:r32(a),enemyHp:r32(a+16),pending:(r16(a+88)&255)!==0,outcome:r16(a+108)&255,page:r16(menu)&255,partyClip:clips[r32(party)],partyFrame:r16(party+4)&255,enemyClip:clips[r32(enemy)],enemyFrame:r16(enemy+4)&255,outcomeFrames:r32(outcomeFrames)});
const report={ok:false,romSha256:createHash('sha256').update(rom).digest('hex'),states:[],inputs:[],fidelity:[],observedClips:[],audio:{count:0,sum:0,peak:0}};const observed=new Set();
function run(n,k=0){m._gba_set_keys(k);const last=report.inputs.at(-1);if(last?.keys===k)last.frames+=n;else report.inputs.push({frames:n,keys:k});for(let f=0;f<n;f++){m._gba_run_frame();if(readRuntimeTelemetry(m)?.runtimeKind===11){observed.add(clips[r32(party)]);observed.add(clips[r32(enemy)]);}const count=m._gba_audio_sample_count(),p=m._gba_audio_samples();if(count)for(const s of new Int16Array(m.HEAPU8.buffer,p,count*2)){report.audio.sum+=(s/32768)**2;report.audio.peak=Math.max(report.audio.peak,Math.abs(s/32768));report.audio.count++;}}}
function tap(k){run(2,k);run(2);}
function boot(){m._gba_reset();for(let f=0;f<600&&readRuntimeTelemetry(m)?.runtimeKind!==11;f++)run(1);run(12);assert.equal(state().runtimeKind,11);assert.equal(state().partyHp,96);assert.equal(state().enemyHp,112);}
function pixels(){const p=m._gba_framebuffer(),rgba=m.HEAPU8.slice(p,p+153600);for(let i=3;i<rgba.length;i+=4)rgba[i]=255;return rgba;}
const rgb=(p,i)=>(p[i]>>3)|((p[i+1]>>3)<<5)|((p[i+2]>>3)<<10);
function capture(label,verify=true){const screen=pixels(),s=state();fs.writeFileSync(path.join(out,label+'.png'),encodePngRgba({width:240,height:160,pixels:screen}));const n=m._gba_state_size(),p=m._malloc(n);m._gba_save_state(p,n);const video=decodeMGBAHardwareVideoState(m.HEAPU8.slice(p,p+n));m._free(p);report.states.push({label,state:s,video});console.log(label,JSON.stringify(s));if(!verify||s.runtimeKind!==11)return s;
 for(const [key,x,objectIndex]of [['nara',24,0],['guardian',152,1]]){let best={mismatch:Infinity};for(let frame=0;frame<8;frame++){let count=0,mismatch=0;const source=images[key];for(let y=0;y<64;y++)for(let xx=0;xx<64;xx++){const at=(y*source.width+frame*64+xx)*4;if(!source.pixels[at+3])continue;const dx=x+xx,dy=52+y;if(video.objects.some(o=>o.index<84&&o.width===32&&o.height===32&&dx>=o.x&&dx<o.x+o.width&&dy>=o.y&&dy<o.y+o.height))continue;count++;if(rgb(source.pixels,at)!==rgb(screen,(dy*240+dx)*4))mismatch++;}if(mismatch<best.mismatch)best={mismatch,count,frame};}report.fidelity.push({label,consumer:key,...best});assert.equal(best.mismatch,0,label+' '+key+' approved pixels');assert.ok(best.count>200);}
 const fx=video.objects.find(o=>o.index<84&&o.width===32&&o.height===32);
 if(fx){let best={mismatch:Infinity};for(let frame=0;frame<8;frame++){let mismatch=0,count=0;for(let y=0;y<32;y++)for(let x=0;x<32;x++){const at=(y*images.effects.width+frame*32+x)*4;if(!images.effects.pixels[at+3])continue;count++;if(rgb(images.effects.pixels,at)!==rgb(screen,((fx.y+y)*240+fx.x+x)*4))mismatch++;}if(mismatch<best.mismatch)best={mismatch,count,frame};}report.fidelity.push({label,consumer:'effect',...best});assert.equal(best.mismatch,0,label+' effect overlays actors');}
 const cue=video.objects.find(o=>o.index===86);assert.ok(cue,label+' approved cursor exists');assert.equal(cue.x,160);
 let cursorPixels=0;for(let y=0;y<8;y++)for(let x=0;x<8;x++){const at=(y*8+x)*4;assert.equal(rgb(screen,((cue.y+y)*240+cue.x+x)*4),rgb(images.cursor.pixels,at),label+' arrow glyph rather than unsupported-character fallback');cursorPixels++;}
 report.fidelity.push({label,consumer:'cursor',count:cursorPixels,mismatch:0});
 const glyphs=[['NARA',12,4],['GUARDIAO',132,4],[String(s.partyHp),80,14],[String(s.enemyHp),200,14]];
 let glyphPixels=0;for(const [text,x,y]of glyphs)for(const [i,ch]of [...text].entries()){const n=ch.charCodeAt(0)-32;for(let yy=0;yy<8;yy++)for(let xx=0;xx<8;xx++){const at=(((n>>4)*8+yy)*128+(n%16)*8+xx)*4;assert.equal(rgb(screen,((y+yy)*240+x+i*8+xx)*4),rgb(images.font.pixels,at),label+' live glyph '+ch);glyphPixels++;}}
 for(const [x,value,max]of [[12,s.partyHp,96],[132,s.enemyHp,112]]){const fill=Math.floor(54*value/max);for(let y=0;y<4;y++)for(let xx=0;xx<56;xx++){const want=y>=1&&y<3&&xx>=1&&xx<=fill?(5|(24<<5)|(21<<10)):(1|(4<<5)|(6<<10));assert.equal(rgb(screen,((18+y)*240+x+xx)*4),want,label+' live HP gauge');}}
 report.fidelity.push({label,consumer:'live HP and font',glyphPixels,mismatch:0});
 if(s.page===0||s.page===5){let count=0;const colors=new Set();for(let y=0;y<8;y++)for(let x=0;x<64;x++){const at=(y*64+x)*4;if(!images.disabled.pixels[at+3])continue;const want=rgb(images.disabled.pixels,at);colors.add(want);assert.equal(rgb(screen,((148+y)*240+172+x)*4),want,label+' disabled FUGIR glyphs');count++;}assert.ok(colors.size>1,'disabled command remains legible');report.fidelity.push({label,consumer:'disabled escape',count,mismatch:0});}

 let count=0,mismatch=0;for(let y=24;y<120;y++)for(let x=0;x<240;x++){if(video.objects.some(o=>x>=o.x&&x<o.x+o.width&&y>=o.y&&y<o.y+o.height))continue;count++;if(rgb(images.bg.pixels,(y*240+x)*4)!==rgb(screen,(y*240+x)*4))mismatch++;}report.fidelity.push({label,consumer:'background',count,mismatch});assert.equal(mismatch,0,label+' background pixels');assert.ok(count>10000);
 let hudCount=0,hudMismatch=0;for(let y=0;y<160;y++)for(let x=0;x<240;x++){const at=(y*240+x)*4;if(!images.hud.pixels[at+3]||video.objects.some(o=>x>=o.x&&x<o.x+o.width&&y>=o.y&&y<o.y+o.height))continue;hudCount++;if(rgb(images.hud.pixels,at)!==rgb(screen,at))hudMismatch++;}report.fidelity.push({label,consumer:'hud-frames',count:hudCount,mismatch:hudMismatch});assert.equal(hudMismatch,0,label+' HUD frames');return s;
}
function ready(){for(let f=0;f<240&&state().runtimeKind===11&&(state().page!==0||state().pending);f++){if(state().page===5&&!state().pending)tap(1);else run(1);}assert.equal(state().page,0);}
function action(magic){ready();tap(1);assert.equal(state().page,1);if(magic)tap(128);tap(1);}
try{
 m._gba_init();const p=m._malloc(rom.length);m.HEAPU8.set(rom,p);assert.equal(m._gba_load_rom(p,rom.length),1);m._free(p);boot();capture('initial');run(12);capture('idle-breath');
 tap(128);tap(128);tap(1);capture('items');tap(1);tap(1);ready();tap(128);tap(1);capture('escape-blocked');assert.equal(state().outcome,0);tap(1);ready();
 boot();tap(128);tap(1);capture('party-menu');tap(2);boot();
 action(false);capture('wrench-start');run(6);capture('wrench-strike');run(12);capture('wrench-end');run(20);capture('guardian-strike');run(30);ready();assert.ok(state().partyHp<96);assert.equal(state().enemyHp,111);
 for(let turn=0;turn<15&&state().runtimeKind===11&&state().outcome===0;turn++){action(true);if(turn===0){run(9);capture('energy');}for(let i=0;i<85&&state().outcome===0;i++)run(1);if(state().outcome===0){ready();if(turn===3)capture('guardian-defense');}}
 assert.equal(state().outcome,1,'victory through real abilities');run(36);capture('victory');run(60);capture('reactivation');for(let f=0;f<400&&state().runtimeKind!==12;f++)run(1);assert.equal(state().runtimeKind,12,'campaign advances to fighting arena');const reward=battle.on_victory.find(s=>s.op==='set_variable');if(reward)assert.equal(state().variables[reward.variable],reward.value);report.victory=true;
 boot();for(let turn=0;turn<40&&state().outcome===0;turn++){action(false);for(let f=0;f<100&&state().outcome===0;f++)run(1);}assert.equal(state().outcome,2,'defeat by enemy turns');run(8);capture('defeat');for(let f=0;f<400&&(state().runtimeKind!==11||state().partyHp!==96);f++)run(1);assert.equal(state().runtimeKind,11);assert.equal(state().partyHp,96,'defeat retry restores HP');run(12);capture('retry');report.defeatRestart=true;
 report.observedClips=[...observed].filter(Boolean);for(const key of ['party_0_attack','party_0_magic','party_0_hurt','party_0_victory','enemies_0_attack','enemies_0_defend','enemies_0_defeat','enemies_0_reactivate'])assert.ok(report.observedClips.some(s=>s.includes(key)),'action observed '+key);
 report.audio.rms=Math.sqrt(report.audio.sum/report.audio.count);assert.ok(report.audio.rms>.001&&report.audio.peak<1);report.ok=true;
}finally{fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));m._gba_destroy();}
console.log('Relay approved native combat PASS');
