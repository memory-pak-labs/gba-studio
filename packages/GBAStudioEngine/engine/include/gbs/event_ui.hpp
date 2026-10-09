#pragma once
#include "gbs/event.hpp"
#include "gbs/render.hpp"
#include "gbs/dialogue.hpp"


namespace gbs {
struct EventTextRenderCache { int x=0, y=0, width=0; };
inline EventTextRenderCache* event_text_render_cache() { static EventTextRenderCache entries[max_event_draw_text_entries]{};return entries; }
inline void clear_event_text() {
    for(size_t i=0;i<max_event_draw_text_entries;++i) {
        EventTextRenderCache& cached=event_text_render_cache()[i];
        if(cached.width>0) draw_text_at(cached.x,cached.y,cached.width,nullptr);
        cached.width=0;
    }
}
inline void draw_event_text(const EventState& state, const DialogueLine* lines, size_t line_count, int camera_x, int camera_y) {
    int oam_offset=0;size_t cache_index=0;
    for(const EventDrawText& entry:state.draw_text) {
        if(entry.line<0 || static_cast<size_t>(entry.line)>=line_count || lines==nullptr) continue;
        const char* text=lines[entry.line].text;
        if(text==nullptr) continue;
        int width=0;for(const unsigned char* p=reinterpret_cast<const unsigned char*>(text);*p;++p) if((*p&0xc0)!=0x80) ++width;
        if(entry.overlay) {
            if(oam_offset+width<=27) draw_text_overlay_slot(entry.x,entry.y,width,text,oam_offset,true);
            oam_offset+=width;
        } else {
            const int x=entry.x-camera_x/8,y=entry.y-camera_y/8;
            draw_text_at(x,y,width,text);
            event_text_render_cache()[cache_index++]={x,y,width};
        }
    }
}
inline void draw_event_clock(const EventState& state) {
    if (!state.clock_hud_enabled) return;
    char display[6]{};
    format_event_clock(state, display);
    // Last five dynamic text OBJ slots, independent from the scene HUD backing.
    draw_text_overlay_slot(24, 0, 5, display, 27, true);
}
}
