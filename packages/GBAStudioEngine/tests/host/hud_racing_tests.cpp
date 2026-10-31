#include "gbs/hud_racing.hpp"
#include <cassert>
#include <cstring>
#include <initializer_list>
int main() {
    assert(gbs::racing_clock_frame_span(2000,2389)==1);
    assert(gbs::racing_clock_frame_span(5200,3578)==2);
    assert(gbs::racing_clock_frame_span(0,0)==1);
    const auto porto = gbs::porto_racing_hud_text(1, 3, 2, 3, 128, 3636);
    assert(std::strcmp(porto.position, "P 2/3") == 0);
    assert(std::strcmp(porto.lap, "V 1/3") == 0);
    assert(std::strcmp(porto.time, "1:00.6") == 0);
    assert(std::strcmp(porto.speed, "128KMH") == 0);
    const auto capped = gbs::porto_racing_hud_text(99, 99, 99, 99, 9999, 0xffffffffu);
    assert(std::strcmp(capped.time, "9:59.9") == 0);
    for (const char* text : {capped.position, capped.lap, capped.time, capped.speed}) assert(std::strlen(text) <= 6);
    const auto first = gbs::compact_racing_hud_text(1, 3, 2, 4, 7);
    assert(std::strcmp(first.lap, "1/3") == 0);
    assert(std::strcmp(first.position, "2/4") == 0);
    assert(std::strcmp(first.speed, "007") == 0);
    const auto end = gbs::compact_racing_hud_text(99, 99, 10, 12, 99);
    assert(std::strcmp(end.lap, "99/99") == 0);
    assert(std::strcmp(end.position, "10/12") == 0);
    assert(std::strcmp(end.speed, "099") == 0);
    const auto overflow = gbs::compact_racing_hud_text(999, 1000, 0, 0, 999);
    assert(std::strlen(overflow.lap) <= 5);
    assert(std::strlen(overflow.position) <= 5);
    assert(std::strcmp(overflow.speed, "099") == 0);
}
