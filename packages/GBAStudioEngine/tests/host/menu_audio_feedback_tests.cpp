#include <cassert>
#include "gbs/menu.hpp"

namespace {
int psg_calls = 0;
int pcm_calls = 0;
int last_volume = 0;
int last_priority = 0;
}
namespace gbs {
bool play_sfx(const SfxAsset&) { ++psg_calls; return true; }
bool play_pcm_sfx(const PcmAsset&, uint8_t priority, uint8_t volume) {
    ++pcm_calls; last_priority = priority; last_volume = volume; return true;
}
}
int main() {
    const int8_t samples[] = {0, 12, 0};
    const gbs::PcmAsset pcm[] = {{samples, 3, 31536, false}};
    const gbs::SfxTone tones[] = {{440, 6, 4, 2, false}};
    const gbs::SfxAsset sfx[] = {{tones, 1}};
    gbs::MenuProjectData project {};
    project.pcm_assets = pcm; project.pcm_asset_count = 1;
    project.sfx_assets = sfx; project.sfx_asset_count = 1;
    assert(gbs::is_valid_menu_audio_cue(project, {}));
    assert(!gbs::play_menu_audio_cue(project, {}));
    assert(gbs::play_menu_audio_cue(project, {0, true, 10, 8}));
    assert(pcm_calls == 1 && last_volume == 10 && last_priority == 8);
    assert(gbs::play_menu_audio_cue(project, {0, false, 15, 8}));
    assert(psg_calls == 1);
    assert(!gbs::play_menu_audio_cue(project, {1, true, 10, 8}));
    assert(!gbs::play_menu_audio_cue(project, {0, true, 16, 8}));
    assert(!gbs::is_valid_menu_audio_cue(project, {-2, true, 10, 8}));
    assert(pcm_calls == 1 && psg_calls == 1);
}
