#include <cassert>
#include "gbs/deferred_work.hpp"

using namespace gbs;

int call_count_a = 0;
int call_count_b = 0;
int last_arg_value = 0;

void work_fn_a(void*) {
    ++call_count_a;
}

void work_fn_b(void* arg) {
    ++call_count_b;
    last_arg_value = *static_cast<int*>(arg);
}

void test_init() {
    DeferredWorkQueue q;
    deferred_work_init(q);
    assert(deferred_work_pending_count(q) == 0);
}

void test_post_and_drain() {
    DeferredWorkQueue q;
    deferred_work_init(q);

    int arg = 42;
    assert(deferred_work_post(q, work_fn_a, nullptr));
    assert(deferred_work_post(q, work_fn_b, &arg));
    assert(deferred_work_pending_count(q) == 2);

    call_count_a = 0;
    call_count_b = 0;
    last_arg_value = 0;

    deferred_work_drain(q);
    assert(call_count_a == 1);
    assert(call_count_b == 1);
    assert(last_arg_value == 42);
    assert(deferred_work_pending_count(q) == 0);
}

void test_fifo_order() {
    DeferredWorkQueue q;
    deferred_work_init(q);

    int values[3] = { 10, 20, 30 };

    // Post 3 items with different args.
    assert(deferred_work_post(q, work_fn_b, &values[0]));
    assert(deferred_work_post(q, work_fn_b, &values[1]));
    assert(deferred_work_post(q, work_fn_b, &values[2]));

    call_count_b = 0;
    last_arg_value = 0;

    // Drain should process all 3 in FIFO order.
    // The last_arg_value will be the last one processed (values[2] = 30).
    deferred_work_drain(q);
    assert(call_count_b == 3);
    assert(last_arg_value == 30);
}

void test_queue_full() {
    DeferredWorkQueue q;
    deferred_work_init(q);

    // Fill the queue.
    for (size_t i = 0; i < deferred_work_max_entries; ++i) {
        assert(deferred_work_post(q, work_fn_a, nullptr));
    }
    assert(deferred_work_pending_count(q) == deferred_work_max_entries);

    // One more should fail.
    assert(!deferred_work_post(q, work_fn_a, nullptr));
    assert(deferred_work_pending_count(q) == deferred_work_max_entries);
}

void test_null_fn_rejected() {
    DeferredWorkQueue q;
    deferred_work_init(q);
    assert(!deferred_work_post(q, nullptr, nullptr));
    assert(deferred_work_pending_count(q) == 0);
}

void test_drain_empty() {
    DeferredWorkQueue q;
    deferred_work_init(q);
    call_count_a = 0;
    deferred_work_drain(q);
    assert(call_count_a == 0);
}

void test_circular_buffer() {
    DeferredWorkQueue q;
    deferred_work_init(q);

    // Fill and drain multiple times to test circular wrapping.
    for (int round = 0; round < 5; ++round) {
        for (size_t i = 0; i < deferred_work_max_entries; ++i) {
            assert(deferred_work_post(q, work_fn_a, nullptr));
        }
        assert(deferred_work_pending_count(q) == deferred_work_max_entries);
        call_count_a = 0;
        deferred_work_drain(q);
        assert(call_count_a == static_cast<int>(deferred_work_max_entries));
        assert(deferred_work_pending_count(q) == 0);
    }
}

int main() {
    test_init();
    test_post_and_drain();
    test_fifo_order();
    test_queue_full();
    test_null_fn_rejected();
    test_drain_empty();
    test_circular_buffer();
    return 0;
}