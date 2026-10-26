#pragma once
#include <stdint.h>

/* Compose at most five 5x7 glyphs at six-pixel advances into one 32x8 OBJ.
 * Input glyphs use the existing 8x8/4bpp font contract. */
static inline void gbs_compose_compact_hud_text(const uint8_t* glyphs, unsigned count, uint8_t* output) {
    for (unsigned i=0; i<128; ++i) output[i]=0;
    if (count>5) count=5;
    for (unsigned g=0; g<count; ++g) for (unsigned y=0; y<8; ++y) for (unsigned x=0; x<5; ++x) {
        const unsigned pixel=(glyphs[g*32+y*4+x/2]>>((x&1)*4))&15;
        if (!pixel) continue;
        const unsigned dx=g*6+x;
        const unsigned offset=(dx/8)*32+y*4+(dx%8)/2;
        output[offset] |= 4u<<((dx&1)*4);
    }
}

/* Preserve the original eight-pixel glyph cell at seven-pixel advances.
 * The shared padding column may overlap; transparent pixels never erase ink. */
#if defined(__arm__) || defined(__thumb__)
__attribute__((section(".iwram"), target("arm"), optimize("O2"), noinline, long_call))
static void gbs_compose_spaced_hud_text
#else
static inline void gbs_compose_spaced_hud_text
#endif
(const uint8_t* glyphs, unsigned count, unsigned advance, uint8_t* output) {
    for(unsigned i=0;i<128;++i) output[i]=0;
    if(advance<6 || advance>8) return;
    if(count>32/advance) count=32/advance;
    for(unsigned g=0;g<count;++g) for(unsigned y=0;y<8;++y) {
        const uint8_t* source=glyphs+g*32+y*4;
        uint32_t row=(uint32_t)source[0]|((uint32_t)source[1]<<8)|((uint32_t)source[2]<<16)|((uint32_t)source[3]<<24);
        // Reduce each nonzero palette nibble to ink index 4 in parallel.
        row=((row|(row>>1)|(row>>2)|(row>>3))&0x11111111u)<<2;
        const unsigned dx=g*advance, shift=(dx%8)*4;
        const unsigned offset=(dx/8)*32+y*4;
        const uint32_t low=row<<shift;
        for(unsigned b=0;b<4;++b)output[offset+b]|=(uint8_t)(low>>(b*8));
        if(shift && dx/8<3) {
            const uint32_t high=row>>(32-shift);
            for(unsigned b=0;b<4;++b)output[offset+32+b]|=(uint8_t)(high>>(b*8));
        }
    }
}
