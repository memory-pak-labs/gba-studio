#pragma once

#include <stdint.h>
#include "gbs/audio_engine.hpp"
#include "gbs/battle_rpg.hpp"
#include "gbs/bios.hpp"
#include "gbs/containers.hpp"
#include "gbs/cutscene.hpp"
#include "gbs/debug.hpp"
#include "gbs/deferred_work.hpp"
#include "gbs/dungeon_crawler.hpp"
#include "gbs/frame.hpp"
#include "gbs/format.hpp"
#include "gbs/hbe_presets.hpp"
#include "gbs/input.hpp"
#include "gbs/input_advanced.hpp"
#include "gbs/info.hpp"
#include "gbs/isometric.hpp"
#include "gbs/math.hpp"
#include "gbs/menu.hpp"
#include "gbs/platformer.hpp"
#include "gbs/point_click.hpp"
#include "gbs/pseudo_3d.hpp"
#include "gbs/racing.hpp"
#include "gbs/random.hpp"
#include "gbs/rumble.hpp"
#include "gbs/runtime_capabilities.hpp"
#include "gbs/runtime_save_restore.hpp"
#include "gbs/rtc.hpp"
#include "gbs/save.hpp"
#include "gbs/shmup.hpp"
#include "gbs/tween.hpp"
#include "gbs/typewriter.hpp"
#include "gbs/visual_novel.hpp"
#include "gbs/world_map.hpp"

namespace gbs {

void init();
void wait_vblank();
// Hide the current display while a new runtime rebuilds its VRAM/OAM state.
// Publication resumes on a VBlank after the staged resource uploads finish.
void begin_runtime_handoff();
// Keep the currently presented frame visible until queued VRAM resources are
// fully uploaded. The next VBlank publishes the staged render state.
void begin_render_publication_transaction();
bool render_publication_transaction_active();
void set_backdrop_color(uint16_t rgb15);
uint16_t backdrop_color();
uint32_t frame_count();

// Access the global deferred work queue (for ISR → main loop deferral).
DeferredWorkQueue& deferred_work_queue();

// Access the global key-repeat tracker, advanced once per frame from the
// polled input. Games read `repeated` for menu navigation and combos.
InputRepeatState& input_repeat_state();

constexpr uint16_t rgb15(int r, int g, int b) {
    return static_cast<uint16_t>((r & 31) | ((g & 31) << 5) | ((b & 31) << 10));
}

} // namespace gbs

extern "C" int gbs_main();
