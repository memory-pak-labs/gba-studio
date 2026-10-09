#include "gbs/math.hpp"

namespace {

constexpr int16_t sin_lut_q8_8[65] = {
    0, 6, 13, 19, 25, 31, 38, 44, 50, 56, 62, 68, 74, 80, 86, 92,
    98, 104, 109, 115, 121, 126, 132, 137, 142, 147, 152, 157, 162, 167, 172, 177,
    181, 185, 190, 194, 198, 202, 206, 209, 213, 216, 220, 223, 226, 229, 231, 234,
    237, 239, 241, 243, 245, 247, 248, 250, 251, 252, 253, 254, 255, 255, 256, 256, 256,
};

constexpr uint16_t atan_lut_turn[16] = {
    8192, 4836, 2555, 1297, 651, 326, 163, 81,
    41, 20, 10, 5, 3, 1, 1, 0,
};

int32_t interpolate_sine(uint16_t local_angle, bool descending) {
    const uint16_t sample = descending
        ? static_cast<uint16_t>(gbs::angle_quarter_turn - local_angle)
        : local_angle;
    if (sample >= gbs::angle_quarter_turn) {
        return sin_lut_q8_8[64];
    }
    const uint32_t index = sample >> 8;
    const uint32_t fraction = sample & 0xFFu;
    const int32_t first = sin_lut_q8_8[index];
    const int32_t second = sin_lut_q8_8[index + 1u];
    return first + ((second - first) * static_cast<int32_t>(fraction) + 128) / 256;
}

int16_t clamp_affine_raw(gbs::Fixed value) {
    const int32_t raw = value.raw();
    if (raw < -32768) return -32768;
    if (raw > 32767) return 32767;
    return static_cast<int16_t>(raw);
}

gbs::Fixed affine_keyframe_progress(uint32_t elapsed, uint32_t duration, gbs::Easing easing) {
    if (duration == 0 || elapsed >= duration) {
        return gbs::Fixed::one();
    }
    const uint64_t raw_progress = (static_cast<uint64_t>(elapsed) * gbs::Fixed::scale) / duration;
    const gbs::Fixed progress = gbs::Fixed::from_raw(static_cast<int32_t>(raw_progress));
    const gbs::Fixed one_minus_progress = gbs::Fixed::one() - progress;
    switch (easing) {
    case gbs::Easing::Linear:
        return progress;
    case gbs::Easing::EaseIn:
        return progress * progress;
    case gbs::Easing::EaseOut:
        return gbs::Fixed::one() - one_minus_progress * one_minus_progress;
    case gbs::Easing::EaseInOut:
        if (progress < gbs::Fixed::from_ratio(1, 2)) {
            return gbs::Fixed::from_int(2) * progress * progress;
        }
        return gbs::Fixed::one() - gbs::Fixed::from_int(2) * one_minus_progress * one_minus_progress;
    default:
        return progress;
    }
}

int32_t interpolate_affine_value(int32_t from, int32_t to, gbs::Fixed progress) {
    const int64_t delta = static_cast<int64_t>(to) - from;
    const int64_t value = static_cast<int64_t>(from) + (delta * progress.raw()) / gbs::Fixed::scale;
    if (value < -2147483648ll) return static_cast<int32_t>(-2147483647 - 1);
    if (value > 2147483647ll) return 2147483647;
    return static_cast<int32_t>(value);
}

int16_t interpolate_affine_raw(int16_t from, int16_t to, gbs::Fixed progress) {
    const int32_t value = interpolate_affine_value(from, to, progress);
    if (value < -32768) return -32768;
    if (value > 32767) return 32767;
    return static_cast<int16_t>(value);
}

template <typename Keyframe>
bool has_valid_affine_keyframes(const Keyframe* keyframes, size_t count) {
    if (keyframes == nullptr || count == 0) return false;
    for (size_t index = 1; index < count; ++index) {
        if (keyframes[index].frame <= keyframes[index - 1].frame) return false;
    }
    return true;
}

} // namespace

namespace gbs {

Fixed fixed_abs(Fixed value) {
    return value < Fixed::zero() ? -value : value;
}

Fixed fixed_sin(Angle angle) {
    const uint16_t quadrant = angle >> 14;
    const uint16_t local_angle = angle & 0x3FFFu;
    const bool descending = quadrant == 1u || quadrant == 3u;
    const int32_t magnitude = interpolate_sine(local_angle, descending);
    return Fixed::from_raw(quadrant >= 2u ? -magnitude : magnitude);
}

Fixed fixed_cos(Angle angle) {
    return fixed_sin(static_cast<Angle>(angle + angle_quarter_turn));
}

Angle fixed_atan2(Fixed y_value, Fixed x_value) {
    int64_t x = x_value.raw();
    int64_t y = y_value.raw();
    if (x == 0 && y == 0) {
        return 0;
    }
    if (x == 0) {
        return y > 0
            ? angle_quarter_turn
            : static_cast<Angle>(angle_half_turn + angle_quarter_turn);
    }
    if (y == 0) {
        return x < 0 ? angle_half_turn : 0;
    }

    int32_t angle = 0;
    if (x < 0) {
        x = -x;
        y = -y;
        angle = angle_half_turn;
    }

    for (uint8_t iteration = 0; iteration < 16; ++iteration) {
        const int64_t shifted_x = x >> iteration;
        const int64_t shifted_y = y >> iteration;
        if (y > 0) {
            x += shifted_y;
            y -= shifted_x;
            angle += atan_lut_turn[iteration];
        } else if (y < 0) {
            x -= shifted_y;
            y += shifted_x;
            angle -= atan_lut_turn[iteration];
        } else {
            break;
        }
    }

    return static_cast<Angle>(angle);
}

Fixed fixed_sqrt(Fixed value) {
    if (value <= Fixed::zero()) {
        return Fixed::zero();
    }

    uint64_t remainder = static_cast<uint64_t>(value.raw()) << Fixed::fractional_bits;
    uint64_t bit = 1ull << 62;
    uint64_t result = 0;
    while (bit > remainder) {
        bit >>= 2;
    }
    while (bit != 0) {
        if (remainder >= result + bit) {
            remainder -= result + bit;
            result = (result >> 1) + bit;
        } else {
            result >>= 1;
        }
        bit >>= 2;
    }

    if (result > 2147483647ull) {
        result = 2147483647ull;
    }
    return Fixed::from_raw(static_cast<int32_t>(result));
}

uint32_t midi_key_to_frequency(uint8_t key_number) {
    if (key_number > 127) return 0;
    // MIDI note to frequency conversion: A440 standard
    // frequency = 440 * 2^((key - 69) / 12)
    static constexpr uint32_t semitone_ratios[12] = {
        1024, 1152, 1296, 1458, 1638, 1835, 2060, 2317, 2601, 2919, 3277, 3678
    };
    const int32_t offset = static_cast<int32_t>(key_number) - 69;
    const int32_t octaves = offset / 12;
    const int32_t semitones = offset % 12;
    // Start from A440 = key 69
    uint32_t freq = 440u;
    // Apply semitone ratios
    if (semitones >= 0) {
        freq *= semitone_ratios[semitones];
    } else {
        freq /= semitone_ratios[(-semitones) % 12];  // simplified - actual impl needs care
    }
    // Apply octave shift
    if (octaves > 0) {
        for (int i = 0; i < octaves; ++i) freq *= 2;
    } else if (octaves < 0) {
        for (int i = 0; i < -octaves; ++i) freq /= 2;
    }
    // Clamp to reasonable GBA audio range
    if (freq < 100) freq = 100;
    if (freq > 8000) freq = 8000;
    return freq;
}

bool build_affine_matrix(AffineMatrix& out, Angle angle, Fixed scale_x, Fixed scale_y) {
    if (scale_x <= Fixed::zero() || scale_y <= Fixed::zero()) {
        return false;
    }

    const Fixed inverse_scale_x = Fixed::one() / scale_x;
    const Fixed inverse_scale_y = Fixed::one() / scale_y;
    const Fixed sine = fixed_sin(angle);
    const Fixed cosine = fixed_cos(angle);
    out = AffineMatrix {
        clamp_affine_raw(cosine * inverse_scale_x),
        clamp_affine_raw(-sine * inverse_scale_x),
        clamp_affine_raw(sine * inverse_scale_y),
        clamp_affine_raw(cosine * inverse_scale_y),
    };
    return true;
}

bool build_affine_matrix_with_shear(
    AffineMatrix& out,
    Angle angle,
    Fixed scale_x,
    Fixed scale_y,
    Fixed shear_x,
    Fixed shear_y
) {
    if (scale_x <= Fixed::zero() || scale_y <= Fixed::zero()) {
        return false;
    }
    AffineMatrix rotation_scale;
    if (!build_affine_matrix(rotation_scale, angle, scale_x, scale_y)) {
        return false;
    }
    // Apply shear after rotation/scale: result = shear * rotation_scale
    out = compose_affine_matrices(affine_shear_matrix(shear_x, shear_y), rotation_scale);
    return true;
}

bool build_affine_transform(
    AffineTransform& out,
    Angle angle,
    Fixed scale_x,
    Fixed scale_y,
    int32_t texture_anchor_x_8,
    int32_t texture_anchor_y_8,
    int16_t screen_anchor_x,
    int16_t screen_anchor_y
) {
    AffineMatrix matrix = out.matrix;
    if (!build_affine_matrix(matrix, angle, scale_x, scale_y)) {
        return false;
    }
    const int64_t reference_x = static_cast<int64_t>(texture_anchor_x_8) -
        static_cast<int64_t>(matrix.pa) * screen_anchor_x -
        static_cast<int64_t>(matrix.pb) * screen_anchor_y;
    const int64_t reference_y = static_cast<int64_t>(texture_anchor_y_8) -
        static_cast<int64_t>(matrix.pc) * screen_anchor_x -
        static_cast<int64_t>(matrix.pd) * screen_anchor_y;
    out.matrix = matrix;
    out.reference_x_8 = reference_x < -2147483648ll
        ? static_cast<int32_t>(-2147483647 - 1)
        : (reference_x > 2147483647ll ? 2147483647 : static_cast<int32_t>(reference_x));
    out.reference_y_8 = reference_y < -2147483648ll
        ? static_cast<int32_t>(-2147483647 - 1)
        : (reference_y > 2147483647ll ? 2147483647 : static_cast<int32_t>(reference_y));
    return true;
}

bool sample_affine_matrix(
    AffineMatrix& out,
    const AffineMatrixKeyframe* keyframes,
    size_t count,
    uint32_t frame,
    Easing easing
) {
    if (!has_valid_affine_keyframes(keyframes, count)) return false;
    if (frame <= keyframes[0].frame) {
        out = keyframes[0].matrix;
        return true;
    }
    if (frame >= keyframes[count - 1].frame) {
        out = keyframes[count - 1].matrix;
        return true;
    }

    size_t next_index = 1;
    while (next_index < count && keyframes[next_index].frame < frame) ++next_index;
    const AffineMatrixKeyframe& from = keyframes[next_index - 1];
    const AffineMatrixKeyframe& to = keyframes[next_index];
    const Fixed progress = affine_keyframe_progress(
        frame - from.frame,
        to.frame - from.frame,
        easing
    );
    out = AffineMatrix {
        interpolate_affine_raw(from.matrix.pa, to.matrix.pa, progress),
        interpolate_affine_raw(from.matrix.pb, to.matrix.pb, progress),
        interpolate_affine_raw(from.matrix.pc, to.matrix.pc, progress),
        interpolate_affine_raw(from.matrix.pd, to.matrix.pd, progress)
    };
    return true;
}

bool sample_affine_transform(
    AffineTransform& out,
    const AffineTransformKeyframe* keyframes,
    size_t count,
    uint32_t frame,
    Easing easing
) {
    if (!has_valid_affine_keyframes(keyframes, count)) return false;
    if (frame <= keyframes[0].frame) {
        out = keyframes[0].transform;
        return true;
    }
    if (frame >= keyframes[count - 1].frame) {
        out = keyframes[count - 1].transform;
        return true;
    }

    size_t next_index = 1;
    while (next_index < count && keyframes[next_index].frame < frame) ++next_index;
    const AffineTransformKeyframe& from = keyframes[next_index - 1];
    const AffineTransformKeyframe& to = keyframes[next_index];
    const Fixed progress = affine_keyframe_progress(
        frame - from.frame,
        to.frame - from.frame,
        easing
    );
    out = AffineTransform {
        AffineMatrix {
            interpolate_affine_raw(from.transform.matrix.pa, to.transform.matrix.pa, progress),
            interpolate_affine_raw(from.transform.matrix.pb, to.transform.matrix.pb, progress),
            interpolate_affine_raw(from.transform.matrix.pc, to.transform.matrix.pc, progress),
            interpolate_affine_raw(from.transform.matrix.pd, to.transform.matrix.pd, progress)
        },
        interpolate_affine_value(from.transform.reference_x_8, to.transform.reference_x_8, progress),
        interpolate_affine_value(from.transform.reference_y_8, to.transform.reference_y_8, progress)
    };
    return true;
}

} // namespace gbs
