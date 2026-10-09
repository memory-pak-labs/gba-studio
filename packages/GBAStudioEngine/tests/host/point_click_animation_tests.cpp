#include <cassert>
#include "gbs/point_click.hpp"

int main() {
    static constexpr gbs::MetaSpritePart parts[] = { { -10, -7, 0, 0, false, false } };
    static constexpr gbs::SpriteAnimationFrame frames[] = {
        { { parts, 1 }, 5 }, { { parts, 1 }, 5 },
        { { parts, 1 }, 5 }, { { parts, 1 }, 5 }
    };
    static constexpr gbs::SpriteAnimation idle { frames, 1, false };
    static constexpr gbs::SpriteAnimation hover { frames, 2, true };
    static constexpr gbs::SpriteAnimation click { frames, 4, false };
    gbs::PointClickProjectData project {};
    project.cursor_idle_animation = &idle;
    project.cursor_hover_animation = &hover;
    project.cursor_click_animation = &click;
    gbs::SpriteAnimatorState cursor {};
    gbs::init_sprite_animator(cursor);
    gbs::update_point_click_cursor_animator(cursor, project, false, false);
    for (int tick = 0; tick < 90; ++tick)
        gbs::update_point_click_cursor_animator(cursor, project, false, false);
    assert(cursor.animation == &idle && cursor.frame_index == 0);
    gbs::update_point_click_cursor_animator(cursor, project, true, false);
    assert(cursor.animation == &hover);
    gbs::update_point_click_cursor_animator(cursor, project, false, true);
    assert(cursor.animation == &click && cursor.frame_index == 0);
    for (int tick = 0; tick < 5; ++tick)
        gbs::update_point_click_cursor_animator(cursor, project, true, false);
    assert(cursor.animation == &click && cursor.frame_index == 1);
    for (int tick = 0; tick < 10; ++tick)
        gbs::update_point_click_cursor_animator(cursor, project, false, false);
    assert(cursor.animation == &click && cursor.frame_index == 3);
    for (int tick = 0; tick < 5; ++tick)
        gbs::update_point_click_cursor_animator(cursor, project, true, false);
    assert(cursor.animation == &hover && cursor.frame_index == 0);
    project.cursor_hover_animation = nullptr;
    project.cursor_click_animation = nullptr;
    gbs::update_point_click_cursor_animator(cursor, project, true, true);
    assert(cursor.animation == &idle);
}
