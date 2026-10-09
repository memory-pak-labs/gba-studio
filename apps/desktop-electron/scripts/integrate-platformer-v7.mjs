import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promotePlatformerV7,PLATFORMER_V7_BG} from './promote-platformer-v7.mjs';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const visual='/Users/example/Pictures/Assets Exemplo/plataforma';
const recovered=path.join(visual,'plataforma-gba-v6-candidate/atores-recuperados');
const evidence=path.join(visual,'plataforma-gba-v7-candidate/integracao');
await mkdir(evidence,{recursive:true});
const prepared=path.join(evidence,'assets');await mkdir(prepared,{recursive:true});
const sources={player:Array.from({length:8},(_,i)=>`player-0${i}.png`),
 crab:['crab-00.png','crab-01.png'],moth:['moth-00.png','moth-01.png'],
 slime:['slime-00.png','slime-01.png'],rock:['rock-00.png','rock-01.png'],
 npc:['npc.png'],checkpoint:['checkpoint.png'],signpost:['signpost.png']};
const records=[];
for(const [kind,frames] of Object.entries(sources)){
 const destination=path.join(prepared,`penedos-v7-${kind}.png`);
 if(frames.length===1) await copyFile(path.join(recovered,frames[0]),destination);
 else if(!existsSync(destination)) execFileSync('/opt/homebrew/bin/ffmpeg',['-v','error','-n',...frames.flatMap(f=>['-i',path.join(recovered,f)]),
  '-filter_complex',`${frames.map((_,i)=>`[${i}:v]`).join('')}hstack=inputs=${frames.length}[sheet]`,'-map','[sheet]',
  '-frames:v','1',destination]);
 records.push({kind:'sprites',name:path.basename(destination),source:destination,
  sha256:createHash('sha256').update(await readFile(destination)).digest('hex')});
}
const bgSource=path.join(visual,'plataforma-gba-v7-candidate/bg-1288x160.png');
const bg=path.join(prepared,PLATFORMER_V7_BG);
// Lossless RGB -> RGBA container conversion; no resize, filtering or palette reduction.
execFileSync('/opt/homebrew/bin/ffmpeg',['-v','error','-y','-i',bgSource,'-pix_fmt','rgba','-frames:v','1',bg]);
records.push({kind:'backgrounds',name:PLATFORMER_V7_BG,source:bg,sha256:createHash('sha256').update(await readFile(bg)).digest('hex')});
const projects=['default-assets/templates/exemplo-gba/exemplo-gba.gba-project','fixtures/exemplo-gba-visuals/exemplo-gba-visuals.gba-project'].filter(p=>existsSync(path.join(app,p)));
for(const [i,relative] of projects.entries()){
 const target=path.join(app,relative), original=await readFile(target,'utf8');
 if(!existsSync(path.join(evidence,`before-${i}.gba-project`))) await writeFile(path.join(evidence,`before-${i}.gba-project`),original,{flag:'wx'});
 const next=promotePlatformerV7(JSON.parse(original));
 for(const record of records){
  const dir=path.join(path.dirname(target),'Assets',record.kind);await mkdir(dir,{recursive:true});
  await copyFile(record.source,path.join(dir,record.name));
  const asset=next.assets.find(a=>a.name===record.name);
  asset.metadata.sourceSha256=record.sha256;
  asset.metadata.provenance='User-approved platformer v7 background and recovered actors; integration authorized in conversation';
 }
 await writeFile(target,JSON.stringify(next,null,2)+'\n');
}
await writeFile(path.join(evidence,'manifest.json'),JSON.stringify({projects,assets:records,status:'integrated-awaiting-runtime-validation'},null,2)+'\n');
console.log('Integrated approved platformer v7 into '+projects.join(', ')+'. Backups: '+evidence);
