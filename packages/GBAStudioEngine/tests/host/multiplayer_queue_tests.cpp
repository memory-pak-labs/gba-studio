#include <cassert>
#include <cstdio>
#include <initializer_list>
#include <deque>
#include "gbs/multiplayer.hpp"

// The real protocol runs on every node. Only the serial registers/IRQ are
// replaced by a deterministic four-terminal cable with loss/error injection.
struct Cable;
struct Port {
    struct Snapshot { uint16_t values[4]; uint8_t mask; int result; };
    Cable* cable;
    unsigned id;
    bool opened = false, armed = false, ready = false;
    bool fail_open = false;
    unsigned opens = 0, polls = 0;
    int result = 1;
    uint16_t outgoing = 0, incoming[4] = {};
    uint8_t mask = 0;
    std::deque<Snapshot> snapshots {};
};
struct Cable {
    Port port[4];
    gbs::MultiplayerQueue queue[4] {};
    uint8_t present;
    unsigned count, tick = 0, corrupt = 0, errors = 0, lose = 0;
    bool free_running = false;
    unsigned update_every[4] = {1, 1, 1, 1};
    explicit Cable(unsigned players, unsigned timeout=8) : present((1u << players)-1), count(players) {
        for (unsigned i=0;i<count;++i) {
            port[i] = Port{this,i};
            const gbs::MultiplayerTransport transport{open, begin, poll, close, &port[i]};
            gbs::MultiplayerConfig config;
            config.players = players;
            config.session_id = 10+i;
            config.timeout_frames = timeout;
            config.retry_frames = 2;
            assert(gbs::multiplayer_queue_open(queue[i], config, transport));
        }
    }
    static bool open(void* data, gbs::MultiplayerBaud) {
        auto& p=*static_cast<Port*>(data);
        p.opened=!p.fail_open;p.armed=p.ready=false;++p.opens;return p.opened;
    }
    static bool begin(void* data,uint16_t value) {
        auto& p=*static_cast<Port*>(data);
        if(!p.opened)return false;
        assert(!p.armed && !p.ready);
        assert(value != 0xFFFF);
        p.armed=true;p.outgoing=value;return true;
    }
    static int poll(void* data,uint16_t values[4],uint8_t& id,uint8_t& mask) {
        auto& p=*static_cast<Port*>(data);++p.polls;
        if(!p.opened)return -1;
        if (!p.snapshots.empty()) {
            const auto snapshot = p.snapshots.front(); p.snapshots.pop_front();
            id=p.id;mask=snapshot.mask;
            for(unsigned i=0;i<4;++i)values[i]=snapshot.values[i];
            return snapshot.result;
        }
        if(!p.ready)return 0;
        p.ready=false;id=p.id;mask=p.mask;
        for(unsigned i=0;i<4;++i)values[i]=p.incoming[i];
        return p.result;
    }
    static void close(void* data) {
        auto& p=*static_cast<Port*>(data);p.opened=p.armed=p.ready=false;
        p.snapshots.clear();
    }
    void frame() {
        ++tick;
        for(unsigned i=0;i<count;++i) {
            if (tick % update_every[i]) continue;
            unsigned before=port[i].polls;
            gbs::multiplayer_queue_update(queue[i]);
            assert(port[i].polls-before <= gbs::multiplayer_poll_budget);
        }
        uint8_t active=0;
        for(unsigned i=0;i<count;++i)
            if((present&(1u<<i)) && port[i].armed)active|=1u<<i;
        if (free_running) {
            // A hardware parent can clock a child before its next game
            // update. The child keeps transmitting its last register value;
            // an unarmed child delivers incoming data, not a local TX completion.
            if (!(active & 1)) return;
        } else if(active != present || !(present&1))return;
        if(lose) {--lose;return;}
        if (free_running) {
            for(unsigned i=0;i<count;++i)if(present&(1u<<i)) {
                auto& p=port[i];
                Port::Snapshot snapshot {};
                snapshot.mask=present;snapshot.result=p.armed?1:2;
                for(unsigned j=0;j<4;++j)snapshot.values[j]=(present&(1u<<j))?port[j].outgoing:0xFFFF;
                p.snapshots.push_back(snapshot);p.armed=false;
            }
            return;
        }
        for(unsigned i=0;i<count;++i)if(active&(1u<<i)) {
            auto& p=port[i];p.armed=false;p.ready=true;p.mask=active;
            p.result=errors?-1:1;
            for(unsigned j=0;j<4;++j)p.incoming[j]=(active&(1u<<j))?port[j].outgoing:0xFFFF;
            if(corrupt && i==1)p.incoming[0]^=0x10;
        }
        if(corrupt)--corrupt;
        if(errors)--errors;
    }
    void frames(unsigned n) {while(n--)frame();}
};

extern "C" {
int gbs_hw_sio_multiplayer_async_open(unsigned) {return 1;}
int gbs_hw_sio_multiplayer_async_begin(uint16_t) {return 1;}
int gbs_hw_sio_multiplayer_async_poll(uint16_t[4],uint8_t*,uint8_t*) {return 0;}
void gbs_hw_sio_multiplayer_async_close() {}
}

int main() {
    static_assert(sizeof(gbs::MultiplayerQueue) <= 384, "Keep queued link storage bounded");
    {
        Cable c(2,1);
        assert(gbs::multiplayer_queue_send(c.queue[0],7));
        c.frames(100);
        assert(c.queue[0].state == gbs::MultiplayerConnectionState::Connected);
        assert(gbs::multiplayer_queue_pending_send(c.queue[0]) == 0);
    }
    {
        Cable c(2);
        assert(gbs::multiplayer_queue_send(c.queue[0],0));
        assert(gbs::multiplayer_queue_send(c.queue[0],0xFFFF));
        assert(gbs::multiplayer_queue_send(c.queue[0],0xABCD));
        c.frames(180);
        assert(c.queue[0].state == gbs::MultiplayerConnectionState::Connected);
        assert(gbs::multiplayer_queue_pending_send(c.queue[0])==0);
        gbs::MultiplayerMessage message;
        for(uint16_t value:{uint16_t(0),uint16_t(0xFFFF),uint16_t(0xABCD)}) {
            assert(gbs::multiplayer_queue_receive(c.queue[1],message));
            assert(message.player_id==0 && message.value==value);
        }
        assert(!gbs::multiplayer_queue_receive(c.queue[1],message));
        assert(!gbs::multiplayer_queue_receive(c.queue[0],message));
    }
    {
        Cable c(4);
        for(unsigned i=0;i<4;++i)for(unsigned j=0;j<3;++j)
            assert(gbs::multiplayer_queue_send(c.queue[i],100*i+j));
        c.corrupt=40;c.errors=3;c.lose=20;
        c.frames(1000);
        for(unsigned i=0;i<4;++i) {
            unsigned next[4]={};gbs::MultiplayerMessage message;
            assert(gbs::multiplayer_queue_pending_send(c.queue[i])==0);
            while(gbs::multiplayer_queue_receive(c.queue[i],message)) {
                assert(message.player_id != i);
                assert(message.value==message.player_id*100+next[message.player_id]++);
            }
            for(unsigned j=0;j<4;++j)assert(next[j]==(j==i?0:3));
        }
    }
    {
        Cable c(2);c.frames(30);
        c.present=1;
        for(unsigned i=0;i<gbs::multiplayer_send_capacity;++i)
            assert(gbs::multiplayer_queue_send(c.queue[0],i));
        assert(!gbs::multiplayer_queue_send(c.queue[0],900));
        c.frames(60);
        assert(c.queue[0].state==gbs::MultiplayerConnectionState::Recovering);
        assert(gbs::multiplayer_queue_pending_send(c.queue[0])==gbs::multiplayer_send_capacity);
        assert(c.port[0].opens>1);
        c.present=3;c.frames(500);
        assert(c.queue[0].state==gbs::MultiplayerConnectionState::Connected);
        assert(gbs::multiplayer_queue_pending_send(c.queue[0])==0);
        gbs::MultiplayerMessage m;
        for(unsigned i=0;i<gbs::multiplayer_send_capacity;++i) {
            assert(gbs::multiplayer_queue_receive(c.queue[1],m));assert(m.value==i);
        }
        assert(!gbs::multiplayer_queue_receive(c.queue[1],m));
    }
    {
        Cable c(2);
        for(unsigned batch=0;batch<2;++batch) {
            for(unsigned i=0;i<8;++i)assert(gbs::multiplayer_queue_send(c.queue[0],batch*8+i));
            c.frames(300);
        }
        assert(gbs::multiplayer_queue_pending_receive(c.queue[1])==16);
        assert(gbs::multiplayer_queue_send(c.queue[0],0xEEEE));
        c.frames(100);
        assert(gbs::multiplayer_queue_pending_send(c.queue[0])==1);
        assert(c.queue[1].receive_full_count>0);
        gbs::MultiplayerMessage m;
        assert(gbs::multiplayer_queue_receive(c.queue[1],m) && m.value==0);
        c.frames(100);
        assert(gbs::multiplayer_queue_pending_send(c.queue[0])==0);
        for(unsigned i=1;i<16;++i)assert(gbs::multiplayer_queue_receive(c.queue[1],m) && m.value==i);
        assert(gbs::multiplayer_queue_receive(c.queue[1],m) && m.value==0xEEEE);
        assert(!gbs::multiplayer_queue_receive(c.queue[1],m));
    }
    {
        Cable c(2);c.frames(30);
        assert(gbs::multiplayer_queue_send(c.queue[0],42));
        for(unsigned n=0;n<150 && !gbs::multiplayer_queue_pending_receive(c.queue[1]);++n)c.frame();
        assert(gbs::multiplayer_queue_pending_receive(c.queue[1])==1);
        // Receiver accepted the message, but its ACK has not reached sender.
        assert(gbs::multiplayer_queue_pending_send(c.queue[0])==1);
        c.present=1;c.port[0].fail_open=true;c.frames(40);
        assert(gbs::multiplayer_queue_pending_send(c.queue[0])==1);
        c.port[0].fail_open=false;c.present=3;c.frames(150);
        assert(gbs::multiplayer_queue_pending_receive(c.queue[1])==1);
        assert(gbs::multiplayer_queue_pending_send(c.queue[0])==0);
        gbs::multiplayer_queue_close(c.queue[0]);
        auto polls=c.port[0].polls;c.frames(10);
        assert(c.port[0].polls==polls);
        assert(!gbs::multiplayer_queue_send(c.queue[0],1));
        auto invalid=c.queue[1].config;invalid.players=5;
        assert(!gbs::multiplayer_queue_open(c.queue[1],invalid));
        assert(c.queue[1].state!=gbs::MultiplayerConnectionState::Closed);
    }
    {
        Cable c(2);
        for(unsigned n=0;n<1100;++n) { // Wrap the 10-bit packet sequence.
            const auto value=static_cast<uint16_t>(n*617);
            assert(gbs::multiplayer_queue_send(c.queue[0],value));
            unsigned received=0;
            for(unsigned frame=0;frame<150 && (gbs::multiplayer_queue_pending_send(c.queue[0]) || !received);++frame) {
                c.frame();gbs::MultiplayerMessage m;
                while(gbs::multiplayer_queue_receive(c.queue[1],m)) {assert(m.value==value);++received;}
            }
            assert(received==1 && gbs::multiplayer_queue_pending_send(c.queue[0])==0);
        }
    }
    for (unsigned players : {2u,4u}) {
        Cable c(players);
        c.free_running = true;
        for (unsigned i=0;i<players;++i) c.update_every[i]=i+1;
        for (unsigned sender=0;sender<players;++sender)
            for (unsigned value=0;value<3;++value)
                assert(gbs::multiplayer_queue_send(c.queue[sender], 100*sender+value));
        c.frames(4000);
        for (unsigned receiver=0;receiver<players;++receiver) {
            assert(gbs::multiplayer_queue_pending_send(c.queue[receiver])==0);
            gbs::MultiplayerMessage message;
            unsigned next[4]={};
            while(gbs::multiplayer_queue_receive(c.queue[receiver],message)) {
                assert(message.player_id != receiver);
                assert(message.value==100*message.player_id+next[message.player_id]++);
            }
            for(unsigned sender=0;sender<players;++sender) assert(next[sender]==(sender==receiver?0u:3u));
        }
    }
    {
        Cable c(2);
        c.queue[0].config.retry_frames = 60;
        for (unsigned value=0;value<3;++value) assert(gbs::multiplayer_queue_send(c.queue[0],value));
        c.frames(40);
        // Retry cooldown belongs to the unacknowledged message, not its
        // successor. A confirmed message must not hold the next one idle.
        assert(gbs::multiplayer_queue_pending_send(c.queue[0])==0);
    }
    {
        gbs::MultiplayerQueue a {}, b {};
        assert(gbs::multiplayer_queue_open(a));
        assert(!gbs::multiplayer_queue_open(b)); // Only one native serial owner.
        gbs::multiplayer_queue_close(a);
        assert(gbs::multiplayer_queue_open(b));
        gbs::multiplayer_queue_close(b);
    }
    puts("Multiplayer queued protocol: PASS (2/4 peers, loss, CRC, reconnect, backpressure, sequence wrap)");
}
