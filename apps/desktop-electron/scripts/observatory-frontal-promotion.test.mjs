import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {buildEngineExportProjectContract} from '../src/main/exportEngineProject.js';
import {resolveGbaActorSprite} from '../src/shared/gbaRendering.js';
const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const canonical=JSON.parse(readFileSync(new URL('exemplo-gba.gba-project',root)));
const name='observatorio_do_farol';
it('integrates the approved frontal Observatory and fingertip cursor with three aligned hotspots',()=>{
 const room=canonical.rooms.find(r=>r.name===name);
 expect(room.backgroundAssetName).toBe('observatory-frontal-bg-240x160.png');
 expect(canonical.scenas.find(r=>r.name===name)).toEqual(room);
 const actor=canonical.actors.find(a=>a.id===name+'-cursor');
 expect(canonical.actors.filter(a=>a.roomName===name)).toEqual([actor]);
 expect(actor.spriteSheet).toBe('white-hand-cursor-32x32.png');
 expect(resolveGbaActorSprite(canonical,actor).frame).toMatchObject({originX:13,originY:6});
 const c=buildEngineExportProjectContract(canonical),exported=c.point_click_project.scenes.find(s=>s.name===name);
 expect(exported.props??[]).toHaveLength(0);
 expect(exported.cursor.metasprite.asset).toBe('white_hand_cursor_32x32');
 expect(exported.cursor.animations.find(a=>a.name==='idle').frame_metasprites[0].parts).toEqual([
  expect.objectContaining({x:-13,y:-6,width:32,height:32,slice_x:0,slice_y:0})
 ]);
 expect(exported.hotspots.map(h=>({name:h.name,area:h.area}))).toEqual([
 {name:'Telescópio',area:{x:24,y:48,width:64,height:72}},
 {name:'Mesa da Maré',area:{x:152,y:80,width:88,height:40}},
 {name:'Saída do Observatório',area:{x:104,y:32,width:40,height:80}}]);
 expect(exported.hotspots[2].on_click).toEqual(expect.arrayContaining([{op:'set_variable',variable:11,value:1},expect.objectContaining({op:'warp_runtime',runtime:'isometric',room:0})]));
 const bg=c.asset_pack.assets.find(a=>a.id==='observatory_frontal_bg_240x160');
 expect(bg).toMatchObject({background_bpp:4,background_palette_banks:14,background_tile_budget:600});
 const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/observatory-frontal-manifest.json',import.meta.url)));
 expect(createHash('sha256').update(readFileSync(new URL(manifest.asset.source,root))).digest('hex')).toBe(manifest.asset.sha256);
});

it('preserves every other scene, campaign and dialogue while retiring only the decorative Observatory instances',async()=>{
 const {promoteApprovedFrontalObservatory}=await import('./observatory-frontal-promotion.mjs');
 const {promotePointClickSceneCandidates}=await import('./point-click-scenes.mjs');
 const {promoteApprovedFrontalWarehouse}=await import('./warehouse-frontal-promotion.mjs');
 const source=promoteApprovedFrontalWarehouse(promotePointClickSceneCandidates(structuredClone(canonical))),snapshot=structuredClone(source);
 const result=promoteApprovedFrontalObservatory(source);
 expect(source).toEqual(snapshot);
 for(const key of ['events','dialogues','variables','settings'])expect(result[key],key).toEqual(source[key]);
 for(const key of ['rooms','scenas'])expect(result[key].filter(r=>r.name!==name),key).toEqual(source[key].filter(r=>r.name!==name));
 expect(result.rooms.find(r=>r.name===name).campaign).toEqual(source.rooms.find(r=>r.name===name).campaign);
 for(const key of ['actors','triggers'])expect(result[key].filter(r=>r.roomName!==name),key).toEqual(source[key].filter(r=>r.roomName!==name));
 for(const key of ['animationStates','animations'])expect(result[key].filter(a=>!a.id.startsWith(name+'-cursor')),key).toEqual(source[key].filter(a=>!a.id.startsWith(name+'-cursor')));
 for(const sheet of ['point-click-lia-scroll.png','point-click-dock-mechanic.png','point-click-keeper-lantern.png']){
  const old=source.assets.find(a=>a.name===sheet),asset=result.assets.find(a=>a.name===sheet);
  expect(asset).toEqual({...old,metadata:{...old.metadata,reusableLibraryAsset:true}});
 }
 expect(result.assets.find(a=>a.name==='observatorio-do-farol-gba.png').metadata.reusableLibraryAsset).toBe(true);
 expect(promoteApprovedFrontalObservatory(result)).toEqual(result);
});
it('keeps approved Observatory presentation when the canonical example is regenerated',async()=>{
 const {promoteExemploGBAVerticeCampaign}=await import('./vertice-showcase-project.mjs');
 for(const source of [canonical]){
  const result=promoteExemploGBAVerticeCampaign(source);
  expect(result.rooms.find(r=>r.name===name).backgroundAssetName).toBe('observatory-frontal-bg-240x160.png');
  expect(result.actors.filter(a=>a.roomName===name).map(a=>a.spriteSheet)).toEqual(['white-hand-cursor-32x32.png']);
 }
});
