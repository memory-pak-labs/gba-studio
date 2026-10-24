import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {promoteFarolRelay,FAROL_RELAY as r} from './farol-relay.mjs';
import {buildEngineExportProjectContract} from '../src/main/exportEngineProject.js';
import {bootPreviewRuntimeAtRoom,runPreviewRuntimeEvent,tickPreviewRuntime,dispatchPreviewRuntimeAction} from '../src/shared/previewRuntime.js';
const canonical=()=>JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url)));
function finish(s){for(let n=0;n<700;n++){if(s.activeDialogue)s=dispatchPreviewRuntimeAction(s,'action');if(!s.activeDialogue&&!s.scriptWaitFrames&&!s.scriptQueue.length&&!s.scriptContinuations.length)return s;s=tickPreviewRuntime(s,1000/60);}throw Error('relay did not finish');}
describe('approved Farol relay V2',()=>{
 it('replaces the walkway with a separate 48px actor above the stairs',()=>{
  const p=promoteFarolRelay(canonical());
  expect(p.actors.find(a=>a.id===r.actor)).toMatchObject({x:33,y:13,spriteSheet:r.sheet,animationStateID:'farol-relay-faulty-state',eventBindings:{onInteract:'farol_relay_interact'}});
  expect(p.rooms.find(x=>x.name==='farol_interior').mapStates??[]).toEqual([]);
  expect(p.triggers.some(t=>t.id==='trigger-farol-maintenance')).toBe(false);
  expect(p.variables.some(v=>v.name==='var_farol_maintenance')).toBe(false);
  expect(JSON.stringify(p)).not.toContain('farol_maintenance');
  const relay=p.assets.find(a=>a.name===r.sheet),keeper=p.assets.find(a=>a.name==='porto-lighthousekeeper-body48.png');
  expect(relay.metadata).toMatchObject({colorMode:'8bpp',frameWidth:48,frameHeight:48,frameCount:3,streamFrames:true});
  expect(relay.metadata.objectPaletteValues).toEqual(keeper.metadata.objectPaletteValues);
  for(const animation of p.animations.filter(a=>a.spriteSheet===r.sheet))expect(animation).toMatchObject({hitboxX:-4,hitboxY:-6,hitboxWidth:24,hitboxHeight:12});
 });
 it('shows installation, consumes the real quest piece once and persists the working state',()=>{
  const p=promoteFarolRelay(canonical());let s=bootPreviewRuntimeAtRoom(p,'farol_interior',{skipBootEvents:true});
  s={...s,variables:{...s.variables,var_signal_stage:1,var_signal_part:1,var_signal_code:1,var_signal_lock:1,var_farol_relay:0},inventory:{...s.inventory,zz_signal_chart:1,zz_signal_relay:1,currency_gold:7}};
  s=runPreviewRuntimeEvent(s,'signal_finish_repair');expect(s.variables.var_farol_relay).toBe(1);
  s=finish(s);expect(s.variables.var_farol_relay).toBe(2);expect(s.inventory.zz_signal_relay).toBe(0);expect(s.inventory.currency_gold).toBe(7);expect(s.saveSlots[0].variables.var_farol_relay).toBe(2);
  const saved=structuredClone(s.saveSlots[0]);s=finish(runPreviewRuntimeEvent(s,'signal_finish_repair'));expect(s.saveSlots[0]).toEqual(saved);
 });
 it('restores visuals from quest progress and retains the calibration watchdog',()=>{
  const p=promoteFarolRelay(canonical());let s=bootPreviewRuntimeAtRoom(p,'farol_interior',{skipBootEvents:true});
  s={...s,variables:{...s.variables,var_signal_stage:2,var_farol_relay:1,var_trial_active:0}};
  s=finish(runPreviewRuntimeEvent(s,'farol_relay_restore'));expect(s.variables.var_farol_relay).toBe(2);
  s={...s,variables:{...s.variables,var_signal_stage:1,var_farol_relay:2}};s=finish(runPreviewRuntimeEvent(s,'farol_relay_restore'));expect(s.variables.var_farol_relay).toBe(0);
  expect(p.events.find(e=>e.name==='farol_relay_restore').steps.map(s=>s.command)).toContain('call_procedure showcase_trial_watchdog');
 });
 it('preserves approved geometry, existing actors, HUDs and all other scenes and exports state changes',()=>{
  const before=canonical(),p=promoteFarolRelay(before);expect(before).toEqual(canonical());expect(promoteFarolRelay(p)).toEqual(p);
  expect(p.actors.filter(a=>a.id!==r.actor)).toEqual(before.actors.filter(a=>a.id!==r.actor));expect(p.settings).toEqual(before.settings);
  for(const key of ['rooms','scenas']){expect(p[key].filter(a=>a.name!=='farol_interior')).toEqual(before[key].filter(a=>a.name!=='farol_interior'));const old=before[key].find(a=>a.name==='farol_interior'),revised=p[key].find(a=>a.name==='farol_interior');for(const field of ['backgroundAssetName','collisionTypes','collisions','tilemap','tileLayers','width','height'])expect(revised[field]).toEqual(old[field]);}
  const ex=buildEngineExportProjectContract(p).topdown_project;expect(ex.rooms.find(s=>s.name==='farol_interior').on_restore).toEqual(expect.arrayContaining([expect.objectContaining({op:'set_actor_sprite'})]));
 });
});
