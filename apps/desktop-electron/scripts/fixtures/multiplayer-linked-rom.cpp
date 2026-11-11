// Authored SDK events; no fake transport, injected receipts or memory patches.
#include "gbs/engine.hpp"
#ifndef QA_PLAYERS
#define QA_PLAYERS 2
#endif
#ifndef QA_BAUD
#define QA_BAUD 3
#endif
extern "C" { volatile uint32_t link_witness[32] = {}; }
static gbs::EventState events;
static uint16_t value(unsigned n) {
    const uint16_t edge[] = {0,65535,32768,32767,0x1234,0,65535};
    return n < 7 ? edge[n] : uint16_t(n*997u);
}
extern "C" int gbs_main() {
    gbs::init(); gbs::init_event_state(events);
    const auto initial_ie = *reinterpret_cast<volatile uint16_t*>(0x04000200);
    auto& q = gbs::multiplayer_connection();
    const gbs::EventCommand open{gbs::EventOp::MultiplayerQueueOpen,QA_PLAYERS,QA_BAUD,30};
    gbs::run_event_script(events,&open,1);
    unsigned sent=0,rx[4]={},errors=0,full=0,acked=0,sum=0,maximum=0;
    unsigned enqueued[64]={},first=0,last=0,done=0,recoveries=0,corrupt=0,local=0;
    for (unsigned frame=0;;++frame) {
        if (q.state==gbs::MultiplayerConnectionState::Connected) while(sent<64) {
            events.variables[0]=value(sent);
            const gbs::EventCommand send{gbs::EventOp::MultiplayerQueueSend,0,1,0};
            gbs::run_event_script(events,&send,1);
            if (!events.variables[1]) {++full;break;}
            if (!sent) first=frame;
            enqueued[sent++]=frame;
        }
        for (;;) {
            const gbs::EventCommand receive{gbs::EventOp::MultiplayerQueueReceive,2,3,4};
            gbs::run_event_script(events,&receive,1);
            if (!events.variables[4]) break;
            const unsigned id=events.variables[3];
            if (id>=QA_PLAYERS||id==q.player_id) errors|=1;
            else {if (rx[id]>=64||events.variables[2]!=value(rx[id])) errors|=2;++rx[id];}
        }
        const unsigned completed=sent-q.send_count;
        while(acked<completed) {
            const unsigned age=frame-enqueued[acked++];sum+=age;
            if(age>maximum)maximum=age;
            last=frame;
        }
        const unsigned received=rx[0]+rx[1]+rx[2]+rx[3];
        if(!done&&acked==64&&received==(QA_PLAYERS-1)*64)done=frame;
        if(gbs::poll_input().is_held(gbs::ButtonL)) {
            const gbs::EventCommand close{gbs::EventOp::MultiplayerQueueClose,0,0,0};
            gbs::run_event_script(events,&close,1);
        }
        if(q.recoveries>recoveries)recoveries=q.recoveries;
        if(q.corrupt_packets>corrupt)corrupt=q.corrupt_packets;
        if(q.state!=gbs::MultiplayerConnectionState::Closed)local=q.player_id;
        link_witness[0]=0x4C494E4B;link_witness[1]=frame;link_witness[2]=errors;
        link_witness[3]=sent;link_witness[4]=full;link_witness[5]=received;
        link_witness[6]=q.send_count;link_witness[7]=recoveries;
        link_witness[8]=local;link_witness[9]=unsigned(q.state);
        for(unsigned id=0;id<4;++id)link_witness[10+id]=rx[id];
        link_witness[14]=corrupt;link_witness[15]=q.sequence;
        link_witness[16]=q.in_flight;link_witness[17]=q.connected_mask;
        link_witness[18]=q.acknowledged_mask;link_witness[19]=q.packet_size;
        link_witness[20]=q.packet_index;link_witness[21]=q.retry_left;
        link_witness[22]=q.waiting;link_witness[23]=q.waiting_frames;
        link_witness[24]=sum;link_witness[25]=maximum;link_witness[26]=acked;
        link_witness[27]=done;link_witness[28]=first;link_witness[29]=last;
        link_witness[30]=initial_ie;
        link_witness[31]=*reinterpret_cast<volatile uint16_t*>(0x04000200);
        gbs::wait_vblank();
    }
}
