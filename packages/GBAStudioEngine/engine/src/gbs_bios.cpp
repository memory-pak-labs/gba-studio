#include "gbs/bios.hpp"
#include "gbs/compression.hpp"
#include "gbs/math.hpp"

#if !defined(__arm__) && !defined(__thumb__)
#include <cmath>
#endif

namespace {

bool is_aligned(const void* pointer, size_t alignment) {
    return pointer != nullptr && (reinterpret_cast<uintptr_t>(pointer) % alignment) == 0;
}

uint32_t read_u32(const uint8_t* bytes) {
    return static_cast<uint32_t>(bytes[0]) |
        (static_cast<uint32_t>(bytes[1]) << 8u) |
        (static_cast<uint32_t>(bytes[2]) << 16u) |
        (static_cast<uint32_t>(bytes[3]) << 24u);
}

uint16_t read_u16(const uint8_t* bytes) {
    return static_cast<uint16_t>(bytes[0]) |
        static_cast<uint16_t>(bytes[1] << 8u);
}

[[maybe_unused]] void write_u32(uint8_t* bytes, uint32_t value) {
    bytes[0] = static_cast<uint8_t>(value);
    bytes[1] = static_cast<uint8_t>(value >> 8u);
    bytes[2] = static_cast<uint8_t>(value >> 16u);
    bytes[3] = static_cast<uint8_t>(value >> 24u);
}

size_t align4(size_t value) {
    return (value + 3u) & ~static_cast<size_t>(3u);
}

bool is_valid_bit_unpack_source_width(uint8_t width) {
    return width == 1 || width == 2 || width == 4 || width == 8;
}

bool is_valid_bit_unpack_destination_width(uint8_t width) {
    return width == 1 || width == 2 || width == 4 || width == 8 || width == 16 || width == 32;
}

[[maybe_unused]] int16_t clamp_affine_raw(gbs::Fixed value) {
    const int32_t raw = value.raw();
    if (raw < -32768) return -32768;
    if (raw > 32767) return 32767;
    return static_cast<int16_t>(raw);
}

[[maybe_unused]] int32_t clamp_affine_reference(int64_t value) {
    if (value < -2147483648ll) return static_cast<int32_t>(-2147483647 - 1);
    if (value > 2147483647ll) return 2147483647;
    return static_cast<int32_t>(value);
}

[[maybe_unused]] gbs::BiosAffineDestination affine_destination(const gbs::BiosAffineSource& source) {
    const gbs::Fixed scale_x = gbs::Fixed::from_raw(source.scale_x);
    const gbs::Fixed scale_y = gbs::Fixed::from_raw(source.scale_y);
    const gbs::Fixed sine = gbs::fixed_sin(source.angle);
    const gbs::Fixed cosine = gbs::fixed_cos(source.angle);
    return gbs::BiosAffineDestination {
        clamp_affine_raw(scale_x * cosine),
        clamp_affine_raw(-(scale_x * sine)),
        clamp_affine_raw(scale_y * sine),
        clamp_affine_raw(scale_y * cosine)
    };
}

[[maybe_unused]] gbs::BiosBgAffineDestination bg_affine_destination(const gbs::BiosBgAffineSource& source) {
    const gbs::BiosAffineDestination matrix = affine_destination(gbs::BiosAffineSource {
        source.scale_x,
        source.scale_y,
        source.angle
    });
    const int64_t reference_x = static_cast<int64_t>(source.texture_x_8) -
        static_cast<int64_t>(matrix.pa) * source.screen_x -
        static_cast<int64_t>(matrix.pb) * source.screen_y;
    const int64_t reference_y = static_cast<int64_t>(source.texture_y_8) -
        static_cast<int64_t>(matrix.pc) * source.screen_x -
        static_cast<int64_t>(matrix.pd) * source.screen_y;
    return gbs::BiosBgAffineDestination {
        matrix.pa,
        matrix.pb,
        matrix.pc,
        matrix.pd,
        clamp_affine_reference(reference_x),
        clamp_affine_reference(reference_y)
    };
}

#if !defined(__arm__) && !defined(__thumb__)
int16_t angle_from_radians(double radians) {
    constexpr double pi = 3.14159265358979323846;
    int32_t units = static_cast<int32_t>(std::lround(radians * (32768.0 / pi)));
    while (units < -32768) units += 65536;
    while (units > 32767) units -= 65536;
    return static_cast<int16_t>(units);
}
#endif

[[maybe_unused]] bool decode_rl_host(
    const uint8_t* source,
    size_t source_size,
    uint8_t* destination,
    size_t decoded_size,
    bool write_halfwords
) {
    size_t source_cursor = 4;
    size_t destination_cursor = 0;
    while (destination_cursor < decoded_size) {
        if (source_cursor >= source_size) return false;
        const uint8_t block_header = source[source_cursor++];
        if ((block_header & 0x80u) != 0) {
            const size_t block_size = static_cast<size_t>(block_header & 0x7Fu) + 3u;
            if (source_cursor >= source_size) return false;
            const uint8_t value = source[source_cursor++];
            const size_t emit_count = block_size < decoded_size - destination_cursor
                ? block_size
                : decoded_size - destination_cursor;
            for (size_t index = 0; index < emit_count; ++index) {
                destination[destination_cursor++] = value;
            }
        } else {
            const size_t block_size = static_cast<size_t>(block_header) + 1u;
            const size_t emit_count = block_size < decoded_size - destination_cursor
                ? block_size
                : decoded_size - destination_cursor;
            if (source_cursor + emit_count > source_size) return false;
            for (size_t index = 0; index < emit_count; ++index) {
                destination[destination_cursor++] = source[source_cursor++];
            }
        }
    }
    if (write_halfwords && (decoded_size % 2u) != 0) return false;
    for (size_t index = decoded_size; index < align4(decoded_size); ++index) {
        destination[index] = 0;
    }
    return true;
}

[[maybe_unused]] bool decode_diff_host(
    const uint8_t* source,
    size_t source_size,
    uint8_t* destination,
    size_t decoded_size,
    uint8_t input_width,
    bool write_halfwords
) {
    if (source_size < 4u + decoded_size || (input_width == 2u && (decoded_size % 2u) != 0)) {
        return false;
    }
    size_t source_cursor = 4;
    size_t destination_cursor = 0;
    uint16_t previous = 0;
    while (destination_cursor < decoded_size) {
        uint16_t delta = 0;
        if (input_width == 1) {
            delta = source[source_cursor++];
        } else {
            delta = read_u16(source + source_cursor);
            source_cursor += 2;
        }
        const uint16_t value = static_cast<uint16_t>(previous + delta);
        if (input_width == 1) {
            destination[destination_cursor++] = static_cast<uint8_t>(value);
        } else {
            destination[destination_cursor++] = static_cast<uint8_t>(value);
            destination[destination_cursor++] = static_cast<uint8_t>(value >> 8u);
        }
        previous = value;
    }
    return !write_halfwords || (decoded_size % 2u) == 0;
}

} // namespace

namespace gbs {

bool bios_div(int32_t number, int32_t denominator, int32_t& quotient, int32_t& remainder) {
    if (denominator == 0) {
        quotient = 0;
        remainder = 0;
        return false;
    }
#if defined(__arm__) || defined(__thumb__)
    register int32_t r0 asm("r0") = number;
    register int32_t r1 asm("r1") = denominator;
    asm volatile("swi 0x06" : "+r"(r0), "+r"(r1) :: "r2", "r3", "memory");
    quotient = r0;
    remainder = r1;
#else
    quotient = number / denominator;
    remainder = number % denominator;
#endif
    return true;
}

bool bios_div_arm(int32_t number, int32_t denominator, int32_t& quotient, int32_t& remainder) {
    if (denominator == 0) {
        quotient = 0;
        remainder = 0;
        return false;
    }
#if defined(__arm__) || defined(__thumb__)
    register int32_t r0 asm("r0") = number;
    register int32_t r1 asm("r1") = denominator;
    asm volatile("swi 0x07" : "+r"(r0), "+r"(r1) :: "r2", "r3", "memory");
    quotient = r0;
    remainder = r1;
#else
    quotient = number / denominator;
    remainder = number % denominator;
#endif
    return true;
}

uint16_t bios_sqrt(uint32_t value) {
#if defined(__arm__) || defined(__thumb__)
    register uint32_t r0 asm("r0") = value;
    asm volatile("swi 0x08" : "+r"(r0) :: "r1", "r2", "r3", "memory");
    return static_cast<uint16_t>(r0);
#else
    uint32_t result = 0;
    uint32_t bit = 1u << 30u;
    while (bit > value) bit >>= 2u;
    while (bit != 0) {
        if (value >= result + bit) {
            value -= result + bit;
            result = (result >> 1u) + bit;
        } else {
            result >>= 1u;
        }
        bit >>= 2u;
    }
    return static_cast<uint16_t>(result > 0xFFFFu ? 0xFFFFu : result);
#endif
}

int16_t bios_arc_tan(int16_t dydx) {
#if defined(__arm__) || defined(__thumb__)
    register int32_t r0 asm("r0") = dydx;
    asm volatile("swi 0x09" : "+r"(r0) :: "r1", "r2", "r3", "memory");
    return static_cast<int16_t>(r0);
#else
    return angle_from_radians(std::atan(static_cast<double>(dydx)));
#endif
}

int16_t bios_arc_tan2(int16_t x, int16_t y) {
#if defined(__arm__) || defined(__thumb__)
    register int32_t r0 asm("r0") = x;
    register int32_t r1 asm("r1") = y;
    asm volatile("swi 0x0A" : "+r"(r0), "+r"(r1) :: "r2", "r3", "memory");
    return static_cast<int16_t>(r0);
#else
    if (x == 0 && y == 0) return 0;
    return angle_from_radians(std::atan2(static_cast<double>(y), static_cast<double>(x)));
#endif
}

void bios_halt() {
#if defined(__arm__) || defined(__thumb__)
    asm volatile("swi 0x02" ::: "r0", "r1", "r2", "r3", "memory");
#endif
}

void bios_stop() {
#if defined(__arm__) || defined(__thumb__)
    asm volatile("swi 0x03" ::: "r0", "r1", "r2", "r3", "memory");
#endif
}

void bios_intr_wait(bool discard_old, uint16_t interrupt_mask) {
#if defined(__arm__) || defined(__thumb__)
    register uint32_t r0 asm("r0") = discard_old ? 1u : 0u;
    register uint32_t r1 asm("r1") = interrupt_mask;
    asm volatile("swi 0x04" : "+r"(r0), "+r"(r1) :: "r2", "r3", "memory");
#else
    (void)discard_old;
    (void)interrupt_mask;
#endif
}

bool bios_bg_affine_set(
    const BiosBgAffineSource* source,
    BiosBgAffineDestination* destination,
    size_t count
) {
    if (!is_aligned(source, 4) || !is_aligned(destination, 4) || count == 0 || count > 0x7FFFFFFFu) {
        return false;
    }
#if defined(__arm__) || defined(__thumb__)
    register const BiosBgAffineSource* r0 asm("r0") = source;
    register BiosBgAffineDestination* r1 asm("r1") = destination;
    register uint32_t r2 asm("r2") = static_cast<uint32_t>(count);
    asm volatile("swi 0x0E" : "+r"(r0), "+r"(r1), "+r"(r2) :: "r3", "memory");
#else
    for (size_t index = 0; index < count; ++index) {
        destination[index] = bg_affine_destination(source[index]);
    }
#endif
    return true;
}

bool bios_obj_affine_set(
    const BiosAffineSource* source,
    void* destination,
    size_t count,
    size_t destination_offset_words
) {
    if (!is_aligned(source, 4) || !is_aligned(destination, 4) || count == 0 || count > 0x7FFFFFFFu ||
        (destination_offset_words != 2 && destination_offset_words != 8)) {
        return false;
    }
#if defined(__arm__) || defined(__thumb__)
    register const BiosAffineSource* r0 asm("r0") = source;
    register void* r1 asm("r1") = destination;
    register uint32_t r2 asm("r2") = static_cast<uint32_t>(count);
    register uint32_t r3 asm("r3") = static_cast<uint32_t>(destination_offset_words);
    asm volatile("swi 0x0F" : "+r"(r0), "+r"(r1), "+r"(r2), "+r"(r3) :: "memory");
#else
    uint8_t* destination_bytes = static_cast<uint8_t*>(destination);
    for (size_t index = 0; index < count; ++index) {
        const BiosAffineDestination matrix = affine_destination(source[index]);
        int16_t* output = reinterpret_cast<int16_t*>(destination_bytes + index * destination_offset_words * 4u);
        output[0] = matrix.pa;
        output[1] = matrix.pb;
        output[2] = matrix.pc;
        output[3] = matrix.pd;
    }
#endif
    return true;
}

void bios_vblank_intr_wait() {
#if defined(__arm__) || defined(__thumb__)
    asm volatile("swi 0x05" ::: "r0", "r1", "r2", "r3", "memory");
#endif
}

uint32_t bios_checksum() {
#if defined(__arm__) || defined(__thumb__)
    register uint32_t r0 asm("r0");
    asm volatile("swi 0x0D" : "=r"(r0) :: "r1", "r2", "r3", "memory");
    return r0;
#else
    // The host has no Nintendo BIOS image to checksum.
    return 0;
#endif
}

void bios_sound_bias_change(uint16_t bias) {
#if defined(__arm__) || defined(__thumb__)
    register uint32_t r0 asm("r0") = bias;
    asm volatile("swi 0x19" : "+r"(r0) :: "r1", "r2", "r3", "memory");
#else
    (void)bias;
#endif
}

bool bios_cpu_fast_set(const void* source, void* destination, size_t word_count, BiosCopyMode mode) {
    if (!is_aligned(source, 4) || !is_aligned(destination, 4) || word_count == 0 ||
        word_count > 0x1FFFFFu || (word_count % 8u) != 0) {
        return false;
    }
#if defined(__arm__) || defined(__thumb__)
    register const void* r0 asm("r0") = source;
    register void* r1 asm("r1") = destination;
    register uint32_t r2 asm("r2") = static_cast<uint32_t>(word_count) |
        (mode == BiosCopyMode::Fill ? (1u << 24u) : 0u);
    asm volatile("swi 0x0C" : "+r"(r0), "+r"(r1), "+r"(r2) :: "r3", "memory");
#else
    const uint32_t* input = static_cast<const uint32_t*>(source);
    uint32_t* output = static_cast<uint32_t*>(destination);
    for (size_t index = 0; index < word_count; ++index) {
        output[index] = mode == BiosCopyMode::Fill ? input[0] : input[index];
    }
#endif
    return true;
}

bool bios_cpu_set(const void* source, void* destination, size_t count, BiosCopyUnit unit, BiosCopyMode mode) {
    const size_t alignment = unit == BiosCopyUnit::Word ? 4u : 2u;
    if (!is_aligned(source, alignment) || !is_aligned(destination, alignment) || count == 0 || count > 0x1FFFFFu) {
        return false;
    }
#if defined(__arm__) || defined(__thumb__)
    register const void* r0 asm("r0") = source;
    register void* r1 asm("r1") = destination;
    register uint32_t r2 asm("r2") = static_cast<uint32_t>(count) |
        (mode == BiosCopyMode::Fill ? (1u << 24u) : 0u) |
        (unit == BiosCopyUnit::Word ? (1u << 26u) : 0u);
    asm volatile("swi 0x0B" : "+r"(r0), "+r"(r1), "+r"(r2) :: "r3", "memory");
#else
    if (unit == BiosCopyUnit::Word) {
        const uint32_t* input = static_cast<const uint32_t*>(source);
        uint32_t* output = static_cast<uint32_t*>(destination);
        for (size_t index = 0; index < count; ++index) {
            output[index] = mode == BiosCopyMode::Fill ? input[0] : input[index];
        }
    } else {
        const uint16_t* input = static_cast<const uint16_t*>(source);
        uint16_t* output = static_cast<uint16_t*>(destination);
        for (size_t index = 0; index < count; ++index) {
            output[index] = mode == BiosCopyMode::Fill ? input[0] : input[index];
        }
    }
#endif
    return true;
}

bool bios_lz77_uncomp_wram(const void* compressed, size_t compressed_size, void* destination, size_t destination_size) {
    if (!is_aligned(compressed, 4) || compressed == nullptr || compressed_size < 4 || destination == nullptr || destination_size == 0) {
        return false;
    }
    const uint8_t* source = static_cast<const uint8_t*>(compressed);
    const uint32_t header = read_u32(source);
    const size_t decoded_size = static_cast<size_t>(header >> 8u);
    if ((header & 0x0Fu) != 0 || ((header >> 4u) & 0x0Fu) != 1 || decoded_size == 0 || decoded_size > destination_size) {
        return false;
    }
#if defined(__arm__) || defined(__thumb__)
    register const void* r0 asm("r0") = compressed;
    register void* r1 asm("r1") = destination;
    asm volatile("swi 0x11" : "+r"(r0), "+r"(r1) :: "r2", "r3", "memory");
#else
    const Lz77Asset asset { source, compressed_size, decoded_size };
    if (!is_valid_lz77_asset(asset)) {
        return false;
    }
    if (!decode_lz77(asset, static_cast<uint8_t*>(destination), destination_size)) {
        return false;
    }
#endif
    return true;
}

bool bios_lz77_uncomp_vram(const void* compressed, size_t compressed_size, void* destination, size_t destination_size) {
    if (!is_aligned(compressed, 4) || !is_aligned(destination, 2) || compressed_size < 4 || destination_size == 0) {
        return false;
    }
    const uint8_t* source = static_cast<const uint8_t*>(compressed);
    const uint32_t header = read_u32(source);
    const size_t decoded_size = static_cast<size_t>(header >> 8u);
    if ((header & 0x0Fu) != 0 || ((header >> 4u) & 0x0Fu) != 1 || decoded_size == 0 ||
        decoded_size > destination_size || (decoded_size % 2u) != 0) {
        return false;
    }
#if defined(__arm__) || defined(__thumb__)
    register const void* r0 asm("r0") = compressed;
    register void* r1 asm("r1") = destination;
    asm volatile("swi 0x12" : "+r"(r0), "+r"(r1) :: "r2", "r3", "memory");
#else
    const Lz77Asset asset { source, compressed_size, decoded_size };
    if (!is_valid_lz77_asset(asset)) return false;
    if (!decode_lz77(asset, static_cast<uint8_t*>(destination), destination_size)) return false;
#endif
    return true;
}

bool bios_bit_unpack(
    const void* source,
    const BiosBitUnpackInfo& info,
    void* destination,
    size_t destination_size
) {
    if (source == nullptr || !is_aligned(destination, 4) || info.source_byte_length == 0 ||
        !is_valid_bit_unpack_source_width(info.source_width) ||
        !is_valid_bit_unpack_destination_width(info.destination_width)) {
        return false;
    }
    const size_t source_elements = (static_cast<size_t>(info.source_byte_length) * 8u) / info.source_width;
    const size_t output_bits = source_elements * info.destination_width;
    if ((output_bits % 32u) != 0) return false;
    const size_t output_size = output_bits / 8u;
    if (destination_size < output_size) return false;
    const uint64_t source_max = (static_cast<uint64_t>(1u) << info.source_width) - 1u;
    const uint64_t offset = info.data_offset & 0x7FFFFFFFu;
    const uint64_t destination_max = info.destination_width == 32
        ? 0xFFFFFFFFu
        : (static_cast<uint64_t>(1u) << info.destination_width) - 1u;
    if (offset + source_max > destination_max) return false;
#if defined(__arm__) || defined(__thumb__)
    register const void* r0 asm("r0") = source;
    register void* r1 asm("r1") = destination;
    register const BiosBitUnpackInfo* r2 asm("r2") = &info;
    asm volatile("swi 0x10" : "+r"(r0), "+r"(r1), "+r"(r2) :: "r3", "memory");
#else
    const uint8_t* input = static_cast<const uint8_t*>(source);
    uint8_t current = 0;
    uint8_t bits_remaining = 0;
    uint32_t output_word = 0;
    uint8_t output_bits_seen = 0;
    size_t source_cursor = 0;
    size_t destination_cursor = 0;
    const uint32_t source_mask = (1u << info.source_width) - 1u;
    const bool touch_zero = (info.data_offset & 0x80000000u) != 0;
    for (size_t element = 0; element < source_elements; ++element) {
        if (bits_remaining == 0) {
            current = input[source_cursor++];
            bits_remaining = 8;
        }
        uint32_t value = current & source_mask;
        current >>= info.source_width;
        bits_remaining = static_cast<uint8_t>(bits_remaining - info.source_width);
        if (value != 0 || touch_zero) value += static_cast<uint32_t>(offset);
        output_word |= value << output_bits_seen;
        output_bits_seen = static_cast<uint8_t>(output_bits_seen + info.destination_width);
        if (output_bits_seen == 32) {
            write_u32(static_cast<uint8_t*>(destination) + destination_cursor, output_word);
            destination_cursor += 4;
            output_word = 0;
            output_bits_seen = 0;
        }
    }
#endif
    return true;
}

bool bios_huff_uncomp(const void* compressed, size_t compressed_size, void* destination, size_t destination_size) {
    if (!is_aligned(compressed, 4) || !is_aligned(destination, 4) || compressed_size < 9 || destination == nullptr) {
        return false;
    }
    const uint8_t* source = static_cast<const uint8_t*>(compressed);
    const uint32_t header = read_u32(source);
    const uint8_t bits = static_cast<uint8_t>(header & 0x0Fu);
    const uint8_t element_bits = bits == 0 ? 8 : bits;
    const size_t decoded_size = static_cast<size_t>(header >> 8u);
    if ((header & 0xF0u) != 0x20u || (element_bits != 4 && element_bits != 8) || decoded_size == 0 ||
        (decoded_size % 4u) != 0 || decoded_size > destination_size) {
        return false;
    }
    const size_t tree_size = static_cast<size_t>(source[4]) * 2u + 1u;
    const size_t tree_end = 5u + tree_size;
    const size_t bitstream_size = align4(decoded_size);
    if (tree_end > compressed_size || tree_end + bitstream_size > compressed_size) return false;
#if defined(__arm__) || defined(__thumb__)
    register const void* r0 asm("r0") = compressed;
    register void* r1 asm("r1") = destination;
    asm volatile("swi 0x13" : "+r"(r0), "+r"(r1) :: "r2", "r3", "memory");
#else
    const uint8_t* tree = source + 5;
    size_t tree_cursor = 0;
    size_t output_cursor = 0;
    size_t bitstream_cursor = tree_end;
    uint32_t output_word = 0;
    uint8_t output_bits_seen = 0;
    const uint32_t value_mask = (1u << element_bits) - 1u;
    while (output_cursor < decoded_size) {
        const uint32_t bitstream = read_u32(source + bitstream_cursor);
        bitstream_cursor += 4;
        for (uint8_t bit = 0; bit < 32 && output_cursor < decoded_size; ++bit) {
            if (tree_cursor >= tree_size) return false;
            const uint8_t node = tree[tree_cursor];
            const size_t child_base = (((tree_cursor + 5u) & ~static_cast<size_t>(1u)) - 5u) +
                static_cast<size_t>(node & 0x3Fu) * 2u + 2u;
            const bool right = (bitstream & (1u << (31u - bit))) != 0;
            const size_t child = child_base + (right ? 1u : 0u);
            if (child >= tree_size) return false;
            const bool leaf = right ? ((node & 0x40u) != 0) : ((node & 0x80u) != 0);
            uint32_t value = 0;
            if (leaf) {
                value = tree[child] & value_mask;
                tree_cursor = 0;
            } else {
                tree_cursor = child;
                continue;
            }
            output_word |= value << output_bits_seen;
            output_bits_seen = static_cast<uint8_t>(output_bits_seen + element_bits);
            if (output_bits_seen == 32) {
                write_u32(static_cast<uint8_t*>(destination) + output_cursor, output_word);
                output_cursor += 4;
                output_word = 0;
                output_bits_seen = 0;
            }
        }
    }
#endif
    return true;
}

bool bios_rl_uncomp_wram(const void* compressed, size_t compressed_size, void* destination, size_t destination_size) {
    if (!is_aligned(compressed, 4) || destination == nullptr || compressed_size < 5) return false;
    const uint8_t* source = static_cast<const uint8_t*>(compressed);
    const uint32_t header = read_u32(source);
    const size_t decoded_size = static_cast<size_t>(header >> 8u);
    if ((header & 0xFFu) != 0x30u || decoded_size == 0 || destination_size < align4(decoded_size)) return false;
#if defined(__arm__) || defined(__thumb__)
    register const void* r0 asm("r0") = compressed;
    register void* r1 asm("r1") = destination;
    asm volatile("swi 0x14" : "+r"(r0), "+r"(r1) :: "r2", "r3", "memory");
#else
    if (!decode_rl_host(source, compressed_size, static_cast<uint8_t*>(destination), decoded_size, false)) return false;
#endif
    return true;
}

bool bios_rl_uncomp_vram(const void* compressed, size_t compressed_size, void* destination, size_t destination_size) {
    if (!is_aligned(compressed, 4) || !is_aligned(destination, 2) || compressed_size < 5) return false;
    const uint8_t* source = static_cast<const uint8_t*>(compressed);
    const uint32_t header = read_u32(source);
    const size_t decoded_size = static_cast<size_t>(header >> 8u);
    if ((header & 0xFFu) != 0x30u || decoded_size == 0 || (decoded_size % 2u) != 0 ||
        destination_size < align4(decoded_size)) return false;
#if defined(__arm__) || defined(__thumb__)
    register const void* r0 asm("r0") = compressed;
    register void* r1 asm("r1") = destination;
    asm volatile("swi 0x15" : "+r"(r0), "+r"(r1) :: "r2", "r3", "memory");
#else
    if (!decode_rl_host(source, compressed_size, static_cast<uint8_t*>(destination), decoded_size, true)) return false;
#endif
    return true;
}

bool bios_diff8_uncomp_wram(const void* compressed, size_t compressed_size, void* destination, size_t destination_size) {
    if (!is_aligned(compressed, 4) || destination == nullptr || compressed_size < 5) return false;
    const uint8_t* source = static_cast<const uint8_t*>(compressed);
    const uint32_t header = read_u32(source);
    const size_t decoded_size = static_cast<size_t>(header >> 8u);
    if ((header & 0xFFu) != 0x81u || decoded_size == 0 || compressed_size < 4u + decoded_size ||
        destination_size < decoded_size) return false;
#if defined(__arm__) || defined(__thumb__)
    register const void* r0 asm("r0") = compressed;
    register void* r1 asm("r1") = destination;
    asm volatile("swi 0x16" : "+r"(r0), "+r"(r1) :: "r2", "r3", "memory");
#else
    if (!decode_diff_host(source, compressed_size, static_cast<uint8_t*>(destination), decoded_size, 1, false)) return false;
#endif
    return true;
}

bool bios_diff8_uncomp_vram(const void* compressed, size_t compressed_size, void* destination, size_t destination_size) {
    if (!is_aligned(compressed, 4) || !is_aligned(destination, 2) || compressed_size < 5) return false;
    const uint8_t* source = static_cast<const uint8_t*>(compressed);
    const uint32_t header = read_u32(source);
    const size_t decoded_size = static_cast<size_t>(header >> 8u);
    if ((header & 0xFFu) != 0x81u || decoded_size == 0 || (decoded_size % 2u) != 0 ||
        compressed_size < 4u + decoded_size || destination_size < decoded_size) return false;
#if defined(__arm__) || defined(__thumb__)
    register const void* r0 asm("r0") = compressed;
    register void* r1 asm("r1") = destination;
    asm volatile("swi 0x17" : "+r"(r0), "+r"(r1) :: "r2", "r3", "memory");
#else
    if (!decode_diff_host(source, compressed_size, static_cast<uint8_t*>(destination), decoded_size, 1, true)) return false;
#endif
    return true;
}

bool bios_diff16_uncomp(const void* compressed, size_t compressed_size, void* destination, size_t destination_size) {
    if (!is_aligned(compressed, 4) || !is_aligned(destination, 2) || compressed_size < 6) return false;
    const uint8_t* source = static_cast<const uint8_t*>(compressed);
    const uint32_t header = read_u32(source);
    const size_t decoded_size = static_cast<size_t>(header >> 8u);
    if ((header & 0xFFu) != 0x82u || decoded_size == 0 || (decoded_size % 2u) != 0 ||
        compressed_size < 4u + decoded_size || destination_size < decoded_size) return false;
#if defined(__arm__) || defined(__thumb__)
    register const void* r0 asm("r0") = compressed;
    register void* r1 asm("r1") = destination;
    asm volatile("swi 0x18" : "+r"(r0), "+r"(r1) :: "r2", "r3", "memory");
#else
    if (!decode_diff_host(source, compressed_size, static_cast<uint8_t*>(destination), decoded_size, 2, true)) return false;
#endif
    return true;
}

} // namespace gbs

extern "C" void gbs_bios_vblank_intr_wait() {
    gbs::bios_vblank_intr_wait();
}

extern "C" int gbs_bios_cpu_fast_set(const void* source, void* destination, uint32_t word_count, int fill) {
    return gbs::bios_cpu_fast_set(
        source,
        destination,
        word_count,
        fill != 0 ? gbs::BiosCopyMode::Fill : gbs::BiosCopyMode::Copy
    ) ? 1 : 0;
}
