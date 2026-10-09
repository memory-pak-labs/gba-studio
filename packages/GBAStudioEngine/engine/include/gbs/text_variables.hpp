#pragma once

#include <stddef.h>

namespace gbs {

constexpr size_t text_variable_count = 8;
constexpr size_t text_variable_max_length = 16;

constexpr bool is_valid_text_variable_index(int index) {
    return index >= 0 && static_cast<size_t>(index) < text_variable_count;
}

} // namespace gbs
