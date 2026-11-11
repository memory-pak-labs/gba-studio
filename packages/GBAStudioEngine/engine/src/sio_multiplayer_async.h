#ifndef GBS_SIO_MULTIPLAYER_ASYNC_H
#define GBS_SIO_MULTIPLAYER_ASYNC_H

#include <stdint.h>

/* SIO register layout at 04000120h. No waiting, allocation or game callbacks
   in the ISR. The main loop consumes exactly one latched result. */
typedef struct {
    uint16_t multi[4];
    uint16_t control;
    uint16_t send;
} GbsSioMultiplayerRegisters;

typedef struct {
    uint16_t received[4];
    uint8_t player_id;
    uint8_t connected_mask;
    uint8_t armed;
    uint8_t started;
    uint8_t complete;
    int8_t result;
} GbsSioMultiplayerAsync;

static inline void gbs_sio_multiplayer_async_reset(volatile GbsSioMultiplayerAsync* state,
        volatile GbsSioMultiplayerRegisters* regs, unsigned baud) {
    state->armed = state->started = state->complete = state->connected_mask = 0;
    state->player_id = 0;
    state->result = 0;
    for (unsigned i = 0; i < 4; ++i) state->received[i] = 0;
    regs->control = (uint16_t)(0x6000u | (baud & 3u));
    regs->send = 0xFFFFu;
}

static inline void gbs_sio_multiplayer_async_try_start(volatile GbsSioMultiplayerAsync* state,
        volatile GbsSioMultiplayerRegisters* regs) {
    const uint16_t control = regs->control;
    /* IDs are undefined before the first transfer; use SI to find the parent.
       SD must be high before starting. Child completion is detected by IRQ,
       never by reading an initially clear busy bit. */
    if (state->armed && !state->started && (control & 0x8Cu) == 8u) {
        state->started = 1;
        regs->control = (uint16_t)(control | 0x80u);
    }
}

static inline int gbs_sio_multiplayer_async_begin(volatile GbsSioMultiplayerAsync* state,
        volatile GbsSioMultiplayerRegisters* regs, uint16_t outgoing) {
    if (state->armed || state->complete || (regs->control & 0x3080u) != 0x2000u) return 0;
    regs->send = outgoing;
    state->armed = 1;
    state->started = 0;
    gbs_sio_multiplayer_async_try_start(state, regs);
    return 1;
}

static inline void gbs_sio_multiplayer_async_capture(volatile GbsSioMultiplayerAsync* state,
        volatile GbsSioMultiplayerRegisters* regs) {
    const uint16_t control = regs->control;
    if (!state->armed || state->complete || (control & 0x80u)) return;
    state->player_id = (uint8_t)((control >> 4) & 3u);
    state->connected_mask = 0;
    state->result = (control & 0x40u) ? -1 : 1;
    for (unsigned i = 0; i < 4; ++i) {
        state->received[i] = state->result > 0 ? regs->multi[i] : 0;
        if (state->result > 0 && state->received[i] != 0xFFFFu)
            state->connected_mask = (uint8_t)(state->connected_mask | (1u << i));
    }
    state->armed = 0;
    state->complete = 1;
}

#endif
