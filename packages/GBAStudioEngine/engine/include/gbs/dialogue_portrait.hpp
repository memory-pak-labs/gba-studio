#pragma once

#include "gbs/dialogue.hpp"
#include "gbs/render.hpp"

namespace gbs {

// Draw after gameplay/HUD sprites so every modal uses the reserved portrait
// OAM range and the same visibility, side and placement rules.
inline void draw_dialogue_portrait(const DialogueState& state) {
    if (!dialogue_should_show_portrait(state)) return;
    const MetaSprite* portrait = dialogue_portrait_metasprite(state.portrait);
    if (portrait == nullptr || !is_valid_metasprite(*portrait)) return;
    set_metasprite(dialogue_portrait_oam_index, *portrait, dialogue_portrait_position_pixels(state));
}

} // namespace gbs
