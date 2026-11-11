// QA action replication: every terminal controls the existing player in turn.
// Only input is replaced in the exported copy; positions are never injected.
#include "gbs/audio.hpp"
#include "gbs/debug.hpp"
#include "gbs/multiplayer.hpp"
#include "qa-song.hpp"
#include <cstring>

extern "C" void qa_capture_control_state(int32_t*);
extern "C" {
volatile uint32_t scene_link_witness[40] __attribute__((section(".ewram_bss"))) = {};
volatile int32_t control_history[12][18] __attribute__((section(".ewram_bss"))) = {};
}
namespace {
struct ControlProbe {
    unsigned seq=0, phase=0, remaining=0, mask=0, previous=0, raw=0;
    uint8_t acknowledgements[12] {};
    unsigned errors=0, accepted=0, sent=0, received=0, full=0, consumed=0, minimum_voices=0, simulation=0;
    unsigned recoveries=0, corrupt=0, local=0, initial_ie=0, completed=0;
    uint16_t future=0;
    bool initialized=false, ready=false, audio=false, feedback=false, future_pending=false, closed=false;
};
ControlProbe control_probe __attribute__((section(".ewram_bss")));
unsigned expected_control(unsigned seq) {
    const unsigned topdown[]={16,32,128,64,16|256,32|256};
    const unsigned platformer[]={16,32,1,0,16|1,32};
    const unsigned isometric[]={16,32,128,64,16|128,32|64};
    return QA_CONTROL_KIND==1?platformer[seq%6]:QA_CONTROL_KIND==2?isometric[seq%6]:topdown[seq%6];
}
void begin_control(uint16_t value,unsigned frame) {
    auto& p=control_probe;
    if(p.phase||((value>>10)&15u)!=p.seq) {p.errors|=1;return;}
    p.mask=value&1023u;p.phase=1;p.remaining=8;p.feedback=false;
    int32_t state[6] {};qa_capture_control_state(state);
    auto& h=control_history[p.seq];h[0]=p.seq;h[1]=p.seq%QA_PLAYERS;h[2]=p.mask;
    h[3]=h[4]=frame;h[6]=state[0];h[7]=state[1];h[14]=p.raw;h[16]=h[17]=state[1];
}
}
extern "C" bool qa_control_should_update() {
    const auto& p=control_probe;return !p.ready||p.phase==1||p.phase==2;
}
extern "C" gbs::InputState qa_control_input(gbs::InputState raw) {
    auto& p=control_probe;p.raw=raw.held;
    if(p.ready)++p.simulation;
    const unsigned held=p.phase==1?p.mask:0;
    const gbs::InputState input {static_cast<uint16_t>(held),static_cast<uint16_t>(held&~p.previous),static_cast<uint16_t>(p.previous&~held)};
    p.previous=held;
    if(p.seq<12&&(p.phase==1||p.phase==2)) {
        auto& h=control_history[p.seq];h[11]|=input.pressed;h[12]|=input.released;
        if(p.phase==1) {++h[13];++p.consumed;}
        if(--p.remaining==0) {
            if(p.phase==1) {p.phase=2;p.remaining=QA_CONTROL_KIND==1?48:12;}
            else p.phase=3;
        }
    }
    return input;
}
namespace {
void scene_link_frame(const gbs::RuntimeFrameContext& context) {
    auto& p=control_probe;auto& q=gbs::multiplayer_connection();
    p.raw=gbs::poll_input().held;
    const auto& t=gbs::runtime_telemetry_block();
    int32_t state[6] {};qa_capture_control_state(state);
    if(p.seq<12&&p.phase) {
        auto& h=control_history[p.seq];h[10]|=state[4];
        if(state[1]<h[16])h[16]=state[1];if(state[1]>h[17])h[17]=state[1];
    }
    if(!p.initialized) {
        p.initialized=true;p.minimum_voices=255;p.initial_ie=*reinterpret_cast<volatile uint16_t*>(0x04000200);
        gbs::MultiplayerConfig config;config.players=QA_PLAYERS;config.timeout_frames=30;
        if(!gbs::multiplayer_queue_open(q,config))p.errors|=2;
    }
    if(context.active_scene<0||std::strcmp(gbastudio_mixed_project::runtime_registry.scenes[context.active_scene].name,QA_SCENE))p.errors|=4;
    if(!p.audio&&context.frame>=120) {
        gbs::stop_music();gbs::stop_tracker_music();gbs::stop_pcm_music();
        if(!gbs::play_tracker_music(qa_stress_song_asset))p.errors|=8;p.audio=true;
    }
    if(q.state!=gbs::MultiplayerConnectionState::Closed)p.local=q.player_id;
    if(q.recoveries>p.recoveries)p.recoveries=q.recoveries;
    if(q.corrupt_packets>p.corrupt)p.corrupt=q.corrupt_packets;
    if(context.frame>=240) {
        p.ready=true;
        if(t.audio_active_voice_count<p.minimum_voices)p.minimum_voices=t.audio_active_voice_count;
    }
    gbs::MultiplayerMessage message;
    while(gbs::multiplayer_queue_receive(q,message)) {
        const unsigned seq=(message.value>>10)&15u;
        if(message.value&0x8000u) {
            if(seq<12)p.acknowledgements[seq]|=1u<<message.player_id;
        } else {
            if(message.player_id!=seq%QA_PLAYERS) {p.errors|=16;continue;}
            ++p.received;
            if(seq==p.seq)begin_control(message.value,context.frame);
            else if(seq==p.seq+1&&!p.future_pending) {p.future=message.value;p.future_pending=true;}
            else p.errors|=32;
        }
    }
    if(p.seq<12&&p.phase==0&&p.future_pending) {const auto value=p.future;p.future_pending=false;begin_control(value,context.frame);}
    if(context.frame>=240&&p.seq<12&&p.phase==0&&p.local==p.seq%QA_PLAYERS&&q.state==gbs::MultiplayerConnectionState::Connected&&p.raw==expected_control(p.seq)) {
        const auto value=static_cast<uint16_t>((p.seq<<10)|p.raw);
        if(gbs::multiplayer_queue_send(q,value)) {++p.accepted;++p.sent;begin_control(value,context.frame);}
        else ++p.full;
    }
    if(p.seq<12&&p.phase==3&&!p.feedback) {
        auto& h=control_history[p.seq];h[5]=context.frame;h[8]=state[0];h[9]=state[1];h[10]|=state[4];
        if(gbs::multiplayer_queue_send(q,static_cast<uint16_t>(0x8000u|(p.seq<<10)))) {
            ++p.accepted;p.feedback=true;p.acknowledgements[p.seq]|=1u<<p.local;h[15]=1;
        } else ++p.full;
    }
    if(p.seq<12&&p.feedback&&p.acknowledgements[p.seq]==((1u<<QA_PLAYERS)-1)&&!q.send_count) {++p.seq;p.phase=0;p.feedback=false;}
    if(p.seq==12&&!p.completed)p.completed=context.frame;
    if((p.raw&512u)&&p.completed&&!p.closed) {gbs::multiplayer_queue_close(q);p.closed=true;}
    auto& w=scene_link_witness;
    w[0]=0x53434C4B;w[1]=context.frame;w[2]=p.errors;w[3]=p.sent;w[4]=p.full;w[5]=p.received;w[6]=q.send_count;
    w[7]=p.recoveries;w[8]=p.local;w[9]=unsigned(q.state);w[14]=p.corrupt;w[15]=t.audio_active_voice_count;w[16]=p.minimum_voices;
    w[17]=t.audio_pcm_underrun_count;w[18]=t.audio_pcm_submitted_blocks;w[19]=t.current_room;w[20]=unsigned(context.active_runtime);w[21]=context.active_scene;
    w[22]=p.seq;w[23]=p.initial_ie;w[24]=*reinterpret_cast<volatile uint16_t*>(0x04000200);w[25]=p.accepted-q.send_count;
    w[30]=p.completed;w[31]=p.closed;w[32]=QA_PLAYERS;w[33]=p.raw;w[34]=p.phase;w[35]=p.mask;w[36]=p.seq%QA_PLAYERS;
    w[37]=state[0];w[38]=state[1];w[39]=p.simulation;
}
}
