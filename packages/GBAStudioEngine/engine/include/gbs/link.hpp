#pragma once

#include <stdint.h>

#include "gbs/runtime_capabilities.hpp"

namespace gbs {

enum class LinkRole : uint8_t {
    Disconnected = 0,
    Host = 1,
    Join = 2
};

struct LinkSession {
    bool active = false;
    LinkRole role = LinkRole::Disconnected;
    uint16_t timeout_frames = 0;
    uint8_t last_sent = 0;
    uint8_t last_received = 0;
    uint32_t last_sent32 = 0;
    uint32_t last_received32 = 0;
    bool last_transfer_ok = false;
};

// ============================================================
// Multiplayer Link (2-4 players, 16-bit mode)
// ============================================================
// Uses SIO Multiplayer mode. SIOCNT bits 4-5 expose the hardware-assigned
// player ID; disconnected slots read 0xFFFF from SIOMULTI0..3.
// Each player sends/receives 16-bit data per transfer.

constexpr uint8_t link_max_players = 4;

struct MultiplayerSession {
    bool active = false;
    uint8_t player_id = 0;       // 0-3, assigned by hardware (player 0 = host)
    uint8_t player_count = 0;    // 2, 3, or 4
    uint8_t connected_mask = 0;  // bit N = player N is connected
    uint16_t local_data = 0;     // data to send next transfer
    uint16_t received[link_max_players] = {}; // data received from each player
    bool sync_ok = false;        // true if last transfer succeeded for all players
    uint16_t timeout_frames = 4;
};

struct RuntimeLinkService {
    LinkSession* session;
    const RuntimeCapabilityManifest* capabilities;
};

constexpr bool link_role_uses_internal_clock(LinkRole role) {
    return role == LinkRole::Host;
}

void link_open(LinkSession& session, LinkRole role, uint16_t timeout_frames = 4);
void link_close(LinkSession& session);
bool link_transfer(LinkSession& session, uint8_t value);
bool link_32bit_transfer(LinkSession& session, uint32_t value);
bool link_multiplayer_transfer(LinkSession& session, uint16_t value);
bool runtime_link_service_enabled(const RuntimeLinkService& service);
bool runtime_link_open(RuntimeLinkService& service, LinkRole role, uint16_t timeout_frames = 4);
bool runtime_link_transfer(RuntimeLinkService& service, uint8_t value);
bool runtime_link_32bit_transfer(RuntimeLinkService& service, uint32_t value);
void runtime_link_close(RuntimeLinkService& service);

// Multiplayer API (2-4 players, 16-bit)

// Open a multiplayer session. player_count = 2..4.
void multiplayer_open(MultiplayerSession& session, uint8_t player_count);

// Close the multiplayer session.
void multiplayer_close(MultiplayerSession& session);

// Set the data to send in the next transfer.
void multiplayer_set_data(MultiplayerSession& session, uint16_t data);

// Perform a transfer: sends local_data and receives data from all connected
// players. Returns true if all players responded.
bool multiplayer_transfer(MultiplayerSession& session);

// Get data received from a specific player (0..3).
uint16_t multiplayer_get_data(const MultiplayerSession& session, uint8_t player_id);

// Number of players currently connected.
uint8_t multiplayer_connected_count(const MultiplayerSession& session);

} // namespace gbs
