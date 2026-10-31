#pragma once
#include "gbs/text.h"
namespace gbs {
constexpr int menu_header_tile_bytes=31*32;
// An independent opaque glyph strip avoids changing the shared transparent HUD font.
inline void rasterize_menu_header(uint8_t* tiles,const char* text,int width,const uint8_t* font_tiles=nullptr) {
    if(width<1 || width>30)return;
    for(int i=0;i<32;++i)tiles[i]=0; // Tile zero remains transparent on BG0.
    if(!text)text="";
    const size_t count=gbs_text_codepoint_count(text),length=count>static_cast<size_t>(width)?width:count;
    const int padding=(width-static_cast<int>(length))/2;
    const char* cursor=text;
    for(int column=0;column<width;++column) {
        const uint32_t codepoint=column>=padding&&column<padding+static_cast<int>(length)?gbs_text_next_codepoint(&cursor):' ';
        const unsigned glyph=gbs_text_glyph_index(codepoint);
        for(int y=0;y<8;++y)for(int x=0;x<8;x+=2) {
            uint8_t colors[2] {};
            for(int pixel=0;pixel<2;++pixel) {
                const bool ink=font_tiles?((font_tiles[glyph*32+y*4+(x+pixel)/2]>>(((x+pixel)&1)*4))&15)!=0:(gbs_font_rows[glyph][y]&(0x80>>(x+pixel)))!=0;
                colors[pixel]=ink?7:6;
            }
            tiles[(column+1)*32+y*4+x/2]=static_cast<uint8_t>(colors[0]|(colors[1]<<4));
        }
    }
}
} // namespace gbs
