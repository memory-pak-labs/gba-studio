import {readFileSync} from 'node:fs';
import {analyzeExampleAssetUsage} from './lib/example-asset-usage.mjs';
const m=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/relay-approved-manifest.json',import.meta.url)));
const upsert=(rows,entries)=>[...rows.map(r=>structuredClone(entries.find(e=>e.id===r.id)??r)),...structuredClone(entries.filter(e=>!rows.some(r=>r.id===e.id)))];
export function promoteApprovedRelay(source){
 if(!m.approval.approved||!m.approval.visual||!m.approval.palette||!m.approval.audio)throw Error('Relay requires explicit visual, palette and audio approval.');
 const p=structuredClone(source),room=p.rooms?.find(r=>r.name==='guardiao_rele');if(!room)return p;
 p.assets=upsert(p.assets,m.assets);p.animations=upsert(p.animations,m.animations);p.animationStates=upsert(p.animationStates,m.animationStates);p.audioItems=upsert(p.audioItems,m.audioItems);
 p.settings.hudPresets=upsert(p.settings.hudPresets,[m.hud]);
 const target=structuredClone(room);target.backgroundAssetName=m.names.background;target.runtimeBaseBackgroundAssetName=m.names.background;target.runtimeCompositeBackgroundAssetName=m.names.background;target.music='relay_pulse';target.hudPresetId=m.hud.id;target.relayVisualRevision=m.revision;target.visualPromotionStatus='canonical-integrated';
 target.runtime.config={...target.runtime.config,hudAssetName:m.names.hud,presentation:{victoryLabel:'RELE REATIVADO',effectsActorId:'relay-approved-effects-actor',cursorAssetName:'relay-approved-cursor.png',disabledEscapeAssetName:'relay-approved-disabled-escape.png',victoryMusic:'relay_light',outcomeHoldFrames:180,actionSounds:{cursor:'relay_cursor',confirm:'relay_confirmar',attack:'relay_chave',magic:'relay_energia',hurt:'relay_dano',defend:'relay_defesa',defeat:'relay_desativar'}}};
 for(const key of ['rooms','scenas','scenes'])if(Array.isArray(p[key]))p[key]=p[key].map(r=>r.name==='guardiao_rele'?structuredClone(target):r);
 if(p.scena?.name==='guardiao_rele')p.scena=structuredClone(target);
 for(const [id,who,x,label]of [['nara-guardian','nara',7,'NARA'],['relay-guardian','guardian',23,'GUARDIAO']]){
  let actor=p.actors.find(a=>a.id===id&&a.roomName==='guardiao_rele');if(!actor){actor=structuredClone(m.participants.find(a=>a.id===id));p.actors.push(actor);}
  actor.spriteSheet=m.names[who];actor.x=x;actor.y=14;actor.animationStateID='relay-approved-'+who+'-state';actor.animationName='idle';actor.animationFrameIndex=0;
  actor.battle={...actor.battle,useAuthoredPosition:true,hudLabel:label,spriteScale:1};
  actor.battleAnimations=Object.fromEntries(m.animations.filter(a=>a.spriteSheet===actor.spriteSheet).map(a=>[a.name,a.id]));
 }
 const fx={id:'relay-approved-effects-actor',name:'Efeitos do Relé',roomName:'guardiao_rele',spriteSheet:m.names.effects,animationStateID:'relay-approved-effects-state',animationName:'hit',x:22,y:10,visible:false,role:'effect'};
 p.actors=upsert(p.actors,[fx]);
 const enter=p.events.find(e=>e.name==='guardiao_ao_entrar');
 if(enter)for(const step of enter.steps??[])if(String(step.command).startsWith('play_music '))step.command='play_music relay_pulse';
 const audioRoots=JSON.stringify({rooms:p.rooms,scenas:p.scenas,events:p.events,dialogues:p.dialogues,settings:p.settings});
 p.audioItems=p.audioItems.filter(a=>!m.replacedAudioNames.includes(a.name)||audioRoots.includes('"'+a.name+'"'));
 const usage=analyzeExampleAssetUsage(p),retired=new Set(m.replacedAssetNames.filter(name=>!usage.usedNames.has(name)));
 const removed=new Set(p.assets.filter(a=>retired.has(a.name)).map(a=>a.id));
 p.assets=p.assets.filter(a=>!removed.has(a.id));
 for(const key of ['animations','animationStates'])p[key]=p[key].filter(a=>!retired.has(a.spriteSheet));
 for(const g of p.assetGroups??[])if(Array.isArray(g.assetIDs))g.assetIDs=g.assetIDs.filter(id=>!removed.has(id));
 return p;
}
