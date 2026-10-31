/** QA-only shortcut from the already opened Gallery to Storm. Reaching the
 * Gallery, its crate puzzle, the tide valve and the pickup use ordinary play.
 * No variables, RAM, positions or save contents are injected. */
export function tideAnnexTestFixture(source){
 const p=structuredClone(source);if(p.events.some(e=>e.name==='qa_tide_storm'))return p;
 p.events.push({id:'qa_tide_storm',name:'qa_tide_storm',roomName:'galeria_das_mares',category:'QA',command:'noop',steps:[{id:'qa-tide-storm-warp',command:'change_scene tempestade 5 8 right',isEnabled:true}]});
 for(const name of ['gallery_enter','coast_restore_galeria_das_mares'])p.events.find(e=>e.name===name)?.steps.push({id:'qa-tide-storm-'+name,command:'attach_button select qa_tide_storm true',isEnabled:true});
 return p;
}
