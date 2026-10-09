#pragma once

#include <stddef.h>
#include <stdint.h>

namespace gbs {

struct FormatResult {
    size_t required_size;
    bool complete;
};

FormatResult format_uint32(uint32_t value, char* destination, size_t destination_size);
FormatResult format_int32(int32_t value, char* destination, size_t destination_size);

} // namespace gbs
