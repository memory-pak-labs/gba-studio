import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {importEvidence,triageRecords,applyReview,renderTriage,sha256} from './lib/release-triage.mjs';
import {createReleaseTriageProvider} from './lib/release-triage-provider.mjs';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++){
 if(args[i]==='--jev'){options.jev=true;continue;}
 if(!['--manifest','--out','--review'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error('Use --manifest JSON --out NOVO_DIRETORIO [--review JSON] [--jev].');
 options[args[i].slice(2)]=args[++i];
}
if(!options.manifest||!options.out)throw Error('Informe manifest e diretório de saída novo.');
async function readJSON(file,max=32*1024*1024){const s=await stat(file);if(!s.isFile()||s.size>max)throw Error('input-size');const bytes=await readFile(file);return {value:JSON.parse(bytes.toString('utf8')),sha256:sha256(bytes)};}
const manifestPath=resolve(options.manifest),manifest=await readJSON(manifestPath,65536);
if(manifest.value.schema!==1||!Array.isArray(manifest.value.sources)||!manifest.value.sources.length||manifest.value.sources.length>20)throw Error('invalid-manifest');
const records=[],sources=[];
for(const source of manifest.value.sources){
 if(typeof source.path!=='string'||typeof source.kind!=='string'||source.build!==undefined&&(typeof source.build!=='string'||source.build.length>128))throw Error('invalid-source');
 const path=resolve(dirname(manifestPath),source.path),input=await readJSON(path);
 const origin={path,sha256:input.sha256,build:source.build??'unknown'};sources.push({...origin,kind:source.kind});records.push(...importEvidence(source.kind,input.value,origin));
}
let report=triageRecords(records);
report.manifestSha256=manifest.sha256;report.sources=sources;report.evidenceSha256=sha256(JSON.stringify(sources));
if(options.review){const review=await readJSON(resolve(options.review),65536);if(review.value.schema!==1||(review.value.manifestSha256!==manifest.sha256||review.value.evidenceSha256!==report.evidenceSha256))throw Error('review-manifest-mismatch');report=applyReview(report,review.value.decisions);report.reviewSha256=review.sha256;}
const out=resolve(options.out);await mkdir(out,{mode:0o700});
const provider=createReleaseTriageProvider({enabled:Boolean(options.jev)&&process.env.GBA_STUDIO_JEV_ENABLED==='1',apiKey:process.env.TYPESAFE_API_KEY,model:process.env.GBA_STUDIO_JEV_MODEL??'jev-1.13.0'});
for(const item of report.items)item.jev=await provider.suggest(item);
report.apiCalls=report.items.reduce((n,i)=>n+i.jev.calls,0);
await writeFile(join(out,'triage.json'),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
await writeFile(join(out,'triage.md'),renderTriage(report),{flag:'wx',mode:0o600});
await writeFile(join(out,'review-template.json'),JSON.stringify({schema:1,manifestSha256:report.manifestSha256,evidenceSha256:report.evidenceSha256,decisions:[]},null,2),{flag:'wx',mode:0o600});
console.log(JSON.stringify({out,items:report.items.length,objectiveBlockers:report.items.filter(i=>i.objectiveBlocker).length,releaseApproval:false,apiCalls:report.apiCalls}));
