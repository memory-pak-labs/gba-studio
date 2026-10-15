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
