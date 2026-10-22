// Read-only ABI diagnostics for controller-driven ROM/Play tests.
export const nativeLayoutFields = {
  event: ['variables', 'inventory', 'current_room', 'player_x', 'player_y', 'equipped_items'],
  dialogue: ['visible', 'key', 'text', 'has_next_page', 'page_complete', 'choice_count', 'selected_choice', 'choice_mode'],
  menu: ['visible', 'title', 'items', 'item_count', 'selected_index'],
  item: ['text', 'value', 'enabled']
};
export function nativeLayoutSource() {
  const types = {event:'EventState', dialogue:'DialogueState', menu:'MenuState', item:'MenuItem'};
  return '#include <stddef.h>\n#include "gbs/event.hpp"\n#include "gbs/dialogue.hpp"\n#include "gbs/ui.hpp"\nextern "C" const unsigned mission_layout[] = {' + Object.entries(nativeLayoutFields).flatMap(([key,fields])=>[`sizeof(gbs::${types[key]})`,...fields.map(f=>`offsetof(gbs::${types[key]}, ${f})`)]).join(',') + '};\n';
}
export function parseNativeLayouts(buffer) {
  let at=0;return Object.fromEntries(Object.entries(nativeLayoutFields).map(([key,fields])=>[key,Object.fromEntries(['size',...fields].map(f=>{const v=buffer.readUInt32LE(at);at+=4;return[f,v];}))]));
}
export function readNativeUI(symbols, layouts, read8, read32, string) {
  const pointer = p => p >= 0x02000000 && p < 0x04000000 || p >= 0x08000000 && p < 0x0a000000;
  const d=layouts.dialogue,m=layouts.menu,i=layouts.item;
  const dialogues=symbols.filter(s=>s.name.endsWith('::dialogue')).flatMap(s=>{
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
export function runtimeNativeSymbols(symbols,kind){return symbols.filter(s=>s.section?.endsWith('_runtime_'+runtimeNames[kind]));}
export function nativeEventStatesByRuntime(symbols){return Object.fromEntries(runtimeNames.flatMap((name,kind)=>{const s=runtimeNativeSymbols(symbols,kind).find(s=>s.name.endsWith('::event_state'));return s?[[kind,s.address]]:[];}));}
