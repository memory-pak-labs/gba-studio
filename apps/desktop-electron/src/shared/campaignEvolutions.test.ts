import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "./projectTemplates.js";
import {bootPreviewRuntimeAtRoom,runPreviewRuntimeEvent} from './previewRuntime.js';

const project = () => buildProjectFromTemplate("exemplo-gba", {name:"O Último Farol"}) as Record<string, any>;
const commands=(p:Record<string,any>,name:string) => p.events.find((e:any)=>e.name===name).steps.map((s:any)=>s.command);

describe("approved campaign extensions in the canonical example",()=>{
 it('keeps the two legacy implicit save slots ahead of the new extension state',()=>{
  const names=project().variables.map((v:any)=>v.name);
  expect(names.slice(49,54)).toEqual(['z_feature_quest_state','z_feature_shop_stock','var_gallery_gate','var_gallery_record','var_telescope_alignment']);
 });
 it('restores an unfinished attempt safely and retains the completed archive position',()=>{
  const p=project();
  for(const [gate,x,y,expected]of [[0,11,20,[23,27]],[1,38,11,[38,11]]] as const){
   const state=bootPreviewRuntimeAtRoom(p,'galeria_das_mares');state.activeDialogue=null;
   state.variables.var_gallery_gate=gate;
   Object.assign(state.player!,{x,y});Object.assign(state.actors.find(a=>a.id===state.player!.id)!,{x,y});
   const restored=runPreviewRuntimeEvent(state,'gallery_restore');
   expect([restored.player!.x,restored.player!.y]).toEqual(expected);
  }
 });
 it('resets the optional puzzle and telescope when starting another game',()=>{
  const p=project(),state=bootPreviewRuntimeAtRoom(p,'titulo');
  for(const name of ['var_gallery_gate','var_gallery_record','var_telescope_alignment'])state.variables[name]=1;
  const next=runPreviewRuntimeEvent(state,'titulo_novo_jogo');
  for(const name of ['var_gallery_gate','var_gallery_record','var_telescope_alignment'])expect(next.variables[name],name).toBe(0);
 });
 it("ships the scrolling Gallery with a separate sideways gate and circular light",()=>{
  const p=project(),room=p.rooms.find((r:any)=>r.name==='galeria_das_mares');
  expect(room).toMatchObject({width:48,height:32,cameraMode:'follow_player',backgroundAssetName:'gallery-tides.png',mapStates:[]});
  expect(room.galleryLayout).toBeUndefined();
  const gate=p.actors.find((a:any)=>a.id==='gallery-gate');expect(gate).toMatchObject({spriteSheet:'gallery-gate.png',x:35,y:12});
  expect(room.collisionTypes[gate.y*room.width+gate.x]).toBe('free');
  const frames=p.animations.filter((a:any)=>a.spriteSheet===gate.spriteSheet);expect(frames.map((a:any)=>a.name)).toEqual(['closed','opening','open']);
  const opening=frames.find((a:any)=>a.name==='opening');expect(opening.loops).toBe(false);expect(opening.frameCount).toBe(4);
  expect(opening.frames.every((f:any)=>8-f.originY-f.tiles[0].y-f.tiles[0].tileHeight===-20)).toBe(true);
  expect(opening.frames.every((f:any)=>gate.x*8+f.tiles[0].x-f.originX===264)).toBe(true);
  expect(commands(p,'gallery_sync')).toContain('lantern player 120 120 58 3600 circle');
  expect(commands(p,'gallery_sync')).toContain('set_actor_animation_state gallery-gate gallery-gate-open-state');
  const steps=commands(p,'gallery_update');expect(steps.indexOf('wait_actor_animation gallery-gate')).toBeLessThan(steps.indexOf('set_actor_collision_enabled gallery-gate false'));
  expect(steps).toContain('save_game 0');expect(steps.some((s:string)=>s.startsWith('replace_tile')||s.startsWith('set_map_state'))).toBe(false);
  expect(room.collisionTypes[12*48+34]).toBe('solid');expect(room.collisionTypes[12*48+35]).toBe('free');expect(room.collisionTypes[12*48+39]).toBe('solid');
  expect(commands(p,'gallery_record')).toContain('if_variable var_gallery_record 0');
  for(const event of p.events.filter((e:any)=>e.roomName==='galeria_das_mares')){
   expect(event.steps.every((s:any)=>typeof s.id==='string'&&s.id.length>0&&s.isEnabled===true)).toBe(true);
   expect(new Set(event.steps.map((s:any)=>s.id)).size).toBe(event.steps.length);
  }
  expect(p.settings.campaign?.sceneOrder??[]).not.toContain('galeria_das_mares');
 });
 it("retains separate telescope states, cloud layer and a real support party member",()=>{
  const p=project();expect(p.actors.filter((a:any)=>a.id.startsWith('telescope-dial-')).map((a:any)=>[a.visibleVariable,a.visibleValue])).toEqual([0,1,2].map(n=>['var_telescope_alignment',n]));
  expect(commands(p,'observatorio_do_farol_telescopio')).toContain('save_game 0');
  const storm=p.rooms.find((r:any)=>r.name==='tempestade');expect(storm.backgroundAssetName).toBe('tempestade-approved-background.png');
  expect(storm.runtime.config.composition.layers.find((l:any)=>l.layer==='BG3')).toMatchObject({assetId:'storm-clouds.png',parallax:{x256:384}});
  expect(storm.runtime.config.composition.effects.hblank).toMatchObject({enabled:true,hdma:true,layer:'BG3'});
  expect(p.actors.find((a:any)=>a.id==='relay-mechanic-support')).toMatchObject({spriteSheet:'relay-mechanic.png',battle:{side:'party',abilities:['heal','defend']}});
 });
 it("publishes only the six approved assets and preserves existing save slots",()=>{
  const p=project(),manifest=JSON.parse(readFileSync(new URL('../../fixtures/asset-provenance/campaign-evolutions-approved.json',import.meta.url),'utf8'));
  expect(manifest.approval.approved).toBe(true);expect(manifest.assets).toHaveLength(6);
  for(const a of manifest.assets){const asset=p.assets.find((row:any)=>row.name===a.name);expect(asset.metadata).toMatchObject({approved:true,visualStatus:'approved',source:a.path});
   const hash=createHash('sha256').update(readFileSync(new URL('../../default-assets/templates/exemplo-gba/'+a.path,import.meta.url))).digest('hex');expect(hash).toBe(a.sha256);}
  expect(p.variables.slice(0,manifest.preservation.variableNames.length).map((v:any)=>v.name)).toEqual(manifest.preservation.variableNames);expect(p.variables.length).toBeLessThanOrEqual(64);
  expect(p.evolutionReview).toBeUndefined();expect(p.settings.build.enginePackPath).toBe('GBAStudioEnginePack');
  for(const a of manifest.assets)expect(JSON.stringify(p)).not.toContain(a.reviewName);
 });
});
