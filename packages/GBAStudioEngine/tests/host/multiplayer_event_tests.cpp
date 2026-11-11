#include <cassert>
#include "gbs/event.hpp"
#include "gbs/multiplayer.hpp"

int main() {
    using namespace gbs;
    EventState state {};init_event_state(state);
    state.variables[0]=65535;
    const EventCommand start[] = {
        {EventOp::MultiplayerQueueOpen,2,3,4},
        {EventOp::MultiplayerQueueSend,0,1,0},
        {EventOp::MultiplayerQueueStatus,2,3,4}
    };
    run_event_script(state,start,3);
    assert(state.variables[1]==1); // Accepted, not acknowledged/delivered.
    assert(state.variables[2]==1 && state.variables[4]==1);
    assert(multiplayer_connection().outgoing[0]==65535);
    for(unsigned frame=0;frame<12;++frame)multiplayer_update_connection();
    assert(multiplayer_connection().state==MultiplayerConnectionState::Recovering);
    assert(multiplayer_queue_pending_send(multiplayer_connection())==1);
    multiplayer_resume_connection(); // A runtime handoff preserves pending data.
    multiplayer_update_connection();
    assert(multiplayer_queue_pending_send(multiplayer_connection())==1);
    auto& q=multiplayer_connection();
    q.incoming[0]=MultiplayerMessage{42,1};q.receive_count=1;
    const EventCommand receive{EventOp::MultiplayerQueueReceive,5,6,7};
    run_event_script(state,&receive,1);
    assert(state.variables[5]==42 && state.variables[6]==1 && state.variables[7]==1);
    run_event_script(state,&receive,1);
    assert(state.variables[5]==42 && state.variables[6]==1 && state.variables[7]==0);
    const EventCommand close{EventOp::MultiplayerQueueClose,0,0,0};
    run_event_script(state,&close,1);
    assert(q.state==MultiplayerConnectionState::Closed);
    const EventCommand send{EventOp::MultiplayerQueueSend,0,1,0};
    run_event_script(state,&send,1);assert(state.variables[1]==0);
    run_event_script(state,start,3);
    const EventCommand raw{EventOp::LinkHost,-1,30,0};
    run_event_script(state,&raw,1);
    assert(q.state==MultiplayerConnectionState::Closed && state.link_request==1);
}
