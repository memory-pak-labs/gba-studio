import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {parseGBAProjectFile} from '../shared/projectFile.js';
import {buildEngineExportProjectContract} from './exportEngineProject.js';
import {applyApprovedMenuScenes} from '../../scripts/approved-menu-scenes-project.mjs';

it('exports readonly score fields and L/R pages without adding selectable statistics or progress slots',()=>{
 const input=parseGBAProjectFile(readFileSync(new URL('../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url),'utf8')).data;
 const project=applyApprovedMenuScenes(input,true),contract=buildEngineExportProjectContract(project);
 const menus=contract.menu_project!.screens,index=(name:string)=>menus.findIndex(s=>s.name===name);
 const result=menus[index('corrida_resultados')];
 expect(result.items).toHaveLength(3);
 expect(result.hud_bindings?.map(b=>b.binding?.index)).toEqual([4,3,6,5]);
 expect(result.items[2]!.on_select).toContainEqual(expect.objectContaining({op:'warp_runtime',runtime:'world_map'}));
 expect(result.items[2]!.on_select?.some(command=>command.op==='call_script')).toBe(false);
 const first=menus[index('inventario')],second=menus[index('inventario_modulos_2')],tools=menus[index('inventario_ferramentas')];
 expect(first.next_page_screen).toBe(index('inventario_modulos_2'));
 expect(second.next_page_screen).toBe(index('inventario_ferramentas'));
 expect(tools.next_page_screen).toBe(index('inventario'));
 expect(first.hud_bindings).toEqual([{slot:3,selected_item:true}]);
});
