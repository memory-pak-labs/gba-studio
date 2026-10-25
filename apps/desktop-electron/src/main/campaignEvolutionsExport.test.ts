import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {parseGBAProjectFile} from '../shared/projectFile.js';
import {buildEngineExportProjectContract} from './exportEngineProject.js';

it('keeps Gallery overview links separate from the authored A interaction and exit trigger',()=>{
 const p=parseGBAProjectFile(readFileSync(new URL('../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url),'utf8')).data;
 const rooms=buildEngineExportProjectContract(p).topdown_project!.rooms;
 const farol=rooms.find(r=>r.name==='farol_interior')!,gallery=rooms.find(r=>r.name==='galeria_das_mares')!,galleryIndex=rooms.indexOf(gallery);
 expect(farol.portals?.some(portal=>portal.target_room===galleryIndex)).toBe(false);
 expect(gallery.portals??[]).toEqual([]);
 expect(farol.interactions).toContainEqual(expect.objectContaining({area:{x:224,y:144,width:8,height:32},script:expect.arrayContaining([expect.objectContaining({op:'warp',room:galleryIndex})])}));
 expect(farol.interactions!.find(t=>t.area.x===224)!.script.some(c=>c.op==='visual_effect')).toBe(false);
 expect(gallery.triggers).toContainEqual(expect.objectContaining({on_enter:expect.arrayContaining([expect.objectContaining({op:'warp',room:rooms.indexOf(farol)})])}));
});

it('exports native resets for the three new persisted variables',()=>{
 const p=parseGBAProjectFile(readFileSync(new URL('../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url),'utf8')).data;
 const menu=buildEngineExportProjectContract(p).menu_project!;
 const script=menu.scripts!.find(s=>s.name==='titulo_novo_jogo')!.script;
 for(const name of ['var_gallery_gate','var_gallery_record','var_telescope_alignment']){
  const index=(p.variables as Array<{name:string}>).findIndex(v=>v.name===name);
  expect(script).toContainEqual({op:'set_variable',variable:index,value:0});
 }
});
