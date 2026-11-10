#include "gbs/multiplayer.hpp"
#include "gbs_hw.h"

namespace gbs {
namespace {
MultiplayerQueue* native_owner = nullptr;
bool native_open(void* owner, MultiplayerBaud baud) {
    if (native_owner && native_owner != owner) return false;
    if (!gbs_hw_sio_multiplayer_async_open(static_cast<unsigned>(baud))) return false;
    native_owner = static_cast<MultiplayerQueue*>(owner);
    return true;
}
bool native_begin(void*, uint16_t value) { return gbs_hw_sio_multiplayer_async_begin(value) != 0; }
int native_poll(void*, uint16_t data[4], uint8_t& id, uint8_t& mask) {
    return gbs_hw_sio_multiplayer_async_poll(data, &id, &mask);
}
void native_close(void* owner) {
    if (native_owner != owner) return;
    gbs_hw_sio_multiplayer_async_close();
    native_owner = nullptr;
}

// Every wire word has a type nibble (never F), so FFFF remains an unambiguous
// disconnected slot. Data and ACK frames carry an independent session ID and
// CRC-8 (polynomial 07). A new header always resynchronizes a damaged stream.
uint8_t checksum(uint16_t first, uint16_t second, uint16_t third) {
    uint8_t crc = 0;
    const uint16_t words[] = {first, second, third};
    for (uint16_t word : words) {
        for (unsigned byte = 0; byte < 2; ++byte) {
            crc ^= static_cast<uint8_t>(word >> (byte * 8));
            for (unsigned bit = 0; bit < 8; ++bit)
                crc = static_cast<uint8_t>((crc << 1) ^ ((crc & 0x80u) ? 7u : 0u));
        }
    }
    return crc;
}

uint8_t all_players(const MultiplayerQueue& q) { return static_cast<uint8_t>((1u << q.config.players) - 1u); }
uint8_t remote_players(const MultiplayerQueue& q) { return static_cast<uint8_t>(all_players(q) & ~(1u << q.player_id)); }
bool active(const MultiplayerQueue& q) { return q.state != MultiplayerConnectionState::Closed; }

void reset_stream(MultiplayerQueue& q) {
    q.waiting = false;
    q.waiting_frames = q.missing_frames = 0;
    q.packet_size = q.packet_index = 0;
    for (auto& peer : q.peers) peer.phase = 0;
}

void recover(MultiplayerQueue& q) {
    q.transport.close(q.transport.user_data);
    // Retain outgoing/incoming queues, delivery IDs and pending ACKs. Even
    // failed reinitialization is retried later without losing accepted data.
    q.transport_ready = q.transport.open(q.transport.user_data, q.config.baud);
    reset_stream(q);
    q.connected_mask = 0;
    q.acknowledged_mask = 0;
    q.state = MultiplayerConnectionState::Recovering;
    q.retry_left = q.config.retry_frames;
    ++q.recoveries;
}

void accept_message(MultiplayerQueue& q, uint8_t sender, MultiplayerPeer& peer) {
    if (!peer.delivered || peer.delivered_epoch != peer.epoch || peer.delivered_sequence != peer.sequence) {
        if (q.receive_count == multiplayer_receive_capacity) { ++q.receive_full_count; return; }
        const unsigned tail = (q.receive_head + q.receive_count) % multiplayer_receive_capacity;
        q.incoming[tail] = MultiplayerMessage{peer.value, sender};
        ++q.receive_count;
        peer.delivered = true;
        peer.delivered_epoch = peer.epoch;
        peer.delivered_sequence = peer.sequence;
    }
    peer.ack_epoch = peer.epoch;
    peer.ack_sequence = peer.sequence;
    peer.ack_pending = true;
}

void consume(MultiplayerQueue& q, uint8_t sender, uint16_t word) {
    auto& peer = q.peers[sender];
    const unsigned kind = word >> 12;
    const uint16_t value = word & 0xFFFu;
    if (kind == 8) { peer.epoch = value; peer.phase = value ? 1 : 0; return; }
    if (kind == 12) { peer.header = value; peer.phase = 4; return; }
    if (kind == 1) { // Idle/hello, proves a protocol-speaking terminal.
        peer.phase = 0;
        if (value) q.connected_mask |= static_cast<uint8_t>(1u << sender);
        return;
    }
    if (kind == 9 && peer.phase == 1 && value <= 1023) { peer.sequence = value; peer.phase = 2; return; }
    if (kind == 10 && peer.phase == 2) { peer.value = value; peer.phase = 3; return; }
    if (kind == 11 && peer.phase == 3) {
        peer.phase = 0;
        peer.value = static_cast<uint16_t>(peer.value | ((value >> 8) << 12));
        if (static_cast<uint8_t>(word) == checksum(peer.epoch, peer.sequence, peer.value)) {
            q.connected_mask |= static_cast<uint8_t>(1u << sender);
            accept_message(q, sender, peer);
        }
        else ++q.corrupt_packets;
        return;
    }
    if (kind == 13 && peer.phase == 4 && value) { peer.epoch = value; peer.phase = 5; return; }
    if (kind == 14 && peer.phase == 5 && value <= 255) {
        peer.phase = 0;
        if (value != checksum(peer.header, peer.epoch, 0)) { ++q.corrupt_packets; return; }
        q.connected_mask |= static_cast<uint8_t>(1u << sender);
        if (q.in_flight && (peer.header >> 10) == q.player_id &&
                (peer.header & 1023) == q.sequence && peer.epoch == q.config.session_id)
            q.acknowledged_mask |= static_cast<uint8_t>(1u << sender);
        return;
    }
    peer.phase = 0;
}

bool make_ack(MultiplayerQueue& q) {
    for (unsigned n = 0; n < q.config.players; ++n) {
        const uint8_t sender = (q.next_ack + n) % q.config.players;
        auto& peer = q.peers[sender];
        if (!peer.ack_pending) continue;
        const uint16_t header = static_cast<uint16_t>((sender << 10) | peer.ack_sequence);
        q.packet[0] = static_cast<uint16_t>(0xC000u | header);
        q.packet[1] = static_cast<uint16_t>(0xD000u | peer.ack_epoch);
        q.packet[2] = static_cast<uint16_t>(0xE000u | checksum(header, peer.ack_epoch, 0));
        q.packet_size = 3;
        peer.ack_pending = false;
        q.next_ack = (sender + 1) % q.config.players;
        return true;
    }
    return false;
}

void make_packet(MultiplayerQueue& q) {
    q.packet_index = 0;
    const bool data_ready = q.send_count && q.retry_left == 0 && q.connected_mask == all_players(q);
    if ((!data_ready || !q.prefer_data) && make_ack(q)) { q.prefer_data = true; return; }
    if (data_ready) {
        if (!q.in_flight) { q.in_flight = true; q.acknowledged_mask = 0; }
        const uint16_t value = q.outgoing[q.send_head];
        q.packet[0] = static_cast<uint16_t>(0x8000u | q.config.session_id);
        q.packet[1] = static_cast<uint16_t>(0x9000u | q.sequence);
        q.packet[2] = static_cast<uint16_t>(0xA000u | (value & 0xFFFu));
        q.packet[3] = static_cast<uint16_t>(0xB000u | ((value >> 12) << 8) | checksum(q.config.session_id, q.sequence, value));
        q.packet_size = 4;
        q.retry_left = q.config.retry_frames;
        q.prefer_data = false;
        return;
    }
    if (make_ack(q)) { q.prefer_data = true; return; }
    q.packet[0] = static_cast<uint16_t>(0x1000u | q.config.session_id);
    q.packet_size = 1;
}
} // namespace

bool multiplayer_queue_open(MultiplayerQueue& q, const MultiplayerConfig& config, const MultiplayerTransport& requested) {
    if (config.players < 2 || config.players > 4 || static_cast<unsigned>(config.baud) > 3 ||
            !config.timeout_frames || !config.retry_frames || !config.session_id || config.session_id > 4095) return false;
    MultiplayerTransport transport = requested;
    if (!transport.open && !transport.begin && !transport.poll && !transport.close)
        transport = MultiplayerTransport{native_open, native_begin, native_poll, native_close, &q};
    if (transport.open == native_open && native_owner && native_owner != &q) return false;
    if (!transport.open || !transport.begin || !transport.poll || !transport.close) return false;
    multiplayer_queue_close(q);
    q.config = config;
    q.transport = transport;
    if (!transport.open(transport.user_data, config.baud)) return false;
    q.transport_ready = true;
    q.state = MultiplayerConnectionState::Connecting;
    return true;
}

void multiplayer_queue_close(MultiplayerQueue& q) {
    if (active(q)) q.transport.close(q.transport.user_data);
    q = MultiplayerQueue{};
}

void multiplayer_queue_update(MultiplayerQueue& q) {
    if (!active(q)) return;
    if (q.retry_left) --q.retry_left;
    if (!q.transport_ready) {
        if (!q.retry_left) {
            q.transport_ready = q.transport.open(q.transport.user_data, q.config.baud);
            q.retry_left = q.config.retry_frames;
        }
        return;
    }
    uint16_t values[4] {};
    uint8_t id = 0, mask = 0;
    const int result = q.transport.poll(q.transport.user_data, values, id, mask);
    if (result < 0 || (result > 0 && id >= q.config.players)) { recover(q); return; }
    if (result > 0) {
        q.waiting = false;
        q.waiting_frames = 0;
        // A role change invalidates ACK routing; retained messages are retried.
        if (id != q.player_id) { q.acknowledged_mask = 0; for (auto& p : q.peers) p.phase = 0; }
        q.player_id = id;
        q.connected_mask = (q.connected_mask | (1u << id)) & mask & all_players(q);
        for (uint8_t i = 0; i < q.config.players; ++i) {
            if (i == id) continue;
            if (mask & (1u << i)) consume(q, i, values[i]);
            else q.peers[i].phase = 0;
        }
        if (q.connected_mask == all_players(q)) {
            q.state = MultiplayerConnectionState::Connected;
            q.ever_connected = true;
            q.missing_frames = 0;
        } else q.state = q.ever_connected ? MultiplayerConnectionState::Recovering : MultiplayerConnectionState::Connecting;
        if (q.packet_size && ++q.packet_index == q.packet_size) q.packet_size = 0;
        if (q.in_flight && (q.acknowledged_mask & remote_players(q)) == remote_players(q)) {
            q.send_head = (q.send_head + 1) % multiplayer_send_capacity;
            --q.send_count;
            q.in_flight = false;
            q.sequence = (q.sequence + 1) & 1023;
            // An ACK can arrive while an old retransmission is in progress.
            q.packet_size = 0;
        }
    }
    if (result > 0 && q.connected_mask != all_players(q) && ++q.missing_frames >= q.config.timeout_frames) { recover(q); return; }
    if (q.waiting) {
        if (++q.waiting_frames >= q.config.timeout_frames) recover(q);
        return;
    }
    if (!q.packet_size) make_packet(q);
    if (q.transport.begin(q.transport.user_data, q.packet[q.packet_index])) {
        q.waiting = true;
        q.waiting_frames = 0;
    } else if (++q.waiting_frames >= q.config.timeout_frames) recover(q);
}

bool multiplayer_queue_send(MultiplayerQueue& q, uint16_t value) {
    if (!active(q) || q.send_count == multiplayer_send_capacity) return false;
    q.outgoing[(q.send_head + q.send_count) % multiplayer_send_capacity] = value;
    ++q.send_count;
    return true;
}

bool multiplayer_queue_receive(MultiplayerQueue& q, MultiplayerMessage& message) {
    if (!q.receive_count) return false;
    message = q.incoming[q.receive_head];
    q.receive_head = (q.receive_head + 1) % multiplayer_receive_capacity;
    --q.receive_count;
    return true;
}
uint8_t multiplayer_queue_pending_send(const MultiplayerQueue& q) { return q.send_count; }
uint8_t multiplayer_queue_pending_receive(const MultiplayerQueue& q) { return q.receive_count; }

} // namespace gbs
