#pragma once

#include <stddef.h>
#include <stdint.h>

namespace gbs {

// ============================================================
// Deferred Work Queue
// ============================================================
// Allows IRQ handlers to enqueue lightweight work items that are
// drained on the main loop, avoiding heavy processing in ISR context.
//
// Typical usage:
//   1. IRQ handler calls deferred_work_post(work_fn, arg)
//   2. Main loop calls deferred_work_drain() once per frame
//   3. All posted work items execute sequentially

using DeferredWorkFn = void (*)(void* arg);

constexpr size_t deferred_work_max_entries = 16;

struct DeferredWorkItem {
    DeferredWorkFn fn;
    void* arg;
};

struct DeferredWorkQueue {
    DeferredWorkItem items[deferred_work_max_entries];
    uint8_t head;
    uint8_t tail;
    uint8_t count;
};

// Initialize the queue (call once at boot).
void deferred_work_init(DeferredWorkQueue& queue);

// Post a work item from ISR or main loop context. Returns true on success.
// Safe to call from IRQ (no heap, single-producer/single-consumer pattern).
bool deferred_work_post(DeferredWorkQueue& queue, DeferredWorkFn fn, void* arg);

// Drain all pending work items. Call once per frame from the main loop.
// Executes items in FIFO order. Ignores null function pointers.
void deferred_work_drain(DeferredWorkQueue& queue);

// Number of items currently pending.
uint8_t deferred_work_pending_count(const DeferredWorkQueue& queue);

} // namespace gbs