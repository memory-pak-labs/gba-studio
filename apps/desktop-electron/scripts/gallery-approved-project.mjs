const name='galeria_das_mares';
const assets=new Set(['gallery-tides.png','gallery-props.png','gallery-gate.png']);
const variables=new Set(['var_gallery_gate','var_gallery_record']);
const clone=x=>structuredClone(x);
function upsert(rows,items,key='id'){const p=clone(rows??[]);for(const item of items){const i=p.findIndex(r=>r[key]===item[key]);if(i<0)p.push(clone(item));else p[i]=clone(item);}return p;}
/** Preserve only the approved Gallery when regenerating the main campaign. */
export function preserveApprovedGallery(source,generated){
 const room=source.rooms?.find(r=>r.name===name);if(!room)return generated;
 const ownAssets=source.assets.filter(a=>assets.has(a.name));
 if(ownAssets.length!==3||ownAssets.some(a=>a.metadata?.approved!==true))throw Error('Gallery assets require explicit approval');
 const p=clone(generated);
 for(const key of ['rooms','scenas'])p[key]=upsert(p[key],[room],'name');
 p.assets=upsert(p.assets,ownAssets);
 for(const key of ['animations','animationStates'])p[key]=upsert(p[key],source[key].filter(a=>assets.has(a.spriteSheet)));
 for(const key of ['actors','triggers'])p[key]=upsert(p[key],source[key].filter(a=>a.roomName===name||a.id==='evolution-gallery-stairs'));
 p.events=upsert(p.events,source.events.filter(e=>e.roomName===name||e.name==='gallery_stairs'),'name');
 p.dialogues=upsert(p.dialogues,source.dialogues.filter(d=>d.key.startsWith('gallery_')),'key');
 const byName=new Map(p.variables.map(v=>[v.name,v]));
 p.variables=source.variables.map(v=>clone(byName.get(v.name)??v));
 const reset=p.events.find(e=>e.name==='titulo_novo_jogo');
 for(const n of variables)if(!reset.steps.some(s=>s.command==='set_variable '+n+' 0'))reset.steps.push({id:'gallery-reset-'+n,command:'set_variable '+n+' 0',isEnabled:true});
 p.editorState.sceneMapPositions[name]=clone(source.editorState.sceneMapPositions[name]);
 p.editorState.scenaConnections=upsert(p.editorState.scenaConnections,source.editorState.scenaConnections.filter(c=>c.from===name||c.to===name));
 return p;
}
