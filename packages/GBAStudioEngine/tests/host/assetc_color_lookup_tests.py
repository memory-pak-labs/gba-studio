"""Exact color mapping and bounded work for repeated pixels."""
import contextlib
import importlib.util
import io
import hashlib
import os
from pathlib import Path
import unittest
import tempfile
from unittest.mock import patch


def load_assetc():
    source = Path(__file__).resolve().parents[2] / "tools/assetc/assetc.py"
    spec = importlib.util.spec_from_file_location("assetc_color_lookup_test", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def row(pixels):
    return bytes(channel for pixel in pixels for channel in pixel)


class ColorLookupTests(unittest.TestCase):
    def lookup_misses(self, assetc):
        original = assetc.nearest_palette_index
        misses = []
        def lookup(color, palette, cache=None):
            if cache is None or (tuple(palette), color) not in cache:
                misses.append(color)
            return original(color, palette, cache)
        return lookup, misses

    def test_background_banks_keep_golden_tiles_with_bounded_color_searches(self):
        assetc = load_assetc(); lookup, misses = self.lookup_misses(assetc)
        colors = [(0,0,0),(248,0,0),(0,248,0),(0,0,248)]
        with patch.object(assetc, "nearest_palette_index", side_effect=lookup):
            result = assetc.build_4bpp_background(32,32,colors,[i%4 for i in range(1024)],transparent_index=0)
        self.assertEqual(hashlib.sha256(repr(result).encode()).hexdigest(),
                         "3c01a4b8078223e1a22f246fa4cfc205239627d35d6c99935e373d719cbdd69f")
        # Planning and encoding each search once per visible color.
        self.assertLessEqual(len(misses), 6)

    def test_fixed_object_palette_keeps_exact_indices_with_bounded_searches(self):
        assetc = load_assetc(); lookup, misses = self.lookup_misses(assetc)
        colors = [(0,0,0),(248,0,0),(0,248,0),(0,0,248)]
        with patch.object(assetc, "nearest_palette_index", side_effect=lookup):
            palette,indices = assetc.prepare_obj_asset_pixels(colors,[0,1,2,3]*64,0,
                {"name":"gold","object_palette_values":[0,31,992,31744]})
        self.assertEqual(palette, colors + [(0,0,0)]*12)
        self.assertEqual(indices, [0,1,2,3]*64)
        self.assertLessEqual(len(misses), 3)

    def test_template_copy_preserves_unchanged_output_timestamp(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory() as root:
            source, output = Path(root)/"template", Path(root)/"export"
            source.mkdir(); output.mkdir()
            (source/"main.cpp").write_text("same")
            target = output/"main.cpp"; target.write_text("same")
            os.utime(target, (1000, 1000))
            assetc.copy_project_template_files(source, output)
            self.assertEqual(target.stat().st_mtime, 1000)

    def test_generated_text_preserves_timestamp_and_rewrites_changed_bytes(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory() as root:
            target = Path(root)/"data.hpp"; target.write_text("same\n")
            os.utime(target, (1000, 1000))
            assetc.write_text_if_changed(target, "same\n", encoding="utf-8")
            self.assertEqual(target.stat().st_mtime, 1000)
            assetc.write_text_if_changed(target, "new\n", encoding="utf-8")
            self.assertEqual(target.read_bytes(), b"new\n")

    def test_repeated_quantized_pixels_keep_palette_indices_and_transparency(self):
        assetc = load_assetc()
        pixels = [(0, 0, 0, 0), (1, 2, 3, 255), (7, 6, 5, 255),
                  (120, 0, 0, 255), (0, 120, 0, 255), (0, 0, 120, 255)]
        with contextlib.redirect_stderr(io.StringIO()), patch.object(
            assetc, "nearest_palette_index", wraps=assetc.nearest_palette_index
        ) as lookup:
            palette, indices = assetc.rgba_rows_to_palette("colors.png", [row(pixels * 128)], 3)
        self.assertEqual(palette, [(0, 0, 0), (0, 0, 40), (56, 56, 0)])
        self.assertEqual(indices, [0, 1, 1, 2, 2, 1] * 128)
        # Distinct RGB values that round to the same GBA color need one lookup.
        self.assertLessEqual(lookup.call_count, 4)

    def test_zero_palette_index_is_reused_and_cache_is_local_to_each_palette(self):
        assetc = load_assetc()
        pixels = [(0, 0, 0, 255), (248, 0, 0, 255),
                  (0, 248, 0, 255), (0, 0, 248, 255)]
        with contextlib.redirect_stderr(io.StringIO()), patch.object(
            assetc, "nearest_palette_index", wraps=assetc.nearest_palette_index
        ) as lookup:
            palette, indices = assetc.rgba_rows_to_palette("opaque.png", [row(pixels * 64)], 2)
            self.assertEqual(palette, [(0, 0, 120), (120, 120, 0)])
            self.assertEqual(indices, [0, 1, 1, 0] * 64)
            self.assertLessEqual(lookup.call_count, 4)
        with contextlib.redirect_stderr(io.StringIO()):
            other, other_indices = assetc.rgba_rows_to_palette("other.png", [row(pixels)], 1)
        self.assertEqual(other, [(56, 56, 56)])
        self.assertEqual(other_indices, [0, 0, 0, 0])

    def test_unquantized_mapping_and_warning_contract_are_preserved(self):
        assetc = load_assetc()
        pixels = [(0, 0, 0, 0), (7, 6, 5, 255), (1, 2, 3, 255)]
        self.assertEqual(assetc.rgba_rows_to_palette("exact.png", [row(pixels)], None),
                         ([(0, 0, 0), (7, 6, 5), (1, 2, 3)], [0, 1, 2]))
        warnings = io.StringIO()
        with contextlib.redirect_stderr(warnings):
            for _ in range(2):
                assetc.rgba_rows_to_palette("warning.png", [row(pixels)], 2)
        self.assertEqual(warnings.getvalue().count("AVISO[palette_quantized]"), 1)


if __name__ == "__main__":
    unittest.main()
