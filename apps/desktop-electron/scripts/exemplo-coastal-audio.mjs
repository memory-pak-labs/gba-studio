/** Preserve the approved source bank when legacy example promoters regenerate content. */
export function preserveExemploCoastalAudio(source, target) {
  const assets=(source.assets??[]).filter(asset=>asset.metadata?.coastalBank==='coastal-v1' || asset.metadata?.source?.startsWith('Assets/audio/') && asset.metadata?.approved===true);
  const ids=new Set(assets.map(asset=>asset.id));
  const audio=(source.audioItems??[]).filter(item=>ids.has(item.sourceAssetID));
  if(!audio.length)return target;
  const restore=(current,approved)=>{
    const byID=new Map(approved.map(item=>[item.id,item]));
    const existing=new Set(current.map(item=>item.id));
    return [...current.map(item=>structuredClone(byID.get(item.id)??item)),...approved.filter(item=>!existing.has(item.id)).map(item=>structuredClone(item))];
  };
  return {...target,assets:restore(target.assets??[],assets),audioItems:restore(target.audioItems??[],audio)};
}
