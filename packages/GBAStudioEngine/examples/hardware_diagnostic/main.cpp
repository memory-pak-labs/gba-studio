#include "gbs/engine.hpp"
#include "gbs/audio.hpp"
#include "gbs/render.hpp"

namespace {
constexpr gbs::SaveBank bank { 0, 256, 1, gbs::make_save_signature('G','B','D','G'), 1 };
constexpr gbs::SfxTone tones[] {{ 440, 12, 10, 2, false }, { 880, 12, 10, 2, false }};
constexpr gbs::SfxAsset sound { tones, 2 };
constexpr uint32_t save_pattern = 0x47534244;
struct DiagnosticResult { uint32_t magic; uint32_t frames; uint32_t seen_buttons; uint32_t audio_requests; uint32_t save_writes; uint32_t save_read_ok; };
volatile DiagnosticResult diagnostic_result { 0x47534447, 0, 0, 0, 0, 0 };
void hex4(uint16_t value, char (&text)[5]) {
    for (int i = 0; i < 4; ++i) text[i] = "0123456789ABCDEF"[(value >> ((3-i)*4)) & 15];
    text[4] = 0;
}
}
extern "C" int gbs_main() {
    gbs::init(); gbs::render_init();
    uint32_t stored = 0;
    diagnostic_result.save_read_ok = gbs::read_save_slot(bank, 0, &stored, sizeof(stored)) == gbs::SaveStatus::Ok && stored == save_pattern;
    for (;;) {
        const auto input = gbs::poll_input();
        diagnostic_result.seen_buttons |= input.pressed;
        if (input.was_pressed(gbs::ButtonR)) { gbs::play_sfx(sound); ++diagnostic_result.audio_requests; }
        if (input.was_pressed(gbs::ButtonA) && input.is_held(gbs::ButtonStart)) {
            const auto status = gbs::write_save_slot(bank, 0, &save_pattern, sizeof(save_pattern), diagnostic_result.save_writes + 1);
            if (status == gbs::SaveStatus::Ok) ++diagnostic_result.save_writes;
            stored = 0;
            diagnostic_result.save_read_ok = gbs::read_save_slot(bank, 0, &stored, sizeof(stored)) == gbs::SaveStatus::Ok && stored == save_pattern;
        }
        const unsigned phase = (diagnostic_result.frames / 120) % 3;
        gbs::set_backdrop_color(phase == 0 ? gbs::rgb15(31,0,0) : phase == 1 ? gbs::rgb15(0,31,0) : gbs::rgb15(0,0,31));
        gbs::draw_text_at(1, 1, 28, "GBA STUDIO HARDWARE TEST");
        gbs::draw_text_at(1, 3, 28, "RGB CYCLE / 240x160");
        gbs::draw_text_at(1, 5, 28, "BUTTONS: ALL = 03FF");
        char keys[5]; hex4(static_cast<uint16_t>(diagnostic_result.seen_buttons), keys);
        gbs::draw_text_at(1, 6, 28, keys);
        gbs::draw_text_at(1, 9, 28, "R: TWO AUDIO TONES");
        gbs::draw_text_at(1, 11, 28, "START+A: WRITE TEST SAVE");
        gbs::draw_text_at(1, 13, 28, diagnostic_result.save_read_ok ? "SAVE: READ VERIFIED" : "SAVE: EMPTY / UNVERIFIED");
        ++diagnostic_result.frames; gbs::wait_vblank();
    }
}
