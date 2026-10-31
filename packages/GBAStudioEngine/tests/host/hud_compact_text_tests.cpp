#include <cassert>
#include <cstring>
#include "gbs/hud_compact_text.h"
static void reference(const uint8_t* glyphs,unsigned count,unsigned advance,uint8_t* output) {
    std::memset(output,0,128); if(advance<6||advance>8)return;
    if(count>32/advance)count=32/advance;
    for(unsigned g=0;g<count;++g)for(unsigned y=0;y<8;++y)for(unsigned x=0;x<8;++x) {
        const unsigned dx=g*advance+x;
        if(dx<32 && ((glyphs[g*32+y*4+x/2]>>((x&1)*4))&15))
            output[(dx/8)*32+y*4+(dx%8)/2]|=4u<<((dx&1)*4);
    }
}
int main() {
    uint32_t random=1234;
    for(unsigned n=0;n<600;++n) {
        uint8_t glyphs[5*32],expected[128],actual[128];
        for(auto& byte:glyphs){random=random*1664525u+1013904223u;byte=static_cast<uint8_t>(random>>24);}
        for(unsigned advance=5;advance<=9;++advance)for(unsigned count=0;count<=7;++count) {
            reference(glyphs,count,advance,expected);
            gbs_compose_spaced_hud_text(glyphs,count,advance,actual);
            assert(std::memcmp(expected,actual,128)==0);
        }
    }

    uint8_t glyphs[3][32] {}; uint8_t output[128];
    // Glyphs have an independent 5x7 footprint, six pixels between origins.
    for (unsigned g=0; g<3; ++g) for (unsigned y=0; y<7; ++y)
        for (unsigned x=0; x<5; ++x) glyphs[g][y*4+x/2] |= (g+1) << ((x&1)*4);
    gbs_compose_compact_hud_text(&glyphs[0][0],3,output);
    for (unsigned y=0; y<8; ++y) for (unsigned x=0; x<32; ++x) {
        const unsigned offset=(x/8)*32+y*4+(x%8)/2;
        const unsigned pixel=(output[offset]>>((x&1)*4))&15;
        assert(pixel == (y<7 && x<18 && x%6<5 ? 4u : 0u));
    }
    // Seven-pixel advance preserves all six columns of the approved Porto font.
    uint8_t wide[4][32] {};
    for(unsigned g=0;g<4;++g) for(unsigned y=1;y<7;++y) for(unsigned x=1;x<=6;++x)
        wide[g][y*4+x/2] |= 4u<<((x&1)*4);
    gbs_compose_spaced_hud_text(&wide[0][0],4,7,output);
    for(unsigned y=0;y<8;++y)for(unsigned x=0;x<32;++x){
        unsigned off=(x/8)*32+y*4+(x%8)/2;
        assert(((output[off]>>((x&1)*4))&15)==(y>=1&&y<7&&x<28&&x%7>=1&&x%7<=6?4u:0u));
    }
    gbs_compose_compact_hud_text(&glyphs[0][0],0,output);
    for (auto pixel:output) assert(pixel==0);
}
