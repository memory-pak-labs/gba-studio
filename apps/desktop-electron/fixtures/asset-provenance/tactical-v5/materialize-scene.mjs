import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {arenaBlueprint as board,arenaCells} from './scene-blueprint.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const canonical=path.resolve(root,'../../../default-assets/templates/exemplo-gba');
export function buildArenaV5(input) {
const project=structuredClone(input);

const palette=JSON.parse(fs.readFileSync(path.join(root,'review/background-palette.json')));
const additions=[
  ['backgrounds','tactical-v5-surface.png','prepared/background-13banks.png',{width:240,height:160,backgroundPaletteBankBudget:13,backgroundPaletteReferencePlan:{banks:palette.banks,tile_palette_banks:palette.tile_palette_banks},backgroundTileOptimizer:{enabled:true,tileBudget:620}}],
  ['ui','tactical-v5-hud.png','hud/tactical-v5-hud.png',{width:240,height:160,transparentIndex:0,backgroundPaletteBankBudget:1,backgroundTileOptimizer:{enabled:true,tileBudget:64}}],
  ...['nara','sentinel'].map(who=>['sprites',`tactical-${who}-v5.png`,`packed-final/${who}/tactical-${who}-v5.png`,{width:2688,height:40,frameWidth:48,frameHeight:40,frameCount:56,logicalSourceFrameCount:24,hardwareObjectsPerFrame:4,tilesPerFrame:30,maxVisibleColors:15,storageFormat:'indexed-4bpp',streamFrames:true}])
];
for(const [folder,name,source,metadata] of additions){
  const bytes=fs.readFileSync(path.join(root,source));
  project.assets=project.assets.filter(a=>a.name!==name);
  project.assets.push({id:name.replace('.png',''),name,kind:folder==='sprites'?'Sprite':'Background',colorMode:'4bpp',metadata:{...metadata,source:`Assets/${folder}/${name}`,preparedSha256:createHash('sha256').update(bytes).digest('hex'),generatedBy:'isometric-arena-v5',sourceCandidate:path.relative(path.resolve(root,'../../../../..'),path.join(root,source)),reviewStatus:'approved',visualStatus:'approved',candidateStatus:'qa-integrated',technicalStatus:'runtime-pending',assetcStatus:'attention',assetcReviewed:true,provenance:'ImageGen originals and hashes in isometric-arena-v5-quality-candidate/sources/manifest.json; prepared pixels approved by the user on 2026-09-27.'}});
}
for(const who of ['nara','sentinel']){
  const name=`tactical-${who}-v5.png`,pack=JSON.parse(fs.readFileSync(path.join(root,`packed-final/${who}/tactical-${who}-v5.sprite-pack.json`)));
  const animations=pack.animations.map(animation=>{
    const nameInEngine=animation.name.replace(/^walk_/,'move_'),id=`tactical-${who}-v5-${nameInEngine}`;
    return {...animation,id,name:nameInEngine,state:animation.state==='walk'?'move':animation.name.startsWith('defeat_')?'defeat':animation.state,originX:24,originY:40,
      frames:animation.frames.map((frame,i)=>({...frame,id:`${id}-frame-${i}`,tiles:frame.tiles.map((tile,j)=>({...tile,id:`${id}-frame-${i}-tile-${j}`,y:frame.height-tile.y-tile.tileHeight}))}))};
  });
  project.animations=project.animations.filter(a=>a.spriteSheet!==name).concat(animations);
  const previous=project.animationStates.find(s=>s.id===`tactical-${who}-v3-state`)
    ??project.animationStates.find(s=>s.id===`tactical-${who}-v5-state`);
  if(!previous)throw new Error(`Estado de animação não encontrado para ${who}.`);
  project.animationStates=project.animationStates.filter(s=>s.id!==`tactical-${who}-v5-state`);
  project.animationStates.push({...previous,id:`tactical-${who}-v5-state`,spriteSheet:name,animationIDs:animations.map(a=>a.id)});
  const actor=project.actors.find(a=>a.id===`tactical-${who}`);
  Object.assign(actor,who==='nara'?board.spawn:board.enemy,{spriteSheet:name,animationStateID:`tactical-${who}-v5-state`,animationName:who==='nara'?'idle_right':'idle_left',direction:who==='nara'?'right':'left'});
}
for(const collection of [project.rooms,project.scenas]){
  const room=collection.find(r=>r.name==='arena_tatica');
  Object.assign(room,{width:board.width,height:board.height,backgroundAssetName:'tactical-v5-surface.png',tilesetAssetName:'tactical-v5-surface.png',tilemap:Array(36).fill(0),tileLayers:[],heightLevels:arenaCells.map(c=>c.z),collisions:arenaCells.map(c=>c.collision),collisionTypes:arenaCells.map(c=>c.collision)});
  Object.assign(room.runtime.config,{originX:board.originX,originY:board.originY,tileWidth:board.tileWidth,tileHeight:board.tileHeight,heightStep:board.heightStep});
  const presentation=room.runtime.config.tacticalPresentation;
  presentation.surfacePages=[{id:'coastal-v5',asset:'tactical-v5-surface.png',bankGroup:'arena_tatica_coastal',world:{x:0,y:0,width:240,height:160}}];
  presentation.hudLayout='tactical-v5-hud.png';
  const names=new Map([['tactical-v3-coastal-surface.png','tactical-v5-surface.png'],['tactical-v3-hud.png','tactical-v5-hud.png'],['tactical-nara-v3.png','tactical-nara-v5.png'],['tactical-sentinel-v3.png','tactical-sentinel-v5.png']]);
  for(const asset of presentation.assets)if(names.has(asset.path))Object.assign(asset,{id:names.get(asset.path).replace('.png',''),path:names.get(asset.path),status:'approved'});
  for(const unit of presentation.units)unit.sheet=names.get(unit.sheet)??unit.sheet;
}
for(const event of project.events)for(const step of event.steps??[])if(step.command==='change_scene arena_tatica 4 7 down')step.command=`change_scene arena_tatica ${board.spawn.x} ${board.spawn.y} right`;
for(const connection of project.editorState.scenaConnections)if(connection.to==='arena_tatica')connection.entry={x:board.spawn.x,y:board.spawn.y,width:1,height:1};
return project;
}

export const promotedFiles = [
 ['backgrounds','tactical-v5-surface.png','prepared/background-13banks.png'],
 ['ui','tactical-v5-hud.png','hud/tactical-v5-hud.png'],
 ...['nara','sentinel'].map(who=>['sprites',`tactical-${who}-v5.png`,`packed-final/${who}/tactical-${who}-v5.png`])
];
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const output=process.argv[2];
 if(!output||path.resolve(output)===canonical)throw Error('Use a separate QA directory.');
 fs.mkdirSync(output,{recursive:true});
 if(!fs.existsSync(path.join(output,'Assets')))fs.cpSync(path.join(canonical,'Assets'),path.join(output,'Assets'),{recursive:true});
 const project=buildArenaV5(JSON.parse(fs.readFileSync(path.join(canonical,'exemplo-gba.gba-project'))));
 for(const [folder,name,source] of promotedFiles)fs.copyFileSync(path.join(root,source),path.join(output,'Assets',folder,name));
 project.name='Revisão · Arena V5';
 project.editorState.activeScenaName='arena_tatica';
 project.editorState.focusedScenaName='arena_tatica';
 fs.writeFileSync(path.join(output,'arena-v5.gba-project'),JSON.stringify(project,null,2)+'\n');
 console.log(path.join(output,'arena-v5.gba-project'));
}
