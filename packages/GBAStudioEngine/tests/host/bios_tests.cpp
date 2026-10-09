#include <cassert>
#include <stdint.h>
#include "gbs/bios.hpp"
#include "gbs/math.hpp"

namespace {

void test_division_and_sqrt() {
    int32_t quotient = 0;
    int32_t remainder = 0;
    assert(gbs::bios_div(-1234, 10, quotient, remainder));
    assert(quotient == -123);
    assert(remainder == -4);
    assert(!gbs::bios_div(1, 0, quotient, remainder));
    assert(gbs::bios_sqrt(0) == 0);
    assert(gbs::bios_sqrt(81) == 9);
    assert(gbs::bios_sqrt(2) == 1);
}

void test_additional_tonc_bios_wrappers() {
    int32_t quotient = 0;
    int32_t remainder = 0;
    assert(gbs::bios_div_arm(-1234, 10, quotient, remainder));
    assert(quotient == -123);
    assert(remainder == -4);
    assert(!gbs::bios_div_arm(1, 0, quotient, remainder));

    // These calls are intentionally no-ops on the host so contract tests do
    // not block or touch host audio state. The ARM build maps them to BIOS.
    gbs::bios_intr_wait(false, 1u << 0);
    gbs::bios_sound_bias_change(0x0200);
    assert(gbs::bios_checksum() == 0);
}

void test_additional_math_and_affine_wrappers() {
    assert(gbs::bios_arc_tan(0) == 0);
    assert(gbs::bios_arc_tan2(1, 0) == 0);
    assert(gbs::bios_arc_tan2(0, 1) > 0x3F00);

    gbs::BiosAffineSource source { 0x0100, 0x0200, gbs::angle_quarter_turn };
    gbs::BiosAffineDestination destination {};
    assert(gbs::bios_obj_affine_set(&source, &destination, 1));
    assert(destination.pa == 0);
    assert(destination.pb < -250 && destination.pb > -270);
    assert(destination.pc > 500 && destination.pc < 525);
    assert(destination.pd == 0);

    gbs::BiosBgAffineSource background_source {
        32 * 256,
        16 * 256,
        120,
        80,
        0x0100,
        0x0100,
        0
    };
    gbs::BiosBgAffineDestination background_destination {};
    assert(gbs::bios_bg_affine_set(&background_source, &background_destination, 1));
    assert(background_destination.pa == 256);
    assert(background_destination.pd == 256);
    assert(background_destination.reference_x_8 == (32 - 120) * 256);
    assert(background_destination.reference_y_8 == (16 - 80) * 256);
}

void test_cpu_copy_and_fill() {
    alignas(4) uint32_t source[8] = { 1, 2, 3, 4, 5, 6, 7, 8 };
    alignas(4) uint32_t destination[8] = {};
    assert(gbs::bios_cpu_fast_set(source, destination, 8));
    for (size_t index = 0; index < 8; ++index) {
        assert(destination[index] == source[index]);
    }

    const uint32_t fill = 0xA5A5A5A5u;
    assert(gbs::bios_cpu_fast_set(&fill, destination, 8, gbs::BiosCopyMode::Fill));
    for (uint32_t value : destination) {
        assert(value == fill);
    }

    uint16_t halfword_source[3] = { 7, 8, 9 };
    uint16_t halfword_destination[3] = {};
    assert(gbs::bios_cpu_set(
        halfword_source,
        halfword_destination,
        3,
        gbs::BiosCopyUnit::HalfWord
    ));
    assert(halfword_destination[0] == 7);
    assert(halfword_destination[2] == 9);
}

void test_lz77_wrapper_validates_header_and_decodes() {
    alignas(4) const uint8_t compressed[] = {
        0x10, 0x05, 0x00, 0x00,
        0x00,
        'G', 'B', 'S', '!', '!',
    };
    uint8_t decoded[5] = {};
    assert(gbs::bios_lz77_uncomp_wram(compressed, sizeof(compressed), decoded, sizeof(decoded)));
    assert(decoded[0] == 'G');
    assert(decoded[4] == '!');

    uint8_t too_small[4] = {};
    assert(!gbs::bios_lz77_uncomp_wram(compressed, sizeof(compressed), too_small, sizeof(too_small)));
}

void test_bit_unpack_wrapper() {
    alignas(4) uint8_t source[] = { 0xB1 };
    alignas(4) uint32_t destination[1] = {};
    const gbs::BiosBitUnpackInfo info { 1, 1, 4, 1 };
    assert(gbs::bios_bit_unpack(source, info, destination, sizeof(destination)));
    assert(destination[0] == 0x20220002u);
}

void test_huffman_wrapper() {
    alignas(4) const uint8_t compressed[] = {
        0x20, 0x04, 0x00, 0x00,
        0x01,
        0xC0, 'A', 'B',
        0x00, 0x00, 0x00, 0x50,
    };
    alignas(4) uint8_t destination[4] = {};
    assert(gbs::bios_huff_uncomp(compressed, sizeof(compressed), destination, sizeof(destination)));
    assert(destination[0] == 'A');
    assert(destination[1] == 'B');
    assert(destination[2] == 'A');
    assert(destination[3] == 'B');
}

void test_run_length_wrapper() {
    alignas(4) const uint8_t compressed[] = {
        0x30, 0x06, 0x00, 0x00,
        0x83, 0x41,
    };
    alignas(2) uint8_t destination[8] = {};
    assert(gbs::bios_rl_uncomp_wram(compressed, sizeof(compressed), destination, sizeof(destination)));
    for (size_t index = 0; index < 6; ++index) assert(destination[index] == 0x41);
    assert(destination[6] == 0);
    assert(gbs::bios_rl_uncomp_vram(compressed, sizeof(compressed), destination, sizeof(destination)));
}

void test_difference_wrappers() {
    alignas(4) const uint8_t diff8[] = {
        0x81, 0x04, 0x00, 0x00,
        10, 5, 3, 2,
    };
    uint8_t diff8_destination[4] = {};
    assert(gbs::bios_diff8_uncomp_wram(diff8, sizeof(diff8), diff8_destination, sizeof(diff8_destination)));
    assert(diff8_destination[0] == 10);
    assert(diff8_destination[1] == 15);
    assert(diff8_destination[2] == 18);
    assert(diff8_destination[3] == 20);

    alignas(2) uint8_t diff8_vram_destination[4] = {};
    assert(gbs::bios_diff8_uncomp_vram(diff8, sizeof(diff8), diff8_vram_destination, sizeof(diff8_vram_destination)));
    assert(diff8_vram_destination[0] == 10);
    assert(diff8_vram_destination[3] == 20);

    alignas(4) const uint8_t diff16[] = {
        0x82, 0x06, 0x00, 0x00,
        100, 0, 5, 0, 0, 0,
    };
    uint16_t diff16_destination[3] = {};
    assert(gbs::bios_diff16_uncomp(diff16, sizeof(diff16), diff16_destination, sizeof(diff16_destination)));
    assert(diff16_destination[0] == 100);
    assert(diff16_destination[1] == 105);
    assert(diff16_destination[2] == 105);
}

} // namespace

int main() {
    test_division_and_sqrt();
    test_additional_tonc_bios_wrappers();
    test_additional_math_and_affine_wrappers();
    test_cpu_copy_and_fill();
    test_lz77_wrapper_validates_header_and_decodes();
    test_bit_unpack_wrapper();
    test_huffman_wrapper();
    test_run_length_wrapper();
    test_difference_wrappers();
    return 0;
}
