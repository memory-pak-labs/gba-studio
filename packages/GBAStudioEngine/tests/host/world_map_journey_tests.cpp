#include <cassert>
#include "gbs/world_map_journey.hpp"
int main() {
    gbs::WorldMapJourney flight {};
    gbs::start_world_map_journey(flight, {79,224}, {424,74}, 120);
    assert(flight.position.x == 79 && flight.active);
    for (int frame = 0; frame < 60; ++frame) gbs::tick_world_map_journey(flight);
    assert(flight.active && flight.position.x > 79 && flight.position.x < 424);
    for (int frame = 0; frame < 60; ++frame) gbs::tick_world_map_journey(flight);
    assert(!flight.active && flight.position.x == 424 && flight.position.y == 74);
    gbs::PagedBackgroundWindow window {};
    int uploads = 0;
    gbs::update_paged_background_window(window, 0, 0, [&](int x,int y,int slot) {
        assert(x >= 0 && x < 31 && y >= 0 && y < 21);
        assert(slot >= 0 && slot < 651); ++uploads;
    });
    assert(uploads == 651);
    uploads = 0;
    gbs::update_paged_background_window(window, 7, 7, [&](int,int,int) { ++uploads; });
    assert(uploads == 0);
    gbs::update_paged_background_window(window, 8, 0, [&](int x,int,int) { assert(x == 31); ++uploads; });
    assert(uploads == 21);
    uploads = 0;
    gbs::update_paged_background_window(window, 240, 160, [&](int x,int y,int slot) {
        assert(x >= 30 && x <= 60 && y >= 20 && y <= 40);
        assert(slot >= 0 && slot < 651); ++uploads;
    });
    assert(uploads > 600);
}
