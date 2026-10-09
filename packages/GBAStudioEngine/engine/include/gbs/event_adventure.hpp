#pragma once
#include "gbs/event.hpp"
#include "gbs/input.hpp"
namespace gbs {
enum class AdventureEventState : uint8_t { Ground, Dash, Knockback, Blank, Run, Push };
inline int adventure_event_speed_x100(const EventState& state,int walk_speed) {
 if(state.adventure_state==3) return 0;
 if(state.adventure_state==1) return walk_speed*3;
 if(state.adventure_state==2 || state.adventure_state==4) return walk_speed*2;
 return walk_speed;
}
inline InputState adventure_event_input(EventState& state,InputState input,uint8_t direction) {
 if(state.adventure_state==3) return {0,0,0};
 if(state.adventure_state==1 || state.adventure_state==2 || state.adventure_state==5) {
  const uint16_t buttons[]={ButtonDown,ButtonUp,ButtonLeft,ButtonRight};
  uint16_t button=buttons[direction<4 ? direction : 0];
  if(state.adventure_state==2) { if(button==ButtonUp)button=ButtonDown;else if(button==ButtonDown)button=ButtonUp;else if(button==ButtonLeft)button=ButtonRight;else button=ButtonLeft; }
  input={button,0,0};
  if(state.adventure_frames>0 && --state.adventure_frames==0) state.adventure_state=0;
 }
 return input;
}
}
