#pragma once
#include "gbs/racing.hpp"

namespace gbs {
// Zero denotes an absent or malformed result. The canonical format is MM:SS.cc.
inline uint32_t racing_time_centiseconds(const char* text) {
    if (!text) return 0;
    for (int i=0;i<8;++i) {
        if (i==2 || i==5) { if(text[i]!=(i==2?':':'.')) return 0; }
        else if(text[i]<'0' || text[i]>'9') return 0;
    }
    if(text[8]!='\0' || text[3]>'5') return 0;
    return ((text[0]-'0')*10u+(text[1]-'0'))*6000u+
        ((text[3]-'0')*10u+(text[4]-'0'))*100u+(text[6]-'0')*10u+(text[7]-'0');
}

inline void racing_write_text(EventState& events, int index, const char* text) {
    if(!is_valid_text_variable_index(index)) return;
    size_t i=0;
    for(;i<text_variable_max_length && text[i];++i) events.text_variables[index][i]=text[i];
    events.text_variables[index][i]='\0';
}

inline void racing_format_time(uint32_t frames, char (&text)[9]) {
    // 64-bit conversion avoids overflowing a long-running session.
    uint32_t centis=static_cast<uint32_t>((static_cast<uint64_t>(frames)*100u)/60u);
    if(centis>599999u) centis=599999u;
    text[0]='0'+centis/60000u; text[1]='0'+centis/6000u%10u;text[2]=':';
    text[3]='0'+centis/1000u%6u; text[4]='0'+centis/100u%10u;text[5]='.';
    text[6]='0'+centis/10u%10u;text[7]='0'+centis%10u;text[8]='\0';
}

inline void racing_boost_hud_text(const RacingRuntimeState& state,bool enabled,char (&text)[9]) {
    const char* message=!enabled?"L --":state.boost_frames>0?"L ATIVO":nullptr;
    if(message) {size_t i=0;for(;message[i]&&i<8;++i)text[i]=message[i];text[i]='\0';return;}
    text[0]='L';text[1]=' ';text[2]=static_cast<char>('0'+state.boost_charges);text[3]='/';text[4]='3';text[5]='\0';
}

inline bool racing_challenge_boost_enabled(const RacingRoomData& room,const EventState& events) {
    const int index=room.challenge.boost_variable_index;
    return is_valid_event_variable(index) && events.variables[index]>0;
}

inline void initialize_racing_challenge(RacingRuntimeState& state,const RacingRoomData& room,const EventState& events) {
    if(racing_challenge_boost_enabled(room,events)) state.boost_charges=1;
}

inline void update_racing_challenge(const RacingRuntimeState& before,RacingRuntimeState& state,
    const RacingRoomData& room,const EventState& events) {
    if(!racing_challenge_boost_enabled(room,events)) return;
    if(state.checkpoint_count>before.checkpoint_count) {
        const unsigned charges=state.boost_charges+state.checkpoint_count-before.checkpoint_count;
        state.boost_charges=static_cast<uint8_t>(charges>3?3:charges);
    }
}

inline bool record_racing_challenge(const RacingRuntimeState& state,const RacingRoomData& room,
    EventState& events,uint8_t locale) {
    events.racing_result=state.race_result;
    const auto& challenge=room.challenge;
    char time[9] {};racing_format_time(state.elapsed_frames,time);
    racing_write_text(events,challenge.result_time_text_index,time);
    const unsigned position=racing_position_for_hud(state,room);
    const unsigned count=room.actor_count+1;
    char placing[8] {static_cast<char>('0'+(position>9?9:position)),'/',static_cast<char>('0'+(count>9?9:count)),0};
    racing_write_text(events,challenge.result_position_text_index,placing);
    const bool completed=racing_result(state)==RacingRaceResult::Victory;
    const uint32_t centis=racing_time_centiseconds(time);
    const int medal=completed?(position==1 && centis<=challenge.gold_seconds*100u?0:
        position<=2 && centis<=challenge.silver_seconds*100u?1:2):3;
    const char* labels[3][4] {{"OURO","PRATA","BRONZE","TREINO"},{"GOLD","SILVER","BRONZE","PRACTICE"},{"ORO","PLATA","BRONCE","PRACTICA"}};
    racing_write_text(events,challenge.result_rating_text_index,labels[locale>=1 && locale<=3?locale-1:0][medal]);
    bool improved=false;
    if(is_valid_text_variable_index(challenge.best_time_text_index)) {
        auto* best=events.text_variables[challenge.best_time_text_index];
        const uint32_t previous=racing_time_centiseconds(best);
        if(completed && centis>0 && (previous==0 || centis<previous)) {
            racing_write_text(events,challenge.best_time_text_index,time);improved=true;
        }
        racing_write_text(events,challenge.result_best_text_index,best[0]?best:"--:--.--");
    }
    return improved;
}
} // namespace gbs
