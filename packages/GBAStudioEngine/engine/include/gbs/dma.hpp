#pragma once

#include <stddef.h>
#include <stdint.h>

namespace gbs {

enum class DmaChannel : uint8_t {
    Channel0 = 0,
    Channel1 = 1,
    Channel2 = 2,
    Channel3 = 3
};

enum class DmaWidth : uint8_t {
    Halfword = 2,
    Word = 4
};

struct DmaTransfer {
    const void* source;
    volatile void* destination;
    size_t units;
    DmaWidth width;
};

struct HBlankDmaTransfer {
    const void* source;
    volatile void* destination;
    size_t units_per_hblank;
    DmaWidth width;
};

// FIFO completion fence. Reset cancels old fences; resetting statistics does not.
struct DmaFence { uint32_t epoch; uint32_t sequence; };
enum class DmaFenceStatus : uint8_t { Pending, Complete, Canceled };
DmaFence dma_vblank_fence();
DmaFenceStatus dma_fence_status(DmaFence fence);
bool dma_source_pending(const void* source, size_t bytes);
// Loading barrier for mutable decode buffers; waits only while their bytes are borrowed.
bool dma_wait_for_source(const void* source, size_t bytes);
bool dma_destination_pending(const volatile void* destination, size_t bytes);
bool dma_wait_for_destination(const volatile void* destination, size_t bytes);

struct DmaQueueStats {
    size_t queued;
    uint32_t submitted;
    uint32_t flushed;
    uint32_t dropped;
    size_t peak_queued;
    size_t queued_bytes;
    uint32_t submitted_bytes;
    uint32_t flushed_bytes;
    uint32_t dropped_bytes;
    size_t peak_queued_bytes;
};

constexpr size_t dma_vblank_queue_capacity = 32u;
// Keep long resource uploads from consuming an entire VBlank interval. Callers
// that need an immediate, blocking flush can still use dma_flush_vblank_queue.
constexpr size_t dma_default_vblank_budget_bytes = 8192u;

constexpr bool is_valid_dma_channel(DmaChannel channel) {
    return static_cast<uint8_t>(channel) <= static_cast<uint8_t>(DmaChannel::Channel3);
}

constexpr bool is_valid_dma_transfer(const DmaTransfer& transfer) {
    return transfer.source != nullptr &&
           transfer.destination != nullptr &&
           transfer.units > 0 &&
           transfer.units <= 0x3FFF &&
           (transfer.width == DmaWidth::Halfword || transfer.width == DmaWidth::Word);
}

constexpr bool is_valid_hblank_dma_transfer(const HBlankDmaTransfer& transfer) {
    return transfer.source != nullptr &&
           transfer.destination != nullptr &&
           transfer.units_per_hblank > 0 &&
           transfer.units_per_hblank <= 0x3FFF &&
           (transfer.width == DmaWidth::Halfword || transfer.width == DmaWidth::Word);
}

bool dma_copy(DmaChannel channel, const DmaTransfer& transfer);
bool dma_copy16(DmaChannel channel, const void* source, volatile void* destination, size_t halfwords);
bool dma_copy32(DmaChannel channel, const void* source, volatile void* destination, size_t words);
bool dma_start_hblank(DmaChannel channel, const HBlankDmaTransfer& transfer);
void dma_stop_hblank(DmaChannel channel);
void dma_reset_vblank_queue();
void dma_reset_vblank_queue_stats();
bool dma_enqueue_vblank(const DmaTransfer& transfer);
bool dma_enqueue_vblank16(const void* source, volatile void* destination, size_t halfwords);
bool dma_enqueue_vblank32(const void* source, volatile void* destination, size_t words);
size_t dma_vblank_queue_count();
DmaQueueStats dma_vblank_queue_stats();
size_t dma_flush_vblank_queue_budget(DmaChannel channel, size_t max_bytes);
size_t dma_flush_vblank_queue(DmaChannel channel = DmaChannel::Channel3);

} // namespace gbs
