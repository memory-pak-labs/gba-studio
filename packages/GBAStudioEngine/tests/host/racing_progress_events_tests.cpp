#include "gbs/racing_events.hpp"
#include <cassert>
#include <initializer_list>
int main() {
 gbs::EventCommand marker{};
 gbs::EventScript scripts[]={{&marker,1},{&marker,2},{&marker,3},{&marker,4}};
 gbs::RacingTopdownCheckpoint gates[]={{"finish",{0,0},8,8},{"one",{32,0},8,8},{"two",{64,0},8,8},{"three",{96,0},8,8}};
 gbs::RacingTopdownTrackData track{};track.checkpoints=gates;track.checkpoint_count=4;track.finish_at_zero=true;track.checkpoint_events=scripts;
 gbs::RacingRoomData room{};room.topdown_track=&track;room.on_lap_complete={&marker,5};
 gbs::RacingProgressEvents pending{};gbs::RacingRuntimeState before{},after{};gbs::EventScript event{};
 gbs::capture_racing_progress_events(pending,before,after);assert(!gbs::next_racing_progress_event(pending,room,event));
 after.checkpoint_count=4;after.lap_count=1;gbs::capture_racing_progress_events(pending,before,after);
 for(unsigned count:{2u,3u,4u,1u,5u}){assert(gbs::next_racing_progress_event(pending,room,event));assert(event.command_count==count);}
 assert(!gbs::next_racing_progress_event(pending,room,event));
 before=after;after.checkpoint_count=24;after.lap_count=6;gbs::capture_racing_progress_events(pending,before,after);
 int count=0;while(gbs::next_racing_progress_event(pending,room,event))++count;assert(count==25);
 track.checkpoint_events=nullptr;room.on_lap_complete=gbs::empty_event_script();
 gbs::capture_racing_progress_events(pending,before,after);assert(!gbs::next_racing_progress_event(pending,room,event));
}
