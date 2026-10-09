#include "gbs/resource_manager.hpp"

namespace gbs {

namespace {

#if defined(__arm__) || defined(__thumb__)
#define GBS_RESOURCE_EWRAM __attribute__((section(".ewram_bss")))
#else
#define GBS_RESOURCE_EWRAM
#endif

ResourceBankCacheEntry cached_reserve_cache_snapshot[max_resource_bank_cache_entries] GBS_RESOURCE_EWRAM;
EngineResourceSnapshot cached_reserve_manager_snapshot GBS_RESOURCE_EWRAM;

void capture_resource_pool_snapshot_into(const StaticResourcePool& pool, ResourcePoolSnapshot& snapshot) {
    for (size_t index = 0; index < 1024; ++index) {
        snapshot.used[index] = pool.used[index];
    }
    snapshot.capacity = pool.capacity;
    snapshot.valid = pool.capacity <= 1024;
}

void capture_resource_manager_snapshot_into(const EngineResourceManager& manager, EngineResourceSnapshot& snapshot) {
    capture_resource_pool_snapshot_into(manager.bg_tiles, snapshot.bg_tiles);
    capture_resource_pool_snapshot_into(manager.obj_tiles, snapshot.obj_tiles);
    capture_resource_pool_snapshot_into(manager.bg_palette, snapshot.bg_palette);
    capture_resource_pool_snapshot_into(manager.obj_palette, snapshot.obj_palette);
    capture_resource_pool_snapshot_into(manager.oam_sprites, snapshot.oam_sprites);
    snapshot.valid = snapshot.bg_tiles.valid &&
        snapshot.obj_tiles.valid &&
        snapshot.bg_palette.valid &&
        snapshot.obj_palette.valid &&
        snapshot.oam_sprites.valid;
}

bool is_valid_resource_pool_snapshot(const ResourcePoolSnapshot& snapshot) {
    return snapshot.valid && snapshot.capacity > 0 && snapshot.capacity <= 1024;
}

#undef GBS_RESOURCE_EWRAM

} // namespace

ResourceBankLease::ResourceBankLease()
    : manager_(nullptr), reservation_ {} {
}

ResourceBankLease::ResourceBankLease(EngineResourceManager& manager, const ResourceBank& bank)
    : ResourceBankLease() {
    acquire(manager, bank);
}

ResourceBankLease::~ResourceBankLease() {
    release();
}

bool ResourceBankLease::acquire(EngineResourceManager& manager, const ResourceBank& bank) {
    if (!release()) {
        return false;
    }
    reservation_ = reserve_resource_bank(manager, bank);
    manager_ = reservation_.success ? &manager : nullptr;
    return reservation_.success;
}

bool ResourceBankLease::release() {
    if (manager_ == nullptr || !reservation_.success) {
        manager_ = nullptr;
        reservation_ = ResourceBankReservation {};
        return true;
    }
    if (!release_resource_bank(*manager_, reservation_)) {
        return false;
    }
    manager_ = nullptr;
    reservation_ = ResourceBankReservation {};
    return true;
}

bool ResourceBankLease::valid() const {
    return manager_ != nullptr && reservation_.success;
}

const ResourceBankReservation& ResourceBankLease::reservation() const {
    return reservation_;
}

ResourceBankGroupLease::ResourceBankGroupLease()
    : manager_(nullptr), reservation_ {} {
}

ResourceBankGroupLease::ResourceBankGroupLease(
    EngineResourceManager& manager,
    const ResourceBankGroup& group,
    ResourceBankReservation* reservations,
    size_t reservation_capacity
)
    : ResourceBankGroupLease() {
    acquire(manager, group, reservations, reservation_capacity);
}

ResourceBankGroupLease::~ResourceBankGroupLease() {
    release();
}

bool ResourceBankGroupLease::acquire(
    EngineResourceManager& manager,
    const ResourceBankGroup& group,
    ResourceBankReservation* reservations,
    size_t reservation_capacity
) {
    if (!release()) {
        return false;
    }
    reservation_ = ResourceBankBatchReservation {
        reservations,
        reservation_capacity,
        0,
        nullptr,
        false,
    };
    if (!reserve_resource_bank_group(manager, group, reservation_)) {
        return false;
    }
    manager_ = &manager;
    return true;
}

bool ResourceBankGroupLease::release() {
    if (manager_ == nullptr || !reservation_.success) {
        manager_ = nullptr;
        reservation_.reservation_count = 0;
        reservation_.group_name = nullptr;
        reservation_.success = false;
        return true;
    }
    if (!release_resource_bank_group(*manager_, reservation_)) {
        return false;
    }
    manager_ = nullptr;
    reservation_.reservation_count = 0;
    reservation_.group_name = nullptr;
    reservation_.success = false;
    return true;
}

bool ResourceBankGroupLease::valid() const {
    return manager_ != nullptr && reservation_.success;
}

const ResourceBankBatchReservation& ResourceBankGroupLease::reservation() const {
    return reservation_;
}

void init_resource_pool(StaticResourcePool& pool, uint16_t capacity) {
    pool.capacity = capacity <= 1024 ? capacity : 1024;
    reset_resource_pool(pool);
}

void reset_resource_pool(StaticResourcePool& pool) {
    for (size_t index = 0; index < 1024; ++index) {
        pool.used[index] = false;
    }
    pool.used_count = 0;
}

uint16_t resource_pool_used_count(const StaticResourcePool& pool) {
    return pool.used_count;
}

uint16_t resource_pool_remaining_count(const StaticResourcePool& pool) {
    return static_cast<uint16_t>(pool.capacity - resource_pool_used_count(pool));
}

uint16_t resource_pool_largest_free_block(const StaticResourcePool& pool) {
    uint16_t best = 0;
    uint16_t current = 0;
    for (uint16_t index = 0; index < pool.capacity; ++index) {
        if (pool.used[index]) {
            if (current > best) {
                best = current;
            }
            current = 0;
        } else {
            ++current;
        }
    }
    return current > best ? current : best;
}

uint16_t resource_pool_free_block_count(const StaticResourcePool& pool) {
    uint16_t block_count = 0;
    bool in_free_block = false;
    for (uint16_t index = 0; index < pool.capacity; ++index) {
        if (pool.used[index]) {
            in_free_block = false;
        } else if (!in_free_block) {
            ++block_count;
            in_free_block = true;
        }
    }
    return block_count;
}

ResourcePoolUsage capture_resource_pool_usage(const StaticResourcePool& pool) {
    const uint16_t used = resource_pool_used_count(pool);
    return ResourcePoolUsage {
        pool.capacity,
        used,
        static_cast<uint16_t>(pool.capacity - used),
        resource_pool_largest_free_block(pool),
        resource_pool_free_block_count(pool),
    };
}

ResourcePoolUsage capture_resource_pool_resident_usage(const StaticResourcePool& pool) {
    const uint16_t used = resource_pool_used_count(pool);
    return ResourcePoolUsage {
        pool.capacity,
        used,
        static_cast<uint16_t>(pool.capacity - used),
        0,
        0,
    };
}

ResourceReservation reserve_resource_range(StaticResourcePool& pool, uint16_t start, uint16_t count) {
    if (count == 0 || start >= pool.capacity || static_cast<uint32_t>(start) + count > pool.capacity) {
        return ResourceReservation { 0, 0, false };
    }

    for (uint16_t index = start; index < start + count; ++index) {
        if (pool.used[index]) {
            return ResourceReservation { 0, 0, false };
        }
    }

    for (uint16_t index = start; index < start + count; ++index) {
        pool.used[index] = true;
    }
    pool.used_count = static_cast<uint16_t>(pool.used_count + count);
    return ResourceReservation { start, count, true };
}

ResourceReservation find_next_resource_range(const StaticResourcePool& pool, uint16_t count, uint16_t alignment) {
    if (count == 0 || count > pool.capacity) {
        return ResourceReservation { 0, 0, false };
    }

    uint16_t safe_alignment = alignment == 0 ? 1 : alignment;
    for (uint16_t start = 0; static_cast<uint32_t>(start) + count <= pool.capacity; ++start) {
        if (start % safe_alignment != 0) {
            continue;
        }

        bool available = true;
        for (uint16_t index = start; index < start + count; ++index) {
            if (pool.used[index]) {
                available = false;
                break;
            }
        }
        if (available) {
            return ResourceReservation { start, count, true };
        }
    }

    return ResourceReservation { 0, 0, false };
}

ResourceReservation reserve_next_resource_range(StaticResourcePool& pool, uint16_t count, uint16_t alignment) {
    const ResourceReservation fit = find_next_resource_range(pool, count, alignment);
    return fit.success ? reserve_resource_range(pool, fit.start, fit.count) : fit;
}

bool release_resource_range(StaticResourcePool& pool, ResourceReservation reservation) {
    if (!resource_reservation_ok(reservation) ||
        reservation.start >= pool.capacity ||
        static_cast<uint32_t>(reservation.start) + reservation.count > pool.capacity) {
        return false;
    }

    for (uint16_t index = reservation.start; index < reservation.start + reservation.count; ++index) {
        if (!pool.used[index]) {
            return false;
        }
    }

    for (uint16_t index = reservation.start; index < reservation.start + reservation.count; ++index) {
        pool.used[index] = false;
    }
    pool.used_count = static_cast<uint16_t>(pool.used_count - reservation.count);
    return true;
}

ResourcePoolSnapshot capture_resource_pool_snapshot(const StaticResourcePool& pool) {
    ResourcePoolSnapshot snapshot {};
    snapshot.capacity = pool.capacity;
    snapshot.valid = pool.capacity <= 1024;
    for (size_t index = 0; index < 1024; ++index) {
        snapshot.used[index] = snapshot.valid && index < pool.capacity ? pool.used[index] : false;
    }
    return snapshot;
}

bool restore_resource_pool_snapshot(StaticResourcePool& pool, const ResourcePoolSnapshot& snapshot) {
    if (!snapshot.valid || snapshot.capacity == 0 || snapshot.capacity > 1024) {
        return false;
    }

    pool.capacity = snapshot.capacity;
    for (size_t index = 0; index < 1024; ++index) {
        pool.used[index] = index < snapshot.capacity ? snapshot.used[index] : false;
    }
    pool.used_count = 0;
    for (uint16_t index = 0; index < pool.capacity; ++index) {
        if (pool.used[index]) {
            ++pool.used_count;
        }
    }
    return true;
}

void init_resource_manager(EngineResourceManager& manager) {
    init_resource_pool(manager.bg_tiles, max_bg_tiles);
    init_resource_pool(manager.obj_tiles, max_obj_tiles);
    init_resource_pool(manager.bg_palette, max_palette_colors);
    init_resource_pool(manager.obj_palette, max_palette_colors);
    init_resource_pool(manager.oam_sprites, max_oam_sprites);
}

EngineResourceSnapshot capture_resource_manager_snapshot(const EngineResourceManager& manager) {
    EngineResourceSnapshot snapshot {};
    snapshot.bg_tiles = capture_resource_pool_snapshot(manager.bg_tiles);
    snapshot.obj_tiles = capture_resource_pool_snapshot(manager.obj_tiles);
    snapshot.bg_palette = capture_resource_pool_snapshot(manager.bg_palette);
    snapshot.obj_palette = capture_resource_pool_snapshot(manager.obj_palette);
    snapshot.oam_sprites = capture_resource_pool_snapshot(manager.oam_sprites);
    snapshot.valid = snapshot.bg_tiles.valid &&
        snapshot.obj_tiles.valid &&
        snapshot.bg_palette.valid &&
        snapshot.obj_palette.valid &&
        snapshot.oam_sprites.valid;
    return snapshot;
}

bool restore_resource_manager_snapshot(EngineResourceManager& manager, const EngineResourceSnapshot& snapshot) {
    if (!snapshot.valid ||
        !is_valid_resource_pool_snapshot(snapshot.bg_tiles) ||
        !is_valid_resource_pool_snapshot(snapshot.obj_tiles) ||
        !is_valid_resource_pool_snapshot(snapshot.bg_palette) ||
        !is_valid_resource_pool_snapshot(snapshot.obj_palette) ||
        !is_valid_resource_pool_snapshot(snapshot.oam_sprites)) {
        return false;
    }

    return restore_resource_pool_snapshot(manager.bg_tiles, snapshot.bg_tiles) &&
        restore_resource_pool_snapshot(manager.obj_tiles, snapshot.obj_tiles) &&
        restore_resource_pool_snapshot(manager.bg_palette, snapshot.bg_palette) &&
        restore_resource_pool_snapshot(manager.obj_palette, snapshot.obj_palette) &&
        restore_resource_pool_snapshot(manager.oam_sprites, snapshot.oam_sprites);
}

EngineResourceUsage capture_engine_resource_usage(const EngineResourceManager& manager) {
    return EngineResourceUsage {
        capture_resource_pool_usage(manager.bg_tiles),
        capture_resource_pool_usage(manager.obj_tiles),
        capture_resource_pool_usage(manager.bg_palette),
        capture_resource_pool_usage(manager.obj_palette),
        capture_resource_pool_usage(manager.oam_sprites),
    };
}

EngineResourceUsage capture_engine_resident_resource_usage(const EngineResourceManager& manager) {
    return EngineResourceUsage {
        capture_resource_pool_resident_usage(manager.bg_tiles),
        capture_resource_pool_resident_usage(manager.obj_tiles),
        capture_resource_pool_resident_usage(manager.bg_palette),
        capture_resource_pool_resident_usage(manager.obj_palette),
        capture_resource_pool_resident_usage(manager.oam_sprites),
    };
}

StaticResourcePool* resource_pool_for_kind(EngineResourceManager& manager, ResourcePoolKind kind) {
    switch (kind) {
    case ResourcePoolKind::BgTiles:
        return &manager.bg_tiles;
    case ResourcePoolKind::ObjTiles:
        return &manager.obj_tiles;
    case ResourcePoolKind::BgPalette:
        return &manager.bg_palette;
    case ResourcePoolKind::ObjPalette:
        return &manager.obj_palette;
    case ResourcePoolKind::OamSprites:
        return &manager.oam_sprites;
    }
    return nullptr;
}

const StaticResourcePool* resource_pool_for_kind(const EngineResourceManager& manager, ResourcePoolKind kind) {
    switch (kind) {
    case ResourcePoolKind::BgTiles:
        return &manager.bg_tiles;
    case ResourcePoolKind::ObjTiles:
        return &manager.obj_tiles;
    case ResourcePoolKind::BgPalette:
        return &manager.bg_palette;
    case ResourcePoolKind::ObjPalette:
        return &manager.obj_palette;
    case ResourcePoolKind::OamSprites:
        return &manager.oam_sprites;
    }
    return nullptr;
}

ResourceReservation reserve_tile_asset(EngineResourceManager& manager, const TileAsset& asset) {
    if (!is_valid_tile_asset(asset)) {
        return ResourceReservation { 0, 0, false };
    }
    StaticResourcePool& pool = asset.object_tiles ? manager.obj_tiles : manager.bg_tiles;
    return reserve_resource_range(pool, asset.destination_tile, asset.tile_count);
}

ResourceReservation reserve_palette_asset(EngineResourceManager& manager, const PaletteAsset& asset, bool object_palette) {
    if (!is_valid_palette_asset(asset)) {
        return ResourceReservation { 0, 0, false };
    }
    StaticResourcePool& pool = object_palette ? manager.obj_palette : manager.bg_palette;
    return reserve_resource_range(pool, asset.start_index, asset.color_count);
}

namespace {

void clear_batch_reservation(ResourceBatchReservation& reservation) {
    reservation.tile_reservation_count = 0;
    reservation.bg_palette_reservation_count = 0;
    reservation.obj_palette_reservation_count = 0;
    reservation.oam_sprites = ResourceReservation { 0, 0, false };
    reservation.success = false;
}

bool has_valid_batch_buffers(const ResourceBatch& batch, const ResourceBatchReservation& reservation) {
    if (batch.tile_asset_count > 0 &&
        (batch.tile_assets == nullptr ||
         reservation.tile_reservations == nullptr ||
         reservation.tile_reservation_capacity < batch.tile_asset_count)) {
        return false;
    }
    if (batch.bg_palette_count > 0 &&
        (batch.bg_palettes == nullptr ||
         reservation.bg_palette_reservations == nullptr ||
         reservation.bg_palette_reservation_capacity < batch.bg_palette_count)) {
        return false;
    }
    if (batch.obj_palette_count > 0 &&
        (batch.obj_palettes == nullptr ||
         reservation.obj_palette_reservations == nullptr ||
         reservation.obj_palette_reservation_capacity < batch.obj_palette_count)) {
        return false;
    }
    return true;
}

} // namespace

bool reserve_resource_batch(EngineResourceManager& manager, const ResourceBatch& batch, ResourceBatchReservation& reservation) {
    clear_batch_reservation(reservation);
    if (!has_valid_batch_buffers(batch, reservation)) {
        return false;
    }

    EngineResourceSnapshot snapshot = capture_resource_manager_snapshot(manager);
    if (!snapshot.valid) {
        return false;
    }

    for (size_t index = 0; index < batch.tile_asset_count; ++index) {
        ResourceReservation asset_reservation = reserve_tile_asset(manager, batch.tile_assets[index]);
        if (!asset_reservation.success) {
            restore_resource_manager_snapshot(manager, snapshot);
            clear_batch_reservation(reservation);
            return false;
        }
        reservation.tile_reservations[index] = asset_reservation;
        reservation.tile_reservation_count = index + 1;
    }

    for (size_t index = 0; index < batch.bg_palette_count; ++index) {
        ResourceReservation asset_reservation = reserve_palette_asset(manager, batch.bg_palettes[index], false);
        if (!asset_reservation.success) {
            restore_resource_manager_snapshot(manager, snapshot);
            clear_batch_reservation(reservation);
            return false;
        }
        reservation.bg_palette_reservations[index] = asset_reservation;
        reservation.bg_palette_reservation_count = index + 1;
    }

    for (size_t index = 0; index < batch.obj_palette_count; ++index) {
        ResourceReservation asset_reservation = reserve_palette_asset(manager, batch.obj_palettes[index], true);
        if (!asset_reservation.success) {
            restore_resource_manager_snapshot(manager, snapshot);
            clear_batch_reservation(reservation);
            return false;
        }
        reservation.obj_palette_reservations[index] = asset_reservation;
        reservation.obj_palette_reservation_count = index + 1;
    }

    if (batch.oam_sprite_count > 0) {
        reservation.oam_sprites = reserve_next_oam_sprites(
            manager,
            batch.oam_sprite_count,
            batch.oam_sprite_alignment == 0 ? 1 : batch.oam_sprite_alignment
        );
        if (!reservation.oam_sprites.success) {
            restore_resource_manager_snapshot(manager, snapshot);
            clear_batch_reservation(reservation);
            return false;
        }
    }

    reservation.success = true;
    return true;
}

bool release_resource_batch(EngineResourceManager& manager, const ResourceBatch& batch, ResourceBatchReservation& reservation) {
    if (!reservation.success || !has_valid_batch_buffers(batch, reservation)) {
        return false;
    }
    if (reservation.tile_reservation_count != batch.tile_asset_count ||
        reservation.bg_palette_reservation_count != batch.bg_palette_count ||
        reservation.obj_palette_reservation_count != batch.obj_palette_count) {
        return false;
    }
    if (batch.oam_sprite_count > 0 && !reservation.oam_sprites.success) {
        return false;
    }

    EngineResourceSnapshot snapshot = capture_resource_manager_snapshot(manager);
    if (!snapshot.valid) {
        return false;
    }

    for (size_t index = 0; index < batch.tile_asset_count; ++index) {
        bool released = batch.tile_assets[index].object_tiles
            ? release_obj_tiles(manager, reservation.tile_reservations[index])
            : release_bg_tiles(manager, reservation.tile_reservations[index]);
        if (!released) {
            restore_resource_manager_snapshot(manager, snapshot);
            return false;
        }
    }

    for (size_t index = 0; index < batch.bg_palette_count; ++index) {
        if (!release_bg_palette_colors(manager, reservation.bg_palette_reservations[index])) {
            restore_resource_manager_snapshot(manager, snapshot);
            return false;
        }
    }

    for (size_t index = 0; index < batch.obj_palette_count; ++index) {
        if (!release_obj_palette_colors(manager, reservation.obj_palette_reservations[index])) {
            restore_resource_manager_snapshot(manager, snapshot);
            return false;
        }
    }

    if (batch.oam_sprite_count > 0 && !release_oam_sprites(manager, reservation.oam_sprites)) {
        restore_resource_manager_snapshot(manager, snapshot);
        return false;
    }

    clear_batch_reservation(reservation);
    return true;
}

ResourceBankReservation preview_resource_bank_reservation(const EngineResourceManager& manager, const ResourceBank& bank) {
    ResourceBankReservation result {
        bank.kind,
        ResourceReservation { 0, 0, false },
        bank.name,
        false,
    };
    const StaticResourcePool* pool = resource_pool_for_kind(manager, bank.kind);
    if (pool == nullptr || bank.count == 0) {
        return result;
    }

    if (is_auto_resource_bank_start(bank.start)) {
        result.reservation = find_next_resource_range(*pool, bank.count, bank.alignment == 0 ? 1 : bank.alignment);
    } else {
        if (bank.alignment > 1 && bank.start % bank.alignment != 0) {
            return result;
        }
        if (bank.count == 0 ||
            bank.start >= pool->capacity ||
            static_cast<uint32_t>(bank.start) + bank.count > pool->capacity) {
            return result;
        }
        for (uint16_t index = bank.start; index < bank.start + bank.count; ++index) {
            if (pool->used[index]) {
                return result;
            }
        }
        result.reservation = ResourceReservation { bank.start, bank.count, true };
    }
    result.success = result.reservation.success;
    return result;
}

ResourceBankReservation reserve_resource_bank(EngineResourceManager& manager, const ResourceBank& bank) {
    ResourceBankReservation result = preview_resource_bank_reservation(manager, bank);
    if (!result.success) {
        return result;
    }

    StaticResourcePool* pool = resource_pool_for_kind(manager, bank.kind);
    if (pool == nullptr) {
        result.reservation = ResourceReservation { 0, 0, false };
        result.success = false;
        return result;
    }

    result.reservation = reserve_resource_range(*pool, result.reservation.start, result.reservation.count);
    result.success = result.reservation.success;
    return result;
}

bool release_resource_bank(EngineResourceManager& manager, ResourceBankReservation& reservation) {
    if (!reservation.success) {
        return false;
    }
    StaticResourcePool* pool = resource_pool_for_kind(manager, reservation.kind);
    if (pool == nullptr || !release_resource_range(*pool, reservation.reservation)) {
        return false;
    }
    reservation.reservation = ResourceReservation { 0, 0, false };
    reservation.success = false;
    return true;
}

namespace {

void clear_bank_batch_reservation(ResourceBankBatchReservation& reservation) {
    reservation.reservation_count = 0;
    reservation.group_name = nullptr;
    reservation.success = false;
}

bool has_valid_bank_batch_buffers(const ResourceBankBatch& batch, const ResourceBankBatchReservation& reservation) {
    if (batch.bank_count == 0) {
        return true;
    }
    return batch.banks != nullptr &&
        reservation.reservations != nullptr &&
        reservation.reservation_capacity >= batch.bank_count;
}

bool can_release_resource_bank_reservation(
    const EngineResourceManager& manager,
    const ResourceBankReservation& reservation
) {
    if (!reservation.success ||
        !resource_reservation_ok(reservation.reservation) ||
        !is_valid_resource_pool_kind(reservation.kind)) {
        return false;
    }

    const StaticResourcePool* pool = resource_pool_for_kind(manager, reservation.kind);
    if (pool == nullptr ||
        reservation.reservation.start >= pool->capacity ||
        static_cast<uint32_t>(reservation.reservation.start) + reservation.reservation.count > pool->capacity) {
        return false;
    }

    for (uint16_t index = reservation.reservation.start;
         index < reservation.reservation.start + reservation.reservation.count;
         ++index) {
        if (!pool->used[index]) {
            return false;
        }
    }
    return true;
}

bool resource_bank_reservations_overlap(
    const ResourceBankReservation& lhs,
    const ResourceBankReservation& rhs
) {
    if (lhs.kind != rhs.kind) {
        return false;
    }
    const uint32_t lhs_end = static_cast<uint32_t>(lhs.reservation.start) + lhs.reservation.count;
    const uint32_t rhs_end = static_cast<uint32_t>(rhs.reservation.start) + rhs.reservation.count;
    return lhs.reservation.start < rhs_end && rhs.reservation.start < lhs_end;
}

bool can_release_resource_bank_batch(
    const EngineResourceManager& manager,
    const ResourceBankBatchReservation& reservation
) {
    if (!reservation.success ||
        reservation.reservations == nullptr ||
        reservation.reservation_count > reservation.reservation_capacity) {
        return false;
    }

    for (size_t index = 0; index < reservation.reservation_count; ++index) {
        if (!can_release_resource_bank_reservation(manager, reservation.reservations[index])) {
            return false;
        }
        for (size_t previous = 0; previous < index; ++previous) {
            if (resource_bank_reservations_overlap(
                    reservation.reservations[previous],
                    reservation.reservations[index])) {
                return false;
            }
        }
    }
    return true;
}

bool restore_resource_bank_batch(
    EngineResourceManager& manager,
    ResourceBankBatchReservation& reservation,
    size_t reservation_count,
    const char* group_name,
    bool success
) {
    for (size_t index = 0; index < reservation_count; ++index) {
        StaticResourcePool* pool = resource_pool_for_kind(manager, reservation.reservations[index].kind);
        if (pool == nullptr ||
            !reserve_resource_range(
                *pool,
                reservation.reservations[index].reservation.start,
                reservation.reservations[index].reservation.count
            ).success) {
            return false;
        }
    }
    reservation.reservation_count = reservation_count;
    reservation.group_name = group_name;
    reservation.success = success;
    return true;
}

} // namespace

bool preview_resource_banks(const EngineResourceManager& manager, const ResourceBankBatch& batch, ResourceBankBatchReservation& reservation) {
    clear_bank_batch_reservation(reservation);
    if (!has_valid_bank_batch_buffers(batch, reservation)) {
        return false;
    }

    EngineResourceManager probe = manager;
    if (!reserve_resource_banks(probe, batch, reservation)) {
        clear_bank_batch_reservation(reservation);
        return false;
    }

    return true;
}

bool reserve_resource_banks(EngineResourceManager& manager, const ResourceBankBatch& batch, ResourceBankBatchReservation& reservation) {
    clear_bank_batch_reservation(reservation);
    if (!has_valid_bank_batch_buffers(batch, reservation)) {
        return false;
    }

    for (size_t index = 0; index < batch.bank_count; ++index) {
        ResourceBankReservation bank_reservation = reserve_resource_bank(manager, batch.banks[index]);
        if (!bank_reservation.success) {
            for (size_t rollback = 0; rollback < reservation.reservation_count; ++rollback) {
                ResourceBankReservation released = reservation.reservations[rollback];
                release_resource_bank(manager, released);
            }
            clear_bank_batch_reservation(reservation);
            return false;
        }
        reservation.reservations[index] = bank_reservation;
        reservation.reservation_count = index + 1;
    }

    reservation.success = true;
    return true;
}

bool release_resource_banks(EngineResourceManager& manager, ResourceBankBatchReservation& reservation) {
    if (!can_release_resource_bank_batch(manager, reservation)) {
        return false;
    }

    const size_t count = reservation.reservation_count;
    for (size_t index = 0; index < count; ++index) {
        ResourceBankReservation released = reservation.reservations[index];
        if (!release_resource_bank(manager, released)) {
            restore_resource_bank_batch(
                manager,
                reservation,
                index,
                reservation.group_name,
                reservation.success
            );
            return false;
        }
    }

    clear_bank_batch_reservation(reservation);
    return true;
}

bool hot_swap_resource_banks(EngineResourceManager& manager, ResourceBankBatchReservation& active, const ResourceBankBatch& next_batch, ResourceBankBatchReservation& next) {
    if ((active.success && active.reservations == nullptr) ||
        !has_valid_bank_batch_buffers(next_batch, next)) {
        return false;
    }

    const size_t active_count = active.reservation_count;
    const char* active_group_name = active.group_name;
    const bool active_success = active.success;
    if (active.success) {
        if (!release_resource_banks(manager, active)) {
            return false;
        }
    }

    if (!reserve_resource_banks(manager, next_batch, next)) {
        clear_bank_batch_reservation(next);
        if (active_success) {
            restore_resource_bank_batch(
                manager,
                active,
                active_count,
                active_group_name,
                active_success
            );
        }
        return false;
    }

    clear_bank_batch_reservation(active);
    return true;
}

bool preview_resource_bank_group(const EngineResourceManager& manager, const ResourceBankGroup& group, ResourceBankBatchReservation& reservation) {
    if (group.bank_count > 0 && group.banks == nullptr) {
        clear_bank_batch_reservation(reservation);
        return false;
    }

    const ResourceBankBatch batch { group.banks, group.bank_count };
    if (!preview_resource_banks(manager, batch, reservation)) {
        return false;
    }

    reservation.group_name = group.name;
    return true;
}

bool reserve_resource_bank_group(EngineResourceManager& manager, const ResourceBankGroup& group, ResourceBankBatchReservation& reservation) {
    if (group.bank_count > 0 && group.banks == nullptr) {
        clear_bank_batch_reservation(reservation);
        return false;
    }
    const ResourceBankBatch batch { group.banks, group.bank_count };
    if (!reserve_resource_banks(manager, batch, reservation)) {
        return false;
    }
    reservation.group_name = group.name;
    return true;
}

bool release_resource_bank_group(EngineResourceManager& manager, ResourceBankBatchReservation& reservation) {
    return release_resource_banks(manager, reservation);
}

bool hot_swap_resource_bank_group(EngineResourceManager& manager, ResourceBankBatchReservation& active, const ResourceBankGroup& next_group, ResourceBankBatchReservation& next) {
    if (next_group.bank_count > 0 && next_group.banks == nullptr) {
        return false;
    }
    const ResourceBankBatch next_batch { next_group.banks, next_group.bank_count };
    if (!hot_swap_resource_banks(manager, active, next_batch, next)) {
        return false;
    }
    next.group_name = next_group.name;
    return true;
}

bool stream_resource_bank_group(EngineResourceManager& manager, ResourceBankBatchReservation& active, ResourceBankBatchReservation& scratch, const ResourceBankGroup& group) {
    if (group.bank_count > 0 && group.banks == nullptr) {
        return false;
    }
    if (active.success && resource_bank_name_equals(active.group_name, group.name)) {
        return true;
    }
    if (!active.success) {
        return reserve_resource_bank_group(manager, group, active);
    }

    if (!hot_swap_resource_bank_group(manager, active, group, scratch)) {
        return false;
    }

    ResourceBankBatchReservation previous_active = active;
    active = scratch;
    scratch = previous_active;
    clear_bank_batch_reservation(scratch);
    return true;
}

namespace {

ResourceStreamResult make_stream_result(
    bool success,
    ResourceStreamStatus status,
    const ResourceBankGroup& group,
    const ResourceBank* bank,
    const EngineResourceManager& manager,
    size_t uploaded_count,
    bool changed_group
) {
    ResourcePoolKind kind = bank != nullptr ? bank->kind : ResourcePoolKind::BgTiles;
    const StaticResourcePool* pool = resource_pool_for_kind(manager, kind);
    ResourcePoolUsage usage {};
    if (pool != nullptr) {
        usage = capture_resource_pool_usage(*pool);
    }

    return ResourceStreamResult {
        success,
        status,
        group.name,
        bank != nullptr ? bank->name : nullptr,
        kind,
        bank != nullptr ? bank->count : static_cast<uint16_t>(0),
        usage,
        uploaded_count,
        changed_group,
    };
}

const ResourceBank* first_missing_upload_source(
    const ResourceBankGroup& group,
    const ResourceBankUploadSource* sources,
    size_t source_count
) {
    if (group.bank_count == 0 || sources == nullptr || source_count == 0) {
        return nullptr;
    }
    for (size_t index = 0; index < group.bank_count; ++index) {
        if (!resource_bank_requires_upload_source(group.banks[index].kind)) {
            continue;
        }
        if (resource_bank_upload_source_by_name(sources, source_count, group.banks[index].name) == nullptr) {
            return &group.banks[index];
        }
    }
    return nullptr;
}

size_t required_upload_source_count(const ResourceBankGroup& group) {
    size_t count = 0;
    for (size_t index = 0; index < group.bank_count; ++index) {
        if (resource_bank_requires_upload_source(group.banks[index].kind)) {
            ++count;
        }
    }
    return count;
}

const ResourceBank* first_unreservable_bank_after_active_release(
    const EngineResourceManager& manager,
    const ResourceBankBatchReservation& active,
    const ResourceBankGroup& group
) {
    EngineResourceManager probe = manager;
    if (active.success && active.reservations != nullptr) {
        for (size_t index = 0; index < active.reservation_count; ++index) {
            ResourceBankReservation released = active.reservations[index];
            release_resource_bank(probe, released);
        }
    }

    for (size_t index = 0; index < group.bank_count; ++index) {
        ResourceBankReservation reservation = reserve_resource_bank(probe, group.banks[index]);
        if (!reservation.success) {
            return &group.banks[index];
        }
    }
    return group.bank_count > 0 ? &group.banks[0] : nullptr;
}

} // namespace

ResourceStreamResult stream_resource_bank_group_with_uploads(
    EngineResourceManager& manager,
    ResourceBankBatchReservation& active,
    ResourceBankBatchReservation& scratch,
    const ResourceBankGroup& group,
    const ResourceBankUploadSource* sources,
    size_t source_count
) {
    if ((group.bank_count > 0 && group.banks == nullptr) ||
        group.bank_count > scratch.reservation_capacity ||
        (!active.success && group.bank_count > active.reservation_capacity)) {
        const ResourceBank* bank = group.bank_count > 0 && group.banks != nullptr ? &group.banks[0] : nullptr;
        return make_stream_result(false, ResourceStreamStatus::InvalidGroup, group, bank, manager, 0, false);
    }

    if (active.success && resource_bank_name_equals(active.group_name, group.name)) {
        return make_stream_result(true, ResourceStreamStatus::AlreadyActive, group, nullptr, manager, 0, false);
    }

    const bool has_upload_sources = sources != nullptr && source_count > 0;
    const size_t upload_source_count = has_upload_sources ? required_upload_source_count(group) : 0;
    if (has_upload_sources) {
        const ResourceBank* missing = first_missing_upload_source(group, sources, source_count);
        if (missing != nullptr) {
            return make_stream_result(false, ResourceStreamStatus::MissingUploadSource, group, missing, manager, 0, false);
        }
        if (dma_vblank_queue_count() + upload_source_count > dma_vblank_queue_capacity) {
            const ResourceBank* bank = group.bank_count > 0 ? &group.banks[0] : nullptr;
            return make_stream_result(false, ResourceStreamStatus::DmaQueueFull, group, bank, manager, 0, false);
        }
    }

    if (!stream_resource_bank_group(manager, active, scratch, group)) {
        const ResourceBank* bank = first_unreservable_bank_after_active_release(manager, active, group);
        return make_stream_result(false, ResourceStreamStatus::ReservationFailed, group, bank, manager, 0, false);
    }

    if (!has_upload_sources) {
        return make_stream_result(true, ResourceStreamStatus::Ok, group, nullptr, manager, 0, true);
    }

    if (!enqueue_resource_bank_upload_sources_vblank(active, sources, source_count)) {
        const ResourceBank* bank = active.reservation_count > 0 && active.reservations != nullptr
            ? &group.banks[0]
            : nullptr;
        return make_stream_result(false, ResourceStreamStatus::UploadEnqueueFailed, group, bank, manager, 0, true);
    }

    return make_stream_result(true, ResourceStreamStatus::Ok, group, nullptr, manager, upload_source_count, true);
}

namespace {

ResourceBankCacheResult failed_cache_result() {
    return ResourceBankCacheResult {
        false,
        invalid_resource_bank_cache_index,
        0,
        ResourceBankReservation {
            ResourcePoolKind::BgTiles,
            ResourceReservation { 0, 0, false },
            nullptr,
            false,
        },
    };
}

ResourceBankPrefetchResult failed_prefetch_result(
    size_t request_index,
    size_t reserved_count,
    size_t reused_count,
    size_t skipped_count,
    size_t evicted_count,
    size_t uploaded_count,
    ResourceBankCacheResult last_result
) {
    return ResourceBankPrefetchResult {
        false,
        request_index,
        reserved_count,
        reused_count,
        skipped_count,
        evicted_count,
        uploaded_count,
        last_result,
    };
}

bool is_valid_bank_cache(const ResourceBankCache& cache) {
    return cache.capacity <= max_resource_bank_cache_entries &&
        cache.count <= cache.capacity &&
        (cache.capacity == 0 || cache.entries != nullptr);
}

size_t find_free_cache_slot(const ResourceBankCache& cache) {
    for (size_t index = 0; index < cache.count; ++index) {
        if (!cache.entries[index].active) {
            return index;
        }
    }
    return cache.count < cache.capacity ? cache.count : invalid_resource_bank_cache_index;
}

bool cached_bank_matches(const ResourceBankCacheEntry& entry, const ResourceBank& bank) {
    return entry.active &&
        entry.reservation.success &&
        entry.reservation.kind == bank.kind &&
        entry.reservation.reservation.count == bank.count &&
        resource_bank_name_equals(entry.reservation.name, bank.name);
}

size_t find_cached_bank_entry(const ResourceBankCache& cache, const ResourceBank& bank) {
    if (!is_valid_bank_cache(cache)) {
        return invalid_resource_bank_cache_index;
    }
    for (size_t index = 0; index < cache.count; ++index) {
        if (cached_bank_matches(cache.entries[index], bank)) {
            return index;
        }
    }
    return invalid_resource_bank_cache_index;
}

size_t find_eviction_candidate(const ResourceBankCache& cache, ResourcePoolKind kind, uint8_t incoming_priority) {
    size_t best = invalid_resource_bank_cache_index;
    for (size_t index = 0; index < cache.count; ++index) {
        const ResourceBankCacheEntry& entry = cache.entries[index];
        if (!entry.active ||
            entry.locked ||
            !entry.reservation.success ||
            entry.reservation.kind != kind ||
            entry.priority >= incoming_priority) {
            continue;
        }

        if (best == invalid_resource_bank_cache_index ||
            entry.priority < cache.entries[best].priority ||
            (entry.priority == cache.entries[best].priority &&
             entry.last_used_tick < cache.entries[best].last_used_tick)) {
            best = index;
        }
    }
    return best;
}

void restore_cache_entries(ResourceBankCache& cache, const ResourceBankCacheEntry* snapshot, size_t count) {
    for (size_t index = 0; index < count; ++index) {
        cache.entries[index] = snapshot[index];
    }
    for (size_t index = count; index < cache.capacity; ++index) {
        cache.entries[index] = ResourceBankCacheEntry {};
    }
    cache.count = count;
}

bool try_store_cache_reservation(ResourceBankCache& cache, ResourceBankReservation reservation, uint8_t priority, uint32_t tick, size_t& entry_index) {
    entry_index = find_free_cache_slot(cache);
    if (entry_index == invalid_resource_bank_cache_index) {
        return false;
    }

    cache.entries[entry_index] = ResourceBankCacheEntry {
        reservation,
        priority,
        tick,
        false,
        true,
    };
    if (entry_index == cache.count) {
        ++cache.count;
    }
    return true;
}

} // namespace

void clear_resource_bank_cache(ResourceBankCache& cache) {
    if (cache.entries == nullptr) {
        cache.count = 0;
        return;
    }

    const size_t safe_capacity = cache.capacity <= max_resource_bank_cache_entries ? cache.capacity : max_resource_bank_cache_entries;
    for (size_t index = 0; index < safe_capacity; ++index) {
        cache.entries[index] = ResourceBankCacheEntry {};
    }
    cache.count = 0;
}

bool release_resource_bank_cache(EngineResourceManager& manager, ResourceBankCache& cache) {
    if (!is_valid_bank_cache(cache)) {
        return false;
    }

    ResourceBankCacheEntry cache_snapshot[max_resource_bank_cache_entries] = {};
    const size_t original_count = cache.count;
    for (size_t index = 0; index < original_count; ++index) {
        cache_snapshot[index] = cache.entries[index];
    }
    const EngineResourceSnapshot manager_snapshot = capture_resource_manager_snapshot(manager);
    if (!manager_snapshot.valid) {
        return false;
    }

    for (size_t index = 0; index < original_count; ++index) {
        ResourceBankCacheEntry& entry = cache.entries[index];
        if (!entry.active || !entry.reservation.success) {
            continue;
        }
        if (!release_resource_bank(manager, entry.reservation)) {
            restore_resource_manager_snapshot(manager, manager_snapshot);
            restore_cache_entries(cache, cache_snapshot, original_count);
            return false;
        }
    }

    clear_resource_bank_cache(cache);
    return true;
}

bool set_resource_bank_cache_locked(ResourceBankCache& cache, size_t entry_index, bool locked) {
    if (!is_valid_bank_cache(cache) ||
        entry_index >= cache.count ||
        !cache.entries[entry_index].active) {
        return false;
    }

    cache.entries[entry_index].locked = locked;
    return true;
}

bool touch_resource_bank_cache_entry(ResourceBankCache& cache, size_t entry_index, uint32_t tick) {
    if (!is_valid_bank_cache(cache) ||
        entry_index >= cache.count ||
        !cache.entries[entry_index].active) {
        return false;
    }

    cache.entries[entry_index].last_used_tick = tick;
    return true;
}

namespace {

bool cache_entry_matches_prune_policy(const ResourceBankCacheEntry& entry, ResourceBankCachePrunePolicy policy) {
    if (!entry.active || !entry.reservation.success) {
        return false;
    }
    if (entry.locked ||
        entry.priority > policy.max_priority ||
        (policy.filter_kind && entry.reservation.kind != policy.kind)) {
        return false;
    }

    const uint32_t age = policy.current_tick >= entry.last_used_tick
        ? policy.current_tick - entry.last_used_tick
        : 0;
    return age >= policy.max_age_ticks;
}

} // namespace

ResourceBankCachePrunePreview preview_resource_bank_cache_prune(const ResourceBankCache& cache, ResourceBankCachePrunePolicy policy) {
    ResourceBankCachePrunePreview preview {};
    if (!is_valid_bank_cache(cache)) {
        return preview;
    }

    preview.valid = true;
    if (!policy.enabled) {
        return preview;
    }

    for (size_t index = 0; index < cache.count; ++index) {
        const ResourceBankCacheEntry& entry = cache.entries[index];
        if (!entry.active) {
            continue;
        }
        ++preview.active_count;
        if (entry.locked) {
            ++preview.locked_count;
        }
        if (cache_entry_matches_prune_policy(entry, policy)) {
            ++preview.prunable_count;
            preview.releasable_count = static_cast<uint16_t>(preview.releasable_count + entry.reservation.reservation.count);
        }
    }

    return preview;
}

ResourceBankCachePruneResult prune_resource_bank_cache(EngineResourceManager& manager, ResourceBankCache& cache, ResourceBankCachePrunePolicy policy) {
    if (!is_valid_bank_cache(cache)) {
        return ResourceBankCachePruneResult { false, 0, 0 };
    }
    if (!policy.enabled) {
        return ResourceBankCachePruneResult { true, 0, 0 };
    }

    ResourceBankCacheEntry cache_snapshot[max_resource_bank_cache_entries] = {};
    const size_t original_count = cache.count;
    for (size_t index = 0; index < original_count; ++index) {
        cache_snapshot[index] = cache.entries[index];
    }
    EngineResourceSnapshot manager_snapshot = capture_resource_manager_snapshot(manager);
    if (!manager_snapshot.valid) {
        return ResourceBankCachePruneResult { false, 0, 0 };
    }

    size_t pruned_count = 0;
    uint16_t released_count = 0;
    for (size_t index = 0; index < cache.count; ++index) {
        ResourceBankCacheEntry& entry = cache.entries[index];
        if (!cache_entry_matches_prune_policy(entry, policy)) {
            continue;
        }

        const uint16_t released = entry.reservation.reservation.count;
        if (!release_resource_bank(manager, entry.reservation)) {
            restore_resource_manager_snapshot(manager, manager_snapshot);
            restore_cache_entries(cache, cache_snapshot, original_count);
            return ResourceBankCachePruneResult { false, 0, 0 };
        }

        entry = ResourceBankCacheEntry {};
        ++pruned_count;
        released_count = static_cast<uint16_t>(released_count + released);
    }

    return ResourceBankCachePruneResult {
        true,
        pruned_count,
        released_count,
    };
}

ResourceBankCacheResult reserve_resource_bank_cached(EngineResourceManager& manager, ResourceBankCache& cache, const ResourceBank& bank, uint8_t priority, uint32_t tick) {
    if (!is_valid_bank_cache(cache) || !is_valid_resource_bank(bank)) {
        return failed_cache_result();
    }

    const size_t original_count = cache.count;
    for (size_t index = 0; index < original_count; ++index) {
        cached_reserve_cache_snapshot[index] = cache.entries[index];
    }

    capture_resource_manager_snapshot_into(manager, cached_reserve_manager_snapshot);
    if (!cached_reserve_manager_snapshot.valid) {
        return failed_cache_result();
    }

    uint16_t evicted_count = 0;
    for (;;) {
        ResourceBankReservation reservation = reserve_resource_bank(manager, bank);
        if (reservation.success) {
            size_t entry_index = invalid_resource_bank_cache_index;
            if (!try_store_cache_reservation(cache, reservation, priority, tick, entry_index)) {
                restore_resource_manager_snapshot(manager, cached_reserve_manager_snapshot);
                restore_cache_entries(cache, cached_reserve_cache_snapshot, original_count);
                return failed_cache_result();
            }

            return ResourceBankCacheResult {
                true,
                entry_index,
                evicted_count,
                reservation,
            };
        }

        const size_t victim_index = find_eviction_candidate(cache, bank.kind, priority);
        if (victim_index == invalid_resource_bank_cache_index) {
            restore_resource_manager_snapshot(manager, cached_reserve_manager_snapshot);
            restore_cache_entries(cache, cached_reserve_cache_snapshot, original_count);
            return failed_cache_result();
        }

        ResourceBankReservation victim = cache.entries[victim_index].reservation;
        if (!release_resource_bank(manager, victim)) {
            restore_resource_manager_snapshot(manager, cached_reserve_manager_snapshot);
            restore_cache_entries(cache, cached_reserve_cache_snapshot, original_count);
            return failed_cache_result();
        }

        cache.entries[victim_index] = ResourceBankCacheEntry {};
        ++evicted_count;
    }
}

namespace {

ResourceBankCacheGroupResult failed_cache_group_result(const ResourceBankGroup& group, const char* missing_bank_name = nullptr, size_t promoted_count = 0) {
    return ResourceBankCacheGroupResult {
        false,
        group.name,
        missing_bank_name,
        promoted_count,
    };
}

ResourceBankCacheGroupResult ok_cache_group_result(const ResourceBankGroup& group, size_t promoted_count) {
    return ResourceBankCacheGroupResult {
        true,
        group.name,
        nullptr,
        promoted_count,
    };
}

bool find_cached_group_entries(const ResourceBankCache& cache, const ResourceBankGroup& group, size_t* entry_indices) {
    if (!is_valid_bank_cache(cache) ||
        !is_valid_resource_bank_group(group) ||
        (group.bank_count > 0 && entry_indices == nullptr) ||
        group.bank_count > max_resource_bank_cache_entries) {
        return false;
    }

    bool used_entries[max_resource_bank_cache_entries] {};
    for (size_t bank_index = 0; bank_index < group.bank_count; ++bank_index) {
        size_t found = invalid_resource_bank_cache_index;
        for (size_t entry_index = 0; entry_index < cache.count; ++entry_index) {
            if (entry_index >= max_resource_bank_cache_entries ||
                used_entries[entry_index] ||
                !cached_bank_matches(cache.entries[entry_index], group.banks[bank_index])) {
                continue;
            }
            found = entry_index;
            break;
        }
        if (found == invalid_resource_bank_cache_index) {
            return false;
        }
        used_entries[found] = true;
        entry_indices[bank_index] = found;
    }
    return true;
}

} // namespace

bool resource_bank_cache_contains_group(const ResourceBankCache& cache, const ResourceBankGroup& group) {
    size_t entry_indices[max_resource_bank_cache_entries] {};
    return find_cached_group_entries(cache, group, entry_indices);
}

ResourceBankCacheGroupResult promote_resource_bank_group_from_cache(ResourceBankCache& cache, const ResourceBankGroup& group, ResourceBankBatchReservation& active) {
    if (!is_valid_resource_bank_group(group) ||
        !is_valid_bank_cache(cache) ||
        active.success ||
        group.bank_count > active.reservation_capacity ||
        group.bank_count > max_resource_bank_cache_entries ||
        (group.bank_count > 0 && (group.banks == nullptr || active.reservations == nullptr))) {
        const char* bank_name = group.bank_count > 0 && group.banks != nullptr ? group.banks[0].name : nullptr;
        return failed_cache_group_result(group, bank_name);
    }

    size_t entry_indices[max_resource_bank_cache_entries] {};
    if (!find_cached_group_entries(cache, group, entry_indices)) {
        const char* missing = nullptr;
        for (size_t index = 0; index < group.bank_count; ++index) {
            if (find_cached_bank_entry(cache, group.banks[index]) == invalid_resource_bank_cache_index) {
                missing = group.banks[index].name;
                break;
            }
        }
        return failed_cache_group_result(group, missing);
    }

    for (size_t index = 0; index < group.bank_count; ++index) {
        active.reservations[index] = cache.entries[entry_indices[index]].reservation;
        cache.entries[entry_indices[index]] = ResourceBankCacheEntry {};
    }
    active.reservation_count = group.bank_count;
    active.group_name = group.name;
    active.success = true;
    return ok_cache_group_result(group, group.bank_count);
}

ResourceBankCacheGroupResult hot_swap_resource_bank_group_from_cache(EngineResourceManager& manager, ResourceBankBatchReservation& active, ResourceBankCache& cache, const ResourceBankGroup& group) {
    if (!is_valid_resource_bank_group(group) ||
        !is_valid_bank_cache(cache) ||
        (active.success && active.reservations == nullptr) ||
        group.bank_count > active.reservation_capacity ||
        group.bank_count > max_resource_bank_cache_entries ||
        (group.bank_count > 0 && (group.banks == nullptr || active.reservations == nullptr))) {
        const char* bank_name = group.bank_count > 0 && group.banks != nullptr ? group.banks[0].name : nullptr;
        return failed_cache_group_result(group, bank_name);
    }

    size_t entry_indices[max_resource_bank_cache_entries] {};
    if (!find_cached_group_entries(cache, group, entry_indices)) {
        const char* missing = nullptr;
        for (size_t index = 0; index < group.bank_count; ++index) {
            if (find_cached_bank_entry(cache, group.banks[index]) == invalid_resource_bank_cache_index) {
                missing = group.banks[index].name;
                break;
            }
        }
        return failed_cache_group_result(group, missing);
    }

    EngineResourceSnapshot manager_snapshot = capture_resource_manager_snapshot(manager);
    if (!manager_snapshot.valid) {
        return failed_cache_group_result(group);
    }

    ResourceBankReservation active_snapshot[max_resource_bank_cache_entries] {};
    const size_t active_count = active.reservation_count;
    const char* active_group_name = active.group_name;
    const bool active_success = active.success;
    if (active_count > max_resource_bank_cache_entries) {
        return failed_cache_group_result(group);
    }
    for (size_t index = 0; index < active_count; ++index) {
        active_snapshot[index] = active.reservations[index];
    }

    if (active.success && !release_resource_bank_group(manager, active)) {
        restore_resource_manager_snapshot(manager, manager_snapshot);
        active.reservation_count = active_count;
        active.group_name = active_group_name;
        active.success = active_success;
        for (size_t index = 0; index < active_count; ++index) {
            active.reservations[index] = active_snapshot[index];
        }
        return failed_cache_group_result(group);
    }

    ResourceBankCacheGroupResult promoted = promote_resource_bank_group_from_cache(cache, group, active);
    if (!promoted.success) {
        restore_resource_manager_snapshot(manager, manager_snapshot);
        active.reservation_count = active_count;
        active.group_name = active_group_name;
        active.success = active_success;
        for (size_t index = 0; index < active_count; ++index) {
            active.reservations[index] = active_snapshot[index];
        }
        return promoted;
    }

    return promoted;
}

uint8_t resource_bank_prefetch_priority_for_area(
    Rect area_pixels,
    Vec2i camera_center_pixels,
    uint8_t near_priority,
    uint8_t far_priority,
    uint16_t falloff_pixels
) {
    if (falloff_pixels == 0) {
        return near_priority;
    }

    const int width = area_pixels.width > 0 ? area_pixels.width : 0;
    const int height = area_pixels.height > 0 ? area_pixels.height : 0;
    const int center_x = area_pixels.x + width / 2;
    const int center_y = area_pixels.y + height / 2;
    int distance = center_x > camera_center_pixels.x
        ? center_x - camera_center_pixels.x
        : camera_center_pixels.x - center_x;
    distance += center_y > camera_center_pixels.y
        ? center_y - camera_center_pixels.y
        : camera_center_pixels.y - center_y;

    if (distance >= falloff_pixels) {
        return far_priority;
    }

    const int near_value = near_priority;
    const int far_value = far_priority;
    const int delta = far_value - near_value;
    const int value = near_value + (delta * distance) / falloff_pixels;
    if (value < 0) {
        return 0;
    }
    if (value > 255) {
        return 255;
    }
    return static_cast<uint8_t>(value);
}

bool resource_bank_prefetch_area_overlaps_window(
    Rect area_pixels,
    ResourceBankPrefetchWindow window
) {
    if (!window.enabled) {
        return true;
    }

    const int margin = window.margin_pixels > 0 ? window.margin_pixels : 0;
    const int window_left = window.area_pixels.x - margin;
    const int window_top = window.area_pixels.y - margin;
    const int window_right = window.area_pixels.x + (window.area_pixels.width > 0 ? window.area_pixels.width : 0) + margin;
    const int window_bottom = window.area_pixels.y + (window.area_pixels.height > 0 ? window.area_pixels.height : 0) + margin;

    const int area_left = area_pixels.x;
    const int area_top = area_pixels.y;
    const int area_right = area_pixels.x + (area_pixels.width > 0 ? area_pixels.width : 0);
    const int area_bottom = area_pixels.y + (area_pixels.height > 0 ? area_pixels.height : 0);

    return area_right >= window_left &&
        area_left <= window_right &&
        area_bottom >= window_top &&
        area_top <= window_bottom;
}

bool resource_bank_prefetch_policy_allows_reservation(
    ResourceBankPrefetchPolicy policy,
    size_t reserved_count
) {
    return !policy.enabled || reserved_count < policy.max_new_reservations;
}

bool resource_bank_prefetch_policy_allows_upload(
    ResourceBankPrefetchPolicy policy,
    size_t uploaded_count
) {
    return !policy.enabled || uploaded_count < policy.max_uploads;
}

ResourceBankPrefetchResult prefetch_resource_banks_for_camera(
    EngineResourceManager& manager,
    ResourceBankCache& cache,
    const ResourceBankPrefetchRequest* requests,
    size_t request_count,
    Vec2i camera_center_pixels,
    uint32_t tick
) {
    return prefetch_resource_banks_for_camera_window_policy(
        manager,
        cache,
        requests,
        request_count,
        camera_center_pixels,
        tick,
        ResourceBankPrefetchWindow { Rect {}, 0, false },
        ResourceBankPrefetchPolicy { 0, 0, false }
    );
}

ResourceBankPrefetchResult prefetch_resource_banks_for_camera_policy(
    EngineResourceManager& manager,
    ResourceBankCache& cache,
    const ResourceBankPrefetchRequest* requests,
    size_t request_count,
    Vec2i camera_center_pixels,
    uint32_t tick,
    ResourceBankPrefetchPolicy policy
) {
    return prefetch_resource_banks_for_camera_window_policy(
        manager,
        cache,
        requests,
        request_count,
        camera_center_pixels,
        tick,
        ResourceBankPrefetchWindow { Rect {}, 0, false },
        policy
    );
}

ResourceBankPrefetchResult prefetch_resource_banks_for_camera_window(
    EngineResourceManager& manager,
    ResourceBankCache& cache,
    const ResourceBankPrefetchRequest* requests,
    size_t request_count,
    Vec2i camera_center_pixels,
    uint32_t tick,
    ResourceBankPrefetchWindow window
) {
    return prefetch_resource_banks_for_camera_window_policy(
        manager,
        cache,
        requests,
        request_count,
        camera_center_pixels,
        tick,
        window,
        ResourceBankPrefetchPolicy { 0, 0, false }
    );
}

ResourceBankPrefetchResult prefetch_resource_banks_for_camera_window_policy(
    EngineResourceManager& manager,
    ResourceBankCache& cache,
    const ResourceBankPrefetchRequest* requests,
    size_t request_count,
    Vec2i camera_center_pixels,
    uint32_t tick,
    ResourceBankPrefetchWindow window,
    ResourceBankPrefetchPolicy policy
) {
    ResourceBankCacheResult last_result = failed_cache_result();
    if (request_count > 0 && requests == nullptr) {
        return failed_prefetch_result(0, 0, 0, 0, 0, 0, last_result);
    }
    if (!is_valid_bank_cache(cache)) {
        return failed_prefetch_result(0, 0, 0, 0, 0, 0, last_result);
    }

    size_t reserved_count = 0;
    size_t reused_count = 0;
    size_t skipped_count = 0;
    size_t evicted_count = 0;

    for (size_t index = 0; index < request_count; ++index) {
        const ResourceBankPrefetchRequest& request = requests[index];
        if (request.bank == nullptr) {
            ++skipped_count;
            continue;
        }
        if (!resource_bank_prefetch_area_overlaps_window(request.area_pixels, window)) {
            ++skipped_count;
            continue;
        }

        const uint8_t priority = resource_bank_prefetch_priority_for_area(
            request.area_pixels,
            camera_center_pixels,
            request.near_priority,
            request.far_priority,
            request.falloff_pixels
        );

        const size_t existing_index = find_cached_bank_entry(cache, *request.bank);
        if (existing_index != invalid_resource_bank_cache_index) {
            cache.entries[existing_index].priority = cache.entries[existing_index].priority < priority
                ? priority
                : cache.entries[existing_index].priority;
            cache.entries[existing_index].last_used_tick = tick;
            cache.entries[existing_index].locked = cache.entries[existing_index].locked || request.locked;
            ++reused_count;
            last_result = ResourceBankCacheResult {
                true,
                existing_index,
                0,
                cache.entries[existing_index].reservation,
            };
            continue;
        }
        if (!resource_bank_prefetch_policy_allows_reservation(policy, reserved_count)) {
            ++skipped_count;
            continue;
        }

        last_result = reserve_resource_bank_cached(manager, cache, *request.bank, priority, tick);
        if (!last_result.success) {
            return failed_prefetch_result(index, reserved_count, reused_count, skipped_count, evicted_count, 0, last_result);
        }
        evicted_count += last_result.evicted_count;
        ++reserved_count;
        if (request.locked && !set_resource_bank_cache_locked(cache, last_result.entry_index, true)) {
            return failed_prefetch_result(index, reserved_count, reused_count, skipped_count, evicted_count, 0, last_result);
        }
    }

    return ResourceBankPrefetchResult {
        true,
        invalid_resource_bank_cache_index,
        reserved_count,
        reused_count,
        skipped_count,
        evicted_count,
        0,
        last_result,
    };
}

ResourceBankPrefetchResult prefetch_resource_banks_for_camera_with_uploads(
    EngineResourceManager& manager,
    ResourceBankCache& cache,
    const ResourceBankPrefetchRequest* requests,
    size_t request_count,
    Vec2i camera_center_pixels,
    uint32_t tick,
    const ResourceBankUploadSource* sources,
    size_t source_count
) {
    return prefetch_resource_banks_for_camera_window_with_uploads_policy(
        manager,
        cache,
        requests,
        request_count,
        camera_center_pixels,
        tick,
        ResourceBankPrefetchWindow { Rect {}, 0, false },
        sources,
        source_count,
        ResourceBankPrefetchPolicy { 0, 0, false }
    );
}

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
) {
    return prefetch_resource_banks_for_camera_window_with_uploads_policy(
        manager,
        cache,
        requests,
        request_count,
        camera_center_pixels,
        tick,
        ResourceBankPrefetchWindow { Rect {}, 0, false },
        sources,
        source_count,
        policy
    );
}

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
) {
    return prefetch_resource_banks_for_camera_window_with_uploads_policy(
        manager,
        cache,
        requests,
        request_count,
        camera_center_pixels,
        tick,
        window,
        sources,
        source_count,
        ResourceBankPrefetchPolicy { 0, 0, false }
    );
}

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
) {
    ResourceBankCacheResult last_result = failed_cache_result();
    if (request_count > 0 && requests == nullptr) {
        return failed_prefetch_result(0, 0, 0, 0, 0, 0, last_result);
    }
    if (!is_valid_bank_cache(cache)) {
        return failed_prefetch_result(0, 0, 0, 0, 0, 0, last_result);
    }

    size_t upload_needed_count = 0;
    size_t reservation_budget_count = 0;
    for (size_t index = 0; index < request_count; ++index) {
        const ResourceBankPrefetchRequest& request = requests[index];
        if (request.bank == nullptr ||
            !resource_bank_prefetch_area_overlaps_window(request.area_pixels, window) ||
            find_cached_bank_entry(cache, *request.bank) != invalid_resource_bank_cache_index) {
            continue;
        }
        if (!resource_bank_prefetch_policy_allows_reservation(policy, reservation_budget_count) ||
            !resource_bank_prefetch_policy_allows_upload(policy, upload_needed_count)) {
            continue;
        }
        if (sources == nullptr ||
            resource_bank_upload_source_by_name(sources, source_count, request.bank->name) == nullptr) {
            return failed_prefetch_result(index, 0, 0, 0, 0, 0, last_result);
        }
        ++reservation_budget_count;
        ++upload_needed_count;
    }
    if (dma_vblank_queue_count() + upload_needed_count > dma_vblank_queue_capacity) {
        return failed_prefetch_result(0, 0, 0, 0, 0, 0, last_result);
    }

    size_t reserved_count = 0;
    size_t reused_count = 0;
    size_t skipped_count = 0;
    size_t evicted_count = 0;
    size_t uploaded_count = 0;

    for (size_t index = 0; index < request_count; ++index) {
        const ResourceBankPrefetchRequest& request = requests[index];
        if (request.bank == nullptr) {
            ++skipped_count;
            continue;
        }
        if (!resource_bank_prefetch_area_overlaps_window(request.area_pixels, window)) {
            ++skipped_count;
            continue;
        }

        const uint8_t priority = resource_bank_prefetch_priority_for_area(
            request.area_pixels,
            camera_center_pixels,
            request.near_priority,
            request.far_priority,
            request.falloff_pixels
        );

        const size_t existing_index = find_cached_bank_entry(cache, *request.bank);
        if (existing_index != invalid_resource_bank_cache_index) {
            cache.entries[existing_index].priority = cache.entries[existing_index].priority < priority
                ? priority
                : cache.entries[existing_index].priority;
            cache.entries[existing_index].last_used_tick = tick;
            cache.entries[existing_index].locked = cache.entries[existing_index].locked || request.locked;
            ++reused_count;
            last_result = ResourceBankCacheResult {
                true,
                existing_index,
                0,
                cache.entries[existing_index].reservation,
            };
            continue;
        }
        if (!resource_bank_prefetch_policy_allows_reservation(policy, reserved_count) ||
            !resource_bank_prefetch_policy_allows_upload(policy, uploaded_count)) {
            ++skipped_count;
            continue;
        }

        const void* source = resource_bank_upload_source_by_name(sources, source_count, request.bank->name);
        if (source == nullptr) {
            return failed_prefetch_result(index, reserved_count, reused_count, skipped_count, evicted_count, uploaded_count, last_result);
        }

        last_result = reserve_resource_bank_cached(manager, cache, *request.bank, priority, tick);
        if (!last_result.success) {
            return failed_prefetch_result(index, reserved_count, reused_count, skipped_count, evicted_count, uploaded_count, last_result);
        }
        evicted_count += last_result.evicted_count;
        ++reserved_count;

        if (request.locked && !set_resource_bank_cache_locked(cache, last_result.entry_index, true)) {
            ResourceBankReservation reservation = last_result.reservation;
            release_resource_bank(manager, reservation);
            cache.entries[last_result.entry_index] = ResourceBankCacheEntry {};
            return failed_prefetch_result(index, reserved_count, reused_count, skipped_count, evicted_count, uploaded_count, last_result);
        }

        if (!enqueue_resource_bank_upload_vblank(last_result.reservation, source)) {
            ResourceBankReservation reservation = last_result.reservation;
            release_resource_bank(manager, reservation);
            cache.entries[last_result.entry_index] = ResourceBankCacheEntry {};
            return failed_prefetch_result(index, reserved_count, reused_count, skipped_count, evicted_count, uploaded_count, last_result);
        }
        ++uploaded_count;
    }

    return ResourceBankPrefetchResult {
        true,
        invalid_resource_bank_cache_index,
        reserved_count,
        reused_count,
        skipped_count,
        evicted_count,
        uploaded_count,
        last_result,
    };
}

bool release_bg_tiles(EngineResourceManager& manager, ResourceReservation reservation) {
    return release_resource_range(manager.bg_tiles, reservation);
}

bool release_obj_tiles(EngineResourceManager& manager, ResourceReservation reservation) {
    return release_resource_range(manager.obj_tiles, reservation);
}

bool release_bg_palette_colors(EngineResourceManager& manager, ResourceReservation reservation) {
    return release_resource_range(manager.bg_palette, reservation);
}

bool release_obj_palette_colors(EngineResourceManager& manager, ResourceReservation reservation) {
    return release_resource_range(manager.obj_palette, reservation);
}

bool release_oam_sprites(EngineResourceManager& manager, ResourceReservation reservation) {
    return release_resource_range(manager.oam_sprites, reservation);
}

} // namespace gbs
