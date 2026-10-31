import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {parseGBAProjectFile} from '../shared/projectFile.js';
import {buildEngineExportProjectContract} from './exportEngineProject.js';
it('keeps the approved Gallery gate separate and restores its persistent puzzle',()=>{
 const p=parseGBAProjectFile(readFileSync(new URL('../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url),'utf8')).data;
 const e=buildEngineExportProjectContract(p).topdown_project!;
 const r=e.rooms.find(r=>r.name==='galeria_das_mares')!;
 expect([r.width_tiles,r.height_tiles]).toEqual([48,32]);
 expect(r.on_restore?.length).toBeGreaterThan(0);
 expect(r.npcs?.some(n=>n.name==='Portão do arquivo')).toBe(true);
 expect(e.rooms.find(r=>r.name==='farol_interior')?.interactions?.length).toBeGreaterThan(0);
 const sync=e.scripts!.find(s=>s.name==='gallery_sync')!.script;
 expect(sync).toContainEqual(expect.objectContaining({op:'visibility',shape:'circle'}));
},30000);
