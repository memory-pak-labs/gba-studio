import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import {readRuntimeTelemetry} from '../static/WebPlayer/player/mgba-direct-player.mjs';
import {decodePngRgba,encodePngRgba} from './lib/png-icons.mjs';
import {decodeExportedSpriteSheetRgba,parseExportedRgb555Palette,decodeRgb555} from './rgb555-framebuffer-contract.mjs';
import {expandCompactSequence} from './exemplo-template-audit.mjs';

const [romPath,exportDir,out]=process.argv.slice(2);
assert.ok(romPath&&exportDir&&out,'Usage: node scripts/smoke-farol-interior.mjs ROM EXPORT_DIR OUTPUT');
fs.mkdirSync(out,{recursive:true});
const project=JSON.parse(fs.readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url)));
const contract=JSON.parse(fs.readFileSync(path.join(exportDir,'export_project.json')));
const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const room=project.rooms.find(r=>r.name==='farol_interior');
const bg=decodePngRgba(fs.readFileSync(new URL(project.assets.find(a=>a.name===room.backgroundAssetName).metadata.source,root)));
const font=decodePngRgba(fs.readFileSync(new URL('Assets/fonts/porto-hud-b-font.png',root)));
const uiHeader=fs.readFileSync(path.join(exportDir,'dialogue_ui_assets.hpp'),'utf8');
const ink=decodeRgb555(parseExportedRgb555Palette(uiHeader,'hud_preset_hud_porto_lumen_b_skin')[4]);
const paper=font.pixels.slice(0,3);
for(let i=0;i<font.pixels.length;i+=4){
 if(font.pixels[i]===paper[0]&&font.pixels[i+1]===paper[1]&&font.pixels[i+2]===paper[2])font.pixels[i+3]=0;
 else font.pixels.set([...ink,255],i);
}
const rom=fs.readFileSync(romPath),wasm=fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm',import.meta.url));
const core=await createMGBA({print:()=>{},printErr:()=>{},instantiateWasm(imports,receive){const i=new WebAssembly.Instance(new WebAssembly.Module(wasm),imports);receive(i);return i.exports;}});
const report={ok:false,romBytes:rom.length,romSha256:crypto.createHash('sha256').update(rom).digest('hex'),states:[],directions:[],collisions:[],dialogues:[],transitions:[],inputs:[],readyReplay:[]};
const asset=id=>contract.asset_pack.assets.find(a=>a.id===id);
function sprite(id,fw,fh,count){const a=asset(id);return decodeExportedSpriteSheetRgba({headerSource:fs.readFileSync(path.join(exportDir,a.header),'utf8'),symbol:a.symbol,frameWidth:fw,frameHeight:fh,frameCount:count});}
const nara=sprite('porto_nara_animations48',32,48,20),keeper=sprite('porto_lighthousekeeper_body48',32,48,4);
const hud={};for(const [id,w,h]of [['life_frame',64,32],['coin_frame',64,32],['hearts_full',64,16],['hearts_empty',64,16],['coin',16,16]])hud[id]=sprite('porto_hud_b_'+id,w,h,1);
const state=()=>readRuntimeTelemetry(core),rgb=(p,i)=>(p[i]>>3)|((p[i+1]>>3)<<5)|((p[i+2]>>3)<<10);
function run(n,k=0){const last=report.inputs.at(-1);if(last?.keys===k)last.frames+=n;else report.inputs.push({keys:k,frames:n});core._gba_set_keys(k);for(let i=0;i<n;i++)core._gba_run_frame();}
function tap(k){run(4,k);run(80);}
function pixels(){const p=core._gba_framebuffer(),a=Buffer.from(core.HEAPU8.subarray(p,p+153600));for(let i=3;i<a.length;i+=4)a[i]=255;return a;}
function paste(dest,source,x,y,sx=0,sy=0,w=source.width,h=source.height){for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const dx=x+xx,dy=y+yy,i=((sy+yy)*source.width+sx+xx)*4;if(dx>=0&&dy>=0&&dx<240&&dy<160&&source.pixels[i+3])dest.set(source.pixels.subarray(i,i+4),(dy*240+dx)*4);}}
function expected(nf,kf,health){
 const t=state(),cx=Math.max(0,Math.min(144,t.player.x+8-120)),cy=Math.max(0,Math.min(96,t.player.y+8-80)),a=Buffer.alloc(153600);
 paste(a,bg,-cx,-cy);paste(a,keeper,136-8-cx,112-40-cy,kf*32,0,32,48);paste(a,nara,t.player.x-8-cx,t.player.y-40-cy,nf*32,0,32,48);
 paste(a,hud.life_frame,4,4);paste(a,hud.coin_frame,180,4);paste(a,hud[health?'hearts_full':'hearts_empty'],13,8);paste(a,hud.coin,189,8);
 const coins=health?'003':'000';for(let i=0;i<3;i++){const j=coins.charCodeAt(i)-32;paste(a,font,204+i*6,9,(j%16)*8,Math.floor(j/16)*8,8,8);}return a;
}
function match(){
 const actual=pixels();let best={mismatch:Infinity};
 for(const health of [3,0])for(let kf=0;kf<4;kf++)for(let nf=0;nf<20;nf++){const want=expected(nf,kf,health);let n=0;for(let i=0;i<actual.length;i+=4)if(rgb(actual,i)!==rgb(want,i))n++;if(n<best.mismatch)best={mismatch:n,nf,kf,health,want};if(!n)return best;}return best;
}
function image(label){fs.writeFileSync(path.join(out,label+'.png'),encodePngRgba({width:240,height:160,pixels:pixels()}));}
function capture(label){run(12);assert.equal(state().runtimeKind,0);assert.equal(state().currentRoom,1);const m=match();image(label);report.states.push({label,pixels:38400,rgb555Mismatches:m.mismatch,playerFrame:m.nf,keeperFrame:m.kf,health:m.health,state:state()});if(m.mismatch){fs.writeFileSync(path.join(out,label+'-expected.png'),encodePngRgba({width:240,height:160,pixels:m.want}));}assert.equal(m.mismatch,0,label+' must match approved BG/actors/HUD');return m;}
function closeDialogue(){for(let i=0;i<14;i++){if(!match().mismatch)return i;tap(1);}assert.fail('dialogue did not close');}
function axis(target,axis,{warp=false}={}){
 for(let i=0;i<700;i++){if(warp&&state().currentRoom!==1)return;const delta=target-state().player[axis];if(Math.abs(delta)<=1)return;
  const before=state().player[axis];run(4,axis==='x'?(delta<0?32:16):(delta<0?64:128));run(2);
  if(warp&&state().currentRoom!==1)return;if(state().player[axis]===before){run(8);assert.fail('Blocked at '+JSON.stringify({target,axis,player:state().player}));}
 }assert.fail('movement deadline');
}
function move(x,y){axis(x,'x');axis(y,'y');run(8);}
function navigateToPortoGate(){
 const r=project.rooms.find(r=>r.name==='porto_lumen'),flags=expandCompactSequence(r.collisionTypes),w=r.width,h=r.height;
 const valid=(x,y)=>x>=0&&y>=1&&x<w-1&&y<h&&[-1,0].every(dy=>[0,1].every(dx=>flags[(y+dy)*w+x+dx]==='free'));
 const start=[Math.round(state().player.x/8),Math.round(state().player.y/8)],queue=[start],seen=new Set([start.join(',')]),parent=new Map();let goal;
 for(let i=0;i<queue.length;i++){const [x,y]=queue[i];if(x===17&&y===13){goal=[x,y];break;}
  for(const [dx,dy]of [[0,-1],[-1,0],[1,0],[0,1]]){const a=x+dx,b=y+dy,key=a+','+b;if(valid(a,b)&&!seen.has(key)){seen.add(key);parent.set(key,[x,y]);queue.push([a,b]);}}
 }
 assert.ok(goal,'Porto entrance must have a walking path');const route=[];for(let p=goal;p.join(',')!==start.join(',');p=parent.get(p.join(',')))route.push(p);route.reverse();
 for(const [x,y]of route){if(state().currentRoom===1)break;const target={x:x*8,y:y*8};for(const axis of ['x','y'])for(let n=0;n<35&&state().currentRoom===0&&Math.abs(state().player[axis]-target[axis])>1;n++){const d=target[axis]-state().player[axis];run(4,axis==='x'?(d<0?32:16):(d<0?64:128));run(2);}}
 for(let n=0;n<10&&state().currentRoom===0;n++){tap(1);run(10,64);}
 run(240);assert.equal(state().currentRoom,1,'authored Porto gate must return to Farol '+JSON.stringify({goal,state:state()}));report.transitions.push({from:'porto_lumen',to:'farol_interior',player:state().player});
}
function exitToPorto(label){
 for(let n=0;n<140&&state().currentRoom===1;n++){run(4,128);run(2);}run(240);assert.equal(state().currentRoom,0);assert.equal(state().runtimeKind,0);image(label);report.transitions.push({from:'farol_interior',to:'porto_lumen',player:state().player});
}
function dialogue(label){
 run(240);image(label+'-dialogue');const before=state().player;assert.ok(match().mismatch>100,label+' must show a real dialogue');run(12,16);run(8);assert.deepEqual(state().player,before,'dialogue freezes movement');
 const pages=closeDialogue();report.dialogues.push({label,pages,frozen:true});capture(label+'-closed');
}
try{
 core._gba_init();const p=core._malloc(rom.length);core.HEAPU8.set(rom,p);assert.equal(core._gba_load_rom(p,rom.length),1);core._free(p);run(240);dialogue('direct-entry');capture('direct-scene-start');
 exitToPorto('porto-first-visit');navigateToPortoGate();dialogue('farol-entry');
 for(const [name,bit,axis,sign]of [['up',64,'y',-1],['right',16,'x',1],['down',128,'y',1],['left',32,'x',-1]]){
  const before=state().player[axis];run(8,bit);run(8);const after=state().player[axis];assert.ok((after-before)*sign>0);const m=capture('move-'+name);
  const ranges={down:[0,4],up:[5,9],left:[10,14],right:[15,19]};assert.ok(m.nf>=ranges[name][0]&&m.nf<=ranges[name][1],name+' pose');report.directions.push({name,before,after,frame:m.nf});
 }
 move(208,176);capture('stairs-approach');report.readyReplay=structuredClone(report.inputs);run(80,16);const edge=state().player.x;run(30,16);assert.equal(state().player.x,edge);assert.ok(edge<240);capture('stairs-collision');report.collisions.push({fixture:'stairs',blockedAt:state().player});
 move(112,136);run(100,32);const bench=state().player.x;run(20,32);assert.equal(state().player.x,bench);capture('bench-collision');report.collisions.push({fixture:'workbench',blockedAt:state().player});
 move(104,80);run(100,64);const wall=state().player.y;run(20,64);assert.equal(state().player.y,wall);assert.ok(wall>=48);capture('north-wall-collision');report.collisions.push({fixture:'north wall',blockedAt:state().player});
 move(104,144);move(184,144);run(60,64);dialogue('lens');
 axis(144,'y');move(136,136);run(2,64);run(8);tap(1);dialogue('keeper');
 move(184,216);capture('exit-approach');exitToPorto('porto-after-exit');
 assert.deepEqual({x:state().player.x,y:state().player.y},{x:184,y:160});report.ok=true;
}catch(error){report.error=String(error);report.failureState=state();image('failure');throw error;}finally{
 fs.writeFileSync(path.join(out,'farol-verification.json'),JSON.stringify(report,null,2));core._gba_destroy();
}
console.log(JSON.stringify({ok:report.ok,states:report.states.length,pixels:report.states.length*38400,directions:report.directions.length,collisions:report.collisions.length,dialogues:report.dialogues.length,transitions:report.transitions.length}));
