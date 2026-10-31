import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {decodePngRgba} from './lib/png-icons.mjs';
const directory=process.argv[2];assert.ok(directory,'Usage: verify-farol-relay-pixels.mjs PROOF_DIRECTORY');
const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const project=JSON.parse(fs.readFileSync(new URL('exemplo-gba.gba-project',root)));
const source=decodePngRgba(fs.readFileSync(new URL('Assets/backgrounds/farol-interior-approved-paged-384x256.png',root)));
const sprite=decodePngRgba(fs.readFileSync(new URL('Assets/sprites/farol-relay-v2.png',root)));
const palette=project.assets.find(a=>a.name==='farol-relay-v2.png').metadata.objectPaletteValues;
const report=JSON.parse(fs.readFileSync(path.join(directory,'report.json')));assert.equal(report.passed,true);
const vi=project.variables.findIndex(v=>v.name==='var_farol_relay');const checks=[];const seen=new Set();
const rgb=(p,i)=>(p[i]>>3)|((p[i+1]>>3)<<5)|((p[i+2]>>3)<<10);
const cache=new Map();function mapped(color){if(cache.has(color))return cache.get(color);let best,error=Infinity;for(const v of palette.slice(1)){const d=2*((color&31)-(v&31))**2+4*(((color>>5)&31)-((v>>5)&31))**2+(((color>>10)&31)-((v>>10)&31))**2;if(d<error){best=v;error=d;}}cache.set(color,best);return best;}
for(const capture of report.captures.filter(c=>/^relay-(faulty$|before-quest-restored|ready-to-repair|installing|working$|stairs-|faulty-restored|working-restored|revisited|final-restored)/.test(c.label))){
 const s=capture.state;assert.equal(s.runtimeKind,0);assert.equal(s.currentRoom,1);const phase=s.variables[vi];seen.add(phase);
 const image=decodePngRgba(fs.readFileSync(path.join(directory,capture.label+'.png')));
 assert.ok(image.pixels.every((value,index)=>index%4!==3||value===255),'framebuffer captures must be opaque, matching the production player');
 const cx=phase===1?64:Math.max(0,Math.min(144,s.player.x+8-120)),cy=phase===1?0:Math.max(0,Math.min(96,s.player.y+8-80));
 const people=[{x:s.player.x-8-cx,y:s.player.y-40-cy,w:32,h:48},{x:128-cx,y:72-cy,w:32,h:48}];
 const hud=[{x:0,y:0,w:68,h:36},{x:176,y:0,w:64,h:36}];const inside=(x,y,r)=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h;
 let backgroundPixels=0,actorPixels=0,stairsPixels=0,mismatches=0;
 for(let y=0;y<160;y++)for(let x=0;x<240;x++){
  if([...people,...hud].some(r=>inside(x,y,r)))continue;
  const wx=x+cx,wy=y+cy,actual=rgb(image.pixels,(y*240+x)*4);
  if(wx>=248&&wx<296&&wy>=64&&wy<112){const i=((wy-64)*sprite.width+phase*48+wx-248)*4;if(sprite.pixels[i+3]){actorPixels++;if(actual!==mapped(rgb(sprite.pixels,i)))mismatches++;continue;}}
  backgroundPixels++;if(wx>=230&&wx<306&&wy>=132&&wy<208)stairsPixels++;
  if(actual!==rgb(source.pixels,(wy*source.width+wx)*4))mismatches++;
 }
 checks.push({label:capture.label,phase,backgroundPixels,actorPixels,stairsPixels,mismatches});assert.equal(mismatches,0,capture.label+': approved background and compiled relay palette must match actual framebuffer');
}
assert.deepEqual([...seen].sort(),[0,1,2]);assert.ok(checks.every(c=>c.actorPixels>0));
const result={passed:true,states:[...seen],backgroundPixels:checks.reduce((n,c)=>n+c.backgroundPixels,0),actorPixels:checks.reduce((n,c)=>n+c.actorPixels,0),stairsPixels:checks.reduce((n,c)=>n+c.stairsPixels,0),checks};fs.writeFileSync(path.join(directory,'pixels.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
