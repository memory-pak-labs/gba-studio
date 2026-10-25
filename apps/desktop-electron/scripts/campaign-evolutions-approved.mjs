import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/campaign-evolutions-approved.json',import.meta.url)));
const gallery='galeria_das_mares';
const assetNames=new Set(manifest.assets.map(a=>a.name));
const variables=new Set(['var_gallery_gate','var_gallery_record','var_telescope_alignment']);
const eventNames=new Set(['gallery_stairs','observatorio_do_farol_telescopio','guardiao_ao_entrar']);
const clone=value=>structuredClone(value);
function upsert(rows,items,key='id'){
 const result=clone(rows??[]);for(const item of items){const index=result.findIndex(row=>row[key]===item[key]);if(index<0)result.push(clone(item));else result[index]=clone(item);}return result;
}

/** Campaign regeneration rebuilds the original chapters. Keep the explicitly
 * approved optional room and its four extensions from the authored source. */
export function preserveApprovedCampaignEvolutions(source,generated){
 const room=source.rooms?.find(r=>r.name===gallery);
 if(!room)return generated;
 const assets=(source.assets??[]).filter(a=>assetNames.has(a.name));
 if(assets.length!==manifest.assets.length||assets.some(a=>a.metadata?.approved!==true||a.metadata?.preparedSha256!==manifest.assets.find(m=>m.name===a.name).sha256))throw Error('Campaign extension assets require the approved source manifest.');
 const p=clone(generated);
 for(const key of ['rooms','scenas'])p[key]=upsert(p[key],[room],'name');
 p.editorState.sceneMapPositions[gallery]=clone(source.editorState.sceneMapPositions[gallery]);
 p.editorState.scenaConnections.push(...clone(source.editorState.scenaConnections.filter(c=>c.from===gallery||c.to===gallery)));
 p.assets=upsert(p.assets,assets);
 p.animations=upsert(p.animations,source.animations.filter(a=>assetNames.has(a.spriteSheet)));
 p.animationStates=upsert(p.animationStates,source.animationStates.filter(a=>assetNames.has(a.spriteSheet)));
 p.actors=upsert(p.actors,source.actors.filter(a=>a.roomName===gallery||a.id.startsWith('telescope-dial-')||a.id==='relay-mechanic-support'));
 p.events=upsert(p.events,source.events.filter(e=>e.roomName===gallery||eventNames.has(e.name)),'name');
 const newGame=p.events.find(e=>e.name==='titulo_novo_jogo');
 for(const variable of variables){const command='set_variable '+variable+' 0';if(!newGame.steps.some(s=>s.command===command))newGame.steps.push({id:'new-game-reset-'+variable,command,isEnabled:true});}
 p.triggers=upsert(p.triggers,source.triggers.filter(t=>t.roomName===gallery||t.id==='evolution-gallery-stairs'));
 p.dialogues=upsert(p.dialogues,source.dialogues.filter(d=>d.key.startsWith('gallery_')||['telescope_adjust','relay_support'].includes(d.key)),'key');
 p.variables=upsert(p.variables,source.variables.filter(v=>variables.has(v.name)),'name');
 // Variable indices are save slots. Rebuilding chapter defaults must not move
 // an existing variable ahead of the slots in the authored project.
 const generatedVariables=new Map(p.variables.map(v=>[v.name,v]));
 const sourceNames=new Set(source.variables.map(v=>v.name));
 p.variables=[...source.variables.map(v=>clone(generatedVariables.get(v.name)??v)),...p.variables.filter(v=>!sourceNames.has(v.name))];
 const sourceStorm=source.rooms.find(r=>r.name==='tempestade');
 for(const key of ['rooms','scenas'])for(const r of p[key])if(r.name==='tempestade'){
  const from=sourceStorm.runtime.config,to=r.runtime.config;
  r.tileLayers=upsert(r.tileLayers,sourceStorm.tileLayers.filter(l=>l.id==='evolution-storm-clouds'));
  to.composition.layers=upsert(to.composition.layers,from.composition.layers.filter(l=>l.id==='evolution-storm-clouds'));
  to.resources.resources=upsert(to.resources.resources,from.resources.resources.filter(l=>l.id==='evolution-storm-clouds'));
  to.capabilities=upsert(to.capabilities,from.capabilities.filter(c=>c.id==='hblank_timeline'));
  to.composition.effects.hblank=clone(from.composition.effects.hblank);
 }
 return p;
}
