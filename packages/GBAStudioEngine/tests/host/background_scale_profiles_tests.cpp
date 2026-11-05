#include <cassert>
#include "gbs/menu.hpp"
#include "gbs/cutscene.hpp"
#include "gbs/visual_novel.hpp"
#include "gbs/point_click.hpp"
#include "gbs/world_map.hpp"
#include "gbs/battle_rpg.hpp"
#include "gbs/luta.hpp"

int main() {
    // Each scene owns its prepared image; sharing an asset must not share its transform.
    gbs::MenuScreenData menu_a {}, menu_b {};
    menu_a.video.affine_enabled = true;
    assert(!menu_b.video.affine_enabled);
    assert(gbs::CutsceneSceneData{}.video.display_mode == gbs::DisplayMode::Mode0Text);
    assert(gbs::VisualNovelSceneData{}.video.display_mode == gbs::DisplayMode::Mode0Text);
    assert(gbs::PointClickSceneData{}.video.display_mode == gbs::DisplayMode::Mode0Text);
    assert(gbs::WorldMapProjectData{}.video.display_mode == gbs::DisplayMode::Mode0Text);
    assert(gbs::BattleRpgEncounterData{}.video.display_mode == gbs::DisplayMode::Mode0Text);
    assert(gbs::LutaStageData{}.video.display_mode == gbs::DisplayMode::Mode0Text);
}
