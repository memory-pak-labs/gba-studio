// Compare approved blank backgrounds against real ROM framebuffers outside native UI and OBJ bounds.
// Usage: node scripts/verify-blank-background-roms.mjs ROM_DIR OUTPUT_DIR
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {decodePngRgba,encodePngRgba} from './lib/png-icons.mjs';
const [romDir,out]=process.argv.slice(2),app=fileURLToPath(new URL('../',import.meta.url));
if(!romDir||!out)throw Error('Provide ROM_DIR with manifest.json and OUTPUT_DIR');
await mkdir(out,{recursive:true});
const catalog=JSON.parse(await readFile(app+'/default-assets/templates/blank/background-defaults.json','utf8'));
const wasm=await readFile(app+'/static/WebPlayer/player/mgba-core.wasm');
const core=await createMGBA({print(){},printErr(){},instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(new WebAssembly.Module(wasm),imports);receive(instance);return instance.exports;}});
if(core._gba_init()!==1)throw Error('init failed');
const read16=a=>core._gba_audio_register(a)>>>0;
const dimensions=[[[8,8],[16,16],[32,32],[64,64]],[[16,8],[32,8],[32,16],[64,32]],[[8,16],[8,32],[16,32],[32,64]]];
function overlayMask(){
 const mask=new Uint8Array(240*160),display=read16(0x04000000);
 if(display&0x1000)for(let slot=0;slot<128;slot++){
  const a0=read16(0x07000000+slot*8),a1=read16(0x07000002+slot*8),shape=a0>>>14;
  if(shape>2||(!(a0&0x100)&&(a0&0x200)))continue;
  let [w,h]=dimensions[shape][a1>>>14];if((a0&0x300)===0x300){w*=2;h*=2;}
  let x=a1&511,y=a0&255;if(x>=240)x-=512;if(y>=160)y-=256;
  for(let py=Math.max(0,y);py<Math.min(160,y+h);py++)for(let px=Math.max(0,x);px<Math.min(240,x+w);px++)mask[py*240+px]=1;
 }
 if(display&0x100){
  const control=read16(0x04000008),base=(control>>>8)&31,size=control>>>14,width=(size&1)?64:32,height=(size&2)?64:32;
  // BG0 is the fixed UI plane. GBA HOFS/VOFS are write-only: bus reads are open-bus values.
  const sx=0,sy=0;
  for(let y=0;y<160;y++)for(let x=0;x<240;x++){
   const tx=(Math.floor((x+sx)/8))%width,ty=(Math.floor((y+sy)/8))%height;
   const block=Math.floor(ty/32)*(width/32)+Math.floor(tx/32);
   const entry=read16(0x06000000+(base+block)*2048+((ty%32)*32+tx%32)*2);
   if(entry!==0)mask[y*240+x]=1;
  }
 }
 return mask;
}
const results=[],failures=[];
try {
for(const row of JSON.parse(await readFile(romDir+'/manifest.json','utf8'))){
 const aliases={isometricAdventure:'isometric',race:'racing',raceRear:'racingPerspective'}; const name=row.scene==='cena_1'?'topdown':row.scene.replace(/^qa_/,''),key=aliases[name]??name,asset=catalog.backgrounds.find(a=>a.key===key);
 if(!asset)throw Error('missing background '+key);
 const expected=decodePngRgba(await readFile(app+'/default-assets/templates/blank/Assets/backgrounds/'+asset.file));
 const rom=await readFile(romDir+'/'+row.scene+'.gba'),p=core._malloc(rom.length);core.HEAPU8.set(rom,p);if(core._gba_load_rom(p,rom.length)!==1)throw Error('load');core._free(p);
 core._gba_set_keys(0);for(let i=0;i<600;i++)core._gba_run_frame();
 const samples=[];
 for(const [phase,keys,frames]of[['idle',0,1],['right',16,60],['a',1,20],['released',0,120]]){
  core._gba_set_keys(keys);for(let i=0;i<frames;i++)core._gba_run_frame();
  const actual=Uint8Array.from(core.HEAPU8.subarray(core._gba_framebuffer(),core._gba_framebuffer()+240*160*4)),mask=overlayMask();
  await writeFile(out+'/'+row.scene+'-'+phase+'.png',encodePngRgba({width:240,height:160,pixels:actual}));
  let matched=0,compared=0,black=0;
  const rows=[];
  for(let y=0;y<160;y++){let mismatches=0;for(let x=0;x<240;x++){
   const pos=y*240+x,i=pos*4;if(mask[pos])continue;compared++;
   if([0,1,2].every(c=>Math.abs(actual[i+c]-expected.pixels[i+c])<=8))matched++;else mismatches++;
   if(actual[i]===0&&actual[i+1]===0&&actual[i+2]===0)black++;
  }rows.push(mismatches);}
  samples.push({phase,compared,matched,ratio:matched/compared,unmaskedBlackPixels:black,mismatchesPerRow:rows,telemetry:readRuntimeTelemetry(core)});
 }
 for(const sample of samples)if(sample.compared<5000||sample.ratio<0.999||sample.unmaskedBlackPixels!==0)failures.push(row.scene+'/'+sample.phase);
 results.push({scene:row.scene,asset:asset.file,romSha256:createHash('sha256').update(rom).digest('hex'),samples});console.log(row.scene,samples.map(s=>s.phase+':'+(s.ratio*100).toFixed(2)+'% black='+s.unmaskedBlackPixels).join(' '));
 await writeFile(out+'/report.json',JSON.stringify(results,null,2));
}
} finally {core._gba_destroy();}
await writeFile(out+'/failures.json',JSON.stringify(failures,null,2)+'\n');
assert.deepEqual(failures,[], 'Approved background rendering differs outside UI and sprite bounds');
