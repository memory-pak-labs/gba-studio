#include "gbs/hud_racing.hpp"
#include <cassert>
#include <cstring>
int main() {
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
