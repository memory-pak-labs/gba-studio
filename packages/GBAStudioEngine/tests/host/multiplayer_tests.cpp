#include <cassert>
#include "gbs/link.hpp"

namespace {
uint32_t last_normal32_outgoing = 0;
bool last_normal32_internal_clock = false;
uint16_t last_multiplayer_outgoing = 0;
uint8_t multiplayer_init_calls = 0;
}

// Stubs for hardware functions used by gbs_link.cpp.
extern "C" {
    void gbs_hw_sio_normal8_init(int) {}
    int gbs_hw_sio_normal8_transfer(uint8_t, int, uint32_t, uint8_t* incoming) {
        if (incoming) *incoming = 0x42;
        return 1;
    }
    int gbs_hw_sio_normal16_transfer(uint16_t, int, uint32_t, uint16_t* incoming) {
        if (incoming) *incoming = 0x1234;
        return 1;
    }
    int gbs_hw_sio_normal32_transfer(uint32_t outgoing, int internal_clock, uint32_t, uint32_t* incoming) {
        last_normal32_outgoing = outgoing;
        last_normal32_internal_clock = internal_clock != 0;
        if (incoming) *incoming = 0xCAFEBABE;
        return 1;
    }
    int gbs_hw_sio_multiplayer_init() {
        ++multiplayer_init_calls;
        return 1;
    }
    int gbs_hw_sio_multiplayer_transfer(uint16_t outgoing, uint32_t, uint16_t* received,
                                        uint8_t* player_id, uint8_t* connected_mask) {
        last_multiplayer_outgoing = outgoing;
        if (received) {
            received[0] = 0x1000;
            received[1] = 0x1001;
            received[2] = 0xFFFF;
            received[3] = 0xFFFF;
        }
        if (player_id) *player_id = 1;
        if (connected_mask) *connected_mask = 0x03;
        return 1;
    }
    void gbs_hw_sio_close() {}
}

using namespace gbs;

void test_multiplayer_open_2p() {
    MultiplayerSession s;
    multiplayer_open(s, 2);
    assert(s.active);
    assert(s.player_count == 2);
    assert(multiplayer_init_calls == 1);
    assert(s.connected_mask == 0);
}

void test_multiplayer_open_4p() {
    MultiplayerSession s;
    multiplayer_open(s, 4);
    assert(s.active);
    assert(s.player_count == 4);
    assert(s.connected_mask == 0);
}

void test_multiplayer_open_invalid() {
    MultiplayerSession s;
    multiplayer_open(s, 1); // too few
    assert(!s.active);
    multiplayer_open(s, 5); // too many
    assert(!s.active);
}

void test_multiplayer_close() {
    MultiplayerSession s;
    multiplayer_open(s, 2);
    multiplayer_close(s);
    assert(!s.active);
}

void test_multiplayer_set_data() {
    MultiplayerSession s;
    multiplayer_open(s, 2);
    multiplayer_set_data(s, 0xABCD);
    assert(s.local_data == 0xABCD);
}

void test_multiplayer_transfer() {
    MultiplayerSession s;
    multiplayer_open(s, 2);
    multiplayer_set_data(s, 0x1234);
    bool ok = multiplayer_transfer(s);
    assert(ok);
    assert(s.sync_ok);
    assert(last_multiplayer_outgoing == 0x1234);
    assert(s.player_id == 1);
    assert(s.connected_mask == 0x03);
    assert(s.received[0] == 0x1000);
    assert(s.received[1] == 0x1001);
}

void test_multiplayer_get_data() {
    MultiplayerSession s;
    multiplayer_open(s, 3);
    multiplayer_set_data(s, 0x5678);
    multiplayer_transfer(s);
    assert(multiplayer_get_data(s, 0) == 0x1000);
    assert(multiplayer_get_data(s, 1) == 0x1001);
    assert(multiplayer_get_data(s, 4) == 0); // out of range
}

void test_multiplayer_connected_count() {
    MultiplayerSession s;
    multiplayer_open(s, 4);
    assert(multiplayer_connected_count(s) == 0);
    s.connected_mask = 0x05; // players 0 and 2
    assert(multiplayer_connected_count(s) == 2);
}

void test_link_32bit_transfer() {
    LinkSession s;
    link_open(s, LinkRole::Host);
    bool ok = link_32bit_transfer(s, 0xDEADBEEF);
    assert(ok);
    assert(s.last_transfer_ok);
    assert(last_normal32_outgoing == 0xDEADBEEF);
    assert(last_normal32_internal_clock);
    assert(s.last_sent32 == 0xDEADBEEF);
    assert(s.last_received32 == 0xCAFEBABE);
}

void test_runtime_link_32bit_transfer_respects_capability() {
    LinkSession session;
    static constexpr RuntimeCapabilityDescriptor descriptors[] = {
        { RuntimeCapabilityID::Link, true, false }
    };
    static constexpr RuntimeCapabilityManifest capabilities { 1, descriptors, 1 };
    RuntimeLinkService service { &session, &capabilities };
    assert(runtime_link_open(service, LinkRole::Host));
    assert(runtime_link_32bit_transfer(service, 0x01020304));
    assert(session.last_received32 == 0xCAFEBABE);
}

void test_link_multiplayer_transfer() {
    LinkSession s;
    link_open(s, LinkRole::Host);
    bool ok = link_multiplayer_transfer(s, 0x42);
    assert(ok);
}

int main() {
    test_multiplayer_open_2p();
    test_multiplayer_open_4p();
    test_multiplayer_open_invalid();
    test_multiplayer_close();
    test_multiplayer_set_data();
    test_multiplayer_transfer();
    test_multiplayer_get_data();
    test_multiplayer_connected_count();
    test_link_32bit_transfer();
    test_runtime_link_32bit_transfer_respects_capability();
    test_link_multiplayer_transfer();
    return 0;
}
