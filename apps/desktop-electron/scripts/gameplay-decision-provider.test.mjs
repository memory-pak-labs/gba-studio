import { expect, it, vi } from 'vitest';
import { createGameplayDecisionProvider } from './lib/gameplay-decision-provider.mjs';
const answer=(choice='right',confidence=.9)=>({model:'test-model',answers:{strategy:{type:'choice',choice,confidence,probabilities:{right:1,idle:0}},stuck:{type:'noul',noul:.4},priority:{type:'choice',choice:'review',confidence:.8,probabilities:{review:1,informational:0}}},usage:{input_tokens:2,output_tokens:4}});
const state={step:0,latest:{frame:10,currentRoom:0,runtimeKind:1,player:{x:2,y:3},secret:'private'},previous:{player:{x:1,y:3}}};
it('requires opt-in and credentials, caps calls, minimizes payload',async()=>{
 const fetcher=vi.fn(async()=>new Response(JSON.stringify(answer())));
 const offline=createGameplayDecisionProvider({fetcher});
 expect((await offline.choose(state,['right','idle'],'idle')).source).toBe('local');expect(fetcher).not.toHaveBeenCalled();
 const p=createGameplayDecisionProvider({enabled:true,apiKey:'secret',fetcher,maxCalls:1});
 const result=await p.choose(state,['right','idle'],'idle');expect(result.strategy).toBe('right');
 expect(result.stuckProbability).toBe(.4);expect(result.priority.choice).toBe('review');
 expect(fetcher.mock.calls[0][1].body).not.toContain('private');expect(JSON.stringify(result)).not.toContain('secret');
 expect((await p.choose(state,['right','idle'],'idle')).fallback).toBe('call-limit');expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(['unknown','low','malformed','huge','network','timeout'])('falls back on %s without exposing raw errors',async mode=>{
 const fetcher=async()=>{if(mode==='network')throw Error('secret');if(mode==='timeout')return new Promise(()=>{});
 const a=answer(mode==='unknown'?'compile':'right',mode==='low'?.1:.9);if(mode==='malformed')a.answers.strategy.probabilities.right=2;
 return new Response(mode==='huge'?'x'.repeat(66000):JSON.stringify(a));};
 const p=createGameplayDecisionProvider({enabled:true,apiKey:'secret',fetcher,timeoutMs:5});
 const r=await p.choose(state,['right','idle'],'idle');expect(r.strategy).toBe('idle');expect(r.source).toBe('local');expect(JSON.stringify(r)).not.toContain('secret');
});
