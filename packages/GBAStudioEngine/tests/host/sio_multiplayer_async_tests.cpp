#include <cassert>
#include <cstddef>
#include <initializer_list>
#include "sio_multiplayer_async.h"

int main() {
    static_assert(offsetof(GbsSioMultiplayerRegisters, control) == 8);
    static_assert(offsetof(GbsSioMultiplayerRegisters, send) == 10);
    static_assert(sizeof(GbsSioMultiplayerAsync) <= 128);
    GbsSioMultiplayerAsync state {};
    GbsSioMultiplayerRegisters regs {};
    uint16_t values[4] {}; uint8_t id=0,mask=0;
    auto poll = [&] { return gbs_sio_multiplayer_async_poll(&state,values,&id,&mask); };
    gbs_sio_multiplayer_async_reset(&state, &regs, 3);
    assert(regs.control == 0x6003 && regs.send == 0xFFFF);
    assert(gbs_sio_multiplayer_async_begin(&state, &regs, 0x1234));
    assert(regs.send == 0x1234 && !(regs.control & 0x80));
    assert(!gbs_sio_multiplayer_async_begin(&state, &regs, 0x9999));
    regs.control |= 8;
    gbs_sio_multiplayer_async_try_start(&state, &regs);
    assert(regs.control & 0x80);
    regs.control = 0x600B;
    assert(!poll()); // An idle control register alone never publishes data.
    gbs_sio_multiplayer_async_try_start(&state, &regs);
    assert(!(regs.control & 0x80)); // No restart before the IRQ.
    regs.multi[0] = 0x1234; regs.multi[1] = 0x5678;
    regs.multi[2] = regs.multi[3] = 0xFFFF;
    gbs_sio_multiplayer_async_capture(&state, &regs);
    assert(!gbs_sio_multiplayer_async_begin(&state, &regs, 0));
    assert(poll()==1 && id==0 && mask==3 && values[1]==0x5678);
    assert(!poll());

    gbs_sio_multiplayer_async_reset(&state, &regs, 2);
    regs.control = 0x600E; // Child: SI bit, not the initially undefined ID.
    assert(gbs_sio_multiplayer_async_begin(&state, &regs, 0x4321));
    assert(!(regs.control & 0x80));
    regs.control = 0x609E;
    gbs_sio_multiplayer_async_capture(&state, &regs);
    assert(!poll()); // Busy is not a completed transfer.
    regs.control = 0x601E;
    gbs_sio_multiplayer_async_capture(&state, &regs);
    regs.multi[1] = 0xEEEE;
    gbs_sio_multiplayer_async_capture(&state, &regs);
    assert(poll()==1 && id==1 && values[1]==0x5678);
    assert(poll()==2 && values[1]==0xEEEE); // Never replaces the unread result.

    // A complete ACK can straddle poll/begin, or arrive during a slower frame.
    for (uint16_t word : {uint16_t(0xC409),uint16_t(0xD001),uint16_t(0xE0FF)}) {
        regs.multi[0]=word;
        gbs_sio_multiplayer_async_capture(&state,&regs);
    }
    assert(gbs_sio_multiplayer_async_begin(&state,&regs,0x8001));
    assert(poll()==2 && values[0]==0xC409 && state.transmit_pending);
    assert(poll()==2 && values[0]==0xD001 && state.transmit_pending);
    assert(poll()==2 && values[0]==0xE0FF && state.transmit_pending);
    regs.multi[0]=0x1001;
    gbs_sio_multiplayer_async_capture(&state,&regs);
    assert(poll()==1 && !state.transmit_pending);
    assert(!poll());

    gbs_sio_multiplayer_async_reset(&state,&regs,3);
    regs.control=0x609E; // Child main loop runs during the parent's transfer.
    assert(gbs_sio_multiplayer_async_begin(&state,&regs,0xA123));
    assert(state.deferred && !state.armed && regs.send==0xFFFF);
    regs.control=0x601E; regs.multi[0]=0xD001;
    gbs_sio_multiplayer_async_capture(&state,&regs);
    assert(poll()==2 && values[0]==0xD001 && state.transmit_pending);
    assert(!state.deferred && state.armed && regs.send==0xA123);
    regs.multi[0]=0xE0FF;
    gbs_sio_multiplayer_async_capture(&state,&regs);
    assert(poll()==1 && values[0]==0xE0FF && !state.transmit_pending);

    // Bounded overflow requests reconnection instead of overwriting words.
    for (unsigned i=0;i<=GBS_SIO_MULTIPLAYER_SNAPSHOTS;++i) {
        regs.multi[0]=static_cast<uint16_t>(i);
        gbs_sio_multiplayer_async_capture(&state,&regs);
    }
    assert(!gbs_sio_multiplayer_async_begin(&state,&regs,1));
    assert(poll()==-1 && mask==0 && state.count==0);
    assert(!poll());
    gbs_sio_multiplayer_async_reset(&state,&regs,0);
    regs.control=0x604C;
    assert(gbs_sio_multiplayer_async_begin(&state,&regs,0));
    gbs_sio_multiplayer_async_capture(&state,&regs);
    assert(poll()==-1 && mask==0);
    for (unsigned i=0;i<4;++i) assert(values[i]==0);
}
