import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {normalizeExampleObjParts} from './normalize-example-obj-parts.mjs';
const target=new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url);
const backup='/Users/example/Pictures/Assets Exemplo/plataforma/plataforma-gba-v8-candidate/integracao/before-obj-normalization.gba-project';
const before=readFileSync(target,'utf8');
if(!existsSync(backup))writeFileSync(backup,before,{flag:'wx'});
writeFileSync(target,JSON.stringify(normalizeExampleObjParts(JSON.parse(before)),null,2)+'\n');
