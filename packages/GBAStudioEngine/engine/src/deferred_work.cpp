#include "gbs/deferred_work.hpp"

namespace gbs {

void deferred_work_init(DeferredWorkQueue& queue) {
    for (size_t i = 0; i < deferred_work_max_entries; ++i) {
        queue.items[i] = DeferredWorkItem { nullptr, nullptr };
    }
    queue.head = 0;
    queue.tail = 0;
    queue.count = 0;
}

bool deferred_work_post(DeferredWorkQueue& queue, DeferredWorkFn fn, void* arg) {
    if (fn == nullptr) {
        return false;
    }
    if (queue.count >= deferred_work_max_entries) {
        return false; // queue full
    }
    queue.items[queue.tail] = DeferredWorkItem { fn, arg };
    queue.tail = static_cast<uint8_t>((queue.tail + 1) % deferred_work_max_entries);
    ++queue.count;
    return true;
}

void deferred_work_drain(DeferredWorkQueue& queue) {
    while (queue.count > 0) {
        DeferredWorkItem item = queue.items[queue.head];
        queue.items[queue.head] = DeferredWorkItem { nullptr, nullptr };
        queue.head = static_cast<uint8_t>((queue.head + 1) % deferred_work_max_entries);
        --queue.count;

        if (item.fn != nullptr) {
            item.fn(item.arg);
        }
    }
}

uint8_t deferred_work_pending_count(const DeferredWorkQueue& queue) {
    return queue.count;
}

} // namespace gbs