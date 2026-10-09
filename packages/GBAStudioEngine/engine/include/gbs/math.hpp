#pragma once

#include <stddef.h>
#include <stdint.h>

#include "gbs/tween.hpp"
#include "gbs/types.hpp"

namespace gbs {

// Angles use the same 16-bit turn as the GBA BIOS: 0x0000 is 0 degrees,
// 0x4000 is 90 degrees, and 0x8000 is 180 degrees.
using Angle = uint16_t;
constexpr uint32_t angle_full_turn = 65536u;
constexpr Angle angle_quarter_turn = 16384u;
constexpr Angle angle_half_turn = 32768u;

// The GBA affine registers are signed 8.8 fixed-point values. Unlike a
// forward graphics matrix, this matrix maps screen coordinates back into
// texture coordinates, which is the convention required by the hardware.
struct AffineMatrix {
    int16_t pa;
    int16_t pb;
    int16_t pc;
    int16_t pd;
};

struct AffineTransform {
    AffineMatrix matrix;
    int32_t reference_x_8;
    int32_t reference_y_8;
};

struct AffineMatrixKeyframe {
    uint32_t frame;
    AffineMatrix matrix;
};

struct AffineTransformKeyframe {
    uint32_t frame;
    AffineTransform transform;
};

Fixed fixed_abs(Fixed value);
Fixed fixed_sin(Angle angle);
Fixed fixed_cos(Angle angle);
Angle fixed_atan2(Fixed y, Fixed x);
Fixed fixed_sqrt(Fixed value);

constexpr AffineMatrix identity_affine_matrix() {
    return AffineMatrix { 256, 0, 0, 256 };
}

// Builds a pure horizontal scale matrix (scale_y = 1.0).
constexpr AffineMatrix affine_scale_x_matrix(int16_t scale_x) {
    return AffineMatrix { scale_x, 0, 0, 256 };
}

// Builds a pure vertical scale matrix (scale_x = 1.0).
constexpr AffineMatrix affine_scale_y_matrix(int16_t scale_y) {
    return AffineMatrix { 256, 0, 0, scale_y };
}

// Builds the GBA inverse mapping for a visual scale followed by a
// counter-clockwise rotation. Both scales must be strictly positive.
bool build_affine_matrix(
    AffineMatrix& out,
    Angle angle,
    Fixed scale_x,
    Fixed scale_y
);

// Builds the complete GBA mapping around an explicit texture/screen anchor.
// The matrix follows the same inverse screen-to-texture convention as
// build_affine_matrix; the reference coordinates are Q8.8 values.
bool build_affine_transform(
    AffineTransform& out,
    Angle angle,
    Fixed scale_x,
    Fixed scale_y,
    int32_t texture_anchor_x_8,
    int32_t texture_anchor_y_8,
    int16_t screen_anchor_x,
    int16_t screen_anchor_y
);

// Builds an affine matrix from rotation, scale and shear. Shear is expressed
// in Q8.8 fixed point (256 = 1.0). The matrix follows the same inverse
// screen-to-texture convention as build_affine_matrix.
bool build_affine_matrix_with_shear(
    AffineMatrix& out,
    Angle angle,
    Fixed scale_x,
    Fixed scale_y,
    Fixed shear_x,
    Fixed shear_y
);

// Multiplies two affine matrices (a then b). The result is a * b using the
// GBA screen-to-texture convention.
constexpr AffineMatrix compose_affine_matrices(const AffineMatrix& a, const AffineMatrix& b) {
    return AffineMatrix {
        static_cast<int16_t>((
            static_cast<int32_t>(a.pa) * b.pa + static_cast<int32_t>(a.pb) * b.pc) >> 8),
        static_cast<int16_t>((
            static_cast<int32_t>(a.pa) * b.pb + static_cast<int32_t>(a.pb) * b.pd) >> 8),
        static_cast<int16_t>((
            static_cast<int32_t>(a.pc) * b.pa + static_cast<int32_t>(a.pd) * b.pc) >> 8),
        static_cast<int16_t>((
            static_cast<int32_t>(a.pc) * b.pb + static_cast<int32_t>(a.pd) * b.pd) >> 8)
    };
}

// Returns a shear-only affine matrix (X sheared by shear_x Q8.8, Y by shear_y Q8.8).
constexpr AffineMatrix affine_shear_matrix(Fixed shear_x, Fixed shear_y) {
    return AffineMatrix {
        static_cast<int16_t>(256),
        static_cast<int16_t>(shear_x.raw()),
        static_cast<int16_t>(shear_y.raw()),
        static_cast<int16_t>(256)
    };
}

// Samples a validated, strictly increasing keyframe list without floating
// point arithmetic. Frames before/after the list clamp to its endpoints.
bool sample_affine_matrix(
    AffineMatrix& out,
    const AffineMatrixKeyframe* keyframes,
    size_t count,
    uint32_t frame,
    Easing easing = Easing::Linear
);

bool sample_affine_transform(
    AffineTransform& out,
    const AffineTransformKeyframe* keyframes,
    size_t count,
    uint32_t frame,
    Easing easing = Easing::Linear
);

} // namespace gbs
