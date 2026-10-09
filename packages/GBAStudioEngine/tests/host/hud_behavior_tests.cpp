#include "gbs/hud_behavior.hpp"
int main() {
  gbs::EventState state {};
  gbs::HudVariableAction actions[] = {{false,1,7}};
  gbs::HudElementEvent events[] = {{gbs::HudElementTrigger::Appear,-1,actions,1},{gbs::HudElementTrigger::Confirm,-1,actions,1}};
  gbs::HudElementBehavior behavior {{0,1,nullptr},{0,2,nullptr},{0,3,nullptr},events,2};
  gbs::HudElementMemory memory {};
  state.variables[0]=1;
  auto status=gbs::update_hud_element(behavior,memory,state,true,0);
  if(status!=gbs::HudElementState::Selected || state.variables[1]!=7) return 1;
  state.variables[1]=0;
  gbs::update_hud_element(behavior,memory,state,true,0);
  if(state.variables[1]!=0) return 2;
  gbs::update_hud_element(behavior,memory,state,true,1);
  if(state.variables[1]!=7) return 3;
  state.variables[0]=2;state.variables[1]=0;
  gbs::update_hud_element(behavior,memory,state,true,1);
  if(state.variables[1]!=0) return 4;
  state.variables[0]=3;
  if(gbs::update_hud_element(behavior,memory,state,true,1)!=gbs::HudElementState::Hidden) return 5;
  gbs::HudVariableAction add[] = {{true,2,1}};
  gbs::HudElementEvent edges[] = {{gbs::HudElementTrigger::Focus,-1,add,1},{gbs::HudElementTrigger::ValueChanged,0,add,1}};
  behavior.events=edges;behavior.event_count=2;memory={};state.variables[0]=1;
  gbs::update_hud_element(behavior,memory,state,true,0);
  if(state.variables[2]!=1) return 6;
  gbs::update_hud_element(behavior,memory,state,true,0);
  if(state.variables[2]!=1) return 7;
  state.variables[0]=2;
  gbs::update_hud_element(behavior,memory,state,true,0);
  if(state.variables[2]!=2) return 8;
  state.variables[0]=1;
  gbs::update_hud_element(behavior,memory,state,true,0);
  if(state.variables[2]!=4) return 9;
  state.variables[2]=INT32_MAX;state.variables[0]=2;
  gbs::update_hud_element(behavior,memory,state,true,0);
  if(state.variables[2]!=INT32_MAX) return 10;
}
