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

    def test_scene_group_uses_editor_normalization_for_accents_and_numeric_names(self):
        p = project("world_map")
        p["scene_contracts"][0]["name"] = "123 - Ação"
        p["world_map_project"]["scene_name"] = "123 - Ação"
        self.assertEqual(self.layout(p)["bank_group"], "scene_123_acao")


if __name__ == "__main__":
    unittest.main()
