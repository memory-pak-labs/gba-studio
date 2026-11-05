#include <cassert>
#include "gbs/menu_header.hpp"
int main(){
 uint8_t tiles[gbs::menu_header_tile_bytes] {};
 gbs::rasterize_menu_header(tiles,"PROVAS",9);
 for(int i=0;i<32;++i)assert(tiles[i]==0);
 for(int i=32;i<64;++i)assert(tiles[i]==0x66);
 bool ink=false;for(int i=64;i<320;++i){assert((tiles[i]&15)==6||(tiles[i]&15)==7);assert((tiles[i]>>4)==6||(tiles[i]>>4)==7);ink|=(tiles[i]&15)==7||(tiles[i]>>4)==7;}assert(ink);
 // Width is in cells, including accented glyphs rather than UTF-8 bytes.
 gbs::rasterize_menu_header(tiles,"MARÉ",6);assert(tiles[32]==0x66);
}
