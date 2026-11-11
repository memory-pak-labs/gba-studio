// QA only: attached to the generated mixed project's existing on_frame hook.
// The production adapter, rendering, mixer and SIO update remain unchanged.
#include "gbs/audio.hpp"
#include "gbs/debug.hpp"
#include "gbs/multiplayer.hpp"
#include "qa-song.hpp"
#include <cstring>

extern "C" { volatile uint32_t scene_link_witness[40] __attribute__((section(".ewram_bss"))) = {}; }
namespace {
struct SceneLinkProbe {
    uint32_t enqueued_at[64] {};
    uint32_t received[4] {};
    uint32_t sent=0, acked=0, errors=0, full=0, first=0, last=0, ages=0, max_age=0, done=0;
    uint32_t initial_ie=0, minimum_voices=0;
    bool initialized=false, audio_started=false, closed=false;
};
SceneLinkProbe scene_link_probe __attribute__((section(".ewram_bss")));
uint16_t scene_link_value(unsigned n) {
    const uint16_t edge[]={0,65535,32768,32767,0x1234};
    return n<5 ? edge[n] : uint16_t(n*997u);
}
void scene_link_frame(const gbs::RuntimeFrameContext& context) {
    auto& p=scene_link_probe;
    auto& q=gbs::multiplayer_connection();
    const auto& telemetry=gbs::runtime_telemetry_block();
    if(!p.initialized) {
        p.initialized=true;
        p.minimum_voices=255;
        p.initial_ie=*reinterpret_cast<volatile uint16_t*>(0x04000200);
        if(QA_PLAYERS) {
            gbs::MultiplayerConfig config;config.players=QA_PLAYERS;
            config.timeout_frames=30;
            if(!gbs::multiplayer_queue_open(q,config))p.errors|=8;
        }
    }
    if(context.active_scene<0 ||
        std::strcmp(gbastudio_mixed_project::runtime_registry.scenes[context.active_scene].name,QA_SCENE))p.errors|=16;
    // Scene entry scripts first restore the player's audio preferences/fades.
    // Start the controlled load afterwards; do not race or remove those scripts.
    if(!p.audio_started && context.frame>=120) {
        gbs::stop_music();
        gbs::stop_tracker_music();
        gbs::stop_pcm_music();
        if(!gbs::play_tracker_music(qa_stress_song_asset))p.errors|=4;
        p.audio_started=true;
    }
    if(context.frame>=240) {
        if(telemetry.audio_active_voice_count<p.minimum_voices)p.minimum_voices=telemetry.audio_active_voice_count;
        if(QA_PLAYERS && q.state==gbs::MultiplayerConnectionState::Connected)while(p.sent<64) {
            if(!gbs::multiplayer_queue_send(q,scene_link_value(p.sent))){++p.full;break;}
            if(!p.sent)p.first=context.frame;
            p.enqueued_at[p.sent++]=context.frame;
        }
    }
    gbs::MultiplayerMessage message;
    while(gbs::multiplayer_queue_receive(q,message)) {
        const unsigned id=message.player_id;
        if(id>=QA_PLAYERS || id==q.player_id)p.errors|=1;
        else {
            if(p.received[id]>=64 || message.value!=scene_link_value(p.received[id]))p.errors|=2;
            ++p.received[id];
        }
    }
    const unsigned completed=p.sent-q.send_count;
    while(p.acked<completed) {
        const unsigned age=context.frame-p.enqueued_at[p.acked++];p.ages+=age;
        if(age>p.max_age)p.max_age=age;
        p.last=context.frame;
    }
    const unsigned received=p.received[0]+p.received[1]+p.received[2]+p.received[3];
    if(!p.done && (!QA_PLAYERS || (p.acked==64 && received==(QA_PLAYERS-1)*64)))p.done=context.frame;
    if(gbs::poll_input().is_held(gbs::ButtonL) && !p.closed) {
        gbs::multiplayer_queue_close(q);p.closed=true;
    }
    auto& w=scene_link_witness;
    w[0]=0x53434C4B;w[1]=context.frame;w[2]=p.errors;w[3]=p.sent;w[4]=p.full;
    w[5]=received;w[6]=q.send_count;w[7]=q.recoveries;w[8]=q.player_id;w[9]=unsigned(q.state);
    for(unsigned id=0;id<4;++id)w[10+id]=p.received[id];
    w[14]=q.corrupt_packets;w[15]=telemetry.audio_active_voice_count;w[16]=p.minimum_voices;
    w[17]=telemetry.audio_pcm_underrun_count;w[18]=telemetry.audio_pcm_submitted_blocks;
    w[19]=telemetry.current_room;w[20]=unsigned(context.active_runtime);w[21]=context.active_scene;
    w[23]=p.initial_ie;w[24]=*reinterpret_cast<volatile uint16_t*>(0x04000200);
    w[25]=p.acked;w[26]=p.first;w[27]=p.last;w[28]=p.ages;w[29]=p.max_age;
    w[30]=p.done;w[31]=p.closed;w[32]=QA_PLAYERS;
}
}
