import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {encodePngRgba} from './lib/png-icons.mjs';
const [romPath, output] = process.argv.slice(2);
assert.ok(romPath && output, 'usage: node scripts/playtest-hud-behavior-rom.mjs ROM OUTPUT');
mkdirSync(output,{recursive:true});
const rom=readFileSync(romPath);const wasm=readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm', import.meta.url));
const symbols=execFileSync('/opt/devkitpro/devkitARM/bin/arm-none-eabi-nm',['-C',romPath.replace(/\.gba$/,'.elf')],{encoding:'utf8'});
const addresses=[...symbols.matchAll(/^([0-9a-f]+) [bd] \(anonymous namespace\)::event_state$/gm)].map(m=>parseInt(m[1],16));assert.ok(addresses.length);
const core=await createMGBA({print:()=>{},printErr:()=>{},instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(new WebAssembly.Module(wasm),imports);receive(instance);return instance.exports;}});
const evidence=[];const frameHashes={};let passed=false;
function run(keys,n){core._gba_set_keys(keys);for(let i=0;i<n;i++)core._gba_run_frame();}
function vars(){return addresses.map(a=>Array.from({length:5},(_,i)=>core._gba_audio_register(a+28+i*4)));}
function capture(label){const pixels=core.HEAPU8.slice(core._gba_framebuffer(),core._gba_framebuffer()+240*160*4);for(let i=3;i<pixels.length;i+=4)pixels[i]=255;frameHashes[label]=createHash('sha256').update(pixels).digest('hex');writeFileSync(output+'/'+label+'.png',encodePngRgba({width:240,height:160,pixels}));const v=vars();evidence.push({label,variables:v});return v.find(v=>v[1]>0);}
try {
 assert.equal(core._gba_init(),1);const p=core._malloc(rom.length);core.HEAPU8.set(rom,p);assert.equal(core._gba_load_rom(p,rom.length),1);core._free(p);
 for(let i=0;i<300 && !vars().some(v=>v[1]>0);i++)run(0,1);run(0,20);const initial=capture('selected');assert.ok(initial,'HUD appear action fired');assert.equal(initial[1],1);assert.equal(initial[2],1);
 run(1,4);run(0,4);const confirmed=capture('confirmed');assert.equal(confirmed[4],1,'A confirms selected once');
 for(let i=0;i<300 && !vars().some(v=>v[0]===1);i++)run(0,1);run(0,3);const disabled=capture('disabled');assert.equal(disabled[0],1);assert.equal(disabled[3],1,'valueChanged fired');
 run(1,4);run(0,4);assert.equal(capture('disabled-confirm')[4],1,'disabled ignores A');
 for(let i=0;i<300 && !vars().some(v=>v[0]===2);i++)run(0,1);run(0,3);const hidden=capture('hidden');assert.equal(hidden[0],2);assert.equal(hidden[4],1);
 for(let i=0;i<300 && !vars().some(v=>v[1]===2);i++)run(0,1);run(0,3);const restored=capture('restored');assert.equal(restored[0],0);assert.equal(restored[1],2,'appear re-enters once');assert.equal(restored[2],2,'focus re-enters once');assert.equal(restored[3],2,'hidden did not fire valueChanged');assert.notEqual(frameHashes.confirmed,frameHashes.disabled,'state text changes the framebuffer');assert.notEqual(frameHashes.disabled,frameHashes.hidden,'hidden removes the element');assert.equal(frameHashes.confirmed,frameHashes.restored,'restored selected appearance matches');passed=true;
 console.log('PASS: ROM states, appear, focus, valueChanged, A confirmation and disabled/hidden guards');
} finally {writeFileSync(output+'/evidence.json',JSON.stringify({passed,addresses,frameHashes,evidence},null,2));core._gba_destroy();}
