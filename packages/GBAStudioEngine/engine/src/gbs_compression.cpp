#include "gbs/compression.hpp"

namespace gbs {

bool decode_rle16(const Rle16Asset& asset, uint16_t* output, size_t output_count) {
    if (!is_valid_rle16_asset(asset) || output == nullptr || output_count < asset.decoded_count) {
        return false;
    }

    size_t cursor = 0;
    for (size_t run_index = 0; run_index < asset.run_count; ++run_index) {
        const Rle16Run& run = asset.runs[run_index];
        for (uint16_t repeat = 0; repeat < run.count; ++repeat) {
            output[cursor] = run.value;
            ++cursor;
        }
    }
    return cursor == asset.decoded_count;
}

bool decode_lz77(const Lz77Asset& asset, uint8_t* output, size_t output_count) {
    if (!is_valid_lz77_asset(asset) || output == nullptr || output_count < asset.decoded_count) {
        return false;
    }

    size_t input_cursor = 4;
    size_t output_cursor = 0;
    while (output_cursor < asset.decoded_count) {
        if (input_cursor >= asset.data_size) {
            return false;
        }

        uint8_t flags = asset.data[input_cursor++];
        for (uint8_t bit = 0; bit < 8 && output_cursor < asset.decoded_count; ++bit) {
            bool compressed = (flags & (0x80u >> bit)) != 0;
            if (!compressed) {
                if (input_cursor >= asset.data_size) {
                    return false;
                }
                output[output_cursor++] = asset.data[input_cursor++];
                continue;
            }

            if (input_cursor + 1 >= asset.data_size) {
                return false;
            }
            uint8_t first = asset.data[input_cursor++];
            uint8_t second = asset.data[input_cursor++];
            size_t length = static_cast<size_t>((first >> 4) + 3);
            size_t displacement = static_cast<size_t>(((first & 0x0Fu) << 8) | second) + 1;
            if (displacement == 0 || displacement > output_cursor || output_cursor + length > asset.decoded_count) {
                return false;
            }

            for (size_t index = 0; index < length; ++index) {
                output[output_cursor] = output[output_cursor - displacement];
                ++output_cursor;
            }
        }
    }

    return output_cursor == asset.decoded_count;
}

bool decode_huffman(const HuffmanAsset& asset, uint8_t* output, size_t output_count) {
    if (!is_valid_huffman_asset(asset) || output == nullptr || output_count < asset.decoded_count) {
        return false;
    }

    const size_t tree_size = static_cast<size_t>(asset.data[4]) * 2u + 1u;
    const size_t tree_end = 5u + tree_size;
    const uint8_t element_bits = huffman_element_bits(asset);
    const uint32_t value_mask = (1u << element_bits) - 1u;
    size_t tree_cursor = 0;
    size_t bit_cursor = 0;
    size_t output_cursor = 0;
    uint8_t output_value = 0;
    uint8_t output_bits = 0;
    const size_t symbol_count = element_bits == 8 ? asset.decoded_count : asset.decoded_count * 2u;

    size_t decoded_symbols = 0;
    while (decoded_symbols < symbol_count) {
        if (tree_cursor >= tree_size || tree_end + (bit_cursor / 8u) >= asset.data_size) {
            return false;
        }

        const size_t word_cursor = (bit_cursor / 32u) * 4u;
        const size_t bit_in_word = bit_cursor % 32u;
        const size_t byte_cursor = word_cursor + ((31u - bit_in_word) / 8u);
        const uint8_t bitstream_byte = asset.data[tree_end + byte_cursor];
        const bool right = (bitstream_byte & (1u << ((31u - bit_in_word) % 8u))) != 0;
        ++bit_cursor;

        const uint8_t node = asset.data[5u + tree_cursor];
        const size_t child_base = (((tree_cursor + 5u) & ~static_cast<size_t>(1u)) - 5u) +
            static_cast<size_t>(node & 0x3Fu) * 2u + 2u;
        const size_t child = child_base + (right ? 1u : 0u);
        if (child >= tree_size) {
            return false;
        }

        const bool leaf = right ? ((node & 0x40u) != 0) : ((node & 0x80u) != 0);
        if (!leaf) {
            tree_cursor = child;
            continue;
        }

        const uint32_t value = asset.data[5u + child] & value_mask;
        output_value |= static_cast<uint8_t>(value << output_bits);
        output_bits = static_cast<uint8_t>(output_bits + element_bits);
        if (output_bits == 8) {
            output[output_cursor++] = output_value;
            output_value = 0;
            output_bits = 0;
        }
        tree_cursor = 0;
        ++decoded_symbols;
    }

    return output_cursor == asset.decoded_count && output_bits == 0;
}

} // namespace gbs
