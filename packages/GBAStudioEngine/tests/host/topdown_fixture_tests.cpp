#include <cassert>
#include <cstddef>
#include "gbs/project.hpp"
#include "gbs/resource_manager.hpp"
#include "../../examples/topdown_basic/src/gbastudio_project_data.hpp"

extern "C" void gbs_hw_dma_copy(int, const void*, volatile void*, uint32_t, int) {
}

namespace {

constexpr size_t max_project_tile_assets = 16;
constexpr size_t max_project_bg_palettes = 8;
constexpr size_t max_project_obj_palettes = 8;
constexpr uint16_t oam_sprites_per_actor = 4;
constexpr uint16_t npc_oam_start = 8;
constexpr size_t max_npc_slots = 4;

void validates_topdown_basic_project_fixture() {
    const gbs::TopDownProjectData& project = gbastudio_project::project;

    assert(gbs::is_valid_topdown_project_data(project));
    assert(project.room_count == 2);
    assert(project.tile_asset_count == 2);
    assert(project.bg_palette_count == 1);
    assert(project.obj_palette_count == 1);
    assert(project.background_count == 1);
    assert(project.sfx_asset_count == 1);
    assert(project.music_asset_count == 1);
}

void validates_topdown_basic_second_room_camera_and_ai_budget() {
    const gbs::TopDownProjectData& project = gbastudio_project::project;
    assert(project.room_count >= 2);

    const gbs::TopDownRoomData& second_room = project.rooms[1];
    assert(second_room.metadata.camera_mode == gbs::TopDownCameraMode::Follow);
    assert(second_room.metadata.has_camera_bounds);
    assert(second_room.metadata.camera_bounds_pixels.x == 0);
    assert(second_room.metadata.camera_bounds_pixels.y == 0);
    assert(second_room.metadata.camera_bounds_pixels.width == gbastudio_project::room_w * 8);
    assert(second_room.metadata.camera_bounds_pixels.height == gbastudio_project::room_h * 8);

    gbs::Camera second_room_camera = gbs::camera_from_room_metadata(project, second_room);
    assert(second_room_camera.follow_player);
    assert(second_room_camera.bounds_enabled);

    assert(second_room.npc_count == 1);
    assert(second_room.npcs[0].movement.kind == gbs::TopDownNpcMovementKind::FollowPlayer);
    assert(second_room.npcs[0].movement.max_search_tiles <= 24);
    assert(second_room.npcs[0].movement.step_interval_frames >= 8);
}

void reserves_topdown_basic_boot_resources() {
    const gbs::TopDownProjectData& project = gbastudio_project::project;
    gbs::EngineResourceManager resources {};
    gbs::init_resource_manager(resources);

    gbs::ResourceReservation tile_reservations[max_project_tile_assets] {};
    gbs::ResourceReservation bg_palette_reservations[max_project_bg_palettes] {};
    gbs::ResourceReservation obj_palette_reservations[max_project_obj_palettes] {};
    gbs::ResourceBatchReservation reservation {
        tile_reservations,
        max_project_tile_assets,
        0,
        bg_palette_reservations,
        max_project_bg_palettes,
        0,
        obj_palette_reservations,
        max_project_obj_palettes,
        0,
        gbs::ResourceReservation {},
        false
    };

    const gbs::ResourceBatch batch {
        project.tile_assets,
        project.tile_asset_count,
        project.bg_palettes,
        project.bg_palette_count,
        project.obj_palettes,
        project.obj_palette_count,
        static_cast<uint16_t>(npc_oam_start + max_npc_slots * oam_sprites_per_actor),
        1
    };

    assert(gbs::reserve_resource_batch(resources, batch, reservation));
    assert(reservation.tile_reservation_count == project.tile_asset_count);
    assert(reservation.bg_palette_reservation_count == project.bg_palette_count);
    assert(reservation.obj_palette_reservation_count == project.obj_palette_count);
    assert(reservation.oam_sprites.success);
}

} // namespace

int main() {
    validates_topdown_basic_project_fixture();
    validates_topdown_basic_second_room_camera_and_ai_budget();
    reserves_topdown_basic_boot_resources();
    return 0;
}
