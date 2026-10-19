import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {decodePngRgba,encodePngRgba} from './lib/png-icons.mjs';

// Complete canonical export, with escolha_genero as development start.
assert.ok(process.argv[2]&&process.argv[3],'Usage: node scripts/smoke-traveler-entry.mjs <gender-start.gba> <evidence-directory>');
const out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('../fixtures/asset-provenance/traveler-entry-manifest.json',import.meta.url)));
const asset=id=>decodePngRgba(fs.readFileSync(new URL(manifest.assets[id].source,root)));
const backgrounds=[asset('gender-bg'),asset('name-bg')],portraits=[asset('gender-portraits'),asset('name-portraits')],focus=asset('focus-corners'),labels=asset('gender-labels');
const font=decodePngRgba(fs.readFileSync(new URL('Assets/fonts/porto-hud-b-font.png',root)));
const rgb=p=>(p[0]>>3)|((p[1]>>3)<<5)|((p[2]>>3)<<10);
const color=n=>[(n&31)<<3,((n>>5)&31)<<3,((n>>10)&31)<<3,255];
function paste(dst,src,x,y,sx=0,w=src.width,h=src.height){for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const a=(yy*src.width+sx+xx)*4;if(src.pixels[a+3])dst.pixels.set(src.pixels.subarray(a,a+4),((y+yy)*240+x+xx)*4)}}
function text(dst,s,x,y){for(const [i,c]of Array.from(s).entries()){const g=c.codePointAt(0)-32;for(let yy=0;yy<8;yy++)for(let xx=0;xx<8;xx++){const a=((Math.floor(g/16)*8+yy)*font.width+g%16*8+xx)*4;if(font.pixels[a]!==16||font.pixels[a+1]!==28||font.pixels[a+2]!==48)dst.pixels.set(color(0x1862),((y+yy)*240+x+i*8+xx)*4)}}}
function corners(dst,x,y,w,h){for(let yy=0;yy<8;yy++)for(let xx=0;xx<8;xx++){if(!([0xf0,0xc0,0xc0,0x80,0,0,0,0][yy]&(1<<(7-xx))))continue;for(const [X,Y]of [[x+xx,y+yy],[x+w-1-xx,y+yy],[x+xx,y+h-1-yy],[x+w-1-xx,y+h-1-yy]])dst.pixels.set(color(0x1aff),(Y*240+X)*4)}}
function expectedGender(selected){const d={...backgrounds[0],pixels:Buffer.from(backgrounds[0].pixels)};paste(d,portraits[0],36,48,0,64,64);paste(d,portraits[0],140,48,64,64,64);paste(d,labels,44,124,0,48,8);paste(d,labels,148,124,48,48,8);for(let f=0;f<4;f++)paste(d,focus,(selected?128:24)+f%2*80,32+Math.floor(f/2)*104,f*8,8,8);return d.pixels}
let sex=0,selected=0,lowercase=false,cursor=0,value=Array(8).fill(' '),editing=true;
function expectedName(){const d={...backgrounds[1],pixels:Buffer.from(backgrounds[1].pixels)};paste(d,portraits[1],20,40,sex*48,48,48);const visible=[...value];if(editing&&cursor<8)visible[cursor]=' ';text(d,visible.join(''),120,40);const alphabet=lowercase?'abcdefghijklmnopqrstuvwxyz':'ABCDEFGHIJKLMNOPQRSTUVWXYZ';for(let i=0;i<26;i++)text(d,alphabet[i],92+i%8*16,68+Math.floor(i/8)*16);for(const [s,x]of [['DEL',96],[lowercase?'aA':'Aa',148],['OK',196]])text(d,s,x,132);if(selected<26)corners(d,88+selected%8*16,64+Math.floor(selected/8)*16,16,16);else corners(d,88+[0,48,96][selected-26],128,40,16);return d.pixels}
// Public keyboard geometry: controls span several columns, letters use an 8-column grid.
const grid=[Array.from({length:8},(_,i)=>i),Array.from({length:8},(_,i)=>i+8),Array.from({length:8},(_,i)=>i+16),[24,25,-1,-1,-1,-1,-1,-1],[26,26,26,27,27,27,28,28]];
const moves=[[16,1,0],[32,-1,0],[64,0,-1],[128,0,1]];
function neighbor(index,dx,dy){let row=0,col=0;for(let y=0;y<5;y++)for(let x=0;x<8;x++)if(grid[y][x]===index){row=y;col=x}if(dx){for(let n=1;n<=8;n++){const v=grid[row][(col+dx*n+80)%8];if(v>=0&&v!==index)return v}}else{for(let n=1;n<=5;n++){const r=(row+dy*n+50)%5,candidates=grid[r].map((v,x)=>({v,x})).filter(o=>o.v>=0);if(candidates.length){candidates.sort((a,b)=>Math.abs(a.x-col)-Math.abs(b.x-col)||a.x-b.x);return candidates[0].v}}}return index}
function route(from,to){const queue=[[from,[]]],seen=new Set([from]);for(const [v,keys]of queue){if(v===to)return keys;for(const [key,dx,dy]of moves){const n=neighbor(v,dx,dy);if(!seen.has(n)){seen.add(n);queue.push([n,[...keys,key]])}}}throw Error('Unreachable keyboard key '+to)}
const wasm=fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm',import.meta.url));
const core=await createMGBA({print:()=>{},printErr:()=>{},instantiateWasm(imports,receive){const i=new WebAssembly.Instance(new WebAssembly.Module(wasm),imports);receive(i);return i.exports}});
const rom=fs.readFileSync(process.argv[2]),report={ok:false,romSha256:crypto.createHash('sha256').update(rom).digest('hex'),romBytes:rom.length,states:[],transitions:[]};
function step(n,k=0){core._gba_set_keys(k);for(let i=0;i<n;i++)core._gba_run_frame()}
function tap(k){step(4,k);step(45)}
function pixels(){const p=core._gba_framebuffer(),b=Buffer.from(core.HEAPU8.subarray(p,p+153600));for(let i=3;i<b.length;i+=4)b[i]=255;return b}
function capture(label,want){const actual=pixels();let mismatches=0;for(let i=0;i<actual.length;i+=4)if(rgb(actual.subarray(i,i+3))!==rgb(want.subarray(i,i+3)))mismatches++;const file=String(report.states.length).padStart(2,'0')+'-'+label+'.png';fs.writeFileSync(path.join(out,file),encodePngRgba({width:240,height:160,pixels:actual}));report.states.push({label,file,rgb555Mismatches:mismatches,telemetry:readRuntimeTelemetry(core)});if(mismatches)fs.writeFileSync(path.join(out,file.replace('.png','-expected.png')),encodePngRgba({width:240,height:160,pixels:want}));assert.equal(mismatches,0,label+' differs from approved art and native text geometry')}
function go(target){for(const key of route(selected,target))tap(key);selected=target}
function chooseLetter(letter){go(letter.toUpperCase().charCodeAt(0)-65);tap(1);if(cursor<8){value[cursor]=lowercase?letter.toLowerCase():letter.toUpperCase();cursor++}}
function resetName(){selected=0;lowercase=false;cursor=0;value=Array(8).fill(' ');editing=true}
function expectPrologue(label){step(90);const t=readRuntimeTelemetry(core);assert.equal(t.runtimeKind,8,label+' must enter cutscene');assert.equal(t.variables[0],1,'chapter starts after name confirmation');fs.writeFileSync(path.join(out,label+'.png'),encodePngRgba({width:240,height:160,pixels:pixels()}));report.transitions.push({label,telemetry:t,name:value.join('').trimEnd()})}
try{
 core._gba_init();const p=core._malloc(rom.length);core.HEAPU8.set(rom,p);assert.equal(core._gba_load_rom(p,rom.length),1);core._free(p);step(180);
 capture('gender-male',expectedGender(0));tap(16);capture('gender-female',expectedGender(1));tap(32);capture('gender-male-return',expectedGender(0));tap(1);step(90);resetName();capture('name-male-empty',expectedName());
 for(let i=0;i<29;i++){go(i);capture('focus-'+String(i).padStart(2,'0'),expectedName())}
 go(26);tap(1);capture('delete-empty',expectedName());
 for(const ch of 'MARIANNA'){chooseLetter(ch);capture('type-'+cursor,expectedName())}
 chooseLetter('B');capture('eight-character-limit',expectedName());
 go(26);tap(1);cursor--;value[cursor]=' ';capture('delete-eighth-character',expectedName());chooseLetter('A');capture('restore-eighth-character',expectedName());
 tap(2);editing=false;capture('name-male-finish-editing',expectedName());tap(1);editing=true;go(28);tap(1);expectPrologue('male-prologue');
 core._gba_reset();step(180);sex=1;tap(16);capture('female-after-reset',expectedGender(1));tap(1);step(90);resetName();capture('name-female-empty',expectedName());
 go(27);tap(1);lowercase=true;capture('lowercase',expectedName());for(const ch of 'lia'){chooseLetter(ch);capture('female-type-'+cursor,expectedName())}
 go(26);tap(1);cursor--;value[cursor]=' ';capture('delete-short-name',expectedName());chooseLetter('a');tap(2);editing=false;capture('female-name-finish-editing',expectedName());tap(1);editing=true;go(28);tap(1);expectPrologue('female-prologue');
 report.ok=true;
}finally{core._gba_destroy();fs.writeFileSync(path.join(out,'rom-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:report.ok,states:report.states.length,mismatchedPixels:report.states.reduce((n,s)=>n+s.rgb555Mismatches,0),transitions:report.transitions.length},null,2))}
