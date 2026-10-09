#pragma once

#include <stdint.h>

namespace gbs {

struct Vec2i {
    int x;
    int y;
};

struct Rect {
    int x;
    int y;
    int width;
    int height;

    constexpr int right() const { return x + width; }
    constexpr int bottom() const { return y + height; }
};

constexpr bool intersects(Rect a, Rect b) {
    return a.x < b.right() && a.right() > b.x && a.y < b.bottom() && a.bottom() > b.y;
}

constexpr int clamp_int(int value, int minimum, int maximum) {
    return value < minimum ? minimum : (value > maximum ? maximum : value);
}

constexpr int gba_screen_width = 240;
constexpr int gba_screen_height = 160;
constexpr int gba_tile_size = 8;

class Fixed {
public:
    static constexpr int fractional_bits = 8;
    static constexpr int32_t scale = 1 << fractional_bits;

    constexpr Fixed() : raw_(0) {}
    static constexpr Fixed from_raw(int32_t raw) { return Fixed(raw); }
    static constexpr Fixed from_int(int value) {
        return Fixed(saturate_raw(static_cast<int64_t>(value) * scale));
    }
    static constexpr Fixed from_ratio(int numerator, int denominator) {
        return denominator == 0
            ? Fixed()
            : Fixed(saturate_raw((static_cast<int64_t>(numerator) * scale) / denominator));
    }
    static constexpr Fixed zero() { return Fixed(); }
    static constexpr Fixed one() { return Fixed(scale); }

    constexpr int32_t raw() const { return raw_; }
    constexpr int to_int() const { return raw_ >> fractional_bits; }

    constexpr Fixed operator+(Fixed other) const {
        return Fixed(saturate_raw(static_cast<int64_t>(raw_) + other.raw_));
    }
    constexpr Fixed operator-(Fixed other) const {
        return Fixed(saturate_raw(static_cast<int64_t>(raw_) - other.raw_));
    }
    constexpr Fixed operator-() const { return Fixed(raw_ == raw_min ? raw_max : -raw_); }
    constexpr Fixed operator*(Fixed other) const {
        return Fixed(saturate_raw((static_cast<int64_t>(raw_) * other.raw_) >> fractional_bits));
    }
    constexpr Fixed operator/(Fixed other) const {
        return other.raw_ == 0
            ? Fixed()
            : Fixed(saturate_raw((static_cast<int64_t>(raw_) * scale) / other.raw_));
    }

    constexpr Fixed& operator+=(Fixed other) {
        raw_ = saturate_raw(static_cast<int64_t>(raw_) + other.raw_);
        return *this;
    }
    constexpr Fixed& operator-=(Fixed other) {
        raw_ = saturate_raw(static_cast<int64_t>(raw_) - other.raw_);
        return *this;
    }
    constexpr Fixed& operator*=(Fixed other) {
        raw_ = saturate_raw((static_cast<int64_t>(raw_) * other.raw_) >> fractional_bits);
        return *this;
    }
    constexpr Fixed& operator/=(Fixed other) {
        raw_ = other.raw_ == 0
            ? 0
            : saturate_raw((static_cast<int64_t>(raw_) * scale) / other.raw_);
        return *this;
    }

    constexpr bool operator==(Fixed other) const { return raw_ == other.raw_; }
    constexpr bool operator!=(Fixed other) const { return raw_ != other.raw_; }
    constexpr bool operator<(Fixed other) const { return raw_ < other.raw_; }
    constexpr bool operator<=(Fixed other) const { return raw_ <= other.raw_; }
    constexpr bool operator>(Fixed other) const { return raw_ > other.raw_; }
    constexpr bool operator>=(Fixed other) const { return raw_ >= other.raw_; }

private:
    static constexpr int32_t raw_min = static_cast<int32_t>(-2147483647 - 1);
    static constexpr int32_t raw_max = 2147483647;

    static constexpr int32_t saturate_raw(int64_t raw) {
        return raw < raw_min ? raw_min : (raw > raw_max ? raw_max : static_cast<int32_t>(raw));
    }

    explicit constexpr Fixed(int32_t raw) : raw_(raw) {}
    int32_t raw_;
};

} // namespace gbs
