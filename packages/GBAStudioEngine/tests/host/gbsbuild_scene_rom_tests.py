"""Linked asset ownership uses actual ELF objects, not PNG or source estimates."""
import importlib.util
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("scene_rom", ROOT / "tools/gbsbuild/gbsbuild.py")
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)

class LinkedSceneRomTests(unittest.TestCase):
    def test_elf_objects_keep_translation_unit_and_exclude_functions_and_ram(self):
        text = """  1: 00000000 0 FILE LOCAL DEFAULT ABS menu_runtime.cpp
  2: 08000100 32 OBJECT LOCAL DEFAULT 3 hero_tiles
  3: 08000200 8 FUNC LOCAL DEFAULT 3 hero_draw()
  4: 02000000 16 OBJECT LOCAL DEFAULT 4 hero_cache
  5: 00000000 0 FILE LOCAL DEFAULT ABS racing_runtime.cpp
  6: 08000300 32 OBJECT LOCAL DEFAULT 3 hero_tiles
"""
        rows = tool.parse_linked_rom_objects(text, 1024)
        self.assertEqual([(r["file"], r["start"], r["count"]) for r in rows],
                         [("menu_runtime.cpp", 256, 32), ("racing_runtime.cpp", 768, 32)])

    def test_shared_payload_is_counted_once_per_scene_and_never_summed_as_rom(self):
        layouts = [{"scene": n, "runtime": "menu", "bank_groups": ["scene_" + n]} for n in ["a", "b"]]
        report = {"scene_video_layouts": {"plans": layouts}, "export_plan": {"headers": [
            {"id": "shared", "symbol": "hero", "omitted": False}, {"id": "only", "symbol": "hero_alt", "omitted": False}]},
            "allocations": [{"id": "shared", "bank_groups": ["scene_a", "scene_b"]}, {"id": "only", "bank_groups": ["scene_a"]}]}
        symbols = [{"file": "menu_runtime.cpp", "name": name, "start": start, "count": count} for name,start,count in [
            ("hero_tiles", 0, 32), ("hero_tiles_alias", 0, 32), ("hero_alt_tiles", 32, 16)]]
        symbols += [{"file": "racing_runtime.cpp", "name": "hero_tiles", "start": 100, "count": 32}]
        usage = tool.linked_scene_rom_usage(report, symbols, 1024)
        self.assertEqual(usage["attributedBytes"], 48)
        a,b = usage["scenes"]
        self.assertEqual((a["bytes"], a["exclusiveBytes"], a["sharedBytes"]), (48,16,32))
        self.assertEqual((b["bytes"], b["exclusiveBytes"], b["sharedBytes"]), (32,0,32))
        self.assertEqual(usage["otherBytes"], 976)

    def test_readelf_hexadecimal_sizes_for_large_payloads(self):
        rows = tool.parse_linked_rom_objects("1: 08000000 0xa5c40 OBJECT LOCAL DEFAULT 3 paged_tiles", 1000000)
        self.assertEqual(rows[0]["count"], 678976)

    def test_weak_inline_assets_are_shared_across_translation_units(self):
        rows = tool.parse_linked_rom_objects("1: 00000000 0 FILE LOCAL DEFAULT ABS last.cpp\n2: 08000100 16 OBJECT WEAK DEFAULT 3 audio_samples", 1024)
        self.assertIsNone(rows[0]["file"])

    def test_out_of_rom_object_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "ROM"):
            tool.parse_linked_rom_objects("1: 080003f0 32 OBJECT LOCAL DEFAULT 3 a", 1024)

if __name__ == "__main__": unittest.main()
