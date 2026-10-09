#!/usr/bin/env python3
import importlib.util
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
ASSETC_PATH = REPO / "tools" / "assetc" / "assetc.py"
SPEC = importlib.util.spec_from_file_location("assetc_sprite_dedup", ASSETC_PATH)
ASSETC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ASSETC)


def asymmetric_frame():
    frame = [0] * (16 * 16)
    for y in range(3, 14):
        for x in range(2, 7):
            frame[y * 16 + x] = 1
    frame[5 * 16 + 7] = 2
    return frame


def mirror(frame):
    mirrored = []
    for y in range(16):
        row = frame[y * 16:(y + 1) * 16]
        mirrored.extend(reversed(row))
    return mirrored


def sheet_indices(frames):
    width = 16 * len(frames)
    result = []
    for y in range(16):
        for frame in frames:
            result.extend(frame[y * 16:(y + 1) * 16])
    return width, result


def test_sprite_plan_reuses_complete_exact_and_mirrored_obj_blocks():
    base = asymmetric_frame()
    width, indices = sheet_indices([base, base, mirror(base)])

    plan = ASSETC.build_sprite_tile_plan(width, 16, indices, 16, 16)

    assert len(plan["tiles"]) == 4
    assert plan["frame_parts"][0][0] == {"tile_offset": 0, "hflip": False}
    assert plan["frame_parts"][1][0] == {"tile_offset": 0, "hflip": False}
    assert plan["frame_parts"][2][0] == {"tile_offset": 0, "hflip": True}


def test_sprite_header_uses_deduplicated_offsets_without_breaking_contiguity():
    base = asymmetric_frame()
    width, indices = sheet_indices([base, base, mirror(base)])

    header = ASSETC.emit_sprite_header(
        "hero",
        width,
        16,
        [(0, 0, 0), (255, 255, 255), (255, 0, 0)],
        indices,
        0,
        0,
        16,
        16,
        8,
        False,
    )

    assert "constexpr int hero_tile_count = 4;" in header
    assert "{ 0, 0, 0, 0, false, false, 16, 16 }" in header
    assert "{ 0, 0, 0, 0, true, false, 16, 16 }" in header


def test_obj_transparency_moves_the_top_left_palette_entry_to_index_zero():
    colors = [(7, 24, 33), (134, 192, 108), (224, 248, 207), (101, 255, 0)]
    indices = [3, 2, 0, 3, 1]

    normalized_colors, normalized_indices = ASSETC.normalize_obj_transparency(
        colors,
        indices,
        "top_left",
    )

    assert normalized_colors == [(101, 255, 0), (134, 192, 108), (224, 248, 207), (7, 24, 33)]
    assert normalized_indices == [0, 2, 3, 0, 1]


def test_reserved_obj_transparency_keeps_opaque_pixels_visible():
    colors = [(12, 39, 74), (244, 234, 190)]
    indices = [0, 1, 0, 1]

    normalized_colors, normalized_indices = ASSETC.prepare_obj_asset_pixels(
        colors,
        indices,
        None,
        {"name": "opaque-title-part", "reserve_obj_transparent_color": True},
    )

    assert normalized_colors == [(0, 0, 0), (12, 39, 74), (244, 234, 190)]
    assert normalized_indices == [1, 2, 1, 2]

    existing_transparency_colors, existing_transparency_indices = ASSETC.prepare_obj_asset_pixels(
        colors,
        indices,
        0,
        {"name": "already-transparent", "reserve_obj_transparent_color": True},
    )
    assert existing_transparency_colors == colors
    assert existing_transparency_indices == indices


def test_imported_opaque_obj_reserves_transparency_without_losing_its_first_color():
    colors = [(248, 0, 0), (0, 248, 0)]
    normalized, indices = ASSETC.prepare_obj_asset_pixels(colors, [0, 1, 0], None, {"name": "own-art"})
    assert normalized == [(0, 0, 0), *colors]
    assert indices == [1, 2, 1]
    assert ASSETC.prepare_obj_asset_pixels(colors, [0, 1], None, {
        "name": "colorkey-art", "transparent_color_index": "top_left"
    }) == (colors, [0, 1])
    try:
        ASSETC.prepare_obj_asset_pixels([(i * 8, 0, 0) for i in range(16)], list(range(16)), None, {"name": "full-opaque"})
        assert False, "Sixteen opaque colors cannot fit fifteen visible OBJ colors"
    except SystemExit as error:
        assert "15 cores" in str(error)


def test_8bpp_sprite_packs_full_byte_tiles_and_even_character_offsets():
    frame = list(range(64))
    tile = ASSETC.pack_tile_8bpp(8, frame, 0, 0)
    mirrored = ASSETC.pack_tile_hflip_8bpp(8, frame, 0, 0)
    assert len(tile) == 64
    assert tile[:8] == list(range(8))
    assert mirrored[:8] == list(range(7, -1, -1))
    sheet_width = 16
    sheet = []
    for y in range(8):
        row = frame[y * 8:(y + 1) * 8]
        sheet.extend(row + row)

    header = ASSETC.emit_sprite_header(
        "hero8",
        sheet_width,
        8,
        [(0, 0, 0), (255, 255, 255)],
        sheet,
        4,
        0,
        8,
        8,
        8,
        False,
        False,
        8,
    )

    assert "constexpr int hero8_tile_count = 1;" in header
    assert "hero8_tiles[1][64]" in header
    assert "gbs::ColorDepth::Bpp8" in header
    assert "{ 0, 0, 4, 0, false, false, 8, 8, gbs::ColorDepth::Bpp8 }" in header
    assert "hero8_palette_asset = { hero8_palette, 256, 0 }" in header


def main():
    test_sprite_plan_reuses_complete_exact_and_mirrored_obj_blocks()
    test_sprite_header_uses_deduplicated_offsets_without_breaking_contiguity()
    test_obj_transparency_moves_the_top_left_palette_entry_to_index_zero()
    test_reserved_obj_transparency_keeps_opaque_pixels_visible()
    test_imported_opaque_obj_reserves_transparency_without_losing_its_first_color()
    test_8bpp_sprite_packs_full_byte_tiles_and_even_character_offsets()


if __name__ == "__main__":
    main()
