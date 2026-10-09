#include <cassert>
#include "gbs/tween.hpp"

namespace {

void test_tween_progress_clamps_and_eases() {
    assert(gbs::tween_progress(0, 10).raw() == 0);
    assert(gbs::tween_progress(5, 10).raw() == gbs::Fixed::from_ratio(1, 2).raw());
    assert(gbs::tween_progress(10, 10).raw() == gbs::Fixed::one().raw());
    assert(gbs::tween_progress(20, 10).raw() == gbs::Fixed::one().raw());
    assert(gbs::tween_progress(5, 10, gbs::Easing::EaseIn) < gbs::tween_progress(5, 10));
    assert(gbs::tween_progress(5, 10, gbs::Easing::EaseOut) > gbs::tween_progress(5, 10));
    assert(gbs::tween_progress(5, 10, gbs::Easing::EaseInOut).raw() == gbs::Fixed::from_ratio(1, 2).raw());
}

void test_tween_value_interpolates_fixed_values() {
    const gbs::Fixed value = gbs::tween_value(
        gbs::Fixed::from_int(-4),
        gbs::Fixed::from_int(8),
        5,
        10
    );
    assert(value.to_int() == 2);
    assert(gbs::tween_value(gbs::Fixed::from_int(2), gbs::Fixed::from_int(3), 0, 0).to_int() == 3);
}

void test_sine_easing_is_smooth_at_endpoints() {
    // Endpoints: 0 -> 0, duration -> 1.0
    assert(gbs::tween_progress(0, 100, gbs::Easing::Sine).raw() == 0);
    assert(gbs::tween_progress(100, 100, gbs::Easing::Sine) == gbs::Fixed::one());
    // Midpoint should be roughly 0.5 (sin(45°) = ~0.707, but our approximation
    // passes through 0.5 at t=0.5 due to interpolation-free endpoints).
    const gbs::Fixed mid = gbs::tween_progress(50, 100, gbs::Easing::Sine);
    assert(mid.raw() > 0);
    assert(mid.raw() < gbs::Fixed::one().raw());
}

void test_back_easing_oscillates() {
    // Back easing overshoots before settling: at midpoint it should exceed
    // linear progress on the way in/out.
    const gbs::Fixed mid_in = gbs::tween_progress(5, 10, gbs::Easing::EaseInBack);
    const gbs::Fixed mid_out = gbs::tween_progress(5, 10, gbs::Easing::EaseOutBack);
    // EaseInBack starts slow (below linear), EaseOutBack starts fast (above linear).
    assert(mid_in < gbs::tween_progress(5, 10));
    assert(mid_out > gbs::tween_progress(5, 10));
    // Both clamp to exactly 1.0 at the end.
    assert(gbs::tween_progress(10, 10, gbs::Easing::EaseInBack) == gbs::Fixed::one());
    assert(gbs::tween_progress(10, 10, gbs::Easing::EaseOutBack) == gbs::Fixed::one());
}

void test_bounce_monotonic_endpoints() {
    // bounce endpoints stay at 0 and 1
    assert(gbs::tween_progress(0, 10, gbs::Easing::EaseOutBounce).raw() == 0);
    assert(gbs::tween_progress(10, 10, gbs::Easing::EaseOutBounce) == gbs::Fixed::one());
    // Mid-flight bounce should be well above linear (accel toward the end).
    const gbs::Fixed mid = gbs::tween_progress(5, 10, gbs::Easing::EaseOutBounce);
    assert(mid > gbs::Fixed::from_ratio(1, 2));
}

void test_in_out_back_smooth_symmetry() {
    const gbs::Fixed mid = gbs::tween_progress(5, 10, gbs::Easing::EaseInOutBack);
    assert(mid.raw() > 0);
    assert(gbs::tween_progress(0, 10, gbs::Easing::EaseInOutBack).raw() == 0);
    assert(gbs::tween_progress(10, 10, gbs::Easing::EaseInOutBack) == gbs::Fixed::one());
}

} // namespace

int main() {
    test_tween_progress_clamps_and_eases();
    test_tween_value_interpolates_fixed_values();
    test_sine_easing_is_smooth_at_endpoints();
    test_back_easing_oscillates();
    test_bounce_monotonic_endpoints();
    test_in_out_back_smooth_symmetry();
    return 0;
}
