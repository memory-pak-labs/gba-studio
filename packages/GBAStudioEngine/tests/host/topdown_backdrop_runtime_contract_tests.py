#!/usr/bin/env python3
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
TOPDOWN_RUNTIME = ROOT / "examples" / "topdown_basic" / "src" / "main.cpp"


def function_body(source: str, name: str) -> str:
    needle = f"{name}("
    start = source.index(needle)
    opening = source.index("{", start)
    semicolon = source.find(";", start, opening)
    if semicolon >= 0:
        start = source.index(needle, start + len(needle))
        opening = source.index("{", start)
    depth = 0
    for index in range(opening, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[opening : index + 1]
    raise AssertionError(f"corpo incompleto para {name}")


class TopdownBackdropRuntimeContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = TOPDOWN_RUNTIME.read_text(encoding="utf-8")

    def test_room_palette_zero_is_captured_before_optional_explicit_backdrop(self) -> None:
        body = function_body(self.source, "apply_room_metadata")

        capture = "room_backdrop_color = room_palette_backdrop_color(room_data);"
        explicit_guard = "if (room_data.metadata.has_backdrop_color)"
        explicit_value = "room_backdrop_color = room_data.metadata.backdrop_color;"
        apply_value = "gbs::set_backdrop_color(room_backdrop_color);"
        self.assertIn(capture, body)
        self.assertIn(explicit_guard, body)
        self.assertIn(explicit_value, body)
        self.assertIn(apply_value, body)
        self.assertLess(body.index(capture), body.index(explicit_guard))
        self.assertLess(body.index(explicit_guard), body.index(apply_value))

    def test_player_effects_restore_captured_room_backdrop(self) -> None:
        body = function_body(self.source, "backdrop_color_for_player_effects")

        self.assertIn("return room_backdrop_color;", body)
        self.assertNotIn("backdrop_color_for_room", body)

    def test_streamed_room_uses_the_uploaded_palette_zero(self) -> None:
        body = function_body(self.source, "room_palette_backdrop_color")

        self.assertIn("gbs::ResourcePoolKind::BgPalette", body)
        self.assertIn("bank.start != 0", body)
        self.assertIn("return gbs::backdrop_color();", body)
        self.assertNotIn("resource_bank_upload_source_by_name", body)
        self.assertNotIn("static_cast<const uint16_t*>(source)[0]", body)

    def test_streamed_room_keeps_the_engine_on_4bpp_after_a_successful_swap(self) -> None:
        body = function_body(self.source, "bool stream_resources_for_room")

        self.assertNotIn("set_bg_bits_per_pixel", body)
        self.assertNotIn("background_bits_per_pixel", body)

    def test_streamed_rooms_load_only_the_active_visual_tilemap(self) -> None:
        body = function_body(self.source, "load_project_assets")

        stream_guard = "if (!assets_are_streamed) {"
        background_loop = "for (size_t index = 0; index < project.background_count; ++index) {"
        active_visual_guard = "if (room_data.uses_visual_tilemap && room_data.visual_tilemap != nullptr) {"
        active_visual_load = "load_active_room_visual_tilemap();"

        self.assertEqual(body.count(background_loop), 1)
        self.assertIn(stream_guard, body)
        self.assertIn(active_visual_guard, body)
        self.assertIn(active_visual_load, body)
        self.assertLess(body.index(active_visual_guard), body.index(active_visual_load))
        self.assertLess(body.index(active_visual_load), body.index(background_loop))

    def test_active_visual_tilemap_is_reloaded_after_room_streaming(self) -> None:
        self.assertIn("void load_active_room_visual_tilemap()", self.source)
        self.assertIn("gbs::load_palette(*room_data.visual_palette, false);", self.source)
        self.assertIn("gbs::load_tiles(*room_data.visual_tile_asset);", self.source)
        self.assertIn("gbs::load_tilemap(gbs::BackgroundLayer::BG2, *room_data.visual_tilemap);", self.source)
        for function_name in ("restore_runtime_state", "apply_warp"):
            body = function_body(self.source, function_name)
            self.assertIn("load_active_room_visual_tilemap();", body)
            self.assertIn("apply_active_room_video();", body)
            self.assertIn("configure_dialogue_ui_for_active_room();", body)
            self.assertIn("reset_active_room_visual_tiles();", body)
            self.assertLess(
                body.index("load_active_room_visual_tilemap();"),
                body.index("reset_active_room_visual_tiles();"),
            )

    def test_static_visual_tilemap_does_not_prefetch_other_room_assets(self) -> None:
        body = function_body(self.source, "void prefetch_room_resource_groups")

        self.assertIn("const gbs::TopDownRoomData& active_room_data = project.rooms[active_room];", body)
        self.assertIn("if (active_room_data.uses_visual_tilemap || affine_room) {", body)
        self.assertIn("return;", body)
        self.assertLess(
            body.index("if (active_room_data.uses_visual_tilemap || affine_room) {"),
            body.index("const gbs::ResourceBankUploadSource* upload_sources"),
        )

    def test_affine_room_does_not_prefetch_other_room_assets(self) -> None:
        body = function_body(self.source, "void prefetch_room_resource_groups")

        self.assertIn(
            "const bool affine_room = active_room_data.video.affine_enabled || project.video.affine_enabled;",
            body,
        )
        self.assertIn(
            "if (active_room_data.uses_visual_tilemap || affine_room) {",
            body,
        )
        self.assertLess(
            body.index("if (active_room_data.uses_visual_tilemap || affine_room) {"),
            body.index("const gbs::ResourceBankUploadSource* upload_sources"),
        )

    def test_affine_room_does_not_let_ui_skins_overwrite_the_affine_palette(self) -> None:
        body = function_body(self.source, "void configure_dialogue_ui_for_active_room")

        self.assertIn(
            "const bool affine_room = active_room_data.video.affine_enabled || project.video.affine_enabled;",
            body,
        )
        self.assertIn("gbs::configure_dialogue_box_skin(nullptr);", body)
        self.assertIn("gbs::configure_hud_box_skin(nullptr);", body)
        self.assertIn("gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, !affine_room);", body)
        self.assertIn("apply_active_room_video();", body)
        self.assertLess(
            body.index("gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, !affine_room);"),
            body.index("if (!force && configured_dialogue_ui_room == current_room"),
        )
        self.assertLess(
            body.index("gbs::configure_dialogue_box_skin(nullptr);"),
            body.index("apply_active_room_video();"),
        )
        self.assertLess(
            body.index("gbs::configure_hud_box_skin(nullptr);"),
            body.index("apply_active_room_video();"),
        )

    def test_topdown_enables_the_ground_bg2_layer(self) -> None:
        body = function_body(self.source, "configure_hardware_core")

        self.assertIn("gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, true);", body)

    def test_static_visual_tilemap_is_not_overwritten_by_authored_room_tiles(self) -> None:
        body = function_body(self.source, "render_topdown_runtime")

        guard = "if (!active_room_data.uses_visual_tilemap && !affine_room) {"
        background_draw = "gbs::draw_room_to_bg(gbs::BackgroundLayer::BG2, active_room_visual_tiles()"

        self.assertIn(guard, body)
        self.assertIn(background_draw, body)
        self.assertGreater(body.index(background_draw), body.index(guard))

    def test_static_visual_tilemap_uses_integral_camera_scroll(self) -> None:
        body = function_body(self.source, "render_topdown_runtime")

        self.assertIn(
            "const bool affine_room = active_room_data.video.affine_enabled || project.video.affine_enabled;",
            body,
        )
        self.assertIn(
            "const int bg2_scroll_x = affine_room ? 0 : (active_room_data.uses_visual_tilemap ? render_camera.x : (render_camera.x & 7));",
            body,
        )
        self.assertIn(
            "const int bg2_scroll_y = affine_room ? 0 : (active_room_data.uses_visual_tilemap ? render_camera.y : (render_camera.y & 7));",
            body,
        )
        self.assertIn(
            "gbs::set_bg_scroll(gbs::BackgroundLayer::BG2, bg2_scroll_x, bg2_scroll_y);",
            body,
        )

    def test_static_visual_tilemap_disables_the_dynamic_foreground_layer(self) -> None:
        body = function_body(self.source, "render_topdown_runtime")

        self.assertIn(
            "gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, !active_room_data.uses_visual_tilemap && !affine_room);",
            body,
        )
        foreground_draw = "gbs::draw_room_to_bg(gbs::BackgroundLayer::BG1, project.rooms[current_room].foreground_tiles"
        guard = "if (!active_room_data.uses_visual_tilemap && !affine_room) {"
        self.assertIn(foreground_draw, body)
        self.assertGreater(body.index(foreground_draw), body.index(guard))

if __name__ == "__main__":
    unittest.main()
