import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {parseGBAProjectFile} from '../shared/projectFile.js';
import {buildEngineExportProjectContract} from './exportEngineProject.js';

it('exports the approved optional tide room and its saved inventory upgrade',()=>{
 const p=parseGBAProjectFile(readFileSync(new URL('../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url),'utf8')).data;
 expect((p.rooms as Array<{name:string}>).find(r=>r.name==='sala_mare_vazante')).toMatchObject({width:48,height:32,sceneType:'topdown',backgroundAssetName:'tide-room.png',showcase:{lane:'optional'}});
 const names=(p.variables as Array<{name:string}>).map(v=>v.name);
 expect(names).toHaveLength(64);expect(names.indexOf('var_stabilizer')).toBe(5);expect(names.indexOf('var_tide_state')).toBe(63);
 const exported=buildEngineExportProjectContract(p),rooms=exported.topdown_project!.rooms;
 const tide=rooms.find(r=>r.name==='sala_mare_vazante')!,gallery=rooms.find(r=>r.name==='galeria_das_mares')!;
 expect(tide.width_tiles).toBe(48);expect(tide.height_tiles).toBe(32);
 expect(tide.on_restore).toContainEqual({op:'set_variable',variable:63,value:2});
 expect(gallery.portals??[]).toEqual([]);
 const reset=exported.menu_project!.scripts!.find(s=>s.name==='titulo_novo_jogo')!.script;
 expect(reset).toContainEqual({op:'set_variable',variable:63,value:0});
 const inventory=exported.menu_project!.screens.find(s=>s.name==='inventario_modulos_2')!;
 expect(inventory.items).toContainEqual(expect.objectContaining({label:'ESTABILIZADOR',binding:{source:'variable',index:5,format:'on_off'}}));
 const wind=exported.shmup_project!.scripts!.find(s=>s.name==='tide_wind_tick')!;
 expect(wind.script).toContainEqual({op:'move_actor_relative',actor:-1,x:0,y:1});
},30000);
