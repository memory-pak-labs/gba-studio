#include "gbs/event.hpp"
#include "gbs/multiplayer.hpp"
#include "gbs/multiplayer_events.hpp"
#include "gbs/runtime.hpp"

namespace gbs {
namespace {
uint16_t next_session_id = 0;
bool valid(int index) { return index >= 0 && index < static_cast<int>(event_variable_count); }
}

void execute_multiplayer_queue_event(EventState& state, const EventCommand& command) {
    switch (command.op) {
    case EventOp::MultiplayerQueueOpen: {
        multiplayer_close_connection();
        if (state.multiplayer_session.active) multiplayer_close(state.multiplayer_session);
        state.link_request = 3; // Release a raw runtime-owned port before the next core tick.
        state.link_script = -1;
        const auto* capabilities = active_runtime_capabilities();
        if (capabilities && !runtime_capability_enabled(*capabilities, RuntimeCapabilityID::Link)) break;
        MultiplayerConfig config;
        config.players = static_cast<uint8_t>(command.a);
        config.baud = static_cast<MultiplayerBaud>(command.b);
        config.timeout_frames = static_cast<uint16_t>(command.c);
        next_session_id = static_cast<uint16_t>((next_session_id % 4095) + 1);
        config.session_id = next_session_id;
        multiplayer_open_connection(config);
        break;
    }
    case EventOp::MultiplayerQueueSend: {
        const bool accepted = valid(command.a) && multiplayer_queue_send(multiplayer_connection(),
            static_cast<uint16_t>(state.variables[command.a] & 0xFFFF));
        if (valid(command.b)) state.variables[command.b] = accepted ? 1 : 0;
        break;
    }
    case EventOp::MultiplayerQueueReceive: {
        if (valid(command.c)) state.variables[command.c] = 0;
        if (!valid(command.a) || !valid(command.b) || !valid(command.c)) break;
        MultiplayerMessage message;
        if (multiplayer_queue_receive(multiplayer_connection(), message)) {
            state.variables[command.a] = message.value;
            state.variables[command.b] = message.player_id;
            state.variables[command.c] = 1;
        }
        break;
    }
    case EventOp::MultiplayerQueueStatus: {
        const auto& q = multiplayer_connection();
        if (valid(command.a)) state.variables[command.a] = static_cast<int>(q.state);
        if (valid(command.b)) state.variables[command.b] = q.player_id;
        if (valid(command.c)) state.variables[command.c] = multiplayer_queue_pending_send(q);
        break;
    }
    case EventOp::MultiplayerQueueClose:
        multiplayer_close_connection();
        break;
    default:
        break;
    }
}
} // namespace gbs
