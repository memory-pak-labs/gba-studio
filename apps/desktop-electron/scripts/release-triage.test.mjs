import {expect,it} from 'vitest';
import {importEvidence,triageRecords,applyReview} from './lib/release-triage.mjs';
const origin={path:'/local/evidence.json',sha256:'a'.repeat(64),build:'build-1'};
it('preserves failed assertions and suite load errors',()=>{
 const records=importEvidence('vitest',{success:false,testResults:[{name:'suite',status:'failed',assertionResults:[{fullName:'fails',status:'failed'}]},{name:'load',status:'failed',message:'load error',assertionResults:[]}]},origin);
 expect(records).toHaveLength(2);expect(triageRecords(records).items.every(i=>i.suggestion==='bloqueia_lancamento')).toBe(true);
});
it('does not convert readiness or replay success into release approval',()=>{
 const records=importEvidence('readiness',{status:'ready',items:[{area:'assets',blocking:false,status:'funcional mas limitado',missing:['visual check']}]},origin);
 const report=triageRecords(records);expect(report.releaseApproval).toBe(false);expect(report.items[0].suggestion).toBe('revisar');expect(report.items[0].finalDecision).toBe(null);
});
it('groups only exact occurrences in the same build and retains sources',()=>{
 const records=importEvidence('command',{schema:1,command:'build',exitCode:1},origin);
 expect(triageRecords([...records,...records]).items[0].occurrences).toHaveLength(2);
 expect(triageRecords([...records,...records.map(r=>({...r,build:'different'}))]).items).toHaveLength(2);
});
it('keeps a reproduced suspicion distinct from a confirmed invariant',()=>{
 const records=importEvidence('gameplay',{schema:1,reproduced:true,identity:{romSha256:'b'.repeat(64)},findings:[{code:'player-not-moving',frame:90,status:'suspected'},{code:'player-bounds',frame:2,status:'confirmed-invariant'}],coverage:{bounds:'configured',collision:'not-configured',objective:'not-configured'}},origin);
 const report=triageRecords(records);expect(report.items.some(i=>i.suggestion==='bloqueia_lancamento')).toBe(true);expect(report.items.some(i=>i.code==='player-not-moving'&&i.suggestion==='revisar')).toBe(true);
});
it('fails closed on unsupported or malformed reports',()=>{
 for(const [kind,value] of [['wat',{}],['vitest',{}],['command',{exitCode:0}],['gameplay',{}],['diagnostics',{schema:1,diagnostics:[{severity:'unknown'}]}]])expect(()=>importEvidence(kind,value,origin)).toThrow();
});
it('requires an explicit reason and item ID for a human decision without clearing blockers',()=>{
 const report=triageRecords(importEvidence('command',{schema:1,command:'build',exitCode:1},origin));
 expect(()=>applyReview(report,[{id:'unknown',decision:'adiar',reason:'later'}])).toThrow();
 expect(()=>applyReview(report,[{id:report.items[0].id,decision:'adiar',reason:''}])).toThrow();
 const revised=applyReview(report,[{id:report.items[0].id,decision:'adiar',reason:'Revisar em reunião'}]);
 expect(revised.items[0].finalDecision.decision).toBe('adiar');expect(revised.items[0].suggestion).toBe('bloqueia_lancamento');expect(revised.releaseApproval).toBe(false);
});
it('does not consolidate different evidence when build identity is unknown',()=>{
 const a=importEvidence('command',{schema:1,command:'build',exitCode:1},{...origin,build:'unknown'});
 const b=importEvidence('command',{schema:1,command:'build',exitCode:1},{...origin,build:'unknown',sha256:'b'.repeat(64)});
 expect(triageRecords([...a,...b]).items).toHaveLength(2);
});
it('treats an empty successful test report as missing coverage',()=>{
 const report=triageRecords(importEvidence('vitest',{success:true,testResults:[]},origin));
 expect(report.items[0].suggestion).toBe('revisar');
});
