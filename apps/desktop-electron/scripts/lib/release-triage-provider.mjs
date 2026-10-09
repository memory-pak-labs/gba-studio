import {sha256} from './release-triage.mjs';
const criteria={bloqueia_lancamento:'Falha objetiva em build, teste, asset ou invariante reproduzida.',revisar:'Suspeita, cobertura ausente ou evidência inconclusiva exige revisão.',adiar:'Registro informativo sem falha objetiva; sugerir adiamento para decisão humana.',informativo:'Observação sem falha conhecida, sem implicar aprovação.'};
const probability=n=>Number.isFinite(n)&&n>=0&&n<=1;
export function createReleaseTriageProvider({enabled=false,apiKey,fetcher=fetch,model='jev-1.13.0',timeoutMs=2000,maxCalls=10}={}){
 let calls=0;
 return {async suggest(item){
  const eligible=item.objectiveBlocker?['bloqueia_lancamento']:item.severity==='warning'?['revisar','bloqueia_lancamento']:Object.keys(criteria);
  const state={schema:1,kind:item.kind,severity:item.severity,objectiveBlocker:item.objectiveBlocker,occurrenceCount:item.occurrences.length};
  const base={questionVersion:1,stateId:sha256(JSON.stringify({state,eligible})),eligible,suggestion:item.suggestion,calls:0,source:'local'};
  if(!enabled||!apiKey)return {...base,fallback:'not-configured'};
  if(eligible.length===1)return {...base,fallback:'objective-blocker'};
  if(calls>=Math.min(10,maxCalls))return {...base,fallback:'call-limit'};
  calls++;base.calls=1;const controller=new AbortController(),start=Date.now();let timer;
  try{
   const response=await Promise.race([(async()=>{
    const r=await fetcher('https://api.typesafe.ai/v1/systemone',{method:'POST',redirect:'error',signal:controller.signal,headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,state,questions:{triage:{type:'choice',instructions:'Sugira a prioridade para revisão humana usando somente as opções elegíveis. Nunca aprove lançamento.',criteria:Object.fromEntries(eligible.map(k=>[k,criteria[k]]))}}})});
    if(!r.ok)throw Error('unavailable');const reader=r.body?.getReader();if(!reader)throw Error('invalid-response');let size=0;const chunks=[];
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw Error('invalid-response');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
   })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},Math.min(2000,timeoutMs));})]);
   const a=response?.answers?.triage,p=a?.probabilities;
   if(a?.type!=='choice'||!eligible.includes(a.choice)||!probability(a.confidence)||!p||Object.keys(p).length!==eligible.length||!eligible.every(k=>probability(p[k]))||Math.abs(Object.values(p).reduce((s,v)=>s+v,0)-1)>.01||Object.values(p).some(v=>v>p[a.choice]+.0001)||typeof response.model!=='string'||response.model.length>128)throw Error('invalid-response');
   const audit={...base,model:response.model,confidence:a.confidence,probabilities:p,elapsedMs:Date.now()-start,
    usage:response.usage&&['input_tokens','output_tokens'].every(k=>Number.isSafeInteger(response.usage[k])&&response.usage[k]>=0)?{input_tokens:response.usage.input_tokens,output_tokens:response.usage.output_tokens}:null};
   return a.confidence<.65?{...audit,fallback:'low-confidence'}:{...audit,source:'jev',suggestion:a.choice};
  }catch(error){return {...base,elapsedMs:Date.now()-start,fallback:controller.signal.aborted?'timeout':error?.message==='invalid-response'?'invalid-response':'unavailable'};}
  finally{clearTimeout(timer);controller.abort();}
 }};
}
