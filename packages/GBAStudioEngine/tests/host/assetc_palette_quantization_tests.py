#!/usr/bin/env python3
import contextlib
import hashlib
import importlib.util
import io
import json
import subprocess
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch
import zlib
from pathlib import Path


ASSETC_PATH = Path(__file__).resolve().parents[2] / "tools" / "assetc" / "assetc.py"


def load_assetc():
    spec = importlib.util.spec_from_file_location("assetc_palette_test", ASSETC_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def png_chunk(kind, payload):
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)


def write_rgba_png(path, width, height, pixels):
    rows = []
    for y in range(height):
        row = b"".join(bytes(pixels[(y * width) + x]) for x in range(width))
        rows.append(b"\x00" + row)
    data = b"\x89PNG\r\n\x1a\n"
    data += png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    data += png_chunk(b"IDAT", zlib.compress(b"".join(rows)))
    data += png_chunk(b"IEND", b"")
    path.write_bytes(data)


def write_indexed_png(path, width, height, palette, indices, bit_depth=8):
    if bit_depth not in (1, 2, 4, 8):
        raise ValueError("bit_depth must be one of 1, 2, 4, 8")

    rows = []
    values_per_byte = 8 // bit_depth
    mask = (1 << bit_depth) - 1
    for y in range(height):
        row = indices[y * width:(y + 1) * width]
        if bit_depth == 8:
            packed = bytes(row)
        else:
            packed_values = bytearray((width + values_per_byte - 1) // values_per_byte)
            for x, value in enumerate(row):
                if value < 0 or value > mask:
                    raise ValueError("indexed pixel exceeds bit depth")
                shift = 8 - bit_depth * ((x % values_per_byte) + 1)
                packed_values[x // values_per_byte] |= value << shift
            packed = bytes(packed_values)
        rows.append(b"\x00" + packed)

    data = b"\x89PNG\r\n\x1a\n"
    data += png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, bit_depth, 3, 0, 0, 0))
    data += png_chunk(b"PLTE", b"".join(bytes(color) for color in palette))
    data += png_chunk(b"IDAT", zlib.compress(b"".join(rows)))
    data += png_chunk(b"IEND", b"")
    path.write_bytes(data)


class AssetcPaletteQuantizationTests(unittest.TestCase):
    def test_background_build_analyzes_tiles_once_and_keeps_previous_outputs(self):
        assetc = load_assetc()
        colors = [((i % 8) * 32, (i // 8) * 64, (i % 4) * 56) for i in range(32)]
        indices = [(x // 8 + y // 8 * 8) * 2 + (x + y) % 2 for y in range(16) for x in range(64)]
        cases = [
            ({}, '1f959a1716703da6af2920eb536b3ec55eb94f89d4ba3e063ebdbcaddd42a6c0', 'da6582408629e80cc4d4415cda7f6d292fbeded2740b82f35f1be3d2437b9970'),
            ({'max_palette_banks': 2}, '40240f631f3db4179d1efd8dcfb9851114c3bafd8e44a6242669ce8c7d9ad9e6', '6f3fa2060dda751c3c197239e3c17859422c3fbc3c1c7a70973d8c7f50f66be0'),
            ({'reference_plan': {'colors': [(0, 0, 0), (248, 248, 248)]}}, '450587c4e14130659695a21662ad454343fe6be3aaff86631dd89351a8282397', '249bcbf9b19584ff7dd20fb31fe78b752b038566e920012bc23c1e1651ed94d7'),
            ({'reference_plan': {'banks': [[None, (0, 0, 0), (248, 248, 248)], [None, (0, 248, 0)]], 'tile_palette_banks': [i % 2 for i in range(16)]}}, '7917d1476bd6b7becf30c1e9d138bcd45a90bcb667553255686a52a2f97509d7', '64743676b3b556cdab12397332845ed8e0e41c923ae2abb61c22fbeae9e73a53'),
        ]
        # Golden digests include the previous banks, pixels, remaps and reports.
        for options, build_digest, prepare_digest in cases:
            with self.subTest(options=options):
                with patch.object(assetc, 'background_tile_infos', wraps=assetc.background_tile_infos) as analyze:
                    result = assetc.build_4bpp_background(64, 16, colors, indices, transparent_index=0, optimize_tile_budget=8, return_optimization=True, **options)
                    self.assertEqual(hashlib.sha256(json.dumps(result, separators=(',', ':')).encode()).hexdigest(), build_digest)
                    self.assertEqual(analyze.call_count, 1)
                prepared = assetc.prepare_4bpp_background(64, 16, colors, indices, transparent_index=0, **options)
                self.assertEqual(hashlib.sha256(json.dumps(prepared, separators=(',', ':')).encode()).hexdigest(), prepare_digest)
                self.assertEqual(len(prepared['prepared_pixels']), 64 * 16)

    def test_background_build_keeps_validation_order_and_reference_geometry(self):
        assetc = load_assetc()
        for operation in [assetc.prepare_4bpp_background, assetc.build_4bpp_background]:
            with self.assertRaisesRegex(SystemExit, 'aceita entre 1 e 16 bancos'):
                operation(7, 8, [(0, 0, 0)], [0] * 56, max_palette_banks=0)
            with self.assertRaisesRegex(SystemExit, 'multiplos de 8'):
                operation(7, 8, [(0, 0, 0)], [0] * 56)
            with self.assertRaisesRegex(SystemExit, 'geometria incompat'):
                operation(8, 8, [(0, 0, 0)], [0] * 64, reference_plan={'banks': [[None, (0, 0, 0)]], 'tile_palette_banks': []})

    def test_png_scanline_filters_keep_rgba_and_packed_indexed_pixels(self):
        assetc=load_assetc()
        def filtered(rows,bpp,filter_type):
            previous=bytes(len(rows[0]));result=[]
            for row in rows:
                encoded=[]
                for i,value in enumerate(row):
                    a=row[i-bpp] if i>=bpp else 0;b=previous[i];c=previous[i-bpp] if i>=bpp else 0
                    p=a+b-c;paeth=min([(abs(p-a),0,a),(abs(p-b),1,b),(abs(p-c),2,c)])[2]
                    predictor=[0,a,b,(a+b)//2,paeth][filter_type]
                    encoded.append((value-predictor)&255)
                result.append(bytes([filter_type])+bytes(encoded));previous=row
            return b''.join(result)
        with tempfile.TemporaryDirectory() as temp:
            rgba=[bytes(component for x in range(19) for component in ((x%3)*80,(y%3)*80,248,0 if x==0 else 255)) for y in range(7)]
            indexed=[bytes([0x12,0x34,0x10]) for _ in range(7)]
            expected_rgba=None
            for filter_type in range(5):
                path=Path(temp)/f'rgba-{filter_type}.png'
                path.write_bytes(b'\x89PNG\r\n\x1a\n'+png_chunk(b'IHDR',struct.pack('>IIBBBBB',19,7,8,6,0,0,0))+png_chunk(b'IDAT',zlib.compress(filtered(rgba,4,filter_type)))+png_chunk(b'IEND',b''))
                actual=assetc.read_png(path,max_colors=None,include_transparency=True)
                if expected_rgba is None: expected_rgba=actual
                self.assertEqual(actual,expected_rgba);self.assertEqual(actual[-1],0)
                self.assertEqual([None if index==actual[-1] else actual[2][index] for index in actual[3]],
                                 [None if row[x+3]==0 else tuple(row[x:x+3]) for row in rgba for x in range(0,len(row),4)])
                path=Path(temp)/f'indexed-{filter_type}.png';palette=[(i*48,i*24,i*8) for i in range(5)]
                path.write_bytes(b'\x89PNG\r\n\x1a\n'+png_chunk(b'IHDR',struct.pack('>IIBBBBB',5,7,4,3,0,0,0))+png_chunk(b'PLTE',b''.join(bytes(color) for color in palette))+png_chunk(b'tRNS',bytes([0,255,255,255,255]))+png_chunk(b'IDAT',zlib.compress(filtered(indexed,1,filter_type)))+png_chunk(b'IEND',b''))
                self.assertEqual(assetc.read_png(path,include_transparency=True),(5,7,palette,[1,2,3,4,1]*7,0))
            bad=Path(temp)/'invalid.png';bad.write_bytes(b'\x89PNG\r\n\x1a\n'+png_chunk(b'IHDR',struct.pack('>IIBBBBB',19,7,8,6,0,0,0))+png_chunk(b'IDAT',zlib.compress(b'\x05'+rgba[0]+b''.join(b'\x00'+row for row in rgba[1:])))+png_chunk(b'IEND',b''))
            with self.assertRaisesRegex(SystemExit,'Filtro PNG nao suportado: 5'):assetc.read_png(bad)

    def test_packed_tile_errors_match_every_pixel_with_transparency_and_ties(self):
        assetc=load_assetc()
        import random
        rng=random.Random(29)
        keys=[tuple(rng.randrange(256) for _ in range(32)) for _ in range(40)]
        keys.extend([tuple([0]*32),tuple([255]*32),tuple([17]*32)])
        palettes=[[(255,255,255) if i%2 else (0,0,0) for i in range(16)],
                  [None if i%5==0 else tuple(rng.randrange(256) for _ in range(3)) for i in range(16)],
                  [None]*16,
                  [(-8+i*24,512-i*16,i*8) for i in range(16)]]
        for palette in palettes:
            error=assetc.build_tile_pattern_error_lookup(keys,palette)
            for left in keys:
                for right in keys:
                    expected=sum(0 if palette[x] is None or palette[y] is None else assetc.weighted_color_distance(palette[x],palette[y])
                                 for x,y in zip(assetc.packed_tile_indices(left),assetc.packed_tile_indices(right)))
                    self.assertEqual(error(left,right),expected)

    def test_packed_reducer_keeps_previous_remaps_reports_and_tie_order(self):
        assetc=load_assetc()
        import random
        rng=random.Random(19);keys=[tuple(rng.randrange(4)*17 for _ in range(32)) for _ in range(24)]
        banks=[[None,(8,0,0),(24,0,0),(248,248,248)],[(0,0,0),(0,8,0),(0,24,0),(0,248,248)]]
        occurrences=[(bank,key,index%4<<10) for bank in range(2) for index,key in enumerate(keys) for _ in range(rng.randrange(1,4))]
        # Captured from the converter before packed arithmetic was introduced.
        expected={8:'fc9261abd37146d9f2f1d984f10f3fdf934af477573218ef736d3c8401ecf28f',
                  16:'cb2eb6edff7662135e88c33e46301148817727cb393b7e5499621f49ecccb3ab',
                  32:'caa36d84c0dc40ad08a0437dc4afa6646af4d35703ca126e88ca6fa17867a106'}
        for budget,digest in expected.items():
            remaps,report=assetc.reduce_background_tile_patterns_by_bank(occurrences,banks,budget)
            payload={'remaps':sorted([b,list(k),list(v)] for (b,k),v in remaps.items()),'report':report}
            self.assertEqual(hashlib.sha256(json.dumps(payload,separators=(',',':')).encode()).hexdigest(),digest)

    def test_background_reduction_maps_sources_to_nearest_surviving_pattern(self):
        assetc = load_assetc()
        bank = [(i * 16, i * 16, i * 16) for i in range(16)]
        # Varied patterns/frequencies provoke transitive merges. Their final
        # representative must be selected against the original, not a chain.
        import random
        rng = random.Random(7)
        keys = [tuple(rng.randrange(4) * 17 for _ in range(32)) for _ in range(20)]
        occurrences = [(0, key, 0) for key in keys for _ in range(rng.randrange(1, 5))]
        remaps, report = assetc.reduce_background_tile_patterns_by_bank(occurrences, [bank], 6)
        survivors = {assetc.resolved_tile_key(remaps, b, key) for b, key, _ in occurrences}
        def error(a, b):
            return sum(assetc.weighted_color_distance(bank[x], bank[y])
                for x, y in zip(assetc.packed_tile_indices(a), assetc.packed_tile_indices(b)))
        actual_error = 0
        for b, key, _ in occurrences:
            selected = assetc.resolved_tile_key(remaps, b, key)
            self.assertEqual(error(key, selected), min(error(key, other) for other in survivors))
            actual_error += error(key, selected)
        self.assertEqual(report['total_mapping_error'], actual_error)

    def test_emits_bios_compatible_huffman_stream_for_byte_assets(self):
        assetc = load_assetc()

        self.assertEqual(
            assetc.encode_huffman(b"ABAB"),
            bytes.fromhex("28 04 00 00 01 c0 41 42 00 00 00 50"),
        )

    def test_emits_huffman_assets_for_tilemap_tiles_and_palette(self):
        assetc = load_assetc()

        header = assetc.emit_header(
            name="huffman_asset",
            width=16,
            height=8,
            colors=[(0, 0, 0)],
            indices=[0] * (16 * 8),
            destination_tile=0,
            palette_bank=0,
            object_tiles=False,
            rle_tilemap=False,
            lz77_tilemap=False,
            lz77_tiles=False,
            lz77_palette=False,
            collision_color_index=None,
            slope_color_indexes=None,
            huffman_tilemap=True,
            huffman_tiles=True,
            huffman_palette=True,
        )

        self.assertIn("gbs::HuffmanTileMapAsset", header)
        self.assertIn("gbs::HuffmanTileAsset", header)
        self.assertIn("gbs::HuffmanPaletteAsset", header)

    def test_resolves_manual_and_auto_pack_compression_policies_per_component(self):
        assetc = load_assetc()
        manual = assetc.resolve_pack_compression_policy(
            {"strategy": "manual", "tiles": "huffman", "tilemap": "lz77", "palette": "none"},
            "bg",
            tilemap_values=[0, 1, 0, 1],
            tile_bytes=b"ABCD" * 16,
            palette_values=[0, 1, 2, 3],
        )
        automatic = assetc.resolve_pack_compression_policy(
            "auto",
            "bg",
            tilemap_values=[0] * 64,
            tile_bytes=b"A" * 128,
            palette_values=[0] * 16,
        )

        self.assertEqual(manual, {"tiles": "huffman", "tilemap": "lz77", "palette": "none"})
        self.assertEqual(automatic["tilemap"], "rle16")
        self.assertIn(automatic["tiles"], ("lz77", "huffman"))

    def test_emits_global_runtime_scene_registry_for_mixed_project(self):
        assetc = load_assetc()
        header = assetc.emit_mixed_project_data_header(
            {
                "runtime_dispatch": {
                    "runtimes": ["topdown", "platformer", "visual_novel"],
                    "initial_runtime": "topdown",
                    "initial_room": 0,
                },
                "runtime_capabilities": {
                    "schema": 1,
                    "registry": "gba-studio-runtime-capabilities",
                    "capabilities": [
                        {"id": "save", "enabled": True, "required": True},
                        {"id": "rtc", "enabled": True, "required": True},
                        {"id": "link", "enabled": False, "required": False},
                        {"id": "affine", "enabled": True, "required": True},
                    ],
                },
                "scene_contracts": [
                    {"name": "town", "scene_type": "topdown", "runtime_profile": "topdown"},
                    {"name": "stage", "scene_type": "platformer", "runtime_profile": "platformer"},
                    {"name": "intro", "scene_type": "visual_novel", "runtime_profile": "visual_novel"},
                ],
                "topdown_project": {"rooms": [{"name": "town"}]},
                "platformer_project": {"rooms": [{"name": "stage"}]},
                "visual_novel_project": {"scenes": [{"name": "intro"}]},
            }
        )

        self.assertIn("gbs::RuntimeSceneDescriptor runtime_scene_registry[]", header)
        self.assertIn('{ "town", gbs::RuntimeKind::TopDown, 0 }', header)
        self.assertIn('{ "stage", gbs::RuntimeKind::Platformer, 0 }', header)
        self.assertIn('{ "intro", gbs::RuntimeKind::VisualNovel, 0 }', header)
        self.assertIn("gbs::RuntimeSceneRegistry runtime_registry", header)
        self.assertIn("constexpr int initial_scene = 0;", header)
        self.assertIn("gbs::RuntimeCapabilityID::Rtc", header)
        self.assertIn("gbs::RuntimeCapabilityID::Affine", header)
        self.assertIn("gbs::RuntimeCapabilityManifest runtime_capability_manifest", header)
        self.assertIn("inline gbs::RuntimeSaveService runtime_save_service", header)
        self.assertIn("inline gbs::LinkSession runtime_link_session", header)
        self.assertIn("inline gbs::RuntimeLinkService runtime_link_service", header)

    def test_pack_policy_emits_only_the_selected_compression_variants(self):
        assetc = load_assetc()
        header = assetc.emit_header(
            name="policy_asset",
            width=16,
            height=8,
            colors=[(0, 0, 0)],
            indices=[0] * (16 * 8),
            destination_tile=0,
            palette_bank=0,
            object_tiles=False,
            rle_tilemap=False,
            lz77_tilemap=False,
            lz77_tiles=False,
            lz77_palette=False,
            collision_color_index=None,
            slope_color_indexes=None,
            compression_policy={"strategy": "manual", "tiles": "huffman", "tilemap": "lz77", "palette": "none"},
        )

        self.assertIn("gbs::HuffmanTileAsset", header)
        self.assertIn("gbs::Lz77TileMapAsset", header)
        self.assertNotIn("gbs::Rle16TileMapAsset", header)
        self.assertNotIn("gbs::HuffmanPaletteAsset", header)

    def test_pack_policy_marks_primary_assets_with_selected_compression(self):
        assetc = load_assetc()
        header = assetc.emit_header(
            name="primary_policy_asset",
            width=16,
            height=8,
            colors=[(0, 0, 0)],
            indices=[0] * (16 * 8),
            destination_tile=0,
            palette_bank=0,
            object_tiles=False,
            rle_tilemap=False,
            lz77_tilemap=False,
            lz77_tiles=False,
            lz77_palette=False,
            collision_color_index=None,
            slope_color_indexes=None,
            compression_policy={"strategy": "manual", "tiles": "huffman", "tilemap": "lz77", "palette": "none"},
        )

        self.assertIn(
            "gbs::AssetCompression::Huffman, primary_policy_asset_huffman_tile_data, "
            "primary_policy_asset_huffman_tile_size, 32",
            header,
        )
        self.assertIn(
            "gbs::AssetCompression::Lz77, primary_policy_asset_tilemap_lz77_data, "
            "primary_policy_asset_tilemap_lz77_size, 4",
            header,
        )

    def test_primary_palette_compression_is_emitted_for_every_palette_header_kind(self):
        assetc = load_assetc()

        bitmap_header = assetc.emit_bitmap_header(
            "bitmap_policy_asset",
            8,
            8,
            [(0, 0, 0), (255, 255, 255)],
            [0, 1] * 32,
            4,
            0,
            False,
            False,
            {"strategy": "manual", "tiles": "none", "tilemap": "none", "palette": "lz77"},
        )
        affine_header = assetc.emit_affine_header(
            "affine_policy_asset",
            128,
            128,
            [(0, 0, 0), (255, 255, 255)],
            [0, 1] * (128 * 64),
            0,
            False,
            None,
            False,
            {"strategy": "manual", "tiles": "none", "tilemap": "none", "palette": "huffman"},
        )
        sprite_header = assetc.emit_sprite_header(
            "sprite_policy_asset",
            16,
            16,
            [(0, 0, 0), (255, 255, 255)],
            [0, 1] * 128,
            0,
            0,
            16,
            16,
            8,
            False,
            False,
            4,
            False,
            {"strategy": "manual", "tiles": "none", "tilemap": "none", "palette": "huffman"},
        )
        palette_header = assetc.emit_asset_header_from_pack_entry(
            {
                "kind": "palette",
                "palette_values": [0, 0x7FFF],
                "palette_slot": "background",
                "compression_policy": {
                    "strategy": "manual",
                    "tiles": "none",
                    "tilemap": "none",
                    "palette": "lz77",
                },
            },
            Path("."),
            "standalone_palette",
        )

        self.assertIn("gbs::AssetCompression::Lz77", bitmap_header)
        self.assertIn("gbs::AssetCompression::Huffman", affine_header)
        self.assertIn("gbs::AssetCompression::Huffman", sprite_header)
        self.assertIn("gbs::AssetCompression::Lz77", palette_header)

    def test_reduces_affine_tiles_deterministically_to_the_hardware_budget(self):
        assetc = load_assetc()
        tiles = [
            [0] * 64,
            [1] * 64,
            [2] * 64,
            [3] * 64,
        ]
        tilemap = [0, 1, 2, 3, 3, 2, 1, 0]

        reduced_tiles, reduced_tilemap = assetc._reduce_affine_tiles(tiles, tilemap, 2)

        self.assertEqual(len(reduced_tiles), 2)
        self.assertEqual(len(reduced_tilemap), len(tilemap))
        self.assertTrue(all(0 <= index < 2 for index in reduced_tilemap))
        self.assertEqual(
            (reduced_tiles, reduced_tilemap),
            assetc._reduce_affine_tiles(tiles, tilemap, 2),
        )

    def test_reads_native_4bpp_indexed_png_without_expanding_or_requantizing(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-native-4bpp-") as root:
            image_path = Path(root) / "native-4bpp.png"
            palette = [(0, 0, 0), (240, 224, 184), (56, 96, 128), (200, 112, 64)]
            source_indices = [
                0, 1, 2, 3, 1,
                3, 2, 1, 0, 2,
            ]
            write_indexed_png(image_path, 5, 2, palette, source_indices, bit_depth=4)

            width, height, colors, indices = assetc.read_png(image_path, max_colors=16)

            self.assertEqual((width, height), (5, 2))
            self.assertEqual(colors, palette)
            self.assertEqual(indices, source_indices)

    def test_prepares_more_than_256_source_colors_by_allocating_4bpp_banks_per_tile(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-advanced-bg-") as root:
            image_path = Path(root) / "many-source-colors.png"
            source_colors = [
                ((index % 31) * 8, ((index // 31) % 9) * 24, 0, 255)
                for index in range(16 * 17)
            ]
            pixels = [
                source_colors[(x // 8) * 17 + ((x + y * 8) % 17)]
                for y in range(8)
                for x in range(16 * 8)
            ]
            write_rgba_png(image_path, 16 * 8, 8, pixels)

            width, height, colors, indices = assetc.read_png(image_path, max_colors=None)
            plan = assetc.prepare_4bpp_background(width, height, colors, indices)

            self.assertGreater(plan["source_color_count"], 256)
            self.assertEqual(plan["strategy"], "strict")
            self.assertEqual(plan["bank_count"], 16)
            self.assertLessEqual(plan["prepared_color_count"], 256)
            self.assertEqual(len(plan["prepared_pixels"]), width * height)

    def test_marks_constrained_bank_clustering_for_visual_review(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-constrained-bg-") as root:
            image_path = Path(root) / "seventeen-banks.png"
            source_colors = [
                ((index % 31) * 8, ((index // 31) % 9) * 24, 0, 255)
                for index in range(17 * 16)
            ]
            pixels = [
                source_colors[(x // 8) * 16 + ((x + y * 8) % 16)]
                for y in range(8)
                for x in range(17 * 8)
            ]
            write_rgba_png(image_path, 17 * 8, 8, pixels)

            width, height, colors, indices = assetc.read_png(image_path, max_colors=None)
            plan = assetc.prepare_4bpp_background(width, height, colors, indices)

            self.assertEqual(plan["strategy"], "constrained")
            self.assertEqual(plan["bank_count"], 16)
            self.assertTrue(plan["requires_visual_review"])
            self.assertGreater(plan["total_color_error"], 0)

            palette, _tiles, tilemap, _tilemap_width, _tilemap_height = assetc.build_4bpp_background(
                width, height, colors, indices
            )
            self.assertEqual(len(palette), 16 * 16)
            self.assertTrue(all((entry >> 12) < 16 for entry in tilemap))

    def test_selects_constrained_bank_seeds_without_quadratic_distance_recomputation(self):
        assetc = load_assetc()
        tile_infos = [
            {
                "counts": {(index * 8, (index * 24) % 256, (index * 40) % 256): 64},
                "local_palette": [(index * 8, (index * 24) % 256, (index * 40) % 256)],
                "has_transparency": False,
            }
            for index in range(64)
        ]
        calls = 0
        original_palette_mapping_error = assetc.palette_mapping_error

        def counted_palette_mapping_error(*args, **kwargs):
            nonlocal calls
            calls += 1
            return original_palette_mapping_error(*args, **kwargs)

        assetc.palette_mapping_error = counted_palette_mapping_error
        try:
            banks, assignments = assetc.constrained_background_banks(tile_infos, 16)
        finally:
            assetc.palette_mapping_error = original_palette_mapping_error

        self.assertEqual(len(banks), 16)
        self.assertEqual(len(assignments), len(tile_infos))
        self.assertLessEqual(calls, len(tile_infos) * 16 * 6)

    def test_reuses_nearest_palette_indexes_during_constrained_mapping(self):
        assetc = load_assetc()
        tile_infos = [
            {
                "counts": {(8, 16, 24): 32, (32, 40, 48): 32},
                "local_palette": [(8, 16, 24), (32, 40, 48)],
                "has_transparency": False,
            }
            for _ in range(64)
        ]
        calls = 0
        original_nearest_palette_index = assetc.nearest_palette_index

        def counted_nearest_palette_index(*args, **kwargs):
            nonlocal calls
            cache = kwargs.get("cache")
            if cache is None and len(args) >= 3:
                cache = args[2]
            before = len(cache) if cache is not None else None
            result = original_nearest_palette_index(*args, **kwargs)
            if cache is None or len(cache) != before:
                calls += 1
            return result

        assetc.nearest_palette_index = counted_nearest_palette_index
        try:
            banks, assignments = assetc.constrained_background_banks(tile_infos, 16)
        finally:
            assetc.nearest_palette_index = original_nearest_palette_index

        self.assertEqual(len(banks), 16)
        self.assertEqual(len(assignments), len(tile_infos))
        self.assertLess(calls, len(tile_infos) * 16)

    def test_writes_prepared_png_and_review_report_without_global_palette_reduction(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-background-preparation-") as root:
            root_path = Path(root)
            source = root_path / "source.png"
            prepared = root_path / "prepared.png"
            report = root_path / "background-report.json"
            source_colors = [
                ((index % 31) * 8, ((index // 31) % 9) * 24, 0, 255)
                for index in range(16 * 17)
            ]
            pixels = [
                source_colors[(x // 8) * 17 + ((x + y * 8) % 17)]
                for y in range(8)
                for x in range(16 * 8)
            ]
            write_rgba_png(source, 16 * 8, 8, pixels)

            subprocess.run([
                sys.executable,
                str(ASSETC_PATH),
                str(source),
                "--prepare-background-4bpp",
                "--background-report",
                str(report),
                "-o",
                str(prepared),
            ], check=True, capture_output=True, text=True)

            self.assertTrue(prepared.read_bytes().startswith(b"\x89PNG\r\n\x1a\n"))
            review = json.loads(report.read_text(encoding="utf-8"))
            self.assertEqual(review["runtime_bpp"], 4)
            self.assertEqual(review["status"], "attention")
            self.assertTrue(review["requires_visual_review"])
            self.assertEqual(review["bank_count"], 16)

            width, height, colors, indices = assetc.read_png(prepared, max_colors=256)
            palette, _tiles, _tilemap, _tilemap_width, _tilemap_height = assetc.build_4bpp_background(
                width, height, colors, indices
            )
            self.assertLessEqual(len(palette) // 16, 16)

    def test_prepares_transparent_background_planes_without_painting_their_empty_pixels(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-transparent-bg-") as root:
            image_path = Path(root) / "foreground-plane.png"
            pixels = [
                (0, 0, 0, 0) if y < 4 else (224, 176, 80, 255)
                for y in range(8)
                for _x in range(8)
            ]
            write_rgba_png(image_path, 8, 8, pixels)

            width, height, colors, indices, transparent_index = assetc.read_png(
                image_path,
                max_colors=None,
                include_transparency=True,
            )
            plan = assetc.prepare_4bpp_background(
                width,
                height,
                colors,
                indices,
                transparent_index=transparent_index,
            )

            self.assertEqual(plan["prepared_pixels"][0][3], 0)
            self.assertEqual(plan["prepared_pixels"][7 * width][3], 255)
            self.assertIsNone(plan["banks"][0][0])

    def test_builds_multiple_4bpp_palette_banks_per_background_tile(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-bg-banks-") as root:
            image_path = Path(root) / "two-banks.png"
            left_colors = [(index * 16, 32, 64, 255) for index in range(16)]
            right_colors = [(32, index * 16, 192, 255) for index in range(16)]
            pixels = [
                (left_colors if x < 8 else right_colors)[(x + y * 8) % 16]
                for y in range(8)
                for x in range(16)
            ]
            write_rgba_png(image_path, 16, 8, pixels)

            width, height, colors, indices = assetc.read_png(image_path, max_colors=256)
            palette, tiles, tilemap, tilemap_width, tilemap_height = assetc.build_4bpp_background(
                width,
                height,
                colors,
                indices,
            )

            self.assertEqual((tilemap_width, tilemap_height), (2, 1))
            self.assertEqual(len(palette), 32)
            self.assertEqual(len(tiles), 1)
            self.assertTrue(all(len(tile) == 32 for tile in tiles))
            self.assertEqual(tilemap[0] >> 12, 0)
            self.assertEqual(tilemap[1] >> 12, 1)

    def test_shared_background_palette_reference_preserves_unchanged_tiles(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-shared-bg-palette-") as root:
            palette = [
                (16, 24, 32, 255),
                (64, 88, 112, 255),
                (120, 152, 184, 255),
                (208, 176, 112, 255),
            ]
            base_pixels = [
                palette[(x + y) % len(palette)]
                for y in range(16)
                for x in range(16)
            ]
            derived_pixels = list(base_pixels)
            for y in range(8):
                for x in range(8):
                    derived_pixels[(y * 16) + x] = palette[(x + (y * 2)) % len(palette)]

            base_path = Path(root) / "base.png"
            derived_path = Path(root) / "derived.png"
            write_rgba_png(base_path, 16, 16, base_pixels)
            write_rgba_png(derived_path, 16, 16, derived_pixels)

            base_width, base_height, base_colors, base_indices = assetc.read_png(
                base_path,
                max_colors=256,
            )
            derived_width, derived_height, derived_colors, derived_indices = assetc.read_png(
                derived_path,
                max_colors=256,
            )
            base_plan = assetc.prepare_4bpp_background(
                base_width,
                base_height,
                base_colors,
                base_indices,
            )
            derived_plan = assetc.prepare_4bpp_background(
                derived_width,
                derived_height,
                derived_colors,
                derived_indices,
                reference_plan=base_plan,
            )

            self.assertEqual(derived_plan["strategy"], "shared-reference")
            self.assertEqual(
                derived_plan["prepared_pixels"][8 * derived_width:],
                base_plan["prepared_pixels"][8 * base_width:],
            )

    def test_loads_exact_background_palette_plan_from_json_reference(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-exact-bg-plan-") as root:
            root_path = Path(root)
            image_path = root_path / "prepared.png"
            plan_path = root_path / "prepared-plan.json"
            palette = [
                (16, 24, 32, 255),
                (64, 88, 112, 255),
                (120, 152, 184, 255),
            ]
            pixels = [palette[(x + y) % len(palette)] for y in range(8) for x in range(8)]
            write_rgba_png(image_path, 8, 8, pixels)
            plan_path.write_text(json.dumps({
                "schema_version": 1,
                "width": 8,
                "height": 8,
                "bank_count": 1,
                "banks": [[None, [16, 24, 32], [64, 88, 112], [120, 152, 184]]],
                "tile_palette_banks": [0],
            }), encoding="utf-8")

            reference = assetc.background_palette_plan_from_path(plan_path, 1)
            self.assertEqual(reference["strategy"], "shared-reference")
            self.assertEqual(reference["banks"][0][1:], [
                (16, 24, 32),
                (64, 88, 112),
                (120, 152, 184),
            ])
            width, height, colors, indices, transparent_index = assetc.read_png(
                image_path,
                max_colors=256,
                include_transparency=True,
            )
            _palette, _tiles, _tilemap, tilemap_width, tilemap_height = assetc.build_4bpp_background(
                width,
                height,
                colors,
                indices,
                transparent_index=transparent_index,
                max_palette_banks=1,
                reference_plan=reference,
            )
            self.assertEqual((tilemap_width, tilemap_height), (1, 1))

    def test_emits_a_pack_header_from_an_inline_exact_background_palette_plan(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-inline-exact-bg-plan-") as root:
            root_path = Path(root)
            image_path = root_path / "prepared.png"
            write_rgba_png(image_path, 8, 8, [
                (16, 24, 32, 255) if (x + y) % 2 == 0 else (64, 88, 112, 255)
                for y in range(8)
                for x in range(8)
            ])
            asset = {
                "id": "harbor-exact",
                "name": "harbor-exact",
                "kind": "bg",
                "png": image_path.name,
                "background_palette_banks": 1,
                "background_palette_reference_plan": {
                    "banks": [[None, [16, 24, 32], [64, 88, 112]]],
                    "tile_palette_banks": [0],
                },
            }

            header = assetc.emit_asset_header_from_pack_entry(asset, root_path, "harbor_exact")

            self.assertIn("constexpr uint16_t harbor_exact_palette[16]", header)
            self.assertIn("0x1062, 0x3968", header)

    def test_reserves_local_palette_zero_for_transparency_on_opaque_background_tiles(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-opaque-bg-zero-") as root:
            image_path = Path(root) / "opaque.png"
            colors = [(index * 16, 32, 64, 255) for index in range(16)]
            pixels = [colors[(x + y * 8) % len(colors)] for y in range(8) for x in range(8)]
            write_rgba_png(image_path, 8, 8, pixels)

            width, height, source_colors, indices = assetc.read_png(image_path, max_colors=256)
            plan = assetc.prepare_4bpp_background(width, height, source_colors, indices)
            palette, tiles, _tilemap, _tilemap_width, _tilemap_height = assetc.build_4bpp_background(
                width, height, source_colors, indices
            )

            self.assertIsNone(plan["banks"][0][0])
            self.assertEqual(palette[0], (0, 0, 0))
            self.assertTrue(all((pixel & 0x0F) != 0 for tile in tiles for pixel in tile))

    def test_reuses_mirrored_4bpp_tiles_with_hardware_flip_flags(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-bg-flips-") as root:
            image_path = Path(root) / "mirrored-tiles.png"
            source = [
                (255, 255, 255, 255) if (x < 3 or y == 6 or (x == 5 and y < 4)) else (16, 32, 64, 255)
                for y in range(8)
                for x in range(8)
            ]

            def flipped(tile, horizontal=False, vertical=False):
                return [
                    tile[
                        ((7 - y) if vertical else y) * 8
                        + ((7 - x) if horizontal else x)
                    ]
                    for y in range(8)
                    for x in range(8)
                ]

            variants = [
                source,
                flipped(source, horizontal=True),
                flipped(source, vertical=True),
                flipped(source, horizontal=True, vertical=True),
            ]
            pixels = [
                variants[(y // 8) * 2 + (x // 8)][(y % 8) * 8 + (x % 8)]
                for y in range(16)
                for x in range(16)
            ]
            write_rgba_png(image_path, 16, 16, pixels)

            width, height, colors, indices = assetc.read_png(image_path, max_colors=256)
            _palette, tiles, tilemap, tilemap_width, tilemap_height = assetc.build_4bpp_background(
                width,
                height,
                colors,
                indices,
            )

            self.assertEqual((tilemap_width, tilemap_height), (2, 2))
            self.assertEqual(len(tiles), 1)
            self.assertEqual([entry & 0x0FFF for entry in tilemap], [0x0000, 0x0400, 0x0800, 0x0C00])

    def test_rejects_the_removed_8bpp_background_cli_contract(self):
        with tempfile.TemporaryDirectory(prefix="assetc-reject-bpp8-") as root:
            root_path = Path(root)
            image_path = root_path / "background.png"
            header_path = root_path / "background.hpp"
            write_rgba_png(image_path, 8, 8, [(0, 0, 0, 255)] * 64)

            result = subprocess.run(
                [sys.executable, str(ASSETC_PATH), str(image_path), "-o", str(header_path), "--background-bpp", "8"],
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertNotEqual(result.returncode, 0)

    def test_pack_resources_measure_real_4bpp_banks(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-pack-bpp-") as root:
            root_path = Path(root)
            banked_path = root_path / "banked.png"
            left_colors = [(index * 16, 32, 64, 255) for index in range(16)]
            right_colors = [(32, index * 16, 192, 255) for index in range(16)]
            banked_pixels = [
                (left_colors if x < 8 else right_colors)[(x + y * 8) % 16]
                for y in range(8)
                for x in range(16)
            ]
            write_rgba_png(banked_path, 16, 8, banked_pixels)

            banked = assetc.pack_png_resources({"kind": "bg", "png": "banked.png"}, root_path)

            self.assertEqual(banked["bg_tiles"], 1)
            self.assertEqual(banked["bg_palette_colors"], 32)

    def test_emits_4bpp_generated_background_headers(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-header-bpp-") as root:
            root_path = Path(root)
            image_path = root_path / "rich.png"
            colors = [(0, 0, 0, 255), (64, 32, 16, 255), (128, 96, 64, 255), (224, 192, 160, 255)]
            pixels = [colors[index % 4] for index in range(64)]
            write_rgba_png(image_path, 8, 8, pixels)
            allocation = {
                "allocations": {
                    "bg_tiles": {"start": 2, "count": 1, "end": 3},
                    "bg_palette_colors": {"start": 0, "count": 16, "end": 16},
                },
            }

            header = assetc.emit_asset_header_from_pack_entry(
                {"kind": "bg", "png": "rich.png"},
                root_path,
                "rich_bg",
                allocation,
            )

            self.assertIn("constexpr uint16_t rich_bg_palette[16]", header)
            self.assertIn("constexpr uint8_t rich_bg_tiles[1][32]", header)
            self.assertIn("rich_bg_tile_count, 2, false", header)
            self.assertIn("constexpr gbs::PaletteAsset rich_bg_palette_asset = { rich_bg_palette, 16, 0 }", header)

    def test_rejects_the_removed_8bpp_pack_kind(self):
        assetc = load_assetc()
        with self.assertRaises(SystemExit):
            assetc.pack_png_resources({"kind": "bg8", "png": "rich.png"}, Path("."))

    def test_runtime_tilemap_remap_preserves_per_tile_4bpp_palette_banks(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-remap-banks-") as root:
            root_path = Path(root)
            image_path = root_path / "banked.png"
            left_colors = [(index * 16, 32, 64, 255) for index in range(16)]
            right_colors = [(32, index * 16, 192, 255) for index in range(16)]
            pixels = [
                (left_colors if x < 8 else right_colors)[(x + y * 8) % 16]
                for y in range(8)
                for x in range(16)
            ]
            write_rgba_png(image_path, 16, 8, pixels)
            report = {
                "export_plan": {
                    "headers": [{
                        "id": "banked",
                        "inputs": ["banked.png"],
                        "assetc_args": ["banked.png", "--destination-tile", "3", "--palette-bank", "2"]
                    }]
                }
            }

            values = assetc.tilemap_values_from_asset_pack_entry(report, root_path, "banked", "teste")

            self.assertEqual(values, [0x2003, 0x3803])

    def test_reduces_rgba_palette_and_preserves_transparency_with_warning(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-palette-") as root:
            image_path = Path(root) / "many-colors.png"
            pixels = [(0, 0, 0, 0)]
            pixels.extend(
                ((index * 37) % 256, (index * 67) % 256, (index * 97) % 256, 255)
                for index in range(1, 64)
            )
            write_rgba_png(image_path, 8, 8, pixels)

            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                width, height, colors, indices = assetc.read_png(image_path, max_colors=16)
                assetc.read_png(image_path, max_colors=16)

            self.assertEqual((width, height), (8, 8))
            self.assertLessEqual(len(colors), 16)
            self.assertEqual(len(indices), 64)
            self.assertEqual(indices[0], 0)
            self.assertLess(max(indices), len(colors))
            self.assertIn("AVISO[palette_quantized]", stderr.getvalue())
            self.assertIn("many-colors.png", stderr.getvalue())
            self.assertEqual(stderr.getvalue().count("AVISO[palette_quantized]"), 1)

    def test_applies_pack_tile_and_palette_allocations_to_generated_sprite_header(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-pack-allocation-") as root:
            root_path = Path(root)
            image_path = root_path / "enemy.png"
            write_rgba_png(image_path, 16, 16, [(255, 0, 0, 255)] * (16 * 16))
            asset = {
                "id": "enemy",
                "name": "enemy",
                "kind": "obj",
                "png": "enemy.png",
                "sprite_width": 16,
                "sprite_height": 16,
            }
            allocation = {
                "id": "enemy",
                "name": "enemy",
                "kind": "obj",
                "status": "new",
                "change_reason": "new_asset",
                "resources": {"obj_tiles": 4, "obj_palette_colors": 16},
                "allocations": {
                    "obj_tiles": {"start": 24, "count": 4, "end": 28},
                    "obj_palette_colors": {"start": 16, "count": 16, "end": 32},
                },
            }

            plan = assetc.pack_export_header_entry(asset, allocation)
            header = assetc.emit_asset_header_from_pack_entry(asset, root_path, "enemy", allocation)

            self.assertIn("--destination-tile", plan["assetc_args"])
            self.assertIn("24", plan["assetc_args"])
            self.assertIn("--palette-bank", plan["assetc_args"])
            self.assertIn("constexpr gbs::PaletteAsset enemy_palette_asset = { enemy_palette, 16, 16 }", header)
            self.assertIn("enemy_tile_count, 24, true", header)
            self.assertIn("{ 0, 0, 24, 1, false, false, 16, 16 }", header)

    def test_rejects_8bpp_pack_allocation(self):
        assetc = load_assetc()
        asset = {
            "id": "rich_bg",
            "name": "rich_bg",
            "kind": "bg8",
            "png": "rich-bg.png",
        }
        allocation = {
            "allocations": {
                "bg_tiles": {"start": 2, "count": 2, "end": 4},
                "bg_palette_colors": {"start": 0, "count": 256, "end": 256},
            },
        }

        with self.assertRaises(SystemExit):
            assetc.pack_asset_with_allocations(asset, allocation)

    def test_optionally_merges_nearby_4bpp_tiles_to_the_regular_bg_budget(self):
        assetc = load_assetc()
        tile_columns = 33
        tile_rows = 32
        width = tile_columns * 8
        height = tile_rows * 8
        colors = [
            (
                ((group % 4) * 64) + ((tone % 4) * 16),
                ((group // 4) * 64) + ((tone // 4) * 16),
                0,
            )
            for group in range(16)
            for tone in range(16)
        ]
        digit_positions = {(1, 2): 0, (3, 2): 1, (5, 3): 2, (2, 4): 3, (4, 5): 4, (6, 6): 5}
        sentinels = {(0, 2): 1, (7, 2): 2, (0, 7): 3}
        indices = []
        for y in range(height):
            for x in range(width):
                tile_id = (y // 8) * tile_columns + (x // 8)
                position = (x % 8, y % 8)
                palette_base = (tile_id % 16) * 16
                if y % 8 < 2:
                    indices.append(palette_base + (y % 8) * 8 + (x % 8))
                elif position in sentinels:
                    indices.append(palette_base + sentinels[position])
                elif position in digit_positions:
                    indices.append(palette_base + ((tile_id >> (digit_positions[position] * 2)) & 0x3))
                else:
                    indices.append(palette_base)

        with self.assertRaises(SystemExit):
            assetc.build_4bpp_background(width, height, colors, indices)

        palette, tiles, tilemap, map_width, map_height, report = assetc.build_4bpp_background(
            width,
            height,
            colors,
            indices,
            optimize_tile_budget=1024,
            return_optimization=True,
        )

        self.assertEqual((map_width, map_height), (tile_columns, tile_rows))
        self.assertEqual(len(palette), 16 * 16)
        self.assertLessEqual(len(tiles), 1024)
        self.assertEqual(len(tilemap), tile_columns * tile_rows)
        self.assertEqual(report["tile_count_before"], 1056)
        self.assertEqual(report["tile_count_after"], len(tiles))
        self.assertGreaterEqual(report["merged_tile_count"], 32)
        self.assertEqual(report["tile_budget"], 1024)
        self.assertEqual({entry >> 12 for entry in tilemap}, set(range(16)))

    def test_cli_option_emits_a_tile_optimization_report(self):
        tile_columns = 33
        tile_rows = 32
        width = tile_columns * 8
        height = tile_rows * 8
        colors = [
            (
                ((group % 4) * 64) + ((tone % 4) * 16),
                ((group // 4) * 64) + ((tone // 4) * 16),
                0,
            )
            for group in range(16)
            for tone in range(16)
        ]
        digit_positions = {(1, 2): 0, (3, 2): 1, (5, 3): 2, (2, 4): 3, (4, 5): 4, (6, 6): 5}
        sentinels = {(0, 2): 1, (7, 2): 2, (0, 7): 3}
        pixels = []
        for y in range(height):
            for x in range(width):
                tile_id = (y // 8) * tile_columns + (x // 8)
                position = (x % 8, y % 8)
                palette_base = (tile_id % 16) * 16
                if y % 8 < 2:
                    color_index = palette_base + (y % 8) * 8 + (x % 8)
                elif position in sentinels:
                    color_index = palette_base + sentinels[position]
                elif position in digit_positions:
                    color_index = palette_base + ((tile_id >> (digit_positions[position] * 2)) & 0x3)
                else:
                    color_index = palette_base
                pixels.append((*colors[color_index], 255))

        with tempfile.TemporaryDirectory(prefix="assetc-tile-budget-cli-") as root:
            root_path = Path(root)
            source = root_path / "over-budget.png"
            header = root_path / "over-budget.hpp"
            report_path = root_path / "tile-report.json"
            write_rgba_png(source, width, height, pixels)

            subprocess.run([
                sys.executable,
                str(ASSETC_PATH),
                str(source),
                "-o",
                str(header),
                "--background-bpp",
                "4",
                "--optimize-background-tiles",
                "--background-tile-budget",
                "1024",
                "--background-tile-report",
                str(report_path),
            ], check=True, capture_output=True, text=True)

            report = json.loads(report_path.read_text(encoding="utf-8"))
            self.assertTrue(header.exists())
            self.assertEqual(report["tile_count_before"], 1056)
            self.assertLessEqual(report["tile_count_after"], 1024)
            self.assertGreaterEqual(report["total_mapping_error"], 0)

    def test_pack_honors_the_4bpp_tile_budget_in_resources_export_args_and_header(self):
        assetc = load_assetc()
        tile_columns = 33
        tile_rows = 32
        width = tile_columns * 8
        height = tile_rows * 8
        colors = [
            (
                ((group % 4) * 64) + ((tone % 4) * 16),
                ((group // 4) * 64) + ((tone // 4) * 16),
                0,
            )
            for group in range(16)
            for tone in range(16)
        ]
        digit_positions = {(1, 2): 0, (3, 2): 1, (5, 3): 2, (2, 4): 3, (4, 5): 4, (6, 6): 5}
        sentinels = {(0, 2): 1, (7, 2): 2, (0, 7): 3}
        pixels = []
        for y in range(height):
            for x in range(width):
                tile_id = (y // 8) * tile_columns + (x // 8)
                position = (x % 8, y % 8)
                palette_base = (tile_id % 16) * 16
                if y % 8 < 2:
                    color_index = palette_base + (y % 8) * 8 + (x % 8)
                elif position in sentinels:
                    color_index = palette_base + sentinels[position]
                elif position in digit_positions:
                    color_index = palette_base + ((tile_id >> (digit_positions[position] * 2)) & 0x3)
                else:
                    color_index = palette_base
                pixels.append((*colors[color_index], 255))

        with tempfile.TemporaryDirectory(prefix="assetc-pack-tile-budget-") as root:
            root_path = Path(root)
            source = root_path / "storm-sky.png"
            write_rgba_png(source, width, height, pixels)
            asset = {
                "id": "storm_sky",
                "name": "storm_sky",
                "kind": "bg",
                "png": source.name,
                "optimize_background_tiles": True,
                "background_tile_budget": 1024,
            }

            self.assertEqual(assetc.pack_png_resources(asset, root_path)["bg_tiles"], 1024)
            self.assertEqual(assetc.pack_assetc_args_for_asset(asset, "storm_sky", "storm_sky.hpp")[-3:], [
                "--optimize-background-tiles",
                "--background-tile-budget",
                "1024",
            ])
            header = assetc.emit_asset_header_from_pack_entry(asset, root_path, "storm_sky")
            self.assertIn("constexpr int storm_sky_tile_count = 1024;", header)

    def test_pack_honors_the_4bpp_palette_bank_budget_in_resources_export_args_and_header(self):
        assetc = load_assetc()
        tile_columns = 16
        width = tile_columns * 8
        colors = [
            (tone * 16, group * 16, 0)
            for group in range(tile_columns)
            for tone in range(16)
        ]
        pixels = [
            (*colors[(x // 8) * 16 + ((x + y) % 16)], 255)
            for y in range(8)
            for x in range(width)
        ]

        with tempfile.TemporaryDirectory(prefix="assetc-pack-palette-budget-") as root:
            root_path = Path(root)
            source = root_path / "storm-waves.png"
            write_rgba_png(source, width, 8, pixels)
            asset = {
                "id": "storm_waves",
                "name": "storm_waves",
                "kind": "bg",
                "png": source.name,
                "background_palette_banks": 8,
            }

            self.assertEqual(assetc.pack_png_resources(asset, root_path)["bg_palette_colors"], 128)
            self.assertIn("--background-palette-banks", assetc.pack_assetc_args_for_asset(asset, "storm_waves", "storm_waves.hpp"))
            header = assetc.emit_asset_header_from_pack_entry(asset, root_path, "storm_waves")
            self.assertIn("constexpr uint16_t storm_waves_palette[128]", header)

    def test_emits_an_inline_rgb555_palette_asset_without_a_png(self):
        assetc = load_assetc()
        asset = {
            "id": "palette_family_harbor_day_background",
            "name": "palette_family_harbor_day_background",
            "kind": "palette",
            "palette_slot": "background",
            "palette_values": [0, 31, 992, 31744],
        }

        resources = assetc.pack_asset_resources(asset, None)
        self.assertEqual(resources, {"bg_palette_colors": 16})
        resolved = assetc.pack_asset_with_allocations(asset, {
            "allocations": {"bg_palette_colors": {"start": 32, "count": 16}}
        })
        self.assertEqual(resolved["palette_bank"], 2)

        header = assetc.emit_asset_header_from_pack_entry(asset, Path("."), "palette_family_harbor_day_background", {
            "allocations": {"bg_palette_colors": {"start": 32, "count": 16}}
        })
        self.assertIn("constexpr uint16_t palette_family_harbor_day_background_palette[16]", header)
        self.assertIn("0x3e0", header)
        self.assertIn("0x7c00", header)
        self.assertIn(
            "gbs::PaletteAsset palette_family_harbor_day_background_palette_asset = { palette_family_harbor_day_background_palette, 16, 32 }",
            header,
        )

    def test_pack_exports_huffman_flags_and_inline_palette_asset(self):
        assetc = load_assetc()
        asset = {
            "id": "palette_family_harbor_day_background",
            "name": "palette_family_harbor_day_background",
            "kind": "palette",
            "palette_slot": "background",
            "palette_values": [0, 31, 992, 31744],
            "huffman_palette": True,
        }

        args = assetc.pack_assetc_args_for_asset(asset, "palette_family_harbor_day_background", "palette.hpp")
        self.assertIn("--huffman-palette", args)
        header = assetc.emit_asset_header_from_pack_entry(asset, Path("."), "palette_family_harbor_day_background")
        self.assertIn("#include \"gbs/compression.hpp\"", header)
        self.assertIn("gbs::HuffmanPaletteAsset", header)

    def test_compile_time_palette_assets_do_not_consume_hardware_palette_banks(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-compile-time-palette-pack-") as root:
            root_path = Path(root)
            background_path = root_path / "background.png"
            write_rgba_png(background_path, 8, 8, [
                (0, 0, 0, 255) if index % 2 == 0 else (0, 248, 0, 255)
                for index in range(64)
            ])
            palette_assets = [
                {
                    "id": f"palette_family_{index}",
                    "name": f"palette_family_{index}",
                    "kind": "palette",
                    "palette_slot": "background",
                    "palette_values": [0, 31, 992, 31744],
                }
                for index in range(16)
            ]
            report = assetc.emit_pack_report({
                "assets": [
                    *palette_assets,
                    {
                        "id": "background",
                        "name": "background",
                        "kind": "bg",
                        "png": background_path.name,
                    },
                ]
            }, root_path)

            self.assertTrue(report["ok"], report["errors"])
            self.assertEqual(report["usage"]["bg_palette_colors"]["used"], 16)
            self.assertEqual(report["allocations"][0]["resources"], {})
            self.assertEqual(report["allocations"][0]["allocations"], {})

    def test_remaps_background_and_obj_assets_from_inline_scene_palette_values(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-inline-scene-palette-") as root:
            root_path = Path(root)
            background_path = root_path / "harbor.png"
            sprite_path = root_path / "player.png"
            write_rgba_png(background_path, 8, 8, [
                (0, 0, 0, 255) if index % 2 == 0 else (0, 248, 0, 255)
                for index in range(64)
            ])
            write_rgba_png(sprite_path, 8, 8, [
                (0, 0, 0, 0) if index == 0 else (0, 0, 248, 255)
                for index in range(64)
            ])

            background = {
                "id": "harbor",
                "name": "harbor",
                "kind": "bg",
                "png": background_path.name,
                "background_palette_reference_colors": [[0, 0, 0], [248, 0, 0]],
            }
            sprite = {
                "id": "player",
                "name": "player",
                "kind": "obj",
                "png": sprite_path.name,
                "sprite_width": 8,
                "sprite_height": 8,
                "object_palette_values": [0, 992],
            }

            self.assertEqual(assetc.pack_png_resources(background, root_path)["bg_palette_colors"], 16)
            background_header = assetc.emit_asset_header_from_pack_entry(background, root_path, "harbor")
            self.assertIn("constexpr uint16_t harbor_palette[16] = { 0x0, 0x1f", background_header)

            self.assertEqual(assetc.pack_png_resources(sprite, root_path)["obj_palette_colors"], 16)
            sprite_header = assetc.emit_asset_header_from_pack_entry(sprite, root_path, "player")
            self.assertIn("0x3e0", sprite_header)

    def test_explicit_obj_palette_preserves_an_already_prepared_sprite_sheet(self):
        assetc = load_assetc()
        with tempfile.TemporaryDirectory(prefix="assetc-stable-obj-palette-") as root:
            root_path = Path(root)
            image_path = root_path / "fighter.png"
            colors = [(0, 0, 0, 0), (8, 16, 24, 255), (72, 104, 136, 255)]
            pixels = [colors[0] if index % 5 == 0 else colors[1 if index % 2 else 2] for index in range(64)]
            write_rgba_png(image_path, 8, 8, pixels)
            width, height, source_colors, indices, transparent_index = assetc.read_png(
                image_path,
                max_colors=16,
                include_transparency=True,
            )
            palette_values = [assetc.rgb15(color) for color in source_colors]
            prepared_colors, prepared_indices = assetc.prepare_obj_asset_pixels(
                source_colors,
                indices,
                transparent_index,
                {
                    "name": "fighter",
                    "sprite_bpp": 4,
                    "object_palette_values": palette_values,
                },
            )

            self.assertEqual((width, height), (8, 8))
            self.assertEqual(prepared_colors[:len(source_colors)], source_colors)
            self.assertTrue(all(color == (0, 0, 0) for color in prepared_colors[len(source_colors):]))
            self.assertEqual(prepared_indices, indices)

    def test_cli_prepares_a_background_with_the_requested_palette_bank_budget(self):
        tile_columns = 16
        width = tile_columns * 8
        colors = [
            (tone * 16, group * 16, 0)
            for group in range(tile_columns)
            for tone in range(16)
        ]
        pixels = [
            (*colors[(x // 8) * 16 + ((x + y) % 16)], 255)
            for y in range(8)
            for x in range(width)
        ]

        with tempfile.TemporaryDirectory(prefix="assetc-cli-palette-budget-") as root:
            root_path = Path(root)
            source = root_path / "storm-sky.png"
            prepared = root_path / "storm-sky-4bpp.png"
            report_path = root_path / "storm-sky-report.json"
            write_rgba_png(source, width, 8, pixels)

            subprocess.run([
                sys.executable,
                str(ASSETC_PATH),
                str(source),
                "--prepare-background-4bpp",
                "--background-palette-banks",
                "8",
                "--background-report",
                str(report_path),
                "-o",
                str(prepared),
            ], check=True, capture_output=True, text=True)

            report = json.loads(report_path.read_text(encoding="utf-8"))
            self.assertEqual(report["bank_count"], 8)


if __name__ == "__main__":
    unittest.main()
