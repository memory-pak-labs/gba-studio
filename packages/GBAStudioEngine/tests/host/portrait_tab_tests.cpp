#include <cassert>
#include <cstring>
#include "gbs/portrait_tab.h"
#include "gbs_hw.h"

namespace {
uint8_t tiles[384 * 32];
int uploads, hidden, sprites;
unsigned pixel(int x, int y) {
    x -= 8; y -= 56;
    const int part=x/64;
    const int tile=y<64 ? part*64+y/8*8+x%64/8 : 256+part*32+(y-64)/8*8+x%64/8;
    return (tiles[tile*32+y%8*4+x%8/2] >> ((x&1)*4)) & 15;
}
}
extern "C" {
void gbs_hw_load_obj_tiles(const uint8_t* data, uint32_t start, uint32_t count) {
    assert((start == 512 && count == 384) || (start==768 && count==128));
    std::memcpy(tiles+(start-512)*32,data,count*32); ++uploads;
}
void gbs_hw_load_obj_palette(const uint16_t*, uint32_t start, uint32_t count) { assert(start==240 && count==16); }
void gbs_hw_hide_sprites(int start, int count) { assert(start==114 && count==8); ++hidden; }
void gbs_hw_set_sprite(int index, int, int, uint16_t tile, uint16_t palette, int, int, int visible, uint16_t priority, uint16_t, int, uint16_t shape, uint16_t size) {
    assert(index>=114 && index<122 && tile>=512 && tile<896);
    assert(palette==15 && visible && priority==1 && size==3);
    assert(shape==(index<118?0:1)); ++sprites;
}
void gbs_hw_set_sprite_color_depth(int, int eight) { assert(!eight); }
}
int main() {
    GbsPortraitTabWorkspace memory {};
    gbs_portrait_tab_set_workspace(&memory,sizeof(memory));
    gbs_portrait_tab_draw("Nara","Restauramos os sinais da\ncosta. Como atravessamos a\ntempestade?",1,1,0,nullptr,nullptr);
    assert(uploads==1 && sprites==8 && hidden==0);
    assert(pixel(8,56)==0 && pixel(11,56)==1 && pixel(12,60)==4);
    assert(pixel(26,128)==4 && pixel(16,148)==4);
    assert(pixel(100,90)==0 && pixel(72,99)==5);
    // Portrait, speaker and text body each retain a complete closed border.
    assert(pixel(24,111)==1 && pixel(24,110)==2);
    assert(pixel(63,104)==1 && pixel(64,104)==1);
    assert(pixel(80,96)==1 && pixel(80,111)==1);
    assert(pixel(24,112)==1 && pixel(80,112)==1);
    gbs_portrait_tab_draw("Guardiã","Qual será o nosso pacto?\n! Proteger a costa\n- Explorar novas rotas",1,1,1,nullptr,nullptr);
    assert(uploads==2 && pixel(12,60)==0 && pixel(180,60)==4);
    assert(pixel(200,111)==1 && pixel(200,110)==2);
    assert(pixel(175,104)==1 && pixel(176,104)==1);
    assert(pixel(152,96)==1 && pixel(152,111)==1);
    assert(pixel(200,112)==1 && pixel(152,112)==1);
    assert(pixel(26,128)==8 && pixel(26,136)==4);
    gbs_portrait_tab_draw("Guardiã","Qual será o nosso pacto?\n- Proteger a costa\n! Explorar novas rotas",1,1,1,nullptr,nullptr);
    assert(uploads==3 && pixel(26,128)==4 && pixel(26,136)==8);
    gbs_portrait_tab_draw("Guardiã","Qual será o nosso pacto?\n- Proteger a costa\n! Explorar novas rotas",1,1,1,nullptr,nullptr);
    assert(uploads==3);
    gbs_portrait_tab_draw(nullptr,nullptr,0,0,0,nullptr,nullptr);
    gbs_portrait_tab_draw(nullptr,nullptr,0,0,0,nullptr,nullptr);
    assert(hidden==1);
    gbs_portrait_tab_draw(nullptr,"Texto sem retrato ou nome",1,0,0,nullptr,nullptr);
    assert(pixel(12,60)==0 && pixel(72,100)==0 && pixel(16,148)==4);
}
