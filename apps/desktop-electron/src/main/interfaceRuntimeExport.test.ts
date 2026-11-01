import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {buildEngineExportProjectContract} from './exportEngineProject.js';
it('exports a Custom scene through its native TopDown adapter with the interface binding intact',()=>{
 const p=JSON.parse(readFileSync(new URL('../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url),'utf8'));
 for(const key of ['rooms','scenas']){const scene=p[key].find((r:{name:string})=>r.name==='farol_interior');scene.sceneType='custom';scene.runtime={type:'custom',config:{}};}
 const result=buildEngineExportProjectContract(p);
 expect(result.scene_contracts.find(s=>s.name==='farol_interior')).toMatchObject({runtime_profile:'topdown'});
 expect(result.topdown_project?.rooms.find(s=>s.name==='farol_interior')).toMatchObject({scene_type:'custom',runtime_profile:'topdown'});
 expect(result.topdown_project?.dialogue_ui?.hud_scene_bindings).toContainEqual({scene_name:'farol_interior',preset_id:'hud-farol-trial'});
});
it('keeps native RPG cursor and unavailable-action resources when changing the interface composition',()=>{
 const p=JSON.parse(readFileSync(new URL('../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url),'utf8'));
 for(const key of ['rooms','scenas'])p[key].find((r:{name:string})=>r.name==='guardiao_rele').hudPresetId='hud-default';
 expect(()=>buildEngineExportProjectContract(p)).not.toThrow();
 const c=buildEngineExportProjectContract(p);
 expect(c.battle_rpg_project?.encounters.find(s=>s.name==='guardiao_rele')?.presentation?.disabled_escape).toBeDefined();
});
it('exports only bound interface layouts so unused catalog gauges do not require resident images',()=>{
 const p=JSON.parse(readFileSync(new URL('../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url),'utf8'));
 for(const key of ['rooms','scenas'])for(const r of p[key]){r.hudPresetId='hud-default';const config=r.runtime?.config;if(config)delete config.hudPresetId;if(r.sceneType==='menu'&&config){delete config.hudMode;config.hudPresetId='hud-default';for(const screen of config.screens??[]){delete screen.hudMode;screen.hudPresetId='hud-default';}}}
 const c=buildEngineExportProjectContract(p);
 expect(c.topdown_project?.dialogue_ui?.hud_layouts?.map(h=>h.id)).toEqual(['hud-default']);
});
it('rejects packs that would silently hide interfaces authored for Cutscene or Visual Novel',async()=>{
 const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises');const path=await import('node:path');const os=await import('node:os');
 const {prepareEngineProjectExport}=await import('./exportEngineProject.js');const {writeEngineSchemaExport}=await import('./engineProjectExport.js');
 const root=await mkdtemp(path.join(os.tmpdir(),'gba-scene-interface-pack-'));
 try{const p=JSON.parse(readFileSync(new URL('../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url),'utf8'));
 for(const key of ['rooms','scenas'])p[key].find((r:{name:string})=>r.name==='conselho_guardia').hudPresetId='hud-default';
 const pack=path.join(root,'pack');await mkdir(pack);await writeFile(path.join(pack,'enginepack.json'),JSON.stringify({capabilities:{engine_sdk:[]}}));
 const prepared=prepareEngineProjectExport(p,{enginePackPath:pack}).generated!;
 await expect(writeEngineSchemaExport({destination:path.join(root,'out'),prepared,assetcPath:path.join(pack,'tools/assetc')})).rejects.toThrow('interfaces de cena');
 }finally{await rm(root,{recursive:true,force:true});}
});

it('keeps the implicit built-in default layout when the stored catalog contains only custom presets',async()=>{
 const {engineUsedHudPresetIDs}=await import('../shared/engineProjectExport.js');
 const data={scenas:[{name:'start'},{name:'standard',hudPresetId:'hud-default'}],settings:{hudPresetId:'hud-default',hudPresets:[{id:'unused',name:'Unused',mode:'advanced',components:[]}]}};
 expect([...engineUsedHudPresetIDs(data)]).toEqual(['hud-default']);
});
