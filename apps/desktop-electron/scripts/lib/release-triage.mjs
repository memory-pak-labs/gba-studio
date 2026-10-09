import {createHash} from 'node:crypto';
export const CATEGORIES=['bloqueia_lancamento','revisar','adiar','informativo'];
export const sha256=value=>createHash('sha256').update(value).digest('hex');
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=8192;
const fail=()=>{throw Error('invalid-evidence');};
export function importEvidence(kind,data,origin){
 if(!data||typeof data!=='object'||!text(origin?.path)||!text(origin?.sha256))fail();
 const records=[];
 const add=(code,subject,severity,message,extra={})=>records.push({kind,code,subject,severity,message,build:origin.build??'unknown',origin,...extra});
 if(kind==='command'){
  if(data.schema!==1||!text(data.command)||!Number.isSafeInteger(data.exitCode))fail();
  add('command-exit',data.command,data.exitCode===0?'info':'error',`exitCode=${data.exitCode}`);
 }else if(kind==='vitest'){
  if(typeof data.success!=='boolean'||!Array.isArray(data.testResults))fail();
  for(const suite of data.testResults){
   if(!text(suite.name)||!['passed','failed','pending','skipped'].includes(suite.status)||!Array.isArray(suite.assertionResults))fail();
   let failures=0;
   for(const a of suite.assertionResults){
    if(!text(a.fullName)||!['passed','failed','pending','skipped','todo','disabled'].includes(a.status))fail();
    if(a.status==='failed'){failures++;add('test-failed',`${suite.name} :: ${a.fullName}`,'error','Teste falhou.');}
    else if(a.status!=='passed')add('test-not-run',`${suite.name} :: ${a.fullName}`,'warning','Teste não executado.');
   }
   if(suite.status==='failed'&&!failures)add('suite-failed',suite.name,'error','Suíte falhou sem assertion falha (carregamento/infraestrutura).');
  }
  if(!data.success&&!records.some(r=>r.severity==='error'))add('test-run-failed','vitest','error','Execução global falhou.');
  if(!data.testResults.length)add('test-coverage-empty','vitest','warning','Relatório sem suítes; cobertura ausente.');
  if(!records.length)add('tests-passed','vitest','info','Nenhuma falha relatada neste arquivo; não representa gate completo.');
 }else if(kind==='readiness'){
  if(!['ready','blocked'].includes(data.status)||!Array.isArray(data.items))fail();
  for(const item of data.items){
   if(!text(item.area)||!text(item.status)||typeof item.blocking!=='boolean'||!Array.isArray(item.missing)||item.missing.some(v=>!text(v)))fail();
   const ready=item.status==='pronto para projeto real';
   add('readiness-item',item.area,item.blocking&&!ready?'error':!ready||item.missing.length?'warning':'info',`${item.status}; ${item.missing.join('; ')}`);
  }
  if(!data.items.length)add('readiness-empty','readiness','warning','Relatório de prontidão sem itens.');
  if(data.status==='blocked'&&!records.some(r=>r.severity==='error'))add('readiness-blocked','readiness','error','Relatório de origem bloqueado.');
 }else if(kind==='diagnostics'){
  if(data.schema!==1||!Array.isArray(data.diagnostics))fail();
  for(const d of data.diagnostics){if(!text(d.code)||!text(d.message)||!['error','warning','info'].includes(d.severity))fail();add(d.code,d.subject??d.code,d.severity,d.message);}
  if(!records.length)add('no-diagnostics','assets','info','Nenhum diagnóstico informado; cobertura não inferida.');
 }else if(kind==='gameplay'){
  if(data.schema!==1||typeof data.reproduced!=='boolean'||!Array.isArray(data.findings)||!text(data.identity?.romSha256)||!data.coverage)fail();
  const build=data.identity.romSha256;
  for(const f of data.findings){if(!text(f.code)||!Number.isSafeInteger(f.frame)||f.frame<0||!['suspected','confirmed-invariant'].includes(f.status))fail();
   add(f.code,`${data.scene??'scene'}:${f.frame}`,f.status==='confirmed-invariant'&&data.reproduced?'error':'warning',f.status,{build,frame:f.frame});}
  if(!data.reproduced||data.executionError)add('replay-inconclusive','replay','warning','Reprodução inconclusiva.',{build});
  for(const key of ['bounds','collision','objective']){
   if(!['configured','not-configured'].includes(data.coverage[key]))fail();
   if(data.coverage[key]==='not-configured')add('coverage-missing',key,'warning','Oráculo não configurado.',{build});
  }
  if(!records.length)add('replay-observation','replay','info','Replay reproduzido sem achados nas regras configuradas.',{build});
 }else fail();
 if(records.length>10000)throw Error('record-limit');
 return records;
}
export function triageRecords(records){
 if(!Array.isArray(records)||records.length>10000)throw Error('record-limit');
 const grouped=new Map();
 for(const r of records){
  const fingerprint=JSON.stringify([r.kind,r.build,r.build==='unknown'?r.origin.sha256:null,r.code,r.subject,r.severity,r.message]);
  const id=sha256(fingerprint);
  const existing=grouped.get(id);
  if(existing){existing.occurrences.push(r.origin);continue;}
  grouped.set(id,{id,kind:r.kind,build:r.build,code:r.code,subject:r.subject,message:r.message,severity:r.severity,
   suggestion:r.severity==='error'?'bloqueia_lancamento':r.severity==='warning'?'revisar':'informativo',
   objectiveBlocker:r.severity==='error',finalDecision:null,duplicateStatus:'exact-match-only',occurrences:[r.origin]});
 }
 return {schema:1,policyVersion:1,releaseApproval:false,decisionStatus:'human-review-required',
  items:[...grouped.values()].sort((a,b)=>CATEGORIES.indexOf(a.suggestion)-CATEGORIES.indexOf(b.suggestion)||a.id.localeCompare(b.id))};
}
export function applyReview(report,decisions){
 if(!Array.isArray(decisions)||decisions.length>report.items.length)throw Error('invalid-review');
 const result=structuredClone(report),seen=new Set();
 for(const d of decisions){const item=result.items.find(i=>i.id===d.id);
  if(!item||seen.has(d.id)||!CATEGORIES.includes(d.decision)||!text(d.reason))throw Error('invalid-review');
  seen.add(d.id);item.finalDecision={decision:d.decision,reason:d.reason};
 }
 return result;
}
export function renderTriage(report){
 const esc=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' ').replaceAll('<','&lt;');
 return ['# Triagem de lançamento','', '**Decisão humana necessária. Este relatório não aprova lançamento.**','',
  '| ID | Sugestão local | Sugestão Jev | Decisão humana | Origem / ocorrência |', '|---|---|---|---|---|',
  ...report.items.map(i=>`| ${i.id} | ${i.suggestion} | ${i.jev?.suggestion??'—'} | ${esc(i.finalDecision?`${i.finalDecision.decision}: ${i.finalDecision.reason}`:'Pendente')} | ${esc(i.subject)} · ${i.occurrences.length} |`),
  '',...report.items.flatMap(i=>[`## ${i.id}`,``,esc(i.message),``,...i.occurrences.map(o=>`- ${esc(o.path)} (SHA-256 ${o.sha256}; build ${esc(i.build)})`),'']),
  'Duplicatas são agrupadas apenas por igualdade de categoria, build, código, alvo, severidade e mensagem. Conferir as origens antes de consolidar ocorrências.',''].join('\n');
}
