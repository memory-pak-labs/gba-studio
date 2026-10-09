// Native OBJ/source and rendered-pixel proof for blankUserAssetsSmoke.test.ts.
// Usage: node scripts/verify-user-assets-roms.mjs MATRIX_DIR OUTPUT_DIR
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {decodePngRgba, encodePngRgba} from './lib/png-icons.mjs';
const [root,out]=process.argv.slice(2);
assert.ok(root&&out,'Provide MATRIX_DIR and OUTPUT_DIR');
await mkdir(out,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sizes=[[[8,8],[16,16],[32,32],[64,64]],[[16,8],[32,8],[32,16],[64,32]],[[8,16],[8,32],[16,32],[32,64]]];
const signature=pixels=>sha(Buffer.from(pixels.buffer,pixels.byteOffset,pixels.byteLength));
const sources=JSON.parse(await readFile(root+'/sources.json','utf8')),lookup=new Map();
// Build a source oracle from PNGs, independently of the exporter's generated tiles.
for(const source of sources){
 const bytes=await readFile(root+'/sources/'+source.sheet);assert.equal(sha(bytes),source.sourceSha256);
 const png=decodePngRgba(bytes);
 for(const [w,h]of sizes.flat()){
  if(w>source.width||h>source.height)continue;
  for(let frame=0;frame<source.frames;frame++)for(let y=0;y<=source.height-h;y+=8)for(let x=0;x<=source.width-w;x+=8){
   const colors=new Uint16Array(w*h);
   for(let py=0;py<h;py++)for(let px=0;px<w;px++){
    const i=((y+py)*png.width+frame*source.width+x+px)*4;
    if(png.pixels[i+3])colors[py*w+px]=0x8000|(png.pixels[i]>>3)|((png.pixels[i+1]>>3)<<5)|((png.pixels[i+2]>>3)<<10);
   }
   const key=w+'x'+h+':'+signature(colors),entry={family:source.family,frame,x,y,w,h};
   if(!lookup.has(key))lookup.set(key,[]);lookup.get(key).push(entry);
  }
 }
}
const wasm=await readFile(new URL('../static/WebPlayer/player/mgba-core.wasm',import.meta.url));
const core=await createMGBA({print(){},printErr(){},instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(new WebAssembly.Module(wasm),imports);receive(instance);return instance.exports;}});
assert.equal(core._gba_init(),1);
const read=a=>core._gba_audio_register(a)>>>0;
function objects(){
 const objects=[],oneDimensional=(read(0x04000000)&64)!==0;
 for(let slot=0;slot<128;slot++){
  const a0=read(0x07000000+slot*8),a1=read(0x07000002+slot*8),a2=read(0x07000004+slot*8),shape=a0>>>14;
  if(shape>2||(!(a0&256)&&(a0&512)))continue;
  // Both OBJ color depths use the same native shapes; affine OBJ is separate.
  if(a0&256){objects.push({slot,unsupported:true,a0,a1,a2});continue;}
  const bpp=(a0&8192)?8:4,bytesPerTile=bpp===8?64:32;
  const [w,h]=sizes[shape][a1>>>14],tile=a2&1023,bank=bpp===8?0:a2>>>12,colors=new Uint16Array(w*h);
  if(bpp===8)assert.equal(tile%2,0,'8bpp tile destination must be even');
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const offset=tile*32+Math.floor(y/8)*(oneDimensional?w/8*bytesPerTile:1024)+Math.floor(x/8)*bytesPerTile+(y%8)*(bpp===8?8:4)+(bpp===8?x%8:Math.floor((x%8)/2));
   const half=read(0x06010000+(offset&~1)),byte=(half>>>((offset&1)*8))&255,index=bpp===8?byte:(byte>>>((x&1)*4))&15;
   if(index)colors[y*w+x]=0x8000|read(0x05000200+(bank*16+index)*2);
  }
  let x=a1&511,y=a0&255;if(x>=240)x-=512;if(y>=160)y-=256;
  objects.push({slot,x,y,w,h,tile,bank,bpp,priority:(a2>>>10)&3,hflip:Boolean(a1&4096),vflip:Boolean(a1&8192),colors,matches:lookup.get(w+'x'+h+':'+signature(colors))??[]});
 }
 return objects;
}
function compare(objects,rgba){
 const owners=new Int16Array(240*160).fill(-1),values=new Uint16Array(240*160),priorities=new Uint8Array(240*160).fill(4);
 for(const obj of objects){if(obj.unsupported)continue;
  for(let y=0;y<obj.h;y++)for(let x=0;x<obj.w;x++){
   const px=obj.x+x,py=obj.y+y;if(px<0||px>=240||py<0||py>=160)continue;
   const value=obj.colors[(obj.vflip?obj.h-1-y:y)*obj.w+(obj.hflip?obj.w-1-x:x)];if(!value)continue;
   const pos=py*240+px;if(obj.priority>=priorities[pos])continue;
   priorities[pos]=obj.priority;owners[pos]=obj.slot;values[pos]=value;
  }
 }
 const matchedSlots=new Set(objects.filter(o=>o.matches?.length&&o.slot<64).map(o=>o.slot));
 const display=read(0x04000000),bg0=read(0x04000008),base=(bg0>>>8)&31,size=bg0>>>14,mapWidth=(size&1)?64:32;
 let compared=0,matched=0;
 for(let y=0;y<160;y++)for(let x=0;x<240;x++){
  const pos=y*240+x;if(!matchedSlots.has(owners[pos]))continue;
  // BG0 contains authored UI and can obscure an actor. Exclude nonempty UI cells.
  if(display&256){const tx=Math.floor(x/8),ty=Math.floor(y/8),block=Math.floor(ty/32)*(mapWidth/32)+Math.floor(tx/32);
   if(read(0x06000000+(base+block)*2048+((ty%32)*32+tx%32)*2)!==0)continue;}
  const value=values[pos],rgb=[(value&31)*8,((value>>>5)&31)*8,((value>>>10)&31)*8];compared++;
  if(rgb.every((c,i)=>Math.abs(c-rgba[pos*4+i])<=8))matched++;
 }
 return {compared,matched,ratio:compared?matched/compared:null};
}
const results=[],failures=[];
const actorScenes=new Set(['topdown','platformer','isometric','isometricAdventure','isometricTactical','shmup','racing','luta','pointAndClick']);
try{
 for(const row of JSON.parse(await readFile(root+'/roms/manifest.json','utf8'))){
  const rom=await readFile(root+'/roms/'+row.scene+'.gba');assert.equal(sha(rom),row.romSha256);
  const p=core._malloc(rom.length);core.HEAPU8.set(rom,p);assert.equal(core._gba_load_rom(p,rom.length),1);core._free(p);
  core._gba_set_keys(0);for(let i=0;i<180;i++)core._gba_run_frame();
  const samples=[];
  for(const [phase,keys,frames]of[['idle',0,1],['right',16,30],['right-animation',16,36],['release',0,1],['left',32,30],['up',64,30],['down',128,30],['a',1,4],['a-animation',1,15],['b',2,4],['settled',0,90]]){
   // Release guard and let the preceding hitstun finish before testing an
   // authored attack. Sampling during a CPU hit can correctly show Hurt.
   const preparationFrames=row.runtime==='luta'&&phase==='a'?32:0;
   if(preparationFrames){core._gba_set_keys(0);for(let i=0;i<preparationFrames;i++)core._gba_run_frame();}
   core._gba_set_keys(keys);for(let i=0;i<frames;i++)core._gba_run_frame();
   const rgba=Uint8Array.from(core.HEAPU8.subarray(core._gba_framebuffer(),core._gba_framebuffer()+240*160*4)),objs=objects(),comparison=compare(objs,rgba);
   const world=objs.filter(o=>o.slot<64),matched=world.filter(o=>o.matches?.length);
   if(row.mixedColorDepth&&phase==='idle'&&actorScenes.has(row.runtime))assert(matched.some(o=>o.bpp===8),row.scene+': no authored 8bpp player');
   if(row.mixedColorDepth&&phase==='idle'&&['topdown','pointAndClick'].includes(row.runtime))assert(matched.some(o=>o.bpp===4&&o.matches.some(m=>m.family==='mixed-four')),row.scene+': mixed 4bpp actor lost its source colors');
   const sample={phase,keys,preparationFrames,comparison,telemetry:readRuntimeTelemetry(core),objects:world.map(({colors,...o})=>o)};samples.push(sample);
   await writeFile(out+'/'+row.scene+'-'+phase+'.png',encodePngRgba({width:240,height:160,pixels:rgba}));
   if(comparison.compared>0&&comparison.ratio<0.999)failures.push(row.scene+'/'+phase+': source OBJ pixels differ in framebuffer');
   if(phase==='idle'&&actorScenes.has(row.runtime)&&!matched.length)failures.push(row.scene+': authored player has no matching source OBJ');
   if(row.runtime==='platformer'&&['right','right-animation','a','a-animation'].includes(phase)){
    const expected=phase.startsWith('a')?[5,6]:[1,2,3,4];
    const parts=matched.filter(obj=>obj.matches.some(m=>m.family==='platformer'));
    if(parts.length!==4||!parts.every(obj=>obj.matches.some(m=>m.family==='platformer'&&expected.includes(m.frame))))failures.push(row.scene+'/'+phase+': expected animated source frame is absent or incomplete');
   }
   if(row.runtime==='luta'&&phase==='a'){
    const expected=sources.find(s=>s.family==='fighter');
    if(!matched.some(obj=>obj.matches.some(m=>m.family===expected.family&&[8,9,10].includes(m.frame))))failures.push(row.scene+'/'+phase+': expected attack source frame is absent');
   }
   if(row.runtime==='topdown'&&phase==='idle'&&!sources.find(s=>s.family==='topdown').opaque){
    const player=matched.find(obj=>obj.matches.some(m=>m.family==='topdown'&&m.frame===0));
    const npc=matched.find(obj=>obj.matches.some(m=>m.family==='topdown'&&m.frame===1));
    if(!player||!npc||player.tile===npc.tile)failures.push(row.scene+': independent shared-sheet actor frames are absent');
   }
   if(row.runtime==='pointAndClick'&&row.authoredProp&&phase==='idle'){
    const cursor=matched.find(obj=>obj.matches.some(m=>m.family==='point-click'&&m.frame===0));
    const prop=matched.find(obj=>obj.matches.some(m=>m.family==='point-click'&&m.frame===4));
    if(!cursor||!prop||cursor.tile===prop.tile)failures.push(row.scene+': cursor and animated prop frames are absent or share resident tiles');
   }
  }
  const framesByFamily={};for(const s of samples)for(const obj of s.objects)for(const match of obj.matches??[])(framesByFamily[match.family]??=new Set()).add(match.frame);
  results.push({...row,samples,framesByFamily:Object.fromEntries(Object.entries(framesByFamily).map(([family,frames])=>[family,[...frames].sort((a,b)=>a-b)]))});
  console.log(row.scene,samples.map(s=>s.phase+':'+s.objects.filter(o=>o.matches?.length).length+' OBJ '+(s.comparison.ratio===null?'n/a':(s.comparison.ratio*100).toFixed(1)+'%')).join(' '));
  await writeFile(out+'/report.json',JSON.stringify({results,failures},null,2));
 }
}finally{core._gba_destroy();}
await writeFile(out+'/report.json',JSON.stringify({results,failures},null,2)+'\n');
assert.deepEqual(failures,[],'Imported actor rendering failed');
