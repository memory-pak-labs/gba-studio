#pragma once
#include <cstdint>

namespace gbs {
struct CompactRacingHudText { char lap[6] {}; char position[6] {}; char speed[4] {}; };
inline unsigned hud_two_digit_number(char* output, uint32_t value) {
    if (value > 99) value = 99;
    unsigned length = 0;
    if (value >= 10) output[length++] = '0' + value / 10;
    output[length++] = '0' + value % 10;
    return length;
}
/** Fits the approved 40px fraction fields and 32px speed field at 8px/glyph. */
inline CompactRacingHudText compact_racing_hud_text(uint32_t lap, uint32_t laps, uint32_t position, uint32_t racers, uint32_t speed) {
    CompactRacingHudText result;
    unsigned length = hud_two_digit_number(result.lap, lap);
    result.lap[length++] = '/';
    length += hud_two_digit_number(result.lap + length, laps);
    result.lap[length] = '\0';
    length = hud_two_digit_number(result.position, position);
    result.position[length++] = '/';
    length += hud_two_digit_number(result.position + length, racers);
    result.position[length] = '\0';
    if (speed > 99) speed = 99;
    result.speed[0] = '0'; result.speed[1] = '0' + speed / 10; result.speed[2] = '0' + speed % 10;
    return result;
}
}
