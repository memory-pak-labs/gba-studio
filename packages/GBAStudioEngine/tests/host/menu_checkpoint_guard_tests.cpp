#include <cassert>
#include "gbs/runtime_checkpoint.hpp"

int main() {
    gbs::EventState state{};
    gbs::init_event_state(state);
    state.scene_stack_count = 1;
    const auto target = static_cast<int16_t>(static_cast<int>(gbs::RuntimeKind::Menu) << 12);
    const gbs::EventCommand commands[] = {{gbs::EventOp::WarpRuntime, target, 0, 0}};
    gbs::run_event_script(state, {commands, 1});
    assert(gbs::runtime_transition_pending());
    assert(!gbs::checkpoint_allow_menu_transition(state, false));
    assert(!gbs::runtime_transition_requested());
    assert(state.scene_stack_count == 0);
    gbs::run_event_script(state, {commands, 1});
    state.scene_stack_count = 1;
    assert(gbs::checkpoint_allow_menu_transition(state, true));
    assert(gbs::runtime_transition_pending());
    assert(state.scene_stack_count == 1);
}
