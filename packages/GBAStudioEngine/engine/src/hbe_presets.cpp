#include "gbs/hbe_presets.hpp"
#include "gbs/math.hpp"

namespace gbs {

namespace {

// Water ripple callback: applies sine displacement to BG scroll X.
struct WaterRippleState {
    BackgroundLayer layer;
    int16_t amplitude;
    uint16_t wavelength;
    Angle phase_offset;
    int16_t base_scroll_x;
};

bool water_ripple_callback(uint16_t scanline, HbeValue* out_value, void* user_data) {
    const auto* state = static_cast<WaterRippleState*>(user_data);
    const Angle phase = static_cast<Angle>(
        state->phase_offset +
        static_cast<Angle>((static_cast<uint32_t>(scanline) << 16) / state->wavelength)
    );
    const int16_t displacement = static_cast<int16_t>(
        (fixed_sin(phase).raw() * state->amplitude) >> 8
    );
    out_value->i32 = state->base_scroll_x + displacement;
    return true; // keep active
}

// Wave distortion callback: applies sine displacement to OBJ Y.
struct WaveDistortionState {
    uint8_t sprite_index;
    int16_t amplitude;
    uint16_t wavelength;
    Angle phase_offset;
    int16_t base_y;
};

bool wave_distortion_callback(uint16_t scanline, HbeValue* out_value, void* user_data) {
    const auto* state = static_cast<WaveDistortionState*>(user_data);
    const Angle phase = static_cast<Angle>(
        state->phase_offset +
        static_cast<Angle>((static_cast<uint32_t>(scanline) << 16) / state->wavelength)
    );
    const int16_t displacement = static_cast<int16_t>(
        (fixed_sin(phase).raw() * state->amplitude) >> 8
    );
    out_value->i32 = state->base_y + displacement;
    return true;
}

// Mode 7 callback: per-scanline affine PA/PB/PC/PD for rotation+scale.
struct Mode7State {
    BackgroundLayer layer;
    uint16_t horizon_line;
    int16_t base_scale;
    int16_t scale_step;
    Angle rotation;
    int32_t ref_x;
    int32_t ref_y;
};

bool mode7_pa_callback(uint16_t scanline, HbeValue* out_value, void* user_data) {
    const auto* state = static_cast<Mode7State*>(user_data);
    if (scanline < state->horizon_line || scanline >= hbe_screen_height) {
        out_value->i32 = 0;
        return true;
    }
    const uint16_t rel = scanline - state->horizon_line;
    const int32_t scale = state->base_scale + state->scale_step * rel;
    const Fixed cos_val = fixed_cos(state->rotation);
    out_value->i32 = static_cast<int32_t>((cos_val.raw() * scale) >> 8);
    return true;
}

bool mode7_pb_callback(uint16_t scanline, HbeValue* out_value, void* user_data) {
    const auto* state = static_cast<Mode7State*>(user_data);
    if (scanline < state->horizon_line || scanline >= hbe_screen_height) {
        out_value->i32 = 0;
        return true;
    }
    const uint16_t rel = scanline - state->horizon_line;
    const int32_t scale = state->base_scale + state->scale_step * rel;
    const Fixed sin_val = fixed_sin(state->rotation);
    out_value->i32 = static_cast<int32_t>((sin_val.raw() * scale) >> 8);
    return true;
}

bool mode7_pc_callback(uint16_t scanline, HbeValue* out_value, void* user_data) {
    const auto* state = static_cast<Mode7State*>(user_data);
    if (scanline < state->horizon_line || scanline >= hbe_screen_height) {
        out_value->i32 = 0;
        return true;
    }
    const uint16_t rel = scanline - state->horizon_line;
    const int32_t scale = state->base_scale + state->scale_step * rel;
    const Fixed sin_val = fixed_sin(state->rotation);
    out_value->i32 = static_cast<int32_t>((-sin_val.raw() * scale) >> 8);
    return true;
}

bool mode7_pd_callback(uint16_t scanline, HbeValue* out_value, void* user_data) {
    const auto* state = static_cast<Mode7State*>(user_data);
    if (scanline < state->horizon_line || scanline >= hbe_screen_height) {
        out_value->i32 = 0;
        return true;
    }
    const uint16_t rel = scanline - state->horizon_line;
    const int32_t scale = state->base_scale + state->scale_step * rel;
    const Fixed cos_val = fixed_cos(state->rotation);
    out_value->i32 = static_cast<int32_t>((cos_val.raw() * scale) >> 8);
    return true;
}

bool mode7_refx_callback(uint16_t scanline, HbeValue* out_value, void* user_data) {
    const auto* state = static_cast<Mode7State*>(user_data);
    out_value->i32 = state->ref_x;
    return scanline < hbe_screen_height;
}

bool mode7_refy_callback(uint16_t scanline, HbeValue* out_value, void* user_data) {
    const auto* state = static_cast<Mode7State*>(user_data);
    if (scanline < state->horizon_line || scanline >= hbe_screen_height) {
        out_value->i32 = state->ref_y;
        return true;
    }
    const uint16_t rel = scanline - state->horizon_line;
    out_value->i32 = state->ref_y + (static_cast<int32_t>(rel) << 8);
    return true;
}

// CRT scanline callback: alternates blend alpha per scanline.
struct CrtScanlineState {
    uint8_t dark_alpha;
    uint8_t bright_alpha;
};

bool crt_scanline_callback(uint16_t scanline, HbeValue* out_value, void* user_data) {
    const auto* state = static_cast<CrtScanlineState*>(user_data);
    const bool is_bright = (scanline & 1) == 0;
    out_value->i32 = is_bright ? state->bright_alpha : state->dark_alpha;
    return true;
}

// Static storage for preset states (max 8 concurrent presets).
constexpr size_t max_preset_states = 8;
// Use the largest preset state size for the pool slots.
constexpr size_t max_state_size =
    sizeof(Mode7State) > sizeof(WaterRippleState) ? sizeof(Mode7State) : sizeof(WaterRippleState);
constexpr size_t state_size = max_state_size > sizeof(WaveDistortionState) ? max_state_size : sizeof(WaveDistortionState);
uint8_t preset_state_pool[max_preset_states][state_size] = {};
bool preset_state_used[max_preset_states] = {};

void* alloc_preset_state(size_t size) {
    for (size_t i = 0; i < max_preset_states; ++i) {
        if (!preset_state_used[i] && size <= state_size) {
            preset_state_used[i] = true;
            return preset_state_pool[i];
        }
    }
    return nullptr;
}

} // namespace

uint8_t hbe_create_water_ripple(const WaterRippleConfig& config) {
    auto* state = static_cast<WaterRippleState*>(
        alloc_preset_state(sizeof(WaterRippleState))
    );
    if (state == nullptr) return 0;
    *state = WaterRippleState {
        config.layer,
        config.amplitude,
        config.wavelength,
        config.phase_offset,
        config.base_scroll_x
    };
    HbeEffect effect;
    effect.target = hbe_target_bg_position_x(config.layer);
    effect.priority = HbePriority::Normal;
    effect.callback = water_ripple_callback;
    effect.user_data = state;
    return hbe_register(effect);
}

uint8_t hbe_create_wave_distortion(const WaveDistortionConfig& config) {
    auto* state = static_cast<WaveDistortionState*>(
        alloc_preset_state(sizeof(WaveDistortionState))
    );
    if (state == nullptr) return 0;
    *state = WaveDistortionState {
        config.sprite_index,
        config.amplitude,
        config.wavelength,
        config.phase_offset,
        config.base_y
    };
    HbeEffect effect;
    effect.target = HbeTarget { HbeType::ObjPositionY, config.sprite_index, 0 };
    effect.priority = HbePriority::Normal;
    effect.callback = wave_distortion_callback;
    effect.user_data = state;
    return hbe_register(effect);
}

uint8_t hbe_create_mode7(const Mode7Config& config) {
    auto* state = static_cast<Mode7State*>(
        alloc_preset_state(sizeof(Mode7State))
    );
    if (state == nullptr) return 0;
    *state = Mode7State {
        config.layer,
        config.horizon_line,
        config.base_scale,
        config.scale_step,
        config.rotation,
        config.ref_x,
        config.ref_y
    };

    // Register 5 effects: PA, PB, PC, PD, RefX, RefY
    uint8_t handle_pa = 0;
    {
        HbeEffect e;
        e.target = hbe_target_bg_affine(config.layer, HbeType::BgAffinePa);
        e.priority = HbePriority::Normal;
        e.callback = mode7_pa_callback;
        e.user_data = state;
        handle_pa = hbe_register(e);
    }
    {
        HbeEffect e;
        e.target = hbe_target_bg_affine(config.layer, HbeType::BgAffinePb);
        e.priority = HbePriority::Normal;
        e.callback = mode7_pb_callback;
        e.user_data = state;
        hbe_register(e);
    }
    {
        HbeEffect e;
        e.target = hbe_target_bg_affine(config.layer, HbeType::BgAffinePc);
        e.priority = HbePriority::Normal;
        e.callback = mode7_pc_callback;
        e.user_data = state;
        hbe_register(e);
    }
    {
        HbeEffect e;
        e.target = hbe_target_bg_affine(config.layer, HbeType::BgAffinePd);
        e.priority = HbePriority::Normal;
        e.callback = mode7_pd_callback;
        e.user_data = state;
        hbe_register(e);
    }
    {
        HbeEffect e;
        e.target = hbe_target_bg_affine(config.layer, HbeType::BgAffineRefX);
        e.priority = HbePriority::Normal;
        e.callback = mode7_refx_callback;
        e.user_data = state;
        hbe_register(e);
    }
    {
        HbeEffect e;
        e.target = hbe_target_bg_affine(config.layer, HbeType::BgAffineRefY);
        e.priority = HbePriority::Normal;
        e.callback = mode7_refy_callback;
        e.user_data = state;
        hbe_register(e);
    }
    return handle_pa;
}

uint8_t hbe_create_crt_scanline(const CrtScanlineConfig& config) {
    auto* state = static_cast<CrtScanlineState*>(
        alloc_preset_state(sizeof(CrtScanlineState))
    );
    if (state == nullptr) return 0;
    *state = CrtScanlineState { config.dark_alpha, config.bright_alpha };
    HbeEffect effect;
    effect.target = HbeTarget { HbeType::BlendEva, 0, 0 };
    effect.priority = HbePriority::Low;
    effect.callback = crt_scanline_callback;
    effect.user_data = state;
    return hbe_register(effect);
}

} // namespace gbs