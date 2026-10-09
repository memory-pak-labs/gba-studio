#pragma once
#include "gbs/types.hpp"

namespace gbs {

struct WorldMapJourney {
    Vec2i origin {0, 0};
    Vec2i destination {0, 0};
    Vec2i position {0, 0};
    int frame = 0;
    int duration = 1;
    bool active = false;
};

inline void start_world_map_journey(WorldMapJourney& journey, Vec2i origin, Vec2i destination, int duration) {
    journey = {origin, destination, origin, 0, duration > 0 ? duration : 1, true};
}

inline bool tick_world_map_journey(WorldMapJourney& journey) {
    if (!journey.active) return false;
    if (++journey.frame >= journey.duration) {
        journey.position = journey.destination;
        journey.active = false;
        return true;
    }
    const int t = journey.frame * 1024 / journey.duration;
    const int eased = ((t * t) / 1024) * (3072 - 2 * t) / 1024;
    journey.position = {
        journey.origin.x + (journey.destination.x - journey.origin.x) * eased / 1024,
        journey.origin.y + (journey.destination.y - journey.origin.y) * eased / 1024
    };
    return false;
}

// A regular BG keeps 31x21 visible tiles in VRAM. The atlas and its 16-bit
// source indices remain in ROM; slots are reused only after leaving the view.
struct PagedBackgroundWindow {
    int tile_x = 0;
    int tile_y = 0;
    bool initialized = false;
};

template<class Upload>
void update_paged_background_window(PagedBackgroundWindow& window, int camera_x, int camera_y, Upload upload) {
    const int left = camera_x / 8;
    const int top = camera_y / 8;
    if (window.initialized && left == window.tile_x && top == window.tile_y) return;
    for (int y = top; y < top + 21; ++y) {
        for (int x = left; x < left + 31; ++x) {
            if (window.initialized && x >= window.tile_x && x < window.tile_x + 31 &&
                y >= window.tile_y && y < window.tile_y + 21) continue;
            upload(x, y, (y % 21) * 31 + x % 31);
        }
    }
    window = {left, top, true};
}
}
