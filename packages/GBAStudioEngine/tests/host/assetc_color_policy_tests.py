"""Color policy is explanatory: it never changes approved pixels or formats."""
import tempfile
import unittest
from pathlib import Path
from assetc_production_contract_tests import load_assetc_module, write_indexed_png
from assetc_palette_quantization_tests import write_rgba_png


class ColorPolicyTests(unittest.TestCase):
    def setUp(self):
        self.c = load_assetc_module()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def policy(self, kind="obj", count=2, **options):
        colors = [(0, 0, 0)] + [(i * 8, 64, 128) for i in range(1, count + 1)]
        write_indexed_png(self.root / "asset.png", 8, 8, colors, [1 + i % count for i in range(64)])
        return self.c.pack_asset_color_policy({"kind": kind, "png": "asset.png", "transparent_color_index": 0, **options}, self.root)

    def test_default_is_four_bpp(self):
        policy = self.policy()
        self.assertEqual(policy["format"], "4bpp")
        self.assertEqual(policy["reason"], "default_4bpp")
        self.assertFalse(policy["review_4bpp"])

    def test_explicit_eight_with_few_colors_requests_review_without_conversion(self):
        policy = self.policy(sprite_bpp=8)
        self.assertEqual(policy["format"], "8bpp")
        self.assertEqual(policy["reason"], "explicit_8bpp")
        self.assertEqual(policy["source_visible_colors"], 2)
        self.assertTrue(policy["review_4bpp"])

    def test_sixteen_visible_obj_colors_justify_eight(self):
        policy = self.policy(count=16, sprite_bpp=8)
        self.assertEqual(policy["reason"], "obj_color_count")
        self.assertFalse(policy["review_4bpp"])

    def test_native_indexed_affine_and_bitmap_formats_are_not_four_bpp_candidates(self):
        for kind, fmt, reason in [("affine_bg", "8bpp", "affine_renderer"), ("indexed_bg", "8bpp", "indexed_renderer"),
                                  ("paged_bg", "8bpp", "paged_renderer"), ("bitmap4", "8bpp", "bitmap_mode"),
                                  ("bitmap3", "rgb555", "bitmap_mode"), ("bitmap5", "rgb555", "bitmap_mode")]:
            with self.subTest(kind=kind):
                policy = self.policy(kind)
                self.assertEqual((policy["format"], policy["reason"], policy["review_4bpp"]), (fmt, reason, False))

    def test_unused_palette_entries_and_rgb888_variants_do_not_inflate_hardware_colors(self):
        colors = [(0, 0, 0), (8, 16, 24), (9, 17, 25), (240, 0, 0)]
        write_indexed_png(self.root / "asset.png", 8, 8, colors, [1, 2] * 32)
        policy = self.c.pack_asset_color_policy({"kind": "obj", "png": "asset.png", "sprite_bpp": 8}, self.root)
        self.assertEqual(policy["source_visible_colors"], 1)
        self.assertTrue(policy["review_4bpp"])

    def test_pack_report_keeps_pixel_headers_identical_and_revalidates_cache_policy(self):
        self.policy()
        a = {"id": "icon", "name": "icon", "kind": "obj", "png": "asset.png", "sprite_bpp": 8,
             "sprite_width": 8, "sprite_height": 8, "transparent_color_index": 0}
        first = self.c.emit_pack_report({"assets": [a]}, self.root)
        header = self.c.emit_asset_header_from_pack_entry(a, self.root, "icon", first["allocations"][0])
        self.assertIn("gbs::ColorDepth::Bpp8", header)
        self.assertTrue(first["allocations"][0]["color_policy"]["review_4bpp"])
        first["allocations"][0]["color_policy"]["review_4bpp"] = False
        cached = self.c.emit_pack_report({"assets": [a]}, self.root, first)
        self.assertTrue(cached["allocations"][0]["color_policy"]["review_4bpp"])
        self.assertEqual(header, self.c.emit_asset_header_from_pack_entry(a, self.root, "icon", cached["allocations"][0]))

    def test_regular_banks_do_not_alias_an_affine_palette_from_the_same_rgba_png(self):
        write_rgba_png(self.root / "mixed.png", 128, 128, [(80, 160, 240, 255), (240, 80, 16, 255)] * 8192)
        entries = [{"id": kind, "name": kind, "kind": kind, "png": "mixed.png", "bank_group": "scene_test"}
                   for kind in ["affine_bg", "bg"]]
        report = self.c.emit_pack_report({"assets": entries}, self.root)
        affine, regular = [a["allocations"]["bg_palette_colors"] for a in report["allocations"]]
        self.assertNotIn("shared_with", regular)
        self.assertGreaterEqual(regular["start"], affine["start"] + affine["count"])
        self.assertEqual(regular["start"] % 16, 0)


if __name__ == "__main__":
    unittest.main()
