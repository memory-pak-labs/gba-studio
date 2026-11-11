#pragma once
namespace gbs {
struct EventState;
struct EventCommand;
void execute_multiplayer_queue_event(EventState&, const EventCommand&);
}
