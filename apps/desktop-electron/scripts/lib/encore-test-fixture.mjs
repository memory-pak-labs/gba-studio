/** Disposable QA entry: New Game starts at the final race; loading still boots
 * through the real title. No game RAM, save payloads or outcomes are injected. */
export function encoreEndingFixture(source,path=1){
  const p=structuredClone(source),r=p.rooms.find(r=>r.name==='circuito_final');
  const e=p.events.find(e=>e.name===r.eventBindings.onInit);
  e.steps.unshift(...['set_variable var_council_path '+path,'set_variable var_farol_relay 1','set_variable var_relay_cleared 1'].map((command,i)=>({id:'encore-qa-progress-'+i,command,isEnabled:true})));
  const confirm=p.events.find(e=>e.name==='nome_jogador_confirmar');
  confirm.steps=confirm.steps.map(s=>s.command.startsWith('change_scene ')?{...s,command:'change_scene circuito_final 9 15 right'}:s);
  const route=p.editorState.scenaConnections.find(c=>c.eventName==='nome_jogador_confirmar');
  if(!route)throw Error('Missing authored name confirmation route');
  route.to='circuito_final';route.entry={x:9,y:15,width:1,height:1};
  return p;
}
