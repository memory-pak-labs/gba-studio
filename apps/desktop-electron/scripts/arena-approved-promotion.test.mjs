import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {buildEngineExportProjectContract} from '../src/main/exportEngineProject.js';
import {resolveGbaActorSprite,gbaActorSpriteRoomPlacementFromFrame} from '../src/shared/gbaRendering.js';
import {promoteApprovedArena} from './arena-approved-promotion.mjs';
import {decodePngRgba} from './lib/png-icons.mjs';

const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const canonical=()=>JSON.parse(readFileSync(new URL('exemplo-gba.gba-project',root)));
const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/arena-approved-manifest.json',import.meta.url)));
const scene='arena_arrancada';
const retired=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/example-library-cleanup.json',import.meta.url))).retiredAssets;

it('preserves every original fighter pixel in the complete animation sheets',()=>{
 for(const side of ['nara','rival']){
  const old=retired.find(a=>a.name===`arena-${side}-64x64.png`).originalPixels;
  const complete=decodePngRgba(readFileSync(new URL(`Assets/sprites/arena-${side}-complete-64x64.png`,root)));
  expect(complete.height).toBe(old.height);
  const prefix=Buffer.concat(Array.from({length:old.height},(_,y)=>complete.pixels.subarray(y*complete.width*4,y*complete.width*4+old.width*4)));
  expect(createHash('sha256').update(prefix).digest('hex')).toBe(old.sha256);
 }
});

it('exports the reviewed arena with independent life gauges and names inside the nautical frames',()=>{
 const p=canonical(),room=p.rooms.find(r=>r.name===scene);
 expect(room).toMatchObject({backgroundAssetName:'arena-coastal-240x160.png',hudPresetId:'hud-arena-approved'});
 expect(p.scenas.find(r=>r.name===scene)).toEqual(room);
 expect(room.runtime.config.hudAssetName).toBeUndefined();
 const hud=p.settings.hudPresets.find(h=>h.id===room.hudPresetId);
 expect(hud.backgroundImage).toBe('');
 expect(hud.components.filter(c=>c.kind==='frame')).toHaveLength(5);
 const life=hud.components.filter(c=>['p1-health','p2-health'].includes(c.valueBinding));
 expect(life).toHaveLength(2);expect(life[0].asset).not.toBe(life[1].asset);
 expect(life[0].gauge.emptyAsset).not.toBe(life[1].gauge.emptyAsset);
 for(const [label,x,w] of [['NARA',48,32],['RIVAL',152,40]]){
  expect(hud.components.find(c=>c.text===label)).toMatchObject({x,y:13,width:w,height:8,textAdvance:8});
 }
 const c=buildEngineExportProjectContract(p),stage=c.luta_project.stages.find(s=>s.name===scene||s.id===scene);
 expect(stage).toBeDefined();
 expect(stage.action_sounds).toEqual({hit:expect.any(Number),guard:expect.any(Number),special:expect.any(Number),miss:expect.any(Number)});
 expect(new Set(Object.values(stage.action_sounds)).size).toBe(4);
 const superBars=hud.components.filter(c=>['p1-super','p2-super'].includes(c.valueBinding));
 expect(superBars).toHaveLength(2);
 expect(superBars[0].asset).not.toBe(superBars[1].asset);
 expect(superBars.map(c=>c.gauge.reverse).sort()).toEqual([false,true]);
 for(const player of [stage.player1[0],stage.player2[0]]){
  expect(player.animation_set.walk.frame_metasprites.map(f=>f.parts[0].slice_x)).toEqual([1024,1088,1152,1216]);
  expect(player.animation_set.jump.frame_metasprites.map(f=>f.parts[0].slice_x)).toEqual([1280,1344,1408,1472]);
  expect(player.animation_set.jump.loops).toBe(false);
 }
 expect(c.asset_pack.assets.some(a=>a.id==='arena_coastal_240x160')).toBe(true);
 for(const side of ['nara','rival']){
  const actor=p.actors.find(a=>a.id===side+'-fighter');
  expect(actor.spriteSheet).toBe(`arena-${side}-complete-64x64.png`);
  const frame=resolveGbaActorSprite(p,actor).frame;
  expect(frame).toMatchObject({originX:32,originY:56,frameWidth:64,frameHeight:64});
  expect(gbaActorSpriteRoomPlacementFromFrame(actor.x,actor.y,frame)).toMatchObject({leftTiles:side==='nara'?4:18,topTiles:10});
  expect(p.animationStates.find(s=>s.id===actor.animationStateID).spriteSheet).toBe(actor.spriteSheet);
  for(const state of ['idle','attack','special','guard','hurt','walk','jump'])expect(p.animations.find(a=>a.name===actor.lutaAnimations[state]).spriteSheet).toBe(actor.spriteSheet);
 }
 for(const entry of manifest.assets){
  const archived=retired.find(a=>a.name===entry.name);
  const hash=archived?.sha256??createHash('sha256').update(readFileSync(new URL(entry.metadata.source,root))).digest('hex');
  expect(hash).toBe(entry.sha256);
 }
});

it('restores approved presentation idempotently while preserving other scenes, events and assets',()=>{
 const p=canonical(),source=structuredClone(p),r=source.rooms.find(r=>r.name===scene);
 r.backgroundAssetName='old.png';source.scenas.find(r=>r.name===scene).backgroundAssetName='old.png';
 source.actors.find(a=>a.id==='nara-fighter').spriteSheet='old.png';
 const snapshot=structuredClone(source),result=promoteApprovedArena(source);
 expect(source).toEqual(snapshot);expect(promoteApprovedArena(result)).toEqual(result);
 for(const key of ['rooms','scenas'])expect(result[key].filter(r=>r.name!==scene)).toEqual(p[key].filter(r=>r.name!==scene));
 for(const key of ['actors','events','triggers'])expect(result[key].filter(r=>r.roomName!==scene)).toEqual(p[key].filter(r=>r.roomName!==scene));
 for(const key of ['dialogues','variables'])expect(result[key]).toEqual(p[key]);
 for(const name of ['arena_vencer_rival','arena_derrota'])expect(result.events.find(e=>e.name===name)).toEqual(p.events.find(e=>e.name===name));
 expect(result.rooms.find(r=>r.name===scene).campaign).toEqual(p.rooms.find(r=>r.name===scene).campaign);
 for(const asset of p.assets.filter(a=>!manifest.assets.some(n=>n.id===a.id)&&!manifest.retainedAssets.includes(a.name)))expect(result.assets.find(a=>a.id===asset.id)).toEqual(asset);
 expect(result.settings.hudPresets.filter(h=>h.id!=='hud-arena-approved')).toEqual(p.settings.hudPresets.filter(h=>h.id!=='hud-arena-approved'));
});

it('retains the approved arena when the complete example is regenerated',async()=>{
 const {promoteExemploGBAVerticeCampaign}=await import('./vertice-showcase-project.mjs');
 const p=canonical();
 p.rooms.find(r=>r.name===scene).backgroundAssetName='old.png';
 p.scenas.find(r=>r.name===scene).backgroundAssetName='old.png';
 const result=promoteExemploGBAVerticeCampaign(p);
 expect(result.rooms.find(r=>r.name===scene).backgroundAssetName).toBe('arena-coastal-240x160.png');
 expect(result.actors.find(a=>a.id==='rival-fighter').spriteSheet).toBe('arena-rival-complete-64x64.png');
});
