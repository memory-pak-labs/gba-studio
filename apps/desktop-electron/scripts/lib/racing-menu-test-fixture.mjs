/** Disposable replay progress for runtime QA. Never promoted to the template. */
export function racingMenuTestFixture(source) {
 const p=structuredClone(source),name='race_qa_progress';
 const commands=['if_variable var_boost 0','set_variable var_boost 1','set_variable var_campaign_finished 1','add_item zzz_lumen_tool 1','add_item zzz_guardian_compass 1','condition_end'];
 p.events.push({id:name,name,roomName:'corrida_preparacao',category:'QA: unlocked replay',commands:commands.join('\n'),steps:commands.map((command,i)=>({id:name+i,command,isEnabled:true}))});
 for(const key of ['rooms','scenas'])p[key].find(r=>r.name==='corrida_preparacao').eventBindings.onInit=name;
 return p;
}
