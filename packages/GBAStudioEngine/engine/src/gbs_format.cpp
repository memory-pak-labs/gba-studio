#include "gbs/format.hpp"

namespace {

gbs::FormatResult write_digits(
    uint32_t magnitude,
    bool negative,
    char* destination,
    size_t destination_size
) {
    char reversed[11] = {};
    size_t digit_count = 0;
    do {
        reversed[digit_count++] = static_cast<char>('0' + (magnitude % 10u));
        magnitude /= 10u;
    } while (magnitude != 0);

    const size_t required_size = digit_count + (negative ? 1u : 0u);
    if (destination == nullptr || destination_size == 0) {
        return gbs::FormatResult { required_size, false };
    }

    const size_t writable = destination_size - 1u;
    const size_t count = required_size < writable ? required_size : writable;
    size_t output_index = 0;
    if (negative && output_index < count) {
        destination[output_index++] = '-';
    }
    for (size_t index = 0; index < digit_count && output_index < count; ++index) {
        destination[output_index++] = reversed[digit_count - index - 1u];
    }
    destination[output_index] = '\0';
    return gbs::FormatResult { required_size, count == required_size };
}

} // namespace

namespace gbs {

FormatResult format_uint32(uint32_t value, char* destination, size_t destination_size) {
    return write_digits(value, false, destination, destination_size);
}

FormatResult format_int32(int32_t value, char* destination, size_t destination_size) {
    const bool negative = value < 0;
    const uint32_t magnitude = negative
        ? static_cast<uint32_t>(-(static_cast<int64_t>(value)))
        : static_cast<uint32_t>(value);
    return write_digits(magnitude, negative, destination, destination_size);
}

} // namespace gbs
