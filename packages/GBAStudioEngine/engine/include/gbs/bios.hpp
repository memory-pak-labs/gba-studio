#pragma once

#include <stddef.h>
#include <stdint.h>

namespace gbs {

enum class BiosCopyMode : uint8_t {
    Copy = 0,
    Fill = 1
};

enum class BiosCopyUnit : uint8_t {
    HalfWord = 0,
    Word = 1
};

struct BiosBitUnpackInfo {
    uint16_t source_byte_length;
    uint8_t source_width;
    uint8_t destination_width;
    uint32_t data_offset;
};

struct alignas(4) BiosAffineSource {
    int16_t scale_x;
    int16_t scale_y;
    uint16_t angle;
};

struct alignas(4) BiosAffineDestination {
    int16_t pa;
    int16_t pb;
    int16_t pc;
    int16_t pd;
};

struct alignas(4) BiosBgAffineSource {
    int32_t texture_x_8;
    int32_t texture_y_8;
    int16_t screen_x;
    int16_t screen_y;
    int16_t scale_x;
    int16_t scale_y;
    uint16_t angle;
};

struct alignas(4) BiosBgAffineDestination {
    int16_t pa;
    int16_t pb;
    int16_t pc;
    int16_t pd;
    int32_t reference_x_8;
    int32_t reference_y_8;
};

bool bios_div(int32_t number, int32_t denominator, int32_t& quotient, int32_t& remainder);
bool bios_div_arm(int32_t number, int32_t denominator, int32_t& quotient, int32_t& remainder);
uint16_t bios_sqrt(uint32_t value);
int16_t bios_arc_tan(int16_t dydx);
int16_t bios_arc_tan2(int16_t x, int16_t y);
void bios_halt();
void bios_stop();
void bios_intr_wait(bool discard_old, uint16_t interrupt_mask);
void bios_vblank_intr_wait();
uint32_t bios_checksum();
void bios_sound_bias_change(uint16_t bias);
bool bios_bg_affine_set(
    const BiosBgAffineSource* source,
    BiosBgAffineDestination* destination,
    size_t count
);
bool bios_obj_affine_set(
    const BiosAffineSource* source,
    void* destination,
    size_t count,
    size_t destination_offset_words = 2
);
bool bios_cpu_fast_set(
    const void* source,
    void* destination,
    size_t word_count,
    BiosCopyMode mode = BiosCopyMode::Copy
);
bool bios_cpu_set(
    const void* source,
    void* destination,
    size_t count,
    BiosCopyUnit unit = BiosCopyUnit::HalfWord,
    BiosCopyMode mode = BiosCopyMode::Copy
);
bool bios_lz77_uncomp_wram(
    const void* compressed,
    size_t compressed_size,
    void* destination,
    size_t destination_size
);
bool bios_lz77_uncomp_vram(
    const void* compressed,
    size_t compressed_size,
    void* destination,
    size_t destination_size
);
bool bios_bit_unpack(
    const void* source,
    const BiosBitUnpackInfo& info,
    void* destination,
    size_t destination_size
);
bool bios_huff_uncomp(
    const void* compressed,
    size_t compressed_size,
    void* destination,
    size_t destination_size
);
bool bios_rl_uncomp_wram(
    const void* compressed,
    size_t compressed_size,
    void* destination,
    size_t destination_size
);
bool bios_rl_uncomp_vram(
    const void* compressed,
    size_t compressed_size,
    void* destination,
    size_t destination_size
);
bool bios_diff8_uncomp_wram(
    const void* compressed,
    size_t compressed_size,
    void* destination,
    size_t destination_size
);
bool bios_diff8_uncomp_vram(
    const void* compressed,
    size_t compressed_size,
    void* destination,
    size_t destination_size
);
bool bios_diff16_uncomp(
    const void* compressed,
    size_t compressed_size,
    void* destination,
    size_t destination_size
);

} // namespace gbs
