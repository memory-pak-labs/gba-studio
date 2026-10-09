#pragma once
#include "gbs/isometric.hpp"
#include "gbs/world_map_journey.hpp"

namespace gbs {
constexpr int iso_paged_background_slots = 31 * 21;
// A shared CBB0 surface stops before UI glyphs/maps. Foreground tiles remain
// resident; background slots are recycled only when they leave the viewport.
template<class Upload>
bool update_iso_paged_surface(const IsoBakedComposition& surface, PagedBackgroundWindow& window,
                              int camera_x, int camera_y, uint16_t* background_map,
                              uint16_t* foreground_map, Upload upload) {
    const int first = surface.paged_foreground_first_tile;
    if (first <= 0 || first >= surface.tile_count || surface.tile_count - first > 117 ||
        camera_x < 0 || camera_y < 0 || camera_x > surface.width * 8 - 240 ||
        camera_y > surface.height * 8 - 160 || !surface.tiles || !surface.background ||
        !surface.foreground || !background_map || !foreground_map) return false;
    static constexpr uint8_t empty[64] = {};
    update_paged_background_window(window, camera_x, camera_y, [&](int x, int y, int slot) {
        const bool inside = x < surface.width && y < surface.height;
        const int index = inside ? surface.background[y * surface.width + x] : -1;
        upload(slot, index >= 0 && index < first ? surface.tiles + index * 64 : empty);
        const int destination = (y % 32) * 32 + x % 32;
        background_map[destination] = static_cast<uint16_t>(slot);
        const int front = inside ? surface.foreground[y * surface.width + x] : first;
        foreground_map[destination] = static_cast<uint16_t>(iso_paged_background_slots +
            (front >= first && front < surface.tile_count ? front - first : 0));
    });
    return true;
}
}
