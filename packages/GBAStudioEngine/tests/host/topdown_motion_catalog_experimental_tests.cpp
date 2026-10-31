#include <cassert>
#include <initializer_list>
#include "gbs/topdown_motion_catalog.hpp"
int main(){
 const gbs::EventCommand enter[]={{gbs::EventOp::Wait,1,0,0}};const gbs::EventCommand nested[]={{gbs::EventOp::End,0,0,0}};
 const gbs::EventScript scripts[]={{nested,1}};gbs::TopDownRoomData rooms[1]{};rooms[0].on_enter={enter,1};
 gbs::TopDownProjectData project{};project.rooms=rooms;project.room_count=1;project.scripts=scripts;project.script_count=1;
 gbs::TopDownMotionCatalog catalog{&project,0};for(auto script:{rooms[0].on_enter,scripts[0]}){const int id=gbs::topdown_motion_identify(script,&catalog);assert(id>=0);assert(gbs::topdown_motion_resolve(id,&catalog).commands==script.commands);}
 assert(!gbs::has_event_script(gbs::topdown_motion_resolve(999,&catalog)));
}
