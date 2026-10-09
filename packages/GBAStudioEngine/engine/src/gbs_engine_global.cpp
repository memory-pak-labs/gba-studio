#include "gbs/engine.hpp"

namespace gbs {

namespace {
DeferredWorkQueue s_global_deferred_work_queue {};
InputRepeatState s_global_input_repeat {};
}

DeferredWorkQueue& deferred_work_queue() {
    return s_global_deferred_work_queue;
}

InputRepeatState& input_repeat_state() {
    return s_global_input_repeat;
}

} // namespace gbs
