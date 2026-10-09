#include <cassert>
#include <cstdint>

#include "gbs/math.hpp"

namespace {

constexpr uint32_t full_turn = gbs::angle_full_turn;
constexpr uint16_t quarter_turn = gbs::angle_quarter_turn;

int angle_distance(uint16_t left, uint16_t right) {
    const int difference = static_cast<int>(left) - static_cast<int>(right);
    const int wrapped = difference < -32768 ? difference + 65536 :
        (difference > 32768 ? difference - 65536 : difference);
    return wrapped < 0 ? -wrapped : wrapped;
}

void test_fixed_arithmetic_preserves_q8_8_scale() {
    const gbs::Fixed one = gbs::Fixed::from_int(1);
    const gbs::Fixed half = gbs::Fixed::from_ratio(1, 2);
    const gbs::Fixed quarter = gbs::Fixed::from_ratio(1, 4);

    assert(one.raw() == 256);
    assert(half.raw() == 128);
    assert((half + quarter).raw() == 192);
    assert((half * half).raw() == 64);
    assert((one / half).raw() == 512);
    assert((-quarter).raw() == -64);
    assert((gbs::Fixed::from_raw(2147483647) + one).raw() == 2147483647);
    assert((gbs::Fixed::from_raw(-2147483647 - 1) - one).raw() == -2147483647 - 1);
}

void test_trigonometry_uses_gba_angle_units() {
    assert(gbs::fixed_sin(0).raw() == 0);
    assert(gbs::fixed_sin(quarter_turn).raw() == 256);
    assert(gbs::fixed_sin(static_cast<uint16_t>(quarter_turn * 2)).raw() == 0);
    assert(gbs::fixed_sin(static_cast<uint16_t>(quarter_turn * 3)).raw() == -256);
    assert(gbs::fixed_cos(0).raw() == 256);
    assert(gbs::fixed_cos(quarter_turn).raw() == 0);

    const gbs::Fixed diagonal = gbs::fixed_sin(static_cast<uint16_t>(quarter_turn / 2));
    assert(diagonal.raw() >= 179 && diagonal.raw() <= 183);
    assert(gbs::fixed_cos(static_cast<uint16_t>(quarter_turn / 2)).raw() == diagonal.raw());
    assert(full_turn == 65536u);
}

void test_atan2_returns_full_turn_angles() {
    assert(gbs::fixed_atan2(gbs::Fixed::from_int(0), gbs::Fixed::from_int(1)) == 0);
    assert(angle_distance(
        gbs::fixed_atan2(gbs::Fixed::from_int(1), gbs::Fixed::from_int(0)),
        quarter_turn
    ) <= 2);
    assert(angle_distance(
        gbs::fixed_atan2(gbs::Fixed::from_int(0), gbs::Fixed::from_int(-1)),
        static_cast<uint16_t>(quarter_turn * 2)
    ) <= 2);
    assert(angle_distance(
        gbs::fixed_atan2(gbs::Fixed::from_int(-1), gbs::Fixed::from_int(0)),
        static_cast<uint16_t>(quarter_turn * 3)
    ) <= 2);
    assert(angle_distance(
        gbs::fixed_atan2(gbs::Fixed::from_int(1), gbs::Fixed::from_int(1)),
        static_cast<uint16_t>(quarter_turn / 2)
    ) <= 8);
    assert(angle_distance(
        gbs::fixed_atan2(gbs::Fixed::from_int(1), gbs::Fixed::from_int(-1)),
        static_cast<uint16_t>(quarter_turn + quarter_turn / 2)
    ) <= 8);
    assert(angle_distance(
        gbs::fixed_atan2(gbs::Fixed::from_int(-1), gbs::Fixed::from_int(-1)),
        static_cast<uint16_t>(quarter_turn * 2 + quarter_turn / 2)
    ) <= 8);
    assert(angle_distance(
        gbs::fixed_atan2(gbs::Fixed::from_int(-1), gbs::Fixed::from_int(1)),
        static_cast<uint16_t>(quarter_turn * 4 - quarter_turn / 2)
    ) <= 8);
    assert(gbs::fixed_atan2(gbs::Fixed::from_int(0), gbs::Fixed::from_int(0)) == 0);
}

void test_fixed_sqrt_is_safe_for_negative_values() {
    assert(gbs::fixed_sqrt(gbs::Fixed::from_int(0)).raw() == 0);
    assert(gbs::fixed_sqrt(gbs::Fixed::from_int(4)).raw() == 512);
    assert(gbs::fixed_sqrt(gbs::Fixed::from_ratio(1, 4)).raw() == 128);
    assert(gbs::fixed_sqrt(gbs::Fixed::from_int(-1)).raw() == 0);
}

void test_affine_matrix_matches_gba_inverse_mapping() {
    gbs::AffineMatrix matrix = gbs::identity_affine_matrix();
    assert(gbs::build_affine_matrix(
        matrix,
        quarter_turn,
        gbs::Fixed::from_int(1),
        gbs::Fixed::from_int(1)
    ));
    assert(matrix.pa == 0);
    assert(matrix.pb == -256);
    assert(matrix.pc == 256);
    assert(matrix.pd == 0);

    assert(gbs::build_affine_matrix(
        matrix,
        0,
        gbs::Fixed::from_int(2),
        gbs::Fixed::from_ratio(1, 2)
    ));
    assert(matrix.pa == 128);
    assert(matrix.pb == 0);
    assert(matrix.pc == 0);
    assert(matrix.pd == 512);

    const gbs::AffineMatrix previous = matrix;
    assert(!gbs::build_affine_matrix(
        matrix,
        0,
        gbs::Fixed::from_int(0),
        gbs::Fixed::from_int(1)
    ));
    assert(matrix.pa == previous.pa);
    assert(matrix.pb == previous.pb);
    assert(matrix.pc == previous.pc);
    assert(matrix.pd == previous.pd);
}

void test_affine_transform_keeps_explicit_anchor_stable() {
    gbs::AffineTransform transform {
        gbs::AffineMatrix { 0, 0, 0, 0 },
        0,
        0
    };
    assert(gbs::build_affine_transform(
        transform,
        quarter_turn,
        gbs::Fixed::from_int(1),
        gbs::Fixed::from_int(1),
        32 * 256,
        16 * 256,
        120,
        80
    ));
    assert(transform.matrix.pa == 0);
    assert(transform.matrix.pb == -256);
    assert(transform.matrix.pc == 256);
    assert(transform.matrix.pd == 0);
    assert(transform.reference_x_8 == (32 + 80) * 256);
    assert(transform.reference_y_8 == (16 - 120) * 256);

    const gbs::AffineTransform previous = transform;
    assert(!gbs::build_affine_transform(
        transform,
        0,
        gbs::Fixed::zero(),
        gbs::Fixed::one(),
        0,
        0,
        0,
        0
    ));
    assert(transform.matrix.pa == previous.matrix.pa);
    assert(transform.reference_x_8 == previous.reference_x_8);
}

void test_affine_keyframes_interpolate_without_float() {
    const gbs::AffineMatrixKeyframe keyframes[] = {
        { 10, gbs::AffineMatrix { 256, 0, 0, 256 } },
        { 20, gbs::AffineMatrix { 512, 128, -128, 384 } }
    };
    gbs::AffineMatrix matrix { 0, 0, 0, 0 };
    assert(gbs::sample_affine_matrix(matrix, keyframes, 2, 15));
    assert(matrix.pa == 384);
    assert(matrix.pb == 64);
    assert(matrix.pc == -64);
    assert(matrix.pd == 320);

    assert(gbs::sample_affine_matrix(matrix, keyframes, 2, 15, gbs::Easing::EaseIn));
    assert(matrix.pa == 320);
    assert(matrix.pb == 32);
    assert(matrix.pc == -32);
    assert(matrix.pd == 288);

    const gbs::AffineTransformKeyframe transform_keyframes[] = {
        { 0, gbs::AffineTransform { gbs::AffineMatrix { 256, 0, 0, 256 }, 1024, 2048 } },
        { 4, gbs::AffineTransform { gbs::AffineMatrix { 128, 64, -64, 512 }, 2048, 4096 } }
    };
    gbs::AffineTransform transform {
        gbs::AffineMatrix { 0, 0, 0, 0 },
        0,
        0
    };
    assert(gbs::sample_affine_transform(transform, transform_keyframes, 2, 2));
    assert(transform.matrix.pa == 192);
    assert(transform.matrix.pb == 32);
    assert(transform.matrix.pc == -32);
    assert(transform.matrix.pd == 384);
    assert(transform.reference_x_8 == 1536);
    assert(transform.reference_y_8 == 3072);
}

void test_affine_keyframes_reject_invalid_order_without_mutating_output() {
    const gbs::AffineMatrixKeyframe invalid[] = {
        { 10, gbs::AffineMatrix { 256, 0, 0, 256 } },
        { 10, gbs::AffineMatrix { 512, 0, 0, 512 } }
    };
    gbs::AffineMatrix matrix { 1, 2, 3, 4 };
    assert(!gbs::sample_affine_matrix(matrix, invalid, 2, 10));
    assert(matrix.pa == 1);
    assert(matrix.pb == 2);
    assert(matrix.pc == 3);
    assert(matrix.pd == 4);
}

} // namespace

void test_shear_matrix_composition() {
    // Identity sheared by 0 => identity-like (pa=256, pd=256, pb=pc=0)
    const gbs::AffineMatrix shear0 = gbs::affine_shear_matrix(gbs::Fixed::zero(), gbs::Fixed::zero());
    assert(shear0.pa == 256);
    assert(shear0.pd == 256);
    assert(shear0.pb == 0);
    assert(shear0.pc == 0);

    // X shear of 128 (0.5): pb = 128
    const gbs::AffineMatrix shear_x = gbs::affine_shear_matrix(gbs::Fixed::from_raw(128), gbs::Fixed::zero());
    assert(shear_x.pb == 128);
    assert(shear_x.pc == 0);

    // Y shear of 256 (1.0): pc = 256
    const gbs::AffineMatrix shear_y = gbs::affine_shear_matrix(gbs::Fixed::zero(), gbs::Fixed::from_raw(256));
    assert(shear_y.pc == 256);
    assert(shear_y.pb == 0);

    // Compose identity with itself stays identity
    const gbs::AffineMatrix composed = gbs::compose_affine_matrices(
        gbs::identity_affine_matrix(),
        gbs::identity_affine_matrix()
    );
    assert(composed.pa == 256);
    assert(composed.pd == 256);
    assert(composed.pb == 0);
    assert(composed.pc == 0);
}

void test_shear_with_rotation_scale() {
    gbs::AffineMatrix m;
    // scale 2x, no rotation, no shear
    assert(gbs::build_affine_matrix_with_shear(
        m,
        0,
        gbs::Fixed::from_int(2),
        gbs::Fixed::from_int(2),
        gbs::Fixed::zero(),
        gbs::Fixed::zero()
    ));
    // inverse mapping: scale 2x -> matrix has 128 (=1/2)
    assert(m.pa == 128);
    assert(m.pd == 128);

    // With X shear 256 applied to a 1x scale, pb becomes nonzero
    assert(gbs::build_affine_matrix_with_shear(
        m,
        0,
        gbs::Fixed::one(),
        gbs::Fixed::one(),
        gbs::Fixed::from_raw(256),
        gbs::Fixed::zero()
    ));
    // shear * identity-rotation-scale => pb = shear_x * pa_identity(256)/256 = 256
    assert(m.pa == 256);
    assert(m.pb == 256);

    // Invalid scale rejected
    assert(!gbs::build_affine_matrix_with_shear(
        m,
        0,
        gbs::Fixed::zero(),
        gbs::Fixed::one(),
        gbs::Fixed::zero(),
        gbs::Fixed::zero()
    ));
}

int main() {
    test_fixed_arithmetic_preserves_q8_8_scale();
    test_trigonometry_uses_gba_angle_units();
    test_atan2_returns_full_turn_angles();
    test_fixed_sqrt_is_safe_for_negative_values();
    test_affine_matrix_matches_gba_inverse_mapping();
    test_affine_transform_keeps_explicit_anchor_stable();
    test_affine_keyframes_interpolate_without_float();
    test_affine_keyframes_reject_invalid_order_without_mutating_output();
    test_shear_matrix_composition();
    test_shear_with_rotation_scale();
    return 0;
}
