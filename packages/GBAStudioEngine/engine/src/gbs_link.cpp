#include "gbs/link.hpp"
#include "gbs_hw.h"

namespace gbs {

void link_open(LinkSession& session, LinkRole role, uint16_t timeout_frames) {
    if (role == LinkRole::Disconnected) {
        link_close(session);
        return;
    }

    session.active = true;
    session.role = role;
    session.timeout_frames = timeout_frames == 0 ? 1 : timeout_frames;
    session.last_sent = 0;
    session.last_received = 0;
    session.last_transfer_ok = false;
    gbs_hw_sio_normal8_init(link_role_uses_internal_clock(role) ? 1 : 0);
}

void link_close(LinkSession& session) {
    gbs_hw_sio_close();
    session = LinkSession {};
}

bool link_transfer(LinkSession& session, uint8_t value) {
    if (!session.active || session.role == LinkRole::Disconnected) {
        return false;
    }

    uint8_t incoming = 0;
    const int ok = gbs_hw_sio_normal8_transfer(
        value,
        link_role_uses_internal_clock(session.role) ? 1 : 0,
        session.timeout_frames,
        &incoming
    );
    session.last_sent = value;
    session.last_received = ok ? incoming : 0;
    session.last_transfer_ok = ok != 0;
    return session.last_transfer_ok;
}

bool runtime_link_service_enabled(const RuntimeLinkService& service) {
    return service.session != nullptr && service.capabilities != nullptr &&
        is_valid_runtime_capability_manifest(*service.capabilities) &&
        runtime_capability_enabled(*service.capabilities, RuntimeCapabilityID::Link);
}

bool runtime_link_open(RuntimeLinkService& service, LinkRole role, uint16_t timeout_frames) {
    if (!runtime_link_service_enabled(service)) return false;
    link_open(*service.session, role, timeout_frames);
    return service.session->active;
}

bool runtime_link_transfer(RuntimeLinkService& service, uint8_t value) {
    return runtime_link_service_enabled(service) && link_transfer(*service.session, value);
}

void runtime_link_close(RuntimeLinkService& service) {
    if (service.session != nullptr) {
        link_close(*service.session);
    }
}

// ============================================================
// Multiplayer implementation
// ============================================================

bool link_32bit_transfer(LinkSession& session, uint32_t value) {
    if (!session.active || session.role == LinkRole::Disconnected) {
        return false;
    }
    uint32_t incoming = 0;
    const int ok = gbs_hw_sio_normal32_transfer(
        value,
        link_role_uses_internal_clock(session.role) ? 1 : 0,
        session.timeout_frames,
        &incoming
    );
    session.last_sent32 = value;
    session.last_received32 = ok ? incoming : 0;
    session.last_transfer_ok = ok != 0;
    return session.last_transfer_ok;
}

bool runtime_link_32bit_transfer(RuntimeLinkService& service, uint32_t value) {
    return runtime_link_service_enabled(service) && link_32bit_transfer(*service.session, value);
}

bool link_multiplayer_transfer(LinkSession& session, uint16_t value) {
    // Delegate to the multiplayer session API.
    MultiplayerSession mp;
    mp.active = session.active;
    mp.player_count = 2;
    mp.connected_mask = session.active ? 0x03 : 0;
    mp.local_data = value;
    mp.timeout_frames = session.timeout_frames;
    const bool ok = multiplayer_transfer(mp);
    session.last_transfer_ok = ok;
    session.last_sent = static_cast<uint8_t>(value & 0xFF);
    session.last_received = ok ? static_cast<uint8_t>(mp.received[1] & 0xFF) : 0;
    return ok;
}

void multiplayer_open(MultiplayerSession& session, uint8_t player_count) {
    if (player_count < 2 || player_count > link_max_players) {
        return;
    }
    session = MultiplayerSession {};
    session.active = true;
    session.player_count = player_count;
    if (!gbs_hw_sio_multiplayer_init()) session = MultiplayerSession {};
}

void multiplayer_close(MultiplayerSession& session) {
    session = MultiplayerSession {};
    gbs_hw_sio_close();
}

void multiplayer_set_data(MultiplayerSession& session, uint16_t data) {
    session.local_data = data;
}

bool multiplayer_transfer(MultiplayerSession& session) {
    if (!session.active) {
        return false;
    }
    session.sync_ok = gbs_hw_sio_multiplayer_transfer(
        session.local_data, session.timeout_frames, session.received,
        &session.player_id, &session.connected_mask) != 0;
    const uint8_t allowed_mask = static_cast<uint8_t>((1u << session.player_count) - 1u);
    session.connected_mask = static_cast<uint8_t>(session.connected_mask & allowed_mask);
    return session.sync_ok;
}

uint16_t multiplayer_get_data(const MultiplayerSession& session, uint8_t player_id) {
    if (player_id >= link_max_players) {
        return 0;
    }
    return session.received[player_id];
}

uint8_t multiplayer_connected_count(const MultiplayerSession& session) {
    uint8_t count = 0;
    for (uint8_t i = 0; i < session.player_count; ++i) {
        if ((session.connected_mask & (1u << i)) != 0) {
            ++count;
        }
    }
    return count;
}

} // namespace gbs
