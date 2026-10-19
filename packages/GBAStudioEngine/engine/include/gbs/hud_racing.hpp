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
/** Count elapsed display frames from the measured frame span, including missed VBlanks. */
inline uint32_t racing_clock_frame_span(uint32_t work_ticks,uint32_t wait_ticks) {
    const uint32_t ticks=work_ticks>0xffffffffu-wait_ticks?0xffffffffu:work_ticks+wait_ticks;
    const uint32_t span=ticks/4370u+(ticks%4370u>=2185u?1u:0u);
    return span>0?span:1;
}
struct PortoRacingHudText { char position[7] {}; char lap[7] {}; char time[7] {}; char speed[7] {}; };
/** Four six-character fields; 7px advance fits the approved 49px panel interior. */
inline PortoRacingHudText porto_racing_hud_text(uint32_t lap, uint32_t laps, uint32_t position,
        uint32_t racers, uint32_t speed, uint32_t elapsed_frames) {
    PortoRacingHudText result;
    result.position[0]='P'; result.position[1]=' '; result.position[2]='0'+(position>9?9:position);
    result.position[3]='/'; result.position[4]='0'+(racers>9?9:racers);
    result.lap[0]='V'; result.lap[1]=' '; result.lap[2]='0'+(lap>9?9:lap);
    result.lap[3]='/'; result.lap[4]='0'+(laps>9?9:laps);
    uint32_t tenths=elapsed_frames/6; if(tenths>5999) tenths=5999;
    result.time[0]='0'+tenths/600; result.time[1]=':';
    result.time[2]='0'+tenths/100%6; result.time[3]='0'+tenths/10%10;
    result.time[4]='.'; result.time[5]='0'+tenths%10;
    if(speed>999) speed=999;
    result.speed[0]='0'+speed/100; result.speed[1]='0'+speed/10%10; result.speed[2]='0'+speed%10;
    result.speed[3]='K'; result.speed[4]='M'; result.speed[5]='H';
    return result;
}

}
