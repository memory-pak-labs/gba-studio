#pragma once
#include <stdint.h>
typedef struct { uint32_t words[4]; } GbsOamOccupancy;
static inline __attribute__((always_inline)) void gbs_oam_occupancy_set(GbsOamOccupancy* state, unsigned index, int enabled) {
    const uint32_t bit = 1u << (index & 31u);
    if (enabled) state->words[index >> 5] |= bit;
    else state->words[index >> 5] &= ~bit;
}
static inline void gbs_oam_occupancy_clear(GbsOamOccupancy* state, unsigned first, unsigned count) {
    const unsigned last = first + count;
    for (unsigned word = 0; word < 4; ++word) {
        const unsigned base = word * 32;
        if (first >= base + 32 || last <= base) continue;
        const unsigned lo = first > base ? first - base : 0;
        const unsigned hi = last < base + 32 ? last - base : 32;
        state->words[word] &= ~((0xffffffffu << lo) & (0xffffffffu >> (32u - hi)));
    }
}
static inline unsigned gbs_oam_occupancy_count(const GbsOamOccupancy* state) {
    return __builtin_popcount(state->words[0]) + __builtin_popcount(state->words[1]) +
        __builtin_popcount(state->words[2]) + __builtin_popcount(state->words[3]);
}
static inline __attribute__((always_inline)) int gbs_oam_entry_enabled(uint16_t a) {
    return (a & 0xc000u) != 0xc000u && ((a & 0x0100u) || !(a & 0x0200u));
}

/* Enabled OAM entries, including affine double-size and off-screen objects.
 * This is hardware occupancy, not the number of pixels/sprites on a scanline. */
static inline __attribute__((always_inline)) uint32_t gbs_count_enabled_oam(const volatile uint16_t* oam, int objects_enabled) {
    if (!objects_enabled) return 0;
    uint32_t count = 0;
    for (unsigned i = 0; i < 128; ++i) {
        const uint16_t a = oam[i * 4];
        if (gbs_oam_entry_enabled(a)) ++count;
    }
    return count;
}
