#pragma once

#include <stddef.h>
#include <stdint.h>
#include "gbs/assets.hpp"
#include "gbs/dma.hpp"
#include "gbs/types.hpp"

namespace gbs {

struct ResourceReservation {
    uint16_t start;
    uint16_t count;
    bool success;
};

struct StaticResourcePool {
    bool used[1024];
    uint16_t capacity;
    uint16_t used_count;
};

struct ResourcePoolSnapshot {
    bool used[1024];
    uint16_t capacity;
    bool valid;
};

struct EngineResourceManager {
    StaticResourcePool bg_tiles;
    StaticResourcePool obj_tiles;
    StaticResourcePool bg_palette;
    StaticResourcePool obj_palette;
    StaticResourcePool oam_sprites;
};

struct EngineResourceSnapshot {
    ResourcePoolSnapshot bg_tiles;
    ResourcePoolSnapshot obj_tiles;
    ResourcePoolSnapshot bg_palette;
    ResourcePoolSnapshot obj_palette;
    ResourcePoolSnapshot oam_sprites;
    bool valid;
};

struct ResourceBatch {
    const TileAsset* tile_assets;
    size_t tile_asset_count;
    const PaletteAsset* bg_palettes;
    size_t bg_palette_count;
    const PaletteAsset* obj_palettes;
    size_t obj_palette_count;
    uint16_t oam_sprite_count;
    uint16_t oam_sprite_alignment;
};

struct ResourceBatchReservation {
    ResourceReservation* tile_reservations;
    size_t tile_reservation_capacity;
    size_t tile_reservation_count;
    ResourceReservation* bg_palette_reservations;
    size_t bg_palette_reservation_capacity;
    size_t bg_palette_reservation_count;
    ResourceReservation* obj_palette_reservations;
    size_t obj_palette_reservation_capacity;
    size_t obj_palette_reservation_count;
    ResourceReservation oam_sprites;
    bool success;
};

enum class ResourcePoolKind : uint8_t {
    BgTiles,
    ObjTiles,
    BgPalette,
    ObjPalette,
    OamSprites,
};

struct ResourcePoolUsage {
    uint16_t capacity;
    uint16_t used;
    uint16_t remaining;
    uint16_t largest_free_block;
    uint16_t free_block_count;
};

struct EngineResourceUsage {
    ResourcePoolUsage bg_tiles;
    ResourcePoolUsage obj_tiles;
    ResourcePoolUsage bg_palette;
    ResourcePoolUsage obj_palette;
    ResourcePoolUsage oam_sprites;
};

struct ResourceBank {
    ResourcePoolKind kind;
    uint16_t start;
    uint16_t count;
    uint16_t alignment;
    const char* name;
};

struct ResourceBankReservation {
    ResourcePoolKind kind;
    ResourceReservation reservation;
    const char* name;
    bool success;
};

struct ResourceBankBatch {
    const ResourceBank* banks;
    size_t bank_count;
};

struct ResourceBankGroup {
    const char* name;
    const ResourceBank* banks;
    size_t bank_count;
};

struct ResourceBankBatchReservation {
    ResourceBankReservation* reservations;
    size_t reservation_capacity;
    size_t reservation_count;
    const char* group_name;
    bool success;
};

class ResourceBankLease {
public:
    ResourceBankLease();
    ResourceBankLease(EngineResourceManager& manager, const ResourceBank& bank);
    ~ResourceBankLease();

    ResourceBankLease(const ResourceBankLease&) = delete;
    ResourceBankLease& operator=(const ResourceBankLease&) = delete;

    bool acquire(EngineResourceManager& manager, const ResourceBank& bank);
    bool release();
    bool valid() const;
    const ResourceBankReservation& reservation() const;

private:
    EngineResourceManager* manager_;
    ResourceBankReservation reservation_;
};

class ResourceBankGroupLease {
public:
    ResourceBankGroupLease();
    ResourceBankGroupLease(
        EngineResourceManager& manager,
        const ResourceBankGroup& group,
        ResourceBankReservation* reservations,
        size_t reservation_capacity
    );
    ~ResourceBankGroupLease();

    ResourceBankGroupLease(const ResourceBankGroupLease&) = delete;
    ResourceBankGroupLease& operator=(const ResourceBankGroupLease&) = delete;

    bool acquire(
        EngineResourceManager& manager,
        const ResourceBankGroup& group,
        ResourceBankReservation* reservations,
        size_t reservation_capacity
    );
    bool release();
    bool valid() const;
    const ResourceBankBatchReservation& reservation() const;

private:
    EngineResourceManager* manager_;
    ResourceBankBatchReservation reservation_;
};

struct ResourceBankUploadSource {
    const char* bank_name;
    const void* source;
};

struct ResourceBankCacheEntry {
    ResourceBankReservation reservation;
    uint8_t priority;
    uint32_t last_used_tick;
    bool locked;
    bool active;
};

struct ResourceBankCache {
    ResourceBankCacheEntry* entries;
    size_t capacity;
    size_t count;
};

struct ResourceBankCacheResult {
    bool success;
    size_t entry_index;
    size_t evicted_count;
    ResourceBankReservation reservation;
};

struct ResourceBankCachePrunePolicy {
    uint32_t current_tick;
    uint32_t max_age_ticks;
    uint8_t max_priority;
    ResourcePoolKind kind;
    bool filter_kind;
    bool enabled;
};

struct ResourceBankCachePruneResult {
    bool success;
    size_t pruned_count;
    uint16_t released_count;
};

struct ResourceBankCachePrunePreview {
    bool valid;
    size_t active_count;
    size_t locked_count;
    size_t prunable_count;
    uint16_t releasable_count;
};

struct ResourceBankPrefetchRequest {
    const ResourceBank* bank;
    Rect area_pixels;
    uint8_t near_priority;
    uint8_t far_priority;
    uint16_t falloff_pixels;
    bool locked;
};

struct ResourceBankPrefetchWindow {
    Rect area_pixels;
    int16_t margin_pixels;
    bool enabled;
};

struct ResourceBankPrefetchPolicy {
    size_t max_new_reservations;
    size_t max_uploads;
    bool enabled;
};

struct ResourceBankPrefetchResult {
    bool success;
    size_t request_index;
    size_t reserved_count;
    size_t reused_count;
    size_t skipped_count;
    size_t evicted_count;
    size_t uploaded_count;
    ResourceBankCacheResult last_result;
};

struct ResourceBankCacheGroupResult {
    bool success;
    const char* group_name;
    const char* missing_bank_name;
    size_t promoted_count;
};

enum class ResourceStreamStatus : uint8_t {
    Ok,
    AlreadyActive,
    InvalidGroup,
    ReservationFailed,
    MissingUploadSource,
    DmaQueueFull,
    UploadEnqueueFailed,
};

struct ResourceStreamResult {
    bool success;
    ResourceStreamStatus status;
    const char* group_name;
    const char* bank_name;
    ResourcePoolKind kind;
    uint16_t requested_count;
    ResourcePoolUsage usage;
    size_t uploaded_count;
    bool changed_group;
};

constexpr uint16_t max_bg_tiles = 1024;
constexpr uint16_t max_obj_tiles = 1024;
constexpr uint16_t max_palette_colors = 256;
constexpr uint16_t max_oam_sprites = 128;
constexpr uint16_t automatic_resource_bank_start = 0xFFFF;
constexpr size_t max_resource_bank_cache_entries = 64;
constexpr size_t invalid_resource_bank_cache_index = static_cast<size_t>(-1);
constexpr uintptr_t gba_bg_tile_vram_address = 0x06000000u;
constexpr uintptr_t gba_obj_tile_vram_address = 0x06010000u;
constexpr uintptr_t gba_bg_palette_address = 0x05000000u;
constexpr uintptr_t gba_obj_palette_address = 0x05000200u;
constexpr uintptr_t gba_oam_address = 0x07000000u;

constexpr bool resource_reservation_ok(ResourceReservation reservation) {
    return reservation.success && reservation.count > 0;
}

constexpr bool is_valid_resource_pool_kind(ResourcePoolKind kind) {
    return kind == ResourcePoolKind::BgTiles ||
        kind == ResourcePoolKind::ObjTiles ||
        kind == ResourcePoolKind::BgPalette ||
        kind == ResourcePoolKind::ObjPalette ||
        kind == ResourcePoolKind::OamSprites;
}

constexpr bool is_auto_resource_bank_start(uint16_t start) {
    return start == automatic_resource_bank_start;
}

constexpr bool is_valid_resource_bank(const ResourceBank& bank) {
    return is_valid_resource_pool_kind(bank.kind) &&
        bank.count > 0 &&
        (bank.alignment == 0 ||
         is_auto_resource_bank_start(bank.start) ||
         (bank.start % bank.alignment) == 0);
}

constexpr bool is_valid_resource_bank_group(const ResourceBankGroup& group) {
    if (group.bank_count == 0) {
        return true;
    }
    if (group.banks == nullptr) {
        return false;
    }
    for (size_t index = 0; index < group.bank_count; ++index) {
        if (!is_valid_resource_bank(group.banks[index])) {
            return false;
        }
    }
    return true;
}

constexpr bool resource_bank_name_equals(const char* lhs, const char* rhs) {
    if (lhs == nullptr || rhs == nullptr) {
        return false;
    }
    while (*lhs != '\0' && *rhs != '\0') {
        if (*lhs != *rhs) {
            return false;
        }
        ++lhs;
        ++rhs;
    }
    return *lhs == *rhs;
}

constexpr int find_resource_bank_group_index(const ResourceBankGroup* groups, size_t group_count, const char* name) {
    if (groups == nullptr || name == nullptr) {
        return -1;
    }
    for (size_t index = 0; index < group_count; ++index) {
        if (resource_bank_name_equals(groups[index].name, name)) {
            return static_cast<int>(index);
        }
    }
    return -1;
}

constexpr ResourceBankGroup resource_bank_group_by_name(const ResourceBankGroup* groups, size_t group_count, const char* name) {
    int index = find_resource_bank_group_index(groups, group_count, name);
    if (index < 0) {
        return ResourceBankGroup { nullptr, nullptr, 0 };
    }
    return groups[index];
}

constexpr size_t resource_bank_halfword_units(ResourcePoolKind kind, uint16_t count) {
    switch (kind) {
    case ResourcePoolKind::BgTiles:
    case ResourcePoolKind::ObjTiles:
        return static_cast<size_t>(count) * 16u;
    case ResourcePoolKind::BgPalette:
    case ResourcePoolKind::ObjPalette:
        return count;
    case ResourcePoolKind::OamSprites:
        return static_cast<size_t>(count) * 4u;
    }
    return 0;
}

constexpr uintptr_t resource_bank_destination_address(ResourcePoolKind kind, uint16_t start) {
    switch (kind) {
    case ResourcePoolKind::BgTiles:
        return gba_bg_tile_vram_address + static_cast<uintptr_t>(start) * bytes_per_4bpp_tile;
    case ResourcePoolKind::ObjTiles:
        return gba_obj_tile_vram_address + static_cast<uintptr_t>(start) * bytes_per_4bpp_tile;
    case ResourcePoolKind::BgPalette:
        return gba_bg_palette_address + static_cast<uintptr_t>(start) * sizeof(uint16_t);
    case ResourcePoolKind::ObjPalette:
        return gba_obj_palette_address + static_cast<uintptr_t>(start) * sizeof(uint16_t);
    case ResourcePoolKind::OamSprites:
        return gba_oam_address + static_cast<uintptr_t>(start) * 4u * sizeof(uint16_t);
    }
    return 0;
}

constexpr bool resource_bank_requires_upload_source(ResourcePoolKind kind) {
    return kind != ResourcePoolKind::OamSprites;
}

constexpr const void* resource_bank_upload_source_by_name(const ResourceBankUploadSource* sources, size_t source_count, const char* bank_name) {
    if (sources == nullptr || bank_name == nullptr) {
        return nullptr;
    }
    for (size_t index = 0; index < source_count; ++index) {
        if (resource_bank_name_equals(sources[index].bank_name, bank_name)) {
            return sources[index].source;
        }
    }
    return nullptr;
}

inline bool resource_bank_upload_transfer(const ResourceBankReservation& reservation, const void* source, DmaTransfer& transfer) {
    if (!reservation.success ||
        !resource_reservation_ok(reservation.reservation) ||
        source == nullptr ||
        !is_valid_resource_pool_kind(reservation.kind)) {
        transfer = DmaTransfer {};
        return false;
    }

    transfer = DmaTransfer {
        source,
        reinterpret_cast<volatile void*>(resource_bank_destination_address(reservation.kind, reservation.reservation.start)),
        resource_bank_halfword_units(reservation.kind, reservation.reservation.count),
        DmaWidth::Halfword,
    };
    if (!is_valid_dma_transfer(transfer)) {
        transfer = DmaTransfer {};
        return false;
    }
    return true;
}

void init_resource_pool(StaticResourcePool& pool, uint16_t capacity);
void reset_resource_pool(StaticResourcePool& pool);
uint16_t resource_pool_used_count(const StaticResourcePool& pool);
uint16_t resource_pool_remaining_count(const StaticResourcePool& pool);
uint16_t resource_pool_largest_free_block(const StaticResourcePool& pool);
uint16_t resource_pool_free_block_count(const StaticResourcePool& pool);
ResourcePoolUsage capture_resource_pool_usage(const StaticResourcePool& pool);
ResourcePoolUsage capture_resource_pool_resident_usage(const StaticResourcePool& pool);
ResourceReservation reserve_resource_range(StaticResourcePool& pool, uint16_t start, uint16_t count);
ResourceReservation find_next_resource_range(const StaticResourcePool& pool, uint16_t count, uint16_t alignment);
ResourceReservation reserve_next_resource_range(StaticResourcePool& pool, uint16_t count, uint16_t alignment);
bool release_resource_range(StaticResourcePool& pool, ResourceReservation reservation);
ResourcePoolSnapshot capture_resource_pool_snapshot(const StaticResourcePool& pool);
bool restore_resource_pool_snapshot(StaticResourcePool& pool, const ResourcePoolSnapshot& snapshot);

void init_resource_manager(EngineResourceManager& manager);
EngineResourceSnapshot capture_resource_manager_snapshot(const EngineResourceManager& manager);
bool restore_resource_manager_snapshot(EngineResourceManager& manager, const EngineResourceSnapshot& snapshot);
EngineResourceUsage capture_engine_resource_usage(const EngineResourceManager& manager);
EngineResourceUsage capture_engine_resident_resource_usage(const EngineResourceManager& manager);
StaticResourcePool* resource_pool_for_kind(EngineResourceManager& manager, ResourcePoolKind kind);
const StaticResourcePool* resource_pool_for_kind(const EngineResourceManager& manager, ResourcePoolKind kind);

inline ResourceReservation reserve_bg_tiles(EngineResourceManager& manager, uint16_t start, uint16_t count) {
    return reserve_resource_range(manager.bg_tiles, start, count);
}

inline ResourceReservation reserve_obj_tiles(EngineResourceManager& manager, uint16_t start, uint16_t count) {
    return reserve_resource_range(manager.obj_tiles, start, count);
}

inline ResourceReservation reserve_bg_palette_colors(EngineResourceManager& manager, uint16_t start, uint16_t count) {
    return reserve_resource_range(manager.bg_palette, start, count);
}

inline ResourceReservation reserve_obj_palette_colors(EngineResourceManager& manager, uint16_t start, uint16_t count) {
    return reserve_resource_range(manager.obj_palette, start, count);
}

inline ResourceReservation reserve_oam_sprites(EngineResourceManager& manager, uint16_t start, uint16_t count) {
    return reserve_resource_range(manager.oam_sprites, start, count);
}

inline ResourceReservation reserve_next_bg_tiles(EngineResourceManager& manager, uint16_t count, uint16_t alignment = 1) {
    return reserve_next_resource_range(manager.bg_tiles, count, alignment);
}

inline ResourceReservation reserve_next_obj_tiles(EngineResourceManager& manager, uint16_t count, uint16_t alignment = 1) {
    return reserve_next_resource_range(manager.obj_tiles, count, alignment);
}

inline ResourceReservation reserve_next_bg_palette_colors(EngineResourceManager& manager, uint16_t count, uint16_t alignment = 1) {
    return reserve_next_resource_range(manager.bg_palette, count, alignment);
}

inline ResourceReservation reserve_next_obj_palette_colors(EngineResourceManager& manager, uint16_t count, uint16_t alignment = 1) {
    return reserve_next_resource_range(manager.obj_palette, count, alignment);
}

inline ResourceReservation reserve_next_oam_sprites(EngineResourceManager& manager, uint16_t count, uint16_t alignment = 1) {
    return reserve_next_resource_range(manager.oam_sprites, count, alignment);
}

ResourceReservation reserve_tile_asset(EngineResourceManager& manager, const TileAsset& asset);
ResourceReservation reserve_palette_asset(EngineResourceManager& manager, const PaletteAsset& asset, bool object_palette);
bool reserve_resource_batch(EngineResourceManager& manager, const ResourceBatch& batch, ResourceBatchReservation& reservation);
bool release_resource_batch(EngineResourceManager& manager, const ResourceBatch& batch, ResourceBatchReservation& reservation);
ResourceBankReservation preview_resource_bank_reservation(const EngineResourceManager& manager, const ResourceBank& bank);
ResourceBankReservation reserve_resource_bank(EngineResourceManager& manager, const ResourceBank& bank);
bool release_resource_bank(EngineResourceManager& manager, ResourceBankReservation& reservation);
bool preview_resource_banks(const EngineResourceManager& manager, const ResourceBankBatch& batch, ResourceBankBatchReservation& reservation);
bool reserve_resource_banks(EngineResourceManager& manager, const ResourceBankBatch& batch, ResourceBankBatchReservation& reservation);
bool release_resource_banks(EngineResourceManager& manager, ResourceBankBatchReservation& reservation);
bool hot_swap_resource_banks(EngineResourceManager& manager, ResourceBankBatchReservation& active, const ResourceBankBatch& next_batch, ResourceBankBatchReservation& next);
bool preview_resource_bank_group(const EngineResourceManager& manager, const ResourceBankGroup& group, ResourceBankBatchReservation& reservation);
bool reserve_resource_bank_group(EngineResourceManager& manager, const ResourceBankGroup& group, ResourceBankBatchReservation& reservation);
bool release_resource_bank_group(EngineResourceManager& manager, ResourceBankBatchReservation& reservation);
bool hot_swap_resource_bank_group(EngineResourceManager& manager, ResourceBankBatchReservation& active, const ResourceBankGroup& next_group, ResourceBankBatchReservation& next);
bool stream_resource_bank_group(EngineResourceManager& manager, ResourceBankBatchReservation& active, ResourceBankBatchReservation& scratch, const ResourceBankGroup& group);
ResourceStreamResult stream_resource_bank_group_with_uploads(
    EngineResourceManager& manager,
    ResourceBankBatchReservation& active,
    ResourceBankBatchReservation& scratch,
    const ResourceBankGroup& group,
    const ResourceBankUploadSource* sources,
    size_t source_count
);
void clear_resource_bank_cache(ResourceBankCache& cache);
bool release_resource_bank_cache(EngineResourceManager& manager, ResourceBankCache& cache);
bool set_resource_bank_cache_locked(ResourceBankCache& cache, size_t entry_index, bool locked);
bool touch_resource_bank_cache_entry(ResourceBankCache& cache, size_t entry_index, uint32_t tick);
ResourceBankCachePrunePreview preview_resource_bank_cache_prune(const ResourceBankCache& cache, ResourceBankCachePrunePolicy policy);
ResourceBankCachePruneResult prune_resource_bank_cache(EngineResourceManager& manager, ResourceBankCache& cache, ResourceBankCachePrunePolicy policy);
ResourceBankCacheResult reserve_resource_bank_cached(EngineResourceManager& manager, ResourceBankCache& cache, const ResourceBank& bank, uint8_t priority, uint32_t tick);
bool resource_bank_cache_contains_group(const ResourceBankCache& cache, const ResourceBankGroup& group);
ResourceBankCacheGroupResult promote_resource_bank_group_from_cache(ResourceBankCache& cache, const ResourceBankGroup& group, ResourceBankBatchReservation& active);
ResourceBankCacheGroupResult hot_swap_resource_bank_group_from_cache(EngineResourceManager& manager, ResourceBankBatchReservation& active, ResourceBankCache& cache, const ResourceBankGroup& group);
uint8_t resource_bank_prefetch_priority_for_area(
    Rect area_pixels,
    Vec2i camera_center_pixels,
    uint8_t near_priority = 224,
    uint8_t far_priority = 32,
    uint16_t falloff_pixels = 512
);
bool resource_bank_prefetch_area_overlaps_window(
    Rect area_pixels,
    ResourceBankPrefetchWindow window
);
bool resource_bank_prefetch_policy_allows_reservation(
    ResourceBankPrefetchPolicy policy,
    size_t reserved_count
);
bool resource_bank_prefetch_policy_allows_upload(
    ResourceBankPrefetchPolicy policy,
    size_t uploaded_count
);
ResourceBankPrefetchResult prefetch_resource_banks_for_camera(
    EngineResourceManager& manager,
    ResourceBankCache& cache,
    const ResourceBankPrefetchRequest* requests,
    size_t request_count,
    Vec2i camera_center_pixels,
    uint32_t tick
);
ResourceBankPrefetchResult prefetch_resource_banks_for_camera_policy(
    EngineResourceManager& manager,
    ResourceBankCache& cache,
    const ResourceBankPrefetchRequest* requests,
    size_t request_count,
    Vec2i camera_center_pixels,
    uint32_t tick,
    ResourceBankPrefetchPolicy policy
);
ResourceBankPrefetchResult prefetch_resource_banks_for_camera_window(
    EngineResourceManager& manager,
    ResourceBankCache& cache,
    const ResourceBankPrefetchRequest* requests,
    size_t request_count,
    Vec2i camera_center_pixels,
    uint32_t tick,
    ResourceBankPrefetchWindow window
);
ResourceBankPrefetchResult prefetch_resource_banks_for_camera_window_policy(
    EngineResourceManager& manager,
    ResourceBankCache& cache,
    const ResourceBankPrefetchRequest* requests,
    size_t request_count,
    Vec2i camera_center_pixels,
    uint32_t tick,
    ResourceBankPrefetchWindow window,
    ResourceBankPrefetchPolicy policy
);
ResourceBankPrefetchResult prefetch_resource_banks_for_camera_with_uploads(
    EngineResourceManager& manager,
    ResourceBankCache& cache,
    const ResourceBankPrefetchRequest* requests,
    size_t request_count,
    Vec2i camera_center_pixels,
    uint32_t tick,
    const ResourceBankUploadSource* sources,
    size_t source_count
);
ResourceBankPrefetchResult prefetch_resource_banks_for_camera_with_uploads_policy(
    EngineResourceManager& manager,
    ResourceBankCache& cache,
    const ResourceBankPrefetchRequest* requests,
    size_t request_count,
    Vec2i camera_center_pixels,
    uint32_t tick,
    const ResourceBankUploadSource* sources,
    size_t source_count,
    ResourceBankPrefetchPolicy policy
);
ResourceBankPrefetchResult prefetch_resource_banks_for_camera_window_with_uploads(
    EngineResourceManager& manager,
    ResourceBankCache& cache,
    const ResourceBankPrefetchRequest* requests,
    size_t request_count,
    Vec2i camera_center_pixels,
    uint32_t tick,
    ResourceBankPrefetchWindow window,
    const ResourceBankUploadSource* sources,
    size_t source_count
);
ResourceBankPrefetchResult prefetch_resource_banks_for_camera_window_with_uploads_policy(
    EngineResourceManager& manager,
    ResourceBankCache& cache,
    const ResourceBankPrefetchRequest* requests,
    size_t request_count,
    Vec2i camera_center_pixels,
    uint32_t tick,
    ResourceBankPrefetchWindow window,
    const ResourceBankUploadSource* sources,
    size_t source_count,
    ResourceBankPrefetchPolicy policy
);
inline bool enqueue_resource_bank_upload_vblank(const ResourceBankReservation& reservation, const void* source) {
    DmaTransfer transfer {};
    return resource_bank_upload_transfer(reservation, source, transfer) && dma_enqueue_vblank(transfer);
}

inline bool enqueue_resource_bank_uploads_vblank(const ResourceBankBatchReservation& reservation, const void* const* sources, size_t source_count) {
    if (!reservation.success ||
        reservation.reservations == nullptr ||
        sources == nullptr ||
        source_count < reservation.reservation_count ||
        dma_vblank_queue_count() + reservation.reservation_count > dma_vblank_queue_capacity) {
        return false;
    }

    if (reservation.reservation_count > max_resource_bank_cache_entries) {
        return false;
    }

    DmaTransfer transfer {};
    for (size_t index = 0; index < reservation.reservation_count; ++index) {
        if (!resource_bank_upload_transfer(reservation.reservations[index], sources[index], transfer)) {
            return false;
        }
    }

    for (size_t index = 0; index < reservation.reservation_count; ++index) {
        if (!resource_bank_upload_transfer(reservation.reservations[index], sources[index], transfer) ||
            !dma_enqueue_vblank(transfer)) {
            return false;
        }
    }
    return true;
}

inline bool enqueue_resource_bank_upload_sources_vblank(const ResourceBankBatchReservation& reservation, const ResourceBankUploadSource* sources, size_t source_count) {
    if (!reservation.success ||
        reservation.reservations == nullptr ||
        reservation.reservation_count > max_resource_bank_cache_entries) {
        return false;
    }

    size_t upload_count = 0;
    DmaTransfer transfer {};
    for (size_t index = 0; index < reservation.reservation_count; ++index) {
        if (!resource_bank_requires_upload_source(reservation.reservations[index].kind)) {
            continue;
        }
        if (sources == nullptr) {
            return false;
        }
        const void* source = resource_bank_upload_source_by_name(
            sources,
            source_count,
            reservation.reservations[index].name
        );
        if (source == nullptr ||
            !resource_bank_upload_transfer(reservation.reservations[index], source, transfer)) {
            return false;
        }
        ++upload_count;
    }

    if (upload_count == 0) {
        return true;
    }
    if (dma_vblank_queue_count() + upload_count > dma_vblank_queue_capacity) {
        return false;
    }

    for (size_t index = 0; index < reservation.reservation_count; ++index) {
        if (!resource_bank_requires_upload_source(reservation.reservations[index].kind)) {
            continue;
        }
        const void* source = resource_bank_upload_source_by_name(
            sources,
            source_count,
            reservation.reservations[index].name
        );
        if (!resource_bank_upload_transfer(reservation.reservations[index], source, transfer) ||
            !dma_enqueue_vblank(transfer)) {
            return false;
        }
    }
    return true;
}
bool release_bg_tiles(EngineResourceManager& manager, ResourceReservation reservation);
bool release_obj_tiles(EngineResourceManager& manager, ResourceReservation reservation);
bool release_bg_palette_colors(EngineResourceManager& manager, ResourceReservation reservation);
bool release_obj_palette_colors(EngineResourceManager& manager, ResourceReservation reservation);
bool release_oam_sprites(EngineResourceManager& manager, ResourceReservation reservation);

} // namespace gbs
