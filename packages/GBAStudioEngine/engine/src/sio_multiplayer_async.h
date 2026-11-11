#ifndef GBS_SIO_MULTIPLAYER_ASYNC_H
#define GBS_SIO_MULTIPLAYER_ASYNC_H

#include <stdint.h>

/* SIO register layout at 04000120h. No waiting, allocation or game callbacks
   in the ISR. A bounded FIFO retains clocks arriving between main updates. */
typedef struct {
    uint16_t multi[4];
    uint16_t control;
    uint16_t send;
} GbsSioMultiplayerRegisters;

typedef struct {
    uint16_t received[4];
    uint8_t player_id;
    uint8_t connected_mask;
    int8_t result; /* 1: local word completed; 2: incoming-only clock. */
} GbsSioMultiplayerSnapshot;

#define GBS_SIO_MULTIPLAYER_SNAPSHOTS 16u
#define GBS_SIO_MULTIPLAYER_BATCH_WORDS 4u
typedef struct {
    GbsSioMultiplayerSnapshot snapshots[GBS_SIO_MULTIPLAYER_SNAPSHOTS];
    uint8_t head;
    uint8_t count;
    uint8_t armed;
    uint8_t started;
    uint8_t transmit_pending;
    uint8_t overflow;
    uint8_t deferred;
    uint16_t outgoing;
    uint16_t transmit[GBS_SIO_MULTIPLAYER_BATCH_WORDS];
    uint8_t transmit_size;
    uint8_t transmit_index;
} GbsSioMultiplayerAsync;

static inline void gbs_sio_multiplayer_async_reset(volatile GbsSioMultiplayerAsync* state,
        volatile GbsSioMultiplayerRegisters* regs, unsigned baud) {
    state->head = state->count = state->armed = state->started = 0;
    state->transmit_pending = state->overflow = state->deferred = 0;
    state->outgoing = 0;
    state->transmit_size = state->transmit_index = 0;
    regs->control = (uint16_t)(0x6000u | (baud & 3u));
    regs->send = 0xFFFFu;
}

static inline void gbs_sio_multiplayer_async_try_start(volatile GbsSioMultiplayerAsync* state,
        volatile GbsSioMultiplayerRegisters* regs) {
    const uint16_t control = regs->control;
    if (state->deferred && !(control & 0x80u)) {
        regs->send = state->outgoing;
        state->deferred = 0;
        state->armed = 1;
    }
    /* IDs are undefined before the first transfer; use SI to find the parent.
       SD must be high before starting. Child completion is detected by IRQ,
       never by reading an initially clear busy bit. */
    if (state->armed && !state->started && !state->overflow &&
            state->count < GBS_SIO_MULTIPLAYER_SNAPSHOTS && (control & 0x8Cu) == 8u) {
        state->started = 1;
        regs->control = (uint16_t)(control | 0x80u);
    }
}

static inline int gbs_sio_multiplayer_async_begin_batch(volatile GbsSioMultiplayerAsync* state,
        volatile GbsSioMultiplayerRegisters* regs, const uint16_t* words, unsigned size) {
    const uint16_t control = regs->control;
    if (!words || !size || size > GBS_SIO_MULTIPLAYER_BATCH_WORDS ||
            state->count + size > GBS_SIO_MULTIPLAYER_SNAPSHOTS) return 0;
    if (state->transmit_pending || state->overflow || (control & 0x3000u) != 0x2000u) return 0;
    if ((control & 0x80u) && !(control & 4u)) return 0;
    for (unsigned i=0;i<size;++i) state->transmit[i] = words[i];
    state->transmit_size = (uint8_t)size;
    state->transmit_index = 0;
    const uint16_t outgoing = words[0];
    state->outgoing = outgoing;
    state->transmit_pending = (uint8_t)size;
    state->started = 0;
    // A busy child stages its next word. The completion IRQ first records the
    // current incoming word, then loads the staged value for the next clock.
    if (control & 0x80u) {
        state->deferred = 1;
        state->armed = 0;
        return 1;
    }
    regs->send = outgoing;
    state->armed = 1;
    // If the parent started between the read and store, retry this word after
    // the current IRQ rather than claiming an uncertain transmit completed.
    if ((control & 4u) && (regs->control & 0x80u)) {
        state->armed = 0;
        state->deferred = 1;
        return 1;
    }
    gbs_sio_multiplayer_async_try_start(state, regs);
    return 1;
}

static inline int gbs_sio_multiplayer_async_begin(volatile GbsSioMultiplayerAsync* state,
        volatile GbsSioMultiplayerRegisters* regs, uint16_t outgoing) {
    return gbs_sio_multiplayer_async_begin_batch(state,regs,&outgoing,1);
}

static inline void gbs_sio_multiplayer_async_capture(volatile GbsSioMultiplayerAsync* state,
        volatile GbsSioMultiplayerRegisters* regs) {
    const uint16_t control = regs->control;
    if ((control & 0x3080u) != 0x2000u || state->overflow) return;
    if (state->count == GBS_SIO_MULTIPLAYER_SNAPSHOTS) {
        state->overflow = 1;
        state->armed = state->started = 0;
        return;
    }
    volatile GbsSioMultiplayerSnapshot* snapshot =
        &state->snapshots[(state->head + state->count) % GBS_SIO_MULTIPLAYER_SNAPSHOTS];
    snapshot->player_id = (uint8_t)((control >> 4) & 3u);
    snapshot->connected_mask = 0;
    snapshot->result = (control & 0x40u) ? -1 : (state->armed ? 1 : 2);
    for (unsigned i = 0; i < 4; ++i) {
        snapshot->received[i] = snapshot->result > 0 ? regs->multi[i] : 0;
        if (snapshot->result > 0 && snapshot->received[i] != 0xFFFFu)
            snapshot->connected_mask = (uint8_t)(snapshot->connected_mask | (1u << i));
    }
    state->armed = state->started = 0;
    ++state->count;
    if (snapshot->result < 0) {
        state->deferred = state->transmit_size = state->transmit_index = 0;
    } else if (snapshot->result == 1 && ++state->transmit_index < state->transmit_size) {
        state->outgoing = state->transmit[state->transmit_index];
        state->deferred = 1;
    }
    if (state->deferred) {
        regs->send = state->outgoing;
        state->deferred = 0;
        state->armed = 1;
    }
    // Only a preloaded, bounded packet is advanced here; no protocol parsing
    // or callbacks execute in the IRQ. Child words are ready before its slot.
    gbs_sio_multiplayer_async_try_start(state,regs);
}

/* Caller serializes against the ISR (IME off on GBA). Never overwrite an
   unread snapshot; report overflow so the protocol reconnects and retries. */
static inline int gbs_sio_multiplayer_async_poll(volatile GbsSioMultiplayerAsync* state,
        uint16_t received[4], uint8_t* player_id, uint8_t* connected_mask) {
    if (state->overflow) {
        state->head = state->count = state->transmit_pending = state->overflow = state->deferred = 0;
        *player_id = *connected_mask = 0;
        for (unsigned i = 0; i < 4; ++i) received[i] = 0;
        return -1;
    }
    if (!state->count) return 0;
    const volatile GbsSioMultiplayerSnapshot* snapshot = &state->snapshots[state->head];
    const int result = snapshot->result;
    for (unsigned i = 0; i < 4; ++i) received[i] = snapshot->received[i];
    *player_id = snapshot->player_id;
    *connected_mask = snapshot->connected_mask;
    state->head = (uint8_t)((state->head + 1) % GBS_SIO_MULTIPLAYER_SNAPSHOTS);
    --state->count;
    if (result == 1 && state->transmit_pending) --state->transmit_pending;
    if (result < 0) state->transmit_pending = 0;
    return result;
}

#endif
