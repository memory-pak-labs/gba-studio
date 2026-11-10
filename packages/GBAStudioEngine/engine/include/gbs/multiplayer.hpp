#pragma once

#include <stdint.h>

namespace gbs {

constexpr uint8_t multiplayer_send_capacity = 8;
constexpr uint8_t multiplayer_receive_capacity = 16;

enum class MultiplayerBaud : uint8_t { Bps9600, Bps38400, Bps57600, Bps115200 };
enum class MultiplayerConnectionState : uint8_t { Closed, Connecting, Connected, Recovering };

struct MultiplayerConfig {
    uint8_t players = 2;
    MultiplayerBaud baud = MultiplayerBaud::Bps115200;
    uint16_t timeout_frames = 30;
    uint16_t retry_frames = 8;
    // Nonzero 12-bit application session identifier. Choose a new ID when a
    // game restarts; this is not a persistent/durable delivery protocol.
    uint16_t session_id = 1;
};

struct MultiplayerMessage { uint16_t value = 0; uint8_t player_id = 0; };

// Optional transport injection for deterministic tests. An empty transport uses
// GBA SIO. One native connection owns the serial port; raw Link APIs cannot be
// used concurrently. Game code calls update once per frame, outside interrupts.
struct MultiplayerTransport {
    bool (*open)(void*, MultiplayerBaud) = nullptr;
    bool (*begin)(void*, uint16_t) = nullptr;
    int (*poll)(void*, uint16_t[4], uint8_t&, uint8_t&) = nullptr;
    void (*close)(void*) = nullptr;
    void* user_data = nullptr;
};

struct MultiplayerPeer {
    uint16_t epoch = 0, sequence = 0, value = 0, header = 0;
    uint16_t delivered_epoch = 0, delivered_sequence = 0;
    uint16_t ack_epoch = 0, ack_sequence = 0;
    uint8_t phase = 0;
    bool delivered = false, ack_pending = false;
};

// Fixed storage, no heap or ISR callbacks. Fields below state/player_id/mask
// belong to the protocol; initialize/open through the API, do not mutate them.
struct MultiplayerQueue {
    MultiplayerConnectionState state = MultiplayerConnectionState::Closed;
    uint8_t player_id = 0, connected_mask = 0;
    MultiplayerConfig config {};
    MultiplayerTransport transport {};
    MultiplayerPeer peers[4] {};
    uint16_t outgoing[multiplayer_send_capacity] {};
    MultiplayerMessage incoming[multiplayer_receive_capacity] {};
    uint16_t packet[4] {};
    uint16_t sequence = 0, waiting_frames = 0, missing_frames = 0, retry_left = 0;
    uint8_t send_head = 0, send_count = 0, receive_head = 0, receive_count = 0;
    uint8_t packet_size = 0, packet_index = 0, acknowledged_mask = 0, next_ack = 0;
    bool waiting = false, in_flight = false, prefer_data = true, ever_connected = false, transport_ready = false;
    uint32_t recoveries = 0, corrupt_packets = 0, receive_full_count = 0;
};

bool multiplayer_queue_open(MultiplayerQueue&, const MultiplayerConfig& = {}, const MultiplayerTransport& = {});
void multiplayer_queue_close(MultiplayerQueue&);
// Bounded, non-blocking update: at most one poll and one begin per invocation.
// Reconnects automatically, retaining queued messages and duplicate detection.
void multiplayer_queue_update(MultiplayerQueue&);
// Broadcast a full 16-bit value to every configured peer. False means closed
// or send queue full; no existing message is removed. True means enqueued, not
// delivered. Only remove a sent message after all peers acknowledge receipt.
bool multiplayer_queue_send(MultiplayerQueue&, uint16_t value);
bool multiplayer_queue_receive(MultiplayerQueue&, MultiplayerMessage&);
uint8_t multiplayer_queue_pending_send(const MultiplayerQueue&);
uint8_t multiplayer_queue_pending_receive(const MultiplayerQueue&);

// Project-wide connection used by authored events. The core updates it once
// per frame and rebinds it after runtime initialization without clearing queues.
MultiplayerQueue& multiplayer_connection();
bool multiplayer_open_connection(const MultiplayerConfig&);
void multiplayer_close_connection();
void multiplayer_resume_connection();
void multiplayer_update_connection();

} // namespace gbs
