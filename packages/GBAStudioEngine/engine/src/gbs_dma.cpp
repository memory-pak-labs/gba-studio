#include "gbs/dma.hpp"
#include "gbs_hw.h"

#if !defined(__arm__) && !defined(__thumb__)
extern "C" __attribute__((weak)) void gbs_hw_hdma_start(int, const void*, volatile void*, uint32_t, int) {
}

extern "C" __attribute__((weak)) void gbs_hw_hdma_stop(int) {
}
#endif

namespace gbs {

namespace {

DmaTransfer vblank_queue[dma_vblank_queue_capacity] {};
size_t vblank_queue_count = 0;
uint32_t vblank_queue_submitted = 0;
uint32_t vblank_queue_flushed = 0;
uint32_t vblank_queue_dropped = 0;
size_t vblank_queue_peak = 0;
size_t vblank_queue_bytes = 0;
uint32_t vblank_queue_submitted_bytes = 0;
uint32_t vblank_queue_flushed_bytes = 0;
uint32_t vblank_queue_dropped_bytes = 0;
size_t vblank_queue_peak_bytes = 0;
uint8_t active_hblank_dma_mask = 0;

size_t dma_transfer_bytes(const gbs::DmaTransfer& transfer) {
    return transfer.units * static_cast<size_t>(transfer.width);
}

} // namespace

bool dma_copy(DmaChannel channel, const DmaTransfer& transfer) {
    if (!is_valid_dma_channel(channel) || !is_valid_dma_transfer(transfer)) {
        return false;
    }
    if ((active_hblank_dma_mask & (1u << static_cast<uint8_t>(channel))) != 0u) {
        return false;
    }

    // Byte-authored affine maps may start at an odd ROM address. DMA16
    // rounds that address down; assemble halfwords during the queued VBlank
    // transfer in that case, without a persistent full-map scratch buffer.
    if (transfer.width == DmaWidth::Halfword &&
        (reinterpret_cast<uintptr_t>(transfer.source) & 1u) != 0u) {
        const auto* source = static_cast<const uint8_t*>(transfer.source);
        auto* destination = static_cast<volatile uint16_t*>(transfer.destination);
        for (size_t index = 0; index < transfer.units; ++index) {
            destination[index] = static_cast<uint16_t>(source[index * 2] |
                (static_cast<uint16_t>(source[index * 2 + 1]) << 8));
        }
        return true;
    }

    gbs_hw_dma_copy(
        static_cast<int>(channel),
        transfer.source,
        transfer.destination,
        static_cast<uint32_t>(transfer.units),
        transfer.width == DmaWidth::Word ? 1 : 0
    );
    return true;
}

bool dma_copy16(DmaChannel channel, const void* source, volatile void* destination, size_t halfwords) {
    return dma_copy(channel, DmaTransfer { source, destination, halfwords, DmaWidth::Halfword });
}

bool dma_copy32(DmaChannel channel, const void* source, volatile void* destination, size_t words) {
    return dma_copy(channel, DmaTransfer { source, destination, words, DmaWidth::Word });
}

bool dma_start_hblank(DmaChannel channel, const HBlankDmaTransfer& transfer) {
    if (!is_valid_dma_channel(channel) || !is_valid_hblank_dma_transfer(transfer)) {
        return false;
    }
    gbs_hw_hdma_start(
        static_cast<int>(channel),
        transfer.source,
        transfer.destination,
        static_cast<uint32_t>(transfer.units_per_hblank),
        transfer.width == DmaWidth::Word ? 1 : 0
    );
    active_hblank_dma_mask = static_cast<uint8_t>(active_hblank_dma_mask | (1u << static_cast<uint8_t>(channel)));
    return true;
}

void dma_stop_hblank(DmaChannel channel) {
    if (!is_valid_dma_channel(channel)) {
        return;
    }
    gbs_hw_hdma_stop(static_cast<int>(channel));
    active_hblank_dma_mask = static_cast<uint8_t>(active_hblank_dma_mask & ~(1u << static_cast<uint8_t>(channel)));
}

void dma_reset_vblank_queue() {
    for (size_t index = 0; index < dma_vblank_queue_capacity; ++index) {
        vblank_queue[index] = DmaTransfer {};
    }
    vblank_queue_count = 0;
    vblank_queue_submitted = 0;
    vblank_queue_flushed = 0;
    vblank_queue_dropped = 0;
    vblank_queue_peak = 0;
    vblank_queue_bytes = 0;
    vblank_queue_submitted_bytes = 0;
    vblank_queue_flushed_bytes = 0;
    vblank_queue_dropped_bytes = 0;
    vblank_queue_peak_bytes = 0;
}

void dma_reset_vblank_queue_stats() {
    vblank_queue_submitted = 0;
    vblank_queue_flushed = 0;
    vblank_queue_dropped = 0;
    vblank_queue_peak = vblank_queue_count;
    vblank_queue_submitted_bytes = 0;
    vblank_queue_flushed_bytes = 0;
    vblank_queue_dropped_bytes = 0;
    vblank_queue_peak_bytes = vblank_queue_bytes;
}

bool dma_enqueue_vblank(const DmaTransfer& transfer) {
    if (!is_valid_dma_transfer(transfer)) {
        ++vblank_queue_dropped;
        return false;
    }
    if (vblank_queue_count >= dma_vblank_queue_capacity) {
        ++vblank_queue_dropped;
        vblank_queue_dropped_bytes += static_cast<uint32_t>(dma_transfer_bytes(transfer));
        return false;
    }
    const size_t bytes = dma_transfer_bytes(transfer);
    vblank_queue[vblank_queue_count] = transfer;
    ++vblank_queue_count;
    ++vblank_queue_submitted;
    vblank_queue_bytes += bytes;
    vblank_queue_submitted_bytes += static_cast<uint32_t>(bytes);
    if (vblank_queue_count > vblank_queue_peak) {
        vblank_queue_peak = vblank_queue_count;
    }
    if (vblank_queue_bytes > vblank_queue_peak_bytes) {
        vblank_queue_peak_bytes = vblank_queue_bytes;
    }
    return true;
}

bool dma_enqueue_vblank16(const void* source, volatile void* destination, size_t halfwords) {
    return dma_enqueue_vblank(DmaTransfer { source, destination, halfwords, DmaWidth::Halfword });
}

bool dma_enqueue_vblank32(const void* source, volatile void* destination, size_t words) {
    return dma_enqueue_vblank(DmaTransfer { source, destination, words, DmaWidth::Word });
}

size_t dma_vblank_queue_count() {
    return vblank_queue_count;
}

DmaQueueStats dma_vblank_queue_stats() {
    return DmaQueueStats {
        vblank_queue_count,
        vblank_queue_submitted,
        vblank_queue_flushed,
        vblank_queue_dropped,
        vblank_queue_peak,
        vblank_queue_bytes,
        vblank_queue_submitted_bytes,
        vblank_queue_flushed_bytes,
        vblank_queue_dropped_bytes,
        vblank_queue_peak_bytes
    };
}

size_t dma_flush_vblank_queue_budget(DmaChannel channel, size_t max_bytes) {
    if (!is_valid_dma_channel(channel) || max_bytes == 0) {
        return 0;
    }

    size_t flushed = 0;
    size_t flushed_bytes = 0;
    size_t remaining_bytes = max_bytes;
    while (vblank_queue_count > 0) {
        DmaTransfer& pending = vblank_queue[0];
        const size_t unit_bytes = static_cast<size_t>(pending.width);
        const size_t flush_units = remaining_bytes / unit_bytes;
        if (flush_units == 0) {
            break;
        }
        const size_t units = pending.units < flush_units ? pending.units : flush_units;
        const DmaTransfer transfer { pending.source, pending.destination, units, pending.width };
        if (!dma_copy(channel, transfer)) {
            break;
        }
        const size_t bytes = dma_transfer_bytes(transfer);
        ++flushed;
        flushed_bytes += bytes;
        remaining_bytes -= bytes;
        if (vblank_queue_bytes >= bytes) {
            vblank_queue_bytes -= bytes;
        } else {
            vblank_queue_bytes = 0;
        }

        if (units < pending.units) {
            pending.source = static_cast<const uint8_t*>(pending.source) + bytes;
            pending.destination = reinterpret_cast<volatile uint8_t*>(pending.destination) + bytes;
            pending.units -= units;
            continue;
        }
        for (size_t index = 1; index < vblank_queue_count; ++index) {
            vblank_queue[index - 1] = vblank_queue[index];
        }
        --vblank_queue_count;
        vblank_queue[vblank_queue_count] = DmaTransfer {};
    }
    vblank_queue_flushed += static_cast<uint32_t>(flushed);
    vblank_queue_flushed_bytes += static_cast<uint32_t>(flushed_bytes);
    return flushed;
}

size_t dma_flush_vblank_queue(DmaChannel channel) {
    return dma_flush_vblank_queue_budget(channel, static_cast<size_t>(-1));
}

} // namespace gbs

extern "C" {

bool gbs_hw_enqueue_vblank_dma16(const void* source, volatile void* destination, uint32_t halfwords) {
    return gbs::dma_enqueue_vblank16(source, destination, halfwords);
}

bool gbs_hw_enqueue_vblank_dma32(const void* source, volatile void* destination, uint32_t words) {
    return gbs::dma_enqueue_vblank32(source, destination, words);
}

size_t gbs_hw_flush_vblank_dma_queue(int channel) {
    return gbs::dma_flush_vblank_queue(static_cast<gbs::DmaChannel>(channel));
}

} // extern "C"
