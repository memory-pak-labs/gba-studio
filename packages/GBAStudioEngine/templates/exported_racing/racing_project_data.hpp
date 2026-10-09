#pragma once

#include "gbs/racing.hpp"
#include "gbs/save.hpp"

namespace gbastudio_racing_project {

constexpr bool save_enabled = false;
constexpr gbs::SaveBank save_bank {
    0u,
    1024u,
    1u,
    gbs::make_save_signature('G', 'B', 'U', 'S'),
    1u
};

constexpr uint8_t collision_flags[8 * 12] = {};
constexpr gbs::RacingRoomData rooms[] = {
    { "track", collision_flags, 8, 12, { 1024, 2048, 3072, 512 }, { 32, 80 } }
};
constexpr gbs::RacingProjectData project { rooms, 1, 0 };

} // namespace gbastudio_racing_project
