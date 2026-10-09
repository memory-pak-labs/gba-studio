#pragma once

#include "gbs/dungeon_crawler.hpp"
#include "gbs/save.hpp"

namespace gbastudio_dungeon_crawler_project {

constexpr bool save_enabled = false;
constexpr gbs::SaveBank save_bank {
    0u,
    1024u,
    1u,
    gbs::make_save_signature('G', 'B', 'U', 'S'),
    1u
};

constexpr uint8_t collision_flags[] = {
    1, 1, 1, 1, 1,
    1, 0, 0, 0, 1,
    1, 0, 1, 0, 1,
    1, 0, 0, 0, 1,
    1, 1, 1, 1, 1,
};

constexpr gbs::DungeonCrawlerRoomData rooms[] = {
    {
        "crypt",
        collision_flags,
        5,
        5,
        { 11, 7, true, 5 },
        { 1, 1 },
        gbs::DungeonDirection::East
    }
};

constexpr gbs::DungeonCrawlerProjectData project { rooms, 1, 0 };

} // namespace gbastudio_dungeon_crawler_project
