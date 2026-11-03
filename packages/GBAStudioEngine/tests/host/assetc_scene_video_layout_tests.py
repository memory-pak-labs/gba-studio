"""Native renderer reservations: compiled resources, not PNG/catalog sizes."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("assetc_video_layout", ROOT / "tools/assetc/assetc.py")
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)


def compiled(kind="bg", name="background", resources=None, group="scene_test"):
    return {"id": name, "name": name, "kind": kind, "bank_group": group,
            "bank_groups": [group], "resources": resources or {}, "allocations": {}, "omitted": False}


def project(runtime, row=None, block=None):
    collections = {"menu": "screens", "cutscene": "scenes", "visual_novel": "scenes",
                   "point_click": "scenes", "battle_rpg": "encounters", "luta": "stages", "shmup": "waves"}
    native = {"name": "test", "resource_bank_group": "scene_test", **(row or {})}
    body = {collections.get(runtime, "rooms"): [native], **(block or {})}
    if runtime == "world_map":
        body = {"scene_name": "test", **(block or {})}
    return {"scene_contracts": [{"name": "test", "runtime_profile": runtime}], runtime + "_project": body}


class NativeSceneVideoLayoutTests(unittest.TestCase):
    def layout(self, p, allocations=()):
        return assetc.compiled_scene_video_layouts(p, {"allocations": list(allocations)})["plans"][0]

    def test_default_modes_for_all_native_runtimes(self):
        for runtime in assetc.EXPORT_PROJECT_BLOCKS.keys() - {"mixed"}:
            with self.subTest(runtime=runtime):
                self.assertEqual(self.layout(project(runtime))["display_mode"], 0)

    def test_regular_background_has_native_maps_and_reserved_ui_tiles(self):
        a = compiled(resources={"bg_tiles": 100, "tilemap_width": 64, "tilemap_height": 32})
        a["allocations"]["bg_tiles"] = {"start": 1, "count": 100}
        layout = self.layout(project("menu", {"background": 0}, {"backgrounds": [{"layer": "bg1", "tilemap": "background"}]}), [a])
        self.assertIn({"start": 32, "count": 3200}, layout["resources"]["bgVram"])
        self.assertIn({"start": 896 * 32, "count": 128 * 32}, layout["resources"]["bgVram"])
        self.assertIn({"start": 28, "count": 2}, layout["resources"]["screenblocks"])
        self.assertEqual(layout["scope"], "reservation_envelope")

    def test_paged_topdown_counts_only_resident_viewport_and_relocated_ui(self):
        layout = self.layout(project("topdown", {"paged_source_tiles": "background"}), [compiled("paged_bg", resources={"rom_source_bytes": 900000})])
        self.assertIn({"start": 0, "count": 651 * 64}, layout["resources"]["bgVram"])
        self.assertIn({"start": 45056, "count": 4096}, layout["resources"]["bgVram"])
        self.assertIn({"start": 27, "count": 1}, layout["resources"]["screenblocks"])
        self.assertTrue(all(r["count"] < 900000 for r in layout["resources"]["bgVram"]))

    def test_paged_isometric_reserves_foreground_slots_and_native_maps(self):
        layout = self.layout(project("isometric", {"paged_surface": {"background": "back", "foreground": "front"}}), [
            compiled("paged_bg", "back", {"paged_viewport_bytes": 41664}),
            compiled("paged_bg", "front", {"resident_foreground_bytes": 640})])
        self.assertIn({"start": 0, "count": 41664 + 640}, layout["resources"]["bgVram"])
        self.assertIn({"start": 61440, "count": 4096}, layout["resources"]["bgVram"])
        self.assertIn({"start": 26, "count": 1}, layout["resources"]["screenblocks"])
        self.assertIn({"start": 27, "count": 1}, layout["resources"]["screenblocks"])

    def test_perspective_racing_uses_mode1_and_compiled_panorama_offset(self):
        p = project("racing", {"config": {"presentation": "pseudo3d"}, "pseudo3d_visual": 0},
                    {"pseudo3d_visuals": [{"floor": "floor", "panorama": "sky"}]})
        layout = self.layout(p, [compiled("affine_bg", "floor", {"tilemap_width": 64, "tilemap_height": 64}),
                                 compiled("indexed_bg", "sky", {"isometric_source_bytes": 640, "tilemap_width": 32, "tilemap_height": 8})])
        self.assertEqual(layout["display_mode"], 1)
        self.assertIn({"start": 4096, "count": 640}, layout["resources"]["bgVram"])
        self.assertIn({"start": 32768, "count": 16384}, layout["resources"]["bgVram"])
        self.assertIn({"start": 0, "count": 2}, layout["resources"]["screenblocks"])

    def test_unmodelled_isometric_surface_stays_unknown_instead_of_zero(self):
        layout = self.layout(project("isometric"))
        self.assertEqual(layout["display_mode"], 0)
        self.assertNotIn("bgVram", layout["resources"])
        self.assertIn("isometric_surface_not_modelled", layout["notes"])

    def test_runtime_layout_contract_matches_renderer_reservations(self):
        hw = (ROOT / "engine/src/gbs_hw.c").read_text()
        self.assertIn("bg_screenblocks[] = { 24, 28, 20, 16 }", hw)
        self.assertIn("DIALOGUE_TILE_BLANK = 896", hw)
        self.assertIn("(1024u - DIALOGUE_TILE_BLANK) * 16u", hw)
        paged = (ROOT / "engine/include/gbs/paged_background.hpp").read_text()
        self.assertIn("paged_background_slot_count = 31 * 21", paged)

    def test_aligned_bg_hud_text_does_not_reserve_obj_text(self):
        ui = {"hud_active_layout_id": "hud", "hud_layouts": [{"id": "hud", "mode": "advanced", "components": [
            {"kind": "text", "x": 8, "y": 8, "width": 80, "height": 8, "visible": True}]}]}
        layout = self.layout(project("menu", block={"dialogue_ui": ui}))
        self.assertNotIn("hud_text", [r["feature"] for r in layout["dynamic_reservations"]])
        self.assertEqual(next(r for r in layout["dynamic_reservations"] if r["feature"] == "hud_oam")["resources"]["oam"], [{"start": 96, "count": 32}])

    def test_pixel_hud_reserves_full_private_text_arena_and_oam(self):
        ui = {"hud_active_layout_id": "hud", "hud_layouts": [{"id": "hud", "mode": "advanced", "components": [
            {"kind": "text", "x": 9, "y": 8, "visible": True}]}]}
        layout = self.layout(project("menu", block={"dialogue_ui": ui}))
        text = next(r for r in layout["dynamic_reservations"] if r["feature"] == "hud_text")
        self.assertEqual(text["resources"]["objVram"], [{"start": 28800, "count": 3968}])
        self.assertEqual(text["resources"]["oam"], [{"start": 96, "count": 32}])

    def test_compact_text_and_icons_share_the_descending_hud_oam_arena(self):
        ui = {"hud_scene_bindings": [{"scene_name": "test", "preset_id": "hud"}], "hud_layouts": [
            {"id": "hud", "mode": "advanced", "components": [{"kind": "text", "text_advance": 6}, {"kind": "icon", "asset": "icon"}]}]}
        layout = self.layout(project("topdown", block={"dialogue_ui": ui}))
        entries = {r["feature"]: r["resources"] for r in layout["dynamic_reservations"]}
        self.assertEqual(entries["hud_compact_text"]["oam"], [{"start": 64, "count": 32}])
        self.assertEqual(entries["hud_icons"]["oam"], [{"start": 64, "count": 32}])

    def test_name_keyboard_reserves_glyphs_outside_asset_allocations(self):
        layout = self.layout(project("menu", {"text_input": {"keyboard_control_layout": "bottom_grid"}}))
        entries = {r["feature"]: r["resources"] for r in layout["dynamic_reservations"]}
        self.assertEqual(entries["name_keyboard"]["objVram"], [{"start": 29952, "count": 1280}])
        self.assertEqual(entries["name_keyboard"]["oam"], [{"start": 40, "count": 40}])
        self.assertEqual(entries["name_input"]["objPalette"], [{"start": 416, "count": 32}])

    def test_reachable_text_input_script_reserves_the_field_without_keyboard_obj(self):
        p = project("menu", {"on_select": [{"op": "call_script", "script": 0}]},
                    {"scripts": [{"script": [{"op": "open_text_input"}]}]})
        entries = self.layout(p)["dynamic_reservations"]
        self.assertIn("name_input", [r["feature"] for r in entries])
        self.assertNotIn("name_keyboard", [r["feature"] for r in entries])

    def test_portrait_tab_is_opt_in_and_reserves_actual_raster(self):
        layout = self.layout(project("topdown", block={"dialogue_ui": {"portrait_layout": "portrait_tab"}}))
        tab = next(r for r in layout["dynamic_reservations"] if r["feature"] == "portrait_tab")
        self.assertEqual(tab["resources"]["objVram"], [{"start": 16384, "count": 12288}])
        self.assertEqual(tab["resources"]["oam"], [{"start": 114, "count": 8}])

    def test_default_text_input_object_and_generated_payload_ownership(self):
        entries = self.layout(project("menu", {"text_input": {}}))["dynamic_reservations"]
        self.assertIn("name_input", [r["feature"] for r in entries])
        layout = self.layout(project("isometric", {"paged_surface": {}}))
        self.assertIn("gbastudio_dialogue_ui::", layout["rom_symbol_prefixes"])

    def test_shared_clock_and_screen_event_text_have_separate_reserved_slots(self):
        layout = self.layout(project("menu", {"on_enter": [{"op": "start_game_clock"}, {"op": "draw_text", "layer": "overlay"}]}))
        entries = {r["feature"]: r["resources"] for r in layout["dynamic_reservations"]}
        self.assertEqual(entries["clock"]["oam"], [{"start": 123, "count": 5}])
        self.assertEqual(entries["event_text"]["oam"], [{"start": 96, "count": 27}])
        bg = self.layout(project("menu", {"on_enter": [{"op": "draw_text", "layer": "background"}]}))
        self.assertNotIn("event_text", [r["feature"] for r in bg["dynamic_reservations"]])

    def test_builtin_fighting_hud_reserves_status_obj_without_custom_layout(self):
        features = [r["feature"] for r in self.layout(project("luta"))["dynamic_reservations"]]
        self.assertIn("status_text", features)

    def test_clipped_frame_tiles_may_share_obj_space_but_visible_reuse_cannot(self):
        c = {"kind": "frame", "asset": "image", "x": 192, "y": 128, "visible": True}
        ui = {"hud_active_layout_id": "hud", "hud_layouts": [{"id": "hud", "mode": "advanced", "components": [c]}]}
        p = project("menu", block={"dialogue_ui": ui})
        p["asset_pack"] = {"assets": [{"name": "image", "sprite_width": 64, "sprite_height": 64, "sprite_bpp": 4}]}
        a = compiled("obj", "image", {"sprite_frames": 1, "oam_sprites": 1})
        a["allocations"] = {"obj_tiles": {"start": 837, "count": 64}}
        ranges = self.layout(p, [a])["nonvisible_obj_ranges"]
        self.assertIn({"start": 900 * 32, "count": 32}, ranges)
        self.assertNotIn({"start": 837 * 32, "count": 32}, ranges)
        ui["hud_layouts"][0]["components"].append({**c, "x": 0, "y": 0})
        self.assertEqual(self.layout(p, [a])["nonvisible_obj_ranges"], [])

    def test_offscreen_proof_does_not_exempt_another_asset_or_an_omitted_payload(self):
        ui = {"hud_active_layout_id": "hud", "hud_layouts": [{"id": "hud", "mode": "advanced", "components": [
            {"kind": "frame", "asset": "image", "x": 192, "y": 128}]}]}
        p = project("menu", block={"dialogue_ui": ui})
        p["asset_pack"] = {"assets": [{"name": "image", "sprite_width": 64, "sprite_height": 64}]}
        a = compiled("obj", "image", {"sprite_frames": 1, "oam_sprites": 1})
        a["allocations"] = {"obj_tiles": {"start": 837, "count": 64}}
        other = compiled("obj", "visible")
        other["allocations"] = {"obj_tiles": {"start": 900, "count": 1}}
        self.assertNotIn({"start": 28800, "count": 32}, self.layout(p, [a, other])["nonvisible_obj_ranges"])
        a["omitted"] = True
        self.assertEqual(self.layout(p, [a])["nonvisible_obj_ranges"], [])

    def test_dynamic_arena_constants_match_native_renderer(self):
        source = (ROOT / "engine/src/gbs_hw.c").read_text()
        for text in ["DYNAMIC_TEXT_OBJ_TILE_BASE = 900", "NAME_KEYBOARD_OBJ_OAM_BASE = 40",
                     "NAME_KEYBOARD_OBJ_OAM_COUNT = 40", "NAME_KEYBOARD_OBJ_GLYPH_OFFSET = 36",
                     "DYNAMIC_TEXT_OBJ_OAM_BASE = 96", "DYNAMIC_TEXT_OBJ_OAM_COUNT = 32",
                     "HUD_ICON_OBJ_OAM_BASE = 88", "HUD_ICON_OBJ_OAM_COUNT = 32"]:
            self.assertIn(text, source)

    def test_scene_group_uses_editor_normalization_for_accents_and_numeric_names(self):
        p = project("world_map")
        p["scene_contracts"][0]["name"] = "123 - Ação"
        p["world_map_project"]["scene_name"] = "123 - Ação"
        self.assertEqual(self.layout(p)["bank_group"], "scene_123_acao")


if __name__ == "__main__":
    unittest.main()
