#pragma once

#include <stddef.h>
#include <stdint.h>

namespace gbs {

namespace detail {

// Freestanding-safe byte comparison (no libc dependency, so this header stays
// usable under test shims that neutralize compiler attributes).
inline int compare_bytes(const char* a, const char* b, size_t length) {
    for (size_t i = 0; i < length; ++i) {
        const unsigned char ca = static_cast<unsigned char>(a[i]);
        const unsigned char cb = static_cast<unsigned char>(b[i]);
        if (ca != cb) {
            return ca < cb ? -1 : 1;
        }
    }
    return 0;
}

inline int compare_cstrings(const char* a, const char* b) {
    size_t i = 0;
    for (;;) {
        const unsigned char ca = static_cast<unsigned char>(a[i]);
        const unsigned char cb = static_cast<unsigned char>(b[i]);
        if (ca != cb) {
            return ca < cb ? -1 : 1;
        }
        if (ca == '\0') {
            return 0;
        }
        ++i;
    }
}

} // namespace detail

// ============================================================
// Optional<T> - Optional value container (no heap)
// ============================================================

template <typename T>
struct Optional {
    bool has_value;
    T value;

    constexpr Optional() : has_value(false) {}
    constexpr Optional(const T& v) : has_value(true), value(v) {}
    constexpr Optional(T&& v) : has_value(true), value(static_cast<T&&>(v)) {}

    constexpr bool operator==(const Optional& other) const {
        return has_value == other.has_value && (!has_value || value == other.value);
    }
    constexpr bool operator!=(const Optional& other) const { return !(*this == other); }

    constexpr explicit operator bool() const { return has_value; }
    constexpr const T& operator*() const { return value; }
    constexpr T& operator*() { return value; }
    constexpr const T* operator->() const { return &value; }
    constexpr T* operator->() { return &value; }

    constexpr T value_or(const T& default_value) const {
        return has_value ? value : default_value;
    }
};

template <typename T>
constexpr Optional<T> make_optional(const T& v) {
    return Optional<T>(v);
}

// ============================================================
// FixedString - Fixed capacity string
// ============================================================

template <size_t Capacity>
struct FixedString {
    char data[Capacity + 1];
    size_t length;

    constexpr FixedString() : length(0) { data[0] = '\0'; }
    constexpr FixedString(const char* s) : length(0) { assign(s); }
    constexpr FixedString(const char* s, size_t n) : length(0) { assign(s, n); }

    constexpr size_t size() const { return length; }
    constexpr bool empty() const { return length == 0; }
    constexpr const char* c_str() const { return data; }
    constexpr char operator[](size_t i) const { return i < length ? data[i] : '\0'; }
    constexpr char& operator[](size_t i) { return data[i]; }

    void assign(const char* s) {
        length = 0;
        while (*s && length < Capacity) {
            data[length++] = *s++;
        }
        data[length] = '\0';
    }

    void assign(const char* s, size_t n) {
        length = 0;
        while (n-- > 0 && length < Capacity) {
            data[length++] = *s++;
        }
        data[length] = '\0';
    }

    void clear() {
        length = 0;
        data[0] = '\0';
    }

    void push_back(char c) {
        if (length < Capacity) {
            data[length++] = c;
            data[length] = '\0';
        }
    }

    void pop_back() {
        if (length > 0) {
            data[--length] = '\0';
        }
    }

    bool operator==(const FixedString& other) const {
        return length == other.length && detail::compare_bytes(data, other.data, length) == 0;
    }
    bool operator!=(const FixedString& other) const { return !(*this == other); }
    bool operator<(const FixedString& other) const {
        return detail::compare_cstrings(data, other.data) < 0;
    }
};

using String16 = FixedString<16>;
using String32 = FixedString<32>;
using String64 = FixedString<64>;
using String128 = FixedString<128>;
using String256 = FixedString<256>;

// ============================================================
// Vector<T, Capacity> - Fixed capacity vector
// ============================================================

template <typename T, size_t Capacity>
struct Vector {
    T data[Capacity];
    size_t length;

    constexpr Vector() : length(0) {}
    constexpr Vector(size_t n, const T& value) : length(n) {
        for (size_t i = 0; i < n; ++i) data[i] = value;
    }

    constexpr size_t size() const { return length; }
    constexpr size_t capacity() const { return Capacity; }
    constexpr bool empty() const { return length == 0; }
    constexpr bool full() const { return length == Capacity; }

    T& operator[](size_t i) { return data[i]; }
    constexpr const T& operator[](size_t i) const { return data[i]; }

    T& at(size_t i) {
        if (i >= length) while (1) {}
        return data[i];
    }
    constexpr const T& at(size_t i) const {
        if (i >= length) while (1) {}
        return data[i];
    }

    T& front() { return data[0]; }
    constexpr const T& front() const { return data[0]; }
    T& back() { return data[length - 1]; }
    constexpr const T& back() const { return data[length - 1]; }

    T* data_ptr() { return data; }
    constexpr const T* data_ptr() const { return data; }

    void clear() { length = 0; }

    void push_back(const T& value) {
        if (length < Capacity) {
            data[length++] = value;
        }
    }

    void push_back(T&& value) {
        if (length < Capacity) {
            data[length++] = static_cast<T&&>(value);
        }
    }

    void pop_back() {
        if (length > 0) --length;
    }

    void resize(size_t n, const T& value = T{}) {
        if (n > Capacity) return;
        if (n > length) {
            for (size_t i = length; i < n; ++i) data[i] = value;
        }
        length = n;
    }

    bool operator==(const Vector& other) const {
        if (length != other.length) return false;
        for (size_t i = 0; i < length; ++i) {
            if (data[i] != other.data[i]) return false;
        }
        return true;
    }
    bool operator!=(const Vector& other) const { return !(*this == other); }
};

// Common type aliases
using Vec2_u8 = Vector<uint8_t, 2>;
using Vec2_u16 = Vector<uint16_t, 2>;
using Vec2_u32 = Vector<uint32_t, 2>;
using Vec2_i16 = Vector<int16_t, 2>;
using Vec2_i32 = Vector<int32_t, 2>;

} // namespace gbs