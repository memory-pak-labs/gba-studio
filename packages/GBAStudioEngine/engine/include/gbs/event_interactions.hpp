#pragma once
#include "gbs/event.hpp"
#include "gbs/input.hpp"

namespace gbs {
enum class EventInteractionKind : uint8_t { None, CodeLock, EquipmentSlots, EquipmentItems };
struct EventInteractionState {
 bool active=false;
 bool pause=true;
 EventInteractionKind kind=EventInteractionKind::None;
 int variable=-1, digits=0, expected_code=0, cursor=0, slot=0, slots=0;
 uint8_t code_digits[4]{};
};
inline bool begin_event_interaction(EventState& state, EventInteractionState& modal) {
 if (modal.active) return false;
 if (is_valid_event_variable(state.last_code_lock_variable)) {
  modal=EventInteractionState{}; modal.active=true;modal.kind=EventInteractionKind::CodeLock;
  modal.variable=state.last_code_lock_variable;modal.digits=state.code_lock_digits;modal.expected_code=state.code_lock_code;
  state.last_code_lock_variable=-1;return true;
 }
 if (state.equip_menu_requested) {
  modal=EventInteractionState{};modal.active=true;modal.kind=EventInteractionKind::EquipmentSlots;
  modal.slots=state.equip_menu_slots;modal.pause=state.equip_menu_pause;
  state.equip_menu_requested=false;return true;
 }
 return false;
}
inline void advance_event_code_lock(EventState& state, EventInteractionState& modal, InputState input) {
 if (!modal.active || modal.kind!=EventInteractionKind::CodeLock) return;
 if (input.was_pressed(ButtonB)) { state.variables[modal.variable]=-1;modal.active=false;return; }
 if (input.was_pressed(ButtonLeft)) modal.cursor=(modal.cursor+modal.digits-1)%modal.digits;
 if (input.was_pressed(ButtonRight)) modal.cursor=(modal.cursor+1)%modal.digits;
 if (input.was_pressed(ButtonUp)) modal.code_digits[modal.cursor]=(modal.code_digits[modal.cursor]+1)%10;
 if (input.was_pressed(ButtonDown)) modal.code_digits[modal.cursor]=(modal.code_digits[modal.cursor]+9)%10;
 if (input.was_pressed(ButtonA)) {
  int code=0;for(int i=0;i<modal.digits;++i) code=code*10+modal.code_digits[i];
  state.variables[modal.variable]=code==modal.expected_code ? 1 : 0;modal.active=false;
 }
}
inline bool select_event_equipment(EventState& state, EventInteractionState& modal, int value) {
 if (!modal.active) return false;
 if (modal.kind==EventInteractionKind::EquipmentSlots) {
  if (value<0 || value>=modal.slots) return false;
  modal.slot=value;modal.kind=EventInteractionKind::EquipmentItems;return true;
 }
 if (modal.kind!=EventInteractionKind::EquipmentItems || value < -1 || value>=static_cast<int>(max_event_inventory_items)) return false;
 if(value>=0 && state.inventory[value]<=0) return false;
 state.equipped_items[modal.slot]=value;return true;
}
}
