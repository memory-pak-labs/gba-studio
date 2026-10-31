import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {decodePngRgba,encodePngRgba} from './lib/png-icons.mjs';
import {decodeExportedTilemapRgba} from './rgb555-framebuffer-contract.mjs';

assert.ok(process.argv[2]&&process.argv[3]&&process.argv[4],
 'Usage: node scripts/smoke-prologue.mjs <prologo-start.gba> <engine-export> <evidence-directory>');
const out=path.resolve(process.argv[4]);fs.mkdirSync(out,{recursive:true});
const exportRoot=path.resolve(process.argv[3]);
const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const project=JSON.parse(fs.readFileSync(new URL('exemplo-gba.gba-project',root)));
const manifest=JSON.parse(fs.readFileSync(new URL('../fixtures/asset-provenance/prologue-clean-manifest.json',import.meta.url)));
const exported=JSON.parse(fs.readFileSync(path.join(exportRoot,'export_project.json')));
const glyphContract=JSON.parse(fs.readFileSync(new URL('../../../packages/GBAStudioEngine/engine/include/gbs/dialogue_font.json',import.meta.url)));
const glyphs=new Map(glyphContract.glyphs.map((g,i)=>[g.character,i]));
// Compare the native C++ output to the editor's independently implemented wrapper.
const bundle=buildSync({entryPoints:[fileURLToPath(new URL('../src/shared/dialogueFont.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {wrapDialogueText}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const ui=fs.readFileSync(path.join(exportRoot,'dialogue_ui_assets.hpp'),'utf8');
const fontBlock=ui.match(/constexpr uint8_t dialogue_font_tiles\[128\]\[32\] = \{([\s\S]*?)\n\};/);
assert.ok(fontBlock,'Expected the approved custom font in the generated UI');
const font=Uint8Array.from(fontBlock[1].match(/0x[0-9a-f]+|\b\d+\b/gi).map(Number));
assert.equal(font.length,128*32);
const rgb=(p,i)=>(p[i]>>3)|((p[i+1]>>3)<<5)|((p[i+2]>>3)<<10);
const backgrounds=[],pages=[];
for(const [index,e]of manifest.assets.entries()){
 const png=fs.readFileSync(new URL(e.source,root));
 assert.equal(crypto.createHash('sha256').update(png).digest('hex'),e.sha256);
 const source=decodePngRgba(png);backgrounds.push(source);
 const id=e.file.replace('.png','').replaceAll('-','_');
 const asset=exported.asset_pack.assets.find(a=>a.id===id);assert.ok(asset,id);
 const decoded=decodeExportedTilemapRgba({headerSource:fs.readFileSync(path.join(exportRoot,asset.header),'utf8'),symbol:asset.symbol,width:240,height:160});
 for(let i=0;i<source.pixels.length;i+=4)assert.equal(rgb(decoded.pixels,i),rgb(source.pixels,i),`${id} pixel${i/4}`);
 const text=project.dialogues.find(d=>d.key===`prologo_frame_${index+1}`).text;
 const lines=wrapDialogueText(text,26),framePages=[];
 for(let i=0;i<lines.length;i+=3)framePages.push(lines.slice(i,i+3));
 pages.push(framePages);
}
const wasm=fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm',import.meta.url));
const core=await createMGBA({print:()=>{},printErr:()=>{},instantiateWasm(imports,receive){const i=new WebAssembly.Instance(new WebAssembly.Module(wasm),imports);receive(i);return i.exports}});
const rom=fs.readFileSync(process.argv[2]);
const report={ok:false,romSha256:crypto.createHash('sha256').update(rom).digest('hex'),headerPixels:115200,headerRgb555Mismatches:0,states:[],skips:[]};
function step(n,key=0){core._gba_set_keys(key);for(let i=0;i<n;i++)core._gba_run_frame()}
function tap(key){step(4,key);step(90)}
function screen(){const p=core._gba_framebuffer(),b=Buffer.from(core.HEAPU8.subarray(p,p+153600));for(let i=3;i<b.length;i+=4)b[i]=255;return b}
function capture(frame,page){
 const actual=screen(),bg=backgrounds[frame];let bgErrors=0,textErrors=0;
 for(let y=0;y<80;y++)for(let x=0;x<240;x++){const i=(y*240+x)*4;if(rgb(actual,i)!==rgb(bg.pixels,i))bgErrors++}
 for(let row=0;row<3;row++)for(let col=0;col<26;col++){
  const c=Array.from(pages[frame][page][row]??'')[col]??' ';
  const index=glyphs.get(glyphContract.aliases[c]??c)??glyphs.get('?');
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
   const byte=font[index*32+y*4+Math.floor(x/2)],ink=((byte>>(x%2*4))&15)!==0;
   const at=((120+row*8+y)*240+16+col*8+x)*4;
   if((actual[at]+actual[at+1]+actual[at+2]>450)!==ink)textErrors++;
  }
 }
 const file=`frame-${frame+1}-page-${page+1}.png`;
 fs.writeFileSync(path.join(out,file),encodePngRgba({width:240,height:160,pixels:actual}));
 report.states.push({frame:frame+1,page:page+1,lines:pages[frame][page],file,backgroundPixels:19200,backgroundRgb555Mismatches:bgErrors,textPixels:4992,textMaskMismatches:textErrors});
 assert.equal(bgErrors,0,file+' must retain its background until all pages are confirmed');
 assert.equal(textErrors,0,file+' must show all wrapped text, including accents');
}
try{
 core._gba_init();const p=core._malloc(rom.length);core.HEAPU8.set(rom,p);assert.equal(core._gba_load_rom(p,rom.length),1);core._free(p);step(180);
 for(let frame=0;frame<3;frame++)for(let page=0;page<pages[frame].length;page++){capture(frame,page);tap(1)}
 assert.equal(readRuntimeTelemetry(core).runtimeKind,0,'A must complete the prologue and enter Porto Lumen');
 assert.equal(readRuntimeTelemetry(core).currentRoom,0);
 for(const key of [2,8])for(let frame=0;frame<3;frame++){
  core._gba_reset();step(180);
  for(let f=0;f<frame;f++)for(let p=0;p<pages[f].length;p++)tap(1);
  tap(key);step(90);const state=readRuntimeTelemetry(core);
  report.skips.push({key:key===2?'B':'Start',frame:frame+1,runtimeKind:state.runtimeKind,currentRoom:state.currentRoom});
  assert.equal(state.runtimeKind,0,'Skip must enter Porto Lumen');assert.equal(state.currentRoom,0);
 }
 report.ok=true;
}finally{
 core._gba_destroy();fs.writeFileSync(path.join(out,'prologue-verification.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({ok:report.ok,pages:report.states.length,skips:report.skips.length,headerPixels:report.headerPixels,textMaskMismatches:report.states.reduce((n,s)=>n+s.textMaskMismatches,0)}));
}
