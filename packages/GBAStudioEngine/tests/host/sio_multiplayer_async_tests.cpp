#include <cassert>
#include <cstddef>
#include "sio_multiplayer_async.h"

int main() {
    static_assert(offsetof(GbsSioMultiplayerRegisters, control) == 8);
    static_assert(offsetof(GbsSioMultiplayerRegisters, send) == 10);
    GbsSioMultiplayerAsync state {};
    GbsSioMultiplayerRegisters regs {};
    gbs_sio_multiplayer_async_reset(&state, &regs, 3);
    assert(regs.control == 0x6003);
    assert(regs.send == 0xFFFF);
    assert(gbs_sio_multiplayer_async_begin(&state, &regs, 0x1234));
    assert(regs.send == 0x1234);
    assert(!(regs.control & 0x80)); // Not all terminals are ready yet.
    assert(!gbs_sio_multiplayer_async_begin(&state, &regs, 0x9999));
    regs.control |= 8;
    gbs_sio_multiplayer_async_try_start(&state, &regs);
    assert(regs.control & 0x80);
    regs.control = 0x600B;
    // No IRQ: an idle control register alone must never publish stale data.
    assert(!state.complete);
    gbs_sio_multiplayer_async_try_start(&state, &regs);
    assert(!(regs.control & 0x80)); // Do not restart before consuming the IRQ.
    regs.multi[0] = 0x1234;
    regs.multi[1] = 0x5678;
    regs.multi[2] = regs.multi[3] = 0xFFFF;
    gbs_sio_multiplayer_async_capture(&state, &regs);
    assert(state.complete && state.result == 1);
    assert(state.connected_mask == 3 && state.player_id == 0);
    assert(state.received[1] == 0x5678);
    assert(!gbs_sio_multiplayer_async_begin(&state, &regs, 0));

    gbs_sio_multiplayer_async_reset(&state, &regs, 2);
    regs.control = 0x600E; // Child, ready, ID still undefined (zero).
    assert(gbs_sio_multiplayer_async_begin(&state, &regs, 0x4321));
    assert(!(regs.control & 0x80)); // SI bit, not unassigned ID, determines role.
    regs.control = 0x609E; // Transfer is busy.
    gbs_sio_multiplayer_async_capture(&state, &regs);
    assert(!state.complete);
    regs.control = 0x601E; // ID 1, completed.
    gbs_sio_multiplayer_async_capture(&state, &regs);
    assert(state.complete && state.result == 1 && state.player_id == 1);
    // Duplicate IRQs cannot replace a snapshot awaiting consumption.
    regs.multi[1] = 0xEEEE;
    gbs_sio_multiplayer_async_capture(&state, &regs);
    assert(state.received[1] == 0x5678);

    gbs_sio_multiplayer_async_reset(&state, &regs, 0);
    regs.control = 0x604C;
    assert(gbs_sio_multiplayer_async_begin(&state, &regs, 0));
    gbs_sio_multiplayer_async_capture(&state, &regs);
    assert(state.complete && state.result == -1 && state.connected_mask == 0);
    for (unsigned i=0;i<4;++i) assert(state.received[i] == 0);
}
