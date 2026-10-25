import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deepenExampleCampaign, preserveCoastDepthCampaign } from './coast-depth-project.mjs';
import { buildEngineExportProjectContract } from '../src/main/exportEngineProject.js';
import { validateGBAProjectMigrationContract } from '../../../packages/project-contract/src/index.ts';
import { bootPreviewRuntimeAtRoom, runPreviewRuntimeEvent, dispatchPreviewRuntimeAction, tickPreviewRuntime, rebootPreviewRuntimePreservingSaves } from '../src/shared/previewRuntime.js';
import { nativeEventStatesByRuntime } from './lib/native-ui-diagnostics.mjs';
import { promoteExemploGBAVerticeCampaign } from './vertice-showcase-project.mjs';
import { renameRoomInProject } from '../src/shared/roomsWorkspace.js';

const source = () => JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));
function manifest(p) {
  if(p.events.some(e=>e.name==='coast_port_clock_tick'))return {assets:structuredClone(p.assets.filter(a=>a.id?.startsWith('coast-')))};
  return { assets: [['coast-freight-lift',64,32,1,'penedos-approved-checkpoint.png'],['coast-port-lantern',16,32,2,'porto-nara-animations48.png'],...['near','mid','far'].map((depth,i)=>['coast-valve-'+depth,32>>i,64>>i,2,'dungeon-approved-cell-near.png'])].map(([name,w,h,count,ref])=>({
    id:name,name:name+'.png',kind:'Sprite',metadata:{...structuredClone(p.assets.find(a=>a.name===ref).metadata),source:'Assets/sprites/'+name+'.png',frameWidth:w,frameHeight:h,frameCount:count,reviewStatus:'candidate',approved:false}
  })) };
}
function finish(state) {
  for(let i=0;i<1000;i++) {
    if(state.activeDialogue) state=dispatchPreviewRuntimeAction(state,'action');
    else if(!state.scriptWaitFrames&&!state.scriptContinuations.length&&!state.scriptQueue.length) return state;
    state=tickPreviewRuntime(state,1000/60);
  }
  throw Error('Event must finish');
}
const run=(s,n)=>finish(runPreviewRuntimeEvent(s,n));

describe('coastal campaign depth',()=>{
  it('exports every coastal callback safely after renaming its scene',()=>{
    const p=source(),porto=p.rooms.find(r=>r.name==='porto_lumen');
    const renamed=renameRoomInProject(p,porto.id,'porto_costeiro');
    const c=buildEngineExportProjectContract(renamed);
    expect((c.export_warnings??[]).filter(w=>!w.startsWith('VRAM:')&&!w.startsWith('Palette:'))).toEqual([]);
  });
  it('restores a saved midnight without replacing it with the first evening minute',()=>{
    let state=bootPreviewRuntimeAtRoom(source(),'porto_lumen',{skipBootEvents:true});
    state={...state,variables:{...state.variables,var_coast_minute:0,var_coast_clock_ready:1}};
    state=run(state,'coast_restore_porto_lumen');
    expect(state.variables.var_coast_minute).toBe(0);
    expect(state.hud.gameClock.currentMinute).toBe(0);
  });
  it('initializes the harbor clock when running its scene directly with native zeroed variables',()=>{
    let state=bootPreviewRuntimeAtRoom(source(),'porto_lumen',{skipBootEvents:true});
    state={...state,variables:{...state.variables,var_coast_minute:0,var_coast_clock_ready:0}};
    state=run(state,'coast_restore_porto_lumen');
    expect(state.variables.var_coast_minute).toBe(1020);
    expect(state.variables.var_coast_clock_ready).toBe(1);
  });
  it('keeps all seven pause options aligned with the six visible book rows',()=>{
    const p=source(),menu=p.rooms.find(r=>r.name==='menu_start').runtime.config;
    const options=p.actors.filter(a=>a.roomName==='menu_start'&&a.menuActorRole==='option');
    expect(options.map(a=>a.menuItemID).sort()).toEqual(menu.items.map(i=>i.id).sort());
    expect(menu.hudListRows).toBe(6);
    for(const [i,item]of menu.items.entries()){
      const row=menu.items[i%menu.hudListRows];
      expect(item.clickBox).toEqual(row.clickBox);
      expect(options.find(a=>a.menuItemID===item.id).menuPositionPixels).toEqual({x:item.clickBox.x+2,y:item.clickBox.y+2});
    }
  });
  it('keeps the approved coastal extensions after full example regeneration',()=>{
    const before=source();
    expect(before.events.some(e=>e.name==='coast_port_clock_tick')).toBe(true);
    const regenerated=promoteExemploGBAVerticeCampaign(before);
    expect(validateGBAProjectMigrationContract(regenerated)).toEqual([]);
    const c=buildEngineExportProjectContract(regenerated);
    expect(c.isometric_project.rooms.find(r=>r.name==='arena_tatica').tactical.units).toHaveLength(4);
    expect(regenerated.actors.filter(a=>a.id.startsWith('coast-'))).toEqual(before.actors.filter(a=>a.id.startsWith('coast-')));
    expect(regenerated.variables.map(v=>v.name)).toEqual(before.variables.map(v=>v.name));
    expect(regenerated.rooms.find(r=>r.name==='galeria_das_mares').eventBindings.onRestore).toBe('coast_restore_galeria_das_mares');
  });
  it('reads the platformer event state from its own ELF symbol',()=>{
    expect(nativeEventStatesByRuntime([{name:'(anonymous namespace)::platformer_event_state',address:0x02001000,section:'.ewram_runtime_platformer'}])).toEqual({1:0x02001000});
  });
  it('requires visual approval to preserve new artwork through canonical regeneration',()=>{
    const before=source(),candidate=deepenExampleCampaign(before,manifest(before));
    expect(preserveCoastDepthCampaign({events:[]},before)).toBe(before);
    for(const a of candidate.assets.filter(a=>a.id?.startsWith('coast-')))a.metadata.approved=false;
    expect(()=>preserveCoastDepthCampaign(candidate,before)).toThrow(/visual approval/);
    for(const a of candidate.assets.filter(a=>a.id?.startsWith('coast-')))a.metadata.approved=true;
    const regenerated=preserveCoastDepthCampaign(candidate,before);
    expect(regenerated.actors.filter(a=>a.id.startsWith('coast-'))).toEqual(candidate.actors.filter(a=>a.id.startsWith('coast-')));
    expect(regenerated.variables).toEqual(candidate.variables);
    expect(regenerated.rooms.find(r=>r.name==='menu_start').runtime.config.items.some(i=>i.id==='load')).toBe(true);
  });
  it('is idempotent and preserves approved scenery, geometry, HUDs, variable slots and player art',()=>{
    const before=source(),snapshot=structuredClone(before),p=deepenExampleCampaign(before,manifest(before));
    expect(before).toEqual(snapshot);expect(deepenExampleCampaign(p,manifest(before))).toEqual(p);
    expect(p.settings.hudPresets).toEqual(before.settings.hudPresets);
    expect(p.variables.slice(0,before.variables.length)).toEqual(before.variables);
    expect(p.variables.length).toBeLessThanOrEqual(64);
    for(const key of ['rooms','scenas'])for(const old of before[key]){
      const r=p[key].find(r=>r.name===old.name);
      for(const field of ['width','height','backgroundAssetName','tilemap','tileLayers','collisions','collisionTypes','heightLevels','rampFlags','cameraBounds']) expect(r[field],old.name+': '+field).toEqual(old[field]);
    }
    for(const old of before.assets) expect(p.assets.find(a=>a.id===old.id)).toEqual(old.name==='tactical-compact-font-8x8.png'?{...old,metadata:{...old.metadata,streamFrames:true}}:old);
    for(const old of before.animations) expect(p.animations.find(a=>a.id===old.id)).toEqual(old);
    expect(p.actors.find(a=>a.id==='port-nara')).toEqual(before.actors.find(a=>a.id==='port-nara'));
  });
  it('exports two units per team, distinct ranges, a bound clock and scene audio envelopes',()=>{
    const before=source(),p=deepenExampleCampaign(before,manifest(before));
    expect(validateGBAProjectMigrationContract(p)).toEqual([]);
    const c=buildEngineExportProjectContract(p);
    const arena=c.isometric_project.rooms.find(r=>r.name==='arena_tatica').tactical;
    expect(arena.units).toHaveLength(4);
    expect(arena.units.filter(u=>u.team==='player')).toHaveLength(2);
    expect(new Set(arena.units.map(u=>u.attack_range)).size).toBeGreaterThan(1);
    const script=c.topdown_project.scripts.find(s=>s.name==='porto_ao_entrar').script;
    expect(script.some(s=>s.op==='start_game_clock'&&s.variable===p.variables.findIndex(v=>v.name==='var_coast_minute'))).toBe(true);
    expect(c.topdown_project.scripts.find(s=>s.name==='farol_interior_ao_entrar').script.some(s=>s.op==='fade_audio_volume'&&Number.isInteger(s.variable))).toBe(true);
    expect(p.actors.find(a=>a.id==='coast-freight-lift').collisionGroup).toBe(2);
    const panels=c.dungeon_crawler_project.rooms.find(r=>r.name==='usina_submersa').actors.filter(a=>/Admissão|Turbina|Saída/.test(a.name));
    expect(panels).toHaveLength(6);
    expect(panels.every(a=>a.wall_mounted)).toBe(true);
    for(const [kind,name,button]of [['topdown','porto_lumen','start'],['platformer','penedos_vento','start'],['isometric','arena_tatica','start'],['dungeon_crawler','usina_submersa','r']]){
      const r=c[kind+'_project'].rooms.find(r=>r.name===name);
      expect(r.on_restore?.some(s=>s.op==='attach_button_event'&&s.button===button),name+' menu after load').toBe(true);
    }
  });
  it('requires the valve sequence, saves progress, restores it and never grants the energy cell twice',()=>{
    const before=source(),p=deepenExampleCampaign(before,manifest(before));
    p.events.push({name:'test_load',steps:[{command:'load_game 0',isEnabled:true}]});
    let s=bootPreviewRuntimeAtRoom(p,'usina_submersa',{skipBootEvents:true});
    s=run(s,'coast_usina_b');expect(s.variables.var_coast_usina).toBe(0);
    s=run(s,'usina_abrir_combate');expect(s.currentRoom.name).toBe('usina_submersa');
    s=run(s,'coast_usina_a');expect(s.variables.var_coast_usina).toBe(1);
    s=run(rebootPreviewRuntimePreservingSaves(s),'test_load');expect(s.variables.var_coast_usina).toBe(1);
    s=run(s,'coast_usina_a');expect(s.variables.var_coast_usina).toBe(1);
    s=run(s,'coast_usina_b');s=run(s,'coast_usina_c');expect(s.variables.var_coast_usina).toBe(3);
    s=run(s,'usina_abrir_combate');expect(s.currentRoom.name).toBe('usina_combate');
    s=run(s,'usina_coletar_celula');s=run(s,'usina_coletar_celula');expect(s.inventory.usina_cell).toBe(1);
  });
});
