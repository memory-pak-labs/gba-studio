import {it,expect,vi} from 'vitest';
import {createReleaseTriageProvider} from './lib/release-triage-provider.mjs';
const item={kind:'gameplay',severity:'warning',objectiveBlocker:false,suggestion:'revisar',occurrences:[{}],message:'private',subject:'/private/file'};
const answer=(choice='revisar',confidence=.9)=>({model:'test',answers:{triage:{type:'choice',choice,confidence,probabilities:{revisar:1,bloqueia_lancamento:0}}}});
it('does not send blockers and filters options and private data',async()=>{
 const fetcher=vi.fn(async()=>new Response(JSON.stringify(answer())));const p=createReleaseTriageProvider({enabled:true,apiKey:'key',fetcher,maxCalls:1});
 expect((await p.suggest({...item,objectiveBlocker:true,suggestion:'bloqueia_lancamento'})).fallback).toBe('objective-blocker');expect(fetcher).not.toHaveBeenCalled();
 expect((await p.suggest(item)).source).toBe('jev');expect(fetcher.mock.calls[0][1].body).not.toContain('private');expect(fetcher.mock.calls[0][1].body).not.toContain('adiar');
 expect((await p.suggest(item)).fallback).toBe('call-limit');
});
it.each(['unknown','low','invalid','timeout','unavailable','oversize'])('keeps local decision on %s',async mode=>{
 const fetcher=async()=>{if(mode==='timeout')return new Promise(()=>{});if(mode==='unavailable')throw Error('key');const a=answer(mode==='unknown'?'informativo':'revisar',mode==='low'?.1:.9);if(mode==='invalid')a.answers.triage.probabilities.revisar=2;return new Response(mode==='oversize'?'x'.repeat(66000):JSON.stringify(a));};
 const r=await createReleaseTriageProvider({enabled:true,apiKey:'key',fetcher,timeoutMs:5}).suggest(item);expect(r.source).toBe('local');expect(r.suggestion).toBe('revisar');expect(JSON.stringify(r)).not.toContain('key');
});
it('needs explicit configuration',async()=>{const fetcher=vi.fn();expect((await createReleaseTriageProvider({fetcher}).suggest(item)).fallback).toBe('not-configured');expect(fetcher).not.toHaveBeenCalled();});
