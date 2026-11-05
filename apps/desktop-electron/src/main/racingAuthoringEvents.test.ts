import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {buildEngineExportProjectContract} from './exportEngineProject.js';
import {normalizeRacingSceneConfig} from '../shared/sceneTypeProfiles.js';
import {runtimeEventStates} from '../shared/sceneEventStates.js';
import {resolveEventBindingCapabilities} from '../shared/eventBindingCapabilities.js';
import {bindEventToTargetInProject,renameEventInProject,removeEventFromProject,deriveEventsWorkspacePresentation} from '../shared/eventsWorkspace.js';
function source(){return JSON.parse(readFileSync(new URL('../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url),'utf8'));}
it('preserves checkpoint events through normalization, binding, rename and removal',()=>{
 const p=source();const scene=p.scenas.find((s:any)=>s.name==='circuito_final');scene.runtime.config.topdownTrack.checkpoints[1].eventName='passed';
 expect(normalizeRacingSceneConfig(scene.runtime.config).topdownTrack?.checkpoints[1]).toMatchObject({eventName:'passed'});
 const state=runtimeEventStates(scene).find(s=>s.eventName==='passed')!;expect(state).toBeDefined();
 p.rooms=structuredClone(p.scenas);p.events.push({id:'race-pass-test',name:'passed',category:'Cena',steps:[{command:'set_variable var_stabilizer 1'}]});
 const view=deriveEventsWorkspacePresentation(p);expect(view.graphNodes.find(e=>e.eventName==='passed')).toMatchObject({isUnlinked:false});
 const renamed=renameEventInProject(p,'race-pass-test','gate_passed');
 for(const key of ['rooms','scenas'])expect(runtimeEventStates((renamed[key] as any[]).find(s=>s.name==='circuito_final')).some(s=>s.eventName==='gate_passed')).toBe(true);
 const removed=removeEventFromProject(renamed,'race-pass-test');expect(runtimeEventStates((removed.scenas as any[]).find(s=>s.name==='circuito_final')).find(s=>s.bindingKey===state.bindingKey)?.eventName).toBeNull();
});
it('exports validated checkpoint and lap events without changing geometry, speed or existing result bindings',()=>{
 const p=source();p.events.push({id:'pass-test',name:'gate_passed',category:'Cena',steps:[{command:'set_variable var_stabilizer 1'}]},{id:'lap-test',name:'lap_done',category:'Cena',steps:[{command:'set_variable var_stabilizer 2'}]});
 for(const key of ['rooms','scenas']){const s=p[key].find((s:any)=>s.name==='circuito_final');s.runtime.config.topdownTrack.checkpoints[1].eventName='gate_passed';s.eventBindings.onLapComplete='lap_done';}
 const c=buildEngineExportProjectContract(p);const room=c.racing_project!.rooms.find(r=>r.name==='circuito_final')!;
 expect(room.topdown_track?.checkpoints[1]).toMatchObject({x:432,y:256,width:72,height:16,on_pass:[{op:'set_variable',variable:5,value:1}]});
 expect(room).toMatchObject({on_lap_complete:[{op:'set_variable',variable:5,value:2}],config:{rival_speed_x256_per_second:105*256}});
 expect(room.on_victory).toBeDefined();expect(room.on_defeat).toBeDefined();
});
it('exposes lap completion in the existing scene event slots and binds its real event',()=>{
 expect(resolveEventBindingCapabilities({targetKind:'room',sceneType:'racing'}).map(s=>s.bindingKey)).toContain('onLapComplete');
 const p=source();p.events.push({id:'lap-test',name:'lap_done',category:'Cena',steps:[]});const next=bindEventToTargetInProject(p,'lap-test',{targetKind:'room',targetName:'circuito_final',bindingKey:'onLapComplete'});
 expect((next.scenas as any[]).find(s=>s.name==='circuito_final').eventBindings.onLapComplete).toBe('lap_done');
});

it('requires a Pack that executes racing progress hooks instead of silently discarding them',async()=>{
 const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises');const os=await import('node:os');const path=await import('node:path');const {writeEngineSchemaExport}=await import('./engineProjectExport.js');
 const root=await mkdtemp(path.join(os.tmpdir(),'racing-events-pack-'));
 try{const pack=path.join(root,'pack');await mkdir(pack);await writeFile(path.join(pack,'enginepack.json'),JSON.stringify({capabilities:{engine_sdk:[]}}));
 const prepared={assets:[],contract:{template_dir:path.join(pack,'templates/exported_racing'),racing_project:{rooms:[{on_lap_complete:[{op:'stop'}]}]}}} as unknown as Parameters<typeof writeEngineSchemaExport>[0]['prepared'];
 await expect(writeEngineSchemaExport({destination:path.join(root,'out'),prepared,assetcPath:path.join(pack,'tools/assetc')})).rejects.toThrow('eventos de progresso da corrida');
 }finally{await rm(root,{recursive:true,force:true});}
});
