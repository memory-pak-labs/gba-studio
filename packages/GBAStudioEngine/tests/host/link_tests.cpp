#include <cassert>
#include "gbs/link.hpp"

namespace {

int init_calls = 0;
int close_calls = 0;
int transfer_calls = 0;
int last_internal_clock = -1;
uint8_t last_outgoing = 0;
uint32_t last_timeout = 0;
uint8_t next_incoming = 0;
int next_transfer_ok = 1;

extern "C" void gbs_hw_sio_normal8_init(int internal_clock) {
    ++init_calls;
    last_internal_clock = internal_clock;
}

extern "C" int gbs_hw_sio_normal8_transfer(uint8_t outgoing, int internal_clock, uint32_t timeout_frames, uint8_t* incoming) {
    ++transfer_calls;
    last_outgoing = outgoing;
    last_internal_clock = internal_clock;
    last_timeout = timeout_frames;
    if (next_transfer_ok && incoming != nullptr) {
        *incoming = next_incoming;
    }
    return next_transfer_ok;
}

extern "C" void gbs_hw_sio_close(void) {
    ++close_calls;
}

extern "C" int gbs_hw_sio_normal32_transfer(uint32_t outgoing, int internal_clock, uint32_t timeout_frames, uint32_t* incoming) {
    (void)outgoing;
    (void)internal_clock;
    (void)timeout_frames;
    if (incoming) *incoming = 0;
    return 1;
}

extern "C" int gbs_hw_sio_multiplayer_init(void) { return 1; }
extern "C" int gbs_hw_sio_multiplayer_transfer(uint16_t, uint32_t, uint16_t received[4],
                                                uint8_t* player_id, uint8_t* connected_mask) {
    if (received) for (int index = 0; index < 4; ++index) received[index] = 0xFFFFu;
    if (player_id) *player_id = 0;
    if (connected_mask) *connected_mask = 0;
    return 0;
}

void reset_hw() {
    init_calls = 0;
    close_calls = 0;
    transfer_calls = 0;
    last_internal_clock = -1;
    last_outgoing = 0;
    last_timeout = 0;
    next_incoming = 0;
    next_transfer_ok = 1;
}

void test_link_host_initializes_internal_clock_session() {
    reset_hw();
    gbs::LinkSession session {};

    gbs::link_open(session, gbs::LinkRole::Host, 12);

    assert(session.active);
    assert(session.role == gbs::LinkRole::Host);
    assert(session.timeout_frames == 12);
    assert(init_calls == 1);
    assert(last_internal_clock == 1);
}

void test_link_join_initializes_external_clock_session() {
    reset_hw();
    gbs::LinkSession session {};

    gbs::link_open(session, gbs::LinkRole::Join, 5);

    assert(session.active);
    assert(session.role == gbs::LinkRole::Join);
    assert(session.timeout_frames == 5);
    assert(init_calls == 1);
    assert(last_internal_clock == 0);
}

void test_link_transfer_records_successful_byte_exchange() {
    reset_hw();
    gbs::LinkSession session {};
    gbs::link_open(session, gbs::LinkRole::Host, 7);
    next_incoming = 0x42;

    assert(gbs::link_transfer(session, 0xA5));

    assert(transfer_calls == 1);
    assert(last_internal_clock == 1);
    assert(last_outgoing == 0xA5);
    assert(last_timeout == 7);
    assert(session.last_sent == 0xA5);
    assert(session.last_received == 0x42);
    assert(session.last_transfer_ok);
}

void test_link_transfer_rejects_inactive_or_timed_out_session() {
    reset_hw();
    gbs::LinkSession inactive {};
    assert(!gbs::link_transfer(inactive, 0x11));
    assert(transfer_calls == 0);

    gbs::LinkSession session {};
    gbs::link_open(session, gbs::LinkRole::Join, 3);
    next_transfer_ok = 0;

    assert(!gbs::link_transfer(session, 0x22));

    assert(transfer_calls == 1);
    assert(last_internal_clock == 0);
    assert(session.last_sent == 0x22);
    assert(session.last_received == 0);
    assert(!session.last_transfer_ok);
}

void test_link_close_resets_session_and_hardware() {
    reset_hw();
    gbs::LinkSession session {};
    gbs::link_open(session, gbs::LinkRole::Host, 4);

    gbs::link_close(session);

    assert(close_calls == 1);
    assert(!session.active);
    assert(session.role == gbs::LinkRole::Disconnected);
    assert(session.timeout_frames == 0);
}

void test_runtime_link_service_requires_universal_capability() {
    static constexpr gbs::RuntimeCapabilityDescriptor enabled_capabilities[] = {
        { gbs::RuntimeCapabilityID::Save, false, false },
        { gbs::RuntimeCapabilityID::Rtc, false, false },
        { gbs::RuntimeCapabilityID::Link, true, true },
        { gbs::RuntimeCapabilityID::Affine, false, false }
    };
    static constexpr gbs::RuntimeCapabilityManifest enabled_manifest {
        1,
        enabled_capabilities,
        sizeof(enabled_capabilities) / sizeof(enabled_capabilities[0])
    };
    gbs::LinkSession session {};
    gbs::RuntimeLinkService service { &session, &enabled_manifest };
    reset_hw();
    assert(gbs::runtime_link_service_enabled(service));
    assert(gbs::runtime_link_open(service, gbs::LinkRole::Host, 8));
    next_incoming = 0x37;
    assert(gbs::runtime_link_transfer(service, 0xA2));
    assert(session.last_received == 0x37);
    gbs::runtime_link_close(service);
    assert(!session.active);

    static constexpr gbs::RuntimeCapabilityDescriptor disabled_capabilities[] = {
        { gbs::RuntimeCapabilityID::Save, false, false },
        { gbs::RuntimeCapabilityID::Rtc, false, false },
        { gbs::RuntimeCapabilityID::Link, false, false },
        { gbs::RuntimeCapabilityID::Affine, false, false }
    };
    static constexpr gbs::RuntimeCapabilityManifest disabled_manifest {
        1,
        disabled_capabilities,
        sizeof(disabled_capabilities) / sizeof(disabled_capabilities[0])
    };
    gbs::RuntimeLinkService disabled { &session, &disabled_manifest };
    assert(!gbs::runtime_link_service_enabled(disabled));
    assert(!gbs::runtime_link_open(disabled, gbs::LinkRole::Join, 8));
}

} // namespace

int main() {
    test_link_host_initializes_internal_clock_session();
    test_link_join_initializes_external_clock_session();
    test_link_transfer_records_successful_byte_exchange();
    test_link_transfer_rejects_inactive_or_timed_out_session();
    test_link_close_resets_session_and_hardware();
    test_runtime_link_service_requires_universal_capability();
    return 0;
}
