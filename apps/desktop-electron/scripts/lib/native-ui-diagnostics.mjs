import { readFileSync } from 'node:fs';
// Read-only ABI diagnostics for controller-driven ROM/Play tests.
export const nativeLayoutFields = {
  event: ['variables', 'inventory', 'current_room', 'player_x', 'player_y', 'equipped_items', 'audio_fade_target_volume', 'audio_fade_frames', 'timer_bindings', 'timer_binding_count'],
  dialogue: ['visible', 'key', 'text', 'has_next_page', 'page_complete', 'choice_count', 'selected_choice', 'choice_mode'],
  menu: ['visible', 'title', 'items', 'item_count', 'selected_index'],
  item: ['text', 'value', 'enabled'],
  battle: ['party_hp','enemy_hp','selected_party','selected_ally','selected_ability','enemy_turn_pending','outcome'],
  camera: ['position_pixels','follow_player','bounds_pixels'],
  animator: ['animation','frame_index','frames_remaining','frame_progress_x100','playing'],
  animation: ['frames','frame_count','loop'],
  actor: ['position_pixels','size_pixels','direction','collision_offset_pixels'],
  platform: ['bounds_pixels','velocity_x256','on_ground'],
  platformNpc: ['actor','active','visible','collision_group'],
  isoActor: ['tile','position_x256','position_y256','visible','position_initialized'],
  tactical: ['enabled','active_team','turn_number','active_unit_index','selected_unit_index','menu_open','menu_index','attack_mode','moving','outcome','moved_this_turn','units'],
  tacticalUnit: ['configured','actor_index','team','move_range','attack_range','hp','max_hp'],
  audioVolume: ['current','start','target','total_frames','remaining_frames']
};
export function nativeLayoutSource() {
  const types = {event:'gbs::EventState', dialogue:'gbs::DialogueState', menu:'gbs::MenuState', item:'gbs::MenuItem',battle:'gbs::BattleRpgRuntimeState',camera:'gbs::Camera',animator:'gbs::SpriteAnimatorState',animation:'gbs::SpriteAnimation',actor:'gbs::Actor',platform:'gbs::PlatformerActor',platformNpc:'gbs::PlatformerNpcRuntime',isoActor:'gbs::IsoActor',tactical:'IsoTacticalRuntimeState',tacticalUnit:'IsoTacticalRuntimeUnit',audioVolume:'AudioVolumeState'};
  const source=readFileSync(new URL('../../../../packages/GBAStudioEngine/examples/isometric_basic/src/main.cpp',import.meta.url),'utf8');
  const declaration=(name,sourceText=source)=>{
    const start=sourceText.indexOf('struct '+name+' {');if(start<0)throw Error('Missing native diagnostic type '+name);
    let depth=0,opened=false;
    for(let i=start;i<sourceText.length;i++){if(sourceText[i]==='{'){depth++;opened=true;}else if(sourceText[i]==='}'&&--depth===0&&opened)return sourceText.slice(start,i+2);}
    throw Error('Unclosed diagnostic type '+name);
  };
  const privateTypes='constexpr size_t max_actor_count=gbs::max_isometric_save_actors;\nconstexpr size_t no_tactical_unit_index=static_cast<size_t>(-1);\n'+['IsoTacticalRuntimeUnit','IsoTacticalCursorInput','IsoTacticalCursorVisual','IsoTacticalRuntimeState'].map(name=>declaration(name)).join('\n')+'\n'+declaration('AudioVolumeState',readFileSync(new URL('../../../../packages/GBAStudioEngine/engine/src/gbs_audio.cpp',import.meta.url),'utf8'));
  return '#include <stddef.h>\n#include "gbs/event.hpp"\n#include "gbs/dialogue.hpp"\n#include "gbs/ui.hpp"\n#include "gbs/battle_rpg.hpp"\n#include "gbs/topdown.hpp"\n#include "gbs/animation.hpp"\n#include "gbs/platformer.hpp"\n#include "gbs/isometric.hpp"\n'+privateTypes+'\nextern "C" const unsigned mission_layout[] = {' + Object.entries(nativeLayoutFields).flatMap(([key,fields])=>[`sizeof(${types[key]})`,...fields.map(f=>`offsetof(${types[key]}, ${f})`)]).join(',') + '};\n';
}
export function parseNativeLayouts(buffer) {
  let at=0;return Object.fromEntries(Object.entries(nativeLayoutFields).map(([key,fields])=>[key,Object.fromEntries(['size',...fields].map(f=>{const v=buffer.readUInt32LE(at);at+=4;return[f,v];}))]));
}
export function readNativeUI(symbols, layouts, read8, read32, string) {
  const pointer = p => p >= 0x02000000 && p < 0x04000000 || p >= 0x08000000 && p < 0x0a000000;
  const d=layouts.dialogue,m=layouts.menu,i=layouts.item;
  const dialogues=symbols.filter(s=>/::(?:(?:interaction|dungeon|map)_)?dialogue$/.test(s.name)).flatMap(s=>{
    const a=s.address;const text=read32(a+d.text)>>>0;
    return read8(a+d.visible)===1&&pointer(text)?[{key:string(read32(a+d.key)>>>0),text:string(text),next:!!read8(a+d.has_next_page),complete:!!read8(a+d.page_complete),choiceCount:read32(a+d.choice_count),selected:read32(a+d.selected_choice),choice:!!read8(a+d.choice_mode)}]:[];
  });
  const menus=symbols.filter(s=>/::(?:event_interaction_menu|pause_menu)$/.test(s.name)).flatMap(s=>{
    const a=s.address,title=read32(a+m.title)>>>0,items=read32(a+m.items)>>>0,count=read32(a+m.item_count);
    return read8(a+m.visible)===1&&pointer(title)&&pointer(items)&&count>0&&count<100?[{title:string(title),selected:read32(a+m.selected_index),items:Array.from({length:count},(_,n)=>({label:string(read32(items+n*i.size+i.text)>>>0),value:read32(items+n*i.size+i.value),enabled:!!read8(items+n*i.size+i.enabled)}))}]:[];
  });
  return {dialogue:dialogues[0]??null,menu:menus[0]??null};
}
const runtimeNames=['topdown','platformer','isometric','menu','shmup','point_click','dungeon_crawler','racing','cutscene','visual_novel','world_map','battle_rpg','luta'];
export function readNativePlayerAnimation(symbols, layouts, read8, read32) {
  const symbol = symbols.find(s => s.name.endsWith('::player_animator') && s.size === layouts.animator.size);
  if (!symbol) throw Error('Matching native player animator is required');
  const a=symbol.address,l=layouts.animator,pointer=read32(a+l.animation)>>>0;
  return { address:pointer,frame:read8(a+l.frame_index),remaining:read8(a+l.frames_remaining),
    progress:read8(a+l.frame_progress_x100)|(read8(a+l.frame_progress_x100+1)<<8),playing:!!read8(a+l.playing),
    frameCount:pointer?read8(pointer+layouts.animation.frame_count):0 };
}
export function runtimeNativeSymbols(symbols,kind){return symbols.filter(s=>s.section?.endsWith('_runtime_'+runtimeNames[kind]));}
export function nativeEventStatesByRuntime(symbols){return Object.fromEntries(runtimeNames.flatMap((name,kind)=>{const s=runtimeNativeSymbols(symbols,kind).find(s=>s.name.endsWith(kind===1?'::platformer_event_state':'::event_state'));return s?[[kind,s.address]]:[];}));}

export function readNativeCoastState(kind, symbols, layouts, read8, read32) {
  const active=runtimeNativeSymbols(symbols,kind),find=(name,size)=>(active.find(s=>s.name.endsWith('::'+name)&&(!size||s.size===size))
    ?? (['tactical_state','player'].includes(name)&&size?symbols.find(s=>s.name.endsWith('::'+name)&&s.size===size):undefined))?.address;
  const out={};
  if(kind===2){
    const a=find('tactical_state',layouts.tactical.size),l=layouts.tactical,u=layouts.tacticalUnit;
    if(a===undefined)throw Error('Exact tactical layout must match the ROM');
    out.tactical={team:read8(a+l.active_team),turn:read8(a+l.turn_number)|(read8(a+l.turn_number+1)<<8),active:read32(a+l.active_unit_index),selected:read32(a+l.selected_unit_index),menu:!!read8(a+l.menu_open),menuIndex:read8(a+l.menu_index),attack:!!read8(a+l.attack_mode),moving:!!read8(a+l.moving),outcome:read8(a+l.outcome),moved:!!read8(a+l.moved_this_turn),units:Array.from({length:16},(_,i)=>{const b=a+l.units+i*u.size;return{configured:!!read8(b+u.configured),actor:read32(b+u.actor_index),team:read8(b+u.team),hp:read8(b+u.hp),maxHp:read8(b+u.max_hp),moveRange:read8(b+u.move_range),attackRange:read8(b+u.attack_range)};}).filter(u=>u.configured)};
    const actors=find('actors');if(actors===undefined)throw Error('Native isometric actors required');
    const countAddress=find('actor_count'),count=countAddress===undefined?out.tactical.units.length:read32(countAddress);
    if(count<0||count>16)throw Error('Invalid native actor count');
    out.actors=Array.from({length:count},(_,index)=>{const b=actors+index*layouts.isoActor.size,l=layouts.isoActor,x=read32(b+l.tile),y=read32(b+l.tile+4),initialized=!!read8(b+l.position_initialized);return{index,x,y,visible:!!read8(b+l.visible),initialized,x256:initialized?read32(b+l.position_x256):x*256,y256:initialized?read32(b+l.position_y256):y*256};});
  }
  if(kind===1){
    const a=find('player',layouts.platform.size),n=find('platformer_npc_runtimes'),p=layouts.platform,l=layouts.platformNpc,b=layouts.actor;
    if(a===undefined||n===undefined)throw Error('Native platform diagnostics required');
    out.platform={x:read32(a+p.bounds_pixels),y:read32(a+p.bounds_pixels+4),width:read32(a+p.bounds_pixels+8),height:read32(a+p.bounds_pixels+12),vy:read32(a+p.velocity_x256+4),onGround:!!read8(a+p.on_ground)};
    out.actors=Array.from({length:16},(_,i)=>{const at=n+i*l.size,body=at+l.actor;return{index:i,x:read32(body+b.position_pixels),y:read32(body+b.position_pixels+4),direction:read8(body+b.direction),width:read32(body+b.size_pixels),height:read32(body+b.size_pixels+4),offset:[read32(body+b.collision_offset_pixels),read32(body+b.collision_offset_pixels+4)],active:!!read8(at+l.active),visible:!!read8(at+l.visible),group:read8(at+l.collision_group)};}).filter(a=>a.active);
  }
  return out;
}

export function readNativeAudio(symbols,layouts,read8){
 const l=layouts.audioVolume,volume=symbols.find(s=>s.name.endsWith('::channel_volumes')&&s.size===4*l.size);
 if(!volume)throw Error('Matching native audio envelope state is required');
 return Array.from({length:4},(_,i)=>{const a=volume.address+i*l.size,name=['music','sfx','pcm_music','pcm_sfx'][i],muted=symbols.find(s=>s.name.endsWith('::'+name+'_muted')&&s.size===1);
 return {channel:name,current:read8(a+l.current),target:read8(a+l.target),remaining:read8(a+l.remaining_frames)|(read8(a+l.remaining_frames+1)<<8),muted:muted?!!read8(muted.address):null};});
}
