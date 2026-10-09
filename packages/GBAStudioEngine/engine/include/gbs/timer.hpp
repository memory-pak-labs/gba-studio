#pragma once

#include <stdint.h>

namespace gbs {

enum class TimerId : uint8_t {
    Timer0 = 0,
    Timer1 = 1,
    Timer2 = 2,
    Timer3 = 3
};

enum class TimerFrequency : uint16_t {
    Cpu1 = 0,
    Cpu64 = 1,
    Cpu256 = 2,
    Cpu1024 = 3
};

enum class TimerOwner : uint8_t {
    Game = 0,
    Audio = 1,
    FrameTelemetry = 2,
};

struct TimerConfig {
    uint16_t reload;
    TimerFrequency frequency;
    bool irq_on_overflow;
    bool cascade;
};

constexpr bool is_valid_timer_id(TimerId timer) {
    return static_cast<uint8_t>(timer) <= static_cast<uint8_t>(TimerId::Timer3);
}

constexpr TimerOwner timer_owner(TimerId timer) {
    switch (timer) {
    case TimerId::Timer0:
        return TimerOwner::Game;
    case TimerId::Timer1:
        return TimerOwner::Audio;
    case TimerId::Timer2:
    case TimerId::Timer3:
        return TimerOwner::FrameTelemetry;
    }
    return TimerOwner::FrameTelemetry;
}

constexpr bool timer_available_to_game(TimerId timer) {
    return is_valid_timer_id(timer) && timer_owner(timer) == TimerOwner::Game;
}

constexpr bool is_valid_timer_config(const TimerConfig& config) {
    return (!config.cascade || config.frequency == TimerFrequency::Cpu1) &&
           static_cast<uint16_t>(config.frequency) <= static_cast<uint16_t>(TimerFrequency::Cpu1024);
}

constexpr uint16_t timer_reload_for_ticks(uint16_t ticks_until_overflow) {
    return static_cast<uint16_t>(0x10000u - ticks_until_overflow);
}

void timer_start(TimerId timer, TimerConfig config);
void timer_stop(TimerId timer);
uint16_t timer_value(TimerId timer);

} // namespace gbs
