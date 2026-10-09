#include "gbs/timer.hpp"
#include "gbs_hw.h"

namespace gbs {

void timer_start(TimerId timer, TimerConfig config) {
    if (!timer_available_to_game(timer) || !is_valid_timer_config(config)) {
        return;
    }

    gbs_hw_timer_start(
        static_cast<int>(timer),
        config.reload,
        static_cast<uint16_t>(config.frequency),
        config.irq_on_overflow ? 1 : 0,
        config.cascade ? 1 : 0
    );
}

void timer_stop(TimerId timer) {
    if (!timer_available_to_game(timer)) {
        return;
    }
    gbs_hw_timer_stop(static_cast<int>(timer));
}

uint16_t timer_value(TimerId timer) {
    if (!timer_available_to_game(timer)) {
        return 0;
    }
    return gbs_hw_timer_value(static_cast<int>(timer));
}

} // namespace gbs
