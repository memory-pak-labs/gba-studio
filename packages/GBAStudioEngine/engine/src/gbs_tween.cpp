#include "gbs/tween.hpp"
#include "gbs/math.hpp"

namespace gbs {

namespace {

// EaseOutBounce in Q8.8. Constants: n1 = 7.5625 (Q8.8 1936), d1 = 2.75 (Q8.8 704).
Fixed bounce_out_progress(Fixed t) {
    const int64_t t_q8 = t.raw();
    const int64_t n1 = 1936; // 7.5625 << 8
    int64_t x;
    int64_t offset;
    if (t_q8 < 93) {          // t < 1/2.75
        x = t_q8;
        offset = 0;
    } else if (t_q8 < 186) {  // t < 2/2.75
        x = t_q8 - 140;       // t - 1.5/2.75
        offset = 192;         // +0.75
    } else if (t_q8 < 233) {  // t < 2.5/2.75
        x = t_q8 - 210;       // t - 2.25/2.75
        offset = 240;         // +0.9375
    } else {
        x = t_q8 - 244;       // t - 2.625/2.75
        offset = 252;         // +0.984375
    }
    if (x < 0) {
        x = 0;
    }
    int64_t result = (n1 * x * x) / 65536 + offset;
    if (result < 0) result = 0;
    if (result > 256) result = 256;
    return Fixed::from_raw(static_cast<int32_t>(result));
}

} // namespace

Fixed tween_progress(uint16_t elapsed_frames, uint16_t duration_frames, Easing easing) {
    if (duration_frames == 0 || elapsed_frames >= duration_frames) {
        return Fixed::one();
    }
    const Fixed t = Fixed::from_ratio(elapsed_frames, duration_frames);
    const Fixed one_minus_t = Fixed::one() - t;
    switch (easing) {
    case Easing::Linear:
        return t;
    case Easing::EaseIn:
        return t * t;
    case Easing::EaseOut:
        return Fixed::one() - one_minus_t * one_minus_t;
    case Easing::EaseInOut:
        if (t < Fixed::from_ratio(1, 2)) {
            return Fixed::from_int(2) * t * t;
        }
        return Fixed::one() - (Fixed::from_int(2) * one_minus_t * one_minus_t);
    case Easing::Sine: {
        // sin(t * 90 degrees), scaled to [0,1].
        const Angle angle = static_cast<Angle>(
            (static_cast<uint32_t>(t.raw()) * angle_quarter_turn) / 256u
        );
        return Fixed::from_raw(fixed_sin(angle).raw());
    }
    case Easing::EaseInBack: {
        const Fixed c1 = Fixed::from_raw(tween_back_overshoot_q8);
        const Fixed c3 = c1 + Fixed::one();
        const Fixed t2 = t * t;
        return c3 * t2 * t - c1 * t2;
    }
    case Easing::EaseOutBack: {
        const Fixed c1 = Fixed::from_raw(tween_back_overshoot_q8);
        const Fixed c3 = c1 + Fixed::one();
        const Fixed t2 = one_minus_t * one_minus_t;
        return Fixed::one() + c3 * t2 * one_minus_t + c1 * t2;
    }
    case Easing::EaseInOutBack: {
        // Standard formula with c1 = 1.70158 (Q8.8 436) and c2 = c1 * 1.525 (Q8.8 665).
        const Fixed c2 = Fixed::from_raw(665); // 2.59765625
        if (t < Fixed::from_ratio(1, 2)) {
            const Fixed t2 = Fixed::from_int(2) * t;
            const Fixed s = t2 * t2;
            return s * ((c2 + Fixed::one()) * t2 - c2) / Fixed::from_int(2);
        }
        const Fixed u = Fixed::from_int(2) * t - Fixed::from_int(2);
        const Fixed su = u * u;
        return (su * ((c2 + Fixed::one()) * u + c2)) / Fixed::from_int(2) + Fixed::from_int(1);
    }
    case Easing::EaseInBounce: {
        const Fixed inv = Fixed::one() - bounce_out_progress(Fixed::one() - t);
        return inv;
    }
    case Easing::EaseOutBounce:
        return bounce_out_progress(t);
    }
    return t;
}

Fixed tween_value(Fixed from, Fixed to, uint16_t elapsed_frames, uint16_t duration_frames, Easing easing) {
    return from + (to - from) * tween_progress(elapsed_frames, duration_frames, easing);
}

} // namespace gbs