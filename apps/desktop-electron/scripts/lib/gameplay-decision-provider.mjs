import { createHash } from 'node:crypto';
const priorityOptions = {review:'Sinais que merecem revisão humana, sem afirmar bug.',informational:'Nenhum sinal claro de falha nesta amostra.'};
const probability=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1;
function choice(answer,eligible) {
  if(answer?.type!=='choice'||!eligible.includes(answer.choice)||!probability(answer.confidence))throw Error('invalid-response');
  const p=answer.probabilities;
  if(!p||Object.keys(p).length!==eligible.length||!eligible.every(k=>probability(p[k]))||Math.abs(Object.values(p).reduce((a,b)=>a+b,0)-1)>.02||Object.values(p).some(n=>n>p[answer.choice]+.0001))throw Error('invalid-response');
  return {choice:answer.choice,confidence:answer.confidence,probabilities:p};
}
// Opt-in CLI provider: keys stay in the Node worker. Only numeric facts leave it.
export function createGameplayDecisionProvider({enabled=false,apiKey,model='jev-1.13.0',fetcher=fetch,maxCalls=4,timeoutMs=2000}={}) {
  let calls=0;
  return {async choose(observation,eligible,local) {
    const latest=observation.latest,previous=observation.previous;
    const state={schema:1,step:observation.step,runtimeKind:latest?.runtimeKind??null,
      player:latest?.player?{x:latest.player.x,y:latest.player.y}:null,
      moved:previous?.player&&latest?.player?previous.player.x!==latest.player.x||previous.player.y!==latest.player.y:null,
      runtimeFrame:latest?.frame??null,collisionFlags:latest?.collision?.currentFlags??null};
    const stateId=createHash('sha256').update(JSON.stringify({state,eligible})).digest('hex');
    const base={questionVersion:1,stateId,eligible:[...eligible],strategy:local,source:'local',calls:0};
    if(!enabled||!apiKey)return {...base,fallback:'not-configured'};
    if(calls>=Math.min(4,Math.max(0,maxCalls)))return {...base,fallback:'call-limit'};
    calls++;base.calls=1;const start=Date.now(),controller=new AbortController();let timer;
    try {
      const raw=await Promise.race([(async()=>{
        const response=await fetcher('https://api.typesafe.ai/v1/systemone',{method:'POST',redirect:'error',signal:controller.signal,
          headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,state,questions:{
            strategy:{type:'choice',instructions:'Escolha a próxima estratégia de exploração entre as opções permitidas. Não é uma confirmação de bug.',criteria:Object.fromEntries(eligible.map(s=>[s,`Manter os botões da estratégia ${s} por um passo limitado.`]))},
            stuck:{type:'noul',instructions:'Esta amostra sugere que o jogador pode estar preso? Imobilidade também pode ser intencional.'},
            priority:{type:'choice',instructions:'Priorize esta amostra para revisão humana, sem aprovar nem reprovar o jogo.',criteria:priorityOptions}
          }})});
        if(!response.ok)throw Error('unavailable');
        const reader=response.body?.getReader();if(!reader)throw Error('invalid-response');
        const chunks=[];let size=0;
        try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw Error('invalid-response');chunks.push(value);}}
        finally{await reader.cancel().catch(()=>{});}
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
      })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},Math.min(2000,timeoutMs));})]);
      const strategy=choice(raw?.answers?.strategy,eligible),priority=choice(raw?.answers?.priority,Object.keys(priorityOptions));
      if(raw?.answers?.stuck?.type!=='noul'||!probability(raw.answers.stuck.noul)||typeof raw.model!=='string'||raw.model.length>128)throw Error('invalid-response');
      const result={...base,model:raw.model,probabilities:strategy.probabilities,confidence:strategy.confidence,priority,stuckProbability:raw.answers.stuck.noul,elapsedMs:Date.now()-start,
        usage:raw.usage&&['input_tokens','output_tokens'].every(k=>Number.isSafeInteger(raw.usage[k])&&raw.usage[k]>=0)?{input_tokens:raw.usage.input_tokens,output_tokens:raw.usage.output_tokens}:null};
      return strategy.confidence<.65||priority.confidence<.65?{...result,fallback:'low-confidence'}:{...result,strategy:strategy.choice,source:'jev'};
    }catch(error){return {...base,elapsedMs:Date.now()-start,fallback:controller.signal.aborted?'timeout':error?.message==='invalid-response'?'invalid-response':'unavailable'};}
    finally{clearTimeout(timer);controller.abort();}
  }};
}
