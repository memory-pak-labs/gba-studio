// Exercises the complete mixed ROM using inputs only. ELF/RAM/OAM are read-only oracles.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {decodePngRgba,encodePngRgba} from './lib/png-icons.mjs';
import {decodeMGBAHardwareVideoState,nativeSinglePartSpriteObject} from './native-scene-framebuffer-contract.mjs';
const [romPath,exportDir,out]=process.argv.slice(2);
assert.ok(romPath&&exportDir&&out,'Usage: smoke-tempestade-approved.mjs ROM EXPORT_DIR OUTPUT');
fs.mkdirSync(out,{recursive:true});
const contract=JSON.parse(fs.readFileSync(path.join(exportDir,'export_project.json'))),c=contract.shmup_project;
const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const project=JSON.parse(fs.readFileSync(new URL('exemplo-gba.gba-project',root)));
const art=key=>decodePngRgba(fs.readFileSync(new URL('Assets/'+(key==='background'?'backgrounds/':key==='plane'||key==='flag'?'ui/':'sprites/')+'tempestade-approved-'+key+'.png',root)));
const images=Object.fromEntries(['background','player','drone-a','drone-b','boss','explosion','plane','flag','font'].map(k=>[k,art(k)]));
const rom=fs.readFileSync(romPath),wasm=new WebAssembly.Module(fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm',import.meta.url)));
const nm=spawnSync('/opt/devkitpro/devkitARM/bin/arm-none-eabi-nm',['-S','-C',romPath.replace(/\.gba$/,'.elf')],{encoding:'utf8'});assert.equal(nm.status,0);
const symbols=nm.stdout.split('\n').map(l=>{const x=l.match(/^([\da-f]+) ([\da-f]+) \w (.*)$/);return x?{address:parseInt(x[1],16),size:parseInt(x[2],16),name:x[3]}:null;}).filter(Boolean);
const native=symbols.find(s=>s.name.endsWith('::shmup_state')),animator=symbols.find(s=>s.name.endsWith('::player_animator')&&s.size===16);
assert.ok(native&&animator,'matching SHMUP ELF');
const clips=Object.fromEntries(symbols.filter(s=>s.name.startsWith('gbastudio_shmup_project::shmup_player_')&&s.name.endsWith('_animation')).map(s=>[s.address,s.name.split('shmup_player_')[1].replace(/_animation$/,'')]));
const m=await createMGBA({print:()=>{},printErr:()=>{},instantiateWasm(imports,done){const i=new WebAssembly.Instance(wasm,imports);done(i);return i.exports;}});
const r16=a=>m._gba_audio_register(a)>>>0,r32=a=>(r16(a)|(r16(a+2)<<16))>>>0,a=native.address;
const state=()=>({...readRuntimeTelemetry(m),flight:{x:r32(a),y:r32(a+4),wave:r32(a+8),tick:r16(a+12),score:r16(a+14),lives:r16(a+16)&255},animation:clips[r32(animator.address)],animationFrame:r16(animator.address+4)&255});
const report={ok:false,romSha256:createHash('sha256').update(rom).digest('hex'),states:[],inputs:[],directions:[],audio:{count:0,sum:0,peak:0},fidelity:[]};
let pcm=[];
function run(n,k=0){m._gba_set_keys(k);report.inputs.push({frames:n,keys:k});for(let f=0;f<n;f++){m._gba_run_frame();const count=m._gba_audio_sample_count(),p=m._gba_audio_samples();if(count){const samples=new Int16Array(m.HEAPU8.buffer,p,count*2);for(const s of samples){report.audio.sum+=(s/32768)**2;report.audio.peak=Math.max(report.audio.peak,Math.abs(s/32768));report.audio.count++;}if(pcm)pcm.push(Buffer.from(samples.buffer,samples.byteOffset,samples.byteLength));}}}
function boot(){m._gba_reset();for(let f=0;f<600&&readRuntimeTelemetry(m)?.runtimeKind!==4;f++)run(1);run(4);assert.equal(state().runtimeKind,4);}
function pixels(){const p=m._gba_framebuffer(),rgba=m.HEAPU8.slice(p,p+153600);for(let i=3;i<rgba.length;i+=4)rgba[i]=255;return rgba;}
const rgb=(p,i)=>(p[i]>>3)|((p[i+1]>>3)<<5)|((p[i+2]>>3)<<10);
function matchSprite(screen,source,object,frames){let best={mismatch:Infinity,frame:-1,count:0};for(const frame of frames){let mismatch=0,count=0;for(let y=0;y<object.height;y++)for(let x=0;x<object.width;x++){const at=(y*source.width+frame*object.width+x)*4,dx=object.x+x,dy=object.y+y;if(!source.pixels[at+3]||dx<0||dy<0||dx>=240||dy>=160)continue;count++;if(rgb(source.pixels,at)!==rgb(screen,(dy*240+dx)*4))mismatch++;}if(mismatch<best.mismatch)best={mismatch,frame,count};}return best;}
function capture(label,verify=true){const screen=pixels();fs.writeFileSync(path.join(out,label+'.png'),encodePngRgba({width:240,height:160,pixels:screen}));const n=m._gba_state_size(),p=m._malloc(n);m._gba_save_state(p,n);const video=decodeMGBAHardwareVideoState(m.HEAPU8.slice(p,p+n));m._free(p);const s=state();report.states.push({label,state:s,video});console.log(label,JSON.stringify({flight:s.flight,kind:s.runtimeKind,animation:s.animation,frame:s.animationFrame}));if(!verify||s.runtimeKind!==4)return s;
 const player=video.objects.find(o=>o.index===0&&o.width===64);if(player){const exploding=s.animation==='explosion',match=matchSprite(screen,exploding?images.explosion:images.player,player,Array.from({length:exploding?4:12},(_,i)=>i));assert.equal(match.mismatch,0,label+' player preserves approved RGB555');assert.ok(match.count>10);report.fidelity.push({label,consumer:s.animation==='explosion'?'explosion':'player',...match});}
 for(const [key,x]of [['plane',4],['flag',100]]){const object={x,y:3,width:16,height:16},match=matchSprite(screen,images[key],object,[0]);assert.equal(match.mismatch,0,label+' HUD '+key);report.fidelity.push({label,consumer:key,...match});}
 for(const key of ['drone-a','drone-b','boss']){const asset=contract.asset_pack.assets.find(a=>a.id==='tempestade_approved_'+key.replaceAll('-','_'));const object=nativeSinglePartSpriteObject(fs.readFileSync(path.join(exportDir,asset.header),'utf8'),asset.symbol,video);if(!object)continue;const match=matchSprite(screen,images[key],object,[0,1,2,3]);assert.equal(match.mismatch,0,label+' '+key+' approved pixels');report.fidelity.push({label,consumer:key,...match});}
 const texts=[['X'+String(s.flight.lives).padStart(2,'0'),24], [String(s.flight.wave+1).padStart(2,'0'),120],['P'+String(s.flight.score).padStart(6,'0'),180]];
 let glyphPixels=0;for(const [text,x]of texts)for(const [i,ch]of [...text].entries()){const n=ch.charCodeAt(0)-32;for(let y=0;y<8;y++)for(let xx=0;xx<8;xx++){const at=(((n>>4)*8+y)*128+(n%16)*8+xx)*4;if(images.font.pixels[at+3]){assert.equal(rgb(screen,((y+7)*240+x+i*8+xx)*4),rgb(images.font.pixels,at),label+' glyph '+ch);glyphPixels++;}}}
 const bg=images.background;let bgPixels=0,best=Infinity;
 for(const camera of [Math.min(Math.max(0,s.flight.tick-1),528),Math.min(s.flight.tick,528)]){
  let mismatch=0,count=0;
  for(let y=24;y<160;y++)for(let x=0;x<240;x++){if(video.objects.some(o=>x>=o.x&&x<o.x+o.width&&y>=o.y&&y<o.y+o.height))continue;if(rgb(screen,(y*240+x)*4)!==rgb(bg.pixels,(y*bg.width+camera+x)*4))mismatch++;count++;}
  if(mismatch<best){best=mismatch;bgPixels=count;}
 }
 assert.equal(best,0,label+' BG RGB555');
 report.fidelity.push({label,consumer:'BG and live text',bgPixels,glyphPixels,mismatch:0});return s;}
try{
 m._gba_init();const p=m._malloc(rom.length);m.HEAPU8.set(rom,p);assert.equal(m._gba_load_rom(p,rom.length),1);m._free(p);boot();capture('initial');
 for(const [name,key,axis,sign]of [['right',16,'x',1],['left',32,'x',-1],['up',64,'y',-1],['down',128,'y',1]]){const before=state();run(6,key);const after=capture(name);assert.equal(after.flight[axis]-before.flight[axis],sign*12);report.directions.push(name);}
 const before=state();run(10,16|2);assert.equal(state().flight.x-before.flight.x,10,'B halves speed');capture('brake');
 run(4,1);assert.equal(state().animation,'shoot');capture('shoot');
 boot();pcm=[];run(50);const without=Buffer.concat(pcm);boot();pcm=[];run(50,1);const withShot=Buffer.concat(pcm);assert.equal(withShot.equals(without),false,'shot changes audible mixed PCM');report.audio.shotChangesMixedPcm=true;pcm=null;
 boot();run(80);capture('rotor-0');run(8);capture('rotor-1');const rotors=report.fidelity.filter(x=>x.consumer==='drone-a'&&x.label.startsWith('rotor-'));assert.equal(new Set(rotors.map(x=>x.frame)).size,2,'enemy rotor changes frame');
 boot();run(14,64);run(90,1);const first=capture('patrol-destroyed');assert.ok(first.flight.score>=100,'first drone destroyed by shots');
 run(32,128);run(90,1);capture('cargo-destroyed');assert.ok(state().flight.score>=200,'second drone destroyed by shots');
 for(let f=0;f<200&&state().flight.wave===0;f++)run(1,1);assert.equal(state().flight.wave,1,'boss wave');run(18,64);capture('boss-arrival');run(50,1);capture('boss');
 for(let f=0;f<450&&state().runtimeKind!==11;f++)run(1,1);
 const reward=c.waves[1].on_clear.find(s=>s.op==='set_variable');const final=state();assert.equal(final.runtimeKind,11,'campaign advances to Guardian');if(reward)assert.equal(final.variables[reward.variable],reward.value,'shield reward');capture('campaign-next-scene',false);report.campaignCompleted=true;
 // Fresh replay intentionally takes enemy fire; no writes to gameplay RAM.
 boot();run(14,64);let damaged=false;for(let f=0;f<400&&state().runtimeKind===4;f++){run(1);if(state().flight.lives<3){damaged=true;capture('damage',false);break;}}assert.ok(damaged,'enemy fire/contact removes a life');report.damage=true;
 assert.equal(state().animation,'hurt');run(4);capture('hurt-visible');run(32,128);
 for(let f=0;f<150&&state().flight.lives===2;f++)run(1);
 assert.equal(state().flight.lives,1,'second drone damages player');run(18,64);
 for(let f=0;f<250&&state().flight.lives>0;f++)run(1);
 assert.equal(state().flight.lives,0,'last life lost');assert.equal(state().animation,'explosion');run(2);capture('explosion');for(let f=1;f<4;f++){run(6);capture('explosion-'+f);}
 for(let f=0;f<160&&state().flight.lives===0;f++)run(1);
 for(let f=0;f<120&&state().runtimeKind!==4;f++)run(1);
 assert.equal(state().flight.lives,3,'defeat restarts Tempestade');assert.equal(state().runtimeKind,4);run(4);capture('defeat-restarted');report.defeatRestart=true;

 report.audio.rms=Math.sqrt(report.audio.sum/report.audio.count);assert.ok(report.audio.rms>0.001&&report.audio.peak<1,'mixed gameplay audio is present and not clipped');report.ok=true;
} finally {fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));m._gba_destroy();}
console.log('Tempestade native smoke PASS');
