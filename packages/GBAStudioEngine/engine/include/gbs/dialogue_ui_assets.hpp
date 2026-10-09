#pragma once

#include "gbs/dialogue.hpp"

namespace gbastudio_dialogue_ui {
constexpr const gbs::DialogueBoxSkin* hud_box_skin = nullptr;
constexpr gbs::HudBoxConfig hud_box_config = gbs::default_hud_box_config();

static inline void configure() {
    gbs::configure_dialogue_box_skin(nullptr);
    gbs::configure_hud_box_skin(hud_box_skin);
    gbs::configure_hud_box(hud_box_config);
    gbs::configure_dialogue_choice_selector(nullptr);
}

static inline void configure_for_scene(const char* scene_name, bool force = false) {
    (void)scene_name;
    (void)force;
    configure();
}

static inline bool has_hud_scene_binding(const char* scene_name) {
    (void)scene_name;
    return false;
}

} // namespace gbastudio_dialogue_ui
